import { BadRequestException } from '@nestjs/common';
import { StatutLicence, TypeLicence } from '@prisma/client';

/**
 * LA LICENCE D'UNE CELLULE EST LE REFLET DE CELLE DE SA MÈRE (audit final
 * F46) · une seule licence vendue, un seul robinet. Trois portes la posaient
 * ou l'entretenaient chacune à sa façon, et deux l'oubliaient · la cellule
 * créée par le siège n'héritait que d'une échéance NON NULLE (jamais du
 * statut), le dossier rattaché par la console gardait la sienne, et le
 * paiement d'un abonnement ne prolongeait que la mère. Après le premier
 * encaissement, toutes les cellules expiraient ; une cellule née sans
 * échéance ne se coupait jamais.
 *
 * Le type, le statut et l'échéance sont recopiés tels quels · une échéance
 * nulle est une réponse (licence perpétuelle), pas une absence à combler.
 *
 * LE DOSSIER DE L'ÉDITEUR N'ENTRE DANS AUCUN GROUPE, ni comme mère ni comme
 * cellule · refléter sa licence ferait de chaque cellule un second dossier
 * incoupable, et aligner la sienne sur une mère le rendrait coupable
 * (`PlateformeService.refuserTouchePropriete`).
 */
export interface LicenceReflet {
  type: TypeLicence;
  statut: StatutLicence;
  dateExpiration: Date | null;
}

export function licenceDeCellule(mere: LicenceReflet | null | undefined): LicenceReflet | null {
  if (!mere) return null;
  if (mere.type === TypeLicence.PROPRIETAIRE) {
    throw new BadRequestException(
      'Le dossier de l’éditeur n’a pas de cellules · chacune recevrait sa licence, et deviendrait un second dossier incoupable.',
    );
  }
  return { type: mere.type, statut: mere.statut, dateExpiration: mere.dateExpiration };
}

/** Un dossier qui porte la licence de l'éditeur ne devient pas une cellule · sa licence ne se touche pas. */
export function refuserCelluleEditeur(type: TypeLicence | null | undefined) {
  if (type === TypeLicence.PROPRIETAIRE) {
    throw new BadRequestException('Le dossier de l’éditeur ne devient pas une cellule · sa licence ne se reflète sur aucune autre.');
  }
}
