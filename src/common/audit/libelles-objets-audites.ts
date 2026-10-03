import { MODELES_AUDITES } from './champs-audites';

/**
 * LE FILTRE DU JOURNAL D'AUDIT SE LIT ICI, À CÔTÉ DE LA LISTE QU'IL FILTRE
 * (audit final F182).
 *
 * L'écran tenait sa propre table de vingt-six libellés quand le journal en
 * couvre quatre-vingt-douze · les RIB, les ordres de virement, les bulletins
 * de paie ou les mandats de l'auditeur étaient journalisés et impossibles à
 * retrouver par le filtre. Une table recopiée côté écran vieillit à chaque
 * modèle ajouté au journal, et personne ne la relit. Celle-ci est servie par
 * le serveur, et un test exige qu'elle nomme EXACTEMENT les modèles de
 * `MODELES_AUDITES` · un modèle ajouté au journal sans libellé le fait tomber.
 *
 * Les libellés sont ceux que lit un comptable, jamais des noms de tables.
 */
export const LIBELLES_OBJETS_AUDITES: Readonly<Record<string, string>> = {
  Tenant: 'Dossier',
  User: 'Utilisateur',
  Licence: 'Licence',
  Compte: 'Compte du plan',
  NatureCompte: 'Nature de compte',
  Journal: 'Code journal',
  TauxTva: 'Taux de taxe',
  Devise: 'Devise',
  PlanAnalytique: 'Plan analytique',
  SectionAnalytique: 'Section analytique',
  FamilleImmobilisation: "Famille d'immobilisation",
  ModeleSaisie: 'Modèle de saisie',
  Banque: 'Banque',
  RibBanque: 'RIB de banque',
  LibelleEcriture: "Libellé d'écriture",
  Tiers: 'Tiers',
  DocumentTiers: "Document d'un tiers",
  RibTiers: "RIB d'un tiers",
  OrdreVirement: 'Ordre de virement',
  Bailleur: 'Bailleur',
  Exercice: 'Exercice',
  Cloture: 'Clôture',
  AffectationResultat: 'Affectation du résultat',
  Ecriture: 'Écriture',
  Lettrage: 'Lettrage',
  Regularisation: 'Régularisation',
  Reevaluation: 'Réévaluation',
  ProvisionChangeOuverture: 'Provision pour pertes de change à l’ouverture',
  RapprochementBancaire: 'Rapprochement bancaire',
  EncoursOuvertureRapprochement: "En-cours d'ouverture d'un rapprochement",
  Immobilisation: 'Immobilisation',
  Donation: 'Donation',
  TranscriptionInventaire: "Livre d'inventaire",
  CampagneInventaire: "Campagne d'inventaire",
  EcartInventaire: "Écart d'inventaire",
  CampagneCircularisation: 'Campagne de circularisation',
  DemandeConfirmation: 'Demande de confirmation',
  ProvisionRisqueCharge: 'Provision pour risques et charges',
  FaiblesseControleInterne: 'Faiblesse du contrôle interne',
  RegistreFaiblesses: 'Registre des faiblesses',
  ReponseQuestionnaire: 'Réponse au questionnaire de révision',
  ConsommationUniteOeuvre: "Relevé d'unités d'œuvre",
  ContratLocationAcquisition: 'Contrat de location-acquisition',
  ClotureLocationAcquisition: 'Clôture d’un contrat de location-acquisition',
  RepriseSubventionImmobilisation: 'Reprise de subvention d’investissement',
  SubventionImmobilisation: 'Subvention rattachée à un bien',
  ReductionSubventionImmobilisation: 'Réduction d’une subvention rattachée',
  RevisionPlanAmortissement: 'Révision d’un plan d’amortissement',
  CoutEmpruntIncorpore: 'Coûts d’emprunt incorporés à un bien',
  ReevaluationBilan: 'Réévaluation des immobilisations',
  RepriseProvisionReevaluation: 'Reprise de la provision spéciale de réévaluation',
  MouvementDemantelement: 'Provision pour démantèlement d’un bien',
  CreanceDouteuse: 'Créance douteuse ou litigieuse',
  AjustementCreanceDouteuse: 'Revue de la dépréciation d’une créance',
  MouvementCreanceDouteuse: 'Perte ou recouvrement d’une créance douteuse',
  ConstatImpotResultat: 'Écriture de l’impôt sur le résultat',
  ProcesVerbalComptageCaisse: 'Procès-verbal de comptage de caisse',
  Exoneration: 'Exonération',
  LiquidationTva: 'Liquidation de TVA',
  RetraitementFiscal: 'Retraitement fiscal',
  Salarie: 'Salarié',
  ContratTravail: 'Contrat de travail',
  EnfantACharge: 'Enfant à charge',
  BulletinPaie: 'Bulletin de paie',
  RubriquePaie: 'Rubrique de paie',
  AvanceSalaire: 'Avance ou prêt au personnel',
  VersionBaremePaie: 'Barème de paie',
  TiersCompte: "Rattachement d'un compte à un tiers",
  ModeleReglement: 'Modèle de règlement',
  RattachementNote: "Rattachement d'une note annexe",
  SaisieNote: "Saisie d'une note annexe",
  ConventionFinancement: 'Convention de financement',
  TrancheFinancement: 'Tranche de financement',
  RapportBailleur: 'Rapport au bailleur',
  EngagementDepense: 'Engagement de dépense',
  ExecutionEngagement: "Exécution d'un engagement",
  OdAnalytique: 'OD analytique',
  ModeleAbonnement: "Modèle d'abonnement",
  NiveauRelance: 'Niveau de relance',
  ReclassementImmobilisation: "Reclassement d'immobilisation",
  DepreciationImmobilisation: "Dépréciation d'immobilisation",
  ManuelProcedures: 'Manuel des procédures',
  RapportActivite: "Rapport d'activité",
  SousCommissionInventaire: "Sous-commission d'inventaire",
  MembreSousCommission: "Membre d'une sous-commission",
  QuestionnaireRevision: 'Questionnaire de révision',
  MandatAuditeur: "Mandat de l'auditeur",
  AccordCadrePlan: 'Accord-cadre avec le Ministère du Plan',
  Facture: 'Facture',
  Devis: 'Devis',
  ArticleStock: 'Article de stock',
  MouvementStock: 'Mouvement de stock',
  Consignation: 'Consignation',
  EntitePerimetreConsolidation: 'Entité du périmètre de consolidation',
  LienParticipationConsolidation: 'Participation (consolidation)',
  FaitsConsolidationExercice: "Faits de l'exercice (consolidation)",
  OperationReciproqueConsolidation: 'Opération réciproque (consolidation)',
  ProvisionChangeConsolidation: 'Provision pour pertes de change (consolidation)',
  EcartEvaluationConsolidation: "Écart d'évaluation (consolidation)",
  ResultatInterneConsolidation: 'Résultat interne (consolidation)',
  ParametresIfrs: 'Paramètres IFRS',
  RegleCorrespondanceIfrs: 'Règle de correspondance IFRS',
  RetraitementIfrs: 'Retraitement IFRS',
  RegleConsolidationIfrs: 'Règle de consolidation IFRS',
  MouvementCapitauxPropresIfrs: 'Mouvement de capitaux propres IFRS',
  EffetChangeTresorerieIfrs: 'Effet de change sur la trésorerie IFRS',
  NotesIfrs: 'Notes IFRS',
  DossierFiscalExercice: "Dossier fiscal de l'exercice",
  LotVirement: 'Lot de virements',
};

export interface ObjetAudite {
  cle: string;
  libelle: string;
}

/** Tous les objets journalisés, rangés par libellé pour la liste déroulante. */
export function objetsAudites(): ObjetAudite[] {
  return [...MODELES_AUDITES]
    .map((cle) => ({ cle, libelle: LIBELLES_OBJETS_AUDITES[cle] ?? cle }))
    .sort((a, b) => a.libelle.localeCompare(b.libelle, 'fr'));
}
