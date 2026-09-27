import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { corpsSectionsRapport, textesDuRapport } from './rapport-sections';
import type { RapportActivite } from './types';

describe('Rapport annuel · chaque section sous sa clé (audit final F16)', () => {
  it('un rapport de gestion envoie `sections` sous les clés AUSCGIE, sections vides retirées', () => {
    const corps = corpsSectionsRapport({ activite: ' Exercice correct ', resultats: '', perspectives: 'Croissance' }, true);
    expect(corps).toEqual({ sections: { activite: ' Exercice correct ', perspectives: 'Croissance' } });
  });

  it('un rapport SYCEBNL envoie ses quatre colonnes, jamais `sections`', () => {
    const corps = corpsSectionsRapport({ situationExerciceEcoule: 'Bilan', evolutionTresorerie: '  ' }, false);
    expect(corps).toEqual({
      situationExerciceEcoule: 'Bilan',
      perspectivesDeveloppement: undefined,
      evolutionTresorerie: undefined,
      evenementsPosterieurs: undefined,
    });
  });

  it('une version établie se relit sous ses clés JSON en SYSCOHADA, sous ses colonnes sinon', () => {
    const gestion = { sections: { activite: 'A', resultats: 'R' } } as unknown as RapportActivite;
    const sycebnl = { situationExerciceEcoule: 'S', perspectivesDeveloppement: null } as unknown as RapportActivite;
    expect([textesDuRapport(gestion), textesDuRapport(sycebnl)]).toEqual([
      { activite: 'A', resultats: 'R' },
      { situationExerciceEcoule: 'S', perspectivesDeveloppement: '', evolutionTresorerie: '', evenementsPosterieurs: '' },
    ]);
  });

  it('l’écran établit le rapport par ce corps et relit par ces textes', () => {
    const page = readFileSync(join(__dirname, '..', 'pages', 'DocumentsObligatoiresPage.tsx'), 'utf8');
    expect([
      page.includes('...corpsSectionsRapport(textes, rapportDeGestion)'),
      page.includes('setTextes(textesDuRapport(dernier))'),
    ]).toEqual([true, true]);
  });
});
