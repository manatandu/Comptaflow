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
  return {
    debit: montant.debit ?? 0,
    credit: montant.credit ?? 0,
    compte: {
      numero: numero ?? parDefaut[classe] ?? '60000000',
      classe,
      typeCompte: total ? TypeCompteDetailTotal.TOTAL : TypeCompteDetailTotal.DETAIL,
    },
  };
}

function service(
  lignes: ReturnType<typeof ligne>[],
  dossier: { referentiel?: Referentiel; formeJuridiqueSyscohada?: FormeJuridiqueSyscohada | null } = {},
) {
  const prisma = {
    ligneEcriture: { findMany: jest.fn().mockResolvedValue(lignes) },
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

  it('signale le franchissement du total du bilan', async () => {
    const r = await service([ligne(ClasseCompte.CLASSE_2, { debit: SEUIL_BILAN_AUDITEUR + 1 })]).seuilsAuditeur(
      't1',
      'e1',
      0,
    );
    expect(r.franchis.map((f) => f.critere)).toContain('Total du bilan');
  });

  it('signale le franchissement des ressources annuelles', async () => {
    const r = await service([
      ligne(ClasseCompte.CLASSE_7, { credit: SEUIL_RESSOURCES_AUDITEUR + 1 }),
    ]).seuilsAuditeur('t1', 'e1', 0);
    expect(r.franchis.map((f) => f.critere)).toContain('Ressources annuelles');
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
    expect(r.franchis.map((f) => f.critere)).toEqual(['Total du bilan']);
    // C'EST LE DÉFAUT D'ORIGINE : avec la règle SYCEBNL, ce dossier était
    // alerté. L'art. 376 en demande deux.
    expect(r.obligationDeclenchee).toBe(false);
  });

  it('la même SARL est tenue dès qu’elle en franchit DEUX', async () => {
    const r = await service([BILAN(200_000_000), CA(300_000_000)], SARL).seuilsAuditeur('t1', 'e1', 3);
    expect(r.obligationDeclenchee).toBe(true);
    expect(r.source).toBe('AUSCGIE, article 376');
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

  it('une SA est tenue SANS condition de taille · art. 702, aucun seuil à mesurer', async () => {
    const r = await service([BILAN(1)], {
      referentiel: Referentiel.SYSCOHADA,
      formeJuridiqueSyscohada: FormeJuridiqueSyscohada.SOCIETE_ANONYME,
    }).seuilsAuditeur('t1', 'e1', 0);
    expect(r.obligationSansSeuil).toBe(true);
    expect(r.criteres).toEqual([]);
    expect(r.source).toBe('AUSCGIE, article 702');
  });

  it('une forme sans règle lue ne mesure RIEN plutôt que d’emprunter un seuil voisin', async () => {
    const r = await service([BILAN(900_000_000)], {
      referentiel: Referentiel.SYSCOHADA,
      formeJuridiqueSyscohada: FormeJuridiqueSyscohada.GROUPEMENT_INTERET_ECONOMIQUE,
    }).seuilsAuditeur('t1', 'e1', 999);
    expect(r.regle.genre).toBe('AUCUNE_REGLE_LUE');
    expect(r.obligationDeclenchee).toBe(false);
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
    // le chiffre d'affaires des produits financiers et déclarerait le dossier
    // au-dessus d'un seuil qu'il n'a pas franchi.
    expect(ca.valeur).toBe(200_000_000);
    expect(ca.franchi).toBe(false);
  });

  it('en SYCEBNL, la classe 7 entière compte · ce sont des RESSOURCES, pas un chiffre d’affaires', async () => {
    const r = await service([
      ligne(ClasseCompte.CLASSE_7, { credit: 150_000_000 }, false, '70110000'),
      ligne(ClasseCompte.CLASSE_7, { credit: 100_000_000 }, false, '77100000'),
    ]).seuilsAuditeur('t1', 'e1', 0);
    const ressources = r.criteres.find((c) => c.critere === 'Ressources annuelles')!;
    expect(ressources.valeur).toBe(250_000_000);
    expect(ressources.franchi).toBe(true);
    // Et un seul critère suffit en SYCEBNL.
    expect(r.obligationDeclenchee).toBe(true);
  });
});
