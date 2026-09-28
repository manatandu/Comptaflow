import { useAuth } from '../../lib/auth';
import { bandeauDemonstration } from '../../lib/bandeau-demonstration';

/**
 * Bandeau permanent d'un dossier de démonstration (`lib/bandeau-demonstration.ts`).
 * Posé sous la barre de menus, sur toute la largeur, aux couleurs d'avertissement
 * doux de la charte · il ne se ferme pas, une vitrine se dit fictive sur chaque
 * écran. Hors vitrine il ne rend RIEN, pas même une ligne vide.
 *
 * `min-w-0` et `truncate` · à 360 px le libellé se coupe au lieu de pousser
 * l'espace de travail de côté (même défaut que la barre d'état,
 * `chrome-etroit.spec.ts`).
 */
export function BandeauDemonstration() {
  const { utilisateur } = useAuth();
  const texte = bandeauDemonstration(utilisateur?.tenant);
  if (!texte) return null;
  return (
    <div
      role="note"
      className="shrink-0 min-w-0 flex items-center justify-center px-3 py-[3px] bg-warning-soft text-warning border-b border-warning/30 text-[11.5px] font-medium"
    >
      <span className="truncate">{texte}</span>
    </div>
  );
}
