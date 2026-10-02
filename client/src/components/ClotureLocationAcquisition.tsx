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
  prixOption: number;
  /** null tant que le cabinet n'a rien déclaré. */
  optionLevee: boolean | null;
  dateOption: string | null;
  /** Lot 15 · garantie de valeur résiduelle (§ 2.1.2), null tant que son appel n'est pas déclaré. */
  garantieValeurResiduelle?: number;
  garantieAppelee?: boolean | null;
  dateGarantie?: string | null;
  loyerIndexe?: boolean;
  indiceLoyer?: string | null;
  valeurIndiceCommencement?: number | null;
}
interface Proposition {
  comptes: { dette: string; interetsCourus: string; interets: string; redevances: string };
  ventilation: { loyers: number; capital: number; interets: number; interetsCourus: number; rangs: number[] };
  extourne: number;
  disponible623: number;
  refus: string[];
  /** Lot 15 · ce que le texte ne règle pas, dit sans refuser (garantie non appelée). */
  avertissements?: string[];
}

export function ClotureLocationAcquisition({
  exerciceId,
  journaux,
  onSortie,
}: {
  exerciceId: string | undefined;
  journaux: Journal[];
  /** La non-levée sort le bien · la liste des biens se relit. */
  onSortie?: () => void;
}) {
  const { peutEcrire } = useAuth();
  const [contrats, setContrats] = useState<ContratListe[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [proposition, setProposition] = useState<Proposition | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [nonLeveePour, setNonLeveePour] = useState<string | null>(null);
  const [cessionCourante, setCessionCourante] = useState(false);
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

  const declarerOption = async (id: string, levee: boolean) => {
    if (!levee && (!exerciceId || !journalOd)) return;
    setEnvoi(true);
    setErreur(null);
    try {
      await api.post(
        `/immobilisations/location-acquisition/contrats/${id}/option`,
        levee ? { levee } : { levee, exerciceId, journalId: journalOd!.id, cessionCourante },
      );
      setNonLeveePour(null);
      await charger();
      if (!levee) onSortie?.();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Déclaration refusée');
    } finally {
      setEnvoi(false);
    }
  };
  // Lot 15 · l'appel de la garantie de valeur résiduelle, déclaré une fois.
  const declarerGarantie = async (id: string, appelee: boolean) => {
    setEnvoi(true);
    setErreur(null);
    try {
      await api.post(`/immobilisations/location-acquisition/contrats/${id}/garantie`, { appelee });
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Déclaration refusée');
    } finally {
      setEnvoi(false);
    }
  };
  const jourCourt = (d: string) => new Date(d).toISOString().slice(0, 10).split('-').reverse().join('/');

  // Un dossier sans contrat ne voit pas le cadre · la liste a été LUE.
  if (!erreur && (contrats === null || contrats.length === 0)) return null;

  return (
    <div className="border border-border bg-surface shadow-posee max-w-[1180px] mt-3">
      <div className="px-3.5 py-1.5 bg-chrome border-b border-border text-[11.5px] font-semibold text-text-dim flex items-center gap-1.5">
        Contrats de location-acquisition
        <Aide
          titre="Clôture des contrats"
          texte="Les loyers s'enregistrent en redevances au fil de l'exercice. À la clôture, ils se virent à la dette pour leur part de remboursement et en intérêts pour le reste ; les intérêts courus depuis la dernière échéance sont constatés, puis extournés à l'ouverture de l'exercice suivant. Les intérêts courus se comptent au taux de l'échéancier, au prorata des jours de la période (convention d'OmegaX). Option levée : son prix s'enregistre en redevances comme la dernière échéance, aucune autre écriture. Option non levée : le bien sort, cédé au bailleur pour le capital restant dû, qui annule la dette ; la perte est la valeur nette moins ce prix, hors activités ordinaires, ou en exploitation pour des cessions répétitives."
          source="AUDCIF Titre VIII ch. 8 § 2.1.8 et § 2.1.9 · fiche du compte 17"
        />
      </div>
      {erreur && <div className="px-3.5 py-1.5 text-[11.5px] text-danger">{erreur}</div>}
      {(contrats ?? []).map((c) => (
        <div key={c.id} className="border-b border-border last:border-0">
          <div className="grid grid-cols-[1.4fr_150px_110px_120px_200px_auto] gap-2.5 px-3.5 py-1.5 items-center text-[11.5px]">
            <span>{c.designation}{c.reference ? ` · ${c.reference}` : ''}</span>
            <span className="text-text-dim">{LIBELLES_NATURE[c.nature]}</span>
            <span className="text-right">{montant(c.dette)}</span>
            <span>{c.cloture ? 'Clôture passée' : 'À clôturer'}</span>
            <span>
              {c.prixOption > 0 && c.optionLevee === null && (
                <>
                  Option {montant(c.prixOption)}{c.dateOption ? ` au ${jourCourt(c.dateOption)}` : ''}
                  {peutEcrire && (
                    <span className="flex gap-1 mt-0.5">
                      <button type="button" disabled={envoi} onClick={() => void declarerOption(c.id, true)} className="border border-border-dark px-1.5 text-[10.5px] font-semibold">
                        Levée
                      </button>
                      <button type="button" disabled={envoi} onClick={() => setNonLeveePour(c.id)} className="border border-border-dark px-1.5 text-[10.5px] font-semibold">
                        Non levée
                      </button>
                    </span>
                  )}
                </>
              )}
              {c.optionLevee === true && 'Option levée'}
              {c.optionLevee === false && 'Option non levée · bien sorti'}
              {(c.garantieValeurResiduelle ?? 0) > 0 && (
                <span className="block">
                  Garantie {montant(c.garantieValeurResiduelle ?? 0)}
                  {c.dateGarantie ? ` au ${jourCourt(c.dateGarantie)}` : ''}
                  {c.garantieAppelee === true && ' · appelée'}
                  {c.garantieAppelee === false && ' · non appelée'}
                  {c.garantieAppelee == null && peutEcrire && (
                    <span className="flex gap-1 mt-0.5">
                      <button type="button" disabled={envoi} onClick={() => void declarerGarantie(c.id, true)} className="border border-border-dark px-1.5 text-[10.5px] font-semibold">
                        Appelée
                      </button>
                      <button type="button" disabled={envoi} onClick={() => void declarerGarantie(c.id, false)} className="border border-border-dark px-1.5 text-[10.5px] font-semibold">
                        Non appelée
                      </button>
                    </span>
                  )}
                </span>
              )}
              {c.loyerIndexe && c.indiceLoyer && (
                <span className="block text-text-dim">
                  Loyer indexé · {c.indiceLoyer}
                  {c.valeurIndiceCommencement != null ? ` (${c.valeurIndiceCommencement} à la prise d'effet)` : ''}
                </span>
              )}
            </span>
            <span className="text-right">
              {!c.cloture && (
                <button type="button" onClick={() => void proposer(c.id)} className="border border-border-dark px-2.5 py-0.5 text-[11px] font-semibold">
                  Proposer la clôture
                </button>
              )}
            </span>
          </div>
          {nonLeveePour === c.id && (
            <div className="px-3.5 pb-3 text-[11.5px] flex items-center gap-3">
              <span>Sortie du bien à la date de l'option</span>
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={cessionCourante} onChange={(e) => setCessionCourante(e.target.checked)} />
                Cession courante
              </label>
              <button
                type="button"
                disabled={envoi || !journalOd}
                onClick={() => void declarerOption(c.id, false)}
                className="bg-sel text-white text-[11.5px] font-semibold px-3 py-1 disabled:opacity-50"
              >
                {envoi ? '…' : 'Confirmer la sortie'}
              </button>
              <button type="button" onClick={() => setNonLeveePour(null)} className="text-[11.5px] font-semibold text-text-dim px-2 py-1">
                Annuler
              </button>
            </div>
          )}
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
              {(proposition.avertissements ?? []).map((a) => (
                <div key={a} className="text-warning mb-1">{a}</div>
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
