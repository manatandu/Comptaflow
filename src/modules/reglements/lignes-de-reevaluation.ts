import type { PrismaService } from '../../common/prisma.service';

type Lecteur = Pick<PrismaService, 'reevaluation' | 'ligneEcriture'>;

/** Borne des réévaluations relues · une par exercice, quelques exercices au plus. */
const PLAFOND_REEVALUATIONS = 50;

const centimes = (x: unknown) => Math.round(Number(x) * 100);

/**
 * LES LIGNES QUI PORTENT UN ÉCART DE RÉÉVALUATION SUR LE COMPTE D'UN TIERS
 * (ligne A6 ter, m-2 et échéances) · l'écriture des écarts d'une réévaluation
 * des devises pose sa ligne sur le compte du tiers SANS devise
 * (`DevisesService`, écriture des écarts), et la contre-passation à
 * l'ouverture ne touche que le 478 et le 479 · cette ligne reste au compte du
 * tiers et passe au report à-nouveau, ligne à ligne au Détail, dans le reste
 * en francs au Solde. Lue comme une ligne ordinaire, elle se présentait comme
 * une facture à payer (échéances fournisseurs, perte de change) ou comme un
 * règlement en francs « d'avant la tenue en devise » (faux avertissement du
 * règlement en devise).
 *
 * RECONNUE PAR LA LIAISON, JAMAIS PAR LE COMPTE NI LE LIBELLÉ · dans
 * l'exercice, l'écriture est celle d'une réévaluation (`reevaluationEcarts`) ;
 * dans un exercice suivant, la ligne d'à-nouveau ne garde aucun lien avec ce
 * qu'elle reporte (`exercice/report-a-nouveau.ts`), et elle se reconnaît à ce
 * que la liaison dit des réévaluations ANTÉRIEURES · chaque ligne de leurs
 * écritures d'écarts sur le compte, non lettrée (seules les lignes sans
 * lettre sont reportées au Détail), apparie UNE ligne d'à-nouveau en francs
 * non lettrée de même débit et de même crédit (Détail, de report en report) ;
 * au Solde, la seule ligne d'à-nouveau en francs restée sans paire dont le
 * solde égale celui des lignes de réévaluation restées sans paire est leur
 * reste reporté. Une réévaluation annulée et inscrite en négatif garde sa
 * liaison · son écriture d'origine s'apparie comme les autres, et son
 * négatif, reporté à côté, se compense avec elle.
 *
 * LIMITE ÉCRITE · un règlement en francs d'un même montant qu'un écart de
 * réévaluation, reporté au même compte, peut être pris pour lui · un seul
 * est apparié par ligne de réévaluation, jamais deux.
 */
export async function lignesDeReevaluationSurLesTiers(
  prisma: Lecteur,
  p: { tenantId: string; exercice: { id: string; dateDebut: Date }; compteIds: string[] },
): Promise<Set<string>> {
  const resultat = new Set<string>();
  if (p.compteIds.length === 0) return resultat;
  const reevaluations = await prisma.reevaluation.findMany({
    where: { tenantId: p.tenantId, ecritureEcartsId: { not: null }, exercice: { dateFin: { lt: p.exercice.dateDebut } } },
    select: { ecritureEcartsId: true },
    orderBy: { dateReevaluation: 'desc' },
    take: PLAFOND_REEVALUATIONS,
  });
  const [anterieures, deLExercice] = await Promise.all([
    reevaluations.length === 0
      ? Promise.resolve([] as Array<{ compteId: string; debit: unknown; credit: unknown }>)
      : prisma.ligneEcriture.findMany({
          where: {
            ecritureId: { in: reevaluations.map((r) => r.ecritureEcartsId!) },
            compteId: { in: p.compteIds },
            lettre: null,
            ecriture: { tenantId: p.tenantId },
          },
          select: { compteId: true, debit: true, credit: true },
        }),
    // Dans l'exercice, la liaison est directe.
    prisma.ligneEcriture.findMany({
      where: {
        compteId: { in: p.compteIds },
        ecriture: { tenantId: p.tenantId, exerciceId: p.exercice.id, reevaluationEcarts: { isNot: null } },
      },
      select: { id: true },
    }),
  ]);
  for (const l of deLExercice) resultat.add(l.id);
  if (anterieures.length === 0) return resultat;

  const candidates = await prisma.ligneEcriture.findMany({
    where: {
      compteId: { in: [...new Set(anterieures.map((l) => l.compteId))] },
      deviseId: null,
      lettrageId: null,
      ecriture: {
        tenantId: p.tenantId,
        exerciceId: p.exercice.id,
        OR: [{ estANouveauProvisoire: true }, { estGenereeParCloture: true, estSoldeDesComptesDeGestion: false }],
      },
    },
    select: { id: true, compteId: true, debit: true, credit: true },
    orderBy: { id: 'asc' },
  });
  for (const compteId of new Set(anterieures.map((l) => l.compteId))) {
    const restes = anterieures.filter((l) => l.compteId === compteId).map((l) => ({ d: centimes(l.debit), c: centimes(l.credit) }));
    const libres = candidates.filter((l) => l.compteId === compteId);
    const sansPaire: typeof libres = [];
    // Au Détail · une ligne de réévaluation, une ligne d'à-nouveau.
    for (const l of libres) {
      const i = restes.findIndex((r) => r.d === centimes(l.debit) && r.c === centimes(l.credit));
      if (i >= 0) {
        restes.splice(i, 1);
        resultat.add(l.id);
      } else {
        sansPaire.push(l);
      }
    }
    // Au Solde · le reste en francs reporté d'un seul tenant.
    const net = restes.reduce((t, r) => t + r.d - r.c, 0);
    if (restes.length > 0 && net !== 0 && sansPaire.length === 1 && centimes(sansPaire[0]!.debit) - centimes(sansPaire[0]!.credit) === net) {
      resultat.add(sansPaire[0]!.id);
    }
  }
  return resultat;
}
