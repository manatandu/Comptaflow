/**
 * LES MENTIONS OBLIGATOIRES DE LA FACTURE, ET CE QUE LE LOGICIEL N'EST PAS.
 *
 * CE FICHIER NE DÉCIDE RIEN. Il transcrit trois textes lus, et s'arrête là où
 * ils s'arrêtent.
 *
 * 1 · L'OBLIGATION DE FACTURER. Loi de procédures fiscales, art. 23, dans sa
 *     rédaction issue de la L.F. n° 24/011, de la loi n° 23/052 et de la L.F.
 *     n° 25/060, art. 24 : « les redevables de l'impôt sur les sociétés et de
 *     l'impôt sur le revenu des personnes physiques dans les catégories de
 *     bénéfices des activités industrielles, commerciales, immobilières et
 *     artisanales et de bénéfices de l'exploitation agricole ainsi que ceux de
 *     la taxe sur la valeur ajoutée doivent obligatoirement, POUR CHAQUE
 *     TRANSACTION EFFECTUÉE, délivrer une FACTURE NORMALISÉE ou un document en
 *     tenant lieu dont les mentions sont déterminées par voie réglementaire ».
 *     La rédaction de 2023 disait « une facture » tout court ; celle de 2026
 *     nomme la facture normalisée, que le décret n° 23/10 réglemente déjà
 *     (point 2). L'alinéa 2, ajouté en 2026, admet la facture ÉLECTRONIQUE
 *     « avec la même valeur probante qu'une facture papier, sous réserve des
 *     conditions fixées par Décret délibéré en Conseil des Ministres » · ce
 *     décret n'est dans aucune source lue, et OmegaX ne se dit pas conforme à
 *     des conditions qu'il ne connaît pas.
 *
 *     Ce n'est donc pas une obligation du référentiel comptable, et le module
 *     n'est cloisonné sur aucun des deux · l'ASBL assujettie à la TVA sur une
 *     activité accessoire la porte comme la société commerciale.
 *
 * 2 · LES MENTIONS. DEUX TEXTES, ET C'EST LE PLUS RÉCENT QUI GOUVERNE.
 *     Le décret n° 011/42, art. 100 (adapté par la L.F. n° 22/071), portait
 *     NEUF groupes. Le décret n° 23/10 du 3 mars 2023, art. 26, en porte DOUZE
 *     (a à l) et abroge « toutes les dispositions antérieures contraires »
 *     (art. 28). Les neuf premiers sont les mêmes ; le dixième est nouveau, et
 *     les deux derniers ne s'obtiennent que d'un dispositif électronique
 *     fiscal. Le module a porté les neuf seuls pendant un jour.
 *
 *     Art. 100, pour mémoire :
 *     « identité et n° impôt du vendeur/prestataire ; identité et n° impôt du
 *     client ; date et n° de série ; désignation et quantité ; prix unitaire et
 *     global par type de biens/services (distinction sommes imposables/non
 *     imposables justifiées) ; prix hors TVA ; taux et montant de TVA ; montant
 *     non taxable ; montant TTC ».
 *
 *     Art. 26 du décret n° 23/10 ajoute, après ces neuf : « j) le montant de
 *     tous autres impôts et taxes, LE CAS ÉCHÉANT ; k) le numéro
 *     d'identification du dispositif électronique fiscal utilisé pour la
 *     facturation ; l) le code d'authentification de la transaction par le
 *     dispositif électronique fiscal et le code QR ». Et son dernier alinéa
 *     tranche ce qui vaut pour OmegaX : « LE DOCUMENT TENANT LIEU DE FACTURE
 *     NORMALISÉE comprend toutes les mentions obligatoires visées par le
 *     présent article, À L'EXCEPTION DE CELLES INDIQUÉES AUX POINTS K ET L ».
 *     Ce que le module doit donc servir, c'est DIX groupes, pas neuf.
 *
 * 3 · LA SANCTION. LPF art. 97 bis (créé par l'O.-L. n° 13/005) : « omission
 *     d'une mention obligatoire sur facture ou document en tenant lieu ·
 *     750.000 FC (personnes morales) ; 250.000 FC (personnes physiques), PAR
 *     OMISSION ».
 *
 * CE QUE LE TEXTE NE DIT PAS, ET QU'ON N'INVENTE PAS · l'art. 100 énumère ses
 * mentions en NEUF groupes séparés par des points-virgules, dont plusieurs en
 * réunissent deux (« identité ET n° impôt »). L'art. 97 bis sanctionne « par
 * omission » sans définir l'unité de l'omission : le groupe, ou chacun de ses
 * éléments. Multiplier neuf par 750.000 et annoncer un montant serait donc
 * inventer un barème que personne n'a écrit. Le module compte les groupes
 * manquants, donne l'amende UNITAIRE avec sa source, et dit que le produit des
 * deux ne lui appartient pas.
 */

/** Les deux barèmes de l'art. 97 bis, en francs congolais, PAR omission. */
export const AMENDE_PAR_OMISSION = {
  personneMorale: 750_000,
  personnePhysique: 250_000,
  source: 'Loi de procédures fiscales, art. 97 bis (créé par l’O.-L. n° 13/005 du 23 février 2013)',
  reserve:
    'Le texte sanctionne « par omission » sans définir si l’unité est le groupe de mentions de l’art. 26 ou ' +
    'chacun de ses éléments. Le montant total encouru ne se déduit donc pas du nombre de groupes manquants.',
} as const;

/**
 * L'HOMOLOGATION · CE QUE LE LOGICIEL DISAIT DE FAUX, CORRIGÉ LE 2026-09-13.
 *
 * CE FICHIER A PORTÉ PENDANT UN JOUR UNE PHRASE FAUSSE, et c'est le logiciel
 * qui l'affichait : « aucune source lue ne décrit la procédure d'homologation,
 * renvoyée aux spécifications de l'Administration ». Le texte existe, il est
 * daté, et il nomme la procédure. Il a été trouvé en inventoriant le corpus
 * fiscal pour le plan de confrontations · pas par un chantier, pas par un
 * test.
 *
 * DÉCRET N° 23/10 DU 3 MARS 2023 portant réglementation de la facture
 * normalisée et fixation des modalités de mise en œuvre des dispositifs
 * électroniques fiscaux.
 *
 * CE QU'OMEGAX EST, AU SENS DU TEXTE · un SFE. Art. 3, 7° : « Système de
 * Facturation d'Entreprise (SFE) : logiciel de facturation ou solution
 * informatique permettant à une entreprise de gérer tout ou partie de son
 * processus de facturation. Pour pouvoir émettre une facture normalisée, le
 * système de facturation d'entreprise doit être homologué et relié soit à un
 * MCF physique, soit à un MCF dématérialisé. »
 *
 * LA PROCÉDURE EXISTE ET PORTE UN NOM · art. 22 : « Les personnes physiques ou
 * morales éligibles […] qui ont développé leur propre SFE ne peuvent
 * l'utiliser qu'après obtention d'une ATTESTATION DE CONFORMITÉ délivrée par
 * l'Administration fiscale. » Et art. 3, 1° la définit : « document délivré par
 * l'Administration fiscale au terme de la procédure d'homologation ».
 *
 * CE QUI RESTE HORS DU CORPUS, ET QUI EST DIT COMME TEL · art. 23, « les
 * procédures d'homologation des SFE sont définies par ARRÊTÉ du Ministre ayant
 * les Finances dans ses attributions ». Cet arrêté n'est dans aucune source
 * lue. La suite n'est donc pas une lecture de plus : c'est une démarche auprès
 * de la DGI.
 *
 * ET CE N'EST PLUS SEULEMENT UNE QUESTION D'ÉMISSION · les art. 20 et 21
 * disent que « seuls les SFE homologués sont proposés à la vente aux
 * contribuables et utilisés en République Démocratique du Congo » et que les
 * assujettis « ne peuvent acquérir que des SFE homologués, répertoriés et
 * publiés par l'Administration fiscale ». C'est un arbitrage qui appartient à
 * Manasse, pas au code, et il est porté au plan.
 */
export const HOMOLOGATION = {
  omegaxHomologue: false,
  source: 'Décret n° 23/10 du 3 mars 2023, art. 3 (7°), 20, 21, 22 et 23',
  qualification:
    'OmegaX est un « Système de Facturation d’Entreprise » au sens de l’art. 3, 7° du décret n° 23/10 : un logiciel ' +
    'permettant de gérer tout ou partie du processus de facturation.',
  procedure:
    'Un SFE développé en propre ne peut être utilisé qu’après obtention d’une ATTESTATION DE CONFORMITÉ délivrée ' +
    'par l’Administration fiscale au terme de la procédure d’homologation (art. 22 et art. 3, 1°). Les modalités de ' +
    'cette procédure sont renvoyées à un arrêté du Ministre des Finances (art. 23), qui n’est dans aucune source lue.',
  consequence:
    'Tant que cette attestation n’est pas obtenue, le document produit ici n’est PAS une facture normalisée : il vaut ' +
    '« document en tenant lieu », qui porte les mêmes mentions à l’exception du numéro du dispositif électronique ' +
    'fiscal et du code d’authentification (art. 26, dernier alinéa).',
  /**
   * LE SECOND ARRÊTÉ, QUE LA PASSE F1 A TROUVÉ · et c'est la même faute que
   * celle corrigée le matin même, commise une seconde fois au paragraphe
   * suivant.
   *
   * Le module se range lui-même dans la catégorie « document en tenant lieu »
   * et en TIRE UNE DISPENSE des points k) et l) de l'art. 26. Or c'est un
   * arrêté qui définit cette catégorie : art. 25, dernière phrase, « Un arrêté
   * du Ministre ayant les Finances dans ses attributions détermine les
   * documents tenant lieu de facture normalisée ». Cet arrêté n'est dans
   * aucune source lue, exactement comme celui de l'art. 23.
   *
   * La qualification reste donc une HYPOTHÈSE, et elle est écrite comme telle
   * plutôt que présentée comme acquise · une dispense fondée sur un texte non
   * lu est du même ordre que la lacune déclarée à tort.
   *
   * ANOMALIE DU TEXTE SOURCE, signalée et non tranchée · dans la compilation
   * lue, cette phrase est typographiquement placée À L'INTÉRIEUR du point 3 de
   * l'art. 25 (livraisons à soi-même), à l'indentation de continuation, alors
   * qu'elle définit un terme employé au point 1. Le scan ne permet pas de dire
   * si elle est un alinéa autonome ou une phrase du point 3. Ne pas la
   * « corriger » sans le Journal officiel.
   */
  qualificationHypothetique:
    'La catégorie « document tenant lieu de facture normalisée » est définie par un arrêté du Ministre des Finances ' +
    '(art. 25, dernière phrase), qui n’est dans aucune source lue. Ranger OmegaX dans cette catégorie, et en tirer ' +
    'la dispense des points k) et l), reste donc une HYPOTHÈSE à confirmer auprès de la DGI en même temps que ' +
    'l’homologation.',
} as const;

/**
 * LA CHAÎNE DE LA DÉDUCTION, DU CÔTÉ DE CELUI QUI REÇOIT.
 *
 * Art. 25 · « Pour être admise en déduction, la Taxe sur la Valeur Ajoutée doit
 * figurer : 1. de façon générale, sur une facture normalisée OU TOUT AUTRE
 * DOCUMENT EN TENANT LIEU dûment délivré par un assujetti ; 2. en cas
 * d'importation, sur la déclaration de mise à la consommation délivrée par la
 * douane ; 3. en cas de livraison de biens ou de prestation de services à
 * soi-même, sur une facture normalisée à soi-même. »
 *
 * Art. 27 · « Les entreprises privées, LES ORGANISATIONS NON GOUVERNEMENTALES,
 * les acteurs d'exécution de la dépense publique […] sont tenus DE N'ACCEPTER
 * QUE LES FACTURES NORMALISÉES émises, à l'occasion de leurs transactions de
 * biens et services, par des personnes physiques ou morales éligibles à
 * l'utilisation des dispositifs électroniques fiscaux. »
 *
 * L'ONG EST NOMMÉE, et c'est la confirmation la plus nette que ce module ne
 * devait pas être cloisonné : une ASBL n'est pas seulement concernée quand elle
 * facture, elle l'est quand elle REÇOIT. L'obligation vise ce qu'on accepte de
 * ses fournisseurs, ce que l'état détaillé de l'art. 134 recense justement.
 */
export const OBLIGATION_DACCEPTATION = {
  source: 'Décret n° 23/10 du 3 mars 2023, art. 25 et 27',
  mention:
    'Les entreprises privées, les organisations non gouvernementales et les acteurs de la dépense publique ne ' +
    'doivent accepter que des factures normalisées de leurs fournisseurs éligibles (art. 27).',
  /**
   * CE PARAGRAPHE DISAIT LE TEXTE DE TRAVERS, et la passe F1 l'a relevé.
   *
   * Il écrivait « la TVA n'est déductible QUE SI elle figure sur une facture
   * normalisée ou un document en tenant lieu », c'est-à-dire qu'il faisait du
   * point 1 de l'art. 25 une règle EXCLUSIVE. Le texte dit au contraire « DE
   * FAÇON GÉNÉRALE » pour ce point, et nomme deux autres supports : la
   * déclaration de mise à la consommation en cas d'importation (point 2), et
   * la facture normalisée à soi-même en cas de livraison ou prestation à
   * soi-même (point 3).
   *
   * LA CONSÉQUENCE N'ÉTAIT PAS THÉORIQUE · un cabinet lisant cet écran pouvait
   * croire qu'une TVA d'importation, portée au 445 sur une déclaration en
   * douane, n'ouvrait pas droit à déduction faute de facture. Le logiciel
   * l'aurait dissuadé d'une déduction que le texte lui accorde.
   */
  supportsDeDeduction: [
    {
      cas: 'de façon générale',
      support: 'une facture normalisée ou tout autre document en tenant lieu dûment délivré par un assujetti',
      tenuParOmegaX: true,
    },
    {
      cas: 'en cas d’importation',
      support: 'la déclaration de mise à la consommation délivrée par la douane',
      tenuParOmegaX: false,
    },
    {
      cas: 'en cas de livraison de biens ou de prestation de services à soi-même',
      support: 'une facture normalisée à soi-même',
      tenuParOmegaX: false,
    },
  ],
  reserveSupports:
    'OmegaX ne tient ni déclaration de mise à la consommation, ni facture à soi-même. Une TVA déductible née de ces ' +
    'deux cas existe donc dans les comptes sans que son support propre soit dans le logiciel : l’état détaillé ne ' +
    'peut pas la justifier, et la pièce est à joindre à la main.',
} as const;

/** La forme minimale qu'une facture doit présenter pour être vérifiée. */
export interface FactureVerifiable {
  emetteurNom: string | null;
  /** Art. 26 a) · « l'adresse exacte » du vendeur ou prestataire. */
  emetteurAdresse: string | null;
  emetteurNumeroImpot: string | null;
  contrepartieNom: string | null;
  /** Art. 26 b) · « l'adresse exacte » du client. */
  contrepartieAdresse: string | null;
  contrepartieNumeroImpot: string | null;
  dateFacture: Date | null;
  numeroSerie: string | null;
  /**
   * Décret n° 011/42, art. 60 · la pièce porte-t-elle la mention
   * « Autorisation d'acquitter la TVA d'après les débits » ?
   */
  mentionTvaDebits: boolean;
  /** Art. 26 j) · null quand le comptable n'a pas répondu, 0 quand il n'y en a pas. */
  autresImpotsEtTaxes: number | null;
  lignes: readonly LigneVerifiable[];
}

export interface LigneVerifiable {
  designation: string | null;
  quantite: number | null;
  prixUnitaire: number | null;
  montantHT: number | null;
  imposable: boolean;
  tauxApplique: number | null;
  montantTva: number | null;
}

export type CleMention =
  | 'IDENTITE_VENDEUR'
  | 'IDENTITE_CLIENT'
  | 'DATE_ET_NUMERO'
  | 'DESIGNATION_ET_QUANTITE'
  | 'PRIX_UNITAIRE_ET_GLOBAL'
  | 'PRIX_HORS_TVA'
  | 'TAUX_ET_MONTANT_TVA'
  | 'MONTANT_NON_TAXABLE'
  | 'MONTANT_TTC'
  | 'AUTRES_IMPOTS_ET_TAXES'
  | 'NUMERO_DISPOSITIF_ELECTRONIQUE'
  | 'CODE_AUTHENTIFICATION_ET_QR';

export interface Mention {
  cle: CleMention;
  /** Le groupe tel que le texte l'écrit, sans reformulation. */
  libelle: string;
  presente: (f: FactureVerifiable) => boolean;
  /**
   * Vrai pour les deux mentions qu'un logiciel non homologué ne PEUT pas
   * produire · elles viennent du dispositif électronique fiscal lui-même. Le
   * dernier alinéa de l'art. 26 les retire du document en tenant lieu : les
   * compter comme manquantes ferait crier sur chaque pièce et noierait les
   * vraies omissions.
   */
  exigeUnDispositifElectronique?: true;
}

const renseigne = (v: string | null | undefined): boolean => typeof v === 'string' && v.trim().length > 0;
const nombreRenseigne = (v: number | null | undefined): boolean => typeof v === 'number' && Number.isFinite(v);

/**
 * LES NEUF GROUPES, DANS L'ORDRE DU TEXTE.
 *
 * Deux d'entre eux ne se lisent que sur les LIGNES, et c'est la raison
 * principale de ce chantier : une facture sans lignes ne porte ni désignation,
 * ni quantité, ni prix unitaire · elle manque donc trois groupes sur neuf, et
 * c'est exactement l'état dans lequel se trouvait chaque vente d'OmegaX, dont
 * la seule trace était un `reference` libre sur l'écriture.
 */
export const MENTIONS_ARTICLE_26: readonly Mention[] = [
  {
    /**
     * TROIS ÉLÉMENTS, ET L'ADRESSE MANQUAIT · art. 26 a), lu verbatim : « les
     * nom, post-nom et prénom ou raison sociale, L'ADRESSE EXACTE, le numéro
     * impôt du vendeur ou prestataire ». Le module avait été bâti sur l'art. 100
     * de 2011, qui écrit seulement « identité et n° impôt » : l'adresse n'y est
     * pas, et elle n'était vérifiée nulle part.
     *
     * CE N'ÉTAIT PAS UN CHAMP DE MOINS, C'ÉTAIT UN VERDICT FAUX ·
     * `verifierMentions` rendait `conforme: true` sur une pièce qui omet une
     * mention obligatoire, et l'écran l'affichait comme conforme, sans amende,
     * alors que l'art. 97 bis en punit chaque omission. Le logiciel rassurait à
     * tort sur exactement ce qu'il a été construit pour surveiller.
     */
    cle: 'IDENTITE_VENDEUR',
    libelle: 'identité, adresse exacte et n° impôt du vendeur ou prestataire',
    presente: (f) => renseigne(f.emetteurNom) && renseigne(f.emetteurAdresse) && renseigne(f.emetteurNumeroImpot),
  },
  {
    /**
     * Art. 26 b) · « les nom, post-nom et prénom ou raison sociale, L'ADRESSE
     * EXACTE du client et son numéro impôt ». Même omission, même coût.
     *
     * ET AUCUNE DÉROGATION N'EST FABRIQUÉE pour un client non immatriculé · le
     * texte n'en prévoit pas, et en inventer une dispenserait de la mention sur
     * toute vente à un particulier. Un numéro impôt absent compte comme une
     * omission ; si le texte admet un tempérament, il est dans un arrêté que
     * nous n'avons pas lu.
     */
    cle: 'IDENTITE_CLIENT',
    libelle: 'identité, adresse exacte et n° impôt du client',
    presente: (f) =>
      renseigne(f.contrepartieNom) && renseigne(f.contrepartieAdresse) && renseigne(f.contrepartieNumeroImpot),
  },
  {
    cle: 'DATE_ET_NUMERO',
    libelle: 'date et n° de série',
    presente: (f) => f.dateFacture instanceof Date && !Number.isNaN(f.dateFacture.getTime()) && renseigne(f.numeroSerie),
  },
  {
    cle: 'DESIGNATION_ET_QUANTITE',
    libelle: 'désignation et quantité',
    presente: (f) => f.lignes.length > 0 && f.lignes.every((l) => renseigne(l.designation) && nombreRenseigne(l.quantite)),
  },
  {
    cle: 'PRIX_UNITAIRE_ET_GLOBAL',
    libelle:
      'prix unitaire et global par type de biens ou services (distinction sommes imposables / non imposables justifiées)',
    presente: (f) => f.lignes.length > 0 && f.lignes.every((l) => nombreRenseigne(l.prixUnitaire) && nombreRenseigne(l.montantHT)),
  },
  {
    cle: 'PRIX_HORS_TVA',
    libelle: 'prix hors TVA',
    presente: (f) => f.lignes.length > 0 && f.lignes.every((l) => nombreRenseigne(l.montantHT)),
  },
  {
    /**
     * SUR UNE LIGNE IMPOSABLE SEULEMENT. Exiger un taux sur une ligne exonérée
     * ferait mentir la facture : l'art. 100 demande au contraire de distinguer
     * les sommes imposables des non imposables.
     */
    cle: 'TAUX_ET_MONTANT_TVA',
    libelle: 'taux et montant de TVA',
    presente: (f) =>
      f.lignes.length > 0 &&
      f.lignes.filter((l) => l.imposable).every((l) => nombreRenseigne(l.tauxApplique) && nombreRenseigne(l.montantTva)),
  },
  {
    /**
     * PRÉSENTE DÈS QUE LA DISTINCTION EST TENUE, y compris quand le montant non
     * taxable vaut zéro · une facture entièrement imposable porte bien la
     * mention « montant non taxable : 0 ». Ce qui la ferait manquer, c'est une
     * ligne dont on ne sait pas si elle est imposable, et le modèle ne permet
     * pas cet état.
     */
    cle: 'MONTANT_NON_TAXABLE',
    libelle: 'montant non taxable',
    presente: (f) => f.lignes.length > 0 && f.lignes.every((l) => nombreRenseigne(l.montantHT)),
  },
  {
    cle: 'MONTANT_TTC',
    libelle: 'montant toutes taxes comprises',
    presente: (f) =>
      f.lignes.length > 0 && f.lignes.every((l) => nombreRenseigne(l.montantHT) && nombreRenseigne(l.montantTva)),
  },
  {
    /**
     * LE DIXIÈME, QUE LE DÉCRET DE 2023 A AJOUTÉ. « Le cas échéant » ne veut
     * pas dire facultatif : il veut dire « s'il y en a ». Aucun logiciel ne
     * sait s'il y a d'autres impôts sur une opération donnée · c'est au
     * comptable de le dire, fût-ce en portant zéro. Un champ laissé vide n'est
     * donc pas une absence d'autres taxes, c'est une absence de réponse, et le
     * module la compte comme une omission plutôt que de trancher à sa place.
     */
    cle: 'AUTRES_IMPOTS_ET_TAXES',
    libelle: 'montant de tous autres impôts et taxes, le cas échéant',
    presente: (f) => nombreRenseigne(f.autresImpotsEtTaxes),
  },
  {
    cle: 'NUMERO_DISPOSITIF_ELECTRONIQUE',
    libelle: 'numéro d’identification du dispositif électronique fiscal utilisé pour la facturation',
    presente: () => false,
    exigeUnDispositifElectronique: true,
  },
  {
    cle: 'CODE_AUTHENTIFICATION_ET_QR',
    libelle: 'code d’authentification de la transaction par le dispositif électronique fiscal, et code QR',
    presente: () => false,
    exigeUnDispositifElectronique: true,
  },
];

/** Les dix groupes qu'un document en tenant lieu doit servir · art. 26, dernier alinéa. */
export const MENTIONS_DOCUMENT_EN_TENANT_LIEU = MENTIONS_ARTICLE_26.filter(
  (m) => !m.exigeUnDispositifElectronique,
);

/**
 * LE BORNAGE, QUI MANQUAIT · art. 29 du décret n° 23/10 : « Le Ministre ayant
 * les Finances dans ses attributions est chargé de l'exécution du présent
 * Décret QUI ENTRE EN VIGUEUR À LA DATE DE SA SIGNATURE. » Signé le 3 mars
 * 2023. Pas de vacatio legis, pas de période transitoire.
 *
 * LE DÉPÔT CONNAISSAIT DÉJÀ CETTE DOCTRINE ET NE L'AVAIT PAS APPLIQUÉE ICI.
 * `controles.service.ts` l'écrit en toutes lettres · « LE BORNAGE N'EST PAS UNE
 * PRÉCAUTION, C'EST LE CONTRÔLE LUI-MÊME », et « sans cette borne, un dossier
 * qui fait analyser son exercice 2024 ou 2025 se verrait reprocher une pièce
 * qu'aucun texte ne lui demandait alors ». Le module de facturation était le
 * seul endroit où un texte fiscal daté s'appliquait sans sa borne : une facture
 * de 2022 reprise dans un dossier se voyait reprocher l'adresse exacte et les
 * autres impôts au nom d'un décret qui n'existait pas encore, avec une amende
 * chiffrée sur ce reproche.
 *
 * CE QUI S'APPLIQUAIT AVANT N'EST PAS « RIEN » · l'art. 100 du décret n° 011/42
 * du 22 novembre 2011 porte NEUF groupes, et l'art. 28 du décret de 2023
 * n'abroge que « les dispositions antérieures CONTRAIRES ». Les neuf ne sont pas
 * contraires aux douze, ils en sont le noyau : une pièce antérieure se vérifie
 * donc contre eux, et le module le DIT plutôt que de laisser croire qu'il
 * applique le même texte à toutes les dates.
 */
export const ENTREE_EN_VIGUEUR_DECRET_23_10 = new Date(Date.UTC(2023, 2, 3));

/**
 * Les neuf groupes de l'art. 100, pour une pièce antérieure au 3 mars 2023 ·
 * l'adresse exacte et les autres impôts n'y figurent pas, et les deux mentions
 * du dispositif électronique non plus.
 */
/**
 * L'ARTICLE 100 RÉCLAME L'ADRESSE EXACTE, LUI AUSSI · ET CE MODULE A AFFIRMÉ LE
 * CONTRAIRE PENDANT TROIS JOURS.
 *
 * La passe F1 a corrigé l'oubli de l'adresse exacte sur la branche du décret
 * n° 23/10 (art. 26). Elle a, du même geste, DÉRIVÉ la branche antérieure en
 * retirant cette mention, et écrit que l'art. 100 ne la réclamait pas. C'était
 * faux. Fichier `code-general-2026/references/12-tva-decret-application-ch5-8.md`,
 * art. 100 du décret n° 011/42 du 22 novembre 2011, VERBATIM, ses deux premiers
 * tirets : « - les noms, post-nom, prénom ou raison sociale, L'ADRESSE EXACTE,
 * le numéro impôt du vendeur ou prestataire ; - les noms, post-nom et prénom ou
 * raison sociale, L'ADRESSE EXACTE du client et son numéro impôt ; ».
 *
 * Le défaut corrigé était donc REVENU par l'autre porte, et sur la branche la
 * plus difficile à voir · celle des pièces anciennes reprises dans un dossier.
 * `verifierMentions` rendait `conforme: true` sur une facture de 2022 qui omet
 * deux mentions obligatoires.
 *
 * ET LA CONSÉQUENCE EST PLUS LOURDE ICI QUE SUR L'AUTRE BRANCHE. L'art. 104 du
 * même décret : « Les biens et services qui ne remplissent pas les conditions
 * visées aux articles 95, 98 et 100 ci-dessus sont EXCLUS DU DROIT À
 * DÉDUCTION. » Une facture d'achat sans adresse n'ouvre pas droit à déduction,
 * et le logiciel l'affichait conforme.
 *
 * CE QUI DIFFÈRE VRAIMENT ENTRE LES DEUX TEXTES, et c'est tout : l'art. 100
 * compte NEUF groupes, l'art. 26 du décret n° 23/10 en compte DIX, le dixième
 * étant « le montant des autres impôts et taxes ». C'est la seule mention que
 * cette branche retire.
 */
export const MENTIONS_ARTICLE_100: readonly Mention[] = MENTIONS_DOCUMENT_EN_TENANT_LIEU.filter(
  (m) => m.cle !== 'AUTRES_IMPOTS_ET_TAXES',
);

/** Décret n° 011/42, art. 104 · ce que coûte une pièce incomplète. */
export const EXCLUSION_DEDUCTION_ART_104 = {
  article: 'décret n° 011/42, art. 104',
  citation:
    'Les biens et services qui ne remplissent pas les conditions visées aux articles 95, 98 et 100 ci-dessus sont ' +
    'exclus du droit à déduction.',
  portee:
    "Une facture d'ACHAT à laquelle il manque une mention de l'article 100 n'ouvre pas droit à déduction · la " +
    "sanction ne se limite donc pas à l'amende de l'article 97 bis, elle atteint la taxe elle-même.",
} as const;

export interface TexteApplicable {
  mentions: readonly Mention[];
  texte: string;
  source: string;
}

/** Le texte en vigueur À LA DATE DE LA PIÈCE, jamais celui d'aujourd'hui. */
export function texteApplicable(dateFacture: Date | null): TexteApplicable {
  const anterieure =
    dateFacture instanceof Date &&
    !Number.isNaN(dateFacture.getTime()) &&
    dateFacture.getTime() < ENTREE_EN_VIGUEUR_DECRET_23_10.getTime();

  return anterieure
    ? {
        mentions: MENTIONS_ARTICLE_100,
        texte: 'Décret n° 011/42 du 22 novembre 2011, art. 100 · neuf groupes',
        source:
          'Pièce antérieure au 3 mars 2023 : le décret n° 23/10 « entre en vigueur à la date de sa signature » ' +
          '(art. 29) et ne lui est pas opposable. L’ADRESSE EXACTE lui est réclamée TOUT AUTANT, aux deux tirets de ' +
          'l’article 100 ; seul le montant des autres impôts et taxes, dixième groupe ajouté par l’article 26 du ' +
          'décret n° 23/10, ne l’est pas. Et l’article 104 du même décret n° 011/42 EXCLUT DU DROIT À DÉDUCTION les ' +
          'biens et services dont la pièce ne remplit pas les conditions de l’article 100.',
      }
    : {
        mentions: MENTIONS_DOCUMENT_EN_TENANT_LIEU,
        texte: 'Décret n° 23/10 du 3 mars 2023, art. 26 · dix groupes pour un document en tenant lieu',
        source: 'Le décret est entré en vigueur le 3 mars 2023, date de sa signature (art. 29).',
      };
}

export interface Totaux {
  montantHT: number;
  montantNonTaxable: number;
  montantImposable: number;
  montantTva: number;
  montantTTC: number;
}

/** Les totaux que l'art. 100 demande de porter au pied de la facture. */
export function totauxFacture(f: Pick<FactureVerifiable, 'lignes'>): Totaux {
  let montantHT = 0;
  let montantNonTaxable = 0;
  let montantTva = 0;
  for (const l of f.lignes) {
    const ht = l.montantHT ?? 0;
    montantHT += ht;
    if (!l.imposable) montantNonTaxable += ht;
    montantTva += l.montantTva ?? 0;
  }
  return {
    montantHT,
    montantNonTaxable,
    montantImposable: montantHT - montantNonTaxable,
    montantTva,
    montantTTC: montantHT + montantTva,
  };
}

/**
 * Ce que la pièce ne porte pas elle-même, et qu'il faut pour juger l'art. 60 ·
 * le SENS de la facture et le RÉGIME du dossier qui la délivre.
 */
export interface ContexteMentions {
  sensVente?: boolean;
  regimeExigibiliteTva?: string | null;
}

/** Décret n° 011/42, art. 60 · texte exact de la mention et sa portée. */
export const MENTION_AUTORISATION_DEBITS = {
  texte: "Autorisation d'acquitter la TVA d'après les débits",
  article: "décret n° 011/42, art. 60",
  citation:
    'La mention « Autorisation d\u2019acquitter la TVA d\u2019après les débits » doit figurer sur toutes les ' +
    'factures délivrées par le prestataire de services ou l\u2019entrepreneur de travaux publics ou de travaux ' +
    'immobiliers.',
  consequence:
    "L'article 61 du même décret fait de l'inscription au débit du compte du client l'exigibilité de la taxe, et " +
    "l'article 96 en fait naître le droit à déduction du CLIENT. Sans la mention, le client ne peut pas savoir " +
    "qu'il déduit dès la facture.",
  reserveSanction:
    "Le décret n° 011/42 n'énonce lui-même aucune sanction pour cette omission. OmegaX NE CHIFFRE AUCUNE AMENDE " +
    "ici, et ce silence n'est pas une dispense : l'article 97 bis de la loi de procédures fiscales frappe « TOUTE " +
    "omission d'une mention obligatoire constatée dans une facture ou un document en tenant lieu », sans désigner " +
    'le texte qui pose la mention, et la mention de l\u2019article 60 en est une · le décret écrit qu\u2019elle ' +
    '« DOIT figurer sur toutes les factures délivrées » par le prestataire autorisé. Le point n\u2019est pas ' +
    "tranché par les sources lues et appartient à l'appréciation de l'Administration : le chiffrer serait " +
    "l'inventer, le nier serait rassurer à tort.",
} as const;

export interface VerificationMentions {
  /** Art. 60 · la mention est-elle due sur cette pièce ? */
  mentionDebitsExigee: boolean;
  /** Art. 60 · elle est due et absente. */
  mentionDebitsManquante: boolean;
  mentionDebits: typeof MENTION_AUTORISATION_DEBITS;
  conforme: boolean;
  /** Le texte en vigueur à la date de la pièce, et pourquoi c'est celui-là. */
  texteApplicable: TexteApplicable;
  manquantes: { cle: CleMention; libelle: string }[];
  presentes: CleMention[];
  /** Les deux mentions qui supposent un dispositif électronique fiscal homologué. */
  horsDePortee: { cle: CleMention; libelle: string }[];
  amendeUnitaire: number;
  /** Toujours rendue : le total encouru ne se calcule pas (voir AMENDE_PAR_OMISSION.reserve). */
  reserveAmende: string;
  source: string;
}

/**
 * @param personneMorale commande le barème de l'art. 97 bis, pas le contenu des
 * mentions · les neuf groupes sont les mêmes pour tous.
 */
export function verifierMentions(
  f: FactureVerifiable,
  personneMorale: boolean,
  contexte: ContexteMentions = {},
): VerificationMentions {
  const applicable = texteApplicable(f.dateFacture);
  const manquantes: { cle: CleMention; libelle: string }[] = [];
  const presentes: CleMention[] = [];
  for (const m of applicable.mentions) {
    if (m.presente(f)) presentes.push(m.cle);
    else manquantes.push({ cle: m.cle, libelle: m.libelle });
  }
  /*
    LA MENTION DE L'ARTICLE 60 · DEUX TEXTES, DEUX SANCTIONS, UNE SEULE PIÈCE.

    Elle ne vient PAS du décret n° 23/10, dont les art. 26 et 100 fixent les
    mentions de la facture normalisée : elle vient du décret n° 011/42 portant
    mesures d'application de la TVA, art. 60 (fichier
    `code-general-2026/references/11-tva-decret-application-ch1-4.md`) :
    « La mention "Autorisation d'acquitter la TVA d'après les débits" doit
    figurer sur toutes les factures délivrées par le prestataire de services ou
    l'entrepreneur de travaux publics ou de travaux immobiliers. »

    Elle est donc comptée À PART des mentions de l'art. 26, et OmegaX NE
    CHIFFRE AUCUNE AMENDE sur son omission.

    MAIS CE SILENCE N'EST PAS UNE DISPENSE, ET LA PHRASE D'AVANT L'ÉTAIT.
    Jusqu'à la passe F9, ce commentaire et l'écran affirmaient que « ce barème
    vise les mentions du décret n° 23/10 ». Le texte ne dit rien de tel :
    l'art. 97 bis frappe « TOUTE omission d'une mention obligatoire constatée
    dans une facture ou un document en tenant lieu », sans désigner de texte.
    Et sa date le démontre à elle seule · il est CRÉÉ PAR L'O.-L. N° 13/005 DU
    23 FÉVRIER 2013, dix ans avant le décret n° 23/10 du 3 mars 2023 : un
    barème de 2013 ne peut pas avoir été écrit pour les mentions d'un décret de
    2023, et les seules mentions obligatoires en vigueur à sa création étaient
    justement celles du décret n° 011/42 de 2011.

    LE FICHIER SE CONTREDISAIT D'AILLEURS TRENTE LIGNES PLUS LOIN, puisqu'il
    attache bien l'art. 97 bis aux neuf groupes de l'art. 100 du décret
    n° 011/42 pour toute pièce antérieure à 2023. C'était donc une LACUNE
    DÉCLARÉE À TORT, et elle jouait dans le sens qui rassure.

    CE QUI N'EST PAS TRANCHÉ, ET QUI RESTE ÉCRIT COMME TEL · dire que l'amende
    EST due supposerait de qualifier l'omission, ce qui appartient à
    l'Administration. Le module nomme donc l'exposition sans la chiffrer.
    Ce qui est en jeu n'en est pas moins lourd · l'art. 61 fait de l'inscription
    au débit du compte du client l'exigibilité de la taxe, et l'art. 96 fait
    naître de cette exigibilité le droit à déduction du CLIENT. Sans la
    mention, le client ne peut pas savoir qu'il déduit plus tôt.

    ELLE N'EST EXIGÉE QUE DE CELUI QUI DÉLIVRE LA FACTURE, ET QUI EST AUTORISÉ.
    Sur un ACHAT, la mention se lit, elle ne s'impose pas · c'est le
    fournisseur qui la doit. Et un dossier dont le régime n'est pas DEBITS
    n'est pas autorisé : rien à mentionner.

    `conforme` LA PREND EN COMPTE. C'est le point du défaut : une pièce qui
    omet une mention obligatoire ne peut pas être affichée conforme, et c'est
    exactement la correction que la passe F1 avait faite sur l'adresse exacte.
  */
  const mentionDebitsExigee = contexte.sensVente === true && contexte.regimeExigibiliteTva === 'DEBITS';
  const mentionDebitsManquante = mentionDebitsExigee && !f.mentionTvaDebits;
  return {
    conforme: manquantes.length === 0 && !mentionDebitsManquante,
    mentionDebitsExigee,
    mentionDebitsManquante,
    mentionDebits: MENTION_AUTORISATION_DEBITS,
    texteApplicable: applicable,
    manquantes,
    presentes,
    horsDePortee: MENTIONS_ARTICLE_26.filter((m) => m.exigeUnDispositifElectronique).map((m) => ({
      cle: m.cle,
      libelle: m.libelle,
    })),
    amendeUnitaire: personneMorale ? AMENDE_PAR_OMISSION.personneMorale : AMENDE_PAR_OMISSION.personnePhysique,
    reserveAmende: AMENDE_PAR_OMISSION.reserve,
    source: `${applicable.texte} · sanction : loi de procédures fiscales, art. 97 bis`,
  };
}
