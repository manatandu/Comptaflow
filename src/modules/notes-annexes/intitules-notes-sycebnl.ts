/**
 * INTITULÉS DES NOTES ANNEXES SYCEBNL · deux tables officielles, et elles ne
 * disent pas toujours la même chose (passe R6).
 *
 * La FICHE RÉCAPITULATIVE DES NOTES ANNEXES PRÉSENTÉES (Partie 4 ch. 2 et
 * ch. 3, section 4) nomme chaque note dans sa colonne « INTITULE ». Le TITRE
 * de chaque note est écrit en tête de son modèle (« NOTE 7 : ACTIF CIRCULANT
 * ET DETTES CIRCULANTES HAO »). OmegaX servait l'un et l'autre avec le titre
 * de son PREMIER TABLEAU · juste pour une note à un seul tableau, faux pour
 * celles qui en ont plusieurs (notes 1, 7 et 29B des associations, 4 et 20B
 * des projets), qui s'imprimaient sous l'intitulé d'un de leurs tableaux.
 *
 * Les deux tables sont transcrites mot pour mot, chacune à sa place · la
 * fiche récapitulative imprime la première, la feuille et l'écran de la note
 * la seconde. Numéros de ligne : sycebnl/references/partie4-ch2 et ch3.
 *
 * [texte officiel] Écarts entre la fiche et le titre de la note, signalés,
 * non tranchés · 5E « Immobilisations : Amortissements » contre
 * « IMMOBILISATIONS (AMORTISSEMENTS) », 5F de même, 29B « Effectifs, masse
 * salariale et personnel extérieur » contre « EFFECTIF, MASSE SALARIALE ET
 * PERSONNEL » (associations) ; 2 « (Informations spécifiques : Tableau
 * emplois ressources ; Tableau d'exécution budgétaire ; Tableau de
 * réconciliation de trésorerie) » contre « INFORMATIONS SPECIFIQUES », 12
 * « DETTES FOURNISSEURS ET ASSIMILEES, DETTES FISCALES ET SOCIALES » contre
 * « DETTES FOURNISSEURS ET ASSIMILEES, FISCALES ET SOCIALES », 20B
 * « EFFECTIFS, MASSE SALARIALE ET PERSONNEL EXTERIEUR » contre « EFFECTIFS,
 * MASSE SALARIALE ET PERSONNEL » (projets). Chaque table garde son texte.
 */
import { JeuNotesAnnexes } from '@prisma/client';

export const INTITULES_FICHE_ASSOCIATIONS: Readonly<Record<string, string>> = {
  '1': 'Dettes garanties par des sûretés réelles, engagements financiers et contributions volontaires en nature', // l. 180
  '2': 'Informations obligatoires', // l. 181
  '3': "Evènements postérieurs à la clôture de l'exercice", // l. 182
  '4': "Changements de méthodes comptables, d'estimations et corrections d'erreurs", // l. 183
  '5A': "Dons et legs d'immobilisations non reçus destinés à la vente et usufruit temporaire", // l. 189
  '5B': 'Immobilisations brutes', // l. 190
  '5C': 'Biens pris en location – acquisition', // l. 191
  '5D': "Dons et legs d'immobilisations non reçus destinés à la vente et usufruit temporaire (amortissements et dépréciations)", // l. 192
  '5E': 'Immobilisations : Amortissements', // l. 193
  '5F': 'Immobilisations : Dépréciations', // l. 194
  '5G': 'Immobilisations : Plus-values et moins-values de cession', // l. 195
  '5H': "Informations sur les réévaluations effectuées par l'entité", // l. 196
  '6': 'Immobilisations financières', // l. 197
  '7': 'Actif circulant et dettes circulantes HAO', // l. 198
  '8': 'Stocks et encours', // l. 199
  '9': 'Adhérents, clients-usagers', // l. 200
  '10': 'Autres créances', // l. 201
  '11': 'Titres de placement', // l. 202
  '12': 'Valeurs à encaisser', // l. 203
  '13': 'Disponibilités', // l. 204
  '14': 'Ecarts de conversion', // l. 205
  '15': 'Dotation', // l. 206
  '16': 'Réserves', // l. 207
  '17A': 'Subventions et provisions règlementées', // l. 208
  '17B': 'Fonds affectés et reportés', // l. 209
  '18A': 'Dettes financières et ressources assimilées', // l. 210
  '18B': 'Actifs et passifs éventuels', // l. 211
  '19': "Fournisseurs d'exploitation", // l. 212
  '20': 'Dettes fiscales et sociales', // l. 213
  '21': 'Autres dettes et provisions pour risques et charges à court terme', // l. 214
  '22': "Banques, crédit d'escompte et de trésorerie", // l. 215
  '23': 'Revenus et autres produits', // l. 221
  '24': 'Achats', // l. 222
  '25': 'Transports', // l. 223
  '26': 'Services extérieurs', // l. 224
  '27': 'Impôts et taxes', // l. 225
  '28': 'Autres charges', // l. 226
  '29A': 'Charges de personnel', // l. 227
  '29B': 'Effectifs, masse salariale et personnel extérieur', // l. 228
  '30': 'Dotations et charges pour provisions et dépréciations', // l. 229
  '31': 'Charges et revenus financiers', // l. 230
  '32': 'Autres charges et produits HAO', // l. 231
  '33': 'Fiche de synthèse des principaux indicateurs financiers', // l. 237
  '34': 'Liste des informations sociales, environnementales et sociétales', // l. 238
  '35': "Tableau d'exécution budgétaire", // l. 239
};

export const TITRES_DE_NOTE_ASSOCIATIONS: Readonly<Record<string, string>> = {
  '1': 'DETTES GARANTIES PAR DES SURETES REELLES, ENGAGEMENTS FINANCIERS ET CONTRIBUTIONS VOLONTAIRES EN NATURE', // l. 247
  '2': 'INFORMATIONS OBLIGATOIRES', // l. 294
  '3': "EVENEMENTS POSTERIEURS A LA CLOTURE DE L'EXERCICE", // l. 305
  '4': "CHANGEMENTS DE METHODES COMPTABLES, D'ESTIMATIONS ET CORRECTIONS D'ERREURS", // l. 315
  '5A': "DONS ET LEGS D'IMMOBILISATIONS NON REÇUS DESTINES A LA VENTE ET USUFRUIT TEMPORAIRE", // l. 323
  '5B': 'IMMOBILISATIONS BRUTES', // l. 333
  '5C': 'BIENS PRIS EN LOCATION-ACQUISITION', // l. 343
  '5D': "DONS ET LEGS D'IMMOBILISATIONS NON REÇUS DESTINES A LA VENTE ET USUFRUIT TEMPORAIRE (AMORTISSEMENTS ET DEPRECIATIONS)", // l. 355
  '5E': 'IMMOBILISATIONS (AMORTISSEMENTS)', // l. 363
  '5F': 'IMMOBILISATIONS (DEPRECIATIONS)', // l. 373
  '5G': 'IMMOBILISATIONS : PLUS-VALUES ET MOINS-VALUES DE CESSION', // l. 383
  '5H': "INFORMATIONS SUR LES REEVALUATIONS EFFECTUEES PAR L'ENTITE", // l. 393
  '6': 'IMMOBILISATIONS FINANCIERES', // l. 403
  '7': 'ACTIF CIRCULANT ET DETTES CIRCULANTES HAO', // l. 413
  '8': 'STOCKS ET ENCOURS', // l. 425
  '9': 'ADHERENTS, CLIENTS-USAGERS', // l. 437
  '10': 'AUTRES CREANCES', // l. 447
  '11': 'TITRES DE PLACEMENT', // l. 457
  '12': 'VALEURS A ENCAISSER', // l. 467
  '13': 'DISPONIBILITES', // l. 477
  '14': 'ECARTS DE CONVERSION', // l. 489
  '15': 'DOTATION', // l. 499
  '16': 'RESERVES', // l. 507
  '17A': 'SUBVENTIONS ET PROVISIONS REGLEMENTEES', // l. 517
  '17B': 'FONDS AFFECTES ET REPORTES', // l. 527
  '18A': 'DETTES FINANCIERES ET RESSOURCES ASSIMILEES', // l. 537
  '18B': 'ACTIFS ET PASSIFS EVENTUELS', // l. 549
  '19': "FOURNISSEURS D'EXPLOITATION", // l. 559
  '20': 'DETTES FISCALES ET SOCIALES', // l. 569
  '21': 'AUTRES DETTES ET PROVISIONS POUR RISQUES ET CHARGES A COURT TERME', // l. 579
  '22': "BANQUES, CREDIT D'ESCOMPTE ET DE TRESORERIE", // l. 589
  '23': 'REVENUS ET AUTRES PRODUITS', // l. 601
  '24': 'ACHATS', // l. 611
  '25': 'TRANSPORTS', // l. 621
  '26': 'SERVICES EXTERIEURS', // l. 631
  '27': 'IMPOTS ET TAXES', // l. 641
  '28': 'AUTRES CHARGES', // l. 653
  '29A': 'CHARGES DE PERSONNEL', // l. 663
  '29B': 'EFFECTIF, MASSE SALARIALE ET PERSONNEL', // l. 675
  '30': 'DOTATIONS ET CHARGES POUR PROVISIONS ET DEPRECIATIONS', // l. 688
  '31': 'CHARGES ET REVENUS FINANCIERS', // l. 698
  '32': 'AUTRES CHARGES ET PRODUITS HAO', // l. 708
  '33': 'FICHE DE SYNTHESE DES PRINCIPAUX INDICATEURS FINANCIERS', // l. 718
  '34': 'LISTE DES INFORMATIONS SOCIALES, ENVIRONNEMENTALES ET SOCIETALES', // l. 763
  '35': "TABLEAU D'EXECUTION BUDGETAIRE", // l. 775
};

export const INTITULES_FICHE_PROJETS: Readonly<Record<string, string>> = {
  '1': 'INFORMATIONS OBLIGATOIRES', // l. 190
  '2': "(Informations spécifiques : Tableau emplois ressources ; Tableau d'exécution budgétaire ; Tableau de réconciliation de trésorerie)", // l. 196
  '3A': 'IMMOBILISATIONS BRUTES', // l. 202
  '3B': 'BIENS PRIS EN LOCATION - ACQUISITION', // l. 203
  '4': 'ACTIF CIRCULANT ET DETTES CIRCULANTES HAO', // l. 204
  '5': 'STOCKS ET ENCOURS', // l. 205
  '6': 'CLIENTS-USAGERS ET AUTRES CREANCES', // l. 206
  '7': 'DISPONIBILITES', // l. 207
  '8': 'ECARTS DE CONVERSION', // l. 208
  '9': 'FONDS DU BAILLEUR', // l. 209
  '10': 'SUBVENTIONS', // l. 210
  '11': 'DETTES FINANCIERES ET RESSOURCES ASSIMILEES', // l. 211
  '12': 'DETTES FOURNISSEURS ET ASSIMILEES, DETTES FISCALES ET SOCIALES', // l. 212
  '13': "BANQUES, CREDIT D'ESCOMPTE ET DE TRESORERIE", // l. 213
  '14': 'REVENUS ET AUTRES PRODUITS', // l. 219
  '15': 'ACHATS', // l. 220
  '16': 'TRANSPORTS', // l. 221
  '17': 'SERVICES EXTERIEURS', // l. 222
  '18': 'IMPOTS ET TAXES', // l. 223
  '19': 'AUTRES CHARGES', // l. 224
  '20A': 'CHARGES DE PERSONNEL', // l. 225
  '20B': 'EFFECTIFS, MASSE SALARIALE ET PERSONNEL EXTERIEUR', // l. 226
  '21': 'CHARGES ET REVENUS FINANCIERS', // l. 227
  '22': 'DOTATIONS ET CHARGES POUR PROVISIONS', // l. 228
  '23': 'AUTRES CHARGES ET PRODUITS HAO', // l. 229
  '24': "TABLEAU D'EXECUTION BUDGETAIRE", // l. 230
};

export const TITRES_DE_NOTE_PROJETS: Readonly<Record<string, string>> = {
  '1': 'INFORMATIONS OBLIGATOIRES', // l. 237
  '2': 'INFORMATIONS SPECIFIQUES', // l. 248
  '3A': 'IMMOBILISATIONS BRUTES', // l. 258
  '3B': 'BIENS PRIS EN LOCATION-ACQUISITION', // l. 268
  '4': 'ACTIF CIRCULANT ET DETTES CIRCULANTES HAO', // l. 280
  '5': 'STOCKS ET ENCOURS', // l. 292
  '6': 'CLIENTS-USAGERS ET AUTRES CREANCES', // l. 302
  '7': 'DISPONIBILITES', // l. 312
  '8': 'ECARTS DE CONVERSION', // l. 324
  '9': 'FONDS DU BAILLEUR', // l. 334
  '10': 'SUBVENTIONS', // l. 347
  '11': 'DETTES FINANCIERES ET RESSOURCES ASSIMILEES', // l. 355
  '12': 'DETTES FOURNISSEURS ET ASSIMILEES, FISCALES ET SOCIALES', // l. 365
  '13': "BANQUES, CREDIT D'ESCOMPTE ET DE TRESORERIE", // l. 375
  '14': 'REVENUS ET AUTRES PRODUITS', // l. 387
  '15': 'ACHATS', // l. 397
  '16': 'TRANSPORTS', // l. 407
  '17': 'SERVICES EXTERIEURS', // l. 417
  '18': 'IMPOTS ET TAXES', // l. 427
  '19': 'AUTRES CHARGES', // l. 439
  '20A': 'CHARGES DE PERSONNEL', // l. 449
  '20B': 'EFFECTIFS, MASSE SALARIALE ET PERSONNEL', // l. 461
  '21': 'CHARGES ET REVENUS FINANCIERS', // l. 474
  '22': 'DOTATIONS ET CHARGES POUR PROVISIONS', // l. 484
  '23': 'AUTRES CHARGES ET PRODUITS HAO', // l. 490
  '24': "TABLEAU D'EXECUTION BUDGETAIRE", // l. 500
};

const FICHE_PAR_JEU: Partial<Record<JeuNotesAnnexes, Readonly<Record<string, string>>>> = {
  [JeuNotesAnnexes.ASSOCIATIONS_ORDRES_PROFESSIONNELS]: INTITULES_FICHE_ASSOCIATIONS,
  [JeuNotesAnnexes.PROJETS_DEVELOPPEMENT]: INTITULES_FICHE_PROJETS,
};
const TITRES_PAR_JEU: Partial<Record<JeuNotesAnnexes, Readonly<Record<string, string>>>> = {
  [JeuNotesAnnexes.ASSOCIATIONS_ORDRES_PROFESSIONNELS]: TITRES_DE_NOTE_ASSOCIATIONS,
  [JeuNotesAnnexes.PROJETS_DEVELOPPEMENT]: TITRES_DE_NOTE_PROJETS,
};

/**
 * Intitulé de la note sur la fiche récapitulative. Le SYSCOHADA n'a pas de
 * table ici (passe R2) · il garde le titre de son premier tableau.
 */
export function intituleSurLaFiche(jeu: JeuNotesAnnexes, code: string, repli: string): string {
  return FICHE_PAR_JEU[jeu]?.[code] ?? repli;
}

/** Titre écrit en tête de la note, sur sa feuille et à l'écran. */
export function titreDeLaNote(jeu: JeuNotesAnnexes, code: string, repli: string): string {
  return TITRES_PAR_JEU[jeu]?.[code] ?? repli;
}
