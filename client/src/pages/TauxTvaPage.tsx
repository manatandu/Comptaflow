import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { Compte, TauxTva } from '../lib/types';

export function TauxTvaPage() {
  const { estAdmin } = useAuth();
  const [liste, setListe] = useState<TauxTva[] | null>(null);
  const [comptesClasse4, setComptesClasse4] = useState<Compte[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);

  const [code, setCode] = useState('');
  const [intitule, setIntitule] = useState('');
  const [taux, setTaux] = useState('16');
  const [compteCollecteId, setCompteCollecteId] = useState('');
  const [compteDeductibleId, setCompteDeductibleId] = useState('');
  const [envoi, setEnvoi] = useState(false);

  const charger = async () => {
    try {
      setListe(await api.get<TauxTva[]>('/taux-tva'));
      setErreur(null);
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible de charger les taux de TVA');
    }
  };

  useEffect(() => {
    if (!estAdmin) return;
    charger();
    api.get<Compte[]>('/comptes?classe=CLASSE_4&actifsSeuls=true&typeCompte=DETAIL').then(setComptesClasse4);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estAdmin]);

  if (!estAdmin) {
    return (
      <div className="p-2.5">
        <h1 className="text-[15px] font-bold mb-2.5">Taux de taxes</h1>
        <div className="border border-warning/30 bg-warning-soft px-4 py-3 text-[12.5px] max-w-[480px]">
          Cette page est réservée aux administrateurs du dossier.
        </div>
      </div>
    );
  }

  const onCreer = async (e: FormEvent) => {
    e.preventDefault();
    setErreur(null);
    setEnvoi(true);
    try {
      await api.post('/taux-tva', {
        code,
        intitule,
        taux: Number(taux),
        ...(compteCollecteId ? { compteCollecteId } : {}),
        ...(compteDeductibleId ? { compteDeductibleId } : {}),
      });
      setCode('');
      setIntitule('');
      setTaux('16');
      setCompteCollecteId('');
      setCompteDeductibleId('');
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible de créer ce taux de TVA');
    } finally {
      setEnvoi(false);
    }
  };

  const basculerActif = async (t: TauxTva) => {
    try {
      await api.patch(`/taux-tva/${t.id}`, { estActif: !t.estActif });
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Action impossible');
    }
  };

  return (
    <div className="p-2.5">
      <h1 className="text-[15px] font-bold mb-2.5">Taux de taxes (TVA)</h1>
      <p className="text-[11.5px] text-text-dim mb-3 max-w-[720px]">
        Taux normal 16 %, réduits 1 % et 5 % (billets d'avion), zéro (exportations) — Ordonnance-Loi n° 10/001 du
        20/08/2010, art. 35 (modifié par la Loi de Finances 2026). Une opération exonérée (ex. activité normale d'une
        ASBL — art. 15.2/17.8) n'utilise aucun taux : ce n'est pas un taux à 0 %.
      </p>

      {erreur && <div className="text-[12px] text-danger bg-danger-soft border border-danger/30 px-2.5 py-1.5 mb-3 max-w-[720px]">{erreur}</div>}

      <form onSubmit={onCreer} className="bg-surface border border-border p-4 mb-4 max-w-[720px]">
        <div className="font-mono text-[11px] font-semibold text-text-dim mb-3">AJOUTER UN TAUX</div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <label className="text-[11.5px] font-semibold text-text-dim">
            Code
            <input required value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[13px] font-normal font-mono" />
          </label>
          <label className="text-[11.5px] font-semibold text-text-dim">
            Taux (%)
            <input required type="number" min={0} max={100} step="0.01" value={taux} onChange={(e) => setTaux(e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[13px] font-normal" />
          </label>
          <label className="text-[11.5px] font-semibold text-text-dim col-span-2">
            Intitulé
            <input required value={intitule} onChange={(e) => setIntitule(e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[13px] font-normal" />
          </label>
          <label className="text-[11.5px] font-semibold text-text-dim">
            Compte de TVA collectée (443, vente)
            <select value={compteCollecteId} onChange={(e) => setCompteCollecteId(e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[13px] font-normal">
              <option value="">— Aucun —</option>
              {comptesClasse4.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.numero} — {c.intitule}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[11.5px] font-semibold text-text-dim">
            Compte de TVA déductible (445, achat)
            <select value={compteDeductibleId} onChange={(e) => setCompteDeductibleId(e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[13px] font-normal">
              <option value="">— Aucun —</option>
              {comptesClasse4.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.numero} — {c.intitule}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button type="submit" disabled={envoi} className="bg-sel text-white text-[12.5px] font-semibold px-4 py-1.5 disabled:opacity-50">
          {envoi ? 'Création…' : 'Ajouter'}
        </button>
      </form>

      <div className="border border-border max-w-[900px]">
        <div className="grid grid-cols-[80px_1fr_70px_180px_180px_90px] gap-2 px-3.5 py-1.5 bg-chrome border-b border-border text-[10px] font-bold text-text-dim">
          <span>CODE</span><span>INTITULÉ</span><span>TAUX</span><span>COLLECTÉE (443)</span><span>DÉDUCTIBLE (445)</span><span>STATUT</span>
        </div>
        {!liste && <div className="p-3 text-[12px] text-text-dim">Chargement…</div>}
        {liste?.map((t, i) => (
          <div
            key={t.id}
            className={`grid grid-cols-[80px_1fr_70px_180px_180px_90px] gap-2 items-center px-3.5 py-1.5 border-b border-border last:border-b-0 text-[11.5px] ${
              i % 2 === 0 ? 'bg-surface' : 'bg-surface-alt'
            }`}
          >
            <span className="font-mono font-semibold">{t.code}</span>
            <span className="truncate">{t.intitule}</span>
            <span className="font-mono text-right">{Number(t.taux).toLocaleString('fr-FR')} %</span>
            <span className="font-mono text-[10.5px] text-text-dim truncate">
              {t.compteCollecte ? `${t.compteCollecte.numero} — ${t.compteCollecte.intitule}` : '—'}
            </span>
            <span className="font-mono text-[10.5px] text-text-dim truncate">
              {t.compteDeductible ? `${t.compteDeductible.numero} — ${t.compteDeductible.intitule}` : '—'}
            </span>
            <button
              onClick={() => basculerActif(t)}
              className={`font-mono text-[9.5px] font-bold px-1.5 py-0.5 w-fit ${t.estActif ? 'text-positive bg-positive-soft' : 'text-text-dim bg-surface-alt'}`}
            >
              {t.estActif ? 'ACTIF' : 'INACTIF'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
