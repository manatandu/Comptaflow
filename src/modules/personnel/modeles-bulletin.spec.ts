import { AvancesRubriquesService } from './avances-rubriques.service';
import { MAX_LIGNES_MODELE, motifRefusModele, normaliserLignes } from './modeles-bulletin';

/**
 * BULLETINS MODÈLES · un gabarit qui pré-remplit, jamais ne décide. La
 * rubrique fixe la nature, et une rubrique désactivée ou d'un autre dossier
 * est refusée.
 */
const RUBRIQUES = [
  { id: 'r-prime', nature: 'PRIME', actif: true },
  { id: 'r-vieille', nature: 'PRIME', actif: false },
];
const ligne = (l: Record<string, unknown> = {}) => ({ nature: 'SALAIRE_OU_TRAITEMENT', libelle: 'Salaire de base', ...l });

describe('motifRefusModele', () => {
  it('accepte un modèle sans montant, et un modèle avec montants', () => {
    expect(motifRefusModele({ nom: 'Employé', deviseStipulation: 'CDF', lignes: [ligne()] }, RUBRIQUES)).toBeNull();
    expect(motifRefusModele({ nom: 'Cadre', deviseStipulation: 'USD', lignes: [ligne({ montant: 1250.5 })] }, RUBRIQUES)).toBeNull();
  });

  it.each([
    [{ nom: ' ', deviseStipulation: 'CDF', lignes: [ligne()] }, /nom du modèle/],
    [{ nom: 'X', deviseStipulation: 'EUR', lignes: [ligne()] }, /CDF ou USD/],
    [{ nom: 'X', deviseStipulation: 'CDF', lignes: [] }, /au moins un élément/],
    [{ nom: 'X', deviseStipulation: 'CDF', lignes: [ligne({ libelle: '' })] }, /libellé/],
    [{ nom: 'X', deviseStipulation: 'CDF', lignes: [ligne({ nature: 'INVENTEE' })] }, /nature inconnue/],
    [{ nom: 'X', deviseStipulation: 'CDF', lignes: [ligne({ montant: -1 })] }, /positif/],
    [{ nom: 'X', deviseStipulation: 'CDF', lignes: [ligne({ montant: 1.234 })] }, /deux décimales/],
    [{ nom: 'X', deviseStipulation: 'CDF', lignes: [ligne({ rubriqueId: 'ailleurs' })] }, /rubrique introuvable/],
    [{ nom: 'X', deviseStipulation: 'CDF', lignes: [ligne({ rubriqueId: 'r-vieille' })] }, /désactivée/],
  ])('refuse %j', (m, motif) => {
    expect(motifRefusModele(m as never, RUBRIQUES)).toMatch(motif);
  });

  it('borne le nombre d’éléments', () => {
    const lignes = Array.from({ length: MAX_LIGNES_MODELE + 1 }, () => ligne());
    expect(motifRefusModele({ nom: 'X', deviseStipulation: 'CDF', lignes }, RUBRIQUES)).toMatch(/au plus/);
  });

  it('accepte les cinq exclusions de l’article 7 comme éléments du catalogue', () => {
    expect(motifRefusModele({ nom: 'X', deviseStipulation: 'CDF', lignes: [ligne({ nature: 'INDEMNITE_DE_TRANSPORT', libelle: 'Transport' })] }, RUBRIQUES)).toBeNull();
  });
});

describe('normaliserLignes · la rubrique décide de la nature', () => {
  it('remplace la nature envoyée par celle de la rubrique', () => {
    const [l] = normaliserLignes([ligne({ nature: 'INDEMNITE_DE_TRANSPORT', rubriqueId: 'r-prime', libelle: ' Prime ' })], RUBRIQUES);
    expect(l).toEqual({ nature: 'PRIME', libelle: 'Prime', rubriqueId: 'r-prime', montant: null });
  });
});

describe('le service lit les rubriques de CE dossier', () => {
  it('refuse une rubrique d’un autre dossier, et n’écrit rien', async () => {
    const create = jest.fn();
    const findMany = jest.fn().mockResolvedValue([]);
    const s = new AvancesRubriquesService({ rubriquePaie: { findMany }, modeleBulletin: { create } } as never);
    await expect(
      s.creerModele('t1', 'a@b.cd', { nom: 'X', deviseStipulation: 'CDF', lignes: [ligne({ rubriqueId: 'r-prime' })] } as never),
    ).rejects.toThrow(/rubrique introuvable/);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: 't1' } }));
    expect(create).not.toHaveBeenCalled();
  });

  it('enregistre les lignes normalisées', async () => {
    const create = jest.fn().mockImplementation(async ({ data }: { data: unknown }) => data);
    const s = new AvancesRubriquesService({
      rubriquePaie: { findMany: jest.fn().mockResolvedValue(RUBRIQUES) },
      modeleBulletin: { create },
    } as never);
    await s.creerModele('t1', 'a@b.cd', { nom: ' Employé ', deviseStipulation: 'CDF', lignes: [ligne({ nature: 'COMMISSION', rubriqueId: 'r-prime' })] } as never);
    expect(create.mock.calls[0][0].data).toMatchObject({ tenantId: 't1', nom: 'Employé', lignes: [{ nature: 'PRIME', rubriqueId: 'r-prime' }] });
  });
});
