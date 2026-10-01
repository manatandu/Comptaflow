/**
 * L'IMMOBILISATION EN COURS · le bien qui n'est pas encore achevé (2026-10-01,
 * demande de Manasse).
 *
 * Jusqu'ici un bien sans date de mise en service restait inscrit à son compte
 * DÉFINITIF (un 231, un 241) et la mise en service ne passait aucune écriture.
 * Les textes rangent pourtant le bien non achevé ailleurs :
 *
 *  · AUDCIF, Titre VII, fiches des comptes 21 à 24 · le 21 est débité « du
 *    219, lorsque les éléments des comptes 211 à 218 ayant trait à des
 *    travaux en cours sont terminés », le 22 « du 229, lorsque les éléments
 *    des comptes 221 à 228 ayant trait à des travaux en cours sont terminés »,
 *    le 23 « du 239, lorsque les travaux en cours des comptes 231 à 238 sont
 *    terminés », le 24 « du 249 (Matériel en cours), lorsqu'ils ont été
 *    achevés » ; fiche 23 · « Après achèvement, ils sont portés au débit des
 *    comptes 231 à 238 par le crédit du 239. En principe, l'amortissement des
 *    bâtiments ou installations en cours ne peut avoir lieu qu'à partir de
 *    leur mise en service effective. »
 *  · SYCEBNL, Partie 2 ch. 3 · les fiches 23 et 24 écrivent le même virement
 *    (fiche 23, « ou du compte 239 lorsque les éléments des comptes 231 à 238
 *    ayant trait à des travaux en cours sont terminés », et « Après
 *    achèvement, ces derniers seront portés au débit des comptes 231 à 238
 *    par le crédit du compte 239 » ; fiche 24, le 249 « lorsqu'ils ont été
 *    achevés »).
 *
 * LE MANQUE DU SYCEBNL, NON COMBLÉ · ses fiches des comptes 21 et 22 ouvrent
 * le 219 et le 229 en subdivisions, mais leur « Fonctionnement » ne crédite ni
 * l'un ni l'autre (le 21 et le 22 ne sont débités que par le 10, le 16, le 45,
 * les tiers et la trésorerie). Prêter au SYCEBNL le virement de l'AUDCIF
 * serait une règle lue dans l'autre référentiel · le module ne l'offre donc
 * qu'aux divisions 23 et 24 d'un dossier SYCEBNL, et le dit.
 *
 * LA CORRESPONDANCE DES SUBDIVISIONS · seul le SYCEBNL la pose, et pour le 249
 * seul · « 249 Matériel et actifs biologiques en cours (mêmes subdivisions que
 * 241-248) ». Le compte en cours n'est donc PRÉSÉLECTIONNÉ que là (241 vers
 * 2491, 245 vers 2495) ; ailleurs les intitulés se ressemblent mais aucun texte
 * ne les apparie (le 2391 de l'AUDCIF, « Bâtiments en cours », vaut pour le
 * 231 comme pour le 232), et le cabinet choisit. Un candidat unique se
 * présélectionne toujours.
 */

export type ReferentielEnCours = 'SYSCOHADA' | 'SYCEBNL';

/** Les divisions qui ont un compte en cours écrit dans le texte du référentiel. */
export const RACINES_EN_COURS: Readonly<Record<ReferentielEnCours, Readonly<Record<string, string>>>> = {
  SYSCOHADA: { '21': '219', '22': '229', '23': '239', '24': '249' },
  SYCEBNL: { '23': '239', '24': '249' },
};

const SOURCE: Record<ReferentielEnCours, string> = {
  SYSCOHADA: 'AUDCIF, Titre VII, fiches des comptes 21 à 24',
  SYCEBNL: 'SYCEBNL, Partie 2 ch. 3, fiches des comptes 23 et 24',
};

/** Un compte « en cours » (219, 229, 239, 249 et leurs subdivisions). */
export function estCompteEnCours(numero: string): boolean {
  return /^2[1-4]9/.test(numero);
}

/** La racine en cours de la division du compte définitif, ou null si le texte n'en écrit pas. */
export function racineEnCours(referentiel: ReferentielEnCours, numeroDefinitif: string): string | null {
  if (estCompteEnCours(numeroDefinitif)) return null;
  return RACINES_EN_COURS[referentiel][numeroDefinitif.slice(0, 2)] ?? null;
}

/**
 * Pourquoi un bien porté à ce compte définitif ne peut pas être inscrit en
 * cours · null quand il le peut. Le motif dit le manque du texte, jamais une
 * règle qu'il n'écrit pas.
 */
export function motifSansEnCours(referentiel: ReferentielEnCours, numeroDefinitif: string): string | null {
  if (estCompteEnCours(numeroDefinitif)) {
    return `Le compte ${numeroDefinitif} est lui-même un compte en cours · choisissez le compte définitif du bien, l'en-cours se choisit à côté.`;
  }
  if (racineEnCours(referentiel, numeroDefinitif)) return null;
  const division = numeroDefinitif.slice(0, 2);
  if (referentiel === 'SYCEBNL' && (division === '21' || division === '22')) {
    return (
      `La fiche du compte ${division} du SYCEBNL n'écrit pas le virement du ${division}9 à l'achèvement · ` +
      'le bien reste inscrit à son compte définitif jusqu’à sa mise en service.'
    );
  }
  return `La division ${division} n'a pas de compte en cours au plan · le bien reste inscrit à son compte définitif.`;
}

/**
 * Le compte en cours choisi pour un compte définitif · null s'il convient. La
 * même règle sert la porte du serveur et la liste servie à l'écran.
 */
export function motifRefusCompteEnCours(
  referentiel: ReferentielEnCours,
  numeroDefinitif: string,
  numeroEnCours: string,
): string | null {
  const sans = motifSansEnCours(referentiel, numeroDefinitif);
  if (sans) return sans;
  const racine = racineEnCours(referentiel, numeroDefinitif)!;
  if (!numeroEnCours.startsWith(racine)) {
    return (
      `Le compte ${numeroEnCours} n'est pas un compte en cours de la division ${numeroDefinitif.slice(0, 2)} · ` +
      `un bien porté au ${numeroDefinitif} s'inscrit en cours au ${racine} (${SOURCE[referentiel]}).`
    );
  }
  return null;
}

/** Les comptes en cours que le plan du dossier offre pour ce compte définitif, dans l'ordre servi. */
export function comptesEnCoursDuBien<C extends { numero: string }>(
  referentiel: ReferentielEnCours,
  numeroDefinitif: string,
  comptesDetail: readonly C[],
): C[] {
  const racine = racineEnCours(referentiel, numeroDefinitif);
  if (!racine) return [];
  return comptesDetail.filter((c) => c.numero.startsWith(racine));
}

/**
 * Le compte en cours PRÉSÉLECTIONNÉ · le candidat unique, ou, au SYCEBNL et
 * pour la seule division 24, le 249x qui répète le 24x du bien (« mêmes
 * subdivisions que 241-248 »). Partout ailleurs, null · le cabinet choisit.
 */
export function compteEnCoursPropose<C extends { numero: string }>(
  referentiel: ReferentielEnCours,
  numeroDefinitif: string,
  candidats: readonly C[],
): C | null {
  if (candidats.length === 1) return candidats[0];
  if (referentiel === 'SYCEBNL' && numeroDefinitif.startsWith('24') && /^24[1-8]/.test(numeroDefinitif)) {
    const sousCompte = `249${numeroDefinitif.charAt(2)}`;
    const trouves = candidats.filter((c) => c.numero.startsWith(sousCompte));
    return trouves.length === 1 ? trouves[0] : null;
  }
  return null;
}

/**
 * LE SEUL LECTEUR DU COMPTE OÙ LE BIEN EST INSCRIT À UNE DATE · le compte en
 * cours tant que la mise en service n'a pas eu lieu à cette date, le compte
 * définitif ensuite (et toujours, pour un bien jamais inscrit en cours).
 * Toute écriture du module qui touche le compte du bien (acquisition, coûts
 * d'emprunt incorporés, sortie) et tout tableau qui le range passent par lui ·
 * une condition recopiée ailleurs finirait par créditer le 23 d'un bien
 * encore au 239, sur une écriture équilibrée.
 */
export function compteInscritALaDate(
  immo: { compteImmobilisationId: string; compteEnCoursId?: string | null; dateMiseEnService: Date | null },
  date: Date,
): string {
  if (!immo.compteEnCoursId) return immo.compteImmobilisationId;
  if (immo.dateMiseEnService && date >= immo.dateMiseEnService) return immo.compteImmobilisationId;
  return immo.compteEnCoursId;
}

/**
 * Le même lecteur, rendu en COMPTE (numéro et intitulé) pour les tableaux qui
 * rangent le bien par compte · le tableau des immobilisations et celui des
 * amortissements. Une seule décision, `compteInscritALaDate` ; ici, seulement
 * le choix de l'objet déjà chargé qui lui correspond.
 */
export function compteInscritChargeALaDate<C extends { id: string }>(
  immo: {
    compteImmobilisationId: string;
    compteEnCoursId?: string | null;
    dateMiseEnService: Date | null;
    compteImmobilisation: C;
    compteEnCours?: C | null;
  },
  date: Date,
): C {
  const id = compteInscritALaDate(immo, date);
  return id !== immo.compteImmobilisationId && immo.compteEnCours ? immo.compteEnCours : immo.compteImmobilisation;
}

/**
 * UN BIEN ENCORE EN COURS NE SE RENOUVELLE PAS · renouveler un composant ou
 * remplacer une partie (AUDCIF Titre VIII ch. 4 § 4.1, § 4.2) suppose un bien
 * en service dont un élément est usé ; tant que le bien est au 2x9, il n'est
 * pas achevé et rien n'y a servi. Le remplaçant, lui, naît en service · le
 * laisser passer créditerait le compte définitif d'un bien encore inscrit en
 * cours, sur une écriture équilibrée. Null quand le geste est permis.
 */
export function motifRefusTantQueEnCours(
  immo: { compteImmobilisationId: string; compteEnCoursId?: string | null; dateMiseEnService: Date | null },
  date: Date,
  geste: string,
): string | null {
  if (compteInscritALaDate(immo, date) === immo.compteImmobilisationId) return null;
  return immo.dateMiseEnService
    ? `Ce bien était encore inscrit en cours à cette date · il n'est mis en service que le ${immo.dateMiseEnService
        .toISOString()
        .slice(0, 10)}, et ${geste} ne peut la précéder.`
    : `Ce bien est encore inscrit en cours · mettez-le en service avant ${geste}.`;
}
