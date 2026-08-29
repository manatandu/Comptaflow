import { JeuEtatsFinanciersSycebnl } from '@prisma/client';
import { ExportService } from './export.service';

/**
 * LIASSE COMPLÈTE · deux risques, et ce sont les deux seuls qui peuvent
 * casser le fichier à l'ouverture ou le rendre incomplet au dépôt.
 *
 * 1. Les noms de feuilles. Excel refuse plus de 31 caractères et deux
 *    feuilles homonymes. Or chaque état unitaire porte ses propres feuilles
 *    « Détail par poste », « Méthode », « Contrôles et anomalies » : sans
 *    déduplication, la liasse serait rejetée à l'ouverture.
 * 2. La composition. Un état manquant dans la liasse, c'est un dépôt
 *    incomplet que personne ne remarque avant le guichet.
 */

const service = () => Object.create(ExportService.prototype) as ExportService;

const nomUnique = (souhaite: string, pris: Set<string>) =>
  (service() as unknown as { nomFeuilleUnique(s: string, p: Set<string>): string }).nomFeuilleUnique(souhaite, pris);

const composants = (jeu: JeuEtatsFinanciersSycebnl) =>
  (
    service() as unknown as {
      composantsLiasse(
        j: JeuEtatsFinanciersSycebnl,
        t: string,
        e: string,
        p: number,
      ): { titre: string; source: string }[];
    }
  ).composantsLiasse(jeu, 'tenant', 'exercice', 0);

describe('nommage des feuilles de la liasse', () => {
  it('tronque à 31 caractères, la borne d’Excel', () => {
    const nom = nomUnique('7. Une feuille au titre interminable', new Set());
    expect(nom.length).toBeLessThanOrEqual(31);
    expect(nom).toBe('7. Une feuille au titre intermi');
  });

  it('déduplique deux feuilles homonymes', () => {
    const pris = new Set<string>();
    expect(nomUnique('1. Détail', pris)).toBe('1. Détail');
    expect(nomUnique('1. Détail', pris)).toBe('1. Détail (2)');
    expect(nomUnique('1. Détail', pris)).toBe('1. Détail (3)');
  });

  it('déduplique même quand la troncature crée la collision', () => {
    const pris = new Set<string>();
    const a = nomUnique('4. Contrôles et anomalies du bilan', pris);
    const b = nomUnique('4. Contrôles et anomalies du bilan projet', pris);
    // Les deux se tronquent au même préfixe : le second doit être suffixé.
    expect(a).not.toBe(b);
    expect(b.length).toBeLessThanOrEqual(31);
    expect(b.endsWith(' (2)')).toBe(true);
  });

  it('renvoie le rang en tête, pour que l’ordre des onglets se lise', () => {
    expect(nomUnique('3. Emplois-ressources', new Set())).toMatch(/^3\. /);
  });
});

describe('composition de la liasse par jeu d’états', () => {
  it('sert au jeu associations le bilan, le résultat, le TFT et les 35 notes', () => {
    const titres = composants(JeuEtatsFinanciersSycebnl.ASSOCIATIONS_ORDRES_PROFESSIONNELS).map((c) => c.titre);
    expect(titres).toEqual([
      'Bilan',
      'Compte de résultat',
      'Tableau de flux de trésorerie',
      'Notes annexes (35)',
    ]);
  });

  it('sert au jeu projets les trois tableaux propres au jeu, sans oublier la note bailleur', () => {
    const titres = composants(JeuEtatsFinanciersSycebnl.PROJETS_DEVELOPPEMENT).map((c) => c.titre);
    expect(titres).toContain('Tableau emplois-ressources');
    expect(titres).toContain('Tableau d’exécution budgétaire');
    expect(titres).toContain('Tableau de réconciliation de trésorerie');
    expect(titres).toContain('Note des fonds du bailleur');
    expect(titres).toContain('Notes annexes (24)');
    // Le TFT est propre au jeu associations : il n'a rien à faire ici.
    expect(titres).not.toContain('Tableau de flux de trésorerie');
  });

  it('sert au SMT ses cinq états, dont le contrôle d’éligibilité', () => {
    const titres = composants(JeuEtatsFinanciersSycebnl.SYSTEME_MINIMAL_TRESORERIE).map((c) => c.titre);
    expect(titres).toHaveLength(5);
    expect(titres).toContain('Journal de trésorerie');
    expect(titres).toContain('Contrôle d’éligibilité au S.M.T');
  });

  it('cite pour chaque état sa source officielle', () => {
    for (const jeu of Object.values(JeuEtatsFinanciersSycebnl)) {
      for (const c of composants(jeu)) {
        expect(c.source.length).toBeGreaterThan(10);
      }
    }
  });
});
