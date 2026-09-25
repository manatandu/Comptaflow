import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Aide } from './chrome/Aide';

/**
 * PROFIL DE FONCTIONS (point 15, common/fonctions/fonctions-metier.ts côté
 * serveur) · l'administrateur coche ce qu'un utilisateur peut ÉCRIRE, dans
 * la limite de son rôle. Le serveur refuse le reste ; il refuse aussi de
 * restreindre un administrateur.
 */
export function ModaleFonctions({
  utilisateurId,
  email,
  restreindre: restreindreInitial,
  fonctions: fonctionsInitiales,
  onFermer,
  onEnregistre,
}: {
  utilisateurId: string;
  email: string;
  restreindre: boolean;
  fonctions: string[];
  onFermer: () => void;
  onEnregistre: () => void;
}) {
  const { estAdmin } = useAuth();
  const [catalogue, setCatalogue] = useState<{ code: string; libelle: string }[]>([]);
  const [restreindre, setRestreindre] = useState(restreindreInitial);
  const [cochees, setCochees] = useState<Set<string>>(new Set(fonctionsInitiales));
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ code: string; libelle: string }[]>('/utilisateurs/fonctions').then(setCatalogue, (e) => setErreur(e.message));
  }, []);

  const enregistrer = async () => {
    setErreur(null);
    try {
      await api.put(`/utilisateurs/${utilisateurId}/fonctions`, { restreindre, fonctions: [...cochees] });
      onEnregistre();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Enregistrement impossible');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/35 flex items-center justify-center p-4" onClick={onFermer}>
      <div
        className="anim-modale w-[520px] max-h-full overflow-auto rounded-[4px] bg-surface border border-border-dark shadow-dominante text-[11.5px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-3.5 h-[32px] border-b border-border">
          <span className="font-bold">Fonctions · {email}</span>
          <div className="flex items-center gap-2">
            <Aide
              titre="Profil de fonctions"
              texte="Restreint ce que l'utilisateur peut enregistrer, fonction par fonction, dans la limite de son rôle : cocher une fonction ne lui donne jamais plus que son rôle. Il garde la consultation. Un administrateur n'est jamais restreint. La restriction prend effet tout de suite, ses sessions sont fermées."
              source="Sage (profils de fonctions)"
            />
            <button onClick={onFermer} aria-label="Fermer">
              ✕
            </button>
          </div>
        </div>
        <div className="p-3 space-y-2">
          {erreur && <div className="text-danger bg-danger-soft border border-danger/30 px-3 py-2">{erreur}</div>}
          <label className="flex items-center gap-1.5 font-semibold">
            <input type="checkbox" checked={restreindre} onChange={(e) => setRestreindre(e.target.checked)} />
            Restreindre aux fonctions cochées
          </label>
          <div className={restreindre ? '' : 'opacity-50'}>
            {catalogue.map((f) => (
              <label key={f.code} className="flex items-center gap-1.5 py-[2px]">
                <input
                  type="checkbox"
                  disabled={!restreindre}
                  checked={cochees.has(f.code)}
                  onChange={() =>
                    setCochees((prev) => {
                      const n = new Set(prev);
                      if (n.has(f.code)) n.delete(f.code);
                      else n.add(f.code);
                      return n;
                    })
                  }
                />
                {f.libelle}
              </label>
            ))}
          </div>
          <div className="flex justify-end">
            <button onClick={enregistrer} disabled={!estAdmin} className="bg-sel text-white font-semibold px-4 py-1.5 disabled:opacity-40">
              Enregistrer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
