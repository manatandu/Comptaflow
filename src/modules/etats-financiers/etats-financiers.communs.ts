import { ClasseCompte, TypeCompteDetailTotal } from '@prisma/client';
import { EcritureService } from '../comptabilite/ecriture.service';
import { ExerciceService } from '../exercice/exercice.service';

/**
 * Aides communes aux DEUX jeux d'états financiers SYCEBNL construits à ce
 * jour · « associations et ordres professionnels » (`etats-financiers.service.ts`)
 * et « projets de développement et assimilés » (`etats-financiers-projet.service.ts`)
 * · extraites ici lors de la construction du second jeu (2026-08-28) pour ne
 * pas dupliquer une logique déjà écrite et testée pour le premier. Le
 * Système Minimal de Trésorerie (3ᵉ jeu) n'est pas construit ; il pourra
 * réutiliser ces mêmes aides le jour où il le sera.
 */

/** Un compte rattaché à un poste, avec sa contribution · permet le drill-down. */
export interface CompteDuPoste {
  numero: string;
  intitule: string;
  montant: number;
}

/** Une ligne de balance déjà agrégée par compte (voir EcritureService.balance()). */
export interface LigneBalancePourEtat {
  compteId: string;
  numero: string;
  intitule: string;
  classe: ClasseCompte;
  typeCompte: TypeCompteDetailTotal;
  totalDebit: number;
  totalCredit: number;
  /** Report à-nouveau (écritures de clôture) · l'ouverture, pour un compte de bilan. */
  reportDebit: number;
  reportCredit: number;
  /** Mouvements propres de l'exercice, report à-nouveau exclu. */
  mouvementDebit: number;
  mouvementCredit: number;
  solde: number;
}

/**
 * Un compte correspond à un poste si son numéro commence par l'un des
 * préfixes du poste ET par aucun de ses préfixes exclus (§ convention de
 * lecture, `correspondance-bilan.ts` / `correspondance-projet-bilan.ts`).
 */
export function correspond(numero: string, prefixes: string[], exclusions: string[] = []): boolean {
  return prefixes.some((p) => numero.startsWith(p)) && !exclusions.some((e) => numero.startsWith(e));
}

/**
 * Exercice « N-1 » d'un bilan/compte de résultat (ou compte d'exploitation) :
 * celui du même tenant dont la date de début est la plus récente PARMI
 * celles antérieures à l'exercice demandé. `null` si aucun (premier
 * exercice du dossier) · le comparatif reste alors simplement absent
 * (`undefined`), jamais un faux zéro qui laisserait croire à un exercice
 * antérieur réel et vide.
 */
export async function trouverExerciceN1(
  exerciceService: ExerciceService,
  tenantId: string,
  exerciceId: string,
): Promise<string | null> {
  const exercices = await exerciceService.lister(tenantId); // triés par dateDebut décroissant
  const courant = exercices.find((e) => e.id === exerciceId);
  if (!courant) return null;
  const anterieur = exercices.find((e) => e.dateDebut < courant.dateDebut);
  return anterieur?.id ?? null;
}

export async function chargerLignes(
  ecritureService: EcritureService,
  tenantId: string,
  exerciceId: string | null,
): Promise<LigneBalancePourEtat[]> {
  if (!exerciceId) return [];
  // `false` : les états financiers sont des documents légaux et ne lisent que
  // le livre-journal. Une écriture restée en brouillard n'y est pas encore
  // entrée · un bilan bâti dessus n'engagerait personne (voir
  // EcritureService.balance et StatutEcriture dans le schéma).
  const { lignes } = await ecritureService.balance(tenantId, exerciceId, false);
  // GARDE-FOU CONSERVÉ, ET REDONDANT PAR CONSTRUCTION · la balance ne rend
  // plus que des comptes de détail depuis qu'elle a cessé de sous-totaliser
  // par compte principal. Le filtre reste parce qu'un agrégat compté en plus
  // de ses enfants double des montants EN SILENCE · une assurance d'une ligne
  // contre la catégorie de bug que ce projet ne peut pas se permettre.
  return lignes.filter((l) => l.typeCompte !== TypeCompteDetailTotal.TOTAL);
}
