import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { MODELES_CLOISONNES, MODELES_PORTES_PAR_LEUR_PARENT } from './modeles-cloisonnes';
import { filtreBorne, garderCloisonnement } from './extension-cloisonnement';
import { horsCloisonnement, CloisonnementViole } from './contexte-cloisonnement';
import { dansContexteAudit } from '../audit/contexte-audit';

/**
 * CLOISONNEMENT MULTI-LOCATAIRE.
 *
 * CLAUDE.md §8 : « Toute requête est filtrée par tenantId. Une requête Prisma
 * sans tenantId sur une table multi-locataire est un défaut de cloisonnement. »
 * C'était une règle de discipline. Le balayage du 2026-09-02 l'a trouvée
 * respectée sur les 361 appels Prisma des modèles cloisonnés · mais une
 * requête écrite un jour sans ce filtre passerait tous les tests, ne lèverait
 * aucune erreur, et rendrait les données d'un autre cabinet.
 *
 * Ces tests portent sur les deux moitiés de la réponse : la garde au moteur
 * (elle refuse), et le balayage du code (il empêche d'écrire le cas que la
 * garde refuserait, plutôt que de l'apprendre en production).
 */

const RACINE = join(__dirname, '..', '..', '..');

describe('la liste des modèles cloisonnés suit le schéma', () => {
  it('ne diverge pas de prisma/schema.prisma', () => {
    // Un modèle ajouté au schéma et oublié dans la liste échapperait à la
    // garde sans que rien ne le dise. C'est la panne silencieuse type.
    const schema = readFileSync(join(RACINE, 'prisma/schema.prisma'), 'utf8');
    const blocs = [...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)];
    const avec = blocs.filter(([, , corps]) => /^\s*tenantId\s/m.test(corps)).map(([, nom]) => nom);
    const sans = blocs.filter(([, , corps]) => !/^\s*tenantId\s/m.test(corps)).map(([, nom]) => nom);

    expect([...MODELES_CLOISONNES].sort()).toEqual(avec.sort());
    // `Tenant` est le dossier lui-même · il ne se cloisonne pas contre
    // lui-même, il est la borne.
    expect([...MODELES_PORTES_PAR_LEUR_PARENT].sort()).toEqual(sans.filter((n) => n !== 'Tenant').sort());
  });
});

describe('reconnaissance d’un filtre borné', () => {
  it('voit la borne, y compris sous un AND, un OR ou une relation', () => {
    expect(filtreBorne({ tenantId: 'd-1' })).toBe(true);
    expect(filtreBorne({ AND: [{ statut: 'X' }, { tenantId: 'd-1' }] })).toBe(true);
    expect(filtreBorne({ OR: [{ tenantId: 'd-1' }, { tenantId: 'd-2' }] })).toBe(true);
    // Une ligne d'écriture se borne par son écriture · c'est la seule borne
    // dont disposent les modèles portés par leur parent.
    expect(filtreBorne({ ecriture: { tenantId: 'd-1' } })).toBe(true);
  });

  it('ne prend pas un filtre par identifiant pour une borne', () => {
    expect(filtreBorne({ id: 'c-1' })).toBe(false);
    expect(filtreBorne({ planId: 'p-1', type: 'DETAIL' })).toBe(false);
    expect(filtreBorne(undefined)).toBe(false);
    expect(filtreBorne({})).toBe(false);
  });
});

describe('la garde, règle par règle', () => {
  const base = (ligne: unknown = null) =>
    ({
      compte: { findFirst: jest.fn().mockResolvedValue(ligne) },
      ligneEcriture: { findFirst: jest.fn() },
    }) as any;

  const dansDossier = <T,>(tenantId: string, f: () => Promise<T>) =>
    dansContexteAudit({ acteurEmail: 'x@y.cd', tenantId }, f);

  it('C · refuse une collection sans borne de dossier', async () => {
    await expect(
      dansDossier('d-1', () =>
        garderCloisonnement(base(), {
          model: 'Compte',
          operation: 'findMany',
          args: { where: { classe: 'CLASSE_5' } },
          query: async () => [{ id: 'c-1' }],
        }),
      ),
    ).rejects.toBeInstanceOf(CloisonnementViole);
  });

  it('C · laisse passer une collection bornée', async () => {
    const r = await dansDossier('d-1', () =>
      garderCloisonnement(base(), {
        model: 'Compte',
        operation: 'findMany',
        args: { where: { tenantId: 'd-1', classe: 'CLASSE_5' } },
        query: async () => [{ id: 'c-1' }],
      }),
    );
    expect(r).toEqual([{ id: 'c-1' }]);
  });

  it('A · rend INEXISTANTE une ligne d’un autre dossier, sans le dire', async () => {
    // Une erreur distincte apprendrait à l'appelant que l'identifiant existe
    // ailleurs. L'absence est la seule réponse qui n'apprend rien.
    const r = await dansDossier('d-1', () =>
      garderCloisonnement(base(), {
        model: 'Compte',
        operation: 'findUnique',
        args: { where: { id: 'c-1' } },
        query: async () => ({ id: 'c-1', tenantId: 'd-2', numero: '52110000' }),
      }),
    );
    expect(r).toBeNull();
  });

  it('A · rend la ligne du bon dossier', async () => {
    const r = await dansDossier('d-1', () =>
      garderCloisonnement(base(), {
        model: 'Compte',
        operation: 'findUnique',
        args: { where: { id: 'c-1' } },
        query: async () => ({ id: 'c-1', tenantId: 'd-1' }),
      }),
    );
    expect(r).toEqual({ id: 'c-1', tenantId: 'd-1' });
  });

  it('A · ne coûte AUCUNE requête supplémentaire', async () => {
    // La ligne est déjà en main · relire serait doubler le chemin le plus
    // chaud du logiciel.
    const b = base();
    await dansDossier('d-1', () =>
      garderCloisonnement(b, {
        model: 'Compte',
        operation: 'findUnique',
        args: { where: { id: 'c-1' } },
        query: async () => ({ id: 'c-1', tenantId: 'd-1' }),
      }),
    );
    expect(b.compte.findFirst).not.toHaveBeenCalled();
  });

  it('B · refuse d’écrire sur la ligne d’un autre dossier', async () => {
    await expect(
      dansDossier('d-1', () =>
        garderCloisonnement(base({ tenantId: 'd-2' }), {
          model: 'Compte',
          operation: 'update',
          args: { where: { id: 'c-1' }, data: { intitule: 'volé' } },
          query: async () => {
            throw new Error("l'écriture n'aurait jamais dû être tentée");
          },
        }),
      ),
    ).rejects.toBeInstanceOf(CloisonnementViole);
  });

  it('B · laisse écrire sur la ligne de son dossier', async () => {
    const r = await dansDossier('d-1', () =>
      garderCloisonnement(base({ tenantId: 'd-1' }), {
        model: 'Compte',
        operation: 'update',
        args: { where: { id: 'c-1' }, data: { intitule: 'Caisse siège' } },
        query: async () => ({ id: 'c-1', tenantId: 'd-1', intitule: 'Caisse siège' }),
      }),
    );
    expect(r).toMatchObject({ intitule: 'Caisse siège' });
  });

  it('B · ne relit pas quand le filtre porte déjà la borne', async () => {
    const b = base({ tenantId: 'd-1' });
    await dansDossier('d-1', () =>
      garderCloisonnement(b, {
        model: 'Compte',
        operation: 'update',
        args: { where: { id: 'c-1', tenantId: 'd-1' }, data: {} },
        query: async () => ({ id: 'c-1' }),
      }),
    );
    expect(b.compte.findFirst).not.toHaveBeenCalled();
  });

  it('ne touche pas aux modèles qui ne portent pas de dossier', async () => {
    const r = await dansDossier('d-1', () =>
      garderCloisonnement(base(), {
        model: 'LigneEcriture',
        operation: 'findMany',
        args: { where: { compteId: 'c-1' } },
        query: async () => [{ id: 'l-1' }],
      }),
    );
    expect(r).toEqual([{ id: 'l-1' }]);
  });

  it('la sortie déclarée passe, et elle seule', async () => {
    const requete = () =>
      garderCloisonnement(base(), {
        model: 'User',
        operation: 'findUnique',
        args: { where: { email: 'x@y.cd' } },
        query: async () => ({ id: 'u-1', tenantId: 'd-2' }),
      });

    // Sans déclaration · la garde traite le compte comme inexistant.
    expect(await dansDossier('d-1', requete)).toBeNull();
    // Avec déclaration · la connexion doit pouvoir trouver le compte avant de
    // savoir de quel dossier il relève.
    expect(await dansDossier('d-1', () => horsCloisonnement('connexion', requete))).toMatchObject({ id: 'u-1' });
  });
});

/**
 * LE BALAYAGE DU CODE.
 *
 * La garde refuse en production ; ce balayage refuse à l'écriture. Les deux
 * sont nécessaires : les tests du dépôt montent des clients Prisma factices,
 * qui ne passent pas par l'extension · une requête non bornée ne serait donc
 * découverte qu'en production, sur le dossier d'un client.
 */
describe('balayage du code · toute collection porte sa borne', () => {
  const COLLECTIONS = ['findMany', 'updateMany', 'deleteMany', 'count', 'aggregate', 'groupBy'];

  /**
   * Appels dont la borne est portée par une VARIABLE `where` construite plus
   * haut dans la même méthode, avec le tenantId reçu en paramètre. Le balayage
   * ne suit pas les variables · la liste est donc gelée ici, et tout NOUVEAU
   * cas devra être justifié en l'y ajoutant.
   */
  const BORNE_PAR_VARIABLE = new Set([
    'src/common/audit/journal-audit.service.ts:EvenementAudit.count',
    'src/common/audit/journal-audit.service.ts:EvenementAudit.findMany',
    'src/modules/comptabilite/ecriture.service.ts:Ecriture.findMany',
    'src/modules/comptes/compte.service.ts:Compte.findMany',
    'src/modules/registre-donateurs/donation.service.ts:Donation.findMany',
    'src/modules/tiers/tiers.service.ts:Tiers.findMany',
  ]);

  /** Sorties de cloisonnement déclarées · voir contexte-cloisonnement.ts. */
  const SORTIES_DECLAREES = new Set(['src/modules/plateforme/plateforme.service.ts:User.updateMany']);

  function fichiers(dossier: string): string[] {
    const sortie: string[] = [];
    for (const nom of readdirSync(join(RACINE, dossier))) {
      const relatif = `${dossier}/${nom}`;
      if (statSync(join(RACINE, relatif)).isDirectory()) sortie.push(...fichiers(relatif));
      else if (nom.endsWith('.ts') && !nom.endsWith('.spec.ts')) sortie.push(relatif);
    }
    return sortie;
  }

  it('aucune collection non bornée hors des cas gelés', () => {
    const proprietes = new Map([...MODELES_CLOISONNES].map((m) => [m.charAt(0).toLowerCase() + m.slice(1), m]));
    const violations: string[] = [];

    for (const fichier of fichiers('src')) {
      const texte = readFileSync(join(RACINE, fichier), 'utf8');
      for (const m of texte.matchAll(/\b(?:this\.prisma|prisma|tx)\.(\w+)\.(\w+)\(/g)) {
        const modele = proprietes.get(m[1]);
        if (!modele || !COLLECTIONS.includes(m[2])) continue;

        // Le corps de l'appel, jusqu'à la parenthèse fermante correspondante.
        let profondeur = 0;
        let j = m.index! + m[0].length - 1;
        const debut = j;
        while (j < texte.length) {
          if (texte[j] === '(') profondeur++;
          else if (texte[j] === ')' && --profondeur === 0) break;
          j++;
        }
        if (texte.slice(debut, j + 1).includes('tenantId')) continue;

        const cle = `${fichier}:${modele}.${m[2]}`;
        if (BORNE_PAR_VARIABLE.has(cle) || SORTIES_DECLAREES.has(cle)) continue;
        violations.push(`${cle} (ligne ${texte.slice(0, m.index).split('\n').length})`);
      }
    }

    expect(violations).toEqual([]);
  });

  it('la liste des sorties de cloisonnement reste courte et connue', () => {
    // Une sortie ajoutée ailleurs fait tomber ce test. C'est le point : la
    // sortie doit se discuter, pas se glisser.
    const utilisatrices = fichiers('src')
      .filter((f) => !f.startsWith('src/common/cloisonnement/'))
      .filter((f) => readFileSync(join(RACINE, f), 'utf8').includes('horsCloisonnement('));
    expect(utilisatrices.sort()).toEqual([
      'src/modules/auth/auth.service.ts',
      'src/modules/groupe/groupe.service.ts',
      'src/modules/plateforme/plateforme.service.ts',
    ]);
  });

  it('la liste des utilisateurs du périmètre de groupe reste courte et connue', () => {
    // `perimetreDeGroupe` ne sort pas de la garde, elle lui nomme les
    // dossiers admis · c'est moins large que `horsCloisonnement`, ce n'est
    // pas anodin pour autant. Un module qui s'en servirait demain se
    // déclarerait le droit de lire ailleurs que chez lui.
    const utilisatrices = fichiers('src')
      .filter((f) => !f.startsWith('src/common/cloisonnement/'))
      .filter((f) => readFileSync(join(RACINE, f), 'utf8').includes('perimetreDeGroupe('));
    expect(utilisatrices.sort()).toEqual(['src/modules/groupe/groupe.service.ts']);
  });

  it('le client Prisma NU n’est nommé que par l’écrivain de maillon', () => {
    // `clientNu` court-circuite le cloisonnement ET l'audit. Il existe pour
    // que l'écriture d'un maillon ne déclenche pas l'écriture d'un maillon,
    // et pour rien d'autre · s'en servir pour éviter la garde serait
    // exactement le geste qu'elle empêche, et sans le moindre bruit.
    const utilisatrices = fichiers('src')
      .filter((f) => f !== 'src/common/prisma.service.ts')
      .filter((f) => readFileSync(join(RACINE, f), 'utf8').includes('clientNu'));
    expect(utilisatrices.sort()).toEqual(['src/modules/exports/restitution/restitution.service.ts']);
  });
});
