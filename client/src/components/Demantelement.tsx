import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { montant } from '../lib/montants';
import type { Journal } from '../lib/types';
import { Aide } from './chrome/Aide';

/**
 * LE COMPOSANT DÉMANTÈLEMENT (lot 15) · AUDCIF Titre VIII ch. 6, aux deux
 * référentiels. Deux blocs · les paramètres de l'actualisation à la création
 * du composant (la valeur actualisée est PROPOSÉE par le serveur, jamais
 * calculée ici), et la provision sur la fiche (désactualisation de
 * l'exercice, reprise). Le serveur tient tous les refus
 * (`demantelement.service.ts`).
 */
export function ParametresDemantelement({
  coutFutur,
  tauxPourcent,
  annees,
  onChange,
  onValeurProposee,
}: {
  coutFutur: string;
  tauxPourcent: string;
  /** La durée d'utilité saisie du composant · l'horizon du démantèlement. */
  annees: string;
  onChange: (coutFutur: string, tauxPourcent: string) => void;
  onValeurProposee: (valeur: number) => void;
}) {
  const [refus, setRefus] = useState<string | null>(null);
  const champ = 'mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[12px] font-normal font-mono';
  const proposer = async () => {
    setRefus(null);
    try {
      const r = await api.get<{ valeurActualisee: number }>(
        `/immobilisations/demantelement/valeur-actualisee?coutFutur=${encodeURIComponent(coutFutur)}&tauxPourcent=${encodeURIComponent(tauxPourcent)}&annees=${encodeURIComponent(annees)}`,
      );
      onValeurProposee(r.valeurActualisee);
    } catch (err) {
      setRefus(err instanceof ApiError ? err.message : 'Valeur actualisée impossible à calculer');
    }
  };
  return (
    <div className="grid grid-cols-3 gap-3 mt-3" data-parametres-demantelement>
      <label className="text-[11.5px] font-semibold text-text-dim">
        <span className="flex items-center gap-1">
          Coût attendu au terme
          <Aide
            titre="Provision pour démantèlement"
            texte="Le coût du démantèlement entre dans le coût du bien comme un composant, au crédit de la provision pour démantèlement, pour sa valeur actualisée quand l'effet du temps est significatif : coût attendu × (1 + taux)^-années. Chaque année, la provision s'accroît de l'écoulement du temps, en charges financières ; quand les travaux sont engagés ou le bien cédé, elle est reprise. La révision de l'estimation et la dégradation progressive ne sont pas calculées."
            source="AUDCIF Titre VIII ch. 6 ; SYCEBNL, classe 2, valeur d'entrée des immobilisations"
          />
        </span>
        <input type="number" min={0} step="0.01" value={coutFutur} onChange={(e) => onChange(e.target.value, tauxPourcent)} className={champ} />
      </label>
      <label className="text-[11.5px] font-semibold text-text-dim">
        Taux d'actualisation (%)
        <input type="number" min={0} max={100} step="0.0001" value={tauxPourcent} onChange={(e) => onChange(coutFutur, e.target.value)} className={champ} />
      </label>
      <div className="flex flex-col justify-end">
        <button
          type="button"
          disabled={!coutFutur || !tauxPourcent || !annees}
          onClick={() => void proposer()}
          className="border border-border-dark text-[11.5px] font-semibold px-3 py-1.5 disabled:opacity-50"
          title={annees ? undefined : "Indiquez d'abord la durée d'utilité du composant"}
        >
          Proposer la valeur actualisée
        </button>
        {refus && <span className="text-[11px] text-danger mt-1">{refus}</span>}
      </div>
    </div>
  );
}

interface EtatProvision {
  repriseFaite: boolean;
  composantRepris: boolean;
  systemeMinimal: boolean;
  provisionInitiale: number | null;
  cumulDesactualisations: number;
  provision: number;
  tauxPourcent: number | null;
  mouvements: { id: string; nature: 'DESACTUALISATION' | 'REPRISE'; date: string; montant: number }[];
  desactualisation: { mois: number; provisionOuverture: number; montant: number; motifRefus: string | null };
  reprise: { exploitation: number; financiere: number; total: number } | null;
}

export function ProvisionDemantelement({
  bien,
  exerciceId,
  journaux,
  onFait,
  onFermer,
}: {
  bien: { id: string; designation: string };
  exerciceId: string | null;
  journaux: Journal[];
  onFait: (message: string) => void;
  onFermer: () => void;
}) {
  const { peutEcrire } = useAuth();
  const [etat, setEtat] = useState<EtatProvision | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [journalId, setJournalId] = useState(() => journaux.find((j) => j.code === 'OD')?.id ?? journaux[0]?.id ?? '');
  const [dateReprise, setDateReprise] = useState(() => new Date().toISOString().slice(0, 10));
  const [motif, setMotif] = useState<'' | 'ENGAGEMENT_COUTS' | 'CESSION_SOUS_JACENT'>('');

  const charger = useCallback(async () => {
    if (!exerciceId) return;
    try {
      setEtat(await api.get<EtatProvision>(`/immobilisations/${bien.id}/demantelement?exerciceId=${encodeURIComponent(exerciceId)}`));
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Provision illisible');
    }
  }, [bien.id, exerciceId]);
  useEffect(() => {
    void charger();
  }, [charger]);

  if (!peutEcrire) return null;

  const agir = async (chemin: 'desactualisation' | 'reprise') => {
    if (!exerciceId) return;
    setEnvoi(true);
    setErreur(null);
    try {
      const corps =
        chemin === 'desactualisation' ? { exerciceId, journalId } : { exerciceId, journalId, date: dateReprise, motif };
      const r = await api.post<{ montant: number }>(`/immobilisations/${bien.id}/demantelement/${chemin}`, corps);
      await charger();
      onFait(
        chemin === 'desactualisation'
          ? `Désactualisation de ${montant(r.montant)} passée pour « ${bien.designation} ».`
          : `Provision pour démantèlement de « ${bien.designation} » reprise pour ${montant(r.montant)}.`,
      );
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Écriture refusée');
    } finally {
      setEnvoi(false);
    }
  };

  const champ = 'mt-1 w-full border border-border-dark px-2 py-1 text-[11.5px]';
  const libelle = 'text-[11.5px] font-semibold text-text-dim';
  return (
    <div className="bg-chrome border-b border-border px-4 py-3 text-[11.5px]" data-provision-demantelement>
      <div className="font-semibold text-text-dim mb-2 flex items-center gap-1.5">
        Provision pour démantèlement
        <Aide
          titre="Provision pour démantèlement"
          texte="Chaque exercice, la provision s'accroît de l'écoulement du temps, au taux retenu à l'entrée, en charges financières (dotation financière par le crédit de la provision), au prorata des mois quand le composant entre en cours d'exercice (convention d'OmegaX). Quand les travaux sont engagés ou le bien cédé, la provision est reprise : la valeur d'entrée du composant en reprise d'exploitation, les désactualisations en reprise financière. La charge des travaux reste une écriture du cabinet."
          source="AUDCIF Titre VIII ch. 6 § 2.3, § 4.1 et § 4.2"
        />
        <Aide
          titre="Reprise en cours d'exercice"
          texte="Si la désactualisation de l'exercice de reprise n'est pas encore passée, la reprise la passe d'abord, arrêtée à sa date et au prorata des mois, puis reprend la provision ainsi accrue : la reprise financière comprend cette désactualisation courue. Une reprise ne peut précéder la date jusqu'à laquelle l'exercice a déjà été désactualisé, ni un exercice antérieur resté sans désactualisation. Au Système minimal de trésorerie, aucune désactualisation n'est passée : la provision est reprise telle qu'elle est."
          source="AUDCIF Titre VIII ch. 6 § 2.3 et § 4"
        />
      </div>
      {erreur && <div className="mb-2 text-danger">{erreur}</div>}
      {!exerciceId ? (
        <div className="text-text-dim">Choisissez d'abord un exercice.</div>
      ) : etat === null ? (
        !erreur && <div className="text-text-dim">…</div>
      ) : etat.composantRepris ? (
        <div className="text-text-dim">
          Composant repris au bilan d'ouverture · sa provision vient de l'à-nouveau et se suit par écritures ordinaires.
        </div>
      ) : etat.provisionInitiale === null ? (
        <div className="text-text-dim">Ce composant n'est pas entré par la provision pour démantèlement · rien à suivre.</div>
      ) : journaux.length === 0 ? (
        <div className="text-text-dim">Aucun journal au dossier · créez d'abord un journal d'opérations diverses, puis revenez ici.</div>
      ) : (
        <>
          <div className="mb-2">
            {etat.repriseFaite ? (
              <>Provision reprise · valeur d'entrée {montant(etat.provisionInitiale)} · désactualisations {montant(etat.cumulDesactualisations)}</>
            ) : (
              <>
                Provision à ce jour <strong>{montant(etat.provision)}</strong> · valeur d'entrée {montant(etat.provisionInitiale)} ·
                désactualisations {montant(etat.cumulDesactualisations)}
              </>
            )}
          </div>
          <div className="grid grid-cols-4 gap-3 items-end">
            <label className={libelle}>
              Journal
              <select value={journalId} onChange={(e) => setJournalId(e.target.value)} className={champ}>
                {journaux.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.code} · {j.intitule}
                  </option>
                ))}
              </select>
            </label>
            <div className="col-span-3">
              {etat.desactualisation.motifRefus ? (
                <span className="text-text-dim">{etat.desactualisation.motifRefus}</span>
              ) : (
                <button
                  type="button"
                  disabled={envoi || !journalId}
                  onClick={() => void agir('desactualisation')}
                  className="bg-sel text-white font-semibold px-3 py-1.5 disabled:opacity-50"
                >
                  Désactualiser · {montant(etat.desactualisation.montant)} sur {etat.desactualisation.mois} mois
                </button>
              )}
            </div>
            {etat.reprise && !etat.repriseFaite && (
              <>
                <label className={libelle}>
                  Reprise le
                  <input type="date" value={dateReprise} onChange={(e) => setDateReprise(e.target.value)} className={`${champ} font-mono`} />
                </label>
                <label className={libelle}>
                  Motif de la reprise
                  <select value={motif} onChange={(e) => setMotif(e.target.value as typeof motif)} className={champ}>
                    <option value="">Choisir</option>
                    <option value="ENGAGEMENT_COUTS">Travaux de démantèlement engagés</option>
                    <option value="CESSION_SOUS_JACENT">Cession du bien</option>
                  </select>
                </label>
                <div className="col-span-2">
                  <button
                    type="button"
                    disabled={envoi || !motif || !journalId}
                    onClick={() => void agir('reprise')}
                    className="border border-border-dark font-semibold px-3 py-1.5 disabled:opacity-50"
                  >
                    Reprendre · {montant(etat.reprise.exploitation)} en exploitation, {montant(etat.reprise.financiere)} en financier
                  </button>
                </div>
              </>
            )}
          </div>
          <div className="mt-3 font-semibold text-text-dim">Mouvements de la provision</div>
          {etat.mouvements.length === 0 ? (
            <div className="text-text-dim">Aucun mouvement depuis l'entrée du composant.</div>
          ) : (
            <table className="w-full max-w-[560px]">
              <thead>
                <tr>
                  <th className="text-left">Date</th>
                  <th className="text-left">Mouvement</th>
                  <th className="text-right">Montant</th>
                </tr>
              </thead>
              <tbody>
                {etat.mouvements.map((m) => (
                  <tr key={m.id}>
                    <td className="font-mono">{new Date(m.date).toLocaleDateString('fr-FR')}</td>
                    <td>{m.nature === 'DESACTUALISATION' ? 'Désactualisation' : 'Reprise'}</td>
                    <td className="text-right font-mono">{montant(m.montant)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
      <div className="mt-3">
        <button type="button" onClick={onFermer} className="font-semibold text-text-dim px-3 py-1">
          Fermer
        </button>
      </div>
    </div>
  );
}
