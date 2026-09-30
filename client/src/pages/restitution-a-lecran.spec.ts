import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * CE QUE L'ÉCRAN DOIT DIRE AVANT DE PROPOSER LE BOUTON.
 *
 * Une archive qui se présente pour plus qu'elle ne vaut est plus dangereuse
 * que pas d'archive : un successeur ou un bailleur qui la prendrait pour la
 * conservation légale détruirait les classeurs papier. Les réserves sont
 * dans le manifeste, à l'intérieur du fichier · elles doivent aussi être à
 * l'écran, parce qu'on décide AVANT de télécharger.
 */

const racine = join(__dirname, '..', '..');
const page = readFileSync(join(racine, 'src/pages/RestitutionPage.tsx'), 'utf8');
const shell = readFileSync(join(racine, 'src/components/chrome/AppShell.tsx'), 'utf8');
const registre = readFileSync(join(racine, 'src/lib/registre-fenetres.tsx'), 'utf8');

describe('l’écran de restitution annonce ses réserves', () => {
  const deplie = page.replace(/\s+/g, ' ');

  it('dit qu’elle ne remplace pas la conservation, pièces justificatives comprises', () => {
    expect(deplie).toContain("Elle ne remplace pas la conservation.");
    // Audit final F97 · les documents des tiers sont archivés, pas les pièces des écritures.
    expect(deplie).toContain('OmegaX ne tient pas les pièces justificatives des écritures');
    expect(deplie).toContain('seuls les documents attachés aux tiers sont archivés');
    expect(deplie).toContain('art. 24');
  });

  it('dit la valeur probante d’après le Code du numérique, texte entier à l’appui', () => {
    // Passe D4 (D4-A1, D4-B1) · la note de cours de 2020 est antérieure à
    // l'ordonnance-loi n° 23/10 du 13 mars 2023, qui admet l'écrit
    // électronique (art. 89, 95). Reste la force probante de l'art. 91.
    expect(deplie).toContain("Elle n'a pas la force probante de l'écrit papier légalisé.");
    expect(deplie).toContain("ni signature électronique certifiée ni horodatage au sens de l'art. 91");
    expect(deplie).toContain('Ordonnance-loi n° 23/10 du 13 mars 2023 portant Code du numérique, art. 89, 91 et 95.');
    expect(deplie).toContain('La qualification de l\'archive comme preuve revient à un juriste.');
  });

  it('refuse d’annoncer une réversibilité et nomme les imports qui existent', () => {
    expect(deplie).toContain("Ce n'est pas une réversibilité.");
    expect(deplie).toContain('L\'import général recharge un plan de comptes, une balance et des écritures');
    expect(deplie).toContain('trois imports ciblés lisent un relevé bancaire');
  });

  it('dit que ce n’est pas un instantané, et où le lecteur le vérifie', () => {
    expect(deplie).toContain("Ce n'est pas un instantané.");
    expect(deplie).toContain('controles.txt');
  });

  it('dit que les CSV ne sont pas le livre-journal', () => {
    expect(deplie).toContain("Les CSV ne sont pas le livre-journal.");
    expect(deplie).toContain("n'est pas chronologique");
  });

  it('n’affiche AUCUN délai de conservation', () => {
    // Le CPCC constate « l'absence de délai fixe unique » · afficher dix ans
    // reviendrait à choisir à la place du cabinet.
    expect(page).not.toMatch(/dix ans|10 ans/i);
  });
});

describe('qui peut extraire, et depuis où', () => {
  it('réserve le bouton à l’administrateur du cabinet', () => {
    // Lu dans le contexte de session, jamais recomposé (audit C9).
    expect(page).toContain('const { estAdmin: peutExtraire } = useAuth();');
    // Et le dit à celui qui ne l'est pas, plutôt que de masquer sans motif.
    expect(page.replace(/\s+/g, ' ')).toContain(
      "Seul l'administrateur du cabinet peut extraire le dossier complet.",
    );
  });

  it('prévient que l’extraction est longue et que le fichier n’arrive qu’entier', () => {
    // `api.telecharger` fait `await res.blob()` · le navigateur attend
    // l'archive entière, même produite en flux par le serveur.
    expect(page.replace(/\s+/g, ' ')).toContain('ne fermez pas la fenêtre');
  });

  it('vit dans le menu Fichier, sous l’import, et jamais dans le menu État', () => {
    // Une copie intégrale des tables n'est pas une édition · la ranger parmi
    // les livres laisserait croire qu'elle en tient lieu.
    const fichier = shell.slice(shell.indexOf("titre: 'Fichier'"), shell.indexOf("titre: 'Structure'"));
    const etat = shell.slice(shell.indexOf("titre: 'État'"), shell.indexOf("titre: 'Fenêtre'"));
    expect(fichier).toContain("Restituer le dossier complet…");
    expect(etat).not.toContain('/restitution');
    // Sous l'import, pas au-dessus · l'entrée puis la sortie.
    expect(fichier.indexOf('/import')).toBeLessThan(fichier.indexOf('/restitution'));
  });

  it('n’est réservée à aucun référentiel', () => {
    // L'obligation dont elle découle est l'AUDCIF art. 22, que l'art. 3 du
    // SYCEBNL n'écarte pas · elle vaut identiquement des deux côtés.
    const entree = registre.slice(registre.indexOf("motif: /^\\/restitution$/"));
    const bloc = entree.slice(0, entree.indexOf('},'));
    expect(bloc).not.toContain('referentiel');
  });
});
