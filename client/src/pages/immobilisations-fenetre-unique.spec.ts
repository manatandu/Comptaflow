import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * LA FENÊTRE IMMOBILISATIONS EST UNIQUE · une seule fenêtre à cinq onglets
 * (Biens, Tableaux, Financements, Opérations, Lieux), et un
 * bouton de création qui s'efface tant que son formulaire est ouvert.
 * Chaque test découpe le bloc qui porte la propriété, jamais une distance.
 */
const lire = (chemin: string) => readFileSync(join(__dirname, chemin), 'utf8');
const page = lire('ImmobilisationsPage.tsx');
const tableaux = lire('TableauxImmobilisationsPage.tsx');
const registre = lire('../lib/registre-fenetres.tsx');
const menus = lire('../components/chrome/AppShell.tsx');
const accueil = lire('AccueilPage.tsx');

describe('le bouton de création s’efface formulaire ouvert', () => {
  it('« Nouvelle immobilisation » n’est rendu que formulaire fermé', () => {
    const i = page.indexOf('{!afficherFormImmo && (');
    expect(i).toBeGreaterThan(0);
    const bouton = page.slice(i, page.indexOf('</button>', i));
    expect(bouton).toContain('Nouvelle immobilisation');
    expect(bouton).toContain('setAfficherFormImmo(true)');
  });

  it('la famille ne se saisit plus · le bien se choisit par son compte (compte-du-bien.ts)', () => {
    expect(page).toContain('compteImmobilisationId: iCompteBienId,');
    expect(page).toContain('Compte du bien');
  });

  it('le formulaire garde son « Annuler » pour se refermer', () => {
    expect(page).toContain('onClick={() => setAfficherFormImmo(false)}');
  });
});

/**
 * Le PANNEAU d'un onglet · de son ouverture `role="tabpanel"` jusqu'au panneau
 * suivant (ou à la fin du rendu). Découpe par structure, jamais par distance.
 */
function panneau(cle: string): string {
  const ouvertures = [...page.matchAll(/<div role="tabpanel"[^>]*>/g)].map((m) => m.index ?? 0);
  const i = page.search(new RegExp(`<div role="tabpanel"[^>]*onglet !== '${cle}'`));
  expect(i).toBeGreaterThan(0);
  const suivant = ouvertures.find((o) => o > i) ?? page.length;
  return page.slice(i, suivant);
}

describe('une seule fenêtre, rangée en onglets (ligne A1)', () => {
  it('cinq onglets, dans l’ordre · Biens, Tableaux, Financements, Opérations, Lieux', () => {
    const debut = page.indexOf('const ONGLETS_IMMOBILISATIONS');
    const table = page.slice(debut, page.indexOf('];', debut));
    const libelles = [...table.matchAll(/libelle: '([^']+)'/g)].map((m) => m[1]);
    expect(libelles).toEqual(['Biens', 'Tableaux', 'Financements', 'Opérations', 'Lieux']);
  });

  it('les tableaux gardent leurs deux vues, sans redessiner leurs onglets', () => {
    for (const cle of ["'immobilisations'", "'amortissements'"]) expect(page).toContain(cle);
    expect(page).toContain('<TableauxImmobilisationsPage ongletPilote={tableau} />');
    expect(tableaux).toContain('{!ongletPilote && (');
  });

  it('ce qui porte sur UN bien reste sur sa ligne, dans Biens', () => {
    const biens = panneau('biens');
    for (const c of [
      '<PlanFiscalDegressif',
      '<RevisionPlanAmortissement',
      '<CoutsEmpruntIncorpores',
      '<BasculeDureeLimitee',
      '<RemplacementImprevu',
      '<PlafondRepriseDepreciation',
      '<EchangeImmobilisation',
      'onMettreEnService',
      'Confirmer la sortie',
      'Nouvelle immobilisation',
    ]) {
      expect(biens).toContain(c);
    }
  });

  it('Financements tient subventions, fonds et legs ; Opérations le prix global et la clôture des contrats', () => {
    const financements = panneau('financements');
    expect(financements).toContain('<RepriseSubventionImmobilisations');
    expect(financements).toContain('<LegsImmobilisations');
    const operations = panneau('operations');
    expect(operations).toContain('<PrixGlobalImmobilisations');
    expect(operations).toContain('<ClotureLocationAcquisition');
  });

  it('Lieux reste réservé à l’administrateur, comme le bouton qu’il remplace', () => {
    expect(page).toContain("{estAdmin && visites.has('lieux') && (");
    expect(page).toContain(".filter((o) => o.cle !== 'lieux' || estAdmin)");
    expect(panneau('lieux')).toContain('creerLieu');
  });

  it('un panneau visité reste monté, caché · une saisie ouverte ne se perd pas en changeant d’onglet', () => {
    expect(page).toContain("{visites.has('financements') && (");
    expect(page).toContain("{visites.has('operations') && (");
    expect(page).toContain(`<div role="tabpanel" hidden={onglet !== 'biens'}>`);
  });

  it('l’onglet se mémorise par poste, sous try/catch (lib/onglets-immobilisations.ts)', () => {
    const debut = page.indexOf('const choisirOnglet =');
    const corps = page.slice(debut, page.indexOf('};', debut));
    expect(corps).toContain('memoriserOnglet(o)');
    expect(page).toContain('ongletAOuvrir(lireOngletMemorise(), vueInitiale, true)');
  });

  it('l’ancienne adresse reste ouverte, sur l’onglet des tableaux', () => {
    expect(registre).toContain('rendre: () => <ImmobilisationsPage vueInitiale="immobilisations" />');
  });

  it('plus d’entrée de menu ni de tuile pour la fenêtre qui doublait', () => {
    expect(menus).not.toContain("chemin: '/tableaux-immobilisations'");
    expect(accueil).not.toContain("chemin: '/tableaux-immobilisations'");
  });
});
