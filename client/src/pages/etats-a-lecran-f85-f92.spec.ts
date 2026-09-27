import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * AUDIT FINAL F85, F89, F91 et F92 · ce que l'écran des états doit lire.
 * Chaque test découpe le bloc qui porte la règle, jamais une distance fixe.
 */
const lire = (nom: string) => readFileSync(join(__dirname, nom), 'utf8');
const smt = lire('EtatsSmtPage.tsx');
const smtSyscohada = lire('EtatsSmtSyscohadaPage.tsx');
const syscohada = lire('EtatsFinanciersSyscohadaPage.tsx');

/** Le corps d'un `.map(` de la note 2, jusqu'à la fermeture de sa ligne. */
function ligneNote2(page: string): string {
  const i = page.indexOf('notes.note2.lignes.map(');
  expect(i).toBeGreaterThan(0);
  return page.slice(i, page.indexOf('))}', i));
}

describe('F85 · la note 2 du SMT montre les quantités lues sur l’inventaire', () => {
  it.each([
    ['SYCEBNL', smt],
    ['SYSCOHADA', smtSyscohada],
  ])('%s · quantité et prix unitaire sont lus sur la ligne, pas des points fixes', (_nom, page) => {
    const ligne = ligneNote2(page);
    expect(ligne).toContain('quantite(l.quantite)');
    expect(ligne).toContain('montant(l.prixUnitaire)');
    // Plusieurs fiches d'un même compte · la clé ne peut pas être le seul compte.
    expect(ligne).toMatch(/key=\{`\$\{l\.reference\}-\$\{i\}`\}/);
    expect(page).toContain('notes.note2.sourceQuantites');
  });
});

describe('F89 · un poste du ch. 33 n’affiche pas sa clé interne', () => {
  it('la colonne REF du compte de résultat lit le drapeau supplementaire', () => {
    const i = syscohada.indexOf('const ligneCr = ');
    const corps = syscohada.slice(i, syscohada.indexOf('\n  };', i));
    expect(corps).toContain("{l.supplementaire ? '' : l.ref}");
  });
});

describe('F91 · les exports se ferment tant qu’une date d’arrêté est posée', () => {
  it.each(['exporterLiasse', 'exporter'])('le bouton de %s est désactivé et le geste refusé', (fonction) => {
    const def = syscohada.indexOf(`const ${fonction} = async () => {`);
    expect(syscohada.slice(def, syscohada.indexOf('\n', def + 40))).toContain('|| arreteAu) return;');
    const bouton = syscohada.indexOf(`onClick={${fonction}}`);
    expect(syscohada.slice(bouton, syscohada.indexOf('>', bouton))).toContain('disabled={exportEnCours || Boolean(arreteAu)}');
  });
});

describe('F92 · le bilan nomme les comptes à solder à la clôture', () => {
  it('le bloc parcourt comptesASolderALaCloture', () => {
    expect(syscohada).toContain('bilan.comptesASolderALaCloture.map((c) => (');
  });
});
