/**
 * LE LIBELLÉ D'UN EXERCICE · une seule écriture pour tout le chrome (audit
 * final F250).
 *
 * La barre de titre écrivait l'année de DÉBUT seule, le sélecteur de la barre
 * de statut « début-fin » dès que l'exercice enjambe deux années civiles. Sur
 * un premier exercice ouvert le 1er juillet 2026 et clos le 31 décembre 2027
 * (AUDCIF art. 7 l'admet au second semestre), le même écran annonçait donc
 * « Exercice 2026 » en haut et « Exercice 2026-2027 » en bas · deux libellés
 * pour un seul exercice, dont l'un le confondait avec l'exercice 2026
 * ordinaire d'un autre dossier.
 *
 * La forme retenue est celle du sélecteur · un exercice qui coïncide avec
 * l'année civile se lit sur son année, les autres « début-fin », pour que le
 * premier et le dernier exercice d'une entité restent discernables.
 *
 * LES ÉCRANS AUSSI, pas seulement le chrome · l'en-tête des états et des
 * notes, les listes d'exercices cibles, les messages, le nom par défaut
 * d'une liasse et le plan fiscal dégressif écrivaient encore l'année de
 * début (ou de clôture) à la main. Sous une barre de titre « 2026-2027 », la
 * liasse d'un premier exercice long s'annonçait « Exercice 2026 ».
 * `libelle-exercice.spec.ts` refuse désormais toute année lue à la main sur
 * une date d'exercice, ailleurs qu'ici.
 *
 * L'ANNÉE SE LIT EN UTC · un exercice commence et finit à minuit UTC (le
 * serveur les pose par `Date.UTC`, et une date `AAAA-MM-JJ` se lit en UTC),
 * comme tout jour du dépôt (audit final F81). Lue à l'heure du poste, une
 * ouverture au 1er janvier se lisait sur l'année d'avant partout à l'ouest de
 * Greenwich.
 */
export function libelleExercice(exercice: { dateDebut: string; dateFin: string }): string {
  const debut = new Date(exercice.dateDebut).getUTCFullYear();
  const fin = new Date(exercice.dateFin).getUTCFullYear();
  return debut === fin ? String(debut) : `${debut}-${fin}`;
}
