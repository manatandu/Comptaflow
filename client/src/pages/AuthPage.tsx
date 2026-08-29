import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { IconLogo } from '../components/chrome/icons';
import { NouveauFichierWizard } from '../components/NouveauFichierWizard';
import type { AuthResponse } from '../lib/types';

/**
 * Page d'ouverture · un seul écran, dans un registre simple et accueillant
 * plutôt que la boîte de dialogue de poste de travail : c'est la première
 * chose que voit quiconque découvre OmegaX, elle doit donner envie d'entrer,
 * pas ressembler à un formulaire administratif. Le reste du logiciel, une
 * fois à l'intérieur, garde son registre « poste de travail comptable » ·
 * seule cette porte d'entrée change de ton.
 *
 * Un seul formulaire, celui de la connexion. La création d'un dossier passe
 * par l'assistant « Nouveau fichier comptable », qui pose les questions
 * qu'une inscription en trois champs ne peut pas poser (type d'entité et donc
 * jeu d'états financiers SYCEBNL, exercice, monnaie de tenue).
 */

function IconOeil({ ouvert }: { ouvert: boolean }) {
  return ouvert ? (
    <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path d="M1.5 12s4-7 10.5-7 10.5 7 10.5 7-4 7-10.5 7-10.5-7-10.5-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path d="M3 3l18 18" />
      <path d="M10.6 5.2A10.9 10.9 0 0112 5c6.5 0 10.5 7 10.5 7a17.4 17.4 0 01-3.4 4.3M6.7 6.7C3.6 8.6 1.5 12 1.5 12s4 7 10.5 7c1.3 0 2.5-.2 3.6-.6" />
      <path d="M9.9 9.9a3 3 0 004.2 4.2" />
    </svg>
  );
}

/** Cercles décoratifs, en pur CSS. */
function CerclesDecoratifs() {
  const cercle = (style: React.CSSProperties) => (
    <div className="absolute rounded-full border border-sel/25 pointer-events-none" style={style} />
  );
  return (
    <>
      {cercle({ width: 340, height: 340, top: -140, right: -120 })}
      {cercle({ width: 220, height: 220, top: -40, right: -20 })}
      {cercle({ width: 260, height: 260, bottom: -120, left: -100 })}
      <div
        className="absolute rounded-full bg-sel/[0.06] pointer-events-none"
        style={{ width: 380, height: 380, bottom: -180, left: -160 }}
      />
    </>
  );
}

export function AuthPage({ assistantInitial = false }: { assistantInitial?: boolean }) {
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [motDePasseVisible, setMotDePasseVisible] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [assistantOuvert, setAssistantOuvert] = useState(assistantInitial);
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
      setErreur(err instanceof ApiError ? err.message : 'Une erreur est survenue');
    } finally {
      setEnvoi(false);
    }
  };

  const champClasse =
    'w-full rounded-xl border border-border bg-surface px-4 py-3 text-[14px] focus:outline-none focus:ring-2 focus:ring-sel/30 focus:border-sel';

  return (
    <div className="relative min-h-screen overflow-hidden flex flex-col items-center justify-center bg-bg px-4">
      <CerclesDecoratifs />

      <div className="relative z-10 flex flex-col items-center mb-7">
        <div
          className="w-[76px] h-[76px] rounded-[22px] flex items-center justify-center text-white shadow-flottante"
          style={{ background: 'linear-gradient(160deg, var(--titlebar-from), var(--titlebar-to))' }}
        >
          <IconLogo width={38} height={38} />
        </div>
        <div className="mt-3 text-[30px] font-extrabold tracking-tight text-sel">OMEGAX</div>
      </div>

      <div className="relative z-10 w-full max-w-[400px]">
        <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-text px-0.5">Adresse e-mail</span>
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={champClasse}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-text px-0.5">Mot de passe</span>
            <div className="relative">
              <input
                type={motDePasseVisible ? 'text' : 'password'}
                required
                value={motDePasse}
                onChange={(e) => setMotDePasse(e.target.value)}
                className={`${champClasse} pr-11`}
              />
              <button
                type="button"
                onClick={() => setMotDePasseVisible((v) => !v)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-dim hover:text-text"
                tabIndex={-1}
              >
                <IconOeil ouvert={motDePasseVisible} />
              </button>
            </div>
          </label>

          {erreur && (
            <div className="text-[12.5px] text-danger bg-danger-soft border border-danger/30 rounded-xl px-3.5 py-2.5">
              {erreur}
            </div>
          )}

          <button
            type="submit"
            disabled={envoi}
            className="mt-1.5 bg-sel text-white text-[14.5px] font-bold py-3 rounded-xl hover:brightness-110 disabled:opacity-60"
          >
            {envoi ? 'Un instant…' : 'Se connecter'}
          </button>
        </form>

        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px bg-border" />
          <span className="text-[11.5px] text-text-dim">ou</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <button
          type="button"
          onClick={() => setAssistantOuvert(true)}
          className="w-full bg-surface border border-border text-sel text-[14px] font-bold py-3 rounded-xl hover:bg-sel-soft shadow-posee"
        >
          Créer un dossier comptable
        </button>
      </div>

      <p className="relative z-10 mt-8 text-[11px] text-text-dim">OmegaX © 2026</p>

      {assistantOuvert && (
        <NouveauFichierWizard onClose={() => setAssistantOuvert(false)} onTermine={() => navigate('/')} />
      )}
    </div>
  );
}
