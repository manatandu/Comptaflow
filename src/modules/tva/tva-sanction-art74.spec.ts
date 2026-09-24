import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * PASSE F13 · l'art. 74, alinéa 2 de l'O.-L. n° 10/001, ajouté par la L.F.
 * n° 25/060, art. 50 : « La même sanction prévue à alinéa précédent
 * s'applique en cas d'utilisation d'une facture ou d'une déclaration de la
 * mise à la consommation par un assujetti plus d'une fois pour la déduction ».
 * L'alinéa précédent punit d'une amende « égale au montant des droits
 * indûment déduits ». La liste des manques du module la rangeait parmi les
 * amendes du TRIPLE (art. 70 et 71) · une lacune déclarée avec une sanction
 * trois fois trop lourde.
 */
describe('art. 74, alinéa 2 · la sanction est celle de l’alinéa 1er', () => {
  const source = readFileSync(join(__dirname, 'taux-tva.service.ts'), 'utf8');
  it('la liste des manques rend la sanction de l’alinéa 1er', () => {
    expect(source).toContain('« égale au montant des droits indûment déduits »');
    expect(source).toContain("celle de l'art. 74, alinéa 2 (document servi DEUX FOIS à la déduction),\n *    qui n'est PAS du triple");
  });
});
