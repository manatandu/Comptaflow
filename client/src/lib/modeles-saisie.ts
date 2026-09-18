/**
 * MODÈLES DE SAISIE · un jeu par référentiel.
 *
 * Sortis du composant pour être testables : ils citent des NUMÉROS DE
 * COMPTES, et un numéro faux dans un modèle de saisie ne casse rien · il
 * insère une écriture parfaitement valide et parfaitement fausse.
 *
 * ────────────────────────────────────────────────────────────────────────
 * UN ACHAT NE SE RÈGLE PAS PAR LA TRÉSORERIE DANS LA MÊME ÉCRITURE.
 *
 * Ce que ces modèles faisaient jusqu'ici, et qui était faux : chacun tenait en
 * DEUX lignes, un compte de nature contre un compte de trésorerie choisi à
 * l'écran. Un achat débitait la charge et créditait directement la banque. La
 * dette envers le fournisseur n'existait jamais, le compte 401 restait vide,
 * et aucune balance âgée, aucun échéancier, aucun lettrage ne pouvait dire à
 * qui l'entité devait quoi.
 *
 * Le Guide d'application du SYSCOHADA révisé ne laisse aucune latitude sur ce
 * point · Partie 1, chapitre 2, section 1.1 : « Recommandation SYSCOHADA
 * (flux de trésorerie) : contrepartie systématique = 401 pour les achats de
 * biens/services (hors immobilisations) ; 481 ou 404 pour les immobilisations. »
 * Et son Application 1 le montre : au débit les charges et la TVA, au crédit
 * 4011 Fournisseurs, pas un compte de banque.
 *
 * Le SYCEBNL dit la même chose dans le fonctionnement de son compte 40 : « est
 * crédité le compte 40 FOURNISSEURS ET COMPTES RATTACHES du montant des
 * factures d'achats de biens ou de prestations de services […] par le débit
 * des comptes concernés de la classe 6 […] du compte 445 Etat, T.V.A.
 * récupérable », puis, séparément, « est débité le compte 40 […] des
 * règlements effectués sur factures ; par le crédit des comptes de trésorerie ».
 * DEUX écritures, dans deux journaux.
 *
 * La même règle vaut à la vente (Application 2 : au débit 4111 Client, au
 * crédit les produits puis la TVA) et à la paie (chapitre 3, section 4.1 :
 * « Montant brut au crédit 422 Personnel, rémunérations dues, par débit
 * 661-663 »).
 *
 * Les seules opérations qui touchent la trésorerie en une écriture sont celles
 * qui n'ont PAS de tiers débiteur ou créditeur, et les modèles le disent : un
 * don manuel en numéraire, reçu sans engagement préalable, et les règlements,
 * qui sont la seconde moitié d'une opération déjà comptabilisée.
 *
 * Le dossier connaissait d'ailleurs déjà la règle ailleurs · le contrôle
 * CHARGE_SANS_TIERS signale exactement l'écriture que ces modèles
 * fabriquaient. Ils la fabriquaient, et le contrôle la dénonçait ensuite.
 * ────────────────────────────────────────────────────────────────────────
 */

/** Le rôle d'une ligne dans le modèle · il commande ce que l'écran demande. */
export type RoleLigne =
  /** Compte de charge, de produit ou de stock · numéro fixé par le modèle. */
  | 'NATURE'
  /** Fournisseur, client, adhérent, personnel · numéro proposé, choisissable. */
  | 'TIERS'
  /** Banque ou caisse · choisi à l'écran, le modèle n'en fixe aucun. */
  | 'TRESORERIE';

export type LigneModele = {
  role: RoleLigne;
  /** Numéro du plan · absent pour la trésorerie, qui se choisit à l'écran. */
  numero?: string;
  sens: 'DEBIT' | 'CREDIT';
};

export type ModeleSimple = {
  code: string;
  libelle: string;
  lignes: LigneModele[];
  /**
   * Le journal où l'opération se tient normalement · servi à l'écran pour que
   * le comptable sache qu'un achat ne se saisit pas au journal de banque.
   */
  journal: string;
  /**
   * Ce que le modèle NE fait PAS, dit à l'utilisateur. Une écriture d'achat
   * n'est que la première moitié : il reste le règlement.
   */
  suite?: string;
};

/**
 * LE JEU SYCEBNL.
 *
 * Numéros vérifiés Détail dans `compte-seed.ts` : 40110000 Fournisseurs,
 * 41100000 Adhérents, 42200000 Rémunérations dues au personnel, 70100000
 * Cotisations des adhérents, 70410000 Revenus liés à la générosité · dons,
 * 60110000 Achats de biens et services liés à l'activité, 66110000
 * Appointements salaires et commissions.
 */
export const MODELES_SIMPLES_SYCEBNL: ModeleSimple[] = [
  /*
    LE DON MANUEL EST LA SEULE OPÉRATION QUI VA DROIT À LA TRÉSORERIE, et ce
    n'est pas une simplification · c'est le texte. Le SYCEBNL, Partie 3 ch. 4
    section 3, range dans le compte 704 « les dons : remise de fonds sans
    contrepartie avec une intention libérale ». Il n'y a pas de débiteur : le
    fait générateur est la remise elle-même. Le même chapitre ajoute que les
    revenus de générosité PROMIS et non encore reçus, eux, passent par le
    compte 475 « Générosités financières à recevoir » · ce cas-là a un tiers,
    et il n'est pas servi ici faute d'être demandé.
  */
  {
    code: 'don',
    libelle: 'Don reçu en numéraire',
    journal: 'Trésorerie',
    lignes: [
      { role: 'TRESORERIE', sens: 'DEBIT' },
      { role: 'NATURE', numero: '70410000', sens: 'CREDIT' },
    ],
  },
  /*
    LA COTISATION SE CONSTATE À L'APPEL, PAS À L'ENCAISSEMENT. SYCEBNL,
    Partie 3 ch. 5 § 1.1 : « Le fait générateur de la comptabilisation des
    cotisations est l'appel de cotisations. » Et § 1.2 donne l'écriture, dans
    cet ordre : 411 Adhérents au débit, 701 Cotisations des adhérents au
    crédit. Le recouvrement est une SECONDE écriture, 5.. au débit par 411 au
    crédit, et c'est le modèle « Recouvrement de cotisation » ci-dessous.

    RÉSERVE DU TEXTE, reproduite telle quelle dans la suite du modèle : « si
    l'entité ne peut justifier d'un droit d'agir en recouvrement, les
    cotisations sont comptabilisées lors de leur encaissement effectif ».
  */
  {
    code: 'cotisation',
    libelle: 'Appel de cotisation',
    journal: 'Opérations diverses',
    lignes: [
      { role: 'TIERS', numero: '41100000', sens: 'DEBIT' },
      { role: 'NATURE', numero: '70100000', sens: 'CREDIT' },
    ],
    suite:
      "L'appel de cotisation ne l'encaisse pas · le recouvrement est une SECONDE écriture, trésorerie au débit " +
      "par le crédit du 411 Adhérents (SYCEBNL, Partie 3 ch. 5 § 1.2). RÉSERVE DU TEXTE : si l'entité ne peut " +
      "justifier d'un droit d'agir en recouvrement, la cotisation se comptabilise à l'encaissement effectif, et " +
      "c'est alors le modèle de recouvrement qu'il faut employer seul.",
  },
  {
    code: 'recouvrement-cotisation',
    libelle: 'Recouvrement de cotisation',
    journal: 'Trésorerie',
    lignes: [
      { role: 'TRESORERIE', sens: 'DEBIT' },
      { role: 'TIERS', numero: '41100000', sens: 'CREDIT' },
    ],
  },
  {
    code: 'achat',
    libelle: 'Achat de biens ou de services (facture)',
    journal: 'Achats',
    lignes: [
      { role: 'NATURE', numero: '60110000', sens: 'DEBIT' },
      { role: 'TIERS', numero: '40110000', sens: 'CREDIT' },
    ],
    suite:
      "La facture crée la DETTE, elle ne la règle pas · le paiement est une seconde écriture, 401 au débit par le " +
      "crédit de la trésorerie (SYCEBNL, fonctionnement du compte 40). Employez le modèle « Règlement de " +
      'fournisseur » le jour du décaissement.',
  },
  {
    code: 'reglement-fournisseur',
    libelle: 'Règlement de fournisseur',
    journal: 'Trésorerie',
    lignes: [
      { role: 'TIERS', numero: '40110000', sens: 'DEBIT' },
      { role: 'TRESORERIE', sens: 'CREDIT' },
    ],
    suite:
      "En cas d'escompte de règlement obtenu, ajoutez une ligne au crédit du 77300000 Escomptes obtenus : le " +
      "compte 40 « est débité […] des escomptes de règlement obtenus des fournisseurs ; par le crédit du compte " +
      '773 Escomptes obtenus ». OmegaX ne le chiffre pas, faute de connaître les conditions de votre facture.',
  },
  /*
    LA PAIE PASSE PAR LE COMPTE 422, et le brut n'est pas le net. SYSCOHADA,
    Partie 1 ch. 3 § 4.1, que le SYCEBNL reprend dans le fonctionnement de son
    compte 42 : « Montant brut au crédit 422 Personnel, rémunérations dues, par
    débit 661-663. Retenues sociales (cotisations salariales) virées de 422 aux
    organismes 431-433 ; solde 422 = salaire net. »

    Ce modèle ne pose QUE la première écriture, celle du brut. Les retenues,
    les cotisations patronales et le paiement du net sont trois écritures de
    plus, que le logiciel ne devine pas : il le dit au lieu de les inventer.
  */
  {
    code: 'salaire',
    libelle: 'Salaire · constatation du brut',
    journal: 'Opérations diverses',
    lignes: [
      { role: 'NATURE', numero: '66110000', sens: 'DEBIT' },
      { role: 'TIERS', numero: '42200000', sens: 'CREDIT' },
    ],
    suite:
      "Ce modèle pose le BRUT au crédit du 422, et rien d'autre. Restent à saisir : les retenues salariales, " +
      'virées du 422 vers les organismes sociaux 431 à 433 et vers le 447 pour les impôts retenus à la source ; ' +
      'les cotisations patronales, au débit du 664 par le crédit des mêmes organismes ; puis le paiement du net, ' +
      'au débit du 422 par le crédit de la trésorerie. OmegaX ne chiffre aucune de ces trois écritures · les ' +
      'barèmes dépendent du dossier.',
  },
];

/**
 * LE JEU SYSCOHADA.
 *
 * Numéros vérifiés Détail dans `compte-seed-syscohada.ts` : 40110000
 * Fournisseurs, 41110000 Clients, 42200000 Personnel rémunérations dues,
 * 70110000 Ventes de marchandises · Dans la Région, 70610000 Services vendus ·
 * Dans la Région, 60110000 Achats de marchandises · Dans la Région, 66110000
 * Appointements salaires et commissions.
 */
export const MODELES_SIMPLES_SYSCOHADA: ModeleSimple[] = [
  {
    code: 'vente',
    libelle: 'Vente de marchandises (facture)',
    journal: 'Ventes',
    lignes: [
      { role: 'TIERS', numero: '41110000', sens: 'DEBIT' },
      { role: 'NATURE', numero: '70110000', sens: 'CREDIT' },
    ],
    suite:
      "La facture crée la CRÉANCE, elle ne l'encaisse pas · l'encaissement est une seconde écriture, trésorerie " +
      'au débit par le crédit du 411 Clients (Guide d\'application, Partie 1 ch. 2, Application 2). Employez le ' +
      'modèle « Encaissement de client » le jour de la recette.',
  },
  {
    code: 'service',
    libelle: 'Prestation de services (facture)',
    journal: 'Ventes',
    lignes: [
      { role: 'TIERS', numero: '41110000', sens: 'DEBIT' },
      { role: 'NATURE', numero: '70610000', sens: 'CREDIT' },
    ],
    suite:
      "Comme pour une vente de marchandises, l'encaissement est une seconde écriture. Attention aussi à " +
      "l'exigibilité de la TVA : pour une prestation de services, elle intervient à l'ENCAISSEMENT du prix " +
      "(ordonnance-loi n° 10/001, art. 25, 2°), et non à la facturation · voir la fenêtre de déclaration de TVA.",
  },
  {
    code: 'encaissement-client',
    libelle: 'Encaissement de client',
    journal: 'Trésorerie',
    lignes: [
      { role: 'TRESORERIE', sens: 'DEBIT' },
      { role: 'TIERS', numero: '41110000', sens: 'CREDIT' },
    ],
    suite:
      "En cas d'escompte de règlement accordé, ajoutez une ligne au débit du 67300000 Escomptes accordés · elle " +
      "vient APRÈS la trésorerie dans la colonne des débits, l'escompte étant l'accessoire du règlement.",
  },
  {
    code: 'achat',
    libelle: 'Achat de marchandises (facture)',
    journal: 'Achats',
    lignes: [
      { role: 'NATURE', numero: '60110000', sens: 'DEBIT' },
      { role: 'TIERS', numero: '40110000', sens: 'CREDIT' },
    ],
    suite:
      "La facture crée la DETTE, elle ne la règle pas · « contrepartie systématique = 401 pour les achats de " +
      "biens/services » (Guide d'application, Partie 1 ch. 2 § 1.1). Le paiement est une seconde écriture · " +
      'employez le modèle « Règlement de fournisseur ».',
  },
  {
    code: 'reglement-fournisseur',
    libelle: 'Règlement de fournisseur',
    journal: 'Trésorerie',
    lignes: [
      { role: 'TIERS', numero: '40110000', sens: 'DEBIT' },
      { role: 'TRESORERIE', sens: 'CREDIT' },
    ],
    suite:
      "En cas d'escompte de règlement obtenu, ajoutez une ligne au crédit du 77300000 Escomptes obtenus · elle " +
      "vient APRÈS le fournisseur dans la colonne des crédits. OmegaX ne la chiffre pas, faute de connaître les " +
      'conditions de votre facture.',
  },
  {
    code: 'salaire',
    libelle: 'Salaire · constatation du brut',
    journal: 'Opérations diverses',
    lignes: [
      { role: 'NATURE', numero: '66110000', sens: 'DEBIT' },
      { role: 'TIERS', numero: '42200000', sens: 'CREDIT' },
    ],
    suite:
      "Ce modèle pose le BRUT au crédit du 422, et rien d'autre (Guide d'application, Partie 1 ch. 3 § 4.1). " +
      'Restent à saisir : les retenues salariales, virées du 422 vers les organismes 431 à 433 et vers le 447 ; ' +
      'les cotisations patronales, au débit du 664 ; puis le paiement du net, au débit du 422 par le crédit de la ' +
      'trésorerie. OmegaX ne chiffre aucune de ces trois écritures · les barèmes dépendent du dossier.',
  },
];
