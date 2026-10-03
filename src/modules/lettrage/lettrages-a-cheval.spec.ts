import { JeuEtatsFinanciersSycebnl, StatutExercice } from '@prisma/client';
import { ControlesService } from '../controles/controles.service';
import type { PrismaService } from '../../common/prisma.service';
import {
  issueEcartACheval,
  issueLettrageACheval,
  lettragesACheval,
  motifLettrageADeuxExercices,
  PLAFOND_LETTRAGES_A_CHEVAL,
  type LettrageACheval,
} from './lettrages-a-cheval';

/**
 * LES LETTRAGES À CHEVAL DE DEUX EXERCICES (ligne A6 bis, refait au premier
 * tour de relecture). Le refus de clôture du premier jet ENFERMAIT le dossier
 * dès qu'une clôture de période figeait le groupe · le report lit désormais
 * chaque exercice pour lui-même (règle 1, éprouvée sur la clôture et le
 * provisoire dans `exercice/report-a-nouveau-agrege.spec.ts`). Ici · le
 * refus d'un NOUVEAU groupe, au Détail seulement (règle 2), et ce que le
 * contrôle des comptes dit des groupes déjà en base (règle 3).
 */

const N = { id: 'n', dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31') };
const N1 = { id: 'n1', dateDebut: new Date('2027-01-01'), dateFin: new Date('2027-12-31') };
const N0 = { id: 'n0', dateDebut: new Date('2025-01-01'), dateFin: new Date('2025-12-31') };

describe('le refus d’un nouveau groupe entre exercices (règle 2)', () => {
  const l = (exerciceId: string, date: string) => ({ ecriture: { exerciceId, date: new Date(date) } });
  const auDetail = { numero: '40110000', modeReportANouveau: 'DETAIL' };

  it('au Détail · deux exercices, refus nommé avec l’issue (à-nouveau définitif, sinon attendre la clôture) ; un seul, rien', () => {
    expect(motifLettrageADeuxExercices([l('n', '2026-12-15'), l('n', '2026-12-31')], auDetail)).toBeNull();
    expect(motifLettrageADeuxExercices([], auDetail)).toBeNull();
    const motif = motifLettrageADeuxExercices([l('n1', '2027-01-10'), l('n', '2026-12-31'), l('n', '2026-12-15')], auDetail);
    expect(motif).toMatch(/Le compte 40110000 est reporté en mode Détail, et ces lignes appartiennent à 2 exercices \(lignes du 2026-12-15, du 2027-01-10\)/);
    expect(motif).toMatch(/Lettrez le règlement contre la ligne d'à-nouveau DÉFINITIF une fois l'exercice antérieur clôturé ; tant qu'il ne l'est pas, attendez sa clôture/);
  });

  it('au SOLDE ou sans report · libre (le salaire de décembre payé en janvier se lettre)', () => {
    const lignes = [l('n', '2026-12-31'), l('n1', '2027-01-05')];
    expect(motifLettrageADeuxExercices(lignes, { numero: '42200000', modeReportANouveau: 'SOLDE' })).toBeNull();
    expect(motifLettrageADeuxExercices(lignes, { numero: '58500000', modeReportANouveau: 'AUCUN' })).toBeNull();
  });
});

// ─── La lecture des groupes déjà en base ──────────────────────────────────

type GroupeLu = { id: string; code: string; statut: 'PARTIEL' | 'SOLDE'; compte: { numero: string; modeReportANouveau: 'DETAIL' | 'SOLDE' } };
type LigneLue = {
  id: string;
  lettrageId: string;
  debit: number;
  credit: number;
  deviseId: string | null;
  montantDevise: number | null;
  ecriture: {
    date: Date;
    journalId: string;
    journal: { code: string };
    exerciceId: string;
    exercice: { statut: StatutExercice; dateDebut: Date; dateFin: Date };
  };
};
type ClotureLue = { granularite: 'TOTALE' | 'PERIODE' | 'PARTIELLE'; journalId: string | null; dateLimite: Date };

function lecteur(groupes: GroupeLu[], lignes: LigneLue[], clotures: ClotureLue[] = []) {
  return {
    lettrage: { findMany: jest.fn(async () => groupes) },
    ligneEcriture: {
      // Les lignes des groupes demandés · toute autre lecture (les autres
      // contrôles, la garde D3) n'en reçoit aucune.
      findMany: jest.fn(async ({ where }: { where: { lettrageId?: { in?: string[] } } }) => {
        const ids = where.lettrageId?.in;
        return ids ? lignes.filter((x) => ids.includes(x.lettrageId)) : [];
      }),
    },
    // La doublure honore `granularite: { not }` · une PARTIELLE ne fige rien.
    cloture: {
      findMany: jest.fn(async ({ where }: { where?: { granularite?: { not?: string } } } = {}) =>
        clotures.filter((c) => c.granularite !== where?.granularite?.not),
      ),
    },
  };
}

const ligne = (
  id: string,
  lettrageId: string,
  ex: typeof N,
  date: string,
  debit: number,
  credit: number,
  x: { statut?: StatutExercice; usd?: number } = {},
): LigneLue => ({
  id,
  lettrageId,
  debit,
  credit,
  deviseId: x.usd !== undefined ? 'usd' : null,
  montantDevise: x.usd ?? null,
  ecriture: {
    date: new Date(date),
    journalId: 'jACH',
    journal: { code: 'ACH' },
    exerciceId: ex.id,
    exercice: { statut: x.statut ?? StatutExercice.OUVERT, dateDebut: ex.dateDebut, dateFin: ex.dateFin },
  },
});

describe('les groupes à cheval d’un exercice', () => {
  // B-1 · facture du 15/12/2026, acompte du 10/01/2027, au Détail.
  const b1: GroupeLu = { id: 'g1', code: 'A', statut: 'PARTIEL', compte: { numero: '40110000', modeReportANouveau: 'DETAIL' } };
  // Au SOLDE · salaire de décembre payé en janvier.
  const salaire: GroupeLu = { id: 'g2', code: 'B', statut: 'SOLDE', compte: { numero: '42200000', modeReportANouveau: 'SOLDE' } };
  // En devise · 1 160 USD à 1 680 en N, réglés 1 160 USD à 1 786,21 en N+1 · soldé en devise, pas en francs.
  const devise: GroupeLu = { id: 'g3', code: 'C', statut: 'PARTIEL', compte: { numero: '40120000', modeReportANouveau: 'DETAIL' } };
  const lignes = [
    ligne('a1', 'g1', N, '2026-12-15', 0, 1000),
    ligne('a2', 'g1', N1, '2027-01-10', 600, 0),
    ligne('s1', 'g2', N, '2026-12-31', 0, 500),
    ligne('s2', 'g2', N1, '2027-01-05', 500, 0),
    ligne('d1', 'g3', N0, '2025-11-20', 0, 1_948_800, { statut: StatutExercice.CLOTURE, usd: 1160 }),
    ligne('d2', 'g3', N, '2026-03-02', 2_072_000, 0, { usd: 1160 }),
  ];

  it('nomme autres exercices, mode, figé (période close au 31/12/2026, exercice clôturé), et l’écart non passé du dénouement', async () => {
    const prisma = lecteur([b1, salaire, devise], lignes, [
      { granularite: 'PERIODE', journalId: null, dateLimite: new Date('2026-12-31') },
      { granularite: 'PARTIELLE', journalId: null, dateLimite: new Date('2027-12-31') },
    ]);
    const r = await lettragesACheval(prisma as never, { tenantId: 't', exerciceId: 'n' });
    expect(r.tronque).toBe(false);
    expect(r.groupes.map((g) => [g.compteNumero, g.code, g.auDetail, g.fige, g.ecartNonPasse])).toEqual([
      // B-1 · figé par la clôture de PÉRIODE, aucun écart (francs).
      ['40110000', 'a', true, true, null],
      // En devise · figé par l'exercice clôturé, dénoué en N · 2 072 000 − 1 948 800 = 123 200 de perte.
      ['40120000', 'c', true, true, 123_200],
      // Au SOLDE · sa ligne du 31/12 est sous la période close (la PARTIELLE de 2027, elle, ne fige rien).
      ['42200000', 'B', false, true, null],
    ]);
    expect(r.groupes[0]!.autresExercices).toEqual([{ dateDebut: N1.dateDebut, dateFin: N1.dateFin, clos: false }]);
    // La lecture des groupes est bornée au dossier, à l'exercice, et en nombre.
    const lue = prisma.lettrage.findMany.mock.calls[0] as unknown as [{ where: { tenantId: string; AND: unknown[] }; take: number }];
    expect(lue[0].where.tenantId).toBe('t');
    expect(lue[0].where.AND).toContainEqual({ lignes: { some: { ecriture: { tenantId: 't', exerciceId: 'n' } } } });
    expect(lue[0].where.AND).toContainEqual({ lignes: { some: { ecriture: { tenantId: 't', exerciceId: { not: 'n' } } } } });
    expect(lue[0].take).toBe(PLAFOND_LETTRAGES_A_CHEVAL + 1);
    // Les clôtures actives du dossier, la PARTIELLE écartée (même règle que le lettrage, `gel-cloture.ts`).
    expect(prisma.cloture.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 't', annuleeAt: null, granularite: { not: 'PARTIELLE' } } }),
    );
  });

  it('l’écart non passé ne se lit que dans l’exercice du dénouement', async () => {
    const r = await lettragesACheval(lecteur([devise], lignes) as never, { tenantId: 't', exerciceId: 'n0' });
    expect(r.groupes[0]!.ecartNonPasse).toBeNull();
  });

  it('aucun groupe à cheval · aucune lecture de lignes', async () => {
    const prisma = lecteur([], lignes);
    expect(await lettragesACheval(prisma as never, { tenantId: 't', exerciceId: 'n' })).toEqual({ groupes: [], tronque: false });
    expect(prisma.ligneEcriture.findMany).not.toHaveBeenCalled();
  });
});

describe('les issues nommées', () => {
  const base: LettrageACheval = {
    lettrageId: 'g',
    code: 'c',
    statut: 'PARTIEL',
    compteNumero: '40110000',
    auDetail: true,
    autresExercices: [{ dateDebut: N1.dateDebut, dateFin: N1.dateFin, clos: false }],
    fige: false,
    ecartNonPasse: 123_200,
    denouement: new Date('2027-03-02'),
  };

  it('au Détail · rien à défaire, jamais « délettrez » (second tour, m2) ; la lecture ouverte nommée pour un groupe soldé (m1)', () => {
    for (const g of [base, { ...base, fige: true }]) {
      const issue = issueLettrageACheval(g);
      expect(issue).toMatch(/rien à défaire, et il ne se délettre pas/);
      expect(issue).toMatch(/se lit réglée par ce groupe au règlement des tiers, aux relances et à la réévaluation/);
      expect(issue).not.toMatch(/délettrez/i);
    }
    expect(issueLettrageACheval(base)).not.toMatch(/balance âgée/);
    expect(issueLettrageACheval({ ...base, statut: 'SOLDE', code: 'A' })).toMatch(
      /La balance âgée et les notes par échéance de l'exercice suivant la lisent encore ouverte/,
    );
  });

  it('écart · passé sur le groupe, au compte PRESCRIT par le référentiel et la nature, figé ou non, jamais par une écriture libre (B2)', () => {
    const fige = { ...base, fige: true };
    expect(issueEcartACheval(fige, 'SYSCOHADA')).toMatch(
      /perte de change réalisée de 123200\.00 non passée · passez l'écart proposé sur le groupe au 65600000 .*jamais par une écriture hors du groupe, que la réévaluation recompterait/,
    );
    // Figé · le report au premier jour non clôturé, date de valeur gardée.
    expect(issueEcartACheval(fige, 'SYSCOHADA')).toMatch(/si le dénouement du 2027-03-02 tombe dans une période close, cochez le report .*art\. 22, 4°/);
    expect(issueEcartACheval(base, 'SYSCOHADA')).not.toMatch(/période close/);
    // Au SYCEBNL, le résidu de la fiche 65 (décision D2), un gain au 7588.
    expect(issueEcartACheval(fige, 'SYCEBNL')).toMatch(/au 65800000/);
    expect(issueEcartACheval({ ...fige, ecartNonPasse: -500 }, 'SYCEBNL')).toMatch(/gain de change réalisée de 500\.00.*au 75880000/);
    // Une dette financière · 676 aux deux plans.
    expect(issueEcartACheval({ ...fige, compteNumero: '48100000' }, 'SYSCOHADA')).toMatch(/au 67600000/);
    for (const g of [base, fige, { ...base, auDetail: false }]) {
      expect(issueEcartACheval(g, 'SYSCOHADA')).not.toMatch(/délettrez|écriture manuelle/i);
    }
  });
});

// ─── Le contrôle les nomme (câblage, F4a) ─────────────────────────────────

describe('le contrôle 35 · lettrage à cheval de deux exercices', () => {
  function service(groupes: GroupeLu[], lignes: LigneLue[], lettree: boolean, clotures: ClotureLue[] = []) {
    const lu = lecteur(groupes, lignes, clotures);
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
      cloture: lu.cloture,
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
      // A5 bis · les traces des contre-passations annulées (contrôle 32).
      reevaluation: { findMany: jest.fn().mockResolvedValue([]) },
    };
    return { svc: new ControlesService(prisma as unknown as PrismaService), prisma };
  }
  const auDetail: GroupeLu = { id: 'g1', code: 'A', statut: 'PARTIEL', compte: { numero: '40110000', modeReportANouveau: 'DETAIL' } };
  const lignesB1 = [ligne('a2', 'g1', N, '2026-12-15', 0, 1000), ligne('r', 'g1', N1, '2027-01-10', 600, 0)];

  it('au Détail · INFORMATION, jamais BLOQUANT · la clôture passe ; nommé avec son issue', async () => {
    const { svc } = service([auDetail], lignesB1, true, [{ granularite: 'PERIODE', journalId: null, dateLimite: new Date('2026-12-31') }]);
    const r = await svc.analyser('t', 'n');
    const a = r.anomalies.find((x) => x.code === 'LETTRAGE_A_CHEVAL_D_EXERCICES');
    expect(a).toMatchObject({ gravite: 'INFORMATION' });
    expect(a!.occurrences).toEqual([{ reference: '40110000 · lettrage a', detail: expect.stringMatching(/rien à défaire, et il ne se délettre pas/) }]);
    expect(r.anomalies.some((x) => x.gravite === 'BLOQUANT' && x.code.includes('CHEVAL'))).toBe(false);
  });

  it('au SOLDE, sans devise · rien à dire', async () => {
    const auSolde: GroupeLu = { ...auDetail, compte: { numero: '42200000', modeReportANouveau: 'SOLDE' } };
    const { svc } = service([auSolde], lignesB1, true);
    const r = await svc.analyser('t', 'n');
    expect(r.anomalies.find((x) => x.code.includes('CHEVAL'))).toBeUndefined();
  });

  it('un écart réalisé resté sur un groupe figé, dénoué dans l’exercice · AVERTISSEMENT chiffré, l’écart proposé sur le groupe', async () => {
    const lignes = [
      ligne('d1', 'g1', N0, '2025-11-20', 0, 1_948_800, { statut: StatutExercice.CLOTURE, usd: 1160 }),
      ligne('d2', 'g1', N, '2026-03-02', 2_072_000, 0, { usd: 1160 }),
    ];
    const { svc } = service([auDetail], lignes, true);
    const r = await svc.analyser('t', 'n');
    const a = r.anomalies.find((x) => x.code === 'ECART_CHANGE_A_CHEVAL_NON_CONSTATE');
    expect(a).toMatchObject({ gravite: 'AVERTISSEMENT' });
    expect(a!.occurrences[0]).toMatchObject({ reference: '40110000 · lettrage a', montant: 123_200 });
    expect(a!.occurrences[0]!.detail).toMatch(/passez l'écart proposé sur le groupe au 65800000/);
    expect(a!.action).not.toMatch(/écriture manuelle/);
  });

  // B2 · une fois l'écart passé sur le groupe (sa propre ligne, sous la
  // tolérance de `completer`), le groupe est SOLDÉ et l'avertissement
  // s'éteint · la même scène, avec la ligne d'écart de 123 200.
  it('l’écart passé sur le groupe figé, l’avertissement s’éteint', async () => {
    const avant = [
      ligne('d1', 'g1', N0, '2025-11-20', 0, 1_948_800, { statut: StatutExercice.CLOTURE, usd: 1160 }),
      ligne('d2', 'g1', N, '2026-03-02', 2_072_000, 0, { usd: 1160 }),
    ];
    const apres = [...avant, ligne('e', 'g1', N, '2026-03-02', 0, 123_200)];
    const { svc } = service([{ ...auDetail, statut: 'SOLDE' }], apres, true);
    const r = await svc.analyser('t', 'n');
    expect(r.anomalies.find((x) => x.code === 'ECART_CHANGE_A_CHEVAL_NON_CONSTATE')).toBeUndefined();
    // Le groupe à cheval reste nommé, en INFORMATION, rien à défaire.
    expect(r.anomalies.find((x) => x.code === 'LETTRAGE_A_CHEVAL_D_EXERCICES')).toMatchObject({ gravite: 'INFORMATION' });
  });

  it('aucune ligne lettrée dans l’exercice · les lettrages ne sont pas interrogés', async () => {
    const { svc, prisma } = service([auDetail], lignesB1, false);
    const r = await svc.analyser('t', 'n');
    expect(prisma.lettrage.findMany).not.toHaveBeenCalled();
    expect(r.anomalies.find((x) => x.code.includes('CHEVAL'))).toBeUndefined();
  });
});
