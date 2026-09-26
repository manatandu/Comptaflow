import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Aide } from './chrome/Aide';

/**
 * JOURNAUX AUTORISÉS (priorité 5, common/perimetre/extension-perimetre-journaux.ts
 * côté serveur) · l'administrateur coche les journaux où un utilisateur peut
 * SAISIR. La lecture n'est pas restreinte · une balance lue sur une partie des
 * journaux serait fausse. Le serveur refuse tout le reste, quel que soit
 * l'écran d'où part l'écriture.
 */
export function ModaleJournaux({
  utilisateurId,
  email,
  restreindre: restreindreInitial,
  journaux: journauxInitiaux,
  onFermer,
  onEnregistre,
}: {
  utilisateurId: string;
  email: string;
  restreindre: boolean;
  journaux: string[];
  onFermer: () => void;
  onEnregistre: () => void;
}) {
  const { estAdmin } = useAuth();
  const [catalogue, setCatalogue] = useState<{ id: string; code: string; intitule: string }[]>([]);
  const [restreindre, setRestreindre] = useState(restreindreInitial);
  const [cochees, setCochees] = useState<Set<string>>(new Set(journauxInitiaux));
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ id: string; code: string; intitule: string }[]>('/journaux').then(setCatalogue, (e) => setErreur(e.message));
  }, []);

  const enregistrer = async () => {
    setErreur(null);
    try {
      await api.put(`/utilisateurs/${utilisateurId}/journaux`, { restreindre, journaux: [...cochees] });
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
          <span className="font-bold">Journaux · {email}</span>
          <div className="flex items-center gap-2">
            <Aide
              titre="Journaux autorisés"
              texte="Restreint les journaux où l'utilisateur peut créer, modifier, valider ou supprimer une écriture, dans la limite de son rôle et de ses fonctions, quel que soit l'écran d'où part l'écriture (saisie, règlements, paie, immobilisations, imports). Il garde la consultation de tout le dossier : une balance ou un grand livre lus sur une partie des journaux seraient faux. Aucun journal coché : il consulte sans saisir. Un administrateur n'est jamais restreint. La restriction prend effet tout de suite, ses sessions sont fermées."
              source="Règle d'OmegaX (Sage X3 nomme des rôles qui filtrent les données, sans les décrire)"
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
            Restreindre la saisie aux journaux cochés
          </label>
          <div className={restreindre ? '' : 'opacity-50'}>
            {catalogue.map((f) => (
              <label key={f.id} className="flex items-center gap-1.5 py-[2px]">
                <input
                  type="checkbox"
                  disabled={!restreindre}
                  checked={cochees.has(f.id)}
                  onChange={() =>
                    setCochees((prev) => {
                      const n = new Set(prev);
                      if (n.has(f.id)) n.delete(f.id);
                      else n.add(f.id);
                      return n;
                    })
                  }
                />
                {f.code} · {f.intitule}
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
