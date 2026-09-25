import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useExercice } from '../lib/exercice';
import { NotesIfrs, NotesIfrsServies } from '../components/NotesIfrs';

/**
 * ÉTATS IFRS EN SUS DU JEU LÉGAL · item 15, tranche 1 (AUDCIF art. 73-1,
 * IFRS 18). Le grand livre reste SYSCOHADA · les états IFRS sont la balance
 * légale projetée par des règles de correspondance déclarées, plus des
 * retraitements déclarés, posés à côté. Trois colonnes par poste, pour que le
 * passage d'un référentiel à l'autre se lise ligne à ligne.
 *
 * TRANCHE 2 · l'état présentant le résultat global suit immédiatement le compte
 * de résultat (§ 12 b), et l'état des variations des capitaux propres
 * rapproche l'ouverture de la clôture composante par composante (§ 107). Les
 * apports, distributions, transferts et effets IAS 8 se DÉCLARENT · ce que rien
 * n'explique reste sur une ligne « écart non expliqué ».
 *
 * TRANCHE 4 · la première application (IFRS 1) se déclare · le premier
 * exercice IFRS, ou le fait que l'entité applique déjà les IFRS. Sur le premier
 * exercice, l'écran rend l'état de la situation financière d'ouverture à la
 * date de transition (§ 6) et les trois rapprochements du § 24, et les
 * ajustements de transition se posent sur l'exercice comparatif (§ 11).
 *
 * TRANCHE 3 · l'état des flux de trésorerie (IAS 7 modifiée par IFRS 18),
 * méthode indirecte à partir du résultat d'exploitation, bâti sur les flux
 * réels du tableau SYSCOHADA. Les découverts (§ 8), la présence de devises et
 * l'effet de change (§ 28) se déclarent.
 *
 * TRANCHE 5 · les notes d'IFRS 18 et d'IAS 8 (`components/NotesIfrs.tsx`), et
 * la colonne « Note » des états, qui renvoie à celles qui concernent chaque
 * poste (§ 114).
 */
type Rubrique = { code: string; libelle: string; ref: string; etat: 'SITUATION' | 'RESULTAT' | 'RESULTAT_GLOBAL'; section?: string; categorie?: string };
type LigneVariation = { cle: string; libelle: string; ref?: string; nature: 'SOLDE' | 'MOUVEMENT' | 'TOTAL' | 'ECART'; capital: number; reserves: number; autres: number; total: number };
type Variation = { lignes: LigneVariation[]; mentions: string[]; motifsNonPubliable: string[] };
type TypeMouvement = 'CHANGEMENT_METHODE' | 'CORRECTION_ERREUR' | 'APPORT' | 'DISTRIBUTION' | 'TRANSFERT';
type Composante = 'CAPITAL' | 'RESERVES' | 'AUTRES_COMPOSANTES';
const TYPES_MOUVEMENT: Record<TypeMouvement, string> = {
  APPORT: 'Apport des propriétaires (§ 107 c iii)',
  DISTRIBUTION: 'Distribution aux propriétaires (§ 107 c iii)',
  TRANSFERT: 'Transfert entre composantes',
  CHANGEMENT_METHODE: 'Changement de méthode comptable (§ 107 b, IAS 8)',
  CORRECTION_ERREUR: 'Correction d’erreur (§ 107 b, IAS 8)',
};
type Ligne = {
  cle: string;
  libelle: string;
  ref?: string;
  groupe?: string;
  nature: 'POSTE' | 'TOTAL' | 'NON_CLASSE';
  legal: number;
  retraitements: number;
  ifrs: number;
  comptes?: { numero: string; intitule: string; solde: number }[];
};
type Etats = {
  situation: Ligne[];
  resultat: Ligne[];
  resultatGlobal: Ligne[];
  nonClasses: { numero: string; intitule: string; solde: number }[];
  rapprochements: {
    resultatSyscohada: number;
    retraitementsResultat: number;
    resultatIfrs: number;
    capitauxPropresSyscohada: number;
    retraitementsCapitauxPropres: number;
    capitauxPropresIfrs: number;
  };
  controles: { cle: string; libelle: string; ecart: number; ok: boolean }[];
  mentions: string[];
  motifsNonPubliable: string[];
};
type Retraitement = { id: string; libelle: string; fondement: string; correctionErreur: boolean; lignes: { rubrique: string; montant: number }[] };
type Rapprochement = {
  titre: string;
  ref: string;
  lignes: { cle: string; libelle: string; fondement?: string; nature?: 'METHODE' | 'ERREUR'; montant: number }[];
  ecart: number;
};
type LigneFlux = { cle: string; libelle: string; ref?: string; section: string; nature: 'FLUX' | 'TOTAL' | 'SOLDE' | 'ECART'; montant: number };
type Flux = {
  lignes: LigneFlux[];
  rapprochementSituation: { cle: string; libelle: string; montant: number }[];
  rapprochementLegal: { activite: string; syscohada: number; ifrs: number; ecart: number }[];
  mentions: string[];
};
type CategorieChange = 'OPERATIONNELLE' | 'INVESTISSEMENT' | 'FINANCEMENT';
const CATEGORIES_CHANGE: Record<CategorieChange, string> = {
  OPERATIONNELLE: 'Catégorie « exploitation »',
  INVESTISSEMENT: 'Catégorie « investissement »',
  FINANCEMENT: 'Catégorie « financement »',
};
const booleen = (v: boolean | null) => (v == null ? '' : v ? 'OUI' : 'NON');
const deBooleen = (v: string) => (v === '' ? null : v === 'OUI');
type Etat = {
  notes: NotesIfrsServies;
  decouvertsDansTresorerie: boolean | null;
  tresorerieEnDevises: boolean | null;
  effetChange: { montant: number | string; categorie: CategorieChange; justification: string } | null;
  fluxTresorerie: { n: Flux | null; motifN: string | null; n1: Flux | null; motifN1: string | null };
  activitePrincipale: 'AUCUNE' | 'INVESTIR_ACTIFS' | 'FINANCER_CLIENTS' | null;
  premierExerciceIfrsId: string | null;
  dejaAdoptant: boolean;
  exerciceTransitionId: string | null;
  ajustementsTransition: Retraitement[];
  premiereApplication: { dateTransition: string; ouverture: Etats; rapprochements: Rapprochement[]; mentions: string[] } | null;
  motifPremiereApplication: string | null;
  regles: { id: string; prefixe: string; rubrique: string }[];
  retraitements: Retraitement[];
  rubriques: Rubrique[];
  groupes: Record<string, string>;
  n: Etats;
  n1: Etats | null;
  motifN1: string | null;
  variationCapitauxPropres: {
    composantes: Record<Composante, { libelle: string }>;
    n: Variation | null;
    motifN: string | null;
    n1: Variation | null;
    motifN1: string | null;
    mouvements: { id: string; type: TypeMouvement; composante: Composante; montant: number; libelle: string; justification: string }[];
  };
};

const champ = 'w-full border border-border px-1.5 py-1 text-[12px]';
const fc = (v: number | null | undefined) => (v == null ? '' : v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const nombre = (v: string) => (v.trim() === '' ? NaN : Number(v.replace(/\s/g, '').replace(',', '.')));

export function EtatsIfrsPage() {
  const { peutEcrire } = useAuth();
  const { exerciceCourant, exercices } = useExercice();
  const exerciceId = exerciceCourant?.id;
  const [etat, setEtat] = useState<Etat | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [regle, setRegle] = useState({ prefixe: '', rubrique: '' });
  const [mvt, setMvt] = useState({ type: 'DISTRIBUTION' as TypeMouvement, composante: 'RESERVES' as Composante, montant: '', libelle: '', justification: '' });
  const [change, setChange] = useState({ montant: '', categorie: 'FINANCEMENT' as CategorieChange, justification: '' });
  const retrVide = { libelle: '', fondement: '', aLaTransition: false, correctionErreur: false, lignes: [{ rubrique: '', montant: '' }, { rubrique: '', montant: '' }] };
  const [retr, setRetr] = useState(retrVide);

  const recharger = useCallback(async () => {
    if (!exerciceId) return;
    try {
      setEtat(await api.get<Etat>(`/ifrs?exerciceId=${exerciceId}`));
      setErreur(null);
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Les états IFRS n’ont pas pu être établis.');
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

  if (!exerciceId) return <p className="p-2 text-[12px] text-text-dim">Aucun exercice sélectionné.</p>;
  if (!etat) return <p className="p-2 text-[12px] text-text-dim">{erreur ?? 'Chargement…'}</p>;
  const libelleRubrique = (code: string) => etat.rubriques.find((r) => r.code === code)?.libelle ?? code;
  const ecartRetr = retr.lignes.reduce((s, l) => s + (Number.isFinite(nombre(l.montant)) ? nombre(l.montant) : 0), 0);

  // § 114 · les renvois ne valent que pour les états de l'exercice, pas pour
  // l'état d'ouverture de la transition.
  const tableau = (titre: string, lignes: Ligne[], n1: Ligne[] | null, colonne = 'IFRS N', renvois: Record<string, number[]> | null = etat.notes.renvois) => {
    let groupe: string | undefined;
    return (
      <section className="border border-border bg-surface px-3.5 py-2.5 mb-2.5">
        <h2 className="text-[12.5px] font-bold mb-1.5">{titre}</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left border-b border-border">
                <th className="py-1 pr-2">Poste</th>
                <th className="py-1 pr-2">IFRS 18</th>
                {renvois && <th className="py-1 pr-2">Note</th>}
                <th className="py-1 pr-2 text-right">SYSCOHADA reclassé</th>
                <th className="py-1 pr-2 text-right">Retraitements</th>
                <th className="py-1 pr-2 text-right">{colonne}</th>
                <th className="py-1 text-right">IFRS N-1</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((l) => {
                const entete = l.groupe && l.groupe !== groupe ? l.groupe : null;
                if (l.groupe) groupe = l.groupe;
                const vide = l.nature === 'POSTE' && l.legal === 0 && l.retraitements === 0;
                if (vide && !(l.comptes?.length)) return null;
                return (
                  <>
                    {entete && (
                      <tr key={`g-${l.cle}`}>
                        <td colSpan={renvois ? 7 : 6} className="pt-2 pb-0.5 font-semibold text-text-dim">{etat.groupes[entete] ?? entete}</td>
                      </tr>
                    )}
                    <tr key={l.cle} className={l.nature === 'TOTAL' ? 'font-bold border-t border-border' : l.nature === 'NON_CLASSE' ? 'text-warning' : 'border-b border-border/40'}>
                      <td className="py-1 pr-2" title={l.comptes?.map((c) => `${c.numero} ${fc(c.solde)}`).join('\n')}>{l.libelle}</td>
                      <td className="py-1 pr-2 text-text-dim">{l.ref}</td>
                      {renvois && <td className="py-1 pr-2">{renvois[l.cle]?.join(', ')}</td>}
                      <td className="py-1 pr-2 text-right">{fc(l.legal)}</td>
                      <td className="py-1 pr-2 text-right">{l.retraitements ? fc(l.retraitements) : ''}</td>
                      <td className="py-1 pr-2 text-right">{fc(l.ifrs)}</td>
                      <td className="py-1 text-right">{n1 ? fc(n1.find((x) => x.cle === l.cle)?.ifrs ?? 0) : ''}</td>
                    </tr>
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    );
  };

  const vcp = etat.variationCapitauxPropres;
  const blocVariation = (titre: string, v: Variation | null, motif: string | null) => (
    <div className="mb-2">
      <p className="text-[12px] font-semibold mb-1">{titre}</p>
      {!v ? (
        <p className="text-[12px] text-warning">{motif}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left border-b border-border">
                <th className="py-1 pr-2">Mouvement</th>
                <th className="py-1 pr-2">IFRS 18</th>
                <th className="py-1 pr-2 text-right">{vcp.composantes.CAPITAL.libelle}</th>
                <th className="py-1 pr-2 text-right">{vcp.composantes.RESERVES.libelle}</th>
                <th className="py-1 pr-2 text-right">{vcp.composantes.AUTRES_COMPOSANTES.libelle}</th>
                <th className="py-1 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {v.lignes.map((l) => (
                <tr
                  key={l.cle}
                  className={l.nature === 'ECART' ? 'text-danger font-semibold' : l.nature === 'MOUVEMENT' ? 'border-b border-border/40' : 'font-bold border-t border-border'}
                >
                  <td className="py-1 pr-2">{l.libelle}</td>
                  <td className="py-1 pr-2 text-text-dim">{l.ref}</td>
                  <td className="py-1 pr-2 text-right">{fc(l.capital)}</td>
                  <td className="py-1 pr-2 text-right">{fc(l.reserves)}</td>
                  <td className="py-1 pr-2 text-right">{fc(l.autres)}</td>
                  <td className="py-1 text-right">{fc(l.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  const listeRetraitement = (x: Retraitement) => (
    <div key={x.id} className="border-b border-border/60 py-1 text-[12px]">
      <div className="flex justify-between gap-2">
        <span>
          <strong>{x.libelle}</strong> · {x.fondement}
          {x.correctionErreur ? ' · correction d’erreur (IFRS 1 § 26)' : ''}
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
          <span>{fc(l.montant)}</span>
        </div>
      ))}
    </div>
  );

  const r = etat.n.rapprochements;
  return (
    <div className="p-2 max-w-[1100px]">
      <section className="border border-border bg-surface px-3.5 py-2.5 mb-2.5">
        <h2 className="text-[12.5px] font-bold mb-1.5">États IFRS en sus du jeu légal</h2>
        <p className="text-[11px] text-text-dim leading-[1.6]">
          Les entités dont les titres sont cotés ou qui font appel public à l’épargne déposent, <strong>en sus</strong> des
          états SYSCOHADA, des états établis selon les normes IFRS (AUDCIF art. 73-1). Le grand livre reste SYSCOHADA et rien
          n’y est écrit · chaque compte est rangé dans une rubrique d’IFRS 18 par une règle que vous déclarez (le plus long
          préfixe l’emporte), et chaque écart de norme se déclare en retraitement équilibré, avec la norme qui le fonde. Un
          compte de gestion va au compte de résultat, un compte de bilan à l’état de la situation financière · un reclassement
          de l’un vers l’autre passe par un retraitement. Charges présentées par nature (IFRS 18 § 78 a). Les autres éléments
          du résultat global n’ont aucun compte au SYSCOHADA · ils entrent par retraitement, avec la norme qui les fait sortir
          du résultat net (§ B86-B87).
        </p>
        {erreur && <p className="text-[12px] text-danger mt-1.5">{erreur}</p>}
        {etat.n.motifsNonPubliable.length > 0 && (
          <div className="mt-1.5">
            <p className="text-[12px] font-semibold text-warning">Non publiable</p>
            {etat.n.motifsNonPubliable.map((m) => <p key={m} className="text-[12px] text-warning">· {m}</p>)}
          </div>
        )}
        {etat.n.mentions.map((m) => <p key={m} className="text-[12px] text-text-dim mt-1">{m}</p>)}
      </section>

      <section className="border border-border bg-surface px-3.5 py-2.5 mb-2.5">
        <h2 className="text-[12.5px] font-bold mb-1.5">Activité principale (IFRS 18 § 49 à 51)</h2>
        <select
          className={champ + ' max-w-[520px]'}
          disabled={!peutEcrire}
          value={etat.activitePrincipale ?? ''}
          onChange={(e) => void agir(() => api.put('/ifrs/activite', { activitePrincipale: e.target.value || null }))}
        >
          <option value="">Non déclarée</option>
          <option value="AUCUNE">Aucune activité principale spécifiée</option>
          <option value="INVESTIR_ACTIFS">Investir dans des actifs, à titre d’activité principale</option>
          <option value="FINANCER_CLIENTS">Financer des clients, à titre d’activité principale</option>
        </select>
      </section>

      <section className="border border-border bg-surface px-3.5 py-2.5 mb-2.5">
        <h2 className="text-[12.5px] font-bold mb-1.5">Règles de correspondance</h2>
        {peutEcrire && (
          <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr_auto] gap-1.5 mb-2">
            <input className={champ} placeholder="Préfixe (ex. 24)" value={regle.prefixe} onChange={(e) => setRegle({ ...regle, prefixe: e.target.value })} />
            <select className={champ} value={regle.rubrique} onChange={(e) => setRegle({ ...regle, rubrique: e.target.value })}>
              <option value="">Rubrique IFRS 18…</option>
              {etat.rubriques
                .filter((rb) => rb.etat !== 'RESULTAT_GLOBAL')
                .map((rb) => (
                  <option key={rb.code} value={rb.code}>
                    {rb.etat === 'SITUATION' ? 'Situation' : 'Résultat'} · {rb.libelle} ({rb.ref})
                  </option>
                ))}
            </select>
            <button
              className="border border-border px-2.5 py-1 text-[12px]"
              disabled={!regle.prefixe || !regle.rubrique}
              onClick={() =>
                void agir(async () => {
                  await api.post('/ifrs/regles', regle);
                  setRegle({ prefixe: '', rubrique: '' });
                })
              }
            >
              Ajouter
            </button>
          </div>
        )}
        {etat.regles.length === 0 ? (
          <p className="text-[12px] text-text-dim">Aucune règle · tous les comptes sont sans rubrique.</p>
        ) : (
          <table className="w-full text-[12px]">
            <tbody>
              {etat.regles.map((x) => (
                <tr key={x.id} className="border-b border-border/60">
                  <td className="py-1 pr-2 w-[120px]">{x.prefixe}</td>
                  <td className="py-1 pr-2">{libelleRubrique(x.rubrique)}</td>
                  <td className="py-1 text-right">
                    {peutEcrire && (
                      <button className="text-[11px] underline" onClick={() => void agir(() => api.delete(`/ifrs/regles/${x.id}`))}>
                        Retirer
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {etat.n.nonClasses.length > 0 && (
          <p className="text-[12px] text-warning mt-1.5">
            Sans rubrique · {etat.n.nonClasses.map((c) => `${c.numero} (${fc(c.solde)})`).join(', ')}
          </p>
        )}
      </section>

      <section className="border border-border bg-surface px-3.5 py-2.5 mb-2.5">
        <h2 className="text-[12.5px] font-bold mb-1.5">Retraitements de l’exercice</h2>
        {peutEcrire && (
          <div className="grid grid-cols-1 gap-1.5 mb-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              <input className={champ} placeholder="Libellé" value={retr.libelle} onChange={(e) => setRetr({ ...retr, libelle: e.target.value })} />
              <input className={champ} placeholder="Fondement (norme et paragraphe, ex. IFRS 16 § 22)" value={retr.fondement} onChange={(e) => setRetr({ ...retr, fondement: e.target.value })} />
            </div>
            {retr.lignes.map((l, i) => (
              <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_160px] gap-1.5">
                <select
                  className={champ}
                  value={l.rubrique}
                  onChange={(e) => setRetr({ ...retr, lignes: retr.lignes.map((x, j) => (j === i ? { ...x, rubrique: e.target.value } : x)) })}
                >
                  <option value="">Rubrique…</option>
                  {etat.rubriques.map((rb) => (
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
            <div className="flex flex-wrap items-center gap-3 text-[12px]">
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={retr.correctionErreur} onChange={(e) => setRetr({ ...retr, correctionErreur: e.target.checked })} />
                Correction d’erreur du référentiel antérieur (IFRS 1 § 26)
              </label>
              {etat.exerciceTransitionId && (
                <label className="flex items-center gap-1">
                  <input type="checkbox" checked={retr.aLaTransition} onChange={(e) => setRetr({ ...retr, aLaTransition: e.target.checked })} />
                  Ajustement de transition, aux capitaux propres d’ouverture (IFRS 1 § 11)
                </label>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button className="border border-border px-2.5 py-1 text-[12px]" onClick={() => setRetr({ ...retr, lignes: [...retr.lignes, { rubrique: '', montant: '' }] })}>
                Ligne de plus
              </button>
              <span className={Math.abs(ecartRetr) > 0.005 ? 'text-[12px] text-warning' : 'text-[12px] text-text-dim'}>Écart {fc(ecartRetr)}</span>
              <button
                className="border border-border px-2.5 py-1 text-[12px]"
                onClick={() =>
                  void agir(async () => {
                    // Un ajustement de transition se pose sur l'exercice comparatif, dont
                    // l'ouverture est la date de transition (IFRS 1, annexe A).
                    await api.post('/ifrs/retraitements', {
                      exerciceId: retr.aLaTransition && etat.exerciceTransitionId ? etat.exerciceTransitionId : exerciceId,
                      libelle: retr.libelle,
                      fondement: retr.fondement,
                      aLaTransition: retr.aLaTransition,
                      correctionErreur: retr.correctionErreur,
                      lignes: retr.lignes.filter((x) => x.rubrique).map((x) => ({ rubrique: x.rubrique, montant: nombre(x.montant) })),
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
          <p className="text-[12px] text-text-dim">Aucun retraitement · les états IFRS sont la balance légale reclassée.</p>
        ) : (
          etat.retraitements.map((x) => listeRetraitement(x))
        )}
      </section>

      <section className="border border-border bg-surface px-3.5 py-2.5 mb-2.5">
        <h2 className="text-[12.5px] font-bold mb-1.5">Première application des IFRS (IFRS 1)</h2>
        <select
          className={champ + ' max-w-[520px]'}
          disabled={!peutEcrire}
          value={etat.dejaAdoptant ? 'DEJA' : (etat.premierExerciceIfrsId ?? '')}
          onChange={(e) =>
            void agir(() =>
              api.put('/ifrs/premiere-application', {
                premierExerciceIfrsId: e.target.value && e.target.value !== 'DEJA' ? e.target.value : null,
                dejaAdoptant: e.target.value === 'DEJA',
              }),
            )
          }
        >
          <option value="">Non déclarée</option>
          <option value="DEJA">L’entité présente déjà des états conformes aux IFRS (§ 4 et 5)</option>
          {exercices.map((x) => (
            <option key={x.id} value={x.id}>
              Premier exercice IFRS · {x.dateDebut.slice(0, 10)} au {x.dateFin.slice(0, 10)}
            </option>
          ))}
        </select>
        {etat.motifPremiereApplication && <p className="text-[12px] text-warning mt-1.5">{etat.motifPremiereApplication}</p>}
        {etat.premiereApplication && (
          <>
            <p className="text-[12px] mt-1.5">
              Date de transition · <strong>{etat.premiereApplication.dateTransition}</strong> (ouverture de l’exercice comparatif, annexe A).
            </p>
            <p className="text-[12px] font-semibold mt-2 mb-1">Ajustements de transition</p>
            {etat.ajustementsTransition.length === 0 ? (
              <p className="text-[12px] text-text-dim">Aucun ajustement · l’état d’ouverture est la balance d’ouverture légale reclassée.</p>
            ) : (
              etat.ajustementsTransition.map((x) => listeRetraitement(x))
            )}
            {etat.premiereApplication.rapprochements.map((rp) => (
              <div key={rp.ref} className="mt-2">
                <p className="text-[12px] font-semibold mb-1">
                  {rp.titre} ({rp.ref})
                </p>
                <table className="w-full text-[12px]">
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
            {etat.premiereApplication.mentions.map((m) => <p key={m} className="text-[12px] text-text-dim mt-1">{m}</p>)}
          </>
        )}
      </section>

      {etat.premiereApplication && tableau(`État de la situation financière d’ouverture au ${etat.premiereApplication.dateTransition} (IFRS 1 § 6)`, etat.premiereApplication.ouverture.situation, null, 'IFRS ouverture', null)}

      {tableau('État de la situation financière', etat.n.situation, etat.n1?.situation ?? null)}
      {tableau('Compte de résultat', etat.n.resultat, etat.n1?.resultat ?? null)}
      {tableau('État présentant le résultat global', etat.n.resultatGlobal, etat.n1?.resultatGlobal ?? null)}
      {etat.motifN1 && <p className="text-[12px] text-text-dim mb-2">{etat.motifN1}</p>}

      <section className="border border-border bg-surface px-3.5 py-2.5 mb-2.5">
        <h2 className="text-[12.5px] font-bold mb-1.5">État des variations des capitaux propres (IFRS 18 § 107 à 112)</h2>
        {blocVariation('Exercice N', vcp.n, vcp.motifN)}
        {blocVariation('Exercice N-1 (comparatif, § 10 f)', vcp.n1, vcp.motifN1)}
        <p className="text-[12px] font-semibold mt-2 mb-1">Mouvements déclarés de l’exercice</p>
        {peutEcrire && (
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_140px] gap-1.5 mb-1.5">
            <select className={champ} value={mvt.type} onChange={(e) => setMvt({ ...mvt, type: e.target.value as TypeMouvement })}>
              {(Object.keys(TYPES_MOUVEMENT) as TypeMouvement[]).map((t) => (
                <option key={t} value={t}>{TYPES_MOUVEMENT[t]}</option>
              ))}
            </select>
            <select className={champ} value={mvt.composante} onChange={(e) => setMvt({ ...mvt, composante: e.target.value as Composante })}>
              {(Object.keys(vcp.composantes) as Composante[]).map((c) => (
                <option key={c} value={c}>{vcp.composantes[c].libelle}</option>
              ))}
            </select>
            <input className={champ} placeholder="Hausse + / baisse −" value={mvt.montant} onChange={(e) => setMvt({ ...mvt, montant: e.target.value })} />
            <input className={champ} placeholder="Libellé" value={mvt.libelle} onChange={(e) => setMvt({ ...mvt, libelle: e.target.value })} />
            <input className={champ} placeholder="Justification (procès-verbal, décision, note IAS 8)" value={mvt.justification} onChange={(e) => setMvt({ ...mvt, justification: e.target.value })} />
            <button
              className="border border-border px-2.5 py-1 text-[12px]"
              onClick={() =>
                void agir(async () => {
                  await api.post('/ifrs/mouvements-capitaux-propres', { exerciceId, ...mvt, montant: nombre(mvt.montant) });
                  setMvt({ ...mvt, montant: '', libelle: '', justification: '' });
                })
              }
            >
              Déclarer
            </button>
          </div>
        )}
        {vcp.mouvements.length === 0 ? (
          <p className="text-[12px] text-text-dim">Aucun mouvement déclaré · la variation n’est expliquée que par le résultat global.</p>
        ) : (
          vcp.mouvements.map((m) => (
            <div key={m.id} className="flex justify-between gap-2 border-b border-border/60 py-1 text-[12px]">
              <span>
                <strong>{m.libelle}</strong> · {TYPES_MOUVEMENT[m.type]} · {vcp.composantes[m.composante].libelle} · {fc(m.montant)} · {m.justification}
              </span>
              {peutEcrire && (
                <button className="text-[11px] underline" onClick={() => void agir(() => api.delete(`/ifrs/mouvements-capitaux-propres/${m.id}`))}>
                  Retirer
                </button>
              )}
            </div>
          ))
        )}
      </section>

      <section className="border border-border bg-surface px-3.5 py-2.5 mb-2.5">
        <h2 className="text-[12.5px] font-bold mb-1.5">État des flux de trésorerie (IAS 7, modifiée par IFRS 18)</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mb-2">
          <label className="text-[12px]">
            Découverts bancaires remboursables à vue, partie intégrante de la gestion de trésorerie (§ 8)
            <select
              className={champ}
              disabled={!peutEcrire}
              value={booleen(etat.decouvertsDansTresorerie)}
              onChange={(e) =>
                void agir(() => api.put('/ifrs/tresorerie', { decouvertsDansTresorerie: deBooleen(e.target.value), tresorerieEnDevises: etat.tresorerieEnDevises }))
              }
            >
              <option value="">Non déclaré</option>
              <option value="OUI">Oui · ils font partie de la trésorerie</option>
              <option value="NON">Non · ce sont des financements</option>
            </select>
          </label>
          <label className="text-[12px]">
            La trésorerie comprend des soldes en devises (§ 28)
            <select
              className={champ}
              disabled={!peutEcrire}
              value={booleen(etat.tresorerieEnDevises)}
              onChange={(e) =>
                void agir(() => api.put('/ifrs/tresorerie', { decouvertsDansTresorerie: etat.decouvertsDansTresorerie, tresorerieEnDevises: deBooleen(e.target.value) }))
              }
            >
              <option value="">Non déclaré</option>
              <option value="OUI">Oui</option>
              <option value="NON">Non</option>
            </select>
          </label>
        </div>
        {etat.tresorerieEnDevises && (
          <div className="mb-2">
            <p className="text-[12px] font-semibold mb-1">Effet des variations des cours de change sur la trésorerie de l’exercice (§ 28)</p>
            {etat.effetChange ? (
              <div className="flex justify-between gap-2 text-[12px]">
                <span>
                  {fc(Number(etat.effetChange.montant))} · {CATEGORIES_CHANGE[etat.effetChange.categorie]} · {etat.effetChange.justification}
                </span>
                {peutEcrire && (
                  <button className="text-[11px] underline" onClick={() => void agir(() => api.delete(`/ifrs/effet-change/${exerciceId}`))}>
                    Retirer
                  </button>
                )}
              </div>
            ) : (
              peutEcrire && (
                <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr_1fr_auto] gap-1.5">
                  <input className={champ} placeholder="Hausse + / baisse −" value={change.montant} onChange={(e) => setChange({ ...change, montant: e.target.value })} />
                  <select className={champ} value={change.categorie} onChange={(e) => setChange({ ...change, categorie: e.target.value as CategorieChange })}>
                    {(Object.keys(CATEGORIES_CHANGE) as CategorieChange[]).map((c) => (
                      <option key={c} value={c}>{CATEGORIES_CHANGE[c]} (où l’écart est comptabilisé)</option>
                    ))}
                  </select>
                  <input className={champ} placeholder="Justification (écriture de conversion)" value={change.justification} onChange={(e) => setChange({ ...change, justification: e.target.value })} />
                  <button
                    className="border border-border px-2.5 py-1 text-[12px]"
                    onClick={() =>
                      void agir(async () => {
                        await api.put('/ifrs/effet-change', { exerciceId, ...change, montant: nombre(change.montant) });
                        setChange({ montant: '', categorie: 'FINANCEMENT', justification: '' });
                      })
                    }
                  >
                    Déclarer
                  </button>
                </div>
              )
            )}
          </div>
        )}
        {!etat.fluxTresorerie.n ? (
          <p className="text-[12px] text-warning">{etat.fluxTresorerie.motifN}</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-left border-b border-border">
                    <th className="py-1 pr-2">Flux</th>
                    <th className="py-1 pr-2">IAS 7</th>
                    <th className="py-1 pr-2 text-right">N</th>
                    <th className="py-1 text-right">N-1</th>
                  </tr>
                </thead>
                <tbody>
                  {etat.fluxTresorerie.n.lignes.map((l) => (
                    <tr
                      key={l.cle}
                      className={l.nature === 'ECART' ? 'text-danger font-semibold' : l.nature === 'FLUX' ? 'border-b border-border/40' : 'font-bold border-t border-border'}
                    >
                      <td className="py-1 pr-2">{l.libelle}</td>
                      <td className="py-1 pr-2 text-text-dim">{l.ref}</td>
                      <td className="py-1 pr-2 text-right">{fc(l.montant)}</td>
                      <td className="py-1 text-right">{etat.fluxTresorerie.n1 ? fc(etat.fluxTresorerie.n1.lignes.find((x) => x.cle === l.cle)?.montant ?? 0) : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!etat.fluxTresorerie.n1 && <p className="text-[12px] text-text-dim mt-1">{etat.fluxTresorerie.motifN1}</p>}
            <p className="text-[12px] font-semibold mt-2 mb-1">Rapprochement avec l’état de la situation financière (§ 45)</p>
            <table className="text-[12px]">
              <tbody>
                {etat.fluxTresorerie.n.rapprochementSituation.map((x) => (
                  <tr key={x.cle} className={x.cle === 'R_TABLEAU' ? 'font-bold' : ''}>
                    <td className="pr-3">{x.libelle}</td>
                    <td className="text-right">{fc(x.montant)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[12px] font-semibold mt-2 mb-1">Du tableau SYSCOHADA au tableau IFRS</p>
            <table className="text-[12px]">
              <thead>
                <tr className="text-left border-b border-border">
                  <th className="pr-3">Activité</th>
                  <th className="pr-3 text-right">SYSCOHADA</th>
                  <th className="pr-3 text-right">IFRS</th>
                  <th className="text-right">Écart</th>
                </tr>
              </thead>
              <tbody>
                {etat.fluxTresorerie.n.rapprochementLegal.map((x) => (
                  <tr key={x.activite}>
                    <td className="pr-3">{x.activite}</td>
                    <td className="pr-3 text-right">{fc(x.syscohada)}</td>
                    <td className="pr-3 text-right">{fc(x.ifrs)}</td>
                    <td className="text-right">{fc(x.ecart)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {etat.fluxTresorerie.n.mentions.map((m) => <p key={m} className="text-[12px] text-text-dim mt-1">{m}</p>)}
          </>
        )}
      </section>

      <section className="border border-border bg-surface px-3.5 py-2.5 mb-2.5">
        <h2 className="text-[12.5px] font-bold mb-1.5">Rapprochement SYSCOHADA → IFRS</h2>
        <table className="text-[12px]">
          <tbody>
            <tr><td className="pr-3">Résultat SYSCOHADA</td><td className="text-right">{fc(r.resultatSyscohada)}</td></tr>
            <tr><td className="pr-3">Retraitements au résultat</td><td className="text-right">{fc(r.retraitementsResultat)}</td></tr>
            <tr className="font-bold"><td className="pr-3">Résultat IFRS</td><td className="text-right">{fc(r.resultatIfrs)}</td></tr>
            <tr><td className="pr-3 pt-2">Capitaux propres SYSCOHADA (résultat compris)</td><td className="text-right pt-2">{fc(r.capitauxPropresSyscohada)}</td></tr>
            <tr><td className="pr-3">Retraitements</td><td className="text-right">{fc(r.retraitementsCapitauxPropres)}</td></tr>
            <tr className="font-bold"><td className="pr-3">Capitaux propres IFRS</td><td className="text-right">{fc(r.capitauxPropresIfrs)}</td></tr>
          </tbody>
        </table>
        {etat.n.controles.map((c) => (
          <p key={c.cle} className={c.ok ? 'text-[12px] text-text-dim mt-1' : 'text-[12px] text-danger mt-1'}>
            {c.ok ? 'Vérifié' : `Écart ${fc(c.ecart)}`} · {c.libelle}
          </p>
        ))}
      </section>

      <NotesIfrs notes={etat.notes} exerciceId={exerciceId} rubriques={etat.rubriques} apresEnregistrement={recharger} />
    </div>
  );
}
