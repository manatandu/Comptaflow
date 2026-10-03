/**
 * LES FRAIS DE DÉVELOPPEMENT NE S'INSCRIVENT QUE SUR SIX CRITÈRES DÉMONTRÉS
 * (lot 15) · moteur pur, aucune lecture de base.
 *
 * AUDCIF, Titre VIII ch. 1 § 2.1.1 · les dépenses de développement « sont à
 * comptabiliser en immobilisations incorporelles si l'entité peut démontrer
 * les six critères suivants SIMULTANÉMENT », et « À défaut, ces dépenses
 * constituent des charges ». La fiche du compte 211 (Titre VII) dit de même ·
 * « si et seulement si l'entité démontre qu'elle satisfait aux six critères ».
 * Le module ne peut rien démontrer à la place du cabinet · il exige que chacun
 * soit DÉCLARÉ avec sa justification écrite, et nomme le premier qui manque.
 *
 * PAS DE RÉTROACTIVITÉ · § 3.1, les frais « sont immobilisés à partir de la
 * date à laquelle les six conditions pour leur activation sont remplies », et
 * « les dépenses comptabilisées en charges antérieurement à la date
 * d'activation ne peuvent plus être activées ». La date se déclare, et
 * l'inscription ne la précède jamais. Le MONTANT, lui, n'est pas vérifiable
 * ici (il vient de l'analytique ou d'un calcul statistique, § 2.1.2) · il
 * reste celui du cabinet, et c'est dit dans l'aide.
 *
 * SYSCOHADA SEUL · le SYCEBNL n'ouvre aucun 211 (Partie 2 ch. 3, compte 21 ·
 * 212, 213, 214, 218, 219), et son semis non plus. Le refus ne vise donc que
 * le 211 d'un dossier SYSCOHADA, au semis `21100000` « Frais de
 * développement ». Le 2181 (frais de prospection minière, ch. 3) a son propre
 * régime et n'est pas concerné.
 *
 * LE BIEN REPRIS N'Y EST PAS SOUMIS · décision proposée (voir le journal du
 * plan) · un frais de développement déjà au bilan d'ouverture a été inscrit
 * dans un exercice antérieur, sous la responsabilité de ce dernier ; exiger
 * ici sa démonstration bloquerait la reprise d'un dossier sans rien vérifier.
 * Les critères déclarés pour lui sont gardés s'ils sont donnés.
 */

export const CRITERES_FRAIS_DEVELOPPEMENT = [
  {
    cle: 'FAISABILITE_TECHNIQUE',
    rang: 1,
    libelle:
      "la faisabilité technique nécessaire à l'achèvement de l'immobilisation incorporelle en vue de sa mise en service ou de sa vente",
  },
  {
    cle: 'INTENTION',
    rang: 2,
    libelle: "son intention d'achever l'immobilisation incorporelle et de l'utiliser ou de la vendre",
  },
  { cle: 'CAPACITE', rang: 3, libelle: "sa capacité à utiliser ou à vendre l'immobilisation incorporelle" },
  {
    cle: 'AVANTAGES_ECONOMIQUES',
    rang: 4,
    libelle: "la façon dont l'immobilisation incorporelle générera des avantages économiques futurs probables",
  },
  {
    cle: 'RESSOURCES',
    rang: 5,
    libelle:
      "la disponibilité de ressources techniques, financières et autres, appropriées pour achever le développement et utiliser ou vendre l'immobilisation incorporelle",
  },
  {
    cle: 'EVALUATION_FIABLE',
    rang: 6,
    libelle:
      "sa capacité à évaluer de manière fiable les dépenses attribuables à l'immobilisation incorporelle au cours de son développement",
  },
] as const;

export type CleCritereDeveloppement = (typeof CRITERES_FRAIS_DEVELOPPEMENT)[number]['cle'];

/** Ce que le cabinet déclare · une justification écrite par critère. */
export type CriteresDeclares = Partial<Record<CleCritereDeveloppement, string | null | undefined>>;

const SOURCE = 'AUDCIF, Titre VIII ch. 1 § 2.1.1 et fiche du compte 211';

/** Le 211 d'un dossier SYSCOHADA, et lui seul, est soumis aux six critères. */
export function estFraisDeveloppement(referentiel: 'SYSCOHADA' | 'SYCEBNL', numeroCompte: string): boolean {
  return referentiel === 'SYSCOHADA' && numeroCompte.startsWith('211');
}

export interface InscriptionFraisDeveloppement {
  referentiel: 'SYSCOHADA' | 'SYCEBNL';
  numeroCompte: string;
  repris: boolean;
  criteres: CriteresDeclares | null | undefined;
  /** Date à partir de laquelle les six critères sont réunis (§ 3.1). */
  dateReunion: Date | null;
  dateInscription: Date;
}

/**
 * Le refus nommé, ou null. Un critère sans justification écrite n'est pas
 * démontré · le refus cite le premier qui manque, par son rang et ses mots.
 */
export function motifRefusFraisDeveloppement(i: InscriptionFraisDeveloppement): string | null {
  const concerne = estFraisDeveloppement(i.referentiel, i.numeroCompte);
  const declares = i.criteres ?? {};
  const donnes = Object.values(declares).some((v) => typeof v === 'string' && v.trim());
  if (!concerne) {
    // Une déclaration hors du 211 ne serait lue par personne · elle se refuse
    // plutôt que de laisser croire qu'un autre bien a été examiné.
    if (donnes || i.dateReunion) {
      return i.referentiel === 'SYCEBNL'
        ? "Les six critères des frais de développement ne visent que le compte 211 du SYSCOHADA · le plan SYCEBNL n'ouvre aucun 211."
        : 'Les six critères des frais de développement ne visent que le compte 211.';
    }
    return null;
  }
  if (i.repris && !donnes && !i.dateReunion) return null;
  for (const c of CRITERES_FRAIS_DEVELOPPEMENT) {
    const j = declares[c.cle];
    if (typeof j !== 'string' || !j.trim()) {
      return (
        `Critère ${c.rang} non démontré · ${c.libelle}. Les six critères sont exigés simultanément ; « à défaut, ces ` +
        `dépenses constituent des charges » (${SOURCE}). Justifiez chacun par écrit, ou laissez la dépense en charges.`
      );
    }
  }
  if (!i.dateReunion) {
    return (
      "Indiquez la date à partir de laquelle les six critères sont réunis · les frais ne s'immobilisent qu'à compter " +
      "de cette date (AUDCIF, Titre VIII ch. 1 § 3.1)."
    );
  }
  if (!i.repris && i.dateInscription < i.dateReunion) {
    return (
      `Inscription datée avant la réunion des six critères (${i.dateReunion.toISOString().slice(0, 10)}) · « les ` +
      'dépenses comptabilisées en charges antérieurement à la date d\'activation ne peuvent plus être activées » ' +
      '(AUDCIF, Titre VIII ch. 1 § 3.1).'
    );
  }
  return null;
}

/** Les justifications retenues, nettoyées, dans l'ordre du texte · gardées sur la fiche. */
export function criteresRetenus(criteres: CriteresDeclares | null | undefined): Record<CleCritereDeveloppement, string> | null {
  if (!criteres) return null;
  const sortie: Partial<Record<CleCritereDeveloppement, string>> = {};
  for (const c of CRITERES_FRAIS_DEVELOPPEMENT) {
    const j = criteres[c.cle];
    if (typeof j === 'string' && j.trim()) sortie[c.cle] = j.trim().slice(0, 1000);
  }
  return Object.keys(sortie).length ? (sortie as Record<CleCritereDeveloppement, string>) : null;
}
