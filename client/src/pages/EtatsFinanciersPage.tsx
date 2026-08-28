import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useExercice } from '../lib/exercice';
import { useRibbon } from '../components/chrome/ribbon-context';
import { IconExport, IconCheck } from '../components/chrome/icons';
import type { Bilan } from '../lib/types';

export function EtatsFinanciersPage() {
  const { exerciceCourant } = useExercice();
  const [bilan, setBilan] = useState<Bilan | null>(null);

  useEffect(() => {
    if (!exerciceCourant) return;
    api.get<Bilan>(`/etats-financiers/bilan?exerciceId=${exerciceCourant.id}`).then(setBilan);
  }, [exerciceCourant?.id]);

  useRibbon([{ titre: 'IMPRESSION', boutons: [{ label: 'Exporter PDF', Icon: IconExport }] }]);

  const exporterBilan = () => {
    if (!exerciceCourant) return;
    api.telecharger(`/exports/etats-financiers/bilan?exerciceId=${exerciceCourant.id}`, 'bilan.xlsx');
  };

  return (
    <div className="p-2.5">
      <div className="flex items-center justify-between mb-2.5">
        <h1 className="text-[15px] font-bold">États financiers — Bilan associatif</h1>
        <div className="flex items-center gap-2.5">
          {exerciceCourant && (
            <span className="font-mono text-[11px] border border-border bg-surface px-2.5 py-1.5">
              Exercice {new Date(exerciceCourant.dateDebut).getFullYear()}
            </span>
          )}
          <button
            onClick={exporterBilan}
            className="flex items-center gap-1.5 border border-border bg-surface px-3 py-1.5 text-[11px] font-bold hover:bg-surface-alt"
          >
            <IconExport width={13} height={13} />
            Exporter Excel
          </button>
        </div>
      </div>

      {!bilan && <div className="text-[12px] text-text-dim">Chargement…</div>}

      {bilan && (
        <>
          <div className="grid grid-cols-2 gap-px bg-border border border-border max-w-[1180px]">
            <div className="bg-surface">
              <div className="px-4 py-2 bg-surface-alt border-b border-border text-[11.5px] font-bold">ACTIF</div>
              {bilan.actif.map((l) => (
                <div key={l.numero} className="flex justify-between px-4 py-1 text-[12px]">
                  <span>{l.intitule}</span>
                  <span className="font-mono">{l.montant.toLocaleString('fr-FR')}</span>
                </div>
              ))}
              <div className="flex justify-between px-4 py-2 bg-surface-alt border-t border-border-dark text-[12.5px] font-bold mt-2">
                <span>TOTAL ACTIF</span>
                <span className="font-mono">{bilan.totalActif.toLocaleString('fr-FR')}</span>
              </div>
            </div>
            <div className="bg-surface">
              <div className="px-4 py-2 bg-surface-alt border-b border-border text-[11.5px] font-bold">PASSIF</div>
              {bilan.passif.map((l) => (
                <div key={l.numero} className="flex justify-between px-4 py-1 text-[12px]">
                  <span>{l.intitule}</span>
                  <span className="font-mono">{l.montant.toLocaleString('fr-FR')}</span>
                </div>
              ))}
              <div className="flex justify-between px-4 py-2 bg-surface-alt border-t border-border-dark text-[12.5px] font-bold mt-2">
                <span>TOTAL PASSIF</span>
                <span className="font-mono">{bilan.totalPassif.toLocaleString('fr-FR')}</span>
              </div>
            </div>
          </div>

          <div
            className={`flex items-center gap-2 mt-3 px-3.5 py-2.5 border max-w-[1180px] ${
              bilan.equilibre ? 'border-positive/30 bg-positive-soft' : 'border-danger/30 bg-danger-soft'
            }`}
          >
            <IconCheck width={14} height={14} className={bilan.equilibre ? 'text-positive' : 'text-danger'} />
            <span className="font-mono text-[11.5px] font-medium">
              {bilan.equilibre ? 'LE BILAN EST ÉQUILIBRÉ — ACTIF = PASSIF' : 'DÉSÉQUILIBRE DÉTECTÉ — vérifier les écritures'}
            </span>
          </div>

          <p className="text-[11px] text-text-dim mt-3 max-w-[1180px]">
            ⚠ Regroupement simplifié classe → poste (MVP) — voir le commentaire de{' '}
            <code>etats-financiers.service.ts</code> côté API avant toute utilisation en production.
          </p>
        </>
      )}
    </div>
  );
}
