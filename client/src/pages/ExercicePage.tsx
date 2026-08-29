import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useExercice } from '../lib/exercice';
import { IconLock, IconCheck } from '../components/chrome/icons';
import type { Cloture, GranulariteCloture, Journal, PlanningCloture } from '../lib/types';
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
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  // Journal + date limite (Partielle), journal seul (Totale), date limite seule (Période)
  const [journalPartielleId, setJournalPartielleId] = useState('');
  const [dateLimitePartielle, setDateLimitePartielle] = useState('');
  const [journalTotaleId, setJournalTotaleId] = useState('');
  const [dateLimitePeriode, setDateLimitePeriode] = useState('');

  useEffect(() => {
    if (!exerciceId && exercices.length > 0) {
      const ouvert = exercices.find((e) => e.statut === 'OUVERT') ?? exercices[0];
      setExerciceId(ouvert.id);
    }
  }, [exercices, exerciceId]);

  const exercice = exercices.find((e) => e.id === exerciceId) ?? null;

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
    <div className="p-2.5">
      <div className="text-[10.5px] font-mono text-text-dim">TRAITEMENT · FIN D'EXERCICE</div>
      <h1 className="text-[15px] font-bold mb-2.5 flex items-center gap-1.5">
        Clôture d'exercice
        <Aide sujet="exerciceClos" />
      </h1>

      <div className="mb-3 flex items-center gap-2 max-w-[640px]">
        <label className="text-[11.5px] font-semibold text-text-dim">
          Exercice
          <select
            value={exerciceId}
            onChange={(e) => setExerciceId(e.target.value)}
            className="mt-1 ml-2 border border-border-dark px-2.5 py-1 text-[12.5px] font-normal"
          >
            {exercices.map((e) => (
              <option key={e.id} value={e.id}>
                {new Date(e.dateDebut).toLocaleDateString('fr-FR')} · {new Date(e.dateFin).toLocaleDateString('fr-FR')} (
                {e.statut === 'OUVERT' ? 'Ouvert' : 'Clôturé'})
              </option>
            ))}
          </select>
        </label>
        {chargementExercices && <span className="text-[11px] text-text-dim">Chargement…</span>}
      </div>

      {erreur && <div className="text-[12px] text-danger bg-danger-soft border border-danger/30 px-2.5 py-1.5 mb-3 max-w-[720px]">{erreur}</div>}
      {info && <div className="text-[12px] text-positive bg-positive-soft border border-positive/30 px-2.5 py-1.5 mb-3 max-w-[720px]">{info}</div>}

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
            <span className="font-mono text-[11px] font-semibold text-text-dim">
              PLANNING DE CLÔTURE · {planning.jalons.filter((j) => j.enRetard).length} jalon(s) en retard
            </span>
            <span className="text-[11px] text-text-dim">{planningOuvert ? 'Réduire' : 'Déployer'}</span>
          </button>

          {planningOuvert && (
            <div className="border-t border-border">
              <table className="w-full text-[11.5px] border-collapse">
                <thead>
                  <tr className="bg-chrome-alt text-[10.5px] font-mono text-text-dim">
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
                        <div className="text-[11px] text-text-dim mt-0.5">{j.detail}</div>
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
                      <td className="px-3 py-2 text-[11px]">
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
              <p className="px-3 py-2.5 text-[10.5px] text-text-dim border-t border-border">
                Les dates se calculent à partir de la date de clôture de cet exercice. Les échéances légales
                proviennent des notes de cours d’organisation comptable du CPCC (novembre 2020), antérieures au
                SYCEBNL et non revérifiées sur texte primaire : ce sont des jalons indicatifs, pas un calcul
                d’obligation. Dernière vérification de la table : {planning.derniereVerification}. Aucune astreinte
                n’est chiffrée ici.
              </p>
            </div>
          )}
        </div>
      )}

      {exercice && (
        <div className="mb-5 border border-border max-w-[720px] p-4 bg-surface">
          <div className="font-mono text-[11px] font-semibold text-text-dim mb-2">CLÔTURE ANNUELLE</div>
          <p className="text-[12px] text-text-dim mb-3">
            Solde les comptes de charges/produits (mode « Aucun ») sur le résultat de l'exercice, puis génère le
            report à-nouveau réel dans l'exercice suivant selon le mode de chaque compte (Solde/Détail). Action
            définitive.
          </p>
          {exercice.statut === 'CLOTURE' ? (
            <span className="font-mono text-[10.5px] font-bold px-2 py-1 bg-surface-alt text-text-dim w-fit inline-block">
              EXERCICE DÉJÀ CLÔTURÉ
            </span>
          ) : estAdmin ? (
            <button
              onClick={cloturerExercice}
              disabled={envoi}
              className="bg-danger text-white text-[12.5px] font-semibold px-4 py-1.5 disabled:opacity-50 flex items-center gap-1.5"
            >
              <IconLock width={14} height={14} />
              {envoi ? 'Clôture…' : "Clôturer l'exercice"}
            </button>
          ) : (
            <span className="text-[11.5px] text-text-dim">Réservé aux administrateurs du dossier.</span>
          )}
        </div>
      )}

      {estAdmin && exercice && exercice.statut === 'OUVERT' && (
        <div className="grid grid-cols-3 gap-3 mb-5 max-w-[980px]">
          <form onSubmit={clorePartielle} className="bg-surface border border-border p-3">
            <div className="font-mono text-[10.5px] font-semibold text-text-dim mb-2">CLÔTURE PARTIELLE</div>
            <p className="text-[11px] text-text-dim mb-2">Verrouille un journal jusqu'à une date · réversible.</p>
            <label className="block text-[11px] font-semibold text-text-dim mb-2">
              Journal
              <select
                required
                value={journalPartielleId}
                onChange={(e) => setJournalPartielleId(e.target.value)}
                className="mt-1 w-full border border-border-dark px-2 py-1 text-[12px] font-normal"
              >
                <option value="">Sélectionner</option>
                {journaux.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.code} · {j.intitule}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-[11px] font-semibold text-text-dim mb-2">
              Date limite
              <input
                required
                type="date"
                value={dateLimitePartielle}
                onChange={(e) => setDateLimitePartielle(e.target.value)}
                className="mt-1 w-full border border-border-dark px-2 py-1 text-[12px] font-normal"
              />
            </label>
            <button type="submit" disabled={envoi} className="bg-sel text-white text-[11.5px] font-semibold px-3 py-1.5 disabled:opacity-50">
              Clôturer
            </button>
          </form>

          <form onSubmit={cloreTotale} className="bg-surface border border-border p-3">
            <div className="font-mono text-[10.5px] font-semibold text-text-dim mb-2">CLÔTURE TOTALE</div>
            <p className="text-[11px] text-text-dim mb-2">Fige un journal en entier · définitive.</p>
            <label className="block text-[11px] font-semibold text-text-dim mb-2">
              Journal
              <select
                required
                value={journalTotaleId}
                onChange={(e) => setJournalTotaleId(e.target.value)}
                className="mt-1 w-full border border-border-dark px-2 py-1 text-[12px] font-normal"
              >
                <option value="">Sélectionner</option>
                {journaux.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.code} · {j.intitule}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" disabled={envoi} className="bg-sel text-white text-[11.5px] font-semibold px-3 py-1.5 disabled:opacity-50 mt-[38px]">
              Clôturer
            </button>
          </form>

          <form onSubmit={clorePeriode} className="bg-surface border border-border p-3">
            <div className="font-mono text-[10.5px] font-semibold text-text-dim mb-2">CLÔTURE DE PÉRIODE</div>
            <p className="text-[11px] text-text-dim mb-2">Verrouille tous les journaux jusqu'à une date · définitive.</p>
            <label className="block text-[11px] font-semibold text-text-dim mb-2">
              Date limite
              <input
                required
                type="date"
                value={dateLimitePeriode}
                onChange={(e) => setDateLimitePeriode(e.target.value)}
                className="mt-1 w-full border border-border-dark px-2 py-1 text-[12px] font-normal"
              />
            </label>
            <button type="submit" disabled={envoi} className="bg-sel text-white text-[11.5px] font-semibold px-3 py-1.5 disabled:opacity-50 mt-[38px]">
              Clôturer
            </button>
          </form>
        </div>
      )}

      <div className="border border-border bg-surface shadow-posee max-w-[980px]">
        <div className="grid grid-cols-[90px_1fr_100px_110px_90px_100px] gap-2 px-3.5 py-1.5 bg-chrome border-b border-border text-[10px] font-bold text-text-dim">
          <span>GRANULARITÉ</span>
          <span>JOURNAL</span>
          <span>DATE LIMITE</span>
          <span>CRÉÉE LE</span>
          <span>STATUT</span>
          <span>ACTION</span>
        </div>
        {!clotures && <div className="p-3 text-[12px] text-text-dim">Chargement…</div>}
        {clotures?.length === 0 && <div className="p-3 text-[12px] text-text-dim">Aucune clôture enregistrée sur cet exercice.</div>}
        {clotures?.map((c, i) => (
          <div
            key={c.id}
            className={`grid grid-cols-[90px_1fr_100px_110px_90px_100px] gap-2 items-center px-3.5 py-1.5 border-b border-border last:border-b-0 text-[11.5px] ${
              i % 2 === 0 ? 'bg-surface' : 'bg-surface-alt'
            }`}
          >
            <span className="font-semibold">{LIBELLE_GRANULARITE[c.granularite]}</span>
            <span className="font-mono text-text-dim truncate">
              {c.journal ? `${c.journal.code} · ${c.journal.intitule}` : 'Tous journaux'}
            </span>
            <span className="font-mono text-[10.5px] text-text-dim">{new Date(c.dateLimite).toLocaleDateString('fr-FR')}</span>
            <span className="font-mono text-[10.5px] text-text-dim">{new Date(c.createdAt).toLocaleDateString('fr-FR')}</span>
            <span>
              {c.annuleeAt ? (
                <span className="font-mono text-[9.5px] font-bold px-1.5 py-0.5 bg-surface-alt text-text-dim">ANNULÉE</span>
              ) : (
                <span className="font-mono text-[9.5px] font-bold px-1.5 py-0.5 bg-warning-soft text-warning flex items-center gap-1 w-fit">
                  <IconLock width={10} height={10} /> ACTIVE
                </span>
              )}
            </span>
            <span>
              {estAdmin && c.annulable && !c.annuleeAt && (
                <button onClick={() => annuler(c)} className="text-[10.5px] font-semibold text-sel hover:underline">
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
