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
    expect(deplie).toContain('aucune pièce justificative numérisée');
    expect(deplie).toContain('art. 24');
  });

  it('cite le CPCC sur la valeur probante de l’écrit électronique', () => {
    expect(deplie).toContain(
      "Les écrits électroniques ne sont pas encore admis en preuve au même titre que l'écrit papier",
    );
    expect(deplie).toContain('§ 1.5.3 b');
  });

  it('refuse d’annoncer une réversibilité et nomme les trois seuls imports', () => {
    expect(deplie).toContain("Ce n'est pas une réversibilité.");
    expect(deplie).toContain('plan de comptes, balance, écritures');
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
    expect(page).toContain("utilisateur?.role === 'ADMIN_CABINET'");
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
