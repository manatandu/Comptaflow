import { useState } from 'react';
import { api } from '../lib/api';

/**
 * L'ÉTAT DES VARIATIONS DES CAPITAUX PROPRES (IFRS 18 § 107 à 112) et la
 * déclaration de ses mouvements, rendus pour les comptes individuels ET pour
 * les comptes consolidés. Au consolidé s'ajoutent le total des propriétaires
 * de la société mère, la colonne des participations ne donnant pas le
 * contrôle (§ 107 a) et la ligne des variations de parts d'intérêts
 * (§ 107 c iii). Un seul rendu · deux copies divergeraient au premier
 * correctif.
 */
export type LigneVariation = {
  cle: string;
  libelle: string;
  ref?: string;
  nature: 'SOLDE' | 'MOUVEMENT' | 'TOTAL' | 'ECART';
  capital: number;
  reserves: number;
  autres: number;
  groupe?: number;
  minoritaires?: number;
  total: number;
};
export type Variation = { lignes: LigneVariation[]; mentions: string[]; motifsNonPubliable: string[] };
export type TypeMouvement = 'CHANGEMENT_METHODE' | 'CORRECTION_ERREUR' | 'APPORT' | 'DISTRIBUTION' | 'TRANSFERT' | 'VARIATION_PARTS_INTERETS';
export type Composante = 'CAPITAL' | 'RESERVES' | 'AUTRES_COMPOSANTES' | 'MINORITAIRES';
export type VariationServie = {
  composantes: Partial<Record<Composante, { libelle: string }>>;
  n: Variation | null;
  motifN: string | null;
  n1: Variation | null;
  motifN1: string | null;
  mouvements: { id: string; type: TypeMouvement; composante: Composante; montant: number; libelle: string; justification: string }[];
};
const TYPES_MOUVEMENT: Record<TypeMouvement, string> = {
  APPORT: 'Apport des propriétaires (§ 107 c iii)',
  DISTRIBUTION: 'Distribution aux propriétaires (§ 107 c iii)',
  VARIATION_PARTS_INTERETS: 'Variation de parts d’intérêts sans perte du contrôle (§ 107 c iii)',
  TRANSFERT: 'Transfert entre composantes',
  CHANGEMENT_METHODE: 'Changement de méthode comptable (§ 107 b, IAS 8)',
  CORRECTION_ERREUR: 'Correction d’erreur (§ 107 b, IAS 8)',
};

const champ = 'w-full border border-border px-1.5 py-1 text-[11.5px]';
const fc = (v: number | null | undefined) => (v == null ? '' : v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const nombre = (v: string) => (v.trim() === '' ? NaN : Number(v.replace(/\s/g, '').replace(',', '.')));

export function VariationCapitauxPropresIfrs({
  titre,
  vcp,
  consolide,
  exerciceId,
  peutEcrire,
  agir,
}: {
  titre: string;
  vcp: VariationServie;
  consolide: boolean;
  exerciceId: string;
  peutEcrire: boolean;
  agir: (f: () => Promise<unknown>) => Promise<void>;
}) {
  const [mvt, setMvt] = useState({ type: 'DISTRIBUTION' as TypeMouvement, composante: 'RESERVES' as Composante, montant: '', libelle: '', justification: '' });
  const types = (Object.keys(TYPES_MOUVEMENT) as TypeMouvement[]).filter((t) => consolide || t !== 'VARIATION_PARTS_INTERETS');
  const composantes = Object.keys(vcp.composantes) as Composante[];
  const libelle = (c: Composante) => vcp.composantes[c]?.libelle ?? c;

  const bloc = (sousTitre: string, v: Variation | null, motif: string | null) => (
    <div className="mb-2">
      <p className="text-[11.5px] font-semibold mb-1">{sousTitre}</p>
      {!v ? (
        <p className="text-[11.5px] text-warning">{motif}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[11.5px]">
            <thead>
              <tr className="text-left border-b border-border">
                <th className="py-1 pr-2">Mouvement</th>
                <th className="py-1 pr-2">IFRS 18</th>
                <th className="py-1 pr-2 text-right">{libelle('CAPITAL')}</th>
                <th className="py-1 pr-2 text-right">{libelle('RESERVES')}</th>
                <th className="py-1 pr-2 text-right">{libelle('AUTRES_COMPOSANTES')}</th>
                {consolide && <th className="py-1 pr-2 text-right">Propriétaires de la société mère</th>}
                {consolide && <th className="py-1 pr-2 text-right">{libelle('MINORITAIRES')}</th>}
                <th className="py-1 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {v.lignes.map((l) => (
                <tr
                  key={l.cle}
                  className={l.nature === 'ECART' ? 'text-danger font-semibold' : l.nature === 'MOUVEMENT' ? 'border-b border-border/40' : 'font-bold border-t border-border'}
                >
                  <td className="py-1 pr-2">{l.libelle}</td>
                  <td className="py-1 pr-2 text-text-dim">{l.ref}</td>
                  <td className="py-1 pr-2 text-right">{fc(l.capital)}</td>
                  <td className="py-1 pr-2 text-right">{fc(l.reserves)}</td>
                  <td className="py-1 pr-2 text-right">{fc(l.autres)}</td>
                  {consolide && <td className="py-1 pr-2 text-right">{fc(l.groupe)}</td>}
                  {consolide && <td className="py-1 pr-2 text-right">{fc(l.minoritaires)}</td>}
                  <td className="py-1 text-right">{fc(l.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  return (
    <section className="border border-border bg-surface px-3.5 py-2.5 mb-2.5">
      <h2 className="text-[11.5px] font-bold mb-1.5">{titre}</h2>
      {bloc('Exercice N', vcp.n, vcp.motifN)}
      {bloc('Exercice N-1 (comparatif, § 10 f)', vcp.n1, vcp.motifN1)}
      <p className="text-[11.5px] font-semibold mt-2 mb-1">Mouvements déclarés de l’exercice</p>
      {peutEcrire && (
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_140px] gap-1.5 mb-1.5">
          <select className={champ} value={mvt.type} onChange={(e) => setMvt({ ...mvt, type: e.target.value as TypeMouvement })}>
            {types.map((t) => (
              <option key={t} value={t}>{TYPES_MOUVEMENT[t]}</option>
            ))}
          </select>
          <select className={champ} value={mvt.composante} onChange={(e) => setMvt({ ...mvt, composante: e.target.value as Composante })}>
            {composantes.map((c) => (
              <option key={c} value={c}>{libelle(c)}</option>
            ))}
          </select>
          <input className={champ} placeholder="Hausse + / baisse −" value={mvt.montant} onChange={(e) => setMvt({ ...mvt, montant: e.target.value })} />
          <input className={champ} placeholder="Libellé" value={mvt.libelle} onChange={(e) => setMvt({ ...mvt, libelle: e.target.value })} />
          <input className={champ} placeholder="Justification (procès-verbal, décision, note IAS 8)" value={mvt.justification} onChange={(e) => setMvt({ ...mvt, justification: e.target.value })} />
          <button
            className="border border-border px-2.5 py-1 text-[11.5px]"
            onClick={() =>
              void agir(async () => {
                await api.post('/ifrs/mouvements-capitaux-propres', { exerciceId, ...mvt, montant: nombre(mvt.montant), ...(consolide ? { consolide: true } : {}) });
                setMvt({ ...mvt, montant: '', libelle: '', justification: '' });
              })
            }
          >
            Déclarer
          </button>
        </div>
      )}
      {vcp.mouvements.length === 0 ? (
        <p className="text-[11.5px] text-text-dim">Aucun mouvement déclaré · la variation n’est expliquée que par le résultat global.</p>
      ) : (
        vcp.mouvements.map((m) => (
          <div key={m.id} className="flex justify-between gap-2 border-b border-border/60 py-1 text-[11.5px]">
            <span>
              <strong>{m.libelle}</strong> · {TYPES_MOUVEMENT[m.type]} · {libelle(m.composante)} · {fc(m.montant)} · {m.justification}
            </span>
            {peutEcrire && (
              <button className="text-[11px] underline" onClick={() => void agir(() => api.delete(`/ifrs/mouvements-capitaux-propres/${m.id}`))}>
                Retirer
              </button>
            )}
          </div>
        ))
      )}
    </section>
  );
}
