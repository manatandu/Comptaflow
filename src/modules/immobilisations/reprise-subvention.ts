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
 * portée au crédit d'un 14 (bien transféré gratuitement). Un bien payé en
 * partie par une subvention reçue en numéraire n'a pas ce lien, et ne se
 * propose pas. Quand le 14 ne finance qu'une part du coût, la reprise suit la
 * même part de la dotation · lecture de l'éditeur, la fiche ne visant que le
 * bien « acquis au moyen de la subvention ».
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
}

export interface PropositionReprise {
  montant: number;
  nature: NatureReprise;
  /** Ce qui empêche la proposition, ou null. */
  motif: string | null;
}

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
    // Quote-part « relative à la dotation aux amortissements et aux
    // dépréciations » · la dotation ENTIÈRE, comme l'Application 5 du Guide
    // (18 625 000 repris pour 18 625 000 dotés), sans prorata du fonds.
    const base = centimes((e.dotationExercice ?? 0) + (e.depreciationExercice ?? 0));
    if (base <= 0) return { montant: 0, nature: 'EXERCICE', motif: "Aucune dotation aux amortissements ni aux dépréciations sur l'exercice." };
    return { montant: Math.min(reste, base), nature: 'EXERCICE', motif: null };
  }
  if (e.sorti) return { montant: reste, nature: 'SORTIE', motif: null };
  if (regle === 'USUFRUIT') {
    // « dans la même quotité que l'amortissement » (§ 2.3).
    if (e.dotationExercice == null) {
      return { montant: 0, nature: 'EXERCICE', motif: "Passez d'abord la dotation de l'exercice · la reprise en suit le montant." };
    }
    return { montant: Math.min(reste, centimes(e.dotationExercice)), nature: 'EXERCICE', motif: null };
  }
  if (e.amortissable) {
    if (e.dotationExercice == null) {
      return { montant: 0, nature: 'EXERCICE', motif: "Passez d'abord la dotation de l'exercice · la reprise en suit le montant." };
    }
    const part = e.valeurOrigine > 0 ? Math.min(1, e.subvention / e.valeurOrigine) : 1;
    return { montant: Math.min(reste, centimes(e.dotationExercice * part)), nature: 'EXERCICE', motif: null };
  }
  const annees = e.dureeInalienabiliteAns && e.dureeInalienabiliteAns > 0 ? e.dureeInalienabiliteAns : 10;
  return { montant: Math.min(reste, centimes(e.subvention / annees)), nature: 'EXERCICE', motif: null };
}
