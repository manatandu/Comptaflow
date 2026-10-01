import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * LA FENÊTRE IMMOBILISATIONS EST UNIQUE · une seule fenêtre à trois onglets
 * (Biens, tableau des immobilisations, tableau des amortissements), et un
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

describe('une seule fenêtre, trois onglets', () => {
  it('la page porte les trois vues et rend les tableaux sans redessiner leurs onglets', () => {
    for (const cle of ["'biens'", "'immobilisations'", "'amortissements'"]) expect(page).toContain(cle);
    expect(page).toContain('<TableauxImmobilisationsPage ongletPilote={vue} />');
    expect(tableaux).toContain('{!ongletPilote && (');
  });

  it('l’ancienne adresse reste ouverte, sur l’onglet des tableaux', () => {
    expect(registre).toContain('rendre: () => <ImmobilisationsPage vueInitiale="immobilisations" />');
  });

  it('plus d’entrée de menu ni de tuile pour la fenêtre qui doublait', () => {
    expect(menus).not.toContain("chemin: '/tableaux-immobilisations'");
    expect(accueil).not.toContain("chemin: '/tableaux-immobilisations'");
  });
});
