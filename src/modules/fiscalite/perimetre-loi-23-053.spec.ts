import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { avertissementRegimeImpot } from '../retenues/correspondance-retenues';

/**
 * CE QUE LA PASSE F4a A CORRIGÉ · loi n° 23/053 du 30 novembre 2023, Titre 2.
 *
 * 1 · L'ARTICLE 5 NE DISCRIMINE PAS PAR RÉFÉRENTIEL, MAIS PAR QUALITÉ DE LA
 * PERSONNE. `avertissementRegimeImpot` ne lisait que le référentiel et
 * affirmait à TOUT dossier SYSCOHADA « La société est redevable de l'impôt sur
 * les sociétés (art. 3) », avec l'échéance du 30 avril et ses trois acomptes.
 * Or un établissement public (art. 5, 1°) et une coopérative agricole de forme
 * civile (art. 5, 2°) sont tenus en SYSCOHADA. Cinquième piège du dépôt dans sa
 * forme exacte · une garde posée pour une lecture qui s'était déplacée depuis,
 * et la donnée manquait si peu que le service chargeait déjà la forme juridique
 * dans la même requête.
 *
 * 2 · L'EXEMPTION DISPENSE DE LA DÉCLARATION ET DU PAIEMENT. Titre Ier,
 * art. 2, 10° : « Exemption : la dispense d'une obligation fiscale de
 * déclaration ET de paiement », contre le 11° : « Exonération : la dispense
 * totale ou partielle de paiement ». Le texte servi à une ASBL disait qu'elle
 * « ne dispense pas non plus de DÉCLARER », vrai des impôts retenus pour autrui
 * et faux de l'impôt sur les sociétés lui-même.
 *
 * 3 · LES DEUX BORNES QUE LE MODULE FRANCHISSAIT SANS LES NOMMER · l'entrée en
 * vigueur au 1er janvier 2026 et la territorialité de l'art. 7.
 */

describe('Article 5 · l’avertissement lit la FORME JURIDIQUE, plus seulement le référentiel', () => {
  it('une ENTITÉ PUBLIQUE n’est plus déclarée redevable de plein droit', () => {
    const t = avertissementRegimeImpot('SYSCOHADA' as never, 'ENTITE_PUBLIQUE' as never);
    expect(t).not.toContain("La société est redevable de l'impôt sur les sociétés");
    expect(t).toContain('ENTITÉ PUBLIQUE');
    expect(t).toContain('article 5, 1°');
    // La condition de ressources ne vise que la dernière catégorie, et
    // l'exploitation lucrative reste imposable · l'écran pose la question.
    expect(t).toContain('subventions budgétaires');
    expect(t).toContain('exploitation lucrative');
    expect(t).toContain('ne tranche donc pas');
  });

  it('une SOCIÉTÉ COOPÉRATIVE porte ses deux conditions cumulatives', () => {
    const t = avertissementRegimeImpot('SYSCOHADA' as never, 'SOCIETE_COOPERATIVE' as never);
    expect(t).not.toContain("La société est redevable de l'impôt sur les sociétés");
    expect(t).toContain('FORME CIVILE');
    expect(t).toContain('cumulatives');
    // Piège n° 1 · « coopérative » ne vaut pas la même chose à l'Acte uniforme
    // et à l'article 5, 2°.
    expect(t).toContain("sens de l'Acte uniforme");
  });

  it('une SARL reste redevable, avec son échéance et ses acomptes', () => {
    const t = avertissementRegimeImpot('SYSCOHADA' as never, 'SOCIETE_RESPONSABILITE_LIMITEE' as never);
    expect(t).toContain("La société est redevable de l'impôt sur les sociétés");
    expect(t).toContain('30 avril');
    expect(t).toContain('25 juillet');
  });

  it('un dossier dont la forme n’est pas renseignée garde le droit commun', () => {
    // Le repli ne doit pas devenir une exemption silencieuse.
    const t = avertissementRegimeImpot('SYSCOHADA' as never, null);
    expect(t).toContain("La société est redevable de l'impôt sur les sociétés");
  });

  it('dans TOUS les cas, le rappel sur les impôts retenus pour autrui subsiste', () => {
    for (const forme of ['ENTITE_PUBLIQUE', 'SOCIETE_COOPERATIVE', 'SOCIETE_ANONYME', null]) {
      const t = avertissementRegimeImpot('SYSCOHADA' as never, forme as never);
      expect(t).toContain("retenu pour le compte d'autrui");
      expect(t).toContain('cotisation sociale');
    }
  });
});

describe('Titre Ier, art. 2 · l’exemption dispense de la DÉCLARATION comme du PAIEMENT', () => {
  it('l’avertissement SYCEBNL ne dit plus qu’une ASBL exemptée doit déclarer son IS', () => {
    const t = avertissementRegimeImpot('SYCEBNL' as never, null);
    expect(t).toContain('DÉCLARATION ET DE PAIEMENT');
    expect(t).toContain('art. 5');
    // Et la distinction avec l'exonération du 11° est écrite, sans quoi le
    // lecteur range les deux ensemble.
    expect(t).toContain('EXONÉRATION');
    expect(t).toContain('que du paiement');
  });
});

/*
  LA FONCTION PURE PEUT ÊTRE JUSTE ET LE SERVICE NE PAS L'APPELER AINSI.

  Leçon de la passe F2a, reprise en F3a : tout ce qui précède teste
  `avertissementRegimeImpot` en lui passant la forme juridique à la main. Il
  suffirait que `retenues.service.ts` l'oublie pour que la correction ne se
  déclenche JAMAIS en production · la forme est optionnelle et vaut `null` par
  défaut, donc le droit commun reviendrait en silence, sans qu'aucun test
  ci-dessus ne bronche.

  Ce spec lit donc le service lui-même.
*/
describe('le service passe bien la forme juridique à l’avertissement', () => {
  const service = readFileSync(join(__dirname, '..', 'retenues', 'retenues.service.ts'), 'utf8');

  it('la requête du dossier ramène la forme juridique', () => {
    expect(service).toContain('formeJuridiqueSyscohada: true');
  });

  it('l’appel la transmet · sans quoi le droit commun reviendrait en silence', () => {
    expect(service).toContain('avertissementRegimeImpot(referentiel, formeJuridiqueSyscohada)');
  });
});
