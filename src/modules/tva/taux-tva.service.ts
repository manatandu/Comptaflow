import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { referencesVers, refuserSiReferences } from '../../common/suppression/references';
import { LOT_ECRITURES, LOT_LECTURE, lireParLots, pageApres } from '../../common/lecture-par-lots';
import { PrismaService } from '../../common/prisma.service';
import { CreerTauxTvaDto, ModifierTauxTvaDto } from './dto/taux-tva.dto';
import { tauxTvaDefaut } from './taux-tva-seed';
import { Prisma, ClasseCompte, Referentiel, TypeJournal, NatureFacture, SensFacture, StatutEcriture } from '@prisma/client';
import { DETENTEUR_LIQUIDATION_TVA, EcritureService } from '../comptabilite/ecriture.service';
import { FicheAutorisationDebits, situationAutorisationDebits } from '../tiers/periode-autorisation-debits';

const EPSILON = 0.005;

/**
 * LA DÉCLARATION SE LIT SUR LA FAMILLE DU COMPTE, PAS SUR CELUI DU TAUX.
 *
 * Chaque `TauxTva` porte un compte de collecte et un compte de déduction ·
 * commodité de saisie, qui pré-remplit la contrepartie. La DÉCLARATION, elle,
 * agrégeait sur ces deux identifiants exactement, et c'était une hypothèse
 * fausse dès que le plan subdivise :
 *
 *   443 État, TVA facturée   · 4431 sur ventes · 4432 sur prestations de
 *     services · 4433 sur travaux · 4434 sur production livrée à soi-même ·
 *     4435 sur factures à établir ;
 *   445 État, TVA récupérable · 4451 sur immobilisations · 4452 sur achats ·
 *     4453 sur transport · 4454 sur services extérieurs et autres charges ·
 *     4455 sur factures non parvenues.
 *
 * (AUDCIF, Titre VII, COMPTE 44. Le SYCEBNL ne subdivise ni l'un ni l'autre,
 * et ses deux comptes portent les mêmes racines · une seule règle suffit.)
 *
 * Une TVA sur prestation de services correctement imputée en 4432 n'était donc
 * PAS déclarée, le taux à 16 % pointant sur 4431. Le compte de la TVA dépend
 * de la nature de l'opération, jamais de son taux : les deux ne peuvent pas
 * être rattachés l'un à l'autre. Ce qui identifie la ligne, c'est le TAUX
 * (`tauxTvaId`, posé à la saisie) et la FAMILLE du compte · d'où ces deux
 * racines, qui restent justes quel que soit le degré de subdivision du plan.
 *
 * Une TVA omise d'une déclaration est un redressement · c'est la raison pour
 * laquelle ce chemin ne s'appuie plus sur un compte unique.
 */
const RACINE_COLLECTEE = '443';
const RACINE_RECUPERABLE = '445';

/**
 * LA NATURE DE L'OPÉRATION SE LIT AU COMPTE · et c'est elle, non le dossier,
 * qui commande la date d'exigibilité.
 *
 * O.-L. n° 10/001, art. 25 (compilation DGI du 19/07/2026, fichier
 * `code-general-2026/references/10-tva-ol10-001-loi-base-ch1-10.md`,
 * l. 615-621) : « L'exigibilité de la taxe sur la valeur ajoutée est le droit
 * dont disposent les services de l'Administration des Impôts de réclamer du
 * redevable le paiement de la taxe à partir d'une date donnée. Elle
 * intervient : / 1. lors de la réalisation du fait générateur, pour les
 * livraisons de biens, y compris les livraisons à soi-même ; / 2. au moment
 * de l'encaissement du prix, des acomptes ou avances, pour les prestations de
 * services et les travaux immobiliers ». Datation faite : la L.F. n° 25/060
 * du 29/12/2025 ne modifie, en TVA, que les art. 10, 35, 42 point 4, 60, 62
 * et 74 (`lois-de-finances-annuelles/references/lf-2026-mesures-fiscales.md`,
 * l. 84-91) · l'art. 25 est bien la règle en vigueur en 2026.
 *
 * L'exigibilité suit donc L'OPÉRATION, opération par opération. Elle ne peut
 * pas être un réglage de dossier : une PME qui vend des marchandises ET
 * facture des prestations doit dater les premières au fait générateur et les
 * secondes à l'encaissement, dans la MÊME déclaration.
 *
 * Et le plan de comptes porte déjà cette information, posée à la saisie par
 * `client/src/lib/tva-syscohada.ts` d'après la contrepartie :
 *
 *   443 · 4431 sur ventes (biens) · 4432 sur prestations de services ·
 *         4433 sur travaux · 4434 sur production livrée à soi-même ;
 *   445 · 4451 sur immobilisations · 4452 sur achats · 4453 sur transport ·
 *         4454 sur services extérieurs et autres charges.
 *
 * CE QUI N'EST PAS CLASSÉ RESTE INDÉTERMINÉ, ET LE DIT. Le plan SYCEBNL ne
 * subdivise ni 443 ni 445 (`compte-seed.ts` l. 639-641 : un seul 44310000
 * « État, T.V.A. facturée » et un seul 44510000 « État, T.V.A. récupérable ») :
 * aucune nature n'y est lisible. Le 4451 non plus n'est pas classé, et c'est
 * délibéré : une immobilisation peut être acquise par livraison de biens
 * (art. 25, 1°) comme par travaux immobiliers ou cession d'un incorporel
 * (art. 25, 2°) · le compte ne tranche pas, donc le logiciel ne tranche pas.
 * Pour ces lignes, le paramètre du dossier sert de REPLI DÉCLARÉ, et la
 * déclaration l'annonce en toutes lettres au lieu de le faire passer pour la
 * règle.
 */
type NatureOperationTva = 'BIENS' | 'SERVICES' | 'INDETERMINEE';

/** Racines SYSCOHADA de TVA collectée dont la nature est certaine. */
const NATURE_COLLECTEE_SYSCOHADA: ReadonlyArray<readonly [string, NatureOperationTva]> = [
  // « TVA facturée sur ventes » · contreparties 701 à 704 et 707 (biens).
  ['4431', 'BIENS'],
  ['4432', 'SERVICES'],
  ['4433', 'SERVICES'],
  // « TVA facturée sur production livrée à soi-même ». L'art. 25, 1° range
  // expressément les livraisons à soi-même au fait générateur (« y compris les
  // livraisons à soi-même »), et le décret n° 011/42, art. 52, y ajoute les
  // PRESTATIONS à soi-même « à la date d'exécution du service » · dans les
  // deux cas, jamais l'encaissement, qui n'a pas de sens sans tiers.
  ['4434', 'BIENS'],
];

/** Racines SYSCOHADA de TVA récupérable dont la nature d'amont est certaine. */
const NATURE_RECUPERABLE_SYSCOHADA: ReadonlyArray<readonly [string, NatureOperationTva]> = [
  // « TVA récupérable sur achats » · contreparties de classe 60, des biens.
  ['4452', 'BIENS'],
  // Transport et services extérieurs · contreparties 61, 62 et 63, des
  // prestations de services.
  ['4453', 'SERVICES'],
  ['4454', 'SERVICES'],
];

/**
 * LA NATURE FISCALE SE LIT À LA CONTREPARTIE, PAS AU COMPTE DE TVA.
 *
 * Le module lisait la nature de l'opération sur la racine du compte de TVA,
 * en tenant le routage de `client/src/lib/tva-syscohada.ts` pour une
 * qualification fiscale. Il n'en est pas une : ce routage suit la
 * NOMENCLATURE COMPTABLE (443 par catégorie de vente, 445 par catégorie
 * d'achat), quand les art. 6 et 8 de l'O.-L. n° 10/001 qualifient
 * l'OPÉRATION. Les deux ne se recouvrent pas, et deux comptes le prouvent.
 *
 * 707 · toute la racine part au 44310000 « TVA facturée sur ventes », classé
 * BIENS. Or le plan SYSCOHADA y sème le 70720000 « Commissions et courtages »,
 * le 70730000 « Locations », le 70750000 « Mise à disposition de personnel »
 * et le 70760000 « Redevances pour brevets, logiciels, marques et droits
 * similaires ». L'art. 8 (fichier `code-general-2026/references/
 * 10-tva-ol10-001-loi-base-ch1-10.md`, l. 165-186) range expressément parmi
 * les prestations de services « les locations de biens meubles », « les
 * opérations portant sur des biens meubles incorporels » et « les opérations
 * d'entremise » ; et son alinéa 1er les tient toutes pour telles, « toutes les
 * opérations autres que les livraisons de biens meubles corporels ».
 * L'art. 25, 2° les rend exigibles À L'ENCAISSEMENT. Une commission facturée
 * en mars et encaissée en juin était déclarée en MARS.
 *
 * 605 · toute la racine 60 part au 44520000 « TVA récupérable sur achats »,
 * classé BIENS. Or le 60510000 est « Fournitures non stockables - Eau », le
 * 60520000 « … Électricité », le 60530000 « … Autres énergies », et l'art. 8
 * nomme en toutes lettres « la fourniture d'eau, d'électricité, de gaz,
 * d'énergie thermique et des biens similaires ». Le 60570000 « Achats
 * d'études et prestations de services » relève de la même liste (« travaux
 * d'études, de conseil, d'expertise et de recherche »). Le droit à déduction
 * naissait dès la facture au lieu de naître à l'exigibilité chez le
 * fournisseur (art. 37 al. 1, décret n° 011/42 art. 96) · une facture
 * d'électricité de mars réglée en juin était déduite en mars.
 *
 * CE QUI PORTE DEUX SENS N'EST PAS TRANCHÉ. Le 60580000 « Achats de travaux,
 * matériels et équipements » porte des TRAVAUX (services, art. 8) et des
 * MATÉRIELS (biens, art. 6) sous un seul numéro ; le 70710000 « Ports,
 * emballages perdus et autres frais facturés » porte un transport (service) et
 * des emballages (biens) ; le 70780000 « Autres produits accessoires » ne dit
 * rien. Ces comptes rendent INDETERMINEE, qui n'est pas un échec : c'est le
 * repli DÉCLARÉ, annoncé sur la déclaration avec son montant.
 *
 * LA PLUS LONGUE RACINE L'EMPORTE · '6051' avant '60', '7073' avant '707'.
 * Et une écriture dont les contreparties ne disent pas toutes la même chose
 * rend INDETERMINEE : mélanger une vente de marchandises et une commission
 * sur la même pièce ne donne pas le droit d'en choisir une.
 */
const NATURE_CONTREPARTIE_PRODUITS_SYSCOHADA: ReadonlyArray<readonly [string, NatureOperationTva]> = [
  // PRODUITS · art. 6 pour les biens meubles corporels, art. 8 pour le reste.
  //
  // CETTE TABLE EST PROPRE AU SYSCOHADA, ET LA RAISON N'EST PAS CELLE QUI
  // ÉTAIT ÉCRITE. Elle ne tient pas à ce que le plan SYCEBNL « ne subdivise
  // pas » : elle tient à ce que sa CLASSE 7 porte les MÊMES NUMÉROS POUR
  // D'AUTRES COMPTES. Le 70510000 est « Dans la Région » au SYSCOHADA, sous
  // 705 « Travaux facturés », donc un SERVICE ; il est « Ventes de
  // marchandises » au SYCEBNL (`compte-seed.ts` l. 1019), donc un BIEN.
  // Appliquer cette table à un dossier SYCEBNL daterait ses ventes de
  // marchandises à l'encaissement et MINORERAIT sa déclaration. Treizième
  // occurrence du premier piège du dépôt, et celle-ci aurait été créée par
  // la correction elle-même.
  ['701', 'BIENS'], // Ventes de marchandises
  ['702', 'BIENS'], // Ventes de produits finis
  ['703', 'BIENS'], // Ventes de produits intermédiaires
  ['704', 'BIENS'], // Ventes de produits résiduels
  ['705', 'SERVICES'], // Travaux facturés · art. 8, « les travaux immobiliers »
  ['706', 'SERVICES'], // Services vendus
  // 707 · produits accessoires, dont la racine ne dit RIEN par elle-même.
  ['707', 'INDETERMINEE'],
  ['7072', 'SERVICES'], // Commissions et courtages · « les opérations d'entremise »
  ['7073', 'SERVICES'], // Locations · « les locations de biens meubles »
  ['7074', 'BIENS'], // Bonis sur reprises et cessions d'emballages
  ['7075', 'SERVICES'], // Mise à disposition de personnel · art. 8, alinéa 1er
  ['7076', 'SERVICES'], // Redevances · « biens meubles incorporels »
  ['7077', 'SERVICES'], // Services exploités dans l'intérêt du personnel
  // Production immobilisée · livraison à soi-même, art. 25, 1° in fine.
  ['72', 'BIENS'],
];

/**
 * CONTREPARTIES DE CHARGE ET D'IMMOBILISATION · LES DEUX RÉFÉRENTIELS.
 *
 * La nature de l'opération d'amont se lit ici, et cette table vaut pour les
 * deux plans : leurs classes 6 portent les MÊMES numéros sous les MÊMES
 * intitulés (60 achats, 605 fournitures non stockables, 61 transports, 62 et
 * 63 services extérieurs), vérifiés ligne à ligne dans les deux semis. C'est
 * la même démonstration que la passe F2b a faite pour les exclusions de
 * l'article 41, et elle tombe du même côté.
 *
 * LE DÉCRET D'APPLICATION CONFIRME LA LISTE, ET L'ALLONGE. Son article 17
 * (fichier `code-general-2026/references/11-tva-decret-application-ch1-4.md`,
 * l. 260-277) reprend celle de l'art. 8 de la loi en y ajoutant « les services
 * électroniques fournis en ligne ». Son article 10 (l. 178-184) range à
 * l'inverse parmi les LIVRAISONS DE BIENS « la vente, l'échange de biens,
 * l'apport en société, le prêt de consommation, la LOCATION-VENTE, la vente à
 * tempérament, les ventes d'articles et matériels d'occasion faites par des
 * professionnels, les cessions d'éléments d'actifs ».
 */
const NATURE_CONTREPARTIE_CHARGES: ReadonlyArray<readonly [string, NatureOperationTva]> = [
  // CHARGES · l'achat suit la nature de ce qui est acheté.
  ['60', 'BIENS'],
  ['6051', 'SERVICES'], // Eau
  ['6052', 'SERVICES'], // Électricité
  ['6053', 'SERVICES'], // Autres énergies · « gaz, énergie thermique et biens similaires »
  ['6057', 'SERVICES'], // Achats d'études et prestations de services
  ['6058', 'INDETERMINEE'], // « travaux, matériels et équipements » · deux sens
  ['61', 'SERVICES'], // Transports · art. 8, « le transport de personnes et de marchandises »
  ['62', 'SERVICES'], // Services extérieurs
  // 6234 « Location-vente », semé aux DEUX plans (`compte-seed-syscohada.ts`
  // l. 1086, `compte-seed.ts` l. 837). L'art. 6 de la loi ET l'art. 10 du
  // décret la rangent expressément parmi les LIVRAISONS DE BIENS, et le
  // décret l'exclut deux fois de plus de la règle des paiements successifs
  // (art. 51) en la datant au transfert du pouvoir de disposer (art. 52).
  // La racine la plus longue l'emporte : '6234' prime '62'.
  ['6234', 'BIENS'],
  ['63', 'SERVICES'], // Autres services extérieurs
  // IMMOBILISATIONS · délibérément non classées, comme le 4451 · une
  // immobilisation s'acquiert par livraison de biens comme par travaux
  // immobiliers ou cession d'un incorporel. Le compte ne tranche pas.
  ['2', 'INDETERMINEE'],
];

/**
 * CE QUE LE SEUL PLAN SYCEBNL DIT AUTREMENT · les divergences, et rien d'autre.
 *
 * Les deux classes 6 se recouvrent presque entièrement, mais pas partout, et
 * l'endroit où elles divergent est celui qui compte. Le 601 est « Achats de
 * marchandises » au SYSCOHADA (`compte-seed-syscohada.ts` l. 1021), donc des
 * BIENS sans ambiguïté ; il est « Achats de biens ET SERVICES liés à
 * l'activité » au SYCEBNL (`compte-seed.ts` l. 772-776), un seul numéro pour
 * les deux natures. Sur ce plan-là, le compte ne tranche pas, et on ne tranche
 * pas à sa place.
 *
 * Cette table PRIME la précédente à longueur de racine égale ou supérieure.
 */
const NATURE_CONTREPARTIE_CHARGES_SYCEBNL: ReadonlyArray<readonly [string, NatureOperationTva]> = [
  ['601', 'INDETERMINEE'],
];
/**
 * RECETTES EXCLUES DU DÉNOMINATEUR DU PRORATA (art. 43).
 *
 * Fichier `code-general-2026/references/10-tva-ol10-001-loi-base-ch1-10.md`,
 * art. 43 (modifié par la L.F. n° 14/002 du 31/01/2014, non retouché par la
 * L.F. n° 25/060), l. 1118-1122 : le dénominateur est « le montant annuel des
 * recettes de toute nature réalisées par l'assujetti À L'EXCLUSION des
 * cessions d'éléments de l'actif immobilisé, des subventions d'équipements,
 * des indemnités d'assurance ne constituant pas la contrepartie d'une
 * opération soumise à la taxe sur la valeur ajoutée et des débours » ; et
 * l. 1129-1130 : « Le montant des livraisons et des prestations à soi-même est
 * exclu des DEUX TERMES du rapport. »
 *
 * Le commentaire qui précédait affirmait que ces postes « ne sont de toute
 * façon jamais portés en classe 7 dans notre plan de comptes ». Le semis dit
 * le contraire, et chaque poste inclus à tort abaisse le prorata, donc la
 * déduction, AU DÉTRIMENT DU CONTRIBUABLE.
 *
 * LES RACINES DIFFÈRENT D'UN RÉFÉRENTIEL À L'AUTRE, et une liste commune
 * serait fausse : le 754 du SYSCOHADA est « Produits des cessions courantes
 * d'immobilisations » (compte-seed-syscohada.ts l. 1354-1356, alimenté par
 * `immobilisation.service.ts` sur cession courante), tandis que le 754 du
 * SYCEBNL est « Dons en nature courants » (compte-seed.ts l. 1218), qui est
 * une recette ordinaire et n'a rien à faire dans une liste d'exclusions.
 *
 * CE QUI N'EST PAS EXCLU, ET POURQUOI. Les subventions d'EXPLOITATION (71)
 * restent au dénominateur : l'art. 43 n'exclut que les subventions
 * d'ÉQUIPEMENT. Les débours n'ont pas de compte dédié dans les deux plans ·
 * ils ne sont donc pas retranchés, et la déclaration le dit plutôt que de le
 * taire.
 */
const RACINES_HORS_DENOMINATEUR_COMMUNES: ReadonlyArray<string> = [
  // 72 « Production immobilisée » et 724 « Production auto-consommée » · c'est
  // la livraison à soi-même, exclue des DEUX termes (art. 43, l. 1129-1130).
  '72',
  // 7582 « Indemnités d'assurances reçues » (SYSCOHADA) / « Produits divers ·
  // indemnités d'assurances » (SYCEBNL) · exclues quand elles ne sont pas la
  // contrepartie d'une opération taxée, ce qu'une indemnité d'assurance n'est
  // par nature jamais.
  '7582',
  // 799 « Reprises de subventions d'investissement » · seule forme sous
  // laquelle une subvention d'ÉQUIPEMENT (compte 14 « Subventions
  // d'investissement ») entre en classe 7. L'exclure, c'est appliquer
  // l'exclusion que le texte nomme ; la laisser, ce serait compter au
  // dénominateur une recette que l'art. 43 en retire.
  '799',
];

/** 754 « Produits des cessions courantes d'immobilisations » · SYSCOHADA seul. */
const RACINES_HORS_DENOMINATEUR_SYSCOHADA: ReadonlyArray<string> = ['754'];

/**
 * EXCLUSIONS DU DROIT À DÉDUCTION · art. 41, celles que le NUMÉRO DE COMPTE
 * établit à lui seul.
 *
 * Fichier `code-general-2026/references/10-tva-ol10-001-loi-base-ch1-10.md`,
 * art. 41 (modifié par l'O.-L. n° 13/007, la L.F. n° 14/027 et la L.F.
 * n° 17/014 · NON retouché par la L.F. n° 25/060, dont l'art. 47 ne complète
 * que l'art. 42, point 4), l. 1033-1038 : « N'ouvre pas droit à déduction, la
 * taxe ayant grevé : / 1. les dépenses de logement, d'hébergement, de
 * restauration, de réception, de spectacles, de location de véhicules de
 * tourisme et de transport de personnes à l'exclusion des dépenses supportées,
 * au titre de leur activité imposable, par les professionnels du tourisme, de
 * la restauration et du spectacle ».
 *
 * CE N'EST PAS UN PRORATA, C'EST UNE INTERDICTION. Le seul filtre qui séparait
 * la TVA d'amont enregistrée de la « TVA déductible admise » était le prorata
 * de l'art. 43, qui limite la déduction ; l'art. 41 la SUPPRIME. Une facture de
 * réception passait donc intégralement en déduction, mois après mois.
 *
 * TROIS COMPTES, ET TROIS SEULEMENT. On ne retient que ceux dont l'INTITULÉ du
 * plan reprend les mots de l'article · au-delà, le numéro ne dit plus la
 * dépense, et deviner coûterait au contribuable une déduction à laquelle il a
 * droit. Ce qui n'est pas reconnu est ANNONCÉ, pas exclu (voir
 * `EXCLUSIONS_ART_41_A_VERIFIER` et la mention de la déclaration).
 *
 * LES DEUX RÉFÉRENTIELS, ET C'EST UNE CORRECTION. Ce commentaire portait
 * « SYSCOHADA SEUL · le plan SYCEBNL n'a ni 6383 ni 6384 ni 6181 : ses charges
 * externes sont agrégées en 61800000 et 63800000 ». C'ÉTAIT FAUX, et les
 * renvois de ligne donnés à l'appui ne portaient rien de tel. Le semis SYCEBNL
 * ouvre en propre, sous les mêmes intitulés que le SYSCOHADA, le 61810000
 * « Voyages et déplacements » (`compte-seed.ts` l. 824), le 63830000
 * « Réceptions » (l. 887) et le 63840000 « Missions » (l. 888), plus le
 * 61400000 « Transports du personnel » (l. 822). Les trois dépenses que
 * l'article 41, 1° nomme y sont donc aussi lisibles qu'ailleurs.
 *
 * LE COÛT DE CETTE PHRASE ÉTAIT DOUBLE. Un dossier SYCEBNL assujetti · une
 * ASBL ou une ONG taxée sur une activité accessoire, c'est-à-dire le public
 * même du logiciel · déduisait 100 % de la TVA sur ses réceptions, ses
 * missions et ses voyages, mois après mois. Et la déclaration lui donnait une
 * RAISON FAUSSE de ne pas regarder, en annonçant « un plan qui agrège ses
 * charges externes ». Une lacune déclarée à tort est aussi fausse qu'une règle
 * inventée ; celle-ci empêchait en outre d'appliquer une règle que le dépôt
 * savait déjà écrire.
 *
 * LA DISCIPLINE, ELLE, NE CHANGE PAS · on ne retient un compte que si
 * l'INTITULÉ SEMÉ reprend les mots de l'article, et les quatre numéros
 * ci-dessus ont été relus dans les DEUX semis avant d'ouvrir la table. Un plan
 * qui n'ouvrirait pas l'un d'eux ne déclenche rien : le préfixe ne rencontre
 * aucun compte, et rien n'est exclu à tort.
 */
const EXCLUSIONS_ART_41: ReadonlyArray<readonly [string, string]> = [
  // 63830000 « Réceptions » · l'article nomme les « dépenses de réception ».
  ['6383', '6383 Réceptions'],
  // 63840000 « Missions » · logement, hébergement et restauration en
  // déplacement, les trois premiers postes du 1°.
  ['6384', '6384 Missions'],
  // 61810000 « Voyages et déplacements » · transport de personnes et
  // hébergement, également nommés au 1°.
  ['6181', '6181 Voyages et déplacements'],
];

/**
 * DÉPENSES QUE L'ARTICLE VISE MAIS QUE LE COMPTE NE TRANCHE PAS · on les
 * compte à part et on les nomme, on ne les exclut pas.
 *
 * Chacune porte une exception que le logiciel N'A PAS LES MOYENS DE VÉRIFIER,
 * et la règle de maison est alors d'avertir avec l'article :
 *
 *  · 62760000 « Cadeaux à la clientèle », semé aux DEUX plans
 *    (`compte-seed-syscohada.ts` et `compte-seed.ts`, la fiche du compte 62
 *    du SYCEBNL ouvrant le 6276 · passe R5, C3) · art. 41, 7° exclut les biens
 *    cédés à titre de cadeaux « sauf quand il s'agit d'objets publicitaires de
 *    faible valeur unitaire hors taxe » (l. 1064-1067).
 *
 *    LE SEUIL EXISTE, ET IL EST CHIFFRÉ · décret n° 011/42, art. 107 : « Par
 *    objet publicitaire de faible valeur, il faut entendre le bien dont la
 *    valeur unitaire est INFÉRIEURE À 10.000,00 FRANCS CONGOLAIS. » Le même
 *    article habilite le Ministre des Finances à réajuster ce montant, et
 *    aucun réajustement n'est dans le corpus lu.
 *
 *    CE QUI RESTE VRAI, ET CE QUI NE L'ÉTAIT PAS. Ce paragraphe écrivait que
 *    « la valeur UNITAIRE n'est nulle part dans le modèle ». C'est inexact
 *    depuis l'item I1 : `LigneFacture` porte `quantite` et `prixUnitaire`. Ce
 *    qui reste exact, c'est que CETTE déclaration ne lit pas les factures ·
 *    elle lit les ÉCRITURES, et une ligne d'écriture ne porte qu'un montant
 *    global. Le contrôle est donc possible sur le chemin de la FACTURE et
 *    impossible sur celui de la déclaration, et c'est cela qu'il faut dire ·
 *    non que la donnée n'existe pas.
 *  · 61400000 « Transports du personnel » · art. 42, 2° exclut les transports
 *    de personnes « à l'exclusion des transports réalisés […] en vertu d'un
 *    contrat permanent de transport conclu par les entreprises pour amener
 *    leur personnel sur les lieux de travail » (l. 1084-1088). L'existence
 *    d'un contrat permanent est une donnée juridique, pas comptable.
 */
const EXCLUSIONS_ART_41_A_VERIFIER: ReadonlyArray<readonly [string, string]> = [
  [
    '6276',
    '6276 Cadeaux à la clientèle (art. 41, 7° · sauf objets publicitaires dont la valeur unitaire est inférieure à ' +
      '10 000,00 FC, décret n° 011/42 art. 107)',
  ],
  ['6140', '6140 Transports du personnel (art. 42, 2° · sauf contrat permanent de transport du personnel)'],
  // 60420000 « Matières combustibles », semé aux DEUX plans
  // (`compte-seed-syscohada.ts` l. 1041, `compte-seed.ts` l. 795). L'article
  // frappe les produits pétroliers sur TROIS points qui ne disent pas la même
  // chose et que le compte ne permet pas de départager :
  //   3.    « les produits pétroliers, à l'exception de ceux destinés à la
  //          revente par les grossistes ou acquis pour la production
  //          d'électricité devant être revendue » ;
  //   3bis. « les produits pétroliers, à l'exception des carburants utilisés
  //          par des appareils fixes comme combustibles dans les entreprises
  //          industrielles dans les conditions fixées par voie réglementaire
  //          ou dans les aéronefs par les compagnies de navigation aérienne » ;
  //   3ter. « les produits pétroliers, dans la limite de 50%, pour les cas
  //          autres que ceux visés aux points 3 et 3bis ci-dessus ».
  // AUCUN POURCENTAGE N'EST APPLIQUÉ, ET C'EST DÉLIBÉRÉ. Le point 3ter ne
  // joue que « pour les cas autres » que ceux des points 3 et 3bis, dont les
  // exceptions se recouvrent en partie ; l'articulation des trois points n'est
  // pas tranchée par le texte lu, et le règlement auquel 3bis renvoie est
  // absent du corpus. Le montant est donc COMPTÉ ET NOMMÉ, jamais amputé.
  ['6042', '6042 Matières combustibles (art. 41, 3°, 3° bis et 3° ter · produits pétroliers, exceptions et limite de 50 %)'],
];

/**
 * TVA (cf. docs/plan-de-construction.md §3.1/§5) : entité "Taux" paramétrable,
 * fondée sur l'O.-L. n° 10/001 du 20/08/2010 modifiée par la LF 2026 (skill
 * `fiscalite-rdc/tva`). Couvre désormais, en plus du référentiel (taux +
 * comptes 443/445 rattachés) : l'exigibilité par NATURE d'opération (art. 25,
 * POINTS 1 ET 2 SEULEMENT, et art. 26 alinéas 1 et 2), la nature étant lue à
 * la contrepartie que les art. 6 et 8 qualifient ;
 * la naissance du droit à déduction chez le fournisseur (art. 37 al. 1
 * et décret n° 011/42 art. 96), le délai d'exercice de ce droit et sa
 * déchéance (art. 37 al. 2), les exclusions que le plan de comptes établit
 * (art. 41), le prorata de déduction (art. 43-45), la récupération de la taxe
 * sur les ventes ANNULÉES ou RÉSILIÉES et la reprise de la déduction sur avoir
 * fournisseur (art. 52, décret art. 126-127),
 * l'imputation du crédit de TVA sur les périodes suivantes (art. 63) et la
 * comptabilisation de la liquidation périodique (solde 443/445 sur le
 * compte 444).
 *
 * RESTE HORS SCOPE, ET IL FAUT LE NOMMER EXACTEMENT :
 *  · LES POINTS 3 À 7 DE L'ARTICLE 25. Le module annonçait « l'exigibilité par
 *    nature d'opération (art. 25 et 26) » sans réserve de point, et un spec
 *    interdisait même d'écrire « art. 25 » dans cette liste : seuls les points
 *    1 et 2 sont servis. Ne le sont pas · le point 3 (déclaration de mise à la
 *    consommation, pour les biens importés, placés sous régime suspensif ou
 *    sortis d'une zone franche), le point 4 (échéance de l'effet, en cas
 *    d'escompte), le point 5 (échéance des intérêts ou des loyers, crédit à la
 *    consommation et crédit-bail des établissements financiers), le point 6
 *    (livraison des produits ou perception du PRÉFINANCEMENT, cultures
 *    pérennes · le préfinancement rend la taxe exigible avant toute livraison,
 *    et s'enregistre en avance reçue sans ligne de taxe) et le point 7 (date
 *    de mutation ou de transfert de propriété d'immeuble, avec l'exception de
 *    l'habitat social et des locations de promoteurs immobiliers, exigibles à
 *    chaque échéance). Les points 6 et 7 de l'ARTICLE 24 (fait générateur des
 *    opérations des promoteurs immobiliers) sont hors scope pour la même
 *    raison : aucun modèle ne porte la qualité de promoteur immobilier ;
 *  · L'ALINÉA 3 DE L'ARTICLE 26 · l'encaissement antérieur au débit. Il n'est
 *    pas calculé, il est DÉCLARÉ avec son montant sur la déclaration : un
 *    acompte encaissé avant la facture s'enregistre en avance reçue (419),
 *    sans ligne de taxe et sans rattachement à la facture qui suivra ;
 *  · LA TERRITORIALITÉ (art. 22) ET LE CLIENT RENDU REDEVABLE (art. 23).
 *    L'art. 22, 3° rattache à la RDC les prestations « lorsque le service
 *    rendu, le droit cédé ou l'objet loué, sont utilisés ou exploités au
 *    pays » : une étude, une redevance ou un logiciel facturés depuis
 *    l'étranger et utilisés en RDC sont DANS le champ. L'art. 23, alinéa 2,
 *    met la taxe et les pénalités à la charge de « la personne cliente »
 *    « en cas de non désignation d'un représentant ». LE DÉCLENCHEUR EST LA
 *    DÉSIGNATION, PAS L'AGRÉMENT, et cette liste portait « agréé », ce qui
 *    déplaçait la dette. Le décret n° 011/42, art. 41, dit la même chose : « À
 *    défaut de désignation d'un représentant, la taxe et, le cas échéant, les
 *    pénalités y afférentes, sont dues par la personne cliente. » Entre la
 *    désignation et l'agrément s'écoule un délai, et le silence de
 *    l'Administration vaut agrément : un fournisseur étranger qui a désigné un
 *    représentant non encore agréé a satisfait à l'obligation, et son client
 *    congolais n'est PAS redevable. Une lacune déclarée avec un déclencheur
 *    faux invite à supporter une taxe qui n'est pas due ;
 *    OmegaX enregistre ces achats en charges ordinaires, sans ligne de taxe
 *    et sans signal · alors qu'il voit le fournisseur non-résident pour un
 *    autre impôt (prélèvement de 14 %, art. 144) ;
 *  · LES BASES PARTICULIÈRES DES ART. 27 POINT 10, 31, 32, 33 ET 34 · le
 *    régime de la marge des négociants de biens d'occasion, d'œuvres d'art,
 *    d'objets de collection ou d'antiquité, celui des agences de voyages et
 *    organisateurs de circuits touristiques (avec l'interdiction de déduction
 *    de l'art. 33) et celui des transitaires et commissionnaires en douane.
 *    Le chemin guidé applique `ht × taux` au prix entier. RÉSERVE DE LECTURE,
 *    QU'IL NE NOUS APPARTIENT PAS DE TRANCHER : l'art. 27, point 10 retient
 *    « la différence entre le prix de vente et le prix d'achat de chaque
 *    bien » sans condition de fournisseur, quand l'art. 31 retient « la
 *    différence entre le prix de vente et le prix de revient » et seulement
 *    pour les biens acquis auprès de non-assujettis. Les deux règles ne disent
 *    pas la même chose dans le même chapitre ;
 *  · LA TVA COLLECTÉE SUR LES CESSIONS D'ÉLÉMENTS D'ACTIFS (art. 6). L'art. 6
 *    range expressément « les cessions d'éléments d'actifs » parmi les
 *    livraisons de biens meubles corporels, au même titre que l'échange de
 *    biens, l'apport en société, la location-vente et la vente à tempérament.
 *    Le module `immobilisations` pose l'écriture de cession sans une ligne de
 *    taxe et sans taux proposé · c'est une question ANTÉRIEURE aux
 *    régularisations des art. 50 et 51 ci-dessous, qui portent sur la taxe
 *    DÉDUITE en amont, non sur celle à COLLECTER sur le prix de cession ;
 *  · LA RETENUE À LA SOURCE DE LA TVA (art. 53, alinéa 2, et sa sanction,
 *    art. 74 ter). Par exception au principe, la taxe est retenue par les
 *    entreprises minières assujetties pour le compte des établissements et
 *    entreprises publics dont l'État détient tout le capital, et par le Trésor
 *    Public pour le compte des fournisseurs et prestataires de l'État lors du
 *    paiement de leurs factures. La déclaration produite ici compte TOUTE la
 *    taxe collectée : un dossier qui facture l'État se voit donc annoncer une
 *    dette que le Trésor a déjà retenue. Aucune des trois données nécessaires
 *    n'est au modèle (qualité publique du client, qualité minière du dossier,
 *    ligne de retenue), et le défaut de retenue coûte une amende égale à son
 *    montant (art. 74 ter) ;
 *  · LE CRÉDIT DONT LE REMBOURSEMENT A ÉTÉ DEMANDÉ (art. 66). « Le crédit de
 *    taxe sur la valeur ajoutée dont le remboursement a été demandé ne peut
 *    donner lieu à imputation » : la demande NEUTRALISE l'imputation de
 *    l'art. 63, que ce module opère d'office. Aucun champ ne peut dire qu'une
 *    demande a été déposée · c'est le seul endroit où l'imputation servie
 *    peut, sans faute de saisie, produire une déclaration fausse ;
 *  · LA PERTE DU DROIT À DÉDUCTION APRÈS TAXATION D'OFFICE (art. 69 ter) et
 *    APRÈS MANQUEMENT AU PAIEMENT SCRIPTURAL (art. 59 bis et art. 74 bis).
 *    L'art. 59 bis impose le chèque, le virement ou la carte bancaire pour
 *    « toute transaction entre assujettis […] d'un montant d'au moins
 *    1.000.000,00 de Francs congolais », et l'art. 74 bis fait perdre la
 *    déduction à qui y manque. OmegaX connaît le montant, le tiers et le
 *    règlement, mais NE STOCKE NULLE PART LE MOYEN DE PAIEMENT : il ne peut ni
 *    contrôler ni avertir. Un numéro de compte de trésorerie ne qualifie pas
 *    juridiquement le moyen · un débit de 521 ne prouve pas un virement ;
 *  · LA TAXE DUE DU SEUL FAIT DE SA MENTION (art. 59, alinéas 1 et 3), LES
 *    AMENDES DU TRIPLE (art. 70, mention abusive ; art. 71, fausse facture) et
 *    celle de l'art. 74, alinéa 2 (document servi DEUX FOIS à la déduction),
 *    qui n'est PAS du triple · l'alinéa, ajouté par la L.F. n° 25/060, art. 50,
 *    renvoie à « la même sanction prévue à [l']alinéa précédent », soit une
 *    amende « égale au montant des droits indûment déduits ». Toutes
 *    supposent de confronter DEUX gisements que le dépôt tient en parallèle et
 *    ne rapproche jamais : la FACTURE, qui porte son taux et son montant de
 *    taxe, et l'ÉCRITURE, seule lue par cette déclaration. Une facture portant
 *    16 % dont l'écriture ne pose aucune ligne de taxe rend la taxe due sans
 *    que rien ne la déclare ;
 *  · L'ARTICLE 40, ALINÉA 2 · « La taxe ayant grevé les immobilisations
 *    détenues par les entreprises qui entrent nouvellement dans le champ
 *    d'application de la taxe sur la valeur ajoutée, n'ouvre pas droit à
 *    déduction. » L'exclusion est absolue et sans tempérament ; le crédit de
 *    départ sur le STOCK, lui, est ouvert par la première phrase, sous
 *    condition d'une déclaration détaillée préalable. Aucune date d'entrée
 *    dans le champ n'est comparée à une date d'acquisition ;
 *  · L'ARTICLE 42, POINT 1, POUR SES DÉPENSES ACCESSOIRES · l'exclusion des
 *    véhicules de transport de personnes s'étend expressément à « leur
 *    location, leurs pièces détachées et accessoires ou les services afférents
 *    à ces mêmes biens ». Aucun intitulé du plan n'isole ce qui se rapporte à
 *    un véhicule de personnes : un 6223 « Locations de matériels et
 *    outillages » ou un 6242 « Entretien et réparations des biens mobiliers »
 *    porte aussi bien un engin de chantier. Les TROIS contre-exceptions sont
 *    écrites ici pour que le cabinet les ait : véhicules routiers de dix
 *    places assises ou plus, chauffeur inclus, affectés au transport exclusif
 *    du personnel ; véhicules des entreprises de transport public de voyageurs
 *    affectés exclusivement à ces transports ; véhicules particuliers des
 *    entreprises de location de voitures ;
 *  · L'ARTICLE 42, POINTS 3 ET 4 · la taxe portée sur une facture émise hors
 *    dispositif électronique fiscal, dont le texte réserve lui-même
 *    l'application « à compter de la date qui sera fixée par Arrêté du
 *    Ministre ayant les Finances dans ses attributions », arrêté ABSENT du
 *    corpus ; et la taxe sur une facture émise par une personne introuvable à
 *    l'adresse communiquée à l'Administration ;
 *  · L'ARTICLE 43, ALINÉA 3 · « Figurent également au numérateur les recettes
 *    afférentes aux livraisons de biens et prestations de services rendues aux
 *    missions diplomatiques et consulaires et aux organisations
 *    internationales. » Aucun plan n'ouvre de compte pour ces recettes : elles
 *    ne portent aucune ligne de taxe, tombent au seul dénominateur et FONT
 *    BAISSER le prorata, donc minorent la déduction. Le sens de l'écart est
 *    constant et toujours au détriment du dossier, et le cas est courant chez
 *    les ONG ;
 *  · L'ARTICLE 45, ALINÉA 1, POUR LE NOUVEL ASSUJETTI · le prorata provisoire
 *    doit être assis « sur les recettes et produits prévisionnels de l'année
 *    en cours », donc stable sur douze mois. Faute d'un champ de prévisionnel,
 *    le module retombe sur une estimation recalculée à chaque période : le
 *    nouvel assujetti est le seul à déclarer douze proratas différents, ce qui
 *    est le défaut même que la correction du prorata avait chassé pour les
 *    autres ;
 *  · L'ARTICLE 36, POINT 4 · les biens d'investissement s'inscrivent en
 *    comptabilité « pour leur coût d'achat ou de revient hors TVA déductible »
 *    et leurs amortissements se calculent sur cette même base pour l'assiette
 *    de l'impôt sur les bénéfices. Le module `immobilisations` ne connaît pas
 *    la TVA : sa fiche engendre une écriture à DEUX lignes, sans place pour la
 *    taxe, et le pendant de la règle manque aussi · quand la taxe n'est PAS
 *    déductible, la part non déductible doit au contraire entrer dans le coût ;
 *  · LES CONTRATS D'ABONNEMENT (décret n° 011/42, art. 55 et 56). « En cas
 *    d'une fourniture réalisée dans le cadre d'un contrat d'abonnement donnant
 *    lieu à l'établissement des décomptes ou à des encaissements successifs
 *    proportionnels à la consommation du client, LE FAIT GÉNÉRATEUR ET
 *    L'EXIGIBILITÉ interviennent à l'expiration des périodes auxquelles se
 *    rapportent ces décomptes ou ces encaissements. » Le décret étend donc à
 *    l'EXIGIBILITÉ ce que l'art. 24, point 9 de la loi ne disait que du fait
 *    générateur. OmegaX ne peut pas le voir : rien dans une écriture ne dit
 *    qu'une fourniture relève d'un contrat d'abonnement, et l'eau comme
 *    l'électricité sont ici datées de l'encaissement au titre de l'art. 25, 2°.
 *    Le sens de l'écart diffère selon le côté · à la COLLECTE, la taxe est
 *    déclarée APRÈS être devenue exigible, ce qui se redresse ; à la
 *    DÉDUCTION, elle est déduite plus tard qu'elle ne pourrait l'être, ce qui
 *    ne se redresse pas ;
 *  · LE PAIEMENT PAR EFFET DE COMMERCE (décret n° 011/42, art. 57, alinéa 2,
 *    4e tiret). L'encaissement intervient « à la date de l'échéance de la
 *    traite, MÊME SI ELLE A ÉTÉ REMISE À L'ESCOMPTE auprès d'un établissement
 *    financier ». Le module date l'encaissement de l'écriture qui solde le
 *    compte du tiers · sur un effet, c'est l'ACCEPTATION, antérieure à
 *    l'échéance. Le même alinéa règle aussi l'affacturage, dont l'encaissement
 *    « coïncide avec la date du paiement effectif de la créance par le
 *    débiteur », et non avec le versement du factor. Ni l'un ni l'autre n'est
 *    lu ;
 *  · LA MESURE DU SEUIL D'ASSUJETTISSEMENT (décret n° 011/42, art. 42 et 43).
 *    Le seuil de l'art. 14 de la loi s'apprécie sur un chiffre d'affaires
 *    « hors taxe sur la valeur ajoutée », « de l'année précédente » pour les
 *    entreprises existantes et « prévisionnel » pour les nouvelles. La règle
 *    est écrite à l'écran et au schéma ; elle n'est CALCULÉE nulle part, et
 *    `assujettiTva` reste un booléen que l'administrateur coche ;
 *  · l'option pour secteurs distincts d'activité (art. 49) ;
 *  · la régularisation pluriannuelle du prorata sur les immobilisations
 *    (art. 46, variation > 10 % sur 4 ans) ;
 *  · LES RÉGULARISATIONS DES ART. 50 ET 51 · reversement d'une fraction de la
 *    taxe antérieurement déduite en cas de sortie d'actif, de changement
 *    d'utilisation, de disparition ou de vente à perte, et attestation à
 *    délivrer au cessionnaire. Elles ne sont ni calculées ni signalées, et le
 *    module `immobilisations` qui pose l'écriture de cession ne contient pas
 *    une occurrence de « TVA ». Ce hors-scope était tu : il ne citait que les
 *    art. 46 et 49, ce qui laissait croire que 50 et 51 étaient couverts ;
 *  · LA RÉCUPÉRATION SUR VENTES IMPAYÉES (art. 52, al. 3 et décret art. 127).
 *    Les ventes ANNULÉES et RÉSILIÉES sont traitées : elles laissent une
 *    écriture, le débit du 443 par la note de crédit. L'impayé n'en laisse
 *    aucune · la créance reste au 411, rien ne bouge, et la récupération
 *    suppose que la créance soit « réellement et définitivement
 *    irrécouvrable », qu'un duplicata surchargé de la mention réglementaire
 *    ait été envoyé au client, et que la preuve de l'irrécouvrabilité soit
 *    apportée par l'assujetti (décret art. 127, l. 718-726). Aucune de ces
 *    trois données n'est dans le modèle · si le comptable passe lui-même
 *    l'écriture de récupération au débit du 443 avec son taux, elle sera
 *    reprise comme une annulation, mais le logiciel ne la déclenche pas.
 */
/**
 * Répartit `total` entre les comptes, au prorata de leur montant brut × `ratio`,
 * au centime, et donne le reste d'arrondi au compte le plus lourd · la somme
 * rendue vaut `total` exactement.
 */
export function repartirAuCentime(total: number, bruts: ReadonlyMap<string, number>, ratio: number): Map<string, number> {
  const rendu = new Map<string, number>();
  let somme = 0;
  let plusLourd: string | null = null;
  for (const [compteId, brut] of bruts) {
    const part = Math.round(brut * ratio * 100) / 100;
    rendu.set(compteId, part);
    somme += part;
    if (plusLourd === null || Math.abs(brut) > Math.abs(bruts.get(plusLourd)!)) plusLourd = compteId;
  }
  const reste = Math.round((total - somme) * 100) / 100;
  // Le reste n'est qu'une poussière d'arrondi, un demi-centime par compte au
  // plus. Au-delà, le total et les comptes ne disent pas la même chose · c'est
  // un défaut du moteur, jamais un écart à loger en silence sur un compte.
  if (Math.abs(reste) > 0.01 * (bruts.size + 1)) {
    throw new Error(`Répartition de la TVA déductible incohérente · ${reste} d'écart entre la déclaration et ses comptes.`);
  }
  if (plusLourd !== null && Math.abs(reste) > 0) rendu.set(plusLourd, Math.round((rendu.get(plusLourd)! + reste) * 100) / 100);
  return rendu;
}

@Injectable()
export class TauxTvaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ecritureService: EcritureService,
  ) {}

  /** Appelé une fois à la création du tenant (voir AuthService.register). */
  /**
   * `client` reçoit la transaction de `AuthService.register` quand le semis
   * fait partie d'une création de dossier · hors de ce cas il vaut
   * `this.prisma` et rien ne change pour les autres appelants.
   */
  async seedTauxDefaut(tenantId: string, referentiel: Referentiel, client: Prisma.TransactionClient = this.prisma) {
    for (const t of tauxTvaDefaut(referentiel)) {
      const compteCollecte = t.numeroCompteCollecte
        ? await client.compte.findUnique({ where: { tenantId_numero: { tenantId, numero: t.numeroCompteCollecte } } })
        : null;
      const compteDeductible = t.numeroCompteDeductible
        ? await client.compte.findUnique({ where: { tenantId_numero: { tenantId, numero: t.numeroCompteDeductible } } })
        : null;
      await client.tauxTva.upsert({
        where: { tenantId_code: { tenantId, code: t.code } },
        update: {},
        create: {
          tenantId,
          code: t.code,
          intitule: t.intitule,
          taux: t.taux,
          compteCollecteId: compteCollecte?.id,
          compteDeductibleId: compteDeductible?.id,
        },
      });
    }
  }

  async lister(tenantId: string, actifsSeuls?: boolean) {
    return this.prisma.tauxTva.findMany({
      where: { tenantId, ...(actifsSeuls ? { estActif: true } : {}) },
      include: { compteCollecte: true, compteDeductible: true },
      orderBy: { taux: 'desc' },
    });
  }

  private async trouver(tenantId: string, id: string) {
    const taux = await this.prisma.tauxTva.findFirst({ where: { id, tenantId } });
    if (!taux) {
      throw new NotFoundException('Taux de TVA introuvable pour ce tenant');
    }
    return taux;
  }

  private async verifierComptes(tenantId: string, dto: { compteCollecteId?: string | null; compteDeductibleId?: string | null }) {
    for (const compteId of [dto.compteCollecteId, dto.compteDeductibleId]) {
      if (!compteId) continue;
      const compte = await this.prisma.compte.findFirst({ where: { id: compteId, tenantId } });
      if (!compte) {
        throw new NotFoundException('Compte introuvable pour ce tenant');
      }
    }
  }

  async creer(tenantId: string, dto: CreerTauxTvaDto) {
    const existant = await this.prisma.tauxTva.findUnique({ where: { tenantId_code: { tenantId, code: dto.code } } });
    if (existant) {
      throw new ConflictException(`Le taux de TVA ${dto.code} existe déjà pour ce tenant`);
    }
    await this.verifierComptes(tenantId, dto);
    return this.prisma.tauxTva.create({ data: { ...dto, tenantId } });
  }

  /**
   * SUPPRESSION D'UN TAUX · refusée dès qu'une ligne d'écriture ou de facture
   * le porte, ou qu'un compte le propose · les trois liens sont FACULTATIFS,
   * et la base les aurait dénoués en silence, sortant ces lignes de la
   * déclaration (references.ts).
   */
  async supprimer(tenantId: string, id: string) {
    const taux = await this.prisma.tauxTva.findFirst({ where: { id, tenantId } });
    if (!taux) throw new NotFoundException('Taux introuvable pour ce dossier.');
    refuserSiReferences(`Le taux ${taux.code}`, await referencesVers(this.prisma, 'TauxTva', taux.id, tenantId));
    await this.prisma.tauxTva.delete({ where: { id: taux.id } });
    return { supprime: true };
  }

  /**
   * LE TAUX D'UN TAUX MOUVEMENTÉ NE CHANGE PLUS (audit final F121). Le
   * prorata reconstitue la base hors taxes des ventes en divisant la taxe par
   * le taux COURANT de la ligne · passer un 16 % à 18 % réécrirait les prorata
   * des périodes déjà déclarées, et une facture recopiée garderait un taux que
   * sa pièce ne porte plus. Un nouveau taux se crée ; l'ancien se met en
   * sommeil. L'intitulé et les COMPTES, eux, se complètent librement · ils ne
   * récrivent rien, les lignes portant leur propre compte et la liquidation
   * soldant le compte de chaque ligne (F122).
   */
  async modifier(tenantId: string, id: string, dto: ModifierTauxTvaDto) {
    const actuel = await this.trouver(tenantId, id);
    if (dto.taux !== undefined && Number(dto.taux) !== Number(actuel.taux)) {
      const [lignesEcriture, lignesFacture] = await Promise.all([
        this.prisma.ligneEcriture.count({ where: { tauxTvaId: id, ecriture: { tenantId } } }),
        this.prisma.ligneFacture.count({ where: { tauxTvaId: id, facture: { tenantId } } }),
      ]);
      if (lignesEcriture + lignesFacture > 0) {
        throw new ConflictException(
          `Le taux ${actuel.code} porte déjà ${lignesEcriture} ligne(s) d'écriture et ${lignesFacture} ligne(s) de facture · ` +
            'changer son pourcentage réécrirait les prorata et les pièces des périodes passées. Créez un nouveau taux et ' +
            'mettez celui-ci en sommeil.',
        );
      }
    }
    await this.verifierComptes(tenantId, dto);
    return this.prisma.tauxTva.update({ where: { id }, data: dto });
  }

  /** Arrondi au centime · une seule forme, pour que les totaux se recoupent. */
  private static c(n: number) {
    return Math.round(n * 100) / 100;
  }

  /**
   * Les racines de classe 7 que l'art. 43 retire du dénominateur, pour le
   * référentiel de ce dossier · voir le commentaire des deux constantes.
   */
  private racinesHorsDenominateur(referentiel: Referentiel | undefined) {
    return referentiel === Referentiel.SYSCOHADA
      ? [...RACINES_HORS_DENOMINATEUR_COMMUNES, ...RACINES_HORS_DENOMINATEUR_SYSCOHADA]
      : [...RACINES_HORS_DENOMINATEUR_COMMUNES];
  }

  /**
   * Prorata de déduction (art. 43 O.-L.) : rapport entre les recettes
   * ouvrant droit à déduction (opérations taxables · toute écriture portant
   * au moins une ligne de TVA, y compris au taux zéro export, qui ouvre
   * droit comme les autres) et les recettes totales (comptes de produits,
   * classe 7) sur la période, arrondi à l'**unité supérieure** (règle
   * explicite du texte, pas un arrondi mathématique standard).
   *
   * LE DÉNOMINATEUR N'EST PLUS « TOUTE LA CLASSE 7 ». L'art. 43 en retire
   * nommément quatre postes, et le commentaire qui tenait ici affirmait
   * qu'aucun d'eux n'atteignait la classe 7 « dans notre plan de comptes » ·
   * le semis le démentait sur trois d'entre eux, et le module immobilisations
   * alimente réellement le quatrième. Chaque poste laissé au dénominateur
   * abaisse le prorata et fait perdre de la déduction au contribuable. Les
   * racines retranchées, et la raison de chacune, sont documentées sur
   * `RACINES_HORS_DENOMINATEUR_COMMUNES` / `_SYSCOHADA`.
   *
   * Fidélité assumée à notre modèle de données : le numérateur légal inclut
   * aussi les recettes aux missions diplomatiques/organisations
   * internationales (pas de compte dédié ici, donc non comptées à part ·
   * l'écart ne joue que pour ce cas de figure précis) ; les DÉBOURS, que
   * l'art. 43 exclut lui aussi, n'ont de compte dédié dans aucun des deux
   * plans et restent donc au dénominateur · `mention` le dit, plutôt que de
   * le taire. S'applique globalement à toute la déduction (biens, services,
   * immobilisations) en l'absence d'option secteurs distincts (art. 49, non
   * implémentée · la seule option ici est le prorata général).
   */
  async calculerProrata(tenantId: string, dateDebut: Date, dateFin: Date) {
    /*
      NUMÉRATEUR · la base hors taxes des opérations ouvrant droit à déduction.

      Elle se DÉDUIT du montant de taxe et du taux (base = TVA / taux), ce qui
      est exact ligne à ligne. La version antérieure sommait tout le crédit de
      classe 7 de chaque écriture portant une ligne de TVA : une écriture
      mixte, qui loge sur la même pièce une vente taxable et une recette
      exonérée, gonflait alors le numérateur de la part exonérée, et donc le
      pourcentage de déduction.

      Le taux ZÉRO (exportations) fait exception : la division est impossible,
      alors que ces opérations ouvrent bien droit à déduction. Leur base est
      reprise du crédit de classe 7 de leur écriture · c'est l'approximation
      d'origine, mais confinée au seul cas où elle est inévitable.
    */
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { referentiel: true },
    });
    const racinesExclues = this.racinesHorsDenominateur(tenant?.referentiel);
    const filtreExclusions = racinesExclues.map((r) => ({ numero: { startsWith: r } }));

    let numerateur = 0;
    const ecrituresTauxZero = new Set<string>();

    /*
      Le numérateur ne se lit que sur la TVA COLLECTÉE (443). Une ligne de 445
      n'est jamais une recette, et un avoir fournisseur, qui crédite le 445,
      s'y ajoutait auparavant comme s'il en était une.

      Et les livraisons/prestations à SOI-MÊME en sortent : l'art. 43,
      l. 1129-1130, les exclut « des deux termes du rapport ». Le SYSCOHADA les
      isole au 4434 · c'est le seul plan où elles sont repérables, et le seul
      où on les retranche.
    */
    // LUES PAR TRANCHES (audit final F188) · le prorata provisoire parcourt
    // toute la TVA collectée d'une ANNÉE (art. 45), et la déclaration le
    // demande à chaque appel. Chaque ligne est traitée à son arrivée ; seuls
    // le numérateur et les écritures au taux zéro survivent à la tranche.
    await lireParLots(
      (curseur) =>
        this.prisma.ligneEcriture.findMany({
          ...pageApres(curseur, LOT_LECTURE),
          where: {
            tauxTvaId: { not: null },
            compte: { numero: { startsWith: RACINE_COLLECTEE } },
            ecriture: { tenantId, statut: StatutEcriture.VALIDEE, date: { gte: dateDebut, lte: dateFin } },
          },
          select: {
            id: true,
            credit: true,
            ecritureId: true,
            compte: { select: { numero: true } },
            tauxTva: { select: { taux: true } },
          },
        }),
      (l) => {
        if (this.estLivraisonASoiMeme(tenant?.referentiel, l.compte.numero)) return;
        const taux = Number(l.tauxTva?.taux ?? 0);
        if (taux <= EPSILON) {
          ecrituresTauxZero.add(l.ecritureId);
          return;
        }
        numerateur += Number(l.credit) / (taux / 100);
      },
    );
    if (ecrituresTauxZero.size > 0) {
      const agg = await this.prisma.ligneEcriture.aggregate({
        where: {
          compte: {
            tenantId,
            classe: ClasseCompte.CLASSE_7,
            ...(filtreExclusions.length > 0 ? { NOT: filtreExclusions } : {}),
          },
          ecritureId: { in: [...ecrituresTauxZero] },
        },
        _sum: { credit: true },
      });
      numerateur += Number(agg._sum.credit ?? 0);
    }

    /*
      TROIS AGRÉGATS PLUTÔT QU'UN FILTRE NÉGATIF UNIQUE.

      Le montant retranché est RENDU (`recettesExclues`) · un prorata dont on
      ne voit pas ce qui a été retiré du dénominateur ne se vérifie pas.

      Le troisième compte les RECETTES QUE RIEN NE QUALIFIE : celles dont
      l'écriture ne porte aucune ligne de TVA collectée. L'art. 43 met au
      numérateur « le montant annuel des recettes afférentes aux opérations
      ouvrant droit à déduction de la taxe sur la valeur ajoutée, Y COMPRIS LES
      EXPORTATIONS ET OPÉRATIONS ASSIMILÉES » (l. 1115-1117). Une exportation
      est taxée à 0 % : elle n'ouvre le numérateur que si sa ligne de TVA au
      taux zéro existe. La saisie la pose, grille comme modale, par une seule
      règle (`construireLigneTva`, `client/src/lib/tva-saisie.ts`), qui ne
      renonce à la ligne que sur une taxe nulle À TAUX NON NUL
      (`!(tva > 0.005) && !tauxZero`), et l'écriture passée depuis une
      facture la pose aussi (`src/modules/facturation/ecriture-facture.ts`).
      Une écriture saisie sans taux, ou importée, n'en porte en revanche
      aucune. Audit final F228 · ce commentaire citait encore, dans
      `ModelesSaisie.tsx`, une condition qui n'y est plus et qui écartait
      justement la ligne au taux zéro.
      Le serveur ne peut PAS distinguer, dans un crédit de classe 7 nu, une
      exportation d'une recette exonérée · il ne devine donc pas, il compte ce
      qui n'est pas qualifié et le NOMME, avec son article.
    */
    // LES RECETTES DE LA PÉRIODE, SANS L'ÉCRITURE QUI SOLDE LES COMPTES DE
    // GESTION (régression de l'audit final F4) · validée et datée de la fin
    // de l'exercice, elle crédite les classes 7 à solde débiteur (le 709) et
    // comptait ce crédit comme une recette, au dénominateur comme parmi les
    // recettes que rien ne qualifie. Un seul filtre pour les trois agrégats,
    // qui doivent parler des mêmes écritures.
    const recettesDeLaPeriode = {
      tenantId,
      statut: StatutEcriture.VALIDEE,
      date: { gte: dateDebut, lte: dateFin },
      estSoldeDesComptesDeGestion: false,
    };
    const [recettesAgg, exclusAgg, nonQualifieesAgg] = await Promise.all([
      this.prisma.ligneEcriture.aggregate({
        where: {
          compte: { tenantId, classe: ClasseCompte.CLASSE_7 },
          ecriture: recettesDeLaPeriode,
        },
        _sum: { credit: true },
      }),
      filtreExclusions.length === 0
        ? Promise.resolve({ _sum: { credit: 0 } })
        : this.prisma.ligneEcriture.aggregate({
            where: {
              compte: { tenantId, classe: ClasseCompte.CLASSE_7, OR: filtreExclusions },
              ecriture: recettesDeLaPeriode,
            },
            _sum: { credit: true },
          }),
      this.prisma.ligneEcriture.aggregate({
        where: {
          compte: {
            tenantId,
            classe: ClasseCompte.CLASSE_7,
            ...(filtreExclusions.length > 0 ? { NOT: filtreExclusions } : {}),
          },
          ecriture: {
            ...recettesDeLaPeriode,
            lignes: { none: { tauxTvaId: { not: null }, compte: { numero: { startsWith: RACINE_COLLECTEE } } } },
          },
        },
        _sum: { credit: true },
      }),
    ]);

    numerateur = TauxTvaService.c(numerateur);
    const recettesClasse7 = Number(recettesAgg._sum.credit ?? 0);
    const recettesExclues = Number(exclusAgg._sum.credit ?? 0);
    const recettesNonQualifiees = TauxTvaService.c(Number(nonQualifieesAgg._sum.credit ?? 0));
    const denominateur = TauxTvaService.c(recettesClasse7 - recettesExclues);
    /*
      Aucune recette sur la période : rien ne vient limiter la déduction ·
      100 % plutôt qu'une division par zéro.

      L'arrondi est « à l'unité supérieure » (art. 43, l. 1131-1132), pas un
      arrondi mathématique. Deux précautions, et la seconde n'est pas
      cosmétique : le rapport est multiplié AVANT la division, et ramené au
      millionième avant d'être plafonné. Sans cela, un prorata exact de 55 %
      ressort en virgule flottante à 55,00000000000001 et l'unité supérieure
      le porte à 56 % · un point de prorata qui n'existe pas, et une déduction
      supérieure à ce que la loi admet.
    */
    const pourcentage =
      denominateur <= EPSILON
        ? 100
        : Math.min(100, Math.ceil(Math.round(((numerateur * 100) / denominateur) * 1e6) / 1e6));

    return {
      numerateur,
      denominateur,
      pourcentage,
      recettesClasse7,
      recettesExclues,
      /**
       * Recettes de classe 7 (hors exclusions) dont l'écriture ne porte aucune
       * ligne de TVA collectée · elles pèsent au dénominateur sans jamais
       * entrer au numérateur. Voir l'agrégat qui les compte.
       */
      recettesNonQualifiees,
      racinesExclues,
      mentionDenominateur:
        `Dénominateur : recettes de classe 7 (${recettesClasse7.toLocaleString('fr-FR')}) moins ` +
        `${recettesExclues.toLocaleString('fr-FR')} de recettes que l'article 43 en exclut (comptes ` +
        `${racinesExclues.join(', ')} · cessions d'actif immobilisé, subventions d'équipement, indemnités ` +
        "d'assurance, livraisons à soi-même). Les DÉBOURS, exclus eux aussi par l'article 43, n'ont de compte " +
        'dédié dans aucun des deux plans · s\'il y en a, les retrancher à la main.' +
        (recettesNonQualifiees > EPSILON
          ? ` ${recettesNonQualifiees.toLocaleString('fr-FR')} de ces recettes ne portent AUCUNE ligne de TVA : ` +
            "elles ne comptent qu'au dénominateur. L'article 43 met les EXPORTATIONS au numérateur, mais une " +
            "vente au taux zéro n'est reconnue que si sa ligne de TVA existe · si ces recettes en comprennent, " +
            'le prorata est sous-évalué.'
          : ''),
    };
  }

  /**
   * Livraison ou prestation à soi-même · exclue des DEUX termes du prorata
   * (art. 43, l. 1129-1130). Seul le SYSCOHADA l'isole, au 4434 « TVA
   * facturée sur production livrée à soi-même » ; le SYCEBNL ne subdivise pas
   * son 443 et ne permet pas de la repérer.
   */
  private estLivraisonASoiMeme(referentiel: Referentiel | undefined, numeroCompte: string) {
    return referentiel === Referentiel.SYSCOHADA && numeroCompte.startsWith('4434');
  }

  /**
   * PRORATA APPLICABLE À UNE DÉCLARATION · l'article 45 en commande le rythme,
   * et c'est là que le logiciel se trompait.
   *
   * Le texte impose un prorata PROVISOIRE, calculé sur les recettes de
   * l'ANNÉE PRÉCÉDENTE, appliqué à toutes les déclarations de l'année en
   * cours ; puis un prorata DÉFINITIF, arrêté au plus tard le 31 mars de
   * l'année suivante, qui donne lieu à régularisation des déductions déjà
   * opérées.
   *
   * La déclaration appliquait jusqu'ici un prorata recalculé SUR SA PROPRE
   * PÉRIODE : chaque mois portait donc un pourcentage différent, alors que la
   * loi en veut un seul pour toute l'année. Un dossier saisonnier (une
   * association qui vend à Noël et rien en février) voyait sa déduction varier
   * du simple au double d'un mois à l'autre.
   *
   * PREMIÈRE ANNÉE D'ACTIVITÉ · il n'existe aucune recette de référence. Le
   * prorata est alors estimé sur la période en cours, et l'estimation est
   * ANNONCÉE (`base`), pas dissimulée derrière un chiffre d'allure définitive.
   */
  async prorataApplicable(tenantId: string, dateDebut: Date, dateFin: Date) {
    const anneePrecedente = dateDebut.getUTCFullYear() - 1;
    const provisoire = await this.calculerProrata(
      tenantId,
      new Date(Date.UTC(anneePrecedente, 0, 1)),
      new Date(Date.UTC(anneePrecedente, 11, 31, 23, 59, 59, 999)),
    );
    if (provisoire.denominateur > EPSILON) {
      return {
        ...provisoire,
        base: 'ANNEE_PRECEDENTE' as const,
        anneeReference: anneePrecedente,
        mention:
          `Prorata provisoire de ${provisoire.pourcentage} %, calculé sur les recettes de ${anneePrecedente} ` +
          "(article 45). Il s'applique à toutes les déclarations de l'année, et sera arrêté définitivement au plus " +
          'tard le 31 mars suivant, avec régularisation des déductions déjà opérées.',
      };
    }
    const estime = await this.calculerProrata(tenantId, dateDebut, dateFin);
    return {
      ...estime,
      base: 'ESTIMATION_PERIODE' as const,
      anneeReference: null,
      mention:
        `Aucune recette n'a été enregistrée en ${anneePrecedente} : le prorata provisoire ne peut pas être calculé ` +
        `sur l'année précédente comme le veut l'article 45. Celui appliqué ici (${estime.pourcentage} %) est une ` +
        'ESTIMATION sur la période déclarée, à régulariser lors de l’arrêté définitif du 31 mars.',
    };
  }

  /**
   * PRORATA DÉFINITIF d'une année civile, et régularisation qui en découle.
   *
   * À arrêter au plus tard le 31 mars de l'année suivante (art. 45, l. 1150-1151
   * du fichier `10-tva-ol10-001-loi-base-ch1-10.md`) : « Le prorata définitif
   * est arrêté au plus tard le 31 mars de l'année suivante. LES DÉDUCTIONS
   * OPÉRÉES sont régularisées en conséquence à l'échéance qui suit. » Le décret
   * n° 011/42, art. 128, en donne le sens : « Prorata définitif > prorata
   * provisoire : déduction complémentaire égale à la différence. Prorata
   * définitif < prorata provisoire : reversement de la différence. »
   *
   * CE SONT LES DÉDUCTIONS OPÉRÉES, PAS UN PROVISOIRE RECONSTRUIT. Le calcul
   * recalculait un prorata sur l'année N−1 et s'en servait comme du taux
   * « appliqué », alors que le taux réellement appliqué est STOCKÉ, liquidation
   * par liquidation (`LiquidationTva.prorataApplique`, posé par
   * `comptabiliserLiquidation`). Deux conséquences, toutes deux au détriment de
   * la vérité du chiffre :
   *
   *  · quand N−1 était vide, le provisoire « appliqué » devenait le définitif
   *    lui-même et la régularisation sortait NULLE PAR CONSTRUCTION · or c'est
   *    exactement la situation du nouvel assujetti, celui-là même qui a déclaré
   *    toute l'année sur des estimations mensuelles variables
   *    (`prorataApplicable`, base ESTIMATION_PERIODE) ;
   *  · un dossier dont le provisoire a changé en cours d'année voyait tout son
   *    exercice régularisé au dernier taux venu.
   *
   * L'ASSIETTE, ELLE AUSSI, ÉTAIT FAUSSE : la TVA déductible brute sommait les
   * seuls DÉBITS des comptes 445x, si bien qu'un avoir fournisseur, qui les
   * crédite, restait compté comme de la taxe déduite. Elle se lit désormais en
   * solde (débits − crédits).
   *
   * CE QUI N'EST PAS RÉGULARISÉ EST DIT. La régularisation ne porte que sur les
   * périodes effectivement liquidées : une période déclarée mais jamais
   * comptabilisée ne laisse aucune trace de ce qui a été déduit, et le logiciel
   * ne l'invente pas · il en rend le montant à part (`tvaDeductibleNonLiquidee`)
   * et le nomme dans `echeance`, qui est le seul texte libre que l'écran rende.
   */
  async prorataDefinitif(tenantId: string, annee: number) {
    const debutAnnee = new Date(Date.UTC(annee, 0, 1));
    const finAnnee = new Date(Date.UTC(annee, 11, 31, 23, 59, 59, 999));

    const definitif = await this.calculerProrata(tenantId, debutAnnee, finAnnee);
    const brutAnnee = await this.tvaDeductibleBrute(tenantId, debutAnnee, finAnnee);

    // Les liquidations de l'année, dans l'ordre · chacune porte le pourcentage
    // qui a RÉELLEMENT servi à limiter la déduction de sa période.
    const liquidations = await this.prisma.liquidationTva.findMany({
      where: { tenantId, dateDebut: { gte: debutAnnee }, dateFin: { lte: finAnnee } },
      orderBy: { dateDebut: 'asc' },
    });

    const periodes: Array<{
      dateDebut: string;
      dateFin: string;
      pourcentageApplique: number;
      tvaDeductibleBrute: number;
      deduite: number;
    }> = [];
    let brutCouvert = 0;
    let admiseAppliquee = 0;
    for (const l of liquidations) {
      const brut = await this.tvaDeductibleBrute(tenantId, l.dateDebut, l.dateFin);
      const pourcentage = Number(l.prorataApplique);
      const deduite = TauxTvaService.c(brut * (pourcentage / 100));
      brutCouvert = TauxTvaService.c(brutCouvert + brut);
      admiseAppliquee = TauxTvaService.c(admiseAppliquee + deduite);
      periodes.push({
        dateDebut: l.dateDebut.toISOString().slice(0, 10),
        dateFin: l.dateFin.toISOString().slice(0, 10),
        pourcentageApplique: pourcentage,
        tvaDeductibleBrute: brut,
        deduite,
      });
    }

    const admiseDefinitive = TauxTvaService.c(brutCouvert * (definitif.pourcentage / 100));
    const regularisation = TauxTvaService.c(admiseDefinitive - admiseAppliquee);
    // Le taux « appliqué » d'une année à plusieurs liquidations n'est pas un
    // scalaire : on rend la moyenne PONDÉRÉE par l'assiette de chaque période,
    // et le détail période par période à côté. Sans liquidation, il n'y a pas
    // de taux appliqué du tout · 0 plutôt qu'un chiffre d'allure normale.
    const pourcentageApplique =
      brutCouvert > EPSILON ? TauxTvaService.c((admiseAppliquee / brutCouvert) * 100) : 0;
    const tvaDeductibleNonLiquidee = TauxTvaService.c(brutAnnee - brutCouvert);

    const echeance =
      liquidations.length === 0
        ? `Aucune liquidation de TVA n'est comptabilisée pour ${annee} : aucune déduction opérée n'est tracée, ` +
          `et la régularisation de l'article 45 ne peut donc pas être chiffrée. Le prorata définitif ` +
          `${annee} ressort à ${definitif.pourcentage} % ; la TVA déductible brute de l'année est de ` +
          `${brutAnnee.toLocaleString('fr-FR')} CDF. À arrêter au plus tard le 31 mars ${annee + 1} (article 45).`
        : `À arrêter au plus tard le 31 mars ${annee + 1} (article 45). Régularisation calculée sur les ` +
          `${liquidations.length} période(s) réellement liquidée(s) et sur le prorata effectivement appliqué à ` +
          `chacune` +
          (tvaDeductibleNonLiquidee > EPSILON
            ? `. ${tvaDeductibleNonLiquidee.toLocaleString('fr-FR')} CDF de TVA déductible de ${annee} ne sont ` +
              "couverts par aucune liquidation : aucune déduction n'y a été opérée, ils ne sont donc pas " +
              'régularisés ici.'
            : '.');

    return {
      annee,
      definitif,
      pourcentageApplique,
      /** Assiette de la régularisation · la seule sur laquelle on a déduit. */
      tvaDeductibleBrute: brutCouvert,
      /** Toute la TVA d'amont de l'année, liquidée ou non, en solde. */
      tvaDeductibleBruteAnnee: brutAnnee,
      tvaDeductibleNonLiquidee,
      periodes,
      admiseDefinitive,
      admiseAppliquee,
      regularisation,
      sens:
        Math.abs(regularisation) <= EPSILON
          ? ('AUCUNE' as const)
          : regularisation > 0
            ? ('DEDUCTION_COMPLEMENTAIRE' as const)
            : ('REVERSEMENT' as const),
      echeance,
    };
  }

  /**
   * TVA d'amont d'une période, lue par FAMILLE (445x) et non sur le compte
   * porté par chaque taux · même raison que pour la déclaration, voir
   * RACINE_RECUPERABLE.
   *
   * EN SOLDE, débits moins crédits. La somme des seuls débits comptait un
   * avoir fournisseur, qui crédite le 445 et ANNULE une déduction, comme de
   * la taxe déduite de plus.
   */
  private async tvaDeductibleBrute(tenantId: string, dateDebut: Date, dateFin: Date) {
    const comptes = (
      await this.prisma.compte.findMany({
        where: { tenantId, numero: { startsWith: RACINE_RECUPERABLE } },
        select: { id: true },
      })
    ).map((c) => c.id);
    if (comptes.length === 0) return 0;
    const agg = await this.prisma.ligneEcriture.aggregate({
      where: {
        compteId: { in: comptes },
        ecriture: { tenantId, statut: StatutEcriture.VALIDEE, date: { gte: dateDebut, lte: dateFin } },
      },
      _sum: { debit: true, credit: true },
    });
    return TauxTvaService.c(Number(agg._sum.debit ?? 0) - Number(agg._sum.credit ?? 0));
  }

  /** La TVA d'écritures au brouillard datées de la période (audit final F25). */
  private async tvaAuBrouillard(tenantId: string, idsTaux: string[], dateDebut: Date, dateFin: Date) {
    if (idsTaux.length === 0) return { collecte: 0, deductible: 0, ecritures: 0 };
    const auBrouillard = { tenantId, statut: StatutEcriture.BROUILLARD, date: { gte: dateDebut, lte: dateFin } };
    const [collecte, deductible, ecritures] = await Promise.all([
      this.prisma.ligneEcriture.aggregate({
        where: { tauxTvaId: { in: idsTaux }, compte: { numero: { startsWith: RACINE_COLLECTEE } }, ecriture: auBrouillard },
        _sum: { debit: true, credit: true },
      }),
      this.prisma.ligneEcriture.aggregate({
        where: { tauxTvaId: { in: idsTaux }, compte: { numero: { startsWith: RACINE_RECUPERABLE } }, ecriture: auBrouillard },
        _sum: { debit: true, credit: true },
      }),
      this.prisma.ecriture.count({
        where: {
          tenantId,
          statut: StatutEcriture.BROUILLARD,
          date: { gte: dateDebut, lte: dateFin },
          lignes: { some: { tauxTvaId: { in: idsTaux } } },
        },
      }),
    ]);
    return {
      collecte: TauxTvaService.c(Number(collecte._sum.credit ?? 0) - Number(collecte._sum.debit ?? 0)),
      deductible: TauxTvaService.c(Number(deductible._sum.debit ?? 0) - Number(deductible._sum.credit ?? 0)),
      ecritures,
    };
  }

  /**
   * EXIGIBILITÉ · à quelle date une ligne de TVA entre dans une déclaration.
   *
   * Ce n'est pas toujours la date de l'écriture. L'ordonnance-loi n° 10/001
   * distingue le FAIT GÉNÉRATEUR (art. 24, l'événement qui fait naître la
   * créance fiscale) de l'EXIGIBILITÉ (art. 25, le moment où l'administration
   * peut en réclamer le paiement) ; c'est la seconde qui commande la période
   * de déclaration. Pour les prestations de services et les travaux
   * immobiliers, l'art. 25, 2° la place « au moment de l'encaissement du prix,
   * des acomptes ou avances » : une facture de mars réglée en juin se déclare
   * en JUIN.
   *
   * L'ENCAISSEMENT EST UN ÉVÉNEMENT DE TRÉSORERIE, JAMAIS UN ACTE DU
   * COMPTABLE · et c'est là que le logiciel se trompait de date.
   *
   * Décret n° 011/42, art. 57 (fichier
   * `code-general-2026/references/11-tva-decret-application-ch1-4.md`,
   * l. 1749-1761) : « L'encaissement s'entend de la perception des sommes, à
   * quelque titre que ce soit, notamment avances, acomptes et règlement pour
   * solde, du fait de la réalisation de l'opération ou de l'exécution des
   * travaux. / Il intervient : / - lors de la remise des espèces, en cas de
   * paiement en espèces ; / - à la date de la remise du chèque, en cas de
   * paiement par chèque ; / - à la date de l'inscription au crédit du compte
   * du fournisseur, en cas de paiement par virement, ordre de paiement ou par
   * tout autre moyen, y compris les moyens électroniques, ayant un pouvoir
   * libératoire […] ; / - à la date de l'échéance de la traite, même si elle a
   * été remise à l'escompte auprès d'un établissement financier, en cas de
   * paiement par effet de commerce. » (Synthèse concordante dans
   * `tva/references/12-decret-011-42-fait-generateur-exigibilite.md`, l. 38-42.)
   *
   * Chacun de ces quatre événements est un mouvement de TRÉSORERIE, que la
   * comptabilité enregistre par une écriture datée · aucun n'est un acte du
   * comptable.
   *
   * Le code lisait `Lettrage.soldeAt`. Or `lettrage.service.ts` l. 309 pose
   * `soldeAt: soldeNul ? new Date() : null` : c'est L'INSTANT OÙ LE COMPTABLE
   * A LETTRÉ, pas la date du règlement. Un encaissement de juin lettré en
   * septembre rendait la taxe exigible en septembre, avec la pénalité de
   * retard qui court entre les deux. Et un groupe resté PARTIEL n'a jamais de
   * `soldeAt` du tout : la fraction encaissée retombait sur la date de la
   * FACTURE · déclarée trop tôt quand la facture est dans la période, jamais
   * déclarée du tout quand l'acompte est encaissé un mois postérieur (la date
   * calculée reste alors antérieure à la période, et la ligne est écartée).
   * Le commentaire qui tenait ici promettait déjà « la date d'écriture du
   * règlement le plus récent du groupe » · aucun code ne la lisait.
   *
   * CE QUE LE LOGICIEL LIT DÉSORMAIS · la date d'ÉCRITURE des règlements du
   * groupe de lettrage, c'est-à-dire la date à laquelle la trésorerie a été
   * mouvementée, telle que la comptabilité l'enregistre. C'est la donnée la
   * plus proche de l'événement de l'art. 57 dont dispose un logiciel de
   * comptabilité ; `soldeAt` n'est plus utilisé pour dater quoi que ce soit.
   *
   * Ce que le logiciel ne fait PAS, et le dit : il ne devine pas quelle ligne
   * du groupe a réglé quelle facture quand plusieurs factures y sont réunies.
   * Il retient alors le règlement le PLUS RÉCENT du groupe, et la proportion
   * réglée. C'est l'imputation la plus neutre ; l'imputation « plus ancienne
   * d'abord » du fisc donnerait, sur un groupe multi-factures, un
   * fractionnement différent.
   */
  private exigibilite(
    ligne: { debit: unknown; credit: unknown },
    lignesTiers: Array<{
      debit: unknown;
      credit: unknown;
      lettrage: {
        statut: string;
        solde: unknown;
        soldeAt: Date | null;
        lignes?: Array<{ debit: unknown; credit: unknown; ecriture?: { date: Date } | null }>;
      } | null;
    }>,
    dateEcriture: Date,
  ): { date: Date | null; fraction: number } {
    // Aucune contrepartie de tiers lettrable : rien ne dit quand l'argent est
    // entré. On s'en tient à la date de l'écriture · c'est le cas d'une vente
    // au comptant, où encaissement et écriture coïncident de toute façon.
    const avecLettrage = lignesTiers.filter((l) => l.lettrage);
    if (avecLettrage.length === 0) return { date: dateEcriture, fraction: 1 };

    const groupe = avecLettrage[0].lettrage!;
    // Sens de la FACTURE sur le compte de tiers · une vente débite le 411, un
    // achat crédite le 401. Le règlement est, par construction, ce qui va dans
    // l'autre sens ; c'est le seul critère qui distingue, à l'intérieur du
    // groupe, un règlement d'une autre facture.
    const sensFacture = avecLettrage.reduce((t, l) => t + (Number(l.debit) - Number(l.credit)), 0);
    const dateReglement = TauxTvaService.dateDernierReglement(groupe.lignes, sensFacture);

    if (groupe.statut === 'SOLDE') {
      // Dénoué : exigible en totalité, à la date du DERNIER règlement · c'est
      // lui qui achève la perception du prix (décret art. 57). Sans règlement
      // identifiable (facture et encaissement dans la même écriture, groupe
      // dont les lignes ne sont pas chargées), la date de l'écriture sert de
      // repli : elle date au plus tôt, ce qui fait déclarer d'avance et non en
      // retard, quand `soldeAt` datait au plus tard.
      return { date: dateReglement ?? dateEcriture, fraction: 1 };
    }
    // Groupe PARTIEL · une part est encaissée. `solde` est le reste à solder,
    // signé ; la part réglée est donc (engagé - |reste|) / engagé.
    const engage = avecLettrage.reduce((t, l) => t + Math.abs(Number(l.debit) - Number(l.credit)), 0);
    const reste = Math.abs(Number(groupe.solde));
    if (engage <= EPSILON) return { date: null, fraction: 0 };
    const fraction = Math.min(1, Math.max(0, (engage - reste) / engage));
    if (fraction <= EPSILON) return { date: null, fraction: 0 };
    // La part encaissée l'a été à la date du règlement le plus récent du
    // groupe · l'acompte de l'art. 57 rend la taxe exigible ce jour-là, et non
    // au jour de la facture ni au jour du lettrage.
    return { date: dateReglement ?? dateEcriture, fraction };
  }

  /**
   * Date d'écriture du règlement le plus récent d'un groupe de lettrage.
   *
   * `sensFacture` porte le signe (débit - crédit) de la facture sur le compte
   * de tiers ; les règlements sont les lignes de signe OPPOSÉ. Les lignes de
   * même signe sont d'autres factures du même groupe, jamais des encaissements.
   * `null` quand le groupe n'en porte aucune · l'appelant retombe alors sur la
   * date de l'écriture, et le dit.
   */
  private static dateDernierReglement(
    lignes: Array<{ debit: unknown; credit: unknown; ecriture?: { date: Date } | null }> | undefined,
    sensFacture: number,
  ): Date | null {
    if (!lignes || lignes.length === 0 || Math.abs(sensFacture) <= EPSILON) return null;
    let plusRecent: Date | null = null;
    for (const l of lignes) {
      const sens = Number(l.debit) - Number(l.credit);
      if (Math.abs(sens) <= EPSILON) continue;
      if (sens > 0 === sensFacture > 0) continue;
      const date = l.ecriture?.date;
      if (!date) continue;
      if (!plusRecent || date > plusRecent) plusRecent = date;
    }
    return plusRecent;
  }

  /**
   * LE RÈGLEMENT ANTÉRIEUR AU DÉBIT · décret n° 011/42, art. 62
   * (`code-general-2026/references/11-tva-decret-application-ch1-4.md`,
   * l. 1797-1800) : « L'autorisation de payer la taxe sur la valeur ajoutée
   * d'après les débits ne dispense pas le redevable de s'acquitter de la taxe
   * au moment de l'encaissement du prix ou de l'acompte si celui-ci est
   * antérieur au débit. » Même règle à l'O.-L. n° 10/001, art. 26 al. 3
   * (`10-tva-ol10-001-loi-base-ch1-10.md`, l. 658-660 : « Elle ne dispense pas
   * le redevable de s'acquitter de la taxe sur la valeur ajoutée au moment de
   * l'encaissement du prix ou de l'acompte si celui-ci intervient avant les
   * débits »).
   *
   * La taxe d'une opération aux débits se découpe donc en TRANCHES : chaque
   * règlement lettré à la facture et daté AVANT elle rend exigible sa part à
   * sa propre date, le reste l'est à l'inscription au débit (décret art. 61).
   * Chez un fournisseur autorisé, c'est aussi la date de la déduction du
   * client · art. 37 al. 1 (« Le droit à déduction prend naissance lorsque la
   * taxe devient exigible chez l'assujetti ») et décret art. 96
   * (`12-tva-decret-application-ch5-8.md`, l. 345-351 : « L'assujetti visé à
   * l'alinéa 1er ci-dessus s'entend du fournisseur de biens ou du prestataire
   * de services »). Le code datait tout au débit, donc la déduction trop tard.
   *
   * LE RÈGLEMENT SE LIT COMME POUR L'ENCAISSEMENT (voir `exigibilite`) · la
   * date d'ÉCRITURE des lignes du groupe de lettrage de sens opposé à la
   * facture (décret art. 57). Un règlement du même jour que la facture n'est
   * pas « antérieur ».
   *
   * CE QUI NE SE TRANCHE PAS SE DATE AU DÉBIT, comme avant · plusieurs lignes
   * de tiers lettrées, ou un groupe qui réunit d'autres factures (une somme
   * de même sens plus grande que celle de l'écriture) : rien ne dit alors
   * quel règlement a payé cette facture-ci. Le débit est postérieur au
   * règlement, si bien que la date retenue est la plus tardive des deux · une
   * déduction tardive ne se redresse pas (art. 37 al. 2 la laisse ouverte
   * jusqu'au 31 décembre de l'année suivante). Un acompte versé au 409, ou
   * reçu au 419, n'est lettré à aucune facture et reste invisible · la
   * déclaration continue de le dire pour la collecte.
   */
  private static tranchesAuxDebits(
    lignesTiers: Array<{
      debit: unknown;
      credit: unknown;
      lettrage: {
        lignes?: Array<{ debit: unknown; credit: unknown; ecriture?: { date: Date } | null }>;
      } | null;
    }>,
    dateDebit: Date,
  ): Array<{ date: Date; fraction: number; auPaiement?: boolean }> {
    const auDebit = [{ date: dateDebit, fraction: 1 }];
    const avecLettrage = lignesTiers.filter((l) => l.lettrage);
    if (avecLettrage.length !== 1) return auDebit;
    const facture = avecLettrage[0];
    const sensFacture = Number(facture.debit) - Number(facture.credit);
    const engage = Math.abs(sensFacture);
    const lignesGroupe = facture.lettrage!.lignes ?? [];
    if (engage <= EPSILON || lignesGroupe.length === 0) return auDebit;
    let memeSens = 0;
    const anterieurs: Array<{ date: Date; montant: number }> = [];
    for (const g of lignesGroupe) {
      const sens = Number(g.debit) - Number(g.credit);
      if (Math.abs(sens) <= EPSILON) continue;
      if (sens > 0 === sensFacture > 0) {
        memeSens += Math.abs(sens);
        continue;
      }
      const date = g.ecriture?.date;
      if (date && date.getTime() < dateDebit.getTime()) anterieurs.push({ date, montant: Math.abs(sens) });
    }
    // D'autres factures dans le groupe · l'imputation est inconnue.
    if (memeSens > engage + EPSILON || anterieurs.length === 0) return auDebit;
    anterieurs.sort((a, b) => a.date.getTime() - b.date.getTime());
    const tranches: Array<{ date: Date; fraction: number; auPaiement?: boolean }> = [];
    let regle = 0;
    for (const a of anterieurs) {
      const part = Math.min(a.montant, engage - regle);
      if (part <= EPSILON) break;
      regle += part;
      tranches.push({ date: a.date, fraction: part / engage, auPaiement: true });
    }
    const reste = 1 - regle / engage;
    if (reste > EPSILON) tranches.push({ date: dateDebit, fraction: reste });
    return tranches;
  }

  /**
   * La taxe d'une ligne répartie sur ses tranches · une tranche seule garde
   * l'arrondi d'avant (`c(montant × fraction)`), plusieurs tranches qui
   * couvrent toute la ligne rendent sa taxe au centime, la dernière recevant
   * le reste.
   */
  private static montantsDesTranches(montant: number, tranches: ReadonlyArray<{ fraction: number }>): number[] {
    if (tranches.length === 1) return [TauxTvaService.c(montant * tranches[0].fraction)];
    const total = tranches.reduce((t, x) => t + x.fraction, 0);
    const montants: number[] = [];
    let cumul = 0;
    tranches.forEach((t, i) => {
      if (i === tranches.length - 1 && Math.abs(total - 1) <= EPSILON) {
        montants.push(TauxTvaService.c(montant - cumul));
      } else {
        const m = TauxTvaService.c(montant * t.fraction);
        cumul = TauxTvaService.c(cumul + m);
        montants.push(m);
      }
    });
    return montants;
  }

  /**
   * NATURE de l'opération portée par une ligne de TVA · voir le commentaire
   * de `NATURE_COLLECTEE_SYSCOHADA`. INDETERMINEE n'est pas un échec : c'est
   * le seul aveu honnête quand le plan ne subdivise pas.
   */
  private natureOperation(
    referentiel: Referentiel | undefined,
    numeroCompte: string,
    estCollecte: boolean,
    contreparties: readonly string[] = [],
  ): NatureOperationTva {
    /*
      LE RÉFÉRENTIEL NE FERME PLUS LA PORTE D'ENTRÉE, ET C'EST UNE CORRECTION.

      Cette méthode commençait par « if (referentiel !== SYSCOHADA) return
      INDETERMINEE », au motif que « le plan SYCEBNL ne subdivise ni 443 ni
      445 ». Le motif était vrai et la conclusion l'a cessé : depuis la passe
      F2a, la nature ne se lit PLUS au compte de TVA, elle se lit à la
      CONTREPARTIE. Or les classes 6 des deux plans portent les mêmes numéros
      sous les mêmes intitulés · le 60510000 est « Eau » et le 60570000
      « Achats d'études et prestations de services » dans les DEUX semis. La
      garde écartait donc une lecture qui marche, et la déclaration en donnait
      pour raison que « aucune nature n'y est lisible », ce qui n'était plus
      exact. Troisième fois que le dépôt écarte une règle sur une affirmation
      périmée ; la première fut l'homologation de la facture, la deuxième les
      exclusions de l'article 41.

      CE QUI RESTE FERMÉ, ET POURQUOI · LA CLASSE 7. Le plan SYCEBNL y porte
      les mêmes numéros pour d'autres comptes : son 70510000 est « Ventes de
      marchandises » quand celui du SYSCOHADA est « Dans la Région », sous 705
      « Travaux facturés ». Ouvrir la table des produits aux deux plans
      daterait une vente de marchandises SYCEBNL à l'encaissement et MINORERAIT
      sa déclaration · le défaut aurait été créé par la correction.
    */
    const estSyscohada = referentiel === Referentiel.SYSCOHADA;

    // LA CONTREPARTIE D'ABORD · c'est elle qui porte l'opération que les
    // art. 6 et 8 de la loi, et les art. 10 et 17 du décret, qualifient. Une
    // seule contrepartie non classée, ou deux contreparties de natures
    // différentes, et rien n'est tranché.
    let vue: NatureOperationTva | null = null;
    for (const numero of contreparties) {
      const nature = TauxTvaService.natureContrepartie(numero, estCollecte, estSyscohada);
      if (nature === 'INDETERMINEE') return 'INDETERMINEE';
      if (vue && vue !== nature) return 'INDETERMINEE';
      vue = nature;
    }
    if (vue) return vue;

    // AUCUNE CONTREPARTIE LISIBLE · la racine du compte de TVA reste le seul
    // indice, et elle n'est lisible qu'au SYSCOHADA. La déclaration annonce le
    // repli quand elle ne dit rien.
    if (!estSyscohada) return 'INDETERMINEE';
    const table = estCollecte ? NATURE_COLLECTEE_SYSCOHADA : NATURE_RECUPERABLE_SYSCOHADA;
    for (const [racine, nature] of table) {
      if (numeroCompte.startsWith(racine)) return nature;
    }
    return 'INDETERMINEE';
  }

  /**
   * Nature d'un compte de contrepartie · LA PLUS LONGUE RACINE L'EMPORTE.
   *
   * Les CHARGES et les IMMOBILISATIONS se lisent aux deux référentiels ; les
   * PRODUITS au seul SYSCOHADA, la classe 7 du SYCEBNL portant les mêmes
   * numéros pour d'autres comptes.
   */
  private static natureContrepartie(
    numero: string,
    estCollecte: boolean,
    estSyscohada: boolean,
  ): NatureOperationTva {
    if (estCollecte && !estSyscohada) return 'INDETERMINEE';
    if (estCollecte) return TauxTvaService.plusLongue(NATURE_CONTREPARTIE_PRODUITS_SYSCOHADA, numero).nature;
    const commune = TauxTvaService.plusLongue(NATURE_CONTREPARTIE_CHARGES, numero);
    if (estSyscohada) return commune.nature;
    // Le propre du SYCEBNL l'emporte à longueur égale · c'est lui qui connaît
    // son plan.
    const propre = TauxTvaService.plusLongue(NATURE_CONTREPARTIE_CHARGES_SYCEBNL, numero);
    return propre.longueur >= commune.longueur ? propre.nature : commune.nature;
  }

  /** La plus longue racine d'une table qui préfixe ce numéro. */
  private static plusLongue(
    table: ReadonlyArray<readonly [string, NatureOperationTva]>,
    numero: string,
  ): { nature: NatureOperationTva; longueur: number } {
    let nature: NatureOperationTva = 'INDETERMINEE';
    let longueur = -1;
    for (const [racine, n] of table) {
      if (numero.startsWith(racine) && racine.length > longueur) {
        nature = n;
        longueur = racine.length;
      }
    }
    return { nature, longueur };
  }

  /**
   * CE FOURNISSEUR ACQUITTE-T-IL LA TVA D'APRÈS LES DÉBITS ? (art. 26)
   *
   * La question ne se pose que pour la TVA DÉDUCTIBLE, et sa réponse ne se
   * calcule pas : elle se LIT sur la facture. Décret n° 011/42, art. 60
   * (fichier `code-general-2026/references/11-tva-decret-application-ch1-4.md`,
   * l. 1787-1790) : « La mention "Autorisation d'acquitter la TVA d'après les
   * débits" doit figurer sur toutes les factures délivrées par le prestataire
   * de services ou l'entrepreneur de travaux publics ou de travaux
   * immobiliers. » Le comptable la reporte sur la fiche du tiers
   * (`Tiers.autoriseTvaDebits`), et c'est la FICHE qui date la déduction ·
   * l'autorisation est un fait du FOURNISSEUR, une décision du Directeur
   * Général des Impôts (art. 26, décret art. 58 et 59) dont la fiche porte la
   * référence, et non de chaque pièce. La mention recopiée sur la facture
   * d'achat enregistrée (`Facture.mentionTvaDebits`) en est la PREUVE : la
   * déclaration la lit pour dire ce que l'anticipation a de prouvé et ce que
   * la fiche ne dit pas encore (`mentionDebitsLueSurLaFacture`, audit final
   * F228), sans en faire une seconde source de datation, qui daterait de deux
   * façons deux factures du même fournisseur. Le logiciel n'invente rien.
   *
   * LE CHEMIN JUSQU'AU FOURNISSEUR, ET CE QU'IL NE DIT PAS. Une ligne de TVA
   * ne porte aucun tiers : le seul rattachement est la CONTREPARTIE de classe 4
   * de la même écriture, dont le compte auxiliaire est rattaché à un tiers et à
   * un seul (`TiersCompte.compteId` est unique). Trois situations ne concluent
   * pas, et le droit commun s'y applique :
   *
   *  · aucune contrepartie de tiers RATTACHÉE (achat réglé en espèces, compte
   *    collectif 401 laissé sans auxiliaire) · le fournisseur n'est pas nommé ;
   *  · une contrepartie rattachée à un tiers dont l'autorisation n'est pas
   *    saisie · FAUX est le défaut de la colonne, pas une réponse ;
   *  · plusieurs contreparties dont l'une au moins ne répond pas OUI · rien ne
   *    dit laquelle supporte la taxe de cette ligne, et trancher au hasard
   *    reviendrait à choisir entre déduire trop tôt et déduire trop tard.
   *
   * D'où le sens exact du drapeau rendu : VRAI = « autorisation lue sur la
   * facture et saisie sur chacun des tiers de l'écriture » ; FAUX = « le
   * logiciel ne sait pas ». Il ne signifie JAMAIS « ce fournisseur n'est pas
   * autorisé », et c'est pourquoi la déclaration continue d'avertir sur tout ce
   * qu'elle a différé.
   *
   * `reference` porte la décision du Directeur Général des Impôts (art. 26,
   * décret art. 59) telle qu'elle a été saisie · NULL dès qu'un seul des tiers
   * autorisés n'en porte aucune, pour que la déclaration puisse signaler une
   * anticipation qui ne s'appuie sur aucune pièce nommée.
   *
   * L'AUTORISATION A UNE PÉRIODE, ET L'OPÉRATION DOIT Y TOMBER. La fiche porte
   * la date d'effet (décision, ou silence de dix jours qui vaut autorisation ·
   * décret art. 59, `code-general-2026/references/
   * 11-tva-decret-application-ch1-4.md`, l. 1781-1785 : « L'absence de
   * décision dans ce délai vaut autorisation ») et la date du retour au droit
   * commun (O.-L. n° 10/001, art. 26 al. 2 : « L'autorisation demeure valable
   * tant que le redevable n'a pas demandé, par écrit, de revenir au régime de
   * droit commun » ; décret art. 63, l. 1802-1806 : « révocable sur simple
   * demande écrite du contribuable »). Le drapeau seul anticipait toutes les
   * factures du fournisseur, celles d'avant la décision comme celles d'après
   * la révocation · une déduction avancée hors de la période est une
   * déduction avant l'exigibilité chez le fournisseur (art. 37 al. 1), donc
   * redressable. La date comparée est celle de l'écriture, qui porte
   * l'inscription au débit du compte du client (décret art. 61) et que la
   * déclaration retient pour dater aux débits (`situationAutorisationDebits`).
   *
   * HORS PÉRIODE, DROIT COMMUN, ET LE FOURNISSEUR EST NOMMÉ (`horsPeriode`).
   * AUTORISÉ SANS DATE D'EFFET · l'anticipation est GARDÉE, parce que c'est ce
   * que la fiche disait avant qu'elle porte une date et qu'aucune donnée
   * nouvelle ne permet de la retirer ; mais elle n'est pas prouvée pour cette
   * date, et `nonDatee` le fait dire à la déclaration. Aucune date n'est
   * inventée · ni celle de la fiche, ni celle d'une demande qu'OmegaX ne
   * connaît pas.
   */
  private static fournisseurAuxDebits(
    lignesTiers: Array<{
      compte?: {
        tiersCompte?: {
          tiers: FicheAutorisationDebits & {
            referenceAutorisationDebits: string | null;
            code?: string | null;
            nom?: string | null;
          };
        } | null;
      } | null;
    }>,
    dateOperation: Date,
  ): {
    autorise: boolean;
    reference: string | null;
    nonDatee: string[];
    horsPeriode: string[];
    noms: string[];
  } {
    let rattaches = 0;
    let reference: string | null = null;
    let referenceManquante = false;
    let refuse = false;
    const nonDatee: string[] = [];
    const horsPeriode: string[] = [];
    const noms: string[] = [];
    for (const l of lignesTiers) {
      const tiers = l.compte?.tiersCompte?.tiers;
      if (!tiers) continue;
      rattaches += 1;
      const nom = TauxTvaService.nomDuTiers(tiers);
      if (!noms.includes(nom)) noms.push(nom);
      const situation = situationAutorisationDebits(tiers, dateOperation);
      if (situation === 'NON_AUTORISE') {
        refuse = true;
        continue;
      }
      if (situation === 'AVANT_EFFET' || situation === 'REVOQUEE') {
        refuse = true;
        if (!horsPeriode.includes(nom)) horsPeriode.push(nom);
        continue;
      }
      if (situation === 'AUTORISE_NON_DATE' && !nonDatee.includes(nom)) nonDatee.push(nom);
      if (!tiers.referenceAutorisationDebits) referenceManquante = true;
      else reference = reference ?? tiers.referenceAutorisationDebits;
    }
    if (rattaches === 0 || refuse) return { autorise: false, reference: null, nonDatee: [], horsPeriode, noms };
    return { autorise: true, reference: referenceManquante ? null : reference, nonDatee, horsPeriode: [], noms };
  }

  /** Le fournisseur tel que le cabinet le reconnaît · code et nom de la fiche. */
  private static nomDuTiers(tiers: { code?: string | null; nom?: string | null }): string {
    const code = tiers.code?.trim();
    const nom = tiers.nom?.trim();
    if (code && nom) return `${code} ${nom}`;
    return nom || code || 'tiers sans nom';
  }

  /**
   * LA MENTION DE L'ARTICLE 60, LUE SUR LA FACTURE D'ACHAT RATTACHÉE À
   * L'ÉCRITURE (audit final F228). Décret n° 011/42, art. 60 : la mention
   * « doit figurer sur toutes les factures délivrées par le prestataire de
   * services ou l'entrepreneur de travaux publics ou de travaux immobiliers »
   * autorisé. La déclaration écrivait qu'OmegaX ne pouvait pas la vérifier,
   * alors que la facture enregistrée porte le champ
   * (`Facture.mentionTvaDebits`), que la saisie d'une facture reçue offre
   * désormais à cocher.
   *
   * VRAI seulement sur une facture d'ACHAT cochée · la mention d'une VENTE est
   * celle que le DOSSIER porte pour sa propre collecte, elle ne dit rien de
   * son fournisseur. FAUX ne veut jamais dire « la pièce ne la porte pas » :
   * la colonne vaut faux par défaut, et une facture d'achat enregistrée sans
   * que la case ait été examinée ressemble trait pour trait à une facture qui
   * ne porte pas la mention. FAUX dit seulement « pas lue ici ».
   */
  private static mentionDebitsLueSurLaFacture(
    facture: { sens?: SensFacture | null; mentionTvaDebits?: boolean | null } | null | undefined,
  ): boolean {
    return facture?.sens === SensFacture.ACHAT && facture.mentionTvaDebits === true;
  }

  /**
   * SUR QUOI SE DATE UNE LIGNE · fait générateur (date de l'écriture) ou
   * encaissement (date du règlement de la contrepartie de tiers).
   *
   * COLLECTE · art. 25. Les biens au fait générateur (1°), les services et
   * travaux à l'encaissement (2°). Le paramètre du dossier ne peut plus
   * différer la TVA d'une vente de marchandises : l'art. 25, 1° ne connaît
   * aucune option, et le régime des DÉBITS lui-même n'est ouvert qu'« aux
   * entrepreneurs de travaux publics et de travaux immobiliers ainsi qu'aux
   * prestataires de services » (art. 26, l. 648-650). C'est donc SEULEMENT sur
   * les services et travaux que l'autorisation de l'art. 26 déplace la date,
   * de l'encaissement vers l'inscription au débit du compte du client · c'est
   *-à-dire la date de la facture, donc de l'écriture.
   *
   * DÉDUCTION · art. 37 al. 1 : « Le droit à déduction prend naissance lorsque
   * la taxe devient exigible chez l'assujetti » (l. 987-988), et le décret
   * n° 011/42, art. 96, lève l'ambiguïté du mot : « L'assujetti visé s'entend
   * du FOURNISSEUR/PRESTATAIRE. » C'est donc la situation du fournisseur qui
   * commande, jamais le régime de vente de l'acheteur · le code appliquait
   * exactement l'inverse, et différait au lettrage la déduction d'un achat de
   * marchandises dès que le dossier était paramétré aux encaissements.
   *
   * ET CETTE SITUATION EST DÉSORMAIS CONNUE, QUAND ELLE A ÉTÉ SAISIE. Un
   * prestataire autorisé par l'art. 26 rend sa taxe exigible « par
   * l'inscription de la somme au débit du compte du client » (décret art. 61,
   * l. 1792-1795), donc à la facture : la déduction de son client naît ce
   * jour-là et non à son paiement. Le drapeau vient de `fournisseurAuxDebits`,
   * qui dit aussi dans quels cas ce rattachement ne conclut pas.
   *
   * CE QUE LE LOGICIEL NE SAIT TOUJOURS PAS, ET NE DEVINE PAS. Un fournisseur
   * dont l'autorisation n'a pas été saisie n'est pas un fournisseur NON
   * AUTORISÉ : c'est un fournisseur dont le régime est ignoré. Le droit commun
   * lui est appliqué et l'exception reste ANNONCÉE avec son article. Différer
   * une déduction ne fait courir aucun redressement, et l'art. 37 al. 2 laisse
   * jusqu'au 31 décembre de l'année suivante pour l'exercer ; l'anticiper, si.
   *
   * LE RÈGLEMENT ANTÉRIEUR AU DÉBIT EST VENTILÉ QUAND IL EST LETTRÉ. L'art. 26
   * in fine et le décret art. 62 (l. 1797-1800) réservent le cas où le prix
   * ou l'acompte est encaissé AVANT le débit : la taxe est alors exigible chez
   * le fournisseur dès cet encaissement. La base reste FAIT_GENERATEUR ici ;
   * c'est la déclaration qui découpe la taxe en tranches
   * (`tranchesAuxDebits`) quand un règlement lettré à la facture la précède.
   * Un acompte que rien ne relie à la facture reste daté au débit, donc au
   * plus tard.
   *
   * NATURE INDÉTERMINÉE · l'autorisation n'y change rien. L'art. 26 n'est
   * ouvert qu'aux travaux et aux services, et un compte qui ne dit pas la
   * nature de l'opération ne dit pas davantage qu'elle en est une. Le repli
   * DÉCLARÉ du dossier continue d'y servir.
   */
  private baseExigibilite(
    referentiel: Referentiel | undefined,
    regime: string,
    numeroCompte: string,
    estCollecte: boolean,
    fournisseurAuxDebits: boolean,
    contreparties: readonly string[] = [],
  ): { base: 'FAIT_GENERATEUR' | 'ENCAISSEMENT'; nature: NatureOperationTva } {
    const nature = this.natureOperation(referentiel, numeroCompte, estCollecte, contreparties);
    if (nature === 'BIENS') return { base: 'FAIT_GENERATEUR', nature };
    if (nature === 'SERVICES') {
      // COLLECTE · l'art. 26 vise la taxe que le redevable ACQUITTE, donc
      // l'autorisation DU DOSSIER · jamais celle d'un de ses tiers.
      if (estCollecte) return { base: regime === 'DEBITS' ? 'FAIT_GENERATEUR' : 'ENCAISSEMENT', nature };
      // DÉDUCTION · la date se juge chez le fournisseur (art. 37 al. 1, décret
      // art. 96) ; autorisé aux débits, sa taxe est exigible à la facture
      // (décret art. 61). FAUX couvre aussi « non renseigné » · droit commun.
      return { base: fournisseurAuxDebits ? 'FAIT_GENERATEUR' : 'ENCAISSEMENT', nature };
    }
    // Nature indéterminée · le paramètre du dossier sert de repli DÉCLARÉ.
    return { base: regime === 'ENCAISSEMENTS' ? 'ENCAISSEMENT' : 'FAIT_GENERATEUR', nature };
  }

  /**
   * CRÉDIT DE TVA REPORTÉ SUR LA PÉRIODE · article 63.
   *
   * Fichier `code-general-2026/references/10-tva-ol10-001-loi-base-ch1-10.md`,
   * art. 63, l. 1499-1504 : « Lorsque le montant de la taxe sur la valeur
   * ajoutée déductible au titre d'un mois est supérieur à celui de la taxe
   * exigible, l'excédent constitue un crédit d'impôt IMPUTABLE SUR LA TAXE
   * EXIGIBLE DU OU DES MOIS SUIVANTS JUSQU'À L'ÉPUISEMENT. Le crédit d'impôt
   * ne peut pas faire l'objet d'un remboursement au profit de l'assujetti et
   * ne peut être cédé. » Article non modifié par la L.F. n° 25/060, qui ne
   * touche en TVA que les art. 10, 35, 42 point 4, 60, 62 et 74.
   *
   * Le report est donc LE RÉGIME DE DROIT COMMUN du crédit, et le second
   * alinéa ferme le remboursement · l'imputation n'est pas une facilité, c'est
   * la seule issue ordinaire. Le crédit était correctement CONSTATÉ (compte
   * 44490000 en SYSCOHADA, 44410000 en SYCEBNL qui ne subdivise pas) et jamais
   * IMPUTÉ : la déclaration suivante annonçait « À PAYER » le net de sa seule
   * période, et le dossier versait le crédit en trop.
   *
   * SOURCE DU CHIFFRE · la dernière liquidation comptabilisée avant la
   * période, dont le champ `net` porte, depuis cette correction, le net APRÈS
   * imputation. Le crédit se chaîne donc de liquidation en liquidation, et le
   * solde du compte 4449 suit, puisque l'écriture de liquidation le crédite à
   * hauteur de ce qu'elle impute.
   *
   * CE QUI N'EST PAS COUVERT, ET DIT : une période déclarée mais jamais
   * comptabilisée ne laisse aucune trace · son crédit n'est pas reporté, faute
   * d'une déclaration déposée que le logiciel puisse constater.
   */
  private creditReportable(precedente: {
    id: string;
    dateDebut: Date;
    dateFin: Date;
    ecritureId: string;
    net: unknown;
  } | null) {
    if (!precedente) return { montant: 0, origine: null };
    const net = Number(precedente.net);
    if (net >= -EPSILON) return { montant: 0, origine: null };
    return {
      montant: TauxTvaService.c(-net),
      origine: {
        id: precedente.id,
        dateDebut: precedente.dateDebut.toISOString().slice(0, 10),
        dateFin: precedente.dateFin.toISOString().slice(0, 10),
        ecritureId: precedente.ecritureId,
      },
    };
  }

  /**
   * PART DE LA TVA D'AMONT QUE L'ARTICLE 41 EXCLUT, lue sur les charges de
   * l'écriture · voir `EXCLUSIONS_ART_41`.
   *
   * La ligne de TVA porte un montant, jamais la nature de la dépense : c'est
   * la CONTREPARTIE de classe 6 de la même écriture qui la dit. Quand une
   * facture mêle une dépense exclue et une dépense ordinaire, la taxe est
   * répartie AU PRORATA DES CHARGES de l'écriture · c'est la seule ventilation
   * que la pièce elle-même autorise, et elle se réduit au tout-ou-rien sur une
   * saisie guidée, qui ne pose qu'une charge et sa taxe.
   *
   * `lisible` est faux quand l'écriture ne porte aucune charge de classe 6 (une
   * TVA sur immobilisation, par exemple) : rien n'est alors exclu, et la
   * déclaration le NOMME plutôt que de laisser croire au contrôle.
   */
  private partExclueArt41(
    lignesCharge: Array<{ debit: unknown; credit: unknown; compte: { numero: string } }>,
  ): { exclue: number; aVerifier: number; lisible: boolean } {
    const rien = { exclue: 0, aVerifier: 0, lisible: false };
    // LES DEUX RÉFÉRENTIELS. Cette méthode se fermait au SYCEBNL sur une
    // affirmation fausse (voir l'en-tête d'`EXCLUSIONS_ART_41`) : les quatre
    // comptes que la table reconnaît sont semés aux deux plans, sous les mêmes
    // intitulés. Le `referentiel` n'est plus un paramètre de cette méthode ·
    // c'est le NUMÉRO SEMÉ qui décide, et un plan qui n'ouvre pas le compte ne
    // déclenche rien.
    let total = 0;
    let exclue = 0;
    let aVerifier = 0;
    for (const c of lignesCharge) {
      const montant = Number(c.debit) - Number(c.credit);
      if (montant <= EPSILON) continue;
      total += montant;
      if (EXCLUSIONS_ART_41.some(([racine]) => c.compte.numero.startsWith(racine))) exclue += montant;
      else if (EXCLUSIONS_ART_41_A_VERIFIER.some(([racine]) => c.compte.numero.startsWith(racine)))
        aVerifier += montant;
    }
    if (total <= EPSILON) return rien;
    return { exclue: exclue / total, aVerifier: aVerifier / total, lisible: true };
  }

  /**
   * Registre/déclaration TVA sur une période : pour chaque taux, somme les
   * lignes créditées sur la famille 443 et les lignes débitées sur la famille
   * 445, taguées à ce taux (LigneEcriture.tauxTvaId · posé par la saisie
   * guidée "Achat/Vente avec TVA"). Chaque ligne est datée SELON LA NATURE DE
   * SON OPÉRATION (voir `baseExigibilite`), écarte ce que l'article 41 exclut,
   * applique le prorata de déduction (art. 43) à la TVA déductible brute,
   * impute la récupération sur ventes annulées (art. 52) puis le crédit de TVA
   * reporté (art. 63). Reste lecture seule ici · voir `comptabiliserLiquidation`
   * pour poser l'écriture sur le compte 444.
   *
   * UN SEUL CHEMIN DE LECTURE, ligne à ligne. Il y en avait deux : une
   * agrégation en base pour les régimes datés à l'écriture, un parcours pour
   * le régime de l'encaissement. Deux chemins ne peuvent plus servir dès lors
   * que la MÊME déclaration porte des lignes datées différemment · c'est
   * précisément ce que l'art. 25 impose à un dossier mixte. La fenêtre de
   * lecture remonte donc toujours avant la période (une facture de l'an
   * dernier encaissée ce mois-ci est exigible ce mois-ci) : c'est le coût,
   * assumé, de dater juste, et c'est déjà celui que payaient les dossiers aux
   * encaissements.
   *
   * CHAQUE FAMILLE SE LIT DANS LES DEUX SENS · article 52.
   *
   * « La taxe sur la valeur ajoutée acquittée à l'occasion des ventes ou des
   * services qui sont par la suite résiliés, annulés ou restent impayés peut
   * être récupérée par voie d'imputation sur l'impôt dû pour les opérations
   * faites ultérieurement » (art. 52, l. 1234-1236). La déclaration ne lisait
   * que le CRÉDIT du 443 et que le DÉBIT du 445 : un avoir sur vente, qui
   * débite le 443, ne venait jamais en diminution ; un avoir fournisseur, qui
   * crédite le 445, laissait la déduction d'origine intacte. Le premier fait
   * verser la taxe d'une vente qui n'existe plus, le second est une déduction
   * indue, sanctionnable.
   *
   * ET LES DEUX SENS NE SE TRAITENT PAS DE LA MÊME MANIÈRE, parce que le texte
   * ne le dit pas ainsi.
   *
   *  · AVOIR SUR VENTE (débit d'un 443). Le décret n° 011/42, art. 126
   *    (fichier `code-general-2026/references/12-tva-decret-application-ch5-8.md`,
   *    l. 700-705) : la taxe « peut être récupérée par voie d'imputation sur la
   *    taxe due pour les opérations faites ultérieurement. Dans ce cas, elle
   *    est inscrite dans les déductions afférentes à la déclaration DU OU DES
   *    MOIS SUIVANTS celui de la constatation de la résiliation, de
   *    l'annulation ou de non-paiement, dans les conditions prévues pour
   *    exercer le droit à déduction. » Elle ne vient donc PAS en diminution de
   *    la collecte du mois où l'avoir est constaté : elle est reportée, et
   *    inscrite en DÉDUCTION de la déclaration suivante. La minorer sur place
   *    anticiperait d'un mois. Elle n'est pas non plus soumise au prorata de
   *    l'art. 43, qui limite la déduction de la taxe ayant grevé les ACHATS ·
   *    ici c'est la propre taxe du redevable qui lui revient.
   *
   *  · AVOIR FOURNISSEUR (crédit d'un 445). Ce n'est pas l'art. 52, c'est la
   *    reprise d'une déduction : décret art. 127, l. 724-725, « à la réception
   *    du duplicata de la facture, le client est tenu de reverser la taxe
   *    déduite ». La reprise se fait à la CONSTATATION, c'est-à-dire dans la
   *    période où l'avoir est enregistré · ni plus tôt, ni plus tard. La TVA
   *    déductible se lit donc en SOLDE, comme `tvaDeductibleBrute` le fait
   *    déjà pour la régularisation du prorata définitif.
   *
   * D'OÙ VIENT LA FENÊTRE DE REPORT, ET CE QUI N'EST PAS REPORTÉ. « Le mois
   * suivant celui de la constatation » suppose de savoir quel mois a déjà été
   * déclaré : la seule trace qu'en garde le logiciel est la LIQUIDATION
   * comptabilisée, exactement comme pour le crédit de l'art. 63. La fenêtre va
   * donc du début de la dernière période liquidée jusqu'au début de celle-ci ·
   * ce qui couvre aussi les mois laissés entre les deux, jamais imputés. Sans
   * aucune liquidation antérieure, le logiciel ne sait pas ce qui a déjà été
   * déclaré : il n'impute RIEN et rend le montant à part
   * (`avoirsCollecteNonImputes`), pour que le comptable en dispose au lieu de
   * subir une déduction inventée.
   */
  async declaration(tenantId: string, dateDebut: Date, dateFin: Date) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    const regime = tenant?.regimeExigibiliteTva ?? 'LIVRAISONS';
    // L'AUTORISATION DU DOSSIER A UNE DATE, ET ELLE BORNE SA COLLECTE
    // (2026-09-28, décision de Manasse). O.-L. n° 10/001, art. 26 : le régime
    // des débits naît d'une décision du Directeur Général des Impôts (décret
    // n° 011/42, art. 58, ou son silence de dix jours, art. 59). Une opération
    // antérieure à cette décision reste au droit commun (art. 25, 2° ·
    // l'encaissement), faute de quoi la déclaration anticiperait la taxe
    // d'opérations que l'autorisation ne couvrait pas encore. Sans date
    // saisie, le régime reste appliqué, et la déclaration le dit non daté ·
    // en retirer d'office changerait des périodes déjà déclarées sans donnée
    // nouvelle (même parti que la fiche du fournisseur).
    const dateAutorisationDossier = tenant?.dateAutorisationDebitsTva ?? null;
    const regimeALaDate = (date: Date): string =>
      regime === 'DEBITS' && dateAutorisationDossier && date < dateAutorisationDossier ? 'LIVRAISONS' : regime;
    const referentiel = tenant?.referentiel;
    const taux = await this.prisma.tauxTva.findMany({ where: { tenantId }, orderBy: { taux: 'desc' } });
    const dejaLiquidee = await this.liquidationChevauchante(tenantId, dateDebut, dateFin);
    // Une seule lecture pour deux usages · le crédit reportable de l'art. 63
    // et la fenêtre de report des avoirs de l'art. 52 partent tous deux de la
    // dernière liquidation comptabilisée avant la période.
    const derniereLiquidation = await this.prisma.liquidationTva.findFirst({
      where: { tenantId, dateFin: { lt: dateDebut } },
      orderBy: { dateFin: 'desc' },
      include: { ecriture: { select: { id: true, libelle: true } } },
    });

    /*
      LUES PAR TRANCHES (audit final F188) · la fenêtre remonte sans borne
      inférieure, et la requête rapatriait D'UN COUP toute la TVA validée du
      dossier depuis sa création, chaque ligne avec son écriture, ses
      contreparties et le groupe de lettrage de chacune. La mémoire d'une
      déclaration grandissait avec l'ANCIENNETÉ du dossier, et non avec le
      volume de la période déclarée.

      LA FENÊTRE NE SE RACCOURCIT PAS SANS CHANGER LE RÉSULTAT, et c'est pour
      cela qu'elle est lue par tranches plutôt que bornée. Trois lectures y
      remontent toute l'histoire, chacune par son texte : la TVA d'amont dont
      le délai est expiré (art. 37 al. 2) se compte sur TOUTE exigibilité
      antérieure au 1er janvier Y-1 ; une ligne datée à l'encaissement
      (art. 25, 2°) entre dans la période où tombe son règlement, quel que
      soit l'âge de sa facture ; et, sans liquidation antérieure, les avoirs
      sur ventes non imputés (art. 52) se comptent depuis l'origine. Écarter
      les lignes « dont l'exigibilité est acquise avant la période » ferait
      donc taire la déchéance, qui porte précisément sur elles.

      Le parcours reste celui d'avant, ligne à ligne, sur le même périmètre et
      dans le même traitement ; seul son pas change. Et seules les colonnes
      lues sont demandées (`select`), jamais les lignes ni les écritures
      entières.
    */
    const lire = (curseur: string | undefined) =>
      this.prisma.ligneEcriture.findMany({
        ...pageApres(curseur, LOT_ECRITURES),
        where: {
          tauxTvaId: { in: taux.map((t) => t.id) },
          compte: {
            OR: [{ numero: { startsWith: RACINE_COLLECTEE } }, { numero: { startsWith: RACINE_RECUPERABLE } }],
          },
          // LE LIVRE-JOURNAL SEUL (audit final F25) · une déclaration est
          // un acte devant l'Administration, comme le résultat fiscal et
          // le registre des retenues, qui ne lisent pas le brouillard.
          //
          // UNE FACTURE POSTÉRIEURE À LA PÉRIODE EST LUE AUSSI QUAND UN
          // RÈGLEMENT LETTRÉ AVEC ELLE TOMBE DANS LA PÉRIODE OU AVANT · c'est
          // l'acompte antérieur au débit (décret n° 011/42, art. 62 ; O.-L.
          // n° 10/001, art. 26 al. 3), et plus largement l'acompte de l'art.
          // 25, 2° (« au moment de l'encaissement du prix, des acomptes ou
          // avances »). Sans cette branche, la taxe d'une facture d'avril
          // réglée d'avance en mars n'entrait dans aucune déclaration : celle
          // de mars ne lisait pas la facture, celle d'avril la datait de mars
          // et l'écartait comme antérieure à sa période.
          ecriture: {
            tenantId,
            statut: StatutEcriture.VALIDEE,
            OR: [
              { date: { lte: dateFin } },
              { lignes: { some: { lettrage: { lignes: { some: { ecriture: { date: { lte: dateFin } } } } } } } },
            ],
          },
        },
        select: {
          id: true,
          tauxTvaId: true,
          compteId: true,
          debit: true,
          credit: true,
          compte: { select: { numero: true } },
          ecriture: {
            select: {
              date: true,
              // LA PIÈCE RATTACHÉE À L'ÉCRITURE, lue pour deux questions.
              // Sa NATURE justifie un avoir sur vente (décret n° 011/42,
              // art. 127) · une note de crédit est la pièce que le texte
              // exige. Son SENS et sa MENTION DES DÉBITS prouvent, sur un
              // achat, l'autorisation du fournisseur (décret art. 60, audit
              // final F228).
              facture: { select: { nature: true, sens: true, mentionTvaDebits: true } },
              // DEUX contreparties sont lues sur la même écriture, et pour
              // trois questions différentes : la ligne de TIERS lettrée dit
              // QUAND la taxe est exigible (art. 25, 2°), le TIERS auquel son
              // compte est rattaché dit si le fournisseur acquitte d'après
              // les DÉBITS (art. 26), la ligne de CHARGE dit si l'article 41
              // en interdit la déduction.
              //
              // Le tiers se lit sur la contrepartie LETTRÉE OU NON · une
              // facture qu'aucun règlement n'a encore touchée n'a pas de
              // lettrage à opposer, et son fournisseur reste le même.
              lignes: {
                where: {
                  OR: [
                    { compte: { classe: ClasseCompte.CLASSE_4 }, lettrageId: { not: null } },
                    { compte: { classe: ClasseCompte.CLASSE_4, tiersCompte: { isNot: null } } },
                    { compte: { classe: ClasseCompte.CLASSE_6 } },
                    // CONTREPARTIES DE PRODUIT ET D'IMMOBILISATION · elles ne
                    // servent qu'à une seule question, mais elle est lourde :
                    // la NATURE FISCALE de l'opération (art. 6 et 8). Sans
                    // la classe 7, une vente n'a aucune contrepartie lisible
                    // et sa nature retombait sur le numéro du compte de TVA,
                    // qui ne la porte pas (voir NATURE_CONTREPARTIE_CHARGES).
                    { compte: { classe: ClasseCompte.CLASSE_7 } },
                    { compte: { classe: ClasseCompte.CLASSE_2 } },
                  ],
                },
                select: {
                  debit: true,
                  credit: true,
                  compte: {
                    select: {
                      numero: true,
                      classe: true,
                      // SEUL CHEMIN d'une ligne de TVA vers son fournisseur ·
                      // le compte auxiliaire de la contrepartie est rattaché
                      // à un tiers, et n'en porte qu'un seul
                      // (`TiersCompte.compteId` est unique). Rien d'autre dans
                      // l'écriture ne nomme le fournisseur.
                      tiersCompte: {
                        select: {
                          // La PÉRIODE de l'autorisation et le NOM du
                          // fournisseur sont lus avec le drapeau · sans les
                          // dates, une facture antérieure à la décision ou
                          // postérieure à la révocation serait anticipée ; sans
                          // le nom, la déclaration ne dirait pas qui reprendre.
                          tiers: {
                            select: {
                              code: true,
                              nom: true,
                              autoriseTvaDebits: true,
                              referenceAutorisationDebits: true,
                              dateEffetAutorisationDebits: true,
                              dateRevocationAutorisationDebits: true,
                            },
                          },
                        },
                      },
                    },
                  },
                  // Les lignes du GROUPE de lettrage, avec la date de leur
                  // écriture · c'est le règlement, pas le lettrage, qui
                  // date l'encaissement (décret art. 57).
                  lettrage: {
                    select: {
                      statut: true,
                      solde: true,
                      soldeAt: true,
                      lignes: {
                        select: { debit: true, credit: true, ecriture: { select: { date: true } } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

    // CE QUI RESTE AU BROUILLARD N'EST PAS DÉCLARÉ, ET LA DÉCLARATION LE DIT
    // (audit final F25) · un oubli de validation minorerait la taxe sans que
    // rien à l'écran ne le montre.
    const tvaAuBrouillard = await this.tvaAuBrouillard(tenantId, taux.map((t) => t.id), dateDebut, dateFin);

    type Cumul = {
      collecte: number;
      deductible: number;
      attente: number;
      /** Avoirs sur ventes CONSTATÉS dans la période · reportés (art. 52). */
      avoir: number;
      /** Avoirs constatés avant la période et imputés ici (décret art. 126). */
      recuperation: number;
    };
    const parTaux = new Map<string, Cumul>();
    for (const t of taux) parTaux.set(t.id, { collecte: 0, deductible: 0, attente: 0, avoir: 0, recuperation: 0 });
    // LE MÊME CUMUL, COMPTE PAR COMPTE. La saisie et la facture passée au
    // journal ROUTENT la taxe sur la subdivision que la contrepartie appelle
    // (4432 pour une prestation vendue, 4453 pour un transport déduit), quand
    // le taux ne porte qu'un compte. La liquidation soldait le compte du TAUX ·
    // le 4431 finissait débiteur et le 4432 créditeur, du même montant, sur une
    // écriture équilibrée. Elle solde désormais chaque compte réellement
    // mouvementé, et une ligne portée par un taux sans compte n'est plus
    // perdue pour elle.
    type ParCompte = { collecte: number; deductible: number; recuperation: number };
    const parTauxCompte = new Map<string, Map<string, ParCompte>>();
    const suivi = (tauxId: string, compteId: string): ParCompte => {
      let m = parTauxCompte.get(tauxId);
      if (!m) parTauxCompte.set(tauxId, (m = new Map()));
      let v = m.get(compteId);
      if (!v) m.set(compteId, (v = { collecte: 0, deductible: 0, recuperation: 0 }));
      return v;
    };
    // Ce qui a été daté sur quelle base · sert à composer une mention qui dit
    // au lecteur d'où sort son chiffre, et à annoncer le repli quand il joue.
    let montantIndetermine = 0;
    let deductionServicesDiffere = 0;
    let deductionServicesDebits = 0;
    let deductionServicesDebitsSansReference = 0;
    // CE QUE LA FACTURE D'ACHAT ENREGISTRÉE DIT DE L'ART. 60 (audit final
    // F228) · part anticipée dont la pièce porte la mention, et part différée
    // dont la pièce la porte alors que la fiche du fournisseur ne le dit pas.
    let deductionServicesDebitsMentionLue = 0;
    let deductionServicesDiffereMentionLue = 0;
    // TVA COLLECTÉE datée à la facture SOUS LE RÉGIME DES DÉBITS · l'art. 26,
    // alinéa 3, réserve l'encaissement antérieur, et OmegaX ne peut pas le
    // voir : un acompte encaissé avant la facture est une avance reçue (419),
    // sans ligne de taxe et sans rattachement à la facture qui suivra.
    let collecteServicesDebits = 0;
    // LA PÉRIODE DE L'AUTORISATION DU FOURNISSEUR ET LA PREUVE DE L'ART. 60 ·
    // chaque compteur a sa liste de fournisseurs NOMMÉS, parce que la reprise
    // se fait fiche par fiche et facture par facture, jamais sur un total.
    let deductionServicesHorsPeriode = 0;
    let deductionServicesHorsPeriodeMentionLue = 0;
    let deductionServicesDebitsNonDatee = 0;
    let deductionServicesDebitsFactureSansMention = 0;
    const fournisseursHorsPeriode = new Set<string>();
    const fournisseursMentionSansFiche = new Set<string>();
    const fournisseursNonDates = new Set<string>();
    const fournisseursFactureSansMention = new Set<string>();
    // ART. 62 DU DÉCRET · part de la taxe datée d'un règlement ANTÉRIEUR au
    // débit, sur un fournisseur autorisé (déduction) ou sous le régime des
    // débits du dossier (collecte).
    let deductionServicesPaiementAnterieur = 0;
    let collecteServicesPaiementAnterieur = 0;
    // Collecte sur services d'un dossier aux débits, datée AVANT son
    // autorisation · remise au droit commun.
    let collecteServicesAvantAutorisation = 0;
    let tvaExclueArt41 = 0;
    let tvaAVerifierArt41 = 0;
    let tvaNatureDepenseIllisible = 0;
    let tvaDeductibleDechue = 0;
    let avoirsCollecteNonImputes = 0;
    // Avoirs sur ventes, constatés ou imputés sur cette déclaration, dont
    // l'écriture ne porte aucune note de crédit (O.-L. art. 52 al. 2).
    let avoirsSansNoteDeCredit = 0;

    /*
      DÉCHÉANCE DU DROIT À DÉDUCTION · article 37, alinéa 2.

      Fichier `code-general-2026/references/10-tva-ol10-001-loi-base-ch1-10.md`,
      l. 989-991 : « Le droit à déduction est exercé jusqu'au 31 décembre de
      l'année qui suit celle au cours de laquelle la taxe est devenue exigible.
      A l'expiration de ce délai, la taxe sur la valeur ajoutée non déduite est
      acquise définitivement au Trésor public. » Repris à l'identique par le
      décret n° 011/42, art. 96.

      La taxe devenue exigible en N se déduit jusqu'au 31 décembre N+1. Pour
      une déclaration close en Y, tout ce dont l'exigibilité est antérieure au
      1er janvier Y-1 est donc DÉCHU : exigible en Y-2 au plus tard, son délai
      a expiré le 31 décembre Y-1.

      Le logiciel ne PEUT PAS le corriger, et ne le fera pas : ces lignes sont
      déjà hors de la déclaration (leur date d'exigibilité est antérieure à la
      période), et lui seul ne sait pas si elles ont été déduites en leur
      temps. Il les COMPTE et les NOMME · une TVA d'amont qui n'entre dans
      aucune déclaration et dont le délai est expiré est perdue pour de bon, et
      c'est au comptable de rectifier tant qu'il en est temps.
    */
    const limiteDecheance = new Date(Date.UTC(dateFin.getUTCFullYear() - 1, 0, 1));
    // Fenêtre de report des avoirs sur ventes · voir l'en-tête de la méthode.
    const debutReportAvoirs = derniereLiquidation?.dateDebut ?? null;

    // CHAQUE LIGNE TRAITÉE À SON ARRIVÉE, puis oubliée (audit final F188) ·
    // seuls les cumuls survivent à la tranche qui les a nourris.
    if (taux.length > 0) {
      await lireParLots(
        lire,
        (l) => {
          const cumul = l.tauxTvaId ? parTaux.get(l.tauxTvaId) : undefined;
          if (!cumul) return;
          const estCollecte = l.compte.numero.startsWith(RACINE_COLLECTEE);
          const dateEcriture = l.ecriture.date as Date;
          const regimeLigne = estCollecte ? regimeALaDate(dateEcriture) : regime;
          const dansLaPeriode = dateEcriture >= dateDebut && dateEcriture <= dateFin;

          /*
            L'AVOIR EST LA LIGNE DE SENS INVERSE À SA FAMILLE · un 443 débité, un
            445 crédité. Il se date à la CONSTATATION (décret art. 126), donc à
            l'écriture, jamais à un encaissement qui n'aura pas lieu.

            Aucune confusion possible avec l'écriture de liquidation, qui débite
            elle aussi le 443 : ses lignes sont posées sans `tauxTvaId` (voir
            `comptabiliserLiquidation`) et la requête ci-dessus filtre dessus.
          */
          const avoir = estCollecte ? Number(l.debit) : Number(l.credit);
          if (avoir > EPSILON) {
            if (!estCollecte) {
              // Reprise de la déduction, à la constatation (décret art. 127).
              if (dansLaPeriode) {
                cumul.deductible = TauxTvaService.c(cumul.deductible - avoir);
                const v = suivi(l.tauxTvaId!, l.compteId);
                v.deductible = TauxTvaService.c(v.deductible - avoir);
              }
              return;
            }
            /*
              LA RÉCUPÉRATION EST SUBORDONNÉE À UNE PIÈCE. O.-L. n° 10/001, art. 52
              al. 2 : « la récupération de la taxe acquittée est subordonnée à
              l'établissement et à l'envoi au client d'une facture nouvelle ou note
              de crédit annulant et remplaçant la facture initiale ». Depuis I3, le
              module facturation émet cette note et la rattache à l'écriture.

              LE MONTANT N'EST PAS RETIRÉ, IL EST SIGNALÉ. La facturation d'OmegaX
              est facultative : un dossier peut émettre ses notes ailleurs, sur un
              carnet ou un autre logiciel, et les retirer d'office refuserait à tous
              ceux-là une récupération à laquelle ils ont droit. Le logiciel dit
              donc ce qu'il ne voit pas, au lieu de le trancher.
            */
            const justifie = l.ecriture.facture?.nature === NatureFacture.NOTE_DE_CREDIT;
            const compteIci =
              dansLaPeriode || (dateEcriture < dateDebut && !!debutReportAvoirs && dateEcriture >= debutReportAvoirs);
            if (compteIci && !justifie) avoirsSansNoteDeCredit = TauxTvaService.c(avoirsSansNoteDeCredit + avoir);
            if (dansLaPeriode) cumul.avoir = TauxTvaService.c(cumul.avoir + avoir);
            else if (dateEcriture < dateDebut) {
              if (!debutReportAvoirs) {
                // Aucune liquidation antérieure · rien ne dit ce qui a déjà été
                // déclaré, on n'impute pas et on rend le montant.
                avoirsCollecteNonImputes = TauxTvaService.c(avoirsCollecteNonImputes + avoir);
              } else if (dateEcriture >= debutReportAvoirs) {
                cumul.recuperation = TauxTvaService.c(cumul.recuperation + avoir);
                const v = suivi(l.tauxTvaId!, l.compteId);
                v.recuperation = TauxTvaService.c(v.recuperation + avoir);
              }
              // Plus ancien que la dernière période liquidée : la déclaration qui a
              // suivi sa constatation l'a déjà imputé, par cette même règle. Le
              // signaler ici serait une fausse alerte, et l'imputer une seconde
              // fois une déduction en double.
            }
            return;
          }

          const montant = estCollecte ? Number(l.credit) : Number(l.debit);
          if (montant <= EPSILON) return;

          const lignesTiers = l.ecriture.lignes.filter((x) => x.compte?.classe === ClasseCompte.CLASSE_4 && x.lettrage);
          const lignesCharge = l.ecriture.lignes.filter((x) => x.compte?.classe === ClasseCompte.CLASSE_6);

          // L'autorisation de l'art. 26 ne se lit QUE du côté de la déduction · sur
          // une vente, le tiers de la contrepartie est le CLIENT, et son régime à
          // lui ne date pas la taxe du vendeur.
          const fournisseur = estCollecte
            ? { autorise: false, reference: null, nonDatee: [] as string[], horsPeriode: [] as string[], noms: [] as string[] }
            : TauxTvaService.fournisseurAuxDebits(
                l.ecriture.lignes.filter((x) => x.compte?.classe === ClasseCompte.CLASSE_4),
                dateEcriture,
              );

          // Contreparties qui portent la NATURE de l'opération · classe 7 sur une
          // vente, classes 6 et 2 sur un achat. Jamais les classes 4 et 5, qui
          // disent avec qui et par quel moyen, jamais quoi.
          const contreparties = l.ecriture.lignes
            .filter((x) =>
              estCollecte
                ? x.compte?.classe === ClasseCompte.CLASSE_7
                : x.compte?.classe === ClasseCompte.CLASSE_6 || x.compte?.classe === ClasseCompte.CLASSE_2,
            )
            .map((x) => x.compte?.numero)
            .filter((n): n is string => Boolean(n));

          const { base, nature } = this.baseExigibilite(
            referentiel,
            regimeLigne,
            l.compte.numero,
            estCollecte,
            fournisseur.autorise,
            contreparties,
          );
          if (nature === 'INDETERMINEE' && dansLaPeriode) montantIndetermine += montant;
          if (estCollecte && nature === 'SERVICES' && regimeLigne === 'DEBITS' && dansLaPeriode) {
            collecteServicesDebits += montant;
          }
          if (estCollecte && nature === 'SERVICES' && regime === 'DEBITS' && regimeLigne !== 'DEBITS' && dansLaPeriode) {
            collecteServicesAvantAutorisation += montant;
          }
          if (!estCollecte && nature === 'SERVICES' && dansLaPeriode) {
            // DEUX compteurs, et non un seul : ce qui est différé FAUTE DE SAVOIR
            // n'est pas ce qui est déduit d'avance PARCE QU'ON SAIT. Les confondre
            // ferait dire à la déclaration qu'elle a différé ce qu'elle a anticipé,
            // et l'avertissement qui suit perdrait son objet.
            // La mention LUE ne date rien · elle prouve (anticipé) ou elle
            // signale ce que la fiche ne dit pas encore (différé).
            const mentionLue = TauxTvaService.mentionDebitsLueSurLaFacture(l.ecriture.facture);
            if (base === 'ENCAISSEMENT' && fournisseur.horsPeriode.length > 0) {
              // FICHE AUTORISÉE, OPÉRATION HORS DE SA PÉRIODE · droit commun,
              // et un compteur à part : le message du droit commun dit
              // qu'« aucune autorisation n'est renseignée », ce qui serait
              // faux ici.
              deductionServicesHorsPeriode += montant;
              for (const n of fournisseur.horsPeriode) fournisseursHorsPeriode.add(n);
              if (mentionLue) deductionServicesHorsPeriodeMentionLue += montant;
            } else if (base === 'ENCAISSEMENT') {
              deductionServicesDiffere += montant;
              if (mentionLue) {
                deductionServicesDiffereMentionLue += montant;
                for (const n of fournisseur.noms) fournisseursMentionSansFiche.add(n);
              }
            } else {
              deductionServicesDebits += montant;
              if (!fournisseur.reference) deductionServicesDebitsSansReference += montant;
              if (mentionLue) deductionServicesDebitsMentionLue += montant;
              if (fournisseur.nonDatee.length > 0) {
                deductionServicesDebitsNonDatee += montant;
                for (const n of fournisseur.nonDatee) fournisseursNonDates.add(n);
              }
              // FICHE AUTORISÉE, FACTURE D'ACHAT ENREGISTRÉE SANS LA MENTION ·
              // l'anticipation est GARDÉE (la fiche date, la pièce prouve),
              // mais la preuve que le décret n° 011/42, art. 60, rend
              // obligatoire (« doit figurer sur toutes les factures ») manque
              // sur une pièce que le dossier détient. Distinct de l'absence
              // de pièce enregistrée, où OmegaX n'a rien à lire.
              const facture = l.ecriture.facture;
              if (facture?.sens === SensFacture.ACHAT && facture.mentionTvaDebits !== true) {
                deductionServicesDebitsFactureSansMention += montant;
                for (const n of fournisseur.noms) fournisseursFactureSansMention.add(n);
              }
            }
          }

          /*
            ARTICLE 62 DU DÉCRET · l'autorisation « ne dispense pas le redevable
            de s'acquitter de la taxe au moment de l'encaissement du prix ou de
            l'acompte si celui-ci est antérieur au débit ». Quand la taxe est
            datée aux débits (fournisseur autorisé dans sa période, ou dossier
            sous le régime des débits), un règlement LETTRÉ à la facture et daté
            avant elle avance l'exigibilité de sa part · chez le fournisseur,
            donc la déduction du client (art. 37 al. 1, décret art. 96), et
            pour la collecte du dossier (art. 26 al. 3). Voir
            `tranchesAuxDebits`.
          */
          const auxDebits =
            base === 'FAIT_GENERATEUR' &&
            nature === 'SERVICES' &&
            (estCollecte ? regimeLigne === 'DEBITS' : fournisseur.autorise);
          const tranches: Array<{ date: Date | null; fraction: number; auPaiement?: boolean }> =
            base === 'FAIT_GENERATEUR'
              ? auxDebits
                ? TauxTvaService.tranchesAuxDebits(lignesTiers, dateEcriture)
                : [{ date: dateEcriture, fraction: 1 }]
              : [this.exigibilite(l, lignesTiers, l.ecriture.date)];

          // Part facturée sur la période et pas encore exigible · c'est le chiffre
          // qui explique l'écart entre le chiffre d'affaires et la déclaration, et
          // sans lequel le régime paraît perdre de la TVA.
          if (estCollecte && base === 'ENCAISSEMENT' && dansLaPeriode) {
            cumul.attente = TauxTvaService.c(cumul.attente + montant * (1 - tranches[0].fraction));
          }
          // Une tranche unique garde l'arrondi d'avant ; plusieurs tranches se
          // répartissent au centime, la dernière recevant le reste, pour que la
          // somme des parts rende la taxe de la ligne exactement.
          const montants = TauxTvaService.montantsDesTranches(montant, tranches);
          tranches.forEach(({ date, auPaiement }, i) => {
            const exigible = montants[i];
            if (!estCollecte && date && date < limiteDecheance) {
              tvaDeductibleDechue = TauxTvaService.c(tvaDeductibleDechue + exigible);
            }
            if (!date || date < dateDebut || date > dateFin) return;
            if (auPaiement) {
              if (estCollecte) collecteServicesPaiementAnterieur = TauxTvaService.c(collecteServicesPaiementAnterieur + exigible);
              else deductionServicesPaiementAnterieur = TauxTvaService.c(deductionServicesPaiementAnterieur + exigible);
            }
            if (estCollecte) {
              cumul.collecte = TauxTvaService.c(cumul.collecte + exigible);
              const v = suivi(l.tauxTvaId!, l.compteId);
              v.collecte = TauxTvaService.c(v.collecte + exigible);
              return;
            }
            // ARTICLE 41 · ce que la loi retire du droit à déduction, avant tout
            // prorata. Le prorata LIMITE une déduction ; l'article 41 la SUPPRIME.
            const part = this.partExclueArt41(lignesCharge);
            const exclu = TauxTvaService.c(exigible * part.exclue);
            if (exclu > EPSILON) tvaExclueArt41 = TauxTvaService.c(tvaExclueArt41 + exclu);
            if (part.aVerifier > 0) {
              tvaAVerifierArt41 = TauxTvaService.c(tvaAVerifierArt41 + exigible * part.aVerifier);
            }
            if (!part.lisible) tvaNatureDepenseIllisible = TauxTvaService.c(tvaNatureDepenseIllisible + exigible);
            cumul.deductible = TauxTvaService.c(cumul.deductible + exigible - exclu);
            const v = suivi(l.tauxTvaId!, l.compteId);
            v.deductible = TauxTvaService.c(v.deductible + exigible - exclu);
          });
        },
        LOT_ECRITURES,
      );
    }

    const lignes = [];
    let enAttente = 0;
    for (const t of taux) {
      const cumul = parTaux.get(t.id)!;
      enAttente = TauxTvaService.c(enAttente + cumul.attente);
      if (
        cumul.collecte === 0 &&
        cumul.deductible === 0 &&
        cumul.attente === 0 &&
        cumul.avoir === 0 &&
        cumul.recuperation === 0
      ) {
        continue; // taux sans mouvement
      }
      lignes.push({
        tauxId: t.id,
        code: t.code,
        intitule: t.intitule,
        taux: Number(t.taux),
        compteCollecteId: t.compteCollecteId,
        compteDeductibleId: t.compteDeductibleId,
        totalCollecte: cumul.collecte,
        totalDeductible: cumul.deductible,
        enAttente: cumul.attente,
        /** Avoirs sur ventes constatés ici · imputables à la période suivante. */
        avoirsCollecteConstates: cumul.avoir,
        /** Avoirs antérieurs inscrits en déduction ici (art. 52). */
        recuperationArt52: cumul.recuperation,
        net: TauxTvaService.c(cumul.collecte - cumul.deductible - cumul.recuperation),
        /** Le cumul compte par compte · c'est lui que la liquidation solde. */
        parCompte: [...(parTauxCompte.get(t.id) ?? new Map<string, ParCompte>())].map(([compteId, v]) => ({
          compteId,
          collecte: v.collecte,
          deductible: v.deductible,
          recuperation: v.recuperation,
        })),
      });
    }

    const totalCollecte = TauxTvaService.c(lignes.reduce((s, l) => s + l.totalCollecte, 0));
    const totalDeductible = TauxTvaService.c(lignes.reduce((s, l) => s + l.totalDeductible, 0));
    const avoirsCollecteConstates = TauxTvaService.c(lignes.reduce((s, l) => s + l.avoirsCollecteConstates, 0));
    const recuperationArt52 = TauxTvaService.c(lignes.reduce((s, l) => s + l.recuperationArt52, 0));
    const prorata = await this.prorataApplicable(tenantId, dateDebut, dateFin);
    const totalDeductibleAdmise = TauxTvaService.c(totalDeductible * (prorata.pourcentage / 100));
    // La récupération de l'art. 52 vient APRÈS le prorata · ce n'est pas de la
    // taxe ayant grevé un achat, c'est la propre taxe du redevable qui lui
    // revient. Lui appliquer le prorata en amputerait une part sans texte.
    const netAvantImputation = TauxTvaService.c(totalCollecte - totalDeductibleAdmise - recuperationArt52);

    // ARTICLE 63 · le crédit du ou des mois précédents s'impute sur la taxe
    // exigible de celui-ci, jusqu'à épuisement. Un crédit non imputé reste
    // immobilisé au 4449 et le dossier verse deux fois.
    const credit = this.creditReportable(derniereLiquidation);
    const creditImpute = TauxTvaService.c(Math.min(credit.montant, Math.max(0, netAvantImputation)));
    const net = TauxTvaService.c(netAvantImputation - credit.montant);

    return {
      dateDebut,
      dateFin,
      regimeExigibilite: regime,
      mentionExigibilite: this.mentionExigibilite({
        regime,
        referentiel,
        montantIndetermine: TauxTvaService.c(montantIndetermine),
        deductionServicesDiffere: TauxTvaService.c(deductionServicesDiffere),
        deductionServicesDebits: TauxTvaService.c(deductionServicesDebits),
        deductionServicesDebitsSansReference: TauxTvaService.c(deductionServicesDebitsSansReference),
        deductionServicesDebitsMentionLue: TauxTvaService.c(deductionServicesDebitsMentionLue),
        deductionServicesDiffereMentionLue: TauxTvaService.c(deductionServicesDiffereMentionLue),
        collecteServicesDebits: TauxTvaService.c(collecteServicesDebits),
        deductionServicesHorsPeriode: TauxTvaService.c(deductionServicesHorsPeriode),
        deductionServicesHorsPeriodeMentionLue: TauxTvaService.c(deductionServicesHorsPeriodeMentionLue),
        deductionServicesDebitsNonDatee: TauxTvaService.c(deductionServicesDebitsNonDatee),
        deductionServicesDebitsFactureSansMention: TauxTvaService.c(deductionServicesDebitsFactureSansMention),
        deductionServicesPaiementAnterieur,
        collecteServicesPaiementAnterieur,
        collecteServicesAvantAutorisation: TauxTvaService.c(collecteServicesAvantAutorisation),
        autorisationDossierNonDatee: regime === 'DEBITS' && !dateAutorisationDossier,
        fournisseursHorsPeriode: [...fournisseursHorsPeriode],
        fournisseursMentionSansFiche: [...fournisseursMentionSansFiche],
        fournisseursNonDates: [...fournisseursNonDates],
        fournisseursFactureSansMention: [...fournisseursFactureSansMention],
        creditAnterieur: credit.montant,
        creditImpute,
        avoirsCollecteConstates,
        recuperationArt52,
        avoirsCollecteNonImputes,
        avoirsSansNoteDeCredit,
        tvaExclueArt41,
        tvaAVerifierArt41,
        tvaNatureDepenseIllisible,
        tvaDeductibleDechue,
        recettesNonQualifiees: prorata.recettesNonQualifiees,
        tvaAuBrouillard,
      }),
      /** TVA d'écritures au brouillard datées de la période · hors déclaration. */
      tvaAuBrouillard,
      // TVA facturée sur la période mais pas encore encaissée, donc pas encore
      // due. Zéro quand aucune ligne n'est datée à l'encaissement.
      tvaEnAttenteEncaissement: enAttente,
      lignes,
      prorata,
      totalCollecte,
      totalDeductible,
      totalDeductibleAdmise,
      /** Avoirs sur ventes constatés sur la période · reportés (décret art. 126). */
      avoirsCollecteConstates,
      /** Avoirs antérieurs inscrits en déduction sur cette période (art. 52). */
      recuperationArt52,
      /** Avoirs antérieurs qu'aucune liquidation ne permet de situer. */
      avoirsCollecteNonImputes,
      /**
       * Avoirs sur ventes constatés ou imputés ici dont l'écriture ne porte
       * aucune note de crédit (art. 52 al. 2, décret art. 127). Signalés, pas retirés.
       */
      avoirsSansNoteDeCredit,
      /** TVA d'amont écartée par l'article 41 · jamais déductible. */
      tvaExclueArt41,
      /** TVA d'amont sur des postes que l'article 41 vise sous condition. */
      tvaAVerifierArt41,
      /** TVA d'amont dont l'écriture ne porte aucune charge lisible. */
      tvaNatureDepenseIllisible,
      /** TVA d'amont dont le délai de déduction est expiré (art. 37 al. 2). */
      tvaDeductibleDechue,
      /** Net de la seule période, avant report du crédit antérieur. */
      netAvantImputation,
      /** Crédit de TVA venu de la dernière liquidation (art. 63). */
      creditAnterieur: credit.montant,
      creditAnterieurOrigine: credit.origine,
      /** Part de ce crédit qui éteint la taxe de la période. */
      creditImpute,
      net,
      sens: net >= 0 ? ('A_PAYER' as const) : ('CREDIT' as const),
      // ÉTAT DE LIQUIDATION · rendu avec la déclaration pour que l'écran sache
      // avant de proposer le bouton. Un verrou qui ne se manifeste qu'au clic
      // fait travailler l'utilisateur pour rien, puis le contredit.
      liquidation: dejaLiquidee
        ? {
            faite: true as const,
            id: dejaLiquidee.id,
            dateDebut: dejaLiquidee.dateDebut.toISOString().slice(0, 10),
            dateFin: dejaLiquidee.dateFin.toISOString().slice(0, 10),
            ecritureId: dejaLiquidee.ecriture.id,
            libelleEcriture: dejaLiquidee.ecriture.libelle,
            // Une liquidation dont les bornes ne sont pas celles demandées
            // recouvre la période sans lui correspondre · le dire évite de
            // chercher une écriture au libellé attendu qui n'existe pas.
            memePeriode:
              dejaLiquidee.dateDebut.getTime() === dateDebut.getTime() &&
              dejaLiquidee.dateFin.getTime() === dateFin.getTime(),
          }
        : { faite: false as const },
    };
  }

  /**
   * La phrase qui accompagne la déclaration · elle porte la règle appliquée,
   * son article, et surtout CE QUI N'A PAS PU ÊTRE ÉTABLI.
   *
   * C'est le seul texte libre que la fenêtre rende (DeclarationTvaPage,
   * bloc EXIGIBILITÉ) : l'imputation du crédit de TVA, les avoirs de
   * l'article 52, les exclusions de l'article 41 et la déchéance de
   * l'article 37 al. 2 y sont donc annoncées aussi, faute d'un autre endroit
   * où l'écran les lirait.
   */
  private mentionExigibilite(e: {
    regime: string;
    referentiel: Referentiel | undefined;
    montantIndetermine: number;
    deductionServicesDiffere: number;
    deductionServicesDebits: number;
    deductionServicesDebitsSansReference: number;
    /**
     * Part anticipée dont la facture d'achat rattachée porte la mention de
     * l'art. 60. Les deux parts sont REQUISES · optionnelles, un appel qui les
     * oublierait compilerait, lirait zéro, et la déclaration dirait « non
     * lue » de tout ce qui l'est (audit final F228, relecture).
     */
    deductionServicesDebitsMentionLue: number;
    /** Part différée dont la facture d'achat rattachée porte la mention, fiche muette. */
    deductionServicesDiffereMentionLue: number;
    collecteServicesDebits: number;
    /** Déduction différée · fiche autorisée, opération hors de sa période. */
    deductionServicesHorsPeriode: number;
    deductionServicesHorsPeriodeMentionLue: number;
    /** Déduction anticipée sur une autorisation sans date d'effet. */
    deductionServicesDebitsNonDatee: number;
    /** Déduction anticipée · facture d'achat enregistrée SANS la mention de l'art. 60. */
    deductionServicesDebitsFactureSansMention: number;
    /** Part datée d'un règlement antérieur au débit (décret art. 62). */
    deductionServicesPaiementAnterieur: number;
    collecteServicesPaiementAnterieur: number;
    /** Collecte sur services antérieure à l'autorisation du dossier · droit commun. */
    collecteServicesAvantAutorisation: number;
    /** Régime des débits sans date d'autorisation saisie. */
    autorisationDossierNonDatee: boolean;
    fournisseursHorsPeriode: string[];
    fournisseursMentionSansFiche: string[];
    fournisseursNonDates: string[];
    fournisseursFactureSansMention: string[];
    creditAnterieur: number;
    creditImpute: number;
    avoirsCollecteConstates: number;
    recuperationArt52: number;
    avoirsCollecteNonImputes: number;
    avoirsSansNoteDeCredit: number;
    tvaExclueArt41: number;
    tvaAVerifierArt41: number;
    tvaNatureDepenseIllisible: number;
    tvaDeductibleDechue: number;
    recettesNonQualifiees: number;
    tvaAuBrouillard?: { collecte: number; deductible: number; ecritures: number };
  }) {
    const { regime, referentiel } = e;
    const fc = (n: number) => n.toLocaleString('fr-FR');
    // Les fournisseurs NOMMÉS · huit au plus, le reste compté, pour qu'une
    // déclaration de cent fournisseurs reste lisible sans en taire aucun.
    const nommes = (noms: readonly string[]) =>
      noms.length <= 8 ? noms.join(', ') : `${noms.slice(0, 8).join(', ')} et ${noms.length - 8} autre(s)`;
    const brouillard = e.tvaAuBrouillard;
    const phrases: string[] = [
      ...(brouillard && brouillard.ecritures > 0
        ? [
            `TVA RESTÉE AU BROUILLARD, HORS DE CETTE DÉCLARATION · ${brouillard.ecritures} écriture(s) datée(s) de la ` +
              `période portent ${fc(brouillard.collecte)} CDF de TVA facturée et ${fc(brouillard.deductible)} CDF de ` +
              'TVA récupérable. Une écriture au brouillard n’est pas entrée au livre-journal (AUDCIF art. 22, 2°) · ' +
              'validez-la avant de déclarer, ou la taxe de la période sera fausse de ce montant.',
          ]
        : []),
      "Exigibilité datée OPÉRATION PAR OPÉRATION (article 25 de l'ordonnance-loi n° 10/001) : les LIVRAISONS DE " +
        'BIENS au fait générateur (art. 25, 1°), les PRESTATIONS DE SERVICES et TRAVAUX IMMOBILIERS à ' +
        "l'encaissement du prix, des acomptes ou avances (art. 25, 2°). La nature est lue à la CONTREPARTIE de " +
        'l’écriture, que les art. 6 et 8 qualifient (701 à 704 ventes de biens, 705/706 travaux et services, 7072 ' +
        'commissions, 7073 locations, 7076 redevances ; 60 achats, 6051/6052/6053 eau, électricité et énergies, ' +
        '6057 études, 61 à 63 transports et services extérieurs), et non au numéro du compte de TVA, qui suit la ' +
        'nomenclature comptable et non la loi fiscale. La date de l’encaissement est celle ' +
        'de l’ÉCRITURE DE RÈGLEMENT du groupe de lettrage, jamais celle du lettrage lui-même (décret n° 011/42, ' +
        'art. 57). DEUX RÉSERVES DU MÊME DÉCRET NE SONT PAS APPLIQUÉES ICI, et elles jouent en sens contraire : ' +
        'une fourniture sous CONTRAT D’ABONNEMENT à décomptes proportionnels à la consommation est exigible à ' +
        'l’expiration de la période, et non à l’encaissement (art. 55) ; un paiement par EFFET DE COMMERCE est ' +
        'encaissé « à la date de l’échéance de la traite, même si elle a été remise à l’escompte » (art. 57, ' +
        'alinéa 2), quand OmegaX retient la date de l’écriture qui solde le tiers, c’est-à-dire l’acceptation. ' +
        'À reprendre pièce par pièce si le dossier connaît l’un ou l’autre.',
    ];
    if (regime === 'DEBITS') {
      phrases.push(
        "Ce dossier est autorisé à acquitter la taxe d'après les DÉBITS (art. 26, sur décision du Directeur " +
          "Général des Impôts) : sa TVA sur services et travaux est exigible à l'inscription au débit du compte " +
          'du client, donc à la date de la facture. Cette autorisation ne change rien aux ventes de biens, déjà ' +
          'exigibles au fait générateur, ni à la TVA déductible, qui se juge chez le fournisseur.',
      );
      if (e.autorisationDossierNonDatee) {
        phrases.push(
          "AUTORISATION DU DOSSIER NON DATÉE · le régime des débits est appliqué à toute la période, faute de la " +
            "date de la décision du Directeur Général des Impôts (décret n° 011/42, art. 58 et 59) · saisissez-la " +
            'dans les paramètres du dossier.',
        );
      }
      if (e.collecteServicesAvantAutorisation > EPSILON) {
        phrases.push(
          `AVANT L'AUTORISATION · ${fc(e.collecteServicesAvantAutorisation)} CDF de TVA collectée sur services et ` +
            "travaux portent sur des opérations antérieures à l'autorisation du dossier · elles restent au droit " +
            "commun, exigibles à l'encaissement (O.-L. n° 10/001, art. 25, 2°, et art. 26).",
        );
      }
    }
    if (e.collecteServicesDebits > EPSILON) {
      phrases.push(
        `ENCAISSEMENT ANTÉRIEUR AU DÉBIT, NON VÉRIFIÉ · ${fc(e.collecteServicesDebits)} CDF de TVA collectée sur ` +
          'services et travaux sont datés de la FACTURE, au titre de l’autorisation de l’article 26. Son ' +
          'alinéa 3 y met une réserve impérative : « Elle ne dispense pas le redevable de s’acquitter de la taxe ' +
          'sur la valeur ajoutée au moment de l’encaissement du prix ou de l’acompte si celui-ci intervient avant ' +
          'les débits. » L’exigibilité est alors le PREMIER des deux événements. OmegaX NE PEUT PAS l’établir : ' +
          'une avance sur marché, un acompte à la commande ou un dépôt de garantie imputable s’enregistrent en ' +
          'avance reçue (compte 419), sans ligne de taxe et sans rattachement à la facture qui suivra · rien dans ' +
          'l’écriture ne les relie. Ce montant est donc daté AU PLUS TARD, jamais au plus tôt, et l’écart se ' +
          'redresse contre le dossier · à reprendre acompte par acompte avant dépôt.' +
          (e.collecteServicesPaiementAnterieur > EPSILON
            ? ` Dont ${fc(e.collecteServicesPaiementAnterieur)} CDF déclarés sur cette période à la date d’un ` +
              'RÈGLEMENT LETTRÉ à la facture et antérieur à elle, et non à la date de la facture (décret n° 011/42, ' +
              'art. 62) · ce règlement-là, OmegaX le voit.'
            : ''),
      );
    } else if (e.collecteServicesPaiementAnterieur > EPSILON) {
      // Facture postérieure à la période, réglée d'avance dans la période ·
      // rien d'autre n'est daté aux débits ici, la réserve sur le 419 vaut
      // pour la période où tombera la facture.
      phrases.push(
        `ENCAISSEMENT ANTÉRIEUR AU DÉBIT · ${fc(e.collecteServicesPaiementAnterieur)} CDF de TVA collectée sur ` +
          'services et travaux sont déclarés sur cette période à la date d’un RÈGLEMENT LETTRÉ à une facture qui ' +
          'lui est postérieure : l’autorisation « ne dispense pas le redevable de s’acquitter de la taxe au moment ' +
          'de l’encaissement du prix ou de l’acompte si celui-ci est antérieur au débit » (décret n° 011/42, ' +
          'art. 62 ; O.-L. n° 10/001, art. 26 al. 3).',
      );
    }
    if (e.montantIndetermine > EPSILON) {
      phrases.push(
        `REPLI DÉCLARÉ sur ${fc(e.montantIndetermine)} CDF de la période : ` +
          (referentiel === Referentiel.SYSCOHADA
            ? 'ces lignes sont portées sur des comptes de TVA dont le numéro ne dit pas la nature de ' +
              "l'opération (4435 factures à établir, 4451 immobilisations, 4455 factures non parvenues…). "
            : 'le plan SYCEBNL ne subdivise ni le 443 ni le 445, aucune nature n’y est lisible. ') +
          `Elles sont datées selon le paramètre du dossier (${regime}), qui est un REPLI et non la règle · ` +
          'à vérifier opération par opération avant dépôt.',
      );
    }
    if (e.deductionServicesDiffere > EPSILON) {
      // AUDIT FINAL F228 · la mention se lit aussi sur la facture d'achat
      // enregistrée. Le message disait « nulle part ailleurs » que sur la
      // pièce du fournisseur, et « ne PEUT pas savoir » même quand la facture
      // rattachée la porte.
      const mentionLue = e.deductionServicesDiffereMentionLue;
      phrases.push(
        `DÉDUCTION SUR SERVICES · ${fc(e.deductionServicesDiffere)} CDF de TVA d'amont facturée ` +
          "sur la période sont déduits au PAIEMENT du fournisseur : l'article 37 al. 1 fait naître le droit à " +
          "déduction « lorsque la taxe devient exigible chez l'assujetti », et le décret n° 011/42, art. 96, " +
          'précise qu’il s’agit du FOURNISSEUR. AUCUNE AUTORISATION D’ACQUITTER D’APRÈS LES DÉBITS N’EST ' +
          'RENSEIGNÉE sur la fiche des tiers de ces factures · ce qui ne veut PAS dire qu’il n’y en a pas. La ' +
          'mention « Autorisation d’acquitter la TVA d’après les débits » se lit sur la facture (décret art. 60), ' +
          'et la date de la déduction suit la fiche du fournisseur, qui porte l’autorisation et la référence de ' +
          'la décision (art. 26) : tant que la fiche ne la porte pas, OmegaX ne PEUT pas avancer la déduction, ' +
          'et s’en tient au droit commun. Chez un fournisseur autorisé (art. 26), la taxe est exigible dès la ' +
          'facture et la déduction naît plus tôt · à vérifier facture par facture avant dépôt.' +
          (mentionLue > EPSILON
            ? ` Dont ${fc(mentionLue)} CDF sur une facture d’achat enregistrée qui PORTE la mention : portez ` +
              'l’autorisation et sa référence sur la fiche du fournisseur, la déduction naîtra alors à la ' +
              'facture (décret art. 61 et 96).' +
              (e.fournisseursMentionSansFiche.length > 0
                ? ` Fiche(s) à reprendre, le droit commun étant gardé d’ici là : ${nommes(e.fournisseursMentionSansFiche)}.`
                : '')
            : ''),
      );
    }
    if (e.deductionServicesDebits > EPSILON) {
      // AUDIT FINAL F228 · la mention se LIT sur la facture d'achat
      // enregistrée et rattachée à l'écriture. Le message disait qu'OmegaX ne
      // pouvait pas la vérifier ; il dit désormais ce qui en est prouvé, et
      // ce qui reste à vérifier sur la pièce du fournisseur.
      const nonLue = TauxTvaService.c(e.deductionServicesDebits - e.deductionServicesDebitsMentionLue);
      phrases.push(
        `FOURNISSEURS AUTORISÉS AUX DÉBITS · ${fc(e.deductionServicesDebits)} CDF de TVA d’amont sur services et ` +
          'travaux sont déduits DÈS LA FACTURE, et non au paiement : ces fournisseurs sont renseignés comme ' +
          'autorisés à acquitter la TVA d’après les débits (art. 26, sur décision du Directeur Général des ' +
          'Impôts), leur taxe est donc exigible « par l’inscription de la somme au débit du compte du client » ' +
          '(décret n° 011/42, art. 61) et le droit à déduction du client naît à cette date (article 37 al. 1, ' +
          'décret art. 96). L’autorisation est appliquée TELLE QU’ELLE A ÉTÉ SAISIE sur la fiche du tiers · elle ' +
          'se prouve par la mention portée sur la facture (décret art. 60), qu’OmegaX lit sur la facture d’achat ' +
          'enregistrée et rattachée à l’écriture. ' +
          (nonLue > EPSILON
            ? `${fc(nonLue)} CDF ne reposent sur aucune facture d’achat enregistrée où la mention soit cochée · ` +
              'elle est à vérifier sur la pièce du fournisseur avant dépôt.'
            : 'Chacune de ces écritures est rattachée à une facture d’achat enregistrée qui la porte.'),
      );
    }
    if (e.deductionServicesDebitsSansReference > EPSILON) {
      phrases.push(
        `AUTORISATION AUX DÉBITS SANS RÉFÉRENCE · ${fc(e.deductionServicesDebitsSansReference)} CDF de cette ` +
          'déduction anticipée reposent sur un tiers coché « autorisé aux débits » dont la RÉFÉRENCE de la ' +
          'décision n’est pas saisie. L’autorisation est délivrée « sur décision du Directeur Général des Impôts ' +
          'ou son délégué en province » (art. 26), sur demande adressée par simple lettre (décret art. 58) : sans ' +
          'cette référence, l’anticipation ne s’appuie sur aucune pièce nommée · à documenter avant dépôt.',
      );
    }
    if (e.deductionServicesDebitsFactureSansMention > EPSILON) {
      // Signal (c) · la fiche date, la pièce devait prouver et ne prouve pas.
      phrases.push(
        `FACTURE ENREGISTRÉE SANS LA MENTION DES DÉBITS · ${fc(e.deductionServicesDebitsFactureSansMention)} CDF de ` +
          'cette déduction anticipée reposent sur une facture d’achat enregistrée où la mention « Autorisation ' +
          'd’acquitter la TVA d’après les débits » n’est PAS cochée, alors qu’elle « doit figurer sur toutes les ' +
          'factures délivrées par le prestataire de services ou l’entrepreneur de travaux » autorisé (décret ' +
          'n° 011/42, art. 60). L’anticipation est gardée, la fiche du fournisseur datant la déduction ; la preuve ' +
          `manque sur la pièce · à vérifier sur l’original, ou à faire rectifier par : ${nommes(e.fournisseursFactureSansMention)}.`,
      );
    }
    if (e.deductionServicesDebitsNonDatee > EPSILON) {
      phrases.push(
        `AUTORISATION AUX DÉBITS NON DATÉE · ${fc(e.deductionServicesDebitsNonDatee)} CDF de cette déduction ` +
          'anticipée reposent sur une fiche autorisée SANS date d’effet. L’anticipation est gardée, mais rien ne ' +
          'dit que la décision (ou le silence de dix jours qui « vaut autorisation », décret n° 011/42, art. 59) ' +
          'précède ces factures · une déduction avancée avant l’exigibilité chez le fournisseur (art. 37 al. 1, ' +
          `décret art. 96) se redresse. Date d’effet à porter sur la fiche de : ${nommes(e.fournisseursNonDates)}.`,
      );
    }
    if (e.deductionServicesHorsPeriode > EPSILON) {
      // Signal (b), second visage · la fiche est autorisée, mais pas à cette
      // date. Le droit commun est gardé et le fournisseur nommé.
      phrases.push(
        `HORS DE LA PÉRIODE D’AUTORISATION · ${fc(e.deductionServicesHorsPeriode)} CDF de TVA d’amont sur services ` +
          'et travaux sont déduits au PAIEMENT, selon le droit commun : la fiche du fournisseur le dit autorisé aux ' +
          'débits, mais la facture précède la date d’effet de la décision (décret n° 011/42, art. 59) ou suit le ' +
          'retour au droit commun (O.-L. n° 10/001, art. 26 al. 2 ; décret art. 63).' +
          (e.deductionServicesHorsPeriodeMentionLue > EPSILON
            ? ` Dont ${fc(e.deductionServicesHorsPeriodeMentionLue)} CDF sur une facture d’achat enregistrée qui ` +
              'PORTE pourtant la mention de l’art. 60 · la période saisie sur la fiche est à confronter à la pièce.'
            : '') +
          ` Fournisseur(s) : ${nommes(e.fournisseursHorsPeriode)}.`,
      );
    }
    if (e.deductionServicesPaiementAnterieur > EPSILON) {
      phrases.push(
        `RÈGLEMENT ANTÉRIEUR AU DÉBIT · ${fc(e.deductionServicesPaiementAnterieur)} CDF de TVA d’amont due à des ` +
          'fournisseurs autorisés aux débits sont déduits à la date d’un RÈGLEMENT LETTRÉ à leur facture et ' +
          'antérieur à elle, et non à la date de la facture : l’autorisation « ne dispense pas le redevable de ' +
          's’acquitter de la taxe au moment de l’encaissement du prix ou de l’acompte si celui-ci est antérieur au ' +
          'débit » (décret n° 011/42, art. 62), et le droit à déduction naît à cette exigibilité chez le ' +
          'fournisseur (O.-L. n° 10/001, art. 37 al. 1 ; décret art. 96).',
      );
    }
    if (e.tvaExclueArt41 > EPSILON) {
      phrases.push(
        `EXCLUSIONS DE L’ARTICLE 41 · ${fc(e.tvaExclueArt41)} CDF de TVA d’amont sont ÉCARTÉS de la déduction : ` +
          'l’article 41, 1° dispose que « n’ouvre pas droit à déduction, la taxe ayant grevé […] les dépenses de ' +
          'logement, d’hébergement, de restauration, de réception, de spectacles, de location de véhicules de ' +
          'tourisme et de transport de personnes ». Sont reconnues les charges portées aux comptes ' +
          `${EXCLUSIONS_ART_41.map(([, libelle]) => libelle).join(', ')}. Le même point réserve les ` +
          'dépenses supportées, AU TITRE DE LEUR ACTIVITÉ IMPOSABLE, par les professionnels du tourisme, de la ' +
          'restauration et du spectacle : OmegaX ne connaît pas le secteur d’activité du dossier et n’applique ' +
          'donc pas cette exception · si elle vous concerne, réintégrez ce montant.',
      );
    }
    if (e.tvaAVerifierArt41 > EPSILON) {
      phrases.push(
        `À VÉRIFIER, ARTICLES 41 ET 42 · ${fc(e.tvaAVerifierArt41)} CDF de TVA d’amont portent sur des charges ` +
          `que la loi vise SOUS CONDITION (${EXCLUSIONS_ART_41_A_VERIFIER.map(([, l]) => l).join(' ; ')}). ` +
          'La condition ne se lit ni au compte ni au montant GLOBAL d’une ligne d’écriture, qui est tout ce que ' +
          'cette déclaration lit. Pour les CADEAUX, le décret n° 011/42, art. 107, chiffre pourtant le seuil : est ' +
          'de faible valeur « le bien dont la valeur unitaire est inférieure à 10.000,00 Francs congolais », le ' +
          'Ministre des Finances étant habilité à réajuster ce montant. La valeur unitaire EST saisie sur la ' +
          'facture (prix unitaire et quantité) · elle ne l’est pas sur l’écriture, et c’est la facture qu’il faut ' +
          'reprendre. Pour les TRANSPORTS, la condition tient à l’existence d’un contrat permanent, donnée ' +
          'juridique qu’aucune écriture ne porte. Ces montants restent DÉDUITS · à trancher pièce par pièce avant ' +
          'dépôt.',
      );
    }
    if (e.tvaNatureDepenseIllisible > EPSILON) {
      phrases.push(
        `NATURE DE LA DÉPENSE NON LISIBLE · ${fc(e.tvaNatureDepenseIllisible)} CDF de TVA d’amont sont portés par ` +
          'des écritures sans contrepartie de charge de classe 6 (immobilisations, ou plan qui agrège ses charges ' +
          'externes). L’article 42, 1° exclut la taxe « sur les véhicules ou engins, quelle que soit leur nature, ' +
          'conçus ou aménagés pour le transport des personnes, constituant des immobilisations ainsi que […] leur ' +
          'location, leurs pièces détachées et accessoires », et l’article 41, 3° les produits pétroliers : ni ' +
          'l’un ni l’autre ne se lit sur un numéro de compte (un 245 porte aussi bien un camion qu’un 4x4 de ' +
          'direction). Ces montants restent DÉDUITS · à vérifier sur pièce.',
      );
    }
    if (e.avoirsCollecteConstates > EPSILON) {
      phrases.push(
        `AVOIRS SUR VENTES CONSTATÉS · ${fc(e.avoirsCollecteConstates)} CDF de TVA ont été portés au DÉBIT d’un ` +
          'compte 443 sur la période. L’article 52 permet d’en récupérer le montant « par voie d’imputation sur ' +
          'l’impôt dû pour les opérations faites ultérieurement », et le décret n° 011/42, art. 126, le situe : ' +
          '« elle est inscrite dans les déductions afférentes à la déclaration du ou des mois SUIVANTS celui de ' +
          'la constatation ». Ce montant ne minore donc PAS la collecte de cette déclaration · il sera inscrit en ' +
          'déduction de la suivante, une fois celle-ci liquidée. La récupération suppose que la note de crédit ou ' +
          'la facture nouvelle ait été ÉTABLIE ET ENVOYÉE au client, et la facture initiale barrée et conservée ' +
          '(décret art. 127). OmegaX voit la note quand elle est émise par sa facturation et rattachée à ' +
          'l’écriture ; il ne voit pas une note émise ailleurs, ni son ENVOI au client.',
      );
    }
    if (e.avoirsSansNoteDeCredit > EPSILON) {
      phrases.push(
        `AVOIRS SANS NOTE DE CRÉDIT · ${fc(e.avoirsSansNoteDeCredit)} CDF de TVA sur avoirs, constatés ou imputés ` +
          'sur cette déclaration, ne sont justifiés par aucune note de crédit rattachée à leur écriture. « Pour les ' +
          'opérations annulées ou résiliées, la récupération de la taxe acquittée est subordonnée à l’établissement ' +
          'et à l’envoi au client d’une facture nouvelle ou note de crédit annulant et remplaçant la facture ' +
          'initiale » (article 52, alinéa 2). Ces montants restent comptés · si la note a été émise hors d’OmegaX, ' +
          'la tenir à disposition ; sinon, l’émettre depuis la fenêtre Facturation avant de récupérer la taxe.',
      );
    }
    if (e.recuperationArt52 > EPSILON) {
      phrases.push(
        `RÉCUPÉRATION SUR VENTES ANNULÉES · ${fc(e.recuperationArt52)} CDF d’avoirs constatés avant cette période ` +
          'sont inscrits ici en DÉDUCTION (article 52, décret art. 126). Le prorata de l’article 43 ne leur est ' +
          'pas appliqué : il limite la déduction de la taxe ayant grevé les achats, alors que celle-ci est la ' +
          'taxe du redevable lui-même, qui lui revient.',
      );
    }
    if (e.avoirsCollecteNonImputes > EPSILON) {
      phrases.push(
        `AVOIRS ANTÉRIEURS NON IMPUTÉS · ${fc(e.avoirsCollecteNonImputes)} CDF de TVA sur avoirs ont été constatés ` +
          'avant cette période, mais aucune liquidation comptabilisée ne permet de savoir dans quelle déclaration ' +
          'ils ont déjà pu être imputés. OmegaX ne les impute donc pas d’office · ils restent récupérables par ' +
          'imputation (article 52), à porter à la main après vérification des déclarations déjà déposées.',
      );
    }
    if (e.tvaDeductibleDechue > EPSILON) {
      phrases.push(
        `DÉLAI DE DÉDUCTION EXPIRÉ · ${fc(e.tvaDeductibleDechue)} CDF de TVA d’amont sont devenus exigibles avant ` +
          'le 1er janvier de l’année précédant cette déclaration. « Le droit à déduction est exercé jusqu’au ' +
          '31 décembre de l’année qui suit celle au cours de laquelle la taxe est devenue exigible. A ' +
          'l’expiration de ce délai, la taxe sur la valeur ajoutée non déduite est acquise définitivement au ' +
          'Trésor public » (article 37, alinéa 2). Ces montants n’entrent dans aucune déclaration d’ici · ' +
          's’ils n’ont pas été déduits en leur temps, ils sont perdus.',
      );
    }
    if (e.recettesNonQualifiees > EPSILON) {
      phrases.push(
        `PRORATA · ${fc(e.recettesNonQualifiees)} CDF de recettes de classe 7 ne portent AUCUNE ligne de TVA : ` +
          'elles pèsent au dénominateur et n’entrent pas au numérateur. L’article 43 met pourtant au numérateur ' +
          '« les recettes afférentes aux opérations ouvrant droit à déduction […] Y COMPRIS LES EXPORTATIONS et ' +
          'opérations assimilées » : une vente à l’export, taxée à 0 %, n’est reconnue que si sa ligne de TVA au ' +
          'taux zéro existe. Si ces recettes en comprennent, le prorata est SOUS-ÉVALUÉ et la déduction avec lui.',
      );
    }
    if (e.creditAnterieur > EPSILON) {
      phrases.push(
        `CRÉDIT DE TVA REPORTÉ · ${fc(e.creditAnterieur)} CDF issus de la dernière liquidation ` +
          `sont imputés sur la taxe de cette période à hauteur de ${fc(e.creditImpute)} CDF ` +
          "(article 63 : l'excédent « constitue un crédit d'impôt imputable sur la taxe exigible du ou des mois " +
          'suivants jusqu’à l’épuisement »). Le solde éventuel reste reportable · l’article 63 ferme le ' +
          'remboursement, hors les cas de l’article 64.',
      );
    }
    return phrases.join(' ');
  }

  /**
   * Comptabilise la liquidation périodique : solde, par compte réellement
   * utilisé (en général 44310000/44510000 partagés voir le seed mais un
   * tenant peut avoir personnalisé des comptes différents par taux), la TVA
   * collectée et la TVA déductible ADMISE (après prorata), et porte la
   * différence sur le compte 44410000 (crédit = TVA due, débit = crédit de TVA
   * à reporter), APRÈS avoir éteint la part du crédit antérieur imputée sur la
   * période (art. 63). Pose une écriture NORMALE via EcritureService.creer ·
   * mêmes contrôles que n'importe quelle saisie (équilibre, exercice ouvert,
   * clôtures Partielle/Totale/Période).
   *
   * LA RÉCUPÉRATION DE L'ARTICLE 52 SOLDE LE 443, ELLE AUSSI. Un avoir sur
   * vente a débité un compte de TVA facturée dans sa propre période, sans que
   * la liquidation de cette période-là y touche (le décret art. 126 renvoie la
   * récupération au mois suivant). Le compte reste donc débiteur du montant de
   * l'avoir jusqu'à ce que la liquidation SUIVANTE le crédite · c'est la ligne
   * « Récupération TVA sur ventes annulées ou résiliées ». Sans elle,
   * l'écriture ne s'équilibrerait pas, puisque le net porté au 444 tient déjà
   * compte de la récupération.
   *
   * LE MARQUEUR STOCKE LE NET APRÈS IMPUTATION (`LiquidationTva.net`), et c'est
   * lui que la déclaration suivante relit pour connaître le crédit reportable.
   * Le chaînage est donc porté par la donnée elle-même : chaque liquidation
   * dit ce qui reste dû ou reste à reporter, sans que personne n'ait à
   * rejouer l'historique.
   *
   * VERROU ANTI-DOUBLE-LIQUIDATION. Il n'y en avait pas, et le code le disait
   * sans que personne n'agisse : reposter la même période créait une seconde
   * écriture identique. La première solde les comptes de taxe, la seconde les
   * rend débiteurs ou créditeurs du même montant en sens inverse, et le compte
   * 444 porte le double de la dette réelle. Rien ne le signalait · ni à
   * l'écran, ni au contrôle, ni dans la déclaration suivante, dont les comptes
   * de taxe repartent alors d'un solde faux.
   *
   * Ce qui est interdit est le CHEVAUCHEMENT, pas la répétition à l'identique.
   * Liquider janvier puis liquider le premier trimestre est le même double
   * comptage qu'une double liquidation de janvier, et un verrou qui ne
   * regarderait que l'égalité des bornes le laisserait passer.
   */
  async comptabiliserLiquidation(
    tenantId: string,
    userId: string,
    dto: { exerciceId: string; dateDebut: string; dateFin: string; date?: string },
  ) {
    const dateDebut = new Date(dto.dateDebut);
    const dateFin = new Date(dto.dateFin);

    const chevauchante = await this.liquidationChevauchante(tenantId, dateDebut, dateFin);
    if (chevauchante) {
      const jour = (d: Date) => d.toLocaleDateString('fr-FR');
      throw new BadRequestException(
        `Une liquidation couvre déjà tout ou partie de cette période (du ${jour(chevauchante.dateDebut)} au ` +
          `${jour(chevauchante.dateFin)}, écriture « ${chevauchante.ecriture.libelle} »). La comptabiliser une ` +
          'seconde fois porterait le double de la dette sur le compte 444. Supprimez la liquidation existante ' +
          'si elle est erronée, ou choisissez une période non encore liquidée.',
      );
    }

    const decl = await this.declaration(tenantId, dateDebut, dateFin);

    // UNE PÉRIODE LIQUIDÉE NE SE REDÉCLARE PAS (audit final F25) · une ligne
    // de TVA validée APRÈS la liquidation garderait sa date d'exigibilité dans
    // la période close, et aucune déclaration ne la reprendrait jamais. La
    // taxe serait perdue sur une écriture équilibrée. D'où le refus, tant que
    // la période porte de la TVA au brouillard.
    if (decl.tvaAuBrouillard.ecritures > 0) {
      const b = decl.tvaAuBrouillard;
      throw new BadRequestException(
        `${b.ecritures} écriture(s) de la période portent encore de la TVA au brouillard ` +
          `(${b.collecte.toLocaleString('fr-FR')} CDF facturée, ${b.deductible.toLocaleString('fr-FR')} CDF ` +
          'récupérable). Validez-les ou supprimez-les avant de liquider · une fois la période liquidée, une ' +
          'ligne validée ensuite ne serait reprise par aucune déclaration (AUDCIF art. 22, 2°).',
      );
    }

    const recuperationArt52 = decl.recuperationArt52;
    if (
      decl.totalCollecte <= EPSILON &&
      Math.abs(decl.totalDeductibleAdmise) <= EPSILON &&
      recuperationArt52 <= EPSILON
    ) {
      throw new BadRequestException('Aucun mouvement de TVA sur cette période · rien à comptabiliser.');
    }

    const ratio = decl.prorata.pourcentage / 100;
    const parCompteCollecte = new Map<string, number>();
    const parCompteDeductible = new Map<string, number>();
    // Récupération de l'art. 52 · elle SOLDE le débit que l'avoir a laissé sur
    // le compte de TVA facturée. Sans cette ligne, le 443 resterait débiteur
    // du montant de l'avoir, indéfiniment, et l'écriture ne s'équilibrerait
    // pas puisque le net du 444 tient déjà compte de la récupération.
    const parCompteRecuperation = new Map<string, number>();
    // CHAQUE COMPTE RÉELLEMENT MOUVEMENTÉ, jamais le compte du taux (voir
    // `declaration`, `parCompte`) · le 4432 d'une prestation vendue se solde
    // sur lui-même, et une ligne dont le taux n'a pas de compte n'est plus
    // omise (elle aurait déséquilibré l'écriture).
    const deductiblesBruts = new Map<string, number>();
    for (const l of decl.lignes) {
      for (const pc of l.parCompte) {
        if (pc.collecte > EPSILON) parCompteCollecte.set(pc.compteId, TauxTvaService.c((parCompteCollecte.get(pc.compteId) ?? 0) + pc.collecte));
        if (pc.recuperation > EPSILON) {
          parCompteRecuperation.set(pc.compteId, TauxTvaService.c((parCompteRecuperation.get(pc.compteId) ?? 0) + pc.recuperation));
        }
        // Le déductible d'un compte peut être NÉGATIF · un avoir fournisseur
        // reprend une déduction (décret art. 127), et la reprise peut dépasser
        // la déduction du mois. La ligne bascule alors au débit du 445.
        if (Math.abs(pc.deductible) > EPSILON) deductiblesBruts.set(pc.compteId, (deductiblesBruts.get(pc.compteId) ?? 0) + pc.deductible);
      }
    }
    // LA DÉDUCTION ADMISE EST RÉPARTIE, PAS RECALCULÉE COMPTE PAR COMPTE · le
    // 444 reçoit le net de la déclaration, arrondi une fois ; des arrondis au
    // centime pris compte par compte s'en écarteraient et l'écriture ne
    // s'équilibrerait plus. Le reste d'arrondi va au compte le plus lourd.
    for (const [compteId, montant] of repartirAuCentime(decl.totalDeductibleAdmise, deductiblesBruts, ratio)) {
      parCompteDeductible.set(compteId, montant);
    }

    // Le compte d'arrivée de la liquidation DÉPEND DU SENS du solde, et le
    // SYSCOHADA lui donne deux comptes là où le SYCEBNL n'en a qu'un.
    //
    // Plan SYSCOHADA, compte 44 : « 444 État, TVA due ou crédit de TVA » se
    // subdivise en « 4441 État, TVA due » et « 4449 État, crédit de TVA à
    // reporter ». Le semis SYSCOHADA pose les deux (44410000 et 44490000). Le
    // SYCEBNL, lui, ne subdivise pas son 444 et ne sème que 44410000, qui
    // porte alors les deux sens.
    //
    // Écrire un crédit de TVA au débit du 4441 « TVA due » est un contresens :
    // le compte finit débiteur alors que son intitulé annonce une dette, et le
    // poste de bilan qui le lit range une créance sur l'État parmi les dettes
    // fiscales. Rien ne le signale · l'écriture reste équilibrée.
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { referentiel: true },
    });
    const estSyscohada = tenant?.referentiel === Referentiel.SYSCOHADA;

    const chercherCompte = async (numero: string, intitule: string) => {
      const c = await this.prisma.compte.findFirst({ where: { tenantId, numero } });
      if (!c) {
        throw new BadRequestException(
          `Compte ${numero} (${intitule}) introuvable pour ce dossier · nécessaire pour comptabiliser la liquidation.`,
        );
      }
      return c;
    };

    const compteTvaDue = await chercherCompte(
      '44410000',
      estSyscohada ? 'État, TVA due' : 'État, TVA due ou crédit de TVA',
    );
    // En SYCEBNL le crédit de TVA retombe sur le même compte, faute d'un 4449
    // à son plan · ce n'est pas un pis-aller, c'est ce que son texte prévoit.
    const compteCreditTva = estSyscohada
      ? await chercherCompte('44490000', 'État, crédit de TVA à reporter')
      : compteTvaDue;

    const lignesEcriture: Array<{ compteId: string; debit?: number; credit?: number; libelle?: string }> = [];
    for (const [compteId, montant] of parCompteCollecte) {
      lignesEcriture.push({ compteId, debit: montant, credit: 0, libelle: 'Liquidation TVA · solde TVA collectée' });
    }
    for (const [compteId, montant] of parCompteDeductible) {
      if (Math.abs(montant) <= EPSILON) continue;
      lignesEcriture.push(
        montant > 0
          ? { compteId, debit: 0, credit: montant, libelle: 'Liquidation TVA · solde TVA déductible admise' }
          : { compteId, debit: -montant, credit: 0, libelle: 'Liquidation TVA · reprise de déduction sur avoir' },
      );
    }
    for (const [compteId, montant] of parCompteRecuperation) {
      lignesEcriture.push({
        compteId,
        debit: 0,
        credit: montant,
        libelle: 'Récupération TVA sur ventes annulées ou résiliées (art. 52)',
      });
    }
    /*
      LE 444 REÇOIT LE NET DE LA PÉRIODE, ET L'IMPUTATION LE CRÉDITE À PART.

      Article 63 : le crédit du ou des mois précédents s'impute sur la taxe
      exigible de celui-ci. Comptablement, ce n'est pas le net APRÈS imputation
      qu'il faut porter au 444 · le crédit antérieur y est déjà inscrit au
      débit depuis la liquidation qui l'a constaté, et le réinscrire une
      seconde fois le compterait deux fois (l'écriture ne s'équilibrerait
      d'ailleurs plus). L'imputation est donc une ligne à part, au CRÉDIT du
      compte de crédit de TVA, qui éteint ce qui a servi ; ce qui reste y
      demeure et se reportera au mois suivant.

      Le solde du 4449 suit ainsi l'article : il vaut, à tout instant, le
      crédit encore imputable.
    */
    const netPeriode = decl.netAvantImputation;
    if (netPeriode > EPSILON) {
      if (decl.creditImpute > EPSILON) {
        lignesEcriture.push({
          compteId: compteCreditTva.id,
          debit: 0,
          credit: decl.creditImpute,
          libelle: 'Imputation du crédit de TVA reporté (art. 63)',
        });
      }
      const restantDu = TauxTvaService.c(netPeriode - decl.creditImpute);
      if (restantDu > EPSILON) {
        lignesEcriture.push({ compteId: compteTvaDue.id, debit: 0, credit: restantDu, libelle: 'TVA due' });
      }
    } else if (netPeriode < -EPSILON) {
      lignesEcriture.push({
        compteId: compteCreditTva.id,
        debit: -netPeriode,
        credit: 0,
        libelle: 'Crédit de TVA à reporter',
      });
    }

    if (lignesEcriture.length < 2) {
      throw new BadRequestException('Rien à comptabiliser sur cette période.');
    }

    const journal =
      (await this.prisma.journal.findFirst({ where: { tenantId, code: 'OD' } })) ??
      (await this.prisma.journal.findFirst({ where: { tenantId, type: TypeJournal.GENERAL } }));
    if (!journal) {
      throw new BadRequestException(
        "Aucun journal de type Général disponible pour enregistrer la liquidation TVA (journal 'OD' attendu).",
      );
    }

    const date = dto.date ? new Date(dto.date) : dateFin;
    const ecriture = await this.ecritureService.creer(tenantId, userId, {
      exerciceId: dto.exerciceId,
      journalId: journal.id,
      date: date.toISOString(),
      libelle: `Liquidation TVA · période du ${dto.dateDebut} au ${dto.dateFin}`,
      lignes: lignesEcriture,
    });

    // La trace est posée APRÈS l'écriture, et son échec la reprend · une
    // écriture de liquidation sans marqueur rouvrirait le trou qu'on vient de
    // fermer, en silence. `EcritureService.creer` ne participe pas à une
    // transaction (voir sa signature), d'où la compensation explicite.
    try {
      await this.prisma.liquidationTva.create({
        data: {
          tenantId,
          dateDebut,
          dateFin,
          ecritureId: ecriture.id,
          net: decl.net,
          prorataApplique: decl.prorata.pourcentage,
          createdBy: userId,
        },
      });
    } catch (e) {
      // Lignes puis tête, et un échec de la compensation remonte (F1) ·
      // avalé, il laissait une liquidation sans marqueur au journal.
      await this.ecritureService.retirerCompensation(tenantId, ecriture.id);
      throw e;
    }

    return { ecriture, declaration: decl };
  }

  /**
   * La liquidation qui recouvre tout ou partie d'une période, s'il y en a une.
   *
   * Deux intervalles se chevauchent quand chacun commence avant que l'autre ne
   * finisse · c'est le test complet, et il attrape les quatre cas (identique,
   * inclus, incluant, à cheval) là où une comparaison d'égalité n'en attrape
   * qu'un.
   */
  private async liquidationChevauchante(tenantId: string, dateDebut: Date, dateFin: Date) {
    return this.prisma.liquidationTva.findFirst({
      where: { tenantId, dateDebut: { lte: dateFin }, dateFin: { gte: dateDebut } },
      include: { ecriture: { select: { id: true, libelle: true, date: true } } },
      orderBy: { dateDebut: 'asc' },
    });
  }

  /** Les liquidations d'un dossier, la plus récente en tête. */
  async listerLiquidations(tenantId: string) {
    const liquidations = await this.prisma.liquidationTva.findMany({
      where: { tenantId },
      include: { ecriture: { select: { id: true, libelle: true, date: true, numeroPiece: true } } },
      orderBy: { dateDebut: 'desc' },
    });
    return liquidations.map((l) => ({
      id: l.id,
      dateDebut: l.dateDebut.toISOString().slice(0, 10),
      dateFin: l.dateFin.toISOString().slice(0, 10),
      net: Number(l.net),
      prorataApplique: Number(l.prorataApplique),
      ecriture: l.ecriture,
      createdAt: l.createdAt,
    }));
  }

  /**
   * ANNULE une liquidation : supprime le marqueur ET son écriture.
   *
   * Un verrou sans marche arrière transforme une erreur de date en impasse ·
   * l'utilisateur qui a liquidé « janvier » au lieu de « janvier à mars » ne
   * pourrait plus jamais liquider février ni mars. La suppression de
   * l'écriture passe par `EcritureService`, donc par ses contrôles : un
   * exercice clos ou une période verrouillée la refuse, comme pour n'importe
   * quelle écriture.
   */
  async annulerLiquidation(tenantId: string, id: string) {
    const liquidation = await this.prisma.liquidationTva.findFirst({ where: { id, tenantId } });
    if (!liquidation) {
      throw new BadRequestException('Liquidation introuvable pour ce dossier.');
    }
    // Le marqueur et l'écriture partent dans UNE transaction, par
    // `EcritureService` et ses contrôles (brouillard, exercice ouvert,
    // lettrage, pointage). Le module se nomme comme détenteur libéré · appelé
    // sans cela, `supprimer` refusait en renvoyant « défaites l'opération
    // dans son module » au module lui-même (audit du 2026-09-27, B1).
    await this.ecritureService.supprimer(tenantId, liquidation.ecritureId, {
      detenteur: DETENTEUR_LIQUIDATION_TVA,
      liberer: (tx) => tx.liquidationTva.delete({ where: { id: liquidation.id } }),
    });
    return { supprime: true, ecritureId: liquidation.ecritureId };
  }
}
