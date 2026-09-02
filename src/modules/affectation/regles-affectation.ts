import { Referentiel } from '@prisma/client';

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
 * — « L'assemblée générale décide de l'affectation du résultat dans le respect
 * des dispositions légales et statutaires. Elle constitue les dotations
 * nécessaires à la réserve légale et aux réserves statutaires » — complété par
 * l'art. 143, qui définit le bénéfice distribuable comme « le résultat de
 * l'exercice, augmenté du report bénéficiaire et diminué des pertes
 * antérieures, des dividendes partiels régulièrement distribués ainsi que des
 * sommes portées en réserve en application de la loi ou des statuts ».)
 *
 * Deux conséquences pour le logiciel, et une limite :
 *
 *  · l'assiette n'est pas le bénéfice brut mais le bénéfice DIMINUÉ DES PERTES
 *    ANTÉRIEURES · un report à nouveau débiteur s'impute d'abord ;
 *  · la dotation cesse d'être obligatoire à un seuil qui dépend du CAPITAL
 *    SOCIAL, donnée que le logiciel lit dans le solde du compte 101 ;
 *  · la sanction étant la nullité, le contrôle BLOQUE au lieu d'avertir.
 */

/** Racines de compte recevant une affectation, par référentiel. */
export interface ReglesAffectation {
  /** Racines admises en contrepartie du compte 13. */
  destinations: string[];
  /** Racines explicitement refusées, avec le motif servi à l'utilisateur. */
  interdits: { racine: string; motif: string }[];
  /** Racine de la réserve légale · absente là où elle n'existe pas. */
  reserveLegale?: string;
  /** Racine du capital social, assiette du plafond de la réserve légale. */
  capitalSocial?: string;
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
    capitalSocial: '101',
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
 * La dotation minimale à la réserve légale, et le motif quand elle ne
 * s'impose pas.
 *
 * `null` en dotation signifie « aucune dotation obligatoire » · soit parce que
 * le référentiel ne connaît pas la réserve légale, soit parce que l'exercice
 * est déficitaire, soit parce que le plafond du cinquième du capital est déjà
 * atteint. Le motif accompagne toujours la réponse : un contrôle qui se tait
 * ne se vérifie pas.
 */
export function dotationReserveLegale(params: {
  referentiel: Referentiel;
  /** Bénéfice de l'exercice, positif · zéro ou moins si déficitaire. */
  benefice: number;
  /** Pertes antérieures à imputer d'abord (report à nouveau débiteur), positif. */
  pertesAnterieures: number;
  /** Solde actuel de la réserve légale (111), positif. */
  reserveExistante: number;
  /** Capital social appelé (101), positif. */
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
  // « sur le bénéfice de l'exercice diminué, le cas échéant, des pertes
  // antérieures » · l'assiette, et non le bénéfice brut.
  const assiette = Math.round((params.benefice - params.pertesAnterieures) * 100) / 100;
  if (assiette <= 0) {
    return {
      dotation: null,
      motif:
        'Aucune dotation obligatoire : le bénéfice de l’exercice, diminué des pertes antérieures, ne laisse rien ' +
        'à doter (AUSCGIE, art. 346 et 546, 2°).',
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
        "obligatoire (AUSCGIE, art. 346 et 546, 2°).",
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
      '(AUSCGIE, art. 346 pour la SARL et art. 546, 2° pour la SA).',
  };
}
