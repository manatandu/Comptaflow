import {
  CATEGORIES_RESSOURCES_ART6,
  NOTES_SMT,
  ORDRE_BILAN_ACTIF,
  ORDRE_BILAN_PASSIF,
  POSTES_BILAN_ACTIF,
  POSTES_BILAN_PASSIF,
  POSTES_DEPENSES,
  POSTES_RECETTES,
  RETRAITEMENTS,
  SEUIL_SMT_FCFA,
  TOTAUX_BILAN_ACTIF,
  TOTAUX_BILAN_PASSIF,
  VENTILATION_DEPENSES,
  VENTILATION_RECETTES,
} from './correspondance-smt';
import { PLAN_COMPTES_SYCEBNL } from '../comptes/compte-seed';

/**
 * SYSTÈME MINIMAL DE TRÉSORERIE · 480 lignes que rien ne vérifiait, et le
 * SEUL des trois jeux où le rattachement est DÉRIVÉ.
 *
 * Pour les associations (ch. 2) et les projets (ch. 3), le texte officiel
 * fournit un tableau de correspondance poste → comptes, et nos tables s'y
 * adossent ligne à ligne : une erreur y contredit le texte, donc se voit.
 * **Le chapitre 4 n'en comporte aucun.** Il ne donne que la maquette · REF,
 * libellé, renvoi de note. Le rattachement est lu au plan de comptes :
 * « Caisse » va au 57 parce que le compte 57 s'intitule Caisse, pas parce
 * qu'un tableau l'a écrit.
 *
 * C'est exactement pour cela que ce fichier avait le plus besoin d'un spec :
 * une erreur de rattachement n'y contredit AUCUN texte, et ne se découvre
 * qu'au dépôt des états.
 *
 * Ce que ce spec garde, en conséquence, n'est pas seulement la conformité à
 * la maquette (elle, transcrite) mais la DISCIPLINE de la dérivation : chaque
 * poste doit porter la justification de son rattachement, et les postes
 * résiduels doivent ramasser exactement ce que les autres laissent.
 */

/** La maquette officielle, transcrite (partie4-ch4, sections 1 et 2). */
const BILAN_ACTIF_OFFICIEL: Array<[string, string, string | null]> = [
  ['GA', 'Immobilisations (1)', '1'],
  ['GB', 'Stocks', '2'],
  ['GC', 'Adhérents, clients-usagers et autres débiteurs', '3'],
  ['GD', 'Caisse', '4'],
  ['GE', 'Banque (en + ou en -)', '4'],
];

const BILAN_PASSIF_OFFICIEL: Array<[string, string, string | null]> = [
  ['HA', 'Dotations', '5'],
  // HB « Résultat net de l'exercice » n'est pas un poste de rattachement ·
  // voir le test dédié.
  ['HC', 'Autres fonds propres', null],
  ['HD', 'Fournisseurs et autres créditeurs', '3'],
];

const RECETTES_OFFICIEL: Array<[string, string]> = [
  ['KA', 'Revenus encaissés'],
  ['KB', 'Autres recettes sur activités'],
];

const DEPENSES_OFFICIEL: Array<[string, string]> = [
  ['JA', 'Dépenses sur achats'],
  ['JB', 'Dépenses sur loyers'],
  ['JC', 'Dépenses sur salaires'],
  ['JD', 'Dépenses sur impôts et taxes'],
  ['JE', "Charges d'intérêts"],
  ['JF', 'Autres dépenses sur activités'],
];

const COMPTES_IMPUTATION = PLAN_COMPTES_SYCEBNL.filter((c) => c.typeCompte !== 'TOTAL');

function capte(poste: { comptes: string[]; exclusions?: string[] }, numero: string): boolean {
  return (
    poste.comptes.some((p) => numero.startsWith(p)) && !(poste.exclusions ?? []).some((e) => numero.startsWith(e))
  );
}

describe('correspondance SMT · conformité à la maquette officielle', () => {
  it('le bilan reprend les REF, libellés et renvois de notes du texte', () => {
    expect(POSTES_BILAN_ACTIF.map((p) => [p.ref, p.libelle, p.note])).toEqual(BILAN_ACTIF_OFFICIEL);
    expect(POSTES_BILAN_PASSIF.map((p) => [p.ref, p.libelle, p.note])).toEqual(BILAN_PASSIF_OFFICIEL);
  });

  it('HB (résultat net) n’est PAS un poste de rattachement · il se calcule', () => {
    // Même mécanique que CH au bilan des associations : le résultat vient des
    // classes de gestion ou du compte 13, pas d'un préfixe de compte rangé
    // dans la table. L'y mettre le compterait deux fois.
    expect(POSTES_BILAN_PASSIF.map((p) => p.ref)).not.toContain('HB');
    expect(ORDRE_BILAN_PASSIF).toContain('HB');
  });

  it('l’ordre d’affichage couvre les postes puis le total, rien de plus', () => {
    expect(ORDRE_BILAN_ACTIF).toEqual([...POSTES_BILAN_ACTIF.map((p) => p.ref), 'GZ']);
    expect(ORDRE_BILAN_PASSIF).toEqual(['HA', 'HB', 'HC', 'HD', 'HZ']);
  });

  it('GZ et HZ somment exactement les postes de leur côté', () => {
    expect(TOTAUX_BILAN_ACTIF[0].deRefs).toEqual(['GA', 'GB', 'GC', 'GD', 'GE']);
    // HB est dans le total du passif alors qu'il n'est pas dans les postes ·
    // c'est voulu, le service l'y injecte après calcul.
    expect(TOTAUX_BILAN_PASSIF[0].deRefs).toEqual(['HA', 'HB', 'HC', 'HD']);
  });

  it('le compte de résultat reprend KA-KB puis JA-JF, dans l’ordre du texte', () => {
    expect(POSTES_RECETTES.map((p) => [p.ref, p.libelle])).toEqual(RECETTES_OFFICIEL);
    expect(POSTES_DEPENSES.map((p) => [p.ref, p.libelle])).toEqual(DEPENSES_OFFICIEL);
  });

  it('les quatre retraitements portent les signes que la maquette imprime', () => {
    // « + Variations des stocks », « + Variation des créances »,
    // « - Variation des dettes », puis les dotations, qui ne peuvent que
    // diminuer un solde de caisse.
    expect(RETRAITEMENTS.map((r) => [r.ref, r.signe])).toEqual([
      ['VA', 1],
      ['VB', 1],
      ['VC', -1],
      ['JG', -1],
    ]);
  });

  it('porte les cinq notes du SMT et le seuil de l’art. 6', () => {
    expect(NOTES_SMT).toHaveLength(5);
    expect(SEUIL_SMT_FCFA).toBe(30_000_000);
    expect(CATEGORIES_RESSOURCES_ART6.length).toBeGreaterThan(0);
  });
});

describe('correspondance SMT · discipline de la dérivation', () => {
  it('chaque poste dit POURQUOI il capte ces comptes-là', () => {
    // Le chapitre 4 ne donne aucun tableau : sans justification écrite, un
    // rattachement devient indiscutable faute de pouvoir être discuté.
    for (const p of [...POSTES_BILAN_ACTIF, ...POSTES_BILAN_PASSIF, ...POSTES_RECETTES, ...POSTES_DEPENSES]) {
      expect([p.ref, (p.fondement ?? '').length > 40]).toEqual([p.ref, true]);
    }
    for (const r of RETRAITEMENTS) {
      expect([r.ref, r.fondement.length > 40]).toEqual([r.ref, true]);
    }
  });

  it('chaque préfixe cité correspond à au moins un compte du semis SYCEBNL', () => {
    const tous = [...POSTES_BILAN_ACTIF, ...POSTES_BILAN_PASSIF, ...POSTES_RECETTES, ...POSTES_DEPENSES];
    for (const p of tous) {
      for (const prefixe of p.comptes) {
        expect([p.ref, prefixe, COMPTES_IMPUTATION.some((c) => c.numero.startsWith(prefixe))]).toEqual([
          p.ref,
          prefixe,
          true,
        ]);
      }
    }
  });

  it('la Caisse est le 57 et la Banque tout le reste de la classe 5', () => {
    // Le rattachement le plus littéral de la table, et celui qui rend les
    // deux autres lisibles : GD prend le compte dont l'intitulé EST « Caisse »,
    // GE prend la classe 5 privée de lui. Aucun compte de trésorerie ne peut
    // donc échapper au bilan, ni y tomber deux fois.
    const gd = POSTES_BILAN_ACTIF.find((p) => p.ref === 'GD')!;
    const ge = POSTES_BILAN_ACTIF.find((p) => p.ref === 'GE')!;
    expect(gd.comptes).toEqual(['57']);
    expect(ge.comptes).toEqual(['5']);
    expect(ge.exclusions).toEqual(['57']);
    const tresorerie = COMPTES_IMPUTATION.filter((c) => c.numero.startsWith('5'));
    for (const c of tresorerie) {
      const dansGd = capte(gd, c.numero);
      const dansGe = capte(ge, c.numero);
      expect([c.numero, dansGd !== dansGe]).toEqual([c.numero, true]);
    }
  });

  it('aucun compte du semis n’est capté par deux postes du MÊME côté du bilan', () => {
    for (const [nom, postes] of [
      ['actif', POSTES_BILAN_ACTIF],
      ['passif', POSTES_BILAN_PASSIF],
    ] as Array<[string, typeof POSTES_BILAN_ACTIF]>) {
      const vus = new Map<string, string>();
      for (const p of postes) {
        for (const c of COMPTES_IMPUTATION) {
          if (!capte(p, c.numero)) continue;
          // Un compte de tiers peut être réclamé des deux côtés SI chaque
          // poste ne retient qu'un sens de solde · GC débiteur, HD créditeur.
          const deja = vus.get(c.numero);
          if (deja && !(p.sens_qualificatif && postes.find((x) => x.ref === deja)?.sens_qualificatif)) {
            expect([nom, c.numero, `${deja}/${p.ref}`]).toEqual([nom, c.numero, 'aucun doublon']);
          }
          vus.set(c.numero, p.ref);
        }
      }
    }
  });

  it('les postes de tiers portent un qualificatif de sens des DEUX côtés', () => {
    // La classe 4 entière est réclamée par GC à l'actif et HD au passif. Sans
    // qualificatif, chaque compte tomberait dans les deux et le bilan
    // doublerait de la totalité des tiers.
    const gc = POSTES_BILAN_ACTIF.find((p) => p.ref === 'GC')!;
    const hd = POSTES_BILAN_PASSIF.find((p) => p.ref === 'HD')!;
    expect(gc.comptes).toEqual(['4']);
    expect(hd.comptes).toEqual(['4']);
    expect(gc.sens_qualificatif).toBe('DEBITEUR');
    expect(hd.sens_qualificatif).toBe('CREDITEUR');
  });

  it('les postes résiduels ramassent exactement ce que les autres laissent', () => {
    // KB et JF sont les « autres » de la maquette. Leurs exclusions doivent
    // reprendre TOUS les préfixes des postes nommés du même bloc · sinon un
    // encaissement tombe deux fois, ou nulle part.
    const kb = POSTES_RECETTES.find((p) => p.ref === 'KB')!;
    const nommesRecettes = POSTES_RECETTES.filter((p) => p.ref !== 'KB').flatMap((p) => p.comptes);
    expect([...(kb.exclusions ?? [])].sort()).toEqual([...nommesRecettes].sort());

    const jf = POSTES_DEPENSES.find((p) => p.ref === 'JF')!;
    const nommesDepenses = POSTES_DEPENSES.filter((p) => p.ref !== 'JF').flatMap((p) => p.comptes);
    expect([...(jf.exclusions ?? [])].sort()).toEqual([...nommesDepenses].sort());
  });

  it('la ventilation de la Note 4 ne recoupe pas les postes du compte de résultat', () => {
    // Deux découpages officiels DIFFÉRENTS, tous deux transcrits. Les
    // confondre reviendrait à inventer une équivalence que le texte ne pose
    // pas · la Note 4 ventile par nature de mouvement, KA-JF par poste d'état.
    expect(VENTILATION_RECETTES.map((v) => v.cle)).not.toEqual(POSTES_RECETTES.map((p) => p.ref));
    expect(VENTILATION_DEPENSES.length).toBeGreaterThan(0);
    // Chaque colonne résiduelle exclut les colonnes nommées de sa famille.
    const autresRecettes = VENTILATION_RECETTES.find((v) => v.cle === 'autres');
    if (autresRecettes) {
      const nommes = VENTILATION_RECETTES.filter((v) => v.cle !== 'autres').flatMap((v) => v.comptes);
      for (const ex of autresRecettes.exclusions ?? []) expect(nommes).toContain(ex);
    }
  });

  it('aucun cadratin dans les libellés ni les fondements (CLAUDE.md §4)', () => {
    for (const p of [...POSTES_BILAN_ACTIF, ...POSTES_BILAN_PASSIF, ...POSTES_RECETTES, ...POSTES_DEPENSES]) {
      expect(p.libelle).not.toContain('—');
      expect(p.fondement).not.toContain('—');
    }
    for (const r of RETRAITEMENTS) expect(r.libelle).not.toContain('—');
  });
});
