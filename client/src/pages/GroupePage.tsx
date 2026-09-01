import { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useExercice } from '../lib/exercice';

/**
 * GROUPE D'ÉTABLISSEMENTS · fenêtre du dossier MÈRE (le siège). Une même
 * personne morale tenue en plusieurs dossiers : les cellules tiennent leurs
 * livres chacune chez elle, le siège réunit tout ici, compte par compte,
 * avec les contrôles qui rendent l'agrégat digne de confiance (équilibre de
 * chaque dossier, neutralisation des virements internes 58, cellules sans
 * exercice). La feuille « Balance agrégée » de l'export se réimporte telle
 * quelle dans un dossier de combinaison pour produire la liasse officielle.
 */

interface CelluleGroupe {
  id: string;
  nom: string;
  jeuEtatsFinanciersSycebnl: string;
  ville: string | null;
  nbEcritures: number;
}

interface DossierAgregat {
  id: string;
  nom: string;
  estMere: boolean;
  totalDebit: number;
  totalCredit: number;
  solde58: number;
  equilibre: boolean;
}

interface BalanceAgregee {
  exercice: { id: string; dateDebut: string; dateFin: string };
  dossiers: DossierAgregat[];
  cellulesSansExercice: Array<{ id: string; nom: string }>;
  lignes: Array<{ numero: string; intitule: string; totalDebit: number; totalCredit: number; solde: number }>;
  totaux: { debit: number; credit: number };
  controles: { ecartLiaison: number; liaisonNeutralisee: boolean; tousEquilibres: boolean };
}

const LIBELLE_JEU: Record<string, string> = {
  ASSOCIATIONS_ORDRES_PROFESSIONNELS: 'Système normal',
  PROJETS_DEVELOPPEMENT: 'Projets',
  SYSTEME_MINIMAL_TRESORERIE: 'SMT',
};

function montant(n: number): string {
  return n === 0 ? '·' : n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function GroupePage() {
  const { exercices, exerciceCourant } = useExercice();
  const [exerciceId, setExerciceId] = useState<string | null>(null);
  const [cellules, setCellules] = useState<CelluleGroupe[] | null>(null);
  const [agregat, setAgregat] = useState<BalanceAgregee | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(false);

  const exerciceActif = exerciceId ?? exerciceCourant?.id ?? null;

  useEffect(() => {
    api
      .get<CelluleGroupe[]>('/groupe/cellules')
      .then(setCellules)
      .catch((err) => setErreur(err instanceof ApiError ? err.message : 'Impossible de charger les cellules'));
  }, []);

  useEffect(() => {
    if (!exerciceActif) return;
    setChargement(true);
    setErreur(null);
    api
      .get<BalanceAgregee>(`/groupe/balance-agregee?exerciceId=${exerciceActif}`)
      .then(setAgregat)
      .catch((err) => {
        setAgregat(null);
        setErreur(err instanceof ApiError ? err.message : "Impossible de calculer l'agrégat");
      })
      .finally(() => setChargement(false));
  }, [exerciceActif]);

  const alertes = useMemo(() => {
    if (!agregat) return [];
    const liste: string[] = [];
    if (!agregat.controles.tousEquilibres) {
      const noms = agregat.dossiers.filter((d) => !d.equilibre).map((d) => d.nom);
      liste.push(`Dossier(s) déséquilibré(s) : ${noms.join(', ')} · l'agrégat ne peut pas être fiable.`);
    }
    if (!agregat.controles.liaisonNeutralisee) {
      liste.push(
        `Les virements internes (comptes 58) ne se neutralisent pas · écart de ${montant(agregat.controles.ecartLiaison)}. ` +
          'Un transfert entre dossiers a été enregistré d’un seul côté.',
      );
    }
    if (agregat.cellulesSansExercice.length > 0) {
      liste.push(
        `Cellule(s) sans exercice sur la période : ${agregat.cellulesSansExercice.map((c) => c.nom).join(', ')} · leurs chiffres MANQUENT à l'agrégat.`,
      );
    }
    return liste;
  }, [agregat]);

  return (
    <div className="p-2">
      <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
        <div>
          <div className="text-[10px] font-mono text-text-dim leading-none">GROUPE</div>
          <h1 className="text-[12px] font-bold leading-tight">Cellules et balance agrégée</h1>
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
          <button
            type="button"
            disabled={!exerciceActif}
            onClick={() => exerciceActif && api.telecharger(`/groupe/balance-agregee/excel?exerciceId=${exerciceActif}`, 'balance-agregee.xlsx')}
            className="bg-sel text-white px-3.5 py-1 text-[10.5px] font-semibold disabled:opacity-50"
          >
            Exporter (Excel)
          </button>
        </div>
      </div>

      {erreur && <div className="text-[11px] text-danger bg-danger-soft border border-danger/30 px-3 py-1.5 mb-2 max-w-[980px]">{erreur}</div>}
      {alertes.map((a) => (
        <div key={a} className="text-[11px] bg-warning-soft border border-warning/30 px-3 py-1.5 mb-2 max-w-[980px]">
          {a}
        </div>
      ))}
      {agregat && alertes.length === 0 && (
        <div className="text-[11px] text-positive bg-positive-soft border border-positive/30 px-3 py-1.5 mb-2 max-w-[980px]">
          Tous les dossiers sont équilibrés et les virements internes se neutralisent · l'agrégat est cohérent.
        </div>
      )}

      <div className="flex gap-3 items-start flex-wrap">
        <div className="border border-border bg-surface shadow-posee w-[380px]">
          <div className="px-3.5 py-1.5 bg-chrome border-b border-border text-[10px] font-bold text-text-dim">
            DOSSIERS DU GROUPE
          </div>
          {!agregat && !chargement && cellules && cellules.length === 0 && (
            <div className="p-3 text-[11px] text-text-dim">
              Aucune cellule rattachée à ce dossier. Le rattachement se fait depuis la console VMG Consulting.
            </div>
          )}
          {chargement && <div className="p-3 text-[11px] text-text-dim">Calcul de l'agrégat…</div>}
          {agregat?.dossiers.map((d, i) => (
            <div
              key={d.id}
              className={`grid grid-cols-[1fr_auto] gap-2 items-center px-3.5 py-1.5 border-b border-border last:border-b-0 ${i % 2 === 0 ? 'bg-surface' : 'bg-surface-alt'}`}
            >
              <span className="text-[11px] truncate">
                {d.nom}
                {d.estMere && <span className="text-text-dim"> (siège)</span>}
                {(() => {
                  const jeu = cellules?.find((c) => c.id === d.id)?.jeuEtatsFinanciersSycebnl;
                  return jeu ? <span className="text-text-dim"> · {LIBELLE_JEU[jeu] ?? jeu}</span> : null;
                })()}
              </span>
              <span className={`font-mono text-[10px] font-bold px-1.5 py-0.5 ${d.equilibre ? 'text-positive bg-positive-soft' : 'text-danger bg-danger-soft'}`}>
                {d.equilibre ? 'ÉQUILIBRÉ' : 'ÉCART'}
              </span>
            </div>
          ))}
        </div>

        <div className="border border-border bg-surface shadow-posee flex-1 min-w-[520px] max-w-[760px]">
          <div className="grid grid-cols-[110px_1fr_130px_130px] gap-2 px-3.5 py-1.5 bg-chrome border-b border-border text-[10px] font-bold text-text-dim">
            <span>COMPTE</span>
            <span>INTITULÉ</span>
            <span className="text-right">DÉBIT</span>
            <span className="text-right">CRÉDIT</span>
          </div>
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
      </div>

      <p className="text-[10.5px] text-text-dim mt-2 max-w-[980px]">
        Pour produire la liasse officielle de l'entité : exportez, puis importez la feuille « Balance agrégée » dans un
        dossier de combinaison (Fichier · Importer des données, type Balance) et générez-y les états financiers. Les
        transferts entre dossiers passent TOUS par un compte 58 Virements internes, des deux côtés · c'est ce qui permet
        leur neutralisation ici.
      </p>
    </div>
  );
}
