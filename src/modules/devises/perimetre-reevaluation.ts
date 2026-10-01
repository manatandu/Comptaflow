import { Referentiel } from '@prisma/client';

/**
 * CE QUI SE RÉÉVALUE À LA CLÔTURE, ET CE QUI NE SE RÉÉVALUE JAMAIS.
 *
 * AUDCIF Titre VIII ch. 22 sépare les BIENS (section 1) des CRÉANCES ET
 * DETTES (section 2) et des DISPONIBILITÉS (section 4) :
 *
 *  · § 1.1, immobilisations incorporelles et corporelles · converties « sur
 *    la base du cours de change du jour de l'acquisition », amortissements et
 *    dépréciations « calculés sur cette valeur », et « c'est seulement au
 *    moment où les immobilisations sortent de l'actif que le gain (ou la
 *    perte) [...] est définitivement dégagé » ;
 *  · § 1.2, avances et acomptes sur immobilisations · « n'est pas converti au
 *    cours du change de clôture. Aucun écart de conversion n'est constaté » ;
 *  · § 1.3, titres · « prix d'acquisition, converti au cours du jour de
 *    l'opération » (la part non libérée est une DETTE, au 4, et se réévalue) ;
 *  · § 1.4, stocks · méthodes propres (moyenne pondérée des cours d'entrée,
 *    cours d'achat…), qui ne sont pas un écart de conversion au 478 / 479 ;
 *  · § 2.2, « lorsqu'elles subsistent à l'inventaire, les créances et dettes
 *    en monnaies étrangères sont converties sur la base du dernier cours de
 *    change à la date de clôture » ;
 *  · section 4 (art. 58), disponibilités au cours de clôture.
 *
 * Jusqu'ici `DevisesService.calculer` réévaluait TOUTE ligne en devise non
 * lettrée · un 24 saisi en USD recevait un écart de conversion, écriture
 * équilibrée, bilan faux sans qu'aucun total ne le dise.
 *
 * La liste est POSITIVE (ce qui se réévalue), jamais négative · un compte
 * nouveau reste hors réévaluation jusqu'à ce que quelqu'un décide. Les
 * comptes de gestion (classes 6 à 8) portent des flux convertis au jour de
 * l'opération et ne sont pas des positions.
 *
 * UN NUMÉRO, DEUX SENS · en classe 1, seules les DETTES se réévaluent, et
 * elles ne portent pas les mêmes numéros. SYSCOHADA · 16 « Emprunts et dettes
 * assimilées », 17 « Dettes de location acquisition », 18 « Dettes liées à
 * des participations et comptes de liaison ». SYCEBNL · 16 « Fonds affectés »
 * et 17 « Fonds reportés » sont des FONDS PROPRES, seul le 18 « Emprunts et
 * dettes assimilées » est une dette (semis des deux plans). Le 27 « Autres
 * immobilisations financières » (prêts, dépôts, cautionnements) est une
 * CRÉANCE aux deux plans et reste réévalué, le 26 (titres) non (§ 1.3).
 */
const DETTES_CLASSE_1: Record<Referentiel, RegExp> = {
  [Referentiel.SYSCOHADA]: /^(16|17|18)/,
  [Referentiel.SYCEBNL]: /^18/,
};

/** Créances immobilisées (27) et toute la classe 4 (tiers) et 5 (trésorerie). */
const CREANCES_DETTES_TRESORERIE = /^(27|4|5)/;

export function seReevalueALaCloture(numero: string, referentiel: Referentiel): boolean {
  return CREANCES_DETTES_TRESORERIE.test(numero) || DETTES_CLASSE_1[referentiel].test(numero);
}

/** Pourquoi une position en devise ne reçoit pas d'écart, dit à l'écran. */
export function motifHorsReevaluation(numero: string, referentiel: Referentiel): string | null {
  if (seReevalueALaCloture(numero, referentiel)) return null;
  if (/^25/.test(numero))
    return "avance sur immobilisation · aucun écart de conversion (AUDCIF Titre VIII ch. 22 § 1.2)";
  if (/^26/.test(numero)) return "titres · maintenus au cours du jour de l'acquisition (AUDCIF Titre VIII ch. 22 § 1.3)";
  if (/^2/.test(numero))
    return "immobilisation · maintenue au cours du jour de l'acquisition, écart dégagé à la sortie seulement (AUDCIF Titre VIII ch. 22 § 1.1)";
  if (/^3/.test(numero)) return 'stock · évalué selon le § 1.4 (AUDCIF Titre VIII ch. 22), pas par écart de conversion';
  if (/^1/.test(numero)) return 'fonds propres · ni créance ni dette (AUDCIF Titre VIII ch. 22 § 2.2)';
  return "compte de gestion · flux converti au cours du jour de l'opération";
}
