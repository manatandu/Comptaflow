import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Aide } from '../components/chrome/Aide';
import type { Journal } from '../lib/types';

/**
 * BANQUES (point 19 de la comparaison Sage i7) · Structure / Banque. La liste
 * des établissements, puis la fiche · coordonnées et RIB, chaque RIB rattaché
 * au plus à un journal de banque. Les règles sont au serveur
 * (`banques/banques.ts`) · IBAN contrôlé (ISO 13616), journal de trésorerie
 * hors caisse, un RIB par journal.
 */
interface Rib {
  id: string;
  abrege: string;
  devise: string | null;
  codeBic: string | null;
  codeBanque: string | null;
  codeGuichet: string | null;
  numeroCompte: string | null;
  cle: string | null;
  iban: string | null;
  commentaire: string | null;
  journal: { id: string; code: string; intitule: string } | null;
}
interface Banque {
  id: string;
  intitule: string;
  adresse: string | null;
  codePostal: string | null;
  ville: string | null;
  pays: string | null;
  telephone: string | null;
  email: string | null;
  contact: string | null;
  ribs: Rib[];
}

const CHAMPS_BANQUE: Array<[keyof Banque, string]> = [
  ['intitule', 'Intitulé'],
  ['adresse', 'Adresse'],
  ['codePostal', 'Code postal'],
  ['ville', 'Ville'],
  ['pays', 'Pays'],
  ['telephone', 'Téléphone'],
  ['email', 'Courriel'],
  ['contact', 'Contact'],
];
const CHAMPS_RIB: Array<[string, string, number]> = [
  ['abrege', 'Abrégé', 17],
  ['devise', 'Devise', 3],
  ['codeBic', 'Code BIC', 11],
  ['codeBanque', 'Code banque', 20],
  ['codeGuichet', 'Code guichet', 20],
  ['numeroCompte', 'N° de compte', 34],
  ['cle', 'Clé', 4],
  ['iban', 'IBAN', 42],
];

const champ = 'border border-border-dark px-2 py-1 text-[11.5px] w-full';

export function BanquesPage() {
  const { estAdmin } = useAuth();
  const [banques, setBanques] = useState<Banque[] | null>(null);
  const [journaux, setJournaux] = useState<Journal[]>([]);
  const [choisie, setChoisie] = useState<string | null>(null);
  const [fiche, setFiche] = useState<Record<string, string>>({});
  const [rib, setRib] = useState<Record<string, string>>({});
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const charger = async () => {
    try {
      setBanques(await api.get<Banque[]>('/banques'));
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Lecture impossible');
    }
  };
  useEffect(() => {
    void charger();
    api
      .get<Journal[]>('/journaux')
      .then((js) => setJournaux(js.filter((j) => j.type === 'TRESORERIE')))
      .catch(() => setJournaux([]));
  }, []);

  const banque = banques?.find((b) => b.id === choisie) ?? null;
  useEffect(() => {
    setFiche(banque ? Object.fromEntries(CHAMPS_BANQUE.map(([k]) => [k, (banque[k] as string | null) ?? ''])) : {});
    setRib({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choisie, banques]);

  const agir = async (fn: () => Promise<unknown>, message: string) => {
    setErreur(null);
    setInfo(null);
    try {
      await fn();
      setInfo(message);
      await charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Action impossible');
    }
  };

  const nouvelle = () =>
    agir(async () => {
      const intitule = window.prompt('Intitulé de la banque');
      if (!intitule?.trim()) return;
      const b = await api.post<Banque>('/banques', { intitule });
      setChoisie(b.id);
    }, 'Banque créée.');

  const enregistrerFiche = (e: FormEvent) => {
    e.preventDefault();
    if (!banque) return;
    void agir(() => api.patch(`/banques/${banque.id}`, fiche), 'Fiche enregistrée.');
  };

  const ajouterRib = (e: FormEvent) => {
    e.preventDefault();
    if (!banque) return;
    void agir(() => api.post(`/banques/${banque.id}/ribs`, rib), 'RIB ajouté.');
  };

  return (
    <div className="p-2">
      <div className="flex items-center justify-end gap-2 mb-2">
        <Aide
          titre="Banques"
          texte="Les coordonnées de l'établissement bancaire et ses RIB. Un RIB se rattache au plus à un journal de banque (journal de trésorerie qui ne porte pas une caisse), et un journal n'a qu'un RIB. L'IBAN, facultatif, est contrôlé par sa clé (ISO 13616) ; les autres codes sont conservés tels quels."
          source="Sage 100 i7 · Structure / Banque"
        />
        {estAdmin && (
          <button type="button" onClick={() => void nouvelle()} className="bg-sel text-white px-3.5 py-1 text-[11.5px] font-semibold">
            Nouvelle banque
          </button>
        )}
      </div>
      {erreur && <div className="text-[11.5px] text-danger bg-danger-soft border border-danger/30 px-3 py-1.5 mb-2">{erreur}</div>}
      {info && <div className="text-[11.5px] text-positive bg-positive-soft border border-positive/30 px-3 py-1.5 mb-2">{info}</div>}
      <div className="grid gap-3 md:grid-cols-[300px_1fr]">
        <div className="overflow-x-auto">
          <table className="w-full text-[11.5px]">
            <thead>
              <tr>
                <th className="text-left">Intitulé</th>
                <th className="text-left">Code postal</th>
                <th className="text-left">Ville</th>
              </tr>
            </thead>
            <tbody>
              {banques?.map((b) => (
                <tr
                  key={b.id}
                  onClick={() => setChoisie(b.id)}
                  className={`cursor-pointer ${b.id === choisie ? 'bg-sel-soft font-semibold' : ''}`}
                >
                  <td>{b.intitule}</td>
                  <td>{b.codePostal ?? ''}</td>
                  <td>{b.ville ?? ''}</td>
                </tr>
              ))}
              {banques?.length === 0 && (
                <tr>
                  <td colSpan={3} className="italic text-text-dim">
                    Aucune banque.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {banque && (
          <div className="min-w-0">
            <form onSubmit={enregistrerFiche} className="grid grid-cols-[110px_1fr] items-center gap-x-2 gap-y-1.5 mb-3">
              {CHAMPS_BANQUE.map(([k, libelle]) => (
                <label key={k} className="contents">
                  <span className="text-[11.5px] text-right">{libelle}</span>
                  <input
                    aria-label={libelle}
                    value={fiche[k] ?? ''}
                    onChange={(e) => setFiche((f) => ({ ...f, [k]: e.target.value }))}
                    disabled={!estAdmin}
                    className={champ}
                  />
                </label>
              ))}
              {estAdmin && (
                <div className="col-start-2 flex gap-2">
                  <button type="submit" className="bg-sel text-white px-3.5 py-1 text-[11.5px] font-semibold">
                    Enregistrer
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Supprimer la banque ${banque.intitule} et ses RIB ?`))
                        void agir(async () => {
                          await api.delete(`/banques/${banque.id}`);
                          setChoisie(null);
                        }, 'Banque supprimée.');
                    }}
                    className="text-[11.5px] text-danger hover:underline"
                  >
                    Supprimer
                  </button>
                </div>
              )}
            </form>
            <div className="overflow-x-auto">
              <table className="w-full text-[11.5px] min-w-[760px]">
                <thead>
                  <tr>
                    {CHAMPS_RIB.map(([, l]) => (
                      <th key={l} className="text-left">
                        {l}
                      </th>
                    ))}
                    <th className="text-left">Journal banque</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {banque.ribs.map((r) => (
                    <tr key={r.id}>
                      {CHAMPS_RIB.map(([k]) => (
                        <td key={k}>{(r as unknown as Record<string, string | null>)[k] ?? ''}</td>
                      ))}
                      <td>{r.journal ? `${r.journal.code} · ${r.journal.intitule}` : ''}</td>
                      <td>
                        {estAdmin && (
                          <button
                            type="button"
                            onClick={() => void agir(() => api.delete(`/ribs-banque/${r.id}`), 'RIB supprimé.')}
                            className="text-danger hover:underline"
                          >
                            Supprimer
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {estAdmin && (
              <form onSubmit={ajouterRib} className="mt-2 grid grid-cols-2 md:grid-cols-5 gap-1.5 items-end">
                {CHAMPS_RIB.map(([k, l, max]) => (
                  <label key={k} className="flex flex-col gap-0.5 text-[10.5px] text-text-dim">
                    {l}
                    <input
                      aria-label={`RIB ${l}`}
                      maxLength={max}
                      value={rib[k] ?? ''}
                      onChange={(e) => setRib((x) => ({ ...x, [k]: e.target.value }))}
                      className={champ}
                    />
                  </label>
                ))}
                <label className="flex flex-col gap-0.5 text-[10.5px] text-text-dim">
                  Journal banque
                  <select
                    aria-label="RIB Journal banque"
                    value={rib.journalId ?? ''}
                    onChange={(e) => setRib((x) => ({ ...x, journalId: e.target.value }))}
                    className={champ}
                  >
                    <option value="">Aucun</option>
                    {journaux.map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.code} · {j.intitule}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="submit" className="bg-sel text-white px-3.5 py-1 text-[11.5px] font-semibold">
                  Ajouter le RIB
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
