/**
 * LES ÉCARTS DES DISPONIBILITÉS NE SE CONTRE-PASSENT PAS (ligne A5 bis,
 * 2026-10-03). Ce module sépare, dans l'écriture des écarts d'une
 * réévaluation, l'écart de CONVERSION (créances et dettes, 478 / 479), que
 * l'on contre-passe à l'ouverture de l'exercice suivant, de l'écart RÉALISÉ
 * des disponibilités (676 / 776), que l'on ne contre-passe jamais.
 *
 * Textes lus (compétences `audcif-acte-uniforme`, `syscohada`, `sycebnl`) ·
 *  · AUDCIF art. 54 · créances et dettes, différences « inscrites directement
 *    au bilan dans des comptes d'écarts de conversion actif (pertes probables)
 *    ou passif (gains latents) » ;
 *  · AUDCIF art. 57 · disponibilités, « les écarts constatés sont inscrits
 *    directement dans les produits et charges de l'exercice comme gains ou
 *    pertes de change » ; Titre VIII ch. 22, section 4 · « le gain ou la perte
 *    de change étant inscrit directement dans les produits et charges
 *    financiers de l'exercice clos » ; § 2.2 · disponibilités exclues de la
 *    position globale, « les écarts de change étant comptabilisés
 *    immédiatement en résultat » ;
 *  · fiche du compte 676 (AUDCIF Titre VII ; SYCEBNL Partie 2 ch. 3) · « les
 *    écarts de conversion négatifs constatés à la clôture de l'exercice sur
 *    les disponibilités en devises sont considérés comme étant des pertes de
 *    change supportées », et le 676 « ne doit pas être confondu avec le
 *    compte 478 » ;
 *  · fiches des comptes 478 et 479 (AUDCIF et SYCEBNL) · pertes et gains
 *    LATENTS, écarts « entre créances et dettes en devises » ;
 *  · Guide SYSCOHADA, Partie 2 ch. 22 · Application 84, « Contrepassation de
 *    l'écart au 01/01/N+1 : 411 · 4781 » ; Application 85, « Contrepassation au
 *    01/01/N+1 : 4793 · 4812 » ; Application 86 (disponibilités), 676 / 5215
 *    « sans écart de conversion », et AUCUNE contre-passation.
 *
 * ANOMALIE DU TEXTE, non corrigée · la section 4 du ch. 22 écrit « Selon
 * l'article 58, les disponibilités en devises sont converties… » ; la règle
 * des disponibilités est à l'art. 57 de l'AUDCIF tel que la compétence le
 * transcrit (l'art. 58 y porte la position globale de change). On cite
 * l'art. 57, qui porte la règle.
 *
 * Contre-passer la ligne d'une banque ou d'une caisse remettait la trésorerie
 * au cours historique en N+1 et inscrivait au 676 ou au 776 de N+1 le
 * contraire d'une perte ou d'un gain déjà supporté en N · écriture équilibrée,
 * balance bouclée (CLAUDE.md § 10 bis).
 */

/**
 * Une position en devise est-elle une DISPONIBILITÉ ?
 *
 * La question décide de tout : une disponibilité en devise donne un écart
 * RÉALISÉ, qui va droit au résultat financier (676 / 776) ; une créance ou
 * une dette donne un écart LATENT, qui passe par les écarts de conversion et
 * appelle une provision. L'AUDCIF le pose explicitement en excluant les
 * disponibilités de la position globale de change, « les écarts de change
 * étant comptabilisés immédiatement en résultat » (Titre VIII ch. 22 § 2.2).
 *
 * Le test portait sur la CLASSE ENTIÈRE (`numero.startsWith('5')`), ce qui
 * rangeait en disponibilités trois familles qui n'en sont pas :
 *
 *  · 50 « Titres de placement » · un placement, pas de la monnaie ;
 *  · 54 « Instruments de trésorerie » (SYSCOHADA seulement) ;
 *  · 56 « Banques, crédits de trésorerie et d'escompte » · une DETTE
 *    bancaire, dont l'alourdissement en devise est une perte PROBABLE à
 *    provisionner, pas une perte supportée.
 *
 * Un découvert bancaire en devise passait donc directement en 676, sans
 * écart de conversion et sans provision : le résultat financier de
 * l'exercice portait une perte que le texte veut latente.
 *
 * Les vraies disponibilités sont les mêmes dans les deux référentiels · 52
 * Banques, 53 Établissements financiers et assimilés, 55 Instruments de
 * monnaie électronique, 57 Caisse, 58 (régies d'avances et accréditifs en
 * SYSCOHADA, virements internes dans les deux, toujours soldés à la
 * clôture). Le SYCEBNL n'a pas de 54, et le 55 porte chez lui le même
 * intitulé qu'en SYSCOHADA : une seule liste suffit.
 */
export const RACINES_DISPONIBILITES = /^(52|53|55|57|58)/;

export function estDisponibilite(numero: string): boolean {
  return RACINES_DISPONIBILITES.test(numero);
}

/**
 * Racines de la contrepartie de l'écart d'une disponibilité, aux deux plans ·
 * 676 « Pertes de change financières », 776 « Gains de change financiers »
 * (fiches des comptes 67 et 77, AUDCIF Titre VII et SYCEBNL Partie 2 ch. 3).
 * La réévaluation ne les sert qu'aux disponibilités · une créance ou une
 * dette passe par le 478 ou le 479 (art. 54), une position de gestion n'est
 * pas réévaluée (`motifHorsReevaluation`).
 */
export const RACINES_CHANGE_DISPONIBILITES = { perte: '676', gain: '776' } as const;

function estContrepartieDeDisponibilite(numero: string): boolean {
  return numero.startsWith(RACINES_CHANGE_DISPONIBILITES.perte) || numero.startsWith(RACINES_CHANGE_DISPONIBILITES.gain);
}

export interface LigneDEcart {
  compteNumero: string;
  debit: number;
  credit: number;
}

export interface PartageDesEcarts<L extends LigneDEcart> {
  /** Écart de conversion · le compte de tiers et son 478 ou 479 · se contre-passe. */
  aContrePasser: L[];
  /** Disponibilités et leur 676 ou 776 · réalisé (art. 57), jamais contre-passé. */
  realisees: L[];
  /** Refus nommé si le partage ne rend pas deux parts équilibrées, sinon `null`. */
  motifRefus: string | null;
}

const EPSILON = 0.005;
const solde = (lignes: LigneDEcart[]) => lignes.reduce((t, l) => t + Number(l.debit) - Number(l.credit), 0);

/**
 * PARTAGE l'écriture des écarts d'une réévaluation par la RACINE du compte,
 * jamais par le montant ni par le libellé · une ligne de disponibilité (52,
 * 53, 55, 57, 58, `estDisponibilite`) ou de sa contrepartie (676, 776) est
 * réalisée ; le reste (le tiers et son 478 ou 479) se contre-passe.
 *
 * Pourquoi la racine suffit · `reevaluer` compose l'écriture par paires (le
 * compte de la position, puis sa contrepartie), et ne sert le 676 ou le 776
 * qu'à une disponibilité. Une écriture qui ne se partage pas en deux moitiés
 * ÉQUILIBRÉES n'est donc pas une écriture de `reevaluer` telle qu'elle a été
 * passée (retouchée au brouillard) · on refuse plutôt que de boucler une
 * contre-passation sur un compte deviné.
 */
export function partagerLignesDEcarts<L extends LigneDEcart>(lignes: L[]): PartageDesEcarts<L> {
  const realisees = lignes.filter((l) => estDisponibilite(l.compteNumero) || estContrepartieDeDisponibilite(l.compteNumero));
  const aContrePasser = lignes.filter((l) => !realisees.includes(l));
  const desequilibre = Math.abs(solde(realisees)) > EPSILON || Math.abs(solde(aContrePasser)) > EPSILON;
  return {
    aContrePasser,
    realisees,
    motifRefus: desequilibre
      ? "L'écriture des écarts de cette réévaluation ne se sépare pas en deux parts équilibrées · d'un côté les " +
        "disponibilités et leur 676 ou 776 (écart réalisé, AUDCIF art. 57, jamais contre-passé), de l'autre les créances " +
        "et dettes et leur 478 ou 479 (écart de conversion, art. 54, contre-passé à l'ouverture). Elle a été retouchée · " +
        'annulez la réévaluation et repassez-la, ou contre-passez à la main les seuls 478 et 479 et leurs comptes de tiers.'
      : null,
  };
}

/** L'écart passé sur une disponibilité, par compte et par devise. */
export interface EcartDeDisponibilite {
  compteId: string;
  deviseId: string;
  ecart: number;
}

/**
 * Relit `Reevaluation.ecartsDisponibilites` · `null` si la colonne est vide
 * (réévaluation antérieure à A5 bis) ou illisible, jamais une liste vide
 * inventée · « pas enregistré » n'est pas « aucun écart ».
 */
export function ecartsDisponibilitesEnregistres(valeur: unknown): EcartDeDisponibilite[] | null {
  if (!Array.isArray(valeur)) return null;
  const sortie: EcartDeDisponibilite[] = [];
  for (const e of valeur) {
    if (!e || typeof e !== 'object') return null;
    const { compteId, deviseId, ecart } = e as Record<string, unknown>;
    if (typeof compteId !== 'string' || typeof deviseId !== 'string' || typeof ecart !== 'number' || !Number.isFinite(ecart)) return null;
    sortie.push({ compteId, deviseId, ecart });
  }
  return sortie;
}
