import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { Aide } from './chrome/Aide';

/**
 * FUSION D'UNE STRUCTURE · la boîte commune au plan comptable et au plan des
 * tiers. Elle ne décide rien : elle nomme ce qui est absorbé, ce qui est
 * conservé, et laisse le serveur refuser en le disant (fusion-tiers.ts,
 * reimputation.ts). La fusion est une opération d'administrateur, comme la
 * suppression dont elle est l'issue.
 */
export function ModaleFusion({
  titre,
  absorbe,
  options,
  avecMotif,
  aide,
  source,
  onFermer,
  onValider,
}: {
  titre: string;
  /** Ce qui disparaît (tiers) ou s'endort (compte), en toutes lettres. */
  absorbe: string;
  options: { id: string; libelle: string }[];
  avecMotif: boolean;
  aide: string;
  source: string;
  onFermer: () => void;
  onValider: (cibleId: string, motif: string) => Promise<void>;
}) {
  const { estAdmin } = useAuth();
  const [cibleId, setCibleId] = useState('');
  const [motif, setMotif] = useState('');
  const [envoi, setEnvoi] = useState(false);

  const valider = async () => {
    setEnvoi(true);
    try {
      await onValider(cibleId, motif);
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/35 flex items-center justify-center p-4" onClick={onFermer}>
      <div
        className="anim-modale w-[520px] max-h-full overflow-auto rounded-[4px] bg-surface border border-border-dark shadow-dominante text-[11.5px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-3.5 h-[32px] border-b border-border">
          <span className="font-bold">{titre}</span>
          <div className="flex items-center gap-2">
            <Aide titre={titre} texte={aide} source={source} />
            <button onClick={onFermer} aria-label="Fermer">
              ✕
            </button>
          </div>
        </div>
        <div className="p-3 space-y-2">
          <p>{absorbe}</p>
          <label className="flex flex-col gap-0.5">
            <span className="text-text-dim">Conserver</span>
            <select
              aria-label="Structure conservée"
              value={cibleId}
              onChange={(e) => setCibleId(e.target.value)}
              className="border border-border px-2 py-[3px] bg-surface"
            >
              <option value="">Choisir…</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.libelle}
                </option>
              ))}
            </select>
          </label>
          {avecMotif && (
            <label className="flex flex-col gap-0.5">
              <span className="text-text-dim">Motif</span>
              <input value={motif} onChange={(e) => setMotif(e.target.value)} className="border border-border px-2 py-[2px]" />
            </label>
          )}
          <div className="flex justify-end">
            <button
              onClick={valider}
              disabled={!estAdmin || envoi || !cibleId || (avecMotif && !motif.trim())}
              className="bg-sel text-white font-semibold px-4 py-1.5 disabled:opacity-40"
            >
              {envoi ? '…' : 'Fusionner'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
