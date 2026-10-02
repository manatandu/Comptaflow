import type { ContrepartieAdmise } from './compte-du-bien';
import { RETENUS } from './comptes-proposes';

/**
 * LES LISTES « CONTREPARTIE » DU MODULE IMMOBILISATIONS (libellé « Réglé par »
 * jusqu'au 2026-10-02 · la liste admet aussi un fournisseur, un apport ou un
 * fonds, que « réglé » ne dit pas ; décision D2 du suivi, le nom du code
 * gardé) · renouvellement d'un
 * composant, remplacement imprévu d'une partie non identifiée, acquisition à
 * prix global. Elles proposaient TOUT le plan de détail (`/comptes?typeCompte=
 * DETAIL`) · une charge, un client ou une TVA s'y choisissait, et le serveur
 * refusait ensuite au nom de la fiche du compte du bien. Un écran qui propose
 * ce que le serveur refuse fait chercher le bon compte par essais.
 *
 * LA LISTE N'EST PAS « LA CLASSE 5 ». Les trois opérations passent par la
 * même garde que la création d'une fiche (`motifRefusContrepartie`,
 * `src/modules/immobilisations/contrepartie-acquisition.ts`, appelée par
 * `creer`, que `renouveler` et `remplacerPartieNonIdentifiee` appellent, et
 * bien par bien par `acquerirAPrixGlobal`). Elle admet, d'après les fiches des
 * comptes 21 à 24 (AUDCIF, Titre VII ; SYCEBNL, Partie 2 ch. 3), « les comptes
 * de tiers et de trésorerie concernés », le capital ou la dotation, et ce que
 * la fiche du bien ajoute. Restreindre à la trésorerie interdirait l'achat à
 * crédit au fournisseur d'immobilisations, que le texte admet. L'écran sert
 * donc la liste fermée que le SERVEUR calcule pour le bien
 * (`GET /immobilisations/contreparties-acquisition`), jamais une seconde copie
 * de la règle.
 *
 * LISTE DE CHOIX · le serveur n'y rend que les comptes RETENUS ou UTILISÉS
 * (`retenus=true`, décision du 2026-09-28) · un compte admis mais jamais
 * retenu reste admis au serveur, il attend seulement d'être retenu dans Plan
 * comptable, et la liste vide le dit.
 *
 * PLUSIEURS BIENS, UNE SEULE CONTREPARTIE · le prix global crédite un même
 * compte pour chaque fiche, et le serveur vérifie la contrepartie bien par
 * bien avant la première · la liste proposée est l'INTERSECTION des listes.
 */

/** Ce qui désigne le bien dont la fiche admet la contrepartie. */
export interface CibleReglePar {
  /** La famille du bien (renouvellement, remplacement), ou null. */
  familleId?: string | null;
  /** Le compte du bien (prix global), ou null tant qu'il n'est pas choisi. */
  compteImmobilisationId?: string | null;
  /**
   * Le type du composant · il ouvre sa propre contrepartie (le démantèlement
   * au SYSCOHADA). Absent, le serveur lit une structure ordinaire.
   */
  typeComposant?: string | null;
}

/**
 * L'adresse de la liste fermée pour une cible, ou null si le bien n'est pas
 * encore désigné. Le serveur exige l'un des deux identifiants, jamais les deux.
 */
export function adresseContrepartiesAdmises(cible: CibleReglePar): string | null {
  const parametres: string[] = [];
  if (cible.compteImmobilisationId) parametres.push(`compteImmobilisationId=${encodeURIComponent(cible.compteImmobilisationId)}`);
  else if (cible.familleId) parametres.push(`familleId=${encodeURIComponent(cible.familleId)}`);
  else return null;
  if (cible.typeComposant) parametres.push(`typeComposant=${encodeURIComponent(cible.typeComposant)}`);
  parametres.push(RETENUS);
  return `/immobilisations/contreparties-acquisition?${parametres.join('&')}`;
}

/**
 * Les contreparties admises pour TOUS les biens, dans l'ordre de la première
 * liste. Null tant qu'une liste n'est pas lue · null n'est pas vide, et une
 * intersection calculée sur une liste manquante dirait « aucun compte » à tort.
 */
export function contrepartiesCommunes(listes: (ContrepartieAdmise[] | null)[]): ContrepartieAdmise[] | null {
  if (listes.length === 0 || listes.some((l) => l === null)) return null;
  const [premiere, ...autres] = listes as ContrepartieAdmise[][];
  return premiere.filter((c) => autres.every((l) => l.some((x) => x.id === c.id)));
}

export interface EtatReglePar {
  /** Les comptes proposés · vide tant que rien n'est lu ou si rien n'est admis. */
  options: ContrepartieAdmise[];
  /** Le compte à présélectionner quand il est seul admis, sinon null. */
  preselection: string | null;
  /** Vrai pendant la lecture · la liste vide ne dit alors rien. */
  enLecture: boolean;
  /** Pourquoi la liste est vide et ce qu'il faut faire d'abord, ou null. */
  motif: string | null;
}

/**
 * L'ÉTAT DE LA LISTE, avec sa raison quand elle est vide (§ 9 ter · une liste
 * qui dépend d'un choix dit pourquoi elle est vide et ce qu'il faut faire
 * d'abord ; un choix unique se présélectionne).
 *
 * `listes[i]` répond à `cibles[i]` · null, pas encore lue (ou cible non
 * désignée). `erreur` · l'échec de lecture, qui se dit et n'est jamais lu
 * comme une liste vide.
 */
export function etatReglePar(
  cibles: CibleReglePar[],
  listes: (ContrepartieAdmise[] | null)[],
  erreur: string | null,
): EtatReglePar {
  const vide = (motif: string | null, enLecture = false): EtatReglePar => ({ options: [], preselection: null, enLecture, motif });
  if (cibles.length === 0 || cibles.some((c) => adresseContrepartiesAdmises(c) === null)) {
    return vide(
      cibles.length > 1
        ? "Choisissez d'abord le compte de chaque bien · les comptes de règlement admis dépendent de la nature du bien."
        : "Choisissez d'abord le compte du bien · les comptes de règlement admis dépendent de sa nature.",
    );
  }
  if (erreur) return vide(`Comptes de règlement illisibles · ${erreur}`);
  const communes = contrepartiesCommunes(listes);
  if (communes === null) return vide(null, true);
  if (communes.length === 0) {
    return vide(
      cibles.length > 1
        ? "Aucun compte retenu ou utilisé n'est admis à la fois pour tous ces biens · retenez dans Plan comptable un compte de trésorerie, admis pour chacun (ou ouvrez-le s'il manque au plan), ou saisissez les biens séparément."
        : "Aucun compte que la fiche du compte du bien admet en contrepartie n'est retenu ni utilisé · retenez dans Plan comptable le compte de trésorerie ou de fournisseur d'immobilisations (ou ouvrez-le s'il manque au plan).",
    );
  }
  return { options: communes, preselection: communes.length === 1 ? communes[0].id : null, enLecture: false, motif: null };
}
