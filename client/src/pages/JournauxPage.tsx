import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useRibbon } from '../components/chrome/ribbon-context';
import { IconRefresh } from '../components/chrome/icons';
import type { Compte, Journal, NumerotationPiece, TypeJournal } from '../lib/types';

const LIBELLE_TYPE: Record<TypeJournal, string> = {
  ACHATS: 'Achats',
  VENTES: 'Ventes',
  TRESORERIE: 'Trésorerie',
  GENERAL: 'Général',
  SITUATION: 'Situation',
};

const LIBELLE_NUMEROTATION: Record<NumerotationPiece, string> = {
  MANUELLE: 'Manuelle',
  CONTINUE_JOURNAL: 'Continue par journal',
  CONTINUE_FICHIER: 'Continue pour le fichier',
  MENSUELLE: 'Mensuelle',
};

export function JournauxPage() {
  const { estAdmin } = useAuth();
  const [liste, setListe] = useState<Journal[] | null>(null);
  const [comptesTresorerie, setComptesTresorerie] = useState<Compte[]>([]);
  const [erreurChargement, setErreurChargement] = useState<string | null>(null);

  const [code, setCode] = useState('');
  const [intitule, setIntitule] = useState('');
  const [type, setType] = useState<TypeJournal>('GENERAL');
  const [compteTresorerieId, setCompteTresorerieId] = useState('');
  const [numerotation, setNumerotation] = useState<NumerotationPiece>('MANUELLE');
  const [erreurForm, setErreurForm] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const charger = async () => {
    try {
      setListe(await api.get<Journal[]>('/journaux'));
      setErreurChargement(null);
    } catch (err) {
      setErreurChargement(err instanceof ApiError ? err.message : 'Impossible de charger les journaux');
    }
  };

  useEffect(() => {
    if (!estAdmin) return;
    charger();
    api.get<Compte[]>('/comptes?classe=CLASSE_5&actifsSeuls=true').then(setComptesTresorerie);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estAdmin]);

  useRibbon([{ titre: 'AFFICHAGE', boutons: [{ label: 'Actualiser', Icon: IconRefresh, onClick: charger }] }]);

  if (!estAdmin) {
    return (
      <div className="p-4">
        <div className="border border-warning/30 bg-warning-soft px-4 py-3 text-[12.5px] max-w-[480px]">
          Cette page est réservée aux administrateurs du dossier.
        </div>
      </div>
    );
  }

  const onCreer = async (e: FormEvent) => {
    e.preventDefault();
    setErreurForm(null);
    setEnvoi(true);
    try {
      await api.post('/journaux', {
        code,
        intitule,
        type,
        numerotation,
        ...(type === 'TRESORERIE' ? { compteTresorerieId } : {}),
      });
      setCode('');
      setIntitule('');
      setType('GENERAL');
      setCompteTresorerieId('');
      setNumerotation('MANUELLE');
      await charger();
    } catch (err) {
      setErreurForm(err instanceof ApiError ? err.message : 'Impossible de créer ce journal');
    } finally {
      setEnvoi(false);
    }
  };

  const basculerActif = async (j: Journal) => {
    try {
      await api.patch(`/journaux/${j.id}`, { estActif: !j.estActif });
      await charger();
    } catch (err) {
      setErreurChargement(err instanceof ApiError ? err.message : 'Action impossible');
    }
  };

  return (
    <div className="p-2.5">
      <h1 className="text-[15px] font-bold mb-2.5">Codes journaux</h1>

      <form onSubmit={onCreer} className="bg-surface border border-border p-4 mb-4 max-w-[640px]">
        <div className="font-mono text-[11px] font-semibold text-text-dim mb-3">AJOUTER UN JOURNAL</div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <label className="text-[11.5px] font-semibold text-text-dim">
            Code (ex. ACH, VEN, BQ)
            <input
              required
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[13px] font-normal font-mono"
            />
          </label>
          <label className="text-[11.5px] font-semibold text-text-dim">
            Intitulé
            <input
              required
              value={intitule}
              onChange={(e) => setIntitule(e.target.value)}
              className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[13px] font-normal"
            />
          </label>
          <label className="text-[11.5px] font-semibold text-text-dim">
            Type
            <select
              value={type}
              onChange={(e) => setType(e.target.value as TypeJournal)}
              className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[13px] font-normal"
            >
              {(Object.keys(LIBELLE_TYPE) as TypeJournal[]).map((t) => (
                <option key={t} value={t}>
                  {LIBELLE_TYPE[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[11.5px] font-semibold text-text-dim">
            Numérotation des pièces
            <select
              value={numerotation}
              onChange={(e) => setNumerotation(e.target.value as NumerotationPiece)}
              className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[13px] font-normal"
            >
              {(Object.keys(LIBELLE_NUMEROTATION) as NumerotationPiece[]).map((n) => (
                <option key={n} value={n}>
                  {LIBELLE_NUMEROTATION[n]}
                </option>
              ))}
            </select>
          </label>
          {type === 'TRESORERIE' && (
            <label className="text-[11.5px] font-semibold text-text-dim col-span-2">
              Compte de trésorerie associé
              <select
                required
                value={compteTresorerieId}
                onChange={(e) => setCompteTresorerieId(e.target.value)}
                className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[13px] font-normal"
              >
                <option value="">— Sélectionner —</option>
                {comptesTresorerie.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.numero} — {c.intitule}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        {erreurForm && <div className="text-[12px] text-danger bg-danger-soft border border-danger/30 px-2.5 py-1.5 mb-3">{erreurForm}</div>}
        <button type="submit" disabled={envoi} className="bg-sel text-white text-[12.5px] font-semibold px-4 py-1.5 disabled:opacity-50">
          {envoi ? 'Création…' : 'Ajouter'}
        </button>
      </form>

      {erreurChargement && <div className="text-[12px] text-danger bg-danger-soft border border-danger/30 px-2.5 py-1.5 mb-3 max-w-[720px]">{erreurChargement}</div>}

      <div className="border border-border max-w-[820px]">
        <div className="grid grid-cols-[70px_1fr_100px_100px_150px_90px] gap-2 px-3.5 py-1.5 bg-chrome border-b border-border text-[10px] font-bold text-text-dim">
          <span>CODE</span><span>INTITULÉ</span><span>TYPE</span><span>NUMÉROTATION</span><span>TRÉSORERIE</span><span>STATUT</span>
        </div>
        {!liste && <div className="p-3 text-[12px] text-text-dim">Chargement…</div>}
        {liste?.map((j, i) => (
          <div key={j.id} className={`grid grid-cols-[70px_1fr_100px_100px_150px_90px] gap-2 items-center px-3.5 py-1.5 border-b border-border last:border-b-0 ${i % 2 === 0 ? 'bg-surface' : 'bg-surface-alt'}`}>
            <span className="font-mono text-[12.5px] font-semibold">{j.code}</span>
            <span className="text-[12.5px] truncate">{j.intitule}</span>
            <span className="text-[11px] text-text-dim">{LIBELLE_TYPE[j.type]}</span>
            <span className="text-[10.5px] text-text-dim">{LIBELLE_NUMEROTATION[j.numerotation]}</span>
            <span className="font-mono text-[11px] text-text-dim truncate">
              {j.compteTresorerie ? `${j.compteTresorerie.numero} — ${j.compteTresorerie.intitule}` : '—'}
            </span>
            <button
              onClick={() => basculerActif(j)}
              className={`font-mono text-[9.5px] font-bold px-1.5 py-0.5 w-fit ${j.estActif ? 'text-positive bg-positive-soft' : 'text-text-dim bg-surface-alt'}`}
            >
              {j.estActif ? 'ACTIF' : 'EN SOMMEIL'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
