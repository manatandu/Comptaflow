import { FormeJuridiqueEbnl } from '@prisma/client';

/**
 * QUALIFIER L'EXEMPTION D'IMPÔT SUR LES SOCIÉTÉS D'UNE ENTITÉ NON LUCRATIVE ·
 * pourquoi ce fichier existe.
 *
 * OmegaX tenait l'exemption pour acquise du seul fait du RÉFÉRENTIEL
 * COMPTABLE : tout dossier SYCEBNL se voyait opposer « Une entité à but non
 * lucratif est exemptée d'impôt sur les sociétés (loi n° 23/053, art. 5) ».
 * Le référentiel comptable n'est le critère d'aucun des textes ci-dessous, et
 * l'article 5 ne fonde pas UNE exemption mais TROIS, de régimes différents.
 *
 * Loi n° 23/053 du 30 novembre 2023, art. 5 · fiscalite-rdc/code-general-2026/
 * references/04-loi23-053-titre2-impot-societes.md :
 *
 *   l. 68     « Sont exemptés de l'Impôt sur les Sociétés : »
 *   l. 77     « 3. les Associations sans but lucratif constituées conformément
 *             à la Loi ; »
 *   l. 83-87  « 4. les associations sans but lucratif, pour les profits
 *             qu'elles réalisent à l'occasion de l'organisation, avec le
 *             concours des Entités Territoriales Décentralisées ou des
 *             organismes publics locaux, des foires, des expositions, des
 *             réunions sportives et autres manifestations publiques
 *             correspondant à l'objet défini par leurs statuts ; »
 *   l. 88-89  « 5. les établissements d'utilité publique et les Organisations
 *             non gouvernementales dans les conditions définies par voie
 *             réglementaire ; »
 *
 * Le point 3 exempte l'ENTITÉ et ne renvoie à aucun texte d'application. Le
 * point 4 n'exempte pas l'entité mais des PROFITS, ceux de manifestations
 * publiques organisées « avec le concours » d'une ETD ou d'un organisme
 * public local. Le point 5 est le SEUL des trois à renvoyer au règlement, et
 * ce règlement existe.
 *
 * Arrêté ministériel n° 007/CAB/MIN/FINANCES/2025 du 19 février 2025 ·
 * fiscalite-rdc-socle/references/
 * am-007-2025-exemption-is-etablissements-utilite-publique-ong.md, pris
 * « en exécution de l'article 5, point 5, de la loi n° 23/053 » (l. 7),
 * entré en vigueur le 1er janvier 2026 (art. 6, l. 82), donc applicable à
 * l'exercice en cours :
 *
 *   art. 1er, l. 21-23 « L'arrêté définit les conditions d'exemption de
 *             l'impôt sur les sociétés des établissements d'utilité publique
 *             et des organisations non gouvernementales, en application de
 *             l'article 5, point 5 de la loi 23/053. »
 *   art. 2, l. 27-29 « Le bénéfice de l'exemption n'est pas automatique : il
 *             passe par une attestation d'exemption, délivrée par
 *             l'Administration des Impôts sur demande de la structure
 *             concernée, dont elle définit le modèle. La demande est adressée
 *             au Directeur Général des Impôts. »
 *   art. 3, l. 45-54 les quatre conditions cumulatives, reproduites plus bas.
 *   art. 4, l. 62-70 la gestion désintéressée.
 *   art. 5, l. 74-75 « En cas de non-respect des conditions des articles 3 et
 *             4, l'impôt sur les sociétés est dû au titre de l'exercice
 *             concerné. »
 *
 * PÉRIMÈTRE DE L'ARRÊTÉ, À NE PAS ÉLARGIR · son art. 1er ne vise que les
 * établissements d'utilité publique et les organisations non
 * gouvernementales. Une association du point 3 n'y est pas soumise, et lui
 * réclamer une attestation serait une exigence inventée.
 *
 * CE QUE CE FICHIER NE FAIT PAS, ET POURQUOI · il ne calcule aucun impôt et
 * ne déclare aucune entité imposable. Les quatre conditions de l'art. 3 (but
 * non lucratif, gestion désintéressée, réinvestissement, absence de
 * distorsion de concurrence) ne se lisent dans AUCUNE comptabilité : ce sont
 * des faits de gestion et de marché, appréciés par l'Administration. La
 * validité d'une attestation ne se lit pas davantage dans un champ de saisie.
 * Le fichier POSE DONC DES AVERTISSEMENTS qui citent l'article et disent ce
 * que le logiciel ne sait pas, jamais un résultat fiscal deviné.
 */

/** Le fondement de l'exemption, tel que la FORME JURIDIQUE permet de le poser. */
export type FondementExemptionIs =
  /** Art. 5, point 3 · ASBL constituée conformément à la loi n° 004/2001. */
  | 'ART_5_POINT_3'
  /** Art. 5, point 5 · établissement d'utilité publique, sous l'arrêté 007/2025. */
  | 'ART_5_POINT_5'
  /** Une ONG relève des deux lectures à la fois · voir CONCOURS_ONG ci-dessous. */
  | 'ART_5_POINT_3_OU_POINT_5'
  /** Forme hors du champ de la loi n° 004/2001 · unité de gestion de projet. */
  | 'HORS_LOI_004_2001'
  /** Forme non renseignée ou « AUTRE » · rien ne peut être qualifié. */
  | 'INDETERMINE';

export type EntreeQualificationExemptionIs = {
  formeJuridique?: FormeJuridiqueEbnl | null;
  droitEtranger?: boolean | null;
  actePersonnaliteJuridique?: string | null;
  attestationExemptionIs?: string | null;
  /**
   * Date de DÉLIVRANCE recopiée de la pièce, jamais une échéance · l'arrêté
   * n° 007/2025 n'en fixe aucune (voir la migration
   * 20260917090000_date_attestation_exemption_is).
   */
  dateAttestationExemptionIs?: Date | string | null;
};

export type QualificationExemptionIs = {
  fondement: FondementExemptionIs;
  /** Une phrase, reprise telle quelle dans le refus du module fiscal. */
  enonce: string;
  /**
   * NULL n'est pas « non » · il veut dire que le fondement n'est pas
   * qualifiable, donc que le logiciel ne peut pas dire si l'attestation de
   * l'art. 2 de l'arrêté est exigée ou non.
   */
  attestationRequise: boolean | null;
  /** Le champ `attestationExemptionIs` du dossier porte-t-il une valeur. */
  attestationConnue: boolean;
  /**
   * La DATE DE DÉLIVRANCE est-elle connue. Elle ne conditionne rien : aucun
   * texte n'en fait une condition de l'exemption, et son absence n'est donc
   * pas une anomalie. Elle sert au réviseur, qui demande l'âge de la pièce.
   */
  dateAttestationConnue: boolean;
  /**
   * FAUX NE VEUT PAS DIRE « IMPOSABLE ». Il veut dire que le logiciel ne peut
   * pas affirmer l'exemption avec ce qu'il détient : c'est un appel à la
   * vérification, pas une décision d'imposition.
   */
  exemptionAffirmable: boolean;
  avertissements: string[];
};

const renseigne = (v?: string | null) => typeof v === 'string' && v.trim().length > 0;

/**
 * Art. 3 de l'arrêté, l. 45-54, cité en entier · le mot « effectivement » est
 * du texte, et l. 56-58 ajoute que l'attestation « une fois délivrée, ne fige
 * pas l'exemption ».
 */
const QUATRE_CONDITIONS =
  "Arrêté n° 007/2025, art. 3 : « L'exemption n'est effectivement acquise que si quatre conditions cumulatives sont " +
  "réunies : 1. activités exercées dans un but non lucratif ; 2. gestion désintéressée (voir art. 4) ; 3. en cas " +
  "d'activités lucratives, le produit doit être réinvesti dans le programme d'activités à caractère philanthropique, " +
  "scientifique, culturel, artistique, pédagogique, éducatif ou sportif faisant l'objet de la structure ; 4. la vente " +
  "éventuelle des produits issus de ces activités lucratives ne doit pas entraîner de distorsion de concurrence. » " +
  "AUCUNE DES QUATRE NE SE LIT DANS UNE COMPTABILITÉ · un compte de produits porte un montant, jamais le but " +
  "poursuivi, l'affectation du surplus ni l'état de la concurrence sur le marché visé. OmegaX ne les vérifie pas et " +
  "ne prétend pas les vérifier : c'est à vous de les constater, exercice par exercice, l'attestation une fois " +
  "délivrée ne figeant pas l'exemption.";

/** Art. 4, l. 62-70 · la nuance de la rémunération de dirigeant est dans le texte. */
const GESTION_DESINTERESSEE =
  "Arrêté n° 007/2025, art. 4 : la gestion est désintéressée lorsqu'elle est assurée à titre bénévole, sans « aucune " +
  "distribution directe ou indirecte de gains générés, sous quelque forme que ce soit ». Les statuts peuvent " +
  "toutefois prévoir des rémunérations de dirigeants « à condition qu'elles soient comparables à celles versées pour " +
  "des responsabilités similaires » : c'est le NIVEAU de la rémunération, pas son existence, qui distingue la " +
  "rémunération légitime de la distribution déguisée. Le comparable ne figure dans aucune balance · le logiciel ne " +
  "peut donc pas trancher, seulement rappeler la règle.";

/** Art. 5, l. 74-78 · la sanction, et ce qu'OmegaX ne peut pas en tirer. */
const SANCTION_ART_5 =
  "Arrêté n° 007/2025, art. 5 : « En cas de non-respect des conditions des articles 3 et 4, l'impôt sur les sociétés " +
  "est dû au titre de l'exercice concerné. » Si un manquement est constaté, l'impôt de CET exercice devient exigible. " +
  "OmegaX ne le liquide pas : la détermination du résultat fiscal lit une balance SYSCOHADA (comptes de produits 701 " +
  "à 707, catalogue de retraitements de la loi n° 23/053) et un dossier SYCEBNL n'en a pas. Le chiffrage se fait hors " +
  "logiciel. Le texte est par ailleurs muet sur une remise en cause au-delà de l'exercice visé : silence à signaler, " +
  "pas à trancher.";

/**
 * ONG · LE CONCOURS DE QUALIFICATION, QU'IL FAUT DIRE ET NON TRANCHER.
 *
 * Loi n° 004/2001, art. 2 (l. 24-28) : « L'Association sans but lucratif est
 * de par sa nature et son objet soit : 1. Une association à caractère
 * culturel, social ou éducatif ou économique ; 2. Une organisation non
 * gouvernementale ONG, en sigle ; 3. Une association confessionnelle. » Et
 * art. 35 (l. 277-280) : « Est réputée Organisation Non Gouvernementale "ONG"
 * en sigle, l'association sans but lucratif dotée de la personnalité
 * juridique dont l'objet concourt au développement social, culturel et
 * économique des communautés locales. » Une ONG de droit congolais EST donc
 * une ASBL, et le point 3 de l'art. 5 la couvre à ce titre.
 *
 * Mais le point 5 nomme les « Organisations non gouvernementales », et
 * l'arrêté 007/2025 est pris pour elles (art. 1er). Les deux lectures tiennent
 * du texte. Le logiciel N'ARBITRE PAS : il sert les deux, avec leurs
 * références, et laisse le professionnel décider. Un logiciel qui trancherait
 * dans le sens du point 3 supprimerait une attestation que le vérificateur
 * réclame ; dans le sens du point 5, il exigerait une pièce dont une ASBL est
 * peut-être dispensée.
 */
const CONCOURS_ONG =
  "QUALIFICATION À ARBITRER, le logiciel ne la tranche pas. Deux lectures se disputent l'exemption d'une ONG et " +
  "toutes deux tiennent du texte. Point 3 de l'art. 5 : une ONG de droit congolais est une ASBL, puisque la loi " +
  "n° 004/2001 la range à son art. 2 parmi les trois natures d'ASBL et la définit à son art. 35 comme « l'association " +
  "sans but lucratif dotée de la personnalité juridique dont l'objet concourt au développement social, culturel et " +
  "économique des communautés locales » · l'exemption serait alors acquise sans attestation. Point 5 du même " +
  "article : il nomme les « Organisations non gouvernementales » et les renvoie « aux conditions définies par voie " +
  "réglementaire », et l'arrêté n° 007/2025 est pris pour elles (art. 1er) · l'attestation et les quatre conditions " +
  "s'appliqueraient. Tant que l'arbitrage n'est pas fait, les avertissements ci-dessous sont servis par prudence.";

/**
 * Art. 5, point 4 · servi seulement quand il devient opérant, c'est-à-dire
 * quand le point 3 ne peut pas être affirmé. Tant que l'entité est
 * « constituée conformément à la Loi », le point 3 exempte tout et le point 4
 * n'ajoute rien ; il n'est pas là pour décorer un écran.
 */
const POINT_4_MANIFESTATIONS =
  "Loi n° 23/053, art. 5, point 4 : sont exemptés « les profits qu'elles réalisent à l'occasion de l'organisation, " +
  "avec le concours des Entités Territoriales Décentralisées ou des organismes publics locaux, des foires, des " +
  "expositions, des réunions sportives et autres manifestations publiques correspondant à l'objet défini par leurs " +
  "statuts ». Ce point n'exempte pas l'entité mais CES PROFITS-LÀ, et il ne reprend pas la condition « constituées " +
  "conformément à la Loi » du point 3. Il peut donc rester ouvert alors même que le point 3 ne l'est pas. Le concours " +
  "d'une ETD ou d'un organisme public local est un fait qui ne figure dans aucune écriture : à établir par la " +
  "convention de la manifestation.";

const attestationDite = (connue: boolean, pieces: string, dateConnue = false) =>
  connue
    ? "Arrêté n° 007/2025, art. 2 : « Le bénéfice de l'exemption n'est pas automatique : il passe par une attestation " +
      "d'exemption, délivrée par l'Administration des Impôts sur demande de la structure concernée, dont elle définit " +
      "le modèle. » Une référence d'attestation est enregistrée dans ce dossier. Le logiciel ne la vérifie pas : " +
      (dateConnue
        ? "sa date de délivrance est enregistrée, mais il n'a ni son modèle, "
        : "il n'a ni sa date de délivrance, ni son modèle, ") +
      "ni le moyen de savoir si la Direction Générale des Impôts l'a depuis retirée. AUCUNE ÉCHÉANCE N'EST SUIVIE, " +
      "et ce n'est pas un manque : les six articles de l'arrêté ne fixent aucune durée de validité, aucun " +
      "renouvellement, aucun délai. Le risque que porte l'art. 5 n'est d'ailleurs pas la péremption de la pièce mais " +
      "le non-respect des art. 3 et 4. Conserver l'original au dossier permanent, c'est la première pièce demandée " +
      "au contrôle."
    : "Arrêté n° 007/2025, art. 2 : « Le bénéfice de l'exemption n'est pas automatique : il passe par une attestation " +
      "d'exemption, délivrée par l'Administration des Impôts sur demande de la structure concernée, dont elle définit " +
      "le modèle. La demande est adressée au Directeur Général des Impôts. » AUCUNE ATTESTATION N'EST ENREGISTRÉE " +
      "dans ce dossier (paramètres du dossier, « Attestation d'exemption »). Tant qu'elle manque, l'exemption ne peut " +
      `pas être présentée comme acquise. Pièces à joindre à la demande : ${pieces}`;

/** Table de l'art. 2 de l'arrêté, l. 33-37, ligne par ligne. */
const PIECES_EUP =
  "arrêté du Ministre ayant la Justice dans ses attributions, accordant la personnalité juridique.";
const PIECES_ONG_CONGOLAISE =
  "arrêté du Ministre de la Justice accordant la personnalité juridique ET acte d'enregistrement auprès du Ministère " +
  "du secteur d'activité visé.";
const PIECES_ONG_ETRANGERE =
  "ordonnance présidentielle accordant la personnalité juridique, justification d'une représentation en RDC, et " +
  "accord-cadre conclu avec le Ministère du Plan.";

/** Art. 37 de la loi n° 004/2001, l. 294-302, et l. 39-41 de l'arrêté. */
const ONG_ETRANGERE =
  "DOSSIER DÉCLARÉ DE DROIT ÉTRANGER. La loi n° 004/2001, art. 37, impose à l'organisation étrangère d'« avoir une " +
  "représentation en République Démocratique du Congo » et de « conclure un accord-cadre avec le Ministère ayant le " +
  "plan dans ses attributions ». L'arrêté n° 007/2025 en fait des pièces de la demande d'attestation, et en tire " +
  "cette conséquence : « Une ONG étrangère sans accord-cadre avec le Ministère du Plan, ou sans représentation " +
  "justifiée en RDC, ne peut donc pas obtenir l'attestation, même personnalité juridique acquise à l'étranger. » " +
  "OmegaX NE TIENT PAS l'accord-cadre : le dossier ne porte qu'un certificat d'enregistrement du Ministère du Plan, " +
  "qui est une autre pièce. Vérifier l'accord-cadre hors logiciel avant de conclure à l'exemption.";

/** Loi n° 004/2001, art. 3 et art. 5 · ce que « constituées conformément à la Loi » suppose. */
const ACTE_MANQUANT =
  "L'art. 5, point 3 de la loi n° 23/053 n'exempte que les ASBL « constituées conformément à la Loi ». La " +
  "personnalité juridique est « accordée par le Ministre de la Justice après avis favorable du Ministre ayant dans " +
  "ses attributions le secteur d'activités visé » (loi n° 004/2001, art. 3), l'avis favorable valant « autorisation " +
  "provisoire de fonctionnement » de six mois (art. 5). L'ACTE DE PERSONNALITÉ JURIDIQUE N'EST PAS RENSEIGNÉ dans ce " +
  "dossier. Le champ étant facultatif, son absence ne prouve rien : elle empêche seulement le logiciel d'affirmer " +
  "que la condition du point 3 est remplie.";

/**
 * Qualifie le fondement de l'exemption et pose les avertissements dus.
 *
 * Fonction pure · elle ne lit que ce que le dossier porte déjà
 * (`Tenant.formeJuridique`, `droitEtranger`, `actePersonnaliteJuridique`,
 * `attestationExemptionIs`). Aucun champ nouveau, aucune migration.
 */
export function qualifierExemptionIs(entree: EntreeQualificationExemptionIs): QualificationExemptionIs {
  const attestationConnue = renseigne(entree.attestationExemptionIs);
  // Une date sans référence est ORPHELINE · le même écran dirait alors
  // « aucune attestation n'est enregistrée » et afficherait une date de
  // délivrance. La date ne compte donc que si la pièce est connue.
  const dateAttestationConnue = attestationConnue && entree.dateAttestationExemptionIs != null;
  const acteConnu = renseigne(entree.actePersonnaliteJuridique);
  const etranger = entree.droitEtranger === true;
  const avertissements: string[] = [];

  switch (entree.formeJuridique) {
    // Art. 2, points 1 et 3 de la loi n° 004/2001 · l'une et l'autre sont des
    // ASBL, et l'arrêté n° 007/2025 ne les vise pas (son art. 1er).
    case FormeJuridiqueEbnl.ASSOCIATION:
    case FormeJuridiqueEbnl.ASSOCIATION_CONFESSIONNELLE: {
      if (!acteConnu) {
        avertissements.push(ACTE_MANQUANT, POINT_4_MANIFESTATIONS);
      }
      return {
        fondement: 'ART_5_POINT_3',
        enonce: acteConnu
          ? "Une association sans but lucratif constituée conformément à la Loi est exemptée d'impôt sur les sociétés " +
            "(loi n° 23/053, art. 5, point 3) · ce point ne renvoie à aucun texte d'application, l'arrêté n° 007/2025 " +
            "ne visant que les établissements d'utilité publique et les ONG."
          : "L'exemption de l'art. 5, point 3 de la loi n° 23/053 vise les associations « constituées conformément à " +
            "la Loi » · l'acte de personnalité juridique n'étant pas renseigné dans ce dossier, le logiciel ne " +
            "l'affirme pas.",
        attestationRequise: false,
        attestationConnue,
        dateAttestationConnue,
        exemptionAffirmable: acteConnu,
        avertissements,
      };
    }

    // Art. 2, point 2 et art. 35 de la loi n° 004/2001, contre l'art. 5,
    // point 5 de la loi n° 23/053 · les deux lectures sont servies.
    case FormeJuridiqueEbnl.ORGANISATION_NON_GOUVERNEMENTALE: {
      avertissements.push(CONCOURS_ONG);
      avertissements.push(attestationDite(attestationConnue, etranger ? PIECES_ONG_ETRANGERE : PIECES_ONG_CONGOLAISE));
      if (etranger) avertissements.push(ONG_ETRANGERE);
      avertissements.push(QUATRE_CONDITIONS, GESTION_DESINTERESSEE, SANCTION_ART_5);
      if (!acteConnu) avertissements.push(ACTE_MANQUANT, POINT_4_MANIFESTATIONS);
      return {
        fondement: 'ART_5_POINT_3_OU_POINT_5',
        enonce:
          "L'exemption d'une organisation non gouvernementale n'est pas acquise du seul fait du référentiel " +
          "comptable · l'art. 5, point 5 de la loi n° 23/053 la renvoie aux « conditions définies par voie " +
          "réglementaire », et l'arrêté n° 007/2025 y met une attestation du Directeur Général des Impôts (art. 2) " +
          "et quatre conditions de fond vérifiées en continu (art. 3).",
        attestationRequise: true,
        attestationConnue,
        dateAttestationConnue,
        // Faux même attestation en main : l'art. 3 conditionne l'exemption à
        // quatre faits que le logiciel ne peut pas constater.
        exemptionAffirmable: false,
        avertissements,
      };
    }

    // Titre II de la loi n° 004/2001, art. 58 · un EUP N'EST PAS une ASBL, les
    // points 3 et 4 de l'art. 5 ne le concernent donc pas.
    case FormeJuridiqueEbnl.ETABLISSEMENT_UTILITE_PUBLIQUE: {
      avertissements.push(attestationDite(attestationConnue, PIECES_EUP));
      if (etranger) avertissements.push(ONG_ETRANGERE);
      avertissements.push(QUATRE_CONDITIONS, GESTION_DESINTERESSEE, SANCTION_ART_5);
      return {
        fondement: 'ART_5_POINT_5',
        enonce:
          "L'exemption d'un établissement d'utilité publique relève du seul point 5 de l'art. 5 de la loi n° 23/053, " +
          "« dans les conditions définies par voie réglementaire » · un établissement d'utilité publique n'est pas " +
          "une association sans but lucratif (loi n° 004/2001, Titre II, art. 58), les points 3 et 4 ne lui sont donc " +
          "pas ouverts. L'attestation de l'arrêté n° 007/2025 (art. 2) et ses quatre conditions (art. 3) commandent.",
        attestationRequise: true,
        attestationConnue,
        dateAttestationConnue,
        exemptionAffirmable: false,
        avertissements,
      };
    }

    // Une unité de gestion de projet est hors loi n° 004/2001 (voir le
    // commentaire de l'enum dans prisma/schema.prisma) · aucun des trois
    // points ne lui est acquis par sa forme.
    case FormeJuridiqueEbnl.UNITE_GESTION_PROJET: {
      avertissements.push(
        "Une unité de gestion de projet n'est pas une personne morale de la loi n° 004/2001 : elle n'est ni une " +
          "association sans but lucratif (art. 2) ni un établissement d'utilité publique (art. 58). Aucun des points " +
          "3, 4 et 5 de l'art. 5 de la loi n° 23/053 ne découle donc de sa forme. Si une exemption existe, elle vient " +
          "d'un autre instrument · convention de financement, accord de siège, texte propre au bailleur, qu'OmegaX ne " +
          "détient pas. À établir pièce en main avant toute conclusion.",
        SANCTION_ART_5,
      );
      return {
        fondement: 'HORS_LOI_004_2001',
        enonce:
          "La forme « unité de gestion de projet » est hors du champ de la loi n° 004/2001 · aucun des points 3, 4 " +
          "et 5 de l'art. 5 de la loi n° 23/053 ne se déduit d'elle, et le logiciel n'affirme aucune exemption.",
        attestationRequise: null,
        attestationConnue,
        dateAttestationConnue,
        exemptionAffirmable: false,
        avertissements,
      };
    }

    default: {
      avertissements.push(
        "La forme juridique de ce dossier n'est pas qualifiée au regard de la loi n° 004/2001 (« AUTRE », ou champ " +
          "non renseigné). Les points 3, 4 et 5 de l'art. 5 de la loi n° 23/053 ne visent pas les mêmes entités et " +
          "n'ont pas le même régime : renseigner la forme dans les paramètres du dossier est le préalable à toute " +
          "qualification.",
        SANCTION_ART_5,
      );
      return {
        fondement: 'INDETERMINE',
        enonce:
          "La forme juridique de ce dossier ne permet pas de qualifier le fondement de l'exemption (loi n° 23/053, " +
          "art. 5, points 3, 4 ou 5) · le logiciel n'en affirme aucune.",
        attestationRequise: null,
        attestationConnue,
        dateAttestationConnue,
        exemptionAffirmable: false,
        avertissements,
      };
    }
  }
}
