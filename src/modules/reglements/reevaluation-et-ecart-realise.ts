import type { PrismaService } from '../../common/prisma.service';
import { groupesDenoues, positionDesLignes } from '../devises/perimetre-reevaluation';

type Lecteur = Pick<PrismaService, 'reevaluation' | 'ligneEcriture' | 'coursDevise' | 'exercice'>;

const jour = (d: Date) => d.toISOString().slice(0, 10);
const centimes = (x: number) => Math.round(x * 100) / 100;

/** Une ligne en devise du compte, telle qu'elle était à la réévaluation. */
export interface LigneAReconstituer {
  id?: string;
  deviseId: string;
  debit: number;
  credit: number;
  montantDevise: number | null;
  /** Le groupe AUQUEL ELLE APPARTENAIT À LA RÉÉVALUATION, ou `null`. */
  lettrageId: string | null;
}

/**
 * L'ÉCART QUE LA RÉÉVALUATION AURAIT PASSÉ SUR LE COMPTE, toutes devises
 * comprises · l'écriture des écarts pose ses lignes sur le compte du tiers
 * SANS devise (`DevisesService`, écriture des écarts), si bien que ce qu'elle
 * a passé se lit en un TOTAL du compte, et se confronte à un total. Par
 * devise, la règle de `DevisesService.calculer` · une position soldée dans sa
 * devise ne se réévalue pas, une devise sans cours non plus ; sinon le
 * montant en devise au cours, moins la valeur comptable. Les groupes dénoués
 * sont écartés, sauf `inclus`, le groupe que l'on suppose lu tel qu'il était.
 */
export function ecartReconstitue(
  lignes: LigneAReconstituer[],
  denoues: ReadonlySet<string>,
  cours: ReadonlyMap<string, number | null>,
  inclus: string | null,
): number {
  let total = 0;
  for (const e of ecartsParDevise(lignes, denoues, cours, inclus).values()) total += e.ecart;
  return centimes(total);
}

/**
 * LA MÊME RECONSTITUTION, DEVISE PAR DEVISE · le montant en devise de la
 * position et son écart. Une devise que la réévaluation n'a pas réévaluée
 * (position soldée dans sa devise, ou sans cours) rend un écart NUL.
 */
export function ecartsParDevise(
  lignes: LigneAReconstituer[],
  denoues: ReadonlySet<string>,
  cours: ReadonlyMap<string, number | null>,
  inclus: string | null,
): Map<string, { montantDevise: number; ecart: number }> {
  const retenues = lignes.filter((l) => !l.lettrageId || l.lettrageId === inclus || !denoues.has(l.lettrageId));
  const parDevise = new Map<string, { montantDevise: number; ecart: number }>();
  for (const deviseId of new Set(retenues.map((l) => l.deviseId))) {
    const p = positionDesLignes(retenues.filter((l) => l.deviseId === deviseId));
    const c = cours.get(deviseId) ?? null;
    const ecart = Math.abs(p.montantDevise) < 0.005 || c === null ? 0 : centimes(centimes(p.montantDevise * c) - p.valeurComptable);
    parDevise.set(deviseId, { montantDevise: p.montantDevise, ecart });
  }
  return parDevise;
}

/** Ce que la réévaluation de l'exercice a lu et passé sur un compte. */
interface LectureDeLaReevaluation {
  date: Date;
  creeeLe: Date;
  passe: number;
  lignes: LigneAReconstituer[];
  denoues: Set<string>;
  cours: Map<string, number | null>;
}

/**
 * LE COMPTE TEL QU'IL ÉTAIT À LA RÉÉVALUATION DE L'EXERCICE, ou `null` sans
 * réévaluation ou si son écriture n'a rien passé sur le compte.
 *
 *  · Les écritures datées au plus tard d'elle et SAISIES avant elle · sauf
 *    l'à-nouveau daté du début de l'exercice (relecture adverse, M1) · un
 *    à-nouveau provisoire se RECRÉE (`retirerANouveauProvisoire` puis une
 *    nouvelle écriture), et son `createdAt` postérieur ne dit pas qu'il
 *    n'existait pas.
 *  · Les lignes ouvertes à ce moment · non lettrées, ou lettrées SOLDE après
 *    elle. NB · `soldeAt` des groupes antérieurs au 29/08/2026 a été posé par
 *    la migration `20260829160000_lettrage_professionnel` (M2) · lu tel quel.
 *  · LES GROUPES D'ALORS (relecture adverse B2) · un groupe créé après elle
 *    (`Lettrage.createdAt`) n'existait pas · ses lignes se lisent NON
 *    LETTRÉES, sauf le groupe `cible`, que l'appelant bascule lui-même.
 *  · Le cours en vigueur à sa date · l'enregistrement ne garde pas le cours.
 */
async function lireLaReevaluation(
  prisma: Lecteur,
  p: { tenantId: string; exerciceId: string; compteId: string; cible: string | null },
): Promise<LectureDeLaReevaluation | null> {
  const reeval = await prisma.reevaluation.findFirst({
    // Une réévaluation ANNULÉE (D6) n'a plus rien porté au 478.
    where: { tenantId: p.tenantId, exerciceId: p.exerciceId, annuleeLe: null },
    select: {
      dateReevaluation: true,
      createdAt: true,
      ecritureEcarts: { select: { lignes: { where: { compteId: p.compteId }, select: { debit: true, credit: true } } } },
    },
  });
  if (!reeval || !reeval.ecritureEcarts || reeval.ecritureEcarts.lignes.length === 0) return null;
  const passe = centimes(reeval.ecritureEcarts.lignes.reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0));
  const exercice = await prisma.exercice.findFirst({ where: { id: p.exerciceId, tenantId: p.tenantId }, select: { dateDebut: true } });

  const telQuIlEtait = {
    tenantId: p.tenantId,
    exerciceId: p.exerciceId,
    date: { lte: reeval.dateReevaluation },
    OR: [
      { createdAt: { lte: reeval.createdAt } },
      ...(exercice
        ? [
            {
              date: exercice.dateDebut,
              OR: [{ estANouveauProvisoire: true }, { estGenereeParCloture: true, estSoldeDesComptesDeGestion: false }],
            },
          ]
        : []),
    ],
  };
  const groupeDAlors = (l: { lettrageId: string | null; lettrage: { createdAt: Date } | null }) =>
    l.lettrageId && (l.lettrageId === p.cible || (l.lettrage && l.lettrage.createdAt <= reeval.createdAt)) ? l.lettrageId : null;

  const lignes: LigneAReconstituer[] = (
    await prisma.ligneEcriture.findMany({
      where: {
        compteId: p.compteId,
        deviseId: { not: null },
        ecriture: telQuIlEtait,
        // Ouverte à la réévaluation · non lettrée, ou lettrée SOLDE après elle.
        OR: [{ lettre: null }, { lettrage: { soldeAt: { gt: reeval.createdAt } } }],
      },
      select: {
        id: true,
        deviseId: true,
        debit: true,
        credit: true,
        montantDevise: true,
        lettrageId: true,
        lettrage: { select: { createdAt: true } },
      },
    })
  ).map((l) => ({
    id: l.id,
    deviseId: l.deviseId!,
    debit: Number(l.debit),
    credit: Number(l.credit),
    montantDevise: l.montantDevise === null ? null : Number(l.montantDevise),
    lettrageId: groupeDAlors(l),
  }));
  const ids = [...new Set(lignes.flatMap((l) => (l.lettrageId ? [l.lettrageId] : [])))];
  const denoues = new Set(
    ids.length
      ? groupesDenoues(
          (
            await prisma.ligneEcriture.findMany({
              where: { lettrageId: { in: ids }, ecriture: telQuIlEtait },
              select: { lettrageId: true, debit: true, credit: true, deviseId: true, montantDevise: true },
            })
          ).map((l) => ({
            lettrageId: l.lettrageId!,
            code: '',
            debit: Number(l.debit),
            credit: Number(l.credit),
            deviseId: l.deviseId,
            montantDevise: l.montantDevise === null ? null : Number(l.montantDevise),
          })),
        ).keys()
      : [],
  );
  const cours = new Map<string, number | null>();
  for (const deviseId of new Set(lignes.map((l) => l.deviseId))) {
    const cote = await prisma.coursDevise.findFirst({
      where: { deviseId, date: { lte: reeval.dateReevaluation } },
      orderBy: { date: 'desc' },
      select: { cours: true },
    });
    cours.set(deviseId, cote ? Number(cote.cours) : null);
  }
  return { date: reeval.dateReevaluation, creeeLe: reeval.createdAt, passe, lignes, denoues, cours };
}

/**
 * LA PHRASE DU REFUS, une seule · elle dit ce qui serait compté deux fois, et
 * NOMME LE GESTE (décision D6) · annuler la réévaluation (inscription en
 * négatif, AUDCIF art. 20, al. 2), passer l'écart, réévaluer. Aucun autre
 * chemin · passer le réalisé en laissant le 478 et sa provision recompterait
 * la perte.
 */
export function motifDejaReevalue(p: { date: Date; creeeLe: Date; compteNumero: string; objet: string }): string {
  return (
    `La réévaluation des devises du ${jour(p.date)}, passée le ${jour(p.creeeLe)}, a lu ${p.objet} du ${p.compteNumero} et ` +
    'porté son écart au 478 ou au 479, avec sa provision pour pertes de change · passer maintenant le réalisé au 656 ou au 676 ' +
    'compterait la perte deux fois (AUDCIF art. 54 et 55). Rien n’est passé. Issue · annulez cette réévaluation (Devises, ' +
    '« Annuler la réévaluation », motif exigé · AUDCIF art. 20, al. 2), passez l’écart réalisé, puis réévaluez l’exercice.'
  );
}

export type IssueReevaluation = { refus: string } | { avertissement: string } | null;

/**
 * L'ÉCART PROPOSÉ A-T-IL DÉJÀ ÉTÉ RÉÉVALUÉ ? (ligne A6, relectures adverses B1)
 *
 * DEUX RECONSTITUTIONS du compte tel qu'il était (`lireLaReevaluation`) ·
 * (a) le groupe écarté · elle concorde, rien ne s'oppose ; (b) le groupe lu ·
 * elle concorde, refus. Ni l'une ni l'autre (cours corrigé, lettrages ou
 * écritures changés) · on ne sait pas, et l'on ne dit JAMAIS « déjà porté » ·
 * avertissement, l'écart passe. Une seule réévaluation par exercice (index
 * unique).
 */
export async function issueReevaluationDejaPassee(
  prisma: Lecteur,
  p: {
    tenantId: string;
    exerciceId: string;
    compteId: string;
    compteNumero: string;
    lettrageId: string;
  },
): Promise<IssueReevaluation> {
  // AUCUN RETOUR SUR LA DATE DU DÉNOUEMENT (quatrième relecture) · une
  // réévaluation datée AVANT la fin de l'exercice (30/09) a pu lire la
  // facture d'un groupe dénoué ensuite (15/11) · elle a porté son écart au
  // 478 et en provision, et l'écart proposé le compterait une seconde fois.
  // La reconstitution suffit · un dénouement postérieur dont la facture
  // était déjà là se lit en (b) ; une facture postérieure à la réévaluation
  // n'y est pas, et (a) concorde.
  const lu = await lireLaReevaluation(prisma, { ...p, cible: p.lettrageId });
  if (!lu) return null;
  const tolerance = 0.01 * Math.max(1, lu.cours.size);
  // La cible se bascule · écartée en (a), lue en (b), qu'elle ait existé ou non.
  const avecCible = new Set([...lu.denoues, p.lettrageId]);
  const sansLeGroupe = ecartReconstitue(lu.lignes, avecCible, lu.cours, null);
  if (Math.abs(sansLeGroupe - lu.passe) <= tolerance) return null;
  const avecLeGroupe = ecartReconstitue(lu.lignes, lu.denoues, lu.cours, p.lettrageId);
  if (Math.abs(avecLeGroupe - lu.passe) <= tolerance) {
    // La concordance ne suffit pas · la devise du GROUPE doit avoir été
    // réellement réévaluée, position ET écart non nuls (cinquième relecture,
    // M-A ; même filtre que `motifReglementDejaReevalue`). Sinon le total
    // concorde par une autre devise (l'EUR seul), et rien du groupe n'est au
    // 478.
    const devisesDuGroupe = new Set(lu.lignes.filter((l) => l.lettrageId === p.lettrageId).map((l) => l.deviseId));
    const parDevise = ecartsParDevise(lu.lignes, lu.denoues, lu.cours, p.lettrageId);
    const porte = [...devisesDuGroupe].some((d) => {
      const e = parDevise.get(d);
      return e !== undefined && Math.abs(e.montantDevise) >= 0.005 && Math.abs(e.ecart) >= 0.005;
    });
    if (!porte) return null;
    return { refus: motifDejaReevalue({ date: lu.date, creeeLe: lu.creeeLe, compteNumero: p.compteNumero, objet: 'ce dénouement' }) };
  }
  return {
    avertissement:
      `Des lettrages ou des écritures ont changé depuis la réévaluation des devises du ${jour(lu.date)} sur le ${p.compteNumero} · ` +
      `elle y a passé ${lu.passe.toFixed(2)}, que le compte d'aujourd'hui ne reconstitue ni avec ni sans ce lettrage. ` +
      "L'écart est passé ; vérifiez les lignes de cette réévaluation sur le compte.",
  };
}

/**
 * UN RÈGLEMENT EN DEVISE DONT LA FACTURE A ÉTÉ RÉÉVALUÉE (relecture adverse,
 * bloquant 1) · la réévaluation de l'exercice a lu une facture choisie (elle
 * était ouverte, datée et saisie avant elle, et sa devise avait un cours),
 * porté son écart au 478 et en provision ; le règlement passerait le réalisé
 * au 656 ou 676 contre le coût historique · deux fois la même perte dans le
 * même exercice. Refus avant la première pièce, sinon `null`.
 */
export async function motifReglementDejaReevalue(
  prisma: Lecteur,
  p: { tenantId: string; exerciceId: string; compteId: string; compteNumero: string; ligneIds: string[] },
): Promise<string | null> {
  const lu = await lireLaReevaluation(prisma, { tenantId: p.tenantId, exerciceId: p.exerciceId, compteId: p.compteId, cible: null });
  if (!lu) return null;
  // Seules les devises que la réévaluation a RÉELLEMENT réévaluées · position
  // non nulle dans sa devise ET écart non nul (quatrième relecture, M1) · une
  // facture au cours de clôture, ou une devise soldée pendant qu'une autre
  // l'était, n'a rien porté au 478.
  const reevaluees = ecartsParDevise(lu.lignes, lu.denoues, lu.cours, null);
  const lues = lu.lignes.filter((l) => {
    const e = reevaluees.get(l.deviseId);
    return l.id && p.ligneIds.includes(l.id) && e !== undefined && Math.abs(e.montantDevise) >= 0.005 && Math.abs(e.ecart) >= 0.005;
  });
  if (lues.length === 0) return null;
  return motifDejaReevalue({
    date: lu.date,
    creeeLe: lu.creeeLe,
    compteNumero: p.compteNumero,
    objet: lues.length > 1 ? `${lues.length} des factures choisies` : 'une facture choisie',
  });
}

/**
 * LE RÈGLEMENT EN N+1 D'UNE FACTURE RÉÉVALUÉE EN N, réévaluation NON
 * CONTRE-PASSÉE (quatrième relecture M3, cinquième M-B) · l'écart de
 * conversion se contre-passe à l'ouverture de l'exercice suivant
 * (`DevisesService.extourner`) ; oubliée, le 478 ou le 479 et sa provision
 * restent pendant que le réalisé passe au 656 ou 676. Un AVERTISSEMENT,
 * jamais un refus · la contre-passation se passe encore. Ne vise que
 *  · la réévaluation de l'exercice qui PRÉCÈDE IMMÉDIATEMENT (une de N-2
 *    s'est contre-passée, ou non, à l'ouverture de N-1, pas de N) ;
 *  · les lignes choisies (ou du groupe) issues d'une écriture d'À-NOUVEAU
 *    (à-nouveau provisoire, ou report de clôture qui n'est pas le solde des
 *    comptes de gestion), comme `lireLaReevaluation` · une facture ordinaire
 *    du 1er janvier n'a pas été réévaluée ;
 *  · les devises que cette réévaluation a RÉELLEMENT portées sur le compte
 *    (position et écart reconstitués non nuls, `ecartsParDevise`).
 */
export async function avertissementExtourneManquante(
  prisma: Lecteur,
  p: { tenantId: string; exerciceId: string; compteId: string; compteNumero: string; ligneIds: string[] },
): Promise<string | null> {
  const exercice = await prisma.exercice.findFirst({ where: { id: p.exerciceId, tenantId: p.tenantId }, select: { dateDebut: true } });
  if (!exercice) return null;
  const precedent = await prisma.exercice.findFirst({
    where: { tenantId: p.tenantId, dateFin: { lt: exercice.dateDebut } },
    orderBy: { dateFin: 'desc' },
    select: { id: true },
  });
  if (!precedent) return null;
  const reeval = await prisma.reevaluation.findFirst({
    where: { tenantId: p.tenantId, exerciceId: precedent.id, annuleeLe: null },
    select: { ecritureExtourneId: true },
  });
  if (!reeval || reeval.ecritureExtourneId !== null) return null;
  const ouverture = await prisma.ligneEcriture.findMany({
    where: {
      id: { in: p.ligneIds },
      deviseId: { not: null },
      ecriture: {
        tenantId: p.tenantId,
        exerciceId: p.exerciceId,
        date: exercice.dateDebut,
        OR: [{ estANouveauProvisoire: true }, { estGenereeParCloture: true, estSoldeDesComptesDeGestion: false }],
      },
    },
    select: { deviseId: true },
  });
  if (ouverture.length === 0) return null;
  const lu = await lireLaReevaluation(prisma, { tenantId: p.tenantId, exerciceId: precedent.id, compteId: p.compteId, cible: null });
  if (!lu) return null;
  const parDevise = ecartsParDevise(lu.lignes, lu.denoues, lu.cours, null);
  const portee = ouverture.some((l) => {
    const e = l.deviseId ? parDevise.get(l.deviseId) : undefined;
    return e !== undefined && Math.abs(e.montantDevise) >= 0.005 && Math.abs(e.ecart) >= 0.005;
  });
  if (!portee) return null;
  return (
    `${p.compteNumero} · la réévaluation des devises du ${jour(lu.date)} n'a pas été contre-passée à l'ouverture · ` +
    'le 478 ou le 479 de cette facture et sa provision restent en place pendant que le réalisé est passé. ' +
    'Passez la contre-passation de cette réévaluation (Devises).'
  );
}
