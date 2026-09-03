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
      const max = await tx.ecriture.aggregate({
        where: { tenantId, exerciceId },
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
