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

describe('modèles de saisie · la barre de Sage, dans la fenêtre du journal', () => {
  const saisie = lire('pages/SaisiePage.tsx');

  it('la barre vit DANS la grille, pas dans une boîte à part', () => {
    // Chez Sage on ne quitte jamais la fenêtre du journal : on choisit un
    // modèle, on applique, on saisit les montants.
    expect(saisie).toContain('Appeler un modèle');
    expect(saisie).toContain('appliquerModele');
  });

  it('les modèles sont filtrés sur le journal ouvert', () => {
    // Tout l'intérêt : un journal d'achats propose ses opérations d'achat.
    expect(saisie).toContain('/modeles-saisie?journalId=');
  });

  it('appliquer AJOUTE à la pièce, il ne la remplace pas', () => {
    // Écraser une grille déjà commencée ferait perdre une saisie en cours
    // sans confirmation.
    expect(saisie).toMatch(/appliquerModele[\s\S]{0,400}setLignes\(\(prev\) => \[\s*\.\.\.prev,/);
  });

  it('une ligne sans montant arrive à zéro, prête à être chiffrée', () => {
    expect(saisie).toContain("l.sens === 'DEBIT' ? (l.montant ?? 0) : 0");
  });

  it('l’écran de gestion n’offre que des comptes d’imputation', () => {
    // Un compte de totalisation ne reçoit jamais d'écriture (CLAUDE.md §7) ·
    // l'offrir ferait découvrir le refus du serveur après coup.
    const page = lire('pages/ModelesSaisiePage.tsx');
    expect(page).toContain("x.typeCompte === 'DETAIL'");
  });

  it('la fenêtre est inscrite au registre et au menu', () => {
    expect(lire('lib/registre-fenetres.tsx')).toContain('/modeles-saisie$');
    expect(lire('components/chrome/AppShell.tsx')).toContain("navigate('/modeles-saisie')");
  });
});

describe('différenciateur SYCEBNL · les fiches du référentiel, mises au travail', () => {
  it('la saisie AVERTIT sur les exclusions du compte choisi', () => {
    // Le texte est cité, jamais reformulé · c'est sa citation qui le rend
    // opposable devant un réviseur.
    const saisie = lire('pages/SaisiePage.tsx');
    expect(saisie).toContain('/controles/regles-comptes');
    expect(saisie).toContain('exclusions du référentiel');
    expect(saisie).toContain('comptes à utiliser à la place');
  });

  it('l’avertissement n’EMPÊCHE pas la saisie', () => {
    // Le logiciel ne connaît pas la nature de l'opération : « le compte 40 ne
    // doit pas enregistrer les fournisseurs d'immobilisations » ne se vérifie
    // qu'en sachant ce qu'on achète. Refuser bloquerait des écritures justes.
    const saisie = lire('pages/SaisiePage.tsx');
    expect(saisie).not.toMatch(/regleDuCompte[\s\S]{0,200}(disabled|throw|return false)/);
  });

  it('la fiche retenue est la PLUS PRÉCISE, pas la première venue', () => {
    // Trois fiches descendent à trois chiffres (603, 659, 759) · un compte
    // 65910000 relève de 659, pas de 65 qui dit autre chose.
    const saisie = lire('pages/SaisiePage.tsx');
    expect(saisie).toContain('.sort((a, b) => b.numero.length - a.numero.length)[0]');
  });

  it('le dossier de révision s’ouvre aux DEUX référentiels', () => {
    // Depuis que les fiches de l'AUDCIF (Titre VII) sont extraites à côté de
    // celles du SYCEBNL, la fenêtre n'a plus de raison d'être réservée · elle
    // sert à chaque dossier les fiches de SON texte.
    const registre = lire('lib/registre-fenetres.tsx');
    const entree = registre.slice(registre.indexOf('dossier-revision'), registre.indexOf('dossier-revision') + 700);
    expect(entree).not.toContain('referentielsApplicables');
  });

  it('la page nomme le texte dont viennent les fiches', () => {
    // Un réviseur doit savoir de quel référentiel il lit la règle · les deux
    // ne disent pas la même chose du même numéro.
    const page = lire('pages/DossierRevisionPage.tsx');
    expect(page).toContain('AUDCIF, Titre VII');
    expect(page).toContain('SYCEBNL, Partie 2 chapitre 3');
    expect(page).toContain("jamais transposées de l'autre");
  });
});
