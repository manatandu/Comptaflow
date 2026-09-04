import { FormeJuridiqueSyscohada, Referentiel } from '@prisma/client';

/**
 * AFFECTATION DU RÉSULTAT · ce que les deux référentiels disent, et ce qu'ils
 * ne disent pas pareil.
 *
 * Ce fichier NOMME les règles et cite leur source. Il ne décide rien : c'est
 * l'organe compétent qui affecte, le logiciel se borne à refuser ce que le
 * texte interdit et à signaler ce qu'il impose.
 *
 * ── LE TRONC COMMUN ──────────────────────────────────────────────────────────
 *
 * Les deux plans soldent le compte 13 par des comptes de la classe 1, et les
 * deux textes emploient la même formule : « L'affectation du résultat d'un
 * exercice est décidée par les organes compétents au cours de l'exercice
 * suivant ; le compte 13 est donc soldé lors de la comptabilisation de cette
 * affectation » (AUDCIF, Titre VII, COMPTE 13 · SYCEBNL, Partie 2 ch. 3,
 * COMPTE 13, qui ajoute : « En fin d'exercice, le résultat net de l'exercice
 * précédent non affecté à un compte de réserves sera viré au compte 12 -
 * Report à nouveau »).
 *
 * ── CE QUI DIFFÈRE ───────────────────────────────────────────────────────────
 *
 * SYSCOHADA · le bénéfice peut aller au 12 (report à nouveau), au 11
 * (réserves), au 101 (capital social), au 103 (capital personnel) ou au 465
 * (Associés, dividendes à payer). La perte se compense par le 12, le 11, le
 * 101 ou le 103.
 *
 * SYCEBNL · les mêmes destinations MOINS les dividendes et le capital social,
 * PLUS le compte 10 (Dotation) : « est débité le compte 13 […] par le crédit
 * des comptes 12 - Report à nouveau, 11 - Réserves, 10 - Dotation ». Une
 * entité à but non lucratif ne distribue rien · c'est ce qui la définit, et
 * le 465 n'existe pas dans son plan.
 *
 * ── LA RÉSERVE LÉGALE ────────────────────────────────────────────────────────
 *
 * Propre aux sociétés commerciales, donc au seul SYSCOHADA, et de source
 * AUSCGIE et non comptable :
 *
 *   « il est constitué sur le bénéfice de l'exercice diminué, le cas échéant,
 *   des pertes antérieures, une dotation égale à un dixième au moins affectée
 *   à la réserve légale. Cette dotation cesse d'être obligatoire lorsque la
 *   réserve atteint le cinquième du montant du capital social »
 *
 * (AUSCGIE art. 346 pour la SARL, art. 546, 2° pour la SA · la même phrase, et
 * dans les deux cas à peine de NULLITÉ : « Toute délibération prise en
 * violation du présent alinéa est nulle » pour la SARL, « à peine de nullité
 * de toute délibération contraire » pour la SA. Le socle commun est l'art. 142
 * · « L'assemblée générale décide de l'affectation du résultat dans le respect
 * des dispositions légales et statutaires. Elle constitue les dotations
 * nécessaires à la réserve légale et aux réserves statutaires » · complété par
 * l'art. 143, qui définit le bénéfice distribuable comme « le résultat de
 * l'exercice, augmenté du report bénéficiaire et diminué des pertes
 * antérieures, des dividendes partiels régulièrement distribués ainsi que des
 * sommes portées en réserve en application de la loi ou des statuts ».)
 *
 * Deux conséquences pour le logiciel, et une limite :
 *
 *  · l'assiette n'est pas le bénéfice brut mais le bénéfice DIMINUÉ DES PERTES
 *    ANTÉRIEURES · un report à nouveau débiteur s'impute d'abord ;
 *  · la dotation cesse d'être obligatoire à un seuil qui dépend du CAPITAL de
 *    la forme, donnée que le logiciel lit dans le solde du compte où CETTE
 *    forme porte son capital (voir RÉGIME PAR FORME ci-dessous) ;
 *  · la sanction étant la nullité, le contrôle BLOQUE au lieu d'avertir.
 *
 * ── RÉGIME PAR FORME · LE RÉFÉRENTIEL NE SUFFIT PAS ──────────────────────────
 *
 * Le référentiel dit quel PLAN DE COMPTES s'applique. Il ne dit pas quel DROIT
 * DES SOCIÉTÉS s'applique, et la réserve légale est une règle du second, pas
 * du premier. Elle se commande donc sur `Tenant.formeJuridiqueSyscohada`, et
 * l'art. 142 n'y change rien : il fait constituer « les dotations NÉCESSAIRES
 * à la réserve légale », c'est-à-dire celles qu'un autre texte impose · il ne
 * pose ni taux, ni plafond, ni sanction.
 *
 * Deux articles seulement portent le taux, le plafond et la nullité, et chacun
 * ne vise qu'UNE forme :
 *
 *  · art. 346, qui ouvre le chapitre « Droit au dividende » de la SARL et
 *    commence par « La répartition des bénéfices s'effectue conformément aux
 *    statuts » · SARL ;
 *  · art. 546, 2°, qui énumère les compétences de l'assemblée générale
 *    ordinaire de la SOCIÉTÉ ANONYME · SA.
 *
 * Aucun autre. Ce qui a été lu pour les dix autres formes :
 *
 *  · SAS · l'art. 853-3 rend applicables « les règles concernant les sociétés
 *    anonymes, À L'EXCEPTION des articles 387 alinéa 1er, 414 à 561 » · le
 *    546 tombe dans l'exception, et le livre 4-2 (art. 853-1 à 853-23) ne le
 *    remplace par aucune règle de réserve. L'art. 853-11 confie bien aux
 *    associés les attributions « en matière de comptes annuels et de
 *    bénéfices », mais ne pose ni taux ni plafond ;
 *  · SNC et SCS · le livre 1 (SNC) ne contient pas le mot « réserve légale »,
 *    et l'art. 293-1 rend la SCS tributaire des règles de la SNC ;
 *  · GIE · « Il peut être constitué sans capital » (art. 869 al. 3) et « ne
 *    donne pas lieu par lui-même à réalisation et à partage des bénéfices »
 *    (art. 870). Un plafond assis sur le capital n'y a pas d'assiette, et une
 *    réserve prélevée sur un bénéfice que le groupement ne réalise pas
 *    n'aurait pas d'objet ;
 *  · société coopérative · elle relève de l'AUSCOOP, « nonobstant les
 *    dispositions des articles 1er et 6 de l'Acte uniforme relatif au droit
 *    des sociétés commerciales » (AUSCOOP art. 1 al. 3). Sa cascade est
 *    PROPRE et ne se confond pas avec la réserve légale de l'AUSCGIE · voir le
 *    commentaire de son cas plus bas ;
 *  · entreprise individuelle et entreprenant · un commerçant personne physique
 *    (AUDCG art. 2 et 13) et un entreprenant (AUDCG art. 30) ne sont pas des
 *    sociétés : ni assemblée générale, ni capital social, ni délibération à
 *    annuler ;
 *  · succursale · « n'a pas de personnalité juridique autonome, distincte de
 *    celle de la société ou de la personne physique propriétaire » (AUSCGIE
 *    art. 117) · elle n'affecte pas un résultat qui n'est pas le sien ;
 *  · entité publique · aucun texte lu ne lui impose la réserve légale de
 *    l'AUSCGIE ; son capital est un capital PAR DOTATION (AUDCIF, COMPTE 102,
 *    « ne peut être utilisé que dans les entités publiques »).
 *
 * Conséquence tenue par ce fichier : hors SARL et SA, le logiciel N'EXIGE PAS
 * la dotation et LAISSE PASSER l'affectation. Il dit pourquoi, et il ne se tait
 * pas · mais il n'annule pas une délibération qu'aucun texte n'annule.
 */

/** Racines de compte recevant une affectation, par référentiel. */
export interface ReglesAffectation {
  /** Racines admises en contrepartie du compte 13. */
  destinations: string[];
  /** Racines explicitement refusées, avec le motif servi à l'utilisateur. */
  interdits: { racine: string; motif: string }[];
  /** Racine de la réserve légale · absente là où elle n'existe pas. */
  reserveLegale?: string;
  /** Racine du report à nouveau, destination par défaut du solde non affecté. */
  reportANouveau: string;
}

export const REGLES: Record<Referentiel, ReglesAffectation> = {
  [Referentiel.SYSCOHADA]: {
    // 10 Capital (101 social, 103 personnel) · 11 Réserves · 12 Report à
    // nouveau · 465 Associés, dividendes à payer.
    destinations: ['10', '11', '12', '465'],
    interdits: [],
    reserveLegale: '111',
    reportANouveau: '12',
  },
  [Referentiel.SYCEBNL]: {
    // 10 Dotation · 11 Réserves · 12 Report à nouveau. Pas de 465 : son plan
    // ne le porte pas, et une EBNL ne distribue pas.
    destinations: ['10', '11', '12'],
    interdits: [
      {
        racine: '465',
        motif:
          "Le compte 465 « Associés, dividendes à payer » n'existe pas dans le plan SYCEBNL : une entité à but " +
          'non lucratif ne distribue pas de résultat à ses membres · c’est ce qui la définit (SYCEBNL, art. premier).',
      },
    ],
    reportANouveau: '12',
  },
};

/**
 * Ce que le texte impose à UNE forme juridique, et où cette forme porte son
 * capital.
 *
 * `exigee: false` n'est pas « rien à dire » : le motif est servi tel quel à
 * l'utilisateur, et il nomme ce qui a été lu. Une règle absente est déclarée
 * absente · même discipline que `regleRapportGestion` et `regles-auditeur.ts`.
 */
export type RegimeReserveLegale =
  | {
      exigee: true;
      /** L'article qui vise CETTE forme · jamais celui de la forme voisine. */
      source: string;
      /** Racine du compte portant le capital, assiette du plafond du cinquième. */
      capital: string;
    }
  | {
      exigee: false;
      source: string;
      motif: string;
      /** Racine du capital de la forme · `null` quand elle n'en porte pas. */
      capital: string | null;
    };

/**
 * LE CAPITAL N'EST PAS TOUJOURS AU 101.
 *
 * Le plan SYSCOHADA porte trois comptes de capital, et le choix entre eux tient
 * à la forme, pas au goût (AUDCIF, Titre VII) :
 *
 *  · 101 Capital social · les sociétés ;
 *  · 102 Capital par dotation · « ne peut être utilisé que dans les entités
 *    publiques », il « reçoit les fonds de dotation des collectivités
 *    publiques » ;
 *  · 103 Capital personnel · les entités individuelles, dont le 104 (Compte de
 *    l'exploitant) est « un démembrement […] systématiquement soldé à la
 *    clôture » et que l'on ne compte donc pas ici.
 *
 * Lire le seul 101 pour tout le monde donnait un capital NUL à une entreprise
 * individuelle · le plafond du cinquième n'était alors jamais atteint et la
 * dotation était réclamée sans fin. C'est l'un des deux défauts que corrige ce
 * fichier.
 */
export function regimeReserveLegale(forme: FormeJuridiqueSyscohada | null): RegimeReserveLegale {
  if (forme === null) {
    return {
      exigee: false,
      capital: null,
      source: 'AUSCGIE, art. 346 (SARL) et art. 546, 2° (SA)',
      motif:
        "La forme juridique du dossier n'est pas renseignée : la dotation à la réserve légale n'a pas pu être " +
        "contrôlée. Elle n'est imposée qu'à la SARL (AUSCGIE, art. 346) et à la SA (art. 546, 2°) · renseignez la " +
        'forme dans les paramètres du dossier pour que le contrôle s’applique. Elle se lit dans les statuts, elle ' +
        'ne se devine pas · le logiciel ne présume pas une SARL.',
    };
  }
  switch (forme) {
    case FormeJuridiqueSyscohada.SOCIETE_RESPONSABILITE_LIMITEE:
      return {
        exigee: true,
        source: 'AUSCGIE, art. 346 (société à responsabilité limitée)',
        capital: '101',
      };
    case FormeJuridiqueSyscohada.SOCIETE_ANONYME:
      return {
        exigee: true,
        source: 'AUSCGIE, art. 546, 2° (société anonyme)',
        capital: '101',
      };
    case FormeJuridiqueSyscohada.SOCIETE_PAR_ACTIONS_SIMPLIFIEE:
      return {
        exigee: false,
        capital: '101',
        source: 'AUSCGIE, art. 853-3',
        motif:
          "Aucune dotation obligatoire lue pour la société par actions simplifiée : l'article 853-3 rend " +
          'applicables les règles de la société anonyme « à l’exception des articles 387 alinéa 1er, 414 à 561 », ' +
          "et l'article 546, 2°, qui porte la dotation d'un dixième, tombe dans cette exception ; le livre de la " +
          'SAS (art. 853-1 à 853-23) ne la rétablit pas. La dotation reste possible et se règle alors aux statuts ' +
          '(art. 853-1 : « les statuts prévoient librement l’organisation et le fonctionnement de la société »).',
      };
    case FormeJuridiqueSyscohada.SOCIETE_NOM_COLLECTIF:
      return {
        exigee: false,
        capital: '101',
        source: 'AUSCGIE, livre 1 (art. 270 et suivants)',
        motif:
          "Aucune dotation obligatoire lue pour la société en nom collectif : le livre qui la régit ne porte pas " +
          "de réserve légale, et les deux articles qui l'imposent visent la SARL (art. 346) et la SA " +
          '(art. 546, 2°). L’article 142 fait constituer « les dotations NÉCESSAIRES à la réserve légale » · ' +
          'la nécessité vient d’un autre texte, et il n’y en a pas ici. Les statuts peuvent en prévoir une.',
      };
    case FormeJuridiqueSyscohada.SOCIETE_COMMANDITE_SIMPLE:
      return {
        exigee: false,
        capital: '101',
        source: 'AUSCGIE, art. 293-1',
        motif:
          "Aucune dotation obligatoire lue pour la société en commandite simple : « Les dispositions relatives aux " +
          'sociétés en nom collectif sont applicables aux sociétés en commandite simple » (art. 293-1), et la SNC ' +
          "n'est tenue à aucune réserve légale. Les statuts peuvent en prévoir une.",
      };
    case FormeJuridiqueSyscohada.GROUPEMENT_INTERET_ECONOMIQUE:
      return {
        exigee: false,
        capital: null,
        source: 'AUSCGIE, art. 869 al. 3 et art. 870',
        motif:
          "Aucune dotation obligatoire pour le groupement d'intérêt économique : « Il peut être constitué sans " +
          'capital » (art. 869 al. 3), de sorte que le plafond du cinquième du capital social n’a pas d’assiette, ' +
          'et le groupement « ne donne pas lieu par lui-même à réalisation et à partage des bénéfices » ' +
          '(art. 870). Les articles 346 et 546, 2° ne le visent pas · c’est le contrat constitutif qui règle ' +
          "l'affectation (art. 876).",
      };
    case FormeJuridiqueSyscohada.SOCIETE_COOPERATIVE:
      // La coopérative a sa PROPRE cascade, et elle n'est PAS la réserve légale
      // de l'AUSCGIE · lui servir le dixième de l'art. 546 serait deux fautes à
      // la fois : le mauvais texte, et un minimum inférieur au sien.
      //
      // AUSCOOP art. 114 : « Les statuts prévoient, AVANT TOUTE AUTRE
      // AFFECTATION, la constitution d'une réserve générale par prélèvements
      // annuels sur les excédents nets d'exploitation », plus une seconde
      // réserve « destinée à la formation, à l'éducation et à la sensibilisation
      // aux principes coopératifs », et « Tant que CHACUNE de ces réserves
      // légales n'atteint pas LE MONTANT DU CAPITAL FIXÉ PAR LES STATUTS, les
      // prélèvements opérés au titre de chaque réserve ne peuvent être
      // inférieurs à VINGT POUR CENT des excédents nets d'exploitation. »
      //
      // Trois données manquent au logiciel pour CONTRÔLER cette cascade, et
      // aucune ne se devine : (1) les « excédents nets d'exploitation », qui ne
      // sont pas définis par l'AUSCOOP et ne se confondent pas avec le résultat
      // net du compte 13 ; (2) « le montant du capital fixé par les statuts »,
      // qui est une donnée statutaire et non un solde de compte, le capital
      // coopératif étant variable ; (3) le compte qui reçoit chacune des deux
      // réserves, le 111 « Réserve légale » n'étant pas nommé par le texte.
      //
      // Donc on N'EXIGE RIEN et on ne bloque pas · mais on dit le texte, pour
      // que la coopérative dote en connaissance de cause. Contrôler à 10 % ce
      // que la loi veut à 20 % serait pire que ne rien contrôler : ce serait
      // faire croire au contrôle.
      return {
        exigee: false,
        capital: '101',
        source: 'AUSCOOP, art. 113 et 114',
        motif:
          "La société coopérative relève de l'AUSCOOP, « nonobstant les dispositions des articles 1er et 6 de " +
          "l'Acte uniforme relatif au droit des sociétés commerciales » (AUSCOOP, art. 1 al. 3) : la réserve " +
          "légale de l'AUSCGIE ne lui est PAS applicable, et le logiciel ne l'exige donc pas. Sa cascade est " +
          'propre et le logiciel ne la contrôle pas : « Les statuts prévoient, avant toute autre affectation, la ' +
          "constitution d'une réserve générale par prélèvements annuels sur les excédents nets d'exploitation », " +
          "ainsi qu'une réserve « destinée à la formation, à l'éducation et à la sensibilisation aux principes " +
          "coopératifs », et « tant que chacune de ces réserves légales n'atteint pas le montant du capital fixé " +
          'par les statuts, les prélèvements opérés au titre de chaque réserve ne peuvent être inférieurs à vingt ' +
          "pour cent des excédents nets d'exploitation » (art. 114). Vérifiez ces deux dotations sur vos statuts " +
          "avant d'enregistrer · le logiciel ne dispose ni des excédents nets d'exploitation au sens de ce texte, " +
          'ni du capital fixé par les statuts.',
      };
    case FormeJuridiqueSyscohada.ENTREPRISE_INDIVIDUELLE:
      return {
        exigee: false,
        // AUDCIF, COMPTE 103 « Capital personnel » · le capital des entités
        // individuelles n'est pas au 101, et le lire au 101 donnait zéro.
        capital: '103',
        source: 'AUDCG, art. 2 et 13 · AUSCGIE, art. 346 et 546, 2° a contrario',
        motif:
          "Aucune dotation obligatoire pour une entreprise individuelle : le commerçant personne physique " +
          "(AUDCG, art. 2 et 13) n'est pas une société, il n'a ni assemblée générale ni capital social, et les " +
          'deux articles qui imposent la réserve légale visent la SARL (art. 346) et la SA (art. 546, 2°). Son ' +
          'capital figure au compte 103 « Capital personnel » (AUDCIF, Titre VII).',
      };
    case FormeJuridiqueSyscohada.ENTREPRENANT:
      return {
        exigee: false,
        capital: '103',
        source: 'AUDCG, art. 30 · AUSCGIE, art. 346 et 546, 2° a contrario',
        motif:
          "Aucune dotation obligatoire pour un entreprenant : l'AUDCG (art. 30) en fait un entrepreneur " +
          "individuel, dispensé d'immatriculation au registre du commerce et du crédit mobilier · ni société, ni " +
          'assemblée, ni capital social. Son capital figure au compte 103 « Capital personnel » (AUDCIF, ' +
          'Titre VII).',
      };
    case FormeJuridiqueSyscohada.SUCCURSALE:
      return {
        exigee: false,
        capital: null,
        source: 'AUSCGIE, art. 117',
        motif:
          "Aucune dotation obligatoire pour une succursale : elle « n'a pas de personnalité juridique autonome, " +
          "distincte de celle de la société ou de la personne physique propriétaire » (art. 117), et ses droits " +
          'et obligations « sont compris dans le patrimoine » de celle-ci. Elle n’a pas de capital propre, et ' +
          'l’affectation du résultat se décide chez le propriétaire, selon la forme de CELUI-CI.',
      };
    case FormeJuridiqueSyscohada.ENTITE_PUBLIQUE:
      return {
        exigee: false,
        // AUDCIF, COMPTE 102 « Capital par dotation » · « ne peut être utilisé
        // que dans les entités publiques ».
        capital: '102',
        source: 'AUDCIF, art. 2 et COMPTE 102 · AUSCGIE, art. 346 et 546, 2° a contrario',
        motif:
          "Aucune dotation à la réserve légale de l'AUSCGIE n'a été lue pour une entité publique : les articles " +
          '346 et 546, 2° visent la SARL et la SA. Son capital est un capital PAR DOTATION, au compte 102, qui ' +
          '« ne peut être utilisé que dans les entités publiques » (AUDCIF, Titre VII). Les textes propres à ' +
          "l'entité (statuts, loi ou règlement qui la crée) peuvent prévoir leurs propres prélèvements.",
      };
    case FormeJuridiqueSyscohada.AUTRE:
      return {
        exigee: false,
        capital: null,
        source: 'AUSCGIE, art. 346 (SARL) et art. 546, 2° (SA)',
        motif:
          'La forme du dossier est enregistrée comme « Autre » : aucun texte ne peut lui être rattaché avec ' +
          "certitude, et le logiciel n'exige donc pas la dotation. Elle n'est imposée qu'à la SARL (AUSCGIE, " +
          'art. 346) et à la SA (art. 546, 2°) : si le dossier est l’une des deux, corrigez sa forme dans les ' +
          'paramètres pour que le contrôle s’applique.',
      };
  }
}

/**
 * Où lire le capital de ce dossier · `null` quand il n'y a pas de capital à
 * lire.
 *
 * Le SYCEBNL n'a pas de capital social : son compte 10 est une DOTATION, et le
 * lire comme un capital social ferait apparaître au plafond de la réserve
 * légale une donnée qui n'en est pas une. La réserve légale n'existant pas non
 * plus dans ce référentiel, la question ne se pose que pour l'affichage · on
 * répond zéro plutôt qu'un chiffre mal nommé.
 */
export function racineCapital(
  referentiel: Referentiel,
  forme: FormeJuridiqueSyscohada | null,
): string | null {
  if (referentiel !== Referentiel.SYSCOHADA) return null;
  return regimeReserveLegale(forme).capital;
}

/**
 * La dotation minimale à la réserve légale, et le motif quand elle ne
 * s'impose pas.
 *
 * `null` en dotation signifie « aucune dotation obligatoire » · soit parce que
 * le référentiel ne connaît pas la réserve légale, soit parce que la FORME
 * JURIDIQUE n'est visée par aucun texte, soit parce que l'exercice est
 * déficitaire, soit parce que le plafond du cinquième du capital est déjà
 * atteint. Le motif accompagne toujours la réponse : un contrôle qui se tait
 * ne se vérifie pas.
 */
export function dotationReserveLegale(params: {
  referentiel: Referentiel;
  /**
   * Forme juridique du dossier · `null` si elle n'est pas renseignée, ou si le
   * dossier n'est pas SYSCOHADA. C'est ELLE qui commande l'obligation, pas le
   * seul référentiel : la réserve légale est une règle du droit des sociétés.
   */
  forme: FormeJuridiqueSyscohada | null;
  /** Bénéfice de l'exercice, positif · zéro ou moins si déficitaire. */
  benefice: number;
  /** Pertes antérieures à imputer d'abord (report à nouveau débiteur), positif. */
  pertesAnterieures: number;
  /** Solde actuel de la réserve légale (111), positif. */
  reserveExistante: number;
  /** Capital de la forme (101, 102 ou 103 selon le cas), positif. */
  capitalSocial: number;
}): { dotation: number | null; motif: string } {
  const regles = REGLES[params.referentiel];
  if (!regles.reserveLegale) {
    return {
      dotation: null,
      motif:
        "La réserve légale est une obligation du droit des sociétés commerciales (AUSCGIE) · elle ne s'applique " +
        'pas à une entité à but non lucratif.',
    };
  }
  // LA FORME AVANT LE CHIFFRE · une forme que ni l'art. 346 ni l'art. 546, 2°
  // ne visent n'a rien à doter, et l'affectation doit passer. Refuser aurait
  // annulé une délibération qu'aucun texte n'annule, et empêché la clôture.
  const regime = regimeReserveLegale(params.forme);
  if (!regime.exigee) {
    return { dotation: null, motif: regime.motif };
  }
  // « sur le bénéfice de l'exercice diminué, le cas échéant, des pertes
  // antérieures » · l'assiette, et non le bénéfice brut.
  const assiette = Math.round((params.benefice - params.pertesAnterieures) * 100) / 100;
  if (assiette <= 0) {
    return {
      dotation: null,
      motif:
        'Aucune dotation obligatoire : le bénéfice de l’exercice, diminué des pertes antérieures, ne laisse rien ' +
        `à doter (${regime.source}).`,
    };
  }
  // « Cette dotation cesse d'être obligatoire lorsque la réserve atteint le
  // cinquième du montant du capital social. »
  const plafond = Math.round((params.capitalSocial / 5) * 100) / 100;
  if (params.capitalSocial > 0 && params.reserveExistante >= plafond) {
    return {
      dotation: null,
      motif:
        `Aucune dotation obligatoire : la réserve légale (${params.reserveExistante.toFixed(2)}) atteint déjà le ` +
        `cinquième du capital social (${plafond.toFixed(2)}), seuil au-delà duquel la dotation cesse d'être ` +
        `obligatoire (${regime.source}).`,
    };
  }
  const dixieme = Math.round(assiette * 0.1 * 100) / 100;
  // La dotation ne peut pas dépasser ce qui manque pour atteindre le plafond :
  // au-delà, elle n'est plus obligatoire, et l'imposer serait ajouter au texte.
  const manquant =
    params.capitalSocial > 0 ? Math.round((plafond - params.reserveExistante) * 100) / 100 : dixieme;
  const dotation = Math.min(dixieme, manquant);
  return {
    dotation,
    motif:
      `Un dixième au moins du bénéfice diminué des pertes antérieures (${assiette.toFixed(2)}), soit ` +
      `${dotation.toFixed(2)} · dotation obligatoire à peine de nullité de la délibération contraire ` +
      `(${regime.source}).`,
  };
}
