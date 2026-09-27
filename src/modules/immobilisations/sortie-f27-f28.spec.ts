import { Referentiel, SystemeComptableSyscohada } from '@prisma/client';
import { ImmobilisationService } from './immobilisation.service';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';

/**
 * LA SORTIE D'UNE IMMOBILISATION · la dernière annuité et l'ordre des gestes
 * (audit final F27 et F28).
 *
 * F27 · « la constatation de l'amortissement complémentaire pour la période
 * écoulée entre l'ouverture de l'exercice et la date de cession du bien »
 * (SYCEBNL et AUDCIF, fiche du COMPTE 81). Un bien cédé le 30 septembre
 * recevait douze mois de dotation. Le Guide d'application chiffre le même cas
 * en mois (Partie 1 ch. 5, Application 16 · « 180 × 9/12 »).
 *
 * F28 · le statut de sortie était posé AVANT les contrôles qui peuvent lever ·
 * un refus laissait le bien sorti sans écriture, et « déjà sortie » fermait
 * toute reprise.
 */

type Ligne = { compteId: string; debit: number; credit: number };

function harnais(
  options: {
    dateMiseEnService?: string;
    dotations?: number[];
    smt?: boolean;
    /** Numéros de classe 8 absents du plan du dossier. */
    comptesAbsents?: string[];
    /** Rang (1, 2…) de l'appel à `creer` qui échoue. */
    echecCreation?: number;
    /** Composants rattachés au bien (audit final F127). */
    composants?: { designation: string; immobilisationPrincipaleId: string; statut: string }[];
  } = {},
) {
  const ecrituresPostees: Array<{ id: string; libelle: string; lignes: Ligne[] }> = [];
  const immo = {
    id: 'i1',
    designation: 'Camion',
    statut: 'EN_SERVICE',
    valeurOrigine: 12_000,
    valeurResiduelle: 0,
    dureeAmortissementAns: 5,
    dateMiseEnService: new Date(options.dateMiseEnService ?? '2024-01-01'),
    amortissementAnterieur: 0,
    modeAmortissement: 'LINEAIRE',
    compteImmobilisationId: 'cimmo',
    compteImmobilisation: { id: 'cimmo', numero: '24500000', intitule: 'Matériel de transport' },
    compteDotationId: 'cd',
    compteAmortissementId: 'ca',
    dotations: (options.dotations ?? [2_400, 2_400]).map((m, i) => ({ montant: m, exerciceId: `exAnt${i}` })),
    depreciations: [],
  };
  const updateMany = jest.fn().mockResolvedValue({ count: 1 });
  const supprimees: string[] = [];
  const dotationSupprimee = jest.fn().mockResolvedValue({});
  const prisma = {
    tenant: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        referentiel: Referentiel.SYSCOHADA,
        systemeComptableSyscohada: options.smt ? SystemeComptableSyscohada.MINIMAL_TRESORERIE : SystemeComptableSyscohada.NORMAL,
        jeuEtatsFinanciersSycebnl: null,
      }),
    },
    immobilisation: {
      findFirst: jest.fn().mockResolvedValue(immo),
      // La doublure HONORE le filtre · principal et statut.
      findMany: jest.fn(({ where }: { where: { immobilisationPrincipaleId?: string; statut?: string } }) =>
        Promise.resolve(
          (options.composants ?? []).filter(
            (c) => c.immobilisationPrincipaleId === where.immobilisationPrincipaleId && (!where.statut || c.statut === where.statut),
          ),
        ),
      ),
      updateMany,
      update: jest.fn().mockResolvedValue({ ...immo, dotations: immo.dotations }),
    },
    exercice: {
      findFirst: jest.fn().mockResolvedValue({ id: 'exN', dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31') }),
    },
    compte: {
      findUnique: jest.fn().mockImplementation(({ where }: { where: { tenantId_numero: { numero: string } } }) => {
        const numero = where.tenantId_numero.numero;
        return Promise.resolve(options.comptesAbsents?.includes(numero) ? null : { id: `n${numero}`, numero });
      }),
    },
    dotationAmortissement: {
      create: jest.fn().mockResolvedValue({ id: 'dot1' }),
      delete: dotationSupprimee,
    },
    ligneEcriture: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
    ecriture: {
      delete: jest.fn().mockImplementation(({ where }: { where: { id: string } }) => {
        supprimees.push(where.id);
        return Promise.resolve({});
      }),
    },
  };
  let appels = 0;
  const ecritures = {
    creer: jest.fn().mockImplementation((_t: string, _u: string, dto: { libelle: string; lignes: Ligne[] }) => {
      appels += 1;
      if (appels === options.echecCreation) return Promise.reject(new Error('journal clôturé'));
      const id = `e${appels}`;
      ecrituresPostees.push({ id, libelle: dto.libelle, lignes: dto.lignes });
      return Promise.resolve({ id });
    }),
  } as unknown as EcritureService;
  return {
    prisma,
    svc: new ImmobilisationService(prisma as unknown as PrismaService, ecritures),
    ecrituresPostees,
    updateMany,
    supprimees,
    dotationSupprimee,
  };
}

const sortie = (dateSortie: string, type = 'MISE_HORS_SERVICE') => ({
  dateSortie,
  type,
  exerciceId: 'exN',
  journalId: 'j1',
  ...(type === 'CESSION' ? { prixCession: 500, compteContrepartieId: 'c485' } : {}),
});

const complement = async (dateSortie: string, options: Parameters<typeof harnais>[0] = {}) => {
  const { svc, ecrituresPostees } = harnais(options);
  await svc.sortir('t1', 'u1', 'i1', sortie(dateSortie) as never);
  const e = ecrituresPostees.find((x) => x.libelle.startsWith('Dotation complémentaire'));
  return e ? e.lignes[0].debit : 0;
};

describe('F27 · la dotation complémentaire s’arrête à la date de sortie', () => {
  it('sortie au 30 septembre · neuf mois sur douze (Guide, Application 16)', async () => {
    // 12 000 sur 5 ans · 2 400 l'an, et 2 400 × 9/12 = 1 800.
    expect(await complement('2026-09-30')).toBe(1_800);
  });

  it('sortie en cours de mois · le mois de la sortie compte, comme celui de la mise en service', async () => {
    expect(await complement('2026-06-15')).toBe(1_200);
  });

  it('sortie au 31 décembre · l’annuité est pleine', async () => {
    expect(await complement('2026-12-31')).toBe(2_400);
  });

  it('bien mis en service dans l’exercice · de son mois de mise en service à celui de la sortie', async () => {
    // Mars à septembre, sept mois · 2 400 × 7/12 = 1 400.
    expect(await complement('2026-09-30', { dateMiseEnService: '2026-03-10', dotations: [] })).toBe(1_400);
  });

  it('au SMT SYSCOHADA, « sans prorata temporis » vaut aussi à la sortie', async () => {
    expect(await complement('2026-06-15', { smt: true })).toBe(2_400);
  });

  it('la valeur nette portée au 81 suit · brut moins les amortissements arrêtés à la sortie', async () => {
    const { svc, ecrituresPostees } = harnais();
    await svc.sortir('t1', 'u1', 'i1', sortie('2026-09-30') as never);
    const lignes = ecrituresPostees.find((e) => e.libelle.startsWith('Mise hors service'))!.lignes;
    // 12 000 - (2 400 + 2 400 + 1 800) = 5 400.
    expect(lignes.find((l) => l.compteId === 'n81200000')!.debit).toBe(5_400);
    expect(lignes.find((l) => l.compteId === 'ca')!.debit).toBe(6_600);
  });
});

describe('F28 · un refus ne laisse jamais le bien sorti sans écriture', () => {
  it('un compte de classe 8 absent refuse AVANT le verrou · le statut ne bouge pas', async () => {
    const { svc, updateMany, ecrituresPostees } = harnais({ comptesAbsents: ['81200000'] });
    await expect(svc.sortir('t1', 'u1', 'i1', sortie('2026-09-30') as never)).rejects.toThrow(/81200000 introuvable/);
    expect(updateMany).not.toHaveBeenCalled();
    expect(ecrituresPostees).toEqual([]);
  });

  it('le compte du produit de cession absent refuse aussi avant le verrou', async () => {
    const { svc, updateMany } = harnais({ comptesAbsents: ['82200000'] });
    await expect(svc.sortir('t1', 'u1', 'i1', sortie('2026-09-30', 'CESSION') as never)).rejects.toThrow(/82200000/);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('une écriture refusée après le verrou défait tout · dotation, écritures, puis statut EN SERVICE', async () => {
    // Le complément passe (appel 1), l'écriture de sortie est refusée (appel 2).
    const { svc, updateMany, supprimees, dotationSupprimee } = harnais({ echecCreation: 2 });
    await expect(svc.sortir('t1', 'u1', 'i1', sortie('2026-09-30') as never)).rejects.toThrow(/journal clôturé/);
    expect(dotationSupprimee).toHaveBeenCalledWith({ where: { id: 'dot1' } });
    expect(supprimees).toEqual(['e1']);
    expect(updateMany).toHaveBeenLastCalledWith({
      where: { id: 'i1', tenantId: 't1' },
      data: { statut: 'EN_SERVICE', dateSortie: null, prixCession: null, ecritureSortieId: null, ecritureProduitCessionId: null },
    });
  });

  it('le produit de cession refusé défait aussi la sortie déjà posée, dans l’ordre inverse', async () => {
    const { svc, supprimees } = harnais({ echecCreation: 3 });
    await expect(svc.sortir('t1', 'u1', 'i1', sortie('2026-09-30', 'CESSION') as never)).rejects.toThrow(/journal clôturé/);
    expect(supprimees).toEqual(['e2', 'e1']);
  });
});

describe('F127 · un bien principal ne sort pas avec ses composants en service', () => {
  it('refuse, en nommant les composants, avant tout verrou et toute écriture', async () => {
    const { svc, updateMany, ecrituresPostees } = harnais({
      composants: [
        { designation: 'Pneus', immobilisationPrincipaleId: 'i1', statut: 'EN_SERVICE' },
        { designation: 'Ancien moteur', immobilisationPrincipaleId: 'i1', statut: 'MIS_HORS_SERVICE' },
        { designation: 'Autre bien', immobilisationPrincipaleId: 'i9', statut: 'EN_SERVICE' },
      ],
    });
    await expect(svc.sortir('t1', 'u1', 'i1', sortie('2026-09-30') as never)).rejects.toThrow(/1 composant\(s\) en service \(Pneus\)/);
    expect(updateMany).not.toHaveBeenCalled();
    expect(ecrituresPostees).toEqual([]);
  });

  it('des composants déjà sortis ne retiennent pas le principal', async () => {
    const { svc, ecrituresPostees } = harnais({
      composants: [{ designation: 'Ancien moteur', immobilisationPrincipaleId: 'i1', statut: 'MIS_HORS_SERVICE' }],
    });
    await svc.sortir('t1', 'u1', 'i1', sortie('2026-09-30') as never);
    expect(ecrituresPostees.length).toBeGreaterThan(0);
  });
});

describe('F130 · l’écriture du produit de cession est retenue par la fiche', () => {
  it('la cession lie à la fiche l’écriture du produit, à côté de celle de sortie', async () => {
    const { svc, prisma, ecrituresPostees } = harnais();
    await svc.sortir('t1', 'u1', 'i1', sortie('2026-09-30', 'CESSION') as never);
    const produit = ecrituresPostees.find((e) => e.libelle.startsWith('Produit de cession'))!;
    const sortieE = ecrituresPostees.find((e) => e.libelle.startsWith('Cession'))!;
    expect(prisma.immobilisation.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: { ecritureSortieId: sortieE.id, ecritureProduitCessionId: produit.id } }),
    );
  });

  it('une mise hors service n’a pas d’écriture de produit · la colonne reste vide', async () => {
    const { svc, prisma } = harnais();
    await svc.sortir('t1', 'u1', 'i1', sortie('2026-09-30') as never);
    expect(prisma.immobilisation.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ ecritureProduitCessionId: null }) }),
    );
  });
});

