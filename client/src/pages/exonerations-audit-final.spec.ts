import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * AUDIT FINAL F123 · le passage à « Accordé » demande l'arrêté. Chaque test
 * découpe le bloc qui porte la propriété, jamais une distance fixe.
 */
const page = readFileSync(join(__dirname, 'ExonerationsPage.tsx'), 'utf8');

function bloc(debut: string, fin: string): string {
  const i = page.indexOf(debut);
  expect(i).toBeGreaterThan(0);
  return page.slice(i, page.indexOf(fin, i));
}

describe('F123 · accorder, c’est dire l’arrêté', () => {
  it('choisir ACCORDÉ ouvre la saisie de l’arrêté au lieu d’enregistrer le seul statut', () => {
    const changer = bloc('const changerStatut = async', 'const enregistrerAccord');
    expect(changer).toContain("if (statut === 'ACCORDE') {");
    expect(changer.indexOf('setAccordPour(dossier.id)')).toBeLessThan(changer.indexOf('api.patch'));
  });

  it('l’accord envoie la référence, la date et, à durée, le début de validité', () => {
    const envoi = bloc('const enregistrerAccord = async', 'setAccordPour(null)');
    expect(envoi).toContain('referenceArrete: refArrete.trim()');
    expect(envoi).toContain('dateArrete: dateArrete || undefined');
    expect(envoi).toContain('dossier.modele.validiteMois && debutArrete ? { dateDebutValidite: debutArrete } : {}');
  });
});
