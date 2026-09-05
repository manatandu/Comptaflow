import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * LES NEUF CLASSES N'ONT PAS LE MÊME NOM DANS LES DEUX PLANS.
 *
 * La fenêtre Plan comptable n'en connaissait qu'un jeu, et l'écart porte
 * précisément sur les deux classes les plus caractéristiques de chaque
 * référentiel : une entreprise lisait « Fonds propres » sur sa classe 1 et
 * « Contributions volontaires » sur sa classe 9, notion qui n'existe pas chez
 * elle. L'assistant de création, lui, annonçait « plan de comptes SYCEBNL
 * standard » dans son récapitulatif même quand SYSCOHADA venait d'être choisi
 * à l'écran précédent · le serveur semait pourtant le bon plan.
 *
 * Ces défauts vivent tous dans du TEXTE d'interface. Rien ne les fait tomber
 * sauf une lecture du fichier, d'où ce spec.
 */

const lire = (p: string) => readFileSync(join(__dirname, p), 'utf8');

describe('plan comptable · libellés de classe par référentiel', () => {
  const page = lire('PlanComptesPage.tsx');

  it('porte deux tables de libellés, choisies sur le référentiel du dossier', () => {
    expect(page).toContain('const LIBELLE_CLASSE_SYCEBNL');
    expect(page).toContain('const LIBELLE_CLASSE_SYSCOHADA');
    expect(page).toContain("utilisateur?.tenant.referentiel === 'SYSCOHADA' ? LIBELLE_CLASSE_SYSCOHADA");
    // Plus aucune lecture de la table unique d'origine.
    expect(page).not.toMatch(/\bLIBELLE_CLASSE\[/);
    expect(page).not.toMatch(/Object\.keys\(LIBELLE_CLASSE\)/);
  });

  it('nomme la classe 9 comme son cadre comptable la nomme', () => {
    // AUDCIF, Titre VII ch. 1 · « Comptes des engagements hors bilan et
    // comptabilité analytique de gestion » (90 Engagements obtenus et
    // accordés, 91 Contreparties des engagements, 92 à 99 CAGE).
    expect(page).toContain("CLASSE_9: 'Engagements hors bilan · analytique'");
    // SYCEBNL, Partie 2 ch. 1 · « comptes des contributions volontaires en
    // nature et comptes de la comptabilité analytique ».
    expect(page).toContain("CLASSE_9: 'Contributions volontaires · analytique'");
  });

  it('nomme la classe 1 « ressources durables » des deux côtés, avec le bon contenu', () => {
    // Les DEUX cadres l'intitulent « comptes de ressources durables » · c'est
    // le contenu qui diffère, pas le titre. « Fonds propres » tout court était
    // faux même pour le SYCEBNL.
    expect(page).toContain("CLASSE_1: 'Ressources durables (fonds propres et dettes financières)'");
    expect(page).toContain("CLASSE_1: 'Ressources durables (capitaux propres et dettes financières)'");
    expect(page).not.toContain("'Fonds propres et ressources durables'");
  });

  it('ne renvoie plus un dossier SYSCOHADA à la Partie 2 du SYCEBNL', () => {
    // L'encart du compte principal citait le SYCEBNL à tout le monde. Pour un
    // dossier SYSCOHADA, la liste des comptes à deux chiffres est au ch. 1 du
    // Titre VII, le ch. 2 ne portant que le caractère impératif de la
    // codification (AUDCIF art. 18).
    expect(page).toContain("'Compte principal du plan SYSCOHADA (AUDCIF art. 18");
    expect(page).toContain("'Compte principal du plan SYCEBNL (Partie 2, ch. 2)'");
  });

  it('ne présente plus la fenêtre comme propre au SYCEBNL dans ses commentaires', () => {
    expect(page).not.toContain('classement par classe (1 à 9, SYCEBNL)');
    expect(page).not.toContain("d'une division du plan SYCEBNL");
    // Le décompte des en-têtes de division diffère aussi : 76 d'un côté, 77
    // de l'autre. Vérifié plus bas contre les semis eux-mêmes.
    expect(page).toContain('compte-seed-syscohada.ts');
  });

  it('annonce le bon nombre d’en-têtes de division, compté sur les semis', () => {
    const sycebnl = lire('../../../src/modules/comptes/compte-seed.ts');
    const syscohada = lire('../../../src/modules/comptes/compte-seed-syscohada.ts');
    // Un en-tête de division est un compte à deux chiffres semé en TOTAL.
    const nbSycebnl = (sycebnl.match(/total\('\d{2}'/g) ?? []).length;
    const nbSyscohada = (syscohada.match(/t\('\d{2}'/g) ?? []).length;
    // 84 et 85 depuis que les huit divisions de la comptabilité analytique de
    // gestion (92 à 99) sont semées comme en-têtes des DEUX côtés · les deux
    // textes portent le même paragraphe, mot pour mot, et laissent le
    // découpage « à l'initiative des entités ».
    expect({ sycebnl: nbSycebnl, syscohada: nbSyscohada }).toEqual({ sycebnl: 84, syscohada: 85 });
    expect(page).toContain(`${nbSycebnl} semés par compte-seed.ts`);
    expect(page).toContain(`${nbSyscohada} par`);
  });
});

describe('assistant de création · ce qui dépend du référentiel choisi', () => {
  const wizard = lire('../components/NouveauFichierWizard.tsx');

  it('annonce le plan réellement semé, pas le SYCEBNL par défaut', () => {
    expect(wizard).toContain('plan de comptes {form.referentiel} standard');
    expect(wizard).not.toContain('plan de comptes SYCEBNL standard');
  });

  it('ne cite les bailleurs qu’au SYCEBNL · le 46 du plan SYSCOHADA porte les associés', () => {
    expect(wizard).toContain("'(tiers clients et fournisseurs, banques)'");
    expect(wizard).toContain("'(tiers, bailleurs, banques)'");
  });

  it('ne propose pas un suffixe « asbl » à une société commerciale', () => {
    // AUSCGIE art. 17 · la dénomination est suivie de l'indication de la forme.
    expect(wizard).toContain("form.referentiel === 'SYSCOHADA' ? 'Kivu Négoce SARL' : 'Espoir pour Tous asbl'");
  });

  it('n’explique plus le référentiel par l’article 4 du SYCEBNL seul', () => {
    // `sujet="jeuEtats"` était servi AVANT le choix, donc aussi à qui crée un
    // dossier SYSCOHADA, et ne parlait que des 35 ou 24 notes du SYCEBNL.
    expect(wizard).not.toContain('<Aide sujet="jeuEtats" />');
    expect(wizard).toContain('source="SYCEBNL, art. premier et 2 · AUDCIF, art. 2 et 5"');
  });
});
