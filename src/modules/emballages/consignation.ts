import { Referentiel } from '@prisma/client';
import { compteDuRole, RESERVE_DESCENTE, type RoleCompteEmballage } from './nomenclature-emballages';

/**
 * LA CONSIGNATION D'EMBALLAGES · la seule particularité du cycle, et la seule
 * où les deux textes écrivent une écriture en miroir chez deux tiers.
 *
 * ────────────────────────────────────────────────────────────────────────
 * CE QUE LES DEUX TEXTES ÉCRIVENT, MOT POUR MOT.
 *
 * AUDCIF, Titre VII, fiche du COMPTE 40 · « le compte 4094 (Emballages et
 * matériels à rendre) reçoit à son débit, par le crédit du fournisseur
 * consignataire, les sommes facturées à titre de consignation d'emballages ou
 * de matériels. Il est soldé par : le compte du fournisseur AU RETOUR de
 * l'emballage ; le débit du compte 6082 (Achats d'emballages récupérables) ou
 * du compte 24 (matériel, mobilier et actifs biologiques) EN CAS DE
 * CONSERVATION de l'emballage ou du matériel ; le débit du compte fournisseur
 * ET du compte 6224 (malis sur emballages) EN CAS DE REPRISE POUR UN MONTANT
 * INFÉRIEUR à celui de la consignation. »
 *
 * AUDCIF, fiche du COMPTE 41 · « le compte 4194 (emballages et matériels
 * consignés) reçoit à son crédit, par le débit du client consignataire, les
 * sommes facturées par l'entité à titre de consignation […]. Il est soldé
 * par : le crédit du compte client à la restitution ; le crédit du compte 7074
 * (bonis sur cession d'emballages) s'il s'agit d'un EMBALLAGE, ou du compte 82
 * (produits des cessions d'immobilisations) s'il s'agit d'un MATÉRIEL, en cas
 * de conservation par le client ; le crédit du compte 7074 (bonis sur reprises
 * d'emballage) en cas de reprise à un prix inférieur à celui de la
 * consignation. »
 *
 * Le SYCEBNL écrit les DEUX fiches dans les mêmes termes, à un numéro près ·
 * son 707 n'a pas de subdivision et reçoit lui-même. Voir
 * `nomenclature-emballages.ts`.
 * ────────────────────────────────────────────────────────────────────────
 *
 * LA CONSIGNATION EST UN COMPTE D'ATTENTE, ET C'EST TOUT L'ENJEU. Tant qu'elle
 * n'est pas dénouée, le 4194 porte une DETTE et le 4094 une CRÉANCE dont on ne
 * sait pas encore si elles s'éteindront par un retour, par une vente ou par un
 * écart. Un 4194 laissé en l'état à la clôture est une dette envers un client
 * qui, peut-être, ne rendra jamais l'emballage · le bilan est faux du montant
 * des consignations non qualifiées, et rien dans la balance ne le dit.
 */

/**
 * De quel côté l'entité se tient.
 *
 * ÉMISE · l'entité a consigné à SON CLIENT · elle est le fournisseur, et c'est
 * le 4194 qui joue. REÇUE · un fournisseur a consigné À L'ENTITÉ · elle est le
 * client, et c'est le 4094.
 */
export type SensConsignation = 'EMISE' | 'RECUE';

/**
 * La nature de l'objet consigné, ET ELLE N'EST PAS DÉCORATIVE · les deux
 * fiches routent la conservation différemment selon qu'il s'agit d'un
 * EMBALLAGE (stock, produit accessoire) ou d'un MATÉRIEL (immobilisation,
 * produit de cession). Elle est SAISIE et jamais déduite : aucun numéro de
 * compte ne dit si l'objet consigné est un casier ou une citerne.
 */
export type NatureObjetConsigne = 'EMBALLAGE' | 'MATERIEL';

/** Les trois dénouements que les deux fiches énumèrent, et eux seuls. */
export type ModeDenouement = 'RESTITUTION' | 'CONSERVATION' | 'REPRISE_PRIX_INFERIEUR';

export type MotifRefusDenouement =
  | 'PRIX_DE_REPRISE_MANQUANT'
  | 'PRIX_DE_REPRISE_NON_INFERIEUR'
  | 'CESSION_IMMOBILISATION_HORS_MODULE'
  | 'MONTANT_NON_POSITIF';

export interface Consignation {
  sens: SensConsignation;
  nature: NatureObjetConsigne;
  /** Le compte du tiers · fournisseur consignataire ou client consignataire. */
  compteTiers: string;
  intituleTiers: string;
  /** Montant facturé à titre de consignation. */
  montant: number;
  designation: string;
}

export interface LigneConsignation {
  compte: string;
  intitule: string;
  libelle: string;
  sens: 'DEBIT' | 'CREDIT';
  montant: number;
  /** Ce que le texte écrit là où le module descend d'un cran, le cas échéant. */
  reserve?: string;
}

export interface RefusDenouement {
  motif: MotifRefusDenouement;
  explication: string;
}

export interface PropositionDenouement {
  lignes: LigneConsignation[];
  refus: RefusDenouement | null;
  /** Ce que le module ne calcule pas, et qui reste dû. */
  reserves: string[];
}

/**
 * LA CONSIGNATION ELLE-MÊME · le 4094 ou le 4194 s'ouvre, contre le tiers.
 *
 * AUCUNE LIGNE DE TVA, ET C'EST UNE ABSTENTION MOTIVÉE. Les deux fiches, qui
 * décrivent pourtant l'écriture ligne à ligne, ne mentionnent aucune taxe sur
 * la consignation ni sur son dénouement. Le régime de TVA d'une consignation
 * est une question FISCALE, que le corpus lu ne tranche pas ici, et en poser
 * une d'office ferait collecter ou déduire une taxe que personne n'a décidée.
 * La réserve est écrite plutôt que tue.
 */
export function lignesDeLaConsignation(
  c: Consignation,
  referentiel: Referentiel,
): PropositionDenouement {
  if (!(c.montant > 0)) {
    return {
      lignes: [],
      refus: {
        motif: 'MONTANT_NON_POSITIF',
        explication:
          'Une consignation porte le montant FACTURÉ à ce titre, strictement positif. Le sens de ' +
          "l'opération est déjà dit par ÉMISE ou REÇUE · un montant négatif l'inverserait sans le " +
          'dire.',
      },
      reserves: [],
    };
  }

  const role: RoleCompteEmballage =
    c.sens === 'EMISE' ? 'DETTE_CONSIGNATION' : 'CREANCE_CONSIGNATION';
  const compte = compteDuRole(role, referentiel);
  const libelle = `Consignation · ${c.designation}`;

  // ÉMISE · le client est DÉBITÉ, la dette de consignation est CRÉDITÉE.
  // REÇUE · la créance est DÉBITÉE, le fournisseur est CRÉDITÉ.
  const lignes: LigneConsignation[] =
    c.sens === 'EMISE'
      ? [
          { compte: c.compteTiers, intitule: c.intituleTiers, libelle, sens: 'DEBIT', montant: c.montant },
          { compte: compte.numero, intitule: compte.intitule, libelle, sens: 'CREDIT', montant: c.montant },
        ]
      : [
          { compte: compte.numero, intitule: compte.intitule, libelle, sens: 'DEBIT', montant: c.montant },
          { compte: c.compteTiers, intitule: c.intituleTiers, libelle, sens: 'CREDIT', montant: c.montant },
        ];

  return { lignes, refus: null, reserves: [RESERVE_TVA] };
}

/**
 * LE DÉNOUEMENT · les trois issues que les deux fiches énumèrent.
 *
 * `prixDeReprise` n'est lu QUE pour une reprise sous le prix de consignation ·
 * c'est le seul cas où les deux fiches en parlent, et le seul où l'écart
 * devient un mali chez l'un et un boni chez l'autre.
 */
export function lignesDuDenouement(
  c: Consignation,
  mode: ModeDenouement,
  referentiel: Referentiel,
  prixDeReprise?: number | null,
): PropositionDenouement {
  const dette = compteDuRole(
    c.sens === 'EMISE' ? 'DETTE_CONSIGNATION' : 'CREANCE_CONSIGNATION',
    referentiel,
  );
  const reserves = [RESERVE_TVA];

  if (mode === 'RESTITUTION') {
    // « Il est soldé par : le compte du fournisseur AU RETOUR de l'emballage »
    // et « le crédit du compte client à la restitution ». Rien n'entre au
    // résultat · la consignation n'était pas une vente.
    const libelle = `Restitution · ${c.designation}`;
    return {
      lignes:
        c.sens === 'EMISE'
          ? [
              { compte: dette.numero, intitule: dette.intitule, libelle, sens: 'DEBIT', montant: c.montant },
              { compte: c.compteTiers, intitule: c.intituleTiers, libelle, sens: 'CREDIT', montant: c.montant },
            ]
          : [
              { compte: c.compteTiers, intitule: c.intituleTiers, libelle, sens: 'DEBIT', montant: c.montant },
              { compte: dette.numero, intitule: dette.intitule, libelle, sens: 'CREDIT', montant: c.montant },
            ],
      refus: null,
      reserves,
    };
  }

  if (mode === 'CONSERVATION') {
    const libelle = `Conservation · ${c.designation}`;

    // LE REFUS CENTRAL DE CE MODULE. Côté FOURNISSEUR, la fiche du compte 41
    // route la conservation d'un MATÉRIEL vers le compte 82, « produits des
    // cessions d'immobilisations ». C'est une CESSION, et une cession ne se
    // résume pas à son produit : la valeur comptable nette du bien doit SORTIR
    // au 81, et l'immobilisation doit être décomptabilisée. La fiche du
    // compte 41 ne dit rien de cette moitié · elle décrit le sort du 4194, pas
    // celui du bien.
    //
    // Poster ici « 4194 à 822 » seul laisserait le matériel AU BILAN pendant
    // que son produit de cession est enregistré : l'écriture s'équilibre, la
    // balance boucle, et l'actif est surévalué de la valeur nette du bien
    // tandis que le résultat est surévalué d'autant. C'est le § 10 bis dans sa
    // forme la plus coûteuse, et c'est exactement le défaut que le module des
    // immobilisations existe pour empêcher (« la sortie solde le 29 et le
    // retranche de la valeur comptable nette »).
    if (c.sens === 'EMISE' && c.nature === 'MATERIEL') {
      const produit = compteDuRole('PRODUIT_CESSION_IMMO', referentiel);
      const vnc = compteDuRole('VALEUR_COMPTABLE_CESSION', referentiel);
      return {
        lignes: [],
        refus: {
          motif: 'CESSION_IMMOBILISATION_HORS_MODULE',
          explication:
            `La conservation par le client d'un MATÉRIEL consigné est une CESSION ` +
            `D'IMMOBILISATION : la fiche du compte 41 route le ${dette.numero} vers le compte ` +
            `${produit.numero} « ${produit.intitule} », mais elle ne décrit que le sort de la ` +
            `dette de consignation, pas celui du bien. Une cession sort aussi la VALEUR ` +
            `COMPTABLE NETTE au ${vnc.numero} et décomptabilise l'immobilisation, ce que cette ` +
            `fiche ne dit pas. Passer ici la seule contrepartie de produit laisserait le matériel ` +
            `AU BILAN pendant que son prix de cession est enregistré · l'écriture s'équilibrerait, ` +
            `la balance boucherait, et l'actif comme le résultat seraient surévalués de la valeur ` +
            `nette du bien. La cession se passe dans le module des immobilisations, qui tient le ` +
            `plan d'amortissement et la dépréciation ; le ${dette.numero} s'y solde en règlement ` +
            `du prix.`,
        },
        reserves,
      };
    }

    if (c.sens === 'EMISE') {
      // Emballage conservé · « le crédit du compte 7074 s'il s'agit d'un
      // emballage » (SYSCOHADA) · « le crédit du compte 707 » (SYCEBNL).
      const produit = compteDuRole('BONI_SUR_EMBALLAGES', referentiel);
      return {
        lignes: [
          { compte: dette.numero, intitule: dette.intitule, libelle, sens: 'DEBIT', montant: c.montant },
          { compte: produit.numero, intitule: produit.intitule, libelle, sens: 'CREDIT', montant: c.montant },
        ],
        refus: null,
        reserves,
      };
    }

    // Côté CLIENT · « le débit du compte 6082 (Achats d'emballages
    // récupérables) OU du compte 24 en cas de conservation de l'emballage ou
    // du matériel ». Les deux fiches donnent le 24 générique : le module
    // descend au 243 et le DIT.
    const role: RoleCompteEmballage =
      c.nature === 'EMBALLAGE' ? 'ACHAT_EMBALLAGE_RECUPERABLE' : 'MATERIEL_EMBALLAGE';
    const destination = compteDuRole(role, referentiel);
    return {
      lignes: [
        {
          compte: destination.numero,
          intitule: destination.intitule,
          libelle,
          sens: 'DEBIT',
          montant: c.montant,
          ...(c.nature === 'MATERIEL' ? { reserve: RESERVE_DESCENTE } : {}),
        },
        { compte: dette.numero, intitule: dette.intitule, libelle, sens: 'CREDIT', montant: c.montant },
      ],
      refus: null,
      reserves,
    };
  }

  // REPRISE À UN PRIX INFÉRIEUR À CELUI DE LA CONSIGNATION.
  if (prixDeReprise === null || prixDeReprise === undefined) {
    return {
      lignes: [],
      refus: {
        motif: 'PRIX_DE_REPRISE_MANQUANT',
        explication:
          "Une reprise sous le prix de consignation suppose le PRIX REPRIS, et il ne se déduit de " +
          "rien · c'est lui qui décide du montant de l'écart. Sans lui, le mali et le boni ne se " +
          'chiffrent pas.',
      },
      reserves,
    };
  }
  if (!(prixDeReprise >= 0) || prixDeReprise >= c.montant) {
    return {
      lignes: [],
      refus: {
        motif: 'PRIX_DE_REPRISE_NON_INFERIEUR',
        explication:
          `Le prix repris (${prixDeReprise}) n'est pas INFÉRIEUR au montant de la consignation ` +
          `(${c.montant}). Les deux fiches ne décrivent l'écart que « en cas de reprise pour un ` +
          "montant INFÉRIEUR à celui de la consignation » · une reprise au même prix est une " +
          'RESTITUTION, et aucune source lue ne traite la reprise à un prix supérieur.',
      },
      reserves,
    };
  }

  const ecart = arrondir(c.montant - prixDeReprise, 2);
  const libelle = `Reprise sous le prix de consignation · ${c.designation}`;

  if (c.sens === 'EMISE') {
    // « le crédit du compte 7074 (bonis sur reprises d'emballage) »
    const boni = compteDuRole('BONI_SUR_EMBALLAGES', referentiel);
    return {
      lignes: [
        { compte: dette.numero, intitule: dette.intitule, libelle, sens: 'DEBIT', montant: c.montant },
        { compte: c.compteTiers, intitule: c.intituleTiers, libelle, sens: 'CREDIT', montant: prixDeReprise },
        { compte: boni.numero, intitule: boni.intitule, libelle, sens: 'CREDIT', montant: ecart },
      ],
      refus: null,
      reserves,
    };
  }

  // « le débit du compte fournisseur ET du compte 6224 (malis sur emballages) »
  const mali = compteDuRole('MALI_SUR_EMBALLAGES', referentiel);
  return {
    lignes: [
      { compte: c.compteTiers, intitule: c.intituleTiers, libelle, sens: 'DEBIT', montant: prixDeReprise },
      { compte: mali.numero, intitule: mali.intitule, libelle, sens: 'DEBIT', montant: ecart },
      { compte: dette.numero, intitule: dette.intitule, libelle, sens: 'CREDIT', montant: c.montant },
    ],
    refus: null,
    reserves,
  };
}

/**
 * CE QUE LE MODULE NE CALCULE PAS, ET QU'IL DIT PLUTÔT QUE DE TAIRE.
 *
 * Les deux fiches décrivent l'écriture ligne à ligne et ne mentionnent AUCUNE
 * taxe, ni à la consignation ni à son dénouement. Le régime de TVA d'une
 * consignation n'est tranché nulle part dans le corpus lu · en poser une
 * d'office ferait collecter ou déduire une taxe que personne n'a décidée, et
 * la déclaration partirait avec.
 */
export const RESERVE_TVA =
  "Aucune ligne de TVA n'est proposée. Les fiches des comptes 40 et 41 décrivent l'écriture ligne " +
  "à ligne et ne mentionnent aucune taxe, ni à la consignation ni à son dénouement, et le régime " +
  "de TVA d'une consignation n'est tranché nulle part dans le corpus lu. Si l'opération est " +
  'taxable, la ligne se saisit à la main.';

function arrondir(n: number, decimales: number): number {
  const f = 10 ** decimales;
  return Math.round(n * f) / f;
}
