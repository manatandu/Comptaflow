import { FormeJuridiqueEbnl } from '@prisma/client';

/**
 * LES QUATRE CONDITIONS DE L'ARTICLE 37, ET CE QUE LE LOGICIEL NE TENAIT PAS.
 *
 * `exemption-is-ebnl.ts` écrivait en toutes lettres, depuis le chantier G4a,
 * que « OmegaX NE TIENT PAS l'accord-cadre : le dossier ne porte qu'un
 * certificat d'enregistrement du Ministère du Plan, qui est une autre pièce ».
 * Manque DÉCLARÉ, et c'est celui-ci qui se ferme.
 *
 * Loi n° 004/2001, art. 37, sous-section « Des organisations Non-
 * Gouvernementales Etrangères » · quatre conditions CUMULATIVES :
 *
 *  1. « avoir une représentation en République Démocratique du Congo » ;
 *  2. « conclure un accord-cadre avec le Ministère ayant le plan dans ses
 *     attributions » ;
 *  3. « produire une attestation de bonne conduite, vie et mœurs pour le
 *     personnel expatrié dûment légalisée par l'Ambassade ou le Consulat de la
 *     République Démocratique du Congo dans le pays où se trouve le siège » ;
 *  4. « utiliser la main d'œuvre locale à concurrence de 60% au minimum ».
 *
 * NE TENIR QUE L'ACCORD-CADRE AURAIT RECRÉÉ LE MÊME MANQUE PARTIEL. Les quatre
 * se lisent ensemble, et une ONG qui aurait l'accord sans les trois autres ne
 * remplit pas l'art. 37 · le module les porte donc toutes les quatre.
 *
 * LE PÉRIMÈTRE EST LE PREMIER REFUS, et c'est le § 10 bis. La sous-section ne
 * vise QUE l'organisation ÉTRANGÈRE, et l'art. 35 réserve le mot ONG à
 * « l'association sans but lucratif dotée de la personnalité juridique dont
 * l'objet concourt au développement social, culturel et économique des
 * communautés locales ». Réclamer un accord-cadre à une ONG de droit
 * CONGOLAIS, à une association confessionnelle ou à un établissement d'utilité
 * publique serait une exigence inventée, sourcée, plausible et fausse.
 *
 * ET L'ACCORD-CADRE N'OUVRE PAS LES FACILITÉS · c'est la confusion que ce
 * module doit empêcher. L'art. 39 dit que les facilités « seront expressément
 * déterminées par le Ministre ayant le plan dans ses attributions, APRÈS
 * l'obtention de la personnalité juridique », et que leur octroi « est constaté
 * par un ARRÊTÉ INTERMINISTÉRIEL des Ministres du Plan et des Finances ». Deux
 * pièces, deux effets : l'accord-cadre conditionne l'EXISTENCE de l'ONG
 * étrangère en RDC (art. 37), l'arrêté interministériel ouvre les
 * EXONÉRATIONS (art. 39, et c'est le module `exonerations` qui le tient).
 * Croire qu'un accord signé exonère ferait dédouaner sur une pièce qui ne le
 * permet pas.
 */

/** Ce que le dossier doit être pour que l'art. 37 le vise. */
export function articleTrenteSeptApplicable(
  formeJuridique: FormeJuridiqueEbnl,
  droitEtranger: boolean,
): boolean {
  return formeJuridique === FormeJuridiqueEbnl.ORGANISATION_NON_GOUVERNEMENTALE && droitEtranger;
}

/**
 * PART MINIMALE DE MAIN-D'ŒUVRE LOCALE · « à concurrence de 60% au minimum »,
 * art. 37, point 4. Le seul chiffre que l'article donne.
 */
export const PART_MAIN_OEUVRE_LOCALE_MINIMALE = 60;

/**
 * DURÉE DE L'ACCORD · LA LOI N'EN FIXE AUCUNE, et c'est le piège de ce
 * chantier.
 *
 * Les dix ans « renouvelable par tacite reconduction, à moins d'être dénoncé
 * par l'une des parties 6 mois avant la fin de chaque période » viennent de
 * l'article IX du MODÈLE d'accord-cadre de partenariat annexé au guide
 * pratique du cabinet Kahasha (annexe VIII) · un MODÈLE, pas le texte légal.
 * L'art. 37 de la loi n° 004/2001 ne dit rien de la durée.
 *
 * Les coder en dur ferait passer une clause de modèle pour une règle de droit,
 * et un accord réellement conclu pour trois ans serait lu sur dix. La durée et
 * le préavis sont donc SAISIS, et ces valeurs ne sont proposées qu'en citant
 * leur origine.
 */
export const MODELE_KAHASHA = {
  dureeAnnees: 10,
  preavisMois: 6,
  source:
    "Article IX du MODÈLE d'accord-cadre de partenariat, annexe VIII du guide pratique pour la constitution " +
    "des ONG en RDC (cabinet Kahasha) · ce n'est PAS une règle de la loi n° 004/2001, dont l'art. 37 ne fixe " +
    'aucune durée. À confronter à l’accord réellement signé.',
} as const;

export interface EtatAccordCadre {
  /** Dernier jour de la période en cours. */
  finDePeriode: Date;
  /**
   * VRAI quand la période est passée. Ce n'est PAS « expiré » · voir
   * `enTaciteReconduction`.
   */
  periodeEcoulee: boolean;
  /**
   * UNE PÉRIODE ÉCOULÉE N'EST PAS UNE FIN. Sous tacite reconduction, l'accord
   * repart pour une période identique tant qu'aucune partie ne l'a dénoncé ·
   * exactement la même forme que la prorogation de plein droit du mandat de
   * l'auditeur (SYCEBNL art. 22), rencontrée au chantier précédent. Annoncer
   * « accord expiré » sur une tacite reconduction serait un signalement faux.
   */
  enTaciteReconduction: boolean;
  /**
   * DERNIER JOUR POUR DÉNONCER la période en cours · fin moins le préavis.
   * C'est la seule date que le cabinet puisse encore utiliser, et celle que
   * l'accord ne calcule pas lui-même.
   */
  dernierJourPourDenoncer: Date | null;
}

/**
 * Période en cours d'un accord à tacite reconduction. Les périodes se suivent
 * de `dureeAnnees` en `dureeAnnees` à compter de la signature · c'est ce que
 * « chaque période » du modèle désigne.
 */
export function etatAccordCadre(params: {
  dateSignature: Date;
  dureeAnnees: number;
  taciteReconduction: boolean;
  preavisMois: number | null;
  denonceLe: Date | null;
  reference: Date;
}): EtatAccordCadre {
  const { dateSignature, dureeAnnees, taciteReconduction, preavisMois, denonceLe, reference } = params;

  const finDe = (rang: number) => {
    const d = new Date(dateSignature);
    d.setUTCFullYear(d.getUTCFullYear() + dureeAnnees * rang);
    return d;
  };

  let rang = 1;
  let fin = finDe(rang);
  if (taciteReconduction && !denonceLe) {
    // Avancer de période en période jusqu'à celle qui couvre la référence.
    // Bornée à cent tours · une durée nulle ou négative boucle sinon, et un
    // écran qui ne répond plus est un écran qu'on ferme.
    while (fin.getTime() <= reference.getTime() && rang < 100 && dureeAnnees > 0) {
      rang += 1;
      fin = finDe(rang);
    }
  }

  const dernierJourPourDenoncer =
    preavisMois === null
      ? null
      : (() => {
          const d = new Date(fin);
          d.setUTCMonth(d.getUTCMonth() - preavisMois);
          return d;
        })();

  return {
    finDePeriode: fin,
    periodeEcoulee: fin.getTime() <= reference.getTime(),
    enTaciteReconduction: taciteReconduction && !denonceLe,
    dernierJourPourDenoncer,
  };
}
