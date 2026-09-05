import { useEffect, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useExercice } from '../lib/exercice';
import { useAuth } from '../lib/auth';
import { IconExport, IconCheck } from '../components/chrome/icons';
import { Aide } from '../components/chrome/Aide';
import type { CleLexique } from '../lib/lexique';
import { BlocCertification, EnteteImpression } from '../components/chrome/EnteteImpression';
import { DECLARATION_METHODES_IDENTIQUES, RESERVE_JEU_INCOMPLET } from '../lib/situation-intermediaire';
import { LIBELLE_SYSTEME } from '../lib/systemes-syscohada';
import {
  estSectionFlux,
  type BilanSyscohada,
  type CompteDuPosteSyscohada,
  type CompteResultatSyscohada,
  type LigneBilanSyscohada,
  type LigneCompteResultatSyscohada,
  type LigneFluxSyscohada,
  type TableauFluxTresorerieSyscohada,
} from '../lib/types';

/**
 * ÉTATS FINANCIERS DU SYSCOHADA RÉVISÉ · Système normal.
 *
 * Trois onglets et pas un de plus : l'AUDCIF art. 8 énumère « le Bilan, le
 * Compte de résultat, le Tableau des flux de trésorerie ainsi que les Notes
 * annexes », et les Notes ont leur propre fenêtre (36 maquettes, colonnes
 * propres). Les trois états servis ici sont ceux du Titre IX, chapitres 3, 4
 * et 5 ; leur correspondance postes/comptes vient du ch. 7.
 *
 * Cet écran est le JUMEAU SYSCOHADA de `EtatsFinanciersPage` : même
 * disposition, mêmes contrôles, mêmes boutons d'export, parce qu'un cabinet
 * qui tient les deux sortes de dossiers ne doit pas réapprendre l'écran.
 * Rien d'autre n'est partagé · aucun poste, aucun compte, aucun libellé
 * SYCEBNL n'apparaît ici, et le vocabulaire est celui du SYSCOHADA
 * (bénéfice et perte, clients, et non excédent, déficit ou adhérents).
 *
 * Trois écarts de présentation avec l'écran SYCEBNL, tous imposés par le
 * texte, aucun par goût :
 *  1. une colonne NOTE sur le bilan et sur le compte de résultat · le modèle
 *     des ch. 3 et 4 la porte, et c'est elle qui relie l'état à ses notes
 *     annexes ;
 *  2. les charges du compte de résultat s'affichent NÉGATIVES · « les postes
 *     de charges (préfixe R) sont saisis en négatif ; les formules de
 *     totalisation sont des sommes, jamais des différences » (ch. 4 sect. 2).
 *     Les repasser en valeur absolue rendrait les formules X* incompréhensibles ;
 *  3. une colonne CLÉ sur le tableau des flux · les repères A à H du modèle
 *     du ch. 5 sect. 2, sans lesquels les formules imprimées (« G + A ») ne
 *     désignent rien.
 */

type Onglet = 'bilan' | 'compte-de-resultat' | 'flux-tresorerie';

/** Nom de l'état affiché · repris en sous-titre de l'en-tête d'impression. */
const LIBELLE_ONGLET: Record<Onglet, string> = {
  bilan: 'Bilan',
  'compte-de-resultat': 'Compte de résultat',
  'flux-tresorerie': 'Tableau des flux de trésorerie',
};

/** Segment de route d'export correspondant à l'onglet courant. */
const CHEMIN_EXPORT: Record<Onglet, string> = {
  bilan: 'bilan',
  'compte-de-resultat': 'compte-de-resultat',
  'flux-tresorerie': 'tableau-flux-tresorerie',
};

/**
 * Aide de chaque onglet · les textes vivent dans `lib/lexique.ts`, qui porte
 * les entrées des DEUX référentiels et cite pour chacune son texte officiel.
 * Cette table ne fait que dire quelle entrée va avec quel onglet : les clés
 * SYSCOHADA y sont suffixées, et servir ici une clé SYCEBNL afficherait la
 * règle d'un autre référentiel sur un état déposable (CLAUDE.md §6).
 */
const AIDE_ONGLET: Record<Onglet, CleLexique> = {
  bilan: 'bilanSyscohada',
  'compte-de-resultat': 'compteResultatSyscohada',
  'flux-tresorerie': 'tftSyscohada',
};

function EtatsSyscohadaSystemeNormal() {
  const { exerciceCourant } = useExercice();
  const { utilisateur } = useAuth();
  const navigate = useNavigate();

  const [onglet, setOnglet] = useState<Onglet>('bilan');

  const [bilan, setBilan] = useState<BilanSyscohada | null>(null);
  const [cr, setCr] = useState<CompteResultatSyscohada | null>(null);
  const [tft, setTft] = useState<TableauFluxTresorerieSyscohada | null>(null);

  const [erreur, setErreur] = useState<string | null>(null);
  const [exportEnCours, setExportEnCours] = useState(false);

  /**
   * Drill-down · un seul poste déplié à la fois, la clé portant l'onglet en
   * plus du REF : les trois états partagent des codes (ZA existe au TFT, AD
   * au bilan), et une clé sur le seul REF ferait s'ouvrir un poste dans un
   * autre onglet au retour.
   */
  const [posteDeplie, setPosteDeplie] = useState<string | null>(null);
  const basculerPoste = (cle: string) => setPosteDeplie((p) => (p === cle ? null : cle));

  /**
   * Attributs communs d'une ligne dépliable · factorisés pour que les quatre
   * rendus de ligne restent réellement identiques. Une ligne sans compte n'est
   * ni cliquable ni tabulable : un poste de totalisation, ou un poste que la
   * balance ne chiffre pas, n'a rien à déplier, et lui donner l'apparence d'un
   * bouton ferait chercher un détail qui n'existe pas.
   *
   * Le survol garde en plus la liste des numéros en info-bulle : c'est la
   * lecture rapide, le dépliage est la lecture chiffrée.
   */
  const attributsDrill = (cle: string, comptes: CompteDuPosteSyscohada[]) => {
    if (comptes.length === 0) return { classe: '' };
    return {
      classe: 'cursor-pointer hover:bg-surface-alt',
      role: 'button' as const,
      tabIndex: 0,
      'aria-expanded': posteDeplie === cle,
      title: `Comptes : ${comptes.map((c) => c.numero).join(', ')}`,
      onClick: () => basculerPoste(cle),
      onKeyDown: (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          basculerPoste(cle);
        }
      },
    };
  };

  /**
   * SITUATION INTERMÉDIAIRE · AUDCIF, Titre VIII ch. 39.
   *
   * Vide, les états portent l'exercice entier, comme toujours. Renseignée, la
   * lecture est bornée à cette date comptable · c'est ce qu'un cabinet monte
   * quand une banque ou un conseil d'administration demande une situation
   * semestrielle, et qui n'existait sous aucune forme.
   */
  const [arreteAu, setArreteAu] = useState('');

  // Drapeau `annule` : une réponse lente ne doit pas écraser un état plus
  // récent après un changement d'exercice.
  useEffect(() => {
    if (!exerciceCourant) return;
    let annule = false;
    const borne = arreteAu ? `&arreteAu=${arreteAu}` : '';
    api.get<BilanSyscohada>(`/etats-financiers-syscohada/bilan?exerciceId=${exerciceCourant.id}${borne}`).then(
      (r) => !annule && setBilan(r),
      (e) => !annule && setErreur(e.message),
    );
    api.get<CompteResultatSyscohada>(`/etats-financiers-syscohada/compte-de-resultat?exerciceId=${exerciceCourant.id}${borne}`).then(
      (r) => !annule && setCr(r),
      (e) => !annule && setErreur(e.message),
    );
    api
      .get<TableauFluxTresorerieSyscohada>(
        `/etats-financiers-syscohada/tableau-flux-tresorerie?exerciceId=${exerciceCourant.id}${borne}`,
      )
      .then(
        (r) => !annule && setTft(r),
        (e) => !annule && setErreur(e.message),
      );
    return () => {
      annule = true;
    };
  }, [exerciceCourant?.id, arreteAu]);

  /**
   * La liasse complète · c'est ce classeur qui se dépose, pas trois fichiers
   * recollés à la main. L'art. 8 fait des états financiers « un tout
   * indissociable » : le bouton principal est donc celui qui produit le tout,
   * et l'export de l'onglet courant reste l'action secondaire, utile pour
   * retravailler un état.
   */
  const exporterLiasse = async () => {
    if (!exerciceCourant) return;
    setErreur(null);
    setExportEnCours(true);
    try {
      await api.telecharger(
        `/exports/etats-financiers-syscohada/liasse-complete?exerciceId=${exerciceCourant.id}`,
        `liasse-syscohada-${new Date(exerciceCourant.dateDebut).getFullYear()}.xlsx`,
      );
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Échec de l'export de la liasse");
    } finally {
      setExportEnCours(false);
    }
  };

  const exporter = async () => {
    if (!exerciceCourant) return;
    setErreur(null);
    setExportEnCours(true);
    try {
      await api.telecharger(
        `/exports/etats-financiers-syscohada/${CHEMIN_EXPORT[onglet]}?exerciceId=${exerciceCourant.id}`,
        `${CHEMIN_EXPORT[onglet]}-syscohada.xlsx`,
      );
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Échec de l'export");
    } finally {
      setExportEnCours(false);
    }
  };

  // `undefined` n'est PAS zéro : sans exercice antérieur la colonne N-1 du
  // modèle reste vide, et un 0 y ferait croire à un exercice réel et nul.
  const montant = (v: number | undefined) =>
    v === undefined ? '·' : v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  /**
   * Détail des comptes d'un poste, déplié sous la ligne. Volontairement hors
   * de la grille de l'état : ses colonnes sont celles du modèle officiel, et
   * y glisser un tableau de comptes ferait passer une donnée de travail pour
   * une ligne de la maquette.
   */
  const detailComptes = (comptes: CompteDuPosteSyscohada[]) => (
    <div className="pl-12 pr-4 py-1.5 bg-surface-alt border-y border-border">
      {comptes.map((c) => (
        <div key={c.numero} className="flex justify-between gap-3 text-[10px] font-mono text-text-dim py-0.5">
          <span className="min-w-0 break-words">
            {c.numero} · {c.intitule}
          </span>
          <span className="shrink-0">{montant(c.montant)}</span>
        </div>
      ))}
    </div>
  );

  // --- Bilan actif · REF | ACTIF | NOTE | BRUT | AMORT. et DÉPREC. | NET | NET N-1
  //     (colonnes du modèle, Titre IX ch. 3 section 2) --------------------------
  const COLONNES_ACTIF = 'grid grid-cols-[42px_1.3fr_38px_98px_112px_98px_98px]';
  const ligneActif = (l: LigneBilanSyscohada) => {
    const cle = `bilan-actif-${l.ref}`;
    const deplie = posteDeplie === cle;
    const { classe, ...drill } = attributsDrill(cle, l.comptes);
    return (
      <div key={l.ref}>
        <div
          {...drill}
          className={`${COLONNES_ACTIF} gap-2 px-4 py-1 text-[11px] items-baseline ${
            l.estTotal ? 'font-bold bg-surface-alt border-y border-border' : ''
          } ${classe} ${deplie ? 'bg-surface-alt' : ''}`}
        >
          <span className="font-mono text-[10px] text-text-dim">{l.ref}</span>
          <span>
            {l.libelle}
            {/* Renvoi de bas de poste du modèle (AJ et AK) · le ch. 7 ne donne
                aucune correspondance de comptes pour le chiffrer, il reste
                donc une mention, jamais un montant. */}
            {l.renvoi && <span className="text-[9.5px] text-text-dim italic"> · {l.renvoi}</span>}
          </span>
          <span className="font-mono text-[10px] text-text-dim text-center">{l.note ?? ''}</span>
          <span className="font-mono text-right">{montant(l.brut)}</span>
          <span className="font-mono text-right text-text-dim">
            {l.amortissement ? `(${montant(l.amortissement)})` : montant(l.amortissement)}
          </span>
          <span className="font-mono text-right">{montant(l.montant)}</span>
          <span className="font-mono text-right text-text-dim font-normal">{montant(l.montantN1)}</span>
        </div>
        {deplie && detailComptes(l.comptes)}
      </div>
    );
  };

  // --- Bilan passif · REF | PASSIF | NOTE | NET | NET N-1 ---------------------
  //     Pas de colonne brute ni d'amortissements : le modèle du ch. 3 n'en
  //     prévoit qu'à l'actif.
  const COLONNES_PASSIF = 'grid grid-cols-[42px_1.3fr_38px_110px_110px]';
  const lignePassif = (l: LigneBilanSyscohada) => {
    const cle = `bilan-passif-${l.ref}`;
    const deplie = posteDeplie === cle;
    const { classe, ...drill } = attributsDrill(cle, l.comptes);
    return (
      <div key={l.ref}>
        <div
          {...drill}
          className={`${COLONNES_PASSIF} gap-2 px-4 py-1 text-[11px] items-baseline ${
            l.estTotal ? 'font-bold bg-surface-alt border-y border-border' : ''
          } ${classe} ${deplie ? 'bg-surface-alt' : ''}`}
        >
          <span className="font-mono text-[10px] text-text-dim">{l.ref}</span>
          <span>
            {l.libelle}
            {l.renvoi && <span className="text-[9.5px] text-text-dim italic"> · {l.renvoi}</span>}
          </span>
          <span className="font-mono text-[10px] text-text-dim text-center">{l.note ?? ''}</span>
          <span className="font-mono text-right">{montant(l.montant)}</span>
          <span className="font-mono text-right text-text-dim font-normal">{montant(l.montantN1)}</span>
        </div>
        {deplie && detailComptes(l.comptes)}
      </div>
    );
  };

  // --- Compte de résultat · REF | LIBELLÉ | NOTE | NET (N) | NET (N-1) --------
  const COLONNES_CR = 'grid grid-cols-[42px_1fr_46px_118px_118px]';
  const ligneCr = (l: LigneCompteResultatSyscohada) => {
    const cle = `cr-${l.ref}`;
    const deplie = posteDeplie === cle;
    const { classe, ...drill } = attributsDrill(cle, l.comptes);
    return (
      <div key={l.ref}>
        <div
          {...drill}
          className={`${COLONNES_CR} gap-2 px-4 py-1 text-[11px] items-baseline ${
            // Les lignes X* sont le cœur de la présentation « en liste » : le
            // ch. 4 les met « en cascade », l'écran les met en évidence.
            l.estSolde ? 'font-bold bg-surface-alt border-y border-border' : ''
          } ${l.montant === 0 && !l.estSolde ? 'text-text-dim' : ''} ${classe} ${
            deplie ? 'bg-surface-alt' : ''
          }`}
        >
          <span className="font-mono text-[10.5px] text-text-dim">{l.ref}</span>
          <span>
            {l.libelle}
            {/* Formule telle qu'imprimée au modèle · c'est elle qui justifie
                le montant, et elle vaut mieux qu'une explication reformulée. */}
            {l.formuleOfficielle && (
              <span className="text-[9.5px] text-text-dim italic font-normal"> ({l.formuleOfficielle})</span>
            )}
          </span>
          <span className="font-mono text-[10px] text-text-dim text-center font-normal">{l.notes.join(', ')}</span>
          <span className={`font-mono text-right ${l.montant < 0 ? 'text-danger' : ''}`}>{montant(l.montant)}</span>
          <span className="font-mono text-right text-text-dim font-normal">{montant(l.montantN1)}</span>
        </div>
        {deplie && detailComptes(l.comptes)}
      </div>
    );
  };

  // --- Tableau des flux · REF | LIBELLÉ | EXERCICE N | EXERCICE N-1 | CLÉ -----
  const COLONNES_TFT = 'grid grid-cols-[42px_1fr_118px_118px_38px]';
  const ligneFlux = (l: LigneFluxSyscohada) => {
    const cle = `tft-${l.ref}`;
    const deplie = posteDeplie === cle;
    const { classe, ...drill } = attributsDrill(cle, l.comptes);
    return (
      <div key={l.ref}>
        <div
          {...drill}
          className={`${COLONNES_TFT} gap-2 px-4 py-1 text-[11px] items-baseline ${
            l.estTotal || l.repere ? 'font-bold bg-surface-alt border-y border-border' : ''
          } ${classe} ${deplie ? 'bg-surface-alt' : ''}`}
        >
          <span className="font-mono text-[10.5px] text-text-dim">{l.ref}</span>
          <span>{l.libelle}</span>
          <span className="font-mono text-right">{montant(l.montant)}</span>
          <span className="font-mono text-right text-text-dim font-normal">{montant(l.montantN1)}</span>
          {/* Colonne CLÉ · les repères A à H du modèle. Sans eux, les formules
              imprimées (« somme FA à FE », « G + A ») ne désignent rien. */}
          <span className="font-mono text-[10px] text-center">{l.repere ?? ''}</span>
        </div>
        {deplie && detailComptes(l.comptes)}
      </div>
    );
  };

  const systeme = utilisateur?.tenant.systemeComptableSyscohada;

  return (
    <div className="p-2">
      <EnteteImpression
        titre="États financiers"
        sousTitre={
          arreteAu
            ? `${LIBELLE_ONGLET[onglet]} · situation intermédiaire arrêtée au ${arreteAu}`
            : LIBELLE_ONGLET[onglet]
        }
      />

      {/* CH. 39 · LES DEUX MENTIONS QUI FONT DE CETTE SITUATION AUTRE CHOSE
          QU'UN ÉTAT AMPUTÉ. Le § 2.1.1 exige la déclaration sur les méthodes,
          et le § 2.1 énumère des mentions qu'aucun solde ne porte : les servir
          en silence ferait passer une situation partielle pour le jeu complet
          du chapitre, ce qui est précisément le défaut à ne pas remplacer par
          un autre. Elles s'IMPRIMENT avec l'état, elles ne sont pas
          `ecran-seul`. */}
      {arreteAu && (
        <div className="border border-sel/30 bg-sel/5 rounded-[8px] px-3 py-2 mb-2 text-[10.5px] leading-[1.55] max-w-[980px]">
          <div className="font-bold mb-1">Situation intermédiaire arrêtée au {arreteAu}</div>
          <p className="mb-1">{DECLARATION_METHODES_IDENTIQUES}</p>
          <p className="text-text-dim">{RESERVE_JEU_INCOMPLET}</p>
        </div>
      )}
      <div className="ecran-seul flex flex-wrap items-start justify-between gap-2 mb-1.5">
        <div>
          <div className="text-[10px] font-mono text-text-dim leading-none">ÉTAT</div>
          <h1 className="text-[12px] font-bold leading-tight flex items-center gap-1.5">
            États financiers
            <Aide sujet="jeuEtatsSyscohada" />
          </h1>
          <div className="text-[10px] text-text-dim mt-0.5">
            SYSCOHADA révisé · Système normal <Aide sujet="systemeSyscohada" /> ·{' '}
            <button onClick={() => navigate('/parametres-dossier')} className="underline hover:text-sel">
              paramètres du dossier
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Vide = l'exercice entier · c'est le cas ordinaire, et il reste
              le défaut. Le champ ne se remplit que pour une situation. */}
          <label className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold text-text-dim">ARRÊTÉ AU</span>
            <input
              type="date"
              value={arreteAu}
              onChange={(e) => setArreteAu(e.target.value)}
              min={exerciceCourant?.dateDebut?.slice(0, 10)}
              max={exerciceCourant?.dateFin?.slice(0, 10)}
              title="Situation intermédiaire (ch. 39) · laissez vide pour l’exercice entier"
              className="border border-border rounded-[6px] bg-surface px-2 py-1 text-[10.5px]"
            />
            {arreteAu && (
              <button
                onClick={() => setArreteAu('')}
                title="Revenir à l’exercice entier"
                className="text-[10px] text-sel hover:underline"
              >
                Exercice entier
              </button>
            )}
          </label>
          {exerciceCourant && (
            <span className="font-mono text-[10.5px] border border-border bg-surface px-2.5 py-1.5">
              Exercice {new Date(exerciceCourant.dateDebut).getFullYear()}
            </span>
          )}
          <button
            onClick={exporterLiasse}
            disabled={exportEnCours}
            title="Tous les états du Système normal dans un seul classeur · les états financiers forment un tout indissociable (AUDCIF art. 8)"
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

      {/*
        Le dossier déclare son système (art. 11 et 13) et cette fenêtre sert
        celui du Système normal. Un dossier déclaré au Système minimal de
        trésorerie qui arrive ici doit le SAVOIR plutôt que d'imprimer un jeu
        qui n'est pas le sien : on le dit, sans rien masquer ni bloquer, le
        serveur servant les deux jeux à un dossier SYSCOHADA.
      */}
      {systeme === 'MINIMAL_TRESORERIE' && (
        <div className="ecran-seul border border-warning/40 bg-warning-soft px-3.5 py-2 mb-2 text-[10.5px]">
          Ce dossier est déclaré au {LIBELLE_SYSTEME.MINIMAL_TRESORERIE} (AUDCIF art. 11 et 13) : son jeu d'états est
          celui du Titre X, pas celui affiché ici. Les états ci-dessous sont ceux du Système normal, à ne déposer que si
          le dossier relève bien de ce système.
        </div>
      )}

      <div className="ecran-seul flex overflow-x-auto bg-chrome border border-border border-b-0">
        <button
          onClick={() => setOnglet('bilan')}
          className={`px-4 py-1.5 text-[10.5px] font-bold whitespace-nowrap ${
            onglet === 'bilan' ? 'bg-surface border-r border-border' : 'text-text-dim'
          }`}
        >
          BILAN
        </button>
        <button
          onClick={() => setOnglet('compte-de-resultat')}
          className={`px-4 py-1.5 text-[10.5px] font-bold whitespace-nowrap ${
            onglet === 'compte-de-resultat' ? 'bg-surface border-r border-l border-border' : 'text-text-dim'
          }`}
        >
          COMPTE DE RÉSULTAT
        </button>
        <button
          onClick={() => setOnglet('flux-tresorerie')}
          className={`px-4 py-1.5 text-[10.5px] font-bold whitespace-nowrap ${
            onglet === 'flux-tresorerie' ? 'bg-surface border-r border-l border-border' : 'text-text-dim'
          }`}
        >
          FLUX DE TRÉSORERIE
        </button>
      </div>

      {/* La définition AUDCIF de l'état affiché, à portée de clic. */}
      <div className="ecran-seul flex items-center gap-1.5 border-x border-t border-border bg-surface px-4 pt-2 text-[10px] text-text-dim">
        <span>Ce que dit le référentiel</span>
        <Aide sujet={AIDE_ONGLET[onglet]} />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* BILAN · AUDCIF Titre IX ch. 3, correspondance postes/comptes ch. 7  */}
      {/* ------------------------------------------------------------------ */}
      {onglet === 'bilan' && (
        <>
          {!bilan && <div className="border border-border px-4 py-4 text-[11px] text-text-dim">Chargement…</div>}
          {bilan && (
            <div className="max-w-[1180px]">
              {!bilan.exerciceN1Disponible && (
                <p className="text-[10px] text-text-dim mb-1.5">
                  Aucun exercice antérieur dans ce dossier : la colonne N-1 reste vide, ce n'est pas un zéro.
                </p>
              )}

              {/* Conteneur défilant · en dessous de 700 px l'actif ne tient
                  pas en sept colonnes, et un tableau comptable ne se replie
                  pas en cartes sans cesser d'être lisible. */}
              <div className="overflow-x-auto border border-border bg-surface mb-3">
                <div className="min-w-[700px]">
                  <div
                    className={`${COLONNES_ACTIF} gap-2 px-4 py-1.5 bg-surface-alt border-b border-border text-[10px] font-bold text-text-dim`}
                  >
                    <span>REF</span>
                    <span>ACTIF</span>
                    <span className="text-center">NOTE</span>
                    <span className="text-right">BRUT</span>
                    <span className="text-right">AMORT. ET DÉPREC.</span>
                    <span className="text-right">NET (N)</span>
                    <span className="text-right">NET (N-1)</span>
                  </div>
                  {bilan.actif.map(ligneActif)}
                </div>
              </div>

              <div className="overflow-x-auto border border-border bg-surface mb-3">
                <div className="min-w-[560px]">
                  <div
                    className={`${COLONNES_PASSIF} gap-2 px-4 py-1.5 bg-surface-alt border-b border-border text-[10px] font-bold text-text-dim`}
                  >
                    <span>REF</span>
                    <span>PASSIF</span>
                    <span className="text-center">NOTE</span>
                    <span className="text-right">NET (N)</span>
                    <span className="text-right">NET (N-1)</span>
                  </div>
                  {bilan.passif.map(lignePassif)}
                </div>
              </div>

              <div
                className={`flex items-start gap-2 px-3.5 py-2.5 border ${
                  bilan.equilibre ? 'border-positive/30 bg-positive-soft' : 'border-danger/30 bg-danger-soft'
                }`}
              >
                <IconCheck
                  width={14}
                  height={14}
                  className={`mt-0.5 shrink-0 ${bilan.equilibre ? 'text-positive' : 'text-danger'}`}
                />
                <span className="font-mono text-[10.5px] font-medium min-w-0 break-words">
                  {bilan.equilibre
                    ? `LE BILAN EST ÉQUILIBRÉ · BZ = DZ = ${montant(bilan.totalActif)}`
                    : `DÉSÉQUILIBRE DÉTECTÉ · total actif BZ ${montant(bilan.totalActif)} contre total passif DZ ${montant(
                        bilan.totalPassif,
                      )} · vérifier les écritures et les comptes non rattachés ci-dessous`}
                </span>
              </div>

              {/* Deux sources exclusives du résultat : les classes 6/7/8 avant
                  clôture, le compte 13 après. Les deux mouvementées à la fois,
                  c'est une balance intermédiaire · le résultat serait compté
                  deux fois et le bilan bouclerait quand même. */}
              {bilan.controle.doubleComptageProbable && (
                <div className="flex items-start gap-2 mt-2 px-3.5 py-2.5 border border-warning/40 bg-warning-soft">
                  <span className="text-[10.5px]">
                    Les classes 6/7/8 ({montant(bilan.controle.resultatClasses678)}) ET le compte 13 (
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
                    <div key={c.numero} className="flex justify-between gap-3 text-[10.5px] font-mono">
                      <span className="min-w-0 break-words">
                        {c.numero} · {c.intitule}
                      </span>
                      <span className="shrink-0">{montant(c.montant)}</span>
                    </div>
                  ))}
                  <p className="text-[10px] text-text-dim mt-1.5 font-sans">
                    Saisir sur la subdivision prévue par le plan officiel, ou vérifier le numéro de compte. Cinq
                    familles y figurent par construction du texte et non par erreur de saisie : le 130 (résultat de
                    l'exercice précédent en instance d'affectation, que ni CJ, qui prend les 131 à 139, ni CH ne
                    reçoit tant que l'assemblée n'a pas statué), les 186 à 188 (comptes de liaison, auxquels le ch. 7
                    ne donne aucun poste) et les 585 et 588 (virements internes, que le Titre VII impose de solder à
                    la clôture).
                  </p>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* COMPTE DE RÉSULTAT · AUDCIF Titre IX ch. 4, présentation EN LISTE   */}
      {/* ------------------------------------------------------------------ */}
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
              <p className="text-[10px] text-text-dim mb-1.5">
                Les charges sont affichées EN NÉGATIF et les lignes X* sont des sommes, jamais des différences (Titre IX
                ch. 4 section 2). Huit des neuf lignes X* sont les soldes intermédiaires de gestion interprétés par la
                section 1 · XB, le chiffre d'affaires, est un agrégat de ventes (A + B + C + D) et n'en fait pas partie.
              </p>

              <div className="overflow-x-auto border border-border bg-surface shadow-posee">
                <div className="min-w-[600px]">
                  <div
                    className={`${COLONNES_CR} gap-2 px-4 py-1.5 bg-surface-alt border-b border-border text-[10px] font-bold text-text-dim`}
                  >
                    <span>REF</span>
                    <span>LIBELLÉS</span>
                    <span className="text-center">NOTE</span>
                    <span className="text-right">NET (N)</span>
                    <span className="text-right">NET (N-1)</span>
                  </div>
                  {cr.lignes.map(ligneCr)}
                </div>
              </div>

              {/* Le résultat net XI doit être identique au résultat obtenu en
                  soldant TOUS les comptes de gestion, celui que le bilan loge
                  en CJ. L'écart vaut exactement la somme des comptes non
                  rattachés listés dessous. */}
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
                <span className="font-mono text-[10.5px] font-medium min-w-0 break-words">
                  {cr.controle.coherent
                    ? `L'ÉTAT BOUCLE · résultat net XI ${montant(cr.soldes.resultatNet)} (${
                        cr.soldes.resultatNet < 0 ? 'perte' : 'bénéfice'
                      }) identique au solde de toutes les classes de gestion`
                    : `ÉCART DE ${montant(cr.controle.ecart)} · le résultat net XI ${montant(
                        cr.soldes.resultatNet,
                      )} diffère du solde de toutes les classes de gestion ${montant(
                        cr.controle.resultatToutesClassesDeGestion,
                      )}`}
                </span>
              </div>

              {cr.comptesNonRattaches.length > 0 && (
                <div className="border border-danger/30 bg-danger-soft mt-2 px-3.5 py-2.5">
                  <div className="text-[10.5px] font-bold mb-1.5">
                    Comptes de gestion rattachés à aucun poste officiel · leur montant n'entre dans aucun total
                  </div>
                  {cr.comptesNonRattaches.map((c) => (
                    <div key={c.numero} className="flex justify-between gap-3 text-[10.5px] font-mono">
                      <span className="min-w-0 break-words">
                        {c.numero} · {c.intitule}
                      </span>
                      <span className="shrink-0">{montant(c.montant)}</span>
                    </div>
                  ))}
                  <p className="text-[10px] text-text-dim mt-1.5 font-sans">
                    Saisir sur la subdivision prévue par le plan officiel, ou vérifier le numéro de compte.
                  </p>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* TABLEAU DES FLUX · AUDCIF Titre IX ch. 5, repères A à H            */}
      {/* ------------------------------------------------------------------ */}
      {onglet === 'flux-tresorerie' && (
        <>
          {!tft && <div className="border border-border px-4 py-4 text-[11px] text-text-dim">Chargement…</div>}
          {tft && (
            <div className="max-w-[900px]">
              {!tft.exerciceN1Disponible && (
                <p className="text-[10px] text-text-dim mb-1.5">
                  Aucun exercice antérieur dans ce dossier : la colonne N-1 reste vide, ce n'est pas un zéro. Un
                  tableau de flux comparatif demande d'ailleurs TROIS exercices, ses deux colonnes étant elles-mêmes
                  faites de variations.
                </p>
              )}

              <div className="overflow-x-auto border border-border bg-surface shadow-posee">
                <div className="min-w-[600px]">
                  <div
                    className={`${COLONNES_TFT} gap-2 px-4 py-1.5 bg-surface-alt border-b border-border text-[10px] font-bold text-text-dim`}
                  >
                    <span>REF</span>
                    <span>LIBELLÉS</span>
                    <span className="text-right">EXERCICE N</span>
                    <span className="text-right">EXERCICE N-1</span>
                    <span className="text-center">CLÉ</span>
                  </div>
                  {tft.lignes.map((l, i) =>
                    estSectionFlux(l) ? (
                      <div
                        key={`s${i}`}
                        className="px-4 py-1 bg-chrome border-b border-border text-[10px] font-bold italic"
                      >
                        {l.section}
                      </div>
                    ) : (
                      ligneFlux(l)
                    ),
                  )}
                </div>
              </div>

              {/* Le SEUL bouclage imposé par le modèle : ZH par le cumul des
                  flux face à ZH lu au bilan (trésorerie-actif moins
                  trésorerie-passif). L'écart est présenté, jamais corrigé ·
                  il chiffre exactement ce que la ventilation FA à FQ ne
                  couvre pas. */}
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
                  <span className="font-mono text-[10.5px] font-medium min-w-0 break-words">
                    {tft.controle.coherent
                      ? "CONTRÔLE ZH VÉRIFIÉ · trésorerie nette au 31 décembre identique par le cumul des flux et par lecture du bilan"
                      : `ÉCART DE ${montant(tft.controle.ecart)} · la ventilation FA à FQ ne couvre pas tout le mouvement de trésorerie`}
                  </span>
                </div>
                <div className="pl-[22px] font-mono text-[10px] text-text-dim break-words">
                  ZA {montant(tft.controle.tresorerieOuverture)} + ZG {montant(tft.controle.variation)} = ZH{' '}
                  {montant(tft.controle.tresorerieClotureParFlux)} (par les flux) · contrôle par le bilan :{' '}
                  {montant(tft.controle.tresorerieClotureParBilan)}
                </div>
              </div>

              {/* Un poste qu'on ne peut pas chiffrer est NOMMÉ avec sa raison,
                  jamais servi à zéro : un zéro se lirait comme un montant
                  constaté, et c'est ainsi qu'un tableau faux passe un
                  contrôle. */}
              {tft.postesNonCalculables.length > 0 && (
                <div className="border border-warning/40 bg-warning-soft mt-2 px-3.5 py-2.5">
                  <div className="text-[10.5px] font-bold mb-1.5">
                    Postes que la balance ne permet pas de chiffrer, ou pas entièrement
                  </div>
                  {tft.postesNonCalculables.map((p) => (
                    <p key={p.ref} className="text-[10.5px] mb-1 last:mb-0">
                      <span className="font-mono">{p.ref}</span> · {p.raison}
                    </p>
                  ))}
                </div>
              )}

              {tft.comptesNonVentiles.length > 0 && (
                <div className="border border-danger/30 bg-danger-soft mt-2 px-3.5 py-2.5">
                  <div className="text-[10.5px] font-bold mb-1.5">
                    Comptes de bilan mouvementés que le tableau ne ventile nulle part · cause probable de l'écart
                  </div>
                  {tft.comptesNonVentiles.map((c) => (
                    <div key={c.numero} className="flex justify-between gap-3 text-[10.5px] font-mono">
                      <span className="min-w-0 break-words">
                        {c.numero} · {c.intitule}
                      </span>
                      <span className="shrink-0">{montant(c.montant)}</span>
                    </div>
                  ))}
                </div>
              )}
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
 * Composant exporté. Le garde-fou de référentiel est ici, au-dessus des
 * hooks de l'écran : un dossier SYCEBNL n'a rien à faire dans les états du
 * Titre IX, et le contrôleur serveur le refuse déjà
 * (`@ReferentielsAutorises(SYSCOHADA)`). Masquer sans refuser, ou refuser
 * sans masquer, laisserait un des deux verrous exigés par CLAUDE.md §6
 * inopérant · celui-ci est le verrou client.
 */
export function EtatsFinanciersSyscohadaPage() {
  const { utilisateur, chargement } = useAuth();
  // Tant que le profil n'est pas chargé, l'écran ne part pas : le référentiel
  // n'est pas encore connu, et interroger les routes SYSCOHADA depuis un
  // dossier SYCEBNL ne produirait qu'un 403 affiché en rouge.
  if (chargement || !utilisateur) {
    return <div className="p-2.5 text-[11px] text-text-dim">Chargement…</div>;
  }
  if (utilisateur.tenant.referentiel !== 'SYSCOHADA') {
    return (
      <div className="p-2.5">
        <div className="border border-border bg-surface px-4 py-3 text-[11px] max-w-[640px]">
          Cette fenêtre présente les états financiers de l'AUDCIF (Titre IX), réservés aux dossiers tenus en SYSCOHADA.
          Ce dossier est tenu en {utilisateur.tenant.referentiel} : ses états financiers ont leur propre fenêtre, avec
          d'autres postes et d'autres notes.
        </div>
      </div>
    );
  }
  return <EtatsSyscohadaSystemeNormal />;
}
