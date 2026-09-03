import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const lire = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
const lireServeur = (p: string) => readFileSync(join(__dirname, '../../../src', p), 'utf8');

/**
 * Deux écrans qui montraient du vide, corrigés le 2026-09-03.
 */

describe('ouverture du dossier · un seul écran', () => {
  const page = lire('pages/AuthPage.tsx');

  it('l’écran de porte a disparu', () => {
    // Il proposait « créer » (un pavé de texte sans bouton, l'inscription
    // étant fermée) et « ouvrir » (un clic qui ne faisait que passer à
    // l'écran suivant). Un écran entier pour un clic obligatoire.
    expect(page).not.toContain("'porte'");
    expect(page).not.toContain('setEcran');
  });

  it('les dossiers récents survivent · ils portaient toute la valeur de la porte', () => {
    // Ce sont les Favoris du menu Fichier de Sage. Les perdre en supprimant
    // l'écran aurait fait retaper l'adresse à chaque ouverture.
    expect(page).toContain('DOSSIERS RÉCENTS');
    expect(page).toContain('ouvrirDossier(d)');
  });

  it('la règle d’ouverture d’un dossier reste dite, en une ligne', () => {
    // L'auto-inscription est fermée (CLAUDE.md §8) · retirer le pavé ne doit
    // pas retirer l'information, sinon un visiteur ne sait plus quoi faire.
    expect(page).toContain('VMG Consulting');
  });
});

describe('lettrage · la fenêtre ne s’ouvre plus sur du vide', () => {
  const page = lire('pages/LettragePage.tsx');

  it('la vue d’ensemble est chargée sans attendre qu’un compte soit choisi', () => {
    expect(page).toContain("api.get<GroupeLettrageDossier[]>('/lettrage')");
  });

  it('le message « choisissez un compte » a laissé place aux lettrages', () => {
    expect(page).not.toContain('Choisissez le compte à interroger');
    expect(page).toContain('tousGroupes');
  });

  it('un clic sur un lettrage ouvre son compte', () => {
    expect(page).toContain('setCompteChoisi(g.compteId)');
  });

  it('la route serveur existe et ne parle d’aucun compte', () => {
    const controleur = lireServeur('modules/lettrage/lettrage.controller.ts');
    expect(controleur).toContain("@Controller('lettrage')");
    expect(controleur).toContain('listerGroupesDuDossier');
  });
});

describe('journal · la tranche affichée se dit', () => {
  const page = lire('pages/JournalPage.tsx');

  it('l’écran lit le drapeau de troncature du serveur', () => {
    expect(page).toContain('tronque');
    expect(page).toContain('setTroncature');
  });

  it('il annonce combien d’écritures sur combien', () => {
    // Sans cette phrase, un journal de 2 000 écritures sur 500 000 se lit
    // comme un journal de 2 000 écritures.
    expect(page).toContain('écritures affichées sur');
  });

  it('il prévient que les totaux, eux, sont ceux du journal entier', () => {
    expect(page).toContain('totaux restent ceux du journal entier');
  });
});
