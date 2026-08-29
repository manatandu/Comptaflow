/**
 * REGISTRE DES RETENUES À LA SOURCE ET ÉCHÉANCIER FISCAL.
 *
 * ## Pourquoi cet état existe
 *
 * Une ASBL congolaise régulièrement constituée est exemptée d'impôt sur les
 * sociétés (loi n° 23/053, art. 5 point 5 ; arrêté ministériel
 * n° 007/CAB/MIN/FINANCES/2025 du 19 février 2025). Elle n'est dispensée
 * d'AUCUN impôt qu'elle retient pour le compte d'autrui, ni d'aucune
 * cotisation sociale. C'est là qu'une association se met en défaut, et
 * précisément parce qu'elle croit que « ne rien payer » vaut « ne rien
 * devoir ». Voir `docs/fiscalite-asbl-rdc.md`, section 6.
 *
 * Cet état ne calcule aucun impôt. Il recense ce que la comptabilité porte
 * DÉJÀ sur les comptes de retenue et de cotisation, en regard de l'échéance
 * légale de reversement. La distinction est essentielle : un logiciel
 * comptable qui liquiderait de l'impôt sur un barème qu'il ne contrôle pas
 * rendrait un mauvais service (même note, section 9.2).
 *
 * ## Ce qui est figé, ce qui ne l'est pas
 *
 * Aucun taux n'est inscrit ici. Les ÉCHÉANCES le sont, avec leur base légale
 * citée et la date à laquelle elles ont été vérifiées, parce qu'elles
 * changent aussi : l'article 57 bis de la loi de procédures fiscales a été
 * modifié par la loi de finances n° 25/060 du 29 décembre 2025, qui a déplacé
 * les acomptes provisionnels du 1er août au 25 juillet. Elles sont donc
 * présentées comme des repères datés et sourcés, pas comme une vérité du
 * logiciel.
 */

export interface NatureRetenue {
  cle: string;
  libelle: string;
  /** Comptes du plan SYCEBNL qui portent cette retenue ou cotisation. */
  comptes: string[];
  exclusions?: string[];
  /** Qui en est le bénéficiaire · commande le regroupement à l'écran. */
  beneficiaire: 'ETAT' | 'ORGANISME_SOCIAL';
  /** Jour du mois suivant où le reversement est dû. */
  jourEcheance: number;
  /** Formulation exacte de l'échéance, telle que le texte la pose. */
  echeance: string;
  baseLegale: string;
  /** Précision à afficher quand elle change la lecture de la ligne. */
  reserve?: string;
}

/**
 * Date de dernière confrontation de ces échéances aux textes encodés
 * (skill `fiscalite-rdc-socle`, `parametres-2026.md`). Affichée à l'écran :
 * une échéance sans date de vérification n'engage personne.
 */
export const DERNIERE_VERIFICATION = '2026-08-29';

export const NATURES_RETENUES: NatureRetenue[] = [
  {
    cle: 'irppSalaires',
    libelle: 'IRPP retenu sur les revenus salariaux',
    // 447 « Etat, impôts retenus à la source », subdivisions 4471 Impôt
    // général sur le revenu et 4472 Impôts sur salaires (Partie 2, ch. 3,
    // COMPTE 44).
    comptes: ['4471', '4472'],
    beneficiaire: 'ETAT',
    jourEcheance: 15,
    echeance: 'Le 15 du mois suivant le versement des rémunérations',
    baseLegale:
      "Article 18 de la loi n° 004/2003 portant réforme des procédures fiscales, tel que modifié par la loi n° 23/052 du 30 novembre 2023.",
    reserve:
      "Depuis le 1er janvier 2026, c'est l'IRPP et non plus l'IPR : la loi n° 23/053 a abrogé l'impôt professionnel sur les rémunérations. Une part importante de la documentation congolaise en ligne, pages de la DGI comprises, décrit encore le régime abrogé.",
  },
  {
    cle: 'contributions',
    libelle: 'Contribution nationale et contribution nationale de solidarité',
    comptes: ['4473', '4474'],
    beneficiaire: 'ETAT',
    jourEcheance: 15,
    echeance: 'Le 15 du mois suivant',
    baseLegale: 'Article 18 de la loi de procédures fiscales (retenues à la source).',
  },
  {
    cle: 'autresRetenues',
    libelle: 'Autres impôts et contributions retenus à la source',
    comptes: ['4478'],
    beneficiaire: 'ETAT',
    jourEcheance: 15,
    echeance: 'Le 15 du mois suivant, sauf retenue locative (10 jours)',
    baseLegale:
      "Articles 19, 22 bis et 57 de la loi de procédures fiscales : prélèvement exceptionnel sur le personnel expatrié (25 %, dans les 15 jours suivant le mois du versement), prélèvement sur les sommes payées aux prestataires non-résidents (14 %, le 15 du mois suivant), retenue sur les revenus locatifs (dans les 10 jours du mois suivant le paiement du loyer).",
    reserve:
      "Le plan SYCEBNL n'ouvre qu'un compte 4478 pour ces trois prélèvements, dont les échéances diffèrent (10 ou 15 jours). Ouvrez un sous-compte par nature si votre dossier en porte plusieurs : sans cela, le registre ne peut pas distinguer leurs dates. Réserve supplémentaire sur le prélèvement expatriés : l'article 145 de la loi 23/053 ne vise que « les entreprises individuelles ou sociétaires », et une ASBL n'est ni l'une ni l'autre. Tension à faire trancher par un conseil, pas par ce logiciel.",
  },
  {
    cle: 'tva',
    libelle: 'TVA due',
    // 444 « Etat, T.V.A. due ou crédit de T.V.A. ». Le registre de TVA
    // proprement dit vit dans le module TVA ; il figure ici parce que
    // l'échéancier doit être complet.
    comptes: ['444'],
    beneficiaire: 'ETAT',
    jourEcheance: 15,
    echeance: 'Le 15 du mois suivant',
    baseLegale: "Ordonnance-loi n° 10/001 du 20 août 2010 instituant la TVA et son décret d'application n° 011/42.",
    reserve:
      "Une ASBL dont les opérations sont conformes à son objet est exonérée de TVA (art. 15.2 et 17.8), mais l'exonération d'impôt sur les sociétés ne l'emporte pas : les deux régimes s'apprécient séparément, l'arrêté n° 007/2025 le dit lui-même.",
  },
  {
    cle: 'cotisationsSociales',
    libelle: 'Cotisations sociales retenues et patronales',
    // 43 « Organismes sociaux » · CNSS, INPP, ONEM.
    comptes: ['43'],
    beneficiaire: 'ORGANISME_SOCIAL',
    jourEcheance: 15,
    echeance: 'Selon les règles propres à chaque organisme',
    baseLegale:
      "Loi n° 16/009 du 15 juillet 2016 (régime général de sécurité sociale) et décret n° 18/041 du 24 novembre 2018 fixant les taux : prestations aux familles 6,5 %, pensions 10 % (5 % employeur, 5 % travailleur), risques professionnels 1,5 %. INPP : taux par tranche d'effectif, relevés en 2025.",
    reserve:
      "L'échéance retenue ici est un repère : les organismes sociaux fixent leurs propres délais, et la déclaration unifiée ne les aligne pas tous. Vérifiez auprès de la CNSS et de l'INPP.",
  },
];

/**
 * Rappel affiché en tête de l'état · ce n'est pas un ornement, c'est ce qui
 * distingue cet écran d'un calculateur d'impôt.
 */
export const AVERTISSEMENT_REGISTRE =
  "Cet état ne calcule aucun impôt et n'applique aucun barème. Il recense ce que votre comptabilité porte déjà sur " +
  "les comptes de retenue et de cotisation, en regard de l'échéance légale de reversement. Les montants viennent de " +
  'vos écritures ; les échéances viennent des textes cités, à la date de vérification indiquée.';

export const AVERTISSEMENT_EXONERATION =
  "L'exemption d'impôt sur les sociétés dont bénéficie une ASBL régulièrement constituée (loi n° 23/053, art. 5 " +
  "point 5) ne dispense d'aucun impôt retenu pour le compte d'autrui, ni d'aucune cotisation sociale. Elle ne " +
  'dispense pas non plus de DÉCLARER aux échéances prévues, même lorsque rien n\'est dû.';
