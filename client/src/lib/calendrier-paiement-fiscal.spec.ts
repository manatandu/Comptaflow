import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mentionCalendrierPaiement, REGIMES_AUX_ACOMPTES } from './calendrier-paiement-fiscal';
import type { RegimeImposition } from './types';

/**
 * LE TEST QUI AURAIT ATTRAPÉ LA PHRASE EN DUR.
 *
 * L'écran de fiscalité annonçait « art. 57 bis LPF · 30 % le 25 juillet,
 * 30 % le 25 septembre, 20 % le 25 novembre » à TOUS les régimes, littéral
 * logé dans le JSX, hors de toute condition. Le serveur avait cessé de
 * servir des acomptes à une petite entreprise · l'écran continuait de lui en
 * réclamer trois, avec un article qui dit le contraire de ce qu'il fait.
 * Rien ne pouvait le voir : un texte d'interface n'a pas de contrat, tsc ne
 * lit pas le français et aucun test ne rendait cette page.
 *
 * Deux garanties ici, et il faut les deux. La première interroge la fonction
 * régime par régime · elle échouerait si le calendrier de l'art. 57 bis
 * revenait chez la petite entreprise. La seconde relit la SOURCE de l'écran
 * pour vérifier qu'il ne réintroduit pas le littéral à côté de la fonction :
 * une table bien testée ne sert à rien si la page cesse de s'en servir.
 *
 * Aucun import de `vitest` · convention du dépôt (voir
 * aiguillage-referentiel.spec.ts), describe/it/expect arrivent par les
 * globales, ce qui rend le fichier exécutable par les DEUX lanceurs.
 */

const TOUS_LES_REGIMES: RegimeImposition[] = [
  'IMPOT_SOCIETES',
  'IRPP_REGIME_REEL',
  'IRPP_PETITE_ENTREPRISE',
  'IRPP_MICRO_ENTREPRISE',
];

const sourceFiscalitePage = () => readFileSync(join(__dirname, '../pages/FiscalitePage.tsx'), 'utf8');

describe('Calendrier de paiement de l’impôt · art. 57, 57 bis et 57 quater LPF', () => {
  it('sert les trois acomptes de l’art. 57 bis à l’IS et au régime réel, et à eux seuls', () => {
    for (const regime of TOUS_LES_REGIMES) {
      const mention = mentionCalendrierPaiement(regime);
      const porteLesAcomptes = (mention.calendrier ?? '').includes('57 bis');
      expect(porteLesAcomptes).toBe(REGIMES_AUX_ACOMPTES.includes(regime));
    }
  });

  it('NE RÉCLAME PAS d’acompte à une petite entreprise · c’est le défaut corrigé', () => {
    const mention = mentionCalendrierPaiement('IRPP_PETITE_ENTREPRISE');
    expect(mention.calendrier).not.toContain('57 bis');
    expect(mention.calendrier).not.toContain('25 juillet');
    expect(mention.calendrier).toContain('57 quater');
    expect(mention.calendrier).toContain('31 janvier');
    expect(mention.libelleVersements).toContain('Quotités');
  });

  it('n’oppose AUCUN article à une micro-entreprise, que ni l’un ni l’autre texte ne vise', () => {
    const mention = mentionCalendrierPaiement('IRPP_MICRO_ENTREPRISE');
    expect(mention.calendrier).toBeNull();
    expect(mention.libelleVersements).toBeTruthy();
  });

  it('donne un libellé de versements à chaque régime, sans exception', () => {
    for (const regime of TOUS_LES_REGIMES) {
      expect(mentionCalendrierPaiement(regime).libelleVersements.length).toBeGreaterThan(0);
    }
  });

  it('l’écran ne réécrit aucun calendrier en dur et passe par la fonction', () => {
    const source = sourceFiscalitePage();
    // Le littéral d'origine, sous toutes ses formes reconnaissables.
    expect(source).not.toContain('25 juillet');
    expect(source).not.toContain('25 septembre');
    expect(source).not.toContain('25 novembre');
    expect(source).toContain('mentionCalendrierPaiement');
    expect(source).toContain('calendrier.libelleVersements');
  });

  it('l’écran affiche les deux quotités que le serveur calcule, réserve comprise', () => {
    const source = sourceFiscalitePage();
    expect(source).toContain('quotitesPetiteEntreprise');
    // La réserve du texte sur la seconde échéance ne doit pas rester muette.
    expect(source).toContain('q.reserve');
  });
});

/**
 * LE SECOND ÉCRAN · la déclaration de TVA affirmait « le définitif rejoint le
 * provisoire » dès que la régularisation était nulle, y compris quand AUCUNE
 * liquidation ne portait de prorata appliqué · cas du nouvel assujetti, où il
 * n'existe pas de provisoire à rejoindre. Et l'imputation du crédit de TVA de
 * l'art. 63, que le serveur calcule désormais, n'apparaissait nulle part :
 * le net affiché était celui d'après imputation, sans que rien n'explique
 * l'écart avec la taxe de la période.
 */
describe('Déclaration de TVA · ce que l’écran doit dire de l’art. 63 et du prorata définitif', () => {
  const source = () => readFileSync(join(__dirname, '../pages/DeclarationTvaPage.tsx'), 'utf8');

  it('rend l’imputation du crédit reporté au lieu de la laisser dans l’écart', () => {
    const s = source();
    expect(s).toContain('netAvantImputation');
    expect(s).toContain('creditAnterieur');
    expect(s).toContain('creditImpute');
    expect(s).toContain('art. 63');
  });

  it('ne prétend plus que le définitif rejoint un provisoire qui n’existe pas', () => {
    const s = source();
    // La phrase subsiste, mais SOUS CONDITION d'une assiette régularisable.
    expect(s).toContain('definitif.tvaDeductibleBrute <= 0');
    expect(s).toContain('aucune déduction n’a été opérée');
    expect(s).toContain('tvaDeductibleNonLiquidee');
  });
});
