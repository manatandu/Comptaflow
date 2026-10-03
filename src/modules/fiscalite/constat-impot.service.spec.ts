import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma, StatutEcriture, StatutExercice, TypeCompteDetailTotal } from '@prisma/client';
import { ConstatImpotService } from './constat-impot.service';

/**
 * Le CÂBLAGE de la ligne A11, écrit avec la règle (passe F4a) · le montant
 * vient du calcul rejoué, jamais du corps ; l'écriture passe par
 * `EcritureService.creer` ; un second clic ne laisse aucune écriture
 * orpheline ; un refus n'écrit rien.
 */

function monter(options: {
  calcul?: Partial<Record<string, unknown>>;
  enPlace?: unknown;
  brouillard?: number;
  creationEchoue?: unknown;
}) {
  const calcul = {
    formeJuridiqueSyscohada: 'SOCIETE_RESPONSABILITE_LIMITEE',
    regime: 'IMPOT_SOCIETES',
    impotDu: 180,
    minimumApplique: false,
    explication: 'x',
    dateFin: new Date('2026-12-31'),
    acomptesVerses: 160,
    acomptesAu4492: 160,
    soldeCompte89: 0,
    impotExerciceAu89: 0,
    reintegrationsImpot: 0,
    ...options.calcul,
  };
  const comptes: Record<string, string> = { '89110000': 'c8911', '89500000': 'c895', '44100000': 'c441', '44920000': 'c4492' };
  const prisma = {
    constatImpotResultat: {
      findFirst: jest.fn().mockResolvedValue(options.enPlace ?? null),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockImplementation(async ({ data }) => {
        if (options.creationEchoue) throw options.creationEchoue;
        return { id: 'constat', ...data };
      }),
    },
    exercice: {
      findFirst: jest.fn().mockResolvedValue({
        statut: StatutExercice.OUVERT,
        dateDebut: new Date('2026-01-01'),
        dateFin: new Date('2026-12-31'),
      }),
    },
    ecriture: { count: jest.fn().mockResolvedValue(options.brouillard ?? 0) },
    compte: {
      findFirst: jest.fn().mockImplementation(async ({ where }) =>
        comptes[where.numero] ? { id: comptes[where.numero], typeCompte: TypeCompteDetailTotal.DETAIL, estActif: true } : null,
      ),
    },
    journal: { findFirst: jest.fn().mockResolvedValue({ id: 'jod' }) },
    tenant: { findUnique: jest.fn().mockResolvedValue({ formeJuridiqueSyscohada: calcul.formeJuridiqueSyscohada }) },
  };
  const fiscalite = { resultatFiscal: jest.fn().mockResolvedValue(calcul) };
  const ecritures = {
    creer: jest.fn().mockResolvedValue({ id: 'e1', numeroPiece: 7 }),
    retirerCompensation: jest.fn().mockResolvedValue(undefined),
  };
  const service = new ConstatImpotService(prisma as never, fiscalite as never, ecritures as never);
  return { service, prisma, fiscalite, ecritures };
}

describe('ConstatImpotService.passer', () => {
  it('rejoue l’impôt et passe D 8911 / C 441 au brouillard, datée de la fin d’exercice, sans acompte retranché', async () => {
    const { service, ecritures, prisma } = monter({});
    await service.passer('t', 'u', 'ex', {});
    const dto = ecritures.creer.mock.calls[0][2];
    expect(dto.date).toBe('2026-12-31');
    expect(dto.journalId).toBe('jod');
    expect(dto.lignes).toEqual([
      expect.objectContaining({ compteId: 'c8911', debit: 180 }),
      expect.objectContaining({ compteId: 'c441', credit: 180 }),
    ]);
    expect(prisma.constatImpotResultat.create.mock.calls[0][0].data).toMatchObject({ ecritureId: 'e1', minimumApplique: false });
    expect(Number(prisma.constatImpotResultat.create.mock.calls[0][0].data.montantImpot)).toBe(180);
  });

  it('un montant glissé dans le corps est ignoré · seul le calcul fait foi', async () => {
    const { service, ecritures } = monter({});
    await service.passer('t', 'u', 'ex', { montantImpot: 1 } as never);
    expect(ecritures.creer.mock.calls[0][2].lignes[0].debit).toBe(180);
  });

  it('l’imputation demandée ajoute D 441 / C 4492 pour les acomptes', async () => {
    const { service, ecritures } = monter({});
    await service.passer('t', 'u', 'ex', { imputerAcomptes: true });
    const lignes = ecritures.creer.mock.calls[0][2].lignes;
    expect(lignes).toHaveLength(4);
    expect(lignes[3]).toMatchObject({ compteId: 'c4492', credit: 160 });
  });

  it('l’impôt minimum retenu va au 895', async () => {
    const { service, ecritures } = monter({ calcul: { minimumApplique: true, impotDu: 50 } });
    await service.passer('t', 'u', 'ex', {});
    expect(ecritures.creer.mock.calls[0][2].lignes[0]).toMatchObject({ compteId: 'c895', debit: 50 });
  });

  it('un refus n’écrit rien (personne physique, impôt non chiffré, brouillard de gestion)', async () => {
    for (const cas of [
      monter({ calcul: { formeJuridiqueSyscohada: 'ENTREPRISE_INDIVIDUELLE' } }),
      monter({ calcul: { impotDu: null } }),
      monter({ brouillard: 1 }),
    ]) {
      await expect(cas.service.passer('t', 'u', 'ex', {})).rejects.toBeInstanceOf(BadRequestException);
      expect(cas.ecritures.creer).not.toHaveBeenCalled();
    }
  });

  it('un constat déjà en place refuse en 409, sans créer d’écriture', async () => {
    const { service, ecritures } = monter({ enPlace: { id: 'c', ecriture: { numeroPiece: 3 } } });
    await expect(service.passer('t', 'u', 'ex', {})).rejects.toBeInstanceOf(ConflictException);
    expect(ecritures.creer).not.toHaveBeenCalled();
  });

  it('second clic simultané · l’index unique refuse, l’écriture créée est retirée, 409', async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'x' });
    const { service, ecritures } = monter({ creationEchoue: p2002 });
    await expect(service.passer('t', 'u', 'ex', {})).rejects.toBeInstanceOf(ConflictException);
    expect(ecritures.retirerCompensation).toHaveBeenCalledWith('t', 'e1');
  });
});

describe('ConstatImpotService.etat', () => {
  it('sert la proposition sans exiger l’attestation à la lecture', async () => {
    const { service } = monter({ calcul: { formeJuridiqueSyscohada: 'SOCIETE_NOM_COLLECTIF' } });
    const etat = await service.etat('t', 'ex');
    expect(etat.motifsRefus).toEqual([]);
    expect(etat.proposition?.conditionADeclarer).toMatch(/art\. 4/);
  });

  it('constat en place · dit l’écart avec l’impôt recalculé, jamais corrigé', async () => {
    const { service } = monter({
      calcul: { impotDu: 200 },
      enPlace: {
        id: 'c',
        montantImpot: new Prisma.Decimal(180),
        minimumApplique: false,
        montantImpute: new Prisma.Decimal(0),
        attestationRegime: null,
        ecriture: { id: 'e1', numeroPiece: 7, statut: StatutEcriture.VALIDEE, date: new Date() },
        createdAt: new Date(),
      },
    });
    const etat = await service.etat('t', 'ex');
    expect(etat.constat?.ecartAvecCalcul).toBe(20);
    expect(etat.proposition).toBeNull();
  });
});
