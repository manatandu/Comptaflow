import { useFenetres } from '../../lib/fenetres';

/**
 * BARRE DES FENÊTRES · la bande du bas de Sage 100 i7, où chaque fenêtre
 * ouverte laisse un onglet (« Plan Co… ▫ ▫ ✕ », « Ajout d'… ▫ ▫ ✕ » sur les
 * captures). C'est elle qui rend le multi-fenêtres utilisable : sans elle,
 * une fenêtre réduite disparaîtrait sans laisser d'adresse.
 *
 * Elle ne s'affiche que s'il y a quelque chose à y montrer · une bande vide
 * en permanence volerait 30 pixels de hauteur utile pour ne rien dire.
 */
export function BarreFenetres() {
  const { fenetres, cleActive, activer, fermer, fermerTout, reduire } = useFenetres();

  if (fenetres.length === 0) return null;

  // Ordre d'OUVERTURE, pas d'empilement : un onglet qui saute de place à
  // chaque clic serait impossible à viser. Windows et Sage font de même.
  const onglets = [...fenetres];

  return (
    <div className="ecran-seul relative z-20 h-[26px] shrink-0 flex items-center gap-1 px-2 bg-chrome/80 backdrop-blur-md border-t border-border">
      <div className="flex-1 min-w-0 flex items-center gap-1 overflow-x-auto">
        {onglets.map((f) => {
          const active = f.cle === cleActive;
          const reduite = f.etat === 'reduite';
          return (
            <div
              key={f.cle}
              className={`group flex items-center shrink-0 rounded-[7px] border transition-colors duration-150 ${
                active
                  ? 'bg-sel-soft border-sel/35 text-sel'
                  : reduite
                    ? 'bg-transparent border-border text-text-dim hover:bg-chrome-alt'
                    : 'bg-surface border-border text-text hover:bg-chrome-alt'
              }`}
            >
              <button
                type="button"
                title={f.titre}
                // Cliquer l'onglet de la fenêtre ACTIVE la réduit, comme dans
                // la barre des tâches de Windows : le même bouton sert à
                // montrer et à masquer, sans avoir à viser autre chose.
                onClick={() => (active ? reduire(f.cle) : activer(f.cle))}
                className="max-w-[190px] truncate px-2.5 py-[3px] text-[10.5px] font-medium"
              >
                {f.titreCourt}
              </button>
              <button
                type="button"
                title={`Fermer ${f.titre}`}
                aria-label={`Fermer ${f.titre}`}
                onClick={() => fermer(f.cle)}
                className="mr-1 flex items-center justify-center w-[16px] h-[16px] rounded-[4px] text-text-dim opacity-0 group-hover:opacity-100 hover:bg-danger hover:text-white transition-opacity duration-150"
              >
                <svg viewBox="0 0 16 16" width="9" height="9">
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>
      {fenetres.length > 1 && (
        <button
          type="button"
          onClick={fermerTout}
          title="Fermer toutes les fenêtres et revenir à l’accueil"
          className="shrink-0 rounded-[7px] px-2 py-[3px] text-[10px] font-semibold text-text-dim hover:bg-chrome-alt hover:text-text"
        >
          Tout fermer
        </button>
      )}
    </div>
  );
}
