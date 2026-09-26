/**
 * LA PASSATION COMPTABLE DE LA PAIE · P3.
 *
 * Elle PROPOSE une écriture, elle n'en poste aucune. Le montant, la date et le
 * journal appartiennent au comptable · même parti que la variation de stocks,
 * que le redressement d'inventaire et que le pré-lettrage.
 *
 * ────────────────────────────────────────────────────────────────────────
 * AUCUN NUMÉRO DE COMPTE DE PAIE N'EST ÉCRIT AILLEURS QUE DANS CE FICHIER, ET
 * AUCUN SANS SON RÉFÉRENTIEL. Quatrième fois que la règle se pose, après les
 * stocks, les emballages et la variation de stocks.
 *
 * LA CONFRONTATION DES DEUX SEMIS A ÉTÉ REFAITE, compte par compte, avant
 * d'écrire une ligne. Sur les TREIZE rôles que l'écriture de paie mobilise,
 * DOUZE portent le même numéro et le même intitulé dans les deux plans. UN
 * SEUL diverge, et c'est celui qui porte la ligne la plus lourde du bulletin :
 *
 *   LA COTISATION DE RETRAITE OBLIGATOIRE (branche des pensions, 10 %) est au
 *   **43130000** en SYSCOHADA (« Caisse de retraite obligatoire », sous 431
 *   Sécurité sociale) et au **43210000** en SYCEBNL (« Caisses de retraite ·
 *   obligatoire », sous 432).
 *
 * ET LA CORRECTION ÉVIDENTE EST ELLE-MÊME UN PIÈGE. Le 432 du SYSCOHADA est
 * « Caisses de retraite COMPLÉMENTAIRE », semé en un seul compte 43200000 ;
 * celui du SYCEBNL est « Caisses de retraite » tout court, tête de division
 * ouvrant 4321 obligatoire, 4322 complémentaire et 4328 autres. Corriger 4313
 * en 432 rangerait donc la cotisation OBLIGATOIRE sous une nature FACULTATIVE
 * dans un plan sur deux, sur une écriture parfaitement équilibrée.
 *
 * TROIS COMPTES INEXISTANTS SI L'ON SE TROMPE DE PLAN · 43130000 et 43200000
 * ne sont pas ouverts au SYCEBNL, 43210000 ne l'est pas au SYSCOHADA. La
 * proposition serait refusée à la saisie APRÈS que le comptable a tout
 * chiffré, exactement comme le 734 et le 7074.
 * ────────────────────────────────────────────────────────────────────────
 *
 * ET LE SÉMINAIRE CPCC SE TROMPE ICI, dans les DEUX plans. Il écrit
 * « C/ 4331 INPP · C/ 4332 ONEM ». Le 4331 est « Mutuelle » et le 4332
 * « Assurances retraite » des deux côtés ; l'INPP est au 4334 et l'ONEM au
 * 4335. Un cabinet qui suivrait ce schéma porterait l'INPP à la mutuelle sur
 * une balance qui boucle.
 */

import type { NatureElementPaie } from './assiettes-paie';
import { compteDeLAvance, type CategoriePret, type TypeAvance } from './avances-salaire';

export type Referentiel = 'SYSCOHADA' | 'SYCEBNL';

export type RoleComptePaie =
  | 'APPOINTEMENTS_ET_COMMISSIONS'
  | 'PRIMES_ET_GRATIFICATIONS'
  | 'CONGES_PAYES'
  | 'INDEMNITES_DE_MALADIE'
  | 'AVANTAGES_EN_NATURE'
  | 'AUTRES_REMUNERATIONS_DIRECTES'
  | 'INDEMNITE_DE_LOGEMENT'
  | 'INDEMNITE_DE_TRANSPORT'
  | 'AUTRES_INDEMNITES'
  | 'CHARGES_SOCIALES_PATRONALES'
  | 'CNSS_PRESTATIONS_FAMILIALES'
  | 'CNSS_RISQUES_PROFESSIONNELS'
  | 'CNSS_PENSIONS'
  | 'INPP'
  | 'ONEM'
  | 'IRPP_RETENU'
  | 'REMUNERATIONS_DUES';

export type CompteDuRole = {
  readonly SYSCOHADA: string;
  readonly SYCEBNL: string;
  readonly intitule: string;
  /** Vrai lorsque les deux plans n'emploient PAS le même numéro. */
  readonly divergent: boolean;
};

/**
 * LA TABLE, ET LA SEULE. Chaque rôle porte SES DEUX numéros, relus au semis le
 * 2026-09-19. Le drapeau `divergent` n'est pas décoratif · un test le
 * recalcule depuis les deux numéros, de sorte qu'un numéro changé d'un côté
 * sans l'autre fasse tomber le décompte.
 */
export const NOMENCLATURE_PAIE: Readonly<Record<RoleComptePaie, CompteDuRole>> = {
  APPOINTEMENTS_ET_COMMISSIONS: {
    SYSCOHADA: '66110000',
    SYCEBNL: '66110000',
    intitule: 'Appointements, salaires et commissions',
    divergent: false,
  },
  PRIMES_ET_GRATIFICATIONS: {
    SYSCOHADA: '66120000',
    SYCEBNL: '66120000',
    intitule: 'Primes et gratifications',
    divergent: false,
  },
  CONGES_PAYES: {
    SYSCOHADA: '66130000',
    SYCEBNL: '66130000',
    intitule: 'Congés payés',
    divergent: false,
  },
  INDEMNITES_DE_MALADIE: {
    SYSCOHADA: '66150000',
    SYCEBNL: '66150000',
    intitule: 'Indemnités de maladie versées aux travailleurs',
    divergent: false,
  },
  AVANTAGES_EN_NATURE: {
    SYSCOHADA: '66170000',
    SYCEBNL: '66170000',
    intitule: 'Avantages en nature',
    divergent: false,
  },
  AUTRES_REMUNERATIONS_DIRECTES: {
    SYSCOHADA: '66180000',
    SYCEBNL: '66180000',
    intitule: 'Autres rémunérations directes',
    divergent: false,
  },
  INDEMNITE_DE_LOGEMENT: {
    SYSCOHADA: '66310000',
    SYCEBNL: '66310000',
    intitule: 'Indemnités de logement',
    divergent: false,
  },
  INDEMNITE_DE_TRANSPORT: {
    SYSCOHADA: '66340000',
    SYCEBNL: '66340000',
    intitule: 'Indemnités de transport',
    divergent: false,
  },
  AUTRES_INDEMNITES: {
    SYSCOHADA: '66380000',
    SYCEBNL: '66380000',
    intitule: 'Autres indemnités et avantages divers',
    divergent: false,
  },
  CHARGES_SOCIALES_PATRONALES: {
    SYSCOHADA: '66410000',
    SYCEBNL: '66410000',
    intitule: 'Charges sociales sur rémunération du personnel national',
    divergent: false,
  },
  CNSS_PRESTATIONS_FAMILIALES: {
    SYSCOHADA: '43110000',
    SYCEBNL: '43110000',
    intitule: 'Sécurité sociale · prestations familiales',
    divergent: false,
  },
  CNSS_RISQUES_PROFESSIONNELS: {
    SYSCOHADA: '43120000',
    SYCEBNL: '43120000',
    intitule: 'Sécurité sociale · accidents de travail',
    divergent: false,
  },
  // LE SEUL RÔLE DIVERGENT DU CYCLE. Voir l'en-tête du fichier.
  CNSS_PENSIONS: {
    SYSCOHADA: '43130000',
    SYCEBNL: '43210000',
    intitule: 'Caisse de retraite obligatoire',
    divergent: true,
  },
  INPP: {
    SYSCOHADA: '43340000',
    SYCEBNL: '43340000',
    intitule: 'INPP (formation professionnelle)',
    divergent: false,
  },
  ONEM: {
    SYSCOHADA: '43350000',
    SYCEBNL: '43350000',
    intitule: 'ONEM (emploi)',
    divergent: false,
  },
  IRPP_RETENU: {
    SYSCOHADA: '44720000',
    SYCEBNL: '44720000',
    intitule: 'État, impôts retenus à la source · impôts sur salaires',
    divergent: false,
  },
  REMUNERATIONS_DUES: {
    SYSCOHADA: '42200000',
    SYCEBNL: '42200000',
    intitule: 'Personnel, rémunérations dues',
    divergent: false,
  },
} as const;

export const compteDuRole = (role: RoleComptePaie, referentiel: Referentiel): string =>
  NOMENCLATURE_PAIE[role][referentiel];

/**
 * QUATRE NATURES QUE LA PASSATION N'IMPUTE PAS, ET CHACUNE A SA RAISON.
 *
 * Ce ne sont pas des oublis. Chacune ouvre une question qu'aucune source lue
 * ne tranche, et deviner l'imputation produirait une écriture équilibrée sur
 * une nature fausse, que la Note annexe publierait ensuite.
 */
export const NATURES_SANS_IMPUTATION: Readonly<Partial<Record<NatureElementPaie, string>>> = {
  PARTICIPATION_AUX_BENEFICES:
    "Le SYSCOHADA ouvre 42610000 « Participation aux bénéfices », le SYCEBNL N'OUVRE PAS de 426 du tout. L'absence est elle-même la réponse : une entité à but non lucratif n'a pas de bénéfices à partager. Et côté SYSCOHADA, la participation suit un régime propre (affectation du résultat), non une charge de paie du mois.",
  ALLOCATIONS_FAMILIALES_LEGALES:
    "Les allocations familiales légales sont SERVIES PAR LA CNSS, et l'arrêté n° 143/2018 organise leur paiement par l'employeur en dévolution. Ce que l'employeur avance est alors une CRÉANCE sur la Caisse, non une charge. Aucune source lue ne dit par quel compte, et l'imputer en charge gonflerait les charges de personnel du montant avancé.",
  SOINS_DE_SANTE:
    "Le plan ouvre plusieurs comptes qui pourraient la recevoir (66840000 médecine du travail et pharmacie, 66850000 assurances et organismes de santé, 42410000 œuvres sociales internes · assistance médicale), et aucune source lue ne dit lequel reçoit un remboursement de frais médicaux à un travailleur. La qualification appartient au cabinet.",
  FRAIS_DE_VOYAGE_OU_AVANTAGE_DE_FONCTION:
    "Un frais de voyage professionnel est un transport (classe 61), un avantage de fonction une charge de personnel (663), et un remboursement de dépense effective n'est ni l'un ni l'autre. Aucune source lue ne tranche à partir de la seule nature, et l'article 68, 1 de la loi n° 23/053 renvoie justement au caractère EFFECTIF de la dépense, qui est une qualification.",
} as const;

/**
 * L'IMPUTATION DE CHAQUE NATURE D'ÉLÉMENT. Les natures absentes de cette table
 * sont celles de `NATURES_SANS_IMPUTATION` · un test vérifie que les deux
 * tables se complètent EXACTEMENT, sans trou ni recouvrement.
 */
export const IMPUTATION_PAR_NATURE: Readonly<
  Partial<Record<NatureElementPaie, RoleComptePaie>>
> = {
  SALAIRE_OU_TRAITEMENT: 'APPOINTEMENTS_ET_COMMISSIONS',
  COMMISSION: 'APPOINTEMENTS_ET_COMMISSIONS',
  PRIME: 'PRIMES_ET_GRATIFICATIONS',
  GRATIFICATION_OU_MOIS_COMPLEMENTAIRE: 'PRIMES_ET_GRATIFICATIONS',
  PRESTATION_SUPPLEMENTAIRE: 'AUTRES_REMUNERATIONS_DIRECTES',
  INDEMNITE_DE_VIE_CHERE: 'AUTRES_INDEMNITES',
  AVANTAGE_EN_NATURE: 'AVANTAGES_EN_NATURE',
  ALLOCATION_OU_INDEMNITE_COMPENSATOIRE_DE_CONGE: 'CONGES_PAYES',
  INDEMNITE_INCAPACITE_OU_ACCOUCHEMENT: 'INDEMNITES_DE_MALADIE',
  LOGEMENT_OU_SON_INDEMNITE: 'INDEMNITE_DE_LOGEMENT',
  INDEMNITE_DE_TRANSPORT: 'INDEMNITE_DE_TRANSPORT',
} as const;

export type SensLigne = 'DEBIT' | 'CREDIT';

/**
 * LES TROIS TEMPS DE L'ÉCRITURE DE PAIE, dans l'ordre du Guide d'application
 * SYSCOHADA, Partie 1 ch. 3, section 4 et Application 10 · et dans les mots de
 * la fiche du compte 42, identiques dans les deux plans (AUDCIF Titre VII ;
 * SYCEBNL Partie 2 ch. 3) :
 *  · BRUT · « crédité des rémunérations BRUTES à payer au personnel, par le
 *    débit des comptes de charges intéressés 66 » (§ 4.1) ;
 *  · RETENUES · le 42 est « débité des versements effectués aux organismes
 *    sociaux pour le compte du personnel (cotisations salariales), par le
 *    crédit du compte 43 », et les autres retenues sont « virées de 422 vers
 *    [...] 447 (impôts retenus à la source) » (§ 4.3) ;
 *  · PATRONALES · « débit 6641/6642, crédit organismes 431-433 » (§ 4.2).
 * Le solde du 422 est alors le NET À PAYER, que le règlement solde ensuite.
 */
export type BlocPaie = 'BRUT' | 'RETENUES' | 'PATRONALES';

export type LigneProposee = {
  readonly bloc: BlocPaie;
  readonly compte: string;
  readonly intitule: string;
  readonly sens: SensLigne;
  readonly montantFc: number;
  readonly reserve: string | null;
};

export type MotifRefusPassation =
  | 'NATURE_SANS_IMPUTATION'
  | 'COTISATION_EN_ABSTENTION'
  | 'IMPOT_INDETERMINE'
  | 'ECRITURE_DESEQUILIBREE';

export type VerdictPassation = {
  readonly referentiel: Referentiel;
  readonly lignes: readonly LigneProposee[];
  readonly totalDebitFc: number;
  readonly totalCreditFc: number;
  readonly equilibree: boolean;
  readonly refus: readonly { motif: MotifRefusPassation; explication: string }[];
  readonly reserves: readonly string[];
};

export type EntreePassation = {
  readonly referentiel: Referentiel;
  readonly elements: readonly { nature: NatureElementPaie; libelle: string; montantFc: number }[];
  readonly cotisations: readonly {
    cle: string;
    charge: 'EMPLOYEUR' | 'TRAVAILLEUR';
    montantFc: number;
  }[];
  readonly abstentionsCotisations: readonly string[];
  readonly irppFc: number | null;
  readonly netAPayerFc: number | null;
  /**
   * Article 112, c) et f) · les retenues d'avance, d'acompte et de prêt du
   * bulletin. Absent sur un bulletin émis avant ce chantier · il n'en
   * portait aucune.
   */
  readonly retenuesAvances?: readonly {
    type: TypeAvance;
    categoriePret: CategoriePret | null;
    libelle: string;
    montantFc: number;
  }[];
};

const ROLE_PAR_CLE_COTISATION: Readonly<Record<string, RoleComptePaie>> = {
  'cnss-pf': 'CNSS_PRESTATIONS_FAMILIALES',
  'cnss-rp': 'CNSS_RISQUES_PROFESSIONNELS',
  'cnss-pension-employeur': 'CNSS_PENSIONS',
  'cnss-pension-travailleur': 'CNSS_PENSIONS',
  inpp: 'INPP',
  onem: 'ONEM',
};

/**
 * L'ÉCRITURE DE PAIE PROPOSÉE, ET LES QUATRE MOTIFS QUI LA REFUSENT.
 *
 * ELLE S'ÉQUILIBRE PAR CONSTRUCTION, et la démonstration tient en une ligne ·
 * au débit, le total versé plus les charges patronales ; au crédit, toutes les
 * cotisations plus l'impôt plus le net, et le net vaut le total versé moins la
 * quote-part ouvrière moins l'impôt. Les deux se réduisent au même. Le contrôle
 * est fait QUAND MÊME, et son échec est un REFUS · une écriture de paie
 * déséquilibrée ne se corrige pas d'un arrondi, c'est un défaut du moteur.
 *
 * TROIS AUTRES REFUS, chacun contre un défaut qui laisse l'écriture équilibrée.
 * Une NATURE SANS IMPUTATION serait devinée. Une COTISATION EN ABSTENTION
 * (l'INPP sans nature d'employeur déclarée) sortirait une charge de personnel
 * MINORÉE du montant manquant, sur une écriture qui boucle, et rien en aval ne
 * le verrait. Un IMPÔT INDÉTERMINÉ rendrait un net qui ne l'est pas moins.
 *
 * ET LES DEUX MOITIÉS NE SE CONFONDENT PAS · cette écriture CONSTATE la paie.
 * Son RÈGLEMENT est une seconde écriture, qui débite le 422 par le crédit de
 * la trésorerie, dans un autre journal. Les deux textes écrivent la règle dans
 * la fiche de leur compte 42, et le dépôt l'a déjà payée au chantier des
 * modèles de saisie.
 */
export function passationPaie(entree: EntreePassation): VerdictPassation {
  const refus: { motif: MotifRefusPassation; explication: string }[] = [];
  const reserves: string[] = [];
  const lignes: LigneProposee[] = [];
  const r = entree.referentiel;

  // 1 · Les charges de rémunération, regroupées par compte.
  const parRole = new Map<RoleComptePaie, number>();
  for (const e of entree.elements) {
    const sansImputation = NATURES_SANS_IMPUTATION[e.nature];
    if (sansImputation) {
      refus.push({
        motif: 'NATURE_SANS_IMPUTATION',
        explication: `« ${e.libelle} » (${e.nature}) · ${sansImputation}`,
      });
      continue;
    }
    const role = IMPUTATION_PAR_NATURE[e.nature];
    if (!role) {
      refus.push({
        motif: 'NATURE_SANS_IMPUTATION',
        explication: `« ${e.libelle} » (${e.nature}) · aucune imputation n'est déclarée pour cette nature.`,
      });
      continue;
    }
    parRole.set(role, (parRole.get(role) ?? 0) + Math.max(0, e.montantFc));
  }

  if (entree.abstentionsCotisations.length > 0) {
    refus.push({
      motif: 'COTISATION_EN_ABSTENTION',
      explication:
        "Une cotisation au moins n'est pas chiffrée : " +
        entree.abstentionsCotisations.join(' ') +
        " L'écriture serait pourtant ÉQUILIBRÉE, avec une charge de personnel minorée du montant manquant, et rien en aval ne le verrait.",
    });
  }
  if (entree.irppFc === null || entree.netAPayerFc === null) {
    refus.push({
      motif: 'IMPOT_INDETERMINE',
      explication:
        "L'impôt du mois n'est pas chiffré, et le net à payer ne l'est donc pas non plus. Aucune écriture n'est proposée.",
    });
  }

  if (refus.length > 0) {
    return {
      referentiel: r,
      lignes: [],
      totalDebitFc: 0,
      totalCreditFc: 0,
      equilibree: false,
      refus,
      reserves,
    };
  }

  const reserveRole = (role: RoleComptePaie) =>
    NOMENCLATURE_PAIE[role].divergent
      ? `NUMÉRO PROPRE AU RÉFÉRENTIEL · ce rôle est au ${NOMENCLATURE_PAIE[role].SYSCOHADA} en SYSCOHADA et au ${NOMENCLATURE_PAIE[role].SYCEBNL} en SYCEBNL. L'autre numéro n'est pas ouvert dans ce plan.`
      : null;

  // 1 · LE BRUT · D/66 par nature, C/422 pour le brut entier. L'impôt et la
  //     quote-part ouvrière sont DANS ce brut : ce sont des sommes dues au
  //     salarié, que l'employeur retient et reverse pour son compte. Ni l'une
  //     ni l'autre n'est une charge de l'employeur.
  let brutFc = 0;
  for (const [role, montantFc] of parRole) {
    if (montantFc <= 0) continue;
    brutFc += montantFc;
    lignes.push({
      bloc: 'BRUT',
      compte: compteDuRole(role, r),
      intitule: NOMENCLATURE_PAIE[role].intitule,
      sens: 'DEBIT',
      montantFc,
      reserve: null,
    });
  }
  lignes.push({
    bloc: 'BRUT',
    compte: compteDuRole('REMUNERATIONS_DUES', r),
    intitule: NOMENCLATURE_PAIE.REMUNERATIONS_DUES.intitule,
    sens: 'CREDIT',
    montantFc: brutFc,
    reserve:
      "LE 422 EST CRÉDITÉ DU BRUT, puis débité des retenues · son solde est le net à payer. LE RÈGLEMENT EST UNE SECONDE ÉCRITURE · le 422 est débité des paiements par le crédit de la trésorerie, dans un autre journal. Les deux textes l'écrivent à la fiche de leur compte 42.",
  });

  // 2 · LES RETENUES · D/422, C/43 pour les cotisations ouvrières, C/447 pour
  //     l'impôt retenu à la source.
  const ouvrieres = new Map<RoleComptePaie, number>();
  const patronalesParRole = new Map<RoleComptePaie, number>();
  for (const c of entree.cotisations) {
    const role = ROLE_PAR_CLE_COTISATION[c.cle];
    if (!role || c.montantFc <= 0) continue;
    const cible = c.charge === 'TRAVAILLEUR' ? ouvrieres : patronalesParRole;
    cible.set(role, (cible.get(role) ?? 0) + c.montantFc);
  }
  const irppFc = Math.max(0, entree.irppFc ?? 0);
  let retenuesFc = irppFc;
  for (const m of ouvrieres.values()) retenuesFc += m;
  // Article 112, c) et f) · regroupées par compte crédité (4211, 4212, 272x).
  const avancesParCompte = new Map<string, { intitule: string; montantFc: number }>();
  for (const a of entree.retenuesAvances ?? []) {
    if (!(a.montantFc > 0)) continue;
    const { compte, intitule } = compteDeLAvance(a.type, a.categoriePret);
    const cumul = avancesParCompte.get(compte) ?? { intitule, montantFc: 0 };
    cumul.montantFc += a.montantFc;
    avancesParCompte.set(compte, cumul);
    retenuesFc += a.montantFc;
  }
  if (retenuesFc > 0) {
    lignes.push({
      bloc: 'RETENUES',
      compte: compteDuRole('REMUNERATIONS_DUES', r),
      intitule: NOMENCLATURE_PAIE.REMUNERATIONS_DUES.intitule,
      sens: 'DEBIT',
      montantFc: retenuesFc,
      reserve: null,
    });
    for (const [role, montantFc] of ouvrieres) {
      lignes.push({
        bloc: 'RETENUES',
        compte: compteDuRole(role, r),
        intitule: NOMENCLATURE_PAIE[role].intitule,
        sens: 'CREDIT',
        montantFc,
        reserve: reserveRole(role),
      });
    }
    for (const [compte, { intitule, montantFc }] of avancesParCompte) {
      lignes.push({
        bloc: 'RETENUES',
        compte,
        intitule,
        sens: 'CREDIT',
        montantFc,
        reserve:
          "RETENUE DE L'ARTICLE 112, c) OU f) · le 422 est viré vers le compte de l'avance (Guide d'application SYSCOHADA, Partie 1 ch. 3, § 4.3 et Application 10). Un prêt reste au 272 · les deux plans l'excluent du 42.",
      });
    }
    if (irppFc > 0) {
      lignes.push({
        bloc: 'RETENUES',
        compte: compteDuRole('IRPP_RETENU', r),
        intitule: NOMENCLATURE_PAIE.IRPP_RETENU.intitule,
        sens: 'CREDIT',
        montantFc: irppFc,
        reserve:
          "L'IMPÔT RETENU N'EST PAS UNE CHARGE DE L'EMPLOYEUR · il est prélevé sur le brut du salarié et reversé pour son compte. C'est l'IRPP de l'article 119 de la loi n° 23/053 qui s'y loge.",
      });
    }
  }

  // 3 · LES CHARGES PATRONALES · D/664, C/43 · les seules cotisations qui
  //     soient une charge de l'entité.
  let patronalesFc = 0;
  for (const m of patronalesParRole.values()) patronalesFc += m;
  if (patronalesFc > 0) {
    lignes.push({
      bloc: 'PATRONALES',
      compte: compteDuRole('CHARGES_SOCIALES_PATRONALES', r),
      intitule: NOMENCLATURE_PAIE.CHARGES_SOCIALES_PATRONALES.intitule,
      sens: 'DEBIT',
      montantFc: patronalesFc,
      reserve:
        "Le 6641 vise le personnel NATIONAL. Un dossier qui emploie des non-nationaux ventile entre 66410000 et 66420000, et OmegaX ne connaît pas la nationalité ligne à ligne.",
    });
    for (const [role, montantFc] of patronalesParRole) {
      lignes.push({
        bloc: 'PATRONALES',
        compte: compteDuRole(role, r),
        intitule: NOMENCLATURE_PAIE[role].intitule,
        sens: 'CREDIT',
        montantFc,
        reserve: reserveRole(role),
      });
    }
  }

  // LE SOLDE DU 422 DOIT ÊTRE LE NET DU BULLETIN · brut moins retenues. Un
  // écart dirait que le moteur et la passation ne parlent pas du même bulletin.
  if (Math.abs(brutFc - retenuesFc - (entree.netAPayerFc as number)) >= 0.005) {
    refus.push({
      motif: 'ECRITURE_DESEQUILIBREE',
      explication: `Le 422 solderait à ${(brutFc - retenuesFc).toFixed(2)} FC quand le net du bulletin est ${(entree.netAPayerFc as number).toFixed(2)} FC. Un écart est un défaut du moteur, jamais un arrondi à rattraper. Rien n'est proposé.`,
    });
    return { referentiel: r, lignes: [], totalDebitFc: 0, totalCreditFc: 0, equilibree: false, refus, reserves };
  }

  const totalDebitFc = lignes.filter((l) => l.sens === 'DEBIT').reduce((n, l) => n + l.montantFc, 0);
  const totalCreditFc = lignes.filter((l) => l.sens === 'CREDIT').reduce((n, l) => n + l.montantFc, 0);
  const equilibree = Math.abs(totalDebitFc - totalCreditFc) < 0.005;

  if (!equilibree) {
    refus.push({
      motif: 'ECRITURE_DESEQUILIBREE',
      explication:
        `Débit ${totalDebitFc.toFixed(2)} FC contre crédit ${totalCreditFc.toFixed(2)} FC. ` +
        "L'écriture de paie s'équilibre par construction : un écart est un défaut du moteur, jamais un arrondi à rattraper. Rien n'est proposé.",
    });
    return {
      referentiel: r,
      lignes: [],
      totalDebitFc,
      totalCreditFc,
      equilibree: false,
      refus,
      reserves,
    };
  }

  reserves.push(
    "OMEGAX PROPOSE, LE COMPTABLE PASSE · la simulation n'enregistre rien. Une fois les bulletins émis, la paie du mois se passe au journal en UNE écriture depuis l'onglet Bulletins ; la date, le journal et le libellé appartiennent au cabinet.",
  );
  reserves.push(
    "LE JOURNAL · le dossier est semé avec cinq journaux (achats, ventes, banque, caisse, opérations diverses). La paie se passe aux OPÉRATIONS DIVERSES tant que le cabinet n'a pas ouvert un journal de paie dédié, ce qu'OmegaX ne fait pas à sa place.",
  );
  reserves.push(
    "LES AVANTAGES EN NATURE SONT ICI IMPUTÉS AU 66170000, ce qui SIMPLIFIE le Guide d'application SYSCOHADA (Partie 1 ch. 3, § 4.5) : il les enregistre « par nature (614 transports, 622 locations, 624 entretien, 628 télécom…) puis régularisation globale fin d'exercice : débit 6617/6627, crédit 781 ». Le total des charges est le même ; la ventilation par nature ne l'est pas. Un dossier qui suit le Guide passe l'avantage par nature et régularise à la clôture.",
  );

  return { referentiel: r, lignes, totalDebitFc, totalCreditFc, equilibree, refus, reserves };
}
