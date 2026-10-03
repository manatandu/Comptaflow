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
  motifRefusTresorerieEnDevise,
  racinesAdmises,
  compteAdmisPourEcart,
  libelleEcartRealise,
  coursEtFrancsDuReglement,
  coutsHistoriquesSuccessifs,
} from './ecart-change-realise';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ReglementsService } from './reglements.service';
import { ReglementTiersDto } from './reglements.dto';
import * as reevaluationModule from './reevaluation-et-ecart-realise';
import type { OrdresVirementService } from './ordres-virement.service';
import type { PrismaService } from '../../common/prisma.service';
import type { EcritureService } from '../comptabilite/ecriture.service';
import type { LettrageService } from '../lettrage/lettrage.service';
import { PLAN_COMPTES_SYSCOHADA } from '../comptes/compte-seed-syscohada';
import { PLAN_COMPTES_SYCEBNL } from '../comptes/compte-seed';
import { lignesReportANouveau } from '../exercice/report-a-nouveau';

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

  // Décision D2 (2026-10-03, « réfère-toi à la loi ») · le résidu des fiches
  // 65 et 75 du SYCEBNL, 658 Charges diverses et 7588 Autres produits divers.
  it('SYCEBNL · 676 et 776 pour le financier, 658 et 7588 pour le commercial, semés', () => {
    expect(comptesPrescrits('SYCEBNL', 'FINANCIERE')).toEqual({ perte: '67600000', gain: '77600000' });
    expect(comptesPrescrits('SYCEBNL', 'COMMERCIALE')).toEqual({ perte: '65800000', gain: '75880000' });
    const sycebnl = new Map(PLAN_COMPTES_SYCEBNL.map((c) => [c.numero, c.intitule]));
    expect(sycebnl.get('65800000')).toBe('Charges diverses');
    expect(sycebnl.get('75880000')).toMatch(/Produits divers · autres/);
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

  it('le compte choisi au SYCEBNL · le 658 ou le 7588 et leurs sous-comptes, jamais les autres subdivisions des fiches 65 et 75', () => {
    const p = { referentiel: 'SYCEBNL' as const, nature: 'COMMERCIALE' as const };
    expect(motifRefusCompteEcart({ ...p, ecart: 'PERTE', numero: '65800000' })).toBeNull();
    expect(motifRefusCompteEcart({ ...p, ecart: 'PERTE', numero: '65810000' })).toBeNull();
    expect(motifRefusCompteEcart({ ...p, ecart: 'GAIN', numero: '75880000' })).toBeNull();
    expect(motifRefusCompteEcart({ ...p, ecart: 'PERTE', numero: '67600000' })).toMatch(/réservé par le SYCEBNL aux opérations à caractère financier/);
    expect(motifRefusCompteEcart({ ...p, ecart: 'GAIN', numero: '77600000' })).toMatch(/réservé par le SYCEBNL/);
    for (const n of ['65110000', '65200000', '65410000', '65700000', '65910000']) {
      expect(motifRefusCompteEcart({ ...p, ecart: 'PERTE', numero: n })).toMatch(/se passe sous le 658/);
    }
    for (const n of ['75100000', '75200000', '75420000', '75820000', '75830000', '75910000']) {
      expect(motifRefusCompteEcart({ ...p, ecart: 'GAIN', numero: n })).toMatch(/se passe sous le 7588/);
    }
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
  ['SYCEBNL', 'COMMERCIALE', 'PERTE', '65110000', false],
  ['SYCEBNL', 'COMMERCIALE', 'PERTE', '65700000', false],
  ['SYCEBNL', 'COMMERCIALE', 'PERTE', '65910000', false],
  ['SYCEBNL', 'COMMERCIALE', 'PERTE', '67600000', false],
  ['SYCEBNL', 'COMMERCIALE', 'GAIN', '75880000', true],
  ['SYCEBNL', 'COMMERCIALE', 'GAIN', '75820000', false],
  ['SYCEBNL', 'COMMERCIALE', 'GAIN', '75200000', false],
  ['SYCEBNL', 'COMMERCIALE', 'GAIN', '75910000', false],
  ['SYCEBNL', 'FINANCIERE', 'PERTE', '67600000', true],
  ['SYCEBNL', 'FINANCIERE', 'PERTE', '65800000', false],
  ['SYCEBNL', null, 'PERTE', '65800000', true],
  ['SYCEBNL', null, 'PERTE', '67600000', true],
  ['SYCEBNL', null, 'PERTE', '60110000', false],
  ['SYCEBNL', null, 'GAIN', '77600000', true],
  ['SYCEBNL', null, 'GAIN', '75880000', true],
  ['SYCEBNL', null, 'GAIN', '75100000', false],
  ['SYCEBNL', null, 'GAIN', '75910000', false],
  // A6 bis, M3 · le 404 du SYSCOHADA est financier · son écart va au 676 ou
  // au 776, jamais au 656 ni au 756 ; le 414 sans nature · le cabinet choisit
  // parmi les comptes de change.
  ['SYSCOHADA', 'FINANCIERE', 'PERTE', '65600000', false],
  ['SYSCOHADA', 'FINANCIERE', 'PERTE', '67600000', true],
  ['SYSCOHADA', null, 'GAIN', '75600000', true],
  ['SYSCOHADA', null, 'GAIN', '75800000', false],
];

/**
 * LA NATURE LUE SUR LE COMPTE, serveur et écran sur une seule table (A6 bis,
 * M3) · le spec du client la relit et la rejoue sur sa recopie.
 */
export const CAS_NATURE: Array<['SYSCOHADA' | 'SYCEBNL', string, 'COMMERCIALE' | 'FINANCIERE' | null]> = [
  ['SYSCOHADA', '40110000', 'COMMERCIALE'],
  ['SYSCOHADA', '40410000', 'FINANCIERE'],
  ['SYSCOHADA', '40470000', 'FINANCIERE'],
  ['SYSCOHADA', '48120000', 'FINANCIERE'],
  ['SYSCOHADA', '41110000', 'COMMERCIALE'],
  ['SYSCOHADA', '41420000', null],
  ['SYSCOHADA', '16200000', 'FINANCIERE'],
  ['SYCEBNL', '40110000', 'COMMERCIALE'],
  ['SYCEBNL', '41200000', 'COMMERCIALE'],
  ['SYCEBNL', '16200000', null],
  ['SYCEBNL', '18710000', 'FINANCIERE'],
];

describe('les comptes admis pour l’écart, serveur et écran sur une seule table', () => {
  it.each(CAS_ADMIS)('%s, nature %s, %s · %s admis : %s', (referentiel, nature, ecart, numero, admis) => {
    expect(compteAdmisPourEcart(racinesAdmises(referentiel, nature, ecart), numero)).toBe(admis);
    expect(motifRefusCompteEcart({ referentiel, nature, ecart, numero }) === null).toBe(admis);
  });

  it.each(CAS_NATURE)('%s · %s · nature %s', (referentiel, numero, nature) => {
    expect(natureDuCompte(numero, referentiel)).toBe(nature);
  });

  // A6 bis, M3 · le Titre VIII ch. 22 § 1.1, relu · « Lorsque le prix payé
  // [...] est différent du coût initial comptabilisé, par suite de modalités
  // spéciales de règlement (cas de paiement à terme libellé en devises), la
  // différence constitue une charge ou un produit financier ». Les semis
  // disent ce que sont le 404 et le 414 ; le SYCEBNL n'ouvre ni l'un ni l'autre.
  it('le 404 et le 414 tels que les semis les ouvrent · le SYCEBNL n’en a aucun', () => {
    const syscohada = new Map(PLAN_COMPTES_SYSCOHADA.map((c) => [c.numero, c.intitule]));
    expect(syscohada.get('404')).toMatch(/acquisitions courantes d.immobilisations/i);
    expect(syscohada.get('414')).toMatch(/cessions courantes d.immobilisations/i);
    expect(PLAN_COMPTES_SYCEBNL.some((c) => c.numero.startsWith('404') || c.numero.startsWith('414'))).toBe(false);
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

  // A6 bis, B1 · la règle pure refuse elle-même ce qui est nul ou négatif,
  // quelle que soit la porte, sur la valeur que la pièce porterait (arrondie).
  it('rien de nul ni de négatif · francs, cours saisi ou déduit, montant en devise', () => {
    const t = () => true;
    for (const francs of [0, -600, null, Number.NaN, 0.004]) {
      expect(coursEtFrancsDuReglement({ montantDevise: 600, francs, tolerance: t })).toEqual({ motif: expect.stringMatching(/francs doit être strictement positif/) });
    }
    for (const cours of [0, -1, null, Number.NaN]) {
      expect(coursEtFrancsDuReglement({ montantDevise: 600, cours, tolerance: t })).toEqual({ motif: expect.stringMatching(/cours du jour du règlement doit être strictement positif/) });
    }
    // Un cours qui ne fait pas un centime · la trésorerie porterait zéro.
    expect(coursEtFrancsDuReglement({ montantDevise: 0.01, cours: 0.1, tolerance: t })).toEqual({ motif: expect.stringMatching(/francs doit être/) });
    // Des francs qui ne font pas un cours à six décimales.
    expect(coursEtFrancsDuReglement({ montantDevise: 1_000_000, francs: 0.01, tolerance: t })).toEqual({ motif: expect.stringMatching(/cours du jour/) });
    for (const montantDevise of [0, -600, Number.NaN]) {
      expect(coursEtFrancsDuReglement({ montantDevise, cours: 1750, tolerance: t })).toEqual({ motif: expect.stringMatching(/devise doit être strictement positif/) });
    }
    expect(coursEtFrancsDuReglement({ montantDevise: 600, cours: 1750, tolerance: t })).toEqual({ cours: 1750, francs: 1050000 });
  });

  it('la porte · `montant` facultatif, jamais `null`, zéro ni négatif', async () => {
    const uuid = '0f8fad5b-d9cb-469f-a165-70867728950e';
    const erreurs = async (montant: unknown) =>
      (await validate(plainToInstance(ReglementTiersDto, { compteId: uuid, ligneIds: [uuid], montant }))).map((e) => e.property);
    expect(await erreurs(null)).toEqual(['montant']);
    expect(await erreurs(0)).toEqual(['montant']);
    expect(await erreurs(-600)).toEqual(['montant']);
    expect(await erreurs(1050000)).toEqual([]);
    expect((await validate(plainToInstance(ReglementTiersDto, { compteId: uuid, ligneIds: [uuid] }))).length).toBe(0);
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

  // A6 bis, M4 · deux factures du MÊME jour à des cours différents · l'ordre
  // ne dépend plus de celui où la base les rend · l'identifiant de ligne
  // départage, au serveur comme à l'écran (même cas au spec du client).
  it('deux factures du même jour · départagées par l’identifiant de ligne, quel que soit l’ordre reçu', () => {
    const a = { id: 'a', francs: 160000, montantDevise: 100, date: new Date('2026-03-10') };
    const b = { id: 'b', francs: 170000, montantDevise: 100, date: new Date('2026-03-10') };
    expect(coutHistoriqueRegle([b, a], 100)).toBe(160000);
    expect(coutHistoriqueRegle([a, b], 100)).toBe(160000);
    expect(coutHistoriqueRegle([b, a], 150)).toBe(245000);
  });

  // A6 bis, M1 · la règle rejouée sur des règlements successifs (le
  // signalement D4 la relit après coup) · chacun reprend où le précédent
  // s'est arrêté, et la part qui épuise une facture prend ce qui reste de
  // ses francs, au centime.
  it('règlements successifs · le premier rend coutHistoriqueRegle, la facture entamée s’épuise au centime', () => {
    const f = { id: 'f', francs: 1000.01, montantDevise: 3, date: new Date('2026-01-10') };
    const g = { id: 'g', francs: 340000, montantDevise: 200, date: new Date('2026-03-10') };
    const couts = coutsHistoriquesSuccessifs([g, f], [1, 2, 100]);
    expect(couts[0]).toBe(coutHistoriqueRegle([g, f], 1));
    expect(Math.round((couts[0]! + couts[1]!) * 100) / 100).toBe(1000.01);
    expect(couts[2]).toBe(170000);
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

/** La référence de colonne que la doublure rend pour `fields.credit`. */
const CHAMP_CREDIT = { colonne: 'credit' };
type Borne = { gt?: unknown; lt?: unknown; gte?: unknown; lte?: unknown };
type FiltreLigne = {
  compteId?: string;
  deviseId?: string;
  id?: { notIn?: string[] };
  lettre?: null;
  lettrageId?: null;
  debit?: Borne;
  credit?: Borne;
  ecriture?: { exerciceId?: string; OR?: Array<Record<string, boolean>> };
};
type LigneDouble = {
  id: string;
  compteId: string;
  debit: number;
  credit: number;
  deviseId: string | null;
  montantDevise: number | null;
  lettre?: string | null;
  lettrageId?: string | null;
  ecriture: Record<string, unknown> & { exerciceId: string };
};
function ligneRetenue(l: LigneDouble, where: FiltreLigne): boolean {
  if (where.compteId !== undefined && l.compteId !== where.compteId) return false;
  if (where.deviseId !== undefined && l.deviseId !== where.deviseId) return false;
  if (where.id?.notIn?.includes(l.id)) return false;
  if ('lettre' in where && (l.lettre ?? null) !== null) return false;
  if ('lettrageId' in where && (l.lettrageId ?? null) !== null) return false;
  if (where.ecriture?.exerciceId !== undefined && l.ecriture.exerciceId !== where.ecriture.exerciceId) return false;
  if (where.ecriture?.OR && !where.ecriture.OR.some((c) => Object.entries(c).every(([k, v]) => (l.ecriture[k] ?? false) === v))) return false;
  const valeur = (b: unknown) => (b === CHAMP_CREDIT ? l.credit : Number(b));
  for (const colonne of ['debit', 'credit'] as const) {
    const borne = where[colonne];
    if (!borne) continue;
    const x = l[colonne];
    if (borne.gt !== undefined && !(x > valeur(borne.gt))) return false;
    if (borne.lt !== undefined && !(x < valeur(borne.lt))) return false;
    if (borne.gte !== undefined && !(x >= valeur(borne.gte))) return false;
    if (borne.lte !== undefined && !(x <= valeur(borne.lte))) return false;
  }
  return true;
}

function monter(referentiel: 'SYSCOHADA' | 'SYCEBNL' = 'SYSCOHADA', lignesEnPlus: unknown[] = []) {
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
  (lignes as unknown[]).push(...lignesEnPlus);
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
      // M6 · la doublure HONORE la requête (F4b) · compte, devise, factures
      // écartées, lettre, groupe, exercice, drapeaux d'à-nouveau, colonne et
      // signe, et la comparaison d'une colonne à l'autre (`fields.credit`).
      fields: { credit: CHAMP_CREDIT },
      aggregate: jest.fn(async ({ where }: { where: FiltreLigne }) => {
        const retenues = (lignes as LigneDouble[]).filter((l) => ligneRetenue(l, where));
        const somme = (f: (l: LigneDouble) => number) => (retenues.length > 0 ? retenues.reduce((s, l) => s + f(l), 0) : null);
        return {
          _sum: {
            montantDevise: somme((l) => Number(l.montantDevise ?? 0)),
            debit: somme((l) => l.debit),
            credit: somme((l) => l.credit),
          },
        };
      }),
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
    // A7 ter, mineur 1 · aucune créance reclassée sur ces comptes.
    creanceDouteuse: { findMany: jest.fn(async () => []) },
    // Aucune réévaluation · ni de l'exercice, ni d'antérieure restée en place (M5).
    reevaluation: { findFirst: jest.fn(async (): Promise<unknown> => null), findMany: jest.fn(async (): Promise<unknown[]> => []) },
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

  // A6 bis, M4 · deux factures du même jour, rendues par la base dans
  // l'ordre b, a et choisies dans cet ordre · le passage éteint d'abord la
  // facture de plus petit identifiant de ligne, comme l'écran l'a estimé.
  it('deux factures du même jour · le passage suit l’identifiant de ligne, jamais l’ordre reçu', async () => {
    const ecriture = { exerciceId: 'ex', date: new Date('2026-03-10'), journalId: 'jACH', journal: { code: 'ACH' }, exercice: { statut: 'OUVERT' } };
    const compte = { numero: '40110000', intitule: 'NZUZI', lettrable: true };
    const { service, creer } = monter('SYSCOHADA', [
      { id: 'jb', compteId: 'c401', debit: 0, credit: 170000, deviseId: 'usd', montantDevise: 100, lettrageId: null, compte, ecriture },
      { id: 'ja', compteId: 'c401', debit: 0, credit: 160000, deviseId: 'usd', montantDevise: 100, lettrageId: null, compte, ecriture },
    ]);
    await service.enregistrer('t', 'u', {
      ...base,
      sens: 'FOURNISSEUR',
      reglements: [{ compteId: 'c401', ligneIds: ['jb', 'ja'], montantDevise: 100, coursReglement: 1750 }],
    });
    expect(resume(creer.mock.calls[0][2].lignes)).toEqual([
      ['c401', 160000, 0],
      ['c656', 15000, 0],
      ['c571', 0, 175000],
    ]);
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

  // A6 bis, B1 · reproduit par la relecture adverse. 600 USD « payés » zéro
  // franc passaient D 401 1 008 000 / C 52 0 / C 756 1 008 000 ; `null`
  // idem ; -600 donnait un cours de -1. Refus avant toute pièce.
  it.each([
    ['zéro franc payé', { montantDevise: 600, montant: 0 }],
    ['des francs nuls (null)', { montantDevise: 600, montant: null }],
    ['des francs négatifs', { montantDevise: 600, montant: -600 }],
    ['un cours nul', { montantDevise: 600, coursReglement: 0 }],
    ['un cours négatif', { montantDevise: 600, coursReglement: -1 }],
    ['un montant en devise nul (null)', { montantDevise: null, coursReglement: 1750 }],
  ])('%s · refus nommé, avant toute pièce', async (_cas, saisie) => {
    const { service, creer } = monter();
    await expect(
      service.enregistrer('t', 'u', {
        ...base,
        sens: 'FOURNISSEUR',
        reglements: [{ compteId: 'c401', ligneIds: ['fm'], ...(saisie as Record<string, number>) }],
      }),
    ).rejects.toThrow(/strictement positif/);
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

  it('SYCEBNL · sans compte choisi, la perte va au 658 prescrit (décision D2)', async () => {
    const { service, creer } = monter('SYCEBNL');
    await service.enregistrer('t', 'u', {
      ...base,
      sens: 'FOURNISSEUR',
      reglements: [{ compteId: 'c401', ligneIds: ['fm'], montantDevise: 600, coursReglement: 1750 }],
    });
    expect(resume(creer.mock.calls[0][2].lignes)[1]).toEqual(['c658', 42000, 0]);
  });

  it('SYCEBNL · le 676 choisi est refusé, le 658 passe', async () => {
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
    ).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/a lu une facture choisie du 40110000.*annulez cette réévaluation/) });
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

/**
 * A6 bis, M6 · LA FACTURE DE N PAYÉE EN PARTIE, REPORTÉE ENTIÈRE EN N+1.
 * Vérifié · le report Détail lit les lignes sans lettre, et un groupe
 * PARTIEL n'en pose aucune · la facture de 1 160 USD et le règlement de
 * 600 USD passent en N+1 chacun de son côté, sans lien. Premier tour de
 * relecture · la borne ne vise que les lignes CHOISIES qui sont elles-mêmes
 * des à-nouveaux, contre LEUR part ; une facture de l'exercice n'en est
 * jamais bornée, et rien d'autre ne borne (fiche du compte 40 · le compte
 * est aussi « débité des avances et acomptes versés »).
 */
describe('la facture de N payée en partie, reportée entière en N+1', () => {
  const aNouveau = (drapeaux: Record<string, boolean>) => ({
    exerciceId: 'ex',
    date: new Date('2026-01-01'),
    journalId: 'jAN',
    journal: { code: 'AN' },
    exercice: { statut: 'OUVERT' },
    ...drapeaux,
  });
  const cloture = aNouveau({ estGenereeParCloture: true, estSoldeDesComptesDeGestion: false });
  const ordinaire = { exerciceId: 'ex', date: new Date('2026-02-10'), journalId: 'jBQ', journal: { code: 'BQ' }, exercice: { statut: 'OUVERT' } };
  const ligne = (id: string, compteId: string, debit: number, credit: number, devise: number, ecriture: object, enPlus: object = {}) => ({
    id,
    compteId,
    debit,
    credit,
    deviseId: 'usd',
    montantDevise: devise,
    lettre: null,
    lettrageId: null,
    compte: { numero: compteId === 'c401' ? '40110000' : '41110000', intitule: 'Tiers', lettrable: true },
    ecriture,
    ...enPlus,
  });
  // La facture de N reportée ENTIÈRE par l'à-nouveau · 1 160 USD à 1 680.
  const factureReportee = (ecriture: object = cloture) => ligne('ranF', 'c401', 0, 1_948_800, 1160, ecriture);
  const reglerLaReportee = { ...base, sens: 'FOURNISSEUR' as const, reglements: [{ compteId: 'c401', ligneIds: ['ranF'], coursReglement: 1750 }] };
  const reglerFm = { ...base, sens: 'FOURNISSEUR' as const, reglements: [{ compteId: 'c401', ligneIds: ['fm'], coursReglement: 1750 }] };

  it('le report Détail reprend la facture entière et le règlement partiel, chacun sans lettre (la vérification)', () => {
    const report = lignesReportANouveau(
      [
        {
          id: 'c401',
          numero: '40110000',
          intitule: 'NZUZI',
          modeReportANouveau: 'DETAIL',
          lignes: [
            // Le groupe PARTIEL de N · aucune lettre posée, les deux lignes sont lues.
            { debit: 0, credit: 1_948_800, lettre: null, libelle: 'Facture', dateEcheance: null, deviseId: 'usd', montantDevise: 1160 },
            { debit: 1_008_000, credit: 0, lettre: null, libelle: 'Règlement', dateEcheance: null, deviseId: 'usd', montantDevise: 600 },
          ],
        },
      ],
      null,
    );
    expect(report.map((l) => [l.debit, l.credit, l.montantDevise])).toEqual([
      [0, 1_948_800, 1160],
      [1_008_000, 0, 600],
    ]);
  });

  it('la ligne d’à-nouveau choisie, 1 160 USD contre 600 reportés · refusée avant toute pièce, l’issue nommée ; 560 USD passent', async () => {
    // L'à-nouveau PROVISOIRE ne se règle plus ici (second tour, m6) · refusé
    // avant la borne, l'issue nommée.
    const provisoire = monter('SYSCOHADA', [
      factureReportee(aNouveau({ estANouveauProvisoire: true })),
      ligne('ranP', 'c401', 1_008_000, 0, 600, aNouveau({ estANouveauProvisoire: true })),
    ]);
    await expect(provisoire.service.enregistrer('t', 'u', reglerLaReportee)).rejects.toThrow(/la ligne d'à-nouveau choisie est PROVISOIRE/);
    for (const drapeaux of [{ estGenereeParCloture: true, estSoldeDesComptesDeGestion: false }] as Array<Record<string, boolean>>) {
      const enPlus = [factureReportee(aNouveau(drapeaux)), ligne('ranP', 'c401', 1_008_000, 0, 600, aNouveau(drapeaux))];
      const { service, creer } = monter('SYSCOHADA', enPlus);
      await expect(service.enregistrer('t', 'u', reglerLaReportee)).rejects.toThrow(
        /600\.00 dans la devise des factures choisies sont déjà réglés au report à-nouveau[\s\S]*Les lignes d'à-nouveau choisies ne doivent plus que 560\.00 · réglez au plus 560\.00, puis complétez le lettrage/,
      );
      // L'issue qui reste, nommée (second tour, m5).
      await expect(service.enregistrer('t', 'u', reglerLaReportee)).rejects.toThrow(
        /Pour payer autrement, saisissez le règlement au journal de trésorerie, puis lettrez-le à la main avec la facture qu'il solde/,
      );
      await expect(
        service.enregistrer('t', 'u', { ...reglerLaReportee, reglements: [{ compteId: 'c401', ligneIds: ['ranF'], montantDevise: 560.01, coursReglement: 1750 }] }),
      ).rejects.toThrow(/au plus 560\.00/);
      expect(creer).not.toHaveBeenCalled();
    }
    const { service, creer, lettrerManuel } = monter('SYSCOHADA', [factureReportee(), ligne('ranP', 'c401', 1_008_000, 0, 600, cloture)]);
    await service.enregistrer('t', 'u', { ...reglerLaReportee, reglements: [{ compteId: 'c401', ligneIds: ['ranF'], montantDevise: 560, coursReglement: 1750 }] });
    // 560 USD au coût historique de la facture · 1 948 800 × 560 / 1 160 = 940 800.
    expect(resume(creer.mock.calls[0][2].lignes)).toEqual([
      ['c401', 940_800, 0],
      ['c656', 39_200, 0],
      ['c571', 0, 980_000],
    ]);
    expect(lettrerManuel).toHaveBeenCalledWith('t', 'c401', ['ranF', 'p1-0'], 'u', { autoriserPartiel: true, ecartChangeRealise: 39_200 });
  });

  it('une facture de l’exercice, à côté d’un règlement reporté, n’est jamais bornée par lui (le premier tour la refusait à tort)', async () => {
    const { service, creer } = monter('SYSCOHADA', [factureReportee(), ligne('ranP', 'c401', 1_008_000, 0, 600, cloture)]);
    await service.enregistrer('t', 'u', reglerFm);
    expect(resume(creer.mock.calls[0][2].lignes)[0]).toEqual(['c401', 1_948_800, 0]);
  });

  it('un lot · la facture de l’exercice garde son dû entier, la reportée sa seule part (2 320 dus, 1 720 au plus)', async () => {
    const lot = { ...base, sens: 'FOURNISSEUR' as const, reglements: [{ compteId: 'c401', ligneIds: ['ranF', 'fm'], coursReglement: 1750 }] };
    const { service, creer } = monter('SYSCOHADA', [factureReportee(), ligne('ranP', 'c401', 1_008_000, 0, 600, cloture)]);
    await expect(service.enregistrer('t', 'u', lot)).rejects.toThrow(/ne doivent plus que 560\.00 · réglez au plus 1720\.00/);
    await service.enregistrer('t', 'u', { ...lot, reglements: [{ ...lot.reglements[0]!, montantDevise: 1720 }] });
    expect(creer).toHaveBeenCalledTimes(1);
  });

  it('côté client, l’encaissement reporté borne la créance reportée de même', async () => {
    const { service, creer } = monter('SYSCOHADA', [ligne('ranC', 'c411', 1_948_800, 0, 1160, cloture), ligne('ranE', 'c411', 0, 1_008_000, 600, cloture)]);
    await expect(
      service.enregistrer('t', 'u', { ...base, sens: 'CLIENT', reglements: [{ compteId: 'c411', ligneIds: ['ranC'], coursReglement: 1750 }] }),
    ).rejects.toThrow(/réglez au plus 560\.00/);
    expect(creer).not.toHaveBeenCalled();
  });

  it('une ligne reportée déjà lettrée avec SA facture, ou annulée par son inscription en négatif · ne borne rien', async () => {
    // Le règlement reporté, rendu en N+1 à la facture qu'il réglait (groupe partiel G).
    const lettree = monter('SYSCOHADA', [
      factureReportee(),
      ligne('f3', 'c401', 0, 1_850_000, 1000, cloture, { lettrageId: 'G' }),
      ligne('ranP', 'c401', 1_008_000, 0, 600, cloture, { lettrageId: 'G' }),
    ]);
    await lettree.service.enregistrer('t', 'u', reglerLaReportee);
    expect(lettree.creer).toHaveBeenCalled();
    // Le montant en devise est stocké SANS signe · c'est le débit négatif qui annule.
    const annulee = monter('SYSCOHADA', [
      factureReportee(),
      ligne('ranP', 'c401', 1_008_000, 0, 600, cloture),
      ligne('ranN', 'c401', -1_008_000, 0, 600, cloture),
    ]);
    await annulee.service.enregistrer('t', 'u', reglerLaReportee);
    expect(annulee.creer).toHaveBeenCalled();
  });

  it('un règlement, un acompte ou un avoir non lettré passé dans l’exercice ne borne rien · l’avoir se lettre à part (fiche du compte 40)', async () => {
    const { service, creer, prisma } = monter('SYSCOHADA', [ligne('p', 'c401', 1_050_000, 0, 600, ordinaire)]);
    await service.enregistrer('t', 'u', reglerFm);
    expect(creer).toHaveBeenCalled();
    // Aucune ligne d'à-nouveau choisie · le compte n'est même pas relu.
    expect(prisma.ligneEcriture.aggregate).not.toHaveBeenCalled();
  });

  it('la doublure lit la requête · lignes reportées du compte, de la devise et de l’exercice, hors groupe, factures choisies écartées', async () => {
    const { service, prisma } = monter('SYSCOHADA', [factureReportee()]);
    await service.enregistrer('t', 'u', reglerLaReportee);
    const appels = (prisma.ligneEcriture.aggregate as unknown as jest.Mock).mock.calls.map((c) => c[0]);
    expect(appels).toHaveLength(4);
    for (const { where: w } of appels) {
      expect(w).toMatchObject({
        compteId: 'c401',
        id: { notIn: ['ranF'] },
        lettrageId: null,
        ecriture: { tenantId: 't', exerciceId: 'ex', OR: [{ estANouveauProvisoire: true }, { estGenereeParCloture: true, estSoldeDesComptesDeGestion: false }] },
      });
    }
    // Dans la devise, puis en francs sans devise (m4), chacun par son signe.
    expect(appels.map((a) => a.where.deviseId)).toEqual(['usd', 'usd', null, null]);
    expect(appels[0].where).toMatchObject({ debit: { gt: 0 } });
    expect(appels[1].where).toMatchObject({ debit: { lt: 0 } });
    expect(appels[2]).toMatchObject({ where: { debit: { gt: 0 } }, _sum: { debit: true } });
    expect(appels[3]).toMatchObject({ where: { debit: { lt: 0 } }, _sum: { debit: true } });
  });

  // Second tour, m4 · un règlement reporté en francs SANS devise (avant A6)
  // ne se lit pas dans la devise · il n'arrête rien, et il est dit.
  it('un règlement reporté en francs sans devise · le règlement passe, avec l’avertissement qui le chiffre', async () => {
    const enFrancs = { ...ligne('ranX', 'c401', 500_000, 0, 0, cloture), deviseId: null, montantDevise: null };
    const { service, creer } = monter('SYSCOHADA', [factureReportee(), enFrancs]);
    const r = await service.enregistrer('t', 'u', reglerLaReportee);
    expect(creer).toHaveBeenCalled();
    expect(r.avertissements).toEqual([expect.stringMatching(/40110000 · 500000\.00 en francs, sans devise, sont reportés à l'à-nouveau de ce compte hors de tout lettrage/)]);
    // Sans règlement reporté en francs, aucun avertissement.
    const net = monter('SYSCOHADA', [factureReportee()]);
    expect((await net.service.enregistrer('t', 'u', reglerLaReportee)).avertissements).toEqual([]);
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
      /RIB du journal CA est tenu en USD · cochez « Moyen de paiement en devise ».*ou, si le RIB est mal renseigné, corrigez sa devise \(Banques\)/,
    );
    expect(creer).not.toHaveBeenCalled();
  });

  // A6 bis, B3 · reproduit par la relecture adverse. Le RIB n'était lu que
  // si le lot portait une facture en devise · une banque en USD qui payait
  // des factures en francs passait C 52 sans devise, et la conversion des
  // disponibilités à la clôture (art. 57) partait d'une position fausse.
  it('le RIB du journal tenu en USD, des factures en francs, case décochée · refus avant toute pièce', async () => {
    const { service, prisma, creer } = monter();
    (prisma.ribBanque.findFirst as jest.Mock).mockResolvedValueOnce({ devise: 'USD' });
    await expect(
      service.enregistrer('t', 'u', { ...base, sens: 'FOURNISSEUR', reglements: [{ compteId: 'c402', ligneIds: ['ff'] }] }),
    ).rejects.toThrow(/RIB du journal CA est tenu en USD et les factures choisies sont en francs.*ou, si le RIB est mal renseigné, corrigez sa devise \(Banques\)/);
    expect(creer).not.toHaveBeenCalled();
    // Un RIB en francs, ou sans devise renseignée (le franc), ne s'oppose à rien.
    for (const devise of ['cdf', null, '']) {
      (prisma.ribBanque.findFirst as jest.Mock).mockResolvedValueOnce({ devise });
      await service.enregistrer('t', 'u', { ...base, sens: 'FOURNISSEUR', reglements: [{ compteId: 'c402', ligneIds: ['ff'] }] });
    }
    expect(creer).toHaveBeenCalledTimes(3);
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
    // Un lot en francs sur un RIB en USD, case décochée · refus (B3).
    expect(
      motifRefusTresorerieEnDevise({
        tresorerieEnDevise: false,
        devisesDuLot: [null, null],
        deviseTresorerie: null,
        deviseRib: ' usd ',
        monnaieDeTenue: 'CDF',
        journalCode: 'BQ',
      }),
    ).toMatch(/tenu en USD et les factures choisies sont en francs/);
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
    // Les lignes du groupe, lues sur tous leurs exercices (A6 ter, m-4) ·
    // toutes de l'exercice, avant la réévaluation.
    compteId: 'c401',
    ecriture: { exerciceId: 'ex', date: new Date('2026-06-01') },
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
    // Sa propre ligne complète le groupe, sous la tolérance nommée (B2).
    expect(completer).toHaveBeenCalledWith('t', 'L', ['p1-1'], { groupeTolere: 'L' });
    expect(r).toMatchObject({ ecart: 123200, compte: '65600000', statut: 'SOLDE' });
    expect(creer.mock.calls[0][2].libelle).toBe('Perte de change réalisée · 40110000 a');
    // Le report au premier jour ouvert n'est jamais demandé d'office.
    expect(creer.mock.calls[0][2]).not.toHaveProperty('reporterAuPremierJourOuvert');
  });

  // A6 bis, second tour, B2 · le dénouement dans une période close · l'écart
  // s'enregistre au premier jour non clôturé SUR DEMANDE, sa date de valeur
  // gardée (AUDCIF art. 22, 4°), et la réponse dit les deux dates.
  it('période close · la demande expresse passe à la saisie, la date posée et la date de valeur reviennent', async () => {
    const { service, creer, propositionEcartChange, prisma } = monter();
    propositionEcartChange.mockResolvedValueOnce(proposition);
    (prisma.journal.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'od', code: 'OD', type: 'GENERAL' });
    creer.mockImplementationOnce(async (_t: string, _u: string, dto: { lignes: { compteId: string }[] }) => ({
      id: 'e1',
      numeroPiece: 1,
      date: new Date('2026-12-01'),
      dateValeur: new Date('2026-11-30'),
      lignes: dto.lignes.map((l, i) => ({ ...l, id: `p1-${i}` })),
    }));
    const r = await service.passerEcartChange('t', 'u', {
      lettrageId: 'L',
      exerciceId: 'ex',
      journalId: 'od',
      date: '2026-11-30',
      reporterAuPremierJourOuvert: true,
    });
    expect(creer.mock.calls[0][2]).toMatchObject({ date: '2026-11-30', reporterAuPremierJourOuvert: true });
    expect(r).toMatchObject({ date: new Date('2026-12-01'), dateValeur: new Date('2026-11-30') });
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
