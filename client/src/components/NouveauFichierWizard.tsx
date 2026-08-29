import { FormEvent, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { IconLogo, IconCheck } from '../components/chrome/icons';
import { Aide } from '../components/chrome/Aide';
import type { AuthResponse, JeuEtatsFinanciersSycebnl } from '../lib/types';

const ETAPES = [
  'Raison sociale',
  "Type d'entité",
  'Coordonnées',
  'Exercice',
  'Monnaie',
  'Reprise des éléments',
  'Connexion au dossier',
] as const;

/**
 * Écran « Type d'entité ». L'article 4 de l'Acte uniforme SYCEBNL ne prévoit
 * pas un jeu d'états financiers unique : le choix fait ici commande le bilan,
 * le compte de résultat ou d'exploitation, le tableau de flux et jusqu'au
 * nombre de notes annexes. Il ne peut donc pas rester implicite, ni être
 * deviné du nom de l'entité · c'est une question qu'on pose.
 *
 * Le Système Minimal de Trésorerie (art. 5 et 6, recettes annuelles jusqu'à
 * 30 M FCFA) est présenté mais désactivé : il n'est pas construit, et le
 * proposer comme s'il l'était produirait un dossier faux.
 */
const TYPES_ENTITE: {
  valeur: JeuEtatsFinanciersSycebnl | 'SYSTEME_MINIMAL_TRESORERIE';
  titre: string;
  description: string;
  disponible: boolean;
}[] = [
  {
    valeur: 'ASSOCIATIONS_ORDRES_PROFESSIONNELS',
    titre: 'Association, ordre professionnel, fondation',
    description:
      'Bilan, compte de résultat, tableau de flux de trésorerie et 35 notes annexes. Le cas le plus fréquent : ASBL, ONG, fondation, fonds de dotation, organisation religieuse, ordre professionnel.',
    disponible: true,
  },
  {
    valeur: 'PROJETS_DEVELOPPEMENT',
    titre: 'Projet de développement financé par un bailleur',
    description:
      "Bilan, compte d'exploitation, tableau emplois-ressources, tableau d'exécution budgétaire, tableau de réconciliation de trésorerie et 24 notes annexes. À retenir dès lors que l'entité doit rendre compte de l'emploi des fonds à un bailleur.",
    disponible: true,
  },
  {
    valeur: 'SYSTEME_MINIMAL_TRESORERIE',
    titre: 'Système Minimal de Trésorerie',
    description:
      "Régime allégé des entités dont les recettes annuelles ne dépassent pas 30 millions de FCFA : comptabilité de trésorerie, journal unique, cinq notes annexes.",
    disponible: false,
  },
];

interface Form {
  nomEntite: string;
  jeuEtatsFinanciersSycebnl: JeuEtatsFinanciersSycebnl;
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
    jeuEtatsFinanciersSycebnl: 'ASSOCIATIONS_ORDRES_PROFESSIONNELS',
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

const champ =
  'mt-1 w-full border border-border rounded-[6px] bg-surface px-2.5 py-1.5 text-[13px] font-normal focus:outline-none focus:ring-2 focus:ring-sel/25 focus:border-sel';

export function NouveauFichierWizard({ onClose, onTermine }: { onClose: () => void; onTermine?: () => void }) {
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
        jeuEtatsFinanciersSycebnl: form.jeuEtatsFinanciersSycebnl,
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
      // On connecte directement sur le dossier fraîchement créé · inutile de
      // faire ressaisir les identifiants qu'on vient de définir.
      await seConnecter(res.accessToken);
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible de créer le dossier');
    } finally {
      setEnvoi(false);
    }
  };

  const typeChoisi = TYPES_ENTITE.find((t) => t.valeur === form.jeuEtatsFinanciersSycebnl);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 anim-voile">
      <div className="w-full max-w-[700px] bg-surface border border-border rounded-[10px] overflow-hidden shadow-flottante anim-modale">
        <div
          className="h-[34px] flex items-center justify-between px-3 text-white text-[12px]"
          style={{ background: 'linear-gradient(180deg, var(--titlebar-from), var(--titlebar-to))' }}
        >
          <div className="flex items-center gap-2">
            <IconLogo width={14} height={14} />
            <span>Assistant de création de fichier comptable</span>
          </div>
          {!envoi && (
            <button onClick={onClose} className="text-white/85 hover:text-white text-[12px] leading-none px-1">
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
            <p className="text-[12.5px] text-text-dim max-w-[440px]">
              Le plan de comptes SYCEBNL et l'exercice {new Date(form.dateDebutExercice).getFullYear()} sont prêts.
              Les états financiers seront ceux {form.jeuEtatsFinanciersSycebnl === 'PROJETS_DEVELOPPEMENT'
                ? 'des projets de développement et assimilés'
                : 'des associations et ordres professionnels'}.
            </p>
            <button
              onClick={() => (onTermine ? onTermine() : onClose())}
              className="mt-2 bg-sel text-white text-[13px] font-semibold px-6 py-2 rounded-[6px] hover:brightness-110"
            >
              Ouvrir le dossier
            </button>
          </div>
        ) : (
          <div className="flex">
            <div
              className="w-[172px] flex-shrink-0 p-4"
              style={{ background: 'linear-gradient(180deg, var(--titlebar-from), var(--titlebar-to))' }}
            >
              <div className="text-[11.5px] font-bold text-white mb-4 leading-snug">Nouveau dossier</div>
              {ETAPES.map((label, i) => (
                <div key={label} className="flex items-center gap-2 py-1">
                  <span
                    className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0 ${
                      i < etape
                        ? 'bg-white text-[var(--titlebar-to)]'
                        : i === etape
                          ? 'border-2 border-white text-white'
                          : 'border border-white/40 text-white/50'
                    }`}
                  >
                    {i < etape ? '✓' : i + 1}
                  </span>
                  <span className={`text-[11px] ${i === etape ? 'text-white font-semibold' : 'text-white/60'}`}>
                    {label}
                  </span>
                </div>
              ))}
            </div>

            <form
              onSubmit={
                derniereEtape
                  ? onTerminer
                  : (e) => {
                      e.preventDefault();
                      suivant();
                    }
              }
              className="flex-1 flex flex-col min-w-0"
            >
              <div className="p-5 flex-1 min-h-[320px]">
                {etape === 0 && (
                  <>
                    <h2 className="text-[14px] font-bold mb-1">Raison sociale de l'entité</h2>
                    <p className="text-[12px] text-text-dim mb-4">
                      Association, ONG, fondation ou projet de développement · le référentiel SYCEBNL sera appliqué.
                    </p>
                    <label className="text-[11.5px] font-semibold text-text-dim block mb-1">Raison sociale</label>
                    <input
                      autoFocus
                      value={form.nomEntite}
                      onChange={(e) => majer('nomEntite', e.target.value)}
                      placeholder="Espoir pour Tous asbl"
                      className={champ}
                    />
                  </>
                )}

                {etape === 1 && (
                  <>
                    <h2 className="text-[14px] font-bold mb-1 flex items-center gap-1.5">
                      Type d'entité
                      <Aide sujet="jeuEtats" />
                    </h2>
                    <p className="text-[12px] text-text-dim mb-4">
                      Ce choix détermine le jeu d'états financiers du dossier. Il ne pourra plus être changé une fois
                      la première écriture saisie.
                    </p>
                    <div className="flex flex-col gap-2">
                      {TYPES_ENTITE.map((t) => {
                        const actif = t.disponible && form.jeuEtatsFinanciersSycebnl === t.valeur;
                        return (
                          <label
                            key={t.valeur}
                            className={`flex items-start gap-2.5 rounded-[8px] border p-3 transition-colors ${
                              !t.disponible
                                ? 'border-border bg-chrome-alt opacity-60 cursor-not-allowed'
                                : actif
                                  ? 'border-sel bg-sel-soft cursor-pointer'
                                  : 'border-border hover:border-sel/50 cursor-pointer'
                            }`}
                          >
                            <input
                              type="radio"
                              name="typeEntite"
                              className="mt-0.5"
                              disabled={!t.disponible}
                              checked={actif}
                              onChange={() =>
                                t.disponible &&
                                majer('jeuEtatsFinanciersSycebnl', t.valeur as JeuEtatsFinanciersSycebnl)
                              }
                            />
                            <span className="min-w-0">
                              <span className="block text-[13px] font-semibold flex items-center gap-1.5">
                                {t.titre}
                                {!t.disponible && (
                                  <>
                                    <span className="text-[10px] font-semibold text-warning">bientôt</span>
                                    <Aide sujet="smt" />
                                  </>
                                )}
                              </span>
                              <span className="block text-[11.5px] text-text-dim leading-[1.5] mt-0.5">
                                {t.description}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </>
                )}

                {etape === 2 && (
                  <>
                    <h2 className="text-[14px] font-bold mb-3">Coordonnées de l'entité</h2>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="text-[11.5px] font-semibold text-text-dim col-span-2">
                        Activité
                        <input value={form.activite} onChange={(e) => majer('activite', e.target.value)} className={champ} />
                      </label>
                      <label className="text-[11.5px] font-semibold text-text-dim col-span-2">
                        Adresse
                        <input value={form.adresse} onChange={(e) => majer('adresse', e.target.value)} className={champ} />
                      </label>
                      <label className="text-[11.5px] font-semibold text-text-dim">
                        Ville
                        <input value={form.ville} onChange={(e) => majer('ville', e.target.value)} className={champ} />
                      </label>
                      <label className="text-[11.5px] font-semibold text-text-dim">
                        Pays
                        <input value={form.pays} onChange={(e) => majer('pays', e.target.value)} className={champ} />
                      </label>
                      <label className="text-[11.5px] font-semibold text-text-dim col-span-2">
                        Téléphone
                        <input value={form.telephone} onChange={(e) => majer('telephone', e.target.value)} className={champ} />
                      </label>
                    </div>
                  </>
                )}

                {etape === 3 && (
                  <>
                    <h2 className="text-[14px] font-bold mb-1">Définition de l'exercice</h2>
                    <p className="text-[12px] text-text-dim mb-4">
                      Aucune modification ne sera possible après la création des écritures.
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="text-[11.5px] font-semibold text-text-dim">
                        Date de début
                        <input
                          type="date"
                          value={form.dateDebutExercice}
                          onChange={(e) => majer('dateDebutExercice', e.target.value)}
                          className={`${champ} font-mono`}
                        />
                      </label>
                      <label className="text-[11.5px] font-semibold text-text-dim">
                        Date de fin
                        <input
                          type="date"
                          value={form.dateFinExercice}
                          onChange={(e) => majer('dateFinExercice', e.target.value)}
                          className={`${champ} font-mono`}
                        />
                      </label>
                    </div>
                  </>
                )}

                {etape === 4 && (
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

                {etape === 5 && (
                  <>
                    <h2 className="text-[14px] font-bold mb-3">Reprise des éléments comptables</h2>
                    <div className="flex flex-col gap-2.5">
                      <label className="flex items-start gap-2 text-[13px]">
                        <input type="radio" checked readOnly className="mt-0.5" />
                        <span>
                          Oui, le dossier sera prêt à l'emploi : plan de comptes SYCEBNL standard et exercice généré
                          automatiquement
                          <span className="block text-[11px] text-text-dim">
                            (recommandé · c'est la seule option disponible pour l'instant)
                          </span>
                        </span>
                      </label>
                      <label className="flex items-start gap-2 text-[13px] text-text-dim opacity-60">
                        <input type="radio" disabled className="mt-0.5" />
                        <span>
                          Oui, mais avec une sélection partielle des données
                          <span className="inline-flex items-center gap-1 ml-2 text-[10px] font-semibold text-warning">
                            bientôt
                          </span>
                        </span>
                      </label>
                      <label className="flex items-start gap-2 text-[13px] text-text-dim opacity-60">
                        <input type="radio" disabled className="mt-0.5" />
                        <span>
                          Non, paramétrage manuel
                          <span className="inline-flex items-center gap-1 ml-2 text-[10px] font-semibold text-warning">
                            bientôt
                          </span>
                        </span>
                      </label>
                    </div>
                  </>
                )}

                {derniereEtape && (
                  <>
                    <h2 className="text-[14px] font-bold mb-1">Connexion au dossier</h2>
                    <p className="text-[12px] text-text-dim mb-4">
                      OmegaX est hébergé · pas de fichier local à nommer. Ces identifiants serviront à vous reconnecter
                      à « {form.nomEntite || 'ce dossier'} », tenu selon les états {typeChoisi?.titre.toLowerCase()}.
                    </p>
                    <label className="text-[11.5px] font-semibold text-text-dim block mb-3">
                      Adresse e-mail de l'administrateur
                      <input type="email" value={form.email} onChange={(e) => majer('email', e.target.value)} className={champ} />
                    </label>
                    <label className="text-[11.5px] font-semibold text-text-dim block">
                      Mot de passe (10 caractères minimum)
                      <input
                        type="password"
                        minLength={10}
                        value={form.motDePasse}
                        onChange={(e) => majer('motDePasse', e.target.value)}
                        className={champ}
                      />
                    </label>
                    {erreur && (
                      <div className="mt-3 text-[12px] text-danger bg-danger-soft border border-danger/30 rounded-[6px] px-2.5 py-1.5">
                        {erreur}
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-chrome">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={envoi}
                  className="px-4 py-1.5 border border-border rounded-[6px] bg-surface text-[12.5px] hover:bg-chrome-alt disabled:opacity-50"
                >
                  Annuler
                </button>
                {etape > 0 && (
                  <button
                    type="button"
                    onClick={precedent}
                    disabled={envoi}
                    className="px-4 py-1.5 border border-border rounded-[6px] bg-surface text-[12.5px] hover:bg-chrome-alt disabled:opacity-50"
                  >
                    &lt; Précédent
                  </button>
                )}
                <button
                  type="submit"
                  disabled={!peutAvancer || envoi}
                  className="px-5 py-1.5 bg-sel text-white text-[12.5px] font-semibold rounded-[6px] hover:brightness-110 disabled:opacity-50"
                >
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
