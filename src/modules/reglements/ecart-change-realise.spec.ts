import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  comptesPrescrits,
  coutHistoriqueRegle,
  ecartDuGroupe,
  ecartSigne,
  lignesDuReglementEnDevise,
  lignesEcartDuGroupe,
  motifRefusCompteEcart,
  natureDuCompte,
  MOTIF_SYCEBNL_SANS_COMPTE,
  motifRefusTresorerieEnDevise,
  racinesAdmises,
  compteAdmisPourEcart,
  libelleEcartRealise,
  coursEtFrancsDuReglement,
} from './ecart-change-realise';
import { ReglementsService } from './reglements.service';
import * as reevaluationModule from './reevaluation-et-ecart-realise';
import type { OrdresVirementService } from './ordres-virement.service';
import type { PrismaService } from '../../common/prisma.service';
import type { EcritureService } from '../comptabilite/ecriture.service';
import type { LettrageService } from '../lettrage/lettrage.service';
import { PLAN_COMPTES_SYSCOHADA } from '../comptes/compte-seed-syscohada';
import { PLAN_COMPTES_SYCEBNL } from '../comptes/compte-seed';

/**
 * ÉCART DE CHANGE RÉALISÉ AU RÈGLEMENT (ligne A6, relevé CPCC C2). Ce qui
 * casserait en silence · un règlement en devise refusé parce que le cours a
 * monté (le dû en francs était dépassé), ou passé sans son écart, le tiers
 * restant ouvert de la différence ; une perte commerciale portée en résultat
 * financier ; au SYCEBNL, un 656 qui n'existe pas, ou le 676 réservé au
 * change financier.
 *
 * LE JEU D'ESSAI est l'exemple MBIKAYI / NZUZI du séminaire CPCC (témoin,
 * jamais source), ERREUR DE TVA CORRIGÉE · le support écrit « TVA 268 000 »
 * pour 16 % de 1 680 000, qui font 268 800 ; son TTC de 1 948 800 était juste,
 * et c'est 1 160 USD au cours de 1 680.
 */

// Jeu d'essai · facture de 1 000 USD HT, TVA 16 %, au cours de 1 680.
const COURS_FACTURE = 1680;
const HT_FRANCS = 1000 * COURS_FACTURE; // 1 680 000
const TVA_FRANCS = Math.round(HT_FRANCS * 0.16 * 100) / 100;
const TTC_USD = 1160;
const TTC_FRANCS = HT_FRANCS + TVA_FRANCS;

describe('le jeu d’essai du séminaire, TVA corrigée', () => {
  it('16 % de 1 680 000 font 268 800, et le TTC est 1 160 USD au cours de 1 680', () => {
    expect(TVA_FRANCS).toBe(268800);
    expect(TTC_FRANCS).toBe(1948800);
    expect(TTC_USD * COURS_FACTURE).toBe(TTC_FRANCS);
  });
});

describe('les comptes que le texte donne', () => {
  it('SYSCOHADA · 656 et 756 pour le commercial, 676 et 776 pour le financier', () => {
    expect(comptesPrescrits('SYSCOHADA', 'COMMERCIALE')).toEqual({ perte: '65600000', gain: '75600000' });
    expect(comptesPrescrits('SYSCOHADA', 'FINANCIERE')).toEqual({ perte: '67600000', gain: '77600000' });
  });

  it('SYCEBNL · 676 et 776 pour le financier, AUCUN compte pour le commercial', () => {
    expect(comptesPrescrits('SYCEBNL', 'FINANCIERE')).toEqual({ perte: '67600000', gain: '77600000' });
    const commercial = comptesPrescrits('SYCEBNL', 'COMMERCIALE');
    expect(commercial.perte).toBeNull();
    expect('motif' in commercial && commercial.motif).toBe(MOTIF_SYCEBNL_SANS_COMPTE);
  });

  it('la nature se lit sur le compte · 40 et 41 commerciaux, emprunts et prêts financiers, le reste au cabinet', () => {
    for (const r of ['SYSCOHADA', 'SYCEBNL'] as const) {
      expect(natureDuCompte('40110000', r)).toBe('COMMERCIALE');
      expect(natureDuCompte('41110000', r)).toBe('COMMERCIALE');
      expect(natureDuCompte('27100000', r)).toBe('FINANCIERE');
      expect(natureDuCompte('47100000', r)).toBeNull();
    }
    expect(natureDuCompte('16200000', 'SYSCOHADA')).toBe('FINANCIERE');
    expect(natureDuCompte('18200000', 'SYCEBNL')).toBe('FINANCIERE');
  });

  // UN NUMÉRO, DEUX PLANS · le 16 du SYCEBNL est « FONDS AFFECTÉS », ses
  // emprunts sont au 18 ; le 18 du SYSCOHADA porte les comptes de liaison.
  // Lu en emprunt, un fonds de projet aurait mis son écart au 676.
  it('le 16 du SYCEBNL est un fonds, le 18 du SYSCOHADA une liaison · ni l’un ni l’autre n’est un emprunt', () => {
    expect(natureDuCompte('16200000', 'SYCEBNL')).toBeNull();
    expect(natureDuCompte('18400000', 'SYSCOHADA')).toBeNull();
    const sycebnl = new Map(PLAN_COMPTES_SYCEBNL.map((c) => [c.numero, c.intitule]));
    expect(sycebnl.get('16')).toMatch(/fonds affect/i);
    expect(sycebnl.get('18')).toMatch(/emprunts/i);
    const syscohada = new Map(PLAN_COMPTES_SYSCOHADA.map((c) => [c.numero, c.intitule]));
    expect(syscohada.get('16')).toMatch(/emprunts/i);
  });

  // Un numéro, deux plans · ce qu'on affirme du plan se vérifie contre les
  // DEUX semis (F2b).
  it('les deux semis · le SYSCOHADA ouvre 656, 756, 676, 776 ; le SYCEBNL 676 et 776 seulement', () => {
    const syscohada = new Set(PLAN_COMPTES_SYSCOHADA.map((c) => c.numero));
    const sycebnl = new Set(PLAN_COMPTES_SYCEBNL.map((c) => c.numero));
    for (const n of ['65600000', '75600000', '67600000', '77600000']) expect(syscohada.has(n)).toBe(true);
    for (const n of ['67600000', '77600000']) expect(sycebnl.has(n)).toBe(true);
    for (const n of ['656', '65600000', '756', '75600000']) expect(sycebnl.has(n)).toBe(false);
    expect([...sycebnl].some((n) => n.startsWith('656') || n.startsWith('756'))).toBe(false);
  });

  it('le compte choisi au SYCEBNL · sous le 65 ou le 75, jamais 676, 776, 659 ou 759', () => {
    const p = { referentiel: 'SYCEBNL' as const, nature: 'COMMERCIALE' as const };
    expect(motifRefusCompteEcart({ ...p, ecart: 'PERTE', numero: '65800000' })).toBeNull();
    expect(motifRefusCompteEcart({ ...p, ecart: 'GAIN', numero: '75880000' })).toBeNull();
    expect(motifRefusCompteEcart({ ...p, ecart: 'PERTE', numero: '67600000' })).toMatch(/réservé par le SYCEBNL aux opérations à caractère financier/);
    expect(motifRefusCompteEcart({ ...p, ecart: 'GAIN', numero: '77600000' })).toMatch(/réservé par le SYCEBNL/);
    expect(motifRefusCompteEcart({ ...p, ecart: 'PERTE', numero: '65910000' })).toMatch(/hors 659/);
    expect(motifRefusCompteEcart({ ...p, ecart: 'GAIN', numero: '75910000' })).toMatch(/hors 759/);
    expect(motifRefusCompteEcart({ ...p, ecart: 'PERTE', numero: '75880000' })).toMatch(/sous le 65/);
  });

  it('le compte choisi au SYSCOHADA · dans la racine que le texte donne, sous-comptes admis', () => {
    const p = { referentiel: 'SYSCOHADA' as const, nature: 'COMMERCIALE' as const };
    expect(motifRefusCompteEcart({ ...p, ecart: 'PERTE', numero: '65610000' })).toBeNull();
    expect(motifRefusCompteEcart({ ...p, ecart: 'PERTE', numero: '67600000' })).toMatch(/se passe sous le 656/);
    expect(motifRefusCompteEcart({ ...p, ecart: 'GAIN', numero: '77600000' })).toMatch(/Un gain de change .* se passe sous le 756/);
  });
});

/**
 * MINEUR 3 · LES COMPTES ADMIS POUR L'ÉCART, une table jouée à l'identique
 * par `client/src/lib/ecart-change.spec.ts` · une nature non lue n'ouvre plus
 * une classe entière (un 601 passait pour un compte de change).
 */
export const CAS_ADMIS: Array<[ 'SYSCOHADA' | 'SYCEBNL', 'COMMERCIALE' | 'FINANCIERE' | null, 'PERTE' | 'GAIN', string, boolean]> = [
  ['SYSCOHADA', 'COMMERCIALE', 'PERTE', '65610000', true],
  ['SYSCOHADA', 'COMMERCIALE', 'PERTE', '67600000', false],
  ['SYSCOHADA', 'FINANCIERE', 'GAIN', '77600000', true],
  ['SYSCOHADA', 'FINANCIERE', 'GAIN', '75600000', false],
  ['SYSCOHADA', null, 'PERTE', '65600000', true],
  ['SYSCOHADA', null, 'PERTE', '67600000', true],
  ['SYSCOHADA', null, 'PERTE', '60110000', false],
  ['SYSCOHADA', null, 'PERTE', '65800000', false],
  ['SYSCOHADA', null, 'GAIN', '77600000', true],
  ['SYCEBNL', 'COMMERCIALE', 'PERTE', '65800000', true],
  ['SYCEBNL', 'COMMERCIALE', 'PERTE', '65910000', false],
  ['SYCEBNL', 'COMMERCIALE', 'PERTE', '67600000', false],
  ['SYCEBNL', 'COMMERCIALE', 'GAIN', '75880000', true],
  ['SYCEBNL', 'COMMERCIALE', 'GAIN', '75910000', false],
  ['SYCEBNL', 'FINANCIERE', 'PERTE', '67600000', true],
  ['SYCEBNL', 'FINANCIERE', 'PERTE', '65800000', false],
  ['SYCEBNL', null, 'PERTE', '65800000', true],
  ['SYCEBNL', null, 'PERTE', '67600000', true],
  ['SYCEBNL', null, 'PERTE', '60110000', false],
  ['SYCEBNL', null, 'GAIN', '77600000', true],
  ['SYCEBNL', null, 'GAIN', '75910000', false],
];

describe('les comptes admis pour l’écart, serveur et écran sur une seule table', () => {
  it.each(CAS_ADMIS)('%s, nature %s, %s · %s admis : %s', (referentiel, nature, ecart, numero, admis) => {
    expect(compteAdmisPourEcart(racinesAdmises(referentiel, nature, ecart), numero)).toBe(admis);
    expect(motifRefusCompteEcart({ referentiel, nature, ecart, numero }) === null).toBe(admis);
  });

  it('la nature lue · 17 et 481 au SYSCOHADA, 187 et 481 au SYCEBNL sont financiers ; le 17 du SYCEBNL est un fonds', () => {
    expect(natureDuCompte('17200000', 'SYSCOHADA')).toBe('FINANCIERE');
    expect(natureDuCompte('48120000', 'SYSCOHADA')).toBe('FINANCIERE');
    expect(natureDuCompte('18710000', 'SYCEBNL')).toBe('FINANCIERE');
    expect(natureDuCompte('48120000', 'SYCEBNL')).toBe('FINANCIERE');
    expect(natureDuCompte('17100000', 'SYCEBNL')).toBeNull();
    expect(natureDuCompte('48500000', 'SYSCOHADA')).toBeNull();
    const sycebnl = new Map(PLAN_COMPTES_SYCEBNL.map((c) => [c.numero, c.intitule]));
    const syscohada = new Map(PLAN_COMPTES_SYSCOHADA.map((c) => [c.numero, c.intitule]));
    expect(syscohada.get('17')).toMatch(/location acquisition/i);
    expect(sycebnl.get('17')).toMatch(/fonds report/i);
    expect(sycebnl.get('187')).toMatch(/location-acquisition/i);
    expect(syscohada.get('481')).toMatch(/investissement/i);
    expect(sycebnl.get('481')).toMatch(/investissement/i);
  });

  it('le libellé s’accorde · « Perte de change réalisée », « Gain de change réalisé »', () => {
    expect(libelleEcartRealise(1)).toBe('Perte de change réalisée');
    expect(libelleEcartRealise(-1)).toBe('Gain de change réalisé');
  });

  it('ni cours ni débit saisi · refus, jamais un cours deviné', () => {
    expect(coursEtFrancsDuReglement({ montantDevise: 600, tolerance: () => true })).toHaveProperty('motif');
  });
});

describe('le coût historique de ce qui est réglé (AUDCIF art. 55)', () => {
  const facture = { id: 'f', francs: TTC_FRANCS, montantDevise: TTC_USD, date: new Date('2026-05-15') };

  it('600 USD d’une facture de 1 160 USD à 1 680 éteignent 1 008 000', () => {
    expect(coutHistoriqueRegle([facture], 600)).toBe(1008000);
  });

  it('réglée en entier, la facture rend sa contrevaleur d’origine au centime', () => {
    expect(coutHistoriqueRegle([{ ...facture, francs: 1000.01, montantDevise: 3 }], 3)).toBe(1000.01);
  });

  it('plusieurs factures · les plus anciennes d’abord, la dernière seule en partie', () => {
    const vieille = { id: 'a', francs: 160000, montantDevise: 100, date: new Date('2026-01-10') };
    const recente = { id: 'b', francs: 340000, montantDevise: 200, date: new Date('2026-03-10') };
    // 150 USD · la vieille entière (160 000), puis 50 sur 200 de la récente (85 000).
    expect(coutHistoriqueRegle([recente, vieille], 150)).toBe(245000);
  });

  it('l’écart est signé · positif pour une perte, dans les deux sens de règlement', () => {
    expect(ecartSigne('FOURNISSEUR', 1008000, 1050000)).toBe(42000);
    expect(ecartSigne('CLIENT', 1008000, 1050000)).toBe(-42000);
    expect(ecartSigne('CLIENT', 1008000, 1000000)).toBe(8000);
  });
});

describe('les lignes du règlement en devise', () => {
  const commun = {
    compteTresorerieId: '571',
    historique: 1008000,
    francsPayes: 1050000,
    deviseId: 'usd',
    montantDevise: 600,
    coursReglement: 1750,
    tresorerieEnDevise: false,
    libelle: 'R',
  };

  it('MBIKAYI paie NZUZI · D 401 1 008 000, D 656 42 000, C 571 1 050 000', () => {
    const l = lignesDuReglementEnDevise({ ...commun, sens: 'FOURNISSEUR', compteTiersId: '401', compteEcartId: '656' });
    expect(l.map((x) => [x.compteId, x.debit ?? 0, x.credit ?? 0])).toEqual([
      ['401', 1008000, 0],
      ['656', 42000, 0],
      ['571', 0, 1050000],
    ]);
    // Le tiers est soldé DANS SA DEVISE · 600 USD.
    expect(l[0]).toMatchObject({ deviseId: 'usd', montantDevise: 600 });
    expect(l[2].deviseId).toBeUndefined();
  });

  it('NZUZI encaisse · D 571 1 050 000, C 411 1 008 000, C 756 42 000', () => {
    const l = lignesDuReglementEnDevise({ ...commun, sens: 'CLIENT', compteTiersId: '411', compteEcartId: '756' });
    expect(l.map((x) => [x.compteId, x.debit ?? 0, x.credit ?? 0])).toEqual([
      ['571', 1050000, 0],
      ['411', 0, 1008000],
      ['756', 0, 42000],
    ]);
  });

  it('la pièce est équilibrée, et la trésorerie en devise porte le cours du jour', () => {
    const l = lignesDuReglementEnDevise({ ...commun, sens: 'FOURNISSEUR', compteTiersId: '401', compteEcartId: '656', tresorerieEnDevise: true });
    const d = l.reduce((s, x) => s + (x.debit ?? 0), 0);
    const c = l.reduce((s, x) => s + (x.credit ?? 0), 0);
    expect(d).toBe(c);
    expect(l.find((x) => x.compteId === '571')).toMatchObject({ deviseId: 'usd', montantDevise: 600, coursApplique: 1750 });
  });

  it('un écart sans compte ne se fabrique pas · la règle s’arrête', () => {
    expect(() => lignesDuReglementEnDevise({ ...commun, sens: 'FOURNISSEUR', compteTiersId: '401', compteEcartId: null })).toThrow();
  });
});

describe('l’écart d’un groupe de lettrage soldé dans sa devise', () => {
  // MBIKAYI · facture, règlement de 600 USD à 1 008 000 (coût historique),
  // puis le solde de 560 USD payé le 2 février au cours de 1 900.
  const mbikayi = [
    { debit: 0, credit: TTC_FRANCS, deviseId: 'usd', montantDevise: TTC_USD },
    { debit: 1008000, credit: 0, deviseId: 'usd', montantDevise: 600 },
    { debit: 560 * 1900, credit: 0, deviseId: 'usd', montantDevise: 560 },
  ];

  it('MBIKAYI · perte de 123 200, D 656 / C 401', () => {
    expect(ecartDuGroupe(mbikayi)).toEqual({ deviseId: 'usd', ecart: 123200 });
    expect(lignesEcartDuGroupe({ compteTiersId: '401', compteEcartId: '656', ecart: 123200, libelle: 'x' })).toEqual([
      { compteId: '656', debit: 123200, libelle: 'x' },
      { compteId: '401', credit: 123200, libelle: 'x' },
    ]);
  });

  it('NZUZI · gain de 123 200, D 411 / C 756', () => {
    const nzuzi = mbikayi.map((l) => ({ ...l, debit: l.credit, credit: l.debit }));
    expect(ecartDuGroupe(nzuzi)).toEqual({ deviseId: 'usd', ecart: -123200 });
    expect(lignesEcartDuGroupe({ compteTiersId: '411', compteEcartId: '756', ecart: -123200, libelle: 'x' })).toEqual([
      { compteId: '411', debit: 123200, libelle: 'x' },
      { compteId: '756', credit: 123200, libelle: 'x' },
    ]);
  });

  it('pas soldé en devise, ou deux devises · aucune proposition', () => {
    expect(ecartDuGroupe(mbikayi.slice(0, 2))).toBeNull();
    expect(ecartDuGroupe([...mbikayi.slice(0, 2), { ...mbikayi[2], deviseId: 'eur' }])).toBeNull();
    expect(ecartDuGroupe([{ debit: 10, credit: 0, deviseId: null, montantDevise: null }])).toBeNull();
  });
});

// ─── Service ───────────────────────────────────────────────────────────────

function monter(referentiel: 'SYSCOHADA' | 'SYCEBNL' = 'SYSCOHADA') {
  const date = new Date('2026-05-15');
  const ecriture = { exerciceId: 'ex', date, journalId: 'jACH', journal: { code: 'ACH' }, exercice: { statut: 'OUVERT' } };
  const lignes = [
    // MBIKAYI doit 1 160 USD à NZUZI.
    { id: 'fm', compteId: 'c401', debit: 0, credit: TTC_FRANCS, deviseId: 'usd', montantDevise: TTC_USD, lettrageId: null, compte: { numero: '40110000', intitule: 'NZUZI', lettrable: true }, ecriture },
    // NZUZI attend 1 160 USD de MBIKAYI.
    { id: 'fn', compteId: 'c411', debit: TTC_FRANCS, credit: 0, deviseId: 'usd', montantDevise: TTC_USD, lettrageId: null, compte: { numero: '41110000', intitule: 'MBIKAYI', lettrable: true }, ecriture },
    { id: 'ff', compteId: 'c402', debit: 0, credit: 500, deviseId: null, montantDevise: null, lettrageId: null, compte: { numero: '40120000', intitule: 'Francs', lettrable: true }, ecriture },
    { id: 'fe', compteId: 'c401', debit: 0, credit: 1000, deviseId: null, montantDevise: null, lettrageId: null, compte: { numero: '40110000', intitule: 'NZUZI', lettrable: true }, ecriture },
  ];
  const comptes = [
    { id: 'c656', numero: '65600000', typeCompte: 'DETAIL', estActif: true },
    { id: 'c756', numero: '75600000', typeCompte: 'DETAIL', estActif: true },
    { id: 'c676', numero: '67600000', typeCompte: 'DETAIL', estActif: true },
    { id: 'c658', numero: '65800000', typeCompte: 'DETAIL', estActif: true },
    { id: 'c6561', numero: '65610000', typeCompte: 'DETAIL', estActif: true },
  ].filter((c) => referentiel === 'SYSCOHADA' || !c.numero.startsWith('656') && !c.numero.startsWith('756'));
  const prisma = {
    journal: { findFirst: jest.fn(async () => ({ id: 'bq', code: 'CA', type: 'TRESORERIE', compteTresorerieId: 'c571' })) },
    ligneEcriture: {
      findMany: jest.fn(async ({ where }: { where: { id?: { in: string[] } } }) => (where.id ? lignes.filter((l) => where.id!.in.includes(l.id)) : [])),
    },
    cloture: { findMany: jest.fn(async () => []) },
    tenant: { findFirst: jest.fn(async () => ({ referentiel })) },
    compte: {
      findFirst: jest.fn(async ({ where }: { where: { id?: string; numero?: string } }) =>
        comptes.find((c) => (where.id ? c.id === where.id : c.numero === where.numero)) ?? null,
      ),
      findMany: jest.fn(async ({ where }: { where: { numero: { startsWith: string } } }) =>
        comptes.filter((c) => c.numero.startsWith(where.numero.startsWith) && c.estActif && c.typeCompte === 'DETAIL'),
      ),
    },
    devise: {
      findMany: jest.fn(async () => [
        { id: 'usd', code: 'USD' },
        { id: 'eur', code: 'EUR' },
      ]),
    },
    ribBanque: { findFirst: jest.fn(async () => null) },
    reevaluation: { findFirst: jest.fn(async (): Promise<unknown> => null) },
    exercice: { findFirst: jest.fn(async () => ({ dateDebut: new Date('2026-01-01') })) },
    coursDevise: { findFirst: jest.fn(async () => ({ cours: 1850 })) },
  } as unknown as PrismaService;
  let n = 0;
  const creer = jest.fn(async (_t: string, _u: string, dto: { libelle?: string; lignes: { compteId: string; libelle?: string }[] }) => {
    n += 1;
    return { id: 'e' + n, numeroPiece: n, lignes: dto.lignes.map((l, i) => ({ ...l, id: `p${n}-${i}` })) };
  });
  const lettrerManuel = jest.fn(async () => ({ lettre: 'a' }));
  const completer = jest.fn(async (): Promise<{ lettre: string; statut: string; solde: number }> => ({ lettre: 'A', statut: 'SOLDE', solde: 0 }));
  const propositionEcartChange = jest.fn();
  const retirerCompensation = jest.fn(async () => undefined);
  const service = new ReglementsService(
    prisma,
    { creer, retirerCompensation } as unknown as EcritureService,
    { lettrerManuel, completer, propositionEcartChange } as unknown as LettrageService,
    {} as unknown as OrdresVirementService,
  );
  return { service, creer, lettrerManuel, completer, propositionEcartChange, retirerCompensation, prisma };
}

const base = { exerciceId: 'ex', journalId: 'bq', date: '2026-11-30' };
const resume = (lignes: Array<{ compteId: string; debit?: number; credit?: number }>) =>
  lignes.map((l) => [l.compteId, l.debit ?? 0, l.credit ?? 0]);

describe('enregistrer un règlement en devise', () => {
  it('MBIKAYI règle 600 USD au cours de 1 750 · perte de 42 000 au 656, lettrage partiel', async () => {
    const { service, creer, lettrerManuel } = monter();
    const r = await service.enregistrer('t', 'u', {
      ...base,
      sens: 'FOURNISSEUR',
      reglements: [{ compteId: 'c401', ligneIds: ['fm'], montantDevise: 600, coursReglement: 1750 }],
    });
    expect(resume(creer.mock.calls[0][2].lignes)).toEqual([
      ['c401', 1008000, 0],
      ['c656', 42000, 0],
      ['c571', 0, 1050000],
    ]);
    expect(creer.mock.calls[0][2].lignes[0]).toMatchObject({ deviseId: 'usd', montantDevise: 600 });
    // Le réalisé du règlement partiel est GARDÉ par le groupe (mineur 4).
    expect(lettrerManuel).toHaveBeenCalledWith('t', 'c401', ['fm', 'p1-0'], 'u', { autoriserPartiel: true, ecartChangeRealise: 42000 });
    expect(creer.mock.calls[0][2].lignes[1].libelle).toMatch(/^Perte de change réalisée · /);
    expect(r.reglements[0]).toMatchObject({ montant: 1050000, partiel: true, montantDevise: 600, ecartChange: 42000 });
  });

  it('NZUZI encaisse 600 USD au cours de 1 750 · gain de 42 000 au 756', async () => {
    const { service, creer } = monter();
    await service.enregistrer('t', 'u', {
      ...base,
      sens: 'CLIENT',
      reglements: [{ compteId: 'c411', ligneIds: ['fn'], montantDevise: 600, coursReglement: 1750 }],
    });
    expect(resume(creer.mock.calls[0][2].lignes)).toEqual([
      ['c571', 1050000, 0],
      ['c411', 0, 1008000],
      ['c756', 0, 42000],
    ]);
  });

  // Le défaut d'avant la ligne A6 · le dû en francs bornait le règlement, et
  // le même dû en devise payé à un cours plus haut était REFUSÉ.
  it('le dû entier à un cours plus haut passe · le groupe est soldé et garde son écart', async () => {
    const { service, creer, lettrerManuel } = monter();
    const r = await service.enregistrer('t', 'u', {
      ...base,
      sens: 'FOURNISSEUR',
      reglements: [{ compteId: 'c401', ligneIds: ['fm'], coursReglement: 1750 }],
    });
    // 1 160 × 1 750 = 2 030 000 payés contre 1 948 800 d'origine.
    expect(resume(creer.mock.calls[0][2].lignes)).toEqual([
      ['c401', 1948800, 0],
      ['c656', 81200, 0],
      ['c571', 0, 2030000],
    ]);
    expect(lettrerManuel).toHaveBeenCalledWith('t', 'c401', ['fm', 'p1-0'], 'u', { autoriserPartiel: false, ecartChangeRealise: 81200 });
    expect(r.reglements[0].partiel).toBe(false);
  });

  it('même cours · aucune ligne d’écart, et aucun compte demandé', async () => {
    const { service, creer, prisma } = monter('SYCEBNL');
    await service.enregistrer('t', 'u', { ...base, sens: 'FOURNISSEUR', reglements: [{ compteId: 'c401', ligneIds: ['fm'], coursReglement: 1680 }] });
    expect(resume(creer.mock.calls[0][2].lignes)).toEqual([
      ['c401', 1948800, 0],
      ['c571', 0, 1948800],
    ]);
    expect(prisma.compte.findFirst).not.toHaveBeenCalled();
  });

  it('plus que le dû EN DEVISE est refusé, avant toute pièce', async () => {
    const { service, creer } = monter();
    await expect(
      service.enregistrer('t', 'u', { ...base, sens: 'FOURNISSEUR', reglements: [{ compteId: 'c401', ligneIds: ['fm'], montantDevise: 1160.01, coursReglement: 1750 }] }),
    ).rejects.toThrow(/dépasse le dû en devise/);
    expect(creer).not.toHaveBeenCalled();
  });

  it('sans le cours du jour, refus nommé · jamais un cours deviné', async () => {
    const { service, creer } = monter();
    await expect(
      service.enregistrer('t', 'u', { ...base, sens: 'FOURNISSEUR', reglements: [{ compteId: 'c401', ligneIds: ['fm'] }] }),
    ).rejects.toThrow(/cours du jour du règlement, ou le montant réellement payé en francs, est exigé/);
    expect(creer).not.toHaveBeenCalled();
  });

  it('francs et devise dans la même pièce · refus ; un cours sur des factures en francs · refus', async () => {
    const { service } = monter();
    await expect(
      service.enregistrer('t', 'u', { ...base, sens: 'FOURNISSEUR', reglements: [{ compteId: 'c401', ligneIds: ['fm', 'fe'], coursReglement: 1750 }] }),
    ).rejects.toThrow(/francs et des factures en devise/);
    await expect(
      service.enregistrer('t', 'u', { ...base, sens: 'FOURNISSEUR', reglements: [{ compteId: 'c402', ligneIds: ['ff'], coursReglement: 1750 }] }),
    ).rejects.toThrow(/sont en francs/);
  });

  it('un montant en francs qui n’est pas la contrevaleur du cours saisi · refusé', async () => {
    const { service } = monter();
    await expect(
      service.enregistrer('t', 'u', { ...base, sens: 'FOURNISSEUR', reglements: [{ compteId: 'c401', ligneIds: ['fm'], montantDevise: 600, coursReglement: 1750, montant: 1000000 }] }),
    ).rejects.toThrow(/font 1050000.00 en francs/);
  });

  // Mineur 7 · le débit RÉEL de la banque prime, le cours s'en déduit comme
  // sur toute ligne en devise (ligne-en-devise.ts) · 1 050 010 pour 600 USD.
  it('le débit réel saisi en francs, sans cours · le cours se déduit, le payé n’est pas recalculé', async () => {
    const { service, creer } = monter();
    await service.enregistrer('t', 'u', {
      ...base,
      sens: 'FOURNISSEUR',
      tresorerieEnDevise: true,
      deviseTresorerieId: 'usd',
      reglements: [{ compteId: 'c401', ligneIds: ['fm'], montantDevise: 600, montant: 1050010 }],
    });
    const lignes = creer.mock.calls[0][2].lignes;
    expect(resume(lignes)).toEqual([
      ['c401', 1008000, 0],
      ['c656', 42010, 0],
      ['c571', 0, 1050010],
    ]);
    expect(lignes[2]).toMatchObject({ deviseId: 'usd', montantDevise: 600, coursApplique: 1750.016667 });
  });

  // Mineur 2 · 500 000 FC d'acompte sans montant en devise soldaient la
  // facture de 1 160 USD avec un « gain » de 1 448 800.
  it('des francs sans montant en devise · refus nommé, avant toute pièce', async () => {
    const { service, creer } = monter();
    await expect(
      service.enregistrer('t', 'u', { ...base, sens: 'FOURNISSEUR', reglements: [{ compteId: 'c401', ligneIds: ['fm'], montant: 500000 }] }),
    ).rejects.toThrow(/saisissez aussi le montant réglé en devise/);
    expect(creer).not.toHaveBeenCalled();
  });

  it('cours et débit saisis qui s’accordent à l’arrondi du cours près · admis', async () => {
    const { service, creer } = monter();
    await service.enregistrer('t', 'u', {
      ...base,
      sens: 'FOURNISSEUR',
      reglements: [{ compteId: 'c401', ligneIds: ['fm'], montantDevise: 600, coursReglement: 1750, montant: 1050000.01 }],
    });
    expect(resume(creer.mock.calls[0][2].lignes)[2]).toEqual(['c571', 0, 1050000.01]);
  });

  it('SYCEBNL · sans compte choisi, refus qui dit que le texte n’en donne aucun, avant toute pièce', async () => {
    const { service, creer } = monter('SYCEBNL');
    await expect(
      service.enregistrer('t', 'u', {
        ...base,
        sens: 'FOURNISSEUR',
        reglements: [
          { compteId: 'c402', ligneIds: ['ff'] },
          { compteId: 'c401', ligneIds: ['fm'], montantDevise: 600, coursReglement: 1750 },
        ],
      }),
    ).rejects.toThrow(/ne donne aucun compte/);
    expect(creer).not.toHaveBeenCalled();
  });

  it('SYCEBNL · le 676 choisi est refusé, un compte du 65 passe', async () => {
    const { service, creer } = monter('SYCEBNL');
    const regl = { compteId: 'c401', ligneIds: ['fm'], montantDevise: 600, coursReglement: 1750 };
    await expect(
      service.enregistrer('t', 'u', { ...base, sens: 'FOURNISSEUR', reglements: [{ ...regl, compteEcartChangeId: 'c676' }] }),
    ).rejects.toThrow(/réservé par le SYCEBNL/);
    await service.enregistrer('t', 'u', { ...base, sens: 'FOURNISSEUR', reglements: [{ ...regl, compteEcartChangeId: 'c658' }] });
    expect(resume(creer.mock.calls[0][2].lignes)[1]).toEqual(['c658', 42000, 0]);
  });

  it('SYSCOHADA · le 656 du plan absent est un refus nommé, jamais un compte de repli', async () => {
    const { service, prisma } = monter();
    (prisma.compte.findFirst as jest.Mock).mockResolvedValueOnce(null);
    await expect(
      service.enregistrer('t', 'u', { ...base, sens: 'FOURNISSEUR', reglements: [{ compteId: 'c401', ligneIds: ['fm'], montantDevise: 600, coursReglement: 1750 }] }),
    ).rejects.toThrow(/65600000 que le texte donne .* n'est pas ouvert/);
  });

  // Mineur 2 · un 656 en sommeil ou passé en regroupement n'est pas un refus
  // sans issue · le refus nomme ses sous-comptes, et l'un d'eux choisi passe.
  it('SYSCOHADA · le 656 en sommeil · refus qui nomme le sous-compte, puis le sous-compte choisi passe', async () => {
    const { service, prisma, creer } = monter();
    (prisma.compte.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'c656', numero: '65600000', typeCompte: 'DETAIL', estActif: false });
    const regl = { compteId: 'c401', ligneIds: ['fm'], montantDevise: 600, coursReglement: 1750 };
    await expect(service.enregistrer('t', 'u', { ...base, sens: 'FOURNISSEUR', reglements: [regl] })).rejects.toThrow(
      /65600000 est en sommeil.*sous-comptes · 65600000, 65610000/,
    );
    await service.enregistrer('t', 'u', { ...base, sens: 'FOURNISSEUR', reglements: [{ ...regl, compteEcartChangeId: 'c6561' }] });
    expect(resume(creer.mock.calls[0][2].lignes)[1]).toEqual(['c6561', 42000, 0]);
  });

  it('un compte choisi en sommeil ou de regroupement · refusé', async () => {
    const { service, prisma } = monter();
    (prisma.compte.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'c6561', numero: '65610000', typeCompte: 'DETAIL', estActif: false });
    const regl = { compteId: 'c401', ligneIds: ['fm'], montantDevise: 600, coursReglement: 1750, compteEcartChangeId: 'c6561' };
    await expect(service.enregistrer('t', 'u', { ...base, sens: 'FOURNISSEUR', reglements: [regl] })).rejects.toThrow(/en sommeil/);
    (prisma.compte.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'c6561', numero: '656', typeCompte: 'TOTAL', estActif: true });
    await expect(service.enregistrer('t', 'u', { ...base, sens: 'FOURNISSEUR', reglements: [regl] })).rejects.toThrow(/regroupement/);
  });
});

/**
 * BLOQUANT 2 · LA DEVISE DU MOYEN DE PAIEMENT se déclare et se confronte ·
 * marquée d'office de la devise de la facture, une banque en USD payant une
 * facture en EUR, ou un lot USD et EUR, faussait le 52 et la conversion des
 * disponibilités à la clôture (AUDCIF art. 57).
 */
/**
 * BLOQUANT 1 (troisième relecture) · une facture que la réévaluation de
 * l'exercice a lue ne se règle pas en passant son réalisé · 409 nommé avant
 * la première pièce (règle dans reevaluation-et-ecart-realise.ts).
 */
describe('le règlement d’une facture déjà réévaluée', () => {
  it('la facture B réévaluée le 05/01, réglée le 08/01 en N · 409, rien n’est passé', async () => {
    const { service, creer, prisma } = monter();
    (prisma.reevaluation.findFirst as jest.Mock).mockResolvedValueOnce({
      dateReevaluation: new Date('2026-12-31'),
      createdAt: new Date('2027-01-05'),
      ecritureEcarts: { lignes: [{ debit: 0, credit: 75000 }] },
    });
    const lues = [{ id: 'fm', deviseId: 'usd', debit: 0, credit: TTC_FRANCS, montantDevise: TTC_USD, lettrageId: null, lettrage: null }];
    const parId = (prisma.ligneEcriture.findMany as jest.Mock).getMockImplementation()!;
    (prisma.ligneEcriture.findMany as jest.Mock).mockImplementation(async (a: { where: { id?: unknown } }) => (a.where.id ? parId(a) : lues));
    await expect(
      service.enregistrer('t', 'u', { ...base, date: '2026-12-28', sens: 'FOURNISSEUR', reglements: [{ compteId: 'c401', ligneIds: ['fm'], montantDevise: 600, coursReglement: 1860 }] }),
    ).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/a lu une facture choisie du 40110000.*Aucun geste d’OmegaX ne retire/) });
    expect(creer).not.toHaveBeenCalled();
  });
});

describe('le règlement en N+1, réévaluation de N non contre-passée', () => {
  afterEach(() => jest.restoreAllMocks());

  // La règle (à-nouveau, exercice précédent, devise portée) est éprouvée dans
  // reevaluation-et-ecart-realise.spec.ts · ici, son CÂBLAGE (F4a).
  it('l’avertissement revient avec les règlements, la pièce est passée', async () => {
    const espion = jest.spyOn(reevaluationModule, 'avertissementExtourneManquante').mockResolvedValue('40110000 · non contre-passée');
    const { service, creer } = monter();
    const r = await service.enregistrer('t', 'u', {
      ...base,
      sens: 'FOURNISSEUR',
      reglements: [{ compteId: 'c401', ligneIds: ['fm'], montantDevise: 600, coursReglement: 1750 }],
    });
    expect(creer).toHaveBeenCalled();
    expect(espion).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ compteId: 'c401', ligneIds: ['fm'] }));
    expect(r.avertissements).toEqual(['40110000 · non contre-passée']);
  });
});

describe('la trésorerie en devise', () => {
  const regl = { compteId: 'c401', ligneIds: ['fm'], montantDevise: 600, coursReglement: 1750 };

  it('déclarée et conforme · la ligne de trésorerie porte la devise et le cours', async () => {
    const { service, creer } = monter();
    await service.enregistrer('t', 'u', { ...base, sens: 'FOURNISSEUR', tresorerieEnDevise: true, deviseTresorerieId: 'usd', reglements: [regl] });
    expect(creer.mock.calls[0][2].lignes[2]).toMatchObject({ compteId: 'c571', deviseId: 'usd', montantDevise: 600, coursApplique: 1750 });
  });

  it('case cochée sans devise déclarée, ou une devise autre que celle des factures · refus avant toute pièce', async () => {
    const { service, creer } = monter();
    await expect(service.enregistrer('t', 'u', { ...base, sens: 'FOURNISSEUR', tresorerieEnDevise: true, reglements: [regl] })).rejects.toThrow(
      /Précisez la devise du moyen de paiement/,
    );
    await expect(
      service.enregistrer('t', 'u', { ...base, sens: 'FOURNISSEUR', tresorerieEnDevise: true, deviseTresorerieId: 'eur', reglements: [regl] }),
    ).rejects.toThrow(/moyen de paiement est en EUR et les factures en USD/);
    expect(creer).not.toHaveBeenCalled();
  });

  it('un lot à factures en francs et en devise · refus', async () => {
    const { service, creer } = monter();
    await expect(
      service.enregistrer('t', 'u', {
        ...base,
        sens: 'FOURNISSEUR',
        tresorerieEnDevise: true,
        deviseTresorerieId: 'usd',
        reglements: [{ compteId: 'c402', ligneIds: ['ff'] }, regl],
      }),
    ).rejects.toThrow(/ne règle que des factures en devise/);
    expect(creer).not.toHaveBeenCalled();
  });

  it('le RIB du journal tenu dans une autre devise · refus ; tenu en USD et case décochée · refus', async () => {
    const { service, prisma, creer } = monter();
    (prisma.ribBanque.findFirst as jest.Mock).mockResolvedValueOnce({ devise: 'EUR' });
    await expect(
      service.enregistrer('t', 'u', { ...base, sens: 'FOURNISSEUR', tresorerieEnDevise: true, deviseTresorerieId: 'usd', reglements: [regl] }),
    ).rejects.toThrow(/RIB du journal CA est tenu en EUR, et non en USD/);
    (prisma.ribBanque.findFirst as jest.Mock).mockResolvedValueOnce({ devise: 'usd' });
    await expect(service.enregistrer('t', 'u', { ...base, sens: 'FOURNISSEUR', reglements: [regl] })).rejects.toThrow(
      /RIB du journal CA est tenu en USD · cochez « Moyen de paiement en devise »/,
    );
    expect(creer).not.toHaveBeenCalled();
  });

  it('un lot USD et EUR · la règle pure refuse un moyen de paiement à deux devises', () => {
    expect(
      motifRefusTresorerieEnDevise({
        tresorerieEnDevise: true,
        devisesDuLot: [
          { id: 'usd', code: 'USD' },
          { id: 'eur', code: 'EUR' },
        ],
        deviseTresorerie: { id: 'usd', code: 'USD' },
        deviseRib: null,
        monnaieDeTenue: 'CDF',
        journalCode: 'BQ',
      }),
    ).toMatch(/plusieurs devises \(USD, EUR\)/);
    // Un RIB en francs ne s'oppose à rien.
    expect(
      motifRefusTresorerieEnDevise({
        tresorerieEnDevise: false,
        devisesDuLot: [{ id: 'usd', code: 'USD' }],
        deviseTresorerie: null,
        deviseRib: 'CDF',
        monnaieDeTenue: 'CDF',
        journalCode: 'BQ',
      }),
    ).toBeNull();
  });
});

/** La réévaluation du 31 décembre sur le 401 du cas mixte, et les lignes qu'elle lisait. */
function reevaluationDuCasMixte(prisma: PrismaService, perte: number) {
  (prisma.reevaluation.findFirst as jest.Mock).mockResolvedValueOnce({
    dateReevaluation: new Date('2026-12-31'),
    createdAt: new Date('2027-01-05'),
    ecritureEcarts: { lignes: [{ debit: 0, credit: perte }] },
  });
  const l = (debit: number, credit: number, montantDevise: number, lettrageId: string | null) => ({
    deviseId: 'usd',
    debit,
    credit,
    montantDevise,
    lettrageId,
    lettrage: lettrageId ? { createdAt: new Date('2026-05-15') } : null,
  });
  const groupe = [l(0, 1_948_800, 1160, 'L'), l(1_008_000, 0, 600, 'L'), l(1_064_000, 0, 560, 'L')];
  (prisma.ligneEcriture.findMany as jest.Mock)
    .mockResolvedValueOnce([...groupe, l(0, 850_000, 500, null)])
    .mockResolvedValueOnce(groupe);
}

describe('passer l’écart de change proposé au lettrage', () => {
  const proposition = {
    lettrageId: 'L',
    code: 'a',
    compteId: 'c401',
    compteNumero: '40110000',
    ecart: 123200,
    exerciceId: 'ex',
    date: new Date('2026-11-30'),
    deviseId: 'usd',
  };

  it('MBIKAYI · le solde de 560 USD payé à 1 900 · D 656 123 200 / C 401, puis le groupe complété', async () => {
    const { service, creer, completer, propositionEcartChange, prisma } = monter();
    propositionEcartChange.mockResolvedValueOnce(proposition);
    (prisma.journal.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'od', code: 'OD', type: 'GENERAL' });
    const r = await service.passerEcartChange('t', 'u', { lettrageId: 'L', exerciceId: 'ex', journalId: 'od', date: '2026-12-02' });
    expect(resume(creer.mock.calls[0][2].lignes)).toEqual([
      ['c656', 123200, 0],
      ['c401', 0, 123200],
    ]);
    expect(completer).toHaveBeenCalledWith('t', 'L', ['p1-1']);
    expect(r).toMatchObject({ ecart: 123200, compte: '65600000', statut: 'SOLDE' });
    expect(creer.mock.calls[0][2].libelle).toBe('Perte de change réalisée · 40110000 a');
  });

  // Mineur 1 · l'écart se constate « à la date d'encaissement ou de
  // règlement » (ch. 22 § 2.3), dans l'exercice du dénouement.
  it('avant le dénouement, ou dans un autre exercice · refus avant toute pièce', async () => {
    const { service, creer, propositionEcartChange } = monter();
    propositionEcartChange.mockResolvedValue(proposition);
    await expect(service.passerEcartChange('t', 'u', { lettrageId: 'L', exerciceId: 'ex', journalId: 'od', date: '2026-11-29' })).rejects.toThrow(
      /date du règlement qui dénoue la position, le 2026-11-30, ou après/,
    );
    await expect(service.passerEcartChange('t', 'u', { lettrageId: 'L', exerciceId: 'ex2', journalId: 'od', date: '2027-01-05' })).rejects.toThrow(
      /dans l'exercice de son dernier règlement/,
    );
    expect(creer).not.toHaveBeenCalled();
  });

  // Bloquant 1 · une réévaluation qui a déjà porté ces lignes au 478 refuse
  // le passage, avant toute pièce (règle dans reevaluation-et-ecart-realise.ts).
  it('une réévaluation postérieure qui a déjà repris ces lignes · 409 avant toute pièce', async () => {
    const { service, creer, propositionEcartChange, prisma } = monter();
    propositionEcartChange.mockResolvedValueOnce(proposition);
    (prisma.journal.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'od', code: 'OD', type: 'GENERAL' });
    // Le cas mixte · le groupe lu par la réévaluation (198 200 passés).
    reevaluationDuCasMixte(prisma, 198_200);
    await expect(service.passerEcartChange('t', 'u', { lettrageId: 'L', exerciceId: 'ex', journalId: 'od', date: '2026-12-02' })).rejects.toMatchObject({
      status: 409,
      message: expect.stringMatching(/compterait la perte deux fois/),
    });
    expect(creer).not.toHaveBeenCalled();
  });

  it('un compte qui ne se reconstitue plus · l’écart passe, avec l’avertissement, jamais un 409', async () => {
    const { service, creer, propositionEcartChange, prisma } = monter();
    propositionEcartChange.mockResolvedValueOnce(proposition);
    (prisma.journal.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'od', code: 'OD', type: 'GENERAL' });
    reevaluationDuCasMixte(prisma, 90_000);
    const r = await service.passerEcartChange('t', 'u', { lettrageId: 'L', exerciceId: 'ex', journalId: 'od', date: '2026-12-02' });
    expect(creer).toHaveBeenCalled();
    expect(r.avertissement).toMatch(/ont changé depuis la réévaluation/);
  });

  // M-C (cinquième relecture) · l'écart passé sur un groupe dont l'à-nouveau
  // vient d'une réévaluation de N non contre-passée revient avec son
  // avertissement, que l'écran Lettrage affiche.
  it('l’à-nouveau du groupe et une réévaluation précédente non contre-passée · avertissement rendu', async () => {
    const espion = jest
      .spyOn(reevaluationModule, 'avertissementExtourneManquante')
      .mockResolvedValue('40110000 · la réévaluation des devises du 2025-12-31 n’a pas été contre-passée');
    const { service, propositionEcartChange, prisma } = monter();
    propositionEcartChange.mockResolvedValueOnce(proposition);
    (prisma.journal.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'od', code: 'OD', type: 'GENERAL' });
    const parId = (prisma.ligneEcriture.findMany as jest.Mock).getMockImplementation()!;
    (prisma.ligneEcriture.findMany as jest.Mock).mockImplementation(async (a: { where: { id?: unknown; lettrageId?: string } }) =>
      a.where.lettrageId === 'L' ? [{ id: 'an' }, { id: 'p' }] : parId(a),
    );
    const r = await service.passerEcartChange('t', 'u', { lettrageId: 'L', exerciceId: 'ex', journalId: 'od', date: '2026-12-02' });
    expect(espion).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ ligneIds: ['an', 'p'], compteId: 'c401' }));
    expect(r.avertissement).toMatch(/n’a pas été contre-passée/);
    espion.mockRestore();
  });

  it('un groupe resté partiel après l’écart · la pièce est retirée, 409', async () => {
    const { service, completer, propositionEcartChange, retirerCompensation, prisma } = monter();
    propositionEcartChange.mockResolvedValueOnce(proposition);
    (prisma.journal.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'od', code: 'OD', type: 'GENERAL' });
    completer.mockResolvedValueOnce({ lettre: 'a', statut: 'PARTIEL', solde: -5 });
    await expect(service.passerEcartChange('t', 'u', { lettrageId: 'L', exerciceId: 'ex', journalId: 'od', date: '2026-12-01' })).rejects.toMatchObject({
      status: 409,
    });
    expect(retirerCompensation).toHaveBeenCalledWith('t', 'e1', expect.any(Function));
  });

  it('rien à passer, ou un journal de trésorerie · refus avant toute pièce', async () => {
    const { service, creer, propositionEcartChange } = monter();
    propositionEcartChange.mockResolvedValueOnce({ ...proposition, ecart: null, motif: "pas soldé dans sa devise" });
    await expect(service.passerEcartChange('t', 'u', { lettrageId: 'L', exerciceId: 'ex', journalId: 'bq', date: '2026-12-02' })).rejects.toThrow(
      /pas soldé dans sa devise/,
    );
    propositionEcartChange.mockResolvedValueOnce(proposition);
    await expect(service.passerEcartChange('t', 'u', { lettrageId: 'L', exerciceId: 'ex', journalId: 'bq', date: '2026-12-02' })).rejects.toThrow(
      /ne mouvemente aucune trésorerie/,
    );
    expect(creer).not.toHaveBeenCalled();
  });

  it('un complètement refusé retire l’écriture d’écart', async () => {
    const { service, completer, propositionEcartChange, retirerCompensation, prisma } = monter();
    propositionEcartChange.mockResolvedValueOnce(proposition);
    (prisma.journal.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'od', code: 'OD', type: 'GENERAL' });
    completer.mockRejectedValueOnce(new Error('verrouillé'));
    await expect(service.passerEcartChange('t', 'u', { lettrageId: 'L', exerciceId: 'ex', journalId: 'od', date: '2026-12-02' })).rejects.toThrow(
      'verrouillé',
    );
    expect(retirerCompensation).toHaveBeenCalledWith('t', 'e1');
  });

  it('la route d’écriture porte les rôles qui écrivent', () => {
    const src = readFileSync(join(__dirname, 'reglements.controller.ts'), 'utf8');
    expect(src).toContain("@Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)\n  @Post('ecart-change')");
  });
});
