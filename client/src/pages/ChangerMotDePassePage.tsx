import { FormEvent, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';

/**
 * ÉCRAN BLOQUANT DE PREMIÈRE CONNEXION · s'affiche À LA PLACE de l'espace
 * de travail tant que doitChangerMotDePasse est vrai (voir ZoneProtegee,
 * App.tsx). Le mot de passe de ce compte a transité par un tiers (console
 * VMG, siège du groupe, ou admin du dossier) : tant qu'il n'est pas
 * remplacé, ce tiers pourrait ouvrir le dossier · d'où le passage obligé.
 */
export function ChangerMotDePassePage() {
  const { utilisateur, rafraichir, seDeconnecter } = useAuth();
  const [actuel, setActuel] = useState('');
  const [nouveau, setNouveau] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const onChanger = async (e: FormEvent) => {
    e.preventDefault();
    setErreur(null);
    if (nouveau !== confirmation) {
      setErreur('La confirmation ne correspond pas au nouveau mot de passe.');
      return;
    }
    if (nouveau === actuel) {
      setErreur("Le nouveau mot de passe doit être différent de l'actuel.");
      return;
    }
    setEnvoi(true);
    try {
      await api.post('/auth/changer-mot-de-passe', { motDePasseActuel: actuel, nouveauMotDePasse: nouveau });
      // /auth/me relu · le drapeau est tombé, ZoneProtegee laisse entrer.
      await rafraichir();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Changement impossible');
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <form onSubmit={onChanger} className="anim-modale w-full max-w-[440px] bg-surface border border-border-dark shadow-flottante">
        <div
          className="h-[26px] flex items-center px-2.5 text-white text-[10.5px]"
          style={{ background: 'linear-gradient(180deg, var(--titlebar-from), var(--titlebar-to))' }}
        >
          <span>Choisissez votre mot de passe</span>
        </div>
        <div className="p-5">
          <p className="text-[11px]">
            Bienvenue{utilisateur ? ` ${utilisateur.email}` : ''}. Le mot de passe qui vous a été remis est provisoire :
            choisissez le vôtre pour ouvrir le dossier. Personne d'autre que vous ne le connaîtra.
          </p>
          <div className="grid grid-cols-[170px_1fr] items-center gap-x-3 gap-y-2.5 mt-4">
            <label className="text-[11px] text-right">Mot de passe reçu :</label>
            <input
              type="password"
              required
              autoFocus
              autoComplete="current-password"
              value={actuel}
              onChange={(e) => setActuel(e.target.value)}
              className="border border-border-dark px-2.5 py-1.5 text-[12px]"
            />
            <label className="text-[11px] text-right">Nouveau mot de passe :</label>
            <input
              type="password"
              required
              minLength={10}
              autoComplete="new-password"
              placeholder="10 caractères min."
              value={nouveau}
              onChange={(e) => setNouveau(e.target.value)}
              className="border border-border-dark px-2.5 py-1.5 text-[12px]"
            />
            <label className="text-[11px] text-right">Confirmation :</label>
            <input
              type="password"
              required
              minLength={10}
              autoComplete="new-password"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              className="border border-border-dark px-2.5 py-1.5 text-[12px]"
            />
          </div>
          {erreur && <div className="text-[11px] text-danger bg-danger-soft border border-danger/30 px-2.5 py-1.5 mt-3">{erreur}</div>}
          <div className="flex justify-between items-center mt-4">
            <button type="button" onClick={seDeconnecter} className="text-[10.5px] text-text-dim hover:text-text">
              Se déconnecter
            </button>
            <button type="submit" disabled={envoi} className="bg-sel text-white px-4 py-1.5 text-[11px] font-semibold disabled:opacity-50">
              {envoi ? 'Enregistrement…' : 'Enregistrer et ouvrir le dossier'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
