import { useState } from 'react';
import { api, ApiError } from '../lib/api';

/**
 * CUMUL ET ÉLIMINATIONS · tranche 2 de la consolidation SYSCOHADA, sous le
 * périmètre. Trois saisies et un calcul · la balance retraitée de chaque
 * entité (au canevas de la balance agrégée), ce que le cabinet sait de chaque
 * acquisition, et les comptes réciproques confirmés. Le calcul est demandé,
 * jamais fait d'office · un refus du moteur (acquisition manquante, balance
 * déséquilibrée) s'affiche avec son motif au lieu d'un tableau vide.
 */
type Num = number | string | null;
export type EntiteCumul = { id: string; nom: string; balanceImporteeLe?: string | null; fichierBalance?: string | null };
export type LienCumul = {
  id: string;
  detentriceId: string | null;
  detenueId: string;
  pctCapital: number;
  coutAcquisition?: Num;
  compteTitres?: string | null;
  dateEntree?: string | null;
  capitauxPropresEntree?: Num;
  modeDureeEcart?: 'LIMITEE' | 'NON_DETERMINABLE' | null;
  dureeEcartAnnees?: number | null;
  depreciationEcartOuverture?: Num;
  depreciationEcartCloture?: Num;
  dividendesExercice?: Num;
  compteDividendes?: string | null;
  obligationNonDesengagement?: boolean;
};
type Resultat = {
  lignes: { cle: string; intitule: string; solde: number; poste: boolean }[];
  capitauxPropres: {
    capital: number;
    reservesGroupe: number;
    resultatGroupe: number;
    interetsMinoritairesHorsResultat: number;
    resultatMinoritaires: number;
    resultatEnsemble: number;
  };
  ecarts: { detentrice: string; detenue: string; ecart: number; dureeAnnees: number; dotationExercice: number }[];
  avertissements: string[];
  reserves: string[];
  equilibre: number;
};

const champ = 'w-full border border-border px-1.5 py-1 text-[12px]';
const fc = (v: number) => v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nombre = (v: string) => (v.trim() === '' ? null : Number(v.replace(/\s/g, '').replace(',', '.')));

function lireBase64(fichier: File): Promise<string> {
  return new Promise((resoudre, rejeter) => {
    const lecteur = new FileReader();
    lecteur.onload = () => resoudre(String(lecteur.result).split(',')[1] ?? '');
    lecteur.onerror = () => rejeter(new Error('Lecture du fichier impossible'));
    lecteur.readAsDataURL(fichier);
  });
}

export function CumulConsolidation(props: {
  exerciceId: string;
  consolidante: { nom: string };
  entites: EntiteCumul[];
  liens: LienCumul[];
  reciproques: { id: string; entiteAId: string | null; compteA: string; entiteBId: string | null; compteB: string; montant: number; libelle: string }[];
  peutEcrire: boolean;
  recharger: () => Promise<void>;
}) {
  const { exerciceId, consolidante, entites, liens, reciproques, peutEcrire, recharger } = props;
  const [erreur, setErreur] = useState<string | null>(null);
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [recip, setRecip] = useState({ entiteAId: '', compteA: '', entiteBId: '', compteB: '', montant: '', libelle: '' });
  const nomDe = (id: string | null) => (id === null || id === '' ? consolidante.nom : (entites.find((e) => e.id === id)?.nom ?? '?'));

  async function agir(action: () => Promise<unknown>) {
    setErreur(null);
    try {
      await action();
      await recharger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "L'opération n'a pas abouti.");
    }
  }

  async function calculer() {
    setErreur(null);
    setResultat(null);
    try {
      setResultat(await api.get<Resultat>(`/consolidation/cumul?exerciceId=${exerciceId}`));
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Le cumul n’a pas pu être calculé.');
    }
  }

  const acquisitionDe = (form: HTMLFormElement) => {
    const f = new FormData(form);
    const txt = (k: string) => String(f.get(k) ?? '');
    return {
      coutAcquisition: nombre(txt('cout')),
      compteTitres: txt('compteTitres'),
      dateEntree: txt('dateEntree'),
      capitauxPropresEntree: nombre(txt('cpEntree')),
      modeDureeEcart: txt('mode'),
      dureeEcartAnnees: txt('mode') === 'LIMITEE' ? nombre(txt('duree')) : null,
      depreciationEcartOuverture: nombre(txt('depOuv')) ?? 0,
      depreciationEcartCloture: nombre(txt('depClo')) ?? 0,
      dividendesExercice: nombre(txt('div')) ?? 0,
      compteDividendes: txt('compteDiv') || null,
      obligationNonDesengagement: f.get('obligation') === 'on',
    };
  };

  return (
    <>
      <section className="border border-border bg-surface px-3.5 py-2.5 mb-2.5">
        <h2 className="text-[12.5px] font-bold mb-1.5">Balances des entités</h2>
        <p className="text-[11px] text-text-dim mb-1.5 leading-[1.6]">
          La balance de la consolidante est celle du grand livre. Celle de chaque autre entité s’importe au canevas de la
          balance agrégée (Numéro, Intitulé, Débit, Crédit), en francs congolais, <strong>déjà retraitée</strong> aux règles du
          groupe (D4C, ch. XII-3). Un nouvel import remplace le précédent.
        </p>
        {entites.map((e) => (
          <div key={e.id} className="flex flex-wrap items-center gap-2 py-1 border-b border-border/60 text-[12px]">
            <span className="min-w-[160px]">{e.nom}</span>
            <span className="text-text-dim">
              {e.balanceImporteeLe ? `${e.fichierBalance ?? 'balance'} · importée le ${e.balanceImporteeLe.slice(0, 10)}` : 'aucune balance'}
            </span>
            {peutEcrire && (
              <input
                type="file"
                accept=".xlsx,.csv"
                className="text-[11px]"
                onChange={(ev) => {
                  const fichier = ev.target.files?.[0];
                  if (fichier) {
                    void agir(async () =>
                      api.post(`/consolidation/entites/${e.id}/balance`, { nomFichier: fichier.name, contenuBase64: await lireBase64(fichier) }),
                    );
                  }
                  ev.target.value = '';
                }}
              />
            )}
          </div>
        ))}
      </section>

      <section className="border border-border bg-surface px-3.5 py-2.5 mb-2.5">
        <h2 className="text-[12.5px] font-bold mb-1.5">Acquisitions</h2>
        <p className="text-[11px] text-text-dim mb-1.5 leading-[1.6]">
          Pour chaque participation retenue · le coût des titres, frais directs compris, le compte qui le porte chez la
          détentrice, la date d’entrée et les capitaux propres de la détenue à cette date, résultat compris (art. 82).
          L’écart est rapporté au résultat selon un plan d’amortissement (art. 82) · durée d’utilité, ou dix ans si elle
          n’est pas déterminable (ch. XII-6 § 4).
        </p>
        {liens.map((l) => (
          <details key={l.id} className="border-b border-border/60 py-1">
            <summary className="text-[12px] cursor-pointer">
              {nomDe(l.detentriceId)} → {nomDe(l.detenueId)} ({l.pctCapital} % du capital)
              {l.coutAcquisition == null ? <span className="text-warning"> · coût non déclaré</span> : null}
            </summary>
            <form
              className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 py-1.5"
              onSubmit={(ev) => {
                ev.preventDefault();
                void agir(() => api.put(`/consolidation/liens/${l.id}/acquisition`, acquisitionDe(ev.currentTarget)));
              }}
            >
              <label className="text-[12px]">Coût d’acquisition (FC)<input name="cout" className={champ} defaultValue={l.coutAcquisition ?? ''} disabled={!peutEcrire} /></label>
              <label className="text-[12px]">Compte des titres<input name="compteTitres" className={champ} defaultValue={l.compteTitres ?? ''} disabled={!peutEcrire} /></label>
              <label className="text-[12px]">Date d’entrée<input name="dateEntree" type="date" className={champ} defaultValue={l.dateEntree?.slice(0, 10) ?? ''} disabled={!peutEcrire} /></label>
              <label className="text-[12px]">Capitaux propres à l’entrée (FC)<input name="cpEntree" className={champ} defaultValue={l.capitauxPropresEntree ?? ''} disabled={!peutEcrire} /></label>
              <label className="text-[12px]">
                Durée de l’écart
                <select name="mode" className={champ} defaultValue={l.modeDureeEcart ?? 'NON_DETERMINABLE'} disabled={!peutEcrire}>
                  <option value="NON_DETERMINABLE">Non déterminable · dix ans</option>
                  <option value="LIMITEE">Limitée · durée saisie</option>
                </select>
              </label>
              <label className="text-[12px]">Durée (années)<input name="duree" className={champ} defaultValue={l.dureeEcartAnnees ?? ''} disabled={!peutEcrire} /></label>
              <label className="text-[12px]">Dépréciation cumulée à l’ouverture<input name="depOuv" className={champ} defaultValue={l.depreciationEcartOuverture ?? ''} disabled={!peutEcrire} /></label>
              <label className="text-[12px]">Dépréciation cumulée à la clôture<input name="depClo" className={champ} defaultValue={l.depreciationEcartCloture ?? ''} disabled={!peutEcrire} /></label>
              <label className="text-[12px]">Dividendes reçus dans l’exercice<input name="div" className={champ} defaultValue={l.dividendesExercice ?? ''} disabled={!peutEcrire} /></label>
              <label className="text-[12px]">Compte des dividendes<input name="compteDiv" className={champ} defaultValue={l.compteDividendes ?? ''} disabled={!peutEcrire} /></label>
              <label className="text-[12px] flex gap-1.5 items-start sm:col-span-2">
                <input name="obligation" type="checkbox" defaultChecked={l.obligationNonDesengagement === true} disabled={!peutEcrire} />
                <span>Obligation ou intention de ne pas se désengager · une quote-part négative passe en provision (ch. XII-5 § 6)</span>
              </label>
              {peutEcrire && (
                <button type="submit" className="border border-border px-2.5 py-1 text-[12px] sm:col-span-3 justify-self-start">
                  Enregistrer l’acquisition
                </button>
              )}
            </form>
          </details>
        ))}
      </section>

      <section className="border border-border bg-surface px-3.5 py-2.5 mb-2.5">
        <h2 className="text-[12.5px] font-bold mb-1.5">Comptes réciproques</h2>
        <p className="text-[11px] text-text-dim mb-1.5 leading-[1.6]">
          Créances et dettes, charges et produits entre entités intégrées (art. 86, 6°), déclarés après confirmation de
          solde. Avec une entité intégrée proportionnellement, l’élimination est limitée à sa fraction (ch. XII-5 § 5).
        </p>
        {peutEcrire && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 mb-2">
            <label className="text-[12px]">
              Entité A
              <select className={champ} value={recip.entiteAId} onChange={(e) => setRecip({ ...recip, entiteAId: e.target.value })}>
                <option value="">{consolidante.nom} (consolidante)</option>
                {entites.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
              </select>
            </label>
            <label className="text-[12px]">Compte de A<input className={champ} value={recip.compteA} onChange={(e) => setRecip({ ...recip, compteA: e.target.value })} /></label>
            <label className="text-[12px]">Montant confirmé (FC)<input className={champ} value={recip.montant} onChange={(e) => setRecip({ ...recip, montant: e.target.value })} /></label>
            <label className="text-[12px]">
              Entité B
              <select className={champ} value={recip.entiteBId} onChange={(e) => setRecip({ ...recip, entiteBId: e.target.value })}>
                <option value="">{consolidante.nom} (consolidante)</option>
                {entites.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
              </select>
            </label>
            <label className="text-[12px]">Compte de B<input className={champ} value={recip.compteB} onChange={(e) => setRecip({ ...recip, compteB: e.target.value })} /></label>
            <label className="text-[12px]">Libellé<input className={champ} value={recip.libelle} onChange={(e) => setRecip({ ...recip, libelle: e.target.value })} /></label>
            <button
              className="border border-border px-2.5 py-1 text-[12px] justify-self-start"
              onClick={() =>
                void agir(async () => {
                  await api.post('/consolidation/reciproques', {
                    exerciceId,
                    entiteAId: recip.entiteAId || null,
                    compteA: recip.compteA,
                    entiteBId: recip.entiteBId || null,
                    compteB: recip.compteB,
                    montant: nombre(recip.montant),
                    libelle: recip.libelle,
                  });
                  setRecip({ ...recip, compteA: '', compteB: '', montant: '', libelle: '' });
                })
              }
            >
              Ajouter
            </button>
          </div>
        )}
        {reciproques.length === 0 ? (
          <p className="text-[12px] text-text-dim">Aucune opération réciproque déclarée.</p>
        ) : (
          <table className="w-full text-[12px]">
            <tbody>
              {reciproques.map((o) => (
                <tr key={o.id} className="border-b border-border/60">
                  <td className="py-1 pr-2">{o.libelle}</td>
                  <td className="py-1 pr-2">{nomDe(o.entiteAId)} · {o.compteA}</td>
                  <td className="py-1 pr-2">{nomDe(o.entiteBId)} · {o.compteB}</td>
                  <td className="py-1 pr-2 text-right">{fc(o.montant)}</td>
                  <td className="py-1 text-right">
                    {peutEcrire && (
                      <button className="text-[11px] underline" onClick={() => void agir(() => api.delete(`/consolidation/reciproques/${o.id}`))}>
                        Retirer
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="border border-border bg-surface px-3.5 py-2.5">
        <div className="flex items-center gap-2 mb-1.5">
          <h2 className="text-[12.5px] font-bold">Balance consolidée avant répartition</h2>
          <button className="border border-border px-2.5 py-1 text-[12px]" onClick={() => void calculer()}>
            Calculer
          </button>
        </div>
        {erreur && <p className="text-[12px] text-danger mb-2">{erreur}</p>}
        {resultat && (
          <>
            <table className="text-[12px] mb-2">
              <tbody>
                <tr><td className="pr-3">Capital (consolidante)</td><td className="text-right">{fc(resultat.capitauxPropres.capital)}</td></tr>
                <tr><td className="pr-3">Réserves consolidées</td><td className="text-right">{fc(resultat.capitauxPropres.reservesGroupe)}</td></tr>
                <tr><td className="pr-3">Résultat, part de la consolidante</td><td className="text-right">{fc(resultat.capitauxPropres.resultatGroupe)}</td></tr>
                <tr><td className="pr-3">Intérêts minoritaires, hors résultat</td><td className="text-right">{fc(resultat.capitauxPropres.interetsMinoritairesHorsResultat)}</td></tr>
                <tr><td className="pr-3">Résultat, part des minoritaires</td><td className="text-right">{fc(resultat.capitauxPropres.resultatMinoritaires)}</td></tr>
                <tr className="font-bold"><td className="pr-3">Résultat net de l’ensemble consolidé</td><td className="text-right">{fc(resultat.capitauxPropres.resultatEnsemble)}</td></tr>
              </tbody>
            </table>
            {Math.abs(resultat.equilibre) > 0.005 && (
              <p className="text-[12px] text-danger mb-2">La balance consolidée n’est pas équilibrée (écart de {fc(resultat.equilibre)}).</p>
            )}
            {resultat.avertissements.map((a) => <p key={a} className="text-[12px] text-warning">{a}</p>)}
            <div className="overflow-x-auto mt-1.5">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-left border-b border-border">
                    <th className="py-1 pr-2">Compte ou poste</th>
                    <th className="py-1 pr-2">Intitulé</th>
                    <th className="py-1 text-right">Solde (débit − crédit)</th>
                  </tr>
                </thead>
                <tbody>
                  {resultat.lignes.map((l) => (
                    <tr key={l.cle} className={`border-b border-border/60 ${l.poste ? 'font-semibold' : ''}`}>
                      <td className="py-1 pr-2">{l.poste ? '·' : l.cle}</td>
                      <td className="py-1 pr-2">{l.intitule}</td>
                      <td className="py-1 text-right">{fc(l.solde)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="text-[11px] text-text-dim mt-2 list-disc pl-5 leading-[1.6]">
              {resultat.reserves.map((r) => <li key={r}>{r}</li>)}
            </ul>
          </>
        )}
      </section>
    </>
  );
}
