import { FormEvent, useState } from 'react';
import { api, ApiError } from '../lib/api';

const champ = 'border border-border px-2 py-1 text-[11.5px] bg-surface';

/**
 * DOSSIERS DE DÉMONSTRATION, dans la console de l'éditeur · une association
 * (SYCEBNL) et une SARL (SYSCOHADA), un par référentiel, nés garnis
 * d'opérations fictives validées (PlateformeService.preparerDossierDemonstration).
 * Le mot de passe est CHOISI, pas tiré · il figure dans les formulaires de
 * soumission des magasins d'applications.
 */
export function DemonstrationConsole() {
  const [referentiel, setReferentiel] = useState<'SYCEBNL' | 'SYSCOHADA'>('SYCEBNL');
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const ouvrir = async (e: FormEvent) => {
    e.preventDefault();
    setErreur(null);
    setMessage(null);
    setEnvoi(true);
    try {
      const r = await api.post<{ nom: string; email: string; garni: { tiers: number; ecritures: number } | null }>('/plateforme/dossier-demonstration', {
        referentiel,
        email: email.trim(),
        motDePasse,
      });
      setMessage(
        `« ${r.nom} » ouvert pour ${r.email}` + (r.garni ? ` · ${r.garni.tiers} tiers et ${r.garni.ecritures} écritures validées.` : '.'),
      );
      setMotDePasse('');
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'L’ouverture a échoué.');
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <section className="border border-border bg-surface px-3.5 py-2.5 mt-3 text-[11.5px]">
      <h2 className="font-bold mb-2">Dossiers de démonstration</h2>
      <form onSubmit={ouvrir} className="flex flex-wrap items-center gap-2">
        <select className={champ} value={referentiel} onChange={(e) => setReferentiel(e.target.value as 'SYCEBNL' | 'SYSCOHADA')}>
          <option value="SYCEBNL">Association (SYCEBNL)</option>
          <option value="SYSCOHADA">SARL (SYSCOHADA)</option>
        </select>
        <input type="email" required placeholder="Adresse de connexion" className={champ} value={email} onChange={(e) => setEmail(e.target.value)} />
        <input type="password" required minLength={10} placeholder="Mot de passe choisi" className={champ} value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} />
        <button type="submit" disabled={envoi} className="bg-sel text-white px-3 py-1.5 font-semibold disabled:opacity-50">
          {envoi ? 'Ouverture…' : 'Ouvrir'}
        </button>
      </form>
      {message && <p className="mt-2">{message}</p>}
      {erreur && (
        <p role="alert" className="border border-danger/30 bg-danger-soft px-3 py-2 mt-2">
          {erreur}
        </p>
      )}
    </section>
  );
}
