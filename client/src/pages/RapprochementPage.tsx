import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import type { Compte, RapprochementBancaire } from '../lib/types';

/**
 * Écran d'entrée du rapprochement bancaire (§3.4, manuel d'abord) : ouvrir
 * un nouveau rapprochement sur un compte de trésorerie, ou reprendre/
 * consulter l'historique des rapprochements déjà ouverts/clôturés.
 */
export function RapprochementPage() {
  const navigate = useNavigate();
  const [comptes, setComptes] = useState<Compte[] | null>(null);
  const [rapprochements, setRapprochements] = useState<RapprochementBancaire[] | null>(null);
  const [afficherFormulaire, setAfficherFormulaire] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const [compteId, setCompteId] = useState('');
  const [dateReleve, setDateReleve] = useState(() => new Date().toISOString().slice(0, 10));
  const [soldeReleve, setSoldeReleve] = useState('');

  const charger = async () => {
    const [comptesTresorerie, liste] = await Promise.all([
      api.get<Compte[]>('/comptes?classe=CLASSE_5&actifsSeuls=true&typeCompte=DETAIL'),
      api.get<RapprochementBancaire[]>('/rapprochements'),
    ]);
    setComptes(comptesTresorerie);
    setRapprochements(liste);
    if (!compteId && comptesTresorerie.length > 0) setCompteId(comptesTresorerie[0].id);
  };

  useEffect(() => {
    charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onOuvrir = async (e: FormEvent) => {
    e.preventDefault();
    setErreur(null);
    setEnvoi(true);
    try {
      const rapprochement = await api.post<RapprochementBancaire>('/rapprochements', {
        compteId,
        dateReleve,
        soldeReleve: Number(soldeReleve),
      });
      navigate(`/rapprochement/${rapprochement.id}`);
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : "Impossible d'ouvrir ce rapprochement");
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div className="p-2">
      <div className="text-[10px] font-mono text-text-dim leading-none">TRAITEMENT</div>
      <div className="flex items-center justify-between mb-1.5 max-w-[1100px]">
        <h1 className="text-[12px] font-bold leading-tight">Rapprochement bancaire</h1>
        <button type="button" onClick={() => setAfficherFormulaire((v) => !v)} className="bg-sel text-white rounded-[6px] px-3 py-[3px] text-[10.5px] font-semibold hover:opacity-90">
          Nouveau rapprochement
        </button>
      </div>

      {afficherFormulaire && (
        <form onSubmit={onOuvrir} className="bg-surface border border-border p-4 mb-4 max-w-[600px]">
          <div className="font-mono text-[10.5px] font-semibold text-text-dim mb-3">NOUVEAU RAPPROCHEMENT</div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <label className="text-[10.5px] font-semibold text-text-dim">
              Compte de trésorerie
              <select
                value={compteId}
                onChange={(e) => setCompteId(e.target.value)}
                className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal"
              >
                {(comptes ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.numero} · {c.intitule}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[10.5px] font-semibold text-text-dim">
              Date du relevé
              <input
                type="date"
                required
                value={dateReleve}
                onChange={(e) => setDateReleve(e.target.value)}
                className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal font-mono"
              />
            </label>
            <label className="text-[10.5px] font-semibold text-text-dim">
              Solde du relevé
              <input
                type="number"
                step="0.01"
                required
                value={soldeReleve}
                onChange={(e) => setSoldeReleve(e.target.value)}
                className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal font-mono"
              />
            </label>
          </div>
          <p className="text-[10.5px] text-text-dim mb-3">
            Le solde à saisir est celui affiché en bas du relevé papier/PDF de la banque à la date choisie · pas un
            solde comptable. L'écart avec le solde pointé sera calculé automatiquement sur l'écran suivant.
          </p>
          {erreur && <div className="text-[11px] text-danger bg-danger-soft border border-danger/30 px-2.5 py-1.5 mb-3">{erreur}</div>}
          <div className="flex gap-2">
            <button type="submit" disabled={envoi || !compteId} className="bg-sel text-white text-[11px] font-semibold px-4 py-1.5 disabled:opacity-50">
              {envoi ? 'Ouverture…' : 'Ouvrir'}
            </button>
            <button type="button" onClick={() => setAfficherFormulaire(false)} className="text-[11px] font-semibold text-text-dim px-4 py-1.5">
              Annuler
            </button>
          </div>
        </form>
      )}

      {!rapprochements && <div className="text-[11px] text-text-dim">Chargement…</div>}

      {rapprochements && (
        <div className="border border-border bg-surface shadow-posee max-w-[900px]">
          <div className="grid grid-cols-[110px_1.2fr_100px_110px_90px_100px] gap-3 px-3.5 py-1.5 bg-chrome border-b border-border text-[10px] font-bold text-text-dim">
            <span>DATE RELEVÉ</span>
            <span>COMPTE</span>
            <span className="text-right">SOLDE RELEVÉ</span>
            <span>OUVERT LE</span>
            <span>STATUT</span>
            <span />
          </div>
          {rapprochements.map((r, i) => (
            <div
              key={r.id}
              className={`grid grid-cols-[110px_1.2fr_100px_110px_90px_100px] gap-3 px-3.5 py-1.5 items-center border-b border-border last:border-b-0 text-[11px] ${
                i % 2 === 0 ? 'bg-surface' : 'bg-surface-alt'
              }`}
            >
              <span className="font-mono text-[10px]">{new Date(r.dateReleve).toLocaleDateString('fr-FR')}</span>
              <span>{r.compte ? `${r.compte.numero} · ${r.compte.intitule}` : r.compteId}</span>
              <span className="font-mono text-right">{r.soldeReleve.toLocaleString('fr-FR')}</span>
              <span className="font-mono text-[10px] text-text-dim">{new Date(r.createdAt).toLocaleDateString('fr-FR')}</span>
              <span
                className={`font-mono text-[10px] font-bold px-1.5 py-0.5 w-fit ${
                  r.statut === 'CLOTURE' ? 'text-text-dim bg-surface-alt' : 'text-sel bg-sel/10'
                }`}
              >
                {r.statut === 'CLOTURE' ? 'CLÔTURÉ' : 'EN COURS'}
              </span>
              <button onClick={() => navigate(`/rapprochement/${r.id}`)} className="text-[10px] text-sel hover:underline text-left">
                Ouvrir
              </button>
            </div>
          ))}
          {rapprochements.length === 0 && (
            <div className="p-3 text-[11px] text-text-dim">Aucun rapprochement pour l'instant.</div>
          )}
        </div>
      )}
    </div>
  );
}
