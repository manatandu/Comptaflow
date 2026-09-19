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

describe('P2b · les cotisations et le net à payer', () => {
  it("n'écrit aucun taux de cotisation dans la page", () => {
    // Les taux vivent dans `cotisations-paie.ts` avec leur date d'effet. Les
    // recopier ici les figerait au prochain arrêté, et l'écran servirait un
    // taux périmé sur un tableau parfaitement additionné.
    const debut = SOURCE.indexOf("{onglet === 'simulation'");
    const panneau = SOURCE.slice(debut);
    expect(panneau).not.toMatch(/6[.,]5\s*%/);
    expect(panneau).not.toMatch(/1[.,]5\s*%/);
    expect(panneau).not.toMatch(/0[.,]5\s*%/);
    // Le taux affiché vient toujours de la ligne rendue par le serveur.
    expect(panneau).toContain('{c.tauxPourCent} %');
  });

  it('affiche la charge de chaque ligne, employeur ou travailleur', () => {
    // Sans la colonne, un cabinet lit le total comme une retenue sur la paie.
    expect(SOURCE).toContain("c.charge === 'TRAVAILLEUR' ? 'Travailleur' : 'Employeur'");
    expect(SOURCE).toContain('Total retenu sur la paie');
  });

  it("dit que le net part du total VERSÉ, pas de l'assiette", () => {
    expect(SOURCE).toContain('Le net part du total VERSÉ');
  });

  it("laisse la nature INPP ABSENTE quand elle n'est pas renseignée", () => {
    // `''` enverrait une valeur que le DTO refuse, et surtout la présumer
    // ferait servir un taux public à un employeur privé, ou l'inverse.
    expect(SOURCE).toContain(
      "...(natureInpp === '' ? {} : { natureEmployeurInpp: natureInpp }),",
    );
  });
});

describe('P3 · la passation comptable à l\'écran', () => {
  it("n'écrit AUCUN numéro de compte dans la page", () => {
    // Quatrième fois que la règle se pose : aucun numéro de compte de paie
    // hors de `passation-paie.ts`, et aucun sans son référentiel. Le recopier
    // ici servirait le numéro d'un plan au dossier de l'autre.
    const debut = SOURCE.indexOf("{onglet === 'simulation'");
    const panneau = SOURCE.slice(debut);
    expect(panneau).not.toMatch(/\b4[2-4]\d{6}\b/);
    expect(panneau).not.toMatch(/\b66\d{6}\b/);
    expect(panneau).toContain('{l.compte}');
  });

  it("affiche le plan sur lequel l'écriture est proposée", () => {
    expect(SOURCE).toContain('Passation comptable · plan {simulation.passation.referentiel}');
  });

  it("montre le refus plutôt qu'une écriture partielle", () => {
    expect(SOURCE).toContain('Aucune écriture n’est proposée');
    expect(SOURCE).toContain('simulation.passation.refus.length > 0');
  });

  it("dit qu'il n'enregistre ni ne poste rien", () => {
    expect(SOURCE).toContain('sans rien conserver ni poster');
    expect(SOURCE).toContain('<strong>proposée</strong>');
  });
});
