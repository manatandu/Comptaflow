import type { ReactNode } from 'react';

/**
 * PRIMITIVES DE FORMULAIRE, au modèle Sage 100 i7.
 *
 * Extraites de l'assistant de création (`NouveauFichierWizard`) le jour où la
 * fenêtre « Identification de votre société » a demandé exactement la même
 * grammaire : c'est une grammaire de logiciel, pas la décoration d'un écran.
 */

/**
 * LIGNE DE FORMULAIRE · étiquette ALIGNÉE À DROITE dans une colonne fixe,
 * champ dans la colonne suivante.
 *
 * Ce n'est pas un choix d'esthétique : l'œil descend UNE colonne d'étiquettes
 * et UNE colonne de champs, au lieu de balayer en zigzag comme avec des
 * étiquettes posées au-dessus. Sur une fiche de quinze champs (Activité,
 * Forme juridique, Capital, Adresse, Complément, Code postal, Ville…) la
 * différence de vitesse de lecture est réelle · c'est la raison pour laquelle
 * les formulaires de gestion Windows sont bâtis ainsi depuis trente ans.
 */
export function Ligne({
  label,
  children,
  large,
  aide,
}: {
  label: string;
  children: ReactNode;
  /** Champ pleine largeur (adresse, activité) plutôt qu'étroit (dates, codes). */
  large?: boolean;
  /** Précision sous le champ · une phrase, pas un paragraphe. */
  aide?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 mb-1.5">
      <span className="w-[158px] flex-shrink-0 text-right text-[11px] text-text leading-[26px]">{label}</span>
      <div className={large ? 'flex-1 min-w-0' : 'w-[210px] flex-shrink-0'}>
        {children}
        {aide && <div className="mt-0.5 text-[10.5px] text-text-dim leading-[1.5]">{aide}</div>}
      </div>
    </div>
  );
}

/**
 * TITRE DE SECTION avec filet · « Coordonnées », « Télécommunication »,
 * « Immatriculation » chez Sage. Il découpe une fiche longue en blocs nommés
 * sans ouvrir une fenêtre de plus, ni empiler des cartes à ombre.
 */
export function SectionTitre({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 mt-4 mb-2.5 first:mt-0">
      <span className="text-[12px] text-text-dim">{children}</span>
      <span className="flex-1 h-px bg-border" />
    </div>
  );
}

/** Gabarit de champ commun à toutes les fenêtres de saisie du logiciel. */
export const champSage =
  'w-full rounded-[6px] border border-border bg-surface px-2.5 py-1 text-[12px] focus:outline-none focus:ring-2 focus:ring-sel/25 focus:border-sel disabled:bg-chrome disabled:text-text-dim';

/**
 * DIALOGUE À ONGLETS VERTICAUX · la fenêtre « Identification de votre
 * société » de Sage, dont les six onglets (Identification, Contacts,
 * Monnaie & Formats, IFRS, Fichiers liés, Préférences) se lisent dans une
 * liste à gauche, le contenu occupant tout le reste.
 *
 * Pourquoi une LISTE VERTICALE plutôt que des onglets en rangée : les noms
 * sont longs (« Monnaie et formats », « Régime fiscal et effectif ») et leur
 * nombre grandira. Une rangée horizontale les tronquerait ou passerait à la
 * ligne · une colonne les lit en entier et supporte l'ajout d'un septième
 * sans rien casser.
 *
 * Le TITRE suit l'onglet actif (Sage écrit « Identification de votre société
 * - IFRS ») : la barre de titre dit à tout moment où l'on se trouve, y
 * compris quand la fenêtre est réduite dans la barre des fenêtres.
 */
export function OngletsVerticaux<T extends string>({
  onglets,
  actif,
  onChanger,
  children,
}: {
  onglets: readonly { cle: T; libelle: string }[];
  actif: T;
  onChanger: (cle: T) => void;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-1 min-h-0 border border-border bg-surface">
      <div className="w-[172px] flex-shrink-0 border-r border-border bg-chrome overflow-y-auto py-1">
        {onglets.map((o) => {
          const estActif = o.cle === actif;
          return (
            <button
              key={o.cle}
              type="button"
              onClick={() => onChanger(o.cle)}
              aria-current={estActif ? 'page' : undefined}
              className={`w-full text-left px-3 py-1.5 text-[11px] border-l-[3px] transition-colors ${
                estActif
                  ? 'border-sel bg-sel-soft text-text font-semibold'
                  : 'border-transparent text-text-dim hover:bg-chrome-alt hover:text-text'
              }`}
            >
              {o.libelle}
            </button>
          );
        })}
      </div>
      <div className="flex-1 min-w-0 overflow-y-auto p-4">{children}</div>
    </div>
  );
}
