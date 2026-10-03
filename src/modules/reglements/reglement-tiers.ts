/**
 * RÈGLEMENT DES TIERS À PARTIR DES ÉCHÉANCES · règles pures, sans Prisma.
 *
 * Sage i7 : « édition des ordres de paiement + enregistrement automatique des
 * règlements en comptabilité · regroupement possible de plusieurs factures
 * d'un même tiers sur un même règlement · règlement partiel possible » (skill
 * sage-i7, tiers.md).
 *
 * L'écriture est celle des deux textes, et elle SÉPARE les deux flux. Le guide
 * d'application SYSCOHADA (Partie 1 ch. 4 § 1) distingue le flux juridique (la
 * facture, déjà au 40 ou au 41) du flux financier (le règlement, classes 4 et
 * 5). Les fiches des comptes 40 et 41 le disent dans les mêmes mots au SYCEBNL :
 * le 40 est « débité [...] des règlements effectués sur factures ; par le
 * crédit : des comptes de trésorerie », le 41 « crédité [...] des règlements
 * reçus des adhérents et clients ; par le débit : des comptes de trésorerie ».
 * Le règlement ne touche donc JAMAIS une charge ni un produit · il solde un
 * tiers contre la trésorerie, et c'est tout.
 */

export type SensReglement = 'FOURNISSEUR' | 'CLIENT';

/**
 * CE QUI SE RÈGLE. Une DETTE fournisseur est une ligne CRÉDITRICE d'un 40, une
 * CRÉANCE client une ligne DÉBITRICE d'un 41. Quatre divisions en sont
 * exclues, de même sens dans les deux plans semés :
 *  · 408 « factures non parvenues » et 418 « produits à recevoir » · des
 *    estimations de clôture, contre-passées à l'ouverture ; les « payer »
 *    réglerait une facture que personne n'a encore reçue ;
 *  · 409 « fournisseurs débiteurs » et 419 « clients créditeurs » · des
 *    avances et acomptes, qui sont l'inverse d'une échéance.
 */
const DIVISIONS_EXCLUES = ['408', '409', '418', '419', '416'];

/**
 * A7 ter, mineur 1 · LE 416 NE SE RÈGLE PAS ICI · « Créances clients
 * litigieuses ou douteuses » au SYSCOHADA, « Créances adhérents,
 * clients-usagers litigieuses ou douteuses » au SYCEBNL (fiche du compte 41
 * des deux plans). La créance reclassée se suit dans « Créances douteuses ou
 * litigieuses » · son encaissement est le RECOUVREMENT du module (D trésorerie
 * / C 416), qui le compte dans le reste de la créance. Réglée ici, la ligne
 * sortait du 416 sans que le module le sache · reste faux, revue et clôture
 * lues sur une créance déjà encaissée.
 */
export const MOTIF_416_PAR_LE_MODULE =
  'se règle par « Recouvrement » dans « Créances douteuses ou litigieuses » · le module compte l’encaissement dans le reste de la créance.';

export function estEcheanceAReglerSur(numeroCompte: string, sens: SensReglement): boolean {
  const racine = sens === 'FOURNISSEUR' ? '40' : '41';
  if (!numeroCompte.startsWith(racine)) return false;
  return !DIVISIONS_EXCLUES.some((d) => numeroCompte.startsWith(d));
}

/** Le refus d'une ligne qui ne se règle pas ici · le 416 renvoie au module. */
export function motifHorsEcheance(numeroCompte: string): string {
  return numeroCompte.startsWith('416')
    ? `Le compte ${numeroCompte} (créance litigieuse ou douteuse) ${MOTIF_416_PAR_LE_MODULE}`
    : `Le compte ${numeroCompte} ne porte pas d'échéance à régler dans ce sens.`;
}

/**
 * A7 ter, mineur 1 · L'AVERTISSEMENT DU RÈGLEMENT d'une facture dont le compte
 * porte une créance reclassée au 416 en vigueur · si ce règlement encaisse la
 * créance, il passe par le module · réglée ici, la facture se solde sur le
 * compte du client pendant que le 416 garde la créance, et le compte du client
 * devient créditeur. Un avertissement, jamais un refus · une vente postérieure
 * au reclassement se règle ici comme une autre.
 */
export function avertissementCreanceReclassee(numeroCompte: string, compte416: string, dateReclassement: string): string {
  return (
    `Le compte ${numeroCompte} porte une créance reclassée au ${compte416} le ${dateReclassement} (« Créances douteuses ou ` +
    'litigieuses »). Si ce règlement encaisse cette créance, passez-le par « Recouvrement » dans ce module · réglée ici, la ' +
    `facture se solde au ${numeroCompte} pendant que le ${compte416} garde la créance, et le compte du client devient créditeur. ` +
    'Au brouillard, la pièce se supprime ; validée, elle s’annule par inscription en négatif.'
  );
}

/** Montant restant dû d'une ligne, positif, dans le sens de l'échéance. */
export function montantDu(ligne: { debit: number; credit: number }, sens: SensReglement): number {
  const brut = sens === 'FOURNISSEUR' ? ligne.credit - ligne.debit : ligne.debit - ligne.credit;
  return Math.round(brut * 100) / 100;
}

export interface LigneReglement {
  compteId: string;
  debit?: number;
  credit?: number;
  libelle: string;
}

/**
 * LES DEUX LIGNES DU RÈGLEMENT. Fournisseur · débit du 40, crédit de la
 * trésorerie. Client · débit de la trésorerie, crédit du 41. L'ordre suit la
 * règle du dépôt (débits puis crédits, voir client/src/lib/ordre-ecriture.ts).
 */
export function lignesDuReglement(params: {
  sens: SensReglement;
  compteTiersId: string;
  compteTresorerieId: string;
  montant: number;
  libelle: string;
}): LigneReglement[] {
  const { sens, compteTiersId, compteTresorerieId, montant, libelle } = params;
  return sens === 'FOURNISSEUR'
    ? [
        { compteId: compteTiersId, debit: montant, libelle },
        { compteId: compteTresorerieId, credit: montant, libelle },
      ]
    : [
        { compteId: compteTresorerieId, debit: montant, libelle },
        { compteId: compteTiersId, credit: montant, libelle },
      ];
}

/**
 * LE MONTANT RÉGLÉ se borne au dû. Moins, c'est un règlement PARTIEL, que Sage
 * prévoit et que le lettrage partiel porte déjà (CPCC). Plus, ce n'est plus un
 * règlement de ces factures · l'excédent est une avance (409) ou un trop-perçu
 * (419), une autre opération avec un autre compte, qui ne se glisse pas dans
 * celle-ci. Zéro ou négatif ne règle rien.
 */
export function motifRefusMontant(montant: number, du: number): string | null {
  if (!(montant > 0)) return 'Le montant réglé doit être positif.';
  if (Math.round(montant * 100) > Math.round(du * 100)) {
    return (
      `Le montant réglé (${montant.toFixed(2)}) dépasse le dû des factures choisies (${du.toFixed(2)}) · ` +
      "l'excédent est une avance ou un trop-perçu, à comptabiliser à part."
    );
  }
  return null;
}
