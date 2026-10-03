import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MOTIF_ARRIERES_ET_ELEMENTS,
  corpsEmissionDecompte,
  motifDecompteNonEmissible,
  natureDuBulletin,
  totalVentile,
  ventilationDesAvantages,
  type EtatEmissionDecompte,
} from './decompte-emis';

const PRET: EtatEmissionDecompte = {
  salarieId: 's-1',
  moisDeCessation: '2026-05',
  anneesAnciennete: '3',
  moisNonCouvertsParUnConge: '6',
  arrieresFc: '',
  nombreElementsDuMois: 1,
};

describe('A8 · ce qui manque pour émettre le décompte final', () => {
  it('nomme le décompte comme tel, et le bulletin ordinaire comme avant', () => {
    expect(natureDuBulletin('DECOMPTE_FINAL')).toBe('Décompte final');
    expect(natureDuBulletin('MOIS')).toBe('Bulletin de paie');
    expect(natureDuBulletin(undefined)).toBe('Bulletin de paie');
  });

  it('dit le salarié, puis le mois, et se tait quand tout y est', () => {
    expect(motifDecompteNonEmissible({ ...PRET, salarieId: null })).toContain('salarié');
    expect(motifDecompteNonEmissible({ ...PRET, moisDeCessation: '' })).toContain('mois de cessation');
    expect(motifDecompteNonEmissible({ ...PRET, moisDeCessation: '2026-13' })).toContain('mois de cessation');
    // Un mois tapé avec des espaces est lu rogné, comme le corps l'enverra.
    expect(motifDecompteNonEmissible({ ...PRET, moisDeCessation: ' 2026-05 ' })).toBeNull();
    expect(motifDecompteNonEmissible(PRET)).toBeNull();
  });

  it('(B2) ancienneté et mois non couverts vides refusent le clic · un vide n’est jamais lu zéro', () => {
    expect(motifDecompteNonEmissible({ ...PRET, anneesAnciennete: '' })).toContain('ancienneté');
    expect(motifDecompteNonEmissible({ ...PRET, moisNonCouvertsParUnConge: ' ' })).toContain('mois non couverts');
    // Le zéro DÉCLARÉ, lui, passe.
    expect(motifDecompteNonEmissible({ ...PRET, anneesAnciennete: '0', moisNonCouvertsParUnConge: '0' })).toBeNull();
  });

  it('(B1) des arriérés saisis ET des éléments du mois sont NOMMÉS, jamais effacés', () => {
    expect(motifDecompteNonEmissible({ ...PRET, arrieresFc: '100000' })).toBe(MOTIF_ARRIERES_ET_ELEMENTS);
    // Sans éléments, les arriérés déclarés sont la seule source · ils passent.
    expect(motifDecompteNonEmissible({ ...PRET, arrieresFc: '0', nombreElementsDuMois: 0 })).toBeNull();
  });

  it('des avantages compris dans l’indemnité se ventilent au centime avant le clic', () => {
    expect(motifDecompteNonEmissible({ ...PRET, avantagesFc: 35_000, avantagesVentilesFc: 30_000 })).toContain('Ventilez');
    expect(motifDecompteNonEmissible({ ...PRET, avantagesFc: 35_000, avantagesVentilesFc: 35_000 })).toBeNull();
  });
});

describe('A8 · le corps envoyé à l’émission, construit hors du composant', () => {
  it('(B1) garde les arriérés saisis · le corps ne retire jamais une saisie', () => {
    const c = corpsEmissionDecompte({ anneesAnciennete: 3, arrieresFc: 0 }, { elements: [] }, '2026-05', []);
    expect(c.decompte.arrieresFc).toBe(0);
    expect(c).not.toHaveProperty('ventilationAvantages');
  });

  it('(a) rogne le mois une fois, et le pose aux DEUX moitiés', () => {
    const c = corpsEmissionDecompte({ anneesAnciennete: undefined }, { moisDePaie: '2026-01', elements: [1] }, ' 2026-05 ', []);
    expect(c.decompte.moisDeCessation).toBe('2026-05');
    expect(c.paie.moisDePaie).toBe('2026-05');
    expect(c.paie.elements).toEqual([1]);
    // (B2) un fait non saisi part ABSENT, jamais à zéro.
    expect(c.decompte.anneesAnciennete).toBeUndefined();
  });

  it('joint la ventilation, rattachée à sa rubrique, parts vides retirées', () => {
    const v = ventilationDesAvantages('preavis', { logement: '20 000', transport: '', soins: '0', autres: '15000' });
    expect(v).toEqual([
      { rubrique: 'preavis', nature: 'LOGEMENT_OU_SON_INDEMNITE', libelle: 'Logement compris dans l’indemnité', montantFc: 20_000 },
      { rubrique: 'preavis', nature: 'REMUNERATION', libelle: 'Autres avantages compris dans l’indemnité', montantFc: 15_000 },
    ]);
    expect(corpsEmissionDecompte({}, {}, '2026-05', v).ventilationAvantages).toEqual(v);
    expect(ventilationDesAvantages(null, { logement: '1', transport: '', soins: '', autres: '' })).toEqual([]);
    // La somme se fait au centime, hors de la page.
    expect(totalVentile(v)).toBe(35_000);
    expect(totalVentile(ventilationDesAvantages('preavis', { logement: '0,1', transport: '0,2', soins: '', autres: '' }))).toBe(0.3);
  });
});

describe('A8 · l’écran émet par la règle, pas par une copie', () => {
  const page = readFileSync(join(__dirname, '..', 'pages', 'PersonnelPage.tsx'), 'utf8');
  const debut = page.indexOf('const emettreDecompte = () =>');
  const corps = page.slice(debut, page.indexOf('\n  };\n', debut));

  it('construit le corps par corpsEmissionDecompte et ne retire aucun champ saisi', () => {
    expect(corps).toContain('corpsEmissionDecompte(corpsDecompte(), corpsSimulation(), dec.moisDeCessation, ventilation)');
    expect(corps).toContain('/decompte-final`');
    expect(corps).not.toContain('arrieresFc: undefined');
  });

  it('(a, c) rejoue la garde du bouton et refuse un second envoi', () => {
    expect(corps).toContain('motifEmissionDecompte !== null || emissionDecompteEnVol.current');
  });

  it('(d) jette une réponse dont le jeton a changé', () => {
    expect(corps).toContain('jeton !== jetonEmissionDecompte.current');
  });

  it("(f) l'Aide ne dit plus que l'écran n'émet pas", () => {
    expect(page).toContain('« Émettre le décompte final » fige le décompte écrit');
  });

  it('(B2) le corps du décompte n’envoie plus de zéro pour un champ vide', () => {
    const d = page.indexOf('const corpsDecompte = () =>');
    const corpsDecompte = page.slice(d, page.indexOf('\n  };\n', d));
    expect(corpsDecompte).toContain('anneesAnciennete: nombre(dec.anneesAnciennete),');
    expect(corpsDecompte).toContain('moisNonCouvertsParUnConge: nombre(dec.moisNonCouvertsParUnConge),');
  });
});
