import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { IconLogo } from '../components/chrome/icons';
import type { AuthResponse } from '../lib/types';

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
    <div className="min-h-screen flex items-center justify-center bg-bg">
      <div className="w-full max-w-[380px] border-2 border-border-dark bg-surface shadow-[3px_3px_0_rgba(0,0,0,0.15)]">
        <div
          className="h-6 flex items-center gap-2 px-2.5 text-white text-[11px]"
          style={{ background: 'linear-gradient(180deg, var(--titlebar-from), var(--titlebar-to))' }}
        >
          <IconLogo width={13} height={13} />
          <span>Compta Flow — Connexion</span>
        </div>

        <form onSubmit={onSubmit} className="p-6 flex flex-col gap-3.5">
          <div className="flex items-center gap-2 justify-center mb-1">
            <IconLogo width={22} height={22} />
            <span className="text-[16px] font-bold">Compta Flow</span>
          </div>

          <label className="text-[12px] font-semibold text-text-dim">
            Adresse e-mail
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full border border-border-dark bg-surface px-2.5 py-1.5 text-[13px]"
            />
          </label>

          <label className="text-[12px] font-semibold text-text-dim">
            Mot de passe
            <input
              type="password"
              required
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
              className="mt-1 w-full border border-border-dark bg-surface px-2.5 py-1.5 text-[13px]"
            />
          </label>

          {erreur && (
            <div className="text-[12px] text-danger bg-danger-soft border border-danger/30 px-2.5 py-1.5">{erreur}</div>
          )}

          <button
            type="submit"
            disabled={envoi}
            className="bg-sel text-white text-[13px] font-semibold py-2 disabled:opacity-60"
          >
            {envoi ? 'Connexion…' : 'Se connecter'}
          </button>

          <p className="text-[12px] text-text-dim text-center">
            Pas encore de compte ? <Link to="/inscription" className="text-sel font-medium">Créer une entité</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
