import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MODELES_CLOISONNES } from '../cloisonnement/modeles-cloisonnes';

/**
 * SUPPRESSION D'UNE STRUCTURE · refusée tant que quoi que ce soit s'y réfère.
 *
 * La règle est celle de Sage 100 i7 (manuel de formation, plan comptable) :
 * « Il n'est pas possible de supprimer un compte mouvementé sur l'exercice en
 * cours ou sur un autre exercice ou encore utilisé dans une autre commande du
 * menu Fichier ou Structure (par exemple, un compte utilisé dans les Taux de
 * taxes). »
 *
 * POURQUOI NE PAS S'EN REMETTRE À LA BASE. Sur une relation OBLIGATOIRE, la
 * clé étrangère refuse (RESTRICT) · mais sur une relation FACULTATIVE, Prisma
 * pose SET NULL et la base DÉNOUE le lien sans erreur. Supprimer un taux de
 * TVA effacerait en silence le taux porté par les lignes d'écriture, qui
 * sortiraient de la déclaration ; supprimer un compte de trésorerie laisserait
 * son journal sans contrepartie. C'est le premier défaut du § 10 bis du dépôt,
 * et la raison pour laquelle on compte les références avant de supprimer.
 *
 * LA LISTE DES RELATIONS EST LUE DANS LE SCHÉMA (DMMF), jamais écrite à la
 * main · une table ajoutée demain qui pointe vers un compte sera comptée sans
 * que personne ait à y penser. C'est l'inverse de la liste des modules qui
 * retiennent une écriture (§ 10 bis), et c'est voulu : là il fallait DÉCIDER
 * si un module retient, ici tout lien retient, sans exception.
 */

export interface Reference {
  modele: string;
  champ: string;
  nombre: number;
}

/** Libellés lisibles des usages les plus courants · le reste garde son nom de table. */
const LIBELLES: Record<string, string> = {
  'LigneEcriture.compteId': "lignes d'écriture (compte mouvementé)",
  'LigneEcriture.tauxTvaId': "lignes d'écriture portant ce taux",
  'Lettrage.compteId': 'lettrages',
  'RapprochementBancaire.compteId': 'rapprochements bancaires',
  'Ecriture.journalId': 'écritures (journal mouvementé)',
  'Journal.compteTresorerieId': 'journaux de trésorerie',
  'TauxTva.compteCollecteId': 'taux de taxes (TVA collectée)',
  'TauxTva.compteDeductibleId': 'taux de taxes (TVA déductible)',
  'Compte.tauxTvaDefautId': 'comptes qui le proposent par défaut',
  'TiersCompte.compteId': 'rattachement à un tiers',
  'LigneModeleSaisie.compteId': 'modèles de saisie',
  'TiersCompte.tiersId': 'comptes rattachés',
  'Relance.tiersId': 'relances',
  'Consignation.tiersId': 'consignations',
  'DocumentTiers.tiersId': 'documents attachés (volet Documents de la fiche)',
  'AvanceSalaire.salarieId': 'avances et prêts au personnel',
  'RibTiers.tiersId': 'coordonnées bancaires (volet de la fiche)',
  'LigneOrdreVirement.tiersId': 'ordres de virement',
  'OrdreVirement.journalId': 'ordres de virement',
  'LigneOrdreVirement.ecritureId': 'ordres de virement',
  'DemandeConfirmation.tiersId': 'demandes de confirmation',
  'ModeleSaisie.journalId': 'modèles de saisie',
  'Immobilisation.compteImmobilisationId': 'immobilisations',
  'FamilleImmobilisation.compteImmobilisationId': "familles d'immobilisations",
  'Facture.tiersId': 'factures',
  'Devis.tiersId': 'devis',
  'Cloture.journalId': 'clôtures de journal',
  'RibBanque.journalId': 'RIB bancaire rattaché (Structure > Banques)',
};

function relationsVers(cible: string, exclure: string[]) {
  const liens: { modele: string; champ: string; cloisonne: boolean }[] = [];
  for (const m of Prisma.dmmf.datamodel.models) {
    for (const f of m.fields) {
      if (f.kind !== 'object' || f.type !== cible) continue;
      const fk = f.relationFromFields ?? [];
      if (fk.length !== 1) continue;
      const cle = `${m.name}.${fk[0]}`;
      if (exclure.includes(cle)) continue;
      liens.push({ modele: m.name, champ: fk[0], cloisonne: MODELES_CLOISONNES.has(m.name) });
    }
  }
  return liens;
}

/** Compte, relation par relation, ce qui se réfère à `id`. Seules les relations non nulles sont rendues. */
export async function referencesVers(
  prisma: unknown,
  cible: string,
  id: string,
  tenantId: string,
  exclure: string[] = [],
): Promise<Reference[]> {
  const client = prisma as Record<string, { count: (a: { where: Record<string, unknown> }) => Promise<number> }>;
  const refs: Reference[] = [];
  for (const lien of relationsVers(cible, exclure)) {
    const delegue = client[lien.modele.charAt(0).toLowerCase() + lien.modele.slice(1)];
    // Borne du dossier sur toute table cloisonnée · la garde de cloisonnement
    // refuse une collection qui ne la porte pas, et elle aurait raison.
    const where: Record<string, unknown> = { [lien.champ]: id };
    if (lien.cloisonne) where.tenantId = tenantId;
    const nombre = await delegue.count({ where });
    if (nombre > 0) refs.push({ modele: lien.modele, champ: lien.champ, nombre });
  }
  return refs;
}

export function libelleReference(r: Reference): string {
  return `${LIBELLES[`${r.modele}.${r.champ}`] ?? r.modele} (${r.nombre})`;
}

/** Lève le refus nommé si la liste n'est pas vide. */
export function refuserSiReferences(objet: string, refs: Reference[]) {
  if (refs.length === 0) return;
  throw new ConflictException(
    `${objet} ne peut pas être supprimé · il est utilisé : ${refs.map(libelleReference).join(', ')}. ` +
      'Mettez-le en sommeil pour qu’il ne soit plus proposé.',
  );
}

/**
 * FUSION · reporte sur `cibleId` TOUT ce qui se réfère à `sourceId`, relation
 * par relation, lue dans le schéma comme pour la suppression · une table
 * ajoutée demain qui pointe vers un tiers sera reportée sans que personne ait
 * à y penser, là où une liste écrite à la main l'oublierait et bloquerait la
 * suppression du doublon sur une erreur de clé étrangère.
 */
export async function reporterReferences(
  prisma: unknown,
  cible: string,
  sourceId: string,
  cibleId: string,
  tenantId: string,
): Promise<Reference[]> {
  const client = prisma as Record<
    string,
    { updateMany: (a: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<{ count: number }> }
  >;
  const reportees: Reference[] = [];
  for (const lien of relationsVers(cible, [])) {
    const delegue = client[lien.modele.charAt(0).toLowerCase() + lien.modele.slice(1)];
    const where: Record<string, unknown> = { [lien.champ]: sourceId };
    if (lien.cloisonne) where.tenantId = tenantId;
    const { count } = await delegue.updateMany({ where, data: { [lien.champ]: cibleId } });
    if (count > 0) reportees.push({ modele: lien.modele, champ: lien.champ, nombre: count });
  }
  return reportees;
}
