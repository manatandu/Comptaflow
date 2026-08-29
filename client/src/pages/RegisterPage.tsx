import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { IconLogo } from '../components/chrome/icons';
import type { AuthResponse } from '../lib/types';

/**
 * Création d'un nouveau fichier comptable · le « Fichier → Nouveau » de Sage
 * 100 i7, en assistant : raison sociale de l'entité, puis l'administrateur du
 * dossier. Le plan comptable SYCEBNL et les journaux standards sont générés
 * automatiquement à la création (côté API), comme la reprise des « éléments
 * comptables » proposée par l'assistant Sage.
 */
export function RegisterPage() {
  const [nomEntite, setNomEntite] = useState('');
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const { seConnecter } = useAuth();
  const navigate = useNavigate();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErreur(null);
    setEnvoi(true);
    try {
      const res = await api.post<AuthResponse>('/auth/register', {
        nomEntite,
        referentiel: 'SYCEBNL',
        email,
        motDePasse,
      });
      await seConnecter(res.accessToken);
      navigate('/');
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Création du dossier impossible');
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-bg">
      <div className="w-full max-w-[470px] border border-border-dark bg-surface shadow-flottante">
        <div
          className="h-[26px] flex items-center gap-2 px-2.5 text-white text-[11.5px]"
          style={{ background: 'linear-gradient(180deg, var(--titlebar-from), var(--titlebar-to))' }}
        >
          <IconLogo width={13} height={13} />
          <span>Assistant · Création d'un nouveau fichier comptable</span>
        </div>

        <form onSubmit={onSubmit} className="px-5 py-4">
          <p className="text-[12px] text-text-dim mb-3.5">
            Cet assistant crée le dossier comptable de votre entité selon le référentiel{' '}
            <strong className="text-text">SYCEBNL</strong> (entités à but non lucratif, OHADA) : le plan
            comptable standard et les journaux (achats, ventes, trésorerie, opérations diverses, à-nouveaux)
            sont générés automatiquement.
          </p>

          <fieldset className="border border-border px-4 pt-2 pb-4 mb-3.5">
            <legend className="text-[11px] font-semibold text-text-dim px-1.5">Identification de l'entité</legend>
            <div className="grid grid-cols-[120px_1fr] items-center gap-x-3 gap-y-2.5 mt-1.5">
              <label htmlFor="champ-entite" className="text-[12px] text-right">
                Raison sociale :
              </label>
              <input
                id="champ-entite"
                required
                autoFocus
                value={nomEntite}
                onChange={(e) => setNomEntite(e.target.value)}
                placeholder="Association, ONG, fondation, projet…"
                className="border border-border-dark bg-surface px-2.5 py-1.5 text-[13px]"
              />
            </div>
          </fieldset>

          <fieldset className="border border-border px-4 pt-2 pb-4">
            <legend className="text-[11px] font-semibold text-text-dim px-1.5">
              Administrateur du dossier
            </legend>
            <div className="grid grid-cols-[120px_1fr] items-center gap-x-3 gap-y-2.5 mt-1.5">
              <label htmlFor="champ-email" className="text-[12px] text-right">
                Utilisateur :
              </label>
              <input
                id="champ-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="adresse e-mail"
                className="border border-border-dark bg-surface px-2.5 py-1.5 text-[13px]"
              />
              <label htmlFor="champ-mdp" className="text-[12px] text-right">
                Mot de passe :
              </label>
              <input
                id="champ-mdp"
                type="password"
                required
                minLength={8}
                value={motDePasse}
                onChange={(e) => setMotDePasse(e.target.value)}
                className="border border-border-dark bg-surface px-2.5 py-1.5 text-[13px]"
              />
            </div>
          </fieldset>

          {erreur && (
            <div className="text-[12px] text-danger bg-danger-soft border border-danger/30 px-2.5 py-1.5 mt-3">
              {erreur}
            </div>
          )}

          <div className="flex items-center justify-between mt-4">
            <Link to="/connexion" className="text-[12px] text-sel hover:underline">
              ← Revenir à l'ouverture du dossier
            </Link>
            <button
              type="submit"
              disabled={envoi}
              className="bg-sel text-white px-5 py-1.5 text-[12.5px] font-semibold disabled:opacity-60"
            >
              {envoi ? 'Création…' : 'Créer le dossier'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
