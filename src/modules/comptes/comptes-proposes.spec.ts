import { readdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { ImmobilisationService } from '../immobilisations/immobilisation.service';
import {
  comptesProposes,
  LISTES_DE_COMPTES,
  PARAMETRE_RETENUS,
  ROUTES_QUI_NE_SONT_PAS_DES_LISTES,
} from './comptes-proposes';

/**
 * LES COMPTES PROPOSÉS · une seule règle (retenus ou utilisés) pour toutes les
 * routes qui servent une liste de choix de comptes, et une seule liste de ces
 * routes, relue ici contre les contrôleurs et, côté écran, par
 * `client/src/lib/comptes-retenus-ecrans.spec.ts`.
 */

const SRC = join(__dirname, '..', '..');

function fichiers(dossier: string): string[] {
  return readdirSync(dossier, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? fichiers(join(dossier, e.name)) : [join(dossier, e.name)],
  );
}

/** Chaque route GET du serveur, avec le corps de son gestionnaire jusqu'au décorateur suivant. */
function routesGet(): { chemin: string; gestionnaire: string; fichier: string }[] {
  const routes: { chemin: string; gestionnaire: string; fichier: string }[] = [];
  for (const f of fichiers(SRC).filter((x) => x.endsWith('.controller.ts'))) {
    const src = readFileSync(f, 'utf8');
    const prefixe = /@Controller\(\s*'([^']*)'/.exec(src)?.[1] ?? '';
    const decorateurs = [...src.matchAll(/@(Get|Post|Put|Patch|Delete)\(\s*(?:'([^']*)')?\s*\)/g)];
    decorateurs.forEach((d, i) => {
      if (d[1] !== 'Get') return;
      const fin = i + 1 < decorateurs.length ? decorateurs[i + 1].index! : src.length;
      routes.push({
        chemin: '/' + [prefixe, d[2] ?? ''].filter(Boolean).join('/'),
        gestionnaire: src.slice(d.index!, fin),
        fichier: f,
      });
    });
  }
  return routes;
}

describe('comptes proposés · la règle', () => {
  const COMPTES = [
    { id: 'c521', numero: '52110000', estRetenu: false },
    { id: 'c601', numero: '60100000', estRetenu: false },
    { id: 'c411', numero: '41110000', estRetenu: true },
    { id: 'c622', numero: '62200000', estRetenu: false },
  ];
  // Le 521 porté par un journal, le 601 mouvementé · le 622 n'est rien.
  const REFERENCES: Record<string, Record<string, string>[]> = {
    journal: [{ compteTresorerieId: 'c521' }],
    ligneEcriture: [{ compteId: 'c601' }],
    // Un individuel rattaché à son collectif ne retient pas le collectif.
    compte: [{ collectifId: 'c622' }],
  };
  const appels: string[] = [];
  const prisma = new Proxy({} as Record<string, unknown>, {
    get(_c, nom: string) {
      return {
        findMany: async ({ where, select }: { where: Record<string, { in: string[] }>; select: Record<string, boolean> }) => {
          const champ = Object.keys(select)[0];
          appels.push(`${nom}.${champ}`);
          return (REFERENCES[nom] ?? []).filter((l) => l[champ] && where[champ].in.includes(l[champ]));
        },
      };
    },
  });

  it('rend les retenus et les utilisés, compte les écartés, garde l’ordre reçu', async () => {
    const r = await comptesProposes(prisma, 't1', COMPTES);
    expect(r.proposes.map((c) => c.numero)).toEqual(['52110000', '60100000', '41110000']);
    expect(r.ecartes).toBe(1);
  });

  it('le lien d’un individuel vers son collectif n’est pas un usage du collectif', async () => {
    appels.length = 0;
    await comptesProposes(prisma, 't1', COMPTES);
    expect(appels).not.toContain('compte.collectifId');
    expect(appels).toContain('ligneEcriture.compteId');
  });

  it('un compte retenu ne coûte aucune lecture', async () => {
    appels.length = 0;
    const r = await comptesProposes(prisma, 't1', [{ id: 'c411', numero: '41110000', estRetenu: true }]);
    expect(r.proposes).toHaveLength(1);
    expect(appels).toEqual([]);
  });
});

/** Le corps d'une méthode `nom(` d'un source, découpé par équilibrage des parenthèses puis des accolades. */
function corpsMethode(src: string, nom: string): string | null {
  const m = new RegExp(`\\n\\s*(?:(?:public|private|protected)\\s+)?(?:async\\s+)?${nom}\\s*(?:<[^>]*>)?\\(`).exec(src);
  if (!m) return null;
  let k = m.index + m[0].length - 1;
  for (let p = 0; k < src.length; k++) {
    if (src[k] === '(') p++;
    else if (src[k] === ')' && --p === 0) break;
  }
  const debut = src.indexOf('{', k);
  if (debut < 0) return null;
  let j = debut;
  for (let p = 0; j < src.length; j++) {
    if (src[j] === '{') p++;
    else if (src[j] === '}' && --p === 0) break;
  }
  return src.slice(debut, j + 1);
}

/** Les sources (hors specs) du dossier de module d'un contrôleur, sous-dossiers compris. */
function sourcesDuModule(controleur: string): string[] {
  const dossier = dirname(controleur);
  return fichiers(dossier).filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'));
}

/** La route appelle une méthode de service qui lit des comptes (`compte.findMany`). */
function routeLitDesComptes(r: { gestionnaire: string; fichier: string }): boolean {
  const methodes = [...r.gestionnaire.matchAll(/this\.\w+\.(\w+)\(/g)].map((x) => x[1]);
  const sources = sourcesDuModule(r.fichier).map((f) => readFileSync(f, 'utf8'));
  return methodes.some((nom) => sources.some((src) => /\.compte\.findMany\(/.test(corpsMethode(src, nom) ?? '')));
}

describe('comptes proposés · la liste des routes, source unique', () => {
  const routes = routesGet();

  it('chaque route nommée existe dans un contrôleur', () => {
    const chemins = new Set(routes.map((r) => r.chemin));
    for (const chemin of [...Object.keys(LISTES_DE_COMPTES), ...Object.keys(ROUTES_QUI_NE_SONT_PAS_DES_LISTES)]) {
      expect({ chemin, existe: chemins.has(chemin) }).toEqual({ chemin, existe: true });
    }
  });

  it('toute route GET qui nomme un compte ou une contrepartie est rangée · liste de choix ou motif écrit', () => {
    const rangees = new Set([...Object.keys(LISTES_DE_COMPTES), ...Object.keys(ROUTES_QUI_NE_SONT_PAS_DES_LISTES)]);
    const oubliees = routes.filter((r) => /compte|contrepartie/i.test(r.chemin) && !rangees.has(r.chemin)).map((r) => r.chemin);
    expect(oubliees).toEqual([]);
  });

  /*
    LE NOM D'UNE ROUTE NE SUFFIT PAS · une route de liste de comptes nommée
    autrement (« octrois », « fonds »…) échappait au test précédent, et côté
    écran à tout appel non typé. La détection STRUCTURELLE suit le
    gestionnaire jusqu'à la méthode du service qu'il appelle (même dossier de
    module) et retient toute route dont la méthode lit `compte.findMany` · une
    structure, jamais une distance (§ 10).
  */
  it('toute route GET dont le service lit des comptes est rangée, quel que soit son nom', () => {
    const rangees = new Set([...Object.keys(LISTES_DE_COMPTES), ...Object.keys(ROUTES_QUI_NE_SONT_PAS_DES_LISTES)]);
    const lisant = routes.filter((r) => routeLitDesComptes(r));
    // Le recensement trouve quelque chose · sinon le découpage aurait cassé.
    expect(lisant.length).toBeGreaterThan(10);
    expect(lisant.map((r) => r.chemin)).toEqual(expect.arrayContaining(['/comptes', '/immobilisations/subventions-rattachees/octrois']));
    expect(lisant.filter((r) => !rangees.has(r.chemin)).map((r) => r.chemin)).toEqual([]);
  });

  it('une route au régime « retenus » lit le paramètre et passe par la règle commune', () => {
    for (const [chemin, regime] of Object.entries(LISTES_DE_COMPTES)) {
      if (regime.regime !== 'retenus') continue;
      const route = routes.find((r) => r.chemin === chemin)!;
      expect({ chemin, lit: route.gestionnaire.includes(`@Query('${PARAMETRE_RETENUS}')`) }).toEqual({ chemin, lit: true });
    }
    // La règle n'est écrite qu'une fois · les services l'appellent, ils ne la recopient pas.
    const service = readFileSync(join(__dirname, '../immobilisations/immobilisation.service.ts'), 'utf8');
    expect(service.match(/comptesProposes\(this\.prisma/g)?.length).toBe(3);
    expect(service).not.toContain('identifiantsUtilises(');
    const compte = readFileSync(join(__dirname, 'compte.service.ts'), 'utf8');
    expect(compte).toContain('comptesUtilises(this.prisma');
    expect(compte).not.toContain('identifiantsUtilises(');
  });

  it('la table des routes est un module sans import · le spec de l’écran la charge sans Prisma', () => {
    const src = readFileSync(join(__dirname, 'listes-de-comptes.ts'), 'utf8');
    expect(src).not.toMatch(/^\s*import\s/m);
    expect(src).not.toMatch(/\brequire\(/);
    // L'écran la lit par son chemin, jamais une copie.
    const ecran = readFileSync(join(__dirname, '../../../client/src/lib/comptes-retenus-ecrans.spec.ts'), 'utf8');
    expect(ecran).toContain("from '../../../src/modules/comptes/listes-de-comptes'");
  });

  it('une liste fermée par un texte porte le texte qui la ferme', () => {
    for (const [chemin, regime] of Object.entries(LISTES_DE_COMPTES)) {
      if (regime.regime === 'texte') expect({ chemin, motif: regime.motif.length > 40 }).toEqual({ chemin, motif: true });
    }
  });
});

/** Doublure des immobilisations · le plan, les usages, et ce que le service demande. */
function serviceImmo(plan: Array<Record<string, unknown>>, references: Record<string, Record<string, string>[]>, jeu = 'PROJETS_DEVELOPPEMENT') {
  const prisma = new Proxy(
    {
      tenant: {
        findUniqueOrThrow: async () => ({ referentiel: 'SYCEBNL', systemeComptableSyscohada: null, jeuEtatsFinanciersSycebnl: jeu }),
        findUnique: async () => ({ referentiel: 'SYCEBNL' }),
      },
      compte: {
        findMany: async ({ where, select }: { where: Record<string, unknown>; select: Record<string, boolean> }) => {
          // Lecture des usages par `identifiantsUtilises` (lien collectif exclu, voir plus haut).
          if (where.collectifId) return [];
          if (where.typeCompte === 'TOTAL') return [];
          const racines = (where.OR as Array<{ numero: { startsWith: string } }> | undefined)?.map((o) => o.numero.startsWith);
          return plan
            .filter((c) => !('estActif' in where) || c.estActif === where.estActif)
            .filter((c) => !racines || racines.some((r) => String(c.numero).startsWith(r)))
            .map((c) =>
            Object.fromEntries(Object.keys(select).map((k) => [k, c[k]])),
          );
        },
        findFirst: async ({ where }: { where: { id: string } }) => plan.find((c) => c.id === where.id) ?? null,
      },
    } as Record<string, unknown>,
    {
      get(cible, nom: string) {
        if (nom in cible) return cible[nom];
        return {
          findMany: async ({ where, select }: { where: Record<string, { in: string[] }>; select: Record<string, boolean> }) => {
            const champ = Object.keys(select)[0];
            return (references[nom] ?? []).filter((l) => l[champ] && where[champ].in.includes(l[champ]));
          },
        };
      },
    },
  );
  return new ImmobilisationService(prisma as never, {} as never);
}

describe('comptes proposés · les listes des immobilisations', () => {
  it('fonds de fin de projet · le non retenu non utilisé est écarté, et la liste vide dit « retenez-le »', async () => {
    const plan = [
      { id: 'a', numero: '16200000', intitule: 'Bailleurs', estActif: true, estRetenu: false },
      { id: 'b', numero: '16300000', intitule: 'État', estActif: true, estRetenu: false },
    ];
    const tout = await serviceImmo(plan, {}).comptesFondsProjet('t1');
    expect(tout.comptes).toHaveLength(2);
    const choix = await serviceImmo(plan, {}).comptesFondsProjet('t1', true);
    expect(choix.comptes).toEqual([]);
    expect(choix.nonRetenus).toBe(2);
    expect(choix.motifVide).toContain('retenez');
    expect(choix.motifVide).toContain('Plan comptable');
    // Le 163 mouvementé reste proposé, seul · l'écran le présélectionne.
    const utilise = await serviceImmo(plan, { ligneEcriture: [{ compteId: 'b' }] }).comptesFondsProjet('t1', true);
    expect(utilise.comptes.map((c) => c.numero)).toEqual(['16300000']);
    expect(utilise.motifVide).toBeNull();
  });

  it('comptes du bien · seuls les retenus ou utilisés sont proposés, le 28 et le 68 se lisent dans tout le plan', async () => {
    const plan = [
      { id: 'v', numero: '24510000', intitule: 'Matériel de transport', estActif: true, estRetenu: true },
      { id: 'm', numero: '24410000', intitule: 'Mobilier', estActif: true, estRetenu: false },
      { id: 'a', numero: '28451000', intitule: 'Amortissements du matériel de transport', estActif: true, estRetenu: false },
      { id: 'd', numero: '68120000', intitule: 'Dotations', estActif: true, estRetenu: false },
    ];
    const choix = await serviceImmo(plan, {}).comptesDuBien('t1', true);
    expect(choix.map((c) => c.numero)).toEqual(['24510000']);
    // Le 28 du bien proposé vient du plan entier, même non retenu.
    expect(choix[0].compteAmortissement?.numero).toBe('28451000');
    const tout = await serviceImmo(plan, {}).comptesDuBien('t1');
    expect(tout.map((c) => c.numero).sort()).toEqual(['24410000', '24510000']);
  });

  it('contreparties d’une acquisition · la liste fermée de la fiche, puis la règle des comptes retenus', async () => {
    const plan = [
      { id: 'v', numero: '24510000', intitule: 'Matériel de transport', estActif: true, estRetenu: true },
      { id: 'q', numero: '52110000', intitule: 'Banque', estActif: true, estRetenu: false },
      { id: 'k', numero: '57100000', intitule: 'Caisse', estActif: true, estRetenu: true },
      { id: 'f', numero: '48120000', intitule: 'Fournisseurs d’investissements', estActif: true, estRetenu: false },
    ];
    const references = { journal: [{ compteTresorerieId: 'q' }] };
    const tout = await serviceImmo(plan, references).contrepartiesAcquisition('t1', { compteImmobilisationId: 'v' });
    const choix = await serviceImmo(plan, references).contrepartiesAcquisition('t1', { compteImmobilisationId: 'v' }, null, true);
    // Le 4812 admis par la fiche, ni retenu ni utilisé, sort de la liste de choix · il reste admis au serveur.
    expect(tout.map((c) => c.numero)).toContain('48120000');
    expect(choix.map((c) => c.numero)).not.toContain('48120000');
    expect(choix.map((c) => c.numero)).toEqual(expect.arrayContaining(['52110000', '57100000']));
    expect(choix.every((c) => !('estRetenu' in c))).toBe(true);
  });
});
