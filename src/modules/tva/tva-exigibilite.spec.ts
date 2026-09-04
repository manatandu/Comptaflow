import { TauxTvaService } from './taux-tva.service';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';

/**
 * EXIGIBILITÉ DE LA TVA · ordonnance-loi n° 10/001, art. 25, 26 et 37.
 *
 * Le point que ces tests figent n'est PAS le montant de la taxe (le logiciel
 * ne la liquide pas, il totalise ce que la comptabilité porte) mais la
 * PÉRIODE dans laquelle elle tombe.
 *
 * ET CETTE PÉRIODE SUIT L'OPÉRATION, PAS LE DOSSIER. L'art. 25 range les
 * livraisons de biens au fait générateur (1°) et les prestations de services
 * et travaux immobiliers à l'encaissement (2°) : une PME qui vend des
 * marchandises ET facture des prestations doit dater les deux différemment
 * DANS LA MÊME DÉCLARATION. Le logiciel en faisait un réglage de dossier
 * (`Tenant.regimeExigibiliteTva`), si bien qu'aucun des deux réglages n'était
 * juste pour elle : aux ENCAISSEMENTS il différait la TVA de ses ventes de
 * marchandises, exigible à la livraison (minoration de déclaration,
 * redressement) ; aux LIVRAISONS il faisait verser la taxe de prestations non
 * encaissées.
 *
 * La nature se lit AU COMPTE, que la saisie guidée impute déjà : 4431 ventes,
 * 4432 prestations de services, 4433 travaux · 4452 achats, 4453 transport,
 * 4454 services extérieurs. Le plan SYCEBNL ne subdivise pas : la nature y est
 * INDÉTERMINÉE, le paramètre du dossier sert alors de repli, et la déclaration
 * le dit.
 *
 * DÉDUCTION · l'art. 37 al. 1 fait naître le droit « lorsque la taxe devient
 * exigible chez l'assujetti », et le décret n° 011/42, art. 96, précise que
 * cet assujetti est le FOURNISSEUR. Le régime de vente de l'acheteur n'a rien
 * à y voir · c'est pourtant lui que le code appliquait, dans les deux sens.
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
}

/**
 * Une ligne de TVA et sa contrepartie de tiers lettrable · une facture de
 * vente (443 au crédit, créance client) ou d'achat (445 au débit, dette
 * fournisseur). C'est le lettrage de cette contrepartie qui date
 * l'encaissement, chez le client comme chez le fournisseur.
 */
function ligneTva(opts: {
  compte: string;
  date: string;
  tva: number;
  tiers?: number;
  lettrage?: Lettrage | null;
}) {
  const sens = opts.compte.startsWith('443') ? 'VENTE' : 'ACHAT';
  return {
    id: `l-${opts.compte}-${opts.date}`,
    // La déclaration sélectionne sur la FAMILLE du compte (443 collectée, 445
    // récupérable) et non sur le compte porté par le taux · le faux doit donc
    // porter son numéro. Et `tauxTvaId` est garanti par la requête réelle,
    // qui filtre dessus.
    tauxTvaId: TAUX.id,
    compte: { numero: opts.compte },
    debit: sens === 'ACHAT' ? opts.tva : 0,
    credit: sens === 'VENTE' ? opts.tva : 0,
    ecriture: {
      date: new Date(opts.date),
      lignes: opts.lettrage
        ? [
            {
              debit: sens === 'VENTE' ? (opts.tiers ?? 0) : 0,
              credit: sens === 'ACHAT' ? (opts.tiers ?? 0) : 0,
              lettrage: opts.lettrage,
            },
          ]
        : [],
    },
  };
}

/** Raccourci historique · une facture de VENTE au 4431. */
function facture(opts: { date: string; tva: number; creance: number; lettrage: Lettrage | null }) {
  return ligneTva({ compte: '44310000', date: opts.date, tva: opts.tva, tiers: opts.creance, lettrage: opts.lettrage });
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
      // Utilisé par le prorata seulement · la déclaration lit ligne à ligne.
      aggregate: jest.fn().mockResolvedValue({ _sum: { credit: 0, debit: 0 } }),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    // La déclaration rend l'état de liquidation de la période ET relit la
    // dernière liquidation pour le crédit reportable (art. 63) · aucune ici.
    liquidationTva: { findFirst: jest.fn().mockResolvedValue(null) },
  } as unknown as PrismaService;
  return new TauxTvaService(prisma, {} as EcritureService);
}

const MARS = new Date('2026-03-01');
const FIN_MARS = new Date('2026-03-31T23:59:59.999Z');
const JUIN = new Date('2026-06-01');
const FIN_JUIN = new Date('2026-06-30T23:59:59.999Z');

/**
 * Rien d'encaissé · le groupe de lettrage reste PARTIEL et son reste à solder
 * vaut la totalité de l'engagement. Le montant doit suivre la contrepartie de
 * chaque facture, sans quoi la fraction encaissée serait fausse.
 */
const impayee = (tiers: number): Lettrage => ({ statut: 'PARTIEL', solde: tiers, soldeAt: null });
const REGLEE_EN_JUIN: Lettrage = { statut: 'SOLDE', solde: 0, soldeAt: new Date('2026-06-12') };

describe('Exigibilité de la TVA collectée · la NATURE de l’opération, pas le dossier (art. 25)', () => {
  it('une VENTE DE BIENS impayée est exigible à la livraison, même dossier paramétré aux ENCAISSEMENTS', async () => {
    // LE DÉFAUT PRINCIPAL. L'art. 25, 1° ne connaît aucune option pour les
    // livraisons de biens : le paramètre du dossier ne peut pas les différer.
    // Le logiciel déclarait 0 et minorait la déclaration du mois.
    const s = service('ENCAISSEMENTS', [
      ligneTva({ compte: '44310000', date: '2026-03-10', tva: 1_600_000, tiers: 11_600_000, lettrage: impayee(11_600_000) }),
    ]);
    const d = await s.declaration('t1', MARS, FIN_MARS);
    expect(d.totalCollecte).toBe(1_600_000);
    // Et rien n'est « en attente » : une vente de biens n'attend pas son prix.
    expect(d.tvaEnAttenteEncaissement).toBe(0);
  });

  it('une PRESTATION DE SERVICES impayée n’est pas exigible, même dossier paramétré aux LIVRAISONS', async () => {
    // Le pendant : aux LIVRAISONS, le logiciel faisait verser la taxe d'une
    // prestation non encaissée, contre l'art. 25, 2°.
    const s = service('LIVRAISONS', [
      ligneTva({ compte: '44320000', date: '2026-03-10', tva: 320_000, tiers: 2_320_000, lettrage: impayee(2_320_000) }),
    ]);
    const d = await s.declaration('t1', MARS, FIN_MARS);
    expect(d.totalCollecte).toBe(0);
    expect(d.tvaEnAttenteEncaissement).toBe(320_000);
  });

  it('un dossier MIXTE date les deux natures dans la MÊME déclaration', async () => {
    // Le cas que ni l'un ni l'autre des deux réglages ne savait servir.
    const s = service('ENCAISSEMENTS', [
      ligneTva({ compte: '44310000', date: '2026-03-10', tva: 1_600_000, tiers: 11_600_000, lettrage: impayee(11_600_000) }),
      ligneTva({ compte: '44320000', date: '2026-03-12', tva: 320_000, tiers: 2_320_000, lettrage: impayee(2_320_000) }),
    ]);
    const d = await s.declaration('t1', MARS, FIN_MARS);
    expect(d.totalCollecte).toBe(1_600_000);
    expect(d.tvaEnAttenteEncaissement).toBe(320_000);
  });

  it('les TRAVAUX (4433) suivent les services · encaissement, article 25, 2°', async () => {
    const s = service('LIVRAISONS', [
      ligneTva({ compte: '44330000', date: '2026-03-10', tva: 500_000, tiers: 3_625_000, lettrage: REGLEE_EN_JUIN }),
    ]);
    expect((await s.declaration('t1', MARS, FIN_MARS)).totalCollecte).toBe(0);
    expect((await s.declaration('t1', JUIN, FIN_JUIN)).totalCollecte).toBe(500_000);
  });

  it('la LIVRAISON À SOI-MÊME (4434) est exigible au fait générateur, jamais à un encaissement qui n’existe pas', async () => {
    // Art. 25, 1° : « y compris les livraisons à soi-même ». Le décret
    // n° 011/42, art. 52, date les PRESTATIONS à soi-même à l'exécution.
    const s = service('ENCAISSEMENTS', [
      ligneTva({ compte: '44340000', date: '2026-03-10', tva: 800_000, tiers: 0, lettrage: null }),
    ]);
    expect((await s.declaration('t1', MARS, FIN_MARS)).totalCollecte).toBe(800_000);
  });

  it('le régime des DÉBITS (art. 26) ne déplace QUE les services · les biens sont déjà à la facture', async () => {
    const s = service('DEBITS', [
      ligneTva({ compte: '44320000', date: '2026-03-10', tva: 320_000, tiers: 2_320_000, lettrage: impayee(2_320_000) }),
      ligneTva({ compte: '44310000', date: '2026-03-11', tva: 160_000, tiers: 1_160_000, lettrage: impayee(1_160_000) }),
    ]);
    const d = await s.declaration('t1', MARS, FIN_MARS);
    expect(d.totalCollecte).toBe(480_000);
    expect(d.mentionExigibilite).toContain('art. 26');
    expect(d.mentionExigibilite).toContain('Directeur Général des Impôts');
  });
});

describe('Naissance du droit à déduction · chez le FOURNISSEUR (art. 37 al. 1, décret art. 96)', () => {
  it('la TVA d’un ACHAT DE BIENS se déduit à la facture, même dossier aux ENCAISSEMENTS', async () => {
    // La taxe est exigible chez le fournisseur dès la livraison (art. 25, 1°) ·
    // le régime de VENTE de l'acheteur n'y change rien. Le logiciel repoussait
    // la déduction au lettrage du fournisseur, et le dossier avançait la
    // trésorerie d'une déduction déjà acquise.
    const s = service('ENCAISSEMENTS', [
      ligneTva({ compte: '44520000', date: '2026-03-10', tva: 400_000, tiers: 2_900_000, lettrage: impayee(2_900_000) }),
    ]);
    expect((await s.declaration('t1', MARS, FIN_MARS)).totalDeductible).toBe(400_000);
  });

  it('la TVA d’une PRESTATION reçue ne se déduit qu’au paiement, même dossier aux LIVRAISONS', async () => {
    // Une prestation d'avocat facturée en mars et payée en juillet : la taxe
    // n'est exigible chez l'avocat qu'au paiement (art. 25, 2°), la déduction
    // ne naît donc pas en mars. Le logiciel la prenait à la date de l'écriture
    // et cette déduction anticipée est rejetée au contrôle.
    const s = service('LIVRAISONS', [
      ligneTva({ compte: '44540000', date: '2026-03-10', tva: 160_000, tiers: 1_160_000, lettrage: REGLEE_EN_JUIN }),
    ]);
    expect((await s.declaration('t1', MARS, FIN_MARS)).totalDeductible).toBe(0);
    expect((await s.declaration('t1', JUIN, FIN_JUIN)).totalDeductible).toBe(160_000);
  });

  it('le TRANSPORT (4453) est une prestation · même règle', async () => {
    const s = service('LIVRAISONS', [
      ligneTva({ compte: '44530000', date: '2026-03-10', tva: 48_000, tiers: 348_000, lettrage: impayee(348_000) }),
    ]);
    expect((await s.declaration('t1', MARS, FIN_MARS)).totalDeductible).toBe(0);
  });

  it('l’autorisation de DÉBITS du dossier ne touche pas sa TVA déductible', async () => {
    // L'art. 26 ne vise que la taxe que le redevable ACQUITTE. La date de
    // celle qu'il déduit se juge chez son fournisseur, dont il ignore tout.
    const s = service('DEBITS', [
      ligneTva({ compte: '44540000', date: '2026-03-10', tva: 160_000, tiers: 1_160_000, lettrage: impayee(1_160_000) }),
    ]);
    expect((await s.declaration('t1', MARS, FIN_MARS)).totalDeductible).toBe(0);
  });

  it('avertit que le régime du FOURNISSEUR peut être celui des débits, et qu’OmegaX ne le connaît pas', async () => {
    // Règle du dépôt : quand la donnée manque, on avertit avec l'article, on
    // ne devine pas. La mention obligatoire de la facture (décret art. 60)
    // n'est pas enregistrée · l'exception n'est donc pas appliquée d'office.
    const s = service('LIVRAISONS', [
      ligneTva({ compte: '44540000', date: '2026-03-10', tva: 160_000, tiers: 1_160_000, lettrage: impayee(1_160_000) }),
    ]);
    const d = await s.declaration('t1', MARS, FIN_MARS);
    expect(d.mentionExigibilite).toContain('article 37 al. 1');
    expect(d.mentionExigibilite).toContain('art. 96');
    expect(d.mentionExigibilite).toContain('art. 60');
  });
});

describe('Ce que le plan ne dit pas · repli DÉCLARÉ (SYCEBNL et comptes non classés)', () => {
  it('un dossier SYCEBNL retombe sur son paramètre, et la déclaration l’annonce', async () => {
    // Son plan ne subdivise ni 443 ni 445 : aucune nature n'y est lisible, et
    // classer sur le numéro seul ferait passer toute sa TVA pour de la vente
    // de biens. Le repli est appliqué ET nommé.
    const s = service(
      'ENCAISSEMENTS',
      [ligneTva({ compte: '44310000', date: '2026-03-10', tva: 160_000, tiers: 1_160_000, lettrage: impayee(1_160_000) })],
      'SYCEBNL',
    );
    const d = await s.declaration('t1', MARS, FIN_MARS);
    expect(d.totalCollecte).toBe(0);
    expect(d.tvaEnAttenteEncaissement).toBe(160_000);
    expect(d.mentionExigibilite).toContain('REPLI DÉCLARÉ');
    expect(d.mentionExigibilite).toContain('SYCEBNL');
  });

  it('un compte SYSCOHADA non classé (4451 immobilisations) retombe aussi, et le dit', async () => {
    // Une immobilisation s'acquiert par livraison de biens comme par travaux
    // immobiliers ou cession d'un incorporel · le compte ne tranche pas.
    const s = service('ENCAISSEMENTS', [
      ligneTva({ compte: '44510000', date: '2026-03-10', tva: 3_200_000, tiers: 23_200_000, lettrage: impayee(23_200_000) }),
    ]);
    const d = await s.declaration('t1', MARS, FIN_MARS);
    expect(d.totalDeductible).toBe(0);
    expect(d.mentionExigibilite).toContain('REPLI DÉCLARÉ');
    expect(d.mentionExigibilite).toContain('4451');
  });

  it('porte toujours la règle appliquée et son article · un chiffre sans sa règle ne se vérifie pas', async () => {
    const s = service('LIVRAISONS', []);
    const d = await s.declaration('t1', MARS, FIN_MARS);
    expect(d.regimeExigibilite).toBe('LIVRAISONS');
    expect(d.mentionExigibilite).toContain('article 25');
    expect(d.mentionExigibilite).toContain('art. 25, 2°');
  });
});

describe('Mécanique du lettrage · inchangée, elle date l’encaissement', () => {
  it('une facture de services de mars, réglée en juin, se déclare en JUIN', async () => {
    const s = service('LIVRAISONS', [
      ligneTva({ compte: '44320000', date: '2026-03-10', tva: 160_000, tiers: 1_160_000, lettrage: REGLEE_EN_JUIN }),
    ]);
    expect((await s.declaration('t1', MARS, FIN_MARS)).totalCollecte).toBe(0);
    expect((await s.declaration('t1', JUIN, FIN_JUIN)).totalCollecte).toBe(160_000);
  });

  it('un règlement PARTIEL rend la taxe exigible à proportion de l’encaissement', async () => {
    // Créance de 1 160 000, il reste 290 000 à encaisser · 75 % encaissés.
    const s = service('LIVRAISONS', [
      ligneTva({
        compte: '44320000',
        date: '2026-03-10',
        tva: 160_000,
        tiers: 1_160_000,
        lettrage: { statut: 'PARTIEL', solde: 290_000, soldeAt: new Date('2026-06-12') },
      }),
    ]);
    expect((await s.declaration('t1', JUIN, FIN_JUIN)).totalCollecte).toBe(120_000);
  });

  it('une prestation au comptant, sans créance lettrable, reste exigible à sa date', async () => {
    // Encaissement et écriture coïncident : rien à décaler.
    const s = service('LIVRAISONS', [facture({ date: '2026-03-10', tva: 160_000, creance: 0, lettrage: null })]);
    expect((await s.declaration('t1', MARS, FIN_MARS)).totalCollecte).toBe(160_000);
  });
});
