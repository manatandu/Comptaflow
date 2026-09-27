import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { confirmationCloturePeriode } from './cloture-periode';

describe('Clôture de période · la confirmation (audit final F7)', () => {
  it('nomme la date et dit qu’elle est définitive', () => {
    const m = confirmationCloturePeriode('2026-03-31');
    expect([m.includes('31/03/2026'), /DÉFINITIVE/.test(m), /ne s’annule pas/.test(m)]).toEqual([true, true, true]);
  });
});

describe('Clôture de période · l’écran demande la confirmation avant d’envoyer', () => {
  it('le gestionnaire du formulaire confirme avant son premier appel au serveur', () => {
    const page = readFileSync(join(__dirname, '..', 'pages', 'ExercicePage.tsx'), 'utf8');
    const debut = page.indexOf('const clorePeriode = async');
    const corps = page.slice(debut, page.indexOf('api.post(', debut));
    expect(corps).toContain('confirm(confirmationCloturePeriode(dateLimitePeriode))');
  });
});
