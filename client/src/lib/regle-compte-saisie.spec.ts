import { libelleRenvoiDiscordant, remplacementsProposes } from './regle-compte-saisie';

// Aucun import de « vitest » · convention du dépôt.

describe('remplacements proposés à la saisie (R5-B4)', () => {
  it('une saisie au 104 ne se voit pas proposer le 104', () => {
    expect(remplacementsProposes(['104', '16', '46'], '10410000')).toEqual(['16', '46']);
  });
  it('une saisie au 101 garde toute la liste', () => {
    expect(remplacementsProposes(['104', '16', '46'], '10110000')).toEqual(['104', '16', '46']);
  });
});

describe('renvoi discordant (R5-A1, R5-C1)', () => {
  it('nomme les deux intitulés sans choisir de numéro', () => {
    expect(
      libelleRenvoiDiscordant({ numero: '16', intituleCite: 'Emprunts et dettes assimilées', intitulePlan: 'Fonds affectés' }),
    ).toBe('le texte renvoie au 16 « Emprunts et dettes assimilées », que le plan intitule « Fonds affectés »');
  });
});

describe('câblage de l’écran de saisie', () => {
  it('SaisiePage filtre la liste et nomme les renvois discordants', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const source = readFileSync(join(__dirname, '../pages/SaisiePage.tsx'), 'utf8');
    expect(source).toContain('remplacementsProposes(regleDuCompte.comptesAUtiliser, compteChoisi.numero)');
    expect(source).toContain('libelleRenvoiDiscordant(d)');
  });
});
