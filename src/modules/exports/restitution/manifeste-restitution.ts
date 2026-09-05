import { TABLES_RESTITUEES, fichierDeLaTable, ordreDuModele } from './tables-restitution';
import { MODELES_AUDITES } from '../../../common/audit/champs-audites';

export interface EnTeteManifeste {
  dossier: { id: string; nom: string; referentiel: string };
  demandeePar: string;
  horodatage: string;
  maillon: { rang: number; empreinte: string };
  lignesParTable: Record<string, number>;
}

/**
 * LE MANIFESTE · ce que l'archive EST, et surtout ce qu'elle N'EST PAS.
 *
 * Une archive qui se présente pour plus qu'elle ne vaut est plus dangereuse
 * que pas d'archive du tout · un bailleur ou un successeur qui la prendrait
 * pour la conservation légale détruirait les classeurs papier. Chacune des
 * limites ci-dessous a été vérifiée dans le code ou dans le texte, et aucune
 * n'est adoucie.
 */
export function ecrireManifeste(e: EnTeteManifeste): string {
  const auditees = [...MODELES_AUDITES].sort();
  const nonAuditees = TABLES_RESTITUEES.filter((t) => !MODELES_AUDITES.has(t)).sort();
  const total = Object.values(e.lignesParTable).reduce((a, b) => a + b, 0);
  return `# Restitution du dossier · ${e.dossier.nom}

Dossier         : ${e.dossier.nom} (${e.dossier.id})
Référentiel     : ${e.dossier.referentiel}
Demandée par    : ${e.demandeePar}
Produite le     : ${e.horodatage}
Maillon d'audit : rang ${e.maillon.rang}, empreinte ${e.maillon.empreinte}
Contenu         : ${TABLES_RESTITUEES.length} tables, ${total.toLocaleString('fr-FR')} lignes

Le maillon ci-dessus est inscrit dans la chaîne d'audit du dossier. Il
rattache cette copie à l'acte qui l'a produite, et il n'est pas retouchable
sans que la vérification de la chaîne le voie.

## Ce que contient cette archive

Un fichier CSV par table, séparateur point-virgule, encodage UTF-8, guillemets
selon la RFC 4180 · un champ contenant un point-virgule, un guillemet ou un
retour à la ligne est protégé, et un guillemet interne est doublé.

Les colonnes sont celles du schéma, moins deux, retirées à dessein :
\`User.motDePasse\` (l'empreinte du mot de passe) et
\`User.estOperateurPlateforme\` (le drapeau qui désigne le compte de
l'éditeur). Aucune autre colonne n'est retirée.

## CE QUE CETTE ARCHIVE N'EST PAS

**Elle ne satisfait pas à elle seule à l'obligation de conservation.** L'AUDCIF
art. 24 veut que « les livres comptables ou les documents qui en tiennent lieu,
ainsi que les pièces justificatives » soient conservés dix ans, et l'art. 17,
3° veut les pièces « datées, conservées, classées dans un ordre défini dans le
manuel ». OmegaX ne détient AUCUNE pièce justificative numérisée · aucune
colonne du schéma n'en stocke. Les classeurs papier restent la conservation.

**Elle n'a pas la valeur probante du papier en RDC.** Notes d'organisation
comptable du CPCC, § 1.5.3 b), première phrase : « Les écrits électroniques ne
sont pas encore admis en preuve au même titre que l'écrit papier en RDC. »

**Elle ne fixe aucun délai de conservation.** Le même § 1.5.3 constate
« l'absence de délai fixe unique » · trente ans en droit civil, cinq ans en
droit commercial, de un à quinze ans en droit fiscal. Afficher un délai sur
cette archive reviendrait à choisir à la place du cabinet.

**Ce n'est pas une réversibilité.** Trois types d'import existent aujourd'hui
dans OmegaX · plan de comptes, balance, écritures. Les autres tables de cette
archive n'ont AUCUN chemin de réimport. Elles se lisent, elles ne se
rechargent pas.

**Les CSV ne sont pas le livre-journal chronologique.** Chaque table est lue
dans l'ordre de sa clé, qui est un identifiant aléatoire et non une date :
l'ordre d'un CSV est ARBITRAIRE. La chronologie qu'exigent l'AUDCIF art. 17,
4° et art. 22, 3° est portée par les états produits par le menu État
(journal, grand livre, balance, livre d'inventaire), pas par cette archive.
Seul \`${fichierDeLaTable('EvenementAudit')}\` fait exception et se lit par son
rang, sans quoi sa chaîne d'empreintes serait invérifiable.

**Ce n'est pas un instantané.** Les tables sont lues l'une après l'autre, sans
transaction commune. Un dossier en cours d'usage pendant l'extraction peut
donc produire une archive dont deux tables ne se correspondent pas
exactement. Extraire un dossier au repos, ou suspendu, est la seule façon
d'obtenir un ensemble cohérent au centime.

**Le journal d'audit ne couvre pas tout.** ${auditees.length} modèles sur
${TABLES_RESTITUEES.length + 1} laissent un maillon. Les ${nonAuditees.length}
suivants n'en laissent aucun, et leur historique n'est donc pas dans cette
archive :

${nonAuditees.map((t) => `- ${t}`).join('\n')}

## Décisions d'OmegaX, et non règles de droit

Aucun texte lu n'impose la restitution d'un dossier complet, n'en fixe le
format, ne dit qui a qualité pour la demander, ni ce que doit contenir un
manifeste. Le format ZIP, le périmètre des tables, la réserve du geste à
l'administrateur du cabinet et le contenu de cette page sont des choix
d'OmegaX. Ils sont écrits ici comme tels pour qu'on ne les prenne pas pour
autre chose.

Le fait de tracer l'extraction dans la chaîne d'audit, en revanche, s'appuie
sur l'AUDCIF art. 22, 6° · « permettant la reconstitution du chemin de
révision ». L'art. 3 du SYCEBNL n'écarte pas l'art. 22 : l'obligation vaut
pour les deux référentiels.

## Inventaire

${TABLES_RESTITUEES.map(
  (t) =>
    `- ${fichierDeLaTable(t)} · ${(e.lignesParTable[t] ?? 0).toLocaleString('fr-FR')} lignes, ordre ${ordreDuModele(t)}`,
).join('\n')}
`;
}
