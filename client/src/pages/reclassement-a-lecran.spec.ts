import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * LE RECLASSEMENT DOIT ÊTRE DEMANDABLE.
 *
 * Le serveur sait virer un bien d'une catégorie à l'autre (ch. 10 § 2.4) ·
 * tant que l'écran ne le propose pas, la correction vit dans la charge utile
 * de l'API et n'atteint personne, ce qui est le défaut que l'AUDCIF art. 22,
 * 1° vise en exigeant que les données « puissent être RESTITUÉES sous une
 * forme directement intelligible ».
 *
 * Aucun import de « vitest » (globales) : les deux lanceurs exécutent ce
 * fichier.
 */

const page = readFileSync(join(__dirname, 'ImmobilisationsPage.tsx'), 'utf8');

describe("le reclassement d'immobilisation, à l'écran", () => {
  it('a son bouton sur chaque bien en service, et sa route', () => {
    expect(page).toContain('Reclasser');
    expect(page).toContain('/reclassement`');
    expect(page).toContain('setReclassementOuvertPour');
  });

  it("NE DEMANDE AUCUN MONTANT · le transfert n'a pas d'incidence sur la valeur comptable", () => {
    // Le piège de cet écran. Un champ de montant inviterait à recalculer ce
    // que le texte veut inchangé, et le comptable saisirait une valeur
    // « actualisée » que rien ne justifierait au grand livre.
    const formulaire = page.slice(
      page.indexOf('reclassementOuvertPour === immo.id'),
      page.indexOf('renouvellementOuvertPour === immo.id &&'),
    );
    expect(formulaire.length).toBeGreaterThan(500);
    expect(formulaire).not.toMatch(/setRc(Montant|Valeur|Cout)/);
    expect(formulaire).toContain('sans être recalculés');
  });

  it('EXIGE le motif, et dit pourquoi', () => {
    const formulaire = page.slice(
      page.indexOf('reclassementOuvertPour === immo.id'),
      page.indexOf('renouvellementOuvertPour === immo.id &&'),
    );
    expect(formulaire).toContain('setRcMotif');
    expect(formulaire).toContain('MOTIF DU CHANGEMENT D’UTILISATION');
    // La raison, pas seulement l'astérisque · le § 1.2 qualifie par l'usage.
    expect(formulaire).toContain('§ 1.2');
    expect(formulaire).toContain('§ 4.2');
  });

  it('ne demande le compte 29 QUE si le bien porte une dépréciation', () => {
    const formulaire = page.slice(
      page.indexOf('reclassementOuvertPour === immo.id'),
      page.indexOf('renouvellementOuvertPour === immo.id &&'),
    );
    expect(formulaire).toContain('cumulDeprecie(immo) > 0 &&');
    expect(formulaire).toContain('COMPTE 29 DE DESTINATION');
    // Et il dit pourquoi il n'est pas deviné.
    expect(formulaire).toContain('un 29 deviné serait un compte faux');
  });

  it("dit ce que l'opération NE FAIT PAS · le transfert vers les stocks", () => {
    // Le § 2.4 nomme aussi le stock. Le taire laisserait croire que le
    // bouton le couvre, et le comptable chercherait une famille de classe 3
    // qui ne peut pas exister.
    const formulaire = page.slice(
      page.indexOf('reclassementOuvertPour === immo.id'),
      page.indexOf('renouvellementOuvertPour === immo.id &&'),
    );
    expect(formulaire).toContain('STOCKS');
    expect(formulaire).toContain('quitte le module');
  });

  it('ne propose jamais la famille que le bien porte déjà', () => {
    const formulaire = page.slice(
      page.indexOf('reclassementOuvertPour === immo.id'),
      page.indexOf('renouvellementOuvertPour === immo.id &&'),
    );
    expect(formulaire).toContain('f.id !== immo.familleId');
  });
});
