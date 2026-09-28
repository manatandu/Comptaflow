import { useExercice } from '../../lib/exercice';
import { libelleExercice } from '../../lib/libelle-exercice';

/**
 * SÉLECTEUR D'EXERCICE · la barre de statut affichait l'exercice, elle ne
 * permettait pas d'en changer. Les trente-quatre écrans qui lisent le contexte
 * travaillaient donc sur un exercice que personne n'avait choisi.
 *
 * Il vit dans la BARRE DE STATUT et non dans un menu : c'est le seul endroit
 * présent sur tous les écrans, et l'exercice courant doit être lisible en
 * permanence, pas seulement quand on va le chercher. Un état financier édité
 * pour le mauvais exercice ne se voit sur aucun total.
 *
 * L'AVERTISSEMENT DE CHOIX IMPLICITE est la moitié qui compte. Quand plusieurs
 * exercices sont ouverts et que l'utilisateur n'a rien choisi, le libellé passe
 * en `warning` et le titre au survol dit pourquoi. Sans lui, le sélecteur
 * afficherait un exercice juste, et laisserait croire qu'il a été décidé.
 */
export function SelecteurExercice() {
  const { exerciceCourant, exercices, choisir, choixImplicite, erreur } = useExercice();

  // UNE LECTURE MANQUÉE SE DIT (audit final F248) · sans exercice lu, la barre
  // se taisait comme sur un dossier qui n'en a aucun. Après une relecture
  // manquée, la liste affichée est celle d'avant, et la barre le dit aussi.
  // Le motif est au survol, la fenêtre Exercices l'affiche en entier.
  const alerteLecture = erreur ? (
    <span className="shrink-0 text-warning font-medium" title={erreur}>
      {exerciceCourant ? '· Exercices non relus' : '· Exercices illisibles'}
    </span>
  ) : null;

  if (!exerciceCourant) return alerteLecture;

  // LE LIBELLÉ EST CELUI DE LA BARRE DE TITRE (audit final F250) · un
  // exercice à cheval sur deux années civiles se lit « 2026-2027 » en haut
  // comme en bas, par la même fonction (lib/libelle-exercice.ts).

  // Un seul exercice : rien à choisir, le sélecteur reste un simple libellé.
  if (exercices.length <= 1) {
    return (
      <>
        <span className="shrink-0">· Exercice {libelleExercice(exerciceCourant)}</span>
        {alerteLecture}
      </>
    );
  }

  return (
    <label className="flex items-center gap-1 shrink-0">
      {alerteLecture}
      <span className={choixImplicite ? 'text-warning' : undefined}>· Exercice</span>
      <select
        aria-label="Exercice de travail"
        title={
          choixImplicite
            ? "Plusieurs exercices sont ouverts et aucun n'a été choisi · le plus récent est affiché. Choisissez celui sur lequel vous travaillez."
            : 'Exercice sur lequel portent tous les écrans'
        }
        value={exerciceCourant.id}
        onChange={(e) => choisir(e.target.value)}
        className={`bg-transparent border-0 p-0 text-[11px] cursor-pointer focus:outline-none focus:ring-1 focus:ring-accent rounded ${
          choixImplicite ? 'text-warning font-medium' : 'text-text-dim'
        }`}
      >
        {exercices.map((e) => (
          <option key={e.id} value={e.id} className="bg-chrome text-text">
            {libelleExercice(e)}
            {e.statut === 'OUVERT' ? '' : ' (clôturé)'}
          </option>
        ))}
      </select>
    </label>
  );
}
