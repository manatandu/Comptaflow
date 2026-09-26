import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { EtatSurSite } from '../lib/sur-site';

interface Copie {
  nom: string;
  taille: number;
  date: string;
}

/**
 * LES SAUVEGARDES D'UNE INSTALLATION SUR SITE · en ligne, c'est la
 * plateforme qui sauvegarde et ce cadre ne s'affiche pas. Sur site, la copie
 * quotidienne part seule ; ce cadre montre les copies et en déclenche une,
 * avant une opération lourde par exemple. Réservé à l'administrateur, comme
 * la route.
 */
export function SauvegardesSurSite() {
  const { estAdmin } = useAuth();
  const [surSite, setSurSite] = useState(false);
  const [dossier, setDossier] = useState('');
  const [copies, setCopies] = useState<Copie[]>([]);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = () =>
    api.get<{ dossier: string; copies: Copie[] }>('/sur-site/sauvegardes').then((r) => {
      setDossier(r.dossier);
      setCopies(r.copies);
    });

  useEffect(() => {
    if (!estAdmin) return;
    api
      .get<EtatSurSite>('/sur-site/etat')
      .then((e) => {
        setSurSite(e.surSite);
        if (e.surSite) return charger();
      })
      .catch(() => undefined);
  }, [estAdmin]);

  if (!estAdmin || !surSite) return null;

  const sauvegarder = async () => {
    setEnCours(true);
    setErreur(null);
    try {
      await api.post('/sur-site/sauvegardes');
      await charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'La sauvegarde n’a pas abouti.');
    } finally {
      setEnCours(false);
    }
  };

  return (
    <section className="border border-border bg-surface px-3.5 py-2.5 mt-2.5">
      <h2 className="text-[11.5px] font-bold mb-1.5">Sauvegardes de cette installation</h2>
      <p className="text-[11.5px] text-text-dim mb-2">Dossier · {dossier}</p>
      {erreur && (
        <p role="alert" className="border border-danger/30 bg-danger-soft px-3.5 py-2 mb-2 text-[11.5px]">
          {erreur}
        </p>
      )}
      <button
        type="button"
        onClick={sauvegarder}
        disabled={enCours}
        className="bg-sel text-white text-[11.5px] font-semibold px-3 py-1.5 mb-2 disabled:opacity-50"
      >
        {enCours ? 'Sauvegarde en cours…' : 'Sauvegarder maintenant'}
      </button>
      {copies.length === 0 ? (
        <p className="text-[11.5px] text-danger">Aucune copie dans ce dossier.</p>
      ) : (
        <table className="w-full text-[11.5px]">
          <thead>
            <tr>
              <th className="text-left">Copie</th>
              <th className="text-left">Date</th>
              <th className="text-right">Taille</th>
            </tr>
          </thead>
          <tbody>
            {copies.map((c) => (
              <tr key={c.nom}>
                <td>{c.nom}</td>
                <td>{new Date(c.date).toLocaleString('fr-FR')}</td>
                <td className="text-right">{(c.taille / 1_048_576).toFixed(1)} Mo</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
