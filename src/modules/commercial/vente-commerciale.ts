/**
 * LE DEVIS ET LA COMMANDE · ce que l'AUDCG appelle une OFFRE et son
 * ACCEPTATION, et les quatre endroits où l'intuition commerciale se trompe.
 *
 * Ce fichier ne décide rien. Il transcrit le Livre 8 de l'AUDCG révisé (vente
 * commerciale, art. 234 à 307) et s'arrête là où il s'arrête.
 *
 * POURQUOI CE MODULE N'EST PAS UN SIMPLE FORMULAIRE. Un devis n'est pas un
 * brouillon de facture : c'est un acte juridique dont l'acceptation FORME le
 * contrat (art. 241). Les logiciels de la place le traitent comme un document
 * à imprimer avec un statut libre ; le texte, lui, attache à chaque état des
 * conséquences que personne ne peut choisir.
 */

import { FormeJuridiqueSyscohada } from '@prisma/client';

// ---------------------------------------------------------------------------
// 1 · LE PÉRIMÈTRE, QUI EST LE PREMIER REFUS
// ---------------------------------------------------------------------------

/**
 * CE QUE LE LIVRE 8 NE RÉGIT PAS, et c'est plus vaste qu'on ne croit.
 *
 * Art. 234 · il s'applique « aux contrats de vente de MARCHANDISES entre
 * COMMERÇANTS […] y compris les contrats de fourniture de marchandises
 * destinées à des activités de fabrication ou de production ».
 *
 * Art. 235 · il NE régit PAS « a) les ventes de marchandises achetées pour un
 * usage personnel, familial ou domestique […] ; b) les contrats de fourniture
 * de marchandises dans lesquels LA PART PRÉPONDÉRANTE de l'obligation de la
 * partie qui fournit les marchandises consiste dans une FOURNITURE DE
 * MAIN-D'ŒUVRE OU D'AUTRES SERVICES ».
 *
 * Art. 236 · il ne régit pas davantage les ventes aux enchères, sur saisie ou
 * par autorité de justice, de valeurs mobilières, d'effets de commerce ou de
 * monnaies, les opérations sur créances ou instruments financiers, les ventes
 * de navires, bateaux, aéroglisseurs et aéronefs, ni les ventes d'électricité.
 *
 * LA CONSÉQUENCE EST LOURDE POUR UN CABINET CONGOLAIS · une société de conseil,
 * d'ingénierie, de nettoyage, de gardiennage ou de transport vend des SERVICES.
 * Estampiller « AUDCG art. 241 » sur son devis appliquerait une règle hors de
 * son domaine, avec des délais et des qualifications qui ne la concernent pas.
 * C'est la forme la plus discrète du § 10 bis : le message est plausible,
 * sourcé, et faux.
 */
export type NatureOperation =
  | 'MARCHANDISES'
  | 'SERVICES'
  | 'MIXTE_SERVICES_PREPONDERANTS'
  | 'USAGE_PERSONNEL'
  | 'REGIME_PARTICULIER';

export interface Perimetre {
  regiParLeLivre8: boolean;
  article: string;
  motif: string;
}

export function perimetreVenteCommerciale(nature: NatureOperation): Perimetre {
  switch (nature) {
    case 'MARCHANDISES':
      return {
        regiParLeLivre8: true,
        article: 'AUDCG art. 234',
        motif:
          'Vente de marchandises entre commerçants · le Livre 8 s’applique, avec ses règles de formation du ' +
          'contrat (art. 241 à 249) et ses délais de dénonciation (art. 258 et 259).',
      };
    case 'SERVICES':
      return {
        regiParLeLivre8: false,
        article: 'AUDCG art. 234 et 235 b)',
        motif:
          'Le Livre 8 ne régit que la vente de MARCHANDISES. Une prestation de services relève du droit commun ' +
          'des contrats, auquel l’art. 237 renvoie ; aucune des règles de ce module ne lui est opposable, et le ' +
          'devis reste un document commercial que les parties organisent librement.',
      };
    case 'MIXTE_SERVICES_PREPONDERANTS':
      return {
        regiParLeLivre8: false,
        article: 'AUDCG art. 235 b)',
        motif:
          'Le Livre 8 ne régit pas « les contrats de fourniture de marchandises dans lesquels la part ' +
          'prépondérante de l’obligation […] consiste dans une fourniture de main-d’œuvre ou d’autres ' +
          'services ». La prépondérance s’apprécie au cas par cas : c’est une qualification du cabinet, pas ' +
          'un calcul du logiciel.',
      };
    case 'USAGE_PERSONNEL':
      return {
        regiParLeLivre8: false,
        article: 'AUDCG art. 235 a)',
        motif:
          'Marchandises achetées pour un usage personnel, familial ou domestique. L’exclusion tombe toutefois ' +
          'si le vendeur « n’a pas su et n’a pas été censé savoir » cet usage au moment de la conclusion · ' +
          'c’est une appréciation de fait, laissée au cabinet.',
      };
    case 'REGIME_PARTICULIER':
      return {
        regiParLeLivre8: false,
        article: 'AUDCG art. 236',
        motif:
          'Vente soumise à un régime particulier : enchères, saisie ou autorité de justice, valeurs mobilières, ' +
          'effets de commerce ou monnaies, opérations sur créances ou instruments financiers, navires, bateaux, ' +
          'aéroglisseurs et aéronefs, électricité.',
      };
  }
}

/**
 * UNE ASBL N'EST PAS COMMERÇANTE, et c'est ce qui ferme la fenêtre côté
 * SYCEBNL plutôt qu'un choix de produit. Loi n° 004/2001, art. 1er · une
 * association « ne se livre pas à des opérations industrielles ou
 * commerciales, si ce n'est à titre accessoire ». L'art. 234 exige une vente
 * « entre COMMERÇANTS » : le Livre 8 ne régit donc pas ses opérations.
 *
 * CE QUE CE REFUS NE DIT PAS · qu'une association ne puisse pas proposer un
 * prix. Elle le peut. Ce que le logiciel refuse, c'est de lui appliquer des
 * règles qui ne la régissent pas, et de lui faire croire qu'un devis accepté
 * l'engage au sens de l'art. 241.
 */
export const MOTIF_HORS_SYCEBNL =
  'Le Livre 8 de l’AUDCG régit la vente de marchandises ENTRE COMMERÇANTS (art. 234). Une association sans but ' +
  'lucratif n’est pas commerçante · la loi n° 004/2001, art. 1er, dit qu’elle « ne se livre pas à des opérations ' +
  'industrielles ou commerciales, si ce n’est à titre accessoire ». Lui servir cette fenêtre lui appliquerait des ' +
  'règles de formation du contrat et des délais qui ne la régissent pas.';

// ---------------------------------------------------------------------------
// 2 · CE QUI FAIT D'UN DEVIS UNE OFFRE
// ---------------------------------------------------------------------------

/**
 * Art. 241 · « Une offre est suffisamment précise lorsqu'elle DÉSIGNE LES
 * MARCHANDISES et, expressément ou implicitement, FIXE LA QUANTITÉ ET LE PRIX
 * ou donne les indications permettant de les déterminer. Une proposition de
 * conclure un contrat, adressée à une ou plusieurs PERSONNES DÉTERMINÉES,
 * constitue une offre si elle est suffisamment précise et si elle INDIQUE LA
 * VOLONTÉ DE SON AUTEUR D'ÊTRE LIÉ en cas d'acceptation. Une proposition
 * adressée à des personnes indéterminées est considérée SEULEMENT COMME UNE
 * INVITATION À L'OFFRE. »
 *
 * Trois conditions, et un devis qui n'en réunit pas les trois n'est pas une
 * offre · son « acceptation » ne forme aucun contrat. Le module le dit plutôt
 * que d'afficher un bouton Accepter qui ne produirait rien.
 */
export type ManqueOffre = 'DESTINATAIRE_INDETERMINE' | 'LIGNES_IMPRECISES' | 'VOLONTE_DETRE_LIE_NON_EXPRIMEE';

export interface LigneDevisVerifiable {
  designation: string | null;
  quantite: number | null;
  prixUnitaire: number | null;
}

export interface DevisVerifiable {
  destinataireDetermine: boolean;
  volonteDEtreLie: boolean;
  lignes: readonly LigneDevisVerifiable[];
}

const renseigne = (v: string | null | undefined) => typeof v === 'string' && v.trim().length > 0;
const nombre = (v: number | null | undefined) => typeof v === 'number' && Number.isFinite(v);

export interface QualificationOffre {
  estUneOffre: boolean;
  manques: ManqueOffre[];
  article: string;
  /** Ce que le devis vaut quand il n'est pas une offre. */
  requalification: string | null;
}

export function qualifierOffre(d: DevisVerifiable): QualificationOffre {
  const manques: ManqueOffre[] = [];
  if (!d.destinataireDetermine) manques.push('DESTINATAIRE_INDETERMINE');
  if (d.lignes.length === 0 || !d.lignes.every((l) => renseigne(l.designation) && nombre(l.quantite) && nombre(l.prixUnitaire))) {
    manques.push('LIGNES_IMPRECISES');
  }
  if (!d.volonteDEtreLie) manques.push('VOLONTE_DETRE_LIE_NON_EXPRIMEE');

  return {
    estUneOffre: manques.length === 0,
    manques,
    article: 'AUDCG art. 241',
    requalification: manques.length === 0
      ? null
      : manques.includes('DESTINATAIRE_INDETERMINE')
        ? 'Proposition adressée à des personnes indéterminées · simple INVITATION À L’OFFRE (art. 241, dernier alinéa).'
        : 'Proposition qui n’atteint pas la précision de l’art. 241 · son acceptation ne formerait aucun contrat.',
  };
}

// ---------------------------------------------------------------------------
// 3 · LE DÉLAI, ET LES DEUX DATES QU'IL NE FAUT PAS CONFONDRE
// ---------------------------------------------------------------------------

/**
 * DEUX DATES, DEUX SENS · dixième occurrence de cette forme dans le dossier
 * après le 192, le 4181, le 1061/1062, le 38/37, le 397, l'article 11, le taux
 * de TVA de la grille et les « trois exercices » du mandat.
 *
 * Art. 242 · « L'offre PREND EFFET lorsqu'elle PARVIENT à son destinataire. »
 * Art. 246 · « Le DÉLAI D'ACCEPTATION fixé par l'auteur de l'offre commence à
 * courir au moment où l'offre est EXPRIMÉE. La date indiquée dans l'offre est
 * présumée être celle de son EXPÉDITION, à moins que les circonstances
 * n'indiquent le contraire. »
 *
 * L'offre prend donc effet à la RÉCEPTION, mais son délai court depuis
 * l'ÉMISSION. Compter le délai depuis la réception le rallongerait de tout le
 * temps d'acheminement, et le logiciel tiendrait pour ouverte une offre déjà
 * close. Le calcul part de `dateEmission`, jamais de `dateReception`.
 */
export function dateLimiteAcceptation(dateEmission: Date, delaiJours: number | null): Date | null {
  if (delaiJours === null || !Number.isFinite(delaiJours)) return null;
  const limite = new Date(dateEmission.getTime());
  limite.setUTCDate(limite.getUTCDate() + delaiJours);
  return limite;
}

/**
 * AUCUN DÉLAI PAR DÉFAUT N'EST INVENTÉ. Art. 243 · l'offre « doit être
 * acceptée dans le délai stipulé par l'auteur de l'offre ou, à défaut d'une
 * telle stipulation, DANS UN DÉLAI RAISONNABLE, compte tenu des circonstances,
 * notamment de la rapidité des moyens de communication utilisés ». Le texte ne
 * chiffre rien, et poser trente jours « par convention » ferait rendre caduque
 * une offre que le texte tient encore pour ouverte.
 */
export const DELAI_NON_CHIFFRE =
  'Aucun délai n’a été stipulé. L’art. 243 renvoie alors à un « délai raisonnable, compte tenu des circonstances, ' +
  'notamment de la rapidité des moyens de communication utilisés » · aucune source ne le chiffre, et le logiciel ' +
  'ne le remplace par aucune convention.';

// ---------------------------------------------------------------------------
// 4 · L'ÉTAT DU DEVIS, ET LE SILENCE QUI NE VAUT RIEN
// ---------------------------------------------------------------------------

/**
 * LE REFUS CENTRAL DE CE MODULE. Art. 243, dernière phrase : « LE SILENCE OU
 * L'INACTION NE PEUT À LUI SEUL VALOIR ACCEPTATION. »
 *
 * Un devis dont la date de validité est passée sans réponse n'est donc ni
 * accepté ni refusé · il est CADUC. Le porter en « refusé » attribuerait au
 * client un rejet qu'il n'a jamais exprimé, ce qui fausse à la fois la
 * statistique commerciale et la relance ; le porter en « accepté » inventerait
 * un contrat. Aucun des deux n'est un état neutre.
 *
 * C'est la troisième fois que la forme se présente, et pour la troisième fois
 * elle prend un sens différent · un terme échu n'est pas un dénouement. Le
 * mandat de l'auditeur se PROROGE (SYCEBNL art. 22), l'accord-cadre se
 * RECONDUIT tacitement, et l'offre, elle, devient simplement inacceptable sans
 * que personne n'ait rien décidé.
 */
export type EtatDevis = 'EN_ATTENTE' | 'ACCEPTE' | 'REFUSE' | 'CONTRE_PROPOSITION' | 'REVOQUE' | 'CADUC';

export type NatureReponse = 'ACCEPTATION' | 'REFUS' | 'MODIFICATION_NON_SUBSTANTIELLE' | 'MODIFICATION_SUBSTANTIELLE';

export interface SituationDevis {
  dateEmission: Date;
  delaiJours: number | null;
  /** Date à laquelle la réponse est PARVENUE à l'auteur de l'offre · art. 244. */
  dateReponse: Date | null;
  natureReponse: NatureReponse | null;
  revoqueLe: Date | null;
  reference: Date;
}

export interface EtatCalcule {
  etat: EtatDevis;
  dateLimite: Date | null;
  article: string;
  explication: string;
}

export function etatDevis(s: SituationDevis): EtatCalcule {
  const dateLimite = dateLimiteAcceptation(s.dateEmission, s.delaiJours);

  // UNE RÉPONSE PARVENUE PRIME SUR TOUT · art. 244, l'acceptation prend effet
  // « au moment où l'expression de l'acquiescement PARVIENT à l'auteur de
  // l'offre ». Une révocation postérieure n'y peut plus rien (art. 242).
  if (s.natureReponse && s.dateReponse) {
    switch (s.natureReponse) {
      case 'ACCEPTATION':
        return {
          etat: 'ACCEPTE',
          dateLimite,
          article: 'AUDCG art. 244',
          explication: 'Le contrat est formé : l’acquiescement est parvenu à l’auteur de l’offre.',
        };
      case 'MODIFICATION_NON_SUBSTANTIELLE':
        // Art. 245, second alinéa · c'est une ACCEPTATION, et les termes du
        // contrat sont ceux de l'offre AVEC les modifications de l'acceptation,
        // sauf désaccord exprimé sans retard indu.
        return {
          etat: 'ACCEPTE',
          dateLimite,
          article: 'AUDCG art. 245, second alinéa',
          explication:
            'Réponse porteuse d’éléments complémentaires ou différents n’altérant pas substantiellement les ' +
            'termes de l’offre : elle vaut ACCEPTATION, et les termes du contrat sont ceux de l’offre avec les ' +
            'modifications énoncées dans l’acceptation, à moins que le désaccord n’ait été exprimé sans retard indu.',
        };
      case 'MODIFICATION_SUBSTANTIELLE':
        // Art. 245, premier alinéa · c'est un REJET, et une contre-proposition.
        return {
          etat: 'CONTRE_PROPOSITION',
          dateLimite,
          article: 'AUDCG art. 245, premier alinéa',
          explication:
            'Réponse contenant des additions, limitations ou autres modifications : elle VAUT REJET de l’offre ' +
            'et constitue une CONTRE-PROPOSITION. C’est désormais au premier offrant d’accepter ou non.',
        };
      case 'REFUS':
        return {
          etat: 'REFUSE',
          dateLimite,
          article: 'AUDCG art. 242',
          explication: 'L’offre a pris fin : son rejet est parvenu à son auteur.',
        };
    }
  }

  if (s.revoqueLe && s.revoqueLe.getTime() <= s.reference.getTime()) {
    return {
      etat: 'REVOQUE',
      dateLimite,
      article: 'AUDCG art. 242',
      explication: 'L’offre a été révoquée avant toute acceptation.',
    };
  }

  if (dateLimite && s.reference.getTime() > dateLimite.getTime()) {
    return {
      etat: 'CADUC',
      dateLimite,
      article: 'AUDCG art. 243',
      explication:
        'Le délai d’acceptation est écoulé sans réponse. Le devis n’est NI accepté NI refusé : « le silence ou ' +
        'l’inaction ne peut à lui seul valoir acceptation », et il ne vaut pas davantage rejet.',
    };
  }

  return {
    etat: 'EN_ATTENTE',
    dateLimite,
    article: 'AUDCG art. 243',
    explication: dateLimite
      ? 'Le délai d’acceptation court encore.'
      : DELAI_NON_CHIFFRE,
  };
}

// ---------------------------------------------------------------------------
// 5 · LA RÉVOCABILITÉ, QU'UNE DATE DE VALIDITÉ NE SUFFIT PAS À LEVER
// ---------------------------------------------------------------------------

/**
 * Art. 242 · « L'offre peut être RÉVOQUÉE si la révocation parvient au
 * destinataire avant que celui-ci n'ait exprimé son acceptation. Cependant,
 * l'offre NE PEUT ÊTRE RÉVOQUÉE si elle indique, EN FIXANT UN DÉLAI DÉTERMINÉ
 * POUR L'ACCEPTATION, QU'ELLE EST IRRÉVOCABLE, ou si le destinataire était
 * raisonnablement fondé à croire que l'offre était irrévocable et a agi en
 * conséquence. »
 *
 * DEUX CONDITIONS CUMULATIVES DANS LA PREMIÈRE BRANCHE, et c'est le piège : un
 * délai seul ne rend PAS l'offre irrévocable. « Valable jusqu'au 30 » n'engage
 * à rien ; « valable jusqu'au 30, offre ferme » engage. Un logiciel qui
 * déduirait l'irrévocabilité de la seule présence d'une date ferait croire au
 * cabinet qu'il est tenu alors qu'il ne l'est pas, et l'empêcherait de
 * révoquer une offre devenue ruineuse.
 *
 * La SECONDE branche (le destinataire fondé à croire, et qui a agi en
 * conséquence) est une appréciation de fait : le module l'écrit, ne la calcule
 * pas, et ne prétend pas que la révocation soit acquise.
 */
export interface Revocabilite {
  revocable: boolean;
  article: string;
  motif: string;
  reserve: string;
}

export function revocabilite(params: {
  delaiJours: number | null;
  declareeIrrevocable: boolean;
  dejaAcceptee: boolean;
}): Revocabilite {
  const reserve =
    'Sous réserve de la seconde branche de l’art. 242 : l’offre ne peut pas davantage être révoquée si le ' +
    'destinataire « était raisonnablement fondé à croire que l’offre était irrévocable et a agi en conséquence ». ' +
    'C’est une appréciation de fait, que le logiciel ne tranche pas.';

  if (params.dejaAcceptee) {
    return {
      revocable: false,
      article: 'AUDCG art. 242',
      motif: 'L’acceptation est déjà parvenue à l’auteur de l’offre · la révocation ne produirait plus d’effet.',
      reserve,
    };
  }
  if (params.declareeIrrevocable && params.delaiJours !== null) {
    return {
      revocable: false,
      article: 'AUDCG art. 242',
      motif: 'L’offre fixe un délai déterminé pour l’acceptation ET se déclare irrévocable · les deux conditions du texte sont réunies.',
      reserve,
    };
  }
  return {
    revocable: true,
    article: 'AUDCG art. 242',
    motif: params.declareeIrrevocable
      ? 'L’offre se déclare irrévocable mais ne fixe AUCUN délai déterminé · l’art. 242 exige les deux ensemble.'
      : 'L’offre n’est pas déclarée irrévocable · elle peut être révoquée tant que l’acceptation n’est pas parvenue.',
    reserve,
  };
}

// ---------------------------------------------------------------------------
// 6 · LE PRIX, ET LA PRÉSOMPTION QUE LE TEXTE POSE
// ---------------------------------------------------------------------------

/**
 * Art. 263 · « Le prix exprimé dans le contrat est PRÉSUMÉ CONVENU HORS
 * TAXES. » Le total d'un devis est donc un total HT, et la mention est portée
 * sur le document : un client qui lit un total sans savoir s'il porte la taxe
 * n'a pas la même offre devant les yeux selon ce qu'il suppose.
 */
export const PRIX_PRESUME_HORS_TAXES = {
  article: 'AUDCG art. 263',
  mention: 'Le prix exprimé dans le contrat est présumé convenu hors taxes.',
} as const;

/**
 * Art. 240 · « Le contrat de vente commerciale peut être écrit ou verbal ; il
 * n'est soumis à AUCUNE CONDITION DE FORME. Il est prouvé par tous moyens. »
 *
 * Le devis n'est donc pas une obligation, à la différence de la facture
 * (LPF art. 23). Ce module est un outil de preuve et d'organisation, et il ne
 * doit jamais laisser croire qu'une vente sans devis serait irrégulière.
 */
export const AUCUNE_CONDITION_DE_FORME = {
  article: 'AUDCG art. 240',
  mention:
    'Un contrat de vente commerciale peut être écrit ou verbal et n’est soumis à aucune condition de forme. ' +
    'Le devis n’est pas obligatoire : il sert la preuve et l’organisation, pas la régularité de la vente.',
} as const;

/**
 * Les deux délais de dénonciation que le devis annonce, parce que le client
 * les découvre d'ordinaire trop tard.
 *
 * Art. 258 · « Sous peine de DÉCHÉANCE pour l'acheteur du droit de s'en
 * prévaloir, un défaut de conformité APPARENT le jour de la prise de livraison
 * doit être dénoncé par l'acheteur au vendeur DANS LE MOIS qui suit la
 * livraison. »
 *
 * Art. 259 · l'action fondée sur un défaut de conformité CACHÉ « est prescrite
 * dans le délai d'UN AN à compter du jour où ce défaut a été constaté ou aurait
 * dû l'être », sans pouvoir réduire une garantie contractuelle consentie.
 */
export const DELAIS_DE_CONFORMITE = [
  {
    cle: 'APPARENT',
    libelle: 'Défaut de conformité apparent le jour de la prise de livraison',
    delai: 'un mois à compter de la livraison, sous peine de déchéance',
    article: 'AUDCG art. 258',
  },
  {
    cle: 'CACHE',
    libelle: 'Défaut de conformité caché le jour de la prise de livraison',
    delai: 'un an à compter du jour où le défaut a été constaté ou aurait dû l’être',
    article: 'AUDCG art. 259',
  },
] as const;

/** Vrai pour les formes SYSCOHADA · le cloisonnement se justifie ailleurs. */
export function formeCommercante(forme: FormeJuridiqueSyscohada | null): boolean {
  return forme !== null;
}
