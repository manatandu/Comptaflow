import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { changerMonMotDePasse, refusNouveauMotDePasse } from '../lib/mot-de-passe';
import { Aide } from './chrome/Aide';
import { ModaleDoubleAuth } from './ModaleDoubleAuth';
import { ModaleMonAdresse } from './ModaleMonAdresse';
import { PortailModale } from './PortailModale';

/**
 * MON COMPTE · les réglages de sécurité de SON PROPRE compte, ouverts à tous
 * les rôles comme leurs routes (auth.controller.ts, gestionnaire de paie
 * compris). Ils ne vivaient que dans la fenêtre des utilisateurs, réservée à
 * l'administrateur : un comptable ne pouvait ni activer son second facteur,
 * ni changer son mot de passe, ni fermer une session oubliée sur un autre
 * poste (audit de l'interface, F3). La fenêtre des utilisateurs gère les
 * AUTRES comptes ; celle-ci, le sien.
 *
 * Aucun droit n'est lu ici, et c'est voulu · chacun change ce qui est à lui,
 * lecture seule comprise (ecriture-masquee.spec.ts l'exempte à ce titre).
 */
export function ModaleMonCompte({ onFermer }: { onFermer: () => void }) {
  const { utilisateur, rafraichir, seDeconnecter } = useAuth();
  const navigate = useNavigate();
  const [sousModale, setSousModale] = useState<'double-auth' | 'adresse' | null>(null);
  const [actuel, setActuel] = useState('');
  const [nouveau, setNouveau] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [fait, setFait] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const changerMotDePasse = async (e: FormEvent) => {
    e.preventDefault();
    setErreur(null);
    setFait(null);
    const refus = refusNouveauMotDePasse(actuel, nouveau, confirmation);
    if (refus) {
      setErreur(refus);
      return;
    }
    setEnvoi(true);
    try {
      await changerMonMotDePasse(actuel, nouveau);
      await rafraichir();
      setActuel('');
      setNouveau('');
      setConfirmation('');
      setFait('Mot de passe changé · vos autres sessions sont fermées.');
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Changement impossible');
    } finally {
      setEnvoi(false);
    }
  };

  const fermerToutesMesSessions = async () => {
    if (!window.confirm('Fermer toutes vos sessions, celle-ci comprise ?')) return;
    setErreur(null);
    setEnvoi(true);
    try {
      // Le serveur fait tomber le cookie de CETTE session aussi · on referme
      // donc l'interface par le chemin ordinaire, qui oublie le jeton CSRF et
      // l'utilisateur, puis on revient à la porte d'entrée.
      await api.post('/auth/deconnecter-partout');
      seDeconnecter();
      navigate('/connexion');
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Fermeture impossible');
      setEnvoi(false);
    }
  };

  // Les deux modales existantes sont rendues À LA PLACE de celle-ci, jamais
  // par-dessus · deux voiles empilés doubleraient l'ombre et la fermeture au
  // clic sur le voile fermerait les deux.
  if (sousModale === 'double-auth') return <ModaleDoubleAuth onFermer={() => setSousModale(null)} />;
  if (sousModale === 'adresse' && utilisateur)
    return <ModaleMonAdresse adresseActuelle={utilisateur.email} onFermer={() => setSousModale(null)} />;

  return (
    <PortailModale>
      <div className="fixed inset-0 z-50 bg-black/35 flex items-center justify-center p-4" onClick={onFermer}>
        <div
          className="anim-modale w-[460px] modale-bornee max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-[4px] bg-surface border border-border-dark shadow-dominante text-[11.5px]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-3.5 h-[32px] border-b border-border">
            <span className="flex items-center gap-1.5 font-bold">
              Mon compte
              <Aide
                titre="Mon compte"
                texte="Changer de mot de passe, activer la double authentification ou changer d'adresse ferme vos autres sessions ; celle-ci est aussitôt rouverte. « Fermer toutes mes sessions » ferme aussi celle-ci, par exemple après avoir laissé une session ouverte sur un autre poste."
                source="Règle d'OmegaX · révocation des sessions à chaque changement d'accès."
              />
            </span>
            <button type="button" onClick={onFermer} aria-label="Fermer">
              ✕
            </button>
          </div>
          <div className="p-3 space-y-3">
            <div className="text-text-dim">{utilisateur?.email}</div>
            {erreur && <div className="text-danger bg-danger-soft border border-danger/30 px-3 py-2">{erreur}</div>}
            {fait && <div className="text-positive bg-positive-soft border border-positive/30 px-3 py-2">{fait}</div>}

            <form onSubmit={changerMotDePasse} className="border border-border p-2.5 space-y-2">
              <div className="font-semibold">Mot de passe</div>
              <label className="flex flex-col gap-0.5">
                <span className="text-text-dim">Mot de passe actuel</span>
                <input type="password" required autoComplete="current-password" value={actuel} onChange={(e) => setActuel(e.target.value)} className="border border-border px-2 py-[3px]" />
              </label>
              <label className="flex flex-col gap-0.5">
                <span className="text-text-dim">Nouveau mot de passe</span>
                <input type="password" required minLength={10} autoComplete="new-password" placeholder="10 caractères min." value={nouveau} onChange={(e) => setNouveau(e.target.value)} className="border border-border px-2 py-[3px]" />
              </label>
              <label className="flex flex-col gap-0.5">
                <span className="text-text-dim">Confirmation</span>
                <input type="password" required minLength={10} autoComplete="new-password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} className="border border-border px-2 py-[3px]" />
              </label>
              <div className="flex justify-end">
                <button type="submit" disabled={envoi} className="bg-sel text-white font-semibold px-4 py-1.5 disabled:opacity-40">
                  {envoi ? '…' : 'Changer le mot de passe'}
                </button>
              </div>
            </form>

            <div className="border border-border p-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
              <button type="button" onClick={() => setSousModale('double-auth')} className="text-sel">
                Double authentification…
              </button>
              <button type="button" onClick={() => setSousModale('adresse')} className="text-sel">
                Changer mon adresse de connexion…
              </button>
            </div>

            <div className="flex justify-end">
              <button type="button" disabled={envoi} onClick={() => void fermerToutesMesSessions()} className="text-danger border border-danger/40 px-3 py-1.5 disabled:opacity-40">
                Fermer toutes mes sessions
              </button>
            </div>
          </div>
        </div>
      </div>
    </PortailModale>
  );
}
