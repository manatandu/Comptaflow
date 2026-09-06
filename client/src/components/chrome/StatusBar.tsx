import { useAuth } from '../../lib/auth';
import { SelecteurExercice } from './SelecteurExercice';
import { useFenetres } from '../../lib/fenetres';

const LIBELLE_ROLE: Record<string, string> = {
  ADMIN_CABINET: 'Administrateur',
  COMPTABLE: 'Comptable',
  LECTURE_SEULE: 'Lecture seule',
};

export function StatusBar() {
  const { utilisateur } = useAuth();
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
    <div className="h-[21px] bg-chrome/70 backdrop-blur-md border-t border-border flex items-center justify-between gap-3 px-3 text-[10px] text-text-dim shrink-0">
      {/*
        `min-w-0` des deux côtés et `truncate` sur les textes : sans eux, un
        élément flex refuse de descendre sous la largeur de son contenu, et
        les deux libellés débordaient de 21 px hors de la barre à 360 px ·
        ils s'imprimaient par-dessus le bord de l'écran.
      */}
      <span className="flex items-center gap-2 min-w-0">
        {/* Pastille de veille · le halo dit « connecté » sans clignoter. */}
        <span className="relative flex w-1.5 h-1.5 shrink-0">
          <span className="absolute -inset-[2.5px] rounded-full bg-positive/25" />
          <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-positive" />
        </span>
        <span className="font-medium text-text truncate">{titreFenetre}</span>
      </span>
      {/*
        L'exercice n'est plus un simple libellé · il se CHOISIT ici. Le point
        médian qui le sépare du reste est porté par le sélecteur lui-même : un
        dossier sans aucun exercice ne rend rien, et une barre qui se
        terminerait par un séparateur orphelin se lirait comme un libellé perdu.
      */}
      <span className="min-w-0 truncate flex items-center gap-1">
        <span className="truncate">
          {utilisateur?.tenant.nom} · {utilisateur?.tenant.referentiel}
          {utilisateur && ` · ${LIBELLE_ROLE[utilisateur.role]}`}
        </span>
        <SelecteurExercice />
      </span>
    </div>
  );
}
