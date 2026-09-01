import { Suspense, lazy, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useExercice } from '../lib/exercice';
import { useAuth } from '../lib/auth';
import { IconExport, IconCheck } from '../components/chrome/icons';
import { Aide } from '../components/chrome/Aide';
import { BlocCertification, EnteteImpression } from '../components/chrome/EnteteImpression';
const EtatsSmtPage = lazy(() => import('./EtatsSmtPage').then((m) => ({ default: m.EtatsSmtPage })));
import type {
  Bilan,
  BilanProjet,
  CompteDeResultat,
  CompteExploitationProjet,
  LigneBilan,
  LigneFluxTresorerie,
  NoteBailleur,
  PosteCalcule,
  TableauEmploisRessources,
  TableauExecutionBudgetaire,
  TableauFluxTresorerie,
  TableauReconciliationTresorerie,
} from '../lib/types';

/**
 * Onglets du jeu « associations et ordres professionnels » (Partie 4, ch. 2)
 * vs du jeu « projets de développement et assimilés » (Partie 4, ch. 3) ·
 * jamais les deux à la fois : `useAuth().utilisateur.tenant.jeuEtatsFinanciersSycebnl`
 * décide lequel des deux jeux ce dossier affiche (voir
 * docs/plan-de-construction.md, item 13).
 *
 * Le troisième jeu, le Système Minimal de Trésorerie (Partie 4, ch. 4), n'est
 * PAS un onglet de plus ici : ses maquettes n'ont ni les mêmes postes, ni le
 * même nombre de colonnes, ni la même logique (comptabilité de trésorerie).
 * Il a son propre écran, `EtatsSmtPage`, vers lequel le composant exporté en
 * fin de fichier aiguille.
 */
type OngletAssociations = 'bilan' | 'compte-de-resultat' | 'flux-tresorerie';
type OngletProjet =
  | 'bilan-projet'
  | 'compte-exploitation-projet'
  | 'emplois-ressources'
  | 'execution-budgetaire'
  | 'reconciliation-tresorerie'
  | 'note-bailleur';

/** Nom de l'état affiché · repris en sous-titre de l'en-tête d'impression. */
const LIBELLE_ONGLET: Record<string, string> = {
  bilan: 'Bilan',
  'compte-de-resultat': 'Compte de résultat',
  'flux-tresorerie': 'Tableau de flux de trésorerie',
  'bilan-projet': 'Bilan',
  'compte-exploitation-projet': "Compte d'exploitation",
  'emplois-ressources': 'Tableau emplois-ressources',
  'execution-budgetaire': "Tableau d'exécution budgétaire",
  'reconciliation-tresorerie': 'Tableau de réconciliation de trésorerie',
  'note-bailleur': 'Note 9 · Fonds du bailleur',
};

/** Entrée du lexique SYCEBNL correspondant à chaque onglet d'état. */
const AIDE_ONGLET: Record<string, 'bilan' | 'compteResultat' | 'tft' | 'compteExploitation' | 'bailleur' | 'budget' | undefined> = {
  bilan: 'bilan',
  'compte-de-resultat': 'compteResultat',
  'flux-tresorerie': 'tft',
  'bilan-projet': 'bilan',
  'compte-exploitation-projet': 'compteExploitation',
  'emplois-ressources': undefined,
  'execution-budgetaire': 'budget',
  'reconciliation-tresorerie': 'tft',
  'note-bailleur': 'bailleur',
};

function EtatsSystemeNormalPage() {
  const { exerciceCourant } = useExercice();
  const { utilisateur } = useAuth();
  const jeuProjet = utilisateur?.tenant.jeuEtatsFinanciersSycebnl === 'PROJETS_DEVELOPPEMENT';
  const navigate = useNavigate();

  const [ongletAssociations, setOngletAssociations] = useState<OngletAssociations>('bilan');
  const [ongletProjet, setOngletProjet] = useState<OngletProjet>('bilan-projet');
  const onglet = jeuProjet ? ongletProjet : ongletAssociations;

  const [bilan, setBilan] = useState<Bilan | null>(null);
  const [cr, setCr] = useState<CompteDeResultat | null>(null);
  const [tft, setTft] = useState<TableauFluxTresorerie | null>(null);
  const [bilanProjet, setBilanProjet] = useState<BilanProjet | null>(null);
  const [ceProjet, setCeProjet] = useState<CompteExploitationProjet | null>(null);
  const [noteBailleur, setNoteBailleur] = useState<NoteBailleur | null>(null);
  const [emploisRessources, setEmploisRessources] = useState<TableauEmploisRessources | null>(null);
  const [executionBudget, setExecutionBudget] = useState<TableauExecutionBudgetaire | null>(null);
  const [erreurBudget, setErreurBudget] = useState<string | null>(null);
  const [reconciliation, setReconciliation] = useState<TableauReconciliationTresorerie | null>(null);
  // Repère H du tableau de réconciliation · extra-comptable, saisi ici.
  const [paiementsEnInstance, setPaiementsEnInstance] = useState('0');

  const [erreur, setErreur] = useState<string | null>(null);
  const [exportEnCours, setExportEnCours] = useState(false);

  // Drapeau `annule` : une réponse lente ne doit pas écraser un état plus
  // récent après un changement d'exercice. Un seul des deux jeux est
  // interrogé, selon le dossier · pas les deux à chaque fois.
  useEffect(() => {
    // `utilisateur` est null au tout premier rendu : sans cette garde, un
    // dossier « projets de développement » interrogerait d'abord les
    // endpoints du jeu ASSOCIATIONS (jeuProjet valant false par défaut),
    // puis rebasculerait · requêtes inutiles et onglets qui changent sous
    // l'œil. Corrigé à l'audit du 2026-08-28.
    if (!exerciceCourant || !utilisateur) return;
    let annule = false;
    if (jeuProjet) {
      api.get<BilanProjet>(`/etats-financiers/projet/bilan?exerciceId=${exerciceCourant.id}`).then(
        (r) => !annule && setBilanProjet(r),
        (e) => !annule && setErreur(e.message),
      );
      api.get<CompteExploitationProjet>(`/etats-financiers/projet/compte-exploitation?exerciceId=${exerciceCourant.id}`).then(
        (r) => !annule && setCeProjet(r),
        (e) => !annule && setErreur(e.message),
      );
      api.get<NoteBailleur>(`/etats-financiers/projet/note-bailleur?exerciceId=${exerciceCourant.id}`).then(
        (r) => !annule && setNoteBailleur(r),
        (e) => !annule && setErreur(e.message),
      );
      api.get<TableauEmploisRessources>(`/etats-financiers/projet/emplois-ressources?exerciceId=${exerciceCourant.id}`).then(
        (r) => !annule && setEmploisRessources(r),
        (e) => !annule && setErreur(e.message),
      );
      // Le tableau d'exécution budgétaire suppose une nomenclature budgétaire :
      // son absence n'est pas une erreur de l'application, c'est un dossier
      // qui n'a pas encore de plan analytique à budgets. Erreur isolée pour ne
      // pas polluer les autres états.
      api.get<TableauExecutionBudgetaire>(`/etats-financiers/projet/execution-budgetaire?exerciceId=${exerciceCourant.id}`).then(
        (r) => !annule && setExecutionBudget(r),
        (e) => !annule && setErreurBudget(e.message),
      );
    } else {
      api.get<Bilan>(`/etats-financiers/bilan?exerciceId=${exerciceCourant.id}`).then(
        (r) => !annule && setBilan(r),
        (e) => !annule && setErreur(e.message),
      );
      api.get<CompteDeResultat>(`/etats-financiers/compte-de-resultat?exerciceId=${exerciceCourant.id}`).then(
        (r) => !annule && setCr(r),
        (e) => !annule && setErreur(e.message),
      );
      // Le TFT est spécifique au jeu associations (Partie 4, ch. 1 § 4 : « un
      // état financier spécifique aux associations et ordres professionnels »).
      api.get<TableauFluxTresorerie>(`/etats-financiers/tableau-flux-tresorerie?exerciceId=${exerciceCourant.id}`).then(
        (r) => !annule && setTft(r),
        (e) => !annule && setErreur(e.message),
      );
    }
    return () => {
      annule = true;
    };
  }, [exerciceCourant?.id, jeuProjet, utilisateur]);

  /**
   * La liasse complète : tous les états du jeu retenu par le dossier dans un
   * seul classeur. C'est ce fichier qui se dépose au CPCC ou s'envoie à un
   * bailleur.
   */
  const exporterLiasse = async () => {
    if (!exerciceCourant) return;
    setErreur(null);
    setExportEnCours(true);
    try {
      await api.telecharger(
        `/exports/etats-financiers/liasse-complete?exerciceId=${exerciceCourant.id}`,
        `liasse-complete-${new Date(exerciceCourant.dateDebut).getFullYear()}.xlsx`,
      );
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Échec de l'export de la liasse");
    } finally {
      setExportEnCours(false);
    }
  };

  const exporter = async () => {
    if (!exerciceCourant) return;
    const chemin =
      onglet === 'bilan'
        ? 'bilan'
        : onglet === 'compte-de-resultat'
          ? 'compte-de-resultat'
          : onglet === 'flux-tresorerie'
            ? 'tableau-flux-tresorerie'
            : onglet === 'bilan-projet'
              ? 'projet/bilan'
              : onglet === 'compte-exploitation-projet'
                ? 'projet/compte-exploitation'
                : onglet === 'emplois-ressources'
                  ? 'projet/emplois-ressources'
                  : onglet === 'execution-budgetaire'
                    ? 'projet/execution-budgetaire'
                    : onglet === 'reconciliation-tresorerie'
                      ? 'projet/reconciliation-tresorerie'
                      : 'projet/note-bailleur';
    const nomFichier = chemin.includes('/') ? chemin.split('/')[1] + '-projet' : chemin;
    setErreur(null);
    setExportEnCours(true);
    try {
      await api.telecharger(`/exports/etats-financiers/${chemin}?exerciceId=${exerciceCourant.id}`, `${nomFichier}.xlsx`);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Échec de l'export");
    } finally {
      setExportEnCours(false);
    }
  };

  const montant = (v: number | undefined) =>
    v === undefined ? '·' : v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // --- Compte de résultat : REF | Libellé | Montant (N) | Montant (N-1) ---
  // `cle` : par défaut `p.ref`, mais explicite côté compte d'exploitation
  // projet · TJ et TK y apparaissent deux fois (doublon officiel, voir
  // correspondance-projet-compte-exploitation.ts), une clé React sur le
  // seul `ref` y collisionnerait.
  const lignePoste = (p: PosteCalcule, cle: string = p.ref) => (
    <div
      key={cle}
      title={p.comptes.length > 0 ? `Comptes : ${p.comptes.map((c) => c.numero).join(', ')}` : 'Aucun compte mouvementé'}
      className={`grid grid-cols-[46px_1fr_120px_120px] gap-2 px-4 py-1 text-[11px] ${p.montant === 0 ? 'text-text-dim' : ''}`}
    >
      <span className="font-mono text-[10.5px] text-text-dim">{p.ref}</span>
      <span>{p.libelle}</span>
      <span className="font-mono text-right">{montant(p.montant)}</span>
      <span className="font-mono text-right text-text-dim">{montant(p.montantN1)}</span>
    </div>
  );

  // --- Tableau de flux de trésorerie : REF | Libellé | Montant (N) | Montant (N-1) ---
  const ligneFlux = (l: LigneFluxTresorerie) => (
    <div
      key={l.ref || l.libelle}
      title={l.comptes.length > 0 ? `Comptes : ${l.comptes.map((c) => c.numero).join(', ')}` : undefined}
      className={`grid grid-cols-[46px_1fr_120px_120px] gap-2 px-4 py-1 text-[11px] ${
        l.estTotal ? 'font-bold bg-surface-alt border-y border-border' : ''
      }`}
    >
      <span className="font-mono text-[10.5px] text-text-dim">{l.ref}</span>
      <span>{l.libelle}</span>
      <span className="font-mono text-right">{montant(l.montant)}</span>
      <span className="font-mono text-right text-text-dim font-normal">{montant(l.montantN1)}</span>
    </div>
  );

  const ligneTotal = (ref: string, libelle: string, valeur: number, valeurN1?: number) => (
    <div className="grid grid-cols-[46px_1fr_120px_120px] gap-2 px-4 py-1.5 bg-surface-alt border-y border-border text-[11px] font-bold">
      <span className="font-mono text-[10.5px]">{ref}</span>
      <span>{libelle}</span>
      <span className="font-mono text-right">{montant(valeur)}</span>
      <span className="font-mono text-right text-text-dim font-normal">{montant(valeurN1)}</span>
    </div>
  );

  // --- Bilan actif : REF | Libellé | Brut (N) | Amort./dépréc. (N) | Net (N) | Net (N-1) ---
  const ligneActif = (l: LigneBilan) => (
    <div
      key={l.ref}
      title={l.comptes.length > 0 ? `Comptes : ${l.comptes.map((c) => c.numero).join(', ')}` : undefined}
      className={`grid grid-cols-[42px_1.4fr_100px_120px_100px_100px] gap-2 px-4 py-1 text-[11px] items-baseline ${
        l.estTotal ? 'font-bold bg-surface-alt border-y border-border' : ''
      }`}
    >
      <span className="font-mono text-[10px] text-text-dim">{l.ref}</span>
      <span>{l.libelle}</span>
      <span className="font-mono text-right">{montant(l.brut)}</span>
      <span className="font-mono text-right text-text-dim">{l.amortissement ? `(${montant(l.amortissement)})` : montant(l.amortissement)}</span>
      <span className="font-mono text-right">{montant(l.montant)}</span>
      <span className="font-mono text-right text-text-dim font-normal">{montant(l.montantN1)}</span>
    </div>
  );

  // --- Bilan passif : REF | Libellé | Net (N) | Net (N-1) · pas de colonne Brut/Amort côté passif (le texte officiel n'en prévoit pas) ---
  const lignePassif = (l: LigneBilan) => (
    <div
      key={l.ref}
      title={l.comptes.length > 0 ? `Comptes : ${l.comptes.map((c) => c.numero).join(', ')}` : undefined}
      className={`grid grid-cols-[42px_1.4fr_100px_100px] gap-2 px-4 py-1 text-[11px] items-baseline ${
        l.estTotal ? 'font-bold bg-surface-alt border-y border-border' : ''
      }`}
    >
      <span className="font-mono text-[10px] text-text-dim">{l.ref}</span>
      <span>{l.libelle}</span>
      <span className="font-mono text-right">{montant(l.montant)}</span>
      <span className="font-mono text-right text-text-dim font-normal">{montant(l.montantN1)}</span>
    </div>
  );

  return (
    <div className="p-2">
      <EnteteImpression titre="États financiers" sousTitre={LIBELLE_ONGLET[onglet]} />
      <div className="ecran-seul flex items-center justify-between mb-1.5">
        <div>
          <div className="text-[10px] font-mono text-text-dim leading-none">ÉTAT</div>
          <h1 className="text-[12px] font-bold leading-tight flex items-center gap-1.5">
            États financiers
            <Aide sujet="jeuEtats" />
          </h1>
          <div className="text-[10px] text-text-dim mt-0.5">
            Jeu {jeuProjet ? 'des projets de développement' : 'des associations et ordres professionnels'} ·{' '}
            <button onClick={() => navigate('/parametres-dossier')} className="underline hover:text-sel">
              paramètres du dossier
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          {exerciceCourant && (
            <span className="font-mono text-[10.5px] border border-border bg-surface px-2.5 py-1.5">
              Exercice {new Date(exerciceCourant.dateDebut).getFullYear()}
            </span>
          )}
          {/*
            DEUX boutons, et l'ordre compte. Un bouton par onglet suffit pour
            retravailler un état ; il ne suffit pas pour DÉPOSER. Une liasse,
            c'est cinq à sept états plus les notes : les télécharger un par un
            puis les recoller à la main, c'est la manipulation où l'on oublie
            une pièce. La liasse complète est donc l'action principale, et
            l'export de l'onglet courant l'action secondaire.
          */}
          <button
            onClick={exporterLiasse}
            disabled={exportEnCours}
            title="Tous les états du jeu dans un seul classeur, précédés d’un sommaire"
            className="flex items-center gap-1.5 border border-sel bg-sel text-white px-3 py-1.5 text-[10.5px] font-bold hover:brightness-110 disabled:opacity-50 disabled:cursor-wait"
          >
            <IconExport width={13} height={13} />
            {exportEnCours ? 'Export en cours…' : 'Exporter la liasse complète'}
          </button>
          <button
            onClick={exporter}
            disabled={exportEnCours}
            title="Seulement l’état affiché dans cet onglet"
            className="flex items-center gap-1.5 border border-border bg-surface px-3 py-1.5 text-[10.5px] font-bold hover:bg-surface-alt disabled:opacity-50 disabled:cursor-wait"
          >
            <IconExport width={13} height={13} />
            Cet onglet
          </button>
        </div>
      </div>

      {erreur && (
        <div className="flex items-start justify-between gap-3 border border-danger/30 bg-danger-soft px-3.5 py-2 mb-2.5">
          <span className="text-[10.5px]">{erreur}</span>
          <button onClick={() => setErreur(null)} className="text-[10.5px] font-bold shrink-0 hover:underline">
            Fermer
          </button>
        </div>
      )}

      {jeuProjet && (
        <p className="text-[10px] text-text-dim mb-1.5">
          Jeu « Projets de développement et assimilés » (SYCEBNL, Partie 4 ch. 3). Les cinq états du point 2 de
          l'article 14 sont produits ; la correspondance du tableau emplois-ressources et du tableau d'exécution
          budgétaire vient du Guide d'application, chapitre 7.
        </p>
      )}

      {jeuProjet ? (
        <div className="ecran-seul flex bg-chrome border border-border border-b-0">
          <button
            onClick={() => setOngletProjet('bilan-projet')}
            className={`px-4 py-1.5 text-[10.5px] font-bold ${
              onglet === 'bilan-projet' ? 'bg-surface border-r border-border' : 'text-text-dim'
            }`}
          >
            BILAN
          </button>
          <button
            onClick={() => setOngletProjet('compte-exploitation-projet')}
            className={`px-4 py-1.5 text-[10.5px] font-bold ${
              onglet === 'compte-exploitation-projet' ? 'bg-surface border-r border-l border-border' : 'text-text-dim'
            }`}
          >
            COMPTE D'EXPLOITATION
          </button>
          <button
            onClick={() => setOngletProjet('emplois-ressources')}
            className={`px-4 py-1.5 text-[10.5px] font-bold ${
              onglet === 'emplois-ressources' ? 'bg-surface border-r border-l border-border' : 'text-text-dim'
            }`}
          >
            EMPLOIS-RESSOURCES
          </button>
          <button
            onClick={() => setOngletProjet('execution-budgetaire')}
            className={`px-4 py-1.5 text-[10.5px] font-bold ${
              onglet === 'execution-budgetaire' ? 'bg-surface border-r border-l border-border' : 'text-text-dim'
            }`}
          >
            EXÉCUTION BUDGÉTAIRE
          </button>
          <button
            onClick={() => setOngletProjet('reconciliation-tresorerie')}
            className={`px-4 py-1.5 text-[10.5px] font-bold ${
              onglet === 'reconciliation-tresorerie' ? 'bg-surface border-r border-l border-border' : 'text-text-dim'
            }`}
          >
            RÉCONCILIATION
          </button>
          <button
            onClick={() => setOngletProjet('note-bailleur')}
            className={`px-4 py-1.5 text-[10.5px] font-bold ${
              onglet === 'note-bailleur' ? 'bg-surface border-r border-l border-border' : 'text-text-dim'
            }`}
          >
            NOTE 9 · FONDS DU BAILLEUR
          </button>
        </div>
      ) : (
        <div className="ecran-seul flex bg-chrome border border-border border-b-0">
          <button
            onClick={() => setOngletAssociations('bilan')}
            className={`px-4 py-1.5 text-[10.5px] font-bold ${onglet === 'bilan' ? 'bg-surface border-r border-border' : 'text-text-dim'}`}
          >
            BILAN
          </button>
          <button
            onClick={() => setOngletAssociations('compte-de-resultat')}
            className={`px-4 py-1.5 text-[10.5px] font-bold ${
              onglet === 'compte-de-resultat' ? 'bg-surface border-r border-l border-border' : 'text-text-dim'
            }`}
          >
            COMPTE DE RÉSULTAT
          </button>
          <button
            onClick={() => setOngletAssociations('flux-tresorerie')}
            className={`px-4 py-1.5 text-[10.5px] font-bold ${
              onglet === 'flux-tresorerie' ? 'bg-surface border-r border-l border-border' : 'text-text-dim'
            }`}
          >
            FLUX DE TRÉSORERIE
          </button>
        </div>
      )}

      {/* Bulle d'aide de l'état affiché : la définition SYCEBNL de l'état est
          à portée de clic, sans encombrer les onglets d'un paragraphe. */}
      {AIDE_ONGLET[onglet] && (
        <div className="ecran-seul flex items-center gap-1.5 border-x border-t border-border bg-surface px-4 pt-2 text-[10px] text-text-dim">
          <span>Ce que dit le référentiel</span>
          <Aide sujet={AIDE_ONGLET[onglet]!} />
        </div>
      )}

      {onglet === 'bilan' && (
        <>
          {!bilan && <div className="border border-border px-4 py-4 text-[11px] text-text-dim">Chargement…</div>}
          {bilan && (
            <div className="max-w-[1180px] overflow-x-auto">
              {!bilan.exerciceN1Disponible && (
                <p className="text-[10px] text-text-dim mb-1.5">
                  Aucun exercice antérieur dans ce dossier : la colonne N-1 reste vide, ce n'est pas un zéro.
                </p>
              )}

              <div className="border border-border bg-surface mb-3">
                <div className="grid grid-cols-[42px_1.4fr_100px_120px_100px_100px] gap-2 px-4 py-1.5 bg-surface-alt border-b border-border text-[10px] font-bold text-text-dim">
                  <span>REF</span>
                  <span>ACTIF</span>
                  <span className="text-right">BRUT (N)</span>
                  <span className="text-right">AMORT./DÉPRÉC. (N)</span>
                  <span className="text-right">NET (N)</span>
                  <span className="text-right">NET (N-1)</span>
                </div>
                {bilan.actif.map(ligneActif)}
              </div>

              <div className="border border-border bg-surface mb-3">
                <div className="grid grid-cols-[42px_1.4fr_100px_100px] gap-2 px-4 py-1.5 bg-surface-alt border-b border-border text-[10px] font-bold text-text-dim">
                  <span>REF</span>
                  <span>PASSIF</span>
                  <span className="text-right">NET (N)</span>
                  <span className="text-right">NET (N-1)</span>
                </div>
                {bilan.passif.map(lignePassif)}
              </div>

              <div
                className={`flex items-center gap-2 px-3.5 py-2.5 border ${
                  bilan.equilibre ? 'border-positive/30 bg-positive-soft' : 'border-danger/30 bg-danger-soft'
                }`}
              >
                <IconCheck width={14} height={14} className={bilan.equilibre ? 'text-positive' : 'text-danger'} />
                <span className="font-mono text-[10.5px] font-medium">
                  {bilan.equilibre
                    ? `LE BILAN EST ÉQUILIBRÉ · ACTIF = PASSIF = ${montant(bilan.totalActif)}`
                    : 'DÉSÉQUILIBRE DÉTECTÉ · vérifier les écritures et les comptes non rattachés ci-dessous'}
                </span>
              </div>

              {bilan.controle.doubleComptageProbable && (
                <div className="flex items-start gap-2 mt-2 px-3.5 py-2.5 border border-warning/40 bg-warning-soft">
                  <span className="text-[10.5px]">
                    ⚠ Les classes 6/7/8 ({montant(bilan.controle.resultatClasses678)}) ET le compte 13 (
                    {montant(bilan.controle.resultatCompte13)}) sont tous deux mouvementés · risque de double comptage
                    du résultat. Fournir une balance avant OU après clôture, pas un état intermédiaire.
                  </span>
                </div>
              )}

              {bilan.comptesNonRattaches.length > 0 && (
                <div className="border border-danger/30 bg-danger-soft mt-2 px-3.5 py-2.5">
                  <div className="text-[10.5px] font-bold mb-1.5">
                    Comptes de bilan rattachés à aucun poste officiel · leur montant n'entre dans aucun total
                  </div>
                  {bilan.comptesNonRattaches.map((c) => (
                    <div key={c.numero} className="flex justify-between text-[10.5px] font-mono">
                      <span>
                        {c.numero} · {c.intitule}
                      </span>
                      <span>{montant(c.montant)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {onglet === 'compte-de-resultat' && (
        <>
          {!cr && <div className="border border-border px-4 py-4 text-[11px] text-text-dim">Chargement…</div>}
          {cr && (
            <div className="max-w-[900px]">
              {!cr.exerciceN1Disponible && (
                <p className="text-[10px] text-text-dim mb-1.5">
                  Aucun exercice antérieur dans ce dossier : la colonne N-1 reste vide, ce n'est pas un zéro.
                </p>
              )}

              <div className="border border-border bg-surface shadow-posee">
                <div className="grid grid-cols-[46px_1fr_120px_120px] gap-2 px-4 py-1.5 bg-surface-alt border-b border-border text-[10px] font-bold text-text-dim">
                  <span>REF</span>
                  <span>LIBELLÉ</span>
                  <span className="text-right">MONTANT (N)</span>
                  <span className="text-right">MONTANT (N-1)</span>
                </div>
                {cr.produits.map((p) => lignePoste(p))}
                {ligneTotal('XA', 'REVENUS DES ACTIVITÉS ORDINAIRES', cr.totalProduits, cr.totalProduitsN1)}
                {cr.charges.map((p) => lignePoste(p))}
                {ligneTotal('XB', 'CHARGES DES ACTIVITÉS ORDINAIRES', cr.totalCharges, cr.totalChargesN1)}
                {ligneTotal(
                  'XC',
                  'RÉSULTAT DES ACTIVITÉS ORDINAIRES (XA − XB)',
                  cr.resultatActivitesOrdinaires,
                  cr.resultatActivitesOrdinairesN1,
                )}
                {lignePoste(cr.produitsHao)}
                {lignePoste(cr.chargesHao)}
                {ligneTotal('XD', 'RÉSULTAT H.A.O. (TM − TN)', cr.resultatHao, cr.resultatHaoN1)}
                <div className="grid grid-cols-[46px_1fr_120px_120px] gap-2 px-4 py-2 bg-chrome border-t border-border-dark text-[11px] font-bold">
                  <span className="font-mono text-[10.5px]">XE</span>
                  <span>RÉSULTAT NET DE L'EXERCICE (+excédent, −déficit)</span>
                  <span className="font-mono text-right">{montant(cr.resultatNet)}</span>
                  <span className="font-mono text-right text-text-dim font-normal">{montant(cr.resultatNetN1)}</span>
                </div>
              </div>

              <div
                className={`flex items-start gap-2 mt-3 px-3.5 py-2.5 border ${
                  cr.controle.coherent ? 'border-positive/30 bg-positive-soft' : 'border-danger/30 bg-danger-soft'
                }`}
              >
                <IconCheck
                  width={14}
                  height={14}
                  className={`mt-0.5 shrink-0 ${cr.controle.coherent ? 'text-positive' : 'text-danger'}`}
                />
                <span className="font-mono text-[10.5px] font-medium">
                  {cr.controle.coherent
                    ? "L'ÉTAT BOUCLE · le résultat des postes est identique au résultat logé au bilan"
                    : `ÉCART DE ${montant(cr.controle.ecart)} · l'état ne boucle pas avec le bilan`}
                </span>
              </div>

              {cr.comptesNonRattaches.length > 0 && (
                <div className="border border-danger/30 bg-danger-soft mt-2 px-3.5 py-2.5">
                  <div className="text-[10.5px] font-bold mb-1.5">
                    Comptes de gestion rattachés à aucun poste officiel · leur montant n'entre dans aucun total
                  </div>
                  {cr.comptesNonRattaches.map((c) => (
                    <div key={c.numero} className="flex justify-between text-[10.5px] font-mono">
                      <span>
                        {c.numero} · {c.intitule}
                      </span>
                      <span>{montant(c.montant)}</span>
                    </div>
                  ))}
                  <p className="text-[10px] text-text-dim mt-1.5 font-sans">
                    Saisir sur la subdivision prévue par le plan officiel (ex. 7051/7052/7053 plutôt que 705), ou
                    vérifier le numéro de compte.
                  </p>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {onglet === 'flux-tresorerie' && (
        <>
          {!tft && <div className="border border-border px-4 py-4 text-[11px] text-text-dim">Chargement…</div>}
          {tft && (
            <div className="max-w-[900px]">
              {!tft.exerciceN1Disponible && (
                <p className="text-[10px] text-text-dim mb-1.5">
                  Aucun exercice antérieur dans ce dossier : la colonne N-1 reste vide, ce n'est pas un zéro.
                </p>
              )}

              <div className="border border-border bg-surface shadow-posee">
                <div className="grid grid-cols-[46px_1fr_120px_120px] gap-2 px-4 py-1.5 bg-surface-alt border-b border-border text-[10px] font-bold text-text-dim">
                  <span>REF</span>
                  <span>LIBELLÉ</span>
                  <span className="text-right">EXERCICE N</span>
                  <span className="text-right">EXERCICE N-1</span>
                </div>
                {tft.lignes.map((l, i) =>
                  'section' in l ? (
                    <div key={`s${i}`} className="px-4 py-1 bg-chrome border-b border-border text-[10px] font-bold italic">
                      {l.section}
                    </div>
                  ) : (
                    ligneFlux(l)
                  ),
                )}
              </div>

              <div
                className={`flex flex-col gap-1 mt-3 px-3.5 py-2.5 border ${
                  tft.controle.coherent ? 'border-positive/30 bg-positive-soft' : 'border-danger/30 bg-danger-soft'
                }`}
              >
                <div className="flex items-start gap-2">
                  <IconCheck
                    width={14}
                    height={14}
                    className={`mt-0.5 shrink-0 ${tft.controle.coherent ? 'text-positive' : 'text-danger'}`}
                  />
                  <span className="font-mono text-[10.5px] font-medium">
                    {tft.controle.coherent
                      ? "L'ÉTAT BOUCLE · trésorerie de clôture identique par cumul des flux et par lecture du bilan"
                      : `ÉCART DE ${montant(tft.controle.ecart)} · la ventilation FA-FQ ne couvre pas tout le mouvement de trésorerie`}
                  </span>
                </div>
                <div className="pl-[22px] font-mono text-[10px] text-text-dim">
                  Trésorerie ouverture {montant(tft.controle.tresorerieOuverture)} + variation{' '}
                  {montant(tft.controle.variation)} = {montant(tft.controle.tresorerieClotureParFlux)} (par les flux) ·
                  bilan : {montant(tft.controle.tresorerieClotureParBilan)}
                </div>
              </div>

              {tft.comptesNonVentiles.length > 0 && (
                <div className="border border-danger/30 bg-danger-soft mt-2 px-3.5 py-2.5">
                  <div className="text-[10.5px] font-bold mb-1.5">
                    Comptes encaissables/décaissables rattachés à aucun poste de flux · cause probable de l'écart
                  </div>
                  {tft.comptesNonVentiles.map((c) => (
                    <div key={c.numero} className="flex justify-between text-[10.5px] font-mono">
                      <span>
                        {c.numero} · {c.intitule}
                      </span>
                      <span>{montant(c.montant)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {onglet === 'bilan-projet' && (
        <>
          {!bilanProjet && <div className="border border-border px-4 py-4 text-[11px] text-text-dim">Chargement…</div>}
          {bilanProjet && (
            <div className="max-w-[1180px] overflow-x-auto">
              {!bilanProjet.exerciceN1Disponible && (
                <p className="text-[10px] text-text-dim mb-1.5">
                  Aucun exercice antérieur dans ce dossier : la colonne N-1 reste vide, ce n'est pas un zéro.
                </p>
              )}

              {/* DEUX colonnes de valeur, pas quatre : le texte officiel de ce
                  jeu ne prévoit ni Brut ni Amortissements côté actif · voir
                  correspondance-projet-bilan.ts. Le rendu passif convient donc
                  aux deux volets. */}
              <div className="border border-border bg-surface mb-3">
                <div className="grid grid-cols-[42px_1.4fr_100px_100px] gap-2 px-4 py-1.5 bg-surface-alt border-b border-border text-[10px] font-bold text-text-dim">
                  <span>REF</span>
                  <span>ACTIF</span>
                  <span className="text-right">EXERCICE AU 31/12/N</span>
                  <span className="text-right">EXERCICE AU 31/12/N-1</span>
                </div>
                {bilanProjet.actif.map(lignePassif)}
              </div>

              <div className="border border-border bg-surface mb-3">
                <div className="grid grid-cols-[42px_1.4fr_100px_100px] gap-2 px-4 py-1.5 bg-surface-alt border-b border-border text-[10px] font-bold text-text-dim">
                  <span>REF</span>
                  <span>PASSIF</span>
                  <span className="text-right">EXERCICE AU 31/12/N</span>
                  <span className="text-right">EXERCICE AU 31/12/N-1</span>
                </div>
                {bilanProjet.passif.map(lignePassif)}
              </div>

              <div
                className={`flex items-center gap-2 px-3.5 py-2.5 border ${
                  bilanProjet.equilibre ? 'border-positive/30 bg-positive-soft' : 'border-danger/30 bg-danger-soft'
                }`}
              >
                <IconCheck width={14} height={14} className={bilanProjet.equilibre ? 'text-positive' : 'text-danger'} />
                <span className="font-mono text-[10.5px] font-medium">
                  {bilanProjet.equilibre
                    ? `LE BILAN EST ÉQUILIBRÉ · ACTIF = PASSIF = ${montant(bilanProjet.totalActif)}`
                    : 'DÉSÉQUILIBRE DÉTECTÉ · vérifier les écritures et les comptes non rattachés ci-dessous'}
                </span>
              </div>

              {bilanProjet.comptesNonRattaches.length > 0 && (
                <div className="border border-danger/30 bg-danger-soft mt-2 px-3.5 py-2.5">
                  <div className="text-[10.5px] font-bold mb-1.5">
                    Comptes de bilan rattachés à aucun poste officiel · leur montant n'entre dans aucun total
                  </div>
                  {bilanProjet.comptesNonRattaches.map((c) => (
                    <div key={c.numero} className="flex justify-between text-[10.5px] font-mono">
                      <span>
                        {c.numero} · {c.intitule}
                      </span>
                      <span>{montant(c.montant)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {onglet === 'compte-exploitation-projet' && (
        <>
          {!ceProjet && <div className="border border-border px-4 py-4 text-[11px] text-text-dim">Chargement…</div>}
          {ceProjet && (
            <div className="max-w-[900px]">
              {!ceProjet.exerciceN1Disponible && (
                <p className="text-[10px] text-text-dim mb-1.5">
                  Aucun exercice antérieur dans ce dossier : la colonne N-1 reste vide, ce n'est pas un zéro.
                </p>
              )}

              <div className="border border-border bg-surface shadow-posee">
                <div className="grid grid-cols-[46px_1fr_120px_120px] gap-2 px-4 py-1.5 bg-surface-alt border-b border-border text-[10px] font-bold text-text-dim">
                  <span>REF</span>
                  <span>LIBELLÉ</span>
                  <span className="text-right">MONTANT (N)</span>
                  <span className="text-right">MONTANT (N-1)</span>
                </div>
                {ceProjet.revenus.map((p, i) => lignePoste(p, `revenu-${i}`))}
                {ligneTotal('XA', 'REVENUS (Somme RA à RE)', ceProjet.totalRevenus, ceProjet.totalRevenusN1)}
                {ceProjet.charges.map((p, i) => lignePoste(p, `charge-${i}`))}
                <div className="grid grid-cols-[46px_1fr_120px_120px] gap-2 px-4 py-2 bg-chrome border-t border-border-dark text-[11px] font-bold">
                  <span className="font-mono text-[10.5px]">XB</span>
                  <span>CHARGES DE FONCTIONNEMENT (Somme TA à TL)</span>
                  <span className="font-mono text-right">{montant(ceProjet.totalCharges)}</span>
                  <span className="font-mono text-right text-text-dim font-normal">{montant(ceProjet.totalChargesN1)}</span>
                </div>
                <div className="grid grid-cols-[46px_1fr_120px_120px] gap-2 px-4 py-2 bg-chrome border-t border-border-dark text-[11px] font-bold">
                  <span className="font-mono text-[10.5px]">XC</span>
                  <span>SOLDE DES OPÉRATIONS DE L'EXERCICE (XA − XB)</span>
                  <span className="font-mono text-right">{montant(ceProjet.solde)}</span>
                  <span className="font-mono text-right text-text-dim font-normal">{montant(ceProjet.soldeN1)}</span>
                </div>
              </div>

              <div
                className={`flex items-start gap-2 mt-3 px-3.5 py-2.5 border ${
                  ceProjet.controle.boucleAZero ? 'border-positive/30 bg-positive-soft' : 'border-warning/40 bg-warning-soft'
                }`}
              >
                <IconCheck
                  width={14}
                  height={14}
                  className={`mt-0.5 shrink-0 ${ceProjet.controle.boucleAZero ? 'text-positive' : 'text-warning'}`}
                />
                <span className="font-mono text-[10.5px] font-medium">
                  {ceProjet.controle.boucleAZero
                    ? `XC = ${montant(ceProjet.solde)} (≈ 0) · régime normal pour ce jeu`
                    : `XC = ${montant(ceProjet.solde)} (≠ 0) · pas nécessairement une erreur, vérifier le compte 13 et les comptes non rattachés ci-dessous`}
                </span>
              </div>

              {ceProjet.comptesNonRattaches.length > 0 && (
                <div className="border border-danger/30 bg-danger-soft mt-2 px-3.5 py-2.5">
                  <div className="text-[10.5px] font-bold mb-1.5">
                    Comptes de gestion rattachés à aucun poste officiel · leur montant n'entre dans aucun total
                  </div>
                  {ceProjet.comptesNonRattaches.map((c) => (
                    <div key={c.numero} className="flex justify-between text-[10.5px] font-mono">
                      <span>
                        {c.numero} · {c.intitule}
                      </span>
                      <span>{montant(c.montant)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TABLEAU EMPLOIS-RESSOURCES · FA à GZ                            */}
      {/* ------------------------------------------------------------- */}
      {onglet === 'emplois-ressources' && (
        <>
          {!emploisRessources && <div className="border border-border px-4 py-4 text-[11px] text-text-dim">Chargement…</div>}
          {emploisRessources && (
            <div className="max-w-[1000px]">
              <div className="border border-border bg-surface mb-3">
                <div className="grid grid-cols-[42px_1fr_120px_120px_120px] gap-2 px-4 py-1.5 bg-surface-alt border-b border-border text-[10px] font-bold text-text-dim">
                  <span>REF</span>
                  <span>DÉSIGNATION</span>
                  <span className="text-right">MOUVEMENT BRUT</span>
                  <span className="text-right">CORRECTION</span>
                  <span className="text-right">EXERCICE N</span>
                </div>
                {emploisRessources.lignes.map((l, i) => (
                  <div
                    key={`${l.ref}-${i}`}
                    title={l.comptes.length > 0 ? `Comptes : ${l.comptes.map((c) => c.numero).join(', ')}` : undefined}
                    className={`grid grid-cols-[42px_1fr_120px_120px_120px] gap-2 px-4 py-1 text-[11px] ${
                      l.estTotal ? 'font-bold bg-surface-alt border-y border-border' : l.montant === 0 ? 'text-text-dim' : ''
                    }`}
                  >
                    <span className="font-mono text-[10px] text-text-dim">{l.ref}</span>
                    <span>{l.libelle}</span>
                    {/* Le brut et la correction ne sont affichés que là où le
                        guide en prévoit une : les lire ailleurs n'aurait pas
                        de sens. */}
                    <span className="font-mono text-right text-text-dim">
                      {l.brut !== undefined && l.correction !== undefined && Math.abs(l.correction) > 0.005 ? montant(l.brut) : ''}
                    </span>
                    <span className="font-mono text-right text-text-dim">
                      {l.correction !== undefined && Math.abs(l.correction) > 0.005 ? montant(l.correction) : ''}
                    </span>
                    <span className="font-mono text-right">{montant(l.montant)}</span>
                  </div>
                ))}
              </div>

              <div
                className={`flex items-start gap-2 px-3.5 py-2.5 border ${
                  emploisRessources.controle.boucle ? 'border-positive/30 bg-positive-soft' : 'border-danger/30 bg-danger-soft'
                }`}
              >
                <IconCheck width={14} height={14} className={emploisRessources.controle.boucle ? 'text-positive' : 'text-danger'} />
                <span className="font-mono text-[10.5px]">
                  {emploisRessources.controle.boucle
                    ? `CONTRÔLE OFFICIEL GZ · TOTAL V = TOTAL VI = ${montant(emploisRessources.encaisseDisponible)}`
                    : `CONTRÔLE OFFICIEL GZ EN ÉCHEC · écart de ${montant(emploisRessources.controle.ecart)} entre l'encaisse reconstituée et les fonds disponibles en fin d'exercice`}
                </span>
              </div>

              {emploisRessources.anomalies.length > 0 && (
                <div className="border border-warning/40 bg-warning-soft mt-2 px-3.5 py-2.5">
                  <div className="text-[10.5px] font-bold mb-1.5">
                    Répartition faussée entre postes · le total des emplois reste exact
                  </div>
                  {emploisRessources.anomalies.map((a) => (
                    <p key={a.ref} className="text-[10.5px] mb-1 last:mb-0">
                      {a.diagnostic}
                    </p>
                  ))}
                </div>
              )}

              {emploisRessources.avertissements.map((a) => (
                <p key={a} className="mt-2 text-[10px] text-text-dim">
                  {a}
                </p>
              ))}
            </div>
          )}
        </>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TABLEAU D'EXÉCUTION BUDGÉTAIRE · Section 2, et Note 24          */}
      {/* ------------------------------------------------------------- */}
      {onglet === 'execution-budgetaire' && (
        <>
          {erreurBudget && (
            <div className="border border-warning/40 bg-warning-soft px-3.5 py-2.5 text-[11px] max-w-[820px]">
              {erreurBudget}
            </div>
          )}
          {!executionBudget && !erreurBudget && (
            <div className="border border-border px-4 py-4 text-[11px] text-text-dim">Chargement…</div>
          )}
          {executionBudget && (
            <div className="max-w-[1160px] overflow-x-auto">
              <p className="text-[10px] text-text-dim mb-1.5">
                Nomenclature budgétaire : plan analytique{' '}
                <span className="font-mono">{executionBudget.plan.code}</span> · {executionBudget.plan.intitule}
              </p>
              <div className="border border-border bg-surface mb-3 min-w-[1060px]">
                <div className="grid grid-cols-[80px_1fr_120px_120px_120px_120px_120px_90px] gap-2 px-4 py-1.5 bg-surface-alt border-b border-border text-[10px] font-bold text-text-dim">
                  <span>CODE</span>
                  <span>LIBELLÉ</span>
                  <span className="text-right">BUDGET (1)</span>
                  <span className="text-right">DÉCAISSEMENT (2)</span>
                  <span className="text-right">ENGAGEMENT (3)</span>
                  <span className="text-right">RÉALISATION (4)</span>
                  <span className="text-right">CRÉDIT DISPO. (5)</span>
                  <span className="text-right">EXÉC. (4/1)</span>
                </div>
                {executionBudget.lignes.map((l) => (
                  <div
                    key={l.code}
                    className="grid grid-cols-[80px_1fr_120px_120px_120px_120px_120px_90px] gap-2 px-4 py-1 text-[11px]"
                  >
                    <span className="font-mono text-[10.5px]">{l.code}</span>
                    <span className="truncate">{l.libelle}</span>
                    <span className="font-mono text-right">{montant(l.budget)}</span>
                    <span className="font-mono text-right">{montant(l.decaissement)}</span>
                    <span className="font-mono text-right">{montant(l.engagement)}</span>
                    <span className="font-mono text-right">{montant(l.realisation)}</span>
                    <span className={`font-mono text-right ${l.creditDisponible < 0 ? 'text-danger font-semibold' : ''}`}>
                      {montant(l.creditDisponible)}
                    </span>
                    <span className="font-mono text-right text-text-dim">
                      {l.executionPourcent === null ? '·' : `${l.executionPourcent.toFixed(1)} %`}
                    </span>
                  </div>
                ))}
                {executionBudget.lignes.length === 0 && (
                  <div className="px-4 py-2 text-[10.5px] text-text-dim">
                    Ce plan analytique ne porte encore aucune section.
                  </div>
                )}
                <div className="grid grid-cols-[80px_1fr_120px_120px_120px_120px_120px_90px] gap-2 px-4 py-1.5 bg-surface-alt border-t border-border text-[11px] font-bold">
                  <span>TOTAL</span>
                  <span />
                  <span className="font-mono text-right">{montant(executionBudget.total.budget)}</span>
                  <span className="font-mono text-right">{montant(executionBudget.total.decaissement)}</span>
                  <span className="font-mono text-right">{montant(executionBudget.total.engagement)}</span>
                  <span className="font-mono text-right">{montant(executionBudget.total.realisation)}</span>
                  <span className="font-mono text-right">{montant(executionBudget.total.creditDisponible)}</span>
                  <span className="font-mono text-right">
                    {executionBudget.total.executionPourcent === null
                      ? '·'
                      : `${executionBudget.total.executionPourcent.toFixed(1)} %`}
                  </span>
                </div>
              </div>
              <p className="text-[10px] text-text-dim max-w-[900px]">{executionBudget.engagementsHorsComptabilite}</p>
            </div>
          )}
        </>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TABLEAU DE RÉCONCILIATION DE TRÉSORERIE · repères A à I         */}
      {/* ------------------------------------------------------------- */}
      {onglet === 'reconciliation-tresorerie' && (
        <div className="max-w-[760px]">
          <div className="ecran-seul flex items-end gap-2 border-x border-t border-border bg-surface px-4 pt-2.5 pb-2">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-bold text-text-dim" title="Chèques émis non encaissés, virements en cours · le repère H de la maquette officielle est extra-comptable">
                PAIEMENTS EN INSTANCE (REPÈRE H)
              </span>
              <input
                type="number"
                value={paiementsEnInstance}
                onChange={(e) => setPaiementsEnInstance(e.target.value)}
                className="border border-border-dark bg-surface px-2 py-1 text-[11px] font-mono w-[160px]"
              />
            </label>
            <button
              type="button"
              onClick={() => {
                if (!exerciceCourant) return;
                api
                  .get<TableauReconciliationTresorerie>(
                    `/etats-financiers/projet/reconciliation-tresorerie?exerciceId=${exerciceCourant.id}&paiementsEnInstance=${Number(paiementsEnInstance) || 0}`,
                  )
                  .then(setReconciliation, (e) => setErreur(e.message));
              }}
              className="border border-border-dark bg-chrome hover:bg-chrome-alt px-3 py-1 text-[10.5px]"
            >
              Établir le tableau
            </button>
          </div>

          {!reconciliation && (
            <div className="border border-border px-4 py-4 text-[11px] text-text-dim">
              Saisissez les paiements en instance puis établissez le tableau.
            </div>
          )}
          {reconciliation && (
            <>
              <div className="border border-border bg-surface mb-3">
                <div className="grid grid-cols-[1fr_44px_150px] gap-2 px-4 py-1.5 bg-surface-alt border-b border-border text-[10px] font-bold text-text-dim">
                  <span>LIBELLÉ</span>
                  <span className="text-center">REP.</span>
                  <span className="text-right">MONTANT</span>
                </div>
                {reconciliation.lignes.map((l) => (
                  <div
                    key={l.rep}
                    className={`grid grid-cols-[1fr_44px_150px] gap-2 px-4 py-1 text-[11px] ${
                      l.rep === 'G' || l.rep === 'I' ? 'font-bold bg-surface-alt border-y border-border' : ''
                    }`}
                  >
                    <span>{l.libelle}</span>
                    <span className="font-mono text-[10px] text-text-dim text-center">{l.rep}</span>
                    <span className="font-mono text-right">{montant(l.montant)}</span>
                  </div>
                ))}
              </div>
              <div
                className={`flex items-start gap-2 px-3.5 py-2.5 border ${
                  reconciliation.controle.boucle ? 'border-positive/30 bg-positive-soft' : 'border-danger/30 bg-danger-soft'
                }`}
              >
                <span className="text-[10.5px]">
                  {reconciliation.controle.boucle
                    ? `La trésorerie reconstituée (repère G) correspond au solde des comptes de trésorerie à la balance : ${montant(reconciliation.controle.tresorerieBalance)}.`
                    : `Écart de ${montant(reconciliation.controle.ecart)} entre la trésorerie reconstituée (G) et le solde des comptes de trésorerie à la balance (${montant(reconciliation.controle.tresorerieBalance)}).`}
                </span>
              </div>
              {reconciliation.avertissements.map((a) => (
                <p key={a} className="mt-2 text-[10px] text-text-dim">
                  {a}
                </p>
              ))}
            </>
          )}
        </div>
      )}

      {onglet === 'note-bailleur' && (
        <>
          {!noteBailleur && <div className="border border-border px-4 py-4 text-[11px] text-text-dim">Chargement…</div>}
          {noteBailleur && (
            <div className="max-w-[1000px] overflow-x-auto">
              <p className="text-[10px] text-text-dim mb-2">
                Un bailleur n'apparaît ici que si des comptes 162-164/462-464 lui sont rattachés · voir la page{' '}
                <a href="#/bailleurs" className="text-sel hover:underline">
                  Bailleurs
                </a>
                .
              </p>

              {(['Fonds d’investissement (162-164)', 'Fonds d’administration (462-464)'] as const).map((titre, idx) => {
                const lignes = idx === 0 ? noteBailleur.investissement : noteBailleur.administration;
                const nonAffecte = idx === 0 ? noteBailleur.investissementNonAffecte : noteBailleur.administrationNonAffecte;
                const total = idx === 0 ? noteBailleur.totalInvestissement : noteBailleur.totalAdministration;
                return (
                  <div key={titre} className="border border-border bg-surface mb-3">
                    <div className="px-4 py-1.5 bg-chrome border-b border-border text-[10.5px] font-bold">{titre}</div>
                    <div className="grid grid-cols-[1.4fr_130px_130px_130px] gap-2 px-4 py-1.5 bg-surface-alt border-b border-border text-[10px] font-bold text-text-dim">
                      <span>BAILLEUR</span>
                      <span className="text-right">DÉCAISSÉ</span>
                      <span className="text-right">CONSOMMÉ</span>
                      <span className="text-right">SOLDE RESTANT</span>
                    </div>
                    {lignes.length === 0 && (
                      <div className="px-4 py-3 text-[11px] text-text-dim">Aucun bailleur rattaché à ce type de fonds.</div>
                    )}
                    {lignes.map((l) => (
                      <div key={l.bailleur.id} className="grid grid-cols-[1.4fr_130px_130px_130px] gap-2 px-4 py-1 text-[11px]">
                        <span>
                          {l.bailleur.code} · {l.bailleur.nom}
                        </span>
                        <span className="font-mono text-right">{montant(l.decaisse)}</span>
                        <span className="font-mono text-right">{montant(l.consomme)}</span>
                        <span className="font-mono text-right">{montant(l.soldeRestant)}</span>
                      </div>
                    ))}
                    {(nonAffecte.decaisse !== 0 || nonAffecte.consomme !== 0 || nonAffecte.soldeRestant !== 0) && (
                      <div className="grid grid-cols-[1.4fr_130px_130px_130px] gap-2 px-4 py-1 text-[11px] text-danger bg-danger-soft italic">
                        <span>NON AFFECTÉ (comptes sans bailleur rattaché)</span>
                        <span className="font-mono text-right">{montant(nonAffecte.decaisse)}</span>
                        <span className="font-mono text-right">{montant(nonAffecte.consomme)}</span>
                        <span className="font-mono text-right">{montant(nonAffecte.soldeRestant)}</span>
                      </div>
                    )}
                    <div className="grid grid-cols-[1.4fr_130px_130px_130px] gap-2 px-4 py-1.5 bg-surface-alt border-t border-border text-[11px] font-bold">
                      <span>TOTAL</span>
                      <span className="font-mono text-right">{montant(total.decaisse)}</span>
                      <span className="font-mono text-right">{montant(total.consomme)}</span>
                      <span className="font-mono text-right">{montant(total.soldeRestant)}</span>
                    </div>
                  </div>
                );
              })}

              <div className="flex items-center gap-2 px-3.5 py-2.5 border border-border bg-chrome">
                <span className="font-mono text-[10.5px] font-medium">
                  TOTAL DES FONDS DU BAILLEUR · Décaissé {montant(noteBailleur.totalFondsDuBailleur.decaisse)} · Consommé{' '}
                  {montant(noteBailleur.totalFondsDuBailleur.consomme)} · Solde restant{' '}
                  {montant(noteBailleur.totalFondsDuBailleur.soldeRestant)}
                </span>
              </div>

              <p className="text-[10.5px] text-text-dim mt-3">
                NOTE 9 · Fonds du bailleur (SYCEBNL, Partie 4 ch. 3, Section 6). Montants <strong>cumulés depuis
                l'origine du projet</strong>, toutes périodes confondues : cette note suit le cycle de vie du projet,
                pas l'exercice comptable. Décaissé = mouvements crédit (hors report à-nouveau) ; Consommé =
                mouvements débit ; Solde restant = Décaissé − Consommé. Le texte officiel ne précise le compte
                source que pour « Consommé » côté Fonds d'administration (compte 702) · convention retenue pour le
                reste détaillée dans <code>EtatsFinanciersProjetService.noteBailleur</code>.
              </p>
            </div>
          )}
        </>
      )}

      {/* Encadré de signature · CPCC § 7.4 règle 7-b, imprimé uniquement. */}
      <BlocCertification />
    </div>
  );
}

/**
 * Aiguillage entre les trois jeux d'états financiers SYCEBNL. Le Système
 * Minimal de Trésorerie a son écran propre ; les deux jeux du Système normal
 * partagent celui-ci, qui bascule ses onglets selon le dossier.
 *
 * L'aiguillage est fait ICI, au-dessus des hooks des deux écrans, et non par
 * un `if` à l'intérieur d'un composant unique : les deux jeux n'appellent pas
 * les mêmes endpoints, et un rendu conditionnel après les hooks les lancerait
 * tous les deux.
 */
export function EtatsFinanciersPage() {
  const { utilisateur, chargement } = useAuth();
  // Tant que le profil n'est pas chargé, aucun des deux écrans ne doit partir :
  // le jeu par défaut est celui des associations, et un dossier S.M.T
  // interrogerait d'abord les endpoints du Système normal pour rien.
  if (chargement || !utilisateur) {
    return <div className="p-2.5 text-[11px] text-text-dim">Chargement…</div>;
  }
  return utilisateur.tenant.jeuEtatsFinanciersSycebnl === 'SYSTEME_MINIMAL_TRESORERIE' ? (
    <Suspense fallback={<div className="p-3 text-[11px] text-text-dim">Chargement…</div>}>
      <EtatsSmtPage />
    </Suspense>
  ) : (
    <EtatsSystemeNormalPage />
  );
}
