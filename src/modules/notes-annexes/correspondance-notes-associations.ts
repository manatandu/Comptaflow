import { SpecificationNote } from './note-annexe.types';

/**
 * NOTES ANNEXES du jeu SYCEBNL « associations et ordres professionnels ».
 *
 * Source : skill `sycebnl`, `references/partie4-ch2-etats-associations.md`,
 * section 4 (Journal officiel OHADA, n° spécial du 22 février 2023, Partie 4,
 * chapitre 2). Titres, libellés de rubriques, colonnes et commentaires sont
 * transcrits mot pour mot.
 *
 * ## Le rattachement aux comptes n'est PAS donné par le texte
 *
 * Contrairement au bilan et au compte de résultat, les notes n'ont pas de
 * tableau de correspondance officiel : elles n'énumèrent que des libellés.
 * Deux conséquences, tenues fermement ici (règle §2.6) :
 *
 * 1. Un rattachement n'est écrit que lorsqu'il découle **sans jugement** du
 *    plan de comptes normalisé (Partie 2, ch. 2) : le libellé de la rubrique
 *    est celui du compte, au même niveau de subdivision. C'est le cas de
 *    toutes les notes de trésorerie ci-dessous, où le plan descend au
 *    divisionnaire (501 à 508, 513 à 518, 521 à 526…).
 * 2. Quand la rubrique réclame une finesse que le plan normalisé n'a pas, elle
 *    porte `subdivisionAttendue` et reste **non rattachée**. Elle apparaît
 *    dans la note en attente, jamais à zéro. Exemple documenté : la Note 24
 *    « Achats » veut des lignes séparées pour « Matières consommables »,
 *    « Produits d'entretien », « Eau », « Électricité »… alors que le plan
 *    s'arrête au compte 604. Les rattacher au jugé serait une invention ; les
 *    rattacher par ressemblance de libellé serait pire — « Matières
 *    consommables » existe au plan en compte 331, qui est un compte de STOCK.
 *
 * ## Rubriques créditrices intercalées dans une note d'actif
 *
 * Plusieurs notes mêlent, dans un même tableau, des rubriques débitrices et des
 * rubriques créditrices — la Note 9 énumère les créances sur les adhérents PUIS
 * les avances qu'ils ont versées. Ces dernières portent `sens: 'CREDITEUR'`,
 * qui fait deux choses à la fois : ne retenir que les soldes créditeurs, et
 * présenter le montant en positif dans son sens de lecture, comme la maquette.
 * Sans ce qualificatif elles ressortaient en négatif — défaut attrapé par un
 * test avant livraison.
 *
 * ## Ordre des rubriques
 *
 * L'ordre est celui du texte, y compris quand une note mêle des postes
 * d'actif et de passif (Note 9, Note 19) : la maquette officielle le fait.
 * Les index de `totalDeRubriques` renvoient à la position dans ce même
 * tableau, et ne référencent jamais une rubrique postérieure — vérifié par un
 * test structurel.
 */

const COLONNES_STANDARD = [
  { type: 'EXERCICE_N' as const, libelle: 'Année N' },
  { type: 'EXERCICE_N1' as const, libelle: 'Année N-1' },
  { type: 'VARIATION_VALEUR' as const, libelle: 'Variation en valeur' },
  { type: 'VARIATION_POURCENT' as const, libelle: 'Variation en %' },
];

const COLONNES_AVEC_ECHEANCES_CREANCES = [
  ...COLONNES_STANDARD,
  { type: 'ECHEANCE_1AN' as const, libelle: 'Créances à un an au plus' },
  { type: 'ECHEANCE_2ANS' as const, libelle: "Créances à plus d'un an et à deux ans au plus" },
  { type: 'ECHEANCE_PLUS_2ANS' as const, libelle: 'Créances à plus de deux ans' },
];

export const NOTES_ASSOCIATIONS: SpecificationNote[] = [
  {
    code: '7',
    titre: 'ACTIF CIRCULANT ET DETTES CIRCULANTES HAO',
    colonnes: COLONNES_STANDARD,
    renvoyeeDepuis: ['BA', 'DF'],
    rubriques: [
      { libelle: "Créances sur cessions d'immobilisations", comptes: ['485'] },
      { libelle: "Créances reçues par dons et legs d'immobilisations", comptes: ['4865'] },
      { libelle: 'Autres créances hors activités ordinaires', comptes: ['488'], sens: 'DEBITEUR' },
      { libelle: 'TOTAL BRUT', totalDeRubriques: [0, 1, 2] },
      { libelle: 'Dépréciations des créances HAO', comptes: ['498'], presenterEnNegatif: true },
      { libelle: 'TOTAL NET DE DEPRECIATIONS', totalDeRubriques: [3, 4] },
      { libelle: "Fournisseurs d'investissements", comptes: ['481'], sens: 'CREDITEUR' },
      { libelle: "Dettes sur dons et legs d'immobilisations", comptes: ['4861'], sens: 'CREDITEUR' },
      { libelle: 'Autres dettes hors activités ordinaires', comptes: ['484', '488'], sens: 'CREDITEUR' },
      { libelle: 'TOTAL DETTES CIRCULANTES HAO', totalDeRubriques: [6, 7, 8] },
    ],
    commentaire:
      "commenter toute variation significative ; dépréciations : indiquer les événements et circonstances ; indiquer la date et la nature de l'immobilisation achetée et/ou cédée.",
  },

  {
    code: '11',
    titre: 'TITRES DE PLACEMENT',
    colonnes: COLONNES_STANDARD,
    renvoyeeDepuis: ['BU'],
    rubriques: [
      { libelle: 'Titres de trésor et bons de caisse à court terme', comptes: ['501'] },
      { libelle: 'Actions', comptes: ['502'] },
      { libelle: 'Obligations', comptes: ['503'] },
      { libelle: 'Bons de souscription', comptes: ['504'] },
      { libelle: 'Titres négociables hors région', comptes: ['505'] },
      { libelle: 'Intérêts courus', comptes: ['506'] },
      { libelle: 'Autres valeurs assimilées', comptes: ['508'] },
      { libelle: 'TOTAL BRUT', totalDeRubriques: [0, 1, 2, 3, 4, 5, 6] },
      { libelle: 'Dépréciations des titres de placement', comptes: ['590'], presenterEnNegatif: true },
      { libelle: 'TOTAL NET DE DEPRECIATIONS', totalDeRubriques: [7, 8] },
    ],
    commentaire: 'commenter toute variation significative ; indiquer les événements et circonstances motivant la dépréciation et la reprise.',
  },

  {
    code: '12',
    titre: 'VALEURS A ENCAISSER',
    colonnes: COLONNES_STANDARD,
    renvoyeeDepuis: ['BV'],
    rubriques: [
      { libelle: 'Chèques à encaisser', comptes: ['513'] },
      { libelle: "Chèques à l'encaissement", comptes: ['514'] },
      { libelle: 'Cartes de crédit à encaisser', comptes: ['515'] },
      { libelle: 'Autres valeurs à encaisser', comptes: ['518'] },
      { libelle: 'TOTAL BRUT', totalDeRubriques: [0, 1, 2, 3] },
      { libelle: 'Dépréciations des valeurs à encaisser', comptes: ['591'], presenterEnNegatif: true },
      { libelle: 'TOTAL NET DE DEPRECIATIONS', totalDeRubriques: [4, 5] },
    ],
    commentaire: 'commenter toute variation significative ; indiquer les événements et circonstances motivant la dépréciation et la reprise.',
  },

  {
    code: '13',
    titre: 'DISPONIBILITES',
    colonnes: COLONNES_STANDARD,
    renvoyeeDepuis: ['BW'],
    rubriques: [
      { libelle: 'Banques locales', comptes: ['521'] },
      { libelle: 'Banques autres états région', comptes: ['522'] },
      { libelle: 'Banques, dépôt à terme', comptes: ['525'] },
      // 523 (autres États zone monétaire) et 524 (hors zone monétaire) : le
      // texte de la note ne leur donne pas de ligne propre et les regroupe
      // sous « Autres Banques ».
      { libelle: 'Autres Banques', comptes: ['523', '524'] },
      { libelle: 'Banques intérêts courus', comptes: ['526'] },
      { libelle: 'Banques Postales', comptes: ['531'] },
      { libelle: 'Autres établissement financiers', comptes: ['532', '533', '538'] },
      { libelle: 'Etablissement financiers intérêts courus', comptes: ['536'] },
      { libelle: 'Instruments de monnaie électronique', comptes: ['55'] },
      { libelle: 'Caisse', comptes: ['57'] },
      { libelle: 'TOTAL BRUT', totalDeRubriques: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] },
      { libelle: 'Dépréciations', comptes: ['592', '593', '595'], presenterEnNegatif: true },
      { libelle: 'TOTAL NET DE DEPRECIATIONS', totalDeRubriques: [10, 11] },
    ],
    commentaire:
      'indiquer la date de rapprochement des comptes bancaires ; indiquer la date d’inventaire de la caisse et des instruments de monnaie électronique ; justifier toute variation significative.',
  },

  {
    code: '9',
    titre: 'ADHERENTS, CLIENTS-USAGERS',
    colonnes: COLONNES_AVEC_ECHEANCES_CREANCES,
    renvoyeeDepuis: ['BD', 'DG'],
    rubriques: [
      { libelle: 'Adhérents', comptes: ['411'] },
      { libelle: 'Clients-usagers', comptes: ['412'] },
      { libelle: 'Adhérents, clients-usagers, chèques, effets et autres valeurs impayés', comptes: ['416'] },
      { libelle: 'Adhérents, créances litigieuses ou douteuses', comptes: ['417'] },
      { libelle: 'Adhérents, clients-usagers, produits à recevoir', comptes: ['418'] },
      { libelle: 'TOTAL BRUT ADHERENTS, CLIENTS-USAGERS', totalDeRubriques: [0, 1, 2, 3, 4] },
      { libelle: 'Dépréciations des comptes adhérents et clients-usagers', comptes: ['491'], presenterEnNegatif: true },
      { libelle: 'TOTAL NET DE DEPRECIATIONS', totalDeRubriques: [5, 6] },
      { libelle: 'Adhérents, avances reçues', comptes: ['4191'], sens: 'CREDITEUR' },
      { libelle: 'Clients-usagers, avances et acomptes reçus', comptes: ['4192'], sens: 'CREDITEUR' },
      { libelle: 'Autres clients créditeurs', comptes: ['419'], exclusions: ['4191', '4192'], sens: 'CREDITEUR' },
      { libelle: 'TOTAL CLIENTS CREDITEURS', totalDeRubriques: [8, 9, 10] },
    ],
    commentaire:
      'commenter toute variation significative ; commenter les créances anciennes ; indiquer les événements et circonstances motivant la dépréciation et la reprise.',
  },
];
