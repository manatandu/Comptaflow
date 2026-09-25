import { useEffect, useState } from 'react';
import { LIBELLE_SYSTEME } from '../lib/systemes-syscohada';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useExercice } from '../lib/exercice';
import { AProposModale } from '../components/chrome/AProposModale';
import type { PlanningCloture, RapportControles, Referentiel } from '../lib/types';
import { fenetreDisponible } from '../lib/referentiel-fenetre';
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
 * s'ouvrent par-dessus ; les refermer toutes le redécouvre. C'est exactement
 * le rôle de la page IntuiSage de Sage 100 i7.
 *
 * Il porte DEUX choses, dans cet ordre :
 *
 *   1. OÙ EN EST CE DOSSIER · ce qui réclame une action (jalons en retard,
 *      anomalies de cohérence, écritures encore au brouillard). C'est la
 *      seule question qu'on se pose en ouvrant un logiciel comptable un
 *      matin, et aucun autre écran n'y répond d'un coup d'œil.
 *   2. PAR OÙ COMMENCER · le lanceur, en tuiles groupées par domaine, comme
 *      IntuiSage groupe les siennes en « Gestion quotidienne », « Gestion des
 *      tiers », « Gestion des comptes généraux ».
 *
 * Une grille de raccourcis avait été retirée d'ici, au motif qu'elle
 * répétait la barre d'outils affichée juste au-dessus. Le motif ne tient plus
 * depuis le passage au multi-fenêtres : l'accueil est désormais un FOND,
 * qu'on ne voit que lorsque aucune fenêtre ne le couvre · il n'est donc
 * jamais visible en même temps que le travail en cours, et n'entre plus en
 * concurrence avec rien. C'est précisément la disposition de Sage, dont la
 * barre d'outils porte les actions sur l'enregistrement courant (ajouter,
 * consulter, rechercher) pendant que la page d'accueil, elle, lance les
 * fenêtres. Ce partage-là est le bon, et c'est celui qui est en place ici.
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
    groupe.tuiles.filter((t) => !t.admin || estAdmin).filter((t) => fenetreDisponible(t, referentiel));

  const dateCourte = (iso: string) =>
    new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <div className="p-4 pb-8 max-w-[1320px]">
      {/* --- Bande 1 · identité du dossier --------------------------------- */}
      {/*
        EN-TÊTE À LA MANIÈRE DES PARAMÈTRES DE WINDOWS 11 (2026-09-23) · une
        carte claire, le nom du dossier en grand et une pastille d'accent,
        là où il y avait un bandeau bleu en dégradé.
      */}
      <section className="rounded-[4px] border border-border bg-surface px-5 py-4 mb-5 shadow-plate">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0 flex items-center gap-4">
            <span className="hidden sm:flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[4px] bg-sel text-white">
              <IconFolderOpen width={24} height={24} />
            </span>
            <div className="min-w-0">
              <h1 className="text-[16px] font-semibold leading-tight truncate">{utilisateur?.tenant.nom}</h1>
              <div className="text-[11.5px] text-text-dim mt-0.5">
                {utilisateur?.tenant.referentiel}
                {jeu && ` · ${jeu}`}
              </div>
            </div>
          </div>
          {/*
            `flex-wrap` et non `shrink-0` seul : avec trois boutons (exercice,
            nouveau dossier, console), le groupe mesurait plus que 360 px et,
            refusant de rétrécir, débordait du bandeau. Il se replie
            maintenant sur deux lignes au lieu de sortir de l'écran.
          */}
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            {anneeExercice && (
              <span className="rounded-[4px] bg-sel-soft text-sel px-3 py-1.5 text-[11.5px] font-semibold">
                Exercice {anneeExercice}
              </span>
            )}
            {/* La création de dossiers passe par la console VMG (option A :
                l'auto-inscription est fermée) · le bouton ne s'affiche que
                pour l'opérateur de la plateforme, et y mène. */}
            {utilisateur?.estOperateurPlateforme && (
              <button
                type="button"
                onClick={() => navigate('/plateforme')}
                className="flex items-center gap-1.5 rounded-[4px] border border-border px-3 py-1.5 text-[11.5px] font-semibold"
              >
                <IconFileAdd width={14} height={14} />
                Nouveau dossier
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                seDeconnecter();
                navigate('/connexion');
              }}
              className="flex items-center gap-1.5 rounded-[4px] border border-border px-3 py-1.5 text-[11.5px] font-semibold"
            >
              <IconFolderOpen width={14} height={14} />
              Ouvrir un autre
            </button>
          </div>
        </div>
      </section>

      {/* --- Deux colonnes : le lanceur, et l'état du dossier à droite ------
          Sur un téléphone l'état passe AU-DESSUS · c'est lui qui dit s'il y a
          quelque chose à faire, il ne doit pas finir sous cinq cartes. */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px] items-start">
        {/* La CINQUIÈME carte, seule sur sa rangée à gauche, laissait un trou ·
            sur grand écran elle passe sous la colonne d'état. Sur téléphone
            et tablette elle reste à la suite des autres, la colonne d'état
            remontant en tête. Rendue deux fois, une seule est visible. */}
        <div className="grid gap-4 md:grid-cols-2 items-start">
          {GROUPES.map((groupe, rang) => {
            const tuiles = tuilesVisibles(groupe);
            if (tuiles.length === 0) return null;
            const derniere = rang === GROUPES.length - 1;
            return (
              <div key={groupe.titre} className={derniere ? 'lg:hidden' : undefined}>
                <CarteGroupe groupe={groupe} tuiles={tuiles} rang={rang} navigate={navigate} />
              </div>
            );
          })}
        </div>

        <aside className="order-first lg:order-none flex flex-col gap-3">
          <section className="rounded-[4px] border border-border bg-surface shadow-plate overflow-hidden">
            <div className="px-4 pt-3.5 pb-2 text-[13px] font-semibold">Où en est ce dossier</div>
            {chargement ? (
              <div className="px-4 pb-4 flex flex-col gap-2">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="squelette h-[44px] rounded-[4px]" />
                ))}
              </div>
            ) : (
              <div>
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
                  valeur={
                    enRetard.length === 0
                      ? 'Aucun jalon en retard'
                      : `${enRetard.length} en retard · ${enRetard[0].libelle}`
                  }
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
              </div>
            )}
          </section>

          {tuilesVisibles(GROUPES[GROUPES.length - 1]).length > 0 && (
            <div className="hidden lg:block">
              <CarteGroupe
                groupe={GROUPES[GROUPES.length - 1]}
                tuiles={tuilesVisibles(GROUPES[GROUPES.length - 1])}
                rang={GROUPES.length - 1}
                navigate={navigate}
              />
            </div>
          )}

          <button
            type="button"
            onClick={() => setAProposOuvert(true)}
            className="self-end flex items-center gap-1.5 text-[11.5px] text-text-dim hover:text-text"
          >
            <IconInfo width={13} height={13} />
            À propos d’OmegaX
          </button>
        </aside>
      </div>

      {aProposOuvert && <AProposModale onFermer={() => setAProposOuvert(false)} />}
    </div>
  );
}

/** Flèche des lignes cliquables, comme dans les Paramètres de Windows 11. */
function Chevron() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden className="shrink-0 text-text-dim">
      <path d="M6 3.5 10.5 8 6 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Carte de domaine · un en-tête (pastille, titre) puis une ligne
 * par fenêtre. Remplace les tuiles isolées (2026-09-23) : des lignes de même
 * hauteur dans des cartes de même largeur ne laissent aucun trou, quel que
 * soit le nombre de fenêtres du groupe.
 */
function CarteGroupe({
  groupe,
  tuiles,
  rang,
  navigate,
}: {
  groupe: GroupeDef;
  tuiles: TuileDef[];
  rang: number;
  navigate: (c: string) => void;
}) {
  return (
    <section
      style={{ animationDelay: `${rang * 40}ms` }}
      className="anim-cascade rounded-[4px] border border-border bg-surface shadow-plate overflow-hidden"
    >
      <div className="flex items-center gap-3 px-4 pt-3.5 pb-3">
        <span className="flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-[4px] bg-sel text-white">
          <groupe.Icon width={18} height={18} />
        </span>
        <h2 className="min-w-0 text-[13px] font-semibold leading-tight">{groupe.titre}</h2>
      </div>
      <ul>
        {tuiles.map((t) => (
          <li key={t.chemin} className="border-t border-border">
            <button
              type="button"
              onClick={() => navigate(t.chemin)}
              className="group w-full flex items-center gap-3 px-4 h-[40px] text-left transition-colors duration-150 hover:bg-surface-alt active:bg-chrome"
            >
              <t.Icon width={16} height={16} className="shrink-0 text-sel" />
              <span className="flex-1 min-w-0 truncate text-[12px] text-text">{t.label}</span>
              <Chevron />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Ligne d'état · une phrase, une couleur, une destination. Le vert dit
 * « rien à faire ici », l'ambre « regardez ». Pas de rouge : rien sur cet
 * écran n'est une erreur du logiciel, seulement du travail en attente.
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
    <button
      type="button"
      onClick={() => navigate(chemin)}
      className="w-full flex items-start gap-3 border-t border-border px-4 py-2.5 text-left transition-colors duration-150 hover:bg-surface-alt"
    >
      <span className={`mt-[5px] h-2 w-2 shrink-0 rounded-full ${bon ? 'bg-positive' : 'bg-warning'}`} aria-hidden />
      <span className="flex-1 min-w-0">
        <span className="block text-[11.5px] text-text-dim">{titre}</span>
        <span className={`block text-[12px] font-medium leading-snug ${bon ? 'text-text' : 'text-warning'}`}>{valeur}</span>
      </span>
      <span className="mt-[3px]">
        <Chevron />
      </span>
    </button>
  );
}
