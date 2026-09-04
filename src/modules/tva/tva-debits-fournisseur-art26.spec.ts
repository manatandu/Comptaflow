import { TauxTvaService } from './taux-tva.service';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';

/**
 * LA DÉDUCTION CHEZ UN FOURNISSEUR AUTORISÉ AUX DÉBITS · art. 26 et 37 al. 1
 * de l'O.-L. n° 10/001, décret n° 011/42, art. 58 à 62 et 96.
 *
 * CE QUE CES TESTS FIGENT. L'art. 37 al. 1 date le droit à déduction du CLIENT
 * sur l'exigibilité CHEZ LE FOURNISSEUR (« Le droit à déduction prend
 * naissance lorsque la taxe devient exigible chez l'assujetti », décret art. 96
 * : « L'assujetti visé à l'alinéa 1er ci-dessus s'entend du fournisseur de
 * biens ou du prestataire de services »). Un prestataire autorisé par l'art. 26
 * acquitte d'après les débits, et « l'exigibilité est constituée par
 * l'inscription de la somme au débit du compte du client » (décret art. 61) :
 * sa taxe est exigible À LA FACTURE, la déduction de son client naît ce
 * jour-là, et non au paiement.
 *
 * Le module différait la déduction de TOUS les services au paiement, et
 * AVERTISSAIT que cette exception pouvait exister sans qu'il puisse la
 * connaître · la mention « Autorisation d'acquitter la TVA d'après les débits »
 * (décret art. 60) ne se lit que sur la facture. `Tiers.autoriseTvaDebits` la
 * lui dit désormais, quand le comptable l'a portée sur la fiche.
 *
 * TROIS POINTS QUE CES TESTS TIENNENT, ET QU'UNE MUTATION FAIT TOMBER :
 *  · FAUX PAR DÉFAUT · un dossier qui n'a rien saisi garde EXACTEMENT le
 *    traitement d'hier, jusqu'au texte de son avertissement ;
 *  · l'autorisation ne joue QUE sur les services et travaux, et QUE sur la
 *    déduction · l'art. 26 ne l'ouvre pas aux ventes de biens, et le régime
 *    d'un client ne date pas la taxe de son vendeur ;
 *  · l'avertissement ne disparaît pas, il CHANGE DE SENS · « non renseigné »
 *    n'est pas « non autorisé », et confondre les deux serait affirmer ce
 *    qu'on ignore.
 */

const TAUX = {
  id: 'tx16',
  code: 'TVA16',
  intitule: 'TVA 16 %',
  taux: 16,
  compteCollecteId: 'c443',
  compteDeductibleId: 'c445',
};

/** Groupe de lettrage tel que la production l'écrit · voir tva-exigibilite.spec.ts. */
interface Lettrage {
  statut: 'PARTIEL' | 'SOLDE';
  solde: number;
  soldeAt: Date | null;
  reglements?: Array<{ date: string; montant: number }>;
}

/**
 * Un tiers de contrepartie, tel que la requête de la déclaration le charge :
 * le compte auxiliaire porte son rattachement (`TiersCompte`), et le tiers
 * porte l'autorisation de l'art. 26.
 *
 * `null` reproduit le compte de tiers NON RATTACHÉ · le cas ordinaire d'un
 * collectif 401 laissé sans auxiliaire, où le fournisseur n'est pas nommé.
 */
type Contrepartie = { autorise: boolean; reference?: string | null } | null;

function rattachement(c: Contrepartie) {
  if (!c) return null;
  return {
    tiers: {
      autoriseTvaDebits: c.autorise,
      referenceAutorisationDebits: c.reference ?? null,
    },
  };
}

/**
 * Une facture d'ACHAT et ses contreparties de tiers · 445 au débit, dette au
 * crédit du 401. Le lettrage porte sur la PREMIÈRE contrepartie, comme la
 * production le fait pour une facture réglée en une fois.
 */
function achat(opts: {
  compte: string;
  date: string;
  tva: number;
  dette: number;
  lettrage?: Lettrage | null;
  fournisseurs?: Contrepartie[];
}) {
  const fournisseurs = opts.fournisseurs ?? [null];
  const groupe = opts.lettrage
    ? {
        ...opts.lettrage,
        lignes: [
          { debit: 0, credit: opts.dette, ecriture: { date: new Date(opts.date) } },
          ...(opts.lettrage.reglements ?? []).map((r) => ({
            debit: r.montant,
            credit: 0,
            ecriture: { date: new Date(r.date) },
          })),
        ],
      }
    : null;
  return {
    id: `l-${opts.compte}-${opts.date}`,
    tauxTvaId: TAUX.id,
    compte: { numero: opts.compte },
    debit: opts.tva,
    credit: 0,
    ecriture: {
      date: new Date(opts.date),
      lignes: fournisseurs.map((f, i) => ({
        debit: 0,
        credit: opts.dette / fournisseurs.length,
        compte: { numero: '40100000', classe: 'CLASSE_4', tiersCompte: rattachement(f) },
        // Seule la première contrepartie porte le lettrage · le groupe date
        // l'encaissement, il ne nomme pas le fournisseur.
        lettrage: i === 0 ? groupe : null,
      })),
    },
  };
}

/** Une facture de VENTE · 443 au crédit, créance au débit du 411. */
function vente(opts: { compte: string; date: string; tva: number; creance: number; lettrage: Lettrage | null; client?: Contrepartie }) {
  const groupe = opts.lettrage
    ? {
        ...opts.lettrage,
        lignes: [
          { debit: opts.creance, credit: 0, ecriture: { date: new Date(opts.date) } },
          ...(opts.lettrage.reglements ?? []).map((r) => ({
            debit: 0,
            credit: r.montant,
            ecriture: { date: new Date(r.date) },
          })),
        ],
      }
    : null;
  return {
    id: `v-${opts.compte}-${opts.date}`,
    tauxTvaId: TAUX.id,
    compte: { numero: opts.compte },
    debit: 0,
    credit: opts.tva,
    ecriture: {
      date: new Date(opts.date),
      lignes: [
        {
          debit: opts.creance,
          credit: 0,
          compte: { numero: '41100000', classe: 'CLASSE_4', tiersCompte: rattachement(opts.client ?? null) },
          lettrage: groupe,
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
const JUIN = new Date('2026-06-01');
const FIN_JUIN = new Date('2026-06-30T23:59:59.999Z');

/** Rien de payé · le groupe reste PARTIEL et son reste à solder vaut le tout. */
const impayee = (montant: number): Lettrage => ({ statut: 'PARTIEL', solde: montant, soldeAt: null, reglements: [] });

/** Payée le 12 juin, lettrée le 30 septembre · c'est le RÈGLEMENT qui date. */
const payeeEnJuin = (montant: number): Lettrage => ({
  statut: 'SOLDE',
  solde: 0,
  soldeAt: new Date('2026-09-30'),
  reglements: [{ date: '2026-06-12', montant }],
});

const AUTORISE: Contrepartie = { autorise: true, reference: 'DGI/DIR.GEN/2025/1142' };
const AUTORISE_SANS_REFERENCE: Contrepartie = { autorise: true };
const NON_RENSEIGNE: Contrepartie = { autorise: false };

describe('Fournisseur autorisé aux débits · la déduction naît à la facture (art. 26, 37 al. 1)', () => {
  it('une PRESTATION reçue d’un fournisseur autorisé se déduit DÈS LA FACTURE, sans attendre le paiement', async () => {
    // Décret art. 61 : « l'exigibilité est constituée par l'inscription de la
    // somme au débit du compte du client ». La taxe est exigible chez le
    // prestataire en mars, le droit à déduction du client naît donc en mars
    // (art. 37 al. 1, décret art. 96) · le module l'attendait au règlement.
    const s = service('LIVRAISONS', [
      achat({
        compte: '44540000',
        date: '2026-03-10',
        tva: 160_000,
        dette: 1_160_000,
        lettrage: payeeEnJuin(1_160_000),
        fournisseurs: [AUTORISE],
      }),
    ]);
    expect((await s.declaration('t1', MARS, FIN_MARS)).totalDeductible).toBe(160_000);
    // Et elle ne se déduit pas une seconde fois au paiement.
    expect((await s.declaration('t1', JUIN, FIN_JUIN)).totalDeductible).toBe(0);
  });

  it('une facture IMPAYÉE d’un fournisseur autorisé se déduit quand même · la taxe lui est déjà exigible', async () => {
    // Le cas où l'écart est le plus net : au droit commun cette déduction
    // n'existe dans aucune période tant que rien n'est réglé.
    const s = service('LIVRAISONS', [
      achat({
        compte: '44530000',
        date: '2026-03-10',
        tva: 48_000,
        dette: 348_000,
        lettrage: impayee(348_000),
        fournisseurs: [AUTORISE],
      }),
    ]);
    expect((await s.declaration('t1', MARS, FIN_MARS)).totalDeductible).toBe(48_000);
  });

  it('la déclaration NOMME cette anticipation, avec l’article qui l’autorise', async () => {
    const s = service('LIVRAISONS', [
      achat({
        compte: '44540000',
        date: '2026-03-10',
        tva: 160_000,
        dette: 1_160_000,
        lettrage: impayee(1_160_000),
        fournisseurs: [AUTORISE],
      }),
    ]);
    const d = await s.declaration('t1', MARS, FIN_MARS);
    expect(d.mentionExigibilite).toContain('FOURNISSEURS AUTORISÉS AUX DÉBITS');
    // Le montant, dans le format que la fenêtre affiche · la mention porte le
    // chiffre anticipé, sans quoi le comptable ne saurait pas sur quoi porte la
    // réserve qui l'accompagne.
    expect(d.mentionExigibilite).toContain((160_000).toLocaleString('fr-FR'));
    expect(d.mentionExigibilite).toContain('art. 26');
    expect(d.mentionExigibilite).toContain('art. 61');
    // Et elle ne prétend plus avoir différé ce qu'elle vient d'anticiper.
    expect(d.mentionExigibilite).not.toContain('DÉDUCTION SUR SERVICES');
  });

  it('une autorisation SANS RÉFÉRENCE de décision est appliquée, mais signalée', async () => {
    // L'autorisation est délivrée « sur décision du Directeur Général des
    // Impôts ou son délégué en province » (art. 26). Cochée sans sa référence,
    // elle avance une déduction que rien ne documente · le dire est le seul
    // moyen de ne pas la laisser passer pour établie.
    const s = service('LIVRAISONS', [
      achat({
        compte: '44540000',
        date: '2026-03-10',
        tva: 160_000,
        dette: 1_160_000,
        lettrage: impayee(1_160_000),
        fournisseurs: [AUTORISE_SANS_REFERENCE],
      }),
    ]);
    const d = await s.declaration('t1', MARS, FIN_MARS);
    expect(d.totalDeductible).toBe(160_000);
    expect(d.mentionExigibilite).toContain('AUTORISATION AUX DÉBITS SANS RÉFÉRENCE');
    // La référence saisie, plus aucune réserve de ce chef.
    const avec = service('LIVRAISONS', [
      achat({
        compte: '44540000',
        date: '2026-03-10',
        tva: 160_000,
        dette: 1_160_000,
        lettrage: impayee(1_160_000),
        fournisseurs: [AUTORISE],
      }),
    ]);
    expect((await avec.declaration('t1', MARS, FIN_MARS)).mentionExigibilite).not.toContain(
      'AUTORISATION AUX DÉBITS SANS RÉFÉRENCE',
    );
  });
});

describe('Ce que l’autorisation ne déplace PAS', () => {
  it('un ACHAT DE BIENS chez un fournisseur autorisé reste au fait générateur, et n’est pas compté comme anticipé', async () => {
    // L'art. 26 n'est ouvert qu'« aux entrepreneurs de travaux publics et de
    // travaux immobiliers ainsi qu'aux prestataires de services » : la taxe
    // d'une vente de biens est déjà exigible à la livraison (art. 25, 1°), et
    // l'autorisation n'y ajoute rien.
    const s = service('ENCAISSEMENTS', [
      achat({
        compte: '44520000',
        date: '2026-03-10',
        tva: 400_000,
        dette: 2_900_000,
        lettrage: impayee(2_900_000),
        fournisseurs: [AUTORISE],
      }),
    ]);
    const d = await s.declaration('t1', MARS, FIN_MARS);
    expect(d.totalDeductible).toBe(400_000);
    expect(d.mentionExigibilite).not.toContain('FOURNISSEURS AUTORISÉS AUX DÉBITS');
  });

  it('un CLIENT coché « autorisé aux débits » n’avance pas la TVA COLLECTÉE de son vendeur', async () => {
    // L'art. 26 vise la taxe que le redevable ACQUITTE : c'est l'autorisation
    // DU DOSSIER qui déplace sa collecte, jamais celle d'un de ses tiers. Lire
    // le drapeau du client ici ferait verser la taxe d'une prestation non
    // encaissée, contre l'art. 25, 2°.
    const s = service('LIVRAISONS', [
      vente({
        compte: '44320000',
        date: '2026-03-10',
        tva: 320_000,
        creance: 2_320_000,
        lettrage: payeeEnJuin(2_320_000),
        client: AUTORISE,
      }),
    ]);
    expect((await s.declaration('t1', MARS, FIN_MARS)).totalCollecte).toBe(0);
    expect((await s.declaration('t1', JUIN, FIN_JUIN)).totalCollecte).toBe(320_000);
  });

  it('un compte de TVA dont la nature est INDÉTERMINÉE reste au repli déclaré, autorisation ou non', async () => {
    // Le 4451 (immobilisations) ne dit pas si l'opération est une livraison de
    // biens ou des travaux · l'art. 26 n'étant ouvert qu'aux seconds, une
    // autorisation ne suffit pas à trancher ce que le compte tait.
    const s = service('ENCAISSEMENTS', [
      achat({
        compte: '44510000',
        date: '2026-03-10',
        tva: 3_200_000,
        dette: 23_200_000,
        lettrage: impayee(23_200_000),
        fournisseurs: [AUTORISE],
      }),
    ]);
    const d = await s.declaration('t1', MARS, FIN_MARS);
    expect(d.totalDeductible).toBe(0);
    expect(d.mentionExigibilite).toContain('REPLI DÉCLARÉ');
    expect(d.mentionExigibilite).not.toContain('FOURNISSEURS AUTORISÉS AUX DÉBITS');
  });
});

describe('« Non renseigné » n’est pas « non autorisé » · le module continue de dire qu’il ne peut pas savoir', () => {
  it('un fournisseur NON RENSEIGNÉ garde exactement le traitement d’hier · droit commun et avertissement', async () => {
    // FAUX PAR DÉFAUT. Un dossier qui n'a rien saisi ne doit voir AUCUN
    // changement : la déduction reste au paiement, et la déclaration continue
    // d'annoncer l'exception qu'elle ne peut pas constater.
    const s = service('LIVRAISONS', [
      achat({
        compte: '44540000',
        date: '2026-03-10',
        tva: 160_000,
        dette: 1_160_000,
        lettrage: payeeEnJuin(1_160_000),
        fournisseurs: [NON_RENSEIGNE],
      }),
    ]);
    const mars = await s.declaration('t1', MARS, FIN_MARS);
    expect(mars.totalDeductible).toBe(0);
    expect((await s.declaration('t1', JUIN, FIN_JUIN)).totalDeductible).toBe(160_000);
    expect(mars.mentionExigibilite).toContain('DÉDUCTION SUR SERVICES');
    expect(mars.mentionExigibilite).toContain('ne PEUT pas');
    expect(mars.mentionExigibilite).toContain('article 37 al. 1');
    expect(mars.mentionExigibilite).toContain('art. 96');
    expect(mars.mentionExigibilite).toContain('art. 60');
  });

  it('une contrepartie de tiers NON RATTACHÉE ne nomme aucun fournisseur · droit commun', async () => {
    // Un collectif 401 sans auxiliaire, ou un achat réglé en espèces : le
    // chemin vers le fournisseur n'existe pas, et le supposer autorisé serait
    // anticiper une déduction sur une pièce qu'on n'a pas lue.
    const s = service('LIVRAISONS', [
      achat({
        compte: '44540000',
        date: '2026-03-10',
        tva: 160_000,
        dette: 1_160_000,
        lettrage: payeeEnJuin(1_160_000),
        fournisseurs: [null],
      }),
    ]);
    const d = await s.declaration('t1', MARS, FIN_MARS);
    expect(d.totalDeductible).toBe(0);
    expect(d.mentionExigibilite).toContain('DÉDUCTION SUR SERVICES');
  });

  it('deux fournisseurs sur la même écriture, dont un seul autorisé · le module ne tranche pas', async () => {
    // Rien ne dit lequel des deux supporte la taxe de cette ligne. Choisir
    // reviendrait à tirer au sort entre déduire trop tôt et déduire trop tard :
    // le droit commun s'applique, et l'avertissement reste.
    const s = service('LIVRAISONS', [
      achat({
        compte: '44540000',
        date: '2026-03-10',
        tva: 160_000,
        dette: 1_160_000,
        lettrage: payeeEnJuin(1_160_000),
        fournisseurs: [AUTORISE, NON_RENSEIGNE],
      }),
    ]);
    const d = await s.declaration('t1', MARS, FIN_MARS);
    expect(d.totalDeductible).toBe(0);
    expect(d.mentionExigibilite).toContain('DÉDUCTION SUR SERVICES');
    expect(d.mentionExigibilite).not.toContain('FOURNISSEURS AUTORISÉS AUX DÉBITS');
  });

  it('deux fournisseurs TOUS DEUX autorisés · la réponse est la même quel qu’il soit', async () => {
    // Ici l'ignorance ne coûte rien : quelle que soit celle des deux dettes qui
    // porte la taxe, l'exigibilité chez le fournisseur est la facture.
    const s = service('LIVRAISONS', [
      achat({
        compte: '44540000',
        date: '2026-03-10',
        tva: 160_000,
        dette: 1_160_000,
        lettrage: payeeEnJuin(1_160_000),
        fournisseurs: [AUTORISE, AUTORISE],
      }),
    ]);
    expect((await s.declaration('t1', MARS, FIN_MARS)).totalDeductible).toBe(160_000);
  });
});
