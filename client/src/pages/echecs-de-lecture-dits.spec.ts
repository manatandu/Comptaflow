import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Aucun import de « vitest » (globales) · convention du dépôt.

/**
 * AUDIT FINAL F181, F183, F184 · UN ÉCHEC DE LECTURE SE DIT.
 *
 * Trois écrans lisaient un refus comme une réponse · « Chargement… » pour
 * toujours, « Aucune caisse sans procès-verbal », « Aucun mandat
 * enregistré ». Les deux derniers sont la réponse FAVORABLE à la question que
 * l'écran pose. D'où la même règle partout · la liste part de null, un échec
 * s'affiche, et « aucun » ne se dit que sur une liste lue.
 */
const lire = (fichier: string) => readFileSync(join(__dirname, fichier), 'utf8');

describe('tableau de bord · un refus n’est pas un chargement (F181)', () => {
  const source = lire('DashboardPage.tsx');

  it('chaque lecture a son second argument, qui pose l’erreur', () => {
    expect(source).toContain("setErreurEcritures(e instanceof Error ? e.message : 'Les dernières écritures n’ont pas pu être lues.')");
    expect(source).toContain("setErreurBalance(e instanceof Error ? e.message : 'La balance n’a pas pu être lue.')");
  });

  it('l’erreur se lit à l’écran, AVANT « Chargement… »', () => {
    expect(source).toContain('Dernières écritures illisibles · {erreurEcritures}');
    expect(source).toContain('Indicateurs indisponibles · {erreurBalance}');
    const erreur = source.indexOf('{erreurEcritures ? (');
    const chargement = source.indexOf('>Chargement…</div>');
    expect(erreur).toBeGreaterThan(-1);
    expect(chargement).toBeGreaterThan(erreur);
  });
});

describe('inventaire · une caisse illisible n’est pas une caisse comptée (F183)', () => {
  const source = lire('InventairePage.tsx');

  it('la liste part de null, et un échec la remet à null avec son motif', () => {
    expect(source).toContain('useState<CaisseNonComptee[] | null>(null)');
    const debut = source.indexOf('const chargerCaisses = (id: string) =>');
    const corps = source.slice(debut, source.indexOf('\n  };', debut));
    expect(corps).toContain('setCaisses(null);');
    expect(corps).toContain('setErreurCaisses(');
  });

  it('« Aucune caisse » ne se dit que sur une liste lue', () => {
    const erreur = source.indexOf('Liste des caisses illisible · {erreur}');
    const lecture = source.indexOf(') : caisses === null ? (');
    const vide = source.indexOf('Aucune caisse à solde non nul sans procès-verbal.');
    expect(erreur).toBeGreaterThan(-1);
    expect(lecture).toBeGreaterThan(erreur);
    expect(vide).toBeGreaterThan(lecture);
  });
});

describe('mandat · un échec n’est pas une absence de mandat (F184)', () => {
  const source = lire('MandatAuditeurPage.tsx');

  it('la liste part de null, et la relecture pose l’erreur au lieu de lever', () => {
    expect(source).toContain('useState<Mandat[] | null>(null)');
    const debut = source.indexOf('const recharger = () =>');
    const corps = source.slice(debut, source.indexOf('\n    );', debut));
    expect(corps).toContain('setErreurLecture(');
  });

  it('« Aucun mandat » ne se dit que sur une liste lue', () => {
    const erreur = source.indexOf('Liste des mandats illisible · {erreurLecture}');
    const lecture = source.indexOf(') : mandats === null ? (');
    const vide = source.indexOf('Aucun mandat enregistré.');
    expect(erreur).toBeGreaterThan(-1);
    expect(lecture).toBeGreaterThan(erreur);
    expect(vide).toBeGreaterThan(lecture);
  });

  it('le rang ne se compte jamais sur une liste non lue', () => {
    const debut = source.indexOf('async function enregistrer()');
    const corps = source.slice(debut, source.indexOf('await api.post', debut));
    expect(corps).toContain('if (mandats === null) {');
  });
});
