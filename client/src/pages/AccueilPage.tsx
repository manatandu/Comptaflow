import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useExercice } from '../lib/exercice';
import { NouveauFichierWizard } from '../components/NouveauFichierWizard';
import { AProposModale } from '../components/chrome/AProposModale';
import type { PlanningCloture } from '../lib/types';
import {
  IconFileAdd,
  IconFolderOpen,
  IconSaisie,
  IconComptes,
  IconJournal,
  IconEtats,
  IconInfo,
  IconDashboard,
  IconBalance,
} from '../components/chrome/icons';

/**
 * ACCUEIL · la première fenêtre du dossier ouvert.
 *
 * Ce n'était qu'un mur de tuiles carrées, dont quatre grisées « bientôt » :
 * un écran qui parlait de lui-même au lieu de parler du dossier. Il répond
 * maintenant à la seule question qu'on se pose en ouvrant un logiciel
 * comptable un matin : OÙ EN EST CE DOSSIER, et par quoi je commence.
 *
 * Trois bandes :
 *  1. l'identité du dossier et son exercice ;
 *  2. ce qui réclame une action, tiré du planning de clôture (écritures au
 *     brouillard, jalons en retard, prochaine échéance) ;
 *  3. les fenêtres du quotidien, en cartes larges avec ce qu'elles font.
 *
 * Aucune tuile « bientôt » : un logiciel fini ne montre pas ses chantiers,
 * règle déjà posée pour la barre de menus.
 */

interface Raccourci {
  label: string;
  detail: string;
  Icon: (p: { width?: number; height?: number; className?: string }) => JSX.Element;
  chemin: string;
  teinte: string;
}

const RACCOURCIS: Raccourci[] = [
  {
    label: 'Saisie des journaux',
    detail: 'Passer les écritures du jour, par journal',
    Icon: IconSaisie,
    chemin: '/saisie',
    teinte: 'var(--a-600)',
  },
  {
    label: 'Journal et grand livre',
    detail: 'Consulter, filtrer, justifier un solde',
    Icon: IconJournal,
    chemin: '/journal',
    teinte: 'var(--a-600)',
  },
  {
    label: 'Balance des comptes',
    detail: 'Contrôler les masses avant arrêté',
    Icon: IconBalance,
    chemin: '/journal?onglet=balance',
    teinte: 'var(--tile-sarcelle)',
  },
  {
    label: 'Plan comptable',
    detail: 'Ouvrir, paramétrer et interroger un compte',
    Icon: IconComptes,
    chemin: '/comptes',
    teinte: 'var(--tile-sarcelle)',
  },
  {
    label: 'États financiers',
    detail: 'La liasse du jeu retenu, et son export',
    Icon: IconEtats,
    chemin: '/etats-financiers',
    teinte: 'var(--tile-ardoise)',
  },
  {
    label: 'Tableau de bord',
    detail: 'Trésorerie, produits, charges, résultat',
    Icon: IconDashboard,
    chemin: '/tableau-de-bord',
    teinte: 'var(--tile-ardoise)',
  },
];

const JEUX: Record<string, string> = {
  ASSOCIATIONS_ORDRES_PROFESSIONNELS: 'Associations et ordres professionnels',
  PROJETS_DEVELOPPEMENT: 'Projets de développement',
  SYSTEME_MINIMAL_TRESORERIE: 'Système minimal de trésorerie',
};

export function AccueilPage() {
  const navigate = useNavigate();
  const { utilisateur, seDeconnecter } = useAuth();
  const { exerciceCourant } = useExercice();
  const [wizardOuvert, setWizardOuvert] = useState(false);
  const [aProposOuvert, setAProposOuvert] = useState(false);
  const [planning, setPlanning] = useState<PlanningCloture | null>(null);
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    if (!exerciceCourant) return;
    let vivant = true;
    setChargement(true);
    api
      .get<PlanningCloture>(`/exercices/${exerciceCourant.id}/planning-cloture`)
      .then((p) => vivant && setPlanning(p))
      // L'accueil ne doit jamais afficher une erreur : la bande « à faire »
      // disparaît, les raccourcis restent. Le détail se voit sur la fenêtre
      // Fin d'exercice, qui est faite pour ça.
      .catch(() => vivant && setPlanning(null))
      .finally(() => vivant && setChargement(false));
    return () => {
      vivant = false;
    };
  }, [exerciceCourant]);

  const enRetard = planning?.jalons.filter((j) => j.enRetard) ?? [];
  const aujourdHui = Date.now();
  const prochain =
    planning?.jalons.find((j) => !j.enRetard && new Date(j.echeance).getTime() >= aujourdHui) ?? null;
  const brouillard = planning?.jalons.find((j) => j.libelle === 'Balance de vérification')?.observation ?? null;

  const jeu = utilisateur ? JEUX[utilisateur.tenant.jeuEtatsFinanciersSycebnl] : null;
  const anneeExercice = exerciceCourant ? new Date(exerciceCourant.dateDebut).getFullYear() : null;

  const dateCourte = (iso: string) =>
    new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <div className="p-4 max-w-[1180px]">
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
      <section className="mb-5">
        <div className="text-[11px] font-semibold uppercase tracking-[0.09em] text-text-dim mb-2 px-0.5">
          Où en est ce dossier
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {chargement ? (
            [0, 1, 2].map((i) => <div key={i} className="squelette h-[86px] rounded-[12px]" />)
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

      {/* --- Bande 3 · les fenêtres du quotidien --------------------------- */}
      <section>
        <div className="text-[11px] font-semibold uppercase tracking-[0.09em] text-text-dim mb-2 px-0.5">
          Travailler
        </div>
        <div className="anim-cascade grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {RACCOURCIS.map((r) => (
            <button
              key={r.chemin}
              type="button"
              onClick={() => navigate(r.chemin)}
              className="group flex items-start gap-3 rounded-[12px] border border-border bg-surface p-3.5 text-left shadow-plate transition-[transform,box-shadow,border-color] duration-200 ease-sortie hover:-translate-y-[2px] hover:border-border-dark hover:shadow-flottante"
            >
              <span
                className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] text-white transition-transform duration-200 ease-ressort group-hover:scale-105"
                style={{ background: r.teinte }}
              >
                <r.Icon width={19} height={19} />
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold">{r.label}</span>
                <span className="block text-[11.5px] text-text-dim mt-0.5 leading-snug">{r.detail}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <div className="mt-5 flex justify-end">
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
        <span
          className={`h-1.5 w-1.5 rounded-full ${bon ? 'bg-positive' : 'bg-warning'}`}
          aria-hidden
        />
        {titre}
      </span>
      <span className={`text-[13px] font-medium leading-snug ${bon ? '' : 'text-warning'}`}>{valeur}</span>
    </button>
  );
}
