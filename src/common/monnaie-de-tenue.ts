/**
 * LA MONNAIE DE TENUE · elle ne se choisit pas.
 *
 * Loi n° 23/053 du 30 novembre 2023, art. 141, 1° · les redevables sont dans
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
 * LA DATE ÉTAIT FAUSSE ICI, ET SEULEMENT ICI. Ce fichier portait « du
 * 5 décembre 2023 ». Le texte s'intitule « Loi n° 23/053 du 30 novembre 2023 »
 * et se clôt sur « Fait à Kinshasa, le 30 novembre 2023 ». Le reste du dépôt
 * écrit la bonne date partout ailleurs · corrigé à la passe F6. La migration
 * 20260918120000_monnaie_fonctionnelle recopie l'ancien en-tête dans un
 * commentaire SQL et N'EST PAS retouchée : une migration appliquée porte une
 * empreinte, et la réécrire ferait diverger la base. Elle est de l'HISTOIRE,
 * pas une source.
 *
 * Ce qu'aucun test n'attrapait · `citations-articles.spec.ts` ne contrôle que
 * la PLAGE des articles sous un sigle d'Acte uniforme, et écarte expressément
 * les lois numérotées. La DATE d'un texte cité n'était vérifiée nulle part.
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
