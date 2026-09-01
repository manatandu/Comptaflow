import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { IconLogo, IconFileAdd, IconFolderOpen } from '../components/chrome/icons';
import { NouveauFichierWizard } from '../components/NouveauFichierWizard';
import { DossierRecent, lireDossiersRecents, oublierDossier } from '../lib/dossiersRecents';
import type { AuthResponse } from '../lib/types';

/**
 * PORTE D'ENTRÉE · calquée sur la logique d'ouverture de Sage 100, pas sur
 * celle d'un site web.
 *
 * Ce que fait Sage, d'après le manuel i7 écrit pour une ONG (Drive/Sage) :
 *
 *  1. Au lancement, aucun fichier n'est ouvert et « la fenêtre principale du
 *     logiciel s'affiche […] l'utilisateur est invité à soit CRÉER UN NOUVEAU
 *     FICHIER COMPTABLE ou OUVRIR UN FICHIER COMPTABLE EXISTANT ». Il n'y a
 *     pas d'écran de connexion à ce stade : le logiciel ne sait pas encore de
 *     quel dossier on parle, donc il ne peut pas savoir qui doit s'y
 *     authentifier.
 *  2. « A la prochaine exécution du logiciel, l'utilisateur procèdera à
 *     l'ouverture de son fichier comptable au nom et à l'emplacement dans
 *     lequel il avait enregistré le fichier lors de sa création. Une fois le
 *     logiciel exécuté, une fenêtre s'affiche demandant le NOM DE
 *     L'UTILISATEUR AINSI QUE SON MOT DE PASSE. » L'authentification vient
 *     donc APRÈS l'ouverture du fichier, et elle est propre à ce fichier.
 *  3. Le menu Fichier garde une entrée FAVORIS : les dossiers déjà ouverts.
 *
 * Transposition, et ses limites, dites franchement :
 *
 *  - OmegaX est hébergé. Il n'y a ni fichier, ni chemin sur un disque, et un
 *    compte n'ouvre aujourd'hui qu'un seul dossier. « Ouvrir un fichier
 *    existant » se réduit donc à s'identifier · mais l'ordre des écrans, lui,
 *    est celui de Sage : d'abord la porte (créer ou ouvrir), ensuite les
 *    identifiants.
 *  - Les Favoris deviennent les DOSSIERS RÉCENTS, mémorisés dans le
 *    navigateur (voir `lib/dossiersRecents.ts`) · un nom et une adresse,
 *    jamais un mot de passe.
 *  - Comme chez Sage, quelqu'un qui revient ne repasse pas par la porte : s'il
 *    a déjà ouvert un dossier sur ce navigateur, on l'amène directement à la
 *    fenêtre d'identification de son dernier dossier, avec un retour possible
 *    vers les deux choix.
 */

type Ecran = 'porte' | 'identification';

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
  // Lu une seule fois, au montage : la liste ne change qu'à l'initiative de
  // l'utilisateur (retrait d'un raccourci) ou après une connexion réussie,
  // moment où l'on quitte cette page de toute façon.
  const [recents, setRecents] = useState<DossierRecent[]>(() => lireDossiersRecents());
  const [dossierVise, setDossierVise] = useState<DossierRecent | null>(() => lireDossiersRecents()[0] ?? null);
  // Quelqu'un qui revient va droit à l'identification de son dernier dossier ·
  // c'est la « prochaine exécution » du manuel Sage. Un premier passage voit
  // la porte : créer, ou ouvrir.
  const [ecran, setEcran] = useState<Ecran>(() => (lireDossiersRecents().length > 0 ? 'identification' : 'porte'));

  const [email, setEmail] = useState(() => lireDossiersRecents()[0]?.email ?? '');
  const [motDePasse, setMotDePasse] = useState('');
  const [motDePasseVisible, setMotDePasseVisible] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [assistantOuvert, setAssistantOuvert] = useState(assistantInitial);
  const { seConnecter } = useAuth();
  const navigate = useNavigate();

  const ouvrirDossier = (d: DossierRecent | null) => {
    setErreur(null);
    setDossierVise(d);
    setEmail(d?.email ?? '');
    setMotDePasse('');
    setEcran('identification');
  };

  const retirer = (email: string) => {
    const restants = oublierDossier(email);
    setRecents(restants);
    if (dossierVise?.email === email) {
      setDossierVise(null);
      setEmail('');
    }
    if (restants.length === 0) setEcran('porte');
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErreur(null);
    setEnvoi(true);
    try {
      const res = await api.post<AuthResponse>('/auth/login', { email, motDePasse });
      // Le dossier est ajouté aux dossiers récents par `chargerUtilisateur`
      // (lib/auth.tsx), qui lit /auth/me · la réponse de /auth/login ne porte
      // que le jeton, elle ne connaît pas le nom du dossier.
      await seConnecter(res.accessToken);
      navigate('/');
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Une erreur est survenue');
    } finally {
      setEnvoi(false);
    }
  };

  // Même gabarit de champ que l'assistant de création : un dialogue et son
  // assistant ne doivent pas avoir deux styles de saisie.
  const champClasse =
    'w-full rounded-[6px] border border-border bg-surface px-2.5 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-sel/25 focus:border-sel';

  const dateCourte = (iso: string) =>
    new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <div className="relative min-h-screen overflow-x-clip flex flex-col items-center justify-center bg-bg px-4 py-8">
      <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none">
        <CerclesDecoratifs />
      </div>

      {/* ------------------------------------------------------------------
          FENÊTRE DE DIALOGUE, et non page web · chez Sage cet écran est une
          fenêtre à part entière (barre de titre, panneau de marque, contenu),
          posée sur le bureau du logiciel. L'assistant de création qu'elle
          ouvre porte exactement le même cadre : la première seconde
          d'utilisation dit déjà « logiciel installé », pas « site ».
          ------------------------------------------------------------------ */}
      <div className="relative z-10 w-full max-w-[620px] bg-surface border border-border rounded-[10px] overflow-hidden shadow-flottante anim-modale">
        <div
          className="h-[34px] flex items-center gap-2 px-3 text-white text-[12px]"
          style={{ background: 'linear-gradient(180deg, var(--titlebar-from), var(--titlebar-to))' }}
        >
          <IconLogo width={14} height={14} />
          <span>{ecran === 'porte' ? 'Ouverture du dossier comptable' : 'Identification'}</span>
        </div>

        <div className="flex">
          {/* Panneau de marque · le pendant du bandeau vert de Sage. */}
          <div
            className="w-[168px] flex-shrink-0 p-4 flex flex-col justify-between"
            style={{ background: 'linear-gradient(180deg, var(--titlebar-from), var(--titlebar-to))' }}
          >
            <div>
              <div className="w-[38px] h-[38px] rounded-[11px] bg-white/10 flex items-center justify-center text-white">
                <IconLogo width={22} height={22} />
              </div>
              <div className="mt-2.5 text-[17px] font-extrabold tracking-tight text-white">OMEGAX</div>
              <div className="mt-1 text-[10.5px] text-white/70 leading-[1.5]">
                Comptabilité des entités à but non lucratif · SYCEBNL
              </div>
            </div>
            <div className="text-[10px] text-white/45">© 2026</div>
          </div>

          <div className="flex-1 min-w-0 p-5">

      {/* ------------------------------------------------------------------ */}
      {/* Écran 1 · la porte : créer, ou ouvrir. Aucun champ d'identifiant.   */}
      {/* ------------------------------------------------------------------ */}
      {ecran === 'porte' && (
        <div className="w-full">
          {/* Phrase d'accueil · Sage dit d'abord OÙ L'ON EST (aucun fichier
              ouvert), puis ce qu'on peut faire. Entrer directement dans deux
              boutons laisse deviner. */}
          <p className="text-[12.5px] text-text-dim leading-[1.6] mb-4">
            Aucun dossier comptable n'est ouvert. Créez un nouveau dossier, ou ouvrez un dossier existant.
          </p>

          {/* Choix EMPILÉS, et non côte à côte : deux colonnes dans un volet
              de cette largeur coupaient chaque titre en deux lignes. */}
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setAssistantOuvert(true)}
              className="flex items-start gap-3 rounded-[10px] border border-border bg-surface p-3.5 text-left shadow-posee hover:border-sel hover:bg-sel-soft transition-colors"
            >
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] bg-sel text-white">
                <IconFileAdd width={18} height={18} />
              </span>
              <span className="min-w-0">
                <span className="block text-[13.5px] font-bold">Créer un nouveau fichier comptable</span>
                <span className="block text-[11.5px] text-text-dim leading-[1.5] mt-0.5">
                  L'assistant demande le référentiel, le jeu d'états financiers, l'exercice et la monnaie de tenue,
                  puis sème le plan de comptes.
                </span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => ouvrirDossier(recents[0] ?? null)}
              className="flex items-start gap-3 rounded-[10px] border border-border bg-surface p-3.5 text-left shadow-posee hover:border-sel hover:bg-sel-soft transition-colors"
            >
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] bg-chrome-alt text-sel">
                <IconFolderOpen width={18} height={18} />
              </span>
              <span className="min-w-0">
                <span className="block text-[13.5px] font-bold">Ouvrir un fichier comptable existant</span>
                <span className="block text-[11.5px] text-text-dim leading-[1.5] mt-0.5">
                  Le dossier s'ouvre sur les identifiants qui lui ont été donnés à sa création.
                </span>
              </span>
            </button>
          </div>

          {recents.length > 0 && (
            <div className="mt-5">
              <div className="text-[11px] font-bold text-text-dim mb-1.5 px-0.5">DOSSIERS RÉCENTS</div>
              <div className="rounded-xl border border-border bg-surface overflow-hidden">
                {recents.map((d) => (
                  <div key={d.email} className="flex items-center gap-2 border-b border-border last:border-b-0">
                    <button
                      type="button"
                      onClick={() => ouvrirDossier(d)}
                      className="flex-1 min-w-0 text-left px-3.5 py-2.5 hover:bg-sel-soft"
                    >
                      <span className="block text-[13px] font-semibold truncate">{d.nom}</span>
                      <span className="block text-[11px] text-text-dim truncate">
                        {d.email} · ouvert le {dateCourte(d.derniereOuverture)}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => retirer(d.email)}
                      title="Retirer ce raccourci de cet appareil"
                      className="px-3 text-[11px] text-text-dim hover:text-danger"
                    >
                      Retirer
                    </button>
                  </div>
                ))}
              </div>
              <p className="mt-1.5 px-0.5 text-[10.5px] text-text-dim">
                Ces raccourcis ne sont enregistrés que sur cet appareil et ne contiennent aucun mot de passe.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Écran 2 · l'identification, une fois le dossier désigné.            */}
      {/* ------------------------------------------------------------------ */}
      {ecran === 'identification' && (
        <div className="w-full">
          <p className="text-[12.5px] text-text-dim leading-[1.6] mb-4">
            {dossierVise
              ? 'Saisissez les identifiants donnés à ce dossier lors de sa création.'
              : 'Saisissez les identifiants du dossier comptable à ouvrir.'}
          </p>
          {dossierVise && (
            <div className="mb-4 rounded-[8px] border border-border bg-chrome px-3.5 py-2.5">
              <div className="text-[10px] font-bold text-text-dim">DOSSIER</div>
              <div className="text-[13.5px] font-bold truncate">{dossierVise.nom}</div>
            </div>
          )}

          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-semibold text-text-dim">Adresse e-mail</span>
              <input
                type="email"
                required
                autoFocus={!dossierVise}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={champClasse}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-semibold text-text-dim">Mot de passe</span>
              <div className="relative">
                <input
                  type={motDePasseVisible ? 'text' : 'password'}
                  required
                  autoFocus={Boolean(dossierVise)}
                  value={motDePasse}
                  onChange={(e) => setMotDePasse(e.target.value)}
                  className={`${champClasse} pr-9`}
                />
                <button
                  type="button"
                  onClick={() => setMotDePasseVisible((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-dim hover:text-text"
                  tabIndex={-1}
                >
                  <IconOeil ouvert={motDePasseVisible} />
                </button>
              </div>
            </label>

            {erreur && (
              <div className="text-[12px] text-danger bg-danger-soft border border-danger/30 rounded-[6px] px-3 py-2">
                {erreur}
              </div>
            )}

            {/* RANGÉE DE BOUTONS · même gabarit et même ordre que l'assistant
                (retour à gauche, action à droite) : les deux fenêtres qui
                s'enchaînent à l'ouverture du logiciel se répondent. */}
            <div className="mt-2 pt-3 border-t border-border flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setEcran('porte')}
                className="px-3 py-1.5 text-[12.5px] text-text-dim hover:text-sel"
              >
                &lt; Ouvrir un autre dossier
              </button>
              <button
                type="submit"
                disabled={envoi}
                className="px-4 py-1.5 rounded-[6px] bg-sel text-white text-[12.5px] font-semibold hover:brightness-110 disabled:opacity-50"
              >
                {envoi ? 'Un instant…' : 'Ouvrir le dossier'}
              </button>
            </div>
          </form>

          <div className="mt-3 text-[12px]">
            <button
              type="button"
              onClick={() => setAssistantOuvert(true)}
              className="font-semibold text-sel hover:underline"
            >
              Créer un nouveau fichier comptable
            </button>
          </div>
        </div>
      )}
          </div>
        </div>
      </div>

      {assistantOuvert && (
        <NouveauFichierWizard
          onClose={() => setAssistantOuvert(false)}
          // Sage enchaîne : l'assistant terminé, il ouvre la fiche
          // « Identification de votre société » pour compléter ce qu'il n'a
          // pas demandé (forme juridique, régime, identifiants légaux).
          // On atterrit donc sur cette fenêtre, et non sur un accueil vide.
          onTermine={() => navigate('/parametres-dossier')}
        />
      )}
    </div>
  );
}
