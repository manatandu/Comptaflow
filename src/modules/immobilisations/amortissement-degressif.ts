/**
 * AMORTISSEMENT DÉGRESSIF FISCAL ET AMORTISSEMENT DÉROGATOIRE · SYSCOHADA
 * (priorité 3 de la comparaison avec les autres produits Sage).
 *
 * DEUX TEXTES, ET ILS NE DISENT PAS LA MÊME CHOSE.
 *
 * LE FISC OUVRE LE DÉGRESSIF · loi n° 23/053, art. 31 à 35. « Les sociétés
 * peuvent opter pour un système d'amortissement dégressif qui est applicable
 * aux biens NEUFS [...] affectés de manière durable à son exploitation »,
 * dix catégories limitativement énumérées (art. 31) ; exclus les biens de
 * moins de quatre ou de plus de vingt ans et tous les incorporels (art. 32) ;
 * annuité = taux linéaire × coefficient appliqué au coût, puis à la valeur
 * résiduelle (art. 33) ; première annuité prorata temporis au premier jour du
 * mois de mise en service (art. 34) ; bascule en linéaire quand l'annuité
 * dégressive devient inférieure au quotient de la valeur résiduelle par les
 * années restantes (art. 35). Et l'art. 28, 3° exige que l'amortissement soit
 * « effectivement pratiqué en comptabilité ».
 *
 * LA COMPTABILITÉ GARDE SON PLAN · AUDCIF Titre VII, fiche du compte 68 :
 * « Lorsque les dispositions fiscales en vigueur autorisent des méthodes
 * d'amortissements accélérés (amortissement dégressif, etc.) et imposent la
 * comptabilisation effective des amortissements fiscaux pratiqués, il importe
 * de faire apparaître distinctement l'amortissement technique et économique
 * normal (linéaire) au compte 68. Le complément d'amortissement fiscal
 * autorisé figure au débit du compte 85 (Dotations H.A.O.), par le crédit du
 * compte 151 (Amortissements dérogatoires). » La reprise passe au 861 (Titre
 * VIII ch. 18 § 4.5.1.3 ; fiche du compte 15, « réduites ou annulées
 * exclusivement par Reprises H.A.O. »). Numéros relus au semis SYSCOHADA :
 * 15100000, 85100000, 86100000.
 *
 * LE DÉGRESSIF N'EST DONC PAS UN MODE COMPTABLE DE PLUS · le bien garde son
 * mode (linéaire ou unités d'œuvre), et le dérogatoire est la DIFFÉRENCE entre
 * l'annuité fiscale et la dotation comptable de l'exercice.
 *
 * TROIS LECTURES D'OMEGAX, DÉCLARÉES.
 *  · LE COEFFICIENT DE QUATRE ANS · l'art. 33, a) imprime « de trois (3) à
 *    quatre (4) ans » quand l'art. 32 exclut tout ce qui est inférieur à
 *    quatre ans et que le chapeau de l'art. 33 dit « de quatre ans ». Quatre
 *    ans reçoit 1,5, trois ans rien (lecture du socle fiscal, parametres-2026).
 *  · LA DURÉE ENTRE QUATRE ET CINQ ANS, qu'aucune tranche ne couvre, ne se
 *    présente pas · les durées du module sont en années entières.
 *  · LE TAUX LINÉAIRE EST CELUI DE L'ARRÊTÉ n° 013/2025 (art. 28), qui peut
 *    différer de la durée comptable · la durée fiscale se DÉCLARE, jamais
 *    déduite de la durée d'utilité.
 *
 * ET UN CAS QUI N'EST PAS DU DÉROGATOIRE · quand la dotation comptable dépasse
 * l'annuité fiscale au-delà de ce que le 151 porte, l'excédent n'est pas une
 * reprise (le 151 deviendrait débiteur) mais une charge que l'art. 28 ne
 * laisse pas déduire. Il est montré à réintégrer, jamais posté.
 */

/** Les dix catégories de l'art. 31, dans l'ordre et les mots du texte. */
export const CATEGORIES_ARTICLE_31 = [
  { cle: 'MATERIEL_INDUSTRIEL', libelle: "Matériels et outillages utilisés pour des opérations industrielles de fabrication, de transformation, d'extraction ou de transport, à l'exclusion des véhicules de tourisme" },
  { cle: 'MANUTENTION_LEVAGE', libelle: 'Matériels de manutention ou de levage, à l’exclusion des chariots métalliques mis à la disposition des clients des magasins' },
  { cle: 'INSTALLATIONS_ENERGIE', libelle: 'Installations productrices de vapeur, chaleur, énergie et froid industriel' },
  { cle: 'INSTALLATIONS_SECURITE', libelle: 'Installations de sécurité' },
  { cle: 'MEDICO_SOCIAL', libelle: 'Installations à caractère médico-social, à l’exclusion des installations purement sociales, d’ordre sportif ou uniquement consacrées à l’organisation des loisirs' },
  { cle: 'MACHINES_DE_BUREAU', libelle: 'Machines de bureau, à l’exclusion de tout autre matériel et du mobilier de bureau' },
  { cle: 'RECHERCHE', libelle: 'Matériel et outillage utilisés à des opérations de recherche scientifique ou technique' },
  { cle: 'MAGASINAGE_STOCKAGE', libelle: 'Installations de magasinage et de stockage, à l’exclusion des locaux servant à l’exercice de la profession' },
  { cle: 'HOTELLERIE', libelle: 'Immeubles et matériels des entreprises hôtelières, à l’exclusion des biens d’équipement des entreprises exerçant uniquement l’activité de restaurateur ou de cafetier' },
  { cle: 'AGRICULTURE_ELEVAGE', libelle: 'Machines agricoles et installations d’élevage, à l’exception des bâtiments et des terrains' },
] as const;

export type CategorieDegressif = (typeof CATEGORIES_ARTICLE_31)[number]['cle'];

/** Art. 32, 1° et art. 33, 1° · null quand la durée exclut le dégressif. */
export function coefficientDegressif(dureeFiscaleAns: number): number | null {
  if (!Number.isInteger(dureeFiscaleAns) || dureeFiscaleAns < 4 || dureeFiscaleAns > 20) return null;
  if (dureeFiscaleAns === 4) return 1.5;
  if (dureeFiscaleAns <= 6) return 2;
  return 2.5;
}

export function motifRefusOptionDegressif(o: {
  referentiel: string;
  personnePhysique: boolean;
  numeroCompteImmobilisation: string;
  categorie: string | null | undefined;
  bienNeuf: boolean | undefined;
  dureeFiscaleAns: number | null | undefined;
  amortissementAnterieur: number;
  dotationsPassees: number;
}): string | null {
  if (o.referentiel !== 'SYSCOHADA') {
    return "Le dégressif est une option de l'impôt sur les sociétés (loi n° 23/053, art. 31) · un dossier SYCEBNL n'y est pas soumis.";
  }
  if (o.personnePhysique) {
    return '« Les sociétés peuvent opter » (art. 31) · une entreprise individuelle ou un entreprenant n’est pas une société.';
  }
  if (o.numeroCompteImmobilisation.startsWith('21')) {
    return 'Les immobilisations incorporelles sont exclues du dégressif (art. 32, 2°).';
  }
  if (!CATEGORIES_ARTICLE_31.some((c) => c.cle === o.categorie)) {
    return "La catégorie de l'art. 31 est obligatoire · la liste est limitative, et c'est la qualification du cabinet, qu'aucun numéro de compte ne donne.";
  }
  if (o.bienNeuf !== true) return "Le dégressif ne s'applique qu'aux biens NEUFS (art. 31) · le cabinet doit l'attester.";
  if (o.dureeFiscaleAns == null || coefficientDegressif(o.dureeFiscaleAns) === null) {
    return 'La durée normale d’utilisation fiscale (arrêté n° 013/2025) doit être de quatre à vingt ans, en années entières (art. 32, 1°).';
  }
  if (o.amortissementAnterieur > 0) {
    return "Un bien repris avec un amortissement antérieur n'a pas de plan fiscal connu depuis sa mise en service · l'option ne se reconstitue pas.";
  }
  if (o.dotationsPassees > 0) {
    return "L'option se prend avant la première dotation · le plan fiscal part de la mise en service (art. 33 et 34), et les annuités d'exercices déjà dotés ne se rattrapent pas.";
  }
  return null;
}

const arrondi = (n: number) => Math.round(n * 100) / 100;

/** Mois pleins entre le premier jour du mois de `debut` et `fin`, bornes comprises. */
function moisDe(debut: Date, fin: Date): number {
  return (fin.getUTCFullYear() - debut.getUTCFullYear()) * 12 + (fin.getUTCMonth() - debut.getUTCMonth()) + 1;
}

export type LignePlanFiscal = {
  exerciceId: string;
  valeurResiduelleDebut: number;
  annuite: number;
  mode: 'DEGRESSIF' | 'LINEAIRE_ART_35';
};

/**
 * LE PLAN FISCAL, exercice par exercice, depuis celui qui contient la mise en
 * service. Les exercices sont ceux du dossier, triés, et le calcul s'arrête à
 * la valeur résiduelle nulle.
 */
export function planFiscalDegressif(p: {
  base: number;
  dureeFiscaleAns: number;
  dateMiseEnService: Date;
  exercices: readonly { id: string; dateDebut: Date; dateFin: Date }[];
}): LignePlanFiscal[] {
  const coef = coefficientDegressif(p.dureeFiscaleAns);
  if (coef === null || !(p.base > 0)) return [];
  const taux = (1 / p.dureeFiscaleAns) * coef;
  const mes = new Date(Date.UTC(p.dateMiseEnService.getUTCFullYear(), p.dateMiseEnService.getUTCMonth(), 1));
  const lignes: LignePlanFiscal[] = [];
  let vr = p.base;
  for (const e of [...p.exercices].sort((a, b) => a.dateDebut.getTime() - b.dateDebut.getTime())) {
    if (e.dateFin < mes) continue;
    if (vr <= 0.005) break;
    let annuite: number;
    let mode: LignePlanFiscal['mode'] = 'DEGRESSIF';
    if (lignes.length === 0) {
      // Art. 34 · première annuité au prorata, à compter du premier jour du mois de mise en service.
      const mois = Math.min(12, Math.max(0, moisDe(mes > e.dateDebut ? mes : e.dateDebut, e.dateFin)));
      annuite = vr * taux * (mois / 12);
    } else {
      // Art. 35 · années restantes « à compter de l'ouverture dudit exercice ».
      const ecoules = Math.max(0, moisDe(mes, e.dateDebut) - 1) / 12;
      const restantes = p.dureeFiscaleAns - ecoules;
      const degressive = vr * taux;
      const lineaire = restantes <= 1 ? vr : vr / restantes;
      if (degressive < lineaire) {
        annuite = lineaire;
        mode = 'LINEAIRE_ART_35';
      } else {
        annuite = degressive;
      }
    }
    annuite = arrondi(Math.min(annuite, vr));
    lignes.push({ exerciceId: e.id, valeurResiduelleDebut: arrondi(vr), annuite, mode });
    vr = arrondi(vr - annuite);
  }
  return lignes;
}

/**
 * LE DÉROGATOIRE DE L'EXERCICE · annuité fiscale moins dotation comptable.
 * Positif, dotation 851/151 ; négatif, reprise 151/861 dans la limite du
 * cumul ; au-delà, un excédent comptable à réintégrer (art. 28).
 */
export function derogatoireDeLExercice(annuiteFiscale: number, dotationComptable: number, cumulAnterieur: number) {
  const ecart = arrondi(annuiteFiscale - dotationComptable);
  if (ecart >= 0) return { dotation: ecart, reprise: 0, excedentAReintegrer: 0 };
  const reprise = arrondi(Math.min(-ecart, Math.max(0, cumulAnterieur)));
  return { dotation: 0, reprise, excedentAReintegrer: arrondi(-ecart - reprise) };
}

export const COMPTES_DEROGATOIRE = { amortissementsDerogatoires: '15100000', dotationsHao: '85100000', reprisesHao: '86100000' } as const;
