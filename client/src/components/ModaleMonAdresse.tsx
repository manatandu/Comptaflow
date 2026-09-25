import { FormEvent, useState } from 'react';
import { api, ApiError, setCsrf } from '../lib/api';
import { useAuth } from '../lib/auth';

/**
 * CHANGER SON ADRESSE DE CONNEXION · confirmée par le mot de passe actuel
 * (AuthService.changerAdresse). Le serveur ferme les sessions et en repose
 * une neuve · le jeton CSRF change donc, comme au changement de mot de passe.
 */
export function ModaleMonAdresse({ adresseActuelle, onFermer }: { adresseActuelle: string; onFermer: () => void }) {
  // Tout utilisateur change SA propre adresse · aucun droit particulier, mais
  // le formulaire ne s'envoie qu'à un utilisateur connecté.
  const { utilisateur, rafraichir } = useAuth();
  const [nouvelle, setNouvelle] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [fait, setFait] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const envoyer = async (e: FormEvent) => {
    e.preventDefault();
    setErreur(null);
    setEnvoi(true);
    try {
      const r = await api.post<{ adresse: string; csrfToken: string }>('/auth/changer-adresse', {
        motDePasseActuel: motDePasse,
        nouvelleAdresse: nouvelle,
      });
      setCsrf(r.csrfToken);
      await rafraichir();
      setFait(`Votre adresse de connexion est désormais ${r.adresse}.`);
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Changement impossible');
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/35 flex items-center justify-center p-4" onClick={onFermer}>
      <form
        onSubmit={envoyer}
        className="anim-modale w-[440px] max-h-full overflow-auto rounded-[4px] bg-surface border border-border-dark shadow-dominante text-[11.5px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-3.5 h-[32px] border-b border-border">
          <span className="font-bold">Changer mon adresse de connexion</span>
          <button type="button" onClick={onFermer} aria-label="Fermer">
            ✕
          </button>
        </div>
        <div className="p-3 space-y-2">
          {erreur && <div className="text-danger bg-danger-soft border border-danger/30 px-3 py-2">{erreur}</div>}
          {fait ? (
            <div className="text-positive bg-positive-soft border border-positive/30 px-3 py-2">{fait}</div>
          ) : (
            <>
              <div className="text-text-dim">Adresse actuelle : {adresseActuelle}</div>
              <label className="flex flex-col gap-0.5">
                <span className="text-text-dim">Nouvelle adresse</span>
                <input type="email" required value={nouvelle} onChange={(e) => setNouvelle(e.target.value)} className="border border-border px-2 py-[3px]" />
              </label>
              <label className="flex flex-col gap-0.5">
                <span className="text-text-dim">Mot de passe actuel</span>
                <input type="password" required value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} className="border border-border px-2 py-[3px]" />
              </label>
              <div className="flex justify-end">
                <button type="submit" disabled={!utilisateur || envoi} className="bg-sel text-white font-semibold px-4 py-1.5 disabled:opacity-40">
                  {envoi ? '…' : 'Changer'}
                </button>
              </div>
            </>
          )}
        </div>
      </form>
    </div>
  );
}
