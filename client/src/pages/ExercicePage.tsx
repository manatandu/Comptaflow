import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useExercice } from '../lib/exercice';
import { IconLock, IconCheck } from '../components/chrome/icons';
import type { Cloture, GranulariteCloture, Journal } from '../lib/types';

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
      setClotures(await api.get<Cloture[]>(`/exercices/${exerciceId}/clotures`));
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
      <h1 className="text-[15px] font-bold mb-2.5">Clôture d'exercice</h1>

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
