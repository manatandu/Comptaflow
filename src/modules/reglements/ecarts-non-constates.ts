import type { PrismaService } from '../../common/prisma.service';
import { lireParLots, LOT_LECTURE, pageApres } from '../../common/lecture-par-lots';

type Lecteur = Pick<PrismaService, 'ligneEcriture'>;

/** Un groupe de lettrage dénoué dans sa devise dont l'écart réalisé n'est pas passé. */
export interface EcartNonConstate {
  lettrageId: string;
  code: string;
  compteNumero: string;
  /** Signé · positif pour une perte. */
  ecart: number;
}

/** Ce qu'un groupe accumule, tranche après tranche · la règle de `ecartDuGroupe`, en flux. */
interface Cumul {
  code: string;
  compteNumero: string;
  devises: Set<string>;
  soldeDevise: number;
  centimes: number;
}

/**
 * LES ÉCARTS DE CHANGE RÉALISÉS NON CONSTATÉS D'UN EXERCICE (décision D3 du
 * 2026-10-03, Manasse, « réfère-toi à la loi »). AUDCIF art. 55 · « À la date
 * de règlement des créances et dettes, les pertes et gains de change à cette
 * date SONT CONSTATÉS par rapport à leur coût historique » · une obligation
 * de l'exercice du règlement. Un groupe de lettrage PARTIEL dont les lignes
 * de l'exercice sont soldées dans leur devise et pas en francs porte un
 * réalisé que rien n'a passé · la réévaluation l'écarte déjà (art. 54) ;
 * c'est la CLÔTURE qui le refuse, jamais la réévaluation.
 *
 * UN GROUPE À CHEVAL DE DEUX EXERCICES N'EST PAS LU ICI (A6 bis, B2) · ses
 * lignes de l'exercice ne disent pas son dénouement, et l'issue que ce refus
 * nommerait (passer l'écart) lui est refusée (`propositionEcartChange`) · la
 * clôture le nomme AVANT, par `lettragesACheval`, avec SA seule issue,
 * délettrer.
 *
 * LU PAR TRANCHES, SANS BORNE (§ 8 bis, relecture adverse M4) · un exercice
 * aux lettrages partiels nombreux n'est jamais refusé pour son volume ; seuls
 * des cumuls par groupe sont gardés (une seule devise, solde en devise, solde
 * en francs), la règle d'`ecartDuGroupe` appliquée en flux.
 */
export async function ecartsRealisesNonConstates(
  prisma: Lecteur,
  p: { tenantId: string; exerciceId: string },
): Promise<{ ecarts: EcartNonConstate[] }> {
  const cumuls = new Map<string, Cumul>();
  await lireParLots(
    (curseur) =>
      prisma.ligneEcriture.findMany({
        where: {
          lettrageId: { not: null },
          lettre: null,
          // Toutes les lignes du groupe dans l'exercice · un groupe à cheval
          // relève de `lettragesACheval` (A6 bis, B2).
          lettrage: { statut: 'PARTIEL', lignes: { every: { ecriture: { exerciceId: p.exerciceId } } } },
          ecriture: { tenantId: p.tenantId, exerciceId: p.exerciceId },
        },
        select: {
          id: true,
          lettrageId: true,
          debit: true,
          credit: true,
          deviseId: true,
          montantDevise: true,
          lettrage: { select: { code: true, compte: { select: { numero: true } } } },
        },
        ...pageApres(curseur, LOT_LECTURE),
      }),
    (l) => {
      const id = l.lettrageId!;
      const c =
        cumuls.get(id) ??
        ({ code: l.lettrage?.code ?? '', compteNumero: l.lettrage?.compte.numero ?? '?', devises: new Set(), soldeDevise: 0, centimes: 0 } satisfies Cumul);
      const debit = Number(l.debit);
      const credit = Number(l.credit);
      if (l.deviseId !== null && l.montantDevise !== null) {
        c.devises.add(l.deviseId);
        c.soldeDevise += (debit - credit >= 0 ? 1 : -1) * Number(l.montantDevise);
      }
      c.centimes += Math.round(debit * 100) - Math.round(credit * 100);
      cumuls.set(id, c);
    },
  );
  const ecarts = [...cumuls.entries()]
    .filter(([, c]) => c.devises.size === 1 && Math.abs(c.soldeDevise) <= 0.005 && c.centimes !== 0)
    .map(([lettrageId, c]) => ({ lettrageId, code: c.code.toLowerCase(), compteNumero: c.compteNumero, ecart: c.centimes / 100 }))
    .sort((a, b) => a.compteNumero.localeCompare(b.compteNumero) || a.code.localeCompare(b.code));
  return { ecarts };
}

/**
 * Le refus de la clôture, nommé · groupes, comptes, montants, et LES TROIS
 * ISSUES (relecture adverse M3), jamais une qui ferait passer l'écart deux
 * fois · passer l'écart proposé ; l'écart DÉJÀ passé à la main, le lettrer
 * dans le groupe (il le solde) ; le geste refusé (réévaluation qui l'a lu,
 * cours corrigé), suivre le refus · annuler la réévaluation, passer l'écart,
 * réévaluer. JAMAIS DÉLETTRER (septième relecture, B2) · le groupe délettré
 * sort de la garde de la clôture, et la réévaluation suivante porte le
 * réalisé au 479 latent, un gain hors du résultat. `null` si rien.
 */
export function motifClotureEcartsNonConstates(r: { ecarts: EcartNonConstate[] }): string | null {
  if (r.ecarts.length === 0) return null;
  const montant = (x: number) =>
    Math.abs(x).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/ | /g, ' ');
  const liste = r.ecarts
    .slice(0, 10)
    .map((e) => `${e.compteNumero} lettrage ${e.code} · ${e.ecart > 0 ? 'perte' : 'gain'} de ${montant(e.ecart)}`)
    .join(' ; ');
  const reste = r.ecarts.length > 10 ? `, et ${r.ecarts.length - 10} autre(s)` : '';
  return (
    `${r.ecarts.length} lettrage(s) dénoué(s) dans leur devise portent un écart de change réalisé non constaté au lettrage · ${liste}${reste}. ` +
    "AUDCIF art. 55 · « à la date de règlement [...] les pertes et gains de change à cette date sont constatés ». " +
    'Pour chacun, UNE seule issue · passez l’écart proposé depuis Interrogation et lettrage (« Écart de change ») ; ' +
    's’il a DÉJÀ été passé à la main, lettrez sa ligne du tiers dans ce groupe, sans le repasser ; si le geste est refusé ' +
    '(réévaluation qui a lu le groupe, cours corrigé), suivez le motif du refus : annulez la réévaluation, passez l\'écart, ' +
    'puis réévaluez. Ne délettrez pas le groupe, sans quoi l\'écart ne serait plus constaté. Puis clôturez. ' +
    'Un lettrage qui mêle deux exercices n\'est pas compté ici · la clôture le nomme à part, et lui seul se délettre.'
  );
}
