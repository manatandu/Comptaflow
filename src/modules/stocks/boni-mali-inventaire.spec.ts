import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Referentiel } from '@prisma/client';
import {
  confronterInventaire,
  lignesDeLaRegularisation,
  type ArticleAConfronter,
} from './boni-mali-inventaire';
import type { MouvementAValoriser } from './valorisation-stocks';

/**
 * LE JEU D'ESSAI SE CHERCHE QUAND IL DOIT PORTER UNE PROPRIÉTÉ NUMÉRIQUE
 * (CLAUDE.md § valorisation).
 *
 * Le premier jeu écrit ici sortait 150 unités sur 300 : le P.E.P.S. vidait
 * alors ENTIÈREMENT la couche à 12, le magasin ne gardait qu'une seule couche,
 * et le coût P.E.P.S. du mali (15) coïncidait avec le coût moyen (15). Le
 * défaut « valoriser le mali au coût moyen même en P.E.P.S. » passait donc
 * inaperçu · la réinjection l'a dit.
 *
 * Il faut que le magasin garde DEUX couches à des coûts différents :
 *
 *   100 à 12, puis 200 à 15, puis une sortie de 50. Il reste 250 unités.
 *    · P.E.P.S. · la sortie a pris 50 à 12 ; restent 50 à 12 et 200 à 15,
 *      soit 3 600, et le prochain départ part à 12 ;
 *    · C.M.P.A.C.E. · le coût moyen vaut (1 200 + 3 000) / 300 = 14 ; la
 *      sortie a pris 700, il reste 250 à 14, soit 3 500.
 *
 * Un mali de 10 unités vaut donc 120 en P.E.P.S. et 140 en C.M.P.A.C.E. Les
 * deux chiffres diffèrent, et ils diffèrent aussi de la valeur moyenne du
 * stock P.E.P.S. (3 600 / 250 = 14,40) · c'est ce troisième écart qui attrape
 * la confusion entre « la méthode » et « la moyenne du magasin ».
 */
const MOUVEMENTS: MouvementAValoriser[] = [
  { ordre: 1, date: '2026-01-05', sens: 'ENTREE', quantite: 100, cout: 1200 },
  { ordre: 2, date: '2026-02-10', sens: 'ENTREE', quantite: 200, cout: 3000 },
  { ordre: 3, date: '2026-03-15', sens: 'SORTIE', quantite: 50, cout: null },
];

function article(over: Partial<ArticleAConfronter> = {}): ArticleAConfronter {
  return {
    articleId: 'a1',
    code: 'ART-001',
    designation: 'Ciment 50 kg',
    uniteMesure: 'sac',
    compteNumero: '33100000',
    compteIntitule: 'Autres approvisionnements',
    methode: 'CMPACE',
    mouvements: MOUVEMENTS,
    quantitePhysique: 250,
    ...over,
  };
}

describe("boni et mali d'inventaire", () => {
  describe("le mode de tenue décide, et lui seul", () => {
    it("REFUSE tout boni et tout mali en inventaire INTERMITTENT", () => {
      const r = confronterInventaire([article({ quantitePhysique: 240 })], Referentiel.SYSCOHADA, 'INTERMITTENT');
      expect(r.differences).toEqual([]);
      expect(r.refus).toHaveLength(1);
      expect(r.refus[0].motif).toBe('INVENTAIRE_INTERMITTENT');
      // La borne vient du texte, pas d'une prudence : le message doit la citer.
      expect(r.refus[0].explication).toContain('PERMANENT');
    });

    it("le MÊME écart produit une différence en inventaire PERMANENT", () => {
      const r = confronterInventaire([article({ quantitePhysique: 240 })], Referentiel.SYSCOHADA, 'PERMANENT');
      expect(r.refus).toEqual([]);
      expect(r.differences).toHaveLength(1);
      expect(r.differences[0].sens).toBe('MALI');
    });
  });

  describe('le mali est une sortie, et la méthode le valorise', () => {
    it('C.M.P.A.C.E. · dix sacs manquants valent dix fois le coût moyen en vigueur', () => {
      const r = confronterInventaire([article({ quantitePhysique: 240 })], Referentiel.SYSCOHADA, 'PERMANENT');
      const d = r.differences[0];
      expect(d.quantiteComptable).toBe(250);
      expect(d.ecartQuantite).toBe(-10);
      expect(d.coutUnitaireRetenu).toBe(14);
      expect(d.montant).toBe(140);
      expect(r.totalMali).toBe(140);
      expect(r.totalBoni).toBe(0);
    });

    it('P.E.P.S. · le même écart vaut 150, et non 140', () => {
      const r = confronterInventaire(
        [article({ methode: 'PEPS', quantitePhysique: 240 })],
        Referentiel.SYSCOHADA,
        'PERMANENT',
      );
      const d = r.differences[0];
      // 12, le coût de la couche la plus ancienne ENCORE EN STOCK · ni 14
      // (le coût moyen C.M.P.A.C.E.), ni 14,40 (la moyenne du magasin P.E.P.S.).
      expect(d.coutUnitaireRetenu).toBe(12);
      expect(d.montant).toBe(120);
      expect(d.fondementDuCout).toContain('P.E.P.S.');
    });

    it("le mali qui vide le magasin prend la valeur restante EXACTEMENT", () => {
      // Sans la règle de la dernière sortie, un résidu d'arrondi resterait au
      // magasin · une valeur non nulle sur une quantité nulle.
      const r = confronterInventaire(
        [
          article({
            methode: 'CMPACE',
            mouvements: [{ ordre: 1, date: '2026-01-05', sens: 'ENTREE', quantite: 7, cout: 29 }],
            quantitePhysique: 0,
          }),
        ],
        Referentiel.SYSCOHADA,
        'PERMANENT',
      );
      expect(r.differences[0].montant).toBe(29);
    });
  });

  describe("le boni est une entrée, et les deux méthodes ne répondent pas pareil", () => {
    it("C.M.P.A.C.E. · le boni prend le coût moyen en vigueur, sans rien demander", () => {
      const r = confronterInventaire([article({ quantitePhysique: 260 })], Referentiel.SYSCOHADA, 'PERMANENT');
      const d = r.differences[0];
      expect(d.sens).toBe('BONI');
      expect(d.ecartQuantite).toBe(10);
      expect(d.coutUnitaireRetenu).toBe(14);
      expect(d.montant).toBe(140);
      expect(r.totalBoni).toBe(140);
    });

    it("P.E.P.S. · le boni est REFUSÉ tant que le coût et sa source ne sont pas donnés", () => {
      const r = confronterInventaire(
        [article({ methode: 'PEPS', quantitePhysique: 260 })],
        Referentiel.SYSCOHADA,
        'PERMANENT',
      );
      expect(r.differences).toEqual([]);
      expect(r.refus[0].motif).toBe('COUT_DU_BONI_NON_FOURNI');
    });

    it('P.E.P.S. · un coût SANS SA SOURCE ne suffit pas', () => {
      const r = confronterInventaire(
        [article({ methode: 'PEPS', quantitePhysique: 260, coutUnitaireBoni: 15 })],
        Referentiel.SYSCOHADA,
        'PERMANENT',
      );
      expect(r.refus[0].motif).toBe('COUT_DU_BONI_NON_FOURNI');
    });

    it('P.E.P.S. · le coût et sa source ouvrent la proposition, et la source est conservée', () => {
      const r = confronterInventaire(
        [
          article({
            methode: 'PEPS',
            quantitePhysique: 260,
            coutUnitaireBoni: 15,
            sourceCoutBoni: 'facture F-2026-037 du 10/02/2026',
          }),
        ],
        Referentiel.SYSCOHADA,
        'PERMANENT',
      );
      expect(r.differences[0].montant).toBe(150);
      expect(r.differences[0].coutUnitaireRetenu).toBe(15);
      expect(r.differences[0].fondementDuCout).toContain('facture F-2026-037');
    });
  });

  describe("le sens de l'écriture, que les deux textes écrivent", () => {
    it('un BONI débite le stock et crédite la variation', () => {
      const r = confronterInventaire([article({ quantitePhysique: 260 })], Referentiel.SYSCOHADA, 'PERMANENT');
      const lignes = lignesDeLaRegularisation(r.differences);
      expect(lignes.map((l) => [l.compte, l.sens, l.montant])).toEqual([
        ['33100000', 'DEBIT', 140],
        ['6033', 'CREDIT', 140],
      ]);
    });

    it('un MALI débite la variation et crédite le stock', () => {
      const r = confronterInventaire([article({ quantitePhysique: 240 })], Referentiel.SYSCOHADA, 'PERMANENT');
      const lignes = lignesDeLaRegularisation(r.differences);
      expect(lignes.map((l) => [l.compte, l.sens, l.montant])).toEqual([
        ['33100000', 'CREDIT', 140],
        ['6033', 'DEBIT', 140],
      ]);
    });

    it("l'écriture est équilibrée quel que soit le mélange de bonis et de malis", () => {
      const r = confronterInventaire(
        [
          article({ articleId: 'a1', code: 'A1', quantitePhysique: 260 }),
          article({ articleId: 'a2', code: 'A2', quantitePhysique: 240 }),
        ],
        Referentiel.SYSCOHADA,
        'PERMANENT',
      );
      const lignes = lignesDeLaRegularisation(r.differences);
      const debit = lignes.filter((l) => l.sens === 'DEBIT').reduce((s, l) => s + l.montant, 0);
      const credit = lignes.filter((l) => l.sens === 'CREDIT').reduce((s, l) => s + l.montant, 0);
      expect(debit).toBe(credit);
    });
  });

  describe('la contrepartie vient du référentiel, jamais du numéro seul', () => {
    it("le compte 33 ne rend PAS la même variation dans les deux plans", () => {
      const sys = confronterInventaire([article({ quantitePhysique: 240 })], Referentiel.SYSCOHADA, 'PERMANENT');
      const syc = confronterInventaire([article({ quantitePhysique: 240 })], Referentiel.SYCEBNL, 'PERMANENT');
      expect(sys.differences[0].compteVariation).toBe('6033');
      expect(syc.differences[0].compteVariation).toBe('6034');
      expect(sys.differences[0].compteVariation).not.toBe(syc.differences[0].compteVariation);
    });

    it("un compte hors variation automatique est REFUSÉ avec son motif, jamais rattaché d'office", () => {
      // Le 34 du SYCEBNL est « Dons en nature » · aucun schéma de variation.
      const r = confronterInventaire(
        [article({ compteNumero: '34100000', quantitePhysique: 240 })],
        Referentiel.SYCEBNL,
        'PERMANENT',
      );
      expect(r.differences).toEqual([]);
      expect(r.refus[0].motif).toBe('HORS_VARIATION_AUTOMATIQUE');
      // Le motif du catalogue doit être RENDU, pas un objet interpolé.
      expect(r.refus[0].explication).not.toContain('[object Object]');
      expect(r.refus[0].explication).toContain('extourn');
    });
  });

  describe('les refus, et ce qu\'ils n\'emportent pas', () => {
    it("« pas encore compté » n'est pas zéro", () => {
      const r = confronterInventaire(
        [article({ quantitePhysique: null })],
        Referentiel.SYSCOHADA,
        'PERMANENT',
      );
      expect(r.differences).toEqual([]);
      expect(r.refus[0].motif).toBe('QUANTITE_PHYSIQUE_ABSENTE');
    });

    it("un article refusé n'emporte pas les autres", () => {
      const r = confronterInventaire(
        [
          article({ articleId: 'a1', code: 'A1', quantitePhysique: null }),
          article({ articleId: 'a2', code: 'A2', quantitePhysique: 240 }),
          article({ articleId: 'a3', code: 'A3', quantitePhysique: 250 }),
        ],
        Referentiel.SYSCOHADA,
        'PERMANENT',
      );
      expect(r.refus.map((x) => x.code)).toEqual(['A1']);
      expect(r.differences.map((d) => d.code)).toEqual(['A2']);
      expect(r.sansDifference.map((d) => d.code)).toEqual(['A3']);
    });

    it("une fiche qui ne se valorise pas ne se chiffre pas", () => {
      const r = confronterInventaire(
        [
          article({
            mouvements: [{ ordre: 1, date: '2026-01-05', sens: 'ENTREE', quantite: 100, cout: null }],
            quantitePhysique: 90,
          }),
        ],
        Referentiel.SYSCOHADA,
        'PERMANENT',
      );
      expect(r.differences).toEqual([]);
      expect(r.refus[0].motif).toBe('MAGASIN_NON_VALORISABLE');
    });

    it("un écart NUL n'est pas une différence", () => {
      const r = confronterInventaire([article()], Referentiel.SYSCOHADA, 'PERMANENT');
      expect(r.differences).toEqual([]);
      expect(r.refus).toEqual([]);
      expect(r.sansDifference).toEqual([{ articleId: 'a1', code: 'ART-001', quantite: 250 }]);
    });
  });

  describe('ce que la SOURCE doit porter, et qu\'aucun jeu d\'essai ne montre', () => {
    const source = readFileSync(join(__dirname, 'boni-mali-inventaire.ts'), 'utf8');

    it("les deux textes sont cités, et jamais l'un pour l'autre", () => {
      expect(source).toContain('AUDCIF, Titre VII, COMPTE 603');
      expect(source).toContain('SYCEBNL, Partie 2 ch. 3');
    });

    it("l'art. 43 est nommé POUR DIRE qu'il ne s'oppose pas au boni", () => {
      // On gèle la PRÉSENCE de la distinction, jamais l'absence d'un mot :
      // interdire « art. 43 » ferait tomber le test sur le commentaire qui
      // explique précisément pourquoi il ne s'applique pas (leçon F9).
      expect(source).toContain("L'ART. 43 NE S'OPPOSE PAS AU BONI");
      // ANCRÉ SUR LA STRUCTURE, JAMAIS SUR UNE DISTANCE (CLAUDE.md § 10) · un
      // seuil de caractères mesure la longueur du commentaire, pas ce qu'il
      // dit, et il tombe au premier mot ajouté. On découpe le paragraphe et on
      // cherche la distinction dedans.
      const paragraphe = source.slice(
        source.indexOf("2 · L'ART. 43"),
        source.indexOf('3 · LA CONTREPARTIE'),
      );
      expect(paragraphe).not.toBe('');
      expect(paragraphe).toContain('VALEURS');
      expect(paragraphe).toContain('UNITÉS');
      expect(paragraphe).toContain('caisse');
    });

    it("aucun numéro de compte de variation n'est écrit en dur dans ce fichier", () => {
      // La nomenclature est la SEULE source des numéros, et elle les tient
      // avec leur référentiel. Un littéral ici recréerait le premier piège du
      // dépôt · douze numéros sur quatorze changent de sens entre les plans.
      const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(code).not.toMatch(/['"`]60(3[1-4]|35)['"`]/);
      expect(code).not.toMatch(/['"`]7(3[4-7]|36)['"`]/);
    });
  });
});
