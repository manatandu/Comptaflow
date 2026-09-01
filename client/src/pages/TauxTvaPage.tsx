import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { Compte, TauxTva } from '../lib/types';

/**
 * TAUX DE TAXES · la fenêtre Structure → Taux de taxes de Sage 100 i7 :
 * liste dense (code · intitulé · taux · sens par comptes rattachés · état),
 * création en boîte de dialogue. Chaque taux porte son compte de TVA
 * collectée (443, ventes) et/ou déductible (445, achats) · c'est ce
 * rattachement qui permet le calcul automatique en saisie et la déclaration.
 */
export function TauxTvaPage() {
  const { estAdmin } = useAuth();
  const [liste, setListe] = useState<TauxTva[] | null>(null);
  const [comptesClasse4, setComptesClasse4] = useState<Compte[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [nouveauOuvert, setNouveauOuvert] = useState(false);


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
      <div className="p-2">
        <h1 className="text-[12px] font-bold leading-tight mb-1.5">Taux de taxes</h1>
        <div className="border border-warning/30 bg-warning-soft px-4 py-3 text-[11px] max-w-[480px]">
          Cette fenêtre est réservée aux administrateurs du dossier.
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
      setNouveauOuvert(false);
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
    <div className="p-2">
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-[10px] font-mono text-text-dim leading-none">STRUCTURE</div>
          <h1 className="text-[12px] font-bold leading-tight">Taux de taxes (TVA)</h1>
        </div>
        <button type="button" onClick={() => setNouveauOuvert(true)} className="bg-sel text-white px-3.5 py-1 text-[10.5px] font-semibold">
          Nouveau taux
        </button>
      </div>

      {erreur && (
        <div className="text-[11px] text-danger bg-danger-soft border border-danger/30 px-3 py-1.5 mb-2">{erreur}</div>
      )}

      <div className="border border-border bg-surface shadow-posee">
        <div className="grid grid-cols-[80px_1fr_78px_210px_210px_80px] gap-2.5 px-3.5 py-1.5 bg-surface-alt border-b border-border-dark text-[10px] font-bold text-text-dim">
          <span>CODE</span>
          <span>INTITULÉ</span>
          <span className="text-right">TAUX</span>
          <span>COLLECTÉE (443 · VENTES)</span>
          <span>DÉDUCTIBLE (445 · ACHATS)</span>
          <span>ÉTAT</span>
        </div>
        {!liste && <div className="px-3.5 py-3 text-[11px] text-text-dim">Chargement…</div>}
        {liste?.map((t) => (
          <div
            key={t.id}
            className={`grid grid-cols-[80px_1fr_78px_210px_210px_80px] gap-2.5 items-center px-3.5 py-[4px] border-b border-border/50 last:border-b-0 text-[10.5px] hover:bg-sel-soft ${
              !t.estActif ? 'opacity-55' : ''
            }`}
          >
            <span className="font-mono font-semibold">{t.code}</span>
            <span className="truncate">{t.intitule}</span>
            <span className="font-mono text-right">{Number(t.taux).toLocaleString('fr-FR')} %</span>
            <span className="font-mono text-[10px] text-text-dim truncate">
              {t.compteCollecte ? `${t.compteCollecte.numero} ${t.compteCollecte.intitule}` : ''}
            </span>
            <span className="font-mono text-[10px] text-text-dim truncate">
              {t.compteDeductible ? `${t.compteDeductible.numero} ${t.compteDeductible.intitule}` : ''}
            </span>
            <button
              onClick={() => basculerActif(t)}
              className={`text-[10px] text-left ${t.estActif ? 'text-positive hover:underline' : 'text-warning hover:underline'}`}
            >
              {t.estActif ? 'Actif' : 'Inactif'}
            </button>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-text-dim mt-2 max-w-[860px]">
        Taux normal 16 %, réduits 1 % et 5 % (billets d'avion), zéro (exportations) · Ordonnance-Loi n° 10/001
        du 20/08/2010, art. 35 (modifié par la Loi de Finances 2026). Une opération exonérée (ex. activité
        normale d'une ASBL · art. 15.2/17.8) n'utilise aucun taux : ce n'est pas un taux à 0 %.
      </p>

      {nouveauOuvert && (
        <div className="anim-voile fixed inset-0 z-40 bg-black/35 flex items-center justify-center p-4">
          <form onSubmit={onCreer} className="anim-modale w-full max-w-[480px] bg-surface border border-border-dark shadow-flottante max-h-[calc(100dvh-2rem)] overflow-y-auto">
            <div
              className="h-[26px] flex items-center justify-between px-2.5 text-white text-[10.5px]"
              style={{ background: 'linear-gradient(180deg, var(--titlebar-from), var(--titlebar-to))' }}
            >
              <span>Nouveau taux de taxe</span>
              <button type="button" onClick={() => setNouveauOuvert(false)} className="text-white/85 hover:text-white px-1.5">
                ✕
              </button>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-[150px_1fr] items-center gap-x-3 gap-y-2.5">
                <label className="text-[11px] text-right">Code :</label>
                <input required autoFocus value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="TVA16…" className="border border-border-dark px-2.5 py-1.5 text-[12px] font-mono" />
                <label className="text-[11px] text-right">Intitulé :</label>
                <input required value={intitule} onChange={(e) => setIntitule(e.target.value)} className="border border-border-dark px-2.5 py-1.5 text-[12px]" />
                <label className="text-[11px] text-right">Taux (%) :</label>
                <input required type="number" min={0} max={100} step="0.01" value={taux} onChange={(e) => setTaux(e.target.value)} className="border border-border-dark px-2.5 py-1.5 text-[12px] font-mono text-right" />
                <label className="text-[11px] text-right">Collectée (443) :</label>
                <select value={compteCollecteId} onChange={(e) => setCompteCollecteId(e.target.value)} className="border border-border-dark px-2.5 py-1.5 text-[11px]">
                  <option value="">Aucun</option>
                  {comptesClasse4.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.numero} · {c.intitule}
                    </option>
                  ))}
                </select>
                <label className="text-[11px] text-right">Déductible (445) :</label>
                <select value={compteDeductibleId} onChange={(e) => setCompteDeductibleId(e.target.value)} className="border border-border-dark px-2.5 py-1.5 text-[11px]">
                  <option value="">Aucun</option>
                  {comptesClasse4.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.numero} · {c.intitule}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button type="button" onClick={() => setNouveauOuvert(false)} className="border border-border-dark bg-chrome hover:bg-chrome-alt px-4 py-1.5 text-[11px]">
                  Annuler
                </button>
                <button type="submit" disabled={envoi} className="bg-sel text-white px-4 py-1.5 text-[11px] font-semibold disabled:opacity-50">
                  {envoi ? 'Création…' : 'Créer le taux'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
