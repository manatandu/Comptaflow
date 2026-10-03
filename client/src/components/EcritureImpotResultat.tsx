import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Aide } from './chrome/Aide';
import { montant as nombre } from '../lib/montants';

/**
 * L'ÉCRITURE DE L'IMPÔT SUR LE RÉSULTAT · ligne A11 (relevé CPCC C7), dans la
 * fenêtre Résultat fiscal, SYSCOHADA seul (la fenêtre l'est,
 * `referentielsApplicables`, et la route aussi, `ReferentielGuard`).
 *
 * L'écran ne calcule RIEN · le serveur rejoue l'impôt et rend la proposition,
 * ses lignes et ses refus (`GET /fiscalite/exercices/:id/ecriture-impot`). Le
 * clic n'envoie aucun montant, seulement le choix d'imputer les acomptes et,
 * pour une forme dont l'assujettissement tient à un fait, ce qui le fonde.
 * Une lecture échouée se dit · jamais « rien à passer » sur un échec.
 */

interface LigneProposee {
  numero: string;
  debit: number;
  credit: number;
  libelle: string;
}

interface EtatEcritureImpot {
  exerciceId: string;
  constat: null | {
    id: string;
    montantImpot: number;
    minimumApplique: boolean;
    montantImpute: number;
    attestationRegime: string | null;
    compteCharge: string;
    ecriture: { id: string; numeroPiece: number | null; statut: 'BROUILLARD' | 'VALIDEE'; date: string } | null;
    impotRecalcule: number | null;
    ecartAvecCalcul: number | null;
  };
  proposition: null | {
    impot: number;
    minimumApplique: boolean;
    explication: string;
    date: string;
    lignes: LigneProposee[];
    imputation: {
      acomptesDeclares: number;
      solde4492: number;
      montant: number;
      motifRefus: string | null;
      lignes: LigneProposee[];
    };
    conditionADeclarer: string | null;
  };
  motifsRefus: string[];
  annulees: number;
}

export function EcritureImpotResultat({ exerciceId, version, apresChangement }: {
  exerciceId: string;
  /** Change quand le résultat fiscal est relu · la proposition se relit avec lui. */
  version: unknown;
  apresChangement: () => void;
}) {
  const { peutEcrire, peutValider } = useAuth();
  const [etat, setEtat] = useState<EtatEcritureImpot | null>(null);
  const [erreurLecture, setErreurLecture] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [imputer, setImputer] = useState(false);
  const [attestation, setAttestation] = useState('');
  const [motif, setMotif] = useState('');
  const [annulation, setAnnulation] = useState(false);

  useEffect(() => {
    let actif = true;
    setErreurLecture(null);
    api.get<EtatEcritureImpot>(`/fiscalite/exercices/${exerciceId}/ecriture-impot`).then(
      (e) => {
        if (actif) setEtat(e);
      },
      (e: Error) => {
        if (actif) {
          setEtat(null);
          setErreurLecture(e.message);
        }
      },
    );
    return () => {
      actif = false;
    };
  }, [exerciceId, version]);

  const relire = () => {
    setImputer(false);
    setMotif('');
    setAnnulation(false);
    apresChangement();
  };

  const passer = async () => {
    setEnvoi(true);
    setErreur(null);
    try {
      await api.post(`/fiscalite/exercices/${exerciceId}/ecriture-impot`, {
        imputerAcomptes: imputer,
        ...(attestation.trim() ? { attestationRegime: attestation.trim() } : {}),
      });
      relire();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "L'écriture n'a pas pu être passée");
    } finally {
      setEnvoi(false);
    }
  };

  const annuler = async () => {
    setEnvoi(true);
    setErreur(null);
    try {
      await api.post(`/fiscalite/exercices/${exerciceId}/ecriture-impot/annuler`, { motif: motif.trim() });
      relire();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "L'annulation a échoué");
    } finally {
      setEnvoi(false);
    }
  };

  const tableau = (lignes: LigneProposee[]) => (
    <table className="w-full text-[11.5px] mt-1.5">
      <thead>
        <tr>
          <th className="text-left px-2 py-1">Compte</th>
          <th className="text-left px-2 py-1">Libellé</th>
          <th className="text-right px-2 py-1">Débit</th>
          <th className="text-right px-2 py-1">Crédit</th>
        </tr>
      </thead>
      <tbody>
        {lignes.map((l, i) => (
          <tr key={`${l.numero}-${i}`} className="border-t border-border">
            <td className="px-2 py-1">{l.numero}</td>
            <td className="px-2 py-1">{l.libelle}</td>
            <td className="px-2 py-1 text-right">{l.debit ? nombre(l.debit) : ''}</td>
            <td className="px-2 py-1 text-right">{l.credit ? nombre(l.credit) : ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <section className="border border-border rounded-[4px] p-3">
      <div className="text-[11px] font-semibold text-text-dim leading-none flex items-center gap-1.5">
        Écriture de l’impôt
        <Aide
          titre="Écriture de l’impôt sur le résultat"
          texte="Proposée à la clôture, passée au brouillard sur votre seul clic, au journal des opérations diverses, datée du dernier jour de l’exercice. Le montant est recalculé par le serveur au moment du clic. Le compte 891 (sous-compte 8911) reçoit l’impôt entier, quelles que soient les modalités de règlement, par le crédit du 441 ; l’impôt minimum retenu va au 895. Les acomptes ne réduisent pas la charge · leur imputation est une seconde paire de lignes, 441 au débit et 4492 au crédit, bornée aux acomptes déclarés, au solde du 4492 et à l’impôt. Une fois l’écriture validée, réintégrez le même montant (« Impôt sur les sociétés et impôt minimum comptabilisés en charges »), l’impôt n’étant pas déductible de son propre calcul."
          source="AUDCIF Titre VII, comptes 89 et 44 ; Guide SYSCOHADA Partie 1 ch. 3, Application 8 ; loi n° 23/053, art. 45, 50, 56 et 57 ; loi de procédures fiscales, art. 57 bis et 57 ter"
        />
      </div>
      {erreurLecture && <p className="text-[11.5px] text-danger mt-1.5">{erreurLecture}</p>}
      {erreur && <p className="text-[11.5px] text-danger mt-1.5">{erreur}</p>}
      {etat?.constat && (
        <div className="mt-1.5 text-[11.5px]">
          <div>
            Pièce n° {etat.constat.ecriture?.numeroPiece ?? '·'} · {etat.constat.ecriture?.statut === 'VALIDEE' ? 'validée' : 'au brouillard'} ·
            compte {etat.constat.compteCharge} · {nombre(etat.constat.montantImpot)}
            {etat.constat.montantImpute > 0 && <> · acomptes imputés {nombre(etat.constat.montantImpute)}</>}
          </div>
          {etat.constat.ecartAvecCalcul !== null && Math.abs(etat.constat.ecartAvecCalcul) >= 0.005 && (
            <p className="text-warning mt-1">
              L’impôt recalculé ({nombre(etat.constat.impotRecalcule)}) diffère du montant passé de {nombre(etat.constat.ecartAvecCalcul)}.
            </p>
          )}
          {etat.constat.ecartAvecCalcul === null && (
            <p className="text-warning mt-1">L’impôt n’est plus chiffré par le calcul · le montant passé ne se compare à rien.</p>
          )}
          {peutValider &&
            (annulation ? (
              <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                <input
                  value={motif}
                  onChange={(e) => setMotif(e.target.value)}
                  placeholder="Motif de l’annulation"
                  maxLength={500}
                  disabled={envoi}
                  className="w-80 border border-border rounded-[4px] bg-bg px-2 py-1 text-[11.5px]"
                />
                <button
                  type="button"
                  disabled={envoi || motif.trim().length < 3}
                  onClick={annuler}
                  className="px-3 py-1 rounded-full border border-danger text-danger text-[11.5px] disabled:opacity-50"
                >
                  Confirmer l’annulation
                </button>
                <button type="button" disabled={envoi} onClick={() => setAnnulation(false)} className="text-[11.5px] underline">
                  Renoncer
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAnnulation(true)}
                className="mt-1.5 px-3 py-1 rounded-full border border-border text-[11.5px]"
              >
                Annuler l’écriture
              </button>
            ))}
        </div>
      )}
      {etat && !etat.constat && (
        <div className="mt-1.5 text-[11.5px]">
          {etat.motifsRefus.length > 0 && (
            <ul className="text-danger list-disc pl-4">
              {etat.motifsRefus.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          )}
          {etat.proposition ? (
            <>
              {tableau(imputer ? [...etat.proposition.lignes, ...etat.proposition.imputation.lignes] : etat.proposition.lignes)}
              <label className="flex items-center gap-2 mt-1.5">
                <input
                  type="checkbox"
                  checked={imputer}
                  disabled={!peutEcrire || envoi || etat.proposition.imputation.motifRefus !== null}
                  onChange={(e) => setImputer(e.target.checked)}
                />
                Imputer les acomptes ({nombre(etat.proposition.imputation.montant)})
              </label>
              {etat.proposition.imputation.motifRefus && (
                <p className="text-text-dim mt-0.5">{etat.proposition.imputation.motifRefus}</p>
              )}
              {etat.proposition.conditionADeclarer && peutEcrire && (
                <label className="block mt-1.5">
                  <span className="block text-warning">{etat.proposition.conditionADeclarer}</span>
                  <textarea
                    value={attestation}
                    onChange={(e) => setAttestation(e.target.value)}
                    maxLength={1000}
                    disabled={envoi}
                    placeholder="Ce qui fonde l’impôt (option, nature de l’activité, propriétaire)"
                    className="mt-1 w-full border border-border rounded-[4px] bg-bg px-2 py-1 text-[11.5px]"
                  />
                </label>
              )}
              {peutEcrire && (
                <button
                  type="button"
                  disabled={envoi || etat.motifsRefus.length > 0}
                  onClick={passer}
                  className="mt-1.5 px-3 py-1 rounded-full bg-sel text-white text-[11.5px] disabled:opacity-50"
                >
                  Passer l’écriture au brouillard
                </button>
              )}
            </>
          ) : (
            etat.motifsRefus.length === 0 && <p className="text-text-dim">Aucun impôt à constater pour cet exercice.</p>
          )}
          {etat.annulees > 0 && <p className="text-text-dim mt-1">{etat.annulees} écriture(s) annulée(s) pour cet exercice.</p>}
        </div>
      )}
    </section>
  );
}
