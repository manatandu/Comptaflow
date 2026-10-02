/**
 * TABLEAU DE FLUX DE TRÉSORERIE SYCEBNL · associations et ordres
 * professionnels, Système normal. Postes ZA, FA à FQ, ZB à ZG.
 *
 * Source : skill `sycebnl`, `references/partie4-ch2-etats-associations.md`
 * section 3 (le modèle vierge, codes REF et libellés) ET
 * `references/partie4-ch1-principes-generaux.md` section 4 (la MÉTHODE de
 * calcul). Journal officiel OHADA, n° spécial du 22 février 2023.
 *
 * ## Le texte donne la formule · c'est ce qui rend cet état calculable
 *
 * Contrairement aux notes annexes, dont le texte n'énumère que des libellés,
 * la Partie 4 ch. 1 § 4 donne ici la relation explicite, et même un exemple
 * chiffré :
 *
 *     « Encaissements au cours de l'exercice N = Revenus (N) + Créances (N-1)
 *       – Créances (N) »
 *     « Décaissements au cours de l'exercice N = Achats (N) + Dettes (N-1)
 *       – Dettes N »
 *     « Cotisations des adhérents encaissées en N = Cotisations des adhérents
 *       de l'exercice N + Créances adhérents de N-1 - Créances adhérents de N. »
 *
 * Le référentiel « opte pour la MÉTHODE DIRECTE de détermination des flux de
 * trésorerie liés aux activités opérationnelles » · d'où des lignes
 * d'encaissement et de décaissement par nature (FA à FH), et non un résultat
 * retraité.
 *
 * Chaque poste porte donc DEUX jeux de comptes :
 *  - `comptesFlux` · le produit ou la charge (classes 6/7/8), ou le mouvement
 *    d'immobilisation / de ressource durable (classes 1/2) ;
 *  - `comptesContrepartie` · la créance ou la dette qui décale l'encaissement
 *    dans le temps (classe 4). Un poste sans contrepartie encaisse comptant.
 *
 * ## « Produits ENCAISSABLES et charges DÉCAISSABLES »
 *
 * Le texte restreint lui-même le champ : « pour obtenir les encaissements et
 * les décaissements liés aux produits ENCAISSABLES et charges DÉCAISSABLES ».
 * Les produits et charges qui ne donnent jamais lieu à un mouvement de
 * trésorerie sont donc EXCLUS, chacun pour un motif tiré de son intitulé au
 * plan de comptes · jamais « au jugé » :
 *
 *  - 703 quote-part de dotation consomptible transférée · virement interne
 *    depuis la dotation, aucun encaissement. Son autre moitié, le débit du
 *    1049, est exclue de FO pour la même raison (passe R6, voir FO) ;
 *  - 72 production immobilisée, 73 variation des stocks de biens produits,
 *    603 variation des stocks achetés · écritures d'inventaire. L'autre
 *    moitié du 721 et du 722, le débit du 21, du 23 ou du 24, est retranchée
 *    de FI (passe R6, voir FI) ;
 *  - 78 transferts de charges, 79 reprises, 68/69 dotations · sans flux ;
 *  - 754 dons en nature courants, 654 dons en nature à distribuer,
 *    7583 abandons de frais par les bénévoles · le référentiel les qualifie
 *    lui-même de contributions EN NATURE : par définition sans trésorerie ;
 *  - 81/82 valeurs comptables et produits des cessions : le PRIX de cession
 *    (82) est bien un encaissement, mais il relève de FK/FL (investissement),
 *    pas des activités opérationnelles ; la valeur comptable (81) n'est
 *    qu'une sortie d'actif.
 *
 * Un compte encaissable qu'aucun poste ne réclame ressort en
 * `comptesNonVentiles` (voir `EtatsFinanciersService.tableauFluxTresorerie`) :
 * visible, jamais absorbé en silence · et l'écart de bouclage ci-dessous en
 * chiffre l'effet. Un compte sans trésorerie en est écarté quand l'autre
 * moitié de son écriture n'est lue par aucun poste, ou y est neutralisée
 * (703 face au 1049, 721 et 722 face à FI) : il ne peut alors expliquer aucun
 * écart. Celui dont l'autre moitié reste lue comme un flux (724, 726, 834,
 * 836) y reste, parce que c'est lui qui désigne la cause de l'écart que cette
 * lecture crée.
 *
 * ## Le bouclage : deux calculs indépendants, jamais un seul
 *
 * Le texte impose DEUX égalités de contrôle :
 *
 *     « Trésorerie nette en fin de période = Trésorerie nette en début de
 *       période + variation de la trésorerie de la période »
 *     « Trésorerie nette en fin de période = Trésorerie actif N – Trésorerie
 *       passif N »
 *
 * ZG est donc calculé DEUX FOIS · une fois par cumul des flux (ZA + ZF), une
 * fois par lecture directe du bilan (BX − DX) · et l'écart est présenté. Un
 * écart non nul n'est PAS corrigé : il signale que la ventilation FA-FQ ne
 * couvre pas tout le mouvement de trésorerie de l'exercice, ce qui est
 * précisément l'information qu'un préparateur doit voir. Même discipline que
 * l'écart de clôture des notes 5A-5F.
 *
 * ## Anomalies et lacunes du texte, signalées et non comblées (règle §2.6)
 *
 * 1. **AUCUN tableau de correspondance poste → comptes n'est fourni pour cet
 *    état** `[texte officiel]`, contrairement au bilan et au compte de
 *    résultat (Partie 4, section 6). Les rattachements ci-dessous sont
 *    déduits des INTITULÉS du plan de comptes normalisé (Partie 2, ch. 2 et
 *    3), poste par poste, et chaque déduction non évidente est commentée sur
 *    place. Là où le plan ne tranche pas, le compte n'est rattaché à aucun
 *    poste et ressort en `comptesNonVentiles`.
 * 2. **Le compte 4491 « Etat, subvention à recevoir » n'est pas subdivisé**
 *    entre subvention d'exploitation (FB) et d'investissement (FN)
 *    `[texte officiel]`, alors que le compte 473 l'est (4731 investissement,
 *    4732 exploitation, 4733 équilibre). Non rattaché : le ventiler d'office
 *    d'un côté fausserait l'autre. Un dossier qui l'utilise doit subdiviser
 *    4491, sans quoi son montant apparaîtra en écart de bouclage.
 * 3. **FD « Encaissement des revenus des manifestations » n'a aucune
 *    contrepartie au plan** : aucun compte de créance sur manifestations n'y
 *    figure. Ce n'est pas une lacune mais la nature de l'opération (une
 *    manifestation encaisse comptant) · la formule se réduit alors à
 *    « Encaissements = Revenus(N) », ce qui est correct.
 * 4. **Le modèle intercale une ligne « Flux de trésorerie provenant des
 *    activités de financement (D+E) » SANS lui donner de code REF**
 *    `[texte officiel]`, entre ZE et ZF. Elle est reproduite ici comme un
 *    sous-total sans REF (`ref: ''`), pas inventée sous un code que le texte
 *    ne donne pas.
 * 5. **Le compte 4572 « Bénévoles » n'est pas subdivisé** entre les frais
 *    « qui donnent droit à un remboursement » et ceux auxquels le bénévole
 *    « renonce » `[texte officiel]`, alors que la Partie 3 ch. 6 § 2 prévoit
 *    expressément les deux issues et qu'elles n'ont PAS le même effet sur la
 *    trésorerie : le remboursement en est un décaissement réel, la
 *    renonciation se solde par le compte 7583 (ou 846) sans aucun flux. Le
 *    rattacher à un poste supposerait de choisir une issue d'avance. Non
 *    rattaché, donc · même traitement que le 4491, et pour la même raison. Un
 *    dossier qui l'utilise doit subdiviser 4572, sans quoi son montant
 *    apparaîtra en écart de bouclage.
 *
 * Passe R6 · six autres comptes que le plan ne tranche pas, non rattachés
 * pour la même raison, et qui ressortent donc en `comptesNonVentiles` avec
 * leur montant quand ils sont mouvementés :
 *
 * 6. **4186 « Adhérents, clients-usagers, intérêts courus »** (Partie 2
 *    ch. 3, COMPTE 41) · intitulé MIXTE, là où la fiche répartit toutes les
 *    autres subdivisions du 41 entre adhérents (FA) et clients-usagers (FE).
 * 7. **4738 « Autres subventions à recevoir »** · ni exploitation (FB) ni
 *    investissement (FN) ; et **4739 « Subventions à reverser »**, débité du
 *    71 OU du 14 « selon le cas » (Partie 3 ch. 6 § 4), donc FB ou FN · même
 *    traitement que le 4491.
 * 8. **828 « Immobilisations reçues en dons et legs destinées à la vente »**
 *    · produit de cession d'un bien du compte 20, qui couvre aussi le 205
 *    titres (FK ou FL), et que la fiche du COMPTE 17 qualifie de « produit
 *    d'activité ordinaire ».
 * 9. **4721 et 4726** (créances et versements restant à effectuer sur
 *    cessions de titres de PLACEMENT) · les titres de placement sont en
 *    trésorerie au bilan (BU dans BX), et aucune ligne du modèle ne porte ces
 *    créances et dettes.
 * 10. **831, 841, 843 et leur contrepartie 484 (H.A.O.)** · le modèle n'a
 *    aucune ligne H.A.O., hormis le 88 que le libellé de FB réunit
 *    expressément ; 843 « dons en numéraire non récurrents » est pourtant
 *    encaissable.
 * 11. **FP vise « emprunts et autres dettes financières »** alors que le
 *    bilan range le 16 (fonds affectés) en CW, dans CZ, hors des dettes
 *    financières (DD) `[texte officiel]`. Faute de correspondance poste →
 *    comptes pour cet état, la réception du 165 reste en FP.
 *
 * ## Mouvements que la balance ne sait pas qualifier (passe R6)
 *
 * Le tableau lit une balance COMPTE PAR COMPTE, jamais écriture par
 * écriture : il ne connaît pas la contrepartie d'un mouvement. Quatre
 * écritures internes, sans trésorerie, que le plan décrit lui-même, y sont
 * donc lues comme des flux, et ne se neutralisent pas sans lire la
 * contrepartie de chaque écriture :
 *
 *  - l'INCORPORATION à la dotation des réserves (11), du report à nouveau
 *    (12) ou de l'excédent (131), lue en FM, et l'ABSORPTION d'un déficit
 *    (12, 139) par la dotation, lue en FO (fiche du COMPTE 10,
 *    « Fonctionnement ») ;
 *  - l'ACHÈVEMENT d'une immobilisation incorporelle en cours (219) ou d'un
 *    aménagement de terrain en cours (229), dont le plan ne décrit pas le
 *    virement et dont un crédit peut aussi être une mise au rebut par le 81,
 *    et le RECLASSEMENT d'une immobilisation d'un compte 2x à un autre
 *    (`ImmobilisationService.reclasser`), lus en FI.
 *
 * Ils ne sont pas retranchés d'office · retrancher tous les crédits d'un
 * compte en ôterait aussi les sorties. Ils sont NOMMÉS : quand le tableau ne
 * boucle pas, les comptes de `COMPTES_A_CONTREPARTIE_INTERNE` mouvementés
 * rejoignent `comptesNonVentiles`, comme causes possibles de l'écart.
 */

/** Comment lire les comptes de flux d'un poste. */
export type LectureFlux =
  /** Solde du produit sur la période : crédit − débit (nets des rabais et annulations). */
  | 'NET_PRODUIT'
  /** Solde de la charge sur la période : débit − crédit. */
  | 'NET_CHARGE'
  /** Débits SEULS · une acquisition d'immobilisation ; un crédit sur le même compte est une CESSION, qui relève d'un autre poste. */
  | 'DEBIT_SEUL'
  /** Crédits SEULS · un apport de ressource durable ; un débit est un remboursement, qui relève d'un autre poste. */
  | 'CREDIT_SEUL';

/** Sens de l'effet sur la trésorerie, tel que le modèle officiel le note (« + » / « - »). */
export type SensFlux = 'ENCAISSEMENT' | 'DECAISSEMENT';

export interface PosteFluxTresorerie {
  ref: string;
  libelle: string;
  sens: SensFlux;
  lectureFlux: LectureFlux;
  /** Produit, charge, ou mouvement de classe 1/2 · le fait générateur. */
  comptesFlux: string[];
  exclusionsFlux?: string[];
  /**
   * Créance ou dette qui décale l'encaissement : lue en SOLDE de clôture, sur
   * N et sur N-1, jamais en mouvement (c'est une situation, pas un flux).
   * Absente quand l'opération est comptant par nature (voir anomalie n° 3).
   */
  comptesContrepartie?: string[];
  exclusionsContrepartie?: string[];
  /** Commentaire de rattachement, reproduit dans l'état pour justifier le montant. */
  note?: string;
  /**
   * Mouvements CRÉDITEURS de l'exercice à RETRANCHER du flux (passe R6) ·
   * l'autre moitié d'une écriture dont ce poste lit le débit, et que le plan
   * décrit sans trésorerie. Chaque entrée porte son fondement. Le compte
   * retranché figure dans le détail du poste, en négatif.
   */
  creditsARetrancher?: { comptes: string[]; exclusions?: string[]; fondement: string }[];
  /**
   * Crédits des MISES EN SERVICE d'un bien en cours, reconnues par la liaison
   * de la fiche (`Immobilisation.ecritureMiseEnServiceId`,
   * `immobilisations/virements-mise-en-service.ts`), à retrancher sur les
   * comptes que `creditsARetrancher` ne retranche pas déjà en entier · porte
   * le fondement. Décision D6 de Manasse (2026-10-01).
   */
  misesEnServiceARetrancher?: string;
  /**
   * Débits de l'ÉCRITURE DE RÉÉVALUATION du module (lot 14), reconnue par sa
   * liaison (`ReevaluationBilan.ecritureId`), à retrancher des comptes que le
   * poste lit au débit · porte le fondement. La hausse de valeur d'un bien
   * réévalué n'est ni une acquisition ni un décaissement.
   */
  reevaluationARetrancher?: string;
}

/**
 * Postes FA à FH · activités opérationnelles, méthode directe.
 *
 * Les contreparties reprennent les subdivisions que le plan donne
 * explicitement : 4161 « cotisations litigieuses ou douteuses » et 4181
 * « appels de fonds à établir » sont, par leur intitulé même, des créances de
 * COTISATIONS (donc FA) ; 4162 et 4182 sont leurs symétriques côté
 * clients-usagers (donc FE). Cette lecture ne relève pas du jugement : elle
 * est écrite au plan de comptes (Partie 2, ch. 2, comptes 416 et 418).
 *
 * La fiche du COMPTE 41 (Partie 2 ch. 3, « Subdivisions ») nomme de même la
 * nature de tiers des subdivisions du 413 et du 419 : 4131 « Adhérents,
 * chèques impayés », 4133 « Adhérents, autres valeurs impayées », 4191
 * « Adhérents, avances reçues » (FA) ; 4132, 4138, 4192, 4194 et 4198,
 * « Clients-usagers » (FE). Elles n'étaient rattachées à aucun poste jusqu'à
 * la passe R6 : une cotisation perçue d'avance (52 / 4191) ou un chèque
 * impayé (4131 / 52) faisait tomber le bouclage. Le solde est lu signé : un
 * 419 créditeur réduit la créance, comme le 409 le fait dans FF.
 */
export const POSTES_OPERATIONNELS: PosteFluxTresorerie[] = [
  {
    ref: 'FA',
    libelle: 'Encaissement des cotisations',
    sens: 'ENCAISSEMENT',
    lectureFlux: 'NET_PRODUIT',
    comptesFlux: ['701'],
    comptesContrepartie: ['411', '4131', '4133', '4161', '4181', '4191'],
    note:
      "Exemple chiffré donné par le texte officiel (Partie 4, ch. 1 § 4) : « Cotisations des adhérents " +
      "encaissées en N = Cotisations des adhérents de l'exercice N + Créances adhérents de N-1 - Créances " +
      'adhérents de N ».',
  },
  {
    ref: 'FB',
    libelle: "Encaissement des subventions d'exploitation et d'équilibre",
    sens: 'ENCAISSEMENT',
    lectureFlux: 'NET_PRODUIT',
    // 71 subventions d'exploitation ; 88 subventions d'équilibre (classe 8,
    // H.A.O. au compte de résultat, mais le libellé de CE poste les réunit
    // explicitement · « d'exploitation ET d'équilibre »).
    comptesFlux: ['71', '88'],
    // 4732 « subventions d'exploitation à recevoir », 4733 « équilibre » ·
    // subdivisions explicites du plan. 4731 (investissement) va à FN.
    // 4491 « Etat, subvention à recevoir » est volontairement ABSENT :
    // non subdivisé par destination, voir anomalie n° 2 en tête de fichier.
    comptesContrepartie: ['4732', '4733'],
  },
  {
    ref: 'FC',
    libelle: 'Encaissement des revenus liés à la générosité',
    sens: 'ENCAISSEMENT',
    lectureFlux: 'NET_PRODUIT',
    comptesFlux: ['704'],
    // 475 « Générosités financières à recevoir » · l'intitulé du plan
    // désigne exactement cette créance.
    comptesContrepartie: ['475'],
  },
  {
    ref: 'FD',
    libelle: 'Encaissement des revenus des manifestations',
    sens: 'ENCAISSEMENT',
    lectureFlux: 'NET_PRODUIT',
    comptesFlux: ['706'],
    // Aucune contrepartie au plan · voir anomalie n° 3 : une manifestation
    // encaisse comptant, la formule se réduit à « Encaissements = Revenus(N) ».
  },
  {
    ref: 'FE',
    libelle: 'Encaissement des autres revenus',
    sens: 'ENCAISSEMENT',
    lectureFlux: 'NET_PRODUIT',
    // Les autres produits encaissables des activités ordinaires : 702 fonds
    // d'administration transférés, 705 ventes, 707 produits accessoires, 708
    // autres revenus, 75 autres produits, 77 revenus financiers. Les produits
    // H.A.O. encaissables (841, 843) n'y sont pas · anomalie n° 10.
    // Exclus car sans trésorerie (voir en-tête) : 754 dons en nature,
    // 7583 abandons de frais des bénévoles, 759 reprises de dépréciations.
    comptesFlux: ['702', '705', '707', '708', '75', '77'],
    exclusionsFlux: ['754', '7583', '759'],
    comptesContrepartie: ['412', '4132', '4138', '4162', '4182', '4192', '4194', '4198'],
  },
  {
    ref: 'FF',
    libelle: 'Décaissement des sommes versées aux fournisseurs',
    sens: 'DECAISSEMENT',
    lectureFlux: 'NET_CHARGE',
    // Achats et services extérieurs décaissables. 603 (variation de stocks)
    // exclu : écriture d'inventaire, sans trésorerie. 619 « rabais, remises
    // et ristournes obtenus » est INCLUS · créditeur, il réduit à juste titre
    // le décaissement.
    comptesFlux: ['60', '61', '62', '63'],
    exclusionsFlux: ['603'],
    // Renvoi (1) du modèle officiel : « à l'exclusion des fournisseurs
    // d'investissements ». Le compte 40 les exclut déjà par construction ·
    // les fournisseurs d'investissements sont au compte 481 (classe 48),
    // rattaché à FI. L'exclusion est donc structurelle, pas à écrire.
    comptesContrepartie: ['40'],
    note: "Renvoi (1) du modèle officiel : « à l'exclusion des fournisseurs d'investissements » (compte 481, poste FI).",
  },
  {
    ref: 'FG',
    libelle: 'Décaissement des sommes versées au personnel',
    sens: 'DECAISSEMENT',
    lectureFlux: 'NET_CHARGE',
    comptesFlux: ['66'],
    // 42 Personnel et 43 Organismes sociaux : les charges sociales (664, 668)
    // sont dans le compte 66 ci-dessus, leur dette est au compte 43.
    comptesContrepartie: ['42', '43'],
  },
  {
    ref: 'FH',
    libelle: 'Autres décaissements',
    sens: 'DECAISSEMENT',
    lectureFlux: 'NET_CHARGE',
    // 64 impôts et taxes, 65 autres charges, 67 frais financiers.
    // Exclus car sans trésorerie : 654 dons en nature à distribuer,
    // 659 et 679 charges pour dépréciations et provisions.
    comptesFlux: ['64', '65', '67'],
    exclusionsFlux: ['654', '659', '679'],
    // 44 État et collectivités, plus les tiers divers du compte 47.
    //
    // DÉFAUT CORRIGÉ (relevé par le test de bouclage) : le préfixe « 44 »
    // avalait aussi le compte 4491 « Etat, subvention à recevoir », que
    // l'anomalie n° 2 déclare pourtant non rattaché. Une subvention ACQUISE
    // mais non encaissée y était alors traitée comme une DETTE d'impôt : le
    // décaissement de FH se réduisait d'autant et compensait exactement
    // l'encaissement de FB, si bien que le tableau bouclait à tort et que
    // l'écart la seule chose qui devait alerter disparaissait. Un produit
    // à recevoir n'entre pas dans le règlement des impôts.
    //
    // Les créances d'État qui, elles, font bien partie du règlement (445 TVA
    // récupérable notamment) restent incluses : elles se compensent avec 443
    // et 444 pour donner la TVA nette réellement décaissée.
    //
    // Exclus du 47 : 473 (subventions à recevoir → FB et FN), 475
    // (générosités → FC), 472 (créances et dettes sur cessions de titres de
    // placement, anomalie n° 9 · les titres eux-mêmes sont de la trésorerie),
    // 478/479 (écarts de conversion, réévaluation sans flux).
    //
    // SECOND DÉFAUT DE LA MÊME CLASSE, relevé en UTILISANT le logiciel (le
    // livre d'inventaire figeait un TFT qui ne bouclait pas) : le préfixe
    // « 47 » avalait aussi 4713 « créditeurs, dons en nature courants non
    // consommés ». Or l'extourne de clôture des dons en nature (Partie 3
    // ch. 4 § 1.2 : 7542 au débit par 4713 au crédit) est SANS TRÉSORERIE, et
    // ce poste exclut déjà 654 de ses comptes de flux pour cette exacte
    // raison. La dette du 4713 réduisait donc le décaissement de FH sans
    // qu'aucune charge ne lui corresponde : la trésorerie de clôture par les
    // flux dépassait celle du bilan du montant des dons non consommés.
    // Voir CONTREPARTIES_SANS_TRESORERIE en fin de fichier, et le balayage
    // qui ferme la classe entière plutôt que ce seul cas.
    comptesContrepartie: ['44', '47'],
    exclusionsContrepartie: ['4491', '472', '473', '475', '478', '479', '4713'],
  },
];

/**
 * Postes FI à FL · investissement.
 *
 * Ici le « flux » n'est pas un produit ou une charge mais le MOUVEMENT de
 * l'immobilisation elle-même, lu dans un seul sens : une acquisition est un
 * débit, une cession un crédit. Lire le solde net confondrait les deux et
 * ferait disparaître une acquisition compensée par une cession du même
 * montant · deux flux de trésorerie réels, de sens opposés.
 */
export const POSTES_INVESTISSEMENT: PosteFluxTresorerie[] = [
  {
    ref: 'FI',
    libelle: "Décaissements liés aux acquisitions d'immobilisations incorporelles et corporelles",
    sens: 'DECAISSEMENT',
    lectureFlux: 'DEBIT_SEUL',
    // 20 : EXCLU. Le compte 20 porte les biens reçus en dons et legs
    // DESTINÉS À LA VENTE (fonds reportés 172) et l'usufruit temporaire (171),
    // sans contrepartie de trésorerie par définition (Partie 3, ch. 2).
    //
    // Un legs que l'entité CONSERVE, lui, n'est PAS au compte 20 : il est
    // porté en classe 2 ordinaire (2313, 2441, 2442, 2451) contre le 167
    // (Guide d'application, App. 5 ; fiche du COMPTE 16). Il gonfle donc FI
    // comme une acquisition décaissée ET FP comme un fonds reçu, du même
    // montant : ZF n'en est pas faussé, la ventilation l'est. Les deux postes
    // sont à corriger ENSEMBLE, jamais FP seul, qui ouvrirait un écart.
    comptesFlux: ['21', '22', '23', '24', '25'],
    // 481 « Fournisseurs d'investissements » · la dette qui décale le
    // paiement de l'immobilisation. C'est le pendant exact du renvoi (1) de
    // FF, qui les en exclut.
    comptesContrepartie: ['481'],
    // Passe R6 · trois virements de compte à compte que le plan décrit, dont
    // le débit est lu ici sans être un décaissement. Le principe est celui du
    // Guide d'application, Application 21, renvois (2) et (4), pour le poste
    // analogue du tableau emplois-ressources : « ne pas tenir compte des
    // virements de compte à compte qui ne traduisent pas une acquisition
    // d'immobilisation incorporelle et corporelle décaissée » et des achats
    // « transférés en immobilisations (livraison à soi-même) pour éviter le
    // double emploi ». Sans eux, FI dépassait le décaissé du montant viré, et
    // le tableau ne bouclait plus sans que rien n'en nomme la cause.
    //
    // LIMITE : un crédit du 239 ou du 249 peut aussi être une mise au rebut
    // par le 81 (fiche du COMPTE 23, « Utilisation au crédit ») · il serait
    // alors retranché à tort. La balance ne dit pas la contrepartie.
    // DÉCISION D6 (2026-10-01) · depuis que le module inscrit un bien non
    // achevé au 219 ou au 229 aussi (décision D5, que les fiches 21 et 22 du
    // SYCEBNL taisent), sa mise en service crédite un en-cours que la liste
    // ci-dessous ne retranche pas · le débit du compte définitif sortait en
    // second décaissement. Ce crédit-là se retranche par la LIAISON de la
    // fiche, jamais par le compte · un crédit du 219 non lié (rebut, virement
    // passé à la main) reste où la balance le met, comme avant. Le 239 et le
    // 249, déjà retranchés en entier, ne le sont pas deux fois.
    reevaluationARetrancher:
      "Réévaluation des immobilisations passée par le module (AUDCIF Titre VIII ch. 28 § 4.2.4.1 et § 4.3.1 · D 2 / " +
      'C 28 / C 106 ou 154) · substitution d\'une valeur réévaluée à la valeur nette, sans trésorerie. Le SYCEBNL ' +
      "(Partie 4 ch. 1, section 4) ne range ici que les « décaissements et encaissements liés aux opérations " +
      "d'acquisitions et de cessions » et ne nomme pas la réévaluation ; le tableau de l'AUDCIF, lu par analogie, " +
      "l'écrit · « les variations d'immobilisations qui n'ont pas généré un flux de trésorerie ne figurent pas » et « – Écart et " +
      "provision spéciale de réévaluation de l'exercice de réévaluation uniquement » (Titre IX ch. 5 § 1.3).",
    misesEnServiceARetrancher:
      "Mise en service d'un bien inscrit en cours (fiches des COMPTES 21 à 24 ; 219 et 229 offerts par décision " +
      'de Manasse du 2026-10-01) · virement de poste à poste, sans trésorerie, dont le paiement a déjà été lu au ' +
      "débit de l'en-cours.",
    creditsARetrancher: [
      {
        comptes: ['239', '249'],
        fondement:
          "Fiches des COMPTES 23 et 24 : après achèvement, les en-cours « seront portés au débit des comptes 231 à 238 par le crédit du compte 239 » ; le 24 est débité « du compte 249 – Matériel en cours, lorsqu'ils ont été achevés ». Le paiement de l'en-cours a déjà été lu au débit du 239 ou du 249.",
      },
      {
        comptes: ['25'],
        fondement:
          "Fiche du COMPTE 25 : « est crédité le compte 25 pour solde à la réception de la facture définitive […] par le débit du compte d'immobilisation concerné ». Le versement de l'avance a déjà été lu au débit du 25.",
      },
      {
        comptes: ['721', '722'],
        fondement:
          "Fiche du COMPTE 72 : « est crédité le compte 72 […] par le débit : du compte 21 […] du compte 23 […] ou 24 ». Les charges de production ont déjà été lues en FF, FG et FH. Le Guide neutralise côté charges ; la balance ne ventilant pas le 72 par nature, la neutralisation se fait ici, par choix de lecture.",
      },
    ],
  },
  {
    ref: 'FJ',
    libelle: "Décaissements liés aux acquisitions d'immobilisations financières",
    sens: 'DECAISSEMENT',
    lectureFlux: 'DEBIT_SEUL',
    comptesFlux: ['26', '27'],
    reevaluationARetrancher:
      "Réévaluation des immobilisations passée par le module (AUDCIF Titre VIII ch. 28 § 4.2.4.1 et § 4.3.1 · D 2 / " +
      'C 28 / C 106 ou 154) · substitution d\'une valeur réévaluée à la valeur nette, sans trésorerie. Le SYCEBNL ' +
      "(Partie 4 ch. 1, section 4) ne range ici que les « décaissements et encaissements liés aux opérations " +
      "d'acquisitions et de cessions » et ne nomme pas la réévaluation ; le tableau de l'AUDCIF, lu par analogie, " +
      "l'écrit · « les variations d'immobilisations qui n'ont pas généré un flux de trésorerie ne figurent pas » et « – Écart et " +
      "provision spéciale de réévaluation de l'exercice de réévaluation uniquement » (Titre IX ch. 5 § 1.3).",
  },
  {
    ref: 'FK',
    libelle: "Encaissements liés aux cessions d'immobilisations incorporelles et corporelles",
    sens: 'ENCAISSEMENT',
    lectureFlux: 'NET_PRODUIT',
    // Le PRIX de cession (compte 82), pas la valeur comptable (81) : c'est le
    // prix qui est encaissé. 821 incorporelles, 822 corporelles.
    comptesFlux: ['821', '822'],
    // 485 « Créances sur cessions d'immobilisations » · 4851 incorporelles,
    // 4852 corporelles ; 4856 (financières) va à FL.
    comptesContrepartie: ['4851', '4852', '4857', '4858'],
  },
  {
    ref: 'FL',
    libelle: "Encaissements liés aux cessions d'immobilisations financières",
    sens: 'ENCAISSEMENT',
    lectureFlux: 'NET_PRODUIT',
    comptesFlux: ['826'],
    comptesContrepartie: ['4856'],
  },
];

/** Postes FM à FO · financement par les fonds propres. */
export const POSTES_FONDS_PROPRES: PosteFluxTresorerie[] = [
  {
    ref: 'FM',
    libelle: 'Encaissement des dotations et autres fonds propres',
    sens: 'ENCAISSEMENT',
    lectureFlux: 'CREDIT_SEUL',
    // 10 Dotation (y compris 103 droit d'entrée). 106 écarts de réévaluation
    // EXCLU : réévaluation comptable, sans encaissement. 1049 EXCLU : la fiche
    // du COMPTE 10 ne le crédite jamais (voir FO).
    //
    // LIMITE (passe R6) : les incorporations à la dotation (crédit du 10 par
    // le débit du 11, du 12 ou du 131) sont lues ici comme des encaissements ·
    // voir « Mouvements que la balance ne sait pas qualifier » en tête.
    comptesFlux: ['10'],
    exclusionsFlux: ['106', '1049'],
    // 45 Fondateurs, apporteurs · la créance sur l'apporteur qui a souscrit
    // sans avoir encore libéré (Partie 3, ch. 1 : souscription puis libération).
    //
    // DÉFAUT CORRIGÉ (relevé par le balayage CONTREPARTIES_SANS_TRESORERIE) :
    // le préfixe « 45 » ne captait pas que les apporteurs. Le compte 45
    // regroupe, dit sa fiche (Partie 2 ch. 3, COMPTE 45), DEUX choses
    // distinctes : « les créances/dettes envers les apporteurs résultant des
    // divers mouvements de dotation » ET « les créances/dettes temporaires en
    // comptes courants des adhérents et dirigeants ». Seules les premières
    // sont la contrepartie du compte 10, flux de ce poste.
    //
    // Exclus donc :
    //  - les comptes courants (4515, 4525, 4535, 4545, 4555) : des « fonds
    //    laissés ou mis TEMPORAIREMENT à la disposition de l'entité », c'est
    //    un prêt, pas une dotation ;
    //    [texte officiel] la Partie 2 ch. 2 énumère les subdivisions du 452
    //    comme « (4521, 4522, 4555) » là où la fiche du compte 45 donne 4525.
    //    Les deux numéros sont exclus, l'exclusion étant valable dans les deux
    //    lectures ;
    //  - le 457 « Mécènes, bénévoles et assimilés » : ni dotation ni compte
    //    courant. Le mécénat se constate au 4751 par le 7046 (Partie 3 ch. 6
    //    § 3, contrepartie de FC), et le 4572 relève de l'anomalie n° 5.
    comptesContrepartie: ['45'],
    exclusionsContrepartie: ['4515', '4525', '4535', '4545', '4555', '457'],
  },
  {
    ref: 'FN',
    libelle: "Subventions d'investissement reçues",
    sens: 'ENCAISSEMENT',
    lectureFlux: 'CREDIT_SEUL',
    comptesFlux: ['14'],
    // 4731 « subventions d'INVESTISSEMENT à recevoir » · subdivision
    // explicite du plan, symétrique de 4732/4733 rattachés à FB.
    comptesContrepartie: ['4731'],
  },
  {
    ref: 'FO',
    libelle: 'Décaissement des dotations et autres fonds propres',
    sens: 'DECAISSEMENT',
    lectureFlux: 'DEBIT_SEUL',
    // Reprise d'une dotation avec droit de reprise (compte 102), remboursement
    // d'un apport. Mêmes comptes que FM, lus en sens inverse.
    //
    // 1049 EXCLU (passe R6). La fiche du COMPTE 10 (Partie 2 ch. 3,
    // « Utilisation au débit ») ne le débite que « par le crédit du compte 703
    // Quote-part de dotation consomptible transférée », et la Partie 3 ch. 1
    // fait de cette écriture la « couverture des charges de la période » · les
    // charges couvertes sont déjà décaissées en FF, FG ou FH. Lu ici, le débit
    // du 1049 les décaissait une seconde fois, et le 703, sa moitié crédit,
    // était désigné à tort comme la cause de l'écart.
    //
    // LIMITE : l'absorption d'un déficit par la dotation (débit du 10 par le
    // crédit du 12 ou du 139) reste lue ici · voir l'en-tête.
    comptesFlux: ['10'],
    exclusionsFlux: ['106', '1049'],
  },
];

/** Postes FP et FQ · financement par les fonds étrangers. */
export const POSTES_FONDS_ETRANGERS: PosteFluxTresorerie[] = [
  {
    ref: 'FP',
    libelle: 'Encaissement provenant des emprunts et des autres dettes financières',
    sens: 'ENCAISSEMENT',
    lectureFlux: 'CREDIT_SEUL',
    // 16 Fonds affectés et 18 Emprunts. 186 « intérêts courus » EXCLU : la
    // charge d'intérêt est décaissée en FH (compte 67), l'y compter aussi
    // doublerait le flux.
    comptesFlux: ['16', '18'],
    exclusionsFlux: ['186'],
  },
  {
    ref: 'FQ',
    libelle: 'Remboursements des emprunts et autres dettes financières',
    sens: 'DECAISSEMENT',
    lectureFlux: 'DEBIT_SEUL',
    comptesFlux: ['16', '18'],
    // Passe R6 · la fiche du COMPTE 16 ne décrit AUCUN débit du 16 contre la
    // trésorerie. Ses seuls débits sont les reprises au 792 (« est débité le
    // compte 167 […] par le crédit du compte 7923 » ; le 165 « repris au fur
    // et à mesure de la consommation par le biais du compte 7925 ») et le
    // 1679 contre le 192. Lus ici, ils sortaient en remboursements fictifs,
    // sans pendant, et le tableau ne bouclait plus.
    //  - 1679 EXCLU : son seul débit décrit est « par le crédit du compte 192 ».
    //  - Les crédits du 792 sont RETRANCHÉS : la fiche du COMPTE 79 le dit
    //    crédité « par le débit : du compte 16 ».
    // Un débit résiduel du 16 (une restitution au bailleur, que le texte ne
    // décrit pas) reste en FQ.
    exclusionsFlux: ['186', '1679'],
    creditsARetrancher: [
      {
        comptes: ['792'],
        fondement:
          "Fiche du COMPTE 79 : « est crédité le compte 792 · REPRISES DE FONDS AFFECTES ET PROVENANT DES DONS ET LEGS D'IMMOBILISATIONS […] par le débit : du compte 16 » ; fiche du COMPTE 16 : 165 repris par le 7925, 167 par le 7923.",
      },
    ],
  },
];

export const TOUS_LES_POSTES_FLUX: PosteFluxTresorerie[] = [
  ...POSTES_OPERATIONNELS,
  ...POSTES_INVESTISSEMENT,
  ...POSTES_FONDS_PROPRES,
  ...POSTES_FONDS_ETRANGERS,
];

/** Sous-totaux et totaux du modèle, dans l'ordre officiel de présentation. */
export interface TotalFluxTresorerie {
  ref: string;
  libelle: string;
  /** Repère A à H du modèle officiel (colonne « Rep. »). */
  repere?: string;
  deRefs: string[];
}

export const TOTAUX_FLUX: TotalFluxTresorerie[] = [
  {
    ref: 'ZB',
    libelle: 'Flux de trésorerie provenant des activités opérationnelles (somme FA à FH)',
    repere: 'B',
    deRefs: POSTES_OPERATIONNELS.map((p) => p.ref),
  },
  {
    ref: 'ZC',
    libelle: "Flux de trésorerie provenant des activités d'investissement (somme FI à FL)",
    repere: 'C',
    deRefs: POSTES_INVESTISSEMENT.map((p) => p.ref),
  },
  {
    ref: 'ZD',
    libelle: 'Flux de trésorerie provenant des fonds propres (somme FM à FO)',
    repere: 'D',
    deRefs: POSTES_FONDS_PROPRES.map((p) => p.ref),
  },
  {
    ref: 'ZE',
    libelle: 'Trésorerie provenant des fonds étrangers (somme FP à FQ)',
    repere: 'E',
    deRefs: POSTES_FONDS_ETRANGERS.map((p) => p.ref),
  },
  // Anomalie n° 4 : le modèle intercale cette ligne SANS code REF. Reproduite
  // telle quelle plutôt qu'affublée d'un code que le texte ne donne pas.
  {
    ref: '',
    libelle: 'Flux de trésorerie provenant des activités de financement (D+E)',
    deRefs: ['ZD', 'ZE'],
  },
  {
    ref: 'ZF',
    libelle: 'VARIATION DE LA TRÉSORERIE NETTE DE LA PÉRIODE (B+C+D+E)',
    repere: 'G',
    deRefs: ['ZB', 'ZC', 'ZD', 'ZE'],
  },
];

/**
 * Ordre d'affichage officiel, en-têtes de section compris · le modèle
 * intercale des intitulés de rubrique entre les postes chiffrés.
 */
export const ORDRE_AFFICHAGE_FLUX: Array<{ ref: string } | { section: string }> = [
  { ref: 'ZA' },
  { section: 'Flux de trésorerie provenant des activités opérationnelles' },
  ...POSTES_OPERATIONNELS.map((p) => ({ ref: p.ref })),
  { ref: 'ZB' },
  { section: "Flux de trésorerie provenant des activités d'investissements" },
  ...POSTES_INVESTISSEMENT.map((p) => ({ ref: p.ref })),
  { ref: 'ZC' },
  { section: 'Flux de trésorerie provenant du financement par les fonds propres' },
  ...POSTES_FONDS_PROPRES.map((p) => ({ ref: p.ref })),
  { ref: 'ZD' },
  { section: 'Trésorerie provenant du financement par les fonds étrangers' },
  ...POSTES_FONDS_ETRANGERS.map((p) => ({ ref: p.ref })),
  { ref: 'ZE' },
  { ref: '' }, // « Flux de trésorerie provenant des activités de financement (D+E) »
  { ref: 'ZF' },
  { ref: 'ZG' },
];

export function trouvePosteFlux(ref: string): PosteFluxTresorerie | undefined {
  return TOUS_LES_POSTES_FLUX.find((p) => p.ref === ref);
}


/**
 * CONTREPARTIES SANS TRÉSORERIE · invariant du tableau.
 *
 * Un poste exclut de ses `comptesFlux` les charges et produits sans
 * trésorerie (654 et 754 dons en nature, 7583 abandons de frais, 659/679
 * dépréciations…). Mais chacune de ces opérations a une CONTREPARTIE au
 * bilan, et si cette contrepartie est ramassée par le préfixe de dettes ou de
 * créances d'un autre poste, l'opération rentre par la fenêtre : la formule
 * « Décaissements = Charges(N) + Dettes(N−1) − Dettes(N) » corrige alors un
 * décaissement au titre d'une charge qui n'existe pour aucun poste.
 *
 * C'est la même erreur que le compte 4491 admis dans FH, puis que le 4713 ·
 * deux fois le même symptôme : le tableau cesse de boucler, ou boucle à tort,
 * sans que rien ne désigne la cause. La liste ci-dessous nomme ces
 * contreparties une fois pour toutes, et le balayage de
 * `correspondance-tft.spec.ts` vérifie qu'AUCUN poste n'en capte une ·
 * fermant la classe de défauts au lieu du seul cas rencontré.
 */
/**
 * COMPTES SANS TRÉSORERIE · bruit à écarter du diagnostic de bouclage.
 *
 * `comptesNonVentiles` existe pour DÉSIGNER LA CAUSE d'un écart : ce sont les
 * comptes mouvementés qu'aucun poste ne ventile, et dont le montant explique
 * la différence entre les deux trésoreries de clôture. Deux raisons très
 * différentes conduisent pourtant un compte à n'être rattaché à aucun poste :
 *
 *  - le plan NE TRANCHE PAS (4491 non subdivisé entre exploitation et
 *    investissement, 4572 non subdivisé entre remboursement et renonciation,
 *    et les anomalies n° 6 à 10 de l'en-tête · 4186, 4738, 4739, 828, 4721,
 *    4726, 831, 841, 843, 484) : ces comptes-là expliquent bel et bien un
 *    écart, et doivent être vus ;
 *  - l'opération EST SANS TRÉSORERIE par construction (dons en nature,
 *    abandons de frais, dotations et reprises de dépréciations) : ceux-là
 *    n'expliquent rien, par définition. Les afficher à côté d'un écart nul
 *    apprend au lecteur à ignorer le bloc · et le jour où un vrai coupable
 *    s'y trouve, il est noyé.
 *
 * Ils sont donc écartés de l'affichage. Ce n'est pas les cacher : ils sont
 * déjà exclus, nommément et avec leur motif, des `exclusionsFlux` et
 * `exclusionsContrepartie` des postes ci-dessus.
 */
export const COMPTES_SANS_TRESORERIE: { numero: string; motif: string }[] = [
  { numero: '654', motif: 'Dons en nature courants reçus à distribuer (Partie 3 ch. 4 § 1.1) · aucune trésorerie.' },
  { numero: '754', motif: 'Dons en nature courants (7542 reçus à distribuer) · aucune trésorerie.' },
  { numero: '832', motif: 'Dons en nature H.A.O. reçus à distribuer (Partie 3 ch. 4 § 1.1) · aucune trésorerie.' },
  { numero: '8415', motif: 'Dons en nature H.A.O. à distribuer · aucune trésorerie.' },
  { numero: '7583', motif: 'Abandons de frais par les bénévoles (Partie 3 ch. 6 § 2) · renonciation, sans flux.' },
  { numero: '846', motif: "Abandons de créances obtenus · contrepartie non récurrente de la même renonciation." },
  { numero: '4713', motif: 'Créditeurs, dons en nature courants non consommés · écriture d’inventaire extournée (§ 1.2).' },
  { numero: '4881', motif: 'Créditeurs, dons en nature H.A.O. non consommés · même mécanique, hors activités ordinaires.' },
  { numero: '603', motif: 'Variations de stocks de biens achetés · écriture d’inventaire.' },
  { numero: '659', motif: 'Charges pour dépréciations et provisions à court terme · sans décaissement.' },
  { numero: '679', motif: 'Charges financières pour dépréciations et provisions · sans décaissement.' },
  { numero: '759', motif: 'Reprises de charges pour dépréciations et provisions · sans encaissement.' },
  { numero: '68', motif: 'Dotations aux amortissements · sans décaissement.' },
  { numero: '69', motif: 'Dotations aux provisions et dépréciations · sans décaissement.' },
  { numero: '78', motif: 'Transferts de charges · reclassement interne, sans flux.' },
  { numero: '79', motif: 'Reprises de provisions, dépréciations et subventions d’investissement · sans encaissement.' },
  { numero: '85', motif: 'Dotations H.A.O. · sans décaissement.' },
  { numero: '86', motif: 'Reprises H.A.O. · sans encaissement.' },
  { numero: '87', motif: 'Variations de stocks de dons en nature H.A.O. · écriture d’inventaire.' },
  { numero: '106', motif: 'Écarts de réévaluation · réévaluation comptable, sans encaissement.' },
  { numero: '478', motif: 'Écarts de conversion - actif · réévaluation, sans flux.' },
  { numero: '479', motif: 'Écarts de conversion - passif · réévaluation, sans flux.' },
  { numero: '81', motif: "Valeurs comptables des cessions d'immobilisations · la trésorerie est au 82 (poste FK)." },
  { numero: '28', motif: 'Amortissements · contrepartie du 68, sans flux.' },
  { numero: '29', motif: 'Dépréciations · contrepartie du 69, sans flux.' },
  { numero: '19', motif: 'Provisions pour risques et charges · dotation et reprise, sans flux.' },
  // Passe R6 · A1. L'autre moitié de l'écriture est neutralisée dans FO.
  {
    numero: '703',
    motif:
      "Quote-part de dotation consomptible transférée · « couverture des charges de la période » (Partie 3 ch. 1), débitée au 1049 (fiche du COMPTE 10), sans trésorerie.",
  },
  {
    numero: '1049',
    motif: 'Dotation consomptible inscrite au compte de résultat · débitée par le crédit du 703 seul (fiche du COMPTE 10), sans trésorerie.',
  },
  // Passe R6 · A3. L'autre moitié de l'écriture est retranchée de FI.
  { numero: '721', motif: 'Production immobilisée incorporelle · par le débit du 21 (fiche du COMPTE 72), retranchée de FI.' },
  { numero: '722', motif: 'Production immobilisée corporelle · par le débit du 23 ou du 24 (fiche du COMPTE 72), retranchée de FI.' },
  // Passe R6 · A7. Pendants SYCEBNL du 603, du 87, du 659 et du 759 : leur
  // contrepartie (classe 3, compte 49) n'est lue par aucun poste.
  { numero: '73', motif: 'Variations des stocks de biens produits · écriture d’inventaire contre les stocks (fiche du COMPTE 73).' },
  { numero: '49', motif: 'Dépréciations et provisions à court terme des tiers · contrepartie des 659, 759, 839 et 849, sans flux.' },
  { numero: '839', motif: 'Charges pour dépréciations et provisions à court terme H.A.O. · pendant du 659, sans décaissement.' },
  { numero: '849', motif: 'Reprises de charges pour dépréciations et provisions à court terme H.A.O. · pendant du 759, sans encaissement.' },
];

/**
 * COMPTES À CONTREPARTIE INTERNE POSSIBLE · nommés au diagnostic quand le
 * tableau ne boucle pas (passe R6). Voir « Mouvements que la balance ne sait
 * pas qualifier » en tête. `lecture` dit quel mouvement les rend suspects :
 * le crédit d'un en-cours (achèvement ou reclassement), ou tout mouvement
 * des réserves, du report et du résultat quand la dotation a bougé.
 */
export const COMPTES_A_CONTREPARTIE_INTERNE: { numero: string; lecture: 'CREDIT' | 'MOUVEMENT'; motif: string }[] = [
  {
    numero: '11',
    lecture: 'MOUVEMENT',
    motif: 'Réserves · « incorporation à la dotation » (fiche du COMPTE 10), lue en FM.',
  },
  {
    numero: '12',
    lecture: 'MOUVEMENT',
    motif: 'Report à nouveau · incorporation à la dotation (FM) ou absorption par elle (FO), fiche du COMPTE 10.',
  },
  {
    numero: '13',
    lecture: 'MOUVEMENT',
    motif: 'Résultat · 131 incorporé à la dotation (FM), 139 absorbé par elle (FO), fiche du COMPTE 10.',
  },
  {
    numero: '219',
    lecture: 'CREDIT',
    motif: 'Immobilisations incorporelles en cours · un crédit peut être un achèvement, lu en FI au débit du compte définitif.',
  },
  {
    numero: '229',
    lecture: 'CREDIT',
    motif: 'Aménagements de terrains en cours · un crédit peut être un achèvement, lu en FI au débit du compte définitif.',
  },
];

export const CONTREPARTIES_SANS_TRESORERIE: { numero: string; intitule: string; fondement: string }[] = [
  {
    numero: '4713',
    intitule: 'Créditeurs, dons en nature courants non consommés',
    fondement:
      "Partie 3 ch. 4 § 1.2 : « 7542 Dons en nature courants reçus à distribuer » au débit par « 4713 Créditeurs, dons en nature courants non consommés » au crédit. Écriture d'inventaire, extournée à l'ouverture suivante · sans trésorerie. Sa charge symétrique (654) est déjà exclue de FH.",
  },
  {
    numero: '4881',
    intitule: 'Créditeurs, dons en nature H.A.O. non consommés',
    fondement:
      "Partie 3 ch. 4 § 1.2, cas de non-récurrence : « 8415 » au débit par « 488 » au crédit. Même mécanique que le 4713, hors activités ordinaires.",
  },
];

/**
 * ⚠️ Le compte 4572 « Bénévoles » N'EST PAS dans cette liste, bien que le
 * balayage l'ait d'abord fait ressortir. La Partie 3 ch. 6 § 2 lui donne DEUX
 * issues : le remboursement des frais, qui est un décaissement réel, et la
 * renonciation du bénévole, qui se solde par le 7583 sans flux. Il n'est donc
 * pas « sans trésorerie » · il est NON SUBDIVISÉ entre les deux, ce qui est
 * une lacune du plan et non un compte à exclure (anomalie n° 5). Il reste
 * rattaché à aucun poste et ressort en `comptesNonVentiles`, exactement comme
 * le 4491.
 */
