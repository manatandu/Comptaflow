import { readFileSync } from 'fs';
import { join } from 'path';
import { Referentiel, SystemeComptableSyscohada, TypeCompteDetailTotal } from '@prisma/client';
import { ImmobilisationService } from './immobilisation.service';
import { EcritureService } from '../comptabilite/ecriture.service';
import { PrismaService } from '../../common/prisma.service';
import { COLONNES_QUI_RETIENNENT } from '../comptabilite/detenteurs-ecriture';

/**
 * LIGNE A15 · LA SORTIE D'UN BIEN RÉÉVALUÉ. AUDCIF Titre VIII ch. 28 § 6 ·
 * « Le solde de l'écart de réévaluation d'un bien cédé ou mis hors service doit
 * faire l'objet d'un transfert à un poste de réserve non distribuable » ; loi
 * n° 23/053, art. 133 al. 3 (cession · réintégration du solde) ; fiche du
 * compte 15 (reprises H.A.O.).
 *
 * Bâtiment de l'Application 99 · réévalué au 31/12/2026, brut 360 000 000,
 * cumul 60 000 000 (dont 10 000 000 de réévaluation), écart 50 000 000. Sortie
 * en 2027 · cumul 60 000 000 + 12 000 000 de dotation de l'exercice passée.
 */
type Ligne = { compteId: string; debit: number; credit: number };
type LigneReev = { id: string; immobilisationId: string; compteEcart: string; ecart: number; provisionReprise: number; ecartImpute: number; ecartTransfere: number };

const COMPTES: Record<string, { id: string; numero: string; estActif: boolean; typeCompte: TypeCompteDetailTotal }> = {
  r112: { id: 'r112', numero: '11200000', estActif: true, typeCompte: TypeCompteDetailTotal.DETAIL },
  r118: { id: 'r118', numero: '11810000', estActif: true, typeCompte: TypeCompteDetailTotal.DETAIL },
  t113: { id: 't113', numero: '111', estActif: true, typeCompte: TypeCompteDetailTotal.TOTAL },
  c485: { id: 'c485', numero: '48520000', estActif: true, typeCompte: TypeCompteDetailTotal.DETAIL },
};

function harnais(o: { referentiel?: Referentiel; lignes: LigneReev[]; echecMiseAJour?: boolean }) {
  const postees: Array<{ libelle: string; reference?: string; lignes: Ligne[] }> = [];
  const immo = {
    id: 'i1',
    designation: 'Bâtiment industriel',
    statut: 'EN_SERVICE',
    valeurOrigine: 360_000_000,
    valeurResiduelle: 0,
    dureeAmortissementAns: 30,
    dateMiseEnService: new Date('2022-01-01'),
    dateAcquisition: new Date('2022-01-01'),
    amortissementAnterieur: 0,
    amortissementsReevaluation: 10_000_000,
    modeAmortissement: 'LINEAIRE',
    compteImmobilisationId: 'cimmo',
    compteImmobilisation: { id: 'cimmo', numero: '23110000', intitule: 'Bâtiments industriels' },
    compteDotationId: 'cd',
    compteAmortissementId: 'ca',
    // Cinq annuités historiques (10 000 000), puis celle de 2027 sur la base réévaluée.
    dotations: [...[0, 1, 2, 3, 4].map((i) => ({ montant: 10_000_000, exerciceId: `ex${i}` })), { montant: 12_000_000, exerciceId: 'exN' }],
    depreciations: [],
  };
  const lignesMaj: Array<{ id: string; data: unknown }> = [];
  const fiche = jest.fn().mockResolvedValue({ ...immo, dotations: [] });
  const client = {
    ligneReevaluationBilan: {
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: unknown }) => {
        if (o.echecMiseAJour) throw new Error('base indisponible');
        lignesMaj.push({ id: where.id, data });
        return {};
      }),
    },
    immobilisation: { update: fiche },
  };
  const prisma = {
    tenant: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        referentiel: o.referentiel ?? Referentiel.SYSCOHADA,
        systemeComptableSyscohada: SystemeComptableSyscohada.NORMAL,
        jeuEtatsFinanciersSycebnl: null,
      }),
    },
    immobilisation: {
      findFirst: jest.fn().mockResolvedValue(immo),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: fiche,
    },
    exercice: { findFirst: jest.fn().mockResolvedValue({ id: 'exN', dateDebut: new Date('2027-01-01'), dateFin: new Date('2027-12-31') }) },
    compte: {
      findUnique: jest.fn(({ where }: { where: { tenantId_numero: { numero: string } } }) =>
        Promise.resolve({ id: `n${where.tenantId_numero.numero}`, numero: where.tenantId_numero.numero }),
      ),
      findFirst: jest.fn(({ where }: { where: { id: string } }) => Promise.resolve(COMPTES[where.id] ?? null)),
    },
    dotationAmortissement: { create: jest.fn().mockResolvedValue({ id: 'dot1' }), delete: jest.fn() },
    // LA DOUBLURE HONORE LA REQUÊTE · le bien visé et l'écart non nul.
    ligneReevaluationBilan: {
      findMany: jest.fn(async ({ where }: { where: { tenantId: string; immobilisationId: string; ecart: { gt: number } } }) =>
        o.lignes.filter((l) => where.tenantId === 't1' && l.immobilisationId === where.immobilisationId && l.ecart > where.ecart.gt),
      ),
    },
    ligneEcriture: { deleteMany: jest.fn() },
    ecriture: { delete: jest.fn() },
    $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(client)),
  };
  let n = 0;
  const ecritures = {
    creer: jest.fn().mockImplementation((_t: string, _u: string, dto: { libelle: string; reference?: string; lignes: Ligne[] }) => {
      n += 1;
      postees.push(dto);
      return Promise.resolve({ id: `e${n}` });
    }),
  } as unknown as EcritureService;
  return { svc: new ImmobilisationService(prisma as unknown as PrismaService, ecritures), postees, lignesMaj, fiche, prisma };
}

const ligne106 = (o: Partial<LigneReev> = {}): LigneReev => ({
  id: 'l106',
  immobilisationId: 'i1',
  compteEcart: '10610000',
  ecart: 50_000_000,
  provisionReprise: 0,
  ecartImpute: 0,
  ecartTransfere: 0,
  ...o,
});

const sortie = (o: object = {}) => ({
  dateSortie: '2027-12-31',
  type: 'CESSION',
  exerciceId: 'exN',
  journalId: 'j1',
  prixCession: 300_000_000,
  compteContrepartieId: 'c485',
  natureSortie: 'VENTE',
  referencePieceSortie: 'Acte de vente n° 7',
  datePieceSortie: '2027-12-31',
  ...o,
});

describe('A15 · SYSCOHADA, écart au 106 · transfert à une réserve non distribuable (ch. 28 § 6)', () => {
  it('sans réserve choisie, la sortie est refusée AVANT le verrou, le montant nommé', async () => {
    const { svc, postees, prisma } = harnais({ lignes: [ligne106()] });
    await expect(svc.sortir('t1', 'u1', 'i1', sortie() as never)).rejects.toThrow(/50000000\.00 d'écart de réévaluation au 106 · Choisissez la réserve/);
    expect(prisma.immobilisation.updateMany).not.toHaveBeenCalled();
    expect(postees).toEqual([]);
  });

  it('une réserve libre (118) ou un compte total sont refusés', async () => {
    const libre = harnais({ lignes: [ligne106()] });
    await expect(libre.svc.sortir('t1', 'u1', 'i1', sortie({ compteReserveEcartId: 'r118' }) as never)).rejects.toThrow(/réserves libres/);
    const total = harnais({ lignes: [ligne106()] });
    await expect(total.svc.sortir('t1', 'u1', 'i1', sortie({ compteReserveEcartId: 't113' }) as never)).rejects.toThrow(/compte de détail actif/);
  });

  it('cession · D 1061 / C 112 du solde (écart moins perte imputée), écriture à part sous la même pièce, ligne marquée transférée', async () => {
    const { svc, postees, lignesMaj, fiche } = harnais({ lignes: [ligne106({ ecartImpute: 2_000_000 })] });
    const r = (await svc.sortir('t1', 'u1', 'i1', sortie({ compteReserveEcartId: 'r112' }) as never)) as unknown as {
      ecartReevaluation: { transfereReserve: number; compteReserve: string; repris861: number; fiscal: string | null };
    };
    const ecart = postees.find((e) => e.libelle.startsWith('Écart de réévaluation du bien sorti'))!;
    expect(ecart.reference).toBe('Acte de vente n° 7');
    expect(ecart.lignes).toEqual([
      { compteId: 'n10610000', debit: 48_000_000, credit: 0 },
      { compteId: 'r112', debit: 0, credit: 48_000_000 },
    ]);
    // La sortie de l'actif reste celle d'avant · VNC réévaluée au 81 (art. 132 al. 2).
    const actif = postees.find((e) => e.libelle.startsWith('Cession'))!;
    expect(actif.lignes.find((l) => l.compteId === 'n81200000')!.debit).toBe(360_000_000 - 72_000_000);
    expect(lignesMaj).toEqual([{ id: 'l106', data: { ecartTransfere: { increment: 48_000_000 } } }]);
    // La dotation de 2027 est déjà passée · sortie e1, produit e2, écart e3.
    expect(postees[2]).toBe(ecart);
    expect(fiche.mock.calls.at(-1)![0].data).toMatchObject({ ecritureSortieEcartReevaluationId: 'e3' });
    expect(r.ecartReevaluation).toMatchObject({ transfereReserve: 48_000_000, compteReserve: '11200000', repris861: 0 });
    // Le fiscal est DIT, jamais retraité.
    expect(r.ecartReevaluation.fiscal).toMatch(/art\. 133, al\. 3/);
  });

  it('mise hors service · même transfert (le § 6 vise le bien « cédé ou mis hors service »)', async () => {
    const { svc, postees } = harnais({ lignes: [ligne106()] });
    await svc.sortir('t1', 'u1', 'i1', sortie({ type: 'MISE_HORS_SERVICE', prixCession: undefined, compteContrepartieId: undefined, natureSortie: 'DESTRUCTION', compteReserveEcartId: 'r112' }) as never);
    expect(postees.find((e) => e.libelle.startsWith('Écart de réévaluation'))!.lignes[0]).toEqual({ compteId: 'n10610000', debit: 50_000_000, credit: 0 });
  });

  it('l’échec de la mise à jour des lignes défait TOUTES les écritures, celle de l’écart comprise', async () => {
    const { svc, prisma } = harnais({ lignes: [ligne106()], echecMiseAJour: true });
    await expect(svc.sortir('t1', 'u1', 'i1', sortie({ compteReserveEcartId: 'r112' }) as never)).rejects.toThrow(/base indisponible/);
    const supprimees = prisma.ecriture.delete.mock.calls.map((c: Array<{ where: { id: string } }>) => c[0].where.id);
    // Sortie (e1), produit (e2), écart (e3) · défaits dans l'ordre inverse.
    expect(supprimees).toEqual(['e3', 'e2', 'e1']);
    expect(prisma.immobilisation.updateMany.mock.calls.at(-1)[0].data).toMatchObject({ statut: 'EN_SERVICE', ecritureSortieEcartReevaluationId: null });
  });
});

describe('A15 · provision spéciale (154)', () => {
  const l154 = (o: Partial<LigneReev> = {}): LigneReev => ligne106({ id: 'l154', compteEcart: '15400000', provisionReprise: 2_000_000, ...o });

  it('cession · le reste non repris (50 000 000 − 2 000 000) se reprend au 861 (art. 133 al. 3 ; fiche du compte 15)', async () => {
    const { svc, postees, lignesMaj } = harnais({ lignes: [l154()] });
    const r = (await svc.sortir('t1', 'u1', 'i1', sortie() as never)) as unknown as { ecartReevaluation: { repris861: number } };
    expect(postees.find((e) => e.libelle.startsWith('Écart de réévaluation'))!.lignes).toEqual([
      { compteId: 'n15400000', debit: 48_000_000, credit: 0 },
      { compteId: 'n86100000', debit: 0, credit: 48_000_000 },
    ]);
    expect(lignesMaj).toEqual([{ id: 'l154', data: { provisionReprise: { increment: 48_000_000 } } }]);
    expect(r.ecartReevaluation.repris861).toBe(48_000_000);
  });

  it('mise hors service · rien n’est passé, le reste et son motif sont rendus', async () => {
    const { svc, postees, lignesMaj } = harnais({ lignes: [l154()] });
    const r = (await svc.sortir('t1', 'u1', 'i1', sortie({ type: 'MISE_HORS_SERVICE', prixCession: undefined, compteContrepartieId: undefined, natureSortie: 'DESTRUCTION' }) as never)) as unknown as {
      ecartReevaluation: { nonPasses: Array<{ compteEcart: string; montant: number; motif: string }> };
    };
    expect(postees.some((e) => e.libelle.startsWith('Écart de réévaluation'))).toBe(false);
    expect(lignesMaj).toEqual([]);
    expect(r.ecartReevaluation.nonPasses).toEqual([{ compteEcart: '15400000', montant: 48_000_000, motif: expect.stringMatching(/ne tranchent pas/) }]);
  });
});

describe('A15 · SYCEBNL, écart au 106 · rien n’est passé, et c’est dit', () => {
  it('aucune réserve exigée, aucune écriture, le motif rendu', async () => {
    const { svc, postees } = harnais({ referentiel: Referentiel.SYCEBNL, lignes: [ligne106({ compteEcart: '10611000' })] });
    const r = (await svc.sortir('t1', 'u1', 'i1', sortie({ compteContrepartieId: 'c485' }) as never)) as unknown as {
      ecartReevaluation: { nonPasses: Array<{ motif: string }> };
    };
    expect(postees.some((e) => e.libelle.startsWith('Écart de réévaluation'))).toBe(false);
    expect(r.ecartReevaluation.nonPasses[0].motif).toMatch(/SYCEBNL ne dit pas/);
  });
});

describe('A15 · un bien jamais réévalué sort comme avant', () => {
  it('aucune écriture d’écart, aucune transaction, rien de rendu', async () => {
    const { svc, postees, prisma } = harnais({ lignes: [ligne106({ immobilisationId: 'autre' })] });
    const r = (await svc.sortir('t1', 'u1', 'i1', sortie() as never)) as unknown as { ecartReevaluation: unknown };
    expect(postees.some((e) => e.libelle.startsWith('Écart de réévaluation'))).toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(r.ecartReevaluation).toBeNull();
  });
});

describe('A15 · l’écriture de l’écart est retenue par la fiche', () => {
  it('rangée parmi les colonnes qui retiennent, et comptée par detenteursDe', () => {
    expect(COLONNES_QUI_RETIENNENT).toContain('Immobilisation.ecritureSortieEcartReevaluationId');
    const source = readFileSync(join(__dirname, '../comptabilite/ecriture.service.ts'), 'utf8');
    expect(source).toMatch(/ecritureSortieEcartReevaluationId: ecritureId/);
  });
  it('échange et renouvellement transmettent la réserve choisie à la sortie', () => {
    const source = readFileSync(join(__dirname, 'immobilisation.service.ts'), 'utf8');
    const echanger = source.slice(source.indexOf('async echanger('), source.indexOf('async sortir('));
    expect(echanger).toMatch(/compteReserveEcartId: dto\.compteReserveEcartId/);
    const renouveler = source.slice(source.indexOf('async renouveler('), source.indexOf('private async retirerRemplacant('));
    expect(renouveler).toMatch(/compteReserveEcartId: dto\.compteReserveEcartId/);
  });
});
