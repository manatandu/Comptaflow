import type { PrismaService } from '../../common/prisma.service';
import { groupesDenoues, positionDesLignes } from '../devises/perimetre-reevaluation';

type Lecteur = Pick<PrismaService, 'reevaluation' | 'ligneEcriture' | 'coursDevise'>;

const jour = (d: Date) => d.toISOString().slice(0, 10);
const centimes = (x: number) => Math.round(x * 100) / 100;

/** Une ligne en devise du compte, telle qu'elle était à la réévaluation. */
export interface LigneAReconstituer {
  deviseId: string;
  debit: number;
  credit: number;
  montantDevise: number | null;
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
  const retenues = lignes.filter((l) => !l.lettrageId || l.lettrageId === inclus || !denoues.has(l.lettrageId));
  let total = 0;
  for (const deviseId of new Set(retenues.map((l) => l.deviseId))) {
    const p = positionDesLignes(retenues.filter((l) => l.deviseId === deviseId));
    const c = cours.get(deviseId) ?? null;
    if (Math.abs(p.montantDevise) < 0.005 || c === null) continue;
    total += centimes(centimes(p.montantDevise * c) - p.valeurComptable);
  }
  return centimes(total);
}

export type IssueReevaluation = { refus: string } | { avertissement: string } | null;

/**
 * L'ÉCART PROPOSÉ A-T-IL DÉJÀ ÉTÉ RÉÉVALUÉ ? (ligne A6, relectures adverses B1)
 *
 * Une réévaluation des devises de l'exercice, datée au plus tôt du
 * dénouement, a pu lire les lignes du groupe quand elles n'y étaient pas
 * encore (le solde ajouté au groupe APRÈS elle) · elle a alors porté le
 * réalisé au 478 ou 479 et en provision (art. 54, A5), et le passer au 656 ou
 * 676 le compterait deux fois.
 *
 * DEUX RECONSTITUTIONS DU COMPTE TEL QU'IL ÉTAIT À LA RÉÉVALUATION, toutes
 * devises, au cours en vigueur à sa date (l'enregistrement ne garde pas le
 * cours) · lignes datées au plus tard d'elle, SAISIES avant elle, lettrées
 * SOLDE après elle comprises (elles étaient ouvertes) ; (a) le groupe écarté
 * · elle concorde, rien ne s'oppose ; (b) le groupe lu · elle concorde, refus.
 * Ni l'une ni l'autre (cours corrigé depuis, compte retouché) · on ne sait
 * pas, et l'on ne dit JAMAIS « déjà porté » · avertissement, l'écart passe.
 * Une seule réévaluation par exercice (index unique).
 */
export async function issueReevaluationDejaPassee(
  prisma: Lecteur,
  p: {
    tenantId: string;
    exerciceId: string;
    compteId: string;
    compteNumero: string;
    lettrageId: string;
    denouement: Date;
  },
): Promise<IssueReevaluation> {
  const reeval = await prisma.reevaluation.findFirst({
    where: { tenantId: p.tenantId, exerciceId: p.exerciceId },
    select: {
      dateReevaluation: true,
      createdAt: true,
      ecritureEcarts: { select: { lignes: { where: { compteId: p.compteId }, select: { debit: true, credit: true } } } },
    },
  });
  if (!reeval || !reeval.ecritureEcarts) return null;
  if (jour(reeval.dateReevaluation) < jour(p.denouement)) return null;
  const passe = centimes(reeval.ecritureEcarts.lignes.reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0));

  const telQuIlEtait = {
    tenantId: p.tenantId,
    exerciceId: p.exerciceId,
    date: { lte: reeval.dateReevaluation },
    createdAt: { lte: reeval.createdAt },
  };
  const lignes: LigneAReconstituer[] = (
    await prisma.ligneEcriture.findMany({
      where: {
        compteId: p.compteId,
        deviseId: { not: null },
        ecriture: telQuIlEtait,
        // Ouverte à la réévaluation · non lettrée, ou lettrée SOLDE après elle.
        OR: [{ lettre: null }, { lettrage: { soldeAt: { gt: reeval.createdAt } } }],
      },
      select: { deviseId: true, debit: true, credit: true, montantDevise: true, lettrageId: true },
    })
  ).map((l) => ({
    deviseId: l.deviseId!,
    debit: Number(l.debit),
    credit: Number(l.credit),
    montantDevise: l.montantDevise === null ? null : Number(l.montantDevise),
    lettrageId: l.lettrageId,
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
  const tolerance = 0.01 * Math.max(1, cours.size);
  const sansLeGroupe = ecartReconstitue(lignes, denoues, cours, null);
  if (Math.abs(sansLeGroupe - passe) <= tolerance) return null;
  const avecLeGroupe = ecartReconstitue(lignes, denoues, cours, p.lettrageId);
  const date = jour(reeval.dateReevaluation);
  if (Math.abs(avecLeGroupe - passe) <= tolerance) {
    return {
      refus:
        `La réévaluation des devises du ${date} a déjà porté ce dénouement du ${p.compteNumero} au 478 ou au 479, ` +
        'et sa perte en provision · passer l’écart réalisé le compterait deux fois (AUDCIF art. 54 et 55). Issue · retirer cette ' +
        'réévaluation, passer l’écart, puis réévaluer l’exercice. OmegaX n’offre aucun geste qui retire une réévaluation passée · ' +
        'la correction se décide avec l’administrateur du dossier.',
    };
  }
  return {
    avertissement:
      `Le compte ${p.compteNumero} a changé depuis la réévaluation des devises du ${date} (cours corrigé, écriture retouchée) · ` +
      `elle y a passé ${passe.toFixed(2)}, que le compte d'aujourd'hui ne reconstitue ni avec ni sans ce lettrage. ` +
      "L'écart est passé ; vérifiez les lignes de cette réévaluation sur le compte.",
  };
}
