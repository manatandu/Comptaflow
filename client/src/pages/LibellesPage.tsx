import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Aide } from '../components/chrome/Aide';

/**
 * LIBELLÉS (point 19 de la comparaison Sage i7) · Structure / Libellé. Des
 * libellés « pré-enregistrés », que la saisie propose au fil de la frappe. Un
 * libellé n'impute rien · il n'écrit que le texte de la ligne.
 */
interface Libelle {
  id: string;
  code: string;
  intitule: string;
}

export function LibellesPage() {
  const { estAdmin } = useAuth();
  const [liste, setListe] = useState<Libelle[] | null>(null);
  const [code, setCode] = useState('');
  const [intitule, setIntitule] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = async () => setListe(await api.get<Libelle[]>('/libelles-ecriture'));
  useEffect(() => {
    charger().catch(() => setListe([]));
  }, []);

  const agir = async (fn: () => Promise<unknown>) => {
    setErreur(null);
    try {
      await fn();
      await charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Action impossible');
    }
  };

  const creer = (e: FormEvent) => {
    e.preventDefault();
    void agir(async () => {
      await api.post('/libelles-ecriture', { code, intitule });
      setCode('');
      setIntitule('');
    });
  };

  return (
    <div className="p-2 max-w-[720px]">
      <div className="flex items-center justify-end mb-2">
        <Aide
          titre="Libellés"
          texte="Des libellés pré-enregistrés, proposés dans la saisie des journaux dès qu'on commence à taper le libellé de la pièce ou de la ligne. Un libellé n'impute rien : il n'écrit que le texte."
          source="Sage 100 i7 · Structure / Libellé"
        />
      </div>
      {erreur && <div className="text-[11.5px] text-danger bg-danger-soft border border-danger/30 px-3 py-1.5 mb-2">{erreur}</div>}
      <table className="w-full text-[11.5px]">
        <thead>
          <tr>
            <th className="text-left w-[120px]">Code</th>
            <th className="text-left">Intitulé</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {liste?.map((l) => (
            <tr key={l.id}>
              <td className="font-semibold">{l.code}</td>
              <td>
                {estAdmin ? (
                  <input
                    aria-label={`Intitulé ${l.code}`}
                    defaultValue={l.intitule}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== l.intitule) void agir(() => api.patch(`/libelles-ecriture/${l.id}`, { intitule: v }));
                    }}
                    className="w-full border border-transparent hover:border-border px-1 py-0.5"
                  />
                ) : (
                  l.intitule
                )}
              </td>
              <td className="text-right">
                {estAdmin && (
                  <button type="button" onClick={() => void agir(() => api.delete(`/libelles-ecriture/${l.id}`))} className="text-danger hover:underline">
                    Supprimer
                  </button>
                )}
              </td>
            </tr>
          ))}
          {liste?.length === 0 && (
            <tr>
              <td colSpan={3} className="italic text-text-dim">
                Aucun libellé.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {estAdmin && (
        <form onSubmit={creer} className="mt-2 flex gap-2 items-end">
          <input
            required
            aria-label="Code du libellé"
            maxLength={20}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Code"
            className="border border-border-dark px-2 py-1 text-[11.5px] w-[120px]"
          />
          <input
            required
            aria-label="Intitulé du libellé"
            maxLength={200}
            value={intitule}
            onChange={(e) => setIntitule(e.target.value)}
            placeholder="Intitulé"
            className="border border-border-dark px-2 py-1 text-[11.5px] flex-1"
          />
          <button type="submit" className="bg-sel text-white px-3.5 py-1 text-[11.5px] font-semibold">
            Ajouter
          </button>
        </form>
      )}
    </div>
  );
}
