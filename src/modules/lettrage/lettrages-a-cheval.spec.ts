import { JeuEtatsFinanciersSycebnl, StatutExercice } from '@prisma/client';
import { ExerciceService } from '../exercice/exercice.service';
import { lignesReportANouveau, type CompteRan } from '../exercice/report-a-nouveau';
import { ControlesService } from '../controles/controles.service';
import type { PrismaService } from '../../common/prisma.service';
import {
  lettragesACheval,
  motifClotureLettragesACheval,
  motifLettrageADeuxExercices,
  PLAFOND_LETTRAGES_A_CHEVAL,
  type LettragesACheval,
} from './lettrages-a-cheval';

/**
 * UN LETTRAGE NE MÊLE PAS DEUX EXERCICES (ligne A6 bis, B2, reproduit par la
 * relecture adverse). Ce qui casserait en silence, puis en 500 · la facture
 * de N lettrée avec le règlement de N+1, l'écart de change passé en N+1
 * soldant le groupe · la facture de N prend sa lettre, sort du report
 * à-nouveau Détail sans s'y solder, et la clôture de N répond « report
 * à-nouveau déséquilibré, anomalie interne ». Le dossier est enfermé · la
 * seule issue, délettrer, était interdite par le refus D3.
 */

const N = { id: 'n', dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31') };
const N1 = { id: 'n1', dateDebut: new Date('2027-01-01'), dateFin: new Date('2027-12-31') };

describe('le refus du lettrage', () => {
  it('une seule ligne par exercice suffit · deux exercices, refus nommé avec l’issue ; un seul, rien', () => {
    const l = (exerciceId: string, date: string) => ({ ecriture: { exerciceId, date: new Date(date) } });
    expect(motifLettrageADeuxExercices([l('n', '2026-12-15'), l('n', '2026-12-31')])).toBeNull();
    expect(motifLettrageADeuxExercices([])).toBeNull();
    const motif = motifLettrageADeuxExercices([l('n1', '2027-01-10'), l('n', '2026-12-31'), l('n', '2026-12-15')]);
    expect(motif).toMatch(/appartiennent à 2 exercices \(lignes du 2026-12-15, du 2027-01-10\)/);
    expect(motif).toMatch(/contre la ligne d'à-nouveau qui la reporte/);
  });
});

// ─── La lecture des groupes déjà en base ──────────────────────────────────

type GroupeLu = { id: string; code: string; statut: 'PARTIEL' | 'SOLDE'; compte: { numero: string; modeReportANouveau: 'DETAIL' | 'SOLDE' } };
type LigneLue = {
  id: string;
  lettrageId: string;
  debit: number;
  credit: number;
  ecriture: { exerciceId: string; exercice: { statut: StatutExercice; dateDebut: Date; dateFin: Date } };
};

function lecteur(ouverts: GroupeLu[], clos: GroupeLu[], lignes: LigneLue[]) {
  return {
    lettrage: {
      // La lecture « tous ouverts » porte un `every` · c'est ce qui la distingue.
      findMany: jest.fn(async ({ where }: { where: { AND: Array<{ lignes?: { every?: unknown } }> } }) =>
        where.AND.some((c) => c.lignes?.every) ? ouverts : clos,
      ),
    },
    ligneEcriture: {
      // Les lignes des groupes demandés · toute autre lecture (les autres
      // contrôles, la garde D3) n'en reçoit aucune.
      findMany: jest.fn(async ({ where }: { where: { lettrageId?: { in?: string[] } } }) => {
        const ids = where.lettrageId?.in;
        return ids ? lignes.filter((l) => ids.includes(l.lettrageId)) : [];
      }),
    },
  };
}

const ligne = (id: string, lettrageId: string, ex: typeof N, debit: number, credit: number, statut: StatutExercice = StatutExercice.OUVERT): LigneLue => ({
  id,
  lettrageId,
  debit,
  credit,
  ecriture: { exerciceId: ex.id, exercice: { statut, dateDebut: ex.dateDebut, dateFin: ex.dateFin } },
});

describe('les groupes à cheval d’un exercice', () => {
  const soldeOuvert: GroupeLu = { id: 'g1', code: 'A', statut: 'SOLDE', compte: { numero: '40110000', modeReportANouveau: 'DETAIL' } };
  const partielFige: GroupeLu = { id: 'g2', code: 'B', statut: 'PARTIEL', compte: { numero: '41110000', modeReportANouveau: 'DETAIL' } };
  const soldeFigeFaux: GroupeLu = { id: 'g3', code: 'C', statut: 'SOLDE', compte: { numero: '40120000', modeReportANouveau: 'DETAIL' } };
  const N0 = { id: 'n0', dateDebut: new Date('2025-01-01'), dateFin: new Date('2025-12-31') };
  const lignes = [
    // g1 · facture de N, règlement et écart de N+1, tous ouverts.
    ligne('a1', 'g1', N, 0, 1_948_800),
    ligne('a2', 'g1', N1, 2_072_000, 0),
    ligne('a3', 'g1', N1, 0, 123_200),
    // g2 · facture de N-1 (clôturé), acompte de N · partiel figé.
    ligne('b1', 'g2', N0, 500, 0, StatutExercice.CLOTURE),
    ligne('b2', 'g2', N, 0, 200),
    // g3 · soldé avec N-1 clôturé, part de N non nulle · il fausserait le report.
    ligne('c1', 'g3', N0, 300, 0, StatutExercice.CLOTURE),
    ligne('c2', 'g3', N, 0, 300),
  ];

  it('range · à délettrer (tout ouvert), figé, figé qui fausse le report ; nomme les autres exercices', async () => {
    const prisma = lecteur([soldeOuvert], [partielFige, soldeFigeFaux], lignes);
    const r = await lettragesACheval(prisma as never, { tenantId: 't', exerciceId: 'n' });
    expect(r.adelettrer).toEqual([
      { lettrageId: 'g1', code: 'A', statut: 'SOLDE', compteNumero: '40110000', autresExercices: [{ dateDebut: N1.dateDebut, dateFin: N1.dateFin, clos: false }] },
    ]);
    // Rangés par compte · le 40120000 (soldé, il fausserait le report), puis le 41110000.
    expect(r.figes.map((g) => [g.compteNumero, g.code, g.faussentLeReport])).toEqual([
      ['40120000', 'C', true],
      ['41110000', 'b', false],
    ]);
    // Les deux lectures sont bornées au dossier, à l'exercice, et en nombre.
    const lues = prisma.lettrage.findMany.mock.calls.map((c) => c[0] as unknown as { where: { tenantId: string; AND: unknown[] }; take: number });
    for (const l of lues) {
      expect(l.where.tenantId).toBe('t');
      expect(l.where.AND).toContainEqual({ lignes: { some: { ecriture: { tenantId: 't', exerciceId: 'n' } } } });
      expect(l.where.AND).toContainEqual({ lignes: { some: { ecriture: { tenantId: 't', exerciceId: { not: 'n' } } } } });
      expect(l.take).toBe(PLAFOND_LETTRAGES_A_CHEVAL + 1);
    }
  });

  it('aucun groupe à cheval · aucune lecture de lignes', async () => {
    const prisma = lecteur([], [], lignes);
    const r = await lettragesACheval(prisma as never, { tenantId: 't', exerciceId: 'n' });
    expect(r).toEqual({ adelettrer: [], figes: [], tronqueADelettrer: false, tronqueFiges: false });
    expect(prisma.ligneEcriture.findMany).not.toHaveBeenCalled();
  });

  it('le refus nomme groupe, compte, exercice et l’issue · délettrer, ici et ici seulement', async () => {
    const r = await lettragesACheval(lecteur([soldeOuvert], [partielFige, soldeFigeFaux], lignes) as never, { tenantId: 't', exerciceId: 'n' });
    const motif = motifClotureLettragesACheval(r)!;
    expect(motif).toMatch(
      /1 lettrage\(s\) mêlent des lignes de cet exercice et d'un autre exercice ouvert · 40110000 lettrage A \(soldé, avec l'exercice du 2027-01-01 au 2027-12-31\)/,
    );
    expect(motif).toMatch(/Issue · délettrez ces groupes depuis Interrogation et lettrage tant que les deux exercices sont ouverts/);
    expect(motif).toMatch(/Ici, et ici seulement, délettrer est l'issue/);
    // Le soldé figé qui fausserait le report bloque aussi, et le dit sans issue inventée.
    expect(motif).toMatch(/1 lettrage\(s\) soldé\(s\) mêlent des lignes de cet exercice et d'un exercice déjà clôturé · 40120000 lettrage C/);
    expect(motif).toMatch(/aucun geste d'OmegaX ne lève encore ce refus/);
    // Le partiel figé ne fausse rien · il ne bloque pas.
    expect(motif).not.toMatch(/41110000/);
  });

  it('seul un partiel figé · rien ne bloque la clôture', () => {
    const r: LettragesACheval = {
      adelettrer: [],
      figes: [{ lettrageId: 'g2', code: 'b', statut: 'PARTIEL', compteNumero: '41110000', autresExercices: [], faussentLeReport: false }],
      tronqueADelettrer: false,
      tronqueFiges: false,
    };
    expect(motifClotureLettragesACheval(r)).toBeNull();
  });
});

// ─── Pourquoi la clôture répondait 500 ────────────────────────────────────

describe('le report Détail d’un groupe soldé à cheval', () => {
  it('la facture de N lettrée par un règlement de N+1 sort du report sans s’y solder · le report ne boucle plus', () => {
    // N · achat de 1 000 au 601, facture au 401 · lettrée (groupe soldé avec
    // le règlement de N+1), elle n'est pas reprise.
    const comptes: CompteRan[] = [
      { id: '601', numero: '60100000', intitule: 'Achats', modeReportANouveau: 'AUCUN', sommes: { debit: 1000, credit: 0, enDevise: [] } },
      {
        id: '401',
        numero: '40110000',
        intitule: 'Fournisseur',
        modeReportANouveau: 'DETAIL',
        lignes: [{ debit: 0, credit: 1000, lettre: 'A', libelle: 'Facture', dateEcheance: null }].filter((l) => !l.lettre),
      },
      { id: '139', numero: '13900000', intitule: 'Déficit', modeReportANouveau: 'SOLDE', sommes: { debit: 0, credit: 0, enDevise: [] } },
    ];
    const ran = lignesReportANouveau(comptes, { compteId: '139', montant: 1000 });
    const debit = ran.reduce((t, l) => t + l.debit, 0);
    const credit = ran.reduce((t, l) => t + l.credit, 0);
    expect(debit - credit).toBe(1000);
  });
});

// ─── La clôture et l'à-nouveau provisoire refusent, nommément ──────────────

describe('la clôture et l’à-nouveau provisoire', () => {
  const groupe: GroupeLu = { id: 'g1', code: 'A', statut: 'SOLDE', compte: { numero: '40110000', modeReportANouveau: 'DETAIL' } };
  const lignesDuGroupe = [ligne('a1', 'g1', N, 0, 1_948_800), ligne('a2', 'g1', N1, 1_948_800, 0)];

  function monter() {
    const lu = lecteur([groupe], [], lignesDuGroupe);
    const prisma = {
      exercice: {
        findFirst: jest
          .fn()
          .mockImplementation(({ where }: { where: Record<string, unknown> }) =>
            Promise.resolve(where.dateFin || where.dateDebut ? null : { ...N, tenantId: 't', statut: StatutExercice.OUVERT }),
          ),
      },
      tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ referentiel: 'SYSCOHADA' }) },
      ecriture: { count: jest.fn().mockResolvedValue(0) },
      lettrage: lu.lettrage,
      ligneEcriture: lu.ligneEcriture,
      $transaction: jest.fn(),
    };
    return { s: new ExerciceService(prisma as never, {} as never), prisma };
  }

  it('la clôture refuse AVANT la garde D3 et avant toute écriture, par un message nommé · plus de 500', async () => {
    const { s, prisma } = monter();
    await expect(s.cloturer('t', 'n', 'u')).rejects.toThrow(
      /40110000 lettrage A \(soldé, avec l'exercice du 2027-01-01 au 2027-12-31\).*délettrez ces groupes/,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
    // La garde de l'écart réalisé (D3) n'a pas été lue · son « ne délettrez
    // pas » ne précède jamais l'issue de ce cas-ci.
    const lectures = prisma.ligneEcriture.findMany.mock.calls.map((c) => c[0] as { where: Record<string, unknown> });
    expect(lectures.every((l) => 'lettrageId' in l.where && typeof l.where.lettrageId === 'object' && 'in' in (l.where.lettrageId as object))).toBe(true);
  });

  it('l’à-nouveau provisoire refuse de même, rien n’est passé', async () => {
    const { s, prisma } = monter();
    await expect(s.genererANouveauxProvisoires('t', 'n', 'u')).rejects.toThrow(/mêlent des lignes de cet exercice et d'un autre exercice ouvert/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

// ─── Le contrôle les nomme (câblage, F4a) ─────────────────────────────────

describe('le contrôle 34 · lettrage à cheval de deux exercices', () => {
  function service(ouverts: GroupeLu[], clos: GroupeLu[], lignes: LigneLue[], lettree: boolean) {
    const lu = lecteur(ouverts, clos, lignes);
    const ecriture = {
      id: 'e1',
      date: new Date('2026-12-15'),
      libelle: 'Facture',
      reference: 'PJ-1',
      numeroPiece: 1,
      createdAt: new Date('2026-12-15'),
      statut: 'VALIDEE',
      journalId: 'jACH',
      journal: { code: 'ACH' },
      lignes: [
        { id: 'a1', debit: 1000, credit: 0, lettre: null, lettrageId: null, compte: { id: 'c601', numero: '60110000', intitule: 'Achats' } },
        { id: 'a2', debit: 0, credit: 1000, lettre: null, lettrageId: lettree ? 'g1' : null, compte: { id: 'c401', numero: '40110000', intitule: 'Fournisseur' } },
      ],
    };
    const prisma = {
      exercice: { findFirst: jest.fn().mockResolvedValue({ id: 'n', dateDebut: N.dateDebut, dateFin: N.dateFin }) },
      tenant: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 't', jeuEtatsFinanciersSycebnl: JeuEtatsFinanciersSycebnl.ASSOCIATIONS_ORDRES_PROFESSIONNELS }),
      },
      ecriture: { findMany: jest.fn().mockResolvedValueOnce([ecriture]).mockResolvedValue([]) },
      compte: { findMany: jest.fn().mockResolvedValue([]) },
      ligneEcriture: lu.ligneEcriture,
      lettrage: lu.lettrage,
      dotationAmortissement: { findMany: jest.fn().mockResolvedValue([]) },
      depreciationImmobilisation: { findMany: jest.fn().mockResolvedValue([]) },
      reclassementImmobilisation: { findMany: jest.fn().mockResolvedValue([]) },
      amortissementDerogatoire: { findMany: jest.fn().mockResolvedValue([]) },
      clotureLocationAcquisition: { findMany: jest.fn().mockResolvedValue([]) },
      immobilisation: { findMany: jest.fn().mockResolvedValue([]) },
      exoneration: { findMany: jest.fn().mockResolvedValue([]) },
      manuelProcedures: { findFirst: jest.fn().mockResolvedValue(null) },
      conventionFinancement: { findMany: jest.fn().mockResolvedValue([]) },
      mandatAuditeur: { findMany: jest.fn().mockResolvedValue([]) },
      rapprochementBancaire: { findMany: jest.fn().mockResolvedValue([]), groupBy: jest.fn().mockResolvedValue([]) },
      cloture: { findMany: jest.fn().mockResolvedValue([]) },
    };
    return { svc: new ControlesService(prisma as unknown as PrismaService), prisma };
  }
  const groupe: GroupeLu = { id: 'g1', code: 'A', statut: 'SOLDE', compte: { numero: '40110000', modeReportANouveau: 'DETAIL' } };
  const lignes = [ligne('a2', 'g1', N, 0, 1000), ligne('r', 'g1', N1, 1000, 0)];

  it('un groupe à délettrer · BLOQUANT, nommé, avec l’issue', async () => {
    const { svc } = service([groupe], [], lignes, true);
    const r = await svc.analyser('t', 'n');
    const a = r.anomalies.find((x) => x.code === 'LETTRAGE_A_CHEVAL_D_EXERCICES');
    expect(a).toMatchObject({ gravite: 'BLOQUANT' });
    expect(a!.occurrences).toEqual([
      { reference: '40110000 · lettrage A', detail: "40110000 lettrage A (soldé, avec l'exercice du 2027-01-01 au 2027-12-31)" },
    ]);
    expect(a!.action).toMatch(/Délettrez le groupe/);
  });

  it('un partiel figé par un exercice clôturé · INFORMATION, sans issue inventée', async () => {
    const partiel: GroupeLu = { ...groupe, statut: 'PARTIEL' };
    const { svc } = service([], [partiel], [ligne('a2', 'g1', N, 0, 1000), ligne('r', 'g1', N1, 400, 0, StatutExercice.CLOTURE)], true);
    const r = await svc.analyser('t', 'n');
    expect(r.anomalies.find((x) => x.code === 'LETTRAGE_A_CHEVAL_D_EXERCICES')).toBeUndefined();
    expect(r.anomalies.find((x) => x.code === 'LETTRAGE_A_CHEVAL_FIGE')).toMatchObject({ gravite: 'INFORMATION' });
  });

  it('aucune ligne lettrée dans l’exercice · les lettrages ne sont pas interrogés', async () => {
    const { svc, prisma } = service([groupe], [], lignes, false);
    const r = await svc.analyser('t', 'n');
    expect(prisma.lettrage.findMany).not.toHaveBeenCalled();
    expect(r.anomalies.find((x) => x.code.startsWith('LETTRAGE_A_CHEVAL'))).toBeUndefined();
  });
});
