import { REGLES_COMPTES_SYCEBNL } from './regles-comptes-sycebnl';
import { PLAN_COMPTES_SYCEBNL } from '../comptes/compte-seed';

/**
 * RÈGLES PAR COMPTE · ce que le texte SYCEBNL dit de chaque compte et que le
 * logiciel ignorait.
 *
 * Deux rubriques de la Partie 2 chapitre 3, transcrites verbatim :
 *
 *  · « Exclusions » · ce que le compte ne doit PAS enregistrer, et le compte
 *    à utiliser à la place. C'est un avertissement d'imputation, opposable
 *    parce qu'il cite le texte.
 *  · « Éléments de contrôle » · les pièces qui justifient le solde. C'est le
 *    dossier de révision, compte par compte.
 *
 * Ces tests éprouvent l'EXTRACTION. Une règle mal extraite ne lève aucune
 * erreur : elle avertit à tort, ou n'avertit pas.
 */

const NUMEROS_PLAN = PLAN_COMPTES_SYCEBNL.map((c) => c.numero);
const existe = (n: string) => NUMEROS_PLAN.some((p) => p.startsWith(n) || n.startsWith(p));

describe('couverture du chapitre 3', () => {
  it('porte les 78 fiches · 76 comptes des classes 1 à 8, plus 90 et 91', () => {
    // La classe 9 ne présente pas de fiche par compte : le texte traite 90 et
    // 91 ENSEMBLE sous une sous-section. Les écarter aurait perdu une règle
    // vraie, ils reçoivent donc le même texte, ce que le texte dit lui-même.
    expect(REGLES_COMPTES_SYCEBNL).toHaveLength(78);
    expect(REGLES_COMPTES_SYCEBNL.filter((r) => r.exclusions)).toHaveLength(71);
    expect(REGLES_COMPTES_SYCEBNL.filter((r) => r.elementsDeControle)).toHaveLength(77);
  });

  it('les trois fiches à TROIS chiffres sont là', () => {
    // 603, 659 et 759 · le texte descend d'un cran là où la division le
    // demande, et un motif à deux chiffres les perdait en silence.
    const numeros = REGLES_COMPTES_SYCEBNL.map((r) => r.numero);
    expect(numeros).toEqual(expect.arrayContaining(['603', '659', '759']));
  });

  it('aucun doublon · une fiche par compte', () => {
    const numeros = REGLES_COMPTES_SYCEBNL.map((r) => r.numero);
    expect(numeros.filter((n, i) => numeros.indexOf(n) !== i)).toEqual([]);
  });
});

describe('les comptes cités existent', () => {
  it('chaque fiche porte un numéro du plan SYCEBNL', () => {
    const fantomes = REGLES_COMPTES_SYCEBNL.filter((r) => !existe(r.numero)).map((r) => r.numero);
    expect(fantomes).toEqual([]);
  });

  it('chaque compte À UTILISER existe au plan', () => {
    const fantomes = [
      ...new Set(
        REGLES_COMPTES_SYCEBNL.flatMap((r) => r.comptesAUtiliser.map((n) => `${r.numero} → ${n}`)).filter((paire) => {
          const n = paire.split(' → ')[1];
          return !existe(n);
        }),
      ),
    ].sort();
    expect(fantomes).toEqual([]);
  });
});

describe('un compte ne se propose jamais en remplacement de lui-même', () => {
  it('aucune fiche ne se cite', () => {
    // LE DÉFAUT CORRIGÉ LE 2026-09-03. Prendre tous les nombres du bloc était
    // faux : la phrase nomme d'ABORD les comptes exclus. Le bloc du compte 10
    // dit « Les comptes 101 et 102 ne doivent pas servir à … (utiliser 104) »,
    // et l'extraction naïve proposait 101 et 102 comme remplacement d'eux-
    // mêmes. Seuls comptent les numéros qui SUIVENT « utiliser ».
    //
    // La comparaison porte sur le numéro EXACT, pas sur le préfixe : une
    // SUBDIVISION du même compte est un remplacement parfaitement valable, et
    // le texte s'en sert. Le compte 65 renvoie à son propre 659 (« charges
    // pour dépréciations et provisions à court terme »), et la fiche 10
    // renvoie de 101/102 vers 104. Interdire le préfixe rejetterait ces deux
    // règles vraies.
    const boucles = REGLES_COMPTES_SYCEBNL.filter((r) => r.comptesAUtiliser.includes(r.numero)).map(
      (r) => `${r.numero} → ${r.comptesAUtiliser.join(', ')}`,
    );
    expect(boucles).toEqual([]);
  });

  it('les trois cas de référence sont extraits comme le texte les écrit', () => {
    const par = (n: string) => REGLES_COMPTES_SYCEBNL.find((r) => r.numero === n)!;
    // « (utiliser 104 - Dotation consomptible) » et non 101/102, qui sont les
    // comptes exclus.
    expect(par('10').comptesAUtiliser).toEqual(['104', '16', '46']);
    // « Il convient … d'utiliser les comptes ci-après : 481 … ; 25 … »
    expect(par('40').comptesAUtiliser).toEqual(['25', '481']);
    // « … utiliser les comptes ci-après : 53 … ; 538 … »
    expect(par('52').comptesAUtiliser).toEqual(['53', '538']);
  });
});

describe('le texte est cité, jamais reformulé', () => {
  it('l’exclusion du compte 40 est celle du référentiel, mot pour mot', () => {
    // Un avertissement qui paraphrase la règle cesse d'être opposable · c'est
    // sa citation qui vaut devant un réviseur.
    const quarante = REGLES_COMPTES_SYCEBNL.find((r) => r.numero === '40')!;
    expect(quarante.exclusions).toContain("ne doit pas servir à enregistrer : les fournisseurs d'immobilisations");
    expect(quarante.exclusions).toContain("481 — Fournisseurs d'investissements");
  });

  it('les éléments de contrôle nomment des PIÈCES, pas des consignes', () => {
    // Le dossier de révision se justifie par des documents · une phrase sans
    // pièce ne dit pas au réviseur quoi demander.
    const quarante = REGLES_COMPTES_SYCEBNL.find((r) => r.numero === '40')!;
    expect(quarante.elementsDeControle).toContain('factures');
    expect(quarante.elementsDeControle).toContain('chèques de règlement');
  });

  it('aucun texte tronqué · les blocs font des phrases', () => {
    for (const r of REGLES_COMPTES_SYCEBNL) {
      if (r.exclusions) expect([r.numero, r.exclusions.length > 40]).toEqual([r.numero, true]);
      if (r.elementsDeControle) {
        expect([r.numero, r.elementsDeControle.length > 30]).toEqual([r.numero, true]);
      }
    }
  });
});
