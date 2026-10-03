import type { PrismaService } from '../../common/prisma.service';
import { groupesDenoues } from '../devises/perimetre-reevaluation';

type Lecteur = Pick<PrismaService, 'ligneEcriture'>;

/** Un groupe de lettrage dénoué dans sa devise dont l'écart réalisé n'est pas passé. */
export interface EcartNonConstate {
  lettrageId: string;
  code: string;
  compteNumero: string;
  /** Signé · positif pour une perte. */
  ecart: number;
}

/**
 * Borne de lecture · les lignes des groupes PARTIELS d'un exercice. Un
 * exercice qui en porterait davantage est lu jusque-là, et le refus le dit
 * (`tronque`) · jamais une clôture admise sur une lecture amputée.
 */
export const PLAFOND_LIGNES_PARTIELLES = 20_000;

/**
 * LES ÉCARTS DE CHANGE RÉALISÉS NON CONSTATÉS D'UN EXERCICE (décision D3 du
 * 2026-10-03, Manasse, « réfère-toi à la loi »). AUDCIF art. 55 · « À la date
 * de règlement des créances et dettes, les pertes et gains de change à cette
 * date SONT CONSTATÉS par rapport à leur coût historique » · une obligation
 * de l'exercice du règlement. Un groupe de lettrage PARTIEL dont les lignes
 * de l'exercice sont soldées dans leur devise et pas en francs porte un
 * réalisé que rien n'a passé (`ecartDuGroupe`) · la réévaluation l'écarte
 * déjà (art. 54, la position n'en « subsiste » plus) ; c'est la CLÔTURE qui
 * le refuse, jamais la réévaluation.
 */
export async function ecartsRealisesNonConstates(
  prisma: Lecteur,
  p: { tenantId: string; exerciceId: string },
): Promise<{ ecarts: EcartNonConstate[]; tronque: boolean }> {
  const lignes = await prisma.ligneEcriture.findMany({
    where: {
      lettrageId: { not: null },
      lettre: null,
      lettrage: { statut: 'PARTIEL' },
      ecriture: { tenantId: p.tenantId, exerciceId: p.exerciceId },
    },
    select: {
      lettrageId: true,
      debit: true,
      credit: true,
      deviseId: true,
      montantDevise: true,
      lettrage: { select: { code: true, compte: { select: { numero: true } } } },
    },
    orderBy: { id: 'asc' },
    take: PLAFOND_LIGNES_PARTIELLES + 1,
  });
  const tronque = lignes.length > PLAFOND_LIGNES_PARTIELLES;
  const lues = lignes.slice(0, PLAFOND_LIGNES_PARTIELLES);
  const numeros = new Map<string, string>();
  for (const l of lues) if (l.lettrageId && l.lettrage) numeros.set(l.lettrageId, l.lettrage.compte.numero);
  const denoues = groupesDenoues(
    lues.map((l) => ({
      lettrageId: l.lettrageId!,
      code: l.lettrage?.code ?? '',
      debit: Number(l.debit),
      credit: Number(l.credit),
      deviseId: l.deviseId,
      montantDevise: l.montantDevise === null ? null : Number(l.montantDevise),
    })),
  );
  const ecarts = [...denoues.entries()]
    .filter(([, g]) => Math.abs(g.ecart) >= 0.005)
    .map(([lettrageId, g]) => ({ lettrageId, code: g.code.toLowerCase(), compteNumero: numeros.get(lettrageId) ?? '?', ecart: Math.round(g.ecart * 100) / 100 }))
    .sort((a, b) => a.compteNumero.localeCompare(b.compteNumero) || a.code.localeCompare(b.code));
  return { ecarts, tronque };
}

/** Le refus de la clôture, nommé · groupes, comptes, montants, et l'issue. `null` si rien n'est en souffrance. */
export function motifClotureEcartsNonConstates(r: { ecarts: EcartNonConstate[]; tronque: boolean }): string | null {
  if (r.ecarts.length === 0 && !r.tronque) return null;
  if (r.ecarts.length === 0) {
    return (
      `Plus de ${PLAFOND_LIGNES_PARTIELLES} lignes de lettrages partiels sur cet exercice · OmegaX n'a pas pu vérifier qu'aucun ` +
      'écart de change réalisé ne reste à passer (AUDCIF art. 55). Soldez ou délettrez les lettrages partiels, puis clôturez.'
    );
  }
  const montant = (x: number) =>
    Math.abs(x).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/ | /g, ' ');
  const liste = r.ecarts
    .slice(0, 10)
    .map((e) => `${e.compteNumero} lettrage ${e.code} · ${e.ecart > 0 ? 'perte' : 'gain'} de ${montant(e.ecart)}`)
    .join(' ; ');
  const reste = r.ecarts.length > 10 ? `, et ${r.ecarts.length - 10} autre(s)` : '';
  return (
    `${r.ecarts.length} lettrage(s) dénoué(s) dans leur devise portent un écart de change réalisé non passé · ${liste}${reste}. ` +
    "AUDCIF art. 55 · « à la date de règlement [...] les pertes et gains de change à cette date sont constatés ». " +
    "Passez chaque écart depuis Interrogation et lettrage (« Écart de change »), puis clôturez."
  );
}
