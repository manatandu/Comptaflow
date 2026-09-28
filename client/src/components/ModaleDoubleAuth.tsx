import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError, setCsrf } from '../lib/api';
import { cleLisible } from '../lib/double-auth';
import { PortailModale } from './PortailModale';
import { Aide } from './chrome/Aide';

interface Etat {
  active: boolean;
  depuis: string | null;
  codesSecoursRestants: number;
  exigeePourLaConsole: boolean;
}


/**
 * LA DOUBLE AUTHENTIFICATION DE SON PROPRE COMPTE (AuthService). Activer
 * ferme les autres sessions et en repose une · le jeton CSRF change, comme au
 * changement de mot de passe. Les codes de secours ne s'affichent qu'UNE fois.
 *
 * LE MOT DE PASSE ACTUEL EST DEMANDÉ À L'ACTIVATION ET AU RENOUVELLEMENT DES
 * CODES, comme au retrait (ActiverDoubleAuthDto, RegenererCodesSecoursDto) ·
 * une session ouverte depuis trente jours ne prouve pas qui la tient. Deux
 * champs distincts pour le renouvellement et le retrait, affichés ensemble ·
 * un seul champ partagé enverrait à l'un ce qui a été tapé pour l'autre.
 */
export function ModaleDoubleAuth({ onFermer }: { onFermer: () => void }) {
  const [etat, setEtat] = useState<Etat | null>(null);
  const [cle, setCle] = useState<{ secret: string; uri: string } | null>(null);
  const [code, setCode] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [motDePasseCodes, setMotDePasseCodes] = useState('');
  const [codeRetrait, setCodeRetrait] = useState('');
  const [codesSecours, setCodesSecours] = useState<string[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const charger = () => api.get<Etat>('/auth/double-authentification').then(setEtat).catch(() => setErreur('État illisible.'));
  useEffect(() => {
    void charger();
  }, []);

  const agir = async (action: () => Promise<void>) => {
    setErreur(null);
    setEnvoi(true);
    try {
      await action();
      setCode('');
      setCodeRetrait('');
      setMotDePasse('');
      setMotDePasseCodes('');
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'L’opération a échoué.');
    } finally {
      setEnvoi(false);
    }
  };

  const commencer = () => agir(async () => setCle(await api.post<{ secret: string; uri: string }>('/auth/double-authentification/initier', {})));

  const activer = (e: FormEvent) => {
    e.preventDefault();
    void agir(async () => {
      const r = await api.post<{ codesSecours: string[]; csrfToken: string }>('/auth/double-authentification/activer', { motDePasseActuel: motDePasse, code });
      setCsrf(r.csrfToken);
      setCle(null);
      setCodesSecours(r.codesSecours);
    });
  };

  const renouveler = (e: FormEvent) => {
    e.preventDefault();
    void agir(async () => {
      const r = await api.post<{ codesSecours: string[] }>('/auth/double-authentification/codes-secours', { motDePasseActuel: motDePasseCodes, code });
      setCodesSecours(r.codesSecours);
    });
  };

  const retirer = (e: FormEvent) => {
    e.preventDefault();
    void agir(async () => {
      const r = await api.post<{ csrfToken: string }>('/auth/double-authentification/desactiver', { motDePasseActuel: motDePasse, code: codeRetrait });
      setCsrf(r.csrfToken);
      setCodesSecours(null);
    });
  };

  const champ = 'border border-border px-2 py-[3px]';
  return (
    <PortailModale>
      <div className="fixed inset-0 z-50 bg-black/35 flex items-center justify-center p-4" onClick={onFermer}>
        <div
          className="anim-modale w-[460px] max-h-full overflow-auto rounded-[4px] bg-surface border border-border-dark shadow-dominante text-[11.5px]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-3.5 h-[32px] border-b border-border">
            <span className="flex items-center gap-1.5 font-bold">
              Double authentification
              <Aide
                titre="Double authentification"
                texte="Activer, renouveler les codes de secours ou retirer la double authentification demande le mot de passe actuel en plus du code : une session restée ouverte ne suffit pas. Chacun de ces changements vous est annoncé par courriel, à votre adresse de connexion ; si vous n'en êtes pas l'auteur, changez votre mot de passe et prévenez l'administrateur du dossier."
                source="OWASP ASVS 5.0, exigence 7.5.1 · NIST SP 800-63B-4, cycle de vie des authentificateurs."
              />
            </span>
            <button type="button" onClick={onFermer} aria-label="Fermer">
              ✕
            </button>
          </div>
          <div className="p-3 space-y-2">
            {erreur && <div className="text-danger bg-danger-soft border border-danger/30 px-3 py-2">{erreur}</div>}
  
            {codesSecours && (
              <div className="border border-warning/40 bg-warning-soft px-3 py-2 space-y-1">
                <div className="font-semibold">Codes de secours · notez-les maintenant, ils ne s’afficheront plus.</div>
                <div>Chacun remplace une fois le code du téléphone, si celui-ci est perdu.</div>
                <ul className="grid grid-cols-2 gap-x-4 font-mono">
                  {codesSecours.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </div>
            )}
  
            {etat && !etat.active && !cle && (
              <>
                <div>{etat.exigeePourLaConsole ? 'Non active · la console des cabinets l’exige.' : 'Non active.'}</div>
                <div className="flex justify-end">
                  <button type="button" onClick={commencer} disabled={envoi} className="bg-sel text-white font-semibold px-4 py-1.5 disabled:opacity-40">
                    Activer
                  </button>
                </div>
              </>
            )}
  
            {cle && (
              <form onSubmit={activer} className="space-y-2">
                <div>Dans l’application d’authentification du téléphone, ajoutez un compte avec cette clé :</div>
                <div className="font-mono text-[13px] tracking-wide select-all break-all">{cleLisible(cle.secret)}</div>
                <a href={cle.uri} className="text-sel underline">
                  Ouvrir dans l’application (sur le téléphone)
                </a>
                <label className="flex flex-col gap-0.5">
                  <span className="text-text-dim">Mot de passe actuel</span>
                  <input type="password" autoComplete="current-password" required value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} className={champ} />
                </label>
                <label className="flex flex-col gap-0.5">
                  <span className="text-text-dim">Code affiché par l’application</span>
                  <input inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value)} className={champ} />
                </label>
                <div className="flex justify-end">
                  <button type="submit" disabled={envoi} className="bg-sel text-white font-semibold px-4 py-1.5 disabled:opacity-40">
                    Confirmer
                  </button>
                </div>
              </form>
            )}
  
            {etat?.active && (
              <>
                <div>
                  Active depuis le {etat.depuis ? new Date(etat.depuis).toLocaleDateString('fr-FR') : '·'} · {etat.codesSecoursRestants} code(s) de secours restant(s).
                </div>
                <form onSubmit={renouveler} className="flex items-end gap-2">
                  <label className="flex flex-col gap-0.5 flex-1">
                    <span className="text-text-dim">Mot de passe actuel</span>
                    <input type="password" autoComplete="current-password" required value={motDePasseCodes} onChange={(e) => setMotDePasseCodes(e.target.value)} className={champ} />
                  </label>
                  <label className="flex flex-col gap-0.5 w-[110px]">
                    <span className="text-text-dim">Code</span>
                    <input required value={code} onChange={(e) => setCode(e.target.value)} className={champ} />
                  </label>
                  <button type="submit" disabled={envoi} className="border border-border-dark px-3 py-1 disabled:opacity-40">
                    Nouveaux codes de secours
                  </button>
                </form>
                <form onSubmit={retirer} className="flex items-end gap-2 border-t border-border pt-2">
                  <label className="flex flex-col gap-0.5 flex-1">
                    <span className="text-text-dim">Mot de passe actuel</span>
                    <input type="password" required value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} className={champ} />
                  </label>
                  <label className="flex flex-col gap-0.5 w-[110px]">
                    <span className="text-text-dim">Code</span>
                    <input required value={codeRetrait} onChange={(e) => setCodeRetrait(e.target.value)} className={champ} />
                  </label>
                  <button type="submit" disabled={envoi} className="text-danger border border-danger/40 px-3 py-1 disabled:opacity-40">
                    Retirer
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </PortailModale>
  );
}
