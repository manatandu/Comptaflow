import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { StatutLicence, TypeLicence } from '@prisma/client';
import { ModifierLicenceDto } from './dto/plateforme.dto';
import { PlateformeService } from './plateforme.service';

/**
 * LA LICENCE D'UN CABINET ET `null` (2026-09-28).
 *
 * `@IsOptional` laissait `null` passer sur le type, le statut et l'échéance.
 * Le type et le statut partaient à Prisma, qui refusait l'énumération nulle en
 * 500. L'échéance faisait pire · `new Date(null)` posait le 1er janvier 1970,
 * la licence expirait sur le champ, et la cascade de groupe emportait toutes
 * les cellules de la mère, sans que la console dise rien.
 *
 * CHOIX · `null` est REFUSÉ en 400 nommé sur les trois champs, y compris sur
 * l'échéance, alors que les dates du dossier le lisent comme un effacement.
 * Lever l'échéance fait passer un client en perpétuel · c'est un geste
 * commercial qui a déjà son écriture, la chaîne vide, et qu'un champ
 * sérialisé à `null` par mégarde ne doit pas accomplir.
 *
 * Le jumeau de F237 est fermé du même geste · une date que `@IsDateString`
 * admet mais que `new Date` lit de travers (« 2027-02-30 » reporté au
 * 2 mars) ou pas du tout (« 2026-W05 », refusé par Prisma en 500) est refusée
 * AVANT toute écriture, la cascade comprise.
 */

async function refusDuPipe(corps: Record<string, unknown>): Promise<BadRequestException | null> {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  try {
    await pipe.transform(corps, { type: 'body', metatype: ModifierLicenceDto, data: undefined });
    return null;
  } catch (e) {
    if (e instanceof BadRequestException) return e;
    throw e;
  }
}

function motifsDu(refus: BadRequestException | null): string[] {
  if (!refus) return [];
  const reponse = refus.getResponse() as { message?: string[] | string };
  return Array.isArray(reponse.message) ? reponse.message : [String(reponse.message)];
}

describe('ModifierLicenceDto · null refusé en 400 nommé', () => {
  const cas: [string, RegExp][] = [
    ['type', /Le type de licence ne s’efface pas/],
    ['statut', /ACTIVE ou SUSPENDUE, jamais null/],
    ['dateExpiration', /ne s’efface pas par null · envoyez une date AAAA-MM-JJ, ou une chaîne vide/],
  ];
  for (const [champ, motif] of cas) {
    it(`${champ} à null · 400 avec son motif, jamais 500`, async () => {
      const refus = await refusDuPipe({ [champ]: null });
      expect(refus).not.toBeNull();
      expect(refus!.getStatus()).toBe(400);
      expect(motifsDu(refus).some((m) => motif.test(m))).toBe(true);
    });
  }

  it('la chaîne vide lève toujours l’échéance, une date la pose, l’absence ne dit rien', async () => {
    expect(await refusDuPipe({ dateExpiration: '' })).toBeNull();
    expect(await refusDuPipe({ dateExpiration: '2027-08-31' })).toBeNull();
    expect(await refusDuPipe({ statut: StatutLicence.SUSPENDUE })).toBeNull();
    expect(await refusDuPipe({})).toBeNull();
  });
});

describe('PlateformeService.modifierLicence · une date mal lue ne part pas', () => {
  const monter = () => {
    const ecritures: { op: string; where: Record<string, unknown>; data: Record<string, unknown> }[] = [];
    const prisma = {
      licence: {
        // La doublure honore son filtre · seule la licence de 't1' existe.
        findUnique: async ({ where }: { where: { tenantId: string } }) =>
          where.tenantId === 't1' ? { tenantId: 't1', type: TypeLicence.ABONNEMENT, statut: StatutLicence.ACTIVE } : null,
        update: async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          ecritures.push({ op: 'update', ...args });
          return { type: TypeLicence.ABONNEMENT, ...args.data };
        },
        updateMany: async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          ecritures.push({ op: 'updateMany', ...args });
          return { count: 0 };
        },
      },
    };
    const s = new PlateformeService(prisma as never, { get: () => undefined } as never, undefined as never);
    return { s, ecritures };
  };

  for (const illisible of ['2027-02-30', '2026-W05']) {
    it(`« ${illisible} » · refusé en 400, rien n’est écrit, cellules comprises`, async () => {
      // Prémisse · le DTO l'admet, c'est le service qui doit le refuser.
      expect(await refusDuPipe({ dateExpiration: illisible })).toBeNull();
      const { s, ecritures } = monter();
      await expect(s.modifierLicence('t1', { dateExpiration: illisible })).rejects.toThrow(BadRequestException);
      expect(ecritures).toHaveLength(0);
    });
  }

  it('une date lisible est posée au jour écrit, et la cascade reçoit la même', async () => {
    const { s, ecritures } = monter();
    await s.modifierLicence('t1', { dateExpiration: '2028-02-29' });
    expect(ecritures.map((e) => e.op)).toEqual(['update', 'updateMany']);
    for (const e of ecritures) {
      expect((e.data.dateExpiration as Date).toISOString().slice(0, 10)).toBe('2028-02-29');
    }
    expect(ecritures[0].where).toEqual({ tenantId: 't1' });
  });

  it('la chaîne vide lève l’échéance, pas 1970', async () => {
    const { s, ecritures } = monter();
    await s.modifierLicence('t1', { dateExpiration: '' });
    expect(ecritures[0].data.dateExpiration).toBeNull();
  });

  it('un autre cabinet est introuvable, rien n’est écrit', async () => {
    const { s, ecritures } = monter();
    await expect(s.modifierLicence('t2', { dateExpiration: '2028-01-01' })).rejects.toThrow('Cabinet introuvable');
    expect(ecritures).toHaveLength(0);
  });
});
