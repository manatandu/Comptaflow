import { garderCloisonnement } from './extension-cloisonnement';
import { CloisonnementViole, horsCloisonnement, perimetreDeGroupe } from './contexte-cloisonnement';
import { dansContexteAudit } from '../audit/contexte-audit';

/**
 * AUDIT FINAL F240 · UNE MISE À JOUR NE DÉPLACE PAS UNE LIGNE CHEZ UN AUTRE.
 *
 * Les règles B et C regardaient la ligne VISÉE (le filtre, ou sa relecture),
 * jamais la ligne OBTENUE (les données). Un filtre borné sur la session
 * faisait rendre la main AVANT toute lecture de `data` · la ligne partait
 * alors chez un autre cabinet, qui la trouvait ensuite dans ses collections
 * comme si elle y était née. Le défaut ne lève rien, ne déséquilibre rien, et
 * du côté du dossier d'origine il se lit comme une ligne disparue.
 *
 * Tous les cas ci-dessous portent un filtre borné sur la session ou une
 * relecture qui rend le bon dossier · c'est exactement ce qui faisait passer
 * le défaut, et ce qu'un test « sans borne » n'aurait jamais montré.
 */

const D = 'd-1';
const AUTRE = 'd-2';

const dansDossier = <T,>(tenantId: string, f: () => Promise<T>) =>
  dansContexteAudit({ acteurEmail: 'x@y.cd', tenantId }, f);

/** Une base dont la relecture (règle B) rend une ligne du dossier de la session. */
const base = () => ({ compte: { findFirst: jest.fn().mockResolvedValue({ tenantId: D }) } }) as any;

const ecrire = (
  operation: string,
  args: unknown,
  query: (args: unknown) => Promise<unknown> = jest.fn(async () => ({ id: 'c-1' })),
) => garderCloisonnement(base(), { model: 'Compte', operation, args, query });

describe('F240 · la ligne obtenue, et pas seulement la ligne visée', () => {
  it('update · un filtre borné ne laisse plus passer un tenantId étranger dans data', async () => {
    // LE cas. Avant correction, `filtreBorne` rendait la main sur le filtre
    // et la requête partait sans que `data` soit lu.
    const query = jest.fn(async () => ({ id: 'c-1' }));
    await expect(
      dansDossier(D, () => ecrire('update', { where: { id: 'c-1', tenantId: D }, data: { tenantId: AUTRE } }, query)),
    ).rejects.toThrow(/Mise à jour refusée · Compte\.update ferait passer la ligne dans un autre dossier/);
    expect(query).not.toHaveBeenCalled();
  });

  it('update · la relecture qui rend le bon dossier ne suffit plus non plus', async () => {
    const query = jest.fn(async () => ({ id: 'c-1' }));
    await expect(
      dansDossier(D, () => ecrire('update', { where: { id: 'c-1' }, data: { intitule: 'X', tenantId: AUTRE } }, query)),
    ).rejects.toBeInstanceOf(CloisonnementViole);
    expect(query).not.toHaveBeenCalled();
  });

  it('updateMany · une collection bornée ne se déverse pas chez un autre', async () => {
    const query = jest.fn(async () => ({ count: 40 }));
    await expect(
      dansDossier(D, () => ecrire('updateMany', { where: { tenantId: D }, data: { tenantId: AUTRE } }, query)),
    ).rejects.toThrow(/Compte\.updateMany ferait passer la ligne/);
    expect(query).not.toHaveBeenCalled();
  });

  it('upsert · le bloc `update` est lu comme le bloc `create`', async () => {
    const query = jest.fn(async () => ({ id: 'c-1' }));
    await expect(
      dansDossier(D, () =>
        ecrire(
          'upsert',
          { where: { id: 'c-1', tenantId: D }, create: { tenantId: D, numero: '1' }, update: { tenantId: AUTRE } },
          query,
        ),
      ),
    ).rejects.toThrow(/Compte\.upsert ferait passer la ligne/);
    expect(query).not.toHaveBeenCalled();
  });

  it('lit les formes qui nomment un dossier · `set` et `tenant.connect.id`', async () => {
    for (const data of [
      { tenantId: { set: AUTRE } },
      { tenant: { connect: { id: AUTRE } } },
      // Un critère de plus à côté de l'identifiant ne le rend pas illisible.
      { tenant: { connect: { id: AUTRE, dossierCombinaisonId: 'x' } } },
    ]) {
      await expect(
        dansDossier(D, () => ecrire('update', { where: { id: 'c-1', tenantId: D }, data })),
      ).rejects.toThrow(/ferait passer la ligne dans un autre dossier/);
    }
  });

  it('`null` est une cible · il sortirait la ligne de tout dossier', async () => {
    for (const data of [{ tenantId: null }, { tenantId: { set: null } }]) {
      await expect(
        dansDossier(D, () => ecrire('update', { where: { id: 'c-1', tenantId: D }, data })),
      ).rejects.toThrow(/ferait passer la ligne dans un autre dossier/);
    }
  });

  it('refuse, sans deviner, une forme qui change le dossier sans le nommer', async () => {
    // `connect` par une autre clé unique du dossier, création d'un dossier,
    // `connectOrCreate`, `disconnect`, opérateur inconnu sur la colonne · la
    // garde ne sait pas où la ligne irait, elle refuse.
    for (const data of [
      { tenant: { connect: { dossierCombinaisonId: 'x' } } },
      { tenant: { create: { raisonSociale: 'Écran' } } },
      { tenant: { connectOrCreate: { where: { id: AUTRE }, create: {} } } },
      { tenant: { disconnect: true } },
      { tenantId: { set: AUTRE, mode: 'insensitive' } },
      { tenant: 'd-2' },
    ]) {
      await expect(
        dansDossier(D, () => ecrire('update', { where: { id: 'c-1', tenantId: D }, data })),
      ).rejects.toThrow(/sous une forme que la garde ne sait pas lire/);
    }
  });
});

describe('F240 · ce qui passait doit passer encore', () => {
  it('le tenantId de la session, posé dans data, passe · SimulationsService.modifier le fait', async () => {
    const query = jest.fn(async () => ({ id: 'c-1' }));
    await dansDossier(D, () =>
      ecrire('update', { where: { id: 'c-1' }, data: { intitule: 'Caisse', tenantId: D } }, query),
    );
    expect(query).toHaveBeenCalled();
  });

  it('une mise à jour qui ne touche pas au dossier passe, `update: {}` des semis compris', async () => {
    const query = jest.fn(async () => ({ id: 'c-1' }));
    await dansDossier(D, () => ecrire('update', { where: { id: 'c-1', tenantId: D }, data: { intitule: 'X' } }, query));
    await dansDossier(D, () =>
      ecrire('upsert', { where: { id: 'c-1', tenantId: D }, create: { tenantId: D }, update: {} }, query),
    );
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('`tenant: { update }` ne déplace rien · il modifie le dossier déjà vérifié', async () => {
    const query = jest.fn(async () => ({ id: 'c-1' }));
    await dansDossier(D, () =>
      ecrire('update', { where: { id: 'c-1', tenantId: D }, data: { tenant: { update: { nom: 'X' } } } }, query),
    );
    expect(query).toHaveBeenCalled();
  });

  it('le périmètre du siège admet ses cellules déclarées, et elles seules', async () => {
    const query = jest.fn(async () => ({ count: 1 }));
    await dansDossier(D, () =>
      perimetreDeGroupe([D, 'cellule-a'], () =>
        ecrire('updateMany', { where: { tenantId: D }, data: { tenantId: 'cellule-a' } }, query),
      ),
    );
    expect(query).toHaveBeenCalledTimes(1);
    await expect(
      dansDossier(D, () =>
        perimetreDeGroupe([D, 'cellule-a'], () =>
          ecrire('updateMany', { where: { tenantId: D }, data: { tenantId: AUTRE } }, query),
        ),
      ),
    ).rejects.toBeInstanceOf(CloisonnementViole);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('la sortie déclarée garde son comportement · elle ne regarde rien', async () => {
    const query = jest.fn(async () => ({ id: 'c-1' }));
    await dansDossier(D, () =>
      horsCloisonnement('console', () =>
        ecrire('update', { where: { id: 'c-1' }, data: { tenantId: AUTRE } }, query),
      ),
    );
    expect(query).toHaveBeenCalled();
  });
});
