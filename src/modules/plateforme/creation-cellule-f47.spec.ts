import { PlateformeService } from './plateforme.service';

/**
 * AUDIT FINAL F47 · la création d'un cabinet rattaché à une mère d'un autre
 * référentiel semait tout (`register`), puis levait au rattachement · le mot
 * de passe n'était pas rendu, et l'adresse bloquait toute nouvelle tentative.
 * La mère se vérifie désormais AVANT `register`.
 */

type Mere = { referentiel: string; systemeComptableSyscohada: string | null; dossierMereId?: string | null; licence?: unknown };

function console_(mere: Mere) {
  const register = jest.fn(async () => ({ tenant: { id: 'nouveau', nom: 'N' }, exercice: null }));
  const prisma = {
    tenant: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === 'mere'
          ? { id: 'mere', dossierMereId: mere.dossierMereId ?? null, licence: mere.licence ?? { type: 'ABONNEMENT', statut: 'ACTIVE', dateExpiration: null }, ...mere }
          : where.id === 'nouveau'
            ? { id: 'nouveau', referentiel: 'SYSCOHADA', systemeComptableSyscohada: 'NORMAL', licence: { type: 'ABONNEMENT' }, _count: { cellules: 0 } }
            : null,
      update: jest.fn(async () => ({})),
    },
    licence: { update: jest.fn(async () => ({})) },
    user: { update: jest.fn(async () => ({})) },
  };
  const s = new PlateformeService(prisma as never, { get: () => undefined } as never, { register } as never);
  return { s, register, prisma };
}

const DTO = { nomEntite: 'N', emailAdmin: 'n@n.cd', dossierMereId: 'mere' };

describe('F47 · la mère se vérifie avant de créer quoi que ce soit', () => {
  it('une mère d’un autre référentiel · refus, et aucun dossier semé', async () => {
    const { s, register } = console_({ referentiel: 'SYCEBNL', systemeComptableSyscohada: null });
    await expect(s.creerCabinet({ ...DTO, referentiel: 'SYSCOHADA' } as never)).rejects.toThrow(/même référentiel/);
    expect(register).not.toHaveBeenCalled();
  });

  it('sous le SYSCOHADA, un autre système comptable · refus avant register', async () => {
    const { s, register } = console_({ referentiel: 'SYSCOHADA', systemeComptableSyscohada: 'NORMAL' });
    await expect(
      s.creerCabinet({ ...DTO, referentiel: 'SYSCOHADA', systemeComptableSyscohada: 'MINIMAL_TRESORERIE' } as never),
    ).rejects.toThrow(/système comptable/);
    expect(register).not.toHaveBeenCalled();
  });

  it('une mère qui est elle-même une cellule, ou introuvable · refus avant register', async () => {
    const a = console_({ referentiel: 'SYSCOHADA', systemeComptableSyscohada: 'NORMAL', dossierMereId: 'grand-mere' });
    await expect(a.s.creerCabinet({ ...DTO, referentiel: 'SYSCOHADA' } as never)).rejects.toThrow(/un niveau/);
    expect(a.register).not.toHaveBeenCalled();
    const b = console_({ referentiel: 'SYSCOHADA', systemeComptableSyscohada: 'NORMAL' });
    await expect(b.s.creerCabinet({ ...DTO, dossierMereId: 'absente', referentiel: 'SYSCOHADA' } as never)).rejects.toThrow(/introuvable/);
    expect(b.register).not.toHaveBeenCalled();
  });

  it('une cellule ne choisit ni type ni échéance · elle prend la licence de sa mère', async () => {
    const { s, register } = console_({ referentiel: 'SYSCOHADA', systemeComptableSyscohada: 'NORMAL' });
    await expect(s.creerCabinet({ ...DTO, referentiel: 'SYSCOHADA', typeLicence: 'ABONNEMENT' } as never)).rejects.toThrow(
      /licence de son dossier mère/,
    );
    await expect(s.creerCabinet({ ...DTO, referentiel: 'SYSCOHADA', dateExpiration: '2027-01-31' } as never)).rejects.toThrow(
      /licence de son dossier mère/,
    );
    expect(register).not.toHaveBeenCalled();
  });

  it('une mère conforme · le dossier naît avec le type de licence de sa mère, puis s’y rattache', async () => {
    const { s, register, prisma } = console_({
      referentiel: 'SYSCOHADA',
      systemeComptableSyscohada: 'NORMAL',
      licence: { type: 'PERPETUEL_SAAS', statut: 'ACTIVE', dateExpiration: null },
    });
    await s.creerCabinet({ ...DTO, referentiel: 'SYSCOHADA' } as never);
    expect(register).toHaveBeenCalledWith(expect.objectContaining({ typeLicence: 'PERPETUEL_SAAS', referentiel: 'SYSCOHADA' }));
    expect(prisma.tenant.update).toHaveBeenCalledWith({ where: { id: 'nouveau' }, data: { dossierMereId: 'mere' } });
  });
});

describe('F47 · le rattachement exige aussi le système du siège', () => {
  it('un dossier au Système minimal ne devient pas cellule d’un siège au Système normal', async () => {
    const prisma = {
      tenant: {
        findUnique: async ({ where }: { where: { id: string } }) =>
          where.id === 'fille'
            ? { id: 'fille', referentiel: 'SYSCOHADA', systemeComptableSyscohada: 'MINIMAL_TRESORERIE', licence: { type: 'ABONNEMENT' }, _count: { cellules: 0 } }
            : { id: 'mere', dossierMereId: null, referentiel: 'SYSCOHADA', systemeComptableSyscohada: 'NORMAL', licence: null },
        update: jest.fn(async () => ({})),
      },
    };
    const s = new PlateformeService(prisma as never, { get: () => undefined } as never, undefined as never);
    await expect(s.modifierGroupe('fille', { dossierMereId: 'mere' } as never)).rejects.toThrow(/système comptable/);
    expect(prisma.tenant.update).not.toHaveBeenCalled();
  });
});
