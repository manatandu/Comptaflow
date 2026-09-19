/**
 * LE CONTRAT DE TRAVAIL · ce que le texte exige, et ce qu'il requalifie.
 *
 * SOURCE UNIQUE · loi n° 015/2002 du 16 octobre 2002 portant Code du travail,
 * modifiée par la loi n° 16/010 du 15 juillet 2016. Titre IV (art. 36 à 49)
 * pour la durée, la forme et l'essai ; Titre X (art. 212 à 219) pour les
 * énonciations et les déclarations.
 *
 * DEUX FAMILLES DE RÈGLES, ET ELLES NE SE MÉLANGENT PAS.
 *
 * 1. LES ÉNONCIATIONS (art. 212). Quinze points, « au minimum ». L'art. 44
 *    en fait la condition de l'écrit : le contrat doit être écrit « POUR
 *    AUTANT QU'IL COMPORTE les énonciations visées à l'article 212 ». Un
 *    manque n'annule rien · il rend le contrat incomplet, et c'est ce que le
 *    contrôle rend.
 *
 * 2. LES REQUALIFICATIONS (art. 40 à 45). Elles ne sont pas des avis : le
 *    texte dit « de plein droit », « est réputé », « constituent de plein
 *    droit l'exécution d'un contrat à durée indéterminée ». Le logiciel ne
 *    requalifie RIEN en base · il DIT que le texte l'a déjà fait. Changer le
 *    type en base serait décider à la place du juge ; le taire serait laisser
 *    un dossier croire qu'il tient un CDD.
 *
 * CE FICHIER NE CALCULE AUCUN MONTANT. Ni préavis, ni indemnité, ni
 * assiette. Le barème de préavis de l'art. 64 et le décompte final sont de
 * P4, et P0 a établi qu'ils butent sur des textes qui ne sont pas au corpus.
 */

import {
  MULTIPLICATEURS_ARTICLE_7,
  TENSIONS,
  tauxJournalierDeLaClasse,
  type PeriodeSmig,
} from './bareme-smig';

/** Les quinze points de l'art. 212, dans l'ordre du texte. */
export type PointArticle212 =
  | 'NOM_EMPLOYEUR'
  | 'IMMATRICULATION_CNSS_EMPLOYEUR'
  | 'IDENTITE_TRAVAILLEUR'
  | 'AFFILIATION_CNSS_TRAVAILLEUR'
  | 'NAISSANCE_TRAVAILLEUR'
  | 'LIEU_NAISSANCE_ET_NATIONALITE'
  | 'SITUATION_FAMILIALE'
  | 'NATURE_DU_TRAVAIL'
  | 'REMUNERATION_ET_AVANTAGES'
  | 'LIEUX_EXECUTION'
  | 'DUREE_ENGAGEMENT'
  | 'DUREE_PREAVIS'
  | 'DATE_ENTREE_EN_VIGUEUR'
  | 'LIEU_ET_DATE_CONCLUSION'
  | 'APTITUDE_AU_TRAVAIL';

export interface EnonciationArticle212 {
  point: PointArticle212;
  /** Le numéro du point tel que le texte le numérote, de 1 à 15. */
  numero: number;
  /** Le texte du point, verbatim. */
  texte: string;
  /** Où le renseigner dans OmegaX · le refus doit nommer l'écran. */
  ou: string;
}

/**
 * LA LISTE EST FERMÉE ET ORDONNÉE. Quinze, parce que le texte en porte
 * quinze. Un test compte, et il tombe si quelqu'un en ajoute ou en retire un
 * sans toucher au texte cité.
 */
export const ENONCIATIONS_ARTICLE_212: readonly EnonciationArticle212[] = [
  {
    point: 'NOM_EMPLOYEUR',
    numero: 1,
    texte: "le nom de l'employeur ou la raison sociale de l'entreprise",
    ou: 'Structure > Paramètres du dossier > Identité',
  },
  {
    point: 'IMMATRICULATION_CNSS_EMPLOYEUR',
    numero: 2,
    texte:
      "le numéro d'immatriculation de l'employeur à l'Institut National de Sécurité Sociale",
    ou: 'Structure > Paramètres du dossier > Identité',
  },
  {
    point: 'IDENTITE_TRAVAILLEUR',
    numero: 3,
    texte: 'le nom, les prénoms et, le ou les post-noms et le sexe du travailleur',
    ou: 'Personnel > fiche du salarié',
  },
  {
    point: 'AFFILIATION_CNSS_TRAVAILLEUR',
    numero: 4,
    texte:
      "le numéro d'affiliation du travailleur à l'Institut National de Sécurité Sociale et, éventuellement, le numéro d'ordre qui lui est attribué par l'employeur",
    ou: 'Personnel > fiche du salarié',
  },
  {
    point: 'NAISSANCE_TRAVAILLEUR',
    numero: 5,
    texte:
      "la date de naissance du travailleur ou à défaut, le millésime de l'année présumée de celle-ci",
    ou: 'Personnel > fiche du salarié',
  },
  {
    point: 'LIEU_NAISSANCE_ET_NATIONALITE',
    numero: 6,
    texte: 'le lieu de naissance du travailleur et sa nationalité',
    ou: 'Personnel > fiche du salarié',
  },
  {
    point: 'SITUATION_FAMILIALE',
    numero: 7,
    texte:
      "la situation familiale du travailleur : nom, prénoms, ou post-noms du conjoint ; nom, prénoms ou post-noms et date de naissance de chaque enfant à charge",
    ou: 'Personnel > fiche du salarié > Situation de famille',
  },
  {
    point: 'NATURE_DU_TRAVAIL',
    numero: 8,
    texte: 'la nature et les modalités du travail à fournir',
    ou: 'Personnel > contrat',
  },
  {
    point: 'REMUNERATION_ET_AVANTAGES',
    numero: 9,
    texte: 'le montant de la rémunération et des autres avantages convenus',
    ou: 'Personnel > contrat',
  },
  {
    point: 'LIEUX_EXECUTION',
    numero: 10,
    texte: "le ou les lieux d'exécution du contrat",
    ou: 'Personnel > contrat',
  },
  {
    point: 'DUREE_ENGAGEMENT',
    numero: 11,
    texte: "la durée de l'engagement",
    ou: 'Personnel > contrat',
  },
  {
    point: 'DUREE_PREAVIS',
    numero: 12,
    texte: 'la durée du préavis de licenciement',
    ou: 'Personnel > contrat',
  },
  {
    point: 'DATE_ENTREE_EN_VIGUEUR',
    numero: 13,
    texte: "la date d'entrée en vigueur du contrat",
    ou: 'Personnel > contrat',
  },
  {
    point: 'LIEU_ET_DATE_CONCLUSION',
    numero: 14,
    texte: 'le lieu et la date de la conclusion du contrat',
    ou: 'Personnel > contrat',
  },
  {
    point: 'APTITUDE_AU_TRAVAIL',
    numero: 15,
    texte: "l'aptitude au travail dûment constatée par un médecin",
    ou: 'Personnel > fiche du salarié > Aptitude',
  },
];

export interface EmployeurPourControle {
  nom: string | null;
  numeroAffiliationCnssEmployeur: string | null;
}

export interface SalariePourControle {
  nom: string | null;
  postNom: string | null;
  prenoms: string | null;
  sexe: string | null;
  numeroAffiliationCnss: string | null;
  dateNaissance: Date | string | null;
  millesimeNaissance: number | null;
  lieuNaissance: string | null;
  nationalite: string | null;
  nomConjoint: string | null;
  aptitudeConstateeLe: Date | string | null;
  /** Au moins un enfant saisi SANS date de naissance · le point 7 l'exige. */
  enfantsSansDateNaissance: number;
}

export interface ContratPourControle {
  type: string;
  constateParEcrit: boolean;
  dateEntreeEnVigueur: Date | string | null;
  dateConclusion: Date | string | null;
  lieuConclusion: string | null;
  dateFinPrevue: Date | string | null;
  ouvrageDetermine: string | null;
  motifRemplacement: string | null;
  emploiPermanent: boolean;
  natureTravail: string | null;
  lieuExecution: string | null;
  remunerationBase: number | null;
  avantagesConvenus: string | null;
  dureePreavisJours: number | null;
  separeDeSaFamille: boolean;
  manoeuvreSansSpecialite: boolean;
  clauseEssai: boolean;
  essaiConstateParEcrit: boolean;
  essaiDureeJours: number | null;
  /** La classe de la tension salariale, 1 à 17. Null quand elle n'est pas tranchée. */
  classeProfessionnelle: number | null;
  /** L'unité dans laquelle `remunerationBase` est stipulée. */
  periodiciteRemuneration: 'JOUR' | 'SEMAINE' | 'MOIS' | 'ANNEE' | null;
}

const rempli = (v: unknown): boolean =>
  v !== null && v !== undefined && (typeof v !== 'string' || v.trim() !== '');

function estSatisfait(
  point: PointArticle212,
  employeur: EmployeurPourControle,
  salarie: SalariePourControle,
  contrat: ContratPourControle,
): boolean {
  switch (point) {
    case 'NOM_EMPLOYEUR':
      return rempli(employeur.nom);
    case 'IMMATRICULATION_CNSS_EMPLOYEUR':
      return rempli(employeur.numeroAffiliationCnssEmployeur);
    case 'IDENTITE_TRAVAILLEUR':
      // Le nom ET le sexe · le texte les joint dans le même point. Les
      // prénoms et post-noms y figurent, mais le texte écrit « le nom, les
      // prénoms ET, LE OU LES post-noms » : le post-nom peut ne pas exister.
      return rempli(salarie.nom) && rempli(salarie.sexe);
    case 'AFFILIATION_CNSS_TRAVAILLEUR':
      // Le matricule est « éventuel » dans le texte · seul le numéro CNSS est
      // exigé. L'exiger serait plus sévère que la loi.
      return rempli(salarie.numeroAffiliationCnss);
    case 'NAISSANCE_TRAVAILLEUR':
      // « OU À DÉFAUT, le millésime » · l'un OU l'autre suffit, et c'est le
      // texte qui le dit.
      return rempli(salarie.dateNaissance) || rempli(salarie.millesimeNaissance);
    case 'LIEU_NAISSANCE_ET_NATIONALITE':
      return rempli(salarie.lieuNaissance) && rempli(salarie.nationalite);
    case 'SITUATION_FAMILIALE':
      // UN CÉLIBATAIRE SANS ENFANT SATISFAIT CE POINT. Le texte énumère ce
      // qu'il faut mentionner SI cela existe · exiger un conjoint ferait
      // échouer tout contrat de célibataire, ce qu'aucune lecture ne soutient.
      // Ce qui manque vraiment, c'est un enfant DÉCLARÉ dont la date de
      // naissance n'est pas donnée : là, le texte l'exige nommément.
      return salarie.enfantsSansDateNaissance === 0;
    case 'NATURE_DU_TRAVAIL':
      return rempli(contrat.natureTravail);
    case 'REMUNERATION_ET_AVANTAGES':
      // « le montant de la rémunération ET des autres avantages convenus » ·
      // les avantages peuvent ne pas exister, le montant, lui, est dû.
      return rempli(contrat.remunerationBase);
    case 'LIEUX_EXECUTION':
      return rempli(contrat.lieuExecution);
    case 'DUREE_ENGAGEMENT':
      // UN CDI A UNE DURÉE, et elle est indéterminée · c'est son type qui
      // l'énonce. Réclamer une date de fin à un CDI serait lui demander de
      // cesser d'en être un.
      if (contrat.type === 'DUREE_INDETERMINEE') return true;
      if (contrat.type === 'JOUR_LE_JOUR') return true;
      return (
        rempli(contrat.dateFinPrevue) ||
        rempli(contrat.ouvrageDetermine) ||
        rempli(contrat.motifRemplacement)
      );
    case 'DUREE_PREAVIS':
      return rempli(contrat.dureePreavisJours);
    case 'DATE_ENTREE_EN_VIGUEUR':
      return rempli(contrat.dateEntreeEnVigueur);
    case 'LIEU_ET_DATE_CONCLUSION':
      return rempli(contrat.dateConclusion) && rempli(contrat.lieuConclusion);
    case 'APTITUDE_AU_TRAVAIL':
      return rempli(salarie.aptitudeConstateeLe);
  }
}

export interface MentionManquante extends EnonciationArticle212 {
  motif: string;
}

/**
 * Les énonciations de l'art. 212 que ce contrat ne porte pas.
 *
 * L'ORDRE EST CELUI DU TEXTE, et ce n'est pas cosmétique : c'est dans cet
 * ordre qu'un inspecteur du travail lira le contrat.
 */
export function mentionsManquantes(
  employeur: EmployeurPourControle,
  salarie: SalariePourControle,
  contrat: ContratPourControle,
): MentionManquante[] {
  return ENONCIATIONS_ARTICLE_212.filter(
    (e) => !estSatisfait(e.point, employeur, salarie, contrat),
  ).map((e) => ({
    ...e,
    motif:
      e.point === 'SITUATION_FAMILIALE'
        ? `${salarie.enfantsSansDateNaissance} enfant(s) à charge sont déclarés sans date de naissance, que le point 7 exige de chacun.`
        : `Le point ${e.numero} de l'article 212 n'est pas renseigné : « ${e.texte} ».`,
  }));
}

/**
 * CE QUE LE TEXTE A DÉJÀ REQUALIFIÉ.
 *
 * Chaque motif porte son article et sa formule, parce que la formule est ce
 * qui distingue un conseil d'un effet légal.
 */
export type MotifRequalification =
  | 'PAS_D_ECRIT'
  | 'CDD_SANS_MENTION_DE_SON_TERME'
  | 'REMPLACEMENT_SANS_MOTIF'
  | 'EMPLOI_PERMANENT'
  | 'CDD_TROP_LONG'
  | 'CDD_TROP_LONG_SEPARE_DE_SA_FAMILLE'
  | 'TROISIEME_CDD'
  | 'SECOND_RENOUVELLEMENT';

export interface Requalification {
  motif: MotifRequalification;
  article: string;
  /** Ce que le texte dit, verbatim, et qui fait l'effet. */
  formule: string;
  explication: string;
}

export interface HistoriqueChezCetEmployeur {
  /** Nombre de CDD déjà conclus avec ce salarié, celui-ci COMPRIS. */
  nombreCdd: number;
  /** Nombre de renouvellements de CE contrat, celui-ci compris. */
  nombreRenouvellements: number;
}

const MS_PAR_JOUR = 86_400_000;

function enDate(v: Date | string | null): Date | null {
  if (v === null || v === undefined) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Nombre de jours entiers entre deux dates, bornes comprises côté départ. */
export function joursEntre(debut: Date, fin: Date): number {
  return Math.floor((fin.getTime() - debut.getTime()) / MS_PAR_JOUR);
}

/**
 * LES REQUALIFICATIONS DE PLEIN DROIT.
 *
 * Elles ne s'appliquent qu'à un contrat qui se PRÉSENTE comme déterminé. Un
 * CDI n'a rien à requalifier, et un contrat d'apprentissage relève du Titre
 * III, que les art. 41 et 42 ne visent pas · les compter ferait naître une
 * requalification qu'aucun texte ne porte.
 */
export function requalifications(
  contrat: ContratPourControle,
  historique: HistoriqueChezCetEmployeur,
): Requalification[] {
  const sorties: Requalification[] = [];
  if (contrat.type === 'APPRENTISSAGE') return sorties;

  if (!contrat.constateParEcrit && contrat.type !== 'JOUR_LE_JOUR') {
    sorties.push({
      motif: 'PAS_D_ECRIT',
      article: 'art. 44, alinéa 2',
      formule:
        "A défaut d'écrit, le contrat est présumé, jusqu'à preuve du contraire, avoir été conclu pour une durée indéterminée.",
      explication:
        "L'alinéa 3 excepte l'engagement au jour le jour, et lui seul. Cette présomption souffre la preuve contraire · c'est la seule de cette liste qui ne soit pas irréfragable.",
    });
  }

  if (contrat.type !== 'DUREE_DETERMINEE') return sorties;

  if (contrat.emploiPermanent) {
    sorties.push({
      motif: 'EMPLOI_PERMANENT',
      article: 'art. 42',
      formule:
        'Tout contrat conclu pour une durée déterminée en violation du présent article est réputé conclu pour une durée indéterminée.',
      explication:
        "L'article impose le contrat à durée indéterminée dès lors que le travailleur est engagé pour occuper un EMPLOI PERMANENT. Le caractère permanent du poste est saisi au contrat · aucune colonne ne le déduit.",
    });
  }

  const terme =
    rempli(contrat.dateFinPrevue) ||
    rempli(contrat.ouvrageDetermine) ||
    rempli(contrat.motifRemplacement);
  if (!terme) {
    sorties.push({
      motif: 'CDD_SANS_MENTION_DE_SON_TERME',
      article: 'art. 45',
      formule:
        "Le contrat constaté par écrit qui ne mentionne pas expressément qu'il a été conclu soit pour une durée déterminée, soit pour un ouvrage déterminé, soit pour le remplacement d'un travailleur temporairement indisponible […] est réputé avoir été conclu pour une durée indéterminée.",
      explication:
        "Les trois formes de l'article 40 sont alternatives : un terme, un ouvrage, ou un remplacement. Aucune des trois n'est renseignée.",
    });
  }

  const debut = enDate(contrat.dateEntreeEnVigueur);
  const fin = enDate(contrat.dateFinPrevue);
  if (debut && fin) {
    const jours = joursEntre(debut, fin);
    // DEUX ANS, OU UN AN. Le texte raisonne en années, pas en jours · on
    // compare de date à date pour ne pas faire dépendre la règle du nombre de
    // jours de février.
    const plafond = new Date(debut.getTime());
    plafond.setFullYear(plafond.getFullYear() + (contrat.separeDeSaFamille ? 1 : 2));
    if (fin.getTime() > plafond.getTime()) {
      sorties.push(
        contrat.separeDeSaFamille
          ? {
              motif: 'CDD_TROP_LONG_SEPARE_DE_SA_FAMILLE',
              article: 'art. 41, alinéa 1er',
              formule:
                "Cette durée ne peut excéder un an, si le travailleur est marié et séparé de sa famille ou s'il est veuf, séparé de corps ou divorcé et séparé de ses enfants dont il doit assumer la garde.",
              explication: `Le contrat court ${jours} jours, au-delà du plafond d'un an applicable à ce travailleur.`,
            }
          : {
              motif: 'CDD_TROP_LONG',
              article: 'art. 41, alinéa 1er',
              formule: 'Le contrat à durée déterminée ne peut excéder deux ans.',
              explication: `Le contrat court ${jours} jours, au-delà du plafond de deux ans.`,
            },
      );
    }
  }

  if (historique.nombreCdd > 2) {
    sorties.push({
      motif: 'TROISIEME_CDD',
      article: 'art. 41, alinéas 2 et 3',
      formule:
        "Aucun travailleur ne peut conclure avec le même employeur ou avec la même entreprise plus de deux contrats à durée déterminée […] L'exécution de tout contrat conclu en violation des dispositions du présent article […] constitue de plein droit l'exécution d'un contrat de travail à durée indéterminée.",
      explication: `C'est le ${historique.nombreCdd}e contrat à durée déterminée conclu avec ce travailleur dans ce dossier.`,
    });
  }

  if (historique.nombreRenouvellements > 1) {
    sorties.push({
      motif: 'SECOND_RENOUVELLEMENT',
      article: 'art. 41, alinéas 2 et 3',
      formule:
        'ni renouveler plus d’une fois un contrat à durée déterminée, sauf dans le cas d’exécution des travaux saisonniers, d’ouvrages bien définis et autres travaux déterminés par arrêté du Ministre',
      explication: `Ce contrat a été renouvelé ${historique.nombreRenouvellements} fois. L'exception des travaux saisonniers et des ouvrages bien définis n'est pas déduite : elle suppose un arrêté ministériel qui n'est pas au corpus, et c'est au dossier de l'invoquer.`,
    });
  }

  return sorties;
}

/**
 * L'ESSAI · art. 43. Trois vérifications, et une réduction de plein droit.
 */
export interface VerdictEssai {
  /** La durée réellement opposable, après réduction de plein droit. */
  dureeOpposableJours: number | null;
  /** Le plafond applicable, en jours. */
  plafondJours: number;
  reduiteDePleinDroit: boolean;
  /** L'essai est stipulé mais n'est pas constaté par écrit (art. 43 al. 1er). */
  ecritManquant: boolean;
  reserve: string | null;
}

/**
 * UN MOIS OU SIX MOIS, ET LE TEXTE NE DIT PAS EN JOURS.
 *
 * L'article plafonne « un mois » et « six mois ». Les convertir en 30 et 180
 * jours est une CONVENTION, pas une lecture · elle est assumée ici, nommée, et
 * rendue avec la réserve, pour qu'un dossier dont l'essai tombe à un jour du
 * plafond sache que c'est la conversion qui tranche, et non le texte.
 */
export const JOURS_PAR_MOIS_ESSAI = 30;

export function verdictEssai(contrat: ContratPourControle): VerdictEssai {
  const plafondMois = contrat.manoeuvreSansSpecialite ? 1 : 6;
  const plafondJours = plafondMois * JOURS_PAR_MOIS_ESSAI;
  if (!contrat.clauseEssai) {
    return {
      dureeOpposableJours: null,
      plafondJours,
      reduiteDePleinDroit: false,
      ecritManquant: false,
      reserve: null,
    };
  }
  const stipulee = contrat.essaiDureeJours ?? null;
  const reduite = stipulee !== null && stipulee > plafondJours;
  return {
    dureeOpposableJours: reduite ? plafondJours : stipulee,
    plafondJours,
    reduiteDePleinDroit: reduite,
    ecritManquant: !contrat.essaiConstateParEcrit,
    reserve:
      `Le plafond de l'article 43 est exprimé en MOIS (${plafondMois}), non en jours : ` +
      `OmegaX le convertit à ${JOURS_PAR_MOIS_ESSAI} jours par mois, soit ${plafondJours} jours. ` +
      'La conversion est une convention du logiciel, pas une lecture du texte. ' +
      "La prolongation des services au-delà de la durée maximale « entraîne automatiquement la confirmation du contrat de travail » (art. 43, alinéa 4), et « les délais d'engagement et de route ne sont pas compris dans la durée maximale » (alinéa 5) : OmegaX ne les connaît pas et ne les retranche pas.",
  };
}

/**
 * LES DÉCLARATIONS DE L'ART. 217 · quinze jours, deux fois.
 *
 * Le logiciel ne déclare rien et n'envoie rien. Il dit ce qui est dû, à
 * quelle date, et si le délai est couru · même parti que l'échéancier fiscal.
 */
export const JOURS_DECLARATION_ARTICLE_217 = 15;

export type ObjetDeclaration = 'ENGAGEMENT' | 'DEPART';

export interface DeclarationDue {
  objet: ObjetDeclaration;
  /** Le fait générateur · entrée en vigueur du contrat, ou départ. */
  faitLe: Date;
  echeance: Date;
  faite: boolean;
  enRetard: boolean;
  destinataires: string;
  article: string;
}

export function declarationsDues(
  entree: {
    dateEntreeEnVigueur: Date | string | null;
    declarationEngagementLe: Date | string | null;
    dateFin: Date | string | null;
    declarationDepartLe: Date | string | null;
  },
  aujourdhui: Date,
): DeclarationDue[] {
  const dues: DeclarationDue[] = [];
  const destinataires =
    "au service compétent du ministère ayant l'emploi, le travail et la prévoyance sociale dans ses attributions ET à l'Office national de l'emploi";

  const poser = (
    objet: ObjetDeclaration,
    fait: Date | null,
    faiteLe: Date | null,
  ) => {
    if (!fait) return;
    const echeance = new Date(fait.getTime() + JOURS_DECLARATION_ARTICLE_217 * MS_PAR_JOUR);
    dues.push({
      objet,
      faitLe: fait,
      echeance,
      faite: faiteLe !== null,
      // UNE DÉCLARATION FAITE N'EST JAMAIS EN RETARD ICI. Le registre dit ce
      // qui reste dû · savoir si elle a été faite dans les temps se lit sur
      // sa date, que la fiche porte.
      enRetard: faiteLe === null && aujourdhui.getTime() > echeance.getTime(),
      destinataires,
      article: 'art. 217',
    });
  };

  poser('ENGAGEMENT', enDate(entree.dateEntreeEnVigueur), enDate(entree.declarationEngagementLe));
  poser('DEPART', enDate(entree.dateFin), enDate(entree.declarationDepartLe));
  return dues;
}

/**
 * L'APTITUDE PROVISOIRE · art. 38, alinéa 2.
 *
 * « un certificat provisoire est délivré par un infirmier, sous réserve de
 * soumettre le travailleur à un examen médical DANS LES TROIS MOIS qui
 * suivent le début des prestations de travail. »
 */
export const JOURS_CONFIRMATION_APTITUDE = 90;

export function aptitudeProvisoirePerimee(
  salarie: { aptitudeProvisoire: boolean },
  contrat: { dateEntreeEnVigueur: Date | string | null },
  aujourdhui: Date,
): boolean {
  if (!salarie.aptitudeProvisoire) return false;
  const debut = enDate(contrat.dateEntreeEnVigueur);
  if (!debut) return false;
  return joursEntre(debut, aujourdhui) > JOURS_CONFIRMATION_APTITUDE;
}

/**
 * LA RÉMUNÉRATION CONVENUE CONFRONTÉE AU MINIMUM DE SA CLASSE.
 *
 * C'est le contrôle que la grille de tension salariale rend enfin possible,
 * et il n'est pas un avis. Le décret n° 25/21, art. 3, définit le SMIG comme
 * « la somme minimale fixée par le pouvoir public EN DEÇÀ DE LAQUELLE AUCUN
 * TRAVAILLEUR NE PEUT ÊTRE RÉMUNÉRÉ SOUS PEINE DE SANCTION ». Et l'art. 37 du
 * Code du travail frappe de nullité de plein droit « toute clause
 * contractuelle accordant au travailleur des avantages inférieurs à ceux
 * prescrits par le présent Code ».
 *
 * TROIS CHOSES SANS LESQUELLES LE CONTRÔLE S'ABSTIENT, ET LE DIT.
 *
 * 1. LA CLASSE. Elle vient du décret, pas de la convention collective du
 *    dossier · les deux vivent dans deux colonnes séparées, et aucune ne se
 *    déduit de l'autre.
 * 2. LA PÉRIODICITÉ. Le décret fixe un taux JOURNALIER ; la supposer
 *    mensuelle ferait passer un salaire journalier pour vingt-six fois trop
 *    bas, et un salaire annuel pour douze fois trop haut.
 * 3. LE MOIS DE RÉFÉRENCE. Le minimum a changé en janvier 2026 (art. 3 du
 *    décret n° 25/22) et s'ajuste chaque janvier (art. 11 du n° 25/21). Un
 *    contrat conforme à sa signature peut cesser de l'être.
 *
 * CE QU'IL NE FAIT PAS. Il compare la rémunération CONVENUE au contrat, pas
 * ce qui est effectivement payé · un bulletin est de P2. Et il ne tient
 * aucun compte des avantages en nature, que le décret n° 25/22 exclut
 * expressément de la rémunération à son article 8 pour le logement et le
 * transport.
 */
export type MotifAbstentionMinimum =
  | 'CLASSE_NON_RENSEIGNEE'
  | 'PERIODICITE_NON_RENSEIGNEE'
  | 'REMUNERATION_NON_RENSEIGNEE'
  | 'HORS_BAREME';

export interface VerdictRemunerationMinimale {
  /** Vrai quand la rémunération convenue atteint au moins le minimum. */
  conforme: boolean | null;
  /** Le minimum légal, ramené à la périodicité du contrat. */
  minimumFc: number | null;
  /** La rémunération convenue, telle que stipulée. */
  convenueFc: number | null;
  /** Ce qui manque au contrat pour atteindre le minimum, quand il est en deçà. */
  manqueFc: number | null;
  abstention: MotifAbstentionMinimum | null;
  explication: string;
}

/** Les multiplicateurs de l'art. 7, plus le jour qui vaut un. */
const MULTIPLICATEUR: Record<'JOUR' | PeriodeSmig, number> = {
  JOUR: 1,
  SEMAINE: MULTIPLICATEURS_ARTICLE_7.SEMAINE,
  MOIS: MULTIPLICATEURS_ARTICLE_7.MOIS,
  ANNEE: MULTIPLICATEURS_ARTICLE_7.ANNEE,
};

export function verdictRemunerationMinimale(
  contrat: ContratPourControle,
  moisDeReference: string,
): VerdictRemunerationMinimale {
  const abstention = (
    motif: MotifAbstentionMinimum,
    explication: string,
  ): VerdictRemunerationMinimale => ({
    conforme: null,
    minimumFc: null,
    convenueFc: contrat.remunerationBase,
    manqueFc: null,
    abstention: motif,
    explication,
  });

  if (contrat.classeProfessionnelle === null) {
    return abstention(
      'CLASSE_NON_RENSEIGNEE',
      `La classe de la tension salariale n'est pas renseignée. Les annexes du décret n° 25/22 en ` +
        `portent ${TENSIONS.length}, du manœuvre ordinaire au cadre de collaboration · OmegaX ne la ` +
        "déduit ni de l'intitulé du poste, ni de la catégorie de la convention collective, qui est " +
        'une autre grille.',
    );
  }
  if (contrat.periodiciteRemuneration === null) {
    return abstention(
      'PERIODICITE_NON_RENSEIGNEE',
      "La périodicité de la rémunération convenue n'est pas renseignée. Le décret fixe un taux " +
        "JOURNALIER et l'article 7 donne les multiplicateurs vers la semaine (6), le mois (26) et " +
        "l'année (312) · sans l'unité, la comparaison n'a pas de sens, et la supposer mensuelle " +
        'ferait paraître un salaire journalier vingt-six fois trop bas.',
    );
  }
  if (contrat.remunerationBase === null) {
    return abstention(
      'REMUNERATION_NON_RENSEIGNEE',
      "La rémunération convenue n'est pas renseignée · c'est déjà le point 9 manquant de " +
        "l'article 212.",
    );
  }

  const taux = tauxJournalierDeLaClasse(contrat.classeProfessionnelle, moisDeReference);
  if (!taux.valeur) return abstention('HORS_BAREME', taux.explication);

  const minimum = taux.valeur.tauxFc * MULTIPLICATEUR[contrat.periodiciteRemuneration];
  const conforme = contrat.remunerationBase >= minimum;
  const unite = contrat.periodiciteRemuneration.toLowerCase();
  return {
    conforme,
    minimumFc: minimum,
    convenueFc: contrat.remunerationBase,
    manqueFc: conforme ? null : minimum - contrat.remunerationBase,
    abstention: null,
    explication: conforme
      ? `Classe ${taux.valeur.classe} (${taux.valeur.categorie.libelle}${
          taux.valeur.echelon ? `, échelon ${taux.valeur.echelon}` : ''
        }), tension ${taux.valeur.tension} : minimum de ${minimum} FC par ${unite} au mois de paie ` +
        `${moisDeReference}. La rémunération convenue l'atteint.`
      : `EN DEÇÀ DU MINIMUM LÉGAL. Classe ${taux.valeur.classe} (${taux.valeur.categorie.libelle}` +
        `${taux.valeur.echelon ? `, échelon ${taux.valeur.echelon}` : ''}), tension ` +
        `${taux.valeur.tension} : le minimum est de ${minimum} FC par ${unite} au mois de paie ` +
        `${moisDeReference}, et le contrat stipule ${contrat.remunerationBase} FC. ` +
        "Le SMIG est « la somme minimale fixée par le pouvoir public en deçà de laquelle aucun " +
        "travailleur ne peut être rémunéré sous peine de sanction » (décret n° 25/21, art. 3), et " +
        "l'article 37 du Code du travail frappe de nullité de plein droit toute clause accordant " +
        'au travailleur des avantages inférieurs à ceux prescrits par le Code.',
  };
}
