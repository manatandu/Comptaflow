import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { MODULES, type ModuleOptionnel } from '../lib/profil-dossier';
import { etapesDemarrage, type EtatDemarrage } from '../lib/demarrage-guide';
import { PortailModale } from './PortailModale';
import { Aide } from './chrome/Aide';

/**
 * ASSISTANT DE DÉMARRAGE · voir `lib/demarrage-guide.ts`. Chaque étape ouvre
 * la fenêtre ordinaire qui la fait ; les modules se choisissent ici par la
 * même route que Paramètres (`PATCH /dossier/modules`).
 */
export function DemarrageGuide({ etat, onFermer, onPasser }: { etat: EtatDemarrage; onFermer: () => void; onPasser: () => void }) {
  const navigate = useNavigate();
  const { estAdmin, rafraichir } = useAuth();
  const [modules, setModules] = useState<ModuleOptionnel[]>(etat.modulesActives);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  useEffect(() => setModules(etat.modulesActives), [etat.modulesActives]);

  const basculer = async (cle: ModuleOptionnel, actif: boolean) => {
    const suivants = actif ? [...modules, cle] : modules.filter((m) => m !== cle);
    setEnvoi(true);
    setErreur(null);
    try {
      const p = await api.patch<{ modulesActives: ModuleOptionnel[] }>('/dossier/modules', { modulesActives: [...new Set(suivants)] });
      setModules(p.modulesActives);
      await rafraichir();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Modification impossible');
    } finally {
      setEnvoi(false);
    }
  };

  const etapes = etapesDemarrage({ ...etat, modulesActives: modules });
  const faites = etapes.filter((e) => e.faite === true).length;
  const aFaire = etapes.filter((e) => e.faite !== null).length;

  return (
    <PortailModale>
      <div className="fixed inset-0 z-50 bg-black/35 flex items-center justify-center p-4" onClick={onFermer}>
        <div
          className="anim-modale w-[520px] modale-bornee max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-[4px] bg-surface border border-border-dark shadow-dominante text-[11.5px]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-3.5 h-[32px] border-b border-border">
            <span className="flex items-center gap-1.5 font-bold">
              Démarrage du dossier
              <Aide
                titre="Démarrage du dossier"
                texte="Les étapes dans l’ordre du travail. L’état de chacune se lit dans le dossier : une étape faite depuis une autre fenêtre compte aussi. L’assistant se rouvre depuis l’accueil tant qu’une étape reste à faire."
                source="Organisation d’OmegaX · aucun texte ne la régit"
              />
            </span>
            <button onClick={onFermer} aria-label="Fermer" className="text-text-dim hover:text-text text-[12px] leading-none px-1">
              ✕
            </button>
          </div>
          <div className="p-3.5">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex-1 h-[6px] bg-surface-alt rounded-full overflow-hidden" aria-hidden>
                <div className="h-full bg-sel transition-[width] duration-300" style={{ width: `${(faites / aFaire) * 100}%` }} />
              </div>
              <span className="text-text-dim">
                {faites} sur {aFaire}
              </span>
            </div>
            <ol className="anim-cascade space-y-1.5">
              {etapes.map((e, i) => (
                <li key={e.cle} className="flex items-start gap-2.5 border border-border rounded-[3px] px-2.5 py-2">
                  <span
                    className={`shrink-0 w-[20px] h-[20px] rounded-full flex items-center justify-center text-[10.5px] font-bold ${
                      e.faite ? 'bg-sel text-white' : 'border border-border-dark text-text-dim'
                    }`}
                  >
                    {e.faite ? '✓' : i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold">{e.titre}</div>
                    {e.cle === 'modules' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-0.5 mt-1">
                        {MODULES.map((m) => (
                          <label key={m.cle} className="flex items-center gap-1.5">
                            <input
                              type="checkbox"
                              checked={modules.includes(m.cle)}
                              disabled={!estAdmin || envoi}
                              onChange={(ev) => basculer(m.cle, ev.target.checked)}
                            />
                            {m.libelle}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                  {e.chemin && (
                    <button
                      type="button"
                      onClick={() => {
                        onFermer();
                        navigate(e.chemin!);
                      }}
                      className={`shrink-0 px-2.5 py-[3px] rounded-full text-[11px] ${
                        e.faite ? 'border border-border text-text-dim hover:text-text' : 'bg-sel text-white'
                      }`}
                    >
                      {e.faite ? 'Revoir' : e.action}
                    </button>
                  )}
                </li>
              ))}
            </ol>
            {erreur && <p className="text-danger mt-2">{erreur}</p>}
            <div className="flex justify-end gap-2 mt-3">
              <button type="button" onClick={onPasser} className="px-2.5 py-[3px] border border-border-dark">
                Passer pour le moment
              </button>
            </div>
          </div>
        </div>
      </div>
    </PortailModale>
  );
}
