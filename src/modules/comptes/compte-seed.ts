import { ClasseCompte, ModeReportANouveau, TypeCompteDetailTotal } from '@prisma/client';

/**
 * Plan des comptes SYCEBNL · import complet des comptes d'imputation de base
 * (classes 1 à 8, + comptes principaux 90/91 de la classe 9), transcrits du
 * texte officiel (Journal officiel OHADA n° spécial du 22/02/2023, Partie 2,
 * ch. 2, p. 76-105 · voir skill `sycebnl`, `references/partie2-ch2-plan-comptes.md`).
 *
 * Convention de numérotation : chaque numéro officiel (2, 3, 4 ou 5 chiffres)
 * est complété à droite par des zéros jusqu'à 8 chiffres (ex. "1011" →
 * "10110000", "103" → "10300000", "10611" → "10611000") · longueur par
 * défaut du dossier (`Tenant.longueurCompte`, configurable de 3 à 13
 * chiffres par dossier comme chez Sage, voir le commentaire du schéma).
 * Ceci laisse largement la place à des sous-comptes analytiques créés
 * manuellement par le cabinet (ex. "41100001", "41100002" pour des
 * adhérents individuels sous la racine "411000") · voir PlanComptesPage et
 * le mécanisme des comptes Total/Détail (§3.1).
 *
 * Règle de sélection des comptes transcrits (pour ne rien inventer) : quand
 * un compte à N chiffres a des sous-comptes explicitement listés dans le
 * texte officiel, seuls ces sous-comptes sont repris (le compte parent n'est
 * pas dupliqué comme ligne distincte, il devient un Total). Quand aucune
 * subdivision n'est donnée, le compte lui-même est repris tel quel.
 *
 * RÉVISION DU 2026-09-05 · le semis avait été bâti sur le CHAPITRE 3 du
 * référentiel (fonctionnement des comptes), qui abrège souvent ses
 * subdivisions ou les résume (« 4791 à 4798, symétrique du 478 »). Confronté
 * au PLAN DES COMPTES lui-même (Partie 2, ch. 2, pages 77 à 106 du Journal
 * officiel), il s'arrêtait au divisionnaire à 3 chiffres pour presque toute
 * la classe 6 et une partie de la classe 7, là où le plan descend au
 * quatrième chiffre. Les 207 sous-comptes correspondants sont désormais
 * semés, et leurs parents sont passés en Total. Le plan est donc repris tel
 * qu'il est, à 2, 3, 4 et 5 chiffres, sans niveau escamoté.
 *
 * Les comptes 92 à 99 (comptabilité analytique de gestion) sont semés comme
 * en-têtes de division, sans compte d'imputation en dessous : le plan les
 * énumère mais ne les développe jamais, il les laisse au « libre usage » de
 * l'entité. Ils ne servent qu'en comptabilité analytique, nulle part
 * ailleurs · c'est au cabinet d'y créer ses propres comptes de coûts.
 *
 * Deux points où le plan et le chapitre 3 divergent, tranchés en faveur du
 * PLAN puisque c'est lui la nomenclature :
 *  - 654 · le plan donne « 6541 non affectés, 6545 affectés », le chapitre 3
 *    écrit « 6541 non affectés, 6542 affectés ». Retenu 6541/6545.
 *  - 479 · le plan numérote 4797 « Différences d'évaluation sur instruments
 *    de trésorerie » là où le 478 symétrique porte 4786. L'asymétrie est
 *    celle du texte, page 90 ; elle est reproduite telle quelle.
 *
 * Report à-nouveau (§3.1) : SOLDE pour les comptes de bilan (classes 1,2,3,5,
 * et les subdivisions non-tiers de la classe 4) ; DETAIL pour les comptes de
 * tiers nécessitant un suivi fin par lettrage (classe 4, divisions 40/41/45/
 * 46/47 · fournisseurs, adhérents-clients, fondateurs-apporteurs, bailleurs,
 * débiteurs-créditeurs divers) ; AUCUN pour les comptes de gestion soldés à
 * la clôture (classes 6, 7, 8) ; SOLDE pour les comptes hors bilan/résultat
 * de la classe 9 (90/91, mémoire des contributions volontaires en nature).
 *
 * Anomalies du texte source, non corrigées silencieusement (voir le skill) :
 * - Classe 1 (§ tableau de synthèse vs plan détaillé) : numérotation 16/17/18
 *   retenue ici selon le plan détaillé (source la plus complète), voir le
 *   commentaire de `partie2-ch2-plan-comptes.md`.
 * - "452 Fondations et assimilées (4521, 4522, 4555)" : le troisième code
 *   "4555" est numériquement incohérent avec la racine 452 (452x attendu) et
 *   coïncide avec le code du compte 455 (Organisations syndicales). Retenu
 *   ici comme "452500" (correction d'évidence de frappe, flag conservé).
 * - "832 dons en nature H.A.O. à distribuer (8311 non affectés, 8315
 *   affectés)" : l'anomalie de numérotation 8311/8315 est déjà signalée dans
 *   le skill sycebnl (`partie2-ch3-classe8-comptes80-89.md`) ; codes repris
 *   tels quels.
 */

const SOLDE = ModeReportANouveau.SOLDE;
const AUCUN = ModeReportANouveau.AUCUN;
const DETAIL = ModeReportANouveau.DETAIL;

type LigneSeed = {
  numero: string;
  intitule: string;
  classe: ClasseCompte;
  modeReportANouveau: ModeReportANouveau;
  typeCompte?: TypeCompteDetailTotal;
};

function c(classe: ClasseCompte, mode: ModeReportANouveau, entries: Array<[string, string]>): LigneSeed[] {
  return entries.map(([numero, intitule]) => ({ numero, intitule, classe, modeReportANouveau: mode }));
}

/**
 * COMPTES PRINCIPAUX (2 chiffres) · les 76 en-têtes de division du plan
 * SYCEBNL (Partie 2, ch. 2, section 3 : « les comptes principaux à deux (02)
 * chiffres »), ajoutés le 2026-08-29 à la demande explicite de l'utilisateur
 * (« réintègre aussi les comptes à 2 chiffres en gras »).
 *
 * Numéro NON complété à 8 chiffres, à la différence de tous les autres
 * comptes du fichier · deux raisons, l'une suffirait déjà :
 *
 *  1. COLLISION. Compléter "90" à 8 chiffres donnerait "90000000" · or ce
 *     numéro est DÉJÀ pris par le compte 900 « secours en nature » (900 +
 *     cinq zéros = 90000000). Semer les deux violerait la contrainte
 *     d'unicité [tenantId, numero].
 *  2. AGRÉGATION CASSÉE. Ces comptes sont de type TOTAL (regroupement par
 *     racine, §3.1) · leur solde s'obtient en sommant tout compte Détail
 *     dont le numéro COMMENCE PAR le leur (`EcritureService.balance()`,
 *     `numero.startsWith(c.numero)`). "10110000".startsWith("10") est vrai ;
 *     "10110000".startsWith("10000000") est faux. Le numéro complété romprait
 *     donc l'agrégation, et l'en-tête afficherait toujours un solde à zéro.
 *
 * Le numéro à 2 chiffres reste néanmoins la valeur exacte du code officiel :
 * ce n'est pas une troncature, c'est le compte principal tel que le texte le
 * numérote lui-même.
 *
 * Protection : un compte créé via l'API (`CreerCompteDto.numero`) est borné
 * à 3-13 chiffres · un numéro à 2 chiffres est donc structurellement
 * impossible à obtenir autrement que par ce semis. `PlanComptesPage`
 * s'appuie sur cette propriété pour verrouiller ces lignes en édition (voir
 * son commentaire).
 */
function total(numero: string, intitule: string, classe: ClasseCompte, mode: ModeReportANouveau): LigneSeed {
  return { numero, intitule, classe, modeReportANouveau: mode, typeCompte: TypeCompteDetailTotal.TOTAL };
}

// ─────────────────────────────────────────────────────────────────────────
// CLASSE 1 · COMPTES DE RESSOURCES DURABLES (bilan, report SOLDE)
// ─────────────────────────────────────────────────────────────────────────
const classe1: LigneSeed[] = c(ClasseCompte.CLASSE_1, SOLDE, [
  // 10 Dotation
  ['10110000', 'Dotation non consomptible sans droit de reprise · en numéraire'],
  ['10150000', 'Dotation non consomptible sans droit de reprise · en nature'],
  ['10210000', 'Dotation non consomptible avec droit de reprise · en numéraire'],
  ['10250000', 'Dotation non consomptible avec droit de reprise · en nature'],
  ['10300000', "Droit d'entrée"],
  ['10410000', 'Dotation consomptible'],
  ['10490000', 'Dotation consomptible inscrite au compte de résultat'],
  ['10611000', 'Écarts de réévaluation sur des biens sans droit de reprise · immobilisations corporelles'],
  ['10612000', 'Écarts de réévaluation sur des biens sans droit de reprise · immobilisations financières'],
  ['10621000', 'Écarts de réévaluation sur des biens avec droit de reprise · immobilisations corporelles'],
  ['10622000', 'Écarts de réévaluation sur des biens avec droit de reprise · immobilisations financières'],
  // 11 Réserves
  ['11200000', 'Réserves statutaires ou contractuelles'],
  ['11800000', 'Autres réserves'],
  // 12 Report à nouveau
  ['12100000', 'Report à nouveau des excédents'],
  ['12800000', "Résultat net en instance d'affectation"],
  ['12900000', 'Report à nouveau des déficits'],
  // 13 Résultat net de l'exercice
  ['13100000', "Excédent de l'exercice"],
  ['13900000', "Déficit de l'exercice"],
  // 14 Subventions d'investissement
  ['14110000', "Subventions d'équipement · État"],
  ['14120000', "Subventions d'équipement · Régions"],
  ['14130000', "Subventions d'équipement · Départements"],
  ['14140000', "Subventions d'équipement · Communes et collectivités publiques décentralisées"],
  ['14150000', "Subventions d'équipement · Entités publiques ou mixtes"],
  ['14160000', "Subventions d'équipement · Entités et organismes privés"],
  ['14170000', "Subventions d'équipement · Organismes internationaux"],
  ['14180000', "Subventions d'équipement · Autres"],
  ['14800000', "Autres subventions d'investissement"],
  // 15 Provisions réglementées et fonds assimilés
  ['15400000', 'Provisions spéciales de réévaluation'],
  ['15800000', 'Autres provisions réglementées et fonds assimilés'],
  // 16 Fonds affectés
  ['16100000', 'Fonds projet de développement · avances de fonds à justifier'],
  ['16200000', "Fonds affectés aux investissements du projet de développement · bailleurs de fonds"],
  ['16300000', "Fonds affectés aux investissements du projet de développement · l'État"],
  ['16400000', "Fonds affectés aux investissements des autres organismes de financement assimilés"],
  ['16500000', 'Fonds affectés à un projet spécifique'],
  ['16710000', "Fonds provenant de dons et legs d'immobilisations · affectés"],
  ['16720000', "Fonds provenant de dons et legs d'immobilisations · non affectés"],
  ['16790000', "Fonds provenant de dons et legs d'immobilisations · engagements auprès donateur"],
  ['16800000', 'Autres fonds affectés'],
  ['16900000', 'Fonds affectés à recevoir'],
  // 17 Fonds reportés
  ['17100000', "Donation temporaire d'usufruit"],
  ['17200000', "Donations et legs non encore reçus d'immobilisations destinées à la vente"],
  ['17800000', 'Autres fonds reportés'],
  // 18 Emprunts et dettes assimilées
  ['18100000', 'Emprunts obligataires'],
  ['18200000', 'Emprunts et dettes auprès des établissements de crédit'],
  ['18300000', "Avances reçues de l'État"],
  ['18510000', 'Dépôts et cautionnements reçus · dépôts'],
  ['18520000', 'Dépôts et cautionnements reçus · cautionnements'],
  ['18610000', 'Intérêts courus sur emprunts obligataires'],
  ['18620000', 'Intérêts courus sur emprunts et dettes auprès des établissements de crédit'],
  ['18630000', "Intérêts courus sur avances reçues de l'État"],
  ['18650000', 'Intérêts courus sur dépôts et cautionnements reçus'],
  ['18680000', 'Intérêts courus sur autres emprunts et dettes'],
  ['18710000', 'Dettes de location-acquisition · crédit-bail immobilier'],
  ['18720000', 'Dettes de location-acquisition · crédit-bail mobilier'],
  ['18730000', 'Dettes de location-acquisition · location-vente'],
  ['18760000', 'Dettes de location-acquisition · intérêts courus'],
  ['18800000', 'Autres emprunts et dettes'],
  // 19 Provisions pour risques et charges
  ['19100000', 'Provisions pour litiges'],
  ['19200000', 'Provisions pour charges sur donations et legs'],
  ['19400000', 'Provisions pour pertes de change'],
  ['19600000', 'Provisions pour pensions et obligations similaires'],
  ['19810000', 'Autres provisions pour risques et charges · amendes et pénalités'],
  ['19840000', 'Autres provisions pour risques et charges · démantèlement et remise en état'],
  ['19880000', 'Autres provisions pour risques et charges · divers risques et charges'],
]);

// ─────────────────────────────────────────────────────────────────────────
// CLASSE 2 · COMPTES D'ACTIF IMMOBILISÉ (bilan, report SOLDE)
// ─────────────────────────────────────────────────────────────────────────
const classe2: LigneSeed[] = c(ClasseCompte.CLASSE_2, SOLDE, [
  // 20 Immobilisations destinées à la vente (dons/legs non reçus) et usufruit temporaire
  ['20110000', 'Immobilisations incorporelles destinées à la vente · usufruit temporaire'],
  ['20120000', 'Immobilisations incorporelles destinées à la vente · brevets, licences, concessions et droits similaires'],
  ['20130000', 'Immobilisations incorporelles destinées à la vente · logiciels et sites internet'],
  ['20140000', 'Immobilisations incorporelles destinées à la vente · marques'],
  ['20170000', 'Immobilisations incorporelles destinées à la vente · autres'],
  ['20200000', 'Terrains destinés à la vente (dons et legs non encore reçus)'],
  ['20300000', 'Bâtiments destinés à la vente (dons et legs non encore reçus)'],
  ['20400000', 'Matériels destinés à la vente (dons et legs non encore reçus)'],
  ['20500000', 'Titres de participations destinés à la vente (dons et legs non encore reçus)'],
  // 21 Immobilisations incorporelles
  ['21210000', 'Brevets'],
  ['21220000', 'Licences'],
  ['21230000', 'Concessions de service public'],
  ['21280000', 'Autres concessions et droits similaires'],
  ['21310000', 'Logiciels'],
  ['21320000', 'Sites internet'],
  ['21400000', 'Marques'],
  ['21810000', 'Autres droits et valeurs incorporels · indemnités de transfert aux joueurs'],
  ['21930000', 'Immobilisations incorporelles en cours · logiciels et sites internet'],
  ['21980000', 'Immobilisations incorporelles en cours · autres droits et valeurs incorporels'],
  // 22 Terrains
  ['22110000', 'Terrains agricoles et forestiers · exploitation agricole'],
  ['22120000', 'Terrains agricoles et forestiers · exploitation forestière'],
  ['22180000', 'Terrains agricoles et forestiers · autres terrains'],
  ['22210000', 'Terrains nus · terrains à bâtir'],
  ['22280000', 'Terrains nus · autres terrains nus'],
  ['22310000', 'Terrains bâtis · pour bâtiments industriels et agricoles'],
  ['22320000', 'Terrains bâtis · pour bâtiments administratifs et commerciaux'],
  ['22340000', 'Terrains bâtis · pour bâtiments affectés aux autres opérations professionnelles'],
  ['22350000', 'Terrains bâtis · pour bâtiments affectés aux autres opérations non professionnelles'],
  ['22380000', 'Terrains bâtis · autres terrains bâtis'],
  ['22410000', 'Travaux de mise en valeur des terrains · plantation d\'arbres et d\'arbustes'],
  ['22450000', 'Travaux de mise en valeur des terrains · améliorations du fonds'],
  ['22480000', 'Travaux de mise en valeur des terrains · autres travaux'],
  ['22610000', 'Terrains aménagés · parkings'],
  ['22810000', 'Autres terrains · immeubles de placement'],
  ['22850000', 'Autres terrains · logements affectés au personnel'],
  ['22860000', 'Autres terrains · location-acquisition'],
  ['22880000', 'Autres terrains · divers terrains'],
  ['22910000', 'Aménagements de terrains en cours · terrains agricoles et forestiers'],
  ['22920000', 'Aménagements de terrains en cours · terrains nus'],
  ['22980000', 'Aménagements de terrains en cours · autres terrains'],
  // 23 Bâtiments, installations techniques et agencements
  ['23110000', 'Bâtiments industriels sur sol propre'],
  ['23120000', 'Bâtiments agricoles sur sol propre'],
  ['23130000', 'Bâtiments administratifs et commerciaux sur sol propre'],
  ['23140000', 'Bâtiments affectés au logement du personnel sur sol propre'],
  ['23150000', 'Bâtiments-immeubles de placement sur sol propre'],
  ['23160000', 'Bâtiments de location-acquisition sur sol propre'],
  ['23170000', 'Édifices religieux et assimilés sur sol propre'],
  ['23180000', 'Autres bâtiments sur sol propre'],
  ['23210000', 'Bâtiments industriels sur sol d\'autrui'],
  ['23220000', 'Bâtiments agricoles sur sol d\'autrui'],
  ['23230000', 'Bâtiments administratifs et commerciaux sur sol d\'autrui'],
  ['23240000', 'Bâtiments affectés au logement du personnel sur sol d\'autrui'],
  ['23250000', 'Bâtiments-immeubles de placement sur sol d\'autrui'],
  ['23260000', 'Bâtiments de location-acquisition sur sol d\'autrui'],
  ['23270000', 'Édifices religieux et assimilés sur sol d\'autrui'],
  ['23280000', 'Autres bâtiments sur sol d\'autrui'],
  ['23310000', "Ouvrages d'infrastructure · voies de terre"],
  ['23320000', "Ouvrages d'infrastructure · voies de fer"],
  ['23330000', "Ouvrages d'infrastructure · voies d'eau"],
  ['23340000', "Ouvrages d'infrastructure · barrages, digues"],
  ['23350000', "Ouvrages d'infrastructure · pistes d'aérodrome"],
  ['23370000', "Ouvrages d'infrastructure · stades et autres infrastructures sportives"],
  ['23380000', "Ouvrages d'infrastructure · autres ouvrages d'infrastructures"],
  ['23410000', 'Installations complexes spécialisées sur sol propre'],
  ['23420000', "Installations complexes spécialisées sur sol d'autrui"],
  ['23430000', 'Installations à caractère spécifique sur sol propre'],
  ['23440000', "Installations à caractère spécifique sur sol d'autrui"],
  ['23450000', 'Aménagements et agencements des bâtiments'],
  ['23510000', 'Aménagements de bureaux et assimilés · installations générales'],
  ['23580000', 'Aménagements de bureaux et assimilés · autres aménagements de bureaux'],
  ['23810000', 'Autres installations et agencements des édifices religieux et assimilés'],
  ['23820000', 'Autres installations et agencements des stades et autres infrastructures sportives'],
  ['23910000', 'Bâtiments sur sol propre en cours'],
  ['23920000', 'Bâtiments sur sol d\'autrui en cours'],
  ['23930000', "Ouvrages d'infrastructure en cours"],
  ['23940000', 'Aménagements, agencements et installations techniques en cours'],
  ['23950000', 'Aménagements de bureaux en cours'],
  ['23960000', 'Bâtiments en cours · immeubles de placement'],
  ['23980000', 'Autres installations et agencements en cours'],
  // 24 Matériel, mobilier et actifs biologiques
  ['24110000', 'Matériel industriel'],
  ['24120000', 'Outillage industriel'],
  ['24130000', 'Matériel commercial'],
  ['24140000', 'Outillage commercial'],
  ['24160000', 'Matériel et outillage industriel et commercial de location-acquisition'],
  ['24210000', 'Matériel agricole'],
  ['24220000', 'Outillage agricole'],
  ['24260000', 'Matériel et outillage agricole de location-acquisition'],
  ['24300000', "Matériel d'emballage récupérable et identifiable"],
  ['24410000', 'Matériel et mobilier de bureau'],
  ['24420000', 'Matériel et mobilier informatique et bureautique'],
  ['24430000', 'Matériel et mobilier religieux'],
  ['24440000', 'Matériel et mobilier sportifs'],
  ['24450000', 'Matériel et mobilier · immeubles de placement'],
  ['24460000', 'Matériel et mobilier de location-acquisition'],
  ['24470000', 'Matériel et mobilier des logements du personnel'],
  ['24510000', 'Matériel de transport automobile'],
  ['24520000', 'Matériel de transport ferroviaire'],
  ['24530000', 'Matériel de transport fluvial, lagunaire'],
  ['24540000', 'Matériel de transport naval'],
  ['24550000', 'Matériel de transport aérien'],
  ['24560000', 'Matériel de transport de location-acquisition'],
  ['24570000', 'Matériel de transport hippomobile'],
  ['24580000', 'Autres matériels de transport'],
  ['24610000', 'Actifs biologiques · cheptel, animaux de trait'],
  ['24620000', 'Actifs biologiques · cheptel, animaux reproducteurs'],
  ['24630000', 'Actifs biologiques · animaux de garde'],
  ['24650000', 'Actifs biologiques · plantations agricoles'],
  ['24680000', 'Actifs biologiques · autres'],
  ['24710000', 'Agencements, aménagements du matériel'],
  ['24720000', 'Agencements, aménagements des actifs biologiques'],
  ['24780000', 'Agencements, aménagements · autres'],
  ['24810000', 'Autres matériels et mobiliers · collections et œuvres d\'art'],
  ['24880000', 'Autres matériels et mobiliers · divers'],
  ['24910000', 'Matériel et outillage industriel et commercial en cours'],
  ['24920000', 'Matériel et outillage agricole en cours'],
  ['24930000', "Matériel d'emballage récupérable et identifiable en cours"],
  ['24940000', 'Matériel et mobilier de bureau en cours'],
  ['24950000', 'Matériel de transport en cours'],
  ['24960000', 'Actifs biologiques en cours'],
  ['24970000', 'Agencements, aménagements du matériel et actifs biologiques en cours'],
  ['24980000', 'Autres matériels et actifs biologiques en cours'],
  // 25 Avances et acomptes versés sur immobilisations
  ['25100000', 'Avances et acomptes versés sur immobilisations incorporelles'],
  ['25200000', 'Avances et acomptes versés sur immobilisations corporelles'],
  // 26 Titres de participation
  ['26100000', 'Titres de participation'],
  ['26500000', 'Participations dans des organismes professionnels'],
  ['26600000', "Parts dans des groupements d'intérêt économique (G.I.E.)"],
  ['26800000', 'Autres titres de participation'],
  // 27 Autres immobilisations financières
  ['27110000', 'Prêts et créances · participatifs'],
  ['27130000', 'Prêts et créances · billets de fonds'],
  ['27150000', 'Prêts et créances · titres prêtés'],
  ['27180000', 'Prêts et créances · autres'],
  ['27210000', 'Prêts au personnel · immobiliers'],
  ['27220000', "Prêts au personnel · mobiliers et d'installation"],
  ['27280000', 'Prêts au personnel · autres'],
  ['27310000', "Créances sur l'État · retenues de garantie"],
  ['27330000', "Créances sur l'État · fonds réglementé"],
  ['27380000', "Créances sur l'État · autres"],
  ['27410000', 'Titres immobilisés · T.I.A.P.'],
  ['27420000', 'Titres immobilisés · titres participatifs'],
  ['27430000', "Titres immobilisés · certificats d'investissement"],
  ['27440000', 'Titres immobilisés · parts de F.C.P.'],
  ['27450000', 'Titres immobilisés · obligations'],
  ['27480000', 'Titres immobilisés · autres'],
  ['27510000', 'Dépôts et cautionnements versés · loyers d\'avance'],
  ['27520000', 'Dépôts et cautionnements versés · électricité'],
  ['27530000', 'Dépôts et cautionnements versés · eau'],
  ['27540000', 'Dépôts et cautionnements versés · gaz'],
  ['27550000', 'Dépôts et cautionnements versés · téléphone/télécopie'],
  ['27580000', 'Dépôts et cautionnements versés · autres'],
  ['27610000', 'Intérêts courus · prêts et créances'],
  ['27620000', 'Intérêts courus · prêts au personnel'],
  ['27630000', "Intérêts courus · créances sur l'État"],
  ['27640000', 'Intérêts courus · titres immobilisés'],
  ['27650000', 'Intérêts courus · dépôts et cautionnements versés'],
  ['27680000', 'Intérêts courus · immobilisations financières diverses'],
  ['27810000', 'Immobilisations financières diverses · créances diverses'],
  ['27840000', 'Immobilisations financières diverses · banques dépôts à terme'],
  ['27850000', 'Immobilisations financières diverses · or et métaux précieux'],
  ['27880000', 'Immobilisations financières diverses · autres'],
  // 28 Amortissements
  ['28000000', "Amortissements d'usufruit temporaire"],
  ['28120000', 'Amortissements des immobilisations incorporelles · brevets, licences, concessions'],
  ['28130000', 'Amortissements des immobilisations incorporelles · logiciels et sites internet'],
  ['28140000', 'Amortissements des immobilisations incorporelles · marques'],
  ['28170000', 'Amortissements des immobilisations incorporelles · indemnités de transfert aux joueurs'],
  ['28180000', 'Amortissements des immobilisations incorporelles · autres droits et valeurs incorporels'],
  ['28240000', 'Amortissements des terrains · travaux de mise en valeur des terrains'],
  ['28310000', 'Amortissements des bâtiments · sur sol propre'],
  ['28320000', "Amortissements des bâtiments · sur sol d'autrui"],
  ['28330000', "Amortissements des bâtiments · ouvrages d'infrastructure"],
  ['28340000', 'Amortissements des bâtiments · aménagements, agencements et installations techniques'],
  ['28350000', 'Amortissements des bâtiments · aménagements de bureaux'],
  ['28380000', 'Amortissements des bâtiments · autres installations et agencements'],
  ['28410000', 'Amortissements du matériel · industriel et commercial'],
  ['28420000', 'Amortissements du matériel · agricole'],
  ['28430000', 'Amortissements du matériel · emballage récupérable'],
  ['28440000', 'Amortissements du matériel · matériel et mobilier'],
  ['28450000', 'Amortissements du matériel · matériel de transport'],
  ['28460000', 'Amortissements du matériel · actifs biologiques'],
  ['28470000', 'Amortissements du matériel · agencements/aménagements du matériel et actifs biologiques'],
  ['28480000', 'Amortissements du matériel · autres matériels'],
  // 29 Dépréciations des immobilisations
  ['29010000', 'Dépréciations · usufruit temporaire'],
  ['29020000', 'Dépréciations · immobilisations destinées à la vente'],
  ['29120000', 'Dépréciations des immobilisations incorporelles · brevets, licences, concessions'],
  ['29130000', 'Dépréciations des immobilisations incorporelles · logiciels et sites internet'],
  ['29140000', 'Dépréciations des immobilisations incorporelles · marques'],
  ['29180000', 'Dépréciations des immobilisations incorporelles · autres droits et valeurs incorporels'],
  ['29190000', 'Dépréciations des immobilisations incorporelles en cours'],
  ['29210000', 'Dépréciations des terrains · agricoles et forestiers'],
  ['29220000', 'Dépréciations des terrains · nus'],
  ['29230000', 'Dépréciations des terrains · bâtis'],
  ['29240000', 'Dépréciations des terrains · travaux de mise en valeur'],
  ['29260000', 'Dépréciations des terrains · aménagés'],
  ['29280000', 'Dépréciations des terrains · autres'],
  ['29290000', 'Dépréciations des terrains · aménagements en cours'],
  ['29310000', 'Dépréciations des bâtiments · sur sol propre'],
  ['29320000', "Dépréciations des bâtiments · sur sol d'autrui"],
  ['29330000', "Dépréciations des bâtiments · ouvrages d'infrastructures"],
  ['29340000', 'Dépréciations des bâtiments · aménagements/agencements/installations techniques'],
  ['29350000', 'Dépréciations des bâtiments · aménagements de bureaux'],
  ['29380000', 'Dépréciations des bâtiments · autres installations et agencements'],
  ['29390000', 'Dépréciations des bâtiments et installations en cours'],
  ['29410000', 'Dépréciations du matériel · industriel et commercial'],
  ['29420000', 'Dépréciations du matériel · agricole'],
  ['29430000', 'Dépréciations du matériel · emballage récupérable'],
  ['29440000', 'Dépréciations du matériel · matériel et mobilier'],
  ['29450000', 'Dépréciations du matériel · matériel de transport'],
  ['29460000', 'Dépréciations du matériel · actifs biologiques'],
  ['29470000', 'Dépréciations du matériel · agencements et aménagements du matériel et des actifs biologiques'],
  ['29480000', 'Dépréciations du matériel · autres matériels'],
  ['29490000', 'Dépréciations du matériel en cours'],
  ['29510000', 'Dépréciations des avances et acomptes versés · incorporelles'],
  ['29520000', 'Dépréciations des avances et acomptes versés · corporelles'],
  ['29610000', 'Dépréciations des titres de participation'],
  ['29650000', 'Dépréciations des participations dans des organismes professionnels'],
  ['29660000', "Dépréciations des parts dans des G.I.E."],
  ['29680000', 'Dépréciations des autres titres de participation'],
  ['29710000', 'Dépréciations des autres immobilisations financières · prêts et créances'],
  ['29720000', 'Dépréciations des autres immobilisations financières · prêts au personnel'],
  ['29730000', "Dépréciations des autres immobilisations financières · créances sur l'État"],
  ['29740000', 'Dépréciations des autres immobilisations financières · titres immobilisés'],
  ['29750000', 'Dépréciations des autres immobilisations financières · dépôts et cautionnements versés'],
  ['29770000', "Dépréciations des créances rattachées à des participations et avances à des G.I.E."],
  ['29780000', 'Dépréciations des créances financières diverses'],
]);

// ─────────────────────────────────────────────────────────────────────────
// CLASSE 3 · COMPTES DE STOCKS (bilan, report SOLDE)
// ─────────────────────────────────────────────────────────────────────────
const classe3: LigneSeed[] = c(ClasseCompte.CLASSE_3, SOLDE, [
  ['31100000', "Biens liés à l'activité A"],
  ['31200000', "Biens liés à l'activité B"],
  ['32100000', 'Marchandises A'],
  ['32200000', 'Marchandises B'],
  ['32300000', 'Matières A'],
  ['32400000', 'Matières B'],
  ['32500000', 'Fournitures liées'],
  ['33100000', 'Matières consommables'],
  ['33300000', 'Fournitures de magasin'],
  ['33400000', 'Fournitures de bureau'],
  ['33510000', 'Emballages perdus'],
  ['33520000', 'Emballages récupérables non identifiables'],
  ['33530000', 'Emballages à usage mixte'],
  ['33580000', 'Autres emballages'],
  ['33800000', 'Autres matières'],
  ['34100000', 'Dons en nature · non affectés'],
  ['34500000', 'Dons en nature · affectés'],
  ['35000000', 'Produits et services en cours'],
  ['36100000', 'Produits finis A'],
  ['36200000', 'Produits finis B'],
  ['36310000', 'Actifs biologiques · animaux'],
  ['36320000', 'Actifs biologiques · végétaux'],
  ['36380000', 'Actifs biologiques · autres stocks'],
  ['36700000', 'Produits intermédiaires et résiduels'],
  ['37100000', "Biens liés à l'activité en cours de route"],
  ['37200000', 'Marchandises, matières et fournitures en cours de route'],
  ['37300000', 'Autres approvisionnements en cours de route'],
  ['37600000', 'Produits finis en cours de route'],
  ['37710000', 'Stocks en consignation'],
  ['37720000', 'Stocks en dépôt'],
  ['37800000', "Stock provenant d'immobilisations mises hors services ou au rebut"],
  ['38100000', 'Dons en nature H.A.O. · non affectés'],
  ['38500000', 'Dons en nature H.A.O. · affectés'],
  ['39100000', "Dépréciations des stocks · biens liés à l'activité"],
  ['39200000', 'Dépréciations des stocks · marchandises, matières premières et fournitures liées'],
  ['39300000', 'Dépréciations des stocks · autres approvisionnements'],
  ['39600000', 'Dépréciations des stocks · produits finis, intermédiaires et résiduels'],
  ['39700000', 'Dépréciations des stocks · en cours de route, consignation ou dépôt'],
]);

// ─────────────────────────────────────────────────────────────────────────
// CLASSE 4 · COMPTES DE TIERS
// Divisions 40/41/45/46/47 (tiers avec grand-livre auxiliaire) : report DETAIL.
// Divisions 42/43/44/48/49 : report SOLDE.
// ─────────────────────────────────────────────────────────────────────────
const classe4Detail: LigneSeed[] = c(ClasseCompte.CLASSE_4, DETAIL, [
  // 40 Fournisseurs et comptes rattachés
  ['40110000', 'Fournisseurs'],
  ['40130000', 'Fournisseurs · sous-traitants'],
  ['40160000', 'Fournisseurs · réserve de propriété'],
  ['40170000', 'Fournisseurs · retenues de garantie'],
  ['40210000', 'Fournisseurs, effets à payer'],
  ['40230000', 'Fournisseurs, effets à payer · sous-traitants'],
  ['40810000', 'Fournisseurs, factures non parvenues'],
  ['40830000', 'Fournisseurs, factures non parvenues · sous-traitants'],
  ['40860000', 'Fournisseurs, factures non parvenues · intérêts courus'],
  ['40910000', 'Fournisseurs débiteurs · avances et acomptes versés'],
  ['40930000', 'Fournisseurs débiteurs · sous-traitants, avances et acomptes'],
  ['40940000', 'Fournisseurs débiteurs · créances pour emballages et matériels à rendre'],
  ['40980000', 'Fournisseurs débiteurs · rabais, remises, ristournes et autres avoirs à obtenir'],
  // 41 Adhérents, clients-usagers et comptes rattachés
  ['41100000', 'Adhérents'],
  ['41200000', 'Clients-usagers'],
  ['41310000', 'Adhérents, clients-usagers · chèques impayés'],
  ['41320000', 'Adhérents, clients-usagers · chèques impayés (2)'],
  ['41330000', 'Adhérents, clients-usagers · autres valeurs impayées'],
  ['41380000', 'Adhérents, clients-usagers · autres valeurs impayées'],
  ['41610000', 'Créances · cotisations litigieuses ou douteuses'],
  ['41620000', 'Créances · adhérents, clients-usagers litigieuses ou douteuses'],
  ['41810000', 'Adhérents, clients-usagers · appels de fonds à établir'],
  ['41820000', 'Adhérents, clients-usagers · factures à établir'],
  ['41860000', 'Adhérents, clients-usagers · intérêts courus'],
  ['41910000', 'Adhérents, clients-usagers créditeurs · avances reçues'],
  ['41920000', 'Adhérents, clients-usagers créditeurs · avances et acomptes reçus'],
  ['41940000', 'Adhérents, clients-usagers créditeurs · dettes pour emballages et matériels consignés'],
  ['41980000', 'Adhérents, clients-usagers créditeurs · rabais, remises, ristournes et autres avoirs à accorder'],
  // 45 Fondateurs, apporteurs et comptes courants
  ['45110000', 'Associations et assimilées · apporteurs en nature'],
  ['45120000', 'Associations et assimilées · apporteurs en numéraire'],
  ['45150000', 'Associations et assimilées · adhérents/dirigeants, comptes courants'],
  ['45210000', 'Fondations et assimilées · apporteurs en nature'],
  ['45220000', 'Fondations et assimilées · apporteurs en numéraire'],
  // [texte officiel] anomalie : la source imprime "4555" comme 3e code sous 452
  // (Fondations et assimilées), numériquement incohérent avec la racine 452 ·
  // retenu ici comme "4525" (cf. commentaire d'en-tête du fichier).
  ['45250000', 'Fondations et assimilées · fondateurs, dirigeants, comptes courants'],
  ['45310000', 'Ordres professionnels · apporteurs en nature'],
  ['45320000', 'Ordres professionnels · apporteurs en numéraire'],
  ['45350000', 'Ordres professionnels · membres, dirigeants, comptes courants'],
  ['45410000', 'Organisations politiques · apporteurs en nature'],
  ['45420000', 'Organisations politiques · apporteurs en numéraire'],
  ['45450000', 'Organisations politiques · adhérents, dirigeants, comptes courants'],
  ['45510000', 'Organisations syndicales · apporteurs en nature'],
  ['45520000', 'Organisations syndicales · apporteurs en numéraire'],
  ['45550000', 'Organisations syndicales · adhérents, dirigeants, comptes courants'],
  ['45610000', 'Organisations religieuses, apporteurs · congrégations religieuses et assimilées'],
  ['45620000', 'Organisations religieuses, apporteurs · Waqf et assimilés'],
  ['45710000', 'Mécènes et assimilés'],
  ['45720000', 'Bénévoles et assimilés'],
  ['45800000', 'Autres fondateurs et apporteurs'],
  // 46 Bailleurs, État et autres organismes, fonds d'administration
  ['46200000', "Bailleurs · projet de développement, fonds d'administration"],
  ['46300000', "État · projet de développement, fonds d'administration"],
  ['46400000', "Autres tiers ou organismes de financement assimilés · projet de développement, fonds d'administration"],
  ['46920000', "Fonds d'administration à recevoir · bailleurs"],
  ['46930000', "Fonds d'administration à recevoir · État"],
  ['46940000', "Fonds d'administration à recevoir · autres tiers ou organismes de financement assimilés"],
  // 47 Débiteurs et créditeurs divers
  ['47110000', 'Débiteurs divers'],
  ['47120000', 'Créditeurs divers'],
  ['47130000', 'Créditeurs · dons en nature courants non consommés'],
  ['47170000', 'Débiteurs divers · retenues de garantie'],
  ['47190000', "Bons de souscription d'actions et d'obligations"],
  ['47210000', 'Créances sur cessions de titres de placement'],
  ['47260000', 'Versements restant à effectuer sur titres de placement'],
  ['47310000', 'Subventions à recevoir · investissement'],
  ['47320000', 'Subventions à recevoir · exploitation'],
  ['47330000', 'Subventions à recevoir · équilibre'],
  ['47380000', 'Subventions à recevoir · autres'],
  ['47390000', 'Subventions à reverser'],
  ['47460000', 'Compte de répartition périodique des charges'],
  ['47470000', 'Compte de répartition périodique des produits'],
  ['47500000', 'Générosités financières à recevoir'],
  ['47600000', "Charges constatées d'avance"],
  ['47700000', 'Produits constatés d\'avance'],
  ['47811000', 'Écarts de conversion actif · diminution des créances d\'exploitation'],
  ['47818000', 'Écarts de conversion actif · diminution des créances H.A.O.'],
  ['47820000', 'Écarts de conversion actif · diminution des créances financières'],
  ['47831000', 'Écarts de conversion actif · augmentation des dettes d\'exploitation'],
  ['47838000', 'Écarts de conversion actif · augmentation des dettes H.A.O.'],
  ['47840000', 'Écarts de conversion actif · augmentation des dettes financières'],
  ['47860000', 'Écarts de conversion actif · différences d\'évaluation sur instruments de trésorerie'],
  ['47880000', 'Écarts de conversion actif · différences compensées par couverture de change'],
  // Le chapitre 3 se contente de « 4791 à 4798, symétrique du 478 » sans
  // détailler les intitulés · le plan des comptes officiel (Partie 2 ch. 2,
  // p. 90 du Journal officiel) les donne, lui, un par un. Ce sont ces
  // intitulés-là qui sont repris ici, en symétrie exacte du 478 ci-dessus.
  ['47911000', "Écarts de conversion passif · augmentation des créances d'exploitation"],
  ['47918000', 'Écarts de conversion passif · augmentation des créances H.A.O.'],
  ['47920000', 'Écarts de conversion passif · augmentation des créances financières'],
  ['47931000', 'Écarts de conversion passif · diminution des dettes d\'exploitation'],
  ['47938000', 'Écarts de conversion passif · diminution des dettes H.A.O.'],
  ['47940000', 'Écarts de conversion passif · diminution des dettes financières'],
  ['47970000', "Écarts de conversion passif · différences d'évaluation sur instruments de trésorerie"],
  ['47980000', 'Écarts de conversion passif · différences compensées par couverture de change'],
  ['48110000', "Fournisseurs d'investissements · immobilisations incorporelles"],
  ['48120000', "Fournisseurs d'investissements · immobilisations corporelles"],
  ['48130000', "Fournisseurs d'investissements · versements restant à effectuer sur titres non libérés"],
  ['48161000', "Fournisseurs d'investissements · réserve de propriété (incorporelles)"],
  ['48162000', "Fournisseurs d'investissements · réserve de propriété (corporelles)"],
  ['48171000', "Fournisseurs d'investissements · retenues de garantie (incorporelles)"],
  ['48172000', "Fournisseurs d'investissements · retenues de garantie (corporelles)"],
  ['48181000', "Fournisseurs d'investissements · factures non parvenues (incorporelles)"],
  ['48182000', "Fournisseurs d'investissements · factures non parvenues (corporelles)"],
  ['48400000', 'Autres dettes hors activités ordinaires'],
  ['48510000', 'Créances sur cessions d\'immobilisations incorporelles'],
  ['48520000', 'Créances sur cessions d\'immobilisations corporelles'],
  ['48560000', 'Créances sur cessions d\'immobilisations financières'],
  ['48570000', 'Créances sur cessions d\'immobilisations · retenues de garantie'],
  ['48580000', 'Créances sur cessions d\'immobilisations · factures à établir'],
  ['48610000', 'Dettes des legs et dons d\'immobilisations'],
  ['48650000', 'Créances des legs et dons d\'immobilisations'],
  ['48810000', 'Créditeurs · dons en nature H.A.O. non consommés'],
]);

const classe4Solde: LigneSeed[] = c(ClasseCompte.CLASSE_4, SOLDE, [
  // 42 Personnel
  ['42110000', 'Personnel · avances'],
  ['42120000', 'Personnel · acomptes'],
  ['42130000', 'Personnel · frais avancés et fournitures au personnel'],
  ['42200000', 'Rémunérations dues au personnel'],
  ['42310000', 'Personnel · oppositions'],
  ['42320000', 'Personnel · saisies arrêts'],
  ['42330000', 'Personnel · avis à tiers détenteur'],
  ['42410000', 'Œuvres sociales internes · assistance médicale'],
  ['42420000', 'Œuvres sociales internes · allocations familiales'],
  ['42450000', 'Œuvres sociales internes · organismes sociaux rattachés à l\'entité'],
  ['42480000', 'Œuvres sociales internes · autres'],
  ['42510000', 'Représentants du personnel · délégués'],
  ['42520000', 'Représentants du personnel · syndicats et assimilés'],
  ['42580000', 'Représentants du personnel · autres'],
  ['42700000', 'Personnel · dépôts'],
  ['42810000', 'Personnel · congés à payer'],
  ['42860000', 'Personnel · autres charges à payer'],
  ['42870000', 'Personnel · produits à recevoir'],
  // 43 Organismes sociaux
  ['43110000', 'Sécurité sociale · prestations familiales'],
  ['43120000', 'Sécurité sociale · accidents de travail'],
  ['43180000', 'Sécurité sociale · autres cotisations sociales'],
  ['43210000', 'Caisses de retraite · obligatoire'],
  ['43220000', 'Caisses de retraite · complémentaire'],
  ['43280000', 'Caisses de retraite · autres'],
  ['43310000', 'Autres organismes sociaux · mutuelle de santé'],
  ['43320000', 'Autres organismes sociaux · assurances retraite'],
  ['43330000', 'Autres organismes sociaux · assurances et organismes de santé'],
  // INPP et ONEM · subdivisions de 433 « Autres organismes sociaux » ouvertes
  // par le logiciel, le plan SYCEBNL étant régional et ne nommant aucun
  // organisme congolais. Sans elles, les trois prélèvements sociaux
  // atterrissaient sur un compte 43 unique dont l'échéancier ne pouvait
  // distinguer ni le bénéficiaire ni le taux.
  //  · INPP · formation professionnelle, taux par tranche d'effectif
  //    (4 % public, 3,5 % de 1 à 50, 3 % de 51 à 300, 2 % au-delà de 300),
  //    arrêté interministériel n° 002/CAB/MET/2025 du 24 septembre 2025 ;
  //  · ONEM · aucun texte ne figure au corpus consulté pour le taux
  //    couramment pratiqué de 0,2 % : le compte est ouvert, le taux n'est
  //    PAS inscrit dans le logiciel.
  ['43340000', 'Autres organismes sociaux · INPP (formation professionnelle)'],
  ['43350000', 'Autres organismes sociaux · ONEM (emploi)'],
  ['43810000', 'Organismes sociaux · charges sociales sur gratifications à payer'],
  ['43820000', 'Organismes sociaux · charges sociales sur congés à payer'],
  ['43860000', 'Organismes sociaux · autres charges à payer'],
  ['43870000', 'Organismes sociaux · produits à recevoir'],
  // 44 État et collectivités publiques
  ['44210000', "État, impôts et taxes d'État"],
  ['44220000', 'État, autres impôts et taxes · collectivités publiques'],
  ['44230000', 'État, autres impôts et taxes · recouvrables sur des obligataires'],
  ['44240000', 'État, autres impôts et taxes · recouvrables sur des adhérents et autres'],
  ['44260000', 'État, autres impôts et taxes · droits de douane'],
  ['44280000', 'État, autres impôts et taxes · autres'],
  // Numérotés en "...100" plutôt qu'en "...000" bien qu'aucune subdivision ne
  // soit donnée par le texte officiel pour 443/444/445 : convention déjà
  // utilisée par le module TVA (taux-tva-seed.ts, TauxTvaService), qui
  // recherche ces comptes par numéro exact · ne pas renommer sans mettre à
  // jour ces deux fichiers en même temps.
  ['44310000', 'État, T.V.A. facturée'],
  ['44410000', 'État, T.V.A. due ou crédit de T.V.A.'],
  ['44510000', 'État, T.V.A. récupérable'],
  ['44600000', 'Autres taxes sur le chiffre d\'affaires'],
  ['44710000', 'État, impôts retenus à la source · IGR'],
  ['44720000', 'État, impôts retenus à la source · impôts sur salaires'],
  ['44730000', 'État, impôts retenus à la source · contribution nationale'],
  ['44740000', 'État, impôts retenus à la source · contribution nationale de solidarité'],
  ['44780000', 'État, impôts retenus à la source · autres'],
  // Subdivisions de 4478 ouvertes par le logiciel · le plan SYCEBNL n'ouvre
  // qu'un compte pour des prélèvements dont les ÉCHÉANCES DIFFÈRENT, si bien
  // qu'un registre bâti sur le seul 4478 datait tout au 15 alors que la
  // retenue locative est due dans les dix jours (loi de procédures fiscales,
  // art. 57). Un compte par échéance, donc, faute de quoi la date affichée
  // ne peut pas être juste pour tout le monde.
  ['44781000', 'État, retenue sur les revenus locatifs (20 %)'],
  ['44782000', 'État, prélèvement sur prestataires non-résidents (14 %)'],
  ['44783000', 'État, prélèvement exceptionnel sur le personnel expatrié (25 %)'],
  ['44784000', 'État, retenue sur les revenus de capitaux mobiliers (20 %)'],
  ['44785000', 'État, retenue sur les plus-values (20 %)'],
  ['44860000', 'État · charges à payer'],
  ['44870000', 'État · produits à recevoir'],
  ['44910000', 'État, subvention à recevoir'],
  // 48 Créances et dettes H.A.O.
  ['49000000', 'Dépréciations et provisions · fournisseurs'],
  ['49110000', 'Dépréciations · créances adhérents et clients-usagers litigieuses'],
  ['49120000', 'Dépréciations · créances adhérents et clients-usagers douteuses'],
  ['49200000', 'Dépréciations et provisions · personnel'],
  ['49300000', 'Dépréciations et provisions · organismes sociaux'],
  ['49400000', 'Dépréciations et provisions · État et collectivités publiques'],
  ['49700000', 'Dépréciations et provisions · débiteurs divers'],
  ['49850000', 'Dépréciations · créances H.A.O. sur cessions d\'immobilisations'],
  ['49880000', 'Dépréciations · autres créances H.A.O.'],
  ['49910000', 'Provisions pour risques et charges à court terme · opérations d\'exploitation'],
  ['49980000', 'Provisions pour risques et charges à court terme · opérations H.A.O.'],
]);

// ─────────────────────────────────────────────────────────────────────────
// CLASSE 5 · COMPTES DE TRÉSORERIE (bilan, report SOLDE)
// ─────────────────────────────────────────────────────────────────────────
const classe5: LigneSeed[] = c(ClasseCompte.CLASSE_5, SOLDE, [
  ['50110000', 'Titres du Trésor à court terme'],
  ['50120000', "Titres d'organismes financiers"],
  ['50130000', 'Bons de caisse à court terme'],
  ['50160000', 'Titres du trésor et bons de caisse à court terme · frais d\'acquisition'],
  ['50220000', 'Actions cotées'],
  ['50230000', 'Actions non cotées'],
  ['50250000', 'Autres actions'],
  ['50260000', 'Actions · frais d\'acquisition'],
  ['50320000', 'Obligations cotées'],
  ['50330000', 'Obligations non cotées'],
  ['50350000', 'Autres obligations'],
  ['50360000', 'Obligations · frais d\'acquisition'],
  ['50420000', 'Bons de souscription d\'actions'],
  ['50430000', 'Bons de souscription d\'obligations'],
  ['50500000', 'Titres négociables hors Région'],
  ['50610000', 'Intérêts courus · titres du Trésor et bons de caisse à court terme'],
  ['50620000', 'Intérêts courus · actions'],
  ['50630000', 'Intérêts courus · obligations'],
  ['50800000', 'Autres titres de placement et créances assimilées'],
  ['51300000', 'Chèques à encaisser'],
  ['51400000', "Chèques à l'encaissement"],
  ['51500000', 'Cartes de crédit à encaisser'],
  ['51850000', 'Chèques de voyage'],
  ['51860000', 'Coupons échus'],
  ['51870000', 'Intérêts échus des obligations'],
  ['52110000', 'Banques locales · monnaie nationale'],
  ['52150000', 'Banques locales · devises'],
  ['52200000', 'Banques · autres États de la Région'],
  ['52300000', 'Banques · autres États de la zone monétaire'],
  ['52400000', 'Banques · hors zone monétaire'],
  ['52500000', 'Banques · dépôt à terme et opérations assimilées'],
  ['52610000', 'Banques · intérêts courus, charges à payer'],
  ['52670000', 'Banques · intérêts courus, produits à recevoir'],
  ['53100000', 'Banques postales'],
  ['53200000', 'Trésor'],
  ['53300000', "Sociétés de gestion et d'intermédiation"],
  ['53610000', 'Établissements financiers · intérêts courus, charges à payer'],
  ['53670000', 'Établissements financiers · intérêts courus, produits à recevoir'],
  ['53800000', 'Autres organismes financiers'],
  ['55100000', 'Instruments de monnaie électronique · carte carburant'],
  ['55200000', 'Instruments de monnaie électronique · téléphone portable'],
  ['55300000', 'Instruments de monnaie électronique · carte péage'],
  ['55400000', 'Instruments de monnaie électronique · porte-monnaie électronique'],
  ['55800000', 'Instruments de monnaie électronique · autres'],
  ['56100000', 'Banques, crédits de trésorerie'],
  ['56500000', 'Banques, escompte de crédits ordinaires'],
  ['56600000', 'Banques, crédits de trésorerie · intérêts courus'],
  ['57100000', 'Caisse · monnaie nationale'],
  ['57200000', 'Caisse · devises'],
  ['58500000', 'Virements de fonds'],
  ['58800000', 'Autres virements internes'],
  ['59000000', 'Dépréciations et provisions · titres de placement'],
  ['59100000', 'Dépréciations et provisions · titres et valeurs à encaisser'],
  ['59200000', 'Dépréciations et provisions · comptes banques'],
  ['59300000', 'Dépréciations et provisions · établissements financiers et assimilés'],
  ['59500000', 'Dépréciations et provisions · instruments de monnaie électronique'],
  ['59900000', 'Provisions pour risques et charges à court terme à caractère financier'],
]);

// ─────────────────────────────────────────────────────────────────────────
// CLASSE 6 · COMPTES DE CHARGES DES ACTIVITÉS ORDINAIRES (gestion, report AUCUN)
// ─────────────────────────────────────────────────────────────────────────
const classe6: LigneSeed[] = c(ClasseCompte.CLASSE_6, AUCUN, [
  ['60110000', "Achats de biens et services liés à l'activité dans l'État partie"],
  ['60120000', "Achats de biens et services liés à l'activité dans la Région"],
  ['60130000', "Achats de biens et services liés à l'activité hors Région"],
  ['60150000', "Achats de biens et services liés à l'activité · frais sur achats de biens et services liés à l'activité"],
  ['60190000', "Achats de biens et services liés à l'activité · Rabais, Remises et Ristournes obtenus (non ventilés)"],
  ['60210000', "Achats de marchandises et matières premières dans l'État partie"],
  ['60220000', 'Achats de marchandises et matières premières dans la Région'],
  ['60230000', 'Achats de marchandises et matières premières hors Région'],
  ['60250000', 'Achats de marchandises, de matières premières et fournitures liées · frais sur achats de marchandises et matières'],
  ['60290000', 'Achats de marchandises, de matières premières et fournitures liées · Rabais, Remises et Ristournes obtenus (non ventilés)'],
  // 603 a des subdivisions explicitement listées au texte officiel (Partie 2,
  // ch. 3, classe 6 : « 6031 Variations des stocks de biens liés ; 6032
  // Variations des stocks de marchandises ; 6033 ... ; 6034 ... ; 6035 ») :
  // la règle de sélection ci-dessus impose donc de reprendre les
  // subdivisions et non le compte parent. Elles ne sont pas cosmétiques ·
  // le compte de résultat officiel sépare 6031 (poste TB) de 6032-6035
  // (poste TE), ce qu'un compte 603 unique rend structurellement impossible.
  ['60310000', "Variations des stocks de biens et services liés à l'activité"],
  ['60320000', 'Variations des stocks de marchandises'],
  ['60330000', 'Variations des stocks de matières premières et fournitures liées'],
  ['60340000', "Variations des stocks d'autres approvisionnements"],
  ['60350000', 'Variations de stocks de dons en nature à distribuer'],
  ['60410000', 'Achats stockés de matières et fournitures consommables · Matières consommables'],
  ['60420000', 'Matières combustibles'],
  ['60430000', "Produits d'entretien"],
  ['60450000', 'Frais sur achats matières et fournitures consommables'],
  ['60460000', 'Achats stockés de matières et fournitures consommables · Fournitures de magasin'],
  ['60470000', 'Achats stockés de matières et fournitures consommables · Fournitures de bureau'],
  ['60490000', 'Achats stockés de matières et fournitures consommables · Rabais, Remises et Ristournes obtenus (non ventilés)'],
  ['60510000', 'Fournitures non stockables · Eau'],
  ['60520000', 'Fournitures non stockables · Électricité'],
  ['60530000', 'Fournitures non stockables · Autres énergies'],
  ['60540000', "Fournitures d'entretien non stockables"],
  ['60550000', 'Fournitures de bureau non stockables'],
  ['60560000', 'Achats de petit matériel et outillage'],
  ['60570000', "Achats d'études et prestations de services"],
  ['60580000', 'Achats de travaux, matériels et équipements'],
  ['60590000', 'Autres achats · Rabais, Remises et Ristournes obtenus (non ventilés)'],
  ['60610000', 'Achats autres activités · billetteries'],
  ['60620000', 'Achats autres activités · tombola et autres jeux'],
  ['60630000', 'Achats autres activités · bons d\'achats'],
  ['60640000', 'Achats autres activités · voyages et sorties'],
  ['60680000', 'Achats autres activités · autres'],
  ['60810000', "Achats d'emballages · Emballages perdus"],
  ['60820000', "Achats d'emballages · Emballages récupérables non identifiables"],
  ['60830000', "Achats d'emballages · Emballages à usage mixte"],
  ['60850000', "Frais sur achats d'emballages"],
  ['60890000', "Achats d'emballages · Rabais, Remises et Ristournes obtenus (non ventilés)"],
  ['61200000', 'Transports sur ventes'],
  ['61300000', 'Transports pour compte de tiers'],
  ['61400000', 'Transports du personnel'],
  ['61600000', 'Transports de plis'],
  ['61810000', 'Voyages et déplacements'],
  ['61830000', 'Transports administratifs'],
  ['61900000', 'Rabais, remises, ristournes obtenus (non ventilés)'],
  ['62100000', 'Sous-traitance générale'],
  ['62210000', 'Locations de terrains'],
  ['62220000', 'Locations de bâtiments'],
  ['62230000', 'Locations de matériels et outillages'],
  ['62240000', 'Malis sur emballages'],
  ['62250000', "Locations d'emballages"],
  ['62260000', 'Fermages et loyers du foncier'],
  ['62280000', 'Locations et charges locatives diverses'],
  ['62320000', 'Crédit-bail immobilier'],
  ['62330000', 'Crédit-bail mobilier'],
  ['62340000', 'Location-vente'],
  ['62380000', 'Autres contrats de location-acquisition'],
  ['62410000', 'Entretien et réparation des biens immobiliers'],
  ['62420000', 'Entretien et réparation des biens mobiliers'],
  ['62430000', 'Maintenance'],
  ['62440000', 'Charges de démantèlement et remise en état'],
  ['62480000', 'Autres entretiens et réparation'],
  ['62510000', 'Assurances multirisques'],
  ['62520000', 'Assurances matériel de transport'],
  ['62530000', "Assurances risques d'exploitation"],
  ['62580000', "Autres primes d'assurances"],
  ['62610000', 'Études et recherches'],
  ['62650000', 'Documentation générale'],
  ['62660000', 'Documentation technique'],
  ['62710000', 'Annonces, insertions'],
  ['62720000', 'Catalogues, imprimés publicitaires'],
  ['62730000', 'Congrès, universités et assimilés'],
  ['62740000', 'Manifestations'],
  ['62750000', 'Publications'],
  ['62770000', 'Frais de colloques, séminaires, conférences'],
  ['62780000', 'Autres charges de publicité et relations publiques'],
  ['62810000', 'Frais de téléphone'],
  ['62830000', 'Frais de télécopie'],
  ['62840000', "Frais d'internet"],
  ['62880000', 'Autres frais de télécommunications'],
  ['63110000', 'Frais sur titres (vente, garde)'],
  ['63120000', 'Frais sur effets'],
  ['63130000', 'Location de coffres'],
  ['63150000', 'Commissions sur cartes de crédit'],
  ['63160000', "Frais d'émission d'emprunts"],
  ['63170000', 'Frais sur instruments de monnaie électronique'],
  ['63180000', 'Autres frais bancaires'],
  ['63220000', 'Commissions'],
  ['63240000', 'Honoraires des professions règlementées'],
  ['63250000', "Frais d'actes et de contentieux"],
  ['63270000', 'Rémunérations des autres prestataires de services'],
  ['63280000', 'Divers frais'],
  ['63300000', 'Frais de formation'],
  ['63420000', 'Redevances pour brevets, licences'],
  ['63430000', 'Redevances pour logiciels'],
  ['63450000', 'Redevances pour sites internet'],
  ['63460000', 'Redevances pour concessions, droits et valeurs similaires'],
  ['63480000', 'Autres redevances'],
  ['63510000', 'Cotisations · Cotisations'],
  ['63580000', 'Concours divers'],
  ['63600000', 'Frais de recherche de fonds'],
  ['63710000', "Rémunérations de personnel extérieur à l'entité · Personnel intérimaire"],
  ['63720000', "Rémunérations de personnel extérieur à l'entité · Personnel détaché ou prêté à l'entité"],
  ['63810000', 'Frais de recrutement du personnel'],
  ['63820000', 'Frais de déménagement'],
  ['63830000', 'Réceptions'],
  ['63840000', 'Missions'],
  ['63850000', 'Charges de copropriété'],
  ['63880000', 'Charges externes diverses'],
  ['64110000', 'Impôts fonciers et taxes annexes'],
  ['64120000', 'Licences et taxes annexes'],
  ['64130000', 'Taxes sur appointements et salaires'],
  ['64140000', "Taxes d'apprentissage"],
  ['64150000', 'Formation professionnelle continue'],
  ['64160000', 'Patente ou contribution économique locale'],
  ['64180000', 'Autres impôts et taxes directs'],
  ['64500000', 'Impôts et taxes indirects'],
  ['64610000', 'Droits de mutation'],
  ['64620000', 'Droits de timbre'],
  ['64640000', 'Vignettes'],
  ['64680000', "Autres droits d'enregistrement"],
  ['64710000', "Pénalités d'assiette, impôts directs"],
  ['64720000', "Pénalités d'assiette, impôts indirects"],
  ['64730000', 'Pénalités de recouvrement, impôts directs'],
  ['64740000', 'Pénalités de recouvrement, impôts indirects'],
  ['64780000', 'Autres pénalités et amendes fiscales'],
  ['64800000', 'Autres impôts et taxes'],
  ['64900000', 'Dégrèvements et annulations d\'impôts et taxes'],
  ['65110000', 'Pertes sur créances adhérents clients, et autres débiteurs · Clients-usagers'],
  ['65120000', 'Pertes sur créances adhérents clients, et autres débiteurs · Adhérents'],
  ['65150000', 'Autres débiteurs'],
  ['65200000', 'Subventions accordées par l\'entité'],
  // [texte officiel] Le plan des comptes donne « 6541 non affectés, 6545
  // affectés » ; le chapitre 3 écrit « 6541 non affectés, 6542 affectés ».
  // C'est la nomenclature qui fait foi · 6545 retenu.
  ['65410000', 'Dons en nature courants à distribuer non affectés'],
  ['65450000', 'Dons en nature courants à distribuer affectés'],
  ['65700000', 'Pénalités et amendes pénales'],
  ['65800000', 'Charges diverses'],
  ['65910000', 'Provisions sur risques à court terme'],
  ['65930000', 'Charges pour dépréciations sur stocks'],
  ['65940000', 'Charges pour dépréciations sur créances'],
  ['65980000', 'Autres charges pour dépréciations et provisions pour risques à court terme'],
  ['66110000', 'Rémunérations directes versées au personnel national · Appointements salaires et commissions'],
  ['66120000', 'Rémunérations directes versées au personnel national · Primes et gratifications'],
  ['66130000', 'Rémunérations directes versées au personnel national · Congés payés'],
  ['66140000', 'Rémunérations directes versées au personnel national · Indemnités de préavis et de licenciement'],
  ['66150000', 'Rémunérations directes versées au personnel national · Indemnités de maladie versées aux travailleurs'],
  ['66160000', 'Rémunérations directes versées au personnel national · Supplément familial'],
  ['66170000', 'Rémunérations directes versées au personnel national · Avantages en nature'],
  ['66180000', 'Rémunérations directes versées au personnel national · Autres rémunérations directes'],
  ['66210000', 'Rémunérations directes versées au personnel non national · Appointements salaires et commissions'],
  ['66220000', 'Rémunérations directes versées au personnel non national · Primes et gratifications'],
  ['66230000', 'Rémunérations directes versées au personnel non national · Congés payés'],
  ['66240000', 'Rémunérations directes versées au personnel non national · Indemnités de préavis et de licenciement'],
  ['66250000', 'Rémunérations directes versées au personnel non national · Indemnités de maladie versées aux travailleurs'],
  ['66260000', 'Rémunérations directes versées au personnel non national · Supplément familial'],
  ['66270000', 'Rémunérations directes versées au personnel non national · Avantages en nature'],
  ['66280000', 'Rémunérations directes versées au personnel non national · Autres rémunérations directes'],
  ['66310000', 'Indemnités de logement'],
  ['66320000', 'Indemnités de représentation'],
  ['66330000', "Indemnités d'expatriation"],
  ['66340000', 'Indemnités de transport'],
  ['66380000', 'Autres indemnités et avantages divers'],
  ['66410000', 'Charges sociales sur rémunération du personnel national'],
  ['66420000', 'Charges sociales sur rémunération du personnel non national'],
  ['66500000', 'Habillement et équipement du personnel'],
  ['66710000', 'Rémunération transférée de personnel extérieur · Personnel intérimaire'],
  ['66720000', "Rémunération transférée de personnel extérieur · Personnel détaché ou prêté à l'entité"],
  ['66810000', 'Versements aux syndicats et assimilés'],
  ['66820000', "Versements aux comités d'hygiène et de sécurité"],
  ['66830000', 'Versements et contributions aux autres œuvres sociales'],
  ['66840000', 'Médecine du travail et pharmacie'],
  ['66850000', 'Autres charges sociales · Assurances et organismes de santé'],
  ['66860000', 'Assurances retraite et fonds de pensions'],
  ['66870000', 'Majorations et pénalités sociales'],
  ['66880000', 'Charges sociales diverses'],
  ['66900000', 'Dégrèvements et annulations des charges sociales'],
  ['67110000', 'Intérêts des emprunts · Emprunts obligataires'],
  ['67120000', 'Emprunts auprès des établissements de crédit'],
  ['67130000', 'Primes de remboursement des obligations'],
  ['67210000', 'Intérêts dans loyers de location-acquisition/crédit-bail immobilier'],
  ['67220000', 'Intérêts dans loyers de location-acquisition/crédit-bail mobilier'],
  ['67230000', 'Intérêts dans loyers de location-acquisition/location-vente'],
  ['67240000', 'Intérêts dans loyers des autres locations-acquisition'],
  ['67300000', 'Escomptes accordés'],
  ['67410000', 'Avances reçues et dépôts créditeurs'],
  ['67420000', 'Comptes courants bloqués'],
  ['67440000', 'Intérêts sur dettes commerciales'],
  ['67450000', 'Intérêts bancaires et sur opérations de financement (escompte.…)'],
  ['67480000', 'Intérêts sur dettes diverses'],
  ['67600000', 'Pertes de change financières'],
  ['67710000', 'Pertes sur cessions de titres de placement'],
  ['67810000', 'Pertes et charges sur risques financiers · sur rentes viagères'],
  ['67820000', 'Pertes et charges sur risques financiers · sur opérations financières'],
  ['67910000', 'Charges pour dépréciations et provisions pour risques à court terme financières · sur risques financiers'],
  ['67950000', 'Charges pour dépréciations et provisions pour risques à court terme financières · sur titres de placement'],
  ['67980000', 'Autres charges pour dépréciations et provisions pour risques à court terme financières'],
  ['68000000', 'Dotations aux amortissements · usufruit temporaire'],
  ['68120000', "Dotations aux amortissements d'exploitation · immobilisations incorporelles"],
  ['68130000', "Dotations aux amortissements d'exploitation · immobilisations corporelles"],
  ['69110000', "Dotations aux provisions et aux dépréciations d'exploitation · Dotations aux provisions pour risques et charges"],
  ['69130000', 'Dotations aux dépréciations des immobilisations incorporelles'],
  ['69140000', 'Dotations aux dépréciations des immobilisations corporelles'],
  ['69510000', "Dotations aux dépréciations d'usufruit temporaire"],
  ['69520000', "Dotations aux dépréciations d'immobilisations destinées à la vente provenant des dons.et legs non encore reçus"],
  ['69710000', 'Dotations aux provisions et aux dépréciations financières · Dotations aux provisions pour risques et charges'],
  ['69720000', 'Dotations aux dépréciations des immobilisations financières'],
]);

// ─────────────────────────────────────────────────────────────────────────
// CLASSE 7 · COMPTES DE PRODUITS DES ACTIVITÉS ORDINAIRES (gestion, report AUCUN)
// ─────────────────────────────────────────────────────────────────────────
const classe7: LigneSeed[] = c(ClasseCompte.CLASSE_7, AUCUN, [
  ['70100000', 'Cotisations des adhérents'],
  ['70200000', "Quote-part de fonds d'administration transférés"],
  ['70300000', 'Quote-part de dotation consomptible transférée'],
  ['70410000', 'Revenus liés à la générosité · dons'],
  ['70420000', 'Revenus liés à la générosité · legs'],
  ['70430000', 'Revenus liés à la générosité · deniers du culte'],
  ['70440000', 'Revenus liés à la générosité · zakat, dîme, quête et assimilées'],
  ['70450000', 'Revenus liés à la générosité · célébrations'],
  ['70460000', 'Revenus liés à la générosité · mécénats'],
  ['70470000', 'Revenus liés à la générosité · parrainage'],
  ['70480000', 'Revenus liés à la générosité · autres'],
  // 705 a des subdivisions explicitement listées au texte officiel (Partie 2,
  // ch. 3, classe 7 : « 705 Ventes marchandises, services et produits finis
  // (7051 Ventes de marchandises, 7052 Services vendus, 7053 Ventes de
  // produits finis, 7054 Ventes de produits intermédiaires, 7055 Ventes de
  // produits résiduels) ») : la règle de sélection ci-dessus impose de
  // reprendre les subdivisions, comme cela a été fait pour 704 et 708.
  // Distinction structurante et non cosmétique : le compte de résultat
  // officiel sépare 7051 (poste RD, ventes de marchandises) de 7052/7053
  // (poste RE, services et produits finis) · un compte 705 unique et
  // mouvementable rend un compte de résultat conforme impossible, et son
  // montant disparaît alors de tous les totaux de l'état (constaté en test :
  // écart de 500 entre le résultat du bilan et le résultat XE).
  ['70510000', 'Ventes de marchandises'],
  ['70520000', 'Services vendus'],
  ['70530000', 'Ventes de produits finis'],
  ['70540000', 'Ventes de produits intermédiaires'],
  ['70550000', 'Ventes de produits résiduels'],
  ['70600000', 'Revenus des manifestations'],
  ['70700000', 'Produits accessoires'],
  ['70810000', 'Autres revenus · ventes de dons en nature'],
  ['70820000', "Autres revenus · revenus d'usufruit"],
  ['71100000', "Subventions d'exploitation versées par l'État et collectivités publiques"],
  ['71300000', "Subventions d'exploitation versées par organismes nationaux et internationaux"],
  ['71800000', "Autres subventions d'exploitation"],
  ['72100000', 'Production immobilisée · immobilisations incorporelles'],
  ['72200000', 'Production immobilisée · immobilisations corporelles'],
  ['72400000', 'Production auto-consommée'],
  ['72600000', 'Production immobilisée · immobilisations financières'],
  ['73500000', 'Variations des stocks · produits finis et services en cours'],
  ['73600000', 'Variations des stocks · produits finis, intermédiaires et résiduels'],
  ['75100000', 'Profits sur créances adhérents/clients-usagers et débiteurs'],
  ['75200000', 'Contribution du fondateur'],
  ['75420000', 'Dons en nature courants reçus à distribuer'],
  ['75820000', "Produits divers · indemnités d'assurances"],
  ['75830000', 'Produits divers · abandons de frais par les bénévoles'],
  ['75880000', 'Produits divers · autres'],
  ['75910000', 'Reprises provisions sur risques à court terme'],
  ['75930000', 'Reprises de charges pour dépréciations sur stocks'],
  ['75940000', 'Reprises de charges pour dépréciations sur créances'],
  ['75980000', "Autres reprises de charges pour dépréciations et provisions pour risques à court terme d'exploitation"],
  ['77120000', 'Intérêts de prêts'],
  ['77130000', 'Intérêts sur créances diverses'],
  ['77210000', 'Revenus des titres de participation'],
  ['77220000', 'Revenus autres titres immobilisés'],
  ['77300000', 'Escomptes obtenus'],
  ['77450000', 'Revenus des obligations'],
  ['77460000', 'Revenus des titres de placement'],
  ['77470000', 'Revenus des dépôts à terme et opérations assimilées'],
  ['77480000', 'Autres revenus de placement'],
  ['77600000', 'Gains de change financiers'],
  ['77700000', 'Gains sur cessions de titres de placement'],
  ['77810000', 'Gains sur rentes viagères'],
  ['77820000', 'Gains sur opérations financières'],
  ['77910000', 'Reprises de provisions sur risques financiers'],
  ['77950000', 'Reprises de charges pour dépréciations sur titres de placement'],
  ['77980000', 'Autre reprises de charges pour dépréciations et provisions pour risques à court terme financières'],
  ['78100000', "Transferts de charges d'exploitation"],
  ['78700000', 'Transferts de charges financières'],
  ['79110000', "Reprises de provisions et dépréciations d'exploitation · Reprises de provisions pour risques et charges"],
  ['79130000', 'Reprises de dépréciations des immobilisations incorporelles'],
  ['79140000', 'Reprises de dépréciations des immobilisations corporelles'],
  ['79230000', "Reprises de fonds affectés provenant de dons et legs d'immobilisations"],
  ['79250000', 'Reprises de fonds affectés à un projet spécifique'],
  ['79280000', 'Autres reprises de fonds affectés'],
  ['79510000', "Reprises des dépréciations d'usufruit temporaire"],
  ['79520000', "Reprises des dépréciations d'immobilisations reçues destinées à la vente provenant des dons et legs"],
  ['79610000', "Reprises de fonds reportés provenant de la donation temporaire d'usufruit"],
  ['79620000', "Reprises de fonds reportés provenant de dons et legs d'immobilisations reçues destinées à la vente"],
  ['79680000', 'Autres reprises de fonds reportés'],
  ['79710000', 'Reprises de provisions et dépréciations financières · Reprises de provisions pour risques et charges'],
  ['79720000', 'Reprises de dépréciations des immobilisations financières'],
  ['79800000', 'Reprises d\'amortissements'],
  ['79900000', "Reprises de subventions d'investissement"],
]);

// ─────────────────────────────────────────────────────────────────────────
// CLASSE 8 · COMPTES DES AUTRES CHARGES ET DES AUTRES PRODUITS (H.A.O., report AUCUN)
// ─────────────────────────────────────────────────────────────────────────
const classe8: LigneSeed[] = c(ClasseCompte.CLASSE_8, AUCUN, [
  ['81100000', 'Valeurs comptables des cessions · immobilisations incorporelles'],
  ['81200000', 'Valeurs comptables des cessions · immobilisations corporelles'],
  ['81600000', 'Valeurs comptables des cessions · immobilisations financières'],
  ['81800000', 'Valeurs comptables des cessions · reçues destinées à la vente provenant de dons et legs'],
  ['82100000', 'Produits des cessions · immobilisations incorporelles'],
  ['82200000', 'Produits des cessions · immobilisations corporelles'],
  ['82600000', 'Produits des cessions · immobilisations financières'],
  ['82800000', 'Produits des cessions · reçues destinées à la vente provenant de dons et legs'],
  ['83100000', 'Charges H.A.O. constatées'],
  // 832 et 842 figurent au plan officiel comme comptes à part entière. Leurs
  // « enfants » annoncés (8311/8315, 8411/8412/8415) sont numérotés sous 831
  // et 841 · anomalie du texte, signalée dans le skill. On sème donc 832 et
  // 842 comme comptes d'imputation, sans total au-dessus d'eux : c'est le 832
  // que la Partie 3 ch. 4 prescrit de débiter, et il n'existait pas.
  ['83200000', 'Dons en nature H.A.O. à distribuer'],
  // [texte officiel] anomalie de numérotation 8311/8315 déjà signalée dans le
  // skill sycebnl (partie2-ch3-classe8-comptes80-89.md) · codes repris tels quels.
  ['83110000', 'Dons en nature H.A.O. à distribuer · non affectés'],
  ['83150000', 'Dons en nature H.A.O. à distribuer · affectés'],
  ['83400000', 'Pertes sur créances H.A.O.'],
  ['83600000', 'Abandons de créances consentis'],
  ['83800000', 'Transferts de charges H.A.O.'],
  ['83900000', 'Charges pour dépréciations et provisions à court terme H.A.O.'],
  ['84100000', 'Produits H.A.O. constatés'],
  ['84200000', 'Contributions volontaires en nature'],
  ['84110000', 'Contributions volontaires en nature · dons en nature H.A.O. vendus'],
  ['84120000', 'Contributions volontaires en nature · prestations de services en nature H.A.O.'],
  ['84150000', 'Contributions volontaires en nature · dons en nature H.A.O. à distribuer'],
  ['84300000', 'Contributions volontaires en numéraire'],
  ['84600000', 'Abandons de créances obtenus'],
  ['84800000', 'Transferts de produits H.A.O.'],
  ['84900000', 'Reprises de charges pour dépréciations et provisions à court terme H.A.O.'],
  ['85100000', 'Dotations H.A.O. · provisions réglementées'],
  ['85200000', 'Dotations H.A.O. · amortissements'],
  ['85300000', 'Dotations H.A.O. · dépréciations'],
  ['85400000', 'Dotations H.A.O. · provisions pour risques et charges'],
  ['85800000', 'Autres dotations H.A.O.'],
  ['86100000', 'Reprises H.A.O. · provisions réglementées'],
  ['86200000', 'Reprises H.A.O. · amortissements'],
  ['86300000', 'Reprises H.A.O. · dépréciations'],
  ['86400000', 'Reprises H.A.O. · provisions pour risques et charges'],
  ['86800000', 'Autres reprises H.A.O.'],
  ['87000000', 'Variations de stocks de dons en nature H.A.O.'],
  ['88100000', "Subventions d'équilibre · État"],
  ['88400000', "Subventions d'équilibre · collectivités publiques"],
  ['88800000', "Subventions d'équilibre · autres"],
]);

// ─────────────────────────────────────────────────────────────────────────
// CLASSE 9 · CONTRIBUTIONS VOLONTAIRES EN NATURE (mémoire, report SOLDE)
// Seuls les comptes 90/91 (contributions volontaires en nature) sont repris :
// les comptes 92 à 99 (comptabilité analytique de gestion) ne sont PAS
// subdivisés dans le texte officiel ("libre usage") · ne pas les inventer.
// ─────────────────────────────────────────────────────────────────────────
const classe9: LigneSeed[] = c(ClasseCompte.CLASSE_9, SOLDE, [
  ['90000000', 'Emplois des contributions volontaires en nature · secours en nature'],
  ['90100000', 'Emplois des contributions volontaires en nature · mises à disposition gratuite de biens'],
  ['90200000', 'Emplois des contributions volontaires en nature · prestations en nature'],
  ['90400000', 'Emplois des contributions volontaires en nature · personnel bénévole'],
  ['91000000', 'Contributions volontaires en nature · dons en nature'],
  ['91100000', 'Contributions volontaires en nature · prestations en nature'],
  ['91400000', 'Contributions volontaires en nature · bénévolat'],
]);

// ─────────────────────────────────────────────────────────────────────────
// COMPTES PRINCIPAUX (2 chiffres) · voir le commentaire de total() ci-dessus.
// Un en-tête par division effectivement détaillée plus haut · les classes
// 92 à 99 n'en portent aucun, faute de subdivisions officielles (§ en-tête
// de fichier).
// ─────────────────────────────────────────────────────────────────────────
const totauxClasse1: LigneSeed[] = [
  total('10', 'Dotation', ClasseCompte.CLASSE_1, SOLDE),
  total('11', 'Réserves', ClasseCompte.CLASSE_1, SOLDE),
  total('12', 'Report à nouveau', ClasseCompte.CLASSE_1, SOLDE),
  total('13', "Résultat net de l'exercice", ClasseCompte.CLASSE_1, SOLDE),
  total('14', "Subventions d'investissement", ClasseCompte.CLASSE_1, SOLDE),
  total('15', 'Provisions réglementées et fonds assimilés', ClasseCompte.CLASSE_1, SOLDE),
  total('16', 'Fonds affectés', ClasseCompte.CLASSE_1, SOLDE),
  total('17', 'Fonds reportés', ClasseCompte.CLASSE_1, SOLDE),
  total('18', 'Emprunts et dettes assimilées', ClasseCompte.CLASSE_1, SOLDE),
  total('19', 'Provisions pour risques et charges', ClasseCompte.CLASSE_1, SOLDE),
];

const totauxClasse2: LigneSeed[] = [
  total('20', 'Immobilisations destinées à la vente (dons/legs non reçus) et usufruit temporaire', ClasseCompte.CLASSE_2, SOLDE),
  total('21', 'Immobilisations incorporelles', ClasseCompte.CLASSE_2, SOLDE),
  total('22', 'Terrains', ClasseCompte.CLASSE_2, SOLDE),
  total('23', 'Bâtiments, installations techniques et agencements', ClasseCompte.CLASSE_2, SOLDE),
  total('24', 'Matériel, mobilier et actifs biologiques', ClasseCompte.CLASSE_2, SOLDE),
  total('25', 'Avances et acomptes versés sur immobilisations', ClasseCompte.CLASSE_2, SOLDE),
  total('26', 'Titres de participation', ClasseCompte.CLASSE_2, SOLDE),
  total('27', 'Autres immobilisations financières', ClasseCompte.CLASSE_2, SOLDE),
  total('28', 'Amortissements', ClasseCompte.CLASSE_2, SOLDE),
  total('29', 'Dépréciations des immobilisations', ClasseCompte.CLASSE_2, SOLDE),
];

const totauxClasse3: LigneSeed[] = [
  total('31', "Biens liés à l'activité", ClasseCompte.CLASSE_3, SOLDE),
  total('32', 'Marchandises, matières premières et fournitures liées', ClasseCompte.CLASSE_3, SOLDE),
  total('33', 'Autres approvisionnements', ClasseCompte.CLASSE_3, SOLDE),
  total('34', 'Dons en nature', ClasseCompte.CLASSE_3, SOLDE),
  total('35', 'Produits et services en cours', ClasseCompte.CLASSE_3, SOLDE),
  total('36', 'Produits finis, produits intermédiaires et résiduels', ClasseCompte.CLASSE_3, SOLDE),
  total('37', 'Stocks en cours de route, en consignation ou en dépôt', ClasseCompte.CLASSE_3, SOLDE),
  total('38', 'Dons en nature H.A.O.', ClasseCompte.CLASSE_3, SOLDE),
  total('39', 'Dépréciations des stocks et des productions en cours', ClasseCompte.CLASSE_3, SOLDE),
];

// Divisions 40/41/45/46/47 (tiers avec grand-livre auxiliaire) : report
// DETAIL, comme leurs comptes Détail · 42/43/44/48/49 : report SOLDE.
const totauxClasse4: LigneSeed[] = [
  total('40', 'Fournisseurs et comptes rattachés', ClasseCompte.CLASSE_4, DETAIL),
  total('41', 'Adhérents, clients-usagers et comptes rattachés', ClasseCompte.CLASSE_4, DETAIL),
  total('42', 'Personnel', ClasseCompte.CLASSE_4, SOLDE),
  total('43', 'Organismes sociaux', ClasseCompte.CLASSE_4, SOLDE),
  total('44', 'État et collectivités publiques', ClasseCompte.CLASSE_4, SOLDE),
  total('45', 'Fondateurs, apporteurs et comptes courants', ClasseCompte.CLASSE_4, DETAIL),
  total('46', "Bailleurs, État et autres organismes, fonds d'administration", ClasseCompte.CLASSE_4, DETAIL),
  total('47', 'Débiteurs et créditeurs divers', ClasseCompte.CLASSE_4, DETAIL),
  total('48', 'Créances et dettes H.A.O.', ClasseCompte.CLASSE_4, SOLDE),
  total('49', 'Dépréciations et provisions pour risques à court terme (tiers)', ClasseCompte.CLASSE_4, SOLDE),
];

const totauxClasse5: LigneSeed[] = [
  total('50', 'Titres de placement', ClasseCompte.CLASSE_5, SOLDE),
  total('51', 'Valeurs à encaisser', ClasseCompte.CLASSE_5, SOLDE),
  total('52', 'Banques', ClasseCompte.CLASSE_5, SOLDE),
  total('53', 'Établissements financiers et assimilés', ClasseCompte.CLASSE_5, SOLDE),
  total('55', 'Instruments de monnaie électronique', ClasseCompte.CLASSE_5, SOLDE),
  total('56', "Banques, crédits de trésorerie et d'escompte", ClasseCompte.CLASSE_5, SOLDE),
  total('57', 'Caisse', ClasseCompte.CLASSE_5, SOLDE),
  total('58', 'Virements internes', ClasseCompte.CLASSE_5, SOLDE),
  total('59', 'Dépréciations et provisions pour risques à court terme', ClasseCompte.CLASSE_5, SOLDE),
];

const totauxClasse6: LigneSeed[] = [
  total('60', 'Achats et variations de stocks', ClasseCompte.CLASSE_6, AUCUN),
  total('61', 'Transports', ClasseCompte.CLASSE_6, AUCUN),
  total('62', 'Services extérieurs', ClasseCompte.CLASSE_6, AUCUN),
  total('63', 'Autres services extérieurs', ClasseCompte.CLASSE_6, AUCUN),
  total('64', 'Impôts et taxes', ClasseCompte.CLASSE_6, AUCUN),
  total('65', 'Autres charges', ClasseCompte.CLASSE_6, AUCUN),
  total('66', 'Charges de personnel', ClasseCompte.CLASSE_6, AUCUN),
  total('67', 'Frais financiers et charges assimilées', ClasseCompte.CLASSE_6, AUCUN),
  total('68', 'Dotations aux amortissements', ClasseCompte.CLASSE_6, AUCUN),
  total('69', 'Dotations aux provisions et aux dépréciations', ClasseCompte.CLASSE_6, AUCUN),
];

const totauxClasse7: LigneSeed[] = [
  total('70', 'Revenus', ClasseCompte.CLASSE_7, AUCUN),
  total('71', "Subventions d'exploitation", ClasseCompte.CLASSE_7, AUCUN),
  total('72', 'Production immobilisée', ClasseCompte.CLASSE_7, AUCUN),
  total('73', 'Variations des stocks de biens produits', ClasseCompte.CLASSE_7, AUCUN),
  total('75', 'Autres produits', ClasseCompte.CLASSE_7, AUCUN),
  total('77', 'Revenus financiers et produits assimilés', ClasseCompte.CLASSE_7, AUCUN),
  total('78', 'Transferts de charges', ClasseCompte.CLASSE_7, AUCUN),
  total('79', 'Reprises de provisions, de dépréciations et autres', ClasseCompte.CLASSE_7, AUCUN),
];

const totauxClasse8: LigneSeed[] = [
  total('81', "Valeurs comptables des cessions d'immobilisations", ClasseCompte.CLASSE_8, AUCUN),
  total('82', "Produits des cessions d'immobilisations", ClasseCompte.CLASSE_8, AUCUN),
  total('83', 'Charges hors activités ordinaires', ClasseCompte.CLASSE_8, AUCUN),
  total('84', 'Revenus hors activités ordinaires', ClasseCompte.CLASSE_8, AUCUN),
  total('85', 'Dotations hors activités ordinaires', ClasseCompte.CLASSE_8, AUCUN),
  total('86', "Reprises d'amortissements, provisions et dépréciations H.A.O.", ClasseCompte.CLASSE_8, AUCUN),
  total('87', 'Variations de stocks de dons en nature H.A.O.', ClasseCompte.CLASSE_8, AUCUN),
  total('88', "Subventions d'équilibre", ClasseCompte.CLASSE_8, AUCUN),
];

// 92 à 99 (comptabilité analytique de gestion) volontairement sans en-tête :
// aucun compte Détail n'est semé dessous (§ en-tête de fichier, « libre
// usage »), un en-tête sans enfant n'aurait rien à regrouper.
const totauxClasse9: LigneSeed[] = [
  total('90', 'Emplois des contributions volontaires en nature', ClasseCompte.CLASSE_9, SOLDE),
  total('91', 'Contributions volontaires en nature', ClasseCompte.CLASSE_9, SOLDE),
  // COMPTABILITÉ ANALYTIQUE DE GESTION · la seconde « CLASSE 9 » du plan
  // officiel (p. 105) énumère 92 à 99 sans jamais les développer : le texte
  // les laisse au « libre usage » de l'entité. Ils sont donc semés comme
  // en-têtes, sans compte d'imputation en dessous · c'est au cabinet de créer
  // les siens, exactement comme le référentiel l'y invite.
  total('92', 'Comptes réfléchis', ClasseCompte.CLASSE_9, SOLDE),
  total('93', 'Comptes de reclassements', ClasseCompte.CLASSE_9, SOLDE),
  total('94', 'Comptes de coûts', ClasseCompte.CLASSE_9, SOLDE),
  total('95', 'Comptes de stocks', ClasseCompte.CLASSE_9, SOLDE),
  total('96', "Comptes d'écarts sur coûts préétablis", ClasseCompte.CLASSE_9, SOLDE),
  total('97', 'Comptes de différences de traitement comptable', ClasseCompte.CLASSE_9, SOLDE),
  total('98', 'Comptes de résultats', ClasseCompte.CLASSE_9, SOLDE),
  total('99', 'Comptes de liaisons internes', ClasseCompte.CLASSE_9, SOLDE),
];

/**
 * COMPTES DIVISIONNAIRES (3 chiffres) · le tiers intermédiaire entre les
 * comptes principaux (2 chiffres) et les comptes d'imputation de base
 * (4-5 chiffres), posé par la Section 1 du chapitre 2 : « les comptes
 * divisionnaires à trois (03) chiffres ». Ajoutés le 2026-08-29, sur le même
 * principe que les comptes principaux (voir `total()` ci-dessus) : NON
 * complétés à huit chiffres, pour la même raison d'agrégation par
 * `startsWith` · un "401" complété romprait le regroupement de ses enfants
 * "40110000", "40130000", etc.
 *
 * Seuls les codes à 3 chiffres qui ont RÉELLEMENT des comptes de détail en
 * dessous d'eux dans ce fichier sont repris ici : un code à 3 chiffres sans
 * subdivision (ex. "103 Droit d'entrée") EST le compte d'imputation lui-même,
 * déjà semé en "10300000" plus haut · lui donner aussi une ligne à 3 chiffres
 * créerait un doublon vide, jamais mouvementé.
 *
 * Anomalie du texte source, non corrigée silencieusement (comme pour "452",
 * voir plus haut) : les comptes "832" et "842" annoncent des subdivisions
 * (8311/8315, 8411/8412/8415) dont la numérotation ne commence PAS par leur
 * propre préfixe · ces enfants sont numériquement rattachés à 831/841. Un
 * total à 832/842 n'aurait donc rien à agréger. Ils sont volontairement omis
 * ici ; voir le commentaire de classe8-comptes80-89.md dans le skill sycebnl.
 */
const totauxDivisionnaires: LigneSeed[] = [
// ===== CLASSE 1 =====
  total('101', 'Dotation non consomptible sans droit de reprise', ClasseCompte.CLASSE_1, SOLDE),
  total('102', 'Dotation non consomptible avec droit de reprise', ClasseCompte.CLASSE_1, SOLDE),
  total('104', 'Dotation consomptible', ClasseCompte.CLASSE_1, SOLDE),
  total('106', 'Écarts de réévaluation', ClasseCompte.CLASSE_1, SOLDE),
  total('141', "Subventions d'équipement", ClasseCompte.CLASSE_1, SOLDE),
  total('167', "Fonds provenant de dons et legs d'immobilisations", ClasseCompte.CLASSE_1, SOLDE),
  total('185', 'Dépôts et cautionnements reçus', ClasseCompte.CLASSE_1, SOLDE),
  total('186', 'Intérêts courus', ClasseCompte.CLASSE_1, SOLDE),
  total('187', 'Dettes de location-acquisition', ClasseCompte.CLASSE_1, SOLDE),
  total('198', 'Autres provisions pour risques et charges', ClasseCompte.CLASSE_1, SOLDE),

// ===== CLASSE 2 =====
  total('201', 'Immobilisations incorporelles', ClasseCompte.CLASSE_2, SOLDE),
  total('212', 'Brevets, licences, concessions et droits similaires', ClasseCompte.CLASSE_2, SOLDE),
  total('213', 'Logiciels et sites internet', ClasseCompte.CLASSE_2, SOLDE),
  total('218', 'Autres droits et valeurs incorporels', ClasseCompte.CLASSE_2, SOLDE),
  total('219', 'Immobilisations incorporelles en cours', ClasseCompte.CLASSE_2, SOLDE),
  total('221', 'Terrains agricoles et forestiers', ClasseCompte.CLASSE_2, SOLDE),
  total('222', 'Terrains nus', ClasseCompte.CLASSE_2, SOLDE),
  total('223', 'Terrains bâtis', ClasseCompte.CLASSE_2, SOLDE),
  total('224', 'Travaux de mise en valeur des terrains', ClasseCompte.CLASSE_2, SOLDE),
  total('226', 'Terrains aménagés', ClasseCompte.CLASSE_2, SOLDE),
  total('228', 'Autres terrains', ClasseCompte.CLASSE_2, SOLDE),
  total('229', 'Aménagements de terrains en cours', ClasseCompte.CLASSE_2, SOLDE),
  total('231', 'Bâtiments industriels, agricoles, administratifs, commerciaux, religieux et autres sur sol propre', ClasseCompte.CLASSE_2, SOLDE),
  total('232', "Bâtiments industriels, agricoles, administratifs, commerciaux, religieux et autres sur sol d'autrui", ClasseCompte.CLASSE_2, SOLDE),
  total('233', "Ouvrages d'infrastructure", ClasseCompte.CLASSE_2, SOLDE),
  total('234', 'Aménagements, agencements et installations techniques', ClasseCompte.CLASSE_2, SOLDE),
  total('235', 'Aménagements de bureaux et assimilés', ClasseCompte.CLASSE_2, SOLDE),
  total('238', 'Autres installations et agencements', ClasseCompte.CLASSE_2, SOLDE),
  total('239', 'Bâtiments, aménagements, agencements et installations en cours', ClasseCompte.CLASSE_2, SOLDE),
  total('241', 'Matériel et outillage industriel et commercial', ClasseCompte.CLASSE_2, SOLDE),
  total('242', 'Matériel et outillage agricole', ClasseCompte.CLASSE_2, SOLDE),
  total('244', 'Matériel et mobilier', ClasseCompte.CLASSE_2, SOLDE),
  total('245', 'Matériel de transport', ClasseCompte.CLASSE_2, SOLDE),
  total('246', 'Actifs biologiques', ClasseCompte.CLASSE_2, SOLDE),
  total('247', 'Agencements, aménagements du matériel et des actifs biologiques', ClasseCompte.CLASSE_2, SOLDE),
  total('248', 'Autres matériels et mobiliers', ClasseCompte.CLASSE_2, SOLDE),
  total('249', 'Matériels et actifs biologiques en cours', ClasseCompte.CLASSE_2, SOLDE),
  total('271', 'Prêts et créances', ClasseCompte.CLASSE_2, SOLDE),
  total('272', 'Prêts au personnel', ClasseCompte.CLASSE_2, SOLDE),
  total('273', "Créances sur l'Etat", ClasseCompte.CLASSE_2, SOLDE),
  total('274', 'Titres immobilisés', ClasseCompte.CLASSE_2, SOLDE),
  total('275', 'Dépôts et cautionnements versés', ClasseCompte.CLASSE_2, SOLDE),
  total('276', 'Intérêts courus', ClasseCompte.CLASSE_2, SOLDE),
  total('278', 'Immobilisations financières diverses', ClasseCompte.CLASSE_2, SOLDE),
  total('281', 'Amortissements des immobilisations incorporelles', ClasseCompte.CLASSE_2, SOLDE),
  total('282', 'Amortissements des terrains', ClasseCompte.CLASSE_2, SOLDE),
  total('283', 'Amortissements des bâtiments, installations techniques et agencements', ClasseCompte.CLASSE_2, SOLDE),
  total('284', 'Amortissements du matériel', ClasseCompte.CLASSE_2, SOLDE),
  total('290', "Dépréciations des immobilisations destinées à la vente provenant de dons et legs non encore reçus et d'usufruit temporaire", ClasseCompte.CLASSE_2, SOLDE),
  total('291', 'Dépréciations des immobilisations incorporelles', ClasseCompte.CLASSE_2, SOLDE),
  total('292', 'Dépréciations des terrains', ClasseCompte.CLASSE_2, SOLDE),
  total('293', 'Dépréciations des bâtiments, installations techniques et agencements', ClasseCompte.CLASSE_2, SOLDE),
  total('294', "Dépréciations du matériel, du mobilier et de l'actif biologique", ClasseCompte.CLASSE_2, SOLDE),
  total('295', 'Dépréciations des avances et acomptes versés sur immobilisations', ClasseCompte.CLASSE_2, SOLDE),
  total('296', 'Dépréciations des titres de participation', ClasseCompte.CLASSE_2, SOLDE),
  total('297', 'Dépréciations des autres immobilisations financières', ClasseCompte.CLASSE_2, SOLDE),

// ===== CLASSE 3 =====
  total('335', 'Emballages', ClasseCompte.CLASSE_3, SOLDE),
  total('363', 'Actifs biologiques', ClasseCompte.CLASSE_3, SOLDE),
  total('377', 'Stocks en consignation ou en dépôt', ClasseCompte.CLASSE_3, SOLDE),

// ===== CLASSE 4 =====
  total('401', 'Fournisseurs, dettes en compte', ClasseCompte.CLASSE_4, DETAIL),
  total('402', 'Fournisseurs, effets à payer', ClasseCompte.CLASSE_4, DETAIL),
  total('408', 'Fournisseurs, factures non parvenues', ClasseCompte.CLASSE_4, DETAIL),
  total('409', 'Fournisseurs débiteurs', ClasseCompte.CLASSE_4, DETAIL),
  total('413', 'Adhérents, Clients-usagers, chèques, effets et autres valeurs impayés', ClasseCompte.CLASSE_4, DETAIL),
  total('416', 'Créances, adhérents, clients-usagers litigieuses ou douteuses', ClasseCompte.CLASSE_4, DETAIL),
  total('418', 'Adhérents, clients-usagers produits à recevoir', ClasseCompte.CLASSE_4, DETAIL),
  total('419', 'Adhérents, Clients-usagers créditeurs', ClasseCompte.CLASSE_4, DETAIL),
  total('421', 'Avances et acomptes', ClasseCompte.CLASSE_4, SOLDE),
  total('423', 'Oppositions, saisies arrêts', ClasseCompte.CLASSE_4, SOLDE),
  total('424', 'Œuvres sociales internes', ClasseCompte.CLASSE_4, SOLDE),
  total('425', 'Représentants du personnel', ClasseCompte.CLASSE_4, SOLDE),
  total('428', 'Personnel, charges à payer et produits à recevoir', ClasseCompte.CLASSE_4, SOLDE),
  total('431', 'Sécurité sociale', ClasseCompte.CLASSE_4, SOLDE),
  total('432', 'Caisses de retraite', ClasseCompte.CLASSE_4, SOLDE),
  total('433', 'Autres organismes sociaux', ClasseCompte.CLASSE_4, SOLDE),
  total('438', 'Organismes sociaux, charges à payer et produits à recevoir', ClasseCompte.CLASSE_4, SOLDE),
  total('442', 'Etat, autres impôts et taxes', ClasseCompte.CLASSE_4, SOLDE),
  total('443', 'Etat, T.V.A. Facturée', ClasseCompte.CLASSE_4, SOLDE),
  total('444', 'T.V.A. due ou crédit de T.V.A.', ClasseCompte.CLASSE_4, SOLDE),
  total('445', 'T.V.A. Récupérable', ClasseCompte.CLASSE_4, SOLDE),
  total('447', 'Etat, impôts retenus à la source', ClasseCompte.CLASSE_4, SOLDE),
  total('448', 'État, charges à payer et produits à recevoir', ClasseCompte.CLASSE_4, SOLDE),
  total('449', 'Etat, créances et dettes diverses', ClasseCompte.CLASSE_4, SOLDE),
  total('451', 'Associations et assimilées', ClasseCompte.CLASSE_4, DETAIL),
  total('452', 'Fondations et assimilées', ClasseCompte.CLASSE_4, DETAIL),
  total('453', 'Ordres professionnels', ClasseCompte.CLASSE_4, DETAIL),
  total('454', 'Organisations politiques', ClasseCompte.CLASSE_4, DETAIL),
  total('455', 'Organisations syndicales', ClasseCompte.CLASSE_4, DETAIL),
  total('456', 'Organisations religieuses, apporteurs', ClasseCompte.CLASSE_4, DETAIL),
  total('457', 'Mécènes, bénévoles et assimilés', ClasseCompte.CLASSE_4, DETAIL),
  total('469', "Fonds d'administration à recevoir", ClasseCompte.CLASSE_4, DETAIL),
  total('471', 'Débiteurs et créditeurs divers', ClasseCompte.CLASSE_4, DETAIL),
  total('472', 'Créances et dettes sur titres de placement', ClasseCompte.CLASSE_4, DETAIL),
  total('473', 'Organismes nationaux et internationaux – subventions à recevoir', ClasseCompte.CLASSE_4, DETAIL),
  total('474', 'Compte de répartition périodique des charges et des produits', ClasseCompte.CLASSE_4, DETAIL),
  total('478', 'Écarts de conversion - actif', ClasseCompte.CLASSE_4, DETAIL),
  total('479', 'Écarts de conversion - passif', ClasseCompte.CLASSE_4, DETAIL),
  total('481', "Fournisseurs d'investissements", ClasseCompte.CLASSE_4, SOLDE),
  total('485', "Créances sur cessions d'immobilisations", ClasseCompte.CLASSE_4, SOLDE),
  total('486', "Dettes et créances des legs et dons d'immobilisations", ClasseCompte.CLASSE_4, SOLDE),
  total('488', 'Autres créances hors activités ordinaires', ClasseCompte.CLASSE_4, SOLDE),
  total('491', 'Adhérents et clients-usagers, dépréciations', ClasseCompte.CLASSE_4, SOLDE),
  total('498', 'Dépréciations des comptes de créances H.A.O.', ClasseCompte.CLASSE_4, SOLDE),
  total('499', 'Provisions pour risques et charges à court terme', ClasseCompte.CLASSE_4, SOLDE),

// ===== CLASSE 5 =====
  total('501', 'Titres du Trésor et bons de caisse à court terme', ClasseCompte.CLASSE_5, SOLDE),
  total('502', 'Actions', ClasseCompte.CLASSE_5, SOLDE),
  total('503', 'Obligations', ClasseCompte.CLASSE_5, SOLDE),
  total('504', 'Bons de souscription', ClasseCompte.CLASSE_5, SOLDE),
  total('506', 'Intérêts courus', ClasseCompte.CLASSE_5, SOLDE),
  total('518', 'Valeurs à encaisser, autres', ClasseCompte.CLASSE_5, SOLDE),
  total('521', 'Banques locales', ClasseCompte.CLASSE_5, SOLDE),
  total('526', 'Banques, intérêts courus', ClasseCompte.CLASSE_5, SOLDE),
  total('536', 'Établissements financiers, intérêts courus', ClasseCompte.CLASSE_5, SOLDE),

// ===== CLASSE 6 =====
  total('601', "Achats de biens et services liés à l'activité", ClasseCompte.CLASSE_6, AUCUN),
  total('602', 'Achats de marchandises, de matières premières et fournitures liées', ClasseCompte.CLASSE_6, AUCUN),
  total('604', 'Achats stockés de matières et fournitures consommables', ClasseCompte.CLASSE_6, AUCUN),
  total('605', 'Autres achats', ClasseCompte.CLASSE_6, AUCUN),
  total('608', "Achats d'emballages", ClasseCompte.CLASSE_6, AUCUN),
  total('618', 'Autres frais de transport', ClasseCompte.CLASSE_6, AUCUN),
  total('622', 'Locations, charges locatives', ClasseCompte.CLASSE_6, AUCUN),
  total('623', 'Redevances de location-acquisition', ClasseCompte.CLASSE_6, AUCUN),
  total('624', 'Entretien, réparation, remise en état et maintenance', ClasseCompte.CLASSE_6, AUCUN),
  total('625', "Primes d'assurance", ClasseCompte.CLASSE_6, AUCUN),
  total('626', 'Études, recherches et documentation', ClasseCompte.CLASSE_6, AUCUN),
  total('627', 'Publicité, publications, relations publiques', ClasseCompte.CLASSE_6, AUCUN),
  total('628', 'Frais de télécommunications', ClasseCompte.CLASSE_6, AUCUN),
  total('631', 'Frais bancaires', ClasseCompte.CLASSE_6, AUCUN),
  total('632', "Rémunérations d'intermédiaires et de conseils", ClasseCompte.CLASSE_6, AUCUN),
  total('634', 'Redevances pour brevets, licences, logiciels, sites internet, concessions et droits et valeurs similaires', ClasseCompte.CLASSE_6, AUCUN),
  total('635', 'Cotisations', ClasseCompte.CLASSE_6, AUCUN),
  total('637', "Rémunérations de personnel extérieur à l'entité", ClasseCompte.CLASSE_6, AUCUN),
  total('638', 'Autres charges externes', ClasseCompte.CLASSE_6, AUCUN),
  total('641', 'Impôts et taxes directs', ClasseCompte.CLASSE_6, AUCUN),
  total('646', "Droits d'enregistrement", ClasseCompte.CLASSE_6, AUCUN),
  total('647', 'Pénalités, amendes fiscales', ClasseCompte.CLASSE_6, AUCUN),
  total('651', 'Pertes sur créances adhérents clients, et autres débiteurs', ClasseCompte.CLASSE_6, AUCUN),
  total('654', 'Dons en nature courants à distribuer', ClasseCompte.CLASSE_6, AUCUN),
  total('659', "Charges pour dépréciations et provisions pour risques à court terme d'exploitation", ClasseCompte.CLASSE_6, AUCUN),
  total('661', 'Rémunérations directes versées au personnel national', ClasseCompte.CLASSE_6, AUCUN),
  total('662', 'Rémunérations directes versées au personnel non national', ClasseCompte.CLASSE_6, AUCUN),
  total('663', 'Indemnités forfaitaires versées au personnel', ClasseCompte.CLASSE_6, AUCUN),
  total('664', 'Charges sociales', ClasseCompte.CLASSE_6, AUCUN),
  total('667', 'Rémunération transférée de personnel extérieur', ClasseCompte.CLASSE_6, AUCUN),
  total('668', 'Autres charges sociales', ClasseCompte.CLASSE_6, AUCUN),
  total('671', 'Intérêts des emprunts', ClasseCompte.CLASSE_6, AUCUN),
  total('672', 'Intérêts dans loyers de location-acquisition', ClasseCompte.CLASSE_6, AUCUN),
  total('674', 'Autres intérêts', ClasseCompte.CLASSE_6, AUCUN),
  total('677', 'Pertes sur titres de placement', ClasseCompte.CLASSE_6, AUCUN),
  total('678', 'Pertes et charges sur risques financiers', ClasseCompte.CLASSE_6, AUCUN),
  total('679', 'Charges pour dépréciations et provisions pour risques à court terme financières', ClasseCompte.CLASSE_6, AUCUN),
  total('691', "Dotations aux provisions et aux dépréciations d'exploitation", ClasseCompte.CLASSE_6, AUCUN),
  total('695', "Dotations aux dépréciations d'immobilisations destinées à la vente provenant des dons et legs non encore reçues et d'usufruit temporaire", ClasseCompte.CLASSE_6, AUCUN),
  total('697', 'Dotations aux provisions et aux dépréciations financières', ClasseCompte.CLASSE_6, AUCUN),
  total('603', 'Variations des stocks de biens achetés et reçus en dons en nature à distribuer', ClasseCompte.CLASSE_6, AUCUN),
  total('606', 'Achats autres activités', ClasseCompte.CLASSE_6, AUCUN),
  total('681', "Dotations aux amortissements d'exploitation", ClasseCompte.CLASSE_6, AUCUN),

// ===== CLASSE 7 =====
  total('759', "Reprises de charges pour dépréciations et provisions pour risques à court terme d'exploitation", ClasseCompte.CLASSE_7, AUCUN),
  total('771', 'Intérêts de prêts et créances diverses', ClasseCompte.CLASSE_7, AUCUN),
  total('772', 'Revenus de participations et autres titres immobilisés', ClasseCompte.CLASSE_7, AUCUN),
  total('774', 'Revenus de placement', ClasseCompte.CLASSE_7, AUCUN),
  total('778', 'Gains sur risques financiers', ClasseCompte.CLASSE_7, AUCUN),
  total('779', 'Reprises de charges pour dépréciations et provisions pour risques à court terme financières', ClasseCompte.CLASSE_7, AUCUN),
  total('791', "Reprises de provisions et dépréciations d'exploitation", ClasseCompte.CLASSE_7, AUCUN),
  total('792', "Reprises de fonds affectés et provenant des dons et legs d'immobilisations", ClasseCompte.CLASSE_7, AUCUN),
  total('795', "Reprises des dépréciations d'immobilisations reçues destinées à la vente provenant des dons et legs et d'usufruit temporaire", ClasseCompte.CLASSE_7, AUCUN),
  total('796', 'Reprises des fonds reportés', ClasseCompte.CLASSE_7, AUCUN),
  total('797', 'Reprises de provisions et dépréciations financières', ClasseCompte.CLASSE_7, AUCUN),
  total('704', 'Revenus liés à la générosité', ClasseCompte.CLASSE_7, AUCUN),
  total('705', 'Ventes de marchandises, de services et de produits finis', ClasseCompte.CLASSE_7, AUCUN),
  total('708', 'Autres revenus', ClasseCompte.CLASSE_7, AUCUN),
  total('754', 'Dons en nature courants', ClasseCompte.CLASSE_7, AUCUN),
  total('758', 'Produits divers', ClasseCompte.CLASSE_7, AUCUN),

];

export const PLAN_COMPTES_SYCEBNL: Array<{
  numero: string;
  intitule: string;
  classe: ClasseCompte;
  modeReportANouveau: ModeReportANouveau;
  typeCompte?: TypeCompteDetailTotal;
}> = [
  ...totauxClasse1,
  ...classe1,
  ...totauxDivisionnaires,
  ...totauxClasse2,
  ...classe2,
  ...totauxClasse3,
  ...classe3,
  ...totauxClasse4,
  ...classe4Detail,
  ...classe4Solde,
  ...totauxClasse5,
  ...classe5,
  ...totauxClasse6,
  ...classe6,
  ...totauxClasse7,
  ...classe7,
  ...totauxClasse8,
  ...classe8,
  ...totauxClasse9,
  ...classe9,
];
