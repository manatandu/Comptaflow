import type { NoteCalculee } from './types';

/**
 * Sous-titre d'un tableau de note, sous le titre de la NOTE (passe R6).
 *
 * Une note à plusieurs tableaux (notes 1, 7 et 29B des associations, 4 et
 * 20B des projets) porte un titre de note commun et un nom par tableau. Le
 * sous-titre est ce nom, et seulement s'il dit autre chose que le titre de
 * la note · l'écran répétait « ACTIF CIRCULANT HAO ACTIF CIRCULANT HAO ».
 */
export function sousTitreDuTableau(note: Pick<NoteCalculee, 'sousTableau' | 'titre' | 'titreNote'>): string | null {
  const titreNote = note.titreNote ?? note.titre;
  const candidat = note.sousTableau ?? (note.titre !== titreNote ? note.titre : null);
  return candidat && candidat !== titreNote ? candidat : null;
}
