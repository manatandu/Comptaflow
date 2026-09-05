import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { EnteteImpression } from '../components/chrome/EnteteImpression';
import type { CampagneInventaire, Exercice } from '../lib/types';

/**
 * INVENTAIRE PHYSIQUE · les six étapes du CPCC, dans l'ordre où elles se font.
 *
 * L'AUDCIF art. 42 impose « le RECENSEMENT et l'ÉVALUATION » des biens,
 * créances et dettes à la clôture de chaque exercice, et l'art. 3 du SYCEBNL
 * ne l'écarte pas · l'écran est donc servi aux deux référentiels. Seul le
 * texte de la sanction change, et c'est le serveur qui le résout.
 *
 * L'ÉCRAN SUIT LE STATUT DE LA CAMPAGNE, il ne propose jamais l'étape
 * suivante avant que la précédente ne soit faite. C'est la seule protection
 * qui vaille contre l'erreur de méthode la plus coûteuse : rapprocher avant
 * d'avoir tout valorisé, ou arbitrer un écart dont le solde a bougé depuis.
 */

const LIBELLE_STATUT: Record<string, string> = {
  PREPARATION: 'Préparation',
  RECENSEMENT: 'Recensement',
  ARBITRAGE: 'Arbitrage des écarts',
  CLOTUREE: 'Close',
};

const COULEUR_STATUT: Record<string, string> = {
  PREPARATION: 'bg-chrome text-text-dim',
  RECENSEMENT: 'bg-sel-soft text-sel',
  ARBITRAGE: 'bg-warning-soft text-warning',
  CLOTUREE: 'bg-positive-soft text-positive',
};

const LIBELLE_DECISION: Record<string, string> = {
  A_REDRESSER: 'À redresser',
  EXPLIQUE: 'Expliqué, non redressé',
  EXCEDENT_NON_COMPTABILISE: 'Excédent laissé au bilan',
  RENVOYE_COMMISSION_PRINCIPALE: 'Renvoyé à la commission principale',
};

const montant = (v: unknown) => Number(v ?? 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 });
const jour = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString('fr-FR') : '·');

export function InventairePage() {
  const [campagnes, setCampagnes] = useState<CampagneInventaire[] | null>(null);
  const [exercices, setExercices] = useState<Exercice[]>([]);
  const [selectionId, setSelectionId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CampagneInventaire | null>(null);
  const [creation, setCreation] = useState(false);
  const [libelle, setLibelle] = useState('');
  const [dateInventaire, setDateInventaire] = useState('');
  const [exerciceId, setExerciceId] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = () => {
    api.get<CampagneInventaire[]>('/inventaire').then(setCampagnes, (e: Error) => setErreur(e.message));
  };

  useEffect(() => {
    charger();
    api.get<Exercice[]>('/exercices').then(setExercices, () => undefined);
  }, []);

  useEffect(() => {
    if (!selectionId) {
      setDetail(null);
      return;
    }
    api.get<CampagneInventaire>(`/inventaire/${selectionId}`).then(setDetail, (e: Error) => setErreur(e.message));
  }, [selectionId]);

  const rafraichir = () => {
    charger();
    if (selectionId) api.get<CampagneInventaire>(`/inventaire/${selectionId}`).then(setDetail, () => undefined);
  };

  const agir = async (action: () => Promise<unknown>) => {
    setErreur(null);
    try {
      await action();
      rafraichir();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Opération impossible');
    }
  };

  const creer = () =>
    agir(async () => {
      await api.post('/inventaire', { exerciceId, dateInventaire, libelle: libelle.trim() });
      setCreation(false);
      setLibelle('');
      setDateInventaire('');
    });

  const ecarts = detail?.ecarts ?? [];
  const manquants = ecarts.filter((e) => Number(e.ecart) < 0);
  const excedents = ecarts.filter((e) => Number(e.ecart) > 0);
  const sansDecision = ecarts.filter((e) => !e.decision);
  const nonValorisees = (detail?.fiches ?? []).filter((f) => f.valeurInventaire === null);

  return (
    <div className="p-2">
      <EnteteImpression titre="Inventaire physique" />
      <div className="ecran-seul mb-1.5 max-w-[1240px]">
        <div className="text-[10px] font-mono text-text-dim leading-none">INVENTAIRE EXTRA-COMPTABLE</div>
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-[12px] font-bold leading-tight">Inventaire physique</h1>
          <button
            type="button"
            onClick={() => setCreation(true)}
            className="bg-sel text-white rounded-[6px] px-3 py-[3px] text-[10.5px] font-semibold hover:opacity-90"
          >
            Nouvelle campagne
          </button>
        </div>
        <div className="text-[10px] text-text-dim mt-0.5">
          « À la clôture de chaque exercice, l’entité doit procéder au recensement et à l’évaluation de ses biens,
          créances et dettes à leur valeur effective du moment » · AUDCIF art. 42.
        </div>
      </div>

      {erreur && (
        <div className="border border-danger/30 bg-danger-soft px-3.5 py-2 mb-2.5 text-[10.5px] max-w-[1240px]">
          {erreur}
        </div>
      )}

      {creation && (
        <div className="border border-border bg-surface px-3.5 py-2.5 mb-2.5 max-w-[1240px]">
          <div className="text-[10.5px] font-semibold mb-1.5">Ouvrir une campagne</div>
          <div className="flex flex-wrap gap-2 items-end">
            <label className="text-[10px] text-text-dim">
              Exercice
              <select
                value={exerciceId}
                onChange={(e) => setExerciceId(e.target.value)}
                className="block border border-border bg-surface px-2 py-[3px] text-[10.5px] min-w-[180px]"
              >
                <option value="">Choisir…</option>
                {exercices.map((x) => (
                  <option key={x.id} value={x.id}>
                    {jour(x.dateDebut)} au {jour(x.dateFin)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[10px] text-text-dim">
              Date d’inventaire
              <input
                type="date"
                value={dateInventaire}
                onChange={(e) => setDateInventaire(e.target.value)}
                className="block border border-border bg-surface px-2 py-[3px] text-[10.5px]"
              />
            </label>
            <label className="text-[10px] text-text-dim flex-1 min-w-[220px]">
              Libellé
              <input
                value={libelle}
                onChange={(e) => setLibelle(e.target.value)}
                placeholder="Inventaire de clôture 2026"
                className="block w-full border border-border bg-surface px-2 py-[3px] text-[10.5px]"
              />
            </label>
            <button
              type="button"
              onClick={creer}
              disabled={!exerciceId || !dateInventaire || !libelle.trim()}
              className="bg-sel text-white rounded-[6px] px-3 py-[3px] text-[10.5px] font-semibold disabled:opacity-40"
            >
              Ouvrir
            </button>
            <button
              type="button"
              onClick={() => setCreation(false)}
              className="border border-border rounded-[6px] px-3 py-[3px] text-[10.5px]"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-2.5 max-w-[1400px] items-start">
        {/* --- Campagnes -------------------------------------------------- */}
        <div className="border border-border bg-surface min-w-[260px] max-w-[300px]">
          <div className="px-2.5 py-1.5 border-b border-border text-[10px] font-mono text-text-dim">CAMPAGNES</div>
          {campagnes?.length === 0 && (
            <div className="px-2.5 py-3 text-[10.5px] text-text-dim">
              Aucune campagne. L’inventaire n’est pas une option : son absence expose les dirigeants à une sanction
              pénale.
            </div>
          )}
          {campagnes?.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelectionId(c.id)}
              className={`block w-full text-left px-2.5 py-1.5 border-b border-border/60 ${
                c.id === selectionId ? 'bg-sel-soft' : 'hover:bg-chrome'
              }`}
            >
              <div className="text-[10.5px] font-semibold leading-tight">{c.libelle}</div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`text-[9px] px-1.5 py-[1px] rounded ${COULEUR_STATUT[c.statut]}`}>
                  {LIBELLE_STATUT[c.statut]}
                </span>
                <span className="text-[9.5px] text-text-dim">{jour(c.dateInventaire)}</span>
              </div>
            </button>
          ))}
        </div>

        {/* --- Détail ------------------------------------------------------ */}
        <div className="flex-1 min-w-0">
          {!detail && (
            <div className="border border-border bg-surface px-3.5 py-3 text-[10.5px] text-text-dim">
              Choisir une campagne pour en voir les fiches et les écarts.
            </div>
          )}

          {detail && (
            <>
              <div className="border border-border bg-surface px-3.5 py-2 mb-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="text-[11px] font-bold">{detail.libelle}</div>
                    <div className="text-[10px] text-text-dim">
                      Comptage au {jour(detail.dateInventaire)} ·{' '}
                      {detail.procesVerbalEtabliLe
                        ? `PV établi le ${jour(detail.procesVerbalEtabliLe)}`
                        : 'PV non établi'}
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    {(detail.statut === 'PREPARATION' || detail.statut === 'RECENSEMENT') && (
                      <>
                        <button
                          type="button"
                          onClick={() => agir(() => api.post(`/inventaire/${detail.id}/fiches/immobilisations`, {}))}
                          className="border border-border rounded-[6px] px-2.5 py-[3px] text-[10.5px]"
                        >
                          Fiches du parc immobilisé
                        </button>
                        <button
                          type="button"
                          onClick={() => agir(() => api.post(`/inventaire/${detail.id}/rapprocher`, {}))}
                          className="bg-sel text-white rounded-[6px] px-2.5 py-[3px] text-[10.5px] font-semibold"
                        >
                          Rapprocher de la balance
                        </button>
                      </>
                    )}
                    {detail.statut === 'ARBITRAGE' && (
                      <button
                        type="button"
                        onClick={() => agir(() => api.post(`/inventaire/${detail.id}/clore`, {}))}
                        className="bg-sel text-white rounded-[6px] px-2.5 py-[3px] text-[10.5px] font-semibold"
                      >
                        Clore la campagne
                      </button>
                    )}
                    {detail.statut !== 'CLOTUREE' && !detail.procesVerbalEtabliLe && (
                      <button
                        type="button"
                        onClick={() => agir(() => api.post(`/inventaire/${detail.id}/proces-verbal`, {}))}
                        className="border border-border rounded-[6px] px-2.5 py-[3px] text-[10.5px]"
                      >
                        Établir le PV
                      </button>
                    )}
                  </div>
                </div>
                {detail.sanction && (
                  <div className="text-[9.5px] text-text-dim mt-1 border-t border-border/60 pt-1">
                    Défaut d’inventaire · {detail.sanction.texte}, {detail.sanction.article}
                  </div>
                )}
              </div>

              {nonValorisees.length > 0 && detail.statut !== 'CLOTUREE' && detail.statut !== 'ARBITRAGE' && (
                <div className="border border-warning/30 bg-warning-soft px-3.5 py-2 mb-2 text-[10.5px]">
                  {nonValorisees.length} fiche{nonValorisees.length > 1 ? 's' : ''} sans valeur d’inventaire. Le
                  rapprochement les refuse : comptées pour zéro, elles produiraient un manquant que personne n’a
                  constaté, et le manquant est à la charge de l’entité.
                </div>
              )}

              {/* --- Écarts ------------------------------------------------ */}
              {ecarts.length > 0 && (
                <div className="border border-border bg-surface mb-2">
                  <div className="px-2.5 py-1.5 border-b border-border flex items-center justify-between">
                    <span className="text-[10px] font-mono text-text-dim">ÉCARTS · PAR COMPTE</span>
                    <span className="text-[9.5px] text-text-dim">
                      {manquants.length} manquant{manquants.length > 1 ? 's' : ''} · {excedents.length} excédent
                      {excedents.length > 1 ? 's' : ''} · {sansDecision.length} sans décision
                    </span>
                  </div>
                  <table className="w-full text-[10.5px]">
                    <thead>
                      <tr className="text-text-dim border-b border-border/60">
                        <th className="text-left px-2.5 py-1 font-normal">Compte</th>
                        <th className="text-right px-2.5 py-1 font-normal">Inventaire</th>
                        <th className="text-right px-2.5 py-1 font-normal">Comptabilité</th>
                        <th className="text-right px-2.5 py-1 font-normal">Écart</th>
                        <th className="text-left px-2.5 py-1 font-normal">Décision</th>
                        <th className="text-left px-2.5 py-1 font-normal">Responsable</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ecarts.map((e) => {
                        const v = Number(e.ecart);
                        return (
                          <tr key={e.id} className="border-b border-border/40">
                            <td className="px-2.5 py-1">
                              <span className="font-mono">{e.compte.numero}</span>{' '}
                              <span className="text-text-dim">{e.compte.intitule}</span>
                              {e.nombreFiches > 1 && (
                                <span className="text-[9px] text-text-dim"> · {e.nombreFiches} fiches</span>
                              )}
                            </td>
                            <td className="px-2.5 py-1 text-right tabular-nums">{montant(e.valeurInventaire)}</td>
                            <td className="px-2.5 py-1 text-right tabular-nums">{montant(e.soldeComptable)}</td>
                            <td
                              className={`px-2.5 py-1 text-right tabular-nums font-semibold ${
                                v < 0 ? 'text-danger' : v > 0 ? 'text-warning' : 'text-text-dim'
                              }`}
                            >
                              {montant(e.ecart)}
                            </td>
                            <td className="px-2.5 py-1">
                              {e.decision ? (
                                LIBELLE_DECISION[e.decision]
                              ) : (
                                <span className="text-text-dim">à trancher</span>
                              )}
                            </td>
                            <td className="px-2.5 py-1 text-text-dim">{e.responsable ?? '·'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {excedents.length > 0 && (
                    <div className="px-2.5 py-1.5 border-t border-border text-[9.5px] text-text-dim">
                      Un excédent ne se comptabilise pas : « si la valeur d’inventaire est supérieure à la valeur
                      d’entrée, cette dernière est maintenue dans les comptes, sauf cas expressément prévus par la
                      législation » · AUDCIF art. 43. Il se documente et se porte au résumé de l’opération
                      d’inventaire.
                    </div>
                  )}
                </div>
              )}

              {/* --- Fiches ------------------------------------------------ */}
              <div className="border border-border bg-surface">
                <div className="px-2.5 py-1.5 border-b border-border text-[10px] font-mono text-text-dim">
                  FICHES DE COMPTAGE · {detail.fiches?.length ?? 0}
                </div>
                {(detail.fiches?.length ?? 0) === 0 && (
                  <div className="px-2.5 py-3 text-[10.5px] text-text-dim">
                    Aucune fiche. Le parc immobilisé est déjà tenu par le logiciel : ses fiches s’engendrent d’un
                    clic, les stocks et les caisses se saisissent à la main.
                  </div>
                )}
                {(detail.fiches?.length ?? 0) > 0 && (
                  <table className="w-full text-[10.5px]">
                    <thead>
                      <tr className="text-text-dim border-b border-border/60">
                        <th className="text-left px-2.5 py-1 font-normal">Désignation</th>
                        <th className="text-left px-2.5 py-1 font-normal">Compte</th>
                        <th className="text-right px-2.5 py-1 font-normal">Quantité</th>
                        <th className="text-right px-2.5 py-1 font-normal">Valeur d’inventaire</th>
                        <th className="text-left px-2.5 py-1 font-normal">Pièce</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.fiches?.map((f) => (
                        <tr key={f.id} className="border-b border-border/40">
                          <td className="px-2.5 py-1">{f.designation}</td>
                          <td className="px-2.5 py-1 font-mono text-text-dim">{f.compte.numero}</td>
                          <td className="px-2.5 py-1 text-right tabular-nums">
                            {f.quantiteComptee === null ? (
                              <span className="text-text-dim">non compté</span>
                            ) : (
                              Number(f.quantiteComptee).toLocaleString('fr-FR')
                            )}
                          </td>
                          <td className="px-2.5 py-1 text-right tabular-nums">
                            {f.valeurInventaire === null ? (
                              <span className="text-warning">non valorisée</span>
                            ) : (
                              montant(f.valeurInventaire)
                            )}
                          </td>
                          <td className="px-2.5 py-1 text-text-dim">{f.referencePiece ?? '·'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
