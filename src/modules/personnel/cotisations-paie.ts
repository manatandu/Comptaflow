/**
 * LES COTISATIONS D'UN BULLETIN, ET LE NET À PAYER.
 *
 * Trois organismes, trois textes, et des dates d'effet qui ne coïncident pas.
 * Chaque taux porte ici SA source et SA borne · le registre des retenues les
 * porte déjà pour la DÉCLARATION, ce fichier les porte pour le CALCUL, et les
 * deux se lisent au même endroit (`correspondance-retenues.ts`) pour qu'aucun
 * taux ne vive en double.
 *
 * ────────────────────────────────────────────────────────────────────────
 * TROIS ASSIETTES POSSIBLES, ET LE TEXTE N'EN NOMME EXPRESSÉMENT QU'UNE.
 *
 * LA CNSS est la seule dont l'assiette soit ROUTÉE par la loi : l'article 13
 * de la loi n° 16/009 assied les cotisations « sur l'ensemble de la
 * rémunération du travailleur assujetti TEL QUE PRÉVU À L'ARTICLE 7, LITERA H,
 * DU CODE DU TRAVAIL », et l'arrêté n° 146/2018, article 17, point 1, recopie
 * la définition avec ses cinq exclusions.
 *
 * L'INPP dit « les rémunérations versées à ses travailleurs ». L'ONEM dit « la
 * rémunération mensuelle payée aux travailleurs ». NI L'UN NI L'AUTRE NE
 * RENVOIE À L'ARTICLE 7. OmegaX retient pour les deux la MÊME assiette que la
 * CNSS, parce que les deux arrêtés sont pris par le Ministre ayant le Travail
 * dans ses attributions et que « rémunération » est un mot DÉFINI par le Code
 * dont ils relèvent. C'est une LECTURE, elle est portée en réserve sur chaque
 * ligne, et elle n'est pas neutre : lue comme le brut versé, l'assiette INPP
 * d'un dossier qui loge son personnel serait sensiblement plus large.
 * ────────────────────────────────────────────────────────────────────────
 *
 * ET L'ASSIETTE N'EST PAS CE QU'ON PAIE. Le logement, le transport, les soins
 * de santé et les allocations familiales sortent de la rémunération, mais ils
 * sont bien VERSÉS au travailleur. Le net à payer part donc du TOTAL VERSÉ,
 * jamais de l'assiette · partir de l'assiette amputerait le net de tout ce que
 * les cinq exclusions représentent, sur un bulletin dont les cotisations
 * seraient justes.
 */

export type ChargeCotisation = 'EMPLOYEUR' | 'TRAVAILLEUR';

export type NatureEmployeurInpp = 'PUBLIC' | 'PRIVE';

export type LigneCotisation = {
  readonly cle: string;
  readonly libelle: string;
  readonly organisme: 'CNSS' | 'INPP' | 'ONEM';
  readonly charge: ChargeCotisation;
  readonly tauxPourCent: number;
  readonly assietteFc: number;
  readonly montantFc: number;
  readonly source: string;
  readonly reserve: string | null;
};

/**
 * Décret n° 18/041 du 24 novembre 2018, articles 2 à 4. Trois branches, et la
 * branche des pensions est la SEULE partagée · c'est elle qui porte la
 * quote-part ouvrière, et elle seule se retient sur la paie.
 */
export const TAUX_CNSS = {
  prestationsAuxFamilles: { tauxPourCent: 6.5, charge: 'EMPLOYEUR' as ChargeCotisation, article: 'article 2' },
  pensionsEmployeur: { tauxPourCent: 5, charge: 'EMPLOYEUR' as ChargeCotisation, article: 'article 3' },
  pensionsTravailleur: { tauxPourCent: 5, charge: 'TRAVAILLEUR' as ChargeCotisation, article: 'article 3' },
  risquesProfessionnels: { tauxPourCent: 1.5, charge: 'EMPLOYEUR' as ChargeCotisation, article: 'article 4' },
} as const;

/**
 * Article 5 du même décret · le taux des risques professionnels « peut être
 * MAJORÉ par la Caisse JUSQU'À CONCURRENCE DU DOUBLE à l'égard d'un employeur
 * aussi longtemps qu'il ne se conforme pas aux prescriptions de la Loi ».
 *
 * C'est une DÉCISION DE LA CAISSE, jamais un effet automatique d'un manquement
 * constaté par le logiciel. Elle se déclare, et OmegaX ne la présume pas :
 * l'appliquer d'office ferait cotiser 1,5 point de trop sur tout le parc.
 */
export const MAJORATION_RISQUES_PROFESSIONNELS_MAXIMUM = 2;

/**
 * INPP · arrêté interministériel n° 002/CAB/MET/2025 et autres du 24 septembre
 * 2025, article 1er, en vigueur « à la date de sa signature ». Avant lui,
 * l'arrêté n° 12/MTPS/123 et autres du 14 février 2006.
 *
 * LE TAUX DÉPEND D'ABORD DE LA NATURE DE L'EMPLOYEUR, puis, pour le privé
 * SEULEMENT, de la tranche d'effectif · jamais d'un chiffre d'affaires ni
 * d'une masse salariale.
 */
export type BaremeInpp = {
  readonly aPartirDu: string;
  readonly reference: string;
  readonly publicPourCent: number;
  readonly priveParTranche: readonly { readonly jusqua: number | null; readonly tauxPourCent: number }[];
};

export const BAREMES_INPP: readonly BaremeInpp[] = [
  {
    aPartirDu: '2006-02-14',
    reference:
      "Arrêté interministériel n° 12/MTPS/123, n° 007/CAB/MIN/FINANCES/2006, n° 001/CAB/MIN/BUD/2006 du 14 février 2006, article 1er",
    publicPourCent: 3,
    priveParTranche: [
      { jusqua: 50, tauxPourCent: 3 },
      { jusqua: 300, tauxPourCent: 2 },
      { jusqua: null, tauxPourCent: 1 },
    ],
  },
  {
    aPartirDu: '2025-09-24',
    reference:
      "Arrêté interministériel n° 002/CAB/MET/2025, n° […]/CAB/MIN/FINANCES/2025, n° 003/CAB/VPM/MIN/BUD/2025 du 24 septembre 2025, article 1er",
    publicPourCent: 4,
    priveParTranche: [
      { jusqua: 50, tauxPourCent: 3.5 },
      { jusqua: 300, tauxPourCent: 3 },
      { jusqua: null, tauxPourCent: 2 },
    ],
  },
] as const;

/**
 * ONEM · arrêté ministériel n° 028/CAB/MIN.ET/FMM/RK/09/2025, article 1er,
 * 0,5 % de la rémunération mensuelle payée, en vigueur à la date de signature
 * du 25 septembre 2025. Avant, 0,2 % (arrêté n° 095/CAB/MINETAT/MTEPS/01/2018
 * du 17 août 2018). Un exercice à cheval sur septembre 2025 porte les DEUX.
 */
export const BAREMES_ONEM: readonly { aPartirDu: string; tauxPourCent: number; reference: string }[] = [
  {
    aPartirDu: '2018-08-17',
    tauxPourCent: 0.2,
    reference: "Arrêté ministériel n° 095/CAB/MINETAT/MTEPS/01/2018 du 17 août 2018",
  },
  {
    aPartirDu: '2025-09-25',
    tauxPourCent: 0.5,
    reference: "Arrêté ministériel n° 028/CAB/MIN.ET/FMM/RK/09/2025, article 1er",
  },
] as const;

const RESERVE_ASSIETTE_EMPRUNTEE =
  "LECTURE · ce texte dit « rémunération » sans renvoyer à l'article 7 du Code du travail. OmegaX retient la même assiette que la CNSS, le mot étant DÉFINI par le Code dont cet arrêté relève. Lue comme le brut versé, l'assiette serait plus large de tout le logement et le transport.";

/** Le dernier barème dont la date d'effet est atteinte au premier jour du mois. */
const baremeDuMois = <T extends { aPartirDu: string }>(
  baremes: readonly T[],
  moisDePaie: string,
): T | null => {
  // Le mois de paie est comparé à son PREMIER jour · un arrêté signé le 24 du
  // mois mord sur la paie de ce mois-là, et le borner au dernier jour ferait
  // manquer le premier mois de chaque changement de taux.
  const premierJour = `${moisDePaie}-01`;
  const applicables = baremes.filter((b) => b.aPartirDu.slice(0, 7) <= premierJour.slice(0, 7));
  return applicables.length === 0 ? null : applicables[applicables.length - 1];
};

export function tauxInpp(
  moisDePaie: string,
  nature: NatureEmployeurInpp,
  effectif: number | null,
): { tauxPourCent: number | null; source: string; motifAbstention: string | null } {
  const bareme = baremeDuMois(BAREMES_INPP, moisDePaie);
  if (!bareme) {
    return {
      tauxPourCent: null,
      source: '',
      motifAbstention: `Aucun barème INPP lu pour le mois ${moisDePaie}.`,
    };
  }
  if (nature === 'PUBLIC') {
    return { tauxPourCent: bareme.publicPourCent, source: bareme.reference, motifAbstention: null };
  }
  if (effectif === null || !Number.isFinite(effectif) || effectif <= 0) {
    // L'effectif commande la tranche, et il ne se devine pas. Retenir la
    // tranche la plus basse ferait sous-cotiser un grand employeur ; la plus
    // haute ferait sur-cotiser un petit.
    return {
      tauxPourCent: null,
      source: bareme.reference,
      motifAbstention:
        "Le taux INPP d'un employeur PRIVÉ dépend de sa tranche d'effectif. Renseignez l'effectif, OmegaX ne choisit pas de tranche.",
    };
  }
  for (const tranche of bareme.priveParTranche) {
    if (tranche.jusqua === null || effectif <= tranche.jusqua) {
      return { tauxPourCent: tranche.tauxPourCent, source: bareme.reference, motifAbstention: null };
    }
  }
  return { tauxPourCent: null, source: bareme.reference, motifAbstention: 'Tranche introuvable.' };
}

export function tauxOnem(moisDePaie: string): { tauxPourCent: number | null; source: string } {
  const bareme = baremeDuMois(BAREMES_ONEM, moisDePaie);
  return bareme
    ? { tauxPourCent: bareme.tauxPourCent, source: bareme.reference }
    : { tauxPourCent: null, source: '' };
}

export type ParametresCotisations = {
  readonly moisDePaie: string;
  readonly natureEmployeurInpp?: NatureEmployeurInpp | null;
  readonly effectif?: number | null;
  /** Article 5 du décret n° 18/041 · décision de la Caisse, jamais présumée. */
  readonly majorationRisquesProfessionnels?: boolean;
};

export type VerdictCotisations = {
  readonly lignes: readonly LigneCotisation[];
  readonly totalEmployeurFc: number;
  readonly totalTravailleurFc: number;
  /** Ce que l'employeur supporte en plus du brut. */
  readonly coutEmployeurSupplementaireFc: number;
  readonly abstentions: readonly string[];
};

/**
 * Les cotisations d'un mois, sur l'assiette SOCIALE et sur elle seule.
 *
 * La quote-part ouvrière rendue ici est celle que l'article 71 de la loi
 * n° 23/053 laisse déduire du brut imposable · c'est elle, et non le total des
 * cotisations, qui entre dans l'assiette fiscale. Servir le total y ferait
 * déduire les cotisations patronales, qui ne sont pas retenues sur le revenu
 * du travailleur.
 */
export function cotisations(
  assietteSocialeFc: number,
  parametres: ParametresCotisations,
): VerdictCotisations {
  const lignes: LigneCotisation[] = [];
  const abstentions: string[] = [];
  const assiette = Math.max(0, assietteSocialeFc);
  const sourceCnss =
    "Décret n° 18/041 du 24 novembre 2018 ; assiette routée par l'article 13 de la loi n° 16/009 vers l'article 7, litera h du Code du travail, et recopiée à l'article 17, point 1 de l'arrêté n° 146/2018.";

  const poser = (
    cle: string,
    libelle: string,
    organisme: LigneCotisation['organisme'],
    charge: ChargeCotisation,
    tauxPourCent: number,
    source: string,
    reserve: string | null,
  ) => {
    lignes.push({
      cle,
      libelle,
      organisme,
      charge,
      tauxPourCent,
      assietteFc: assiette,
      montantFc: (assiette * tauxPourCent) / 100,
      source,
      reserve,
    });
  };

  poser('cnss-pf', 'CNSS · prestations aux familles', 'CNSS', 'EMPLOYEUR', TAUX_CNSS.prestationsAuxFamilles.tauxPourCent, `${sourceCnss} Taux : ${TAUX_CNSS.prestationsAuxFamilles.article}.`, null);
  poser('cnss-pension-employeur', 'CNSS · pensions, part employeur', 'CNSS', 'EMPLOYEUR', TAUX_CNSS.pensionsEmployeur.tauxPourCent, `${sourceCnss} Taux : ${TAUX_CNSS.pensionsEmployeur.article}.`, null);
  poser('cnss-pension-travailleur', 'CNSS · pensions, quote-part ouvrière', 'CNSS', 'TRAVAILLEUR', TAUX_CNSS.pensionsTravailleur.tauxPourCent, `${sourceCnss} Taux : ${TAUX_CNSS.pensionsTravailleur.article}.`, "C'est la SEULE cotisation retenue sur la paie, et la seule que l'article 71 de la loi n° 23/053 laisse déduire du brut imposable.");

  const tauxRp =
    TAUX_CNSS.risquesProfessionnels.tauxPourCent *
    (parametres.majorationRisquesProfessionnels ? MAJORATION_RISQUES_PROFESSIONNELS_MAXIMUM : 1);
  poser(
    'cnss-rp',
    'CNSS · risques professionnels',
    'CNSS',
    'EMPLOYEUR',
    tauxRp,
    `${sourceCnss} Taux : ${TAUX_CNSS.risquesProfessionnels.article}.`,
    parametres.majorationRisquesProfessionnels
      ? "Taux MAJORÉ au double par décision de la Caisse (article 5 du décret n° 18/041). La majoration se déclare, elle ne se déduit d'aucun manquement constaté par le logiciel."
      : null,
  );

  const nature = parametres.natureEmployeurInpp ?? null;
  if (nature === null) {
    abstentions.push(
      "INPP · le taux dépend d'abord de la NATURE de l'employeur, public ou privé. Elle n'est pas renseignée, et OmegaX ne la présume pas.",
    );
  } else {
    const inpp = tauxInpp(parametres.moisDePaie, nature, parametres.effectif ?? null);
    if (inpp.tauxPourCent === null) {
      abstentions.push(`INPP · ${inpp.motifAbstention}`);
    } else {
      poser('inpp', 'INPP · contribution patronale', 'INPP', 'EMPLOYEUR', inpp.tauxPourCent, inpp.source, RESERVE_ASSIETTE_EMPRUNTEE);
    }
  }

  const onem = tauxOnem(parametres.moisDePaie);
  if (onem.tauxPourCent === null) {
    abstentions.push(`ONEM · aucun barème lu pour le mois ${parametres.moisDePaie}.`);
  } else {
    poser('onem', 'ONEM · contribution patronale', 'ONEM', 'EMPLOYEUR', onem.tauxPourCent, onem.source, RESERVE_ASSIETTE_EMPRUNTEE);
  }

  const totalEmployeurFc = lignes
    .filter((l) => l.charge === 'EMPLOYEUR')
    .reduce((n, l) => n + l.montantFc, 0);
  const totalTravailleurFc = lignes
    .filter((l) => l.charge === 'TRAVAILLEUR')
    .reduce((n, l) => n + l.montantFc, 0);

  return {
    lignes,
    totalEmployeurFc,
    totalTravailleurFc,
    coutEmployeurSupplementaireFc: totalEmployeurFc,
    abstentions,
  };
}

export type VerdictNet = {
  /** Tout ce que l'employeur verse, exclusions de l'article 7 comprises. */
  readonly totalVerseFc: number;
  readonly quotePartOuvriereFc: number;
  readonly irppFc: number | null;
  readonly netAPayerFc: number | null;
  readonly reserves: readonly string[];
};

/**
 * LE NET À PAYER PART DU TOTAL VERSÉ, JAMAIS DE L'ASSIETTE.
 *
 * C'est le piège central de ce fichier. Les cinq exclusions de l'article 7 ne
 * sont pas des sommes qu'on ne paie pas · ce sont des sommes qui ne sont pas
 * de la rémunération. Le travailleur reçoit bien son indemnité de logement et
 * son indemnité de transport. Partir de l'assiette sociale amputerait le net
 * de tout ce qu'elles représentent, sur un bulletin dont chaque cotisation
 * serait pourtant exacte.
 *
 * ET AUCUNE AUTRE RETENUE N'EST POSÉE. L'article 112 du Code du travail
 * énumère les retenues autorisées : avances, indemnités compensatoires de
 * l'article 52, cautionnement, prêt, saisie-arrêt. Toutes supposent un acte du
 * dossier (une avance consentie, une décision de justice), aucune ne se
 * calcule. Elles se saisissent, et le net rendu ici est AVANT elles.
 */
export function netAPayer(
  totalVerseFc: number,
  quotePartOuvriereFc: number,
  irppFc: number | null,
): VerdictNet {
  const reserves = [
    "LE NET PART DU TOTAL VERSÉ · les cinq exclusions de l'article 7, point 8 du Code du travail sortent de l'ASSIETTE des cotisations, pas de ce que l'employeur paie. Le logement et le transport sont bien versés au travailleur.",
    "NET AVANT LES RETENUES DE L'ARTICLE 112 · avances, indemnités compensatoires de l'article 52, cautionnement, prêt et saisie-arrêt supposent chacune un acte du dossier et ne se calculent pas. Elles se saisissent.",
    "LA QUOTITÉ SAISISSABLE DE L'ARTICLE 114 N'EST PAS CALCULÉE · elle se mesure « sur la partie n'excédant pas cinq fois le salaire mensuel minimum interprofessionnel de SA CATÉGORIE », qui vient de la convention collective du dossier, absente du corpus ; et elle se prend après déduction de « l'évaluation forfaitaire du logement, tel que défini à l'article 139 », dont l'arrêté n'existe pas.",
  ];
  const netAPayerFc =
    irppFc === null ? null : Math.max(0, totalVerseFc - quotePartOuvriereFc - irppFc);
  return {
    totalVerseFc,
    quotePartOuvriereFc,
    irppFc,
    netAPayerFc,
    reserves,
  };
}
