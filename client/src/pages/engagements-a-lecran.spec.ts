import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * LE REGISTRE DES ENGAGEMENTS DOIT ATTEINDRE UN ÉCRAN.
 *
 * AUDCIF art. 22, 1° : les données doivent être « RESTITUÉES sur papier ou
 * sous une forme directement intelligible ». Une correction qui vit dans la
 * charge utile de l'API sans atteindre un écran n'est pas livrée.
 *
 * Ces tests lisent la SOURCE des écrans · le dépôt n'a ni jsdom ni
 * bibliothèque de rendu, et c'est la convention de tous les specs d'écran.
 */

const registre = readFileSync(join(__dirname, 'EngagementsPage.tsx'), 'utf8');
const etats = readFileSync(join(__dirname, 'EtatsFinanciersPage.tsx'), 'utf8');
const fenetres = readFileSync(join(__dirname, '../lib/registre-fenetres.tsx'), 'utf8');
const shell = readFileSync(join(__dirname, '../components/chrome/AppShell.tsx'), 'utf8');

describe("l'écran du registre", () => {
  it("montre le RESTE À EXÉCUTER, et pas seulement le montant engagé", () => {
    // C'est la colonne qui porte la règle du guide : « non exécutés ». Un
    // écran qui n'afficherait que le montant engagé laisserait le comptable
    // croire que la commande pèse entièrement alors qu'elle est facturée.
    expect(registre).toContain('RESTE À EXÉCUTER');
    expect(registre).toContain('resteAExecuter');
    expect(registre).toContain('montantExecute');
  });

  it('offre les deux natures du guide, et pas une troisième', () => {
    const natures = [...registre.matchAll(/valeur: '([A-Z_]+)'/g)].map((m) => m[1]);
    expect(natures).toEqual(['BON_DE_COMMANDE', 'CONTRAT']);
  });

  it("permet de rattacher l'écriture qui exécute, et de la détacher", () => {
    // Sans ce geste, rien ne fait baisser le reste à exécuter et la dépense
    // est comptée deux fois dès que sa facture arrive.
    expect(registre).toContain('/executions');
    expect(registre).toMatch(/onRattacher/);
    expect(registre).toMatch(/onDetacher/);
  });

  it('exige un motif à la clôture', () => {
    expect(registre).toMatch(/Motif de clôture/);
  });

  it("borne la date de saisie à l'exercice, comme le serveur", () => {
    // Le refus est posé au serveur ; l'écran ne fait que l'annoncer, et les
    // deux bouts doivent dire la même chose.
    expect(registre).toContain('min={exerciceCourant?.dateDebut?.slice(0, 10)}');
    expect(registre).toContain('max={exerciceCourant?.dateFin?.slice(0, 10)}');
  });

  it('cite sa source', () => {
    expect(registre).toContain('APPLICATION 22');
  });

  it('dit qu’un engagement non saisi ne pèse pas', () => {
    // Le registre est tenu à la main : taire cette limite ferait croire à une
    // exhaustivité que seul le comptable peut donner.
    expect(registre).toMatch(/n'y est pas saisi ne pèse pas/);
  });

  it("ne déborde pas horizontalement · sa grille large a son défilement", () => {
    const iGrille = registre.indexOf('min-w-[1080px]');
    expect(iGrille).toBeGreaterThan(0);
    // Le conteneur qui l'enveloppe porte overflow-x-auto.
    expect(registre.slice(Math.max(0, iGrille - 200), iGrille)).toContain('overflow-x-auto');
  });
});

describe("le tableau d'exécution budgétaire", () => {
  it('affiche les DEUX moitiés de la colonne Engagement', () => {
    // Le modèle officiel n'a que huit colonnes : la ventilation se dit sous le
    // tableau, elle ne s'y ajoute pas. Mais elle se dit · un réviseur recoupe
    // l'une avec la balance et l'autre avec le registre.
    expect(etats).toContain('total.engagementComptable');
    expect(etats).toContain('total.engagementHorsComptabilite');
    expect(etats).toContain('registre des engagements');
  });
});

describe('le cloisonnement, aux deux bouts', () => {
  it('la fenêtre est réservée au SYCEBNL', () => {
    const i = fenetres.indexOf("motif: /^\\/engagements$/");
    expect(i).toBeGreaterThan(0);
    expect(fenetres.slice(i, i + 260)).toContain("referentielsApplicables: ['SYCEBNL']");
  });

  it("l'entrée de menu est masquée hors SYCEBNL", () => {
    const i = shell.indexOf("navigate('/engagements')");
    expect(i).toBeGreaterThan(0);
    expect(shell.slice(Math.max(0, i - 300), i)).toContain('estSycebnl');
  });
});
