import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useExercice } from '../lib/exercice';
import { NotesIfrs, NotesIfrsServies } from '../components/NotesIfrs';
import { EtatsIfrsConsolides } from '../components/EtatsIfrsConsolides';
import { VariationCapitauxPropresIfrs, VariationServie } from '../components/VariationCapitauxPropresIfrs';
import { DeclarationEffetChange, EffetChange, FluxServi, TableauFluxIfrs } from '../components/FluxTresorerieIfrs';
import { Aide } from '../components/chrome/Aide';

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
 *
 * TRANCHE C1 · les états consolidés (`components/EtatsIfrsConsolides.tsx`),
 * sur la balance consolidée du D4C, avec la part des participations ne donnant
 * pas le contrôle. Les deux vues ne partagent aucun retraitement.
 */
type Rubrique = { code: string; libelle: string; ref: string; etat: 'SITUATION' | 'RESULTAT' | 'RESULTAT_GLOBAL'; section?: string; categorie?: string };
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
const booleen = (v: boolean | null) => (v == null ? '' : v ? 'OUI' : 'NON');
const deBooleen = (v: string) => (v === '' ? null : v === 'OUI');
type Etat = {
  notes: NotesIfrsServies;
  decouvertsDansTresorerie: boolean | null;
  tresorerieEnDevises: boolean | null;
  effetChange: EffetChange | null;
  fluxTresorerie: FluxServi;
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
  variationCapitauxPropres: VariationServie;
};

const champ = 'w-full border border-border px-1.5 py-1 text-[11.5px]';
const fc = (v: number | null | undefined) => (v == null ? '' : v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const nombre = (v: string) => (v.trim() === '' ? NaN : Number(v.replace(/\s/g, '').replace(',', '.')));

/** Comptes individuels ou comptes consolidés · deux jeux IFRS, deux ensembles de retraitements. */
export function EtatsIfrsPage() {
  const { exerciceCourant } = useExercice();
  const [vue, setVue] = useState<'INDIVIDUELS' | 'CONSOLIDES'>('INDIVIDUELS');
  const bouton = (v: typeof vue, texte: string) => (
    <button className={`border border-border px-2.5 py-1 text-[11.5px] ${vue === v ? 'font-bold bg-surface' : 'text-text-dim'}`} onClick={() => setVue(v)}>
      {texte}
    </button>
  );
  return (
    <div className="p-2 max-w-[1100px]">
      <div className="flex gap-1.5 mb-2">
        {bouton('INDIVIDUELS', 'Comptes individuels')}
        {bouton('CONSOLIDES', 'Comptes consolidés')}
      </div>
      {vue === 'INDIVIDUELS' ? (
        <EtatsIfrsIndividuels />
      ) : exerciceCourant ? (
        <EtatsIfrsConsolides key={exerciceCourant.id} exerciceId={exerciceCourant.id} />
      ) : (
        <p className="p-2 text-[11.5px] text-text-dim">Aucun exercice sélectionné.</p>
      )}
    </div>
  );
}

function EtatsIfrsIndividuels() {
  const { peutEcrire } = useAuth();
  const { exerciceCourant, exercices } = useExercice();
  const exerciceId = exerciceCourant?.id;
  const [etat, setEtat] = useState<Etat | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [regle, setRegle] = useState({ prefixe: '', rubrique: '' });
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

  if (!exerciceId) return <p className="p-2 text-[11.5px] text-text-dim">Aucun exercice sélectionné.</p>;
  if (!etat) return <p className="p-2 text-[11.5px] text-text-dim">{erreur ?? 'Chargement…'}</p>;
  const libelleRubrique = (code: string) => etat.rubriques.find((r) => r.code === code)?.libelle ?? code;
  const ecartRetr = retr.lignes.reduce((s, l) => s + (Number.isFinite(nombre(l.montant)) ? nombre(l.montant) : 0), 0);

  // § 114 · les renvois ne valent que pour les états de l'exercice, pas pour
  // l'état d'ouverture de la transition.
  const tableau = (titre: string, lignes: Ligne[], n1: Ligne[] | null, colonne = 'IFRS N', renvois: Record<string, number[]> | null = etat.notes.renvois) => {
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
  const listeRetraitement = (x: Retraitement) => (
    <div key={x.id} className="border-b border-border/60 py-1 text-[11.5px]">
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
    <div>
      <section className="border border-border bg-surface px-3.5 py-2.5 mb-2.5">
        <h2 className="text-[11.5px] font-bold mb-1.5 flex items-center gap-1.5">
          États IFRS en sus du jeu légal
          <Aide
            titre="États IFRS en sus du jeu légal"
            texte="Les entités dont les titres sont cotés ou qui font appel public à l’épargne déposent, en sus des états SYSCOHADA, des états établis selon les normes IFRS. Le grand livre reste SYSCOHADA et rien n’y est écrit · chaque compte est rangé dans une rubrique d’IFRS 18 par une règle que vous déclarez (le plus long préfixe l’emporte), et chaque écart de norme se déclare en retraitement équilibré, avec la norme qui le fonde. Un compte de gestion va au compte de résultat, un compte de bilan à l’état de la situation financière · un reclassement de l’un vers l’autre passe par un retraitement. Charges présentées par nature (IFRS 18 § 78 a). Les autres éléments du résultat global n’ont aucun compte au SYSCOHADA · ils entrent par retraitement, avec la norme qui les fait sortir du résultat net (§ B86-B87)."
            source="AUDCIF art. 73-1 · IFRS 18 § 78 a, B86-B87"
          />
        </h2>
        {erreur && <p className="text-[11.5px] text-danger mt-1.5">{erreur}</p>}
        {etat.n.motifsNonPubliable.length > 0 && (
          <details className="mt-1.5">
            <summary className="cursor-pointer text-[11.5px] font-semibold text-warning">
              Non publiable · {etat.n.motifsNonPubliable.length} motif(s)
            </summary>
            {etat.n.motifsNonPubliable.map((m) => <p key={m} className="text-[11.5px] text-warning">· {m}</p>)}
          </details>
        )}
        {etat.n.mentions.map((m) => <p key={m} className="text-[11.5px] text-text-dim mt-1">{m}</p>)}
      </section>

      <section className="border border-border bg-surface px-3.5 py-2.5 mb-2.5">
        <h2 className="text-[11.5px] font-bold mb-1.5">Activité principale (IFRS 18 § 49 à 51)</h2>
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
        <h2 className="text-[11.5px] font-bold mb-1.5">Règles de correspondance</h2>
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
              className="border border-border px-2.5 py-1 text-[11.5px]"
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
          <p className="text-[11.5px] text-text-dim">Aucune règle · tous les comptes sont sans rubrique.</p>
        ) : (
          <table className="w-full text-[11.5px]">
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
          <p className="text-[11.5px] text-warning mt-1.5">
            Sans rubrique · {etat.n.nonClasses.map((c) => `${c.numero} (${fc(c.solde)})`).join(', ')}
          </p>
        )}
      </section>

      <section className="border border-border bg-surface px-3.5 py-2.5 mb-2.5">
        <h2 className="text-[11.5px] font-bold mb-1.5">Retraitements de l’exercice</h2>
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
            <div className="flex flex-wrap items-center gap-3 text-[11.5px]">
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
              <button className="border border-border px-2.5 py-1 text-[11.5px]" onClick={() => setRetr({ ...retr, lignes: [...retr.lignes, { rubrique: '', montant: '' }] })}>
                Ligne de plus
              </button>
              <span className={Math.abs(ecartRetr) > 0.005 ? 'text-[11.5px] text-warning' : 'text-[11.5px] text-text-dim'}>Écart {fc(ecartRetr)}</span>
              <button
                className="border border-border px-2.5 py-1 text-[11.5px]"
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
          <p className="text-[11.5px] text-text-dim">Aucun retraitement · les états IFRS sont la balance légale reclassée.</p>
        ) : (
          etat.retraitements.map((x) => listeRetraitement(x))
        )}
      </section>

      <section className="border border-border bg-surface px-3.5 py-2.5 mb-2.5">
        <h2 className="text-[11.5px] font-bold mb-1.5">Première application des IFRS (IFRS 1)</h2>
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
        {etat.motifPremiereApplication && <p className="text-[11.5px] text-warning mt-1.5">{etat.motifPremiereApplication}</p>}
        {etat.premiereApplication && (
          <>
            <p className="text-[11.5px] mt-1.5">
              Date de transition · <strong>{etat.premiereApplication.dateTransition}</strong> (ouverture de l’exercice comparatif, annexe A).
            </p>
            <p className="text-[11.5px] font-semibold mt-2 mb-1">Ajustements de transition</p>
            {etat.ajustementsTransition.length === 0 ? (
              <p className="text-[11.5px] text-text-dim">Aucun ajustement · l’état d’ouverture est la balance d’ouverture légale reclassée.</p>
            ) : (
              etat.ajustementsTransition.map((x) => listeRetraitement(x))
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

      {etat.premiereApplication && tableau(`État de la situation financière d’ouverture au ${etat.premiereApplication.dateTransition} (IFRS 1 § 6)`, etat.premiereApplication.ouverture.situation, null, 'IFRS ouverture', null)}

      {tableau('État de la situation financière', etat.n.situation, etat.n1?.situation ?? null)}
      {tableau('Compte de résultat', etat.n.resultat, etat.n1?.resultat ?? null)}
      {tableau('État présentant le résultat global', etat.n.resultatGlobal, etat.n1?.resultatGlobal ?? null)}
      {etat.motifN1 && <p className="text-[11.5px] text-text-dim mb-2">{etat.motifN1}</p>}

      <VariationCapitauxPropresIfrs
        titre="État des variations des capitaux propres (IFRS 18 § 107 à 112)"
        vcp={vcp}
        consolide={false}
        exerciceId={exerciceId}
        peutEcrire={peutEcrire}
        agir={agir}
      />

      <section className="border border-border bg-surface px-3.5 py-2.5 mb-2.5">
        <h2 className="text-[11.5px] font-bold mb-1.5">État des flux de trésorerie (IAS 7, modifiée par IFRS 18)</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mb-2">
          <label className="text-[11.5px]">
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
          <label className="text-[11.5px]">
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
          <DeclarationEffetChange exerciceId={exerciceId} effetChange={etat.effetChange} consolide={false} peutEcrire={peutEcrire} agir={agir} />
        )}
        <TableauFluxIfrs flux={etat.fluxTresorerie} />
      </section>

      <section className="border border-border bg-surface px-3.5 py-2.5 mb-2.5">
        <h2 className="text-[11.5px] font-bold mb-1.5">Rapprochement SYSCOHADA → IFRS</h2>
        <table className="text-[11.5px]">
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
          <p key={c.cle} className={c.ok ? 'text-[11.5px] text-text-dim mt-1' : 'text-[11.5px] text-danger mt-1'}>
            {c.ok ? 'Vérifié' : `Écart ${fc(c.ecart)}`} · {c.libelle}
          </p>
        ))}
      </section>

      <NotesIfrs notes={etat.notes} exerciceId={exerciceId} rubriques={etat.rubriques} apresEnregistrement={recharger} />
    </div>
  );
}
