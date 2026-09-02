import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * UN CLASSEUR DÉPOSÉ CHEZ UN AUDITEUR DOIT DIRE D'OÙ IL VIENT.
 *
 * « balance-2026.xlsx » ne portait ni dénomination, ni NIF, ni période, ni
 * unité monétaire, ni date d'édition. L'AUDCIF art. 22, 7° veut que « les
 * états périodiques fournis soient numérotés et datés », et le Titre IX porte
 * le nom de l'entité, la période et l'unité monétaire sur chaque page.
 *
 * Ce spec lit le service plutôt que le classeur produit : ce qu'on vérifie est
 * qu'aucun des trois états communs ne repart sans son identification, et que
 * le décalage de trois lignes est bien répercuté sur le figeage et le filtre ·
 * une coiffe posée sans décaler l'en-tête casserait la grille en silence.
 */

const service = readFileSync(join(__dirname, 'export.service.ts'), 'utf8');

describe('exports périodiques · identification de l’état', () => {
  it('coiffe le journal, le grand livre complet et la balance', () => {
    for (const titre of ['JOURNAL', 'GRAND LIVRE', 'BALANCE GÉNÉRALE']) {
      expect(`${titre}: ${service.includes(`this.coifferEtat(feuille, identite`)}`).toContain('true');
      expect(service).toContain(`'${titre}'`);
    }
    expect((service.match(/this\.coifferEtat\(/g) ?? []).length).toBe(3);
  });

  it('décale l’en-tête du tableau du même nombre de lignes que la coiffe', () => {
    // La coiffe insère trois lignes ; l'en-tête passe donc en ligne 4, et la
    // dernière ligne de données glisse d'autant. Sans ce report, le figeage
    // resterait sur la ligne 1 et l'autofiltre couvrirait le titre.
    expect(service).toContain('feuille.spliceRows(1, 0, [], [], []);');
    expect(service).toContain('return 4;');
    expect((service.match(/derniereLigneDonnees \+ 3, entete/g) ?? []).length).toBe(3);
  });

  it('porte les cinq mentions que l’AUDCIF art. 22, 7° et le Titre IX demandent', () => {
    // Dénomination, NIF, période, unité monétaire, date d'édition · plus la
    // numérotation de page, en pied de page imprimé.
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
