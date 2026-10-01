import { BadRequestException } from '@nestjs/common';
import { ventilerFondsDeCommerce, ventilerPrixGlobal } from './ventilation-prix-global';
import { amortissementsHorsDotations, detacherPartieRemplacee, type StructureADecomposer } from './partie-remplacee';
import { ImmobilisationService } from './immobilisation.service';
import { PLAN_COMPTES_SYSCOHADA } from '../comptes/compte-seed-syscohada';
import { PLAN_COMPTES_SYCEBNL } from '../comptes/compte-seed';

/**
 * LOT 8 · LA VENTILATION D'UN PRIX GLOBAL ET LE COMPOSANT NON IDENTIFIÉ.
 * AUDCIF art. 38 ; Titre VIII ch. 11 § 1.7.1, ch. 2 § 7.2.1, ch. 4 § 3.1.2
 * et § 4.2. Décisions de Manasse du 2026-10-01 · D-17 (une pièce par bien),
 * D-18 (stocks du fonds en ligne de classe 3), D-19 (partie remplacée
 * détachée à sa valeur d'origine estimée).
 */
const TERRAIN = { numeroCompte: '22110000' };
const BATIMENT = { numeroCompte: '23110000' };

describe('ensemble immobilier · AUDCIF Titre VIII ch. 11 § 1.7.1', () => {
  it("à l'acte · les montants de l'acte, égaux au prix", () => {
    expect(ventilerPrixGlobal({ prix: 100, fondement: 'ACTE', elements: [{ ...TERRAIN, montant: 30 }, { ...BATIMENT, montant: 70 }] })).toEqual({ montants: [30, 70] });
    expect(ventilerPrixGlobal({ prix: 100, fondement: 'ACTE', elements: [{ ...TERRAIN, montant: 30 }, { ...BATIMENT, montant: 69 }] })).toMatchObject({ motif: expect.stringMatching(/égaux/) });
  });

  it('par comparaison · le terrain se valorise, le bâtiment prend la différence', () => {
    expect(
      ventilerPrixGlobal({ prix: 500_000_000, fondement: 'COMPARAISON_TERRAINS_NUS', elements: [{ ...TERRAIN, montant: 120_000_000 }, { ...BATIMENT, parDifference: true }] }),
    ).toEqual({ montants: [120_000_000, 380_000_000] });
    expect(
      ventilerPrixGlobal({ prix: 100, fondement: 'COMPARAISON_TERRAINS_NUS', elements: [{ ...TERRAIN, parDifference: true }, { ...BATIMENT, montant: 60 }] }),
    ).toMatchObject({ motif: expect.stringMatching(/terrain \(22\) se valorise/) });
  });

  it('au coût de reconstruction · le bâtiment se valorise, le terrain prend la différence, et la comparaison passe d’abord', () => {
    const elements = [{ ...TERRAIN, parDifference: true }, { ...BATIMENT, montant: 380 }];
    expect(ventilerPrixGlobal({ prix: 500, fondement: 'COUT_RECONSTRUCTION', elements })).toMatchObject({ motif: expect.stringMatching(/« à défaut »/) });
    expect(ventilerPrixGlobal({ prix: 500, fondement: 'COUT_RECONSTRUCTION', elements, motifSansComparaison: 'Aucune vente de terrain nu dans la commune' })).toEqual({
      montants: [120, 380],
    });
    expect(
      ventilerPrixGlobal({ prix: 500, fondement: 'COUT_RECONSTRUCTION', elements: [{ ...TERRAIN, montant: 120 }, { ...BATIMENT, parDifference: true }], motifSansComparaison: 'x' }),
    ).toMatchObject({ motif: expect.stringMatching(/bâtiment \(23\) se valorise/) });
  });

  it('un terrain avec son bâtiment ne se ventile ni au prorata ni au forfait', () => {
    for (const fondement of ['VALEURS_ATTRIBUABLES', 'PRIX_DE_MARCHE', 'FORFAIT'] as const) {
      expect(ventilerPrixGlobal({ prix: 100, fondement, elements: [{ ...TERRAIN, montant: 30 }, { ...BATIMENT, montant: 70 }] })).toMatchObject({
        motif: expect.stringMatching(/par ordre de priorité/),
      });
    }
  });
});

describe('autres biens · AUDCIF art. 38', () => {
  const MATERIEL = { numeroCompte: '24110000' };
  const MOBILIER = { numeroCompte: '24440000' };
  it('au prorata des valeurs attribuables · le dernier prend le reste au centime, le total reste le prix', () => {
    expect(ventilerPrixGlobal({ prix: 100, fondement: 'VALEURS_ATTRIBUABLES', elements: [{ ...MATERIEL, montant: 1 }, { ...MOBILIER, montant: 1 }, { ...MOBILIER, montant: 1 }] })).toEqual({
      montants: [33.33, 33.33, 33.34],
    });
    expect(ventilerPrixGlobal({ prix: 90, fondement: 'VALEURS_ATTRIBUABLES', elements: [{ ...MATERIEL, montant: 60 }, { ...MOBILIER, montant: 40 }] })).toEqual({ montants: [54, 36] });
  });

  it('au prix de marché · un seul bien par différence, jamais à zéro', () => {
    expect(ventilerPrixGlobal({ prix: 100, fondement: 'PRIX_DE_MARCHE', elements: [{ ...MATERIEL, montant: 70 }, { ...MOBILIER, parDifference: true }] })).toEqual({ montants: [70, 30] });
    expect(ventilerPrixGlobal({ prix: 100, fondement: 'FORFAIT', elements: [{ ...MATERIEL, montant: 100 }, { ...MOBILIER, parDifference: true }] })).toMatchObject({ motif: expect.stringMatching(/aucun coût/) });
    expect(ventilerPrixGlobal({ prix: 100, fondement: 'FORFAIT', elements: [{ ...MATERIEL, parDifference: true }, { ...MOBILIER, parDifference: true }] })).toMatchObject({ motif: expect.stringMatching(/Un seul bien/) });
    expect(ventilerPrixGlobal({ prix: 100, fondement: 'ACTE', elements: [{ ...MATERIEL, montant: 100 }, { ...MOBILIER, parDifference: true }] })).toMatchObject({ motif: expect.stringMatching(/2e tiret/) });
  });

  it('un bien seul ne se ventile pas', () => {
    expect(ventilerPrixGlobal({ prix: 100, fondement: 'ACTE', elements: [{ ...MATERIEL, montant: 100 }] })).toMatchObject({ motif: expect.stringMatching(/au moins deux biens/) });
  });
});

describe('fonds de commerce · AUDCIF Titre VIII ch. 2 § 7.2.1', () => {
  const base = { referentiel: 'SYSCOHADA' as const, prix: 1_000, elements: [{ numeroCompte: '21600000', montant: 200 }, { numeroCompte: '24110000', montant: 300 }], stocks: [{ numeroCompte: '31110000', montant: 150 }] };
  it('le reliquat va au fonds commercial', () => {
    expect(ventilerFondsDeCommerce(base)).toEqual({ fondsCommercial: 350 });
  });
  it('propre au SYSCOHADA, dont le plan ouvre seul le 215 et le 216', () => {
    expect(ventilerFondsDeCommerce({ ...base, referentiel: 'SYCEBNL' })).toMatchObject({ motif: expect.stringMatching(/SYSCOHADA/) });
    const sycebnl = new Set(PLAN_COMPTES_SYCEBNL.map((c) => c.numero));
    const syscohada = new Set(PLAN_COMPTES_SYSCOHADA.map((c) => c.numero));
    expect([sycebnl.has('21500000'), sycebnl.has('21600000')]).toEqual([false, false]);
    expect([syscohada.has('21500000'), syscohada.has('21600000')]).toEqual([true, true]);
  });
  it('le fonds commercial se calcule, ne se saisit pas ; aucun reliquat négatif ; stocks hors 39', () => {
    expect(ventilerFondsDeCommerce({ ...base, elements: [{ numeroCompte: '21500000', montant: 10 }] })).toMatchObject({ motif: expect.stringMatching(/résiduel/) });
    expect(ventilerFondsDeCommerce({ ...base, prix: 600 })).toMatchObject({ motif: expect.stringMatching(/dépassent le prix/) });
    expect(ventilerFondsDeCommerce({ ...base, stocks: [{ numeroCompte: '39100000', montant: 1 }] })).toMatchObject({ motif: expect.stringMatching(/hors dépréciations 39/) });
    expect(ventilerFondsDeCommerce({ ...base, elements: [{ numeroCompte: '60100000', montant: 1 }] })).toMatchObject({ motif: expect.stringMatching(/21 à 24/) });
    expect(ventilerFondsDeCommerce({ ...base, prix: 650 })).toEqual({ fondsCommercial: 0 });
  });
});

describe('partie remplacée · AUDCIF Titre VIII ch. 4 § 4.2 et § 3.1.2', () => {
  // Bâtiment de 150 000 000 sur 30 ans, cinq annuités passées (25 000 000).
  const s: StructureADecomposer = {
    valeurOrigine: 150_000_000,
    valeurResiduelle: 0,
    cumulOuverture: 25_000_000,
    estComposant: false,
    modeLineaire: true,
    cumulDepreciation: 0,
    degressifOuDerogatoire: false,
    financeeParUnFonds: false,
    dotationDejaPassee: false,
    enService: true,
  };
  const o = { valeurEstimee: 30_000_000, methode: 'COUT_ACTUEL_A_NEUF' as const, source: 'Fiche technique du constructeur' };

  it('détache la valeur estimée et ses amortissements au prorata', () => {
    expect(detacherPartieRemplacee(s, o)).toEqual({ valeurPartie: 30_000_000, amortissementsPartie: 5_000_000, avertissement: null });
  });

  it('sur la dépense de renouvellement, admis avec l’avertissement du § 3.1.2', () => {
    expect(detacherPartieRemplacee(s, { ...o, methode: 'DEPENSES_DE_RENOUVELLEMENT' })).toMatchObject({ avertissement: expect.stringMatching(/surévaluée/) });
  });

  it('refus · structure vidée, source absente, composant, et ce qui ne se répartit pas d’office', () => {
    expect(detacherPartieRemplacee(s, { ...o, valeurEstimee: 150_000_000 })).toMatchObject({ motif: expect.stringMatching(/valeur nulle/) });
    expect(detacherPartieRemplacee({ ...s, valeurResiduelle: 10 }, { ...o, valeurEstimee: 149_999_990 })).toMatchObject({ motif: expect.stringMatching(/valeur nulle/) });
    expect(detacherPartieRemplacee(s, { ...o, source: ' ' })).toMatchObject({ motif: expect.stringMatching(/source/) });
    expect(detacherPartieRemplacee({ ...s, estComposant: true }, o)).toMatchObject({ motif: expect.stringMatching(/§ 4.1/) });
    expect(detacherPartieRemplacee({ ...s, modeLineaire: false }, o)).toMatchObject({ motif: expect.stringMatching(/unités d'œuvre/) });
    expect(detacherPartieRemplacee({ ...s, cumulDepreciation: 1 }, o)).toMatchObject({ motif: expect.stringMatching(/dépréciation/) });
    expect(detacherPartieRemplacee({ ...s, degressifOuDerogatoire: true }, o)).toMatchObject({ motif: expect.stringMatching(/dérogatoire/) });
    expect(detacherPartieRemplacee({ ...s, financeeParUnFonds: true }, o)).toMatchObject({ motif: expect.stringMatching(/fonds/) });
    expect(detacherPartieRemplacee({ ...s, dotationDejaPassee: true }, o)).toMatchObject({ motif: expect.stringMatching(/deux fois/) });
    expect(detacherPartieRemplacee({ ...s, enService: false }, o)).toMatchObject({ motif: expect.stringMatching(/sortie/) });
  });

  it('le cumul hors dotations retranche la part détachée', () => {
    expect(amortissementsHorsDotations({ amortissementAnterieur: 0, amortissementsDetaches: 5_000_000 })).toBe(-5_000_000);
    expect(amortissementsHorsDotations({ amortissementAnterieur: 8, amortissementsDetaches: 3 })).toBe(5);
    expect(amortissementsHorsDotations({ amortissementAnterieur: 8 })).toBe(8);
  });
});

describe('le service · prix global, une pièce par bien', () => {
  function monter(referentiel = 'SYSCOHADA', o: { echecAuBien?: number } = {}) {
    const comptes: Record<string, string> = { c22: '22110000', c23: '23110000', c216: '21600000', c241: '24110000', fourn: '48120000', banque: '52110000', stock: '31110000' };
    const prisma = {
      tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ referentiel }) },
      compte: {
        findFirst: jest.fn(({ where }: { where: { id?: string; numero?: string } }) => {
          if (where.numero === '21500000') return Promise.resolve({ id: 'c215' });
          return Promise.resolve(where.id && comptes[where.id] ? { id: where.id, numero: comptes[where.id] } : null);
        }),
      },
      immobilisation: { delete: jest.fn().mockResolvedValue({}) },
      ligneEcriture: { deleteMany: jest.fn().mockResolvedValue({}) },
      ecriture: { delete: jest.fn().mockResolvedValue({}) },
    };
    const svc = new ImmobilisationService(prisma as never, {} as never);
    let n = 0;
    const creer = jest.spyOn(svc, 'creer').mockImplementation(() => {
      n += 1;
      if (o.echecAuBien === n) return Promise.reject(new BadRequestException('refus propre au bien'));
      return Promise.resolve({ id: `b${n}`, ecritureAcquisitionId: `e${n}` } as never);
    });
    return { svc, creer, prisma };
  }
  const ensemble = {
    exerciceId: 'ex',
    journalId: 'od',
    dateAcquisition: '2026-03-01',
    referenceActe: 'Acte 4/2026',
    compteContrepartieId: 'fourn',
    prix: 500,
    nature: 'ENSEMBLE' as const,
    fondement: 'COMPARAISON_TERRAINS_NUS' as const,
    sourceValeurs: 'Vente de la parcelle 12, mars 2026',
    biens: [
      { compteImmobilisationId: 'c22', designation: 'Terrain', montant: 120 },
      { compteImmobilisationId: 'c23', designation: 'Bâtiment', parDifference: true, dureeAmortissementAns: 30 },
    ],
  };

  it('chaque bien à son montant, la modalité gardée sur chaque fiche', async () => {
    const { svc, creer } = monter();
    const r = await svc.acquerirAPrixGlobal('t', 'u', ensemble);
    expect(creer.mock.calls.map((c) => c[2].valeurOrigine)).toEqual([120, 380]);
    expect(creer.mock.calls[1][2]).toMatchObject({ compteContrepartieId: 'fourn', dureeAmortissementAns: 30 });
    expect(creer.mock.calls[0][3]).toMatchObject({ libelle: 'Prix global Acte 4/2026 · Terrain', modaliteVentilation: expect.stringMatching(/comparaison.*Vente de la parcelle 12/) });
    expect(r.biens.map((b) => b.montant)).toEqual([120, 380]);
  });

  it('hors acte, la source des valeurs est exigée', async () => {
    const { svc, creer } = monter();
    await expect(svc.acquerirAPrixGlobal('t', 'u', { ...ensemble, sourceValeurs: '' })).rejects.toThrow(/Notes annexes/);
    expect(creer).not.toHaveBeenCalled();
  });

  it('un bien refusé · les fiches déjà créées et leurs écritures sont retirées', async () => {
    const { svc, prisma } = monter('SYSCOHADA', { echecAuBien: 2 });
    await expect(svc.acquerirAPrixGlobal('t', 'u', ensemble)).rejects.toThrow('refus propre au bien');
    expect(prisma.immobilisation.delete).toHaveBeenCalledWith({ where: { id: 'b1' } });
    expect(prisma.ecriture.delete).toHaveBeenCalledWith({ where: { id: 'e1' } });
  });

  it('fonds de commerce · le 215 prend le reste et porte les stocks au débit (D-18)', async () => {
    const { svc, creer } = monter();
    const r = await svc.acquerirAPrixGlobal('t', 'u', {
      ...ensemble,
      prix: 1_000,
      nature: 'FONDS_DE_COMMERCE',
      fondement: undefined,
      // Un 4812 ne finance pas le droit au bail (incorporel, 4811) · le prix
      // d'un fonds qui mêle les deux se règle par la trésorerie.
      compteContrepartieId: 'banque',
      biens: [
        { compteImmobilisationId: 'c216', designation: 'Droit au bail', montant: 200, dureeAmortissementAns: 9 },
        { compteImmobilisationId: 'c241', designation: 'Matériel', montant: 300, dureeAmortissementAns: 5 },
      ],
      stocks: [{ compteId: 'stock', montant: 150 }],
      dureeFondsCommercialAns: 10,
    });
    expect(creer.mock.calls.map((c) => c[2].valeurOrigine)).toEqual([200, 300, 350]);
    expect(creer.mock.calls[2][2]).toMatchObject({ compteImmobilisationId: 'c215', dureeAmortissementAns: 10 });
    expect(creer.mock.calls[2][2]).not.toHaveProperty('compteContrepartieId');
    expect(creer.mock.calls[2][3]).toMatchObject({
      lignesCredit: [
        { compteId: 'banque', montant: 500 },
        { compteId: 'stock', montant: -150 },
      ],
    });
    expect(creer.mock.calls[0][3]).not.toHaveProperty('lignesCredit');
    expect(r.stocks).toBe(150);
  });

  it('fonds commercial sans durée · créé sans durée, présumé non limité par la fiche (lot 10)', async () => {
    const { svc, creer } = monter();
    await svc.acquerirAPrixGlobal('t', 'u', {
      ...ensemble,
      prix: 1_000,
      nature: 'FONDS_DE_COMMERCE',
      fondement: undefined,
      compteContrepartieId: 'banque',
      biens: [{ compteImmobilisationId: 'c241', designation: 'Matériel', montant: 300, dureeAmortissementAns: 5 }],
    });
    expect(creer.mock.calls[1][2]).toMatchObject({ compteImmobilisationId: 'c215', valeurOrigine: 700 });
    expect(creer.mock.calls[1][2].dureeAmortissementAns).toBeUndefined();
  });
});

describe('le service · remplacement imprévu (D-19)', () => {
  function monter(o: { renouvelerEchoue?: boolean; dotationPassee?: boolean; fonds?: boolean; enCours?: 'non-achevé' | 'achevé' } = {}) {
    const structure = {
      id: 's',
      tenantId: 't',
      familleId: 'f',
      lieuId: null,
      designation: 'Bâtiment administratif',
      compteImmobilisationId: 'c23',
      compteAmortissementId: 'c283',
      compteDotationId: 'c681',
      dateAcquisition: new Date('2021-01-02'),
      dateMiseEnService: o.enCours === 'non-achevé' ? null : new Date('2021-01-02'),
      compteEnCoursId: o.enCours ? 'c239' : null,
      natureFiscaleCle: null,
      valeurOrigine: 150_000_000,
      valeurResiduelle: 0,
      dureeAmortissementAns: 30,
      amortissementAnterieur: 0,
      amortissementsDetaches: 0,
      modeAmortissement: 'LINEAIRE',
      statut: 'EN_SERVICE',
      degressifFiscal: false,
      immobilisationPrincipaleId: null,
      // Cinq annuités de 5 000 000, 2021 à 2025.
      dotations: [2021, 2022, 2023, 2024, 2025, ...(o.dotationPassee ? [2026] : [])].map((a) => ({
        montant: 5_000_000,
        exercice: { dateDebut: new Date(`${a}-01-01`) },
      })),
      depreciations: [],
      derogatoires: [],
      compteImmobilisation: { numero: '23110000', intitule: 'Bâtiments administratifs' },
      ecritureAcquisition: { lignes: [{ credit: 150_000_000, compte: { numero: o.fonds ? '14100000' : '48120000' } }] },
      _count: { subventions: 0 },
    };
    const tx = {
      immobilisation: {
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({ id: 'p' }),
        delete: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      immobilisation: { findFirst: jest.fn().mockResolvedValue(structure) },
      tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ referentiel: 'SYSCOHADA' }) },
      exercice: { findFirst: jest.fn().mockResolvedValue({ dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31') }) },
      $transaction: jest.fn((fn: (t: unknown) => unknown) => fn(tx)),
    };
    const svc = new ImmobilisationService(prisma as never, {} as never);
    const renouveler = jest
      .spyOn(svc, 'renouveler')
      .mockImplementation(() => (o.renouvelerEchoue ? Promise.reject(new BadRequestException('remplaçant refusé')) : Promise.resolve({ id: 'r' } as never)));
    return { svc, tx, renouveler };
  }
  const dto = {
    dateRenouvellement: '2026-06-30',
    exerciceId: 'ex',
    journalId: 'od',
    designation: 'Ascenseur neuf',
    coutRenouvellement: 40_000_000,
    compteContrepartieId: 'fourn',
    dureeAmortissementAns: 10,
    designationPartie: 'Ascenseur d’origine',
    valeurOrigineEstimee: 30_000_000,
    methodeEstimation: 'COUT_ACTUEL_A_NEUF' as const,
    sourceEstimation: 'Fiche technique',
    justificationDecomposition: 'Ascenseur à durée distincte de la structure',
  };

  it('détache la partie de la structure, puis la renouvelle', async () => {
    const { svc, tx, renouveler } = monter();
    const r = await svc.remplacerPartieNonIdentifiee('t', 'u', 's', dto);
    expect(tx.immobilisation.update).toHaveBeenCalledWith({
      where: { id: 's' },
      data: { valeurOrigine: { decrement: 30_000_000 }, amortissementsDetaches: { increment: 5_000_000 } },
    });
    expect(tx.immobilisation.create.mock.calls[0][0].data).toMatchObject({
      valeurOrigine: 30_000_000,
      amortissementAnterieur: 5_000_000,
      immobilisationPrincipaleId: 's',
      compteImmobilisationId: 'c23',
      dureeAmortissementAns: 30,
      methodeEstimationPartie: 'COUT_ACTUEL_A_NEUF',
      sourceEstimationPartie: 'Fiche technique',
    });
    expect(renouveler).toHaveBeenCalledWith('t', 'u', 'p', dto);
    expect(r.partie).toEqual({ id: 'p', valeurOrigine: 30_000_000, amortissements: 5_000_000 });
  });

  it('le renouvellement refusé défait le détachement', async () => {
    const { svc, tx } = monter({ renouvelerEchoue: true });
    await expect(svc.remplacerPartieNonIdentifiee('t', 'u', 's', dto)).rejects.toThrow('remplaçant refusé');
    expect(tx.immobilisation.delete).toHaveBeenCalledWith({ where: { id: 'p' } });
    expect(tx.immobilisation.update).toHaveBeenLastCalledWith({
      where: { id: 's' },
      data: { valeurOrigine: { increment: 30_000_000 }, amortissementsDetaches: { decrement: 5_000_000 } },
    });
  });

  it('structure encore inscrite en cours · refusée avant tout détachement ; achevée, la partie garde l’historique de son en-cours', async () => {
    const encore = monter({ enCours: 'non-achevé' });
    await expect(encore.svc.remplacerPartieNonIdentifiee('t', 'u', 's', dto)).rejects.toThrow(/encore inscrit en cours/);
    expect(encore.tx.immobilisation.update).not.toHaveBeenCalled();
    expect(encore.renouveler).not.toHaveBeenCalled();
    // Achevée depuis 2021 · la partie détachée garde le 239 où la structure a
    // été inscrite, et sa sortie se lit au compte où elle se trouve à la date
    // (compteInscritALaDate) · le 231 aujourd'hui, le 239 avant 2021.
    const acheve = monter({ enCours: 'achevé' });
    await acheve.svc.remplacerPartieNonIdentifiee('t', 'u', 's', dto);
    expect(acheve.tx.immobilisation.create.mock.calls[0][0].data).toMatchObject({ compteEnCoursId: 'c239', dateMiseEnService: new Date('2021-01-02') });
  });

  it('refus avant tout détachement · dotation de l’exercice passée, structure financée par un fonds', async () => {
    for (const o of [{ dotationPassee: true }, { fonds: true }]) {
      const { svc, tx, renouveler } = monter(o);
      await expect(svc.remplacerPartieNonIdentifiee('t', 'u', 's', dto)).rejects.toThrow(BadRequestException);
      expect(tx.immobilisation.update).not.toHaveBeenCalled();
      expect(renouveler).not.toHaveBeenCalled();
    }
  });
});
