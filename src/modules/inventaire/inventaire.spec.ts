import { DecisionEcartInventaire, Referentiel, RoleMembreInventaire, StatutCampagneInventaire } from '@prisma/client';
import { InventaireService } from './inventaire.service';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';

/**
 * INVENTAIRE PHYSIQUE · CE QUI CASSERAIT EN SILENCE.
 *
 * Trois défauts possibles ici s'équilibrent parfaitement, bouclent la balance,
 * et ne se voient nulle part en aval :
 *
 *  1. COMPTABILISER UN EXCÉDENT. L'écriture est équilibrée, la balance boucle,
 *     et le résultat porte une plus-value latente que l'AUDCIF art. 43
 *     interdit d'inscrire (« si la valeur d'inventaire est supérieure à la
 *     valeur d'entrée, cette dernière est MAINTENUE dans les comptes »).
 *  2. RAPPROCHER SUR DES FICHES NON VALORISÉES. Une valeur absente lue comme
 *     zéro transforme « pas encore compté » en « manquant total », et le
 *     manquant est à la charge de l'entité.
 *  3. RELIRE LE SOLDE APRÈS COUP. L'écart se refermerait tout seul dès la
 *     première écriture de redressement, et l'arbitrage porterait sur un
 *     chiffre que personne n'a vu.
 *
 * Et un quatrième, qui ne casse rien mais rend le document sans valeur : un PV
 * signé des seuls comptables, ou un écart classé sans dire qui en répond.
 */

const EXERCICE = {
  id: 'ex1',
  tenantId: 't1',
  dateDebut: new Date('2026-01-01'),
  dateFin: new Date('2026-12-31'),
  statut: 'OUVERT',
};

type Etat = {
  campagne?: Record<string, unknown>;
  fiches?: Record<string, unknown>[];
  ecarts?: Record<string, unknown>[];
  membres?: { role: RoleMembreInventaire }[];
  balance?: { compteId: string; solde: number }[];
  exercice?: Record<string, unknown>;
};

function service(etat: Etat = {}) {
  const maj = jest.fn().mockImplementation((a) => Promise.resolve({ ...(etat.campagne ?? {}), ...a.data }));
  const creerEcart = jest.fn().mockImplementation((a) => Promise.resolve(a.data));
  const majEcart = jest.fn().mockImplementation((a) => Promise.resolve({ ...a.data, id: a.where.id }));
  const prisma = {
    exercice: { findFirst: jest.fn().mockResolvedValue(etat.exercice ?? EXERCICE) },
    tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ referentiel: Referentiel.SYCEBNL }) },
    compte: { findFirst: jest.fn().mockResolvedValue({ id: 'c1', numero: '31100000', typeCompte: 'DETAIL' }) },
    campagneInventaire: {
      findFirst: jest.fn().mockResolvedValue(etat.campagne ?? null),
      create: jest.fn().mockImplementation((a) => Promise.resolve({ id: 'camp1', ...a.data })),
      update: maj,
    },
    ficheInventaire: {
      findMany: jest.fn().mockResolvedValue(etat.fiches ?? []),
      findFirst: jest.fn().mockResolvedValue(null),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    ecartInventaire: {
      findFirst: jest.fn().mockResolvedValue(etat.ecarts?.[0] ?? null),
      findMany: jest.fn().mockResolvedValue(etat.ecarts ?? []),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: creerEcart,
      update: majEcart,
      count: jest.fn().mockResolvedValue((etat.ecarts ?? []).filter((e) => !e.decision).length),
    },
    membreSousCommission: { findMany: jest.fn().mockResolvedValue(etat.membres ?? []) },
    $transaction: jest.fn().mockImplementation((ops: unknown[]) => Promise.all(ops)),
  } as unknown as PrismaService;
  const ecritures = {
    balance: jest.fn().mockResolvedValue({ lignes: etat.balance ?? [], totaux: { debit: 0, credit: 0 } }),
  } as unknown as EcritureService;
  return { svc: new InventaireService(prisma, ecritures), prisma, creerEcart, maj, majEcart };
}

const campagne = (statut: StatutCampagneInventaire) => ({
  id: 'camp1',
  tenantId: 't1',
  exerciceId: 'ex1',
  statut,
});

const fiche = (compteId: string, valeur: number | null) => ({
  id: `f-${compteId}-${valeur}`,
  tenantId: 't1',
  campagneId: 'camp1',
  compteId,
  valeurInventaire: valeur,
  compte: { numero: '31100000', intitule: 'Marchandises' },
});

// ---------------------------------------------------------------------------
// Le chemin pénal · deux textes, jamais servis l'un pour l'autre
// ---------------------------------------------------------------------------

describe('la sanction citée est celle du référentiel du dossier', () => {
  it('SYSCOHADA · AUDCIF art. 111', () => {
    const s = InventaireService.sanctionApplicable(Referentiel.SYSCOHADA);
    expect(s.texte).toBe('AUDCIF');
    expect(s.article).toContain('art. 111');
  });

  it('SYCEBNL · art. 24, parce que l’art. 3 écarte les articles 73 à 113', () => {
    const s = InventaireService.sanctionApplicable(Referentiel.SYCEBNL);
    expect(s.texte).toBe('Acte uniforme SYCEBNL');
    expect(s.article).toContain('art. 24');
  });

  it('aucun des deux ne cite l’article de l’autre', () => {
    const sys = InventaireService.sanctionApplicable(Referentiel.SYSCOHADA);
    const ebnl = InventaireService.sanctionApplicable(Referentiel.SYCEBNL);
    expect(sys.article).not.toContain('art. 24');
    expect(ebnl.article).not.toContain('art. 111');
    expect(ebnl.texte).not.toBe(sys.texte);
  });
});

// ---------------------------------------------------------------------------
// Étape 4 · le rapprochement
// ---------------------------------------------------------------------------

describe('rapprochement · étape 4, la comparaison avec la balance provisoire', () => {
  it('agrège les fiches PAR COMPTE, pas fiche à fiche', async () => {
    const { svc, creerEcart } = service({
      campagne: campagne(StatutCampagneInventaire.RECENSEMENT),
      fiches: [fiche('c1', 400), fiche('c1', 350), fiche('c2', 100)],
      balance: [
        { compteId: 'c1', solde: 800 },
        { compteId: 'c2', solde: 100 },
      ],
      ecarts: [],
    });
    await svc.rapprocher('t1', 'camp1');
    const ecrits = creerEcart.mock.calls.map((c) => c[0].data);
    expect(ecrits).toHaveLength(2);
    const c1 = ecrits.find((e) => e.compteId === 'c1')!;
    // 750 comptés contre 800 en comptabilité · un seul écart de 50, pas deux.
    expect(c1).toMatchObject({ valeurInventaire: 750, soldeComptable: 800, ecart: -50, nombreFiches: 2 });
    expect(ecrits.find((e) => e.compteId === 'c2')).toMatchObject({ ecart: 0, nombreFiches: 1 });
  });

  it('REFUSE de rapprocher tant qu’une fiche n’est pas valorisée', async () => {
    const { svc } = service({
      campagne: campagne(StatutCampagneInventaire.RECENSEMENT),
      fiches: [fiche('c1', 400), fiche('c1', null)],
      balance: [{ compteId: 'c1', solde: 400 }],
    });
    // Traitée comme zéro, la seconde fiche produirait un manquant de 0 ici,
    // mais un manquant PLEIN dès que le solde dépasse la seule fiche servie.
    await expect(svc.rapprocher('t1', 'camp1')).rejects.toThrow(/sans valeur d'inventaire/);
  });

  it('prend la balance BROUILLARD COMPRIS · c’est celle que le comptable a sous les yeux', async () => {
    const ecritures = {
      balance: jest.fn().mockResolvedValue({ lignes: [{ compteId: 'c1', solde: 100 }], totaux: { debit: 0, credit: 0 } }),
    } as unknown as EcritureService;
    const { svc } = service({
      campagne: campagne(StatutCampagneInventaire.RECENSEMENT),
      fiches: [fiche('c1', 100)],
      balance: [{ compteId: 'c1', solde: 100 }],
    });
    Object.assign(svc as unknown as Record<string, unknown>, { ecritures });
    await svc.rapprocher('t1', 'camp1');
    // Exclure le brouillard fabriquerait des écarts que la validation du
    // lendemain effacerait · le troisième argument doit rester `true`.
    expect((ecritures.balance as jest.Mock).mock.calls[0]).toEqual(['t1', 'ex1', true]);
  });

  it('compare à la VALEUR ABSOLUE du solde · un compte de passif est créditeur', async () => {
    const { svc, creerEcart } = service({
      campagne: campagne(StatutCampagneInventaire.RECENSEMENT),
      fiches: [fiche('c1', 500)],
      balance: [{ compteId: 'c1', solde: -500 }],
    });
    await svc.rapprocher('t1', 'camp1');
    // Sans la valeur absolue, l'écart vaudrait 1000 et le compte entier
    // passerait pour un excédent.
    expect(creerEcart.mock.calls[0][0].data.ecart).toBe(0);
  });

  it('ne rapproche plus une campagne déjà en arbitrage · le solde est figé', async () => {
    const { svc } = service({ campagne: campagne(StatutCampagneInventaire.ARBITRAGE) });
    await expect(svc.rapprocher('t1', 'camp1')).rejects.toThrow(/ARBITRAGE/);
  });
});

// ---------------------------------------------------------------------------
// Étape 5 · l'arbitrage, et l'asymétrie de l'article 43
// ---------------------------------------------------------------------------

const ecartArbitrable = (montant: number) => ({
  id: 'e1',
  tenantId: 't1',
  ecart: montant,
  decision: null,
  campagne: campagne(StatutCampagneInventaire.ARBITRAGE),
  compte: { numero: '31100000', intitule: 'Marchandises' },
});

describe('arbitrage · l’asymétrie de l’AUDCIF art. 43', () => {
  it('REFUSE de redresser un excédent, et cite l’article', async () => {
    const { svc } = service({ ecarts: [ecartArbitrable(1200)] });
    await expect(
      svc.arbitrer('t1', 'e1', 'u1', { decision: DecisionEcartInventaire.A_REDRESSER, responsable: 'Magasinier' }),
    ).rejects.toThrow(/art\. 43/);
  });

  it('REFUSE de classer un manquant en excédent non comptabilisé', async () => {
    const { svc } = service({ ecarts: [ecartArbitrable(-800)] });
    await expect(
      svc.arbitrer('t1', 'e1', 'u1', {
        decision: DecisionEcartInventaire.EXCEDENT_NON_COMPTABILISE,
        explication: 'Rien à laisser au bilan',
      }),
    ).rejects.toThrow(/MANQUANT/);
  });

  it('exige le RESPONSABLE d’un écart négatif · CPCC étape 5', async () => {
    const { svc } = service({ ecarts: [ecartArbitrable(-800)] });
    await expect(
      svc.arbitrer('t1', 'e1', 'u1', { decision: DecisionEcartInventaire.A_REDRESSER }),
    ).rejects.toThrow(/responsable/);
  });

  it('exige l’EXPLICATION d’un écart non redressé · sinon il est effacé, pas arbitré', async () => {
    const { svc } = service({ ecarts: [ecartArbitrable(1200)] });
    await expect(
      svc.arbitrer('t1', 'e1', 'u1', { decision: DecisionEcartInventaire.EXCEDENT_NON_COMPTABILISE }),
    ).rejects.toThrow(/explication/);
  });

  it('accepte un manquant motivé et nomme son responsable', async () => {
    const { svc, majEcart } = service({ ecarts: [ecartArbitrable(-800)] });
    await svc.arbitrer('t1', 'e1', 'u1', {
      decision: DecisionEcartInventaire.A_REDRESSER,
      responsable: 'Magasinier central',
    });
    expect(majEcart.mock.calls[0][0].data).toMatchObject({
      decision: DecisionEcartInventaire.A_REDRESSER,
      responsable: 'Magasinier central',
      arbitrePar: 'u1',
    });
  });
});

// ---------------------------------------------------------------------------
// Étape 6 · ce que le module propose, et ce qu'il refuse de proposer
// ---------------------------------------------------------------------------

describe('proposition de redressement · elle s’arrête où le texte s’arrête', () => {
  it('ne propose RIEN sur un excédent · art. 43', async () => {
    const { svc } = service({ ecarts: [{ ...ecartArbitrable(1200), decision: DecisionEcartInventaire.EXCEDENT_NON_COMPTABILISE }] });
    const p = await svc.propositionRedressement('t1', 'e1');
    expect(p.proposable).toBe(false);
    expect((p as { motif: string }).motif).toContain('art. 43');
  });

  it('ne propose rien avant la décision de la sous-commission', async () => {
    const { svc } = service({ ecarts: [ecartArbitrable(-800)] });
    const p = await svc.propositionRedressement('t1', 'e1');
    expect(p.proposable).toBe(false);
  });

  it('propose un manquant arbitré, contrepartie LAISSÉE VIDE', async () => {
    const { svc } = service({
      ecarts: [{ ...ecartArbitrable(-800), decision: DecisionEcartInventaire.A_REDRESSER, responsable: 'Magasinier' }],
    });
    const p = await svc.propositionRedressement('t1', 'e1');
    expect(p.proposable).toBe(true);
    const lignes = (p as { lignes: { compte: string | null; sens: string; montant: number }[] }).lignes;
    // Le référentiel ne dit NULLE PART quel compte de charge reçoit un
    // manquant · le choisir à la place du comptable serait inventer une règle.
    expect(lignes.find((l) => l.sens === 'DEBIT')!.compte).toBeNull();
    expect(lignes.find((l) => l.sens === 'CREDIT')).toMatchObject({ compte: '31100000', montant: 800 });
  });
});

// ---------------------------------------------------------------------------
// Le PV et la clôture
// ---------------------------------------------------------------------------

describe('procès-verbal · les deux listes de signataires', () => {
  it('REFUSE un PV sans témoin', async () => {
    const { svc } = service({
      campagne: campagne(StatutCampagneInventaire.RECENSEMENT),
      membres: [{ role: RoleMembreInventaire.INVENTORIANT }],
    });
    await expect(svc.etablirProcesVerbal('t1', 'camp1', 'u1', {})).rejects.toThrow(/témoin/);
  });

  it('REFUSE un PV sans inventoriant · signé par ceux qui n’ont rien compté', async () => {
    const { svc } = service({
      campagne: campagne(StatutCampagneInventaire.RECENSEMENT),
      membres: [{ role: RoleMembreInventaire.TEMOIN }],
    });
    await expect(svc.etablirProcesVerbal('t1', 'camp1', 'u1', {})).rejects.toThrow(/inventoriant/);
  });

  it('établit le PV quand les deux rôles sont là', async () => {
    const { svc, maj } = service({
      campagne: campagne(StatutCampagneInventaire.RECENSEMENT),
      membres: [{ role: RoleMembreInventaire.TEMOIN }, { role: RoleMembreInventaire.INVENTORIANT }],
    });
    await svc.etablirProcesVerbal('t1', 'camp1', 'u1', {});
    expect(maj.mock.calls[0][0].data.procesVerbalPar).toBe('u1');
  });
});

describe('clôture · aucun écart ne se perd', () => {
  it('REFUSE de clore tant qu’un écart n’a pas de décision', async () => {
    const { svc } = service({
      campagne: campagne(StatutCampagneInventaire.ARBITRAGE),
      ecarts: [{ id: 'e1', decision: null }],
    });
    await expect(svc.clore('t1', 'camp1', 'u1')).rejects.toThrow(/sans décision/);
  });

  it('clôt quand tout est arbitré', async () => {
    const { svc, maj } = service({
      campagne: campagne(StatutCampagneInventaire.ARBITRAGE),
      ecarts: [{ id: 'e1', decision: DecisionEcartInventaire.A_REDRESSER }],
    });
    await svc.clore('t1', 'camp1', 'u1');
    expect(maj.mock.calls[0][0].data.statut).toBe(StatutCampagneInventaire.CLOTUREE);
  });
});

// ---------------------------------------------------------------------------
// La campagne elle-même
// ---------------------------------------------------------------------------

describe('ouverture d’une campagne', () => {
  it('REFUSE un exercice clos · l’inventaire précède les écritures d’inventaire', async () => {
    const { svc } = service({ exercice: { ...EXERCICE, statut: 'CLOTURE' } });
    await expect(
      svc.creer('t1', 'u1', { exerciceId: 'ex1', dateInventaire: '2026-12-31', libelle: 'Inventaire 2026' }),
    ).rejects.toThrow(/clos/);
  });

  it('REFUSE une date antérieure à l’ouverture de l’exercice', async () => {
    const { svc } = service();
    await expect(
      svc.creer('t1', 'u1', { exerciceId: 'ex1', dateInventaire: '2025-12-15', libelle: 'Inventaire' }),
    ).rejects.toThrow(/antérieure/);
  });
});

// ---------------------------------------------------------------------------
// Le résumé de l'opération d'inventaire
// ---------------------------------------------------------------------------

describe('résumé pour le livre d’inventaire · AUDCIF art. 19 et SYCEBNL art. 14', () => {
  it('sépare manquants et excédents, et compte ce qui reste sans décision', async () => {
    const campagnes = [
      {
        id: 'camp1',
        libelle: 'Inventaire 2026',
        dateInventaire: new Date('2026-12-31'),
        statut: StatutCampagneInventaire.ARBITRAGE,
        procesVerbalEtabliLe: null,
        _count: { fiches: 12 },
        ecarts: [
          { ecart: -500, decision: DecisionEcartInventaire.A_REDRESSER, compte: { numero: '311', intitule: 'M' } },
          { ecart: 200, decision: null, compte: { numero: '571', intitule: 'C' } },
          { ecart: 0, decision: DecisionEcartInventaire.EXPLIQUE, compte: { numero: '245', intitule: 'V' } },
        ],
      },
    ];
    const prisma = {
      campagneInventaire: { findMany: jest.fn().mockResolvedValue(campagnes) },
    } as unknown as PrismaService;
    const svc = new InventaireService(prisma, {} as unknown as EcritureService);
    const [r] = await svc.resumePourLivreInventaire('t1', 'ex1');
    expect(r).toMatchObject({
      fiches: 12,
      comptesRapproches: 3,
      manquants: 1,
      excedents: 1,
      sansEcart: 1,
      totalManquants: -500,
      totalExcedents: 200,
      ecartsSansDecision: 1,
    });
  });
});
