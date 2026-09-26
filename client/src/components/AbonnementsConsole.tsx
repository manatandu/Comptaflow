import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';

interface Formule {
  id: string;
  code: string;
  libelle: string;
  type: 'FORMULE' | 'OPTION';
  contenu: string | null;
  prixMensuelUsd: number | null;
  prixAnnuelUsd: number | null;
}
interface Abonnement {
  id: string;
  cabinet: string;
  formule: { code: string; libelle: string };
  options: { code: string; libelle: string }[];
  dossiersSupplementaires: number;
  periodicite: 'MENSUELLE' | 'ANNUELLE';
  debut: string;
  finEssai: string | null;
  tiers: string;
  actif: boolean;
  echeanceLicence: string | null;
  licenceSuspendue: boolean;
  factures: { id: string; periode: string; montantUsd: number; numero: string; emiseLe: string | null; payeeLe: string | null; joursImpayee: number | null }[];
}
interface Resultat {
  cabinet: string;
  statut: 'FACTURE' | 'DEJA_FACTURE' | 'NON_DU';
  motif?: string;
  numero?: string;
  totalUsd?: number;
  courriel?: string;
}

/** Ce que la file a fait d'un courriel · « en file » n'est pas « envoyé ». */
const statutCourriel = (s: string) =>
  s === 'ENVOYE' ? 'envoyé' : s === 'SANS_TRANSPORT' ? 'en file, messagerie non configurée' : `en file (${s})`;

const champ = 'border border-border px-2 py-1 text-[11.5px] bg-surface';
const aujourdhui = () => new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);

/** Un prix saisi · vide veut dire « pas encore arrêté », jamais zéro. */
function lirePrix(v: string): number | null {
  const n = Number(v.replace(',', '.'));
  return v.trim() === '' || !Number.isFinite(n) ? null : n;
}

/**
 * LES ABONNEMENTS DES CABINETS, dans la console de l'éditeur · la grille et
 * ses prix, l'abonnement de chaque dossier, et la facturation d'une période.
 * Les factures naissent dans le dossier de VMG, par le module de facturation ;
 * ce cadre n'en garde que le lien.
 */
export function AbonnementsConsole({ cabinets }: { cabinets: { id: string; nom: string }[] }) {
  const [formules, setFormules] = useState<Formule[]>([]);
  const [abonnements, setAbonnements] = useState<Abonnement[]>([]);
  const [tiers, setTiers] = useState<{ id: string; nom: string }[]>([]);
  const [taux, setTaux] = useState<{ id: string; intitule: string }[]>([]);
  const [prix, setPrix] = useState<Record<string, { m: string; a: string }>>({});
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [resultats, setResultats] = useState<Resultat[] | null>(null);
  const [f, setF] = useState({ cabinetId: '', formuleCode: 'ESSENTIEL', options: [] as string[], dossiersSupplementaires: '0', periodicite: 'MENSUELLE', debut: aujourdhui(), essai: true, tiersId: '' });
  const [fac, setFac] = useState({ periode: aujourdhui().slice(0, 7), dateFacture: aujourdhui(), tauxTvaId: '', envoyer: false });

  const charger = async () => {
    const [fo, ab] = await Promise.all([api.get<Formule[]>('/plateforme/formules'), api.get<Abonnement[]>('/plateforme/abonnements')]);
    setFormules(fo);
    setAbonnements(ab);
    setPrix(Object.fromEntries(fo.map((x) => [x.code, { m: x.prixMensuelUsd?.toString() ?? '', a: x.prixAnnuelUsd?.toString() ?? '' }])));
  };
  useEffect(() => {
    charger().catch(() => undefined);
    api.get<{ id: string; nom: string }[]>('/tiers?type=CLIENT&actifsSeuls=true').then(setTiers).catch(() => setTiers([]));
    api.get<{ id: string; intitule: string }[]>('/taux-tva?actifsSeuls=true').then(setTaux).catch(() => setTaux([]));
  }, []);

  const agir = async (action: () => Promise<unknown>) => {
    setErreur(null);
    setInfo(null);
    try {
      await action();
      await charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'L’opération a échoué.');
    }
  };

  const enregistrerPrix = (code: string) =>
    agir(() => api.patch(`/plateforme/formules/${code}`, { prixMensuelUsd: lirePrix(prix[code].m), prixAnnuelUsd: lirePrix(prix[code].a) }));

  const enregistrerAbonnement = (e: FormEvent) => {
    e.preventDefault();
    return agir(() => api.post('/plateforme/abonnements', { ...f, dossiersSupplementaires: Number(f.dossiersSupplementaires) }));
  };

  const facturer = (e: FormEvent) => {
    e.preventDefault();
    return agir(async () => {
      const r = await api.post<{ resultats: Resultat[] }>('/plateforme/abonnements/facturer', { ...fac, tauxTvaId: fac.tauxTvaId || null });
      setResultats(r.resultats);
    });
  };

  // L'encaissement se déclare à la date du jour, modifiable · c'est lui qui
  // prolonge la licence du client.
  const encaisser = (id: string) => {
    const payeeLe = window.prompt('Date d’encaissement (AAAA-MM-JJ)', aujourdhui());
    if (payeeLe) void agir(() => api.patch(`/plateforme/abonnements/factures/${id}/payee`, { payeeLe }));
  };

  // Vide · l'adresse du client facturé, lue sur sa fiche de tiers.
  const envoyer = (id: string, numero: string) => {
    const destinataire = window.prompt(`Envoyer la facture ${numero} à (vide : l’adresse du client)`, '');
    if (destinataire === null) return;
    void agir(async () => {
      const r = await api.post<{ statut: string }>(`/plateforme/abonnements/factures/${id}/envoyer`, { destinataire: destinataire.trim() || null });
      setInfo(`Facture ${numero} · courriel ${statutCourriel(r.statut)}.`);
    });
  };

  const options = formules.filter((x) => x.type === 'OPTION');
  return (
    <section className="border border-border bg-surface px-3.5 py-2.5 mt-3 text-[11.5px]">
      <h2 className="font-bold mb-2">Abonnements</h2>
      {erreur && (
        <p role="alert" className="border border-danger/30 bg-danger-soft px-3 py-2 mb-2">
          {erreur}
        </p>
      )}
      {info && <p className="mb-2">{info}</p>}

      <h3 className="font-semibold mb-1">Formules et prix (USD)</h3>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="text-left">Formule</th>
              <th className="text-left">Contenu</th>
              <th className="text-right">Mois</th>
              <th className="text-right">An</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {formules.map((x) => (
              <tr key={x.code}>
                <td>{x.libelle}</td>
                <td className="text-text-dim">{x.contenu}</td>
                <td className="text-right">
                  <input className={`${champ} w-20 text-right`} value={prix[x.code]?.m ?? ''} placeholder="non fixé" onChange={(e) => setPrix({ ...prix, [x.code]: { ...prix[x.code], m: e.target.value } })} />
                </td>
                <td className="text-right">
                  <input className={`${champ} w-20 text-right`} value={prix[x.code]?.a ?? ''} placeholder="non fixé" onChange={(e) => setPrix({ ...prix, [x.code]: { ...prix[x.code], a: e.target.value } })} />
                </td>
                <td>
                  <button type="button" className="underline" onClick={() => enregistrerPrix(x.code)}>
                    Enregistrer
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="font-semibold mt-3 mb-1">Abonnement d’un dossier</h3>
      <form onSubmit={enregistrerAbonnement} className="grid grid-cols-1 sm:grid-cols-[150px_1fr] gap-x-3 gap-y-1.5 items-center">
        <span className="text-text-dim">Dossier</span>
        <select className={champ} value={f.cabinetId} onChange={(e) => setF({ ...f, cabinetId: e.target.value })} required>
          <option value="">Choisir…</option>
          {cabinets.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nom}
            </option>
          ))}
        </select>
        <span className="text-text-dim">Client facturé</span>
        <select className={champ} value={f.tiersId} onChange={(e) => setF({ ...f, tiersId: e.target.value })} required>
          <option value="">Tiers client du dossier de VMG…</option>
          {tiers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nom}
            </option>
          ))}
        </select>
        <span className="text-text-dim">Formule</span>
        <select className={champ} value={f.formuleCode} onChange={(e) => setF({ ...f, formuleCode: e.target.value })}>
          {formules
            .filter((x) => x.type === 'FORMULE')
            .map((x) => (
              <option key={x.code} value={x.code}>
                {x.libelle}
              </option>
            ))}
        </select>
        <span className="text-text-dim">Options</span>
        <div className="flex flex-wrap gap-3">
          {options.map((o) => (
            <label key={o.code} className="inline-flex items-center gap-1">
              <input
                type="checkbox"
                checked={f.options.includes(o.code)}
                onChange={(e) => setF({ ...f, options: e.target.checked ? [...f.options, o.code] : f.options.filter((c) => c !== o.code) })}
              />
              {o.libelle}
            </label>
          ))}
        </div>
        <span className="text-text-dim">Dossiers supplémentaires</span>
        <input type="number" min={0} className={`${champ} w-24`} value={f.dossiersSupplementaires} onChange={(e) => setF({ ...f, dossiersSupplementaires: e.target.value })} />
        <span className="text-text-dim">Paiement</span>
        <select className={champ} value={f.periodicite} onChange={(e) => setF({ ...f, periodicite: e.target.value })}>
          <option value="MENSUELLE">Mensuel</option>
          <option value="ANNUELLE">Annuel</option>
        </select>
        <span className="text-text-dim">Début</span>
        <input type="date" className={champ} value={f.debut} onChange={(e) => setF({ ...f, debut: e.target.value })} required />
        <span />
        <label className="inline-flex items-center gap-1">
          <input type="checkbox" checked={f.essai} onChange={(e) => setF({ ...f, essai: e.target.checked })} />
          Trente jours d’essai gratuit
        </label>
        <span />
        <div>
          <button type="submit" className="bg-sel text-white px-3 py-1.5 font-semibold">
            Enregistrer l’abonnement
          </button>
        </div>
      </form>

      {abonnements.length > 0 && (
        <div className="overflow-x-auto mt-3">
          <table className="w-full">
            <thead>
              <tr>
                <th className="text-left">Dossier</th>
                <th className="text-left">Formule</th>
                <th className="text-left">Paiement</th>
                <th className="text-left">Essai jusqu’au</th>
                <th className="text-left">Licence jusqu’au</th>
                <th className="text-left">Factures impayées</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {abonnements.map((a) => (
                <tr key={a.id} className={a.actif ? '' : 'text-text-dim'}>
                  <td>{a.cabinet}</td>
                  <td>
                    {a.formule.libelle}
                    {a.options.length > 0 && ` + ${a.options.map((o) => o.libelle).join(', ')}`}
                    {a.dossiersSupplementaires > 0 && ` (+${a.dossiersSupplementaires} dossiers)`}
                  </td>
                  <td>{a.periodicite === 'ANNUELLE' ? 'Annuel' : 'Mensuel'}</td>
                  <td>{a.finEssai ?? 'sans essai'}</td>
                  <td className={a.licenceSuspendue ? 'text-danger' : ''}>{a.licenceSuspendue ? 'suspendue' : (a.echeanceLicence ?? '·')}</td>
                  <td>
                    {a.factures.filter((x) => !x.payeeLe).length === 0
                      ? 'aucune'
                      : a.factures
                          .filter((x) => !x.payeeLe)
                          .map((x) => (
                            <div key={x.id} className="flex items-center gap-2">
                              <span className={(x.joursImpayee ?? 0) > 15 ? 'text-danger' : ''}>
                                {x.numero} · {x.montantUsd} USD · {x.joursImpayee} j
                              </span>
                              <button type="button" className="underline" onClick={() => encaisser(x.id)}>
                                Encaissée
                              </button>
                              <button type="button" className="underline" onClick={() => envoyer(x.id, x.numero)}>
                                Envoyer
                              </button>
                            </div>
                          ))}
                  </td>
                  <td>
                    <button type="button" className="underline" onClick={() => agir(() => api.patch(`/plateforme/abonnements/${a.id}`, { actif: !a.actif }))}>
                      {a.actif ? 'Suspendre' : 'Reprendre'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3 className="font-semibold mt-3 mb-1">Facturer une période</h3>
      <form onSubmit={facturer} className="flex flex-wrap items-center gap-2">
        <input type="month" className={champ} value={fac.periode} onChange={(e) => setFac({ ...fac, periode: e.target.value })} required />
        <input type="date" className={champ} value={fac.dateFacture} onChange={(e) => setFac({ ...fac, dateFacture: e.target.value })} required />
        <select className={champ} value={fac.tauxTvaId} onChange={(e) => setFac({ ...fac, tauxTvaId: e.target.value })} title="Seulement si le dossier de VMG est assujetti à la TVA">
          <option value="">Sans TVA (non assujetti)</option>
          {taux.map((t) => (
            <option key={t.id} value={t.id}>
              {t.intitule}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={fac.envoyer} onChange={(e) => setFac({ ...fac, envoyer: e.target.checked })} />
          Envoyer par courriel aux clients
        </label>
        <button type="submit" className="bg-sel text-white px-3 py-1.5 font-semibold">
          Facturer
        </button>
      </form>
      {resultats && (
        <ul className="mt-2 space-y-0.5">
          {resultats.map((r) => (
            <li key={r.cabinet}>
              <strong>{r.cabinet}</strong> ·{' '}
              {r.statut === 'FACTURE' ? `facture ${r.numero}, ${r.totalUsd} USD` : r.statut === 'DEJA_FACTURE' ? 'déjà facturé pour cette période' : r.motif}
              {r.courriel && ` · ${r.courriel}`}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
