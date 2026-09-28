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

import { moisEntre } from '../../common/mois-entre';
import { ENTREE_EN_VIGUEUR_LOI_23_053 } from '../../common/entree-en-vigueur-loi-23-053';
import { natureDuBareme } from './bareme-fiscal';

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

/**
 * LE DÉGRESSIF DE LA LOI N° 23/053 NE COURT QU'À COMPTER DU 1er JANVIER 2026
 * (passe F12, constat B1). Les art. 31 à 35 entrent en vigueur avec la loi
 * (art. 153) et le barème de l'arrêté n° 013/2025, dont le taux linéaire est
 * la base de l'annuité (art. 33, 1°), le même jour (arrêté, art. 6). Un bien
 * mis en service en 2025 recevait pourtant une annuité 2025 calculée sous ces
 * textes, et `passer` forçait un 851/151 sur un exercice qu'ils ne régissaient
 * pas · écriture équilibrée, balance bouclée, dérogatoire faux.
 *
 * Le régime antérieur (O.-L. n° 69/009, art. 43 ter D et suivants, abrogés
 * par l'art. 152, 2° de la loi) avait ses propres coefficients, et OmegaX ne
 * le calcule pas. Il ne PROLONGE pas non plus un tel plan sous la loi
 * nouvelle, ni ne le RECOMMENCE au 1er janvier 2026 · aucun texte lu ne dit
 * ce que devient un plan commencé sous l'ancien régime, et un plan repris
 * « comme si » serait une règle inventée. Ce qui SOLDE l'historique (la
 * reprise du dérogatoire déjà passé au 151) reste ouvert.
 *
 * La borne porte sur la MISE EN SERVICE, point de départ de l'annuité
 * (art. 33, 1° et 34), et non sur l'ouverture de l'exercice · un premier
 * exercice long ouvert en 2025 porte une période imposable 2026 (art. 12),
 * et un bien mis en service en 2026 n'y reçoit d'annuité que sur celle-ci.
 */
export function motifRegimeAnterieurDegressif(dateMiseEnService: Date | null | undefined): string | null {
  if (!dateMiseEnService || dateMiseEnService.getTime() >= ENTREE_EN_VIGUEUR_LOI_23_053.getTime()) return null;
  return (
    'Bien mis en service avant le 1er janvier 2026 · le dégressif de la loi n° 23/053 (art. 31 à 35) et le barème de ' +
    "l'arrêté n° 013/2025 ne s'appliquent qu'à compter de cette date (loi, art. 153 ; arrêté, art. 6). Le régime antérieur " +
    "(O.-L. n° 69/009, art. 43 ter D et suivants) n'est pas calculé par OmegaX, qui ne prolonge ni ne recommence le plan " +
    'sous la loi nouvelle. La reprise du solde du dérogatoire déjà passé reste ouverte.'
  );
}

/**
 * LA DURÉE FISCALE DÉCLARÉE CONFRONTÉE À LA NATURE DU BARÈME (passe F12,
 * constat B5). Le coefficient se lit sur la « durée normale d'utilisation »
 * (loi n° 23/053, art. 33, 1°), et c'est l'arrêté n° 013/2025 qui la fixe par
 * nature (art. 2). La durée se déclare à l'option, et rien ne la rapprochait
 * de la nature que le bien porte déjà (`Immobilisation.natureFiscaleCle`).
 *
 * DEUX SIGNALEMENTS, JAMAIS UN REFUS · l'arrêté admet d'autres taux quand
 * « les conditions particulières d'exploitation le justifient », justifiés
 * « lors du contrôle, sous peine de rejet » (art. 4) ; l'écart est donc
 * permis, et c'est la charge de la preuve qu'il faut dire.
 *  · la nature du barème est HORS des quatre à vingt ans de l'art. 32, 1°
 *    alors que la durée déclarée y entre · c'est la durée déclarée, et elle
 *    seule, qui fait entrer le bien au dégressif ;
 *  · la durée déclarée est plus COURTE que celle du barème · le taux, donc
 *    l'annuité, dépasse celui de l'arrêté.
 * Une durée plus longue que le barème n'est pas signalée · elle ne fait que
 * différer la déduction.
 */
export function avertissementsDureeFiscale(o: {
  natureFiscaleCle: string | null | undefined;
  dureeFiscaleAns: number | null | undefined;
}): string[] {
  const nature = o.natureFiscaleCle ? natureDuBareme(o.natureFiscaleCle) : undefined;
  if (!nature || o.dureeFiscaleAns == null) return [];
  const libelle = `« ${nature.designation} » (${nature.cle})`;
  const dansLesBornes = (a: number) => a >= 4 && a <= 20;
  if (!dansLesBornes(nature.dureeAns) && dansLesBornes(o.dureeFiscaleAns)) {
    return [
      `Le barème fixe ${nature.dureeAns} ans pour ${libelle} (arrêté n° 013/2025, art. 2), hors des quatre à vingt ans ` +
        `de la loi n° 23/053, art. 32, 1° · la durée déclarée de ${o.dureeFiscaleAns} ans fait seule entrer le bien au ` +
        "dégressif, et l'écart se justifie lors du contrôle, sous peine de rejet (arrêté, art. 4).",
    ];
  }
  if (o.dureeFiscaleAns < nature.dureeAns) {
    return [
      `Durée fiscale déclarée (${o.dureeFiscaleAns} ans) plus courte que celle du barème pour ${libelle} ` +
        `(${nature.dureeAns} ans, arrêté n° 013/2025, art. 2) · ce taux dérogatoire se justifie lors du contrôle, ` +
        'sous peine de rejet (arrêté, art. 4).',
    ];
  }
  return [];
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
  /** Nulle tant que le bien n'est pas mis en service · la borne se revérifie alors au dérogatoire. */
  dateMiseEnService: Date | null;
}): string | null {
  if (o.referentiel !== 'SYSCOHADA') {
    return "Le dégressif est une option de l'impôt sur les sociétés (loi n° 23/053, art. 31) · un dossier SYCEBNL n'y est pas soumis.";
  }
  if (o.personnePhysique) {
    return '« Les sociétés peuvent opter » (art. 31) · une entreprise individuelle ou un entreprenant n’est pas une société.';
  }
  const anterieur = motifRegimeAnterieurDegressif(o.dateMiseEnService);
  if (anterieur) return anterieur;
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

/**
 * LES PÉRIODES IMPOSABLES D'UN EXERCICE · l'année civile (loi n° 23/053,
 * art. 12). Un premier exercice long, créé après le 30 juin et clos le
 * 31 décembre de l'année suivante, en porte DEUX · « l'impôt est néanmoins
 * établi sur les bénéfices réalisés au cours de la période allant du jour de
 * la création de l'entreprise au 31 décembre de la même année ». L'art. 33
 * compte ses annuités « pour chacune des périodes imposables » : un exercice
 * de dix-huit mois reçoit donc deux annuités fiscales, et non une seule
 * bornée à douze mois (audit final F34).
 */
function periodesImposables(e: { dateDebut: Date; dateFin: Date }): Array<{ dateDebut: Date; dateFin: Date }> {
  const periodes: Array<{ dateDebut: Date; dateFin: Date }> = [];
  let debut = e.dateDebut;
  while (debut <= e.dateFin) {
    const finAnnee = new Date(Date.UTC(debut.getUTCFullYear(), 11, 31));
    periodes.push({ dateDebut: debut, dateFin: finAnnee < e.dateFin ? finAnnee : e.dateFin });
    debut = new Date(Date.UTC(debut.getUTCFullYear() + 1, 0, 1));
  }
  return periodes;
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
  /** Nulle tant que le bien n'est pas mis en service · aucun plan ne court alors (art. 34). */
  dateMiseEnService: Date | null;
  exercices: readonly { id: string; dateDebut: Date; dateFin: Date }[];
}): LignePlanFiscal[] {
  const coef = coefficientDegressif(p.dureeFiscaleAns);
  // La première annuité part du mois de mise en service (art. 34) · sans cette
  // date il n'y a pas de point de départ, et en inventer un doterait un bien
  // qui ne sert pas encore.
  if (coef === null || !(p.base > 0) || !p.dateMiseEnService) return [];
  const taux = (1 / p.dureeFiscaleAns) * coef;
  const mes = new Date(Date.UTC(p.dateMiseEnService.getUTCFullYear(), p.dateMiseEnService.getUTCMonth(), 1));
  const lignes: LignePlanFiscal[] = [];
  let vr = p.base;
  let premiere = true;
  for (const e of [...p.exercices].sort((a, b) => a.dateDebut.getTime() - b.dateDebut.getTime())) {
    if (e.dateFin < mes) continue;
    if (vr <= 0.005) break;
    const vrDebut = vr;
    let annuiteExercice = 0;
    let mode: LignePlanFiscal['mode'] = 'DEGRESSIF';
    for (const periode of periodesImposables(e)) {
      if (periode.dateFin < mes || vr <= 0.005) continue;
      let annuite: number;
      if (premiere) {
        // Art. 34 · première annuité au prorata, à compter du premier jour du mois de mise en service.
        const mois = Math.max(0, moisEntre(mes > periode.dateDebut ? mes : periode.dateDebut, periode.dateFin));
        annuite = vr * taux * (mois / 12);
        premiere = false;
      } else {
        // Art. 35 · années restantes « à compter de l'ouverture dudit exercice ».
        const ecoules = Math.max(0, moisEntre(mes, periode.dateDebut) - 1) / 12;
        const restantes = p.dureeFiscaleAns - ecoules;
        const degressive = vr * taux;
        const lineaire = restantes <= 1 ? vr : vr / restantes;
        if (degressive < lineaire) {
          annuite = lineaire;
          mode = 'LINEAIRE_ART_35';
        } else {
          annuite = degressive;
          mode = 'DEGRESSIF';
        }
      }
      annuite = arrondi(Math.min(annuite, vr));
      annuiteExercice = arrondi(annuiteExercice + annuite);
      vr = arrondi(vr - annuite);
    }
    lignes.push({ exerciceId: e.id, valeurResiduelleDebut: arrondi(vrDebut), annuite: annuiteExercice, mode });
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
