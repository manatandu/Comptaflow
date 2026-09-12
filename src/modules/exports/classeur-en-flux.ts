import { once } from 'events';
import type { Writable } from 'stream';
import * as ExcelJS from 'exceljs';

/**
 * CLASSEUR EXCEL ÉCRIT EN FLUX · ce qui rend de nouveau exportable le journal
 * et le grand livre d'un gros dossier.
 *
 * Les autres exports construisent le classeur entier en mémoire puis le
 * sérialisent d'un bloc (`workbook.xlsx.writeBuffer()`). Mesuré sur ce banc
 * (scripts jetés, protocole dans docs/capacite-mesuree.md), une feuille de
 * quinze colonnes :
 *
 * | lignes    | en mémoire            | en flux            |
 * |-----------|-----------------------|--------------------|
 * | 50 000    | 12,1 s · 693 Mo       | 2,3 s · 137 Mo     |
 * | 200 000   | MORT (tas dépassé)    | 8,0 s · 246 Mo     |
 * | 1 000 000 | mort                  | 81 s · 784 Mo      |
 *
 * D'où le refus au-delà de 50 000 qui protégeait le processus : le classeur
 * en mémoire tuait le conteneur, et l'application étant mono-processus, il
 * tombait pour TOUS les dossiers.
 *
 * DEUX OPTIONS D'EXCELJS DÉCIDENT DE TOUT, et la mauvaise défait le bénéfice :
 *
 *  · `useSharedStrings` doit rester FAUX. La table des chaînes partagées vit
 *    en mémoire jusqu'au dernier octet · mesurée à 1 195 Mo contre 450 Mo pour
 *    le même demi-million de lignes. Elle réduit le fichier, elle rend le flux
 *    inutile ;
 *  · `useStyles` doit être VRAI, et c'est le prix à payer (37,6 s contre 19,6 s
 *    à 500 000 lignes, à mémoire égale). Sans elle, ExcelJS ignore les formats
 *    de cellule : une date sort en numéro de série et un montant sans
 *    séparateur. Un export comptable illisible n'est pas un export.
 *
 * CE QUI RESTE VRAI · le flux ne rend pas la mémoire constante, il la rend
 * SUPPORTABLE. Le pic croît encore avec le volume (137, 246, 784 Mo) parce que
 * la compression garde son état. Le plafond ne disparaît donc pas, il monte ·
 * voir `MAX_LIGNES_EXPORT`.
 */

/** Options mesurées · voir l'en-tête. Ne pas les changer sans refaire le banc. */
export const OPTIONS_CLASSEUR_EN_FLUX = {
  useSharedStrings: false,
  useStyles: true,
} as const;

/**
 * La coiffe d'un état · trois lignes au-dessus du tableau, comme dans la
 * version en mémoire (`ExportService.DECALAGE_COIFFE`). En flux elle doit être
 * écrite AVANT les données · on ne revient pas insérer des lignes en tête d'une
 * feuille déjà partie sur le réseau. C'est la seule contrainte que le flux
 * impose à la présentation, et elle est tenue ici plutôt que chez l'appelant.
 */
export const LIGNES_COIFFE = 3;
/** La ligne d'en-tête des colonnes, une fois la coiffe posée. */
export const LIGNE_ENTETE = LIGNES_COIFFE + 1;
/** La première ligne de données. */
export const PREMIERE_LIGNE_DONNEES = LIGNE_ENTETE + 1;

export interface IdentiteEtat {
  entite: string;
  nif: string;
  periode: string;
  devise: string;
}

/**
 * Attend que le tuyau se vide quand il est plein.
 *
 * SANS CELA, LE FLUX NE SERT À RIEN sur un client lent. `write()` qui rend
 * `false` veut dire que le tampon déborde ; continuer à pousser empile les
 * octets en mémoire, et on retrouve exactement la consommation qu'on voulait
 * fuir · avec un pic qui dépend cette fois du DÉBIT DU CLIENT, c'est-à-dire de
 * quelque chose que le serveur ne maîtrise pas.
 */
export async function attendreLeTuyau(sortie: Writable): Promise<void> {
  if (sortie.writableNeedDrain) await once(sortie, 'drain');
}

/**
 * Ouvre une feuille en flux, coiffe et en-tête posés, prête à recevoir ses
 * lignes.
 *
 * `terminer()` doit être appelé, y compris quand rien n'a été écrit : c'est lui
 * qui ferme l'archive ZIP. Un classeur non terminé n'est pas un classeur
 * tronqué, c'est un fichier qu'Excel REFUSE d'ouvrir · et c'est la propriété
 * qu'on veut en cas d'échec en cours de route (voir le contrôleur).
 */
export function ouvrirFeuilleEnFlux(params: {
  sortie: Writable;
  nomFeuille: string;
  titre: string;
  identite: IdentiteEtat;
  colonnes: Partial<ExcelJS.Column>[];
}) {
  const classeur = new ExcelJS.stream.xlsx.WorkbookWriter({
    stream: params.sortie,
    ...OPTIONS_CLASSEUR_EN_FLUX,
  });
  classeur.creator = 'OmegaX';
  classeur.created = new Date();

  const nbColonnes = params.colonnes.length;
  const feuille = classeur.addWorksheet(params.nomFeuille, {
    // Les vues et l'auto-filtre se posent À LA CRÉATION · une feuille en flux
    // ne se relit pas. La ligne d'en-tête est connue d'avance puisque la
    // coiffe a une hauteur fixe.
    views: [{ state: 'frozen', ySplit: LIGNE_ENTETE }],
    headerFooter: {
      oddFooter:
        `&L${params.identite.entite}${params.identite.nif ? ` · NIF ${params.identite.nif}` : ''} · ` +
        `${params.identite.periode} · montants en ${params.identite.devise}` +
        `&RPage &P / &N · édité le ${new Date().toLocaleDateString('fr-FR')}`,
    },
  });
  feuille.columns = params.colonnes;

  // `columns` pose d'office une ligne d'en-tête en ligne 1 · elle doit devenir
  // la ligne 4, sous la coiffe. On écrit donc la coiffe par-dessus les trois
  // premières lignes, puis on réécrit l'en-tête à sa place.
  const edite = new Date().toLocaleDateString('fr-FR');
  const titreFeuille = feuille.getRow(1);
  titreFeuille.getCell(1).value = `${params.titre} · ${params.identite.entite}`;
  titreFeuille.getCell(1).font = { bold: true, size: 12 };
  titreFeuille.commit();

  const ligneIdentite = feuille.getRow(2);
  ligneIdentite.getCell(1).value =
    `${params.identite.nif ? `NIF ${params.identite.nif} · ` : ''}${params.identite.periode} · ` +
    `montants en ${params.identite.devise} · édité le ${edite}`;
  ligneIdentite.getCell(1).font = { size: 9, italic: true };
  ligneIdentite.commit();

  feuille.getRow(3).commit();

  const entete = feuille.getRow(LIGNE_ENTETE);
  params.colonnes.forEach((c, i) => {
    entete.getCell(i + 1).value = c.header as string;
  });
  entete.font = { bold: true };
  entete.commit();

  let derniereLigne = LIGNE_ENTETE;

  return {
    classeur,
    feuille,
    nbColonnes,
    /** Ajoute une ligne et rend son numéro · le tuyau est respecté. */
    async ajouter(valeurs: Record<string, unknown>): Promise<number> {
      const ligne = feuille.addRow(valeurs);
      ligne.commit();
      derniereLigne = ligne.number;
      await attendreLeTuyau(params.sortie);
      return ligne.number;
    },
    /** Le numéro de la dernière ligne de données écrite. */
    derniereLigneDonnees: () => derniereLigne,
    /**
     * Ferme la feuille et l'archive. L'auto-filtre est posé ici : sa borne
     * basse n'est connue qu'une fois la dernière ligne écrite, et une feuille
     * en flux accepte encore cette propriété tant qu'elle n'est pas commise.
     */
    async terminer(derniereLigneFiltrable = derniereLigne): Promise<void> {
      if (derniereLigneFiltrable > LIGNE_ENTETE) {
        feuille.autoFilter = {
          from: { row: LIGNE_ENTETE, column: 1 },
          to: { row: derniereLigneFiltrable, column: nbColonnes },
        };
      }
      feuille.commit();
      await classeur.commit();
    },
  };
}
