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

export type TypeAvance = 'AVANCE' | 'ACOMPTE' | 'PRET' | 'SAISIE_ARRET';
export type CategoriePret = 'IMMOBILIER' | 'MOBILIER_ET_INSTALLATION' | 'AUTRE';

export const LITTERA_ARTICLE_112: Readonly<Record<TypeAvance, 'c' | 'f' | 'g'>> = {
  AVANCE: 'c',
  ACOMPTE: 'c',
  PRET: 'f',
  SAISIE_ARRET: 'g',
};

/** Le compte crédité par la retenue · le même dans les deux plans. */
export function compteDeLAvance(type: TypeAvance, categorie: CategoriePret | null): { compte: string; intitule: string } {
  // LA SAISIE-ARRÊT NOTIFIÉE (passe O4-C2) · la retenue vire le 422 vers le
  // 4232 « Personnel, saisies-arrêts », ouvert aux deux plans sous ce nom
  // (AUDCIF, Titre VII, et SYCEBNL, Partie 2 ch. 3, fiche du compte 42) ;
  // Guide d'application SYSCOHADA, Partie 1 ch. 3, § 4.3 (« virées de 422
  // vers […] 423 (oppositions/saisies-arrêts) ») et Application 10 (« 4232
  // Personnel, saisies-arrêts »). Le versement au greffe est la seconde
  // écriture, D 4232 / C trésorerie, que le cabinet passe.
  if (type === 'SAISIE_ARRET') return { compte: '42320000', intitule: 'Personnel, saisies-arrêts' };
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
  referenceActe?: string | null;
  greffe?: string | null;
  destinataire?: string | null;
}): string | null {
  if (!(a.montantFc > 0)) return 'Le montant consenti doit être positif.';
  const refusSaisie = motifRefusSaisieArret(a);
  if (refusSaisie) return refusSaisie;
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

/**
 * LA SAISIE-ARRÊT NOTIFIÉE · ce que l'acte porte, recopié, jamais calculé
 * (passe O4-C2).
 *
 * AUPSRVE, livre 2, titre 5. Le greffier notifie l'acte de saisie à
 * l'employeur (art. 183) ; l'acte contient « le décompte distinct des sommes
 * pour lesquelles la saisie est pratiquée » et « le mode de calcul de la
 * fraction saisissable et les modalités de son règlement » (art. 184, 2° et
 * 3°) ; sa notification « frappe d'indisponibilité la quotité saisissable du
 * salaire » (art. 187) ; l'employeur « adresse tous les mois au greffe ou à
 * l'organisme spécialement désigné à cet effet par chaque État partie » les
 * sommes retenues, « sans excéder la portion saisissable », avec une note qui
 * porte « les références éventuelles de l'acte de saisie » (art. 188) ; s'il
 * omet de verser, il est déclaré « personnellement débiteur » (art. 189).
 *
 * D'où les trois champs exigés · la RÉFÉRENCE de l'acte, le GREFFE qui l'a
 * notifié, et le DESTINATAIRE des versements (le greffe, ou l'organisme que
 * l'État a désigné · l'art. 188 laisse les deux). Le montant est le décompte
 * de l'acte, la retenue mensuelle celle que son mode de calcul donne · OmegaX
 * ne les déduit de rien. Ces champs n'ont aucun sens sur une avance ou un
 * prêt, et y sont refusés plutôt que stockés en silence.
 *
 * LA CESSION DES RÉMUNÉRATIONS N'EST PAS TENUE ICI, et c'est une abstention ·
 * aucun des deux textes comptables ne lui désigne un compte (le 423 porte
 * « la fraction du salaire soumise à saisie, en cas d'opposition de tiers »,
 * fiche du compte 42), et une cession n'est pas une retenue de la liste de
 * l'art. 112 (retenues-autorisees.ts). Elle reste passée à la main.
 */
export function motifRefusSaisieArret(a: {
  type: TypeAvance;
  categoriePret?: CategoriePret | null;
  referenceActe?: string | null;
  greffe?: string | null;
  destinataire?: string | null;
}): string | null {
  if (a.type !== 'SAISIE_ARRET') {
    if (a.referenceActe?.trim() || a.greffe?.trim() || a.destinataire?.trim()) {
      return "La référence de l'acte, le greffe et le destinataire ne s'appliquent qu'à une saisie-arrêt notifiée.";
    }
    return null;
  }
  if (a.categoriePret) return "Une catégorie de prêt ne s'applique qu'à un prêt (compte 272).";
  if (!a.referenceActe?.trim()) {
    return "La référence de l'acte de saisie notifié est obligatoire · la note jointe à chaque versement la porte (AUPSRVE, art. 188).";
  }
  if (!a.greffe?.trim()) return "Le greffe qui a notifié l'acte de saisie est obligatoire (AUPSRVE, art. 183).";
  if (!a.destinataire?.trim()) {
    return "Le destinataire des versements est obligatoire · « le greffe ou l'organisme spécialement désigné à cet effet » (AUPSRVE, art. 188).";
  }
  return null;
}

const jourIso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * LE MOIS DE PAIE QU'UNE SAISIE PEUT ATTEINDRE · de la notification (art. 187,
 * l'indisponibilité naît avec elle) à la mainlevée (art. 201). Un mois ENTAMÉ par l'une ou l'autre date reste atteignable · la paie
 * du mois se verse en une fois, et OmegaX ne proratise rien que l'acte ne
 * proratise.
 */
export function motifRefusMoisSaisie(moisDePaie: string, dateNotification: Date, dateFin: Date | null): string | null {
  const [a, m] = moisDePaie.split('-').map(Number);
  const premier = new Date(Date.UTC(a, m - 1, 1));
  const dernier = new Date(Date.UTC(a, m, 0));
  if (dernier < dateNotification) {
    return (
      `La saisie a été notifiée le ${jourIso(dateNotification)} · la quotité n'est indisponible qu'à compter de la ` +
      `notification (AUPSRVE, art. 187), et la paie de ${moisDePaie} ne peut pas la porter.`
    );
  }
  if (dateFin && premier > dateFin) {
    return (
      `La saisie a pris fin le ${jourIso(dateFin)} (mainlevée, AUPSRVE, art. 201) · la paie de ${moisDePaie} ne ` +
      "peut plus la porter."
    );
  }
  return null;
}

/** La fin d'une saisie se déclare une fois, jamais avant sa notification. */
export function motifRefusFinSaisie(
  a: { type: TypeAvance; dateOctroi: Date; dateFin: Date | null },
  dateFin: Date,
): string | null {
  if (a.type !== 'SAISIE_ARRET') return "Seule une saisie-arrêt prend fin par mainlevée · une avance se solde par ses retenues.";
  if (a.dateFin) return `Cette saisie a déjà pris fin le ${jourIso(a.dateFin)}.`;
  if (dateFin < a.dateOctroi) return "La mainlevée ne peut pas précéder la notification de l'acte de saisie.";
  return null;
}

/**
 * « SANS EXCÉDER LA PORTION SAISISSABLE » (AUPSRVE, art. 188) · la retenue de
 * saisie est confrontée à la quotité que le logiciel calcule, et l'écart est
 * DIT, jamais refusé · c'est l'acte qui fixe « le mode de calcul de la
 * fraction saisissable » (art. 184, 3°), et le calcul d'OmegaX peut
 * s'abstenir ou différer du sien (catégorie, logement).
 */
export function reserveQuotiteSaisies(saisiesFc: number, quotiteFc: number | null): string | null {
  if (!(saisiesFc > 0)) return null;
  if (quotiteFc === null) {
    return (
      `Retenue de saisie-arrêt de ${saisiesFc.toFixed(2)} FC · la quotité saisissable n'est pas chiffrée pour ce ` +
      "bulletin, et la retenue n'y est pas confrontée (AUPSRVE, art. 188, « sans excéder la portion saisissable »)."
    );
  }
  if (c(saisiesFc) > c(quotiteFc)) {
    return (
      `La retenue de saisie-arrêt (${saisiesFc.toFixed(2)} FC) dépasse la quotité saisissable calculée ` +
      `(${quotiteFc.toFixed(2)} FC) · l'employeur ne verse au greffe que « sans excéder la portion saisissable » ` +
      "(AUPSRVE, art. 188). Confrontez-la à l'acte notifié."
    );
  }
  return null;
}
