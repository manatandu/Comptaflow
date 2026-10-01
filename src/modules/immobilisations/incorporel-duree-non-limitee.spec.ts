import { BadRequestException } from '@nestjs/common';
import {
  debutAmortissement,
  INCORPORELS_TOUJOURS_AMORTIS,
  JUSTIFICATION_PRESUMEE_FONDS_COMMERCIAL,
  motifRefusBascule,
  motifRefusDureeDixAns,
  motifRefusDureeNonLimitee,
} from './incorporel-duree-non-limitee';
import { ImmobilisationService } from './immobilisation.service';
import { PLAN_COMPTES_SYSCOHADA } from '../comptes/compte-seed-syscohada';

/**
 * LOT 10 · LES INCORPORELS À DURÉE NON LIMITÉE. AUDCIF Titre VIII ch. 2
 * § 1.3.3, § 3.2.2 c, § 4.2.2, § 7.2.2.1 ; décisions de Manasse du
 * 2026-10-01 · D-22 (tout incorporel sauf ceux que le texte fait amortir),
 * D-23 (SYSCOHADA seul).
 */
const base = { referentiel: 'SYSCOHADA' as const, justification: 'Marque protégée, aucune fin prévisible' };

describe('qui peut être non limité · D-22, D-23', () => {
  it('marque, droit d’exclusivité public, fichier clients, divers · avec justification', () => {
    for (const n of ['21400000', '21280000', '21830000', '21880000']) {
      expect(motifRefusDureeNonLimitee({ ...base, numeroCompte: n })).toBeNull();
    }
    expect(motifRefusDureeNonLimitee({ ...base, numeroCompte: '21400000', justification: ' ' })).toMatch(/démontrer|Démontrez/);
  });

  it('le fonds commercial est présumé non limité · sans justification', () => {
    expect(motifRefusDureeNonLimitee({ referentiel: 'SYSCOHADA', numeroCompte: '21500000' })).toBeNull();
    expect(JUSTIFICATION_PRESUMEE_FONDS_COMMERCIAL).toMatch(/§ 7.2.2.1/);
  });

  it('ce que le texte fait amortir est refusé, chacun avec son passage', () => {
    for (const [n, re] of [
      ['21100000', /§ 2.2.2/],
      ['21210000', /§ 1.1.3/],
      ['21220000', /§ 1.2.3/],
      ['21310000', /§ 2.4/],
      ['21600000', /§ 5.1/],
      ['21820000', /§ 8/],
      ['21910000', /en cours/],
    ] as const) {
      expect(motifRefusDureeNonLimitee({ ...base, numeroCompte: n })).toMatch(re);
    }
  });

  it('le site internet s’amortit, sauf le nom de domaine', () => {
    expect(motifRefusDureeNonLimitee({ ...base, numeroCompte: '21320000' })).toMatch(/nom de domaine/);
    expect(motifRefusDureeNonLimitee({ ...base, numeroCompte: '21320000', nomDeDomaine: true })).toBeNull();
  });

  it('SYSCOHADA seul, incorporel seul', () => {
    expect(motifRefusDureeNonLimitee({ ...base, referentiel: 'SYCEBNL', numeroCompte: '21400000' })).toMatch(/SYCEBNL/);
    expect(motifRefusDureeNonLimitee({ ...base, numeroCompte: '23130000' })).toMatch(/incorporelle \(21\)/);
  });

  it('les comptes nommés existent au semis SYSCOHADA', () => {
    const semis = new Set(PLAN_COMPTES_SYSCOHADA.map((c) => c.numero));
    const racines = INCORPORELS_TOUJOURS_AMORTIS.map((e) => e.racine);
    expect(racines.filter((r) => ![...semis].some((n) => n.startsWith(r)))).toEqual([]);
    expect(['21400000', '21500000', '21320000', '21280000'].filter((n) => !semis.has(n))).toEqual([]);
  });
});

describe('dix ans, deux cas du fonds commercial (§ 7.2.2.1)', () => {
  it('fonds commercial, dix ans exactement, SMT pour la simplification', () => {
    expect(motifRefusDureeDixAns({ numeroCompte: '21500000', fondement: 'NON_ESTIMABLE', dureeAns: 10, systemeMinimal: false })).toBeNull();
    expect(motifRefusDureeDixAns({ numeroCompte: '21500000', fondement: 'NON_ESTIMABLE', dureeAns: 8, systemeMinimal: false })).toMatch(/dixième/);
    expect(motifRefusDureeDixAns({ numeroCompte: '21400000', fondement: 'NON_ESTIMABLE', dureeAns: 10, systemeMinimal: false })).toMatch(/215/);
    expect(motifRefusDureeDixAns({ numeroCompte: '21500000', fondement: 'SIMPLIFICATION_SMT', dureeAns: 10, systemeMinimal: false })).toMatch(/Système minimal/);
    expect(motifRefusDureeDixAns({ numeroCompte: '21500000', fondement: 'SIMPLIFICATION_SMT', dureeAns: 10, systemeMinimal: true })).toBeNull();
  });
});

describe('bascule prospective (§ 4.2.2)', () => {
  const b = {
    dureeNonLimitee: true,
    enService: true,
    dateDecision: new Date('2026-09-01'),
    debutPossible: new Date('2020-01-01'),
    dureeResiduelleAns: 4,
    testDepreciation: 'Valeur actuelle supérieure à la valeur comptable',
    motif: "Décision d'arrêter la marque au 30 août 2030",
  };
  it('admise avec motif et test de dépréciation', () => {
    expect(motifRefusBascule(b)).toBeNull();
  });
  it('refus nommés', () => {
    expect(motifRefusBascule({ ...b, dureeNonLimitee: false })).toMatch(/déjà limitée/);
    expect(motifRefusBascule({ ...b, testDepreciation: '' })).toMatch(/test de dépréciation/);
    expect(motifRefusBascule({ ...b, motif: '' })).toMatch(/rend la durée limitée/);
    expect(motifRefusBascule({ ...b, dateDecision: new Date('2019-12-31') })).toMatch(/précède/);
    expect(motifRefusBascule({ ...b, debutPossible: null })).toMatch(/mise en service/);
    expect(motifRefusBascule({ ...b, enService: false })).toMatch(/sorti/);
    expect(motifRefusBascule({ ...b, dureeResiduelleAns: 0 })).toMatch(/une au moins/);
  });
  it('le plan part de la bascule, sinon de la mise en service', () => {
    expect(debutAmortissement({ dateDebutAmortissement: new Date('2026-09-01'), dateMiseEnService: new Date('2020-01-01') })).toEqual(new Date('2026-09-01'));
    expect(debutAmortissement({ dateDebutAmortissement: null, dateMiseEnService: new Date('2020-01-01') })).toEqual(new Date('2020-01-01'));
  });
  it('exemple du texte · quatre ans à compter du 1er septembre, quatre mois la première année', () => {
    const svc = new ImmobilisationService({} as never, {} as never);
    const calculer = (svc as unknown as { calculerDotation: (...a: unknown[]) => number }).calculerDotation.bind(svc);
    const exercice = { dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31') };
    expect(calculer(12_000_000, 0, 4, new Date('2026-09-01'), [], exercice, 0, 0)).toBeCloseTo(1_000_000, 2);
    // Après une dépréciation passée au test, la valeur nette se répartit sur la durée résiduelle.
    expect(calculer(12_000_000, 0, 4, new Date('2026-09-01'), [], exercice, 0, 2_400_000)).toBeCloseTo(800_000, 2);
  });
});

describe('le service · durée de l’incorporel à la création', () => {
  function monter(numero: string, referentiel = 'SYSCOHADA', systeme = 'NORMAL') {
    const prisma = {
      tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ referentiel, systemeComptableSyscohada: systeme, jeuEtatsFinanciersSycebnl: null }) },
      compte: { findFirst: jest.fn().mockResolvedValue({ numero }) },
    };
    const svc = new ImmobilisationService(prisma as never, {} as never);
    const duree = (dto: Record<string, unknown>) =>
      (svc as unknown as { dureeIncorporel: (t: string, d: unknown) => Promise<unknown> }).dureeIncorporel('t', { compteImmobilisationId: 'c', ...dto });
    return { duree };
  }
  it('fonds commercial sans durée · présumé non limité', async () => {
    await expect(monter('21500000').duree({})).resolves.toEqual({
      dureeNonLimitee: true,
      justification: JUSTIFICATION_PRESUMEE_FONDS_COMMERCIAL,
      fondementDureeDixAns: null,
    });
    await expect(monter('21500000').duree({ dureeAmortissementAns: 7 })).resolves.toMatchObject({ dureeNonLimitee: false });
  });
  it('marque déclarée non limitée, refusée au SYCEBNL et sans justification', async () => {
    await expect(monter('21400000').duree({ dureeNonLimitee: true, justificationDureeNonLimitee: 'Protégée' })).resolves.toMatchObject({ dureeNonLimitee: true, justification: 'Protégée' });
    await expect(monter('21400000').duree({ dureeNonLimitee: true })).rejects.toThrow(BadRequestException);
    await expect(monter('21400000', 'SYCEBNL').duree({ dureeNonLimitee: true, justificationDureeNonLimitee: 'x' })).rejects.toThrow(/SYCEBNL/);
    await expect(monter('21310000').duree({ dureeNonLimitee: true, justificationDureeNonLimitee: 'x' })).rejects.toThrow(/logiciel/);
  });
  it('dix ans · fonds commercial seulement, simplification au SMT', async () => {
    await expect(monter('21500000').duree({ fondementDureeDixAns: 'NON_ESTIMABLE', dureeAmortissementAns: 10 })).resolves.toMatchObject({ fondementDureeDixAns: 'NON_ESTIMABLE' });
    await expect(monter('21500000').duree({ fondementDureeDixAns: 'SIMPLIFICATION_SMT', dureeAmortissementAns: 10 })).rejects.toThrow(/Système minimal/);
    await expect(monter('21500000', 'SYSCOHADA', 'MINIMAL_TRESORERIE').duree({ fondementDureeDixAns: 'SIMPLIFICATION_SMT', dureeAmortissementAns: 10 })).resolves.toMatchObject({ fondementDureeDixAns: 'SIMPLIFICATION_SMT' });
  });
  it('un bien corporel n’est pas touché', async () => {
    await expect(monter('24410000').duree({ dureeAmortissementAns: 5 })).resolves.toMatchObject({ dureeNonLimitee: false });
  });
});
