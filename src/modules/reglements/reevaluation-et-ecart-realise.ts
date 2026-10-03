import type { PrismaService } from '../../common/prisma.service';
import { groupesDenoues, positionDesLignes } from '../devises/perimetre-reevaluation';

type Lecteur = Pick<PrismaService, 'reevaluation' | 'ligneEcriture' | 'coursDevise'>;

const jour = (d: Date) => d.toISOString().slice(0, 10);

/**
 * L'ÉCART PROPOSÉ A-T-IL DÉJÀ ÉTÉ RÉÉVALUÉ ? (ligne A6, relecture adverse B1)
 *
 * Une réévaluation des devises de l'exercice, datée au plus tôt du
 * dénouement, a pu lire les lignes du groupe quand elles n'y étaient pas
 * encore (le solde ajouté à la main APRÈS la réévaluation), ou sous une règle
 * plus ancienne · elle a alors porté le réalisé au 478 ou 479 et en provision
 * (art. 54, A5), et le passer maintenant au 656 ou 676 le compterait deux
 * fois. Le défaut ne se voit nulle part · deux écritures équilibrées.
 *
 * LA PREUVE SE LIT SUR L'ÉCRITURE DE LA RÉÉVALUATION · l'écart qu'elle a passé
 * sur le compte du groupe est confronté à celui que la règle d'aujourd'hui
 * aurait passé, groupes dénoués écartés (`groupesDenoues`), au cours en
 * vigueur à sa date. Égaux au centime, le groupe n'a pas été lu, rien ne
 * s'oppose. Différents, ou un cours introuvable, le passage est refusé · un
 * refus se lève, un double comptage ne se voit plus.
 *
 * `null` si rien ne s'oppose, sinon le motif nommé et l'issue.
 */
export async function motifReevaluationDejaPassee(
  prisma: Lecteur,
  p: { tenantId: string; exerciceId: string; compteId: string; compteNumero: string; deviseId: string; denouement: Date },
): Promise<string | null> {
  const reeval = await prisma.reevaluation.findFirst({
    where: { tenantId: p.tenantId, exerciceId: p.exerciceId },
    select: {
      dateReevaluation: true,
      ecritureEcarts: { select: { lignes: { where: { compteId: p.compteId }, select: { debit: true, credit: true } } } },
    },
  });
  if (!reeval || !reeval.ecritureEcarts) return null;
  if (jour(reeval.dateReevaluation) < jour(p.denouement)) return null;
  const surLeCompte = reeval.ecritureEcarts.lignes;
  if (surLeCompte.length === 0) return null;
  const passe = Math.round(surLeCompte.reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0) * 100) / 100;

  const lignes = (
    await prisma.ligneEcriture.findMany({
      where: {
        compteId: p.compteId,
        deviseId: p.deviseId,
        lettre: null,
        ecriture: { tenantId: p.tenantId, exerciceId: p.exerciceId, date: { lte: reeval.dateReevaluation } },
      },
      select: { debit: true, credit: true, montantDevise: true, lettrageId: true },
    })
  ).map((l) => ({
    debit: Number(l.debit),
    credit: Number(l.credit),
    montantDevise: l.montantDevise === null ? null : Number(l.montantDevise),
    lettrageId: l.lettrageId,
  }));
  const ids = [...new Set(lignes.flatMap((l) => (l.lettrageId ? [l.lettrageId] : [])))];
  const denoues = ids.length
    ? groupesDenoues(
        (
          await prisma.ligneEcriture.findMany({
            where: { lettrageId: { in: ids }, ecriture: { tenantId: p.tenantId, date: { lte: reeval.dateReevaluation } } },
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
      )
    : new Map();
  const position = positionDesLignes(lignes.filter((l) => !l.lettrageId || !denoues.has(l.lettrageId)));
  const cote = await prisma.coursDevise.findFirst({
    where: { deviseId: p.deviseId, date: { lte: reeval.dateReevaluation } },
    orderBy: { date: 'desc' },
    select: { cours: true },
  });
  // Soldée en devise, la position est dénouée et la règle d'aujourd'hui ne
  // la réévalue pas (`motifPositionDenouee`) · zéro attendu.
  const attendu =
    Math.abs(position.montantDevise) < 0.005
      ? 0
      : cote
        ? Math.round((Math.round(position.montantDevise * Number(cote.cours) * 100) / 100 - position.valeurComptable) * 100) / 100
        : null;
  if (attendu !== null && Math.abs(attendu - passe) <= 0.01) return null;
  return (
    `La réévaluation des devises du ${jour(reeval.dateReevaluation)} a déjà porté ce dénouement du ${p.compteNumero} au 478 ou au 479, ` +
    'et sa perte en provision · passer l’écart réalisé le compterait deux fois (AUDCIF art. 54 et 55). Issue · retirer cette ' +
    'réévaluation, passer l’écart, puis réévaluer l’exercice. OmegaX n’offre aucun geste qui retire une réévaluation passée · ' +
    'la correction se décide avec l’administrateur du dossier.'
  );
}
