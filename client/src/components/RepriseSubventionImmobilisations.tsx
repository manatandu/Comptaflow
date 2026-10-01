import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { montant } from '../lib/montants';
import type { Journal } from '../lib/types';
import { Aide } from './chrome/Aide';

/**
 * LA REPRISE AU 799 DES SUBVENTIONS EN NATURE, dans la fenêtre
 * Immobilisations · le serveur propose et rejoue (`reprise-subvention.service.ts`),
 * l'écran ne calcule rien. Rien n'est passé sans clic (décision de Manasse).
 */
interface BienSubventionne {
  id: string;
  designation?: string;
  subvention: number;
  cumulRepris: number;
  montant: number;
  nature: 'EXERCICE' | 'SORTIE';
  motif: string | null;
}

export function RepriseSubventionImmobilisations({ exerciceId, journaux }: { exerciceId: string | undefined; journaux: Journal[] }) {
  const { peutEcrire } = useAuth();
  const [liste, setListe] = useState<{ biens: BienSubventionne[]; tronque: boolean } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState<string | null>(null);
  const journalOd = journaux.find((j) => j.code === 'OD') ?? journaux[0];

  const charger = useCallback(async () => {
    if (!exerciceId) return;
    setErreur(null);
    try {
      setListe(await api.get<{ biens: BienSubventionne[]; tronque: boolean }>(`/immobilisations/reprises-subvention?exerciceId=${exerciceId}`));
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Reprises des fonds illisibles');
    }
  }, [exerciceId]);
  useEffect(() => {
    void charger();
  }, [charger]);

  const passer = async (id: string) => {
    if (!exerciceId || !journalOd) return;
    setEnvoi(id);
    setErreur(null);
    try {
      await api.post(`/immobilisations/${id}/reprise-subvention`, { exerciceId, journalId: journalOd.id });
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Reprise refusée');
    } finally {
      setEnvoi(null);
    }
  };

  // Aucun bien subventionné en nature · le cadre ne s'affiche pas (liste LUE).
  if (!erreur && (liste === null || liste.biens.length === 0)) return null;

  return (
    <div className="border border-border bg-surface shadow-posee max-w-[1180px] mt-3">
      <div className="px-3.5 py-1.5 bg-chrome border-b border-border text-[11.5px] font-semibold text-text-dim flex items-center gap-1.5">
        Reprises des fonds liés aux biens
        <Aide
          titre="Reprise des fonds"
          texte="Subvention d'investissement en nature (14) · reprise au 799 au rythme de la dotation aux amortissements ; pour un bien non amortissable, sur la durée d'inaliénabilité ou, à défaut, par dixièmes ; à la cession, pour le solde. Au SYCEBNL seulement · dons et legs à conserver (167) repris au 7923 pour la dotation aux amortissements et aux dépréciations de l'exercice ; donation temporaire d'usufruit (171) reprise au 7961 dans la même quotité que l'amortissement ; dons et legs destinés à la vente (172) repris pour solde au 7962 à la cession. Seules les reprises passées ici sont comptées."
          source="Fiche du compte 14 (AUDCIF Titre VII · SYCEBNL Partie 2 ch. 3) · SYCEBNL Partie 3 ch. 2 § 1.2.2, § 2.2.3 et § 2.3 · Guide d'application, Applications 5 à 7"
        />
      </div>
      {erreur && <div className="px-3.5 py-1.5 text-[11.5px] text-danger">{erreur}</div>}
      {liste?.tronque && <div className="px-3.5 py-1.5 text-[11.5px] text-warning">Liste limitée aux 200 premiers biens.</div>}
      <div className="grid grid-cols-[1.4fr_120px_120px_130px_1.2fr] gap-2.5 px-3.5 py-1 border-b border-border text-[11px] font-bold text-text-dim">
        <span>Bien</span>
        <span className="text-right">Fonds</span>
        <span className="text-right">Déjà reprise</span>
        <span className="text-right">Reprise proposée</span>
        <span />
      </div>
      {(liste?.biens ?? []).map((b) => (
        <div key={b.id} className="grid grid-cols-[1.4fr_120px_120px_130px_1.2fr] gap-2.5 px-3.5 py-1.5 items-center text-[11.5px] border-b border-border last:border-0">
          <span>{b.designation}</span>
          <span className="text-right">{montant(b.subvention)}</span>
          <span className="text-right">{montant(b.cumulRepris)}</span>
          <span className="text-right">{b.montant > 0 ? montant(b.montant) : '·'}</span>
          <span>
            {b.motif ? (
              <span className="text-text-dim">{b.motif}</span>
            ) : (
              peutEcrire && (
                <button
                  type="button"
                  disabled={envoi === b.id || !journalOd}
                  onClick={() => void passer(b.id)}
                  className="bg-sel text-white text-[11px] font-semibold px-2.5 py-0.5 disabled:opacity-50"
                >
                  {envoi === b.id ? '…' : b.nature === 'SORTIE' ? 'Reprendre le solde' : 'Passer la reprise'}
                </button>
              )
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
