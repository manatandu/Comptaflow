import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { EnteteImpression } from '../components/chrome/EnteteImpression';
import { useExercice } from '../lib/exercice';
import type { Journal } from '../lib/types';

/**
 * VARIATION DES STOCKS · l'écriture que le compte de résultat attendait.
 *
 * Le compte de résultat des deux référentiels porte des lignes de variation de
 * stocks, lues sur les comptes 603 et 73. Elles étaient à zéro chez tout
 * dossier qui tient des stocks, parce que rien dans le logiciel ne les
 * produisait : le résultat était faux du montant de la variation, la balance
 * bouclait, et seul le dépôt le révélait.
 *
 * CET ÉCRAN PROPOSE, IL N'IMPUTE PAS. Le stock final vient d'un inventaire
 * EXTRA-COMPTABLE qu'aucun livre ne porte · le déduire serait l'inventer.
 */

interface LigneProposee {
  compte: string;
  sens: 'DEBIT' | 'CREDIT';
  montant: number;
  libelle: string;
}

interface Retenue {
  numero: string;
  correspondance: { racine: string; intitule: string; variation: string; intituleVariation: string };
  soldeInitial: number;
  stockFinal: number;
  source: string;
}

interface Refusee {
  numero: string;
  motif: string;
  explication: string;
}

interface EtatStocks {
  methode: 'PERMANENT' | 'INTERMITTENT' | null;
  referentiel: 'SYCEBNL' | 'SYSCOHADA';
  reserve: string | null;
  proposition: {
    retenues: Retenue[];
    refusees: Refusee[];
    sansMouvement: string[];
    avertissements: string[];
    lignes: LigneProposee[];
    totaux: { debit: number; credit: number };
  } | null;
}

const montant = (n: number) =>
  n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function VariationStocksPage() {
  const { exerciceCourant } = useExercice();
  const { peutEcrire } = useAuth();
  const [etat, setEtat] = useState<EtatStocks | null>(null);
  const [journaux, setJournaux] = useState<Journal[]>([]);
  const [journalId, setJournalId] = useState('');
  const [date, setDate] = useState('');
  const [reference, setReference] = useState('');
  const [erreur, setErreur] = useState('');
  const [succes, setSucces] = useState('');
  const [enCours, setEnCours] = useState(false);

  const charger = useCallback(() => {
    if (!exerciceCourant) return;
    setErreur('');
    api
      .get<EtatStocks>(`/stocks/variation/${exerciceCourant.id}`)
      .then(setEtat, (e: ApiError) => setErreur(e.message));
  }, [exerciceCourant]);

  useEffect(charger, [charger]);

  useEffect(() => {
    api.get<Journal[]>('/journaux').then(setJournaux, () => undefined);
  }, []);

  // LA DATE PAR DÉFAUT EST LA CLÔTURE, parce que c'est là que les deux textes
  // posent l'écriture · « en cas d'inventaire intermittent, À LA CLÔTURE DE
  // L'EXERCICE ». Elle reste modifiable : une situation intermédiaire s'arrête
  // à une autre date.
  useEffect(() => {
    if (exerciceCourant && !date) setDate(exerciceCourant.dateFin.slice(0, 10));
  }, [exerciceCourant, date]);

  const enregistrer = async () => {
    if (!exerciceCourant || !journalId) return;
    setEnCours(true);
    setErreur('');
    setSucces('');
    try {
      const ecriture = await api.post<{ numeroPiece: string }>('/stocks/variation', {
        exerciceId: exerciceCourant.id,
        journalId,
        date,
        reference: reference.trim() || undefined,
      });
      setSucces(`Écriture ${ecriture.numeroPiece} enregistrée.`);
      charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Enregistrement impossible');
    } finally {
      setEnCours(false);
    }
  };

  const p = etat?.proposition;
  const equilibree = p ? p.totaux.debit === p.totaux.credit : false;

  return (
    <div className="p-2">
      <EnteteImpression titre="Variation des stocks" />
      <div className="ecran-seul mb-1.5 max-w-[1240px]">
        <div className="text-[11px] font-mono text-text-dim leading-none">Inventaire intermittent</div>
        <h1 className="text-[13px] font-bold leading-tight">Variation des stocks</h1>
        <div className="text-[11px] text-text-dim mt-0.5">
          « Est débité le compte de stock du montant du STOCK FINAL, déterminé par inventaire extra
          comptable ; est crédité le compte de stock du montant du STOCK INITIAL, POUR SOLDE » ·
          AUDCIF Titre VII ch. 3 et SYCEBNL Partie 2 ch. 3, dans les mêmes mots.
        </div>
      </div>

      {erreur && (
        <div className="border border-danger/30 bg-danger-soft px-3.5 py-2 mb-2.5 text-[12px] max-w-[1240px]">
          {erreur}
        </div>
      )}
      {succes && (
        <div className="border border-ok/30 bg-ok-soft px-3.5 py-2 mb-2.5 text-[12px] max-w-[1240px]">
          {succes}
        </div>
      )}

      {/* LA RÉSERVE EST UN ÉTAT, PAS UNE ERREUR · un dossier en inventaire
          permanent n'a rien à passer ici, et une liste vide se lirait comme
          « rien à faire ». */}
      {etat?.reserve && (
        <div className="border border-warning/40 bg-warning/5 px-3.5 py-2.5 mb-2.5 text-[12px] max-w-[1240px]">
          {etat.reserve}
        </div>
      )}

      {p?.avertissements.map((a) => (
        <div
          key={a}
          className="border border-warning/40 bg-warning/5 px-3.5 py-2 mb-2 text-[12px] max-w-[1240px]"
        >
          {a}
        </div>
      ))}

      {p && (
        <div className="max-w-[1240px]">
          <table className="w-full border-collapse text-[12px] mb-2.5">
            <thead>
              <tr className="bg-surface-2 text-text-dim">
                <th className="text-left font-semibold px-2 py-1 border border-border">Compte</th>
                <th className="text-left font-semibold px-2 py-1 border border-border">Nature</th>
                <th className="text-right font-semibold px-2 py-1 border border-border">Stock initial</th>
                <th className="text-right font-semibold px-2 py-1 border border-border">Stock final</th>
                <th className="text-left font-semibold px-2 py-1 border border-border">Variation au</th>
                <th className="text-left font-semibold px-2 py-1 border border-border">Source</th>
              </tr>
            </thead>
            <tbody>
              {p.retenues.map((r) => (
                <tr key={r.numero}>
                  <td className="px-2 py-1 border border-border font-mono">{r.numero}</td>
                  <td className="px-2 py-1 border border-border">{r.correspondance.intitule}</td>
                  <td className="px-2 py-1 border border-border text-right font-mono">
                    {montant(r.soldeInitial)}
                  </td>
                  <td className="px-2 py-1 border border-border text-right font-mono">
                    {montant(r.stockFinal)}
                  </td>
                  <td className="px-2 py-1 border border-border font-mono">
                    {r.correspondance.variation}
                  </td>
                  <td className="px-2 py-1 border border-border text-text-dim">{r.source}</td>
                </tr>
              ))}
              {p.retenues.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-2 py-2 border border-border text-text-dim">
                    Aucun compte de stock de ce dossier n’a de stock final constaté.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* LES REFUS SONT DÉPLIÉS, jamais repliés · c'est ce qu'il faut lire
              avant de passer l'écriture, et un refus replié ne se lit pas. */}
          {p.refusees.map((r) => (
            <div
              key={`${r.numero}-${r.motif}`}
              className="border border-border bg-surface-2 px-3.5 py-2 mb-1.5 text-[12px]"
            >
              <span className="font-mono font-semibold">{r.numero}</span> · {r.explication}
            </div>
          ))}

          {p.retenues.length > 0 && (
            <div className="border border-border bg-surface px-3.5 py-2.5 mt-2.5">
              <div className="text-[12px] font-semibold mb-1.5">
                Écriture proposée · {p.lignes.length} lignes, {montant(p.totaux.debit)} au débit et{' '}
                {montant(p.totaux.credit)} au crédit
              </div>
              {!equilibree && (
                <div className="text-[12px] text-danger mb-1.5">
                  L’écriture proposée n’est pas équilibrée. Ne l’enregistrez pas et signalez-le.
                </div>
              )}
              {/* La proposition se consulte par tous ; seul le passage de l'écriture est réservé. */}
              {peutEcrire && (
                <>
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="text-[11px] text-text-dim">
                      Journal
                      <select
                        value={journalId}
                        onChange={(e) => setJournalId(e.target.value)}
                        className="block border border-border bg-surface px-2 py-[3px] text-[12px] min-w-[180px]"
                      >
                        <option value="">Choisir un journal</option>
                        {journaux.map((j) => (
                          <option key={j.id} value={j.id}>
                            {j.code} · {j.intitule}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-[11px] text-text-dim">
                      Date
                      <input
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="block border border-border bg-surface px-2 py-[3px] text-[12px]"
                      />
                    </label>
                    <label className="text-[11px] text-text-dim">
                      Référence
                      <input
                        value={reference}
                        onChange={(e) => setReference(e.target.value)}
                        className="block border border-border bg-surface px-2 py-[3px] text-[12px]"
                      />
                    </label>
                    <button
                      type="button"
                      disabled={!journalId || !date || enCours || !equilibree}
                      onClick={enregistrer}
                      className="bg-sel text-white rounded-[6px] px-3 py-[3px] text-[12px] font-semibold hover:opacity-90 disabled:opacity-40"
                    >
                      {enCours ? 'Enregistrement…' : 'Enregistrer l’écriture'}
                    </button>
                  </div>
                  <div className="text-[11px] text-text-dim mt-1.5">
                    Le journal n’est pas deviné · aucun des deux textes n’en nomme un, et le journal des
                    opérations diverses n’est pas un usage universel.
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
