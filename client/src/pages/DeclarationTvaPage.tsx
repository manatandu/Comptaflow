import { FormEvent, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useExercice } from '../lib/exercice';
import { IconCheck } from '../components/chrome/icons';
import type { DeclarationTva } from '../lib/types';

function premierJourDuMois(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

export function DeclarationTvaPage() {
  const { exerciceCourant } = useExercice();
  const [dateDebut, setDateDebut] = useState(premierJourDuMois());
  const [dateFin, setDateFin] = useState(new Date().toISOString().slice(0, 10));
  const [declaration, setDeclaration] = useState<DeclarationTva | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [chargement, setChargement] = useState(false);
  const [comptabilisation, setComptabilisation] = useState(false);

  const calculer = async (e?: FormEvent) => {
    e?.preventDefault();
    setChargement(true);
    setErreur(null);
    setInfo(null);
    try {
      setDeclaration(await api.get<DeclarationTva>(`/taux-tva/declaration?dateDebut=${dateDebut}&dateFin=${dateFin}`));
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible de calculer la déclaration');
    } finally {
      setChargement(false);
    }
  };

  const comptabiliserLiquidation = async () => {
    if (!exerciceCourant || !declaration) return;
    if (
      !confirm(
        `Comptabiliser la liquidation TVA du ${dateDebut} au ${dateFin} ?\n\nPose une écriture qui solde la TVA collectée et déductible admise sur le compte 444 (${
          declaration.sens === 'A_PAYER' ? `TVA due : ${declaration.net.toLocaleString('fr-FR')} CDF` : `crédit de TVA à reporter : ${Math.abs(declaration.net).toLocaleString('fr-FR')} CDF`
        }). Action irréversible comme n'importe quelle écriture comptabilisée.`,
      )
    ) {
      return;
    }
    setComptabilisation(true);
    setErreur(null);
    setInfo(null);
    try {
      const resultat = await api.post<{ ecriture: { numeroPiece: number | null } }>('/taux-tva/declaration/comptabiliser', {
        exerciceId: exerciceCourant.id,
        dateDebut,
        dateFin,
      });
      setInfo(`Liquidation comptabilisée (pièce n°${resultat.ecriture.numeroPiece ?? '—'}).`);
      await calculer();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible de comptabiliser la liquidation');
    } finally {
      setComptabilisation(false);
    }
  };

  return (
    <div className="p-2.5">
      <div className="text-[10.5px] font-mono text-text-dim">ÉTAT</div>
      <h1 className="text-[15px] font-bold mb-2.5">Déclaration de TVA</h1>
      <p className="text-[11.5px] text-text-dim mb-3 max-w-[720px]">
        Registre de suivi par taux sur une période : TVA collectée (443) et TVA déductible (445), à partir des
        lignes d'écriture posées par la saisie « Achat/Vente avec TVA ». Le prorata de déduction (art. 43 O.-L.
        10/001, rapport recettes taxables / recettes totales, arrondi à l'unité supérieure) est appliqué à la TVA
        déductible brute.
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

      {erreur && <div className="text-[12px] text-danger bg-danger-soft border border-danger/30 px-2.5 py-1.5 mb-3 max-w-[780px]">{erreur}</div>}
      {info && <div className="text-[12px] text-positive bg-positive-soft border border-positive/30 px-2.5 py-1.5 mb-3 max-w-[780px]">{info}</div>}

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

          <div className="border border-border max-w-[780px] p-4 mb-4 bg-surface-alt">
            <div className="font-mono text-[10.5px] font-semibold text-text-dim mb-2">PRORATA DE DÉDUCTION (art. 43 O.-L. 10/001)</div>
            <div className="grid grid-cols-3 gap-3 font-mono text-[11.5px]">
              <div>
                Recettes taxables (numérateur)
                <div className="font-semibold text-[13px]">{declaration.prorata.numerateur.toLocaleString('fr-FR')} CDF</div>
              </div>
              <div>
                Recettes totales (dénominateur)
                <div className="font-semibold text-[13px]">{declaration.prorata.denominateur.toLocaleString('fr-FR')} CDF</div>
              </div>
              <div>
                Prorata (arrondi ↑)
                <div className="font-semibold text-[13px]">{declaration.prorata.pourcentage} %</div>
              </div>
            </div>
            <div className="mt-2 font-mono text-[11.5px] text-text-dim">
              TVA déductible brute {declaration.totalDeductible.toLocaleString('fr-FR')} × {declaration.prorata.pourcentage} % ={' '}
              <span className="font-semibold text-text">TVA déductible admise {declaration.totalDeductibleAdmise.toLocaleString('fr-FR')} CDF</span>
            </div>
          </div>

          <div className="border border-border max-w-[780px] p-4 bg-surface flex items-center justify-between">
            <div className="font-mono text-[11px] text-text-dim">
              <div>Total TVA collectée : <span className="font-semibold text-text">{declaration.totalCollecte.toLocaleString('fr-FR')} CDF</span></div>
              <div>Total TVA déductible admise : <span className="font-semibold text-text">{declaration.totalDeductibleAdmise.toLocaleString('fr-FR')} CDF</span></div>
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

          {(declaration.totalCollecte > 0 || declaration.totalDeductibleAdmise > 0) && (
            <button
              onClick={comptabiliserLiquidation}
              disabled={comptabilisation || !exerciceCourant}
              className="mt-4 bg-sel text-white text-[12.5px] font-semibold px-4 py-2 disabled:opacity-50 flex items-center gap-1.5"
            >
              <IconCheck width={14} height={14} />
              {comptabilisation ? 'Comptabilisation…' : 'Comptabiliser la liquidation'}
            </button>
          )}
        </>
      )}
    </div>
  );
}
