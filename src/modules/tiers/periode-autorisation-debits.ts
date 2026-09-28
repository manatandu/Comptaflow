/**
 * LA PÉRIODE DE L'AUTORISATION D'ACQUITTER LA TVA D'APRÈS LES DÉBITS, portée
 * par la fiche du FOURNISSEUR.
 *
 * Sources lues (compétence `fiscalite-rdc`) :
 *
 *  · O.-L. n° 10/001, art. 26 (`code-general-2026/references/
 *    10-tva-ol10-001-loi-base-ch1-10.md`, l. 647-661) : les prestataires
 *    « peuvent être autorisés à acquitter la taxe sur la valeur ajoutée
 *    d'après les débits sur décision du Directeur Général des Impôts ou son
 *    délégué en province. Dans ce cas, l'exigibilité est constituée par
 *    l'inscription au débit du compte du client. / L'autorisation demeure
 *    valable tant que le redevable n'a pas demandé, par écrit, de revenir au
 *    régime de droit commun dans les conditions fixées par voie
 *    réglementaire. »
 *  · Décret n° 011/42, art. 59 (`code-general-2026/references/
 *    11-tva-decret-application-ch1-4.md`, l. 1781-1785) : « La décision du
 *    Directeur Général des Impôts ou de son délégué en Province intervient
 *    dans les dix jours qui suivent la réception de la demande. L'absence de
 *    décision dans ce délai vaut autorisation. »
 *  · Décret n° 011/42, art. 63 (même fichier, l. 1802-1806) : « L'autorisation
 *    d'acquitter la taxe sur la valeur ajoutée d'après les débits est
 *    révocable sur simple demande écrite du contribuable qui souhaite revenir
 *    au régime de droit commun. »
 *
 * CE QUE LES TEXTES NE DISENT PAS, ET QUI N'EST PAS INVENTÉ. Aucun ne fixe la
 * date d'effet du RETOUR au droit commun · ni la date de la demande, ni celle
 * de sa réception, ni une fin de mois. La date de révocation est donc celle
 * que le cabinet saisit, et le droit commun reprend à cette date, comprise.
 * La date d'effet, elle, est la date de la décision ou celle où le silence
 * de dix jours vaut autorisation · OmegaX ne connaît pas la date de la
 * demande et ne la calcule pas.
 */

/** Ce que la fiche dit du fournisseur à la date d'une opération. */
export type SituationAutorisationDebits =
  /** Autorisé, la date tombe dans la période datée. */
  | 'AUTORISE'
  /**
   * Autorisé, SANS date d'effet saisie. L'anticipation est GARDÉE · c'était
   * la seule lecture possible avant que la fiche porte une date, et retirer
   * d'office des déductions déjà déclarées sur la foi de la fiche changerait
   * les déclarations passées sans qu'aucune donnée nouvelle ne le justifie.
   * Mais elle n'est pas prouvée pour cette date, et la déclaration le DIT.
   */
  | 'AUTORISE_NON_DATE'
  /** Autorisé, mais l'opération précède la date d'effet · droit commun. */
  | 'AVANT_EFFET'
  /** Autorisé, mais l'opération suit le retour au droit commun · droit commun. */
  | 'REVOQUEE'
  /** Aucune autorisation saisie · droit commun (ce qui ne veut pas dire « non autorisé »). */
  | 'NON_AUTORISE';

export type FicheAutorisationDebits = {
  autoriseTvaDebits: boolean;
  dateEffetAutorisationDebits?: Date | null;
  dateRevocationAutorisationDebits?: Date | null;
};

/**
 * La date d'une opération tombe-t-elle dans la période d'autorisation ?
 * La date comparée est celle que la déclaration de TVA retient pour
 * l'exigibilité aux débits · la date de l'écriture, qui porte l'inscription au
 * débit du compte du client (décret art. 61). Les bornes sont des jours à
 * minuit UTC, comme les dates d'écriture · début compris, révocation comprise
 * dans le droit commun.
 */
export function situationAutorisationDebits(
  fiche: FicheAutorisationDebits,
  dateOperation: Date,
): SituationAutorisationDebits {
  if (!fiche.autoriseTvaDebits) return 'NON_AUTORISE';
  const revocation = fiche.dateRevocationAutorisationDebits ?? null;
  if (revocation && dateOperation.getTime() >= revocation.getTime()) return 'REVOQUEE';
  const effet = fiche.dateEffetAutorisationDebits ?? null;
  if (!effet) return 'AUTORISE_NON_DATE';
  if (dateOperation.getTime() < effet.getTime()) return 'AVANT_EFFET';
  return 'AUTORISE';
}

/**
 * Une période qui s'éteint le jour où elle naît, ou avant, ne couvre aucune
 * opération · la saisir serait une erreur de frappe, et elle ferait passer en
 * droit commun toutes les factures du fournisseur sans que rien ne le montre.
 */
export function motifRefusPeriodeAutorisationDebits(
  effet: Date | null | undefined,
  revocation: Date | null | undefined,
): string | null {
  if (effet && revocation && revocation.getTime() <= effet.getTime()) {
    return (
      'La date de révocation de l’autorisation aux débits doit suivre sa date d’effet · le retour au droit commun ' +
      '(O.-L. n° 10/001, art. 26 al. 2 ; décret n° 011/42, art. 63) ne peut précéder la décision qui l’a accordée ' +
      '(décret art. 59).'
    );
  }
  return null;
}
