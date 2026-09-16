import { TauxTvaService } from './taux-tva.service';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';

/**
 * DÉCRET N° 011/42 D'APPLICATION DE LA TVA · ce que la passe F3a a corrigé.
 *
 * 1 · LA LOCATION-VENTE EST UNE LIVRAISON DE BIENS (art. 10 du décret, art. 6
 * de la loi). Le décret la nomme trois fois : l'art. 10 la range parmi les
 * livraisons de biens meubles corporels, l'art. 51 l'EXCLUT expressément de la
 * règle des décomptes et paiements successifs, l'art. 52 la date « lors du
 * transfert du pouvoir de disposer d'un bien comme propriétaire ». Le compte
 * 62340000 « Location-vente » est semé aux DEUX plans, et la table des
 * contreparties classait toute la racine 62 en SERVICES · la taxe d'amont
 * était donc datée de l'encaissement au lieu du fait générateur, et la
 * déduction différée jusqu'à risquer la déchéance de l'art. 37 al. 2.
 *
 * 2 · LE RÉFÉRENTIEL NE FERME PLUS LA LECTURE DE LA CONTREPARTIE. La méthode
 * commençait par écarter tout dossier non SYSCOHADA, au motif que « le plan
 * SYCEBNL ne subdivise ni 443 ni 445 ». Le motif était vrai et la conclusion a
 * cessé de l'être quand la passe F2a a déplacé la lecture de la nature du
 * compte de TVA vers la CONTREPARTIE : les classes 6 des deux plans portent
 * les mêmes numéros sous les mêmes intitulés.
 *
 * 3 · CE QUI RESTE FERMÉ, ET POURQUOI · LA CLASSE 7. Le 70510000 est « Dans la
 * Région » au SYSCOHADA, sous 705 « Travaux facturés », donc un SERVICE ; il
 * est « Ventes de marchandises » au SYCEBNL. Ouvrir la table des produits aux
 * deux plans daterait une vente de marchandises à l'encaissement et MINORERAIT
 * la déclaration · le défaut aurait été créé par la correction.
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

function service(
  regime: 'LIVRAISONS' | 'ENCAISSEMENTS' | 'DEBITS',
  lignesTva: unknown[],
  referentiel: 'SYSCOHADA' | 'SYCEBNL' = 'SYSCOHADA',
) {
  const prisma = {
    tenant: { findUnique: jest.fn().mockResolvedValue({ id: 't1', regimeExigibiliteTva: regime, referentiel }) },
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

describe('Article 10 du décret · la location-vente est une LIVRAISON DE BIENS', () => {
  it('le 62340000 est déductible dès la facture, malgré la racine 62 classée SERVICES', async () => {
    for (const referentiel of ['SYSCOHADA', 'SYCEBNL'] as const) {
      const s = service(
        'ENCAISSEMENTS',
        [
          ligne({
            compteTva: '44520000',
            contrepartie: '62340000',
            date: '2026-03-10',
            tva: 1_600_000,
            tiers: 11_600_000,
            lettrage: impayee(11_600_000),
          }),
        ],
        referentiel,
      );
      expect((await s.declaration('t1', MARS, FIN_MARS)).totalDeductible).toBe(1_600_000);
    }
  });

  it('une AUTRE charge de la racine 62 reste un service · l’exception ne déborde pas', async () => {
    // 62230000 « Locations de matériels et outillages » · une location simple
    // n'est pas une location-vente, et l'art. 17 du décret la range parmi les
    // prestations de services.
    const s = service('ENCAISSEMENTS', [
      ligne({
        compteTva: '44540000',
        contrepartie: '62230000',
        date: '2026-03-10',
        tva: 160_000,
        tiers: 1_160_000,
        lettrage: impayee(1_160_000),
      }),
    ]);
    expect((await s.declaration('t1', MARS, FIN_MARS)).totalDeductible).toBe(0);
  });
});

describe('Article 17 du décret · un dossier SYCEBNL lit sa contrepartie de charge comme un autre', () => {
  it('l’ÉLECTRICITÉ (60520000) d’un dossier SYCEBNL n’est déductible qu’au paiement', async () => {
    // Le refus en bloc opposé au SYCEBNL déduisait cette facture dès mars, au
    // motif que « aucune nature n'y est lisible ». Le 60520000 est semé au
    // plan SYCEBNL sous le même intitulé qu'au SYSCOHADA.
    const s = service(
      'LIVRAISONS',
      [
        ligne({
          compteTva: '44520000',
          contrepartie: '60520000',
          date: '2026-03-10',
          tva: 160_000,
          tiers: 1_160_000,
          lettrage: regleeEnJuin(1_160_000),
        }),
      ],
      'SYCEBNL',
    );
    expect((await s.declaration('t1', MARS, FIN_MARS)).totalDeductible).toBe(0);
    const juin = await s.declaration('t1', new Date('2026-06-01'), new Date('2026-06-30T23:59:59.999Z'));
    expect(juin.totalDeductible).toBe(160_000);
  });

  it('mais son 60110000 ne tranche PAS · le SYCEBNL y sème « biens ET services »', async () => {
    // Divergence réelle des deux plans : le 601 est « Achats de marchandises »
    // au SYSCOHADA, « Achats de biens et services liés à l'activité » au
    // SYCEBNL. Un seul numéro, deux natures : le compte ne tranche pas.
    const s = service(
      'ENCAISSEMENTS',
      [
        ligne({
          compteTva: '44520000',
          contrepartie: '60110000',
          date: '2026-03-10',
          tva: 1_600_000,
          tiers: 11_600_000,
          lettrage: impayee(11_600_000),
        }),
      ],
      'SYCEBNL',
    );
    const d = await s.declaration('t1', MARS, FIN_MARS);
    expect(d.totalDeductible).toBe(0);
    expect(d.mentionExigibilite).toContain('REPLI DÉCLARÉ');
  });

  it('le même 60110000 tranche BIENS au SYSCOHADA · son plan, lui, le dit', async () => {
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
});

describe('La classe 7 reste fermée au SYCEBNL, et c’est ce qui évite un défaut neuf', () => {
  it('une vente SYCEBNL portée au 70510000 n’est PAS datée comme un travail facturé', async () => {
    // 70510000 · « Dans la Région » (705 Travaux facturés, un SERVICE) au
    // SYSCOHADA, « Ventes de marchandises » (un BIEN) au SYCEBNL. Si la table
    // des produits s'appliquait aux deux plans, cette vente serait différée
    // jusqu'à son encaissement et la déclaration de mars serait MINORÉE.
    const s = service(
      'LIVRAISONS',
      [
        ligne({
          compteTva: '44310000',
          contrepartie: '70510000',
          date: '2026-03-10',
          tva: 1_600_000,
          tiers: 11_600_000,
          lettrage: impayee(11_600_000),
        }),
      ],
      'SYCEBNL',
    );
    const d = await s.declaration('t1', MARS, FIN_MARS);
    // Repli DÉCLARÉ sur le paramètre du dossier, et non SERVICES.
    expect(d.tvaEnAttenteEncaissement).toBe(0);
    expect(d.totalCollecte).toBe(1_600_000);
    expect(d.mentionExigibilite).toContain('REPLI DÉCLARÉ');
  });

  it('au SYSCOHADA, le même numéro reste un travail facturé', async () => {
    const s = service('LIVRAISONS', [
      ligne({
        compteTva: '44330000',
        contrepartie: '70510000',
        date: '2026-03-10',
        tva: 1_600_000,
        tiers: 11_600_000,
        lettrage: impayee(11_600_000),
      }),
    ]);
    const d = await s.declaration('t1', MARS, FIN_MARS);
    expect(d.totalCollecte).toBe(0);
    expect(d.tvaEnAttenteEncaissement).toBe(1_600_000);
  });
});

describe('Les deux réserves du décret sont ANNONCÉES, faute de pouvoir être calculées', () => {
  it('la déclaration nomme le contrat d’abonnement (art. 55) et l’effet de commerce (art. 57)', async () => {
    const s = service('ENCAISSEMENTS', []);
    const d = await s.declaration('t1', MARS, FIN_MARS);
    expect(d.mentionExigibilite).toContain('CONTRAT D’ABONNEMENT');
    expect(d.mentionExigibilite).toContain('art. 55');
    expect(d.mentionExigibilite).toContain('EFFET DE COMMERCE');
    expect(d.mentionExigibilite).toContain('remise à l’escompte');
  });
});
