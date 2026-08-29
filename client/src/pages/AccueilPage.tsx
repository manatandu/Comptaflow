import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useExercice } from '../lib/exercice';
import { NouveauFichierWizard } from '../components/NouveauFichierWizard';
import { AProposModale } from '../components/chrome/AProposModale';
import type { PlanningCloture, RapportControles } from '../lib/types';
import { IconFileAdd, IconFolderOpen, IconInfo } from '../components/chrome/icons';

/**
 * ACCUEIL · la première fenêtre du dossier ouvert.
 *
 * Ce n'était qu'un mur de tuiles carrées, dont quatre grisées « bientôt » :
 * un écran qui parlait de lui-même au lieu de parler du dossier. Il répond
 * maintenant à la seule question qu'on se pose en ouvrant un logiciel
 * comptable un matin : OÙ EN EST CE DOSSIER, et par quoi je commence.
 *
 * Deux bandes seulement :
 *  1. l'identité du dossier et son exercice ;
 *  2. ce qui réclame une action, tiré du planning de clôture et des contrôles
 *     de cohérence.
 *
 * IL N'Y A PLUS DE GRILLE DE RACCOURCIS ICI, et c'est délibéré. Elle reprenait
 * mot pour mot les sept boutons de la barre d'outils, elle-même présente sur
 * TOUS les écrans, accueil compris : « Journal » se trouvait à la fois sur
 * cette page, dans la barre d'outils juste au-dessus, et dans le menu État.
 * Trois chemins pour une même fenêtre, dont deux visibles en même temps.
 *
 * Le partage des rôles retenu, écrit ici pour qu'il ne dérive pas :
 *
 *   BARRE DE MENUS  · la carte complète du logiciel. Tout s'y trouve.
 *   BARRE D'OUTILS  · les sept fenêtres du quotidien, à un clic, partout.
 *   ACCUEIL         · où en est CE dossier, et ce qui réclame une action.
 *                     Pas un lanceur : la barre d'outils au-dessus en est un.
 *
 * Aucune tuile « bientôt » non plus : un logiciel fini ne montre pas ses
 * chantiers, règle déjà posée pour la barre de menus.
 */

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

  const enRetard = planning?.jalons.filter((j) => j.enRetard) ?? [];
  const aujourdHui = Date.now();
  const prochain =
    planning?.jalons.find((j) => !j.enRetard && new Date(j.echeance).getTime() >= aujourdHui) ?? null;
  const brouillard = planning?.jalons.find((j) => j.libelle === 'Balance de vérification')?.observation ?? null;

  // Les anomalies bloquantes passent avant tout : une écriture déséquilibrée
  // ou une caisse créditrice empêchent d'arrêter les comptes, pas seulement
  // de bien les tenir.
  const bloquants = controles?.totaux.bloquants ?? 0;
  const avertissements = controles?.totaux.avertissements ?? 0;
  const pireAnomalie = controles?.anomalies.find((a) => a.gravite !== 'INFORMATION') ?? null;

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
