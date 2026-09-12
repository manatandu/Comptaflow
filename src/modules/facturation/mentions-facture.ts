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
 * 2 · LES MENTIONS. Décret n° 011/42, art. 100 (adapté conformément à la
 *     L.F. n° 22/071 du 28 décembre 2022), reproduit ici à l'identique :
 *     « identité et n° impôt du vendeur/prestataire ; identité et n° impôt du
 *     client ; date et n° de série ; désignation et quantité ; prix unitaire et
 *     global par type de biens/services (distinction sommes imposables/non
 *     imposables justifiées) ; prix hors TVA ; taux et montant de TVA ; montant
 *     non taxable ; montant TTC ».
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
    'Le texte sanctionne « par omission » sans définir si l’unité est le groupe de mentions de l’art. 100 ou ' +
    'chacun de ses éléments. Le montant total encouru ne se déduit donc pas du nombre de groupes manquants.',
} as const;

/**
 * L'HOMOLOGATION QUE LE LOGICIEL N'A PAS, dite ici et rendue à l'écran.
 *
 * O.-L. n° 10/001, art. 58 (modifié par la L.F. n° 22/071 du 28 décembre
 * 2022) : le redevable « doit délivrer une facture normalisée PRODUITE PAR LES
 * DISPOSITIFS ÉLECTRONIQUES FISCAUX (ou document en tenant lieu) ».
 *
 * Art. 59 quater (créé par la L.F. n° 17/005, modifié par la L.F. n° 22/071) :
 * « Les systèmes de facturation propres doivent respecter les spécifications
 * techniques et être HOMOLOGUÉS AVANT TOUTE UTILISATION, avec inaltérabilité,
 * sécurisation, conservation et archivage des données. »
 *
 * OmegaX n'est pas homologué, et aucune source lue ne dit comment il le
 * deviendrait · les spécifications techniques sont renvoyées à
 * l'Administration. Le document que ce module produit N'EST DONC PAS une
 * facture normalisée, et le logiciel ne l'appelle jamais ainsi. Il tient la
 * facture comme PIÈCE JUSTIFICATIVE (AUDCIF art. 17 · pièces datées, classées,
 * conservées dix ans) et comme source de l'état détaillé, ce qui ne demande
 * aucune homologation. Laisser croire l'inverse ferait porter à un client une
 * conformité qu'il n'a pas.
 */
export const HOMOLOGATION = {
  omegaxHomologue: false,
  source: 'O.-L. n° 10/001, art. 58 et 59 quater (L.F. n° 22/071 du 28 décembre 2022)',
  consequence:
    'Le document produit ici n’est PAS une facture normalisée au sens de l’art. 58 : OmegaX n’est pas homologué ' +
    'comme système de facturation et aucune source lue ne décrit la procédure d’homologation, renvoyée aux ' +
    'spécifications de l’Administration. Il vaut pièce justificative et alimente l’état détaillé ; la facture ' +
    'normalisée reste à produire par le dispositif électronique fiscal du redevable.',
} as const;

/** La forme minimale qu'une facture doit présenter pour être vérifiée. */
export interface FactureVerifiable {
  emetteurNom: string | null;
  emetteurNumeroImpot: string | null;
  contrepartieNom: string | null;
  contrepartieNumeroImpot: string | null;
  dateFacture: Date | null;
  numeroSerie: string | null;
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
  | 'MONTANT_TTC';

export interface Mention {
  cle: CleMention;
  /** Le groupe tel que l'art. 100 l'écrit, sans reformulation. */
  libelle: string;
  presente: (f: FactureVerifiable) => boolean;
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
export const MENTIONS_ARTICLE_100: readonly Mention[] = [
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
];

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
  for (const m of MENTIONS_ARTICLE_100) {
    if (m.presente(f)) presentes.push(m.cle);
    else manquantes.push({ cle: m.cle, libelle: m.libelle });
  }
  return {
    conforme: manquantes.length === 0,
    manquantes,
    presentes,
    amendeUnitaire: personneMorale ? AMENDE_PAR_OMISSION.personneMorale : AMENDE_PAR_OMISSION.personnePhysique,
    reserveAmende: AMENDE_PAR_OMISSION.reserve,
    source: 'Décret n° 011/42, art. 100 · sanction : loi de procédures fiscales, art. 97 bis',
  };
}
