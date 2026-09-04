import { BadRequestException } from '@nestjs/common';
import { SensRetraitementFiscal } from '@prisma/client';
import { FiscaliteService } from './fiscalite.service';
import { CompteService } from '../comptes/compte.service';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';

/**
 * RÉINTÉGRATIONS PROPOSÉES DEPUIS LES COMPTES QUALIFIÉS PAR LE CABINET.
 *
 * Le catalogue des retraitements pose une règle qui n'est PAS défaite ici :
 * la qualification fiscale d'une charge ne se lit pas dans son numéro de
 * compte, et un logiciel qui trancherait seul se tromperait en silence.
 *
 * Ce qui change est autre chose. Un cabinet qui ouvre son propre sous-compte
 * « Amendes fiscales » a déjà tranché, une fois. Le logiciel lui repropose
 * chaque exercice le montant et l'article, au lieu de le lui faire
 * ressaisir · il ne qualifie pas, il se souvient. Et il ne CRÉE rien : ce
 * sont des propositions, que le comptable reprend, corrige ou ignore.
 */

function service(options: {
  comptes?: Array<{ id: string; numero: string; intitule: string; codeRetraitementFiscal: string | null }>;
  mouvements?: Array<{ compteId: string; debit: number; credit: number }>;
  chiffreAffaires?: number;
  /**
   * Charges comptabilisées · elles seules font le SIGNE du résultat, et
   * l'art. 44 en fait une condition d'ouverture du droit à déduction.
   */
  chargesComptables?: number;
  /** Retraitements déjà saisis · ce qui a déjà été réintégré ne l'est pas deux fois. */
  retraitements?: Array<{ code: string; sens: SensRetraitementFiscal; montant: number }>;
}) {
  const prisma = {
    tenant: {
      findUnique: jest.fn().mockResolvedValue({ id: 't-1', referentiel: 'SYSCOHADA' }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 't-1', referentiel: 'SYSCOHADA' }),
    },
    exercice: { findFirst: jest.fn().mockResolvedValue({ id: 'ex-1', tenantId: 't-1' }) },
    compte: { findMany: jest.fn().mockResolvedValue(options.comptes ?? []) },
    ligneEcriture: {
      groupBy: jest.fn().mockResolvedValue(
        (options.mouvements ?? []).map((m) => ({ compteId: m.compteId, _sum: { debit: m.debit, credit: m.credit } })),
      ),
    },
    retraitementFiscal: {
      findMany: jest.fn().mockResolvedValue(
        (options.retraitements ?? []).map((r, i) => ({ id: `r${i}`, libelle: 'x', commentaire: null, ...r })),
      ),
    },
  } as unknown as PrismaService;

  // La balance porte le chiffre d'affaires · assiette des plafonds légaux ·
  // ET les charges, qui donnent au résultat son signe.
  const ecritures = {
    balance: jest.fn().mockResolvedValue({
      lignes: [
        { numero: '70110000', intitule: 'Ventes', typeCompte: 'DETAIL', solde: -(options.chiffreAffaires ?? 0) },
        ...(options.chargesComptables
          ? [{ numero: '60110000', intitule: 'Achats', typeCompte: 'DETAIL', solde: options.chargesComptables }]
          : []),
      ],
    }),
  } as unknown as EcritureService;

  const svc = new FiscaliteService(prisma, ecritures);
  return svc;
}

const compte = (id: string, numero: string, code: string | null) => ({
  id,
  numero,
  intitule: `Compte ${numero}`,
  codeRetraitementFiscal: code,
});

describe('propositions de retraitement', () => {
  it('un compte SANS plafond propose tout son mouvement net', async () => {
    // « Amendes et pénalités » · l'article 50, 3° les exclut toutes de la
    // déduction, il n'y a pas de fraction admise.
    const svc = service({
      comptes: [compte('c-1', '64710000', 'AMENDES_PENALITES')],
      mouvements: [{ compteId: 'c-1', debit: 1_200_000, credit: 0 }],
    });
    const { propositions } = await svc.propositionsRetraitements('t-1', 'ex-1');
    expect(propositions).toHaveLength(1);
    expect(propositions[0]).toMatchObject({
      numero: '64710000',
      code: 'AMENDES_PENALITES',
      sens: SensRetraitementFiscal.REINTEGRATION,
      mouvement: 1_200_000,
      montantAdmis: null,
      montant: 1_200_000,
    });
    expect(propositions[0].source).toContain('art.');
  });

  it('un compte PLAFONNÉ ne propose que l’EXCÉDENT', async () => {
    // Réintégrer la charge entière ferait payer l'impôt sur une somme que la
    // loi admet en déduction · c'est la faute que ce test empêche.
    // Dons, art. 44 : 0,5 % du chiffre d'affaires.
    const svc = service({
      comptes: [compte('c-1', '65820000', 'DONS_EXCEDENT')],
      mouvements: [{ compteId: 'c-1', debit: 900_000, credit: 0 }],
      chiffreAffaires: 100_000_000,
    });
    const { propositions } = await svc.propositionsRetraitements('t-1', 'ex-1');
    expect(propositions[0]).toMatchObject({
      mouvement: 900_000,
      montantAdmis: 500_000,
      montant: 400_000,
    });
    expect(propositions[0].plafondEnonce).toContain("0,5 % du chiffre d'affaires");
  });

  it('sous le plafond, AUCUNE proposition', async () => {
    const svc = service({
      comptes: [compte('c-1', '65820000', 'DONS_EXCEDENT')],
      mouvements: [{ compteId: 'c-1', debit: 200_000, credit: 0 }],
      chiffreAffaires: 100_000_000,
    });
    const { propositions } = await svc.propositionsRetraitements('t-1', 'ex-1');
    expect(propositions).toEqual([]);
  });

  it('un compte au solde CRÉDITEUR ne propose rien', async () => {
    // Un avoir supérieur à la charge · il ne reste plus rien à réintégrer, et
    // proposer un montant négatif diminuerait l'impôt au lieu de l'augmenter.
    const svc = service({
      comptes: [compte('c-1', '64710000', 'AMENDES_PENALITES')],
      mouvements: [{ compteId: 'c-1', debit: 100_000, credit: 300_000 }],
    });
    const { propositions } = await svc.propositionsRetraitements('t-1', 'ex-1');
    expect(propositions).toEqual([]);
  });

  it('un compte sans mouvement de l’exercice ne propose rien', async () => {
    const svc = service({ comptes: [compte('c-1', '64710000', 'AMENDES_PENALITES')], mouvements: [] });
    const { propositions } = await svc.propositionsRetraitements('t-1', 'ex-1');
    expect(propositions).toEqual([]);
  });

  it('un code devenu INCONNU est ignoré, pas rendu sans libellé', async () => {
    // Un catalogue remanié ne doit pas rendre un dossier illisible · une
    // proposition sans article ni libellé ne veut rien dire.
    const svc = service({
      comptes: [compte('c-1', '64710000', 'CODE_DISPARU')],
      mouvements: [{ compteId: 'c-1', debit: 500_000, credit: 0 }],
    });
    const { propositions } = await svc.propositionsRetraitements('t-1', 'ex-1');
    expect(propositions).toEqual([]);
  });

  it('la lecture ne prend QUE le livre-journal', async () => {
    // Un impôt ne se calcule pas sur du brouillard.
    const svc = service({ comptes: [compte('c-1', '64710000', 'AMENDES_PENALITES')], mouvements: [] });
    await svc.propositionsRetraitements('t-1', 'ex-1');
    const prisma = (svc as unknown as { prisma: { ligneEcriture: { groupBy: jest.Mock } } }).prisma;
    expect(prisma.ligneEcriture.groupBy.mock.calls[0][0].where.ecriture.statut).toBe('VALIDEE');
  });
});

describe('le code posé sur un compte est vérifié', () => {
  function compteService() {
    const prisma = {
      tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 't-1', longueurCompte: 8 }) },
      compte: {
        findFirst: jest.fn().mockResolvedValue({ id: 'c-1', numero: '64710000' }),
        update: jest.fn().mockResolvedValue({ id: 'c-1' }),
      },
      ligneEcriture: { findFirst: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    return new CompteService(prisma);
  }

  it('REFUSE un code absent du catalogue', async () => {
    // Pas de clé étrangère · le catalogue est une table de code. La garde est
    // donc dans le service, faute de quoi le dossier porterait chaque année
    // une proposition sans article, que personne ne peut justifier.
    await expect(
      compteService().modifier('t-1', 'c-1', { codeRetraitementFiscal: 'INVENTE' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepte un code du catalogue, et la chaîne vide qui l’efface', async () => {
    const svc = compteService();
    await expect(svc.modifier('t-1', 'c-1', { codeRetraitementFiscal: '' })).resolves.toBeDefined();
    await expect(svc.modifier('t-1', 'c-1', { codeRetraitementFiscal: 'AMENDES_PENALITES' })).resolves.toBeDefined();
  });
});

/**
 * LES PLAFONDS EN POURCENTAGE DU CHIFFRE D'AFFAIRES SONT DES PLAFONDS DE
 * NATURE, PAS DE COMPTE.
 *
 * Art. 44 : les versements sont admis « dans la limite de 0,5 % du chiffre
 * d'affaires de l'exercice ». Art. 49, 1° : les cadeaux, « dans les limites de
 * deux pour mille (2 ‰) du chiffre d'affaires hors taxes ». Art. 43 : les
 * redevances versées à des entités liées, « dans la limite de 3,5 % du chiffre
 * d'affaires hors taxes ». Aucun de ces trois textes ne parle de compte.
 *
 * CE QUE LE CALCUL COMPTE PAR COMPTE LAISSAIT PASSER · un cabinet qui tient
 * deux sous-comptes de dons obtenait deux fois 0,5 % du chiffre d'affaires,
 * trois sous-comptes trois fois. Aucun total n'affichait le dépassement : le
 * calcul avait l'air normal, seul l'impôt était faux.
 *
 * Les plafonds assis sur la CHARGE (60 % des frais de représentation,
 * art. 49, 2° ; 50 % des frais de communication, art. 49, 7°) ne connaissent
 * pas ce défaut : une fraction est linéaire, et le dernier test le fige.
 */
describe('plafond en pourcentage du chiffre d’affaires · global par nature', () => {
  it('cumule les comptes d’une MÊME nature avant d’appliquer le plafond', async () => {
    // Deux sous-comptes de dons, 400 000 chacun. Plafond de l'art. 44 :
    // 0,5 % de 100 000 000, soit 500 000 pour LA NATURE ENTIÈRE.
    // Compte par compte, chacun restait sous 500 000 et RIEN n'était
    // proposé · 300 000 de charges non déductibles passaient en silence.
    const svc = service({
      comptes: [compte('c-1', '65820000', 'DONS_EXCEDENT'), compte('c-2', '65830000', 'DONS_EXCEDENT')],
      mouvements: [
        { compteId: 'c-1', debit: 400_000, credit: 0 },
        { compteId: 'c-2', debit: 400_000, credit: 0 },
      ],
      chiffreAffaires: 100_000_000,
    });
    const { propositions } = await svc.propositionsRetraitements('t-1', 'ex-1');
    expect(propositions).toHaveLength(2);
    expect(propositions.reduce((s, p) => s + p.montant, 0)).toBe(300_000);
    // Chaque ligne porte le cumul de la nature et le plafond de la nature,
    // pour que le comptable voie d'où vient sa quote-part.
    expect(propositions[0]).toMatchObject({
      mouvement: 400_000,
      mouvementNature: 800_000,
      montantAdmisNature: 500_000,
      montant: 150_000,
      montantAdmis: 250_000,
    });
    expect(propositions[0].plafondEnonce).toMatch(/plafond commun/);
  });

  it('répartit l’excédent au prorata, au centime près', async () => {
    // Trois comptes de cadeaux, art. 49, 1° : 2 ‰ de 90 000 000 = 180 000
    // admis pour la nature. Cumul 1 000 000, excédent 820 000, réparti
    // 1/3 - 1/3 - 1/3 · le dernier compte absorbe l'arrondi.
    const svc = service({
      comptes: [
        compte('c-1', '62340000', 'CADEAUX_EXCEDENT'),
        compte('c-2', '62341000', 'CADEAUX_EXCEDENT'),
        compte('c-3', '62342000', 'CADEAUX_EXCEDENT'),
      ],
      mouvements: [
        { compteId: 'c-1', debit: 333_333, credit: 0 },
        { compteId: 'c-2', debit: 333_333, credit: 0 },
        { compteId: 'c-3', debit: 333_334, credit: 0 },
      ],
      chiffreAffaires: 90_000_000,
    });
    const { propositions } = await svc.propositionsRetraitements('t-1', 'ex-1');
    expect(propositions.reduce((s, p) => s + p.montant, 0)).toBe(820_000);
  });

  it('un seul compte porteur de la nature : le plafond entier, comme avant', async () => {
    const svc = service({
      comptes: [compte('c-1', '65820000', 'DONS_EXCEDENT'), compte('c-2', '64710000', 'AMENDES_PENALITES')],
      mouvements: [
        { compteId: 'c-1', debit: 900_000, credit: 0 },
        { compteId: 'c-2', debit: 50_000, credit: 0 },
      ],
      chiffreAffaires: 100_000_000,
    });
    const { propositions } = await svc.propositionsRetraitements('t-1', 'ex-1');
    const dons = propositions.find((p) => p.code === 'DONS_EXCEDENT');
    expect(dons).toMatchObject({ mouvement: 900_000, montantAdmis: 500_000, montant: 400_000 });
    expect(dons!.plafondEnonce).not.toMatch(/plafond commun/);
    // Une nature SANS plafond n'est pas cumulée : tout son mouvement se
    // réintègre, compte par compte (art. 50, 3°).
    expect(propositions.find((p) => p.code === 'AMENDES_PENALITES')).toMatchObject({ montant: 50_000 });
  });

  it('un plafond assis sur la CHARGE reste compte par compte · une fraction est linéaire', async () => {
    // Frais de représentation, art. 49, 2° : 60 % de LEUR MONTANT. 60 % de
    // chaque compte font 60 % de leur somme · rien à globaliser.
    const svc = service({
      comptes: [
        compte('c-1', '62570000', 'REPRESENTATION_EXCEDENT'),
        compte('c-2', '62571000', 'REPRESENTATION_EXCEDENT'),
      ],
      mouvements: [
        { compteId: 'c-1', debit: 100_000, credit: 0 },
        { compteId: 'c-2', debit: 200_000, credit: 0 },
      ],
      chiffreAffaires: 100_000_000,
    });
    const { propositions } = await svc.propositionsRetraitements('t-1', 'ex-1');
    expect(propositions.map((p) => p.montant)).toEqual([40_000, 80_000]);
    expect(propositions.map((p) => p.mouvementNature)).toEqual([null, null]);
  });
});

/**
 * ART. 44 · LE PLAFOND N'EST QUE LA MOITIÉ DE L'ARTICLE.
 *
 * Loi n° 23/053, art. 44, al. 2 : « Le bénéfice de cette disposition est
 * subordonné à la double condition que : 1. un relevé indiquant les montants,
 * la date des versements et l'identité des bénéficiaires soit joint à la
 * déclaration des résultats ; 2. le résultat net imposable avant déduction de
 * ces versements soit positif. »
 *
 * Le module ne connaissait que la limite de 0,5 % du chiffre d'affaires. Un
 * dossier déficitaire se voyait donc offrir une déduction que la loi ne lui
 * ouvre pas, et le déficit reportable déclaré était trop élevé d'autant · un
 * report fictif qui ne se découvre qu'à l'exercice où il s'impute.
 */
describe('condition d’ouverture du droit à déduction · art. 44, al. 2, 2°', () => {
  it('un dossier DÉFICITAIRE ne conserve AUCUN don en déduction · la totalité se réintègre', async () => {
    // CA 100 000 000, charges 102 800 000 : résultat comptable −2 800 000,
    // dont 800 000 de dons. Résultat AVANT déduction des versements :
    // −2 800 000 + 800 000 = −2 000 000, donc négatif · aucune déduction.
    // Le module offrait 500 000 (0,5 % du CA) et ne réintégrait que 300 000.
    const svc = service({
      comptes: [compte('c-1', '65820000', 'DONS_EXCEDENT')],
      mouvements: [{ compteId: 'c-1', debit: 800_000, credit: 0 }],
      chiffreAffaires: 100_000_000,
      chargesComptables: 102_800_000,
    });
    const { propositions } = await svc.propositionsRetraitements('t-1', 'ex-1');
    expect(propositions[0]).toMatchObject({
      mouvement: 800_000,
      montant: 800_000,
      montantAdmis: 0,
      montantAdmisNature: 0,
    });
    expect(propositions[0].plafondEnonce).toContain('SANS EFFET ICI');
    expect(propositions[0].plafondEnonce).toContain(
      'le résultat net imposable avant déduction de ces versements soit positif',
    );
  });

  it('le résultat se juge AVANT déduction des versements · des dons qui le rendent positif ouvrent le droit', async () => {
    // Résultat comptable −300 000, dons 900 000 · avant déduction des
    // versements le résultat vaut +600 000, la condition est REMPLIE et le
    // plafond de 0,5 % joue normalement. Un test du seul signe du résultat
    // fiscal réintégrerait ici 900 000 au lieu de 400 000.
    const svc = service({
      comptes: [compte('c-1', '65820000', 'DONS_EXCEDENT')],
      mouvements: [{ compteId: 'c-1', debit: 900_000, credit: 0 }],
      chiffreAffaires: 100_000_000,
      chargesComptables: 100_300_000,
    });
    const { propositions } = await svc.propositionsRetraitements('t-1', 'ex-1');
    expect(propositions[0]).toMatchObject({ montantAdmis: 500_000, montant: 400_000 });
    expect(propositions[0].plafondEnonce).not.toContain('SANS EFFET ICI');
  });

  it('ce qui a DÉJÀ été réintégré sous le même code ne compte pas deux fois', async () => {
    // Même dossier que le premier cas, mais 300 000 ont déjà été réintégrés
    // sous DONS_EXCEDENT : le résultat fiscal brut vaut −2 500 000, et le
    // résultat avant déduction des versements reste −2 000 000. Sans le
    // retrait du déjà-réintégré, il remonterait à −1 700 000 et la condition
    // basculerait sur un chiffre compté deux fois.
    const svc = service({
      comptes: [compte('c-1', '65820000', 'DONS_EXCEDENT')],
      mouvements: [{ compteId: 'c-1', debit: 800_000, credit: 0 }],
      chiffreAffaires: 100_000_000,
      chargesComptables: 102_800_000,
      retraitements: [{ code: 'DONS_EXCEDENT', sens: SensRetraitementFiscal.REINTEGRATION, montant: 300_000 }],
    });
    const { propositions } = await svc.propositionsRetraitements('t-1', 'ex-1');
    // Les séparateurs de milliers de `toLocaleString('fr-FR')` sont des
    // espaces insécables étroites · normalisées avant comparaison.
    expect(propositions[0].plafondEnonce!.replace(/[\u202f\u00a0]/g, ' ')).toContain('-2 000 000');
    expect(propositions[0]).toMatchObject({ montantAdmis: 0, montant: 800_000 });
  });

  it('la condition ne touche QUE le code qui la porte · les cadeaux gardent leur plafond', async () => {
    // Art. 49, 1° ne pose aucune condition de résultat : 2 ‰ de 100 000 000
    // = 200 000 admis, l'excédent seul se réintègre, déficit ou non.
    const svc = service({
      comptes: [compte('c-1', '62340000', 'CADEAUX_EXCEDENT')],
      mouvements: [{ compteId: 'c-1', debit: 500_000, credit: 0 }],
      chiffreAffaires: 100_000_000,
      chargesComptables: 150_000_000,
    });
    const { propositions } = await svc.propositionsRetraitements('t-1', 'ex-1');
    expect(propositions[0]).toMatchObject({ montantAdmis: 200_000, montant: 300_000 });
  });
});

/**
 * QUAND L'ASSIETTE DU REDRESSEMENT N'EST PAS LE MOUVEMENT DU COMPTE.
 *
 * Loi n° 23/053, art. 28, al. 1er : « Les amortissements des immobilisations
 * servant à l'exercice de l'activité […] sont déductibles du bénéfice
 * imposable », le taux étant « fixé par Arrêté du Ministre ayant les Finances
 * dans ses attributions ». La dotation conforme au barème EST déductible :
 * proposer le mouvement entier du compte de dotations, c'est proposer de
 * réintégrer une charge que la loi admet.
 */
describe('propositions sans assiette · le module s’abstient et le dit', () => {
  it('un compte de DOTATIONS AUX AMORTISSEMENTS ne propose aucun montant', async () => {
    const svc = service({
      comptes: [compte('c-1', '68130000', 'AMORTISSEMENTS_EXCEDENT')],
      mouvements: [{ compteId: 'c-1', debit: 25_000_000, credit: 0 }],
      chiffreAffaires: 200_000_000,
    });
    const { propositions, avertissements } = await svc.propositionsRetraitements('t-1', 'ex-1');
    // Le module proposait 25 000 000 de réintégration, soit 7 500 000 d'impôt
    // indu au taux de l'art. 56 si la ligne était reprise sans réflexion.
    expect(propositions).toEqual([]);
    expect(avertissements).toHaveLength(1);
    expect(avertissements[0]).toMatchObject({ numero: '68130000', code: 'AMORTISSEMENTS_EXCEDENT', mouvement: 25_000_000 });
    expect(avertissements[0].motif).toContain('EXCÉDENT');
    expect(avertissements[0].source).toContain('art. 28');
  });

  it('le supplément d’annuité des immobilisations réévaluées non plus · art. 133', async () => {
    const svc = service({
      comptes: [compte('c-1', '68131000', 'REEVALUATION_SUPPLEMENT_ANNUITE')],
      mouvements: [{ compteId: 'c-1', debit: 8_000_000, credit: 0 }],
      chiffreAffaires: 200_000_000,
    });
    const { propositions, avertissements } = await svc.propositionsRetraitements('t-1', 'ex-1');
    expect(propositions).toEqual([]);
    expect(avertissements[0].source).toContain('art. 133');
  });

  it('un compte SANS assiette hors portée continue de proposer tout son mouvement', async () => {
    // Art. 50, 3° · une amende n'est pas déductible pour un franc : là, le
    // mouvement EST l'assiette, et l'abstention serait une régression.
    const svc = service({
      comptes: [compte('c-1', '64710000', 'AMENDES_PENALITES')],
      mouvements: [{ compteId: 'c-1', debit: 500_000, credit: 0 }],
    });
    const { propositions, avertissements } = await svc.propositionsRetraitements('t-1', 'ex-1');
    expect(propositions[0]).toMatchObject({ montant: 500_000 });
    expect(avertissements).toEqual([]);
  });
});
