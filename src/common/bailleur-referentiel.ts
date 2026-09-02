import { BadRequestException } from '@nestjs/common';
import { Referentiel } from '@prisma/client';
import { PrismaService } from './prisma.service';

/**
 * LE BAILLEUR EST UNE NOTION DU SYCEBNL, ET LE CLOISONNEMENT ÉTAIT À MOITIÉ
 * FAIT.
 *
 * Le registre des bailleurs est refusé au SYSCOHADA par
 * `@ReferentielsAutorises(Referentiel.SYCEBNL)`, mais le CHAMP `bailleurId`
 * restait accepté sur des routes légitimement ouvertes aux deux · le plan de
 * comptes (PATCH /comptes/:id) et les sections analytiques. Un dossier
 * SYSCOHADA recevait alors « Bailleur introuvable », vocabulaire d'EBNL, au
 * lieu d'un refus de référentiel.
 *
 * La division 46 porte les bailleurs et fonds d'administration au SYCEBNL
 * (Partie 2 ch. 3, COMPTE 46) et les apporteurs, associés et groupe au plan
 * SYSCOHADA (AUDCIF, Titre VII, COMPTE 46) : ce n'est pas la même notion sous
 * un autre nom, c'est une notion qui n'existe pas de l'autre côté. Le refus
 * porte donc sur le seul CHAMP, pas sur la route.
 *
 * `null` et `undefined` passent : détacher un bailleur est inoffensif, et
 * reste utile si un dossier en portait un.
 */
export async function refuserBailleurHorsSycebnl(
  prisma: PrismaService,
  tenantId: string,
  bailleurId: string | null | undefined,
) {
  if (!bailleurId) return;
  const { referentiel } = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { referentiel: true },
  });
  if (referentiel !== Referentiel.SYCEBNL) {
    throw new BadRequestException(
      "Le rattachement à un bailleur de fonds n'existe qu'en SYCEBNL, dont la division 46 porte les bailleurs et " +
        'fonds d’administration. Au plan SYSCOHADA, le compte 46 porte les apporteurs, associés et groupe.',
    );
  }
}
