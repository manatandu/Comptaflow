import { Referentiel, TypeTiers } from '@prisma/client';
import { mouvementsBanque, scenarioDemonstration } from './scenario-demonstration';
import { FAMILLES_IMMOBILISATION_DEFAUT, FAMILLES_IMMOBILISATION_DEFAUT_SYSCOHADA } from '../immobilisations/famille-immobilisation-seed';
import { join } from 'path';
import { numeroCollectif } from '../tiers/collectifs-tiers';

// Chargés par Jest, JAMAIS importés · un `import` statique vers client/ fait
// compiler l'interface par `nest build`, qui range alors le serveur sous
// dist/src/ (plus de dist/main.js), et l'image Docker, qui ne copie pas
// client/, ne compile plus du tout. Panne du déploiement du 2026-09-26.
type ModeleSimple = { lignes: { numero?: string; sens: string }[] };
const { MODELES_SIMPLES_SYCEBNL, MODELES_SIMPLES_SYSCOHADA } = require(join(__dirname, '../../../client/src/lib/modeles-saisie')) as {
  MODELES_SIMPLES_SYCEBNL: ModeleSimple[];
  MODELES_SIMPLES_SYSCOHADA: ModeleSimple[];
};

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

  it('la banque ne passe jamais sous zéro, acquisitions comptant comprises, et une facture reste ouverte à dessein', () => {
    let banque = 0;
    const mouvements = mouvementsBanque(s);
    // La lecture commune compte les opérations ET les biens payés comptant.
    expect(mouvements.length).toBe(
      s.operations.reduce((a, o) => a + o.lignes.filter((l) => 'tresorerie' in l).length, 0) + s.immobilisations.length,
    );
    for (const m of mouvements) {
      banque += m.montant;
      expect([m.jour, banque >= 0]).toEqual([m.jour, true]);
    }
    const soldes = new Map<string, number>();
    for (const op of s.operations) for (const l of op.lignes) if ('tiers' in l) soldes.set(l.tiers, (soldes.get(l.tiers) ?? 0) + (l.sens === 'DEBIT' ? l.montant : -l.montant));
    expect([...soldes.values()].some((v) => v !== 0)).toBe(true);
  });

  it('se dit fictif, dans son nom et son activité', () => {
    expect(s.nomEntite).toMatch(/démonstration/);
    expect(s.activite).toMatch(/fictive/);
    expect(s.tiers.every((t) => /fictif/.test(t.nom))).toBe(true);
    expect(s.immobilisations.every((i) => /fictif/.test(i.designation))).toBe(true);
    expect(s.salarie.nom).toMatch(/fictif/);
    expect(s.questionnaire).toMatch(/démonstration/);
  });

  it('chaque bien se range dans une famille que le semis de CE référentiel ouvre · aucun numéro choisi pour la vitrine', () => {
    const familles = referentiel === Referentiel.SYSCOHADA ? FAMILLES_IMMOBILISATION_DEFAUT_SYSCOHADA : FAMILLES_IMMOBILISATION_DEFAUT;
    const codes = new Set(familles.map((f) => f.code));
    expect(s.immobilisations.length).toBeGreaterThan(0);
    for (const i of s.immobilisations) expect([i.designation, codes.has(i.famille)]).toEqual([i.designation, true]);
    // Une désignation est la clé de la reprise · deux biens de même nom se confondraient.
    expect(new Set(s.immobilisations.map((i) => i.designation)).size).toBe(s.immobilisations.length);
  });

  it('le relevé tombe dans l’année, porte un solde positif, et laisse des opérations postérieures à pointer', () => {
    const mouvements = mouvementsBanque(s);
    const avant = mouvements.filter((m) => m.jour <= s.jourReleve);
    expect(avant.length).toBeGreaterThan(0);
    expect(avant.reduce((a, m) => a + m.montant, 0)).toBeGreaterThan(0);
    expect(mouvements.some((m) => m.jour > s.jourReleve)).toBe(true);
  });

  it('le bulletin tombe sur un mois SANS écriture de paie au scénario · le passer au journal ne doublerait rien', () => {
    expect(s.salarie.moisBulletin).toMatch(/^(0[1-9]|1[0-2])$/);
    expect(s.salarie.remunerationMensuelleFc).toBeGreaterThan(0);
    const moisDesSalaires = s.operations.filter((o) => o.lignes.some((l) => 'nature' in l && l.nature.startsWith('66'))).map((o) => o.jour.slice(0, 2));
    expect(moisDesSalaires).not.toContain(s.salarie.moisBulletin);
  });
});

it('l’adhérent n’existe qu’au SYCEBNL', () => {
  expect(scenarioDemonstration(Referentiel.SYSCOHADA).tiers.some((t) => t.type === TypeTiers.ADHERENT)).toBe(false);
});
