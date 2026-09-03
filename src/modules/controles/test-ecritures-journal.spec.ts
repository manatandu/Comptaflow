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
  const prisma = {
    exercice: { findFirst: jest.fn().mockResolvedValue(EXERCICE) },
    ecriture: { findMany: jest.fn().mockResolvedValue(ecritures) },
    user: { findMany: jest.fn().mockResolvedValue([COMPTABLE, ADMIN]) },
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
    } as Faux;
    const ecritureService = {
      lister: jest.fn().mockResolvedValue({ ecritures, totaux: { debit: 0, credit: 0 } }),
    } as Faux;
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
    const { buffer } = await exportService([{ ...ORDINAIRE, lignes: ORDINAIRE.lignes, correction: null, corrigeEcriture: null }]).journalExcel('t1', { exerciceId: 'ex' });
    const classeur = new ExcelJS.Workbook();
    await classeur.xlsx.load(buffer as never);
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
