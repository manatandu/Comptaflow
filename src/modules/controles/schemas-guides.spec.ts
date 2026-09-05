import { SCHEMAS_GUIDE_SYCEBNL } from './schemas-guide-sycebnl';
import { SCHEMAS_GUIDE_SYSCOHADA } from './schemas-guide-syscohada';
import { PLAN_COMPTES_SYCEBNL } from '../comptes/compte-seed';
import { PLAN_COMPTES_SYSCOHADA } from '../comptes/compte-seed-syscohada';
import { COMPTES_ABOLIS_PAR_LA_REVISION, COMPTES_HORS_PLAN, racinePlan } from './rapprochement-guide-plan';

/**
 * LES GUIDES D'APPLICATION, RENDUS EXPLOITABLES.
 *
 * Les deux référentiels publient un guide d'écritures-types entièrement
 * chiffrées. C'est la seule source qui dise, opération par opération, quel
 * compte va avec quel compte · exactement ce qu'il faut pour contrôler la
 * cohérence d'une écriture saisie.
 *
 * `scripts/extraire-schemas-guides.cjs` les lit et engendre les deux tables.
 * Ce qui suit éprouve l'EXTRACTION, pas les guides : une extraction muette
 * qui perdrait la moitié des écritures, ou qui prendrait un montant pour un
 * numéro de compte, donnerait une table plausible et fausse.
 */

const numeros = (plan: { numero: string }[]) => plan.map((c) => c.numero);

/**
 * Un numéro du guide est RAPPROCHABLE s'il a une racine au plan, ou s'il
 * figure dans la liste gelée des comptes hors plan. Exiger l'égalité exacte
 * n'aurait aucun sens · les guides subdivisent plus loin que le plan (voir
 * rapprochement-guide-plan.ts).
 */
function rapprochable(numero: string, plan: string[]): boolean {
  return (
    racinePlan(numero, plan) !== null ||
    numero in COMPTES_HORS_PLAN ||
    numero in COMPTES_ABOLIS_PAR_LA_REVISION
  );
}

describe('extraction du guide SYCEBNL', () => {
  const plan = numeros(PLAN_COMPTES_SYCEBNL);

  it('rend les 96 écritures des 20 applications qui en portent', () => {
    // Le guide compte 22 applications · les deux dernières sont des tableaux
    // de correspondance (emplois-ressources, exécution budgétaire), pas des
    // écritures. Les perdre est voulu ; en perdre d'autres ne le serait pas.
    expect(SCHEMAS_GUIDE_SYCEBNL).toHaveLength(96);
    expect(new Set(SCHEMAS_GUIDE_SYCEBNL.map((s) => s.source)).size).toBe(20);
  });

  it('chaque schéma a au moins un débit et un crédit', () => {
    const bancals = SCHEMAS_GUIDE_SYCEBNL.filter((s) => !s.debits.length || !s.credits.length);
    expect(bancals).toEqual([]);
  });

  it('aucun compte inventé · chacun se rattache au plan SYCEBNL', () => {
    // LE TEST QUI COMPTE. Une colonne mal lue mettrait un montant là où on
    // attend un numéro, et « 15 000 000 » ne se rattache à rien. Une
    // confusion de référentiel se verrait ici aussi.
    const inconnus = [
      ...new Set(
        SCHEMAS_GUIDE_SYCEBNL.flatMap((s) => [...s.debits, ...s.credits]).filter((n) => !rapprochable(n, plan)),
      ),
    ].sort();
    expect(inconnus).toEqual([]);
  });

  it('les subdivisions du guide se rattachent à leur racine', () => {
    // CORRECTION DU 2026-09-05. La vérification du 2026-09-03 concluait que
    // 6011 et 7961 étaient des subdivisions ouvertes par l'entité, le semis
    // s'arrêtant alors à 601 et 796. C'était le SEMIS qui s'arrêtait, pas le
    // plan : la page 95 du Journal officiel donne bien 6011, et la page 102
    // bien 7961. Ils sont désormais semés, et se rattachent donc à eux-mêmes.
    // Le 28442 reste, lui, une subdivision d'entité : le plan s'arrête à 2844.
    expect(racinePlan('6011', plan)).toBe('6011');
    expect(racinePlan('7961', plan)).toBe('7961');
    expect(racinePlan('28442', plan)).toBe('2844');
  });

  it('chaque schéma porte sa preuve · le guide et son application', () => {
    for (const s of SCHEMAS_GUIDE_SYCEBNL) {
      expect(s.source).toMatch(/^SYCEBNL · Application \d+$/);
      expect(s.titre.length).toBeGreaterThan(3);
    }
  });
});

describe('extraction du guide SYSCOHADA', () => {
  const plan = numeros(PLAN_COMPTES_SYSCOHADA);

  it('rend les 275 écritures des 103 applications qui en portent', () => {
    // 120 titres d'application au guide · les 17 écartées ne contiennent
    // aucun tableau d'écriture (plans d'amortissement, périodes
    // comparatives, calculs de consolidation, renvois à une autre
    // application). Vérifié un par un le 2026-09-03.
    expect(SCHEMAS_GUIDE_SYSCOHADA).toHaveLength(275);
    expect(new Set(SCHEMAS_GUIDE_SYSCOHADA.map((s) => s.source)).size).toBe(103);
  });

  it('chaque schéma a au moins un débit et un crédit', () => {
    const bancals = SCHEMAS_GUIDE_SYSCOHADA.filter((s) => !s.debits.length || !s.credits.length);
    expect(bancals).toEqual([]);
  });

  it('aucun compte inventé · chacun se rattache au plan SYSCOHADA', () => {
    const inconnus = [
      ...new Set(
        SCHEMAS_GUIDE_SYSCOHADA.flatMap((s) => [...s.debits, ...s.credits]).filter((n) => !rapprochable(n, plan)),
      ),
    ].sort();
    expect(inconnus).toEqual([]);
  });

  it('les subdivisions du guide se rattachent à leur racine', () => {
    expect(racinePlan('5212', plan)).toBe('521');
    expect(racinePlan('23111', plan)).toBe('2311');
  });

  it('les écritures de transition sont marquées, et elles seules', () => {
    // Le chapitre 41 montre le passage de l'ancien plan au nouveau · ses
    // écritures mouvementent des comptes abolis. Vraies pour une transition,
    // fausses pour une écriture d'aujourd'hui : un contrôle qui s'en
    // servirait justifierait un compte qui n'existe plus.
    const transition = SCHEMAS_GUIDE_SYSCOHADA.filter((s) => s.transition);
    expect(transition).toHaveLength(13);
    for (const s of transition) expect(s.source).toMatch(/Application 12[3-9]|Application 1[3-9]\d/);
    const courants = SCHEMAS_GUIDE_SYSCOHADA.filter((s) => !s.transition);
    expect(courants.length).toBe(SCHEMAS_GUIDE_SYSCOHADA.length - 13);
  });

  it('un compte aboli ne se rattache pas à un compte vivant', () => {
    // 6811 « Dotations aux amortissements des charges immobilisées » n'existe
    // plus. Le plan porte pourtant un 681 · sans garde, le rapprochement par
    // préfixe l'aurait avalé sans un mot.
    expect(racinePlan('6811', plan)).toBeNull();
    expect(racinePlan('2011', plan)).toBeNull();
    expect(racinePlan('206', plan)).toBeNull();
    expect(Object.keys(COMPTES_ABOLIS_PAR_LA_REVISION).sort()).toEqual(['2011', '206', '6811']);
  });

  it('les deux comptes HORS PLAN de l’Application 107 restent nommés', () => {
    // 06 et 07 « Exploitation en société en participation » sont ouverts par
    // le gérant · le plan SYSCOHADA n'a pas de classe 0. Les rattacher de
    // force à un compte du plan serait une invention.
    expect(racinePlan('06', plan)).toBeNull();
    expect(racinePlan('07', plan)).toBeNull();
    expect(Object.keys(COMPTES_HORS_PLAN).sort()).toEqual(['06', '07']);
  });
});

describe('les deux tables ne se mélangent pas', () => {
  it('elles ne partagent aucune écriture', () => {
    // Le SYCEBNL et le SYSCOHADA n'ont ni le même plan ni les mêmes
    // opérations (CLAUDE.md §6). Une entrée commune signalerait que
    // l'extracteur a lu deux fois le même fichier.
    const cle = (s: { source: string; debits: string[]; credits: string[] }) =>
      `${s.source}|${s.debits.join()}|${s.credits.join()}`;
    const a = new Set(SCHEMAS_GUIDE_SYCEBNL.map(cle));
    const communs = SCHEMAS_GUIDE_SYSCOHADA.map(cle).filter((k) => a.has(k));
    expect(communs).toEqual([]);
  });
});
