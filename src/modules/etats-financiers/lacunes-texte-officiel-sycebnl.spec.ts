import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// Les deux jeux exportent les MÊMES noms (`POSTES_ACTIF`, `POSTES_PASSIF`) ·
// les aliaser ici est ce qui rend le test lisible et empêche de comparer sans
// s'en apercevoir le bilan des projets à celui des associations.
import { POSTES_PASSIF as POSTES_PASSIF_PROJET } from './correspondance-projet-bilan';
import { POSTES_REVENUS, POSTES_CHARGES } from './correspondance-projet-compte-exploitation';
import { POSTES_ACTIF as POSTES_ACTIF_ASSO, POSTES_PASSIF as POSTES_PASSIF_ASSO } from './correspondance-bilan';

const POSTES_COMPTE_EXPLOITATION_PROJET = [...POSTES_REVENUS, ...POSTES_CHARGES];

/**
 * LES LACUNES DU TEXTE OFFICIEL SYCEBNL, NOMMÉES ET GARDÉES.
 *
 * Le plan de construction annonçait « quatre comptes semés que le SYCEBNL ne
 * capte nulle part », présentés comme un défaut de nos tables. Confrontation
 * faite aux tableaux de correspondance officiels (Partie 4, ch. 2 et 3) : le
 * constat était faux sur le premier et mal attribué sur les autres.
 *
 *  - Le compte 46 N'EST PAS un orphelin. Le texte le réserve aux PROJETS de
 *    développement (« les fonds que les bailleurs de fonds du projet de
 *    développement et assimilés affectent aux charges de fonctionnement »,
 *    Partie 2 ch. 3 COMPTE 46), et le tableau de correspondance des projets
 *    lui donne le poste DF « Fonds d'administration ». Notre table le porte.
 *    Son absence du bilan des ASSOCIATIONS est donc correcte, pas un trou.
 *
 *  - Les autres sont de vraies lacunes, mais DU RÉFÉRENTIEL, pas de notre
 *    transcription : le tableau officiel ne leur donne aucun poste. Les
 *    combler serait interpréter, ce que le §1 du CLAUDE.md interdit.
 *
 * Ce spec existe pour deux raisons. La première : empêcher qu'un futur
 * « nettoyage des orphelins » rattache ces comptes d'office, ce qui ferait
 * disparaître dans un poste voisin un montant que le référentiel ne sait pas
 * classer. La seconde : si l'OHADA publie une correction, ce fichier dit
 * exactement où regarder.
 */

const projetCE = readFileSync(join(__dirname, 'correspondance-projet-compte-exploitation.ts'), 'utf8');
const projetBilan = readFileSync(join(__dirname, 'correspondance-projet-bilan.ts'), 'utf8');

/** Tous les préfixes de comptes qu'un jeu de postes réclame. */
function prefixesCaptes(postes: Array<{ comptes?: string[]; comptesAmortissement?: string[] }>): string[] {
  return postes.flatMap((p) => [...(p.comptes ?? []), ...(p.comptesAmortissement ?? [])]);
}

describe('SYCEBNL · le compte 46 n’est pas un orphelin', () => {
  it('est rattaché au poste DF du bilan des PROJETS, comme le veut le texte', () => {
    const df = POSTES_PASSIF_PROJET.find((p) => p.ref === 'DF');
    expect(df).toBeDefined();
    expect(df!.libelle).toBe("Fonds d'administration");
    expect(df!.comptes).toContain('46');
  });

  it('est absent du bilan des ASSOCIATIONS, et c’est correct', () => {
    // Le texte le réserve aux projets · l'ajouter au jeu associations
    // inventerait une ressource que ce type d'entité n'a pas.
    const capte = prefixesCaptes([...POSTES_ACTIF_ASSO, ...POSTES_PASSIF_ASSO]);
    expect(capte).not.toContain('46');
  });
});

describe('SYCEBNL · lacunes du texte officiel, non comblées et signalées', () => {
  it('le compte 68 n’est rattaché à aucun poste du compte d’exploitation projets', () => {
    // Le tableau officiel ne cite QUE le 69 sous « Dotations aux provisions ».
    // Le rattacher d'office inventerait un poste.
    expect(prefixesCaptes(POSTES_COMPTE_EXPLOITATION_PROJET)).not.toContain('68');
    expect(projetCE).toContain('Compte 68 (Dotations aux amortissements) absent de tout poste');
    expect(projetCE).toContain('[texte officiel]');
  });

  it('six subdivisions du compte 70 ne sont réclamées par aucun poste', () => {
    // Le tableau n'en cite que trois : 702 en RA, 705 en RC, 707 en RD.
    const capte = prefixesCaptes(POSTES_COMPTE_EXPLOITATION_PROJET);
    for (const present of ['702', '705', '707']) expect(capte).toContain(present);
    for (const absent of ['701', '703', '704', '706', '708']) expect(capte).not.toContain(absent);
    // Et le compte 70 entier n'est pas non plus capté par un préfixe court,
    // qui les absorberait toutes en silence.
    expect(capte).not.toContain('70');
    expect(projetCE).toContain('Six subdivisions du compte 70 absentes de tout poste');
  });

  it('les comptes 499 et 599 ne sont réclamés par aucun poste du bilan projets', () => {
    // Conséquence de l'anomalie DI = « 20 » du texte officiel, déjà documentée.
    expect(prefixesCaptes(POSTES_PASSIF_PROJET)).not.toContain('499');
    expect(prefixesCaptes(POSTES_PASSIF_PROJET)).not.toContain('599');
    expect(projetBilan).toContain('les comptes 499/599 ne');
  });

  it('le poste DI du bilan projets porte bien « 20 », transcrit tel quel', () => {
    // Un ACTIF de classe 2 sous un poste de PASSIF · très probablement une
    // corruption de scan de 499/599. Corrigé, ce serait une interprétation ;
    // transcrit, un solde sur 20 fait ressortir DI en négatif, donc visible.
    const di = POSTES_PASSIF_PROJET.find((p) => p.ref === 'DI');
    expect(di!.comptes).toEqual(['20']);
    expect(projetBilan).toContain('corruption de scan');
  });

  it('chaque lacune est signalée dans le fichier, jamais corrigée en silence', () => {
    // CLAUDE.md §9 : toute anomalie du texte officiel est signalée sur place.
    for (const fichier of [projetCE, projetBilan]) {
      expect(fichier).toContain('[texte officiel]');
      expect(fichier).toMatch(/comptes non rattachés/i);
    }
  });
});
