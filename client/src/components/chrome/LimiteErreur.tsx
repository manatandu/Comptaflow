import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * BARRIÈRE D'ERREUR · une par fenêtre.
 *
 * Nécessaire depuis le passage à l'espace de travail multi-fenêtres : React
 * démonte TOUT l'arbre quand une exception de rendu n'est pas rattrapée. Sans
 * barrière, un défaut dans un seul écran ne ferait plus perdre cet écran mais
 * l'application entière · l'accueil, la barre des fenêtres, ET les autres
 * fenêtres ouvertes, avec la saisie en cours dedans. C'est précisément ce
 * qu'une comptabilité ne peut pas se permettre.
 *
 * La barrière isole donc chaque fenêtre : celle qui échoue affiche son état,
 * les voisines continuent de fonctionner. Le message ne cache rien · il donne
 * l'erreur réelle, parce qu'un utilisateur qui la recopie dans un signalement
 * fait gagner un aller-retour, et qu'une phrase rassurante à la place ne
 * répare rien.
 *
 * Il faut une classe : `componentDidCatch` n'a pas d'équivalent en hook.
 */
export class LimiteErreur extends Component<
  { titreFenetre: string; children: ReactNode },
  { erreur: Error | null }
> {
  state: { erreur: Error | null } = { erreur: null };

  static getDerivedStateFromError(erreur: Error) {
    return { erreur };
  }

  componentDidCatch(erreur: Error, infos: ErrorInfo) {
    // La console reste la trace la plus utile pour diagnostiquer : on n'avale
    // pas l'erreur silencieusement sous prétexte qu'elle est affichée.
    console.error(`[OmegaX] fenêtre « ${this.props.titreFenetre} » :`, erreur, infos.componentStack);
  }

  render() {
    const { erreur } = this.state;
    if (!erreur) return this.props.children;
    return (
      <div className="p-6 max-w-[620px]">
        <div className="rounded-[12px] border border-danger/40 bg-surface p-4">
          <h2 className="text-[14px] font-semibold text-danger">Cette fenêtre n’a pas pu s’afficher</h2>
          <p className="mt-2 text-[12.5px] text-text-dim leading-relaxed">
            Les autres fenêtres et vos saisies en cours ne sont pas touchées. Vous pouvez refermer celle-ci et
            continuer ailleurs.
          </p>
          <pre className="mt-3 overflow-auto rounded-[8px] bg-chrome-alt p-2.5 text-[11px] leading-relaxed text-text">
            {erreur.message}
          </pre>
          <button
            type="button"
            onClick={() => this.setState({ erreur: null })}
            className="mt-3 rounded-[8px] border border-border px-3 py-1.5 text-[11.5px] font-semibold hover:bg-chrome-alt"
          >
            Réessayer l’affichage
          </button>
        </div>
      </div>
    );
  }
}
