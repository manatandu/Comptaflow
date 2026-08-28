/**
 * Tableau de correspondance officiel « poste → comptes » du BILAN SYCEBNL —
 * associations et ordres professionnels, Système normal.
 *
 * Source unique : skill `sycebnl`, `references/partie4-ch2-etats-associations.md`,
 * section « TABLEAU DE CORRESPONDANCE - BILAN » (transcription du Journal
 * officiel OHADA, n° spécial du 22 février 2023, Partie 4, chapitre 2,
 * section 6). Jamais de mémoire, jamais complété depuis le SYSCOHADA (règle
 * §2.6 du plan de construction).
 *
 * Remplace le regroupement simplifié classe → poste qui servait de bilan MVP
 * (`etats-financiers.service.ts`, avant le 2026-08-28) — sur le même modèle
 * que `correspondance-compte-resultat.ts`, construit lors de la même
 * séance : un vrai tableau de correspondance, pas une approximation.
 *
 * ## Convention de lecture des numéros de comptes
 *
 * Reprise du moteur `liasse/` du skill (même convention qu'au compte de
 * résultat) : un jeton de 2 chiffres englobe tous ses divisionnaires
 * (« 41 » couvre 41xxxxx) ; un jeton de 3+ chiffres ne vaut que pour
 * lui-même et ses subdivisions. `exclusions` retranche les comptes cités
 * (et leurs propres subdivisions) du préfixe qui les contient.
 *
 * ## Convention de signe
 *
 * « brut » et « passif » : montant = solde DÉBITEUR net pour un poste
 * d'actif, solde CRÉDITEUR net pour un poste de passif — chacun dans son
 * sens naturel de lecture (un poste d'actif ressort en positif si le compte
 * est bien débiteur, jamais en négatif par construction du bilan officiel).
 * « amortissements/dépréciations » : toujours solde CRÉDITEUR net (ce sont
 * des comptes soustractifs de l'actif, quel que soit leur poste).
 *
 * Pour les comptes de tiers polyvalents (42 à 47, 499, 52, 53, 599), un même
 * numéro peut être tour à tour débiteur ou créditeur selon l'écriture — voir
 * `sens` sur `BE`/`DI`/`DW`, corrections officiellement admises (voir
 * `ANOMALIES` ci-dessous).
 *
 * ## Anomalies du texte officiel, signalées et corrigées comme le fait déjà
 * le moteur `liasse/` du skill (`liasse/references/anomalies.md`) — même
 * corrections, mêmes justifications, reprises ici pour ne pas dépendre d'un
 * fichier hors du dépôt de l'application :
 *
 * 1. **BE (Autres créances)** : le tableau officiel liste le compte 41 parmi
 *    les comptes de BE, alors que 41 est déjà entièrement affecté à BD
 *    (Adhérents, Clients-usagers). Le compte 41 est retiré de BE.
 * 2. **BE et DI (Autres créances / Autres dettes)** : le tableau officiel
 *    liste 42, 43, 44, 45, 47 sans réserve de sens sur les deux postes à la
 *    fois, ce qui capterait deux fois un même solde selon son signe. Un
 *    qualificatif « solde débiteurs » est appliqué côté BE et
 *    « solde créditeurs » côté DI.
 * 3. **CJ (Provisions réglementées)** : la fiche sommaire de la classe 1
 *    (Partie 2, ch. 1) numérote ce poste 16, mais la fiche détaillée par
 *    compte et le tableau de correspondance du bilan (Partie 4, ch. 2) le
 *    numérotent 15. Le numéro 15 est retenu, cohérent avec le tableau qui
 *    gouverne le montage.
 * 4. **AG (amortissement)** : la cellule est illisible dans la source
 *    scannée. Laissée vide — cohérent avec le fait qu'une avance non livrée
 *    ne s'amortit pas.
 * 5. ~~**DW** restreint à 564/565~~ — **CORRIGÉ LE 2026-08-28 (audit)** :
 *    ce n'était pas une anomalie du texte mais une ERREUR de ce fichier. Le
 *    texte dit « 56, solde créditeurs : 52, 53 » ; la restriction à 564/565
 *    invoquait « 561 = opérations avec le siège », qui est la nomenclature
 *    SYSCOHADA citée de mémoire. Le plan SYCEBNL (COMPTE 56) donne 561
 *    Crédits de trésorerie, 565 Escompte, 566 intérêts courus : 564
 *    n'existe pas et 561/566 sont de la trésorerie passif. DW reprend « 56 ».
 *
 * 6. **BW / DW — double comptage des découverts**, corrigé le 2026-08-28.
 *    BW captait les soldes 52/53 CRÉDITEURS (en négatif, donc en diminution
 *    de l'actif) pendant que DW les ajoutait au passif : un simple découvert
 *    bancaire déséquilibrait le bilan du double de son montant. Le solde
 *    créditeur doit être DÉPLACÉ, pas compté des deux côtés — voir
 *    `comptesTransferesSiCrediteur` sur BW.
 *
 * Une SEPTIÈME ambiguïté, propre à cette transcription (non documentée dans
 * `liasse/references/anomalies.md`, qui ne la résout pas non plus) : le
 * texte officiel marque d'un suffixe « p » (pour partie) TROIS comptes de
 * dépréciation qu'il liste sous DEUX postes à la fois — 2919p (AE et AF),
 * 2939p (AJ et AK) et 2949p (AL et AM) —, sans que rien n'indique la clé de
 * répartition. Le troisième (2949p) manquait à cette liste jusqu'à l'audit
 * du 2026-08-28 ; le code le traitait pourtant déjà comme les deux autres
 * (rattaché en entier à AM, exclu de AL). Dans les trois cas : un
 * compte agrégé "Autres" partagé entre plusieurs postes de détail que la
 * seule balance ne permet pas de désagréger. Pris en entier sous UN SEUL
 * poste (celui dont le libellé "Autres"/"Aménagements" correspond le mieux
 * à l'intitulé du compte 291/293), signalé ici plutôt que dupliqué (ce qui
 * gonflerait artificiellement l'actif net) ou pris par moitié (ce qui
 * inventerait une clé de répartition qu'aucun texte ne donne).
 */

export type SensBilan = 'ACTIF' | 'PASSIF';
/** Restreint un poste de tiers polyvalent à un seul sens de solde. */
export type QualificatifSens = 'DEBITEUR' | 'CREDITEUR';

export interface PosteBilanDeBase {
  ref: string;
  libelle: string;
  sens: SensBilan;
  /** Préfixes de comptes portant le montant "brut" (actif) ou net (passif). */
  comptes: string[];
  /** Préfixes explicitement retranchés de `comptes` (et leurs subdivisions). */
  exclusions?: string[];
  /** Uniquement pour l'actif : comptes 28x/29x soustractifs de ce poste. */
  comptesAmortissement?: string[];
  /** Préfixes retranchés de `comptesAmortissement` — même logique que `exclusions`. */
  exclusionsAmortissement?: string[];
  /**
   * ACTIF seulement : comptes qui QUITTENT ce poste quand leur solde est
   * créditeur, parce qu'un poste de PASSIF les réclame alors (banque à
   * découvert : BW -> DW). Sans ça le solde créditeur serait compté DEUX
   * fois — en négatif à l'actif ET en positif au passif — et le bilan ne
   * bouclerait plus (bug corrigé le 2026-08-28, test de régression
   * « découvert bancaire » dans etats-financiers.service.spec.ts).
   */
  comptesTransferesSiCrediteur?: string[];
  /** Restreint aux comptes de tiers polyvalents dont le solde va dans ce sens. */
  sens_qualificatif?: QualificatifSens;
}

/** Postes ACTIF portant directement des comptes (hors sous-totaux/totaux). */
export const POSTES_ACTIF: PosteBilanDeBase[] = [
  { ref: 'AB', libelle: 'Immobilisations incorporelles', sens: 'ACTIF', comptes: ['201'], comptesAmortissement: ['280', '2901'] },
  {
    ref: 'AC',
    libelle: 'Immobilisations corporelles et financières',
    sens: 'ACTIF',
    comptes: ['202', '203', '204', '205'],
    comptesAmortissement: ['2902'],
  },
  {
    ref: 'AE',
    libelle: 'Brevets, licences, logiciels et droits similaires',
    sens: 'ACTIF',
    comptes: ['212', '213', '214', '2193'],
    comptesAmortissement: ['2812', '2813', '2814', '2912', '2913'], // 2919 -> AF, voir ambiguïté documentée ci-dessus
  },
  {
    ref: 'AF',
    libelle: 'Autres immobilisations incorporelles',
    sens: 'ACTIF',
    comptes: ['218', '2198'],
    comptesAmortissement: ['2818', '2918', '2919'],
  },
  // AG : l'amortissement est illisible dans la source (anomalie n° 4) — pas de comptesAmortissement.
  { ref: 'AG', libelle: 'Avances et acomptes versés sur immobilisations incorporelles', sens: 'ACTIF', comptes: ['251'] },
  { ref: 'AI', libelle: 'Terrains', sens: 'ACTIF', comptes: ['22'], comptesAmortissement: ['282', '292'] },
  {
    ref: 'AJ',
    libelle: 'Bâtiments',
    sens: 'ACTIF',
    comptes: ['231', '232', '233', '2391', '2392', '2393', '2396'],
    comptesAmortissement: ['2831', '2832', '2833', '2931', '2932', '2933'], // 2939 -> AK
  },
  {
    ref: 'AK',
    libelle: 'Aménagements, agencements et installations',
    sens: 'ACTIF',
    comptes: ['234', '235', '238', '2394', '2395', '2398'],
    comptesAmortissement: ['2834', '2835', '2838', '2934', '2935', '2938', '2939'],
  },
  {
    ref: 'AL',
    libelle: 'Matériel, mobilier et actifs biologiques',
    sens: 'ACTIF',
    comptes: ['24'],
    exclusions: ['245', '2495'],
    comptesAmortissement: ['284', '294'],
    // 2845/2945/2949 -> AM (matériel de transport), pas AL.
    exclusionsAmortissement: ['2845', '2945', '2949'],
  },
  {
    ref: 'AM',
    libelle: 'Matériel de transport',
    sens: 'ACTIF',
    comptes: ['245', '2495'],
    comptesAmortissement: ['2845', '2945', '2949'],
  },
  { ref: 'AN', libelle: 'Avances et acomptes versés sur immobilisations corporelles', sens: 'ACTIF', comptes: ['252'], comptesAmortissement: ['2952'] },
  { ref: 'AX', libelle: 'Titres de participation', sens: 'ACTIF', comptes: ['26'], comptesAmortissement: ['296'] },
  { ref: 'AY', libelle: 'Autres immobilisations financières', sens: 'ACTIF', comptes: ['27'], comptesAmortissement: ['297'] },
  { ref: 'BA', libelle: 'Actif circulant H.A.O.', sens: 'ACTIF', comptes: ['485', '4865'], comptesAmortissement: ['498'] },
  {
    ref: 'BB',
    libelle: 'Stocks et encours',
    sens: 'ACTIF',
    comptes: ['31', '32', '33', '34', '36', '37', '38'],
    comptesAmortissement: ['39'],
  },
  { ref: 'BC', libelle: 'Fournisseurs débiteurs', sens: 'ACTIF', comptes: ['409'], comptesAmortissement: ['490'] },
  { ref: 'BD', libelle: 'Adhérents, Clients-usagers', sens: 'ACTIF', comptes: ['41'], exclusions: ['419'], comptesAmortissement: ['491'] },
  {
    ref: 'BE',
    libelle: 'Autres créances',
    sens: 'ACTIF',
    // Anomalies n° 1 et n° 2 : 41 retiré (déjà capté par BD), qualificatif
    // "solde débiteurs" ajouté (sinon double compte avec DI).
    comptes: ['42', '43', '44', '45', '47'],
    exclusions: ['478'],
    comptesAmortissement: ['492', '493', '494', '497'],
    sens_qualificatif: 'DEBITEUR',
  },
  { ref: 'BU', libelle: 'Titres de placement', sens: 'ACTIF', comptes: ['50'], comptesAmortissement: ['590'] },
  { ref: 'BV', libelle: 'Valeurs à encaisser', sens: 'ACTIF', comptes: ['51'], comptesAmortissement: ['591'] },
  {
    ref: 'BW',
    libelle: 'Banques, établissements financiers, caisses et assimilés',
    sens: 'ACTIF',
    comptes: ['52', '53', '55', '57'],
    comptesAmortissement: ['592', '593', '595'],
    // 52/53 créditeurs = banque à découvert : ils relèvent de DW (passif),
    // pas de BW. 55/57 (monnaie électronique, caisse) ne sont PAS transférés :
    // une caisse créditrice est une anomalie de saisie, elle doit rester
    // visible en négatif à l'actif plutôt que d'être déplacée au passif.
    comptesTransferesSiCrediteur: ['52', '53'],
  },
  { ref: 'BY', libelle: 'Écart de conversion — Actif', sens: 'ACTIF', comptes: ['478'] },
];

/** Postes PASSIF portant directement des comptes (hors sous-totaux/totaux). */
export const POSTES_PASSIF: PosteBilanDeBase[] = [
  { ref: 'CA', libelle: 'Donation non consomptible sans droit de reprise', sens: 'PASSIF', comptes: ['101'] },
  { ref: 'CB', libelle: 'Donation non consomptible avec droit de reprise', sens: 'PASSIF', comptes: ['102'] },
  { ref: 'CC', libelle: "Droit d'entrée", sens: 'PASSIF', comptes: ['103'] },
  { ref: 'CD', libelle: 'Donation consomptible', sens: 'PASSIF', comptes: ['104'] },
  { ref: 'CE', libelle: 'Écarts de réévaluation', sens: 'PASSIF', comptes: ['106'] },
  { ref: 'CF', libelle: 'Réserves', sens: 'PASSIF', comptes: ['11'] },
  { ref: 'CG', libelle: 'Report à nouveau (+ ou -)', sens: 'PASSIF', comptes: ['12'] },
  // CH (Résultat net) n'est PAS listé ici : il vit du côté classes 6/7/8
  // (avant clôture) ou du compte 13 (après clôture) — voir calculerResultatNet()
  // dans etats-financiers.service.ts, même logique que la balance déjà en place.
  { ref: 'CI', libelle: "Subventions d'investissement", sens: 'PASSIF', comptes: ['14'] },
  // Anomalie n° 3 : 15, pas 16 (voir tableau de correspondance vs fiche sommaire classe 1).
  { ref: 'CJ', libelle: 'Provisions réglementées', sens: 'PASSIF', comptes: ['15'] },
  { ref: 'CW', libelle: 'Fonds affectés et provenant de dons et legs d’immobilisations', sens: 'PASSIF', comptes: ['16'] },
  { ref: 'CX', libelle: 'Fonds reportés', sens: 'PASSIF', comptes: ['17'] },
  { ref: 'DA', libelle: 'Emprunts et dettes financières', sens: 'PASSIF', comptes: ['181', '182', '183', '185', '186', '188'] },
  { ref: 'DB', libelle: 'Dettes de location-acquisition', sens: 'PASSIF', comptes: ['187'] },
  { ref: 'DC', libelle: 'Provisions pour risques et charges', sens: 'PASSIF', comptes: ['19'] },
  { ref: 'DF', libelle: 'Dettes circulantes H.A.O.', sens: 'PASSIF', comptes: ['481', '484', '4861', '488', '4998'] },
  { ref: 'DG', libelle: 'Adhérents, clients-usagers créditeurs', sens: 'PASSIF', comptes: ['419'] },
  { ref: 'DH', libelle: 'Fournisseurs', sens: 'PASSIF', comptes: ['40'], exclusions: ['409'] },
  {
    ref: 'DI',
    libelle: 'Autres dettes',
    sens: 'PASSIF',
    // Anomalie n° 2 : qualificatif "solde créditeurs" (sinon double compte avec BE).
    comptes: ['42', '43', '44', '45', '47', '499', '599'],
    exclusions: ['479', '4998'],
    sens_qualificatif: 'CREDITEUR',
  },
  {
    ref: 'DW',
    libelle: 'Banques, établissements financiers et crédits de trésorerie',
    sens: 'PASSIF',
    // Le texte officiel dit « 56 » — repris tel quel. Une précédente version
    // restreignait le poste à ['564', '565'] au motif que « 561 = opérations
    // avec le siège » : FAUX, et doublement. 561 est la nomenclature
    // SYSCOHADA, citée de mémoire — la faute que la règle §2.6 interdit.
    // Et le plan SYCEBNL (Partie 2 ch. 3, COMPTE 56) subdivise 56 en 561
    // Crédits de trésorerie / 565 Escompte de crédits ordinaires / 566
    // intérêts courus : 564 n'existe pas, 561 et 566 sont bien de la
    // trésorerie passif. La restriction faisait donc disparaître de vrais
    // comptes du bilan. Corrigé le 2026-08-28 (audit).
    comptes: ['56'],
  },
  { ref: 'DY', libelle: 'Écart de conversion — Passif', sens: 'PASSIF', comptes: ['479'] },
];

/**
 * DW capte aussi 52/53 côté créditeur — mais BW (actif) capte déjà 52/53
 * côté débiteur. Représenté à part car ce n'est pas un poste de base
 * ordinaire : il partage ses comptes avec BW, distingué uniquement par le
 * sens du solde (exactement le même mécanisme que BE/DI, sur les mêmes
 * numéros de compte que la trésorerie plutôt que les tiers).
 */
export const COMPTES_TRESORERIE_PASSIF_SI_CREDITEUR = ['52', '53'];

export function trouvePosteActif(ref: string): PosteBilanDeBase | undefined {
  return POSTES_ACTIF.find((p) => p.ref === ref);
}
export function trouvePostePassif(ref: string): PosteBilanDeBase | undefined {
  return POSTES_PASSIF.find((p) => p.ref === ref);
}

/** Un total = somme des montants d'autres postes (détail OU total imbriqué). */
export interface TotalBilan {
  ref: string;
  libelle: string;
  deRefs: string[];
}

export const TOTAUX_ACTIF: TotalBilan[] = [
  { ref: 'AA', libelle: 'Immobilisations destinées à la vente provenant de dons et legs non encore reçues et usufruit temporaire', deRefs: ['AB', 'AC'] },
  { ref: 'AD', libelle: 'IMMOBILISATIONS INCORPORELLES', deRefs: ['AE', 'AF', 'AG'] },
  { ref: 'AH', libelle: 'IMMOBILISATIONS CORPORELLES', deRefs: ['AI', 'AJ', 'AK', 'AL', 'AM', 'AN'] },
  { ref: 'AO', libelle: 'IMMOBILISATIONS FINANCIERES', deRefs: ['AX', 'AY'] },
  { ref: 'AZ', libelle: 'TOTAL ACTIF IMMOBILISE', deRefs: ['AA', 'AD', 'AH', 'AO'] },
  { ref: 'BT', libelle: 'TOTAL ACTIF CIRCULANT', deRefs: ['BA', 'BB', 'BC', 'BD', 'BE'] },
  { ref: 'BX', libelle: 'TOTAL TRESORERIE ACTIF', deRefs: ['BU', 'BV', 'BW'] },
  { ref: 'BZ', libelle: 'TOTAL GENERAL', deRefs: ['AZ', 'BT', 'BX', 'BY'] },
];

export const TOTAUX_PASSIF: TotalBilan[] = [
  { ref: 'CK', libelle: 'TOTAL FONDS PROPRES ET ASSIMILES', deRefs: ['CA', 'CB', 'CC', 'CD', 'CE', 'CF', 'CG', 'CH', 'CI', 'CJ'] },
  { ref: 'CY', libelle: 'TOTAL FONDS AFFECTES ET REPORTES', deRefs: ['CW', 'CX'] },
  { ref: 'CZ', libelle: 'TOTAL RESSOURCES PROPRES ET ASSIMILEES', deRefs: ['CK', 'CY'] },
  { ref: 'DD', libelle: 'TOTAL DETTES FINANCIERES ET RESSOURCES ASSIMILEES', deRefs: ['DA', 'DB', 'DC'] },
  { ref: 'DE', libelle: 'TOTAL RESSOURCES STABLES', deRefs: ['CZ', 'DD'] },
  { ref: 'DV', libelle: 'TOTAL PASSIF CIRCULANT', deRefs: ['DF', 'DG', 'DH', 'DI'] },
  { ref: 'DX', libelle: 'TOTAL TRESORERIE PASSIF', deRefs: ['DW'] },
  { ref: 'DZ', libelle: 'TOTAL GENERAL', deRefs: ['DE', 'DV', 'DX', 'DY'] },
];

/** Ordre d'affichage officiel — mélange détail et totaux, comme la maquette. */
export const ORDRE_AFFICHAGE_ACTIF = [
  'AA', 'AB', 'AC', 'AD', 'AE', 'AF', 'AG', 'AH', 'AI', 'AJ', 'AK', 'AL', 'AM', 'AN',
  'AO', 'AX', 'AY', 'AZ', 'BA', 'BB', 'BC', 'BD', 'BE', 'BT', 'BU', 'BV', 'BW', 'BX', 'BY', 'BZ',
];
export const ORDRE_AFFICHAGE_PASSIF = [
  'CA', 'CB', 'CC', 'CD', 'CE', 'CF', 'CG', 'CH', 'CI', 'CJ', 'CK',
  'CW', 'CX', 'CY', 'CZ', 'DA', 'DB', 'DC', 'DD', 'DE', 'DF', 'DG', 'DH', 'DI', 'DV', 'DW', 'DX', 'DY', 'DZ',
];
