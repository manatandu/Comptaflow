import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * UN CALCUL QUE PERSONNE N'APPELLE N'EXISTE PAS.
 *
 * `prorataDefinitif()` était écrit, complet et testé : il arrête le prorata
 * définitif d'une année civile et chiffre la régularisation qui en découle
 * (art. 45 de l'ordonnance-loi n° 10/001, à arrêter au plus tard le 31 mars
 * suivant). AUCUNE route ne l'appelait, aucun écran ne le montrait · il était
 * rigoureusement inaccessible depuis le logiciel.
 *
 * Ce n'est pas du code mort inoffensif : c'est une obligation annuelle que le
 * produit sait calculer et que le cabinet oublie, parce que rien ne la lui
 * rappelle. Le défaut est du même genre que l'absence de verrou sur la
 * liquidation · silencieux, et visible seulement quand le contrôle arrive.
 *
 * Ce spec lit les fichiers plutôt que d'appeler le service : ce qu'il garde
 * n'est pas le calcul (déjà couvert ailleurs) mais sa JOIGNABILITÉ.
 */

const service = readFileSync(join(__dirname, 'taux-tva.service.ts'), 'utf8');
const controleur = readFileSync(join(__dirname, 'taux-tva.controller.ts'), 'utf8');
const page = readFileSync(
  join(__dirname, '..', '..', '..', 'client', 'src', 'pages', 'DeclarationTvaPage.tsx'),
  'utf8',
);

describe('prorata définitif · joignable de bout en bout', () => {
  it('le calcul existe toujours', () => {
    expect(service).toContain('async prorataDefinitif(');
  });

  it('une route le sert', () => {
    expect(controleur).toContain("@Get('prorata-definitif')");
    expect(controleur).toContain('this.tauxTvaService.prorataDefinitif(');
  });

  it('la route refuse une année absurde plutôt que de calculer sur NaN', () => {
    // `Number(undefined)` vaut NaN, et les bornes d'année construites dessus
    // donneraient des dates invalides · l'agrégation ne renverrait rien et le
    // prorata sortirait à 100 %, chiffre d'allure parfaitement normale.
    expect(controleur).toContain('Number.isInteger(n)');
  });

  it('un écran l’appelle et rend le SENS de la régularisation', () => {
    // Un montant de régularisation dont on ignore s'il est à payer ou à
    // récupérer ne sert à rien.
    expect(page).toContain('/taux-tva/prorata-definitif?annee=');
    expect(page).toContain('DEDUCTION_COMPLEMENTAIRE');
    expect(page).toContain('Reversement');
    expect(page).toContain('definitif.echeance');
  });

  it('l’écran rappelle la règle des deux proratas, pas seulement le chiffre', () => {
    expect(page).toContain('article 45');
    expect(page).toContain('31 mars');
  });
});
