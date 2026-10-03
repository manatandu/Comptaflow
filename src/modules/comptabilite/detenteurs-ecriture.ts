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
  // La mise en service d'un bien inscrit en cours (D définitif / C 2x9) ·
  // retirée seule, la fiche se dirait mise en service pendant que l'en-cours
  // porterait encore le bien, et le compte définitif serait vide.
  'Immobilisation.ecritureMiseEnServiceId',
  // Lot 15 · le solde de la dette d'une acquisition à prix aléatoire (décès du
  // crédirentier, écart des redevances) · retirée seule, la fiche se dirait
  // soldée sans l'écriture, et le solde ne pourrait plus se repasser.
  'Immobilisation.ecritureSoldeDetteAleatoireId',
  'DotationAmortissement.ecritureId',
  'DepreciationImmobilisation.ecritureId',
  'ReclassementImmobilisation.ecritureId',
  'Reevaluation.ecritureEcartsId',
  'Reevaluation.ecritureProvisionId',
  'Reevaluation.ecritureExtourneId',
  // La contre-passation faite à la main, DÉCLARÉE (A5 bis, troisième tour) ·
  // retirée seule, la réévaluation se dirait contre-passée sans l'écriture qui
  // l'a fait, et la suivante repasserait l'écart de conversion.
  'Reevaluation.contrePassationDeclareeId',
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
  // La reprise au 798 d'une révision rétroactive (lot 11) · retirée seule,
  // la réduction resterait retranchée du cumul sans son écriture.
  'RevisionPlanAmortissement.ecritureId',
  'CoutEmpruntIncorpore.ecritureId',
  // La réévaluation (lot 14) · retirée seule, les fiches garderaient leurs
  // valeurs réévaluées sans l'écriture qui les porte aux comptes 2, 28 et 106.
  'ReevaluationBilan.ecritureId',
  // La reprise de la provision spéciale · retirée seule, les lignes
  // garderaient leur reprise comptée sans l'écriture qui solde le 154.
  'RepriseProvisionReevaluation.ecritureId',
  // La désactualisation ou la reprise de la provision pour démantèlement
  // (lot 15) · retirée seule, la désactualisation suivante serait calculée
  // sur un 1984 qui n'a pas bougé, ou la reprise se dirait faite sans
  // l'écriture qui a soldé la provision.
  'MouvementDemantelement.ecritureId',
  // Les créances douteuses (ligne A7) · retirée seule, l'écriture laisserait
  // la créance se dire reclassée, dépréciée, perdue ou recouvrée sans la pièce
  // qui l'a fait, et la revue suivante lirait une dépréciation en place que
  // le 491 ne porte plus.
  'CreanceDouteuse.ecritureReclassementId',
  'AjustementCreanceDouteuse.ecritureId',
  'MouvementCreanceDouteuse.ecritureId',
  // L'impôt sur le résultat (ligne A11) · retirée seule, l'écriture laisserait
  // l'exercice se dire constaté sans la pièce qui porte le 89 et le 441.
  'ConstatImpotResultat.ecritureId',
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
