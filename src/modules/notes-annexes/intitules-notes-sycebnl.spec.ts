import { JeuNotesAnnexes } from '@prisma/client';
import { NOTES_ASSOCIATIONS } from './correspondance-notes-associations';
import { NOTES_PROJETS } from './correspondance-notes-projets';
import {
  INTITULES_FICHE_ASSOCIATIONS,
  INTITULES_FICHE_PROJETS,
  TITRES_DE_NOTE_ASSOCIATIONS,
  TITRES_DE_NOTE_PROJETS,
  intituleSurLaFiche,
  titreDeLaNote,
} from './intitules-notes-sycebnl';
import type { SpecificationNote } from './note-annexe.types';

// Passe R6 · la fiche récapitulative et la tête de chaque note s'imprimaient
// sous le titre du PREMIER TABLEAU de la note.
const JEUX: Array<[string, SpecificationNote[], Readonly<Record<string, string>>, Readonly<Record<string, string>>]> = [
  ['associations', NOTES_ASSOCIATIONS, INTITULES_FICHE_ASSOCIATIONS, TITRES_DE_NOTE_ASSOCIATIONS],
  ['projets', NOTES_PROJETS, INTITULES_FICHE_PROJETS, TITRES_DE_NOTE_PROJETS],
];

describe.each(JEUX)('Intitulés des notes · jeu %s', (_nom, notes, fiche, titres) => {
  const codes = [...new Set(notes.map((n) => n.code))].sort();

  it('la fiche et les titres couvrent exactement les notes du jeu', () => {
    expect(Object.keys(fiche).sort()).toEqual(codes);
    expect(Object.keys(titres).sort()).toEqual(codes);
  });

  it('une note à un seul tableau porte, en tête, le titre de ce tableau', () => {
    // Garde de transcription · les deux transcriptions ne doivent pas diverger.
    const seuls = codes.filter((c) => notes.filter((n) => n.code === c).length === 1);
    const ecarts = seuls.filter((c) => notes.find((n) => n.code === c)!.titre !== titres[c]);
    expect(ecarts).toEqual([]);
  });
});

describe('Intitulés des notes · les notes à plusieurs tableaux (passe R6)', () => {
  it('la fiche imprime l’intitulé officiel, pas celui d’un tableau', () => {
    const A = JeuNotesAnnexes.ASSOCIATIONS_ORDRES_PROFESSIONNELS;
    expect(intituleSurLaFiche(A, '1', 'x')).toBe(
      'Dettes garanties par des sûretés réelles, engagements financiers et contributions volontaires en nature',
    );
    expect(intituleSurLaFiche(A, '7', 'x')).toBe('Actif circulant et dettes circulantes HAO');
    expect(intituleSurLaFiche(A, '29B', 'x')).toBe('Effectifs, masse salariale et personnel extérieur');
    expect(intituleSurLaFiche(JeuNotesAnnexes.PROJETS_DEVELOPPEMENT, '20B', 'x')).toBe(
      'EFFECTIFS, MASSE SALARIALE ET PERSONNEL EXTERIEUR',
    );
  });

  it('la tête de la note porte le titre du modèle', () => {
    const P = JeuNotesAnnexes.PROJETS_DEVELOPPEMENT;
    expect(titreDeLaNote(P, '4', 'x')).toBe('ACTIF CIRCULANT ET DETTES CIRCULANTES HAO');
    expect(titreDeLaNote(P, '20B', 'x')).toBe('EFFECTIFS, MASSE SALARIALE ET PERSONNEL');
  });

  it('le SYSCOHADA garde le titre de son premier tableau', () => {
    expect(intituleSurLaFiche(JeuNotesAnnexes.SYSCOHADA_SYSTEME_NORMAL, '3A', 'IMMOBILISATION BRUTE')).toBe(
      'IMMOBILISATION BRUTE',
    );
  });
});
