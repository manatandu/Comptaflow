/**
 * VERROUILLAGE PAR COMPTE.
 *
 * Le limiteur global (ThrottlerGuard) est par ADRESSE IP · il ne voit pas une
 * attaque lancée depuis vingt adresses contre UN seul compte, qui est
 * exactement la forme que prend une attaque réelle par liste de mots de passe.
 *
 * LA CONTREPARTIE, et c'est elle qui décide de la forme : un verrou DÉFINITIF
 * se retourne en refus de service. Il suffirait de saisir n'importe quoi cinq
 * fois sur l'adresse d'un comptable pour l'empêcher de travailler, et l'adresse
 * d'un comptable n'est pas un secret · elle figure sur ses courriels. Le verrou
 * est donc TEMPORAIRE et croissant, dans la forme que NIST SP 800-63B-4
 * (section « Rate Limiting (Throttling) ») donne en exemple, un délai qui
 * augmente « from 30 seconds up to an hour » · ici 1, 5, 15, 30 puis 60
 * minutes à partir du cinquième échec consécutif.
 *
 * CE QUE LE CODE FAIT, ET QU'IL NE FAISAIT PAS JUSQU'AU 2026-09-28. Le
 * compteur repartait de zéro dès que le verrou précédent était échu. Un
 * attaquant qui attendait la fin de chaque verrou ne dépassait donc jamais le
 * palier d'une minute (cinq essais par minute, environ sept mille par jour et
 * par compte), et la croissance annoncée ne jouait JAMAIS contre lui · elle ne
 * frappait que le titulaire assez pressé pour réessayer pendant le verrou,
 * essai qui n'est d'ailleurs pas compté. Le compteur ne se remet plus à zéro
 * à l'échéance du verrou. Il tombe dans trois cas, et trois seulement :
 *  · une connexion RÉUSSIE · NIST SP 800-63B-4, même section, « when the
 *    subscriber successfully authenticates, the verifier SHOULD disregard
 *    any previous failed attempts » ;
 *  · un mot de passe CHANGÉ ou RÉINITIALISÉ, et le déverrouillage par
 *    l'administrateur · celui qui les pose a prouvé qui il est ou en répond ;
 *  · le DÉLAI D'OUBLI, douze heures sans aucun échec, compté depuis le
 *    DERNIER échec (`User.dernierEchecLe`). C'est la valeur par défaut du
 *    « Failure Reset Time » de Keycloak (documentation « Brute force
 *    detection »), dont la même documentation exige qu'il dépasse le verrou
 *    le plus long · sinon le compteur s'oublie avant que le dernier palier
 *    ne soit jamais atteint, et le plafond est une promesse vide. Sans ce
 *    délai, une faute de frappe six mois plus tard hériterait de la sévérité
 *    d'un incident oublié ; avec lui, l'attaquant patient paie le palier
 *    d'une heure dès le neuvième échec, soit une trentaine d'essais par
 *    jour et par compte au lieu de sept mille.
 */

export const SEUIL_VERROUILLAGE = 5;

/** Paliers du verrou, en minutes, du cinquième échec consécutif au plafond. */
export const PALIERS_VERROU_MINUTES = [1, 5, 15, 30, 60] as const;

/**
 * DÉLAI D'OUBLI, en heures · compté depuis le dernier échec. Doit dépasser le
 * palier le plus long (verrouillage.spec.ts le tient), sans quoi le plafond
 * n'est jamais atteint.
 */
export const DELAI_OUBLI_ECHECS_HEURES = 12;

/** Durée du verrou, en minutes, selon le nombre d'échecs consécutifs. */
export function dureeVerrouMinutes(tentativesEchouees: number): number {
  if (tentativesEchouees < SEUIL_VERROUILLAGE) return 0;
  const rang = tentativesEchouees - SEUIL_VERROUILLAGE;
  return PALIERS_VERROU_MINUTES[Math.min(rang, PALIERS_VERROU_MINUTES.length - 1)];
}

/** Instant de déverrouillage, ou null si le compte n'a pas à être verrouillé. */
export function instantDeverrouillage(tentativesEchouees: number, maintenant: Date): Date | null {
  const minutes = dureeVerrouMinutes(tentativesEchouees);
  return minutes === 0 ? null : new Date(maintenant.getTime() + minutes * 60_000);
}

/**
 * Le décompte d'un NOUVEL échec, et ce qu'il faut écrire. Le compteur
 * antérieur est oublié si le dernier échec date d'au moins le délai d'oubli,
 * JAMAIS parce qu'un verrou est échu. Un compte sans date de dernier échec
 * (compteur écrit avant le 2026-09-28, ou jamais d'échec) repart de zéro ·
 * son ancienneté est inconnue, et la lire comme récente ferait hériter un
 * titulaire d'échecs d'un autre âge.
 */
export function decompteApresEchec(
  user: { tentativesEchouees: number; dernierEchecLe: Date | null },
  maintenant: Date,
): { tentativesEchouees: number; verrouilleJusqua: Date | null; dernierEchecLe: Date } {
  const oublie =
    !user.dernierEchecLe ||
    maintenant.getTime() - user.dernierEchecLe.getTime() >= DELAI_OUBLI_ECHECS_HEURES * 3_600_000;
  const echecs = (oublie ? 0 : user.tentativesEchouees) + 1;
  return { tentativesEchouees: echecs, verrouilleJusqua: instantDeverrouillage(echecs, maintenant), dernierEchecLe: maintenant };
}

/** Ce qu'écrit toute remise à zéro (succès, mot de passe changé ou réinitialisé, déverrouillage). */
export const DECOMPTE_REMIS_A_ZERO = { tentativesEchouees: 0, verrouilleJusqua: null, dernierEchecLe: null } as const;

/**
 * LE MESSAGE D'UN REFUS DE CONNEXION, UN SEUL (audit final F238). Adresse
 * inconnue, mot de passe faux, compte verrouillé · les trois rendent CE texte,
 * mot pour mot. Le verrou disait jusque-là « Ce compte est temporairement
 * verrouillé… », et une adresse inconnue ne se verrouille jamais · il suffisait
 * de cinq essais pour savoir qu'une adresse avait un compte. La suspension est
 * donc nommée pour tous, sans dire si elle frappe ce compte · le titulaire
 * bloqué sait quoi attendre, l'inconnu n'apprend rien. Elle n'est pas non plus
 * réservée au BON mot de passe, qui la ferait servir d'oracle pendant le
 * verrou (auth.service.ts, `login`).
 */
export const MOTIF_IDENTIFIANTS_INVALIDES =
  "Identifiants invalides · après plusieurs essais manqués, un compte reste fermé quelques minutes, ou jusqu'à ce que " +
  "l'administrateur du dossier réinitialise son mot de passe.";
