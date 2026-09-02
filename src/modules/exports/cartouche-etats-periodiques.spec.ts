import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * L'IDENTIFICATION D'UN ÉTAT SE PORTE AU PIED DE PAGE, PAS DANS LA GRILLE.
 *
 * Ce spec a d'abord exigé l'inverse : une coiffe de trois lignes posée
 * au-dessus du tableau du journal, du grand livre et de la balance. Elle
 * satisfaisait l'AUDCIF art. 22, 7° · « les états périodiques fournis soient
 * numérotés et datés » · mais elle n'existe dans aucun des classeurs de
 * cabinet relevés : les leurs commencent en A1 par l'en-tête des colonnes.
 * Une coiffe décale la grille, casse un tri collé depuis un autre classeur, et
 * force un `spliceRows` que rien d'autre ne justifie.
 *
 * Le pied de page imprimé porte la même information sans ajouter de cellule.
 * Ce que ce spec verrouille désormais, c'est les DEUX sens : que l'obligation
 * légale soit toujours servie, et qu'elle ne redescende pas dans la grille.
 */

const service = readFileSync(join(__dirname, 'export.service.ts'), 'utf8');

describe('exports périodiques · identification de l’état', () => {
  it('porte l’identification en pied de page sur les trois livres obligatoires', () => {
    for (const identite of ['identiteJournal', 'identiteGrandLivre', 'identiteBalance']) {
      expect(service).toContain(`this.piedDePageEtat(feuille, ${identite});`);
    }
    // Chaque pose passe une identité résolue par `identiteEtat`, jamais un
    // littéral bricolé sur place · une nouvelle feuille exportable doit être
    // identifiée de la même façon que les trois autres. Le compte n'est pas
    // figé à trois : d'autres états s'ajoutent (la balance auxiliaire l'a
    // fait), mais aucun ne doit se poser sans identité.
    const poses = service.match(/this\.piedDePageEtat\(feuille, (\w+)\)/g) ?? [];
    expect(poses.length).toBeGreaterThanOrEqual(3);
    for (const pose of poses) expect(pose).toMatch(/identite/i);
  });

  it('ne remet aucune coiffe dans la grille du journal, du grand livre ni de la balance', () => {
    // La régression à craindre n'est pas l'absence de la coiffe · c'est son
    // retour « pour faire propre ». Le tableau commence en ligne 1.
    expect(service).not.toContain('coifferEtat');
    expect(service).not.toContain('feuille.spliceRows(1, 0, [], [], []);');
    expect(service).not.toContain('derniereLigneDonnees + 3, entete');
  });

  it('porte les cinq mentions que l’AUDCIF art. 22, 7° et le Titre IX demandent', () => {
    // Dénomination, NIF, période, unité monétaire, date d'édition · plus la
    // numérotation de page, le tout en pied de page imprimé.
    expect(service).toContain('identite.entite');
    expect(service).toContain('NIF ${identite.nif}');
    expect(service).toContain('identite.periode');
    expect(service).toContain('montants en ${identite.devise}');
    expect(service).toContain('édité le ${edite}');
    expect(service).toContain('Page &P / &N');
  });

  it('n’exige pas d’exercice · le journal et le grand livre s’exportent sans', () => {
    // `identiteLiasse` lève si l'exercice n'existe pas (findFirstOrThrow) ; un
    // export filtré par dates libres n'en a pas, et ne doit pas échouer pour
    // autant. D'où une variante qui se contente du dossier.
    expect(service).toContain('private async identiteEtat(');
    expect(service).toContain("'Toutes périodes'");
    // Le tenant, lui, existe toujours : findUniqueOrThrow est légitime.
    expect(service).toContain('this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } })');
  });

  it('ne prétend plus que chaque feuille est strictement SYCEBNL', () => {
    // Journal, grand livre et balance sont les livres obligatoires de l'AUDCIF
    // art. 19, communs aux deux référentiels et servis aux deux.
    expect(service).not.toContain('Chaque feuille reste strictement SYCEBNL');
    expect(service).toContain("livres obligatoires de\n * l'AUDCIF art. 19");
    // La règle « sans blanc ni altération » est celle de l'art. 20, que le
    // SYCEBNL reprend · l'ordre de citation compte pour un dossier SYSCOHADA.
    expect(service).toContain('AUDCIF art. 20, repris par le SYCEBNL');
  });
});
