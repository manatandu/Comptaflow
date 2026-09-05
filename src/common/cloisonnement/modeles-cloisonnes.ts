/**
 * LES MODÈLES QUI PORTENT UN `tenantId`.
 *
 * Liste tirée du schéma, pas écrite de mémoire · un modèle ajouté au schéma et
 * oublié ici échapperait au cloisonnement sans que rien ne le dise. Le spec
 * `cloisonnement.spec.ts` relit `prisma/schema.prisma` et fait tomber le test
 * si les deux divergent.
 */
export const MODELES_CLOISONNES = new Set<string>([
  'AffectationResultat',
  'Bailleur',
  'Cloture',
  'ConventionFinancement',
  'Compte',
  'Devise',
  'Donation',
  'DossierFiscalExercice',
  'Ecriture',
  'EngagementDepense',
  'EvenementAudit',
  'Exercice',
  'Exoneration',
  'FamilleImmobilisation',
  'Immobilisation',
  'Journal',
  'Lettrage',
  'Licence',
  'LiquidationTva',
  'ManuelProcedures',
  'Message',
  'ModeleAbonnement',
  'ModeleReglement',
  'ModeleSaisie',
  'NiveauRelance',
  'PlanAnalytique',
  'RapportActivite',
  'RapprochementBancaire',
  'RattachementNote',
  'SaisieNote',
  'Reevaluation',
  'Regularisation',
  'Relance',
  'RetraitementFiscal',
  'SectionAnalytique',
  'TauxTva',
  'Tiers',
  'TranscriptionInventaire',
  'User',
]);

/**
 * Les modèles SANS `tenantId` ne sont pas pour autant hors de danger · ils ne
 * sont atteignables que par leur parent (une ligne d'écriture par son
 * écriture, une ventilation par sa section). Leur cloisonnement repose donc
 * entièrement sur celui du parent, et c'est une dépendance à connaître :
 * `ligneEcriture.findMany({ where: { lettrageId } })` ne porte aucune borne de
 * dossier par lui-même.
 *
 * Le choix de ne PAS leur ajouter de `tenantId` est celui du schéma d'origine
 * et n'est pas défait ici · le dupliquer sur des tables aussi volumineuses
 * ouvrirait la porte à l'incohérence entre la ligne et sa tête, qui serait
 * pire que le mal.
 */
export const MODELES_PORTES_PAR_LEUR_PARENT = new Set<string>([
  'BudgetSection',
  'CoursDevise',
  // Portée par son immobilisation, comme la dotation aux amortissements · le
  // service ne l'atteint jamais autrement que par un bien déjà borné au
  // dossier (`trouver`), et lui donner un tenantId à elle ouvrirait la porte à
  // deux réponses possibles à la même question.
  'DepreciationImmobilisation',
  'DotationAmortissement',
  'EcheanceAbonnement',
  'EcheanceReglement',
  // Portée par son engagement · le service ne l'atteint jamais autrement
  // qu'après avoir borné l'engagement au dossier, et lui donner un tenantId
  // ouvrirait la porte à un rattachement dont la tête et la ligne
  // désigneraient deux dossiers différents.
  'ExecutionEngagement',
  'LigneAffectation',
  'LigneEcriture',
  // Portés par leur convention de financement · le service ne les atteint
  // jamais qu'après avoir borné la convention au dossier.
  'RapportBailleur',
  'TrancheFinancement',
  'LigneModeleSaisie',
  // Portée par son immobilisation, comme la dotation et la dépréciation · le
  // service ne l'atteint jamais que par un bien déjà borné au dossier.
  'ReclassementImmobilisation',
  'TiersCompte',
  'VentilationAnalytique',
]);
