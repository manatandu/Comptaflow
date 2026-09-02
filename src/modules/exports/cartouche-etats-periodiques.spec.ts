import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * UN ÉTAT S'IDENTIFIE DEUX FOIS · en tête de grille et au pied de page.
 *
 * L'histoire de ce spec vaut d'être écrite, parce qu'elle s'est retournée deux
 * fois. Il a d'abord exigé une coiffe de trois lignes au-dessus du tableau.
 * Puis il l'a interdite, au motif que les classeurs du dossier de révision
 * ouvert sur le Drive commencent en A1 par l'en-tête des colonnes. C'était
 * généraliser une observation en règle : le cabinet travaille sur SES fichiers,
 * qu'il sait nommer et qu'il ne confond pas ; un état sorti d'un logiciel et
 * envoyé à un tiers doit se nommer lui-même. Le propriétaire a tranché · la
 * coiffe revient PARTOUT.
 *
 * Ce que le spec garde désormais, c'est les deux portes ensemble. Le pied de
 * page imprimé sert l'AUDCIF art. 22, 7° (« les états périodiques fournis
 * soient numérotés et datés ») sans consommer de cellule. La coiffe porte
 * l'identification que le pied ne peut pas tenir à l'écran. Aucun état
 * exportable ne doit sortir sans les deux.
 *
 * Le piège technique, lui, ne dépend d'aucune décision de présentation : la
 * coiffe insère trois lignes en tête, donc la ligne d'en-têtes DESCEND. Un
 * `finaliserTableau` resté sur la ligne 1 figerait le titre au lieu des
 * en-têtes et poserait l'autofiltre sur une ligne fusionnée · l'état
 * s'ouvrirait sans erreur, et se trierait faux.
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

  it('coiffe TOUS les états périodiques, sans exception', () => {
    // Onze états exportables aujourd'hui. Le compte n'est pas figé · ce qui
    // l'est, c'est qu'aucun n'échappe à la coiffe.
    const coiffes = service.match(/this\.coifferEtat\(/g) ?? [];
    expect(coiffes.length).toBeGreaterThanOrEqual(9);
    for (const titre of [
      "'JOURNAL'",
      "'GRAND LIVRE'",
      "'BALANCE GÉNÉRALE'",
      'BALANCE AUXILIAIRE',
      "'BALANCE ÂGÉE'",
      'JUSTIFICATIF DE SOLDE',
      "'ÉVOLUTION DES SOLDES'",
      'TABLEAU DES IMMOBILISATIONS',
      "'TABLEAU DES AMORTISSEMENTS'",
    ]) {
      expect(service).toContain(titre);
    }
  });

  it('décale la ligne d’en-têtes de trois, partout où la coiffe est posée', () => {
    // C'est LE défaut silencieux de cette mécanique. `spliceRows` pousse le
    // tableau de trois lignes : un `finaliserTableau` laissé sur la ligne 1
    // figerait le titre au lieu des en-têtes et poserait l'autofiltre sur une
    // cellule fusionnée. Le fichier s'ouvre sans erreur et se trie faux.
    //
    // Chaque appel à `coifferEtat` doit donc être suivi d'un
    // `finaliserTableau` qui reçoit `+ 3` ET la ligne d'en-tête rendue.
    const finalisations = service.match(/this\.finaliserTableau\([^;]*?entete\w*\)/gs) ?? [];
    const coiffes = service.match(/this\.coifferEtat\(/g) ?? [];
    expect(finalisations.length).toBe(coiffes.length);
    for (const f of finalisations) expect(f).toContain('+ 3');
  });

  it('rend la ligne d’en-tête d’AVANT la coiffe, pas une constante', () => {
    // Un état qui porte sa propre ligne au-dessus du tableau (l'horodatage de
    // la balance auxiliaire, les âges de la balance âgée) n'a pas ses en-têtes
    // en ligne 1. Renvoyer 4 en dur les figerait au mauvais endroit.
    expect(service).toContain('ligneEnteteAvant = 1');
    expect(service).toContain('return ligneEnteteAvant + 3;');
  });

  it('porte les cinq mentions que l’AUDCIF art. 22, 7° et le Titre IX demandent', () => {
    // Dénomination, NIF, période, unité monétaire, date d'édition · plus la
    // numérotation de page. La coiffe les porte à l'écran, le pied de page à
    // l'impression : les deux lisent la MÊME identité résolue.
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
