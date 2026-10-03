import { FondementValeurAleatoire, NatureAcquisitionAleatoire, Referentiel } from '@prisma/client';

/**
 * L'ACQUISITION À PRIX ALÉATOIRE · LOT 15 (première part) du plan des
 * immobilisations. Deux opérations que l'AUDCIF règle de la même façon : le
 * bien entre à une valeur ESTIMÉE à la signature, une dette la porte, et
 * l'écart entre ce qui a été estimé et ce qui a été réellement versé se
 * constate en hors activités ordinaires quand l'aléa se dénoue.
 *
 * LA RENTE VIAGÈRE · AUDCIF Titre VIII ch. 11, section 2.
 *   § 2.2 · « le montant qui résulte d'une stipulation de prix ou, à défaut,
 *   d'une estimation » ; « à défaut, il conviendrait de rechercher la valeur
 *   actuelle du bien ».
 *   § 2.3.1 · « au débit du compte d'immobilisation concerné par le crédit
 *   des comptes 1681 Rentes viagères capitalisées et compte de trésorerie
 *   (pour le versement éventuel d'un bouquet) ».
 *   § 2.3.2 · chaque versement débite le 1681 par la trésorerie, « la
 *   totalité du versement contribue à l'extinction de la dette » · écriture
 *   de trésorerie ordinaire, que le module ne passe pas.
 *   § 2.3.3 · au décès du crédirentier, « solder le compte de dette en
 *   débitant le compte 1681 Rentes viagères capitalisées par le crédit du
 *   compte 841 Produits HAO constatés ».
 *   § 2.4 · versements au-delà du terme · « charge HAO […] compte 831 »,
 *   écriture de trésorerie ordinaire elle aussi.
 *   Guide d'application SYSCOHADA, Partie 2 ch. 11, Application 43 · bouquet
 *   110 000 000, 1681 240 000 000 ; décès après cinq versements de
 *   20 000 000, 140 000 000 au 841. Le guide ajoute « financement lié aux
 *   activités ordinaires : utiliser 6781 / 7781 au lieu de 831 / 841 » ·
 *   l'AUDCIF n'écrit que le 841, et c'est lui qui est suivi (décision
 *   proposée D-48, rapport du lot 15a).
 *
 * LES REDEVANCES SUR CHIFFRE D'AFFAIRES · AUDCIF Titre VIII ch. 2, section 11
 * (« Immobilisations incorporelles acquises au moyen de redevances »).
 *   « le montant définitif à retenir […] doit correspondre à la valeur
 *   actuelle du bien au moment de la signature de l'acte », estimée « soit
 *   par la valeur actualisée des redevances probables […] soit par la valeur
 *   retenue par les parties pour le paiement des droits d'enregistrement » ;
 *   « au débit du compte d'immobilisation incorporelle approprié, par le
 *   crédit du compte 4811 Fournisseurs d'immobilisations incorporelles » ;
 *   « en cas d'excédent ou d'insuffisance du montant effectif des redevances
 *   par rapport au montant estimé, la différence est portée en 831 Charges
 *   HAO constatées ou 841 Produits HAO constatés ».
 *   Guide, Partie 2 ch. 2, Application 26 · 4811 crédité de 62 170, versements
 *   32 500, 22 500 et 20 000 · « 831 (20 000 − 7 170) 12 830 ».
 *   Redevances non évaluables de façon fiable · « comptabilisées en charges
 *   (compte 634) » · ce n'est plus une acquisition à prix aléatoire, et ce
 *   chemin ne la prend pas.
 *
 * LE SYCEBNL N'Y EST PAS OUVERT, ET C'EST UN REFUS NOMMÉ, PAS UN OUBLI.
 *   · Rente viagère · sa fiche de la classe 2 (Partie 2 ch. 3) en écrit
 *     l'ÉVALUATION (« pour le montant stipulé dans le contrat ou à défaut à
 *     la valeur actuelle à la date du contrat ») et renvoie au SYSCOHADA,
 *     mais son plan n'ouvre AUCUN 1681 · un numéro, deux sens, son 168 est
 *     « Autres fonds affectés », un fonds et non une dette. Aucun compte de
 *     dette n'est choisi à la place du texte (décision proposée D-46).
 *   · Redevances · aucun texte du SYCEBNL ne règle l'incorporel acquis au
 *     moyen de redevances ni le sort de leur écart (décision proposée D-47).
 */

export type NatureAleatoire = NatureAcquisitionAleatoire;

/** Les comptes de chaque nature · SYSCOHADA, plan semé relu par le spec. */
export const COMPTES_PRIX_ALEATOIRE: Readonly<
  Record<NatureAleatoire, { dette: string; produitHao: string; chargeHao: string; source: string }>
> = {
  RENTE_VIAGERE: { dette: '1681', produitHao: '841', chargeHao: '831', source: 'AUDCIF, Titre VIII ch. 11 § 2' },
  REDEVANCES: { dette: '4811', produitHao: '841', chargeHao: '831', source: 'AUDCIF, Titre VIII ch. 2 § 11' },
};

/** Les fondements que le texte admet pour chaque nature. */
export const FONDEMENTS_ADMIS: Readonly<Record<NatureAleatoire, readonly FondementValeurAleatoire[]>> = {
  RENTE_VIAGERE: [FondementValeurAleatoire.PRIX_STIPULE, FondementValeurAleatoire.ESTIMATION_VALEUR_ACTUELLE],
  REDEVANCES: [FondementValeurAleatoire.REDEVANCES_ACTUALISEES, FondementValeurAleatoire.VALEUR_DROITS_ENREGISTREMENT],
};

export const LIBELLE_FONDEMENT_ALEATOIRE: Readonly<Record<FondementValeurAleatoire, string>> = {
  PRIX_STIPULE: 'prix stipulé au contrat',
  ESTIMATION_VALEUR_ACTUELLE: 'estimation de la valeur actuelle du bien',
  REDEVANCES_ACTUALISEES: 'valeur actualisée des redevances probables',
  VALEUR_DROITS_ENREGISTREMENT: "valeur retenue pour les droits d'enregistrement",
};

const TRESORERIE = ['52', '53', '55', '57'];

const arrondi = (x: number) => Math.round(x * 100) / 100;

/**
 * Le motif qui interdit l'acquisition, ou `null`. Tout se vérifie AVANT la
 * fiche et son écriture.
 */
export function motifRefusAcquisitionAleatoire(e: {
  referentiel: Referentiel;
  nature: NatureAleatoire;
  numeroCompteBien: string;
  numeroCompteDette: string;
  /** Bouquet (rente) ou versement immédiat (redevances), zéro s'il n'y en a pas. */
  comptant: number;
  numeroCompteComptant: string | null;
  valeur: number;
  fondement: FondementValeurAleatoire;
  source: string | null | undefined;
}): string | null {
  if (e.referentiel === Referentiel.SYCEBNL) {
    return e.nature === 'RENTE_VIAGERE'
      ? "Le plan SYCEBNL n'ouvre aucun compte 1681 Rentes viagères capitalisées · son 168 est « Autres fonds " +
          "affectés », un fonds et non une dette. La fiche de la classe 2 (Partie 2 ch. 3) n'écrit que l'évaluation du " +
          'bien (« pour le montant stipulé dans le contrat ou à défaut à la valeur actuelle à la date du contrat ») et ' +
          'renvoie au SYSCOHADA, sans nommer de compte de dette · aucun compte n’est choisi à la place du texte.'
      : "Le SYCEBNL n'écrit ni l'acquisition d'un incorporel au moyen de redevances ni le sort de leur écart · la " +
          'règle (AUDCIF Titre VIII ch. 2 § 11) n’est pas transposée à un dossier SYCEBNL.';
  }
  const comptes = COMPTES_PRIX_ALEATOIRE[e.nature];
  if (e.nature === 'REDEVANCES' && !e.numeroCompteBien.startsWith('21')) {
    return (
      'Les redevances visent un actif immatériel (brevet, marque, fonds de commerce) · le bien se porte à un compte ' +
      `d'immobilisation incorporelle (21), « par le crédit du compte 4811 » (${comptes.source}).`
    );
  }
  if (!e.numeroCompteDette.startsWith(comptes.dette)) {
    return e.nature === 'RENTE_VIAGERE'
      ? "La dette d'une rente viagère se porte au 1681 Rentes viagères capitalisées (AUDCIF, Titre VIII ch. 11 § 2.3.1)."
      : `La dette des redevances se porte au 4811 Fournisseurs d'immobilisations incorporelles (${comptes.source}).`;
  }
  if (!FONDEMENTS_ADMIS[e.nature].includes(e.fondement)) {
    return e.nature === 'RENTE_VIAGERE'
      ? "La valeur d'un bien acquis en viager est « le montant qui résulte d'une stipulation de prix ou, à défaut, " +
          "d'une estimation » (AUDCIF Titre VIII ch. 11 § 2.2)."
      : 'La valeur actuelle du bien s’estime « soit par la valeur actualisée des redevances probables […] soit par la ' +
          "valeur retenue par les parties pour le paiement des droits d'enregistrement » (AUDCIF Titre VIII ch. 2 § 11)."
  }
  if (!e.source?.trim()) {
    return "Indiquez d'où vient la valeur retenue (contrat, acte, calcul d'actualisation) · elle est estimée, et le " +
      'réviseur la demandera.';
  }
  if (!(e.valeur > 0)) return 'La valeur du bien doit être positive.';
  if (e.comptant < 0) return 'Le montant payé comptant ne peut pas être négatif.';
  if (arrondi(e.valeur - e.comptant) <= 0) {
    return e.nature === 'RENTE_VIAGERE'
      ? 'Le bouquet couvre toute la valeur · il ne reste aucune rente à capitaliser au 1681, et le bien s’acquiert comptant.'
      : 'Le versement immédiat couvre toute la valeur · il ne reste aucune redevance à porter au 4811.';
  }
  if (e.comptant > 0) {
    if (!e.numeroCompteComptant || !TRESORERIE.some((r) => e.numeroCompteComptant!.startsWith(r))) {
      return e.nature === 'RENTE_VIAGERE'
        ? 'Le bouquet se paie par un « compte de trésorerie » (AUDCIF Titre VIII ch. 11 § 2.3.1) · 52, 53, 55 ou 57.'
        : 'Le versement immédiat se paie par la trésorerie (Guide d’application, Application 26) · 52, 53, 55 ou 57.';
    }
  }
  return null;
}

/**
 * Les lignes de CRÉDIT de l'écriture d'acquisition · le comptant d'abord, la
 * dette ensuite, dans l'ordre de l'Application 43 (521, puis 1681).
 */
export function lignesCreditAleatoire(e: {
  valeur: number;
  comptant: number;
  compteDetteId: string;
  compteComptantId: string | null;
}): { compteId: string; montant: number }[] {
  const dette = arrondi(e.valeur - e.comptant);
  return [
    ...(e.comptant > 0 && e.compteComptantId ? [{ compteId: e.compteComptantId, montant: arrondi(e.comptant) }] : []),
    { compteId: e.compteDetteId, montant: dette },
  ];
}

export type SoldeDetteAleatoire =
  | {
      /** EXTINCTION (décès), EXCEDENT ou INSUFFISANCE des redevances. */
      cas: 'EXTINCTION' | 'EXCEDENT' | 'INSUFFISANCE';
      montant: number;
      /** Vrai · D dette / C 841. Faux · D 831 / C dette. */
      debiteLaDette: boolean;
      compteContrepartie: string;
    }
  | { motif: string };

/**
 * LE SOLDE DE LA DETTE QUAND L'ALÉA SE DÉNOUE.
 *
 * Rente viagère (§ 2.3.3) · au décès, le reste de la dette capitalisée
 * (dette initiale moins rentes versées) va au 841. Si les versements ont déjà
 * éteint la dette, il n'y a rien à solder · les versements postérieurs au
 * terme sont des charges H.A.O. au 831 (§ 2.4), passées avec leur paiement.
 *
 * Redevances (ch. 2 § 11) · à la fin du contrat, l'écart entre le montant
 * effectif des redevances et le montant estimé · excédent au 831 (la dette a
 * été débitée au-delà de ce qu'elle portait, D 831 / C 4811), insuffisance au
 * 841 (D 4811 / C 841). Équivalent, au solde du 4811 près, à l'écriture
 * combinée de l'Application 26.
 */
export function soldeDetteAleatoire(e: {
  nature: NatureAleatoire;
  detteInitiale: number;
  versementsCumules: number;
}): SoldeDetteAleatoire {
  if (!(e.versementsCumules >= 0)) return { motif: 'Les versements cumulés ne peuvent pas être négatifs.' };
  const comptes = COMPTES_PRIX_ALEATOIRE[e.nature];
  const ecart = arrondi(e.versementsCumules - e.detteInitiale);
  if (e.nature === 'RENTE_VIAGERE') {
    if (ecart >= 0) {
      return {
        motif:
          'Les rentes versées ont déjà éteint la dette capitalisée · il ne reste rien à solder au décès. Les ' +
          'versements faits au-delà du terme sont des charges H.A.O. au 831 (AUDCIF Titre VIII ch. 11 § 2.4), ' +
          'passées avec leur paiement.',
      };
    }
    return { cas: 'EXTINCTION', montant: -ecart, debiteLaDette: true, compteContrepartie: comptes.produitHao };
  }
  if (ecart === 0) {
    return { motif: 'Les redevances effectives égalent le montant estimé · il n’y a aucun écart à constater.' };
  }
  return ecart > 0
    ? { cas: 'EXCEDENT', montant: ecart, debiteLaDette: false, compteContrepartie: comptes.chargeHao }
    : { cas: 'INSUFFISANCE', montant: -ecart, debiteLaDette: true, compteContrepartie: comptes.produitHao };
}

/**
 * UNE EXTINCTION NE DÉPASSE PAS CE QUE LE COMPTE DE DETTE PORTE ENCORE (relecture
 * du lot 15a, défaut MODÉRÉ). Le montant porté au 841 se calcule sur les
 * versements DÉCLARÉS · une déclaration trop basse (une rente oubliée) éteint
 * plus que la dette restante, le 1681 (ou le 4811) passe DÉBITEUR et le 841
 * est gonflé d'autant, sur une écriture équilibrée et une balance bouclée
 * (CLAUDE.md § 10 bis). Le solde du compte ne SUFFIT pas à calculer
 * l'extinction (d'autres dettes peuvent le partager), mais il la BORNE · une
 * dette ne s'éteint pas au-delà de ce qui reste au crédit du compte qui la
 * porte. Null quand l'extinction tient dans le solde.
 *
 * `soldeCrediteur` · crédits moins débits du compte crédité par l'écriture
 * d'acquisition, sur tous les mouvements du dossier jusqu'à la date du solde,
 * à-nouveaux exclus (ils répètent les exercices antérieurs), brouillard
 * compris (les versements peuvent y attendre leur validation).
 */
export function motifRefusExtinctionAuDelaDuSolde(e: {
  montant: number;
  soldeCrediteur: number;
  numeroCompteDette: string;
}): string | null {
  if (Math.round((e.montant - e.soldeCrediteur) * 100) <= 0) return null;
  const solde = arrondi(e.soldeCrediteur);
  const lecture =
    solde > 0
      ? `ne porte plus que ${solde.toFixed(2)} au crédit`
      : solde === 0
        ? 'est soldé'
        : `est déjà débiteur de ${(-solde).toFixed(2)}`;
  return (
    `L'extinction calculée (${arrondi(e.montant).toFixed(2)}) dépasse ce que le compte ${e.numeroCompteDette} porte ` +
    `encore · à cette date, il ${lecture}. Vérifiez le cumul des versements déclarés (un versement oublié ` +
    'gonfle l’extinction) et que chaque versement est passé au journal, puis recommencez.'
  );
}
