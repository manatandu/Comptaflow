/**
 * A18 · LE DÉCOMPTE FINAL · AVANCES ET PRÊTS RETENUS, GRATIFICATION AU
 * PRORATA, INDEMNITÉ STIPULÉE (relevé CPCC C15). Règles pures, sans Prisma.
 *
 * ────────────────────────────────────────────────────────────────────────
 * CE QUE LES TEXTES DISENT, VERBATIM (Code du travail, loi n° 015/2002
 * modifiée par la loi n° 16/010).
 *
 * ARTICLE 112 · « Est nulle de plein droit, toute stipulation attribuant à
 * l'employeur le droit d'infliger des réductions de rémunérations à titre de
 * dommages-intérêts. Toutefois, les retenues ci-après sont autorisées : [...]
 * c) retenues à titre d'avances ; [...] f) retenues à titre de prêt ;
 * g) saisie-arrêt. » Et pour le seul litera d) · « Dans le cas où il n'y a pas
 * cautionnement, les retenues prévues au litera d) du présent article ne
 * peuvent être effectuées que dans les limites prévues à l'article 114 ».
 *
 * ARTICLE 7, POINT 8 · la rémunération « comprend notamment [...] Les sommes
 * versées à titre de gratification ou de mois complémentaires ».
 *
 * ARTICLE 37 · « Toute clause contractuelle accordant au travailleur des
 * avantages inférieurs à ceux prescrits par le présent Code est nulle de
 * plein droit. »
 *
 * ARTICLE 64, ALINÉA 1er · « Sauf durée plus longue fixée par les parties ou
 * par la convention collective, la durée du préavis [...] ne peut être
 * inférieure à quatorze jours ouvrables ».
 * ────────────────────────────────────────────────────────────────────────
 *
 * CE QUE CES PHRASES FONT AU DÉCOMPTE.
 *
 *  · AVANCES ET PRÊTS · la retenue est AUTORISÉE (c et f) et AUCUN plafond ne
 *    lui est écrit · l'article 114 ne vaut que pour le d). Le texte ne
 *    contredit donc pas la ligne · le solde entier peut se retenir sur le
 *    décompte, jamais plus que le solde (au-delà, la retenue serait une
 *    réduction de rémunération que l'art. 112, al. 1er frappe de nullité), et
 *    jamais au-delà de ce qui reste dû au travailleur (un net négatif ferait
 *    mentir le 422). OmegaX PROPOSE, le cabinet confirme · un prêt peut se
 *    rembourser autrement, et l'exigibilité de son solde à la rupture est
 *    affaire du contrat de prêt, qu'aucun article lu ne règle.
 *  · LA SAISIE-ARRÊT N'EST PAS PROPOSÉE · ce qu'elle retient est fixé par
 *    l'acte notifié (AUPSRVE, art. 184, 3°), « sans excéder la portion
 *    saisissable » (art. 188), jamais par un solde · elle reste saisie à la
 *    main, comme sur un bulletin.
 *  · LA GRATIFICATION N'EST PAS LÉGALE · aucun article n'en impose le
 *    versement (l'art. 7, point 8 la range dans la rémunération quand elle est
 *    versée). Sans stipulation déclarée, rien n'est proposé, et le montant
 *    reste `null`, jamais zéro. Stipulée, son prorata est PROPOSÉ · le Code ne
 *    dit pas comment proratiser une gratification à la rupture ; OmegaX
 *    compte les MOIS ENTIERS de service de la période de référence, date à
 *    date (la même unité que l'art. 141, « par mois entier de service »), sur
 *    douze. C'est une lecture d'OmegaX, dite sur la ligne · la stipulation
 *    peut en fixer une autre, et le cabinet confirme le montant qu'il retient.
 *  · L'INDEMNITÉ DE FIN DE CONTRAT STIPULÉE N'EST JAMAIS CALCULÉE · elle se
 *    saisit avec sa source (contrat, convention collective), sous la nature
 *    `INDEMNITE_DE_FIN_DE_CONTRAT` (6614). Elle S'AJOUTE aux sommes légales,
 *    qu'elle ne peut réduire (art. 37) · OmegaX n'en déduit rien.
 */

const c = (n: number) => Math.round(n * 100);
const deCentimes = (n: number) => n / 100;

export type AvanceARetenir = {
  readonly avanceId: string;
  readonly type: 'AVANCE' | 'ACOMPTE' | 'PRET' | 'SAISIE_ARRET';
  readonly dateOctroi: string;
  readonly libelle: string;
  /** Le solde restant dû, relu au registre (bulletins non annulés). */
  readonly soldeFc: number;
};

export type RetenueProposee = {
  readonly avanceId: string;
  readonly littera: 'c' | 'f';
  readonly libelle: string;
  readonly soldeFc: number;
  /** Ce qu'OmegaX propose de retenir · jamais plus que le solde ni que le net disponible. */
  readonly montantProposeFc: number;
  readonly reserve: string | null;
};

export type PropositionRetenues = {
  readonly retenues: readonly RetenueProposee[];
  /** Les saisies-arrêts en cours, nommées et non proposées. */
  readonly saisiesNonProposees: readonly { avanceId: string; libelle: string; soldeFc: number }[];
  /** Le net avant retenues d'avance, tel que le serveur l'a rejoué · `null` s'il n'est pas chiffré. */
  readonly netDisponibleFc: number | null;
  /** Ce que les soldes laissent à retenir au-delà du net · zéro quand tout tient. */
  readonly resteNonRetenuFc: number;
  readonly reserves: readonly string[];
};

export const RESERVE_PRET_EXIGIBILITE =
  "PRÊT · l'article 112, f) autorise la retenue « à titre de prêt » sans en fixer le plafond ; que le SOLDE ENTIER devienne " +
  "exigible à la rupture relève du contrat de prêt, qu'aucun article lu ne règle. Confirmez la retenue au vu de ce contrat.";

export const RESERVE_NET_NON_CHIFFRE =
  "Le net du décompte n'est pas chiffré (impôt ou cotisation en abstention) · la proposition est le solde, et l'émission " +
  "refusera toute retenue qui rendrait le net négatif.";

export const RESERVE_SAISIE_NON_PROPOSEE =
  "SAISIE-ARRÊT · non proposée. Ce qu'elle retient est fixé par l'acte notifié (AUPSRVE, art. 184, 3°), « sans excéder la " +
  "portion saisissable » (art. 188), jamais par un solde · saisissez la retenue de l'acte, comme sur un bulletin.";

export const FONDEMENT_RETENUES_DECOMPTE =
  "Code du travail, art. 112 · « les retenues ci-après sont autorisées : [...] c) retenues à titre d'avances ; [...] " +
  "f) retenues à titre de prêt ». Aucun plafond n'est écrit pour elles (l'article 114 ne vaut que pour le litera d) · la " +
  "retenue ne dépasse ni le solde dû, ni ce qui reste dû au travailleur.";

/**
 * LA PROPOSITION DE RETENUES · les avances et acomptes (c) puis les prêts (f),
 * chacun dans l'ordre de son octroi, le plus ancien d'abord · une dette plus
 * ancienne s'éteint la première. Le net disponible borne la somme, jamais le
 * solde d'une avance au-delà de lui-même.
 */
export function propositionRetenuesDecompte(
  avances: readonly AvanceARetenir[],
  netDisponibleFc: number | null,
): PropositionRetenues {
  const reserves: string[] = [];
  const ordre = (a: AvanceARetenir) => (a.type === 'PRET' ? 1 : 0);
  const candidates = avances
    .filter((a) => a.type !== 'SAISIE_ARRET' && c(a.soldeFc) > 0)
    .slice()
    .sort((x, y) => ordre(x) - ordre(y) || x.dateOctroi.localeCompare(y.dateOctroi) || x.avanceId.localeCompare(y.avanceId));
  const saisies = avances
    .filter((a) => a.type === 'SAISIE_ARRET' && c(a.soldeFc) > 0)
    .map((a) => ({ avanceId: a.avanceId, libelle: a.libelle, soldeFc: a.soldeFc }));
  if (saisies.length > 0) reserves.push(RESERVE_SAISIE_NON_PROPOSEE);
  if (netDisponibleFc === null && candidates.length > 0) reserves.push(RESERVE_NET_NON_CHIFFRE);

  // Le disponible en centimes · un net négatif ou nul ne laisse rien à retenir.
  let disponible = netDisponibleFc === null ? Number.POSITIVE_INFINITY : Math.max(0, c(netDisponibleFc));
  let reste = 0;
  const retenues: RetenueProposee[] = candidates.map((a) => {
    const solde = c(a.soldeFc);
    const propose = Math.min(solde, disponible);
    disponible -= propose;
    reste += solde - propose;
    const borneParLeNet = propose < solde;
    const reserve =
      [
        a.type === 'PRET' ? RESERVE_PRET_EXIGIBILITE : null,
        borneParLeNet
          ? `Ramenée de ${a.soldeFc.toFixed(2)} FC à ${deCentimes(propose).toFixed(2)} FC · le net du décompte ne porte pas davantage, et un net négatif ne se paie pas. Le reste demeure dû au registre.`
          : null,
      ]
        .filter((x): x is string => x !== null)
        .join(' ') || null;
    return {
      avanceId: a.avanceId,
      littera: a.type === 'PRET' ? 'f' : 'c',
      libelle: a.libelle,
      soldeFc: a.soldeFc,
      montantProposeFc: deCentimes(propose),
      reserve,
    };
  });
  return {
    retenues,
    saisiesNonProposees: saisies,
    netDisponibleFc,
    resteNonRetenuFc: deCentimes(reste),
    reserves,
  };
}

/**
 * CE QUE L'ÉMISSION DIT DES SOLDES QUI RESTENT · une avance ou un prêt dont le
 * décompte ne retient pas tout le solde reste dû au registre. Ce n'est pas un
 * refus (le cabinet peut le recouvrer autrement), c'est un AVERTISSEMENT, pour
 * que le dernier document remis au travailleur ne laisse pas une créance
 * oubliée sans un mot.
 */
export function avertissementsSoldesRestants(
  avances: readonly AvanceARetenir[],
  retenuesFc: Readonly<Record<string, number>>,
): string[] {
  return avances
    .filter((a) => a.type !== 'SAISIE_ARRET')
    .map((a) => ({ a, reste: c(a.soldeFc) - c(retenuesFc[a.avanceId] ?? 0) }))
    .filter(({ reste }) => reste > 0)
    .map(
      ({ a, reste }) =>
        `${a.libelle} · ${deCentimes(reste).toFixed(2)} FC restent dus au registre après ce décompte (art. 112, ${a.type === 'PRET' ? 'f' : 'c'}). ` +
        "Le décompte ne les retient pas · ils se recouvrent hors de la paie, ou se retiennent en annulant puis en réémettant le décompte.",
    );
}

// ──────────────────────────────────────────────────────────────────────
// LA GRATIFICATION STIPULÉE
// ──────────────────────────────────────────────────────────────────────

export type GratificationStipulee = {
  /** Le montant de la gratification pour une période entière de douze mois, tel que la stipulation le fixe. */
  readonly montantAnnuelFc: number;
  /** Contrat, avenant, convention collective, décision de l'employeur · exigée. */
  readonly source: string;
  /** Début de la période de référence (dernière gratification versée, ou entrée en service). */
  readonly debutPeriode: string;
  /** Fin de la période · la cessation des services. */
  readonly finPeriode: string;
};

export type PropositionGratification = {
  readonly montantFc: number;
  readonly moisEntiers: number;
  readonly base: string;
};

const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;
const lireDate = (s: string): Date | null => {
  if (!DATE_ISO.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : d;
};

/**
 * MOIS ENTIERS DE SERVICE, DATE À DATE · du 15 mars au 14 avril inclus fait un
 * mois, du 15 mars au 13 avril aucun. La même règle que le plafond de l'art. 41
 * (P1) · jamais trente jours. Le dernier jour d'un mois court vaut la date
 * qui n'existe pas (31 janvier → 28 ou 29 février).
 */
export function moisEntiersDeService(debut: Date, finIncluse: Date): number {
  if (finIncluse < debut) return 0;
  const lendemain = new Date(finIncluse.getTime() + 86_400_000);
  let mois = (lendemain.getUTCFullYear() - debut.getUTCFullYear()) * 12 + (lendemain.getUTCMonth() - debut.getUTCMonth());
  // Le mois n'est entier que si la date anniversaire est atteinte.
  const jourAnniversaire = Math.min(
    debut.getUTCDate(),
    new Date(Date.UTC(lendemain.getUTCFullYear(), lendemain.getUTCMonth() + 1, 0)).getUTCDate(),
  );
  if (lendemain.getUTCDate() < jourAnniversaire) mois -= 1;
  return Math.max(0, mois);
}

export const MOIS_DE_LA_PERIODE_DE_GRATIFICATION = 12;

export function motifRefusGratificationStipulee(g: GratificationStipulee): string | null {
  if (!(g.montantAnnuelFc > 0)) return 'Le montant annuel stipulé de la gratification doit être positif.';
  if (!g.source?.trim()) {
    return "La source de la gratification (contrat, avenant, convention collective, décision de l'employeur) est obligatoire · aucun article du Code n'en impose le versement.";
  }
  const debut = lireDate(g.debutPeriode);
  const fin = lireDate(g.finPeriode);
  if (!debut || !fin) return 'Les dates de la période de référence de la gratification sont illisibles (AAAA-MM-JJ).';
  if (fin < debut) return 'La fin de la période de référence de la gratification précède son début.';
  if (moisEntiersDeService(debut, fin) > MOIS_DE_LA_PERIODE_DE_GRATIFICATION) {
    return "La période de référence de la gratification dépasse douze mois · une gratification due pour une période échue se déclare à part, elle n'est pas un prorata.";
  }
  return null;
}

export const RESERVE_PRORATA_GRATIFICATION =
  "PRORATA · lecture d'OmegaX, le Code se tait. Il compte les mois ENTIERS de service de la période de référence, date à " +
  "date (l'unité de l'article 141), sur douze ; la stipulation peut en fixer une autre (jours, mois entamés, condition de " +
  "présence) · le cabinet confirme le montant qu'il retient.";

/** La proposition · `null` quand la stipulation est refusée, jamais un zéro inventé. */
export function propositionGratification(g: GratificationStipulee): PropositionGratification | null {
  if (motifRefusGratificationStipulee(g) !== null) return null;
  const mois = moisEntiersDeService(lireDate(g.debutPeriode) as Date, lireDate(g.finPeriode) as Date);
  const montant = deCentimes(Math.round((c(g.montantAnnuelFc) * mois) / MOIS_DE_LA_PERIODE_DE_GRATIFICATION));
  return {
    montantFc: montant,
    moisEntiers: mois,
    base:
      `${g.montantAnnuelFc.toFixed(2)} FC stipulés (${g.source.trim()}) × ${mois} mois entiers de service du ${g.debutPeriode} ` +
      `au ${g.finPeriode} / ${MOIS_DE_LA_PERIODE_DE_GRATIFICATION} = ${montant.toFixed(2)} FC.`,
  };
}

// ──────────────────────────────────────────────────────────────────────
// L'INDEMNITÉ DE FIN DE CONTRAT STIPULÉE
// ──────────────────────────────────────────────────────────────────────

export type IndemniteStipulee = {
  readonly montantFc: number;
  /** La clause du contrat ou de la convention collective qui la stipule · exigée. */
  readonly source: string;
};

export function motifRefusIndemniteStipulee(i: IndemniteStipulee): string | null {
  if (!(i.montantFc > 0)) return "Le montant de l'indemnité de fin de contrat stipulée doit être positif · sans stipulation, ne la déclarez pas.";
  if (!i.source?.trim()) {
    return "La source de l'indemnité stipulée (clause du contrat, convention collective) est obligatoire · OmegaX ne la calcule jamais, il la recopie.";
  }
  return null;
}

export const FONDEMENT_INDEMNITE_STIPULEE =
  "Indemnité STIPULÉE, recopiée et jamais calculée par OmegaX. Le Code laisse les parties fixer davantage que la loi " +
  "(art. 64, al. 1er, « sauf durée plus longue fixée par les parties ou par la convention collective ») et frappe de " +
  "nullité la clause moins favorable (art. 37, al. 2) · elle s'ajoute aux sommes légales du décompte, qu'elle ne réduit pas. " +
  "Passée au 6614 (fiche du compte 66, « Indemnités de préavis, de licenciement et de recherche d'embauche »).";
