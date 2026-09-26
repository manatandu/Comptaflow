import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';

interface LicenceEmise {
  id: string;
  numero: string;
  titulaire: string;
  empreinteMachine: string;
  emiseLe: string;
  finMaintenance: string;
  expiration: string | null;
  dossiersMax: number;
  emisePar: string;
}

/** Télécharge le fichier signé tel qu'il a été émis · le client le dépose sur son écran d'ouverture. */
function enregistrer(numero: string, texte: string) {
  const url = URL.createObjectURL(new Blob([texte], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `licence-${numero}.omegax`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * LICENCES SUR SITE, dans la console de l'opérateur · émettre pour une
 * empreinte de poste, retrouver et renvoyer un fichier déjà émis. La
 * signature se fait au serveur, la clé privée ne quitte jamais son secret.
 */
export function LicencesSurSiteConsole() {
  const [liste, setListe] = useState<LicenceEmise[]>([]);
  const [titulaire, setTitulaire] = useState('');
  const [empreinte, setEmpreinte] = useState('');
  const [finMaintenance, setFinMaintenance] = useState('');
  const [expiration, setExpiration] = useState('');
  const [dossiersMax, setDossiersMax] = useState('1');
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const charger = () =>
    api
      .get<LicenceEmise[]>('/plateforme/licences-sur-site')
      .then(setListe)
      .catch(() => undefined);
  useEffect(() => {
    charger();
  }, []);

  const emettre = async (e: FormEvent) => {
    e.preventDefault();
    setErreur(null);
    setEnvoi(true);
    try {
      const r = await api.post<{ numero: string; fichier: string }>('/plateforme/licences-sur-site', {
        titulaire,
        empreinteMachine: empreinte.trim(),
        finMaintenance,
        expiration: expiration || null,
        dossiersMax: Number(dossiersMax),
      });
      enregistrer(r.numero, r.fichier);
      setTitulaire('');
      setEmpreinte('');
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'L’émission a échoué.');
    } finally {
      setEnvoi(false);
    }
  };

  const telecharger = async (l: LicenceEmise) => {
    try {
      const r = await api.get<{ numero: string; fichier: string }>(`/plateforme/licences-sur-site/${l.id}/fichier`);
      enregistrer(r.numero, r.fichier);
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Le fichier n’a pas pu être relu.');
    }
  };

  const champ = 'border border-border px-2 py-1 text-[11.5px] bg-surface';
  return (
    <section className="border border-border bg-surface px-3.5 py-2.5 mt-3">
      <h2 className="text-[11.5px] font-bold mb-2">Licences sur site</h2>
      <form onSubmit={emettre} className="grid grid-cols-1 sm:grid-cols-[150px_1fr] gap-x-3 gap-y-1.5 items-center text-[11.5px]">
        <span className="text-text-dim">Titulaire</span>
        <input className={champ} value={titulaire} onChange={(e) => setTitulaire(e.target.value)} required minLength={2} />
        <span className="text-text-dim">Empreinte du poste</span>
        <input className={champ} value={empreinte} onChange={(e) => setEmpreinte(e.target.value)} required pattern="[0-9a-fA-F]{64}" placeholder="64 caractères, lus sur l'écran d'ouverture du client" />
        <span className="text-text-dim">Mises à jour jusqu'au</span>
        <input type="date" className={champ} value={finMaintenance} onChange={(e) => setFinMaintenance(e.target.value)} required />
        <span className="text-text-dim">Expiration</span>
        <input type="date" className={champ} value={expiration} onChange={(e) => setExpiration(e.target.value)} title="Vide pour une licence perpétuelle" />
        <span className="text-text-dim">Dossiers</span>
        <input type="number" min={1} className={`${champ} w-24`} value={dossiersMax} onChange={(e) => setDossiersMax(e.target.value)} required />
        <span />
        <div>
          <button type="submit" disabled={envoi} className="bg-sel text-white px-3 py-1.5 font-semibold disabled:opacity-50">
            {envoi ? 'Signature…' : 'Émettre et télécharger'}
          </button>
        </div>
      </form>
      {erreur && (
        <p role="alert" className="border border-danger/30 bg-danger-soft px-3 py-2 mt-2 text-[11.5px]">
          {erreur}
        </p>
      )}
      {liste.length > 0 && (
        <div className="overflow-x-auto mt-3">
          <table className="w-full text-[11.5px]">
            <thead>
              <tr>
                <th className="text-left">N°</th>
                <th className="text-left">Titulaire</th>
                <th className="text-left">Émise le</th>
                <th className="text-left">Maintenance</th>
                <th className="text-left">Expiration</th>
                <th className="text-right">Dossiers</th>
                <th className="text-left">Par</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {liste.map((l) => (
                <tr key={l.id} title={l.empreinteMachine}>
                  <td>{l.numero}</td>
                  <td>{l.titulaire}</td>
                  <td>{l.emiseLe}</td>
                  <td>{l.finMaintenance}</td>
                  <td>{l.expiration ?? 'perpétuelle'}</td>
                  <td className="text-right">{l.dossiersMax}</td>
                  <td>{l.emisePar}</td>
                  <td>
                    <button type="button" className="underline" onClick={() => telecharger(l)}>
                      Fichier
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
