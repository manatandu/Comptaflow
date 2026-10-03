import { Referentiel } from '@prisma/client';
import { STOCK_PROVENANT_D_IMMOBILISATIONS } from '../stocks/nomenclature-stocks';

/**
 * LE MATÉRIEL RÉCUPÉRÉ À LA MISE HORS SERVICE · LOT 15 (première part).
 *
 * AUDCIF Titre VIII ch. 14 § 2.8 · « Lorsque ces éléments récupérés sont
 * destinés à être réutilisés pour de nouvelles installations, ils peuvent
 * être simplement transférés dans un compte spécial d'immobilisation. Dans
 * les autres cas, les matières et matériaux récupérés peuvent être repris
 * dans les stocks par le débit du compte 388 ». La fiche du compte 38
 * (Titre VII) donne la contrepartie · « ce compte est débité par le crédit du
 * compte d'immobilisation concerné ».
 *
 * AUX DEUX RÉFÉRENTIELS, SOUS DEUX NUMÉROS · le SYCEBNL porte le même objet
 * au 378, sous la même phrase (Partie 2 ch. 3, fiche du compte 37), son 38
 * étant les dons en nature H.A.O. Le numéro vient de la nomenclature des
 * stocks, jamais d'ici.
 *
 * L'ÉCRITURE · la part récupérée quitte le compte du bien vers le stock, le
 * reste de la valeur nette va au 81 comme avant (décision D-3) · D 28 cumul,
 * D 388 (ou 378) valeur récupérée, D 81 valeur nette moins la valeur
 * récupérée, C 2 valeur d'entrée.
 *
 * CE QUE LE TEXTE NE DIT PAS, ET QUE LE MODULE NE COMBLE PAS.
 *   · La VALEUR des matières · aucun texte lu ne la fixe. Elle se déclare
 *     avec sa source (décision proposée D-49).
 *   · Une valeur SUPÉRIEURE à la valeur nette · le compte du bien, crédité de
 *     sa valeur d'entrée, est déjà soldé par le 28 et le 388 ; l'excédent
 *     n'a aucune contrepartie écrite (ni 82, ni 7372, que la fiche du compte
 *     37 de l'AUDCIF réserve aux produits de la récupération affectables aux
 *     31, 32 ou 33). Refusé, nommé (décision proposée D-50).
 *   · Le projet de développement · sa sortie se fait tout entière par le
 *     fonds affecté (SYCEBNL Partie 3 ch. 3 § 2.5), sans 28 ni 81, et le
 *     texte n'y prévoit pas de reprise en stock. Refusé.
 *   · Le solde du 388 en fin d'exercice par le 603 (§ 2.8) · le compte de
 *     classe 3 qui reçoit ce qui subsiste dépend de la nature des matières ;
 *     le contrôle STOCK_IMMOBILISATIONS_388_NON_SOLDE le réclame.
 */

export function compteStockRecupere(referentiel: Referentiel) {
  return STOCK_PROVENANT_D_IMMOBILISATIONS[referentiel];
}

/** Le motif qui interdit la reprise en stock, ou `null`. */
export function motifRefusMaterielRecupere(e: {
  referentiel: Referentiel;
  /** La sortie demandée · seule la mise hors service ou au rebut récupère. */
  cession: boolean;
  projetDeveloppement: boolean;
  numeroCompteBien: string;
  numeroCompteStock: string | null;
  valeur: number;
  valeurNetteComptable: number;
  source: string | null | undefined;
}): string | null {
  const stock = compteStockRecupere(e.referentiel);
  if (!(e.valeur > 0)) return 'La valeur du matériel récupéré doit être positive.';
  if (e.cession) {
    return (
      "Le matériel récupéré suit une mise hors service ou au rebut (AUDCIF Titre VIII ch. 14 § 2.8) · une cession " +
      'vend le bien entier, et son prix va au 82.'
    );
  }
  if (e.projetDeveloppement) {
    return (
      "Un bien de projet de développement sort tout entier par le fonds affecté qui l'a financé (SYCEBNL Partie 3 " +
      'ch. 3 § 2.5) · le texte n’y prévoit aucune reprise en stock.'
    );
  }
  const division = e.numeroCompteBien.slice(0, 2);
  if (!['22', '23', '24'].includes(division)) {
    return (
      `Le compte ${stock.racine} reçoit « les éléments récupérés ou démontés d'immobilisations corporelles » ` +
      `(${stock.source}) · terrains, bâtiments et installations, matériel (22, 23, 24).`
    );
  }
  if (!e.numeroCompteStock || !e.numeroCompteStock.startsWith(stock.racine)) {
    return `Le matériel récupéré se reprend au ${stock.racine} « ${stock.intitule} » (${stock.source}).`;
  }
  if (!e.source?.trim()) {
    return "Indiquez d'où vient la valeur retenue pour le matériel récupéré (estimation, cours, procès-verbal) · aucun texte ne la fixe.";
  }
  if (Math.round((e.valeur - e.valeurNetteComptable) * 100) > 0) {
    return (
      `La valeur récupérée dépasse la valeur nette du bien à sa sortie (${e.valeurNetteComptable.toFixed(2)}) · le ` +
      `stock est débité « par le crédit du compte d'immobilisation concerné » (${stock.source}), et aucun texte ne ` +
      "donne de compte pour l'excédent."
    );
  }
  return null;
}
