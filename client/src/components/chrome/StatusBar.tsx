import { useAuth } from '../../lib/auth';
import { useExercice } from '../../lib/exercice';
import { useFenetres } from '../../lib/fenetres';

const LIBELLE_ROLE: Record<string, string> = {
  ADMIN_CABINET: 'Administrateur',
  COMPTABLE: 'Comptable',
  LECTURE_SEULE: 'Lecture seule',
};

export function StatusBar() {
  const { utilisateur } = useAuth();
  const { exerciceCourant } = useExercice();
  const { fenetres, cleActive } = useFenetres();

  /*
    Le nom de la fenêtre active vient du GESTIONNAIRE DE FENÊTRES, plus d'une
    table de correspondance tenue ici. Cette table doublait la liste des
    écrans et se périmait en silence : un écran ajouté sans sa ligne
    s'annonçait « Prêt ». Le titre affiché est désormais, par construction,
    celui que porte la barre de titre de la fenêtre · ils ne peuvent plus
    diverger. Aucune fenêtre ouverte = on regarde l'accueil.
  */
  const titreFenetre = fenetres.find((f) => f.cle === cleActive)?.titre ?? 'Accueil';

  return (
    <div className="h-[21px] bg-chrome/70 backdrop-blur-md border-t border-border flex items-center justify-between px-3 text-[10px] text-text-dim shrink-0">
      <span className="flex items-center gap-2">
        {/* Pastille de veille · le halo dit « connecté » sans clignoter. */}
        <span className="relative flex w-1.5 h-1.5">
          <span className="absolute -inset-[2.5px] rounded-full bg-positive/25" />
          <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-positive" />
        </span>
        <span className="font-medium text-text">{titreFenetre}</span>
      </span>
      <span>
        {utilisateur?.tenant.nom} · {utilisateur?.tenant.referentiel}
        {utilisateur && ` · ${LIBELLE_ROLE[utilisateur.role]}`}
        {exerciceCourant && ` · Exercice ${new Date(exerciceCourant.dateDebut).getFullYear()}`}
      </span>
    </div>
  );
}
