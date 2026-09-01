import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useExercice } from '../lib/exercice';
import type { JeuEtatsFinanciersSycebnl } from '../lib/types';

/**
 * GROUPE D'ÉTABLISSEMENTS · fenêtre du dossier MÈRE (le siège). Une même
 * personne morale tenue en plusieurs dossiers. Trois métiers dans une
 * fenêtre : SUPERVISER chaque cellule en lecture seule (tout voir, ne rien
 * toucher · les corrections se demandent à la cellule), CRÉER une cellule
 * sous le plafond fixé par la console plateforme (rattachement forcé,
 * licence héritée), et AGRÉGER les balances à la clôture, contrôles en
 * tête. Le canevas Excel officiel et son dépôt servent les cellules non
 * autonomes.
 */

interface CelluleGroupe {
  id: string;
  nom: string;
  jeuEtatsFinanciersSycebnl: JeuEtatsFinanciersSycebnl;
  ville: string | null;
  nbEcritures: number;
}

interface ReponseCellules {
  plafondCellules: number | null;
  peutCreerCellule: boolean;
  cellules: CelluleGroupe[];
}

interface LigneSupervision {
  id: string;
  nom: string;
  jeuEtatsFinanciersSycebnl: JeuEtatsFinanciersSycebnl;
  exerciceId: string | null;
  derniereEcriture: string | null;
  nbEcritures: number;
  nbBrouillard: number;
  tresorerie: number;
  solde58: number;
  equilibre: boolean;
  prete: boolean;
}

interface BalanceAgregee {
  exercice: { id: string; dateDebut: string; dateFin: string };
  dossiers: Array<{ id: string; nom: string; estMere: boolean; totalDebit: number; totalCredit: number; solde58: number; equilibre: boolean }>;
  cellulesSansExercice: Array<{ id: string; nom: string }>;
  lignes: Array<{ numero: string; intitule: string; totalDebit: number; totalCredit: number; solde: number }>;
  totaux: { debit: number; credit: number };
  controles: { ecartLiaison: number; liaisonNeutralisee: boolean; tousEquilibres: boolean };
}

interface BalanceCellule {
  cellule: { id: string; nom: string };
  lignes: Array<{ numero: string; intitule: string; typeCompte: string; totalDebit: number; totalCredit: number; solde: number }>;
  totaux: { debit: number; credit: number };
}

interface CelluleCreee {
  tenant: { id: string; nom: string };
  adminEmail: string;
  motDePasseTemporaire: string;
}

interface RapportCanevas {
  importe: boolean;
  lignesImportees: number;
  anomalies: Array<{ ligne: number; message: string }>;
}

const LIBELLE_JEU: Record<JeuEtatsFinanciersSycebnl, string> = {
  ASSOCIATIONS_ORDRES_PROFESSIONNELS: 'Système normal',
  PROJETS_DEVELOPPEMENT: 'Projets',
  SYSTEME_MINIMAL_TRESORERIE: 'SMT',
};

function montant(n: number): string {
  return n === 0 ? '·' : n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function dateCourte(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('fr-FR') : 'jamais';
}

export function GroupePage() {
  const { exercices, exerciceCourant } = useExercice();
  const [exerciceId, setExerciceId] = useState<string | null>(null);
  const [meta, setMeta] = useState<ReponseCellules | null>(null);
  const [supervision, setSupervision] = useState<LigneSupervision[] | null>(null);
  const [agregat, setAgregat] = useState<BalanceAgregee | null>(null);
  const [ongletBalance, setOngletBalance] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(false);
  const [liasseEnCours, setLiasseEnCours] = useState(false);

  // Modale « nouvelle cellule »
  const [creationOuverte, setCreationOuverte] = useState(false);
  const [nom, setNom] = useState('');
  const [emailAdmin, setEmailAdmin] = useState('');
  const [jeu, setJeu] = useState<JeuEtatsFinanciersSycebnl>('SYSTEME_MINIMAL_TRESORERIE');
  const [creationEnvoi, setCreationEnvoi] = useState(false);
  const [creationErreur, setCreationErreur] = useState<string | null>(null);
  const [creee, setCreee] = useState<CelluleCreee | null>(null);

  // Modale « balance d'une cellule » (lecture)
  const [balanceCellule, setBalanceCellule] = useState<BalanceCellule | null>(null);

  // Dépôt d'un canevas
  const [depotPour, setDepotPour] = useState<LigneSupervision | null>(null);
  const [depotEnvoi, setDepotEnvoi] = useState(false);
  const [rapportDepot, setRapportDepot] = useState<{ cellule: string; rapport: RapportCanevas } | null>(null);

  const exerciceActif = exerciceId ?? exerciceCourant?.id ?? null;

  const chargerMeta = () =>
    api
      .get<ReponseCellules>('/groupe/cellules')
      .then(setMeta)
      .catch((err) => setErreur(err instanceof ApiError ? err.message : 'Impossible de charger les cellules'));

  const chargerSupervision = () => {
    if (!exerciceActif) return Promise.resolve();
    setChargement(true);
    return api
      .get<{ cellules: LigneSupervision[] }>(`/groupe/supervision?exerciceId=${exerciceActif}`)
      .then((r) => {
        setSupervision(r.cellules);
        setErreur(null);
      })
      .catch((err) => {
        setSupervision(null);
        setErreur(err instanceof ApiError ? err.message : 'Impossible de charger la supervision');
      })
      .finally(() => setChargement(false));
  };

  useEffect(() => {
    chargerMeta();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    chargerSupervision();
    setAgregat(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exerciceActif]);

  const chargerAgregat = async () => {
    if (!exerciceActif) return;
    setOngletBalance(true);
    if (agregat) return;
    try {
      setAgregat(await api.get<BalanceAgregee>(`/groupe/balance-agregee?exerciceId=${exerciceActif}`));
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : "Impossible de calculer l'agrégat");
    }
  };

  const alertes = useMemo(() => {
    if (!supervision) return [];
    const liste: string[] = [];
    const desequilibrees = supervision.filter((s) => !s.equilibre).map((s) => s.nom);
    if (desequilibrees.length > 0) liste.push(`Dossier(s) déséquilibré(s) : ${desequilibrees.join(', ')}.`);
    const sansExercice = supervision.filter((s) => !s.exerciceId).map((s) => s.nom);
    if (sansExercice.length > 0) liste.push(`Cellule(s) sans exercice sur la période : ${sansExercice.join(', ')}.`);
    return liste;
  }, [supervision]);

  const ouvrirBalanceCellule = async (l: LigneSupervision) => {
    if (!l.exerciceId) return;
    try {
      setBalanceCellule(await api.get<BalanceCellule>(`/groupe/cellules/${l.id}/balance?exerciceId=${l.exerciceId}`));
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible de lire cette balance');
    }
  };

  const onCreer = async (e: FormEvent) => {
    e.preventDefault();
    setCreationEnvoi(true);
    setCreationErreur(null);
    try {
      const resultat = await api.post<CelluleCreee>('/groupe/cellules', {
        nom,
        emailAdmin,
        jeuEtatsFinanciersSycebnl: jeu,
      });
      setCreationOuverte(false);
      setNom('');
      setEmailAdmin('');
      setCreee(resultat);
      await Promise.all([chargerMeta(), chargerSupervision()]);
    } catch (err) {
      setCreationErreur(err instanceof ApiError ? err.message : 'Création impossible');
    } finally {
      setCreationEnvoi(false);
    }
  };

  const deposerCanevas = async (fichier: File) => {
    if (!depotPour) return;
    setDepotEnvoi(true);
    try {
      const base64 = await new Promise<string>((resoudre, rejeter) => {
        const lecteur = new FileReader();
        lecteur.onload = () => resoudre(String(lecteur.result).split(',')[1] ?? '');
        lecteur.onerror = () => rejeter(new Error('Lecture du fichier impossible'));
        lecteur.readAsDataURL(fichier);
      });
      const rapport = await api.post<RapportCanevas>(`/groupe/cellules/${depotPour.id}/import-canevas`, {
        nomFichier: fichier.name,
        contenuBase64: base64,
      });
      setRapportDepot({ cellule: depotPour.nom, rapport });
      setDepotPour(null);
      await chargerSupervision();
    } catch (err) {
      setRapportDepot({
        cellule: depotPour.nom,
        rapport: {
          importe: false,
          lignesImportees: 0,
          anomalies: [{ ligne: 0, message: err instanceof ApiError ? err.message : 'Dépôt impossible' }],
        },
      });
      setDepotPour(null);
    } finally {
      setDepotEnvoi(false);
    }
  };

  return (
    <div className="p-2">
      <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
        <div>
          <div className="text-[10px] font-mono text-text-dim leading-none">GROUPE</div>
          <h1 className="text-[12px] font-bold leading-tight">Cellules · supervision et balance agrégée</h1>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[11px] text-text-dim">Exercice :</label>
          <select
            value={exerciceActif ?? ''}
            onChange={(e) => setExerciceId(e.target.value)}
            className="border border-border-dark px-2 py-1 text-[11px] bg-surface"
          >
            {exercices.map((e) => (
              <option key={e.id} value={e.id}>
                {new Date(e.dateDebut).getFullYear()}
              </option>
            ))}
          </select>
          {meta?.peutCreerCellule && (
            <button type="button" onClick={() => setCreationOuverte(true)} className="bg-sel text-white px-3.5 py-1 text-[10.5px] font-semibold">
              Nouvelle cellule
            </button>
          )}
          <button
            type="button"
            disabled={!exerciceActif}
            onClick={() => exerciceActif && api.telecharger(`/groupe/balance-agregee/excel?exerciceId=${exerciceActif}`, 'balance-agregee.xlsx')}
            className="border border-border-dark bg-chrome hover:bg-chrome-alt px-3.5 py-1 text-[10.5px] font-semibold"
          >
            Balance (Excel)
          </button>
          <button
            type="button"
            disabled={!exerciceActif || liasseEnCours}
            onClick={async () => {
              if (!exerciceActif) return;
              setLiasseEnCours(true);
              setErreur(null);
              try {
                // Le serveur refuse tant qu'un contrôle est rouge · son
                // message dit exactement quoi corriger, on l'affiche tel quel.
                await api.telecharger(`/groupe/liasse/excel?exerciceId=${exerciceActif}`, 'liasse-groupe.xlsx');
              } catch (err) {
                setErreur(err instanceof ApiError ? err.message : 'Liasse impossible');
              } finally {
                setLiasseEnCours(false);
              }
            }}
            className="bg-sel text-white px-3.5 py-1 text-[10.5px] font-semibold disabled:opacity-50"
          >
            {liasseEnCours ? 'Liasse en cours…' : 'Liasse du groupe (Excel)'}
          </button>
        </div>
      </div>

      {meta && meta.plafondCellules !== null && (
        <p className="text-[10.5px] text-text-dim mb-2">
          {meta.cellules.length} cellule{meta.cellules.length > 1 ? 's' : ''} sur un plafond de {meta.plafondCellules}.
        </p>
      )}

      {erreur && <div className="text-[11px] text-danger bg-danger-soft border border-danger/30 px-3 py-1.5 mb-2 max-w-[1080px]">{erreur}</div>}
      {alertes.map((a) => (
        <div key={a} className="text-[11px] bg-warning-soft border border-warning/30 px-3 py-1.5 mb-2 max-w-[1080px]">
          {a}
        </div>
      ))}

      <div className="flex gap-2 mb-2">
        <button
          type="button"
          onClick={() => setOngletBalance(false)}
          className={`px-3 py-1 text-[10.5px] font-semibold border ${!ongletBalance ? 'bg-sel text-white border-sel' : 'bg-chrome border-border-dark'}`}
        >
          Supervision
        </button>
        <button
          type="button"
          onClick={chargerAgregat}
          className={`px-3 py-1 text-[10.5px] font-semibold border ${ongletBalance ? 'bg-sel text-white border-sel' : 'bg-chrome border-border-dark'}`}
        >
          Balance agrégée
        </button>
      </div>

      {!ongletBalance && (
        <div className="border border-border bg-surface shadow-posee max-w-[1120px] overflow-x-auto">
          <div className="min-w-[1020px]">
            <div className="grid grid-cols-[1.3fr_110px_100px_70px_80px_120px_110px_90px_190px] gap-2 px-3.5 py-1.5 bg-chrome border-b border-border text-[10px] font-bold text-text-dim">
              <span>CELLULE</span>
              <span>JEU</span>
              <span>DERN. ÉCRITURE</span>
              <span className="text-right">ÉCRIT.</span>
              <span className="text-right">BROUIL.</span>
              <span className="text-right">TRÉSORERIE</span>
              <span className="text-right">58 (LIAISON)</span>
              <span>STATUT</span>
              <span></span>
            </div>
            {chargement && <div className="p-3 text-[11px] text-text-dim">Chargement…</div>}
            {!chargement && supervision?.length === 0 && (
              <div className="p-3 text-[11px] text-text-dim">
                Aucune cellule rattachée. {meta?.plafondCellules === null ? 'Le rattachement se fait depuis la console VMG Consulting.' : 'Créez la première avec le bouton « Nouvelle cellule ».'}
              </div>
            )}
            {supervision?.map((l, i) => (
              <div
                key={l.id}
                className={`grid grid-cols-[1.3fr_110px_100px_70px_80px_120px_110px_90px_190px] gap-2 items-center px-3.5 py-1.5 border-b border-border last:border-b-0 text-[10.5px] ${i % 2 === 0 ? 'bg-surface' : 'bg-surface-alt'}`}
              >
                <span className="truncate font-semibold text-[11px]">{l.nom}</span>
                <span>{LIBELLE_JEU[l.jeuEtatsFinanciersSycebnl]}</span>
                <span className={l.derniereEcriture ? '' : 'text-danger'}>{dateCourte(l.derniereEcriture)}</span>
                <span className="text-right tabular-nums">{l.nbEcritures}</span>
                <span className={`text-right tabular-nums ${l.nbBrouillard > 0 ? 'text-warning font-semibold' : ''}`}>{l.nbBrouillard}</span>
                <span className="text-right tabular-nums">{montant(l.tresorerie)}</span>
                <span className={`text-right tabular-nums ${Math.abs(l.solde58) > 0.005 ? 'text-warning font-semibold' : 'text-text-dim'}`}>
                  {montant(l.solde58)}
                </span>
                <span
                  className={`font-mono text-[10px] font-bold px-1.5 py-0.5 w-fit ${
                    !l.exerciceId ? 'text-danger bg-danger-soft' : l.prete ? 'text-positive bg-positive-soft' : 'text-warning bg-warning-soft'
                  }`}
                >
                  {!l.exerciceId ? 'SANS EXERC.' : l.prete ? 'PRÊTE' : 'EN COURS'}
                </span>
                <span className="flex gap-2.5">
                  <button type="button" disabled={!l.exerciceId} onClick={() => ouvrirBalanceCellule(l)} className="text-sel disabled:opacity-40">
                    Balance
                  </button>
                  <button type="button" onClick={() => api.telecharger(`/groupe/cellules/${l.id}/canevas`, 'canevas.xlsx')} className="text-sel">
                    Canevas
                  </button>
                  <button type="button" onClick={() => setDepotPour(l)} className="text-sel">
                    Déposer
                  </button>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {ongletBalance && (
        <div className="border border-border bg-surface shadow-posee max-w-[820px]">
          <div className="grid grid-cols-[110px_1fr_130px_130px] gap-2 px-3.5 py-1.5 bg-chrome border-b border-border text-[10px] font-bold text-text-dim">
            <span>COMPTE</span>
            <span>INTITULÉ</span>
            <span className="text-right">DÉBIT</span>
            <span className="text-right">CRÉDIT</span>
          </div>
          {!agregat && <div className="p-3 text-[11px] text-text-dim">Calcul de l'agrégat…</div>}
          {agregat && !agregat.controles.liaisonNeutralisee && (
            <div className="text-[11px] bg-warning-soft border-b border-warning/30 px-3 py-1.5">
              Les virements internes (58) ne se neutralisent pas · écart de {montant(agregat.controles.ecartLiaison)} : un
              transfert a été enregistré d'un seul côté.
            </div>
          )}
          <div className="max-h-[52vh] overflow-y-auto">
            {agregat?.lignes.map((l, i) => (
              <div
                key={l.numero}
                className={`grid grid-cols-[110px_1fr_130px_130px] gap-2 px-3.5 py-1 border-b border-border last:border-b-0 text-[10.5px] ${i % 2 === 0 ? 'bg-surface' : 'bg-surface-alt'}`}
              >
                <span className="font-mono">{l.numero}</span>
                <span className="truncate">{l.intitule}</span>
                <span className="text-right tabular-nums">{montant(l.totalDebit)}</span>
                <span className="text-right tabular-nums">{montant(l.totalCredit)}</span>
              </div>
            ))}
          </div>
          {agregat && (
            <div className="grid grid-cols-[110px_1fr_130px_130px] gap-2 px-3.5 py-1.5 border-t border-border-dark bg-chrome text-[10.5px] font-bold">
              <span></span>
              <span>TOTAL AGRÉGÉ</span>
              <span className="text-right tabular-nums">{montant(agregat.totaux.debit)}</span>
              <span className="text-right tabular-nums">{montant(agregat.totaux.credit)}</span>
            </div>
          )}
        </div>
      )}

      <p className="text-[10.5px] text-text-dim mt-2 max-w-[1080px]">
        Supervision en lecture seule : le siège voit tout, ne modifie rien · une correction se demande à la cellule, qui
        la passe elle-même. « Canevas » télécharge le fichier Excel officiel d'une cellule non autonome · « Déposer »
        importe le canevas rempli (tout ou rien, écritures en brouillard). Pour la liasse officielle : Exporter, puis
        importer la feuille « Balance agrégée » dans un dossier de combinaison.
      </p>

      {creationOuverte && (
        <div className="anim-voile fixed inset-0 z-40 bg-black/35 flex items-center justify-center p-4">
          <form onSubmit={onCreer} className="anim-modale w-full max-w-[460px] bg-surface border border-border-dark shadow-flottante">
            <div
              className="h-[26px] flex items-center justify-between px-2.5 text-white text-[10.5px]"
              style={{ background: 'linear-gradient(180deg, var(--titlebar-from), var(--titlebar-to))' }}
            >
              <span>Nouvelle cellule</span>
              <button type="button" onClick={() => setCreationOuverte(false)} className="text-white/85 hover:text-white px-1.5">✕</button>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-[150px_1fr] items-center gap-x-3 gap-y-2.5">
                <label className="text-[11px] text-right">Nom de la cellule :</label>
                <input required autoFocus value={nom} onChange={(e) => setNom(e.target.value)} className="border border-border-dark px-2.5 py-1.5 text-[12px]" />
                <label className="text-[11px] text-right">E-mail du responsable :</label>
                <input type="email" required value={emailAdmin} onChange={(e) => setEmailAdmin(e.target.value)} className="border border-border-dark px-2.5 py-1.5 text-[12px]" />
                <label className="text-[11px] text-right">Tenue des comptes :</label>
                <select value={jeu} onChange={(e) => setJeu(e.target.value as JeuEtatsFinanciersSycebnl)} className="border border-border-dark px-2.5 py-1.5 text-[11px]">
                  <option value="SYSTEME_MINIMAL_TRESORERIE">Système minimal de trésorerie (petite cellule)</option>
                  <option value="ASSOCIATIONS_ORDRES_PROFESSIONNELS">Système normal (grande cellule)</option>
                </select>
              </div>
              <p className="text-[10.5px] text-text-dim mt-2.5">
                Le dossier naît complet, rattaché à ce groupe, avec la licence du siège. Pour une cellule non autonome
                (dépôt Excel), utilisez un alias du comptable du siège comme e-mail.
              </p>
              {creationErreur && <div className="text-[11px] text-danger bg-danger-soft border border-danger/30 px-2.5 py-1.5 mt-3">{creationErreur}</div>}
              <div className="flex justify-end gap-2 mt-4">
                <button type="button" onClick={() => setCreationOuverte(false)} className="border border-border-dark bg-chrome hover:bg-chrome-alt px-4 py-1.5 text-[11px]">
                  Annuler
                </button>
                <button type="submit" disabled={creationEnvoi} className="bg-sel text-white px-4 py-1.5 text-[11px] font-semibold disabled:opacity-50">
                  {creationEnvoi ? 'Création…' : 'Créer la cellule'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {creee && (
        <div className="anim-voile fixed inset-0 z-40 bg-black/35 flex items-center justify-center p-4">
          <div className="anim-modale w-full max-w-[460px] bg-surface border border-border-dark shadow-flottante">
            <div
              className="h-[26px] flex items-center px-2.5 text-white text-[10.5px]"
              style={{ background: 'linear-gradient(180deg, var(--titlebar-from), var(--titlebar-to))' }}
            >
              <span>Cellule créée · {creee.tenant.nom}</span>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 text-[11px]">
                <span className="text-right text-text-dim">E-mail :</span>
                <span className="font-mono select-all">{creee.adminEmail}</span>
                <span className="text-right text-text-dim">Mot de passe :</span>
                <span className="font-mono select-all font-bold">{creee.motDePasseTemporaire}</span>
              </div>
              <div className="border border-warning/30 bg-warning-soft px-3 py-2 text-[10.5px] mt-3">
                Affiché une seule fois · notez-le avant de fermer.
              </div>
              <div className="flex justify-end mt-4">
                <button type="button" onClick={() => setCreee(null)} className="bg-sel text-white px-4 py-1.5 text-[11px] font-semibold">
                  J'ai noté le mot de passe
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {balanceCellule && (
        <div className="anim-voile fixed inset-0 z-40 bg-black/35 flex items-center justify-center p-4">
          <div className="anim-modale w-full max-w-[640px] bg-surface border border-border-dark shadow-flottante max-h-[calc(100dvh-2rem)] flex flex-col">
            <div
              className="h-[26px] shrink-0 flex items-center justify-between px-2.5 text-white text-[10.5px]"
              style={{ background: 'linear-gradient(180deg, var(--titlebar-from), var(--titlebar-to))' }}
            >
              <span>Balance (lecture) · {balanceCellule.cellule.nom}</span>
              <button type="button" onClick={() => setBalanceCellule(null)} className="text-white/85 hover:text-white px-1.5">✕</button>
            </div>
            <div className="overflow-y-auto">
              {balanceCellule.lignes
                .filter((l) => l.typeCompte !== 'TOTAL')
                .map((l, i) => (
                  <div key={l.numero} className={`grid grid-cols-[100px_1fr_110px_110px] gap-2 px-3.5 py-1 text-[10.5px] border-b border-border ${i % 2 === 0 ? 'bg-surface' : 'bg-surface-alt'}`}>
                    <span className="font-mono">{l.numero}</span>
                    <span className="truncate">{l.intitule}</span>
                    <span className="text-right tabular-nums">{montant(l.totalDebit)}</span>
                    <span className="text-right tabular-nums">{montant(l.totalCredit)}</span>
                  </div>
                ))}
            </div>
            <div className="shrink-0 grid grid-cols-[100px_1fr_110px_110px] gap-2 px-3.5 py-1.5 border-t border-border-dark bg-chrome text-[10.5px] font-bold">
              <span></span>
              <span>TOTAL</span>
              <span className="text-right tabular-nums">{montant(balanceCellule.totaux.debit)}</span>
              <span className="text-right tabular-nums">{montant(balanceCellule.totaux.credit)}</span>
            </div>
          </div>
        </div>
      )}

      {depotPour && (
        <div className="anim-voile fixed inset-0 z-40 bg-black/35 flex items-center justify-center p-4">
          <div className="anim-modale w-full max-w-[440px] bg-surface border border-border-dark shadow-flottante">
            <div
              className="h-[26px] flex items-center justify-between px-2.5 text-white text-[10.5px]"
              style={{ background: 'linear-gradient(180deg, var(--titlebar-from), var(--titlebar-to))' }}
            >
              <span>Déposer un canevas · {depotPour.nom}</span>
              <button type="button" onClick={() => setDepotPour(null)} className="text-white/85 hover:text-white px-1.5">✕</button>
            </div>
            <div className="p-4">
              <p className="text-[11px]">
                Sélectionnez le canevas rempli de cette cellule (.xlsx). L'import est tout ou rien : la moindre ligne
                fausse est refusée avec son numéro et sa raison.
              </p>
              <input
                type="file"
                accept=".xlsx"
                disabled={depotEnvoi}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) deposerCanevas(f);
                }}
                className="mt-3 text-[11px]"
              />
              {depotEnvoi && <div className="text-[11px] text-text-dim mt-2">Import en cours…</div>}
            </div>
          </div>
        </div>
      )}

      {rapportDepot && (
        <div className="anim-voile fixed inset-0 z-40 bg-black/35 flex items-center justify-center p-4">
          <div className="anim-modale w-full max-w-[480px] bg-surface border border-border-dark shadow-flottante">
            <div
              className="h-[26px] flex items-center px-2.5 text-white text-[10.5px]"
              style={{ background: 'linear-gradient(180deg, var(--titlebar-from), var(--titlebar-to))' }}
            >
              <span>Dépôt · {rapportDepot.cellule}</span>
            </div>
            <div className="p-4">
              {rapportDepot.rapport.importe ? (
                <div className="text-[11px] text-positive bg-positive-soft border border-positive/30 px-3 py-2">
                  {rapportDepot.rapport.lignesImportees} ligne{rapportDepot.rapport.lignesImportees > 1 ? 's' : ''} importée
                  {rapportDepot.rapport.lignesImportees > 1 ? 's' : ''} en brouillard · la validation se fait dans le
                  dossier de la cellule.
                </div>
              ) : (
                <>
                  <div className="text-[11px] text-danger bg-danger-soft border border-danger/30 px-3 py-2 mb-2">
                    Rien n'a été importé · corrigez le fichier puis redéposez-le.
                  </div>
                  <div className="max-h-[30vh] overflow-y-auto">
                    {rapportDepot.rapport.anomalies.map((a, i) => (
                      <div key={i} className="text-[10.5px] py-0.5 border-b border-border last:border-b-0">
                        {a.ligne > 0 && <span className="font-mono text-text-dim">Ligne {a.ligne} · </span>}
                        {a.message}
                      </div>
                    ))}
                  </div>
                </>
              )}
              <div className="flex justify-end mt-4">
                <button type="button" onClick={() => setRapportDepot(null)} className="bg-sel text-white px-4 py-1.5 text-[11px] font-semibold">
                  Fermer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
