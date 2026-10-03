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
 * l'exercice, l'écriture est celle d'une réévaluation (`ecritureEcarts`) ou
 * sa contre-passation (`ecritureExtourne`, qui inverse l'écart sur le compte
 * du tiers et se présentait, chez un client, comme une créance à encaisser) ;
 * dans un exercice suivant, la ligne d'à-nouveau ne garde aucun lien avec ce
 * qu'elle reporte (`exercice/report-a-nouveau.ts`), et elle se reconnaît à ce
 * que la liaison dit des écritures ANTÉRIEURES · chaque ligne d'une écriture
 * d'écarts ou d'une contre-passation datée avant l'exercice, sur le compte, non lettrée (seules les lignes sans
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
  // Les réévaluations du dossier, les plus récentes d'abord, bornées · leur
  // écriture d'écarts et leur contre-passation, qui touche aussi le compte
  // du tiers quand elle inverse l'écart de l'exercice précédent.
  const reevaluations = await prisma.reevaluation.findMany({
    where: { tenantId: p.tenantId, OR: [{ ecritureEcartsId: { not: null } }, { ecritureExtourneId: { not: null } }] },
    select: { ecritureEcartsId: true, ecritureExtourneId: true },
    orderBy: { dateReevaluation: 'desc' },
    take: PLAFOND_REEVALUATIONS,
  });
  const ecritures = reevaluations.flatMap((r) => [r.ecritureEcartsId, r.ecritureExtourneId]).filter((x): x is string => x !== null);
  if (ecritures.length === 0) return resultat;
  const liees = await prisma.ligneEcriture.findMany({
    where: { ecritureId: { in: ecritures }, compteId: { in: p.compteIds }, ecriture: { tenantId: p.tenantId } },
    select: { id: true, compteId: true, debit: true, credit: true, lettre: true, ecriture: { select: { exerciceId: true, date: true } } },
  });
  // Dans l'exercice, la liaison est directe ; d'un exercice ANTÉRIEUR, la
  // ligne non lettrée est passée au report, où elle s'apparie.
  const anterieures: typeof liees = [];
  for (const l of liees) {
    if (l.ecriture.exerciceId === p.exercice.id) resultat.add(l.id);
    else if (l.ecriture.date.getTime() < p.exercice.dateDebut.getTime() && l.lettre === null) anterieures.push(l);
  }
  if (anterieures.length === 0) return resultat;

  const candidates = await prisma.ligneEcriture.findMany({
    where: {
      compteId: { in: [...new Set(anterieures.map((l) => l.compteId))] },
      deviseId: null,
      // LETTRÉES COMPRISES (A6 ter, seconde relecture, mineur b) · la ligne
      // reportée d'un écart, lettrée dans l'exercice avec sa contre-passation,
      // doit CONSOMMER sa ligne de réévaluation ; écartée, la ligne restée
      // sans paire s'appariait à une vraie facture en francs du même montant,
      // qui disparaissait des échéances.
      ecriture: {
        tenantId: p.tenantId,
        exerciceId: p.exercice.id,
        OR: [{ estANouveauProvisoire: true }, { estGenereeParCloture: true, estSoldeDesComptesDeGestion: false }],
      },
    },
    select: { id: true, compteId: true, debit: true, credit: true, lettrageId: true },
    orderBy: { id: 'asc' },
  });
  // L'ORDRE D'APPARIEMENT · d'abord la ligne lettrée dans un groupe qui porte
  // une ligne d'écriture de réévaluation (sa contre-passation, par liaison),
  // puis toute autre ligne lettrée (elle n'est pas due), et la ligne ouverte
  // en dernier · à montant égal, une vraie facture ouverte n'est jamais prise
  // pour un écart tant qu'une ligne qui ne se paie pas peut l'être.
  const groupes = [...new Set(candidates.flatMap((l) => (l.lettrageId ? [l.lettrageId] : [])))];
  const groupesDeReevaluation = new Set(
    groupes.length === 0
      ? []
      : (
          await prisma.ligneEcriture.findMany({
            where: { lettrageId: { in: groupes }, ecritureId: { in: ecritures }, ecriture: { tenantId: p.tenantId } },
            select: { lettrageId: true },
          })
        ).flatMap((l) => (l.lettrageId ? [l.lettrageId] : [])),
  );
  const rang = (l: { lettrageId: string | null }) => (l.lettrageId === null ? 2 : groupesDeReevaluation.has(l.lettrageId) ? 0 : 1);
  for (const compteId of new Set(anterieures.map((l) => l.compteId))) {
    const restes = anterieures.filter((l) => l.compteId === compteId).map((l) => ({ d: centimes(l.debit), c: centimes(l.credit) }));
    // Tri stable · le rang, puis l'ordre de lecture.
    const libres = candidates.filter((l) => l.compteId === compteId).sort((a, b) => rang(a) - rang(b));
    const sansPaire: typeof libres = [];
    // Au Détail · une ligne de réévaluation, une ligne d'à-nouveau.
    for (const l of libres) {
      const i = restes.findIndex((r) => r.d === centimes(l.debit) && r.c === centimes(l.credit));
      if (i >= 0) {
        restes.splice(i, 1);
        resultat.add(l.id);
      } else if (l.lettrageId === null) {
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
