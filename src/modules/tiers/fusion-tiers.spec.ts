import { coordonneesAComblement, FicheTiers, motifRefusFusionTiers } from './fusion-tiers';

const fiche = (id: string, extra: Partial<FicheTiers> = {}): FicheTiers => ({
  id,
  code: id.toUpperCase(),
  type: 'FOURNISSEUR',
  adresse: null,
  boitePostale: null,
  ville: null,
  pays: null,
  telephone: null,
  email: null,
  numeroImpot: null,
  contact: null,
  ...extra,
});

describe('Fusion de tiers', () => {
  it('refuse de fusionner un tiers avec lui-même, ou deux types différents', () => {
    expect(motifRefusFusionTiers(fiche('a'), fiche('a'))).toMatch(/lui-même/);
    expect(motifRefusFusionTiers(fiche('a'), fiche('b', { type: 'CLIENT' }))).toMatch(/pas du même type/);
    expect(motifRefusFusionTiers(fiche('a'), fiche('b'))).toBeNull();
  });

  it('le doublon comble les vides, il n’écrase jamais une coordonnée de la fiche conservée', () => {
    const r = coordonneesAComblement(
      fiche('a', { adresse: 'Av. du doublon', numeroImpot: 'A123' }),
      fiche('b', { adresse: 'Av. conservée' }),
    );
    expect(r).toEqual({ numeroImpot: 'A123' });
  });
});
