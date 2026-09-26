import { ChangeEvent, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { EtatSurSite, licenceABloquer, resumeLicence } from '../lib/sur-site';
import { Aide } from './chrome/Aide';

/**
 * LA LICENCE D'UNE INSTALLATION SUR SITE, à l'écran d'ouverture · c'est le
 * seul écran qu'on voit avant qu'un compte existe, et c'est ici que le
 * client lit l'empreinte de son poste puis dépose le fichier reçu de VMG.
 * En ligne, le panneau ne rend rien.
 */
export function PanneauSurSite({ onEtat }: { onEtat?: (e: EtatSurSite) => void }) {
  const [etat, setEtat] = useState<EtatSurSite | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [remplacer, setRemplacer] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [copie, setCopie] = useState(false);

  useEffect(() => {
    let vivant = true;
    api
      .get<EtatSurSite>('/sur-site/etat')
      .then((e) => {
        if (!vivant) return;
        setEtat(e);
        onEtat?.(e);
      })
      // Un serveur en ligne d'avant cette route répond 404 · rien à montrer.
      .catch(() => undefined);
    return () => {
      vivant = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!etat?.surSite) return null;

  const deposer = async (ev: ChangeEvent<HTMLInputElement>) => {
    const f = ev.target.files?.[0];
    ev.target.value = '';
    if (!f) return;
    setErreur(null);
    setEnvoi(true);
    try {
      const e = await api.post<EtatSurSite>('/sur-site/licence', { contenu: await f.text() });
      setEtat(e);
      onEtat?.(e);
      setRemplacer(false);
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Le fichier n’a pas pu être envoyé.');
    } finally {
      setEnvoi(false);
    }
  };

  const copier = async () => {
    try {
      await navigator.clipboard.writeText(etat.empreinte ?? '');
      setCopie(true);
    } catch {
      setCopie(false);
    }
  };

  const bloquee = licenceABloquer(etat);
  return (
    <div className={`mb-4 border rounded-[4px] p-3 text-[12px] ${bloquee ? 'border-danger bg-danger-soft' : 'border-border bg-surface-alt'}`}>
      <div className="flex items-center gap-2 font-semibold">
        <span>Licence de cette installation</span>
        <Aide
          titre="Licence sur site"
          texte="Un fichier signé par VMG Consulting, vérifié sur ce poste sans connexion à internet. Il ne vaut que pour l'empreinte du poste serveur, et borne le nombre de dossiers et les mises à jour couvertes."
          source="OmegaX · installation sur site"
        />
      </div>
      {etat.statut === 'VALIDE' && etat.licence ? (
        <div className="mt-1">{resumeLicence(etat.licence)}</div>
      ) : (
        <div className="mt-1 text-danger">{etat.motif ?? etat.statut}</div>
      )}
      {etat.empreinte && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-text-dim">Empreinte du poste</span>
          <code className="select-all break-all bg-surface px-1 border border-border rounded-[2px]">{etat.empreinte}</code>
          <button type="button" className="underline" onClick={copier}>
            {copie ? 'Copiée' : 'Copier'}
          </button>
        </div>
      )}
      {bloquee || remplacer ? (
        <label className="mt-2 inline-flex items-center gap-2 cursor-pointer">
          <span className="bg-sel text-white rounded-full px-3 py-1">{envoi ? 'Vérification…' : 'Déposer le fichier de licence'}</span>
          <input type="file" accept=".omegax,.json,application/json" className="hidden" disabled={envoi} onChange={deposer} />
        </label>
      ) : (
        <button type="button" className="mt-2 underline text-text-dim" onClick={() => setRemplacer(true)}>
          Remplacer la licence
        </button>
      )}
      {erreur && <div className="mt-2 text-danger">{erreur}</div>}
    </div>
  );
}
