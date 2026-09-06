import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { EnteteImpression } from '../components/chrome/EnteteImpression';
import type { BalanceFonctionnelle, Exercice } from '../lib/types';

/**
 * LA BALANCE EN MONNAIE FONCTIONNELLE · le second jeu, et il dit ce qu'il
 * n'est pas.
 *
 * La mention « sans valeur légale » est en tête et non en note de bas de page :
 * un document qui ressemble à une balance et qui n'est pas la balance légale
 * doit dire lequel des deux il est avant qu'on en lise les chiffres.
 *
 * L'ÉCART DE CONVERSION EST MONTRÉ. Il naît des lignes prises à leur montant
 * d'origine face à des lignes converties · les deux côtés d'une même opération
 * n'ont alors pas la même origine. Le loger dans un compte de bouclage ferait
 * équilibrer l'état et disparaître l'information.
 */

const montant = (v: number) => v.toLocaleString('fr-FR', { minimumFractionDigits: 2 });
const jour = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString('fr-FR') : '·');

export function BalanceFonctionnellePage() {
  const [exercices, setExercices] = useState<Exercice[]>([]);
  const [exerciceId, setExerciceId] = useState('');
  const [balance, setBalance] = useState<BalanceFonctionnelle | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    api.get<Exercice[]>('/exercices').then(
      (x) => {
        setExercices(x);
        if (x.length > 0) setExerciceId(x[0].id);
      },
      () => undefined,
    );
  }, []);

  useEffect(() => {
    if (!exerciceId) return;
    setErreur(null);
    setBalance(null);
    api
      .get<BalanceFonctionnelle>(`/monnaie-fonctionnelle/balance/${exerciceId}`)
      .then(setBalance, (e: Error) => setErreur(e instanceof ApiError ? e.message : 'État indisponible'));
  }, [exerciceId]);

  return (
    <div className="p-2">
      <EnteteImpression titre="Balance en monnaie fonctionnelle" />
      <div className="ecran-seul mb-1.5 max-w-[1240px]">
        <div className="text-[10px] font-mono text-text-dim leading-none">SECOND JEU · DOCUMENT DE GESTION</div>
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-[12px] font-bold leading-tight">Balance en monnaie fonctionnelle</h1>
          <label className="text-[10px] text-text-dim">
            Exercice
            <select
              value={exerciceId}
              onChange={(e) => setExerciceId(e.target.value)}
              className="block border border-border bg-surface px-2 py-[3px] text-[10.5px] min-w-[180px]"
            >
              {exercices.map((x) => (
                <option key={x.id} value={x.id}>
                  {jour(x.dateDebut)} au {jour(x.dateFin)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {erreur && (
        <div className="border border-danger/30 bg-danger-soft px-3.5 py-2 mb-2.5 text-[10.5px] max-w-[1240px]">
          {erreur}
        </div>
      )}

      {balance && (
        <>
          <div className="border border-warning/30 bg-warning-soft px-3.5 py-2 mb-2 text-[10px] max-w-[1240px]">
            {balance.mention}
          </div>

          <div className="border border-border bg-surface px-3.5 py-2 mb-2 max-w-[1240px]">
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-[10.5px]">
              <span>
                <span className="text-text-dim">Monnaie </span>
                <span className="font-semibold">{balance.monnaie}</span>
                <span className="text-text-dim"> · tenue en {balance.monnaieTenue}</span>
              </span>
              <span>
                <span className="text-text-dim">Écritures converties </span>
                <span className="font-semibold tabular-nums">{balance.origine.ecritures}</span>
              </span>
              <span>
                <span className="text-text-dim">Lignes prises à leur montant d’origine </span>
                <span className="font-semibold tabular-nums">{balance.origine.lignesExactes}</span>
                <span className="text-text-dim"> sur {balance.origine.lignes}</span>
              </span>
            </div>
            {balance.totaux.ecartDeConversion !== 0 && (
              <div className="text-[10px] text-warning mt-1">
                Écart de conversion · {montant(balance.totaux.ecartDeConversion)} {balance.monnaie}. Il naît des
                lignes prises à leur montant d’origine face à des lignes converties : les deux côtés d’une même
                opération n’ont pas la même origine. Il est montré et non logé dans un compte de bouclage, qui
                ferait équilibrer l’état et disparaître l’information.
              </div>
            )}
          </div>

          <div className="border border-border bg-surface max-w-[1240px] overflow-x-auto">
            <table className="w-full text-[10.5px]">
              <thead>
                <tr className="border-b border-border text-text-dim font-mono text-[10px]">
                  <th className="text-left px-2.5 py-1.5">COMPTE</th>
                  <th className="text-left px-2.5 py-1.5">INTITULÉ</th>
                  <th className="text-right px-2.5 py-1.5">DÉBIT</th>
                  <th className="text-right px-2.5 py-1.5">CRÉDIT</th>
                  <th className="text-right px-2.5 py-1.5">SOLDE</th>
                </tr>
              </thead>
              <tbody>
                {balance.lignes.map((l) => (
                  <tr key={l.compteId} className="border-b border-border/50">
                    <td className="px-2.5 py-1 font-mono">{l.numero}</td>
                    <td className="px-2.5 py-1">{l.intitule}</td>
                    <td className="px-2.5 py-1 text-right font-mono tabular-nums">{montant(l.debit)}</td>
                    <td className="px-2.5 py-1 text-right font-mono tabular-nums">{montant(l.credit)}</td>
                    <td className="px-2.5 py-1 text-right font-mono tabular-nums font-semibold">{montant(l.solde)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border font-semibold">
                  <td className="px-2.5 py-1.5" colSpan={2}>
                    Total ({balance.monnaie})
                  </td>
                  <td className="px-2.5 py-1.5 text-right font-mono tabular-nums">{montant(balance.totaux.debit)}</td>
                  <td className="px-2.5 py-1.5 text-right font-mono tabular-nums">{montant(balance.totaux.credit)}</td>
                  <td className="px-2.5 py-1.5 text-right font-mono tabular-nums">
                    {montant(balance.totaux.ecartDeConversion)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
