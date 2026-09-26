/**
 * AVANCES, ACOMPTES ET PRÊTS AU PERSONNEL · règles pures, sans Prisma.
 *
 * LA RETENUE EST AUTORISÉE, ET NOMMÉE · Code du travail, art. 112 : « les
 * retenues ci-après sont autorisées : [...] c) retenues à titre d'avances ;
 * [...] f) retenues à titre de prêt ». Une avance et un acompte relèvent du
 * c), un prêt du f).
 *
 * LES DEUX PLANS ÉCRIVENT LE MÊME COMPTE, ET LE MÊME REFUS. Fiche du compte 42
 * (AUDCIF Titre VII · SYCEBNL Partie 2 ch. 3) : 4211 « Personnel, avances »,
 * 4212 « Personnel, acomptes », et en EXCLUSION « les prêts consentis au
 * personnel → 272 (Prêts au personnel) ». Un prêt porté au 421 se lirait
 * comme une créance à court terme sur la paie ; au 272 c'est une immobilisation
 * financière, que la Note annexe ventile par échéance. Numéros relus aux deux
 * semis (42110000, 42120000, 27210000, 27220000, 27280000).
 *
 * LA RETENUE SUR LE BULLETIN VIRE LE 422 VERS LE COMPTE DE L'AVANCE · Guide
 * d'application SYSCOHADA, Partie 1 ch. 3, § 4.3 (« virées de 422 vers 421
 * (avances/acomptes) ») et Application 10 (D/422, C/4212 pour l'acompte).
 *
 * CE QUI N'EST PAS ÉCRIT, ET N'EST DONC PAS CODÉ · un plafond. L'article 112 ne
 * renvoie à l'article 114 (quotité cessible) que pour son litera d), dans le
 * cas où il n'y a pas de cautionnement. Il n'en dit rien pour les avances ni
 * les prêts. OmegaX ne refuse donc aucune retenue d'avance au nom de la
 * quotité · il la MONTRE à côté, pour que le cabinet juge.
 */

export type TypeAvance = 'AVANCE' | 'ACOMPTE' | 'PRET';
export type CategoriePret = 'IMMOBILIER' | 'MOBILIER_ET_INSTALLATION' | 'AUTRE';

export const LITTERA_ARTICLE_112: Readonly<Record<TypeAvance, 'c' | 'f'>> = { AVANCE: 'c', ACOMPTE: 'c', PRET: 'f' };

/** Le compte crédité par la retenue · le même dans les deux plans. */
export function compteDeLAvance(type: TypeAvance, categorie: CategoriePret | null): { compte: string; intitule: string } {
  if (type === 'AVANCE') return { compte: '42110000', intitule: 'Personnel, avances' };
  if (type === 'ACOMPTE') return { compte: '42120000', intitule: 'Personnel, acomptes' };
  if (categorie === 'IMMOBILIER') return { compte: '27210000', intitule: 'Prêts au personnel · immobiliers' };
  if (categorie === 'MOBILIER_ET_INSTALLATION') return { compte: '27220000', intitule: "Prêts au personnel · mobiliers et d'installation" };
  return { compte: '27280000', intitule: 'Autres prêts au personnel' };
}

const c = (n: number) => Math.round(n * 100);

export function motifRefusAvance(a: {
  type: TypeAvance;
  categoriePret?: CategoriePret | null;
  montantFc: number;
  retenueMensuelleFc?: number | null;
  objet?: string;
  pieceJustificative?: string;
}): string | null {
  if (!(a.montantFc > 0)) return 'Le montant consenti doit être positif.';
  if (a.type !== 'PRET' && a.categoriePret) return "Une catégorie de prêt ne s'applique qu'à un prêt (compte 272).";
  if (a.type === 'PRET' && !a.categoriePret) {
    return 'La catégorie du prêt (immobilier, mobilier et d’installation, autre) choisit la subdivision du 272 · elle est obligatoire.';
  }
  if (a.retenueMensuelleFc != null && (a.retenueMensuelleFc <= 0 || c(a.retenueMensuelleFc) > c(a.montantFc))) {
    return 'La retenue mensuelle doit être positive et ne peut dépasser le montant consenti.';
  }
  if (!a.objet?.trim()) return "L'objet de l'avance ou du prêt est obligatoire.";
  if (!a.pieceJustificative?.trim()) {
    return "La pièce justificative (reconnaissance de dette, contrat de prêt) est obligatoire · les deux plans la nomment parmi les éléments de contrôle du compte 42.";
  }
  return null;
}

/**
 * Le SOLDE restant dû · le montant moins ce que les bulletins NON ANNULÉS ont
 * retenu. Un bulletin annulé rend sa retenue : l'argent n'a pas été retenu.
 */
export function soldeAvance(montantFc: number, retenues: readonly { montantFc: number; bulletinAnnule: boolean }[]): number {
  const retenu = retenues.filter((r) => !r.bulletinAnnule).reduce((s, r) => s + c(r.montantFc), 0);
  return (c(montantFc) - retenu) / 100;
}

/** Refus d'une retenue de bulletin · elle ne peut solder plus que ce qui reste dû. */
export function motifRefusRetenue(montantFc: number, soldeFc: number, libelle: string): string | null {
  if (!(montantFc > 0)) return `${libelle} · la retenue doit être positive.`;
  if (c(montantFc) > c(soldeFc)) {
    return `${libelle} · la retenue (${montantFc.toFixed(2)} FC) dépasse le solde restant dû (${soldeFc.toFixed(2)} FC). Un trop-retenu serait une réduction de rémunération que l'article 112 n'autorise pas.`;
  }
  return null;
}

export const RESERVE_QUOTITE_AVANCES =
  "AUCUN PLAFOND N'EST OPPOSÉ AUX RETENUES D'AVANCE ET DE PRÊT · l'article 112 du Code du travail ne renvoie à l'article 114 " +
  "(quotité cessible) que pour son litera d). La quotité est montrée pour comparaison ; le jugement appartient au cabinet.";
