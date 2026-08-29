import { BadRequestException } from '@nestjs/common';
import { OperationSpecifiqueService, CATALOGUE } from './operation-specifique.service';
import { PLAN_COMPTES_SYCEBNL } from '../comptes/compte-seed';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';

/**
 * Les écritures-types confrontées aux CHIFFRES OFFICIELS du Guide
 * d'application (22 cas corrigés). C'est ce qui distingue ce module d'un
 * catalogue déclaratif quelconque : chaque modèle est éprouvé contre l'exemple
 * que le référentiel publie lui-même, montant par montant.
 *
 * Le plan de comptes utilisé ici n'est pas un jeu d'essai : c'est
 * `PLAN_COMPTES_SYCEBNL`, celui que la création d'un dossier installe
 * réellement. Un modèle qui passe ces tests est donc applicable tel quel dans
 * un dossier neuf — et un préfixe trop court se voit immédiatement.
 */

/** Le plan réel, sous la forme que le service lit. */
const COMPTES_REELS = PLAN_COMPTES_SYCEBNL.map((c) => ({
  id: `id-${c.numero}`,
  numero: c.numero,
  intitule: c.intitule,
}));

/** Les comptes du plan réel que vise une ligne, exclusions comprises. */
function candidatsDe(ligne: { compte: string; exclusions?: string[] }) {
  return COMPTES_REELS.filter(
    (c) => c.numero.startsWith(ligne.compte) && !(ligne.exclusions ?? []).some((e) => c.numero.startsWith(e)),
  );
}

function service(jeu: 'ASSOCIATIONS_ORDRES_PROFESSIONNELS' | 'PROJETS_DEVELOPPEMENT' = 'ASSOCIATIONS_ORDRES_PROFESSIONNELS') {
  const creer = jest.fn().mockImplementation((_t, _u, dto) => Promise.resolve({ id: 'ecr1', ...dto }));
  const prisma = {
    compte: { findMany: jest.fn().mockResolvedValue(COMPTES_REELS) },
    tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ jeuEtatsFinanciersSycebnl: jeu }) },
  } as unknown as PrismaService;
  const ecriture = { creer } as unknown as EcritureService;
  return { svc: new OperationSpecifiqueService(prisma, ecriture), creer };
}

/** Les lignes de la proposition, sous une forme comparable au tableau du Guide. */
async function ecriture(
  codeModele: string,
  parametres: Record<string, number>,
  comptesChoisis?: Record<string, string>,
) {
  const { svc } = service();
  const p = await svc.proposer('t1', { codeModele, parametres, comptesChoisis });
  return {
    ...p,
    table: p.lignes.map((l) => ({ numero: l.numero, debit: l.debit, credit: l.credit })),
  };
}

// ---------------------------------------------------------------------------
// Chapitre 1 — fonds propres des associations
// ---------------------------------------------------------------------------

describe('Guide, Application 1 — dotation consomptible et non consomptible', () => {
  it('souscription des apports à titre définitif : 33 000 000 en nature, 5 000 000 en numéraire', async () => {
    const e = await ecriture('B14-SOUSCRIPTION-DEFINITIF', { apportsNature: 33_000_000, apportsNumeraire: 5_000_000 });
    expect(e.table).toEqual([
      { numero: '45110000', debit: 33_000_000, credit: 0 },
      { numero: '45120000', debit: 5_000_000, credit: 0 },
      { numero: '10150000', debit: 0, credit: 33_000_000 },
      { numero: '10410000', debit: 0, credit: 5_000_000 },
    ]);
    expect(e.equilibree).toBe(true);
  });

  it('souscription à titre provisoire : la dotation est AVEC droit de reprise', async () => {
    const e = await ecriture('B14-SOUSCRIPTION-PROVISOIRE', { apportsNature: 30_000_000, apportsNumeraire: 4_000_000 });
    expect(e.table).toEqual([
      { numero: '45110000', debit: 30_000_000, credit: 0 },
      { numero: '45120000', debit: 4_000_000, credit: 0 },
      { numero: '10250000', debit: 0, credit: 30_000_000 },
      { numero: '10210000', debit: 0, credit: 4_000_000 },
    ]);
  });

  it('quote-part de dotation consomptible transférée : 1049 / 703 pour 5 000 000', async () => {
    const e = await ecriture('B14-QUOTE-PART-CONSOMPTIBLE', { chargesCouvertes: 5_000_000 });
    expect(e.table).toEqual([
      { numero: '10490000', debit: 5_000_000, credit: 0 },
      { numero: '70300000', debit: 0, credit: 5_000_000 },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Chapitre 1 — cotisations et droit d'entrée
// ---------------------------------------------------------------------------

describe('Guide, Application 2 — droit d’entrée et appel de cotisations', () => {
  /**
   * LE cas qui justifie le mode COMPLEMENT : les statuts donnent 15 % et
   * 10 %, et le texte dit « le SOLDE = droit d'entrée ». Saisir ce solde
   * laisserait passer un déséquilibre ; le calculer l'interdit.
   */
  it('50 000 000 appelés : 15 % en dépôt, 10 % en cotisations, le SOLDE en droit d’entrée', async () => {
    const e = await ecriture('B6-APPEL-DROIT-ENTREE', { appelGlobal: 50_000_000, tauxDepot: 0.15, tauxCotisation: 0.1 });
    expect(e.table).toEqual([
      { numero: '41100000', debit: 50_000_000, credit: 0 },
      { numero: '18510000', debit: 0, credit: 7_500_000 },
      { numero: '70100000', debit: 0, credit: 5_000_000 },
      { numero: '10300000', debit: 0, credit: 37_500_000 }, // 50 M − 7,5 M − 5 M
    ]);
    expect(e.equilibree).toBe(true);
  });

  it('refuse des parts qui dépassent le montant global, plutôt que de proposer un complément négatif', async () => {
    const { svc } = service();
    await expect(
      svc.proposer('t1', { codeModele: 'B6-APPEL-DROIT-ENTREE', parametres: { appelGlobal: 1000, tauxDepot: 0.7, tauxCotisation: 0.6 } }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('Guide, Application 13 — cotisations des membres', () => {
  it('appel de 2 500 000, transfert en douteux de 12 000 000, dépréciation à 80 %', async () => {
    expect((await ecriture('B6-APPEL-COTISATION', { cotisation: 2_500_000 })).table).toEqual([
      { numero: '41100000', debit: 2_500_000, credit: 0 },
      { numero: '70100000', debit: 0, credit: 2_500_000 },
    ]);
    expect((await ecriture('B6-COTISATION-DOUTEUSE', { creanceDouteuse: 12_000_000 })).table).toEqual([
      { numero: '41610000', debit: 12_000_000, credit: 0 },
      { numero: '41100000', debit: 0, credit: 12_000_000 },
    ]);
    // 12 000 000 × 80 % = 9 600 000, le chiffre du Guide.
    expect((await ecriture('B6-DEPRECIATION-COTISATION', { creanceDouteuse: 12_000_000, tauxDepreciation: 0.8 })).table).toEqual([
      { numero: '65900000', debit: 9_600_000, credit: 0 },
      { numero: '49120000', debit: 0, credit: 9_600_000 },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Chapitre 1 — subventions d'investissement
// ---------------------------------------------------------------------------

describe('Guide, Application 3 — subvention d’investissement', () => {
  /**
   * Les deux reprises de l'application, qui ne suivent PAS la même règle :
   * le terrain n'est pas amortissable, sa subvention se reprend sur 10 ans
   * « SANS prorata temporis » ; l'entrepôt suit son amortissement, prorata
   * compris. Le même modèle sert les deux — c'est le paramètre « mois » qui
   * porte la différence.
   */
  it('terrain non amortissable : 20 000 000 × 1/10, sans prorata → 2 000 000', async () => {
    const e = await ecriture('B15-REPRISE', { baseSubvention: 20_000_000, duree: 10, mois: 12 }, { '141': '14170000' });
    expect(e.table).toEqual([
      { numero: '14170000', debit: 2_000_000, credit: 0 },
      { numero: '79900000', debit: 0, credit: 2_000_000 },
    ]);
  });

  it('entrepôt amortissable : 100 000 000 × 1/20 × 6/12 → 2 500 000', async () => {
    const e = await ecriture('B15-REPRISE', { baseSubvention: 100_000_000, duree: 20, mois: 6 }, { '141': '14170000' });
    expect(e.table).toEqual([
      { numero: '14170000', debit: 2_500_000, credit: 0 },
      { numero: '79900000', debit: 0, credit: 2_500_000 },
    ]);
  });

  it('notification : 4731 par le crédit de la subvention d’équipement', async () => {
    const e = await ecriture('B15-NOTIFICATION', { subvention: 120_000_000 }, { '141': '14170000' });
    expect(e.table).toEqual([
      { numero: '47310000', debit: 120_000_000, credit: 0 },
      { numero: '14170000', debit: 0, credit: 120_000_000 },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Chapitre 2 — fonds affectés et reportés
// ---------------------------------------------------------------------------

describe('Guide, Application 4 — fonds affectés à un projet spécifique', () => {
  it('réception de 45 000 000 : au PASSIF, pas en produit', async () => {
    const e = await ecriture('B1-RECEPTION', { fonds: 45_000_000 }, { '52': '52110000' });
    expect(e.table).toEqual([
      { numero: '52110000', debit: 45_000_000, credit: 0 },
      { numero: '16500000', debit: 0, credit: 45_000_000 },
    ]);
  });

  it('reprise du tiers consommé : 15 000 000 seulement', async () => {
    const e = await ecriture('B1-REPRISE', { consomme: 15_000_000 });
    expect(e.table).toEqual([
      { numero: '16500000', debit: 15_000_000, credit: 0 },
      { numero: '79200000', debit: 0, credit: 15_000_000 },
    ]);
  });
});

describe('Guide, Application 5 — legs d’immobilisations à conserver', () => {
  it('447 000 000 de biens, 25 000 000 de dettes successorales → 422 000 000 de fonds', async () => {
    const e = await ecriture(
      'B16-RECEPTION-LEGS',
      { valeurBiens: 447_000_000, dettes: 25_000_000 },
      { '2': '23130000', '167': '16710000' },
    );
    expect(e.table).toEqual([
      { numero: '23130000', debit: 447_000_000, credit: 0 },
      { numero: '48610000', debit: 0, credit: 25_000_000 },
      { numero: '16710000', debit: 0, credit: 422_000_000 },
    ]);
    expect(e.equilibree).toBe(true);
  });

  it('sans dette successorale, la ligne à zéro n’encombre pas l’écriture', async () => {
    const e = await ecriture('B16-RECEPTION-LEGS', { valeurBiens: 100_000, dettes: 0 }, { '2': '23130000', '167': '16710000' });
    expect(e.table.map((l) => l.numero)).toEqual(['23130000', '16710000']);
  });

  it('provision pour l’obligation d’entretien : 1679 / 192 pour 12 500 000', async () => {
    expect((await ecriture('B16-PROVISION-CHARGE', { obligation: 12_500_000 })).table).toEqual([
      { numero: '16790000', debit: 12_500_000, credit: 0 },
      { numero: '19200000', debit: 0, credit: 12_500_000 },
    ]);
  });

  it('reprise des fonds à hauteur des amortissements : 18 625 000', async () => {
    const e = await ecriture('B16-REPRISE-FONDS', { dotation: 18_625_000 }, { '167': '16710000' });
    expect(e.table).toEqual([
      { numero: '16710000', debit: 18_625_000, credit: 0 },
      { numero: '79200000', debit: 0, credit: 18_625_000 },
    ]);
  });
});

describe('Guide, Application 6 — legs destinés à la vente', () => {
  it('400 000 000 de bâtiments + 47 000 000 de matériels → 447 000 000 de fonds reporté', async () => {
    const e = await ecriture('B17-COMPTABILISATION', { batiments: 400_000_000, materiels: 47_000_000 });
    expect(e.table).toEqual([
      { numero: '20300000', debit: 400_000_000, credit: 0 },
      { numero: '20400000', debit: 47_000_000, credit: 0 },
      { numero: '17200000', debit: 0, credit: 447_000_000 },
    ]);
  });

  it('dépréciation de 25 % du bâtiment : 100 000 000', async () => {
    expect((await ecriture('B17-DEPRECIATION', { depreciation: 100_000_000 })).table).toEqual([
      { numero: '69500000', debit: 100_000_000, credit: 0 },
      { numero: '29020000', debit: 0, credit: 100_000_000 },
    ]);
  });

  it('solde du fonds reporté après cession : 447 000 000', async () => {
    expect((await ecriture('B17-SOLDE-FONDS', { fondsReporte: 447_000_000 })).table).toEqual([
      { numero: '17200000', debit: 447_000_000, credit: 0 },
      { numero: '79600000', debit: 0, credit: 447_000_000 },
    ]);
  });
});

describe('Guide, Application 7 — donation temporaire d’usufruit', () => {
  it('usufruit de 150 000 000 sur 10 ans : amortissement et reprise de 15 000 000 chacun', async () => {
    expect((await ecriture('B18-RECEPTION', { valeur: 150_000_000 })).table).toEqual([
      { numero: '20110000', debit: 150_000_000, credit: 0 },
      { numero: '17100000', debit: 0, credit: 150_000_000 },
    ]);
    expect((await ecriture('B18-AMORTISSEMENT', { valeur: 150_000_000, duree: 10, mois: 12 })).table).toEqual([
      { numero: '68000000', debit: 15_000_000, credit: 0 },
      { numero: '28000000', debit: 0, credit: 15_000_000 },
    ]);
    expect((await ecriture('B18-REPRISE', { dotation: 15_000_000 })).table).toEqual([
      { numero: '17100000', debit: 15_000_000, credit: 0 },
      { numero: '79600000', debit: 0, credit: 15_000_000 },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Chapitre 3 — projets de développement
// ---------------------------------------------------------------------------

describe('Guide, Application 8 — projet de développement', () => {
  it('150 000 000 décaissés, clé 80 / 20 → 120 000 000 en investissement, 30 000 000 en administration', async () => {
    const e = await ecriture('B19-DECAISSEMENT', { virement: 150_000_000, partInvestissement: 0.8 }, { '52': '52110000' });
    expect(e.table).toEqual([
      { numero: '52110000', debit: 150_000_000, credit: 0 },
      { numero: '16200000', debit: 0, credit: 120_000_000 },
      { numero: '46200000', debit: 0, credit: 30_000_000 },
    ]);
  });

  it('transfert des fonds d’administration au rythme des charges : 28 000 000', async () => {
    expect((await ecriture('B19-TRANSFERT-ADMINISTRATION', { chargesEngagees: 28_000_000 })).table).toEqual([
      { numero: '46200000', debit: 28_000_000, credit: 0 },
      { numero: '70200000', debit: 0, credit: 28_000_000 },
    ]);
  });

  it('fonds d’investissement non consommés : 120 M − 112 M = 8 000 000, à extourner', async () => {
    const e = await ecriture('B19-FONDS-NON-CONSOMMES', { nonConsomme: 8_000_000 });
    expect(e.table).toEqual([
      { numero: '16200000', debit: 8_000_000, credit: 0 },
      { numero: '16500000', debit: 0, credit: 8_000_000 },
    ]);
    expect(e.aExtourner).toBe(true);
  });

  it('ajustement de la clé une fois l’emploi réel connu : 8 000 000', async () => {
    expect((await ecriture('B19-AJUSTEMENT-CLE', { ajustement: 8_000_000 })).table).toEqual([
      { numero: '16200000', debit: 8_000_000, credit: 0 },
      { numero: '46200000', debit: 0, credit: 8_000_000 },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Chapitre 4 — dons
// ---------------------------------------------------------------------------

describe('Guide, Application 9 — dons en nature à distribuer', () => {
  it('réception de 25 000 000, stock de 5 000 000, revenus différés de 5 000 000', async () => {
    expect((await ecriture('B2-RECEPTION-COURANT', { valeur: 25_000_000 })).table).toEqual([
      { numero: '65400000', debit: 25_000_000, credit: 0 },
      { numero: '75420000', debit: 0, credit: 25_000_000 },
    ]);
    expect((await ecriture('B2-STOCK-CLOTURE', { stock: 5_000_000 })).table).toEqual([
      { numero: '34500000', debit: 5_000_000, credit: 0 },
      { numero: '60350000', debit: 0, credit: 5_000_000 },
    ]);
    const differe = await ecriture('B2-REVENUS-NON-CONSOMMES', { nonConsomme: 5_000_000 });
    expect(differe.table).toEqual([
      { numero: '75420000', debit: 5_000_000, credit: 0 },
      { numero: '47130000', debit: 0, credit: 5_000_000 },
    ]);
    // « Les écritures de fin d'exercice doivent être extournées au début de
    // l'exercice suivant » — le taire ferait porter deux fois la régularisation.
    expect(differe.aExtourner).toBe(true);
  });
});

describe('Guide, Application 10 — dons en nature à vendre', () => {
  it('suivi hors bilan du camion reçu : 15 000 000 en classe 9', async () => {
    expect((await ecriture('B3-SUIVI-EXTRA-COMPTABLE', { valeur: 15_000_000 })).table).toEqual([
      { numero: '90100000', debit: 15_000_000, credit: 0 },
      { numero: '91000000', debit: 0, credit: 15_000_000 },
    ]);
  });

  /**
   * Le Guide impute cette vente au « 8421 » ; la Partie 3 ch. 4 § 2, le plan
   * des comptes et la fiche du compte 84 donnent tous trois 8411. Le modèle
   * retient 8411 et porte l'anomalie jusqu'à l'écran.
   */
  it('vente non récurrente : 8411, et l’anomalie du Guide est remontée', async () => {
    const e = await ecriture('B3-VENTE-HAO', { prix: 13_000_000 }, { '52': '52110000' });
    expect(e.table).toEqual([
      { numero: '52110000', debit: 13_000_000, credit: 0 },
      { numero: '84110000', debit: 0, credit: 13_000_000 },
    ]);
    expect(e.anomalie).toMatch(/8421/);
    expect(e.anomalie).toMatch(/8411/);
  });

  it('frais neutralisés sur un bien non vendu : 250 000 en charges d’avance, à extourner', async () => {
    const e = await ecriture('B3-FRAIS-NEUTRALISES', { frais: 250_000 });
    expect(e.table).toEqual([
      { numero: '47600000', debit: 250_000, credit: 0 },
      { numero: '83100000', debit: 0, credit: 250_000 },
    ]);
    expect(e.aExtourner).toBe(true);
  });
});

describe('Guide, Application 11 — dons en numéraire', () => {
  it('générosité promise et non encore reçue : 475 par le crédit du 704', async () => {
    const e = await ecriture('B4-GENEROSITE-A-RECEVOIR', { promesse: 8_000_000 }, { '704': '70410000' });
    expect(e.table).toEqual([
      { numero: '47500000', debit: 8_000_000, credit: 0 },
      { numero: '70410000', debit: 0, credit: 8_000_000 },
    ]);
  });

  it('quête encaissée en espèces : le choix de la nature du revenu revient au dossier', async () => {
    const e = await ecriture('B4-ENCAISSEMENT', { montant: 8_000_000 }, { '5': '57100000', '704': '70440000' });
    expect(e.table).toEqual([
      { numero: '57100000', debit: 8_000_000, credit: 0 },
      { numero: '70440000', debit: 0, credit: 8_000_000 },
    ]);
  });

  it('recettes d’une manifestation : 25 000 000 au compte 706', async () => {
    const e = await ecriture('B4-RECETTES-MANIFESTATION', { recettes: 25_000_000 }, { '5': '57100000' });
    expect(e.table).toEqual([
      { numero: '57100000', debit: 25_000_000, credit: 0 },
      { numero: '70600000', debit: 0, credit: 25_000_000 },
    ]);
  });
});

describe('Guide, Application 12 — frais de recherche de fonds', () => {
  it('25 000 + 35 000 + 75 000 = 135 000 au compte spécifique 636', async () => {
    const e = await ecriture('B5-FRAIS', { frais: 135_000 }, { '401': '40110000' });
    expect(e.table).toEqual([
      { numero: '63600000', debit: 135_000, credit: 0 },
      { numero: '40110000', debit: 0, credit: 135_000 },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Chapitres 5 et 6
// ---------------------------------------------------------------------------

describe('Guide, Applications 14 et 15 — fondateur et aides versées', () => {
  it('contribution du fondateur : 20 000 000 au compte 752, pas au compte 10', async () => {
    const e = await ecriture('B7-CONTRIBUTION', { versement: 20_000_000 }, { '5': '52110000' });
    expect(e.table).toEqual([
      { numero: '52110000', debit: 20_000_000, credit: 0 },
      { numero: '75200000', debit: 0, credit: 20_000_000 },
    ]);
  });

  it('aide versée par l’entité : 500 000 au compte 652', async () => {
    const e = await ecriture('B8-SUBVENTION-VERSEE', { aide: 500_000 }, { '5': '57100000' });
    expect(e.table).toEqual([
      { numero: '65200000', debit: 500_000, credit: 0 },
      { numero: '57100000', debit: 0, credit: 500_000 },
    ]);
  });
});

describe('Guide, Application 16 — subvention d’exploitation pluriannuelle', () => {
  it('60 000 000 sur trois exercices : 40 000 000 différés, 20 000 000 rattachés par exercice', async () => {
    expect((await ecriture('B9-NOTIFICATION', { subvention: 60_000_000 }, { '71': '71100000' })).table).toEqual([
      { numero: '47320000', debit: 60_000_000, credit: 0 },
      { numero: '71100000', debit: 0, credit: 60_000_000 },
    ]);
    expect((await ecriture('B9-QUOTE-PART-DIFFEREE', { partDifferee: 40_000_000 }, { '71': '71100000' })).table).toEqual([
      { numero: '71100000', debit: 40_000_000, credit: 0 },
      { numero: '47700000', debit: 0, credit: 40_000_000 },
    ]);
    expect((await ecriture('B9-RATTACHEMENT', { quotePart: 20_000_000 }, { '71': '71100000' })).table).toEqual([
      { numero: '47700000', debit: 20_000_000, credit: 0 },
      { numero: '71100000', debit: 0, credit: 20_000_000 },
    ]);
  });
});

describe('Guide, Application 17 — abandons de frais des bénévoles', () => {
  it('525 000 de frais engagés puis abandonnés', async () => {
    const engages = await ecriture('B10-FRAIS-ENGAGES', { frais: 525_000 }, { '6': '61800000' });
    expect(engages.table).toEqual([
      { numero: '61800000', debit: 525_000, credit: 0 },
      { numero: '45720000', debit: 0, credit: 525_000 },
    ]);
    expect((await ecriture('B10-ABANDON', { abandon: 525_000 })).table).toEqual([
      { numero: '45720000', debit: 525_000, credit: 0 },
      { numero: '75830000', debit: 0, credit: 525_000 },
    ]);
  });
});

describe('Guide, Applications 18 et 19 — mécénat et restitution', () => {
  it('convention de mécénat de 50 000 000 : créance dès la signature', async () => {
    expect((await ecriture('B11-SIGNATURE', { convention: 50_000_000 })).table).toEqual([
      { numero: '47500000', debit: 50_000_000, credit: 0 },
      { numero: '70460000', debit: 0, credit: 50_000_000 },
    ]);
  });

  it('restitution de 25 000 000 : la subvention d’équipement est débitée pour solde', async () => {
    const e = await ecriture('B12-CONSTATATION', { aReverser: 25_000_000 }, { '14': '14170000' });
    expect(e.table).toEqual([
      { numero: '14170000', debit: 25_000_000, credit: 0 },
      { numero: '47390000', debit: 0, credit: 25_000_000 },
    ]);
  });
});

describe('Guide, Application 20 — contributions volontaires en nature', () => {
  it('450 000 de fournitures reçues, hors bilan', async () => {
    expect((await ecriture('B13-BIENS', { valeur: 450_000 })).table).toEqual([
      { numero: '90100000', debit: 450_000, credit: 0 },
      { numero: '91000000', debit: 0, credit: 450_000 },
    ]);
  });

  /**
   * L'anomalie chiffrée du Guide. L'écriture porte 2 880 450 et le tableau de
   * la Note 1 porte 2 864 880, sans explication. 8 325 × 346 = 2 880 450 :
   * seule l'écriture se vérifie, c'est donc elle que le modèle calcule.
   */
  it('8 325 heures × 346 = 2 880 450 — et l’écart avec la Note 1 est signalé', async () => {
    const e = await ecriture('B13-BENEVOLAT', { heures: 8_325, tauxHoraire: 346 });
    expect(e.table).toEqual([
      { numero: '90400000', debit: 2_880_450, credit: 0 },
      { numero: '91400000', debit: 0, credit: 2_880_450 },
    ]);
    expect(e.anomalie).toMatch(/2 864 880/);
  });
});

// ---------------------------------------------------------------------------
// Balayages structurels
// ---------------------------------------------------------------------------

describe('Invariants du catalogue', () => {
  /**
   * LE balayage qui compte. Un préfixe trop court désignerait plusieurs
   * comptes du dossier ; le service refuserait alors d'imputer et laisserait
   * l'utilisateur devant un choix qu'il n'a pas à faire. Toute ligne non
   * marquée « au choix » doit donc désigner EXACTEMENT UN compte du plan réel.
   */
  it('toute ligne non marquée « au choix » désigne exactement un compte du plan livré', () => {
    for (const operation of CATALOGUE) {
      for (const modele of operation.modeles) {
        for (const ligne of modele.lignes) {
          if (ligne.auChoix) continue;
          const candidats = candidatsDe(ligne);
          expect({ modele: modele.code, compte: ligne.compte, trouves: candidats.map((c) => c.numero) }).toEqual({
            modele: modele.code,
            compte: ligne.compte,
            trouves: [candidats[0]?.numero].filter(Boolean),
          });
        }
      }
    }
  });

  it('toute ligne marquée « au choix » a bien PLUSIEURS candidats — sinon la marque est de trop', () => {
    for (const operation of CATALOGUE) {
      for (const modele of operation.modeles) {
        for (const ligne of modele.lignes.filter((l) => l.auChoix)) {
          const n = candidatsDe(ligne).length;
          expect({ modele: modele.code, compte: ligne.compte, candidats: n > 1 }).toEqual({
            modele: modele.code,
            compte: ligne.compte,
            candidats: true,
          });
        }
      }
    }
  });

  it('chaque modèle a au plus UN complément : deux rendraient la répartition indéterminée', () => {
    for (const operation of CATALOGUE) {
      for (const modele of operation.modeles) {
        const n = modele.lignes.filter((l) => l.montant.mode === 'COMPLEMENT').length;
        expect({ modele: modele.code, complements: n }).toEqual({ modele: modele.code, complements: n > 1 ? 'PLUSIEURS' : n });
      }
    }
  });

  it('chaque modèle a au moins un débit et un crédit', () => {
    for (const operation of CATALOGUE) {
      for (const modele of operation.modeles) {
        expect({
          modele: modele.code,
          debits: modele.lignes.some((l) => l.sens === 'DEBIT'),
          credits: modele.lignes.some((l) => l.sens === 'CREDIT'),
        }).toEqual({ modele: modele.code, debits: true, credits: true });
      }
    }
  });

  it('tout paramètre référencé par une ligne est déclaré par le modèle', () => {
    for (const operation of CATALOGUE) {
      for (const modele of operation.modeles) {
        const declares = new Set(modele.parametres.map((p) => p.nom));
        for (const l of modele.lignes) {
          const m = l.montant;
          const utilises =
            m.mode === 'PARAMETRE'
              ? [m.parametre]
              : m.mode === 'PROPORTION'
                ? [m.parametre, ...(typeof m.taux === 'string' ? [m.taux] : [])]
                : m.mode === 'ANNUITE'
                  ? [m.parametre, m.parametreDuree, ...(m.parametreMois ? [m.parametreMois] : [])]
                  : [];
          for (const u of utilises) {
            expect({ modele: modele.code, parametre: u, declare: declares.has(u) }).toEqual({
              modele: modele.code, parametre: u, declare: true,
            });
          }
        }
      }
    }
  });

  it('chaque modèle cite sa source, et chaque code est unique', () => {
    const codes = new Set<string>();
    for (const operation of CATALOGUE) {
      for (const modele of operation.modeles) {
        expect({ modele: modele.code, source: modele.source.length > 30 }).toEqual({ modele: modele.code, source: true });
        expect({ modele: modele.code, deja: codes.has(modele.code) }).toEqual({ modele: modele.code, deja: false });
        codes.add(modele.code);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Garde-fous du service
// ---------------------------------------------------------------------------

describe('Application effective d’un modèle', () => {
  it('refuse d’enregistrer tant qu’un compte reste à choisir', async () => {
    const { svc, creer } = service();
    await expect(
      svc.appliquer('t1', 'u1', {
        codeModele: 'B1-RECEPTION', parametres: { fonds: 1000 },
        exerciceId: 'e1', journalId: 'j1', date: '2026-06-01',
      }),
    ).rejects.toThrow(/reste à choisir/);
    expect(creer).not.toHaveBeenCalled();
  });

  it('passe par EcritureService.creer — jamais d’écriture par un chemin dérobé', async () => {
    const { svc, creer } = service();
    await svc.appliquer('t1', 'u1', {
      codeModele: 'B1-RECEPTION', parametres: { fonds: 45_000_000 }, comptesChoisis: { '52': '52110000' },
      exerciceId: 'e1', journalId: 'j1', date: '2026-06-01',
    });
    expect(creer).toHaveBeenCalledTimes(1);
    const dto = creer.mock.calls[0][2];
    expect(dto.libelle).toBe('Réception de fonds affectés à un projet');
    expect(dto.lignes).toHaveLength(2);
  });

  it('refuse un compte choisi qui ne correspond pas au préfixe du modèle', async () => {
    const { svc } = service();
    await expect(
      svc.proposer('t1', { codeModele: 'B1-RECEPTION', parametres: { fonds: 1000 }, comptesChoisis: { '52': '57100000' } }),
    ).rejects.toThrow(/ne commence pas par 52/);
  });

  it('exige les paramètres du modèle plutôt que de calculer sur du vide', async () => {
    const { svc } = service();
    await expect(svc.proposer('t1', { codeModele: 'B1-RECEPTION', parametres: {} })).rejects.toThrow(/requis/);
  });

  it('le catalogue est filtré sur le jeu du dossier, sans masquer l’autre', async () => {
    const { svc } = service('PROJETS_DEVELOPPEMENT');
    const c = await svc.catalogue('t1');
    expect(c.jeu).toBe('PROJETS');
    expect(c.operations.map((o) => o.code)).toContain('B19');
    expect(c.operationsAutreJeu.map((o) => o.code)).toContain('B14');
  });
});
