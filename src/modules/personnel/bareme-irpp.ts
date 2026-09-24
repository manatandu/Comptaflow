/**
 * LE BARÈME DE L'IMPÔT SUR LE REVENU DES PERSONNES PHYSIQUES, ET CE QU'IL
 * FAUT LUI AJOUTER POUR QU'IL SERVE UN BULLETIN.
 *
 * SOURCE · loi n° 23/053 du 30 novembre 2023 portant réforme de la fiscalité
 * directe, Titre 3, section 3 « Du calcul de l'impôt », articles 118 à 125.
 * Entrée en vigueur au 1er janvier 2026 · avant cette date le régime est celui
 * de l'IPR, qui n'est pas au corpus, et ce fichier REFUSE de s'y appliquer.
 *
 * L'arrêté ministériel du 19 février 2025 (numéro illisible au scan, pris sur
 * l'art. 126) confirme que l'employeur calcule CHAQUE MOIS l'IRPP « conformément
 * au barème d'imposition à taux progressifs de l'article 118 », et fixe le
 * reversement au plus tard le 15 du mois qui suit.
 *
 * CE FICHIER NE CALCULE AUCUNE ASSIETTE · elle est dans `assiettes-paie.ts`,
 * parce que les articles 68 à 71 sont un autre sujet que l'article 118, et que
 * les confondre est précisément le piège que le journal de P0 avait nommé.
 *
 * ────────────────────────────────────────────────────────────────────────
 * LA TENSION QUE LE JOURNAL DE P0 SIGNALAIT EST DANS LE TEXTE, ET ELLE SE LIT.
 *
 * L'article 118 pose un taux marginal de 40 % ET un plafond : « En aucun cas,
 * l'impôt total ne peut excéder 30 % du revenu imposable. » Les deux ne se
 * contredisent pas, le second borne le premier · et il MORD, à partir d'un
 * revenu net global annuel de 77 932 800 FC (voir `SEUIL_OU_LE_PLAFOND_MORD`).
 * Coder le barème sans le plafond rend un impôt faux sur les hauts revenus,
 * sur un bulletin d'apparence juste · c'est exactement la forme du § 10 bis.
 * ────────────────────────────────────────────────────────────────────────
 *
 * TROIS CHOSES QUE CE FICHIER NE FAIT PAS, ET QUI NE SONT PAS DES OUBLIS.
 *
 * 1 · LE MINIMUM DE PERCEPTION DE L'ARTICLE 122 (1 % du chiffre d'affaires)
 *     NE S'APPLIQUE PAS À UN SALAIRE. L'article le réserve au revenu global qui
 *     « comprend des revenus relevant des catégories suivantes : 1. les
 *     bénéfices des activités industrielles, commerciales, immobilières et
 *     artisanales ; 2. les bénéfices des professions non commerciales […] ;
 *     3. les bénéfices de l'exploitation agricole ». Les revenus salariaux de
 *     l'art. 68 n'y sont pas. L'appliquer à un bulletin inventerait un impôt.
 *
 * 2 · LE PLANCHER DE 2 000 FC N'EXISTE PAS ICI. Le livre de cours dépouillé en
 *     P0 écrit que « l'IPR ne peut être inférieur à 2.000 FC ». Aucun article
 *     de la loi n° 23/053 ne le porte, et une note de cours n'est pas une
 *     source. Un test gèle son absence.
 *
 * 3 · LA RETENUE LIBÉRATOIRE DE L'ARTICLE 121, ALINÉA 2 (personnel domestique
 *     et salariés relevant des Micro-entreprises) N'EST PAS SERVIE. Elle suit
 *     des taux FORFAITAIRES fixés par l'arrêté n° 019/2025, qui n'est pas lu
 *     ici, et elle est LIBÉRATOIRE · ce n'est pas le barème, c'est un autre
 *     régime. `regimeApplicable` le nomme plutôt que de l'ignorer.
 */

/** Article 118 · l'année à laquelle la loi n° 23/053 commence à mordre. */
export const PREMIER_EXERCICE_IRPP = 2026;

export const LOI_IRPP = {
  reference: 'Loi n° 23/053 du 30 novembre 2023',
  articleBareme: 'article 118',
  entreeEnVigueur: '2026-01-01',
  regimeAnterieur:
    "Impôt professionnel sur les rémunérations (IPR), abrogé au 1er janvier 2026 et absent du corpus lu · OmegaX ne calcule rien avant cette date.",
} as const;

/**
 * Une tranche du barème de l'article 118. Les bornes sont celles du texte, en
 * francs congolais et POUR L'ANNÉE · l'article assied l'impôt sur « le revenu
 * net global », qui est annuel (art. 116).
 *
 * `jusqua` vaut `null` pour la dernière tranche, « au-delà de 43.200.000,00 FC ».
 */
export type TrancheIrpp = {
  readonly jusqua: number | null;
  readonly tauxPourCent: number;
};

/**
 * Article 118, alinéa 1er, recopié tel qu'il est tabulé dans la loi.
 *
 * La loi écrit les bornes hautes en « .001 » (« 1.944.001,00 FC à
 * 21.600.000,00 FC ») · ce sont les mêmes bornes, décrites par leur premier
 * franc plutôt que par leur dernier. On retient la borne HAUTE de chaque
 * tranche, qui est ce que le calcul consomme, et le test vérifie que la borne
 * basse de la suivante est bien la borne haute de la précédente plus un franc.
 */
export const TRANCHES_IRPP: readonly TrancheIrpp[] = [
  { jusqua: 1_944_000, tauxPourCent: 3 },
  { jusqua: 21_600_000, tauxPourCent: 15 },
  { jusqua: 43_200_000, tauxPourCent: 30 },
  { jusqua: null, tauxPourCent: 40 },
] as const;

/** Article 118, alinéa 2 · « l'impôt total ne peut excéder 30 % du revenu imposable ». */
export const PLAFOND_IMPOT_POUR_CENT = 30;

/**
 * Article 123 · « une quotité de 2 % pour chacun des membres de la famille à
 * charge […] avec un maximum de 9 personnes ».
 */
export const QUOTITE_PAR_PERSONNE_A_CHARGE_POUR_CENT = 2;
export const MAXIMUM_PERSONNES_A_CHARGE = 9;

/**
 * Article 118 · « sur le revenu net global ARRONDI AU MILLIER DE FRANCS
 * CONGOLAIS INFÉRIEUR ». L'arrondi porte sur l'ASSIETTE, jamais sur l'impôt ·
 * arrondir l'impôt serait un second arrondi que le texte n'écrit pas.
 */
export const PAS_D_ARRONDI_ASSIETTE_FC = 1_000;

export const arrondirAuMillierInferieur = (montantFc: number): number =>
  Math.floor(montantFc / PAS_D_ARRONDI_ASSIETTE_FC) * PAS_D_ARRONDI_ASSIETTE_FC;

/**
 * LE SEUIL OÙ LE PLAFOND DE 30 % MORD, calculé une fois ici pour être
 * vérifiable et pour que personne ne le reprenne de mémoire.
 *
 * À 43 200 000 FC, le barème rend 9 486 720 FC (58 320 + 2 948 400 + 6 480 000)
 * et le plafond vaut 12 960 000 FC · il ne mord pas. Au-delà, l'impôt croît de
 * 40 centimes par franc et le plafond de 30 · ils se croisent lorsque
 * 9 486 720 + 0,40 × (R - 43 200 000) = 0,30 × R, soit R = 77 932 800 FC.
 *
 * Ce n'est PAS une constante du texte · c'est une conséquence arithmétique de
 * deux de ses alinéas, et le test la recalcule depuis `TRANCHES_IRPP` au lieu
 * de la croire.
 */
export const SEUIL_OU_LE_PLAFOND_MORD = 77_932_800;

/** Borne haute de la troisième tranche · article 123, alinéa 2. */
export const BORNE_TROISIEME_TRANCHE = 43_200_000;

export type DetailTranche = {
  readonly tauxPourCent: number;
  readonly baseFc: number;
  readonly impotFc: number;
};

/**
 * Le barème seul, sans plafond ni quotité · article 118, alinéa 1er.
 * L'assiette est supposée DÉJÀ arrondie : arrondir ici ferait arrondir deux
 * fois lorsque l'appelant a mensualisé.
 */
export function impotDuBareme(assietteArrondieFc: number): {
  impotFc: number;
  parTranche: readonly DetailTranche[];
} {
  if (assietteArrondieFc <= 0) return { impotFc: 0, parTranche: [] };

  const parTranche: DetailTranche[] = [];
  let borneBasse = 0;
  let impotFc = 0;

  for (const tranche of TRANCHES_IRPP) {
    const borneHaute = tranche.jusqua ?? Number.POSITIVE_INFINITY;
    const baseFc = Math.max(0, Math.min(assietteArrondieFc, borneHaute) - borneBasse);
    if (baseFc > 0) {
      const impotTranche = (baseFc * tranche.tauxPourCent) / 100;
      impotFc += impotTranche;
      parTranche.push({ tauxPourCent: tranche.tauxPourCent, baseFc, impotFc: impotTranche });
    }
    borneBasse = borneHaute;
    if (assietteArrondieFc <= borneHaute) break;
  }

  return { impotFc, parTranche };
}

export type VerdictIrpp = {
  /** Le revenu net global tel que l'article 118 le veut · arrondi au millier inférieur. */
  readonly assietteArrondieFc: number;
  /** Ce que rend le barème de l'alinéa 1er, avant plafond et avant quotité. */
  readonly impotDuBaremeFc: number;
  readonly parTranche: readonly DetailTranche[];
  /** 30 % du revenu imposable · alinéa 2. */
  readonly plafondFc: number;
  /** Vrai quand l'alinéa 2 a effectivement abaissé l'impôt. */
  readonly plafondApplique: boolean;
  /** L'impôt de l'article 118 tout entier, alinéa 2 compris. */
  readonly impotArticle118Fc: number;
  readonly personnesACharge: number;
  readonly personnesAChargeRetenues: number;
  /** La part de l'impôt sur laquelle la quotité de l'art. 123 peut jouer. */
  readonly baseDeLaQuotiteFc: number;
  readonly quotitePourCent: number;
  readonly reductionFc: number;
  /** Ce qui est dû. */
  readonly impotDuFc: number;
  readonly reserves: readonly string[];
};

/**
 * L'IMPÔT ANNUEL, ARTICLES 118 ET 123, DANS L'ORDRE OÙ LES DEUX ARTICLES SE
 * LISENT.
 *
 * L'ORDRE N'EST PAS INDIFFÉRENT, et c'est le point délicat de ce fichier.
 * L'article 123 réduit « l'impôt établi par application de l'article 118
 * ci-dessus » · il prend donc en entrée l'article 118 TOUT ENTIER, son alinéa 2
 * compris. Le plafond s'applique d'abord, la quotité ensuite. L'ordre inverse
 * (réduire puis plafonner) rendrait un impôt PLUS ÉLEVÉ dès que le plafond
 * mord, puisque le plafond effacerait la réduction · au détriment du seul
 * contribuable qui a des personnes à charge ET un haut revenu.
 *
 * LA LIMITE DE L'ALINÉA 2 DE L'ARTICLE 123 · « Aucune réduction n'est accordée
 * sur l'impôt qui se rapporte à la partie du revenu imposable qui excède la
 * troisième tranche. » Tant que le plafond ne mord pas, « l'impôt qui se
 * rapporte » aux 43 200 000 premiers francs se lit directement au barème.
 * QUAND LE PLAFOND MORD, le texte ne dit pas comment répartir l'impôt plafonné
 * entre les deux parts. OmegaX ne fabrique aucune clé de répartition : il
 * retient le PLUS PETIT des deux montants que le texte nomme · l'impôt du
 * barème sur la part basse, et l'impôt total réellement dû. Cette lecture est
 * une convention de l'éditeur, elle est portée en réserve sur le verdict, et
 * elle ne peut jamais rendre une base supérieure à l'un des deux.
 */
export function impotAnnuel(
  revenuNetGlobalFc: number,
  personnesACharge = 0,
): VerdictIrpp {
  const reserves: string[] = [];
  const assietteArrondieFc = arrondirAuMillierInferieur(Math.max(0, revenuNetGlobalFc));

  const { impotFc: impotDuBaremeFc, parTranche } = impotDuBareme(assietteArrondieFc);

  // Alinéa 2 · le plafond porte sur « le revenu imposable », donc sur
  // l'assiette telle que l'article 118 la retient.
  const plafondFc = (assietteArrondieFc * PLAFOND_IMPOT_POUR_CENT) / 100;
  const plafondApplique = impotDuBaremeFc > plafondFc;
  const impotArticle118Fc = plafondApplique ? plafondFc : impotDuBaremeFc;
  if (plafondApplique) {
    reserves.push(
      `PLAFOND DE L'ARTICLE 118, ALINÉA 2 · le barème rendait ${impotDuBaremeFc.toFixed(2)} FC, ` +
        `l'impôt total ne pouvant excéder 30 % du revenu imposable, il est ramené à ${plafondFc.toFixed(2)} FC.`,
    );
  }

  // Article 123 · la quotité, bornée à neuf personnes.
  const personnesAChargeRetenues = Math.min(
    Math.max(0, Math.trunc(personnesACharge)),
    MAXIMUM_PERSONNES_A_CHARGE,
  );
  if (personnesACharge > MAXIMUM_PERSONNES_A_CHARGE) {
    reserves.push(
      `ARTICLE 123 · ${personnesACharge} personnes déclarées à charge, la quotité est plafonnée ` +
        `à ${MAXIMUM_PERSONNES_A_CHARGE}.`,
    );
  }
  const quotitePourCent =
    personnesAChargeRetenues * QUOTITE_PAR_PERSONNE_A_CHARGE_POUR_CENT;

  // Alinéa 2 de l'article 123 · l'impôt du barème sur la part qui n'excède pas
  // la troisième tranche.
  const impotSurLaPartBasseFc = impotDuBareme(
    Math.min(assietteArrondieFc, BORNE_TROISIEME_TRANCHE),
  ).impotFc;
  const baseDeLaQuotiteFc = Math.min(impotSurLaPartBasseFc, impotArticle118Fc);
  if (assietteArrondieFc > BORNE_TROISIEME_TRANCHE) {
    reserves.push(
      "ARTICLE 123, ALINÉA 2 · aucune réduction n'est accordée sur l'impôt qui se rapporte à la " +
        `partie du revenu imposable qui excède la troisième tranche (${BORNE_TROISIEME_TRANCHE.toLocaleString('fr-FR')} FC). ` +
        `La quotité ne joue que sur ${baseDeLaQuotiteFc.toFixed(2)} FC.`,
    );
  }
  if (plafondApplique && quotitePourCent > 0) {
    reserves.push(
      "LECTURE DE L'ÉDITEUR · le plafond de l'article 118 ayant joué, le texte ne dit pas comment " +
        "répartir l'impôt plafonné entre la part basse et la part haute du revenu. OmegaX retient le " +
        "plus petit des deux montants que le texte nomme, sans fabriquer de clé de répartition.",
    );
  }

  const reductionFc = (baseDeLaQuotiteFc * quotitePourCent) / 100;
  const impotDuFc = impotArticle118Fc - reductionFc;

  return {
    assietteArrondieFc,
    impotDuBaremeFc,
    parTranche,
    plafondFc,
    plafondApplique,
    impotArticle118Fc,
    personnesACharge,
    personnesAChargeRetenues,
    baseDeLaQuotiteFc,
    quotitePourCent,
    reductionFc,
    impotDuFc,
    reserves,
  };
}

/** Le nombre de mois que la mensualisation annualise. */
export const MOIS_PAR_AN = 12;

/**
 * UNE TRANCHE DU BARÈME AU MOIS · les bornes de l'article 118 divisées par
 * douze. Elles ne sont PAS écrites à la main : elles se déduisent de
 * `TRANCHES_IRPP`, si bien qu'une révision du barème annuel les emporte.
 */
export type TrancheMensuelle = {
  readonly tauxPourCent: number;
  /** Premier franc de la tranche, au mois. */
  readonly deFc: number;
  /** Dernier franc de la tranche, au mois · `null` pour la dernière. */
  readonly aFc: number | null;
};

export const TRANCHES_IRPP_MENSUELLES: readonly TrancheMensuelle[] = TRANCHES_IRPP.map((t, i) => ({
  tauxPourCent: t.tauxPourCent,
  deFc: i === 0 ? 0 : (TRANCHES_IRPP[i - 1].jusqua as number) / MOIS_PAR_AN,
  aFc: t.jusqua === null ? null : t.jusqua / MOIS_PAR_AN,
}));

/**
 * LE MÊME CALCUL, LU AU MOIS. Un salaire se paie au mois et un bulletin se lit
 * au mois : chaque grandeur de l'article 118 est ici divisée par douze. Ce
 * n'est PAS un second calcul · c'est le verdict annuel présenté autrement, et
 * la somme des impôts par tranche, plafond et quotité compris, rend la retenue
 * au centime. Deux calculs auraient divergé au premier arrondi.
 */
export type DetailMensuel = {
  /** Le revenu du mois que l'arrondi annuel retient · assiette arrondie ÷ 12. */
  readonly revenuRetenuFc: number;
  readonly parTranche: readonly (TrancheMensuelle & { baseFc: number; impotFc: number })[];
  readonly impotDuBaremeFc: number;
  readonly plafondFc: number;
  readonly plafondApplique: boolean;
  readonly impotArticle118Fc: number;
  readonly quotitePourCent: number;
  readonly reductionFc: number;
  readonly retenueFc: number;
};

export function detailMensuel(annuel: VerdictIrpp): DetailMensuel {
  const m = (x: number) => x / MOIS_PAR_AN;
  return {
    revenuRetenuFc: m(annuel.assietteArrondieFc),
    parTranche: annuel.parTranche.map((t) => {
      const tranche = TRANCHES_IRPP_MENSUELLES.find((x) => x.tauxPourCent === t.tauxPourCent)!;
      return { ...tranche, baseFc: m(t.baseFc), impotFc: m(t.impotFc) };
    }),
    impotDuBaremeFc: m(annuel.impotDuBaremeFc),
    plafondFc: m(annuel.plafondFc),
    plafondApplique: annuel.plafondApplique,
    impotArticle118Fc: m(annuel.impotArticle118Fc),
    quotitePourCent: annuel.quotitePourCent,
    reductionFc: m(annuel.reductionFc),
    retenueFc: m(annuel.impotDuFc),
  };
}

export type VerdictRetenueMensuelle = {
  readonly moisDePaie: string;
  readonly revenuImposableDuMoisFc: number;
  /** Le mois porté à l'année, avant arrondi · c'est sur lui que l'art. 118 joue. */
  readonly revenuAnnualiseFc: number;
  readonly annuel: VerdictIrpp;
  /** Le même verdict, lu au mois · c'est lui que l'écran et le bulletin montrent. */
  readonly mensuel: DetailMensuel;
  /** L'impôt annuel ramené au mois. */
  readonly retenueFc: number;
  readonly reserves: readonly string[];
};

/**
 * LA RETENUE MENSUELLE DE L'ARTICLE 119, ET LA CONVENTION QU'IL FAUT DÉCLARER
 * POUR LA CALCULER.
 *
 * L'article 119 impose la retenue MENSUELLE et renvoie au barème de l'article
 * 118, qui est ANNUEL · « L'Impôt sur le Revenu des Personnes Physiques […]
 * calculé par application du barème d'imposition visé à l'article 118,
 * alinéa 1er, ci-dessus, est retenu MENSUELLEMENT par l'employeur ». Aucun
 * article ne dit comment passer de l'un à l'autre.
 *
 * APPLIQUER LES TRANCHES ANNUELLES À UN MONTANT MENSUEL SERAIT ABSURDE · un
 * salaire de 1 500 000 FC par mois, soit 18 000 000 par an, serait imposé à
 * 3 % au lieu de 15 %. LA MENSUALISATION EST DONC NÉCESSAIRE, et elle n'est
 * pas écrite : c'est une CONVENTION DE L'ÉDITEUR, portée en réserve sur chaque
 * verdict plutôt que tue.
 *
 * ON CALCULE SUR L'ANNÉE, ON PRÉSENTE AU MOIS · les deux sont
 * arithmétiquement équivalents. Le calcul applique le barème de l'article 118
 * tel qu'il est écrit, à un revenu annuel ; `detailMensuel` le relit ensuite
 * avec les tranches divisées par douze (162 000, 1 800 000, 3 600 000 FC), qui
 * sont celles que la pratique emploie et que le cours de comptabilité générale
 * de Mbuyamba donne pour l'IPR · un cours n'est pas une source, mais son
 * arithmétique se vérifie ici. Et l'ARRONDI AU MILLIER se
 * prend alors sur le revenu ANNUALISÉ, qui est le « revenu net global » que
 * l'article 118 nomme · arrondir le mois puis multiplier arrondirait une
 * grandeur que l'article ne connaît pas.
 *
 * CE QUI SORT D'ICI EST UN ACOMPTE, JAMAIS L'IMPÔT DÉFINITIF. L'article 116
 * assied l'IRPP sur le revenu net global ANNUEL du contribuable, tous revenus
 * confondus, et l'article 121 impute ensuite les retenues opérées en cours
 * d'exercice sur cet impôt-là · une retenue supérieure à l'impôt exigible est
 * « prise en compte par l'Administration des Impôts pour le règlement
 * d'obligations fiscales antérieures ou futures ». Un salarié qui a d'autres
 * revenus, ou dont le salaire varie d'un mois à l'autre, ne doit PAS la somme
 * des douze retenues. Le dire est le seul moyen qu'un cabinet ne présente pas
 * cette ligne comme un solde.
 */
export function retenueMensuelle(
  moisDePaie: string,
  revenuImposableDuMoisFc: number,
  personnesACharge = 0,
): VerdictRetenueMensuelle {
  const revenuAnnualiseFc = Math.max(0, revenuImposableDuMoisFc) * MOIS_PAR_AN;
  const annuel = impotAnnuel(revenuAnnualiseFc, personnesACharge);

  const reserves = [
    "MENSUALISATION · l'article 119 impose une retenue mensuelle et renvoie au barème annuel de " +
      "l'article 118, sans dire comment passer de l'un à l'autre. OmegaX porte le revenu du mois à " +
      "l'année, applique l'article 118, puis ramène au mois : c'est le barème annuel divisé par douze " +
      "(162 000, 1 800 000 et 3 600 000 FC par mois). L'arrondi au millier se prend sur l'année, " +
      "comme l'article 118 l'écrit. La convention est de l'éditeur.",
    "ACOMPTE · l'article 116 assied l'IRPP sur le revenu net global annuel et l'article 121 y impute " +
      "les retenues de l'exercice. Cette ligne est une retenue à la source, jamais l'impôt définitif du salarié.",
    ...annuel.reserves,
  ];

  return {
    moisDePaie,
    revenuImposableDuMoisFc,
    revenuAnnualiseFc,
    annuel,
    mensuel: detailMensuel(annuel),
    retenueFc: annuel.impotDuFc / MOIS_PAR_AN,
    reserves,
  };
}

/**
 * LES TROIS RÉGIMES QUE LE TITRE 3 OUVRE SUR UN SALAIRE, ET CELUI QUE CE
 * FICHIER SERT.
 *
 * Nommer les deux autres est le seul moyen qu'un cabinet ne prenne pas le
 * barème pour la règle unique · une lacune déclarée à tort dispense d'une
 * démarche due.
 */
export type RegimeSalarial =
  | 'BAREME_ARTICLE_118'
  | 'FORFAIT_PERSONNEL_DOMESTIQUE'
  | 'FORFAIT_SALARIE_DE_MICRO_ENTREPRISE';

export const REGIMES_SALARIAUX: Readonly<Record<RegimeSalarial, string>> = {
  BAREME_ARTICLE_118:
    "Régime de droit commun · barème progressif de l'article 118, retenu mensuellement par l'employeur (art. 119) et imputable sur l'impôt annuel (art. 121, alinéa 1er). C'est le seul régime que ce fichier calcule.",
  FORFAIT_PERSONNEL_DOMESTIQUE:
    "Taux forfaitaires fixés par arrêté du Ministre des Finances (art. 70, alinéa 2), l'arrêté n° 019/2025 du 19 février 2025. La retenue est LIBÉRATOIRE pour autant que ces rémunérations constituent un revenu unique (art. 121, alinéa 2). L'arrêté n'est pas lu ici · OmegaX ne chiffre rien.",
  FORFAIT_SALARIE_DE_MICRO_ENTREPRISE:
    "Même arrêté n° 019/2025, même caractère libératoire (art. 121, alinéa 2). À ne pas confondre avec le forfait de la micro-entreprise ELLE-MÊME (art. 128, arrêté n° 015/2025) · deux redevables, deux bases, deux arrêtés. OmegaX ne chiffre rien.",
} as const;

/**
 * Le régime n'est JAMAIS déduit d'un montant ni d'une forme juridique · il se
 * déclare. Présumer le droit commun ferait retenir le barème sur un personnel
 * domestique, dont la retenue est libératoire à un tout autre taux.
 */
export function regimeApplicable(regime: RegimeSalarial): {
  calculable: boolean;
  motif: string;
} {
  return {
    calculable: regime === 'BAREME_ARTICLE_118',
    motif: REGIMES_SALARIAUX[regime],
  };
}

/**
 * Le barème ne s'applique pas avant son entrée en vigueur · deuxième piège du
 * dépôt, et le module fiscal l'a déjà payé deux fois. Un exercice 2025 relève
 * de l'IPR, qui n'est pas au corpus.
 */
export function baremeApplicableAuMois(moisDePaie: string): {
  applicable: boolean;
  motif: string | null;
} {
  const annee = Number.parseInt(moisDePaie.slice(0, 4), 10);
  if (!Number.isFinite(annee)) {
    return { applicable: false, motif: 'Mois de paie illisible.' };
  }
  if (annee < PREMIER_EXERCICE_IRPP) {
    return {
      applicable: false,
      motif:
        `Le barème de l'article 118 de la loi n° 23/053 n'entre en vigueur que le 1er janvier ${PREMIER_EXERCICE_IRPP}. ` +
        LOI_IRPP.regimeAnterieur,
    };
  }
  return { applicable: true, motif: null };
}
