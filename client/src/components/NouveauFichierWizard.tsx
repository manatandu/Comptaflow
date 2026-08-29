import { FormEvent, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { IconLogo, IconCheck } from '../components/chrome/icons';
import { Aide } from '../components/chrome/Aide';
import type { AuthResponse, JeuEtatsFinanciersSycebnl, Referentiel } from '../lib/types';

const ETAPES = [
  'Référentiel',
  'Raison sociale',
  'Coordonnées',
  'Exercice',
  'Monnaie',
  'Reprise des éléments',
  'Connexion au dossier',
] as const;

/**
 * PREMIER écran de l'assistant · le référentiel comptable, puis, pour le
 * SYCEBNL, le jeu d'états financiers.
 *
 * ## Pourquoi ce choix est ici, et pas ailleurs
 *
 * Sage 100 ne le demande PAS à la création : son assistant enchaîne raison
 * sociale, coordonnées, dates du premier exercice et longueur des comptes,
 * puis emplacement du fichier ; c'est ensuite, dans Fichier > Paramètres
 * société, que l'utilisateur « met à jour le système comptable utilisé
 * c'est-à-dire le SYSCOHADA » et rectifie les natures de compte (manuel Sage
 * i7 d'une ONG, Drive/Sage). Sage peut se le permettre : son plan de comptes
 * vient d'un « modèle standard » que l'on retouche après coup.
 *
 * OmegaX ne le peut pas : le plan de comptes est SEMÉ à la création du
 * dossier, et le plan SYCEBNL n'est pas le plan SYSCOHADA. Demander le
 * référentiel après coup obligerait à re-semer un plan sur un dossier déjà
 * ouvert. Le choix est donc posé d'entrée, et il reste modifiable dans
 * Structure > Paramètres du dossier TANT QUE le dossier ne porte aucune
 * écriture · c'est la place que Sage lui donne, avec le garde-fou que sa
 * propre architecture ne lui impose pas.
 */
const REFERENTIELS: {
  valeur: Referentiel;
  titre: string;
  sousTitre: string;
  description: string;
  disponible: boolean;
}[] = [
  {
    valeur: 'SYCEBNL',
    titre: 'SYCEBNL',
    sousTitre: 'Entités à but non lucratif',
    description:
      "Acte uniforme adopté à Niamey le 22 décembre 2022, applicable depuis le 1er janvier 2024. Plan de comptes et états financiers propres aux associations, ONG, fondations, organisations religieuses, ordres professionnels et projets de développement.",
    disponible: true,
  },
  {
    valeur: 'SYSCOHADA',
    titre: 'SYSCOHADA révisé',
    sousTitre: 'Entreprises · droit comptable OHADA',
    description:
      "Référentiel de droit commun des entités à but lucratif (AUDCIF). Son plan de comptes et ses états financiers ne sont pas encore construits dans OmegaX : le proposer aujourd'hui produirait un dossier d'entreprise tenu avec la nomenclature d'une association.",
    disponible: false,
  },
];

/**
 * Les TROIS jeux d'états financiers du SYCEBNL (art. 4 pour les deux
 * premiers, art. 5 et 6 pour le troisième). Le choix fait ici commande le
 * bilan, le compte de résultat ou d'exploitation, le tableau de flux et
 * jusqu'au nombre de notes annexes : il ne peut ni rester implicite, ni être
 * deviné du nom de l'entité.
 *
 * Le Système Minimal de Trésorerie n'est pas une préférence de présentation :
 * l'article 5 pose que « toute entité est, sauf exception liée à sa taille,
 * soumise au Système normal », et l'article 6 plafonne chacune des cinq
 * catégories de ressources à 30 000 000 FCFA. L'écran le dit au lieu de
 * laisser croire à trois options équivalentes.
 */
const TYPES_ENTITE: {
  valeur: JeuEtatsFinanciersSycebnl;
  titre: string;
  description: string;
  disponible: boolean;
}[] = [
  {
    valeur: 'ASSOCIATIONS_ORDRES_PROFESSIONNELS',
    titre: 'Système normal · association, ordre professionnel, fondation',
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
    titre: 'Système minimal de trésorerie · petite ASBL',
    description:
      "Régime allégé RÉSERVÉ aux entités dont chacune des cinq catégories de ressources annuelles (subventions, cotisations, dons et legs, ressources de projet, autres) reste sous 30 000 000 FCFA : bilan à cinq lignes, compte de résultat de caisse, journal unique de trésorerie et cinq notes annexes. Au-delà d'un seul de ces seuils, l'entité relève du Système normal.",
    disponible: true,
  },
];

interface Form {
  referentiel: Referentiel;
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

/** Comment le jeu se nomme dans une phrase · écran de succès, dernier écran. */
const LIBELLE_JEU: Record<JeuEtatsFinanciersSycebnl, string> = {
  ASSOCIATIONS_ORDRES_PROFESSIONNELS: 'des associations et ordres professionnels',
  PROJETS_DEVELOPPEMENT: 'des projets de développement et assimilés',
  SYSTEME_MINIMAL_TRESORERIE: 'du Système minimal de trésorerie',
};

const anneeCourante = new Date().getFullYear();

function formInitial(): Form {
  return {
    referentiel: 'SYCEBNL',
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
    // L'écran 0 (référentiel) a toujours une valeur sélectionnée : rien à
    // valider. L'écran 1 exige la raison sociale.
    etape === 0 ||
    (etape === 1 && form.nomEntite.trim().length > 0) ||
    (etape > 1 && !derniereEtape) ||
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
        referentiel: form.referentiel,
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
      // faire ressaisir les identifiants qu'on vient de définir. C'est
      // `seConnecter` qui inscrit le dossier dans les dossiers récents de cet
      // appareil (voir lib/auth.tsx).
      await seConnecter(res.accessToken);
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible de créer le dossier');
    } finally {
      setEnvoi(false);
    }
  };

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
              Le plan de comptes {form.referentiel} et l'exercice {new Date(form.dateDebutExercice).getFullYear()} sont
              prêts. Les états financiers seront ceux {LIBELLE_JEU[form.jeuEtatsFinanciersSycebnl]}.
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
                    <h2 className="text-[14px] font-bold mb-1 flex items-center gap-1.5">
                      Référentiel comptable
                      <Aide sujet="jeuEtats" />
                    </h2>
                    <p className="text-[12px] text-text-dim mb-3">
                      Il commande le plan de comptes semé à la création et la présentation des états financiers. Il
                      restera modifiable dans Structure &gt; Paramètres du dossier tant qu'aucune écriture n'est saisie.
                    </p>
                    <div className="flex flex-col gap-2">
                      {REFERENTIELS.map((r) => {
                        const actif = r.disponible && form.referentiel === r.valeur;
                        return (
                          <label
                            key={r.valeur}
                            className={`flex items-start gap-2.5 rounded-[8px] border p-3 transition-colors ${
                              !r.disponible
                                ? 'border-border bg-chrome-alt opacity-60 cursor-not-allowed'
                                : actif
                                  ? 'border-sel bg-sel-soft cursor-pointer'
                                  : 'border-border hover:border-sel/50 cursor-pointer'
                            }`}
                          >
                            <input
                              type="radio"
                              name="referentiel"
                              className="mt-0.5"
                              disabled={!r.disponible}
                              checked={actif}
                              onChange={() => r.disponible && majer('referentiel', r.valeur)}
                            />
                            <span className="min-w-0">
                              <span className="block text-[13px] font-semibold flex items-center gap-1.5">
                                {r.titre}
                                <span className="text-[11px] font-normal text-text-dim">{r.sousTitre}</span>
                                {!r.disponible && (
                                  <span className="text-[10px] font-semibold text-warning">bientôt</span>
                                )}
                              </span>
                              <span className="block text-[11.5px] text-text-dim leading-[1.5] mt-0.5">
                                {r.description}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>

                    {/* Le jeu d'états n'a de sens que sous SYCEBNL : le
                        SYSCOHADA n'en prévoit qu'un. Il n'apparaît donc que
                        si le SYCEBNL est retenu. */}
                    {form.referentiel === 'SYCEBNL' && (
                      <>
                        <h3 className="text-[12.5px] font-bold mt-4 mb-1">Jeu d'états financiers</h3>
                        <p className="text-[11.5px] text-text-dim mb-2">
                          Le SYCEBNL en prévoit trois. Ce choix ne pourra plus être changé une fois la première
                          écriture saisie.
                        </p>
                        <div className="flex flex-col gap-1.5">
                          {TYPES_ENTITE.map((t) => {
                            const actif = form.jeuEtatsFinanciersSycebnl === t.valeur;
                            return (
                              <label
                                key={t.valeur}
                                className={`flex items-start gap-2.5 rounded-[8px] border p-2.5 cursor-pointer transition-colors ${
                                  actif ? 'border-sel bg-sel-soft' : 'border-border hover:border-sel/50'
                                }`}
                              >
                                <input
                                  type="radio"
                                  name="typeEntite"
                                  className="mt-0.5"
                                  checked={actif}
                                  onChange={() => majer('jeuEtatsFinanciersSycebnl', t.valeur)}
                                />
                                <span className="min-w-0">
                                  <span className="block text-[12.5px] font-semibold flex items-center gap-1.5">
                                    {t.titre}
                                    {t.valeur === 'SYSTEME_MINIMAL_TRESORERIE' && <Aide sujet="smt" />}
                                  </span>
                                  <span className="block text-[11px] text-text-dim leading-[1.5] mt-0.5">
                                    {t.description}
                                  </span>
                                </span>
                              </label>
                            );
                          })}
                        </div>
                        {form.jeuEtatsFinanciersSycebnl === 'SYSTEME_MINIMAL_TRESORERIE' && (
                          <p className="mt-2 text-[11px] text-warning bg-warning-soft border border-warning/30 rounded-[6px] px-2.5 py-1.5">
                            Le Système minimal de trésorerie est une exception liée à la taille (art. 5 et 6). Le
                            dossier ouvrira un onglet « Éligibilité » qui mesure vos ressources contre le seuil, mais
                            c'est à l'entité de vérifier qu'elle y a droit.
                          </p>
                        )}
                      </>
                    )}
                  </>
                )}

                {etape === 1 && (
                  <>
                    <h2 className="text-[14px] font-bold mb-1">Raison sociale de l'entité</h2>
                    <p className="text-[12px] text-text-dim mb-4">
                      Telle qu'elle figure aux statuts · elle sera portée en tête de chaque état imprimé.
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
                      à « {form.nomEntite || 'ce dossier'} », tenu en {form.referentiel} selon les états{' '}
                      {LIBELLE_JEU[form.jeuEtatsFinanciersSycebnl]}.
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
