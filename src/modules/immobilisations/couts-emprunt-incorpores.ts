/**
 * LES COÛTS D'EMPRUNT INCORPORÉS AU COÛT D'UN ACTIF QUALIFIÉ (lot 13) · règles
 * pures. AUDCIF Titre VIII ch. 7 (inspiré d'IAS 23).
 *
 * L'ACTIF QUALIFIÉ (§ 1.2) · « un actif qui exige une longue période de
 * préparation avant de pouvoir être utilisé ou vendu » · « une période de
 * préparation supérieure ou égale à une année devrait en principe répondre à
 * la définition [...] Mais cette période peut être inférieure à 12 mois si
 * l'entité juge celle-ci significative. Dans ce cas, elle est tenue de
 * justifier son choix par une mention dans les notes annexes. » Ne le sont pas
 * « les prêts et autres créances » ni « les actifs prêts à être utilisés ou
 * vendus au moment de leur acquisition ». Le module ne tient que des
 * immobilisations · les divisions 21 à 24, jamais les avances (25), les titres
 * ni les prêts (26, 27), ni les biens reçus du SYCEBNL (20).
 *
 * LE MONTANT (§ 2.1) · emprunt SPÉCIFIQUE · « les coûts d'emprunt réels
 * encourus au cours de l'exercice, diminués de tout produit obtenu du
 * placement temporaire de ces fonds » ; emprunts GÉNÉRAUX · « en appliquant un
 * taux de capitalisation aux dépenses relatives à l'actif », taux qui est « la
 * moyenne pondérée des coûts d'emprunt applicables aux emprunts de l'entité,
 * au titre de l'exercice, autres que les emprunts contractés spécifiquement ».
 * Exemple du texte · 120 000 000 à 12 % sur neuf mois, moins 800 000 de
 * placements · 10 800 000 – 800 000 = 10 000 000. Le plafond · « le montant
 * des coûts incorporés au cours d'un exercice ne doit toutefois pas excéder le
 * total des coûts d'emprunt supportés au cours de ce même exercice ».
 *
 * LA PÉRIODE (§ 2.2) · elle commence avec la première dépense, les coûts
 * encourus et les travaux en cours, et « doit cesser lorsque les activités
 * indispensables à la préparation de l'actif [...] sont pratiquement toutes
 * terminées » · jamais au-delà de la mise en service, jamais sur un bien déjà
 * doté. Le mois est l'unité (`moisEntre`), comme le texte compte « 9 mois (du
 * 1er avril N au 31 décembre N) ».
 *
 * UN NUMÉRO, DEUX SENS · l'écriture de transfert diffère. AUDCIF, fiche du
 * compte 67 · « transférés au débit du compte d'immobilisation concerné par
 * le crédit du compte 72 (Production immobilisée) » ; SYCEBNL, même fiche ·
 * « par le crédit du compte 787 Transferts de charges financières ». Et le
 * SYCEBNL, fiche du compte 72, ne capitalise que « les frais financiers
 * supportés sur les emprunts EXCLUSIVEMENT AFFECTÉS au financement de la
 * fabrication » · la voie des emprunts généraux y est refusée.
 */

import { moisEntre } from '../../common/mois-entre';

export type Ref = 'SYSCOHADA' | 'SYCEBNL';
export type NatureEmprunt = 'SPECIFIQUE' | 'GENERAL';

const EPSILON = 0.005;
const centimes = (x: number) => Math.round(x * 100) / 100;

/** Le compte crédité par le transfert, lu dans la fiche du compte 67 de chaque texte. */
export function compteCreditIncorporation(referentiel: Ref, numeroBien: string): string {
  if (referentiel === 'SYCEBNL') return '78700000';
  if (numeroBien.startsWith('21')) return '72100000';
  // 722 est un en-tête au plan semé · 7222 pour les actifs biologiques (246).
  return numeroBien.startsWith('246') ? '72220000' : '72210000';
}

export function montantIncorporable(o: { base: number; tauxPourcent: number; mois: number; produitsPlacement: number }): number {
  return centimes((o.base * o.tauxPourcent) / 100 * (o.mois / 12) - o.produitsPlacement);
}

export interface SaisieIncorporation {
  referentiel: Ref;
  numeroBien: string;
  enService: boolean;
  aDesDotations: boolean;
  dateMiseEnService: Date | null;
  nature: NatureEmprunt;
  debutPreparation: Date;
  finPreparation: Date;
  justificationPeriodeCourte: string | null | undefined;
  dateDebut: Date;
  dateFin: Date;
  exercice: { dateDebut: Date; dateFin: Date };
  base: number;
  tauxPourcent: number;
  produitsPlacement: number;
}

export function motifRefusIncorporation(o: SaisieIncorporation): string | null {
  if (!o.enService) return 'Le bien est sorti · aucun coût ne s’incorpore plus à son coût.';
  if (!/^2[1-4]/.test(o.numeroBien)) {
    return 'Seule une immobilisation incorporelle ou corporelle (21 à 24) peut être un actif qualifié · ni les avances, ni les titres, ni les prêts et autres créances (AUDCIF Titre VIII ch. 7 § 1.2).';
  }
  if (o.referentiel === 'SYCEBNL' && o.nature === 'GENERAL') {
    return "Le SYCEBNL ne capitalise que les frais des emprunts « exclusivement affectés au financement de la fabrication » (fiche du compte 72) · la voie des emprunts généraux ne s'y applique pas.";
  }
  if (o.aDesDotations) {
    return "Le bien est déjà amorti · l'incorporation cesse quand l'actif est prêt à être utilisé (AUDCIF Titre VIII ch. 7 § 2.2.3).";
  }
  if (!(o.finPreparation > o.debutPreparation)) return 'La fin de la préparation de l’actif suit son début.';
  if (moisEntre(o.debutPreparation, o.finPreparation) < 12 && !(o.justificationPeriodeCourte && o.justificationPeriodeCourte.trim().length >= 3)) {
    return "Une préparation de moins de douze mois ne fait un actif qualifié que si l'entité la juge significative, et elle doit le justifier aux Notes annexes (AUDCIF Titre VIII ch. 7 § 1.2) · écrivez la justification.";
  }
  if (o.dateFin < o.dateDebut) return 'La fin de la période d’incorporation suit son début.';
  if (o.dateDebut < o.exercice.dateDebut || o.dateFin > o.exercice.dateFin) {
    return "La période d'incorporation se lit dans l'exercice · un exercice suivant porte sa propre incorporation.";
  }
  if (o.dateDebut < o.debutPreparation || o.dateFin > o.finPreparation) {
    return "L'incorporation ne court que pendant la préparation de l'actif · elle commence avec les travaux et cesse quand ils sont pratiquement terminés (AUDCIF Titre VIII ch. 7 § 2.2).";
  }
  if (o.dateMiseEnService && o.dateFin > o.dateMiseEnService) {
    return "L'incorporation cesse à la mise en service · l'actif est alors prêt à être utilisé (AUDCIF Titre VIII ch. 7 § 2.2.3).";
  }
  if (!(o.base > 0)) {
    return o.nature === 'SPECIFIQUE' ? 'Indiquez le capital de l’emprunt spécifique.' : 'Indiquez les dépenses relatives à l’actif, nettes des acomptes et subventions reçus.';
  }
  if (!(o.tauxPourcent > 0) || o.tauxPourcent > 100) {
    return o.nature === 'SPECIFIQUE' ? "Le taux de l'emprunt est compris entre 0 et 100 %." : 'Le taux de capitalisation est compris entre 0 et 100 %.';
  }
  if (o.produitsPlacement < 0) return 'Les produits du placement temporaire ne sont pas négatifs.';
  if (o.nature === 'GENERAL' && o.produitsPlacement > EPSILON) {
    return 'Les produits de placement ne se déduisent que des fonds empruntés spécifiquement (AUDCIF Titre VIII ch. 7 § 2.1).';
  }
  const montant = montantIncorporable({ base: o.base, tauxPourcent: o.tauxPourcent, mois: moisEntre(o.dateDebut, o.dateFin), produitsPlacement: o.produitsPlacement });
  if (!(montant > EPSILON)) return 'Les produits du placement couvrent les coûts de la période · rien ne s’incorpore.';
  return null;
}

/**
 * LE MÊME § 2.2.3, LU DANS L'AUTRE SENS · l'incorporation « doit cesser
 * lorsque les activités indispensables à la préparation de l'actif [...] sont
 * pratiquement toutes terminées », et la mise en service dit justement que
 * l'actif est prêt. `motifRefusIncorporation` refuse une période qui dépasse
 * une mise en service déjà posée ; sans ce jumeau, poser la mise en service
 * APRÈS coup, à une date antérieure à la fin d'une période déjà incorporée,
 * laissait au coût du bien des intérêts courus alors qu'il servait déjà, sur
 * des écritures équilibrées. Une fin de période égale à la date reste admise,
 * comme dans l'autre sens.
 */
export function motifRefusMiseEnServiceAvantIncorporation(dateMiseEnService: Date, finDerniereIncorporation: Date | null): string | null {
  if (!finDerniereIncorporation || !(dateMiseEnService < finDerniereIncorporation)) return null;
  return (
    `Des coûts d'emprunt sont incorporés à ce bien jusqu'au ${finDerniereIncorporation.toISOString().slice(0, 10)} · ` +
    "l'incorporation cesse quand l'actif est prêt à être utilisé (AUDCIF Titre VIII ch. 7 § 2.2.3), la mise en service ne peut donc pas la précéder."
  );
}

/** § 2.1 · jamais plus que les coûts d'emprunt supportés dans l'exercice. */
export function motifRefusPlafond(o: { montant: number; coutsSupportes: number; dejaIncorpores: number }): string | null {
  const reste = centimes(o.coutsSupportes - o.dejaIncorpores);
  if (o.montant > reste + EPSILON) {
    return (
      `Les coûts incorporés de l'exercice (${centimes(o.dejaIncorpores + o.montant).toFixed(2)}) dépasseraient les coûts d'emprunt supportés au cours de l'exercice ` +
      `(${centimes(o.coutsSupportes).toFixed(2)}, intérêts des emprunts et de location-acquisition au journal) · AUDCIF Titre VIII ch. 7 § 2.1. ` +
      'Passez d’abord les intérêts au 671 ou au 672.'
    );
  }
  return null;
}
