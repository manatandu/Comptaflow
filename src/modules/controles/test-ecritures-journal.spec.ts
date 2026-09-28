import { Writable } from 'stream';
import * as ExcelJS from 'exceljs';
import { RoleUtilisateur, StatutEcriture } from '@prisma/client';
import { TestEcrituresJournalService } from './test-ecritures-journal.service';
import { CRITERES_ISA_240, SEUILS_ISA_240 } from './test-ecritures-journal';
import { ExportService } from '../exports/export.service';
import { PrismaService } from '../../common/prisma.service';

/**
 * LE REGARD DU RÉVISEUR · ce qu'un auditeur demande le premier jour, et ce
 * qu'OmegaX n'avait pas à lui donner.
 *
 * Deux manques, tous deux de RESTITUTION, aucun de collecte :
 *
 *  1 · LA PISTE. `createdBy`, `createdAt`, `valideeBy`, `valideeAt` étaient
 *      capturés depuis toujours et n'apparaissaient nulle part · ni à
 *      l'écran, ni dans le journal exporté. L'AUDCIF art. 22, 1° demande les
 *      deux moitiés de la phrase : les données « comprennent, lors de leur
 *      entrée, l'indication de l'ORIGINE, du contenu et de l'imputation, et
 *      puissent être RESTITUÉES sur papier ou sous une forme directement
 *      intelligible ». L'article n'est pas exclu par l'art. 3 du SYCEBNL.
 *  2 · LA SÉLECTION de l'ISA 240 § 33 a), que l'auditeur doit conduire
 *      « indépendamment de son évaluation des risques de contournement des
 *      contrôles par la direction ».
 */

type Faux = Record<string, unknown>;

const EXERCICE = {
  id: 'ex',
  dateDebut: new Date('2026-01-01'),
  dateFin: new Date('2026-12-31'),
  dateArreteComptes: new Date('2027-04-20'),
};

const COMPTABLE = { id: 'u-compta', email: 'jeanne@cabinet.cd', role: RoleUtilisateur.COMPTABLE };
const ADMIN = { id: 'u-admin', email: 'patron@cabinet.cd', role: RoleUtilisateur.ADMIN_CABINET };

const ligne = (numero: string, debit: number, credit = 0) => ({
  debit,
  credit,
  compte: { numero, intitule: `Compte ${numero}` },
});

/** Une écriture ordinaire · elle ne doit relever d'aucun critère. */
const ORDINAIRE = {
  id: 'e-ordinaire',
  date: new Date('2026-05-14'),
  createdAt: new Date('2026-05-15T09:12:00Z'),
  createdBy: COMPTABLE.id,
  valideeAt: new Date('2026-05-16T10:00:00Z'),
  valideeBy: COMPTABLE.id,
  statut: StatutEcriture.VALIDEE,
  numeroPiece: 12,
  reference: 'FA-2026-0087',
  libelle: 'Achat de fournitures de bureau, facture Kin Papeterie',
  motifCorrection: null,
  journal: { code: 'ACH' },
  lignes: [ligne('60100000', 745_320), ligne('40100000', 0, 745_320)],
};

function service(ecritures: Faux[]) {
  // Le décompte par compte est un AGRÉGAT (audit final F185) · la doublure le
  // calcule sur les lignes de la même liste, le numéro servant d'identifiant.
  const lignesDe = (liste: Faux[]) => liste.flatMap((e) => (e.lignes as Array<{ compte: { numero: string } }>) ?? []);
  const numeros = [...new Set(lignesDe(ecritures).map((l) => l.compte.numero))];
  const prisma = {
    exercice: { findFirst: jest.fn().mockResolvedValue(EXERCICE) },
    ecriture: { findMany: jest.fn().mockResolvedValue(ecritures) },
    user: { findMany: jest.fn().mockResolvedValue([COMPTABLE, ADMIN]) },
    compte: { findMany: jest.fn().mockResolvedValue(numeros.map((n) => ({ id: n, numero: n }))) },
    ligneEcriture: {
      // LA DOUBLURE HONORE LE FILTRE DES ÉCRITURES DE CLÔTURE · elle ne les
      // écarte du décompte que si la requête le demande.
      groupBy: jest.fn(async ({ where }: { where: { ecriture: { estGenereeParCloture?: boolean } } }) => {
        const retenues = ecritures.filter(
          (e) => !(e.estGenereeParCloture === true && where.ecriture.estGenereeParCloture === false),
        );
        const lignes = lignesDe(retenues);
        return numeros
          .map((n) => ({ compteId: n, _count: { _all: lignes.filter((l) => l.compte.numero === n).length } }))
          .filter((g) => g._count._all > 0);
      }),
    },
  } as Faux;
  return new TestEcrituresJournalService(prisma as unknown as PrismaService);
}

const criteresDe = async (e: Faux) => {
  // L'écriture ordinaire accompagne toujours la testée : sans elle, TOUS les
  // comptes du dossier seraient « rarement utilisés » et le critère
  // s'allumerait partout.
  const remplissage = Array.from({ length: 5 }, (_, i) => ({ ...ORDINAIRE, id: `r${i}` }));
  const r = await service([...remplissage, e]).selection('t1', 'ex');
  return r.selection.find((s) => s.id === (e as { id: string }).id)?.criteres ?? [];
};

describe('la sélection ISA 240 · § 33 a)', () => {
  it('laisse tranquille une écriture ordinaire', async () => {
    // Une sélection qui retient tout le journal n'aide personne.
    expect(await criteresDe({ ...ORDINAIRE, id: 'temoin' })).toEqual([]);
  });

  it('retient les écritures de FIN DE PÉRIODE · l’exigence du § 33 a) ii)', async () => {
    const c = await criteresDe({ ...ORDINAIRE, id: 'e1', date: new Date('2026-12-30') });
    expect(c).toContain('FIN_DE_PERIODE');
  });

  it('retient une écriture SAISIE APRÈS la clôture, et dit de combien', async () => {
    // C'est l'axe central : la date de saisie n'est pas la date comptable.
    // Une pièce datée du 31 décembre mais enregistrée le 15 mars est
    // exactement ce que le § A44 c) désigne, et l'écart est ce que l'AUDCIF
    // art. 22, 4° appelle la date de valeur, « mentionnée distinctement ».
    const e = { ...ORDINAIRE, id: 'e2', date: new Date('2026-12-31'), createdAt: new Date('2027-03-15T08:00:00Z') };
    expect(await criteresDe(e)).toContain('SAISIE_APRES_CLOTURE');
    const r = await service([e]).selection('t1', 'ex');
    expect(r.selection[0].joursEntreDateEtSaisie).toBe(74);
  });

  it('retient « peu ou pas de justification » · libellé court ou pièce absente', async () => {
    expect(await criteresDe({ ...ORDINAIRE, id: 'e3', libelle: 'OD' })).toContain('SANS_JUSTIFICATION');
    expect(await criteresDe({ ...ORDINAIRE, id: 'e4', reference: null })).toContain('SANS_JUSTIFICATION');
  });

  it('retient une écriture passée par un ADMINISTRATEUR du cabinet', async () => {
    // § A44 b) · « passées par des personnes qui ne sont pas censées
    // enregistrer d'écritures ». L'administrateur peut techniquement saisir.
    const c = await criteresDe({ ...ORDINAIRE, id: 'e5', createdBy: ADMIN.id });
    expect(c).toContain('AUTEUR_INATTENDU');
  });

  it('retient une écriture dont l’auteur a été RETIRÉ du dossier', async () => {
    // Un utilisateur désactivé puis retiré laisse des écritures dont plus
    // personne ne répond · la case reste nommée plutôt que vide.
    const r = await service([{ ...ORDINAIRE, id: 'e6', createdBy: 'fantome' }]).selection('t1', 'ex');
    expect(r.selection[0].criteres).toContain('AUTEUR_INATTENDU');
    expect(r.selection[0].saisiePar).toBe('utilisateur retiré du dossier');
  });

  it('retient les CHIFFRES RONDS, et seulement au-dessus du plancher', async () => {
    const rond = { ...ORDINAIRE, id: 'e7', lignes: [ligne('60100000', 5_000_000), ligne('40100000', 0, 5_000_000)] };
    expect(await criteresDe(rond)).toContain('MONTANT_ROND');
    // 745 320 n'est pas rond, et 900 000 le serait mais reste sous le
    // plancher · une cotisation de cent mille n'apprend rien à personne.
    const petit = { ...ORDINAIRE, id: 'e8', lignes: [ligne('60100000', 900_000), ligne('40100000', 0, 900_000)] };
    expect(await criteresDe(petit)).not.toContain('MONTANT_ROND');
  });

  it('retient les COMPTES RAREMENT UTILISÉS, et les nomme', async () => {
    const r = await service([
      ...Array.from({ length: 5 }, (_, i) => ({ ...ORDINAIRE, id: `r${i}` })),
      { ...ORDINAIRE, id: 'e9', lignes: [ligne('27500000', 3_400_000), ligne('40100000', 0, 3_400_000)] },
    ]).selection('t1', 'ex');
    const e = r.selection.find((s) => s.id === 'e9')!;
    expect(e.criteres).toContain('COMPTE_RARE');
    expect(e.comptesRares).toEqual(['27500000']);
  });

  it('un compte de charge d’un exercice CLOS reste rare · l’écriture de clôture n’est pas un usage', async () => {
    // Deux usages du 65800000 dans l'année, puis l'écriture générée qui le
    // solde sur le 13 à la clôture. Comptée, elle portait le compte à trois
    // mouvements, au-delà du seuil, et le critère se taisait sur tout
    // exercice clos.
    const usage = (id: string) => ({
      ...ORDINAIRE, id, lignes: [ligne('65800000', 3_400_000), ligne('40100000', 0, 3_400_000)],
    });
    const cloture = {
      ...ORDINAIRE, id: 'cl', estGenereeParCloture: true,
      lignes: [ligne('65800000', 0, 6_800_000), ligne('13100000', 6_800_000)],
    };
    const r = await service([
      ...Array.from({ length: 5 }, (_, i) => ({ ...ORDINAIRE, id: `r${i}` })),
      usage('u1'),
      usage('u2'),
      cloture,
    ]).selection('t1', 'ex');
    expect(r.selection.find((s) => s.id === 'u1')?.comptesRares).toEqual(['65800000']);
  });

  it('compte les écritures retenues par critère · une sélection se justifie', async () => {
    const r = await service([...Array.from({ length: 5 }, (_, i) => ({ ...ORDINAIRE, id: `r${i}` }))]).selection(
      't1',
      'ex',
    );
    expect(r.totalEcritures).toBe(5);
    expect(r.parCritere).toHaveLength(CRITERES_ISA_240.length);
    expect(r.parCritere.every((p) => p.nombre === 0)).toBe(true);
  });

  it('cite le texte de la norme, jamais une paraphrase', () => {
    // Un critère qui reformule la norme cesse d'être opposable devant un
    // réviseur · c'est la même règle que pour le dossier de révision.
    const exigence = CRITERES_ISA_240.find((c) => c.cle === 'FIN_DE_PERIODE')!;
    expect(exigence.source).toContain('exigence');
    expect(exigence.citation).toBe(
      "sélectionner des écritures de journal et d'autres ajustements effectués à la fin de la période",
    );
    // Et chaque critère dit à quoi il tient exactement.
    for (const c of CRITERES_ISA_240) expect(c.mesure.length).toBeGreaterThan(20);
  });

  it('les seuils sont déclarés, pas enfouis dans une requête', () => {
    // La norme n'en fixe aucun · ce sont des conventions de lecture, et un
    // auditeur doit pouvoir dire à quoi tient sa sélection.
    expect(SEUILS_ISA_240.joursFinDePeriode).toBe(7);
    expect(SEUILS_ISA_240.mouvementsCompteRare).toBe(2);
  });
});

describe('la piste d’audit, restituée · AUDCIF art. 22, 1°', () => {
  function exportService(ecritures: Faux[]) {
    const prisma = {
      ligneEcriture: { count: jest.fn().mockResolvedValue(ecritures.length * 2) },
      user: { findMany: jest.fn().mockResolvedValue([COMPTABLE, ADMIN]) },
      tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ nom: 'Dossier', nif: 'A1234', deviseComptes: 'CDF' }) },
      exercice: { findFirst: jest.fn().mockResolvedValue(EXERCICE), findUnique: jest.fn().mockResolvedValue(EXERCICE) },
      // L'export lit désormais les écritures PAR LOTS, curseur sur
      // l'identifiant · la doublure rend le lot puis un lot vide, sans quoi la
      // boucle ne s'arrêterait jamais. Une doublure qui répondrait toujours la
      // même chose bouclerait à l'infini, ce qui est déjà un enseignement.
      ecriture: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce(ecritures)
          .mockResolvedValue([]),
      },
    } as Faux;
    const ecritureService = {} as Faux;
    return new ExportService(
      prisma as unknown as PrismaService,
      ecritureService as never,
      {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never,
    );
  }

  it('le journal exporté porte le statut, la date de saisie et son auteur', async () => {
    // Le manque était de RESTITUTION, pas de collecte · le champ existait, le
    // classeur remis ne le montrait pas. Un auditeur ne peut alors ni voir
    // qui a passé une écriture, ni distinguer une pièce enregistrée le jour
    // même d'une pièce enregistrée trois mois plus tard.
    // L'export part EN FLUX · on le recueille dans un tampon mémoire, ce qui
    // vérifie au passage que l'archive écrite au fil de l'eau est bien close
    // et relisible. Un classeur en flux jamais terminé n'est pas un classeur
    // tronqué, c'est un fichier qu'ExcelJS refuse d'ouvrir.
    const morceaux: Buffer[] = [];
    const sortie = new Writable({
      write(m, _e, cb) {
        morceaux.push(Buffer.from(m));
        cb();
      },
    });
    await exportService([
      { ...ORDINAIRE, lignes: ORDINAIRE.lignes, correction: null, corrigeEcriture: null },
    ]).journalExcelEnFlux('t1', { exerciceId: 'ex' }, () => sortie);
    const classeur = new ExcelJS.Workbook();
    await classeur.xlsx.load(Buffer.concat(morceaux) as never);
    const feuille = classeur.worksheets[0];

    const entetes: string[] = [];
    feuille.getRow(4).eachCell((c) => entetes.push(String(c.value ?? '')));
    for (const attendu of ['Statut', 'Saisie le', 'Saisie par', 'Validée le', 'Validée par']) {
      expect(entetes).toContain(attendu);
    }

    // Et l'auteur est un COURRIEL, pas l'identifiant technique · un auditeur
    // ne lit pas un uuid.
    const tout = JSON.stringify(feuille.getRow(5).values);
    expect(tout).toContain(COMPTABLE.email);
    expect(tout).not.toContain(COMPTABLE.id);
  });
});

describe('la sélection ISA 240 se lit par tranches et se dit tronquée (audit final F185)', () => {
  it('au-delà du plafond, la sélection garde sa tête et compte tout le reste', async () => {
    const sansPiece = Array.from({ length: 7 }, (_, i) => ({ ...ORDINAIRE, id: `s${i}`, reference: null }));
    const remplissage = Array.from({ length: 5 }, (_, i) => ({ ...ORDINAIRE, id: `r${i}` }));
    const r = await service([...remplissage, ...sansPiece]).selection('t1', 'ex', 3);
    expect(r.selection).toHaveLength(3);
    expect(r.totalRetenues).toBe(7);
    expect(r.tronque).toBe(true);
    expect(r.totalEcritures).toBe(12);
    // Le dénombrement par critère porte sur TOUT le journal, pas sur la tête gardée.
    expect(r.parCritere.find((c) => c.cle === 'SANS_JUSTIFICATION')?.nombre).toBe(7);
  });

  it('le classeur remis à l’auditeur refuse une sélection plus grande qu’un classeur en mémoire', async () => {
    const svc = new ExportService(
      {} as unknown as PrismaService,
      {} as never,
      {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never,
    );
    (svc as unknown as { testEcrituresJournal: unknown }).testEcrituresJournal = {
      selection: jest.fn().mockResolvedValue({ totalRetenues: 50_001, selection: [], tronque: true }),
    };
    await expect(svc.testEcrituresJournalExcel('t1', 'ex')).rejects.toThrow(/Test des écritures de journal \(ISA 240\) : 50[\s ]001 lignes/);
  });
});
