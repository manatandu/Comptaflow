import { readFileSync } from 'fs';
import { join } from 'path';
import { FormeJuridiqueSyscohada } from '@prisma/client';
import { FORMES_PERSONNES_PHYSIQUES } from './correspondance-retenues';

/**
 * UNE SEULE LISTE DES FORMES « PERSONNE PHYSIQUE ».
 *
 * Audit du serveur du 2026-09-27, I6 · elle était écrite quatre fois, et
 * l'une des copies avait déjà oublié l'entreprenant (amende de l'art. 97 bis
 * triplée). On gèle la PRÉSENCE de l'import chez chaque consommateur, jamais
 * l'absence du nom d'une forme.
 */
const lire = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');

describe('formes personnes physiques', () => {
  it('la liste est celle des deux formes du schéma', () => {
    expect([...FORMES_PERSONNES_PHYSIQUES].sort()).toEqual(
      [FormeJuridiqueSyscohada.ENTREPRENANT, FormeJuridiqueSyscohada.ENTREPRISE_INDIVIDUELLE].sort(),
    );
  });

  it.each(['exercice/planning-cloture.ts', 'fiscalite/fiscalite.service.ts'])('%s importe la liste commune', (f) => {
    expect(lire(f)).toContain("import { FORMES_PERSONNES_PHYSIQUES } from '../retenues/correspondance-retenues';");
    expect(lire(f)).not.toMatch(/const FORMES_PERSONNES_PHYSIQUES\b/);
  });
});
