import { ImportService } from './import.service';
import { PrismaService } from '../../common/prisma.service';
import { TypeImport } from './dto/import.dto';

/**
 * LE BILAN D'OUVERTURE · la porte d'entrée d'un dossier qui existait avant le
 * logiciel.
 *
 * Deux choses le distinguent d'un import ordinaire, et aucune des deux n'était
 * faite :
 *
 *  1. C'EST UN À-NOUVEAU, PAS UN MOUVEMENT. La balance générale présente le
 *     solde d'ouverture et les mouvements de l'exercice en colonnes séparées,
 *     et la séparation se lit sur `Ecriture.estGenereeParCloture`. Une reprise
 *     enregistrée en mouvement ordinaire n'apparaissait donc NULLE PART en
 *     solde d'ouverture · elle gonflait l'activité de l'année, et le premier
 *     compte de résultat du dossier présentait la reprise comme un exercice.
 *
 *  2. UN BILAN NE PORTE AUCUN COMPTE DE GESTION. « Le bilan d'ouverture d'un
 *     exercice doit correspondre au bilan de clôture de l'exercice précédent »
 *     (AUDCIF art. 34 · SYCEBNL art. 16, 4°), et à cette clôture les classes
 *     6, 7 et 8 ont été soldées sur le compte 13. Reprendre une balance de
 *     CLÔTURE telle quelle faisait donc naître le nouvel exercice avec les
 *     charges et les produits de l'ancien.
 *
 * La reprise EN COURS d'exercice, elle, est un cas légitime et différent : on
 * récupère un dossier au 30 juin, les charges et produits déjà courus sont
 * réels. Le drapeau distingue les deux · il ne les confond pas.
 */

const COMPTES = [
  { id: 'c52', numero: '52110000', typeCompte: 'DETAIL' },
  { id: 'c40', numero: '40110000', typeCompte: 'DETAIL' },
  { id: 'c10', numero: '10110000', typeCompte: 'DETAIL' },
  { id: 'c62', numero: '62210000', typeCompte: 'DETAIL' },
  { id: 'c70', numero: '70100000', typeCompte: 'DETAIL' },
];

function service() {
  const creerEcriture = jest.fn().mockResolvedValue({ id: 'e1' });
  const tx = {
    compte: {
      createMany: jest.fn(),
      findMany: jest.fn().mockResolvedValue(COMPTES.map((c) => ({ id: c.id, numero: c.numero }))),
    },
    ecriture: { create: creerEcriture },
  };
  const prisma = {
    // Le référentiel du dossier · l'import le confronte désormais à l'intitulé
    // lu (voir referentiel-import.spec.ts). Aucun des libellés de ce fichier
    // n'est l'intitulé officiel du plan SYSCOHADA, la garde ne bouge donc pas.
    tenant: { findUnique: jest.fn().mockResolvedValue({ id: 't', longueurCompte: 8, referentiel: 'SYCEBNL' }) },
    exercice: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'ex',
        statut: 'OUVERT',
        dateDebut: new Date('2026-01-01'),
        dateFin: new Date('2026-12-31'),
      }),
    },
    journal: { findMany: jest.fn().mockResolvedValue([{ id: 'j-od', code: 'OD', type: 'GENERAL' }]) },
    compte: { findMany: jest.fn().mockResolvedValue(COMPTES) },
    $transaction: jest.fn().mockImplementation((f: (t: unknown) => unknown) => f(tx)),
  } as unknown as PrismaService;
  return { svc: new ImportService(prisma), creerEcriture };
}

/** Un CSV de balance, en base64 comme l'API le reçoit. */
function fichier(lignes: [string, string, string, string][]) {
  const texte = ['numero;intitule;debit;credit', ...lignes.map((l) => l.join(';'))].join('\n');
  return Buffer.from(texte, 'utf8').toString('base64');
}

const MAPPING = { numero: 'numero', intitule: 'intitule', debit: 'debit', credit: 'credit' };

const BILAN = [
  ['52110000', 'Banque', '800000', '0'],
  ['40110000', 'Fournisseurs', '0', '300000'],
  ['10110000', 'Dotation', '0', '500000'],
] as [string, string, string, string][];

async function importer(
  lignes: [string, string, string, string][],
  bilanDOuverture?: boolean,
) {
  const { svc, creerEcriture } = service();
  const rapport = await svc.executer('t', 'u', {
    type: TypeImport.BALANCE,
    nomFichier: 'balance.csv',
    contenuBase64: fichier(lignes),
    mapping: MAPPING,
    ...(bilanDOuverture === undefined ? {} : { bilanDOuverture }),
  });
  return { rapport, ecriture: creerEcriture.mock.calls[0]?.[0]?.data };
}

describe('Import d’un bilan d’ouverture', () => {
  it('produit une écriture d’À-NOUVEAU, pas un mouvement de l’exercice', async () => {
    const { rapport, ecriture } = await importer(BILAN);
    expect(rapport.anomalies).toEqual([]);
    expect(rapport.ecrituresCreees).toBe(1);
    // Le drapeau que lit EcritureService.balance pour remplir la colonne
    // « solde d'ouverture ». Sans lui, la reprise n'apparaît nulle part.
    expect(ecriture.estGenereeParCloture).toBe(true);
    expect(ecriture.libelle).toMatch(/Bilan d’ouverture|Bilan d'ouverture/);
  });

  it('la date par défaut est l’ouverture de l’exercice', async () => {
    const { ecriture } = await importer(BILAN);
    expect((ecriture.date as Date).toISOString().slice(0, 10)).toBe('2026-01-01');
  });

  it('refuse les comptes de gestion, soldés sur le résultat à la clôture précédente', async () => {
    const { rapport, ecriture } = await importer([
      ...BILAN,
      ['62210000', 'Loyers', '200000', '0'],
      ['70100000', 'Ventes', '0', '200000'],
    ]);
    const refuses = rapport.anomalies.map((a) => a.message).join(' | ');
    expect(refuses).toMatch(/62210000/);
    expect(refuses).toMatch(/70100000/);
    expect(refuses).toMatch(/compte de gestion/i);
    // Le bilan lui-même passe, et reste équilibré : les deux lignes écartées
    // se compensaient, l'import n'est donc pas arrêté pour déséquilibre.
    expect(ecriture.lignes.create).toHaveLength(3);
  });

  it('accepte les comptes de gestion pour une reprise EN COURS d’exercice', async () => {
    // On récupère un dossier au 30 juin : les charges et produits déjà courus
    // sont réels, et l'écriture est un mouvement ordinaire.
    const { rapport, ecriture } = await importer(
      [...BILAN, ['62210000', 'Loyers', '200000', '0'], ['70100000', 'Ventes', '0', '200000']],
      false,
    );
    expect(rapport.anomalies).toEqual([]);
    expect(ecriture.lignes.create).toHaveLength(5);
    expect(ecriture.estGenereeParCloture).toBe(false);
    expect(ecriture.libelle).toMatch(/Reprise de balance/);
  });

  it('un bilan déséquilibré n’écrit rien, et dit de combien', async () => {
    const { rapport } = await importer([
      ['52110000', 'Banque', '800000', '0'],
      ['10110000', 'Dotation', '0', '500000'],
    ]);
    expect(rapport.ecrituresCreees).toBe(0);
    expect(rapport.anomalies.map((a) => a.message).join(' ')).toMatch(/déséquilibrée de 300000\.00/);
  });
});
