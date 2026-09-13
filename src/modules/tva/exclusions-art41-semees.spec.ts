import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * CE QU'ON AFFIRME DU PLAN SE VÉRIFIE CONTRE LE PLAN.
 *
 * Le module TVA portait en commentaire, et un spec gelait, l'affirmation
 * suivante : « SYSCOHADA SEUL. Le plan SYCEBNL n'a ni 6383 ni 6384 ni 6181 :
 * ses charges externes sont agrégées en 61800000 et 63800000. » Elle était
 * FAUSSE. Le semis SYCEBNL ouvre en propre les quatre comptes, sous les mêmes
 * intitulés que le SYSCOHADA, et les renvois de ligne donnés à l'appui ne
 * portaient rien de tel.
 *
 * Le coût était double, et le second est le pire : un dossier SYCEBNL
 * assujetti déduisait 100 % de la TVA sur ses réceptions, ses missions et ses
 * voyages, ET la déclaration lui donnait une RAISON FAUSSE de ne pas regarder.
 *
 * Ce spec n'est donc pas un test du calcul (voir `tva-exclusions-art41.spec.ts`
 * pour cela) : c'est le test qui aurait attrapé l'affirmation. Il relit les
 * DEUX fichiers de semis et exige que chaque racine des deux tables y soit
 * ouverte sous un intitulé qui reprend les mots de l'article, ou qu'elle n'y
 * soit pas du tout · auquel cas le préfixe ne rencontre rien et rien n'est
 * exclu à tort.
 */

const service = readFileSync(join(__dirname, 'taux-tva.service.ts'), 'utf8');
const seedSycebnl = readFileSync(join(__dirname, '..', 'comptes', 'compte-seed.ts'), 'utf8');
const seedSyscohada = readFileSync(join(__dirname, '..', 'comptes', 'compte-seed-syscohada.ts'), 'utf8');

/**
 * Les quatre comptes que les tables reconnaissent, avec le mot de l'article
 * que leur intitulé doit reprendre. Le cinquième, 6276 « Cadeaux à la
 * clientèle », n'existe qu'au semis SYSCOHADA : il est traité à part, parce
 * que c'est le cas « absent d'un plan » qui doit rester sans effet.
 */
const RECONNUS: ReadonlyArray<readonly [string, string, string]> = [
  ['63830000', 'Réceptions', 'art. 41, 1° · « dépenses de […] réception »'],
  ['63840000', 'Missions', 'art. 41, 1° · logement, hébergement, restauration en déplacement'],
  ['61810000', 'Voyages et déplacements', 'art. 41, 1° · transport de personnes et hébergement'],
  ['61400000', 'Transports du personnel', 'art. 42, 2° · sauf contrat permanent'],
  ['60420000', 'Matières combustibles', 'art. 41, 3°, 3° bis et 3° ter · produits pétroliers'],
];

describe('les comptes que l’article 41 fait reconnaître sont bien semés, aux DEUX plans', () => {
  for (const [numero, intitule, article] of RECONNUS) {
    it(`${numero} « ${intitule} » est semé au SYSCOHADA et au SYCEBNL · ${article}`, () => {
      expect(seedSyscohada).toContain(`'${numero}', '${intitule}'`);
      expect(seedSycebnl).toContain(`'${numero}', '${intitule}'`);
    });
  }

  it('le 62760000 « Cadeaux à la clientèle » n’est semé QU’au SYSCOHADA, et cela reste sans effet', () => {
    // C'est le cas qui justifie de ne plus lire le référentiel : une racine
    // qui ne rencontre aucun compte du plan ne déclenche rien. Si le semis
    // SYCEBNL l'ouvrait un jour sous le même intitulé, la règle s'y
    // appliquerait d'elle-même, ce qui est le comportement voulu.
    expect(seedSyscohada).toContain("'62760000', 'Cadeaux à la clientèle'");
    expect(seedSycebnl).not.toContain("'62760000'");
  });

  it('le service ne referme plus l’article 41 sur le seul SYSCOHADA', () => {
    // La méthode `partExclueArt41` ne prend plus de référentiel en paramètre ·
    // c'est le NUMÉRO SEMÉ qui décide.
    expect(service).toContain('LES DEUX RÉFÉRENTIELS');
    // La phrase « SYSCOHADA SEUL » subsiste, mais CITÉE, dans le paragraphe
    // qui la corrige · c'est voulu, et c'est ce que la ligne suivante exige.
    expect(service).toContain("portait\n * « SYSCOHADA SEUL");
    expect(service).toMatch(/private partExclueArt41\(\s*lignesCharge:/);
  });

  it('l’affirmation qui était fausse est écrite comme telle, avec les lignes du semis', () => {
    // La doctrine du dépôt veut qu'une correction porte la trace de ce
    // qu'elle corrige · sans quoi la même phrase revient au commentaire
    // suivant.
    expect(service).toContain("C'ÉTAIT FAUX");
    expect(service).toContain('61810000');
    expect(service).toContain('63830000');
    expect(service).toContain('63840000');
  });
});
