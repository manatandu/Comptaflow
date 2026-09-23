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
    /*
      LA BARRE DES TÂCHES DE WINDOWS 11 (2026-09-23) · des boutons sans
      bordure, et sous chacun un trait qui dit son état : long et bleu pour la
      fenêtre active, court et gris pour une fenêtre ouverte derrière, absent
      pour une fenêtre réduite. C'est le signe que l'œil d'un utilisateur de
      Windows cherche déjà.
    */
    <div className="ecran-seul relative z-20 h-[34px] shrink-0 flex items-center gap-1 px-2 bg-surface border-t border-border">
      <div className="flex-1 min-w-0 flex items-center gap-0.5 overflow-x-auto h-full">
        {onglets.map((f) => {
          const active = f.cle === cleActive;
          const reduite = f.etat === 'reduite';
          return (
            <div
              key={f.cle}
              className={`group relative flex items-center shrink-0 h-[28px] rounded-[4px] transition-colors duration-150 ${
                active ? 'bg-chrome-alt text-text' : reduite ? 'text-text-dim hover:bg-chrome' : 'text-text hover:bg-chrome'
              }`}
            >
              {!reduite && (
                <span
                  aria-hidden
                  className={`absolute bottom-0 left-1/2 -translate-x-1/2 h-[3px] rounded-full transition-all duration-200 ${
                    active ? 'w-4 bg-sel' : 'w-1.5 bg-border-dark'
                  }`}
                />
              )}
              <button
                type="button"
                title={f.titre}
                // Cliquer l'onglet de la fenêtre ACTIVE la réduit, comme dans
                // la barre des tâches de Windows : le même bouton sert à
                // montrer et à masquer, sans avoir à viser autre chose.
                onClick={() => (active ? reduire(f.cle) : activer(f.cle))}
                className={`max-w-[190px] truncate px-3 h-full text-[12px] ${active ? 'font-semibold' : ''}`}
              >
                {f.titreCourt}
              </button>
              <button
                type="button"
                title={`Fermer ${f.titre}`}
                aria-label={`Fermer ${f.titre}`}
                onClick={() => fermer(f.cle)}
                /*
                  La croix ne s'efface QUE là où un survol existe. Sur un
                  écran tactile, `group-hover` ne se déclenche jamais : la
                  croix restait invisible et le seul moyen de fermer une
                  fenêtre depuis la barre disparaissait. On garde donc le
                  dévoilement au survol sur les pointeurs fins, et on affiche
                  la croix en permanence partout ailleurs.
                */
                className="mr-1 flex items-center justify-center w-[16px] h-[16px] rounded-[4px] text-text-dim opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 hover:bg-danger hover:text-white transition-opacity duration-150"
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
          className="shrink-0 rounded-[4px] px-2.5 h-[28px] text-[12px] text-text-dim hover:bg-chrome hover:text-text"
        >
          Tout fermer
        </button>
      )}
    </div>
  );
}
