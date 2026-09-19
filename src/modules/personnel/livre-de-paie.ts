/**
 * LE LIVRE DE PAIE ET LE DÉCOMPTE ÉCRIT · ARTICLES 213 À 215 ET 103 DU CODE
 * DU TRAVAIL, ARTICLE 25 DE L'ARRÊTÉ MINISTÉRIEL n° 146/2018.
 *
 * CE FICHIER NE TIENT PAS UN LIVRE DE PAIE. Il dit ce que le livre et le
 * décompte doivent porter, il vérifie ce qu'un document proposé porte
 * réellement, et IL REFUSE DE CERTIFIER UNE CONFORMITÉ qu'il n'est pas en
 * état d'établir. La différence entre les deux est tout l'objet du fichier.
 *
 * ────────────────────────────────────────────────────────────────────────
 * CE QUE LES TEXTES DISENT, VERBATIM.
 *
 * ART. 213 · « Tout employeur, autre que celui qui occupe exclusivement du
 * personnel domestique doit tenir un livre de paie DANS CHACUN DES SIÈGES
 * D'EXPLOITATION de l'entreprise, pour les travailleurs, quelle que soit la
 * nature ou la durée de leur engagement. Le livre de paie doit consigner, à
 * chaque paie, TOUTE SOMME QUELCONQUE attribuée à titre de rémunération. »
 *
 * ART. 214 · « Le livre de paie se compose de feuilles numérotées de manière
 * continue, chacune d'elles comportant AU MOINS DEUX DOUBLES DÉTACHABLES
 * dont la destination est fixée par l'arrêté ministériel conformément à
 * l'article 103 du présent Code. »
 *
 * ART. 215 · « Le livre de paie doit être conforme au MODÈLE FIXÉ PAR ARRÊTÉ
 * du Ministre ayant le Travail et la Prévoyance Sociale dans ses
 * attributions. Dans les entreprises ou établissements dont la comptabilité
 * est tenue par une méthode de décalque ou DE GESTION AUTOMATISÉE,
 * L'INSPECTEUR DU TRAVAIL PEUT AUTORISER le remplacement du livre de paie
 * par tout autre document, pour autant que les mentions essentielles soient
 * conformes à celles reprises dans l'arrêté prévu au premier alinéa du
 * présent article. Les employeurs occupant habituellement moins de
 * VINGT-CINQ travailleurs pourront utiliser un livre de paie INSPIRÉ du
 * modèle fixé. »
 *
 * ART. 103 · « L'employeur est tenu de remettre au travailleur au moment du
 * paiement et selon les modalités fixées par arrêté […] un décompte écrit de
 * la rémunération payée. FAUTE PAR L'EMPLOYEUR D'AVOIR REMPLI CETTE
 * OBLIGATION, SES ALLÉGATIONS CONCERNANT LE DÉCOMPTE DES PAIEMENTS EFFECTUÉS
 * SONT REJETÉES à moins qu'il ne prouve qu'il ne lui a pas été possible de
 * remettre le décompte par la faute du travailleur ou qu'il n'y ait preuve
 * écrite, commencement de preuve par écrit ou aveu du travailleur. »
 * ────────────────────────────────────────────────────────────────────────
 *
 * L'ALINÉA 2 DE L'ARTICLE 215 VISE EXACTEMENT LE CAS D'OMEGAX, ET C'EST LA
 * SEULE BONNE NOUVELLE DE CE FICHIER. Un logiciel de paie est une « gestion
 * automatisée » au sens du texte, et le livre papier peut alors être remplacé
 * par tout autre document. MAIS LA PHRASE PORTE DEUX CONDITIONS, pas une :
 *  · une AUTORISATION de l'Inspecteur du Travail, qui est un acte, pas une
 *    faculté que l'employeur s'accorde ;
 *  · des MENTIONS ESSENTIELLES CONFORMES À CELLES DE L'ARRÊTÉ du premier
 *    alinéa.
 * Sans l'autorisation, l'automatisation ne dispense de rien.
 *
 * ────────────────────────────────────────────────────────────────────────
 * L'ARRÊTÉ DU MODÈLE · IDENTIFIÉ, NON LU, ET DONC NON CODÉ.
 *
 * Le dépôt annonçait ce modèle comme « fixé par arrêté ministériel non lu »
 * sans savoir lequel. IL EST IDENTIFIÉ DEPUIS LE 19/09/2026 · Arrêté
 * ministériel n° 12/CAB.MIN/ETPS/042 du 8 août 2008 fixant le modèle de
 * livre de paie et de décompte écrit de la rémunération, publié au Journal
 * officiel du 15 août 2008 et visé par le Code du travail aux articles 103,
 * 214 et 215.
 *
 * CE N'EST PAS UNE LACUNE DÉCLARÉE À TORT, et il faut le dire net : le dépôt
 * écrivait « arrêté ministériel NON LU », ce qui était exact et le demeure.
 * Ce qui change est plus modeste · la lacune se comble À MOITIÉ, le texte
 * passe d'INCONNU à IDENTIFIÉ, et Manasse a désormais un numéro à verser au
 * corpus plutôt qu'une description.
 *
 * IL N'EST PAS LU POUR AUTANT. La sortie réseau de l'environnement a refusé
 * les quatre dépôts qui le portent. La règle du dépôt ne bouge pas d'un
 * pouce : UNE RÈGLE TIRÉE D'UN EXTRAIT DE RÉSULTAT DE RECHERCHE EST UNE
 * RÈGLE INVENTÉE. Aucune mention, aucune colonne, aucune destination de
 * double ne sort d'ici sur la foi de ce qu'on croit savoir du modèle.
 *
 * CE QUE LE FICHIER PORTE DONC, ce sont les TRENTE MENTIONS DE L'ARTICLE 25
 * DE L'ARRÊTÉ n° 146/2018, qui sont lues, et qui sont celles de la FEUILLE
 * DE PAIE au sens de la sécurité sociale. Ce n'est pas le modèle de
 * l'article 215, et le fichier ne prétend pas que ce le soit · c'est la
 * seule liste de mentions que le corpus porte, et un document qui les
 * couvre toutes est en bien meilleure posture qu'un document qui ne les
 * couvre pas. Le verdict s'appelle donc COUVERTURE, jamais CONFORMITÉ.
 * ────────────────────────────────────────────────────────────────────────
 */

/** Article 215 alinéa 3 · le seuil du livre « inspiré du modèle ». */
export const EFFECTIF_LIVRE_INSPIRE = 25;

/** Article 214 · « au moins deux doubles détachables ». */
export const DOUBLES_DETACHABLES_MINIMUM = 2;

/**
 * L'ARRÊTÉ DU MODÈLE · sa référence, et l'aveu qu'il n'est pas lu. Le champ
 * `lu` ne passera à `true` que le jour où le texte sera au corpus.
 */
export const ARRETE_DU_MODELE = {
  reference: "Arrêté ministériel n° 12/CAB.MIN/ETPS/042 du 8 août 2008",
  objet: "fixant le modèle de livre de paie et de décompte écrit de la rémunération",
  publie: "Journal officiel de la République Démocratique du Congo, 15 août 2008",
  viseParLeCodeDuTravail: ['article 103', 'article 214', 'article 215'],
  lu: false,
  pourquoi:
    "IDENTIFIÉ MAIS NON LU · la sortie réseau de l'environnement refuse les dépôts qui le portent. Tant qu'il " +
    "n'est pas au corpus, OmegaX ne restitue AUCUNE de ses mentions et ne certifie AUCUNE conformité au modèle.",
} as const;

export type MentionFeuilleDePaie = {
  /** Le rang de la mention dans l'article 25, de 1 à 30. */
  readonly rang: number;
  /** Le libellé du texte, recopié. */
  readonly libelle: string;
};

/**
 * LES TRENTE MENTIONS DE L'ARTICLE 25 DE L'ARRÊTÉ n° 146/2018, RECOPIÉES.
 * « La feuille de paie doit comporter notamment les mentions ci-après ».
 * Le mot « NOTAMMENT » est dans le texte · la liste n'est pas fermée, et un
 * document qui les porte toutes n'est pas pour autant complet.
 */
export const MENTIONS_ARTICLE_25: readonly MentionFeuilleDePaie[] = [
  { rang: 1, libelle: 'nom du travailleur' },
  { rang: 2, libelle: 'emploi et catégorie professionnelle' },
  { rang: 3, libelle: "numéro d'immatriculation attribué par la Caisse" },
  { rang: 4, libelle: 'salaire horaire, journalier ou mensuel' },
  { rang: 5, libelle: "nombre d'heures ou de jours pour lesquels le salaire est payé" },
  {
    rang: 6,
    libelle: 'rémunération totale à payer pour la période à laquelle se rapporte le décompte',
  },
  { rang: 7, libelle: 'taux auxquels sont payées les heures supplémentaires effectuées' },
  { rang: 8, libelle: 'montant total à payer pour les heures supplémentaires' },
  {
    rang: 9,
    libelle:
      'suppléments éventuellement payés pour le travail du dimanche et des jours fériés légaux',
  },
  { rang: 10, libelle: 'primes éventuelles' },
  {
    rang: 11,
    libelle:
      "arriérés de rémunération portés sous la rubrique divers et accompagnés le cas échéant, d'une note sous la rubrique observation",
  },
  { rang: 12, libelle: 'nombre de jours de congés payés' },
  { rang: 13, libelle: 'taux journalier des allocations de congé' },
  { rang: 14, libelle: 'total des allocations dues pour le congé' },
  {
    rang: 15,
    libelle:
      "nombre de jours pour lesquels le salaire est payé aux deux tiers en cas de maladie ou d'accident et de congé de maternité",
  },
  { rang: 16, libelle: "taux journalier de salaire en cas de maladie ou d'accident" },
  { rang: 17, libelle: "total du salaire pour les journées d'incapacité" },
  { rang: 18, libelle: 'total de la rémunération brute' },
  { rang: 19, libelle: 'cotisation retenue à charge du travailleur pour la pension' },
  { rang: 20, libelle: 'montant des indemnités compensatoires' },
  { rang: 21, libelle: "montant de l'avance hebdomadaire ou autre" },
  {
    rang: 22,
    libelle: 'déductions pour motifs divers accompagnés d’une note dans la rubrique fiscale',
  },
  { rang: 23, libelle: 'retenue fiscale' },
  { rang: 24, libelle: 'total des déductions' },
  { rang: 25, libelle: "nombre d'enfants pour lesquels les allocations familiales sont dues" },
  { rang: 26, libelle: 'nombre de jours donnant droit à des allocations familiales' },
  { rang: 27, libelle: 'taux journalier des allocations familiales' },
  { rang: 28, libelle: 'montant à payer' },
  { rang: 29, libelle: 'montant pris en considération pour le calcul des cotisations' },
  { rang: 30, libelle: 'observations' },
] as const;

export const RESERVE_NOTAMMENT =
  "ARTICLE 25 · « La feuille de paie doit comporter NOTAMMENT les mentions ci-après ». La liste n'est pas " +
  "fermée. Les porter toutes ne rend donc pas un document complet, cela le rend seulement non fautif sur ces trente points.";

export const RESERVE_MODELE_NON_LU =
  "CES TRENTE MENTIONS NE SONT PAS LE MODÈLE DE L'ARTICLE 215. Elles viennent de l'arrêté n° 146/2018, qui " +
  "règle la sécurité sociale. Le modèle du livre de paie est fixé par l'arrêté ministériel " +
  "n° 12/CAB.MIN/ETPS/042 du 8 août 2008, identifié mais NON LU par OmegaX. Aucune conformité au modèle " +
  "n'est donc certifiée ici, et la couverture rendue ne vaut pas conformité.";

export type MotifRefusLivre =
  | 'MODELE_NON_LU'
  | 'AUTORISATION_INSPECTEUR_ABSENTE'
  | 'SIEGE_DEXPLOITATION_NON_DESIGNE';

export type EntreeLivreDePaie = {
  /** Article 213 · un livre PAR siège d'exploitation. */
  readonly siegeDExploitation?: string | null;
  /** Article 215 alinéa 2 · l'autorisation de l'Inspecteur du Travail. */
  readonly autorisationInspecteurDuTravail?: boolean | null;
  /** Article 215 alinéa 3 · l'effectif habituel de l'établissement. */
  readonly effectifHabituel?: number | null;
  /** Les rangs de l'article 25 que le document proposé porte réellement. */
  readonly mentionsPortees?: readonly number[];
  /** Article 213 · l'employeur occupe-t-il exclusivement du personnel domestique ? */
  readonly exclusivementPersonnelDomestique?: boolean;
};

export type VerdictLivreDePaie = {
  /** Article 213 · le livre est-il seulement dû ? */
  readonly livreDu: boolean;
  /** Article 215 alinéa 2 · le document automatisé remplace-t-il le livre ? */
  readonly remplacementAutorise: boolean;
  /** Article 215 alinéa 3 · le régime allégé joue-t-il ? */
  readonly livreInspireAdmis: boolean;
  readonly mentionsPorteesCount: number;
  readonly mentionsManquantes: readonly MentionFeuilleDePaie[];
  /** JAMAIS `true` tant que l'arrêté de 2008 n'est pas lu. */
  readonly conformiteAuModeleCertifiee: false;
  readonly refus: readonly { motif: MotifRefusLivre; explication: string }[];
  readonly reserves: readonly string[];
};

export function livreDePaie(entree: EntreeLivreDePaie): VerdictLivreDePaie {
  const refus: { motif: MotifRefusLivre; explication: string }[] = [];
  const reserves: string[] = [RESERVE_MODELE_NON_LU, RESERVE_NOTAMMENT];

  // Le modèle n'est pas lu · ce refus est permanent et ne dépend d'aucune saisie.
  refus.push({
    motif: 'MODELE_NON_LU',
    explication: `${ARRETE_DU_MODELE.reference} ${ARRETE_DU_MODELE.objet}. ${ARRETE_DU_MODELE.pourquoi}`,
  });

  const livreDu = !entree.exclusivementPersonnelDomestique;

  if (livreDu && !entree.siegeDExploitation) {
    refus.push({
      motif: 'SIEGE_DEXPLOITATION_NON_DESIGNE',
      explication:
        "ARTICLE 213 · le livre se tient « DANS CHACUN DES SIÈGES D'EXPLOITATION de l'entreprise ». Un seul " +
        "livre pour plusieurs sièges ne satisfait pas le texte, et OmegaX ne sait pas à quel siège rattacher " +
        'ce document tant que le siège n\'est pas désigné.',
    });
  }

  const autorisation = entree.autorisationInspecteurDuTravail === true;
  if (livreDu && !autorisation) {
    refus.push({
      motif: 'AUTORISATION_INSPECTEUR_ABSENTE',
      explication:
        "ARTICLE 215 ALINÉA 2 · une comptabilité tenue par GESTION AUTOMATISÉE permet de remplacer le livre " +
        "de paie par tout autre document, mais seulement si « L'INSPECTEUR DU TRAVAIL PEUT AUTORISER » ce " +
        "remplacement. L'autorisation est un ACTE à obtenir et à conserver au dossier, pas une faculté que " +
        "l'employeur s'accorde du fait qu'il est informatisé. Sans elle, le livre papier reste dû.",
    });
  }

  const portees = new Set(entree.mentionsPortees ?? []);
  const mentionsManquantes = MENTIONS_ARTICLE_25.filter((m) => !portees.has(m.rang));

  return {
    livreDu,
    remplacementAutorise: livreDu && autorisation,
    livreInspireAdmis:
      typeof entree.effectifHabituel === 'number' && entree.effectifHabituel < EFFECTIF_LIVRE_INSPIRE,
    mentionsPorteesCount: MENTIONS_ARTICLE_25.length - mentionsManquantes.length,
    mentionsManquantes,
    conformiteAuModeleCertifiee: false,
    refus,
    reserves,
  };
}

/**
 * LE DÉCOMPTE ÉCRIT DE L'ARTICLE 103, ET SA SANCTION PROBATOIRE.
 *
 * Cet alinéa 2 est le plus lourd du Titre V pour un cabinet : sans décompte
 * remis, « SES ALLÉGATIONS CONCERNANT LE DÉCOMPTE DES PAIEMENTS EFFECTUÉS
 * SONT REJETÉES ». L'employeur qui a payé mais n'a rien remis est réputé ne
 * pas avoir payé, sauf les trois échappatoires du texte. Ce n'est pas une
 * amende, c'est un renversement de la charge de la preuve.
 */
export const SANCTION_ARTICLE_103 =
  "ARTICLE 103 ALINÉA 2 · faute d'avoir remis au travailleur un décompte écrit AU MOMENT DU PAIEMENT, les " +
  "allégations de l'employeur sur les paiements effectués SONT REJETÉES. Trois échappatoires seulement : la " +
  "faute du travailleur rendant la remise impossible, une preuve écrite ou un commencement de preuve par " +
  "écrit, ou l'aveu du travailleur. Un paiement réel mais non décompté se plaide donc comme un non-paiement.";

export const RESERVE_ARTICLE_104 =
  "ARTICLE 104 · l'acceptation sans réserve du décompte, la signature du travailleur et la mention « pour " +
  "solde de tout compte » NE VALENT PAS renonciation à ses droits, ni compte arrêté et réglé au sens de " +
  "l'article 317. Un décompte signé ne clôt rien.";
