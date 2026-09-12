/**
 * L'ÉTAT DÉTAILLÉ · la condition du droit à déduction, que le logiciel ne
 * pouvait pas produire.
 *
 * CE QUE LE MODULE DE TVA FAISAIT, ET CE QU'IL NE DISAIT PAS. `LiquidationTva`
 * calcule chaque mois la taxe collectée, la taxe déductible et le net à
 * reverser, et le logiciel s'arrêtait là. Or la déduction n'est pas acquise par
 * le calcul :
 *
 *   O.-L. n° 10/001, art. 56 (modifié par la L.F. n° 14/027 puis la L.F.
 *   n° 17/005) · « POUR EXERCER LE DROIT À DÉDUCTION, l'assujetti joint un état
 *   détaillé à la déclaration mensuelle de TVA (modèle réglementaire). LE
 *   DÉFAUT DE PRODUCTION ENTRAÎNE LA RÉINTÉGRATION D'OFFICE DES DÉDUCTIONS,
 *   après mise en demeure non suivie de régularisation dans les cinq jours de
 *   la réception. »
 *
 *   Décret n° 011/42, art. 134 · le contenu, reproduit ici : « pour les
 *   livraisons/prestations, nom et n° impôt du fournisseur, n°/date/montant HT
 *   de la facture, TVA déductible facturée, nature et désignation des
 *   biens/services, quantité, prix HT et TVA correspondante, montant TTC ; pour
 *   les importations, n°/date/montant de la déclaration de mise à la
 *   consommation, valeur en douane, nature des biens ».
 *
 * LE MONTANT DÉDUIT ÉTAIT DONC EXACT ET L'ÉTAT QUI LE JUSTIFIE INTROUVABLE. Pas
 * un avertissement, pas une ligne : le logiciel calculait un droit dont il ne
 * tenait aucune des pièces. Et la liste de l'art. 134 se lit ligne à ligne
 * (« nature et désignation », « quantité », « prix HT ») · rien de tout cela
 * n'existait nulle part, l'écriture d'achat ne portant qu'un `reference` libre.
 *
 * LA LACUNE QUI RESTE, ET QU'ON DÉCLARE PLUTÔT QUE DE LA COMBLER. Le second
 * volet de l'art. 134 porte sur les IMPORTATIONS et demande le numéro, la date
 * et le montant de la DÉCLARATION DE MISE À LA CONSOMMATION ainsi que la valeur
 * en douane. OmegaX ne tient aucune déclaration en douane · aucun modèle, aucun
 * champ. L'état produit ici couvre donc le premier volet seulement, et il le
 * DIT, sur l'état lui-même. Le déduire d'un compte d'achat inventerait une
 * valeur en douane que personne n'a saisie.
 */

export interface LigneAchatFacturee {
  designation: string;
  quantite: number;
  prixHT: number;
  montantTva: number;
  imposable: boolean;
}

export interface FactureAchatSource {
  numeroSerie: string;
  dateFacture: Date;
  fournisseurNom: string | null;
  fournisseurNumeroImpot: string | null;
  lignes: readonly LigneAchatFacturee[];
}

export interface LigneEtatDetaille {
  fournisseurNom: string | null;
  fournisseurNumeroImpot: string | null;
  numeroFacture: string;
  dateFacture: string;
  designation: string;
  quantite: number;
  prixHT: number;
  tvaFacturee: number;
  montantTTC: number;
}

/** Ce qui manque à la ligne pour que l'art. 134 soit servi. */
export type ManqueLigne = 'NUMERO_IMPOT_FOURNISSEUR' | 'NOM_FOURNISSEUR' | 'DESIGNATION';

export interface EtatDetailleTva {
  periode: string;
  lignes: LigneEtatDetaille[];
  totalHT: number;
  totalTva: number;
  totalTTC: number;
  /** Une entrée par ligne incomplète, repérée par son numéro de facture. */
  incompletudes: { numeroFacture: string; designation: string; manques: ManqueLigne[] }[];
  /** Vrai quand rien ne manque au premier volet de l'art. 134. */
  complet: boolean;
  voletImportations: {
    couvert: false;
    motif: string;
  };
  source: string;
  consequenceDuDefaut: string;
}

const PERIODE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** `periode` au format AAAA-MM · la déclaration de TVA est mensuelle (art. 60). */
export function construireEtatDetaille(periode: string, factures: readonly FactureAchatSource[]): EtatDetailleTva {
  if (!PERIODE.test(periode)) {
    throw new Error(`Période « ${periode} » invalide · l’état détaillé accompagne une déclaration MENSUELLE (format AAAA-MM).`);
  }

  const lignes: LigneEtatDetaille[] = [];
  const incompletudes: EtatDetailleTva['incompletudes'] = [];

  for (const f of factures) {
    for (const l of f.lignes) {
      const montantTTC = l.prixHT + l.montantTva;
      lignes.push({
        fournisseurNom: f.fournisseurNom,
        fournisseurNumeroImpot: f.fournisseurNumeroImpot,
        numeroFacture: f.numeroSerie,
        dateFacture: f.dateFacture.toISOString().slice(0, 10),
        designation: l.designation,
        quantite: l.quantite,
        prixHT: l.prixHT,
        tvaFacturee: l.montantTva,
        montantTTC,
      });

      const manques: ManqueLigne[] = [];
      if (!f.fournisseurNumeroImpot || !f.fournisseurNumeroImpot.trim()) manques.push('NUMERO_IMPOT_FOURNISSEUR');
      if (!f.fournisseurNom || !f.fournisseurNom.trim()) manques.push('NOM_FOURNISSEUR');
      if (!l.designation || !l.designation.trim()) manques.push('DESIGNATION');
      if (manques.length > 0) {
        incompletudes.push({ numeroFacture: f.numeroSerie, designation: l.designation, manques });
      }
    }
  }

  const totalHT = lignes.reduce((s, l) => s + l.prixHT, 0);
  const totalTva = lignes.reduce((s, l) => s + l.tvaFacturee, 0);

  return {
    periode,
    lignes,
    totalHT,
    totalTva,
    totalTTC: totalHT + totalTva,
    incompletudes,
    complet: incompletudes.length === 0,
    voletImportations: {
      couvert: false,
      motif:
        'Le second volet de l’art. 134 (importations) demande le numéro, la date et le montant de la déclaration de ' +
        'mise à la consommation ainsi que la valeur en douane. OmegaX ne tient aucune déclaration en douane : ces ' +
        'lignes sont à ajouter à la main sur l’imprimé de l’Administration.',
    },
    source: 'O.-L. n° 10/001, art. 56 · décret n° 011/42, art. 134',
    consequenceDuDefaut:
      'Le défaut de production de l’état détaillé entraîne la RÉINTÉGRATION D’OFFICE des déductions opérées, après ' +
      'mise en demeure non suivie de régularisation dans les cinq jours de sa réception (art. 56).',
  };
}
