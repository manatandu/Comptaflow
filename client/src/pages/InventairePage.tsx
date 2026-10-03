import { Fragment, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { EnteteImpression } from '../components/chrome/EnteteImpression';
import { Aide } from '../components/chrome/Aide';
import type {
  CaisseNonComptee,
  CampagneInventaire,
  Compte,
  EcartInventaire,
  Exercice,
  FicheInventaire,
  ApercuPvCaisse,
  MouvementsReconstitutionCaisse,
  ProcesVerbalCaisse,
  PropositionRedressement,
  RoleMembreInventaire,
  SousCommissionInventaire,
} from '../lib/types';
import { montant } from '../lib/montants';
import { compteDuNumeroTape, RETENUS } from '../lib/comptes-proposes';

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

/** Les deux valeurs de l'enum `RoleMembreInventaire` du schéma. */
const LIBELLE_ROLE: Record<RoleMembreInventaire, string> = {
  INVENTORIANT: 'Inventoriant',
  TEMOIN: 'Témoin',
};

/**
 * LES STATUTS QUE LE SERVICE ADMET POUR CHAQUE GESTE, relus dans
 * `inventaire.service.ts` · l'écran ne propose pas un geste que le serveur
 * refuserait au statut courant (même parti que les boutons de l'en-tête).
 */
const PEUT_PREPARER = ['PREPARATION', 'RECENSEMENT']; // sous-commissions, fiches, comptage
// PV de comptage d'une caisse · dès la préparation, compter une caisse étant
// recenser (audit final F134) ; le serveur fait alors passer la campagne au
// recensement.
const PEUT_ETABLIR_PV = ['PREPARATION', 'RECENSEMENT', 'ARBITRAGE'];

/**
 * Un champ numérique vide n'est PAS zéro · il n'est pas envoyé. `null` signale
 * une saisie illisible, et le bouton reste fermé plutôt que d'envoyer un NaN
 * que le serveur refuserait sans dire quel champ.
 */
const lireNombre = (texte: string): number | undefined | null => {
  const t = texte.replace(/\s/g, '').replace(',', '.');
  if (t === '') return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

const CHAMP = 'block border border-border bg-surface px-2 py-[3px] text-[11.5px]';
const BOUTON = 'border border-border rounded-[3px] px-2.5 py-[3px] text-[11.5px] disabled:opacity-40';
const BOUTON_PRINCIPAL =
  'bg-sel text-white rounded-[3px] px-2.5 py-[3px] text-[11.5px] font-semibold disabled:opacity-40';

const jour = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString('fr-FR') : '·');

export function InventairePage() {
  const { peutEcrire } = useAuth();
  const [campagnes, setCampagnes] = useState<CampagneInventaire[] | null>(null);
  const [exercices, setExercices] = useState<Exercice[]>([]);
  const [selectionId, setSelectionId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CampagneInventaire | null>(null);
  const [creation, setCreation] = useState(false);
  const [libelle, setLibelle] = useState('');
  const [dateInventaire, setDateInventaire] = useState('');
  const [exerciceId, setExerciceId] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  // NULL N'EST PAS VIDE (audit final F183) · une lecture refusée s'affichait
  // « Aucune caisse sans procès-verbal », c'est-à-dire la réponse favorable,
  // sur la seule question que la clôture de la campagne pose.
  const [caisses, setCaisses] = useState<CaisseNonComptee[] | null>(null);
  const [erreurCaisses, setErreurCaisses] = useState<string | null>(null);
  // DEUX LECTURES DU PLAN · la liste proposée (comptes retenus ou utilisés) et
  // le plan entier, où se résout un numéro tapé, jamais refusé faute d'être
  // retenu (`lib/comptes-proposes.ts`, même règle que la saisie). Null tant
  // qu'ils ne sont pas lus.
  const [comptes, setComptes] = useState<{ proposes: Compte[]; plan: Compte[] } | null>(null);
  const [erreurComptes, setErreurComptes] = useState<string | null>(null);

  const charger = () => {
    api.get<CampagneInventaire[]>('/inventaire').then(setCampagnes, (e: Error) => setErreur(e.message));
  };

  useEffect(() => {
    charger();
    api.get<Exercice[]>('/exercices').then(setExercices, () => undefined);
  }, []);

  // Le plan ne sert qu'à ouvrir une fiche · inutile à qui ne peut pas écrire.
  useEffect(() => {
    if (!peutEcrire) return;
    Promise.all([api.get<Compte[]>(`/comptes?typeCompte=DETAIL&${RETENUS}`), api.get<Compte[]>('/comptes?typeCompte=DETAIL')]).then(
      ([proposes, plan]) => {
        setComptes({ proposes, plan });
        setErreurComptes(null);
      },
      // Un échec de lecture se dit · la fiche ne s'ouvrirait pas sans que rien ne dise pourquoi.
      (e: Error) => setErreurComptes(e.message || "Le plan de comptes n'a pas pu être lu."),
    );
  }, [peutEcrire]);

  // LA CAMPAGNE AFFICHÉE · une réponse arrivée pour une autre (changement de
  // campagne pendant la lecture) est JETÉE, jamais posée sur l'écran de la
  // nouvelle · sinon les PV et les caisses d'une campagne s'affichaient sous
  // le nom d'une autre (seconde passe A10, i).
  const campagneAffichee = useRef<string | null>(null);

  const chargerCaisses = (id: string) => {
    setErreurCaisses(null);
    return api.get<CaisseNonComptee[]>(`/inventaire/${id}/caisses-non-comptees`).then(
      (c) => {
        if (campagneAffichee.current === id) setCaisses(c);
      },
      (e: Error) => {
        if (campagneAffichee.current !== id) return;
        setCaisses(null);
        setErreurCaisses(e.message || 'La liste des caisses n’a pas pu être lue.');
      },
    );
  };

  const lireDetail = (id: string) =>
    api.get<CampagneInventaire>(`/inventaire/${id}`).then(
      (d) => {
        if (campagneAffichee.current === id) setDetail(d);
      },
      (e: Error) => {
        if (campagneAffichee.current === id) setErreur(e.message);
      },
    );

  useEffect(() => {
    campagneAffichee.current = selectionId;
    // Vidé d'abord · le détail de la campagne précédente ne reste pas affiché
    // pendant la lecture de la nouvelle.
    setDetail(null);
    setCaisses(null);
    setErreurCaisses(null);
    if (!selectionId) return;
    lireDetail(selectionId);
    chargerCaisses(selectionId);
    return () => {
      if (campagneAffichee.current === selectionId) campagneAffichee.current = null;
    };
  }, [selectionId]);

  const rafraichir = () => {
    charger();
    if (selectionId) {
      lireDetail(selectionId);
      chargerCaisses(selectionId);
    }
  };

  const agir = async (action: () => Promise<unknown>) => {
    setErreur(null);
    try {
      await action();
      rafraichir();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Opération impossible');
      // Le formulaire reste ouvert sur un refus · la saisie n'est pas perdue.
      return false;
    }
    return true;
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
      <div className="ecran-seul mb-1.5 max-w-[1240px] flex items-center justify-end gap-2">
        <Aide
          titre="Inventaire physique"
          texte="« À la clôture de chaque exercice, l’entité doit procéder au recensement et à l’évaluation de ses biens, créances et dettes à leur valeur effective du moment. » Son absence expose les dirigeants à une sanction pénale."
          source="AUDCIF art. 42"
        />
        {peutEcrire && (
          <button
            type="button"
            onClick={() => setCreation(true)}
            className="bg-sel text-white rounded-[3px] px-3 py-[3px] text-[11.5px] font-semibold hover:opacity-90"
          >
            Nouvelle campagne
          </button>
        )}
      </div>

      {erreur && (
        <div className="border border-danger/30 bg-danger-soft px-3.5 py-2 mb-2.5 text-[11.5px] max-w-[1240px]">
          {erreur}
        </div>
      )}

      {creation && (
        <div className="border border-border bg-surface px-3.5 py-2.5 mb-2.5 max-w-[1240px]">
          <div className="text-[11.5px] font-semibold mb-1.5">Ouvrir une campagne</div>
          <div className="flex flex-wrap gap-2 items-end">
            <label className="text-[11px] text-text-dim">
              Exercice
              <select
                value={exerciceId}
                onChange={(e) => setExerciceId(e.target.value)}
                className="block border border-border bg-surface px-2 py-[3px] text-[11.5px] min-w-[180px]"
              >
                <option value="">Choisir…</option>
                {exercices.map((x) => (
                  <option key={x.id} value={x.id}>
                    {jour(x.dateDebut)} au {jour(x.dateFin)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[11px] text-text-dim">
              Date d’inventaire
              <input
                type="date"
                value={dateInventaire}
                onChange={(e) => setDateInventaire(e.target.value)}
                className="block border border-border bg-surface px-2 py-[3px] text-[11.5px]"
              />
            </label>
            <label className="text-[11px] text-text-dim flex-1 min-w-[220px]">
              Libellé
              <input
                value={libelle}
                onChange={(e) => setLibelle(e.target.value)}
                placeholder="Inventaire de clôture 2026"
                className="block w-full border border-border bg-surface px-2 py-[3px] text-[11.5px]"
              />
            </label>
            <button
              type="button"
              onClick={creer}
              disabled={!exerciceId || !dateInventaire || !libelle.trim()}
              className="bg-sel text-white rounded-[3px] px-3 py-[3px] text-[11.5px] font-semibold disabled:opacity-40"
            >
              Ouvrir
            </button>
            <button
              type="button"
              onClick={() => setCreation(false)}
              className="border border-border rounded-[3px] px-3 py-[3px] text-[11.5px]"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-2.5 max-w-[1400px] items-start">
        {/* --- Campagnes -------------------------------------------------- */}
        <div className="border border-border bg-surface min-w-[260px] max-w-[300px]">
          <div className="px-2.5 py-1.5 border-b border-border text-[11px] font-mono text-text-dim">Campagnes</div>
          {campagnes?.length === 0 && (
            <div className="px-2.5 py-3 text-[11.5px] text-text-dim">Aucune campagne.</div>
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
              <div className="text-[11.5px] font-semibold leading-tight">{c.libelle}</div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`text-[10px] px-1.5 py-[1px] rounded ${COULEUR_STATUT[c.statut]}`}>
                  {LIBELLE_STATUT[c.statut]}
                </span>
                <span className="text-[10.5px] text-text-dim">{jour(c.dateInventaire)}</span>
              </div>
            </button>
          ))}
        </div>

        {/* --- Détail ------------------------------------------------------ */}
        <div className="flex-1 min-w-0">
          {!detail && (
            <div className="border border-border bg-surface px-3.5 py-3 text-[11.5px] text-text-dim">
              Choisir une campagne pour en voir les fiches et les écarts.
            </div>
          )}

          {detail && (
            <>
              <div className="border border-border bg-surface px-3.5 py-2 mb-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="text-[11.5px] font-bold">{detail.libelle}</div>
                    <div className="text-[11px] text-text-dim">
                      Comptage au {jour(detail.dateInventaire)} ·{' '}
                      {detail.procesVerbalEtabliLe
                        ? `PV établi le ${jour(detail.procesVerbalEtabliLe)}`
                        : 'PV non établi'}
                    </div>
                  </div>
                  {peutEcrire && (
                    <div className="flex gap-1.5">
                      {(detail.statut === 'PREPARATION' || detail.statut === 'RECENSEMENT') && (
                        <>
                          <button
                            type="button"
                            onClick={() => agir(() => api.post(`/inventaire/${detail.id}/fiches/immobilisations`, {}))}
                            className="border border-border rounded-[3px] px-2.5 py-[3px] text-[11.5px]"
                          >
                            Fiches du parc immobilisé
                          </button>
                          <button
                            type="button"
                            onClick={() => agir(() => api.post(`/inventaire/${detail.id}/rapprocher`, {}))}
                            className="bg-sel text-white rounded-[3px] px-2.5 py-[3px] text-[11.5px] font-semibold"
                          >
                            Rapprocher de la balance
                          </button>
                        </>
                      )}
                      {detail.statut === 'ARBITRAGE' && (
                        <button
                          type="button"
                          onClick={() => agir(() => api.post(`/inventaire/${detail.id}/clore`, {}))}
                          className="bg-sel text-white rounded-[3px] px-2.5 py-[3px] text-[11.5px] font-semibold"
                        >
                          Clore la campagne
                        </button>
                      )}
                      {/* Mêmes statuts que `etablirProcesVerbal` · en préparation
                          le bouton promettait un PV que le serveur refuse. */}
                      {(detail.statut === 'RECENSEMENT' || detail.statut === 'ARBITRAGE') && !detail.procesVerbalEtabliLe && (
                        <button
                          type="button"
                          onClick={() => agir(() => api.post(`/inventaire/${detail.id}/proces-verbal`, {}))}
                          className="border border-border rounded-[3px] px-2.5 py-[3px] text-[11.5px]"
                        >
                          Établir le PV
                        </button>
                      )}
                    </div>
                  )}
                </div>
                {detail.sanction && (
                  <div className="text-[10.5px] text-text-dim mt-1 border-t border-border/60 pt-1">
                    Défaut d’inventaire · {detail.sanction.texte}, {detail.sanction.article}
                  </div>
                )}
              </div>

              {nonValorisees.length > 0 && detail.statut !== 'CLOTUREE' && detail.statut !== 'ARBITRAGE' && (
                <div className="border border-warning/30 bg-warning-soft px-3.5 py-2 mb-2 text-[11.5px]">
                  {nonValorisees.length} fiche{nonValorisees.length > 1 ? 's' : ''} sans valeur d’inventaire · le
                  rapprochement les refuse.
                </div>
              )}

              {/* --- Sous-commissions ------------------------------------- */}
              <BlocSousCommissions campagne={detail} peutEcrire={peutEcrire} agir={agir} />

              {/* --- Écarts ------------------------------------------------ */}
              {ecarts.length > 0 && (
                <div className="border border-border bg-surface mb-2">
                  <div className="px-2.5 py-1.5 border-b border-border flex items-center justify-between">
                    <span className="text-[11px] font-mono text-text-dim flex items-center gap-1">
                      Écarts · par compte
                      {excedents.length > 0 && (
                        <Aide
                          titre="Excédent d’inventaire"
                          texte="Un excédent ne se comptabilise pas : « si la valeur d’inventaire est supérieure à la valeur d’entrée, cette dernière est maintenue dans les comptes, sauf cas expressément prévus par la législation ». Il se documente et se porte au résumé de l’opération d’inventaire."
                          source="AUDCIF art. 43"
                        />
                      )}
                    </span>
                    <span className="text-[10.5px] text-text-dim">
                      {manquants.length} manquant{manquants.length > 1 ? 's' : ''} · {excedents.length} excédent
                      {excedents.length > 1 ? 's' : ''} · {sansDecision.length} sans décision
                    </span>
                  </div>
                  <table className="w-full text-[11.5px]">
                    <thead>
                      <tr className="text-text-dim border-b border-border/60">
                        <th className="text-left px-2.5 py-1 font-normal">Compte</th>
                        <th className="text-right px-2.5 py-1 font-normal">Inventaire</th>
                        <th className="text-right px-2.5 py-1 font-normal">Comptabilité</th>
                        <th className="text-right px-2.5 py-1 font-normal">Écart</th>
                        <th className="text-left px-2.5 py-1 font-normal">Décision</th>
                        <th className="text-left px-2.5 py-1 font-normal">Responsable</th>
                        <th className="px-2.5 py-1" />
                      </tr>
                    </thead>
                    <tbody>
                      {ecarts.map((e) => (
                        <LigneEcart
                          key={e.id}
                          ecart={e}
                          arbitrable={peutEcrire && detail.statut === 'ARBITRAGE'}
                          peutEcrire={peutEcrire}
                          agir={agir}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* --- Fiches ------------------------------------------------ */}
              <div className="border border-border bg-surface">
                <div className="px-2.5 py-1.5 border-b border-border text-[11px] font-mono text-text-dim">
                  FICHES DE COMPTAGE · {detail.fiches?.length ?? 0}
                </div>
                {peutEcrire && PEUT_PREPARER.includes(detail.statut) && (
                  <AjoutFiche campagne={detail} comptes={comptes} erreurComptes={erreurComptes} agir={agir} />
                )}
                {(detail.fiches?.length ?? 0) === 0 && (
                  <div className="px-2.5 py-3 text-[11.5px] text-text-dim">Aucune fiche.</div>
                )}
                {(detail.fiches?.length ?? 0) > 0 && (
                  <table className="w-full text-[11.5px]">
                    <thead>
                      <tr className="text-text-dim border-b border-border/60">
                        <th className="text-left px-2.5 py-1 font-normal">Désignation</th>
                        <th className="text-left px-2.5 py-1 font-normal">Compte</th>
                        <th className="text-right px-2.5 py-1 font-normal">Quantité</th>
                        <th className="text-right px-2.5 py-1 font-normal">Valeur d’inventaire</th>
                        <th className="text-left px-2.5 py-1 font-normal">Pièce</th>
                        <th className="px-2.5 py-1" />
                      </tr>
                    </thead>
                    <tbody>
                      {detail.fiches?.map((f) => (
                        <LigneFiche
                          key={f.id}
                          fiche={f}
                          saisissable={peutEcrire && PEUT_PREPARER.includes(detail.statut)}
                          agir={agir}
                        />
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* --- Caisses ----------------------------------------------- */}
              {detail.statut !== 'CLOTUREE' && (
                <BlocCaisses campagne={detail} caisses={caisses} erreur={erreurCaisses} peutEcrire={peutEcrire} agir={agir} />
              )}
              <BlocPvCaisse pvs={detail.pvComptageCaisse} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

type Agir = (action: () => Promise<unknown>) => Promise<boolean>;

/**
 * SOUS-COMMISSIONS · le PV de campagne comme celui d'une caisse se signent
 * « par ceux qui ont inventorié ET assisté » (CPCC, étape 2), et le serveur
 * refuse l'un et l'autre tant qu'il manque un inventoriant ou un témoin.
 * Sans ce bloc, aucun PV n'était établissable depuis l'écran.
 */
function BlocSousCommissions({
  campagne,
  peutEcrire,
  agir,
}: {
  campagne: CampagneInventaire;
  peutEcrire: boolean;
  agir: Agir;
}) {
  const [nom, setNom] = useState('');
  const [perimetre, setPerimetre] = useState('');
  const liste = campagne.sousCommissions ?? [];
  const creable = peutEcrire && PEUT_PREPARER.includes(campagne.statut);
  const cloturee = campagne.statut === 'CLOTUREE';

  const creer = async () => {
    const ok = await agir(() =>
      api.post(`/inventaire/${campagne.id}/sous-commissions`, {
        nom: nom.trim(),
        perimetre: perimetre.trim() || undefined,
      }),
    );
    if (ok) {
      setNom('');
      setPerimetre('');
    }
  };

  return (
    <div className="border border-border bg-surface mb-2">
      <div className="px-2.5 py-1.5 border-b border-border text-[11px] text-text-dim flex items-center gap-1">
        Sous-commissions · {liste.length}
        <Aide
          titre="Sous-commissions"
          texte="« L’établissement du PV d’inventaire physique est nécessaire avec signatures de ceux qui ont inventorié et assisté à cet inventaire. » Le PV de la campagne exige au moins un inventoriant et un témoin ; le PV de comptage d’une caisse se signe par les membres de la sous-commission qui l’a comptée."
          source="CPCC, étape 2"
        />
      </div>
      {liste.length === 0 && <div className="px-2.5 py-2 text-[11.5px] text-text-dim">Aucune sous-commission.</div>}
      {liste.map((sc) => (
        <div key={sc.id} className="px-2.5 py-1.5 border-b border-border/40">
          <div className="text-[11.5px] font-semibold">
            {sc.nom}
            {sc.perimetre && <span className="font-normal text-text-dim"> · {sc.perimetre}</span>}
          </div>
          {sc.membres.length === 0 ? (
            <div className="text-[11px] text-text-dim">Aucun membre.</div>
          ) : (
            <ul className="text-[11px]">
              {sc.membres.map((m) => (
                <li key={m.id}>
                  {m.nom}
                  {m.fonction && <span className="text-text-dim"> ({m.fonction})</span>} · {LIBELLE_ROLE[m.role]}
                </li>
              ))}
            </ul>
          )}
          {peutEcrire && !cloturee && <AjoutMembre sousCommission={sc} agir={agir} />}
        </div>
      ))}
      {creable && (
        <div className="px-2.5 py-1.5 flex flex-wrap gap-2 items-end">
          <label className="text-[11px] text-text-dim">
            Nom
            <input value={nom} onChange={(e) => setNom(e.target.value)} className={CHAMP} />
          </label>
          <label className="text-[11px] text-text-dim flex-1 min-w-[200px]">
            Périmètre
            <input value={perimetre} onChange={(e) => setPerimetre(e.target.value)} className={`${CHAMP} w-full`} />
          </label>
          <button type="button" onClick={creer} disabled={!nom.trim()} className={BOUTON_PRINCIPAL}>
            Créer la sous-commission
          </button>
        </div>
      )}
    </div>
  );
}

function AjoutMembre({ sousCommission, agir }: { sousCommission: SousCommissionInventaire; agir: Agir }) {
  const [nom, setNom] = useState('');
  const [fonction, setFonction] = useState('');
  const [role, setRole] = useState<RoleMembreInventaire>('INVENTORIANT');

  const ajouter = async () => {
    const ok = await agir(() =>
      api.post(`/inventaire/sous-commissions/${sousCommission.id}/membres`, {
        nom: nom.trim(),
        fonction: fonction.trim() || undefined,
        role,
      }),
    );
    if (ok) {
      setNom('');
      setFonction('');
    }
  };

  return (
    <div className="flex flex-wrap gap-2 items-end mt-1">
      <label className="text-[11px] text-text-dim">
        Membre
        <input value={nom} onChange={(e) => setNom(e.target.value)} className={CHAMP} />
      </label>
      <label className="text-[11px] text-text-dim">
        Fonction
        <input value={fonction} onChange={(e) => setFonction(e.target.value)} className={CHAMP} />
      </label>
      <label className="text-[11px] text-text-dim">
        Qualité
        <select value={role} onChange={(e) => setRole(e.target.value as RoleMembreInventaire)} className={CHAMP}>
          {(Object.keys(LIBELLE_ROLE) as RoleMembreInventaire[]).map((r) => (
            <option key={r} value={r}>
              {LIBELLE_ROLE[r]}
            </option>
          ))}
        </select>
      </label>
      <button type="button" onClick={ajouter} disabled={!nom.trim()} className={BOUTON}>
        Ajouter
      </button>
    </div>
  );
}

/**
 * UNE FICHE HORS DU PARC IMMOBILISÉ · stocks, caisses, tout ce que le
 * logiciel ne tient pas déjà. Le compte se choisit par son NUMÉRO, parmi les
 * comptes de détail : un compte Total n'a pas de solde propre, et le serveur
 * le refuse (`creerFiche`).
 */
function AjoutFiche({
  campagne,
  comptes,
  erreurComptes,
  agir,
}: {
  campagne: CampagneInventaire;
  comptes: { proposes: Compte[]; plan: Compte[] } | null;
  erreurComptes: string | null;
  agir: Agir;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [numero, setNumero] = useState('');
  const [designation, setDesignation] = useState('');
  const [emplacement, setEmplacement] = useState('');
  const [uniteMesure, setUniteMesure] = useState('');
  const [sousCommissionId, setSousCommissionId] = useState('');
  const proposes = comptes ? comptes.proposes.filter((c) => c.typeCompte === 'DETAIL') : [];
  // Le numéro tapé se résout dans TOUT le plan de détail · jamais un refus.
  const compte = comptes ? compteDuNumeroTape(numero, comptes.plan.filter((c) => c.typeCompte === 'DETAIL')) : undefined;
  const horsListe = !!compte && !proposes.some((c) => c.id === compte.id);

  const ajouter = async () => {
    if (!compte) return;
    const ok = await agir(() =>
      api.post(`/inventaire/${campagne.id}/fiches`, {
        compteId: compte.id,
        designation: designation.trim(),
        emplacement: emplacement.trim() || undefined,
        uniteMesure: uniteMesure.trim() || undefined,
        sousCommissionId: sousCommissionId || undefined,
      }),
    );
    if (ok) {
      setDesignation('');
      setEmplacement('');
    }
  };

  if (!ouvert) {
    return (
      <div className="px-2.5 py-1.5 border-b border-border/60">
        <button type="button" onClick={() => setOuvert(true)} className={BOUTON}>
          Ajouter une fiche
        </button>
      </div>
    );
  }
  return (
    <div className="px-2.5 py-1.5 border-b border-border/60 flex flex-wrap gap-2 items-end">
      <label className="text-[11px] text-text-dim">
        Compte
        <input
          value={numero}
          onChange={(e) => setNumero(e.target.value)}
          list="inventaire-comptes"
          className={`${CHAMP} w-[120px]`}
        />
        <datalist id="inventaire-comptes">
          {proposes.map((c) => (
            <option key={c.id} value={c.numero}>
              {c.intitule}
            </option>
          ))}
        </datalist>
      </label>
      <label className="text-[11px] text-text-dim flex-1 min-w-[200px]">
        Désignation
        <input value={designation} onChange={(e) => setDesignation(e.target.value)} className={`${CHAMP} w-full`} />
      </label>
      <label className="text-[11px] text-text-dim">
        Emplacement
        <input value={emplacement} onChange={(e) => setEmplacement(e.target.value)} className={CHAMP} />
      </label>
      <label className="text-[11px] text-text-dim">
        Unité
        <input value={uniteMesure} onChange={(e) => setUniteMesure(e.target.value)} className={`${CHAMP} w-[80px]`} />
      </label>
      <label className="text-[11px] text-text-dim">
        Sous-commission
        <select value={sousCommissionId} onChange={(e) => setSousCommissionId(e.target.value)} className={CHAMP}>
          <option value="">·</option>
          {(campagne.sousCommissions ?? []).map((sc) => (
            <option key={sc.id} value={sc.id}>
              {sc.nom}
            </option>
          ))}
        </select>
      </label>
      <button type="button" onClick={ajouter} disabled={!compte || !designation.trim()} className={BOUTON_PRINCIPAL}>
        Ajouter
      </button>
      <button type="button" onClick={() => setOuvert(false)} className={BOUTON}>
        Fermer
      </button>
      {erreurComptes && <span className="text-[11px] text-danger">Plan de comptes illisible · {erreurComptes}</span>}
      {comptes && numero.trim() !== '' && !compte && <span className="text-[11px] text-warning">Compte de détail introuvable au plan.</span>}
      {horsListe && compte && (
        <span className="text-[11px] text-text-dim">{compte.intitule} · compte ni retenu ni utilisé, pris tel que tapé.</span>
      )}
      {comptes && proposes.length === 0 && (
        <span className="text-[11px] text-warning">
          Aucun compte retenu ni utilisé à proposer · retenez-le dans Plan comptable, ou tapez le numéro du compte en entier.
        </span>
      )}
    </div>
  );
}

/**
 * ÉTAPES 2 ET 3 · la quantité comptée et la valeur d'inventaire. Le
 * rapprochement refuse toute fiche non valorisée : c'est ici qu'elle se
 * valorise. Un champ laissé vide n'est pas envoyé, il ne vaut pas zéro.
 */
function LigneFiche({ fiche, saisissable, agir }: { fiche: FicheInventaire; saisissable: boolean; agir: Agir }) {
  const [edition, setEdition] = useState(false);
  const [quantite, setQuantite] = useState(fiche.quantiteComptee ?? '');
  const [valeur, setValeur] = useState(fiche.valeurInventaire ?? '');
  const [piece, setPiece] = useState(fiche.referencePiece ?? '');
  const q = lireNombre(quantite);
  const v = lireNombre(valeur);
  // Le DTO pose `@Min(0)` sur les deux · on compte ce qu'on trouve.
  const lisible = q !== null && v !== null && (q === undefined || q >= 0) && (v === undefined || v >= 0);

  const enregistrer = async () => {
    const ok = await agir(() =>
      api.patch(`/inventaire/fiches/${fiche.id}`, {
        quantiteComptee: lireNombre(quantite) ?? undefined,
        valeurInventaire: lireNombre(valeur) ?? undefined,
        referencePiece: piece.trim() || undefined,
      }),
    );
    if (ok) setEdition(false);
  };

  return (
    <Fragment>
      <tr className="border-b border-border/40">
        <td className="px-2.5 py-1">{fiche.designation}</td>
        <td className="px-2.5 py-1 font-mono text-text-dim">{fiche.compte.numero}</td>
        <td className="px-2.5 py-1 text-right tabular-nums">
          {fiche.quantiteComptee === null ? (
            <span className="text-text-dim">non compté</span>
          ) : (
            Number(fiche.quantiteComptee).toLocaleString('fr-FR')
          )}
        </td>
        <td className="px-2.5 py-1 text-right tabular-nums">
          {fiche.valeurInventaire === null ? (
            <span className="text-warning">non valorisée</span>
          ) : (
            montant(fiche.valeurInventaire)
          )}
        </td>
        <td className="px-2.5 py-1 text-text-dim">{fiche.referencePiece ?? '·'}</td>
        <td className="px-2.5 py-1 text-right">
          {saisissable && !edition && (
            <>
              <button type="button" onClick={() => setEdition(true)} className={BOUTON}>
                Saisir le comptage
              </button>
              {/* RETIRER, AVANT LE RAPPROCHEMENT (audit final F135) · la
                  valoriser à zéro pour passer fabriquerait un manquant. */}
              <button
                type="button"
                onClick={() => agir(() => api.delete(`/inventaire/fiches/${fiche.id}`))}
                className={`${BOUTON} ml-1.5`}
              >
                Retirer
              </button>
            </>
          )}
        </td>
      </tr>
      {edition && (
        <tr className="border-b border-border/40 bg-chrome/40">
          <td colSpan={6} className="px-2.5 py-1.5">
            <div className="flex flex-wrap gap-2 items-end">
              <label className="text-[11px] text-text-dim">
                Quantité comptée{fiche.uniteMesure ? ` (${fiche.uniteMesure})` : ''}
                <input
                  value={quantite}
                  onChange={(e) => setQuantite(e.target.value)}
                  className={`${CHAMP} w-[120px] text-right`}
                />
              </label>
              <label className="text-[11px] text-text-dim">
                Valeur d’inventaire
                <input
                  value={valeur}
                  onChange={(e) => setValeur(e.target.value)}
                  className={`${CHAMP} w-[140px] text-right`}
                />
              </label>
              <label className="text-[11px] text-text-dim">
                Pièce
                <input value={piece} onChange={(e) => setPiece(e.target.value)} className={CHAMP} />
              </label>
              <button type="button" onClick={enregistrer} disabled={!lisible} className={BOUTON_PRINCIPAL}>
                Enregistrer
              </button>
              <button type="button" onClick={() => setEdition(false)} className={BOUTON}>
                Annuler
              </button>
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  );
}

/**
 * ÉTAPES 5 ET 6 · l'arbitrage et la proposition de redressement.
 *
 * Les décisions offertes suivent les deux refus du service (`arbitrer`) : un
 * EXCÉDENT ne se redresse pas, un MANQUANT n'est pas un excédent laissé au
 * bilan. Le serveur exige en plus le responsable d'un écart à redresser et
 * l'explication de tout écart non redressé · son refus est affiché tel quel.
 */
function LigneEcart({
  ecart,
  arbitrable,
  peutEcrire,
  agir,
}: {
  ecart: EcartInventaire;
  arbitrable: boolean;
  peutEcrire: boolean;
  agir: Agir;
}) {
  const [edition, setEdition] = useState(false);
  const [decision, setDecision] = useState<string>(ecart.decision ?? '');
  const [responsable, setResponsable] = useState(ecart.responsable ?? '');
  const [explication, setExplication] = useState(ecart.explication ?? '');
  const [proposition, setProposition] = useState<PropositionRedressement | null>(null);
  const [erreurProposition, setErreurProposition] = useState<string | null>(null);
  const v = Number(ecart.ecart);
  const decisions = Object.keys(LIBELLE_DECISION).filter(
    (d) => !(d === 'A_REDRESSER' && v > 0) && !(d === 'EXCEDENT_NON_COMPTABILISE' && v < 0),
  );

  const voirProposition = () => {
    setErreurProposition(null);
    api
      .get<PropositionRedressement>(`/inventaire/ecarts/${ecart.id}/proposition`)
      .then(setProposition, (e: unknown) =>
        setErreurProposition(e instanceof ApiError ? e.message : 'Proposition indisponible'),
      );
  };

  const arbitrer = async () => {
    const ok = await agir(() =>
      api.patch(`/inventaire/ecarts/${ecart.id}`, {
        decision,
        responsable: responsable.trim() || undefined,
        explication: explication.trim() || undefined,
      }),
    );
    if (ok) {
      setEdition(false);
      setProposition(null);
    }
  };

  return (
    <Fragment>
      <tr className="border-b border-border/40">
        <td className="px-2.5 py-1">
          <span className="font-mono">{ecart.compte.numero}</span>{' '}
          <span className="text-text-dim">{ecart.compte.intitule}</span>
          {ecart.nombreFiches > 1 && <span className="text-[10px] text-text-dim"> · {ecart.nombreFiches} fiches</span>}
        </td>
        <td className="px-2.5 py-1 text-right tabular-nums">{montant(ecart.valeurInventaire)}</td>
        <td className="px-2.5 py-1 text-right tabular-nums">{montant(ecart.soldeComptable)}</td>
        <td
          className={`px-2.5 py-1 text-right tabular-nums font-semibold ${
            v < 0 ? 'text-danger' : v > 0 ? 'text-warning' : 'text-text-dim'
          }`}
        >
          {montant(ecart.ecart)}
        </td>
        <td className="px-2.5 py-1">
          {ecart.decision ? LIBELLE_DECISION[ecart.decision] : <span className="text-text-dim">à trancher</span>}
        </td>
        <td className="px-2.5 py-1 text-text-dim">{ecart.responsable ?? '·'}</td>
        <td className="px-2.5 py-1 text-right whitespace-nowrap">
          <button type="button" onClick={voirProposition} className={BOUTON}>
            Proposition
          </button>{' '}
          {arbitrable && !edition && (
            <button type="button" onClick={() => setEdition(true)} className={BOUTON}>
              Arbitrer
            </button>
          )}
        </td>
      </tr>
      {(proposition || erreurProposition) && (
        <tr className="border-b border-border/40 bg-chrome/40">
          <td colSpan={7} className="px-2.5 py-1.5 text-[11px]">
            {erreurProposition && <div className="text-danger">{erreurProposition}</div>}
            {proposition && !proposition.proposable && <div className="text-text-dim">{proposition.motif}</div>}
            {proposition?.proposable && (
              <table className="w-full">
                <tbody>
                  {proposition.lignes.map((l, i) => (
                    <tr key={i}>
                      <td className="pr-2">{l.compte ?? <span className="text-warning">contrepartie à choisir</span>}</td>
                      <td className="pr-2">{l.libelle}</td>
                      <td className="pr-2 text-right tabular-nums">{l.sens === 'DEBIT' ? montant(l.montant) : ''}</td>
                      <td className="pr-2 text-right tabular-nums">{l.sens === 'CREDIT' ? montant(l.montant) : ''}</td>
                      <td className="text-text-dim">{l.note ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {proposition?.proposable && <LienRedressement ecart={ecart} peutEcrire={peutEcrire} agir={agir} />}
            <button
              type="button"
              onClick={() => {
                setProposition(null);
                setErreurProposition(null);
              }}
              className={`${BOUTON} mt-1`}
            >
              Fermer
            </button>
          </td>
        </tr>
      )}
      {edition && (
        <tr className="border-b border-border/40 bg-chrome/40">
          <td colSpan={7} className="px-2.5 py-1.5">
            <div className="flex flex-wrap gap-2 items-end">
              <label className="text-[11px] text-text-dim">
                Décision
                <select value={decision} onChange={(e) => setDecision(e.target.value)} className={CHAMP}>
                  <option value="">Choisir…</option>
                  {decisions.map((d) => (
                    <option key={d} value={d}>
                      {LIBELLE_DECISION[d]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-[11px] text-text-dim">
                Responsable
                <input value={responsable} onChange={(e) => setResponsable(e.target.value)} className={CHAMP} />
              </label>
              <label className="text-[11px] text-text-dim flex-1 min-w-[220px]">
                Motif
                <input
                  value={explication}
                  onChange={(e) => setExplication(e.target.value)}
                  className={`${CHAMP} w-full`}
                />
              </label>
              <button type="button" onClick={arbitrer} disabled={!decision} className={BOUTON_PRINCIPAL}>
                Enregistrer
              </button>
              <button type="button" onClick={() => setEdition(false)} className={BOUTON}>
                Annuler
              </button>
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  );
}

/**
 * L'ÉCRITURE DE REDRESSEMENT PASSÉE · audit du serveur de 2026-09, I2. Le
 * module propose le redressement et ne le passe pas ; une fois la pièce saisie
 * au journal, elle se désigne ici. Le sélecteur ne liste que les écritures qui
 * créditent le compte du montant manquant, et le serveur rejoue la règle.
 */
function LienRedressement({ ecart, peutEcrire, agir }: { ecart: EcartInventaire; peutEcrire: boolean; agir: Agir }) {
  const [candidates, setCandidates] = useState<
    { id: string; date: string; numeroPiece: number | null; libelle: string; statut: string }[] | null
  >(null);
  const [choix, setChoix] = useState('');

  useEffect(() => {
    setCandidates(null);
    setChoix('');
    if (ecart.ecritureId || !peutEcrire) return;
    api
      .get<{ id: string; date: string; numeroPiece: number | null; libelle: string; statut: string }[]>(
        `/inventaire/ecarts/${ecart.id}/ecritures-candidates`,
      )
      .then(setCandidates, () => setCandidates([]));
  }, [ecart.id, ecart.ecritureId, peutEcrire]);

  if (ecart.ecritureId) {
    return (
      <div className="mt-1 flex items-center gap-2">
        <span>Écriture de redressement rattachée.</span>
        {peutEcrire && (
          <button
            type="button"
            className={BOUTON}
            onClick={() => agir(() => api.delete(`/inventaire/ecarts/${ecart.id}/ecriture`))}
          >
            Détacher
          </button>
        )}
      </div>
    );
  }
  if (!peutEcrire) return <div className="mt-1 text-text-dim">Aucune écriture de redressement rattachée.</div>;
  return (
    <div className="mt-1 flex items-center gap-2">
      <select value={choix} onChange={(e) => setChoix(e.target.value)} className={CHAMP}>
        <option value="">
          {candidates === null
            ? 'Recherche…'
            : candidates.length === 0
              ? 'Aucune écriture du journal ne crédite ce compte du manquant'
              : 'Écriture passée au journal…'}
        </option>
        {candidates?.map((e) => (
          <option key={e.id} value={e.id}>
            {e.date.slice(0, 10)} · {e.numeroPiece ?? 's.n.'} · {e.libelle}
            {e.statut === 'BROUILLARD' ? ' (brouillard)' : ''}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={!choix}
        className={BOUTON}
        onClick={() => agir(() => api.post(`/inventaire/ecarts/${ecart.id}/ecriture`, { ecritureId: choix }))}
      >
        Rattacher
      </button>
    </div>
  );
}

/**
 * CAISSES · la question composite du CPCC (« a-t-on tenu compte de la caisse
 * siège, de la caisse agence, de la caisse de secours ? ») rendue caisse par
 * caisse. La clôture est refusée tant qu'une caisse à solde non nul n'a pas
 * son PV de comptage, et aucun écran ne permettait de l'établir.
 */
function BlocCaisses({
  campagne,
  caisses,
  erreur,
  peutEcrire,
  agir,
}: {
  campagne: CampagneInventaire;
  caisses: CaisseNonComptee[] | null;
  erreur: string | null;
  peutEcrire: boolean;
  agir: Agir;
}) {
  const [ouverte, setOuverte] = useState<string | null>(null);
  const etablissable = peutEcrire && PEUT_ETABLIR_PV.includes(campagne.statut);

  return (
    <div className="border border-border bg-surface mt-2">
      <div className="px-2.5 py-1.5 border-b border-border text-[11px] text-text-dim flex items-center gap-1">
        Caisses sans procès-verbal de comptage · {caisses === null ? '·' : caisses.length}
        <Aide
          titre="Comptage des caisses"
          texte="« A-t-on tenu compte de la caisse siège, de la caisse agence, de la caisse de secours ? » Un procès-verbal par caisse, signé par les membres de la sous-commission qui l’a comptée, inventoriant et témoin. La campagne ne se clôt pas tant qu’une caisse à solde non nul n’a pas le sien ; une caisse à solde nul n’est pas réclamée. La ventilation par coupure est facultative, et doit égaler le montant compté."
          source="CPCC, § VI et étape 2"
        />
      </div>
      {erreur ? (
        <div className="px-2.5 py-2 text-[11.5px] text-danger">Liste des caisses illisible · {erreur}</div>
      ) : caisses === null ? (
        <div className="px-2.5 py-2 text-[11.5px] text-text-dim">Lecture des caisses…</div>
      ) : (
        caisses.length === 0 && (
          <div className="px-2.5 py-2 text-[11.5px] text-text-dim">Aucune caisse à solde non nul sans procès-verbal.</div>
        )
      )}
      {(caisses ?? []).map((c) => (
        <div key={c.compteId} className="px-2.5 py-1.5 border-b border-border/40">
          <div className="flex items-center justify-between gap-2 text-[11.5px]">
            <span>
              <span className="font-mono">{c.numero}</span> <span className="text-text-dim">{c.intitule}</span>
              <span className="tabular-nums"> · solde {montant(c.solde)}</span>
            </span>
            {etablissable && ouverte !== c.compteId && (
              <button type="button" onClick={() => setOuverte(c.compteId)} className={BOUTON}>
                Établir le PV de comptage
              </button>
            )}
          </div>
          {ouverte === c.compteId && (
            <FormulairePvCaisse campagne={campagne} caisse={c} agir={agir} fermer={() => setOuverte(null)} />
          )}
        </div>
      ))}
    </div>
  );
}

function FormulairePvCaisse({
  campagne,
  caisse,
  agir,
  fermer,
}: {
  campagne: CampagneInventaire;
  caisse: CaisseNonComptee;
  agir: Agir;
  fermer: () => void;
}) {
  const [sousCommissionId, setSousCommissionId] = useState(() =>
    // Une seule sous-commission · c'est elle, proposée (le PV reste à signer
    // par ceux qui ont compté, refus du serveur sinon).
    (campagne.sousCommissions ?? []).length === 1 ? campagne.sousCommissions![0].id : '',
  );
  const [dateComptage, setDateComptage] = useState(campagne.dateInventaire.slice(0, 10));
  const [heure, setHeure] = useState('');
  // AUCUN SOLDE SAISI (ligne A10) · le serveur lit le livre-journal à la date
  // du comptage et le fige, avec la reconstitution vers la clôture quand le
  // comptage la suit. Le solde proposé ici était celui de l'exercice entier,
  // brouillard compris, et se corrigeait à la main.
  const [especes, setEspeces] = useState('');
  const [coupures, setCoupures] = useState<{ valeur: string; nombre: string }[]>([]);
  const [attestationLe, setAttestationLe] = useState('');
  const [attestationPar, setAttestationPar] = useState('');
  const [observations, setObservations] = useState('');
  // L'APERÇU AVANT DE FIGER (seconde passe A10, a) · ce que le serveur figera
  // pour cette caisse à cette date, ou le motif de son refus. Le PV est
  // unique et définitif · le chiffre se voit avant de signer. Une réponse
  // pour une autre date est jetée.
  const [apercu, setApercu] = useState<ApercuPvCaisse | null>(null);
  const [erreurApercu, setErreurApercu] = useState<string | null>(null);
  useEffect(() => {
    let perime = false;
    setApercu(null);
    setErreurApercu(null);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateComptage)) return;
    const q = new URLSearchParams({ compteId: caisse.compteId, dateComptage });
    api.get<ApercuPvCaisse>(`/inventaire/${campagne.id}/pv-caisse/apercu?${q.toString()}`).then(
      (a) => {
        if (!perime) setApercu(a);
      },
      (err: Error) => {
        if (!perime) setErreurApercu(err.message || 'L’aperçu n’a pas pu être lu.');
      },
    );
    return () => {
      perime = true;
    };
  }, [campagne.id, caisse.compteId, dateComptage]);
  const unite = apercu?.lisible && apercu.devise ? apercu.devise : null;

  const e = lireNombre(especes);
  // `CoupureDto` · valeur faciale positive, nombre entier positif.
  const coupuresLisibles = coupures.every((c) => {
    const v = lireNombre(c.valeur);
    const n = lireNombre(c.nombre);
    return typeof v === 'number' && v > 0 && typeof n === 'number' && Number.isInteger(n) && n > 0;
  });
  const totalCoupures = coupures.reduce((t, c) => t + (lireNombre(c.valeur) ?? 0) * (lireNombre(c.nombre) ?? 0), 0);
  const pret =
    !!sousCommissionId &&
    !!dateComptage &&
    typeof e === 'number' &&
    e >= 0 &&
    coupuresLisibles &&
    // Un refus connu ne s'envoie pas · le serveur le rendrait de toute façon.
    apercu?.lisible === true;

  const etablir = async () => {
    const ok = await agir(() =>
      api.post(`/inventaire/${campagne.id}/pv-caisse`, {
        compteId: caisse.compteId,
        sousCommissionId,
        dateComptage,
        heureComptage: heure.trim() || undefined,
        especesComptees: lireNombre(especes),
        coupures:
          coupures.length > 0
            ? coupures.map((c) => ({ valeurUnitaire: lireNombre(c.valeur), nombre: lireNombre(c.nombre) }))
            : undefined,
        attestationEtablieLe: attestationLe || undefined,
        attestationPar: attestationPar.trim() || undefined,
        observations: observations.trim() || undefined,
      }),
    );
    if (ok) fermer();
  };

  return (
    <div className="mt-1.5 flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-2 items-end">
        <label className="text-[11px] text-text-dim">
          Sous-commission
          <select value={sousCommissionId} onChange={(ev) => setSousCommissionId(ev.target.value)} className={CHAMP}>
            <option value="">Choisir…</option>
            {(campagne.sousCommissions ?? []).map((sc) => (
              <option key={sc.id} value={sc.id}>
                {sc.nom}
              </option>
            ))}
          </select>
          {(campagne.sousCommissions ?? []).length === 0 && (
            <span className="block text-warning">Aucune sous-commission · composez-en une dans la campagne avant d'établir le procès-verbal.</span>
          )}
        </label>
        <label className="text-[11px] text-text-dim">
          Date du comptage
          <input type="date" value={dateComptage} onChange={(ev) => setDateComptage(ev.target.value)} className={CHAMP} />
        </label>
        <label className="text-[11px] text-text-dim">
          Heure
          <input type="time" value={heure} onChange={(ev) => setHeure(ev.target.value)} className={CHAMP} />
        </label>
        <span className="text-[11px] text-text-dim self-center flex items-center gap-1">
          Solde comparé · livre-journal au jour du comptage
          <Aide
            titre="Solde comparé"
            texte="« Le solde du compte caisse doit toujours correspondre exactement à la somme disponible réellement. » Le solde n’est pas saisi · le serveur lit les écritures validées de la caisse jusqu’au jour du comptage (date de valeur pour une opération reportée) et le fige sur le procès-verbal. Compté après la clôture, il remonte à la clôture par les encaissements et les paiements intercalés, report à-nouveau exclu. Une ligne au brouillard sur la caisse, ou un exercice suivant non ouvert, refuse le procès-verbal : validez, ou ouvrez l’exercice et saisissez les mouvements, d’abord. Le livre-journal ne porte pas d’heure · un mouvement du jour passé après le comptage s’explique en observation."
            source="Fiche du compte 57 ; AUDCIF art. 16, 22 et 42"
          />
        </span>
        <label className="text-[11px] text-text-dim">
          Espèces comptées{unite ? ` (${unite})` : ''}
          <input
            value={especes}
            onChange={(ev) => setEspeces(ev.target.value)}
            className={`${CHAMP} w-[140px] text-right`}
          />
        </label>
      </div>
      <ApercuDuPv apercu={apercu} erreur={erreurApercu} />
      <div className="text-[11px] text-text-dim">
        Ventilation par coupure{unite ? ` (${unite})` : ''}
        {coupures.map((c, i) => (
          <div key={i} className="flex gap-2 items-center mt-1">
            <input
              value={c.valeur}
              onChange={(ev) => setCoupures(coupures.map((x, j) => (j === i ? { ...x, valeur: ev.target.value } : x)))}
              placeholder="Valeur faciale"
              className={`${CHAMP} w-[120px] text-right`}
            />
            <span>×</span>
            <input
              value={c.nombre}
              onChange={(ev) => setCoupures(coupures.map((x, j) => (j === i ? { ...x, nombre: ev.target.value } : x)))}
              placeholder="Nombre"
              className={`${CHAMP} w-[90px] text-right`}
            />
            <button type="button" onClick={() => setCoupures(coupures.filter((_, j) => j !== i))} className={BOUTON}>
              Retirer
            </button>
          </div>
        ))}
        <div className="flex items-center gap-2 mt-1">
          <button type="button" onClick={() => setCoupures([...coupures, { valeur: '', nombre: '' }])} className={BOUTON}>
            Ajouter une coupure
          </button>
          {coupures.length > 0 && <span className="tabular-nums">Total {montant(totalCoupures)}</span>}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 items-end">
        <label className="text-[11px] text-text-dim">
          Attestation établie le
          <input type="date" value={attestationLe} onChange={(ev) => setAttestationLe(ev.target.value)} className={CHAMP} />
        </label>
        <label className="text-[11px] text-text-dim">
          Signataire de l’attestation
          <input value={attestationPar} onChange={(ev) => setAttestationPar(ev.target.value)} className={CHAMP} />
        </label>
        <label className="text-[11px] text-text-dim flex-1 min-w-[220px]">
          Observations
          <input
            value={observations}
            onChange={(ev) => setObservations(ev.target.value)}
            className={`${CHAMP} w-full`}
          />
        </label>
        <button type="button" onClick={etablir} disabled={!pret} className={BOUTON_PRINCIPAL}>
          Établir le PV
        </button>
        <button type="button" onClick={fermer} className={BOUTON}>
          Annuler
        </button>
      </div>
    </div>
  );
}

/**
 * Une date du PV de caisse · lue en UTC (seconde passe A10, m). Le serveur
 * rend un jour à minuit UTC ; lu à l'heure du poste, un poste à l'ouest de
 * Greenwich affichait la veille.
 */
const jourUtc = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('fr-FR', { timeZone: 'UTC' }) : '·';

/** Un montant du PV dans son unité · la devise de la caisse quand elle en a une. */
const dansLUnite = (v: unknown, unite: string | null) => (unite ? `${montant(v)} ${unite}` : montant(v));

/**
 * L'écart DIT par un mot, jamais par la seule couleur (seconde passe A10, k).
 * Un excédent n'est pas un manquant, et un lecteur qui ne distingue pas le
 * rouge doit lire lequel des deux il a sous les yeux.
 */
function qualifierEcart(ecart: unknown): string {
  const n = Number(ecart);
  if (!Number.isFinite(n)) return '·';
  if (n === 0) return 'aucun écart';
  return n < 0 ? 'manquant' : 'excédent';
}

/** L'aperçu du PV avant de figer (seconde passe A10, a). */
function ApercuDuPv({ apercu, erreur }: { apercu: ApercuPvCaisse | null; erreur: string | null }) {
  if (erreur) return <div className="text-[11.5px] text-danger">Aperçu illisible · {erreur}</div>;
  if (apercu === null) return <div className="text-[11.5px] text-text-dim">Lecture du solde au jour du comptage…</div>;
  if (!apercu.lisible) return <div className="text-[11.5px] text-danger">Procès-verbal impossible à cette date · {apercu.motif}</div>;
  const r = apercu.reconstitution;
  return (
    <div className="text-[11.5px]">
      <table>
        <tbody>
          {r && (
            <>
              <tr>
                <th scope="row" className="pr-4 text-left font-normal text-text-dim">
                  Solde à la clôture du {jourUtc(apercu.dateCloture)}
                </th>
                <td className="text-right tabular-nums">{dansLUnite(r.soldeALaCloture, apercu.devise)}</td>
              </tr>
              {r.mouvementsValeurAvantCloture !== 0 && (
                <tr>
                  <th scope="row" className="pr-4 text-left font-normal text-text-dim">
                    Opérations à date de valeur antérieure à la clôture
                  </th>
                  <td className="text-right tabular-nums">{dansLUnite(r.mouvementsValeurAvantCloture, apercu.devise)}</td>
                </tr>
              )}
              <tr>
                <th scope="row" className="pr-4 text-left font-normal text-text-dim">
                  + Encaissements jusqu’au comptage
                </th>
                <td className="text-right tabular-nums">{dansLUnite(r.encaissementsPosterieurs, apercu.devise)}</td>
              </tr>
              <tr>
                <th scope="row" className="pr-4 text-left font-normal text-text-dim">
                  − Paiements jusqu’au comptage
                </th>
                <td className="text-right tabular-nums">{dansLUnite(r.decaissementsPosterieurs, apercu.devise)}</td>
              </tr>
            </>
          )}
          <tr>
            <th scope="row" className="pr-4 text-left font-normal text-text-dim">
              Solde qui sera figé
            </th>
            <td className="text-right tabular-nums">{dansLUnite(apercu.soldeComptable, apercu.devise)}</td>
          </tr>
        </tbody>
      </table>
      {apercu.mentions.map((m) => (
        <div key={m} className="text-warning">
          {m}
        </div>
      ))}
    </div>
  );
}

/**
 * LES PROCÈS-VERBAUX DE CAISSE ÉTABLIS, avec leur reconstitution (ligne A10).
 * Compté après la clôture, le PV montre comment le solde du livre-journal au
 * jour du comptage remonte au solde de clôture, et les espèces qui existaient
 * à la clôture · totaux FIGÉS au PV, mouvements lus à la demande, tels que le
 * PV les a lus. Rien à montrer tant qu'aucun PV n'est établi.
 */
function BlocPvCaisse({ pvs }: { pvs: ProcesVerbalCaisse[] | undefined }) {
  if (pvs === undefined || pvs.length === 0) return null;
  return (
    <div className="border border-border bg-surface mt-2">
      <div className="px-2.5 py-1.5 border-b border-border text-[11px] text-text-dim flex items-center gap-1">
        Procès-verbaux de comptage des caisses · {pvs.length}
        <Aide
          titre="Reconstitution vers la clôture"
          texte="Une caisse comptée après la clôture se compare au solde du livre-journal du jour du comptage. Le procès-verbal remonte à la clôture · solde à la clôture, plus les encaissements, moins les paiements intercalés, égale le solde au jour du comptage ; dans l’autre sens, les espèces comptées, moins les encaissements, plus les paiements, donnent les espèces existant à la clôture. L’écart est le même des deux côtés. Une caisse dont toutes les lignes portent une seule devise se compare dans cette devise ; des lignes mêlées se comparent en francs, au cours historique. Les totaux sont figés à l’établissement ; les mouvements se relisent tels que le procès-verbal les a lus."
          source="Fiche du compte 57 ; AUDCIF art. 16, al. 4 et 5, art. 42"
        />
      </div>
      {pvs.map((pv) => (
        <PvCaisse key={pv.id} pv={pv} />
      ))}
    </div>
  );
}

function PvCaisse({ pv }: { pv: ProcesVerbalCaisse }) {
  const [mouvements, setMouvements] = useState<MouvementsReconstitutionCaisse | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [lecture, setLecture] = useState(false);
  const figee = pv.soldeALaCloture !== null && pv.encaissementsPosterieurs !== null && pv.decaissementsPosterieurs !== null;
  const u = pv.unite;

  const lireMouvements = () => {
    setLecture(true);
    setErreur(null);
    api
      .get<MouvementsReconstitutionCaisse>(`/inventaire/pv-caisse/${pv.id}/mouvements`)
      .then(setMouvements, (e: Error) => {
        setMouvements(null);
        setErreur(e.message || 'Les mouvements n’ont pas pu être lus.');
      })
      .finally(() => setLecture(false));
  };

  const ligne = (libelle: string, valeur: unknown) => (
    <tr>
      <th scope="row" className="pr-4 text-left font-normal text-text-dim">
        {libelle}
      </th>
      <td className="text-right tabular-nums">{dansLUnite(valeur, u)}</td>
    </tr>
  );

  return (
    <div className="px-2.5 py-1.5 border-b border-border/40 text-[11.5px]">
      <div className="flex flex-wrap items-center gap-x-3">
        <span>
          {pv.compte.numero} <span className="text-text-dim">{pv.compte.intitule}</span>
        </span>
        <span className="text-text-dim">
          Compté le {jourUtc(pv.dateComptage)}
          {pv.heureComptage ? ` à ${pv.heureComptage}` : ''}
          {u ? ` · en ${u}` : ''}
        </span>
      </div>
      <table className="mt-1">
        <tbody>
          {figee && ligne(`Solde à la clôture du ${jourUtc(pv.dateCloture)}`, pv.soldeALaCloture)}
          {figee &&
            pv.mouvementsValeurAvantCloture !== null &&
            Number(pv.mouvementsValeurAvantCloture) !== 0 &&
            ligne('Opérations à date de valeur antérieure à la clôture', pv.mouvementsValeurAvantCloture)}
          {figee &&
            ligne(
              `+ Encaissements jusqu’au comptage (${pv.mouvementsPosterieurs ?? '·'} ligne(s) au total)`,
              pv.encaissementsPosterieurs,
            )}
          {figee && ligne('− Paiements jusqu’au comptage', pv.decaissementsPosterieurs)}
          {ligne('Solde au livre-journal au jour du comptage', pv.soldeComptableFige)}
          {ligne('Espèces comptées', pv.especesComptees)}
          {figee && ligne('Espèces reconstituées à la clôture', pv.especesReconstitueesALaCloture)}
          <tr>
            <th scope="row" className="pr-4 text-left font-normal text-text-dim">
              Écart
            </th>
            <td className={`text-right tabular-nums ${Number(pv.ecart) !== 0 ? 'text-danger' : ''}`}>
              {dansLUnite(pv.ecart, u)} · {qualifierEcart(pv.ecart)}
            </td>
          </tr>
        </tbody>
      </table>
      {pv.mentions.map((m) => (
        <div key={m} className="text-warning mt-1">
          {m}
        </div>
      ))}
      {pv.reconstitutionManquante && (
        <div className="text-warning mt-1">
          Compté après la clôture sans reconstitution figée · procès-verbal antérieur, son solde est celui qui avait été saisi.
        </div>
      )}
      {pv.compteApresLaCloture && (
        <div className="mt-1">
          <button type="button" onClick={lireMouvements} disabled={lecture} className={BOUTON}>
            {lecture ? 'Lecture…' : 'Mouvements intercalés'}
          </button>
        </div>
      )}
      {erreur && <div className="text-danger mt-1">Mouvements illisibles · {erreur}</div>}
      {mouvements && !mouvements.applicable && <div className="text-warning mt-1">{mouvements.motif}</div>}
      {mouvements && mouvements.applicable && (
        <div className="mt-1">
          {mouvements.lignes.length === 0 ? (
            <div className="text-text-dim">Aucun mouvement de caisse entre la clôture et le comptage.</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr>
                  <th scope="col" className="text-left px-2 py-1 font-normal">Date</th>
                  <th scope="col" className="text-left px-2 py-1 font-normal">Journal</th>
                  <th scope="col" className="text-left px-2 py-1 font-normal">Pièce</th>
                  <th scope="col" className="text-left px-2 py-1 font-normal">Libellé</th>
                  <th scope="col" className="text-right px-2 py-1 font-normal">Encaissement</th>
                  <th scope="col" className="text-right px-2 py-1 font-normal">Paiement</th>
                </tr>
              </thead>
              <tbody>
                {mouvements.lignes.map((l) => (
                  <tr key={l.id}>
                    <td className="px-2 py-0.5">{jourUtc(l.date)}</td>
                    <td className="px-2 py-0.5">{l.journal}</td>
                    <td className="px-2 py-0.5">{l.numeroPiece ?? '·'}</td>
                    <td className="px-2 py-0.5">{l.libelle}</td>
                    <td className="px-2 py-0.5 text-right tabular-nums">{dansLUnite(l.encaissement, mouvements.unite)}</td>
                    <td className="px-2 py-0.5 text-right tabular-nums">{dansLUnite(l.decaissement, mouvements.unite)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {mouvements.tronque && (
            <div className="text-warning mt-1">
              {mouvements.lignes.length} ligne(s) affichée(s) sur {mouvements.total} · les totaux portent sur toutes.
            </div>
          )}
          <div className="text-text-dim mt-1 tabular-nums">
            Totaux relus · solde à la clôture {dansLUnite(mouvements.soldeALaCloture, mouvements.unite)}, encaissements{' '}
            {dansLUnite(mouvements.encaissements, mouvements.unite)}, paiements {dansLUnite(mouvements.decaissements, mouvements.unite)}
          </div>
          {mouvements.concorde === false && (
            <div className="text-danger mt-1">
              Les totaux relus diffèrent des totaux figés sur le procès-verbal · le livre-journal a changé depuis son établissement.
            </div>
          )}
          {mouvements.saisiesDepuisLePv.nombre > 0 && (
            <div className="text-warning mt-1 tabular-nums">
              Saisies depuis le procès-verbal · {mouvements.saisiesDepuisLePv.nombre} ligne(s) datée(s) au plus tard du comptage,
              validée(s) après lui, net {dansLUnite(mouvements.saisiesDepuisLePv.net, mouvements.unite)}.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
