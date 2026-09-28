import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mentionANouveauxEcartes, mentionFonduesDansLeDepart, motifOuvertureBloquante } from './rapprochement-a-nouveau';

// Aucun import de « vitest » · convention du dépôt, `globals` fournit describe,
// it et expect.

/**
 * AUDIT FINAL F205, LE RESTE · le serveur écarte du pointage les reports
 * à-nouveau qui recopient un solde, et il les compte (`aNouveauEcartes`,
 * `RapprochementService.obtenir`). L'écran n'en disait rien : la ligne
 * disparaissait de la fenêtre, et un compte dont le seul mouvement était un
 * à-nouveau s'affichait « Aucun mouvement pointable », sans dire pourquoi.
 */
describe('les reports à-nouveau écartés du pointage se disent', () => {
  it('un seul report se dit au singulier', () => {
    expect(mentionANouveauxEcartes(1)).toBe('1 report à-nouveau écarté du pointage.');
  });

  it('plusieurs reports se disent au pluriel, avec leur nombre', () => {
    expect(mentionANouveauxEcartes(2)).toBe('2 reports à-nouveau écartés du pointage.');
    expect(mentionANouveauxEcartes(1250)).toBe(`${(1250).toLocaleString('fr-FR')} reports à-nouveau écartés du pointage.`);
  });

  it('zéro est une réponse lue · rien à dire', () => {
    expect(mentionANouveauxEcartes(0)).toBeNull();
  });
});

describe("la fenêtre du rapprochement porte la mention que le serveur compte", () => {
  const page = readFileSync(join(__dirname, '../pages/RapprochementDetailPage.tsx'), 'utf8');

  it('le nombre servi par le serveur passe par la règle, et la mention est rendue', () => {
    expect(page).toContain('mentionANouveauxEcartes(detail.aNouveauEcartes)');
    expect(page).toContain('{mentionANouveau && (');
    expect(page).toContain('<span>{mentionANouveau}</span>');
  });

  it('le type du détail porte le compte que le serveur rend', () => {
    const types = readFileSync(join(__dirname, 'types.ts'), 'utf8');
    const debut = types.indexOf('export interface DetailRapprochement');
    expect(debut).toBeGreaterThan(0);
    const fin = types.indexOf('\n}', debut);
    expect(types.slice(debut, fin)).toContain('aNouveauEcartes: number;');
  });
});

describe('le premier rapprochement · lignes fondues et ouverture bloquante', () => {
  it('les lignes fondues dans le départ se disent, le nombre seul', () => {
    expect(mentionFonduesDansLeDepart(undefined)).toBeNull();
    expect(mentionFonduesDansLeDepart(0)).toBeNull();
    expect(mentionFonduesDansLeDepart(1)).toBe('1 ligne antérieure à la date de départ, comprise dans le solde de départ.');
    expect(mentionFonduesDansLeDepart(3)).toBe('3 lignes antérieures à la date de départ, comprises dans le solde de départ.');
  });

  it('la clôture du premier rapprochement suit le serveur · départ déclaré, écart d’ouverture nul', () => {
    const o = (x: Partial<{ soldeDepart: number | null; ecart: number | null; motif: string | null }>) => ({
      premier: true,
      ouverture: { soldeDepart: 1300, ecart: 0, motif: null, ...x },
    });
    expect(motifOuvertureBloquante(o({}))).toBeNull();
    expect(motifOuvertureBloquante(o({ soldeDepart: null, ecart: null }))).toBe('Déclarez le solde de départ lu sur le relevé.');
    expect(motifOuvertureBloquante(o({ ecart: null, motif: 'Aucun exercice.' }))).toBe('Aucun exercice.');
    expect(motifOuvertureBloquante(o({ ecart: -50 }))).toBe("L'écart d'ouverture n'est pas nul.");
    // Un rapprochement suivant n'a pas d'ouverture à juger.
    expect(motifOuvertureBloquante({ premier: false, ouverture: null })).toBeNull();
  });

  const page = readFileSync(join(__dirname, '../pages/RapprochementDetailPage.tsx'), 'utf8');

  it('le bouton de clôture lit l’ouverture, et la réouverture est réservée à l’administrateur', () => {
    expect(page).toContain('disabled={!detail.equilibre || ouvertureBloquante !== null || envoi}');
    expect(page).toContain("{estAdmin && detail.rapprochement.statut === 'CLOTURE' && (");
    expect(page).toContain('api.post(`/rapprochements/${id}/rouvrir`, { motif: reouverture })');
  });

  it('la correspondance envoie les en-cours à part des lignes d’écriture', () => {
    expect(page).toContain('encoursIds: [...choixEncours]');
    expect(page).toContain('encoursIds: p.encoursIds ?? []');
  });
});
