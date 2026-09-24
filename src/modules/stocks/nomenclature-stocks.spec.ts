import { Referentiel } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  correspondancesDuReferentiel,
  motifHorsVariation,
  variationDuCompte,
  STOCKS_HORS_VARIATION_AUTOMATIQUE,
} from './nomenclature-stocks';

/**
 * CE QU'ON AFFIRME DU PLAN SE VÉRIFIE CONTRE LE PLAN.
 *
 * Règle sortie de la passe F2b, et elle n'a jamais autant compté qu'ici :
 * douze numéros du cycle des stocks changent de sens entre les deux plans.
 * Un test qui se contenterait d'éprouver la fonction contre ses propres
 * constantes tournerait en rond · c'est la PRÉMISSE qui doit être vérifiée,
 * et elle vit dans les deux fichiers de semis.
 */

const racineDepot = join(__dirname, '..', '..', '..');

/**
 * Extrait toutes les paires (numéro, intitulé) d'un fichier de semis.
 *
 * DEUX MOTIFS, UN PAR SORTE DE GUILLEMET, et ce n'est pas une coquetterie.
 * Un motif unique refermé sur une classe `[^'"]` laisse tomber tout intitulé
 * en guillemets DOUBLES qui porte une apostrophe · « Biens liés à
 * l'activité », « Variations des stocks d'autres approvisionnements ».
 * C'est-à-dire précisément les comptes que ce fichier existe pour vérifier :
 * le recensement rendait `undefined` et les assertions tombaient sur le test,
 * pas sur la table.
 */
function semis(chemin: string): Map<string, string> {
  const source = readFileSync(join(racineDepot, chemin), 'utf8');
  const paires = new Map<string, string>();
  const motifs = [
    /['"]([0-9]{2,8})['"],\s*'([^']*)'/g,
    /['"]([0-9]{2,8})['"],\s*"([^"]*)"/g,
  ];
  for (const motif of motifs) {
    let trouve: RegExpExecArray | null;
    while ((trouve = motif.exec(source)) !== null) {
      if (!paires.has(trouve[1])) paires.set(trouve[1], trouve[2]);
    }
  }
  return paires;
}

const SEMIS = {
  [Referentiel.SYCEBNL]: semis('src/modules/comptes/compte-seed.ts'),
  [Referentiel.SYSCOHADA]: semis('src/modules/comptes/compte-seed-syscohada.ts'),
};

/**
 * Un compte est semé soit sous sa racine (en-tête de division), soit complété
 * à droite par des zéros jusqu'à huit chiffres (CLAUDE.md § 7).
 */
function intituleSeme(referentiel: Referentiel, racine: string): string | undefined {
  const table = SEMIS[referentiel];
  return table.get(racine) ?? table.get(racine.padEnd(8, '0'));
}

describe('Nomenclature des stocks · la prémisse se vérifie contre les deux semis', () => {
  it('le recensement trouve quelque chose · un garde-fou vide ne vérifie rien', () => {
    // Même précaution que `modales-dans-l-ecran.spec.ts` : si l'extracteur
    // cesse de reconnaître la forme des semis, tous les tests ci-dessous
    // passeraient au vert sans rien éprouver.
    expect(SEMIS[Referentiel.SYCEBNL].size).toBeGreaterThan(500);
    expect(SEMIS[Referentiel.SYSCOHADA].size).toBeGreaterThan(500);
  });

  it.each([Referentiel.SYCEBNL, Referentiel.SYSCOHADA])(
    'chaque racine de stock ET son compte de variation sont ouverts au plan · %s',
    (referentiel) => {
      for (const c of correspondancesDuReferentiel(referentiel)) {
        expect(intituleSeme(referentiel, c.racine)).toBeDefined();
        expect(intituleSeme(referentiel, c.variation)).toBeDefined();
      }
    },
  );

  it.each([Referentiel.SYCEBNL, Referentiel.SYSCOHADA])(
    'chaque compte de VARIATION est IMPUTABLE, jamais un en-tête de division · %s',
    (referentiel) => {
      /*
        LE TEST QUI A TROUVÉ L'ERREUR, ET IL VAUT D'ÊTRE EXPLIQUÉ.

        La première version de la table renvoyait le 34 vers le 734 et le 35
        vers le 735. Les deux numéros existent au plan, les deux portent le bon
        intitulé, et les deux sont des EN-TÊTES DE DIVISION · le Titre VII
        n'ouvre sous eux que 7341, 7342, 7351 et 7352. Un compte TOTAL ne
        reçoit jamais d'écriture (CLAUDE.md § 7) : la proposition aurait été
        refusée à la saisie, APRÈS que le comptable a tout chiffré.

        Vérifier que le numéro « existe au plan » ne suffisait pas · il existe.
        Ce qui distingue un compte imputable d'un en-tête est sa forme SEMÉE :
        un compte d'imputation est complété à droite par des zéros jusqu'à huit
        chiffres, un en-tête reste court (CLAUDE.md § 7). On exige donc la
        forme COMPLÉTÉE, et rien d'autre.
      */
      const table = SEMIS[referentiel];
      for (const c of correspondancesDuReferentiel(referentiel)) {
        expect({
          compte: c.variation,
          semeCommeImputable: table.has(c.variation.padEnd(8, '0')),
        }).toEqual({ compte: c.variation, semeCommeImputable: true });
      }
    },
  );

  it.each([Referentiel.SYCEBNL, Referentiel.SYSCOHADA])(
    'chaque racine hors variation automatique existe bien au plan · %s',
    (referentiel) => {
      // Une abstention posée sur un compte qui n'existe pas serait une
      // réserve pour rien, et elle survivrait à une refonte du plan sans que
      // personne ne s'en aperçoive.
      for (const h of STOCKS_HORS_VARIATION_AUTOMATIQUE) {
        if (!h.referentiels.includes(referentiel)) continue;
        expect(intituleSeme(referentiel, h.racine)).toBeDefined();
      }
    },
  );
});

describe('Nomenclature des stocks · UN NUMÉRO, DEUX SENS, et le plan le confirme', () => {
  /*
    LA PLUS GRANDE OCCURRENCE DU PREMIER PIÈGE DU DÉPÔT. Les précédentes
    (192, 4181, 1061/1062, 38/37, 397, 70510000, 601, les deux articles 11,
    les trois « trois exercices », le 7041, les deux textes n° 23/10) n'en
    portaient qu'UNE. Ici il y en a douze d'un coup, et chacune de ces
    assertions est le mot que le semis donne réellement au numéro.
  */
  const DISCRIMINANTS: Array<[string, string, string]> = [
    // [numéro, mot attendu au SYSCOHADA, mot attendu au SYCEBNL]
    ['31', 'Marchandises', 'Biens liés'],
    ['34', 'Produits en cours', 'Dons en nature'],
    ['36', 'Produits finis', 'intermédiaires'],
    ['60310000', 'marchandises', 'biens et services liés'],
    ['60320000', 'matières premières', 'marchandises'],
  ];

  it.each(DISCRIMINANTS)(
    'le %s ne veut pas dire la même chose dans les deux plans',
    (numero, motSyscohada, motSycebnl) => {
      const seyscohada = intituleSeme(Referentiel.SYSCOHADA, numero);
      const sycebnl = intituleSeme(Referentiel.SYCEBNL, numero);
      expect(seyscohada).toBeDefined();
      expect(sycebnl).toBeDefined();
      expect(seyscohada).toContain(motSyscohada);
      expect(sycebnl).toContain(motSycebnl);
      expect(seyscohada).not.toEqual(sycebnl);
    },
  );

  it('le 31 part au 6031 des DEUX côtés, et ce n’est pas la même variation', () => {
    // C'est la forme la plus coûteuse du piège : les deux numéros coïncident,
    // l'écriture s'équilibre, et le compte de résultat publie la variation
    // d'un stock que l'entité n'a pas.
    const societe = variationDuCompte('31100000', Referentiel.SYSCOHADA);
    const association = variationDuCompte('31100000', Referentiel.SYCEBNL);
    expect(societe?.variation).toBe('6031');
    expect(association?.variation).toBe('6031');
    expect(societe?.intitule).toBe('Marchandises');
    expect(association?.intitule).toBe("Biens liés à l'activité");
    expect(intituleSeme(Referentiel.SYSCOHADA, '60310000')).toContain('marchandises');
    expect(intituleSeme(Referentiel.SYCEBNL, '60310000')).toContain('biens et services liés');
  });
});

describe('Nomenclature des stocks · la plus longue racine l’emporte', () => {
  it('le 32 du SYCEBNL se sépare en DEUX comptes de variation', () => {
    // Le texte l'impose : « par le crédit : du compte 6032 Variations des
    // stocks de marchandises ET du compte 6033 Variations des stocks de
    // matières premières et fournitures liées ». Une correspondance posée sur
    // la racine 32 entière porterait les matières au compte des marchandises.
    expect(variationDuCompte('32100000', Referentiel.SYCEBNL)?.variation).toBe('6032');
    expect(variationDuCompte('32300000', Referentiel.SYCEBNL)?.variation).toBe('6033');
    expect(variationDuCompte('32500000', Referentiel.SYCEBNL)?.variation).toBe('6033');
  });

  it('le 37 du SYSCOHADA sépare produits intermédiaires et produits résiduels', () => {
    expect(variationDuCompte('37100000', Referentiel.SYSCOHADA)?.variation).toBe('7371');
    expect(variationDuCompte('37200000', Referentiel.SYSCOHADA)?.variation).toBe('7372');
  });

  it('un compte hors classe 3 ne rend aucune variation', () => {
    expect(variationDuCompte('60110000', Referentiel.SYSCOHADA)).toBeNull();
    expect(variationDuCompte('41100000', Referentiel.SYCEBNL)).toBeNull();
  });
});

describe('Nomenclature des stocks · ce qui est NOMMÉ hors de la variation automatique', () => {
  it('les dons en nature du SYCEBNL portent leur motif, et il parle d’extourne', () => {
    const don = motifHorsVariation('34100000', Referentiel.SYCEBNL);
    expect(don).not.toBeNull();
    expect(don?.motif).toContain('EXTOURNÉES');
    expect(don?.motif).toContain('4713');
    // Et il n'a AUCUNE variation automatique.
    expect(variationDuCompte('34100000', Referentiel.SYCEBNL)).toBeNull();
  });

  it('le même 34 est un stock ORDINAIRE au SYSCOHADA · produits en cours', () => {
    // La borne de référentiel est ce qui empêche l'exception d'en fabriquer
    // une autre · c'est la leçon du 704 au chantier des modèles de saisie.
    expect(motifHorsVariation('34100000', Referentiel.SYSCOHADA)).toBeNull();
    expect(variationDuCompte('34100000', Referentiel.SYSCOHADA)?.variation).toBe('7341');
  });

  it('les stocks en cours de route disent que le 603 dépend de la NATURE du bien', () => {
    // SYSCOHADA au 38, SYCEBNL au 37 · le même objet sous deux numéros.
    const route = motifHorsVariation('38100000', Referentiel.SYSCOHADA);
    expect(route?.motif).toContain('CONCERNÉS');
    const routeEbnl = motifHorsVariation('37200000', Referentiel.SYCEBNL);
    expect(routeEbnl?.motif).toContain('603');
  });

  it('la dépréciation n’est pas une variation · elle passe par le 6593 et le 7593', () => {
    for (const r of [Referentiel.SYCEBNL, Referentiel.SYSCOHADA]) {
      const dep = motifHorsVariation('39100000', r);
      expect(dep?.motif).toContain('6593');
      expect(dep?.motif).toContain('7593');
      expect(variationDuCompte('39100000', r)).toBeNull();
    }
  });
});

describe('388 · hors de la variation automatique, avec SON mécanisme', () => {
  it('le 388 du SYSCOHADA n’est pas servi comme un stock en cours de route', () => {
    const m = motifHorsVariation('38800000', Referentiel.SYSCOHADA);
    expect(m?.racine).toBe('388');
    expect(m?.motif).toContain('le compte 388 est SOLDÉ par le débit du compte 603');
    // Le 381 reste, lui, un stock en cours de route.
    expect(motifHorsVariation('38100000', Referentiel.SYSCOHADA)?.racine).toBe('38');
  });
});
