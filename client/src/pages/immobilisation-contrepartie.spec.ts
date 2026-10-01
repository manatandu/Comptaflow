import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Aucun import de « vitest » · convention du dépôt.

/** La contrepartie d'une acquisition ne se choisit que dans la liste servie pour le compte du bien. */
describe('immobilisation · contrepartie d’acquisition', () => {
  const page = readFileSync(join(__dirname, 'ImmobilisationsPage.tsx'), 'utf8');
  it('la liste vient du serveur, pour le compte du bien, rangée par mode d’acquisition', () => {
    expect(page).toContain('`/immobilisations/contreparties-acquisition?compteImmobilisationId=${iCompteBienId}${type}`');
    expect(page).toContain("const contrepartiesDuMode = (contrepartiesAdmises ?? []).filter((c) => !iModeAcquisition || c.mode === iModeAcquisition);");
    const debut = page.indexOf('value={iCompteContrepartie}');
    expect(page.slice(debut, page.indexOf('</select>', debut))).toContain('contrepartiesDuMode.map');
  });

  it('le type du composant voyage avec la demande · il ouvre le 1984 d’un démantèlement', () => {
    // Passe R1, A2 · la liste servie doit être recalculée quand le type change.
    expect(page).toContain('}, [iCompteBienId, typeComposantServi]);');
    expect(page).toContain('`&typeComposant=${typeComposantServi}`');
  });
});

/** Passe R1, A5 · la contrepartie d'une dépréciation suit la fiche du compte 29. */
describe('immobilisation · contrepartie d’une dépréciation', () => {
  const page = readFileSync(join(__dirname, 'ImmobilisationsPage.tsx'), 'utf8');
  it('SYSCOHADA · 691, 697, 853 à la dotation, 791, 797, 863 à la reprise', () => {
    expect(page).toContain("if (syscohada) return sens === 'DOTATION' ? ['691', '697', '853'] : ['791', '797', '863'];");
    const debut = page.indexOf('value={dContrepartie}');
    expect(page.slice(debut, page.indexOf('</select>', debut))).toContain('racinesContrepartieDepreciation(syscohada, dSens)');
  });
});
