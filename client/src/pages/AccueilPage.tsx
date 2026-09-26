import { useEffect, useState } from 'react';
import { LIBELLE_SYSTEME } from '../lib/systemes-syscohada';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useExercice } from '../lib/exercice';
import { AProposModale } from '../components/chrome/AProposModale';
import type { PlanningCloture, RapportControles, Referentiel } from '../lib/types';
import { fenetreDisponible } from '../lib/referentiel-fenetre';
import { cheminAuMenu } from '../lib/profil-dossier';
import {
  IconBalance,
  IconBanque,
  IconBook,
  IconCheck,
  IconComptes,
  IconDashboard,
  IconEtats,
  IconFileAdd,
  IconFolderOpen,
  IconGrille,
  IconImmo,
  IconInfo,
  IconJournal,
  IconPrint,
  IconRefresh,
  IconSearch,
  IconUsers,
} from '../components/chrome/icons';
import type { SVGProps } from 'react';

/**
 * ACCUEIL · le FOND de l'espace de travail, jamais une fenêtre. Les fenêtres
 * s'ouvrent par-dessus ; les refermer toutes le redécouvre.
 *
 * LE MODÈLE EST CELUI DE SAGE 100 i7, lu dans ses manuels et non imaginé
 * (manuel « Ergonomie et fonctions communes i7 », Sage 100 Immobilisations ;
 * cours « Fenêtre d'application Comptabilité », Sage Compta i7 v8), à la
 * demande de Manasse du 2026-09-25. Deux éléments, pas un de plus :
 *
 *   1. LA BARRE VERTICALE, à gauche · « les fonctions sont regroupées au sein
 *      de groupes de fonctions thématiques. Pour afficher un groupe de
 *      fonctions différent, cliquez sur son intitulé ». Un seul groupe ouvert
 *      à la fois, comme chez Sage.
 *   2. L'INTUISAGE, « interface d'accueil et d'accompagnement », à onglets ·
 *      Accueil (le dossier ouvert et l'accès aux autres), Favoris (« accès
 *      rapide et intuitif aux fonctions que vous utilisez le plus souvent »),
 *      Indicateurs (« quelques indicateurs clés pour suivre et piloter son
 *      activité »). L'onglet Sage Connect (vidéos, réseaux) n'a pas
 *      d'équivalent et n'est pas repris.
 *
 * Les grandes cartes à icônes de la version précédente n'existaient chez
 * aucun logiciel de référence · elles sont retirées.
 */

const JEUX: Record<string, string> = {
  ASSOCIATIONS_ORDRES_PROFESSIONNELS: 'Associations et ordres professionnels',
  PROJETS_DEVELOPPEMENT: 'Projets de développement',
  SYSTEME_MINIMAL_TRESORERIE: 'Système minimal de trésorerie',
};

interface TuileDef {
  label: string;
  chemin: string;
  Icon: (p: SVGProps<SVGSVGElement>) => JSX.Element;
  /** Réservée aux administrateurs du dossier. */
  admin?: boolean;
  /** Propre à un référentiel · voir DefinitionFenetre dans registre-fenetres.tsx. */
  referentielsApplicables?: Referentiel[];
}

interface GroupeDef {
  titre: string;
  Icon: (p: SVGProps<SVGSVGElement>) => JSX.Element;
  tuiles: TuileDef[];
}

/**
 * Les groupes suivent la journée d'un comptable, pas l'ordre des menus :
 * on saisit, on suit ses tiers, on tient ses comptes, on clôture. Le dernier
 * groupe rassemble ce qui n'existe QUE chez une entité à but non lucratif
 * (registre des donateurs, bailleurs, budgets par projet) · le mettre à part
 * évite de le noyer parmi les fenêtres classiques, alors que c'est là que se
 * joue la conformité SYCEBNL.
 *
 * UNE CARTE PAR DOMAINE, façon page d'accueil des Paramètres de Windows 11
 * (2026-09-23) · Manasse trouvait la grille de tuiles « désordonnée » : cinq
 * bandes de longueurs inégales (3, 8, 4, 5 et 4 tuiles), qui laissaient des
 * trous à droite, cinq loupes identiques, et une bande « tiers » qui portait
 * le rapprochement bancaire et les immobilisations. Les groupes sont donc
 * refaits pour être HOMOGÈNES et de taille voisine, et chaque fenêtre est
 * une LIGNE d'une carte, pas une tuile de plus.
 *
 * Ce n'est toujours pas le catalogue : ni ce que la colonne d'état ouvre
 * déjà (Brouillard, Analyse et contrôles), ni ce qu'on ne visite qu'à
 * l'installation (Codes journaux, Plans analytiques, Documents obligatoires,
 * Échéancier) · les menus restent la carte complète.
 */
const GROUPES: GroupeDef[] = [
  {
    titre: 'Saisie et consultation',
    Icon: IconGrille,
    tuiles: [
      { label: 'Saisie des journaux', chemin: '/saisie', Icon: IconGrille },
      { label: 'Journal', chemin: '/journal?onglet=journal', Icon: IconJournal },
      { label: 'Balance des comptes', chemin: '/journal?onglet=balance', Icon: IconBalance },
      { label: 'Grand livre', chemin: '/journal?onglet=grand-livre', Icon: IconBook },
      { label: 'Rapprochement bancaire', chemin: '/rapprochement', Icon: IconBanque },
    ],
  },
  {
    titre: 'Tiers',
    Icon: IconUsers,
    tuiles: [
      { label: 'Plan des tiers', chemin: '/tiers', Icon: IconUsers },
      { label: 'Balance âgée', chemin: '/balance-agee', Icon: IconBalance },
      { label: 'Balance auxiliaire', chemin: '/balance-auxiliaire', Icon: IconBalance },
      { label: 'Justificatif de solde', chemin: '/justificatif-solde', Icon: IconSearch },
      { label: 'Rappel et relevé', chemin: '/relances', Icon: IconPrint },
    ],
  },
  {
    titre: 'Comptes et immobilisations',
    Icon: IconComptes,
    tuiles: [
      { label: 'Plan comptable', chemin: '/comptes', Icon: IconComptes },
      { label: 'Évolution des soldes', chemin: '/evolution-soldes', Icon: IconSearch },
      { label: 'Immobilisations', chemin: '/immobilisations', Icon: IconImmo },
      { label: 'Tableaux des immobilisations', chemin: '/tableaux-immobilisations', Icon: IconImmo },
      { label: 'Régularisations', chemin: '/regularisations', Icon: IconRefresh },
    ],
  },
  {
    titre: 'Clôture et états financiers',
    Icon: IconEtats,
    tuiles: [
      { label: 'États financiers', chemin: '/etats-financiers', Icon: IconEtats },
      { label: 'Notes annexes', chemin: '/notes-annexes', Icon: IconBook },
      { label: "Fin d'exercice", chemin: '/exercice', Icon: IconCheck },
      { label: 'Tableau de bord', chemin: '/tableau-de-bord', Icon: IconDashboard },
      // Le journal dit qui a fait quoi · il expose l'activité de chaque
      // collaborateur, d'où la réserve à l'administrateur du dossier. La
      // route serveur porte la même (@Roles ADMIN_CABINET) · masquer sans
      // refuser laisserait la route ouverte à un appel direct.
      { label: "Journal d'audit", chemin: '/journal-audit', Icon: IconCheck, admin: true },
    ],
  },
  {
    // Les lignes propres au SYCEBNL portent leur restriction, les deux autres
    // valent pour tout référentiel · un dossier SYSCOHADA voit donc une carte
    // à deux lignes, jamais une carte vide sous un titre qui ne le concerne pas.
    titre: 'Analytique et obligations',
    Icon: IconDashboard,
    tuiles: [
      { label: 'Registre des donateurs', chemin: '/registre-donateurs', Icon: IconBook, referentielsApplicables: ['SYCEBNL'] },
      { label: 'Bailleurs de fonds', chemin: '/bailleurs', Icon: IconUsers, referentielsApplicables: ['SYCEBNL'] },
      { label: 'États analytiques', chemin: '/etats-analytiques', Icon: IconDashboard },
      { label: 'Retenues et fiscal', chemin: '/retenues', Icon: IconPrint },
    ],
  },
];

export function AccueilPage() {
  const navigate = useNavigate();
  const { utilisateur, estAdmin, seDeconnecter } = useAuth();
  const referentiel = utilisateur?.tenant.referentiel;
  const { exerciceCourant } = useExercice();
  const [aProposOuvert, setAProposOuvert] = useState(false);
  const tenantId = utilisateur?.tenant.id ?? '';
  const [onglet, setOnglet] = useState<Onglet>(() => lireOnglet());
  const [groupeOuvert, setGroupeOuvert] = useState<string>(GROUPES[0].titre);
  const [favoris, setFavoris] = useState<string[]>([]);
  useEffect(() => setFavoris(lireFavoris(tenantId)), [tenantId]);
  const choisirOnglet = (o: Onglet) => {
    setOnglet(o);
    ecrire(CLE_ONGLET, o);
  };
  const basculerFavori = (chemin: string) => {
    const suivants = favoris.includes(chemin) ? favoris.filter((c) => c !== chemin) : [...favoris, chemin];
    setFavoris(suivants);
    ecrire(cleFavoris(tenantId), JSON.stringify(suivants));
  };
  const [planning, setPlanning] = useState<PlanningCloture | null>(null);
  const [controles, setControles] = useState<RapportControles | null>(null);
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    if (!exerciceCourant) return;
    let vivant = true;
    setChargement(true);
    // Les deux appels sont indépendants et tolérants : l'accueil ne doit
    // jamais afficher une erreur. Une carte qui n'a pas pu être calculée le
    // dit, les autres restent. Le détail se voit sur les fenêtres qui sont
    // faites pour ça (Fin d'exercice, Analyse et contrôles).
    Promise.allSettled([
      api.get<PlanningCloture>(`/exercices/${exerciceCourant.id}/planning-cloture`),
      api.get<RapportControles>(`/controles?exerciceId=${exerciceCourant.id}`),
    ])
      .then(([p, c]) => {
        if (!vivant) return;
        setPlanning(p.status === 'fulfilled' ? p.value : null);
        setControles(c.status === 'fulfilled' ? c.value : null);
      })
      .finally(() => vivant && setChargement(false));
    return () => {
      vivant = false;
    };
  }, [exerciceCourant]);

  /*
    Chaînage optionnel jusqu'au BOUT (`jalons?.filter`), et pas seulement sur
    `planning` : depuis que l'accueil est le FOND de l'espace de travail, il
    est monté en permanence · une exception ici n'emporte plus une page, elle
    emporte le logiciel entier, fenêtres ouvertes comprises. Une réponse
    inattendue du serveur (champ absent, forme changée) doit donc dégrader
    l'accueil, jamais l'abattre.
  */
  const enRetard = planning?.jalons?.filter((j) => j.enRetard) ?? [];
  const aujourdHui = Date.now();
  const prochain =
    planning?.jalons?.find((j) => !j.enRetard && new Date(j.echeance).getTime() >= aujourdHui) ?? null;
  const brouillard = planning?.jalons?.find((j) => j.libelle === 'Balance de vérification')?.observation ?? null;

  // Les anomalies bloquantes passent avant tout : une écriture déséquilibrée
  // ou une caisse créditrice empêchent d'arrêter les comptes, pas seulement
  // de bien les tenir.
  const bloquants = controles?.totaux?.bloquants ?? 0;
  const avertissements = controles?.totaux?.avertissements ?? 0;
  const pireAnomalie = controles?.anomalies?.find((a) => a.gravite !== 'INFORMATION') ?? null;

  // Un dossier SYSCOHADA n'a pas de jeu d'états SYCEBNL : il a un système
  // comptable (AUDCIF art. 11). La bande affichait « Associations et ordres
  // professionnels » à une SARL, valeur par défaut du schéma jamais lue.
  const jeu = !utilisateur
    ? null
    : utilisateur.tenant.referentiel === 'SYSCOHADA'
      ? utilisateur.tenant.systemeComptableSyscohada
        ? LIBELLE_SYSTEME[utilisateur.tenant.systemeComptableSyscohada]
        : null
      : utilisateur.tenant.jeuEtatsFinanciersSycebnl
        ? JEUX[utilisateur.tenant.jeuEtatsFinanciersSycebnl]
        : null;
  const anneeExercice = exerciceCourant ? new Date(exerciceCourant.dateDebut).getFullYear() : null;

  const tuilesVisibles = (groupe: GroupeDef) =>
    groupe.tuiles
      .filter((t) => !t.admin || estAdmin)
      .filter((t) => fenetreDisponible(t, referentiel))
      // Même filtre de profil que la barre de menus (lib/profil-dossier.ts).
      .filter((t) => cheminAuMenu(t.chemin, utilisateur?.tenant));

  const dateCourte = (iso: string) =>
    new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });

  const toutesTuiles = GROUPES.flatMap((g) => tuilesVisibles(g));
  const tuilesFavorites = favoris.map((c) => toutesTuiles.find((t) => t.chemin === c)).filter((t): t is TuileDef => !!t);

  return (
    <div className="flex flex-col md:flex-row h-full min-h-0">
      {/* --- Barre verticale · groupes de fonctions, un seul ouvert ------- */}
      <nav
        aria-label="Barre verticale"
        className="md:w-[236px] shrink-0 border-b md:border-b-0 md:border-r border-[var(--bandeau)] bg-[var(--bandeau)] text-white flex flex-col min-h-0 overflow-y-auto"
      >
        {GROUPES.map((groupe) => {
          const tuiles = tuilesVisibles(groupe);
          if (tuiles.length === 0) return null;
          const ouvert = groupeOuvert === groupe.titre;
          return (
            <div key={groupe.titre} className="border-b border-white/10">
              <button
                type="button"
                aria-expanded={ouvert}
                onClick={() => setGroupeOuvert(groupe.titre)}
                className={`w-full flex items-center gap-2 px-2.5 h-[26px] text-left text-[11.5px] font-semibold border-l-[3px] ${
                  ouvert ? 'bg-[var(--bandeau-survol)] border-l-[var(--a-400)] text-white' : 'border-l-transparent text-white/85 hover:bg-white/10'
                }`}
              >
                <groupe.Icon width={14} height={14} className="shrink-0 text-[var(--a-200)]" />
                <span className="truncate">{groupe.titre}</span>
              </button>
              {ouvert && (
                <ul className="bg-[var(--bandeau-survol)] pb-1">
                  {tuiles.map((t) => (
                    <li key={t.chemin} className="group flex items-center">
                      <button
                        type="button"
                        onClick={() => navigate(t.chemin)}
                        className="flex-1 min-w-0 flex items-center gap-2 pl-3 pr-1 h-[24px] text-left text-[11.5px] text-white/85 hover:bg-white/10 hover:text-white"
                      >
                        <t.Icon width={13} height={13} className="shrink-0 text-[var(--a-200)]" />
                        <span className="truncate">{t.label}</span>
                      </button>
                      <BoutonFavori actif={favoris.includes(t.chemin)} onClick={() => basculerFavori(t.chemin)} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </nav>

      {/* --- IntuiSage · trois onglets ---------------------------------- */}
      <div className="flex-1 min-w-0 min-h-0 overflow-auto p-3">
        <div className="max-w-[760px] rounded-[8px] border border-border bg-surface shadow-posee overflow-hidden">
          <div role="tablist" className="flex gap-1 px-2 border-b border-border">
            {ONGLETS.map((o) => (
              <button
                key={o}
                type="button"
                role="tab"
                aria-selected={onglet === o}
                onClick={() => choisirOnglet(o)}
                className={`px-3 h-[32px] text-[12px] -mb-px border-b-2 ${
                  onglet === o ? 'border-b-sel text-sel font-semibold' : 'border-b-transparent text-text-dim hover:text-text'
                }`}
              >
                {o}
              </button>
            ))}
          </div>

          {onglet === 'Accueil' && (
            <div className="p-3">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-[11.5px]">
                <dt className="text-text-dim">Dossier</dt>
                <dd className="font-semibold">{utilisateur?.tenant.nom}</dd>
                <dt className="text-text-dim">Référentiel</dt>
                <dd>
                  {utilisateur?.tenant.referentiel}
                  {jeu && ` · ${jeu}`}
                </dd>
                <dt className="text-text-dim">Exercice</dt>
                <dd>{anneeExercice ?? 'Aucun'}</dd>
                <dt className="text-text-dim">Utilisateur</dt>
                <dd>{utilisateur?.email}</dd>
              </dl>
              <div className="flex flex-wrap gap-2 mt-3">
                <button
                  type="button"
                  onClick={() => {
                    seDeconnecter();
                    navigate('/connexion');
                  }}
                  className="flex items-center gap-1.5 border border-border-dark px-2.5 py-[3px] text-[11.5px]"
                >
                  <IconFolderOpen width={13} height={13} />
                  Ouvrir un autre dossier
                </button>
                {/* La création de dossiers passe par la console VMG (option A :
                    l'auto-inscription est fermée) · le bouton ne s'affiche que
                    pour l'opérateur de la plateforme, et y mène. */}
                {utilisateur?.estOperateurPlateforme && (
                  <button
                    type="button"
                    onClick={() => navigate('/plateforme')}
                    className="flex items-center gap-1.5 border border-border-dark px-2.5 py-[3px] text-[11.5px]"
                  >
                    <IconFileAdd width={13} height={13} />
                    Nouveau dossier
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setAProposOuvert(true)}
                  className="flex items-center gap-1.5 border border-border-dark px-2.5 py-[3px] text-[11.5px]"
                >
                  <IconInfo width={13} height={13} />
                  À propos d’OmegaX
                </button>
              </div>
            </div>
          )}

          {onglet === 'Favoris' && (
            <div className="p-1">
              {tuilesFavorites.length === 0 ? (
                <p className="p-2 text-[11.5px] text-text-dim">
                  Aucun favori · cliquez sur l’étoile d’une fonction de la barre verticale.
                </p>
              ) : (
                <ul>
                  {tuilesFavorites.map((t) => (
                    <li key={t.chemin} className="group flex items-center">
                      <button
                        type="button"
                        onClick={() => navigate(t.chemin)}
                        className="flex-1 min-w-0 flex items-center gap-2 px-2 h-[24px] text-left text-[11.5px] hover:bg-sel-soft"
                      >
                        <t.Icon width={13} height={13} className="shrink-0 text-[var(--a-200)]" />
                        <span className="truncate">{t.label}</span>
                      </button>
                      <BoutonFavori actif onClick={() => basculerFavori(t.chemin)} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {onglet === 'Indicateurs' && (
            <div>
              {chargement ? (
                <p className="p-3 text-[11.5px] text-text-dim">Chargement…</p>
              ) : (
                <table className="w-full text-[11.5px]">
                  <tbody>
                    <LigneEtat
                      titre="Écritures au brouillard"
                      valeur={brouillard ? brouillard.libelle : 'Non déterminé'}
                      bon={brouillard?.satisfait ?? true}
                      chemin="/brouillard"
                      navigate={navigate}
                    />
                    <LigneEtat
                      titre="Contrôles de cohérence"
                      valeur={
                        !controles
                          ? 'Non calculés'
                          : bloquants + avertissements === 0
                            ? 'Aucune anomalie à traiter'
                            : `${bloquants > 0 ? `${bloquants} bloquante(s)` : `${avertissements} à vérifier`} · ${
                                pireAnomalie?.libelle ?? ''
                              }`
                      }
                      bon={!!controles && bloquants + avertissements === 0}
                      chemin="/controles"
                      navigate={navigate}
                    />
                    <LigneEtat
                      titre="Jalons de clôture en retard"
                      valeur={enRetard.length === 0 ? 'Aucun jalon en retard' : `${enRetard.length} en retard · ${enRetard[0].libelle}`}
                      bon={enRetard.length === 0}
                      chemin="/exercice"
                      navigate={navigate}
                    />
                    <LigneEtat
                      titre="Prochaine échéance"
                      valeur={prochain ? `${dateCourte(prochain.echeance)} · ${prochain.libelle}` : 'Rien à venir'}
                      bon
                      chemin="/exercice"
                      navigate={navigate}
                    />
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>

      {aProposOuvert && <AProposModale onFermer={() => setAProposOuvert(false)} />}
    </div>
  );
}

type Onglet = 'Accueil' | 'Favoris' | 'Indicateurs';
const ONGLETS: Onglet[] = ['Accueil', 'Favoris', 'Indicateurs'];
const CLE_ONGLET = 'omegax.accueil.onglet';
const cleFavoris = (tenantId: string) => `omegax.favoris.${tenantId}`;

/*
  Préférences d'affichage, jamais des données du dossier · mémorisées dans le
  navigateur. `localStorage` jette en fenêtre privée : la préférence est un
  confort, jamais une condition d'usage, d'où les try/catch.
*/
function ecrire(cle: string, valeur: string) {
  try {
    localStorage.setItem(cle, valeur);
  } catch {
    /* préférence perdue, rien d'autre */
  }
}
function lireOnglet(): Onglet {
  try {
    const v = localStorage.getItem(CLE_ONGLET);
    return ONGLETS.includes(v as Onglet) ? (v as Onglet) : 'Accueil';
  } catch {
    return 'Accueil';
  }
}
function lireFavoris(tenantId: string): string[] {
  if (!tenantId) return [];
  try {
    const v = JSON.parse(localStorage.getItem(cleFavoris(tenantId)) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function BoutonFavori({ actif, onClick }: { actif: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={actif ? 'Retirer des favoris' : 'Ajouter aux favoris'}
      aria-pressed={actif}
      className={`shrink-0 w-[22px] h-[22px] flex items-center justify-center ${
        actif ? 'text-[#c98a00]' : 'text-white/60 opacity-0 group-hover:opacity-100 focus:opacity-100'
      }`}
    >
      <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden>
        <path
          d="M8 1.5 10 5.8l4.6.5-3.4 3.1.9 4.6L8 11.7 3.9 14l.9-4.6L1.4 6.3 6 5.8Z"
          fill={actif ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

/**
 * Ligne d'indicateur · une ligne de grille, une couleur, une destination. Le
 * vert dit « rien à faire ici », l'ambre « regardez ». Pas de rouge : rien
 * ici n'est une erreur du logiciel, seulement du travail en attente.
 */
function LigneEtat({
  titre,
  valeur,
  bon,
  chemin,
  navigate,
}: {
  titre: string;
  valeur: string;
  bon: boolean;
  chemin: string;
  navigate: (c: string) => void;
}) {
  return (
    <tr onClick={() => navigate(chemin)} className="cursor-pointer hover:bg-sel-soft">
      <td className="px-2 py-1 w-[14px]">
        <span className={`block h-2 w-2 rounded-full ${bon ? 'bg-positive' : 'bg-warning'}`} aria-hidden />
      </td>
      <td className="px-2 py-1 text-text-dim whitespace-nowrap">{titre}</td>
      <td className={`px-2 py-1 ${bon ? 'text-text' : 'text-warning font-semibold'}`}>{valeur}</td>
    </tr>
  );
}
