import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * LIGNE A5, SECONDE RELECTURE · L'ÉCRAN NE RECALCULE PAS CE QUE LE SERVEUR
 * JUGE. (M1) Le dépassement du solde d'ouverture se juge sur la version PLUS
 * les réévaluations depuis son début · l'écran le comparait à la seule
 * version, et criait « dépasse » sur un dossier juste. (M3) « Non déclarée »
 * n'est en alerte que là où la réserve joue. (M2) Pendant une réserve, la
 * provision en place est dite incomplète, jamais un zéro nu.
 */
const racine = join(__dirname, '..');
const cadre = readFileSync(join(racine, 'components/ProvisionChangeOuverture.tsx'), 'utf8');
const page = readFileSync(join(racine, 'pages/DevisesPage.tsx'), 'utf8');

describe('provision d’ouverture à l’écran', () => {
  it('M1 · le dépassement est celui que le serveur sert', () => {
    expect(cadre).toContain('const depasse = l.depasseSoldeOuverture;');
  });

  it('M3 · l’alerte « Non déclarée » suit la réserve du compte', () => {
    expect(cadre).toMatch(/l\.reserve \? 'text-warning font-semibold' : 'text-text-dim'/);
  });

  it('M2 · la provision en place d’une réserve est incomplète, total et ligne', () => {
    expect(page).toContain('rapport.provisionEnPlaceIncomplete ? null : rapport.provisionEnPlace');
    expect(page).toMatch(/a\.enPlaceIncomplete \? \(\s*<>\s*\{montant\(null\)\}/);
  });

  it('point 1 · dotation et reprise d’une réserve sont dites provisoires, sur le drapeau du serveur', () => {
    expect(page.match(/\{a\.montantsProvisoires && <span className="ml-1 font-sans text-warning">provisoire<\/span>\}/g)).toHaveLength(2);
  });

  it('huitième passe · la provision du module et les bornes sont servies, montrées à côté de la version', () => {
    expect(cadre).toContain('Module · {montant(l.provisionModuleOuverture)}');
    // Seule la contestation EXPRESSE ouvre le plancher · une case, son propre motif, et le motif de
    // correction reste réservé à la version qui succède à une autre.
    expect(cadre).toContain('La provision passée par OmegaX ne correspond pas à la provision de change réelle');
    // Le libellé VISIBLE de la case, pas seulement son aria-label (dixième relecture, C3).
    expect(cadre).toMatch(/\/>\s*La provision passée par OmegaX ne correspond pas à la provision de change réelle\s*<\/label>/);
    // Le montant contesté à côté de la version en vigueur (C4).
    expect(cadre).toContain('Provision OmegaX contestée ({montant(l.enVigueur.provisionModuleContesteeMontant)})');
    // Précochage réservé au figé égal au module du jour (4).
    expect(cadre).toContain('contestee: contestationPrecochee(aCetteDate, x.provisionModuleOuverture),');
    // Le motif d'une version hors bornes est celui de `messageVersionHorsBornes`, testé par sa sortie.
    expect(cadre).toContain('{messageVersionHorsBornes(l)}');
    expect(cadre).toContain('...(s.contestee ? { provisionModuleContestee: true, motifContestation: s.motifContestation } : {})');
    expect(cadre).toMatch(/anterieure \? \(\s*<input/);
  });

  it('quatrième passe · aucun préremplissage d’un solde non fiable ou en réserve', () => {
    expect(cadre).toContain(': x.ouvertureFiable && !x.reserve');
  });
});
