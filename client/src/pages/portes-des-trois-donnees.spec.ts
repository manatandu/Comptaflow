import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * LES TROIS DONNÉES RESTENT MORTES TANT QUE PERSONNE NE PEUT LES SAISIR.
 *
 * Trois colonnes sont arrivées en base, chacune pour appliquer une règle que
 * le module connaissait déjà et ne pouvait pas appliquer faute de la donnée.
 * Une colonne qu'aucun écran ne renseigne ne change rien : elle reste nulle,
 * l'avertissement reste, et le travail est perdu.
 *
 * Ces trois portes vivent dans du TEXTE d'interface. Rien ne les fait tomber
 * sauf une lecture des fichiers, d'où ce spec · même parti que
 * `plan-comptes-referentiel.spec.ts`.
 */

const lire = (p: string) => readFileSync(join(__dirname, p), 'utf8');

describe('fiche du tiers · cellule du groupe', () => {
  const page = lire('TiersPage.tsx');

  it('propose la liste que le SERVEUR accepte, pas une liste montée à l’écran', () => {
    // La règle « même groupe » n'est pas exprimable en SQL et vit dans
    // TiersService. L'écran qui composerait sa propre liste finirait par
    // proposer un dossier que le serveur refuse.
    expect(page).toContain("api.get<DossierDuGroupe[]>('/tiers/dossiers-du-groupe')");
    expect(page).toContain('celluleGroupeId: e.target.value || null');
  });

  it('dit ce que le rattachement fait, et sur quel fondement', () => {
    expect(page).toContain("GROUPE D'ÉTABLISSEMENTS");
    expect(page).toContain('AUDCIF art. 107');
    expect(page).toContain('élimination des comptes réciproques');
  });

  it('ne laisse pas un dossier hors groupe devant une liste vide sans explication', () => {
    expect(page).toContain("Ce dossier n'appartient à aucun groupe d'établissements");
  });
});

describe('fiche du tiers · TVA d’après les débits', () => {
  const page = lire('TiersPage.tsx');

  it('présente la case pour ce qu’elle est · une mention LUE sur la facture', () => {
    // Décret n° 011/42, art. 60 · la mention « Autorisation d'acquitter la TVA
    // d'après les débits » doit figurer sur toutes les factures de l'autorisé.
    // Aucun calcul ne l'établit, d'où une case à cocher et non un automatisme.
    expect(page).toContain('autoriseTvaDebits: e.target.checked');
    expect(page).toContain('Autorisation d’acquitter la TVA d’après les débits');
    expect(page).toContain('011/42, art. 60');
  });

  it('recueille la référence de la décision, et cite l’article qui la fonde', () => {
    expect(page).toContain('referenceAutorisationDebits');
    expect(page).toContain('art. 26');
    // Ce que la mention change pour le CLIENT · O.-L. n° 10/001, art. 37.
    expect(page).toContain('art. 37');
  });
});

describe('grille de saisie · date de versement', () => {
  const page = lire('SaisiePage.tsx');

  it('transporte la date jusqu’au serveur, ligne par ligne', () => {
    expect(page).toContain('dateVersement: versement || undefined');
    expect(page).toContain('dateVersement: l.dateVersement');
  });

  it('la présente comme une EXCEPTION, pas comme une colonne de plus', () => {
    // La remplir à chaque ligne ferait ressaisir une date que l'écriture porte
    // déjà · vide, c'est la date de l'écriture qui fait foi.
    expect(page).toContain('Date de versement (exception)');
    expect(page).toContain('tombe dans un autre mois que l’écriture');
    expect(page).toContain('loi n° 004/2003, art. 18');
  });

  it('dit au comptable quand elle n’apporte rien', () => {
    // Même mois que l'écriture · la saisir ne change aucun rattachement.
    expect(page).toContain('moisDeLaPeriode');
    expect(page).toContain('la date de l’écriture fait foi');
  });

  it('remet la date à zéro après chaque ligne validée', () => {
    // Sans cela, la date du versement d'une ligne de paie suivrait en silence
    // sur toutes les lignes suivantes de la pièce.
    expect(page).toContain("setVersement('');");
  });
});

describe('types du client · ils rattrapent le serveur', () => {
  const types = lire('../lib/types.ts');

  it('porte les trois champs du tiers, avec leur source', () => {
    expect(types).toContain('celluleGroupeId: string | null;');
    expect(types).toContain('autoriseTvaDebits: boolean;');
    expect(types).toContain('referenceAutorisationDebits: string | null;');
    expect(types).toContain('AUDCIF art. 107');
    expect(types).toContain('011/42, art. 60');
  });

  it('décrit le dossier du groupe servi par le serveur', () => {
    expect(types).toContain('export interface DossierDuGroupe');
    expect(types).toContain('estDossierMere: boolean;');
  });
});
