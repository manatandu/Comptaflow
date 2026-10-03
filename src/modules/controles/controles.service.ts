import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { STOCK_PROVENANT_D_IMMOBILISATIONS } from '../stocks/nomenclature-stocks';
import { PrismaService } from '../../common/prisma.service';
import { Collecte, LOT_ECRITURES, LOT_LECTURE, lireParLots, pageApres } from '../../common/lecture-par-lots';
import { qualifierExemptionIs } from '../fiscalite/exemption-is-ebnl';
import { FORMES_PERSONNES_PHYSIQUES } from '../retenues/correspondance-retenues';
import {
  ClasseCompte,
  FormeJuridiqueSyscohada,
  GranulariteCloture,
  Prisma,
  JeuEtatsFinanciersSycebnl,
  Referentiel,
  SensDepreciation,
  StatutEcriture,
  StatutExercice,
  StatutExoneration,
  SystemeComptableSyscohada,
  TypeCompteDetailTotal,
} from '@prisma/client';
import { JOURS_ALERTE_RENOUVELLEMENT } from '../exonerations/correspondance-exonerations';
import { regleAuditeur, type RegleAuditeur } from './regles-auditeur';
import { conventionInterditeCompteCourant } from './conventions-interdites';
import { verdictMoitieCapital } from './moitie-capital';
import { EcritureService } from '../comptabilite/ecriture.service';
import { EtatsFinanciersSyscohadaService } from '../etats-financiers-syscohada/etats-financiers-syscohada.service';
import { chargerLignes } from '../etats-financiers/etats-financiers.communs';
import { sourceManuel } from '../documents-obligatoires/manuel-procedures.service';
import { PREFIXES_CHIFFRE_AFFAIRES_SYSCOHADA } from '../etats-financiers-syscohada/correspondance-compte-resultat-syscohada';
import { evaluerComparabilite } from '../etats-financiers/comparabilite-exercices';
import { ancienneteJours, enRetardDeCentralisation } from '../comptabilite/centralisation-brouillard';
import { dernierExerciceCouvert, estDansLaProrogation, mandatCouvrant, regleDeProrogation } from '../mandat-auditeur/duree-mandat';
import {
  articleTrenteSeptApplicable,
  etatAccordCadre,
  PART_MAIN_OEUVRE_LOCALE_MINIMALE,
} from '../accord-cadre/conditions-ong-etrangere';
import { ajouterMois } from '../../common/ajouter-mois';
import { ENTREE_EN_VIGUEUR_LOI_23_053 } from '../../common/entree-en-vigueur-loi-23-053';
import { aNouveauEnTrop, filtreANouveauEcarte } from '../rapprochement/rapprochement.service';
import { formeApplicable } from '../tenant/forme-applicable';
import { motifNonAmortissable, motifSansAmortissementProjet } from '../immobilisations/comptes-du-bien';
import { amortissementsHorsDotations } from '../immobilisations/partie-remplacee';
import { ecartClasse9 } from '../comptabilite/classe-9-equilibree';
import { PLAFOND_LIGNES_EXAMINEES, reglementsSansEcart } from '../reglements/reglements-sans-ecart';
import { issueEcartACheval, issueLettrageACheval, lettragesACheval, PLAFOND_LETTRAGES_A_CHEVAL } from '../lettrage/lettrages-a-cheval';
import {
  comptesBancairesSansRapprochement,
  estCompteBancaireARapprocher,
  journauxEnRetardDeClotureInformatique,
  premiereEcheanceDepassee,
  releveCouvreLaCloture,
  sourceClotureInformatique,
  sourceFicheCompte52,
  texteEnVigueurPourLExercice,
  type CompteBancaireMouvemente,
  type EtatRapprochementCompte,
  type JournalEcrit,
} from './banque-et-cloture-informatique';
import { jourDeKinshasa } from '../../common/echeance';

/**
 * SEUILS DE DÉSIGNATION DU CONTRÔLEUR DES COMPTES · ils ne sont PLUS ici.
 *
 * Ils dépendent du référentiel et, en SYSCOHADA, de la forme juridique · voir
 * `regles-auditeur.ts`, qui porte les quatre règles lues à leur source. Ces
 * trois constantes restent exportées parce que des écrans les citent, mais
 * elles ne valent que pour le SYCEBNL et le disent.
 *
 * Exprimés en FRANCS CFA par les textes, et laissés tels quels. Ils ne se
 * comparent pas non plus aux montants du dossier, tenus en francs congolais ·
 * voir `seuilsAuditeur`. Un seuil converti à un taux inventé induirait en
 * erreur plus sûrement qu'un seuil brut annoncé comme tel. Même règle que
 * pour le seuil du Système minimal de trésorerie.
 */
export const SEUIL_BILAN_AUDITEUR = 100_000_000;
export const SEUIL_RESSOURCES_AUDITEUR = 200_000_000;
export const SEUIL_EFFECTIF_AUDITEUR = 20;

/** Classes du bilan · 1 à 5. Les 6 à 8 sont de gestion, la 9 est hors bilan. */
const CLASSES_BILAN: ClasseCompte[] = [
  ClasseCompte.CLASSE_1,
  ClasseCompte.CLASSE_2,
  ClasseCompte.CLASSE_3,
  ClasseCompte.CLASSE_4,
  ClasseCompte.CLASSE_5,
];

/** Un critère de désignation du contrôleur des comptes, mesuré et comparé à son seuil. */
export interface CritereAuditeur {
  critere: string;
  valeur: number;
  seuil: number;
  /**
   * Le critère a-t-il été COMPARÉ à son seuil ? Faux pour les deux critères
   * monétaires tant que l'équivalent du seuil en francs congolais n'est pas
   * établi · la valeur est en francs congolais, le seuil en francs CFA, et
   * `franchi` vaut alors faux sans rien conclure.
   */
  mesure: boolean;
  franchi: boolean;
  detail: string;
}

/** Gravité d'une anomalie · commande la couleur et l'ordre de lecture. */
export type Gravite = 'BLOQUANT' | 'AVERTISSEMENT' | 'INFORMATION';

export interface AnomalieControle {
  /** Repère stable, pour qu'un contrôle puisse être suivi d'un exercice à l'autre. */
  code: string;
  gravite: Gravite;
  libelle: string;
  /** Ce que l'anomalie empêche ou risque, en une phrase. */
  consequence: string;
  /** Ce qu'il faut faire. */
  action: string;
  occurrences: {
    reference: string;
    detail: string;
    montant?: number;
    date?: string;
  }[];
  /**
   * Le nombre d'occurrences TROUVÉES, quand la liste n'en montre qu'une
   * partie (audit final F185) · « 200 » ne doit pas se lire comme le total.
   * Absent quand la liste est complète.
   */
  nombre?: number;
}

export interface RapportControles {
  exerciceId: string;
  genereLe: string;
  anomalies: AnomalieControle[];
  totaux: { bloquants: number; avertissements: number; informations: number };
}

/** Une journée de caisse : le solde au soir, et s'il est négatif. */
export interface JourneeCaisse {
  date: string;
  mouvementDebit: number;
  mouvementCredit: number;
  soldeFinJournee: number;
  negatif: boolean;
}

export interface ControleCaisse {
  compteId: string;
  numero: string;
  intitule: string;
  journal: string | null;
  soldeFinal: number;
  premierJourNegatif: string | null;
  nombreJoursNegatifs: number;
  journees: JourneeCaisse[];
}

/**
 * ANALYSE ET CONTRÔLES · État → Analyse et contrôles, et État → Contrôle de
 * caisse chez Sage 100 i7.
 *
 * ## Le contrôle de caisse
 *
 * Le manuel Sage écrit pour une ONG pose la règle sans détour : « Il est
 * impossible de clôturer un journal de caisse s'il a été créditeur pour un
 * jour de la période ; afin d'éviter cela, il est impératif d'enregistrer les
 * écritures d'approvisionnement avant les dépenses. » Une caisse créditrice
 * signifie qu'on a décaissé de l'argent qu'on n'avait pas : c'est
 * matériellement impossible, donc c'est une erreur de saisie ou une dépense
 * non justifiée.
 *
 * OmegaX reprend la règle et la renforce sur deux points. Le contrôle ne
 * s'exécute pas seulement au moment de clôturer, mais à la demande et en
 * continu ; et il ne dit pas « la caisse a été créditrice », il nomme LE JOUR
 * exact du passage sous zéro, parce que c'est cette date qu'il faut aller
 * regarder. En RDC, où une part réelle de l'activité associative passe par la
 * caisse espèces, c'est le contrôle le plus souvent utile.
 *
 * ## Les autres contrôles
 *
 * Ils cherchent ce qu'aucun total ne montre : un compte de tiers dont le solde
 * est du mauvais côté, une créance lettrée depuis trop longtemps, une écriture
 * sans pièce justificative, un compte hors nomenclature (celle du SYCEBNL ou
 * celle du SYSCOHADA, selon le dossier). Un logiciel
 * qui se contente d'enregistrer laisse ces anomalies dormir jusqu'à l'audit.
 */
/**
 * Entrée en vigueur de l'arrêté n° 007/CAB/MIN/FINANCES/2025 · son art. 6 :
 * « Le Directeur Général des Impôts est chargé de l'exécution du présent
 * arrêté qui entre en vigueur à la date du 1er janvier 2026. »
 *
 * Elle borne le contrôle 25. Sans elle, un exercice 2024 ou 2025 se verrait
 * reprocher une pièce qu'aucun texte ne demandait alors · c'est exactement la
 * faute que le dépôt refuse ailleurs pour les taux du séminaire CPCC, abrogés
 * au 1er janvier 2026.
 */
const ENTREE_EN_VIGUEUR_AM_007_2025 = new Date('2026-01-01T00:00:00.000Z');

/**
 * ENTRÉE EN VIGUEUR DE LA LOI n° 23/053, et elle commande deux contrôles.
 *
 * Art. 153 : « La présente Loi entre en vigueur après vingt-quatre mois à
 * compter du 31 décembre de l'année de sa promulgation. » Promulguée le 30
 * novembre 2023, donc applicable au 1er janvier 2026. Son art. 152, point 3,
 * abroge à cette date l'Ordonnance-loi n° 89/017 du 18 février 1989, qui
 * portait jusque-là le régime de la réévaluation.
 *
 * LE BORNAGE N'EST PAS UNE PRÉCAUTION, C'EST LE CONTRÔLE LUI-MÊME. Un
 * exercice 2024 ou 2025 relève de l'ordonnance-loi abrogée, dont la
 * déclaration et l'astreinte n'avaient ni la même formule ni le même montant.
 * Servir la règle de 2026 à un exercice antérieur reprocherait au dossier une
 * obligation au nom d'un texte qui ne le régissait pas.
 */
// La date elle-même vit dans `common/entree-en-vigueur-loi-23-053.ts`, seul porteur.

/**
 * LES COMPTES QUI PORTENT UNE RÉÉVALUATION, ET LE PIÈGE QU'ILS CACHENT.
 *
 * Le 106 « Écarts de réévaluation » existe dans les deux plans, au même
 * numéro et sous le même intitulé. Ses SUBDIVISIONS, elles, ne veulent pas
 * dire la même chose :
 *
 *   1061 · SYSCOHADA « Écarts de réévaluation LÉGALE »
 *          SYCEBNL   « Écarts de réévaluation sur des biens SANS DROIT DE REPRISE »
 *   1062 · SYSCOHADA « Écarts de réévaluation LIBRE »
 *          SYCEBNL   « Écarts de réévaluation sur des biens AVEC DROIT DE REPRISE »
 *
 * C'est la troisième fois que ce piège se présente au même endroit du travail
 * (après le 192 du registre des provisions et le 4181 des produits à
 * recevoir) : un numéro identique, deux sens. La conséquence est ici fiscale,
 * puisque le prélèvement libératoire de l'art. 129 diffère selon que la
 * réévaluation est légale ou libre. Le contrôle ne descend donc PAS sous le
 * 106 · il n'a pas besoin de la distinction, et la deviner serait faux d'un
 * côté sur deux.
 *
 * Le 154 « Provisions spéciales de réévaluation » porte le même intitulé dans
 * les deux plans. Il est ajouté au périmètre parce que l'art. 133, al. 2 de
 * la loi n° 23/053 impose la réintégration progressive de l'écart : le
 * schéma attendu en RDC passe par lui plus que par un crédit direct du 1061.
 */
const COMPTES_REEVALUATION = ['106', '154'];

/**
 * LES DÉPRÉCIATIONS DE STOCKS, PLAN PAR PLAN · une liste FERMÉE de chaque côté.
 *
 * L'AUDCIF ouvre huit subdivisions au compte 39 (391 à 398) ; le SYCEBNL n'en
 * ouvre que cinq (391, 392, 393, 396, 397). Il n'a ni 394 « produits en
 * cours », ni 395 « services en cours », ni 398 · son 396 couvre à lui seul
 * « produits finis, produits intermédiaires et résiduels », et son 397 les
 * stocks en cours de route. Une dépréciation portée au 398 dans un dossier
 * SYCEBNL est donc à un numéro que son plan n'ouvre pas.
 */
const DEPRECIATIONS_STOCKS: Record<Referentiel, string[]> = {
  [Referentiel.SYSCOHADA]: ['391', '392', '393', '394', '395', '396', '397', '398'],
  [Referentiel.SYCEBNL]: ['391', '392', '393', '396', '397'],
};

/**
 * LE COMPTE DE STOCK ADOSSÉ À UNE DÉPRÉCIATION · 39X se lit 3X, dans les deux
 * plans, et c'est la seule règle de ce fichier qui traverse intacte la
 * différence de nomenclature.
 *
 * Elle la traverse SANS ÊTRE ÉPARGNÉE par le piège habituel · le 397 ne dit
 * pas la même chose des deux côtés. Au SYSCOHADA il déprécie les PRODUITS
 * INTERMÉDIAIRES ET RÉSIDUELS (compte 37) ; au SYCEBNL il déprécie les STOCKS
 * EN COURS DE ROUTE (compte 37 aussi, mais qui porte autre chose). Le
 * rapprochement 397 → 37 reste juste des deux côtés ; c'est l'INTITULÉ qui
 * change, et lui ne doit jamais être écrit en dur ici.
 */
function compteStockAdosse(numeroDepreciation: string): string {
  return `3${numeroDepreciation.slice(2, 3)}`;
}

/**
 * LE STOCK EN COURS DE ROUTE · le numéro change de plan à plan, et le numéro
 * libéré porte autre chose.
 *
 * SYSCOHADA · 38 « Stocks en cours de route, en consignation ou en dépôt »,
 * pendant que le 37 porte les produits intermédiaires et résiduels.
 * SYCEBNL · 37 pour les mêmes stocks, pendant que le 38 porte les DONS EN
 * NATURE H.A.O. Signaler un défaut de variation sur « le 38 » sans regarder le
 * référentiel accuserait une association d'avoir mal comptabilisé ses dons.
 */
const STOCK_EN_COURS_DE_ROUTE: Record<Referentiel, string> = {
  [Referentiel.SYSCOHADA]: '38',
  [Referentiel.SYCEBNL]: '37',
};

/**
 * LE STOCK PROVENANT D'IMMOBILISATIONS MISES HORS SERVICE · sous le compte des
 * stocks en route sans en être un, et sous un numéro différent de chaque côté.
 * SYSCOHADA 388 (AUDCIF Titre VII, compte 38) · SYCEBNL 378 (Partie 2 ch. 3,
 * compte 37). Même objet, même intitulé, deux numéros · le 388 du SYCEBNL
 * n'existe pas, son 38 portant les dons en nature H.A.O.
 *
 * ET UNE SEULE RÈGLE DE SOLDE. L'AUDCIF (Titre VIII, dépréciation des stocks,
 * § 2.8) veut le 388 « soldé par le débit du compte 603 » en fin d'exercice.
 * Le SYCEBNL n'écrit rien de tel pour son 378 · il dit seulement que le compte
 * « est débité par le crédit du compte d'immobilisation concerné ». Le
 * contrôle de solde ne vise donc que le SYSCOHADA ; l'exclusion du contrôle
 * des stocks en route vaut pour les deux.
 */
// La table vit dans `stocks/nomenclature-stocks.ts` (lot 15 des
// immobilisations, qui débite ce compte à la mise hors service) · un seul
// endroit écrit les deux numéros.
const STOCK_PROVENANT_D_IMMOBILISATIONS_PAR_REFERENTIEL: Record<Referentiel, string> = {
  [Referentiel.SYSCOHADA]: STOCK_PROVENANT_D_IMMOBILISATIONS[Referentiel.SYSCOHADA].racine,
  [Referentiel.SYCEBNL]: STOCK_PROVENANT_D_IMMOBILISATIONS[Referentiel.SYCEBNL].racine,
};

/**
 * LES COMPTES QUE LE 72 DÉBITE · « Est crédité le compte 72 du montant des
 * travaux effectués au cours de l'exercice par l'entité pour elle-même (au
 * coût de production) ; par le débit du compte 21, du compte 23 ou 24. » La
 * fiche AUDCIF ajoute au 724 d'autres contreparties (104, 6617, 6627) · voir
 * le contrôle, qui ne lit au SYSCOHADA que le 721 et le 722 (passe R1-C1).
 */
const IMMOBILISATIONS_DE_LA_PRODUCTION = ['21', '23', '24'];

/**
 * CE QUE LA BATTERIE LIT D'UNE ÉCRITURE · une seule lecture, par tranches,
 * pour tous les contrôles qui parcourent les écritures de l'exercice.
 */
const SELECT_ECRITURE_CONTROLEE = {
  id: true,
  date: true,
  libelle: true,
  reference: true,
  numeroPiece: true,
  statut: true,
  createdAt: true,
  // Le double regard compare ces trois-là · ils sont pris dans la même
  // lecture que le reste plutôt que dans une seconde requête.
  createdBy: true,
  valideeBy: true,
  secondRegardNom: true,
  estGenereeParCloture: true,
  estANouveauProvisoire: true,
  // Ligne A13 · le journal écrit (clôture informatique) et le compte de
  // banque mouvementé (rapprochement) se relèvent dans la même lecture.
  journalId: true,
  journal: { select: { code: true } },
  // Ligne A13, seconde relecture (B-α) · l'écriture d'écarts d'une
  // réévaluation, sa contre-passation, et leurs inscriptions en négatif
  // (`corrigeEcriture`) se reconnaissent par leur LIAISON, jamais par le
  // libellé.
  reevaluationEcarts: { select: { id: true } },
  reevaluationExtourne: { select: { id: true } },
  corrigeEcriture: { select: { reevaluationEcarts: { select: { id: true } }, reevaluationExtourne: { select: { id: true } } } },
  // Ligne A7 ter, B2 · les écritures que tient une créance douteuse (son
  // reclassement, ses pertes et recouvrements, ses revues) se reconnaissent
  // par leur LIAISON, avec l'état d'annulation de l'acte et de la créance.
  creanceDouteuseReclassement: { select: { annuleeLe: true } },
  mouvementCreanceDouteuse: { select: { annuleeLe: true, creance: { select: { annuleeLe: true } } } },
  ajustementCreanceDouteuse: { select: { annuleeLe: true, creance: { select: { annuleeLe: true } } } },
  lignes: {
    // `lettrageId` · le contrôle 35 (lettrage à cheval de deux exercices, A6
    // bis, B2) n'interroge les lettrages que si une ligne de l'exercice est
    // lettrée, partiel compris · sans elle, aucun groupe ne peut y toucher.
    select: {
      debit: true,
      credit: true,
      lettre: true,
      lettrageId: true,
      compte: {
        select: {
          id: true,
          numero: true,
          intitule: true,
          // B2 · le compte client d'ORIGINE d'une créance reclassée en
          // vigueur, et la date de son reclassement le plus récent · la
          // facture TAXÉE qui le précède se nomme comme telle (elle ne se
          // lettre pas avec le reclassement, `lettrage/ligne-de-reclassement.ts`).
          creancesDouteusesSource: {
            where: { annuleeLe: null },
            select: { dateReclassement: true },
            orderBy: { dateReclassement: 'desc' },
            take: 1,
          },
        },
      },
    },
  },
} satisfies Prisma.EcritureSelect;

type EcritureControlee = Prisma.EcritureGetPayload<{ select: typeof SELECT_ECRITURE_CONTROLEE }>;

/**
 * L'écriture porte-t-elle une CONVERSION de change, et non une opération de
 * banque ? Écarts d'une réévaluation (AUDCIF art. 54 et 57, ch. 22 § 2.2),
 * sa contre-passation d'ouverture, et l'inscription en négatif de l'une ou de
 * l'autre (annulation D6, art. 20, al. 2). La réévaluation ANNULÉE compte
 * aussi · son écriture d'origine reste au journal, neutralisée par son
 * négatif, et ni l'une ni l'autre n'est un mouvement du relevé ; la retenir
 * refaisait l'anomalie fabriquée de B-α.
 */
function estEcritureDeConversion(e: EcritureControlee): boolean {
  // `!= null` · une liaison absente vaut `null` en base, et une doublure qui
  // ne la sert pas ne doit pas faire passer toute écriture pour une conversion.
  return (
    e.reevaluationEcarts != null ||
    e.reevaluationExtourne != null ||
    (e.corrigeEcriture != null &&
      (e.corrigeEcriture.reevaluationEcarts != null || e.corrigeEcriture.reevaluationExtourne != null))
  );
}

/**
 * L'ÉCRITURE QUE TIENT UNE CRÉANCE DOUTEUSE EN VIGUEUR (ligne A7 ter, B2) ·
 * son reclassement au 416, une perte ou un recouvrement, une revue de sa
 * dépréciation, tant que ni l'acte ni la créance ne sont annulés. Le contrôle
 * d'ancienneté les listait et conseillait « Lettrez ce qui est réglé » · or la
 * créance se suit dans son module, et lettrer la facture avec le reclassement
 * rendrait la TVA exigible (règle 6 de `creances-douteuses.ts`). Le module
 * lettre lui-même ses lignes 416 quand la créance est éteinte.
 * `!= null` · une liaison absente vaut `null`, et une doublure qui ne la sert
 * pas ne fait jamais passer une écriture pour tenue.
 */
function estTenueParUneCreanceDouteuse(e: EcritureControlee): boolean {
  const vivant = (acte: { annuleeLe: Date | null; creance?: { annuleeLe: Date | null } } | null | undefined) =>
    acte != null && acte.annuleeLe == null && (acte.creance === undefined || acte.creance.annuleeLe == null);
  return vivant(e.creanceDouteuseReclassement) || vivant(e.mouvementCreanceDouteuse) || vivant(e.ajustementCreanceDouteuse);
}

/**
 * LA FACTURE D'UNE CRÉANCE RECLASSÉE (B2 ; relecture adverse, mineur 9) ·
 * une ligne DÉBITRICE ouverte d'un compte client d'ORIGINE d'une créance en
 * vigueur, datée AU PLUS TARD du reclassement le plus récent. Toutes les
 * anciennes factures du compte étaient annotées · une vente postérieure est
 * une créance ordinaire, à laquelle « Lettrez ce qui est réglé » s'applique.
 * Nommer le compte une seule fois perdait la pièce que le cabinet doit
 * retrouver ; restreindre garde la pièce et ne nomme qu'elle. Aucun critère de
 * TVA · le reclassement ne lettre jamais le compte du client (règle d'A7,
 * rétablie au second tour).
 */
function estFactureDUneCreanceReclassee(e: EcritureControlee): boolean {
  return e.lignes.some((l) => {
    const derniere = l.compte.creancesDouteusesSource?.[0]?.dateReclassement;
    return (
      !l.lettre &&
      l.compte.numero.startsWith('41') &&
      Number(l.debit) - Number(l.credit) > 0.005 &&
      derniere != null &&
      e.date.getTime() <= derniere.getTime()
    );
  });
}

/** Plafond des occurrences montrées par contrôle · le nombre trouvé est dit à côté. */
const PLAFOND_OCCURRENCES = 200;

/** Les racines que les modèles du Système minimal n'ouvrent pas (contrôle 6 ter). */
const RACINES_SANS_POSTE_SMT = ['15', '19', '29'];

/**
 * Les comptes que le plan SYSCOHADA ouvre pour la réserve de propriété
 * (Titre VII, comptes 40, 41, 48 et 90), intitulés relus dans le semis
 * `compte-seed-syscohada.ts` · contrôle RESERVE_PROPRIETE_A_MENTIONNER.
 */
export const RACINES_RESERVE_PROPRIETE: readonly { racine: string; intitule: string }[] = [
  { racine: '4016', intitule: 'Fournisseurs, réserve de propriété' },
  { racine: '4816', intitule: 'Fournisseurs d’investissements, réserve de propriété' },
  { racine: '4116', intitule: 'Clients, réserve de propriété' },
  { racine: '9043', intitule: 'Ventes avec clause de réserve de propriété' },
  { racine: '9083', intitule: 'Achats avec clause de réserve de propriété' },
];

/** Le dossier tient-il le Système minimal de trésorerie, dans l'un ou l'autre texte ? */
function estAuSystemeMinimal(tenant: {
  referentiel: Referentiel;
  systemeComptableSyscohada: SystemeComptableSyscohada | null;
  jeuEtatsFinanciersSycebnl: JeuEtatsFinanciersSycebnl;
}): boolean {
  return tenant.referentiel === Referentiel.SYSCOHADA
    ? tenant.systemeComptableSyscohada === SystemeComptableSyscohada.MINIMAL_TRESORERIE
    : tenant.jeuEtatsFinanciersSycebnl === JeuEtatsFinanciersSycebnl.SYSTEME_MINIMAL_TRESORERIE;
}

/**
 * Un bien sans date de mise en service n'est pas encore amortissable (AUDCIF
 * art. 45 · l'amortissement part de la date où l'actif est « en état de
 * fonctionner »). Le filtre SQL l'écarte déjà (`not: null`) ; ce garde le dit
 * au typage, pour que les contrôles 12 et 13 ne lisent jamais une date nulle.
 */
function estMisEnService<T extends { dateMiseEnService: Date | null }>(
  i: T,
): i is T & { dateMiseEnService: Date } {
  return i.dateMiseEnService !== null;
}

/** Le nombre trouvé, porté seulement quand la liste montrée en a laissé. */
function nombreSiTronque(collecte: Collecte<unknown>): { nombre?: number } {
  return collecte.tronquee ? { nombre: collecte.nombre } : {};
}

@Injectable()
export class ControlesService {
  /** Au-delà, une créance ou une dette non lettrée mérite qu'on la regarde. */
  private static readonly JOURS_ANCIENNETE_TIERS = 180;
  constructor(
    private readonly prisma: PrismaService,
    // La résolution du bilan du ch. 7 · lue, jamais réécrite, pour les
    // capitaux propres du contrôle de la moitié du capital. Facultatives pour
    // les doublures qui n'instancient que Prisma · absentes, ce seul contrôle
    // ne tourne pas.
    @Optional() private readonly ecritureService?: EcritureService,
    @Optional() private readonly etatsSyscohada?: EtatsFinanciersSyscohadaService,
  ) {}

  private async exercice(tenantId: string, exerciceId: string) {
    const ex = await this.prisma.exercice.findFirst({ where: { id: exerciceId, tenantId } });
    if (!ex) throw new BadRequestException('Exercice introuvable pour ce dossier');
    return ex;
  }

  /**
   * Contrôle de caisse, compte par compte, jour par jour.
   *
   * Le solde est reconstitué chronologiquement : une caisse ne peut pas être
   * créditrice, donc tout jour où elle l'est signale soit une dépense saisie
   * avant son approvisionnement, soit une sortie sans justification.
   */
  async controleCaisse(tenantId: string, exerciceId: string): Promise<ControleCaisse[]> {
    await this.exercice(tenantId, exerciceId);

    // Comptes de caisse : le 57 des DEUX plans (« Caisse » au SYCEBNL comme
    // au SYSCOHADA), plus tout compte rattaché à un
    // journal de trésorerie dont le code ou l'intitulé parle de caisse.
    const comptes = await this.prisma.compte.findMany({
      where: {
        tenantId,
        typeCompte: TypeCompteDetailTotal.DETAIL,
        OR: [{ numero: { startsWith: '57' } }, { journauxTresorerie: { some: {} } }],
      },
      include: { journauxTresorerie: { select: { code: true, intitule: true } } },
    });
    const comptesCaisse = comptes.filter(
      (c) =>
        c.numero.startsWith('57') ||
        c.journauxTresorerie.some((j) => /caiss|especes|espèces/i.test(`${j.code} ${j.intitule}`)),
    );
    return this.soldesJourParJour(tenantId, exerciceId, comptesCaisse);
  }

  /**
   * INSTRUMENTS DE MONNAIE ÉLECTRONIQUE, jour par jour (passes R1-B5, R5-C4).
   *
   * Les deux textes écrivent, à la fiche de leur compte 55, la règle qu'ils
   * écrivent de la caisse · « Le solde du compte instruments monétaires
   * électroniques ne doit être que débiteur ou nul » (AUDCIF Titre VII,
   * compte 55 ; SYCEBNL Partie 2 ch. 3, compte 55). Rien ne le lisait · un 55
   * créditeur passait au bilan en diminution de la trésorerie-actif, fondu
   * avec les banques et la caisse, sans qu'aucune ligne ne le signale. Même
   * reconstitution que la caisse, sur les seuls comptes 55 de détail.
   */
  async controleMonnaieElectronique(tenantId: string, exerciceId: string): Promise<ControleCaisse[]> {
    await this.exercice(tenantId, exerciceId);
    const comptes = await this.prisma.compte.findMany({
      where: { tenantId, typeCompte: TypeCompteDetailTotal.DETAIL, numero: { startsWith: '55' } },
      include: { journauxTresorerie: { select: { code: true, intitule: true } } },
    });
    return this.soldesJourParJour(tenantId, exerciceId, comptes.filter((c) => c.numero.startsWith('55')));
  }

  private async soldesJourParJour(
    tenantId: string,
    exerciceId: string,
    comptesCaisse: { id: string; numero: string; intitule: string; journauxTresorerie: { code: string }[] }[],
  ): Promise<ControleCaisse[]> {
    if (comptesCaisse.length === 0) return [];

    // PAR TRANCHES, CUMULÉ PAR JOUR (audit final F185) · une caisse
    // d'agence mouvementée chaque jour ne tient plus toutes ses lignes en
    // mémoire, seulement ses journées.
    const parCompteJour = new Map<string, Map<string, { debit: number; credit: number }>>();
    await lireParLots(
      (curseur) =>
        this.prisma.ligneEcriture.findMany({
          where: {
            compteId: { in: comptesCaisse.map((c) => c.id) },
            ecriture: { tenantId, exerciceId },
          },
          select: { id: true, compteId: true, debit: true, credit: true, ecriture: { select: { date: true } } },
          ...pageApres(curseur, LOT_LECTURE),
        }),
      (l) => {
        const parJour = parCompteJour.get(l.compteId) ?? new Map<string, { debit: number; credit: number }>();
        parCompteJour.set(l.compteId, parJour);
        const jour = l.ecriture.date.toISOString().slice(0, 10);
        const acc = parJour.get(jour) ?? { debit: 0, credit: 0 };
        acc.debit += Number(l.debit);
        acc.credit += Number(l.credit);
        parJour.set(jour, acc);
      },
    );

    return comptesCaisse.map((compte) => {
      const parJour = parCompteJour.get(compte.id) ?? new Map<string, { debit: number; credit: number }>();

      let cumul = 0;
      const journees: JourneeCaisse[] = [...parJour.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, m]) => {
          cumul += m.debit - m.credit;
          return {
            date,
            mouvementDebit: m.debit,
            mouvementCredit: m.credit,
            soldeFinJournee: cumul,
            // Tolérance au centime : un arrondi ne doit pas déclencher une
            // alerte de caisse créditrice.
            negatif: cumul < -0.005,
          };
        });

      const negatives = journees.filter((j) => j.negatif);
      return {
        compteId: compte.id,
        numero: compte.numero,
        intitule: compte.intitule,
        journal: compte.journauxTresorerie[0]?.code ?? null,
        soldeFinal: cumul,
        premierJourNegatif: negatives[0]?.date ?? null,
        nombreJoursNegatifs: negatives.length,
        journees,
      };
    });
  }

  /** Batterie complète de contrôles sur un exercice. */
  /**
   * ÉVOLUTION MENSUELLE PAR COMPTE · douze colonnes plus le cumul.
   *
   * Le besoin vient d'un dossier réel : le reporting CARRIGRES (Drive,
   * exercices 2024 et 2025) est bâti presque entièrement sur cette vue, un
   * compte par ligne et un mois par colonne, du salaire de base aux ventes de
   * grès par calibre. C'est ainsi qu'un chef comptable repère ce qu'aucun
   * cumul ne montre : une charge qui double en juillet, un produit qui
   * disparaît en septembre, une régularisation passée deux fois.
   *
   * OmegaX savait donner le cumul de l'exercice et la comparaison N/N-1 ;
   * entre les deux, il n'y avait rien. Douze colonnes, c'est la granularité
   * à laquelle une anomalie devient visible sans ouvrir le grand livre.
   *
   * Deux partis pris :
   *  - le REPORT À-NOUVEAU est exclu des colonnes mensuelles et présenté à
   *    part. Sans cela, janvier porterait l'intégralité du passé et écraserait
   *    toute lecture de l'année ;
   *  - le montant retenu est le NET SIGNÉ du mois (débit moins crédit), pas
   *    deux colonnes par mois. Vingt-quatre colonnes ne se lisent pas, et le
   *    sens du solde d'un compte est connu de son détenteur.
   */
  async evolutionMensuelle(
    tenantId: string,
    exerciceId: string,
    options: { classe?: ClasseCompte; inclureBrouillard?: boolean } = {},
  ) {
    const ex = await this.exercice(tenantId, exerciceId);

    // PAR TRANCHES (audit final F185) · toutes les lignes de l'exercice
    // passaient d'un bloc en mémoire, pour n'en garder que des cumuls.
    const lire = (curseur: string | undefined) => this.prisma.ligneEcriture.findMany({
      where: {
        compte: { tenantId, ...(options.classe ? { classe: options.classe } : {}) },
        ecriture: {
          tenantId,
          exerciceId,
          ...(options.inclureBrouillard === false ? { statut: StatutEcriture.VALIDEE } : {}),
        },
      },
      select: {
        id: true,
        debit: true,
        credit: true,
        compte: { select: { id: true, numero: true, intitule: true, classe: true, typeCompte: true } },
        ecriture: { select: { date: true, estGenereeParCloture: true, estSoldeDesComptesDeGestion: true } },
      },
      ...pageApres(curseur, LOT_LECTURE),
    });

    // Les mois de l'exercice, dans l'ordre, bornes comprises. Un exercice
    // décalé ou de première année n'en compte pas douze : la table de colonnes
    // se déduit de l'exercice, elle n'est pas figée sur l'année civile.
    const mois: { cle: string; libelle: string }[] = [];
    const curseur = new Date(Date.UTC(ex.dateDebut.getUTCFullYear(), ex.dateDebut.getUTCMonth(), 1));
    const fin = new Date(Date.UTC(ex.dateFin.getUTCFullYear(), ex.dateFin.getUTCMonth(), 1));
    while (curseur <= fin) {
      mois.push({
        cle: `${curseur.getUTCFullYear()}-${String(curseur.getUTCMonth() + 1).padStart(2, '0')}`,
        libelle: curseur.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit', timeZone: 'UTC' }),
      });
      curseur.setUTCMonth(curseur.getUTCMonth() + 1);
    }

    const parCompte = new Map<
      string,
      {
        compteId: string;
        numero: string;
        intitule: string;
        classe: ClasseCompte;
        report: number;
        parMois: Map<string, number>;
      }
    >();

    await lireParLots(lire, (l) => {
      // Un compte TOTAL ne porte jamais d'écriture directe (voir
      // EcritureService.creer) ; s'il en portait, l'inclure doublerait les
      // montants de sa racine.
      if (l.compte.typeCompte === TypeCompteDetailTotal.TOTAL) return;
      const net = Number(l.debit) - Number(l.credit);
      let e = parCompte.get(l.compte.id);
      if (!e) {
        e = {
          compteId: l.compte.id,
          numero: l.compte.numero,
          intitule: l.compte.intitule,
          classe: l.compte.classe,
          report: 0,
          parMois: new Map(),
        };
        parCompte.set(l.compte.id, e);
      }
      // L'écriture qui solde les classes 6 à 8 n'est ni une ouverture ni une
      // activité du mois de clôture (audit final F78) · rangée en ouverture,
      // elle affichait l'inverse du total de l'année sur chaque charge. Le
      // solde d'une charge se lit donc AVANT clôture, celui que les mois
      // additionnent.
      if (l.ecriture.estSoldeDesComptesDeGestion) return;
      if (l.ecriture.estGenereeParCloture) {
        e.report += net;
        return;
      }
      const d = l.ecriture.date;
      const cle = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      e.parMois.set(cle, (e.parMois.get(cle) ?? 0) + net);
    });

    const comptes = [...parCompte.values()]
      .map((e) => {
        const valeurs = mois.map((m) => e.parMois.get(m.cle) ?? 0);
        const cumul = valeurs.reduce((s, v) => s + v, 0);
        const nonNuls = valeurs.filter((v) => Math.abs(v) > 0.005);
        const moyenne = nonNuls.length > 0 ? cumul / nonNuls.length : 0;
        // Le mois qui s'écarte le plus de la moyenne des mois mouvementés ·
        // c'est la colonne que l'œil doit aller voir en premier. Nul quand le
        // compte n'a bougé qu'une fois : un mois isolé n'est pas un écart.
        let moisAberrant: string | null = null;
        if (nonNuls.length >= 3 && Math.abs(moyenne) > 0.005) {
          let pire = 0;
          valeurs.forEach((v, i) => {
            const ecart = Math.abs(v - moyenne) / Math.abs(moyenne);
            if (Math.abs(v) > 0.005 && ecart > pire && ecart >= 1) {
              pire = ecart;
              moisAberrant = mois[i].cle;
            }
          });
        }
        return {
          compteId: e.compteId,
          numero: e.numero,
          intitule: e.intitule,
          classe: e.classe,
          report: e.report,
          valeurs,
          cumul,
          soldeFinal: e.report + cumul,
          moisAberrant,
        };
      })
      .filter((c) => Math.abs(c.cumul) > 0.005 || Math.abs(c.report) > 0.005)
      .sort((a, b) => a.numero.localeCompare(b.numero));

    return {
      exerciceId: ex.id,
      mois,
      comptes,
      classe: options.classe ?? null,
      /*
       * Le total d'une colonne n'a de sens QUE filtré sur une classe. Sur
       * l'ensemble du plan, la somme des nets signés d'un mois vaut zéro par
       * construction (partie double) : une ligne de totaux à zéro sur douze
       * colonnes ressemble à un bug alors que c'est une tautologie. Nul quand
       * aucune classe n'est demandée, et l'écran ne l'affiche alors pas.
       */
      totaux: options.classe ? mois.map((_, i) => comptes.reduce((s, c) => s + c.valeurs[i], 0)) : null,
    };
  }

  /**
   * COMPTES DORMANTS · date du dernier mouvement, compte par compte.
   *
   * Le grand livre CARRIGRES porte, à côté de chaque compte, sa date de
   * création et celle de son dernier mouvement : on y lit des comptes ouverts
   * en 1963 dont le dernier mouvement date de 2012, toujours dans le plan.
   * Un plan comptable qui accumule des comptes morts se lit de plus en plus
   * mal, et un compte dormant à solde non nul est une question à poser avant
   * l'arrêté, pas après.
   *
   * OmegaX savait mettre un compte en sommeil (`estActif`) sans jamais dire
   * LESQUELS le méritaient. Ce contrôle le dit.
   */
  async comptesDormants(tenantId: string, moisSansMouvement = 12) {
    // LE SOLDE ET LE DERNIER MOUVEMENT SE LISENT PAR AGRÉGATS (audit final
    // F68). La version d'avant sommait TOUTES les lignes de TOUS les
    // exercices, reports à-nouveau compris · un compte reporté trois fois
    // affichait trois fois son solde, et un compte à solde nul restait
    // « soldé » même quand il ne l'était pas. Le report daté du 1er janvier
    // comptait en plus comme un mouvement, si bien qu'un compte à solde ne
    // devenait JAMAIS dormant. Et `Math.max(...dates)` levait au-delà de
    // quelques centaines de milliers de lignes.
    //
    // Le solde est celui du grand livre CUMULÉ, par la règle de
    // `balanceCumulee` · les mouvements de tous les exercices, plus
    // l'ouverture du SEUL premier exercice (le bilan d'ouverture du
    // dossier), plus l'écriture qui solde les classes 6 à 8 de chaque
    // exercice clos, qui les remet à zéro et porte le résultat au 13. Les
    // reports suivants rejouent un solde déjà compté, et le provisoire
    // aussi.
    const [comptes, premier] = await Promise.all([
      this.prisma.compte.findMany({
        where: { tenantId, typeCompte: TypeCompteDetailTotal.DETAIL },
        select: { id: true, numero: true, intitule: true, classe: true, estActif: true },
        orderBy: { numero: 'asc' },
      }),
      this.prisma.exercice.findFirst({ where: { tenantId }, orderBy: { dateDebut: 'asc' }, select: { id: true } }),
    ]);

    // Borné à la fin du mois (audit final F8) · le 31 mars moins un mois
    // n'est pas le 3 mars.
    const seuil = ajouterMois(new Date(), -moisSansMouvement);
    const horsCloture = { tenantId, estGenereeParCloture: false };

    const [mouvements, soldesDeGestion, ouverture, reports, recents] = await Promise.all([
      this.prisma.ligneEcriture.groupBy({
        by: ['compteId'],
        where: { ecriture: horsCloture },
        _sum: { debit: true, credit: true },
        _count: { _all: true },
      }),
      this.prisma.ligneEcriture.groupBy({
        by: ['compteId'],
        where: { ecriture: { tenantId, estSoldeDesComptesDeGestion: true } },
        _sum: { debit: true, credit: true },
      }),
      premier
        ? this.prisma.ligneEcriture.groupBy({
            by: ['compteId'],
            where: {
              ecriture: {
                tenantId,
                exerciceId: premier.id,
                estGenereeParCloture: true,
                estSoldeDesComptesDeGestion: false,
                estANouveauProvisoire: false,
              },
            },
            _sum: { debit: true, credit: true },
          })
        : Promise.resolve([]),
      // Les comptes que seul un report a touchés · reportés mais jamais
      // mouvementés, ils ne sont pas « jamais servis ».
      this.prisma.ligneEcriture.groupBy({
        by: ['compteId'],
        where: { ecriture: { tenantId, estGenereeParCloture: true } },
        _count: { _all: true },
      }),
      this.prisma.ligneEcriture.groupBy({
        by: ['compteId'],
        where: { ecriture: { ...horsCloture, date: { gte: seuil } } },
        _count: { _all: true },
      }),
    ]);

    const solde = new Map<string, number>();
    for (const g of [...mouvements, ...soldesDeGestion, ...ouverture]) {
      solde.set(g.compteId, (solde.get(g.compteId) ?? 0) + Number(g._sum.debit ?? 0) - Number(g._sum.credit ?? 0));
    }
    const nombre = new Map(mouvements.map((g) => [g.compteId, g._count._all]));
    const reporte = new Set(reports.map((g) => g.compteId));
    const actifsRecents = new Set(recents.map((g) => g.compteId));

    const dormants = comptes.filter((c) => c.estActif && !actifsRecents.has(c.id));
    // Le dernier mouvement n'est cherché que pour les comptes dormants qui en
    // ont un · une ligne par compte, la plus récente, hors clôture.
    const aDater = dormants.filter((c) => nombre.has(c.id)).map((c) => c.id);
    const derniers =
      aDater.length > 0
        ? await this.prisma.ligneEcriture.findMany({
            where: { compteId: { in: aDater }, ecriture: horsCloture },
            distinct: ['compteId'],
            orderBy: [{ compteId: 'asc' }, { ecriture: { date: 'desc' } }],
            select: { compteId: true, ecriture: { select: { date: true } } },
          })
        : [];
    const dernierPar = new Map(derniers.map((l) => [l.compteId, l.ecriture.date]));

    return dormants
      .map((c) => {
        const dernier = dernierPar.get(c.id) ?? null;
        return {
          compteId: c.id,
          numero: c.numero,
          intitule: c.intitule,
          classe: c.classe,
          estActif: c.estActif,
          dernierMouvement: dernier ? dernier.toISOString() : null,
          nombreEcritures: nombre.get(c.id) ?? 0,
          solde: Math.round((solde.get(c.id) ?? 0) * 100) / 100,
          // Un compte jamais mouvementé n'est pas « dormant » : il n'a jamais
          // servi. Les deux cas appellent des décisions différentes, on les
          // distingue plutôt que de les confondre sous une même étiquette.
          // Un compte que seul un report a touché a servi · il porte un
          // solde repris, sans mouvement depuis.
          jamaisMouvemente: !nombre.has(c.id) && !reporte.has(c.id),
        };
      })
      .sort((a, b) => {
        // Un compte dormant à solde non nul passe devant : c'est celui qui
        // pose une question comptable, pas seulement un problème de propreté.
        const poids = (x: typeof a) => (Math.abs(x.solde) > 0.005 ? 0 : 1);
        return poids(a) - poids(b) || a.numero.localeCompare(b.numero);
      });
  }

  /**
   * SEUILS DE DÉSIGNATION DE L'AUDITEUR · la règle du dossier (voir
   * `regles-auditeur.ts`), mesurée sur la balance.
   *
   * LES DEUX CRITÈRES MONÉTAIRES NE SONT PAS COMPARÉS (passes O1b-A2 et G2).
   * Le dossier est tenu en francs congolais (loi n° 23/053 art. 141, 1° ;
   * AUDCIF art. 17, 1°), les seuils sont écrits en francs CFA. La première
   * version comparait les deux nombres bruts et concluait · une monnaie plus
   * faible gonflait les montants et déclarait franchi un seuil que l'entité
   * n'avait pas atteint, puis AUDITEUR_OBLIGATOIRE_SANS_MANDAT en naissait :
   * le signalement fabriqué du § 10 bis. Chaque texte dit à quel équivalent
   * comparer, et aucun ne donne le chiffre :
   *
   *  · AUSCGIE art. 906 · la contre-valeur en monnaie nationale est celle de
   *    « la parité en vigueur entre le franc CFA et la monnaie nationale […]
   *    le jour de l'adoption du présent Acte uniforme » (30 janvier 2014),
   *    « arrondie à l'unité supérieure ». Cette parité n'est pas au corpus ;
   *  · SYCEBNL art. 19 · « ou l'équivalent dans l'unité monétaire ayant cours
   *    légal dans l'État partie », sans date ni cours. L'art. 906 ne lui est
   *    PAS transposé.
   *
   * Aucun cours n'est écrit ici. Tant que l'équivalent n'est pas établi, seul
   * l'effectif, qui n'a pas d'unité, se compare, et le verdict n'est rendu que
   * s'il s'établit sans les montants. Sinon il reste INDÉTERMINÉ et se dit.
   * Même discipline que l'éligibilité au Système minimal de trésorerie, qui ne
   * convertit rien et ne conclut rien.
   */
  async seuilsAuditeur(
    tenantId: string,
    exerciceId: string,
    effectifPermanent: number,
  ): Promise<{
    criteres: CritereAuditeur[];
    franchis: CritereAuditeur[];
    /**
     * Critères monétaires non comparés dont la valeur, en francs congolais,
     * dépasse le NOMBRE du seuil en francs CFA · ceux que l'ancienne
     * comparaison brute déclarait franchis.
     */
    nonCompares: CritereAuditeur[];
    obligationDeclenchee: boolean;
    /** Le verdict dépend des critères non comparés · ni oui ni non. */
    obligationIndeterminee: boolean;
    obligationSansSeuil: boolean;
    regle: RegleAuditeur;
    conversionAppliquee: boolean;
    source: string | null;
  }> {
    const dossier = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { referentiel: true, formeJuridiqueSyscohada: true, formeJuridiqueSyscohadaAnterieure: true, dateTransformationForme: true },
    });
    // LA FORME DE L'EXERCICE, PAS CELLE DU JOUR (AUSCGIE art. 182 et 183,
    // passe O1a, D3). Une SARL devenue SA en 2027 ne se voit pas réclamer pour
    // 2025 un commissaire « sans condition de taille », et une SA devenue SARL
    // reste signalée pour l'exercice où l'obligation existait. L'exercice n'est
    // relu que si une transformation est déclarée.
    const forme = dossier.dateTransformationForme
      ? formeApplicable(dossier, (await this.exercice(tenantId, exerciceId)).dateFin)
      : dossier.formeJuridiqueSyscohada;
    const tenant = { referentiel: dossier.referentiel, formeJuridiqueSyscohada: forme };
    const filtre = { tenantId, exerciceId, statut: StatutEcriture.VALIDEE };
    // AUSCGIE art. 875 et 880 · le GIE qui émet des obligations doit un
    // commissaire aux comptes. L'émission se lit au solde du compte 161
    // « Emprunts obligataires » de l'exercice, report à-nouveau compris.
    let gieEmetDesObligations: boolean | null = null;
    if (
      tenant.referentiel === Referentiel.SYSCOHADA &&
      tenant.formeJuridiqueSyscohada === FormeJuridiqueSyscohada.GROUPEMENT_INTERET_ECONOMIQUE
    ) {
      const somme = await this.prisma.ligneEcriture.aggregate({
        where: { ecriture: filtre, compte: { tenantId, numero: { startsWith: '161' } } },
        _sum: { debit: true, credit: true },
      });
      gieEmetDesObligations = Math.abs(Number(somme._sum.credit ?? 0) - Number(somme._sum.debit ?? 0)) > 0.005;
    }
    const regle = regleAuditeur(tenant.referentiel, tenant.formeJuridiqueSyscohada, gieEmetDesObligations);

    // Une forme sans règle lue ne mesure RIEN · annoncer un seuil emprunté à
    // une autre forme serait pire que se taire.
    if (regle.genre === 'AUCUNE_REGLE_LUE') {
      return {
        criteres: [],
        franchis: [],
        nonCompares: [],
        obligationDeclenchee: false,
        obligationIndeterminee: false,
        obligationSansSeuil: false,
        regle,
        conversionAppliquee: false,
        source: null,
      };
    }
    // La société anonyme désigne un commissaire aux comptes sans condition de
    // taille : mesurer ses seuils n'aurait aucun sens.
    if (regle.genre === 'TOUJOURS') {
      return {
        criteres: [],
        franchis: [],
        nonCompares: [],
        obligationDeclenchee: false,
        obligationIndeterminee: false,
        obligationSansSeuil: true,
        regle,
        conversionAppliquee: false,
        source: regle.source,
      };
    }

    // LA BALANCE AGRÉGÉE PAR LA BASE, COMPTE PAR COMPTE (audit du serveur du
    // 2026-09-27, F8). La boucle portait sur les LIGNES d'écriture et ajoutait
    // chaque solde de ligne positif : c'était la somme des DÉBITS des classes
    // 1 à 5, pas l'actif. Une caisse qui encaisse et décaisse cent fois
    // comptait cent débits, et le seuil était déclaré franchi par une entité
    // qui ne l'a pas atteint · un signalement faux, le cinquième défaut du
    // § 10 bis. La requête rapatriait en outre toutes les lignes de
    // l'exercice, sans borne (§ 8 bis) ; le regroupement rend une ligne par
    // compte.
    //
    // Livre-journal seul · une écriture au brouillard n'est pas entrée en
    // comptabilité. Le total du bilan lit le SOLDE (report à-nouveau compris,
    // c'est une situation à la clôture) ; les produits lisent les MOUVEMENTS,
    // écritures de clôture exclues, comme `balanceCumulee` · l'écriture de
    // clôture solde la classe 7 d'un exercice clos.
    const [soldesGroupes, mouvementsGroupes] = await Promise.all([
      this.prisma.ligneEcriture.groupBy({
        by: ['compteId'],
        where: { ecriture: filtre },
        _sum: { debit: true, credit: true },
      }),
      this.prisma.ligneEcriture.groupBy({
        by: ['compteId'],
        where: { ecriture: { ...filtre, estGenereeParCloture: false } },
        _sum: { debit: true, credit: true },
      }),
    ]);
    const net = (g: { _sum: { debit: unknown; credit: unknown } }) => Number(g._sum.debit ?? 0) - Number(g._sum.credit ?? 0);
    const idsComptes = [...new Set([...soldesGroupes, ...mouvementsGroupes].map((g) => g.compteId))];
    const comptes = idsComptes.length
      ? await this.prisma.compte.findMany({
          where: { tenantId, id: { in: idsComptes } },
          select: { id: true, numero: true, classe: true, typeCompte: true },
        })
      : [];
    const compteDe = new Map(comptes.map((c) => [c.id, c]));

    const estSyscohada = tenant.referentiel === Referentiel.SYSCOHADA;
    let totalBilan = 0;
    let produits = 0;
    for (const g of soldesGroupes) {
      const compte = compteDe.get(g.compteId);
      // Les comptes de TOTAL agrègent leurs enfants : les compter reviendrait
      // à compter deux fois les mêmes montants.
      if (!compte || compte.typeCompte === TypeCompteDetailTotal.TOTAL) continue;
      // Total du bilan = somme des soldes DÉBITEURS des comptes des classes 1
      // à 5, c'est-à-dire l'actif · approximation assumée et annoncée.
      const solde = net(g);
      if (CLASSES_BILAN.includes(compte.classe) && solde > 0) totalBilan += solde;
    }
    for (const g of mouvementsGroupes) {
      const compte = compteDe.get(g.compteId);
      if (!compte || compte.typeCompte === TypeCompteDetailTotal.TOTAL) continue;
      // LA MESURE DES PRODUITS DIFFÈRE, et c'est le fond de l'affaire.
      // Le SYCEBNL parle de RESSOURCES annuelles, qui embrassent toute la
      // classe 7 (cotisations, dons, subventions, produits financiers).
      // L'AUSCGIE parle de CHIFFRE D'AFFAIRES, qui est le poste XB du compte
      // de résultat, soit les seuls comptes 701 à 707 · dérivés du modèle, pas
      // réécrits. Mesurer la classe 7 entière pour une entreprise gonflerait
      // son chiffre d'affaires de ses produits financiers et de ses reprises,
      // et la déclarerait au-dessus d'un seuil qu'elle n'a pas franchi.
      if (estSyscohada) {
        if (PREFIXES_CHIFFRE_AFFAIRES_SYSCOHADA.some((p) => compte.numero.startsWith(p))) produits -= net(g);
      } else if (compte.classe === ClasseCompte.CLASSE_7) {
        produits -= net(g);
      }
    }
    totalBilan = Math.round(totalBilan * 100) / 100;
    produits = Math.round(produits * 100) / 100;

    // L'équivalent du seuil en francs congolais, et le texte qui le fixe.
    const equivalent =
      regle.genre === 'ALTERNATIF'
        ? "l'article 19 compare à « l'équivalent dans l'unité monétaire ayant cours légal dans l'État partie », que " +
          'le dossier ne déclare pas'
        : "l'article 906 de l'AUSCGIE fixe l'équivalent à la parité du franc CFA en vigueur le jour de l'adoption de " +
          "l'Acte uniforme (30 janvier 2014), arrondie à l'unité supérieure, et cette parité n'est pas au corpus lu";
    const nonCompare = (libelle: string, valeur: number, seuil: number): CritereAuditeur => ({
      critere: libelle,
      valeur,
      seuil,
      mesure: false,
      franchi: false,
      detail:
        `${libelle} de ${valeur.toLocaleString('fr-FR')} FC (monnaie de tenue) · seuil ` +
        `${seuil.toLocaleString('fr-FR')} FCFA · non comparé : ${equivalent}.`,
    });
    const criteres: CritereAuditeur[] = [
      nonCompare('Total du bilan', totalBilan, regle.seuilBilan),
      nonCompare(regle.libelleProduits, produits, regle.seuilProduits),
      {
        critere: 'Effectif permanent',
        valeur: effectifPermanent,
        seuil: regle.seuilEffectif,
        // L'effectif n'a pas d'unité monétaire · il se compare tel quel.
        mesure: true,
        franchi: effectifPermanent > regle.seuilEffectif,
        detail:
          effectifPermanent > 0
            ? `${effectifPermanent} personnes employées à titre permanent · seuil ${regle.seuilEffectif}`
            : "Effectif non renseigné · à saisir dans Structure > Paramètres du dossier pour que ce critère soit mesuré",
      },
    ];

    const franchis = criteres.filter((c) => c.franchi);
    // LE NOMBRE DE CRITÈRES REQUIS EST LE POINT. Le SYCEBNL en demande UN
    // (« l'un des trois »), l'AUSCGIE en demande DEUX sur trois. Alerter une
    // entreprise sur un seul critère l'aurait envoyée chercher un commissaire
    // aux comptes qu'elle n'est pas tenue de désigner.
    const requis = regle.genre === 'ALTERNATIF' ? 1 : 2;
    const obligationDeclenchee = franchis.length >= requis;
    // Convention de lecture d'OmegaX, et elle ne conclut rien : le verdict est
    // dit indéterminé quand les critères non comparés POURRAIENT le faire
    // basculer, et seulement pour ceux dont le montant dépasse le nombre du
    // seuil · ce sont les dossiers que l'ancienne comparaison brute alertait.
    const nonCompares = criteres.filter((c) => !c.mesure && c.valeur > c.seuil);
    const obligationIndeterminee = !obligationDeclenchee && franchis.length + nonCompares.length >= requis;

    return {
      criteres,
      franchis,
      nonCompares,
      obligationDeclenchee,
      obligationIndeterminee,
      obligationSansSeuil: false,
      regle,
      // Le seuil est légalement exprimé en FCFA et n'est PAS converti.
      conversionAppliquee: false,
      source: regle.source,
    };
  }

  /**
   * LIGNE A13 · deux contrôles, jamais deux refus (relevé CPCC C9 et C10).
   * Chacun ne lit la base que s'il peut avoir quelque chose à dire · un
   * exercice hors du texte, une clôture pas encore passée, aucun compte de
   * banque mouvementé ou aucun journal écrit ne coûtent aucune requête.
   */
  private async controlesBanqueEtClotureInformatique(
    tenantId: string,
    ex: { statut: StatutExercice; dateDebut: Date; dateFin: Date },
    referentiel: Referentiel,
    parcours: { journauxEcrits: Map<string, JournalEcrit>; comptesBancaires: Map<string, CompteBancaireMouvemente> },
    maintenant: number,
  ): Promise<AnomalieControle[]> {
    const anomalies: AnomalieControle[] = [];
    if (!texteEnVigueurPourLExercice(referentiel, ex.dateDebut)) return anomalies;
    const aujourdhui = jourDeKinshasa(new Date(maintenant));

    // --- 32. Banque à rapprocher avant l'arrêté des comptes -----------------
    const comptes = [...parcours.comptesBancaires.values()];
    if (comptes.length > 0 && comptesBancairesSansRapprochement(comptes, new Map(), ex.dateFin, aujourdhui).length > 0) {
      const ids = comptes.map((c) => c.compteId);
      // La date du DERNIER relevé clos de chaque compte, demandée à la base
      // (une ligne par compte, première relecture, g), et l'en cours (un au
      // plus par compte, règle du module).
      const [dernieres, enCours] = await Promise.all([
        this.prisma.rapprochementBancaire.groupBy({
          by: ['compteId'],
          where: { tenantId, compteId: { in: ids }, statut: 'CLOTURE' },
          _max: { dateReleve: true },
        }),
        this.prisma.rapprochementBancaire.findMany({
          where: { tenantId, compteId: { in: ids }, statut: 'EN_COURS' },
          select: { compteId: true, dateReleve: true },
        }),
      ]);
      const etats = new Map<string, EtatRapprochementCompte>();
      const etat = (id: string) => {
        const e = etats.get(id) ?? { dernierClos: null, soldeDernierClos: null, enCours: null };
        etats.set(id, e);
        return e;
      };
      for (const g of dernieres) {
        if (g._max.dateReleve) etat(g.compteId).dernierClos = g._max.dateReleve;
      }
      for (const r of enCours) etat(r.compteId).enCours = r.dateReleve;
      // Le solde du dernier relevé clos ne sert qu'au compte FERMÉ (B1) · il
      // n'est lu que pour les comptes encore signalés et nuls aux livres, une
      // ligne par compte et par date (le plus récemment clos, si deux relevés
      // portent la même date).
      const aVerifier: { compteId: string; dateReleve: Date }[] = [];
      for (const c of comptes) {
        const e = etats.get(c.compteId);
        if (Math.abs(c.soldeCloture) < 0.005 && e && e.dernierClos !== null && !releveCouvreLaCloture(e, ex.dateFin)) {
          aVerifier.push({ compteId: c.compteId, dateReleve: e.dernierClos });
        }
      }
      if (aVerifier.length > 0) {
        const soldes = await this.prisma.rapprochementBancaire.findMany({
          where: { tenantId, statut: 'CLOTURE', OR: aVerifier },
          orderBy: { clotureAt: 'desc' },
          select: { compteId: true, soldeReleve: true },
        });
        for (const r of soldes) {
          const e = etat(r.compteId);
          if (e.soldeDernierClos === null) e.soldeDernierClos = Number(r.soldeReleve);
        }
      }
      const sans = comptesBancairesSansRapprochement(comptes, etats, ex.dateFin, aujourdhui);
      if (sans.length > 0) {
        const cloture = ex.dateFin.toISOString().slice(0, 10);
        anomalies.push({
          code: 'BANQUE_SANS_RAPPROCHEMENT_A_LA_CLOTURE',
          gravite: 'AVERTISSEMENT',
          libelle: "Compte de banque à rapprocher avant l'arrêté des comptes",
          consequence:
            '« Le solde qui ressort des livres comptables doit être rapproché du solde du compte tenu par la banque » (' +
            sourceFicheCompte52(referentiel) +
            `), au ${cloture}, jour de la clôture où l'entité « doit procéder au recensement et à l'évaluation de ses biens, ` +
            'créances et dettes » (art. 42). Les états financiers sont arrêtés au plus tard dans les quatre mois qui suivent la ' +
            "clôture (AUDCIF art. 23) · tant qu'aucun rapprochement clos n'atteint ce jour, le solde porté au bilan n'est pas confronté " +
            'au relevé, et une différence qui ne tient pas à un chevauchement de dates reste sans écriture de redressement.',
          action:
            'À rapprocher avant l’arrêté des comptes · ouvrez puis clôturez, dans Traitement > Tiers et trésorerie > Rapprochement ' +
            'bancaire, le rapprochement d’un relevé daté au plus tôt de la clôture, et passez les écritures de redressement des ' +
            'différences qui ne tiennent pas aux dates. Un compte fermé en cours d’exercice est couvert par son dernier relevé à ' +
            'solde nul, daté au plus tôt de sa dernière opération, quand son solde comptable est nul. Pour un compte en devises, ' +
            'le solde du relevé se compare en francs au cours de clôture, une fois passée la réévaluation de l’exercice ' +
            '(Traitement > Clôture > Devises et réévaluation).',
          occurrences: sans,
        });
      }
    }

    // --- 33. Période restée ouverte au-delà de la clôture informatique ------
    if (
      ex.statut !== StatutExercice.CLOTURE &&
      parcours.journauxEcrits.size > 0 &&
      premiereEcheanceDepassee(ex.dateDebut, ex.dateFin, aujourdhui)
    ) {
      const clotures = await this.prisma.cloture.findMany({
        where: {
          tenantId,
          annuleeAt: null,
          // La PARTIELLE est réversible · elle n'écarte aucune insertion.
          granularite: { in: [GranulariteCloture.PERIODE, GranulariteCloture.TOTALE] },
          // Aucune borne HAUTE (seconde relecture, B-β) · une clôture de
          // période ou totale posée dans N+1 fige tout N (`gel-cloture.ts`
          // lit toutes les clôtures du dossier) ; `periodeOuverte` rend null
          // dès qu'un jour figé atteint la fin de l'exercice.
          dateLimite: { gte: ex.dateDebut },
        },
        select: { granularite: true, journalId: true, dateLimite: true },
      });
      const enRetard = journauxEnRetardDeClotureInformatique(
        [...parcours.journauxEcrits.values()],
        clotures,
        ex.dateDebut,
        ex.dateFin,
        aujourdhui,
      );
      if (enRetard.length > 0) {
        anomalies.push({
          code: 'CLOTURE_INFORMATIQUE_EN_RETARD',
          gravite: 'AVERTISSEMENT',
          libelle: 'Période restée ouverte au-delà de la clôture informatique',
          consequence:
            '« Une procédure périodique dite « clôture informatique » au moins trimestrielle est prévue, mise en œuvre au plus tard ' +
            'à la fin du trimestre qui suit la fin de chaque période » (' +
            sourceClotureInformatique(referentiel) +
            "). Tant qu'elle n'est pas posée, une écriture peut encore s'insérer dans une période qui aurait dû être figée.",
          action:
            "L'administrateur du dossier pose une clôture de période, tous journaux, dans Traitement > Clôture > Fin " +
            "d'exercice…, jusqu'au dernier jour qu'il tient pour arrêté. Elle est définitive et fige aussi, jusqu'à sa date, le " +
            'lettrage et la ventilation analytique. Une clôture partielle, réversible, ne fige pas la chronologie. Une clôture ' +
            "faite dans un autre logiciel avant la reprise du dossier n'est pas connue d'OmegaX · posez-la ici à la même date.",
          occurrences: enRetard,
        });
      }
    }
    return anomalies;
  }

  /**
   * LE PARCOURS DES ÉCRITURES DE L'EXERCICE, PAR TRANCHES (audit final F185).
   *
   * Chaque prédicat est celui que le contrôle appliquait à la liste entière ·
   * seul le chemin de lecture a changé. Une collecte garde ses deux cents
   * premières écritures et compte les autres ; les soldes de tiers et les
   * comptes de classe 9 se cumulent au passage. La mémoire ne dépend plus du
   * nombre d'écritures, seulement de ce que les contrôles rendent.
   */
  private async parcourirEcrituresControlees(
    tenantId: string,
    exerciceId: string,
    ex: { statut: StatutExercice; dateFin: Date },
    tenant: {
      referentiel: Referentiel;
      systemeComptableSyscohada: SystemeComptableSyscohada | null;
      jeuEtatsFinanciersSycebnl: JeuEtatsFinanciersSycebnl;
      methodeCotisations: unknown;
    },
    maintenant: number,
  ) {
    const desequilibrees = new Collecte<EcritureControlee>(PLAFOND_OCCURRENCES);
    const sansReference = new Collecte<EcritureControlee>(PLAFOND_OCCURRENCES);
    const brouillardEnRetard = new Collecte<EcritureControlee>(PLAFOND_OCCURRENCES);
    const anciennes = new Collecte<EcritureControlee>(PLAFOND_OCCURRENCES);
    const chargesDirectes = new Collecte<EcritureControlee>(PLAFOND_OCCURRENCES);
    const horsModele = new Collecte<EcritureControlee>(PLAFOND_OCCURRENCES);
    const cotisationsMouvementees = new Collecte<EcritureControlee>(PLAFOND_OCCURRENCES);
    const validesParLeurAuteur = new Collecte<EcritureControlee>(PLAFOND_OCCURRENCES);
    const soldesTiers = new Map<string, number>();
    // A7 ter, mineur 1 · les comptes clients d'ORIGINE d'une créance reclassée en vigueur.
    const comptesCreanceReclassee = new Set<string>();
    const comptesClasse9 = new Set<string>();
    // Les pièces entrées avant le refus d'entrée (classe-9-equilibree.ts) ·
    // la saisie les refuse désormais, les données anciennes restent.
    const classe9HorsEquilibre = new Collecte<EcritureControlee>(PLAFOND_OCCURRENCES);
    // Ligne A13 · relevés au passage, sans seconde lecture des écritures.
    const journauxEcrits = new Map<string, JournalEcrit>();
    const comptesBancaires = new Map<string, CompteBancaireMouvemente>();
    // Ligne A6 bis, B2 · une ligne de l'exercice dans un groupe de lettrage.
    let lettrageVu = false;

    const seuilAnciennete = new Date(ex.dateFin);
    seuilAnciennete.setDate(seuilAnciennete.getDate() - ControlesService.JOURS_ANCIENNETE_TIERS);
    const auSystemeMinimal = estAuSystemeMinimal(tenant);
    const cotisationsAPreciser =
      tenant.referentiel === Referentiel.SYCEBNL &&
      tenant.jeuEtatsFinanciersSycebnl === JeuEtatsFinanciersSycebnl.ASSOCIATIONS_ORDRES_PROFESSIONNELS &&
      !tenant.methodeCotisations;

    await lireParLots(
      (curseur) =>
        this.prisma.ecriture.findMany({
          where: { tenantId, exerciceId },
          select: SELECT_ECRITURE_CONTROLEE,
          ...pageApres(curseur, LOT_ECRITURES),
        }),
      (e) => {
        let debit = 0;
        let credit = 0;
        // L'à-nouveau PROVISOIRE n'entre jamais au livre-journal (`valider`
        // le refuse, point 11) et se remplace à chaque relance · il n'est pas
        // une écriture que la clôture informatique aurait à figer, et le
        // compter ferait réclamer une clôture au journal d'à-nouveau d'un
        // dossier qui n'y a rien saisi (première relecture, i).
        if (!e.estANouveauProvisoire && !journauxEcrits.has(e.journalId)) {
          journauxEcrits.set(e.journalId, { journalId: e.journalId, code: e.journal.code });
        }
        for (const l of e.lignes) {
          debit += Number(l.debit);
          credit += Number(l.credit);
          if (l.lettrageId) lettrageVu = true;
          const n = l.compte.numero;
          if (estCompteBancaireARapprocher(n)) {
            // Solde comptable à la clôture (lignes de l'exercice, à-nouveau
            // compris, tous statuts) et date de la dernière ligne · les deux
            // faits du compte fermé en cours d'exercice (première relecture,
            // B1). Le solde se tient en CENTIMES, sans quoi mille lignes
            // laissent un reste flottant qu'aucun relevé nul ne couvre.
            const centimes = Math.round(Number(l.debit) * 100) - Math.round(Number(l.credit) * 100);
            // Une ligne de CONVERSION n'est pas une opération de banque
            // (seconde relecture, B-α) · elle compte au solde, jamais à la
            // date de la dernière ligne, sans quoi l'écart du 31/12 d'un
            // compte en devises fermé en juin le rendait non couvert.
            const mouvementDeBanque = !estEcritureDeConversion(e);
            const vu = comptesBancaires.get(l.compte.id);
            if (vu === undefined) {
              comptesBancaires.set(l.compte.id, {
                compteId: l.compte.id,
                numero: n,
                intitule: l.compte.intitule,
                soldeCloture: centimes,
                derniereLigne: mouvementDeBanque ? e.date : null,
              });
            } else {
              vu.soldeCloture += centimes;
              if (mouvementDeBanque && (vu.derniereLigne === null || e.date.getTime() > vu.derniereLigne.getTime())) {
                vu.derniereLigne = e.date;
              }
            }
          }
          if (n.startsWith('40') || n.startsWith('41')) {
            soldesTiers.set(n, (soldesTiers.get(n) ?? 0) + Number(l.debit) - Number(l.credit));
            if ((l.compte.creancesDouteusesSource?.length ?? 0) > 0) comptesCreanceReclassee.add(n);
          }
          // Le report à-nouveau n'est pas un mouvement (passe R5-C2) · les 90
          // et 91 sont semés en report SOLDE, et le signalement se rallumait à
          // chaque exercice qui suivait des contributions passées.
          if (n.startsWith('9') && !e.estGenereeParCloture) comptesClasse9.add(n);
        }
        if (Math.abs(debit - credit) > 0.005) desequilibrees.ajouter(e);
        if (
          ecartClasse9(e.lignes.map((l) => ({ numero: l.compte.numero, debit: Number(l.debit), credit: Number(l.credit) }))) !== 0
        ) {
          classe9HorsEquilibre.ajouter(e);
        }

        if (!e.reference?.trim() && !['AN', 'OD'].includes(e.journal.code) && e.lignes.length > 0) {
          sansReference.ajouter(e);
        }

        if (e.statut === StatutEcriture.BROUILLARD && enRetardDeCentralisation(e, ex.statut, tenant.referentiel, maintenant)) {
          brouillardEnRetard.ajouter(e);
        }

        if (
          e.date < seuilAnciennete &&
          // B2 · la créance douteuse se suit dans son module, jamais ici.
          !estTenueParUneCreanceDouteuse(e) &&
          e.lignes.some(
            (l) =>
              !l.lettre &&
              (l.compte.numero.startsWith('40') || l.compte.numero.startsWith('41')) &&
              Math.abs(Number(l.debit) - Number(l.credit)) > 0.005,
          )
        ) {
          anciennes.ajouter(e);
        }

        if (!auSystemeMinimal) {
          const aUneCharge = e.lignes.some(
            (l) =>
              (l.compte.numero.startsWith('6') || l.compte.numero.startsWith('8')) &&
              Number(l.debit) - Number(l.credit) > 0.005,
          );
          const aUneTresorerieCreditee = e.lignes.some(
            (l) =>
              l.compte.numero.startsWith('5') &&
              !l.compte.numero.startsWith('59') &&
              Number(l.credit) - Number(l.debit) > 0.005,
          );
          // La présence d'un tiers dans la MÊME écriture suffit à l'absoudre :
          // c'est le cas d'une écriture composée (facture + règlement partiel)
          // ou d'une retenue à la source, où le tiers est bien nommé.
          //
          // SAUF LA TVA RÉCUPÉRABLE (passe R1-B3). Le 445 n'est pas le tiers de
          // l'achat · la fiche du compte 40, dans les deux textes, le range du
          // côté de la charge, dans la facture portée au crédit du fournisseur
          // (« par le débit des comptes concernés de la classe 6 […] ; par le
          // débit du compte 445 »). Un achat D 60x + D 4452 / C 521 était
          // absous, alors que c'est la forme ordinaire de l'écriture visée.
          const aUnTiers = e.lignes.some((l) => l.compte.numero.startsWith('4') && !l.compte.numero.startsWith('445'));
          if (aUneCharge && aUneTresorerieCreditee && !aUnTiers) chargesDirectes.ajouter(e);
        } else if (
          !e.estGenereeParCloture &&
          e.lignes.some((l) => RACINES_SANS_POSTE_SMT.some((r) => l.compte.numero.startsWith(r)))
        ) {
          horsModele.ajouter(e);
        }

        if (
          cotisationsAPreciser &&
          e.lignes.some((l) => l.compte.numero.startsWith('701') || l.compte.numero.startsWith('103'))
        ) {
          cotisationsMouvementees.ajouter(e);
        }

        if (
          e.statut === StatutEcriture.VALIDEE &&
          e.valideeBy !== null &&
          e.createdBy === e.valideeBy &&
          // Personne ne « saisit » un report à nouveau calculé à partir de soldes
          // déjà validés · les textes raisonnent sur des données « entrée[s] »
          // par une personne (art. 22, 1°).
          !e.estGenereeParCloture &&
          // Un second regard nominatif a été porté hors logiciel : la coïncidence
          // d'identité est alors expliquée, et la signaler serait du bruit.
          e.secondRegardNom === null
        ) {
          validesParLeurAuteur.ajouter(e);
        }
      },
      LOT_ECRITURES,
    );

    return {
      desequilibrees,
      sansReference,
      brouillardEnRetard,
      anciennes,
      chargesDirectes,
      horsModele,
      cotisationsMouvementees,
      validesParLeurAuteur,
      soldesTiers,
      comptesCreanceReclassee,
      comptesClasse9,
      classe9HorsEquilibre,
      journauxEcrits,
      lettrageVu,
      // Le solde a été tenu en centimes · il repart ici en francs.
      comptesBancaires: new Map(
        [...comptesBancaires].map(([id, c]) => [id, { ...c, soldeCloture: c.soldeCloture / 100 }]),
      ),
    };
  }

  async analyser(tenantId: string, exerciceId: string): Promise<RapportControles> {
    const ex = await this.exercice(tenantId, exerciceId);
    // Le jeu d'états commande un contrôle : le S.M.T est une comptabilité de
    // trésorerie, où le passage par un tiers n'a pas lieu d'être exigé.
    const dossier = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    // LA FORME DE L'EXERCICE EXAMINÉ (AUSCGIE art. 182 et 183, passe O1a, D3) ·
    // tout contrôle qui dépend de la forme la lit ici, jamais la forme du jour.
    // Sans transformation déclarée, c'est la forme du dossier.
    const tenant = { ...dossier, formeJuridiqueSyscohada: formeApplicable(dossier, ex.dateFin) };
    const anomalies: AnomalieControle[] = [];

    // --- 1. Caisse créditrice ------------------------------------------------
    const caisses = await this.controleCaisse(tenantId, exerciceId);
    const caissesNegatives = caisses.filter((c) => c.nombreJoursNegatifs > 0);
    if (caissesNegatives.length > 0) {
      anomalies.push({
        code: 'CAISSE_CREDITRICE',
        gravite: 'BLOQUANT',
        libelle: 'Caisse créditrice',
        consequence:
          "Une caisse ne peut pas être créditrice : on aurait décaissé de l'argent qu'on n'avait pas. C'est une erreur de saisie ou une sortie non justifiée.",
        action:
          "Enregistrez les approvisionnements de caisse AVANT les dépenses du même jour, ou retrouvez la pièce manquante.",
        occurrences: caissesNegatives.map((c) => ({
          reference: `${c.numero} ${c.intitule}`,
          detail: `Créditrice ${c.nombreJoursNegatifs} jour(s), pour la première fois le ${c.premierJourNegatif}`,
          date: c.premierJourNegatif ?? undefined,
          montant: Math.min(...c.journees.filter((j) => j.negatif).map((j) => j.soldeFinJournee)),
        })),
      });
    }

    // --- 1 bis. Instrument de monnaie électronique créditeur -----------------
    //
    // Les deux textes l'écrivent chacun à sa fiche 55, et c'est lui que le
    // message cite. La « présomption d'irrégularité » n'est PAS reprise · le
    // texte ne la pose que pour la caisse. D'où AVERTISSEMENT et non BLOQUANT.
    const electroniques = (await this.controleMonnaieElectronique(tenantId, exerciceId)).filter(
      (c) => c.nombreJoursNegatifs > 0,
    );
    if (electroniques.length > 0) {
      anomalies.push({
        code: 'MONNAIE_ELECTRONIQUE_CREDITRICE',
        gravite: 'AVERTISSEMENT',
        libelle: 'Instrument de monnaie électronique créditeur',
        consequence:
          '« Le solde du compte instruments monétaires électroniques ne doit être que débiteur ou nul » (' +
          (tenant.referentiel === Referentiel.SYCEBNL
            ? 'SYCEBNL, Partie 2 ch. 3, compte 55'
            : 'AUDCIF, Titre VII, compte 55') +
          '). Au bilan, un solde créditeur diminue la trésorerie-actif sans ligne qui le montre.',
        action:
          'Enregistrez le chargement AVANT les paiements du même jour, ou retrouvez le chargement manquant.',
        occurrences: electroniques.map((c) => ({
          reference: `${c.numero} ${c.intitule}`,
          detail: `Créditeur ${c.nombreJoursNegatifs} jour(s), pour la première fois le ${c.premierJourNegatif}`,
          date: c.premierJourNegatif ?? undefined,
          montant: Math.min(...c.journees.filter((j) => j.negatif).map((j) => j.soldeFinJournee)),
        })),
      });
    }

    // --- 2. Écritures déséquilibrées ----------------------------------------
    // UNE SEULE LECTURE, PAR TRANCHES (audit final F185) · la batterie
    // chargeait toutes les écritures de l'exercice avec leurs lignes, ce que
    // le banc d'un million de lignes a montré mortel. Chaque contrôle qui les
    // lisait reçoit désormais sa collecte, remplie au passage.
    const maintenant = Date.now();
    const parcours = await this.parcourirEcrituresControlees(tenantId, exerciceId, ex, tenant, maintenant);
    const desequilibrees = parcours.desequilibrees.elements;
    if (desequilibrees.length > 0) {
      anomalies.push({
        code: 'ECRITURE_DESEQUILIBREE',
        gravite: 'BLOQUANT',
        libelle: 'Écriture déséquilibrée',
        consequence: "Une écriture dont le débit ne vaut pas le crédit fausse la balance et tous les états qui en dépendent.",
        action: "Reprenez la pièce dans la saisie. Si elle est validée, corrigez-la par inscription en négatif.",
        occurrences: desequilibrees.map((e) => ({
          reference: `${e.journal.code} n° ${e.numeroPiece ?? '·'}`,
          detail: e.libelle,
          date: e.date.toISOString().slice(0, 10),
          montant:
            e.lignes.reduce((s, l) => s + Number(l.debit), 0) - e.lignes.reduce((s, l) => s + Number(l.credit), 0),
        })),
        ...nombreSiTronque(parcours.desequilibrees),
      });
    }

    // --- 3. Écritures sans pièce justificative -------------------------------
    const sansReference = parcours.sansReference.elements;
    if (sansReference.length > 0) {
      anomalies.push({
        code: 'SANS_PIECE',
        gravite: 'AVERTISSEMENT',
        libelle: 'Écriture sans référence de pièce justificative',
        consequence:
          "Un auditeur remonte de l'écriture à sa pièce par cette référence. Sans elle, la justification repose sur la mémoire.",
        action: 'Renseignez le numéro de facture, de reçu ou de chèque sur la pièce.',
        occurrences: sansReference.map((e) => ({
          reference: `${e.journal.code} n° ${e.numeroPiece ?? '·'}`,
          detail: e.libelle,
          date: e.date.toISOString().slice(0, 10),
        })),
        ...nombreSiTronque(parcours.sansReference),
      });
    }

    // --- 4. Brouillard en retard de centralisation ---------------------------
    // UN CONTRÔLE QUI PRESCRIT UNE ACTION IMPOSSIBLE FABRIQUE UNE ANOMALIE
    // (§ 10 bis, audit du serveur F12) · le brouillard que personne ne peut
    // valider n'est pas réclamé. La règle vit dans centralisation-brouillard.ts,
    // que l'état du brouillard et le planning appellent aussi (audit final F77).
    const brouillardEnRetard = parcours.brouillardEnRetard.elements;
    if (brouillardEnRetard.length > 0) {
      const estSycebnlCentralisation = tenant.referentiel === Referentiel.SYCEBNL;
      anomalies.push({
        code: 'BROUILLARD_EN_RETARD',
        gravite: 'AVERTISSEMENT',
        libelle: estSycebnlCentralisation
          ? 'Brouillard non centralisé depuis plus de sept jours'
          : "Brouillard non centralisé depuis plus d'un mois",
        consequence: estSycebnlCentralisation
          ? "Le SYCEBNL veut les journaux auxiliaires centralisés au moins chaque semaine dans le journal ou le grand-livre (Partie 2, ch. 2). Au-delà, ce n'est plus un document de travail."
          : "L'AUDCIF veut les journaux auxiliaires centralisés au moins une fois par mois (art. 19). Au-delà, ce n'est plus un document de travail.",
        action: 'Relisez ces écritures dans État → Brouillard et validez-les.',
        occurrences: brouillardEnRetard.map((e) => ({
          reference: `${e.journal.code} n° ${e.numeroPiece ?? '·'}`,
          detail: `${e.libelle} · saisie il y a ${ancienneteJours(e.createdAt, maintenant)} jours`,
          date: e.date.toISOString().slice(0, 10),
        })),
        ...nombreSiTronque(parcours.brouillardEnRetard),
      });
    }

    // --- 5. Comptes de tiers au solde inversé --------------------------------
    // Intitulé officiel de la division 41 · « Clients et comptes rattachés »
    // (SYSCOHADA) ou « Adhérents, clients-usagers et comptes rattachés »
    // (SYCEBNL, Partie 2 ch. 3, COMPTE 41).
    const qualite41 = tenant.referentiel === Referentiel.SYCEBNL ? 'adhérent ou client-usager' : 'client';
    const qualite41Capitale = tenant.referentiel === Referentiel.SYCEBNL ? 'Adhérent / client-usager' : 'Client';
    const soldesTiers = parcours.soldesTiers;
    // 409 « Fournisseurs débiteurs » et 419 « Clients créditeurs » (« Adhérents,
    // clients-usagers créditeurs » au SYCEBNL) portent des AVANCES : leur sens
    // est inversé par construction, dans les deux plans, et toutes leurs
    // subdivisions suivent · 4091 avances et acomptes versés, 4092 groupe,
    // 4093 sous-traitants, 4094 emballages et matériels à rendre, 4098 avoirs
    // à obtenir ; en face 4191 avances et acomptes reçus, 4192 groupe, 4194
    // emballages consignés, 4198 avoirs à accorder. Les signaler était une
    // fausse alerte systématique, sur tous les dossiers qui reçoivent ou
    // versent un acompte · et une fausse alerte répétée apprend à ignorer le
    // contrôle, ce qui coûte plus qu'elle ne rapporte.
    //
    // On INVERSE leur sens attendu plutôt que de les exclure : un 409
    // créditeur ou un 419 débiteur reste une anomalie, et l'exclusion pure
    // l'aurait rendue invisible. Ce défaut-là n'est propre à aucun
    // référentiel · les deux plans portent les mêmes racines, il se corrige
    // une seule fois, sans branche.
    const inversesTous = [...soldesTiers.entries()].filter(([numero, solde]) => {
      if (numero.startsWith('409')) return solde < -0.005; // débiteur par nature
      if (numero.startsWith('419')) return solde > 0.005; // créditeur par nature
      return (numero.startsWith('41') && solde < -0.005) || (numero.startsWith('40') && solde > 0.005);
    });
    // A7 ter, mineur 1 · le compte d'ORIGINE d'une créance reclassée en vigueur
    // devenu créditeur a son propre constat · le chemin juste n'est pas le 4191
    // (une avance), c'est le recouvrement du module.
    const origineCreditrice = inversesTous.filter(([numero]) => parcours.comptesCreanceReclassee.has(numero) && !numero.startsWith('419'));
    const inverses = inversesTous.filter(([numero]) => !origineCreditrice.some(([n]) => n === numero));
    if (origineCreditrice.length > 0) {
      anomalies.push({
        // Second tour d'A7 ter, m-d · AVERTISSEMENT · le 416 garde une créance
        // encaissée, et la revue la déprécie · le résultat est faussé.
        code: 'COMPTE_CREANCE_RECLASSEE_CREDITEUR',
        gravite: 'AVERTISSEMENT',
        libelle: 'Compte d’une créance reclassée au 416 devenu créditeur',
        consequence:
          'Le compte du client porte une créance reclassée au 416 (« Créances douteuses ou litigieuses »), et il est créditeur · ' +
          'le plus souvent l’encaissement de cette créance passé sur ce compte (Règlement des tiers ou saisie) au lieu du ' +
          '« Recouvrement » du module. Le 416 garde alors une créance déjà encaissée, et le module la revoit et la déprécie.',
        action:
          'Supprimez ce règlement s’il est au brouillard, ou annulez-le par inscription en négatif s’il est validé, puis passez ' +
          'l’encaissement par « Recouvrement » dans « Créances douteuses ou litigieuses ». S’il s’agit d’une avance sans rapport ' +
          'avec la créance, reclassez-la au 4191 à l’arrêté.',
        occurrences: origineCreditrice.map(([numero, solde]) => ({
          reference: numero,
          detail: `${qualite41Capitale} créditeur, compte d’une créance reclassée au 416`,
          montant: solde,
        })),
      });
    }
    if (inverses.length > 0) {
      anomalies.push({
        code: 'TIERS_SOLDE_INVERSE',
        gravite: 'AVERTISSEMENT',
        libelle: 'Compte de tiers au solde inversé',
        // Le 41 est « Clients et comptes rattachés » en SYSCOHADA et
        // « Adhérents, clients-usagers et comptes rattachés » en SYCEBNL ·
        // parler d'adhérents à une entreprise commerciale n'a pas de sens.
        consequence: `Un ${qualite41} (41) créditeur, ou un fournisseur (40) débiteur, traduit le plus souvent un règlement imputé au mauvais compte, un double encaissement, ou une avance à reclasser. Sur un 409 ou un 419, c'est l'inverse : leur sens normal est celui de l'avance.`,
        // LA NON-COMPENSATION COMMANDE LA CORRECTION · « aucune compensation ne
        // pourrait s'effectuer entre les comptes fournisseurs à solde débiteur
        // et les comptes fournisseurs à solde créditeur : les premiers
        // figurent à l'actif du bilan, les seconds au passif » (plan de
        // comptes, COMPTE 40, dans les deux référentiels ; AUDCIF art. 34 et
        // SYCEBNL art. 16, 5°). Un 401 débiteur laissé tel quel se retrouve
        // au passif en diminution des dettes · c'est la compensation même que
        // le texte interdit. Le message doit donc dire le reclassement, pas
        // seulement inviter à regarder.
        action:
          'Interrogez le compte et lettrez-le : le solde non lettré dira ce qui reste réellement dû. ' +
          "S'il s'agit d'une avance, reclassez-la à l'arrêté (401 débiteur vers 4091 avances versées, " +
          '411 créditeur vers 4191 avances reçues) : la compensation entre un poste d’actif et un poste ' +
          'de passif est interdite, et l’avance doit figurer en clair de son côté du bilan.',
        occurrences: inverses.map(([numero, solde]) => ({
          reference: numero,
          detail: numero.startsWith('409')
            ? 'Fournisseur débiteur (409) au solde créditeur'
            : numero.startsWith('419')
              ? `${qualite41Capitale} créditeur (419) au solde débiteur`
              : numero.startsWith('41')
                ? `${qualite41Capitale} créditeur`
                : 'Fournisseur débiteur',
          montant: solde,
        })),
      });
    }

    // --- 6. Créances et dettes anciennes non lettrées ------------------------
    const anciennes = parcours.anciennes.elements;
    if (anciennes.length > 0) {
      anomalies.push({
        code: 'TIERS_ANCIEN_NON_LETTRE',
        gravite: 'INFORMATION',
        libelle: `Mouvement de tiers non lettré depuis plus de ${ControlesService.JOURS_ANCIENNETE_TIERS} jours`,
        consequence:
          // Le 416 RECLASSE la créance (« Créances clients litigieuses ou
          // douteuses » · « Créances adhérents, clients-usagers litigieuses ou
          // douteuses » au SYCEBNL). La DÉPRÉCIATION se constate au 491, dans
          // les deux plans. Le message envoyait vers un compte qui n'en porte
          // aucune. Le compte de charge n'est pas nommé : son intitulé diffère
          // d'un référentiel à l'autre.
          "Une créance ancienne non lettrée est soit déjà réglée sans que le rapprochement ait été fait, soit douteuse · dans le second cas elle se reclasse au 416 (créances litigieuses ou douteuses) et appelle une dépréciation au 491 (note annexe).",
        action:
          'Lettrez ce qui est réglé ; pour le reste, appréciez le risque et dépréciez si nécessaire. Les pièces d’une créance ' +
          'reclassée au 416 dans « Créances douteuses ou litigieuses » ne sont pas listées, le module les suit ; la facture ' +
          'd’une telle créance, antérieure à son reclassement, est nommée comme telle et ne se lettre pas avec le ' +
          'reclassement (la TVA deviendrait exigible).',
        occurrences: anciennes.map((e) => ({
          reference: `${e.journal.code} n° ${e.numeroPiece ?? '·'}`,
          // B2 · la facture d'une créance reclassée se nomme, au lieu d'un
          // « lettrez ce qui est réglé » qui pousserait au lettrage refusé.
          detail: estFactureDUneCreanceReclassee(e)
            ? `${e.libelle} · compte d'une créance reclassée au 416, à ne pas lettrer avec le reclassement`
            : e.libelle,
          date: e.date.toISOString().slice(0, 10),
        })),
        ...nombreSiTronque(parcours.anciennes),
      });
    }

    // --- 6 bis. Charge imputée directement sur la trésorerie -----------------
    /*
     * LE PASSAGE PAR LE TIERS.
     *
     * Une charge se constate d'abord contre un TIERS (classe 4), et le tiers
     * se solde ensuite contre la TRÉSORERIE (classe 5). Deux écritures, jamais
     * une. Débiter 6221 Loyers par le crédit de 5211 Banque, c'est enregistrer
     * une dépense dont on ne saura jamais à qui elle a été payée.
     *
     * Ce n'est pas une convention de cabinet, c'est le schéma du référentiel.
     * SYCEBNL, Partie 3, ch. 3 :
     *
     *   § 2.2 Engagement des dépenses suivant la nature de charges :
     *     « 6 ou 8  Charges par nature      DÉBIT
     *       4       Comptes de tiers (1)          CRÉDIT »
     *   § 2.4 Paiement des dépenses :
     *     « 4  Compte de tiers   DÉBIT
     *       5  Trésorerie              CRÉDIT »
     *
     * Le guide d'application ne dit pas autre chose, et le dit vingt-deux
     * fois : sur ses 22 applications chiffrées, AUCUNE charge n'est imputée
     * directement sur un compte de trésorerie. L'APPLICATION 12 est la plus
     * probante · l'énoncé précise « Règlement par chèque », donc un paiement
     * immédiat, et le guide passe malgré tout deux écritures (636 par le
     * crédit de 40, puis 40 par le crédit de 52). Même les frais avancés par
     * un bénévole transitent par un tiers (4572, APPLICATION 17).
     *
     * Le fondement est le postulat de la comptabilité d'engagement (Partie 1,
     * ch. 2, § 3.3.1.1.3) : « les effets des transactions sont pris en compte
     * dès que ces transactions se produisent et non pas au moment des
     * encaissements ou paiements ». Le compte de tiers EST le mécanisme qui
     * sépare le moment où la charge naît de celui où elle est payée. Sans lui,
     * la comptabilité redevient une comptabilité de caisse.
     *
     * TROIS RÉSERVES, sans quoi le contrôle crierait à tort.
     *
     * 1. LES PRODUITS NE SONT PAS CONCERNÉS. Le même guide encaisse
     *    directement 57 Caisse par le crédit de 706 Revenus des manifestations,
     *    et 57 + 52 par le crédit de 7041 Dons. Un don reçu en espèces n'a pas
     *    de tiers : personne ne le doit, il est là. La règle est asymétrique et
     *    ce contrôle ne regarde donc que les CHARGES.
     * 2. LE S.M.T EST HORS CHAMP. Le postulat lui-même réserve « les
     *    dispositions spécifiques concernant le Système Minimal de
     *    Trésorerie », qui est une comptabilité de trésorerie par construction
     *    (art. 5 et 6). Y exiger un tiers serait exiger l'inverse du
     *    référentiel.
     * 3. CE N'EST PAS BLOQUANT. Le contrôle avertit, il n'interdit pas. Une
     *    dépense de caisse de 2 000 francs contre un reçu, sur laquelle nommer
     *    un fournisseur n'apporte rien, reste une écriture qu'un comptable peut
     *    vouloir passer. C'est à lui de trancher, pas au logiciel · mais il
     *    doit le voir.
     */
    // Le Système minimal de trésorerie existe DANS LES DEUX RÉFÉRENTIELS, et
    // le test ne regardait que celui du SYCEBNL. Or un dossier SYSCOHADA au
    // SMT garde par défaut `jeuEtatsFinanciersSycebnl` à
    // ASSOCIATIONS_ORDRES_PROFESSIONNELS (valeur par défaut du schéma, sans
    // signification pour lui) : il passait donc le test et subissait un
    // contrôle que l'AUDCIF Titre X écarte, puisque le SMT est une
    // comptabilité de trésorerie par construction.
    const auSystemeMinimal = estAuSystemeMinimal(tenant);
    if (!auSystemeMinimal) {
      const chargesDirectes = parcours.chargesDirectes.elements;

      if (chargesDirectes.length > 0) {
        anomalies.push({
          code: 'CHARGE_SANS_TIERS',
          gravite: 'AVERTISSEMENT',
          libelle: 'Charge imputée directement sur la trésorerie, sans passer par un tiers',
          // Le postulat de la comptabilité d'engagement existe dans les deux
          // référentiels, sous deux références différentes · citer la Partie 3
          // ch. 3 du SYCEBNL (projets de développement) à une entreprise
          // renverrait à un chapitre qui ne la concerne pas.
          consequence:
            'On ne saura jamais à qui cette dépense a été payée : ni relevé fournisseur, ni balance âgée, ni lettrage, ni circularisation possible. La charge et son règlement sont confondus en une seule écriture, ce que le postulat de la comptabilité d’engagement écarte ' +
            (tenant.referentiel === Referentiel.SYCEBNL
              ? '(SYCEBNL, Partie 1, ch. 2).'
              : '(AUDCIF, Titre V · cadre conceptuel).'),
          action:
            'Passez deux écritures : la charge par le crédit du tiers (compte 40 fournisseur, 42 personnel, 43 organismes sociaux, 44 État selon le cas), puis le règlement par le débit de ce tiers et le crédit de la trésorerie.' +
            (tenant.referentiel === Referentiel.SYCEBNL ? ' C’est le schéma des § 2.2 et 2.4 de la Partie 3, ch. 3.' : ''),
          ...nombreSiTronque(parcours.chargesDirectes),
          occurrences: chargesDirectes.map((e) => ({
            reference: `${e.journal.code} n° ${e.numeroPiece ?? '·'}`,
            detail: `${e.libelle} · ${e.lignes
              .filter((l) => l.compte.numero.startsWith('6') || l.compte.numero.startsWith('8'))
              .map((l) => l.compte.numero)
              .join(', ')} soldé(s) directement en trésorerie`,
            montant: e.lignes
              .filter((l) => l.compte.numero.startsWith('6') || l.compte.numero.startsWith('8'))
              .reduce((s2, l) => s2 + Number(l.debit) - Number(l.credit), 0),
            date: e.date.toISOString().slice(0, 10),
          })),
        });
      }
    }

    // --- 6 ter. Système minimal · un compte que son modèle ne présente pas --
    // Les modèles SMT des deux textes n'ouvrent aucun poste de provision
    // réglementée (15), de provision pour risques (19) ni de dépréciation
    // d'immobilisation (29) · SYCEBNL Partie 4 ch. 4 (bilan GA à HZ), AUDCIF
    // Titre X ch. 2. OmegaX refuse déjà de les PROPOSER (systeme-minimal.ts) ;
    // une écriture saisie à la main, elle, passe, et le montant finit sous un
    // poste qui n'est pas le sien. On signale, on ne bloque pas · même parti
    // que CHARGE_SANS_TIERS. Les écritures de clôture sont hors champ, elles
    // reportent un solde et n'en créent pas.
    if (auSystemeMinimal) {
      const horsModele = parcours.horsModele.elements;
      if (horsModele.length > 0) {
        anomalies.push({
          code: 'SMT_COMPTE_SANS_POSTE',
          gravite: 'AVERTISSEMENT',
          libelle: 'Provision ou dépréciation dans un dossier au Système minimal de trésorerie',
          consequence:
            'Le modèle d’états du Système minimal de trésorerie n’a aucun poste pour une provision réglementée (15), ' +
            'une provision pour risques (19) ou une dépréciation d’immobilisation (29) ' +
            (tenant.referentiel === Referentiel.SYCEBNL
              ? '(SYCEBNL, Partie 4 ch. 4, bilan GA à HZ).'
              : '(AUDCIF, Titre X ch. 2).') +
            ' Le montant sera présenté sous un poste qui n’est pas le sien.',
          action:
            'Vérifiez que le dossier relève bien du Système minimal de trésorerie. Si oui, contre-passez ces écritures ; sinon, le dossier doit tenir le Système normal.',
          ...nombreSiTronque(parcours.horsModele),
          occurrences: horsModele.map((e) => {
            const lignes = e.lignes.filter((l) => RACINES_SANS_POSTE_SMT.some((r) => l.compte.numero.startsWith(r)));
            return {
              reference: `${e.journal.code} n° ${e.numeroPiece ?? '·'}`,
              detail: `${e.libelle} · ${lignes.map((l) => l.compte.numero).join(', ')}`,
              montant: lignes.reduce((s2, l) => s2 + Number(l.credit) - Number(l.debit), 0),
              date: e.date.toISOString().slice(0, 10),
            };
          }),
        });
      }
    }

    // --- 6 bis. Méthode de comptabilisation des cotisations non précisée ----
    // Cadre conceptuel SYCEBNL § 5.4.2.1 : « Le fait générateur de la
    // comptabilisation des cotisations et du droit d'entrée est l'appel [...]
    // Toutefois, si l'entité ne peut justifier d'un droit d'agir en
    // recouvrement, [...] lors de leur encaissement effectif », et
    // « L'entité doit préciser dans les notes annexes, la méthode retenue ».
    //
    // Le contrôle ne se déclenche QUE si le dossier a mouvementé des
    // cotisations ou un droit d'entrée : une association qui n'en appelle pas
    // n'a rien à préciser, et un contrôle qui crie sans objet finit ignoré.
    if (
      tenant.referentiel === Referentiel.SYCEBNL &&
      tenant.jeuEtatsFinanciersSycebnl === JeuEtatsFinanciersSycebnl.ASSOCIATIONS_ORDRES_PROFESSIONNELS &&
      !tenant.methodeCotisations
    ) {
      const mouvementees = parcours.cotisationsMouvementees.elements;
      if (mouvementees.length > 0) {
        anomalies.push({
          code: 'METHODE_COTISATIONS_NON_PRECISEE',
          gravite: 'AVERTISSEMENT',
          libelle: "Méthode de comptabilisation des cotisations et du droit d'entrée non précisée",
          consequence:
            "Le cadre conceptuel (§ 5.4.2.1) impose de préciser en notes annexes la méthode retenue, et " +
            "conditionne l'appel au fait que l'entité puisse justifier d'un droit d'agir en recouvrement. " +
            'Sans ce choix, rien ne dit si les créances portées au 411 Adhérents sont recouvrables, et la ' +
            'mention obligatoire manque à la liasse.',
          action:
            'Lire les statuts : ouvrent-ils une voie de recouvrement de la cotisation en cas de défaillance ? ' +
            'Porter la réponse dans Structure > Paramètres du dossier, puis la reprendre dans la note ' +
            '« Règles et méthodes comptables ».',
          ...nombreSiTronque(parcours.cotisationsMouvementees),
          occurrences: mouvementees.map((e) => ({
            reference: `${e.journal.code} n° ${e.numeroPiece ?? '·'}`,
            detail: `${e.libelle} · cotisations ou droit d'entrée mouvementés`,
            date: e.date.toISOString().slice(0, 10),
          })),
        });
      }
    }

    // --- 7. Comptes hors nomenclature (SYCEBNL ou SYSCOHADA selon le dossier) --------------------------------
    // La classe 8 existe (H.A.O.) mais un compte dont le premier chiffre n'est
    // pas cohérent avec sa classe enregistrée signale un plan bricolé, souvent
    // par import.
    const comptes = await this.prisma.compte.findMany({
      where: { tenantId },
      select: { numero: true, intitule: true, classe: true },
    });
    const incoherents = comptes.filter((c) => c.classe !== (`CLASSE_${c.numero[0]}` as ClasseCompte));
    if (incoherents.length > 0) {
      anomalies.push({
        code: 'COMPTE_HORS_NOMENCLATURE',
        gravite: 'AVERTISSEMENT',
        libelle: 'Compte dont la classe ne suit pas son numéro',
        consequence:
          "Les états financiers rangent chaque compte d'après sa classe : un compte mal classé apparaît au mauvais poste du bilan ou du compte de résultat.",
        action: 'Corrigez le numéro ou la classe du compte dans le plan comptable.',
        occurrences: incoherents.map((c) => ({
          reference: c.numero,
          detail: `${c.intitule} · rangé en ${c.classe.replace('CLASSE_', 'classe ')}`,
        })),
      });
    }

    // --- 8. Comptes mouvementés absents des états ---------------------------
    // Un compte de classe 9 mouvementé est normal, mais il ne doit jamais
    // peser sur le résultat : le signaler évite qu'on s'étonne de ne pas le
    // retrouver au compte de résultat.
    //
    // LA CLASSE 9 NE PORTE PAS LA MÊME CHOSE DANS LES DEUX PLANS. En SYCEBNL
    // ce sont les contributions volontaires en nature (90 et 91) et la
    // comptabilité analytique de gestion (92 à 99). En
    // SYSCOHADA ce sont les engagements hors bilan (90 · obtenus au débit des
    // 901-904, accordés au crédit des 905-908, contreparties 911-918) ET la
    // comptabilité analytique de gestion (92 à 99). Annoncer des
    // « contributions volontaires en nature » à une entreprise qui vient
    // d'enregistrer une caution, et la renvoyer à une note annexe absente de
    // sa liasse, était faux deux fois.
    const classe9 = [...parcours.comptesClasse9];
    // AU SYCEBNL AUSSI, LA CLASSE 9 PORTE DEUX CHOSES (passes R5-A4, R5-C2) ·
    // « Classe 9 : comptes des contributions volontaires en nature et comptes
    // de la comptabilité analytique » (Partie 2 ch. 1), les 92 à 99 étant
    // « laissé[s] à l'initiative des entités » (ch. 3, section 9,
    // sous-section 2). Annoncer une contribution volontaire sur un 94 de coûts
    // était le défaut corrigé côté SYSCOHADA, resté entier ici.
    const estSycebnlClasse9 = tenant.referentiel === Referentiel.SYCEBNL;
    // UNE PIÈCE OÙ LES 90 ET 91 NE S'ÉQUILIBRENT PAS ENTRE EUX (passes R1-C7,
    // R5-A3) · la saisie la refuse depuis le 2026-09-30, mais une pièce
    // entrée avant reste. Elle touche le bilan (D 904 / C 571 fait baisser la
    // caisse) sans que l'état nomme la cause, la classe 9 n'étant lue par
    // aucun état. Tant qu'il en existe, dire que la classe 9 « ne modifie ni
    // le résultat ni la situation nette » serait faux sur ce dossier.
    const horsEquilibre9 = parcours.classe9HorsEquilibre.elements;
    if (horsEquilibre9.length > 0) {
      anomalies.push({
        code: 'CLASSE_9_HORS_EQUILIBRE',
        gravite: 'AVERTISSEMENT',
        libelle: 'Écriture dont les comptes 90 et 91 ne s’équilibrent pas entre eux',
        consequence: estSycebnlClasse9
          ? 'Les contributions volontaires en nature « ne doi[vent] pas impacter le bilan et le compte de résultat » ' +
            '(SYCEBNL, Partie 2 ch. 1), les 900 à 904 se débitant par le crédit des 910 à 914 (ch. 3, classe 9). ' +
            'Soldée contre un compte des classes 1 à 8, la pièce déplace ce compte et le bilan cesse de boucler.'
          : 'Les 901 à 904 ont pour contrepartie les 911 à 914, les 905 à 908 les 915 à 918 (AUDCIF, Titre VII, ' +
            'classe 9). Soldée contre un compte des classes 1 à 8, la pièce déplace ce compte et le bilan cesse de boucler.',
        action: 'Corrigez la pièce par inscription en négatif, puis passez la contrepartie sur le compte 91 qui lui répond.',
        occurrences: horsEquilibre9.map((e) => ({
          reference: `${e.journal.code} n° ${e.numeroPiece ?? '·'}`,
          detail: e.libelle,
          date: e.date.toISOString().slice(0, 10),
        })),
        ...nombreSiTronque(parcours.classe9HorsEquilibre),
      });
    }
    const reserveHorsEquilibre =
      horsEquilibre9.length > 0 ? ' Sauf sur les écritures signalées par le contrôle des comptes 90 et 91 hors équilibre.' : '';
    const contributions = estSycebnlClasse9 ? classe9.filter((n) => /^9[01]/.test(n)) : [];
    const analytiqueSycebnl = estSycebnlClasse9 ? classe9.filter((n) => !/^9[01]/.test(n)) : [];
    if (contributions.length > 0) {
      anomalies.push({
        code: 'CLASSE_9_MOUVEMENTEE',
        gravite: 'INFORMATION',
        libelle: 'Contributions volontaires en nature enregistrées',
        consequence:
          'Les comptes de classe 9 sont hors bilan et hors résultat : ils ne modifient ni le résultat ni la situation nette, et se présentent en note annexe.' +
          reserveHorsEquilibre,
        action: 'Vérifiez que la note annexe des contributions volontaires est renseignée.',
        occurrences: contributions.map((n) => ({ reference: n, detail: 'Compte de contributions volontaires mouvementé' })),
      });
    }
    if (analytiqueSycebnl.length > 0) {
      anomalies.push({
        code: 'CLASSE_9_ANALYTIQUE_MOUVEMENTEE',
        gravite: 'INFORMATION',
        libelle: 'Comptes de la comptabilité analytique de gestion mouvementés (92 à 99)',
        consequence:
          'Les comptes 92 à 99 relèvent de la comptabilité analytique de gestion (Partie 2 ch. 3, section 9, sous-section 2) · hors bilan et hors compte de résultat, ils n’entrent dans aucun état de synthèse.',
        action: 'Vérifiez que ces écritures relèvent bien de la comptabilité analytique et non des contributions volontaires.',
        occurrences: analytiqueSycebnl.map((n) => ({ reference: n, detail: 'Compte de comptabilité analytique mouvementé' })),
      });
    }
    if (!estSycebnlClasse9 && classe9.length > 0) {
      anomalies.push({
        code: 'CLASSE_9_MOUVEMENTEE',
        gravite: 'INFORMATION',
        libelle: 'Comptes de classe 9 mouvementés (engagements hors bilan ou comptabilité analytique)',
        consequence:
          'Les comptes de classe 9 sont hors bilan et hors compte de résultat. Les engagements des comptes 90 et 91 se portent aux Notes annexes · ils supposent une convention écrite. Les comptes 92 à 99 relèvent de la comptabilité analytique de gestion et n’entrent dans aucun état de synthèse.' +
          reserveHorsEquilibre,
        action: 'Vérifiez que la note annexe des engagements hors bilan est renseignée.',
        occurrences: classe9.map((n) => ({ reference: n, detail: 'Compte de classe 9 mouvementé' })),
      });
    }

    // --- 10. Seuils de désignation de l'auditeur (SYCEBNL, art. 19) ---------
    //
    // Trois critères ALTERNATIFS : total du bilan supérieur à 100 000 000
    // FCFA, ressources annuelles supérieures à 200 000 000 FCFA, ou effectif
    // permanent supérieur à vingt personnes. Un seul suffit à rendre la
    // désignation d'un auditeur OBLIGATOIRE (et l'article 24 assortit le
    // dispositif de sanctions pénales).
    //
    // Le logiciel n'en portait rien : une entité pouvait franchir un seuil,
    // arrêter ses comptes et les déposer sans que rien ne le signale, alors
    // que les deux montants sont calculés depuis toujours pour les états
    // financiers, et que l'effectif est désormais renseigné sur le dossier.
    //
    // Le contrôle ne prétend PAS conclure : le total du bilan et les
    // ressources sont ici approchés depuis la balance (classes 1 à 5 pour le
    // bilan, classe 7 pour les ressources), pas repris de la liasse arrêtée.
    // Il alerte, l'expert tranche · d'où la gravité AVERTISSEMENT.
    const seuils = await this.seuilsAuditeur(tenantId, exerciceId, tenant.effectifPermanent);
    // LA SORTIE DE L'OBLIGATION, DANS LES MOTS DU TEXTE (passe O1b-A8). Les
    // art. 376, 853-13 et 289-1 (celui-ci valant pour la SCS par l'art. 293-1)
    // écrivent tous la même phrase : la société n'est plus tenue « dès lors
    // qu'elle n'a pas rempli deux (2) des conditions fixées ci-dessus pendant
    // les deux (2) exercices précédant l'expiration du mandat du commissaire
    // aux comptes ». « Deux exercices consécutifs » laissait croire qu'un
    // commissaire s'écarte en cours de mandat.
    const sortieAuscgie =
      "La société cesse d'être tenue de désigner un commissaire aux comptes lorsqu'elle n'a pas rempli deux des " +
      "conditions pendant les deux exercices précédant l'expiration du mandat du commissaire aux comptes " +
      `(${seuils.source}) · ce contrôle ne regarde qu'un exercice.`;
    // AUSCGIE art. 897 · « Encourent une sanction pénale, les dirigeants
    // sociaux qui n'ont pas provoqué la désignation des commissaires aux
    // comptes de la société » (passe O1b-G8). La Partie 3 renvoie les peines
    // au droit pénal national · aucune n'est chiffrée.
    const sanctionAuscgie = "L'article 897 de l'AUSCGIE punit les dirigeants qui n'ont pas provoqué la désignation.";
    if (seuils.obligationDeclenchee) {
      const alternatif = seuils.regle.genre === 'ALTERNATIF';
      anomalies.push({
        code: 'SEUIL_AUDITEUR_FRANCHI',
        gravite: 'AVERTISSEMENT',
        libelle: alternatif
          ? "Seuil de désignation d'un auditeur franchi"
          : 'Deux des trois seuils de désignation du commissaire aux comptes sont franchis',
        consequence: alternatif
          ? "L'article 19 de l'Acte uniforme SYCEBNL rend la désignation d'un auditeur OBLIGATOIRE dès qu'un SEUL des " +
            'trois critères est franchi : total du bilan supérieur à 100 000 000 FCFA, ressources annuelles supérieures ' +
            "à 200 000 000 FCFA, ou plus de vingt personnes employées à titre permanent. Les articles 24 à 27 prévoient " +
            'des sanctions pénales.'
          : `${seuils.source} rend la désignation d'un commissaire aux comptes obligatoire dès que DEUX des trois ` +
            `conditions sont remplies à la clôture. Le dossier en remplit deux ou plus. ${sanctionAuscgie}`,
        action: alternatif
          ? "Faites désigner un auditeur, et prévoyez de lui remettre les états financiers et le rapport de gestion au " +
            "moins 45 jours avant l'assemblée générale (art. 19, alinéa 4)."
          : `Faites désigner un commissaire aux comptes. ${sortieAuscgie}`,
        occurrences: seuils.franchis.map((f) => ({ reference: f.critere, detail: f.detail })),
      });
    }
    // LE VERDICT QUE LES MONTANTS SEULS POURRAIENT FAIRE BASCULER. Les deux
    // critères monétaires ne sont pas comparés (voir `seuilsAuditeur`) · le
    // contrôle informe, sans affirmer l'obligation ni l'écarter.
    if (seuils.obligationIndeterminee) {
      const alternatif = seuils.regle.genre === 'ALTERNATIF';
      anomalies.push({
        code: 'SEUILS_AUDITEUR_NON_COMPARES',
        gravite: 'INFORMATION',
        libelle: alternatif
          ? "Seuils de désignation d'un auditeur à comparer en francs congolais"
          : 'Seuils de désignation du commissaire aux comptes à comparer en francs congolais',
        consequence:
          `${seuils.source} exprime ses seuils en francs CFA, le dossier est tenu en francs congolais. Les montants ` +
          'ci-dessous dépassent le nombre du seuil sans lui être comparables · ' +
          (alternatif
            ? "l'article 19 compare à « l'équivalent dans l'unité monétaire ayant cours légal dans l'État partie »."
            : "l'article 906 de l'AUSCGIE fixe l'équivalent à la parité du franc CFA en vigueur le jour de l'adoption " +
              "de l'Acte uniforme (30 janvier 2014), arrondie à l'unité supérieure. " +
              sanctionAuscgie),
        action:
          'Établissez l’équivalent des seuils en francs congolais avec sa source, puis confrontez-le aux montants de ' +
          'la liasse arrêtée · OmegaX ne convertit pas et ne conclut pas.' +
          (alternatif ? '' : ` ${sortieAuscgie}`),
        occurrences: seuils.nonCompares.map((f) => ({ reference: f.critere, detail: f.detail })),
      });
    }
    // La société anonyme n'a pas de seuil à franchir · son obligation est
    // permanente, et un dossier qui l'ignore ne verrait jamais rien passer.
    if (seuils.obligationSansSeuil && seuils.regle.genre === 'TOUJOURS') {
      anomalies.push({
        code: 'COMMISSAIRE_AUX_COMPTES_OBLIGATOIRE',
        gravite: 'INFORMATION',
        libelle: 'Commissaire aux comptes obligatoire, sans condition de taille',
        // L'art. 897 vise les « dirigeants sociaux […] de la société » · il est
        // servi à la société anonyme, pas au GIE émetteur, dont la répression
        // propre (art. 881) ne porte que sur les obligations.
        consequence:
          `${seuils.regle.source} · ${seuils.regle.motif}` +
          (tenant.formeJuridiqueSyscohada === FormeJuridiqueSyscohada.SOCIETE_ANONYME ? ` ${sanctionAuscgie}` : ''),
        action: "Vérifiez que le mandat est en cours et que le commissaire recevra les comptes en temps utile.",
        occurrences: [],
      });
    }

    // --- 11. Arrêtés d'exonération périmés ou sur le point de l'être --------
    //
    // Un arrêté prévisionnel du Ministère du Plan vaut deux ans (note
    // circulaire n° 003/2013, section B.III). Périmé, il se découvre au port,
    // la marchandise déjà débarquée et les frais de magasinage qui courent ·
    // c'est l'échéance la plus coûteuse à manquer de toutes celles que le
    // logiciel suit, et la seule qui ne laisse aucune régularisation possible
    // après coup : sans titre, les droits sont dus (code des douanes,
    // art. 338).
    //
    // Soixante jours d'avance, parce que le renouvellement exige un rapport
    // d'évaluation SUR TERRAIN, qui suppose une descente à organiser.
    // Le module des exonérations douanières est réservé au SYCEBNL côté
    // serveur (ExonerationsController · @ReferentielsAutorises) : le contrôle
    // porte la même borne, sans quoi le cloisonnement ne serait fait que d'un
    // côté et une exonération arrivée par un autre chemin servirait la
    // procédure ASBL de la note circulaire 003/2013 à une entreprise.
    const aujourdhui = new Date();
    const exonerations =
      tenant.referentiel !== Referentiel.SYCEBNL
        ? []
        : await this.prisma.exoneration.findMany({
      where: {
        tenantId,
        statut: StatutExoneration.ACCORDE,
        dateFinValidite: { not: null, lte: new Date(aujourdhui.getTime() + JOURS_ALERTE_RENOUVELLEMENT * 86_400_000) },
      },
            orderBy: { dateFinValidite: 'asc' },
          });
    if (exonerations.length > 0) {
      const perimes = exonerations.filter((e) => e.dateFinValidite! < aujourdhui);
      anomalies.push({
        code: 'EXONERATION_A_RENOUVELER',
        gravite: perimes.length > 0 ? 'BLOQUANT' : 'AVERTISSEMENT',
        libelle:
          perimes.length > 0
            ? "Arrêté d'exonération EXPIRÉ"
            : "Arrêté d'exonération à renouveler sous soixante jours",
        consequence:
          "Aucune franchise ne se présume : « Il ne peut être accordé de franchise des droits et taxes qu'en " +
          "application des conventions internationales ou que par la loi ou en vertu de celle-ci » (code des " +
          "douanes, ordonnance-loi n° 10/002, art. 338). Sans arrêté en cours de validité, les droits et taxes " +
          'sont dus à l’importation, et la marchandise reste au port aux frais de l’entité.',
        action:
          "Déposez le dossier de renouvellement au Ministère du Plan : requête signée, copie de l'ancien arrêté, " +
          "rapport d'évaluation sur terrain et liste quantifiée des biens (note circulaire n° 003/2013, " +
          'section B.III). Le rapport de terrain suppose une descente · c’est lui qui commande le délai.',
        occurrences: exonerations.map((e) => ({
          reference: e.referenceArrete ?? e.objet,
          detail:
            e.dateFinValidite! < aujourdhui
              ? `Expiré le ${e.dateFinValidite!.toISOString().slice(0, 10)}`
              : `Expire le ${e.dateFinValidite!.toISOString().slice(0, 10)}`,
        })),
      });
    }

    // --- 12. Bien repris sans son amortissement antérieur --------------------
    //
    // Un bien mis en service AVANT le premier exercice du dossier a été amorti
    // ailleurs, et ce cumul doit être repris sur sa fiche. À défaut, le calcul
    // de la dotation repart de zéro : le bien s'amortit sa durée entière une
    // seconde fois, et la valeur nette comptable des états s'écarte du solde du
    // compte 28 porté par le bilan d'ouverture.
    //
    // Rien ne casse · les écritures s'équilibrent, aucun total ne bouge. C'est
    // pourquoi ce contrôle existe : l'erreur ne se signale jamais d'elle-même.
    const premierExercice = await this.prisma.exercice.findFirst({
      where: { tenantId },
      orderBy: { dateDebut: 'asc' },
      select: { dateDebut: true },
    });
    if (premierExercice) {
      // Un bien PAS ENCORE mis en service (date nulle) n'a rien pu amortir ·
      // il ne relève pas de ce signalement. Le `not: null` est redit au
      // filtre, et la liste est retriée en mémoire, pour que le type suive.
      const reprises = (
        await this.prisma.immobilisation.findMany({
          where: {
            tenantId,
            statut: 'EN_SERVICE',
            dateMiseEnService: { not: null, lt: premierExercice.dateDebut },
            amortissementAnterieur: 0,
          },
          select: {
            designation: true,
            dureeNonLimitee: true,
            dateMiseEnService: true,
            valeurOrigine: true,
            compteImmobilisation: { select: { numero: true } },
          },
          orderBy: { dateMiseEnService: 'asc' },
        })
      )
        .filter(estMisEnService)
        // UN BIEN QUE LE PLAN NE FAIT PAS AMORTIR N'A AUCUN ANTÉRIEUR À
        // REPRENDRE (passes R1-A1, R5-B1) · terrain nu, titre, prêt, bien reçu
        // en don destiné à la vente. Lui réclamer un cumul au 28 était un
        // signalement faux (§ 10 bis). La règle est celle du module, lue une
        // seule fois (`motifNonAmortissable`).
        .filter((i) => !motifNonAmortissable(i.compteImmobilisation.numero, tenant.referentiel))
        // Lot 10 · un incorporel à durée non limitée n'est pas amorti (§ 4.2.2).
        .filter((i) => !i.dureeNonLimitee)
        // Un projet de développement n'amortit rien (Acte uniforme SYCEBNL,
        // art. 7 et 9 · décision D-1) · lui réclamer une dotation ou un
        // antérieur serait un signalement faux (§ 10 bis).
        .filter(() => !motifSansAmortissementProjet(tenant.jeuEtatsFinanciersSycebnl));
      if (reprises.length > 0) {
        anomalies.push({
          code: 'IMMO_REPRISE_SANS_ANTERIEUR',
          gravite: 'AVERTISSEMENT',
          libelle: 'Bien mis en service avant le dossier, sans amortissement antérieur repris',
          consequence:
            "Le calcul de la dotation ne connaît que les annuités passées dans ce logiciel : il repart de zéro et " +
            "amortira le bien sa durée entière une seconde fois. La valeur nette comptable des états s'écartera " +
            'alors du solde du compte 28 repris par le bilan d’ouverture, sans qu’aucun total ne le signale.',
          action:
            "Renseignez l'amortissement déjà pratiqué sur la fiche du bien (Structure > Immobilisations) · c'est le " +
            'cumul porté au compte 28 pour ce bien à la date de reprise.',
          occurrences: reprises.slice(0, 200).map((i) => ({
            reference: i.designation,
            detail: `Mis en service le ${i.dateMiseEnService.toISOString().slice(0, 10)}, avant l'ouverture du dossier`,
            montant: Number(i.valeurOrigine),
            date: i.dateMiseEnService.toISOString().slice(0, 10),
          })),
        });
      }
    }

    // --- 13. Immobilisation amortissable sans dotation sur l'exercice --------
    //
    // « LA CONSTATATION DE LA DOTATION AUX AMORTISSEMENTS D'UNE IMMOBILISATION
    // AMORTISSABLE EST OBLIGATOIRE MÊME EN CAS D'ABSENCE OU D'INSUFFISANCE DE
    // BÉNÉFICE » · AUDCIF art. 45, dernier alinéa. L'article n'est pas dans la
    // liste d'exclusion de l'art. 3 du SYCEBNL, dont la fiche du COMPTE 28 dit
    // la même chose : le contrôle vaut pour les deux référentiels.
    //
    // Ce qui se passe quand on l'oublie · le résultat est surévalué du montant
    // de la dotation non passée, la valeur nette comptable reste à sa valeur
    // brute, et RIEN NE LE SIGNALE : les écritures s'équilibrent, la balance
    // boucle, le bilan boucle. Pire, l'oubli devient irréparable à la clôture,
    // qui ferme l'exercice à toute écriture nouvelle.
    //
    // AVERTISSEMENT et non BLOQUANT, et la clôture ne refuse pas · un cabinet
    // peut avoir passé ses dotations à la main, par une écriture directe 68/28,
    // sans passer par le module. Dans ce cas la comptabilité est juste et la
    // table des dotations vide : bloquer serait refuser une clôture régulière.
    // Le logiciel signale ce qu'il voit et laisse le comptable trancher.
    const amortissables = (
      await this.prisma.immobilisation.findMany({
        where: {
          tenantId,
          statut: 'EN_SERVICE',
          // Un bien pas encore en service ne s'amortit pas · l'amortissement
          // court de la mise en état de fonctionner (art. 45), pas de l'achat.
          // Un bien acquis et jamais mis en service (date nulle) non plus ·
          // lui reprocher une dotation absente serait un signalement faux.
          dateMiseEnService: { not: null, lte: ex.dateFin },
        },
        select: {
          designation: true,
          dureeNonLimitee: true,
          dateMiseEnService: true,
          valeurOrigine: true,
          valeurResiduelle: true,
          amortissementAnterieur: true,
          amortissementsDetaches: true,
          reprisesAmortissement: true,
          amortissementsReevaluation: true,
          dotations: { select: { exerciceId: true, montant: true } },
          compteImmobilisation: { select: { numero: true } },
        },
        orderBy: { dateMiseEnService: 'asc' },
      })
    )
      .filter(estMisEnService)
      // « Immobilisation AMORTISSABLE » · l'art. 45 ne vise que celles-là. Un
      // terrain nu (222, 223, 225 à 228), un 25, 26 ou 27, ou au SYCEBNL un
      // bien reçu en don destiné à la vente (« Ils ne doivent pas être
      // amortis ») n'a aucune dotation à passer, et le module la refuse
      // (passes R1-A1, R5-B1). Même règle que `passerDotation`.
      .filter((i) => !motifNonAmortissable(i.compteImmobilisation.numero, tenant.referentiel))
      // Lot 10 · un incorporel à durée non limitée n'est pas amorti (§ 4.2.2).
      .filter((i) => !i.dureeNonLimitee)
        // Un projet de développement n'amortit rien (Acte uniforme SYCEBNL,
        // art. 7 et 9 · décision D-1) · lui réclamer une dotation ou un
        // antérieur serait un signalement faux (§ 10 bis).
        .filter(() => !motifSansAmortissementProjet(tenant.jeuEtatsFinanciersSycebnl));
    const sansDotation = amortissables.filter((i) => {
      if (i.dotations.some((d) => d.exerciceId === exerciceId)) return false;
      // Un bien intégralement amorti n'a plus rien à doter · l'absence de
      // dotation y est la situation normale, pas un oubli.
      const base = Number(i.valeurOrigine) - Number(i.valeurResiduelle);
      const cumul =
        amortissementsHorsDotations(i) +
        i.dotations.reduce((t, d) => t + Number(d.montant), 0);
      return base - cumul > 0.005;
    });
    if (sansDotation.length > 0) {
      anomalies.push({
        code: 'IMMO_SANS_DOTATION',
        gravite: 'AVERTISSEMENT',
        libelle: 'Immobilisation amortissable sans dotation sur cet exercice',
        consequence:
          "L'AUDCIF, art. 45, rend la dotation obligatoire « même en cas d'absence ou d'insuffisance de bénéfice ». " +
          'Sans elle, le résultat est surévalué du montant non doté et la valeur nette comptable reste à la valeur ' +
          'brute, sans qu’aucun total ne le signale : les écritures s’équilibrent et la balance boucle. La clôture ' +
          'rendra l’oubli irréparable, l’exercice n’acceptant plus aucune écriture.',
        action:
          'Passez les dotations de l’exercice (Structure > Immobilisations > Dotations) avant de clôturer. Si vos ' +
          'dotations ont été saisies à la main par une écriture 68/28 sans passer par le module, ce signalement est ' +
          'sans objet pour les biens concernés.',
        occurrences: sansDotation.slice(0, 200).map((i) => ({
          reference: i.designation,
          detail: `Mis en service le ${i.dateMiseEnService.toISOString().slice(0, 10)}, aucune dotation sur cet exercice`,
          montant: Number(i.valeurOrigine),
          date: i.dateMiseEnService.toISOString().slice(0, 10),
        })),
      });
    }

    // --- 14. Personnel extérieur resté au compte 637 à la clôture ------------
    //
    // LES DEUX RÉFÉRENTIELS ÉCRIVENT LE MÊME VIREMENT, CHACUN DANS SON TEXTE ·
    // ce n'est pas une transposition de l'un vers l'autre.
    //
    //  · SYCEBNL, Partie 2 ch. 3, fiche du COMPTE 63 : « en cours d'exercice,
    //    l'entité utilisatrice enregistre les factures reçues […] au débit du
    //    compte 637 ; À LA CLÔTURE DE L'EXERCICE, LE COMPTE 637 EST VIRÉ, POUR
    //    SOLDE, AU DÉBIT DU COMPTE 667 » ; la fiche du COMPTE 66 le redit :
    //    « ce virement solde le compte 637 ».
    //  · AUDCIF, Titre VIII ch. 27 § 2 : « à la clôture de l'exercice, les
    //    comptes 6371 et 6372 sont virés, pour solde, au débit du compte
    //    667 ».
    //
    // POURQUOI · c'est l'une des quatre applications de la prééminence de la
    // réalité sur l'apparence. La facture est juridiquement un service
    // extérieur ; économiquement, c'est du travail. Le texte range donc la
    // charge en personnel malgré l'absence de contrat de travail.
    //
    // CE QUI EST FAUX SI PERSONNE NE LE FAIT · la charge reste sur la ligne
    // « Services extérieurs » du compte de résultat au lieu de la ligne
    // « Charges de personnel » (TG contre TJ au SYCEBNL, RH contre le poste
    // de personnel au SYSCOHADA). Le résultat net ne bouge pas d'un franc :
    // les deux comptes sont en classe 6. Rien ne se déséquilibre, la balance
    // boucle, et c'est pour cela que l'oubli ne se signale jamais seul. Au
    // SYSCOHADA il fausse en outre la cascade des soldes intermédiaires que
    // l'art. 31 de l'AUDCIF impose de faire apparaître, la valeur ajoutée se
    // calculant après les services extérieurs et avant les charges de
    // personnel.
    const lignes637 = await this.prisma.ligneEcriture.findMany({
      where: {
        compte: { tenantId, numero: { startsWith: '637' } },
        // SANS LE SOLDE DE CLÔTURE (régression de l'audit final F4) · validé,
        // il remet le 637 à zéro sur tout exercice clos, et un virement jamais
        // passé se lisait comme fait.
        ecriture: { tenantId, exerciceId, estSoldeDesComptesDeGestion: false },
      },
      select: { debit: true, credit: true, compte: { select: { numero: true, intitule: true } } },
    });
    const soldes637 = new Map<string, { intitule: string; solde: number }>();
    for (const l of lignes637) {
      const acc = soldes637.get(l.compte.numero) ?? { intitule: l.compte.intitule, solde: 0 };
      acc.solde += Number(l.debit) - Number(l.credit);
      soldes637.set(l.compte.numero, acc);
    }
    const restes637 = [...soldes637.entries()]
      .filter(([, v]) => Math.abs(v.solde) > 0.005)
      .sort(([a], [b]) => a.localeCompare(b));
    if (restes637.length > 0) {
      const sourceVirement =
        tenant.referentiel === Referentiel.SYCEBNL
          ? 'SYCEBNL, Partie 2 ch. 3, fiches des comptes 63 et 66'
          : 'AUDCIF, Titre VIII ch. 27 § 2';
      anomalies.push({
        code: 'PERSONNEL_EXTERIEUR_NON_VIRE',
        gravite: 'AVERTISSEMENT',
        libelle: 'Personnel extérieur resté au compte 637 à la clôture',
        consequence:
          `Le texte (${sourceVirement}) veut qu'à la clôture le compte 637 soit viré, POUR SOLDE, au débit du ` +
          "compte 667 : c'est l'une des quatre applications de la prééminence de la réalité sur l'apparence, la " +
          "facture étant juridiquement un service extérieur mais économiquement du travail. Tant que le virement " +
          "n'est pas passé, la charge s'imprime sur la ligne « Services extérieurs » au lieu de « Charges de " +
          'personnel ». Le résultat net ne bouge pas, les deux comptes étant en classe 6 : rien ne se ' +
          "déséquilibre et l'oubli ne se signale jamais de lui-même.",
        action:
          'Passez le virement de fin d’exercice : débit 667 « Rémunération transférée de personnel extérieur », ' +
          'crédit 637 pour le solde. Pensez à indiquer aux notes annexes l’origine des charges ainsi transférées, ' +
          'afin de ne pas fausser l’assiette des prélèvements assis sur la masse salariale.',
        occurrences: restes637.slice(0, 200).map(([numero, v]) => ({
          reference: `${numero} ${v.intitule}`,
          detail: 'Solde débiteur non viré au compte 667',
          montant: Math.round(v.solde * 100) / 100,
        })),
      });
    }

    // --- 15. Dépréciation d'immobilisation que le module ignore ---------------
    //
    // LES DEUX TEXTES IMPOSENT LA DÉPRÉCIATION, chacun dans le sien.
    //
    //  · SYCEBNL, Partie 2 ch. 3, fiche du COMPTE 29 : « à la clôture de chaque
    //    exercice une entité doit apprécier s'il existe un quelconque indice
    //    qu'un actif a subi une perte de valeur […] l'actif doit être déprécié
    //    lorsque la valeur nette comptable est supérieure à la valeur actuelle
    //    […] même en cas d'absence ou d'insuffisance d'excédent, il doit être
    //    procédé aux dotations nécessaires ». Et : « les dépréciations sont
    //    inscrites distinctement à l'actif, EN DIMINUTION DE LA VALEUR BRUTE
    //    des biens correspondants pour donner leur valeur comptable nette ».
    //  · AUDCIF art. 46 et Titre VIII ch. 12, en termes identiques, avec en
    //    plus la règle de recalcul : « après la comptabilisation d'une perte de
    //    valeur, l'amortissement de l'actif doit être calculé sur la base de la
    //    valeur comptable brute diminuée de la valeur résiduelle
    //    prévisionnelle, des amortissements cumulés ET DE LA DÉPRÉCIATION ».
    //
    // CE QUE LE MODULE FAIT, ET CE QUI DIVERGE ENCORE. Le module porte la
    // dépréciation (`DepreciationImmobilisation`, depuis le 2026-09-03) · il
    // ré-étale le plan sur la durée restant à courir et solde à la sortie le
    // cumul qu'il a lui-même posté. Le « hors périmètre » écrit ici datait
    // d'avant (audit final F209). Mais les comptes 29 restent semés et
    // mouvementables à la main, et une dépréciation passée HORS du module
    // installe deux divergences sans bruit :
    //
    //  1. la base amortissable du module ignore cette dépréciation-là, et le
    //     plan d'amortissement s'écarte de la règle de recalcul dès l'exercice
    //     suivant ;
    //  2. la SORTIE du bien crédite le compte d'immobilisation pour sa valeur
    //     d'origine et débite l'amortissement cumulé, sans solder ce 29 ·
    //     la valeur comptable nette portée au compte 81 est alors surévaluée du
    //     montant déprécié, la plus ou moins-value de cession est fausse
    //     d'autant, et le compte 29 garde un solde pour un bien qui n'existe
    //     plus.
    //
    // Le contrôle ne se déclenche que si le dossier fait LES DEUX : porter une
    // dépréciation ET tenir des immobilisations dans le module. Une
    // dépréciation seule (titres, dossier sans module) ne diverge de rien.
    const lignes29 = await this.prisma.ligneEcriture.findMany({
      where: {
        compte: { tenantId, numero: { startsWith: '29' } },
        ecriture: { tenantId, exerciceId },
      },
      select: { debit: true, credit: true, compte: { select: { numero: true, intitule: true } } },
    });
    const soldes29 = new Map<string, { intitule: string; solde: number }>();
    for (const l of lignes29) {
      const acc = soldes29.get(l.compte.numero) ?? { intitule: l.compte.intitule, solde: 0 };
      // Une dépréciation est CRÉDITRICE · le solde retenu est donc crédit
      // moins débit, la reprise venant en diminution.
      acc.solde += Number(l.credit) - Number(l.debit);
      soldes29.set(l.compte.numero, acc);
    }
    /*
      CE QUE LE MODULE A LUI-MÊME POSTÉ NE COMPTE PAS.

      Depuis que la dépréciation est portée dans le module, ses propres
      écritures mouvementent elles aussi le compte 29. Les compter ici ferait
      crier le contrôle sur le dossier qui fait exactement ce qu'on lui
      demande · et un avertissement qui se trompe est un avertissement qu'on
      apprend à ignorer. On retranche donc, compte 29 par compte 29, ce que la
      table DepreciationImmobilisation porte pour cet exercice ; ne reste que
      ce qui a été passé à la main, qui est le seul cas divergent.
    */
    if ([...soldes29.values()].some((v) => v.solde > 0.005)) {
      const duModule = await this.prisma.depreciationImmobilisation.findMany({
        where: { exerciceId, immobilisation: { tenantId } },
        select: { sens: true, montant: true, compteDepreciation: { select: { numero: true } } },
      });
      for (const d of duModule) {
        const acc = soldes29.get(d.compteDepreciation.numero);
        if (!acc) continue;
        acc.solde -= d.sens === SensDepreciation.DOTATION ? Number(d.montant) : -Number(d.montant);
      }
    }

    const depreciations = [...soldes29.entries()]
      .filter(([, v]) => v.solde > 0.005)
      .sort(([a], [b]) => a.localeCompare(b));
    if (depreciations.length > 0) {
      const immosDuModule = await this.prisma.immobilisation.count({
        where: { tenantId, statut: 'EN_SERVICE' },
      });
      if (immosDuModule > 0) {
        const sourceDepreciation =
          tenant.referentiel === Referentiel.SYCEBNL
            ? 'SYCEBNL, Partie 2 ch. 3, fiche du compte 29'
            : 'AUDCIF art. 46 et Titre VIII ch. 12';
        anomalies.push({
          code: 'DEPRECIATION_IMMO_HORS_MODULE',
          gravite: 'AVERTISSEMENT',
          libelle: 'Dépréciation d’immobilisation que le module ne connaît pas',
          consequence:
            `Le texte (${sourceDepreciation}) inscrit la dépréciation en diminution de la valeur brute pour ` +
            'donner la valeur comptable nette. Le module d’immobilisations ne la connaît pas : sa base ' +
            'amortissable reste la valeur d’origine diminuée de la seule valeur résiduelle, et sa SORTIE de bien ' +
            'ne solde pas le compte 29. Sur un bien déprécié, la valeur comptable nette portée au compte 81 sera ' +
            'donc surévaluée du montant déprécié, la plus ou moins-value de cession fausse d’autant, et le ' +
            'compte 29 gardera un solde pour un bien qui n’existe plus. Rien ne se déséquilibre : l’écriture ' +
            'reste équilibrée et la balance boucle.',
          action:
            'Avant de sortir un bien déprécié, passez la reprise de sa dépréciation à la main (débit 29, crédit ' +
            '79 ou 863 selon le caractère de l’opération), puis sortez le bien. Vérifiez aussi le plan ' +
            'd’amortissement des biens dépréciés, que le module continue de calculer sur la base d’origine.',
          occurrences: depreciations.slice(0, 200).map(([numero, v]) => ({
            reference: `${numero} ${v.intitule}`,
            detail: 'Dépréciation portée hors du module d’immobilisations',
            montant: Math.round(v.solde * 100) / 100,
          })),
        });
      }
    }

    // --- 15 bis. Amortissement porté hors du module (lot 9, décision D-21) ----
    //
    // JUMEAU DU CONTRÔLE 15. Le catalogue des opérations passait l'amortissement
    // de l'usufruit (B18-AMORTISSEMENT) hors fiche, et le compte 28 reste
    // mouvementable à la main · le module ignore alors cette dotation. Sur un
    // bien qui a sa fiche, il la passera une seconde fois (amortissement au
    // double, VNC fausse) ; sur un bien sans fiche, aucun tableau ne le porte
    // et sa sortie ne soldera jamais le 28. Depuis le lot 9 le catalogue
    // renvoie au module · ce contrôle relit ce qui a pu être passé avant, ou
    // à la main.
    //
    // Ne compte que les CRÉDITS du 28 dans l'exercice, hors des écritures que
    // le module retient (acquisition, sortie, dotation, dépréciation,
    // reclassement, dérogatoire, location-acquisition, réévaluation) et hors
    // clôture. AVERTISSEMENT · rien n'est corrigé d'office.
    //
    // LA RÉÉVALUATION DU MODULE (lot 14) crédite le 28 de la hausse du cumul
    // (ch. 28 § 4.2.4.1 et § 4.3.1, « C 283 3 750 000 ») · elle est écartée
    // par la relation de l'écriture (`reevaluationBilan: null`), sans quoi le
    // contrôle ferait contre-passer une réévaluation que la fiche porte déjà
    // (`amortissementsReevaluation`). La reprise de la provision spéciale
    // (D 154 / C 861) ne touche pas le 28.
    {
      const [immosEcr, dotationsEcr, depreciationsEcr, reclassementsEcr, derogatoiresEcr, cloturesEcr] = await Promise.all([
        this.prisma.immobilisation.findMany({
          where: {
            tenantId,
            OR: [
              { ecritureAcquisition: { exerciceId } },
              { ecritureSortie: { exerciceId } },
              { ecritureProduitCession: { exerciceId } },
            ],
          },
          select: { ecritureAcquisitionId: true, ecritureSortieId: true, ecritureProduitCessionId: true },
        }),
        this.prisma.dotationAmortissement.findMany({ where: { exerciceId, immobilisation: { tenantId } }, select: { ecritureId: true } }),
        this.prisma.depreciationImmobilisation.findMany({ where: { exerciceId, immobilisation: { tenantId } }, select: { ecritureId: true } }),
        this.prisma.reclassementImmobilisation.findMany({ where: { exerciceId, immobilisation: { tenantId } }, select: { ecritureId: true } }),
        this.prisma.amortissementDerogatoire.findMany({ where: { tenantId, exerciceId }, select: { ecritureId: true } }),
        this.prisma.clotureLocationAcquisition.findMany({ where: { tenantId, exerciceId }, select: { ecritureId: true, ecritureExtourneId: true } }),
      ]);
      const retenues = new Set<string>(
        [
          ...immosEcr.flatMap((i) => [i.ecritureAcquisitionId, i.ecritureSortieId, i.ecritureProduitCessionId]),
          ...dotationsEcr.map((d) => d.ecritureId),
          ...depreciationsEcr.map((d) => d.ecritureId),
          ...reclassementsEcr.map((d) => d.ecritureId),
          ...derogatoiresEcr.map((d) => d.ecritureId),
          ...cloturesEcr.flatMap((c) => [c.ecritureId, c.ecritureExtourneId]),
        ].filter((x): x is string => !!x),
      );
      const lignes28 = await this.prisma.ligneEcriture.findMany({
        where: {
          compte: { tenantId, numero: { startsWith: '28' } },
          credit: { gt: 0 },
          ecriture: {
            tenantId,
            exerciceId,
            estGenereeParCloture: false,
            estANouveauProvisoire: false,
            id: { notIn: [...retenues] },
            reevaluationBilan: null,
          },
        },
        select: { credit: true, compte: { select: { numero: true, intitule: true } } },
      });
      const hors = new Map<string, { intitule: string; montant: number }>();
      for (const l of lignes28) {
        const acc = hors.get(l.compte.numero) ?? { intitule: l.compte.intitule, montant: 0 };
        acc.montant += Number(l.credit);
        hors.set(l.compte.numero, acc);
      }
      const amortissementsHors = [...hors.entries()].filter(([, v]) => v.montant > 0.005).sort(([a], [b]) => a.localeCompare(b));
      if (amortissementsHors.length > 0) {
        const source =
          tenant.referentiel === Referentiel.SYCEBNL ? 'SYCEBNL, Partie 2 ch. 3, fiche du compte 28' : 'AUDCIF, Titre VII, fiche du compte 28';
        anomalies.push({
          code: 'AMORTISSEMENT_IMMO_HORS_MODULE',
          gravite: 'AVERTISSEMENT',
          libelle: 'Amortissement d’immobilisation que le module ne connaît pas',
          consequence:
            `Le compte 28 (${source}) a reçu dans l’exercice des amortissements passés hors de la fiche du bien. ` +
            'Le module ne les connaît pas : sur un bien qui a sa fiche, il passera sa propre dotation et le bien sera ' +
            'amorti deux fois ; sur un bien sans fiche, aucun tableau ne le porte et sa sortie ne soldera pas le 28. ' +
            'Rien ne se déséquilibre : l’écriture reste équilibrée et la balance boucle.',
          action:
            'Créez la fiche du bien (ou déclarez-le repris avec son amortissement antérieur), puis contre-passez ' +
            'l’amortissement passé à la main et dotez par la fiche.',
          occurrences: amortissementsHors.slice(0, 200).map(([numero, v]) => ({
            reference: `${numero} ${v.intitule}`,
            detail: 'Amortissement porté hors du module d’immobilisations',
            montant: Math.round(v.montant * 100) / 100,
          })),
        });
      }
    }

    // --- 16. Réévaluation portée hors du module d'immobilisations -------------
    //
    // MÊME FAMILLE QUE LE CONTRÔLE 15, ET LE MÊME MÉCANISME · le module range
    // la valeur d'entrée dans `valeurOrigine`, et rien d'extérieur ne peut la
    // mettre à jour. Une réévaluation passée à la main augmente la valeur au
    // bilan (débit du compte 2x, crédit du 106) sans que le module en sache
    // rien : il continue d'amortir et de sortir le bien au coût historique.
    //
    // CE QUE CHAQUE TEXTE DIT, ET SEULEMENT LUI.
    //
    //  · SYCEBNL · le cadre conceptuel (§ 3.3.1.2.1) prévoit « le recours à la
    //    réévaluation qui peut être libre ou légale », portant « exclusivement
    //    sur les immobilisations corporelles et financières », et la fiche du
    //    COMPTE 106 en fait « la contrepartie au passif du bilan des
    //    augmentations de valeur d'éléments actifs ».
    //  · AUDCIF · art. 62 à 65 et Titre VIII ch. 28, qui ajoutent DEUX règles
    //    que le texte SYCEBNL n'écrit pas et qu'il ne faut donc pas lui prêter :
    //    l'art. 64, « la valeur réévaluée des immobilisations amortissables
    //    sert de base au calcul des amortissements sur la durée d'utilité
    //    restant à courir depuis l'ouverture de l'exercice de réévaluation » ;
    //    et le ch. 28 § 6, « le solde de l'écart de réévaluation d'un bien
    //    cédé ou mis hors service doit faire l'objet d'un transfert à un poste
    //    de réserve non distribuable ».
    //
    // La conséquence logicielle, elle, est la même des deux côtés : le bilan
    // porte la valeur réévaluée, le module la valeur historique. Sa dotation
    // et sa sortie divergent, sans qu'aucune écriture ne se déséquilibre.
    //
    // DEPUIS LE LOT 14, LE MODULE RÉÉVALUE · l'écriture de son opération
    // (`ReevaluationBilan.ecritureId`) met les fiches à leur valeur réévaluée
    // dans la même transaction. Elle est écartée par sa relation
    // (`reevaluationBilan: null`) · sinon ce contrôle dirait « que le module
    // ne connaît pas » d'un écart qu'il a lui-même posé, et l'action proposée
    // (« reprenez à la main le plan d'amortissement ») ferait amortir deux
    // fois (CLAUDE.md § 10 bis, le contrôle qui fabrique une anomalie). Le
    // 106 débité par la perte de valeur imputée sur l'écart (ch. 12 § 2.5) ne
    // compte pas · le contrôle ne lit que le solde CRÉDITEUR.
    const lignes106 = await this.prisma.ligneEcriture.findMany({
      where: {
        compte: { tenantId, numero: { startsWith: '106' } },
        ecriture: { tenantId, exerciceId, reevaluationBilan: null },
      },
      select: { debit: true, credit: true, compte: { select: { numero: true, intitule: true } } },
    });
    const soldes106 = new Map<string, { intitule: string; solde: number }>();
    for (const l of lignes106) {
      const acc = soldes106.get(l.compte.numero) ?? { intitule: l.compte.intitule, solde: 0 };
      // L'écart de réévaluation est CRÉDITEUR · c'est une contrepartie de passif.
      acc.solde += Number(l.credit) - Number(l.debit);
      soldes106.set(l.compte.numero, acc);
    }
    const ecartsReevaluation = [...soldes106.entries()]
      .filter(([, v]) => v.solde > 0.005)
      .sort(([a], [b]) => a.localeCompare(b));
    if (ecartsReevaluation.length > 0) {
      const immosReevaluees = await this.prisma.immobilisation.count({
        where: { tenantId, statut: 'EN_SERVICE' },
      });
      if (immosReevaluees > 0) {
        const estSycebnlReevaluation = tenant.referentiel === Referentiel.SYCEBNL;
        anomalies.push({
          code: 'REEVALUATION_IMMO_HORS_MODULE',
          gravite: 'AVERTISSEMENT',
          libelle: 'Écart de réévaluation que le module d’immobilisations ne connaît pas',
          consequence:
            (estSycebnlReevaluation
              ? 'Le SYCEBNL (cadre conceptuel § 3.3.1.2.1 et fiche du compte 106) fait de l’écart de ' +
                'réévaluation la contrepartie au passif de l’augmentation de valeur portée à l’actif. '
              : 'L’AUDCIF (art. 62 à 65 et Titre VIII ch. 28) impose en outre que la valeur RÉÉVALUÉE serve de ' +
                'base aux amortissements sur la durée restant à courir (art. 64), et que le solde de l’écart ' +
                'd’un bien cédé soit transféré à une réserve non distribuable (ch. 28 § 6). ') +
            'Or le module d’immobilisations garde la valeur d’origine historique : il continue d’amortir et de ' +
            'sortir le bien sur cette base. Le bilan porte la valeur réévaluée, le module la valeur ancienne, et ' +
            'aucune écriture ne se déséquilibre · la balance boucle des deux façons.',
          action:
            'Reprenez à la main le plan d’amortissement des biens réévalués, et, avant toute cession, la sortie ' +
            'de l’écart de réévaluation correspondant. Vérifiez aussi que la réévaluation porte bien sur ' +
            'l’ENSEMBLE des immobilisations corporelles et financières : une réévaluation partielle est ' +
            'interdite.',
          occurrences: ecartsReevaluation.slice(0, 200).map(([numero, v]) => ({
            reference: `${numero} ${v.intitule}`,
            detail: 'Écart de réévaluation porté hors du module d’immobilisations',
            montant: Math.round(v.solde * 100) / 100,
          })),
        });
      }
    }

    // --- 17 à 19. Les trois indices de minoration relevés par la DGI ----------
    //
    // SOURCE · séminaire CPCC sur l'arrêté des comptes 2024, module « Travaux
    // de fin d'exercice : détermination du résultat comptable et du résultat
    // fiscal », animé par la Division chargée de la Formation de la DGI. Le
    // module présente une série d'écritures dont l'absence est lue par
    // l'administration comme une « intention de MINORER la base imposable ».
    //
    // CE QUE CES TROIS CONTRÔLES NE SONT PAS · une accusation. Chacun des cas
    // a une explication innocente possible, et c'est pourquoi ils avertissent
    // au lieu de bloquer. Ce qu'ils apportent, c'est de montrer au cabinet ce
    // qu'un vérificateur regardera, AVANT qu'il ne le regarde.
    //
    // LES TAUX ET LES NOMS D'IMPÔT DE CE SÉMINAIRE NE SONT PAS REPRIS · il
    // décrit l'IBP, abrogé au 1er janvier 2026 par la loi n° 23/053 et
    // remplacé par l'IS et l'IRPP. Seuls les MÉCANISMES d'écriture sont
    // retenus ici, et aucun d'eux ne dépend d'un taux.
    //
    // Le filtrage par préfixe est refait EN JAVASCRIPT après la requête. Ce
    // n'est pas une redondance inutile : il rend chaque contrôle indépendant
    // de ce que les autres demandent à la même table, ce qui compte autant en
    // test qu'en lecture.
    const lignesFiscales = await this.prisma.ligneEcriture.findMany({
      where: {
        compte: { tenantId, OR: [{ numero: { startsWith: '613' } }, { numero: { startsWith: '781' } }] },
        // SANS LE SOLDE DE CLÔTURE (régression de l'audit final F4) · validé,
        // il remet le 613 à zéro et fait bouger le 781 sur tout exercice clos.
        ecriture: { tenantId, exerciceId, estSoldeDesComptesDeGestion: false },
      },
      select: { debit: true, credit: true, compte: { select: { numero: true, intitule: true } } },
    });
    const mouvement = (prefixe: string) =>
      lignesFiscales
        .filter((l) => l.compte.numero.startsWith(prefixe))
        .reduce((t, l) => t + Number(l.debit) + Number(l.credit), 0);
    const solde613 = lignesFiscales
      .filter((l) => l.compte.numero.startsWith('613'))
      .reduce((t, l) => t + Number(l.debit) - Number(l.credit), 0);

    // --- 17. Transport pour le compte de tiers, jamais transféré -------------
    //
    // Le compte 613 enregistre un transport que l'entité AVANCE pour le compte
    // d'un tiers et refacture. Tant que le transfert de charges n'est pas
    // passé, la charge reste chez elle : le résultat est minoré du montant
    // refacturé, et la contrepartie attendue au compte 781 n'existe pas.
    // Contrôle réservé au SYSCOHADA · une entité à but non lucratif est
    // exemptée d'impôt sur les sociétés (loi n° 23/053, art. 5), le risque
    // d'assiette n'a donc pas d'objet pour elle.
    if (tenant.referentiel === Referentiel.SYSCOHADA && solde613 > 0.005 && mouvement('781') <= 0.005) {
      anomalies.push({
        code: 'TRANSPORT_TIERS_SANS_TRANSFERT',
        gravite: 'AVERTISSEMENT',
        libelle: 'Transport pour le compte de tiers sans transfert de charges',
        consequence:
          'Le compte 613 porte un solde débiteur alors qu’aucun compte 781 « Transferts de charges » n’a été ' +
          'mouvementé de l’exercice. Un transport avancé pour le compte d’un tiers se refacture : sans le ' +
          'transfert, la charge reste dans le résultat de l’entité, qui s’en trouve minoré du montant refacturé. ' +
          'L’administration fiscale lit cette absence comme un indice de minoration de la base imposable.',
        action:
          'Si ces transports ont bien été refacturés, passez le transfert de charges au crédit du compte 781. ' +
          'S’ils sont restés à votre charge, le compte 613 n’est pas le bon : ils relèvent alors du compte 61 ' +
          'correspondant à la nature du transport.',
        occurrences: [{ reference: '613 Transports pour le compte de tiers', detail: 'Solde débiteur non transféré', montant: Math.round(solde613 * 100) / 100 }],
      });
    }

    // --- 18. Extourne de régularisation d'un montant différent ---------------
    //
    // LE CAS LE PLUS FIN DES TROIS, et celui que la balance ne trahit jamais.
    // Le module de la DGI le démontre par un extrait : à la clôture, le 476 a
    // bien un solde DÉBITEUR et le 477 un solde CRÉDITEUR, tout paraît sain ·
    // mais les MOUVEMENTS de la période portent un crédit de 50 000 sur le 476
    // qui ne correspond à rien. « À la clôture, les soldes normaux de ces
    // comptes cachent leurs mouvements anormaux. »
    //
    // Le vice est l'extourne d'ouverture passée pour un montant AUTRE que le
    // solde de clôture de l'exercice précédent : extourner moins qu'on n'avait
    // constaté laisse une charge d'avance au bilan, extourner plus crée une
    // charge qui n'existe pas. Dans les deux sens le résultat est faux, et rien
    // ne se déséquilibre.
    //
    // Le contrôle compare donc l'extourne au solde repris, et non les soldes
    // entre eux. Il vaut pour LES DEUX RÉFÉRENTIELS : ce n'est pas un risque
    // d'assiette, c'est une régularisation fausse.
    const exercicePrecedent = await this.prisma.exercice.findFirst({
      where: { tenantId, dateFin: { lt: ex.dateDebut } },
      orderBy: { dateFin: 'desc' },
      // `dateDebut` sert au contrôle 27 · la comparabilité se lit sur la DURÉE
      // des deux exercices, pas sur leur seule date de clôture.
      select: { id: true, dateDebut: true, dateFin: true },
    });
    // Le faux Prisma des tests rend l'exercice courant pour toute recherche ·
    // sans cette garde, le contrôle se comparerait à lui-même.
    if (exercicePrecedent && exercicePrecedent.dateFin < ex.dateDebut) {
      const lignesRegul = await this.prisma.ligneEcriture.findMany({
        where: {
          compte: { tenantId, OR: [{ numero: { startsWith: '476' } }, { numero: { startsWith: '477' } }] },
          ecriture: { tenantId, exerciceId: { in: [exerciceId, exercicePrecedent.id] } },
        },
        select: {
          debit: true,
          credit: true,
          ecriture: { select: { exerciceId: true } },
          compte: { select: { numero: true, intitule: true } },
        },
      });
      const ecarts: Array<{ numero: string; intitule: string; repris: number; extourne: number }> = [];
      for (const prefixe of ['476', '477']) {
        const duCompte = lignesRegul.filter((l) => l.compte.numero.startsWith(prefixe));
        const numeros = [...new Set(duCompte.map((l) => l.compte.numero))];
        for (const numero of numeros) {
          const lignes = duCompte.filter((l) => l.compte.numero === numero);
          // Solde de clôture de l'exercice précédent, dans son sens naturel ·
          // débiteur pour une charge constatée d'avance, créditeur pour un
          // produit constaté d'avance.
          const soldePrecedent = lignes
            .filter((l) => l.ecriture.exerciceId === exercicePrecedent.id)
            .reduce(
              (t, l) => t + (prefixe === '476' ? Number(l.debit) - Number(l.credit) : Number(l.credit) - Number(l.debit)),
              0,
            );
          // Ce qui a été EXTOURNÉ sur l'exercice · le sens inverse.
          const extourne = lignes
            .filter((l) => l.ecriture.exerciceId === exerciceId)
            .reduce((t, l) => t + (prefixe === '476' ? Number(l.credit) : Number(l.debit)), 0);
          if (soldePrecedent > 0.005 && Math.abs(extourne - soldePrecedent) > 0.005) {
            ecarts.push({ numero, intitule: lignes[0].compte.intitule, repris: soldePrecedent, extourne });
          }
        }
      }
      if (ecarts.length > 0) {
        anomalies.push({
          code: 'EXTOURNE_REGULARISATION_INCOHERENTE',
          gravite: 'AVERTISSEMENT',
          libelle: 'Extourne de régularisation d’un montant différent du solde repris',
          consequence:
            'Une charge ou un produit constaté d’avance à la clôture précédente doit être extourné à l’ouverture ' +
            'POUR SON MONTANT EXACT. Extourner moins laisse au bilan une régularisation qui n’a plus d’objet ; ' +
            'extourner plus crée une charge ou un produit qui n’a jamais existé. Dans les deux sens le résultat ' +
            'de l’exercice est faux, et rien ne le signale : l’écriture s’équilibre et le solde de clôture peut ' +
            'redevenir parfaitement normal. C’est précisément ce que l’administration fiscale recherche sur ces ' +
            'deux comptes.',
          action:
            'Rapprochez l’extourne du solde repris, compte par compte, et corrigez l’écart. Si l’écart est ' +
            'volontaire (une part de la régularisation court encore), la reprise doit être étalée par une ' +
            'écriture explicite, pas par une extourne partielle silencieuse.',
          occurrences: ecarts.slice(0, 200).map((e) => ({
            reference: `${e.numero} ${e.intitule}`,
            detail: `Solde repris ${e.repris.toFixed(2)}, extourné ${e.extourne.toFixed(2)}`,
            montant: Math.round((e.extourne - e.repris) * 100) / 100,
          })),
        });
      }

      // --- 19. Avance client reportée d'un exercice à l'autre ----------------
      //
      // « Les avances et acomptes reçus des clients au cours de l'exercice N-1
      // doivent être considérés à juste titre le CHIFFRE D'AFFAIRES de
      // l'exercice N. » C'est la lecture de l'administration, pas une règle de
      // l'AUDCIF · d'où un contrôle qui INFORME et n'accuse pas, et qui ne
      // s'adresse qu'aux dossiers SYSCOHADA, une entité à but non lucratif
      // étant exemptée d'impôt sur les sociétés (loi n° 23/053, art. 5).
      if (tenant.referentiel === Referentiel.SYSCOHADA) {
        const lignes419 = await this.prisma.ligneEcriture.findMany({
          where: {
            compte: { tenantId, numero: { startsWith: '419' } },
            ecriture: { tenantId, exerciceId: exercicePrecedent.id },
          },
          select: { debit: true, credit: true, compte: { select: { numero: true, intitule: true } } },
        });
        const soldes419 = new Map<string, { intitule: string; solde: number }>();
        for (const l of lignes419.filter((x) => x.compte.numero.startsWith('419'))) {
          const acc = soldes419.get(l.compte.numero) ?? { intitule: l.compte.intitule, solde: 0 };
          acc.solde += Number(l.credit) - Number(l.debit);
          soldes419.set(l.compte.numero, acc);
        }
        const avancesReportees = [...soldes419.entries()]
          .filter(([, v]) => v.solde > 0.005)
          .sort(([a], [b]) => a.localeCompare(b));
        if (avancesReportees.length > 0) {
          anomalies.push({
            code: 'AVANCE_CLIENT_REPORTEE',
            gravite: 'INFORMATION',
            libelle: 'Avances clients reçues à l’exercice précédent, à rattacher au chiffre d’affaires',
            consequence:
              'Des avances et acomptes reçus des clients figuraient au compte 419 à la clôture précédente. ' +
              'L’administration fiscale considère que ces avances constituent le chiffre d’affaires de ' +
              'l’exercice suivant : maintenues au passif sans que la vente soit constatée, elles minorent le ' +
              'produit imposable. Ce n’est pas une règle de l’AUDCIF mais une position de contrôle, d’où un ' +
              'simple signalement.',
            action:
              'Vérifiez, avance par avance, que la livraison ou la prestation a été facturée sur cet exercice et ' +
              'que le compte 419 a été soldé en conséquence. Une avance qui subsiste doit pouvoir être ' +
              'justifiée par une commande encore en cours.',
            occurrences: avancesReportees.slice(0, 200).map(([numero, v]) => ({
              reference: `${numero} ${v.intitule}`,
              detail: 'Solde créditeur à la clôture de l’exercice précédent',
              montant: Math.round(v.solde * 100) / 100,
            })),
          });
        }
      }
    }

    // --- 19 bis. Compte courant d'associé débiteur (passe F5) ----------------
    //
    // Loi n° 23/053, art. 73, al. 2, 2°, a) · sont des revenus distribués,
    // « sauf preuve contraire, les sommes mises à la disposition des associés
    // [...] à titre d'avances, de prêts ou d'acomptes », remboursées elles
    // viennent en déduction. Elles portent la retenue de 20 % de l'art. 120.
    // SYSCOHADA SEUL, et sociétés seules · au SYCEBNL le 462 porte les fonds
    // d'administration des projets (un numéro, deux sens), et une personne
    // physique n'a pas d'associé. La présomption est réfragable · le contrôle
    // INFORME et ne chiffre aucune retenue.
    if (
      tenant.referentiel === Referentiel.SYSCOHADA &&
      !(tenant.formeJuridiqueSyscohada && FORMES_PERSONNES_PHYSIQUES.includes(tenant.formeJuridiqueSyscohada))
    ) {
      const lignes462 = await this.prisma.ligneEcriture.findMany({
        where: {
          compte: { tenantId, numero: { startsWith: '462' } },
          ecriture: { tenantId, exerciceId },
        },
        select: { debit: true, credit: true, compte: { select: { numero: true, intitule: true } } },
      });
      const soldes462 = new Map<string, { intitule: string; solde: number }>();
      for (const l of lignes462.filter((x) => x.compte.numero.startsWith('462'))) {
        const acc = soldes462.get(l.compte.numero) ?? { intitule: l.compte.intitule, solde: 0 };
        acc.solde += Number(l.debit) - Number(l.credit);
        soldes462.set(l.compte.numero, acc);
      }
      const debiteurs = [...soldes462.entries()].filter(([, v]) => v.solde > 0.005).sort(([a], [b]) => a.localeCompare(b));
      if (debiteurs.length > 0) {
        // Le droit des sociétés annule, pour certains titulaires, le prêt que
        // l'action proposait comme justification (voir conventions-interdites.ts).
        const interdiction = conventionInterditeCompteCourant(tenant.formeJuridiqueSyscohada);
        anomalies.push({
          code: 'COMPTE_COURANT_ASSOCIE_DEBITEUR',
          gravite: 'INFORMATION',
          libelle: 'Compte courant d’associé débiteur',
          consequence:
            'Les sommes mises à la disposition des associés à titre d’avances, de prêts ou d’acomptes sont ' +
            'présumées revenus distribués, sauf preuve contraire (loi n° 23/053, art. 73, al. 2, 2°, a), et portent ' +
            'la retenue de 20 % de l’art. 120. Remboursées, elles viennent en déduction pour la période du remboursement.' +
            (interdiction ? ` ${interdiction}` : ''),
          action: interdiction
            ? 'Identifiez le titulaire de chaque solde débiteur. Justifiez-le par un remboursement intervenu, ou par une ' +
              'convention de prêt seulement si le titulaire n’est pas visé par l’interdiction ci-dessus, ou traitez-le ' +
              'en revenu distribué. OmegaX ne qualifie aucun solde et ne chiffre aucune retenue.'
            : 'Justifiez chaque solde débiteur (convention de prêt, remboursement intervenu) ou traitez-le en revenu ' +
              'distribué. OmegaX ne chiffre aucune retenue.',
          occurrences: debiteurs.slice(0, 200).map(([numero, v]) => ({
            reference: `${numero} ${v.intitule}`,
            detail: 'Solde débiteur sur l’exercice',
            montant: Math.round(v.solde * 100) / 100,
          })),
        });
      }
    }

    // --- 19 bis A. Capitaux propres sous la moitié du capital (O1b-D1, G3) ----
    //
    // AUSCGIE art. 371 à 373 (SARL), 664 à 669 (SA, et SAS par l'art. 853-3),
    // 901 · voir moitie-capital.ts. Les grandeurs sont celles de l'AUDCIF,
    // Titre VIII ch. 16, section 3, et le bilan est lu par la résolution du
    // ch. 7, livre-journal seul et avant le solde des comptes de gestion,
    // comme les états financiers.
    if (tenant.referentiel === Referentiel.SYSCOHADA && this.ecritureService && this.etatsSyscohada) {
      const lignes = await chargerLignes(this.ecritureService, tenantId, exerciceId);
      const soldeRacine = (racine: string) =>
        lignes.filter((l) => l.numero.startsWith(racine)).reduce((t, l) => t + Number(l.solde), 0);
      const cp = this.etatsSyscohada.resoudreBilanSurLignes(lignes).resolution.parRef.get('CP')?.montant ?? 0;
      const verdict = verdictMoitieCapital(tenant.formeJuridiqueSyscohada, cp, soldeRacine('109'), -soldeRacine('101'));
      // LE 109 ET LE 1011, UNE IDENTITÉ QUE LA FICHE POSE (passe R1-A7).
      // AUDCIF Titre VII, fiche du compte 109, éléments de contrôle · « compte
      // 1011 (Capital souscrit, non appelé), de solde opposé et de montant
      // identique ». Un appel de fonds qui vire le 1011 au 1012 sans créditer
      // le 109 laisse les capitaux propres faux d'autant, sur une balance qui
      // boucle. Rien n'est proposé · l'écriture manquante est un fait à
      // retrouver, pas à deviner.
      const solde109 = soldeRacine('109');
      const solde1011 = soldeRacine('1011');
      if (Math.abs(solde109 + solde1011) > 0.005) {
        anomalies.push({
          code: 'CAPITAL_NON_APPELE_DISCORDANT',
          gravite: 'INFORMATION',
          libelle: 'Capital souscrit non appelé · le 109 et le 1011 ne se correspondent pas',
          consequence:
            'La fiche du compte 109 (AUDCIF, Titre VII) donne pour élément de contrôle le « compte 1011 (Capital ' +
            'souscrit, non appelé), de solde opposé et de montant identique ». Ici les deux soldes ne se ' +
            'compensent pas.',
          action:
            'Vérifiez les décisions d’appel de fonds · un appel se passe au 1011 vers le 1012 et au 467 par le crédit ' +
            'du 109.',
          occurrences: [
            { reference: '109', detail: 'Solde débiteur (positif) ou créditeur (négatif)', montant: Math.round(solde109 * 100) / 100 },
            { reference: '1011', detail: 'Solde débiteur (positif) ou créditeur (négatif)', montant: Math.round(solde1011 * 100) / 100 },
          ],
        });
      }
      if (verdict) {
        anomalies.push({
          code: 'CAPITAUX_PROPRES_INFERIEURS_MOITIE_CAPITAL',
          gravite: 'INFORMATION',
          libelle: 'Capitaux propres inférieurs à la moitié du capital social',
          consequence: verdict.consequence,
          action: verdict.action,
          occurrences: [
            { reference: 'Capitaux propres', detail: 'Total du bilan augmenté du capital non appelé', montant: verdict.capitauxPropres },
            { reference: 'Capital social', detail: 'Solde créditeur du compte 101', montant: verdict.capital },
          ],
        });
      }
    }

    // --- 19 ter. Réserve de propriété à mentionner aux Notes annexes (O3) ----
    //
    // AUDCIF Titre VIII ch. 9, section 3 · les informations relatives à la
    // réserve de propriété « doivent être indiquées aux tiers » dans les Notes
    // annexes, « quelle que soit l'importance relative des montants en
    // cause », sauf montants « dérisoires ». Quatre montants · immobilisations,
    // stocks, clients (et autres créances), fournisseurs (et autres dettes).
    // La maquette n'en porte qu'UN en ligne propre (Note 7, 4116) · les trois
    // autres n'ont aucune case, et rien ne rappelait qu'ils sont dus. Le
    // contrôle part des comptes que le dossier a lui-même ouverts pour la
    // clause (Titre VII · 4016, 4816, 4116, et au § 3.1 les engagements 9043
    // et 9083), lus à la clôture sur le livre-journal seul, comme les états.
    // Comptes de bilan et de classe 9 · le solde des comptes de gestion ne les
    // touche pas. INFORMATION · le texte n'est enfreint par aucun solde, et la
    // dispense des montants dérisoires est un jugement de l'entité.
    // SYSCOHADA Système normal SEUL · le Système minimal n'a pas ces notes
    // (Titre X), et le SYCEBNL a sa propre nomenclature.
    if (tenant.referentiel === Referentiel.SYSCOHADA && !auSystemeMinimal) {
      const groupesRp = await this.prisma.ligneEcriture.groupBy({
        by: ['compteId'],
        where: {
          ecriture: { tenantId, exerciceId, statut: StatutEcriture.VALIDEE },
          OR: RACINES_RESERVE_PROPRIETE.map((r) => ({ compte: { tenantId, numero: { startsWith: r.racine } } })),
        },
        _sum: { debit: true, credit: true },
      });
      const idsRp = groupesRp.map((g) => g.compteId);
      const comptesRp = idsRp.length
        ? await this.prisma.compte.findMany({
            where: { tenantId, id: { in: idsRp } },
            select: { id: true, numero: true },
          })
        : [];
      const numeroRp = new Map(comptesRp.map((c) => [c.id, c.numero]));
      const soldeParRacine = new Map<string, number>();
      for (const g of groupesRp) {
        const numero = numeroRp.get(g.compteId);
        const racine = numero && RACINES_RESERVE_PROPRIETE.find((r) => numero.startsWith(r.racine));
        if (!racine) continue;
        const solde = Number(g._sum.debit ?? 0) - Number(g._sum.credit ?? 0);
        soldeParRacine.set(racine.racine, (soldeParRacine.get(racine.racine) ?? 0) + solde);
      }
      const soldesRp = RACINES_RESERVE_PROPRIETE.map((r) => ({
        ...r,
        solde: Math.round((soldeParRacine.get(r.racine) ?? 0) * 100) / 100,
      })).filter((r) => Math.abs(r.solde) > 0.005);
      if (soldesRp.length > 0) {
        anomalies.push({
          code: 'RESERVE_PROPRIETE_A_MENTIONNER',
          gravite: 'INFORMATION',
          libelle: 'Réserve de propriété à mentionner aux Notes annexes',
          consequence:
            'Les Notes annexes doivent indiquer, quelle que soit leur importance relative, les montants des ' +
            'immobilisations, des stocks, des clients (et autres créances) et des fournisseurs (et autres dettes) ' +
            'frappés de réserve de propriété (AUDCIF, Titre VIII ch. 9, section 3). Seul le montant des clients a ' +
            'une ligne propre, en Note 7 (4116) · les trois autres n’ont aucune case.',
          action:
            'Portez les trois autres montants en Note 2 D, informations complémentaires relatives au bilan ' +
            '(emplacement retenu par OmegaX, le texte n’en désigne aucun). Des montants dérisoires peuvent ne pas ' +
            'être fournis (même section). Le montant des stocks frappés de réserve de propriété ne se suit que ' +
            'dans une entité qui tient un inventaire permanent (§ 3.1).',
          occurrences: soldesRp.map((r) => ({
            reference: `${r.racine} ${r.intitule}`,
            detail: `Solde ${r.solde > 0 ? 'débiteur' : 'créditeur'} à la clôture (livre-journal)`,
            montant: r.solde,
          })),
        });
      }
    }

    // --- 20. Date d'arrêté des comptes non renseignée -------------------------
    //
    // LA QUATRIÈME MENTION OBLIGATOIRE DE CHAQUE PAGE PUBLIÉE.
    //
    // AUDCIF, Titre IX ch. 1 § 2.4 · les états financiers « doivent comporter
    // OBLIGATOIREMENT » le nom de l'entité, la DATE D'ARRÊTÉ et la période
    // couverte, et l'unité monétaire, « dans chacune des pages des états
    // financiers publiés ». L'article 23 la réclame « dans toute publication
    // des états financiers », et cet article n'est PAS dans la liste
    // d'exclusion de l'art. 3 du SYCEBNL · d'où un contrôle commun.
    //
    // CE QUE RIEN NE VOYAIT. Un état sans date d'arrêté s'imprime, s'exporte et
    // se dépose exactement comme un autre : tous les totaux sont justes, la
    // balance boucle, et il manque seulement une mention que le texte dit
    // obligatoire. Le défaut ne se découvre qu'au dépôt, ou devant l'auditeur.
    //
    // AVERTISSEMENT et non BLOQUANT · la date n'existe qu'une fois que les
    // organes dirigeants ont arrêté les comptes. Bloquer l'analyse d'un
    // exercice en cours de travaux serait refuser le brouillon parce qu'il
    // n'est pas encore définitif.
    if (!ex.dateArreteComptes) {
      const sourceArrete =
        tenant.referentiel === Referentiel.SYCEBNL
          ? "AUDCIF art. 23, rendu applicable aux entités à but non lucratif par l'art. 3 du SYCEBNL, qui ne " +
            "l'exclut pas"
          : 'AUDCIF art. 23 et Titre IX ch. 1 § 2.4';
      anomalies.push({
        code: 'DATE_ARRETE_NON_RENSEIGNEE',
        gravite: 'AVERTISSEMENT',
        libelle: 'Date d’arrêté des comptes non renseignée',
        consequence:
          `Le texte (${sourceArrete}) exige que la date d’arrêté figure dans toute publication des états ` +
          'financiers. Ce n’est pas la date de clôture : l’arrêté par les organes dirigeants lui est postérieur ' +
          'de plusieurs semaines, dans la limite de quatre mois (Titre VIII ch. 31 § 1.3). Tant qu’elle manque, ' +
          'les états s’impriment et s’exportent sans elle, avec des totaux justes et une mention obligatoire en ' +
          'moins · rien ne le signale avant le dépôt.',
        action:
          'Renseignez la date à laquelle les organes dirigeants ont arrêté les comptes, dans la fenêtre ' +
          'Exercices. Elle s’imprimera ensuite sur chaque page des états.',
        occurrences: [
          {
            reference: `Exercice clos le ${ex.dateFin.toISOString().slice(0, 10)}`,
            detail: 'Aucune date d’arrêté enregistrée pour cet exercice',
            date: ex.dateFin.toISOString().slice(0, 10),
          },
        ],
      });
    }

    // --- 21. Manuel des procédures et de l'organisation comptables ------------
    //
    // LE QUATRIÈME DOCUMENT OBLIGATOIRE, et le seul qui n'avait aucune place.
    //
    // AUDCIF, art. 16 al. 1 · « pour maintenir la continuité dans le temps de
    // l'accès à l'information, TOUTE ENTITÉ ÉTABLIT UN MANUEL décrivant les
    // procédures et l'organisation comptables ». Et l'art. 17, 3° en fait la
    // référence du classement : les pièces sont « classées dans un ordre défini
    // dans le manuel ». Sans manuel, cet ordre n'existe nulle part.
    //
    // DEUX ARTICLES 16, à ne pas confondre · celui-ci est de l'AUDCIF ; le
    // SYCEBNL a le sien, sur les règles de présentation, dont le 2) exige de
    // son côté « la mise en place de procédures nécessaires à une organisation
    // comptable ». L'art. 16 de l'AUDCIF n'étant pas exclu par l'art. 3 du
    // SYCEBNL, l'obligation vaut des deux côtés · chacun par son chemin, ce que
    // `sourceManuel` écrit.
    //
    // CE QUE RIEN NE VOYAIT. Un dossier sans manuel tient une comptabilité
    // parfaitement équilibrée : aucun total ne bouge, aucun état ne manque. Le
    // défaut ne se voit que le jour où un auditeur demande selon quelles
    // procédures les comptes ont été tenus, et dans quel ordre les pièces sont
    // classées.
    const manuel = await this.prisma.manuelProcedures.findFirst({
      where: { tenantId },
      orderBy: { version: 'desc' },
      select: { version: true, sections: true },
    });
    if (!manuel) {
      anomalies.push({
        code: 'MANUEL_PROCEDURES_ABSENT',
        gravite: 'AVERTISSEMENT',
        libelle: 'Manuel des procédures et de l’organisation comptables absent',
        consequence:
          `Le texte (${sourceManuel(tenant.referentiel)}) impose ce manuel à toute entité, et l’article 17, 3° y ` +
          'renvoie pour l’ordre de classement des pièces justificatives. Sans lui, cet ordre n’est écrit nulle ' +
          'part, et la justification des écritures perd son point d’appui. Rien ne le signale par ailleurs : la ' +
          'comptabilité reste équilibrée et les états se produisent normalement.',
        action:
          'Établissez le manuel dans la fenêtre Documents obligatoires · un squelette des sept rubriques ' +
          'proposées par le CPCC vous y attend, à compléter et à adapter. Ni la forme ni le contenu ne sont ' +
          'imposés par le texte.',
        occurrences: [
          { reference: tenant.nom ?? 'Dossier', detail: 'Aucune version de manuel enregistrée pour ce dossier' },
        ],
      });
    } else if (!(manuel.sections as unknown as Array<{ cle: string; texte: string }>).some(
      (sec) => sec.cle === 'classement-archivage' && sec.texte.trim().length > 0,
    )) {
      // La seule vérification de FOND que le texte permette · l'art. 17, 3° se
      // réfère au manuel pour l'ordre de classement. Un manuel muet sur ce
      // point prive cet article de son objet, alors qu'il existe bien.
      anomalies.push({
        code: 'MANUEL_SANS_ORDRE_DE_CLASSEMENT',
        gravite: 'INFORMATION',
        libelle: 'Le manuel ne décrit pas l’ordre de classement des pièces',
        consequence:
          'L’article 17, 3° de l’AUDCIF exige que les pièces justificatives soient « conservées, classées dans ' +
          'un ordre DÉFINI DANS LE MANUEL décrivant les procédures et l’organisation comptables ». La version ' +
          `${manuel.version} du manuel existe mais laisse cette section vide : l’article renvoie alors à un ` +
          'ordre que personne n’a écrit.',
        action:
          'Complétez la section « Système de classement et d’archivage des documents et pièces comptables » du ' +
          'manuel, puis enregistrez une nouvelle version.',
        occurrences: [
          { reference: `Manuel version ${manuel.version}`, detail: 'Section de classement et d’archivage vide' },
        ],
      });
    }

    // --- 22. Imputation directe au report à nouveau, non déclarée -------------
    //
    // LA CORRESPONDANCE BILAN DE CLÔTURE / BILAN D'OUVERTURE, ET SES DEUX
    // SEULES EXCEPTIONS.
    //
    // Les deux textes écrivent la convention, chacun dans le sien : « le bilan
    // d'ouverture d'un exercice doit correspondre au bilan de clôture de
    // l'exercice précédent » (AUDCIF art. 34 et Titre V · SYCEBNL art. 16, 4)
    // et cadre conceptuel § 3.3.1.2.4). Sa conséquence est qu'on ne peut PAS
    // imputer directement sur les capitaux propres les incidences d'un
    // changement de méthode ni les charges et produits d'exercices antérieurs
    // omis : ils transitent par le compte de résultat du nouvel exercice.
    //
    // Deux exceptions seulement, et le logiciel leur donne désormais un chemin
    // déclaré (`imputerAuxCapitauxPropresDOuverture`). Ce contrôle regarde ce
    // qui a mouvementé le compte 12 EN DEHORS de ce chemin et de la clôture.
    //
    // CE QUE RIEN NE VOYAIT. Une écriture ordinaire sur le report à nouveau
    // s'équilibre comme les autres, la balance boucle, et le bilan d'ouverture
    // cesse de correspondre à la clôture précédente sans qu'aucun total ne
    // bouge. Elle est de surcroît indiscernable d'une simple erreur
    // d'imputation · c'est exactement ce que le motif déclaré résout.
    const brut12 = await this.prisma.ligneEcriture.findMany({
      where: {
        compte: { tenantId, numero: { startsWith: '12' } },
        ecriture: {
          tenantId,
          exerciceId,
          estGenereeParCloture: false,
          motifImputationOuverture: null,
          //
          // L'AFFECTATION DU RÉSULTAT N'EST PAS UNE IMPUTATION NON DÉCLARÉE ·
          // c'est le chemin ORDINAIRE du compte 12, et le SYCEBNL le rend même
          // obligatoire (fiche du COMPTE 13 : « le résultat net de l'exercice
          // précédent non affecté à un compte de réserves sera viré au compte
          // 12 »). Sans cette exclusion, l'avertissement tombait sur tout
          // dossier dès son premier exercice affecté.
          //
          // Un avertissement présent partout est un avertissement qu'on
          // apprend à ignorer : le contrôle 22 est le SEUL garde-fou du
          // compte 12, et le jour où une OD manuelle l'aurait vraiment
          // mouvementé, elle se serait noyée dans la même ligne que
          // l'affectation de l'année. C'était donc le garde-fou lui-même que
          // le bruit détruisait.
          //
          // La borne passe par la RELATION, jamais par un drapeau posé sur
          // l'écriture · `AffectationResultat.ecritureId` est @unique et
          // pointe l'écriture (schema.prisma, relation « AffectationEcriture »).
          // Un drapeau serait recopiable à la main dans une OD, la relation
          // ne l'est pas : elle n'existe que si une décision d'affectation a
          // réellement été enregistrée.
          affectationResultat: null,
        },
      },
      select: {
        debit: true,
        credit: true,
        compte: { select: { numero: true, intitule: true } },
        ecriture: { select: { numeroPiece: true, date: true, libelle: true } },
      },
    });
    // Le préfixe est REVÉRIFIÉ ici, et l'écriture doit être présente · même
    // raison que pour les contrôles 14 à 19 : une seule fonction sert toutes
    // les lectures de lignes dans les faux de test, et un contrôle qui se
    // fierait au filtre de la requête se déclencherait sur les données d'un
    // autre. La vérification en JavaScript le rend indépendant.
    const lignes12 = brut12.filter((l) => l.compte?.numero?.startsWith('12') && l.ecriture);
    if (lignes12.length > 0) {
      anomalies.push({
        code: 'IMPUTATION_REPORT_A_NOUVEAU_NON_DECLAREE',
        gravite: 'AVERTISSEMENT',
        libelle: 'Report à nouveau mouvementé hors clôture et hors exception déclarée',
        consequence:
          `Le bilan d’ouverture d’un exercice doit correspondre au bilan de clôture du précédent (${
            tenant.referentiel === Referentiel.SYCEBNL
              ? 'SYCEBNL art. 16, 4) et cadre conceptuel § 3.3.1.2.4'
              : 'AUDCIF art. 34 et Titre V'
          }). Les incidences d’un changement de méthode et les charges ou produits d’exercices antérieurs omis ` +
          'transitent par le compte de résultat, JAMAIS directement par les capitaux propres. Deux exceptions ' +
          'seulement : un changement de méthode à impact fort significatif, et la correction d’une erreur ' +
          'significative d’un exercice antérieur. Ces écritures n’en déclarent aucune · elles rompent donc la ' +
          'correspondance sans qu’aucun total ne bouge, et rien ne les distingue d’une erreur d’imputation.',
        action:
          'Si l’imputation relève de l’une des deux exceptions, refaites-la depuis la fenêtre Exercices, bloc ' +
          '« Imputation aux capitaux propres d’ouverture », en indiquant le motif et sa justification (les deux ' +
          'textes exigent l’information en Notes annexes). Sinon, extournez et passez l’opération par le compte ' +
          'de résultat.',
        occurrences: lignes12.slice(0, 200).map((l) => ({
          reference: `${l.compte.numero} ${l.compte.intitule}`,
          detail: `Pièce ${l.ecriture.numeroPiece} · ${l.ecriture.libelle}`,
          montant: Math.round((Number(l.debit) - Number(l.credit)) * 100) / 100,
          date: l.ecriture.date.toISOString().slice(0, 10),
        })),
      });
    }

    // --- 23. Bâtiment sur sol propre entré sans ventilation du terrain -------
    //
    // « La ventilation du coût d'acquisition d'un immeuble entre le terrain et
    // la construction doit être effectuée dès l'origine, à la date
    // d'inscription à l'actif du bilan » (AUDCIF, Titre VIII ch. 11 § 1.7.1).
    // Le SYCEBNL le dit de son côté, fiche du COMPTE 23 : « La valeur des
    // terrains n'est pas comprise dans celle des bâtiments. Les terrains et
    // les bâtiments doivent faire l'objet d'évaluation distincte. » Les deux
    // textes emploient l'impératif, chacun dans le sien, et l'art. 38 de
    // l'AUDCIF n'est pas exclu par l'art. 3 du SYCEBNL.
    //
    // CE QUI CASSE EN SILENCE. Un immeuble acheté d'un bloc et entré sur un
    // seul compte 231 s'amortit EN ENTIER, terrain compris. L'écriture
    // s'équilibre, la balance boucle, le bilan boucle · et la dotation est
    // majorée chaque exercice de la part du terrain, qui ne s'use pas. Au
    // terme du plan, le bilan porte zéro pour un terrain qui vaut toujours son
    // prix. Aucun total ne le trahit, et l'erreur se répète à l'identique
    // d'année en année sans jamais produire d'écart de rapprochement.
    //
    // LE 231 SEULEMENT, ET C'EST LE POINT DÉLICAT. Les deux plans distinguent
    // 231 « sur sol propre » et 232 « sur sol d'autrui ». Un bâtiment sur sol
    // d'autrui n'a par définition aucun terrain à ventiler · c'est le sujet
    // propre du ch. 11 section 1, et crier dessus serait un faux positif
    // permanent. Les ouvrages d'infrastructure (233) sont écartés pour la même
    // raison de prudence : le chapitre vise l'immeuble bâti.
    //
    // UN AVERTISSEMENT, JAMAIS UN REFUS. Le logiciel ne connaît pas la part du
    // terrain, et l'art. 38 laisse le choix entre deux méthodes quand l'acte
    // ne la détaille pas. Une saisie imposée ferait inventer un chiffre.
    const batimentsSolPropre = await this.prisma.immobilisation.findMany({
      where: {
        tenantId,
        statut: 'EN_SERVICE',
        compteImmobilisation: { numero: { startsWith: '231' } },
      },
      select: {
        designation: true,
        valeurOrigine: true,
        dateAcquisition: true,
        compteImmobilisation: { select: { numero: true, intitule: true } },
        // L'écriture d'acquisition porte la preuve : si aucune de ses lignes
        // ne touche un compte 22, le prix global est resté sur le bâtiment.
        ecritureAcquisition: {
          select: { numeroPiece: true, lignes: { select: { compte: { select: { numero: true } } } } },
        },
      },
    });
    const sansLigneDeTerrain = batimentsSolPropre.filter(
      (i) =>
        i.compteImmobilisation?.numero?.startsWith('231') &&
        i.ecritureAcquisition &&
        !i.ecritureAcquisition.lignes.some((l) => l.compte?.numero?.startsWith('22')),
    );
    // LA VENTILATION SE LIT LÀ OÙ LE MODULE PEUT LA PORTER (passe R5-B3). Le
    // module des immobilisations écrit l'acquisition en DEUX lignes exactement
    // (le bien, sa contrepartie), et la contrepartie n'est jamais un 22 · un
    // bâtiment créé par lui était donc signalé à chaque exercice, même avec
    // son terrain entré sur sa propre fiche. Le contrôle fabriquait l'anomalie
    // qu'il dénonce (§ 10 bis). Le terrain est tenu pour ventilé quand une
    // fiche au compte 22 porte la MÊME date d'acquisition, ou qu'une ligne au
    // débit d'un 22 est passée le même jour. Une déclaration « sans terrain »
    // sur la fiche n'existe pas encore au schéma.
    let sansTerrain = sansLigneDeTerrain;
    if (sansLigneDeTerrain.length > 0) {
      const jour = (d: Date) => d.toISOString().slice(0, 10);
      const dates = [...new Set(sansLigneDeTerrain.map((i) => jour(i.dateAcquisition)))].map((d) => new Date(d));
      const [terrains, lignesTerrain] = await Promise.all([
        this.prisma.immobilisation.findMany({
          where: { tenantId, compteImmobilisation: { numero: { startsWith: '22' } } },
          select: { dateAcquisition: true },
        }),
        this.prisma.ligneEcriture.findMany({
          where: {
            debit: { gt: 0 },
            compte: { tenantId, numero: { startsWith: '22' } },
            ecriture: { tenantId, date: { in: dates } },
          },
          select: { ecriture: { select: { date: true } } },
        }),
      ]);
      const joursVentiles = new Set([
        ...terrains.map((t) => jour(t.dateAcquisition)),
        ...lignesTerrain.map((l) => jour(l.ecriture.date)),
      ]);
      sansTerrain = sansLigneDeTerrain.filter((i) => !joursVentiles.has(jour(i.dateAcquisition)));
    }
    if (sansTerrain.length > 0) {
      const sourceVentilation =
        tenant.referentiel === Referentiel.SYCEBNL
          ? 'SYCEBNL, Partie 2 ch. 3, fiche du compte 23'
          : 'AUDCIF, Titre VIII ch. 11 § 1.7.1 et art. 38';
      anomalies.push({
        code: 'BATIMENT_SANS_VENTILATION_TERRAIN',
        gravite: 'AVERTISSEMENT',
        libelle: 'Bâtiment sur sol propre entré sans part de terrain',
        consequence:
          `Le texte (${sourceVentilation}) impose de distinguer dès l’origine la valeur du terrain de celle de ` +
          'la construction. Aucun terrain (compte 22) n’est entré le jour de l’acquisition de ces biens, ni par ' +
          'leur écriture, ni sur une fiche, ni par une autre écriture : le prix global est ' +
          'donc resté sur le bâtiment, et il s’amortit EN ENTIER, terrain compris. La dotation est majorée de la ' +
          'part du terrain à chaque exercice, le résultat minoré d’autant, et la valeur nette du terrain s’érode ' +
          'alors qu’un terrain ne s’use pas. Rien ne le trahit : l’écriture s’équilibre et la balance boucle. ' +
          'Au SYSCOHADA, la dotation excédentaire n’est de surcroît pas déductible.',
        action:
          'Ventilez le prix d’acquisition entre le terrain (compte 22) et la construction (compte 231), pour le ' +
          'montant porté dans l’acte notarié. Si l’acte ne le détaille pas, l’art. 38 laisse le choix de la ' +
          'méthode (comparaison avec des terrains nus voisins, ou coût de reconstruction) · le montant retenu ' +
          'vous appartient, le logiciel ne le devine pas. Aucun avertissement n’est levé sur un bâtiment sur ' +
          'sol d’autrui (compte 232), qui n’a pas de terrain à ventiler.',
        occurrences: sansTerrain.slice(0, 200).map((i) => ({
          reference: `${i.compteImmobilisation.numero} ${i.designation}`,
          detail: `Acquisition ${i.ecritureAcquisition?.numeroPiece ?? ''} · aucun terrain entré le même jour`,
          montant: Math.round(Number(i.valeurOrigine) * 100) / 100,
          date: i.dateAcquisition.toISOString().slice(0, 10),
        })),
      });
    }

    // -----------------------------------------------------------------------
    // 24 · CONVENTION DE FINANCEMENT EXPIRÉE, RAPPORT AU BAILLEUR EN RETARD
    // -----------------------------------------------------------------------
    //
    // LA CONVENTION D'UN BAILLEUR N'EST PAS L'ACCORD-CADRE (audit final F76).
    // L'accord-cadre avec le Ministère du Plan conditionne l'existence en RDC
    // d'une ONG ÉTRANGÈRE (loi n° 004/2001, art. 37) et se contrôle dans son
    // module (contrôle 29). Une convention de financement est un contrat
    // avec un bailleur · échue, elle pose la question du reste à recevoir, et
    // d'aucune autre chose. Le message citait l'art. 37 à toute association,
    // congolaise comprise, et lui disait qu'elle exerçait « sans titre ».
    //
    // SYCEBNL SEULEMENT · la convention de financement suit le bailleur, qui
    // est une notion de la division 46 du SYCEBNL.
    if (tenant.referentiel === Referentiel.SYCEBNL) {
      const maintenant = new Date();
      const conventions = await this.prisma.conventionFinancement.findMany({
        where: { tenantId, statut: 'EN_COURS' },
        select: {
          reference: true,
          objet: true,
          dateFin: true,
          montantAccorde: true,
          caractere: true,
          ecritSigne: true,
          bailleur: { select: { code: true, nom: true } },
          rapports: { select: { intitule: true, dateEcheance: true, dateTransmission: true } },
        },
      });

      const expirees = conventions.filter((c) => c.dateFin < maintenant);
      if (expirees.length > 0) {
        anomalies.push({
          code: 'CONVENTION_FINANCEMENT_EXPIREE',
          gravite: 'AVERTISSEMENT',
          libelle: 'Convention de financement arrivée à terme et toujours en cours',
          consequence:
            'Ces conventions portent une date de fin dépassée et restent marquées EN COURS. Leur reste à recevoir ' +
            'continue donc d’être présenté comme attendu, alors que rien ne le fonde plus.',
          action:
            'Faites constater l’avenant de prorogation s’il existe, et reportez sa date de fin sur la convention. ' +
            'À défaut, clôturez la convention, ou résiliez-la avec son motif si le solde ne sera pas versé · la ' +
            'résiliation fait tomber le reste à recevoir.',
          occurrences: expirees.slice(0, 200).map((c) => ({
            reference: `${c.bailleur.code} · ${c.reference}`,
            detail: `${c.objet} · échue le ${c.dateFin.toISOString().slice(0, 10)}`,
            montant: Math.round(Number(c.montantAccorde) * 100) / 100,
            date: c.dateFin.toISOString().slice(0, 10),
          })),
        });
      }

      const rapportsEnRetard = conventions.flatMap((c) =>
        c.rapports
          .filter((r) => r.dateTransmission === null && r.dateEcheance < maintenant)
          .map((r) => ({ convention: c, rapport: r })),
      );
      if (rapportsEnRetard.length > 0) {
        anomalies.push({
          code: 'RAPPORT_BAILLEUR_NON_TRANSMIS',
          gravite: 'AVERTISSEMENT',
          libelle: 'Rapport dû à un bailleur, échu et non transmis',
          consequence:
            'Un rapport en retard n’est pas une omission administrative : la plupart des conventions en font la ' +
            'condition du versement de la tranche suivante. Aucun solde ne le dit, et c’est le décaissement ' +
            'attendu qui ne viendra pas.',
          action:
            'Transmettez le rapport et datez sa transmission ici. Si la convention a été prorogée ou le rapport ' +
            'reporté, corrigez son échéance plutôt que de laisser l’avertissement se répéter à chaque clôture.',
          occurrences: rapportsEnRetard.slice(0, 200).map(({ convention, rapport }) => ({
            reference: `${convention.bailleur.code} · ${convention.reference}`,
            // Un rapport n'a pas de montant · le champ est facultatif, on
            // l'omet plutôt que d'afficher un zéro qui se lirait comme une
            // somme.
            detail: `${rapport.intitule} · dû le ${rapport.dateEcheance.toISOString().slice(0, 10)}`,
            date: rapport.dateEcheance.toISOString().slice(0, 10),
          })),
        });
      }

      // Le § 5.4.2.4 fait de l'écrit signé une CONDITION de la
      // comptabilisation : « ferme et inconditionnel ET a fait l'objet d'un
      // écrit signé ». Une convention déclarée ferme sans son écrit ne peut
      // pas être portée en créance, et c'est l'erreur naturelle · le cabinet
      // sait l'engagement ferme, et croit que cela suffit.
      const fermesSansEcrit = conventions.filter((c) => c.caractere === 'FERME_INCONDITIONNEL' && !c.ecritSigne);
      if (fermesSansEcrit.length > 0) {
        anomalies.push({
          code: 'ENGAGEMENT_FERME_SANS_ECRIT_SIGNE',
          gravite: 'INFORMATION',
          libelle: 'Engagement déclaré ferme, sans écrit signé enregistré',
          consequence:
            'Le cadre conceptuel SYCEBNL, § 5.4.2.4, pose DEUX conditions à la comptabilisation d’un engagement ' +
            'de financement en créances à recevoir : qu’il soit « ferme et inconditionnel » ET qu’il ait « fait ' +
            'l’objet d’un écrit signé par les représentants habilités des tiers financeurs ». Ces conventions ne ' +
            'remplissent que la première : portées en créance, elles gonfleraient l’actif sans pièce opposable à ' +
            'un réviseur.',
          action:
            'Joignez la référence de l’écrit signé et nommez son signataire sur la convention. Tant qu’il manque, ' +
            'l’engagement reste une mention de Notes annexes et non une créance.',
          occurrences: fermesSansEcrit.slice(0, 200).map((c) => ({
            reference: `${c.bailleur.code} · ${c.reference}`,
            detail: `${c.objet} · aucun écrit signé enregistré`,
            montant: Math.round(Number(c.montantAccorde) * 100) / 100,
          })),
        });
      }
    }

    // --- 25. Attestation d'exemption d'impôt sur les sociétés ---------------
    //
    // L'arrêté ministériel n° 007/CAB/MIN/FINANCES/2025 du 19 février 2025 fait
    // de l'attestation le VÉHICULE de l'exemption : son art. 2 pose que « le
    // bénéfice de l'exemption n'est pas automatique : il passe par une
    // attestation d'exemption ». Sans elle, l'exemption n'est pas obtenue, et
    // c'est ce que ce contrôle signale · rien de plus.
    //
    // TROIS BORNES, ET CHACUNE ÉVITE UN REPROCHE INFONDÉ.
    //
    // 1. LE RÉFÉRENTIEL. Une société commerciale n'est pas une entité à but non
    //    lucratif : l'arrêté ne la vise pas, et sa forme juridique EBNL ne veut
    //    rien dire.
    // 2. LE PÉRIMÈTRE DE L'ARRÊTÉ. Son art. 1er ne vise QUE les établissements
    //    d'utilité publique et les organisations non gouvernementales. Une
    //    association du point 3 de l'art. 5 de la loi n° 23/053 n'y est pas
    //    soumise, et lui réclamer une attestation serait une exigence inventée.
    //    C'est `attestationRequise` qui porte cette distinction, et NULL n'y est
    //    pas « non » : il veut dire que le fondement n'est pas qualifiable.
    // 3. L'ENTRÉE EN VIGUEUR. Art. 6 : l'arrêté entre en vigueur le 1er janvier
    //    2026. Le contrôle est PAR EXERCICE ; sans cette borne, un dossier qui
    //    fait analyser son exercice 2024 ou 2025 se verrait reprocher une pièce
    //    qu'aucun texte ne lui demandait alors, au nom d'un arrêté qui n'était
    //    pas en vigueur.
    //
    // CE QUE LE CONTRÔLE NE FAIT PAS · il ne surveille aucune échéance. Les six
    // articles de l'arrêté ne fixent aucune durée de validité, aucun
    // renouvellement, aucun délai : un compte à rebours serait une règle
    // inventée. Et l'échéance n'est de toute façon pas le risque, l'art. 5
    // n'attachant l'impôt qu'au non-respect des art. 3 et 4.
    if (tenant.referentiel === Referentiel.SYCEBNL && ex.dateFin >= ENTREE_EN_VIGUEUR_AM_007_2025) {
      const qualification = qualifierExemptionIs({
        formeJuridique: tenant.formeJuridique,
        droitEtranger: tenant.droitEtranger,
        actePersonnaliteJuridique: tenant.actePersonnaliteJuridique,
        attestationExemptionIs: tenant.attestationExemptionIs,
        dateAttestationExemptionIs: tenant.dateAttestationExemptionIs,
      });
      if (qualification.attestationRequise === true && !qualification.attestationConnue) {
        anomalies.push({
          code: 'ATTESTATION_EXEMPTION_IS_ABSENTE',
          gravite: 'AVERTISSEMENT',
          libelle: "Attestation d'exemption d'impôt sur les sociétés non enregistrée",
          consequence:
            'Arrêté n° 007/2025, art. 2 : « Le bénéfice de l’exemption n’est pas automatique : il passe par une ' +
            'attestation d’exemption, délivrée par l’Administration des Impôts sur demande de la structure ' +
            'concernée, dont elle définit le modèle. La demande est adressée au Directeur Général des Impôts. » ' +
            'Aucune attestation n’est enregistrée dans ce dossier, dont la forme juridique relève du point 5 de ' +
            'l’art. 5 de la loi n° 23/053. Tant qu’elle manque, l’exemption ne peut pas être présentée comme ' +
            'acquise, et c’est la première pièce demandée au contrôle. Le logiciel ne conclut pas à ' +
            'l’imposition : l’art. 5 de l’arrêté n’attache l’impôt qu’au non-respect des conditions des art. 3 ' +
            'et 4, que nulle comptabilité ne permet de vérifier.',
          action:
            'Adressez la demande d’attestation au Directeur Général des Impôts, puis reportez sa référence et sa ' +
            'date de délivrance dans Paramètres du dossier, rubrique « Exemption d’impôt sur les sociétés ». ' +
            'Le détail des pièces à joindre, propre à votre forme juridique, y est rappelé.',
          occurrences: [
            {
              reference: tenant.formeJuridique,
              detail: qualification.enonce,
            },
          ],
        });
      }
    }

    // --- 26. Écritures validées par leur propre auteur ----------------------
    //
    // GRAVITÉ INFORMATION, ET C'EST LA DÉCISION LA PLUS IMPORTANTE DE CE
    // CONTRÔLE. Aucun texte n'est enfreint. L'AUDCIF art. 22, 2° impose la
    // validation (« Toute donnée entrée fait l'objet d'une validation, mise en
    // œuvre au terme de chaque période qui ne peut excéder un mois ») et NE
    // NOMME PERSONNE. L'art. 69 délègue expressément la procédure à l'entité,
    // et le SYCEBNL fait de même par son art. 16, 2), l'art. 69 lui étant exclu
    // par son art. 3. Écrire « avertissement » ferait dire aux textes qu'ils
    // imposent une séparation qu'ils n'imposent pas. C'est le parti déjà pris
    // pour AVANCE_CLIENT_REPORTEE, qui porte une position de contrôle et non
    // une règle de l'AUDCIF.
    //
    // IL CONSTATE UNE COÏNCIDENCE D'IDENTITÉ, il ne qualifie ni ne conclut ·
    // même discipline que le test des écritures de journal, qui « sélectionne,
    // il ne conclut pas ».
    //
    // À QUI IL S'ADRESSE · aux dossiers qui n'ont PAS activé l'option (le refus
    // à la racine couvre déjà les autres) et à l'historique antérieur à son
    // activation, que rien ne dévalide · l'art. 22, 2° pose l'irréversibilité
    // des traitements.
    const validesParLeurAuteur = parcours.validesParLeurAuteur.elements;
    if (validesParLeurAuteur.length > 0) {
      anomalies.push({
        code: 'VALIDATION_PAR_SON_AUTEUR',
        gravite: 'INFORMATION',
        libelle: 'Écritures validées par la personne qui les a saisies',
        consequence:
          'Ces écritures sont entrées au livre-journal sur la seule décision de leur auteur. ' +
          (tenant.referentiel === Referentiel.SYCEBNL
            ? 'Le SYCEBNL, art. 16, 2), demande « la mise en place de procédures nécessaires à une organisation ' +
              'comptable permettant un contrôle interne fiable et le contrôle externe […] ». L’art. 69 de ' +
              'l’AUDCIF, qui délègue expressément ces procédures à l’entité, lui est exclu par l’art. 3.'
            : 'L’AUDCIF, art. 69, pose que « l’entité détermine, SOUS SA RESPONSABILITÉ, les procédures ' +
              'nécessaires à la mise en place d’une organisation comptable permettant aussi bien un contrôle ' +
              'interne fiable que le contrôle externe […] ».') +
          ' AUCUN TEXTE N’EXIGE que le validateur diffère de l’auteur : l’art. 22, 2° impose la validation et ne ' +
          'nomme personne. Ce signalement CONSTATE une coïncidence d’identité, il ne qualifie ni ne conclut, et ' +
          'un cabinet à un seul comptable est dans son droit.',
        action:
          'Si votre organisation prévoit un second regard, activez-le dans Paramètres du dossier · une écriture ' +
          'ne sera plus validable par son auteur. Pour le dossier à un seul comptable, la validation peut porter ' +
          'le nom du second regard exercé hors logiciel et son motif, qui s’impriment alors au journal. Rien ' +
          'n’est dévalidé rétroactivement : l’art. 22, 2° interdit « toute suppression, addition ou modification ' +
          'ultérieure ».',
        ...nombreSiTronque(parcours.validesParLeurAuteur),
        occurrences: validesParLeurAuteur.map((e) => ({
          reference: `${e.journal.code} n° ${e.numeroPiece ?? ''}`,
          detail: e.libelle,
          date: e.date.toISOString().slice(0, 10),
        })),
      });
    }

    // ------------------------------------------------------------------
    // RÉÉVALUATION · la déclaration spéciale que rien ne rappelait.
    //
    // CE CONTRÔLE EST NÉ D'UNE VÉRIFICATION, PAS D'UNE DEMANDE. Le relevé de
    // manques annonçait « une déclaration spéciale avant le 30 avril » et
    // « une astreinte de 100 000 CDF par jour ». Les deux chiffres viennent
    // de l'Ordonnance-loi n° 89/017 du 18 février 1989, art. 16 et 20 · un
    // texte ABROGÉ par la loi n° 23/053, art. 152 point 3, avec effet au
    // 1er janvier 2026. Les coder tels quels aurait produit exactement le
    // défaut du § 10 bis de CLAUDE.md : un signalement plausible, sourcé et
    // faux, que le cabinet aurait corrigé sans jamais savoir qu'il n'existait
    // pas · et une sanction sous-évaluée d'un facteur trois.
    //
    // LE TEXTE EN VIGUEUR, lu dans la compilation DGI au 19 juillet 2026 :
    //  · art. 136 · « Toutes les entreprises procédant à la réévaluation
    //    doivent faire parvenir à l'Administration des Impôts, AU PLUS TARD
    //    LE 30 AVRIL de chaque année, une déclaration spéciale de résultat de
    //    la réévaluation en plus de la déclaration de revenus réalisés au
    //    cours de l'exercice. »
    //  · art. 138 · « En cas de réévaluation, l'absence du dépôt de la
    //    déclaration spéciale de résultats de réévaluation est passible d'une
    //    astreinte fiscale de 300.000,00 Francs congolais PAR JOUR jusqu'à la
    //    régularisation de la situation. »
    //
    // LE CONTRÔLE NE CONSTATE JAMAIS LE MANQUEMENT. Le dépôt d'une
    // déclaration est un fait externe, qu'aucune balance ne porte. Il
    // RAPPELLE une obligation à un dossier qui a mouvementé un compte de
    // réévaluation, et c'est tout · d'où la gravité INFORMATION.
    //
    // ET IL NE VISE PAS LES ENTITÉS EXEMPTÉES D'OFFICE. L'art. 136 dit « toutes
    // les entreprises procédant à la réévaluation », sans réserve d'exemption,
    // mais il ne définit pas « entreprise » et l'ancienne ordonnance-loi, qui
    // visait expressément les exonérés (son art. 1er), n'a pas été reprise sur
    // ce point. Les sources ne tranchent pas : le rappel est servi aux deux
    // référentiels, et le message porte la réserve plutôt que de la taire.
    if (ex.dateFin >= ENTREE_EN_VIGUEUR_LOI_23_053) {
      const lignesReevaluation = await this.prisma.ligneEcriture.findMany({
        where: {
          ecriture: { tenantId, exerciceId },
          OR: COMPTES_REEVALUATION.map((r) => ({ compte: { tenantId, numero: { startsWith: r } } })),
        },
        select: { debit: true, credit: true, compte: { select: { numero: true, intitule: true } } },
      });
      const parCompte = new Map<string, { intitule: string; mouvement: number }>();
      for (const l of lignesReevaluation) {
        const acc = parCompte.get(l.compte.numero) ?? { intitule: l.compte.intitule, mouvement: 0 };
        acc.mouvement += Math.abs(Number(l.debit)) + Math.abs(Number(l.credit));
        parCompte.set(l.compte.numero, acc);
      }
      const mouvementees = [...parCompte.entries()]
        .filter(([, v]) => v.mouvement > 0.005)
        .map(([numero, v]) => ({ numero, intitule: v.intitule }))
        .sort((a, b) => a.numero.localeCompare(b.numero));
      if (mouvementees.length > 0) {
        anomalies.push({
          code: 'DECLARATION_REEVALUATION_A_DEPOSER',
          gravite: 'INFORMATION',
          libelle: 'Réévaluation constatée · déclaration spéciale à déposer au plus tard le 30 avril',
          consequence:
            'Un compte de réévaluation a été mouvementé sur cet exercice. Loi n° 23/053, art. 136 : « Toutes ' +
            'les entreprises procédant à la réévaluation doivent faire parvenir à l’Administration des Impôts, ' +
            'AU PLUS TARD LE 30 AVRIL de chaque année, une déclaration spéciale de résultat de la réévaluation ' +
            'en plus de la déclaration de revenus réalisés au cours de l’exercice. » L’art. 138 sanctionne ' +
            'l’absence de dépôt d’« une astreinte fiscale de 300.000,00 Francs congolais PAR JOUR jusqu’à la ' +
            'régularisation de la situation ». OmegaX NE CONSTATE AUCUN MANQUEMENT · le dépôt est un fait ' +
            'externe qu’aucune comptabilité ne porte, et ce signalement est un rappel, pas un reproche. ' +
            'Réserve à connaître : l’art. 136 vise « toutes les entreprises » sans définir le mot et sans ' +
            'réserve d’exemption. Pour une entité à but non lucratif, le point n’est tranché par aucun ' +
            'texte lu.',
          action:
            'Établissez la déclaration spéciale sur le modèle des imprimés du Conseil Permanent de la ' +
            'Comptabilité au Congo, avec ses annexes par catégorie d’immobilisations (art. 137), et déposez-la ' +
            'au plus tard le 30 avril. Vérifiez au passage les trois exigences comptables de l’opération : la ' +
            'réévaluation porte sur l’ENSEMBLE des immobilisations corporelles et financières (art. 130 de la ' +
            'loi, art. 62 de l’AUDCIF · toute réévaluation partielle est interdite), la décision émane des ' +
            'organes de gestion et indique la méthode, les postes concernés, les montants et le traitement ' +
            'fiscal de l’écart, et l’écart n’est ni distribuable (art. 65 AUDCIF) ni, pour les éléments AMORTISSABLES, imputable sur des pertes (loi n° 23/053, art. 133, alinéa 4). Les deux interdits viennent de DEUX textes distincts : l’article 65 de l’AUDCIF ne pose que la non-distribution, et la compensation des pertes n’est prohibée que par la loi fiscale.',
          occurrences: mouvementees.slice(0, 50).map((l) => ({
            reference: l.numero,
            detail: l.intitule,
          })),
        });
      }
    }

    // ------------------------------------------------------------------
    // STOCKS ET PRODUCTION IMMOBILISÉE · les deux griefs du CPCC, dans la
    // seule forme qui ait une signature.
    //
    // CE QUI N'EST PAS CODÉ ICI, ET POURQUOI. Le § 8.2 du séminaire nomme
    // deux minorations « par absence d'une écriture de contrepartie » : la
    // facture d'achat enregistrée sans constatation du stock en cours de
    // route, et la production immobilisée jamais activée au compte 72. Les
    // deux sont réelles, et AUCUNE DES DEUX N'EST DÉTECTABLE SOUS CETTE
    // FORME · elles se définissent par ce qui MANQUE. « Solde du 72 égal à
    // zéro » se vérifie chez toute entité qui achète au lieu de produire,
    // c'est-à-dire chez la quasi-totalité des dossiers, et un contrôle qui
    // s'allume partout n'apprend rien à personne : il apprend seulement à
    // être ignoré, et emporte les vrais signalements avec lui.
    //
    // CE QUI EST CODÉ EST L'AUTRE MOITIÉ · non pas l'absence du compte, mais
    // sa PRÉSENCE SANS SA CONTREPARTIE. Un 72 crédité sans immobilisation
    // entrée, un stock en cours de route mouvementé sans variation de stock,
    // une dépréciation sans le poste qu'elle déduit. Là, le dossier a écrit
    // quelque chose, et ce qu'il a écrit ne boucle pas.
    const referentielDossier = tenant.referentiel;
    const racinesStocks = [
      '3',
      ...IMMOBILISATIONS_DE_LA_PRODUCTION,
      '603',
      '72',
    ];
    const lignesStocks = await this.prisma.ligneEcriture.findMany({
      where: {
        // SANS LE SOLDE DE CLÔTURE (régression de l'audit final F4) · validé,
        // il solde le 603 et le 72 sur tout exercice clos, et leurs cumuls
        // ne diraient plus ce que l'exercice a passé.
        ecriture: { tenantId, exerciceId, estSoldeDesComptesDeGestion: false },
        OR: racinesStocks.map((r) => ({ compte: { tenantId, numero: { startsWith: r } } })),
      },
      select: { debit: true, credit: true, compte: { select: { numero: true, intitule: true } } },
    });
    const cumul = (predicat: (numero: string) => boolean) =>
      lignesStocks
        .filter((l) => predicat(l.compte.numero))
        .reduce(
          (t, l) => ({
            debit: t.debit + Number(l.debit),
            credit: t.credit + Number(l.credit),
          }),
          { debit: 0, credit: 0 },
        );
    const parNumero = new Map<string, { intitule: string; debit: number; credit: number }>();
    for (const l of lignesStocks) {
      const acc = parNumero.get(l.compte.numero) ?? { intitule: l.compte.intitule, debit: 0, credit: 0 };
      acc.debit += Number(l.debit);
      acc.credit += Number(l.credit);
      parNumero.set(l.compte.numero, acc);
    }

    // --- Une dépréciation de stock à un numéro que le plan n'ouvre pas ------
    const subdivisionsAdmises = DEPRECIATIONS_STOCKS[referentielDossier];
    const depreciationsMouvementees = [...parNumero.entries()]
      .filter(([n, v]) => n.startsWith('39') && n.length >= 3 && v.debit + v.credit > 0.005)
      .sort(([a], [b]) => a.localeCompare(b));
    const horsNomenclature = depreciationsMouvementees.filter(
      ([n]) => !subdivisionsAdmises.includes(n.slice(0, 3)),
    );
    if (horsNomenclature.length > 0) {
      anomalies.push({
        code: 'DEPRECIATION_STOCK_HORS_NOMENCLATURE',
        gravite: 'AVERTISSEMENT',
        libelle: 'Dépréciation de stocks à une subdivision que le plan n’ouvre pas',
        consequence:
          `Le plan ${referentielDossier} ouvre au compte 39 les seules subdivisions ` +
          `${subdivisionsAdmises.join(', ')}. ` +
          (referentielDossier === Referentiel.SYCEBNL
            ? 'Il n’a ni 394 « produits en cours », ni 395 « services en cours », ni 398 : son 396 couvre à lui ' +
              'seul « produits finis, produits intermédiaires et résiduels », et son 397 les stocks en cours de ' +
              'route. Une dépréciation portée ailleurs déduit un poste de bilan qui n’existe pas dans ce plan, ' +
              'et la Note annexe la publiera sous un intitulé emprunté à l’autre référentiel.'
            : 'Une dépréciation portée hors de cette liste déduit un poste de bilan qui n’existe pas, et la Note ' +
              'annexe la publiera sous un intitulé qui n’est pas celui du plan.'),
        action:
          'Reclassez la dépréciation à la subdivision correspondant au stock déprécié · la règle est mécanique, ' +
          '39X déprécie 3X. Attention à l’intitulé et non au seul numéro : le 397 déprécie les produits ' +
          'intermédiaires et résiduels au SYSCOHADA, et les stocks en cours de route au SYCEBNL.',
        occurrences: horsNomenclature.slice(0, 200).map(([numero, v]) => ({
          reference: numero,
          detail: v.intitule,
          montant: Math.round((v.credit - v.debit) * 100) / 100,
        })),
      });
    }

    // --- Une dépréciation sans le poste qu'elle déduit ----------------------
    //
    // « Les dépréciations sont portées à l'actif du bilan, EN DÉDUCTION de la
    // valeur des postes qu'elles concernent » · les deux plans, mot pour mot.
    // Une dépréciation dont le poste est à zéro n'est pas une déduction :
    // c'est un actif négatif, et le total du bilan s'en trouve minoré sans
    // qu'aucune ligne ne le dise.
    const depreciationsOrphelines = depreciationsMouvementees
      .filter(([n, v]) => {
        if (!subdivisionsAdmises.includes(n.slice(0, 3))) return false;
        if (v.credit - v.debit <= 0.005) return false;
        const stock = cumul((x) => x.startsWith(compteStockAdosse(n.slice(0, 3))));
        return Math.abs(stock.debit - stock.credit) <= 0.005;
      })
      .map(([numero, v]) => ({ numero, intitule: v.intitule, solde: v.credit - v.debit }));
    if (depreciationsOrphelines.length > 0) {
      anomalies.push({
        code: 'DEPRECIATION_STOCK_SANS_STOCK',
        gravite: 'AVERTISSEMENT',
        libelle: 'Dépréciation de stocks sans le poste qu’elle déduit',
        consequence:
          'Une dépréciation de stocks porte un solde créditeur alors que le compte de stock adossé est à zéro. ' +
          'Les deux plans écrivent la même phrase : les dépréciations « sont portées à l’actif du bilan, EN ' +
          'DÉDUCTION de la valeur des postes qu’elles concernent ». Une déduction sans poste n’est pas une ' +
          'déduction, c’est un actif négatif · le total du bilan est minoré du montant, et aucune ligne ne le dit.',
        action:
          'Deux cas seulement. Le stock a été soldé sans que sa dépréciation le soit : reprenez la dépréciation ' +
          'par le crédit du 7593 (ou du 849 si elle était H.A.O.). Ou la dépréciation est au mauvais numéro : ' +
          'reclassez-la sur la subdivision du stock réellement déprécié.',
        occurrences: depreciationsOrphelines.slice(0, 200).map((d) => ({
          reference: `${d.numero} ${d.intitule}`,
          detail: `Compte de stock ${compteStockAdosse(d.numero.slice(0, 3))} sans solde`,
          montant: Math.round(d.solde * 100) / 100,
        })),
      });
    }

    // --- Un stock en cours de route mouvementé sans variation de stock ------
    //
    // LA MOITIÉ DÉTECTABLE DU PREMIER GRIEF. Les deux plans donnent au compte
    // le même fonctionnement, dans les deux systèmes d'inventaire : il est
    // débité « par le crédit des sous-comptes 603 concernés », et crédité par
    // leur débit ou par les comptes de stocks. Un solde qui apparaît sans
    // qu'aucun 603 n'ait bougé n'a pas de contrepartie de gestion : l'actif
    // est là, la charge n'a pas été neutralisée, et le résultat reste minoré
    // du montant · exactement ce que le séminaire décrit, mais pris par le
    // bout qui laisse une trace.
    const racineEnCoursDeRoute = STOCK_EN_COURS_DE_ROUTE[referentielDossier];
    // Le 388 du SYSCOHADA et le 378 du SYCEBNL sont sous le compte des stocks
    // en route sans en être · le premier a son contrôle propre, juste après. Le compter ici annoncerait « l'achat
    // reste seul en charge » sur des matières récupérées, qu'aucun achat n'a
    // fait entrer.
    const enCoursDeRoute = cumul(
      (n) =>
        n.startsWith(racineEnCoursDeRoute) &&
        !n.startsWith(STOCK_PROVENANT_D_IMMOBILISATIONS_PAR_REFERENTIEL[referentielDossier]),
    );
    const variationsStocks = cumul((n) => n.startsWith('603'));
    if (
      enCoursDeRoute.debit + enCoursDeRoute.credit > 0.005 &&
      variationsStocks.debit + variationsStocks.credit <= 0.005
    ) {
      anomalies.push({
        code: 'STOCK_EN_COURS_DE_ROUTE_SANS_VARIATION',
        gravite: 'AVERTISSEMENT',
        libelle: 'Stock en cours de route mouvementé sans aucune variation de stock',
        consequence:
          `Le compte ${racineEnCoursDeRoute} a été mouvementé sur l’exercice alors qu’aucun compte 603 ` +
          '« Variations des stocks de biens achetés » ne l’a été. Les deux plans donnent au compte le même ' +
          'fonctionnement, dans les deux systèmes d’inventaire : il est débité « par le crédit des sous-comptes ' +
          '603 concernés ». Sans cette contrepartie, l’achat reste seul en charge et le stock apparaît sans ' +
          'que la charge ait été neutralisée · le résultat est minoré du montant, et l’écriture s’équilibre ' +
          'quand même.',
        action:
          `Passez la variation de stock au compte 603 correspondant, en contrepartie du ${racineEnCoursDeRoute}. ` +
          'Si la marchandise a en réalité été réceptionnée avant la clôture, ce n’est pas le bon compte : ' +
          `ventilez-la dans le compte de stock de sa nature, le ${racineEnCoursDeRoute} n’étant qu’un compte de passage.`,
        occurrences: [
          {
            reference: `${racineEnCoursDeRoute} Stocks en cours de route, en consignation ou en dépôt`,
            detail: 'Mouvement de l’exercice sans contrepartie au 603',
            montant: Math.round((enCoursDeRoute.debit - enCoursDeRoute.credit) * 100) / 100,
          },
        ],
      });
    }

    // --- Le 388 non soldé à la clôture (SYSCOHADA) ---------------------------
    //
    // AUDCIF Titre VIII, dépréciation des stocks, § 2.8 : les matières
    // récupérées d'une immobilisation mise hors service entrent au 388 EN
    // COURS d'exercice, et « en fin d'exercice, le compte 388 est SOLDÉ par le
    // débit du compte 603 », ce qui subsiste passant au compte de classe 3 de
    // sa nature par le crédit du 603. Un 388 encore ouvert à la clôture est
    // donc une écriture de fin d'exercice qui n'a pas été passée · le stock
    // figure au bilan sous un compte qui doit être vide, et la variation de
    // l'exercice n'a pas neutralisé l'entrée.
    if (referentielDossier === Referentiel.SYSCOHADA) {
      const recupere = cumul((n) =>
        n.startsWith(STOCK_PROVENANT_D_IMMOBILISATIONS_PAR_REFERENTIEL[Referentiel.SYSCOHADA]),
      );
      const solde388 = Math.round((recupere.debit - recupere.credit) * 100) / 100;
      if (Math.abs(solde388) > 0.005) {
        anomalies.push({
          code: 'STOCK_IMMOBILISATIONS_388_NON_SOLDE',
          gravite: 'AVERTISSEMENT',
          libelle: 'Stock provenant d’immobilisations (388) non soldé à la clôture',
          consequence:
            'Le compte 388 « Stock provenant d’immobilisations mises hors service ou au rebut » porte un solde. ' +
            'L’AUDCIF (Titre VIII, dépréciation des stocks, § 2.8) veut qu’« en fin d’exercice, le compte 388 ' +
            'est soldé par le débit du compte 603 Variations des stocks de biens achetés », les éléments qui ' +
            'subsistent étant inscrits « dans les comptes appropriés de la classe 3 par le crédit du compte 603 ». ' +
            'Le bilan porte le stock sous un compte qui doit être vide, et la balance boucle quand même.',
          action:
            'Soldez le 388 par le débit du 603, puis portez ce qui subsiste au compte de stock de sa nature par le ' +
            'crédit du 603. Le compte de classe 3 dépend de la nature des matières récupérées, et c’est à vous de le choisir.',
          occurrences: [
            {
              reference: '388 Stock provenant d’immobilisations mises hors service ou au rebut',
              detail: 'Solde à la clôture',
              montant: solde388,
            },
          ],
        });
      }
    }

    // --- Une production immobilisée sans immobilisation ---------------------
    //
    // LA MOITIÉ DÉTECTABLE DU SECOND GRIEF. Le 72 « est crédité du montant des
    // travaux effectués au cours de l'exercice par l'entité pour elle-même,
    // PAR LE DÉBIT du compte 21, du compte 23 ou 24 » · les deux plans, même
    // phrase. Un 72 crédité sans qu'aucune immobilisation ne soit entrée
    // signale une contrepartie manquante ou passée ailleurs, et cette
    // fois-ci le dossier a bien écrit quelque chose.
    //
    // AU SYSCOHADA, LE 721 ET LE 722 SEULS (passe R1-C1). La fiche AUDCIF du
    // compte 72 donne au 724 d'autres contreparties · « par le débit du compte
    // 104 (Compte de l'exploitant) ou des comptes 6617 et 6627 (Avantages en
    // nature) pour la production autoconsommée » · et le 726 (immobilisations
    // financières, « en cas d'OPE ou d'OPA ») n'a pas pour contrepartie un 21,
    // 23 ou 24. Les lire signalait une autoconsommation régulière comme un
    // bien produit sans actif. Au SYCEBNL, la fiche du 72 ne décrit aucune
    // contrepartie propre au 724 · rien n'y est transposé.
    const racinesProductionImmobilisee = referentielDossier === Referentiel.SYSCOHADA ? ['721', '722'] : ['72'];
    const estProductionImmobilisee = (n: string) => racinesProductionImmobilisee.some((r) => n.startsWith(r));
    const productionImmobilisee = cumul(estProductionImmobilisee);
    const entreesImmobilisations = IMMOBILISATIONS_DE_LA_PRODUCTION.reduce(
      (t, r) => t + cumul((n) => n.startsWith(r)).debit,
      0,
    );
    if (productionImmobilisee.credit - productionImmobilisee.debit > 0.005 && entreesImmobilisations <= 0.005) {
      anomalies.push({
        code: 'PRODUCTION_IMMOBILISEE_SANS_IMMOBILISATION',
        gravite: 'AVERTISSEMENT',
        libelle: 'Production immobilisée créditée sans entrée d’immobilisation',
        consequence:
          (referentielDossier === Referentiel.SYSCOHADA
            ? 'Les comptes 721 et 722 de la production immobilisée portent un solde créditeur alors qu’aucun ' +
              'compte 21, 23 ou 24 n’a été débité de l’exercice. La fiche du compte 72 (AUDCIF, Titre VII) le fait ' +
              'créditer « par le débit du compte 21 […] ou par le débit du compte 23 […] ou 24 » · la production ' +
              'autoconsommée (724), elle, a pour contrepartie le 104 ou les 6617 et 6627, et n’est pas lue ici.'
            : 'Le compte 72 « Production immobilisée » porte un solde créditeur alors qu’aucun compte 21, 23 ou 24 ' +
              'n’a été débité de l’exercice. La fiche du compte 72 le fait créditer « du montant des travaux ' +
              'effectués au cours de l’exercice par l’entité pour elle-même (au coût de production) ; par le débit : ' +
              'du compte 21 […] ; du compte 23 […] ; ou 24 ».') +
          ' Sans l’entrée en immobilisation, le produit est constaté sans l’actif qui le justifie, et l’exercice ' +
          'suivant ne portera aucun amortissement sur un bien pourtant en service.',
        // LES TRAVAUX NON ACHEVÉS VONT AUX COMPTES « EN COURS » (passe R1-C2) ·
        // 219, 239 ou 249, subdivisions des 21, 23 et 24 dans les deux plans.
        // Le 22 est celui des Terrains, que le 72 ne débite jamais, et un
        // comptable qui l'aurait suivi n'aurait pas fait tomber ce contrôle.
        action:
          'Portez le bien produit à l’actif, au coût de production, par le débit du compte d’immobilisation de ' +
          'sa nature · ou, si les travaux ne sont pas achevés à la clôture, du compte en cours de sa nature ' +
          '(219, 239 ou 249). Le coût retenu doit intégrer ' +
          'tous les intrants : matériaux consommés, charges directes et charges indirectes rattachables, et les ' +
          'frais financiers des emprunts exclusivement affectés à la fabrication, pour la seule période de ' +
          'fabrication.',
        occurrences: [...parNumero.entries()]
          .filter(([n, v]) => estProductionImmobilisee(n) && v.credit - v.debit > 0.005)
          .sort(([a], [b]) => a.localeCompare(b))
          .slice(0, 50)
          .map(([numero, v]) => ({
            reference: `${numero} ${v.intitule}`,
            detail: 'Aucune immobilisation entrée sur l’exercice',
            montant: Math.round((v.credit - v.debit) * 100) / 100,
          })),
      });
    }

    // --- 27. Colonne N-1 servie alors que les exercices ne se comparent pas ---
    //
    // LE SECOND ALINÉA QUE LE LOGICIEL NE LISAIT PAS. Les deux textes imposent
    // la colonne comparative ET, dans la même phrase, ce qu'il faut faire
    // quand elle ne vaut rien : « Lorsque l'un des postes chiffrés d'un état
    // financier n'est pas comparable à celui de l'exercice précédent, c'est ce
    // dernier qui doit être adapté. L'absence de comparabilité ou l'adaptation
    // des chiffres est signalée dans les Notes annexes. » OmegaX servait le
    // premier alinéa à treize endroits et ignorait le second.
    //
    // CE QUE RIEN NE VOYAIT · la colonne part d'office, remplie, avec des
    // totaux justes et un bilan qui boucle. Le lecteur en tire une variation
    // qui ne veut rien dire, et aucune ligne de l'état ne l'en avertit.
    //
    // LE CAS N'EST PAS THÉORIQUE. L'AUDCIF art. 7 autorise nommément un
    // premier exercice de moins ou de plus de douze mois selon le semestre où
    // l'entité commence · c'est donc la DEUXIÈME liasse de tout dossier ouvert
    // en cours d'année qui porte la colonne fautive.
    //
    // AVERTISSEMENT, et le logiciel N'ADAPTE RIEN. Le texte confie l'adaptation
    // à l'entité, et la mention aux Notes annexes. Proratiser un compte de
    // résultat fabriquerait des chiffres que personne n'a décidés ; proratiser
    // un bilan n'aurait même pas de sens, un bilan étant un stock à une date.
    const comparabilite = evaluerComparabilite(
      tenant.referentiel,
      { dateDebut: ex.dateDebut, dateFin: ex.dateFin },
      // Même garde que le contrôle 19 · le faux Prisma des tests rend
      // l'exercice courant pour toute recherche, et sans elle le contrôle se
      // comparerait à lui-même, donc ne signalerait jamais rien.
      exercicePrecedent && exercicePrecedent.dateFin < ex.dateDebut
        ? { dateDebut: exercicePrecedent.dateDebut, dateFin: exercicePrecedent.dateFin }
        : null,
    );
    if (!comparabilite.comparable) {
      anomalies.push({
        code: 'COMPARATIF_N1_NON_COMPARABLE',
        gravite: 'AVERTISSEMENT',
        libelle: 'Colonne N-1 servie alors que les deux exercices ne se comparent pas',
        consequence:
          `${comparabilite.motifs.map((m) => m.phrase).join(' ')} Le texte (${comparabilite.article}) impose ` +
          'la colonne comparative, mais aussi d’adapter l’exercice précédent quand un poste n’est pas ' +
          'comparable, et de signaler l’absence de comparabilité ou l’adaptation dans les Notes annexes. ' +
          'Tant que rien n’est dit, la colonne s’imprime et se dépose telle quelle : tous les totaux sont ' +
          'justes, le bilan boucle, et le lecteur en tire une variation qui ne veut rien dire.',
        action:
          'Adaptez les chiffres de l’exercice précédent si vous le pouvez, et portez la mention dans les ' +
          'Notes annexes (règles et méthodes comptables). OmegaX n’adapte aucun chiffre de lui-même : ' +
          'proratiser des charges ou des produits fabriquerait des montants que personne n’a décidés, et un ' +
          'bilan, qui est un stock à une date, ne se proratise pas du tout.',
        occurrences: comparabilite.motifs.map((m) => ({
          reference: `Exercice clos le ${ex.dateFin.toISOString().slice(0, 10)}`,
          detail: m.phrase,
          date: ex.dateFin.toISOString().slice(0, 10),
        })),
      });
    }

    // --- 28. Le mandat du contrôleur des comptes -----------------------------
    //
    // Le contrôle 6 réclamait déjà de « vérifier que le mandat est en cours »
    // alors qu'aucune table ne le détenait. Elle existe désormais, et ce
    // contrôle est la moitié qui manquait.
    //
    // LE PIÈGE EST LA PROROGATION, ET ELLE VA DANS LE SENS INVERSE DE
    // L'INTUITION. Un mandat dont le dernier exercice est passé n'est PAS un
    // trou quand un texte le proroge · SYCEBNL art. 22, AUSCGIE art. 709 pour
    // la SA (`regleDeProrogation`). Crier « mandat expiré » serait alors un
    // signalement faux (§ 10 bis). SEUL LE REFUS EXPRÈS OUVRE LE TROU, parce
    // que c'est le seul fait que les deux articles opposent à la prorogation.
    //
    // ET ELLE A DEUX BORNES (audit final F69) · le texte du dossier, jamais
    // l'art. 22 servi à une société, et l'exercice qui suit le dernier couvert,
    // puisqu'elle court jusqu'à « la plus prochaine » assemblée.
    const mandats = await this.prisma.mandatAuditeur.findMany({
      where: { tenantId, finAnticipeeLe: null },
      orderBy: { premierExercice: 'desc' },
      select: { id: true, nom: true, premierExercice: true, nombreExercices: true, refusDeProrogation: true },
    });
    const anneeExercice = ex.dateFin.getUTCFullYear();
    const couvrant = mandatCouvrant(mandats, anneeExercice);
    // Le plus récent mandat échu · candidat à la prorogation.
    const echu = mandats.find((m) => dernierExerciceCouvert(m.premierExercice, m.nombreExercices) < anneeExercice);
    const prorogation = regleDeProrogation(tenant.referentiel, tenant.formeJuridiqueSyscohada);
    const dansLaProrogation =
      !!echu && !!prorogation && estDansLaProrogation(echu.premierExercice, echu.nombreExercices, anneeExercice);

    // L'OBLIGATION DÉCLENCHÉE, PAS UN SEUIL FRANCHI (audit final F17) · deux sur
    // trois aux formes cumulatives, comme le contrôle 6 de la même classe.
    // Une mission PROROGÉE se dit même quand l'obligation reste indéterminée
    // (seuils en FCFA non comparés, AUSCGIE art. 906) · c'est un fait sur un
    // mandat existant, pas un reproche, et le taire laisserait croire le
    // contrôleur parti.
    const prorogationEnCours = !!echu && !!prorogation && dansLaProrogation && !echu.refusDeProrogation;
    if (!couvrant && (seuils.obligationDeclenchee || seuils.obligationSansSeuil || prorogationEnCours)) {
      if (echu && prorogation && echu.refusDeProrogation) {
        // Le contrôleur a refusé de poursuivre · la prorogation de plein droit
        // ne joue pas, et l'entité est réellement sans contrôleur.
        anomalies.push({
          code: 'MANDAT_AUDITEUR_SANS_PROROGATION',
          gravite: 'AVERTISSEMENT',
          libelle: 'Mandat échu et prorogation refusée par le contrôleur',
          consequence:
            `Le mandat est arrivé à son terme et le contrôleur a opposé le refus exprès que prévoit le ` +
            `${prorogation.source}. La prorogation ne joue donc pas · l’entité est sans contrôleur des comptes ` +
            'alors que le texte lui en impose un.',
          action: 'Faites désigner un contrôleur par l’assemblée, et enregistrez son mandat.',
          occurrences: [
            {
              reference: echu.nom,
              detail: `Mandat couvrant jusqu’à l’exercice ${dernierExerciceCouvert(echu.premierExercice, echu.nombreExercices)}, prorogation refusée`,
            },
          ],
        });
      } else if (echu && prorogation && dansLaProrogation) {
        // INFORMATION, jamais avertissement · aucun texte n'est enfreint. La
        // mission CONTINUE, et le dire est utile ; le reprocher serait faux.
        anomalies.push({
          code: 'MANDAT_AUDITEUR_PROROGE',
          gravite: 'INFORMATION',
          libelle: 'Mandat échu, prorogé jusqu’à la prochaine assemblée',
          consequence:
            `${prorogation.source} · ${prorogation.citation}. Le contrôleur est donc toujours en fonction pour ` +
            'cet exercice · ce n’est pas un manquement.',
          action:
            'Portez à l’ordre du jour de la prochaine assemblée le renouvellement ou le remplacement, puis ' +
            'enregistrez le nouveau mandat.',
          occurrences: [
            {
              reference: echu.nom,
              detail: `Mandat couvrant jusqu’à l’exercice ${dernierExerciceCouvert(echu.premierExercice, echu.nombreExercices)}`,
            },
          ],
        });
      } else {
        // Aucun mandat, ou un mandat échu que rien ne proroge · pour cette
        // forme, faute de texte, ou au-delà de l'exercice que la prorogation
        // couvre.
        const motifEchu = !echu
          ? 'Aucun mandat ne couvre cet exercice'
          : !prorogation
            ? `Dernier mandat enregistré (${echu.nom}) échu avec l’exercice ${dernierExerciceCouvert(echu.premierExercice, echu.nombreExercices)} · aucun texte lu ne proroge le mandat pour cette forme`
            : `Dernier mandat enregistré (${echu.nom}) échu avec l’exercice ${dernierExerciceCouvert(echu.premierExercice, echu.nombreExercices)} · la prorogation du ${prorogation.source} ne couvrait que l’exercice suivant`;
        anomalies.push({
          code: 'AUDITEUR_OBLIGATOIRE_SANS_MANDAT',
          gravite: 'AVERTISSEMENT',
          libelle: 'Aucun mandat de contrôleur des comptes ne couvre l’exercice',
          consequence:
            `${'source' in seuils.regle ? seuils.regle.source : 'Le texte applicable au dossier'} rend la ` +
            'désignation obligatoire pour ce dossier, et aucun mandat enregistré dans OmegaX ne couvre ' +
            'l’exercice. Le logiciel ne peut donc dire ni qui contrôle les comptes, ni depuis quand, ni ' +
            'jusqu’à quel exercice.',
          action:
            'Enregistrez le mandat dans la fenêtre Mandat du contrôleur des comptes · nom, référence ' +
            'd’inscription au tableau de l’ordre, organe qui a désigné, date et premier exercice couvert.',
          occurrences: [{ reference: `Exercice ${anneeExercice}`, detail: motifEchu }],
        });
      }
    }

    // --- 29. Les quatre conditions de l'article 37 (ONG de droit étranger) ---
    //
    // Loi n° 004/2001, art. 37 · quatre conditions CUMULATIVES pour une
    // organisation ÉTRANGÈRE : une représentation en RDC, un accord-cadre avec
    // le Ministère du Plan, les attestations de bonne conduite du personnel
    // expatrié, et 60 % au minimum de main-d'œuvre locale.
    //
    // LE PÉRIMÈTRE AVANT TOUT · la sous-section II ne vise QUE l'ONG étrangère,
    // et l'art. 35 réserve le mot ONG à une catégorie précise. Réclamer un
    // accord-cadre à une ONG de droit congolais, à une association
    // confessionnelle ou à un établissement d'utilité publique serait une
    // exigence inventée, sourcée et fausse · § 10 bis.
    if (articleTrenteSeptApplicable(tenant.formeJuridique, tenant.droitEtranger)) {
      const accords = await this.prisma.accordCadrePlan.findMany({
        where: { tenantId, denonceLe: null },
        orderBy: { dateSignature: 'desc' },
      });
      const accord = accords[0];

      if (!accord) {
        anomalies.push({
          code: 'ACCORD_CADRE_PLAN_ABSENT',
          gravite: 'AVERTISSEMENT',
          libelle: 'Aucun accord-cadre avec le Ministère du Plan',
          consequence:
            'La loi n° 004/2001, art. 37, impose à l’organisation étrangère de « conclure un accord-cadre avec ' +
            'le Ministère ayant le plan dans ses attributions ». Aucun n’est enregistré dans OmegaX pour ce ' +
            'dossier, qui se déclare pourtant ONG de droit étranger. L’arrêté n° 007/2025 en fait aussi une ' +
            'pièce de la demande d’attestation d’exemption d’impôt sur les sociétés.',
          action:
            'Enregistrez l’accord dans la fenêtre Accord-cadre (Ministère du Plan) · référence, date de ' +
            'signature et durée recopiées de l’acte signé.',
          occurrences: [],
        });
      } else {
        const etat = etatAccordCadre({
          dateSignature: accord.dateSignature,
          dureeAnnees: accord.dureeAnnees,
          taciteReconduction: accord.taciteReconduction,
          preavisMois: accord.preavisMois,
          denonceLe: accord.denonceLe,
          reference: ex.dateFin,
        });
        // UNE PÉRIODE ÉCOULÉE N'EST PAS UNE FIN quand l'accord se reconduit
        // tacitement · même forme que la prorogation de plein droit du mandat
        // de l'auditeur (SYCEBNL art. 22), et même refus de crier « expiré ».
        // Sans tacite reconduction, en revanche, la période écoulée EST la fin.
        if (etat.periodeEcoulee && !etat.enTaciteReconduction) {
          anomalies.push({
            code: 'ACCORD_CADRE_PLAN_ECHU',
            gravite: 'AVERTISSEMENT',
            libelle: 'Accord-cadre échu, sans tacite reconduction',
            consequence:
              `L’accord ${accord.reference} couvrait ${accord.dureeAnnees} an(s) à compter du ` +
              `${accord.dateSignature.toISOString().slice(0, 10)} et l’accord enregistré ne prévoit pas de ` +
              'tacite reconduction. La condition de l’art. 37, point 2 n’est donc plus remplie à la clôture.',
            action: 'Concluez un nouvel accord avec le Ministère du Plan, ou corrigez la clause enregistrée.',
            occurrences: [
              {
                reference: accord.reference,
                detail: `Période close le ${etat.finDePeriode.toISOString().slice(0, 10)}`,
                date: etat.finDePeriode.toISOString().slice(0, 10),
              },
            ],
          });
        }
      }

      // LA PART DE MAIN-D'ŒUVRE LOCALE EST DÉCLARÉE · le registre du personnel
      // la propose sans la substituer. Le contrôle ne s'allume que sur une part DÉCLARÉE
      // sous le seuil : une part absente n'est pas une part insuffisante, et la
      // traiter comme telle accuserait tout dossier qui n'a rien saisi.
      if (
        accord &&
        accord.partMainOeuvreLocale !== null &&
        accord.partMainOeuvreLocale < PART_MAIN_OEUVRE_LOCALE_MINIMALE
      ) {
        anomalies.push({
          code: 'MAIN_OEUVRE_LOCALE_SOUS_SEUIL',
          gravite: 'AVERTISSEMENT',
          libelle: 'Part de main-d’œuvre locale déclarée sous le minimum légal',
          consequence:
            `L’art. 37, point 4 impose d’« utiliser la main d’œuvre locale à concurrence de ` +
            `${PART_MAIN_OEUVRE_LOCALE_MINIMALE}% au minimum ». La part déclarée est de ` +
            `${accord.partMainOeuvreLocale} %. OmegaX ne calcule pas ce chiffre · il reprend celui qui a été ` +
            'saisi, avec sa source.',
          action:
            'Vérifiez le relevé et sa source, et régularisez la composition des effectifs si l’écart est réel.',
          occurrences: [
            {
              reference: accord.sourceMainOeuvre ?? 'Source non précisée',
              detail: `${accord.partMainOeuvreLocale} % de main-d’œuvre locale déclarés`,
              montant: accord.partMainOeuvreLocale,
            },
          ],
        });
      }
    }

    // --- 30. Rapprochement bancaire qui tient un report à-nouveau -----------
    //
    // Un à-nouveau recopie le solde de clôture · pointé, il compte l'ouverture
    // une seconde fois, et l'écart du rapprochement se referme sur un chiffre
    // faux (audit final F205). La règle écarte désormais tout à-nouveau du
    // pointage, mais ne défait rien de ce qui a été pointé AVANT elle, ni ne
    // rouvre un rapprochement clos · aucun éditeur relu ne rouvre d'office. Le
    // contrôle DÉTECTE, et la réouverture reste un acte de l'administrateur.
    //
    // UNE ANOMALIE FABRIQUÉE SERAIT PIRE QUE LE DÉFAUT (§ 10 bis) · le premier
    // rapprochement d'avant la règle, parti de zéro sans solde déclaré, ne
    // pouvait faire entrer l'ouverture que par l'à-nouveau du premier exercice,
    // et ne la comptait qu'une fois. `aNouveauEnTrop` le lit à sa place dans la
    // chaîne. Borné aux rapprochements dont le relevé tombe dans l'exercice ·
    // les contrôles sont PAR EXERCICE, et un même rapprochement ne se signale
    // qu'une fois.
    const rapprochementsANouveau = await this.prisma.rapprochementBancaire.findMany({
      where: {
        tenantId,
        dateReleve: { gte: ex.dateDebut, lte: ex.dateFin },
        lignes: { some: { ecriture: filtreANouveauEcarte() } },
      },
      select: {
        id: true,
        compteId: true,
        statut: true,
        dateReleve: true,
        clotureAt: true,
        soldeDepartDeclare: true,
        compte: { select: { numero: true, intitule: true } },
        lignes: {
          where: { ecriture: filtreANouveauEcarte() },
          select: {
            debit: true,
            credit: true,
            ecriture: {
              select: { date: true, exerciceId: true, estGenereeParCloture: true, estSoldeDesComptesDeGestion: true },
            },
          },
        },
      },
    });
    if (rapprochementsANouveau.length > 0) {
      const [clos, premierExercice] = await Promise.all([
        this.prisma.rapprochementBancaire.findMany({
          where: {
            tenantId,
            compteId: { in: [...new Set(rapprochementsANouveau.map((r) => r.compteId))] },
            statut: 'CLOTURE',
          },
          select: { compteId: true, clotureAt: true },
        }),
        this.prisma.exercice.findFirst({ where: { tenantId }, orderBy: { dateDebut: 'asc' }, select: { id: true } }),
      ]);
      const occurrences: AnomalieControle['occurrences'] = [];
      for (const r of rapprochementsANouveau) {
        const avant = (r.clotureAt ?? new Date(maintenant)).getTime();
        const place = {
          ancre: clos.some((c) => c.compteId === r.compteId && c.clotureAt !== null && c.clotureAt.getTime() < avant),
          departDeclare: r.soldeDepartDeclare !== null,
          premierExerciceId: premierExercice?.id ?? null,
        };
        for (const l of r.lignes) {
          if (!aNouveauEnTrop(l.ecriture, place)) continue;
          occurrences.push({
            reference: `${r.compte.numero} ${r.compte.intitule} · relevé du ${r.dateReleve.toISOString().slice(0, 10)}`,
            detail: `${r.statut === 'CLOTURE' ? 'Rapprochement clos' : 'Rapprochement en cours'} · report à-nouveau du ${l.ecriture.date
              .toISOString()
              .slice(0, 10)} pointé`,
            date: l.ecriture.date.toISOString().slice(0, 10),
            montant: Number(l.debit) - Number(l.credit),
          });
        }
      }
      if (occurrences.length > 0) {
        anomalies.push({
          code: 'RAPPROCHEMENT_A_NOUVEAU_POINTE',
          gravite: 'AVERTISSEMENT',
          libelle: "Rapprochement bancaire qui compte l'ouverture deux fois",
          consequence:
            "Un report à-nouveau recopie le solde de clôture de l'exercice précédent · ce n'est pas une opération de la banque. " +
            "Pointé, il ajoute l'ouverture au solde de départ qui la contient déjà, et l'écart du rapprochement se referme sur un chiffre faux.",
          action:
            "Rapprochement en cours · dépointez la ligne. Rapprochement clos · l'administrateur rouvre le dernier rapprochement clos du compte, " +
            'motif à l\'appui, puis la ligne se dépointe ; un rapprochement plus ancien ne se rouvre pas, les suivants partent de son solde de relevé.',
          occurrences,
        });
      }
    }

    // --- 31. Règlement en devise qui a soldé le tiers au payé, sans écart ---
    //
    // Décision D4 (2026-10-03, « réfère-toi à la loi ») · INFORMATION, jamais
    // un retraitement. AUDCIF art. 55 · l'écart réalisé « est constaté » à la
    // date du règlement ; art. 20, al. 2 · l'erreur de l'exercice en cours se
    // corrige « exclusivement par inscription en négatif des éléments
    // erronés ; l'enregistrement exact est ensuite opéré » ; al. 3 · celle
    // d'un exercice antérieur, si significative, par le report à nouveau. Un
    // EXERCICE OUVERT seulement · c'est là que l'inscription en négatif vaut.
    // Reconnaissable dans un lettrage partiel seulement (`reglementsSansEcart`).
    if (ex.statut !== StatutExercice.CLOTURE) {
      const sansEcart = await reglementsSansEcart(this.prisma, { tenantId, exerciceId, referentiel: tenant.referentiel });
      if (sansEcart.elements.length > 0 || sansEcart.tronque) {
        anomalies.push({
          code: 'REGLEMENT_DEVISE_SANS_ECART',
          gravite: 'INFORMATION',
          libelle: 'Règlement en devise qui a soldé le tiers au payé, sans écart de change',
          consequence:
            "La ligne du tiers porte les francs du jour au lieu du coût historique de ce qu'elle règle · l'écart de change réalisé " +
            "sur la part réglée n'est pas constaté (AUDCIF art. 55), il reste mêlé au tiers et se lirait en écart de conversion à la clôture.",
          action:
            "Corrigez la pièce par inscription en négatif, puis passez le règlement exact depuis Règlement des tiers, qui solde le tiers " +
            "au coût historique et porte l'écart sur sa ligne (AUDCIF art. 20, al. 2). Rien n'est corrigé d'office.",
          occurrences: [
            // Lecture bornée · la liste le DIT, sans prétendre à un total qu'elle n'a pas lu.
            ...(sansEcart.tronque
              ? [{ reference: 'Lecture bornée', detail: `${PLAFOND_LIGNES_EXAMINEES} lignes de lettrages partiels lues · d'autres règlements peuvent exister.` }]
              : []),
            ...sansEcart.elements.map((e) => ({
            reference: `${e.compteNumero} · ${e.piece}`,
            detail:
              `${e.montantDevise} en devise portés ${e.francsPortes.toFixed(2)} au tiers contre ${e.francsHistoriques.toFixed(2)} au coût historique · ` +
              `${e.ecart > 0 ? 'perte' : 'gain'} de change non constaté${e.ecart > 0 ? 'e' : ''}`,
            date: e.date.toISOString().slice(0, 10),
            montant: e.ecart,
            })),
          ],
        });
      }
      // ÉCARTÉS ET DITS, À PART (septième relecture, m4) · un groupe où le
      // règlement ne se distingue pas de la facture (acompte antérieur,
      // avoir, pièce sans trésorerie) ne se conclut pas · ni « sans écart »,
      // ni « corrigez la pièce », seulement le nombre et la raison.
      if (sansEcart.nonReconnaissables > 0) {
        anomalies.push({
          code: 'LETTRAGES_DEVISE_NON_EXAMINES',
          gravite: 'INFORMATION',
          libelle: 'Lettrages partiels en devise non examinés',
          consequence:
            `${sansEcart.nonReconnaissables} lettrage(s) partiel(s) en devise n'ont pas pu être examinés · le règlement ne s'y distingue pas ` +
            'de la facture (acompte antérieur à la facture, avoir, pièce sans ligne de trésorerie). Rien n’en est conclu.',
          action: 'Aucune, sauf à vérifier ces lettrages à la main si un règlement en devise y a soldé le tiers aux francs du jour.',
          occurrences: [],
        });
      }
    }

    // --- 32 et 33. Ligne A13 · banque et clôture informatique ---------------
    //
    // Les règles, leurs textes et leurs bornes vivent dans
    // `banque-et-cloture-informatique.ts` · ici, la lecture et le message.
    anomalies.push(...(await this.controlesBanqueEtClotureInformatique(tenantId, ex, tenant.referentiel, parcours, maintenant)));

    // --- 35. Lettrage à cheval de deux exercices (ligne A6 bis) ------------
    //
    // Rien ne BLOQUE (premier tour de relecture) · le report lit chaque
    // exercice pour lui-même (règle 1 de `lettrages-a-cheval.ts`), et la
    // clôture passe, figé ou non. Restent deux effets réels, nommés avec leur
    // issue. INFORMATION · au Détail, le groupe ne se délettre pas (second
    // tour, m2) ; le règlement des tiers, les relances et la réévaluation
    // apparient la ligne d'à-nouveau de la facture avec le règlement lettré,
    // la balance âgée et les notes par échéance la lisent encore ouverte quand
    // le groupe est soldé, et le message le nomme (second tour, m1) ; un
    // compte au SOLDE n'en garde aucun. AVERTISSEMENT · un groupe soldé dans
    // sa devise et non en francs, dénoué dans cet exercice, dont l'écart
    // réalisé n'est pas passé (AUDCIF art. 55) · l'écart proposé se passe sur
    // le groupe, figé compris (second tour, B2), et le contrôle s'éteint ;
    // la clôture ne le refuse pas (D3 ne lit pas les groupes à cheval).
    // Sans ligne lettrée dans l'exercice (relevé au parcours), aucun groupe
    // n'y touche · la lecture des lettrages n'a pas lieu d'être.
    if (parcours.lettrageVu) {
      const aCheval = await lettragesACheval(this.prisma, { tenantId, exerciceId });
      const borne = aCheval.tronque
        ? [{ reference: 'Lecture bornée', detail: `${PLAFOND_LETTRAGES_A_CHEVAL} groupes lus · d'autres lettrages à cheval peuvent exister.` }]
        : [];
      const auDetail = aCheval.groupes.filter((g) => g.auDetail);
      if (auDetail.length > 0) {
        anomalies.push({
          code: 'LETTRAGE_A_CHEVAL_D_EXERCICES',
          gravite: 'INFORMATION',
          libelle: 'Lettrage qui mêle deux exercices sur un compte au Détail',
          consequence:
            "Le report à-nouveau lit chaque exercice pour lui-même · ces lignes y passent comme ouvertes, et la ligne d'à-nouveau de la facture " +
            "se lit réglée par le groupe dans l'exercice suivant au règlement des tiers, aux relances et à la réévaluation. Le solde du compte est " +
            'juste ; la balance âgée et les notes par échéance lisent encore ouverte la ligne d’à-nouveau d’un groupe soldé.',
          action:
            "Rien à défaire · ne délettrez pas le groupe (soldé dans sa devise, il rouvrirait ses lignes à la réévaluation), et ne lettrez la " +
            'ligne d’à-nouveau de sa facture avec aucun autre règlement. Justifiez au dossier de travail la ligne que la balance âgée montre ouverte.',
          occurrences: [...borne, ...auDetail.map((g) => ({ reference: `${g.compteNumero} · lettrage ${g.code}`, detail: issueLettrageACheval(g) }))],
        });
      }
      const ecarts = aCheval.groupes.filter((g) => g.ecartNonPasse !== null);
      if (ecarts.length > 0) {
        anomalies.push({
          code: 'ECART_CHANGE_A_CHEVAL_NON_CONSTATE',
          gravite: 'AVERTISSEMENT',
          libelle: 'Écart de change réalisé non passé sur un lettrage à cheval de deux exercices',
          consequence:
            "Le groupe est soldé dans sa devise et pas en francs · l'écart de change réalisé « est constaté » à la date du règlement " +
            '(AUDCIF art. 55) ; non passé, il reste au compte du tiers comme un reste qui n’est plus une créance ni une dette, et manque au résultat.',
          action:
            "Passez l'écart proposé sur le groupe (Interrogation et lettrage, « Écart de change »), figé ou non · jamais par une écriture hors " +
            "du groupe, que la réévaluation recompterait. Dénouement dans une période close · report au premier jour non clôturé (AUDCIF art. 22, 4°).",
          occurrences: [
            ...borne,
            ...ecarts.map((g) => ({ reference: `${g.compteNumero} · lettrage ${g.code}`, detail: issueEcartACheval(g, tenant.referentiel), montant: g.ecartNonPasse! })),
          ],
        });
      }
    }

    const ordre: Record<Gravite, number> = { BLOQUANT: 0, AVERTISSEMENT: 1, INFORMATION: 2 };
    anomalies.sort((a, b) => ordre[a.gravite] - ordre[b.gravite]);

    return {
      exerciceId,
      genereLe: new Date().toISOString(),
      anomalies,
      totaux: {
        bloquants: anomalies.filter((a) => a.gravite === 'BLOQUANT').length,
        avertissements: anomalies.filter((a) => a.gravite === 'AVERTISSEMENT').length,
        informations: anomalies.filter((a) => a.gravite === 'INFORMATION').length,
      },
    };
  }
}
