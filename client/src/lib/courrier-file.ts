import type { BilanRepriseCourrier, CompteursCourrier, StatutMessage } from './types';

/**
 * CE QUE LA FILE DES COURRIELS DIT À L'ÉCRAN · libellés, ton, compte de la
 * cloche, phrase du bilan de reprise.
 *
 * POURQUOI CE MODULE EXISTE, ET POURQUOI IL N'A PAS DE JSX. Même raison que
 * `menu-groupes.ts` : le dépôt n'embarque ni jsdom ni navigateur, et le jest
 * de la racine ne transforme que le `.ts` (clé `moduleFileExtensions` de
 * package.json, où « tsx » ne figure pas). Écrites dans la page, ces règles ne
 * seraient que RELISIBLES ; ici, elles s'EXÉCUTENT dans le spec.
 *
 * Le ton de chaque état y figure aussi, tout Tailwind qu'il soit · c'est la
 * seule façon de faire tomber un test le jour où quelqu'un peindrait
 * SANS_TRANSPORT en rouge, et cette couleur-là est un contresens, pas une
 * question de goût (voir plus bas).
 */

/**
 * L'ÉTAT QUI COMPTE AUJOURD'HUI, ET LE TEXTE QUI SERA LU PLUS QUE TOUT LE
 * RESTE DE LA FENÊTRE.
 *
 * Aucun transport n'est configuré sur cette installation (les variables
 * SMTP_* vivent dans l'environnement du service, pas en base ni dans le
 * dépôt) : TOUS les messages sont donc SANS_TRANSPORT, et c'est la première
 * chose que verra tout utilisateur. Trois choses doivent passer du premier
 * coup, et une quatrième qu'on n'écrit d'ordinaire nulle part :
 *
 *   1. le message est GARDÉ · il n'est pas perdu ;
 *   2. il n'est PAS parti · le logiciel ne prétend rien ;
 *   3. il repartira tel quel quand la messagerie sera posée · rien à ressaisir ;
 *   4. il n'y a AUCUN formulaire à remplir ici, et ce n'est pas un oubli · un
 *      mot de passe de boîte aux lettres n'a pas sa place dans une base qui se
 *      sauvegarde chaque nuit et se restaure sur un poste de test (voir la
 *      migration 20260914180000_file_des_courriels et transport-courriel.ts).
 *
 * Sans le 4, l'utilisateur cherche un écran de configuration qui n'existe
 * pas, conclut que la fenêtre est incomplète, et rouvre une décision déjà
 * prise.
 */
export const TITRE_SANS_TRANSPORT = "Aucune messagerie n'est encore configurée sur cette installation.";

export const PHRASE_SANS_TRANSPORT =
  'Vos messages sont écrits et gardés ici : aucun n’est parti, aucun n’est perdu, aucun ne sera à refaire. ' +
  'Le jour où les identifiants du serveur d’envoi seront posés, ils repartiront tels quels, avec leur texte ' +
  'd’origine. Ce n’est pas une panne du logiciel.';

export const PHRASE_OU_SE_POSE_LE_COURRIEL =
  'Ces valeurs se posent sur le service qui héberge OmegaX, jamais dans une fenêtre du logiciel : un mot de ' +
  'passe de boîte aux lettres n’a pas sa place dans une base de données qui se sauvegarde chaque nuit et se ' +
  'restaure sur un poste de test. Il n’y a donc rien à remplir ici, et ce n’est pas un manque.';

/**
 * LE TON DE CHAQUE ÉTAT.
 *
 * SANS_TRANSPORT n'est ni `danger` ni `warning` · le peindre en rouge ferait
 * lire « échec » à un message intact, et démentirait la phrase qui l'accompagne
 * dans la même fenêtre. C'est une information, et le bleu de sélection est le
 * ton des informations dans ce chrome.
 *
 * ABANDONNE est en rouge et ECHEC en ambre : le premier ne repartira plus sans
 * qu'on agisse, le second sera repris. Confondre les deux ferait attendre une
 * reprise qui n'aura jamais lieu.
 */
export type TonEtat = 'neutre' | 'information' | 'attente' | 'faute' | 'fait';

export const CLASSES_TON: Record<TonEtat, string> = {
  neutre: 'bg-chrome-alt text-text-dim',
  information: 'bg-sel-soft text-sel',
  attente: 'bg-warning-soft text-warning',
  faute: 'bg-danger-soft text-danger',
  fait: 'bg-positive-soft text-positive',
};

export interface EtatMessage {
  statut: StatutMessage;
  /** Ce que porte la pastille de la colonne ÉTAT. */
  libelle: string;
  /** Ce que dit l'infobulle, et le bandeau du filtre choisi. */
  explication: string;
  ton: TonEtat;
}

/**
 * Les cinq états, dans l'ordre où la file les traverse. Les libellés ne
 * reprennent PAS les noms de l'énumération : « SANS_TRANSPORT » ne dit rien à
 * un comptable, et « sans transport » se lit comme une panne de réseau.
 *
 * Aucune durée ni aucun nombre de tentatives n'est écrit ici · le plafond
 * (`PLAFOND_TENTATIVES`) et les reports (`ATTENTES_MINUTES`) vivent dans
 * report-tentatives.ts, côté serveur, et une valeur recopiée à l'écran
 * mentirait le jour où elle y changerait, sans que rien ne le signale.
 */
export const ETATS_MESSAGE: EtatMessage[] = [
  {
    statut: 'EN_ATTENTE',
    libelle: 'En attente',
    explication:
      'Écrit, la remise est en cours. Un message qui y reste est repris au passage suivant · c’est le cas du service redémarré entre l’écriture et l’envoi.',
    ton: 'neutre',
  },
  {
    statut: 'SANS_TRANSPORT',
    libelle: 'Gardé, pas de messagerie',
    explication:
      'Le message est écrit et conservé, il n’a pas été envoyé et il n’est pas perdu. Il repartira tel quel le jour où la messagerie sera posée sur le service. Ce n’est pas un échec.',
    ton: 'information',
  },
  {
    statut: 'ENVOYE',
    libelle: 'Envoyé',
    explication: 'Remis au serveur de messagerie, qui l’a accepté.',
    ton: 'fait',
  },
  {
    statut: 'ECHEC',
    libelle: 'Échec, sera repris',
    explication:
      'La remise a échoué et sera retentée · l’attente s’allonge à chaque essai, pour ne pas marteler un serveur qui refuse.',
    ton: 'attente',
  },
  {
    statut: 'ABANDONNE',
    libelle: 'Abandonné',
    explication:
      'Les tentatives sont épuisées : ce message ne repartira plus tout seul. Il reste lisible avec sa dernière erreur · une relance qui n’est jamais partie est une information comptable, pas un déchet technique.',
    ton: 'faute',
  },
];

export function etatMessage(statut: StatutMessage): EtatMessage {
  // Un état inconnu du client (ajouté côté serveur sans l'être ici) se nomme
  // lui-même plutôt que de laisser une cellule vide.
  return (
    ETATS_MESSAGE.find((e) => e.statut === statut) ?? {
      statut,
      libelle: statut,
      explication: 'État inconnu de cette version du client.',
      ton: 'neutre',
    }
  );
}

/**
 * L'ORIGINE, EN CLAIR · ce qui a demandé le message.
 *
 * Les deux valeurs sont celles que nomme le serveur (ORIGINE_RELANCE,
 * ORIGINE_MOT_DE_PASSE_TEMPORAIRE dans courrier.service.ts). Une origine que
 * ce tableau ne connaît pas s'affiche TELLE QUELLE plutôt que vide : un module
 * qui en ajoute une sans passer ici laisse alors une colonne lisible, et non
 * une file dont on ne sait plus quelle décision comptable l'a remplie.
 */
export const LIBELLES_ORIGINE: Record<string, string> = {
  RELANCE: 'Rappel et relevé',
  // LE LIBELLÉ NE RECOPIE PAS LE NOM DE LA CONSTANTE, ET C'EST VOULU. La
  // constante nomme le GESTE (un mot de passe provisoire vient d'être posé) ;
  // la colonne, elle, nomme ce qui A ÉTÉ ENVOYÉ, et le message ne porte
  // justement PAS le mot de passe · avis-acces.service.ts le refuse, parce que
  // le corps reste lisible en base, part dans la sauvegarde de chaque nuit, et
  // se rend entier à tout utilisateur du dossier. Écrire « Mot de passe
  // provisoire » dans la file laisserait croire le contraire, et donnerait
  // envie de faire suivre ce message.
  MOT_DE_PASSE_TEMPORAIRE: 'Avis d’accès',
};

export function libelleOrigine(origine: string): string {
  return LIBELLES_ORIGINE[origine] ?? origine;
}

/**
 * CE QUE LA CLOCHE COMPTE, ET RIEN D'AUTRE.
 *
 * Les messages en ÉCHEC et ABANDONNÉS · les seuls que le serveur sache
 * dénombrer aujourd'hui et sur lesquels quelqu'un puisse agir. Trois choses
 * n'y sont délibérément pas :
 *
 *  · SANS_TRANSPORT · aujourd'hui, c'est TOUTE la file. Une cloche qui les
 *    compterait afficherait un nombre à trois chiffres dès la première
 *    relance, sur des messages intacts que personne ne peut faire partir
 *    depuis le logiciel · on apprendrait en une semaine à l'ignorer ;
 *  · EN_ATTENTE · un état de passage, qui se vide tout seul ;
 *  · les échéances et les anomalies · aucune route ne les agrège. Une cloche
 *    qui affiche un chiffre faux est pire qu'une cloche absente.
 */
export const STATUTS_CLOCHE: StatutMessage[] = ['ECHEC', 'ABANDONNE'];

/**
 * RYTHME DE RELECTURE DU COMPTE, et pourquoi il en faut un.
 *
 * Le compte est lu à l'ouverture de la session. Sans relecture, il resterait
 * celui de ce matin toute la journée · un échec survenu depuis ne se verrait
 * jamais, et un échec repris resterait affiché. Une minute est le pas le plus
 * lent qui garde le nombre vrai à l'échelle où un humain agit ; la lecture est
 * en outre suspendue quand l'onglet n'est pas visible, un poste laissé ouvert
 * la nuit n'interrogeant alors plus rien.
 */
export const RYTHME_CLOCHE_MS = 60_000;

/**
 * Le signal que la file a changé · émis par la fenêtre après une reprise,
 * écouté par la cloche. Sans lui, le comptable qui vient de faire repartir
 * ses messages garde une pastille périmée jusqu'à une minute · exactement le
 * chiffre faux que cette cloche ne doit pas afficher.
 */
export const EVENEMENT_FILE_COURRIER = 'omegax:courrier';

export function compteCloche(compteurs: CompteursCourrier): number {
  return STATUTS_CLOCHE.reduce((total, statut) => total + (compteurs[statut] ?? 0), 0);
}

/**
 * Le nombre porté par la pastille. Au-delà de 99 il est ABRÉGÉ, pas caché :
 * quatre chiffres élargiraient la pastille dans la ligne des menus, qui se
 * replie déjà sur deux rangs à 360 px (voir MenuBar.tsx).
 */
export function libelleCompteCloche(compte: number): string {
  if (compte <= 0) return '';
  return compte > 99 ? '99+' : String(compte);
}

/**
 * L'infobulle de la cloche · elle DIT ce que le nombre compte.
 *
 * Sans elle, « 3 » se lit « trois messages en attente », alors que la file
 * peut en porter deux cents qui, eux, vont très bien. Et quand le compte n'a
 * pas pu être lu, la cloche ne montre AUCUN nombre : elle le dit ici.
 */
export function titreCloche(compteurs: CompteursCourrier | null): string {
  if (!compteurs) return 'Courriers sortants · le compte n’a pas pu être lu';
  const compte = compteCloche(compteurs);
  if (compte === 0) return 'Courriers sortants · aucun envoi en échec';
  return `Courriers sortants · ${compte} message${compte > 1 ? 's' : ''} en échec ou abandonné${compte > 1 ? 's' : ''}`;
}

/**
 * CE QUE LE PASSAGE DE REPRISE A FAIT, DIT EN UNE PHRASE.
 *
 * Le cas sans transport passe AVANT tout le reste, et ne réutilise aucun mot
 * du bilan chiffré : « 0 envoyé, 0 en échec » est une phrase de succès, et
 * c'est exactement ce qu'un comptable lirait après avoir cliqué. Rien n'a été
 * tenté, il faut l'écrire, et nommer ce qui manque · le serveur ne rend que
 * des NOMS de variables, jamais leurs valeurs.
 *
 * `restants` est toujours dit quand il en reste · la reprise est bornée à un
 * lot (REPRISE_PAR_APPEL), et un bilan muet sur ce point laisserait croire la
 * file vidée alors qu'elle attend un second clic.
 */
export function resumeReprise(bilan: BilanRepriseCourrier): string {
  if (!bilan.transportConfigure) {
    const manques = bilan.manques.map((m) => m.variable).join(', ');
    const attente =
      bilan.restants > 0
        ? ` Les ${bilan.restants} message${bilan.restants > 1 ? 's' : ''} en attente restent gardés.`
        : '';
    return `Rien n’a été tenté · aucune messagerie n’est configurée sur le service${
      manques ? ` (il manque ${manques})` : ''
    }.${attente}`;
  }

  if (bilan.examines === 0 && bilan.restants === 0) {
    return 'Rien à reprendre · aucun message n’attend un envoi.';
  }

  const parties = [
    `${bilan.examines} message${bilan.examines > 1 ? 's' : ''} repris`,
    `${bilan.envoyes} envoyé${bilan.envoyes > 1 ? 's' : ''}`,
    `${bilan.echoues} en échec`,
    `${bilan.abandonnes} abandonné${bilan.abandonnes > 1 ? 's' : ''}`,
  ];
  let phrase = `${parties[0]} · ${parties.slice(1).join(', ')}.`;
  if (bilan.ignores > 0) {
    // Un message pris par un autre passage (deux onglets, deux instances) ·
    // le taire ferait croire à une ligne perdue.
    phrase += ` ${bilan.ignores} laissé${bilan.ignores > 1 ? 's' : ''} à un autre passage.`;
  }
  if (bilan.restants > 0) {
    phrase += ` Il en reste ${bilan.restants} à reprendre · relancez pour continuer.`;
  }
  return phrase;
}

/** Un onglet de filtre de la fenêtre · « Tous » d'abord, puis les cinq états. */
export interface FiltreFile {
  /** `null` = pas de filtre · toute la file du dossier. */
  statut: StatutMessage | null;
  libelle: string;
  compte: number;
}

/**
 * LES SIX FILTRES, TOUJOURS LES SIX, MÊME À ZÉRO.
 *
 * Un onglet qui disparaît quand son état se vide fait bouger la barre sous le
 * doigt et, surtout, laisse croire que l'état n'existe pas · c'est le jour où
 * « Échec » revient à 1 qu'on voudrait savoir où le lire. Le serveur rend
 * pour la même raison les cinq compteurs même à zéro (compterParStatut).
 */
export function filtresFile(compteurs: CompteursCourrier | null): FiltreFile[] {
  const total = compteurs
    ? ETATS_MESSAGE.reduce((somme, e) => somme + (compteurs[e.statut] ?? 0), 0)
    : 0;
  return [
    { statut: null, libelle: 'Tous', compte: total },
    ...ETATS_MESSAGE.map((e) => ({
      statut: e.statut,
      libelle: e.libelle,
      compte: compteurs ? (compteurs[e.statut] ?? 0) : 0,
    })),
  ];
}
