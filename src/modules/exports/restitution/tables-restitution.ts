import { Prisma } from '@prisma/client';
import { MODELES_CLOISONNES, MODELES_PORTES_PAR_LEUR_PARENT } from '../../../common/cloisonnement/modeles-cloisonnes';
import { colonnesNonRestituables } from '../../../common/audit/champs-audites';

/**
 * L'INVENTAIRE BORNÉ DES TABLES DU DOSSIER.
 *
 * LE NOMBRE N'EST PAS ÉCRIT ICI, ET C'EST VOULU · il a été faux deux fois
 * (« 55 » pour 76, puis 76 pour 78), et un décompte périmé dans un
 * commentaire se lit comme une garantie. Le seul décompte EN DUR vit dans
 * `lecture-bornee.spec.ts`, où il a pour fonction de TOMBER : un modèle
 * ajouté au schéma doit obliger quelqu'un à décider par quelle borne il se
 * lit.
 *
 * LE DANGER QUE CE FICHIER EXISTE POUR ÉCARTER. La garde de cloisonnement
 * commence par `if (!MODELES_CLOISONNES.has(model)) return query(args)` · les
 * quinze modèles PORTÉS PAR LEUR PARENT n'ont pas de colonne `tenantId`, ils
 * ne sont donc pas dans cette liste, et LA GARDE NE LES REGARDE PAS DU TOUT.
 * Un `ligneEcriture.findMany({})` écrit ici rapatrierait les lignes
 * d'écriture de TOUS les cabinets. Sans erreur, sans 403, sans trace :
 * l'archive s'ouvrirait, chaque CSV bouclerait, et elle contiendrait la
 * comptabilité d'un autre client. C'est le pire défaut que ce chantier
 * puisse produire.
 *
 * CE QU'ON N'A PAS FAIT, ET POURQUOI. Ajouter les quinze modèles à la garde
 * aurait obligé à borner par relation les centaines d'appels existants qui
 * filtrent par clé étrangère (`{ ecritureId }`, `{ lettrageId }`) · un
 * refactor massif pour un risque qui, aujourd'hui, ne se réalise nulle part.
 * On rend plutôt la lecture non bornée IRREPRÉSENTABLE ICI : l'extracteur ne
 * construit jamais son propre `where`, il le demande à `borneDuModele`, et un
 * test vérifie chaque borne avec `filtreBorne`, la fonction du moteur
 * elle-même. Pas un `grep` sur la source · la fonction qui décide.
 */

/**
 * La relation OBLIGATOIRE par laquelle chaque modèle porté rejoint un modèle
 * qui, lui, a un `tenantId`.
 *
 * OBLIGATOIRE, et c'est la condition qui compte · borner par une relation
 * facultative perdrait en silence toutes les lignes où elle est nulle, et
 * l'archive serait incomplète sans que rien ne le dise. `DotationAmortissement`
 * a bien une `ecriture`, mais c'est son `immobilisation` qui la possède.
 *
 * `VentilationAnalytique` est le seul cas à deux étages · son parent
 * obligatoire est une `LigneEcriture`, elle-même portée. La borne descend
 * donc jusqu'à l'écriture. Passer par sa `section` bornerait aussi, mais
 * dirait une possession qui n'est pas la sienne.
 */
export const BORNES_PORTEES: Readonly<Record<string, readonly string[]>> = {
  BudgetSection: ['section'],
  CoursDevise: ['devise'],
  DepreciationImmobilisation: ['immobilisation'],
  DotationAmortissement: ['immobilisation'],
  EcheanceAbonnement: ['abonnement'],
  EcheanceReglement: ['modeleReglement'],
  ExecutionEngagement: ['engagement'],
  LigneAffectation: ['affectation'],
  LigneDevis: ['devis'],
  LigneEcriture: ['ecriture'],
  LigneFacture: ['facture'],
  LigneModeleSaisie: ['modele'],
  RapportBailleur: ['convention'],
  ReclassementImmobilisation: ['immobilisation'],
  TiersCompte: ['tiers'],
  TrancheFinancement: ['convention'],
  VentilationAnalytique: ['ligne', 'ecriture'],
};

/** Levée quand on demande la borne d'un modèle que l'inventaire ne connaît pas. */
export class ModeleSansBorne extends Error {
  constructor(modele: string) {
    super(
      `Aucune borne de dossier déclarée pour ${modele}. Un modèle ajouté au schéma doit être ` +
        'classé dans BORNES_PORTEES ou porter un tenantId · le lire sans borne rendrait les ' +
        'lignes de tous les cabinets.',
    );
    this.name = 'ModeleSansBorne';
  }
}

/**
 * Le `where` qui borne un modèle au dossier · `{ tenantId }` s'il en porte
 * un, le chemin de relations sinon. Lève plutôt que de rendre `{}` : un
 * filtre vide est précisément la panne qu'on écarte.
 */
export function borneDuModele(modele: string, tenantId: string): Record<string, unknown> {
  if (MODELES_CLOISONNES.has(modele)) return { tenantId };
  const chemin = BORNES_PORTEES[modele];
  if (!chemin) throw new ModeleSansBorne(modele);
  return chemin.reduceRight<Record<string, unknown>>(
    (interieur, relation) => ({ [relation]: interieur }),
    { tenantId },
  );
}

/**
 * L'ORDRE DE LECTURE, et ce qu'il vaut.
 *
 * Par défaut `id` · c'est un uuid v4, donc un ordre ARBITRAIRE et non
 * chronologique. Le manifeste doit le dire : le CSV d'une table n'est pas un
 * livre-journal, la chronologie de l'AUDCIF art. 17, 4° et art. 22, 3° est
 * portée par les classeurs joints, pas par lui.
 *
 * `EvenementAudit` fait exception et se lit par `rang` · c'est le rang qui
 * porte la chaîne d'empreintes (`@@unique([tenantId, rang])`), et un journal
 * d'audit servi dans l'ordre des uuid serait invérifiable par son lecteur.
 */
export const ORDRE_PAR_MODELE: Readonly<Record<string, string>> = {
  EvenementAudit: 'rang',
};

export function ordreDuModele(modele: string): string {
  return ORDRE_PAR_MODELE[modele] ?? 'id';
}

/**
 * Les colonnes SCALAIRES d'un modèle, dans l'ordre du schéma, moins celles
 * que le dossier ne recopie jamais (voir COLONNES_EXCLUES_PAR_MODELE ·
 * `User.motDePasse` et `User.estOperateurPlateforme`).
 *
 * Lues dans le DMMF de Prisma plutôt qu'écrites à la main · une colonne
 * ajoutée au schéma entre donc d'elle-même dans l'archive, alors qu'une liste
 * recopiée l'aurait laissée dehors sans rien dire. Les relations sont
 * écartées : leur clé étrangère est déjà là, et les suivre dupliquerait la
 * table voisine dans chaque ligne.
 */
export function colonnesDuModele(modele: string): string[] {
  const description = Prisma.dmmf.datamodel.models.find((m) => m.name === modele);
  if (!description) throw new ModeleSansBorne(modele);
  // LA LISTE DE LA RESTITUTION, PAS CELLE DU JOURNAL. Les deux ont divergé
  // avec le registre du personnel : le journal masque la date de naissance,
  // l'archive DOIT la rendre · elle appartient au dossier. Reprendre ici la
  // liste du journal amputerait l'archive en silence, et elle se dirait
  // complète. Voir `COLONNES_JAMAIS_RESTITUEES`.
  const exclues = colonnesNonRestituables(modele);
  // UNE COLONNE BINAIRE N'ENTRE PAS DANS UN CSV · un document de 5 Mo y
  // deviendrait une cellule de 7 Mo en base64, et un lot de 2 000 lignes
  // tiendrait 10 Go en mémoire. Le fichier sort À CÔTÉ, un par entrée de
  // l'archive (`fichierDuDocument`), et le CSV garde son empreinte.
  return description.fields
    .filter((f) => (f.kind === 'scalar' && f.type !== 'Bytes') || f.kind === 'enum')
    .map((f) => f.name)
    .filter((n) => !exclues.has(n.toLowerCase()));
}

/**
 * Les tables à restituer, dans un ordre stable · les cloisonnées d'abord,
 * puis les portées. `Tenant` n'y est PAS : le dossier lui-même est une ligne
 * unique, servie par le manifeste, et le lire comme une collection
 * demanderait une borne `{ id }` que `filtreBorne` ne reconnaîtrait pas.
 */
export const TABLES_RESTITUEES: readonly string[] = [
  ...[...MODELES_CLOISONNES].sort(),
  ...[...MODELES_PORTES_PAR_LEUR_PARENT].sort(),
];

/** Le nom de fichier d'une table dans l'archive · stable et sans surprise. */
export function fichierDeLaTable(modele: string): string {
  return `tables/${modele.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}.csv`;
}

/**
 * L'entrée d'archive d'un document attaché à un tiers (point 21) · préfixée de
 * son identifiant, qui la relie à sa ligne de `tables/document-tiers.csv`
 * (empreinte SHA-256 comprise), deux pièces pouvant porter le même nom.
 */
export function fichierDuDocument(id: string, nomFichier: string): string {
  return `documents-tiers/${id}-${nomFichier.replace(/[\\/]/g, '_')}`;
}
