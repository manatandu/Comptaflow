/**
 * LA REPRISE D'UNE SUBVENTION D'INVESTISSEMENT EN NATURE · moteur pur.
 *
 * Fiche du compte 14, la même à l'AUDCIF (Titre VII) et au SYCEBNL (Partie 2
 * ch. 3) · « La quote-part de subvention reprise dans le résultat de
 * l'exercice est égale : soit au montant de la dotation de l'exercice aux
 * comptes d'amortissements des immobilisations amortissables acquises ou
 * créées au moyen de la subvention ; soit, pour les immobilisations non
 * amortissables, à un montant déterminé en fonction du nombre d'années
 * pendant lesquelles elles sont inaliénables aux termes du contrat, ou, à
 * défaut de clause d'inaliénabilité, à une somme égale au dixième du montant
 * de la subvention. » Et « à la date de cession de l'actif acquis à l'aide de
 * la subvention [...] pour la partie de la subvention non encore rapportée au
 * résultat ».
 *
 * La subvention suivie est celle que l'écriture d'acquisition du bien a
 * portée au crédit d'un 14 (bien transféré gratuitement), ou, depuis le
 * lot 5, celle reçue en NUMÉRAIRE que le cabinet a RATTACHÉE au bien avec son
 * montant (`SubventionImmobilisation`) · le 14 crédité à la notification n'a
 * sinon aucun lien avec le bien payé ensuite. Quand le 14 ne finance qu'une
 * part du coût, la reprise suit la même part de la dotation (§ 3.2, « le
 * rapport existant entre le montant de la subvention et la valeur d'entrée »).
 *
 * LE RYTHME EST PROSPECTIF (décision D-12 de Manasse, 2026-10-01) · reprise
 * = solde non repris × dotation de l'exercice ÷ valeur restant à amortir à
 * l'ouverture. Sans événement, c'est exactement la formule du § 3.2 (le
 * solde et le reste à amortir décroissent dans le même rapport). Après un
 * remboursement ou une subvention non versée (§ 4.3, « changement
 * d'estimation comptable »), une dépréciation, une subvention rattachée après
 * l'acquisition, le solde finit repris au terme du plan, sans rattrapage du
 * passé · lecture de l'éditeur, le texte ne donnant pas de formule.
 *
 * LA DOTATION EST GLOBALE · « lorsque la subvention sert à financer une
 * immobilisation ayant fait l'objet d'un amortissement fiscal, la reprise de
 * la subvention est fonction de la dotation globale (amortissement économique
 * et dérogatoire) » (§ 3.2) · le dérogatoire de l'exercice, net de sa
 * reprise, s'ajoute à la dotation, et le reste à amortir est le reste FISCAL.
 *
 * Rien n'est posté ici · le module PROPOSE, le cabinet passe (décision de
 * Manasse du 2026-10-01). Une reprise passée à la main hors du module n'est
 * pas connue de lui · le cumul ne compte que les siennes, et c'est dit.
 */

export type NatureReprise = 'EXERCICE' | 'SORTIE';

/**
 * LES FONDS QUI SE REPRENNENT DEPUIS LA FICHE (lot 4, 2026-10-01).
 *
 * Au 14 de la fiche du compte 14 s'ajoutent, AU SYCEBNL SEUL, les fonds de la
 * Partie 3 ch. 2 · « un numéro, deux sens », le 172 y est la donation non
 * encore reçue d'un bien destiné à la vente, et au SYSCOHADA une dette de
 * location-acquisition (17200000, semis) ; le 167 et le 171 n'y ont pas ce
 * sens non plus. Chaque fonds a sa règle et son compte de reprise, lus au
 * texte et relus au semis SYCEBNL :
 *  · 167 · § 1.2.2, « reprises des fonds provenant des dons et legs pour la
 *    quote-part relative à la dotation aux amortissements ET AUX
 *    DÉPRÉCIATIONS » · D 167 / C 7923. Le 1679 « engagement auprès du
 *    donateur », qui porte la provision du 192 au débit, n'est pas un fonds
 *    reçu · il est écarté ;
 *  · 171 · § 2.3, « repris dans la même quotité que l'amortissement par le
 *    biais du compte 7961 » ;
 *  · 172 · § 2.2.3, « reprise POUR SOLDE » au 7962 lors de la cession, jamais
 *    au fil des exercices · le bien n'est pas amorti (§ 2.1).
 */
export type RegleReprise = 'SUBVENTION' | 'DONS_LEGS' | 'USUFRUIT' | 'A_VENDRE';

export interface FondsRepris {
  racine: string;
  exclure?: string;
  regle: RegleReprise;
  compteReprise: string;
  libelle: string;
}

const SUBVENTION: FondsRepris = {
  racine: '14',
  regle: 'SUBVENTION',
  compteReprise: '79900000',
  libelle: "Reprise de subvention d'investissement",
};

export const FONDS_REPRIS: Record<'SYSCOHADA' | 'SYCEBNL', readonly FondsRepris[]> = {
  SYSCOHADA: [SUBVENTION],
  SYCEBNL: [
    SUBVENTION,
    { racine: '167', exclure: '1679', regle: 'DONS_LEGS', compteReprise: '79230000', libelle: 'Reprise de fonds provenant de dons et legs' },
    { racine: '171', regle: 'USUFRUIT', compteReprise: '79610000', libelle: "Reprise de la donation temporaire d'usufruit" },
    { racine: '172', regle: 'A_VENDRE', compteReprise: '79620000', libelle: 'Reprise pour solde des dons et legs destinés à la vente' },
  ],
};

export function fondsDuCompte(referentiel: 'SYSCOHADA' | 'SYCEBNL', numero: string): FondsRepris | undefined {
  return FONDS_REPRIS[referentiel].find((f) => numero.startsWith(f.racine) && !(f.exclure && numero.startsWith(f.exclure)));
}

export interface EntreeReprise {
  subvention: number;
  valeurOrigine: number;
  amortissable: boolean;
  /** Dotation passée pour l'exercice, ou null si elle ne l'est pas encore. */
  dotationExercice: number | null;
  /** Reprises déjà passées par le module. */
  cumulRepris: number;
  /** Le bien est sorti dans cet exercice. */
  sorti: boolean;
  /** Clause d'inaliénabilité, en années, pour un bien non amortissable. */
  dureeInalienabiliteAns?: number | null;
  /** La règle du fonds · la subvention du 14 à défaut. */
  regle?: RegleReprise;
  /** Dépréciations DOTÉES sur l'exercice · le 167 les reprend aussi (§ 1.2.2). */
  depreciationExercice?: number;
  /** Remboursements et subventions non versées déjà passés (§ 4.3.1, § 4.7). */
  reductions?: number;
  /**
   * Valeur restant à amortir à l'ouverture · valeur d'entrée moins
   * amortissements antérieurs (dérogatoire net compris) et dépréciations
   * nettes antérieures. Absente, la formule du § 3.2 est appliquée telle
   * quelle (bien entré par une subvention en nature, sans historique lu).
   */
  resteAAmortirOuverture?: number | null;
  /** Dérogatoire de l'exercice, dotation moins reprise (§ 3.2, « dotation globale »). */
  derogatoireNetExercice?: number;
  /** Reprises d'exercice déjà passées, pour un bien non amortissable. */
  exercicesRepris?: number;
  /** Méthode du § 4.6 déclarée par le dossier, null tant qu'elle ne l'est pas. */
  methodeDepreciation?: 'VNC_MINOREE_DES_SUBVENTIONS' | 'VNC_ENTIERE' | null;
}

export interface PropositionReprise {
  montant: number;
  nature: NatureReprise;
  /** Ce qui empêche la proposition, ou null. */
  motif: string | null;
  /** Ce que la proposition ne couvre pas et que le cabinet doit savoir. */
  reserve?: string | null;
}

/**
 * La part du § 4.6 · en deuxième méthode, « le montant des subventions
 * restant inscrit dans les capitaux propres doit être repris à hauteur de la
 * dépréciation » ; en première, « le rythme de reprise des subventions n'est
 * pas modifié ». Méthode non déclarée · rien n'est ajouté, et c'est dit.
 */
export const RESERVE_METHODE_DEPRECIATION_NON_DECLAREE =
  "Le bien est déprécié sur l'exercice et le dossier n'a pas déclaré sa méthode de dépréciation des biens subventionnés (AUDCIF Titre VIII ch. 17 § 4.6) · aucune reprise n'est ajoutée pour la dépréciation.";


const centimes = (x: number) => Math.round(x * 100) / 100;

export function proposerReprise(e: EntreeReprise): PropositionReprise {
  const reste = centimes(e.subvention - e.cumulRepris);
  if (reste <= 0) return { montant: 0, nature: e.sorti ? 'SORTIE' : 'EXERCICE', motif: 'Le fonds est entièrement repris.' };
  const regle = e.regle ?? 'SUBVENTION';
  if (regle === 'A_VENDRE') {
    // § 2.2.3 · « reprise pour solde » à la cession, rien avant.
    return e.sorti
      ? { montant: reste, nature: 'SORTIE', motif: null }
      : { montant: 0, nature: 'EXERCICE', motif: 'Le 172 se reprend pour solde à la cession du bien (SYCEBNL Partie 3 ch. 2 § 2.2.3).' };
  }
  if (regle === 'DONS_LEGS') {
    if (e.sorti) {
      // Le § 1.2.2 vise des biens « à conserver en l'état » et ne règle pas
      // le sort du 167 quand l'un d'eux quitte l'actif · rien n'est inventé.
      return { montant: 0, nature: 'SORTIE', motif: "Le texte ne règle pas la reprise du 167 à la sortie d'un bien à conserver (SYCEBNL Partie 3 ch. 2 § 1.2.2) · décision du cabinet." };
    }
    if (e.amortissable && e.dotationExercice == null) {
      return { montant: 0, nature: 'EXERCICE', motif: "Passez d'abord la dotation de l'exercice · la reprise en suit le montant." };
    }
    // « Quote-part relative à la dotation aux amortissements et aux
    // dépréciations » · la dotation multipliée par le rapport du 167 du bien
    // à sa valeur d'entrée (décision D-15 de Manasse, 2026-10-01). Sans
    // dettes, le rapport vaut un et la dotation entière est reprise.
    // ÉCART ASSUMÉ AVEC L'APPLICATION 5 DU GUIDE · biens 447 000 000, dettes
    // 25 000 000, 167 de 422 000 000, et le Guide reprend en N la dotation
    // ENTIÈRE (18 625 000) · suivie au terme du plan, cette lecture épuise le
    // 167 avant la dernière dotation (25 000 000 de dotations sans reprise
    // en face). La quote-part reprend le 167 au terme exact du plan, comme
    // la subvention (AUDCIF Titre VIII ch. 17 § 3.2).
    const base = centimes((e.dotationExercice ?? 0) + (e.depreciationExercice ?? 0));
    if (base <= 0) return { montant: 0, nature: 'EXERCICE', motif: "Aucune dotation aux amortissements ni aux dépréciations sur l'exercice." };
    const quotePart = e.valeurOrigine > 0 ? Math.min(1, e.subvention / e.valeurOrigine) : 1;
    return { montant: Math.min(reste, centimes(base * quotePart)), nature: 'EXERCICE', motif: null };
  }
  // § 4.5 · « la fraction de subvention non encore rapportée aux résultats
  // est [...] reprise par le compte 799 de l'exercice de cession », réductions
  // déduites (§ 4.3.1, § 4.7).
  if (e.sorti) return { montant: Math.max(0, centimes(reste - (e.reductions ?? 0))), nature: 'SORTIE', motif: null };
  if (regle === 'USUFRUIT') {
    // « dans la même quotité que l'amortissement » (§ 2.3).
    if (e.dotationExercice == null) {
      return { montant: 0, nature: 'EXERCICE', motif: "Passez d'abord la dotation de l'exercice · la reprise en suit le montant." };
    }
    return { montant: Math.min(reste, centimes(e.dotationExercice)), nature: 'EXERCICE', motif: null };
  }
  // SUBVENTION · le solde non repris, réductions déduites.
  const solde = centimes(reste - (e.reductions ?? 0));
  if (solde <= 0) return { montant: 0, nature: 'EXERCICE', motif: 'Le fonds est entièrement repris.' };
  if (e.amortissable) {
    if (e.dotationExercice == null) {
      return { montant: 0, nature: 'EXERCICE', motif: "Passez d'abord la dotation de l'exercice · la reprise en suit le montant." };
    }
    const globale = centimes(e.dotationExercice + (e.derogatoireNetExercice ?? 0));
    let montant: number;
    if (e.resteAAmortirOuverture == null) {
      const part = e.valeurOrigine > 0 ? Math.min(1, e.subvention / e.valeurOrigine) : 1;
      montant = Math.min(solde, centimes(globale * part));
    } else if (e.resteAAmortirOuverture <= 0) {
      montant = solde;
    } else {
      montant = Math.min(solde, centimes((solde * Math.min(globale, e.resteAAmortirOuverture)) / e.resteAAmortirOuverture));
    }
    let reserve: string | null = null;
    const depreciation = centimes(e.depreciationExercice ?? 0);
    if (depreciation > 0) {
      if (e.methodeDepreciation === 'VNC_ENTIERE') montant = Math.min(solde, centimes(montant + depreciation));
      else if (e.methodeDepreciation == null) reserve = RESERVE_METHODE_DEPRECIATION_NON_DECLAREE;
    }
    return { montant: Math.max(0, montant), nature: 'EXERCICE', motif: null, ...(reserve ? { reserve } : {}) };
  }
  // Non amortissable · par fractions égales sur l'inaliénabilité, à défaut
  // dix ans, sans prorata (Application 3, terrain) ; le solde restant sur
  // les années restantes, même règle prospective.
  const annees = e.dureeInalienabiliteAns && e.dureeInalienabiliteAns > 0 ? e.dureeInalienabiliteAns : 10;
  if (e.exercicesRepris == null) return { montant: Math.min(solde, centimes(e.subvention / annees)), nature: 'EXERCICE', motif: null };
  const restantes = Math.max(1, annees - e.exercicesRepris);
  return { montant: Math.min(solde, centimes(solde / restantes)), nature: 'EXERCICE', motif: null };
}
