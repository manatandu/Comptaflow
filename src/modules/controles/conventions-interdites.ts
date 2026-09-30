import { FormeJuridiqueSyscohada } from '@prisma/client';

/**
 * LE PRÊT OU LE DÉCOUVERT EN COMPTE COURANT QUE L'AUSCGIE ANNULE (passes
 * O1b-A5, B3 et C5).
 *
 * Le contrôle COMPTE_COURANT_ASSOCIE_DEBITEUR ne lisait le 462 débiteur que
 * sous l'angle fiscal, et invitait à le justifier par une « convention de
 * prêt ». Or trois sociétés commerciales sur cinq interdisent ce prêt, À
 * PEINE DE NULLITÉ, à certaines personnes · chacune par son propre article,
 * lu, et jamais transposé de l'une à l'autre :
 *
 *  · SARL, art. 356 · « il est interdit aux personnes physiques, gérantes ou
 *    associées, de contracter, sous quelque forme que ce soit, des emprunts
 *    auprès de la société, de se faire consentir par elle un découvert en
 *    compte-courant », conjoints, ascendants, descendants et personnes
 *    interposées compris. Aucune exception bancaire ;
 *  · SA, art. 450 (administrateurs, directeurs généraux et adjoints ; pas les
 *    personnes morales administrateurs, sauf leur représentant permanent
 *    agissant à titre personnel) et art. 507 (administrateur général et son
 *    adjoint) · exception des opérations courantes à conditions normales d'un
 *    établissement bancaire ou financier ;
 *  · SAS, art. 853-16 · le président et les dirigeants, personnes morales
 *    dirigeantes exclues. L'art. 853-3 écarte les art. 414 à 561 · les
 *    art. 450 et 507 ne lui sont donc pas servis.
 *
 * OmegaX ne sait pas qui est titulaire du compte · la règle est ÉNONCÉE sous
 * sa condition, aucun solde n'est qualifié. Les autres formes (SNC, SCS,
 * GIE, coopérative, succursale) rendent `null` · aucun article lu.
 */
export function conventionInterditeCompteCourant(forme: FormeJuridiqueSyscohada | null): string | null {
  switch (forme) {
    case FormeJuridiqueSyscohada.SOCIETE_RESPONSABILITE_LIMITEE:
      return (
        'Dans une SARL, si le titulaire du compte est un gérant ou un associé personne physique, ou son conjoint, ' +
        'ascendant, descendant ou une personne interposée, l’emprunt et le découvert en compte courant sont ' +
        'interdits à peine de nullité (AUSCGIE art. 356) · une convention de prêt ne le régularise pas. ' +
        'L’article ne vise pas l’associé personne morale.'
      );
    case FormeJuridiqueSyscohada.SOCIETE_ANONYME:
      return (
        'Dans une société anonyme, si le titulaire du compte est un administrateur, le directeur général, un ' +
        'directeur général adjoint, l’administrateur général ou son adjoint, ou leur conjoint, ascendant, ' +
        'descendant ou une personne interposée, l’emprunt et le découvert en compte courant sont interdits à ' +
        'peine de nullité (AUSCGIE art. 450 et 507), sauf pour un établissement bancaire ou financier et des ' +
        'opérations courantes à conditions normales. L’art. 450 ne vise pas l’administrateur personne morale.'
      );
    case FormeJuridiqueSyscohada.SOCIETE_PAR_ACTIONS_SIMPLIFIEE:
      return (
        'Dans une SAS, si le titulaire du compte est le président ou un dirigeant, ou son conjoint, ascendant, ' +
        'descendant ou une personne interposée, l’emprunt et le découvert en compte courant sont interdits à ' +
        'peine de nullité (AUSCGIE art. 853-16) · l’article ne vise pas les personnes morales dirigeantes.'
      );
    default:
      return null;
  }
}
