import { FormeJuridiqueSyscohada, Referentiel } from '@prisma/client';
import { RESERVE_JOUR_OUVRABLE } from './jour-ouvrable';
import { FORFAITS_ARRETE_019_2025 } from '../personnel/bareme-irpp';

/**
 * REGISTRE DES RETENUES À LA SOURCE ET ÉCHÉANCIER FISCAL.
 *
 * ## Pourquoi cet état existe
 *
 * Une ASBL congolaise régulièrement constituée est exemptée d'impôt sur les
 * sociétés (loi n° 23/053, art. 5, point 3 · l'arrêté ministériel
 * n° 007/CAB/MIN/FINANCES/2025 ne régit que le point 5, établissements
 * d'utilité publique et ONG, son art. 1er). Elle n'est dispensée
 * d'AUCUN impôt qu'elle retient pour le compte d'autrui, ni d'aucune
 * cotisation sociale. C'est là qu'une association se met en défaut, et
 * précisément parce qu'elle croit que « ne rien payer » vaut « ne rien
 * devoir ». Voir `docs/fiscalite-asbl-rdc.md`, section 6.
 *
 * CETTE EXEMPTION NE VISE QUE LE DOSSIER SYCEBNL, et l'écran l'annonçait à
 * tout le monde. L'article 5 exempte l'État, les provinces, les ETD, les
 * établissements publics, les coopératives agricoles de forme civile, les
 * ASBL, les établissements d'utilité publique et les ONG, et certains
 * établissements privés d'enseignement · pas une société commerciale, qui est
 * au contraire redevable de l'IS par sa forme même (art. 3). Une entreprise
 * lisait donc, en tête de son registre, qu'elle bénéficiait d'une exemption
 * qui n'existe pas. Les textes servis dépendent désormais du référentiel du
 * dossier · voir `avertissementRegimeImpot` et les champs `reserveSyscohada`.
 *
 * Cet état ne calcule aucun impôt. Il recense ce que la comptabilité porte
 * DÉJÀ sur les comptes de retenue et de cotisation, en regard de l'échéance
 * légale de reversement. La distinction est essentielle : un logiciel
 * comptable qui liquiderait de l'impôt sur un barème qu'il ne contrôle pas
 * rendrait un mauvais service (même note, section 9.2).
 *
 * ## Ce qui est figé, ce qui ne l'est pas
 *
 * Aucun taux n'est inscrit ici. Les ÉCHÉANCES le sont, avec leur base légale
 * citée et la date à laquelle elles ont été vérifiées, parce qu'elles
 * changent aussi : l'article 57 bis de la loi de procédures fiscales a été
 * modifié par la loi de finances n° 25/060 du 29 décembre 2025, qui a déplacé
 * les acomptes provisionnels du 1er août au 25 juillet. Elles sont donc
 * présentées comme des repères datés et sourcés, pas comme une vérité du
 * logiciel.
 */

export interface NatureRetenue {
  cle: string;
  libelle: string;
  /** Comptes du plan SYCEBNL qui portent cette retenue ou cotisation. */
  comptes: string[];
  exclusions?: string[];
  /**
   * Qui en est le bénéficiaire · commande le regroupement à l'écran.
   *
   * PROVINCE (passe F11) · l'impôt sur les revenus locatifs est rangé par la
   * Constitution, art. 204, 16°, parmi les impôts de la compétence exclusive
   * des provinces. Le ranger sous « État (DGI) » faisait déposer au mauvais
   * guichet à Kinshasa, où l'arrêté provincial n° 015/2023, art. 3, fait
   * reverser la retenue au compte de la Ville. La valeur dit le TITULAIRE de
   * l'impôt, que la Constitution nomme, et jamais la RÉGIE qui le perçoit,
   * que le corpus ne décrit que pour Kinshasa · la réserve de la nature le dit.
   */
  beneficiaire: 'ETAT' | 'PROVINCE' | 'ORGANISME_SOCIAL';
  /**
   * Ce qu'il faut produire avec le reversement, quand un texte l'exige · même
   * rôle que le `contenu` d'une obligation déclarative (passe F11).
   */
  contenu?: string;
  /** Ce que le logiciel détient pour le produire, et ce qu'il ne détient pas. */
  sourceDonnees?: string;
  /**
   * Nombre de JOURS après la fin du mois de la retenue où le reversement est
   * dû. Quinze pour la plupart ; DIX pour la retenue locative (loi de
   * procédures fiscales, art. 57).
   *
   * Le champ s'appelait `jourEcheance` et désignait un jour du mois suivant.
   * C'était la même chose pour 15, mais faux pour « dans les dix jours » : le
   * registre affichait « 10 jours » et calculait le 15. Un délai en jours est
   * la formulation des textes, et se prête aux deux cas sans ambiguïté.
   */
  joursApresPeriode: number;
  /** Formulation exacte de l'échéance, telle que le texte la pose. */
  echeance: string;
  baseLegale: string;
  /** Précision à afficher quand elle change la lecture de la ligne. */
  reserve?: string;
  /**
   * Code de l'imprimé de la Direction générale des impôts, quand il est connu.
   *
   * Ce n'est pas décoratif : le comptable qui va déposer demande le formulaire
   * par son code au guichet, et l'imprimé porte les cases dans un ordre que le
   * logiciel n'a pas à deviner. Ne le renseigner QUE d'après un imprimé
   * réellement lu · un code inventé enverrait chercher un papier qui n'existe
   * pas.
   */
  imprime?: string;
  /**
   * Variante de `reserve` pour un dossier SYSCOHADA · absente = `reserve` est
   * servie aux deux. Plusieurs réserves étaient rédigées POUR une association
   * et affichées à une entreprise, dont l'une exactement à l'envers : celle du
   * prélèvement sur expatriés laissait entendre à une société que son
   * assujettissement était douteux, alors qu'elle est la cible même du texte.
   */
  reserveSyscohada?: string;
  /**
   * CONDITION DE DÉDUCTIBILITÉ DE L'ARTICLE 20 · ce que le registre sait déjà
   * et qu'il ne disait à personne.
   *
   * Renseigné quand les sommes qui donnent lieu à cette retenue sont une
   * CHARGE de l'entité. La loi n° 23/053, art. 20, dernier alinéa, range
   * parmi les conditions GÉNÉRALES de déductibilité des charges que « la
   * société apporte la preuve de la déclaration et du paiement de la retenue
   * correspondante pour les sommes donnant lieu à un prélèvement ou à une
   * retenue à la source ». Une retenue collectée et non reversée est donc une
   * preuve qui manque, et la charge qu'elle accompagnait devient contestable.
   *
   * Le champ NOMME la charge visée, parce que le registre, lui, ne la connaît
   * pas : le compte de retenue porte la RETENUE, jamais son assiette, et
   * remonter de l'une à l'autre supposerait un taux que ce module s'interdit
   * d'inscrire. Il avertit ; il ne réintègre rien et ne chiffre aucun
   * redressement.
   *
   * Laissé vide là où le lien n'est PAS établi, et le silence est alors
   * voulu : la retenue sur plus-values ne suit aucune charge, la TVA n'est
   * pas une charge, et une cotisation sociale n'est pas un « prélèvement ou
   * une retenue à la source » au sens de ce texte fiscal.
   */
  chargeSousConditionArticle20?: string;
}

/**
 * OBLIGATION PUREMENT DÉCLARATIVE · elle ne porte aucun montant sur un compte,
 * et c'est précisément pour cela qu'elle échappait au logiciel : le registre
 * ne connaissait que ce que la comptabilité crédite.
 *
 * Trois d'entre elles visent directement une association, et elles ne
 * viennent pas du même texte · la date compte, un exercice étant jugé sous le
 * texte qui le régissait. Le relevé TRIMESTRIEL des sommes versées à des tiers
 * (art. 47 de la loi de procédures fiscales, qui nomme les ASBL et les
 * établissements d'utilité publique) est dans sa rédaction de la loi de
 * finances n° 24/011, art. 40. La déclaration ANNUELLE sur les revenus
 * salariaux (art. 22 ter) a été créée par la loi de finances n° 22/071 et
 * seulement MODIFIÉE par la loi de finances n° 25/060. Seule la liste ANNUELLE
 * des fournisseurs (art. 47 ter) est insérée par la loi n° 25/060. Aucune ne
 * se déduit d'un solde de compte ; toutes sont sanctionnées.
 */
export interface ObligationDeclarative {
  cle: string;
  libelle: string;
  periodicite: 'MENSUELLE' | 'TRIMESTRIELLE' | 'ANNUELLE';
  /** Mensuelle ou trimestrielle : jours après la fin de la période. */
  joursApresPeriode?: number;
  /** Annuelle : mois (1-12) et jour de l'échéance, dans l'année qui suit. */
  moisEcheance?: number;
  jourEcheance?: number;
  echeance: string;
  baseLegale: string;
  /** Ce qu'il faut produire · une échéance sans contenu ne sert à rien. */
  contenu: string;
  /** Sanction chiffrée quand le texte en donne une. */
  sanction?: string;
  /** D'où le logiciel peut tirer la matière de la déclaration. */
  sourceDonnees?: string;
  /**
   * Obligation réservée aux PERSONNES PHYSIQUES · l'entreprise individuelle
   * et l'entreprenant. Absent = toutes les formes.
   */
  personnesPhysiquesSeulement?: boolean;
  /**
   * Réserve à servir avec cette obligation QUAND le dossier est une personne
   * physique · voir `obligationsDeclarativesApplicables`. Elle dit ce que
   * l'échéancier ne peut pas trancher, faute de connaître le régime.
   */
  reserveRegimePhysique?: string;
  /**
   * Référentiels concernés · absent = les deux. L'article 47, alinéa 1er ne
   * vise que des entités publiques et non lucratives : une société
   * commerciale privée n'y est PAS tenue, et l'échéancier lui servait
   * pourtant l'obligation et son amende.
   */
  referentiels?: Referentiel[];
  /**
   * Formes juridiques SYSCOHADA que l'obligation NE VISE PAS, nommément.
   *
   * POURQUOI CE CHAMP EXISTE, alors que `referentiels` filtrait déjà. Le
   * référentiel n'est pas la qualité de la personne : SYSCOHADA porte les
   * cinq sociétés commerciales de l'AUSCGIE, mais aussi l'entreprise
   * individuelle et l'entreprenant, qui sont des personnes PHYSIQUES, la
   * succursale, qui n'a pas de personnalité juridique propre, et l'entité
   * publique. Une obligation dont le texte dit « les sociétés » ne se filtre
   * donc pas par le seul référentiel · c'est exactement l'écart relevé à la
   * passe F6 sur le prélèvement des capitaux mobiliers non-résidents, dont le
   * commentaire écrivait en capitales « ELLE NE VISE QUE LES SOCIÉTÉS » et
   * dont le filtre servait l'obligation à tout dossier SYSCOHADA.
   *
   * Miroir de `formesSyscohadaExclues` du planning de clôture, et même mot
   * volontairement : c'est la même idée, elle doit se lire pareil.
   *
   * Sur un dossier dont la forme n'est pas renseignée, on ne retranche rien ·
   * un dossier incomplet n'est pas un dossier exclu.
   */
  formesExclues?: FormeJuridiqueSyscohada[];
  /**
   * Formes SYSCOHADA que l'obligation VISE bien qu'elle soit réservée à un
   * autre référentiel par `referentiels` · le symétrique de `formesExclues`
   * (passe F8). L'art. 47, alinéa 1er nomme « les établissements publics, les
   * organismes semi-publics, les entreprises publiques », tenus au SYSCOHADA
   * sous la forme ENTITE_PUBLIQUE : filtrer par le seul référentiel leur
   * retirait le relevé et son amende.
   */
  formesIncluses?: FormeJuridiqueSyscohada[];
  /** Réserve servie à la forme reçue par `formesIncluses`, et à elle seule. */
  reserveFormesIncluses?: string;
  /** Réserve servie à tout dossier qui reçoit l'obligation. */
  reserveCommune?: string;
  /** Réserve servie aux seuls dossiers SYCEBNL qui reçoivent l'obligation. */
  reserveSycebnl?: string;
  /**
   * L'obligation tombe quand le dossier a DÉCLARÉ ne vendre ni biens ni
   * services (`Tenant.venteBiensServices` à faux). « Pas encore dit » (null)
   * la garde · un fait non déclaré ne masque rien (`tenant/faits-declares.ts`).
   */
  masqueeSiAucuneVente?: boolean;
}

/** Faits du dossier que le filtre des obligations sait lire. */
export interface FaitsDuDossier {
  /** `Tenant.venteBiensServices` · null ou absent = pas encore dit. */
  venteBiensServices?: boolean | null;
}

/**
 * Date de dernière confrontation de ces échéances aux textes encodés
 * (skill `fiscalite-rdc-socle`, `parametres-2026.md`). Affichée à l'écran :
 * une échéance sans date de vérification n'engage personne.
 */
export const DERNIERE_VERIFICATION = '2026-08-29';

/**
 * Un compte relève d'une nature s'il commence par l'une de ses racines et par
 * aucune de ses exclusions · la règle UNE fois, lue par le service et par le
 * spec qui la confronte aux deux plans semés (audit final F115).
 */
export function compteRelevantDe(numero: string, nature: Pick<NatureRetenue, 'comptes' | 'exclusions'>): boolean {
  return nature.comptes.some((p) => numero.startsWith(p)) && !(nature.exclusions ?? []).some((e) => numero.startsWith(e));
}

/**
 * BORNES D'ENTRÉE EN VIGUEUR · les natures du registre n'étaient bornées par
 * aucune date, alors que l'état est servi exercice par exercice et qu'un
 * exercice 2024 ou 2025 s'y affiche comme un autre. Les échéances et les bases
 * servies viennent de textes entrés en vigueur au 1er janvier 2026 · la loi
 * n° 23/053 (art. 153, « après vingt-quatre mois à compter du 31 décembre de
 * l'année de sa promulgation »), la loi n° 23/052 qui modifie la loi de
 * procédures fiscales (art. 6, même formule) et les arrêtés d'application du
 * 19 février 2025 (n° 008, art. 4 ; retenue salariale, art. 5). Le régime
 * antérieur n'est pas au corpus · rien n'est calculé pour lui, la réserve dit
 * seulement que ce qui est servi ne lui est pas opposable. Même parti que la
 * réserve du prélèvement sur les expatriés.
 */
const LIRE_A_LA_DATE =
  " Cet état est servi exercice par exercice · lisez cette réserve à la date de l'exercice affiché.";

export const BORNE_IRPP_SALAIRES =
  "EN VIGUEUR AU 1er JANVIER 2026 · l'impôt sur le revenu des personnes physiques (loi n° 23/053, art. 153), la " +
  "rédaction de l'article 18 de la loi de procédures fiscales issue de la loi n° 23/052 (art. 1er et 6) et l'arrêté " +
  "ministériel du 19 février 2025 sur la perception et le reversement de la retenue sur les revenus salariaux " +
  "(art. 5). SUR UN EXERCICE ANTÉRIEUR, les rémunérations relevaient de l'impôt professionnel (titre IV de " +
  "l'ordonnance-loi n° 69/009, abrogé par l'art. 152 de la loi n° 23/053), qui n'est pas au corpus du logiciel : " +
  "l'échéance et la base servies ici ne lui sont pas opposables." +
  LIRE_A_LA_DATE;

export const BORNE_CAPITAUX_MOBILIERS =
  "EN VIGUEUR AU 1er JANVIER 2026 · la retenue de l'article 120 de la loi n° 23/053 (art. 153), l'article 18 bis " +
  "de la loi de procédures fiscales, inséré par la loi n° 23/052 (art. 2 et 6), et l'arrêté " +
  "n° 008/CAB/MIN/FINANCES/2025 (art. 4). SUR UN EXERCICE ANTÉRIEUR, ces revenus relevaient de l'impôt mobilier " +
  "(titre III de l'ordonnance-loi n° 69/009, abrogé par l'art. 152 de la loi n° 23/053), qui n'est pas au corpus " +
  "du logiciel : l'échéance et la base servies ici ne lui sont pas opposables." +
  LIRE_A_LA_DATE;

export const BORNE_PLUS_VALUES =
  "EN VIGUEUR AU 1er JANVIER 2026 · la retenue de l'article 120 de la loi n° 23/053 (art. 153) et l'article 18 ter " +
  "de la loi de procédures fiscales, inséré par la loi n° 23/052 (art. 2 et 6). SUR UN EXERCICE ANTÉRIEUR, le " +
  "régime des plus-values n'est pas au corpus du logiciel : l'échéance et la base servies ici ne lui sont pas " +
  "opposables." +
  LIRE_A_LA_DATE;

export const BORNE_PRESTATAIRES_NON_RESIDENTS =
  "EN VIGUEUR AU 1er JANVIER 2026 · le taux et l'assiette de l'article 144 de la loi n° 23/053 (art. 153) et la " +
  "rédaction de l'article 22 bis de la loi de procédures fiscales issue de la loi n° 23/052 (art. 1er et 6). " +
  "L'article 22 bis, créé par la loi de finances n° 21/029, existait avant dans une rédaction qui n'est pas au " +
  "corpus du logiciel, pas plus que le texte qui fixait alors le prélèvement : SUR UN EXERCICE ANTÉRIEUR, le taux, " +
  "l'échéance et la base servis ici ne lui sont pas opposables." +
  LIRE_A_LA_DATE;

export const NATURES_RETENUES: NatureRetenue[] = [
  {
    cle: 'irppSalaires',
    libelle: 'IRPP retenu sur les revenus salariaux',
    // 447 « Etat, impôts retenus à la source », subdivisions 4471 Impôt
    // général sur le revenu et 4472 Impôts sur salaires (Partie 2, ch. 3,
    // COMPTE 44).
    comptes: ['4471', '4472'],
    beneficiaire: 'ETAT',
    joursApresPeriode: 15,
    // « Cette déclaration doit être souscrite même si les revenus salariaux et
    // revenus assimilés ne sont pas versés. Dans ce cas, elle porte la mention
    // "Néant" » (art. 18, al. 2) · c'est le mois sans paie qu'une association
    // oublie (passe F7).
    echeance: 'Le 15 du mois suivant le versement des rémunérations · due chaque mois, même sans rémunération versée, avec la mention « Néant » (art. 18, al. 2)',
    // Imprimé lu à la source · « DECLARATION DE LA RETENUE DE L'IMPOT SUR LE
    // REVENU DES PERSONNES PHYSIQUES DANS LA CATEGORIE DE REVENUS SALARIAUX ET
    // REVENUS ASSIMILES (IRPPDR1) », Ministère des Finances. La déclaration est
    // rattachée au MOIS des rémunérations, ce que le registre fait déjà.
    imprime: 'IRPPDR1',
    baseLegale:
      "Article 18 de la loi n° 004/2003 portant réforme des procédures fiscales, tel que modifié par la loi de finances n° 23/056 du 10 décembre 2023, art. 24, et par la loi n° 23/052 du 30 novembre 2023.",
    chargeSousConditionArticle20:
      "Les traitements, salaires et autres rémunérations sur lesquels l'IRPP est retenu (comptes 66). L'article 21 y ajoute d'ailleurs sa propre condition : ces rémunérations ne sont déductibles que si elles ont été imposées à l'IRPP.",
    // LE FORFAIT TRIMESTRIEL DU PERSONNEL DOMESTIQUE ET DES SALARIÉS DE
    // MICRO-ENTREPRISE se crédite sur ce même compte 4472 et ne suit pourtant
    // ni la même périodicité, ni le même régime. Le registre ne peut pas l'en
    // séparer : rien dans un compte ne dit la catégorie du salarié. Il
    // AVERTIT donc, et ne calcule aucune quotité · le forfait est libellé en
    // dollars, et le taux de change du jour du paiement n'est pas ici.
    reserve:
      "PERSONNEL DOMESTIQUE ET SALARIÉS DE MICRO-ENTREPRISES · leurs rémunérations ne suivent PAS ce régime mensuel. " +
      "L'article 70, alinéa 2 de la loi n° 23/053 les impose « suivant les taux forfaitaires fixés par voie d'Arrêté du " +
      "Ministre ayant les Finances dans ses attributions ». " +
      FORFAITS_ARRETE_019_2025 +
      " Cette retenue est en outre LIBÉRATOIRE de l'IRPP pour ces salariés, « pour " +
      "autant que ces rémunérations constituent pour eux des revenus uniques » (art. 121, alinéa 2) : ils n'ont alors " +
      "aucune déclaration à souscrire sur ce revenu. CE QUE LE LOGICIEL NE SAIT PAS · rien dans les comptes 4471 et " +
      "4472 ne distingue ces rémunérations des autres, ne dit si elles sont le revenu unique du bénéficiaire, ni ne " +
      "donne le taux de change à retenir pour convertir un forfait libellé en dollars. Le registre les date donc au 15 " +
      "du mois suivant, comme le reste de la paie, et ne chiffre aucune quotité. Portez la quotité au dernier mois de " +
      "chaque trimestre : l'échéance servie coïncide alors avec celle de l'arrêté. " +
      BORNE_IRPP_SALAIRES,
  },
  {
    // PAS de `chargeSousConditionArticle20` ici, à dessein : le registre ne
    // sait pas quelle charge ces deux contributions accompagnent, et les
    // rattacher aux rémunérations par ressemblance ferait porter à l'écran
    // une affirmation de droit que rien ne fonde. Le silence vaut mieux.
    cle: 'contributions',
    libelle: 'Contribution nationale et contribution nationale de solidarité',
    comptes: ['4473', '4474'],
    beneficiaire: 'ETAT',
    // AUCUN TEXTE NE FONDE CETTE ÉCHÉANCE, et la ligne citait pourtant
    // l'article 18. Quinze jours restent le REPÈRE servi, faute de mieux ;
    // ce qui change, c'est qu'il est désormais annoncé comme tel. Inventer
    // une base légale à un compte est la faute que ce module s'interdit
    // partout ailleurs.
    joursApresPeriode: 15,
    echeance: "Le 15 du mois suivant · repère aligné sur les autres retenues, et non date tirée d'un texte",
    baseLegale:
      "AUCUN PRÉLÈVEMENT DE DROIT CONGOLAIS N'EST IDENTIFIÉ POUR CETTE LIGNE. « Contribution nationale » et " +
      "« contribution nationale de solidarité » sont les intitulés des comptes 4473 et 4474 du plan OHADA, et non des " +
      "impôts : ni l'une ni l'autre n'a d'occurrence dans le code général des impôts compilé au 19 juillet 2026, dans " +
      "la loi n° 004/2003 portant réforme des procédures fiscales, ni dans la loi de finances n° 25/060 du 29 décembre " +
      "2025. L'article 18 de la loi de procédures fiscales, que cette ligne citait, ne vise que les retenues opérées " +
      "par « toute personne physique ou morale qui paye des revenus salariaux et revenus assimilés » : il ne la fonde " +
      "pas.",
    reserve:
      "Si votre dossier mouvemente les comptes 4473 ou 4474, dites au cabinet quel prélèvement ils portent " +
      "réellement, et à quelle échéance : le logiciel ne le devine pas, et il ne servira pas une base légale qu'il ne " +
      "peut pas vérifier. La date affichée ici est un repère, pas une obligation datée par un texte.",
  },
  {
    cle: 'retenueLocative',
    // LE TAUX N'EST PLUS DANS LE LIBELLÉ (passe F11) · l'impôt sur les revenus
    // locatifs est provincial (Constitution, art. 204, 16°), et à Kinshasa la
    // retenue est de 15 % dans les localités des 2e à 4e rangs depuis le
    // 1er janvier 2024. « (20 %) » en tête de ligne faisait retenir cinq points
    // de trop sur chaque loyer payé dans ces localités.
    libelle: 'Retenue sur les revenus locatifs',
    comptes: ['44781'],
    beneficiaire: 'PROVINCE',
    // DIX jours, et non quinze · c'est le seul prélèvement du registre à ne
    // pas suivre l'échéance commune, et le registre le datait pourtant au 15.
    joursApresPeriode: 10,
    echeance: 'Dans les dix jours du mois suivant le paiement du loyer',
    // LES COMPTES SONT CEUX DU LOYER D'IMMEUBLE, PAS LE 622 ENTIER (passe
    // F11). L'O.-L. n° 69/009, art. 4, n'impose que « les revenus provenant de
    // la location des bâtiments et des terrains » ; le 622 porte aussi les
    // matériels (6223) et les emballages (6224, 6225), et le 6221 désignait les
    // seuls terrains. Numéros et intitulés relus aux deux semis (62210000
    // « Locations de terrains », 62220000 « Locations de bâtiments »,
    // 62260000 « Fermages et loyers du foncier », 62280000 « Locations et
    // charges locatives diverses »). Le mobilier et le matériel ne sont pas
    // paraphrasés : l'art. 5 est CITÉ.
    chargeSousConditionArticle20:
      "Les loyers de bâtiments et de terrains versés au bailleur, sur lesquels la retenue est opérée (comptes 6221 " +
      "locations de terrains, 6222 locations de bâtiments, 6226 fermages et loyers du foncier, et la part du 6228 qui " +
      "s'y rapporte). Pour le mobilier et le matériel loués, l'ordonnance-loi n° 69/009, art. 5, écrit : « Le revenu " +
      "brut comprend éventuellement le loyer des meubles, du matériel, de l'outillage, du cheptel et de tous objets " +
      "quelconques. »",
    // TROIS TEXTES, ET LE PLUS FACILE À CONFONDRE EST LE MODIFICATIF. Le
    // décret-loi n° 109/2000 ne PORTE aucun de ces deux articles 11 · il les
    // MODIFIE. Le 20 % appartient à l'art. 11 de la loi n° 83/004, le 22 % à
    // l'art. 11 de l'ordonnance-loi n° 69/009 · deux textes différents, le même
    // numéro d'article, et un lecteur envoyé au 109/2000 n'y trouverait ni l'un
    // ni l'autre. Sixième occurrence du piège « un numéro, deux sens », cette
    // fois sur un numéro d'ARTICLE et non de compte.
    //
    // ET LE 69/009 N'EST ABROGÉ QU'À MOITIÉ · l'art. 152 point 2 de la loi
    // n° 23/053 ne vise que « les dispositions des titres III et IV » (impôt
    // mobilier et impôt professionnel). Le titre II, qui porte l'impôt sur les
    // revenus locatifs, survit, et la loi n° 23/053 exclut d'ailleurs ces
    // revenus des catégories de l'IRPP. Le dire ici plutôt que de laisser un
    // relecteur conclure de l'abrogation partielle que la ligne est morte.
    //
    // LA CITATION EST ENTIÈRE (passes F11 et F8) · elle se refermait sur « du
    // paiement du loyer. », changeait un mot (le texte écrit « de loyer ») et
    // amputait la condition de forme, le relevé conforme au modèle. C'est
    // l'alinéa 4 de l'article 57, qui en compte quatre (compilation DGI au
    // 19 juillet 2026, `19-procedures-titre3-recouvrement.md`, lignes 13 à 27).
    baseLegale:
      "Article 57, alinéa 4, de la loi n° 004/2003 portant réforme des procédures fiscales, modifié par la loi " +
      "n° 23/052 du 30 novembre 2023, art. 1er : « La retenue sur les revenus locatifs est reversée dans les dix " +
      "jours du mois qui suit celui du paiement de loyer, à l'aide d'un relevé conforme au modèle fixé par " +
      "l'Administration des Impôts. » TAUX DES TEXTES NATIONAUX · la retenue est de 20 % du montant brut du loyer " +
      "(article 11 de la loi n° 83/004 du 23 février 1983, tel que modifié et complété par le décret-loi " +
      "n° 109/2000 du 19 juillet 2000) ; c'est un ACOMPTE, imputé sur l'impôt sur les revenus locatifs du bailleur " +
      "(article 13 de la même loi), dont le taux national est de 22 % (article 11 de l'ordonnance-loi n° 69/009, " +
      "titre II, que la loi n° 23/053 n'abroge pas · son art. 152 point 2 ne vise que les titres III et IV). Les " +
      "deux taux ne se confondent pas.",
    // TROIS RÉSERVES, CHACUNE LUE À SA SOURCE (passe F11) · le taux provincial
    // (Constitution, art. 204, 16° ; arrêté kinois n° 015/2023, art. 5 et 8),
    // le guichet (loi n° 83/004, art. 10 · art. 57 LPF · arrêté n° 015/2023,
    // art. 3), et la borne de l'art. 57 dans sa rédaction de 2026 (loi
    // n° 23/052, art. 6), en tension avec la loi n° 83/004, art. 11, toujours
    // imprimée. AUCUN CALCUL DE DATE N'EST CHANGÉ · le registre compte par
    // mois, et le texte antérieur n'est pas au corpus.
    reserve:
      "IMPÔT PROVINCIAL · la Constitution, art. 204, 16°, range « l'impôt sur les revenus locatifs » parmi les " +
      "impôts de la compétence exclusive des provinces, et chaque province en fixe le barème. À KINSHASA, depuis le " +
      "1er janvier 2024 (arrêté provincial n° 015/CAB/MIN.PROV/FIN.ECO/2023 du 7 décembre 2023, art. 5 et 8), la " +
      "retenue est de 20 % et l'impôt de 22 % dans les localités du 1er rang, de 15 % et 17 % dans celles des 2e, " +
      "3e et 4e rangs, « tout loyer confondu ». Le barème des autres provinces n'est pas au corpus du logiciel, qui " +
      "n'applique aucun taux · il lit ce que votre comptabilité porte au compte 44781. GUICHET · la loi n° 83/004, " +
      "art. 10, fait opérer la retenue « au profit du Trésor », et l'art. 57 cité renvoie au modèle « fixé par " +
      "l'Administration des Impôts » ; à Kinshasa, l'arrêté n° 015/2023, art. 3, la fait reverser « au compte Ville " +
      "de Kinshasa/Receveur des Recettes Fiscales », « suivant le modèle établi par la DGRK ». Le service qui la " +
      "perçoit dans les autres provinces n'est pas au corpus · à confirmer auprès de la régie de votre province. " +
      "ÉCHÉANCE · l'art. 57 est cité dans sa rédaction en vigueur depuis le 1er janvier 2026 (loi n° 23/052, art. 1er " +
      "et 6). La loi n° 83/004, art. 11, toujours imprimée dans la compilation, écrit « reversé dans les dix jours " +
      "qui suivent le paiement du loyer », délai plus court ; l'arrêté kinois fixe le dixième jour du mois qui suit " +
      "depuis le 1er janvier 2024. Le registre compte par MOIS et ne date pas au jour du paiement · l'échéance servie " +
      "peut donc être postérieure à celle de l'art. 11, et SUR UN EXERCICE ANTÉRIEUR à 2026 la rédaction alors en " +
      "vigueur de l'art. 57 n'est pas au corpus." +
      LIRE_A_LA_DATE,
    // LE RELEVÉ PAR BAILLEUR (passe F11) · loi n° 83/004, art. 12, § 1, cité,
    // pas reformulé. Aucun modèle n'est inventé : il est celui de
    // l'Administration.
    contenu:
      "Chaque retenue « doit être accompagnée d'un relevé daté et signé ». « Il est établi un relevé par bénéficiaire " +
      "des loyers, quel que soit le nombre de locaux et terrains ou autres biens imposables pris à bail », conforme au " +
      "modèle défini par l'Administration, qui mentionne obligatoirement « le nom ou la dénomination et l'adresse de " +
      "la personne débitrice des loyers qui établit le relevé ; le nom, l'adresse et le numéro d'Identification " +
      "national du bailleur concerné ; l'adresse précise de chaque immeuble pris en location, ainsi que sa surface " +
      "développée et son affectation » (loi n° 83/004, art. 12, § 1).",
    sourceDonnees:
      "Compte 44781 pour les retenues, et la fiche du bailleur dans le plan des tiers pour son nom, son adresse et " +
      "son Numéro Impôt. Le logiciel ne détient ni l'adresse de l'immeuble loué, ni sa surface développée, ni son " +
      "affectation · à reporter sur le relevé à partir du bail.",
  },
  {
    cle: 'prestatairesNonResidents',
    libelle: 'Prélèvement sur les sommes payées aux prestataires non-résidents (14 %)',
    comptes: ['44782'],
    beneficiaire: 'ETAT',
    joursApresPeriode: 15,
    echeance: 'Le 15 du mois suivant',
    baseLegale:
      'Article 144 de la loi n° 23/053 ; article 22 bis de la loi de procédures fiscales. Prélèvement de 14 % du montant brut des factures.',
    chargeSousConditionArticle20:
      "Les sommes payées aux prestataires non-résidents · honoraires, études, services et redevances portés en charges de l'exercice.",
    reserve: BORNE_PRESTATAIRES_NON_RESIDENTS,
  },
  {
    cle: 'prelevementExpatries',
    libelle: 'Prélèvement exceptionnel sur le personnel expatrié (25 %)',
    comptes: ['44783'],
    beneficiaire: 'ETAT',
    joursApresPeriode: 15,
    echeance: 'Dans les quinze jours suivant le mois du versement · due chaque mois, même sans rémunération versée, avec la mention « Néant » (art. 19, al. 2)',
    baseLegale:
      'Articles 145 à 149 de la loi n° 23/053 ; article 19 de la loi de procédures fiscales. Prélèvement de 25 % du brut.',
    // La charge visée est la RÉMUNÉRATION, pas le prélèvement · celui-ci
    // n'est de toute façon jamais déductible (art. 50, 2°), et le module le
    // rappelle déjà en réserve. Les deux règles ne se recouvrent pas.
    chargeSousConditionArticle20:
      "Les rémunérations brutes du personnel expatrié sur lesquelles le prélèvement de 25 % est assis (art. 146). Le prélèvement lui-même n'est pas déductible (art. 50, 2°) : c'est la rémunération qui l'est, et elle relève de la condition de l'article 20.",
    reserve:
      "L'article 145 ne vise que « les entreprises individuelles ou sociétaires », et une ASBL n'est ni l'une ni l'autre : l'assujettissement d'une association à ce prélèvement est une tension du texte, à faire trancher par un conseil et non par ce logiciel. À noter aussi que l'article 147 étend au prélèvement les immunités des articles 64 et 69, et que l'article 50, 2° le rend non déductible.",
    // LA MÊME TENSION, LUE À L'ENVERS. Pour une société, l'article 145 n'a
    // rien d'incertain : « les entreprises individuelles ou sociétaires », ce
    // sont elles. Servir la réserve d'une ASBL à une entreprise lui suggérait
    // de faire trancher un point qui ne se discute pas.
    reserveSyscohada:
      "Prélèvement dû par toute entreprise individuelle ou sociétaire située en RDC employant du personnel expatrié (art. 145), assis sur le montant brut des rémunérations de l'article 68 (art. 146), les exemptions et immunités des articles 64 et 69 s'y appliquant (art. 147). Il est dû lorsque les revenus sont payés ou mis à la disposition de leurs bénéficiaires (art. 149), non lorsque la charge est engagée. Il reste à charge de l'entreprise et n'est pas déductible du bénéfice imposable (art. 50, 2°). SUR UN EXERCICE ANTÉRIEUR au 1er JANVIER 2026, trois règles de l'ordonnance-loi n° 69/007 s'appliquaient encore : le taux réduit du secteur minier, le plancher au SMIG du pays d'origine et l'assimilation des ressortissants des pays limitrophes. Cet état est servi exercice par exercice · lisez cette réserve à la date de l'exercice affiché.",
  },
  {
    cle: 'capitauxMobiliers',
    libelle: 'Retenue sur les revenus de capitaux mobiliers (20 %)',
    comptes: ['44784'],
    beneficiaire: 'ETAT',
    joursApresPeriode: 15,
    echeance: 'Le 15 du mois suivant',
    // DEUX PRÉLÈVEMENTS TOMBENT SUR CE SEUL COMPTE, et la ligne n'en citait
    // qu'un. La loi de finances n° 25/060 du 29 décembre 2025 a créé, par son
    // article 40, un CHAPITRE entier pour les revenus de capitaux mobiliers
    // versés à des non-résidents (art. 149 bis à 149 quinquies). Le taux et
    // l'échéance y sont les mêmes qu'en interne · ce qui diffère est le
    // redevable de la déclaration, et c'est la seule chose que le comptable
    // ne retrouvera pas tout seul.
    //
    // AUCUNE DIFFÉRENCE D'ASSIETTE ENTRE LES DEUX, et il faut le dire parce
    // que la rédaction invite à le croire : l'article 120 renvoie au « montant
    // net du revenu imposable déterminé dans les conditions indiquées à
    // l'article 81 », et l'article 81 détermine ce revenu « par le montant
    // BRUT des dividendes versés » (1.) et « par le montant BRUT des intérêts,
    // arrérages et tous autres produits » (4.). L'article 149 ter dit lui
    // aussi « le montant brut ». Le module ne pose donc aucune distinction de
    // base : il n'y en a pas.
    baseLegale:
      "Article 120 de la loi n° 23/053 ; article 18 bis de la loi de procédures fiscales ; arrêté ministériel " +
      "n° 008/CAB/MIN/FINANCES/2025 du 19 février 2025. LORSQUE LE BÉNÉFICIAIRE EST NON-RÉSIDENT, le prélèvement " +
      "relève d'un autre texte : les articles 149 bis à 149 quinquies de la loi n° 23/053, chapitre créé par la loi de " +
      "finances n° 25/060 du 29 décembre 2025, et la déclaration de l'article 22 quater de la loi de procédures " +
      "fiscales. Même taux de 20 %, même assiette brute et même échéance du 15 du mois suivant, mais deux prélèvements " +
      "distincts et DEUX déclarations.",
    chargeSousConditionArticle20:
      "Les INTÉRÊTS servis (emprunts, comptes courants d'associés) sur lesquels la retenue est opérée · eux seuls sont une charge, et les articles 39 à 41 leur posent en outre leurs propres limites. Un dividende distribué n'est pas une charge : la condition de l'article 20 ne le concerne pas, mais la retenue lui reste due.",
    reserve:
      "Cas réel pour une association qui sert des intérêts sur un emprunt reçu d'un membre. L'intérêt d'un " +
      "PLACEMENT de trésorerie est un revenu du déposant, et la retenue en est opérée par la banque dépositaire, " +
      "débitrice du revenu (loi n° 23/053, art. 78, 2° et art. 120, « opérée par les débiteurs de ces revenus ») · il " +
      "ne se reverse pas depuis ce registre. Le prélèvement sur les revenus versés à des NON-RÉSIDENTS, lui, ne vise que les revenus « versés " +
      "par des sociétés établies en République Démocratique du Congo » (art. 149 ter) et sa déclaration que « les " +
      "sociétés établies en République Démocratique du Congo » (art. 22 quater) : une ASBL n'est pas une société, et " +
      "le logiciel ne sert donc pas cette seconde obligation à un dossier SYCEBNL. Si votre entité verse des revenus " +
      "de capitaux mobiliers à un bénéficiaire établi à l'étranger, faites trancher le point par un conseil · ce " +
      "logiciel ne le tranche pas. " +
      BORNE_CAPITAUX_MOBILIERS,
    reserveSyscohada:
      "Cas réel pour une entreprise qui distribue des dividendes ou qui sert des intérêts à ses associés. L'intérêt " +
      "d'un PLACEMENT de trésorerie est un revenu du déposant · la retenue, quand elle est due, est opérée par la " +
      "banque qui le verse (art. 120, « opérée par les débiteurs de ces revenus »), jamais reversée depuis ce registre. SOCIÉTÉ-MÈRE · une SA ou une SARL qui redistribue au " +
      "titre d'un exercice des produits de participations encaissés le même exercice impute l'impôt que ces " +
      "produits ont supporté sur celui dont elle est redevable (art. 76), à quatre conditions cumulatives · au moins " +
      "25 % du capital de la filiale, sièges en RDC, impôt de la filiale égal au droit commun, titres nominatifs ou " +
      "engagement de conservation de deux ans. Aucune ne se lit dans un compte · OmegaX n'impute rien. CE QUE LE LOGICIEL NE SAIT PAS · le compte 44784 porte la retenue, jamais la " +
      "RÉSIDENCE du bénéficiaire. Il ne peut donc pas dire si ce qui y est crédité relève de la retenue interne de " +
      "l'article 120 ou du prélèvement sur les non-résidents des articles 149 bis à 149 quinquies. Aucun montant ni " +
      "aucune date n'en dépendent · les deux prélèvements sont assis sur le montant brut, au taux de 20 %, et dus le " +
      "15 du mois suivant. Les DÉCLARATIONS, elles, sont deux : ventilez vos versements selon la résidence du " +
      "bénéficiaire avant de déclarer. " +
      BORNE_CAPITAUX_MOBILIERS,
  },
  {
    cle: 'plusValues',
    libelle: 'Retenue sur les plus-values (20 %)',
    comptes: ['44785'],
    beneficiaire: 'ETAT',
    joursApresPeriode: 15,
    echeance: 'Dans les quinze jours suivant le mois de réalisation',
    baseLegale: 'Article 120 de la loi n° 23/053 ; article 18 ter de la loi de procédures fiscales.',
    reserve: BORNE_PLUS_VALUES,
  },
  {
    cle: 'autresRetenues',
    libelle: 'Autres impôts et contributions retenus à la source',
    // Le 4478 non subdivisé · filet pour un dossier qui n'a pas ouvert les
    // sous-comptes ci-dessus. Les exclusions évitent qu'une ligne portée sur
    // 44781 soit comptée deux fois, ici et dans sa nature propre.
    comptes: ['4478'],
    exclusions: ['44781', '44782', '44783', '44784', '44785'],
    beneficiaire: 'ETAT',
    joursApresPeriode: 15,
    echeance: 'Le 15 du mois suivant (échéance commune, à défaut de ventilation)',
    baseLegale: 'Loi de procédures fiscales, articles 18 bis, 18 ter, 19, 22 bis et 57 selon la nature du prélèvement.',
    chargeSousConditionArticle20:
      "Selon ce que le compte porte réellement · loyers, honoraires de non-résidents et rémunérations sont des charges soumises à la condition de l'article 20, la retenue sur plus-values ne suit aucune charge. Ventilez le 4478 sur ses sous-comptes 44781 à 44785 pour que le signalement désigne la bonne charge.",
    reserve:
      "Ce compte regroupe des prélèvements dont les échéances diffèrent (dix jours pour la retenue locative, quinze pour les autres) : tant qu'ils y sont mêlés, le registre les date tous au 15, ce qui est FAUX pour la retenue locative. Ventilez-les sur les sous-comptes 44781 à 44785 pour que chaque échéance soit juste.",
  },
  {
    cle: 'tva',
    libelle: 'TVA due',
    // 444 « Etat, T.V.A. due ou crédit de T.V.A. ». Le registre de TVA
    // proprement dit vit dans le module TVA ; il figure ici parce que
    // l'échéancier doit être complet.
    //
    // 4449 EXCLU · le SYCEBNL ne subdivise pas son 444, mais le plan
    // SYSCOHADA en tire « 4441 État, TVA due » et « 4449 État, crédit de TVA
    // à reporter ». Or ce registre compte les DÉBITS comme des reversements :
    // le 4449 est un compte de CRÉANCE sur l'État, ses débits n'ont jamais
    // été versés à personne, et les inclure minorait la TVA due du montant du
    // crédit reporté · une dette fiscale annoncée plus faible qu'elle n'est.
    //
    // L'exclusion plutôt qu'un `['4441']` par référentiel, à dessein : elle
    // est INERTE en SYCEBNL, dont le plan n'a pas de 4449, et elle couvre
    // encore un dossier SYSCOHADA qui n'aurait pas ouvert son 4441 · ce que
    // `['4441']` seul aurait perdu. Une seule forme pour les deux.
    comptes: ['444'],
    exclusions: ['4449'],
    beneficiaire: 'ETAT',
    joursApresPeriode: 15,
    echeance: 'Le 15 du mois suivant',
    baseLegale: "Ordonnance-loi n° 10/001 du 20 août 2010 instituant la TVA et son décret d'application n° 011/42.",
    // L'ARRÊTÉ N° 007/2025 NE DIT RIEN DE LA TVA, et la réserve lui faisait
    // dire que les deux régimes « s'apprécient séparément ». Il est pris pour
    // la seule exemption d'IS des établissements d'utilité publique et des ONG
    // (art. 1er, en application de l'art. 5, point 5 de la loi n° 23/053), et
    // ses six articles ne nomment pas la TVA. La phrase venait d'une NOTE de
    // la compétence qui commente l'arrêté, pas de l'arrêté · citée comme
    // texte, elle devenait une règle inventée. L'exonération de TVA a sa
    // propre base, l'O.-L. n° 10/001 : art. 15, 2° (ventes et importations
    // des ASBL « lorsque ces opérations présentent un caractère social,
    // sportif, culturel, religieux, éducatif ou philanthropique conforme à
    // leur objet ») et art. 17, 8° (prestations « dans le cadre de leurs
    // activités normales », sans distorsion de concurrence). Et une ASBL
    // n'est exemptée d'IS par aucun arrêté : par l'art. 5, point 3 de la loi.
    reserve:
      "Une ASBL légalement constituée est exonérée de TVA sur ses ventes et importations à caractère social, sportif, " +
      "culturel, religieux, éducatif ou philanthropique conforme à son objet (ordonnance-loi n° 10/001, art. 15, 2°) " +
      "et sur ses prestations effectuées dans le cadre de ses activités normales, lorsque son non-assujettissement " +
      "n'entraîne pas de distorsion de concurrence (même texte, art. 17, 8°). Hors de ces opérations, elle reste " +
      "redevable. L'exemption d'impôt sur les sociétés ne commande pas la TVA : l'ASBL la tient de la loi n° 23/053, " +
      "art. 5, point 3, et l'arrêté n° 007/CAB/MIN/FINANCES/2025, pris pour la seule exemption d'IS des " +
      "établissements d'utilité publique et des ONG (art. 1er), ne traite pas de TVA.",
    reserveSyscohada:
      "L'entreprise est assujettie de plein droit dès qu'elle franchit le seuil de chiffre d'affaires de l'article 14, et le reste tant qu'elle n'en est pas sortie dans les formes. Le solde affiché ici est la TVA DUE seule : le crédit de TVA à reporter (compte 4449) en est exclu, parce que c'est une créance sur l'État et non une dette, et l'y mêler ferait paraître la dette fiscale plus faible qu'elle n'est.",
  },
  {
    cle: 'cnss',
    libelle: 'Cotisations de sécurité sociale (CNSS)',
    // LA CNSS, ET ELLE SEULE (audit final F115) · 431 « Sécurité sociale » et
    // la retraite OBLIGATOIRE, qui est au 4313 au SYSCOHADA (sous 431) et au
    // 4321 au SYCEBNL (sous 432). Le reste du 432 n'est pas la CNSS · le
    // 43200000 du SYSCOHADA est « Caisses de retraite complémentaire », les
    // 4322 et 4328 du SYCEBNL « complémentaire » et « autres », et le 4314 du
    // SYSCOHADA « Caisse de retraite facultative ». Compté ici, chacun était
    // daté au quinze du mois comme une cotisation de la Caisse.
    comptes: ['431', '4321'],
    exclusions: ['4314'],
    beneficiaire: 'ORGANISME_SOCIAL',
    joursApresPeriode: 15,
    echeance: 'Dans les quinze jours suivant le mois civil, déclaration due même sans travailleur',
    baseLegale:
      "Loi n° 16/009 du 15 juillet 2016 (régime général de sécurité sociale) ; décret n° 18/041 du 24 novembre 2018 fixant les taux : prestations aux familles 6,5 % (employeur), pensions 10 % (5 % employeur, 5 % travailleur), risques professionnels 1,5 % (employeur, doublable en cas de non-conformité). Échéances : arrêté ministériel n° 146/2018, article 21 (déclaration) et article 31 (versement), « dans les quinze jours suivant le mois civil » ; article 26 : la déclaration est due même en l'absence de travailleur ; régularisation possible dans les cinq jours.",
    reserve:
      "L'ASSIETTE N'EST PAS LE REVENU IMPOSABLE, ET DEUX TEXTES LE DISENT PLUTÔT QU'UN. L'article 13 de la loi n° 16/009 ROUTE l'assiette hors de la fiscalité : les cotisations « sont assises sur l'ensemble de la rémunération du travailleur assujetti TEL QUE PRÉVU À L'ARTICLE 7, LITERA H, DU CODE DU TRAVAIL ». Et l'arrêté n° 146/2018, article 17, point 1, définit l'« assiette de cotisation du travailleur » en RECOPIANT cette définition, exclusions comprises : ne sont pas éléments de la rémunération les soins de santé, l'indemnité de logement ou le logement en nature, les allocations familiales légales, l'indemnité de transport, les frais de voyage et les avantages accordés exclusivement en vue de faciliter au travailleur l'accomplissement de ses fonctions. CES CINQ EXCLUSIONS SONT INCONDITIONNELLES · leur montant ne change rien, leur nature suffit. C'est ce qui les sépare des immunités de l'article 69 de la loi n° 23/053, qui portent des conditions et des plafonds. LA DÉCLARATION ELLE-MÊME LE PROUVE · le formulaire Mod. DC de l'article 23 porte DEUX colonnes distinctes, le « montant total brut des sommes payées aux travailleurs » (point 5) et le « montant total des sommes payées aux travailleurs QUI SONT PRISES EN CONSIDÉRATION POUR LE CALCUL DES COTISATIONS » (point 6). Si l'assiette était le brut, le point 6 n'aurait pas lieu d'être. NE PAS LA « CORRIGER » SUR UNE SOURCE ÉTRANGÈRE · la règle inverse existe ailleurs et se trouve en premier sur le web. Le Maroc a harmonisé son assiette sociale sur le traitement fiscal des indemnités par l'arrêté n° 1314-25, et le Gabon assied ses cotisations sur le « salaire brut imposable ». Aucun des deux ne régit la RDC. Un plancher au SMIG s'applique (loi, art. 13 in fine ; décret n° 18/041, art. 8). LE SMIG EST CHIFFRÉ · décret n° 25/22 du 30 mai 2025, art. 2 : 21 500 FC par jour pour le travailleur MANŒUVRE ORDINAIRE, soit 559 000 FC par mois en appliquant le multiplicateur 26 de son article 7. Le taux monte ensuite de classe en classe jusqu'à 215 000 FC par jour au dernier échelon du cadre de collaboration, suivant la tension salariale des annexes. SUR QUEL MONTANT S'ASSIED LE PLANCHER, LA QUESTION RESTE OUVERTE, et OmegaX ne la tranche pas : l'article 2 fixe le SMIG à 21 500 FC tandis que l'article 3 échelonne son PAIEMENT (14 500 FC de la paie de mai 2025 à celle de décembre 2025, 21 500 FC ensuite). Les annexes du décret, elles, assoient les allocations familiales et la contre-valeur du logement sur le montant PAYÉ (537,04 FC de mai à décembre 2025, soit 14 500/27) · elles ne disent rien du plancher d'assiette sociale, qui relève d'un autre texte. Le point est à confirmer auprès de la CNSS avant d'en tirer une assiette. LA PAIE D'OMEGAX applique le plancher là où les deux lectures coïncident (à partir de janvier 2026, ou sur une grille saisie par le cabinet), au SMIG des jours payés, et s'abstient sur la CNSS de mai à décembre 2025 quand l'assiette tombe entre les deux. Déclaration mensuelle unique impôts et cotisations au guichet unique (arrêté interministériel du 12 mai 2015) ; télédéclaration obligatoire au-delà de vingt-cinq travailleurs (arrêté n° 146/2018, art. 24).",
  },
  {
    cle: 'inpp',
    libelle: 'Cotisation à la formation professionnelle (INPP)',
    comptes: ['4334'],
    beneficiaire: 'ORGANISME_SOCIAL',
    joursApresPeriode: 15,
    echeance: 'Mensuelle, au plus tard le 15 du mois suivant',
    baseLegale:
      "Arrêté interministériel n° 002/CAB/MET/2025, n° […]/CAB/MIN/FINANCES/2025, n° 003/CAB/VPM/MIN/BUD/2025 du 24 septembre 2025, article 1er : 4 % pour les entreprises et établissements PUBLICS ; pour les entreprises et établissements PRIVÉS, 3,5 % de 1 à 50 travailleurs, 3 % de 51 à 300, 2 % au-delà de 300. L\'assiette est « les rémunérations versées à ses travailleurs ». Son article 3 le fait entrer en vigueur « à la date de sa signature », soit le 24 SEPTEMBRE 2025, et son article 2 abroge celui de 2006. " +
      "JUSQU\'AU 23 SEPTEMBRE 2025, et donc sur tout exercice antérieur : arrêté interministériel n° 12/MTPS/123, n° 007/CAB/MIN/FINANCES/2006, n° 001/CAB/MIN/BUD/2006 du 14 février 2006 (J.O. n° 6 du 15 mars 2006, p. 25-26), article 1er : 3 % pour les entreprises publiques ; 3 % de 1 à 50 travailleurs, 2 % de 51 à 300, 1 % au-delà de 300. Lui aussi entrait en vigueur à la date de sa signature.",
    reserve:
      "DATE D\'EFFET · les deux arrêtés entrent en vigueur À LA DATE DE LEUR SIGNATURE, chacun par son article 3. Un exercice à cheval sur le 24 septembre 2025 porte donc les DEUX barèmes, mois par mois · même discipline que l\'ONEM, dont le taux a changé le lendemain. Avant le 14 février 2006, c\'est l\'arrêté n° 12/MTPS/FIN&BU/064/03 du 28 mars 2003 qui régissait ; son taux n\'est PAS reconstitué ici, le texte n\'ayant pas été lu · seule son existence est attestée, par le visa de celui de 2006. " +
      "NUMÉROTATION · sur l\'original, les trois numéros de l\'arrêté de 2025 sont manuscrits. Celui de l\'Emploi et Travail se lit « 002/CAB/MET/2025 » et celui du Budget « 003/CAB/VPM/MIN/BUD/2025 » ; CELUI DES FINANCES EST ILLISIBLE et n\'est pas restitué. Le citer complet en contentieux demande une vérification au Journal officiel. " +
      "TRANCHE D\'EFFECTIF · le taux dépend d\'abord de la NATURE de l\'employeur (public ou privé), puis, pour le privé seulement, de la tranche d\'effectif · jamais d\'un chiffre d\'affaires ni d\'une masse salariale. La cotisation se calcule dans la paie (fenêtre Personnel), sur la nature de l\'employeur et l\'effectif déclarés, et s\'y abstient tant qu\'ils ne le sont pas. Ce registre, lui, ne recalcule rien : il recense ce que votre comptabilité porte sur le compte 4334 et en date le reversement.",
  },
  {
    cle: 'onem',
    libelle: "Cotisation à l'Office national de l'emploi (ONEM)",
    comptes: ['4335'],
    beneficiaire: 'ORGANISME_SOCIAL',
    joursApresPeriode: 15,
    echeance: 'Mensuelle, au plus tard le 15 du mois suivant',
    baseLegale:
      "Arrêté ministériel n° 028/CAB/MIN.ET/FMM/RK/09/2025, art. 1er : 0,5 % de la rémunération mensuelle payée aux travailleurs, pour tout employeur public, parapublic ou privé, le secteur humanitaire compris (sous réserve des exonérations légales). Déclaration au plus tard le 10 du mois suivant le paiement de la rémunération (art. 2) ; paiement au plus tard le 15 (art. 3).",
    reserve:
      "DATE D'EFFET · les 0,5 % ne valent qu'à partir du 25 septembre 2025, date que porte la mention de signature (« Fait à Kinshasa, le 25 septembre 2025 »), l'art. 10 faisant entrer l'arrêté en vigueur « à la date de sa signature ». RÉSERVE, et elle est dans le texte officiel : son INTITULÉ le date du 24 septembre 2025, sa signature du 25. Un jour d'écart, sans portée sur un exercice civil, mais à confirmer au Journal officiel avant tout usage contentieux. Avant cette date, le taux est de 0,2 % (arrêté ministériel n° 095/CAB/MINETAT/MTEPS/01/2018 du 17 août 2018) · un exercice à cheval sur septembre 2025 porte donc les deux taux. Les arriérés antérieurs non acquittés se recalculent en revanche au nouveau taux (art. 6). SANCTIONS · 50 % de la contribution due en cas de défaut de déclaration ou de déclaration fausse, inexacte ou incomplète (art. 2) ; majoration de retard de 0,5 % PAR JOUR, tout mois commencé compté entier (art. 3). La cotisation se calcule dans la paie (fenêtre Personnel), au taux du mois de paie. Ce registre, lui, ne recalcule rien : il recense ce que votre comptabilité porte sur le compte 4335 et en date le reversement.",
  },
  {
    cle: 'autresOrganismesSociaux',
    libelle: 'Autres organismes sociaux',
    // Les retraites complémentaires et facultatives y viennent (audit final
    // F115) · le 432 hors la retraite obligatoire du SYCEBNL, et le 4314.
    comptes: ['432', '433', '438', '4314'],
    exclusions: ['4321', '4334', '4335'],
    beneficiaire: 'ORGANISME_SOCIAL',
    joursApresPeriode: 15,
    echeance: 'Selon les règles propres à chaque organisme',
    baseLegale: 'Mutuelles, assurances retraite et organismes de santé · conventions propres à chaque organisme.',
  },
];

/**
 * LES OBLIGATIONS DÉCLARATIVES · celles qui ne portent aucun montant sur un
 * compte, et que le registre ne pouvait donc pas voir.
 *
 * ELLES NE VIENNENT PAS TOUTES DU MÊME TEXTE, et l'en-tête l'affirmait à
 * tort. L'article 47 a été modifié par la loi de finances n° 24/011 du
 * 20 décembre 2024, article 40 ; seul l'article 47 ter est de la loi de
 * finances n° 25/060 du 29 décembre 2025, article 30.
 *
 * Et surtout, elles ne visent pas toutes les mêmes redevables :
 *
 *  · art. 47, alinéa 1er · les provinces, les ETD, les services publics, les
 *    établissements publics, les organismes semi-publics, les entreprises
 *    publiques, les ASBL et les établissements d'utilité publique. Une
 *    société commerciale privée n'y est PAS tenue, et le logiciel lui servait
 *    l'obligation avec son amende ;
 *  · art. 47, alinéa 2 · « les entreprises et les associations qui procèdent
 *    au versement des droits d'auteurs ou d'inventeurs », pour les sommes
 *    versées à leurs membres ou mandants · celui-là vise bien les deux ;
 *  · art. 47 ter · « toute personne physique ou morale, soumise à l'impôt sur
 *    les sociétés et à l'impôt sur le revenu des personnes physiques,
 *    exonérée ou non ». « Sans exception » était écrit ici, et c'était trop
 *    dire (passe F8) · la loi n° 23/053 distingue l'EXEMPTION (art. 2, 10°,
 *    dispense de déclaration ET de paiement) de l'EXONÉRATION (11°, dispense
 *    de paiement), exempte l'ASBL (art. 5, 3°), et la loi de procédures
 *    fiscales, art. 3, dispense les exemptés des déclarations. Le texte ne
 *    tranche pas pour une EBNL exemptée · l'obligation lui reste servie, avec
 *    la question écrite (`reserveSycebnl`), plutôt que retirée au jugé ;
 *  · art. 47 bis · les « fabricants, importateurs et toutes entreprises
 *    effectuant des ventes en gros et/ou en demi-gros », qualité qu'aucun livre
 *    ne porte · servie à tout dossier qui n'a pas déclaré ne rien vendre.
 */
/**
 * ACOMPTES PROVISIONNELS · les trois échéances viennent de l'article 57 bis
 * de la loi de procédures fiscales TEL QUE MODIFIÉ par la loi de finances
 * n° 25/060 du 29 décembre 2025.
 *
 * La rédaction de 2023 disait « avant le 1er août, avant le 1er octobre et
 * avant le 1er décembre » : elle est périmée, et c'est elle qu'un praticien
 * risque de citer de mémoire. Le numéro d'article de la loi de finances qui
 * opère la modification n'est PAS repris ici · la source consultée porte une
 * réserve expresse sur sa numérotation, et un numéro faux serait pire qu'une
 * référence par l'intitulé.
 */
const BASE_ACOMPTES =
  "Article 57 bis de la loi de procédures fiscales n° 004/2003, tel que modifié par la loi de finances " +
  'n° 25/060 du 29 décembre 2025 pour l’exercice 2026.';

const SOURCE_ACOMPTES =
  "Impôt déclaré au titre de l'exercice PRÉCÉDENT, augmenté des suppléments établis par l'Administration, ou " +
  "impôt reconstitué d'office à défaut de déclaration · que ces sommes soient contestées ou non. Il ne se lit " +
  "donc dans aucun solde de compte de l'exercice en cours.";

/**
 * LES DEUX FORMES SYSCOHADA QUI SONT DES PERSONNES PHYSIQUES, et la liste vit
 * UNE FOIS · commerçant personne physique (AUDCG art. 2 et 13) et entreprenant
 * (art. 30). Elles ne sont pas redevables de l'impôt sur les sociétés mais de
 * l'IRPP (loi n° 23/053, art. 1er et art. 2, 17°, a)), et leur calendrier de
 * paiement dépend d'un RÉGIME que ce module ne détermine pas.
 *
 * Exportée depuis la passe F9 · le module de facturation en écrivait une
 * seconde, à la main, qui avait oublié l'entreprenant et annonçait donc
 * 750.000 FC au lieu de 250.000 sur l'amende de l'art. 97 bis.
 *
 * DEUX BLOCS EMPILÉS, dont TypeScript n'attachait que le second : le premier
 * portait la règle de fond et ne parvenait ni à l'éditeur ni à la
 * documentation engendrée. Fusionnés à la passe F6.
 */
export const FORMES_PERSONNES_PHYSIQUES: FormeJuridiqueSyscohada[] = [
  FormeJuridiqueSyscohada.ENTREPRISE_INDIVIDUELLE,
  FormeJuridiqueSyscohada.ENTREPRENANT,
];
// Déclarée AVANT `OBLIGATIONS_DECLARATIVES`, qui s'en sert dans son littéral :
// une const de bloc lue au chargement du module ne se hisse pas.

/**
 * AMENDE DE L'ARTICLE 94 · elle n'est plus un montant unique, et le registre
 * servait l'ancienne rédaction.
 *
 * Le texte en vigueur est l'article 94 de la loi n° 004/2003 « (modifié par
 * l'O.-L. n° 13/005 du 23 février 2013, par la L.F. n° 22/071 du 28 décembre
 * 2022 et par la L.F. n° 23/056 du 10 décembre 2023, art. 29) » : « L'absence
 * d'une déclaration ne servant pas au calcul de l'impôt est sanctionnée par
 * une amende de : - 5.000.000,00 Francs congolais pour les grandes
 * entreprises ; - 2.500.000,00 Francs congolais pour les moyennes entreprises
 * et les associations sans but lucratif ; - 250.000,00 Francs congolais pour
 * les entreprises de petite taille. Il faut entendre notamment par
 * déclaration ne servant pas au calcul de l'impôt : - le relevé trimestriel
 * des sommes versées aux tiers ; - la déclaration prévue à l'article 2 de la
 * présente Loi. » (compilation DGI au 19 juillet 2026,
 * `20-procedures-titre4-sanctions-fiscales-penales.md`, lignes 194 à 206.)
 *
 * Les 500 000 FC affichés jusqu'ici sont ceux de la rédaction ANTÉRIEURE à la
 * loi de finances n° 23/056, périmée depuis le 1er janvier 2024. Ils étaient
 * cinq fois trop bas pour une association et deux fois trop hauts pour une
 * entreprise de petite taille · c'est-à-dire faux dans les deux sens, et sur
 * le seul chiffre qui décide un trésorier à déposer ou à remettre à plus tard.
 *
 * LA TAILLE DE L'ENTITÉ N'EST PAS DANS LE LOGICIEL · il ne choisit donc aucun
 * des trois montants et sert la grille entière. Choisir aurait supposé un
 * classement (grande, moyenne, petite entreprise) qui relève de
 * l'Administration, pas d'une base de données comptable.
 */
const SANCTION_ARTICLE_94 =
  "Amende pour absence d'une déclaration ne servant pas au calcul de l'impôt, GRADUÉE PAR TAILLE depuis l'article 29 " +
  'de la loi de finances n° 23/056 du 10 décembre 2023 : 5 000 000 de francs congolais pour les grandes entreprises, ' +
  '2 500 000 pour les moyennes entreprises et les associations sans but lucratif, 250 000 pour les entreprises de ' +
  "petite taille (article 94 de la loi de procédures fiscales, qui range nommément « le relevé trimestriel des sommes " +
  "versées aux tiers » parmi ces déclarations). Le logiciel ne connaît pas la taille de votre entité : il ne choisit " +
  'pas le montant à votre place.';

const CONTENU_ACOMPTE = (quotite: string) =>
  `Versement de ${quotite} de l'impôt de référence, au moyen du bordereau de versement d'acomptes ` +
  "provisionnels dont le modèle est défini par l'Administration des Impôts.";


/**
 * L'ARRÊTÉ DE L'ARTICLE 14 · la certification a ses « conditions définies par
 * Arrêté du Ministre », et l'échéancier les taisait (passe D3).
 *
 * Arrêté ministériel n° 014/CAB/MIN/FINANCES/2023 du 16 mai 2023 (compilation
 * DGI au 19 juillet 2026, `23-mesures-execution-controle.md`, lignes 184 à
 * 505). Il sert un lecteur qui est précisément un cabinet qui TIENT les
 * comptes, et c'est la personne que son art. 5 écarte · lire « inscrit au
 * tableau » sans la condition d'indépendance le laissait se croire habilité.
 *
 * CE QUI N'EST PAS TRANCHÉ, ET QUI SE DIT. (1) L'art. 7, al. 2 déroge « à
 * l'article 5 » pour les entités non astreintes à un commissaire aux comptes,
 * c'est-à-dire la plupart des SARL · lu à la lettre, il lève l'incompatibilité
 * pour elles ; et son al. 3 fait certifier les cabinets comptables par
 * eux-mêmes. Servir l'incompatibilité à tout dossier du Système normal serait
 * une règle que le texte écarte lui-même (§ 10 bis). (2) L'arrêté est pris
 * pour l'IBP (art. 1er), et aucun arrêté d'application de l'art. 14 postérieur
 * au passage à l'impôt sur les sociétés n'est au corpus. (3) Il vaut « à
 * compter de l'exercice fiscal 2024/revenus 2023 » (art. 28).
 */
const RESERVE_ARRETE_CERTIFICATION =
  "CERTIFICATION · arrêté ministériel n° 014/CAB/MIN/FINANCES/2023 du 16 mai 2023, applicable « à compter de " +
  "l'exercice fiscal 2024/revenus 2023 » (art. 28). Il a été pris pour l'impôt sur les bénéfices et profits " +
  "(art. 1er), et aucun arrêté d'application de l'article 14 postérieur au passage à l'impôt sur les sociétés n'est " +
  "au corpus du logiciel. Son article 7, alinéa 2 écrit : « Par dérogation à l'article 5 du présent Arrêté, les " +
  "entités non astreintes, par les Actes uniformes, à la nomination d'un ou des plusieurs commissaires aux comptes " +
  "doivent désigner pour un mandat de six (6) ans renouvelables un expert-comptable pour certifier leurs états " +
  "financiers », et son alinéa 3 que « les Cabinets comptables non astreints [...] certifient eux-mêmes leurs états " +
  "financiers » · la portée de cette dérogation sur l'incompatibilité de l'article 5 n'est pas tranchée ici. Pour " +
  "une entité astreinte à un commissaire aux comptes, c'est lui qui certifie (art. 6).";

export const OBLIGATIONS_DECLARATIVES: ObligationDeclarative[] = [
  {
    // La DÉCLARATION ONEM (le 10) est distincte du PAIEMENT (le 15, porté par
    // la nature `onem` ci-dessus). Deux dates, deux sanctions : 50 % de la
    // contribution pour la déclaration manquante ou inexacte, 0,5 % par jour
    // pour le versement en retard. Les confondre en une seule échéance
    // laisserait croire qu'être à jour du paiement suffit.
    cle: 'declarationMensuelleOnem',
    libelle: "Déclaration mensuelle de la contribution patronale ONEM",
    periodicite: 'MENSUELLE',
    joursApresPeriode: 10,
    echeance: 'Au plus tard le 10 du mois suivant le paiement de la rémunération',
    baseLegale:
      "Article 2 de l'arrêté ministériel n° 028/CAB/MIN.ET/FMM/RK/09/2025 (date, voir la réserve portée sur la contribution ONEM).",
    contenu:
      "Déclaration de la rémunération mensuelle payée aux travailleurs et de la contribution de 0,5 % qui en découle. Elle figure comme ligne dédiée de la Déclaration mensuelle unique du guichet unique (DGI, ONEM, INPP, CNSS), aux côtés de l'IRPP, de l'INPP et de la CNSS.",
    sanction:
      "50 % du montant de la contribution due en cas de défaut de déclaration ou de déclaration fausse, inexacte ou incomplète (art. 2). Le versement tardif, lui, subit une majoration de 0,5 % par jour, tout mois commencé compté entier (art. 3).",
    sourceDonnees: 'Comptes 66 (charges de personnel) pour l’assiette, et 4335 pour la contribution due.',
  },
  /*
    LA DÉCLARATION QUE LA LOI DE FINANCES 25/060 A CRÉÉE ET QUE LE MODULE
    N'AVAIT PAS VUE · le prélèvement sur les revenus de capitaux mobiliers
    versés à des non-résidents.

    Elle entre ici, parmi les obligations purement déclaratives, et non parmi
    les natures de retenue, parce que le logiciel ne peut PAS l'isoler d'un
    solde de compte : le 44784 porte la retenue, jamais la résidence du
    bénéficiaire. Lui ouvrir une nature reviendrait à afficher une ligne
    éternellement vide, ou pire, à couper en deux un solde que rien ne permet
    de partager. L'échéance et le contenu, eux, sont sûrs · ils suffisent à
    rappeler la déclaration à qui la doit.

    ELLE NE VISE QUE LES SOCIÉTÉS · l'article 149 ter parle des revenus
    « versés par des sociétés établies en République Démocratique du Congo »
    et l'article 22 quater des « sociétés établies en République Démocratique
    du Congo qui paient » ces revenus. Une ASBL n'est ni l'une ni l'autre :
    l'obligation est donc réservée au référentiel SYSCOHADA, comme les quatre
    échéances de l'impôt sur les sociétés.

    AUCUNE SANCTION N'EST PORTÉE ICI, à dessein : l'article 94 ne frappe que
    les déclarations « ne servant pas au calcul de l'impôt », et celle-ci sert
    au calcul du prélèvement et s'accompagne de son paiement. Chiffrer une
    amende par ressemblance serait une devinette.
  */
  {
    cle: 'prelevementCapitauxMobiliersNonResidents',
    libelle: 'Déclaration du prélèvement sur les revenus de capitaux mobiliers versés à des non-résidents (20 %)',
    periodicite: 'MENSUELLE',
    joursApresPeriode: 15,
    echeance: 'Au plus tard le 15 du mois qui suit le paiement des revenus ou leur mise à disposition',
    baseLegale:
      "Article 22 quater de la loi de procédures fiscales, inséré par la loi de finances n° 25/060 du 29 décembre " +
      "2025, articles 38 et 39 : « Les sociétés établies en République Démocratique du Congo qui paient des revenus " +
      "des capitaux mobiliers versés à des personnes non-résidentes sont tenues de souscrire une déclaration, au plus " +
      "tard le quinze du mois qui suit celui du paiement de ces revenus aux bénéficiaires ou de leur mise à " +
      "disposition. » Le prélèvement lui-même vient des articles 149 bis à 149 quinquies de la loi n° 23/053, " +
      "chapitre 3 créé par l'article 40 de la même loi de finances : il est assis sur « le montant brut des sommes " +
      "payées ou mises à la disposition de leurs bénéficiaires » (art. 149 ter), au taux de « 20 % du montant brut des " +
      "revenus versés » (art. 149 quater), et il est dû « au moment du paiement ou de la mise à disposition des " +
      "revenus » (art. 149 quinquies). NOTA · la loi de finances a numéroté « 22 quater » deux articles distincts, " +
      "par ses articles 23 et 39 ; celui qui fonde cette déclaration est le second.",
    contenu:
      "Déclaration des revenus de capitaux mobiliers versés à des personnes non-résidentes et du prélèvement de 20 % " +
      "correspondant, accompagnée de son paiement, à souscrire auprès du service gestionnaire de la société.",
    sourceDonnees:
      "Compte 44784 pour le prélèvement, et les dividendes et intérêts servis pour l'assiette. LE LOGICIEL NE PEUT " +
      "PAS ISOLER CETTE PART : un compte de retenue porte le montant retenu, jamais la résidence du bénéficiaire · " +
      "c'est à vous de ventiler vos versements avant de déclarer. RÉSERVE DE CHAMP · le texte dit « les sociétés » : " +
      "l'entreprise individuelle et l'entreprenant sont écartés de cette obligation, qui ne leur est plus servie. " +
      "Pour une SUCCURSALE et pour une ENTITÉ PUBLIQUE, aucun texte lu ne tranche, et l'obligation reste affichée " +
      "plutôt que retirée au jugé · à faire trancher par un conseil. Ne lisez pas cette exclusion comme une " +
      "dispense générale : la retenue INTERNE de 20 % sur les revenus de capitaux mobiliers (art. 120 de la même " +
      "loi) est une autre obligation, qui a sa propre ligne dans cet état.",
    referentiels: [Referentiel.SYSCOHADA],
    // LE RAISONNEMENT ÉTAIT JUSTE ET LE FILTRE PLUS LARGE QUE LUI. Le
    // commentaire ci-dessus conclut « ELLE NE VISE QUE LES SOCIÉTÉS » et
    // n'en tirait que l'exclusion de l'ASBL, par le référentiel. Or le
    // référentiel SYSCOHADA porte aussi l'entreprise individuelle et
    // l'entreprenant, qui sont des commerçants PERSONNES PHYSIQUES (AUDCG
    // art. 2, 13 et 30) et pas davantage des sociétés qu'une ASBL. Le même
    // argument les écarte, et il n'était pas appliqué.
    //
    // CE QUI EST EXCLU, ET CE QUI NE L'EST PAS. Les deux personnes physiques
    // le sont avec certitude. La SUCCURSALE ne l'est pas : elle n'a pas de
    // personnalité juridique propre (AUSCGIE art. 116 à 118) et le payeur
    // réel est la société dont elle est l'établissement. L'ENTITÉ PUBLIQUE
    // non plus : aucun texte lu ne dit si elle entre ou non dans « les
    // sociétés » de l'art. 149 ter, et deviner dans un sens comme dans
    // l'autre serait inventer. Les deux restent servies, et la réserve le dit.
    formesExclues: FORMES_PERSONNES_PHYSIQUES,
  },
  {
    cle: 'releveTrimestrielTiers',
    libelle: 'Relevé des sommes versées à des tiers (hors salaires)',
    periodicite: 'TRIMESTRIELLE',
    joursApresPeriode: 10,
    echeance: 'Dans les dix jours suivant la fin de chaque trimestre',
    baseLegale:
      "Article 47, alinéa 1er, de la loi n° 004/2003 portant réforme des procédures fiscales, tel que modifié par la loi de finances n° 24/011 du 20 décembre 2024, article 40. Il vise nommément les associations sans but lucratif et les établissements d'utilité publique.",
    contenu:
      'Relevé, sur support papier ET numérique, de « toutes les sommes versées à des tiers, à quelque titre que ce soit, à l’exclusion des salaires », notamment honoraires, commissions, courtages, ristournes, vacations, droits d’auteur, loyers. Le modèle du relevé est fixé par l’Administration des Impôts.',
    // L'article 94 nomme les associations sans but lucratif : 2 500 000 FC.
    // La grille entière reste affichée parce que le SYCEBNL couvre aussi des
    // entités qui ne sont pas des ASBL (fondations, ordres professionnels,
    // projets), que l'entité publique du SYSCOHADA la reçoit aussi, et que le
    // logiciel ne sait pas quelle taille il a devant lui.
    sanction: SANCTION_ARTICLE_94,
    // LE 481 EST UN FOURNISSEUR COMME LE 40 (passe F8) · le texte vise
    // « toutes les sommes versées à des tiers, à quelque titre que ce soit »,
    // et celui qui vend une immobilisation en est un. Jumeau exact de la
    // correction F13 de la liste de l'art. 47 ter, qui ne l'avait pas suivi.
    // Le 481 est ouvert aux deux semis sous « Fournisseurs d'investissements ».
    sourceDonnees:
      "Comptes de tiers 40 (fournisseurs), 481 (fournisseurs d'investissements) et 47 (débiteurs et créditeurs divers), et charges des comptes 62-63 (services extérieurs) et 65. Celui qui vend une immobilisation est un tiers à qui une somme est versée : le relevé tiré des seuls 40 et 47 l'omettrait.",
    // L'alinéa 1er énumère limitativement des entités publiques et non
    // lucratives. Une société commerciale privée n'y figure pas · c'est
    // l'alinéa 2 qui peut l'atteindre, et seulement pour les droits d'auteurs
    // ou d'inventeurs.
    //
    // LE LOGICIEL CONNAÎT LA FORME PUBLIQUE (passe F8), et le commentaire qui
    // écrivait le contraire était périmé · `obligationsDeclarativesApplicables`
    // reçoit déjà `formeJuridiqueSyscohada`. La forme ENTITE_PUBLIQUE (AUDCIF
    // art. 2) reçoit donc le relevé ; les sociétés privées, rien de plus.
    referentiels: [Referentiel.SYCEBNL],
    formesIncluses: [FormeJuridiqueSyscohada.ENTITE_PUBLIQUE],
    // L'ÉCONOMIE MIXTE N'EST PAS NOMMÉE PAR L'ALINÉA 1er, et la forme la
    // couvre · l'art. 48 la nomme à part (« les entreprises publiques ou
    // d'économie mixte »), ce qui dit que le législateur sait l'écrire quand il
    // la veut. Rien n'est tranché, la qualité se confirme.
    reserveFormesIncluses:
      "La forme « entité publique » du dossier couvre aussi les entités parapubliques et d'économie mixte (AUDCIF, " +
      "art. 2). L'article 47, alinéa 1er, nomme « les établissements publics, les organismes semi-publics, les " +
      "entreprises publiques » et pas l'économie mixte, que l'article 48 de la même loi nomme à part (« les " +
      "entreprises publiques ou d'économie mixte »). Confirmez la qualité de l'entité avant de tenir le relevé pour dû.",
  },
  {
    cle: 'releveTrimestrielDroitsAuteur',
    libelle: 'Relevé trimestriel des droits d’auteurs ou d’inventeurs versés aux membres ou mandants',
    periodicite: 'TRIMESTRIELLE',
    joursApresPeriode: 10,
    echeance: 'Dans les dix jours suivant la fin de chaque trimestre',
    baseLegale:
      "Article 47, alinéa 2, de la loi n° 004/2003 portant réforme des procédures fiscales, tel que modifié par la loi de finances n° 24/011 du 20 décembre 2024, article 40.",
    contenu:
      'Relevé des sommes versées à ses membres ou mandants au titre des droits d’auteurs ou d’inventeurs, dans les mêmes conditions et sur les mêmes supports que le relevé de l’alinéa 1er.',
    sanction: SANCTION_ARTICLE_94,
    sourceDonnees:
      'Comptes de redevances et de droits versés, et comptes de tiers 40 et 47 pour les bénéficiaires.',
    // Celui-là vise « les entreprises ET les associations » : il n'est donc
    // filtré pour personne. Il est posé à part parce que son ASSIETTE est
    // beaucoup plus étroite que celle de l'alinéa 1er · les fondre en une
    // ligne aurait annoncé à une entreprise un relevé de toutes ses sommes
    // versées à des tiers.
  },
  /*
    L'IMPÔT PROPRE DE L'ENTITÉ, QUE L'ÉCHÉANCIER OMETTAIT.

    Le registre et l'échéancier ont été bâtis pour une ASBL, exemptée d'impôt
    sur les sociétés (loi n° 23/053, art. 5). Servis à une société commerciale,
    ils énuméraient scrupuleusement tout ce qu'elle retient POUR AUTRUI, et
    passaient sous silence les quatre échéances de son impôt principal.

    Ces quatre-là sont des obligations DÉCLARATIVES et non des retenues : leur
    montant ne se lit dans aucun solde de compte. L'IS se liquide sur le
    résultat fiscal (fenêtre État > Résultat fiscal), les acomptes se calculent
    sur l'impôt de l'exercice PRÉCÉDENT · aucun des deux n'est déductible d'une
    balance. Elles entrent donc ici, où une échéance sans montant reste une
    échéance, et non dans les natures de retenue, qui lisent un crédit de
    compte et n'ont d'ailleurs qu'une périodicité mensuelle.
  */
  {
    cle: 'declarationImpotSocietes',
    libelle: 'Déclaration de l’impôt sur les sociétés',
    periodicite: 'ANNUELLE',
    moisEcheance: 4,
    jourEcheance: 30,
    echeance: "Au plus tard le 30 avril de l'année qui suit celle de la réalisation des revenus",
    baseLegale:
      "Article 12 de la loi de procédures fiscales n° 004/2003, modifié par la loi n° 23/052 du 30 novembre 2023 " +
      'et par la loi de finances n° 25/060 du 29 décembre 2025 : « Le redevable de l’impôt sur les sociétés est ' +
      'tenu de souscrire chaque année, au plus tard le 30 avril de l’année qui suit celle de la réalisation des ' +
      'revenus, une déclaration de ses revenus. » L’alinéa 2, ajouté en 2025, permet à l’Administration de ' +
      'communiquer les informations dont elle dispose, mais « la responsabilité de la déclaration et du calcul de ' +
      'l’impôt demeure entièrement à la charge du contribuable ».',
    // Art. 13 al. 1 et art. 14 · les états et leur certification ne visent que
    // le SYSTÈME NORMAL ; le relevé de l'al. 3 et le dépôt en cas de perte
    // (art. 15) valent pour tout déclarant ; l'art. 16 avance l'échéance en
    // cas de dissolution ou de cessation (passe F7).
    contenu:
      "Déclaration auto-liquidative des revenus de l'exercice, contresignée par le conseil ou le comptable du redevable " +
      "(art. 13, al. 2). Pour une entreprise relevant du Système normal, elle est appuyée du bilan, du compte de " +
      "résultat, du tableau des flux de trésorerie, du tableau de variation des capitaux propres et des notes annexes " +
      "(art. 13, al. 1er), certifiés « par un expert-comptable inscrit au tableau de l'Ordre national des " +
      "experts-comptables, dans les conditions définies par Arrêté du Ministre » (art. 14). Cet arrêté, n° 014 du " +
      "16 mai 2023, veut un certificateur INDÉPENDANT : « La mission de certification des états financiers est " +
      "incompatible avec celle d'assistance comptable et/ou fiscale. La certification ne peut être délivrée que par un " +
      "Expert-comptable indépendant de l'entité établissant les états financiers » (art. 5) ; celle d'« un membre non " +
      "indépendant » est irrégulière et « assimilée à un refus de certification » (art. 14) ; et la NON-DÉSIGNATION du " +
      "certificateur est « considéré[e] comme un refus », qui fait l'objet « d'une taxation d'office pour comptabilité " +
      "irrégulière au sens de l'article 41 » de la loi n° 004/2003 (art. 15). Au 30 avril, la recevabilité est " +
      "subordonnée à « l'attestation de certification » revêtue du « timbre spécial ou hologramme » (art. 20 et 22) ; " +
      "le rapport de certification est adressé à la DGI « par le commissaire aux comptes ou l'expert-comptable » avant " +
      "le 30 juin (art. 13). Tout déclarant y joint le relevé récapitulatif des ventes faites aux « commerçants » ou « fabricants » " +
      "(art. 13, al. 3), et la dépose même en cas de perte (art. 15). En cas de dissolution, de liquidation ou de " +
      "cessation, elle se remet dans le mois, avant le départ du dirigeant (art. 16). Le SOLDE de l'impôt se paie au même " +
      "moment : les trois acomptes « sont à déduire de l'impôt dû par le contribuable pour l'exercice fiscal " +
      "considéré, le solde éventuel de cet impôt devant être versé au moment du dépôt de la déclaration y " +
      "afférente » (art. 57 bis, al. 3). Le 30 avril est donc aussi une échéance de paiement.",
    sourceDonnees:
      "Résultat fiscal de la fenêtre État > Résultat fiscal et impôt sur les bénéfices, et liasse de la fenêtre États financiers.",
    referentiels: [Referentiel.SYSCOHADA],
    // Une personne physique n'est pas redevable de l'IS · sa déclaration est
    // celle de l'IRPP (art. 17), ci-dessous (passe F7).
    formesExclues: FORMES_PERSONNES_PHYSIQUES,
    reserveCommune: RESERVE_ARRETE_CERTIFICATION,
  },
  /*
    LA DÉSIGNATION DU CERTIFICATEUR · une obligation de l'ENTITÉ, datée, et
    muette jusqu'ici (passe D3). Arrêté n° 014 du 16 mai 2023, art. 4 et 8 ;
    la non-désignation vaut refus et taxation d'office (art. 15).

    LE RAPPORT DU 30 JUIN N'EST PAS SERVI COMME OBLIGATION DE L'ENTITÉ · l'art. 13
    le fait adresser à la DGI « par le commissaire aux comptes ou
    l'expert-comptable ». La norme ONEC n° 2024/001, § 15, le fait transmettre
    par l'entreprise, mais elle lie les membres de l'Ordre, pas les
    contribuables · la créer ici trancherait l'anomalie en faveur du texte
    inférieur, et servirait l'obligation d'un tiers (même faute que le PV
    d'assemblée corrigé en F13). L'anomalie est dite en réserve.

    « AVANT LE 30 JUIN » · le dernier jour du délai est le 29 juin, que le
    report de l'art. 110 bis, al. 2 traite comme toute échéance.

    Mêmes filtres que la déclaration d'impôt sur les sociétés.
  */
  {
    cle: 'designationCertificateur',
    libelle: 'Désignation de l’expert-comptable certificateur des états financiers',
    periodicite: 'ANNUELLE',
    moisEcheance: 6,
    jourEcheance: 29,
    echeance: 'Avant le 30 juin de chaque année',
    baseLegale:
      "Arrêté ministériel n° 014/CAB/MIN/FINANCES/2023 du 16 mai 2023, pris pour l'application de l'article 14 de la " +
      "loi n° 004/2003 : « Tout contribuable a l'obligation de désigner avant le 30 juin de chaque année un " +
      "expert-comptable ou une société d'expertise comptable inscrit au tableau de l'ONEC pour certifier ses états " +
      "financiers » (art. 4) ; « Toutes les entités n'ayant pas désigné des commissaires aux comptes, des " +
      "experts-comptables ou des sociétés d'expertise comptable doivent les désigner avant le 30 juin de l'année en " +
      "cours » (art. 8).",
    contenu:
      "Désignation de l'expert-comptable ou de la société d'expertise comptable inscrit au tableau de l'ONEC qui " +
      "certifiera les états financiers joints à la déclaration du 30 avril. Il doit être « indépendant de l'entité " +
      "établissant les états financiers » (art. 5) · voir la déclaration de l'impôt sur les sociétés. Pour une entité " +
      "astreinte à un commissaire aux comptes, c'est lui qui certifie (art. 6).",
    sanction:
      "« Est considéré comme un refus de faire certifier ses états financiers, la non désignation par l'entité [...] " +
      "d'un commissaire aux comptes ou d'un expert-comptable » : taxation d'office pour comptabilité irrégulière au " +
      "sens de l'article 41 de la loi n° 004/2003 (arrêté n° 014, art. 15). Aucun montant n'est chiffré ici.",
    sourceDonnees:
      "Aucun livre ne porte cette désignation · le module Mandat du contrôleur des comptes ne tient que le " +
      "contrôleur légal.",
    referentiels: [Referentiel.SYSCOHADA],
    formesExclues: FORMES_PERSONNES_PHYSIQUES,
    reserveCommune:
      "Deux points que le texte ne concilie pas, et que le logiciel ne tranche pas. « Chaque année » (art. 4) contre " +
      "un mandat « de six (6) ans renouvelables » (art. 7) · une désignation pluriannuelle en cours satisfait-elle " +
      "l'obligation annuelle, le texte ne le dit pas. Et le rapport de certification, que l'article 13 fait adresser " +
      "à la DGI « par le commissaire aux comptes ou l'expert-comptable » avant le 30 juin, la norme professionnelle " +
      "ONEC n° 2024/001, § 15, le fait transmettre par l'entreprise. L'arrêté ne vise que « les entités soumises au " +
      "régime fiscal de droit commun » (art. 2), et l'article 14 de la loi n° 004/2003 que les états des entreprises " +
      "relevant du système normal. " +
      RESERVE_ARRETE_CERTIFICATION,
  },
  {
    cle: 'declarationIrpp',
    libelle: 'Déclaration annuelle de l’impôt sur le revenu des personnes physiques',
    periodicite: 'ANNUELLE',
    moisEcheance: 4,
    jourEcheance: 30,
    echeance: "Au plus tard le 30 avril de l'année qui suit celle de la réalisation des revenus",
    baseLegale:
      "Article 17 de la loi de procédures fiscales n° 004/2003, modifié par la loi n° 23/052 du 30 novembre 2023 " +
      'et par la loi de finances n° 25/060 du 29 décembre 2025, art. 20 : « Les personnes physiques soumises à ' +
      'l’Impôt sur le Revenu des Personnes Physiques sont tenues de souscrire chaque année, au plus tard le 30 avril ' +
      'de l’année qui suit celle de la réalisation des revenus, au Service de l’Administration des Impôts du lieu de ' +
      'leur résidence, une déclaration de leurs revenus. »',
    contenu:
      "Déclaration des revenus de l'année, au service du lieu de résidence. Pour une personne relevant du Système " +
      "normal et réalisant des bénéfices industriels, commerciaux, immobiliers, artisanaux, non commerciaux ou " +
      "agricoles, elle porte les mêmes annexes que celles de l'article 13, est contresignée par le conseil ou le " +
      "comptable, et s'accompagne du relevé récapitulatif des ventes aux « commerçants » ou « fabricants » (art. 17, " +
      "al. 2 et 3). En cas de cessation, elle se remet dans le mois (art. 16).",
    sourceDonnees:
      "Résultat fiscal de la fenêtre État > Résultat fiscal et impôt sur les bénéfices, et liasse de la fenêtre États financiers.",
    referentiels: [Referentiel.SYSCOHADA],
    personnesPhysiquesSeulement: true,
    // PASSE F8 · au régime des petites entreprises, l'art. 57 quater, al. 2
    // attache la première quotité à « la souscription de la déclaration auto
    // liquidative, au plus tard le 31 janvier ». La tension avec le 30 avril
    // de l'art. 17 est NOMMÉE, jamais tranchée, et aucune date ne bouge.
    reserveRegimePhysique:
      "Au RÉGIME DES PETITES ENTREPRISES, l'article 57 quater, alinéa 2, fait payer la première quotité « à la " +
      "souscription de la déclaration auto liquidative, au plus tard le 31 janvier de l'année qui suit celle de la " +
      "réalisation des revenus », quand l'article 17 fixe la déclaration au 30 avril · les deux textes ne " +
      "s'articulent pas, et l'échéancier ne déplace aucune date. À faire préciser par le service gestionnaire. Le " +
      "régime se lit dans État > Résultat fiscal et impôt sur les bénéfices.",
  },
  {
    cle: 'premierAcompteIs',
    libelle: 'Premier acompte provisionnel (30 %)',
    periodicite: 'ANNUELLE',
    moisEcheance: 7,
    jourEcheance: 25,
    echeance: 'Au plus tard le 25 juillet',
    baseLegale: BASE_ACOMPTES,
    contenu: CONTENU_ACOMPTE('30 %'),
    sourceDonnees: SOURCE_ACOMPTES,
    referentiels: [Referentiel.SYSCOHADA],
    reserveRegimePhysique: "Ces trois acomptes ne sont dus qu'au RÉGIME RÉEL · l'article 57 bis ne vise que les acomptes de " +
  "l'article 57, ALINÉA 2, et une personne physique au régime des petites entreprises relève de l'alinéa 3, " +
  "qui la fait payer en deux quotités (ci-dessous). Le régime se déduit du chiffre d'affaires sur plusieurs " +
  "exercices (art. 113) et se lit dans État > Résultat fiscal et impôt sur les bénéfices · cet échéancier ne " +
  'le tranche pas, il sert les deux calendriers et vous laisse retenir le vôtre.',
  },
  {
    cle: 'deuxiemeAcompteIs',
    libelle: 'Deuxième acompte provisionnel (30 %)',
    periodicite: 'ANNUELLE',
    moisEcheance: 9,
    jourEcheance: 25,
    echeance: 'Au plus tard le 25 septembre',
    baseLegale: BASE_ACOMPTES,
    contenu: CONTENU_ACOMPTE('30 %'),
    sourceDonnees: SOURCE_ACOMPTES,
    referentiels: [Referentiel.SYSCOHADA],
    reserveRegimePhysique: "Ces trois acomptes ne sont dus qu'au RÉGIME RÉEL · l'article 57 bis ne vise que les acomptes de " +
  "l'article 57, ALINÉA 2, et une personne physique au régime des petites entreprises relève de l'alinéa 3, " +
  "qui la fait payer en deux quotités (ci-dessous). Le régime se déduit du chiffre d'affaires sur plusieurs " +
  "exercices (art. 113) et se lit dans État > Résultat fiscal et impôt sur les bénéfices · cet échéancier ne " +
  'le tranche pas, il sert les deux calendriers et vous laisse retenir le vôtre.',
  },
  {
    cle: 'troisiemeAcompteIs',
    libelle: 'Troisième acompte provisionnel (20 %)',
    periodicite: 'ANNUELLE',
    moisEcheance: 11,
    jourEcheance: 25,
    echeance: 'Au plus tard le 25 novembre',
    baseLegale: BASE_ACOMPTES,
    contenu: CONTENU_ACOMPTE('20 %'),
    sourceDonnees: SOURCE_ACOMPTES,
    referentiels: [Referentiel.SYSCOHADA],
    reserveRegimePhysique: "Ces trois acomptes ne sont dus qu'au RÉGIME RÉEL · l'article 57 bis ne vise que les acomptes de " +
  "l'article 57, ALINÉA 2, et une personne physique au régime des petites entreprises relève de l'alinéa 3, " +
  "qui la fait payer en deux quotités (ci-dessous). Le régime se déduit du chiffre d'affaires sur plusieurs " +
  "exercices (art. 113) et se lit dans État > Résultat fiscal et impôt sur les bénéfices · cet échéancier ne " +
  'le tranche pas, il sert les deux calendriers et vous laisse retenir le vôtre.',
  },
  /*
    LES DEUX QUOTITÉS DE LA PETITE ENTREPRISE · ce que l'échéancier ne servait
    à personne, alors qu'il servait à tout le monde les trois acomptes.

    L'article 57 bis vise « les acomptes provisionnels visés à l'article 57,
    ALINÉA 2 », et cet alinéa ne couvre que l'impôt sur les sociétés et l'IRPP
    au régime réel. Une petite entreprise relève de l'alinéa 3 : elle acquitte
    son impôt en deux quotités, 60 % puis 40 %. L'échéancier lui réclamait donc
    trois versements aux mauvaises dates et taisait les deux qu'elle doit.

    POURQUOI LES DEUX CALENDRIERS SONT SERVIS ENSEMBLE À UNE PERSONNE PHYSIQUE.
    Le régime ne se lit pas dans une forme juridique : il se déduit du chiffre
    d'affaires sur plusieurs exercices (art. 113), donnée qui vit dans le
    module fiscal. Ce fichier ne la détient pas et ne la recalculera pas · une
    règle fiscale dupliquée dans deux modules finit par diverger. Il sert donc
    les deux calendriers AVEC LEUR CONDITION ÉCRITE, plutôt que d'en deviner
    un. Une personne MORALE, elle, est toujours à l'IS : elle ne reçoit que les
    trois acomptes, sans réserve.
  */
  {
    cle: 'premiereQuotitePetiteEntreprise',
    libelle: 'Première quotité de l’impôt (60 %)',
    periodicite: 'ANNUELLE',
    moisEcheance: 1,
    jourEcheance: 31,
    echeance: 'Au plus tard le 31 janvier',
    baseLegale:
      'Article 57, alinéa 3, et article 57 quater, alinéa 2, de la loi de procédures fiscales n° 004/2003.',
    contenu:
      "Versement de 60 % de l'impôt dû au titre de l'exercice, au plus tard le 31 janvier de l'année qui suit celle de la réalisation des revenus. Ce n'est PAS un acompte sur l'exercice suivant : c'est le paiement de cet impôt-ci, fractionné. L'article 57 quater, alinéa 2, le lie à la déclaration : « La 1ère quotité visée à l'alinéa précédent du présent article est payée à la souscription de la déclaration auto liquidative, au plus tard le 31 janvier de l'année qui suit celle de la réalisation des revenus. » La déclaration de l'article 17, elle, est due au plus tard le 30 avril · les deux textes ne s'articulent pas, et l'échéancier ne déplace aucune date. À faire préciser par le service gestionnaire, comme l'échéance de la seconde quotité.",
    sourceDonnees:
      "Impôt dû de la fenêtre État > Résultat fiscal et impôt sur les bénéfices, qui sert les deux quotités chiffrées.",
    referentiels: [Referentiel.SYSCOHADA],
    personnesPhysiquesSeulement: true,
    reserveRegimePhysique: "Ces deux quotités ne sont dues qu'au RÉGIME DES PETITES ENTREPRISES (art. 57, al. 3 et art. 57 quater) · " +
  "au régime réel, ce sont les trois acomptes ci-dessus qui s'appliquent, et le régime des micro-entreprises " +
  "n'en doit aucun. Le régime se lit dans État > Résultat fiscal et impôt sur les bénéfices.",
  },
  {
    cle: 'secondeQuotitePetiteEntreprise',
    libelle: 'Seconde quotité de l’impôt (40 %)',
    periodicite: 'ANNUELLE',
    moisEcheance: 4,
    jourEcheance: 30,
    echeance: 'Au plus tard le 30 avril',
    baseLegale:
      'Article 57, alinéa 3, et article 57 quater, alinéa 3, de la loi de procédures fiscales n° 004/2003.',
    contenu:
      "Versement du solde de 40 % de l'impôt dû au titre de l'exercice. ÉCHÉANCE À CONFIRMER auprès du service gestionnaire : l'alinéa 3 de l'article 57 quater écrit une seconde fois « La 1ère quotité est acquittée [...] au plus tard le 30 avril de la même année ». Le même alinéa ne peut pas fixer deux dates à la même quotité · le défaut de rédaction est celui du texte officiel, repris tel quel par la compilation DGI au 19 juillet 2026, et il est signalé ici plutôt que corrigé en silence.",
    sourceDonnees:
      "Impôt dû de la fenêtre État > Résultat fiscal et impôt sur les bénéfices, qui sert les deux quotités chiffrées.",
    referentiels: [Referentiel.SYSCOHADA],
    personnesPhysiquesSeulement: true,
    reserveRegimePhysique: "Ces deux quotités ne sont dues qu'au RÉGIME DES PETITES ENTREPRISES (art. 57, al. 3 et art. 57 quater) · " +
  "au régime réel, ce sont les trois acomptes ci-dessus qui s'appliquent, et le régime des micro-entreprises " +
  "n'en doit aucun. Le régime se lit dans État > Résultat fiscal et impôt sur les bénéfices.",
  },
  {
    cle: 'declarationAnnuelleSalaires',
    libelle: 'Déclaration annuelle sur les revenus salariaux',
    periodicite: 'ANNUELLE',
    moisEcheance: 3,
    jourEcheance: 31,
    echeance: "Au plus tard le 31 mars de l'année suivante",
    baseLegale:
      'Article 22 ter de la loi de procédures fiscales, créé par la loi de finances n° 22/071 du 28 décembre 2022 ' +
      'et modifié par la loi de finances n° 25/060 du 29 décembre 2025.',
    contenu:
      "Déclaration récapitulative des revenus salariaux et revenus assimilés versés, accompagnée des fiches individuelles de chaque rémunéré, classées par province et par ordre alphabétique, sur le modèle fixé par l'Administration des Impôts.",
    sourceDonnees:
      'Comptes 66 (charges de personnel), 4471 et 4472 (impôts retenus à la source) pour les totaux, et les ' +
      'bulletins de paie émis (fenêtre Personnel) pour les montants par salarié. LA FICHE INDIVIDUELLE NE SORT PAS ' +
      'DE CES SOLDES · le texte la veut par rémunéré, CLASSÉE PAR PROVINCE, et le registre du personnel ne porte ' +
      "aucune province d'affectation. Le classement se fait hors du logiciel.",
    // Art. 22 ter, al. 1er · une personne physique n'y est tenue qu'au régime
    // réel ou au régime des petites entreprises (passe F7).
    reserveRegimePhysique:
      "Pour une personne physique, cette déclaration n'est due qu'au RÉGIME RÉEL ou au RÉGIME DES PETITES ENTREPRISES " +
      "(art. 22 ter, al. 1er) · le régime des micro-entreprises n'est pas visé. Le régime se lit dans État > Résultat " +
      'fiscal et impôt sur les bénéfices.',
  },
  {
    cle: 'listeFournisseurs',
    libelle: 'Liste annuelle des fournisseurs',
    periodicite: 'ANNUELLE',
    moisEcheance: 3,
    jourEcheance: 31,
    echeance: "Au plus tard le 31 mars de l'année suivante",
    baseLegale:
      'Article 47 ter de la loi de procédures fiscales, inséré par la loi de finances n° 25/060 du 29 décembre 2025.',
    contenu:
      "Liste des fournisseurs avec, pour chacun : identité, adresse, boîte postale, Numéro Impôt, montant hors taxes, TVA et montant toutes taxes comprises payé.",
    sourceDonnees:
      "Comptes 40 (fournisseurs) ET 481 (fournisseurs d'investissements), et 445 (TVA récupérable). Le texte dit « la liste de ses fournisseurs » sans distinguer l'objet de l'achat · celui qui vend une immobilisation en est un, et le relevé du seul 401 l'omettrait. Le Numéro Impôt de chaque fournisseur se renseigne sur sa fiche, dans le plan des tiers.",
    // L'ASBL EXEMPTÉE, ET LA QUESTION QUE LE TEXTE LAISSE OUVERTE (passe F8).
    // Le même dépôt lit les mêmes mots (« soumises à l'impôt sur les
    // sociétés ») comme excluant l'ASBL au procès-verbal de l'art. 13 bis ;
    // ici « exonérée ou non » et le « et » inapplicable à la lettre entre IS
    // et IRPP laissent le doute. Ni retirée ni affirmée · la question écrite.
    reserveSycebnl:
      "ENTITÉ EXEMPTÉE · l'article 47 ter vise « toute personne physique ou morale, soumise à l'impôt sur les " +
      "sociétés et à l'impôt sur le revenu des personnes physiques, exonérée ou non ». La loi n° 23/053 distingue " +
      "l'exemption, « la dispense d'une obligation fiscale de déclaration et de paiement » (art. 2, 10°), de " +
      "l'exonération, « la dispense totale ou partielle de paiement d'impôt » (11°), et exempte « les Associations " +
      "sans but lucratif constituées conformément à la Loi » (art. 5, 3°). La loi de procédures fiscales, art. 3, " +
      "dispense les personnes exemptées « de l'obligation de souscrire les déclarations, à l'exception de celles " +
      "afférentes aux impôts dont elles sont redevables légaux ». Une entité dont l'exemption n'est pas acquise " +
      "reste visée. Pour une entité exemptée, le texte lu ne tranche pas, la liste figurant au titre du contrôle et " +
      "non des déclarations · à confirmer auprès du service gestionnaire avant de la tenir pour due ou pour " +
      "dispensée.",
  },
  /*
    LA LISTE DES CLIENTS DE L'ARTICLE 47 BIS · le jumeau de la liste des
    fournisseurs, qui n'était servi nulle part (passe F8). Inséré par la loi
    de finances de l'exercice 2025 (L.F. n° 24/011, art. 41), en vigueur le
    1er janvier 2025 (art. 94 de cette loi, lu dans la compétence
    `rgcp-comptabilite-publique`, lf-2025.md). Ce n'est PAS le relevé
    récapitulatif de l'art. 13, al. 3, joint à la déclaration d'IS.

    LE TEXTE VISE UNE ACTIVITÉ, PAS UN RÉFÉRENTIEL · « les fabricants, les
    importateurs et toutes entreprises effectuant des ventes en gros et/ou en
    demi-gros ». Aucun livre ne porte cette qualité : l'obligation est servie à
    tout dossier, sauf celui qui a DÉCLARÉ ne vendre ni biens ni services, et
    la qualité est dite à confirmer. Aucune sanction n'est chiffrée · l'article
    qui la porterait n'a pas été lu.
  */
  {
    cle: 'listeClients',
    libelle: 'Liste annuelle des clients',
    periodicite: 'ANNUELLE',
    moisEcheance: 3,
    jourEcheance: 31,
    echeance: 'Au plus tard le 31 mars de chaque année',
    baseLegale:
      "Article 47 bis de la loi de procédures fiscales, inséré par la loi de finances n° 24/011 du 20 décembre 2024, " +
      "art. 41 : « Les fabricants, les importateurs et toutes entreprises effectuant des ventes en gros et/ou en " +
      "demi-gros doivent adresser à l'Administration des Impôts au plus tard le 31 mars de chaque année, sur support " +
      "papier ou en support numérique, la liste de leurs clients ».",
    contenu:
      "Liste des clients comportant pour chacun d'eux : l'identité et l'adresse physique ainsi que le numéro de la " +
      "boîte postale ; le numéro impôt ; le montant total hors taxes des achats effectués au cours de l'année " +
      "précédente ; la taxe sur la valeur ajoutée facturée.",
    sourceDonnees:
      "La fiche du client dans le plan des tiers (adresse, boîte postale, Numéro Impôt), les factures de vente de la " +
      "fenêtre Facturation, et les comptes 41 (clients) et 443 (TVA facturée) pour le hors taxes et la TVA de " +
      "l'année précédente.",
    masqueeSiAucuneVente: true,
    reserveCommune:
      "QUALITÉ DU DÉCLARANT · le texte ne vise que les fabricants, les importateurs et les entreprises qui vendent en " +
      "gros ou en demi-gros. Aucun livre ne porte cette qualité : confirmez-la avant de tenir la liste pour due. Il " +
      "n'est pas question ici du relevé des ventes joint à la déclaration de l'impôt sur les sociétés (art. 13, " +
      "al. 3), qui est une autre obligation. L'article est en vigueur depuis le 1er janvier 2025.",
  },
  /*
    LE DOSSIER BAILLEUR · la déclaration annuelle de l'impôt sur les revenus
    locatifs, que l'échéancier ne servait à personne (passe F11). Il sert
    l'impôt propre de l'entité (IS, IRPP, acomptes) ; celui-là en est un, dès
    que le dossier donne un bâtiment ou un terrain en location.

    CONDITIONNELLE, ET SERVIE AUX DEUX RÉFÉRENTIELS · rien dans un compte ne
    dit qu'un produit est un loyer d'immeuble (ni le 70730000 du SYSCOHADA ni
    le 70700000 du SYCEBNL ne le distinguent) · même parti que le relevé des
    droits d'auteur, servi à tous sur un fait que le logiciel ne connaît pas.

    ET CE N'EST PAS UN CAS ISOLÉ · les autres déclarations du chapitre II du
    livre II de la loi de procédures fiscales (impôt foncier, art. 6 ;
    véhicules, art. 7 à 9 ; superficie des concessions minières, art. 10) ne
    sont pas servies non plus, et la réserve le dit.
  */
  {
    cle: 'declarationRevenusLocatifs',
    libelle: 'Déclaration annuelle de l’impôt sur les revenus locatifs · si le dossier donne des bâtiments ou des terrains en location',
    periodicite: 'ANNUELLE',
    moisEcheance: 2,
    jourEcheance: 1,
    echeance: "Au plus tard le 1er février de l'année qui suit celle de la réalisation des revenus",
    baseLegale:
      "Article 11 de la loi de procédures fiscales : « Le redevable de l'impôt sur les revenus locatifs souscrit " +
      "chaque année une déclaration au plus tard le 1er février de l'année qui suit celle de la réalisation des " +
      "revenus. » Article 14 de la loi n° 83/004 du 23 février 1983 : « Chaque propriétaire reste tenu d'inclure " +
      "dans la déclaration annuelle de ses revenus locatifs le montant brut des loyers qui comporte, d'une part, le " +
      "montant des loyers réellement encaissés, et d'autre part, le montant des retenues à la source opérées par le " +
      "locataire ou sous-locataire. »",
    contenu:
      "Déclaration des loyers bruts de l'année · les loyers réellement encaissés et les retenues à la source " +
      "opérées par les locataires, que l'Administration impute sur l'impôt dû « au titre de l'année au cours de " +
      "laquelle les loyers ont fait l'objet des retenues » (loi n° 83/004, art. 13). À Kinshasa, la déclaration se " +
      "fait « suivant le modèle prévu par la Direction Générale des Recettes de Kinshasa » et l'impôt se paie au " +
      "plus tard le 1er février (arrêté provincial n° 015/CAB/MIN.PROV/FIN.ECO/2023, art. 2).",
    sourceDonnees:
      "Comptes de produits où le dossier porte ses loyers, et compte de l'État où il porte les retenues subies. " +
      "Aucun compte semé ne distingue un loyer d'immeuble d'un autre produit · la ventilation appartient au cabinet. " +
      "Aucun montant n'est calculé ici.",
    reserveCommune:
      "À TENIR POUR DUE SEULEMENT SI LE DOSSIER EST BAILLEUR. EXEMPTIONS · l'ordonnance-loi n° 69/009, art. 12, " +
      "exempte notamment l'État, les provinces et les établissements publics « n'ayant d'autres ressources que " +
      "celles provenant de subventions budgétaires », les établissements d'utilité publique et « les associations " +
      "sans but lucratif ayant pour fin de s'occuper d'œuvres religieuses, scientifiques ou philanthropiques » · le " +
      "logiciel ne tranche pas l'objet de l'entité. SOCIÉTÉS IMMOBILIÈRES · la circulaire ministérielle n° 0023 du " +
      "9 janvier 2001 les écartait de cet impôt au motif qu'elles étaient « imposés à l'impôt professionnel », " +
      "abrogé depuis le 1er janvier 2026 (loi n° 23/053, art. 152) · la portée actuelle de cette exclusion n'est pas " +
      "tranchée. TAUX · l'impôt est provincial (Constitution, art. 204, 16°) : voir la réserve de la retenue sur les " +
      "revenus locatifs. AUTRES DÉCLARATIONS DU MÊME CHAPITRE · l'impôt foncier (art. 6), l'impôt sur les véhicules " +
      "(art. 7 à 9) et la taxe de superficie des concessions minières (art. 10) ne sont pas servies non plus par cet " +
      "échéancier.",
  },
  {
    cle: 'procesVerbalAssemblee',
    libelle: "Procès-verbal de l'assemblée générale approuvant les états financiers",
    periodicite: 'ANNUELLE',
    // Le texte compte dix jours à partir de la TENUE de l'assemblée, date que
    // le logiciel ne connaît pas. Le repère du 30 juin (échéance de dépôt au
    // CPCC) est le plus tardif raisonnable · l'assemblée se tient forcément
    // avant, puisqu'elle arrête les comptes qui y sont déposés.
    moisEcheance: 7,
    jourEcheance: 10,
    echeance: "Dans les dix jours de la tenue de l'assemblée générale",
    baseLegale:
      'Article 13 bis de la loi de procédures fiscales, inséré par la loi de finances n° 25/060 : « Les sociétés ' +
      'et les autres personnes morales soumises à l’impôt sur les sociétés sont tenues de déposer […] dans les ' +
      'dix jours de la tenue de l’Assemblée générale ordinaire approuvant les états financiers certifiés par les ' +
      'commissaires aux comptes, le procès-verbal de l’Assemblée générale. »',
    contenu: "Procès-verbal de l'assemblée générale ordinaire ayant approuvé les états financiers certifiés.",
    // LE DESTINATAIRE EST CELUI DE L'IMPÔT SUR LES SOCIÉTÉS, pas tout dossier.
    // Une association est exemptée de l'IS (loi n° 23/053, art. 5), et
    // l'exemption dispense de la déclaration comme du paiement (art. 2, 10°) ;
    // une personne physique n'a ni assemblée ni IS. Même filtre que la
    // déclaration d'IS, et pour la même raison.
    referentiels: [Referentiel.SYSCOHADA],
    formesExclues: FORMES_PERSONNES_PHYSIQUES,
    sanction: undefined,
    sourceDonnees:
      "Date calculée à partir de l'échéance de dépôt au CPCC, faute de date d'assemblée renseignée : c'est un repère, à corriger sur la date réelle de votre assemblée.",
  },
];

/**
 * Rappel affiché en tête de l'état · ce n'est pas un ornement, c'est ce qui
 * distingue cet écran d'un calculateur d'impôt.
 */
export const AVERTISSEMENT_REGISTRE =
  "Cet état ne calcule aucun impôt et n'applique aucun barème. Il recense ce que votre comptabilité porte déjà sur " +
  "les comptes de retenue et de cotisation, en regard de l'échéance légale de reversement. Les montants viennent de " +
  'vos écritures ; les échéances viennent des textes cités, à la date de vérification indiquée. ' +
  RESERVE_JOUR_OUVRABLE;

/**
 * LE RÉGIME D'IMPÔT DU DOSSIER, ET C'EST L'AVERTISSEMENT LE PLUS FAUX QU'ON
 * PUISSE SERVIR AU MAUVAIS DOSSIER.
 *
 * Le texte annonçait d'abord à TOUT dossier une exemption d'impôt sur les
 * sociétés. Il a ensuite été corrigé pour distinguer les deux RÉFÉRENTIELS, et
 * la garde est restée là · alors que l'article 5 ne discrimine pas par
 * référentiel, mais par QUALITÉ DE LA PERSONNE. Un établissement public et une
 * coopérative agricole de forme civile sont tenus en SYSCOHADA, et l'écran
 * leur affirmait « La société est redevable de l'impôt sur les sociétés
 * (art. 3) », avec l'échéance du 30 avril et ses trois acomptes · c'est-à-dire
 * exactement ce que l'article 5 leur épargne.
 *
 * LE PIÈGE N° 5 DU DÉPÔT, DANS SA FORME EXACTE · une garde posée pour une
 * lecture qui s'est déplacée depuis. Le commentaire ci-dessus ÉNUMÉRAIT
 * pourtant les exemptés de l'article 5, y compris ces deux-là. La donnée
 * manquait si peu que `retenues.service.ts` chargeait déjà
 * `formeJuridiqueSyscohada` dans la même requête.
 *
 * CE QUE LA FONCTION NE TRANCHE PAS, ET LE DIT. Pour l'entité publique,
 * l'article 5, 1° réserve son exemption aux établissements publics « en vertu
 * de leurs statuts » et aux organismes « dont les ressources proviennent
 * uniquement de subventions budgétaires », quand l'article 3 impose
 * l'exploitation lucrative : ni les statuts ni l'origine des ressources ne
 * sont au modèle. Pour la coopérative, l'article 5, 2° pose DEUX conditions
 * cumulatives, l'objet agricole et la FORME CIVILE, et le champ du dossier
 * porte la coopérative au sens de l'Acte uniforme, pas la forme civile au sens
 * fiscal. Dans les deux cas l'écran pose la question au lieu d'y répondre.
 *
 * ET LA PORTÉE DE L'EXEMPTION EST CELLE DU TITRE Ier, PAS UNE AUTRE. Son
 * article 2, 10° définit l'exemption comme « la dispense d'une obligation
 * fiscale de DÉCLARATION ET DE PAIEMENT », là où le 11° définit l'exonération
 * comme « la dispense totale ou partielle de PAIEMENT ». Le texte servi à une
 * ASBL disait qu'elle « ne dispense pas non plus de DÉCLARER », ce qui est
 * vrai des impôts retenus pour autrui et faux de l'impôt sur les sociétés
 * lui-même.
 *
 * La conclusion, elle, est la même dans tous les cas, et c'est tout l'objet de
 * l'état : payer ou ne pas payer son propre impôt ne dispense de rien de ce
 * qu'on retient pour le compte d'autrui.
 */
export function avertissementRegimeImpot(
  referentiel: Referentiel,
  formeJuridique: FormeJuridiqueSyscohada | null = null,
): string {
  const rappelTiers =
    "Quoi qu'il en soit de son propre impôt, l'entité ne se trouve dispensée d'AUCUN impôt retenu pour le compte " +
    "d'autrui, ni d'aucune cotisation sociale, ni de les DÉCLARER aux échéances prévues.";

  if (referentiel === Referentiel.SYSCOHADA) {
    // ART. 5, 1° · « l'Etat, les Provinces et les Entités Territoriales
    // Décentralisées, les établissements publics, en vertu de leurs statuts,
    // et les autres organismes de droit public dont les ressources proviennent
    // uniquement de subventions budgétaires ». La condition de ressources ne
    // vise que la dernière catégorie, et aucune donnée du dossier ne la porte.
    if (formeJuridique === FormeJuridiqueSyscohada.ENTITE_PUBLIQUE) {
      return (
        "Ce dossier est une ENTITÉ PUBLIQUE, et l'impôt sur les sociétés ne lui est pas dû de plein droit. " +
        "L'article 5, 1° de la loi n° 23/053 EXEMPTE « l'Etat, les Provinces et les Entités Territoriales " +
        'Décentralisées, les établissements publics, en vertu de leurs statuts, et les autres organismes de droit ' +
        "public dont les ressources proviennent uniquement de subventions budgétaires ». L'exemption est, au sens " +
        "du Titre Ier, article 2, 10°, « la dispense d'une obligation fiscale de déclaration ET de paiement ». " +
        "Elle ne joue PAS pour une exploitation lucrative, que l'article 3 impose : OmegaX ne connaît ni les " +
        "statuts de l'établissement ni l'origine de ses ressources, et ne tranche donc pas · à vérifier avant " +
        'toute déclaration. ' +
        rappelTiers
      );
    }
    // ART. 5, 2° · deux conditions CUMULATIVES, et le modèle n'en porte
    // aucune : l'objet (agricole, élevage, pêche) et la FORME CIVILE. Le mot
    // « coopérative » ne vaut pas la même chose ici et à l'AUSCOOP, qui est le
    // sens du champ.
    if (formeJuridique === FormeJuridiqueSyscohada.SOCIETE_COOPERATIVE) {
      return (
        "Ce dossier est une SOCIÉTÉ COOPÉRATIVE, et son régime dépend de deux données que le logiciel ne détient " +
        "pas. L'article 3 l'impose à raison de son activité ; l'article 5, 2° EXEMPTE « les sociétés coopératives " +
        'de production, de transformation, de conservation et de vente de produits agricoles, de l’élevage et de ' +
        'la pêche et leurs unions fonctionnant conformément aux dispositions légales qui les régissent, LORSQU’ELLES ' +
        'REVÊTENT LA FORME CIVILE ». Les deux conditions sont cumulatives, et le champ « forme juridique » du ' +
        "dossier porte la coopérative au sens de l'Acte uniforme, pas la forme civile au sens fiscal · à trancher " +
        'avant toute déclaration. ' +
        rappelTiers
      );
    }
    // ART. 1er ET ART. 2, 17°, a) · L'IMPÔT SUR LES SOCIÉTÉS N'EST PAS
    // L'IMPÔT DE TOUT LE MONDE, et ce repli le servait à tout dossier
    // SYSCOHADA que les deux branches ci-dessus ne captaient pas, entreprise
    // individuelle et entreprenant compris.
    //
    // L'article 1er établit DEUX impôts et les sépare par la qualité de la
    // personne : « un impôt sur l'ensemble des bénéfices réalisés par les
    // SOCIÉTÉS ET AUTRES PERSONNES MORALES [...] désigné sous le nom d'Impôt
    // sur les Sociétés » et « un impôt unique sur le revenu des PERSONNES
    // PHYSIQUES [...] désigné sous le nom d'Impôt sur le Revenu des Personnes
    // Physiques ». L'article 2, 17°, a) range parmi les personnes physiques
    // « les exploitants individuels ». Et l'article 3, que ce message citait,
    // n'énumère au titre de la forme que les sociétés anonymes, à
    // responsabilité limitée et par actions simplifiées, et au titre de
    // l'activité que des sociétés et des personnes morales : une entreprise
    // individuelle n'y figure nulle part.
    //
    // LA CORRECTION EXISTAIT DÉJÀ AILLEURS, ET N'AVAIT PAS TRAVERSÉ. Le
    // planning de clôture a scindé ses deux jalons de déclaration annuelle et
    // exclut nommément ces formes de celui de l'impôt sur les sociétés
    // (`planning-cloture.ts`, `formesSyscohadaExclues: FORMES_PERSONNES_PHYSIQUES`),
    // le module fiscal les route vers l'IRPP, et le fichier que voici déclare
    // trente lignes plus bas `FORMES_PERSONNES_PHYSIQUES` sous un commentaire
    // qui écrit lui-même « Elles ne sont pas redevables de l'impôt sur les
    // sociétés mais de l'IRPP ». Trois écrans disaient l'IRPP, celui-ci
    // disait l'impôt sur les sociétés, et le cabinet arbitrait.
    //
    // CE QUE CE MESSAGE NE TRANCHE PAS. Le calendrier de PAIEMENT d'une
    // personne physique dépend de son RÉGIME (micro, petite entreprise, réel),
    // qui se déduit du chiffre d'affaires sur plusieurs exercices (art. 113)
    // et vit dans le module fiscal. Recalculer ici la règle de l'art. 113 la
    // ferait exister à deux endroits, donc diverger : le message nomme la
    // branche et renvoie à la fenêtre qui tranche.
    if (formeJuridique !== null && FORMES_PERSONNES_PHYSIQUES.includes(formeJuridique)) {
      return (
        "Ce dossier est une PERSONNE PHYSIQUE, et l'impôt sur les sociétés ne lui est PAS dû. L'article 1er de la " +
        "loi n° 23/053 établit l'impôt sur les sociétés sur « l'ensemble des bénéfices réalisés par les sociétés et " +
        "autres personnes morales » et réserve aux personnes physiques « un impôt unique sur le revenu des personnes " +
        "physiques », l'IRPP ; l'article 2, 17°, a) range l'exploitant individuel parmi les personnes physiques, et " +
        "l'article 3 ne l'impose à l'IS ni par sa forme ni par son activité. La déclaration annuelle est celle de " +
        "l'article 17 de la loi n° 004/2003, due au plus tard le 30 avril de l'année qui suit celle de la " +
        "réalisation des revenus. SON CALENDRIER DE PAIEMENT DÉPEND DU RÉGIME, que cet état ne détermine pas : au " +
        'régime réel, trois acomptes provisionnels (art. 57 bis) ; au régime des petites entreprises, deux quotités ' +
        '(art. 57, al. 3 et 57 quater) ; au régime des micro-entreprises, ni acompte ni quotité. Le régime se lit ' +
        'dans État > Résultat fiscal et impôt sur les bénéfices. ' +
        rappelTiers
      );
    }
    return (
      "La société est redevable de l'impôt sur les sociétés (loi n° 23/053, art. 3). Sa déclaration est due au plus " +
      "tard le 30 avril de l'année qui suit celle de la réalisation des revenus (loi n° 004/2003, art. 12), et ses " +
      'trois acomptes provisionnels au plus tard les 25 juillet, 25 septembre et 25 novembre (art. 57 bis, tel que ' +
      "modifié par la loi de finances n° 25/060 du 29 décembre 2025). " +
      rappelTiers
    );
  }
  return (
    "L'exemption d'impôt sur les sociétés dont bénéficie une ASBL régulièrement constituée (loi n° 23/053, art. 5, " +
    "3°) porte, au sens du Titre Ier, article 2, 10°, sur « une obligation fiscale de DÉCLARATION ET DE PAIEMENT » · " +
    "elle ne se confond pas avec l'EXONÉRATION du 11°, qui ne dispense que du paiement. " +
    rappelTiers
  );
}


/** Obligation servie à l'échéancier, avec la réserve qui l'accompagne. */
export type ObligationServie = ObligationDeclarative & { reserve: string | null };

/**
 * Obligations déclaratives applicables à un dossier.
 *
 * LA FORME JURIDIQUE COMMANDE LE CALENDRIER DE PAIEMENT DE L'IMPÔT, et
 * l'échéancier l'ignorait : il servait les trois acomptes de l'article 57 bis
 * à TOUT dossier SYSCOHADA, entreprise individuelle et entreprenant compris,
 * alors que ces acomptes ne visent que l'alinéa 2 de l'article 57, c'est-à-dire
 * l'impôt sur les sociétés et l'IRPP au régime réel.
 *
 * CE QUE LA FORME ÉTABLIT AVEC CERTITUDE, ET CE QU'ELLE N'ÉTABLIT PAS. Une
 * personne MORALE est à l'impôt sur les sociétés : ses trois acomptes sont dus,
 * et les quotités de la petite entreprise ne la concernent jamais. Une personne
 * PHYSIQUE relève de l'IRPP, et son régime (micro, petite entreprise, réel) se
 * déduit du chiffre d'affaires sur plusieurs exercices selon l'article 113 ·
 * cette donnée vit dans le module fiscal, pas ici. Les deux calendriers lui
 * sont donc servis AVEC LEUR CONDITION ÉCRITE en réserve, plutôt qu'un seul
 * choisi au jugé. Avertir vaut mieux que deviner, et recalculer ici la règle
 * de l'article 113 la ferait exister à deux endroits, donc diverger.
 *
 * FORME NON RENSEIGNÉE = on ne retranche rien de ce qui était servi jusqu'ici
 * et on n'ajoute pas les quotités : le comportement d'avant, exactement, pour
 * un dossier qui n'a pas encore rempli ses paramètres.
 */
export function obligationsDeclarativesApplicables(
  referentiel: Referentiel,
  formeSyscohada?: FormeJuridiqueSyscohada | null,
  faits: FaitsDuDossier = {},
): ObligationServie[] {
  const physique = !!formeSyscohada && FORMES_PERSONNES_PHYSIQUES.includes(formeSyscohada);
  // La forme n'est lue qu'au SYSCOHADA, où elle a un sens · un dossier SYCEBNL
  // qui porterait une forme OHADA résiduelle ne reçoit rien de ce chef.
  const parLaForme = (o: ObligationDeclarative) =>
    referentiel === Referentiel.SYSCOHADA &&
    !!formeSyscohada &&
    !!o.formesIncluses &&
    o.formesIncluses.includes(formeSyscohada);
  return OBLIGATIONS_DECLARATIVES.filter(
    (o) =>
      (!o.referentiels || o.referentiels.includes(referentiel) || parLaForme(o)) &&
      (!o.personnesPhysiquesSeulement || physique) &&
      // Forme non renseignée = rien n'est retranché · on n'exclut que ce
      // qu'on sait exclure.
      !(o.formesExclues && !!formeSyscohada && o.formesExclues.includes(formeSyscohada)) &&
      // « Non » déclaré seulement · null, « pas encore dit », garde la ligne.
      !(o.masqueeSiAucuneVente && faits.venteBiensServices === false),
  ).map((o) => {
    const parts = [
      o.reserveCommune,
      referentiel === Referentiel.SYCEBNL ? o.reserveSycebnl : undefined,
      parLaForme(o) && !(o.referentiels ?? []).includes(referentiel) ? o.reserveFormesIncluses : undefined,
      physique ? o.reserveRegimePhysique : undefined,
    ].filter((r): r is string => !!r);
    return { ...o, reserve: parts.length ? parts.join(' ') : null };
  });
}

/** Réserve à afficher pour une nature, selon le référentiel du dossier. */
export function reservePourReferentiel(nature: NatureRetenue, referentiel: Referentiel): string | undefined {
  return referentiel === Referentiel.SYSCOHADA ? (nature.reserveSyscohada ?? nature.reserve) : nature.reserve;
}

/**
 * L'argument qui fait comprendre l'enjeu à un trésorier plus vite que tout le
 * reste de l'écran : la retenue qu'on a omis d'opérer, on la doit soi-même.
 */
export const AVERTISSEMENT_REDEVABLE =
  "Le redevable qui n'a pas opéré une retenue, ou qui l'a opérée pour un montant insuffisant, en est PERSONNELLEMENT " +
  'redevable, « du montant de la retenue non effectuée ET DES PÉNALITÉS Y AFFÉRENTES » (article 96 bis de la loi de procédures fiscales, INSÉRÉ par la loi de finances n° 24/011 du ' +
  '20 décembre 2024, art. 46, et REMPLACÉ par la loi de finances n° 25/060 du 29 décembre 2025, art. 35). Une ' +
  "retenue oubliée ne disparaît pas avec le paiement : elle devient une dette de l'entité elle-même, pénalités comprises. RÉSERVE · la " +
  'rédaction citée ici est celle issue du remplacement de 2025. Le texte de la version de 2024 n\u2019est pas au ' +
  "corpus du logiciel : sur un exercice antérieur à 2026, un article de ce numéro était en vigueur, mais sa " +
  'rédaction exacte reste à vérifier avant tout usage opposable.';

/**
 * LA SEULE FAUSSE ALERTE QUE LE RAPPROCHEMENT CORRIGÉ NE PEUT PAS LEVER SEUL.
 *
 * Depuis que le reversement s'impute sur le mois de la retenue qu'il éteint,
 * un mois signalé en retard l'est vraiment · sauf un, et toujours le même :
 * celui dont le reversement a été passé sur l'EXERCICE SUIVANT. Le registre
 * ne lit que les écritures de l'exercice affiché (voir la requête du service,
 * filtrée sur `exerciceId`), et la retenue de décembre est reversée en
 * janvier de l'exercice d'après.
 *
 * Le logiciel ne peut pas aller le chercher sans changer la portée de l'état.
 * Il le DIT, plutôt que de laisser croire que le drapeau est sans appel.
 */
export const AVERTISSEMENT_REVERSEMENT_EXERCICE_SUIVANT =
  'MOIS SIGNALÉS EN RETARD · ce registre ne lit que les écritures de l’exercice affiché. Un reversement passé sur ' +
  'l’exercice suivant, celui de la retenue du dernier mois notamment, ne lui est pas visible : vérifiez-le sur ' +
  'l’exercice d’après avant de conclure au retard.';

/**
 * LA MÊME LIMITE, PRISE PAR L'AUTRE BOUT · un reversement de l'exercice qui
 * éteint une retenue d'un exercice antérieur.
 *
 * Il est bien compté dans le total reversé de la nature, qui reste
 * l'arithmétique du compte, mais il ne s'impute sur aucun mois de l'exercice
 * affiché · d'où un total reversé supérieur à la somme de la colonne des
 * mois. L'écart n'est pas une erreur de calcul, et sans cette phrase il en
 * aurait tout l'air.
 */
export const AVERTISSEMENT_REVERSEMENT_ANTERIEUR =
  'REVERSEMENT NON IMPUTÉ · une part de ce qui a été reversé sur cet exercice n’éteint aucune retenue connue, ni de ' +
  'l’exercice ni de son solde d’ouverture : un versement excédentaire, ou une retenue d’une période que le dossier ' +
  'ne porte pas. Elle figure dans le total reversé de la nature, mais dans aucun de ses mois.';

/**
 * Une nature dont la retenue est ÉCHUE et toujours pas reversée, avec la
 * charge que ce défaut expose. Ce que le service en tire ne sort jamais du
 * constat : une échéance passée, un montant de RETENUE, et le nom de la charge.
 */
export interface SignalementDeductibilite {
  cle: string;
  libelle: string;
  /** Charge dont la déduction est exposée · texte de la nature. */
  charge: string;
  /**
   * Retenue ÉCHUE qui reste non reversée, en francs · retenues des mois dont
   * l'échéance est passée, diminuées de tout ce que la nature a déjà reversé.
   * Voir `retenuEchuNonReverse` dans le service pour ce que cette assiette
   * évite.
   */
  montantEchuNonReverse: number;
  /** Dernière échéance de reversement déjà passée à la date de référence. */
  derniereEcheanceEchue: Date;
}

/**
 * LA CONSÉQUENCE, SUR L'IMPÔT DE L'ENTITÉ, D'UNE RETENUE COLLECTÉE ET NON
 * REVERSÉE · l'information que ce registre détenait sans jamais la dire.
 *
 * Loi n° 23/053, art. 20, dernier alinéa, Sous-section 2, Paragraphe 1 « Des
 * conditions GÉNÉRALES de déductibilité des charges » : « La société apporte
 * la preuve de la déclaration et du paiement de la retenue correspondante
 * pour les sommes donnant lieu à un prélèvement ou à une retenue à la
 * source. » (compilation DGI au 19 juillet 2026,
 * `04-loi23-053-titre2-impot-societes.md`, lignes 422 à 424 ; l'alinéa suit
 * les quatre conditions numérotées de l'article, et la loi de finances
 * n° 25/060 du 29 décembre 2025 ne l'a pas touché.)
 *
 * Ce que le texte exige est une PREUVE · celle de la déclaration ET du
 * paiement. Le registre est précisément l'endroit qui sait quand elle ne peut
 * pas être rapportée : c'est son solde échu. Ce que le texte ne dit pas, en
 * revanche, c'est le montant de ce qui serait réintégré · c'est la CHARGE qui
 * est en cause, pas la retenue, et le registre ne connaît pas l'assiette.
 * D'où un avertissement nommant la charge, et aucun chiffrage.
 *
 * LE RÉGIME D'IMPÔT CHANGE LA PORTÉE, et c'est la leçon déjà tirée pour
 * `avertissementRegimeImpot` : une condition de déductibilité d'une charge
 * n'a d'effet que sur un bénéfice imposable. Une entité effectivement
 * exemptée d'impôt sur les sociétés (art. 5) n'en a pas · le reversement ne
 * lui en reste pas moins dû, à l'échéance rappelée par ce même registre.
 */
export function avertissementDeductibiliteArticle20(
  referentiel: Referentiel,
  signalements: SignalementDeductibilite[],
): string | null {
  if (signalements.length === 0) return null;

  const detail = signalements
    .map(
      (s) =>
        `${s.libelle} · ${s.montantEchuNonReverse.toLocaleString('fr-FR')} FC de retenue échue non reversés au ` +
        `${s.derniereEcheanceEchue.toLocaleDateString('fr-FR')} (charge exposée : ${s.charge})`,
    )
    .join(' ; ');

  const commun =
    'RETENUES ÉCHUES ET NON REVERSÉES · ' +
    detail +
    ". L'article 20, dernier alinéa de la loi n° 23/053 range parmi les conditions générales de déductibilité des " +
    'charges que « la société apporte la preuve de la déclaration et du paiement de la retenue correspondante pour ' +
    'les sommes donnant lieu à un prélèvement ou à une retenue à la source ». Tant que le reversement n’est pas fait, ' +
    'cette preuve manque pour les charges correspondantes.';

  // La réserve qui empêche de lire ce montant comme un constat définitif : le
  // registre ne lit que les écritures de l'exercice affiché. Le reversement
  // de la retenue de décembre, passé en janvier suivant, est hors de sa vue ·
  // c'est le seul cas où ce signalement peut se lever à tort.
  const reserveExercice =
    ' Ce registre ne lit que les écritures de l’exercice affiché : un reversement passé sur l’exercice suivant, ' +
    'celui de la retenue du dernier mois notamment, ne lui est pas visible · vérifiez-le avant de conclure.';

  if (referentiel === Referentiel.SYSCOHADA) {
    return (
      commun +
      ' La déduction de ces charges est donc exposée à une réintégration au résultat fiscal, pour le montant de la ' +
      'CHARGE et non pour celui de la retenue. Ce registre ne le chiffre pas : il ne connaît pas l’assiette et ' +
      'n’applique aucun taux · rapprochez ces retenues des charges qu’elles accompagnent dans État > Résultat fiscal ' +
      'avant de déclarer.' +
      reserveExercice
    );
  }
  return (
    commun +
    " L'entité qui bénéficie EFFECTIVEMENT de l'exemption d'impôt sur les sociétés de l'article 5 n'a pas de " +
    'bénéfice imposable sur lequel cette condition jouerait · exemption qui n’est pas automatique pour un ' +
    'établissement d’utilité publique ou une ONG, puisqu’elle suppose l’attestation et les conditions de fond des ' +
    'articles 2 et 3 de l’arrêté n° 007/CAB/MIN/FINANCES/2025 du 19 février 2025. Le reversement, lui, reste dû à ' +
    'l’échéance rappelée ci-dessus.' +
    reserveExercice
  );
}
