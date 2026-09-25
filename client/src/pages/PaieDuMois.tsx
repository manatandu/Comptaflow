import { Fragment, useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useExercice } from '../lib/exercice';
import type { Journal } from '../lib/types';

/**
 * P9 · LA PAIE DU MOIS AU JOURNAL, EN UNE ÉCRITURE.
 *
 * L'écran ne calcule rien et n'envoie aucun montant : il montre la
 * proposition que le serveur rejoue sur les bulletins émis du mois, et
 * n'envoie que ce qui appartient au cabinet · le journal, la date, le
 * libellé. Le serveur rejoue encore tout au moment de passer.
 */

/**
 * Les trois temps de l'écriture de paie, dans l'ordre du Guide d'application
 * SYSCOHADA (Partie 1 ch. 3 section 4, Application 10). L'impôt retenu est au
 * deuxième, jamais au troisième : c'est une retenue sur le salarié.
 */
export const TITRE_BLOC_PAIE = {
  BRUT: '1 · Salaire brut dû au personnel',
  RETENUES: '2 · Retenues sur le salaire (cotisations ouvrières, impôt)',
  PATRONALES: '3 · Charges sociales patronales',
} as const;

type Bloc = keyof typeof TITRE_BLOC_PAIE;

interface PropositionPaieDuMois {
  moisDePaie: string;
  aPasser: { id: string; numero: number; nomComplet: string }[];
  dejaPasses: { numero: number; nomComplet: string; ecritureId: string }[];
  annulesApresPassation: { numero: number; nomComplet: string; ecritureId: string }[];
  refus: { numero: number; nomComplet: string; motifs: string[] }[];
  lignes: { bloc: Bloc; compte: string; intitule: string; sens: 'DEBIT' | 'CREDIT'; montantFc: number }[];
  totalDebitFc: number;
  totalCreditFc: number;
  equilibree: boolean;
  solde422Fc: number;
  sommeDesNetsFc: number;
  reserves: string[];
  pieces: { id: string; numeroPiece: number | null; date: string; statut: 'BROUILLARD' | 'VALIDEE' }[];
}

const fc = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dernierJour = (mois: string) => {
  const [a, m] = mois.split('-').map(Number);
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
};

export function PaieDuMois({
  mois,
  peutEcrire,
  apresChangement,
}: {
  mois: string;
  peutEcrire: boolean;
  apresChangement: () => void;
}) {
  const { exerciceCourant } = useExercice();
  const [p, setP] = useState<PropositionPaieDuMois | null>(null);
  const [journaux, setJournaux] = useState<Journal[]>([]);
  const [journalId, setJournalId] = useState('');
  const [date, setDate] = useState(dernierJour(mois));
  const [erreur, setErreur] = useState('');
  const [message, setMessage] = useState('');
  const [enCours, setEnCours] = useState(false);

  const charger = useCallback(() => {
    setErreur('');
    api.get<PropositionPaieDuMois>(`/personnel/paie-du-mois/${mois}`).then(setP, (e: ApiError) => setErreur(e.message));
  }, [mois]);

  useEffect(() => {
    charger();
    setDate(dernierJour(mois));
    setMessage('');
  }, [charger, mois]);

  useEffect(() => {
    if (!peutEcrire) return;
    api.get<Journal[]>('/journaux').then(
      (js) => {
        const actifs = js.filter((j) => j.estActif);
        setJournaux(actifs);
        // Le journal des opérations diverses est proposé, jamais imposé · le
        // cabinet peut avoir ouvert un journal de paie dédié.
        const od = actifs.find((j) => j.type === 'GENERAL');
        setJournalId((courant) => courant || od?.id || '');
      },
      () => undefined,
    );
  }, [peutEcrire]);

  const passer = () => {
    if (!exerciceCourant || !journalId) return;
    setEnCours(true);
    setErreur('');
    api
      .post<{ ecriture: { numeroPiece: number | null } }>(`/personnel/paie-du-mois/${mois}/comptabilisation`, {
        exerciceId: exerciceCourant.id,
        journalId,
        date,
      })
      .then(
        (r) => {
          setMessage(`Écriture de paie passée au brouillard, pièce n° ${r.ecriture.numeroPiece ?? ''}.`);
          setEnCours(false);
          charger();
          apresChangement();
        },
        (e: ApiError) => {
          setErreur(e.message);
          setEnCours(false);
        },
      );
  };

  const defaire = (ecritureId: string) => {
    setEnCours(true);
    setErreur('');
    api.delete(`/personnel/paie-du-mois/comptabilisation/${ecritureId}`).then(
      () => {
        setMessage('Comptabilisation annulée · les bulletins sont de nouveau à passer.');
        setEnCours(false);
        charger();
        apresChangement();
      },
      (e: ApiError) => {
        setErreur(e.message);
        setEnCours(false);
      },
    );
  };

  if (!p) return erreur ? <div className="ecran-seul text-danger mt-3">{erreur}</div> : null;
  const pieceDe = (id: string) => p.pieces.find((x) => x.id === id);
  const ecrituresPassees = [...new Set(p.dejaPasses.map((b) => b.ecritureId))];

  return (
    <div className="ecran-seul border border-border px-3.5 py-2.5 mt-3">
      <div className="font-semibold mb-1.5">Passation de la paie du mois au journal</div>

      {erreur && <div className="border border-danger/30 bg-danger-soft px-3 py-1.5 mb-2">{erreur}</div>}
      {message && <div className="border border-border bg-chrome px-3 py-1.5 mb-2">{message}</div>}

      {ecrituresPassees.map((id) => {
        const piece = pieceDe(id);
        const n = p.dejaPasses.filter((b) => b.ecritureId === id).map((b) => `n° ${b.numero}`);
        return (
          <div key={id} className="flex flex-wrap items-center gap-3 mb-1.5">
            <span>
              Bulletins {n.join(', ')} passés dans la pièce n° {piece?.numeroPiece ?? '·'}
              {piece?.statut === 'VALIDEE' ? ' (validée)' : ' (au brouillard)'}.
            </span>
            {peutEcrire && piece?.statut === 'BROUILLARD' && (
              <button type="button" disabled={enCours} onClick={() => defaire(id)} className="px-2.5 py-1 border border-border">
                Annuler la comptabilisation
              </button>
            )}
          </div>
        );
      })}

      {p.annulesApresPassation.length > 0 && (
        <div className="border border-warning/40 bg-warning/5 px-3 py-1.5 mb-2">
          Annulé(s) après passation :{' '}
          {p.annulesApresPassation.map((b) => `n° ${b.numero} (${b.nomComplet})`).join(', ')}. Leur salaire est encore
          dans l’écriture validée · il se corrige par une écriture en négatif.
        </div>
      )}

      {p.refus.length > 0 && (
        <div className="border border-warning/40 bg-warning/5 px-3 py-2 mb-2">
          <div className="font-semibold mb-1">La paie du mois n’est pas passée</div>
          <ul>
            {p.refus.map((r) => (
              <li key={r.numero} className="py-0.5 border-t border-border/40">
                Bulletin n° {r.numero} · {r.nomComplet} · {r.motifs.join(' ')}
              </li>
            ))}
          </ul>
        </div>
      )}

      {p.aPasser.length === 0 && p.refus.length === 0 && (
        <div className="text-text-dim">Aucun bulletin émis à passer pour ce mois.</div>
      )}

      {p.lignes.length > 0 && (
        <>
          <div className="text-text-dim mb-1">
            {p.aPasser.length} bulletin(s) à passer : {p.aPasser.map((b) => `n° ${b.numero}`).join(', ')}.
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse">
              <thead>
                <tr className="text-left">
                  <th className="py-1">Compte</th>
                  <th className="py-1">Intitulé</th>
                  <th className="py-1 text-right">Débit</th>
                  <th className="py-1 text-right">Crédit</th>
                </tr>
              </thead>
              <tbody>
                {p.lignes.map((l, i, tout) => (
                  <Fragment key={i}>
                    {(i === 0 || tout[i - 1].bloc !== l.bloc) && (
                      <tr>
                        <td colSpan={4} className="pt-2 pb-1 font-semibold">
                          {TITRE_BLOC_PAIE[l.bloc]}
                        </td>
                      </tr>
                    )}
                    <tr>
                      <td className="py-1 pr-2 font-mono">{l.compte}</td>
                      <td className="py-1 pr-2">{l.intitule}</td>
                      <td className="py-1 pr-2 text-right font-mono">{l.sens === 'DEBIT' ? fc(l.montantFc) : ''}</td>
                      <td className="py-1 text-right font-mono">{l.sens === 'CREDIT' ? fc(l.montantFc) : ''}</td>
                    </tr>
                  </Fragment>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="py-1" colSpan={2}>
                    Totaux
                  </td>
                  <td className="py-1 pr-2 text-right font-mono">{fc(p.totalDebitFc)}</td>
                  <td className="py-1 text-right font-mono">{fc(p.totalCreditFc)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="text-text-dim mt-1">
            Solde du 422 après l’écriture : {fc(p.solde422Fc)} FC, net à payer des bulletins : {fc(p.sommeDesNetsFc)} FC.
          </div>

          {peutEcrire && (
            <div className="flex flex-wrap items-end gap-3 mt-2.5">
              <label className="flex flex-col gap-0.5">
                Journal
                <select value={journalId} onChange={(e) => setJournalId(e.target.value)} className="border border-border px-2 py-1">
                  <option value="">Choisir un journal</option>
                  {journaux.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.code} · {j.intitule}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-0.5">
                Date
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="border border-border px-2 py-1" />
              </label>
              <button
                type="button"
                disabled={!journalId || !date || !exerciceCourant || enCours || !p.equilibree}
                onClick={passer}
                className="bg-sel text-white rounded-[3px] px-3 py-[3px] text-[11.5px] font-semibold hover:opacity-90 disabled:opacity-40"
              >
                {enCours ? 'Enregistrement…' : 'Passer l’écriture de paie'}
              </button>
            </div>
          )}
        </>
      )}

      <ul className="mt-2 text-[11px] text-text-dim">
        {p.reserves.map((r, i) => (
          <li key={i} className="py-0.5 border-t border-border/40">
            {r}
          </li>
        ))}
      </ul>
    </div>
  );
}
