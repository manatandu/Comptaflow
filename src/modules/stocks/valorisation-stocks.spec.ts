import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  METHODES_ADMISES,
  methodeCompatible,
  valoriser,
  type MouvementAValoriser,
} from './valorisation-stocks';

/**
 * LA VALORISATION DES BIENS FONGIBLES · trois méthodes sur cinq, et l'axiome
 * qui les fonde.
 */

let n = 0;
const entree = (date: string, quantite: number, cout: number): MouvementAValoriser => ({
  ordre: n++,
  date,
  sens: 'ENTREE',
  quantite,
  cout,
});
const sortie = (date: string, quantite: number, cout: number | null = null): MouvementAValoriser => ({
  ordre: n++,
  date,
  sens: 'SORTIE',
  quantite,
  cout,
});

beforeEach(() => {
  n = 0;
});

describe('Valorisation · les trois méthodes admises, et les deux qui ne le sont pas', () => {
  it('la liste porte EXACTEMENT les trois noms du glossaire', () => {
    // « Parmi ces cinq méthodes, le SYSTÈME COMPTABLE OHADA EN ACCEPTE TROIS :
    // P.E.P.S. ; C.M.P.A.C.E. ; C.M.P. de période de stockage. »
    expect([...METHODES_ADMISES]).toEqual(['PEPS', 'CMPACE', 'CMP_PERIODE_STOCKAGE']);
  });

  it('LE COÛT MOYEN ANNUEL ET LE D.E.P.S. N’Y SONT PAS, et la source le dit', () => {
    /*
      LE PIÈGE DE CE CHANTIER, et il aurait été invisible. Le chapitre des
      comptes abrège en « coût moyen pondéré (C.M.P.) », ce qui autoriserait
      n'importe quelle moyenne. Le glossaire en distingue TROIS et n'en accepte
      que deux : le COÛT MOYEN PONDÉRÉ ANNUEL figure parmi les cinq et PAS
      parmi les trois admises. C'est pourtant la forme la plus répandue dans
      les logiciels de la place.

      On gèle une PRÉSENCE, pas une absence de mot (règle de la passe F9) : la
      liste est comparée à l'identique, et le commentaire de la source porte la
      citation qui la justifie.
    */
    const source = readFileSync(join(__dirname, 'valorisation-stocks.ts'), 'utf8');
    expect(source).toContain('EN ACCEPTE\n * TROIS');
    expect(source).toContain('coût moyen pondéré ANNUEL');
    expect(source).toContain('D.E.P.S.');
    expect(METHODES_ADMISES).toHaveLength(3);
  });

  it('chaque méthode est appariée à UN mode de tenue, et le texte les apparie', () => {
    // « Cette dernière méthode est compatible avec la pratique de l'inventaire
    // INTERMITTENT, alors que les deux autres reposent sur celle de
    // l'inventaire PERMANENT. »
    expect(methodeCompatible('PEPS', 'PERMANENT')).toBe(true);
    expect(methodeCompatible('CMPACE', 'PERMANENT')).toBe(true);
    expect(methodeCompatible('CMP_PERIODE_STOCKAGE', 'PERMANENT')).toBe(false);
    expect(methodeCompatible('CMP_PERIODE_STOCKAGE', 'INTERMITTENT')).toBe(true);
    expect(methodeCompatible('PEPS', 'INTERMITTENT')).toBe(false);
  });

  it('le CMP de période de stockage est DÉCLARÉ non calculé, avec sa définition', () => {
    // Une lacune tue se lit comme une dispense (leçon de la passe F1).
    const v = valoriser([entree('2026-01-10', 10, 1_000)], 'CMP_PERIODE_STOCKAGE');
    expect(v.refus[0].motif).toBe('METHODE_NON_IMPLEMENTEE');
    expect(v.refus[0].explication).toContain("DATE D'ENTRÉE MOYENNE");
    expect(v.refus[0].explication).toContain('Notes annexes');
  });
});

describe('Valorisation · P.E.P.S., « au prix d’entrée des articles les plus anciens »', () => {
  it('consomme les couches dans leur ordre d’arrivée', () => {
    // 10 à 100 puis 10 à 150 · une sortie de 15 prend les 10 premières à 100
    // et 5 des suivantes à 150, soit 1 000 + 750 = 1 750.
    const v = valoriser(
      [entree('2026-01-10', 10, 1_000), entree('2026-02-10', 10, 1_500), sortie('2026-03-10', 15)],
      'PEPS',
    );
    expect(v.mouvements[2].valeur).toBe(1_750);
    expect(v.quantiteFinale).toBe(5);
    expect(v.valeurFinale).toBe(750);
  });

  it('le stock final est évalué « à des prix récents »', () => {
    // C'est la propriété que le glossaire attribue au P.E.P.S. · les 5 unités
    // restantes valent 150 pièce, le prix de la dernière entrée.
    const v = valoriser(
      [entree('2026-01-10', 10, 1_000), entree('2026-02-10', 10, 1_500), sortie('2026-03-10', 15)],
      'PEPS',
    );
    expect(v.valeurFinale / v.quantiteFinale).toBe(150);
  });

  it('l’ordre CHRONOLOGIQUE l’emporte sur l’ordre de saisie', () => {
    // Une entrée saisie après coup mais datée d'avant change le résultat · la
    // lire dans l'ordre de saisie rendrait un autre chiffre.
    const tardive = { ordre: 9, date: '2026-01-05', sens: 'ENTREE' as const, quantite: 10, cout: 500 };
    const v = valoriser([entree('2026-02-10', 10, 1_500), tardive, sortie('2026-03-10', 10)], 'PEPS');
    expect(v.mouvements[0].date).toBe('2026-01-05');
    expect(v.mouvements[2].valeur).toBe(500);
  });
});

describe('Valorisation · C.M.P.A.C.E., « au coût moyen du stock détenu à la date de la sortie »', () => {
  it('recalcule la moyenne à CHAQUE entrée', () => {
    // 10 à 100 puis 10 à 150 · moyenne 125. Une sortie de 15 vaut 1 875.
    const v = valoriser(
      [entree('2026-01-10', 10, 1_000), entree('2026-02-10', 10, 1_500), sortie('2026-03-10', 15)],
      'CMPACE',
    );
    expect(v.mouvements[2].valeur).toBe(1_875);
    expect(v.valeurFinale).toBe(625);
    expect(v.valeurFinale / v.quantiteFinale).toBe(125);
  });

  it('LES DEUX MÉTHODES NE DONNENT PAS LE MÊME CHIFFRE, et c’est le propos', () => {
    // Si elles coïncidaient, le choix n'aurait pas à être mentionné en Notes
    // annexes. 1 750 en P.E.P.S. contre 1 875 en C.M.P.A.C.E.
    const mouvements = () => [
      entree('2026-01-10', 10, 1_000),
      entree('2026-02-10', 10, 1_500),
      sortie('2026-03-10', 15),
    ];
    n = 0;
    const peps = valoriser(mouvements(), 'PEPS');
    n = 0;
    const cmpace = valoriser(mouvements(), 'CMPACE');
    expect(peps.mouvements[2].valeur).not.toEqual(cmpace.mouvements[2].valeur);
  });
});

describe('Valorisation · L’AXIOME DU GLOSSAIRE, vérifié sur les deux méthodes', () => {
  /*
    « L'axiomatique comptable impose une égalité systématique, dans tout compte,
    des sorties et des entrées EN VALEURS, dès lors que toutes les unités
    entrées sont sorties. »

    C'est la propriété qui fonde les trois méthodes admises et qui exclut les
    autres. Elle se vérifie AU CENTIME, et c'est pour elle que la dernière
    sortie prend la valeur RESTANTE plutôt qu'un dernier produit quantité ×
    coût moyen · sinon un résidu d'arrondi resterait au magasin, c'est-à-dire
    un stock de valeur non nulle sur une quantité nulle.
  */
  const jeuQuiSeVide = () => [
    entree('2026-01-10', 7, 1_000),
    entree('2026-02-10', 11, 2_000),
    sortie('2026-03-10', 5),
    entree('2026-04-10', 13, 900),
    sortie('2026-05-10', 9),
    sortie('2026-06-10', 17),
  ];

  it.each(['PEPS', 'CMPACE'] as const)(
    'tout ce qui est entré ressort pour la même valeur · %s',
    (methode) => {
      n = 0;
      const v = valoriser(jeuQuiSeVide(), methode);
      expect(v.refus).toEqual([]);
      expect(v.quantiteFinale).toBe(0);
      expect(v.valeurFinale).toBe(0);
      expect(v.totalSorties).toBeCloseTo(v.totalEntrees, 10);
      expect(v.totalEntrees).toBe(3_900);
    },
  );

  it.each(['PEPS', 'CMPACE'] as const)(
    'le magasin ne porte jamais une valeur sans quantité · %s',
    (methode) => {
      n = 0;
      const v = valoriser(jeuQuiSeVide(), methode);
      for (const m of v.mouvements) {
        if (m.quantiteApres === 0) expect(m.valeurApres).toBe(0);
      }
    },
  );

  it.each(['PEPS', 'CMPACE'] as const)(
    'AUCUN RÉSIDU D’ARRONDI quand la division ne tombe pas juste · %s',
    (methode) => {
      /*
        LE TEST QUI NE PROUVAIT RIEN, ET LA RÉINJECTION L'A DIT.

        La première version de ce bloc valorisait un jeu dont toutes les
        divisions tombaient juste : retirer la prise de la valeur RESTANTE sur
        la dernière sortie ne changeait pas un centime, et le test passait au
        vert sur un code fautif. Un test qui n'a pas été VU ÉCHOUER ne protège
        rien (CLAUDE.md § 10 bis).

        LE JEU D'ESSAI A DÛ ÊTRE CHERCHÉ, et c'est instructif : le flottant
        IEEE-754 ramène 3 × (100/3) à exactement 100, si bien qu'un cas
        « qui ne tombe pas juste » choisi d'intuition ne prouvait toujours
        rien. 29 pour 7 unités, lui, rend 29.000000000000004 · le magasin
        garderait alors une valeur NÉGATIVE de 3,6·10⁻¹⁵ sur une quantité
        nulle. Sur un état, cela se lit « stock de -0,00 » · un chiffre
        qu'aucun comptable ne peut expliquer.
      */
      n = 0;
      const v = valoriser([entree('2026-01-10', 7, 29), sortie('2026-02-10', 7)], methode);
      expect(v.quantiteFinale).toBe(0);
      expect(v.valeurFinale).toBe(0);
      expect(v.totalSorties).toBe(29);
      expect(v.totalSorties).toBe(v.totalEntrees);
    },
  );
});

describe('Valorisation · les refus, et ce qu’ils empêchent', () => {
  it('UNE SORTIE NE PORTE JAMAIS SON COÛT', () => {
    // C'est le refus central : un coût imposé rompt le raccordement des
    // sorties aux entrées, et le stock cesse d'être leur différence.
    const v = valoriser([entree('2026-01-10', 10, 1_000), sortie('2026-02-10', 5, 900)], 'PEPS');
    expect(v.refus[0].motif).toBe('SORTIE_AVEC_COUT_IMPOSE');
    expect(v.refus[0].explication).toContain('raccordement');
    // Et le magasin reste intact · le mouvement fautif est écarté, pas appliqué.
    expect(v.quantiteFinale).toBe(10);
  });

  it('une entrée SANS coût est refusée', () => {
    const v = valoriser([{ ordre: 0, date: '2026-01-10', sens: 'ENTREE', quantite: 10, cout: null }], 'PEPS');
    expect(v.refus[0].motif).toBe('ENTREE_SANS_COUT');
  });

  it('un coût NÉGATIF est refusé · une remise se déduit, elle ne s’entre pas', () => {
    const v = valoriser([entree('2026-01-10', 10, -500)], 'PEPS');
    expect(v.refus[0].motif).toBe('ENTREE_COUT_NEGATIF');
    expect(v.refus[0].explication).toContain('DÉDUISENT');
  });

  it('UN STOCK NE DESCEND PAS SOUS ZÉRO', () => {
    const v = valoriser([entree('2026-01-10', 10, 1_000), sortie('2026-02-10', 15)], 'PEPS');
    expect(v.refus[0].motif).toBe('SORTIE_SUPERIEURE_AU_STOCK');
    expect(v.refus[0].explication).toContain('10');
    expect(v.quantiteFinale).toBe(10);
  });

  it('une quantité nulle ou négative est refusée · le SENS dit déjà la direction', () => {
    const v = valoriser([entree('2026-01-10', 0, 0), sortie('2026-02-10', -3)], 'PEPS');
    expect(v.refus.map((r) => r.motif)).toEqual([
      'QUANTITE_NON_POSITIVE',
      'QUANTITE_NON_POSITIVE',
    ]);
  });

  it('UN REFUS N’EMPORTE PAS LES AUTRES MOUVEMENTS', () => {
    const v = valoriser(
      [entree('2026-01-10', 10, 1_000), sortie('2026-02-10', 99), sortie('2026-03-10', 4)],
      'PEPS',
    );
    expect(v.refus).toHaveLength(1);
    expect(v.quantiteFinale).toBe(6);
    expect(v.valeurFinale).toBe(600);
  });
});
