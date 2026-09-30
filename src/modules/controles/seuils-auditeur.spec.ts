import { ControlesService } from './controles.service';
import {
  SEUIL_BILAN_AUDITEUR,
  SEUIL_EFFECTIF_AUDITEUR,
  SEUIL_RESSOURCES_AUDITEUR,
} from './controles.service';
import { PrismaService } from '../../common/prisma.service';
import { ClasseCompte, FormeJuridiqueSyscohada, Referentiel, TypeCompteDetailTotal } from '@prisma/client';

/**
 * SEUILS DE DÉSIGNATION DE L'AUDITEUR · article 19 de l'Acte uniforme
 * SYCEBNL. Trois critères ALTERNATIFS : un seul suffit à rendre la
 * désignation obligatoire. Le logiciel n'en portait rien avant l'audit du
 * 29 août 2026, alors qu'il calculait déjà les deux montants pour les états
 * financiers · une entité pouvait franchir un seuil et déposer ses comptes
 * sans que rien ne le signale.
 */

/**
 * Le NUMÉRO compte désormais autant que la classe : en SYSCOHADA, le seuil
 * porte sur le CHIFFRE D'AFFAIRES (701 à 707), pas sur la classe 7 entière.
 * Par défaut on donne un numéro de vente, pour que les tests SYCEBNL écrits
 * avant cette distinction gardent leur sens.
 */
function ligne(
  classe: ClasseCompte,
  montant: { debit?: number; credit?: number },
  total = false,
  numero?: string,
) {
  const parDefaut: Record<string, string> = {
    [ClasseCompte.CLASSE_1]: '10100000',
    [ClasseCompte.CLASSE_2]: '21000000',
    [ClasseCompte.CLASSE_3]: '31000000',
    [ClasseCompte.CLASSE_4]: '41100000',
    [ClasseCompte.CLASSE_5]: '52100000',
    [ClasseCompte.CLASSE_7]: '70110000',
  };
  const n = numero ?? parDefaut[classe] ?? '60000000';
  return {
    debit: montant.debit ?? 0,
    credit: montant.credit ?? 0,
    // Une ligne portée par l'écriture de clôture · voir `cloture()`.
    estGenereeParCloture: false,
    compte: {
      // Un compte Total a son propre identifiant, même numéro ou non.
      id: `${n}${total ? '-T' : ''}`,
      numero: n,
      classe,
      typeCompte: total ? TypeCompteDetailTotal.TOTAL : TypeCompteDetailTotal.DETAIL,
    },
  };
}

function service(
  lignes: ReturnType<typeof ligne>[],
  dossier: { referentiel?: Referentiel; formeJuridiqueSyscohada?: FormeJuridiqueSyscohada | null } = {},
) {
  // LA DOUBLURE AGRÈGE COMME LA BASE · une ligne par compte, sommes des
  // débits et des crédits, écritures de clôture écartées quand le filtre le
  // demande. Une doublure qui rendait les lignes une à une validait la
  // boucle ligne à ligne que l'audit du 2026-09-27 (F8) a relevée.
  type Filtre = { where: { ecriture: { estGenereeParCloture?: boolean } } };
  const groupBy = jest.fn().mockImplementation(({ where }: Filtre) => {
    const parCompte = new Map<string, { compteId: string; _sum: { debit: number; credit: number } }>();
    for (const l of lignes) {
      if (where.ecriture.estGenereeParCloture === false && l.estGenereeParCloture) continue;
      const g = parCompte.get(l.compte.id) ?? { compteId: l.compte.id, _sum: { debit: 0, credit: 0 } };
      g._sum.debit += l.debit;
      g._sum.credit += l.credit;
      parCompte.set(l.compte.id, g);
    }
    return Promise.resolve([...parCompte.values()]);
  });
  const comptes = [...new Map(lignes.map((l) => [l.compte.id, l.compte])).values()];
  // Le solde d'une racine · la doublure honore le préfixe demandé.
  type FiltreAgregat = { where: { compte: { numero: { startsWith: string } } } };
  const aggregate = jest.fn().mockImplementation(({ where }: FiltreAgregat) => {
    const retenues = lignes.filter((l) => l.compte.numero.startsWith(where.compte.numero.startsWith));
    return Promise.resolve({
      _sum: {
        debit: retenues.reduce((t, l) => t + l.debit, 0),
        credit: retenues.reduce((t, l) => t + l.credit, 0),
      },
    });
  });
  const prisma = {
    ligneEcriture: { groupBy, aggregate },
    compte: { findMany: jest.fn().mockResolvedValue(comptes) },
    tenant: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        referentiel: dossier.referentiel ?? Referentiel.SYCEBNL,
        formeJuridiqueSyscohada: dossier.formeJuridiqueSyscohada ?? null,
      }),
    },
  } as unknown as PrismaService;
  return new ControlesService(prisma);
}

describe("Seuils de désignation de l'auditeur (SYCEBNL, art. 19)", () => {
  it('ne signale rien sous les trois seuils', async () => {
    const r = await service([
      ligne(ClasseCompte.CLASSE_5, { debit: 4_000_000 }),
      ligne(ClasseCompte.CLASSE_7, { credit: 9_000_000 }),
    ]).seuilsAuditeur('t1', 'e1', 3);
    expect(r.franchis).toHaveLength(0);
  });

  it('un total du bilan en FC au-delà du NOMBRE du seuil FCFA n’est PAS dit franchi (O1b-G2)', async () => {
    // Art. 19 · « ou l'équivalent dans l'unité monétaire ayant cours légal ».
    // Comparer 100 000 001 FC à 100 000 000 FCFA déclarait franchi un seuil
    // que l'entité n'a pas atteint.
    const r = await service([ligne(ClasseCompte.CLASSE_2, { debit: SEUIL_BILAN_AUDITEUR + 1 })]).seuilsAuditeur(
      't1',
      'e1',
      0,
    );
    const bilan = r.criteres.find((c) => c.critere === 'Total du bilan')!;
    expect([bilan.mesure, bilan.franchi, r.obligationDeclenchee]).toEqual([false, false, false]);
    expect(r.nonCompares.map((c) => c.critere)).toEqual(['Total du bilan']);
    expect(r.obligationIndeterminee).toBe(true);
    expect(bilan.detail).toContain('FC (monnaie de tenue)');
    expect(bilan.detail).toContain("l'équivalent dans l'unité monétaire ayant cours légal");
  });

  it('les ressources annuelles ne sont pas comparées non plus', async () => {
    const r = await service([
      ligne(ClasseCompte.CLASSE_7, { credit: SEUIL_RESSOURCES_AUDITEUR + 1 }),
    ]).seuilsAuditeur('t1', 'e1', 0);
    expect(r.franchis).toEqual([]);
    expect(r.nonCompares.map((c) => c.critere)).toEqual(['Ressources annuelles']);
  });

  it("signale le franchissement de l'effectif, seul critère hors comptabilité", async () => {
    const r = await service([]).seuilsAuditeur('t1', 'e1', SEUIL_EFFECTIF_AUDITEUR + 1);
    expect(r.franchis.map((f) => f.critere)).toContain('Effectif permanent');
  });

  it('les critères sont ALTERNATIFS · un seul suffit', async () => {
    const r = await service([]).seuilsAuditeur('t1', 'e1', 25);
    expect(r.franchis).toHaveLength(1);
    expect(r.criteres).toHaveLength(3);
  });

  it('un effectif non renseigné le DIT, au lieu de conclure à zéro', async () => {
    const r = await service([]).seuilsAuditeur('t1', 'e1', 0);
    const effectif = r.criteres.find((c) => c.critere === 'Effectif permanent')!;
    expect(effectif.franchi).toBe(false);
    expect(effectif.detail).toContain('non renseigné');
  });

  it('ne convertit PAS le seuil en francs congolais · le taux est inconnu du logiciel', async () => {
    const r = await service([]).seuilsAuditeur('t1', 'e1', 0);
    expect(r.conversionAppliquee).toBe(false);
    expect(r.source).toContain('article 19');
  });

  it('additionne les SOLDES par compte, pas les débits ligne à ligne (F8)', async () => {
    // Une caisse débitée de 100 et créditée de 90, dix fois · solde 100.
    const caisse = Array.from({ length: 10 }, () => [
      ligne(ClasseCompte.CLASSE_5, { debit: 100 }, false, '57110000'),
      ligne(ClasseCompte.CLASSE_5, { credit: 90 }, false, '57110000'),
    ]).flat();
    const r = await service(caisse).seuilsAuditeur('t1', 'e1', 0);
    expect(['Total du bilan', r.criteres.find((c) => c.critere === 'Total du bilan')!.valeur]).toEqual(['Total du bilan', 100]);
  });

  it('les ressources d’un exercice clos se lisent hors écriture de clôture (F8)', async () => {
    const produit = ligne(ClasseCompte.CLASSE_7, { credit: SEUIL_RESSOURCES_AUDITEUR + 1 });
    const cloture = { ...ligne(ClasseCompte.CLASSE_7, { debit: SEUIL_RESSOURCES_AUDITEUR + 1 }), estGenereeParCloture: true };
    const r = await service([produit, cloture]).seuilsAuditeur('t1', 'e1', 0);
    expect(['valeur', r.criteres.find((c) => c.critere === 'Ressources annuelles')!.valeur]).toEqual(['valeur', SEUIL_RESSOURCES_AUDITEUR + 1]);
  });

  it('un montant sous le nombre du seuil ne rend pas le verdict indéterminé', async () => {
    const r = await service([ligne(ClasseCompte.CLASSE_2, { debit: 10 })]).seuilsAuditeur('t1', 'e1', 0);
    expect([r.nonCompares, r.obligationIndeterminee]).toEqual([[], false]);
  });

  it('la lecture est bornée au livre-journal de l’exercice et au dossier', async () => {
    const svc = service([ligne(ClasseCompte.CLASSE_2, { debit: 10 })]);
    await svc.seuilsAuditeur('t1', 'e1', 0);
    const prisma = (svc as unknown as { prisma: { ligneEcriture: { groupBy: jest.Mock }; compte: { findMany: jest.Mock } } }).prisma;
    expect(prisma.ligneEcriture.groupBy.mock.calls.map((c) => c[0].where)).toEqual([
      { ecriture: { tenantId: 't1', exerciceId: 'e1', statut: 'VALIDEE' } },
      { ecriture: { tenantId: 't1', exerciceId: 'e1', statut: 'VALIDEE', estGenereeParCloture: false } },
    ]);
    expect(prisma.compte.findMany.mock.calls[0][0].where).toEqual({ tenantId: 't1', id: { in: ['21000000'] } });
  });

  it('ignore les comptes de TOTAL · ils agrègent leurs enfants', async () => {
    const r = await service([
      ligne(ClasseCompte.CLASSE_2, { debit: 60_000_000 }),
      ligne(ClasseCompte.CLASSE_2, { debit: 60_000_000 }, true),
    ]).seuilsAuditeur('t1', 'e1', 0);
    // 60 M seulement, et non 120 M : le compte de TOTAL n'est pas recompté.
    expect(r.criteres.find((c) => c.critere === 'Total du bilan')!.valeur).toBe(60_000_000);
    expect(r.franchis).toHaveLength(0);
  });
});

/**
 * L'AUSCGIE NE DIT PAS LA MÊME CHOSE QUE LE SYCEBNL, ET C'EST LE FOND.
 *
 * Le contrôle vivait en dur sur l'article 19 du SYCEBNL et le servait à tout
 * dossier. Une SARL recevait donc les seuils d'une association, avec le nom
 * d'un texte qui n'est pas le sien · et dans le sens le plus fâcheux : les
 * trois critères du SYCEBNL sont ALTERNATIFS, un seul suffit, là où l'AUSCGIE
 * en demande DEUX sur trois, à des montants plus élevés. Le logiciel envoyait
 * donc une entreprise chercher un commissaire aux comptes qu'elle n'était pas
 * tenue de désigner.
 *
 * Les quatre règles sont lues à leur source · art. 702 (SA, sans condition),
 * art. 376 (SARL) et art. 853-13 (SAS), art. 289-1 (SNC).
 */
const CA = (montant: number, numero = '70110000') =>
  ligne(ClasseCompte.CLASSE_7, { credit: montant }, false, numero);
const BILAN = (montant: number) => ligne(ClasseCompte.CLASSE_2, { debit: montant });
const SARL = { referentiel: Referentiel.SYSCOHADA, formeJuridiqueSyscohada: FormeJuridiqueSyscohada.SOCIETE_RESPONSABILITE_LIMITEE };

describe("Désignation du commissaire aux comptes · AUSCGIE, pas SYCEBNL", () => {
  it('une SARL qui franchit UN SEUL seuil n’est PAS tenue de désigner · deux sur trois', async () => {
    const r = await service([BILAN(200_000_000)], SARL).seuilsAuditeur('t1', 'e1', 3);
    expect(r.nonCompares.map((f) => f.critere)).toEqual(['Total du bilan']);
    // C'EST LE DÉFAUT D'ORIGINE : avec la règle SYCEBNL, ce dossier était
    // alerté. L'art. 376 en demande deux, et un seul critère, même comparé,
    // ne suffirait pas · le verdict n'est donc pas même indéterminé.
    expect([r.obligationDeclenchee, r.obligationIndeterminee]).toEqual([false, false]);
  });

  it('deux montants FC au-delà des nombres FCFA ne déclenchent RIEN · art. 906 (O1b-A2, G2)', async () => {
    // Le défaut : 200 000 000 FC et 300 000 000 FC comparés bruts à 125 et
    // 250 millions de FCFA, puis « Le dossier en remplit deux ou plus ».
    const r = await service([BILAN(200_000_000), CA(300_000_000)], SARL).seuilsAuditeur('t1', 'e1', 3);
    expect(r.obligationDeclenchee).toBe(false);
    expect(r.obligationIndeterminee).toBe(true);
    expect(r.source).toBe('AUSCGIE, article 376');
    expect(r.criteres[0].detail).toContain('article 906');
    expect(r.criteres[0].detail).toContain('30 janvier 2014');
  });

  it('l’effectif, sans unité monétaire, se compare · seul il ne suffit pas à une SARL', async () => {
    const r = await service([], SARL).seuilsAuditeur('t1', 'e1', 51);
    expect(r.franchis.map((c) => c.critere)).toEqual(['Effectif permanent']);
    expect(r.obligationDeclenchee).toBe(false);
    expect(r.obligationIndeterminee).toBe(false);
  });

  it('ses seuils sont ceux de l’art. 376, pas ceux de l’art. 19 SYCEBNL', async () => {
    const r = await service([], SARL).seuilsAuditeur('t1', 'e1', 0);
    expect(r.criteres.map((c) => c.seuil)).toEqual([125_000_000, 250_000_000, 50]);
    expect(r.criteres.map((c) => c.critere)).toEqual(['Total du bilan', "Chiffre d'affaires annuel", 'Effectif permanent']);
  });

  it('une SNC a ses PROPRES seuils · art. 289-1, plus élevés que la SARL', async () => {
    const r = await service([], {
      referentiel: Referentiel.SYSCOHADA,
      formeJuridiqueSyscohada: FormeJuridiqueSyscohada.SOCIETE_NOM_COLLECTIF,
    }).seuilsAuditeur('t1', 'e1', 0);
    expect(r.criteres.map((c) => c.seuil)).toEqual([250_000_000, 500_000_000, 50]);
    expect(r.source).toBe('AUSCGIE, article 289-1');
  });

  it('une SCS a les seuils de la SNC · art. 289-1 par le renvoi de l’art. 293-1 (O1a-E1)', async () => {
    const r = await service([], {
      referentiel: Referentiel.SYSCOHADA,
      formeJuridiqueSyscohada: FormeJuridiqueSyscohada.SOCIETE_COMMANDITE_SIMPLE,
    }).seuilsAuditeur('t1', 'e1', 0);
    expect(r.regle.genre).toBe('DEUX_SUR_TROIS');
    expect(r.criteres.map((c) => c.seuil)).toEqual([250_000_000, 500_000_000, 50]);
    expect(r.source).toBe("AUSCGIE, article 289-1, applicable par l'article 293-1");
  });

  it('une SA est tenue SANS condition de taille · art. 702, aucun seuil à mesurer', async () => {
    const r = await service([BILAN(1)], {
      referentiel: Referentiel.SYSCOHADA,
      formeJuridiqueSyscohada: FormeJuridiqueSyscohada.SOCIETE_ANONYME,
    }).seuilsAuditeur('t1', 'e1', 0);
    expect(r.obligationSansSeuil).toBe(true);
    expect(r.criteres).toEqual([]);
    expect(r.source).toBe('AUSCGIE, article 702');
  });

  it('un GIE sans emprunt obligataire ne mesure RIEN · art. 880, le contrôle du contrat', async () => {
    const r = await service([BILAN(900_000_000)], {
      referentiel: Referentiel.SYSCOHADA,
      formeJuridiqueSyscohada: FormeJuridiqueSyscohada.GROUPEMENT_INTERET_ECONOMIQUE,
    }).seuilsAuditeur('t1', 'e1', 999);
    expect(r.regle.genre).toBe('AUCUNE_REGLE_LUE');
    expect(r.obligationDeclenchee).toBe(false);
    expect(r.obligationSansSeuil).toBe(false);
    expect(r.criteres).toEqual([]);
    expect(r.regle.genre === 'AUCUNE_REGLE_LUE' && r.regle.motif).toContain('article 880');
  });

  it('un GIE qui porte un solde au 161 doit un commissaire, sans seuil · art. 875 et 880 (O1b-G7)', async () => {
    const r = await service([ligne(ClasseCompte.CLASSE_1, { credit: 5_000_000 }, false, '16110000')], {
      referentiel: Referentiel.SYSCOHADA,
      formeJuridiqueSyscohada: FormeJuridiqueSyscohada.GROUPEMENT_INTERET_ECONOMIQUE,
    }).seuilsAuditeur('t1', 'e1', 0);
    expect(r.obligationSansSeuil).toBe(true);
    expect(r.source).toBe('AUSCGIE, articles 875 et 880');
    expect(r.regle.genre === 'TOUJOURS' && r.regle.motif).toContain('six');
  });

  it('une coopérative reçoit l’AUSCOOP art. 121, pas l’AUSCGIE (O6-B2)', async () => {
    const r = await service([BILAN(900_000_000)], {
      referentiel: Referentiel.SYSCOHADA,
      formeJuridiqueSyscohada: FormeJuridiqueSyscohada.SOCIETE_COOPERATIVE,
    }).seuilsAuditeur('t1', 'e1', 999);
    expect(r.regle.genre).toBe('AUCUNE_REGLE_LUE');
    const motif = r.regle.genre === 'AUCUNE_REGLE_LUE' ? r.regle.motif : '';
    expect(motif).toContain('AUSCOOP, article 121');
    expect(motif).toContain('facultative pour la société coopérative simplifiée');
    expect(r.criteres).toEqual([]);
  });

  it('une forme non renseignée le dit, au lieu de deviner', async () => {
    const r = await service([BILAN(900_000_000)], {
      referentiel: Referentiel.SYSCOHADA,
      formeJuridiqueSyscohada: null,
    }).seuilsAuditeur('t1', 'e1', 999);
    expect(r.regle.genre).toBe('AUCUNE_REGLE_LUE');
  });
});

describe("Chiffre d'affaires contre ressources · deux mesures différentes", () => {
  it('en SYSCOHADA, seuls les comptes 701 à 707 comptent · pas la classe 7 entière', async () => {
    const r = await service(
      [
        CA(200_000_000), // 7011 · ventes de marchandises
        CA(100_000_000, '77100000'), // 771 · revenus financiers, HORS chiffre d'affaires
      ],
      SARL,
    ).seuilsAuditeur('t1', 'e1', 0);
    const ca = r.criteres.find((c) => c.critere === "Chiffre d'affaires annuel")!;
    // 200 000 000 et non 300 000 000 : compter la classe 7 entière gonflerait
    // le chiffre d'affaires des produits financiers.
    expect(ca.valeur).toBe(200_000_000);
    expect(r.nonCompares).toEqual([]);
  });

  it('en SYCEBNL, la classe 7 entière compte · ce sont des RESSOURCES, pas un chiffre d’affaires', async () => {
    const r = await service([
      ligne(ClasseCompte.CLASSE_7, { credit: 150_000_000 }, false, '70110000'),
      ligne(ClasseCompte.CLASSE_7, { credit: 100_000_000 }, false, '77100000'),
    ]).seuilsAuditeur('t1', 'e1', 0);
    const ressources = r.criteres.find((c) => c.critere === 'Ressources annuelles')!;
    expect(ressources.valeur).toBe(250_000_000);
    // Un seul critère suffit en SYCEBNL · non comparé, il rend le verdict
    // indéterminé, jamais acquis.
    expect(r.obligationIndeterminee).toBe(true);
  });
});

describe('Le planning de clôture nomme les formes et les sanctions (O1a-E1, O1b-G8)', () => {
  // Import tardif · le planning n'est lu que par ces deux cas.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { JALONS_CLOTURE } = require('../exercice/planning-cloture') as typeof import('../exercice/planning-cloture');
  const jalon = (etape: number) => JALONS_CLOTURE.find((j) => j.etape === etape && j.referentiels?.includes(Referentiel.SYSCOHADA))!;

  it('le jalon 18 nomme la SNC et la SCS, par l’art. 289-1 et le renvoi de l’art. 293-1', () => {
    expect(jalon(18).detail).toContain('dans la SNC et la SCS');
    expect(jalon(18).source).toContain('289-1 (SNC) et 293-1 (SCS)');
  });

  it('le jalon 24 cite la sanction pénale de l’art. 890-1', () => {
    expect(jalon(24).source).toContain('art. 890-1');
  });
});
