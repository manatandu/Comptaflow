import type { PrismaService } from '../../common/prisma.service';
import { lireParLots, LOT_LECTURE, pageApres } from '../../common/lecture-par-lots';
import { type ClotureActive, motifLigneFigee } from '../exercice/gel-cloture';
import { comptesPrescrits, natureDuCompte, type Referentiel } from '../reglements/ecart-change-realise';

/**
 * LES LETTRAGES À CHEVAL DE DEUX EXERCICES (ligne A6 bis, B2, refait au
 * premier tour de relecture).
 *
 * LA DOCTRINE est en tête de `lettrage.service.ts` et au § 3 de
 * `docs/organisation-comptable-cpcc.md` · « un règlement de mars qui solde
 * une facture de décembre se lettre contre la ligne de REPORT À-NOUVEAU de
 * l'exercice ouvert (MODE DÉTAIL des comptes de tiers), jamais contre la
 * ligne de l'exercice clos ». Elle vise les comptes au DÉTAIL, dont le report
 * reprend un à un les mouvements ouverts ; un compte au SOLDE ne reporte que
 * son solde, et un salaire de décembre payé en janvier se lettre librement.
 *
 * TROIS RÈGLES.
 *
 * (1) LE REPORT LIT CHAQUE EXERCICE POUR LUI-MÊME (`lireComptesDuReport`,
 * exercice.service.ts) · une ligne lettrée par un groupe qui touche un AUTRE
 * exercice se lit comme NON lettrée pour le report de son exercice. Soldé,
 * un tel groupe posait sa lettre sur des lignes de N qui ne se soldent pas
 * dans N · elles sortaient du report Détail, le report tombait déséquilibré
 * et la clôture répondait « anomalie interne » (500) ; le premier tour
 * d'A6 bis la REFUSAIT, ce qui ENFERMAIT le dossier dès qu'une clôture de
 * période ou d'exercice figeait le groupe (relecture adverse, B-1). Lu ainsi,
 * le report est équilibré par construction, figé ou non, et rien n'est à
 * délettrer pour clôturer. Les groupes déjà en base ne sont pas réécrits
 * (AUDCIF art. 20).
 *
 * (2) UN NOUVEAU GROUPE ENTRE EXERCICES N'EST REFUSÉ QU'AU DÉTAIL
 * (`motifLettrageADeuxExercices`) · au lettrage manuel, au complément, au
 * pré-lettrage confirmé ; le lettrage automatique n'y apparie qu'à
 * l'intérieur d'un exercice. Le refus nomme l'issue · lettrer contre la
 * ligne d'à-nouveau DÉFINITIF une fois l'exercice antérieur clôturé, sinon
 * attendre sa clôture.
 *
 * (3) CE QUI RESTE D'UN GROUPE DÉJÀ À CHEVAL se dit au contrôle des comptes
 * (`lettragesACheval`), jamais à la clôture · au DÉTAIL, la ligne d'à-nouveau
 * de la facture reste ouverte dans l'exercice suivant pendant que son
 * règlement est lettré avec la ligne d'origine (INFORMATION) ; en devise, un
 * groupe soldé dans sa devise et non en francs dont l'écart réalisé n'est
 * pas passé (AVERTISSEMENT, AUDCIF art. 55), avec son issue, l'écriture à la
 * main dans l'exercice du dénouement quand le groupe est figé.
 */

type Lecteur = Pick<PrismaService, 'lettrage' | 'ligneEcriture' | 'cloture'>;

const jour = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Le refus d'un NOUVEAU groupe entre exercices · `null` quand le compte
 * n'est pas reporté au Détail, ou quand toutes les lignes sont d'un même
 * exercice. Nomme une ligne de chaque exercice et dit l'issue.
 */
export function motifLettrageADeuxExercices(
  lignes: Array<{ ecriture: { exerciceId: string; date: Date } }>,
  compte: { numero: string; modeReportANouveau: string },
): string | null {
  if (compte.modeReportANouveau !== 'DETAIL') return null;
  const premiereParExercice = new Map<string, Date>();
  for (const l of lignes) {
    const vue = premiereParExercice.get(l.ecriture.exerciceId);
    if (!vue || l.ecriture.date < vue) premiereParExercice.set(l.ecriture.exerciceId, l.ecriture.date);
  }
  if (premiereParExercice.size <= 1) return null;
  const dates = [...premiereParExercice.values()].sort((a, b) => a.getTime() - b.getTime()).map(jour);
  return (
    `Le compte ${compte.numero} est reporté en mode Détail, et ces lignes appartiennent à ${premiereParExercice.size} exercices ` +
    `(lignes du ${dates.join(', du ')}) · la facture d'un exercice antérieur passe dans l'exercice suivant par la ligne d'à-nouveau ` +
    "qui la reporte, et c'est cette ligne qui se lettre avec le règlement. Lettrez le règlement contre la ligne d'à-nouveau DÉFINITIF " +
    "une fois l'exercice antérieur clôturé ; tant qu'il ne l'est pas, attendez sa clôture (un lettrage posé sur l'à-nouveau provisoire " +
    "empêcherait de le remplacer à la clôture)."
  );
}

/** Un groupe de lettrage qui mêle l'exercice lu et un autre. */
export interface LettrageACheval {
  lettrageId: string;
  /** Tel qu'il s'affiche · minuscule partiel, majuscule soldé. */
  code: string;
  statut: 'PARTIEL' | 'SOLDE';
  compteNumero: string;
  /** Le compte est reporté au Détail · c'est là que le groupe laisse une ligne ouverte. */
  auDetail: boolean;
  /** Les AUTRES exercices du groupe, par leurs bornes. */
  autresExercices: Array<{ dateDebut: Date; dateFin: Date; clos: boolean }>;
  /** Une de ses lignes est figée (exercice, journal ou période clôturés, `gel-cloture.ts`) · il ne se complète ni ne se délettre. */
  fige: boolean;
  /**
   * L'écart de change réalisé NON PASSÉ · groupe partiel soldé dans sa seule
   * devise sur l'ensemble de ses lignes et pas en francs, dont la dernière
   * ligne (le dénouement) est dans l'exercice lu. Signé, positif pour une
   * perte ; `null` sinon.
   */
  ecartNonPasse: number | null;
  /** La date de sa dernière ligne · celle du dénouement. */
  denouement: Date;
}

/** Plafond de groupes lus · au-delà, le dépassement est dit. */
export const PLAFOND_LETTRAGES_A_CHEVAL = 200;

/** Ce que rend la lecture · bornée, et qui dit si elle l'est. */
export interface LettragesACheval {
  groupes: LettrageACheval[];
  tronque: boolean;
}

/** Ce qu'un groupe accumule, tranche après tranche. */
interface Cumul {
  autres: Map<string, { dateDebut: Date; dateFin: Date; clos: boolean }>;
  fige: boolean;
  centimes: number;
  devises: Set<string>;
  soldeDevise: number;
  enDevise: number;
  derniere: { date: Date; exerciceId: string } | null;
}

/**
 * LES GROUPES À CHEVAL D'UN EXERCICE · ceux qui ont une ligne dans l'exercice
 * lu et une ligne dans un autre. Une lecture bornée des groupes, puis de
 * TOUTES leurs lignes, par tranches (§ 8 bis) · leurs autres exercices, s'ils
 * sont figés (même règle que le lettrage, lue une fois sur les clôtures
 * actives), et leur solde en devise et en francs sur l'ensemble, la règle
 * d'`ecartDuGroupe` appliquée en flux.
 */
export async function lettragesACheval(prisma: Lecteur, p: { tenantId: string; exerciceId: string }): Promise<LettragesACheval> {
  const [lus, clotures] = await Promise.all([
    prisma.lettrage.findMany({
      where: {
        tenantId: p.tenantId,
        AND: [
          { lignes: { some: { ecriture: { tenantId: p.tenantId, exerciceId: p.exerciceId } } } },
          { lignes: { some: { ecriture: { tenantId: p.tenantId, exerciceId: { not: p.exerciceId } } } } },
        ],
      },
      select: { id: true, code: true, statut: true, compte: { select: { numero: true, modeReportANouveau: true } } },
      orderBy: { id: 'asc' },
      take: PLAFOND_LETTRAGES_A_CHEVAL + 1,
    }),
    prisma.cloture.findMany({
      where: { tenantId: p.tenantId, annuleeAt: null, granularite: { not: 'PARTIELLE' } },
      select: { granularite: true, journalId: true, dateLimite: true },
    }) as Promise<ClotureActive[]>,
  ]);
  const retenus = lus.slice(0, PLAFOND_LETTRAGES_A_CHEVAL);
  const resultat: LettragesACheval = { groupes: [], tronque: lus.length > PLAFOND_LETTRAGES_A_CHEVAL };
  if (retenus.length === 0) return resultat;

  const cumuls = new Map<string, Cumul>();
  for (const g of retenus) {
    cumuls.set(g.id, { autres: new Map(), fige: false, centimes: 0, devises: new Set(), soldeDevise: 0, enDevise: 0, derniere: null });
  }
  await lireParLots(
    (curseur) =>
      prisma.ligneEcriture.findMany({
        where: { lettrageId: { in: retenus.map((g) => g.id) }, ecriture: { tenantId: p.tenantId } },
        select: {
          id: true,
          lettrageId: true,
          debit: true,
          credit: true,
          deviseId: true,
          montantDevise: true,
          ecriture: {
            select: {
              date: true,
              journalId: true,
              journal: { select: { code: true } },
              exerciceId: true,
              exercice: { select: { statut: true, dateDebut: true, dateFin: true } },
            },
          },
        },
        ...pageApres(curseur, LOT_LECTURE),
      }),
    (l) => {
      const c = l.lettrageId ? cumuls.get(l.lettrageId) : undefined;
      if (!c) return;
      const debit = Number(l.debit);
      const credit = Number(l.credit);
      const clos = l.ecriture.exercice.statut === 'CLOTURE';
      if (l.ecriture.exerciceId !== p.exerciceId) {
        c.autres.set(l.ecriture.exerciceId, { dateDebut: l.ecriture.exercice.dateDebut, dateFin: l.ecriture.exercice.dateFin, clos });
      }
      if (
        !c.fige &&
        motifLigneFigee({ journalId: l.ecriture.journalId, journalCode: l.ecriture.journal.code, date: l.ecriture.date, exerciceClos: clos }, clotures)
      ) {
        c.fige = true;
      }
      c.centimes += Math.round(debit * 100) - Math.round(credit * 100);
      if (l.deviseId !== null && l.montantDevise !== null) {
        c.devises.add(l.deviseId);
        c.enDevise += 1;
        c.soldeDevise += (debit - credit >= 0 ? 1 : -1) * Number(l.montantDevise);
      }
      if (!c.derniere || l.ecriture.date > c.derniere.date) c.derniere = { date: l.ecriture.date, exerciceId: l.ecriture.exerciceId };
    },
  );

  resultat.groupes = retenus
    .map((g) => {
      const c = cumuls.get(g.id)!;
      const statut: LettrageACheval['statut'] = g.statut === 'SOLDE' ? 'SOLDE' : 'PARTIEL';
      const soldeEnDevise = c.enDevise > 0 && c.devises.size === 1 && Math.abs(c.soldeDevise) <= 0.005;
      const denoueIci = c.derniere !== null && c.derniere.exerciceId === p.exerciceId;
      return {
        lettrageId: g.id,
        code: statut === 'SOLDE' ? g.code : g.code.toLowerCase(),
        statut,
        compteNumero: g.compte.numero,
        auDetail: g.compte.modeReportANouveau === 'DETAIL',
        autresExercices: [...c.autres.values()].sort((a, b) => a.dateDebut.getTime() - b.dateDebut.getTime()),
        fige: c.fige,
        ecartNonPasse: statut === 'PARTIEL' && soldeEnDevise && denoueIci && c.centimes !== 0 ? c.centimes / 100 : null,
        denouement: c.derniere?.date ?? new Date(0),
      } satisfies LettrageACheval;
    })
    .sort((a, b) => a.compteNumero.localeCompare(b.compteNumero) || a.code.localeCompare(b.code));
  return resultat;
}

const periode = (e: { dateDebut: Date; dateFin: Date }) => `${jour(e.dateDebut)} au ${jour(e.dateFin)}`;

/** Un groupe nommé · compte, code, état, et les autres exercices qu'il touche. */
export function nommerLettrageACheval(g: LettrageACheval): string {
  return `${g.compteNumero} lettrage ${g.code} (${g.statut === 'SOLDE' ? 'soldé' : 'partiel'}, avec l'exercice du ${g.autresExercices.map(periode).join(' et du ')})`;
}

/**
 * L'issue d'un groupe à cheval d'un compte au DÉTAIL · ce qui reste de lui
 * après la règle (1) est une ligne d'à-nouveau ouverte d'un côté, un
 * règlement lettré de l'autre.
 */
export function issueLettrageACheval(g: LettrageACheval): string {
  if (!g.fige) {
    return (
      `${nommerLettrageACheval(g)} · délettrez-le (Interrogation et lettrage), lettrez entre elles les lignes de chaque exercice, ` +
      "puis, l'exercice antérieur clôturé, le règlement avec la ligne d'à-nouveau définitif."
    );
  }
  return (
    `${nommerLettrageACheval(g)} · figé (une de ses lignes est dans un exercice, un journal ou une période clôturés), il ne se délettre plus, ` +
    "et aucun geste d'OmegaX ne le défait · il s'est formé avant que le lettrage entre exercices ne soit refusé au Détail, ou sur un compte " +
    "passé au mode de report Détail après coup. Relevez-le au dossier de travail pour justifier le détail du compte."
  );
}

/**
 * L'issue d'un écart de change réalisé resté sur un groupe à cheval
 * (AUDCIF art. 55 ; Titre VIII ch. 22 § 2.3) · le compte de change PRESCRIT
 * par la nature du compte et le référentiel (`comptesPrescrits`, D2 au
 * SYCEBNL), jamais un numéro écrit ici.
 */
export function issueEcartACheval(g: LettrageACheval, referentiel: Referentiel): string {
  const ecart = g.ecartNonPasse ?? 0;
  const sens = ecart > 0 ? 'perte' : 'gain';
  const prescrits = comptesPrescrits(referentiel, natureDuCompte(g.compteNumero, referentiel));
  const compte =
    prescrits.perte === null
      ? "au compte de change que le cabinet choisit (la nature du compte, commerciale ou financière, ne se lit pas sur son numéro)"
      : `au ${sens === 'perte' ? prescrits.perte : prescrits.gain}`;
  const montant = `${sens} de change réalisée de ${Math.abs(ecart).toFixed(2)}`;
  if (g.fige) {
    return (
      `${nommerLettrageACheval(g)} · ${montant} non passée, et le groupe, figé, ne se complète plus · passez-la par une écriture ` +
      `manuelle ${compte}, contre le compte ${g.compteNumero}, datée dans l'exercice du dénouement (au plus tôt le ${jour(g.denouement)}), ` +
      "si elle ne l'est pas déjà."
    );
  }
  if (g.auDetail) {
    return (
      `${nommerLettrageACheval(g)} · ${montant} non passée · délettrez le groupe, lettrez le règlement avec la ligne d'à-nouveau définitif ` +
      `une fois l'exercice antérieur clôturé, et l'écart se proposera sur ce groupe ; à défaut, écriture manuelle ${compte} datée au plus tôt le ${jour(g.denouement)}.`
    );
  }
  return `${nommerLettrageACheval(g)} · ${montant} non passée · passez l'écart proposé sur le groupe (Interrogation et lettrage, « Écart de change »).`;
}
