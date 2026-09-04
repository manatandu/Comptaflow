import { TauxTvaService } from './taux-tva.service';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';

/**
 * LE DÉNOMINATEUR DU PRORATA N'EST PAS « TOUTE LA CLASSE 7 » (art. 43).
 *
 * « Cette fraction est le rapport entre : / - le montant annuel des recettes
 * afférentes aux opérations ouvrant droit à déduction […] / - et le montant
 * annuel des recettes de toute nature réalisées par l'assujetti À L'EXCLUSION
 * des cessions d'éléments de l'actif immobilisé, des subventions
 * d'équipements, des indemnités d'assurance ne constituant pas la contrepartie
 * d'une opération soumise à la taxe sur la valeur ajoutée et des débours. »
 * Et plus bas : « Le montant des livraisons et des prestations à soi-même est
 * exclu des DEUX termes du rapport. »
 *
 * Le code sommait tout le crédit de classe 7, et le commentaire qui le
 * justifiait affirmait que ces postes n'y arrivaient jamais. Le semis dit le
 * contraire sur les quatre : 72 « Production immobilisée », 754 « Produits des
 * cessions courantes d'immobilisations » (que le module immobilisations
 * alimente réellement), 75820000 « Indemnités d'assurances reçues » et
 * 79900000 « Reprises de subventions d'investissement » sont tous en
 * CLASSE_7. Chacun gonfle le dénominateur, abaisse le prorata et fait PERDRE
 * de la déduction au contribuable.
 *
 * LES RACINES NE SONT PAS LES MÊMES DANS LES DEUX PLANS · le 754 du SYSCOHADA
 * est une cession d'immobilisation, celui du SYCEBNL est « Dons en nature
 * courants », une recette ordinaire. Une liste commune serait fausse pour l'un
 * des deux, et ce spec le vérifie dans les deux sens.
 */

interface LigneClasse7 {
  numero: string;
  credit: number;
  ecritureId?: string;
}

interface LigneTva {
  numero: string;
  credit: number;
  taux: number;
  ecritureId?: string;
}

function service(
  referentiel: 'SYSCOHADA' | 'SYCEBNL',
  opts: { tva?: LigneTva[]; classe7?: LigneClasse7[] },
) {
  const tva = opts.tva ?? [];
  const classe7 = opts.classe7 ?? [];
  const requetesNumerateur: Record<string, unknown>[] = [];
  const prisma = {
    tenant: { findUnique: jest.fn().mockResolvedValue({ referentiel }) },
    ligneEcriture: {
      // Numérateur · les lignes de TVA COLLECTÉE (443) taguées à un taux.
      findMany: jest.fn().mockImplementation(({ where }: { where: Record<string, unknown> }) => {
        const compte = where.compte as { numero?: { startsWith?: string } } | undefined;
        const racine = compte?.numero?.startsWith;
        if (!racine) return Promise.resolve([]);
        requetesNumerateur.push(where);
        return Promise.resolve(
          tva
            .filter((l) => l.numero.startsWith(racine))
            .map((l) => ({
              credit: l.credit,
              ecritureId: l.ecritureId ?? 'e1',
              compte: { numero: l.numero },
              tauxTva: { taux: l.taux },
            })),
        );
      }),
      aggregate: jest.fn().mockImplementation(({ where }: { where: Record<string, unknown> }) => {
        const compte = where.compte as
          | { OR?: { numero: { startsWith: string } }[]; NOT?: { numero: { startsWith: string } }[] }
          | undefined;
        // Reprise des recettes des écritures au taux ZÉRO · porte les mêmes
        // exclusions, en NOT.
        if (where.ecritureId) {
          const ids = (where.ecritureId as { in: string[] }).in;
          const exclues = (compte?.NOT ?? []).map((c) => c.numero.startsWith);
          const somme = classe7
            .filter((l) => ids.includes(l.ecritureId ?? 'e1') && !exclues.some((r) => l.numero.startsWith(r)))
            .reduce((s, l) => s + l.credit, 0);
          return Promise.resolve({ _sum: { credit: somme } });
        }
        // Recettes EXCLUES du dénominateur.
        if (compte?.OR) {
          const racines = compte.OR.map((c) => c.numero.startsWith);
          const somme = classe7
            .filter((l) => racines.some((r) => l.numero.startsWith(r)))
            .reduce((s, l) => s + l.credit, 0);
          return Promise.resolve({ _sum: { credit: somme } });
        }
        // Toutes les recettes de classe 7.
        return Promise.resolve({ _sum: { credit: classe7.reduce((s, l) => s + l.credit, 0) } });
      }),
    },
  } as unknown as PrismaService;
  return { svc: new TauxTvaService(prisma, {} as EcritureService), requetesNumerateur };
}

const DEBUT = new Date('2026-01-01');
const FIN = new Date('2026-12-31');

describe('Prorata · les exclusions du dénominateur (art. 43)', () => {
  it('la CESSION COURANTE d’immobilisation (754) sort du dénominateur en SYSCOHADA', async () => {
    // Le cas de l'auditeur : un transporteur assujetti partiel, 100 000 000 de
    // recettes taxables, 20 000 000 d'exonérées, 30 000 000 de camions cédés
    // en cession courante. Prorata légal 100/120 = 84 % · le logiciel calculait
    // 100/150 = 67 %, soit 2 720 000 FC de déduction perdue sur 16 000 000 de
    // TVA d'amont.
    const { svc: s } = service('SYSCOHADA', {
      tva: [{ numero: '44310000', credit: 16_000_000, taux: 16 }],
      classe7: [
        { numero: '70100000', credit: 100_000_000 },
        { numero: '70600000', credit: 20_000_000 },
        { numero: '75420000', credit: 30_000_000 },
      ],
    });
    const p = await s.calculerProrata('t1', DEBUT, FIN);
    expect(p.numerateur).toBe(100_000_000);
    expect(p.recettesClasse7).toBe(150_000_000);
    expect(p.recettesExclues).toBe(30_000_000);
    expect(p.denominateur).toBe(120_000_000);
    expect(p.pourcentage).toBe(84);
  });

  it('la PRODUCTION IMMOBILISÉE (72), les INDEMNITÉS D’ASSURANCE (7582) et les REPRISES DE SUBVENTIONS D’INVESTISSEMENT (799) en sortent aussi', async () => {
    const { svc: s } = service('SYSCOHADA', {
      tva: [{ numero: '44310000', credit: 16_000_000, taux: 16 }],
      classe7: [
        { numero: '70100000', credit: 100_000_000 },
        { numero: '72210000', credit: 10_000_000 },
        { numero: '75820000', credit: 5_000_000 },
        { numero: '79900000', credit: 25_000_000 },
      ],
    });
    const p = await s.calculerProrata('t1', DEBUT, FIN);
    expect(p.recettesExclues).toBe(40_000_000);
    expect(p.denominateur).toBe(100_000_000);
    expect(p.pourcentage).toBe(100);
  });

  it('la SUBVENTION D’EXPLOITATION (71) reste au dénominateur · l’article n’exclut que l’ÉQUIPEMENT', async () => {
    // Ne pas exclure au-delà du texte : une exclusion inventée gonflerait le
    // prorata et ferait déduire plus que de droit.
    const { svc: s } = service('SYSCOHADA', {
      tva: [{ numero: '44310000', credit: 16_000_000, taux: 16 }],
      classe7: [
        { numero: '70100000', credit: 100_000_000 },
        { numero: '71810000', credit: 100_000_000 },
      ],
    });
    const p = await s.calculerProrata('t1', DEBUT, FIN);
    expect(p.recettesExclues).toBe(0);
    expect(p.denominateur).toBe(200_000_000);
    expect(p.pourcentage).toBe(50);
  });

  it('en SYCEBNL, le 754 « Dons en nature courants » RESTE au dénominateur', async () => {
    // Même numéro, tout autre objet · une liste d'exclusions commune aux deux
    // plans retirerait ici une recette ordinaire et gonflerait le prorata.
    const { svc: s } = service('SYCEBNL', {
      tva: [{ numero: '44310000', credit: 16_000_000, taux: 16 }],
      classe7: [
        { numero: '70510000', credit: 100_000_000 },
        { numero: '75420000', credit: 100_000_000 },
      ],
    });
    const p = await s.calculerProrata('t1', DEBUT, FIN);
    expect(p.racinesExclues).not.toContain('754');
    expect(p.recettesExclues).toBe(0);
    expect(p.denominateur).toBe(200_000_000);
    expect(p.pourcentage).toBe(50);
  });

  it('la LIVRAISON À SOI-MÊME est exclue des DEUX termes', async () => {
    // Art. 43 in fine. Au numérateur, elle se repère au 4434 (SYSCOHADA) ; au
    // dénominateur, à sa contrepartie de classe 7, le compte 72.
    const { svc: s } = service('SYSCOHADA', {
      tva: [
        { numero: '44310000', credit: 16_000_000, taux: 16 },
        { numero: '44340000', credit: 8_000_000, taux: 16 },
      ],
      classe7: [
        { numero: '70100000', credit: 100_000_000 },
        { numero: '72210000', credit: 50_000_000 },
      ],
    });
    const p = await s.calculerProrata('t1', DEBUT, FIN);
    // 50 000 000 de production immobilisée absents des deux côtés.
    expect(p.numerateur).toBe(100_000_000);
    expect(p.denominateur).toBe(100_000_000);
    expect(p.pourcentage).toBe(100);
  });

  it('le numérateur ne lit QUE la TVA collectée · un avoir fournisseur n’est pas une recette', async () => {
    // Il balayait toutes les lignes taguées d'un taux, 445 comprises. Un avoir
    // fournisseur, qui crédite le 445, s'y ajoutait comme s'il était une vente
    // et gonflait le prorata.
    const { svc, requetesNumerateur } = service('SYSCOHADA', {
      tva: [
        { numero: '44310000', credit: 8_000_000, taux: 16 },
        { numero: '44520000', credit: 8_000_000, taux: 16 },
      ],
      classe7: [{ numero: '70100000', credit: 100_000_000 }],
    });
    const p = await svc.calculerProrata('t1', DEBUT, FIN);
    expect(requetesNumerateur).toHaveLength(1);
    expect((requetesNumerateur[0].compte as { numero: { startsWith: string } }).numero.startsWith).toBe('443');
    expect(p.numerateur).toBe(50_000_000);
    expect(p.pourcentage).toBe(50);
  });

  it('un rapport EXACT ne gagne pas un point par l’arrondi · 55 % reste 55 %', async () => {
    // « Ce rapport exprimé en pourcentage est dénommé prorata. Il est arrondi à
    // l'unité supérieure » (art. 43). Calculé en virgule flottante, un rapport
    // exact de 55 % ressort à 55,00000000000001 et l'unité supérieure le
    // porterait à 56 % · un point de déduction au-delà de ce que la loi admet.
    const { svc: s } = service('SYSCOHADA', {
      tva: [{ numero: '44310000', credit: 8_800_000, taux: 16 }],
      classe7: [{ numero: '70100000', credit: 100_000_000 }],
    });
    const p = await s.calculerProrata('t1', DEBUT, FIN);
    expect(p.numerateur).toBe(55_000_000);
    expect(p.pourcentage).toBe(55);
  });

  it('un rapport INEXACT est bien porté à l’unité supérieure', async () => {
    // 60 000 000 / 121 000 000 = 49,58 % · l'article veut 50 %.
    const { svc: s } = service('SYSCOHADA', {
      tva: [{ numero: '44310000', credit: 9_600_000, taux: 16 }],
      classe7: [{ numero: '70100000', credit: 121_000_000 }],
    });
    const p = await s.calculerProrata('t1', DEBUT, FIN);
    expect(p.pourcentage).toBe(50);
  });

  it('annonce ce qu’il a retranché ET ce qu’il n’a pas pu retrancher (les débours)', async () => {
    // Les débours sont exclus par l'article et n'ont de compte dédié dans
    // aucun des deux plans · le dire vaut mieux que le taire.
    const { svc: s } = service('SYSCOHADA', {
      tva: [{ numero: '44310000', credit: 16_000_000, taux: 16 }],
      classe7: [
        { numero: '70100000', credit: 100_000_000 },
        { numero: '75420000', credit: 30_000_000 },
      ],
    });
    const p = await s.calculerProrata('t1', DEBUT, FIN);
    expect(p.mentionDenominateur).toContain('article 43');
    expect(p.mentionDenominateur).toContain('DÉBOURS');
    expect(p.racinesExclues).toEqual(expect.arrayContaining(['72', '7582', '799', '754']));
  });
});
