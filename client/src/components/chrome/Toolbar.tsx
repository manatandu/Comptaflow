import { useLocation, useNavigate } from 'react-router-dom';
import {
  IconBalance,
  IconComptes,
  IconDashboard,
  IconEtats,
  IconGrille,
  IconJournal,
  IconUsers,
} from './icons';

interface OutilDef {
  label: string;
  titre: string; // infobulle
  Icon: (p: { width?: number; height?: number }) => JSX.Element;
  chemin: string;
}

/**
 * Barre d'outils FIXE, identique sur tous les écrans · la « barre d'outils
 * Comptabilité générale » de Sage 100 i7 : mêmes boutons partout, l'outil
 * actif est enfoncé. Les actions propres à chaque fenêtre (imprimer, filtrer,
 * enregistrer…) vivent DANS la fenêtre, en ses propres boutons · jamais ici.
 */
/**
 * Sept outils, pas plus : l'essentiel du quotidien. Le reste (grand livre,
 * balance âgée, rapprochement, immobilisations, TVA, documents…) vit dans
 * les menus · une barre d'outils surchargée cesse d'être un raccourci.
 */
const OUTILS: OutilDef[][] = [
  [{ label: 'Saisie', titre: 'Saisie des journaux', Icon: IconGrille, chemin: '/saisie' }],
  [
    { label: 'Journal', titre: 'Journal · consultation', Icon: IconJournal, chemin: '/journal?onglet=journal' },
    { label: 'Balance', titre: 'Balance des comptes', Icon: IconBalance, chemin: '/journal?onglet=balance' },
  ],
  [
    { label: 'Plan comptable', titre: 'Plan comptable général', Icon: IconComptes, chemin: '/comptes' },
    { label: 'Tiers', titre: 'Plan des tiers', Icon: IconUsers, chemin: '/tiers' },
  ],
  [
    { label: 'États', titre: 'États financiers', Icon: IconEtats, chemin: '/etats-financiers' },
    { label: 'Tabl. bord', titre: 'Tableau de bord', Icon: IconDashboard, chemin: '/tableau-de-bord' },
  ],
];

export function Toolbar() {
  const navigate = useNavigate();
  const location = useLocation();

  // L'outil actif est celui dont le chemin ET la query correspondent · les
  // trois états de /journal (?onglet=…) sont trois outils distincts.
  const estActif = (chemin: string) => {
    const [pathOutil, queryOutil] = chemin.split('?');
    if (location.pathname !== pathOutil) return false;
    if (!queryOutil) return true;
    // Sans ?onglet= dans l'URL, /journal affiche l'onglet Journal (défaut).
    const ongletCourant = new URLSearchParams(location.search).get('onglet') ?? 'journal';
    return ongletCourant === new URLSearchParams(queryOutil).get('onglet');
  };

  return (
    <div className="flex items-stretch gap-0 px-2 py-1.5 bg-chrome/70 backdrop-blur-md border-b border-border">
      {OUTILS.map((groupe, gi) => (
        <div key={gi} className="flex items-stretch gap-0.5">
          {gi > 0 && <div className="w-px bg-border mx-1.5 my-1.5" />}
          {groupe.map((o) => {
            const actif = estActif(o.chemin);
            return (
              /*
                L'outil actif n'est plus « enfoncé » par une ombre interne,
                effet daté et illisible sur un écran mat : il porte une
                pastille bleue franche. On voit où l'on est d'un coup d'œil,
                de loin, ce qui est le seul rôle de cette barre.
              */
              <button
                key={o.chemin}
                type="button"
                title={o.titre}
                onClick={() => navigate(o.chemin)}
                className={`group relative flex flex-col items-center justify-center gap-1 w-[64px] py-1.5 rounded-[9px] transition-[background-color,color,transform] duration-150 ${
                  actif
                    ? 'bg-sel text-white shadow-[0_2px_8px_-2px_color-mix(in_srgb,var(--sel)_55%,transparent)]'
                    : 'text-text-dim hover:bg-chrome-alt hover:text-text'
                }`}
              >
                <span className={`transition-transform duration-200 ${actif ? '' : 'group-hover:-translate-y-[1px]'}`}>
                  <o.Icon width={18} height={18} />
                </span>
                <span className={`text-[9.5px] leading-none ${actif ? 'font-semibold' : ''}`}>{o.label}</span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
