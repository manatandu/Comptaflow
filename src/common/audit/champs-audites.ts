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

export function estChampSensible(nom: string): boolean {
  const n = nom.toLowerCase();
  return FRAGMENTS_SENSIBLES.some((f) => n.includes(f));
}

/**
 * Remplace les valeurs sensibles par un marqueur, à toute profondeur. On
 * garde la CLÉ · savoir que le mot de passe a changé fait partie de la
 * trace, connaître sa valeur n'en fait pas partie.
 */
export function masquer(valeur: unknown): unknown {
  if (valeur === null || valeur === undefined) return valeur;
  if (Array.isArray(valeur)) return valeur.map(masquer);
  if (valeur instanceof Date) return valeur.toISOString();
  if (typeof valeur === 'bigint') return valeur.toString();
  // Un Decimal de Prisma · sa sérialisation JSON par défaut est instable
  // selon la version, sa représentation textuelle ne l'est pas.
  if (typeof valeur === 'object') {
    const o = valeur as Record<string, unknown>;
    if (typeof (o as { toFixed?: unknown }).toFixed === 'function') return String(valeur);
    const sortie: Record<string, unknown> = {};
    for (const [cle, v] of Object.entries(o)) {
      sortie[cle] = estChampSensible(cle) ? MARQUEUR_MASQUE : masquer(v);
    }
    return sortie;
  }
  return valeur;
}
