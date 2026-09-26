/**
 * CE QUI EST JOURNALISÉ, ET CE QUI NE L'EST PAS.
 *
 * Journaliser les quarante-deux modèles reviendrait à doubler chaque écriture
 * de la base, y compris les lignes engendrées en masse (dotations
 * d'amortissement, échéances, ventilations analytiques), pour une trace que
 * personne ne lira · le détail est déjà reconstituable depuis la pièce mère.
 *
 * La liste ci-dessous est celle des modèles qu'un réviseur demande : la
 * CONFIGURATION du dossier (qui a changé le plan de comptes, un journal, un
 * taux de taxe, un droit d'accès) et les ACTES qui touchent la comptabilité
 * hors du flux normal de saisie (clôture, affectation du résultat,
 * lettrage, réévaluation).
 */
export const MODELES_AUDITES = new Set<string>([
  // Le dossier lui-même et ses accès · le premier bloc qu'un auditeur
  // demande, avant même les comptes.
  'Tenant',
  'User',
  'Licence',
  // La configuration comptable · en changer un poste change tous les états
  // produits ensuite, sans qu'aucune écriture ne bouge.
  'Compte',
  // Les natures commandent les défauts des comptes créés ensuite.
  'NatureCompte',
  'Journal',
  'TauxTva',
  'Devise',
  'PlanAnalytique',
  'SectionAnalytique',
  'FamilleImmobilisation',
  'ModeleSaisie',
  // Un RIB modifié en silence détourne un paiement · la banque se journalise.
  'Banque',
  'RibBanque',
  'LibelleEcriture',
  'Tiers',
  // Retirer le contrat ou le RCCM d'un tiers doit laisser une trace · le
  // CONTENU n'est pas recopié (colonne exclue ci-dessous), l'empreinte suffit.
  'DocumentTiers',
  // Même raison que RibBanque · le RIB d'un fournisseur changé la veille d'un
  // virement est la fraude la plus courante qui soit. L'ordre de virement se
  // journalise à la tête · création, impressions, annulation.
  'RibTiers',
  'OrdreVirement',
  'Bailleur',
  // Les actes qui font ou défont un exercice.
  'Exercice',
  'Cloture',
  'AffectationResultat',
  // Les écritures, à la tête seulement · les lignes suivent la tête et sont
  // reconstituables par elle. Journaliser LigneEcriture doublerait le volume
  // de la table la plus grosse du logiciel pour n'ajouter aucune information
  // que la tête ne porte déjà.
  'Ecriture',
  'Lettrage',
  'Regularisation',
  'Reevaluation',
  'RapprochementBancaire',
  // Les registres légaux et fiscaux.
  'Immobilisation',
  'Donation',
  'TranscriptionInventaire',
  // L'inventaire extra-comptable · l'écart et sa DÉCISION sont exactement ce
  // qu'un réviseur reprend. Un écart requalifié après coup, ou un responsable
  // effacé, ne se verrait nulle part ailleurs. Les fiches, elles, ne sont pas
  // journalisées : elles se créent par centaines en une fois (le parc
  // immobilisé), et c'est l'écart qu'elles produisent qui porte l'enjeu.
  'CampagneInventaire',
  'EcartInventaire',
  // La circularisation · la campagne (sa forme, ses conditions déclarées)
  // et chaque demande, dont le solde figé, la réponse et sa qualification.
  // Un écart requalifié de « anomalie potentielle » en « délai » après coup
  // ne se verrait nulle part ailleurs.
  'CampagneCircularisation',
  'DemandeConfirmation',
  // Le registre des provisions · une condition décochée après coup, un
  // statut passé de PASSIF_EVENTUEL à ECARTEE, une reprise saisie en
  // utilisation : rien de tout cela ne laisse de trace ailleurs, et
  // chacun change ce que la Note annexe publiera.
  'ProvisionRisqueCharge',
  // Le registre des faiblesses · la QUALIFICATION est le champ du module.
  // Une significative rétrogradée en « autre » après coup fait disparaître,
  // d'un seul geste, l'écrit du § 9 et le report obligatoire du § A17, et
  // rien ailleurs n'en garderait la trace. La date de communication écrite
  // et l'escalade du § A24 sont dans le même cas.
  'FaiblesseControleInterne',
  'RegistreFaiblesses',
  // Le questionnaire de révision · c'est `estException` qui compte. Une
  // réponse retournée après coup fait passer une ligne du rouge au vert sans
  // que rien n'ait changé au dossier, et le questionnaire imprimé ne le dirait
  // pas. La réponse elle-même et son commentaire suivent.
  'ReponseQuestionnaire',
  // Le relevé d'unités d'œuvre · c'est le seul chiffre du plan
  // d'amortissement qu'aucun livre ne porte, et il commande directement
  // l'annuité. Un relevé corrigé après coup change la dotation d'un
  // exercice sans laisser de trace ailleurs que dans l'écriture elle-même,
  // qui ne dit pas d'où venait le nombre.
  'ConsommationUniteOeuvre',
  // Le PV de comptage d'une caisse · le solde figé, les espèces comptées et
  // l'écart qu'ils produisent. Un chiffre corrigé après coup referme un écart
  // que la commission avait à trancher, et le PV imprimé ne le dirait pas.
  'ProcesVerbalComptageCaisse',
  'Exoneration',
  'LiquidationTva',
  'RetraitementFiscal',
  // LE REGISTRE DU PERSONNEL · les trois tables de P1. Elles sont auditées
  // pour la même raison que les écarts d'inventaire : ce qui compte n'est pas
  // la création, c'est la RETOUCHE. Une date d'entrée en vigueur reculée, un
  // type passé de CDD à CDI, une date de fin déplacée, un enfant à charge
  // ajouté après coup · chacun change une ancienneté, une requalification ou
  // une allocation, et rien d'autre n'en garderait la trace.
  //
  // ET C'EST PRÉCISÉMENT POURQUOI LA LISTE D'EXCLUSION LES SUIT. Le journal
  // recopie la ligne entière, et ces lignes portent les premières données
  // personnelles du dépôt. On garde la CLÉ (savoir que la date de naissance a
  // changé fait partie de la trace) et on masque la VALEUR.
  'Salarie',
  'ContratTravail',
  'EnfantACharge',
  // LE BULLETIN ÉMIS (P8) · il ne se modifie jamais, il s'ANNULE, et c'est
  // l'annulation et la déclaration de remise que le journal doit dater et
  // attribuer. Un bulletin annulé puis réémis sans trace est exactement ce
  // qu'un contentieux sur l'article 103 viendrait chercher.
  'BulletinPaie',
  // Une rubrique désactivée ou un fondement réécrit changent ce que le
  // bulletin suivant affichera · la trace dit qui et quand. Une avance
  // inscrite ou retirée change le net de plusieurs mois ; son MONTANT est
  // masqué comme la rémunération du contrat, la clé reste.
  'RubriquePaie',
  'AvanceSalaire',
  // Un taux de cotisation saisi par le cabinet change le calcul de tous les
  // bulletins à venir · la trace dit qui l'a posé, sur quel texte, et qui l'a
  // retiré.
  'VersionBaremePaie',
]);

/**
 * CHAMPS QUE LE JOURNAL NE DOIT JAMAIS RECOPIER.
 *
 * Un journal d'audit qui recopie l'empreinte d'un mot de passe est une
 * SECONDE base de mots de passe, moins surveillée que la première et
 * conservée bien plus longtemps. Idem pour un jeton de session ou un secret.
 * La comparaison se fait en minuscules et par inclusion : `motDePasse`,
 * `motDePasseHash`, `ancienMotDePasse` tombent tous.
 */
const FRAGMENTS_SENSIBLES = [
  'motdepasse',
  'password',
  'secret',
  'jeton',
  'token',
  'csrf',
  'apikey',
  'cledeconnexion',
  'databaseurl',
];

export const MARQUEUR_MASQUE = '[masqué]';

/**
 * LA LISTE FERMÉE · ce que le fragment de nom ne peut pas attraper.
 *
 * `FRAGMENTS_SENSIBLES` est une heuristique sur le NOM · elle attrape
 * `motDePasse` parce qu'il se nomme ainsi. Elle ne peut rien contre un champ
 * dont le nom ne dit pas qu'il est sensible.
 *
 * `User.estOperateurPlateforme` en est le cas exact. Le schéma dit de lui
 * « aucun DTO n'expose ce champ » et « jamais renvoyé par /utilisateurs » ·
 * et pourtant le journal d'audit le rendait, en clair, à tout utilisateur du
 * dossier ayant accès à `/journal-audit`, puisque `User` est un modèle audité
 * et que la charge `apres` recopie la ligne entière. Le drapeau désigne le
 * compte de l'exploitant du logiciel présent dans le dossier du client :
 * exactement le compte qu'un attaquant cherche.
 *
 * D'où une liste nommée COLONNE PAR COLONNE, et un test qui la tient FERMÉE ·
 * une colonne ajoutée demain à `User` fait tomber ce test tant que quelqu'un
 * ne l'a pas classée d'un côté ou de l'autre. C'est la seule forme de liste
 * qui ne se périme pas en silence.
 */
export const COLONNES_EXCLUES_PAR_MODELE: Readonly<Record<string, readonly string[]>> = {
  User: ['motDePasse', 'estOperateurPlateforme'],

  // LE FICHIER LUI-MÊME · jusqu'à 5 Mo recopiés dans chaque événement, et un
  // scan de pièce d'identité lisible par tout le dossier dans un journal
  // conservé plus longtemps que la fiche. Le nom, la taille et l'empreinte
  // SHA-256 désignent la pièce sans la reproduire.
  DocumentTiers: ['contenu'],

  // LE REGISTRE DU PERSONNEL · le premier cas où l'exclusion ne protège pas
  // le LOGICIEL mais une PERSONNE.
  //
  // Le journal d'audit est lisible par tout utilisateur du dossier ayant
  // accès à `/journal-audit`. Un comptable saisit les salaires ; il n'a pas à
  // lire, dans un journal conservé bien plus longtemps que la fiche, la date
  // de naissance d'un collègue, le nom de son conjoint, celui de ses enfants
  // ou son numéro d'affiliation.
  //
  // CE QUI RESTE LISIBLE, ET POURQUOI. Le nom, le matricule et le sexe : ils
  // désignent la ligne, et un journal qui ne dit plus DE QUI il parle ne sert
  // plus de chemin de révision (AUDCIF art. 22, 6°). Les dates de
  // déclaration, l'aptitude et le drapeau `actif` : ce sont des faits de
  // GESTION, pas des données de la personne, et ce sont eux qu'un inspecteur
  // du travail vient vérifier.
  //
  // CE QUI EST MASQUÉ. Tout ce qui décrit la personne plutôt que sa relation
  // de travail, plus la RÉMUNÉRATION : la clé suffit à dire qu'elle a changé,
  // et la valeur n'a rien à faire dans un journal que tout le dossier lit.
  Salarie: [
    'numeroAffiliationCnss',
    'dateNaissance',
    'millesimeNaissance',
    'lieuNaissance',
    'nationalite',
    'nomConjoint',
  ],
  EnfantACharge: ['nom', 'postNom', 'prenoms', 'dateNaissance'],
  ContratTravail: ['remunerationBase', 'avantagesConvenus'],
  AvanceSalaire: ['montantFc', 'retenueMensuelleFc', 'objet'],
  // Le bulletin reste IDENTIFIABLE (numéro, mois, nom, statut, dates, motif
  // d'annulation) · ses MONTANTS et le détail du calcul ne le sont pas, pour
  // la même raison que la rémunération du contrat.
  BulletinPaie: [
    'numeroAffiliationCnss',
    'totalVerseFc',
    'assietteSocialeFc',
    'cotisationsTravailleurFc',
    'cotisationsEmployeurFc',
    'irppFc',
    'netAPayerFc',
    'entree',
    'calcul',
  ],
};

/** Les colonnes exclues du JOURNAL, en minuscules, comparables telles quelles. */
export function colonnesExclues(modele: string): ReadonlySet<string> {
  return new Set((COLONNES_EXCLUES_PAR_MODELE[modele] ?? []).map((c) => c.toLowerCase()));
}

/**
 * CE QUI NE SORT JAMAIS DU LOGICIEL · une liste DISTINCTE, et il a fallu
 * l'écrire.
 *
 * LES DEUX LISTES NE SERVENT PAS LA MÊME CHOSE, et les confondre a failli
 * coûter cher. `COLONNES_EXCLUES_PAR_MODELE` protège une personne d'un
 * JOURNAL que tout le dossier lit et qu'on conserve bien plus longtemps que
 * la fiche. L'archive de restitution, elle, rend au dossier SES PROPRES
 * DONNÉES, à lui seul, sur sa demande.
 *
 * `colonnesDuModele()` de la restitution lisait la liste du journal. Tant que
 * cette liste ne contenait que `motDePasse` et `estOperateurPlateforme`, les
 * deux usages coïncidaient. Le registre du personnel les a séparés : y verser
 * la date de naissance, la nationalité et la rémunération aurait, du même
 * geste, VIDÉ L'ARCHIVE de ce qu'elle doit rendre · un dossier n'aurait plus
 * pu reconstituer son propre registre, et l'archive se serait dite complète.
 * Le socle qui ne peut pas mentir aurait menti.
 *
 * D'où deux listes. Celle-ci ne contient que ce qui n'appartient PAS au
 * dossier : l'empreinte d'un mot de passe, et le drapeau qui désigne le
 * compte de l'exploitant du logiciel.
 */
export const COLONNES_JAMAIS_RESTITUEES: Readonly<Record<string, readonly string[]>> = {
  User: ['motDePasse', 'estOperateurPlateforme'],
};

/** Les colonnes qu'une ARCHIVE DE RESTITUTION ne porte pas. */
export function colonnesNonRestituables(modele: string): ReadonlySet<string> {
  return new Set((COLONNES_JAMAIS_RESTITUEES[modele] ?? []).map((c) => c.toLowerCase()));
}

export function estChampSensible(nom: string, exclues?: ReadonlySet<string>): boolean {
  const n = nom.toLowerCase();
  if (exclues?.has(n)) return true;
  return FRAGMENTS_SENSIBLES.some((f) => n.includes(f));
}

/**
 * Remplace les valeurs sensibles par un marqueur, à toute profondeur. On
 * garde la CLÉ · savoir que le mot de passe a changé fait partie de la
 * trace, connaître sa valeur n'en fait pas partie.
 */
export function masquer(valeur: unknown, exclues?: ReadonlySet<string>): unknown {
  if (valeur === null || valeur === undefined) return valeur;
  if (Array.isArray(valeur)) return valeur.map((v) => masquer(v, exclues));
  if (valeur instanceof Date) return valeur.toISOString();
  if (typeof valeur === 'bigint') return valeur.toString();
  // Un Decimal de Prisma · sa sérialisation JSON par défaut est instable
  // selon la version, sa représentation textuelle ne l'est pas.
  if (typeof valeur === 'object') {
    const o = valeur as Record<string, unknown>;
    if (typeof (o as { toFixed?: unknown }).toFixed === 'function') return String(valeur);
    const sortie: Record<string, unknown> = {};
    for (const [cle, v] of Object.entries(o)) {
      // L'exclusion vaut à TOUTE profondeur · la charge d'une opération de
      // masse porte le filtre de la requête, qui peut nommer la colonne.
      sortie[cle] = estChampSensible(cle, exclues) ? MARQUEUR_MASQUE : masquer(v, exclues);
    }
    return sortie;
  }
  return valeur;
}
