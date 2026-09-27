import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Aucun import de « vitest » (globales) · convention du dépôt.

/**
 * AUDIT FINAL F174 · une vitrine interrompue est COMPLÉTÉE par le serveur, pas
 * ouverte. L'écran doit le dire, avec l'adresse de la vitrine et la réserve du
 * serveur · sans quoi l'opérateur chercherait la vitrine sous l'adresse qu'il
 * vient de saisir, qui n'a servi à rien.
 */
const source = readFileSync(join(__dirname, 'DemonstrationConsole.tsx'), 'utf8');

describe('console · dossiers de démonstration', () => {
  it('distingue la reprise de l’ouverture, et affiche la réserve du serveur', () => {
    expect(source).toContain('repris: boolean; rappel: string;');
    expect(source).toContain('r.repris ? `« ${r.nom} » (${r.email}) complété${garni} ${r.rappel}`');
  });
});
