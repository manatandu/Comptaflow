import { Referentiel } from '@prisma/client';
import { AuthService } from './auth.service';

/**
 * UNE INSCRIPTION EST TOUT OU RIEN.
 *
 * `register` crée neuf choses à la suite : le dossier, sa licence, son
 * administrateur, son plan de comptes, ses journaux, ses taux de taxe, ses
 * familles d'immobilisations, ses plans analytiques, ses niveaux de relance
 * et son exercice. Elles ne vivaient pas dans la même transaction, et le
 * code l'assumait par écrit comme « une limite du MVP à durcir avant une
 * mise en prod réelle ».
 *
 * La mise en production a eu lieu. L'état incohérent que ce commentaire
 * décrivait est un dossier ouvert SANS PLAN DE COMPTES : on s'y connecte,
 * aucune saisie n'est possible, aucun état ne sort, et rien ne dit pourquoi.
 *
 * Ce que ce spec verrouille n'est pas « la transaction existe » · c'est que
 * RIEN N'Y ÉCHAPPE. Le jour où quelqu'un ajoutera un dixième semis en
 * oubliant de lui passer `tx`, l'atomicité sautera sans qu'aucun test de
 * comportement ne bronche : la création marcherait toujours. C'est le
 * défaut qu'on attrape ici.
 */
type Appel = { nom: string; recuTx: boolean };

function service(options?: { echoueSur?: string }) {
  const appels: Appel[] = [];
  const surPrisma: string[] = [];
  let optionsTransaction: Record<string, number> | undefined;

  // Le client de transaction · reconnaissable, pour que chaque service puisse
  // dire s'il l'a bien reçu.
  const tx = { __estLaTransaction: true, user: { create: async () => ({ id: 'u1' }) } };
  const recevoir = (nom: string) => async (...args: unknown[]) => {
    const dernier = args[args.length - 1] as { __estLaTransaction?: boolean } | undefined;
    appels.push({ nom, recuTx: dernier?.__estLaTransaction === true });
    if (options?.echoueSur === nom) throw new Error(`échec simulé du semis ${nom}`);
    return undefined;
  };

  const s = new AuthService(
    {
      user: {
        findUnique: async () => null,
        // Si `register` créait l'administrateur hors transaction, il
        // passerait ICI · et le test le verrait.
        create: async () => {
          surPrisma.push('user.create');
          return { id: 'u-hors-transaction' };
        },
      },
      $transaction: async (fn: (t: unknown) => Promise<unknown>, opts?: Record<string, number>) => {
        optionsTransaction = opts;
        return fn(tx);
      },
    } as never,
    { sign: () => 'jeton' } as never,
    {
      creerTenant: async (_p: unknown, client?: { __estLaTransaction?: boolean }) => {
        appels.push({ nom: 'creerTenant', recuTx: client?.__estLaTransaction === true });
        return { id: 't1', nom: 'X', referentiel: Referentiel.SYCEBNL };
      },
    } as never,
    { seedPlan: recevoir('seedPlan') } as never,
    {
      creerExerciceCourant: async (_t: string, client?: { __estLaTransaction?: boolean }) => {
        appels.push({ nom: 'creerExerciceCourant', recuTx: client?.__estLaTransaction === true });
        return { id: 'ex1' };
      },
    } as never,
    { seedJournauxDefaut: recevoir('seedJournauxDefaut') } as never,
    { seedTauxDefaut: recevoir('seedTauxDefaut') } as never,
    { seedFamillesDefaut: recevoir('seedFamillesDefaut') } as never,
    { seedPlansDefaut: recevoir('seedPlansDefaut') } as never,
    { seedNiveauxDefaut: recevoir('seedNiveauxDefaut') } as never,
  );
  return { s, appels, surPrisma, options: () => optionsTransaction };
}

const DTO = { nomEntite: 'X', email: 'a@b.cd', motDePasse: 'motdepasse12', referentiel: Referentiel.SYCEBNL };

describe('AuthService.register · tout ou rien', () => {
  it('fait passer les NEUF créations par la transaction, sans exception', async () => {
    const { s, appels } = service();
    await s.register(DTO as never);
    const attendus = [
      'creerTenant',
      'seedPlan',
      'seedJournauxDefaut',
      'seedTauxDefaut',
      'seedFamillesDefaut',
      'seedPlansDefaut',
      'seedNiveauxDefaut',
      'creerExerciceCourant',
    ];
    // Chacun a bien été appelé...
    expect(appels.map((a) => a.nom).sort()).toEqual([...attendus].sort());
    // ...et chacun a reçu la transaction. C'est l'assertion qui compte : elle
    // échoue dès qu'un appel oublie `tx`, même si la création réussit.
    expect(appels.filter((a) => !a.recuTx)).toEqual([]);
  });

  it("l'administrateur est créé DANS la transaction, jamais sur le client ordinaire", async () => {
    const { s, surPrisma } = service();
    await s.register(DTO as never);
    expect(surPrisma).toEqual([]);
  });

  it('laisse au semis le temps qu’il prend · les cinq secondes par défaut de Prisma ne suffisent pas', async () => {
    const { s, options } = service();
    await s.register(DTO as never);
    // 1401 comptes puis journaux, taxes et familles compte par compte : le
    // semis enchaîne environ quatre-vingts allers-retours vers Neon. Un
    // dépassement de délai laisserait exactement l'état que ce spec combat.
    expect(options()?.timeout).toBeGreaterThanOrEqual(30_000);
  });

  it('un semis qui échoue fait remonter l’erreur · la transaction n’avale rien', async () => {
    const { s, appels } = service({ echoueSur: 'seedJournauxDefaut' });
    await expect(s.register(DTO as never)).rejects.toThrow(/seedJournauxDefaut/);
    // Et les semis suivants ne sont même pas tentés : la séquence s'arrête à
    // l'échec, ce qui est bien le comportement voulu · en base, la
    // transaction est défaite et le dossier n'a jamais existé.
    expect(appels.map((a) => a.nom)).not.toContain('seedTauxDefaut');
    expect(appels.map((a) => a.nom)).not.toContain('creerExerciceCourant');
  });
});
