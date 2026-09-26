import { useState } from 'react';
import { api } from '../lib/api';

/**
 * LE TABLEAU DES FLUX IFRS (IAS 7 modifiée par IFRS 18) et la déclaration de
 * l'effet de change (§ 28), rendus pour les comptes individuels ET pour les
 * comptes consolidés. Un seul rendu · deux copies divergeraient au premier
 * correctif, et c'est le même moteur qui les produit.
 */
export type LigneFlux = { cle: string; libelle: string; ref?: string; section: string; nature: 'FLUX' | 'TOTAL' | 'SOLDE' | 'ECART'; montant: number };
export type Flux = {
  lignes: LigneFlux[];
  rapprochementSituation: { cle: string; libelle: string; montant: number }[];
  rapprochementLegal: { activite: string; syscohada: number; ifrs: number; ecart: number }[];
  mentions: string[];
};
export type FluxServi = { n: Flux | null; motifN: string | null; n1: Flux | null; motifN1: string | null };
export type CategorieChange = 'OPERATIONNELLE' | 'INVESTISSEMENT' | 'FINANCEMENT';
export type EffetChange = { montant: number | string; categorie: CategorieChange; justification: string };
export const CATEGORIES_CHANGE: Record<CategorieChange, string> = {
  OPERATIONNELLE: 'Catégorie « exploitation »',
  INVESTISSEMENT: 'Catégorie « investissement »',
  FINANCEMENT: 'Catégorie « financement »',
};

const champ = 'w-full border border-border px-1.5 py-1 text-[11.5px]';
const fc = (v: number | null | undefined) => (v == null ? '' : v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const nombre = (v: string) => (v.trim() === '' ? NaN : Number(v.replace(/\s/g, '').replace(',', '.')));

/** IAS 7 § 28 · l'effet de change de l'exercice, individuel ou du groupe (`consolide`). */
export function DeclarationEffetChange({
  exerciceId,
  effetChange,
  consolide,
  peutEcrire,
  agir,
}: {
  exerciceId: string;
  effetChange: EffetChange | null;
  consolide: boolean;
  peutEcrire: boolean;
  agir: (f: () => Promise<unknown>) => Promise<void>;
}) {
  const [change, setChange] = useState({ montant: '', categorie: 'FINANCEMENT' as CategorieChange, justification: '' });
  return (
    <div className="mb-2">
      <p className="text-[11.5px] font-semibold mb-1">Effet des variations des cours de change sur la trésorerie de l’exercice (§ 28)</p>
      {effetChange ? (
        <div className="flex justify-between gap-2 text-[11.5px]">
          <span>
            {fc(Number(effetChange.montant))} · {CATEGORIES_CHANGE[effetChange.categorie]} · {effetChange.justification}
          </span>
          {peutEcrire && (
            <button className="text-[11px] underline" onClick={() => void agir(() => api.delete(`/ifrs/effet-change/${exerciceId}${consolide ? '?consolide=true' : ''}`))}>
              Retirer
            </button>
          )}
        </div>
      ) : (
        peutEcrire && (
          <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr_1fr_auto] gap-1.5">
            <input className={champ} placeholder="Hausse + / baisse −" value={change.montant} onChange={(e) => setChange({ ...change, montant: e.target.value })} />
            <select className={champ} value={change.categorie} onChange={(e) => setChange({ ...change, categorie: e.target.value as CategorieChange })}>
              {(Object.keys(CATEGORIES_CHANGE) as CategorieChange[]).map((c) => (
                <option key={c} value={c}>{CATEGORIES_CHANGE[c]} (où l’écart est comptabilisé)</option>
              ))}
            </select>
            <input className={champ} placeholder="Justification (écriture de conversion)" value={change.justification} onChange={(e) => setChange({ ...change, justification: e.target.value })} />
            <button
              className="border border-border px-2.5 py-1 text-[11.5px]"
              onClick={() =>
                void agir(async () => {
                  await api.put('/ifrs/effet-change', { exerciceId, ...change, montant: nombre(change.montant), consolide });
                  setChange({ montant: '', categorie: 'FINANCEMENT', justification: '' });
                })
              }
            >
              Déclarer
            </button>
          </div>
        )
      )}
    </div>
  );
}

export function TableauFluxIfrs({ flux }: { flux: FluxServi }) {
  return (
    <>
      {!flux.n ? (
        <p className="text-[11.5px] text-warning">{flux.motifN}</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-[11.5px]">
              <thead>
                <tr className="text-left border-b border-border">
                  <th className="py-1 pr-2">Flux</th>
                  <th className="py-1 pr-2">IAS 7</th>
                  <th className="py-1 pr-2 text-right">N</th>
                  <th className="py-1 text-right">N-1</th>
                </tr>
              </thead>
              <tbody>
                {flux.n.lignes.map((l) => (
                  <tr
                    key={l.cle}
                    className={l.nature === 'ECART' ? 'text-danger font-semibold' : l.nature === 'FLUX' ? 'border-b border-border/40' : 'font-bold border-t border-border'}
                  >
                    <td className="py-1 pr-2">{l.libelle}</td>
                    <td className="py-1 pr-2 text-text-dim">{l.ref}</td>
                    <td className="py-1 pr-2 text-right">{fc(l.montant)}</td>
                    <td className="py-1 text-right">{flux.n1 ? fc(flux.n1.lignes.find((x) => x.cle === l.cle)?.montant ?? 0) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!flux.n1 && <p className="text-[11.5px] text-text-dim mt-1">{flux.motifN1}</p>}
          <p className="text-[11.5px] font-semibold mt-2 mb-1">Rapprochement avec l’état de la situation financière (§ 45)</p>
          <table className="text-[11.5px]">
            <tbody>
              {flux.n.rapprochementSituation.map((x) => (
                <tr key={x.cle} className={x.cle === 'R_TABLEAU' ? 'font-bold' : ''}>
                  <td className="pr-3">{x.libelle}</td>
                  <td className="text-right">{fc(x.montant)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11.5px] font-semibold mt-2 mb-1">Du tableau SYSCOHADA au tableau IFRS</p>
          <table className="text-[11.5px]">
            <thead>
              <tr className="text-left border-b border-border">
                <th className="pr-3">Activité</th>
                <th className="pr-3 text-right">SYSCOHADA</th>
                <th className="pr-3 text-right">IFRS</th>
                <th className="text-right">Écart</th>
              </tr>
            </thead>
            <tbody>
              {flux.n.rapprochementLegal.map((x) => (
                <tr key={x.activite}>
                  <td className="pr-3">{x.activite}</td>
                  <td className="pr-3 text-right">{fc(x.syscohada)}</td>
                  <td className="pr-3 text-right">{fc(x.ifrs)}</td>
                  <td className="text-right">{fc(x.ecart)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {flux.n.mentions.map((m) => <p key={m} className="text-[11.5px] text-text-dim mt-1">{m}</p>)}
        </>
      )}
    </>
  );
}
