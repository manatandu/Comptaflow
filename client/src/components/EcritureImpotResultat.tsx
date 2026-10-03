import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Aide } from './chrome/Aide';
import { montant as nombre } from '../lib/montants';
import { type AnnulationImpot, messageAnnulation, messageEcart } from '../lib/ecriture-impot';

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
 *
 * Passer et annuler sont réservés au comptable et à l'administrateur
 * (`@ReserveAuComptable` côté serveur) · les boutons suivent `peutValider`.
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
    /** Servie par le serveur, jamais recopiée · même borne que son refus. */
    longueurMinAttestation: number;
  };
  motifsRefus: string[];
  annulees: number;
}

interface ReponsePasser {
  ecriture: { id: string; numeroPiece: number | null };
  journal: { code: string; repli: string | null };
}

interface ReponseAnnuler {
  annulation: AnnulationImpot;
}

export function EcritureImpotResultat({ exerciceId, version, apresChangement }: {
  exerciceId: string;
  /** Change quand le résultat fiscal est relu · la proposition se relit avec lui. */
  version: unknown;
  apresChangement: () => void;
}) {
  const { peutValider } = useAuth();
  const [etat, setEtat] = useState<EtatEcritureImpot | null>(null);
  const [lecture, setLecture] = useState(true);
  const [erreurLecture, setErreurLecture] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [imputer, setImputer] = useState(false);
  const [attestation, setAttestation] = useState('');
  const [motif, setMotif] = useState('');
  const [annulation, setAnnulation] = useState(false);
  // Relecture LOCALE · le résultat fiscal peut rendre un objet identique
  // (ou échouer) après un geste, et la proposition doit se relire quand même.
  const [relecture, setRelecture] = useState(0);

  // UN AUTRE EXERCICE, UN AUTRE ÉTAT · rien de l'exercice précédent ne reste
  // affiché ni coché (une case d'imputation cochée sur N passerait sur N+1).
  useEffect(() => {
    setEtat(null);
    setImputer(false);
    setAttestation('');
    setMotif('');
    setAnnulation(false);
    setMessage(null);
  }, [exerciceId]);

  useEffect(() => {
    let actif = true;
    setLecture(true);
    setErreurLecture(null);
    setErreur(null);
    api.get<EtatEcritureImpot>(`/fiscalite/exercices/${exerciceId}/ecriture-impot`).then(
      (e) => {
        if (!actif) return;
        setEtat(e);
        setLecture(false);
      },
      (e: Error) => {
        if (!actif) return;
        setEtat(null);
        setErreurLecture(e.message);
        setLecture(false);
      },
    );
    return () => {
      actif = false;
    };
  }, [exerciceId, version, relecture]);

  const motifRefusImputation = etat?.proposition?.imputation.motifRefus ?? null;
  // Une imputation refusée ne reste jamais cochée · sinon la case, désactivée,
  // garderait son état et le tableau montrerait des lignes que le serveur refuse.
  useEffect(() => {
    if (motifRefusImputation !== null) setImputer(false);
  }, [motifRefusImputation]);

  const relire = () => {
    setImputer(false);
    setMotif('');
    setAnnulation(false);
    setRelecture((n) => n + 1);
    apresChangement();
  };

  const passer = async () => {
    setEnvoi(true);
    setErreur(null);
    setMessage(null);
    try {
      const r = await api.post<ReponsePasser>(`/fiscalite/exercices/${exerciceId}/ecriture-impot`, {
        imputerAcomptes: imputer && motifRefusImputation === null,
        ...(attestation.trim() ? { attestationRegime: attestation.trim() } : {}),
      });
      setMessage(
        `Écriture passée au brouillard, pièce n° ${r.ecriture.numeroPiece ?? '·'} au journal ${r.journal.code}.` +
          (r.journal.repli ? ` ${r.journal.repli}` : ''),
      );
      setAttestation('');
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
    setMessage(null);
    try {
      const r = await api.post<ReponseAnnuler>(`/fiscalite/exercices/${exerciceId}/ecriture-impot/annuler`, { motif: motif.trim() });
      setMessage(messageAnnulation(r.annulation));
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

  const proposition = etat?.proposition ?? null;
  const attestationCourte =
    proposition?.conditionADeclarer != null && attestation.trim().length < proposition.longueurMinAttestation;

  return (
    <section className="border border-border rounded-[4px] p-3 mt-3">
      <div className="text-[11px] font-semibold text-text-dim leading-none flex items-center gap-1.5">
        Écriture de l’impôt
        <Aide
          titre="Écriture de l’impôt sur le résultat"
          texte="Proposée à la clôture, passée au brouillard sur votre seul clic, au journal des opérations diverses (à défaut, au premier journal général, et c’est dit), datée du dernier jour de l’exercice. Le montant est recalculé par le serveur au moment du clic. Le compte 891 (sous-compte 8911) reçoit l’impôt entier, quelles que soient les modalités de règlement, par le crédit du 441 ; l’impôt minimum retenu va au 895. Les acomptes ne réduisent pas la charge · leur imputation est une seconde paire de lignes, 441 au débit et 4492 au crédit, bornée aux acomptes déclarés, au solde du 4492 et à l’impôt. Des acomptes passés au 441, comme le fait le Guide, n’ont rien à imputer. Une fois l’écriture validée, réintégrez le même montant (« Impôt sur les sociétés et impôt minimum comptabilisés en charges »), l’impôt n’étant pas déductible de son propre calcul."
          source="AUDCIF Titre VII, comptes 89 et 44 ; Guide SYSCOHADA Partie 1 ch. 3 § 2.3, Application 8 ; loi n° 23/053, art. 42, 45, 50, 56, 57 et 150 ; loi de procédures fiscales, art. 57 bis et 57 ter"
        />
      </div>
      {lecture && !etat && <p className="text-[11.5px] text-text-dim mt-1.5">Lecture…</p>}
      {erreurLecture && <p className="text-[11.5px] text-danger mt-1.5">{erreurLecture}</p>}
      {erreur && <p className="text-[11.5px] text-danger mt-1.5">{erreur}</p>}
      {message && <p className="text-[11.5px] mt-1.5">{message}</p>}
      {etat?.constat && (
        <div className="mt-1.5 text-[11.5px]">
          <div>
            {etat.constat.ecriture ? (
              <>
                Pièce n° {etat.constat.ecriture.numeroPiece ?? '·'} · {etat.constat.ecriture.statut === 'VALIDEE' ? 'validée' : 'au brouillard'} ·{' '}
              </>
            ) : (
              <span className="text-danger">Écriture introuvable · </span>
            )}
            compte {etat.constat.compteCharge} · {nombre(etat.constat.montantImpot)}
            {etat.constat.montantImpute > 0 && <> · acomptes imputés {nombre(etat.constat.montantImpute)}</>}
          </div>
          {etat.constat.ecartAvecCalcul !== null &&
            etat.constat.impotRecalcule !== null &&
            Math.abs(etat.constat.ecartAvecCalcul) >= 0.005 && (
              <p className="text-warning mt-1">{messageEcart(etat.constat.impotRecalcule, etat.constat.ecartAvecCalcul)}</p>
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
          {proposition ? (
            <>
              {tableau(imputer && motifRefusImputation === null ? [...proposition.lignes, ...proposition.imputation.lignes] : proposition.lignes)}
              <label className="flex items-center gap-2 mt-1.5">
                <input
                  type="checkbox"
                  checked={imputer}
                  disabled={!peutValider || envoi || motifRefusImputation !== null}
                  onChange={(e) => setImputer(e.target.checked)}
                />
                {motifRefusImputation === null
                  ? `Imputer les acomptes (${nombre(proposition.imputation.montant)})`
                  : 'Imputer les acomptes'}
              </label>
              {motifRefusImputation && <p className="text-text-dim mt-0.5">{motifRefusImputation}</p>}
              {proposition.conditionADeclarer && peutValider && (
                <label className="block mt-1.5">
                  <span className="flex items-center gap-1.5">
                    Fondement de l’assujettissement
                    <Aide titre="Fondement de l’assujettissement" texte={proposition.conditionADeclarer} source="Loi n° 23/053, Titre 2" />
                  </span>
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
              {peutValider && (
                <button
                  type="button"
                  disabled={envoi || etat.motifsRefus.length > 0 || attestationCourte}
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
