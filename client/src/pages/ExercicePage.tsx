import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useExercice } from '../lib/exercice';
import { IconLock, IconCheck } from '../components/chrome/icons';
import type { Cloture, Compte, GranulariteCloture, Journal, PlanningCloture } from '../lib/types';
import { Aide } from '../components/chrome/Aide';

const LIBELLE_GRANULARITE: Record<GranulariteCloture, string> = {
  PARTIELLE: 'Partielle',
  TOTALE: 'Totale',
  PERIODE: 'Période',
};

export function ExercicePage() {
  const { estAdmin } = useAuth();
  const { exercices, chargement: chargementExercices, recharger: rechargerExercices } = useExercice();

  const [exerciceId, setExerciceId] = useState<string>('');
  const [clotures, setClotures] = useState<Cloture[] | null>(null);
  const [planning, setPlanning] = useState<PlanningCloture | null>(null);
  const [planningOuvert, setPlanningOuvert] = useState(true);
  const [journaux, setJournaux] = useState<Journal[]>([]);
  const [comptes, setComptes] = useState<Compte[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  // Journal + date limite (Partielle), journal seul (Totale), date limite seule (Période)
  const [journalPartielleId, setJournalPartielleId] = useState('');
  const [dateLimitePartielle, setDateLimitePartielle] = useState('');
  const [journalTotaleId, setJournalTotaleId] = useState('');
  const [dateLimitePeriode, setDateLimitePeriode] = useState('');
  const [dateArrete, setDateArrete] = useState('');

  // Imputation aux capitaux propres d'ouverture · voir imputerOuverture.
  const [imputationOuverte, setImputationOuverte] = useState(false);
  const [iMotif, setIMotif] = useState<'CHANGEMENT_METHODE' | 'CORRECTION_ERREUR_SIGNIFICATIVE'>('CHANGEMENT_METHODE');
  const [iMontant, setIMontant] = useState('');
  const [iJustification, setIJustification] = useState('');
  const [iCompteRan, setICompteRan] = useState('');
  const [iCompteContrepartie, setICompteContrepartie] = useState('');

  useEffect(() => {
    if (!exerciceId && exercices.length > 0) {
      const ouvert = exercices.find((e) => e.statut === 'OUVERT') ?? exercices[0];
      setExerciceId(ouvert.id);
    }
  }, [exercices, exerciceId]);

  const exercice = exercices.find((e) => e.id === exerciceId) ?? null;

  // Le champ suit l'exercice sélectionné · sans cela, changer d'exercice
  // laisserait la date du précédent dans la case, prête à être enregistrée
  // sur le mauvais exercice.
  useEffect(() => {
    setDateArrete(exercice?.dateArreteComptes ? exercice.dateArreteComptes.slice(0, 10) : '');
  }, [exercice?.id, exercice?.dateArreteComptes]);

  const charger = async () => {
    if (!exerciceId) return;
    try {
      const [c, p] = await Promise.all([
        api.get<Cloture[]>(`/exercices/${exerciceId}/clotures`),
        api.get<PlanningCloture>(`/exercices/${exerciceId}/planning-cloture`),
      ]);
      setClotures(c);
      setPlanning(p);
      setErreur(null);
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible de charger les clôtures');
    }
  };

  useEffect(() => {
    charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exerciceId]);

  useEffect(() => {
    if (!estAdmin) return;
    api.get<Journal[]>('/journaux').then(setJournaux);
    // Comptes d'imputation, pour l'imputation aux capitaux propres d'ouverture.
    api.get<Compte[]>('/comptes?typeCompte=DETAIL').then(setComptes, () => {});
  }, [estAdmin]);

  const clorePartielle = async (e: FormEvent) => {
    e.preventDefault();
    if (!exerciceId) return;
    setEnvoi(true);
    setErreur(null);
    setInfo(null);
    try {
      await api.post(`/exercices/${exerciceId}/clotures/partielle`, {
        journalId: journalPartielleId,
        dateLimite: dateLimitePartielle,
      });
      setInfo('Clôture partielle enregistrée.');
      setJournalPartielleId('');
      setDateLimitePartielle('');
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible d’enregistrer cette clôture partielle');
    } finally {
      setEnvoi(false);
    }
  };

  const cloreTotale = async (e: FormEvent) => {
    e.preventDefault();
    if (!exerciceId) return;
    setEnvoi(true);
    setErreur(null);
    setInfo(null);
    try {
      await api.post(`/exercices/${exerciceId}/clotures/totale`, { journalId: journalTotaleId });
      setInfo('Clôture totale enregistrée · définitive.');
      setJournalTotaleId('');
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible d’enregistrer cette clôture totale');
    } finally {
      setEnvoi(false);
    }
  };

  /**
   * ARRÊTÉ DES COMPTES · quatrième mention obligatoire de chaque page publiée
   * (AUDCIF Titre IX ch. 1 § 2.4) et exigée dans toute publication par
   * l'art. 23, non exclu par l'art. 3 du SYCEBNL.
   *
   * Ce n'est pas la clôture : l'arrêté par les organes dirigeants lui est
   * postérieur de plusieurs semaines, dans la limite de quatre mois (Titre
   * VIII ch. 31 § 1.3). Il se DÉCLARE, il ne se déduit pas · d'où une saisie
   * et non un calcul.
   */
  const arreterComptes = async (e: FormEvent) => {
    e.preventDefault();
    if (!exerciceId) return;
    setEnvoi(true);
    setErreur(null);
    setInfo(null);
    try {
      await api.post(`/exercices/${exerciceId}/arrete-comptes`, {
        dateArreteComptes: dateArrete || null,
      });
      setInfo(
        dateArrete
          ? 'Date d’arrêté enregistrée · elle figure désormais sur chaque page des états.'
          : 'Date d’arrêté effacée · un nouvel arrêté peut être enregistré.',
      );
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible d’enregistrer la date d’arrêté');
    } finally {
      setEnvoi(false);
    }
  };

  /**
   * IMPUTATION AUX CAPITAUX PROPRES D'OUVERTURE · l'une des DEUX seules
   * exceptions à la correspondance bilan de clôture / bilan d'ouverture
   * (AUDCIF art. 34 et Titre V ; SYCEBNL art. 16, 4) et cadre conceptuel
   * § 3.3.1.2.4).
   *
   * Ici et non dans la saisie ordinaire, pour la même raison que l'arrêté des
   * comptes : rompre la correspondance entre deux bilans n'est pas un geste de
   * saisie, c'est une décision sur les méthodes de l'entité ou l'aveu d'une
   * erreur significative.
   */
  const imputerOuverture = async (e: FormEvent) => {
    e.preventDefault();
    if (!exerciceId) return;
    setEnvoi(true);
    setErreur(null);
    setInfo(null);
    try {
      const od = journaux.find((j) => j.code === 'OD');
      await api.post('/ecritures/imputation-ouverture', {
        exerciceId,
        journalId: od?.id ?? journaux[0]?.id,
        motif: iMotif,
        justification: iJustification,
        compteReportANouveauId: iCompteRan,
        compteContrepartieId: iCompteContrepartie,
        montant: Number(iMontant),
      });
      setInfo('Imputation enregistrée · elle porte son motif et sa justification, à reprendre en Notes annexes.');
      setIMontant('');
      setIJustification('');
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible d’enregistrer cette imputation');
    } finally {
      setEnvoi(false);
    }
  };

  const clorePeriode = async (e: FormEvent) => {
    e.preventDefault();
    if (!exerciceId) return;
    setEnvoi(true);
    setErreur(null);
    setInfo(null);
    try {
      await api.post(`/exercices/${exerciceId}/clotures/periode`, { dateLimite: dateLimitePeriode });
      setInfo('Clôture de période enregistrée · définitive, tous journaux confondus.');
      setDateLimitePeriode('');
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible d’enregistrer cette clôture de période');
    } finally {
      setEnvoi(false);
    }
  };

  const annuler = async (c: Cloture) => {
    if (!confirm(`Annuler la clôture ${LIBELLE_GRANULARITE[c.granularite]} du ${new Date(c.dateLimite).toLocaleDateString('fr-FR')} ?`)) return;
    setErreur(null);
    setInfo(null);
    try {
      await api.post(`/exercices/clotures/${c.id}/annuler`);
      setInfo('Clôture annulée.');
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible d’annuler cette clôture');
    }
  };

  const cloturerExercice = async () => {
    if (!exercice) return;
    if (
      !confirm(
        `Clôturer définitivement l'exercice ${new Date(exercice.dateDebut).toLocaleDateString('fr-FR')} · ${new Date(
          exercice.dateFin,
        ).toLocaleDateString('fr-FR')} ?\n\nCette action solde les comptes de charges/produits sur le résultat et génère le report à-nouveau réel dans l'exercice suivant.`,
      )
    ) {
      return;
    }
    setEnvoi(true);
    setErreur(null);
    setInfo(null);
    try {
      await api.post(`/exercices/${exercice.id}/cloturer`);
      setInfo("Exercice clôturé · report à-nouveau généré dans l'exercice suivant.");
      await rechargerExercices();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : "Impossible de clôturer cet exercice");
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div className="p-2">
      <div className="text-[10px] font-mono text-text-dim leading-none">TRAITEMENT · FIN D'EXERCICE</div>
      <h1 className="text-[12px] font-bold leading-tight mb-1.5 flex items-center gap-1.5">
        Clôture d'exercice
        <Aide sujet="exerciceClos" />
      </h1>

      <div className="mb-3 flex items-center gap-2 max-w-[640px]">
        <label className="text-[10.5px] font-semibold text-text-dim">
          Exercice
          <select
            value={exerciceId}
            onChange={(e) => setExerciceId(e.target.value)}
            className="mt-1 ml-2 border border-border-dark px-2.5 py-1 text-[11px] font-normal"
          >
            {exercices.map((e) => (
              <option key={e.id} value={e.id}>
                {new Date(e.dateDebut).toLocaleDateString('fr-FR')} · {new Date(e.dateFin).toLocaleDateString('fr-FR')} (
                {e.statut === 'OUVERT' ? 'Ouvert' : 'Clôturé'})
              </option>
            ))}
          </select>
        </label>
        {chargementExercices && <span className="text-[10.5px] text-text-dim">Chargement…</span>}
      </div>

      {/*
        DATE D'ARRÊTÉ DES COMPTES · la quatrième mention obligatoire de chaque
        page publiée (AUDCIF Titre IX ch. 1 § 2.4) et la seule que le dossier
        ne portait nulle part. Elle est ici et non dans les paramètres du
        dossier parce qu'elle appartient à L'EXERCICE : chaque exercice a la
        sienne, et un nouvel arrêté peut la remplacer (ch. 31 § 1.6).
      */}
      {exercice && (
        <form onSubmit={arreterComptes} className="mb-4 border border-border bg-surface px-4 py-3 max-w-[720px]">
          <div className="font-mono text-[10.5px] font-semibold text-text-dim mb-1">ARRÊTÉ DES COMPTES</div>
          <p className="text-[10px] text-text-dim leading-[1.55] mb-2">
            Date à laquelle les organes dirigeants ont arrêté les comptes. Ce n’est pas la clôture : elle lui est
            postérieure de plusieurs semaines, dans la limite de quatre mois. Elle doit figurer sur chaque page des
            états financiers publiés, et le logiciel l’imprime dès qu’elle est renseignée.
          </p>
          <div className="flex items-end gap-2 flex-wrap">
            <label className="text-[10.5px] font-semibold text-text-dim">
              Comptes arrêtés le
              <input
                type="date"
                value={dateArrete}
                onChange={(e) => setDateArrete(e.target.value)}
                className="mt-1 block border border-border-dark px-2 py-1 text-[11px] font-mono"
              />
            </label>
            <button type="submit" disabled={envoi} className="bg-sel text-white text-[11px] font-semibold px-3 py-1.5 disabled:opacity-50">
              {envoi ? '…' : 'Enregistrer'}
            </button>
            {exercice.dateArreteComptes ? (
              <span className="text-[10.5px] text-positive">
                Actuellement : {new Date(exercice.dateArreteComptes).toLocaleDateString('fr-FR')}
              </span>
            ) : (
              <span className="text-[10.5px] text-danger">Non renseignée · les états s’impriment sans elle</span>
            )}
          </div>
        </form>
      )}

      {/*
        LES DEUX SEULES EXCEPTIONS À LA CORRESPONDANCE BILAN DE CLÔTURE /
        BILAN D'OUVERTURE. Repliée par défaut : c'est une opération rare, et
        l'ouvrir d'emblée inviterait à s'en servir comme d'une saisie
        ordinaire, ce qu'elle n'est pas.
      */}
      {exercice && (
        <div className="mb-4 border border-border bg-surface max-w-[720px]">
          <button
            onClick={() => setImputationOuverte((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-surface-alt"
          >
            <span className="font-mono text-[10.5px] font-semibold text-text-dim">
              IMPUTATION AUX CAPITAUX PROPRES D’OUVERTURE
            </span>
            <span className="text-[10.5px] text-text-dim">{imputationOuverte ? 'Réduire' : 'Déployer'}</span>
          </button>
          {imputationOuverte && (
            <form onSubmit={imputerOuverture} className="px-4 pb-3 border-t border-border pt-3">
              <p className="text-[10px] text-text-dim leading-[1.55] mb-2.5">
                Le bilan d’ouverture d’un exercice doit correspondre au bilan de clôture du précédent. Les
                incidences d’un changement de méthode et les charges ou produits d’exercices antérieurs omis
                transitent par le compte de résultat, jamais directement par les capitaux propres.
                <span className="block mt-1 font-semibold">
                  Deux exceptions seulement, et elles se justifient en Notes annexes.
                </span>
              </p>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-[10.5px] font-semibold text-text-dim col-span-2">
                  Motif
                  <select value={iMotif} onChange={(e) => setIMotif(e.target.value as typeof iMotif)} className="mt-1 w-full border border-border-dark px-2 py-1 text-[11px]">
                    <option value="CHANGEMENT_METHODE">Changement de méthode à impact fort significatif</option>
                    <option value="CORRECTION_ERREUR_SIGNIFICATIVE">Correction d’une erreur significative d’un exercice antérieur</option>
                  </select>
                </label>
                <label className="text-[10.5px] font-semibold text-text-dim">
                  Report à nouveau (compte 12)
                  <select required value={iCompteRan} onChange={(e) => setICompteRan(e.target.value)} className="mt-1 w-full border border-border-dark px-2 py-1 text-[11px]">
                    <option value="" />
                    {comptes.filter((c) => c.numero.startsWith('12')).map((c) => (
                      <option key={c.id} value={c.id}>{c.numero} · {c.intitule}</option>
                    ))}
                  </select>
                </label>
                <label className="text-[10.5px] font-semibold text-text-dim">
                  Contrepartie (poste de bilan)
                  <select required value={iCompteContrepartie} onChange={(e) => setICompteContrepartie(e.target.value)} className="mt-1 w-full border border-border-dark px-2 py-1 text-[11px]">
                    <option value="" />
                    {comptes.filter((c) => !/^[67]/.test(c.numero)).map((c) => (
                      <option key={c.id} value={c.id}>{c.numero} · {c.intitule}</option>
                    ))}
                  </select>
                </label>
                <label className="text-[10.5px] font-semibold text-text-dim col-span-2">
                  Montant · positif pour DÉBITER le report à nouveau, négatif pour le créditer
                  <input required type="number" step="0.01" value={iMontant} onChange={(e) => setIMontant(e.target.value)} className="mt-1 w-full border border-border-dark px-2 py-1 text-[11px] font-mono" />
                </label>
                <label className="text-[10.5px] font-semibold text-text-dim col-span-2">
                  Justification · reprise en Notes annexes
                  <textarea
                    required
                    rows={3}
                    maxLength={2000}
                    value={iJustification}
                    onChange={(e) => setIJustification(e.target.value)}
                    placeholder="Nature du changement ou de l’erreur, exercice concerné, méthode de détermination de l’impact…"
                    className="mt-1 w-full border border-border-dark px-2 py-1 text-[11px] leading-[1.5]"
                  />
                </label>
              </div>
              <button type="submit" disabled={envoi} className="mt-3 bg-sel text-white text-[11px] font-semibold px-3 py-1.5 disabled:opacity-50">
                {envoi ? '…' : 'Enregistrer l’imputation'}
              </button>
            </form>
          )}
        </div>
      )}

      {erreur && <div className="text-[11px] text-danger bg-danger-soft border border-danger/30 px-2.5 py-1.5 mb-3 max-w-[720px]">{erreur}</div>}
      {info && <div className="text-[11px] text-positive bg-positive-soft border border-positive/30 px-2.5 py-1.5 mb-3 max-w-[720px]">{info}</div>}

      {/*
        PLANNING DE CLÔTURE · l'état prévisionnel des travaux de fin
        d'exercice, décrit par le CPCC (« Notes de cours d'organisation
        comptable », § 2.3 et § 7.1) : « un état prévisionnel des différents
        travaux à exécuter préalablement à la publication, sous la forme
        légale ou normalisée, des états financiers ». La fenêtre savait
        clôturer, elle ne savait pas préparer la clôture.
        Les échéances légales sont indicatives et sourcées jalon par jalon ·
        voir docs/organisation-comptable-cpcc.md § 6 pour les réserves.
      */}
      {planning && (
        <div className="mb-5 border border-border max-w-[1100px] bg-surface">
          <button
            onClick={() => setPlanningOuvert((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-surface-alt"
          >
            <span className="font-mono text-[10.5px] font-semibold text-text-dim">
              PLANNING DE CLÔTURE · {planning.jalons.filter((j) => j.enRetard).length} jalon(s) en retard
            </span>
            <span className="text-[10.5px] text-text-dim">{planningOuvert ? 'Réduire' : 'Déployer'}</span>
          </button>

          {planningOuvert && (
            <div className="border-t border-border">
              <table className="w-full text-[10.5px] border-collapse">
                <thead>
                  <tr className="bg-chrome-alt text-[10px] font-mono text-text-dim">
                    <th className="text-left px-3 py-1.5 font-semibold w-8">#</th>
                    <th className="text-left px-3 py-1.5 font-semibold">Travaux</th>
                    <th className="text-left px-3 py-1.5 font-semibold w-24">Échéance</th>
                    <th className="text-left px-3 py-1.5 font-semibold w-20">Nature</th>
                    <th className="text-left px-3 py-1.5 font-semibold w-64">État</th>
                  </tr>
                </thead>
                <tbody>
                  {planning.jalons.map((j) => (
                    <tr key={j.etape} className="border-t border-border align-top">
                      <td className="px-3 py-2 font-mono text-text-dim">{j.etape}</td>
                      <td className="px-3 py-2">
                        <div className="font-semibold">{j.libelle}</div>
                        <div className="text-[10.5px] text-text-dim mt-0.5">{j.detail}</div>
                        {/* La sanction est affichée SOUS le détail et non dans la
                            colonne « Nature » · l'étiquette LÉGAL y qualifie une
                            échéance opposable à un tiers, alors qu'ici c'est
                            l'omission qui est punie, quelle qu'ait été la date. */}
                        {j.sanction && (
                          <div className="text-[10px] text-danger mt-1 leading-[1.5]">{j.sanction}</div>
                        )}
                        <div className="text-[10px] text-text-dim mt-1 italic">{j.source}</div>
                      </td>
                      <td className={`px-3 py-2 font-mono ${j.enRetard ? 'text-danger font-bold' : ''}`}>
                        {new Date(j.echeance).toLocaleDateString('fr-FR')}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`font-mono text-[10px] font-bold px-1.5 py-0.5 ${
                            j.nature === 'LEGALE' ? 'bg-danger-soft text-danger' : 'bg-surface-alt text-text-dim'
                          }`}
                        >
                          {j.nature === 'LEGALE' ? 'LÉGAL' : 'INTERNE'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-[10.5px]">
                        {j.observation ? (
                          <span className={j.observation.satisfait ? 'text-positive' : 'text-danger'}>
                            {j.observation.satisfait ? '✓ ' : '! '}
                            {j.observation.libelle}
                          </span>
                        ) : (
                          <span className="text-text-dim">Suivi manuel</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="px-3 py-2.5 text-[10px] text-text-dim border-t border-border">
                Les dates se calculent à partir de la date de clôture de cet exercice. Chaque jalon porte sa
                source : ceux qui citent un acte uniforme, une loi ou un article ont été lus sur texte primaire ;
                ceux qui citent les notes de cours d’organisation comptable du CPCC (novembre 2020) en viennent, et
                n’ont pas été revérifiés sur texte primaire. Dans tous les cas ce sont des jalons indicatifs, pas un
                calcul d’obligation. Dernière vérification de la table : {planning.derniereVerification}. Aucune
                astreinte n’est chiffrée ici.
              </p>
            </div>
          )}
        </div>
      )}

      {exercice && (
        <div className="mb-5 border border-border max-w-[720px] p-4 bg-surface">
          <div className="font-mono text-[10.5px] font-semibold text-text-dim mb-2">CLÔTURE ANNUELLE</div>
          <p className="text-[11px] text-text-dim mb-3">
            Solde les comptes de charges/produits (mode « Aucun ») sur le résultat de l'exercice, puis génère le
            report à-nouveau réel dans l'exercice suivant selon le mode de chaque compte (Solde/Détail). Action
            définitive.
          </p>
          {exercice.statut === 'CLOTURE' ? (
            <span className="font-mono text-[10px] font-bold px-2 py-1 bg-surface-alt text-text-dim w-fit inline-block">
              EXERCICE DÉJÀ CLÔTURÉ
            </span>
          ) : estAdmin ? (
            <button
              onClick={cloturerExercice}
              disabled={envoi}
              className="bg-danger text-white text-[11px] font-semibold px-4 py-1.5 disabled:opacity-50 flex items-center gap-1.5"
            >
              <IconLock width={14} height={14} />
              {envoi ? 'Clôture…' : "Clôturer l'exercice"}
            </button>
          ) : (
            <span className="text-[10.5px] text-text-dim">Réservé aux administrateurs du dossier.</span>
          )}
        </div>
      )}

      {estAdmin && exercice && exercice.statut === 'OUVERT' && (
        <div className="grid grid-cols-3 gap-3 mb-5 max-w-[980px]">
          <form onSubmit={clorePartielle} className="bg-surface border border-border p-3">
            <div className="font-mono text-[10px] font-semibold text-text-dim mb-2">CLÔTURE PARTIELLE</div>
            <p className="text-[10.5px] text-text-dim mb-2">Verrouille un journal jusqu'à une date · réversible.</p>
            <label className="block text-[10.5px] font-semibold text-text-dim mb-2">
              Journal
              <select
                required
                value={journalPartielleId}
                onChange={(e) => setJournalPartielleId(e.target.value)}
                className="mt-1 w-full border border-border-dark px-2 py-1 text-[11px] font-normal"
              >
                <option value="">Sélectionner</option>
                {journaux.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.code} · {j.intitule}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-[10.5px] font-semibold text-text-dim mb-2">
              Date limite
              <input
                required
                type="date"
                value={dateLimitePartielle}
                onChange={(e) => setDateLimitePartielle(e.target.value)}
                className="mt-1 w-full border border-border-dark px-2 py-1 text-[11px] font-normal"
              />
            </label>
            <button type="submit" disabled={envoi} className="bg-sel text-white text-[10.5px] font-semibold px-3 py-1.5 disabled:opacity-50">
              Clôturer
            </button>
          </form>

          <form onSubmit={cloreTotale} className="bg-surface border border-border p-3">
            <div className="font-mono text-[10px] font-semibold text-text-dim mb-2">CLÔTURE TOTALE</div>
            <p className="text-[10.5px] text-text-dim mb-2">Fige un journal en entier · définitive.</p>
            <label className="block text-[10.5px] font-semibold text-text-dim mb-2">
              Journal
              <select
                required
                value={journalTotaleId}
                onChange={(e) => setJournalTotaleId(e.target.value)}
                className="mt-1 w-full border border-border-dark px-2 py-1 text-[11px] font-normal"
              >
                <option value="">Sélectionner</option>
                {journaux.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.code} · {j.intitule}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" disabled={envoi} className="bg-sel text-white text-[10.5px] font-semibold px-3 py-1.5 disabled:opacity-50 mt-[38px]">
              Clôturer
            </button>
          </form>

          <form onSubmit={clorePeriode} className="bg-surface border border-border p-3">
            <div className="font-mono text-[10px] font-semibold text-text-dim mb-2">CLÔTURE DE PÉRIODE</div>
            <p className="text-[10.5px] text-text-dim mb-2">Verrouille tous les journaux jusqu'à une date · définitive.</p>
            <label className="block text-[10.5px] font-semibold text-text-dim mb-2">
              Date limite
              <input
                required
                type="date"
                value={dateLimitePeriode}
                onChange={(e) => setDateLimitePeriode(e.target.value)}
                className="mt-1 w-full border border-border-dark px-2 py-1 text-[11px] font-normal"
              />
            </label>
            <button type="submit" disabled={envoi} className="bg-sel text-white text-[10.5px] font-semibold px-3 py-1.5 disabled:opacity-50 mt-[38px]">
              Clôturer
            </button>
          </form>
        </div>
      )}

      <div
        // `overflow-x-auto` ici, `min-w` sur les lignes · les 558 px de colonnes
        // incompressibles du tableau ne tiennent pas dans les ~326 px utiles d'une
        // fenêtre à 360 px, et sans conteneur le débordement remontait à la fenêtre,
        // qui emportait alors titre, onglets et boutons hors de l'écran.
        className="border border-border bg-surface shadow-posee max-w-[980px] overflow-x-auto"
      >
        <div className="grid grid-cols-[90px_1fr_100px_110px_90px_100px] min-w-[710px] gap-2 px-3.5 py-1.5 bg-chrome border-b border-border text-[10px] font-bold text-text-dim">
          <span>GRANULARITÉ</span>
          <span>JOURNAL</span>
          <span>DATE LIMITE</span>
          <span>CRÉÉE LE</span>
          <span>STATUT</span>
          <span>ACTION</span>
        </div>
        {!clotures && <div className="p-3 text-[11px] text-text-dim">Chargement…</div>}
        {clotures?.length === 0 && <div className="p-3 text-[11px] text-text-dim">Aucune clôture enregistrée sur cet exercice.</div>}
        {clotures?.map((c, i) => (
          <div
            key={c.id}
            className={`grid grid-cols-[90px_1fr_100px_110px_90px_100px] min-w-[710px] gap-2 items-center px-3.5 py-1.5 border-b border-border last:border-b-0 text-[10.5px] ${
              i % 2 === 0 ? 'bg-surface' : 'bg-surface-alt'
            }`}
          >
            <span className="font-semibold">{LIBELLE_GRANULARITE[c.granularite]}</span>
            <span className="font-mono text-text-dim truncate">
              {c.journal ? `${c.journal.code} · ${c.journal.intitule}` : 'Tous journaux'}
            </span>
            <span className="font-mono text-[10px] text-text-dim">{new Date(c.dateLimite).toLocaleDateString('fr-FR')}</span>
            <span className="font-mono text-[10px] text-text-dim">{new Date(c.createdAt).toLocaleDateString('fr-FR')}</span>
            <span>
              {c.annuleeAt ? (
                <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 bg-surface-alt text-text-dim">ANNULÉE</span>
              ) : (
                <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 bg-warning-soft text-warning flex items-center gap-1 w-fit">
                  <IconLock width={10} height={10} /> ACTIVE
                </span>
              )}
            </span>
            <span>
              {estAdmin && c.annulable && !c.annuleeAt && (
                <button onClick={() => annuler(c)} className="text-[10px] font-semibold text-sel hover:underline">
                  Annuler
                </button>
              )}
              {c.annuleeAt && <IconCheck width={12} height={12} className="text-text-dim" />}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
