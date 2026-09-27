import { PlateformeService } from './plateforme.service';
import { GroupeService } from '../groupe/groupe.service';
import { licenceDeCellule } from '../licence/licence-de-cellule';

/**
 * AUDIT FINAL F46 · la licence d'une cellule est le reflet de celle de sa
 * mère, aux trois portes · le paiement de l'abonnement de la mère, la
 * création d'une cellule par le siège, le rattachement par la console.
 * Avant · après le premier encaissement toutes les cellules expiraient, et
 * une cellule née sans échéance ne se coupait jamais.
 */

type Lic = { tenantId: string; mere: string | null; type: string; statut: string; dateExpiration: Date | null };
const fin = (j: string) => new Date(`${j}T23:59:59Z`);

/** Une table des licences dont la doublure honore le filtre de la cascade. */
function parc(licences: Lic[]) {
  const prisma = {
    licence: {
      findUnique: async ({ where }: { where: { tenantId: string } }) => licences.find((l) => l.tenantId === where.tenantId) ?? null,
      create: jest.fn(async () => ({})),
      update: jest.fn(async ({ where, data }: { where: { tenantId: string }; data: Partial<Lic> }) => {
        Object.assign(licences.find((l) => l.tenantId === where.tenantId)!, data);
        return {};
      }),
      updateMany: jest.fn(
        async ({ where, data }: { where: { tenant: { dossierMereId: string }; type: { not: string } }; data: Partial<Lic> }) => {
          const visees = licences.filter((l) => l.mere === where.tenant.dossierMereId && l.type !== where.type.not);
          visees.forEach((l) => Object.assign(l, data));
          return { count: visees.length };
        },
      ),
    },
  };
  return { s: new PlateformeService(prisma as never, { get: () => undefined } as never, undefined as never), licences };
}

describe('F46 · le paiement de la mère prolonge ses cellules', () => {
  it('chaque cellule prend l’échéance retenue de la mère, et aucun autre dossier ne bouge', async () => {
    const { s, licences } = parc([
      { tenantId: 'mere', mere: null, type: 'ABONNEMENT', statut: 'ACTIVE', dateExpiration: fin('2026-11-15') },
      { tenantId: 'c1', mere: 'mere', type: 'ABONNEMENT', statut: 'ACTIVE', dateExpiration: fin('2026-11-15') },
      { tenantId: 'c2', mere: 'mere', type: 'ABONNEMENT', statut: 'SUSPENDUE', dateExpiration: null },
      { tenantId: 'autre', mere: 'ailleurs', type: 'ABONNEMENT', statut: 'ACTIVE', dateExpiration: fin('2026-11-15') },
    ]);
    await expect(s.echeanceAbonnement('mere', '2026-12-15')).resolves.toBe('2026-12-15');
    const par = Object.fromEntries(licences.map((l) => [l.tenantId, l]));
    expect(par.c1.dateExpiration).toEqual(fin('2026-12-15'));
    // Une cellule née sans échéance ne reste pas « pour toujours ».
    expect(par.c2.dateExpiration).toEqual(fin('2026-12-15'));
    // Le statut ne bouge pas · une suspension n'est pas levée par un paiement.
    expect(par.c2.statut).toBe('SUSPENDUE');
    expect(par.autre.dateExpiration).toEqual(fin('2026-11-15'));
  });

  it('un paiement tardif ne recule pas la mère, et les cellules la rejoignent quand même', async () => {
    const { s, licences } = parc([
      { tenantId: 'mere', mere: null, type: 'ABONNEMENT', statut: 'ACTIVE', dateExpiration: fin('2027-01-01') },
      { tenantId: 'c1', mere: 'mere', type: 'ABONNEMENT', statut: 'ACTIVE', dateExpiration: fin('2026-11-15') },
    ]);
    await expect(s.echeanceAbonnement('mere', '2026-12-15')).resolves.toBe('2027-01-01');
    expect(licences[1].dateExpiration).toEqual(fin('2027-01-01'));
  });
});

describe('F46 · le reflet', () => {
  it('recopie type, statut et échéance, une échéance nulle comprise', () => {
    expect(licenceDeCellule({ type: 'PERPETUEL_SAAS', statut: 'SUSPENDUE', dateExpiration: null } as never)).toEqual({
      type: 'PERPETUEL_SAAS',
      statut: 'SUSPENDUE',
      dateExpiration: null,
    });
  });

  it('refuse la licence de l’éditeur · chaque cellule deviendrait incoupable', () => {
    expect(() => licenceDeCellule({ type: 'PROPRIETAIRE', statut: 'ACTIVE', dateExpiration: null } as never)).toThrow(/éditeur/);
  });
});

describe('F46 · la cellule créée par le siège', () => {
  const creer = (licence: { type: string; statut: string; dateExpiration: Date | null }) => {
    const traces = { register: [] as unknown[], licence: [] as unknown[] };
    const s = new GroupeService(
      {
        tenant: {
          findUnique: async () => ({
            id: 'mere',
            dossierMereId: null,
            plafondCellules: 5,
            referentiel: 'SYCEBNL',
            licence,
            _count: { cellules: 0 },
          }),
          update: async () => ({}),
        },
        licence: { update: async (a: unknown) => void traces.licence.push(a) },
        user: { update: async () => ({}) },
      } as never,
      undefined as never,
      {
        register: async (dto: unknown) => {
          traces.register.push(dto);
          return { tenant: { id: 'cellule', nom: 'C' } };
        },
      } as never,
      undefined as never,
    );
    return { s, traces };
  };

  it('prend le statut et l’échéance de la mère, échéance nulle comprise', async () => {
    const { s, traces } = creer({ type: 'PERPETUEL_SAAS', statut: 'SUSPENDUE', dateExpiration: null });
    await s.creerCellule('mere', { nom: 'C', emailAdmin: 'c@c.cd' } as never);
    expect(traces.register).toEqual([expect.objectContaining({ typeLicence: 'PERPETUEL_SAAS' })]);
    expect(traces.licence).toEqual([{ where: { tenantId: 'cellule' }, data: { statut: 'SUSPENDUE', dateExpiration: null } }]);
  });

  it('sous le dossier de l’éditeur, refusée avant toute création', async () => {
    const { s, traces } = creer({ type: 'PROPRIETAIRE', statut: 'ACTIVE', dateExpiration: null });
    await expect(s.creerCellule('mere', { nom: 'C', emailAdmin: 'c@c.cd' } as never)).rejects.toThrow(/éditeur/);
    expect(traces.register).toEqual([]);
  });
});

describe('F46 · le dossier rattaché par la console', () => {
  const rattacher = (fille: { type: string }, mere: { type: string; statut: string; dateExpiration: Date | null }) => {
    const traces = { tenant: [] as unknown[], licence: [] as unknown[] };
    const prisma = {
      tenant: {
        findUnique: async ({ where }: { where: { id: string } }) =>
          where.id === 'fille'
            ? { id: 'fille', referentiel: 'SYCEBNL', licence: fille, _count: { cellules: 0 } }
            : { id: 'mere', dossierMereId: null, referentiel: 'SYCEBNL', licence: mere },
        update: async (a: unknown) => void traces.tenant.push(a),
      },
      licence: { update: async (a: unknown) => void traces.licence.push(a) },
    };
    return { s: new PlateformeService(prisma as never, { get: () => undefined } as never, undefined as never), traces };
  };

  it('prend la licence de sa mère au rattachement', async () => {
    const { s, traces } = rattacher({ type: 'ABONNEMENT' }, { type: 'ABONNEMENT', statut: 'ACTIVE', dateExpiration: fin('2027-03-31') });
    await s.modifierGroupe('fille', { dossierMereId: 'mere' } as never);
    expect(traces.tenant).toEqual([{ where: { id: 'fille' }, data: { dossierMereId: 'mere' } }]);
    expect(traces.licence).toEqual([
      { where: { tenantId: 'fille' }, data: { type: 'ABONNEMENT', statut: 'ACTIVE', dateExpiration: fin('2027-03-31') } },
    ]);
  });

  it('refuse le dossier de l’éditeur comme cellule, et une mère qui porte sa licence, sans rien écrire', async () => {
    const a = rattacher({ type: 'PROPRIETAIRE' }, { type: 'ABONNEMENT', statut: 'ACTIVE', dateExpiration: null });
    await expect(a.s.modifierGroupe('fille', { dossierMereId: 'mere' } as never)).rejects.toThrow(/éditeur/);
    expect(a.traces).toEqual({ tenant: [], licence: [] });
    const b = rattacher({ type: 'ABONNEMENT' }, { type: 'PROPRIETAIRE', statut: 'ACTIVE', dateExpiration: null });
    await expect(b.s.modifierGroupe('fille', { dossierMereId: 'mere' } as never)).rejects.toThrow(/éditeur/);
    expect(b.traces).toEqual({ tenant: [], licence: [] });
  });
});
