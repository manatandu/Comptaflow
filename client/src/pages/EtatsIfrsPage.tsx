import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useExercice } from '../lib/exercice';

/**
 * ÉTATS IFRS EN SUS DU JEU LÉGAL · item 15, tranche 1 (AUDCIF art. 73-1,
 * IFRS 18). Le grand livre reste SYSCOHADA · les états IFRS sont la balance
 * légale projetée par des règles de correspondance déclarées, plus des
 * retraitements déclarés, posés à côté. Trois colonnes par poste, pour que le
 * passage d'un référentiel à l'autre se lise ligne à ligne.
 */
type Rubrique = { code: string; libelle: string; ref: string; etat: 'SITUATION' | 'RESULTAT'; section?: string; categorie?: string };
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
type Etat = {
  activitePrincipale: 'AUCUNE' | 'INVESTIR_ACTIFS' | 'FINANCER_CLIENTS' | null;
  regles: { id: string; prefixe: string; rubrique: string }[];
  retraitements: { id: string; libelle: string; fondement: string; lignes: { rubrique: string; montant: number }[] }[];
  rubriques: Rubrique[];
  groupes: Record<string, string>;
  n: Etats;
  n1: Etats | null;
  motifN1: string | null;
};

const champ = 'w-full border border-border px-1.5 py-1 text-[12px]';
const fc = (v: number | null | undefined) => (v == null ? '' : v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const nombre = (v: string) => (v.trim() === '' ? NaN : Number(v.replace(/\s/g, '').replace(',', '.')));

export function EtatsIfrsPage() {
  const { peutEcrire } = useAuth();
  const { exerciceCourant } = useExercice();
  const exerciceId = exerciceCourant?.id;
  const [etat, setEtat] = useState<Etat | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [regle, setRegle] = useState({ prefixe: '', rubrique: '' });
  const [retr, setRetr] = useState({ libelle: '', fondement: '', lignes: [{ rubrique: '', montant: '' }, { rubrique: '', montant: '' }] });

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

  const tableau = (titre: string, lignes: Ligne[], n1: Ligne[] | null) => {
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
                <th className="py-1 pr-2 text-right">SYSCOHADA reclassé</th>
                <th className="py-1 pr-2 text-right">Retraitements</th>
                <th className="py-1 pr-2 text-right">IFRS N</th>
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
                        <td colSpan={6} className="pt-2 pb-0.5 font-semibold text-text-dim">{etat.groupes[entete] ?? entete}</td>
                      </tr>
                    )}
                    <tr key={l.cle} className={l.nature === 'TOTAL' ? 'font-bold border-t border-border' : l.nature === 'NON_CLASSE' ? 'text-warning' : 'border-b border-border/40'}>
                      <td className="py-1 pr-2" title={l.comptes?.map((c) => `${c.numero} ${fc(c.solde)}`).join('\n')}>{l.libelle}</td>
                      <td className="py-1 pr-2 text-text-dim">{l.ref}</td>
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
          de l’un vers l’autre passe par un retraitement. Charges présentées par nature (IFRS 18 § 78 a).
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
              {etat.rubriques.map((rb) => (
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
            <div className="flex items-center gap-2">
              <button className="border border-border px-2.5 py-1 text-[12px]" onClick={() => setRetr({ ...retr, lignes: [...retr.lignes, { rubrique: '', montant: '' }] })}>
                Ligne de plus
              </button>
              <span className={Math.abs(ecartRetr) > 0.005 ? 'text-[12px] text-warning' : 'text-[12px] text-text-dim'}>Écart {fc(ecartRetr)}</span>
              <button
                className="border border-border px-2.5 py-1 text-[12px]"
                onClick={() =>
                  void agir(async () => {
                    await api.post('/ifrs/retraitements', {
                      exerciceId,
                      libelle: retr.libelle,
                      fondement: retr.fondement,
                      lignes: retr.lignes.filter((x) => x.rubrique).map((x) => ({ rubrique: x.rubrique, montant: nombre(x.montant) })),
                    });
                    setRetr({ libelle: '', fondement: '', lignes: [{ rubrique: '', montant: '' }, { rubrique: '', montant: '' }] });
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
          etat.retraitements.map((x) => (
            <div key={x.id} className="border-b border-border/60 py-1 text-[12px]">
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
                  <span>{fc(l.montant)}</span>
                </div>
              ))}
            </div>
          ))
        )}
      </section>

      {tableau('État de la situation financière', etat.n.situation, etat.n1?.situation ?? null)}
      {tableau('Compte de résultat', etat.n.resultat, etat.n1?.resultat ?? null)}
      {etat.motifN1 && <p className="text-[12px] text-text-dim mb-2">{etat.motifN1}</p>}

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
    </div>
  );
}
