import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { SymboleOmegaX } from '../components/chrome/Logo';
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
 *    compte n'ouvre aujourd'hui qu'un seul dossier.
 *  - L'ÉCRAN DE PORTE A ÉTÉ RETIRÉ le 2026-09-03. Il proposait « créer » ou
 *    « ouvrir », mais l'auto-inscription est fermée (option A) : la création
 *    n'était plus qu'un pavé de texte sans bouton, et « ouvrir » ne faisait
 *    que passer à l'écran suivant. Un écran entier pour un clic obligatoire
 *    n'est pas une transposition de Sage, c'est une survivance. Ce que Sage
 *    fait vraiment ici, c'est demander « quel dossier, et qui êtes-vous » ·
 *    une seule fenêtre y suffit.
 *  - Les Favoris deviennent les DOSSIERS RÉCENTS, mémorisés dans le
 *    navigateur (voir `lib/dossiersRecents.ts`) · un nom et une adresse,
 *    jamais un mot de passe.
 *  - Comme chez Sage, quelqu'un qui revient ne repasse pas par la porte : s'il
 *    a déjà ouvert un dossier sur ce navigateur, on l'amène directement à la
 *    fenêtre d'identification de son dernier dossier, avec un retour possible
 *    vers les deux choix.
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

export function AuthPage() {
  // Lu une seule fois, au montage : la liste ne change qu'à l'initiative de
  // l'utilisateur (retrait d'un raccourci) ou après une connexion réussie,
  // moment où l'on quitte cette page de toute façon.
  const [recents, setRecents] = useState<DossierRecent[]>(() => lireDossiersRecents());
  const [dossierVise, setDossierVise] = useState<DossierRecent | null>(() => lireDossiersRecents()[0] ?? null);
  const [email, setEmail] = useState(() => lireDossiersRecents()[0]?.email ?? '');
  const [motDePasse, setMotDePasse] = useState('');
  const [motDePasseVisible, setMotDePasseVisible] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const { seConnecter } = useAuth();
  const navigate = useNavigate();

  /** Choisir un dossier récent · cela ne change plus d'écran, cela remplit. */
  const ouvrirDossier = (d: DossierRecent | null) => {
    setErreur(null);
    setDossierVise(d);
    setEmail(d?.email ?? '');
    setMotDePasse('');
  };

  const retirer = (email: string) => {
    const restants = oublierDossier(email);
    setRecents(restants);
    if (dossierVise?.email === email) {
      setDossierVise(null);
      setEmail('');
    }
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
      await seConnecter(res.csrfToken);
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
    'w-full rounded-[6px] border border-border bg-surface px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-sel/25 focus:border-sel';

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
          className="h-[34px] flex items-center gap-2 px-3 text-white text-[11px]"
          style={{ background: 'linear-gradient(180deg, var(--titlebar-from), var(--titlebar-to))' }}
        >
          <SymboleOmegaX taille={14} className="text-white" />
          <span>Ouverture du dossier comptable</span>
        </div>

        {/*
          Le panneau de marque passe AU-DESSUS du formulaire sous `sm`. Fixé
          à 168 px sur un écran de 360, il ne laissait que 118 px au volet de
          droite, et 40 px au texte une fois les marges retirées : les
          libellés se brisaient lettre par lettre. Empilé, il redevient un
          simple bandeau et le formulaire reprend toute la largeur.
        */}
        <div className="flex flex-col sm:flex-row">
          {/* Panneau de marque · le pendant du bandeau vert de Sage. */}
          <div
            className="w-full sm:w-[168px] sm:flex-shrink-0 p-4 flex flex-row sm:flex-col items-center sm:items-stretch gap-3 sm:gap-0 justify-between"
            style={{ background: 'linear-gradient(180deg, var(--titlebar-from), var(--titlebar-to))' }}
          >
            <div className="min-w-0">
              <div className="w-[38px] h-[38px] rounded-[11px] bg-white/10 flex items-center justify-center text-white">
                <SymboleOmegaX taille={23} />
              </div>
              <div className="mt-2.5 text-[16px] font-semibold tracking-[-0.015em] leading-none text-white">
                OmegaX
              </div>
              {/*
                Aucun dossier n'est ouvert à cet écran : le référentiel est
                donc INCONNU, et annoncer « entités à but non lucratif ·
                SYCEBNL » mentait à tout dossier SYSCOHADA · la porte
                d'entrée d'un logiciel qui tient les deux ne peut pas se
                réclamer d'un seul. Les deux référentiels relèvent de
                l'OHADA, c'est le seul dénominateur exact.
              */}
              <div className="mt-1 text-[10px] text-white/70 leading-[1.5]">
                Comptabilité OHADA · SYCEBNL et SYSCOHADA
              </div>
            </div>
            <div className="text-[10px] text-white/45">© 2026</div>
          </div>

          <div className="flex-1 min-w-0 p-5">

      {/* ------------------------------------------------------------------ */}
      {/* Un seul écran · quel dossier, et qui êtes-vous.                     */}
      {/* ------------------------------------------------------------------ */}
      <div className="w-full">
        <p className="text-[11px] text-text-dim leading-[1.6] mb-4">
          {dossierVise
            ? 'Saisissez les identifiants donnés à ce dossier lors de sa création.'
            : 'Saisissez les identifiants du dossier comptable à ouvrir.'}
        </p>
        {dossierVise && (
          <div className="mb-4 flex items-center justify-between gap-2 rounded-[8px] border border-border bg-chrome px-3.5 py-2.5">
            <span className="min-w-0">
              <span className="block text-[10px] font-bold text-text-dim">DOSSIER</span>
              <span className="block text-[12px] font-bold truncate">{dossierVise.nom}</span>
            </span>
            {/* Remplace l'ancien « &lt; Ouvrir un autre dossier » qui renvoyait à
                la porte · il n'y a plus d'écran derrière, seulement un champ
                à vider. */}
            <button
              type="button"
              onClick={() => ouvrirDossier(null)}
              className="flex-shrink-0 px-2 py-1 text-[10.5px] text-text-dim hover:text-sel"
            >
              Un autre dossier
            </button>
          </div>
        )}

        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold text-text-dim">Adresse e-mail</span>
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
            <span className="text-[11px] font-semibold text-text-dim">Mot de passe</span>
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
            <div className="text-[11px] text-danger bg-danger-soft border border-danger/30 rounded-[6px] px-3 py-2">
              {erreur}
            </div>
          )}

          <div className="mt-2 pt-3 border-t border-border flex items-center justify-end">
            <button
              type="submit"
              disabled={envoi}
              className="px-4 py-1.5 rounded-[6px] bg-sel text-white text-[11px] font-semibold hover:brightness-110 disabled:opacity-50"
            >
              {envoi ? 'Un instant…' : 'Ouvrir le dossier'}
            </button>
          </div>
        </form>

        {/* LES FAVORIS DE SAGE · ils étaient sur l'écran de porte, ils sont
            maintenant ici, sous le formulaire, là où ils servent : un clic
            remplit l'adresse au lieu de la retaper. */}
        {recents.length > 0 && (
          <div className="mt-5">
            <div className="text-[10.5px] font-bold text-text-dim mb-1.5 px-0.5">DOSSIERS RÉCENTS</div>
            <div className="rounded-xl border border-border bg-surface overflow-hidden">
              {recents.map((d) => (
                <div key={d.email} className="flex items-center gap-2 border-b border-border last:border-b-0">
                  <button
                    type="button"
                    onClick={() => ouvrirDossier(d)}
                    className={`flex-1 min-w-0 text-left px-3.5 py-2.5 hover:bg-sel-soft ${
                      dossierVise?.email === d.email ? 'bg-sel-soft' : ''
                    }`}
                  >
                    <span className="block text-[12px] font-semibold truncate">{d.nom}</span>
                    <span className="block text-[10.5px] text-text-dim truncate">
                      {d.email} · ouvert le {dateCourte(d.derniereOuverture)}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => retirer(d.email)}
                    title="Retirer ce raccourci de cet appareil"
                    className="px-3 text-[10.5px] text-text-dim hover:text-danger"
                  >
                    Retirer
                  </button>
                </div>
              ))}
            </div>
            <p className="mt-1.5 px-0.5 text-[10px] text-text-dim">
              Ces raccourcis ne sont enregistrés que sur cet appareil et ne contiennent aucun mot de passe.
            </p>
          </div>
        )}

        {/* L'auto-inscription est fermée · la règle doit rester dite, mais une
            ligne y suffit : elle occupait un tiers de l'écran. */}
        <div className="mt-4 text-[11px] text-text-dim">
          Pas encore de dossier ? L'ouverture se fait avec VMG Consulting.
        </div>
        {/*
          Le lien vers la politique de confidentialité est ICI parce que c'est
          la seule page qu'un visiteur non connecté voit · un lien enfoui dans
          l'espace de travail n'est atteignable que par ceux qui ont déjà
          accepté, ce qui est exactement l'inverse de ce qu'on veut.
        */}
        <div className="mt-2 text-[10px] text-text-dim">
          <a href="#/confidentialite" className="underline">
            Politique de confidentialité
          </a>
        </div>
      </div>
          </div>
        </div>
      </div>

    </div>
  );
}
