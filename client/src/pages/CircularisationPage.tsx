import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { EnteteImpression } from '../components/chrome/EnteteImpression';
import type { CampagneCircularisation, EchantillonCircularisation, Exercice } from '../lib/types';

/**
 * CIRCULARISATION · l'inventaire DOCUMENTAIRE du CPCC.
 *
 * L'écran met en avant les deux chiffres que le CPCC réclame et que personne
 * ne calcule à la main : le TAUX DE RÉPONSE, qui compte les lettres, et le
 * TAUX DE COUVERTURE, qui pèse les montants. Vingt réponses sur cent lettres
 * peuvent couvrir 80 % du solde ou 4 % · c'est le second qui dit si la
 * procédure a établi quelque chose.
 *
 * Et il montre en rouge la seule chose qui rend une campagne sans valeur : une
 * non-réponse sans procédure alternative. ISA 505 § 12 · « in the case of each
 * non-response, the auditor shall perform alternative audit procedures ».
 */

const LIBELLE_CYCLE: Record<string, string> = {
  BANQUES: 'Banques',
  FOURNISSEURS: 'Fournisseurs',
  CLIENTS_ADHERENTS: 'Clients et adhérents',
  AUTRES_TIERS: 'Autres tiers',
  AUTRES: 'Autres',
};

const LIBELLE_STATUT_DEMANDE: Record<string, string> = {
  A_ENVOYER: 'À envoyer',
  ENVOYEE: 'Envoyée',
  RELANCEE: 'Relancée',
  REPONSE_RECUE: 'Réponse reçue',
  SANS_REPONSE: 'Sans réponse',
  NON_DISTRIBUEE: 'Non distribuée',
};

const LIBELLE_NATURE: Record<string, string> = {
  DELAI: 'Délai',
  MESURE: 'Mesure',
  ERREUR_MATERIELLE: 'Erreur matérielle',
  ANOMALIE_POTENTIELLE: 'Anomalie potentielle',
};

const montant = (v: unknown) => Number(v ?? 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 });
const jour = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString('fr-FR') : '·');

export function CircularisationPage() {
  const [campagnes, setCampagnes] = useState<CampagneCircularisation[] | null>(null);
  const [exercices, setExercices] = useState<Exercice[]>([]);
  const [selectionId, setSelectionId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CampagneCircularisation | null>(null);
  const [echantillon, setEchantillon] = useState<EchantillonCircularisation | null>(null);
  const [creation, setCreation] = useState(false);
  const [libelle, setLibelle] = useState('');
  const [dateArrete, setDateArrete] = useState('');
  const [exerciceId, setExerciceId] = useState('');
  const [cycle, setCycle] = useState('FOURNISSEURS');
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = () =>
    api.get<CampagneCircularisation[]>('/circularisation').then(setCampagnes, (e: Error) => setErreur(e.message));

  useEffect(() => {
    charger();
    api.get<Exercice[]>('/exercices').then(setExercices, () => undefined);
  }, []);

  useEffect(() => {
    if (!selectionId) {
      setDetail(null);
      setEchantillon(null);
      return;
    }
    api.get<CampagneCircularisation>(`/circularisation/${selectionId}`).then(setDetail, (e: Error) => setErreur(e.message));
    api
      .get<EchantillonCircularisation>(`/circularisation/${selectionId}/echantillon`)
      .then(setEchantillon, () => setEchantillon(null));
  }, [selectionId]);

  const rafraichir = () => {
    charger();
    if (selectionId) {
      api.get<CampagneCircularisation>(`/circularisation/${selectionId}`).then(setDetail, () => undefined);
      api.get<EchantillonCircularisation>(`/circularisation/${selectionId}/echantillon`).then(setEchantillon, () => undefined);
    }
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
      await api.post('/circularisation', { exerciceId, libelle: libelle.trim(), dateArrete, cycle });
      setCreation(false);
      setLibelle('');
      setDateArrete('');
    });

  const s = detail?.synthese;

  return (
    <div className="p-2">
      <EnteteImpression titre="Circularisation" />
      <div className="ecran-seul mb-1.5 max-w-[1240px]">
        <div className="text-[10px] font-mono text-text-dim leading-none">INVENTAIRE DOCUMENTAIRE</div>
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-[12px] font-bold leading-tight">Circularisation</h1>
          <button
            type="button"
            onClick={() => setCreation(true)}
            className="bg-sel text-white rounded-[6px] px-3 py-[3px] text-[10.5px] font-semibold hover:opacity-90"
          >
            Nouvelle campagne
          </button>
        </div>
        <div className="text-[10px] text-text-dim mt-0.5">
          Confirmation de soldes auprès des tiers · méthode de l’ISA 505. Le logiciel n’envoie aucune lettre : la norme
          veut la réponse revenue directement au demandeur, ce qu’un envoi depuis la boîte du dossier ne garantit pas.
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
              Cycle
              <select
                value={cycle}
                onChange={(e) => setCycle(e.target.value)}
                className="block border border-border bg-surface px-2 py-[3px] text-[10.5px]"
              >
                {Object.entries(LIBELLE_CYCLE).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[10px] text-text-dim">
              Date d’arrêté
              <input
                type="date"
                value={dateArrete}
                onChange={(e) => setDateArrete(e.target.value)}
                className="block border border-border bg-surface px-2 py-[3px] text-[10.5px]"
              />
            </label>
            <label className="text-[10px] text-text-dim flex-1 min-w-[200px]">
              Libellé
              <input
                value={libelle}
                onChange={(e) => setLibelle(e.target.value)}
                placeholder="Fournisseurs au 31/12/2026"
                className="block w-full border border-border bg-surface px-2 py-[3px] text-[10.5px]"
              />
            </label>
            <button
              type="button"
              onClick={creer}
              disabled={!exerciceId || !dateArrete || !libelle.trim()}
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
          <div className="text-[9.5px] text-text-dim mt-1.5">
            La forme NÉGATIVE (le tiers ne répond que s’il est en désaccord) n’est pas proposée ici : l’ISA 505 § 15 la
            réserve à quatre conditions cumulatives, à déclarer une à une. Elle est moins probante que la positive.
          </div>
        </div>
      )}

      <div className="flex gap-2.5 max-w-[1400px] items-start">
        <div className="border border-border bg-surface min-w-[240px] max-w-[280px]">
          <div className="px-2.5 py-1.5 border-b border-border text-[10px] font-mono text-text-dim">CAMPAGNES</div>
          {campagnes?.length === 0 && (
            <div className="px-2.5 py-3 text-[10.5px] text-text-dim">
              Aucune campagne. Le CPCC ouvre chaque cycle de l’inventaire documentaire par la même question : a-t-on
              circularisé ?
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
              <div className="text-[9.5px] text-text-dim mt-0.5">
                {LIBELLE_CYCLE[c.cycle]} · {jour(c.dateArrete)}
              </div>
            </button>
          ))}
        </div>

        <div className="flex-1 min-w-0">
          {!detail && (
            <div className="border border-border bg-surface px-3.5 py-3 text-[10.5px] text-text-dim">
              Choisir une campagne pour en voir l’échantillon et les réponses.
            </div>
          )}

          {detail && (
            <>
              <div className="border border-border bg-surface px-3.5 py-2 mb-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="text-[11px] font-bold">{detail.libelle}</div>
                    <div className="text-[10px] text-text-dim">
                      {LIBELLE_CYCLE[detail.cycle]} au {jour(detail.dateArrete)} ·{' '}
                      {detail.forme === 'NEGATIVE' ? 'demande négative' : 'demande positive'}
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    {detail.statut !== 'CLOTUREE' && (
                      <>
                        <button
                          type="button"
                          onClick={() => agir(() => api.post(`/circularisation/${detail.id}/envoyer`, {}))}
                          className="border border-border rounded-[6px] px-2.5 py-[3px] text-[10.5px]"
                        >
                          {detail.statut === 'PREPARATION' ? 'Marquer envoyées' : 'Relancer'}
                        </button>
                        <button
                          type="button"
                          onClick={() => agir(() => api.post(`/circularisation/${detail.id}/clore`, {}))}
                          className="bg-sel text-white rounded-[6px] px-2.5 py-[3px] text-[10.5px] font-semibold"
                        >
                          Clore
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {s && s.envoyees > 0 && (
                <div className="border border-border bg-surface px-3.5 py-2 mb-2">
                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-[10.5px]">
                    <span>
                      <span className="text-text-dim">Taux de réponse </span>
                      <span className="font-semibold tabular-nums">{s.tauxReponse} %</span>
                      <span className="text-text-dim">
                        {' '}
                        ({s.reponses}/{s.envoyees} lettres)
                      </span>
                    </span>
                    <span>
                      <span className="text-text-dim">Taux de couverture </span>
                      <span className="font-semibold tabular-nums">{s.tauxCouverture} %</span>
                      <span className="text-text-dim"> ({montant(s.soldeConfirme)} sur {montant(s.soldeEnvoye)})</span>
                    </span>
                    <span>
                      <span className="text-text-dim">Écarts </span>
                      <span className="font-semibold tabular-nums">{s.ecarts}</span>
                      {s.anomaliesPotentielles > 0 && (
                        <span className="text-danger"> dont {s.anomaliesPotentielles} anomalie(s) potentielle(s)</span>
                      )}
                    </span>
                    {s.reponsesIndirectes > 0 && (
                      <span className="text-warning">
                        {s.reponsesIndirectes} réponse(s) parvenue(s) par l’entité, fiabilité à corroborer
                      </span>
                    )}
                  </div>
                  <div className="text-[9.5px] text-text-dim mt-1 border-t border-border/60 pt-1">
                    Les deux taux ne disent pas la même chose : le premier compte les lettres, le second pèse les
                    montants. C’est le second qui dit si la procédure a établi quelque chose.
                  </div>
                </div>
              )}

              {s && s.nonReponsesSansProcedure > 0 && (
                <div className="border border-danger/30 bg-danger-soft px-3.5 py-2 mb-2 text-[10.5px]">
                  <span className="font-semibold">
                    {s.nonReponsesSansProcedure} non-réponse{s.nonReponsesSansProcedure > 1 ? 's' : ''} sans procédure
                    alternative.
                  </span>{' '}
                  Une non-réponse n’est pas une confirmation. ISA 505 § 12 : « in the case of each non-response, the
                  auditor shall perform alternative audit procedures ». Sans elles, le solde n’est pas établi et la
                  campagne ne se clôt pas.
                </div>
              )}

              <div className="border border-border bg-surface mb-2">
                <div className="px-2.5 py-1.5 border-b border-border text-[10px] font-mono text-text-dim">
                  DEMANDES · {detail.demandes?.length ?? 0}
                </div>
                {(detail.demandes?.length ?? 0) === 0 && (
                  <div className="px-2.5 py-3 text-[10.5px] text-text-dim">
                    Aucune demande. L’échantillon proposé ci-dessous classe les soldes du cycle, du plus gros au plus
                    petit · la sélection reste au cabinet, aucune norme n’en impose la méthode.
                  </div>
                )}
                {(detail.demandes?.length ?? 0) > 0 && (
                  <table className="w-full text-[10.5px]">
                    <thead>
                      <tr className="text-text-dim border-b border-border/60">
                        <th className="text-left px-2.5 py-1 font-normal">Destinataire</th>
                        <th className="text-left px-2.5 py-1 font-normal">Compte</th>
                        <th className="text-right px-2.5 py-1 font-normal">Solde envoyé</th>
                        <th className="text-right px-2.5 py-1 font-normal">Confirmé</th>
                        <th className="text-right px-2.5 py-1 font-normal">Écart</th>
                        <th className="text-left px-2.5 py-1 font-normal">État</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.demandes?.map((d) => {
                        const nonReponse = d.statut === 'SANS_REPONSE' || d.statut === 'NON_DISTRIBUEE';
                        return (
                          <tr key={d.id} className="border-b border-border/40">
                            <td className="px-2.5 py-1">
                              {d.destinataire}
                              {d.reponseIndirecte && (
                                <span className="text-[9px] text-warning"> · réponse indirecte</span>
                              )}
                            </td>
                            <td className="px-2.5 py-1 font-mono text-text-dim">{d.compte.numero}</td>
                            <td className="px-2.5 py-1 text-right tabular-nums">{montant(d.soldeAConfirmer)}</td>
                            <td className="px-2.5 py-1 text-right tabular-nums">
                              {d.soldeConfirme === null ? <span className="text-text-dim">·</span> : montant(d.soldeConfirme)}
                            </td>
                            <td className="px-2.5 py-1 text-right tabular-nums">
                              {d.ecart === null || Number(d.ecart) === 0 ? (
                                <span className="text-text-dim">·</span>
                              ) : (
                                <span
                                  className={
                                    d.natureEcart === 'ANOMALIE_POTENTIELLE' ? 'text-danger font-semibold' : 'text-warning'
                                  }
                                >
                                  {montant(d.ecart)}
                                  {d.natureEcart && (
                                    <span className="text-[9px] text-text-dim"> · {LIBELLE_NATURE[d.natureEcart]}</span>
                                  )}
                                </span>
                              )}
                            </td>
                            <td className="px-2.5 py-1">
                              {LIBELLE_STATUT_DEMANDE[d.statut]}
                              {nonReponse && !d.proceduresAlternatives && (
                                <span className="text-danger text-[9px]"> · sans procédure alternative</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {echantillon && echantillon.candidats.length > 0 && detail.statut !== 'CLOTUREE' && (
                <div className="border border-border bg-surface">
                  <div className="px-2.5 py-1.5 border-b border-border flex items-center justify-between">
                    <span className="text-[10px] font-mono text-text-dim">
                      ÉCHANTILLON PROPOSÉ · racines {echantillon.racines.join(', ')}
                    </span>
                    <span className="text-[9.5px] text-text-dim">
                      total du cycle {montant(echantillon.totalCycle)}
                    </span>
                  </div>
                  <table className="w-full text-[10.5px]">
                    <thead>
                      <tr className="text-text-dim border-b border-border/60">
                        <th className="text-left px-2.5 py-1 font-normal">Compte</th>
                        <th className="text-right px-2.5 py-1 font-normal">Solde</th>
                        <th className="text-right px-2.5 py-1 font-normal">Poids</th>
                        <th className="px-2.5 py-1" />
                      </tr>
                    </thead>
                    <tbody>
                      {echantillon.candidats.slice(0, 25).map((c) => (
                        <tr key={c.compteId} className="border-b border-border/40">
                          <td className="px-2.5 py-1">
                            <span className="font-mono">{c.numero}</span>{' '}
                            <span className="text-text-dim">{c.intitule}</span>
                          </td>
                          <td className="px-2.5 py-1 text-right tabular-nums">{montant(c.solde)}</td>
                          <td className="px-2.5 py-1 text-right tabular-nums text-text-dim">{c.poids} %</td>
                          <td className="px-2.5 py-1 text-right">
                            {c.dejaRetenu ? (
                              <span className="text-[9.5px] text-text-dim">retenu</span>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  agir(() =>
                                    api.post(`/circularisation/${detail.id}/demandes`, {
                                      compteId: c.compteId,
                                      destinataire: c.intitule,
                                    }),
                                  )
                                }
                                className="border border-border rounded-[5px] px-2 py-[1px] text-[9.5px]"
                              >
                                Retenir
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {echantillon.candidats.length > 25 && (
                    <div className="px-2.5 py-1 border-t border-border text-[9.5px] text-text-dim">
                      {echantillon.candidats.length - 25} compte(s) de plus, au-delà des vingt-cinq premiers soldes.
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
