import type { PrismaService } from '../../common/prisma.service';
import { LOT_ECRITURES, lireParLots, pageApres } from '../../common/lecture-par-lots';
import { DepreciationOrpheline, enPlaceAvant, resteDeLaCreance } from './creances-douteuses';

type Lecteur = Pick<PrismaService, 'exercice' | 'creanceDouteuse'>;

/**
 * LES DÉPRÉCIATIONS ORPHELINES D'UN EXERCICE (relecture adverse d'A7, B1) ·
 * même modèle que les écarts de change réalisés non constatés (décision D3
 * d'A6), lu par la CLÔTURE. Une créance du module dont la dépréciation en
 * place dépasse ce qui reste au 416 à la clôture, sans revue NON ANNULÉE de
 * l'exercice · une perte ou un recouvrement passés sans revoir la
 * dépréciation laissent au 491 une dépréciation sans créance, et le résultat
 * minoré de la reprise que la fiche du compte 49 veut « à la clôture de
 * l'exercice ». Lu par tranches, sans borne (§ 8 bis).
 */
export async function depreciationsOrphelines(
  prisma: Lecteur,
  p: { tenantId: string; exerciceId: string },
): Promise<DepreciationOrpheline[]> {
  const ex = await prisma.exercice.findFirst({
    where: { id: p.exerciceId, tenantId: p.tenantId },
    select: { id: true, dateDebut: true, dateFin: true },
  });
  if (!ex) return [];
  const orphelines: DepreciationOrpheline[] = [];
  await lireParLots(
    (curseur) =>
      prisma.creanceDouteuse.findMany({
        where: { tenantId: p.tenantId, dateReclassement: { lte: ex.dateFin } },
        select: {
          id: true,
          montant: true,
          dateReclassement: true,
          declareeOuverture: true,
          depreciationOuverture: true,
          compteCreance: { select: { numero: true, intitule: true } },
          ajustements: {
            where: { annuleeLe: null },
            select: { exerciceId: true, ecart: true, exercice: { select: { dateFin: true } } },
          },
          mouvements: { select: { date: true, montant: true } },
        },
        ...pageApres(curseur, LOT_ECRITURES),
      }),
    (c) => {
      if (c.ajustements.some((a) => a.exerciceId === ex.id)) return;
      const enPlace = enPlaceAvant(
        { declareeOuverture: c.declareeOuverture, depreciationOuverture: Number(c.depreciationOuverture), dateReclassement: c.dateReclassement },
        c.ajustements.map((a) => ({ exerciceDateFin: a.exercice.dateFin, ecart: Number(a.ecart) })),
        ex.dateDebut,
      );
      const reste = resteDeLaCreance(
        Number(c.montant),
        c.mouvements.map((m) => ({ date: m.date, montant: Number(m.montant) })),
        ex.dateFin,
      );
      if (enPlace > reste + 0.005) {
        orphelines.push({ creance: `${c.compteCreance.numero} ${c.compteCreance.intitule}`, enPlace, reste });
      }
    },
    LOT_ECRITURES,
  );
  return orphelines;
}
