import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { corpsSimulation, saisieInitiale } from './location-acquisition';
import { corpsCriteres, CRITERES, criteresVides } from './criteres-frais-developpement';

/**
 * LOT 15 · ce que l'écran envoie · la garantie de valeur résiduelle et le
 * loyer indexé du crédit-bail (AUDCIF Titre VIII ch. 8 § 2.1.2), et les six
 * critères des frais de développement (ch. 1 § 2.1.1), que le serveur juge.
 */
const saisie = { ...saisieInitiale('2026-01-01'), dureeMois: '96', periodicite: 'ANNUELLE' as const, loyer: '90000', tauxPourcent: '7,86', optionRaisonnablementCertaine: true };

describe('crédit-bail · garantie et loyer indexé', () => {
  it('la garantie part en nombre, zéro par défaut', () => {
    expect(corpsSimulation('c1', saisie)!.garantieValeurResiduelle).toBe(0);
    expect(corpsSimulation('c1', { ...saisie, garantieValeurResiduelle: '50000' })!.garantieValeurResiduelle).toBe(50000);
  });
  it('un loyer indexé ne part qu’avec son indice et sa valeur à la prise d’effet', () => {
    expect(corpsSimulation('c1', { ...saisie, loyerIndexe: true, indiceLoyer: '', valeurIndiceCommencement: '100' })).toBeNull();
    expect(corpsSimulation('c1', { ...saisie, loyerIndexe: true, indiceLoyer: 'IPC', valeurIndiceCommencement: '' })).toBeNull();
    const c = corpsSimulation('c1', { ...saisie, loyerIndexe: true, indiceLoyer: ' IPC ', valeurIndiceCommencement: '112,4' })!;
    expect(c).toMatchObject({ loyerIndexe: true, indiceLoyer: 'IPC', valeurIndiceCommencement: 112.4 });
    expect(corpsSimulation('c1', saisie)!.loyerIndexe).toBeUndefined();
  });
});

describe('frais de développement · six critères', () => {
  it('les six critères, dans l’ordre du texte', () => {
    expect(CRITERES.map((c) => c.cle)).toEqual([
      'FAISABILITE_TECHNIQUE',
      'INTENTION',
      'CAPACITE',
      'AVANTAGES_ECONOMIQUES',
      'RESSOURCES',
      'EVALUATION_FIABLE',
    ]);
  });
  it('seules les justifications écrites partent, avec la date de réunion', () => {
    expect(corpsCriteres(criteresVides(), '')).toEqual({});
    const c = corpsCriteres({ ...criteresVides(), INTENTION: ' oui ' }, '2026-05-01');
    expect(c).toEqual({ criteresFraisDeveloppement: { INTENTION: 'oui' }, dateReunionCriteresDeveloppement: '2026-05-01' });
  });
});

describe('écrans du lot 15 · ce que le serveur refuserait n’est pas proposé', () => {
  const demantelement = readFileSync(join(__dirname, '..', 'components', 'Demantelement.tsx'), 'utf8');
  const page = readFileSync(join(__dirname, '..', 'pages', 'ImmobilisationsPage.tsx'), 'utf8');

  it('la reprise n’est plus offerte une fois faite, et le composant repris le dit', () => {
    expect(demantelement).toContain('{etat.reprise && !etat.repriseFaite && (');
    expect(demantelement).toContain('etat.composantRepris ?');
  });

  it('une liste de journaux vide dit quoi faire d’abord (§ 9 ter)', () => {
    expect(demantelement).toContain('journaux.length === 0 ?');
  });

  it('le reclassement vers le 211 envoie les six critères, comme la création', () => {
    // Découpe du corps de onReclasser · la propriété, jamais une distance.
    const debut = page.indexOf('const onReclasser = async');
    const corps = page.slice(debut, page.indexOf('\n  };\n', debut));
    expect(corps).toContain('versFraisDeveloppement(immoId) ? corpsCriteres(rcCriteresRd, rcDateCriteresRd)');
  });
});
