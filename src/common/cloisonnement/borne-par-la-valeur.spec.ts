import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { filtreBorne, garderCloisonnement } from './extension-cloisonnement';
import { CloisonnementViole, horsCloisonnement, perimetreDeGroupe } from './contexte-cloisonnement';
import { dansContexteAudit } from '../audit/contexte-audit';

/**
 * LA BORNE SE VÉRIFIE PAR SA VALEUR, PAS PAR SA PRÉSENCE.
 *
 * Ce que faisait la garde jusqu'ici · `filtreBorne` rendait `true` dès qu'un
 * `tenantId` figurait quelque part dans le filtre, quelle qu'en soit la
 * valeur. Trois conséquences, et la première n'est pas la pire :
 *
 *  · `findMany({ where: { tenantId: dossierDUnAutreCabinet } })` était servi ;
 *  · la règle B (relecture AVANT écriture) et la règle A (vérification APRÈS
 *    lecture) se court-circuitent toutes deux sur `filtreBorne` · un tenantId
 *    étranger ne se contentait donc pas de passer, il DÉSACTIVAIT la garde ;
 *  · `{ tenantId: { not: null } }` et `{ OR: [{ tenantId: d }, {}] }` étaient
 *    lus comme des bornes alors qu'ils rendent le monde entier.
 *
 * Aucun test ne portait sur la VALEUR · tous les cas de `cloisonnement.spec.ts`
 * passent un `tenantId` égal au dossier de la session, si bien que la présence
 * et l'égalité y donnent le même résultat. C'est exactement le trou que ce
 * fichier ferme.
 */

const D = 'd-1';
const AUTRE = 'd-2';

describe('filtreBorne · l’égalité, et non la présence', () => {
  it('refuse un tenantId qui n’est pas celui de la session', () => {
    // LE test. Avant correction il rendait `true`.
    expect(filtreBorne({ tenantId: AUTRE }, D)).toBe(false);
    expect(filtreBorne({ tenantId: D }, D)).toBe(true);
  });

  it('refuse les formes qui portent un tenantId sans borner', () => {
    expect(filtreBorne({ tenantId: { not: null } }, D)).toBe(false);
    expect(filtreBorne({ tenantId: { not: AUTRE } }, D)).toBe(false);
    expect(filtreBorne({ tenantId: { notIn: [AUTRE] } }, D)).toBe(false);
    expect(filtreBorne({ NOT: { tenantId: D } }, D)).toBe(false);
    // Sans dossier de session il n'y a rien à comparer · une valeur littérale
    // suffit alors, mais `{ not: null }` reste refusé.
    expect(filtreBorne({ tenantId: { not: null } })).toBe(false);
    expect(filtreBorne({ tenantId: AUTRE })).toBe(true);
  });

  it('n’interprète que `equals` et `in`, et refuse le reste plutôt que de deviner', () => {
    expect(filtreBorne({ tenantId: { equals: D } }, D)).toBe(true);
    expect(filtreBorne({ tenantId: { in: [D] } }, D)).toBe(true);
    expect(filtreBorne({ tenantId: { in: [D, AUTRE] } }, D)).toBe(false);
    expect(filtreBorne({ tenantId: { in: [] } }, D)).toBe(false);
    // `mode: 'insensitive'` ferait correspondre un autre dossier à la casse
    // près · la garde refuse au lieu de trancher.
    expect(filtreBorne({ tenantId: { equals: D, mode: 'insensitive' } }, D)).toBe(false);
  });

  it('exige que TOUTES les branches d’un OR bornent', () => {
    // Une seule branche libre rend le monde entier · l'ancienne version
    // acceptait celle-ci.
    expect(filtreBorne({ OR: [{ tenantId: D }, {}] }, D)).toBe(false);
    expect(filtreBorne({ OR: [{ tenantId: D }, { tenantId: AUTRE }] }, D)).toBe(false);
    expect(filtreBorne({ OR: [{ tenantId: D }, { tenantId: D, statut: 'X' }] }, D)).toBe(true);
    expect(filtreBorne({ OR: [] }, D)).toBe(false);
    // Une CONJONCTION, elle, se contente d'une branche bornée.
    expect(filtreBorne({ AND: [{ statut: 'X' }, { tenantId: D }] }, D)).toBe(true);
  });

  it('suit la borne à travers une relation, valeur comprise', () => {
    expect(filtreBorne({ ecriture: { tenantId: D } }, D)).toBe(true);
    expect(filtreBorne({ ecriture: { tenantId: AUTRE } }, D)).toBe(false);
    // `none` et `every` ne bornent pas · `every` est vrai pour une ligne sans
    // relation, `none` inverse la condition.
    expect(filtreBorne({ lignes: { some: { tenantId: D } } }, D)).toBe(true);
    expect(filtreBorne({ lignes: { none: { tenantId: D } } }, D)).toBe(false);
    expect(filtreBorne({ lignes: { every: { tenantId: D } } }, D)).toBe(false);
  });
});

describe('la garde · un tenantId étranger ne la désactive plus', () => {
  const base = (ligne: unknown = null) =>
    ({ compte: { findFirst: jest.fn().mockResolvedValue(ligne) } }) as any;

  const dansDossier = <T,>(tenantId: string, f: () => Promise<T>) =>
    dansContexteAudit({ acteurEmail: 'x@y.cd', tenantId }, f);

  it('C · refuse une collection bornée sur un AUTRE dossier', async () => {
    await expect(
      dansDossier(D, () =>
        garderCloisonnement(base(), {
          model: 'Compte',
          operation: 'findMany',
          args: { where: { tenantId: AUTRE } },
          query: async () => [{ id: 'c-1', tenantId: AUTRE }],
        }),
      ),
    ).rejects.toBeInstanceOf(CloisonnementViole);
  });

  it('B · relit et refuse au lieu de court-circuiter sur le filtre', async () => {
    const b = base({ tenantId: AUTRE });
    await expect(
      dansDossier(D, () =>
        garderCloisonnement(b, {
          model: 'Compte',
          operation: 'update',
          args: { where: { id: 'c-1', tenantId: AUTRE }, data: { intitule: 'X' } },
          query: async () => ({ id: 'c-1' }),
        }),
      ),
    ).rejects.toBeInstanceOf(CloisonnementViole);
    // La relecture a bien EU LIEU · avant correction, le `tenantId` au filtre
    // faisait rendre la main avant elle.
    expect(b.compte.findFirst).toHaveBeenCalledTimes(1);
  });

  it('A · vérifie encore la ligne quand le filtre porte un dossier étranger', async () => {
    const r = await dansDossier(D, () =>
      garderCloisonnement(base(), {
        model: 'Compte',
        operation: 'findFirst',
        args: { where: { tenantId: AUTRE, numero: '52110000' } },
        query: async () => ({ id: 'c-1', tenantId: AUTRE }),
      }),
    );
    expect(r).toBeNull();
  });
});

describe('le périmètre du siège · une sortie mesurée, pas une sortie', () => {
  const base = () => ({ compte: { findFirst: jest.fn() } }) as any;
  const dansDossier = <T,>(tenantId: string, f: () => Promise<T>) =>
    dansContexteAudit({ acteurEmail: 'x@y.cd', tenantId }, f);

  const lire = (dossierLu: string) =>
    garderCloisonnement(base(), {
      model: 'Compte',
      operation: 'findMany',
      args: { where: { tenantId: dossierLu } },
      query: async () => [{ id: 'c-1', tenantId: dossierLu }],
    });

  it('laisse le siège lire une cellule DÉCLARÉE', async () => {
    const r = await dansDossier(D, () =>
      perimetreDeGroupe([D, 'cellule-a'], () => lire('cellule-a')),
    );
    expect(r).toEqual([{ id: 'c-1', tenantId: 'cellule-a' }]);
  });

  it('refuse un dossier ABSENT de la déclaration', async () => {
    // C'est toute la différence avec `horsCloisonnement`, qui accepterait
    // n'importe quel dossier, y compris celui d'un autre cabinet.
    await expect(
      dansDossier(D, () => perimetreDeGroupe([D, 'cellule-a'], () => lire(AUTRE))),
    ).rejects.toBeInstanceOf(CloisonnementViole);
    await expect(
      dansDossier(D, () => horsCloisonnement('console', () => lire(AUTRE))),
    ).resolves.toEqual([{ id: 'c-1', tenantId: AUTRE }]);
  });

  it('n’ouvre pas la porte à un filtre non borné', async () => {
    await expect(
      dansDossier(D, () =>
        perimetreDeGroupe([D, 'cellule-a'], () =>
          garderCloisonnement(base(), {
            model: 'Compte',
            operation: 'findMany',
            args: { where: { classe: 'CLASSE_5' } },
            query: async () => [],
          }),
        ),
      ),
    ).rejects.toBeInstanceOf(CloisonnementViole);
  });

  it('se referme à la sortie de la portée', async () => {
    await expect(
      dansDossier(D, async () => {
        await perimetreDeGroupe([D, 'cellule-a'], () => lire('cellule-a'));
        return lire('cellule-a');
      }),
    ).rejects.toBeInstanceOf(CloisonnementViole);
  });

  it('une portée imbriquée AJOUTE au périmètre, elle ne le remplace pas', async () => {
    // Le dossier de combinaison naît au milieu de la liasse du groupe · sans
    // héritage, l'entrer dans une portée interne perdrait les cellules.
    const r = await dansDossier(D, () =>
      perimetreDeGroupe([D, 'cellule-a'], () =>
        perimetreDeGroupe(['combinaison'], async () => [
          await lire('cellule-a'),
          await lire('combinaison'),
        ]),
      ),
    );
    expect(r).toHaveLength(2);
  });
});

describe('le siège déclare son périmètre pour chaque méthode qui franchit', () => {
  it('aucune méthode publique de GroupeService ne lit une cellule sans le dire', () => {
    // Le module groupe est le SEUL à franchir la frontière des dossiers en
    // régime normal. Une méthode ajoutée demain sans passer par
    // `dansLeGroupe` serait refusée par la garde en production et passerait
    // ici · ce test la fait tomber à l'écriture.
    const source = readFileSync(
      join(__dirname, '..', '..', 'modules', 'groupe', 'groupe.service.ts'),
      'utf8',
    );
    const publiques = [...source.matchAll(/^ {2}async (\w+)\(/gm)].map(([, nom]) => nom);
    // `cellules` et `creerCellule` ne touchent que `Tenant`, qui n'est pas un
    // modèle cloisonné · `creerCellule` déclare à part la cellule qu'elle
    // vient d'ouvrir, absente par construction de tout périmètre calculé.
    const sansFranchissement = ['cellules', 'creerCellule'];
    for (const nom of publiques) {
      if (sansFranchissement.includes(nom)) continue;
      // La façade publique, jusqu'à son accolade fermante · elle doit ouvrir
      // le périmètre ET appeler le corps qui franchit.
      const facade = source.slice(source.indexOf(`  async ${nom}(`)).split('\n  }\n')[0];
      expect(facade).toContain('this.dansLeGroupe(tenantId,');
      expect(facade).toContain(`this.${nom}DuGroupe(`);
    }
    // Le test ne vaut que s'il porte sur quelque chose · sept méthodes
    // franchissent aujourd'hui.
    expect(publiques.filter((n) => !sansFranchissement.includes(n))).toHaveLength(7);
    expect(source).toContain("perimetreDeGroupe([resultat.tenant.id]");
  });
});
