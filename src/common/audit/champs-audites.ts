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
  'Journal',
  'TauxTva',
  'Devise',
  'PlanAnalytique',
  'SectionAnalytique',
  'FamilleImmobilisation',
  'ModeleSaisie',
  'Tiers',
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
  'Exoneration',
  'LiquidationTva',
  'RetraitementFiscal',
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
};

/** Les colonnes exclues d'un modèle, en minuscules, comparables telles quelles. */
export function colonnesExclues(modele: string): ReadonlySet<string> {
  return new Set((COLONNES_EXCLUES_PAR_MODELE[modele] ?? []).map((c) => c.toLowerCase()));
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
