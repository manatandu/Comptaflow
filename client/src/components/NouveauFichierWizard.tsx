import { FormEvent, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { IconLogo, IconCheck } from '../components/chrome/icons';
import type { AuthResponse } from '../lib/types';

const ETAPES = [
  'Raison sociale',
  'Coordonnées',
  'Exercice',
  'Monnaie',
  'Reprise des éléments',
  'Connexion au dossier',
] as const;

interface Form {
  nomEntite: string;
  activite: string;
  adresse: string;
  ville: string;
  pays: string;
  telephone: string;
  dateDebutExercice: string;
  dateFinExercice: string;
  devise: 'CDF' | 'USD' | 'Autre';
  email: string;
  motDePasse: string;
}

const anneeCourante = new Date().getFullYear();

function formInitial(): Form {
  return {
    nomEntite: '',
    activite: '',
    adresse: '',
    ville: '',
    pays: 'RD Congo',
    telephone: '',
    dateDebutExercice: `${anneeCourante}-01-01`,
    dateFinExercice: `${anneeCourante}-12-31`,
    devise: 'CDF',
    email: '',
    motDePasse: '',
  };
}

export function NouveauFichierWizard({ onClose }: { onClose: () => void }) {
  const [etape, setEtape] = useState(0);
  const [form, setForm] = useState<Form>(formInitial());
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [succes, setSucces] = useState(false);
  const { seConnecter } = useAuth();

  const majer = <K extends keyof Form>(cle: K, valeur: Form[K]) => setForm((f) => ({ ...f, [cle]: valeur }));

  const derniereEtape = etape === ETAPES.length - 1;
  const peutAvancer =
    (etape === 0 && form.nomEntite.trim().length > 0) ||
    (etape > 0 && !derniereEtape) ||
    (derniereEtape && form.email.trim().length > 0 && form.motDePasse.length >= 10);

  const suivant = () => {
    setErreur(null);
    if (!derniereEtape) setEtape((e) => e + 1);
  };
  const precedent = () => setEtape((e) => Math.max(0, e - 1));

  const onTerminer = async (e: FormEvent) => {
    e.preventDefault();
    setErreur(null);
    setEnvoi(true);
    try {
      const res = await api.post<AuthResponse>('/auth/register', {
        nomEntite: form.nomEntite,
        referentiel: 'SYCEBNL',
        email: form.email,
        motDePasse: form.motDePasse,
        activite: form.activite || undefined,
        adresse: form.adresse || undefined,
        ville: form.ville || undefined,
        pays: form.pays || undefined,
        telephone: form.telephone || undefined,
        devise: form.devise,
        dateDebutExercice: form.dateDebutExercice,
        dateFinExercice: form.dateFinExercice,
      });
      setSucces(true);
      // On connecte directement sur le dossier fraîchement créé — inutile de
      // faire ressaisir les identifiants qu'on vient de définir.
      await seConnecter(res.accessToken);
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible de créer le dossier');
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="w-full max-w-[660px] bg-surface border-2 border-border-dark shadow-[5px_5px_0_rgba(0,0,0,0.2)]">
        <div
          className="h-[26px] flex items-center justify-between px-2 text-white text-[11.5px]"
          style={{ background: 'linear-gradient(180deg, var(--titlebar-from), var(--titlebar-to))' }}
        >
          <div className="flex items-center gap-2">
            <IconLogo width={13} height={13} />
            <span>Assistant de création de fichier comptable</span>
          </div>
          {!envoi && (
            <button onClick={onClose} className="text-white/85 hover:text-white text-[11px] leading-none px-1">
              ✕
            </button>
          )}
        </div>

        {succes ? (
          <div className="p-8 flex flex-col items-center text-center gap-3">
            <div className="w-12 h-12 rounded-full bg-positive-soft flex items-center justify-center">
              <IconCheck width={22} height={22} className="text-positive" />
            </div>
            <h2 className="text-[15px] font-bold">Dossier « {form.nomEntite} » créé</h2>
            <p className="text-[12.5px] text-text-dim max-w-[420px]">
              Le plan de comptes SYCEBNL et l'exercice {new Date(form.dateDebutExercice).getFullYear()} sont prêts.
              Vous êtes maintenant connecté sur ce nouveau dossier.
            </p>
            <button onClick={onClose} className="mt-2 bg-sel text-white text-[13px] font-semibold px-6 py-2">
              Ouvrir le dossier
            </button>
          </div>
        ) : (
          <div className="flex">
            <div
              className="w-[160px] flex-shrink-0 p-4"
              style={{ background: 'linear-gradient(180deg, var(--titlebar-from), var(--titlebar-to))' }}
            >
              <div className="text-[11.5px] font-bold text-white mb-4 leading-snug">Nouveau dossier</div>
              {ETAPES.map((label, i) => (
                <div key={label} className="flex items-center gap-2 py-1">
                  <span
                    className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0 ${
                      i < etape ? 'bg-white text-[var(--titlebar-to)]' : i === etape ? 'border-2 border-white text-white' : 'border border-white/40 text-white/50'
                    }`}
                  >
                    {i < etape ? '✓' : i + 1}
                  </span>
                  <span className={`text-[11px] ${i === etape ? 'text-white font-semibold' : 'text-white/60'}`}>{label}</span>
                </div>
              ))}
            </div>

            <form
              onSubmit={derniereEtape ? onTerminer : (e) => { e.preventDefault(); suivant(); }}
              className="flex-1 flex flex-col min-w-0"
            >
              <div className="p-5 flex-1 min-h-[280px]">
                {etape === 0 && (
                  <>
                    <h2 className="text-[14px] font-bold mb-1">Raison sociale de l'entité</h2>
                    <p className="text-[12px] text-text-dim mb-4">
                      Association, ONG, fondation ou projet de développement — le référentiel SYCEBNL sera appliqué.
                    </p>
                    <label className="text-[11.5px] font-semibold text-text-dim block mb-1">Raison sociale</label>
                    <input
                      autoFocus
                      value={form.nomEntite}
                      onChange={(e) => majer('nomEntite', e.target.value)}
                      placeholder="Espoir pour Tous asbl"
                      className="w-full border border-border-dark px-2.5 py-1.5 text-[13px]"
                    />
                  </>
                )}

                {etape === 1 && (
                  <>
                    <h2 className="text-[14px] font-bold mb-3">Coordonnées de l'entité</h2>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="text-[11.5px] font-semibold text-text-dim col-span-2">
                        Activité
                        <input value={form.activite} onChange={(e) => majer('activite', e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[13px] font-normal" />
                      </label>
                      <label className="text-[11.5px] font-semibold text-text-dim col-span-2">
                        Adresse
                        <input value={form.adresse} onChange={(e) => majer('adresse', e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[13px] font-normal" />
                      </label>
                      <label className="text-[11.5px] font-semibold text-text-dim">
                        Ville
                        <input value={form.ville} onChange={(e) => majer('ville', e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[13px] font-normal" />
                      </label>
                      <label className="text-[11.5px] font-semibold text-text-dim">
                        Pays
                        <input value={form.pays} onChange={(e) => majer('pays', e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[13px] font-normal" />
                      </label>
                      <label className="text-[11.5px] font-semibold text-text-dim col-span-2">
                        Téléphone
                        <input value={form.telephone} onChange={(e) => majer('telephone', e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[13px] font-normal" />
                      </label>
                    </div>
                  </>
                )}

                {etape === 2 && (
                  <>
                    <h2 className="text-[14px] font-bold mb-1">Définition de l'exercice</h2>
                    <p className="text-[12px] text-text-dim mb-4">Aucune modification ne sera possible après la création des écritures.</p>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="text-[11.5px] font-semibold text-text-dim">
                        Date de début
                        <input type="date" value={form.dateDebutExercice} onChange={(e) => majer('dateDebutExercice', e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[13px] font-mono font-normal" />
                      </label>
                      <label className="text-[11.5px] font-semibold text-text-dim">
                        Date de fin
                        <input type="date" value={form.dateFinExercice} onChange={(e) => majer('dateFinExercice', e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[13px] font-mono font-normal" />
                      </label>
                    </div>
                  </>
                )}

                {etape === 3 && (
                  <>
                    <h2 className="text-[14px] font-bold mb-3">Monnaie de tenue de compte</h2>
                    <div className="flex flex-col gap-2">
                      {(['CDF', 'USD', 'Autre'] as const).map((d) => (
                        <label key={d} className="flex items-center gap-2 text-[13px]">
                          <input type="radio" name="devise" checked={form.devise === d} onChange={() => majer('devise', d)} />
                          {d === 'CDF' ? 'Franc congolais (CDF)' : d === 'USD' ? 'Dollar américain (USD)' : 'Autre'}
                        </label>
                      ))}
                    </div>
                  </>
                )}

                {etape === 4 && (
                  <>
                    <h2 className="text-[14px] font-bold mb-3">Reprise des éléments comptables</h2>
                    <div className="flex flex-col gap-2.5">
                      <label className="flex items-start gap-2 text-[13px]">
                        <input type="radio" checked readOnly className="mt-0.5" />
                        <span>
                          Oui, le dossier sera prêt à l'emploi : plan de comptes SYCEBNL standard et exercice généré automatiquement
                          <span className="block text-[11px] text-text-dim">(recommandé — c'est la seule option disponible pour l'instant)</span>
                        </span>
                      </label>
                      <label className="flex items-start gap-2 text-[13px] text-text-dim opacity-60">
                        <input type="radio" disabled className="mt-0.5" />
                        <span>
                          Oui, mais avec une sélection partielle des données
                          <span className="inline-flex items-center gap-1 ml-2 text-[10px] font-semibold text-warning">bientôt</span>
                        </span>
                      </label>
                      <label className="flex items-start gap-2 text-[13px] text-text-dim opacity-60">
                        <input type="radio" disabled className="mt-0.5" />
                        <span>
                          Non, paramétrage manuel
                          <span className="inline-flex items-center gap-1 ml-2 text-[10px] font-semibold text-warning">bientôt</span>
                        </span>
                      </label>
                    </div>
                  </>
                )}

                {derniereEtape && (
                  <>
                    <h2 className="text-[14px] font-bold mb-1">Connexion au dossier</h2>
                    <p className="text-[12px] text-text-dim mb-4">
                      OmegaX est hébergé — pas de fichier local à nommer. Ces identifiants serviront à vous
                      reconnecter à « {form.nomEntite || 'ce dossier'} ».
                    </p>
                    <label className="text-[11.5px] font-semibold text-text-dim block mb-3">
                      Adresse e-mail de l'administrateur
                      <input type="email" value={form.email} onChange={(e) => majer('email', e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[13px] font-normal" />
                    </label>
                    <label className="text-[11.5px] font-semibold text-text-dim block">
                      Mot de passe (10 caractères minimum)
                      <input type="password" minLength={10} value={form.motDePasse} onChange={(e) => majer('motDePasse', e.target.value)} className="mt-1 w-full border border-border-dark px-2.5 py-1.5 text-[13px] font-normal" />
                    </label>
                    {erreur && <div className="mt-3 text-[12px] text-danger bg-danger-soft border border-danger/30 px-2.5 py-1.5">{erreur}</div>}
                  </>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-chrome">
                <button type="button" onClick={onClose} disabled={envoi} className="px-4 py-1.5 border border-border-dark bg-surface text-[12.5px] disabled:opacity-50">
                  Annuler
                </button>
                {etape > 0 && (
                  <button type="button" onClick={precedent} disabled={envoi} className="px-4 py-1.5 border border-border-dark bg-surface text-[12.5px] disabled:opacity-50">
                    &lt; Précédent
                  </button>
                )}
                <button type="submit" disabled={!peutAvancer || envoi} className="px-5 py-1.5 bg-sel text-white text-[12.5px] font-semibold disabled:opacity-50">
                  {envoi ? 'Création…' : derniereEtape ? 'Terminer' : 'Suivant >'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
