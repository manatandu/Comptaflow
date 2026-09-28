import { readFileSync } from 'fs';
import { join } from 'path';
import { libelleExercice } from './libelle-exercice';

// Pas d'import de « vitest » · convention du dépôt (voir calcul.spec.ts).

/**
 * UN EXERCICE, UN LIBELLÉ (audit final F250).
 *
 * La barre de titre écrivait l'année de début, le sélecteur de la barre de
 * statut « début-fin » · sur un premier exercice de dix-huit mois, le même
 * écran annonçait deux exercices. La règle vit une fois
 * (`lib/libelle-exercice.ts`), et ce spec gèle les APPELS des trois endroits
 * du chrome qui l'affichent, lus sur la source faute de monter React · un
 * endroit qui reprendrait sa propre écriture perdrait l'appel figé ici.
 */

const CLIENT = join(__dirname, '..');
const lire = (p: string) => readFileSync(join(CLIENT, p), 'utf8');

describe('le libellé d’un exercice', () => {
  it('un exercice de l’année civile se lit sur son année', () => {
    expect(libelleExercice({ dateDebut: '2026-01-01T00:00:00.000Z', dateFin: '2026-12-31T00:00:00.000Z' })).toBe('2026');
  });

  it('un exercice à cheval sur deux années se lit « début-fin » · AUDCIF art. 7, premier exercice long', () => {
    expect(libelleExercice({ dateDebut: '2026-07-01T00:00:00.000Z', dateFin: '2027-12-31T00:00:00.000Z' })).toBe('2026-2027');
  });

  it('l’année se lit en UTC · un exercice ouvert à minuit UTC le 1er janvier reste de son année', () => {
    // Le fuseau d'un processus se fixe à son démarrage (CLAUDE.md, audit
    // final F81) · l'heure locale d'un poste à cinq heures à l'ouest de
    // Greenwich est simulée sur la seule lecture de l'année locale, qu'une
    // écriture fautive emprunterait. Lue ainsi, l'ouverture du 1er janvier
    // 2026 à minuit UTC tombe en 2025.
    const origine = Date.prototype.getFullYear;
    Date.prototype.getFullYear = function (this: Date) {
      return origine.call(new Date(this.getTime() - 5 * 3_600_000));
    };
    try {
      expect(libelleExercice({ dateDebut: '2026-01-01T00:00:00.000Z', dateFin: '2026-12-31T00:00:00.000Z' })).toBe('2026');
    } finally {
      Date.prototype.getFullYear = origine;
    }
  });
});

describe('le chrome l’appelle aux trois endroits où il affiche l’exercice', () => {
  it('la barre de titre', () => {
    const shell = lire('components/chrome/AppShell.tsx');
    expect(shell).toContain("import { libelleExercice } from '../../lib/libelle-exercice';");
    expect(shell).toContain('const exerciceAffiche = exerciceCourant ? libelleExercice(exerciceCourant) : null;');
    // Le bloc de la barre de titre, de son commentaire au bouton de déconnexion.
    const barre = shell.slice(shell.indexOf('Barre de titre ·'), shell.indexOf('Déconnexion\n'));
    expect(barre).toContain('Exercice {exerciceAffiche}');
  });

  it('le sélecteur de la barre de statut, libellé seul et chaque option de la liste', () => {
    const selecteur = lire('components/chrome/SelecteurExercice.tsx');
    expect(selecteur).toContain("import { libelleExercice } from '../../lib/libelle-exercice';");
    expect(selecteur).toContain('· Exercice {libelleExercice(exerciceCourant)}');
    const liste = selecteur.slice(selecteur.indexOf('{exercices.map((e) => ('), selecteur.indexOf('</select>'));
    expect(liste).toContain('{libelleExercice(e)}');
  });

  it('l’accueil, qui l’affiche sous la barre de titre', () => {
    const accueil = lire('pages/AccueilPage.tsx');
    expect(accueil).toContain('const exerciceAffiche = exerciceCourant ? libelleExercice(exerciceCourant) : null;');
    expect(accueil).toContain("<dd>{exerciceAffiche ?? 'Aucun'}</dd>");
  });
});
