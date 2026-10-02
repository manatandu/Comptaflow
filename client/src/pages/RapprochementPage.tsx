import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Aide } from '../components/chrome/Aide';
import type { Compte, RapprochementBancaire } from '../lib/types';
import { montant } from '../lib/montants';
import { motifAucunCompteRetenu, RETENUS } from '../lib/comptes-proposes';
import { usePreselectionUnique } from '../lib/preselection-unique';

/**
 * Écran d'entrée du rapprochement bancaire (§3.4, manuel d'abord) : ouvrir
 * un nouveau rapprochement sur un compte de trésorerie, ou reprendre/
 * consulter l'historique des rapprochements déjà ouverts/clôturés.
 */
export function RapprochementPage() {
  const navigate = useNavigate();
  const { peutEcrire } = useAuth();
  const [comptes, setComptes] = useState<Compte[] | null>(null);
  const [rapprochements, setRapprochements] = useState<RapprochementBancaire[] | null>(null);
  const [afficherFormulaire, setAfficherFormulaire] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const [compteId, setCompteId] = useState('');
  const [dateReleve, setDateReleve] = useState(() => new Date().toISOString().slice(0, 10));
  const [soldeReleve, setSoldeReleve] = useState('');

  // LISTE DE CHOIX · comptes de trésorerie retenus ou utilisés
  // (`lib/comptes-proposes.ts`). Un seul se présélectionne ; parmi plusieurs,
  // rien · prendre le premier serait deviner la banque. Un échec de lecture
  // se dit, il ne laisse pas un formulaire vide et muet.
  const charger = async () => {
    try {
      const [comptesTresorerie, liste] = await Promise.all([
        api.get<Compte[]>(`/comptes?classe=CLASSE_5&actifsSeuls=true&typeCompte=DETAIL&${RETENUS}`),
        api.get<RapprochementBancaire[]>('/rapprochements'),
      ]);
      setComptes(comptesTresorerie);
      setRapprochements(liste);
    } catch (err) {
      setErreur(`Lecture impossible · ${err instanceof ApiError ? err.message : 'serveur injoignable'}`);
    }
  };
  usePreselectionUnique(comptes, compteId, setCompteId);

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
      {peutEcrire && (
        <div className="flex items-center justify-end mb-1.5 max-w-[900px]">
          <button type="button" onClick={() => setAfficherFormulaire((v) => !v)} className="bg-sel text-white rounded-[3px] px-3 py-[3px] text-[11.5px] font-semibold hover:opacity-90">
            Nouveau rapprochement
          </button>
        </div>
      )}

      {peutEcrire && afficherFormulaire && (
        <form onSubmit={onOuvrir} className="bg-surface border border-border p-4 mb-4 max-w-[600px]">
          <div className="font-mono text-[11.5px] font-semibold text-text-dim mb-3">Nouveau rapprochement</div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <label className="text-[11.5px] font-semibold text-text-dim">
              Compte de trésorerie
              <select
                value={compteId}
                onChange={(e) => setCompteId(e.target.value)}
                className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal"
              >
                <option value="" />
                {(comptes ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.numero} · {c.intitule}
                  </option>
                ))}
              </select>
              {comptes && comptes.length === 0 && (
                <span className="block mt-1 text-[11px] font-normal text-warning">{motifAucunCompteRetenu(comptes, 'de trésorerie (classe 5)')}</span>
              )}
            </label>
            <label className="text-[11.5px] font-semibold text-text-dim">
              Date du relevé
              <input
                type="date"
                required
                value={dateReleve}
                onChange={(e) => setDateReleve(e.target.value)}
                className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal font-mono"
              />
            </label>
            <label className="text-[11.5px] font-semibold text-text-dim">
              <span className="flex items-center gap-1.5">
                Solde du relevé
                <Aide
                  titre="Solde du relevé"
                  texte="Le solde à saisir est celui affiché en bas du relevé papier/PDF de la banque à la date choisie · pas un solde comptable. L'écart avec le solde pointé sera calculé automatiquement sur l'écran suivant."
                  source="OmegaX"
                />
              </span>
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
          {erreur && <div className="text-[11.5px] text-danger bg-danger-soft border border-danger/30 px-2.5 py-1.5 mb-3">{erreur}</div>}
          <div className="flex gap-2">
            <button type="submit" disabled={envoi || !compteId} className="bg-sel text-white text-[11.5px] font-semibold px-4 py-1.5 disabled:opacity-50">
              {envoi ? 'Ouverture…' : 'Ouvrir'}
            </button>
            <button type="button" onClick={() => setAfficherFormulaire(false)} className="text-[11.5px] font-semibold text-text-dim px-4 py-1.5">
              Annuler
            </button>
          </div>
        </form>
      )}

      {erreur && !afficherFormulaire && (
        <div className="text-[11.5px] text-danger bg-danger-soft border border-danger/30 px-2.5 py-1.5 mb-3 max-w-[900px]">{erreur}</div>
      )}
      {!rapprochements && !erreur && <div className="text-[11.5px] text-text-dim">Chargement…</div>}

      {rapprochements && (
        <div
          // `overflow-x-auto` ici, `min-w` sur les lignes · les 598 px de colonnes
          // incompressibles du tableau ne tiennent pas dans les ~326 px utiles d'une
          // fenêtre à 360 px, et sans conteneur le débordement remontait à la fenêtre,
          // qui emportait alors titre, onglets et boutons hors de l'écran.
          className="border border-border bg-surface shadow-posee max-w-[900px] overflow-x-auto"
        >
          <div className="grid grid-cols-[110px_1.2fr_100px_110px_90px_100px] min-w-[750px] gap-3 px-3.5 py-1.5 bg-chrome border-b border-border text-[11px] font-bold text-text-dim">
            <span>Date relevé</span>
            <span>COMPTE</span>
            <span className="text-right">Solde relevé</span>
            <span>Ouvert le</span>
            <span>STATUT</span>
            <span />
          </div>
          {rapprochements.map((r, i) => (
            <div
              key={r.id}
              className={`grid grid-cols-[110px_1.2fr_100px_110px_90px_100px] min-w-[750px] gap-3 px-3.5 py-1.5 items-center border-b border-border last:border-b-0 text-[11.5px] ${
                i % 2 === 0 ? 'bg-surface' : 'bg-surface-alt'
              }`}
            >
              <span className="font-mono text-[11px]">{new Date(r.dateReleve).toLocaleDateString('fr-FR')}</span>
              <span>{r.compte ? `${r.compte.numero} · ${r.compte.intitule}` : r.compteId}</span>
              <span className="font-mono text-right">{montant(r.soldeReleve)}</span>
              <span className="font-mono text-[11px] text-text-dim">{new Date(r.createdAt).toLocaleDateString('fr-FR')}</span>
              <span
                className={`font-mono text-[11px] font-bold px-1.5 py-0.5 w-fit ${
                  r.statut === 'CLOTURE' ? 'text-text-dim bg-surface-alt' : 'text-sel bg-sel/10'
                }`}
              >
                {r.statut === 'CLOTURE' ? 'CLÔTURÉ' : 'EN COURS'}
              </span>
              <button onClick={() => navigate(`/rapprochement/${r.id}`)} className="text-[11px] text-sel hover:underline text-left">
                Ouvrir
              </button>
            </div>
          ))}
          {rapprochements.length === 0 && (
            <div className="p-3 text-[11.5px] text-text-dim">Aucun rapprochement pour l'instant.</div>
          )}
        </div>
      )}
    </div>
  );
}
