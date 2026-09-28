import { celluleLibreEnSaisie, colonneLibreEnSaisie } from './cellules-libres-en-saisie';
import type { RubriqueNote, SpecificationNote } from './note-annexe.types';

/**
 * LA RÈGLE À LA CELLULE (passe O3, constat A1/D1) · une cellule chiffrée
 * n'est jamais en saisie ; une cellule LIBRE d'une rubrique chiffrée peut
 * l'être. Vérifiée ici sur des tableaux FABRIQUÉS, parce que les tableaux
 * officiels ne présentent aucun des cas limites (un total à clé, une colonne
 * de montant qualifiée par erreur) · c'est justement contre eux que la règle
 * doit tenir le jour où une transcription les introduit.
 */
const tableau = (rubriques: RubriqueNote[]): SpecificationNote => ({
  code: '1',
  sousTableau: 'ESSAI',
  titre: 'ESSAI',
  colonnes: [
    { type: 'LIBRE', libelle: 'Note' },
    { type: 'EXERCICE_N', libelle: 'Montant brut' },
    { type: 'LIBRE', libelle: 'Hypothèques', saisieSurLigneChiffree: true },
  ],
  rubriques,
});

describe('cellules LIBRE d’une rubrique chiffrée', () => {
  it('une colonne s’ouvre si elle est LIBRE ET déclarée · jamais une colonne de montant, même qualifiée', () => {
    expect(colonneLibreEnSaisie({ type: 'LIBRE', libelle: 'Hypothèques', saisieSurLigneChiffree: true })).toBe(true);
    expect(colonneLibreEnSaisie({ type: 'LIBRE', libelle: 'Note' })).toBe(false);
    expect(colonneLibreEnSaisie({ type: 'EXERCICE_N', libelle: 'Montant brut', saisieSurLigneChiffree: true })).toBe(false);
  });

  it('une ligne de dette à clé s’ouvre ; sans clé, elle n’a pas d’ancre', () => {
    const dette: RubriqueNote = { cle: 'dette', libelle: 'Dette', comptes: ['162'] };
    const sansCle: RubriqueNote = { libelle: 'Dette', comptes: ['162'] };
    expect(celluleLibreEnSaisie(tableau([dette]), dette)).toBe(true);
    expect(celluleLibreEnSaisie(tableau([sansCle]), sansCle)).toBe(false);
  });

  it('un total ne s’ouvre JAMAIS, même pourvu d’une clé · un texte ne s’additionne pas', () => {
    const dette: RubriqueNote = { cle: 'dette', libelle: 'Dette', comptes: ['162'] };
    const total: RubriqueNote = { cle: 'total', libelle: 'TOTAL', totalDeRubriques: [0] };
    expect(celluleLibreEnSaisie(tableau([dette, total]), total)).toBe(false);
  });

  it('une rubrique entièrement en saisie ne passe pas par cette règle · elle ouvre déjà tout', () => {
    const enSaisie: RubriqueNote = { cle: 'libre', libelle: 'Libre', saisie: true };
    expect(celluleLibreEnSaisie(tableau([enSaisie]), enSaisie)).toBe(false);
  });

  it('un tableau sans colonne déclarée n’ouvre rien', () => {
    const dette: RubriqueNote = { cle: 'dette', libelle: 'Dette', comptes: ['162'] };
    const sansColonne = { ...tableau([dette]), colonnes: [{ type: 'LIBRE' as const, libelle: 'Note' }] };
    expect(celluleLibreEnSaisie(sansColonne, dette)).toBe(false);
  });
});
