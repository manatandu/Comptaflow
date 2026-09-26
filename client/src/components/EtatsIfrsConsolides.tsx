import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useExercice } from '../lib/exercice';
import { Aide } from './chrome/Aide';
import { DeclarationEffetChange, EffetChange, FluxServi, TableauFluxIfrs } from './FluxTresorerieIfrs';
import { VariationCapitauxPropresIfrs, VariationServie } from './VariationCapitauxPropresIfrs';
import { NotesIfrs, NotesIfrsServies } from './NotesIfrs';
import { DeclarationsIfrs12, DeclarationsIfrs12Form, EntiteIfrs12 } from './DeclarationsIfrs12';

/**
 * ÉTATS IFRS CONSOLIDÉS, tranche C1 · la balance consolidée du D4C (celle de la
 * fenêtre Consolidation, jamais recalculée ici) projetée sur les rubriques
 * d'IFRS 18, puis corrigée des retraitements CONSOLIDÉS déclarés. Trois états ·
 * situation financière, compte de résultat, résultat global · avec la
 * répartition entre les propriétaires de la société mère et les participations
 * ne donnant pas le contrôle (IFRS 18 § 76, § 87, § 104 · IFRS 10 § 22).
 *
 * LA PART DES MINORITAIRES D'UN RETRAITEMENT SE DÉCLARE, effet par effet
 * (IFRS 10 § B94) · aucun livre ne dit à quelle entité du groupe un
 * retraitement se rapporte. Zéro est une réponse, le vide n'en est pas une.
 *
 * TRANCHE C2 · le tableau des flux consolidé (IAS 7), rendu par le même
 * composant que celui des comptes individuels. La trésorerie du GROUPE en
 * devises et son effet de change se déclarent ici, à part de ceux du dossier.
 *
 * TRANCHE C3 · la variation des capitaux propres, avec la colonne des
 * minoritaires (§ 107 a), par le même composant que les comptes individuels.
 * Ses mouvements sont ceux du GROUPE, jamais ceux du dossier.
 *
 * TRANCHE C4 · les notes consolidées, par le même composant que les comptes
 * individuels, plus les réponses d'IFRS 12. Leurs déclarations sont celles du
 * groupe, jamais celles du dossier.
 *
 * TRANCHE C5 · la première application consolidée (IFRS 1) se déclare pour le
 * groupe, à part des comptes individuels, avec le choix de l'exemption C1. Les
 * ajustements de transition sont des retraitements consolidés posés sur
 * l'exercice comparatif.
 */
type Rubrique = { code: string; libelle: string; ref: string; etat: 'SITUATION' | 'RESULTAT' | 'RESULTAT_GLOBAL'; section?: string };
type Ligne = { cle: string; libelle: string; ref?: string; groupe?: string; nature: 'POSTE' | 'TOTAL' | 'NON_CLASSE'; legal: number; retraitements: number; ifrs: number };
type Etats = {
  situation: Ligne[];
  resultat: Ligne[];
  resultatGlobal: Ligne[];
  nonClasses: { numero: string; intitule: string; solde: number }[];
  controles: { cle: string; libelle: string; ecart: number; ok: boolean }[];
  mentions: string[];
  motifsNonPubliable: string[];
  postes: { poste: string; libelle: string; solde: number; rubrique: string | null; fondement: string | null; declare: boolean }[];
};
type Retraitement = {
  id: string;
  libelle: string;
  fondement: string;
  lignes: { rubrique: string; montant: number }[];
  partMinoritairesResultat: number | null;
  partMinoritairesOci: number | null;
  partMinoritairesCapitauxPropres: number | null;
};
type Consolide = {
  n: Etats | null;
  motifN: string | null;
  n1: Etats | null;
  motifN1: string | null;
  reglesConsolidation: { id: string; poste: string; rubrique: string }[];
  retraitements: Retraitement[];
  rubriques: Rubrique[];
  groupes: Record<string, string>;
  postesADeclarer: { poste: string; libelle: string }[];
  fluxTresorerie: FluxServi | null;
  variationCapitauxPropres: VariationServie | null;
  premiereApplication: {
    dateTransition: string;
    ouverture: Etats;
    rapprochements: { titre: string; ref: string; lignes: { cle: string; libelle: string; fondement?: string; nature?: 'METHODE' | 'ERREUR'; montant: number }[] }[];
    mentions: string[];
  } | null;
  motifPremiereApplication: string | null;
  premierExerciceIfrsConsolideId: string | null;
  dejaAdoptantConsolide: boolean;
  exemptionRegroupementsC1: boolean | null;
  exerciceTransitionId: string | null;
  ajustementsTransition: Retraitement[];
  notes: (NotesIfrsServies & { ifrs12: DeclarationsIfrs12; entitesIfrs12: EntiteIfrs12[] }) | null;
  decouvertsDansTresorerie: boolean | null;
  tresorerieGroupeEnDevises: boolean | null;
  effetChange: EffetChange | null;
};

const champ = 'w-full border border-border px-1.5 py-1 text-[11.5px]';
const fc = (v: number | null | undefined) => (v == null ? '' : v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const nombre = (v: string) => (v.trim() === '' ? NaN : Number(v.replace(/\s/g, '').replace(',', '.')));
/** Un champ de part vide vaut `null` · « personne n'a répondu », jamais zéro. */
const part = (v: string) => (v.trim() === '' ? null : nombre(v));

export function EtatsIfrsConsolides({ exerciceId }: { exerciceId: string }) {
  const { peutEcrire } = useAuth();
  const { exercices } = useExercice();
  const [transition, setTransition] = useState(false);
  const [etat, setEtat] = useState<Consolide | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [regle, setRegle] = useState({ poste: '', rubrique: '' });
  const retrVide = { libelle: '', fondement: '', lignes: [{ rubrique: '', montant: '' }, { rubrique: '', montant: '' }], pR: '', pO: '', pC: '' };
  const [retr, setRetr] = useState(retrVide);

  const recharger = useCallback(async () => {
    try {
      setEtat(await api.get<Consolide>(`/ifrs/consolide?exerciceId=${exerciceId}`));
      setErreur(null);
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Les états IFRS consolidés n’ont pas pu être établis.');
    }
  }, [exerciceId]);
  useEffect(() => {
    void recharger();
  }, [recharger]);

  async function agir(action: () => Promise<unknown>) {
    setErreur(null);
    try {
      await action();
      await recharger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'L’opération n’a pas abouti.');
    }
  }

  if (!etat) return <p className="p-2 text-[11.5px] text-text-dim">{erreur ?? 'Chargement…'}</p>;
  const libelleRubrique = (code: string | null) => (code ? (etat.rubriques.find((r) => r.code === code)?.libelle ?? code) : 'Sans rubrique');
  const ecartRetr = retr.lignes.reduce((s, l) => s + (Number.isFinite(nombre(l.montant)) ? nombre(l.montant) : 0), 0);
  const regleDe = (poste: string) => etat.reglesConsolidation.find((r) => r.poste === poste);
  const rubriquesDeclarables = etat.rubriques.filter((r) => r.etat !== 'RESULTAT_GLOBAL' && r.code !== 'SF_PARTICIPATIONS_NE_DONNANT_PAS_CONTROLE');

  const tableau = (titre: string, lignes: Ligne[], n1: Ligne[] | null) => {
    let groupe: string | undefined;
    return (
      <section className="border border-border bg-surface px-3.5 py-2.5 mb-2.5">
        <h2 className="text-[11.5px] font-bold mb-1.5">{titre}</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-[11.5px]">
            <thead>
              <tr className="text-left border-b border-border">
                <th className="py-1 pr-2">Poste</th>
                <th className="py-1 pr-2">IFRS 18</th>
                <th className="py-1 pr-2 text-right">Consolidé D4C reclassé</th>
                <th className="py-1 pr-2 text-right">Retraitements</th>
                <th className="py-1 pr-2 text-right">IFRS N</th>
                <th className="py-1 text-right">IFRS N-1</th>
              </tr>
            </thead>
            <tbody>
              {lignes.flatMap((l) => {
                const entete = l.groupe && l.groupe !== groupe ? l.groupe : null;
                if (l.groupe) groupe = l.groupe;
                if (l.nature === 'POSTE' && l.legal === 0 && l.retraitements === 0) return [];
                return [
                  ...(entete
                    ? [
                        <tr key={`g-${l.cle}`}>
                          <td colSpan={6} className="pt-2 pb-0.5 font-semibold text-text-dim">{etat.groupes[entete] ?? entete}</td>
                        </tr>,
                      ]
                    : []),
                  <tr key={l.cle} className={l.nature === 'TOTAL' ? 'font-bold border-t border-border' : l.nature === 'NON_CLASSE' ? 'text-warning' : 'border-b border-border/40'}>
                    <td className="py-1 pr-2">{l.libelle}</td>
                    <td className="py-1 pr-2 text-text-dim">{l.ref}</td>
                    <td className="py-1 pr-2 text-right">{fc(l.legal)}</td>
                    <td className="py-1 pr-2 text-right">{l.retraitements ? fc(l.retraitements) : ''}</td>
                    <td className="py-1 pr-2 text-right">{fc(l.ifrs)}</td>
                    <td className="py-1 text-right">{n1 ? fc(n1.find((x) => x.cle === l.cle)?.ifrs ?? 0) : ''}</td>
                  </tr>,
                ];
              })}
            </tbody>
          </table>
        </div>
      </section>
    );
  };

  return (
    <div>
      <section className="border border-border bg-surface px-3.5 py-2.5 mb-2.5">
        <h2 className="text-[11.5px] font-bold mb-1.5 flex items-center gap-1.5">
          États IFRS consolidés
          <Aide
            titre="États IFRS consolidés"
            texte="La balance consolidée est celle de la fenêtre Consolidation, jamais recalculée ici. Ses comptes se rangent par les règles de correspondance des comptes individuels, uniformité des méthodes (IFRS 10 § 19) ; ses postes se rangent par IFRS 18 quand la norme nomme la ligne, et se déclarent sinon. Les participations ne donnant pas le contrôle sont présentées dans les capitaux propres, séparément (IFRS 10 § 22, IFRS 18 § 104 a), et le résultat net comme le résultat global se répartissent sous leur total (§ 76, § 87). Un retraitement consolidé déclare la part de chacun de ses effets qui revient aux minoritaires, zéro compris (IFRS 10 § B94). Le tableau des flux, la variation des capitaux propres, les notes (IFRS 12 comprise) et la première application (IFRS 1) consolidés sont servis ; ce qui n’est pas servi dans chacun est dit sur le jeu."
            source="AUDCIF art. 74 à 98 · D4C ch. XII · IFRS 10 § 19, § 22, § B94 · IFRS 18 § 76, § 87, § 104 a · IAS 7"
          />
        </h2>
        {erreur && <p className="text-[11.5px] text-danger mt-1.5">{erreur}</p>}
      </section>

      {!etat.n ? (
        <section className="border border-border bg-surface px-3.5 py-2.5 mb-2.5">
          <p className="text-[11.5px] text-warning">Le dossier ne se consolide pas pour cet exercice · {etat.motifN}</p>
        </section>
      ) : (
        <>
          <section className="border border-border bg-surface px-3.5 py-2.5 mb-2.5">
            <h2 className="text-[11.5px] font-bold mb-1.5">Postes de la consolidation</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-[11.5px]">
                <thead>
                  <tr className="text-left border-b border-border">
                    <th className="py-1 pr-2">Poste</th>
                    <th className="py-1 pr-2 text-right">Solde</th>
                    <th className="py-1 pr-2">Rubrique IFRS 18</th>
                    <th className="py-1">Fondement</th>
                  </tr>
                </thead>
                <tbody>
                  {etat.n.postes.map((p) => {
                    const r = regleDe(p.poste);
                    return (
                      <tr key={p.poste} className={p.rubrique ? 'border-b border-border/40' : 'border-b border-border/40 text-warning'}>
                        <td className="py-1 pr-2">{p.libelle}</td>
                        <td className="py-1 pr-2 text-right">{fc(p.solde)}</td>
                        <td className="py-1 pr-2">{libelleRubrique(p.rubrique)}</td>
                        <td className="py-1">
                          {p.declare ? 'Déclaré par le cabinet' : p.fondement}
                          {r && peutEcrire && (
                            <button className="ml-2 text-[11px] underline" onClick={() => void agir(() => api.delete(`/ifrs/regles-consolidation/${r.id}`))}>
                              Retirer
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {peutEcrire && (
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-1.5 mt-2">
                <select className={champ} value={regle.poste} onChange={(e) => setRegle({ ...regle, poste: e.target.value })}>
                  <option value="">Poste à déclarer…</option>
                  {etat.postesADeclarer.filter((p) => !regleDe(p.poste)).map((p) => (
                    <option key={p.poste} value={p.poste}>{p.libelle}</option>
                  ))}
                </select>
                <select className={champ} value={regle.rubrique} onChange={(e) => setRegle({ ...regle, rubrique: e.target.value })}>
                  <option value="">Rubrique…</option>
                  {rubriquesDeclarables.map((rb) => (
                    <option key={rb.code} value={rb.code}>{rb.libelle}</option>
                  ))}
                </select>
                <button
                  className="border border-border px-2.5 py-1 text-[11.5px]"
                  onClick={() =>
                    void agir(async () => {
                      await api.post('/ifrs/regles-consolidation', regle);
                      setRegle({ poste: '', rubrique: '' });
                    })
                  }
                >
                  Déclarer
                </button>
              </div>
            )}
          </section>

          <section className="border border-border bg-surface px-3.5 py-2.5 mb-2.5">
            <h2 className="text-[11.5px] font-bold mb-1.5">Retraitements consolidés</h2>
            {peutEcrire && (
              <div className="grid grid-cols-1 gap-1.5 mb-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  <input className={champ} placeholder="Libellé" value={retr.libelle} onChange={(e) => setRetr({ ...retr, libelle: e.target.value })} />
                  <input className={champ} placeholder="Fondement (ex. IFRS 3 § B63 a)" value={retr.fondement} onChange={(e) => setRetr({ ...retr, fondement: e.target.value })} />
                </div>
                {retr.lignes.map((l, i) => (
                  <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_160px] gap-1.5">
                    <select
                      className={champ}
                      value={l.rubrique}
                      onChange={(e) => setRetr({ ...retr, lignes: retr.lignes.map((x, j) => (j === i ? { ...x, rubrique: e.target.value } : x)) })}
                    >
                      <option value="">Rubrique…</option>
                      {etat.rubriques.filter((rb) => rb.code !== 'SF_PARTICIPATIONS_NE_DONNANT_PAS_CONTROLE').map((rb) => (
                        <option key={rb.code} value={rb.code}>{rb.libelle}</option>
                      ))}
                    </select>
                    <input
                      className={champ}
                      placeholder="Débit + / crédit −"
                      value={l.montant}
                      onChange={(e) => setRetr({ ...retr, lignes: retr.lignes.map((x, j) => (j === i ? { ...x, montant: e.target.value } : x)) })}
                    />
                  </div>
                ))}
                <p className="flex items-center gap-1.5 text-[11px] text-text-dim">
                  Part des participations ne donnant pas le contrôle
                  <Aide
                    titre="Part des minoritaires"
                    texte="En valeur créditrice (un profit est positif) · à renseigner pour chaque effet du retraitement, zéro compris."
                    source="IFRS 10 § B94"
                  />
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                  <input className={champ} placeholder="… de l’effet au résultat net" value={retr.pR} onChange={(e) => setRetr({ ...retr, pR: e.target.value })} />
                  <input className={champ} placeholder="… de l’effet au résultat global" value={retr.pO} onChange={(e) => setRetr({ ...retr, pO: e.target.value })} />
                  <input className={champ} placeholder="… de l’effet aux capitaux propres" value={retr.pC} onChange={(e) => setRetr({ ...retr, pC: e.target.value })} />
                </div>
                <div className="flex items-center gap-2">
                  <button className="border border-border px-2.5 py-1 text-[11.5px]" onClick={() => setRetr({ ...retr, lignes: [...retr.lignes, { rubrique: '', montant: '' }] })}>
                    Ligne de plus
                  </button>
                  <span className={Math.abs(ecartRetr) > 0.005 ? 'text-[11.5px] text-warning' : 'text-[11.5px] text-text-dim'}>Écart {fc(ecartRetr)}</span>
                  {etat.exerciceTransitionId && (
                    <label className="text-[11.5px] flex items-center gap-1">
                      <input type="checkbox" checked={transition} onChange={(e) => setTransition(e.target.checked)} />
                      Ajustement de transition (IFRS 1 § 11)
                    </label>
                  )}
                  <button
                    className="border border-border px-2.5 py-1 text-[11.5px]"
                    onClick={() =>
                      void agir(async () => {
                        await api.post('/ifrs/retraitements', {
                          exerciceId: transition && etat.exerciceTransitionId ? etat.exerciceTransitionId : exerciceId,
                          consolide: true,
                          ...(transition && etat.exerciceTransitionId ? { aLaTransition: true } : {}),
                          libelle: retr.libelle,
                          fondement: retr.fondement,
                          lignes: retr.lignes.filter((x) => x.rubrique).map((x) => ({ rubrique: x.rubrique, montant: nombre(x.montant) })),
                          partMinoritairesResultat: part(retr.pR),
                          partMinoritairesOci: part(retr.pO),
                          partMinoritairesCapitauxPropres: part(retr.pC),
                        });
                        setRetr(retrVide);
                      })
                    }
                  >
                    Enregistrer
                  </button>
                </div>
              </div>
            )}
            {etat.retraitements.length === 0 ? (
              <p className="text-[11.5px] text-text-dim">Aucun retraitement consolidé · les états IFRS sont la balance consolidée reclassée.</p>
            ) : (
              etat.retraitements.map((x) => (
                <div key={x.id} className="border-b border-border/60 py-1 text-[11.5px]">
                  <div className="flex justify-between gap-2">
                    <span>
                      <strong>{x.libelle}</strong> · {x.fondement}
                    </span>
                    {peutEcrire && (
                      <button className="text-[11px] underline" onClick={() => void agir(() => api.delete(`/ifrs/retraitements/${x.id}`))}>
                        Retirer
                      </button>
                    )}
                  </div>
                  {x.lignes.map((l, i) => (
                    <div key={i} className="flex justify-between pl-3 text-text-dim">
                      <span>{libelleRubrique(l.rubrique)}</span>
                      <span>{fc(Number(l.montant))}</span>
                    </div>
                  ))}
                  <p className="pl-3 text-text-dim">
                    Part des minoritaires · résultat {fc(x.partMinoritairesResultat) || 'à renseigner'} · résultat global{' '}
                    {fc(x.partMinoritairesOci) || '·'} · capitaux propres {fc(x.partMinoritairesCapitauxPropres) || '·'}
                  </p>
                </div>
              ))
            )}
          </section>

          <section className="border border-border bg-surface px-3.5 py-2.5 mb-2.5">
            <h2 className="text-[11.5px] font-bold mb-1.5 flex items-center gap-1.5">
              Première application aux comptes consolidés (IFRS 1)
              <Aide
                titre="Première application consolidée"
                texte="Le groupe déclare son premier exercice IFRS, à part des comptes individuels (la mère et le groupe n’adoptent pas forcément à la même date). L’état d’ouverture à la date de transition est la consolidation de clôture de l’exercice qui précède le comparatif, corrigée des ajustements de transition consolidés. Le choix de l’exemption C1 décide si l’écart d’acquisition amorti selon l’AUDCIF passe tel quel à l’ouverture."
                source="IFRS 1 § 6 à 26, § C1, § C4, § D17"
              />
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              <select
                className={champ}
                disabled={!peutEcrire}
                value={etat.dejaAdoptantConsolide ? 'DEJA' : (etat.premierExerciceIfrsConsolideId ?? '')}
                onChange={(e) =>
                  void agir(() =>
                    api.put('/ifrs/premiere-application', {
                      consolide: true,
                      premierExerciceIfrsId: e.target.value && e.target.value !== 'DEJA' ? e.target.value : null,
                      dejaAdoptant: e.target.value === 'DEJA',
                      exemptionRegroupementsC1: etat.exemptionRegroupementsC1,
                    }),
                  )
                }
              >
                <option value="">Non déclarée</option>
                <option value="DEJA">Le groupe présente déjà des états consolidés conformes aux IFRS (§ 4 et 5)</option>
                {exercices.map((x) => (
                  <option key={x.id} value={x.id}>
                    Premier exercice IFRS du groupe · {x.dateDebut.slice(0, 10)} au {x.dateFin.slice(0, 10)}
                  </option>
                ))}
              </select>
              <select
                className={champ}
                disabled={!peutEcrire || !etat.premierExerciceIfrsConsolideId}
                value={etat.exemptionRegroupementsC1 == null ? '' : etat.exemptionRegroupementsC1 ? 'OUI' : 'NON'}
                onChange={(e) =>
                  void agir(() =>
                    api.put('/ifrs/premiere-application', {
                      consolide: true,
                      premierExerciceIfrsId: etat.premierExerciceIfrsConsolideId,
                      dejaAdoptant: false,
                      exemptionRegroupementsC1: e.target.value === '' ? null : e.target.value === 'OUI',
                    }),
                  )
                }
              >
                <option value="">Regroupements passés · choix non déclaré (§ C1)</option>
                <option value="OUI">Regroupements passés non retraités selon IFRS 3 (exemption C1)</option>
                <option value="NON">Regroupements passés retraités selon IFRS 3</option>
              </select>
            </div>
            {etat.motifPremiereApplication && <p className="text-[11.5px] text-warning mt-1.5">{etat.motifPremiereApplication}</p>}
            {etat.premiereApplication && (
              <>
                <p className="text-[11.5px] mt-1.5">
                  Date de transition · <strong>{etat.premiereApplication.dateTransition}</strong> (ouverture de l’exercice comparatif, annexe A).
                </p>
                <p className="text-[11.5px] font-semibold mt-2 mb-1">Ajustements de transition consolidés</p>
                {etat.ajustementsTransition.length === 0 ? (
                  <p className="text-[11.5px] text-text-dim">Aucun ajustement · l’état d’ouverture est la consolidation de clôture reclassée.</p>
                ) : (
                  etat.ajustementsTransition.map((x) => (
                    <div key={x.id} className="flex justify-between gap-2 border-b border-border/60 py-1 text-[11.5px]">
                      <span>
                        <strong>{x.libelle}</strong> · {x.fondement}
                      </span>
                      {peutEcrire && (
                        <button className="text-[11px] underline" onClick={() => void agir(() => api.delete(`/ifrs/retraitements/${x.id}`))}>
                          Retirer
                        </button>
                      )}
                    </div>
                  ))
                )}
                {etat.premiereApplication.rapprochements.map((rp) => (
                  <div key={rp.ref} className="mt-2">
                    <p className="text-[11.5px] font-semibold mb-1">
                      {rp.titre} ({rp.ref})
                    </p>
                    <table className="w-full text-[11.5px]">
                      <tbody>
                        {rp.lignes.map((l) => (
                          <tr
                            key={l.cle}
                            className={l.cle === 'ECART' ? 'text-danger font-semibold' : l.cle === 'DEPART' || l.cle === 'ARRIVEE' ? 'font-bold border-t border-border' : 'border-b border-border/40'}
                          >
                            <td className="py-1 pr-2">
                              {l.libelle}
                              {l.nature === 'ERREUR' ? ' · correction d’erreur (§ 26)' : l.nature === 'METHODE' ? ' · changement de méthode' : ''}
                            </td>
                            <td className="py-1 pr-2 text-text-dim">{l.fondement}</td>
                            <td className="py-1 text-right">{fc(l.montant)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
                {etat.premiereApplication.mentions.map((m) => <p key={m} className="text-[11.5px] text-text-dim mt-1">{m}</p>)}
              </>
            )}
          </section>

          {etat.premiereApplication &&
            tableau(`État consolidé de la situation financière d’ouverture au ${etat.premiereApplication.dateTransition} (IFRS 1 § 6)`, etat.premiereApplication.ouverture.situation, null)}

          {tableau('État consolidé de la situation financière', etat.n.situation, etat.n1?.situation ?? null)}
          {tableau('Compte de résultat consolidé', etat.n.resultat, etat.n1?.resultat ?? null)}
          {tableau('État consolidé présentant le résultat global', etat.n.resultatGlobal, etat.n1?.resultatGlobal ?? null)}
          {etat.motifN1 && <p className="text-[11.5px] text-text-dim mb-2">{etat.motifN1}</p>}

          {etat.variationCapitauxPropres && (
            <VariationCapitauxPropresIfrs
              titre="État consolidé des variations des capitaux propres (IFRS 18 § 107 à 112)"
              vcp={etat.variationCapitauxPropres}
              consolide
              exerciceId={exerciceId}
              peutEcrire={peutEcrire}
              agir={agir}
            />
          )}

          {etat.fluxTresorerie && (
            <section className="border border-border bg-surface px-3.5 py-2.5 mb-2.5">
              <h2 className="text-[11.5px] font-bold mb-1.5 flex items-center gap-1.5">
                Tableau consolidé des flux de trésorerie (IAS 7, modifiée par IFRS 18)
                <Aide
                  titre="Tableau consolidé des flux de trésorerie"
                  texte="Il part du tableau des flux consolidé du D4C (ch. XII-8 § 4) et en garde les refus · un périmètre ou un pourcentage d’intérêt qui a changé depuis l’exercice précédent, ou une entité convertie, l’arrête. Les dividendes reçus des entités mises en équivalence passent à l’investissement, ceux versés aux participations ne donnant pas le contrôle au financement. Les découverts suivent la déclaration faite dans les comptes individuels (uniformité des méthodes) ; la trésorerie du groupe en devises et son effet de change se déclarent ici."
                  source="IAS 7 § 28, § 33A, § 34A b, § 38, § 39 à 42A · IFRS 10 § 19 · D4C ch. XII-8 § 4"
                />
              </h2>
              <label className="text-[11.5px] block mb-2 max-w-[420px]">
                La trésorerie du groupe comprend des soldes en devises (§ 28)
                <select
                  className={champ}
                  disabled={!peutEcrire}
                  value={etat.tresorerieGroupeEnDevises == null ? '' : etat.tresorerieGroupeEnDevises ? 'OUI' : 'NON'}
                  onChange={(e) =>
                    void agir(() => api.put('/ifrs/tresorerie', { tresorerieGroupeEnDevises: e.target.value === '' ? null : e.target.value === 'OUI' }))
                  }
                >
                  <option value="">Non déclaré</option>
                  <option value="OUI">Oui</option>
                  <option value="NON">Non</option>
                </select>
              </label>
              {etat.tresorerieGroupeEnDevises && (
                <DeclarationEffetChange exerciceId={exerciceId} effetChange={etat.effetChange} consolide peutEcrire={peutEcrire} agir={agir} />
              )}
              <TableauFluxIfrs flux={etat.fluxTresorerie} />
            </section>
          )}

          {etat.notes && (
            <>
              <DeclarationsIfrs12Form
                key={`ifrs12-${exerciceId}`}
                exerciceId={exerciceId}
                declarations={etat.notes.ifrs12}
                entites={etat.notes.entitesIfrs12}
                apresEnregistrement={recharger}
              />
              <NotesIfrs notes={etat.notes} exerciceId={exerciceId} rubriques={etat.rubriques} apresEnregistrement={recharger} consolide />
            </>
          )}

          <section className="border border-border bg-surface px-3.5 py-2.5 mb-2.5">
            <h2 className="text-[11.5px] font-bold mb-1.5">Contrôles et publication</h2>
            {etat.n.controles.map((c) => (
              <p key={c.cle} className={c.ok ? 'text-[11.5px] text-text-dim' : 'text-[11.5px] text-danger'}>
                {c.ok ? 'Vérifié' : `Écart ${fc(c.ecart)}`} · {c.libelle}
              </p>
            ))}
            {etat.n.nonClasses.length > 0 && (
              <p className="text-[11.5px] text-warning mt-1.5">Sans rubrique · {etat.n.nonClasses.map((c) => `${c.numero} (${fc(c.solde)})`).join(', ')}</p>
            )}
            {etat.n.motifsNonPubliable.length > 0 && (
              <details className="mt-1.5">
                <summary className="cursor-pointer text-[11.5px] font-semibold text-warning">
                  Non publiable en l’état · {etat.n.motifsNonPubliable.length} motif(s)
                </summary>
                <ul className="list-disc pl-5 text-[11.5px] text-warning">
                  {etat.n.motifsNonPubliable.map((m) => <li key={m}>{m}</li>)}
                </ul>
              </details>
            )}
            {etat.n.mentions.map((m) => <p key={m} className="text-[11.5px] text-text-dim mt-1">{m}</p>)}
          </section>
        </>
      )}
    </div>
  );
}
