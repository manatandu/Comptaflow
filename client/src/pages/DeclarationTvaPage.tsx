import { FormEvent, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useRibbon } from '../components/chrome/ribbon-context';
import { IconRefresh } from '../components/chrome/icons';
import type { DeclarationTva } from '../lib/types';

function premierJourDuMois(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

export function DeclarationTvaPage() {
  const [dateDebut, setDateDebut] = useState(premierJourDuMois());
  const [dateFin, setDateFin] = useState(new Date().toISOString().slice(0, 10));
  const [declaration, setDeclaration] = useState<DeclarationTva | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(false);

  const calculer = async (e?: FormEvent) => {
    e?.preventDefault();
    setChargement(true);
    setErreur(null);
    try {
      setDeclaration(await api.get<DeclarationTva>(`/taux-tva/declaration?dateDebut=${dateDebut}&dateFin=${dateFin}`));
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible de calculer la déclaration');
    } finally {
      setChargement(false);
    }
  };

  useRibbon([{ titre: 'AFFICHAGE', boutons: [{ label: 'Recalculer', Icon: IconRefresh, onClick: () => calculer() }] }]);

  return (
    <div className="p-2.5">
      <h1 className="text-[15px] font-bold mb-2.5">Déclaration TVA</h1>
      <p className="text-[11.5px] text-text-dim mb-3 max-w-[720px]">
        Registre de suivi par taux sur une période : TVA collectée (443) moins TVA déductible (445), à partir des
        lignes d'écriture posées par la saisie « Achat/Vente avec TVA ». Lecture seule — ne comptabilise pas la
        liquidation sur le compte 444 (État, TVA due ou crédit de TVA).
      </p>

      <form onSubmit={calculer} className="flex items-end gap-3 mb-4 max-w-[560px]">
        <label className="text-[11.5px] font-semibold text-text-dim">
          Du
          <input
            required
            type="date"
            value={dateDebut}
            onChange={(e) => setDateDebut(e.target.value)}
            className="mt-1 block border border-border-dark px-2.5 py-1.5 text-[13px] font-normal"
          />
        </label>
        <label className="text-[11.5px] font-semibold text-text-dim">
          Au
          <input
            required
            type="date"
            value={dateFin}
            onChange={(e) => setDateFin(e.target.value)}
            className="mt-1 block border border-border-dark px-2.5 py-1.5 text-[13px] font-normal"
          />
        </label>
        <button type="submit" disabled={chargement} className="bg-sel text-white text-[12.5px] font-semibold px-4 py-1.5 disabled:opacity-50">
          {chargement ? 'Calcul…' : 'Calculer'}
        </button>
      </form>

      {erreur && <div className="text-[12px] text-danger bg-danger-soft border border-danger/30 px-2.5 py-1.5 mb-3 max-w-[720px]">{erreur}</div>}

      {declaration && (
        <>
          <div className="border border-border max-w-[780px] mb-4">
            <div className="grid grid-cols-[80px_1fr_70px_140px_140px_140px] gap-2 px-3.5 py-1.5 bg-chrome border-b border-border text-[10px] font-bold text-text-dim">
              <span>CODE</span><span>INTITULÉ</span><span>TAUX</span><span className="text-right">COLLECTÉE</span><span className="text-right">DÉDUCTIBLE</span><span className="text-right">NET</span>
            </div>
            {declaration.lignes.length === 0 && (
              <div className="p-3 text-[12px] text-text-dim">Aucun mouvement de TVA sur cette période.</div>
            )}
            {declaration.lignes.map((l, i) => (
              <div
                key={l.tauxId}
                className={`grid grid-cols-[80px_1fr_70px_140px_140px_140px] gap-2 items-center px-3.5 py-1.5 border-b border-border last:border-b-0 text-[11.5px] font-mono ${
                  i % 2 === 0 ? 'bg-surface' : 'bg-surface-alt'
                }`}
              >
                <span className="font-semibold">{l.code}</span>
                <span className="truncate">{l.intitule}</span>
                <span className="text-right">{l.taux} %</span>
                <span className="text-right">{l.totalCollecte.toLocaleString('fr-FR')}</span>
                <span className="text-right">{l.totalDeductible.toLocaleString('fr-FR')}</span>
                <span className="text-right">{l.net.toLocaleString('fr-FR')}</span>
              </div>
            ))}
          </div>

          <div className="border border-border max-w-[780px] p-4 bg-surface flex items-center justify-between">
            <div className="font-mono text-[11px] text-text-dim">
              <div>Total TVA collectée : <span className="font-semibold text-text">{declaration.totalCollecte.toLocaleString('fr-FR')} CDF</span></div>
              <div>Total TVA déductible : <span className="font-semibold text-text">{declaration.totalDeductible.toLocaleString('fr-FR')} CDF</span></div>
            </div>
            <div className="text-right">
              <div className="font-mono text-[10px] font-semibold text-text-dim mb-1">
                {declaration.sens === 'A_PAYER' ? 'TVA NETTE À DÉCAISSER' : 'CRÉDIT DE TVA À REPORTER'}
              </div>
              <div className={`text-[18px] font-bold ${declaration.sens === 'A_PAYER' ? 'text-danger' : 'text-positive'}`}>
                {Math.abs(declaration.net).toLocaleString('fr-FR')} CDF
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
