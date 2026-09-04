import { TauxTvaService } from './taux-tva.service';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';

/**
 * LES EXCLUSIONS DU DROIT À DÉDUCTION · article 41.
 *
 * Entre le compte 445 et la « TVA déductible admise », le seul filtre appliqué
 * était le PRORATA de l'article 43. Or le prorata LIMITE une déduction ;
 * l'article 41 la SUPPRIME. Une facture de réception, un frais de mission, un
 * billet d'avion passaient donc intégralement en déduction, mois après mois,
 * et la liquidation les portait au compte 444 comme le reste.
 *
 * Fichier `code-general-2026/references/10-tva-ol10-001-loi-base-ch1-10.md`,
 * art. 41, l. 1033-1038 : « N'ouvre pas droit à déduction, la taxe ayant
 * grevé : / 1. les dépenses de logement, d'hébergement, de restauration, de
 * réception, de spectacles, de location de véhicules de tourisme et de
 * transport de personnes à l'exclusion des dépenses supportées, au titre de
 * leur activité imposable, par les professionnels du tourisme, de la
 * restauration et du spectacle ». Article NON modifié par la L.F. n° 25/060,
 * dont l'art. 47 ne complète que l'art. 42, point 4.
 *
 * CE QUE LE LOGICIEL RECONNAÎT, ET CE QU'IL REFUSE DE DEVINER. La ligne de TVA
 * porte un montant, jamais la nature de la dépense : c'est la CONTREPARTIE de
 * classe 6 qui la dit. Trois comptes du plan SYSCOHADA reprennent les mots
 * mêmes de l'article · 6383 « Réceptions », 6384 « Missions », 6181 « Voyages
 * et déplacements ». Au-delà, le numéro ne dit plus la dépense :
 *
 *  · les PRODUITS PÉTROLIERS (art. 41, 3°) n'ont aucun compte dédié ;
 *  · les VÉHICULES DE TOURISME immobilisés (art. 42, 1°) sont en classe 2, et
 *    un compte de matériel de transport porte aussi bien un camion, déductible,
 *    qu'un 4x4 de direction, exclu ;
 *  · les CADEAUX (art. 41, 7°) ont une exception de VALEUR UNITAIRE, donnée
 *    qu'aucune ligne d'écriture ne porte ;
 *  · le TRANSPORT DU PERSONNEL (art. 42, 2°) reste déductible sous contrat
 *    permanent, donnée juridique et non comptable.
 *
 * Pour ceux-là, la règle de maison s'applique : on ne calcule pas, on
 * AVERTIT, avec l'article et le montant en jeu.
 */

const TAUX = { id: 'tx16', code: 'TVA16', intitule: 'TVA 16 %', taux: 16, compteCollecteId: 'c443', compteDeductibleId: 'c445' };

interface Charge {
  numero: string;
  debit: number;
}

interface LigneAchat {
  /** Compte de TVA récupérable · 4452 (achats de biens) sauf mention. */
  numero?: string;
  date: string;
  tva: number;
  charges: Charge[];
}

function service(achats: LigneAchat[], referentiel: 'SYSCOHADA' | 'SYCEBNL' = 'SYSCOHADA') {
  const prisma = {
    tenant: { findUnique: jest.fn().mockResolvedValue({ id: 't1', regimeExigibiliteTva: 'LIVRAISONS', referentiel }) },
    tauxTva: { findMany: jest.fn().mockResolvedValue([TAUX]) },
    ligneEcriture: {
      findMany: jest.fn().mockImplementation(({ where }: { where: Record<string, unknown> }) => {
        const compte = where.compte as { OR?: unknown } | undefined;
        if (!compte?.OR) return Promise.resolve([]);
        return Promise.resolve(
          achats.map((a) => ({
            id: `l-${a.date}`,
            tauxTvaId: TAUX.id,
            compte: { numero: a.numero ?? '44520000' },
            debit: a.tva,
            credit: 0,
            ecriture: {
              date: new Date(a.date),
              // La requête réelle charge, sur la même écriture, la contrepartie
              // de TIERS lettrée (qui date l'exigibilité) et la contrepartie de
              // CHARGE (qui dit si l'article 41 exclut).
              lignes: a.charges.map((c) => ({
                debit: c.debit,
                credit: 0,
                compte: { numero: c.numero, classe: 'CLASSE_6' },
                lettrage: null,
              })),
            },
          })),
        );
      }),
      aggregate: jest.fn().mockResolvedValue({ _sum: { credit: 0, debit: 0 } }),
    },
    liquidationTva: { findFirst: jest.fn().mockResolvedValue(null) },
  } as unknown as PrismaService;
  return new TauxTvaService(prisma, {} as EcritureService);
}

const MARS = new Date('2026-03-01');
const FIN_MARS = new Date('2026-03-31T23:59:59.999Z');

describe('Article 41 · ce que le plan de comptes établit est ÉCARTÉ de la déduction', () => {
  it('la TVA sur RÉCEPTIONS (6383) n’ouvre pas droit à déduction', async () => {
    // « les dépenses de […] réception » · l'intitulé du compte reprend le mot
    // de l'article. 160 000 CDF déduits à tort, mois après mois.
    const s = service([{ date: '2026-03-10', tva: 160_000, charges: [{ numero: '63830000', debit: 1_000_000 }] }]);
    const d = await s.declaration('t1', MARS, FIN_MARS);
    expect(d.totalDeductible).toBe(0);
    expect(d.tvaExclueArt41).toBe(160_000);
    expect(d.mentionExigibilite).toContain('EXCLUSIONS DE L’ARTICLE 41');
  });

  it('la TVA sur MISSIONS (6384) et sur VOYAGES ET DÉPLACEMENTS (6181) non plus', async () => {
    const s = service([
      { date: '2026-03-10', tva: 80_000, charges: [{ numero: '63840000', debit: 500_000 }] },
      { date: '2026-03-12', tva: 48_000, charges: [{ numero: '61810000', debit: 300_000 }] },
    ]);
    const d = await s.declaration('t1', MARS, FIN_MARS);
    expect(d.totalDeductible).toBe(0);
    expect(d.tvaExclueArt41).toBe(128_000);
  });

  it('un ACHAT ORDINAIRE reste intégralement déductible', async () => {
    // Le garde-fou de l'exclusion : elle ne doit pas déborder sur le 6011.
    const s = service([{ date: '2026-03-10', tva: 320_000, charges: [{ numero: '60110000', debit: 2_000_000 }] }]);
    const d = await s.declaration('t1', MARS, FIN_MARS);
    expect(d.totalDeductible).toBe(320_000);
    expect(d.tvaExclueArt41).toBe(0);
  });

  it('une facture MIXTE répartit la taxe au prorata de ses charges', async () => {
    // Une seule pièce, deux charges : 750 000 d'achats et 250 000 de
    // réception. La taxe de 160 000 se partage 120 000 / 40 000 · c'est la
    // seule ventilation que la pièce elle-même autorise.
    const s = service([
      {
        date: '2026-03-10',
        tva: 160_000,
        charges: [
          { numero: '60110000', debit: 750_000 },
          { numero: '63830000', debit: 250_000 },
        ],
      },
    ]);
    const d = await s.declaration('t1', MARS, FIN_MARS);
    expect(d.tvaExclueArt41).toBe(40_000);
    expect(d.totalDeductible).toBe(120_000);
  });

  it('annonce l’exception des professionnels du tourisme, de la restauration et du spectacle', async () => {
    // Elle se lit sur l'ACTIVITÉ du dossier, que le logiciel ne connaît pas :
    // il applique le droit commun et nomme l'exception avec son montant, pour
    // qu'un hôtelier puisse la réintégrer.
    const s = service([{ date: '2026-03-10', tva: 160_000, charges: [{ numero: '63830000', debit: 1_000_000 }] }]);
    const d = await s.declaration('t1', MARS, FIN_MARS);
    expect(d.mentionExigibilite).toContain('professionnels du tourisme');
    expect(d.mentionExigibilite).toContain('réintégrez');
  });
});

describe('Ce que le compte ne tranche pas · avertir, jamais deviner', () => {
  it('les CADEAUX À LA CLIENTÈLE (6276) restent déduits, et sont NOMMÉS · art. 41, 7°', async () => {
    // « sauf quand il s'agit d'objets publicitaires de faible valeur unitaire
    // hors taxe » : la valeur UNITAIRE n'est nulle part dans le modèle. Exclure
    // d'office coûterait au contribuable une déduction à laquelle il a droit.
    const s = service([{ date: '2026-03-10', tva: 96_000, charges: [{ numero: '62760000', debit: 600_000 }] }]);
    const d = await s.declaration('t1', MARS, FIN_MARS);
    expect(d.totalDeductible).toBe(96_000);
    expect(d.tvaExclueArt41).toBe(0);
    expect(d.tvaAVerifierArt41).toBe(96_000);
    expect(d.mentionExigibilite).toContain('À VÉRIFIER, ARTICLES 41 ET 42');
  });

  it('le TRANSPORT DU PERSONNEL (6140) aussi · art. 42, 2° le réserve au contrat permanent', async () => {
    const s = service([{ date: '2026-03-10', tva: 32_000, charges: [{ numero: '61400000', debit: 200_000 }] }]);
    const d = await s.declaration('t1', MARS, FIN_MARS);
    expect(d.totalDeductible).toBe(32_000);
    expect(d.tvaAVerifierArt41).toBe(32_000);
    expect(d.mentionExigibilite).toContain('contrat permanent');
  });

  it('une TVA sans contrepartie de charge · le VÉHICULE DE TOURISME de l’art. 42, 1° est annoncé', async () => {
    // Une TVA sur immobilisation n'a pas de classe 6 en face : le compte ne
    // dit pas si le véhicule est un camion ou un 4x4 de direction. Elle reste
    // déduite, et l'article est nommé avec le montant.
    const s = service([{ numero: '44510000', date: '2026-03-10', tva: 4_800_000, charges: [] }]);
    const d = await s.declaration('t1', MARS, FIN_MARS);
    expect(d.totalDeductible).toBe(4_800_000);
    expect(d.tvaNatureDepenseIllisible).toBe(4_800_000);
    expect(d.mentionExigibilite).toContain('NATURE DE LA DÉPENSE NON LISIBLE');
    expect(d.mentionExigibilite).toContain('transport des personnes');
  });

  it('un dossier SYCEBNL n’exclut rien · son plan agrège ses charges externes, et il le dit', async () => {
    // 63800000 « Autres charges externes » mêle le déductible et l'exclu ·
    // trancher au numéro y serait une devinette au détriment du dossier.
    const s = service([{ date: '2026-03-10', tva: 160_000, charges: [{ numero: '63800000', debit: 1_000_000 }] }], 'SYCEBNL');
    const d = await s.declaration('t1', MARS, FIN_MARS);
    expect(d.totalDeductible).toBe(160_000);
    expect(d.tvaExclueArt41).toBe(0);
    expect(d.tvaNatureDepenseIllisible).toBe(160_000);
  });
});
