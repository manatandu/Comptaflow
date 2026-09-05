import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * L'EXEMPTION D'IMPÔT SUR LES SOCIÉTÉS DOIT ATTEINDRE UN ÉCRAN.
 *
 * `GET /fiscalite/exemption-is` existait depuis sa création, cloisonnée au
 * SYCEBNL, et AUCUN ÉCRAN NE L'APPELAIT. La qualification du fondement, le
 * concours de qualification d'une ONG, les quatre conditions de l'art. 3 de
 * l'arrêté n° 007/2025, la gestion désintéressée de l'art. 4 et la sanction de
 * l'art. 5 vivaient dans une charge utile que personne ne lisait.
 *
 * Rien ne le signalait : la route répondait, ses tests passaient, et le
 * cabinet ne voyait qu'un champ de saisie nu. C'est le défaut le plus courant
 * de ce dépôt, et le seul que ces tests attrapent.
 */

const page = readFileSync(join(__dirname, 'ParametresDossierPage.tsx'), 'utf8');
const types = readFileSync(join(__dirname, '../lib/types.ts'), 'utf8');

describe("l'exemption d'IS à l'écran", () => {
  it("la fenêtre APPELLE la route · c'est tout l'objet du chantier", () => {
    expect(page).toContain("api.get<QualificationExemptionIs>('/fiscalite/exemption-is')");
  });

  it("l'appel est à l'intérieur du garde SYCEBNL, jamais avant", () => {
    // La route est cloisonnée au SYCEBNL côté serveur, mais la fenêtre est
    // COMMUNE aux deux référentiels : appelée depuis un dossier SYSCOHADA,
    // elle ferait remonter une erreur à l'écran pour une fenêtre légitime.
    const garde = page.indexOf("if (p.referentiel === 'SYCEBNL') {");
    const appel = page.indexOf("api.get<QualificationExemptionIs>('/fiscalite/exemption-is')");
    expect(garde).toBeGreaterThan(0);
    expect(appel).toBeGreaterThan(garde);
    // Et le bloc se referme sur un `else` qui remet la qualification à null ·
    // sans lui, un dossier SYSCOHADA garderait à l'écran celle d'un dossier
    // SYCEBNL ouvert avant lui dans la même session.
    expect(page.slice(garde, appel + 600)).toContain('setExemption(null)');
  });

  it("le panneau rend l'énoncé ET les avertissements, pas seulement un booléen", () => {
    const i = page.indexOf('{estSycebnl && exemption && (');
    expect(i).toBeGreaterThan(0);
    const bloc = page.slice(i, i + 2600);
    expect(bloc).toContain('exemption.enonce');
    expect(bloc).toContain('exemption.avertissements.map');
    expect(bloc).toContain('exemption.attestationRequise');
  });

  it("NULL est rendu comme « indéterminé », jamais comme « non »", () => {
    // `attestationRequise === null` veut dire que le fondement n'est pas
    // qualifiable. Le rendre comme un « non » dirait au cabinet qu'aucune
    // pièce n'est due, ce que le logiciel ne sait pas.
    const i = page.indexOf('exemption.attestationRequise === null');
    expect(i).toBeGreaterThan(0);
    expect(page.slice(i, i + 200)).toContain('Indéterminé');
  });

  it("la date se saisit sous le libellé « Délivrée le », jamais sous une échéance", () => {
    // Les six articles de l'arrêté ne fixent AUCUNE durée de validité. Un
    // libellé « Valable jusqu'au » ferait surveiller une date que le texte
    // n'impose pas, et ferait lire une attestation en cours comme un quitus.
    expect(page).toContain('Délivrée le');
    expect(page).toContain('dateAttestationExemptionIs: dateAttestationIs');
  });

  it("aucun mot d'échéance ne figure sur la fenêtre à propos de l'attestation", () => {
    for (const interdit of ['Valable jusqu’au', "Valable jusqu'au", 'Attestation expirée', 'attestation périmée']) {
      expect(page).not.toContain(interdit);
    }
  });

  it('le type client porte la date de délivrance et la qualification', () => {
    expect(types).toContain('dateAttestationExemptionIs: string | null;');
    expect(types).toContain('export type QualificationExemptionIs');
    expect(types).toContain('dateAttestationConnue: boolean;');
    // Aucun champ d'échéance dans le contrat client · le jour où quelqu'un en
    // ajoute un, il devra passer par ce test.
    expect(types).not.toContain('finAttestationExemptionIs');
  });
});
