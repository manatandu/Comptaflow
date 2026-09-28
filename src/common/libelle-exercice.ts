/**
 * LE LIBELLÉ D'UN EXERCICE, CÔTÉ SERVEUR · le jumeau de
 * `client/src/lib/libelle-exercice.ts` (audit final F250), même contrat.
 *
 * Les libellés des écritures que la clôture, le report à-nouveau et
 * l'affectation engendrent, et les noms des fichiers exportés, écrivaient
 * l'année de DÉBUT seule (ou de clôture, selon l'endroit). Sur un premier
 * exercice ouvert le 1er juillet 2026 et clos le 31 décembre 2027 (AUDCIF
 * art. 7 l'admet au second semestre), le report à-nouveau s'annonçait
 * « ouverture exercice 2026 » sous une barre de titre « 2026-2027 », et deux
 * exports de ce dossier et de l'exercice 2026 ordinaire d'un autre portaient
 * le même suffixe.
 *
 * Un exercice qui coïncide avec l'année civile se lit sur son année, les
 * autres « début-fin ». L'année se lit en UTC · un exercice commence et finit
 * à minuit UTC, comme tout jour du dépôt (audit final F81), et l'heure locale
 * d'un serveur sur site ne doit pas la déplacer.
 */
export function libelleExercice(exercice: { dateDebut: Date; dateFin: Date }): string {
  const debut = exercice.dateDebut.getUTCFullYear();
  const fin = exercice.dateFin.getUTCFullYear();
  return debut === fin ? String(debut) : `${debut}-${fin}`;
}
