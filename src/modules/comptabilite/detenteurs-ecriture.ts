/**
 * QUI RETIENT UNE ÉCRITURE, ET QUI LA LAISSE PARTIR · la décision, colonne par
 * colonne (audit du serveur I1).
 *
 * CLAUDE.md § 10 bis veut qu'une relation nouvelle vers une écriture « oblige
 * quelqu'un à décider si son module retient l'écriture ou la laisse partir ».
 * La liste des détenteurs était pourtant écrite à la main dans
 * `EcritureService.detenteursDe` sans que rien ne force cette décision, et
 * elle avait déjà oublié le reclassement d'immobilisation · l'écriture passait
 * la garde, puis la clé RESTRICT levait en base, et l'utilisateur recevait
 * une erreur brute au lieu du refus nommé.
 *
 * Deux listes, et `detenteurs-ecriture.spec.ts` relit `schema.prisma` · toute
 * relation vers `Ecriture` doit figurer dans l'une ou l'autre, jamais dans les
 * deux, et chaque détenteur doit être compté par `detenteursDe`.
 *
 * TABLE DE DÉCISION, LUE PAR SON SEUL SPEC · le service ne l'importe pas, le
 * spec confronte ce qu'il fait à ce qui est décidé ici. Gelée à ce titre dans
 * `common/fichiers-sans-appelant.spec.ts` (audit du serveur, C1).
 */

/** Colonnes (« Modèle.colonne ») dont le module RETIENT l'écriture. */
export const COLONNES_QUI_RETIENNENT: readonly string[] = [
  'Immobilisation.ecritureAcquisitionId',
  'Immobilisation.ecritureSortieId',
  'Immobilisation.ecritureProduitCessionId',
  'DotationAmortissement.ecritureId',
  'DepreciationImmobilisation.ecritureId',
  'ReclassementImmobilisation.ecritureId',
  'Reevaluation.ecritureEcartsId',
  'Reevaluation.ecritureProvisionId',
  'Reevaluation.ecritureExtourneId',
  'Regularisation.ecritureConstatationId',
  'Regularisation.ecritureRepriseId',
  'EcheanceAbonnement.ecritureId',
  'LiquidationTva.ecritureId',
  'Donation.ecritureId',
  'AffectationResultat.ecritureId',
  'ExecutionEngagement.ecritureId',
  'MouvementStock.ecritureId',
  'BulletinPaie.ecritureId',
  'AmortissementDerogatoire.ecritureId',
  'LigneOrdreVirement.ecritureId',
  'Consignation.ecritureConsignationId',
  'Consignation.ecritureDenouementId',
  // L'écart d'inventaire arbitré « à redresser », depuis que l'écriture de
  // redressement s'y RATTACHE (audit du serveur I2) · retirée seule, elle
  // laisserait l'écart se dire redressé sans l'écriture qui l'a fait.
  'EcartInventaire.ecritureId',
  // La clôture d'un contrat de location-acquisition · retirée seule, l'une ou
  // l'autre écriture laisserait au 17 une dette que l'échéancier ne connaît
  // plus, et la clôture suivante extournerait des courus jamais passés.
  'ClotureLocationAcquisition.ecritureId',
  'ClotureLocationAcquisition.ecritureExtourneId',
  // La reprise d'une subvention en nature · retirée seule, elle se
  // reproposerait et le 14 serait repris deux fois.
  'RepriseSubventionImmobilisation.ecritureId',
  // La réduction d'une subvention rattachée (remboursement, non versée) ·
  // retirée seule, elle resterait comptée et la reprise suivante serait
  // calculée sur un 14 qui n'a pas bougé.
  'ReductionSubventionImmobilisation.ecritureId',
];

/** Colonnes dont l'écriture peut partir, avec le motif de la décision. */
export const ECRITURE_LAISSEE_PARTIR: Readonly<Record<string, string>> = {
  'LigneEcriture.ecritureId':
    "ce sont les lignes de l'écriture elle-même · elles partent avec leur tête, et c'est ce que la suppression veut dire",
  'Ecriture.corrigeEcritureId':
    "l'écriture corrigée est VALIDÉE (on ne corrige que ce qui est entré au livre-journal) et ne se supprime donc jamais ; " +
    'le lien ne peut se dénouer que si la correction elle-même, encore au brouillard, est retirée, ce qui la fait disparaître avec lui',
  'Facture.ecritureId':
    "la facture est la pièce, l'écriture son enregistrement · retirer au brouillard une écriture passée depuis une facture " +
    "rend la facture « à comptabiliser », ce qui est exactement l'état qu'elle retrouve, et elle se repasse depuis la fenêtre Facturation",
};
