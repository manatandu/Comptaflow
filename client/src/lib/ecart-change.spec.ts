// Aucun import de « vitest » · convention du dépôt, le spec tourne aussi sous jest.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  compteAdmisPourEcart,
  comptesProposablesEcart,
  corpsReglementEnDevise,
  ecartEstime,
  libelleEcartRealise,
  natureDuCompte,
  nombreSaisi,
  racinesAdmises,
  type NatureCreanceDette,
  type Referentiel,
  type SensEcart,
} from './ecart-change';

/**
 * UNE SEULE TABLE POUR LE SERVEUR ET L'ÉCRAN (relecture adverse, mineur 3) ·
 * les cas sont LUS dans le spec du serveur (`CAS_ADMIS`) et rejoués ici sur
 * la recopie de l'écran · un compte que l'écran proposerait et que le serveur
 * refuserait, ou l'inverse, fait tomber ce test.
 */
const SPEC_SERVEUR = join(__dirname, '../../../src/modules/reglements/ecart-change-realise.spec.ts');

function casDuServeur(): Array<[Referentiel, NatureCreanceDette | null, SensEcart, string, boolean]> {
  const source = readFileSync(SPEC_SERVEUR, 'utf8');
  const bloc = source.slice(source.indexOf('export const CAS_ADMIS'), source.indexOf('];', source.indexOf('export const CAS_ADMIS')));
  const lignes = [...bloc.matchAll(/\['(SYSCOHADA|SYCEBNL)', (?:'(COMMERCIALE|FINANCIERE)'|null), '(PERTE|GAIN)', '(\d+)', (true|false)\]/g)];
  return lignes.map((m) => [m[1] as Referentiel, (m[2] ?? null) as NatureCreanceDette | null, m[3] as SensEcart, m[4], m[5] === 'true']);
}

describe('les comptes admis pour l’écart, la table du serveur rejouée à l’écran', () => {
  const cas = casDuServeur();

  it('la table est lue, et elle n’est pas vide', () => {
    expect(cas.length).toBeGreaterThanOrEqual(20);
  });

  it('chaque cas du serveur donne la même réponse à l’écran', () => {
    for (const [referentiel, nature, sens, numero, admis] of cas) {
      expect([referentiel, nature, sens, numero, compteAdmisPourEcart(racinesAdmises(referentiel, nature, sens), numero)]).toEqual([
        referentiel,
        nature,
        sens,
        numero,
        admis,
      ]);
    }
  });
});

const plan = ['65800000', '65910000', '67600000', '75880000', '75910000', '77600000', '65110000', '60110000'].map((numero) => ({ numero }));

describe('comptes proposables pour un écart de change', () => {
  it('SYCEBNL commercial, une perte · sous le 65 hors 659, jamais le 676', () => {
    expect(comptesProposablesEcart(plan, { referentiel: 'SYCEBNL', nature: 'COMMERCIALE', sens: 'PERTE' }).map((c) => c.numero)).toEqual([
      '65800000',
      '65110000',
    ]);
  });

  it('SYCEBNL commercial, un gain · sous le 75 hors 759, jamais le 776', () => {
    expect(comptesProposablesEcart(plan, { referentiel: 'SYCEBNL', nature: 'COMMERCIALE', sens: 'GAIN' }).map((c) => c.numero)).toEqual(['75880000']);
  });

  it('nature non lue · les comptes de change, jamais un 601', () => {
    const r = comptesProposablesEcart(plan, { referentiel: 'SYCEBNL', nature: null, sens: 'PERTE' }).map((c) => c.numero);
    expect(r).toEqual(['65800000', '67600000', '65110000']);
    expect(r).not.toContain('60110000');
  });

  it('la nature lue à l’écran comme au serveur · le 16 du SYCEBNL est un fonds', () => {
    expect(natureDuCompte('40110000', 'SYCEBNL')).toBe('COMMERCIALE');
    expect(natureDuCompte('16200000', 'SYCEBNL')).toBeNull();
    expect(natureDuCompte('16200000', 'SYSCOHADA')).toBe('FINANCIERE');
    expect(natureDuCompte('17200000', 'SYSCOHADA')).toBe('FINANCIERE');
    expect(natureDuCompte('18710000', 'SYCEBNL')).toBe('FINANCIERE');
  });
});

describe('l’écart estimé, pour savoir s’il s’agit d’une perte ou d’un gain', () => {
  const factures = [{ francs: 1_948_800, montantDevise: 1160, date: '2026-04-10' }];

  it('MBIKAYI paie 600 USD à 1 750 · perte de 42 000', () => {
    expect(ecartEstime({ sens: 'FOURNISSEUR', factures, montantDevise: 600, francsPayes: 1_050_000 })).toBe(42_000);
  });

  it('NZUZI encaisse 600 USD à 1 750 · gain de 42 000', () => {
    expect(ecartEstime({ sens: 'CLIENT', factures, montantDevise: 600, francsPayes: 1_050_000 })).toBe(-42_000);
  });

  it('le libellé s’accorde', () => {
    expect(libelleEcartRealise(1)).toBe('Perte de change réalisée');
    expect(libelleEcartRealise(-1)).toBe('Gain de change réalisé');
  });
});

describe('le corps du règlement en devise', () => {
  it('ni cours ni francs · refus ; montant en devise facultatif', () => {
    expect(corpsReglementEnDevise({ compteId: 'c', ligneIds: ['f'], montantDevise: '', cours: '', compteEcartChangeId: undefined, reference: undefined }).motif).toMatch(
      /cours du jour du règlement, ou le montant réellement payé en francs/,
    );
    const { corps } = corpsReglementEnDevise({ compteId: 'c', ligneIds: ['f'], montantDevise: '600', cours: '1 750', compteEcartChangeId: 'k', reference: 'CHQ 1' });
    expect(corps).toEqual({ compteId: 'c', ligneIds: ['f'], coursReglement: 1750, montantDevise: 600, compteEcartChangeId: 'k', reference: 'CHQ 1' });
    expect(corps).not.toHaveProperty('montant');
  });

  it('le débit réel en francs, sans cours · envoyé tel quel, le serveur déduit le cours', () => {
    const { corps } = corpsReglementEnDevise({
      compteId: 'c',
      ligneIds: ['f'],
      montantDevise: '600',
      cours: '',
      montantFrancs: '1 050 010',
      compteEcartChangeId: undefined,
      reference: undefined,
    });
    expect(corps).toEqual({ compteId: 'c', ligneIds: ['f'], montant: 1_050_010, montantDevise: 600 });
  });

  it('des francs sans montant en devise · refusés avant l’envoi', () => {
    expect(
      corpsReglementEnDevise({ compteId: 'c', ligneIds: ['f'], montantDevise: '', cours: '', montantFrancs: '500 000', compteEcartChangeId: undefined, reference: undefined }).motif,
    ).toMatch(/saisissez aussi le montant réglé en devise/);
  });

  it('lit un nombre à la française, et vide n’est pas zéro', () => {
    expect(nombreSaisi('1 750,5')).toBe(1750.5);
    expect(nombreSaisi('')).toBeNull();
    expect(nombreSaisi('abc')).toBeNull();
  });
});

/**
 * Relecture adverse, mineur 4 · la colonne « Écart de change » du lettrage
 * ne cumule que ce qu'OmegaX a passé (règlement en devise, écart proposé) ·
 * l'infobulle le dit, faute de quoi une ligne 656 saisie à la main passerait
 * pour comptée. On gèle la PRÉSENCE de la phrase, aux deux états du groupe.
 */
describe('l’infobulle du réalisé au lettrage', () => {
  it('dit que les lignes d’écart saisies à la main ne sont pas comptées', () => {
    const source = readFileSync(join(__dirname, '../pages/LettragePage.tsx'), 'utf8');
    expect(source.match(/passé par OmegaX/g)?.length).toBe(2);
    expect(source.match(/saisie à la main n'y est pas comptée/g)?.length).toBe(2);
  });
});

/**
 * Troisième relecture · le refus du règlement d'une facture déjà réévaluée
 * (409 nommé du serveur) s'affiche TEL QUEL · aucun message générique ne le
 * remplace. On lit le CORPS de `enregistrer`, jamais une distance.
 */
describe('le refus du règlement s’affiche tel quel', () => {
  it('enregistrer rend le message du serveur, sans le réécrire', () => {
    const source = readFileSync(join(__dirname, '../pages/ReglementsPage.tsx'), 'utf8');
    const debut = source.indexOf('const enregistrer = async () => {');
    const corps = source.slice(debut, source.indexOf('\n  };\n', debut));
    expect(corps).toContain("setErreur(err instanceof ApiError ? err.message : 'Règlements non enregistrés')");
    expect(corps).not.toMatch(/status === 409/);
  });
});

/**
 * Quatrième relecture, M3 · l'avertissement « réévaluation non contre-passée »
 * revient avec un règlement PASSÉ · l'écran l'affiche, il ne le jette pas.
 */
describe('les avertissements d’un règlement passé s’affichent', () => {
  it('enregistrer garde les avertissements du serveur et l’écran les rend', () => {
    const source = readFileSync(join(__dirname, '../pages/ReglementsPage.tsx'), 'utf8');
    const debut = source.indexOf('const enregistrer = async () => {');
    const corps = source.slice(debut, source.indexOf('\n  };\n', debut));
    expect(corps).toContain('setAvertissements(r.avertissements ?? [])');
    expect(source).toMatch(/\{avertissements\.map\(\(a\) => \(/);
  });
});
