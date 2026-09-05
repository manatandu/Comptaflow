import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { RoleUtilisateur, Utilisateur } from '../lib/types';

const LIBELLE_ROLE: Record<RoleUtilisateur, string> = {
  ADMIN_CABINET: 'Administrateur',
  COMPTABLE: 'Comptable',
  LECTURE_SEULE: 'Lecture seule',
};

export function UtilisateursPage() {
  const { estAdmin, utilisateur } = useAuth();
  const [liste, setListe] = useState<Utilisateur[] | null>(null);
  const [erreurChargement, setErreurChargement] = useState<string | null>(null);

  const [nouveauOuvert, setNouveauOuvert] = useState(false);

  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [role, setRole] = useState<RoleUtilisateur>('COMPTABLE');
  const [erreurForm, setErreurForm] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  // Réinitialisation · l'administrateur pose un mot de passe provisoire, que
  // le titulaire devra remplacer avant de travailler. Sans cette fenêtre, un
  // oubli de mot de passe se réglait par un UPDATE SQL en production.
  const [reinitCible, setReinitCible] = useState<Utilisateur | null>(null);
  const [reinitMotDePasse, setReinitMotDePasse] = useState('');
  const [reinitErreur, setReinitErreur] = useState<string | null>(null);
  const [reinitFait, setReinitFait] = useState<string | null>(null);

  const charger = async () => {
    try {
      setListe(await api.get<Utilisateur[]>('/utilisateurs'));
      setErreurChargement(null);
    } catch (err) {
      setErreurChargement(err instanceof ApiError ? err.message : 'Impossible de charger les utilisateurs');
    }
  };

  useEffect(() => {
    if (estAdmin) charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estAdmin]);

  if (!estAdmin) {
    return (
      <div className="p-4">
        <div className="border border-warning/30 bg-warning-soft px-4 py-3 text-[11px] max-w-[480px]">
          Cette page est réservée aux administrateurs du dossier.
        </div>
      </div>
    );
  }

  const deverrouiller = async (u: Utilisateur) => {
    await api.post(`/utilisateurs/${u.id}/deverrouiller`, {});
    await charger();
  };

  const onReinitialiser = async (e: FormEvent) => {
    e.preventDefault();
    if (!reinitCible) return;
    setReinitErreur(null);
    try {
      await api.post(`/utilisateurs/${reinitCible.id}/reinitialiser-mot-de-passe`, {
        motDePasseProvisoire: reinitMotDePasse,
      });
      setReinitFait(reinitCible.email);
      setReinitCible(null);
      setReinitMotDePasse('');
      await charger();
    } catch (err) {
      setReinitErreur(err instanceof ApiError ? err.message : 'Réinitialisation impossible');
    }
  };

  const onCreer = async (e: FormEvent) => {
    e.preventDefault();
    setErreurForm(null);
    setEnvoi(true);
    try {
      await api.post('/utilisateurs', { email, motDePasse, role });
      setEmail('');
      setMotDePasse('');
      setRole('COMPTABLE');
      setNouveauOuvert(false);
      await charger();
    } catch (err) {
      setErreurForm(err instanceof ApiError ? err.message : 'Impossible de créer cet utilisateur');
    } finally {
      setEnvoi(false);
    }
  };

  const changerRole = async (id: string, nouveauRole: RoleUtilisateur) => {
    await api.patch(`/utilisateurs/${id}`, { role: nouveauRole });
    await charger();
  };

  const basculerActif = async (u: Utilisateur) => {
    try {
      await api.patch(`/utilisateurs/${u.id}`, { estActif: !u.estActif });
      await charger();
    } catch (err) {
      setErreurChargement(err instanceof ApiError ? err.message : 'Action impossible');
    }
  };

  return (
    <div className="p-2">
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-[10px] font-mono text-text-dim leading-none">FICHIER</div>
          <h1 className="text-[12px] font-bold leading-tight">Autorisations d'accès · utilisateurs du dossier</h1>
        </div>
        <button type="button" onClick={() => setNouveauOuvert(true)} className="bg-sel text-white px-3.5 py-1 text-[10.5px] font-semibold">
          Nouvel utilisateur
        </button>
      </div>

      {erreurChargement && <div className="text-[11px] text-danger bg-danger-soft border border-danger/30 px-3 py-1.5 mb-2 max-w-[720px]">{erreurChargement}</div>}

      {reinitFait && (
        <div className="border border-positive/30 bg-positive-soft px-3.5 py-2 text-[11px] mb-2 max-w-[940px]">
          Mot de passe réinitialisé pour <strong>{reinitFait}</strong>. Remettez-le en main propre · il est
          PROVISOIRE, ses sessions ouvertes sont fermées, et le logiciel lui restera fermé tant qu'il ne l'aura pas
          remplacé.
        </div>
      )}

      <div
        // `overflow-x-auto` ici, `min-w` sur les lignes · les 590 px de colonnes
        // incompressibles du tableau ne tiennent pas dans les ~326 px utiles d'une
        // fenêtre à 360 px, et sans conteneur le débordement remontait à la fenêtre,
        // qui emportait alors titre, onglets et boutons hors de l'écran.
        className="border border-border bg-surface shadow-posee max-w-[940px] overflow-x-auto"
      >
        <div className="grid grid-cols-[1fr_150px_90px_100px_190px] min-w-[740px] gap-2 px-3.5 py-1.5 bg-chrome border-b border-border text-[10px] font-bold text-text-dim">
          <span>E-MAIL</span><span>RÔLE</span><span>STATUT</span><span></span><span>MOT DE PASSE</span>
        </div>
        {!liste && <div className="p-3 text-[11px] text-text-dim">Chargement…</div>}
        {liste?.map((u, i) => (
          <div key={u.id} className={`grid grid-cols-[1fr_150px_90px_100px_190px] min-w-[740px] gap-2 items-center px-3.5 py-1.5 border-b border-border last:border-b-0 ${i % 2 === 0 ? 'bg-surface' : 'bg-surface-alt'}`}>
            <span className="text-[11px] truncate">
              {u.email}
              {u.id === utilisateur?.id && <span className="text-text-dim"> (vous)</span>}
            </span>
            <select
              value={u.role}
              onChange={(e) => changerRole(u.id, e.target.value as RoleUtilisateur)}
              className="border border-border-dark px-1.5 py-1 text-[10.5px] bg-surface"
            >
              <option value="ADMIN_CABINET">Administrateur</option>
              <option value="COMPTABLE">Comptable</option>
              <option value="LECTURE_SEULE">Lecture seule</option>
            </select>
            <span className={`font-mono text-[10px] font-bold px-1.5 py-0.5 w-fit ${u.estActif ? 'text-positive bg-positive-soft' : 'text-text-dim bg-surface-alt'}`}>
              {u.estActif ? 'ACTIF' : 'INACTIF'}
            </span>
            <button
              onClick={() => basculerActif(u)}
              disabled={u.id === utilisateur?.id && u.estActif}
              title={u.id === utilisateur?.id && u.estActif ? 'Impossible de désactiver son propre compte' : undefined}
              className="text-[10.5px] text-sel text-left disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {u.estActif ? 'Désactiver' : 'Réactiver'}
            </button>
            <div className="flex items-center gap-2 flex-wrap">
              {u.doitChangerMotDePasse && (
                <span
                  className="font-mono text-[9.5px] font-bold px-1.5 py-0.5 text-warning bg-warning-soft"
                  title="Le mot de passe a transité par un tiers · le logiciel reste fermé à ce compte tant qu'il ne l'a pas remplacé."
                >
                  PROVISOIRE
                </span>
              )}
              {u.verrouilleJusqua && new Date(u.verrouilleJusqua) > new Date() && (
                <button
                  onClick={() => deverrouiller(u)}
                  className="font-mono text-[9.5px] font-bold px-1.5 py-0.5 text-danger bg-danger-soft"
                  title={`Verrouillé après plusieurs tentatives infructueuses, jusqu'à ${new Date(u.verrouilleJusqua).toLocaleTimeString('fr-FR')}. Cliquez pour lever le verrou.`}
                >
                  VERROUILLÉ · lever
                </button>
              )}
              <button
                onClick={() => {
                  setReinitCible(u);
                  setReinitMotDePasse('');
                  setReinitErreur(null);
                  setReinitFait(null);
                }}
                className="text-[10.5px] text-sel"
              >
                Réinitialiser
              </button>
            </div>
          </div>
        ))}
      </div>
      <p className="text-[10.5px] text-text-dim mt-2 max-w-[720px]">
        {LIBELLE_ROLE.ADMIN_CABINET} : accès complet, y compris cette fenêtre. {LIBELLE_ROLE.COMPTABLE} : saisie et
        consultation. {LIBELLE_ROLE.LECTURE_SEULE} : consultation uniquement.
      </p>

      {reinitCible && (
        <div className="anim-voile fixed inset-0 z-40 bg-black/35 flex items-center justify-center p-4">
          <form
            onSubmit={onReinitialiser}
            className="anim-fenetre bg-surface border border-border-dark shadow-flottant w-[440px] max-w-full"
          >
            <div className="px-3.5 py-2 bg-chrome border-b border-border-dark text-[11px] font-bold">
              Réinitialiser le mot de passe · {reinitCible.email}
            </div>
            <div className="p-3.5 flex flex-col gap-2.5">
              <p className="text-[10.5px] text-text-dim">
                Vous posez un mot de passe PROVISOIRE, que vous remettez en main propre. Il ferme aussitôt les
                sessions ouvertes du compte, lève un éventuel verrou, et le logiciel restera fermé à ce compte tant
                que son titulaire ne l'aura pas remplacé. Le geste est inscrit au journal d'audit.
              </p>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-text-dim">MOT DE PASSE PROVISOIRE</span>
                <input
                  value={reinitMotDePasse}
                  onChange={(e) => setReinitMotDePasse(e.target.value)}
                  minLength={10}
                  required
                  autoFocus
                  className="border border-border-dark px-2.5 py-1.5 text-[11px]"
                />
                <span className="text-[10px] text-text-dim">Dix caractères au minimum.</span>
              </label>
              {reinitErreur && (
                <div className="text-[11px] text-danger bg-danger-soft border border-danger/30 px-2.5 py-1.5">
                  {reinitErreur}
                </div>
              )}
            </div>
            <div className="px-3.5 py-2 bg-surface-alt border-t border-border flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReinitCible(null)}
                className="border border-border-dark px-3 py-1 text-[10.5px]"
              >
                Annuler
              </button>
              <button type="submit" className="border border-border-dark bg-chrome px-3 py-1 text-[10.5px] font-semibold">
                Réinitialiser
              </button>
            </div>
          </form>
        </div>
      )}

      {nouveauOuvert && (
        <div className="anim-voile fixed inset-0 z-40 bg-black/35 flex items-center justify-center p-4">
          <form onSubmit={onCreer} className="anim-modale w-full max-w-[440px] bg-surface border border-border-dark shadow-flottante max-h-[calc(100dvh-2rem)] overflow-y-auto">
            <div
              className="h-[26px] flex items-center justify-between px-2.5 text-white text-[10.5px]"
              style={{ background: 'linear-gradient(180deg, var(--titlebar-from), var(--titlebar-to))' }}
            >
              <span>Nouvel utilisateur</span>
              <button type="button" onClick={() => setNouveauOuvert(false)} className="text-white/85 hover:text-white px-1.5">✕</button>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-[130px_1fr] items-center gap-x-3 gap-y-2.5">
                <label className="text-[11px] text-right">E-mail :</label>
                <input type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} className="border border-border-dark px-2.5 py-1.5 text-[12px]" />
                <label className="text-[11px] text-right">Mot de passe :</label>
                <input type="password" required minLength={10} placeholder="10 caractères min." value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} className="border border-border-dark px-2.5 py-1.5 text-[12px]" />
                <label className="text-[11px] text-right">Rôle :</label>
                <select value={role} onChange={(e) => setRole(e.target.value as RoleUtilisateur)} className="border border-border-dark px-2.5 py-1.5 text-[11px]">
                  <option value="ADMIN_CABINET">Administrateur</option>
                  <option value="COMPTABLE">Comptable</option>
                  <option value="LECTURE_SEULE">Lecture seule</option>
                </select>
              </div>
              {erreurForm && <div className="text-[11px] text-danger bg-danger-soft border border-danger/30 px-2.5 py-1.5 mt-3">{erreurForm}</div>}
              <div className="flex justify-end gap-2 mt-4">
                <button type="button" onClick={() => setNouveauOuvert(false)} className="border border-border-dark bg-chrome hover:bg-chrome-alt px-4 py-1.5 text-[11px]">
                  Annuler
                </button>
                <button type="submit" disabled={envoi} className="bg-sel text-white px-4 py-1.5 text-[11px] font-semibold disabled:opacity-50">
                  {envoi ? 'Création…' : "Créer l'utilisateur"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
