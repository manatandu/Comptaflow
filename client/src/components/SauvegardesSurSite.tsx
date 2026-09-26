import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { EtatSurSite } from '../lib/sur-site';

interface CopieExterne {
  dossier: string | null;
  derniere: string | null;
  le: string | null;
  erreur: string | null;
}

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
  const [externe, setExterne] = useState<CopieExterne | null>(null);
  const [cheminExterne, setCheminExterne] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = () =>
    api.get<{ dossier: string; copies: Copie[]; copieExterne: CopieExterne }>('/sur-site/sauvegardes').then((r) => {
      setDossier(r.dossier);
      setCopies(r.copies);
      setExterne(r.copieExterne);
      setCheminExterne(r.copieExterne.dossier ?? '');
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

  const definirExterne = async () => {
    setErreur(null);
    try {
      await api.post('/sur-site/sauvegardes/copie-externe', { dossier: cheminExterne.trim() || null });
      await charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Le dossier externe n’a pas pu être enregistré.');
    }
  };

  // Aucune copie hors du poste, ou une copie en échec, ou plus vieille que la
  // dernière sauvegarde locale · le disque du poste reste alors le seul
  // endroit où vit la comptabilité, et l'écran le dit.
  const externeEnRetard = !externe?.dossier || !!externe.erreur || (copies[0] && externe.derniere !== copies[0].nom);

  return (
    <section className="border border-border bg-surface px-3.5 py-2.5 mt-2.5">
      <h2 className="text-[11.5px] font-bold mb-1.5">Sauvegardes de cette installation</h2>
      <p className="text-[11.5px] text-text-dim mb-2">Dossier · {dossier}</p>
      {externeEnRetard && (
        <p role="alert" className="border border-warning/30 bg-warning-soft px-3.5 py-2 mb-2 text-[11.5px]">
          {!externe?.dossier
            ? 'Aucune copie hors de ce poste · une panne de son disque emporterait la base et toutes ses sauvegardes.'
            : externe.erreur
              ? `La dernière copie vers ${externe.dossier} a échoué · ${externe.erreur}`
              : `La copie externe n’a pas reçu la dernière sauvegarde (dernière recopiée : ${externe.derniere ?? 'aucune'}).`}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2 mb-2 text-[11.5px]">
        <span className="text-text-dim">Copie hors du poste</span>
        <input
          className="border border-border px-2 py-1 bg-surface min-w-[240px]"
          value={cheminExterne}
          onChange={(e) => setCheminExterne(e.target.value)}
          placeholder="E:\SauvegardesOmegaX ou \\SERVEUR\partage"
        />
        <button type="button" className="underline" onClick={definirExterne}>
          Enregistrer
        </button>
        {externe?.le && <span className="text-text-dim">dernière copie le {new Date(externe.le).toLocaleString('fr-FR')}</span>}
      </div>
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
