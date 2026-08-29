import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFenetres } from '../../lib/fenetres';
import { useRegistreActions, type NomAction } from '../../lib/actions-fenetre';
import { Calculette } from '../Calculette';
import {
  IconAjouter,
  IconAtteindre,
  IconCalculette,
  IconConsulter,
  IconInverseur,
  IconModifier,
  IconRechercher,
  IconSupprimer,
  IconTrier,
} from './icons';
import type { SVGProps } from 'react';

/**
 * BARRE D'OUTILS · celle de Sage 100 i7, et non un second sommaire.
 *
 * Elle listait sept ÉCRANS (Saisie, Journal, Balance, Plan comptable, Tiers,
 * États, Tableau de bord) · exactement les mêmes que les tuiles de l'accueil.
 * Deux surfaces pour la même chose : la tautologie relevée à l'usage. Sage ne
 * fait pas cela. Sa barre porte les VERBES qui agissent sur l'enregistrement
 * courant de la fenêtre active :
 *
 *   Ajouter · Consulter · Voir/Modifier · Supprimer
 *   Précédent · Suivant
 *   Rechercher · Atteindre
 *   Inverseur · Calculette Sage
 *   Trier
 *
 * et grise ceux qui ne s'appliquent pas à la fenêtre du moment · ce sont les
 * boutons pâles qu'on voit sur les captures. Les écrans, eux, se lancent par
 * les menus et par l'accueil : chaque surface a maintenant un rôle, un seul.
 *
 * Un bouton grisé n'est pas un chantier inachevé : il dit que CETTE fenêtre
 * ne sait pas faire cette action. Chaque page déclare les siennes
 * (`useActionsFenetre`, voir lib/actions-fenetre.tsx).
 *
 * Précédent, Suivant et Accueil restent inchangés, à leur place, en tête.
 */

interface DefAction {
  nom: NomAction;
  label: string;
  /** Ce que le verbe veut dire, y compris quand personne ne le propose. */
  aide: string;
  Icon: (p: SVGProps<SVGSVGElement>) => JSX.Element;
}

const GROUPES_ACTIONS: DefAction[][] = [
  [
    { nom: 'ajouter', label: 'Ajouter', aide: 'Créer un enregistrement', Icon: IconAjouter },
    { nom: 'consulter', label: 'Consulter', aide: 'Afficher la fiche sélectionnée', Icon: IconConsulter },
    { nom: 'modifier', label: 'Voir/Modifier', aide: 'Modifier la fiche sélectionnée', Icon: IconModifier },
    { nom: 'supprimer', label: 'Supprimer', aide: 'Supprimer la fiche sélectionnée', Icon: IconSupprimer },
  ],
  [
    { nom: 'rechercher', label: 'Rechercher', aide: 'Rechercher dans la fenêtre', Icon: IconRechercher },
    { nom: 'atteindre', label: 'Atteindre', aide: 'Aller directement à un enregistrement', Icon: IconAtteindre },
  ],
  [
    { nom: 'inverseur', label: 'Inverseur', aide: 'Inverser débit et crédit', Icon: IconInverseur },
    { nom: 'trier', label: 'Trier', aide: 'Changer l’ordre de la liste', Icon: IconTrier },
  ],
];

function BoutonNavigation({
  titre,
  infobulle,
  onClick,
  children,
}: {
  /** Nom accessible · STABLE. Il ne doit pas dépendre de l'état du bouton :
   *  un lecteur d'écran, et tout test qui vise le bouton, le retrouvent par
   *  ce nom · le faire varier revient à renommer le bouton en cours de route. */
  titre: string;
  /** Infobulle, elle libre de se préciser selon le contexte. */
  infobulle?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={infobulle ?? titre}
      aria-label={titre}
      onClick={onClick}
      className="flex items-center justify-center w-[34px] h-[34px] self-center rounded-[9px] text-text-dim transition-[background-color,color,transform] duration-150 hover:bg-chrome-alt hover:text-text active:scale-95"
    >
      {children}
    </button>
  );
}

function BoutonAction({
  def,
  disponible,
  infobulle,
  onClick,
}: {
  def: DefAction;
  disponible: boolean;
  infobulle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={infobulle}
      aria-label={def.label}
      disabled={!disponible}
      onClick={onClick}
      className={`group flex flex-col items-center justify-center gap-1 w-[58px] py-1.5 rounded-[9px] transition-[background-color,color,transform] duration-150 ${
        disponible ? 'text-text hover:bg-chrome-alt active:scale-95' : 'text-text-dim/35 cursor-not-allowed'
      }`}
    >
      <span className={disponible ? 'transition-transform duration-200 group-hover:-translate-y-[1px]' : ''}>
        <def.Icon width={18} height={18} />
      </span>
      <span className="text-[9.5px] leading-none">{def.label}</span>
    </button>
  );
}

export function Toolbar() {
  const navigate = useNavigate();
  const { fermerTout, fenetres, cleActive } = useFenetres();
  const { signatures, lire } = useRegistreActions();
  const [calculetteOuverte, setCalculetteOuverte] = useState(false);

  // La SIGNATURE de la fenêtre active dit quelles actions elle propose. La
  // lire ici (plutôt que les gestionnaires eux-mêmes) suffit à faire basculer
  // les boutons entre actif et grisé au bon moment, sans réabonner la barre à
  // chaque frappe au clavier dans la fenêtre.
  const disponibles = new Set((cleActive ? (signatures[cleActive] ?? '') : '').split('|').filter(Boolean));

  return (
    <div className="relative z-30 flex items-stretch gap-0 px-2 py-1.5 bg-chrome/70 backdrop-blur-md border-b border-border">
      {/* --- Se déplacer : reculer, avancer, revenir à l'accueil ----------- */}
      <div className="flex items-stretch gap-0.5">
        <BoutonNavigation titre="Précédent" onClick={() => navigate(-1)}>
          <svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7">
            <path d="M12.5 4.5L7 10l5.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </BoutonNavigation>
        <BoutonNavigation titre="Suivant" onClick={() => navigate(1)}>
          <svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7">
            <path d="M7.5 4.5L13 10l-5.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </BoutonNavigation>
        <BoutonNavigation
          titre="Accueil"
          infobulle={fenetres.length > 0 ? 'Accueil · referme les fenêtres ouvertes' : 'Accueil'}
          onClick={fermerTout}
        >
          <svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7">
            <path d="M3.2 9.2L10 3.6l6.8 5.6" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M5 8.6V16h10V8.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </BoutonNavigation>
      </div>

      {/* --- Agir sur la fenêtre active ------------------------------------ */}
      {GROUPES_ACTIONS.map((groupe, gi) => (
        <div key={gi} className="flex items-stretch gap-0.5">
          <div className="w-px bg-border mx-1.5 my-1.5" />
          {groupe.map((def) => {
            const disponible = disponibles.has(def.nom);
            return (
              <BoutonAction
                key={def.nom}
                def={def}
                disponible={disponible}
                infobulle={
                  disponible
                    ? (lire(cleActive!, def.nom)?.titre ?? def.label)
                    : `${def.aide} · indisponible dans cette fenêtre`
                }
                // Le gestionnaire est relu À L'INSTANT DU CLIC : celui capturé
                // au rendu fermerait sur un état déjà périmé (la ligne
                // sélectionnée il y a trois clics, par exemple).
                onClick={() => cleActive && lire(cleActive, def.nom)?.executer()}
              />
            );
          })}
        </div>
      ))}

      {/* --- Calculette · toujours disponible -------------------------------
          Elle ne dépend d'aucune fenêtre : c'est un accessoire, comme la
          « Calculette Sage » qui reste active sur toutes les captures. */}
      <div className="flex items-stretch gap-0.5">
        <div className="w-px bg-border mx-1.5 my-1.5" />
        <button
          type="button"
          title="Calculette"
          aria-label="Calculette"
          onClick={() => setCalculetteOuverte(true)}
          className="group flex flex-col items-center justify-center gap-1 w-[58px] py-1.5 rounded-[9px] text-text transition-[background-color,transform] duration-150 hover:bg-chrome-alt active:scale-95"
        >
          <span className="transition-transform duration-200 group-hover:-translate-y-[1px]">
            <IconCalculette width={18} height={18} />
          </span>
          <span className="text-[9.5px] leading-none">Calculette</span>
        </button>
      </div>

      {calculetteOuverte && <Calculette onFermer={() => setCalculetteOuverte(false)} />}
    </div>
  );
}
