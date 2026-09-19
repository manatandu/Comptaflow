import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE = readFileSync(join(__dirname, 'PersonnelPage.tsx'), 'utf8');

/**
 * L'ÉCRAN DE SIMULATION · ce qui se gèle est ce que le code FAIT, jamais la
 * forme qu'il a.
 */
describe("La simulation ne recalcule rien côté client", () => {
  it("demande la simulation au serveur", () => {
    expect(SOURCE).toContain('/personnel/simulation');
  });

  it("n'écrit AUCUN seuil ni taux du barème dans la page", () => {
    // Le défaut visé : recopier les tranches de l'article 118 ou le plafond
    // de 30 % pour « éviter un aller-retour ». Deux calculs écrits séparément
    // divergent au premier correctif, et les deux restent plausibles.
    const corps = SOURCE.slice(SOURCE.indexOf('const simuler ='));
    expect(corps).not.toMatch(/1[_ .]?944[_ .]?000/);
    expect(corps).not.toMatch(/21[_ .]?600[_ .]?000/);
    expect(corps).not.toMatch(/43[_ .]?200[_ .]?000/);
  });

  it("n'additionne aucune assiette dans la page", () => {
    // Les deux totaux viennent du serveur. Une somme locale sur `lignes`
    // produirait un troisième chiffre, sans les exclusions ni les immunités.
    const debut = SOURCE.indexOf('const simuler =');
    const fin = SOURCE.indexOf('const corpsSalarie', debut);
    const corps = SOURCE.slice(debut, fin);
    expect(corps).not.toContain('.reduce(');
  });
});

describe("L'attestation de l'article 69, 8 n'est envoyée que si elle a été donnée", () => {
  it("laisse le champ ABSENT quand rien n'est renseigné", () => {
    // `false` transformerait un silence en refus, et imposerait une indemnité
    // que personne n'a examinée. Le serveur, lui, s'abstient sur l'absence.
    expect(SOURCE).toContain(
      "...(l.attestee === '' ? {} : { conditionArticle69Attestee: l.attestee === 'oui' }),",
    );
  });

  it("ne propose le champ que sur le transport et les frais médicaux", () => {
    // Les deux seules conditions de l'article 69 qu'aucun livre comptable ne
    // porte. L'offrir sur le logement laisserait croire que le cabinet peut
    // attester un plafond que le serveur calcule.
    expect(SOURCE).toContain(
      "l.nature === 'INDEMNITE_DE_TRANSPORT' || l.nature === 'SOINS_DE_SANTE'",
    );
  });
});

describe("Ce que la fenêtre annonce avant tout chiffre", () => {
  it("dit que ce n'est pas un bulletin de paie", () => {
    expect(SOURCE).toContain('Ceci n’est pas un bulletin de paie.');
  });

  it("ne déclare plus que le moteur attend des textes absents du corpus", () => {
    // Lacune déclarée à tort · le barème de l'article 118, les immunités de
    // l'article 69 et la déductibilité de l'article 71 sont tous au corpus.
    // La phrase a vécu de P1 à P2a, et elle faisait renoncer à une démarche
    // possible.
    expect(SOURCE).not.toContain('attend des textes qui ne sont pas encore au corpus');
  });

  it('nomme les DEUX assiettes et la raison pour laquelle elles diffèrent', () => {
    expect(SOURCE).toContain('Assiette sociale');
    expect(SOURCE).toContain('Assiette fiscale nette (art. 70)');
    expect(SOURCE).toContain('sans aucune condition');
    expect(SOURCE).toContain('sous condition');
  });

  it("rend l'abstention visible au lieu d'afficher un zéro", () => {
    expect(SOURCE).toContain("'Indéterminée'");
    expect(SOURCE).toContain("'indéterminé'");
    expect(SOURCE).toContain('La simulation s’abstient plutôt que de supposer');
  });
});

describe('Le garde-fou des 360 px', () => {
  it('enferme chaque grille large dans un conteneur qui défile', () => {
    // Une grille de 320 px tient dans 360 · elle n'a rien à envelopper.
    // Ce qui est surveillé est la grille qui DÉPASSE, et elle seule.
    const larges = [...SOURCE.matchAll(/min-w-\[(\d+)px\]/g)]
      .map((m) => Number(m[1]))
      .filter((l) => l > 360);
    expect(larges.length).toBeGreaterThan(0);
    const conteneurs = [...SOURCE.matchAll(/overflow-x-auto/g)].length;
    expect(conteneurs).toBeGreaterThanOrEqual(larges.length);
  });
});
