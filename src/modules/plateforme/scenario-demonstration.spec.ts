import { Referentiel, TypeTiers } from '@prisma/client';
import { scenarioDemonstration } from './scenario-demonstration';
import { MODELES_SIMPLES_SYCEBNL, MODELES_SIMPLES_SYSCOHADA } from '../../../client/src/lib/modeles-saisie';
import { numeroCollectif } from '../tiers/collectifs-tiers';

/**
 * LE SCÉNARIO N'INVENTE AUCUN NUMÉRO · chaque compte de nature employé figure
 * dans les modèles de saisie du même référentiel, DANS LE MÊME SENS. Ces
 * modèles sont vérifiés contre les plans semés et sourcés au Guide
 * d'application · un numéro qui n'y figurerait pas serait une règle écrite
 * de mémoire, dans la vitrine même du logiciel.
 */
describe.each([
  [Referentiel.SYCEBNL, MODELES_SIMPLES_SYCEBNL],
  [Referentiel.SYSCOHADA, MODELES_SIMPLES_SYSCOHADA],
])('scénario de démonstration %s', (referentiel, modeles) => {
  const s = scenarioDemonstration(referentiel);
  const admis = new Set(modeles.flatMap((m) => m.lignes.filter((l) => l.numero).map((l) => `${l.numero}:${l.sens}`)));

  it('chaque compte de nature vient des modèles de saisie, dans le même sens', () => {
    for (const op of s.operations) {
      for (const l of op.lignes) {
        if ('nature' in l) expect([op.libelle, admis.has(`${l.nature}:${l.sens}`)]).toEqual([op.libelle, true]);
      }
    }
  });

  it('chaque tiers employé est déclaré, et son type a un collectif dans ce référentiel', () => {
    const codes = new Set(s.tiers.map((t) => t.code));
    for (const op of s.operations) for (const l of op.lignes) if ('tiers' in l) expect(codes.has(l.tiers)).toBe(true);
    for (const t of s.tiers) expect(numeroCollectif(referentiel, t.type)).not.toBeNull();
  });

  it('chaque opération s’équilibre, et la facture précède son règlement', () => {
    for (const op of s.operations) {
      const d = op.lignes.filter((l) => l.sens === 'DEBIT').reduce((a, l) => a + l.montant, 0);
      const c = op.lignes.filter((l) => l.sens === 'CREDIT').reduce((a, l) => a + l.montant, 0);
      expect([op.libelle, d]).toEqual([op.libelle, c]);
    }
    const jours = s.operations.map((o) => o.jour);
    expect([...jours].sort()).toEqual(jours);
  });

  it('la banque ne passe jamais sous zéro, et une facture reste ouverte à dessein', () => {
    let banque = 0;
    for (const op of s.operations) {
      for (const l of op.lignes) if ('tresorerie' in l) banque += l.sens === 'DEBIT' ? l.montant : -l.montant;
      expect([op.libelle, banque >= 0]).toEqual([op.libelle, true]);
    }
    const soldes = new Map<string, number>();
    for (const op of s.operations) for (const l of op.lignes) if ('tiers' in l) soldes.set(l.tiers, (soldes.get(l.tiers) ?? 0) + (l.sens === 'DEBIT' ? l.montant : -l.montant));
    expect([...soldes.values()].some((v) => v !== 0)).toBe(true);
  });

  it('se dit fictif, dans son nom et son activité', () => {
    expect(s.nomEntite).toMatch(/démonstration/);
    expect(s.activite).toMatch(/fictive/);
    expect(s.tiers.every((t) => /fictif/.test(t.nom))).toBe(true);
  });
});

it('l’adhérent n’existe qu’au SYCEBNL', () => {
  expect(scenarioDemonstration(Referentiel.SYSCOHADA).tiers.some((t) => t.type === TypeTiers.ADHERENT)).toBe(false);
});
