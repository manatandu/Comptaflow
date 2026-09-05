import { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useExercice } from '../lib/exercice';
import { useAuth } from '../lib/auth';
import { IconFilter, IconExport } from '../components/chrome/icons';
import { ModaleCorrection } from '../components/ModaleCorrection';
import type { Ecriture, Journal, LigneBalance, LigneGrandLivre } from '../lib/types';
import { EnteteImpression } from '../components/chrome/EnteteImpression';

type Onglet = 'journal' | 'grand-livre' | 'balance';

/**
 * Grille de la balance à six colonnes · deux colonnes de repérage (numéro,
 * intitulé) puis trois couples débit/crédit de largeur égale. Une seule
 * définition, partagée par l'en-tête, les lignes et le pied : trois copies
 * d'une même grille finissent toujours par diverger d'une colonne.
 */
const GRILLE_BALANCE = 'grid-cols-[80px_1fr_repeat(6,92px)]';

/** Grille du grand livre · même définition pour l'en-tête, les lignes et le pied. */
const GRILLE_GL = 'grid-cols-[66px_40px_54px_1.8fr_92px_92px_98px_54px_1fr]';

/** Un compte du grand livre complet, tel que le sert `GET /ecritures/grand-livre`. */
interface SectionGrandLivre {
  compte: { id: string; numero: string; intitule: string };
  lignes: LigneGrandLivre[];
  soldeFinal: number;
  totalDebit: number;
  totalCredit: number;
}

/** Une cellule de montant · le zéro reste VIDE, comme sur une balance imprimée. */
function Montant({ valeur }: { valeur: number }) {
  return <span className="font-mono text-right">{valeur ? valeur.toLocaleString('fr-FR') : ''}</span>;
}

function estOnglet(v: string | null): v is Onglet {
  return v === 'journal' || v === 'grand-livre' || v === 'balance';
}

interface Filtres {
  journalId: string;
  dateDebut: string;
  dateFin: string;
  recherche: string;
  /**
   * Le journal est un état de TRAVAIL : il montre le brouillard par défaut,
   * marqué comme tel. Décoché, il donne le livre-journal seul · c'est cette
   * vue-là qui s'imprime et qui fait foi.
   */
  inclureBrouillard: boolean;
}

const FILTRES_VIDES: Filtres = {
  journalId: '',
  dateDebut: '',
  dateFin: '',
  recherche: '',
  inclureBrouillard: true,
};

/** Construit la query string commune à la consultation et à l'export. */
function versQuery(exerciceId: string, filtres: Filtres): string {
  const params = new URLSearchParams({ exerciceId });
  if (filtres.journalId) params.set('journalId', filtres.journalId);
  if (filtres.dateDebut) params.set('dateDebut', filtres.dateDebut);
  if (filtres.dateFin) params.set('dateFin', filtres.dateFin);
  if (filtres.recherche) params.set('recherche', filtres.recherche);
  if (!filtres.inclureBrouillard) params.set('inclureBrouillard', 'false');
  return params.toString();
}

/** Lit `?onglet=…` dans une adresse, avec repli sur l'onglet Journal. */
function ongletDe(adresse: string | undefined): Onglet {
  const brut = new URLSearchParams(adresse?.split('?')[1] ?? '').get('onglet');
  return estOnglet(brut) ? brut : 'journal';
}

export function JournalPage({ adresse }: { adresse?: string } = {}) {
  const { exerciceCourant } = useExercice();
  /*
    L'onglet vient de l'adresse de la FENÊTRE (`?onglet=…`), pour que les
    commandes « État → Journal / Grand livre / Balance » et la barre d'outils
    ouvrent directement le bon état, comme le menu État de Sage.

    Il est ensuite tenu en état local, et NON relu dans l'URL à chaque rendu :
    depuis le multi-fenêtres, l'URL ne décrit que la fenêtre ACTIVE. Un
    journal laissé ouvert en arrière-plan y lirait l'adresse d'une autre
    fenêtre et changerait d'onglet tout seul. L'effet ci-dessous resynchronise
    lorsque le menu redemande explicitement un onglet.
  */
  const [onglet, setOnglet] = useState<Onglet>(() => ongletDe(adresse));
  useEffect(() => {
    setOnglet(ongletDe(adresse));
  }, [adresse]);
  const [ecritures, setEcritures] = useState<Ecriture[]>([]);
  const [totaux, setTotaux] = useState({ debit: 0, credit: 0 });
  /** Servi quand la fenêtre ne montre qu'une tranche du journal. */
  const [troncature, setTroncature] = useState<{ montrees: number; total: number } | null>(null);
  const [balance, setBalance] = useState<LigneBalance[]>([]);
  const [journaux, setJournaux] = useState<Journal[]>([]);
  const [compteGrandLivreId, setCompteGrandLivreId] = useState('');
  const [grandLivre, setGrandLivre] = useState<SectionGrandLivre[] | null>(null);

  // `filtres` est l'état des champs ; `filtresAppliques` ce qui a réellement
  // été envoyé au serveur. Les séparer évite de relancer une requête à
  // chaque frappe dans le champ de recherche.
  const [filtres, setFiltres] = useState<Filtres>(FILTRES_VIDES);
  const [filtresAppliques, setFiltresAppliques] = useState<Filtres>(FILTRES_VIDES);
  const [filtresOuverts, setFiltresOuverts] = useState(false);

  // « Rechercher » de la barre d'outils = la Recherche d'écritures de Sage ·
  // ici, le panneau de filtres du journal (période, compte, montant). Il
  // n'existe que sur l'onglet Journal : sur la balance et le grand livre, le
  // verbe reste grisé, ce qui est exact.

  const [erreur, setErreur] = useState<string | null>(null);
  // Une correction (art. 20 de l'AUDCIF) change à la fois le journal, la
  // balance et le grand livre : ce compteur, ajouté aux dépendances des trois
  // effets, les recharge tous les trois. Recharger le seul journal laisserait
  // à l'écran une balance qui contient encore le compte annulé.
  const [rechargement, setRechargement] = useState(0);
  const charger = () => setRechargement((n) => n + 1);
  const { utilisateur } = useAuth();
  const peutCorriger = utilisateur?.role === 'ADMIN_CABINET' || utilisateur?.role === 'COMPTABLE';
  // L'écriture dont on demande la correction · `null` tant que la boîte est
  // fermée. Elle porte le libellé pour que la boîte puisse nommer ce qu'elle
  // s'apprête à annuler, plutôt que de dire « cette écriture ».
  const [aCorriger, setACorriger] = useState<{ id: string; libelle: string } | null>(null);
  const [correctionEnCours, setCorrectionEnCours] = useState(false);

  useEffect(() => {
    let annule = false;
    api.get<Journal[]>('/journaux').then(
      (r) => !annule && setJournaux(r),
      (e) => !annule && setErreur(e.message),
    );
    return () => {
      annule = true;
    };
  }, []);

  // Chaque effet pose son drapeau `annule` : sans lui, une réponse lente
  // partie en premier écrase à son arrivée une réponse plus récente déjà
  // affichée. Sur le grand livre, cela affichait les lignes ET LE SOLDE d'un
  // compte sous le nom d'un autre · une faute lourde sur un logiciel
  // comptable, et rien à l'écran ne l'aurait signalée.
  useEffect(() => {
    // L'onglet Journal seul charge les écritures · ouvrir la fenêtre sur la
    // Balance ne doit plus tirer les trois jeux de données d'un coup.
    if (!exerciceCourant || onglet !== 'journal') return;
    let annule = false;
    const query = versQuery(exerciceCourant.id, filtresAppliques);
    api
      .get<{
        ecritures: Ecriture[];
        totaux: { debit: number; credit: number };
        total: number;
        tronque: boolean;
        plafond: number;
      }>(`/ecritures?${query}`)
      .then(
      (r) => {
        if (annule) return;
        setEcritures(r.ecritures);
        setTotaux(r.totaux);
        // LE DIRE, TOUJOURS · un journal qui montre 2 000 écritures sur
        // 40 000 sans le signaler fait conclure à un journal de 2 000
        // écritures. Les totaux, eux, restent ceux du journal entier (agrégat
        // SQL côté serveur), donc l'écran est cohérent : la tranche ne les
        // explique pas, et c'est justement ce que cette phrase annonce.
        setTroncature(r.tronque ? { montrees: r.ecritures.length, total: r.total } : null);
      },
      (e) => !annule && setErreur(e.message),
    );
    return () => {
      annule = true;
    };
  }, [exerciceCourant?.id, filtresAppliques, rechargement, onglet]);

  useEffect(() => {
    if (!exerciceCourant || onglet !== 'balance') return;
    let annule = false;
    api.get<{ lignes: LigneBalance[] }>(`/ecritures/balance?exerciceId=${exerciceCourant.id}`).then(
      (r) => !annule && setBalance(r.lignes),
      (e) => !annule && setErreur(e.message),
    );
    return () => {
      annule = true;
    };
  }, [exerciceCourant?.id, rechargement, onglet]);

  // Le grand livre COMPLET est chargé une fois par visite de l'onglet · le
  // filtre par compte travaille ensuite sur ce qui est déjà là, sans requête
  // supplémentaire : changer de compte est instantané.
  useEffect(() => {
    if (!exerciceCourant || onglet !== 'grand-livre') return;
    let annule = false;
    setGrandLivre(null);
    api.get<SectionGrandLivre[]>(`/ecritures/grand-livre?exerciceId=${exerciceCourant.id}`).then(
      (r) => !annule && setGrandLivre(r),
      (e) => !annule && setErreur(e.message),
    );
    return () => {
      annule = true;
    };
  }, [exerciceCourant?.id, onglet, rechargement]);

  const sectionsAffichees = useMemo(
    () => (grandLivre ?? []).filter((c) => !compteGrandLivreId || c.compte.id === compteGrandLivreId),
    [grandLivre, compteGrandLivreId],
  );

  const filtreActif = useMemo(
    () => Object.values(filtresAppliques).some((v) => v !== ''),
    [filtresAppliques],
  );

  // `api.telecharger` rejette sur 403 (licence expirée), 400 ou 500. Sans ce
  // `catch`, la promesse partait dans le vide : aucun fichier ne se
  // téléchargeait et AUCUN message n'apparaissait · l'utilisateur reclique
  // sans comprendre.
  const [exportEnCours, setExportEnCours] = useState(false);
  const lancerExport = async (chemin: string, nomParDefaut: string) => {
    setErreur(null);
    setExportEnCours(true);
    try {
      await api.telecharger(chemin, nomParDefaut);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Échec de l'export");
    } finally {
      setExportEnCours(false);
    }
  };

  const exporterJournal = () => {
    if (!exerciceCourant) return;
    // Le journal exporté est exactement celui affiché, filtres compris.
    lancerExport(`/exports/journal?${versQuery(exerciceCourant.id, filtresAppliques)}`, 'journal.xlsx');
  };
  const exporterBalance = () => {
    if (!exerciceCourant) return;
    lancerExport(`/exports/balance?exerciceId=${exerciceCourant.id}`, 'balance.xlsx');
  };
  const exporterGrandLivreDuCompte = () => {
    if (!exerciceCourant || !compteGrandLivreId) return;
    lancerExport(`/exports/grand-livre/${compteGrandLivreId}?exerciceId=${exerciceCourant.id}`, 'grand-livre.xlsx');
  };
  const exporterGrandLivreComplet = () => {
    if (!exerciceCourant) return;
    lancerExport(`/exports/grand-livre?exerciceId=${exerciceCourant.id}`, 'grand-livre-complet.xlsx');
  };

  const lignesJournal = useMemo(() => ecritures.flatMap((e) =>
    e.lignes.map((l, indexLigne) => ({
      date: e.date,
      journal: e.journal?.code ?? '',
      libelle: e.libelle,
      // Libellé au niveau de la LIGNE (celui saisi ligne à ligne), à défaut
      // celui de la pièce · même règle que l'édition du journal chez Sage.
      libelleLigne: l.libelle ?? e.libelle,
      compte: l.compte ? `${l.compte.numero} · ${l.compte.intitule}` : l.compteId,
      compteNumero: l.compte?.numero ?? '',
      debit: Number(l.debit),
      credit: Number(l.credit),
      // Le n° de pièce est celui attribué par le journal ; `reference` est la
      // pièce justificative externe. L'export Excel a deux colonnes
      // distinctes · l'écran affichait `reference` sous l'en-tête « PIÈCE »,
      // si bien que l'écran et le fichier ne nommaient pas la même chose.
      numeroPiece: e.numeroPiece,
      reference: e.reference,
      key: l.id,
      // État de correction (art. 20 de l'AUDCIF), porté par l'ÉCRITURE et
      // rendu sur sa PREMIÈRE ligne seulement : le journal est ici présenté
      // ligne à ligne, répéter l'état sur chacune donnerait à lire autant de
      // corrections qu'il y a de lignes.
      ecritureId: e.id,
      premiereLigne: indexLigne === 0,
      annuleePar: e.correction ?? null,
      corrige: e.corrigeEcriture ?? null,
      motifCorrection: e.motifCorrection,
      estGenereeParCloture: e.estGenereeParCloture ?? false,
      enBrouillard: e.statut === 'BROUILLARD',
    })),
  ), [ecritures]);

  /**
   * CORRECTION D'ERREUR PAR INSCRIPTION EN NÉGATIF · art. 20 de l'AUDCIF,
   * repris par la Partie 2 ch. 2 du SYCEBNL : « les documents comptables
   * doivent être tenus sans blanc ni altération d'aucune sorte. Toute
   * correction d'erreur commise et découverte sur l'exercice en cours,
   * s'effectue exclusivement par l'inscription en négatif des éléments
   * erronés ; l'enregistrement exact est ensuite opéré. »
   *
   * D'où l'absence, ici comme côté serveur, de toute action « Modifier » ou
   * « Supprimer » sur une écriture : ce serait l'altération que le texte
   * proscrit. L'écriture erronée RESTE au journal, signalée comme annulée ·
   * c'est la trace qui fait foi.
   */
  const corriger = async (motif: string) => {
    if (!aCorriger) return;
    setErreur(null);
    setCorrectionEnCours(true);
    try {
      await api.post(`/ecritures/${aCorriger.id}/correction`, { motifCorrection: motif });
      setACorriger(null);
      charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Correction impossible');
    } finally {
      setCorrectionEnCours(false);
    }
  };

  const etatCorrection = (l: {
    ecritureId: string;
    libelle: string;
    annuleePar: { numeroPiece: number | null } | null;
    corrige: { numeroPiece: number | null } | null;
    motifCorrection: string | null;
    estGenereeParCloture: boolean;
  }) => {
    if (l.annuleePar) {
      return (
        <span className="text-danger font-semibold" title="Annulée par inscription en négatif (art. 20 AUDCIF)">
          Annulée ▸ pièce {l.annuleePar.numeroPiece ?? '·'}
        </span>
      );
    }
    if (l.corrige) {
      return (
        <span className="text-text-dim italic" title={l.motifCorrection ?? undefined}>
          Correction ▸ pièce {l.corrige.numeroPiece ?? '·'}
        </span>
      );
    }
    if (!peutCorriger || l.estGenereeParCloture) return null;
    return (
      <button onClick={() => setACorriger({ id: l.ecritureId, libelle: l.libelle })} className="text-sel hover:underline">
        Corriger
      </button>
    );
  };

  const boutonExport = (label: string, onClick: () => void, principal = true) => (
    <button
      onClick={onClick}
      disabled={exportEnCours}
      className={`flex items-center gap-1.5 border border-border px-3 py-1.5 text-[10.5px] font-bold hover:bg-surface-alt disabled:opacity-50 disabled:cursor-wait ${
        principal ? 'bg-surface' : 'bg-chrome'
      }`}
    >
      <IconExport width={13} height={13} />
      {exportEnCours ? 'Export en cours…' : label}
    </button>
  );

  return (
    <div className="p-2">
      <EnteteImpression titre="Journal, grand livre et balance" />
      <div className="flex items-center justify-between mb-1.5 gap-2">
        <div>
          <div className="text-[10px] font-mono text-text-dim leading-none">ÉTAT</div>
          <h1 className="text-[12px] font-bold leading-tight">
            {onglet === 'journal' ? 'Journal' : onglet === 'grand-livre' ? 'Grand livre des comptes' : 'Balance des comptes'}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {onglet === 'journal' && (
            <button
              onClick={() => setFiltresOuverts((v) => !v)}
              className={`flex items-center gap-1.5 border border-border px-3 py-1.5 text-[10.5px] font-bold hover:bg-surface-alt ${
                filtreActif ? 'bg-warning-soft border-warning/40' : 'bg-surface'
              }`}
            >
              <IconFilter width={13} height={13} />
              Filtrer{filtreActif ? ' (actif)' : ''}
            </button>
          )}
          {onglet === 'journal' && (
            <label
              className="flex items-center gap-1.5 border border-border bg-surface px-3 py-1.5 text-[10.5px] font-bold cursor-pointer hover:bg-surface-alt"
              title="Décoché, le journal ne montre que le livre-journal · ce qui fait foi"
            >
              <input
                type="checkbox"
                checked={filtres.inclureBrouillard}
                onChange={(e) => setFiltres((f) => ({ ...f, inclureBrouillard: e.target.checked }))}
              />
              Brouillard
            </label>
          )}
          {onglet === 'journal' && boutonExport('Exporter Excel', exporterJournal)}
          {onglet === 'balance' && boutonExport('Exporter Excel', exporterBalance)}
          {onglet === 'grand-livre' && (
            <>
              {compteGrandLivreId && boutonExport('Exporter ce compte', exporterGrandLivreDuCompte, false)}
              {boutonExport('Exporter tout le grand livre', exporterGrandLivreComplet)}
            </>
          )}
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

      {onglet === 'journal' && filtresOuverts && (
        <div className="border border-border bg-surface-alt shadow-posee p-3 mb-2.5 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-text-dim">JOURNAL</span>
            <select
              value={filtres.journalId}
              onChange={(e) => setFiltres({ ...filtres, journalId: e.target.value })}
              className="border border-border bg-surface px-2 py-1 text-[10.5px] font-mono min-w-[150px]"
            >
              <option value="">Tous</option>
              {journaux.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.code} · {j.intitule}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-text-dim">DU</span>
            <input
              type="date"
              value={filtres.dateDebut}
              onChange={(e) => setFiltres({ ...filtres, dateDebut: e.target.value })}
              className="border border-border bg-surface px-2 py-1 text-[10.5px] font-mono"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-text-dim">AU</span>
            <input
              type="date"
              value={filtres.dateFin}
              onChange={(e) => setFiltres({ ...filtres, dateFin: e.target.value })}
              className="border border-border bg-surface px-2 py-1 text-[10.5px] font-mono"
            />
          </label>
          <label className="flex flex-col gap-1 flex-1 min-w-[180px]">
            <span className="text-[10px] font-bold text-text-dim">LIBELLÉ CONTIENT</span>
            <input
              type="text"
              value={filtres.recherche}
              onChange={(e) => setFiltres({ ...filtres, recherche: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && setFiltresAppliques(filtres)}
              placeholder="ex. cotisation"
              className="border border-border bg-surface px-2 py-1 text-[10.5px]"
            />
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => setFiltresAppliques(filtres)}
              className="border border-border bg-surface px-3 py-1.5 text-[10.5px] font-bold hover:bg-chrome"
            >
              Appliquer
            </button>
            <button
              onClick={() => {
                setFiltres(FILTRES_VIDES);
                setFiltresAppliques(FILTRES_VIDES);
              }}
              className="border border-border bg-chrome px-3 py-1.5 text-[10.5px] font-bold hover:bg-surface-alt"
            >
              Réinitialiser
            </button>
          </div>
        </div>
      )}

      <div className="flex bg-chrome border border-border border-b-0 rounded-t-[10px] overflow-hidden">
        <button
          onClick={() => setOnglet('journal')}
          className={`px-4 py-1.5 text-[10.5px] font-bold ${onglet === 'journal' ? 'bg-surface border-r border-border' : 'text-text-dim'}`}
        >
          JOURNAL
        </button>
        <button
          onClick={() => setOnglet('grand-livre')}
          className={`px-4 py-1.5 text-[10.5px] font-bold ${onglet === 'grand-livre' ? 'bg-surface border-r border-l border-border' : 'text-text-dim'}`}
        >
          GRAND LIVRE
        </button>
        <button
          onClick={() => setOnglet('balance')}
          className={`px-4 py-1.5 text-[10.5px] font-bold ${onglet === 'balance' ? 'bg-surface border-r border-l border-border' : 'text-text-dim'}`}
        >
          BALANCE
        </button>
      </div>

      {/*
        Présentation « Journal · état de base » de Sage : une ligne par ligne
        d'écriture, colonnes Jour · Jrn · Pièce · Référence · N° compte ·
        Libellé · Débit · Crédit ; les informations de la pièce (jour, n°,
        référence, état de correction) ne sont portées que par sa PREMIÈRE
        ligne, un filet sépare chaque pièce, les mouvements sont totalisés en
        fin d'édition.
      */}
      {/* TRANCHE AFFICHÉE · le serveur plafonne le nombre d'écritures rendues
          (mesure du 2026-09-03 : au-delà, la fenêtre faisait tomber le
          serveur). Le taire ferait lire un journal amputé comme un journal
          complet. Les totaux ci-dessous restent ceux du journal ENTIER. */}
      {onglet === 'journal' && troncature && (
        <div className="border border-warning/40 bg-warning-soft text-[11px] px-3.5 py-2 mb-2">
          {troncature.montrees.toLocaleString('fr-FR')} écritures affichées sur{' '}
          {troncature.total.toLocaleString('fr-FR')}. Les totaux restent ceux du journal entier. Restreignez les dates
          ou le journal pour tout voir à l'écran, ou passez par l'export Excel.
        </div>
      )}

      {onglet === 'journal' && (
        <div
          // `overflow-x-auto` ici, `min-w` sur les lignes · les 830 px de colonnes
          // incompressibles du tableau ne tiennent pas dans les ~326 px utiles d'une
          // fenêtre à 360 px, et sans conteneur le débordement remontait à la fenêtre,
          // qui emportait alors titre, onglets et boutons hors de l'écran.
          className="border border-border bg-surface shadow-posee rounded-t-none overflow-x-auto"
        >
          <div className="grid grid-cols-[68px_46px_52px_92px_120px_1fr_108px_108px_128px] min-w-[980px] gap-2.5 px-3.5 py-1.5 bg-surface-alt text-[10px] font-bold text-text-dim border-b border-border-dark">
            <span>DATE</span>
            <span>JRN</span>
            <span className="text-right">PIÈCE</span>
            <span>RÉFÉRENCE</span>
            <span>N° COMPTE</span>
            <span>LIBELLÉ ÉCRITURE</span>
            <span className="text-right">DÉBIT</span>
            <span className="text-right">CRÉDIT</span>
            <span>CORRECTION (ART. 20)</span>
          </div>
          {lignesJournal.length === 0 && (
            <div className="px-3.5 py-4 text-[10.5px] text-text-dim">
              {filtreActif ? 'Aucune écriture ne correspond au filtre.' : 'Aucune écriture sur cet exercice.'}
            </div>
          )}
          {lignesJournal.map((l) => (
            <div
              key={l.key}
              className={`grid grid-cols-[68px_46px_52px_92px_120px_1fr_108px_108px_128px] min-w-[980px] gap-2.5 px-3.5 py-[3px] items-center text-[10.5px] border-b border-border/50 ${
                l.premiereLigne ? 'border-t border-t-border' : ''
              } ${l.annuleePar ? 'opacity-55 line-through decoration-danger/60' : ''}`}
            >
              <span className="font-mono text-[10px] text-text-dim">
                {l.premiereLigne ? new Date(l.date).toLocaleDateString('fr-FR') : ''}
              </span>
              <span className="font-mono text-text-dim">{l.premiereLigne ? l.journal : ''}</span>
              <span className="font-mono text-[10px] text-text-dim text-right">
                {l.premiereLigne ? (l.numeroPiece ?? '·') : ''}
              </span>
              <span className="font-mono text-[10px] text-text-dim truncate">{l.premiereLigne ? l.reference : ''}</span>
              <span className="font-mono" title={l.compte}>
                {l.compteNumero}
              </span>
              <span className="truncate" title={`${l.compte} · ${l.libelleLigne}`}>
                {l.libelleLigne}
              </span>
              <span className="font-mono text-right">{l.debit ? l.debit.toLocaleString('fr-FR') : ''}</span>
              <span className="font-mono text-right">{l.credit ? l.credit.toLocaleString('fr-FR') : ''}</span>
              <span className="text-[10px] no-underline flex items-center gap-1.5 justify-end">
                {l.premiereLigne && l.enBrouillard && (
                  <span
                    className="text-[10px] font-bold text-warning bg-warning-soft border border-warning/40 rounded-[3px] px-1"
                    title="En brouillard · pas encore entrée au livre-journal"
                  >
                    BROUILLARD
                  </span>
                )}
                {l.premiereLigne && etatCorrection(l)}
              </span>
            </div>
          ))}
          <div className="grid grid-cols-[68px_46px_52px_92px_120px_1fr_108px_108px_128px] min-w-[980px] gap-2.5 px-3.5 py-1.5 bg-surface-alt border-t border-border-dark text-[10.5px] font-bold">
            <span className="col-span-5" />
            <span className="text-right text-[10px] text-text-dim self-center">TOTAUX DE LA PÉRIODE</span>
            <span className="font-mono text-right">{totaux.debit.toLocaleString('fr-FR')}</span>
            <span className="font-mono text-right">{totaux.credit.toLocaleString('fr-FR')}</span>
            <span />
          </div>
        </div>
      )}

      {onglet === 'grand-livre' && (
        <div className="border border-border">
          {/*
            LE GRAND LIVRE EST COMPLET PAR DÉFAUT · c'est sa définition même :
            le recueil de TOUS les comptes mouvementés de l'exercice, dans
            l'ordre des numéros. L'écran exigeait auparavant de choisir un
            compte avant de rien montrer · autant demander à l'utilisateur de
            deviner par où commencer. Le choix d'un compte n'est plus qu'un
            FILTRE, appliqué à l'état déjà chargé (aucune requête de plus).
          */}
          <div className="px-3.5 py-1.5 bg-surface-alt border-b border-border flex items-center gap-2 flex-wrap">
            <label className="text-[10px] font-bold text-text-dim">FILTRER SUR UN COMPTE</label>
            <select
              value={compteGrandLivreId}
              onChange={(e) => setCompteGrandLivreId(e.target.value)}
              className="border border-border rounded-[5px] bg-surface px-2 py-[2px] text-[10.5px] font-mono"
            >
              <option value="">tous les comptes mouvementés</option>
              {(grandLivre ?? []).map((c) => (
                <option key={c.compte.id} value={c.compte.id}>
                  {c.compte.numero} · {c.compte.intitule}
                </option>
              ))}
            </select>
            {grandLivre && (
              <span className="text-[10px] text-text-dim">
                {sectionsAffichees.length} compte{sectionsAffichees.length > 1 ? 's' : ''} ·{' '}
                {sectionsAffichees.reduce((n, c) => n + c.lignes.length, 0)} mouvement
                {sectionsAffichees.reduce((n, c) => n + c.lignes.length, 0) > 1 ? 's' : ''}
              </span>
            )}
          </div>

          {!grandLivre && <div className="px-3.5 py-4 text-[10.5px] text-text-dim">Chargement…</div>}
          {grandLivre && sectionsAffichees.length === 0 && (
            <div className="px-3.5 py-4 text-[10.5px] text-text-dim">
              Aucun mouvement sur cet exercice.
            </div>
          )}

          {/*
            Présentation « Grand livre · état de base » de Sage : pour chaque
            compte une ligne de RUPTURE en gras (numéro et intitulé), puis ses
            mouvements · date, jrn, pièce, libellé, débit, crédit, solde
            progressif ·, et un pied qui totalise les mouvements du compte et
            donne son solde final.
          */}
          {sectionsAffichees.map((section) => (
            <div key={section.compte.id}>
              <div className="px-3.5 py-1 border-y border-border-dark bg-chrome font-bold text-[11px]">
                <span className="font-mono">{section.compte.numero}</span> · {section.compte.intitule}
              </div>
              <div className={`grid ${GRILLE_GL} gap-2 px-3.5 py-1 bg-surface-alt text-[10px] font-bold text-text-dim border-b border-border`}>
                <span>DATE</span>
                <span>JRN</span>
                <span className="text-right">PIÈCE</span>
                <span>LIBELLÉ ÉCRITURE</span>
                <span className="text-right">DÉBIT</span>
                <span className="text-right">CRÉDIT</span>
                <span className="text-right">SOLDE PROGR.</span>
                <span>LETTRE</span>
                <span title="Comptes de sens opposé dans la même écriture. Plusieurs comptes = écriture N débits/M crédits, répartition non déterminable sans information de saisie supplémentaire.">
                  CONTREPARTIE
                </span>
              </div>
              {section.lignes.map((l) => (
                <div
                  key={l.id}
                  className={`grid ${GRILLE_GL} gap-2 px-3.5 py-[3px] items-center border-b border-border/50 text-[10.5px]`}
                >
                  <span className="font-mono text-[10px] text-text-dim">{new Date(l.date).toLocaleDateString('fr-FR')}</span>
                  <span className="font-mono text-text-dim">{l.journalCode}</span>
                  <span className="font-mono text-[10px] text-text-dim text-right">{l.numeroPiece ?? '·'}</span>
                  <span className="truncate" title={l.libelle}>
                    {l.libelle}
                  </span>
                  <Montant valeur={l.debit} />
                  <Montant valeur={l.credit} />
                  <span className="font-mono text-right font-semibold">{l.soldeProgressif.toLocaleString('fr-FR')}</span>
                  <span className="font-mono text-text-dim">{l.lettre ?? ''}</span>
                  <span className="font-mono text-[10px] text-text-dim truncate">
                    {l.contrepartie.length > 0 ? l.contrepartie.join(' + ') : '·'}
                  </span>
                </div>
              ))}
              <div className={`grid ${GRILLE_GL} gap-2 px-3.5 py-1 bg-surface-alt border-b border-border-dark text-[10.5px] font-bold`}>
                <span className="col-span-3" />
                <span className="text-right text-[10px] text-text-dim self-center">TOTAL MOUVEMENTS · SOLDE FINAL</span>
                <Montant valeur={section.totalDebit} />
                <Montant valeur={section.totalCredit} />
                <span className="font-mono text-right">{section.soldeFinal.toLocaleString('fr-FR')}</span>
                <span />
                <span />
              </div>
            </div>
          ))}
        </div>
      )}

      {/*
        BALANCE À SIX COLONNES · la présentation normale d'une balance
        générale OHADA, dans son ordre de lecture :

          solde d'OUVERTURE D/C · MOUVEMENTS de l'exercice D/C · solde de
          CLÔTURE D/C

        Le solde d'ouverture est celui des à-nouveaux (écritures générées par
        la clôture précédente), les mouvements sont ceux de l'exercice, et la
        clôture est leur somme · ligne à ligne, ouverture + mouvements =
        clôture, ce qui rend la balance vérifiable à l'œil. Les comptes de
        type Total tiennent lieu de lignes de sous-totalisation (les « niveaux
        de sous-totaux » de Sage), et les totaux généraux en pied ne comptent
        que les comptes Détail pour ne rien compter deux fois.
      */}
      {onglet === 'balance' && (
        <div className="border border-border bg-surface shadow-posee rounded-t-none">
          <div className={`grid ${GRILLE_BALANCE} gap-2 px-3.5 pt-1.5 text-[10px] font-bold text-text-dim bg-surface-alt`}>
            <span />
            <span />
            <span className="col-span-2 text-center border-b border-border pb-0.5">SOLDE D’OUVERTURE</span>
            <span className="col-span-2 text-center border-b border-border pb-0.5">MOUVEMENTS</span>
            <span className="col-span-2 text-center border-b border-border pb-0.5">SOLDE DE CLÔTURE</span>
          </div>
          <div className={`grid ${GRILLE_BALANCE} gap-2 px-3.5 py-1 bg-surface-alt text-[10px] font-bold text-text-dim border-b border-border-dark`}>
            <span>N° COMPTE</span>
            <span>INTITULÉ DU COMPTE</span>
            <span className="text-right">DÉBIT</span>
            <span className="text-right">CRÉDIT</span>
            <span className="text-right">DÉBIT</span>
            <span className="text-right">CRÉDIT</span>
            <span className="text-right">DÉBIT</span>
            <span className="text-right">CRÉDIT</span>
          </div>
          {balance.map((l) => (
            <div
              key={l.compteId}
              className={`grid ${GRILLE_BALANCE} gap-2 px-3.5 py-[3px] items-center border-b border-border/50 text-[10.5px]`}
            >
              <span className="font-mono">{l.numero}</span>
              <span className="truncate" title={l.intitule}>
                {l.intitule}
              </span>
              {(() => {
                // Ouverture et clôture s'affichent en SOLDE NET, chacun dans
                // sa colonne de sens · c'est ce que montre une balance, et
                // c'est ce qui permet de lire ouverture + mouvements =
                // clôture sur la même ligne. Les mouvements, eux, restent des
                // CUMULS (le débit et le crédit de l'exercice), jamais nets.
                const ouverture = l.reportDebit - l.reportCredit;
                const cloture = l.solde;
                return (
                  <>
                    <Montant valeur={ouverture > 0 ? ouverture : 0} />
                    <Montant valeur={ouverture < 0 ? -ouverture : 0} />
                    <Montant valeur={l.mouvementDebit} />
                    <Montant valeur={l.mouvementCredit} />
                    <Montant valeur={cloture > 0 ? cloture : 0} />
                    <Montant valeur={cloture < 0 ? -cloture : 0} />
                  </>
                );
              })()}
            </div>
          ))}
          {(() => {
            // Toutes les lignes entrent dans les totaux · la balance ne rend
            // plus de sous-totalisation par compte principal, il n'y a donc
            // plus d'agrégat à écarter pour ne pas compter deux fois.
            const cumul = (f: (l: LigneBalance) => number) => balance.reduce((s, l) => s + f(l), 0);
            const ouv = (l: LigneBalance) => l.reportDebit - l.reportCredit;
            return (
              <div className={`grid ${GRILLE_BALANCE} gap-2 px-3.5 py-1.5 bg-surface-alt border-t border-border-dark text-[10.5px] font-bold`}>
                <span />
                <span className="text-right text-[10px] text-text-dim self-center">TOTAUX GÉNÉRAUX</span>
                <Montant valeur={cumul((l) => Math.max(ouv(l), 0))} />
                <Montant valeur={cumul((l) => Math.max(-ouv(l), 0))} />
                <Montant valeur={cumul((l) => l.mouvementDebit)} />
                <Montant valeur={cumul((l) => l.mouvementCredit)} />
                <Montant valeur={cumul((l) => Math.max(l.solde, 0))} />
                <Montant valeur={cumul((l) => Math.max(-l.solde, 0))} />
              </div>
            );
          })()}
        </div>
      )}

      {aCorriger && (
        <ModaleCorrection
          libelleEcriture={aCorriger.libelle}
          enCours={correctionEnCours}
          onFermer={() => setACorriger(null)}
          onValider={corriger}
        />
      )}
    </div>
  );
}
