import { ReactNode, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { IconLogo } from './icons';
import { MenuBar, type MenuDef } from './MenuBar';
import { AProposModale } from './AProposModale';

export interface RibbonGroupe {
  titre: string;
  boutons: Array<{ label: string; Icon: (p: { width?: number; height?: number }) => JSX.Element; onClick?: () => void; disabled?: boolean }>;
}

export function Ribbon({ groupes, droite }: { groupes: RibbonGroupe[]; droite?: ReactNode }) {
  const { utilisateur, estAdmin, seDeconnecter } = useAuth();
  const navigate = useNavigate();
  const [aProposOuvert, setAProposOuvert] = useState(false);

  // Contenu réel de chaque menu, inspiré de la structure Sage 100 i7
  // (Structure = paramétrage, Traitement = actions du quotidien, plutôt
  // que tout mélanger sous un seul menu "Comptabilité"). Un item pas encore
  // construit reste visible mais désactivé, avec l'indication "à venir" —
  // même logique que les tuiles verrouillées de l'écran Accueil : on montre
  // ce qui manque, on ne le cache pas. Un menu entièrement vide (Édition,
  // Trésorerie, Tiers, Fenêtre) affiche "Pas encore disponible" (MenuBar).
  const menus: MenuDef[] = [
    {
      titre: 'Fichier',
      items: [
        { label: 'Nouveau fichier comptable', onClick: () => navigate('/') },
        { label: 'Ouvrir un dossier existant', disabled: true, indication: 'à venir' },
        { label: 'Déconnexion', onClick: seDeconnecter },
      ],
    },
    { titre: 'Édition', items: [] },
    {
      titre: 'Affichage',
      items: [
        { label: 'Accueil', onClick: () => navigate('/') },
        { label: 'Tableau de bord', onClick: () => navigate('/tableau-de-bord') },
      ],
    },
    {
      titre: 'Structure',
      items: [
        { label: 'Plan de comptes', onClick: () => navigate('/comptes') },
        { label: 'Codes journaux', onClick: () => navigate('/journaux') },
        { label: 'Taux de taxes', onClick: () => navigate('/taux-tva') },
        { label: 'Plan des tiers', onClick: () => navigate('/tiers') },
        { label: 'Immobilisations', onClick: () => navigate('/immobilisations') },
      ],
    },
    {
      titre: 'Traitement',
      items: [
        { label: 'Saisir une opération', onClick: () => navigate('/saisie') },
        { label: 'Journal & grand livre', onClick: () => navigate('/journal') },
        // Le lettrage se fait par compte (bouton "Lettrer" du Plan de
        // comptes, comme l'interrogation de compte chez Sage) — ce menu
        // amène directement à la sélection du compte.
        { label: 'Lettrage', onClick: () => navigate('/comptes') },
        { label: 'Rapprochement bancaire', onClick: () => navigate('/rapprochement') },
        { label: "Clôture d'exercice", onClick: () => navigate('/exercice') },
      ],
    },
    { titre: 'Trésorerie', items: [{ label: 'Rapprochement bancaire', onClick: () => navigate('/rapprochement') }] },
    { titre: 'Tiers', items: [{ label: 'Plan des tiers', onClick: () => navigate('/tiers') }] },
    {
      titre: 'États',
      items: [
        { label: 'États financiers', onClick: () => navigate('/etats-financiers') },
        { label: 'Déclaration TVA', onClick: () => navigate('/declaration-tva') },
        { label: 'Balance âgée', disabled: true, indication: 'à venir' },
      ],
    },
    {
      titre: 'Outils',
      items: estAdmin ? [{ label: 'Utilisateurs', onClick: () => navigate('/utilisateurs') }] : [],
    },
    { titre: 'Fenêtre', items: [] },
    {
      titre: '?',
      items: [{ label: 'À propos de Compta Flow', onClick: () => setAProposOuvert(true) }],
    },
  ];

  return (
    <div className="border-b border-border-dark bg-chrome">
      <div
        className="h-[26px] flex items-center justify-between px-2 text-white text-[11.5px]"
        style={{ background: 'linear-gradient(180deg, var(--titlebar-from), var(--titlebar-to))' }}
      >
        <div className="flex items-center gap-2">
          <IconLogo width={14} height={14} />
          <span>Compta Flow — {utilisateur?.tenant.nom}</span>
        </div>
        <button onClick={seDeconnecter} className="text-white/85 hover:text-white text-[11px] px-2 py-0.5">
          Déconnexion
        </button>
      </div>

      <MenuBar menus={menus} />
      {aProposOuvert && <AProposModale onFermer={() => setAProposOuvert(false)} />}

      <div className="flex items-stretch justify-between">
        <div className="flex items-stretch px-2 py-1">
          {groupes.map((g) => (
            <div key={g.titre} className="flex flex-col items-center px-2.5 border-r border-border">
              <div className="flex-1 flex items-center gap-2">
                {g.boutons.map((b) => (
                  <button
                    key={b.label}
                    onClick={b.onClick}
                    disabled={b.disabled}
                    className="flex flex-col items-center gap-0.5 px-1 py-0.5 w-[52px] disabled:opacity-40"
                  >
                    <b.Icon width={20} height={20} />
                    <span className="text-[9.5px] text-text-dim text-center leading-tight">{b.label}</span>
                  </button>
                ))}
              </div>
              <div className="text-[9px] text-text-dim mt-0.5">{g.titre}</div>
            </div>
          ))}
        </div>
        {droite && <div className="flex items-center px-3">{droite}</div>}
      </div>
    </div>
  );
}
