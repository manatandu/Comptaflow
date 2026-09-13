/**
 * LES MENTIONS OBLIGATOIRES DE LA FACTURE, ET CE QUE LE LOGICIEL N'EST PAS.
 *
 * CE FICHIER NE DÉCIDE RIEN. Il transcrit trois textes lus, et s'arrête là où
 * ils s'arrêtent.
 *
 * 1 · L'OBLIGATION DE FACTURER. Loi de procédures fiscales, art. 23 (modifié
 *     par la loi n° 23/052 du 30 novembre 2023) : « les redevables de l'Impôt
 *     sur les Sociétés et de la Taxe sur la Valeur Ajoutée ainsi que, le cas
 *     échéant, ceux de l'Impôt sur le Revenu des Personnes Physiques doivent
 *     obligatoirement, POUR CHAQUE TRANSACTION EFFECTUÉE, délivrer une facture
 *     ou un document en tenant lieu, dont les mentions sont déterminées par
 *     voie réglementaire ».
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
    'doivent accepter que des factures normalisées de leurs fournisseurs éligibles. Et la TVA n’est déductible que ' +
    'si elle figure sur une facture normalisée ou un document en tenant lieu dûment délivré par un assujetti.',
} as const;

/** La forme minimale qu'une facture doit présenter pour être vérifiée. */
export interface FactureVerifiable {
  emetteurNom: string | null;
  emetteurNumeroImpot: string | null;
  contrepartieNom: string | null;
  contrepartieNumeroImpot: string | null;
  dateFacture: Date | null;
  numeroSerie: string | null;
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
    cle: 'IDENTITE_VENDEUR',
    libelle: 'identité et n° impôt du vendeur ou prestataire',
    presente: (f) => renseigne(f.emetteurNom) && renseigne(f.emetteurNumeroImpot),
  },
  {
    cle: 'IDENTITE_CLIENT',
    libelle: 'identité et n° impôt du client',
    presente: (f) => renseigne(f.contrepartieNom) && renseigne(f.contrepartieNumeroImpot),
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

export interface Totaux {
  montantHT: number;
  montantNonTaxable: number;
  montantImposable: number;
  montantTva: number;
  montantTTC: number;
}

/** Les totaux que l'art. 100 demande de porter au pied de la facture. */
export function totauxFacture(f: FactureVerifiable): Totaux {
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

export interface VerificationMentions {
  conforme: boolean;
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
export function verifierMentions(f: FactureVerifiable, personneMorale: boolean): VerificationMentions {
  const manquantes: { cle: CleMention; libelle: string }[] = [];
  const presentes: CleMention[] = [];
  for (const m of MENTIONS_DOCUMENT_EN_TENANT_LIEU) {
    if (m.presente(f)) presentes.push(m.cle);
    else manquantes.push({ cle: m.cle, libelle: m.libelle });
  }
  return {
    conforme: manquantes.length === 0,
    manquantes,
    presentes,
    horsDePortee: MENTIONS_ARTICLE_26.filter((m) => m.exigeUnDispositifElectronique).map((m) => ({
      cle: m.cle,
      libelle: m.libelle,
    })),
    amendeUnitaire: personneMorale ? AMENDE_PAR_OMISSION.personneMorale : AMENDE_PAR_OMISSION.personnePhysique,
    reserveAmende: AMENDE_PAR_OMISSION.reserve,
    source: 'Décret n° 23/10 du 3 mars 2023, art. 26 · sanction : loi de procédures fiscales, art. 97 bis',
  };
}
