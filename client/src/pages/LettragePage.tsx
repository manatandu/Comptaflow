import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import type { Compte, LigneLettrage } from '../lib/types';

export function LettragePage() {
  const { compteId } = useParams<{ compteId: string }>();
  const navigate = useNavigate();
  const [compte, setCompte] = useState<Compte | null>(null);
  const [comptes, setComptes] = useState<Compte[]>([]);
  const [lignes, setLignes] = useState<LigneLettrage[] | null>(null);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const charger = async () => {
    if (!compteId) return;
    try {
      const [tousComptes, lignesLettrage] = await Promise.all([
        api.get<Compte[]>('/comptes'),
        api.get<LigneLettrage[]>(`/comptes/${compteId}/lettrage`),
      ]);
      setComptes(tousComptes.filter((c) => c.typeCompte === 'DETAIL' && c.estActif));
      setCompte(tousComptes.find((c) => c.id === compteId) ?? null);
      setLignes(lignesLettrage);
      setErreur(null);
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible de charger le lettrage');
    }
  };

  useEffect(() => {
    charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compteId]);

  const basculerSelection = (id: string) => {
    setSelection((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  };

  const lignesSelectionnees = (lignes ?? []).filter((l) => selection.has(l.id));
  const soldeSelection = lignesSelectionnees.reduce((s, l) => s + l.debit - l.credit, 0);
  const selectionValide = lignesSelectionnees.length >= 2 && Math.abs(soldeSelection) < 0.005;

  const lettrerSelection = async () => {
    if (!compteId || !selectionValide) return;
    setEnvoi(true);
    setErreur(null);
    setInfo(null);
    try {
      const resultat = await api.post<{ lettre: string; nombreLignes: number }>(`/comptes/${compteId}/lettrage`, {
        ligneIds: [...selection],
      });
      setInfo(`${resultat.nombreLignes} lignes lettrées (${resultat.lettre}).`);
      setSelection(new Set());
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible de lettrer cette sélection');
    } finally {
      setEnvoi(false);
    }
  };

  const delettrer = async (lettre: string) => {
    if (!compteId) return;
    setErreur(null);
    setInfo(null);
    try {
      await api.delete(`/comptes/${compteId}/lettrage/${lettre}`);
      setInfo(`Lettre ${lettre} annulée.`);
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible de délettrer');
    }
  };

  const lancerLettrageAuto = async () => {
    if (!compteId) return;
    setEnvoi(true);
    setErreur(null);
    setInfo(null);
    try {
      const resultat = await api.post<{ groupes: number; lettres: string[] }>(`/comptes/${compteId}/lettrage/auto`, {});
      setInfo(
        resultat.groupes > 0
          ? `${resultat.groupes} groupe(s) lettré(s) automatiquement (${resultat.lettres.join(', ')}).`
          : 'Aucun rapprochement (1-pour-1 ou N-pour-1) trouvé pour le lettrage automatique.',
      );
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Échec du lettrage automatique');
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div className="p-2.5">
      <div className="flex items-end justify-between max-w-[960px] mb-2.5 gap-3 flex-wrap">
        <div>
          <div className="text-[10.5px] font-mono text-text-dim">TRAITEMENT</div>
          <h1 className="text-[15px] font-bold">
            Interrogation et lettrage{compte && <> · <span className="font-mono">{compte.numero}</span> {compte.intitule}</>}
          </h1>
        </div>
        <div className="flex items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-text-dim">COMPTE À CONSULTER</span>
            <select
              value={compteId ?? ''}
              onChange={(e) => e.target.value && navigate(`/comptes/${e.target.value}/lettrage`)}
              className="border border-border-dark bg-surface px-2 py-1 text-[11.5px] font-mono min-w-[280px]"
            >
              {comptes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.numero} · {c.intitule}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={lancerLettrageAuto}
            disabled={envoi}
            title="Rapprochements 1-pour-1 et N-pour-1 automatiques sur ce compte"
            className="border border-border-dark bg-chrome hover:bg-chrome-alt px-3 py-1 text-[11.5px] disabled:opacity-50"
          >
            Lettrage automatique
          </button>
        </div>
      </div>

      {erreur && <div className="text-[12px] text-danger bg-danger-soft border border-danger/30 px-3 py-2 mb-3 max-w-[720px]">{erreur}</div>}
      {info && <div className="text-[12px] text-positive bg-positive-soft border border-positive/30 px-3 py-2 mb-3 max-w-[720px]">{info}</div>}

      {!lignes && <div className="text-[12px] text-text-dim">Chargement…</div>}

      {lignes && (
        <div className="border border-border bg-surface shadow-posee max-w-[960px]">
          <div className="grid grid-cols-[26px_70px_46px_1.4fr_100px_100px_104px_60px] gap-2.5 px-3.5 py-1.5 bg-surface-alt border-b border-border-dark text-[10px] font-bold text-text-dim">
            <span />
            <span>DATE</span>
            <span>JRN</span>
            <span>LIBELLÉ ÉCRITURE</span>
            <span className="text-right">DÉBIT</span>
            <span className="text-right">CRÉDIT</span>
            <span className="text-right">SOLDE PROGRESSIF</span>
            <span>LETTRE</span>
          </div>
          {(() => {
            let cumul = 0;
            return lignes.map((l) => {
              cumul += l.debit - l.credit;
              const soldeProgressif = Math.round(cumul * 100) / 100;
              return (
            <div
              key={l.id}
              className={`grid grid-cols-[26px_70px_46px_1.4fr_100px_100px_104px_60px] gap-2.5 px-3.5 py-[4px] items-center border-b border-border/50 last:border-b-0 text-[11.5px] ${
                selection.has(l.id) ? 'bg-sel-soft' : l.lettre ? 'opacity-60' : ''
              }`}
            >
              <input
                type="checkbox"
                disabled={!!l.lettre}
                checked={selection.has(l.id)}
                onChange={() => basculerSelection(l.id)}
              />
              <span className="font-mono text-[10.5px] text-text-dim">{new Date(l.date).toLocaleDateString('fr-FR')}</span>
              <span className="font-mono text-text-dim">{l.journalCode}</span>
              <span className="truncate">{l.libelle}</span>
              <span className="font-mono text-right">{l.debit ? l.debit.toLocaleString('fr-FR') : ''}</span>
              <span className="font-mono text-right">{l.credit ? l.credit.toLocaleString('fr-FR') : ''}</span>
              <span className="font-mono text-right font-semibold">{soldeProgressif.toLocaleString('fr-FR')}</span>
              <span>
                {l.lettre && (
                  <button
                    onClick={() => delettrer(l.lettre!)}
                    title={`Délettrer ${l.lettre}`}
                    className="font-mono text-[10.5px] font-bold text-sel hover:underline"
                  >
                    {l.lettre}
                  </button>
                )}
              </span>
            </div>
              );
            });
          })()}
          {lignes.length === 0 && (
            <div className="p-3 text-[12px] text-text-dim">Aucun mouvement sur ce compte.</div>
          )}
          {lignes.length > 0 && (
            <div className="grid grid-cols-[26px_70px_46px_1.4fr_100px_100px_104px_60px] gap-2.5 px-3.5 py-1.5 bg-surface-alt border-t border-border-dark text-[11.5px] font-bold">
              <span className="col-span-3" />
              <span className="text-right text-[10px] text-text-dim self-center">TOTAL MOUVEMENTS · SOLDE</span>
              <span className="font-mono text-right">{lignes.reduce((t, l) => t + l.debit, 0).toLocaleString('fr-FR')}</span>
              <span className="font-mono text-right">{lignes.reduce((t, l) => t + l.credit, 0).toLocaleString('fr-FR')}</span>
              <span className="font-mono text-right">{lignes.reduce((t, l) => t + l.debit - l.credit, 0).toLocaleString('fr-FR')}</span>
              <span />
            </div>
          )}
        </div>
      )}

      {lignes && lignes.length > 0 && (
        <div className="mt-3 flex items-center gap-4 max-w-[900px]">
          <span className="text-[11.5px] text-text-dim">
            {lignesSelectionnees.length} ligne(s) sélectionnée(s) · solde{' '}
            <span className={Math.abs(soldeSelection) < 0.005 ? 'text-positive font-semibold' : 'text-danger font-semibold'}>
              {soldeSelection.toLocaleString('fr-FR')}
            </span>
          </span>
          <button
            onClick={lettrerSelection}
            disabled={!selectionValide || envoi}
            className="bg-sel text-white text-[12px] font-semibold px-3 py-1.5 disabled:opacity-40"
          >
            {envoi ? 'Lettrage…' : 'Lettrer la sélection'}
          </button>
        </div>
      )}
    </div>
  );
}
