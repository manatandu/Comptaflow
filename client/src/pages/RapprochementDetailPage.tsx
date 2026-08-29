import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import type { DetailRapprochement } from '../lib/types';

/**
 * Pointage écriture par écriture d'un rapprochement bancaire (§3.4) : chaque
 * ligne se pointe/dépointe individuellement d'un clic (comme sur un relevé
 * papier qu'on coche ligne à ligne), pas par sélection groupée — l'écart
 * (solde pointé - solde du relevé) se recalcule à chaque pointage. Clôture
 * bloquée tant que l'écart n'est pas nul.
 */
export function RapprochementDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<DetailRapprochement | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const charger = async () => {
    if (!id) return;
    try {
      setDetail(await api.get<DetailRapprochement>(`/rapprochements/${id}`));
      setErreur(null);
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible de charger ce rapprochement');
    }
  };

  useEffect(() => {
    charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const enCours = detail?.rapprochement.statut === 'EN_COURS';

  const basculerPointage = async (ligneId: string, pointee: boolean) => {
    if (!id || !enCours) return;
    setErreur(null);
    setInfo(null);
    try {
      await api.post(`/rapprochements/${id}/${pointee ? 'depointer' : 'pointer'}`, { ligneIds: [ligneId] });
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible de modifier le pointage de cette ligne');
    }
  };

  const cloturer = async () => {
    if (!id) return;
    setEnvoi(true);
    setErreur(null);
    setInfo(null);
    try {
      await api.post(`/rapprochements/${id}/cloturer`, {});
      setInfo('Rapprochement clôturé.');
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible de clôturer ce rapprochement');
    } finally {
      setEnvoi(false);
    }
  };

  const annuler = async () => {
    if (!id) return;
    setEnvoi(true);
    setErreur(null);
    try {
      await api.delete(`/rapprochements/${id}`);
      navigate('/rapprochement');
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible d\'annuler ce rapprochement');
      setEnvoi(false);
    }
  };

  return (
    <div className="p-2.5">
      <div className="text-[10.5px] font-mono text-text-dim mb-1">
        <button onClick={() => navigate('/rapprochement')} className="hover:underline">
          Rapprochement bancaire
        </button>{' '}
        / Pointage
      </div>

      {!detail && !erreur && <div className="text-[12px] text-text-dim">Chargement…</div>}
      {erreur && <div className="text-[12px] text-danger bg-danger-soft border border-danger/30 px-3 py-2 mb-3 max-w-[900px]">{erreur}</div>}

      {detail && (
        <>
          <h1 className="text-[15px] font-bold mb-1">
            {detail.rapprochement.compte ? `${detail.rapprochement.compte.numero} — ${detail.rapprochement.compte.intitule}` : 'Rapprochement'}
          </h1>
          <div className="text-[11.5px] text-text-dim mb-3">
            Relevé du {new Date(detail.rapprochement.dateReleve).toLocaleDateString('fr-FR')} — solde{' '}
            <span className="font-mono font-semibold">{detail.rapprochement.soldeReleve.toLocaleString('fr-FR')}</span>{' '}
            {detail.rapprochement.statut === 'CLOTURE' && <span className="font-mono font-bold text-text-dim">(CLÔTURÉ)</span>}
          </div>

          {info && <div className="text-[12px] text-positive bg-positive-soft border border-positive/30 px-3 py-2 mb-3 max-w-[900px]">{info}</div>}

          <div className="flex items-center gap-5 mb-3 max-w-[900px] bg-surface border border-border px-4 py-2.5">
            <div>
              <div className="text-[10px] text-text-dim font-semibold">SOLDE DE DÉPART</div>
              <div className="font-mono text-[13px]">{detail.soldeDepart.toLocaleString('fr-FR')}</div>
            </div>
            <div>
              <div className="text-[10px] text-text-dim font-semibold">SOLDE POINTÉ</div>
              <div className="font-mono text-[13px]">{detail.soldePointe.toLocaleString('fr-FR')}</div>
            </div>
            <div>
              <div className="text-[10px] text-text-dim font-semibold">SOLDE DU RELEVÉ</div>
              <div className="font-mono text-[13px]">{detail.rapprochement.soldeReleve.toLocaleString('fr-FR')}</div>
            </div>
            <div>
              <div className="text-[10px] text-text-dim font-semibold">ÉCART</div>
              <div className={`font-mono text-[13px] font-bold ${detail.equilibre ? 'text-positive' : 'text-danger'}`}>
                {detail.ecart.toLocaleString('fr-FR')}
              </div>
            </div>
          </div>

          <div className="border border-border max-w-[900px]">
            <div className="grid grid-cols-[26px_70px_46px_1.4fr_100px_100px] gap-2.5 px-3.5 py-1.5 bg-chrome border-b border-border text-[10px] font-bold text-text-dim">
              <span />
              <span>DATE</span>
              <span>JRN</span>
              <span>LIBELLÉ</span>
              <span className="text-right">DÉBIT</span>
              <span className="text-right">CRÉDIT</span>
            </div>
            {detail.lignes.map((l, i) => (
              <div
                key={l.id}
                className={`grid grid-cols-[26px_70px_46px_1.4fr_100px_100px] gap-2.5 px-3.5 py-1.5 items-center border-b border-border last:border-b-0 text-[11.5px] ${
                  l.pointee ? 'bg-positive-soft' : i % 2 === 0 ? 'bg-surface' : 'bg-surface-alt'
                }`}
              >
                <input
                  type="checkbox"
                  disabled={!enCours}
                  checked={l.pointee}
                  onChange={() => basculerPointage(l.id, l.pointee)}
                />
                <span className="font-mono text-[10.5px] text-text-dim">{new Date(l.date).toLocaleDateString('fr-FR')}</span>
                <span className="font-mono text-text-dim">{l.journalCode}</span>
                <span className="truncate">{l.libelle}</span>
                <span className="font-mono text-right">{l.debit ? l.debit.toLocaleString('fr-FR') : ''}</span>
                <span className="font-mono text-right">{l.credit ? l.credit.toLocaleString('fr-FR') : ''}</span>
              </div>
            ))}
            {detail.lignes.length === 0 && (
              <div className="p-3 text-[12px] text-text-dim">Aucun mouvement pointable sur ce compte.</div>
            )}
          </div>

          {enCours && (
            <div className="mt-3 flex items-center gap-2 max-w-[900px]">
              <button
                onClick={cloturer}
                disabled={!detail.equilibre || envoi}
                title={detail.equilibre ? undefined : "L'écart doit être nul pour clôturer"}
                className="bg-sel text-white text-[12.5px] font-semibold px-4 py-1.5 disabled:opacity-40"
              >
                {envoi ? '…' : 'Clôturer le rapprochement'}
              </button>
              <button onClick={annuler} disabled={envoi} className="text-[12.5px] font-semibold text-danger px-4 py-1.5 disabled:opacity-40">
                Annuler ce rapprochement
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
