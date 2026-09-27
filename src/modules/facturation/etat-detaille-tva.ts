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
 * LA LACUNE QUI RESTE, ET QU'ON DÉCLARE PLUTÔT QUE DE LA COMBLER. Elle est
 * DOUBLE, et la passe F1 a montré que le module n'en déclarait qu'une moitié :
 * la déclaration de mise à la consommation manque à l'IMPRIMÉ de l'art. 134,
 * mais elle est aussi, par l'art. 25, 2° du décret n° 23/10, LE SUPPORT MÊME de
 * la déduction en cas d'importation. Ne nommer que l'imprimé laissait croire
 * qu'il ne manquait qu'une ligne de tableau.
 *
 * Le second volet de l'art. 134 porte sur les IMPORTATIONS et demande le numéro, la date
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
  /** La note de crédit qui annule la facture (décret n° 011/42, art. 127), s'il y en a une. */
  annuleePar?: { numeroSerie: string; dateFacture: Date } | null;
}

/**
 * UNE FACTURE BARRÉE N'EST PAS UNE FACTURE COMME LES AUTRES (audit final F117).
 * Décret n° 011/42, art. 127 · la récupération de la taxe d'une opération
 * annulée est « subordonnée à l'envoi au client d'une facture nouvelle ou note
 * de crédit annulant et remplaçant la facture initiale (barrée, conservée dans
 * l'ordre chronologique) ». L'état recensait la facture barrée comme les
 * autres, et justifiait une déduction que la note avait reprise.
 *
 * DEUX CAS, ET LA DATE DE LA NOTE LES SÉPARE · c'est une lecture d'OmegaX,
 * le texte ne réglant pas l'état détaillé d'une facture barrée. Annulée par une
 * note datée DANS le mois (ou avant sa fin), la facture n'ouvre aucune
 * déduction pour ce mois · elle sort des lignes et des totaux et se montre à
 * part. Annulée par une note POSTÉRIEURE, elle était déductible quand la
 * déclaration du mois est partie · elle reste sur l'état tel qu'il a été
 * produit, et la reprise se déclare au mois de la note, ce que la ligne à
 * part dit. Ni l'un ni l'autre ne disparaît sans mot.
 */
export interface FactureAnnuleeEtat {
  numeroFacture: string;
  dateFacture: string;
  fournisseurNom: string | null;
  noteDeCredit: string;
  dateNote: string;
  montantHT: number;
  tvaFacturee: number;
  /** Vrai quand la note tombe dans le mois · la facture est alors hors des lignes et des totaux. */
  ecarteeDesTotaux: boolean;
  motif: string;
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
  /** Les factures barrées par une note de crédit, montrées à part (audit final F117). */
  facturesAnnulees: FactureAnnuleeEtat[];
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
  const facturesAnnulees: FactureAnnuleeEtat[] = [];
  const [annee, mois] = periode.split('-').map(Number);
  const finExclue = Date.UTC(annee, mois, 1);
  const jour = (d: Date) => d.toISOString().slice(0, 10);

  for (const f of factures) {
    if (f.annuleePar) {
      const dansLeMois = f.annuleePar.dateFacture.getTime() < finExclue;
      facturesAnnulees.push({
        numeroFacture: f.numeroSerie,
        dateFacture: jour(f.dateFacture),
        fournisseurNom: f.fournisseurNom,
        noteDeCredit: f.annuleePar.numeroSerie,
        dateNote: jour(f.annuleePar.dateFacture),
        montantHT: f.lignes.reduce((s, l) => s + l.prixHT, 0),
        tvaFacturee: f.lignes.reduce((s, l) => s + l.montantTva, 0),
        ecarteeDesTotaux: dansLeMois,
        motif: dansLeMois
          ? `Barrée par la note de crédit « ${f.annuleePar.numeroSerie} » du ${jour(f.annuleePar.dateFacture)}, dans le mois · ` +
            'elle n’ouvre aucune déduction pour cette période et sort des totaux (décret n° 011/42, art. 127).'
          : `Barrée par la note de crédit « ${f.annuleePar.numeroSerie} » du ${jour(f.annuleePar.dateFacture)}, après le mois · ` +
            'elle reste sur l’état, déductible quand la déclaration est partie ; la reprise se déclare au mois de la note ' +
            '(décret n° 011/42, art. 127).',
      });
      if (dansLeMois) continue;
    }
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
    facturesAnnulees,
    incompletudes,
    complet: incompletudes.length === 0,
    voletImportations: {
      couvert: false,
      motif:
        'Le second volet de l’art. 134 (importations) demande le numéro, la date et le montant de la déclaration de ' +
        'mise à la consommation ainsi que la valeur en douane. OmegaX ne tient aucune déclaration en douane : ces ' +
        'lignes sont à ajouter à la main sur l’imprimé de l’Administration. Et la lacune ne porte pas que sur ' +
        'l’IMPRIMÉ : le décret n° 23/10 du 3 mars 2023, art. 25, 2°, fait de cette même déclaration LE SUPPORT de la ' +
        'déduction en cas d’importation. Une TVA d’importation portée au compte 445 n’a donc, dans ce logiciel, ni sa ' +
        'pièce ni sa ligne d’état.',
    },
    source: 'O.-L. n° 10/001, art. 56 · décret n° 011/42, art. 134',
    consequenceDuDefaut:
      'Le défaut de production de l’état détaillé entraîne la RÉINTÉGRATION D’OFFICE des déductions opérées, après ' +
      'mise en demeure non suivie de régularisation dans les cinq jours de sa réception (art. 56).',
  };
}
