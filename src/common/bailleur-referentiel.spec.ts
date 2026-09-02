import { BadRequestException } from '@nestjs/common';
import { Referentiel } from '@prisma/client';
import { refuserBailleurHorsSycebnl } from './bailleur-referentiel';
import { PrismaService } from './prisma.service';

/**
 * LE CLOISONNEMENT DU BAILLEUR ÉTAIT FAIT D'UN SEUL CÔTÉ.
 *
 * Le registre des bailleurs est refusé au SYSCOHADA par
 * `@ReferentielsAutorises`, mais le CHAMP `bailleurId` restait accepté sur des
 * routes légitimement ouvertes aux deux · PATCH /comptes/:id et les sections
 * analytiques. Un dossier SYSCOHADA recevait alors « Bailleur introuvable »,
 * vocabulaire d'EBNL, au lieu d'un refus de référentiel.
 */

const prisma = (referentiel: Referentiel, lu: { fois: number }) =>
  ({
    tenant: {
      findUniqueOrThrow: async () => {
        lu.fois += 1;
        return { referentiel };
      },
    },
  }) as unknown as PrismaService;

describe('rattachement à un bailleur · réservé au SYCEBNL', () => {
  it('refuse un bailleurId sur un dossier SYSCOHADA, et le dit dans son vocabulaire', async () => {
    const lu = { fois: 0 };
    await expect(refuserBailleurHorsSycebnl(prisma(Referentiel.SYSCOHADA, lu), 't1', 'b1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    // La division 46 porte les bailleurs et fonds d'administration au SYCEBNL,
    // les apporteurs, associés et groupe au plan SYSCOHADA : le message doit
    // dire pourquoi, pas seulement refuser.
    await expect(refuserBailleurHorsSycebnl(prisma(Referentiel.SYSCOHADA, lu), 't1', 'b1')).rejects.toThrow(
      /apporteurs, associés et groupe/,
    );
  });

  it('laisse passer sur un dossier SYCEBNL', async () => {
    const lu = { fois: 0 };
    await expect(refuserBailleurHorsSycebnl(prisma(Referentiel.SYCEBNL, lu), 't1', 'b1')).resolves.toBeUndefined();
  });

  it('laisse toujours passer le DÉTACHEMENT, sans lire le dossier', async () => {
    // `null` retire un bailleur : inoffensif, et utile s'il en reste un.
    // Le contrôle ne doit pas non plus coûter une requête à chaque appel.
    const lu = { fois: 0 };
    await refuserBailleurHorsSycebnl(prisma(Referentiel.SYSCOHADA, lu), 't1', null);
    await refuserBailleurHorsSycebnl(prisma(Referentiel.SYSCOHADA, lu), 't1', undefined);
    expect(lu.fois).toBe(0);
  });
});
