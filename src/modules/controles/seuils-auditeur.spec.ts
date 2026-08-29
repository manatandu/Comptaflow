import { ControlesService } from './controles.service';
import {
  SEUIL_BILAN_AUDITEUR,
  SEUIL_EFFECTIF_AUDITEUR,
  SEUIL_RESSOURCES_AUDITEUR,
} from './controles.service';
import { PrismaService } from '../../common/prisma.service';
import { ClasseCompte, TypeCompteDetailTotal } from '@prisma/client';

/**
 * SEUILS DE DÉSIGNATION DE L'AUDITEUR · article 19 de l'Acte uniforme
 * SYCEBNL. Trois critères ALTERNATIFS : un seul suffit à rendre la
 * désignation obligatoire. Le logiciel n'en portait rien avant l'audit du
 * 29 août 2026, alors qu'il calculait déjà les deux montants pour les états
 * financiers · une entité pouvait franchir un seuil et déposer ses comptes
 * sans que rien ne le signale.
 */

function ligne(classe: ClasseCompte, montant: { debit?: number; credit?: number }, total = false) {
  return {
    debit: montant.debit ?? 0,
    credit: montant.credit ?? 0,
    compte: { classe, typeCompte: total ? TypeCompteDetailTotal.TOTAL : TypeCompteDetailTotal.DETAIL },
  };
}

function service(lignes: ReturnType<typeof ligne>[]) {
  const prisma = {
    ligneEcriture: { findMany: jest.fn().mockResolvedValue(lignes) },
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
