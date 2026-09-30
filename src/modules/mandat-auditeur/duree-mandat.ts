import { FormeJuridiqueSyscohada, Referentiel } from '@prisma/client';

/**
 * DURÉE DU MANDAT DU CONTRÔLEUR DES COMPTES · trois durées, et le contrôle en
 * réclamait une qu'il ne détenait pas.
 *
 * `regles-auditeur.ts` sait depuis longtemps QUI doit désigner un contrôleur
 * des comptes. Ce qu'aucune table ne portait, c'est le MANDAT lui-même · le
 * contrôle 6 dit pourtant, en toutes lettres, « Vérifiez que le mandat est en
 * cours et que le commissaire recevra les comptes en temps utile ». Il
 * réclamait donc au cabinet une vérification que le logiciel rendait
 * impossible, exactement comme `Tenant.longueurCompte` promettait une méthode
 * qui n'existait pas.
 *
 * TROIS DURÉES, LUES À LEUR SOURCE, ET ELLES NE SE SERVENT JAMAIS L'UNE POUR
 * L'AUTRE :
 *
 *  · SYCEBNL art. 21 · « L'auditeur est nommé pour TROIS (3) exercices
 *    RENOUVELABLES UNE FOIS. Toutefois, si l'entité a une existence inférieure
 *    à trois exercices, son mandat est ramené à cette durée. » ;
 *  · AUSCGIE art. 704, SA · DEUX exercices quand le commissaire est désigné
 *    dans les statuts ou par l'assemblée générale constitutive, SIX quand il
 *    l'est par l'assemblée générale ordinaire. La durée dépend donc de
 *    l'ORGANE, pas seulement de la forme ;
 *  · AUSCGIE art. 379, SARL · TROIS exercices.
 *
 * LE PIÈGE EST LE « TROIS », et c'est la neuvième fois que ce dossier
 * rencontre « un nombre, deux sens » après le 192, le 4181, le 1061/1062, le
 * 38/37, le 397, l'article 11 et le taux de TVA de la grille. Le trois du
 * SYCEBNL est RENOUVELABLE UNE FOIS et pas davantage ; le trois de la SARL
 * n'est assorti d'aucune limite de renouvellement dans l'art. 379. Appliquer
 * la limite du SYCEBNL à une SARL inventerait une interdiction ; ne pas
 * l'appliquer à une association laisserait passer un troisième mandat que le
 * texte refuse.
 *
 * CE QUE DEUX RENVOIS AJOUTENT, ET QUI ÉTAIT DÉCLARÉ ABSENT À TORT (passes
 * O1a E2 et O1b G1) :
 *
 *  · SNC · art. 289-1, dernier alinéa · « Les dispositions des articles 377 et
 *    suivants ci-après sont applicables à tout commissaire aux comptes désigné
 *    conformément aux dispositions du présent article », dont l'art. 379 et
 *    ses TROIS exercices, et l'art. 380 qui annule les délibérations prises sur
 *    le rapport d'un commissaire « nommé ou demeuré en fonction contrairement
 *    aux dispositions de l'article 379 ». La SCS y vient par l'art. 293-1
 *    (« Les dispositions relatives aux sociétés en nom collectif sont
 *    applicables aux sociétés en commandite simple ») ;
 *  · SAS · art. 853-3 · « les règles concernant les sociétés anonymes, à
 *    l'exception des articles 387 alinéa 1er, 414 à 561, 690, 751 à 753
 *    ci-dessus, sont applicables à la société par actions simplifiée ». Les
 *    art. 704, 705, 706, 708, 709, 728 et 730 sont hors de l'exception · ils
 *    valent pour elle, « dans la mesure où [ils] sont compatibles ».
 *    L'assemblée générale ordinaire de l'art. 704, al. 2 étant exclue (414 à
 *    561), c'est la décision collective des associés de l'art. 853-11, al. 2
 *    qui en tient lieu · LECTURE D'OMEGAX, dite dans la source servie.
 *
 * CE QUE LE MODULE NE SAIT PAS, ET LE DIT. L'entreprenant n'a, dans les
 * textes lus ici, AUCUNE durée de mandat chiffrée (la coopérative en a trois,
 * AUSCOOP art. 121, al. 2) ; le GIE n'en
 * a une, six exercices, que quand il émet des obligations (art. 880) · la
 * durée y est SAISIE, avec la mention que le logiciel ne la connaît pas.
 * Une règle absente est déclarée absente · elle n'est pas remplacée par la
 * plus proche, même discipline que `regles-auditeur.ts`.
 *
 * LE COMMISSAIRE DÉSIGNÉ EN JUSTICE N'A PAS DE DURÉE (passe O1b, E2). Chez la
 * SA, « Le mandat ainsi conféré prend fin lorsqu'il a été procédé par
 * l'assemblée générale à la nomination du commissaire » (art. 708), et après
 * récusation, il « demeure en fonction jusqu'à l'entrée en fonction du
 * commissaire aux comptes qui est désigné par l'assemblée des actionnaires »
 * (art. 730, al. 2). L'art. 704, al. 2 ne vise que l'assemblée générale
 * ordinaire · lui prêter six exercices faisait tenir pour couvert pendant six
 * ans un mandat qui s'éteint à la prochaine assemblée.
 */

/** Qui a désigné le contrôleur · la durée en dépend chez la société anonyme. */
export type OrganeDesignation =
  | 'STATUTS_OU_AG_CONSTITUTIVE'
  | 'ASSEMBLEE_GENERALE_ORDINAIRE'
  | 'ASSOCIES'
  | 'BAILLEUR_OU_ETAT'
  | 'JURIDICTION';

const SOURCE_DESIGNATION_JUDICIAIRE_SA =
  'AUSCGIE art. 708 et 730 · le mandat prend fin à la nomination (art. 708), ou à l’entrée en fonction (art. 730, ' +
  'après récusation), du commissaire désigné par l’assemblée · aucune durée en exercices, elle se saisit';

const SOURCE_ORGANE_INCONNU_SA =
  'AUSCGIE art. 703 · le commissaire d’une société anonyme est désigné dans les statuts, par l’assemblée ' +
  'générale constitutive ou par l’assemblée générale ordinaire, et à défaut en justice (art. 708, 730)';

export interface DureeMandat {
  /** Nombre d'exercices, ou `null` quand aucun texte lu n'en fixe. */
  exercices: number | null;
  /** Nombre total de mandats permis, ou `null` quand aucun texte lu ne le borne. */
  mandatsMaximum: number | null;
  source: string;
}

export function dureeMandat(
  referentiel: Referentiel,
  formeJuridique: FormeJuridiqueSyscohada | null,
  organe: OrganeDesignation,
  // GIE seulement · émet-il des obligations (compte 161) ? `null` quand les
  // livres n'ont pas été interrogés.
  gieEmetDesObligations: boolean | null = null,
): DureeMandat {
  if (referentiel === Referentiel.SYCEBNL) {
    return {
      exercices: 3,
      // « renouvelables une fois » · le mandat initial PLUS un renouvellement,
      // soit deux mandats et pas un de plus.
      mandatsMaximum: 2,
      source: 'SYCEBNL art. 21',
    };
  }
  switch (formeJuridique) {
    case FormeJuridiqueSyscohada.SOCIETE_ANONYME:
      switch (organe) {
        case 'STATUTS_OU_AG_CONSTITUTIVE':
          return { exercices: 2, mandatsMaximum: null, source: 'AUSCGIE art. 704, premier alinéa' };
        case 'ASSEMBLEE_GENERALE_ORDINAIRE':
          return { exercices: 6, mandatsMaximum: null, source: 'AUSCGIE art. 704, second alinéa' };
        case 'JURIDICTION':
          return { exercices: null, mandatsMaximum: null, source: SOURCE_DESIGNATION_JUDICIAIRE_SA };
        default:
          // ASSOCIES, BAILLEUR_OU_ETAT · refusés par `motifRefusOrgane`. Aucune
          // durée n'est prêtée à un organe que le texte de la SA ne connaît pas.
          return { exercices: null, mandatsMaximum: null, source: SOURCE_ORGANE_INCONNU_SA };
      }
    case FormeJuridiqueSyscohada.SOCIETE_PAR_ACTIONS_SIMPLIFIEE:
      switch (organe) {
        case 'STATUTS_OU_AG_CONSTITUTIVE':
          return {
            exercices: 2,
            mandatsMaximum: null,
            source:
              'AUSCGIE art. 853-3, renvoi à l’art. 704, premier alinéa, « dans la mesure où [les règles de la SA] ' +
              'sont compatibles »',
          };
        case 'ASSEMBLEE_GENERALE_ORDINAIRE':
        case 'ASSOCIES':
          return {
            exercices: 6,
            mandatsMaximum: null,
            source:
              'AUSCGIE art. 853-3, renvoi à l’art. 704, second alinéa, « dans la mesure où [les règles de la SA] ' +
              'sont compatibles » · lecture d’OmegaX : la décision collective des associés (art. 853-11, al. 2) ' +
              'tient lieu de l’assemblée générale ordinaire, que l’art. 853-3 exclut',
          };
        case 'JURIDICTION':
          return {
            exercices: null,
            mandatsMaximum: null,
            source: `AUSCGIE art. 853-3, renvoi aux art. 708 et 730 · ${SOURCE_DESIGNATION_JUDICIAIRE_SA}`,
          };
        default:
          return {
            exercices: null,
            mandatsMaximum: null,
            source:
              'Aucun texte lu ne fixe de durée de mandat pour un commissaire désigné par cet organe · la durée est ' +
              'celle de l’acte de désignation, à saisir.',
          };
      }
    case FormeJuridiqueSyscohada.SOCIETE_RESPONSABILITE_LIMITEE:
      return { exercices: 3, mandatsMaximum: null, source: 'AUSCGIE art. 379' };
    case FormeJuridiqueSyscohada.GROUPEMENT_INTERET_ECONOMIQUE:
      // AUSCGIE art. 880 · le contrôle des états financiers est celui du
      // CONTRAT (al. 1er), SAUF émission d'obligations (art. 875) : le
      // commissaire aux comptes est alors « nommé par l'assemblée pour une
      // durée de six (6) exercices » (al. 4). « Aucun texte lu ne fixe de
      // durée » était faux dans ce cas (passe O1b-G7).
      if (gieEmetDesObligations) {
        return { exercices: 6, mandatsMaximum: null, source: 'AUSCGIE art. 880, quatrième alinéa (GIE émetteur d’obligations)' };
      }
      return {
        exercices: null,
        mandatsMaximum: null,
        source:
          'AUSCGIE art. 880 · la durée est celle du contrat du groupement, sauf émission d’obligations (art. 875), ' +
          'où le commissaire aux comptes est nommé pour six exercices · à saisir.',
      };
    case FormeJuridiqueSyscohada.SOCIETE_NOM_COLLECTIF:
      return {
        exercices: 3,
        mandatsMaximum: null,
        source: 'AUSCGIE art. 379, applicable par l’art. 289-1, dernier alinéa',
      };
    case FormeJuridiqueSyscohada.SOCIETE_COMMANDITE_SIMPLE:
      return {
        exercices: 3,
        mandatsMaximum: null,
        source: 'AUSCGIE art. 379, applicable par l’art. 289-1, dernier alinéa, et l’art. 293-1',
      };
    case FormeJuridiqueSyscohada.SOCIETE_COOPERATIVE:
      // AUSCOOP art. 121, al. 2 · « Le commissaire aux comptes est nommé par
      // l'assemblée générale pour trois exercices ». Aucune limite de
      // renouvellement n'y est écrite. La désignation est facultative pour la
      // SCOOPS (al. 4) ; quand elle y a lieu, le texte ne lui donne pas d'autre
      // durée. « Aucun texte lu » était faux ici (constat O6-B1).
      return { exercices: 3, mandatsMaximum: null, source: 'AUSCOOP art. 121, al. 2' };
    default:
      // Entreprenant · aucun texte lu ne chiffre la durée ici.
      // La saisir est la seule réponse honnête.
      return {
        exercices: null,
        mandatsMaximum: null,
        source:
          'Aucun texte lu ne fixe de durée de mandat pour cette forme · la durée est celle de l’acte de ' +
          'désignation, à saisir.',
      };
  }
}

/**
 * DERNIER EXERCICE COUVERT. L'art. 705 de l'AUSCGIE le dit pour la SA et la
 * règle vaut partout : les fonctions expirent « à l'issue de l'assemblée
 * générale qui statue […] sur les comptes du DEUXIÈME exercice […] ou du
 * SIXIÈME exercice ». Le mandat couvre donc N exercices À COMPTER du premier
 * inclus · un mandat de trois exercices ouvert sur 2026 couvre 2026, 2027 et
 * 2028, pas 2029.
 *
 * L'erreur d'un rang ne casse rien et ne se voit nulle part : le dossier
 * croirait simplement son contrôleur en fonction un an de trop, ou le
 * remplacerait un an trop tôt.
 */
export function dernierExerciceCouvert(premierExercice: number, exercices: number): number {
  return premierExercice + exercices - 1;
}

/**
 * LA PROROGATION D'UN MANDAT ÉCHU · deux textes la portent, chacun pour les
 * siens, et aucun autre texte lu (audit final F69). Le contrôle la servait à
 * tout dossier en citant le SYCEBNL art. 22 · une société lisait que son
 * commissaire était prorogé par un texte qui ne la régit pas.
 *
 *  · SYCEBNL art. 22 · la mission de l'auditeur « est PROROGÉE, sauf refus
 *    exprès de sa part », jusqu'à la plus prochaine assemblée statuant sur
 *    les comptes ;
 *  · AUSCGIE art. 709, pour la SA · « Si l'assemblée omet de renouveler le
 *    mandat d'un commissaire aux comptes ou de le remplacer à l'expiration de
 *    son mandat et, sauf refus exprès du commissaire, sa mission est prorogée
 *    jusqu'à la plus prochaine assemblée générale ordinaire annuelle. »
 *
 * La SAS y vient par l'art. 853-3, qui n'excepte pas l'art. 709 (passe O1b,
 * G1).
 *
 * La SARL n'y est pas · l'art. 377 ne renvoie aux art. 694 et suivants que
 * pour le CHOIX du commissaire, et l'art. 381 renvoie ses fonctions à un
 * texte particulier que le corpus ne porte pas. Aucune prorogation ne lui est
 * donc servie, ni aux autres formes · une règle absente n'est jamais
 * remplacée par la plus proche.
 */
export function regleDeProrogation(
  referentiel: Referentiel,
  formeJuridique: FormeJuridiqueSyscohada | null,
): { source: string; citation: string } | null {
  if (referentiel === Referentiel.SYCEBNL) {
    return {
      source: 'SYCEBNL art. 22',
      citation:
        '« si l’assemblée […] ne procède pas au renouvellement du mandat de l’auditeur ou à son remplacement à ' +
        'l’expiration de son mandat, la mission de l’auditeur est PROROGÉE, sauf refus exprès de sa part », ' +
        'jusqu’à « la plus prochaine assemblée générale […] statuant sur les comptes »',
    };
  }
  // LA SAS PAR RENVOI (passe O1b, G1) · l'art. 709 n'est pas dans la liste
  // d'exception de l'art. 853-3 · « aucun texte lu ne proroge » était une
  // lacune déclarée à tort, et elle faisait signaler une SAS sans contrôleur
  // l'année même où sa mission est prorogée.
  if (formeJuridique === FormeJuridiqueSyscohada.SOCIETE_PAR_ACTIONS_SIMPLIFIEE) {
    return {
      source: 'AUSCGIE art. 853-3 et 709',
      citation:
        'par le renvoi de l’art. 853-3 aux règles de la société anonyme, « dans la mesure où elles sont ' +
        'compatibles » : « Si l’assemblée omet de renouveler le mandat d’un commissaire aux comptes ou de le ' +
        'remplacer à l’expiration de son mandat et, sauf refus exprès du commissaire, sa mission est prorogée ' +
        'jusqu’à la plus prochaine assemblée générale ordinaire annuelle » (art. 709), c’est-à-dire jusqu’à la ' +
        'prochaine décision collective des associés sur les comptes (art. 853-11, al. 2 · lecture d’OmegaX)',
    };
  }
  if (formeJuridique === FormeJuridiqueSyscohada.SOCIETE_ANONYME) {
    return {
      source: 'AUSCGIE art. 709',
      citation:
        '« Si l’assemblée omet de renouveler le mandat d’un commissaire aux comptes ou de le remplacer à ' +
        'l’expiration de son mandat et, sauf refus exprès du commissaire, sa mission est prorogée jusqu’à la ' +
        'plus prochaine assemblée générale ordinaire annuelle. »',
    };
  }
  return null;
}

/**
 * LA PROROGATION NE COUVRE QU'UN EXERCICE · elle court jusqu'à la PLUS
 * PROCHAINE assemblée qui statue sur les comptes. Le mandat couvrant jusqu'à
 * l'exercice L expire à l'assemblée qui statue sur L ; prorogé, il tient
 * jusqu'à celle qui statue sur L + 1, et c'est tout. Un mandat échu depuis
 * trois ans ne proroge plus rien.
 */
export function estDansLaProrogation(premierExercice: number, exercices: number, anneeExercice: number): boolean {
  return anneeExercice === dernierExerciceCouvert(premierExercice, exercices) + 1;
}

/**
 * DURÉE RAMENÉE À L'EXISTENCE DE L'ENTITÉ · SYCEBNL art. 21, seconde phrase, et
 * seulement là : « si l'entité a une existence inférieure à trois exercices,
 * son mandat est ramené à cette durée ». Aucun article de l'AUSCGIE lu ne
 * porte cette réduction · la transposer à une SARL naissante raccourcirait un
 * mandat que le texte ne raccourcit pas.
 *
 * OMEGAX NE MESURE PAS CETTE EXISTENCE (audit final F18). Il la lisait dans le
 * nombre d'exercices OUVERTS DANS LE LOGICIEL · une association de vingt ans
 * qui entre avec un exercice ne pouvait enregistrer qu'un mandat d'un an, et le
 * contrôle 28 déclarait échu, l'année suivante, un mandat de trois ans en
 * cours. Le texte ne dit d'ailleurs pas s'il vise l'existence écoulée ou
 * prévue (un projet a une durée). La réduction se SAISIT donc · une durée plus
 * courte est admise au SYCEBNL, jamais une plus longue.
 */
export function motifRefusDuree(referentiel: Referentiel, duree: number | null, saisie: number): string | null {
  if (duree === null) return null;
  if (referentiel === Referentiel.SYCEBNL) {
    return Number.isInteger(saisie) && saisie >= 1 && saisie <= duree ? null : `au plus ${duree} exercice(s)`;
  }
  return saisie === duree ? null : `${duree} exercice(s)`;
}

/**
 * UN ORGANE QUE LE TEXTE DE LA FORME NE CONNAÎT PAS (passe O1b, E2). Chez la
 * société anonyme, le commissaire est désigné « dans les statuts ou par
 * l'assemblée générale constitutive », puis « par l'assemblée générale
 * ordinaire » (art. 703), et à défaut en justice (art. 708, 730). Ni les
 * « associés » de la SARL ni le « bailleur de fonds » du SYCEBNL n'y figurent ·
 * leur prêter les six exercices de l'art. 704 imprimait une durée et un
 * article que le texte ne porte pas. Refusé à la seule SA · les autres formes
 * gardent leur règle.
 */
export function motifRefusOrgane(
  referentiel: Referentiel,
  formeJuridique: FormeJuridiqueSyscohada | null,
  organe: OrganeDesignation,
): string | null {
  if (referentiel !== Referentiel.SYSCOHADA || formeJuridique !== FormeJuridiqueSyscohada.SOCIETE_ANONYME) return null;
  if (organe === 'ASSOCIES' || organe === 'BAILLEUR_OU_ETAT') {
    return (
      'Cet organe ne désigne pas le commissaire aux comptes d’une société anonyme · « Le premier commissaire aux ' +
      'comptes et son suppléant sont désignés dans les statuts ou par l’assemblée générale constitutive. En cours ' +
      'de vie sociale, le commissaire aux comptes et son suppléant sont désignés par l’assemblée générale ' +
      'ordinaire » (AUSCGIE art. 703), et à défaut en justice (art. 708 et 730).'
    );
  }
  return null;
}

/**
 * LE MANDAT QUI EN CONTINUE UN AUTRE (passe O1b, E1) · AUSCGIE art. 706 et
 * 728, pour la SA, et pour la SAS par l'art. 853-3.
 *
 *  · REMPLACEMENT · « ne demeure en fonction que JUSQU'À L'EXPIRATION DU
 *    MANDAT DE SON PRÉDÉCESSEUR » (art. 706) · le dernier exercice couvert est
 *    celui du mandat d'origine, ni plus ni moins ;
 *  · SUPPLÉANT · « jusqu'à la cessation de l'empêchement ou, lorsque
 *    l'empêchement est définitif, jusqu'à l'expiration du mandat du
 *    commissaire au compte empêché » (art. 728) · au plus jusque-là.
 *
 * Forcer les six exercices de l'art. 704 à un remplaçant nommé au quatrième
 * exercice le tenait pour couvrant jusqu'à cinq exercices de trop. Rien n'est
 * étendu à la SARL ni au SYCEBNL · les art. 706 et 728 de l'AUSCGIE sont
 * écrits pour la SA.
 */
export type NatureSuccession = 'REMPLACEMENT' | 'SUPPLEANT';

export function successionOuverte(referentiel: Referentiel, forme: FormeJuridiqueSyscohada | null): boolean {
  return (
    referentiel === Referentiel.SYSCOHADA &&
    (forme === FormeJuridiqueSyscohada.SOCIETE_ANONYME || forme === FormeJuridiqueSyscohada.SOCIETE_PAR_ACTIONS_SIMPLIFIEE)
  );
}

export function motifRefusSuccession(
  nature: NatureSuccession,
  origine: { premierExercice: number; nombreExercices: number },
  premierExercice: number,
  nombreExercices: number,
): string | null {
  const finOrigine = dernierExerciceCouvert(origine.premierExercice, origine.nombreExercices);
  const fin = dernierExerciceCouvert(premierExercice, nombreExercices);
  if (premierExercice < origine.premierExercice || premierExercice > finOrigine) {
    return `le premier exercice couvert doit tomber dans le mandat d’origine (${origine.premierExercice} à ${finOrigine})`;
  }
  if (nature === 'REMPLACEMENT' && fin !== finOrigine) {
    return (
      `le remplaçant « ne demeure en fonction que jusqu’à l’expiration du mandat de son prédécesseur » ` +
      `(AUSCGIE art. 706) · dernier exercice couvert ${finOrigine}, soit ${finOrigine - premierExercice + 1} ` +
      'exercice(s) à compter du premier'
    );
  }
  if (nature === 'SUPPLEANT' && fin > finOrigine) {
    return (
      'le suppléant exerce au plus « jusqu’à l’expiration du mandat du commissaire au compte empêché » ' +
      `(AUSCGIE art. 728) · dernier exercice couvert ${finOrigine} au plus`
    );
  }
  return null;
}

/**
 * LE FONDEMENT DE L'INSCRIPTION AU TABLEAU, CHACUN À SON RÉFÉRENTIEL (passe
 * D3, A1 et B2). La référence est exigée des deux côtés, jamais vérifiée ;
 * c'est le TEXTE qui change, et l'un ne sert jamais pour l'autre.
 *
 *  · SYCEBNL art. 20 · l'auditeur est choisi « parmi les experts-comptables
 *    inscrits au tableau de l'ordre des experts-comptables ou de l'organe qui
 *    en tient lieu dans chaque État partie » ;
 *  · SYSCOHADA · loi n° 15/002 du 12 février 2015, art. 59 · « Nul ne peut
 *    exercer le mandat ou la fonction de Commissaire aux comptes s'il n'est
 *    inscrit au tableau de l'Ordre des Experts-comptables », en vigueur à sa
 *    promulgation (art. 81), quelle que soit la forme · plus AUSCGIE art. 695
 *    pour la SA, et pour la SARL par l'art. 377 (« Le commissaire aux comptes
 *    est choisi selon les modalités prévues aux articles 694 et suivants »).
 *    L'art. 59, qui parle du commissaire aux comptes, n'est pas transposé à
 *    l'auditeur d'une EBNL.
 */
export function fondementInscription(
  referentiel: Referentiel,
  formeJuridique: FormeJuridiqueSyscohada | null,
): { source: string; texte: string } {
  if (referentiel === Referentiel.SYCEBNL) {
    return {
      source: 'SYCEBNL art. 20',
      texte:
        'l’auditeur est choisi « parmi les experts-comptables inscrits au tableau de l’ordre des experts-comptables ' +
        'ou de l’organe qui en tient lieu dans chaque État partie » (l’ONEC en RDC)',
    };
  }
  const auscgie =
    formeJuridique === FormeJuridiqueSyscohada.SOCIETE_ANONYME
      ? ' · AUSCGIE art. 695'
      : formeJuridique === FormeJuridiqueSyscohada.SOCIETE_RESPONSABILITE_LIMITEE
        ? ' · AUSCGIE art. 695, par l’art. 377'
        : '';
  return {
    source: `Loi n° 15/002, art. 59${auscgie}`,
    texte:
      '« Nul ne peut exercer le mandat ou la fonction de Commissaire aux comptes s’il n’est inscrit au tableau de ' +
      'l’Ordre des Experts-comptables » (loi n° 15/002, art. 59)' +
      (auscgie
        ? ' ; « seuls les experts-comptables inscrits au tableau de l’ordre peuvent exercer les fonctions de ' +
          'commissaires aux comptes » (AUSCGIE art. 695)'
        : ''),
  };
}

/**
 * LE MANDAT QUI COUVRE UN EXERCICE · le premier des mandats servis dont la
 * période (premier exercice, puis `nombreExercices` années, bornes incluses)
 * contient l'année de clôture. Une seule règle pour le contrôle 28 et la
 * Fiche 1 de la liasse (case du commissaire aux comptes) · deux lectures
 * écrites à part auraient divergé au premier correctif. Les mandats arrivent
 * triés par premier exercice décroissant et privés de ceux terminés par
 * anticipation, comme le contrôle les lit. Un mandat échu mais prorogé n'est
 * PAS « couvrant » · la prorogation se lit à part (`estDansLaProrogation`).
 */
export function mandatCouvrant<T extends { premierExercice: number; nombreExercices: number }>(
  mandats: readonly T[],
  anneeExercice: number,
): T | undefined {
  return mandats.find(
    (m) => m.premierExercice <= anneeExercice && dernierExerciceCouvert(m.premierExercice, m.nombreExercices) >= anneeExercice,
  );
}

