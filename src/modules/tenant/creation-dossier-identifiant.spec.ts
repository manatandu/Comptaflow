import { Referentiel, TypeLicence } from '@prisma/client';
import { TenantService } from './tenant.service';
import { PrismaService } from '../../common/prisma.service';

/**
 * LE DOSSIER NAÎT SOUS L'IDENTIFIANT TIRÉ PAR L'INSCRIPTION (2026-09-27) ·
 * `AuthService.register` agit au nom du dossier AVANT de le créer, et le
 * maillon d'audit de la création n'est accepté que si la ligne porte cet
 * identifiant. Ignoré, la base en tirerait un autre, et la création d'une
 * cellule par le siège retomberait en 500.
 */
describe('TenantService.creerTenant · identifiant', () => {
  const service = () => {
    const recus: Array<Record<string, unknown>> = [];
    const prisma = {
      tenant: {
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          recus.push(data);
          return { ...data, licence: null };
        }),
      },
    };
    return { s: new TenantService(prisma as unknown as PrismaService), recus };
  };
  const base = { nom: 'Cellule', referentiel: Referentiel.SYCEBNL, typeLicence: TypeLicence.ABONNEMENT };

  it('reçu, il est celui de la ligne créée', async () => {
    const { s, recus } = service();
    await s.creerTenant({ ...base, id: 'id-tire' });
    expect(recus[0]).toMatchObject({ id: 'id-tire', nom: 'Cellule' });
  });

  it('absent, la base le tire', async () => {
    const { s, recus } = service();
    await s.creerTenant(base);
    expect(recus[0]).not.toHaveProperty('id');
  });
});
