import { donneesAssujettissementTva, donneesVenteBiensServices, faitAssujettissementTva } from './faits-declares';

describe('Faits déclarés · la troisième valeur n\'est pas « non »', () => {
  it('la réponse sur la TVA écrit le booléen ET le fait d\'avoir répondu', () => {
    expect(donneesAssujettissementTva('OUI', undefined)).toEqual({ assujettiTva: true, assujettissementTvaRepondu: true });
    expect(donneesAssujettissementTva('NON', undefined)).toEqual({ assujettiTva: false, assujettissementTvaRepondu: true });
  });

  it('« pas encore dit » efface la réponse et remet le booléen à faux (TVA posée d\'office)', () => {
    expect(donneesAssujettissementTva('PAS_ENCORE_DIT', true)).toEqual({ assujettiTva: false, assujettissementTvaRepondu: false });
  });

  it('l\'ancien booléen seul vaut réponse ; rien envoyé, rien écrit', () => {
    expect(donneesAssujettissementTva(undefined, false)).toEqual({ assujettiTva: false, assujettissementTvaRepondu: true });
    expect(donneesAssujettissementTva(undefined, undefined)).toEqual({});
  });

  it('la vente : oui, non, ou null pour « pas encore dit »', () => {
    expect(donneesVenteBiensServices('OUI')).toEqual({ venteBiensServices: true });
    expect(donneesVenteBiensServices('NON')).toEqual({ venteBiensServices: false });
    expect(donneesVenteBiensServices('PAS_ENCORE_DIT')).toEqual({ venteBiensServices: null });
    expect(donneesVenteBiensServices(undefined)).toEqual({});
  });

  it('le fait lu par les menus · null tant que la question n\'est pas répondue', () => {
    expect(faitAssujettissementTva({ assujettiTva: false, assujettissementTvaRepondu: false })).toBeNull();
    expect(faitAssujettissementTva({ assujettiTva: false, assujettissementTvaRepondu: true })).toBe(false);
    expect(faitAssujettissementTva({ assujettiTva: true, assujettissementTvaRepondu: true })).toBe(true);
  });
});

describe('Câblage · modifierRegime écrit ce que la règle rend', () => {
  it('passe la réponse TVA et la vente au dossier', async () => {
    const { TenantService } = await import('./tenant.service');
    let data: Record<string, unknown> = {};
    const prisma = {
      tenant: {
        findUnique: async () => ({ id: 't1' }),
        update: async (args: { data: Record<string, unknown> }) => { data = args.data; },
      },
    };
    const s = new TenantService(prisma as never);
    (s as unknown as { parametres: () => Promise<null> }).parametres = async () => null;
    await s.modifierRegime('t1', { reponseAssujettissementTva: 'NON', venteBiensServices: 'PAS_ENCORE_DIT' });
    expect(data).toMatchObject({ assujettiTva: false, assujettissementTvaRepondu: true, venteBiensServices: null });
  });
});
