import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { montant } from '../lib/montants';
import type { Journal } from '../lib/types';
import { Aide } from './chrome/Aide';
import { LIBELLES_NATURE, NatureLocationAcquisition } from '../lib/location-acquisition';

/**
 * LA CLÔTURE DES CONTRATS DE LOCATION-ACQUISITION, dans la fenêtre
 * Immobilisations · le serveur propose la ventilation de l'exercice et la
 * REJOUE au passage (`location-acquisition.service.ts`). L'écran ne calcule
 * rien.
 */
interface ContratListe {
  id: string;
  reference: string | null;
  nature: NatureLocationAcquisition;
  designation: string;
  dette: number;
  cloture: { loyers: number; interetsCourus: number } | null;
}
interface Proposition {
  comptes: { dette: string; interetsCourus: string; interets: string; redevances: string };
  ventilation: { loyers: number; capital: number; interets: number; interetsCourus: number; rangs: number[] };
  extourne: number;
  disponible623: number;
  refus: string[];
}

export function ClotureLocationAcquisition({ exerciceId, journaux }: { exerciceId: string | undefined; journaux: Journal[] }) {
  const { peutEcrire } = useAuth();
  const [contrats, setContrats] = useState<ContratListe[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [proposition, setProposition] = useState<Proposition | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const journalOd = journaux.find((j) => j.code === 'OD') ?? journaux[0];

  const charger = useCallback(async () => {
    if (!exerciceId) return;
    setErreur(null);
    try {
      setContrats(await api.get<ContratListe[]>(`/immobilisations/location-acquisition/contrats?exerciceId=${exerciceId}`));
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Contrats de location-acquisition illisibles');
    }
  }, [exerciceId]);
  useEffect(() => {
    void charger();
  }, [charger]);

  const proposer = async (id: string) => {
    setOuvert(id);
    setProposition(null);
    setErreur(null);
    try {
      setProposition(await api.get<Proposition>(`/immobilisations/location-acquisition/contrats/${id}/cloture?exerciceId=${exerciceId}`));
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Proposition impossible');
    }
  };

  const passer = async (id: string) => {
    if (!exerciceId || !journalOd) return;
    setEnvoi(true);
    setErreur(null);
    try {
      await api.post(`/immobilisations/location-acquisition/contrats/${id}/cloture`, { exerciceId, journalId: journalOd.id });
      setOuvert(null);
      setProposition(null);
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Clôture refusée');
    } finally {
      setEnvoi(false);
    }
  };

  // Un dossier sans contrat ne voit pas le cadre · la liste a été LUE.
  if (!erreur && (contrats === null || contrats.length === 0)) return null;

  return (
    <div className="border border-border bg-surface shadow-posee max-w-[1180px] mt-3">
      <div className="px-3.5 py-1.5 bg-chrome border-b border-border text-[11.5px] font-semibold text-text-dim flex items-center gap-1.5">
        Contrats de location-acquisition
        <Aide
          titre="Clôture des contrats"
          texte="Les loyers s'enregistrent en redevances au fil de l'exercice. À la clôture, ils se virent à la dette pour leur part de remboursement et en intérêts pour le reste ; les intérêts courus depuis la dernière échéance sont constatés, puis extournés à l'ouverture de l'exercice suivant. Les intérêts courus se comptent au taux de l'échéancier, au prorata des jours de la période (convention d'OmegaX)."
          source="AUDCIF Titre VIII ch. 8 § 2.1.8 · fiche du compte 17"
        />
      </div>
      {erreur && <div className="px-3.5 py-1.5 text-[11.5px] text-danger">{erreur}</div>}
      {(contrats ?? []).map((c) => (
        <div key={c.id} className="border-b border-border last:border-0">
          <div className="grid grid-cols-[1.4fr_160px_120px_150px_auto] gap-2.5 px-3.5 py-1.5 items-center text-[11.5px]">
            <span>{c.designation}{c.reference ? ` · ${c.reference}` : ''}</span>
            <span className="text-text-dim">{LIBELLES_NATURE[c.nature]}</span>
            <span className="text-right">{montant(c.dette)}</span>
            <span>{c.cloture ? 'Clôture passée' : 'À clôturer'}</span>
            <span className="text-right">
              {!c.cloture && (
                <button type="button" onClick={() => void proposer(c.id)} className="border border-border-dark px-2.5 py-0.5 text-[11px] font-semibold">
                  Proposer la clôture
                </button>
              )}
            </span>
          </div>
          {ouvert === c.id && proposition && (
            <div className="px-3.5 pb-3 text-[11.5px]">
              <table className="w-full max-w-[640px] mb-2">
                <thead>
                  <tr>
                    <th className="text-left">Compte</th>
                    <th className="text-right">Débit</th>
                    <th className="text-right">Crédit</th>
                  </tr>
                </thead>
                <tbody>
                  {proposition.extourne > 0 && (
                    <>
                      <tr><td>{proposition.comptes.interetsCourus} · extourne à l'ouverture</td><td className="text-right">{montant(proposition.extourne)}</td><td /></tr>
                      <tr><td>{proposition.comptes.interets} · extourne à l'ouverture</td><td /><td className="text-right">{montant(proposition.extourne)}</td></tr>
                    </>
                  )}
                  {proposition.ventilation.capital > 0 && (
                    <tr><td>{proposition.comptes.dette} · remboursement</td><td className="text-right">{montant(proposition.ventilation.capital)}</td><td /></tr>
                  )}
                  {proposition.ventilation.interets + proposition.ventilation.interetsCourus > 0 && (
                    <tr>
                      <td>{proposition.comptes.interets} · intérêts</td>
                      <td className="text-right">{montant(proposition.ventilation.interets + proposition.ventilation.interetsCourus)}</td>
                      <td />
                    </tr>
                  )}
                  {proposition.ventilation.loyers > 0 && (
                    <tr><td>{proposition.comptes.redevances} · redevances de l'exercice</td><td /><td className="text-right">{montant(proposition.ventilation.loyers)}</td></tr>
                  )}
                  {proposition.ventilation.interetsCourus > 0 && (
                    <tr><td>{proposition.comptes.interetsCourus} · intérêts courus</td><td /><td className="text-right">{montant(proposition.ventilation.interetsCourus)}</td></tr>
                  )}
                </tbody>
              </table>
              {proposition.refus.map((r) => (
                <div key={r} className="text-danger mb-1">{r}</div>
              ))}
              <div className="flex gap-2">
                {peutEcrire && proposition.refus.length === 0 && (
                  <button
                    type="button"
                    disabled={envoi || !journalOd}
                    onClick={() => void passer(c.id)}
                    className="bg-sel text-white text-[11.5px] font-semibold px-3 py-1 disabled:opacity-50"
                  >
                    {envoi ? '…' : 'Passer les écritures'}
                  </button>
                )}
                <button type="button" onClick={() => setOuvert(null)} className="text-[11.5px] font-semibold text-text-dim px-3 py-1">
                  Fermer
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
