import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MODELES_SIMPLES_SYCEBNL, MODELES_SIMPLES_SYSCOHADA } from './modeles-saisie';

// Pas d'import de « vitest » · convention du dépôt, describe/it/expect par les
// globales, pour que le fichier tourne sous les deux lanceurs.

/**
 * UN MODÈLE DE SAISIE CITE DES NUMÉROS DE COMPTES · et un numéro faux n'y
 * casse rien. Il insère une écriture équilibrée, enregistrable, et fausse.
 *
 * Le même jeu de modèles était servi aux deux référentiels. Pour un dossier
 * d'entreprise, cela donnait deux dégâts muets :
 *
 *  · le 70410000 existe au plan SYSCOHADA, mais c'est « Ventes de produits
 *    résiduels ». Le modèle « Don reçu en numéraire » y insérait une VENTE
 *    DE DÉCHETS ;
 *  · 70100000, 60500000 et 66100000 n'y existent pas du tout · 701, 605 et
 *    661 y sont semés en TOTAL, donc non imputables.
 *
 * Ce test lit les DEUX semis et vérifie que chaque modèle vise un compte qui
 * existe dans SON plan. La convention §7 de CLAUDE.md le rend décidable sans
 * exécuter le semis : un compte d'imputation est complété à droite par des
 * zéros jusqu'à huit chiffres, un compte Total ne l'est jamais. Trouver le
 * numéro à huit chiffres dans le fichier, c'est donc trouver une feuille.
 */
const racine = join(__dirname, '..', '..', '..');
const semis = {
  SYCEBNL: readFileSync(join(racine, 'src/modules/comptes/compte-seed.ts'), 'utf8'),
  SYSCOHADA: readFileSync(join(racine, 'src/modules/comptes/compte-seed-syscohada.ts'), 'utf8'),
};

const semePar = (plan: keyof typeof semis, numero: string) => semis[plan].includes(`'${numero}'`);

describe('modèles de saisie · chaque modèle vise un compte de SON plan', () => {
  it.each([
    ['SYCEBNL', MODELES_SIMPLES_SYCEBNL],
    ['SYSCOHADA', MODELES_SIMPLES_SYSCOHADA],
  ] as const)('les comptes des modèles %s sont tous semés en Détail', (plan, modeles) => {
    const absents = modeles.filter((m) => !semePar(plan, m.numeroContrepartie));
    expect(absents.map((m) => `${m.code} → ${m.numeroContrepartie}`)).toEqual([]);
  });

  it('LE DÉFAUT D’ORIGINE · trois des quatre modèles SYCEBNL ne trouvent aucun compte au plan SYSCOHADA', () => {
    const perdus = MODELES_SIMPLES_SYCEBNL.filter((m) => !semePar('SYSCOHADA', m.numeroContrepartie));
    // Ce test fige la RAISON du cloisonnement. S'il tombait à zéro un jour,
    // c'est que les deux plans auraient convergé · ce qui n'arrivera pas, et
    // que le cloisonnement serait devenu inutile · ce qu'il faudrait alors
    // constater plutôt que deviner.
    expect(perdus.map((m) => m.code).sort()).toEqual(['achat', 'cotisation', 'salaire']);
  });

  it('le quatrième est PIRE · le 70410000 existe en SYSCOHADA, mais ce n’est pas un don', () => {
    const don = MODELES_SIMPLES_SYCEBNL.find((m) => m.code === 'don')!;
    expect(semePar('SYSCOHADA', don.numeroContrepartie)).toBe(true);
    // 7041 « Ventes de produits résiduels dans la Région ». Un compte qui
    // existe est plus dangereux qu'un compte absent : l'écriture passe.
    expect(semis.SYSCOHADA).toContain('Ventes de produits résiduels');
  });

  it('aucun modèle SYSCOHADA ne reprend un compte du jeu SYCEBNL', () => {
    const numerosSycebnl = new Set(MODELES_SIMPLES_SYCEBNL.map((m) => m.numeroContrepartie));
    expect(MODELES_SIMPLES_SYSCOHADA.filter((m) => numerosSycebnl.has(m.numeroContrepartie))).toEqual([]);
  });

  it('les quatre modèles de chaque jeu ont un code unique et un sens', () => {
    for (const modeles of [MODELES_SIMPLES_SYCEBNL, MODELES_SIMPLES_SYSCOHADA]) {
      expect(new Set(modeles.map((m) => m.code)).size).toBe(modeles.length);
      expect(modeles.every((m) => m.sens === 'recette' || m.sens === 'depense')).toBe(true);
      expect(modeles.every((m) => m.libelle.trim().length > 0)).toBe(true);
    }
  });
});
