import { NATURES_RETENUES } from './correspondance-retenues';

/**
 * LES CODES D'IMPRIMÉ DE LA DGI · ce qu'on demande au guichet.
 *
 * Un code d'imprimé n'est pas décoratif : le comptable qui va déposer demande
 * le formulaire par son code, et l'imprimé porte ses cases dans un ordre que le
 * logiciel n'a pas à deviner. Mais c'est aussi la donnée la plus facile à
 * inventer · elle « ressemble » à quelque chose de plausible, et un code faux
 * envoie chercher un papier qui n'existe pas.
 *
 * D'où la règle que ce spec fait tenir : un code n'est renseigné QUE d'après un
 * imprimé réellement lu, et il suit la forme des imprimés de la Direction
 * générale des impôts (majuscules et chiffres). Les autres natures n'en portent
 * aucun · une absence assumée vaut mieux qu'une invention.
 */
describe('Codes d’imprimé DGI', () => {
  it('ne sont posés que là où l’imprimé a été lu', () => {
    const avecImprime = NATURES_RETENUES.filter((n) => n.imprime).map((n) => n.cle);
    // La retenue IRPP sur salaires · imprimé IRPPDR1, « Déclaration de la
    // retenue de l'impôt sur le revenu des personnes physiques dans la
    // catégorie de revenus salariaux et revenus assimilés », Ministère des
    // Finances. C'est le seul imprimé du lot qui corresponde à une nature de
    // retenue du registre : les IRPPD2 et IRPPD3 sont des déclarations
    // d'impôt de personnes physiques, pas des reversements de retenues.
    expect(avecImprime).toEqual(['irppSalaires']);
  });

  it('suivent la forme des codes DGI · majuscules et chiffres, rien d’autre', () => {
    for (const n of NATURES_RETENUES) {
      if (!n.imprime) continue;
      expect(n.imprime).toMatch(/^[A-Z0-9]{4,12}$/);
    }
  });
});
