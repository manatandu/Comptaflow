import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { IconLogo } from '../components/chrome/icons';
import type { AuthResponse } from '../lib/types';

/**
 * Ouverture du dossier comptable — calquée sur l'entrée dans Sage 100 i7 :
 * on n'entre pas dans « une application », on OUVRE UN DOSSIER COMPTABLE, et
 * cette ouverture est protégée par un code utilisateur et un mot de passe
 * (« La connexion au fichier comptable est sécurisée » — guide utilisateur).
 * D'où une boîte de dialogue de poste de travail, pas un écran de SaaS.
 */
export function LoginPage() {
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
      const res = await api.post<AuthResponse>('/auth/login', { email, motDePasse });
      await seConnecter(res.accessToken);
      navigate('/');
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Connexion impossible');
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-bg gap-0">
      <div className="w-full max-w-[430px] border border-border-dark bg-surface shadow-flottante">
        {/* Barre de titre de la boîte de dialogue */}
        <div
          className="h-[26px] flex items-center gap-2 px-2.5 text-white text-[11.5px]"
          style={{ background: 'linear-gradient(180deg, var(--titlebar-from), var(--titlebar-to))' }}
        >
          <IconLogo width={13} height={13} />
          <span>Ouverture du dossier comptable</span>
        </div>

        {/* Bandeau produit */}
        <div className="flex items-center gap-3 px-5 py-4 bg-surface-alt border-b border-border">
          <div
            className="w-11 h-11 flex items-center justify-center text-white shrink-0"
            style={{ background: 'linear-gradient(180deg, var(--titlebar-from), var(--titlebar-to))' }}
          >
            <IconLogo width={26} height={26} />
          </div>
          <div>
            <div className="text-[17px] font-bold tracking-wide leading-tight">OMEGAX</div>
            <div className="text-[11px] text-text-dim leading-tight">
              Comptabilité des entités à but non lucratif · SYCEBNL — OHADA
            </div>
          </div>
        </div>

        <form onSubmit={onSubmit} className="px-5 py-4">
          <fieldset className="border border-border px-4 pt-2 pb-4">
            <legend className="text-[11px] font-semibold text-text-dim px-1.5">
              Identification de l'utilisateur
            </legend>

            <div className="grid grid-cols-[110px_1fr] items-center gap-x-3 gap-y-2.5 mt-1.5">
              <label htmlFor="champ-email" className="text-[12px] text-right">
                Utilisateur :
              </label>
              <input
                id="champ-email"
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="border border-border-dark bg-surface px-2.5 py-1.5 text-[13px]"
              />

              <label htmlFor="champ-mdp" className="text-[12px] text-right">
                Mot de passe :
              </label>
              <input
                id="champ-mdp"
                type="password"
                required
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

          <div className="flex items-center justify-end gap-2 mt-4">
            <button
              type="button"
              onClick={() => {
                setEmail('');
                setMotDePasse('');
                setErreur(null);
              }}
              className="border border-border-dark bg-chrome hover:bg-chrome-alt px-4 py-1.5 text-[12.5px]"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={envoi}
              className="bg-sel text-white px-5 py-1.5 text-[12.5px] font-semibold disabled:opacity-60"
            >
              {envoi ? 'Ouverture…' : 'Ouvrir'}
            </button>
          </div>

          <div className="border-t border-border mt-4 pt-3 text-[12px] text-text-dim">
            Première utilisation ?{' '}
            <Link to="/inscription" className="text-sel font-medium hover:underline">
              Créer un nouveau dossier comptable…
            </Link>
          </div>
        </form>
      </div>

      <div className="mt-3 text-[10.5px] text-text-dim">
        OmegaX · Référentiel SYCEBNL (Acte uniforme OHADA du 22 décembre 2022)
      </div>
    </div>
  );
}
