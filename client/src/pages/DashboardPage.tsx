import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useExercice } from '../lib/exercice';
import { useRibbon } from '../components/chrome/ribbon-context';
import { IconRefresh, IconExport, IconNew } from '../components/chrome/icons';
import type { Ecriture } from '../lib/types';

export function DashboardPage() {
  const { exerciceCourant } = useExercice();
  const [ecritures, setEcritures] = useState<Ecriture[] | null>(null);
  const navigate = useNavigate();

  const charger = async () => {
    if (!exerciceCourant) return;
    const res = await api.get<{ ecritures: Ecriture[] }>(`/ecritures?exerciceId=${exerciceCourant.id}`);
    setEcritures(res.ecritures.slice(-6).reverse());
  };

  useEffect(() => {
    charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exerciceCourant?.id]);

  useRibbon([
    { titre: 'AFFICHAGE', boutons: [{ label: 'Actualiser', Icon: IconRefresh, onClick: charger }] },
    { titre: 'SAISIE', boutons: [{ label: 'Nouvelle opération', Icon: IconNew, onClick: () => navigate('/saisie') }] },
    { titre: 'IMPRESSION', boutons: [{ label: 'Exporter', Icon: IconExport }] },
  ]);

  const soldeTresorerie = null; // Phase 2 : calculé depuis /ecritures/balance filtré classe 5

  return (
    <div className="p-2.5">
      <div className="bg-surface border border-border mb-2.5">
        <div className="px-2.5 py-1.5 bg-chrome border-b border-border text-[11px] font-bold">
          Tableau de bord {exerciceCourant && `— Exercice ${new Date(exerciceCourant.dateDebut).getFullYear()}`}
        </div>
        <div className="p-4 text-[12.5px] text-text-dim">
          {soldeTresorerie === null && (
            <p>
              La synthèse chiffrée (trésorerie disponible, dons du mois) arrive avec la Phase 2 — pour l'instant,
              consultez la <a href="#/journal" className="text-sel">balance</a> pour les soldes par compte.
            </p>
          )}
        </div>
      </div>

      <button
        onClick={() => navigate('/saisie')}
        className="flex items-center gap-2 px-4 py-2.5 bg-sel text-white text-[13.5px] font-semibold mb-2.5"
      >
        <IconNew width={17} height={17} />
        Enregistrer une opération
      </button>

      <div className="bg-surface border border-border">
        <div className="px-2.5 py-1.5 bg-chrome border-b border-border flex items-center justify-between">
          <span className="text-[11px] font-bold">DERNIÈRES OPÉRATIONS</span>
          <a href="#/journal" className="text-[10.5px] text-sel">Tout voir</a>
        </div>
        {!ecritures && <div className="p-3 text-[12px] text-text-dim">Chargement…</div>}
        {ecritures?.length === 0 && (
          <div className="p-3 text-[12px] text-text-dim">Aucune écriture pour cet exercice pour l'instant.</div>
        )}
        {ecritures?.map((e) => {
          const totalDebit = e.lignes.reduce((s, l) => s + Number(l.debit), 0);
          return (
            <div
              key={e.id}
              className="grid grid-cols-[70px_1fr_100px] gap-2 items-center px-2.5 py-1.5 border-b border-border last:border-b-0"
            >
              <span className="font-mono text-[10.5px] text-text-dim">{new Date(e.date).toLocaleDateString('fr-FR')}</span>
              <span className="text-[12px]">{e.libelle}</span>
              <span className="font-mono text-[12px] font-semibold text-right">{totalDebit.toLocaleString('fr-FR')}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
