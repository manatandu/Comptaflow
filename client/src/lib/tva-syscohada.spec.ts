import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compteTvaCollectee, compteTvaPourContrepartie, compteTvaRecuperable } from './tva-syscohada';

/**
 * LE PLAN SYSCOHADA SUBDIVISE 443 ET 445, LE PLAN SYCEBNL NON.
 *
 * Le semis rattache un seul compte de collecte et un seul compte de déduction
 * à chaque taux, et la modale d'achat ou de vente avec TVA les imputait tels
 * quels : sur un dossier SYSCOHADA, une prestation vendue collectait en 4431
 * « TVA facturée sur VENTES » au lieu du 4432, et un service extérieur
 * déduisait en 4452 « sur ACHATS » au lieu du 4454. Rien ne cassait · la TVA
 * était au bon montant, dans le mauvais compte, et la ventilation de la
 * déclaration en souffrait.
 */

const lire = (p: string) => readFileSync(join(__dirname, p), 'utf8');
const PLAN = new Set(['44310000', '44320000', '44330000', '44510000', '44520000', '44530000', '44540000']);

describe('TVA SYSCOHADA · le compte suit la nature de l’opération', () => {
  it('ventile la TVA collectée sur les subdivisions du compte 443', () => {
    // 701 ventes de marchandises, 702 produits finis, 703 produits
    // intermédiaires, 704 produits résiduels, 707 produits accessoires.
    for (const produit of ['70110000', '70210000', '70310000', '70410000', '70710000']) {
      expect(`${produit} → ${compteTvaCollectee(produit)}`).toBe(`${produit} → 44310000`);
    }
    // 706 services vendus → 4432 « TVA facturée sur prestations de services ».
    expect(compteTvaCollectee('70610000')).toBe('44320000');
    // 705 travaux facturés → 4433 « TVA facturée sur travaux ».
    expect(compteTvaCollectee('70510000')).toBe('44330000');
  });

  it('ventile la TVA récupérable sur les subdivisions du compte 445', () => {
    expect(compteTvaRecuperable('24410000')).toBe('44510000'); // classe 2 · immobilisations
    expect(compteTvaRecuperable('60110000')).toBe('44520000'); // 60 achats
    expect(compteTvaRecuperable('61100000')).toBe('44530000'); // 61 transports
    expect(compteTvaRecuperable('62200000')).toBe('44540000'); // 62 services extérieurs
    expect(compteTvaRecuperable('63100000')).toBe('44540000'); // 63 autres services extérieurs
  });

  it('ne route RIEN sur un dossier SYCEBNL · son plan ne subdivise pas', () => {
    // Son 4431 est « État, T.V.A. facturée » et son 4451 « État, T.V.A.
    // récupérable », tous deux génériques : le compte du taux est le bon.
    expect(compteTvaPourContrepartie('SYCEBNL', 'recette', '70610000', PLAN)).toBeNull();
    expect(compteTvaPourContrepartie(undefined, 'depense', '62200000', PLAN)).toBeNull();
  });

  it('retombe sur le compte du taux quand la subdivision n’est pas ouverte au plan', () => {
    // Un dossier qui aurait élagué son plan ne doit pas se voir imputer un
    // compte inexistant : mieux vaut le générique du taux.
    const planElague = new Set(['44310000', '44520000']);
    expect(compteTvaPourContrepartie('SYSCOHADA', 'recette', '70610000', planElague)).toBeNull();
    expect(compteTvaPourContrepartie('SYSCOHADA', 'depense', '62200000', planElague)).toBeNull();
    // Ce qui est ouvert, en revanche, est bien routé.
    expect(compteTvaPourContrepartie('SYSCOHADA', 'depense', '60110000', planElague)).toBe('44520000');
  });

  it('retombe aussi sur le compte du taux pour une contrepartie hors table', () => {
    // Un produit financier, une charge de personnel : hors des racines
    // connues, il n'y a rien à router.
    expect(compteTvaPourContrepartie('SYSCOHADA', 'recette', '77100000', PLAN)).toBeNull();
    expect(compteTvaPourContrepartie('SYSCOHADA', 'depense', '66110000', PLAN)).toBeNull();
  });

  it('vise sept comptes réellement semés au plan SYSCOHADA', () => {
    // Le garde-fou du garde-fou : une table qui viserait un compte absent du
    // semis serait inerte, et le test précédent passerait quand même.
    const seed = lire('../../../src/modules/comptes/compte-seed-syscohada.ts');
    for (const numero of PLAN) {
      expect(`${numero}: ${seed.includes(`'${numero}'`)}`).toBe(`${numero}: true`);
    }
  });

  it('est bien branchée sur la modale de saisie, pas seulement écrite', () => {
    const modale = lire('../components/ModelesSaisie.tsx');
    expect(modale).toContain('compteTvaPourContrepartie(');
    expect(modale).toContain('compteRoute?.id ?? (recette ? taux.compteCollecteId : taux.compteDeductibleId)');
  });
});
