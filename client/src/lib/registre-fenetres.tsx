import { lazy } from 'react';
import type { MetaFenetre } from './fenetres';
import type { Referentiel } from './types';
import { fenetreDisponible } from './referentiel-fenetre';
export { fenetreDisponible };

/*
 * CHARGEMENT À LA DEMANDE · chaque page ne rejoint le navigateur qu'à
 * l'ouverture de sa première fenêtre. En eager, les 37 pages partaient
 * dans un seul bundle de 660 Ko : l'écran d'ouverture payait le poids des
 * états financiers. Le Suspense qui affiche « Chargement… » pendant le
 * transfert vit dans Fenetre.tsx, autour de rendreFenetre().
 */
const DashboardPage = lazy(() => import('../pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const SaisiePage = lazy(() => import('../pages/SaisiePage').then((m) => ({ default: m.SaisiePage })));
const PlanComptesPage = lazy(() => import('../pages/PlanComptesPage').then((m) => ({ default: m.PlanComptesPage })));
const JournauxPage = lazy(() => import('../pages/JournauxPage').then((m) => ({ default: m.JournauxPage })));
const JournalPage = lazy(() => import('../pages/JournalPage').then((m) => ({ default: m.JournalPage })));
const BalanceAgeePage = lazy(() => import('../pages/BalanceAgeePage').then((m) => ({ default: m.BalanceAgeePage })));
const JournalAuditPage = lazy(() => import('../pages/JournalAuditPage').then((m) => ({ default: m.JournalAuditPage })));
const BalanceAuxiliairePage = lazy(() => import('../pages/BalanceAuxiliairePage').then((m) => ({ default: m.BalanceAuxiliairePage })));
const JustificatifSoldePage = lazy(() => import('../pages/JustificatifSoldePage').then((m) => ({ default: m.JustificatifSoldePage })));
const EvolutionSoldesPage = lazy(() => import('../pages/EvolutionSoldesPage').then((m) => ({ default: m.EvolutionSoldesPage })));
const TableauxImmobilisationsPage = lazy(() => import('../pages/TableauxImmobilisationsPage').then((m) => ({ default: m.TableauxImmobilisationsPage })));
const EcheancierPage = lazy(() => import('../pages/EcheancierPage').then((m) => ({ default: m.EcheancierPage })));
const LettragePage = lazy(() => import('../pages/LettragePage').then((m) => ({ default: m.LettragePage })));
const RapprochementPage = lazy(() => import('../pages/RapprochementPage').then((m) => ({ default: m.RapprochementPage })));
const RapprochementDetailPage = lazy(() => import('../pages/RapprochementDetailPage').then((m) => ({ default: m.RapprochementDetailPage })));
const ImmobilisationsPage = lazy(() => import('../pages/ImmobilisationsPage').then((m) => ({ default: m.ImmobilisationsPage })));
const ExercicePage = lazy(() => import('../pages/ExercicePage').then((m) => ({ default: m.ExercicePage })));
const TiersPage = lazy(() => import('../pages/TiersPage').then((m) => ({ default: m.TiersPage })));
const TauxTvaPage = lazy(() => import('../pages/TauxTvaPage').then((m) => ({ default: m.TauxTvaPage })));
const ModelesSaisiePage = lazy(() =>
  import('../pages/ModelesSaisiePage').then((m) => ({ default: m.ModelesSaisiePage })),
);
const DeclarationTvaPage = lazy(() => import('../pages/DeclarationTvaPage').then((m) => ({ default: m.DeclarationTvaPage })));
const RetenuesPage = lazy(() => import('../pages/RetenuesPage').then((m) => ({ default: m.RetenuesPage })));
const ExonerationsPage = lazy(() => import('../pages/ExonerationsPage').then((m) => ({ default: m.ExonerationsPage })));
const FiscalitePage = lazy(() => import('../pages/FiscalitePage').then((m) => ({ default: m.FiscalitePage })));
const EtatsFinanciersPage = lazy(() => import('../pages/EtatsFinanciersPage').then((m) => ({ default: m.EtatsFinanciersPage })));
const NotesAnnexesPage = lazy(() => import('../pages/NotesAnnexesPage').then((m) => ({ default: m.NotesAnnexesPage })));
const RegistreDonateursPage = lazy(() => import('../pages/RegistreDonateursPage').then((m) => ({ default: m.RegistreDonateursPage })));
const DocumentsObligatoiresPage = lazy(() => import('../pages/DocumentsObligatoiresPage').then((m) => ({ default: m.DocumentsObligatoiresPage })));
const UtilisateursPage = lazy(() => import('../pages/UtilisateursPage').then((m) => ({ default: m.UtilisateursPage })));
const ParametresDossierPage = lazy(() => import('../pages/ParametresDossierPage').then((m) => ({ default: m.ParametresDossierPage })));
const PlansAnalytiquesPage = lazy(() => import('../pages/PlansAnalytiquesPage').then((m) => ({ default: m.PlansAnalytiquesPage })));
const BrouillardPage = lazy(() => import('../pages/BrouillardPage').then((m) => ({ default: m.BrouillardPage })));
const ImportPage = lazy(() => import('../pages/ImportPage').then((m) => ({ default: m.ImportPage })));
const ControlesPage = lazy(() => import('../pages/ControlesPage').then((m) => ({ default: m.ControlesPage })));
const DossierRevisionPage = lazy(() =>
  import('../pages/DossierRevisionPage').then((m) => ({ default: m.DossierRevisionPage })),
);
const AffectationPage = lazy(() => import('../pages/AffectationPage').then((m) => ({ default: m.AffectationPage })));
const RegularisationPage = lazy(() => import('../pages/RegularisationPage').then((m) => ({ default: m.RegularisationPage })));
const DevisesPage = lazy(() => import('../pages/DevisesPage').then((m) => ({ default: m.DevisesPage })));
const RelancesPage = lazy(() => import('../pages/RelancesPage').then((m) => ({ default: m.RelancesPage })));
const EngagementsPage = lazy(() => import('../pages/EngagementsPage').then((m) => ({ default: m.EngagementsPage })));
const EtatsAnalytiquesPage = lazy(() => import('../pages/EtatsAnalytiquesPage').then((m) => ({ default: m.EtatsAnalytiquesPage })));
const BailleursPage = lazy(() => import('../pages/BailleursPage').then((m) => ({ default: m.BailleursPage })));
const PlateformePage = lazy(() => import('../pages/PlateformePage').then((m) => ({ default: m.PlateformePage })));
const GroupePage = lazy(() => import('../pages/GroupePage').then((m) => ({ default: m.GroupePage })));
const CourrierPage = lazy(() => import('../pages/CourrierPage').then((m) => ({ default: m.CourrierPage })));

/**
 * REGISTRE DES FENÊTRES · la seule liste qui associe un chemin à ce qui
 * s'affiche dedans, et au nom que porte sa barre de titre.
 *
 * Il remplace la double tenue qui existait avant : les routes dans `App.tsx`
 * d'un côté, un tableau de titres recopié dans `StatusBar` de l'autre. Deux
 * listes à tenir pour une seule réalité, dont une qui se périmait en silence
 * (un écran ajouté sans son titre s'annonçait « Prêt »). Tout est ici.
 *
 * `titreCourt` sert à la barre des fenêtres du bas, où la place est comptée ·
 * Sage y écrit « Plan Co… », on écrit « Plan comptable ». Un libellé pensé
 * pour être court vaut mieux qu'un libellé long coupé au milieu d'un mot.
 */

export interface DefinitionFenetre extends MetaFenetre {
  /** Reconnaît le chemin et capture ses paramètres. */
  motif: RegExp;
  /** `capture` = les groupes du motif, dans l'ordre. */
  rendre: (contexte: { capture: string[]; adresse: string }) => JSX.Element;
  /**
   * DIVISION SYCEBNL / SYSCOHADA · absent = fenêtre commune aux deux
   * référentiels (comptabilité générale, immobilisations, trésorerie…).
   * Présent = fenêtre propre à un référentiel, invisible pour l'autre · le
   * registre des donateurs (art. 17-18 SYCEBNL) n'a pas de sens pour un
   * dossier d'entreprise, et l'impôt sur les bénéfices n'en a pas pour une
   * ASBL, qui en est exemptée (loi n° 23/053 art. 5). Une fenêtre commune aux
   * deux, comme les états financiers ou les notes annexes, reste SANS
   * `referentielsApplicables` : c'est la page elle-même qui aiguille vers
   * l'écran du référentiel du dossier, puis de son système. Le serveur
   * applique la même règle
   * (`ReferentielGuard`) : ceci cache la fenêtre, lui empêche d'y accéder
   * même par un appel direct. Voir `docs/plan-de-construction.md` §8.
   */
  referentielsApplicables?: Referentiel[];
}

/**
 * Ordre significatif : le premier motif qui reconnaît le chemin gagne. Les
 * chemins les plus spécifiques passent donc AVANT les plus généraux
 * (`/comptes/:id/lettrage` avant `/comptes`), sans quoi l'interrogation d'un
 * compte ouvrirait le plan comptable.
 */
export const FENETRES: DefinitionFenetre[] = [
  {
    motif: /^\/tableau-de-bord$/,
    titre: 'Tableau de bord',
    titreCourt: 'Tabl. bord',
    rendre: () => <DashboardPage />,
  },
  { motif: /^\/saisie$/, titre: 'Saisie des journaux', titreCourt: 'Saisie', rendre: () => <SaisiePage /> },
  {
    motif: /^\/comptes\/([^/]+)\/lettrage$/,
    titre: 'Interrogation et lettrage',
    titreCourt: 'Interrogation',
    rendre: ({ capture }) => <LettragePage compteId={capture[0]} />,
  },
  {
    // Fenêtre ouverte SANS compte (menu Traitement) : le sélecteur intégré
    // fait le choix · le menu ne doit plus détourner vers le plan comptable.
    motif: /^\/lettrage$/,
    titre: 'Interrogation et lettrage',
    titreCourt: 'Interrogation',
    rendre: () => <LettragePage />,
  },
  { motif: /^\/comptes$/, titre: 'Plan comptable', titreCourt: 'Plan comptable', rendre: () => <PlanComptesPage /> },
  {
    motif: /^\/rapprochement\/([^/]+)$/,
    titre: 'Rapprochement bancaire · détail',
    titreCourt: 'Rapprochement',
    rendre: ({ capture }) => <RapprochementDetailPage id={capture[0]} />,
  },
  {
    motif: /^\/rapprochement$/,
    titre: 'Rapprochement bancaire',
    titreCourt: 'Rapprochement',
    rendre: () => <RapprochementPage />,
  },
  {
    motif: /^\/immobilisations$/,
    titre: 'Immobilisations',
    titreCourt: 'Immobilisations',
    rendre: () => <ImmobilisationsPage />,
  },
  { motif: /^\/journaux$/, titre: 'Codes journaux', titreCourt: 'Codes journaux', rendre: () => <JournauxPage /> },
  {
    motif: /^\/journal$/,
    titre: 'Journal · Grand livre · Balance',
    titreCourt: 'Journal',
    rendre: ({ adresse }) => <JournalPage adresse={adresse} />,
  },
  { motif: /^\/balance-agee$/, titre: 'Balance âgée', titreCourt: 'Balance âgée', rendre: () => <BalanceAgeePage /> },
  {
    // Commun aux deux référentiels · le chemin de révision de l'AUDCIF art. 22
    // vaut pour toute entité tenant une comptabilité informatisée, EBNL
    // comprise (le SYCEBNL n'écarte pas cet article, cf. son art. 3).
    motif: /^\/journal-audit$/,
    titre: "Journal d'audit",
    titreCourt: 'Journal audit',
    rendre: () => <JournalAuditPage />,
  },
  {
    motif: /^\/balance-auxiliaire$/,
    titre: 'Balance auxiliaire',
    titreCourt: 'Bal. auxiliaire',
    rendre: () => <BalanceAuxiliairePage />,
  },
  {
    motif: /^\/justificatif-solde$/,
    titre: 'Justificatif de solde',
    titreCourt: 'Justificatif',
    rendre: () => <JustificatifSoldePage />,
  },
  {
    motif: /^\/evolution-soldes$/,
    titre: 'Évolution des soldes',
    titreCourt: 'Évolution',
    rendre: () => <EvolutionSoldesPage />,
  },
  {
    motif: /^\/tableaux-immobilisations$/,
    titre: 'Immobilisations et amortissements',
    titreCourt: 'Tabl. immos',
    rendre: () => <TableauxImmobilisationsPage />,
  },
  {
    motif: /^\/echeancier$/,
    titre: 'Échéancier de trésorerie',
    titreCourt: 'Échéancier',
    rendre: () => <EcheancierPage />,
  },
  { motif: /^\/exercice$/, titre: "Fin d'exercice", titreCourt: "Fin d'exercice", rendre: () => <ExercicePage /> },
  { motif: /^\/tiers$/, titre: 'Plan des tiers', titreCourt: 'Plan tiers', rendre: () => <TiersPage /> },
  { motif: /^\/taux-tva$/, titre: 'Taux de taxes', titreCourt: 'Taux de taxes', rendre: () => <TauxTvaPage /> },
  {
    motif: /^\/modeles-saisie$/,
    titre: 'Modèles de saisie',
    titreCourt: 'Modèles',
    rendre: () => <ModelesSaisiePage />,
  },
  {
    motif: /^\/declaration-tva$/,
    titre: 'Déclaration de TVA',
    titreCourt: 'Décl. TVA',
    rendre: () => <DeclarationTvaPage />,
  },
  {
    motif: /^\/retenues$/,
    titre: 'Retenues et échéancier fiscal',
    titreCourt: 'Retenues',
    rendre: () => <RetenuesPage />,
  },
  {
    motif: /^\/exonerations$/,
    titre: 'Exonérations douanières et fiscales',
    titreCourt: 'Exonérations',
    rendre: () => <ExonerationsPage />,
    referentielsApplicables: ['SYCEBNL'],
  },
  {
    // Une entité à but non lucratif est exemptée d'impôt sur les sociétés
    // (loi n° 23/053, art. 5) · fenêtre SYSCOHADA, refusée côté serveur aussi.
    motif: /^\/fiscalite$/,
    titre: 'Résultat fiscal et impôt sur les bénéfices',
    titreCourt: 'Résultat fiscal',
    rendre: () => <FiscalitePage />,
    referentielsApplicables: ['SYSCOHADA'],
  },
  {
    motif: /^\/etats-financiers$/,
    titre: 'États financiers',
    titreCourt: 'États financiers',
    rendre: () => <EtatsFinanciersPage />,
  },
  { motif: /^\/notes-annexes$/, titre: 'Notes annexes', titreCourt: 'Notes annexes', rendre: () => <NotesAnnexesPage /> },
  {
    motif: /^\/registre-donateurs$/,
    titre: 'Registre des donateurs',
    titreCourt: 'Registre donateurs',
    rendre: () => <RegistreDonateursPage />,
    referentielsApplicables: ['SYCEBNL'],
  },
  {
    // LES DEUX RÉFÉRENTIELS, depuis le 2026-09-02. Elle était fermée au
    // SYSCOHADA non parce que l'AUDCIF n'exige rien · son art. 19 impose le
    // livre d'inventaire, et l'AUSCGIE art. 138 le rapport de gestion · mais
    // parce que la fenêtre était montée sur les seuls articles du SYCEBNL.
    // Chaque document est désormais lu dans SON texte, aucun n'est transposé
    // (voir correspondance-inventaire-syscohada.ts côté serveur).
    motif: /^\/documents-obligatoires$/,
    titre: 'Documents obligatoires',
    titreCourt: 'Doc. obligatoires',
    rendre: () => <DocumentsObligatoiresPage />,
  },
  {
    // Notion SYCEBNL (division 46) · en SYSCOHADA le 46 porte les associés.
    motif: /^\/bailleurs$/,
    titre: 'Bailleurs de fonds',
    titreCourt: 'Bailleurs',
    rendre: () => <BailleursPage />,
    referentielsApplicables: ['SYCEBNL'],
  },
  {
    motif: /^\/utilisateurs$/,
    titre: "Autorisations d'accès",
    titreCourt: 'Utilisateurs',
    rendre: () => <UtilisateursPage />,
  },
  {
    // Console de l'opérateur de plateforme · l'entrée de menu est gated sur
    // estOperateurPlateforme (AppShell), la page se re-verrouille elle-même,
    // et le serveur relit le drapeau à chaque requête (OperateurPlateformeGuard).
    motif: /^\/plateforme$/,
    titre: 'VMG Consulting · administration de la plateforme',
    titreCourt: 'VMG Consulting',
    rendre: () => <PlateformePage />,
  },
  {
    // Fenêtre du dossier MÈRE d'un groupe d'établissements (une même
    // personne morale en plusieurs dossiers) · le menu État ne la montre
    // qu'aux dossiers qui ont des cellules, le serveur re-vérifie le lien.
    motif: /^\/groupe$/,
    titre: 'Groupe · balance agrégée',
    titreCourt: 'Groupe',
    rendre: () => <GroupePage />,
    // Module monté sur le plan et les états SYCEBNL de bout en bout · la
    // liasse du groupe crée un tenant de combinaison SYCEBNL en jeu
    // ASSOCIATIONS. Le contrôleur porte le même filtre (CLAUDE.md § 6 · les
    // deux endroits, toujours).
    referentielsApplicables: ['SYCEBNL'],
  },
  {
    motif: /^\/parametres-dossier$/,
    titre: 'Paramètres du dossier',
    titreCourt: 'Paramètres',
    rendre: () => <ParametresDossierPage />,
  },
  {
    motif: /^\/plans-analytiques$/,
    titre: 'Plans analytiques',
    titreCourt: 'Plans analytiques',
    rendre: () => <PlansAnalytiquesPage />,
  },
  { motif: /^\/brouillard$/, titre: 'Brouillard', titreCourt: 'Brouillard', rendre: () => <BrouillardPage /> },
  { motif: /^\/import$/, titre: 'Importer des données', titreCourt: 'Import', rendre: () => <ImportPage /> },
  { motif: /^\/controles$/, titre: 'Analyse et contrôles', titreCourt: 'Contrôles', rendre: () => <ControlesPage /> },
  {
    motif: /^\/dossier-revision$/,
    titre: 'Dossier de révision',
    titreCourt: 'Révision',
    rendre: () => <DossierRevisionPage />,
    // COMMUNE AUX DEUX RÉFÉRENTIELS depuis que les fiches de l'AUDCIF
    // (Titre VII, 115 comptes) sont extraites à côté de celles du SYCEBNL
    // (Partie 2 ch. 3, 78 comptes). Chaque dossier reçoit les fiches de SON
    // texte · le serveur ne rend rien pour un référentiel inconnu.
  },
  {
    motif: /^\/regularisations$/,
    titre: 'Régularisations et abonnements',
    titreCourt: 'Régularisations',
    rendre: () => <RegularisationPage />,
  },
  {
    // Commune aux deux référentiels · les deux imposent de solder le compte 13,
    // seules les destinations diffèrent, et le serveur les sert filtrées.
    motif: /^\/affectation-resultat$/,
    titre: 'Affectation du résultat',
    titreCourt: 'Affectation',
    rendre: () => <AffectationPage />,
  },
  { motif: /^\/devises$/, titre: 'Devises et réévaluation', titreCourt: 'Devises', rendre: () => <DevisesPage /> },
  {
    // COMMUNE AUX DEUX RÉFÉRENTIELS · une file de courriels n'est ni un état
    // comptable ni une notion de plan, c'est le suivi de ce que le dossier a
    // envoyé. Elle est aussi ouverte à TOUS les rôles : la lecture seule doit
    // pouvoir constater qu'un rappel n'est pas parti (le contrôleur ne réserve
    // que la reprise, aux mêmes rôles que l'émission des relances).
    motif: /^\/courrier$/,
    titre: 'Courriers sortants',
    titreCourt: 'Courriers',
    rendre: () => <CourrierPage />,
  },
  { motif: /^\/relances$/, titre: 'Rappel et relevé', titreCourt: 'Rappel et relevé', rendre: () => <RelancesPage /> },
  {
    motif: /^\/etats-analytiques$/,
    titre: 'États analytiques et budgétaires',
    titreCourt: 'États analytiques',
    rendre: () => <EtatsAnalytiquesPage />,
  },
  {
    // SYCEBNL SEULEMENT · les deux termes non comptables de la colonne
    // Engagement viennent du tableau d'exécution budgétaire du jeu « projets
    // de développement ». Aucun état du SYSCOHADA ne porte cette colonne, et
    // ouvrir le registre à une société commerciale lui ferait tenir un
    // document qu'aucun texte ne lui demande. Le cloisonnement est posé aux
    // DEUX bouts : ici, et par `@ReferentielsAutorises` sur chaque route.
    motif: /^\/engagements$/,
    titre: 'Registre des engagements de dépense',
    titreCourt: 'Engagements',
    referentielsApplicables: ['SYCEBNL'],
    rendre: () => <EngagementsPage />,
  },
];

/** La définition qui régit ce chemin, ou `null` si aucune (accueil compris). */
export function definitionPour(chemin: string): DefinitionFenetre | null {
  return FENETRES.find((d) => d.motif.test(chemin)) ?? null;
}

// fenetreDisponible : voir referentiel-fenetre.ts (logique pure, réexportée ci-dessus).

/** Le contenu de la fenêtre, monté à partir de son adresse complète. */
export function rendreFenetre(adresse: string): JSX.Element | null {
  const chemin = adresse.split('?')[0];
  const def = definitionPour(chemin);
  if (!def) return null;
  const m = chemin.match(def.motif);
  return def.rendre({ capture: m ? m.slice(1) : [], adresse });
}
