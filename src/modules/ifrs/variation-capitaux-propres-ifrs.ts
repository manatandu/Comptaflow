import { EtatsIfrs, RefusIfrs } from './etats-ifrs';

/**
 * ÉTAT DES VARIATIONS DES CAPITAUX PROPRES · item 15, tranche 2. Moteur PUR.
 *
 * SOURCE, lue le 2026-09-25 · IFRS 18 § 107 à 112 (le § 108 pour IAS 8, le
 * § 109 pour l'analyse des autres éléments par élément, le § 110 pour les
 * dividendes). Le § 107 impose, pour
 * CHAQUE composante, le résultat global de la période (a), les effets de
 * l'application ou du retraitement rétrospectif selon IAS 8 (b), et un
 * rapprochement ouverture → clôture présentant au minimum le résultat net,
 * les autres éléments du résultat global et les transactions avec les
 * propriétaires, apports et distributions SÉPARÉS (c). Le § 111 donne les
 * composantes · chaque catégorie d'apport, le cumul de chaque catégorie
 * d'autres éléments du résultat global, les résultats non distribués.
 *
 * TROIS COMPOSANTES, lues sur l'état de la situation financière IFRS · le
 * capital émis ; les réserves et résultats non distribués (le résultat de
 * l'exercice y est compris, § 111) ; les autres composantes, où s'accumulent
 * les autres éléments du résultat global.
 *
 * L'OUVERTURE EST LA CLÔTURE IFRS DE L'EXERCICE PRÉCÉDENT, calculée avec SES
 * retraitements. Elle porte donc déjà les retraitements rétrospectifs déclarés
 * sur cet exercice · les effets déclarés en IAS 8 servent à remonter au solde
 * PUBLIÉ (ouverture retraitée moins effets), jamais à s'ajouter une seconde
 * fois.
 *
 * RIEN NE SE DÉDUIT DE LA DIFFÉRENCE. Les apports, les distributions et les
 * transferts entre composantes se DÉCLARENT, chacun avec sa justification. Ce
 * que ni le résultat global ni les déclarations n'expliquent reste sur une
 * ligne « écart non expliqué », montré, et l'état n'est pas publiable · le
 * loger dans les apports ferait un tableau qui boucle toujours et ne prouve
 * rien.
 */

export type ComposanteCp = 'CAPITAL' | 'RESERVES' | 'AUTRES_COMPOSANTES' | 'MINORITAIRES';
export type TypeMouvementCp = 'CHANGEMENT_METHODE' | 'CORRECTION_ERREUR' | 'APPORT' | 'DISTRIBUTION' | 'TRANSFERT' | 'VARIATION_PARTS_INTERETS';

export interface MouvementCpDeclare {
  type: TypeMouvementCp;
  composante: ComposanteCp;
  /** Effet sur la composante · positif l'augmente, négatif la diminue. */
  montant: number;
  libelle: string;
  justification: string;
}

export interface LigneVariationCp {
  cle: string;
  libelle: string;
  ref?: string;
  nature: 'SOLDE' | 'MOUVEMENT' | 'TOTAL' | 'ECART';
  capital: number;
  reserves: number;
  autres: number;
  /** Comptes consolidés · le total des propriétaires de la société mère et la colonne des minoritaires (§ 107 a). */
  groupe?: number;
  minoritaires?: number;
  total: number;
}

export interface VariationCapitauxPropres {
  lignes: LigneVariationCp[];
  mentions: string[];
  motifsNonPubliable: string[];
}

export const COMPOSANTES_CP: Record<ComposanteCp, { libelle: string; rubriques: string[] }> = {
  CAPITAL: { libelle: 'Capital émis', rubriques: ['SF_CAPITAL'] },
  RESERVES: { libelle: 'Réserves et résultats non distribués', rubriques: ['SF_RESERVES', 'SF_RESULTAT'] },
  AUTRES_COMPOSANTES: { libelle: 'Autres composantes (autres éléments du résultat global cumulés)', rubriques: ['SF_AUTRES_COMPOSANTES_CP', 'SF_OCI_EXERCICE'] },
  MINORITAIRES: { libelle: 'Participations ne donnant pas le contrôle', rubriques: ['SF_PARTICIPATIONS_NE_DONNANT_PAS_CONTROLE'] },
};

const r2 = (x: number) => Math.round(x * 100) / 100 || 0;
const EPS = 0.005;
const ORDRE: ComposanteCp[] = ['CAPITAL', 'RESERVES', 'AUTRES_COMPOSANTES'];
const ORDRE_CONSOLIDE: ComposanteCp[] = [...ORDRE, 'MINORITAIRES'];

/** Pourquoi un mouvement déclaré est irrecevable, ou `null`. La porte et le calcul appellent la même règle. */
export function motifRefusMouvementCp(
  m: Pick<MouvementCpDeclare, 'type' | 'montant' | 'libelle' | 'justification'> & { composante?: ComposanteCp },
  consolide = false,
): string | null {
  if (!m.libelle?.trim()) return 'Un mouvement de capitaux propres porte un libellé.';
  if (!consolide && m.composante === 'MINORITAIRES') {
    return `Mouvement « ${m.libelle} » · les participations ne donnant pas le contrôle n’existent que dans les comptes consolidés.`;
  }
  if (!consolide && m.type === 'VARIATION_PARTS_INTERETS') {
    return `Mouvement « ${m.libelle} » · une variation de parts d’intérêts dans une filiale n’existe que dans les comptes consolidés (IFRS 18 § 107 c iii).`;
  }
  if (!m.justification?.trim()) {
    return `Mouvement « ${m.libelle} » sans justification · nommez la pièce (procès-verbal d’assemblée, décision de distribution, note IAS 8).`;
  }
  if (!(Math.abs(m.montant) > EPS)) return `Mouvement « ${m.libelle} » sans montant.`;
  if (m.type === 'APPORT' && m.montant < 0) return `Mouvement « ${m.libelle} » · un apport des propriétaires augmente les capitaux propres, son montant est positif.`;
  if (m.type === 'DISTRIBUTION' && m.montant > 0) {
    return `Mouvement « ${m.libelle} » · une distribution aux propriétaires diminue les capitaux propres, son montant est négatif.`;
  }
  return null;
}

/** Les trois composantes et leur total, lus sur l'état de la situation financière IFRS. */
export function composantesDe(e: EtatsIfrs, ordre: ComposanteCp[] = ORDRE): Record<ComposanteCp, number> {
  const val = (cle: string) => e.situation.find((l) => l.cle === cle)?.ifrs ?? 0;
  const out = { CAPITAL: 0, RESERVES: 0, AUTRES_COMPOSANTES: 0, MINORITAIRES: 0 } as Record<ComposanteCp, number>;
  for (const c of ordre) out[c] = r2(COMPOSANTES_CP[c].rubriques.reduce((s, k) => s + val(k), 0));
  return out;
}

/**
 * Le bloc d'UN exercice. `ouverture` est l'état IFRS de l'exercice précédent ;
 * `null` refuse le bloc, puisqu'un rapprochement sans solde de départ n'en est
 * pas un.
 */
export function construireVariationCapitauxPropres(
  cloture: EtatsIfrs,
  ouverture: EtatsIfrs | null,
  mouvements: MouvementCpDeclare[],
): VariationCapitauxPropres {
  const valeur = (cle: string) => cloture.resultatGlobal.find((l) => l.cle === cle)?.ifrs ?? 0;
  return bloc(cloture, ouverture, mouvements, false, {
    resultatNet: { RESERVES: valeur('RG_RESULTAT_NET') },
    oci: { AUTRES_COMPOSANTES: valeur('TOTAL_OCI') },
  });
}

/**
 * COMPTES CONSOLIDÉS, tranche C3 · le même rapprochement, avec la colonne des
 * participations ne donnant pas le contrôle et le total des propriétaires de
 * la société mère (§ 107 a). Le résultat net et les autres éléments se
 * répartissent comme l'état du résultat global les attribue (§ 76, § 87,
 * IFRS 10 § B94) · les attributions sont LUES, jamais recalculées. Les
 * variations de parts d'intérêts sans perte du contrôle ont leur ligne
 * (§ 107 c iii) et se déclarent, comme les dividendes versés aux minoritaires.
 */
export function construireVariationCapitauxPropresConsolidee(
  cloture: EtatsIfrs,
  ouverture: EtatsIfrs | null,
  mouvements: MouvementCpDeclare[],
): VariationCapitauxPropres {
  const valeur = (liste: 'resultat' | 'resultatGlobal', cle: string) => cloture[liste].find((l) => l.cle === cle)?.ifrs ?? 0;
  const rnGroupe = valeur('resultat', 'RN_PROPRIETAIRES');
  const rnMinoritaires = valeur('resultat', 'RN_PARTICIPATIONS_NE_DONNANT_PAS_CONTROLE');
  return bloc(cloture, ouverture, mouvements, true, {
    resultatNet: { RESERVES: rnGroupe, MINORITAIRES: rnMinoritaires },
    oci: {
      AUTRES_COMPOSANTES: r2(valeur('resultatGlobal', 'RG_PROPRIETAIRES') - rnGroupe),
      MINORITAIRES: r2(valeur('resultatGlobal', 'RG_PARTICIPATIONS_NE_DONNANT_PAS_CONTROLE') - rnMinoritaires),
    },
  });
}

function bloc(
  cloture: EtatsIfrs,
  ouverture: EtatsIfrs | null,
  mouvements: MouvementCpDeclare[],
  consolide: boolean,
  global: { resultatNet: Partial<Record<ComposanteCp, number>>; oci: Partial<Record<ComposanteCp, number>> },
): VariationCapitauxPropres {
  if (!ouverture) throw new RefusIfrs('Sans état IFRS de l’exercice précédent, il n’y a pas de solde d’ouverture à rapprocher (IFRS 18 § 107 c).');
  for (const m of mouvements) {
    const motif = motifRefusMouvementCp(m, consolide);
    if (motif) throw new RefusIfrs(motif);
  }
  const ordre = consolide ? ORDRE_CONSOLIDE : ORDRE;
  const zero = (): Record<ComposanteCp, number> => ({ CAPITAL: 0, RESERVES: 0, AUTRES_COMPOSANTES: 0, MINORITAIRES: 0 });

  const ligne = (cle: string, libelle: string, nature: LigneVariationCp['nature'], v: Record<ComposanteCp, number>, ref?: string): LigneVariationCp => {
    const groupe = r2(v.CAPITAL + v.RESERVES + v.AUTRES_COMPOSANTES);
    return {
      cle,
      libelle,
      ...(ref ? { ref } : {}),
      nature,
      capital: r2(v.CAPITAL),
      reserves: r2(v.RESERVES),
      autres: r2(v.AUTRES_COMPOSANTES),
      ...(consolide ? { groupe, minoritaires: r2(v.MINORITAIRES) } : {}),
      total: r2(groupe + (consolide ? v.MINORITAIRES : 0)),
    };
  };
  const somme = (type: TypeMouvementCp) => {
    const v = zero();
    for (const m of mouvements.filter((x) => x.type === type)) v[m.composante] = r2(v[m.composante] + m.montant);
    return v;
  };
  const plus = (...xs: Record<ComposanteCp, number>[]) => {
    const v = zero();
    for (const x of xs) for (const c of ordre) v[c] = r2(v[c] + x[c]);
    return v;
  };
  const moins = (a: Record<ComposanteCp, number>, b: Record<ComposanteCp, number>) => {
    const v = zero();
    for (const c of ordre) v[c] = r2(a[c] - b[c]);
    return v;
  };

  const ouvertureRetraitee = composantesDe(ouverture, ordre);
  const methode = somme('CHANGEMENT_METHODE');
  const erreurs = somme('CORRECTION_ERREUR');
  const publiee = moins(ouvertureRetraitee, plus(methode, erreurs));

  const resultatNet = { ...zero(), ...global.resultatNet };
  const oci = { ...zero(), ...global.oci };
  const apports = somme('APPORT');
  const distributions = somme('DISTRIBUTION');
  const partsInterets = somme('VARIATION_PARTS_INTERETS');
  const transferts = somme('TRANSFERT');
  const clotureValeurs = composantesDe(cloture, ordre);
  const explique = plus(ouvertureRetraitee, resultatNet, oci, apports, distributions, partsInterets, transferts);
  const ecart = moins(clotureValeurs, explique);
  const aEcart = ordre.some((c) => Math.abs(ecart[c]) > EPS);

  const lignes: LigneVariationCp[] = [
    ligne('OUVERTURE_PUBLIEE', 'Solde à l’ouverture, tel que publié', 'SOLDE', publiee),
    ligne('CHANGEMENT_METHODE', 'Effet des changements de méthodes comptables', 'MOUVEMENT', methode, '§ 107 b, § 108'),
    ligne('CORRECTION_ERREUR', 'Effet des corrections d’erreurs', 'MOUVEMENT', erreurs, '§ 107 b, § 108'),
    ligne('OUVERTURE_RETRAITEE', 'Solde retraité à l’ouverture', 'TOTAL', ouvertureRetraitee),
    ligne('RESULTAT_NET', 'Résultat net', 'MOUVEMENT', resultatNet, '§ 107 c i'),
    ligne('OCI', 'Autres éléments du résultat global', 'MOUVEMENT', oci, '§ 107 c ii'),
    ligne('RESULTAT_GLOBAL', 'Résultat global de l’exercice', 'TOTAL', plus(resultatNet, oci), '§ 107 a'),
    ligne('APPORTS', 'Apports des propriétaires', 'MOUVEMENT', apports, '§ 107 c iii'),
    ligne('DISTRIBUTIONS', 'Distributions aux propriétaires', 'MOUVEMENT', distributions, '§ 107 c iii, § 110'),
    ...(consolide
      ? [ligne('VARIATIONS_PARTS_INTERETS', 'Variations de parts d’intérêts dans des filiales sans perte du contrôle', 'MOUVEMENT', partsInterets, '§ 107 c iii')]
      : []),
    ligne('TRANSFERTS', 'Transferts entre composantes', 'MOUVEMENT', transferts, '§ 107 c · poste supplémentaire'),
    ...(aEcart ? [ligne('ECART_NON_EXPLIQUE', 'Écart non expliqué', 'ECART', ecart)] : []),
    ligne('CLOTURE', 'Solde à la clôture', 'SOLDE', clotureValeurs),
  ];

  const motifsNonPubliable: string[] = [];
  if (aEcart) {
    motifsNonPubliable.push(
      `Variation des capitaux propres · ${r2(ordre.reduce((s, c) => s + ecart[c], 0))} de variation que ni le résultat global ni les mouvements déclarés n’expliquent (${ordre
        .filter((c) => Math.abs(ecart[c]) > EPS)
        .map((c) => `${COMPOSANTES_CP[c].libelle.toLowerCase()} ${ecart[c]}`)
        .join(', ')}) · déclarez ${consolide ? 'l’apport, la distribution, la variation de parts d’intérêts' : 'l’apport, la distribution'} ou le transfert qui manque.`,
    );
  }
  const soldeTransferts = r2(ordre.reduce((s, c) => s + transferts[c], 0));
  if (Math.abs(soldeTransferts) > EPS) {
    motifsNonPubliable.push(`Les transferts entre composantes ne se soldent pas (${soldeTransferts}) · un transfert déplace un montant, il ne crée ni ne détruit de capitaux propres.`);
  }

  const mentions: string[] = [];
  if (mouvements.some((m) => m.type === 'DISTRIBUTION')) {
    mentions.push('Le montant des dividendes par action se présente dans l’état ou se donne dans les notes (IFRS 18 § 110) · il n’est pas calculé ici.');
  }
  if (ordre.some((c) => c !== 'CAPITAL' && c !== 'RESERVES' && Math.abs(oci[c]) > EPS)) {
    mentions.push('L’analyse des autres éléments du résultat global par élément, composante par composante, se présente dans l’état ou se donne dans les notes (IFRS 18 § 109).');
  }
  return { lignes, mentions, motifsNonPubliable };
}
