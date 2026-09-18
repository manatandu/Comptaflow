import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MODELES_SIMPLES_SYCEBNL, MODELES_SIMPLES_SYSCOHADA } from './modeles-saisie';

// Pas d'import de « vitest » · convention du dépôt, describe/it/expect par les
// globales, pour que le fichier tourne sous les deux lanceurs.

/**
 * UN MODÈLE DE SAISIE CITE DES NUMÉROS DE COMPTES · et un numéro faux n'y
 * casse rien. Il insère une écriture équilibrée, enregistrable, et fausse.
 *
 * Le même jeu de modèles était servi aux deux référentiels. Pour un dossier
 * d'entreprise, cela donnait deux dégâts muets :
 *
 *  · le 70410000 existe au plan SYSCOHADA, mais c'est « Ventes de produits
 *    résiduels ». Le modèle « Don reçu en numéraire » y insérait une VENTE
 *    DE DÉCHETS ;
 *  · 70100000, 60500000 et 66100000 n'y existent pas du tout · 701, 605 et
 *    661 y sont semés en TOTAL, donc non imputables. Depuis que le semis
 *    SYCEBNL descend lui aussi au quatrième chiffre, 605 et 661 y sont des
 *    TOTAL également · les deux jeux de modèles visent donc le même niveau.
 *
 * Ce test lit les DEUX semis et vérifie que chaque modèle vise un compte qui
 * existe dans SON plan. La convention §7 de CLAUDE.md le rend décidable sans
 * exécuter le semis : un compte d'imputation est complété à droite par des
 * zéros jusqu'à huit chiffres, un compte Total ne l'est jamais. Trouver le
 * numéro à huit chiffres dans le fichier, c'est donc trouver une feuille.
 */
const racine = join(__dirname, '..', '..', '..');
const semis = {
  SYCEBNL: readFileSync(join(racine, 'src/modules/comptes/compte-seed.ts'), 'utf8'),
  SYSCOHADA: readFileSync(join(racine, 'src/modules/comptes/compte-seed-syscohada.ts'), 'utf8'),
};

const semePar = (plan: keyof typeof semis, numero: string) => semis[plan].includes(`'${numero}'`);

describe('modèles de saisie · chaque modèle vise un compte de SON plan', () => {
  it.each([
    ['SYCEBNL', MODELES_SIMPLES_SYCEBNL],
    ['SYSCOHADA', MODELES_SIMPLES_SYSCOHADA],
  ] as const)('les comptes des modèles %s sont tous semés en Détail', (plan, modeles) => {
    // TOUTES les lignes, pas la seule contrepartie · depuis que les modèles
    // passent par un tiers, un modèle porte deux comptes fixés et non plus un,
    // et le compte de tiers est exactement celui qui manquait.
    const absents = modeles.flatMap((m) =>
      m.lignes
        .filter((l) => l.numero && !semePar(plan, l.numero))
        .map((l) => `${m.code} → ${l.numero}`),
    );
    expect(absents).toEqual([]);
  });

  it.each([
    ['SYCEBNL', MODELES_SIMPLES_SYCEBNL],
    ['SYSCOHADA', MODELES_SIMPLES_SYSCOHADA],
  ] as const)(
    'AUCUN modèle %s de facture ne solde son écriture sur la trésorerie',
    (_plan, modeles) => {
      /*
        LE DÉFAUT QUE MANASSE A RELEVÉ, FIGÉ ICI.

        Chaque modèle tenait en deux lignes, un compte de nature contre un
        compte de trésorerie : un achat créditait la banque et le fournisseur
        n'existait jamais. Le Guide d'application du SYSCOHADA est expres ·
        « Recommandation SYSCOHADA (flux de trésorerie) : contrepartie
        systématique = 401 pour les achats de biens/services (hors
        immobilisations) » (Partie 1 ch. 2 § 1.1).

        Les SEULES écritures qui touchent la trésorerie sont celles qui n'ont
        pas de tiers : un don manuel, et les règlements, qui sont la seconde
        moitié d'une opération déjà comptabilisée. La liste est fermée et
        nommée · ajouter un modèle qui touche la trésorerie oblige à venir
        dire ici pourquoi.
      */
      const ADMIS = ['don', 'recouvrement-cotisation', 'reglement-fournisseur', 'encaissement-client'];
      const fautifs = modeles
        .filter((m) => m.lignes.some((l) => l.role === 'TRESORERIE') && !ADMIS.includes(m.code))
        .map((m) => m.code);
      expect(fautifs).toEqual([]);
    },
  );

  it.each([
    ['SYCEBNL', MODELES_SIMPLES_SYCEBNL],
    ['SYSCOHADA', MODELES_SIMPLES_SYSCOHADA],
  ] as const)('achat, vente et salaire %s passent par un compte de tiers', (_plan, modeles) => {
    for (const code of ['achat', 'salaire']) {
      const m = modeles.find((x) => x.code === code);
      if (!m) continue;
      const tiers = m.lignes.find((l) => l.role === 'TIERS');
      expect(`${code} → ${tiers?.numero ?? 'AUCUN TIERS'}`).toContain('→ 4');
      // Et le modèle DIT ce qu'il ne fait pas · la facture n'est que la
      // première moitié de l'opération.
      expect(`${code} → ${m.suite ? 'dit la suite' : 'SE TAIT'}`).toBe(`${code} → dit la suite`);
    }
  });

  it('LE DÉFAUT D’ORIGINE · le modèle « cotisation » ne trouve aucun compte au plan SYSCOHADA', () => {
    const perdus = MODELES_SIMPLES_SYCEBNL.filter((m) =>
      m.lignes.some((l) => l.numero && !semePar('SYSCOHADA', l.numero)),
    );
    // CE QUE CE TEST ATTENDAIT, ET CE QU'IL CONSTATE MAINTENANT. Il figeait
    // trois modèles introuvables au plan SYSCOHADA, et disait que tomber à
    // zéro signifierait que les deux plans ont convergé « ce qui n'arrivera
    // pas ». Il en reste un seul, et c'est bien une convergence PARTIELLE :
    // depuis que le semis SYCEBNL descend au quatrième chiffre comme le plan
    // officiel, 6011 et 6611 existent DANS LES DEUX PLANS, avec des intitulés
    // différents (test suivant). Le danger a donc changé de nature · il n'est
    // plus « le compte n'existe pas », il est « le compte existe et ne veut
    // pas dire la même chose ». C'est le pire des deux, et c'est la raison
    // pour laquelle le cloisonnement par référentiel reste indispensable :
    // ModelesSaisie.tsx choisit le jeu sur `estSyscohada`, jamais sur le
    // numéro.
    // La liste s'allonge depuis que les modèles portent leur tiers : le
    // 41100000 « Adhérents » du SYCEBNL n'existe pas au plan SYSCOHADA, qui
    // ouvre 41110000 « Clients ». C'est la même leçon, sur un compte de plus.
    expect(perdus.map((m) => m.code).sort()).toEqual(['cotisation', 'recouvrement-cotisation']);
  });

  it('6011 et 6611 existent dans les deux plans et n’y désignent pas la même chose', () => {
    // C'est le cœur du risque décrit ci-dessus, mesuré et non supposé.
    for (const numero of ['60110000', '66110000']) {
      expect(semePar('SYCEBNL', numero)).toBe(true);
      expect(semePar('SYSCOHADA', numero)).toBe(true);
    }
    // 6011 · SYCEBNL « Achats de biens et services liés à l'activité dans
    // l'État partie » contre SYSCOHADA « Achats de marchandises · dans la
    // Région ». Un achat d'ONG imputé sur le second devient un achat de
    // marchandises destinées à la revente, et la marge commerciale du compte
    // de résultat s'en trouve fausse sans qu'aucun contrôle ne bronche.
    expect(semis.SYCEBNL).toContain("Achats de biens et services liés à l'activité dans l'État partie");
    expect(semis.SYSCOHADA).toContain('Achats de marchandises');
  });

  it('le quatrième est PIRE · le 70410000 existe en SYSCOHADA, mais ce n’est pas un don', () => {
    const don = MODELES_SIMPLES_SYCEBNL.find((m) => m.code === 'don')!;
    const compteDon = don.lignes.find((l) => l.role === 'NATURE')!.numero!;
    expect(compteDon).toBe('70410000');
    expect(semePar('SYSCOHADA', compteDon)).toBe(true);
    // 7041 « Ventes de produits résiduels dans la Région ». Un compte qui
    // existe est plus dangereux qu'un compte absent : l'écriture passe.
    expect(semis.SYSCOHADA).toContain('Ventes de produits résiduels');
  });

  it('les deux jeux ne se recouvrent que là où les deux plans se recouvrent', () => {
    // La disjonction NUMÉRIQUE des deux jeux n'est plus atteignable, et le
    // prétendre serait faux : 6011 et 6611 sont les comptes justes des deux
    // côtés. Ce qui doit rester vrai, c'est que chaque jeu vise un compte
    // semé en Détail dans SON plan (premier test) et que le recouvrement se
    // limite à ces deux-là, jamais aux comptes de produits · un « don reçu »
    // et une « vente de marchandises » ne doivent jamais porter le même
    // numéro dans les deux jeux.
    // Le recouvrement se mesure sur les comptes de NATURE · les comptes de
    // tiers, eux, sont communs par construction (40110000 est le fournisseur
    // des deux plans) et ce n'est pas un danger : un fournisseur est un
    // fournisseur.
    const natures = (modeles: typeof MODELES_SIMPLES_SYCEBNL) =>
      modeles.flatMap((m) =>
        m.lignes.filter((l) => l.role === 'NATURE' && l.numero).map((l) => ({ code: m.code, numero: l.numero! })),
      );
    const numerosSycebnl = new Set(natures(MODELES_SIMPLES_SYCEBNL).map((x) => x.numero));
    const communs = natures(MODELES_SIMPLES_SYSCOHADA).filter((x) => numerosSycebnl.has(x.numero));
    expect(communs.map((x) => `${x.code} → ${x.numero}`).sort()).toEqual([
      'achat → 60110000',
      'salaire → 66110000',
    ]);
    // Aucun compte de PRODUIT ne se partage · un « don reçu » et une « vente
    // de marchandises » ne doivent jamais porter le même numéro.
    const produitsSyscohada = natures(MODELES_SIMPLES_SYSCOHADA).filter((x) => x.numero.startsWith('7'));
    expect(produitsSyscohada.some((x) => numerosSycebnl.has(x.numero))).toBe(false);
  });

  it('chaque modèle a un code unique, un libellé, un journal et une écriture équilibrée en sens', () => {
    for (const modeles of [MODELES_SIMPLES_SYCEBNL, MODELES_SIMPLES_SYSCOHADA]) {
      expect(new Set(modeles.map((m) => m.code)).size).toBe(modeles.length);
      for (const m of modeles) {
        expect(`${m.code} · libellé`).toBe(m.libelle.trim().length > 0 ? `${m.code} · libellé` : `${m.code} · VIDE`);
        expect(`${m.code} · journal`).toBe(m.journal.trim().length > 0 ? `${m.code} · journal` : `${m.code} · VIDE`);
        // Au moins un débit et au moins un crédit · une écriture à sens
        // unique ne s'équilibre jamais.
        expect(`${m.code} · débit`).toBe(
          m.lignes.some((l) => l.sens === 'DEBIT') ? `${m.code} · débit` : `${m.code} · AUCUN`,
        );
        expect(`${m.code} · crédit`).toBe(
          m.lignes.some((l) => l.sens === 'CREDIT') ? `${m.code} · crédit` : `${m.code} · AUCUN`,
        );
      }
    }
  });
});
