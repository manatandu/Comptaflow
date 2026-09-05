import { BadRequestException } from '@nestjs/common';
import { Licence, StatutLicence, TypeLicence } from '@prisma/client';
import { LicenceService } from './licence.service';
import { PlateformeService } from '../plateforme/plateforme.service';
import { PrismaService } from '../../common/prisma.service';

/**
 * LA LICENCE DE L'ÉDITEUR · une panne sans issue, fermée.
 *
 * `evaluerLicence` n'exemptait personne. Le dossier de VMG Consulting,
 * propriétaire du logiciel, se coupait comme celui d'un client : à l'échéance
 * d'un abonnement, ou dès qu'une suspension était posée depuis la console.
 *
 * Or c'est DEPUIS CETTE CONSOLE, et depuis elle seule, qu'on rouvre une
 * licence. L'opérateur se verrouillait donc hors de l'outil qui sert à
 * déverrouiller, avec pour tout diagnostic un « Abonnement expiré »
 * techniquement exact. La seule sortie aurait été une intervention en base.
 *
 * Ces tests figent les trois gestes qui rouvriraient la panne : l'échéance,
 * la suspension, et le changement de type · le troisième étant le seul que le
 * court-circuit ne peut pas absorber, puisqu'il le retire.
 */

const licence = (p: Partial<Licence>): Licence =>
  ({
    id: 'l1',
    tenantId: 't1',
    type: TypeLicence.PROPRIETAIRE,
    statut: StatutLicence.ACTIVE,
    dateDebut: new Date('2026-01-01'),
    dateExpiration: null,
    dernierHeartbeatAt: null,
    joursGraceHorsLigne: 7,
    ...p,
  }) as Licence;

const service = () => new LicenceService({} as unknown as PrismaService);

describe("l'éditeur n'est jamais coupé", () => {
  it('une échéance dépassée ne le coupe pas', () => {
    const r = service().evaluerLicence(
      licence({ dateExpiration: new Date('2020-01-01') }),
    );
    expect(r.autorise).toBe(true);
  });

  it('une SUSPENSION ne le coupe pas non plus · c’est le cas qui compte', () => {
    // La suspension est le geste le plus facile à poser par mégarde depuis la
    // console, et c'est celui qui verrouille le plus sûrement : le
    // court-circuit doit donc passer AVANT le test de suspension, pas après.
    // Placé après, il serait exact et inutile.
    const r = service().evaluerLicence(licence({ statut: StatutLicence.SUSPENDUE }));
    expect(r.autorise).toBe(true);
    expect(r.motif).toBeUndefined();
  });

  it('un client, lui, reste coupé · l’exemption ne fuit pas', () => {
    const expire = service().evaluerLicence(
      licence({ type: TypeLicence.ABONNEMENT, dateExpiration: new Date('2020-01-01') }),
    );
    expect(expire.autorise).toBe(false);
    expect(expire.motif).toBe('Abonnement expiré');

    const suspendu = service().evaluerLicence(
      licence({ type: TypeLicence.PERPETUEL_SAAS, statut: StatutLicence.SUSPENDUE }),
    );
    expect(suspendu.autorise).toBe(false);
    expect(suspendu.motif).toBe('Licence suspendue');
  });
});

describe('la console ne peut pas défaire la protection', () => {
  function console(typeActuel: TypeLicence) {
    const prisma = {
      licence: {
        findUnique: jest.fn().mockResolvedValue(licence({ type: typeActuel })),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    } as Record<string, unknown>;
    return {
      service: new PlateformeService(prisma as unknown as PrismaService, {} as never, {} as never),
      prisma,
    };
  }

  it('refuse de suspendre le dossier de l’éditeur', async () => {
    const { service: s, prisma } = console(TypeLicence.PROPRIETAIRE);
    await expect(
      s.modifierLicence('t1', { statut: StatutLicence.SUSPENDUE }),
    ).rejects.toBeInstanceOf(BadRequestException);
    // ET RIEN N'EST ÉCRIT · un refus qui laisserait passer l'écriture avant
    // de jeter aurait déjà coupé le dossier, et la cascade de groupe avec.
    expect((prisma.licence as Record<string, jest.Mock>).update).not.toHaveBeenCalled();
  });

  it('refuse de lui poser une échéance', async () => {
    const { service: s } = console(TypeLicence.PROPRIETAIRE);
    await expect(
      s.modifierLicence('t1', { dateExpiration: '2026-12-31' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuse surtout de CHANGER SON TYPE · le seul geste que rien ne rattrape', async () => {
    // Le court-circuit absorbe l'échéance et la suspension. Il ne peut rien
    // contre le retrait du type qui le déclenche : ce refus-ci est le dernier.
    const { service: s } = console(TypeLicence.PROPRIETAIRE);
    await expect(
      s.modifierLicence('t1', { type: TypeLicence.ABONNEMENT }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuse de FABRIQUER un second éditeur depuis la console', async () => {
    // Deux dossiers incoupables ne se verraient nulle part et rien ne pourrait
    // les refermer · même parti que le refus d'un second dossier de
    // démonstration.
    const { service: s } = console(TypeLicence.ABONNEMENT);
    await expect(
      s.modifierLicence('t1', { type: TypeLicence.PROPRIETAIRE }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('laisse passer une modification ordinaire sur un dossier client', async () => {
    const { service: s, prisma } = console(TypeLicence.ABONNEMENT);
    (prisma.licence as Record<string, jest.Mock>).update.mockResolvedValue({
      type: TypeLicence.ABONNEMENT,
      statut: StatutLicence.SUSPENDUE,
      dateDebut: new Date(),
      dateExpiration: null,
      dernierHeartbeatAt: null,
    });
    (prisma.licence as Record<string, jest.Mock>).updateMany.mockResolvedValue({ count: 0 });
    await expect(s.modifierLicence('t1', { statut: StatutLicence.SUSPENDUE })).resolves.toBeDefined();
  });
});
