import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * P8 · CE QUE L'ÉCRAN DES BULLETINS NE DOIT PAS FAIRE.
 *
 * Le serveur fige le bulletin ; l'écran le relit. Chaque test gèle une
 * PRÉSENCE (un appel, un corps partagé, une garde), jamais une absence de mot,
 * sauf deux : aucune somme locale, aucune phrase qui dit encore que le
 * logiciel n'enregistre pas de bulletin.
 */

const BULLETINS = readFileSync(join(__dirname, 'BulletinsPaie.tsx'), 'utf8');
const PERSONNEL = readFileSync(join(__dirname, 'PersonnelPage.tsx'), 'utf8');

describe("l'onglet Bulletins", () => {
  it('lit la liste et les totaux au serveur, sans additionner quoi que ce soit', () => {
    expect(BULLETINS).toContain('/personnel/bulletins?mois=');
    expect(BULLETINS).toContain('totauxEmis');
    expect(BULLETINS).not.toContain('.reduce(');
  });

  it('réserve annuler et déclarer la remise à qui peut écrire', () => {
    const avantAnnuler = BULLETINS.slice(0, BULLETINS.indexOf("agir('annulation'"));
    const avantRemise = BULLETINS.slice(0, BULLETINS.indexOf("agir('remise'"));
    expect(avantAnnuler.lastIndexOf("peutEcrire && ouvert.statut === 'EMIS'")).toBeGreaterThan(-1);
    expect(avantRemise.lastIndexOf("peutEcrire && ouvert.statut === 'EMIS' && !ouvert.remisLe")).toBeGreaterThan(-1);
  });
});

describe('la simulation et le bulletin partagent UN corps', () => {
  it('simuler et émettre appellent la même construction', () => {
    const simuler = PERSONNEL.slice(PERSONNEL.indexOf('const simuler = () =>'), PERSONNEL.indexOf('const emettreBulletin'));
    const emettre = PERSONNEL.slice(PERSONNEL.indexOf('const emettreBulletin'), PERSONNEL.indexOf('LE LIVRE DE PAIE EST DEMANDÉ'));
    expect(simuler).toContain('corpsSimulation()');
    expect(emettre).toContain('corpsSimulation()');
    expect(emettre).toContain('/bulletins`');
  });

  it("le bouton d'émission n'apparaît qu'à qui peut écrire", () => {
    expect(PERSONNEL).toContain("{onglet === 'simulation' && simulation && peutEcrire && (");
  });

  it("l'en-tête ne dit plus que le registre n'enregistre aucun bulletin", () => {
    // UNE GARANTIE NÉGATIVE VIEILLIT (P5) · elle était vraie jusqu'à P8.
    expect(PERSONNEL).not.toContain('Il n’enregistre aucun bulletin de paie');
    expect(PERSONNEL).toContain('L’onglet <strong>Bulletins</strong> tient les bulletins émis');
  });
});
