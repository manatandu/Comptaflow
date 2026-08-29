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
    <div className="p-2.5">
      <h1 className="text-[15px] font-bold mb-2.5">Utilisateurs du dossier</h1>

      <form onSubmit={onCreer} className="bg-surface border border-border p-4 mb-4 max-w-[560px]">
        <div className="font-mono text-[11px] font-semibold text-text-dim mb-3">AJOUTER UN UTILISATEUR</div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <label className="text-[11.5px] font-semibold text-text-dim col-span-2">
            Adresse e-mail
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[13px] font-normal" />
          </label>
          <label className="text-[11.5px] font-semibold text-text-dim">
            Mot de passe (10 car. min.)
            <input type="password" required minLength={10} value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[13px] font-normal" />
          </label>
          <label className="text-[11.5px] font-semibold text-text-dim">
            Rôle
            <select value={role} onChange={(e) => setRole(e.target.value as RoleUtilisateur)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[13px] font-normal">
              <option value="ADMIN_CABINET">Administrateur</option>
              <option value="COMPTABLE">Comptable</option>
              <option value="LECTURE_SEULE">Lecture seule</option>
            </select>
          </label>
        </div>
        {erreurForm && <div className="text-[12px] text-danger bg-danger-soft border border-danger/30 px-2.5 py-1.5 mb-3">{erreurForm}</div>}
        <button type="submit" disabled={envoi} className="bg-sel text-white text-[12.5px] font-semibold px-4 py-1.5 disabled:opacity-50">
          {envoi ? 'Création…' : 'Ajouter'}
        </button>
      </form>

      {erreurChargement && <div className="text-[12px] text-danger bg-danger-soft border border-danger/30 px-2.5 py-1.5 mb-3 max-w-[560px]">{erreurChargement}</div>}

      <div className="border border-border max-w-[720px]">
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
        {LIBELLE_ROLE.ADMIN_CABINET} : accès complet, y compris cette page. {LIBELLE_ROLE.COMPTABLE} : saisie et
        consultation. {LIBELLE_ROLE.LECTURE_SEULE} : consultation uniquement.
      </p>
    </div>
  );
}
