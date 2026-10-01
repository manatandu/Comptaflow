import { CORRESPONDANCE_BAREME_COMPTES, type ComptesDeLaNature } from './bareme-comptes-013-2025';

/*
  LE BARÈME ET LES COMPTES, DANS LES DEUX SENS (lot 6, décision D-4 de
  Manasse du 2026-10-01) · « la nature propose son compte, le compte ne
  propose que ses natures, "toutes les catégories" à un clic, jamais de
  refus ; une nature à plusieurs comptes propose la liste, le premier en
  tête ».

  Aucun texte ne relie une nature de l'arrêté n° 013/2025 à un compte du plan
  (`docs/bareme-013-2025-comptes.md`) · rien ici ne refuse. Chaque lecture
  prend le RÉFÉRENTIEL du dossier · la colonne de l'autre plan rangerait le
  mobilier de bureau d'une association au 2444 « Matériel et mobilier
  sportifs ».
*/

type Ref = 'SYSCOHADA' | 'SYCEBNL';

const PAR_CLE = new Map(CORRESPONDANCE_BAREME_COMPTES.map((c) => [c.cle, c]));

/** Les comptes proposés pour une nature, le premier en tête. */
export function comptesDeLaNature(referentiel: Ref, cle: string): ComptesDeLaNature {
  return PAR_CLE.get(cle)?.[referentiel] ?? { comptes: [], remarque: '' };
}

/** La racine significative d'un numéro semé · 24510000 → 2451. */
const racine = (numero: string) => numero.replace(/0+$/, '');

/**
 * Les natures qu'un compte propose · celles dont un compte proposé est le
 * sien, ou le parent d'un sous-compte que le cabinet a ouvert (24511000 sous
 * 24510000). Vide si aucune · l'écran garde alors toutes les catégories.
 */
export function naturesDuCompte(referentiel: Ref, numero: string): string[] {
  return CORRESPONDANCE_BAREME_COMPTES.filter((c) =>
    c[referentiel].comptes.some((n) => n === numero || numero.startsWith(racine(n))),
  ).map((c) => c.cle);
}
