import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import type { Compte, Journal } from '../lib/types';

/**
 * MODÈLES DE SAISIE · les « opérations courantes » d'un journal.
 *
 * Ce que Sage appelle un modèle de saisie : un squelette d'écriture nommé,
 * dont les comptes et les libellés sont posés et dont les montants restent au
 * comptable. On l'appelle depuis la barre de la fenêtre de saisie.
 *
 * Cet écran est celui qui manquait. Le logiciel portait déjà des
 * écritures-types, mais ÉCRITES DANS LE CODE et les mêmes pour tous les
 * dossiers : une ONG qui passe chaque mois la même écriture de subvention
 * bailleur ne pouvait pas se la fabriquer.
 */

interface LigneModele {
  compteId: string;
  sens: 'DEBIT' | 'CREDIT';
  libelle: string;
  montant: string;
}

interface ModeleSaisie {
  id: string;
  intitule: string;
  journalId: string | null;
  journalCode: string | null;
  journalIntitule: string | null;
  estActif: boolean;
  lignes: Array<{
    ordre: number;
    compteId: string;
    compteNumero: string;
    compteIntitule: string;
    sens: 'DEBIT' | 'CREDIT';
    libelle: string | null;
    montant: number | null;
  }>;
}

const LIGNE_VIDE: LigneModele = { compteId: '', sens: 'DEBIT', libelle: '', montant: '' };

export function ModelesSaisiePage() {
  const [modeles, setModeles] = useState<ModeleSaisie[]>([]);
  const [journaux, setJournaux] = useState<Journal[]>([]);
  const [comptes, setComptes] = useState<Compte[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [edite, setEdite] = useState<string | null>(null);
  const [intitule, setIntitule] = useState('');
  const [journalId, setJournalId] = useState('');
  const [lignes, setLignes] = useState<LigneModele[]>([{ ...LIGNE_VIDE }, { ...LIGNE_VIDE, sens: 'CREDIT' }]);

  const charger = async () => {
    try {
      const [m, j, c] = await Promise.all([
        api.get<ModeleSaisie[]>('/modeles-saisie?inclureInactifs=true'),
        api.get<Journal[]>('/journaux'),
        api.get<Compte[]>('/comptes'),
      ]);
      setModeles(m);
      setJournaux(j);
      // Seuls les comptes d'IMPUTATION · un compte de totalisation ne reçoit
      // jamais d'écriture (CLAUDE.md §7), et le serveur le refuse de toute
      // façon. L'offrir ici ferait découvrir le refus après coup.
      setComptes(c.filter((x) => x.typeCompte === 'DETAIL' && x.estActif));
      setErreur(null);
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Chargement impossible');
    }
  };

  useEffect(() => {
    charger();
  }, []);

  const reinitialiser = () => {
    setEdite(null);
    setIntitule('');
    setJournalId('');
    setLignes([{ ...LIGNE_VIDE }, { ...LIGNE_VIDE, sens: 'CREDIT' }]);
  };

  const reprendre = (m: ModeleSaisie) => {
    setEdite(m.id);
    setIntitule(m.intitule);
    setJournalId(m.journalId ?? '');
    setLignes(
      m.lignes.map((l) => ({
        compteId: l.compteId,
        sens: l.sens,
        libelle: l.libelle ?? '',
        montant: l.montant === null ? '' : String(l.montant),
      })),
    );
  };

  const enregistrer = async () => {
    setErreur(null);
    setInfo(null);
    const corps = {
      intitule,
      journalId: journalId || undefined,
      lignes: lignes
        .filter((l) => l.compteId)
        .map((l) => ({
          compteId: l.compteId,
          sens: l.sens,
          libelle: l.libelle || undefined,
          // Un champ vide vaut « pas de montant », pas « zéro » · c'est le
          // cas courant, et zéro serait un montant figé à corriger.
          montant: l.montant.trim() === '' ? undefined : Number(l.montant),
        })),
    };
    try {
      if (edite) await api.patch(`/modeles-saisie/${edite}`, corps);
      else await api.post('/modeles-saisie', corps);
      setInfo(edite ? 'Modèle modifié.' : 'Modèle créé.');
      reinitialiser();
      await charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Enregistrement impossible');
    }
  };

  const supprimer = async (m: ModeleSaisie) => {
    setErreur(null);
    try {
      await api.delete(`/modeles-saisie/${m.id}`);
      if (edite === m.id) reinitialiser();
      await charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Suppression impossible');
    }
  };

  const champ = 'border border-border bg-surface px-2 py-1 text-[11px]';

  return (
    <div className="p-2">
      <div className="mb-2">
        <div className="text-[10px] font-mono text-text-dim leading-none">PARAMÈTRES</div>
        <h1 className="text-[12px] font-bold leading-tight">Modèles de saisie</h1>
        <p className="text-[10.5px] text-text-dim mt-1 max-w-[900px] leading-[1.5]">
          Un modèle est un squelette d'écriture nommé : les comptes et les libellés sont posés, les montants restent à
          la saisie. Il s'applique depuis la barre « Appeler un modèle » de la fenêtre du journal. Un modèle rattaché à
          un journal n'est proposé que dans celui-ci.
        </p>
      </div>

      {erreur && (
        <div className="text-[11px] text-danger bg-danger-soft border border-danger/30 px-3 py-2 mb-2 max-w-[900px]">
          {erreur}
        </div>
      )}
      {info && (
        <div className="text-[11px] text-positive bg-positive-soft border border-positive/30 px-3 py-2 mb-2 max-w-[900px]">
          {info}
        </div>
      )}

      <div className="border border-border bg-surface shadow-posee max-w-[900px] mb-3">
        <div className="px-3 py-1.5 bg-surface-alt border-b border-border-dark text-[10px] font-bold text-text-dim">
          {edite ? 'MODIFIER LE MODÈLE' : 'NOUVEAU MODÈLE'}
        </div>
        <div className="p-3 flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              value={intitule}
              onChange={(e) => setIntitule(e.target.value)}
              placeholder="Nom du modèle, ex. Avoir sur facture de vente"
              className={`${champ} flex-1`}
            />
            <select value={journalId} onChange={(e) => setJournalId(e.target.value)} className={`${champ} w-[240px]`}>
              <option value="">Tous les journaux</option>
              {journaux.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.code} · {j.intitule}
                </option>
              ))}
            </select>
          </div>

          {lignes.map((l, i) => (
            <div key={i} className="flex gap-2 items-center">
              <select
                value={l.compteId}
                onChange={(e) => setLignes((p) => p.map((x, k) => (k === i ? { ...x, compteId: e.target.value } : x)))}
                className={`${champ} flex-1 min-w-0`}
              >
                <option value="">Compte…</option>
                {comptes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.numero} · {c.intitule}
                  </option>
                ))}
              </select>
              <select
                value={l.sens}
                onChange={(e) =>
                  setLignes((p) => p.map((x, k) => (k === i ? { ...x, sens: e.target.value as 'DEBIT' | 'CREDIT' } : x)))
                }
                className={`${champ} w-[86px]`}
              >
                <option value="DEBIT">Débit</option>
                <option value="CREDIT">Crédit</option>
              </select>
              <input
                value={l.libelle}
                onChange={(e) => setLignes((p) => p.map((x, k) => (k === i ? { ...x, libelle: e.target.value } : x)))}
                placeholder="Libellé pré-rempli"
                className={`${champ} w-[220px]`}
              />
              <input
                value={l.montant}
                onChange={(e) => setLignes((p) => p.map((x, k) => (k === i ? { ...x, montant: e.target.value } : x)))}
                placeholder="Montant (facultatif)"
                className={`${champ} w-[140px] text-right`}
              />
              <button
                type="button"
                onClick={() => setLignes((p) => p.filter((_, k) => k !== i))}
                disabled={lignes.length <= 2}
                title={lignes.length <= 2 ? 'Un modèle porte au moins deux lignes' : 'Retirer cette ligne'}
                className="px-2 text-[11px] text-text-dim hover:text-danger disabled:opacity-30"
              >
                ×
              </button>
            </div>
          ))}

          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={() => setLignes((p) => [...p, { ...LIGNE_VIDE }])}
              className="border border-border-dark bg-chrome hover:bg-chrome-alt px-3 py-1 text-[10.5px]"
            >
              + Ligne
            </button>
            <div className="flex gap-2">
              {edite && (
                <button
                  type="button"
                  onClick={reinitialiser}
                  className="border border-border-dark bg-chrome hover:bg-chrome-alt px-3 py-1 text-[10.5px]"
                >
                  Annuler
                </button>
              )}
              <button
                type="button"
                onClick={enregistrer}
                disabled={intitule.trim().length < 2 || lignes.filter((l) => l.compteId).length < 2}
                className="bg-sel text-white px-4 py-1 text-[10.5px] font-semibold hover:brightness-110 disabled:opacity-40"
              >
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="border border-border bg-surface shadow-posee max-w-[900px]">
        <div className="grid grid-cols-[1.4fr_150px_70px_130px] gap-2 px-3 py-1.5 bg-surface-alt border-b border-border-dark text-[10px] font-bold text-text-dim">
          <span>MODÈLE</span>
          <span>JOURNAL</span>
          <span className="text-right">LIGNES</span>
          <span />
        </div>
        {modeles.length === 0 && (
          <div className="px-3 py-2 text-[11px] text-text-dim">
            Aucun modèle pour l'instant. Créez celui de l'opération que vous passez le plus souvent.
          </div>
        )}
        {modeles.map((m) => (
          <div
            key={m.id}
            className="grid grid-cols-[1.4fr_150px_70px_130px] gap-2 px-3 py-[5px] items-center border-b border-border/50 last:border-b-0 text-[10.5px]"
          >
            <span className={m.estActif ? '' : 'text-text-dim line-through'}>{m.intitule}</span>
            <span className="text-text-dim">{m.journalCode ?? 'Tous'}</span>
            <span className="text-right font-mono">{m.lignes.length}</span>
            <span className="flex gap-2 justify-end">
              <button type="button" onClick={() => reprendre(m)} className="text-sel hover:underline">
                Modifier
              </button>
              <button type="button" onClick={() => supprimer(m)} className="text-text-dim hover:text-danger">
                Supprimer
              </button>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
