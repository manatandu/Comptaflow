import { ImmobilisationService } from './immobilisation.service';
import { estCompteFondsProjet, motifListeFondsProjetVide, motifRefusSortieProjet } from './comptes-du-bien';

/**
 * LA LISTE DES FONDS D'UNE FIN DE PROJET EST SERVIE PAR LA RÈGLE DU REFUS
 * (SYCEBNL Partie 3 ch. 3 § 2.5). L'écran de sortie recomposait les racines
 * de son côté et ne disait rien quand la liste était vide · un compte proposé
 * doit être un compte que `sortir` accepte, et une liste vide dit quoi faire.
 */
describe('Sortie de fin de projet · comptes de fonds servis', () => {
  it('la racine de la liste est celle du refus', () => {
    for (const numero of ['16200000', '16300000', '16400000']) {
      expect(estCompteFondsProjet(numero)).toBe(true);
      expect(motifRefusSortieProjet({ projet: true, numeroCompteFonds: numero, cumulAmorti: 0, cumulDepreciation: 0 })).toBeNull();
    }
    for (const numero of ['16100000', '16700000', '46200000']) {
      expect(estCompteFondsProjet(numero)).toBe(false);
      expect(motifRefusSortieProjet({ projet: true, numeroCompteFonds: numero, cumulAmorti: 0, cumulDepreciation: 0 })).not.toBeNull();
    }
  });

  it('une liste vide dit pourquoi et ce qu’il faut faire', () => {
    expect(motifListeFondsProjetVide({ projet: true, nombre: 2, inactifs: 0 })).toBeNull();
    expect(motifListeFondsProjetVide({ projet: true, nombre: 0, inactifs: 0 })).toContain('Plan comptable');
    expect(motifListeFondsProjetVide({ projet: true, nombre: 0, inactifs: 1 })).toContain('sommeil');
    expect(motifListeFondsProjetVide({ projet: false, nombre: 0, inactifs: 0 })).toContain('projet de développement');
  });

  function service(jeu: string, comptes: Array<{ id: string; numero: string; intitule: string; estActif: boolean }>, referentiel = 'SYCEBNL') {
    const appels: { compte?: unknown } = {};
    const prisma = {
      tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ referentiel, systemeComptableSyscohada: null, jeuEtatsFinanciersSycebnl: jeu }) },
      compte: {
        findMany: jest.fn().mockImplementation((args: unknown) => {
          appels.compte = args;
          return Promise.resolve(comptes);
        }),
      },
    };
    return { svc: new ImmobilisationService(prisma as never, {} as never), appels, prisma };
  }

  it('sert les fonds actifs, bornés au dossier, et compte ceux en sommeil · aucun solde ne présélectionne', async () => {
    const { svc, appels } = service('PROJETS_DEVELOPPEMENT', [
      { id: 'a', numero: '16200000', intitule: 'Bailleurs', estActif: true },
      { id: 'b', numero: '16300000', intitule: 'État', estActif: true },
      { id: 'c', numero: '16400000', intitule: 'Autres', estActif: false },
    ]);
    const r = await svc.comptesFondsProjet('t1');
    expect(r.projet).toBe(true);
    expect(r.comptes).toEqual([
      { id: 'a', numero: '16200000', intitule: 'Bailleurs' },
      { id: 'b', numero: '16300000', intitule: 'État' },
    ]);
    expect(r.enSommeil).toBe(1);
    expect(r.motifVide).toBeNull();
    expect(appels.compte).toMatchObject({
      where: { tenantId: 't1', typeCompte: 'DETAIL', OR: [{ numero: { startsWith: '162' } }, { numero: { startsWith: '163' } }, { numero: { startsWith: '164' } }] },
    });
  });

  it('hors projet, rien n’est lu et la raison est dite', async () => {
    const { svc, prisma } = service('ASSOCIATIONS_ORDRES_PROFESSIONNELS', []);
    const r = await svc.comptesFondsProjet('t1');
    expect(r.comptes).toEqual([]);
    expect(r.motifVide).toContain('projet de développement');
    expect(prisma.compte.findMany).not.toHaveBeenCalled();
  });

  it('au SYSCOHADA, 162 à 164 sont des emprunts · jamais servis, même avec un jeu de projet enregistré', async () => {
    const { svc, prisma } = service('PROJETS_DEVELOPPEMENT', [{ id: 'a', numero: '16200000', intitule: 'Emprunts', estActif: true }], 'SYSCOHADA');
    const r = await svc.comptesFondsProjet('t1');
    expect(r.projet).toBe(false);
    expect(r.comptes).toEqual([]);
    expect(prisma.compte.findMany).not.toHaveBeenCalled();
  });

  it('tous en sommeil · liste vide, motif nommé', async () => {
    const { svc } = service('PROJETS_DEVELOPPEMENT', [{ id: 'c', numero: '16400000', intitule: 'Autres', estActif: false }]);
    const r = await svc.comptesFondsProjet('t1');
    expect(r.comptes).toEqual([]);
    expect(r.motifVide).toContain('sommeil');
  });
});
