import type { ReponseFait } from './dto/parametres-dossier.dto';

/**
 * DEUX FAITS DÉCLARÉS QUI COMMANDENT DES MENUS · l'assujettissement à la TVA
 * et la vente de biens ou de services. Chacun a TROIS valeurs, et la troisième
 * n'est pas « non » : un menu ne se masque que sur une réponse donnée
 * (`client/src/lib/profil-dossier.ts`, `CHEMINS_SELON_UN_FAIT`). Masquer sur
 * une valeur par défaut cacherait un module à qui en a besoin.
 */

/** Ce que la réponse sur la TVA écrit au dossier. `undefined` = rien. */
export function donneesAssujettissementTva(
  reponse: ReponseFait | undefined,
  assujettiTva: boolean | undefined,
): { assujettiTva?: boolean; assujettissementTvaRepondu?: boolean } {
  if (reponse === 'OUI') return { assujettiTva: true, assujettissementTvaRepondu: true };
  if (reponse === 'NON') return { assujettiTva: false, assujettissementTvaRepondu: true };
  // « Pas encore dit » remet aussi le booléen à faux · il commande la TVA posée
  // d'office en saisie (`client/src/lib/tva-saisie.ts`), qu'un dossier sans
  // réponse ne doit pas recevoir.
  if (reponse === 'PAS_ENCORE_DIT') return { assujettiTva: false, assujettissementTvaRepondu: false };
  if (assujettiTva !== undefined) return { assujettiTva, assujettissementTvaRepondu: true };
  return {};
}

export function donneesVenteBiensServices(reponse: ReponseFait | undefined): { venteBiensServices?: boolean | null } {
  if (reponse === undefined) return {};
  return { venteBiensServices: reponse === 'OUI' ? true : reponse === 'NON' ? false : null };
}

/** Le fait tel que les menus le lisent · `null` = pas encore dit. */
export function faitAssujettissementTva(t: {
  assujettiTva: boolean;
  assujettissementTvaRepondu: boolean;
}): boolean | null {
  return t.assujettissementTvaRepondu ? t.assujettiTva : null;
}
