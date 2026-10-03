import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * LIGNE A10 · LE PV DE CAISSE À L'ÉCRAN.
 *
 * Deux défauts qu'aucune autre suite ne verrait. (1) Le solde comparé se
 * saisissait, proposé sur l'exercice entier, et le serveur le figeait tel
 * quel · il est désormais LU par le serveur au livre-journal du jour du
 * comptage (fiche du compte 57), et l'écran ne doit plus rien envoyer de tel.
 * (2) Les PV établis n'étaient montrés nulle part · leur reconstitution vers
 * la clôture doit rester lisible après la clôture de la campagne, quand le
 * bloc des caisses à compter disparaît.
 */

const page = readFileSync(join(__dirname, 'InventairePage.tsx'), 'utf8');

/** Le corps d'une fonction de la page, découpé à la fonction suivante. */
function corpsDe(nom: string): string {
  const debut = page.indexOf(`function ${nom}(`);
  expect([`${nom} absente`, debut >= 0]).toEqual([`${nom} absente`, true]);
  const suite = page.indexOf('\nfunction ', debut + 1);
  return page.slice(debut, suite === -1 ? undefined : suite);
}

describe('ligne A10 · le PV de caisse', () => {
  it('le formulaire n’envoie et ne saisit aucun solde comptable', () => {
    const formulaire = corpsDe('FormulairePvCaisse');
    expect(formulaire).not.toMatch(/soldeComptable\s*:/);
    expect(formulaire).not.toMatch(/setSolde\(/);
  });

  it('les PV établis se montrent hors de la garde « campagne non close »', () => {
    const appel = page.indexOf('<BlocPvCaisse');
    expect(appel).toBeGreaterThan(0);
    // La garde du bloc des caisses à compter se referme AVANT l'appel.
    const garde = page.lastIndexOf("detail.statut !== 'CLOTUREE' && (", appel);
    const fermeture = page.indexOf(')}', garde);
    expect(fermeture).toBeLessThan(appel);
  });

  it('la reconstitution affiche les totaux figés et les espèces à la clôture', () => {
    const pv = corpsDe('PvCaisse');
    for (const champ of [
      'pv.soldeALaCloture',
      'pv.encaissementsPosterieurs',
      'pv.decaissementsPosterieurs',
      'pv.soldeComptableFige',
      'pv.especesReconstitueesALaCloture',
      'pv.reconstitutionManquante',
    ]) {
      expect([champ, pv.includes(champ)]).toEqual([champ, true]);
    }
  });

  it('un échec de lecture des mouvements se dit, et une liste tronquée le dit', () => {
    const pv = corpsDe('PvCaisse');
    expect(pv).toContain('Mouvements illisibles');
    expect(pv).toContain('mouvements.tronque');
    expect(pv).toContain('mouvements.concorde === false');
  });
});
