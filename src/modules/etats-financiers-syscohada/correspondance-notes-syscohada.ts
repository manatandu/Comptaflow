import { SpecificationNote } from '../notes-annexes/note-annexe.types';
import { NOTES_SYSCOHADA_1 } from './correspondance-notes-syscohada-1';
import { NOTES_SYSCOHADA_2 } from './correspondance-notes-syscohada-2';
import { NOTES_SYSCOHADA_3 } from './correspondance-notes-syscohada-3';

/**
 * NOTES ANNEXES du SYSCOHADA révisé · Système normal, jeu COMPLET.
 *
 * Source de la liste : AUDCIF Titre IX ch. 6 section 2 « Liste officielle
 * des Notes annexes » (skill `audcif-acte-uniforme`, references/titre-9-ch6-
 * 7-notes-annexes-correspondance.md, lignes 41 à 100), reprise à
 * l'identique par la fiche R4 du ch. 2 et par le skill `syscohada`
 * (liasse/references/notes-ohada.md). Elle va de NOTE 1 à NOTE 36 et n'est
 * PAS numérotée de façon continue : la note 3 se subdivise de 3A à 3F (pas
 * de 3G), la 15 en 15A et 15B (pas de 15C), la 16 en 16A, 16B, 16B bis et
 * 16C (pas de 16D), la 27 en 27A et 27B. Les NUMÉROS DE TÊTE sont donc au
 * nombre de 36, pour 46 codes.
 *
 * Le jeu est assemblé depuis trois tranches, écrites séparément parce
 * qu'un fichier de 45 notes ne se relit pas · chacune porte ses sources,
 * ses anomalies et son spec :
 *  - tranche 1 : notes 1 à 15B (`correspondance-notes-syscohada-1.ts`) ;
 *  - tranche 2 : notes 16A à 27B (`correspondance-notes-syscohada-2.ts`) ;
 *  - tranche 3 : notes 28 à 36 (`correspondance-notes-syscohada-3.ts`).
 * La concaténation suit l'ordre officiel ; le spec voisin vérifie que
 * l'ensemble couvre exactement la liste, sans doublon et sans code
 * inventé. Rien ici n'est partagé avec les notes SYCEBNL hormis le moteur
 * déclaratif (`note-annexe.types.ts`, CLAUDE.md §6).
 */
export const NOTES_SYSCOHADA: SpecificationNote[] = [...NOTES_SYSCOHADA_1, ...NOTES_SYSCOHADA_2, ...NOTES_SYSCOHADA_3];

/** Nombre de NUMÉROS DE TÊTE de la liste officielle (NOTE 1 à NOTE 36). */
export const NOMBRE_NOTES_SYSCOHADA = 36;

/**
 * Numéro de tête d'un code officiel : « 3A » → 3, « 16B bis » → 16, « 28 »
 * → 28. C'est lui que la fiche R4 et `NOMBRE_NOTES_SYSCOHADA` comptent ;
 * les lettres et le « bis » sont des sous-tableaux du même numéro.
 */
export function numeroDeTeteNoteSyscohada(code: string): number {
  const m = /^(\d+)/.exec(code.trim());
  if (!m) throw new Error(`code de note SYSCOHADA sans numéro de tête : « ${code} »`);
  return Number(m[1]);
}

/** Toutes les spécifications d'un code (une note à plusieurs tableaux en a plusieurs). */
export function notesSyscohadaDuCode(code: string): SpecificationNote[] {
  return NOTES_SYSCOHADA.filter((n) => n.code === code);
}
