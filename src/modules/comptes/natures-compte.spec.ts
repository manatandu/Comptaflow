import { ModeReportANouveau, NatureCompteType } from '@prisma/client';
import { PLAN_COMPTES_SYCEBNL } from './compte-seed';
import { PLAN_COMPTES_SYSCOHADA } from './compte-seed-syscohada';
import {
  NATURES_PAR_DEFAUT,
  dansFourchette,
  incoherencesDeReport,
  motifRefusFourchettes,
  natureDe,
} from './natures-compte';
import { NaturesCompteService, naturesDuDossier } from './natures-compte.service';
import { CompteService } from './compte.service';
import { PrismaService } from '../../common/prisma.service';

/**
 * Point 14 de la comparaison Sage i7 · natures de compte paramétrables.
 */

describe('fourchettes', () => {
  it('« de 342 à 342ZZZZ » · un numéro est dans la fourchette par sa racine', () => {
    expect(dansFourchette('40110000', { du: '40', au: '40' })).toBe(true);
    expect(dansFourchette('41110000', { du: '40', au: '40' })).toBe(false);
    expect(dansFourchette('31200000', { du: '311', au: '315' })).toBe(true);
    expect(dansFourchette('31600000', { du: '311', au: '315' })).toBe(false);
    expect(dansFourchette('31100000', { du: '311', au: '315' })).toBe(true);
  });

  it('les défauts rangent chaque famille à sa place', () => {
    const nom = (n: string) => natureDe(n, NATURES_PAR_DEFAUT)?.nature ?? null;
    expect(nom('40110000')).toBe(NatureCompteType.FOURNISSEUR);
    expect(nom('41120000')).toBe(NatureCompteType.CLIENT);
    expect(nom('52110000')).toBe(NatureCompteType.BANQUE);
    expect(nom('57110000')).toBe(NatureCompteType.CAISSE);
    expect(nom('60110000')).toBe(NatureCompteType.CHARGE);
    expect(nom('70110000')).toBe(NatureCompteType.PRODUIT);
    expect(nom('31100000')).toBe(NatureCompteType.STOCK);
    expect(nom('42200000')).toBeNull();
  });

  it('refuse un chevauchement entre natures, des lettres, et un début après la fin', () => {
    expect(motifRefusFourchettes(NatureCompteType.CLIENT, [{ du: '40', au: '41' }], NATURES_PAR_DEFAUT)).toMatch(/chevauche.*Fournisseurs/);
    expect(motifRefusFourchettes(NatureCompteType.CLIENT, [{ du: '41', au: '4Z' }], NATURES_PAR_DEFAUT)).toMatch(/chiffres/);
    expect(motifRefusFourchettes(NatureCompteType.STOCK, [{ du: '35', au: '31' }], NATURES_PAR_DEFAUT)).toMatch(/dépasse la fin/);
    expect(motifRefusFourchettes(NatureCompteType.CLIENT, [], NATURES_PAR_DEFAUT)).toMatch(/au moins une/);
    // Élargir sa PROPRE fourchette n'est pas un chevauchement.
    expect(motifRefusFourchettes(NatureCompteType.CLIENT, [{ du: '41', au: '41' }, { du: '46', au: '46' }], NATURES_PAR_DEFAUT)).toBeNull();
  });
});

// LA PRÉMISSE EST RELUE DANS LES DEUX SEMIS · les défauts reprennent le mode
// que les deux plans posent déjà ; sans cela, le premier contrôle de
// cohérence signalerait des centaines de comptes semés.
describe('les défauts sont ceux des deux plans semés', () => {
  for (const [nom, plan] of [['SYCEBNL', PLAN_COMPTES_SYCEBNL], ['SYSCOHADA', PLAN_COMPTES_SYSCOHADA]] as const) {
    it(`${nom} · aucun compte semé ne contredit sa nature`, () => {
      const comptes = (plan as Array<{ numero: string; typeCompte?: string; modeReportANouveau: ModeReportANouveau }>).map((c) => ({
        numero: c.numero,
        typeCompte: c.typeCompte ?? 'DETAIL',
        modeReportANouveau: c.modeReportANouveau,
      }));
      expect(incoherencesDeReport(comptes, NATURES_PAR_DEFAUT)).toEqual([]);
    });
  }
});

describe('cohérence du report à-nouveau', () => {
  it('signale un compte de détail qui contredit sa nature, jamais un compte Total ni un compte hors nature', () => {
    const r = incoherencesDeReport(
      [
        { numero: '40110001', typeCompte: 'DETAIL', modeReportANouveau: ModeReportANouveau.SOLDE },
        { numero: '401', typeCompte: 'TOTAL', modeReportANouveau: ModeReportANouveau.SOLDE },
        { numero: '42200000', typeCompte: 'DETAIL', modeReportANouveau: ModeReportANouveau.AUCUN },
        { numero: '52110000', typeCompte: 'DETAIL', modeReportANouveau: ModeReportANouveau.SOLDE },
      ],
      NATURES_PAR_DEFAUT,
    );
    expect(r).toEqual([expect.objectContaining({ numero: '40110001', nature: NatureCompteType.FOURNISSEUR, modeAttendu: ModeReportANouveau.DETAIL })]);
  });
});

/** Doublure · la table des natures, et des comptes. */
function doublure(comptes: Array<{ id: string; numero: string; typeCompte: string; modeReportANouveau: ModeReportANouveau }> = []) {
  let natures: Array<Record<string, unknown>> = [];
  const creesCompte: Record<string, unknown>[] = [];
  const miseAJour: Record<string, unknown>[] = [];
  const p = {
    natureCompte: {
      findMany: jest.fn(async () => natures),
      createMany: jest.fn(async ({ data }: { data: Record<string, unknown>[] }) => {
        natures = [...natures, ...data];
      }),
      update: jest.fn(async ({ where, data }: { where: { tenantId_nature: { nature: string } }; data: Record<string, unknown> }) => {
        const n = natures.find((x) => x.nature === where.tenantId_nature.nature)!;
        Object.assign(n, data);
      }),
    },
    compte: {
      findMany: jest.fn(async () => comptes),
      findUnique: jest.fn(async () => null),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        creesCompte.push(data);
        return data;
      }),
      update: jest.fn(async (a: Record<string, unknown>) => {
        miseAJour.push(a);
        return a;
      }),
    },
    tenant: { findUniqueOrThrow: jest.fn(async () => ({ longueurCompte: 8 })) },
  };
  return { p, creesCompte, miseAJour, natures: () => natures };
}

describe('câblage', () => {
  it('un dossier sans natures les reçoit à la première lecture, une seule fois', async () => {
    const { p } = doublure();
    await naturesDuDossier(p, 't1');
    await naturesDuDossier(p, 't1');
    expect(p.natureCompte.createMany).toHaveBeenCalledTimes(1);
    expect(p.natureCompte.createMany.mock.calls[0][0].data).toHaveLength(7);
  });

  it('un compte créé prend le mode de report et le lettrage de sa nature, le DTO restant maître', async () => {
    const { p, creesCompte } = doublure();
    const s = new CompteService(p as unknown as PrismaService);
    await s.creer('t1', { numero: '52180000', intitule: 'Banque X', classe: 'CLASSE_5' } as never);
    expect(creesCompte[0]).toMatchObject({ modeReportANouveau: ModeReportANouveau.SOLDE, lettrable: false });
    await s.creer('t1', { numero: '40180000', intitule: 'Fournisseur Y', classe: 'CLASSE_4' } as never);
    expect(creesCompte[1]).toMatchObject({ modeReportANouveau: ModeReportANouveau.DETAIL, lettrable: true });
    await s.creer('t1', { numero: '40190000', intitule: 'Z', classe: 'CLASSE_4', modeReportANouveau: ModeReportANouveau.SOLDE } as never);
    expect(creesCompte[2]).toMatchObject({ modeReportANouveau: ModeReportANouveau.SOLDE });
  });

  it('une fourchette déplacée change le défaut des comptes créés ENSUITE', async () => {
    const { p, creesCompte } = doublure();
    const natures = new NaturesCompteService(p as unknown as PrismaService);
    await natures.modifier('t1', NatureCompteType.CAISSE, { fourchettes: [{ du: '57', au: '58' }], lettrable: true });
    const s = new CompteService(p as unknown as PrismaService);
    await s.creer('t1', { numero: '58500000', intitule: 'Virements internes', classe: 'CLASSE_5' } as never);
    expect(creesCompte[0]).toMatchObject({ modeReportANouveau: ModeReportANouveau.SOLDE, lettrable: true });
  });

  it('le lettrage vient de la NATURE, pas de la règle d’avant · un client déclaré non lettrable le reste', async () => {
    // La règle d'avant (classe 4 lettrable) dirait vrai ; la nature dit faux.
    const { p, creesCompte } = doublure();
    await new NaturesCompteService(p as unknown as PrismaService).modifier('t1', NatureCompteType.CLIENT, { lettrable: false });
    await new CompteService(p as unknown as PrismaService).creer('t1', { numero: '41190000', intitule: 'Client', classe: 'CLASSE_4' } as never);
    expect(creesCompte[0]).toMatchObject({ lettrable: false });
  });

  it('aligner avec une sélection ne touche que les comptes choisis', async () => {
    const { p, miseAJour } = doublure([
      { id: 'a', numero: '40110001', typeCompte: 'DETAIL', modeReportANouveau: ModeReportANouveau.SOLDE },
      { id: 'c', numero: '41110001', typeCompte: 'DETAIL', modeReportANouveau: ModeReportANouveau.AUCUN },
    ]);
    const r = await new NaturesCompteService(p as unknown as PrismaService).aligner('t1', ['c']);
    expect(r.alignes).toBe(1);
    expect(miseAJour).toEqual([{ where: { id: 'c' }, data: { modeReportANouveau: ModeReportANouveau.DETAIL } }]);
  });

  it('refuse une fourchette qui chevauche une autre nature, sans rien écrire', async () => {
    const { p } = doublure();
    const natures = new NaturesCompteService(p as unknown as PrismaService);
    await expect(natures.modifier('t1', NatureCompteType.BANQUE, { fourchettes: [{ du: '5', au: '5' }] })).rejects.toThrow(/chevauche/);
    expect(p.natureCompte.update).not.toHaveBeenCalled();
  });

  it('aligner rétablit le mode de la nature sur les seuls comptes qui la contredisent', async () => {
    const { p, miseAJour } = doublure([
      { id: 'a', numero: '40110001', typeCompte: 'DETAIL', modeReportANouveau: ModeReportANouveau.SOLDE },
      { id: 'b', numero: '40110002', typeCompte: 'DETAIL', modeReportANouveau: ModeReportANouveau.DETAIL },
    ]);
    const r = await new NaturesCompteService(p as unknown as PrismaService).aligner('t1');
    expect(r.alignes).toBe(1);
    expect(miseAJour).toEqual([{ where: { id: 'a' }, data: { modeReportANouveau: ModeReportANouveau.DETAIL } }]);
  });
});
