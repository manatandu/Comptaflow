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
 * est donc TEMPORAIRE et croissant : gênant pour qui essaie des milliers de
 * mots de passe, supportable pour qui s'est trompé de clavier.
 *
 * Les durées sont volontairement modestes au début (une minute après cinq
 * échecs) et sévères ensuite : une attaque tient rarement une demi-heure par
 * palier, une faute de frappe ne va jamais jusque-là.
 */

export const SEUIL_VERROUILLAGE = 5;

/** Durée du verrou, en minutes, selon le nombre d'échecs consécutifs. */
export function dureeVerrouMinutes(tentativesEchouees: number): number {
  if (tentativesEchouees < SEUIL_VERROUILLAGE) return 0;
  const paliers = [1, 5, 15, 30, 60];
  const rang = tentativesEchouees - SEUIL_VERROUILLAGE;
  return paliers[Math.min(rang, paliers.length - 1)];
}

/** Instant de déverrouillage, ou null si le compte n'a pas à être verrouillé. */
export function instantDeverrouillage(tentativesEchouees: number, maintenant: Date): Date | null {
  const minutes = dureeVerrouMinutes(tentativesEchouees);
  return minutes === 0 ? null : new Date(maintenant.getTime() + minutes * 60_000);
}

/** Message d'attente, arrondi à la minute supérieure pour ne pas dire « 0 minute ». */
export function messageVerrou(verrouilleJusqua: Date, maintenant: Date): string {
  const minutes = Math.max(1, Math.ceil((verrouilleJusqua.getTime() - maintenant.getTime()) / 60_000));
  return (
    `Ce compte est temporairement verrouillé après plusieurs tentatives infructueuses. ` +
    `Réessayez dans ${minutes} minute${minutes > 1 ? 's' : ''}, ou demandez à l'administrateur du dossier ` +
    `de réinitialiser votre mot de passe.`
  );
}
