import { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useExercice } from '../lib/exercice';
import { Aide } from '../components/chrome/Aide';
import type { EtatBrouillard, Journal } from '../lib/types';
import { EnteteImpression } from '../components/chrome/EnteteImpression';

/**
 * BROUILLARD · État → Brouillard de Sage 100 i7 : « un document qui permet de
 * conserver une trace écrite des saisies faites sur une période ou un
 * journal ». Ici, il fait un peu plus que conserver une trace, il donne le
 * bouton qui fait entrer les écritures au livre-journal.
 *
 * La colonne ANCIENNETÉ est la part proprement SYCEBNL de cet écran. La
 * Partie 2 ch. 2 admet la tenue de journaux auxiliaires mais impose que
 * « les données des documents auxiliaires sont centralisées AU MOINS CHAQUE
 * SEMAINE dans le journal ou le grand-livre ». Une écriture qui séjourne au
 * brouillard depuis plus de sept jours n'est donc plus un document de travail,
 * c'est un retard de centralisation · le logiciel le dit au lieu de le taire.
 *
 * Sage, lui, se contente d'exiger qu'un journal soit imprimé avant d'être
 * clôturé. C'est moins exigeant, et sans rapport avec un délai.
 */

function montant(n: number): string {
  return n !== 0 ? n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
}

export function BrouillardPage() {
  const { estAdmin, utilisateur } = useAuth();
  const { exerciceCourant } = useExercice();
  const [etat, setEtat] = useState<EtatBrouillard | null>(null);
  const [journaux, setJournaux] = useState<Journal[]>([]);
  const [journalId, setJournalId] = useState('');
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [deplie, setDeplie] = useState<Set<string>>(new Set());
  const [dateLimite, setDateLimite] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const peutValider = estAdmin || utilisateur?.role === 'COMPTABLE';

  const charger = async () => {
    if (!exerciceCourant) return;
    try {
      const r = await api.get<EtatBrouillard>(
        `/ecritures/brouillard?exerciceId=${exerciceCourant.id}${journalId ? `&journalId=${journalId}` : ''}`,
      );
      setEtat(r);
      setSelection(new Set());
      setErreur(null);
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Chargement impossible');
    }
  };

  useEffect(() => {
    api.get<Journal[]>('/journaux').then(setJournaux, () => setJournaux([]));
  }, []);

  useEffect(() => {
    charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exerciceCourant?.id, journalId]);

  useEffect(() => {
    if (exerciceCourant && !dateLimite) setDateLimite(new Date().toISOString().slice(0, 10));
  }, [exerciceCourant, dateLimite]);

  const basculer = (id: string) =>
    setSelection((prev) => {
      const suivante = new Set(prev);
      if (suivante.has(id)) suivante.delete(id);
      else suivante.add(id);
      return suivante;
    });

  const selectionnables = useMemo(() => (etat?.lignes ?? []).filter((l) => l.equilibree), [etat]);

  const validerSelection = async () => {
    if (selection.size === 0) return;
    setEnvoi(true);
    setErreur(null);
    try {
      const r = await api.post<{ validees: number; dejaValidees: number }>('/ecritures/valider', {
        ecritureIds: [...selection],
      });
      setInfo(`${r.validees} écriture(s) entrée(s) au livre-journal.`);
      await charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Validation impossible');
    } finally {
      setEnvoi(false);
    }
  };

  const validerJusqua = async () => {
    if (!exerciceCourant || !dateLimite) return;
    setEnvoi(true);
    setErreur(null);
    try {
      const r = await api.post<{ validees: number; dejaValidees: number }>('/ecritures/valider-jusqua', {
        exerciceId: exerciceCourant.id,
        dateLimite,
        journalId: journalId || undefined,
      });
      setInfo(
        r.validees === 0
          ? 'Rien à valider jusqu’à cette date.'
          : `${r.validees} écriture(s) entrée(s) au livre-journal.`,
      );
      await charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Validation impossible');
    } finally {
      setEnvoi(false);
    }
  };

  const supprimer = async (id: string) => {
    setErreur(null);
    try {
      await api.delete(`/ecritures/${id}`);
      setInfo('Écriture supprimée du brouillard.');
      await charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Suppression impossible');
    }
  };

  const grille = 'grid grid-cols-[28px_92px_60px_70px_1fr_120px_120px_96px_70px] gap-2';

  return (
    <div className="p-2">
      <EnteteImpression titre="Brouillard" />
      <div className="flex items-end justify-between mb-1.5 gap-3 flex-wrap">
        <div>
          <div className="text-[10px] font-mono text-text-dim leading-none">ÉTAT</div>
          <h1 className="text-[12px] font-bold leading-tight flex items-center gap-1.5">
            Brouillard
            <Aide sujet="brouillard" />
          </h1>
        </div>
        <div className="flex items-end gap-2.5 flex-wrap">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-text-dim">JOURNAL</span>
            <select
              value={journalId}
              onChange={(e) => setJournalId(e.target.value)}
              className="border border-border rounded-[6px] bg-surface px-2 py-1 text-[10.5px] min-w-[170px]"
            >
              <option value="">Tous les journaux</option>
              {journaux.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.code} · {j.intitule}
                </option>
              ))}
            </select>
          </label>
          {peutValider && (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-text-dim">VALIDER JUSQU'AU</span>
                <input
                  type="date"
                  value={dateLimite}
                  onChange={(e) => setDateLimite(e.target.value)}
                  className="border border-border rounded-[6px] bg-surface px-2 py-1 text-[10.5px] font-mono"
                />
              </label>
              <button
                onClick={validerJusqua}
                disabled={envoi || !dateLimite}
                className="border border-border rounded-[6px] bg-surface px-3 py-1.5 text-[10.5px] font-semibold hover:bg-chrome-alt disabled:opacity-50"
              >
                Valider la période
              </button>
              <button
                onClick={validerSelection}
                disabled={envoi || selection.size === 0}
                className="bg-sel text-white text-[10.5px] font-bold px-3.5 py-1.5 rounded-[6px] hover:brightness-110 disabled:opacity-50"
              >
                Valider la sélection ({selection.size})
              </button>
            </>
          )}
        </div>
      </div>

      {erreur && (
        <div className="mb-2.5 text-[11px] text-danger bg-danger-soft border border-danger/30 rounded-[6px] px-2.5 py-1.5">
          {erreur}
        </div>
      )}
      {info && (
        <div className="mb-2.5 text-[11px] text-positive bg-positive-soft border border-positive/30 rounded-[6px] px-2.5 py-1.5 flex justify-between">
          <span>{info}</span>
          <button onClick={() => setInfo(null)} className="font-bold hover:underline">
            Fermer
          </button>
        </div>
      )}

      {etat && etat.totaux.enRetard > 0 && (
        <div className="mb-2.5 text-[11px] text-warning bg-warning-soft border border-warning/30 rounded-[6px] px-2.5 py-2 leading-[1.55]">
          <strong>
            {etat.totaux.enRetard} écriture(s) séjournent au brouillard depuis plus de {etat.delaiCentralisationJours}{' '}
            jours.
          </strong>{' '}
          Le SYCEBNL veut les journaux auxiliaires centralisés au moins chaque semaine dans le journal ou le
          grand-livre (Partie 2, ch. 2) : au-delà, ce n'est plus un document de travail, c'est un retard de
          centralisation.
        </div>
      )}
      {etat && etat.totaux.desequilibrees > 0 && (
        <div className="mb-2.5 text-[11px] text-danger bg-danger-soft border border-danger/30 rounded-[6px] px-2.5 py-2">
          {etat.totaux.desequilibrees} écriture(s) sont déséquilibrées et ne peuvent pas être validées. Reprenez-les
          dans la saisie.
        </div>
      )}

      <div className="bg-surface border border-border rounded-[10px] shadow-posee overflow-hidden">
        <div
          className={`${grille} px-3 py-1.5 bg-chrome-alt border-b border-border text-[10px] font-bold text-text-dim`}
        >
          <span>
            {peutValider && (
              <input
                type="checkbox"
                checked={selection.size > 0 && selection.size === selectionnables.length}
                onChange={(e) =>
                  setSelection(e.target.checked ? new Set(selectionnables.map((l) => l.id)) : new Set())
                }
              />
            )}
          </span>
          <span>DATE</span>
          <span>JAL</span>
          <span>PIÈCE</span>
          <span>LIBELLÉ</span>
          <span className="text-right">DÉBIT</span>
          <span className="text-right">CRÉDIT</span>
          <span className="text-right">ANCIENNETÉ</span>
          <span />
        </div>

        {!etat && <div className="px-3 py-4 text-[11px] text-text-dim">Chargement…</div>}
        {etat?.lignes.map((l) => (
          <div key={l.id}>
            <div
              className={`${grille} px-3 py-1 text-[11px] items-center border-b border-border/40 ${
                !l.equilibree ? 'bg-danger-soft' : l.retardCentralisation ? 'bg-warning-soft' : ''
              }`}
            >
              <span>
                {peutValider && l.equilibree && (
                  <input type="checkbox" checked={selection.has(l.id)} onChange={() => basculer(l.id)} />
                )}
              </span>
              <span className="font-mono">{l.date}</span>
              <span className="font-mono">{l.journal}</span>
              <span className="font-mono text-text-dim">{l.numeroPiece ?? '·'}</span>
              <button
                onClick={() =>
                  setDeplie((prev) => {
                    const s = new Set(prev);
                    if (s.has(l.id)) s.delete(l.id);
                    else s.add(l.id);
                    return s;
                  })
                }
                className="text-left truncate hover:underline"
                title="Voir le détail des lignes"
              >
                {l.libelle}
                {l.reference && <span className="text-text-dim"> · {l.reference}</span>}
              </button>
              <span className="text-right font-mono">{montant(l.debit)}</span>
              <span className="text-right font-mono">{montant(l.credit)}</span>
              <span
                className={`text-right font-mono text-[10.5px] ${
                  l.retardCentralisation ? 'text-warning font-bold' : 'text-text-dim'
                }`}
              >
                {l.ancienneteJours} j
              </span>
              <span className="text-right">
                {peutValider && (
                  <button
                    onClick={() => supprimer(l.id)}
                    title="Supprimer du brouillard"
                    className="text-[10.5px] text-danger/70 hover:text-danger"
                  >
                    Supprimer
                  </button>
                )}
              </span>
            </div>
            {deplie.has(l.id) &&
              l.lignes.map((li, i) => (
                <div
                  key={i}
                  className={`${grille} px-3 py-0.5 text-[10.5px] border-b border-border/30 bg-chrome-alt/50`}
                >
                  <span />
                  <span />
                  <span />
                  <span className="font-mono text-text-dim">{li.compteNumero}</span>
                  <span className="truncate text-text-dim">{li.libelle ?? li.compteIntitule}</span>
                  <span className="text-right font-mono">{montant(li.debit)}</span>
                  <span className="text-right font-mono">{montant(li.credit)}</span>
                  <span />
                  <span />
                </div>
              ))}
          </div>
        ))}

        {etat && etat.lignes.length === 0 && (
          <div className="px-3 py-5 text-[11px] text-text-dim italic">
            Le brouillard est vide : toutes les écritures de cet exercice sont entrées au livre-journal.
          </div>
        )}

        {etat && etat.lignes.length > 0 && (
          <div className={`${grille} px-3 py-1.5 bg-chrome border-t border-border text-[11px] font-bold`}>
            <span />
            <span />
            <span />
            <span />
            <span>{etat.totaux.nombre} écriture(s) en brouillard</span>
            <span className="text-right font-mono">{montant(etat.totaux.debit)}</span>
            <span className="text-right font-mono">{montant(etat.totaux.credit)}</span>
            <span />
            <span />
          </div>
        )}
      </div>

      <p className="mt-2 text-[10px] text-text-dim leading-[1.55] max-w-[900px]">
        Une écriture en brouillard se modifie et se supprime librement : elle n'est pas encore entrée au
        livre-journal. La valider franchit cette frontière, et l'article 20 de l'AUDCIF ne laisse alors plus qu'une
        voie de correction, l'inscription en négatif. La clôture de l'exercice refuse de s'exécuter tant qu'il reste
        quoi que ce soit ici.
      </p>
    </div>
  );
}
