import { useExercice } from '../../lib/exercice';

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
  const { exerciceCourant, exercices, choisir, choixImplicite } = useExercice();

  if (!exerciceCourant) return null;

  const annee = (e: { dateDebut: string; dateFin: string }) => {
    const debut = new Date(e.dateDebut).getFullYear();
    const fin = new Date(e.dateFin).getFullYear();
    // Un exercice à cheval sur deux années civiles se lit « 2026-2027 » ·
    // l'AUDCIF art. 7 fait coïncider l'exercice avec l'année civile, mais le
    // premier et le dernier d'une entité y échappent, et l'afficher sur sa
    // seule année de début les rendrait indiscernables.
    return debut === fin ? String(debut) : `${debut}-${fin}`;
  };

  // Un seul exercice : rien à choisir, le sélecteur reste un simple libellé.
  if (exercices.length <= 1) {
    return <span className="shrink-0">· Exercice {annee(exerciceCourant)}</span>;
  }

  return (
    <label className="flex items-center gap-1 shrink-0">
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
        className={`bg-transparent border-0 p-0 text-[10px] cursor-pointer focus:outline-none focus:ring-1 focus:ring-accent rounded ${
          choixImplicite ? 'text-warning font-medium' : 'text-text-dim'
        }`}
      >
        {exercices.map((e) => (
          <option key={e.id} value={e.id} className="bg-chrome text-text">
            {annee(e)}
            {e.statut === 'OUVERT' ? '' : ' (clôturé)'}
          </option>
        ))}
      </select>
    </label>
  );
}
