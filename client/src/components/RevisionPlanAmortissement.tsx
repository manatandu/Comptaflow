import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { montant } from '../lib/montants';
import type { Journal } from '../lib/types';
import { Aide } from './chrome/Aide';

interface RevisionLue {
  id: string;
  nature: 'PROSPECTIVE' | 'RETROACTIVE';
  dateDecision: string;
  dureeAvantAns: number;
  dureeApresAns: number;
  motif: string;
  montantReprise: number | null;
}

/**
 * RÉVISER LE PLAN D'AMORTISSEMENT (lot 11, décision D-24) · prospective par
 * défaut, sans écriture ; rétroactive en option, la réduction du cumul reprise
 * D 28 / C 798. Le serveur tient tous les refus (`reviserPlan`) · l'écran ne
 * fait que poser la question et montrer l'historique.
 */
export function RevisionPlanAmortissement({
  bien,
  journaux,
  onFait,
  onFermer,
}: {
  bien: { id: string; designation: string };
  journaux: Journal[];
  onFait: (message: string) => void;
  onFermer: () => void;
}) {
  const { peutEcrire } = useAuth();
  const [nature, setNature] = useState<'PROSPECTIVE' | 'RETROACTIVE'>('PROSPECTIVE');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [duree, setDuree] = useState('');
  const [motif, setMotif] = useState('');
  const [journalId, setJournalId] = useState(() => journaux.find((j) => j.code === 'OD')?.id ?? journaux[0]?.id ?? '');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  // null tant que l'historique n'est pas lu · « aucune révision » ne se dit que sur une liste lue.
  const [historique, setHistorique] = useState<RevisionLue[] | null>(null);
  const [erreurHistorique, setErreurHistorique] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<RevisionLue[]>(`/immobilisations/${bien.id}/revisions-plan`)
      .then(setHistorique)
      .catch((err) => setErreurHistorique(err instanceof ApiError ? err.message : 'Historique illisible'));
  }, [bien.id]);

  if (!peutEcrire) return null;

  const envoyer = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnvoi(true);
    setErreur(null);
    try {
      const r = await api.post<{ dureeAmortissementAns: number; montantReprise: number | null }>(
        `/immobilisations/${bien.id}/revision-plan`,
        {
          nature,
          dateDecision: date,
          nouvelleDureeAns: Number(duree),
          motif,
          ...(nature === 'RETROACTIVE' ? { journalId } : {}),
        },
      );
      onFait(
        nature === 'PROSPECTIVE'
          ? `Plan de « ${bien.designation} » révisé · ${duree} an(s) restant(s) à compter de l'ouverture de l'exercice.`
          : `Plan de « ${bien.designation} » révisé sur ${r.dureeAmortissementAns} ans · ${montant(r.montantReprise)} repris au 798.`,
      );
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Révision refusée');
    } finally {
      setEnvoi(false);
    }
  };

  const champ = 'mt-1 w-full border border-border-dark px-2 py-1 text-[11.5px]';
  const libelle = 'text-[11.5px] font-semibold text-text-dim';
  return (
    <form onSubmit={(e) => void envoyer(e)} className="bg-chrome border-b border-border px-4 py-3">
      {erreur && <div className="mb-2 text-[11.5px] text-danger">{erreur}</div>}
      <div className="grid grid-cols-4 gap-3 items-end">
        <label className={libelle}>
          <span className="flex items-center gap-1">
            Nature de la révision
            <Aide
              titre="Révision du plan"
              texte="Une nouvelle estimation de la durée est un changement d'estimation : elle n'a d'effet que sur l'exercice en cours et les suivants, et la valeur restant à amortir à l'ouverture se répartit sur la durée résiduelle, sans écriture. La révision rétroactive est un cas exceptionnel : le plan est rejoué avec la nouvelle durée totale et la réduction du cumul passe au crédit du 798. Elle se décide avant la dotation de l'exercice, et la correction doit être révélée et quantifiée, avec ses raisons."
              source="Cadre conceptuel § 3.3.1.2 ; fiches des comptes 28 et 79"
            />
          </span>
          <select value={nature} onChange={(e) => setNature(e.target.value as typeof nature)} className={champ}>
            <option value="PROSPECTIVE">Prospective</option>
            <option value="RETROACTIVE">Rétroactive (reprise au 798)</option>
          </select>
        </label>
        <label className={libelle}>
          Date de la décision
          <input required type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${champ} font-mono`} />
        </label>
        <label className={libelle}>
          {nature === 'PROSPECTIVE' ? 'Durée résiduelle (ans)' : 'Nouvelle durée totale (ans)'}
          <input required type="number" min={1} max={100} value={duree} onChange={(e) => setDuree(e.target.value)} className={`${champ} font-mono`} />
        </label>
        {nature === 'RETROACTIVE' && (
          <label className={libelle}>
            Journal
            <select required value={journalId} onChange={(e) => setJournalId(e.target.value)} className={champ}>
              {journaux.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.code} · {j.intitule}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className={`${libelle} col-span-4`}>
          Raisons de la révision
          <input required value={motif} onChange={(e) => setMotif(e.target.value)} className={champ} />
        </label>
      </div>
      <div className="flex gap-2 mt-3">
        <button type="submit" disabled={envoi} className="bg-sel text-white text-[11.5px] font-semibold px-3 py-1.5 disabled:opacity-50">{envoi ? '…' : 'Réviser'}</button>
        <button type="button" onClick={onFermer} className="text-[11.5px] font-semibold text-text-dim px-3 py-1.5">Annuler</button>
      </div>
      <div className="mt-3 text-[11.5px]">
        <div className="font-semibold text-text-dim mb-1">Révisions du plan</div>
        {erreurHistorique ? (
          <div className="text-danger">{erreurHistorique}</div>
        ) : historique === null ? (
          <div className="text-text-dim">…</div>
        ) : historique.length === 0 ? (
          <div className="text-text-dim">Aucune révision.</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr>
                <th className="text-left">Date</th>
                <th className="text-left">Nature</th>
                <th className="text-right">Durée avant</th>
                <th className="text-right">Durée après</th>
                <th className="text-right">Reprise au 798</th>
                <th className="text-left">Raisons</th>
              </tr>
            </thead>
            <tbody>
              {historique.map((r) => (
                <tr key={r.id}>
                  <td className="font-mono">{new Date(r.dateDecision).toLocaleDateString('fr-FR')}</td>
                  <td>{r.nature === 'PROSPECTIVE' ? 'Prospective' : 'Rétroactive'}</td>
                  <td className="text-right font-mono">{r.dureeAvantAns} ans</td>
                  <td className="text-right font-mono">
                    {r.dureeApresAns} ans{r.nature === 'PROSPECTIVE' ? ' restants' : ''}
                  </td>
                  <td className="text-right font-mono">{montant(r.montantReprise)}</td>
                  <td>{r.motif}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </form>
  );
}
