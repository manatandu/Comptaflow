import type { Referentiel } from './types';

/**
 * LA CRÉANCE NÉE D'UNE CESSION · miroir de `motifRefusContrepartieCession`
 * (`src/modules/immobilisations/comptes-du-bien.ts`, passe R1, B6), qui seul
 * refuse. L'écran retire seulement de la liste « Encaissé sur » ce que la
 * route rejettera.
 *
 * SYSCOHADA seul, deux exclusions écrites et deux seulement · une cession
 * H.A.O. (produit au 82) ne se porte pas sur un client, « → 485 » (AUDCIF,
 * Titre VII, fiche du compte 41, Exclusions) ; une cession courante (produit
 * au 754) ne se porte pas au 485, ses créances « constituent des créances
 * rattachées au compte Client (compte 414) » (fiche du compte 48). Le reste
 * reste libre · les fiches 82 et 754 disent « par le débit des comptes de
 * tiers concernés ou des comptes de trésorerie ».
 */
export function contrepartieCessionProposee(
  referentiel: Referentiel | undefined,
  cessionCourante: boolean,
  numero: string,
): boolean {
  if (referentiel !== 'SYSCOHADA') return true;
  if (!cessionCourante && numero.startsWith('41')) return false;
  if (cessionCourante && numero.startsWith('485')) return false;
  return true;
}
