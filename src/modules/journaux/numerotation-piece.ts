import { NumerotationPiece, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';

/**
 * NUMÉRO DE PIÈCE · sorti du service pour être appelable PARTOUT où une
 * écriture naît, et pas seulement là où `JournalService` est injecté.
 *
 * Le motif de l'extraction est un défaut, pas une commodité. Quatre chemins de
 * création d'écriture n'appelaient pas la numérotation du tout · les deux
 * imports (reprise de balance et import d'écritures) et les deux écritures du
 * module Groupe. Ils posaient `numeroPiece = null` quel que soit le mode du
 * journal, si bien qu'un journal déclaré à numérotation continue recevait des
 * pièces sans numéro, entremêlées par date avec les pièces numérotées de la
 * saisie. Rien ne le signalait : l'écriture est équilibrée, la balance boucle,
 * le livre-journal s'imprime · il porte simplement des pièces que l'on ne peut
 * plus citer par leur numéro, alors que le CPCC (§ 3.2) fait de la référence
 * de la pièce le lien entre l'enregistrement et sa justification, et que
 * l'AUDCIF art. 17, 3° exige des pièces « classées dans un ordre défini au
 * manuel ». Et c'est l'import qui reprend l'existant d'un dossier : les
 * premières pièces d'un dossier repris étaient précisément les non numérotées.
 *
 * Les quatre modes, inchangés :
 *  · MANUELLE · pas d'auto-numérotation, retourne null ;
 *  · CONTINUE_JOURNAL · incrémenté par journal, sur l'exercice ;
 *  · CONTINUE_FICHIER · incrémenté tous journaux confondus, sur l'exercice ;
 *  · MENSUELLE · incrémenté par journal, remis à zéro chaque mois civil.
 *
 * LE `tx` N'EST PAS FACULTATIF EN PRATIQUE. Lire le maximum puis l'écrire est
 * une lecture-puis-écriture non atomique : deux écritures créées au même
 * instant sur le même journal liraient le même maximum. Les appelants passent
 * la transaction sérialisable qui crée l'écriture (voir
 * `avecRetrySerialisable`), ce qui fait échouer et rejouer l'une des deux
 * plutôt que de leur donner le même numéro.
 */
/**
 * Le mode dont les journaux partagent UNE séquence, tous journaux confondus ·
 * la numérotation et l'analyse des journaux le lisent au même endroit, pour
 * qu'elles ne comptent jamais deux séquences différentes.
 */
export const NUMEROTATION_DU_FICHIER = NumerotationPiece.CONTINUE_FICHIER;

/**
 * Le mode d'un journal créé sans choix (audit final F59) · en MANUELLE aucune
 * pièce ne reçoit de numéro, la saisie n'en portant aucun.
 */
export const NUMEROTATION_PAR_DEFAUT = NumerotationPiece.CONTINUE_JOURNAL;

/** Les journaux qui portent la séquence du fichier. */
export function journauxDeLaSequenceDuFichier<J extends { numerotation: NumerotationPiece }>(journaux: J[]): J[] {
  return journaux.filter((j) => j.numerotation === NUMEROTATION_DU_FICHIER);
}

export async function prochainNumeroPiece(
  tx: Prisma.TransactionClient | PrismaService,
  tenantId: string,
  journal: { id: string; numerotation: NumerotationPiece },
  exerciceId: string,
  date: Date,
): Promise<number | null> {
  switch (journal.numerotation) {
    case NumerotationPiece.MANUELLE:
      return null;

    case NumerotationPiece.CONTINUE_JOURNAL: {
      const max = await tx.ecriture.aggregate({
        where: { tenantId, journalId: journal.id, exerciceId },
        _max: { numeroPiece: true },
      });
      return (max._max.numeroPiece ?? 0) + 1;
    }

    case NumerotationPiece.CONTINUE_FICHIER: {
      // LA SÉQUENCE DU FICHIER NE COMPTE QUE SES JOURNAUX (audit final F3).
      // Le maximum pris sur TOUTES les écritures de l'exercice faisait sauter
      // chaque OD au-dessus des achats et des ventes, numérotés à part,
      // pendant que l'analyse des journaux ne relisait que les journaux du
      // fichier · elle annonçait des trous que personne n'avait creusés.
      const max = await tx.ecriture.aggregate({
        where: { tenantId, exerciceId, journal: { numerotation: NUMEROTATION_DU_FICHIER } },
        _max: { numeroPiece: true },
      });
      return (max._max.numeroPiece ?? 0) + 1;
    }

    case NumerotationPiece.MENSUELLE: {
      const debutMois = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
      const debutMoisSuivant = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
      const max = await tx.ecriture.aggregate({
        where: { tenantId, journalId: journal.id, date: { gte: debutMois, lt: debutMoisSuivant } },
        _max: { numeroPiece: true },
      });
      return (max._max.numeroPiece ?? 0) + 1;
    }
  }
}

/**
 * UN NUMÉROTEUR POUR UN LOT DE PIÈCES (audit final F2). L'import crée des
 * milliers de pièces dans une seule transaction, et relire le maximum à
 * chaque pièce coûtait un aller-retour par pièce · la transaction dépassait
 * son délai et l'import échouait entier. Le numéroteur lit le maximum UNE
 * fois par série, par `prochainNumeroPiece` lui-même, puis incrémente. C'est
 * juste parce que la transaction sérialisable écarte toute autre écriture
 * entre-temps, et parce que les séries ne se recoupent pas : chaque mode ne
 * compte que les siennes.
 */
export function numeroteurDeLot(
  tx: Prisma.TransactionClient | PrismaService,
  tenantId: string,
  exerciceId: string,
): (journal: { id: string; numerotation: NumerotationPiece }, date: Date) => Promise<number | null> {
  const prochains = new Map<string, number>();
  return async (journal, date) => {
    const cle = serieDeNumerotation(journal, date);
    if (cle === null) return null;
    const numero = prochains.get(cle) ?? (await prochainNumeroPiece(tx, tenantId, journal, exerciceId, date));
    if (numero === null) return null;
    prochains.set(cle, numero + 1);
    return numero;
  };
}

/** La série à laquelle une pièce appartient, selon le mode de son journal. */
function serieDeNumerotation(journal: { id: string; numerotation: NumerotationPiece }, date: Date): string | null {
  switch (journal.numerotation) {
    case NumerotationPiece.MANUELLE:
      return null;
    case NumerotationPiece.CONTINUE_JOURNAL:
      return `journal:${journal.id}`;
    case NumerotationPiece.CONTINUE_FICHIER:
      return 'fichier';
    case NumerotationPiece.MENSUELLE:
      return `mois:${journal.id}:${date.getUTCFullYear()}-${date.getUTCMonth() + 1}`;
  }
}
