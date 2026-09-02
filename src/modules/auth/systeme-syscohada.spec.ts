import { Referentiel, SystemeComptableSyscohada } from '@prisma/client';
import { AuthService } from './auth.service';

/**
 * SYSTÈME COMPTABLE À LA CRÉATION · le SYSCOHADA a DEUX présentations
 * (AUDCIF art. 11), pas une seule. Ce spec verrouille les deux règles de
 * croisement référentiel/système, qui sont symétriques et faciles à casser :
 * un dossier SYCEBNL ne doit jamais porter de système SYSCOHADA, et un
 * dossier SYSCOHADA ne doit jamais porter de jeu d'états SYCEBNL.
 */
describe('AuthService.register · système comptable par référentiel', () => {
  function service() {
    const creations: Array<Record<string, unknown>> = [];
    const s = new AuthService(
      {
        user: { findUnique: async () => null },
        // `register` crée tout dans une transaction · le faux Prisma doit donc
        // en fournir une, sinon rien de ce que ce spec observe n'est atteint.
        $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({ user: { create: async () => ({ id: 'u1' }) } }),
      } as never,
      { sign: () => 'jeton' } as never,
      {
        creerTenant: async (params: Record<string, unknown>) => {
          creations.push(params);
          return { id: 't1', nom: params.nom, referentiel: params.referentiel };
        },
      } as never,
      { seedPlan: async () => undefined } as never,
      { creerExerciceCourant: async () => ({ id: 'ex1' }) } as never,
      { seedJournauxDefaut: async () => undefined } as never,
      { seedTauxDefaut: async () => undefined } as never,
      { seedFamillesDefaut: async () => undefined } as never,
      { seedPlansDefaut: async () => undefined } as never,
      { seedNiveauxDefaut: async () => undefined } as never,
    );
    return { s, creations };
  }

  const base = { nomEntite: 'X', email: 'a@b.cd', motDePasse: 'motdepasse12' };

  it('retient le système demandé pour un dossier SYSCOHADA, et aucun jeu SYCEBNL', async () => {
    const { s, creations } = service();
    await s.register({
      ...base,
      referentiel: Referentiel.SYSCOHADA,
      systemeComptableSyscohada: SystemeComptableSyscohada.MINIMAL_TRESORERIE,
      // Envoyé par le client, qui ne dédouble pas la règle · doit être ignoré.
      jeuEtatsFinanciersSycebnl: 'PROJETS_DEVELOPPEMENT',
    } as never);
    expect(creations[0].systemeComptableSyscohada).toBe(SystemeComptableSyscohada.MINIMAL_TRESORERIE);
    expect(creations[0].jeuEtatsFinanciersSycebnl).toBeUndefined();
  });

  it('retient le Système normal par défaut · régime de droit commun de l’art. 11', async () => {
    const { s, creations } = service();
    await s.register({ ...base, referentiel: Referentiel.SYSCOHADA } as never);
    expect(creations[0].systemeComptableSyscohada).toBe(SystemeComptableSyscohada.NORMAL);
  });

  it('ne pose aucun système sur un dossier SYCEBNL, même si le client en envoie un', async () => {
    const { s, creations } = service();
    await s.register({
      ...base,
      referentiel: Referentiel.SYCEBNL,
      jeuEtatsFinanciersSycebnl: 'SYSTEME_MINIMAL_TRESORERIE',
      systemeComptableSyscohada: SystemeComptableSyscohada.MINIMAL_TRESORERIE,
    } as never);
    expect(creations[0].systemeComptableSyscohada).toBeUndefined();
    expect(creations[0].jeuEtatsFinanciersSycebnl).toBe('SYSTEME_MINIMAL_TRESORERIE');
  });
});
