import { FormEvent, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { IconLogo, IconCheck } from '../components/chrome/icons';
import { Aide } from '../components/chrome/Aide';
import type { AuthResponse, JeuEtatsFinanciersSycebnl, Referentiel } from '../lib/types';

/**
 * ÉTAPES NOMMÉES, et non numérotées · l'assistant de Sage pose UNE question
 * par écran, et saute les écrans sans objet. Le jeu d'états financiers n'a
 * de sens que sous SYCEBNL (le SYSCOHADA n'en prévoit qu'un) : il est donc
 * une étape à part entière, absente de la liste quand elle ne s'applique
 * pas · une étape conditionnelle ne peut pas se dire avec des index.
 */
type CleEtape =
  | 'referentiel'
  | 'jeuEtats'
  | 'raisonSociale'
  | 'coordonnees'
  | 'exercice'
  | 'monnaie'
  | 'reprise'
  | 'connexion';

const LIBELLE_ETAPE: Record<CleEtape, string> = {
  referentiel: 'Référentiel',
  jeuEtats: "Jeu d'états",
  raisonSociale: 'Raison sociale',
  coordonnees: 'Coordonnées',
  exercice: 'Exercice',
  monnaie: 'Monnaie',
  reprise: 'Reprise des éléments',
  connexion: 'Connexion au dossier',
};

function etapesApplicables(referentiel: Referentiel): CleEtape[] {
  return [
    'referentiel',
    ...(referentiel === 'SYCEBNL' ? (['jeuEtats'] as const) : []),
    'raisonSociale',
    'coordonnees',
    'exercice',
    'monnaie',
    'reprise',
    'connexion',
  ];
}

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
  /** Code ISO 4217 · les deux monnaies proposées, ou celle saisie librement. */
  devise: string;
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
  'mt-1 w-full border border-border rounded-[6px] bg-surface px-2.5 py-1.5 text-[12px] font-normal focus:outline-none focus:ring-2 focus:ring-sel/25 focus:border-sel';

/**
 * LIGNE DE FORMULAIRE, au modèle Sage · étiquette ALIGNÉE À DROITE dans une
 * colonne fixe, champ dans la colonne suivante. C'est la disposition de tous
 * ses écrans de saisie (« Activité », « Adresse », « Date début d'exercice »…)
 * et elle n'est pas décorative : l'œil descend une seule colonne d'étiquettes
 * et une seule colonne de champs, au lieu de balayer en zigzag comme avec des
 * étiquettes posées au-dessus. Sur un écran de dix champs, la différence de
 * vitesse de lecture est réelle · c'est la raison pour laquelle les
 * formulaires de gestion Windows sont bâtis ainsi depuis trente ans.
 */
function Ligne({
  label,
  children,
  large,
}: {
  label: string;
  children: React.ReactNode;
  /** Champ étroit (dates, codes) plutôt que pleine largeur. */
  large?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 mb-1.5">
      <span className="w-[132px] flex-shrink-0 text-right text-[11px] text-text leading-tight">{label}</span>
      <div className={large ? 'flex-1 min-w-0' : 'w-[190px] flex-shrink-0'}>{children}</div>
    </div>
  );
}

/**
 * TITRE DE SECTION avec filet · « Longueur d'un compte », « Télécommunication »
 * chez Sage. Il découpe un écran long en blocs nommés sans ajouter de fenêtre.
 */
function SectionTitre({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mt-4 mb-2.5">
      <span className="text-[12px] text-text-dim">{children}</span>
      <span className="flex-1 h-px bg-border" />
    </div>
  );
}

export function NouveauFichierWizard({ onClose, onTermine }: { onClose: () => void; onTermine?: () => void }) {
  const [etape, setEtape] = useState(0);
  const [form, setForm] = useState<Form>(formInitial());
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [succes, setSucces] = useState(false);
  // « Autre, à préciser » · la case reste cochée pendant que l'utilisateur
  // tape son code, y compris quand le champ est encore vide (l'état ne peut
  // donc pas se déduire de `form.devise` seul).
  const [autreDevise, setAutreDevise] = useState(false);
  const { seConnecter } = useAuth();

  const majer = <K extends keyof Form>(cle: K, valeur: Form[K]) => setForm((f) => ({ ...f, [cle]: valeur }));

  const etapes = etapesApplicables(form.referentiel);
  // `etape` est un rang dans `etapes` · borné, car changer de référentiel
  // peut retirer une étape sous les pieds de l'utilisateur.
  const rang = Math.min(etape, etapes.length - 1);
  const cle = etapes[rang];
  const derniereEtape = cle === 'connexion';
  const peutAvancer =
    // Les écrans à choix portent toujours une valeur : rien à valider. Seuls
    // la raison sociale et les identifiants sont exigés.
    cle === 'raisonSociale'
      ? form.nomEntite.trim().length > 0
      : derniereEtape
        ? form.email.trim().length > 0 && form.motDePasse.length >= 10
        : true;

  const suivant = () => {
    setErreur(null);
    if (!derniereEtape) setEtape(rang + 1);
  };
  const precedent = () => setEtape(Math.max(0, rang - 1));

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
      await seConnecter(res.csrfToken);
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible de créer le dossier');
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 anim-voile">
      <div className="w-full max-w-[700px] max-h-[calc(100dvh-2rem)] flex flex-col bg-surface border border-border rounded-[10px] overflow-hidden shadow-flottante anim-modale">
        <div
          className="h-[34px] flex items-center justify-between px-3 text-white text-[11px]"
          style={{ background: 'linear-gradient(180deg, var(--titlebar-from), var(--titlebar-to))' }}
        >
          <div className="flex items-center gap-2">
            <IconLogo width={14} height={14} />
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
            <h2 className="text-[13px] font-bold">Dossier « {form.nomEntite} » créé</h2>
            <p className="text-[11px] text-text-dim max-w-[440px]">
              Le plan de comptes {form.referentiel} et l'exercice {new Date(form.dateDebutExercice).getFullYear()} sont
              prêts. Les états financiers seront ceux {LIBELLE_JEU[form.jeuEtatsFinanciersSycebnl]}.
            </p>
            <button
              onClick={() => (onTermine ? onTermine() : onClose())}
              className="mt-2 bg-sel text-white text-[12px] font-semibold px-6 py-2 rounded-[6px] hover:brightness-110"
            >
              Compléter l'identification
            </button>
          </div>
        ) : (
          <div className="flex flex-1 min-h-0">
            <div
              className="w-[172px] flex-shrink-0 p-4 overflow-y-auto"
              style={{ background: 'linear-gradient(180deg, var(--titlebar-from), var(--titlebar-to))' }}
            >
              <div className="text-[10.5px] font-bold text-white mb-4 leading-snug">Nouveau dossier</div>
              {etapes.map((c, i) => (
                <div key={c} className="flex items-center gap-2 py-1">
                  <span
                    className={`w-[18px] h-[18px] rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                      i < rang
                        ? 'bg-white text-[var(--titlebar-to)]'
                        : i === rang
                          ? 'border-2 border-white text-white'
                          : 'border border-white/40 text-white/50'
                    }`}
                  >
                    {i < rang ? '✓' : i + 1}
                  </span>
                  <span className={`text-[10.5px] ${i === rang ? 'text-white font-semibold' : 'text-white/60'}`}>
                    {LIBELLE_ETAPE[c]}
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
              <div className="p-5 h-[400px] max-h-[55dvh] overflow-y-auto">
                {cle === 'referentiel' && (
                  <>
                    {/* Phrase d'accueil · l'assistant de Sage s'ouvre en
                        disant ce qu'il va faire, avant de demander quoi que
                        ce soit. */}
                    <p className="text-[11px] text-text-dim leading-[1.6] mb-5">
                      Cet assistant vous guide dans la mise en place d'un nouveau dossier comptable. Vos réponses
                      commandent le plan de comptes semé à la création et la présentation des états financiers.
                    </p>
                    <h2 className="text-[13px] font-bold mb-1.5 flex items-center gap-1.5">
                      Indiquez le référentiel comptable de l'entité
                      <Aide sujet="jeuEtats" />
                    </h2>
                    <p className="text-[11px] text-text-dim leading-[1.6] mb-4">
                      Il restera modifiable dans Structure &gt; Paramètres du dossier tant qu'aucune écriture n'est
                      saisie.
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
                              <span className="block text-[12px] font-semibold flex items-center gap-1.5">
                                {r.titre}
                                <span className="text-[10.5px] font-normal text-text-dim">{r.sousTitre}</span>
                                {!r.disponible && (
                                  <span className="text-[10px] font-semibold text-warning">bientôt</span>
                                )}
                              </span>
                              <span className="block text-[10.5px] text-text-dim leading-[1.5] mt-0.5">
                                {r.description}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>

                  </>
                )}

                {cle === 'jeuEtats' && (
                  <>
<h2 className="text-[13px] font-bold mb-1.5">Choisissez le jeu d'états financiers</h2>
                    <p className="text-[10.5px] text-text-dim mb-2">
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
                              <span className="block text-[11px] font-semibold flex items-center gap-1.5">
                                {t.titre}
                                {t.valeur === 'SYSTEME_MINIMAL_TRESORERIE' && <Aide sujet="smt" />}
                              </span>
                              <span className="block text-[10.5px] text-text-dim leading-[1.5] mt-0.5">
                                {t.description}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                    {form.jeuEtatsFinanciersSycebnl === 'SYSTEME_MINIMAL_TRESORERIE' && (
                      <p className="mt-2 text-[10.5px] text-warning bg-warning-soft border border-warning/30 rounded-[6px] px-2.5 py-1.5">
                        Le Système minimal de trésorerie est une exception liée à la taille (art. 5 et 6). Le
                        dossier ouvrira un onglet « Éligibilité » qui mesure vos ressources contre le seuil, mais
                        c'est à l'entité de vérifier qu'elle y a droit.
                      </p>
                    )}
                  </>
                )}

                {cle === 'raisonSociale' && (
                  <>
                    <h2 className="text-[13px] font-bold mb-1.5">Indiquez la raison sociale de l'entité</h2>
                    <p className="text-[11px] text-text-dim leading-[1.6] mb-5">
                      Telle qu'elle figure aux statuts : elle sera portée en tête de chaque état imprimé, et c'est
                      sous ce nom que le dossier s'ouvrira.
                    </p>
                    <input
                      autoFocus
                      value={form.nomEntite}
                      onChange={(e) => majer('nomEntite', e.target.value)}
                      placeholder="Espoir pour Tous asbl"
                      className={champ}
                    />
                  </>
                )}

                {cle === 'coordonnees' && (
                  <>
                    <h2 className="text-[13px] font-bold mb-1.5">Renseignez l'identification du dossier</h2>
                    {/* La phrase reprend le nom saisi à l'écran précédent · chez
                        Sage « Renseignez la fiche Identification de la société
                        DDZCZ ». Le logiciel montre qu'il a retenu. */}
                    <p className="text-[11px] text-text-dim leading-[1.6] mb-4">
                      Fiche d'identification de {form.nomEntite ? <strong className="text-text">{form.nomEntite}</strong> : "l'entité"}.
                      Tout est facultatif ici et modifiable plus tard, mais ces éléments sont imprimés en tête des
                      états financiers.
                    </p>

                    <Ligne label="Activité" large>
                      <input value={form.activite} onChange={(e) => majer('activite', e.target.value)} className={champ} />
                    </Ligne>
                    <Ligne label="Adresse" large>
                      <input value={form.adresse} onChange={(e) => majer('adresse', e.target.value)} className={champ} />
                    </Ligne>
                    <Ligne label="Ville / Pays" large>
                      <div className="flex gap-2">
                        <input
                          value={form.ville}
                          onChange={(e) => majer('ville', e.target.value)}
                          className={champ}
                          placeholder="Kinshasa"
                        />
                        <input value={form.pays} onChange={(e) => majer('pays', e.target.value)} className={champ} />
                      </div>
                    </Ligne>

                    <SectionTitre>Télécommunication</SectionTitre>
                    <Ligne label="Téléphone">
                      <input
                        value={form.telephone}
                        onChange={(e) => majer('telephone', e.target.value)}
                        className={champ}
                        placeholder="+243 …"
                      />
                    </Ligne>
                  </>
                )}

                {cle === 'exercice' && (
                  <>
                    <h2 className="text-[13px] font-bold mb-1.5">Définissez le premier exercice</h2>
                    <p className="text-[11px] text-text-dim leading-[1.6] mb-4">
                      Indiquez les dates de début et de fin de votre exercice comptable.
                    </p>

                    <Ligne label="Date début d'exercice">
                      <input
                        type="date"
                        value={form.dateDebutExercice}
                        onChange={(e) => majer('dateDebutExercice', e.target.value)}
                        className={`${champ} font-mono`}
                      />
                    </Ligne>
                    <Ligne label="Date fin d'exercice">
                      <input
                        type="date"
                        value={form.dateFinExercice}
                        onChange={(e) => majer('dateFinExercice', e.target.value)}
                        className={`${champ} font-mono`}
                      />
                    </Ligne>

                    {/* Avertissement DANS LE FLUX du texte, comme le
                        « Important ! » de Sage · une boîte colorée à cet
                        endroit crie plus fort que le reste de l'écran alors
                        que c'est une simple mise en garde. */}
                    <p className="mt-3 text-[11px] text-text leading-[1.6]">
                      <strong>Important !</strong> Les dates restent modifiables tant qu'aucune écriture n'est saisie.
                      Après la première écriture, elles sont figées : le report à-nouveau et tous les états s'appuient
                      dessus.
                    </p>
                  </>
                )}

                {cle === 'monnaie' && (
                  <>
                    <h2 className="text-[13px] font-bold mb-1.5">Identifiez la monnaie de tenue des comptes</h2>
                    <p className="text-[11px] text-text-dim leading-[1.6] mb-4">Vous tenez votre comptabilité en :</p>

                    <div className="flex flex-col gap-2.5">
                      <label className="flex items-center gap-2.5 text-[12px] cursor-pointer">
                        <input
                          type="radio"
                          name="devise"
                          checked={!autreDevise && form.devise === 'CDF'}
                          onChange={() => {
                            setAutreDevise(false);
                            majer('devise', 'CDF');
                          }}
                        />
                        Franc congolais (CDF)
                      </label>
                      <label className="flex items-center gap-2.5 text-[12px] cursor-pointer">
                        <input
                          type="radio"
                          name="devise"
                          checked={!autreDevise && form.devise === 'USD'}
                          onChange={() => {
                            setAutreDevise(false);
                            majer('devise', 'USD');
                          }}
                        />
                        Dollar américain (USD)
                      </label>

                      {/* « Autre, à préciser » + champ adjacent, désactivé tant
                          que l'option n'est pas retenue · exactement le motif
                          de l'écran monnaie de Sage. */}
                      <div className="flex items-center gap-2.5">
                        <label className="flex items-center gap-2.5 text-[12px] cursor-pointer whitespace-nowrap">
                          <input
                            type="radio"
                            name="devise"
                            checked={autreDevise}
                            onChange={() => {
                              setAutreDevise(true);
                              majer('devise', '');
                            }}
                          />
                          Autre, à préciser
                        </label>
                        <input
                          value={autreDevise ? form.devise : ''}
                          disabled={!autreDevise}
                          onChange={(e) => majer('devise', e.target.value.toUpperCase().slice(0, 3))}
                          placeholder="EUR"
                          aria-label="Code de la monnaie"
                          className={`${champ} w-[110px] font-mono uppercase disabled:bg-chrome disabled:text-text-dim`}
                        />
                      </div>
                    </div>

                    <p className="mt-4 text-[11px] text-text-dim leading-[1.6]">
                      Le code sur trois lettres (norme ISO 4217) est celui qui s'imprimera en tête des états
                      financiers. Il ne se change plus une fois des écritures saisies.
                    </p>
                  </>
                )}

                {cle === 'reprise' && (
                  <>
                    <h2 className="text-[13px] font-bold mb-1.5">Reprise des éléments comptables</h2>
                    <p className="text-[11px] text-text-dim leading-[1.6] mb-3">
                      Le dossier peut être créé à partir du modèle livré en standard. Vous n'aurez alors plus qu'à
                      définir les éléments propres à votre entité (tiers, bailleurs, banques) avant de saisir.
                    </p>
                    {/* La QUESTION, en toutes lettres, juste avant les options ·
                        chez Sage « Souhaitez-vous créer votre fichier à partir
                        du modèle standard ? ». Sans elle, trois phrases
                        commençant par « Oui » ne répondent à rien de visible. */}
                    <p className="text-[11px] text-text mb-3">
                      Souhaitez-vous créer le dossier à partir du modèle standard ?
                    </p>
                    <div className="flex flex-col gap-2.5">
                      <label className="flex items-start gap-2 text-[12px]">
                        <input type="radio" checked readOnly className="mt-0.5" />
                        <span>
                          Oui, le dossier sera prêt à l'emploi : plan de comptes SYCEBNL standard et exercice généré
                          automatiquement
                          <span className="block text-[10.5px] text-text-dim">
                            (recommandé · c'est la seule option disponible pour l'instant)
                          </span>
                        </span>
                      </label>
                      <label className="flex items-start gap-2 text-[12px] text-text-dim opacity-60">
                        <input type="radio" disabled className="mt-0.5" />
                        <span>
                          Oui, mais avec une sélection partielle des données
                          <span className="inline-flex items-center gap-1 ml-2 text-[10px] font-semibold text-warning">
                            bientôt
                          </span>
                        </span>
                      </label>
                      <label className="flex items-start gap-2 text-[12px] text-text-dim opacity-60">
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
                    <h2 className="text-[13px] font-bold mb-1.5">Création du dossier comptable</h2>
                    {/* Dernier écran = RÉCAPITULATIF EN PROSE, puis ce qui
                        reste à saisir, puis ce que fera le bouton · c'est la
                        forme de l'écran « Création du fichier comptable » de
                        Sage, qui annonce le traitement avant de le lancer. */}
                    <p className="text-[11px] text-text-dim leading-[1.6] mb-2">
                      Vous avez terminé la définition des paramètres. Le dossier{' '}
                      <strong className="text-text">{form.nomEntite || 'sans nom'}</strong> sera tenu en{' '}
                      {form.referentiel}, selon les états {LIBELLE_JEU[form.jeuEtatsFinanciersSycebnl]}, en{' '}
                      {form.devise || 'monnaie non précisée'}, sur l'exercice du{' '}
                      {form.dateDebutExercice.split('-').reverse().join('/')} au{' '}
                      {form.dateFinExercice.split('-').reverse().join('/')}.
                    </p>
                    <p className="text-[11px] text-text-dim leading-[1.6] mb-4">
                      OmegaX est hébergé : il n'y a pas de fichier à nommer ni d'emplacement à choisir. Il reste à
                      définir les identifiants qui ouvriront ce dossier.
                    </p>

                    <Ligne label="Adresse e-mail" large>
                      <input type="email" value={form.email} onChange={(e) => majer('email', e.target.value)} className={champ} />
                    </Ligne>
                    <Ligne label="Mot de passe" large>
                      <input
                        type="password"
                        minLength={10}
                        value={form.motDePasse}
                        onChange={(e) => majer('motDePasse', e.target.value)}
                        className={champ}
                        placeholder="10 caractères minimum"
                      />
                    </Ligne>

                    <p className="mt-4 text-[11px] text-text leading-[1.6]">
                      Cliquez sur <strong>Fin</strong> pour lancer la création : le plan de comptes {form.referentiel}{' '}
                      sera semé et l'exercice ouvert.
                    </p>
                    {erreur && (
                      <div className="mt-3 text-[11px] text-danger bg-danger-soft border border-danger/30 rounded-[6px] px-2.5 py-1.5">
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
                  className="px-4 py-1.5 border border-border rounded-[6px] bg-surface text-[11px] hover:bg-chrome-alt disabled:opacity-50"
                >
                  Annuler
                </button>
                {/* Toujours présent, désactivé sur le premier écran · chez
                    Sage la rangée de boutons ne se déplace jamais d'une
                    étape à l'autre : le curseur retrouve « Suivant » au
                    même endroit. */}
                <button
                  type="button"
                  onClick={precedent}
                  disabled={envoi || rang === 0}
                  className="px-4 py-1.5 border border-border rounded-[6px] bg-surface text-[11px] hover:bg-chrome-alt disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  &lt; Précédent
                </button>
                <button
                  type="submit"
                  disabled={!peutAvancer || envoi}
                  className="px-5 py-1.5 bg-sel text-white text-[11px] font-semibold rounded-[6px] hover:brightness-110 disabled:opacity-50"
                >
                  {envoi ? 'Création…' : derniereEtape ? 'Fin' : 'Suivant >'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
