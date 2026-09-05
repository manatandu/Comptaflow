/**
 * LA MONNAIE DE TENUE · elle ne se choisit pas.
 *
 * Loi n° 23/053 du 5 décembre 2023, art. 141, 1° · les redevables sont dans
 * l'obligation « de tenir leur comptabilité en français à leur siège ou au
 * siège de leurs établissements situés en République Démocratique du Congo.
 * Cette comptabilité est exprimée en Franc congolais ».
 *
 * AUDCIF, art. 17, 1° · l'organisation comptable doit assurer « la tenue de
 * la comptabilité dans la langue officielle et dans l'unité monétaire ayant
 * cours légal dans l'État partie ».
 *
 * Ni l'un ni l'autre ne prévoit d'option, de seuil ou de dérogation.
 *
 * POURQUOI UNE CONSTANTE ET NON UN CHAMP MODIFIABLE. `Tenant.devise` existe
 * toujours en base parce qu'un dossier d'un autre État partie aura un jour une
 * autre unité légale (XAF...). Ce qui est interdit, c'est de la CHOISIR : elle
 * découle du pays, pas d'une préférence. Tant qu'OmegaX ne sert que la RDC,
 * elle vaut CDF partout, et le test `monnaie-de-tenue.spec.ts` le fige.
 *
 * CE QUE CETTE CONSTANTE NE FAIT PAS. Elle n'empêche pas de tenir un dossier
 * dont les opérations sont en devises · chaque ligne d'écriture porte déjà sa
 * devise, son montant d'origine et le cours appliqué. Elle dit seulement dans
 * quelle unité les LIVRES et les ÉTATS DÉPOSÉS sont exprimés.
 */
export const MONNAIE_DE_TENUE = 'CDF';

/**
 * La monnaie dans laquelle un état est imprimé. Toujours celle de tenue pour
 * le jeu légal · le second jeu, en monnaie fonctionnelle, porte la sienne et
 * dit lui-même qu'il n'a pas de valeur légale.
 */
export function monnaieDuJeuLegal(deviseDuDossier: string | null | undefined): string {
  return deviseDuDossier ?? MONNAIE_DE_TENUE;
}
