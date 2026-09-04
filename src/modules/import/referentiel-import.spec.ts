import { Referentiel } from '@prisma/client';
import { ImportService, intituleDUnAutreReferentiel } from './import.service';
import { PrismaService } from '../../common/prisma.service';
import { TypeImport } from './dto/import.dto';
import { PLAN_COMPTES_SYCEBNL } from '../comptes/compte-seed';
import { PLAN_COMPTES_SYSCOHADA } from '../comptes/compte-seed-syscohada';

/**
 * L'IMPORT REGARDE LE RÉFÉRENTIEL DU DOSSIER · CL-103.
 *
 * Ce que l'import ne faisait pas : rien, dans `importerPlanComptes()` ni dans
 * `importerBalance()`, ne confrontait la ligne lue au plan normalisé du
 * dossier. Un fichier venu de l'autre référentiel entrait tel quel, et
 * l'écart ne se voyait NULLE PART ensuite :
 *
 *  · le compte absent était CRÉÉ avec l'intitulé du fichier ;
 *  · le compte déjà présent était compté « reconnu », son intitulé abandonné
 *    sans un mot, et le montant porté sur un compte qui dit autre chose ;
 *  · en aval, tout rattache par le NUMÉRO · `posteDuCompte()` prend le plus
 *    long préfixe, et le contrôle COMPTE_HORS_NOMENCLATURE ne compare que le
 *    premier chiffre à la classe. Aucun des deux ne pouvait le voir.
 *
 * Pourquoi c'est une faute et pas une coquette : « le recours, pour la tenue
 * de la comptabilité de l'entité, à un plan de comptes normalisé dont la liste
 * figure dans le Système comptable OHADA » (AUDCIF art. 17, 7°) · « […] dont
 * la liste figure dans le Système comptable des entités à but non lucratif »
 * (SYCEBNL art. 16, 1°), et « les opérations sont enregistrées dans les
 * comptes dont les intitulés correspondent à leur nature » (AUDCIF art. 18,
 * dernier alinéa).
 *
 * Le cas d'école, lu dans les deux textes : le compte 701 est « Ventes de
 * marchandises » à l'AUDCIF (Titre VII ch. 3, section 7, compte 70) et
 * « Cotisations des adhérents » au SYCEBNL (Partie 2 ch. 3, section 7, compte
 * 70). Même famille de numéro, deux natures qui n'ont rien à voir.
 *
 * Ce balayage ne récite pas la règle : il la CONFRONTE aux deux semis, numéro
 * par numéro. Un intitulé qui changerait demain dans l'un des deux plans reste
 * couvert sans qu'on ait à toucher au test.
 */

const SYCEBNL = new Map(PLAN_COMPTES_SYCEBNL.map((c) => [c.numero, c.intitule]));
const SYSCOHADA = new Map(PLAN_COMPTES_SYSCOHADA.map((c) => [c.numero, c.intitule]));

/**
 * « Les deux plans disent-ils la MÊME CHOSE de ce numéro ? »
 *
 * Les deux transcriptions n'écrivent pas la ponctuation pareil · « G.I.E. »
 * contre « GIE », « Fournisseurs · sous-traitants » contre « Fournisseurs
 * sous-traitants », apostrophe droite contre apostrophe typographique. Sur les
 * 659 numéros communs, 477 diffèrent à la lettre mais 59 de ces écarts ne sont
 * que de forme : ils ne transposent RIEN et n'ont rien à signaler. Restent 418
 * numéros qui portent vraiment deux natures différentes.
 */
function memesMots(a: string, b: string): boolean {
  const mots = (t: string) =>
    t
      .replace(/\[\d+\]/g, ' ')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');
  return mots(a) === mots(b);
}

/** Numéros présents dans les DEUX plans, et ce que chacun en dit. */
const COMMUNS = [...SYCEBNL.entries()]
  .filter(([numero]) => SYSCOHADA.has(numero))
  .map(([numero, sycebnl]) => ({ numero, sycebnl, syscohada: SYSCOHADA.get(numero)! }));

describe('import · confrontation de l’intitulé lu au plan du référentiel', () => {
  it('tout numéro que les deux plans nomment DIFFÉREMMENT est reconnu, dans les deux sens', () => {
    const divergents = COMMUNS.filter((c) => !memesMots(c.sycebnl, c.syscohada));
    // Le garde-fou du garde-fou : si ce chiffre tombait à zéro, le balayage ne
    // testerait plus rien tout en restant vert.
    expect(divergents.length).toBeGreaterThan(400);

    const manques = divergents.filter(
      (c) =>
        // fichier SYSCOHADA lu dans un dossier SYCEBNL
        !intituleDUnAutreReferentiel(c.numero, c.syscohada, Referentiel.SYCEBNL) ||
        // et l'inverse
        !intituleDUnAutreReferentiel(c.numero, c.sycebnl, Referentiel.SYSCOHADA),
    );
    expect(manques.map((c) => `${c.numero} · ${c.sycebnl} / ${c.syscohada}`)).toEqual([]);
  });

  it('l’intitulé officiel du dossier lui-même n’est JAMAIS refusé', () => {
    // Un import régulier ne doit pas produire une seule anomalie · c'est la
    // moitié de la garde, et la plus facile à casser en la durcissant.
    const faussesAlertes = [
      ...[...SYCEBNL.entries()].filter(([n, i]) => intituleDUnAutreReferentiel(n, i, Referentiel.SYCEBNL)),
      ...[...SYSCOHADA.entries()].filter(([n, i]) => intituleDUnAutreReferentiel(n, i, Referentiel.SYSCOHADA)),
    ];
    expect(faussesAlertes.map(([n, i]) => `${n} · ${i}`)).toEqual([]);
  });

  it('un numéro que les deux plans nomment PAREIL ne déclenche rien', () => {
    // 241 numéros sur 659 · « 40110000 Fournisseurs » par exemple. Rien n'y
    // est transposé, refuser la ligne serait un faux positif. Les 59 écarts
    // purement typographiques (« 40130000 Fournisseurs · sous-traitants » au
    // SYCEBNL, « Fournisseurs sous-traitants » au SYSCOHADA) sont dans ce lot,
    // et c'est bien leur place : le mot est le même.
    const identiques = COMMUNS.filter((c) => memesMots(c.sycebnl, c.syscohada));
    expect(identiques.length).toBeGreaterThan(200);
    const alertes = identiques.filter((c) => intituleDUnAutreReferentiel(c.numero, c.syscohada, Referentiel.SYCEBNL));
    expect(alertes.map((c) => c.numero)).toEqual([]);
    expect(intituleDUnAutreReferentiel('40130000', 'Fournisseurs sous-traitants', Referentiel.SYCEBNL)).toBeNull();
  });

  it('un intitulé librement rédigé par le cabinet passe · AUDCIF art. 18, alinéa 3', () => {
    // « Lorsque les comptes prévus par le Système comptable OHADA ne suffisent
    // pas, l'entité peut ouvrir toutes subdivisions nécessaires. » Une
    // subdivision maison ne prouve rien sur le référentiel du fichier.
    expect(intituleDUnAutreReferentiel('10300000', 'Droits d’entrée 2026', Referentiel.SYCEBNL)).toBeNull();
    expect(intituleDUnAutreReferentiel('41100001', 'Adhérent Mukendi', Referentiel.SYCEBNL)).toBeNull();
    expect(intituleDUnAutreReferentiel('10300000', '', Referentiel.SYCEBNL)).toBeNull();
  });

  it('la comparaison ignore accents, casse et renvois de bas de page du plan SYSCOHADA', () => {
    // Le plan SYSCOHADA porte les renvois du texte officiel (« Dans la Région
    // [7] ») ; aucun logiciel ne les exporte.
    expect(intituleDUnAutreReferentiel('70110000', 'dans la region', Referentiel.SYCEBNL)).not.toBeNull();
    expect(intituleDUnAutreReferentiel('10300000', 'CAPITAL PERSONNEL', Referentiel.SYCEBNL)).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Bout en bout · les deux chemins d'écriture de l'import.

const COMPTES = [
  { id: 'c52', numero: '52110000', typeCompte: 'DETAIL' },
  { id: 'c40', numero: '40110000', typeCompte: 'DETAIL' },
  { id: 'c10', numero: '10110000', typeCompte: 'DETAIL' },
  // Les deux comptes EXISTENT déjà dans le dossier · c'est le cas muet : sans
  // garde, la ligne est « reconnue », son intitulé jeté, son montant porté.
  { id: 'c103', numero: '10300000', typeCompte: 'DETAIL' },
  { id: 'c131', numero: '13100000', typeCompte: 'DETAIL' },
];

function service(referentiel: Referentiel = Referentiel.SYCEBNL) {
  const creerEcriture = jest.fn().mockResolvedValue({ id: 'e1' });
  const creerComptes = jest.fn();
  const tx = {
    compte: {
      createMany: creerComptes,
      findMany: jest.fn().mockResolvedValue(COMPTES.map((c) => ({ id: c.id, numero: c.numero }))),
    },
    ecriture: { create: creerEcriture },
  };
  const prisma = {
    tenant: { findUnique: jest.fn().mockResolvedValue({ id: 't', longueurCompte: 8, referentiel }) },
    exercice: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'ex',
        statut: 'OUVERT',
        dateDebut: new Date('2026-01-01'),
        dateFin: new Date('2026-12-31'),
      }),
    },
    journal: { findMany: jest.fn().mockResolvedValue([{ id: 'j-od', code: 'OD', type: 'GENERAL' }]) },
    compte: { findMany: jest.fn().mockResolvedValue(COMPTES), createMany: creerComptes },
    $transaction: jest.fn().mockImplementation((f: (t: unknown) => unknown) => f(tx)),
  } as unknown as PrismaService;
  return { svc: new ImportService(prisma), creerEcriture, creerComptes };
}

function csv(entete: string, lignes: string[][]) {
  return Buffer.from([entete, ...lignes.map((l) => l.join(';'))].join('\n'), 'utf8').toString('base64');
}

describe('import d’un PLAN DE COMPTES venu de l’autre référentiel', () => {
  it('refuse la ligne, ne crée pas le compte, et dit d’où vient l’intitulé', async () => {
    const { svc, creerComptes } = service(Referentiel.SYCEBNL);
    const rapport = await svc.executer('t', 'u', {
      type: TypeImport.PLAN_COMPTES,
      nomFichier: 'plan.csv',
      contenuBase64: csv('numero;intitule', [
        // Absent du plan du dossier · sans garde, il aurait été CRÉÉ sous
        // l'intitulé officiel SYSCOHADA du même numéro.
        ['52200000', 'Banques autres États région'],
        // Subdivision maison, qui ne dit rien du référentiel · elle passe.
        ['41100001', 'Adhérent Mukendi'],
      ]),
      mapping: { numero: 'numero', intitule: 'intitule' },
    });
    const refus = rapport.anomalies.map((a) => a.message).join(' | ');
    expect(refus).toMatch(/52200000/);
    expect(refus).toMatch(/SYSCOHADA/);
    expect(refus).toMatch(/AUDCIF art\. 17, 7°/);
    // La seconde ligne, elle, passe · une garde qui refuserait tout ne
    // servirait à rien.
    expect(rapport.comptesCrees).toBe(1);
    expect(creerComptes).toHaveBeenCalledWith(
      expect.objectContaining({ data: [expect.objectContaining({ numero: '41100001' })] }),
    );
  });

  it('refuse AUSSI la ligne dont le compte existe déjà · le cas muet', async () => {
    // Sans garde, cette ligne partait en `reconnus++` : aucune anomalie, aucun
    // compte créé, et rien pour dire au cabinet que son fichier est celui d'un
    // autre référentiel.
    const { svc } = service(Referentiel.SYCEBNL);
    const rapport = await svc.executer('t', 'u', {
      type: TypeImport.PLAN_COMPTES,
      nomFichier: 'plan.csv',
      contenuBase64: csv('numero;intitule', [['10300000', 'Capital personnel']]),
      mapping: { numero: 'numero', intitule: 'intitule' },
    });
    expect(rapport.comptesReconnus).toBe(0);
    expect(rapport.anomalies).toHaveLength(1);
    expect(rapport.anomalies[0].message).toMatch(/Droit d’entrée|Droit d'entrée/);
  });

  it('joue dans l’autre sens · un fichier SYCEBNL dans un dossier SYSCOHADA', () => {
    // Le cloisonnement n'a pas de sens privilégié (CLAUDE.md § 6).
    const ecart = intituleDUnAutreReferentiel('13100000', 'Excédent de l’exercice', Referentiel.SYSCOHADA);
    expect(ecart?.autre).toBe(Referentiel.SYCEBNL);
    expect(ecart?.intituleDuDossier).toBe('Résultat net : bénéfice');
  });
});

describe('import d’une BALANCE venue de l’autre référentiel', () => {
  /**
   * Le bilan d'ouverture refuse déjà les classes 6, 7 et 8 (comptes de
   * gestion). La transposition de référentiel, elle, passe par les classes de
   * BILAN, que cette garde-là laisse entrer : les deux lignes suspectes
   * ci-dessous sont des classes 1, et elles se compensent, de sorte que le
   * bilan reste équilibré · l'import n'est donc pas arrêté pour déséquilibre
   * et l'on voit bien que ce sont ces deux lignes-là, et elles seules, qui
   * sont écartées.
   */
  it('écarte les lignes transposées et laisse passer le reste du bilan', async () => {
    const { svc, creerEcriture } = service(Referentiel.SYCEBNL);
    const rapport = await svc.executer('t', 'u', {
      type: TypeImport.BALANCE,
      nomFichier: 'balance.csv',
      contenuBase64: csv('numero;intitule;debit;credit', [
        ['52110000', 'Banque', '800000', '0'],
        ['40110000', 'Fournisseurs', '0', '300000'], // même intitulé dans les deux plans
        ['10110000', 'Dotation', '0', '500000'],
        ['10300000', 'Capital personnel', '300000', '0'],
        ['13100000', 'Résultat net : bénéfice', '0', '300000'],
      ]),
      mapping: { numero: 'numero', intitule: 'intitule', debit: 'debit', credit: 'credit' },
    });
    const refus = rapport.anomalies.map((a) => a.message).join(' | ');
    expect(rapport.anomalies).toHaveLength(2);
    expect(refus).toMatch(/10300000/);
    expect(refus).toMatch(/13100000/);
    expect(refus).toMatch(/SYCEBNL art\. 16, 1°/);
    const ecriture = creerEcriture.mock.calls[0]?.[0]?.data;
    expect(ecriture.lignes.create).toHaveLength(3);
    expect(rapport.ecrituresCreees).toBe(1);
  });

  it('une balance sans colonne Intitulé n’est pas gênée · il n’y a rien à confronter', async () => {
    const { svc, creerEcriture } = service(Referentiel.SYCEBNL);
    const rapport = await svc.executer('t', 'u', {
      type: TypeImport.BALANCE,
      nomFichier: 'balance.csv',
      contenuBase64: csv('numero;debit;credit', [
        ['52110000', '800000', '0'],
        ['10110000', '0', '800000'],
      ]),
      mapping: { numero: 'numero', debit: 'debit', credit: 'credit' },
    });
    expect(rapport.anomalies).toEqual([]);
    expect(creerEcriture.mock.calls[0][0].data.lignes.create).toHaveLength(2);
  });
});
