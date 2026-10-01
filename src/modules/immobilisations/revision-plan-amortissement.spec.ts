import { BadRequestException } from '@nestjs/common';
import {
  annuiteDegressive,
  motifRefusModeDegressif,
  motifRefusRetroactive,
  motifRefusRevision,
  tauxDegressifLoi,
} from './revision-plan-amortissement';
import { ImmobilisationService, planDuBien } from './immobilisation.service';
import { planFiscalDegressif } from './amortissement-degressif';
import { amortissementsHorsDotations } from './partie-remplacee';
import { PLAN_COMPTES_SYCEBNL } from '../comptes/compte-seed';
import { PLAN_COMPTES_SYSCOHADA } from '../comptes/compte-seed-syscohada';

/**
 * LOT 11 · RÉVISION DU PLAN D'AMORTISSEMENT ET MODE DÉGRESSIF. Fiches des
 * comptes 28 et 79 ; cadre conceptuel § 3.3.1.2 ; loi n° 23/053 art. 32 à 35.
 * Décisions de Manasse du 2026-10-01 · D-24 (prospectif, 798 en option
 * rétroactive), D-25 et D-26 (dégressif au taux de la loi, SYCEBNL seul).
 */

const exerciceDe = (annee: number) => ({
  id: `ex${annee}`,
  dateDebut: new Date(`${annee}-01-01`),
  dateFin: new Date(`${annee}-12-31`),
});

function moteur() {
  const svc = new ImmobilisationService({} as never, {} as never);
  return (svc as unknown as { calculerDotation: (...a: unknown[]) => number }).calculerDotation.bind(svc);
}

describe('le dégressif · taux de la loi n° 23/053 (D-25, D-26)', () => {
  it('taux linéaire × coefficient de l’art. 33, rien hors des bornes de l’art. 32', () => {
    expect(tauxDegressifLoi(4)).toBeCloseTo(1.5 / 4, 10);
    expect(tauxDegressifLoi(5)).toBeCloseTo(0.4, 10);
    expect(tauxDegressifLoi(8)).toBeCloseTo(2.5 / 8, 10);
    expect(tauxDegressifLoi(3)).toBeNull();
    expect(tauxDegressifLoi(21)).toBeNull();
  });

  it('SYCEBNL seul, ni incorporel, ni usufruit, durée de quatre à vingt ans', () => {
    const ok = { referentiel: 'SYCEBNL' as const, numeroCompte: '24410000', dureeAns: 5 };
    expect(motifRefusModeDegressif(ok)).toBeNull();
    expect(motifRefusModeDegressif({ ...ok, referentiel: 'SYSCOHADA' })).toMatch(/option fiscale/);
    expect(motifRefusModeDegressif({ ...ok, numeroCompte: '21300000' })).toMatch(/incorporelle/);
    expect(motifRefusModeDegressif({ ...ok, numeroCompte: '20110000' })).toMatch(/linéaire/);
    expect(motifRefusModeDegressif({ ...ok, dureeAns: 3 })).toMatch(/quatre à vingt/);
    expect(motifRefusModeDegressif({ ...ok, dureeAns: 25 })).toMatch(/quatre à vingt/);
  });

  it('bascule au linéaire de l’art. 35 quand celui-ci devient plus fort', () => {
    expect(annuiteDegressive(6_000_000, 0.4, 4)).toBeCloseTo(2_400_000, 2);
    expect(annuiteDegressive(2_160_000, 0.4, 2)).toBeCloseTo(1_080_000, 2);
    expect(annuiteDegressive(500, 0.4, 1)).toBe(500);
  });

  it('le moteur de dotation rend le plan de la loi, exercice par exercice', () => {
    const calculer = moteur();
    for (const duree of [4, 5, 8, 12]) {
      const mes = new Date('2026-04-01');
      const exercices = Array.from({ length: duree + 2 }, (_, i) => exerciceDe(2026 + i));
      const attendu = planFiscalDegressif({ base: 10_000_000, dureeFiscaleAns: duree, dateMiseEnService: mes, exercices });
      const passees: Array<{ montant: number }> = [];
      for (const ligne of attendu) {
        const ex = exercices.find((e) => e.id === ligne.exerciceId)!;
        const m = Math.round(calculer(10_000_000, 0, duree, mes, passees, ex, 0, 0, false, null, { degressif: true }) * 100) / 100;
        expect(m).toBeCloseTo(ligne.annuite, 1);
        passees.push({ montant: m });
      }
      expect(passees.reduce((t, d) => t + d.montant, 0)).toBeCloseTo(10_000_000, 0);
    }
  });

  it('sans le mode, le linéaire reste (planDuBien est la seule source)', () => {
    expect(planDuBien({ modeAmortissement: 'LINEAIRE' as never })).toEqual({ degressif: false, revision: null });
    expect(planDuBien({ modeAmortissement: 'DEGRESSIF' as never }).degressif).toBe(true);
  });
});

describe('la révision prospective · le reliquat sur la durée résiduelle', () => {
  const mes = new Date('2022-01-01');
  const passees = [1, 2, 3, 4].map(() => ({ montant: 1_000_000 }));
  const revision = { effet: new Date('2026-01-01'), dureeResiduelleAns: 3 };

  it('6 000 000 restants sur trois ans · 2 000 000 par an, puis rien', () => {
    const calculer = moteur();
    const plan = { revision };
    expect(calculer(10_000_000, 0, 7, mes, passees, exerciceDe(2026), 0, 0, false, null, plan)).toBeCloseTo(2_000_000, 2);
    const apres2026 = [...passees, { montant: 2_000_000 }];
    expect(calculer(10_000_000, 0, 7, mes, apres2026, exerciceDe(2027), 0, 0, false, null, plan)).toBeCloseTo(2_000_000, 2);
    const apres2027 = [...apres2026, { montant: 2_000_000 }];
    expect(calculer(10_000_000, 0, 7, mes, apres2027, exerciceDe(2028), 0, 0, false, null, plan)).toBeCloseTo(2_000_000, 2);
    const apres2028 = [...apres2027, { montant: 2_000_000 }];
    expect(calculer(10_000_000, 0, 7, mes, apres2028, exerciceDe(2029), 0, 0, false, null, plan)).toBe(0);
  });

  it('avant son effet, le plan d’origine court · rien du passé n’est repris', () => {
    const calculer = moteur();
    expect(calculer(10_000_000, 0, 10, mes, passees.slice(0, 3), exerciceDe(2025), 0, 0, false, null, { revision })).toBeCloseTo(1_000_000, 2);
  });

  it('planDuBien lit la révision posée sur la fiche', () => {
    expect(planDuBien({ modeAmortissement: 'LINEAIRE' as never, dateEffetRevisionPlan: revision.effet, dureeResiduelleRevisee: 3 }).revision).toEqual(revision);
  });
});

describe('les refus avant toute révision', () => {
  const ok = {
    enService: true,
    debutAmortissement: new Date('2022-01-01'),
    dureeNonLimitee: false,
    nonAmortissable: null,
    uniteOeuvre: false,
    degressifFiscal: false,
    ouvertureExercice: new Date('2026-01-01'),
    exerciceClos: false,
    dotationDeLExercicePassee: false,
    nature: 'PROSPECTIVE' as const,
    nouvelleDureeAns: 3,
    motif: 'Usage intensif constaté',
  };
  it('admise', () => expect(motifRefusRevision(ok)).toBeNull());
  it('refus nommés', () => {
    expect(motifRefusRevision({ ...ok, enService: false })).toMatch(/sorti/);
    expect(motifRefusRevision({ ...ok, nonAmortissable: 'Terrain' })).toBe('Terrain');
    expect(motifRefusRevision({ ...ok, dureeNonLimitee: true })).toMatch(/Durée limitée/);
    expect(motifRefusRevision({ ...ok, uniteOeuvre: true })).toMatch(/unités d'œuvre/);
    expect(motifRefusRevision({ ...ok, degressifFiscal: true })).toMatch(/dérogatoire/);
    expect(motifRefusRevision({ ...ok, debutAmortissement: new Date('2026-02-01') })).toMatch(/n'a encore couru/);
    expect(motifRefusRevision({ ...ok, debutAmortissement: null })).toMatch(/n'a encore couru/);
    expect(motifRefusRevision({ ...ok, exerciceClos: true })).toMatch(/clôturé/);
    expect(motifRefusRevision({ ...ok, dotationDeLExercicePassee: true })).toMatch(/avant la dotation/);
    expect(motifRefusRevision({ ...ok, nouvelleDureeAns: 0 })).toMatch(/résiduelle/);
    expect(motifRefusRevision({ ...ok, nature: 'RETROACTIVE', nouvelleDureeAns: 2.5 })).toMatch(/nouvelle durée/);
    expect(motifRefusRevision({ ...ok, motif: '  ' })).toMatch(/révélée et quantifiée/);
    expect(motifRefusRevision({ ...ok, degressifDureeTotale: 3 })).toMatch(/quatre à vingt/);
    expect(motifRefusRevision({ ...ok, degressifDureeTotale: 6 })).toBeNull();
  });
  it('le 798 ne porte qu’une réduction, sur un plan linéaire qui se rejoue', () => {
    const r = { cumulActuel: 4_000_000, cumulRejoue: 2_000_000, amortissementAnterieur: 0, partieDetachee: 0, cumulDepreciation: 0, lineaire: true };
    expect(motifRefusRetroactive(r)).toBeNull();
    expect(motifRefusRetroactive({ ...r, cumulRejoue: 8_000_000 })).toMatch(/n'abaisse pas/);
    expect(motifRefusRetroactive({ ...r, cumulRejoue: 4_000_000 })).toMatch(/n'abaisse pas/);
    expect(motifRefusRetroactive({ ...r, lineaire: false })).toMatch(/linéaire/);
    expect(motifRefusRetroactive({ ...r, amortissementAnterieur: 100 })).toMatch(/antérieur/);
    expect(motifRefusRetroactive({ ...r, partieDetachee: 100 })).toMatch(/détachée/);
    expect(motifRefusRetroactive({ ...r, cumulDepreciation: 100 })).toMatch(/dépréciation/);
  });
  it('la reprise au 798 sort du cumul, comme une partie détachée', () => {
    expect(amortissementsHorsDotations({ amortissementAnterieur: 500, amortissementsDetaches: 100, reprisesAmortissement: 150 })).toBe(250);
  });
  it('le 79800000 est ouvert aux deux semis', () => {
    expect(PLAN_COMPTES_SYCEBNL.some((c) => c.numero === '79800000')).toBe(true);
    expect(PLAN_COMPTES_SYSCOHADA.some((c) => c.numero === '79800000')).toBe(true);
  });
});

describe('le service · reviserPlan', () => {
  function monter(o: {
    mode?: string;
    dateMiseEnService?: string;
    statutExercice?: string;
    dotationCourante?: boolean;
    degressifFiscal?: boolean;
  } = {}) {
    const dotations = [2022, 2023, 2024, 2025].map((a) => ({ exerciceId: `ex${a}`, montant: 1_000_000, exercice: exerciceDe(a) }));
    if (o.dotationCourante) dotations.push({ exerciceId: 'ex2026', montant: 1_000_000, exercice: exerciceDe(2026) });
    const immo = {
      id: 'i1',
      designation: 'Camion',
      statut: 'EN_SERVICE',
      valeurOrigine: 10_000_000,
      valeurResiduelle: 0,
      dureeAmortissementAns: 10,
      modeAmortissement: o.mode ?? 'LINEAIRE',
      dateMiseEnService: new Date(o.dateMiseEnService ?? '2022-01-01'),
      dateDebutAmortissement: null,
      dureeNonLimitee: false,
      degressifFiscal: !!o.degressifFiscal,
      amortissementAnterieur: 0,
      amortissementsDetaches: 0,
      reprisesAmortissement: 0,
      compteAmortissementId: 'c28',
      compteImmobilisation: { numero: '24510000' },
      dotations,
      depreciations: [],
    };
    const tx = {
      revisionPlanAmortissement: { create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'r1', ...data })) },
      immobilisation: { update: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      immobilisation: { findFirst: jest.fn().mockResolvedValue(immo) },
      exercice: { findFirst: jest.fn().mockResolvedValue({ ...exerciceDe(2026), statut: o.statutExercice ?? 'OUVERT' }) },
      tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ referentiel: 'SYCEBNL', systemeComptableSyscohada: null, jeuEtatsFinanciersSycebnl: 'ASSOCIATIONS' }) },
      compte: { findFirst: jest.fn().mockResolvedValue({ id: 'c798' }) },
      $transaction: jest.fn().mockImplementation((f: (t: unknown) => unknown) => f(tx)),
      ligneEcriture: { deleteMany: jest.fn() },
      ecriture: { delete: jest.fn() },
    };
    const ecritures = { creer: jest.fn().mockResolvedValue({ id: 'e798' }) };
    const svc = new ImmobilisationService(prisma as never, ecritures as never);
    return { svc, tx, prisma, ecritures };
  }
  const dto = { nature: 'PROSPECTIVE' as const, dateDecision: '2026-03-15', nouvelleDureeAns: 3, motif: 'Usage intensif' };

  it('prospective · aucune écriture, effet à l’ouverture, durée totale affichée', async () => {
    const { svc, tx, ecritures } = monter();
    const r = await svc.reviserPlan('t', 'u', 'i1', dto);
    expect(ecritures.creer).not.toHaveBeenCalled();
    expect(r).toMatchObject({ nature: 'PROSPECTIVE', dureeAmortissementAns: 7, montantReprise: null });
    expect(tx.immobilisation.update).toHaveBeenCalledWith({
      where: { id: 'i1' },
      data: { dateEffetRevisionPlan: new Date('2026-01-01'), dureeResiduelleRevisee: 3, dureeAmortissementAns: 7 },
    });
    expect(tx.revisionPlanAmortissement.create.mock.calls[0][0].data).toMatchObject({ dureeAvantAns: 10, dureeApresAns: 3, exerciceId: 'ex2026' });
  });

  it('rétroactive · plan rejoué sur vingt ans, 2 000 000 repris D 28 / C 798', async () => {
    const { svc, tx, ecritures } = monter();
    const r = await svc.reviserPlan('t', 'u', 'i1', { ...dto, nature: 'RETROACTIVE', nouvelleDureeAns: 20, journalId: 'j' });
    expect(r).toMatchObject({ nature: 'RETROACTIVE', montantReprise: 2_000_000, dureeAmortissementAns: 20 });
    expect(ecritures.creer.mock.calls[0][2].lignes).toEqual([
      { compteId: 'c28', debit: 2_000_000, credit: 0 },
      { compteId: 'c798', debit: 0, credit: 2_000_000 },
    ]);
    expect(tx.immobilisation.update.mock.calls[0][0].data).toEqual({
      dureeAmortissementAns: 20,
      reprisesAmortissement: { increment: 2_000_000 },
      dateEffetRevisionPlan: null,
      dureeResiduelleRevisee: null,
    });
    expect(tx.revisionPlanAmortissement.create.mock.calls[0][0].data).toMatchObject({ ecritureId: 'e798', montantReprise: 2_000_000 });
  });

  it('rétroactive · une durée plus courte n’a pas de 798, et rien n’est passé', async () => {
    const { svc, ecritures } = monter();
    await expect(svc.reviserPlan('t', 'u', 'i1', { ...dto, nature: 'RETROACTIVE', nouvelleDureeAns: 5, journalId: 'j' })).rejects.toThrow(/n'abaisse pas/);
    await expect(svc.reviserPlan('t', 'u', 'i1', { ...dto, nature: 'RETROACTIVE', nouvelleDureeAns: 20 })).rejects.toThrow(/journal/);
    expect(ecritures.creer).not.toHaveBeenCalled();
  });

  it('rétroactive · l’écriture est retirée si l’enregistrement échoue', async () => {
    const { svc, tx, prisma } = monter();
    tx.revisionPlanAmortissement.create.mockRejectedValueOnce(new Error('panne'));
    await expect(svc.reviserPlan('t', 'u', 'i1', { ...dto, nature: 'RETROACTIVE', nouvelleDureeAns: 20, journalId: 'j' })).rejects.toThrow('panne');
    expect(prisma.ecriture.delete).toHaveBeenCalledWith({ where: { id: 'e798' } });
  });

  it('les refus passent par le service', async () => {
    await expect(monter({ dotationCourante: true }).svc.reviserPlan('t', 'u', 'i1', dto)).rejects.toThrow(/avant la dotation/);
    await expect(monter({ statutExercice: 'CLOTURE' }).svc.reviserPlan('t', 'u', 'i1', dto)).rejects.toThrow(/clôturé/);
    await expect(monter({ mode: 'UNITES_DOEUVRE' }).svc.reviserPlan('t', 'u', 'i1', dto)).rejects.toThrow(/unités d'œuvre/);
    await expect(monter({ degressifFiscal: true }).svc.reviserPlan('t', 'u', 'i1', dto)).rejects.toThrow(/dérogatoire/);
    await expect(monter({ dateMiseEnService: '2026-02-01' }).svc.reviserPlan('t', 'u', 'i1', dto)).rejects.toThrow(BadRequestException);
    // Dégressif mis en service en 2022 · quatre ans courus, trois restants · sept ans, admis ; deux de plus · vingt-et-un, hors loi.
    await expect(monter({ mode: 'DEGRESSIF' }).svc.reviserPlan('t', 'u', 'i1', { ...dto, nouvelleDureeAns: 17 })).rejects.toThrow(/21 ans/);
    await expect(monter({ mode: 'DEGRESSIF' }).svc.reviserPlan('t', 'u', 'i1', dto)).resolves.toMatchObject({ dureeAmortissementAns: 7 });
  });
});

describe('le service · la famille au mode dégressif', () => {
  function verifier(referentiel: string, numero: string, duree: number) {
    const prisma = {
      tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ referentiel, systemeComptableSyscohada: null, jeuEtatsFinanciersSycebnl: null }) },
      compte: { findFirst: jest.fn().mockResolvedValue({ numero }) },
    };
    const svc = new ImmobilisationService(prisma as never, {} as never);
    return (svc as unknown as { verifierModeFamille: (...a: unknown[]) => Promise<void> }).verifierModeFamille('t', 'DEGRESSIF', 'c', duree);
  }
  it('admise au SYCEBNL, refusée au SYSCOHADA et hors bornes', async () => {
    await expect(verifier('SYCEBNL', '24410000', 5)).resolves.toBeUndefined();
    await expect(verifier('SYSCOHADA', '24440000', 5)).rejects.toThrow(/option fiscale/);
    await expect(verifier('SYCEBNL', '24410000', 2)).rejects.toThrow(/quatre à vingt/);
  });
});
