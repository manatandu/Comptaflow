import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { peutEcrirePourRole } from '../lib/roles-cantonnes';

/**
 * LA LECTURE SEULE NE VOIT PAS DE BOUTON QUI ÉCRIT.
 *
 * Le serveur refuse toute route POST, PUT, PATCH ou DELETE à LECTURE_SEULE
 * (`src/common/guards/ecritures-reservees.spec.ts`, côté serveur). Jusqu'au
 * 2026-09-23, près de quarante fenêtres proposaient pourtant leurs boutons à tout
 * le monde : un auditeur ou un bailleur cliquait, remplissait un formulaire, et
 * recevait « Rôle insuffisant » à l'enregistrement. Le serveur protégeait, l'écran
 * mentait sur ce que l'utilisateur pouvait faire.
 *
 * Ce test ne peut pas lire l'intention de chaque bouton. Il exige qu'un écran
 * qui envoie une écriture au serveur LISE le droit (`peutEcrire`, ou `estAdmin`
 * pour une fenêtre dont toutes les écritures sont réservées à l'administrateur), ou figure ci-dessous avec son
 * motif. Un écran nouveau qui écrit sans y penser le fait tomber.
 */

const EXEMPTS: Record<string, string> = {
  'pages/AuthPage.tsx': "la connexion elle-même · personne n'a encore de rôle",
  'pages/ChangerMotDePassePage.tsx': 'chacun change son propre mot de passe, lecture seule comprise',
  'components/ModaleMonAdresse.tsx': 'chacun change sa propre adresse de connexion, lecture seule comprise',
  'components/NouveauFichierWizard.tsx': "création d'un dossier depuis la porte d'ouverture, avant toute session",
  'pages/PlateformePage.tsx': "console de l'éditeur, gardée par estOperateurPlateforme et non par le rôle du dossier",
  'components/ModelesSaisie.tsx':
    "calcule une proposition sans rien enregistrer (POST /operations-specifiques/proposition) · l'insertion va dans la saisie, que SaisiePage garde",
};

/**
 * Écrans dont TOUTES les écritures sont réservées à l'administrateur côté
 * serveur (@Roles ADMIN_CABINET seul) · `estAdmin` y suffit. Ailleurs,
 * `estAdmin` ne prouve rien : un écran qui masque sa seule action
 * d'administration peut encore montrer à la lecture seule tout le reste.
 */
const ADMIN_SEULEMENT: Record<string, string> = {
  'pages/BanquesPage.tsx': "banques et RIB, structures du dossier réservées à l'administrateur",
  'pages/LibellesPage.tsx': "libellés pré-enregistrés, structure du dossier réservée à l'administrateur",
  'pages/UtilisateursPage.tsx': "gestion des accès du dossier, réservée à l'administrateur",
  'pages/BailleursPage.tsx': "création et rattachement des bailleurs, réservés à l'administrateur",
  'pages/ExercicePage.tsx': "clôtures, arrêté des comptes et imputation d'ouverture, réservés à l'administrateur",
  'pages/ImportPage.tsx': "analyse et exécution d'import, réservées à l'administrateur",
  'pages/JournauxPage.tsx': "création et activation des codes journaux, réservées à l'administrateur",
  'pages/ParametresDossierPage.tsx': "paramètres du dossier, réservés à l'administrateur",
  'components/ModaleFonctions.tsx': "profil de fonctions d'un utilisateur, route réservée à l'administrateur",
  'components/NaturesCompte.tsx': "natures de compte (fourchettes, défauts, alignement), routes réservées à l'administrateur",
  'pages/PlanComptesPage.tsx': "ouverture et modification des comptes du plan, réservées à l'administrateur",
  'pages/PlansAnalytiquesPage.tsx': "structure analytique (sections, budgets, mise en sommeil), réservée à l'administrateur",
  'pages/TauxTvaPage.tsx': "paramétrage des taux de taxe, fenêtre réservée à l'administrateur",
  'components/VoletRibsTiers.tsx': "coordonnées bancaires des tiers, structure du tiers réservée à l'administrateur (un RIB changé détourne un paiement)",
  'pages/TiersPage.tsx': "plan des tiers · structure (création, fusion, comptes, modèles de règlement) réservée à l'administrateur, fenêtre ouverte en consultation ; les documents suivent peutEcrire dans leur volet",
};

const RACINE = join(__dirname, '..');
const MUTATION = /api\.(post|put|patch|delete)\s*[<(]/;

function fichiers(dossier: string): string[] {
  return readdirSync(dossier, { withFileTypes: true }).flatMap((e) => {
    const chemin = join(dossier, e.name);
    if (e.isDirectory()) return fichiers(chemin);
    return e.name.endsWith('.tsx') && !e.name.includes('.spec.') ? [chemin] : [];
  });
}

const ecrans = [...fichiers(join(RACINE, 'pages')), ...fichiers(join(RACINE, 'components'))]
  .map((f) => ({ nom: relative(RACINE, f).replace(/\\/g, '/'), source: readFileSync(f, 'utf8') }))
  .filter((e) => MUTATION.test(e.source));

describe('la lecture seule ne voit pas de bouton qui écrit', () => {
  it('le recensement trouve encore des écrans qui écrivent', () => {
    // Un garde-fou qui ne trouve plus rien passe sans rien vérifier.
    expect(ecrans.length).toBeGreaterThan(30);
  });

  it('le droit vit en UN endroit, le contexte de session', () => {
    // Depuis les rôles cantonnés (2026-09-24), le contexte de session appelle
    // la règle au lieu de l'écrire · elle vit dans lib/roles-cantonnes.ts, et
    // la LECTURE SEULE y reste le seul rôle qui n'écrit rien.
    const auth = readFileSync(join(RACINE, 'lib/auth.tsx'), 'utf8');
    expect(auth).toContain('peutEcrire: peutEcrirePourRole(utilisateur?.role)');
    expect(auth).toContain('peutValider: peutValiderPourRole(utilisateur?.role)');
    expect(peutEcrirePourRole('LECTURE_SEULE')).toBe(false);
  });

  it.each(ecrans.map((e) => [e.nom, e.source] as const))('%s lit le droit avant de proposer une écriture', (nom, source) => {
    if (nom in EXEMPTS) return;
    // `peutValider` est plus strict que `peutEcrire` · il vaut lecture du droit.
    const droit = nom in ADMIN_SEULEMENT ? /\bestAdmin\b/ : /\b(peutEcrire|peutValider)\b/;
    expect([nom, droit.test(source)]).toEqual([nom, true]);
  });

  it('chaque exemption vise un écran qui existe et écrit encore', () => {
    const noms = new Set(ecrans.map((e) => e.nom));
    for (const nom of [...Object.keys(EXEMPTS), ...Object.keys(ADMIN_SEULEMENT)])
      expect([nom, noms.has(nom)]).toEqual([nom, true]);
  });
});
