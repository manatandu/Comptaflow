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
/** Tranche 4a · ce que l'entité déclare de sa fiscalité. null veut dire « pas de réponse », jamais zéro. */
export type FiscaliteCumul = {
  tauxImpotDiffere?: number | null;
  sourceTauxImpot?: string | null;
  idaOuverture?: number | null;
  idaCloture?: number | null;
  idpOuverture?: number | null;
  idpCloture?: number | null;
  justificationIda?: string | null;
  /** Tranche 4b · les 478 et 479 de la balance N-1 de l'entité, pour isoler la part de l'exercice. */
  ecartConversionActifN1?: number | null;
  ecartConversionPassifN1?: number | null;
};
export type ProvisionChangeCumul = { id: string; entiteId: string | null; compteProvision: string; cloture: number; dotation: number; reprise: number };
/** Tranche 4c · la monnaie de la balance importée et ce qu'il faut pour la convertir au cours de clôture. */
export type MonnaieCumul = {
  monnaieBalance?: string | null;
  justificationMonnaie?: string | null;
  hyperinflation?: boolean;
  coursCloture?: number | null;
  coursProduitsCharges?: number | null;
  coursEntree?: number | null;
  capitauxPropresHistoriques?: number | null;
};
export type EntiteCumul = { id: string; nom: string; balanceImporteeLe?: string | null; fichierBalance?: string | null } & FiscaliteCumul & MonnaieCumul;
export type EcartEvaluationCumul = {
  id: string;
  lienId: string;
  compte: string;
  compteAmortissement: string | null;
  libelle: string;
  montant: number;
  mode: 'AMORTISSABLE' | 'NON_AMORTISSABLE' | 'REALISE';
  dureeAnnees: number | null;
  dateRealisation: string | null;
};
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
    ecartsConversion?: number;
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
  resultatsInternes: {
    id: string;
    vendeuseId: string | null;
    acheteuseId: string | null;
    nature: 'STOCK' | 'IMMOBILISATION';
    compteActif: string;
    margeOuverture: number;
    margeCloture: number;
    libelle: string;
  }[];
  ecartsEvaluation: EcartEvaluationCumul[];
  /** La fiscalité de la consolidante vit dans les faits de l'exercice. */
  fiscaliteConsolidante: FiscaliteCumul | null;
  provisionsChange: ProvisionChangeCumul[];
  peutEcrire: boolean;
  recharger: () => Promise<void>;
}) {
  const { exerciceId, consolidante, entites, liens, reciproques, resultatsInternes, ecartsEvaluation, fiscaliteConsolidante, provisionsChange, peutEcrire, recharger } = props;
  const [erreur, setErreur] = useState<string | null>(null);
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [recip, setRecip] = useState({ entiteAId: '', compteA: '', entiteBId: '', compteB: '', montant: '', libelle: '' });
  const [interne, setInterne] = useState({ vendeuseId: '', acheteuseId: '', nature: 'STOCK', compteActif: '', margeOuverture: '', margeCloture: '', libelle: '' });
  const [ecartForm, setEcartForm] = useState({ lienId: '', compte: '', compteAmortissement: '', libelle: '', montant: '', mode: 'AMORTISSABLE', dureeAnnees: '', dateRealisation: '' });
  const [provForm, setProvForm] = useState({ entiteId: '', compteProvision: '', cloture: '', dotation: '', reprise: '' });
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

  const fiscaliteDe = (form: HTMLFormElement, entiteId: string | null) => {
    const f = new FormData(form);
    const txt = (k: string) => String(f.get(k) ?? '');
    return {
      exerciceId,
      entiteId,
      tauxImpotDiffere: nombre(txt('taux')),
      sourceTauxImpot: txt('source') || null,
      idaOuverture: nombre(txt('idaOuv')),
      idaCloture: nombre(txt('idaClo')),
      idpOuverture: nombre(txt('idpOuv')),
      idpCloture: nombre(txt('idpClo')),
      justificationIda: txt('justif') || null,
      ecartConversionActifN1: nombre(txt('ecaN1')),
      ecartConversionPassifN1: nombre(txt('ecpN1')),
    };
  };
  const vide = (v: number | null | undefined) => v == null;
  const fiscaliteIncomplete = (x: FiscaliteCumul | null | undefined) =>
    !x || vide(x.tauxImpotDiffere) || vide(x.idaOuverture) || vide(x.idaCloture) || vide(x.idpOuverture) || vide(x.idpCloture);

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
          groupe (D4C, ch. XII-3). Un nouvel import remplace le précédent. Le tableau des flux consolidé demande en plus les
          MOUVEMENTS de l’exercice · importez alors la balance à six colonnes (report, mouvements et solde, chacun en débit et en
          crédit), les colonnes étant reconnues à leur en-tête. Report et mouvements qui ne donnent pas le solde font refuser la ligne.
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

      <section className="border border-border bg-surface px-3.5 py-2.5 mb-2.5">
        <h2 className="text-[12.5px] font-bold mb-1.5">Résultats internes inclus dans les actifs</h2>
        <p className="text-[11px] text-text-dim mb-1.5 leading-[1.6]">
          Marge prise par une entité du groupe sur un stock ou une immobilisation encore détenu par une autre à la clôture
          (art. 86, 4°), déclarée à l’ouverture et à la clôture, nette de sa part amortie. Éliminée totalement entre entités
          intégrées globalement, au produit des pourcentages avec une entité intégrée proportionnellement (D4C ch. XII-5). Le
          texte ne dit pas qui la supporte · OmegaX retraite le résultat de la <strong>vendeuse</strong>, qui se partage à son
          pourcentage d’intérêt. Une marge d’incidence négligeable peut ne pas être déclarée (art. 86, dernier alinéa).
        </p>
        {peutEcrire && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 mb-2">
            <label className="text-[12px]">
              Vendeuse
              <select className={champ} value={interne.vendeuseId} onChange={(e) => setInterne({ ...interne, vendeuseId: e.target.value })}>
                <option value="">{consolidante.nom} (consolidante)</option>
                {entites.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
              </select>
            </label>
            <label className="text-[12px]">
              Acheteuse
              <select className={champ} value={interne.acheteuseId} onChange={(e) => setInterne({ ...interne, acheteuseId: e.target.value })}>
                <option value="">{consolidante.nom} (consolidante)</option>
                {entites.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
              </select>
            </label>
            <label className="text-[12px]">
              Nature
              <select className={champ} value={interne.nature} onChange={(e) => setInterne({ ...interne, nature: e.target.value })}>
                <option value="STOCK">Stock (classe 3)</option>
                <option value="IMMOBILISATION">Immobilisation (classe 2)</option>
              </select>
            </label>
            <label className="text-[12px]">Compte de l’acheteuse<input className={champ} value={interne.compteActif} onChange={(e) => setInterne({ ...interne, compteActif: e.target.value })} /></label>
            <label className="text-[12px]">Marge à l’ouverture (FC)<input className={champ} value={interne.margeOuverture} onChange={(e) => setInterne({ ...interne, margeOuverture: e.target.value })} /></label>
            <label className="text-[12px]">Marge à la clôture (FC)<input className={champ} value={interne.margeCloture} onChange={(e) => setInterne({ ...interne, margeCloture: e.target.value })} /></label>
            <label className="text-[12px]">Libellé<input className={champ} value={interne.libelle} onChange={(e) => setInterne({ ...interne, libelle: e.target.value })} /></label>
            <button
              className="border border-border px-2.5 py-1 text-[12px] justify-self-start"
              onClick={() =>
                void agir(async () => {
                  await api.post('/consolidation/resultats-internes', {
                    exerciceId,
                    vendeuseId: interne.vendeuseId || null,
                    acheteuseId: interne.acheteuseId || null,
                    nature: interne.nature,
                    compteActif: interne.compteActif,
                    margeOuverture: nombre(interne.margeOuverture) ?? 0,
                    margeCloture: nombre(interne.margeCloture),
                    libelle: interne.libelle,
                  });
                  setInterne({ ...interne, compteActif: '', margeOuverture: '', margeCloture: '', libelle: '' });
                })
              }
            >
              Ajouter
            </button>
          </div>
        )}
        {resultatsInternes.length === 0 ? (
          <p className="text-[12px] text-text-dim">Aucun résultat interne déclaré.</p>
        ) : (
          <table className="w-full text-[12px]">
            <tbody>
              {resultatsInternes.map((o) => (
                <tr key={o.id} className="border-b border-border/60">
                  <td className="py-1 pr-2">{o.libelle}</td>
                  <td className="py-1 pr-2">{nomDe(o.vendeuseId)} → {nomDe(o.acheteuseId)} · {o.compteActif}</td>
                  <td className="py-1 pr-2 text-right">{fc(o.margeOuverture)} / {fc(o.margeCloture)}</td>
                  <td className="py-1 text-right">
                    {peutEcrire && (
                      <button className="text-[11px] underline" onClick={() => void agir(() => api.delete(`/consolidation/resultats-internes/${o.id}`))}>
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

      <section className="border border-border bg-surface px-3.5 py-2.5 mb-2.5">
        <h2 className="text-[12.5px] font-bold mb-1.5">Écarts d’évaluation</h2>
        <p className="text-[11px] text-text-dim mb-1.5 leading-[1.6]">
          La part de l’écart de consolidation affectée à un élément <strong>identifiable</strong> de la détenue, à sa juste
          valeur à l’entrée (art. 82, D4C ch. XII-6) · une immobilisation, un stock ou un passif externe, jamais les capitaux
          propres. Il passe EN PRIORITÉ, et l’écart d’acquisition n’est que le reste. Montant positif si l’élément vaut plus au
          bilan consolidé qu’aux livres de la détenue. Chaque écart porte son impôt différé au taux déclaré de la détenue, et
          appartient aux majoritaires comme aux minoritaires. Aucun écart d’évaluation sur une entité mise en équivalence.
        </p>
        {peutEcrire && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 mb-2">
            <label className="text-[12px]">
              Participation
              <select className={champ} value={ecartForm.lienId} onChange={(e) => setEcartForm({ ...ecartForm, lienId: e.target.value })}>
                <option value="">Choisir…</option>
                {liens.map((l) => (
                  <option key={l.id} value={l.id}>
                    {nomDe(l.detentriceId)} → {nomDe(l.detenueId)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[12px]">Compte de l’élément<input className={champ} value={ecartForm.compte} onChange={(e) => setEcartForm({ ...ecartForm, compte: e.target.value })} /></label>
            <label className="text-[12px]">Écart à l’entrée (FC)<input className={champ} value={ecartForm.montant} onChange={(e) => setEcartForm({ ...ecartForm, montant: e.target.value })} /></label>
            <label className="text-[12px]">
              Sort dans le temps
              <select className={champ} value={ecartForm.mode} onChange={(e) => setEcartForm({ ...ecartForm, mode: e.target.value })}>
                <option value="AMORTISSABLE">Amortissable · immobilisation</option>
                <option value="NON_AMORTISSABLE">Non amortissable · terrain</option>
                <option value="REALISE">Réalisé à une date · stock vendu, bien cédé</option>
              </select>
            </label>
            {ecartForm.mode === 'AMORTISSABLE' && (
              <>
                <label className="text-[12px]">Durée restant à courir à l’entrée (années)<input className={champ} value={ecartForm.dureeAnnees} onChange={(e) => setEcartForm({ ...ecartForm, dureeAnnees: e.target.value })} /></label>
                <label className="text-[12px]">Compte d’amortissement (28)<input className={champ} value={ecartForm.compteAmortissement} onChange={(e) => setEcartForm({ ...ecartForm, compteAmortissement: e.target.value })} /></label>
              </>
            )}
            {ecartForm.mode === 'REALISE' && (
              <label className="text-[12px]">Date de réalisation<input type="date" className={champ} value={ecartForm.dateRealisation} onChange={(e) => setEcartForm({ ...ecartForm, dateRealisation: e.target.value })} /></label>
            )}
            <label className="text-[12px]">Libellé<input className={champ} value={ecartForm.libelle} onChange={(e) => setEcartForm({ ...ecartForm, libelle: e.target.value })} /></label>
            <button
              className="border border-border px-2.5 py-1 text-[12px] justify-self-start"
              disabled={!ecartForm.lienId}
              onClick={() =>
                void agir(async () => {
                  await api.post(`/consolidation/liens/${ecartForm.lienId}/ecarts-evaluation`, {
                    compte: ecartForm.compte,
                    compteAmortissement: ecartForm.mode === 'AMORTISSABLE' ? ecartForm.compteAmortissement || null : null,
                    libelle: ecartForm.libelle,
                    montant: nombre(ecartForm.montant),
                    mode: ecartForm.mode,
                    dureeAnnees: ecartForm.mode === 'AMORTISSABLE' ? nombre(ecartForm.dureeAnnees) : null,
                    dateRealisation: ecartForm.mode === 'REALISE' ? ecartForm.dateRealisation || null : null,
                  });
                  setEcartForm({ ...ecartForm, compte: '', compteAmortissement: '', libelle: '', montant: '', dureeAnnees: '', dateRealisation: '' });
                })
              }
            >
              Ajouter
            </button>
          </div>
        )}
        {ecartsEvaluation.length === 0 ? (
          <p className="text-[12px] text-text-dim">Aucun écart d’évaluation déclaré · l’écart de consolidation est alors tout entier écart d’acquisition.</p>
        ) : (
          <table className="w-full text-[12px]">
            <tbody>
              {ecartsEvaluation.map((o) => {
                const l = liens.find((x) => x.id === o.lienId);
                return (
                  <tr key={o.id} className="border-b border-border/60">
                    <td className="py-1 pr-2">{o.libelle}</td>
                    <td className="py-1 pr-2">{l ? nomDe(l.detenueId) : '?'} · {o.compte}</td>
                    <td className="py-1 pr-2">
                      {o.mode === 'AMORTISSABLE' ? `amorti sur ${o.dureeAnnees} ans (${o.compteAmortissement})` : o.mode === 'REALISE' ? `réalisé le ${o.dateRealisation?.slice(0, 10)}` : 'non amortissable'}
                    </td>
                    <td className="py-1 pr-2 text-right">{fc(o.montant)}</td>
                    <td className="py-1 text-right">
                      {peutEcrire && (
                        <button className="text-[11px] underline" onClick={() => void agir(() => api.delete(`/consolidation/ecarts-evaluation/${o.id}`))}>
                          Retirer
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className="border border-border bg-surface px-3.5 py-2.5 mb-2.5">
        <h2 className="text-[12.5px] font-bold mb-1.5">Fiscalité des entités · impôts différés</h2>
        <p className="text-[11px] text-text-dim mb-1.5 leading-[1.6]">
          Le taux est celui « en vigueur à la clôture » (D4C ch. XII-3 § 3), déclaré avec sa source · OmegaX n’en écrit aucun,
          une filiale étrangère n’ayant pas le taux de la mère. Les impôts différés des comptes individuels (décalages
          temporaires, déficits reportables, art. 92) se déclarent en <strong>montants d’impôt</strong> · leur base fiscale est
          dans la liasse de l’entité, pas dans sa balance. Zéro est une réponse, un champ vide n’en est pas une, et l’état
          consolidé reste non publiable tant qu’une entité n’a pas répondu. Un impôt différé actif demande d’écrire pourquoi son
          imputation est probable.
        </p>
        {[{ id: null as string | null, nom: `${consolidante.nom} (consolidante)`, f: fiscaliteConsolidante }, ...entites.map((e) => ({ id: e.id as string | null, nom: e.nom, f: e as FiscaliteCumul }))].map((x) => (
          <details key={x.id ?? 'consolidante'} className="border-b border-border/60 py-1">
            <summary className="text-[12px] cursor-pointer">
              {x.nom}
              {fiscaliteIncomplete(x.f) ? <span className="text-warning"> · déclaration incomplète</span> : null}
            </summary>
            <form
              className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 py-1.5"
              onSubmit={(ev) => {
                ev.preventDefault();
                void agir(() => api.put('/consolidation/fiscalite', fiscaliteDe(ev.currentTarget, x.id)));
              }}
            >
              <label className="text-[12px]">Taux d’impôt (%)<input name="taux" className={champ} defaultValue={x.f?.tauxImpotDiffere ?? ''} disabled={!peutEcrire} /></label>
              <label className="text-[12px] sm:col-span-2">Source du taux<input name="source" className={champ} defaultValue={x.f?.sourceTauxImpot ?? ''} disabled={!peutEcrire} /></label>
              <label className="text-[12px]">Impôt différé actif, ouverture<input name="idaOuv" className={champ} defaultValue={x.f?.idaOuverture ?? ''} disabled={!peutEcrire} /></label>
              <label className="text-[12px]">Impôt différé actif, clôture<input name="idaClo" className={champ} defaultValue={x.f?.idaCloture ?? ''} disabled={!peutEcrire} /></label>
              <span />
              <label className="text-[12px]">Impôt différé passif, ouverture<input name="idpOuv" className={champ} defaultValue={x.f?.idpOuverture ?? ''} disabled={!peutEcrire} /></label>
              <label className="text-[12px]">Impôt différé passif, clôture<input name="idpClo" className={champ} defaultValue={x.f?.idpCloture ?? ''} disabled={!peutEcrire} /></label>
              <span />
              <label className="text-[12px]">Écarts de conversion actif (478), N-1<input name="ecaN1" className={champ} defaultValue={x.f?.ecartConversionActifN1 ?? ''} disabled={!peutEcrire} /></label>
              <label className="text-[12px]">Écarts de conversion passif (479), N-1<input name="ecpN1" className={champ} defaultValue={x.f?.ecartConversionPassifN1 ?? ''} disabled={!peutEcrire} /></label>
              <span />
              <label className="text-[12px] sm:col-span-3">Pourquoi l’impôt différé actif est probable<input name="justif" className={champ} defaultValue={x.f?.justificationIda ?? ''} disabled={!peutEcrire} /></label>
              {peutEcrire && (
                <button type="submit" className="border border-border px-2.5 py-1 text-[12px] sm:col-span-3 justify-self-start">
                  Enregistrer
                </button>
              )}
            </form>
          </details>
        ))}
      </section>

      <section className="border border-border bg-surface px-3.5 py-2.5 mb-2.5">
        <h2 className="text-[12.5px] font-bold mb-1.5">Monnaie des entités · conversion</h2>
        <p className="text-[11px] text-text-dim mb-1.5 leading-[1.6]">
          Chaque entité déclare la monnaie de sa balance importée, qui doit être sa monnaie <strong>fonctionnelle</strong> (celle
          des prix de vente, des coûts et du financement, D4C ch. XII-4 § 1). Dans la monnaie des états consolidés, rien n’est
          converti ; dans une autre, la méthode du cours de clôture s’applique (§ 3) · actifs et passifs au cours de clôture,
          charges et produits au cours moyen de l’exercice ou de clôture, capitaux propres au cours historique, déclarés ici en
          montant. Les cours sont le prix d’<strong>une</strong> unité de la monnaie de l’entité. Le cours d’entrée sert à
          convertir l’écart d’acquisition. Une comptabilité tenue dans une autre monnaie que la fonctionnelle se convertit
          d’abord par la méthode temporelle, avant l’import. Tant qu’une entité n’a pas déclaré sa monnaie, l’état consolidé
          n’est pas publiable.
        </p>
        {entites.map((e) => (
          <details key={e.id} className="border-b border-border/60 py-1">
            <summary className="text-[12px] cursor-pointer">
              {e.nom}
              {e.monnaieBalance ? <span className="text-text-dim"> · {e.monnaieBalance}</span> : <span className="text-warning"> · monnaie non déclarée</span>}
            </summary>
            <form
              className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 py-1.5"
              onSubmit={(ev) => {
                ev.preventDefault();
                const f = new FormData(ev.currentTarget);
                const txt = (k: string) => String(f.get(k) ?? '');
                void agir(() =>
                  api.put(`/consolidation/entites/${e.id}/monnaie`, {
                    monnaieBalance: txt('monnaie').trim() || null,
                    justificationMonnaie: txt('justifMonnaie') || null,
                    hyperinflation: f.get('hyper') === 'on',
                    coursCloture: nombre(txt('coursClo')),
                    coursProduitsCharges: nombre(txt('coursPc')),
                    coursEntree: nombre(txt('coursEntree')),
                    capitauxPropresHistoriques: nombre(txt('cpHist')),
                  }),
                );
              }}
            >
              <label className="text-[12px]">Monnaie de la balance (code ISO)<input name="monnaie" className={champ} defaultValue={e.monnaieBalance ?? ''} disabled={!peutEcrire} /></label>
              <label className="text-[12px] sm:col-span-2">Pourquoi c’est sa monnaie fonctionnelle<input name="justifMonnaie" className={champ} defaultValue={e.justificationMonnaie ?? ''} disabled={!peutEcrire} /></label>
              <label className="text-[12px]">Cours de clôture<input name="coursClo" className={champ} defaultValue={e.coursCloture ?? ''} disabled={!peutEcrire} /></label>
              <label className="text-[12px]">Cours des charges et produits<input name="coursPc" className={champ} defaultValue={e.coursProduitsCharges ?? ''} disabled={!peutEcrire} /></label>
              <label className="text-[12px]">Cours à la date d’entrée<input name="coursEntree" className={champ} defaultValue={e.coursEntree ?? ''} disabled={!peutEcrire} /></label>
              <label className="text-[12px] sm:col-span-2">Capitaux propres hors résultat, au cours historique (monnaie des états)<input name="cpHist" className={champ} defaultValue={e.capitauxPropresHistoriques ?? ''} disabled={!peutEcrire} /></label>
              <label className="text-[12px] flex items-center gap-1.5">
                <input type="checkbox" name="hyper" defaultChecked={e.hyperinflation ?? false} disabled={!peutEcrire} /> Économie hyperinflationniste
              </label>
              {peutEcrire && (
                <button type="submit" className="border border-border px-2.5 py-1 text-[12px] sm:col-span-3 justify-self-start">
                  Enregistrer
                </button>
              )}
            </form>
          </details>
        ))}
      </section>

      <section className="border border-border bg-surface px-3.5 py-2.5 mb-2.5">
        <h2 className="text-[12.5px] font-bold mb-1.5">Provisions pour pertes de change</h2>
        <p className="text-[11px] text-text-dim mb-1.5 leading-[1.6]">
          Les écarts de conversion des comptes individuels (478, 479) s’éliminent en consolidation · il faut pour cela les
          déclarer en N-1 dans la fiscalité de l’entité (ci-dessus), et déclarer ici la provision qui couvrait la perte latente,
          avec sa dotation et sa reprise de l’exercice. Elle se loge au 194, au 4991 ou au 4997 · OmegaX ne la devine pas dans
          la balance · le solde du compte ne dit pas quelle part couvre la perte latente. Sans déclaration N-1, les 478 et 479 restent
          en l’état.
        </p>
        {peutEcrire && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 mb-2">
            <label className="text-[12px]">
              Entité
              <select className={champ} value={provForm.entiteId} onChange={(e) => setProvForm({ ...provForm, entiteId: e.target.value })}>
                <option value="">{consolidante.nom} (consolidante)</option>
                {entites.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
              </select>
            </label>
            <label className="text-[12px]">Compte de la provision<input className={champ} value={provForm.compteProvision} onChange={(e) => setProvForm({ ...provForm, compteProvision: e.target.value })} /></label>
            <label className="text-[12px]">Solde à la clôture<input className={champ} value={provForm.cloture} onChange={(e) => setProvForm({ ...provForm, cloture: e.target.value })} /></label>
            <label className="text-[12px]">Dotation de l’exercice<input className={champ} value={provForm.dotation} onChange={(e) => setProvForm({ ...provForm, dotation: e.target.value })} /></label>
            <label className="text-[12px]">Reprise de l’exercice<input className={champ} value={provForm.reprise} onChange={(e) => setProvForm({ ...provForm, reprise: e.target.value })} /></label>
            <button
              className="border border-border px-2.5 py-1 text-[12px] justify-self-start self-end"
              onClick={() =>
                void agir(async () => {
                  await api.post('/consolidation/provisions-change', {
                    exerciceId,
                    entiteId: provForm.entiteId || null,
                    compteProvision: provForm.compteProvision,
                    cloture: nombre(provForm.cloture) ?? 0,
                    dotation: nombre(provForm.dotation) ?? 0,
                    reprise: nombre(provForm.reprise) ?? 0,
                  });
                  setProvForm({ entiteId: provForm.entiteId, compteProvision: '', cloture: '', dotation: '', reprise: '' });
                })
              }
            >
              Ajouter
            </button>
          </div>
        )}
        {provisionsChange.length === 0 ? (
          <p className="text-[12px] text-text-dim">Aucune provision pour pertes de change déclarée.</p>
        ) : (
          <table className="w-full text-[12px]">
            <tbody>
              {provisionsChange.map((o) => (
                <tr key={o.id} className="border-b border-border/60">
                  <td className="py-1 pr-2">{nomDe(o.entiteId)} · {o.compteProvision}</td>
                  <td className="py-1 pr-2 text-right">clôture {fc(o.cloture)}</td>
                  <td className="py-1 pr-2 text-right">dotation {fc(o.dotation)}</td>
                  <td className="py-1 pr-2 text-right">reprise {fc(o.reprise)}</td>
                  <td className="py-1 text-right">
                    {peutEcrire && (
                      <button className="text-[11px] underline" onClick={() => void agir(() => api.delete(`/consolidation/provisions-change/${o.id}`))}>
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
                <tr><td className="pr-3">Écarts de conversion (part du groupe)</td><td className="text-right">{fc(resultat.capitauxPropres.ecartsConversion ?? 0)}</td></tr>
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
