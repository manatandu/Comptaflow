/**
 * PÉRIMÈTRE COMPTABLE DU REGISTRE DES DONATEURS — rapprochement art. 17 / art. 18.
 *
 * L'article 17 impose un registre « pour tous les dons, donations et legs
 * REÇUS par l'entité » ; l'article 18 charge l'auditeur d'un rapport qui
 * « constate l'existence du registre des donateurs et donne son avis sur sa
 * tenue conforme ». Pour donner cet avis, il faut confronter le registre à la
 * comptabilité : c'est l'objet de cette table.
 *
 * ⚠️ Aucun tableau de correspondance officiel n'existe pour ce rapprochement
 * — le référentiel ne le prévoit ni à l'art. 17, ni à l'art. 18, ni dans la
 * Partie 4. Cette table est donc CONSTRUITE, compte par compte, à partir de
 * deux sources et de rien d'autre :
 *   - la définition de l'opération dans le glossaire officiel (Partie 1 ch. 1)
 *     et dans la Partie 3 ch. 4 « Dons » ;
 *   - le plan des comptes (Partie 2 ch. 2).
 * Chaque entrée porte sa citation. Aucun compte n'y figure « par analogie ».
 *
 * Le classement en trois catégories n'est pas un confort de présentation :
 * il matérialise une TENSION du texte que ce module ne tranche pas.
 *   - Le compte 704 s'intitule « Revenus liés à la générosité », et la
 *     générosité est définie comme « l'expression d'un acte d'altruisme,
 *     d'une libéralité, d'un geste de don » : à ce titre, TOUT le 704
 *     relèverait du registre.
 *   - Mais l'article 17 vise « les dons, donations et legs », et la donation
 *     est définie comme un transfert « SANS CONTREPARTIE et avec intention
 *     libérale » — alors que le parrainage, logé au 7047, est défini « en vue
 *     d'en retirer un BÉNÉFICE DIRECT ».
 * Les deux lectures ne peuvent pas être vraies ensemble pour le 7047. Le
 * texte ne dit pas laquelle l'emporte : le rapport expose les deux avec
 * leurs citations et laisse le dossier décider (règle §2.6 — ne jamais
 * combler une lacune du référentiel par une intuition).
 */

/**
 * Sens de lecture du mouvement de l'exercice sur un compte du périmètre.
 *
 * La distinction n'est pas cosmétique : lue en net, la libéralité en nature
 * DISPARAÎT partiellement du rapprochement. Les dons en nature non consommés
 * à la clôture sont en effet extournés au débit du compte de produit
 * (Partie 3 ch. 4 § 1.2 : « 7542 Dons en nature courants reçus à distribuer »
 * au débit par « 4713 Créditeurs, dons en nature courants non consommés » au
 * crédit). Ce débit ne réduit pas les dons REÇUS — il en diffère seulement la
 * consommation. Le registre, lui, les a bien enregistrés à leur date de
 * réception : c'est donc le crédit seul qui lui fait face.
 */
export type LectureLiberalite = 'NET_CREDIT' | 'CREDIT_SEUL';

export interface CompteLiberalite {
  /** Préfixe de numéro de compte, tel qu'au plan des comptes (Partie 2 ch. 2). */
  numero: string;
  intitule: string;
  lecture: LectureLiberalite;
  /** Citation qui justifie l'inscription du compte dans cette catégorie. */
  fondement: string;
}

/**
 * Comptes dont l'opération répond, sans réserve, à la définition de l'article
 * 17 : une libéralité reçue, sans contrepartie. Leur total doit égaler le
 * total du registre sur l'exercice.
 */
export const COMPTES_LIBERALITE: CompteLiberalite[] = [
  {
    numero: '7041',
    intitule: 'Dons',
    lecture: 'NET_CREDIT',
    fondement:
      'Partie 3 ch. 4 § 3 : « les dons : remise de fonds sans contrepartie avec une intention libérale ». Visé mot pour mot par l’art. 17.',
  },
  {
    numero: '7042',
    intitule: 'Legs',
    lecture: 'NET_CREDIT',
    fondement:
      'Glossaire, LEGS : « transmission testamentaire du patrimoine d’une personne réalisée à son décès ». Visé mot pour mot par l’art. 17.',
  },
  {
    numero: '7043',
    intitule: 'Deniers du culte',
    lecture: 'NET_CREDIT',
    fondement:
      'Partie 3 ch. 4 § 3 : « une somme d’argent que les catholiques versent pour subvenir aux besoins du culte » — versement sans contrepartie.',
  },
  {
    numero: '7044',
    intitule: 'Zakat, dîme, quête et assimilées',
    lecture: 'NET_CREDIT',
    fondement:
      'Glossaire, ZAKAT : « une forme de dons, d’aumônes ». Le texte qualifie donc lui-même l’opération de don.',
  },
  {
    numero: '7046',
    intitule: 'Mécénats',
    lecture: 'NET_CREDIT',
    fondement:
      'Partie 3 ch. 4 § 3 : « un soutien matériel apporté par une personne physique ou morale SANS CONTREPARTIE DIRECTE à une œuvre ou à une entité ».',
  },
  {
    numero: '7542',
    intitule: 'Dons en nature courants reçus à distribuer',
    lecture: 'CREDIT_SEUL',
    fondement:
      'Partie 3 ch. 4 § 1.1 : les dons en nature reçus sont portés « au débit du compte 654 par le crédit du compte 7542 ». L’art. 17 admet la libération « en nature ». Lu au crédit seul : le débit est l’extourne de clôture des dons non consommés (§ 1.2).',
  },
  {
    numero: '8415',
    intitule: 'Dons en nature H.A.O. à distribuer',
    lecture: 'CREDIT_SEUL',
    fondement:
      'Partie 3 ch. 4 § 1.1, cas de non-récurrence : « au débit du compte 832 par le crédit du compte 8415 ». Même lecture au crédit seul que le 7542 (extourne § 1.2 par le 488).',
  },
  {
    numero: '1671',
    intitule: 'Fonds provenant de dons et legs d’immobilisations — affectés',
    lecture: 'CREDIT_SEUL',
    fondement:
      'Glossaire, FONDS PROPRES PROVENANT DE LEGS ET DE DONS D’IMMOBILISATIONS : « dons et legs d’immobilisations destinés à être conservés par l’entité » — reçus, donc dans le champ de l’art. 17. Lu au crédit seul : le débit est la reprise au résultat au rythme des amortissements.',
  },
  {
    numero: '1672',
    intitule: 'Fonds provenant de dons et legs d’immobilisations — non affectés',
    lecture: 'CREDIT_SEUL',
    fondement: 'Même fondement que le 1671 (Partie 2 ch. 2, subdivisions du compte 167).',
  },
  {
    numero: '171',
    intitule: 'Donation temporaire d’usufruit',
    lecture: 'CREDIT_SEUL',
    fondement:
      'Glossaire, DONATION TEMPORAIRE D’USUFRUIT : « Le donateur donne le droit d’user et de percevoir les revenus d’un de ses biens à un bénéficiaire nommément désigné ». C’est une donation reçue. Lu au crédit seul : le débit est la reprise (7961).',
  },
];

/**
 * Comptes que le plan range sous la générosité mais dont la définition propre
 * introduit une contrepartie, ou que le texte ne qualifie pas. Le rapport les
 * chiffre à part, avec la citation qui fait difficulté, SANS les ajouter ni
 * les retrancher du rapprochement : c'est au dossier de trancher, opération
 * par opération.
 */
export const COMPTES_FRONTIERE: CompteLiberalite[] = [
  {
    numero: '7045',
    intitule: 'Célébrations',
    lecture: 'NET_CREDIT',
    fondement:
      'Partie 3 ch. 4 § 3 : « les revenus perçus lors des célébrations religieuses (baptême, mariage etc.) ». Une célébration est rendue en regard du versement : la condition « sans contrepartie » de la définition de la DONATION n’est pas manifestement remplie.',
  },
  {
    numero: '7047',
    intitule: 'Parrainage',
    lecture: 'NET_CREDIT',
    fondement:
      'Glossaire, PARRAINAGE : « soutien matériel apporté […] EN VUE D’EN RETIRER UN BÉNÉFICE DIRECT. Les opérations de parrainage sont destinées à promouvoir l’image du “parraineur” dans un but spécifique (commercial, politique, etc.) ». Contradiction frontale avec « sans contrepartie » (définition de la DONATION), alors même que le compte 704 s’intitule « Revenus liés à la générosité ».',
  },
  {
    numero: '7048',
    intitule: 'Autres revenus liés à la générosité',
    lecture: 'NET_CREDIT',
    fondement:
      'Poste résiduel : le texte n’en nomme pas le contenu (Partie 2 ch. 2, subdivisions du compte 704). Indéterminable a priori.',
  },
];

/**
 * Comptes régulièrement confondus avec les précédents, et qui n'ont PAS leur
 * place dans le rapprochement. Les exposer nommément vaut mieux que les taire :
 * un rapprochement muet sur eux se lit comme un rapprochement qui les a oubliés.
 */
export const COMPTES_HORS_PERIMETRE: CompteLiberalite[] = [
  {
    numero: '475',
    intitule: 'Générosités financières à recevoir',
    lecture: 'NET_CREDIT',
    fondement:
      'Partie 3 ch. 4 § 3 : « Les revenus de générosité PROMIS NON ENCORE REÇUS en fin d’exercice […] doivent faire l’objet d’un rattachement à l’exercice par le biais du compte 475 ». L’art. 17 ne vise que les libéralités « reçues » et « mises à la disposition » de l’entité : une promesse n’entre au registre qu’à son encaissement.',
  },
  {
    numero: '7081',
    intitule: 'Ventes de dons en nature',
    lecture: 'NET_CREDIT',
    fondement:
      'Partie 3 ch. 4 § 2 : « Les dons en nature reçus destinés à la vente sont suivis en EXTRA COMPTABLE jusqu’à la date de cession. » Le 7081 enregistre le produit de la vente, pas la libéralité. Le don lui-même n’a AUCUNE trace comptable : le registre est sa seule trace, et le rapprochement ne peut pas le vérifier.',
  },
  {
    numero: '8411',
    intitule: 'Dons en nature H.A.O. vendus',
    lecture: 'NET_CREDIT',
    fondement: 'Même fondement que le 7081, cas de non-récurrence (Partie 3 ch. 4 § 2).',
  },
  {
    numero: '172',
    intitule: 'Donations et legs non encore reçus d’immobilisations destinées à la vente',
    lecture: 'CREDIT_SEUL',
    fondement:
      'Glossaire, FONDS REPORTÉS : « donations ou legs d’immobilisations NON ENCORE REÇUS ». Hors du champ de l’art. 17 tant que la remise n’a pas eu lieu.',
  },
  {
    numero: '1679',
    intitule: 'Engagements auprès du donateur',
    lecture: 'CREDIT_SEUL',
    fondement:
      'Partie 2 ch. 2, subdivisions du compte 167 : un engagement pris envers le donateur, non une libéralité reçue.',
  },
];
