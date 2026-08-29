import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useExercice } from '../lib/exercice';
import { NouveauFichierWizard } from '../components/NouveauFichierWizard';
import { AProposModale } from '../components/chrome/AProposModale';
import type { PlanningCloture, RapportControles } from '../lib/types';
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
  IconLock,
  IconNews,
  IconPrint,
  IconRefresh,
  IconSaisie,
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
}

interface GroupeDef {
  titre: string;
  tuiles: TuileDef[];
}

/**
 * Les groupes suivent la journée d'un comptable, pas l'ordre des menus :
 * on saisit, on suit ses tiers, on tient ses comptes, on clôture. Le dernier
 * groupe rassemble ce qui n'existe QUE chez une entité à but non lucratif
 * (registre des donateurs, bailleurs, budgets par projet) · le mettre à part
 * évite de le noyer parmi les fenêtres classiques, alors que c'est là que se
 * joue la conformité SYCEBNL.
 */
const GROUPES: GroupeDef[] = [
  {
    titre: 'Gestion quotidienne',
    tuiles: [
      { label: 'Saisie des journaux', chemin: '/saisie', Icon: IconGrille },
      { label: 'Journal', chemin: '/journal?onglet=journal', Icon: IconJournal },
      { label: 'Brouillard', chemin: '/brouillard', Icon: IconSaisie },
      { label: 'Balance des comptes', chemin: '/journal?onglet=balance', Icon: IconBalance },
      { label: 'Analyse et contrôles', chemin: '/controles', Icon: IconCheck },
    ],
  },
  {
    titre: 'Gestion des tiers',
    tuiles: [
      { label: 'Plan des tiers', chemin: '/tiers', Icon: IconUsers },
      { label: 'Balance âgée', chemin: '/balance-agee', Icon: IconSearch },
      { label: 'Échéancier', chemin: '/echeancier', Icon: IconNews },
      { label: 'Rappel et relevé', chemin: '/relances', Icon: IconPrint },
      { label: 'Rapprochement', chemin: '/rapprochement', Icon: IconBanque },
    ],
  },
  {
    titre: 'Comptes généraux et structure',
    tuiles: [
      { label: 'Plan comptable', chemin: '/comptes', Icon: IconComptes },
      { label: 'Grand livre', chemin: '/journal?onglet=grand-livre', Icon: IconBook },
      { label: 'Codes journaux', chemin: '/journaux', Icon: IconJournal },
      { label: 'Immobilisations', chemin: '/immobilisations', Icon: IconImmo },
      { label: 'Régularisations', chemin: '/regularisations', Icon: IconRefresh },
    ],
  },
  {
    titre: 'Clôture et états financiers',
    tuiles: [
      { label: 'États financiers', chemin: '/etats-financiers', Icon: IconEtats },
      { label: 'Notes annexes', chemin: '/notes-annexes', Icon: IconBook },
      { label: 'Documents obligatoires', chemin: '/documents-obligatoires', Icon: IconLock },
      { label: "Fin d'exercice", chemin: '/exercice', Icon: IconCheck },
      { label: 'Tableau de bord', chemin: '/tableau-de-bord', Icon: IconDashboard },
    ],
  },
  {
    titre: 'Propre aux entités à but non lucratif',
    tuiles: [
      { label: 'Registre des donateurs', chemin: '/registre-donateurs', Icon: IconBook },
      { label: 'Bailleurs de fonds', chemin: '/bailleurs', Icon: IconUsers },
      { label: 'États analytiques', chemin: '/etats-analytiques', Icon: IconDashboard },
      { label: 'Plans analytiques', chemin: '/plans-analytiques', Icon: IconComptes },
      { label: 'Retenues et fiscal', chemin: '/retenues', Icon: IconPrint },
    ],
  },
];

export function AccueilPage() {
  const navigate = useNavigate();
  const { utilisateur, estAdmin, seDeconnecter } = useAuth();
  const { exerciceCourant } = useExercice();
  const [wizardOuvert, setWizardOuvert] = useState(false);
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

  const jeu = utilisateur ? JEUX[utilisateur.tenant.jeuEtatsFinanciersSycebnl] : null;
  const anneeExercice = exerciceCourant ? new Date(exerciceCourant.dateDebut).getFullYear() : null;

  const dateCourte = (iso: string) =>
    new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <div className="p-4 pb-8 max-w-[1320px]">
      {/* --- Bande 1 · identité du dossier --------------------------------- */}
      <section
        className="relative overflow-hidden rounded-[16px] px-5 py-4 mb-4 text-white shadow-posee"
        style={{ background: 'linear-gradient(120deg, var(--a-700), var(--a-800) 55%, var(--titlebar-from))' }}
      >
        {/* Voile lumineux : donne du volume sans image ni motif. */}
        <div
          className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.14), transparent 68%)' }}
        />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.09em] text-white/55">Dossier ouvert</div>
            <h1 className="text-[24px] font-semibold leading-tight mt-0.5 truncate">{utilisateur?.tenant.nom}</h1>
            <div className="text-[12px] text-white/70 mt-1">
              {utilisateur?.tenant.referentiel}
              {jeu && ` · ${jeu}`}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {anneeExercice && (
              <span className="rounded-[10px] bg-white/10 px-3 py-1.5 text-[12px] font-semibold">
                Exercice {anneeExercice}
              </span>
            )}
            <button
              type="button"
              onClick={() => setWizardOuvert(true)}
              className="flex items-center gap-1.5 rounded-[10px] bg-white/12 px-3 py-1.5 text-[12px] font-semibold hover:bg-white/20"
            >
              <IconFileAdd width={14} height={14} />
              Nouveau dossier
            </button>
            <button
              type="button"
              onClick={() => {
                seDeconnecter();
                navigate('/connexion');
              }}
              className="flex items-center gap-1.5 rounded-[10px] bg-white/12 px-3 py-1.5 text-[12px] font-semibold hover:bg-white/20"
            >
              <IconFolderOpen width={14} height={14} />
              Ouvrir un autre
            </button>
          </div>
        </div>
      </section>

      {/* --- Bande 2 · ce qui réclame une action --------------------------- */}
      <section className="mb-6">
        <TitreBande>Où en est ce dossier</TitreBande>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {chargement ? (
            [0, 1, 2, 3].map((i) => <div key={i} className="squelette h-[86px] rounded-[12px]" />)
          ) : (
            <>
              <CarteEtat
                titre="Écritures au brouillard"
                valeur={brouillard ? brouillard.libelle : 'Non déterminé'}
                bon={brouillard?.satisfait ?? true}
                chemin="/brouillard"
                navigate={navigate}
              />
              <CarteEtat
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
              <CarteEtat
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
              <CarteEtat
                titre="Prochaine échéance"
                valeur={prochain ? `${dateCourte(prochain.echeance)} · ${prochain.libelle}` : 'Rien à venir'}
                bon
                chemin="/exercice"
                navigate={navigate}
              />
            </>
          )}
        </div>
      </section>

      {/* --- Bande 3 · le lanceur, par domaine ----------------------------- */}
      {GROUPES.map((groupe) => (
        <section key={groupe.titre} className="mb-5">
          <TitreBande>{groupe.titre}</TitreBande>
          <div className="flex flex-wrap gap-2.5">
            {groupe.tuiles
              .filter((t) => !t.admin || estAdmin)
              .map((t, i) => (
                <Tuile key={t.chemin} tuile={t} rang={i} onClick={() => navigate(t.chemin)} />
              ))}
          </div>
        </section>
      ))}

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={() => setAProposOuvert(true)}
          className="flex items-center gap-1.5 text-[11.5px] text-text-dim hover:text-text"
        >
          <IconInfo width={13} height={13} />
          À propos d’OmegaX
        </button>
      </div>

      {wizardOuvert && <NouveauFichierWizard onClose={() => setWizardOuvert(false)} />}
      {aProposOuvert && <AProposModale onFermer={() => setAProposOuvert(false)} />}
    </div>
  );
}

function TitreBande({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-[0.09em] text-text-dim mb-2 px-0.5">{children}</div>
  );
}

/**
 * Tuile de lancement · carrée et colorée comme celles d'IntuiSage, mais avec
 * le libellé SOUS l'icône et non par-dessus : chez Sage, le texte se glisse
 * dans le carré coloré et s'y coupe (« Visualisation/mo-dification d'une »),
 * ce qui rend la moitié des tuiles illisibles. Le carré porte l'icône, le
 * libellé vit dessous, au complet.
 */
function Tuile({ tuile, rang, onClick }: { tuile: TuileDef; rang: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={tuile.label}
      style={{ animationDelay: `${rang * 35}ms` }}
      className="anim-cascade group flex w-[104px] flex-col items-center gap-2 rounded-[12px] border border-transparent p-2 text-center transition-[background-color,border-color,transform] duration-200 ease-sortie hover:-translate-y-[2px] hover:border-border hover:bg-surface"
    >
      <span
        className="flex h-[52px] w-[52px] items-center justify-center rounded-[13px] text-white shadow-plate transition-shadow duration-200 group-hover:shadow-flottante"
        style={{ background: 'linear-gradient(140deg, var(--a-600), var(--a-800))' }}
      >
        <tuile.Icon width={22} height={22} />
      </span>
      <span className="text-[10.5px] font-medium leading-tight text-text">{tuile.label}</span>
    </button>
  );
}

/**
 * Carte d'état · une phrase, une couleur, une destination. Le vert dit
 * « rien à faire ici », l'ambre « regardez ». Pas de rouge : rien sur cet
 * écran n'est une erreur du logiciel, seulement du travail en attente.
 */
function CarteEtat({
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
      className="group flex flex-col items-start gap-1.5 rounded-[12px] border border-border bg-surface p-3.5 text-left shadow-plate transition-[transform,box-shadow,border-color] duration-200 ease-sortie hover:-translate-y-[2px] hover:border-border-dark hover:shadow-flottante"
    >
      <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-text-dim">
        <span className={`h-1.5 w-1.5 rounded-full ${bon ? 'bg-positive' : 'bg-warning'}`} aria-hidden />
        {titre}
      </span>
      <span className={`text-[13px] font-medium leading-snug ${bon ? '' : 'text-warning'}`}>{valeur}</span>
    </button>
  );
}
