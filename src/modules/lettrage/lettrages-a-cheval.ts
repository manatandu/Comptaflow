import type { PrismaService } from '../../common/prisma.service';
import { lireParLots, LOT_LECTURE, pageApres } from '../../common/lecture-par-lots';

/**
 * UN LETTRAGE NE MÊLE PAS DEUX EXERCICES (ligne A6 bis, B2, reproduit par la
 * relecture adverse).
 *
 * LA DOCTRINE est en tête de `lettrage.service.ts` · un règlement de mars qui
 * solde une facture de décembre se lettre contre la ligne de REPORT
 * À-NOUVEAU de l'exercice ouvert (mode Détail des comptes de tiers), jamais
 * contre la ligne de l'exercice précédent. Rien ne la faisait tenir · tant
 * que les deux exercices étaient ouverts, la facture de N se lettrait avec le
 * règlement de N+1, et l'écart de change passé en N+1 complétait le groupe.
 *
 * CE QUI CASSAIT. Soldé, le groupe pose sa `lettre` sur les lignes de N, qui
 * sortent du report à-nouveau Détail (`report-a-nouveau.ts`, « seuls les
 * mouvements NON lettrés ») alors qu'elles ne se soldent pas DANS N · le
 * report tombe déséquilibré, et la clôture de N comme l'à-nouveau provisoire
 * répondaient « anomalie interne » (500). Partiel, le groupe passe la
 * clôture, puis ne se complète ni ne se délettre plus (les lignes de N sont
 * figées, `gel-cloture.ts`) · le règlement de N+1 ne se lettre jamais avec
 * la ligne d'à-nouveau. Dossier enfermé dans les deux cas. Et la garde de la
 * clôture sur l'écart réalisé (`ecartsRealisesNonConstates`, D3), qui lit
 * les lignes de l'exercice, ne voyait pas un groupe dont l'autre moitié est
 * dans l'exercice voisin.
 *
 * DEUX RÈGLES. (1) Le lettrage (manuel, complément, pré-lettrage confirmé,
 * automatique) REFUSE tout groupe qui mêlerait deux exercices
 * (`motifLettrageADeuxExercices`). (2) Les groupes DÉJÀ en base ne sont pas
 * réécrits (AUDCIF art. 20 · on ne corrige pas en silence) · la clôture et
 * l'à-nouveau provisoire les REFUSENT par un message nommé (groupe, compte,
 * exercices, issue), et le contrôle les nomme. Tant que toutes leurs lignes
 * sont dans des exercices ouverts, ils se DÉLETTRENT (seule issue, et elle
 * ne perd rien · un écart de change déjà passé reste au journal et se
 * relettre avec les lignes de son exercice). Une ligne dans un exercice déjà
 * clôturé les fige · ils ne bloquent alors la clôture que s'ils fausseraient
 * le report (soldés, compte au Détail, part de l'exercice non nulle), et le
 * refus dit qu'aucun geste d'OmegaX ne le lève encore.
 */

type Lecteur = Pick<PrismaService, 'lettrage' | 'ligneEcriture'>;

const jour = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Le refus du lettrage · `null` quand toutes les lignes sont d'un même
 * exercice. Nomme une ligne de chaque exercice et dit l'issue.
 */
export function motifLettrageADeuxExercices(lignes: Array<{ ecriture: { exerciceId: string; date: Date } }>): string | null {
  const premiereParExercice = new Map<string, Date>();
  for (const l of lignes) {
    const vue = premiereParExercice.get(l.ecriture.exerciceId);
    if (!vue || l.ecriture.date < vue) premiereParExercice.set(l.ecriture.exerciceId, l.ecriture.date);
  }
  if (premiereParExercice.size <= 1) return null;
  const dates = [...premiereParExercice.values()].sort((a, b) => a.getTime() - b.getTime()).map(jour);
  return (
    `Ces lignes appartiennent à ${premiereParExercice.size} exercices (lignes du ${dates.join(', du ')}) · un lettrage ne mêle pas deux exercices. ` +
    "La facture d'un exercice antérieur se lettre, dans l'exercice ouvert, contre la ligne d'à-nouveau qui la reporte (report en mode Détail) · " +
    "lettrez dans chaque exercice ses propres lignes, clôturez l'exercice antérieur, puis lettrez le règlement avec la ligne d'à-nouveau."
  );
}

/** Un groupe de lettrage qui mêle l'exercice lu et un autre. */
export interface LettrageACheval {
  lettrageId: string;
  /** Tel qu'il s'affiche · minuscule partiel, majuscule soldé. */
  code: string;
  statut: 'PARTIEL' | 'SOLDE';
  compteNumero: string;
  /** Les AUTRES exercices du groupe, par leurs bornes. */
  autresExercices: Array<{ dateDebut: Date; dateFin: Date; clos: boolean }>;
}

/** Plafond de groupes nommés, par liste · au-delà, le dépassement est dit. */
export const PLAFOND_LETTRAGES_A_CHEVAL = 200;

/** Ce que rend la lecture · deux listes, chacune bornée et qui dit si elle l'est. */
export interface LettragesACheval {
  /** Toutes leurs lignes dans des exercices ouverts · ils bloquent, et se délettrent. */
  adelettrer: LettrageACheval[];
  /**
   * Une de leurs lignes dans un exercice clôturé · ils ne se délettrent plus.
   * `faussentLeReport` · soldés, compte au Détail, part de cet exercice non
   * nulle · leurs lignes sortiraient du report sans s'y solder, ils bloquent.
   */
  figes: Array<LettrageACheval & { faussentLeReport: boolean }>;
  tronqueADelettrer: boolean;
  tronqueFiges: boolean;
}

/**
 * LES GROUPES À CHEVAL D'UN EXERCICE · ceux qui ont une ligne dans l'exercice
 * lu et une ligne dans un autre. Deux lectures bornées, l'une pour ceux dont
 * TOUTES les lignes sont dans des exercices ouverts (ce sont eux qui
 * bloquent), l'autre pour ceux qu'un exercice clôturé fige ; puis leurs
 * lignes, par tranches (§ 8 bis), pour nommer les exercices et solder la
 * part de l'exercice lu.
 */
export async function lettragesACheval(prisma: Lecteur, p: { tenantId: string; exerciceId: string }): Promise<LettragesACheval> {
  const aCheval = [
    { lignes: { some: { ecriture: { tenantId: p.tenantId, exerciceId: p.exerciceId } } } },
    { lignes: { some: { ecriture: { tenantId: p.tenantId, exerciceId: { not: p.exerciceId } } } } },
  ];
  const select = { id: true, code: true, statut: true, compte: { select: { numero: true, modeReportANouveau: true } } } as const;
  const [ouverts, clos] = await Promise.all([
    prisma.lettrage.findMany({
      where: { tenantId: p.tenantId, AND: [...aCheval, { lignes: { every: { ecriture: { exercice: { statut: { not: 'CLOTURE' } } } } } }] },
      select,
      orderBy: { id: 'asc' },
      take: PLAFOND_LETTRAGES_A_CHEVAL + 1,
    }),
    prisma.lettrage.findMany({
      where: { tenantId: p.tenantId, AND: [...aCheval, { lignes: { some: { ecriture: { exercice: { statut: 'CLOTURE' } } } } }] },
      select,
      orderBy: { id: 'asc' },
      take: PLAFOND_LETTRAGES_A_CHEVAL + 1,
    }),
  ]);
  const retenusOuverts = ouverts.slice(0, PLAFOND_LETTRAGES_A_CHEVAL);
  const retenusClos = clos.slice(0, PLAFOND_LETTRAGES_A_CHEVAL);
  const resultat: LettragesACheval = {
    adelettrer: [],
    figes: [],
    tronqueADelettrer: ouverts.length > PLAFOND_LETTRAGES_A_CHEVAL,
    tronqueFiges: clos.length > PLAFOND_LETTRAGES_A_CHEVAL,
  };
  const tous = [...retenusOuverts, ...retenusClos];
  if (tous.length === 0) return resultat;

  // Ce que chaque groupe porte · ses autres exercices, et le solde de sa part
  // dans l'exercice lu (au centime).
  const parGroupe = new Map<string, { autres: Map<string, { dateDebut: Date; dateFin: Date; clos: boolean }>; centimes: number }>();
  for (const g of tous) parGroupe.set(g.id, { autres: new Map(), centimes: 0 });
  await lireParLots(
    (curseur) =>
      prisma.ligneEcriture.findMany({
        where: { lettrageId: { in: tous.map((g) => g.id) }, ecriture: { tenantId: p.tenantId } },
        select: {
          id: true,
          lettrageId: true,
          debit: true,
          credit: true,
          ecriture: { select: { exerciceId: true, exercice: { select: { statut: true, dateDebut: true, dateFin: true } } } },
        },
        ...pageApres(curseur, LOT_LECTURE),
      }),
    (l) => {
      const g = l.lettrageId ? parGroupe.get(l.lettrageId) : undefined;
      if (!g) return;
      if (l.ecriture.exerciceId === p.exerciceId) {
        g.centimes += Math.round(Number(l.debit) * 100) - Math.round(Number(l.credit) * 100);
      } else {
        g.autres.set(l.ecriture.exerciceId, {
          dateDebut: l.ecriture.exercice.dateDebut,
          dateFin: l.ecriture.exercice.dateFin,
          clos: l.ecriture.exercice.statut === 'CLOTURE',
        });
      }
    },
  );

  const decrire = (g: (typeof tous)[number]) => {
    const lu = parGroupe.get(g.id)!;
    const statut: LettrageACheval['statut'] = g.statut === 'SOLDE' ? 'SOLDE' : 'PARTIEL';
    const groupe: LettrageACheval = {
      lettrageId: g.id,
      code: statut === 'SOLDE' ? g.code : g.code.toLowerCase(),
      statut,
      compteNumero: g.compte.numero,
      autresExercices: [...lu.autres.values()].sort((a, b) => a.dateDebut.getTime() - b.dateDebut.getTime()),
    };
    return { groupe, centimes: lu.centimes };
  };
  const tri = (a: LettrageACheval, b: LettrageACheval) => a.compteNumero.localeCompare(b.compteNumero) || a.code.localeCompare(b.code);
  resultat.adelettrer = retenusOuverts.map((g) => decrire(g).groupe).sort(tri);
  resultat.figes = retenusClos
    .map((g) => {
      const { groupe, centimes } = decrire(g);
      return { ...groupe, faussentLeReport: groupe.statut === 'SOLDE' && g.compte.modeReportANouveau === 'DETAIL' && centimes !== 0 };
    })
    .sort(tri);
  return resultat;
}

const periode = (e: { dateDebut: Date; dateFin: Date }) => `${jour(e.dateDebut)} au ${jour(e.dateFin)}`;

/** Un groupe nommé · compte, code, état, et les autres exercices qu'il touche. */
export function nommerLettrageACheval(g: LettrageACheval): string {
  return `${g.compteNumero} lettrage ${g.code} (${g.statut === 'SOLDE' ? 'soldé' : 'partiel'}, avec l'exercice du ${g.autresExercices.map(periode).join(' et du ')})`;
}

/**
 * Le refus de la clôture et de l'à-nouveau provisoire, nommé · groupes,
 * comptes, exercices et issue, au lieu du « report à-nouveau déséquilibré »
 * (500) qu'ils produisaient. `null` si rien ne bloque.
 */
export function motifClotureLettragesACheval(r: LettragesACheval): string | null {
  const figes = r.figes.filter((g) => g.faussentLeReport);
  if (r.adelettrer.length === 0 && figes.length === 0) return null;
  const morceaux: string[] = [];
  if (r.adelettrer.length > 0) {
    const liste = r.adelettrer.slice(0, 10).map(nommerLettrageACheval).join(' ; ');
    const plus = r.adelettrer.length - 10;
    const reste = r.tronqueADelettrer ? ', et d’autres encore' : plus > 0 ? `, et ${plus} autre(s)` : '';
    const nombre = r.tronqueADelettrer ? `Plus de ${PLAFOND_LETTRAGES_A_CHEVAL}` : String(r.adelettrer.length);
    morceaux.push(
      `${nombre} lettrage(s) mêlent des lignes de cet exercice et d'un autre exercice ouvert · ${liste}${reste}. ` +
        "Un lettrage ne mêle pas deux exercices · le règlement d'un exercice suivant se lettre contre la ligne d'à-nouveau qui reporte la facture " +
        "(report en mode Détail). Issue · délettrez ces groupes depuis Interrogation et lettrage tant que les deux exercices sont ouverts, " +
        "lettrez entre elles les lignes de cet exercice, clôturez, puis lettrez dans l'exercice suivant ses lignes avec les lignes d'à-nouveau. " +
        "Ici, et ici seulement, délettrer est l'issue · un écart de change déjà passé reste au journal et se lettre avec les lignes de son exercice, sans être repassé.",
    );
  }
  if (figes.length > 0) {
    morceaux.push(
      `${figes.length} lettrage(s) soldé(s) mêlent des lignes de cet exercice et d'un exercice déjà clôturé · ${figes.slice(0, 10).map(nommerLettrageACheval).join(' ; ')}. ` +
        "Leurs lignes de cet exercice sortiraient du report à-nouveau sans s'y solder. Ils ne se délettrent plus (exercice clôturé) · " +
        "aucun geste d'OmegaX ne lève encore ce refus ; signalez-le au support avec ces références.",
    );
  }
  return morceaux.join(' ');
}
