import { TauxTvaService } from './taux-tva.service';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';

/**
 * LA NATURE FISCALE SE LIT À LA CONTREPARTIE (art. 6 et 8), PAS AU COMPTE DE TVA.
 *
 * Le module lisait la nature de l'opération sur la racine du compte de TVA,
 * en tenant le routage de `client/src/lib/tva-syscohada.ts` pour une
 * qualification fiscale. Ce routage suit la NOMENCLATURE COMPTABLE ; les
 * art. 6 et 8 de l'O.-L. n° 10/001 qualifient l'OPÉRATION. Deux comptes le
 * prouvent, et ce sont les deux plus fréquents en cabinet.
 *
 * 707 · `compteTvaCollectee` envoie TOUTE la racine au 44310000 « TVA facturée
 * sur ventes », classé BIENS. Le plan y sème le 70720000 « Commissions et
 * courtages », le 70730000 « Locations » et le 70760000 « Redevances pour
 * brevets, logiciels, marques et droits similaires ». L'art. 8 (fichier
 * `code-general-2026/references/10-tva-ol10-001-loi-base-ch1-10.md`, l. 165-186)
 * range parmi les prestations de services « les locations de biens meubles »,
 * « les opérations portant sur des biens meubles incorporels » et « les
 * opérations d'entremise ». L'art. 25, 2° les rend exigibles à l'ENCAISSEMENT :
 * une commission facturée en mars et encaissée en juin était déclarée en mars.
 *
 * 605 · toute la racine 60 part au 44520000, classé BIENS. Le 60510000 est
 * « Fournitures non stockables - Eau » et le 60520000 « … Électricité », que
 * l'art. 8 nomme en toutes lettres : « la fourniture d'eau, d'électricité, de
 * gaz, d'énergie thermique et des biens similaires ». Le droit à déduction
 * naissait dès la facture au lieu de naître à l'exigibilité chez le
 * fournisseur (art. 37 al. 1, décret n° 011/42 art. 96).
 *
 * ET CE QUI PORTE DEUX SENS N'EST PAS TRANCHÉ · le 60580000 « Achats de
 * travaux, matériels et équipements » porte des travaux (services) et des
 * matériels (biens) sous un seul numéro. Il rend INDETERMINEE, et la
 * déclaration annonce le repli avec son montant.
 */

const TAUX = {
  id: 'tx16',
  code: 'TVA16',
  intitule: 'TVA 16 %',
  taux: 16,
  compteCollecteId: 'c443',
  compteDeductibleId: 'c445',
};

interface Lettrage {
  statut: 'PARTIEL' | 'SOLDE';
  solde: number;
  soldeAt: Date | null;
  reglements: Array<{ date: string; montant: number }>;
}

const impayee = (tiers: number): Lettrage => ({ statut: 'PARTIEL', solde: tiers, soldeAt: null, reglements: [] });
const regleeEnJuin = (tiers: number): Lettrage => ({
  statut: 'SOLDE',
  solde: 0,
  soldeAt: new Date('2026-09-30'),
  reglements: [{ date: '2026-06-12', montant: tiers }],
});

/**
 * Une ligne de TVA, sa contrepartie de TIERS (qui date l'encaissement) et sa
 * contrepartie de PRODUIT ou de CHARGE (qui porte la nature de l'opération).
 * C'est cette seconde contrepartie que la requête de la déclaration ne
 * chargeait pas côté vente, faute de classe 7 dans son filtre.
 */
function ligne(opts: {
  compteTva: string;
  contrepartie: string;
  date: string;
  tva: number;
  tiers: number;
  lettrage: Lettrage;
}) {
  const sens = opts.compteTva.startsWith('443') ? 'VENTE' : 'ACHAT';
  const classe = `CLASSE_${opts.contrepartie[0]}`;
  const groupe = {
    ...opts.lettrage,
    lignes: [
      {
        debit: sens === 'VENTE' ? opts.tiers : 0,
        credit: sens === 'ACHAT' ? opts.tiers : 0,
        ecriture: { date: new Date(opts.date) },
      },
      ...opts.lettrage.reglements.map((r) => ({
        debit: sens === 'ACHAT' ? r.montant : 0,
        credit: sens === 'VENTE' ? r.montant : 0,
        ecriture: { date: new Date(r.date) },
      })),
    ],
  };
  return {
    id: `l-${opts.compteTva}-${opts.contrepartie}-${opts.date}`,
    tauxTvaId: TAUX.id,
    compte: { numero: opts.compteTva },
    debit: sens === 'ACHAT' ? opts.tva : 0,
    credit: sens === 'VENTE' ? opts.tva : 0,
    ecriture: {
      date: new Date(opts.date),
      lignes: [
        {
          debit: sens === 'VENTE' ? opts.tiers : 0,
          credit: sens === 'ACHAT' ? opts.tiers : 0,
          compte: { numero: sens === 'VENTE' ? '41100000' : '40100000', classe: 'CLASSE_4' },
          lettrage: groupe,
        },
        {
          debit: sens === 'ACHAT' ? opts.tiers - opts.tva : 0,
          credit: sens === 'VENTE' ? opts.tiers - opts.tva : 0,
          compte: { numero: opts.contrepartie, classe },
          lettrage: null,
        },
      ],
    },
  };
}

function service(regime: 'LIVRAISONS' | 'ENCAISSEMENTS' | 'DEBITS', lignesTva: unknown[]) {
  const prisma = {
    tenant: {
      findUnique: jest.fn().mockResolvedValue({ id: 't1', regimeExigibiliteTva: regime, referentiel: 'SYSCOHADA' }),
    },
    tauxTva: { findMany: jest.fn().mockResolvedValue([TAUX]) },
    ligneEcriture: {
      findMany: jest.fn().mockResolvedValue(lignesTva),
      aggregate: jest.fn().mockResolvedValue({ _sum: { credit: 0, debit: 0 } }),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    liquidationTva: { findFirst: jest.fn().mockResolvedValue(null) },
  } as unknown as PrismaService;
  return new TauxTvaService(prisma, {} as EcritureService);
}

const MARS = new Date('2026-03-01');
const FIN_MARS = new Date('2026-03-31T23:59:59.999Z');
const JUIN = new Date('2026-06-01');
const FIN_JUIN = new Date('2026-06-30T23:59:59.999Z');

/*
  UNE DOUBLURE NE FILTRE RIEN, ET C'EST LÀ QUE CE SPEC POUVAIT MENTIR.

  Les tests qui suivent posent la contrepartie de produit ou de charge dans
  l'écriture et vérifient que la nature en est tirée. Mais la doublure de
  `ligneEcriture.findMany` rend ce qu'on lui donne, sans jamais appliquer le
  `where` de la requête réelle : retirer la classe 7 du filtre de production
  les laissait tous passer. En production, la contrepartie ne serait pas
  chargée et la nature retomberait sur le numéro du compte de TVA, c'est-à-dire
  exactement sur le défaut corrigé.

  Ce premier test lit donc le `where` que le service DEMANDE, et non ce que la
  doublure lui rend.
*/
describe('La requête charge bien les contreparties qui portent la nature', () => {
  it('demande les lignes de classe 7, 6 et 2 en plus des tiers de classe 4', async () => {
    const s = service('ENCAISSEMENTS', []);
    await s.declaration('t1', MARS, FIN_MARS);
    const prisma = (s as unknown as { prisma: { ligneEcriture: { findMany: jest.Mock } } }).prisma;
    const appels = prisma.ligneEcriture.findMany.mock.calls.map((c) => JSON.stringify(c[0]));
    const requete = appels.find((a) => a.includes('lettrage'));
    expect(requete).toBeDefined();
    for (const classe of ['CLASSE_7', 'CLASSE_6', 'CLASSE_2', 'CLASSE_4']) {
      expect(requete).toContain(classe);
    }
  });
});

describe('TVA collectée · le 707 ne fait pas de tout une vente de biens (art. 8)', () => {
  it('une COMMISSION (70720000) impayée n’est pas exigible, malgré son compte de TVA 4431', async () => {
    // « les opérations d'entremise » · art. 8. Exigible à l'encaissement
    // (art. 25, 2°). Le compte de TVA dit 4431, donc BIENS : c'est la
    // nomenclature comptable, pas la loi fiscale.
    const s = service('LIVRAISONS', [
      ligne({
        compteTva: '44310000',
        contrepartie: '70720000',
        date: '2026-03-10',
        tva: 160_000,
        tiers: 1_160_000,
        lettrage: impayee(1_160_000),
      }),
    ]);
    const d = await s.declaration('t1', MARS, FIN_MARS);
    expect(d.totalCollecte).toBe(0);
    expect(d.tvaEnAttenteEncaissement).toBe(160_000);
  });

  it('la même commission, encaissée en juin, tombe dans la déclaration de JUIN', async () => {
    const s = service('LIVRAISONS', [
      ligne({
        compteTva: '44310000',
        contrepartie: '70720000',
        date: '2026-03-10',
        tva: 160_000,
        tiers: 1_160_000,
        lettrage: regleeEnJuin(1_160_000),
      }),
    ]);
    expect((await s.declaration('t1', MARS, FIN_MARS)).totalCollecte).toBe(0);
    expect((await s.declaration('t1', JUIN, FIN_JUIN)).totalCollecte).toBe(160_000);
  });

  it('une LOCATION (70730000) et une REDEVANCE (70760000) suivent la même règle', async () => {
    // « les locations de biens meubles » et « les opérations portant sur des
    // biens meubles incorporels » · art. 8.
    for (const contrepartie of ['70730000', '70760000']) {
      const s = service('LIVRAISONS', [
        ligne({
          compteTva: '44310000',
          contrepartie,
          date: '2026-03-10',
          tva: 160_000,
          tiers: 1_160_000,
          lettrage: impayee(1_160_000),
        }),
      ]);
      const d = await s.declaration('t1', MARS, FIN_MARS);
      expect(d.totalCollecte).toBe(0);
      expect(d.tvaEnAttenteEncaissement).toBe(160_000);
    }
  });

  it('une VENTE DE MARCHANDISES (70110000) reste exigible à la livraison', async () => {
    // La correction ne doit pas retourner le défaut principal déjà corrigé :
    // l'art. 25, 1° ne connaît aucune option pour les livraisons de biens.
    const s = service('ENCAISSEMENTS', [
      ligne({
        compteTva: '44310000',
        contrepartie: '70110000',
        date: '2026-03-10',
        tva: 1_600_000,
        tiers: 11_600_000,
        lettrage: impayee(11_600_000),
      }),
    ]);
    const d = await s.declaration('t1', MARS, FIN_MARS);
    expect(d.totalCollecte).toBe(1_600_000);
    expect(d.tvaEnAttenteEncaissement).toBe(0);
  });

  it('une écriture qui MÊLE une vente de marchandises et une commission ne tranche pas', async () => {
    // Deux contreparties de natures différentes sur la même pièce · la nature
    // devient INDETERMINEE, et la déclaration annonce le repli avec son
    // montant. Choisir l'une des deux serait inventer.
    const l = ligne({
      compteTva: '44310000',
      contrepartie: '70110000',
      date: '2026-03-10',
      tva: 160_000,
      tiers: 1_160_000,
      lettrage: impayee(1_160_000),
    });
    l.ecriture.lignes.push({
      debit: 0,
      credit: 500_000,
      compte: { numero: '70720000', classe: 'CLASSE_7' },
      lettrage: null,
    });
    const d = await service('ENCAISSEMENTS', [l]).declaration('t1', MARS, FIN_MARS);
    // Repli sur le paramètre du dossier, ENCAISSEMENTS · rien n'est collecté,
    // et la mention le dit.
    expect(d.totalCollecte).toBe(0);
    expect(d.mentionExigibilite).toContain('REPLI DÉCLARÉ');
  });
});

describe('TVA déductible · le 605 n’est pas un achat de biens (art. 8)', () => {
  it('une facture d’ÉLECTRICITÉ (60520000) n’est déductible qu’au paiement du fournisseur', async () => {
    // « la fourniture d'eau, d'électricité, de gaz, d'énergie thermique et des
    // biens similaires » · art. 8. Le droit à déduction naît quand la taxe
    // devient exigible CHEZ LE FOURNISSEUR (art. 37 al. 1, décret art. 96),
    // donc à son encaissement. Déduire en mars une facture réglée en juin est
    // une déduction anticipée, réintégrable.
    const s = service('LIVRAISONS', [
      ligne({
        compteTva: '44520000',
        contrepartie: '60520000',
        date: '2026-03-10',
        tva: 160_000,
        tiers: 1_160_000,
        lettrage: regleeEnJuin(1_160_000),
      }),
    ]);
    expect((await s.declaration('t1', MARS, FIN_MARS)).totalDeductible).toBe(0);
    expect((await s.declaration('t1', JUIN, FIN_JUIN)).totalDeductible).toBe(160_000);
  });

  it('l’EAU (60510000) et les ÉTUDES (60570000) suivent la même règle', async () => {
    for (const contrepartie of ['60510000', '60570000']) {
      const s = service('LIVRAISONS', [
        ligne({
          compteTva: '44520000',
          contrepartie,
          date: '2026-03-10',
          tva: 160_000,
          tiers: 1_160_000,
          lettrage: regleeEnJuin(1_160_000),
        }),
      ]);
      expect((await s.declaration('t1', MARS, FIN_MARS)).totalDeductible).toBe(0);
      expect((await s.declaration('t1', JUIN, FIN_JUIN)).totalDeductible).toBe(160_000);
    }
  });

  it('un ACHAT DE MARCHANDISES (60110000) reste déductible dès la facture', async () => {
    const s = service('ENCAISSEMENTS', [
      ligne({
        compteTva: '44520000',
        contrepartie: '60110000',
        date: '2026-03-10',
        tva: 1_600_000,
        tiers: 11_600_000,
        lettrage: impayee(11_600_000),
      }),
    ]);
    expect((await s.declaration('t1', MARS, FIN_MARS)).totalDeductible).toBe(1_600_000);
  });

  it('le 60580000 « travaux, matériels et équipements » porte DEUX sens et n’est pas tranché', async () => {
    // Un seul numéro pour des travaux (services, art. 8) et des matériels
    // (biens, art. 6). Le repli du dossier joue, et il est ANNONCÉ.
    const s = service('ENCAISSEMENTS', [
      ligne({
        compteTva: '44520000',
        contrepartie: '60580000',
        date: '2026-03-10',
        tva: 160_000,
        tiers: 1_160_000,
        lettrage: impayee(1_160_000),
      }),
    ]);
    const d = await s.declaration('t1', MARS, FIN_MARS);
    expect(d.totalDeductible).toBe(0);
    expect(d.mentionExigibilite).toContain('REPLI DÉCLARÉ');
  });
});

describe('Article 26, alinéa 3 · l’encaissement antérieur au débit est DÉCLARÉ, jamais supposé résolu', () => {
  it('un dossier aux DÉBITS voit sa TVA sur services annoncée avec la réserve de l’alinéa 3', async () => {
    // « Elle ne dispense pas le redevable de s'acquitter de la taxe sur la
    // valeur ajoutée au moment de l'encaissement du prix ou de l'acompte si
    // celui-ci intervient avant les débits. » Le schéma supposait la facture
    // « la plus précoce des deux dans le cas usuel » · l'avance sur marché et
    // l'acompte à la commande sont précisément le cas que l'alinéa réserve, et
    // ils s'enregistrent en avance reçue, sans ligne de taxe.
    const s = service('DEBITS', [
      ligne({
        compteTva: '44320000',
        contrepartie: '70610000',
        date: '2026-03-10',
        tva: 320_000,
        tiers: 2_320_000,
        lettrage: impayee(2_320_000),
      }),
    ]);
    const d = await s.declaration('t1', MARS, FIN_MARS);
    expect(d.totalCollecte).toBe(320_000);
    expect(d.mentionExigibilite).toContain('ENCAISSEMENT ANTÉRIEUR AU DÉBIT, NON VÉRIFIÉ');
    // `toLocaleString('fr-FR')` sépare les milliers par une espace fine
    // insécable · l'écrire en dur ici ferait passer le test pour un test de
    // formatage. Le montant est donc relu tel que la mention le rend.
    expect(d.mentionExigibilite).toContain(`${(320_000).toLocaleString('fr-FR')} CDF de TVA collectée`);
    expect(d.mentionExigibilite).toContain('avance reçue');
  });

  it('un dossier qui n’est PAS aux débits ne porte pas cette réserve', async () => {
    const s = service('ENCAISSEMENTS', [
      ligne({
        compteTva: '44320000',
        contrepartie: '70610000',
        date: '2026-03-10',
        tva: 320_000,
        tiers: 2_320_000,
        lettrage: impayee(2_320_000),
      }),
    ]);
    const d = await s.declaration('t1', MARS, FIN_MARS);
    expect(d.mentionExigibilite).not.toContain('ENCAISSEMENT ANTÉRIEUR AU DÉBIT');
  });
});
