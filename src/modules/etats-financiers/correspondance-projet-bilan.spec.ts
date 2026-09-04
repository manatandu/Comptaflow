import {
  COMPTES_TRESORERIE_PASSIF_SI_CREDITEUR,
  ORDRE_AFFICHAGE_ACTIF,
  ORDRE_AFFICHAGE_PASSIF,
  POSTES_ACTIF,
  POSTES_PASSIF,
  TOTAUX_ACTIF,
  TOTAUX_PASSIF,
} from './correspondance-projet-bilan';
import { correspond } from './etats-financiers.communs';

/**
 * Intégrité structurelle du tableau de correspondance du bilan « projets de
 * développement ». Même esprit que `correspondance-bilan.spec.ts` (jeu
 * associations) : vérifie le référentiel lui-même, pas le comportement du
 * service (couvert par `etats-financiers-projet.service.spec.ts`).
 */
describe('correspondance bilan projet (SYCEBNL, Partie 4 ch. 3)', () => {
  it('ne comporte aucune ref en double, tous postes et totaux confondus', () => {
    const toutesLesRefs = [
      ...POSTES_ACTIF.map((p) => p.ref),
      ...POSTES_PASSIF.map((p) => p.ref),
      ...TOTAUX_ACTIF.map((t) => t.ref),
      ...TOTAUX_PASSIF.map((t) => t.ref),
      'CC', // solde des opérations de l'exercice · calculé à part (compte 13 seul), pas listé dans POSTES_PASSIF
    ];
    expect(new Set(toutesLesRefs).size).toBe(toutesLesRefs.length);
  });

  it("l'ordre d'affichage couvre exactement les postes de détail + totaux, rien de plus, rien de moins", () => {
    const refsActif = new Set([...POSTES_ACTIF.map((p) => p.ref), ...TOTAUX_ACTIF.map((t) => t.ref)]);
    expect(new Set(ORDRE_AFFICHAGE_ACTIF)).toEqual(refsActif);

    const refsPassif = new Set([...POSTES_PASSIF.map((p) => p.ref), ...TOTAUX_PASSIF.map((t) => t.ref), 'CC']);
    expect(new Set(ORDRE_AFFICHAGE_PASSIF)).toEqual(refsPassif);
  });

  it('chaque total ne référence que des refs qui existent réellement (détail ou total imbriqué)', () => {
    const refsConnues = new Set([
      ...POSTES_ACTIF.map((p) => p.ref),
      ...POSTES_PASSIF.map((p) => p.ref),
      ...TOTAUX_ACTIF.map((t) => t.ref),
      ...TOTAUX_PASSIF.map((t) => t.ref),
      'CC',
    ]);
    for (const total of [...TOTAUX_ACTIF, ...TOTAUX_PASSIF]) {
      for (const ref of total.deRefs) {
        expect(refsConnues.has(ref)).toBe(true);
      }
    }
  });

  it('un total ne référence jamais une ref qui vient APRÈS lui dans sa propre liste · sinon le calcul en une passe casserait', () => {
    const dejaResolues = new Set([...POSTES_ACTIF.map((p) => p.ref), ...POSTES_PASSIF.map((p) => p.ref), 'CC']);
    for (const total of [...TOTAUX_ACTIF, ...TOTAUX_PASSIF]) {
      for (const ref of total.deRefs) {
        expect(dejaResolues.has(ref)).toBe(true);
      }
      dejaResolues.add(total.ref);
    }
  });

  it('BE (créances) et DH (dettes) portent un qualificatif de sens opposé sur les mêmes préfixes de tiers polyvalents · anomalie n° 2', () => {
    const be = POSTES_ACTIF.find((p) => p.ref === 'BE')!;
    const dh = POSTES_PASSIF.find((p) => p.ref === 'DH')!;
    expect(be.sens_qualificatif).toBe('DEBITEUR');
    expect(dh.sens_qualificatif).toBe('CREDITEUR');
  });

  // Ce test-garde existait côté associations et MANQUAIT ici : c'est
  // exactement lui qui aurait attrapé le compte 297 affecté à la fois à AG et
  // à AH (déduction en double, AZ faussé). Porté à l'audit du 2026-08-28.
  it('aucun compte n’est réclamé par DEUX postes d’actif à la fois (déduction/comptage en double)', () => {
    const vus = new Map<string, string>();
    for (const p of POSTES_ACTIF) {
      for (const c of p.comptes) {
        const precedent = vus.get(c);
        expect(precedent === undefined || precedent === p.ref).toBe(true);
        vus.set(c, p.ref);
      }
    }
  });

  it('aucun poste d’actif ne porte de comptes d’amortissement : ce jeu n’a pas de colonne Amort. (audit 2026-08-28)', () => {
    // Le tableau de correspondance officiel ne cite aucun compte 28x/29x et la
    // maquette n'a que « EXERCICE AU 31/12/N | N-1 ». Une version précédente
    // avait recopié les mappings du jeu associations · règle §2.6 violée.
    for (const p of POSTES_ACTIF) {
      expect(Object.keys(p)).not.toContain('comptesAmortissement');
      expect(p.comptes.some((c) => c.startsWith('28') || c.startsWith('29'))).toBe(false);
    }
  });

  it('BD exclut 411 ET 419, comme l’écrit le texte officiel', () => {
    const bd = POSTES_ACTIF.find((p) => p.ref === 'BD')!;
    expect(bd.exclusions).toEqual(['411', '419']);
  });

  it('DI transcrit le compte 20 tel quel · anomalie du texte officiel, signalée et non corrigée en silence', () => {
    const di = POSTES_PASSIF.find((p) => p.ref === 'DI')!;
    expect(di.comptes).toEqual(['20']);
  });

  it('DW capte 56 en direct ; les découverts 52/53 sont ajoutés à part dans le service (même mécanisme que le jeu associations)', () => {
    const dw = POSTES_PASSIF.find((p) => p.ref === 'DW')!;
    expect(dw.comptes).toEqual(['56']);
    expect(COMPTES_TRESORERIE_PASSIF_SI_CREDITEUR).toEqual(['52', '53']);
  });

  // Le garde-fou d'actif ci-dessus compare des préfixes à l'IDENTIQUE : il
  // n'aurait jamais vu '47' avaler '479'. Or c'est bien par recouvrement de
  // préfixes que le poste DH mangeait l'écart de conversion du poste DY
  // (anomalie n° 4, audit RE-176 du 2026-09-04). Ce test-ci raisonne donc
  // avec le MÊME filtre que le service (`correspond`, § etats-financiers.
  // communs.ts) et dans les deux sens : le préfixe de chaque poste est
  // confronté à tous les autres postes du même côté du bilan.
  it('aucun compte n’est réclamé par DEUX postes de PASSIF · comparaison par préfixes, pas à l’identique', () => {
    const collisions: string[] = [];
    for (const p of POSTES_PASSIF) {
      for (const prefixe of p.comptes) {
        for (const autre of POSTES_PASSIF) {
          if (autre.ref === p.ref) continue;
          if (correspond(prefixe, autre.comptes, autre.exclusions)) {
            collisions.push(`${prefixe} (${p.ref}) capté aussi par ${autre.ref}`);
          }
        }
      }
    }
    expect(collisions).toEqual([]);
  });

  it('DH exclut 478 ET 479 : DY porte seul l’écart de conversion-passif (anomalie n° 4)', () => {
    const dh = POSTES_PASSIF.find((p) => p.ref === 'DH')!;
    const dy = POSTES_PASSIF.find((p) => p.ref === 'DY')!;
    expect(dh.exclusions).toEqual(['478', '479']);
    expect(dy.comptes).toEqual(['479']);
    // Le comportement réellement en jeu, avec un numéro de compte complet.
    expect(correspond('47910000', dh.comptes, dh.exclusions)).toBe(false);
    expect(correspond('47910000', dy.comptes, dy.exclusions)).toBe(true);
    // 47 hors 478/479 reste bien dans DH : l'exclusion ne doit rien amputer
    // d'autre (471 Débiteurs et créditeurs divers, Partie 2 ch. 3 COMPTE 47).
    expect(correspond('47120000', dh.comptes, dh.exclusions)).toBe(true);
  });

  it('4998 n’est PAS exclu de DH · il n’est capté que par DE, l’exclusion du jeu associations serait morte ici', () => {
    // Le jeu associations doit exclure 4998 de son poste « Autres dettes »
    // parce que celui-ci liste '499' parmi ses préfixes ; DH n'en a pas.
    const dh = POSTES_PASSIF.find((p) => p.ref === 'DH')!;
    const de = POSTES_PASSIF.find((p) => p.ref === 'DE')!;
    expect(dh.exclusions).not.toContain('4998');
    expect(correspond('49980000', dh.comptes, dh.exclusions)).toBe(false);
    expect(correspond('49980000', de.comptes, de.exclusions)).toBe(true);
  });
});
