/**
 * FUSION DE TIERS · règles pures, sans Prisma.
 *
 * Les écritures sont passées sur des COMPTES, jamais sur des tiers : un tiers
 * est une fiche rattachée à ses comptes (`TiersCompte`). Fusionner deux fiches
 * ne touche donc pas une ligne du livre-journal · les comptes du doublon, ses
 * factures, devis, relances, consignations et demandes de confirmation passent
 * au tiers conservé, puis le doublon est supprimé. C'est la seule fusion que
 * l'AUDCIF laisse entière (art. 22, 2° interdit de modifier une écriture
 * validée, pas de réorganiser les fiches qui pointent vers ses comptes).
 */

export interface FicheTiers {
  id: string;
  code: string;
  type: string;
  adresse: string | null;
  boitePostale: string | null;
  ville: string | null;
  pays: string | null;
  telephone: string | null;
  email: string | null;
  numeroImpot: string | null;
  contact: string | null;
}

export function motifRefusFusionTiers(source: FicheTiers, cible: FicheTiers): string | null {
  if (source.id === cible.id) return 'Un tiers ne se fusionne pas avec lui-même.';
  if (source.type !== cible.type) {
    return (
      `${source.code} et ${cible.code} ne sont pas du même type (${source.type} et ${cible.type}) · ` +
      "un client et un fournisseur ne sont pas un doublon l'un de l'autre, leurs comptes ne se lisent pas au même sens."
    );
  }
  return null;
}

const COORDONNEES = ['adresse', 'boitePostale', 'ville', 'pays', 'telephone', 'email', 'numeroImpot', 'contact'] as const;

/**
 * Les coordonnées que la fiche conservée n'a pas et que le doublon porte · la
 * fiche conservée garde TOUJOURS les siennes, le doublon ne comble que les
 * vides. Écraser une adresse renseignée par celle d'un doublon ferait partir
 * les relances à une adresse que personne n'a choisie.
 */
export function coordonneesAComblement(
  source: FicheTiers,
  cible: FicheTiers,
): Partial<Record<(typeof COORDONNEES)[number], string>> {
  const r: Partial<Record<(typeof COORDONNEES)[number], string>> = {};
  for (const c of COORDONNEES) {
    const v = source[c];
    if (!cible[c] && v) r[c] = v;
  }
  return r;
}
