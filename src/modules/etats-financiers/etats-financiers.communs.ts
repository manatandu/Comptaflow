import { NotFoundException } from '@nestjs/common';
import { ClasseCompte, TypeCompteDetailTotal } from '@prisma/client';
import { EcritureService } from '../comptabilite/ecriture.service';
import { ExerciceService } from '../exercice/exercice.service';
import { avantSoldeDesComptesDeGestion } from '../comptabilite/balance-trois-colonnes';

/**
 * Aides communes aux états financiers, extraites ici lors de la construction
 * du jeu « projets de développement » (2026-08-28) pour ne pas dupliquer une
 * logique déjà écrite et testée pour le jeu « associations ». Elles servent
 * aujourd'hui les trois jeux SYCEBNL (associations, projets, Système minimal
 * de trésorerie) et, au-delà, les états SYSCOHADA des deux systèmes, les
 * notes annexes, les états IFRS, la consolidation et le registre des
 * donateurs · tous lisent ainsi la balance de la même façon (audit final
 * F212, le commentaire annonçait encore un Système minimal « non construit »).
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
export function correspond(numero: string, prefixes: readonly string[], exclusions: readonly string[] = []): boolean {
  return prefixes.some((p) => numero.startsWith(p)) && !exclusions.some((e) => numero.startsWith(e));
}

/**
 * LE REFUS D'UN EXERCICE INCONNU DU DOSSIER, en un seul texte (audit final
 * F222). Les états des deux référentiels le posent, et les exports lisent
 * l'identité du dossier EN MÊME TEMPS que les états (`Promise.all`) · la
 * première lecture qui échoue fait la réponse, et elle doit être la même,
 * statut et message, quel que soit l'ordre d'arrivée.
 */
export const MOTIF_EXERCICE_INTROUVABLE =
  'Exercice introuvable dans ce dossier : aucun état financier ne peut être établi.';

/**
 * Exercice « N-1 » d'un bilan/compte de résultat (ou compte d'exploitation) :
 * celui du même tenant dont la date de début est la plus récente PARMI
 * celles antérieures à l'exercice demandé. `null` si aucun (premier
 * exercice du dossier) · le comparatif reste alors simplement absent
 * (`undefined`), jamais un faux zéro qui laisserait croire à un exercice
 * antérieur réel et vide.
 *
 * L'EXERCICE DEMANDÉ DOIT ÊTRE DU DOSSIER, sinon c'est un refus (audit final
 * F222). La balance ne vérifie pas l'exercice qu'on lui passe : un
 * identifiant inconnu, ou celui d'un autre dossier, rendait un bilan tout à
 * zéro, dit équilibré et sans comparatif · une réponse fausse, présentable,
 * là où il fallait un 404. Les états qui cherchent leur comparatif
 * l'appellent avant de lire la balance, c'est donc ici que le refus se pose.
 */
export async function trouverExerciceN1(
  exerciceService: ExerciceService,
  tenantId: string,
  exerciceId: string,
): Promise<string | null> {
  const exercices = await exerciceService.lister(tenantId); // triés par dateDebut décroissant
  const courant = exercices.find((e) => e.id === exerciceId);
  if (!courant) {
    throw new NotFoundException(MOTIF_EXERCICE_INTROUVABLE);
  }
  const anterieur = exercices.find((e) => e.dateDebut < courant.dateDebut);
  return anterieur?.id ?? null;
}

/**
 * LIGNES DE BALANCE CUMULÉES DEPUIS L'ORIGINE, arrêtées à la fin d'un
 * exercice · voir `EcritureService.balanceCumulee` pour les deux règles de
 * lecture (report à-nouveau exclu, bilan d'ouverture conservé). Même filtre
 * de comptes TOTAL que `chargerLignes`, et pour la même raison.
 */
export async function chargerLignesCumulees(
  ecritureService: EcritureService,
  tenantId: string,
  exerciceId: string | null,
): Promise<LigneBalancePourEtat[]> {
  if (!exerciceId) return [];
  const { lignes } = await ecritureService.balanceCumulee(tenantId, exerciceId, false);
  return lignes.filter((l) => l.typeCompte !== TypeCompteDetailTotal.TOTAL);
}

export async function chargerLignes(
  ecritureService: EcritureService,
  tenantId: string,
  exerciceId: string | null,
  // Situation intermédiaire · ch. 39. Borne la lecture aux écritures dont la
  // date comptable est antérieure ou égale. Absente, l'exercice est lu en
  // entier, comme toujours.
  arreteAu?: Date,
): Promise<LigneBalancePourEtat[]> {
  if (!exerciceId) return [];
  // `false` : les états financiers sont des documents légaux et ne lisent que
  // le livre-journal. Une écriture restée en brouillard n'y est pas encore
  // entrée · un bilan bâti dessus n'engagerait personne (voir
  // EcritureService.balance et StatutEcriture dans le schéma).
  const { lignes } = await ecritureService.balance(tenantId, exerciceId, false, arreteAu);
  // AVANT L'ÉCRITURE QUI SOLDE LES COMPTES DE GESTION · validée depuis F4, elle
  // ramenait à zéro le compte de résultat de tout exercice clos
  // (`avantSoldeDesComptesDeGestion`).
  //
  // GARDE-FOU CONSERVÉ, ET REDONDANT PAR CONSTRUCTION · la balance ne rend
  // plus que des comptes de détail depuis qu'elle a cessé de sous-totaliser
  // par compte principal. Le filtre reste parce qu'un agrégat compté en plus
  // de ses enfants double des montants EN SILENCE · une assurance d'une ligne
  // contre la catégorie de bug que ce projet ne peut pas se permettre.
  return avantSoldeDesComptesDeGestion(lignes).filter((l) => l.typeCompte !== TypeCompteDetailTotal.TOTAL);
}
