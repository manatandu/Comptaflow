import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * CE QUE LE LOGICIEL PROMET AU SUJET DES ÉTATS SYSCOHADA · CLAUDE.md §4
 * interdit tout « bientôt disponible » qui soit faux, et c'est exactement le
 * défaut que rien ne détecte : une mention « en construction » restée en
 * place après la construction ne casse aucun test, ne lève aucun type, et se
 * lit comme une promesse non tenue par le premier client qui ouvre l'assistant
 * de création de dossier ou la console VMG.
 *
 * Le cas est vécu : les états financiers SYSCOHADA (Système normal du Titre IX
 * et Système minimal de trésorerie du Titre X, AUDCIF art. 11) ont été écrits,
 * les fenêtres aiguillent, les contrôleurs répondent · mais deux textes
 * d'interface annonçaient encore « états en construction », et deux
 * commentaires de serveur justifiaient une garde par une mention d'écran qui
 * n'existait plus. Ce fichier relit ces quatre endroits.
 *
 * AUCUN import de « vitest » ici, volontairement · convention du dépôt (voir
 * aiguillage-referentiel.spec.ts) : describe/it/expect arrivent par les
 * globales, ce qui rend le fichier exécutable par les DEUX lanceurs. Les
 * `.tsx` n'étant ni transformés ni résolus par le Jest de la racine, les
 * écrans se vérifient sur leur SOURCE.
 */

const racineClient = join(__dirname, '..');
const lireClient = (chemin: string) => readFileSync(join(racineClient, chemin), 'utf8');
const lireServeur = (chemin: string) => readFileSync(join(__dirname, '../../../src', chemin), 'utf8');

/** Les mots par lesquels une fenêtre s'annonce inachevée. */
const MOTS_INACHEVE = /en construction|bientôt|à venir|prochainement/i;

/**
 * Toutes les sources du client. Les fichiers de test en sont exclus · ils
 * CITENT les tournures qu'ils interdisent, celui-ci le premier, et se
 * dénonceraient eux-mêmes.
 */
function sourcesClient(dossier = racineClient): string[] {
  const trouves: string[] = [];
  for (const entree of readdirSync(dossier, { withFileTypes: true })) {
    if (entree.name === 'node_modules') continue;
    const chemin = join(dossier, entree.name);
    if (entree.isDirectory()) trouves.push(...sourcesClient(chemin));
    else if (/\.tsx?$/.test(entree.name) && !/\.spec\.tsx?$/.test(entree.name)) trouves.push(chemin);
  }
  return trouves;
}

describe("l'assistant de création de dossier n'annonce plus le SYSCOHADA comme inachevé", () => {
  const wizard = lireClient('components/NouveauFichierWizard.tsx');
  // L'entrée SYSCOHADA du choix de référentiel, de son `valeur:` jusqu'à la
  // fin de son objet · c'est le seul texte que lit celui qui crée un dossier.
  const entree = /\{\s*valeur: 'SYSCOHADA',[\s\S]*?\n {2}\},/.exec(wizard)?.[0];

  it('décrit le SYSCOHADA sans réserve sur ses états financiers', () => {
    expect(entree).toBeTruthy();
    expect({ mention: MOTS_INACHEVE.exec(entree ?? '')?.[0] ?? null }).toEqual({ mention: null });
  });

  it('laisse le référentiel SÉLECTIONNABLE, badge « bientôt » compris', () => {
    // Le badge d'attente et le bouton radio sont commandés par le même
    // `disponible` : le mettre à false rendrait le SYSCOHADA inchoisissable
    // ET rallumerait le badge, alors que ses états existent.
    expect(entree).toContain('disponible: true');
  });
});

describe('la console VMG propose le SYSCOHADA sans réserve', () => {
  const plateforme = lireClient('pages/PlateformePage.tsx');
  const option = /<option value="SYSCOHADA">[\s\S]*?<\/option>/.exec(plateforme)?.[0];

  it("n'accole aucune mention d'inachèvement au libellé du référentiel", () => {
    // Un opérateur de plateforme crée le dossier d'un client payant : lui
    // annoncer des états « en construction » qui existent lui fait refuser
    // une vente.
    expect(option).toBeTruthy();
    expect({ mention: MOTS_INACHEVE.exec(option ?? '')?.[0] ?? null }).toEqual({ mention: null });
  });
});

describe('plus aucune source client ne dit les états SYSCOHADA inachevés', () => {
  it("ne porte nulle part la tournure « états … en construction »", () => {
    // Volontairement plus étroit qu'une interdiction du seul « en
    // construction » : AppShell.tsx porte la tournure dans un commentaire qui
    // la NIE (« plus rien n'est en construction derrière ces deux entrées »),
    // et le wizard garde des badges « bientôt » légitimes sur la sélection
    // partielle de données et le paramétrage manuel, qui, eux, n'existent pas.
    const fautifs = sourcesClient()
      .filter((fichier) => /états?[^.\n]{0,40}en construction/i.test(readFileSync(fichier, 'utf8')))
      .map((fichier) => fichier.slice(racineClient.length + 1));
    expect(fautifs).toEqual([]);
  });
});

describe('les gardes de référentiel du serveur se justifient par ce qui existe', () => {
  it("ne fonde plus le cloisonnement des états SYCEBNL sur un écran d'attente", () => {
    // La garde reste bonne, sa raison avait vieilli : elle ne rend pas vraie
    // une mention « en construction », elle rend vrai l'AIGUILLAGE de la
    // fenêtre commune vers le contrôleur du bon référentiel.
    const controleur = lireServeur('modules/etats-financiers/etats-financiers.controller.ts');
    expect(controleur).toContain('@ReferentielsAutorises(Referentiel.SYCEBNL)');
    expect(MOTS_INACHEVE.test(controleur)).toBe(false);
  });

  it("n'annonce plus à la création d'un dossier SYSCOHADA une liasse à écrire", () => {
    const auth = lireServeur('modules/auth/auth.service.ts');
    expect(MOTS_INACHEVE.test(auth)).toBe(false);
  });
});
