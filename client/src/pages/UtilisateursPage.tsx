import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useActionsFenetre } from '../lib/actions-fenetre';
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

  useActionsFenetre({
    ajouter: { titre: 'Nouvel utilisateur', executer: () => setNouveauOuvert(true) },
  });
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [role, setRole] = useState<RoleUtilisateur>('COMPTABLE');
  const [erreurForm, setErreurForm] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

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
        <div className="border border-warning/30 bg-warning-soft px-4 py-3 text-[12.5px] max-w-[480px]">
          Cette page est réservée aux administrateurs du dossier.
        </div>
      </div>
    );
  }

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
          <div className="text-[9.5px] font-mono text-text-dim leading-none">FICHIER</div>
          <h1 className="text-[13px] font-bold leading-tight">Autorisations d'accès · utilisateurs du dossier</h1>
        </div>
        <button type="button" onClick={() => setNouveauOuvert(true)} className="bg-sel text-white px-3.5 py-1 text-[11.5px] font-semibold">
          Nouvel utilisateur
        </button>
      </div>

      {erreurChargement && <div className="text-[12px] text-danger bg-danger-soft border border-danger/30 px-3 py-1.5 mb-2 max-w-[720px]">{erreurChargement}</div>}

      <div className="border border-border bg-surface shadow-posee max-w-[760px]">
        <div className="grid grid-cols-[1fr_150px_90px_100px] gap-2 px-3.5 py-1.5 bg-chrome border-b border-border text-[10px] font-bold text-text-dim">
          <span>E-MAIL</span><span>RÔLE</span><span>STATUT</span><span></span>
        </div>
        {!liste && <div className="p-3 text-[12px] text-text-dim">Chargement…</div>}
        {liste?.map((u, i) => (
          <div key={u.id} className={`grid grid-cols-[1fr_150px_90px_100px] gap-2 items-center px-3.5 py-1.5 border-b border-border last:border-b-0 ${i % 2 === 0 ? 'bg-surface' : 'bg-surface-alt'}`}>
            <span className="text-[12.5px] truncate">
              {u.email}
              {u.id === utilisateur?.id && <span className="text-text-dim"> (vous)</span>}
            </span>
            <select
              value={u.role}
              onChange={(e) => changerRole(u.id, e.target.value as RoleUtilisateur)}
              className="border border-border-dark px-1.5 py-1 text-[11.5px] bg-surface"
            >
              <option value="ADMIN_CABINET">Administrateur</option>
              <option value="COMPTABLE">Comptable</option>
              <option value="LECTURE_SEULE">Lecture seule</option>
            </select>
            <span className={`font-mono text-[9.5px] font-bold px-1.5 py-0.5 w-fit ${u.estActif ? 'text-positive bg-positive-soft' : 'text-text-dim bg-surface-alt'}`}>
              {u.estActif ? 'ACTIF' : 'INACTIF'}
            </span>
            <button
              onClick={() => basculerActif(u)}
              disabled={u.id === utilisateur?.id && u.estActif}
              title={u.id === utilisateur?.id && u.estActif ? 'Impossible de désactiver son propre compte' : undefined}
              className="text-[11px] text-sel text-left disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {u.estActif ? 'Désactiver' : 'Réactiver'}
            </button>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-text-dim mt-2 max-w-[720px]">
        {LIBELLE_ROLE.ADMIN_CABINET} : accès complet, y compris cette fenêtre. {LIBELLE_ROLE.COMPTABLE} : saisie et
        consultation. {LIBELLE_ROLE.LECTURE_SEULE} : consultation uniquement.
      </p>

      {nouveauOuvert && (
        <div className="anim-voile fixed inset-0 z-40 bg-black/35 flex items-center justify-center p-4">
          <form onSubmit={onCreer} className="anim-modale w-full max-w-[440px] bg-surface border border-border-dark shadow-flottante">
            <div
              className="h-[26px] flex items-center justify-between px-2.5 text-white text-[11.5px]"
              style={{ background: 'linear-gradient(180deg, var(--titlebar-from), var(--titlebar-to))' }}
            >
              <span>Nouvel utilisateur</span>
              <button type="button" onClick={() => setNouveauOuvert(false)} className="text-white/85 hover:text-white px-1.5">✕</button>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-[130px_1fr] items-center gap-x-3 gap-y-2.5">
                <label className="text-[12px] text-right">E-mail :</label>
                <input type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} className="border border-border-dark px-2.5 py-1.5 text-[13px]" />
                <label className="text-[12px] text-right">Mot de passe :</label>
                <input type="password" required minLength={10} placeholder="10 caractères min." value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} className="border border-border-dark px-2.5 py-1.5 text-[13px]" />
                <label className="text-[12px] text-right">Rôle :</label>
                <select value={role} onChange={(e) => setRole(e.target.value as RoleUtilisateur)} className="border border-border-dark px-2.5 py-1.5 text-[12.5px]">
                  <option value="ADMIN_CABINET">Administrateur</option>
                  <option value="COMPTABLE">Comptable</option>
                  <option value="LECTURE_SEULE">Lecture seule</option>
                </select>
              </div>
              {erreurForm && <div className="text-[12px] text-danger bg-danger-soft border border-danger/30 px-2.5 py-1.5 mt-3">{erreurForm}</div>}
              <div className="flex justify-end gap-2 mt-4">
                <button type="button" onClick={() => setNouveauOuvert(false)} className="border border-border-dark bg-chrome hover:bg-chrome-alt px-4 py-1.5 text-[12px]">
                  Annuler
                </button>
                <button type="submit" disabled={envoi} className="bg-sel text-white px-4 py-1.5 text-[12px] font-semibold disabled:opacity-50">
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
