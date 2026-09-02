import { readFileSync } from 'fs';
import { join } from 'path';
import { PLAN_COMPTES_SYSCOHADA } from '../comptes/compte-seed-syscohada';
import { correspond } from '../etats-financiers/etats-financiers.communs';
import {
  AMORTISSEMENT_SMT,
  CLAUSE_EQUIVALENT_ART13,
  COMPTES_CHIFFRE_AFFAIRES_ART13,
  COMPTES_DEPRECIATION_TRESORERIE_SMT_SYSCOHADA,
  COMPTES_DOTATIONS_SMT_SYSCOHADA,
  COMPTES_RESULTAT_SMT_SYSCOHADA,
  COMPTES_TRESORERIE_SMT_SYSCOHADA,
  CONTREPARTIES_HORS_RESULTAT_SMT_SYSCOHADA,
  CONTREPARTIES_RESULTAT_SMT_SYSCOHADA,
  DEFINITION_VARIATION_SMT_SYSCOHADA,
  DOCUMENTS_SMT_SYSCOHADA,
  JOURNAUX_DE_SUIVI_SMT_SYSCOHADA,
  LETTRES_D_E_SMT_SYSCOHADA,
  LIBELLE_RESULTAT_SMT_SYSCOHADA,
  LIGNES_SYNTHESE_NOTE_2_SMT_SYSCOHADA,
  NOTES_SMT_SYSCOHADA,
  ORDRE_BILAN_ACTIF_SMT_SYSCOHADA,
  ORDRE_BILAN_PASSIF_SMT_SYSCOHADA,
  ORDRE_COMPTE_RESULTAT_SMT_SYSCOHADA,
  POSTES_BILAN_ACTIF_SMT_SYSCOHADA,
  POSTES_BILAN_PASSIF_SMT_SYSCOHADA,
  POSTES_DEPENSES_SMT_SYSCOHADA,
  POSTES_RECETTES_SMT_SYSCOHADA,
  REF_RESULTAT_SMT_SYSCOHADA,
  RETRAITEMENTS_SMT_SYSCOHADA,
  SEUILS_SMT_ART13_FCFA,
  TOTAUX_BILAN_ACTIF_SMT_SYSCOHADA,
  TOTAUX_BILAN_PASSIF_SMT_SYSCOHADA,
  TOTAUX_COMPTE_RESULTAT_SMT_SYSCOHADA,
  VENTILATION_DEPENSES_SMT_SYSCOHADA,
  VENTILATION_RECETTES_SMT_SYSCOHADA,
  calculerResultatSmt,
  trouvePosteBilanSmtSyscohada,
} from './correspondance-smt-syscohada';

/**
 * Intégrité structurelle des maquettes SMT SYSCOHADA (AUDCIF Titre X).
 * Ces tests relisent la SOURCE (libellés et ordre des maquettes des ch. 2
 * et 3, plan semé) plutôt que d'affirmer que la table est juste : une ligne
 * de maquette oubliée, un compte cité qui n'existe pas au plan, un compte
 * de bilan qu'aucun poste ne capte ou que deux postes captent, une
 * variation prise dans le mauvais sens · autant d'erreurs qui ne lèvent
 * aucune exception et ne se verraient qu'au dépôt des états.
 */

/** Libellés du bilan SMT, Titre X ch. 2 § 1, dans l'ordre du texte (lus, pas déduits). */
const MAQUETTE_ACTIF = ['Immobilisations (1)', 'Stocks', 'Clients et débiteurs divers', 'Caisse', 'Banque (en + ou en –)', 'Total actif'];
const MAQUETTE_PASSIF = ['Compte exploitant', 'Résultat exercice', 'Emprunt', 'Fournisseurs et créditeurs divers', 'Total passif'];

/** Rubriques du compte de résultat SMT, Titre X ch. 2 § 2, dans l'ordre du texte. */
const MAQUETTE_COMPTE_RESULTAT = [
  'Recettes sur ventes ou prestations de services',
  'Autres recettes sur activités',
  'TOTAL DES RECETTES SUR PRODUITS',
  'Dépenses sur achats',
  'Dépenses sur loyers',
  'Dépenses sur salaires',
  'Dépenses sur impôts et taxes',
  "Charges d'intérêts",
  'Autres dépenses sur activités',
  'TOTAL DÉPENSES SUR CHARGES',
  'SOLDE : Excédent (+) ou insuffisance (–) de recettes (C = A – B)',
  '– Variation des stocks N / N-1',
  '– Variation des créances N / N-1',
  "+ Variation des dettes d'exploitation N / N-1",
  'DOTATIONS AMORTISSEMENTS',
  'RÉSULTAT EXERCICE (G = C – D + E – F)',
];

/** Comptes d'imputation (feuilles) du semis, par classe. */
const FEUILLES = PLAN_COMPTES_SYSCOHADA.filter((c) => c.typeCompte !== 'TOTAL');
const FEUILLES_BILAN = FEUILLES.filter((c) => /^[1-5]/.test(c.numero));
const FEUILLES_1_A_8 = FEUILLES.filter((c) => /^[1-8]/.test(c.numero));

const TOUS_POSTES_BILAN = [...POSTES_BILAN_ACTIF_SMT_SYSCOHADA, ...POSTES_BILAN_PASSIF_SMT_SYSCOHADA];

/** Libellé d'une ref, postes de détail, totaux et résultat confondus. */
function libelleDe(ref: string): string | undefined {
  // Lu dans la constante exportée, jamais recopié : c'est ELLE que le
  // service imprimera, et une divergence avec la maquette doit casser ici.
  if (ref === REF_RESULTAT_SMT_SYSCOHADA) return LIBELLE_RESULTAT_SMT_SYSCOHADA;
  return (
    TOUS_POSTES_BILAN.find((p) => p.ref === ref)?.libelle ??
    [...TOTAUX_BILAN_ACTIF_SMT_SYSCOHADA, ...TOTAUX_BILAN_PASSIF_SMT_SYSCOHADA].find((t) => t.ref === ref)?.libelle ??
    [...POSTES_RECETTES_SMT_SYSCOHADA, ...POSTES_DEPENSES_SMT_SYSCOHADA].find((p) => p.ref === ref)?.libelle ??
    RETRAITEMENTS_SMT_SYSCOHADA.find((r) => r.ref === ref)?.libelle ??
    TOTAUX_COMPTE_RESULTAT_SMT_SYSCOHADA.find((t) => t.ref === ref)?.libelle
  );
}

/** Tous les préfixes cités par le bilan, avec leur rôle · pour vérifier qu'ils existent au plan. */
function prefixesBilanCites(): { prefixe: string; ref: string; role: string }[] {
  const out: { prefixe: string; ref: string; role: string }[] = [];
  for (const p of TOUS_POSTES_BILAN) {
    p.comptes.forEach((c) => out.push({ prefixe: c, ref: p.ref, role: 'comptes' }));
    p.exclusions?.forEach((c) => out.push({ prefixe: c, ref: p.ref, role: 'exclusions' }));
    p.comptesSansFiltreDeSens?.forEach((c) => out.push({ prefixe: c, ref: p.ref, role: 'comptesSansFiltreDeSens' }));
  }
  COMPTES_RESULTAT_SMT_SYSCOHADA.forEach((c) => out.push({ prefixe: c, ref: REF_RESULTAT_SMT_SYSCOHADA, role: 'resultat' }));
  return out;
}

/** Postes de bilan qui réclament un compte, par le jeu principal (soumis au sens) ou hors filtre. */
function postesReclamant(numero: string): { ref: string; parFiltre: boolean }[] {
  const out: { ref: string; parFiltre: boolean }[] = [];
  for (const p of TOUS_POSTES_BILAN) {
    if (correspond(numero, p.comptes, p.exclusions)) out.push({ ref: p.ref, parFiltre: p.sens_qualificatif !== undefined });
    if (p.comptesSansFiltreDeSens && correspond(numero, p.comptesSansFiltreDeSens)) out.push({ ref: p.ref, parFiltre: false });
  }
  return out;
}

describe('correspondance SMT SYSCOHADA (AUDCIF Titre X)', () => {
  // -------------------------------------------------------------------------
  // Structure
  // -------------------------------------------------------------------------

  it('le jeu SMT est celui du Titre X ch. 1 § 2 : Bilan, Compte de résultat, Notes annexes · pas de TFT (anomalie n° 3)', () => {
    expect([...DOCUMENTS_SMT_SYSCOHADA]).toEqual(['BILAN', 'COMPTE_DE_RESULTAT', 'NOTES_ANNEXES']);
    expect(AMORTISSEMENT_SMT).toEqual({ mode: 'LINEAIRE', prorataTemporis: false });
  });

  it("l'ordre du bilan reprend EXACTEMENT les libellés de la maquette du ch. 2 § 1, dans l'ordre du texte", () => {
    expect(ORDRE_BILAN_ACTIF_SMT_SYSCOHADA.map(libelleDe)).toEqual(MAQUETTE_ACTIF);
    expect(ORDRE_BILAN_PASSIF_SMT_SYSCOHADA.map(libelleDe)).toEqual(MAQUETTE_PASSIF);
  });

  it("l'ordre du compte de résultat reprend EXACTEMENT les rubriques de la maquette du ch. 2 § 2, dans l'ordre du texte", () => {
    expect(ORDRE_COMPTE_RESULTAT_SMT_SYSCOHADA.map(libelleDe)).toEqual(MAQUETTE_COMPTE_RESULTAT);
  });

  it('ne comporte aucune ref en double, bilan et compte de résultat confondus', () => {
    const toutes = [
      ...TOUS_POSTES_BILAN.map((p) => p.ref),
      ...TOTAUX_BILAN_ACTIF_SMT_SYSCOHADA.map((t) => t.ref),
      ...TOTAUX_BILAN_PASSIF_SMT_SYSCOHADA.map((t) => t.ref),
      REF_RESULTAT_SMT_SYSCOHADA,
      ...POSTES_RECETTES_SMT_SYSCOHADA.map((p) => p.ref),
      ...POSTES_DEPENSES_SMT_SYSCOHADA.map((p) => p.ref),
      ...RETRAITEMENTS_SMT_SYSCOHADA.map((r) => r.ref),
      ...TOTAUX_COMPTE_RESULTAT_SMT_SYSCOHADA.map((t) => t.ref),
    ];
    expect(new Set(toutes).size).toBe(toutes.length);
  });

  it("les codes REF sont ceux choisis par OmegaX (préfixe S), jamais un code du Système normal ni d'un autre référentiel", () => {
    for (const ref of [...ORDRE_BILAN_ACTIF_SMT_SYSCOHADA, ...ORDRE_BILAN_PASSIF_SMT_SYSCOHADA, ...ORDRE_COMPTE_RESULTAT_SMT_SYSCOHADA]) {
      expect(ref).toMatch(/^S[A-Z0-9]{1,2}$/);
    }
  });

  it("l'ordre d'affichage du bilan couvre les postes de détail + totaux + résultat, rien de plus, rien de moins", () => {
    const refsActif = new Set([...POSTES_BILAN_ACTIF_SMT_SYSCOHADA.map((p) => p.ref), ...TOTAUX_BILAN_ACTIF_SMT_SYSCOHADA.map((t) => t.ref)]);
    expect(new Set(ORDRE_BILAN_ACTIF_SMT_SYSCOHADA)).toEqual(refsActif);
    const refsPassif = new Set([
      ...POSTES_BILAN_PASSIF_SMT_SYSCOHADA.map((p) => p.ref),
      ...TOTAUX_BILAN_PASSIF_SMT_SYSCOHADA.map((t) => t.ref),
      REF_RESULTAT_SMT_SYSCOHADA,
    ]);
    expect(new Set(ORDRE_BILAN_PASSIF_SMT_SYSCOHADA)).toEqual(refsPassif);
  });

  it('un total ne référence jamais une ref définie APRÈS lui · le calcul en une passe lirait 0 en silence', () => {
    const resolues = new Set([...TOUS_POSTES_BILAN.map((p) => p.ref), REF_RESULTAT_SMT_SYSCOHADA]);
    for (const total of [...TOTAUX_BILAN_ACTIF_SMT_SYSCOHADA, ...TOTAUX_BILAN_PASSIF_SMT_SYSCOHADA]) {
      for (const ref of total.deRefs) expect(resolues.has(ref)).toBe(true);
      resolues.add(total.ref);
    }
    // Et chaque poste de détail (résultat compris) entre dans le total de son côté.
    expect(TOTAUX_BILAN_ACTIF_SMT_SYSCOHADA[0].deRefs).toEqual(POSTES_BILAN_ACTIF_SMT_SYSCOHADA.map((p) => p.ref));
    expect(new Set(TOTAUX_BILAN_PASSIF_SMT_SYSCOHADA[0].deRefs)).toEqual(
      new Set([...POSTES_BILAN_PASSIF_SMT_SYSCOHADA.map((p) => p.ref), REF_RESULTAT_SMT_SYSCOHADA]),
    );
  });

  it('SP2 (résultat) est hors POSTES_PASSIF et ne vaut que le 13 · le 13 n’est réclamé par aucun poste de passif', () => {
    expect(REF_RESULTAT_SMT_SYSCOHADA).toBe('SP2');
    expect(trouvePosteBilanSmtSyscohada('SP2')).toBeUndefined();
    expect(COMPTES_RESULTAT_SMT_SYSCOHADA).toEqual(['13']);
    for (const c of FEUILLES_BILAN.filter((c) => c.numero.startsWith('13'))) {
      expect(postesReclamant(c.numero)).toEqual([]);
    }
  });

  // -------------------------------------------------------------------------
  // Bilan · comptes
  // -------------------------------------------------------------------------

  it('chaque préfixe cité par le bilan correspond à au moins un compte d’imputation du semis SYSCOHADA, dans les classes 1 à 5', () => {
    const absents = prefixesBilanCites().filter(({ prefixe }) => !FEUILLES_BILAN.some((c) => c.numero.startsWith(prefixe)));
    expect(absents).toEqual([]);
    for (const { prefixe } of prefixesBilanCites()) expect(prefixe).toMatch(/^[1-5]/);
  });

  it('aucun compte de bilan du semis n’est orphelin : chaque feuille des classes 1 à 5 est captée par un poste ou par le résultat', () => {
    const orphelins = FEUILLES_BILAN.filter(
      (c) => postesReclamant(c.numero).length === 0 && !correspond(c.numero, COMPTES_RESULTAT_SMT_SYSCOHADA),
    ).map((c) => c.numero);
    expect(orphelins).toEqual([]);
  });

  it('aucun compte n’est réclamé deux fois, sauf les tiers partagés entre SA3 et SP4 par le sens de leur solde', () => {
    for (const c of FEUILLES_BILAN) {
      const postes = postesReclamant(c.numero);
      if (postes.length <= 1) continue;
      // Un compte réclamé par deux postes ne peut l'être que par le couple
      // SA3 (débiteur) / SP4 (créditeur), tous deux par filtre de sens.
      expect(postes.map((p) => p.ref).sort()).toEqual(['SA3', 'SP4']);
      expect(postes.every((p) => p.parFiltre)).toBe(true);
    }
  });

  it('SA3 porte « débiteur », SP4 « créditeur », sur la même classe 4 hors 49 · l’union ne perd aucun tiers', () => {
    const sa3 = trouvePosteBilanSmtSyscohada('SA3')!;
    const sp4 = trouvePosteBilanSmtSyscohada('SP4')!;
    expect(sa3.sens_qualificatif).toBe('DEBITEUR');
    expect(sp4.sens_qualificatif).toBe('CREDITEUR');
    expect(sa3.comptes).toEqual(sp4.comptes);
    expect(sa3.exclusions).toEqual(sp4.exclusions);
    expect(sa3.exclusions).toEqual(['49']);
  });

  it('dépréciations et provisions à court terme (49, 59) · anomalie n° 5 : 490 à 498, 590, 591 en moins de l’actif ; 499, 599 au passif', () => {
    const sa3 = trouvePosteBilanSmtSyscohada('SA3')!;
    const sa5 = trouvePosteBilanSmtSyscohada('SA5')!;
    const sp4 = trouvePosteBilanSmtSyscohada('SP4')!;
    for (const n of ['49000000', '49110000', '49700000', '49800000', '59000000', '59100000']) {
      expect(postesReclamant(n).map((p) => p.ref)).toEqual(['SA3']);
      expect(correspond(n, sa3.comptesSansFiltreDeSens!)).toBe(true);
    }
    for (const n of ['59200000', '59300000', '59400000']) {
      expect(postesReclamant(n).map((p) => p.ref)).toEqual(['SA5']);
      expect(correspond(n, sa5.comptes)).toBe(true);
    }
    for (const n of ['49900000', '59900000']) {
      expect(postesReclamant(n).map((p) => p.ref)).toEqual(['SP4']);
      expect(correspond(n, sp4.comptesSansFiltreDeSens!)).toBe(true);
    }
  });

  it('titres de placement (50) et valeurs à encaisser (51) sont en SA3 sans filtre de sens · anomalie n° 6', () => {
    for (const n of ['50100000', '51300000']) {
      expect(postesReclamant(n)).toEqual([{ ref: 'SA3', parFiltre: false }]);
    }
  });

  it('Caisse = 57 seul ; Banque = 52 à 56 et 58 sans filtre de sens (« en + ou en – ») · anomalie n° 7', () => {
    expect(trouvePosteBilanSmtSyscohada('SA4')!.comptes).toEqual(['57']);
    const sa5 = trouvePosteBilanSmtSyscohada('SA5')!;
    expect(sa5.sens_qualificatif).toBeUndefined();
    expect(sa5.comptes).toEqual(['52', '53', '54', '55', '56', '58', '592', '593', '594']);
    // Aucun poste de passif ne reçoit un compte de trésorerie : le découvert reste à l'actif.
    for (const c of FEUILLES_BILAN.filter((c) => c.numero.startsWith('5'))) {
      expect(POSTES_BILAN_PASSIF_SMT_SYSCOHADA.filter((p) => correspond(c.numero, p.comptes, p.exclusions)).map((p) => p.ref)).toEqual([]);
    }
    // 585 et 588 (virements internes) ne sont pas masqués : ils ressortent en Banque.
    expect(postesReclamant('58500000').map((p) => p.ref)).toEqual(['SA5']);
    expect(postesReclamant('58800000').map((p) => p.ref)).toEqual(['SA5']);
  });

  it('Compte exploitant reçoit tous les capitaux propres hors 13 ; Emprunt reçoit 16 à 19 · anomalies n° 8 et 9', () => {
    expect(trouvePosteBilanSmtSyscohada('SP1')!.comptes).toEqual(['10', '11', '12', '14', '15']);
    expect(trouvePosteBilanSmtSyscohada('SP3')!.comptes).toEqual(['16', '17', '18', '19']);
    // Ni l'un ni l'autre ne filtre le sens : un 109 ou 129 débiteur ressort en négatif.
    expect(trouvePosteBilanSmtSyscohada('SP1')!.sens_qualificatif).toBeUndefined();
    expect(trouvePosteBilanSmtSyscohada('SP3')!.sens_qualificatif).toBeUndefined();
    // Toute feuille de classe 1 est en SP1, SP3 ou au résultat.
    for (const c of FEUILLES_BILAN.filter((c) => c.numero.startsWith('1'))) {
      const refs = postesReclamant(c.numero).map((p) => p.ref);
      if (c.numero.startsWith('13')) expect(refs).toEqual([]);
      else expect(['SP1', 'SP3']).toContain(refs[0]);
    }
  });

  it('les renvois de notes du bilan sont ceux imprimés par la maquette (Compte exploitant → 1, anomalie n° 4 ; Caisse et Banque sans renvoi)', () => {
    const notes = Object.fromEntries(TOUS_POSTES_BILAN.map((p) => [p.ref, p.note]));
    expect(notes).toEqual({ SA1: '1', SA2: '2', SA3: '3', SA4: null, SA5: null, SP1: '1', SP3: null, SP4: '3' });
  });

  it('chaque poste de bilan porte un fondement qui cite sa source', () => {
    for (const p of TOUS_POSTES_BILAN) {
      expect(p.fondement.length).toBeGreaterThan(40);
      expect(p.fondement).toMatch(/Titre VII|plan de comptes SYSCOHADA|Classe|NOTE/);
    }
  });

  // -------------------------------------------------------------------------
  // Compte de résultat · flux
  // -------------------------------------------------------------------------

  it('chaque préfixe cité par un poste de flux ou une colonne de ventilation existe au plan (classes 1 à 8)', () => {
    const cites: string[] = [];
    for (const p of [...POSTES_RECETTES_SMT_SYSCOHADA, ...POSTES_DEPENSES_SMT_SYSCOHADA]) cites.push(...p.comptes, ...(p.exclusions ?? []));
    for (const c of [...VENTILATION_RECETTES_SMT_SYSCOHADA, ...VENTILATION_DEPENSES_SMT_SYSCOHADA]) cites.push(...c.comptes, ...(c.exclusions ?? []));
    cites.push(...COMPTES_DOTATIONS_SMT_SYSCOHADA, ...COMPTES_CHIFFRE_AFFAIRES_ART13);
    const absents = cites.filter((prefixe) => !FEUILLES_1_A_8.some((c) => c.numero.startsWith(prefixe)));
    expect(absents).toEqual([]);
  });

  it("le périmètre de A et B est EXACTEMENT « produits et charges » + « postes de bilan porteurs d'une variation » · anomalie n° 13", () => {
    // Les seuls postes de bilan que le compte de résultat corrige.
    const avecVariation = RETRAITEMENTS_SMT_SYSCOHADA.map((r) => r.posteBilan).filter((r): r is string => r !== null);
    expect(avecVariation).toEqual(['SA2', 'SA3', 'SP4']);
    for (const c of FEUILLES_1_A_8) {
      const dansPerimetre = correspond(c.numero, CONTREPARTIES_RESULTAT_SMT_SYSCOHADA);
      if (/^[6-8]/.test(c.numero)) {
        // Produits et charges : toujours dedans, ce sont les « recettes sur
        // produits » et les « dépenses sur charges » de la maquette.
        expect(dansPerimetre).toBe(true);
        continue;
      }
      // Classes 1 à 5 : dedans si et seulement si un poste porteur d'une
      // ligne de variation le réclame au bilan · sans quoi G serait faux
      // (correction appliquée à un montant jamais compté, ou flux de
      // financement compté sans correction).
      const corrige = postesReclamant(c.numero).some((p) => avecVariation.includes(p.ref));
      expect({ numero: c.numero, dansPerimetre }).toEqual({ numero: c.numero, dansPerimetre: corrige });
    }
  });

  it("toute contrepartie DU PÉRIMÈTRE tombe dans EXACTEMENT un poste de recette et un poste de dépense ; aucune autre n'entre dans un poste de flux", () => {
    for (const c of FEUILLES_1_A_8) {
      const attendu = correspond(c.numero, CONTREPARTIES_RESULTAT_SMT_SYSCOHADA) ? 1 : 0;
      expect(POSTES_RECETTES_SMT_SYSCOHADA.filter((p) => correspond(c.numero, p.comptes, p.exclusions)).length).toBe(attendu);
      expect(POSTES_DEPENSES_SMT_SYSCOHADA.filter((p) => correspond(c.numero, p.comptes, p.exclusions)).length).toBe(attendu);
    }
    // Le cas qui a motivé l'anomalie n° 13 : un emprunt encaissé (16), un
    // apport de l'exploitant (103, 104) et une immobilisation payée
    // n'entrent NI en A NI en B, sans quoi G ne vaudrait plus le
    // « Résultat exercice » du bilan.
    for (const n of ['16100000', '10300000', '10400000', '24400000', '14100000']) {
      expect(POSTES_RECETTES_SMT_SYSCOHADA.filter((p) => correspond(n, p.comptes, p.exclusions))).toEqual([]);
      expect(POSTES_DEPENSES_SMT_SYSCOHADA.filter((p) => correspond(n, p.comptes, p.exclusions))).toEqual([]);
    }
  });

  it("les comptes de trésorerie ne sont jamais leur propre contrepartie, et la définition exportée exclut 50, 51 et 59 · anomalie n° 14", () => {
    expect(COMPTES_TRESORERIE_SMT_SYSCOHADA).toEqual(['52', '53', '54', '55', '56', '57', '58']);
    expect(COMPTES_DEPRECIATION_TRESORERIE_SMT_SYSCOHADA).toEqual(['592', '593', '594']);
    // 50 et 51 sont en SA3 (anomalie n° 6) : les traiter en trésorerie
    // doublerait un encaissement par chèque.
    for (const n of ['50100000', '51300000', '59000000', '59200000', '59900000']) {
      expect(correspond(n, COMPTES_TRESORERIE_SMT_SYSCOHADA)).toBe(false);
    }
    // Aucun compte de trésorerie ni sa dépréciation n'entre dans un poste de flux.
    for (const c of FEUILLES_1_A_8.filter((c) => correspond(c.numero, [...COMPTES_TRESORERIE_SMT_SYSCOHADA, ...COMPTES_DEPRECIATION_TRESORERIE_SMT_SYSCOHADA]))) {
      expect(correspond(c.numero, CONTREPARTIES_RESULTAT_SMT_SYSCOHADA)).toBe(false);
    }
  });

  it('chaque feuille des classes 1 à 8 appartient à un seul des quatre périmètres exportés · rien n’est laissé sans nom', () => {
    for (const c of FEUILLES_1_A_8) {
      const appartenances = [
        correspond(c.numero, CONTREPARTIES_RESULTAT_SMT_SYSCOHADA),
        CONTREPARTIES_HORS_RESULTAT_SMT_SYSCOHADA.some((b) => correspond(c.numero, b.comptes)),
        correspond(c.numero, COMPTES_TRESORERIE_SMT_SYSCOHADA),
        correspond(c.numero, COMPTES_DEPRECIATION_TRESORERIE_SMT_SYSCOHADA),
      ].filter(Boolean).length;
      expect({ numero: c.numero, appartenances }).toEqual({ numero: c.numero, appartenances: 1 });
    }
    expect(CONTREPARTIES_HORS_RESULTAT_SMT_SYSCOHADA.map((b) => [b.cle, b.comptes])).toEqual([
      ['financement', ['1']],
      ['investissement', ['2']],
    ]);
    for (const b of CONTREPARTIES_HORS_RESULTAT_SMT_SYSCOHADA) expect(b.fondement).toMatch(/Titre X|Titre VII/);
  });

  it('toute contrepartie des classes 1 à 8 tombe dans EXACTEMENT une colonne de ventilation de la NOTE 4, recettes et dépenses', () => {
    for (const c of FEUILLES_1_A_8) {
      expect(VENTILATION_RECETTES_SMT_SYSCOHADA.filter((k) => correspond(c.numero, k.comptes, k.exclusions)).length).toBe(1);
      expect(VENTILATION_DEPENSES_SMT_SYSCOHADA.filter((k) => correspond(c.numero, k.comptes, k.exclusions)).length).toBe(1);
    }
  });

  it('les postes nommés du compte de résultat visent les comptes de leur libellé (70 · 60 · 622 · 66 · 64 + 89 · 67)', () => {
    const comptesDe = (ref: string) => [...POSTES_RECETTES_SMT_SYSCOHADA, ...POSTES_DEPENSES_SMT_SYSCOHADA].find((p) => p.ref === ref)!.comptes;
    expect(comptesDe('SR1')).toEqual(['70']);
    expect(comptesDe('SD1')).toEqual(['60']);
    expect(comptesDe('SD2')).toEqual(['622']);
    expect(comptesDe('SD3')).toEqual(['66']);
    expect(comptesDe('SD4')).toEqual(['64', '89']);
    expect(comptesDe('SD5')).toEqual(['67']);
    // 623 (location acquisition) n'est pas un loyer : il tombe en SD6.
    expect(POSTES_DEPENSES_SMT_SYSCOHADA.find((p) => correspond('62320000', p.comptes, p.exclusions))!.ref).toBe('SD6');
    // 6224 (malis sur emballages) n'est pas un loyer non plus, mais le plan
    // officiel le loge sous le 622 : il reste en SD2, signalé · anomalie n° 18.
    expect(POSTES_DEPENSES_SMT_SYSCOHADA.find((p) => correspond('62240000', p.comptes, p.exclusions))!.ref).toBe('SD2');
    // 666 (rémunération de l'exploitant) est un salaire.
    expect(POSTES_DEPENSES_SMT_SYSCOHADA.find((p) => correspond('66610000', p.comptes, p.exclusions))!.ref).toBe('SD3');
  });

  it('les renvois de notes du compte de résultat sont ceux de la maquette · seule « Charges d’intérêts » et « DOTATIONS » n’en portent pas', () => {
    const notes = Object.fromEntries(
      [...POSTES_RECETTES_SMT_SYSCOHADA, ...POSTES_DEPENSES_SMT_SYSCOHADA, ...RETRAITEMENTS_SMT_SYSCOHADA].map((p) => [p.ref, p.note]),
    );
    expect(notes).toEqual({
      SR1: '4', SR2: '4',
      SD1: '4', SD2: '4', SD3: '4', SD4: '4', SD5: null, SD6: '4',
      SV1: '2', SV2: '3', SV3: '3', SF: null,
    });
  });

  it('les colonnes officielles de la NOTE 4 sont là, dans l’ordre du texte, et la seule colonne ajoutée est « Compte exploitant » (anomalie n° 12)', () => {
    const officielles = (cols: typeof VENTILATION_RECETTES_SMT_SYSCOHADA) => cols.filter((c) => !c.rajoutAutorise).map((c) => c.libelle);
    // Ch. 3, ventilation recettes : « Ventes · Autres · Matériel et
    // Mobilier ». L'ORDRE compte : c'est celui que l'export imprimera, et
    // « Autres » y est en deuxième position bien qu'elle soit la colonne
    // résiduelle (elle porte ses propres exclusions, l'ordre du tableau n'a
    // aucun effet sur le calcul).
    expect(officielles(VENTILATION_RECETTES_SMT_SYSCOHADA)).toEqual(['Ventes', 'Autres', 'Matériel et Mobilier']);
    expect(officielles(VENTILATION_DEPENSES_SMT_SYSCOHADA)).toEqual([
      'Achats marchandises', 'Achats matières et fournitures', 'Loyers', 'Salaires', 'Impôts et taxes', 'Autres',
    ]);
    const rajouts = [...VENTILATION_RECETTES_SMT_SYSCOHADA, ...VENTILATION_DEPENSES_SMT_SYSCOHADA].filter((c) => c.rajoutAutorise);
    expect(rajouts.map((c) => c.libelle)).toEqual(['Compte exploitant', 'Compte exploitant']);
    for (const r of rajouts) expect(r.comptes).toEqual(['103', '104']);
    // Les rajouts du NB sont imprimés APRÈS les colonnes officielles.
    for (const cols of [VENTILATION_RECETTES_SMT_SYSCOHADA, VENTILATION_DEPENSES_SMT_SYSCOHADA]) {
      expect(cols.findIndex((c) => c.rajoutAutorise)).toBe(cols.length - 1);
    }
  });

  it("la NOTE 4 porte TOUS les mouvements de trésorerie, y compris ceux que A et B excluent · anomalie n° 21", () => {
    const colonneRecette = (n: string) => VENTILATION_RECETTES_SMT_SYSCOHADA.find((k) => correspond(n, k.comptes, k.exclusions))!.cle;
    const colonneDepense = (n: string) => VENTILATION_DEPENSES_SMT_SYSCOHADA.find((k) => correspond(n, k.comptes, k.exclusions))!.cle;
    // Le journal ouvre sur un report à nouveau et se clôt sur un solde à
    // reporter : un emprunt encaissé, un achat d'immobilisation et un
    // virement interne DOIVENT y figurer, sans quoi son solde ne serait pas
    // celui de la banque · alors qu'aucun n'entre en A ni en B.
    expect(colonneRecette('16100000')).toBe('autres');
    expect(colonneDepense('24400000')).toBe('autres');
    expect(colonneDepense('58500000')).toBe('autres');
    // Les deux colonnes que le texte ouvre exprès pour des comptes hors A/B.
    expect(colonneRecette('24400000')).toBe('materielMobilier');
    expect(colonneRecette('82100000')).toBe('materielMobilier');
    expect(colonneRecette('10400000')).toBe('compteExploitant');
    expect(colonneDepense('10400000')).toBe('compteExploitant');
  });

  // -------------------------------------------------------------------------
  // Compte de résultat · formule G = C – D + E – F
  // -------------------------------------------------------------------------

  it('les opérateurs officiels sont conservés (\u2013, \u2013, +) et la variation est définie (N-1) - N · anomalie n° 2', () => {
    expect(DEFINITION_VARIATION_SMT_SYSCOHADA).toBe('N1_MOINS_N');
    expect(RETRAITEMENTS_SMT_SYSCOHADA.map((r) => [r.ref, r.signeOfficiel, r.lettre, r.posteBilan])).toEqual([
      ['SV1', -1, 'D', 'SA2'],
      ['SV2', -1, 'D', 'SA3'],
      ['SV3', 1, 'E', 'SP4'],
      ['SF', -1, 'F', null],
    ]);
    // Chaque libellé de variation commence par l'opérateur imprimé.
    for (const r of RETRAITEMENTS_SMT_SYSCOHADA.filter((r) => r.posteBilan)) {
      // Le demi-cadratin est celui de la maquette (anomalie n° 20), écrit
      // échappé ici pour que la comparaison reste lisible en revue.
      expect(r.libelle.startsWith(r.signeOfficiel === 1 ? '+ ' : '\u2013 ')).toBe(true);
    }
    // Les lettres D et E (anomalie n° 1) couvrent exactement les trois variations.
    expect([...LETTRES_D_E_SMT_SYSCOHADA.D, ...LETTRES_D_E_SMT_SYSCOHADA.E]).toEqual(['SV1', 'SV2', 'SV3']);
    // Chaque poste de bilan visé existe.
    for (const r of RETRAITEMENTS_SMT_SYSCOHADA) if (r.posteBilan) expect(trouvePosteBilanSmtSyscohada(r.posteBilan)).toBeDefined();
  });

  it('G = C – D + E – F redonne le résultat d’engagement sur un exemple chiffré · la lecture des anomalies n° 1 et 2 est exacte', () => {
    // Encaissé 100, décaissé 60. Stock monté de 10 à 15 (achats non
    // consommés : +5), créances de 0 à 20 (ventes non encaissées : +20),
    // dettes de 0 à 8 (charges non payées : -8), dotations 3.
    // Résultat d'engagement attendu : 100 + 20 + 5 - 60 - 8 - 3 = 54.
    const r = calculerResultatSmt({
      recettes: 100,
      depenses: 60,
      stocks: { n: 15, n1: 10 },
      creances: { n: 20, n1: 0 },
      dettes: { n: 8, n1: 0 },
      dotations: 3,
    });
    expect(r.C).toBe(40);
    expect(r.lignes).toEqual({ SV1: -5, SV2: -20, SV3: -8, SF: 3 });
    expect(r.D).toBe(-25);
    expect(r.E).toBe(-8);
    expect(r.F).toBe(3);
    expect(r.G).toBe(54);
    // Et la formule imprimée, appliquée avec les opérateurs officiels ligne à ligne, donne le même G.
    const parLignes = RETRAITEMENTS_SMT_SYSCOHADA.reduce((s, l) => s + l.signeOfficiel * r.lignes[l.ref as keyof typeof r.lignes], r.C);
    expect(parLignes).toBe(r.G);
    // Cas symétrique : déstockage et créances recouvrées ramènent le résultat sous la trésorerie.
    expect(calculerResultatSmt({ recettes: 100, depenses: 60, stocks: { n: 5, n1: 10 }, creances: { n: 0, n1: 20 }, dettes: { n: 0, n1: 8 }, dotations: 0 }).G).toBe(40 - 5 - 20 + 8);
  });

  it('les dotations F sont lues dans 68, 69 et 85 · jamais dans un poste de flux', () => {
    expect(COMPTES_DOTATIONS_SMT_SYSCOHADA).toEqual(['68', '69', '85']);
    // 659, 679 et 839 (charges provisionnées) n'y sont PAS : leur effet
    // passe par les lignes de variation, les ajouter les compterait deux
    // fois · voir la note de COMPTES_DOTATIONS_SMT_SYSCOHADA.
    for (const n of ['659', '679', '839']) expect(COMPTES_DOTATIONS_SMT_SYSCOHADA).not.toContain(n);
  });

  it("chaque total du compte de résultat dit de quelles lignes il est fait, toutes définies AVANT lui", () => {
    const rang = (ref: string) => ORDRE_COMPTE_RESULTAT_SMT_SYSCOHADA.indexOf(ref);
    for (const total of TOTAUX_COMPTE_RESULTAT_SMT_SYSCOHADA) {
      expect(rang(total.ref)).toBeGreaterThanOrEqual(0);
      for (const ref of total.deRefs) {
        expect(rang(ref)).toBeGreaterThanOrEqual(0);
        expect(rang(ref)).toBeLessThan(rang(total.ref));
      }
    }
    const de = (ref: string) => TOTAUX_COMPTE_RESULTAT_SMT_SYSCOHADA.find((t) => t.ref === ref)!.deRefs;
    // A additionne TOUS les postes de recettes, B tous ceux de dépenses ·
    // un poste ajouté sans être rattaché à son total se verrait ici.
    expect(de('SRA')).toEqual(POSTES_RECETTES_SMT_SYSCOHADA.map((p) => p.ref));
    expect(de('SDB')).toEqual(POSTES_DEPENSES_SMT_SYSCOHADA.map((p) => p.ref));
    expect(de('SC')).toEqual(['SRA', 'SDB']);
    // G lit le solde C et les quatre retraitements, ni plus ni moins.
    expect(de('SG')).toEqual(['SC', ...RETRAITEMENTS_SMT_SYSCOHADA.map((r) => r.ref)]);
  });

  // -------------------------------------------------------------------------
  // Notes annexes
  // -------------------------------------------------------------------------

  it('les quatre notes du ch. 3 sont là, numérotées 1 à 4, avec les colonnes de leur maquette', () => {
    expect(NOTES_SMT_SYSCOHADA.map((n) => n.numero)).toEqual([1, 2, 3, 4]);
    expect(NOTES_SMT_SYSCOHADA.map((n) => n.intitule)).toEqual([
      'Tableau SMT de suivi du matériel, du mobilier et des cautions',
      'État des stocks',
      'État des créances et des dettes non échues',
      'Journal de trésorerie SMT',
    ]);
    expect(NOTES_SMT_SYSCOHADA[0].colonnes).toEqual(['Date', 'Désignation', 'Montant', 'Date de sortie', 'Prix de cession']);
    expect(NOTES_SMT_SYSCOHADA[1].colonnes).toEqual(['Référence', 'Désignation', 'Quantité', 'Prix unitaire', 'Montant']);
    expect(NOTES_SMT_SYSCOHADA[3].colonnes).toEqual(['Date', 'Libellés', 'Recettes', 'Dépenses', 'Solde']);
    // Une note porte SOIT une liste de colonnes, SOIT des sous-tableaux.
    for (const n of NOTES_SMT_SYSCOHADA) expect(n.colonnes === null).toBe(n.sousTableaux !== undefined);
    expect(JOURNAUX_DE_SUIVI_SMT_SYSCOHADA.map((j) => j.cle)).toEqual(['creancesImpayees', 'dettesAPayer']);
    expect(LIGNES_SYNTHESE_NOTE_2_SMT_SYSCOHADA).toEqual(['VALEUR DU STOCK FINAL', 'VALEUR DU STOCK INITIAL']);
    // Chaque renvoi de note du bilan et du compte de résultat vise une note qui existe.
    const numeros = new Set(NOTES_SMT_SYSCOHADA.map((n) => String(n.numero)));
    for (const p of [...TOUS_POSTES_BILAN, ...POSTES_RECETTES_SMT_SYSCOHADA, ...POSTES_DEPENSES_SMT_SYSCOHADA, ...RETRAITEMENTS_SMT_SYSCOHADA]) {
      if (p.note !== null) expect(numeros.has(p.note)).toBe(true);
    }
  });

  it("la NOTE 3 est faite des DEUX tableaux du ch. 3, chacun avec ses colonnes et sa ligne de total · anomalie n° 19", () => {
    const note3 = NOTES_SMT_SYSCOHADA.find((n) => n.numero === 3)!;
    expect(note3.colonnes).toBeNull();
    expect(note3.sousTableaux).toEqual([
      {
        cle: 'creances',
        intitule: 'Créances',
        colonnes: ['Date', 'Nom du client', 'Montant au 31 décembre', 'Montant au 1er janvier', 'Variation %'],
        ligneTotal: 'TOTAL DES CRÉANCES',
      },
      {
        cle: 'dettes',
        intitule: 'Dettes',
        colonnes: ['Date', 'Nom du fournisseur', 'Montant au 31 décembre', 'Montant au 1er janvier', 'Variation %'],
        ligneTotal: 'TOTAL DES DETTES',
      },
    ]);
  });

  // -------------------------------------------------------------------------
  // Seuils de l'art. 13
  // -------------------------------------------------------------------------

  it('les trois seuils de l’art. 13 sont exposés en F CFA, avec la clause « ou l’équivalent », et le CA se lit au 70', () => {
    expect(SEUILS_SMT_ART13_FCFA.map((s) => [s.cle, s.montantFcfa])).toEqual([
      ['negoce', 60_000_000],
      ['artisanat', 40_000_000],
      ['services', 30_000_000],
    ]);
    expect(CLAUSE_EQUIVALENT_ART13).toBe("ou l'équivalent dans l'unité monétaire ayant cours légal dans l'État partie");
    expect(COMPTES_CHIFFRE_AFFAIRES_ART13).toEqual(['70']);
  });

  // -------------------------------------------------------------------------
  // Hygiène du dépôt
  // -------------------------------------------------------------------------

  it('aucun cadratin nulle part dans la source (CLAUDE.md §4) · le caractère est écrit échappé pour ne pas le réintroduire', () => {
    const source = readFileSync(join(__dirname, 'correspondance-smt-syscohada.ts'), 'utf8');
    expect(source).not.toMatch(/\u2014/);
  });
});
