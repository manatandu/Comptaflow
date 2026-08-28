import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useExercice } from '../lib/exercice';
import { useRibbon } from '../components/chrome/ribbon-context';
import { IconFilter, IconExport } from '../components/chrome/icons';
import type { Ecriture, LigneBalance } from '../lib/types';

type Onglet = 'journal' | 'balance';

export function JournalPage() {
  const { exerciceCourant } = useExercice();
  const [onglet, setOnglet] = useState<Onglet>('journal');
  const [ecritures, setEcritures] = useState<Ecriture[]>([]);
  const [totaux, setTotaux] = useState({ debit: 0, credit: 0 });
  const [balance, setBalance] = useState<LigneBalance[]>([]);

  useEffect(() => {
    if (!exerciceCourant) return;
    api.get<{ ecritures: Ecriture[]; totaux: { debit: number; credit: number } }>(
      `/ecritures?exerciceId=${exerciceCourant.id}`,
    ).then((r) => {
      setEcritures(r.ecritures);
      setTotaux(r.totaux);
    });
    api.get<{ lignes: LigneBalance[] }>(`/ecritures/balance?exerciceId=${exerciceCourant.id}`).then((r) => setBalance(r.lignes));
  }, [exerciceCourant?.id]);

  useRibbon([
    { titre: 'AFFICHAGE', boutons: [{ label: 'Filtrer', Icon: IconFilter }] },
    { titre: 'IMPRESSION', boutons: [{ label: 'Exporter', Icon: IconExport }] },
  ]);

  const lignesJournal = ecritures.flatMap((e) =>
    e.lignes.map((l) => ({
      date: e.date,
      journal: e.journal?.code ?? '',
      libelle: e.libelle,
      compte: l.compte ? `${l.compte.numero} — ${l.compte.intitule}` : l.compteId,
      debit: Number(l.debit),
      credit: Number(l.credit),
      piece: e.reference,
      key: l.id,
    })),
  );

  return (
    <div className="p-2.5">
      <h1 className="text-[15px] font-bold mb-2.5">Journal &amp; grand livre</h1>

      <div className="flex bg-chrome border border-border border-b-0">
        <button
          onClick={() => setOnglet('journal')}
          className={`px-4 py-1.5 text-[11px] font-bold ${onglet === 'journal' ? 'bg-surface border-r border-border' : 'text-text-dim'}`}
        >
          JOURNAL
        </button>
        <button
          onClick={() => setOnglet('balance')}
          className={`px-4 py-1.5 text-[11px] font-bold ${onglet === 'balance' ? 'bg-surface border-r border-l border-border' : 'text-text-dim'}`}
        >
          BALANCE
        </button>
      </div>

      {onglet === 'journal' && (
        <div className="border border-border">
          <div className="grid grid-cols-[62px_46px_1.6fr_1.3fr_100px_100px_74px] gap-2.5 px-3.5 py-1.5 bg-surface-alt text-[10px] font-bold text-text-dim border-b border-border">
            <span>DATE</span>
            <span>JRN</span>
            <span>LIBELLÉ</span>
            <span>COMPTE</span>
            <span className="text-right">DÉBIT</span>
            <span className="text-right">CRÉDIT</span>
            <span>PIÈCE</span>
          </div>
          {lignesJournal.map((l, i) => (
            <div
              key={l.key}
              className={`grid grid-cols-[62px_46px_1.6fr_1.3fr_100px_100px_74px] gap-2.5 px-3.5 py-1 items-center border-b border-border text-[11.5px] ${
                i % 2 === 0 ? 'bg-surface' : 'bg-surface-alt'
              }`}
            >
              <span className="font-mono text-[10.5px] text-text-dim">{new Date(l.date).toLocaleDateString('fr-FR')}</span>
              <span className="font-mono text-text-dim">{l.journal}</span>
              <span>{l.libelle}</span>
              <span className="font-mono text-text-dim">{l.compte}</span>
              <span className="font-mono text-right">{l.debit ? l.debit.toLocaleString('fr-FR') : ''}</span>
              <span className="font-mono text-right">{l.credit ? l.credit.toLocaleString('fr-FR') : ''}</span>
              <span className="font-mono text-[10px] text-text-dim">{l.piece}</span>
            </div>
          ))}
          <div className="grid grid-cols-[62px_46px_1.6fr_1.3fr_100px_100px_74px] gap-2.5 px-3.5 py-1.5 bg-surface-alt border-t border-border-dark text-[11.5px] font-bold">
            <span />
            <span />
            <span>TOTAUX DE LA PÉRIODE</span>
            <span />
            <span className="font-mono text-right">{totaux.debit.toLocaleString('fr-FR')}</span>
            <span className="font-mono text-right">{totaux.credit.toLocaleString('fr-FR')}</span>
            <span />
          </div>
        </div>
      )}

      {onglet === 'balance' && (
        <div className="border border-border">
          <div className="grid grid-cols-[70px_1fr_110px_110px_110px] gap-2.5 px-3.5 py-1.5 bg-surface-alt text-[10px] font-bold text-text-dim border-b border-border">
            <span>N°</span>
            <span>LIBELLÉ</span>
            <span className="text-right">DÉBIT</span>
            <span className="text-right">CRÉDIT</span>
            <span className="text-right">SOLDE</span>
          </div>
          {balance.map((l, i) => (
            <div
              key={l.compteId}
              title={l.typeCompte === 'TOTAL' ? 'Compte Total — agrège les comptes Détail de même racine' : undefined}
              className={`grid grid-cols-[70px_1fr_110px_110px_110px] gap-2.5 px-3.5 py-1.5 items-center border-b border-border text-[12px] ${
                l.typeCompte === 'TOTAL' ? 'bg-chrome font-semibold' : i % 2 === 0 ? 'bg-surface' : 'bg-surface-alt'
              }`}
            >
              <span className="font-mono">{l.numero}</span>
              <span>{l.intitule}</span>
              <span className="font-mono text-right">{l.totalDebit.toLocaleString('fr-FR')}</span>
              <span className="font-mono text-right">{l.totalCredit.toLocaleString('fr-FR')}</span>
              <span className="font-mono text-right font-semibold">{l.solde.toLocaleString('fr-FR')}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
