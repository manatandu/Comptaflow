import type { MetaFenetre } from './fenetres';

import { DashboardPage } from '../pages/DashboardPage';
import { SaisiePage } from '../pages/SaisiePage';
import { PlanComptesPage } from '../pages/PlanComptesPage';
import { JournauxPage } from '../pages/JournauxPage';
import { JournalPage } from '../pages/JournalPage';
import { BalanceAgeePage } from '../pages/BalanceAgeePage';
import { EcheancierPage } from '../pages/EcheancierPage';
import { LettragePage } from '../pages/LettragePage';
import { RapprochementPage } from '../pages/RapprochementPage';
import { RapprochementDetailPage } from '../pages/RapprochementDetailPage';
import { ImmobilisationsPage } from '../pages/ImmobilisationsPage';
import { ExercicePage } from '../pages/ExercicePage';
import { TiersPage } from '../pages/TiersPage';
import { TauxTvaPage } from '../pages/TauxTvaPage';
import { DeclarationTvaPage } from '../pages/DeclarationTvaPage';
import { RetenuesPage } from '../pages/RetenuesPage';
import { EtatsFinanciersPage } from '../pages/EtatsFinanciersPage';
import { NotesAnnexesPage } from '../pages/NotesAnnexesPage';
import { RegistreDonateursPage } from '../pages/RegistreDonateursPage';
import { DocumentsObligatoiresPage } from '../pages/DocumentsObligatoiresPage';
import { UtilisateursPage } from '../pages/UtilisateursPage';
import { ParametresDossierPage } from '../pages/ParametresDossierPage';
import { PlansAnalytiquesPage } from '../pages/PlansAnalytiquesPage';
import { BrouillardPage } from '../pages/BrouillardPage';
import { ImportPage } from '../pages/ImportPage';
import { ControlesPage } from '../pages/ControlesPage';
import { RegularisationPage } from '../pages/RegularisationPage';
import { DevisesPage } from '../pages/DevisesPage';
import { RelancesPage } from '../pages/RelancesPage';
import { EtatsAnalytiquesPage } from '../pages/EtatsAnalytiquesPage';
import { BailleursPage } from '../pages/BailleursPage';

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
    motif: /^\/echeancier$/,
    titre: 'Échéancier de trésorerie',
    titreCourt: 'Échéancier',
    rendre: () => <EcheancierPage />,
  },
  { motif: /^\/exercice$/, titre: "Fin d'exercice", titreCourt: "Fin d'exercice", rendre: () => <ExercicePage /> },
  { motif: /^\/tiers$/, titre: 'Plan des tiers', titreCourt: 'Plan tiers', rendre: () => <TiersPage /> },
  { motif: /^\/taux-tva$/, titre: 'Taux de taxes', titreCourt: 'Taux de taxes', rendre: () => <TauxTvaPage /> },
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
  },
  {
    motif: /^\/documents-obligatoires$/,
    titre: 'Documents obligatoires',
    titreCourt: 'Doc. obligatoires',
    rendre: () => <DocumentsObligatoiresPage />,
  },
  { motif: /^\/bailleurs$/, titre: 'Bailleurs de fonds', titreCourt: 'Bailleurs', rendre: () => <BailleursPage /> },
  {
    motif: /^\/utilisateurs$/,
    titre: "Autorisations d'accès",
    titreCourt: 'Utilisateurs',
    rendre: () => <UtilisateursPage />,
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
    motif: /^\/regularisations$/,
    titre: 'Régularisations et abonnements',
    titreCourt: 'Régularisations',
    rendre: () => <RegularisationPage />,
  },
  { motif: /^\/devises$/, titre: 'Devises et réévaluation', titreCourt: 'Devises', rendre: () => <DevisesPage /> },
  { motif: /^\/relances$/, titre: 'Rappel et relevé', titreCourt: 'Rappel et relevé', rendre: () => <RelancesPage /> },
  {
    motif: /^\/etats-analytiques$/,
    titre: 'États analytiques et budgétaires',
    titreCourt: 'États analytiques',
    rendre: () => <EtatsAnalytiquesPage />,
  },
];

/** La définition qui régit ce chemin, ou `null` si aucune (accueil compris). */
export function definitionPour(chemin: string): DefinitionFenetre | null {
  return FENETRES.find((d) => d.motif.test(chemin)) ?? null;
}

/** Le contenu de la fenêtre, monté à partir de son adresse complète. */
export function rendreFenetre(adresse: string): JSX.Element | null {
  const chemin = adresse.split('?')[0];
  const def = definitionPour(chemin);
  if (!def) return null;
  const m = chemin.match(def.motif);
  return def.rendre({ capture: m ? m.slice(1) : [], adresse });
}
