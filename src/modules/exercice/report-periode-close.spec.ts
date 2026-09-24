import { GranulariteCloture } from '@prisma/client';
import { premierJourNonCloture, type ClotureActive } from './report-periode-close';
import { EcritureService } from '../comptabilite/ecriture.service';
import { PrismaService } from '../../common/prisma.service';

/**
 * AUDCIF ART. 22, 4° · « Lorsque cette date correspond à une période déjà
 * clôturée, l'opération est enregistrée au premier jour de la période non
 * encore clôturée, sa date de valeur étant mentionnée distinctement. »
 */
const J = (s: string) => new Date(`${s}T00:00:00.000Z`);
const periode = (limite: string): ClotureActive => ({ granularite: GranulariteCloture.PERIODE, journalId: null, dateLimite: J(limite) });
const partielle = (journalId: string, limite: string): ClotureActive => ({
  granularite: GranulariteCloture.PARTIELLE,
  journalId,
  dateLimite: J(limite),
});

describe('premier jour de la période non encore clôturée', () => {
  it('une date hors de toute clôture reste elle-même', () => {
    expect(premierJourNonCloture([periode('2026-03-31')], 'j1', J('2026-04-10'))).toEqual(J('2026-04-10'));
  });

  it('une facture de mars, mars clos pour tous les journaux, va au 1er avril', () => {
    expect(premierJourNonCloture([periode('2026-03-31')], 'j1', J('2026-03-15'))).toEqual(J('2026-04-01'));
  });

  it('les clôtures s’enchaînent · partielle au 31 mars puis période au 30 avril', () => {
    const c = [partielle('j1', '2026-03-31'), periode('2026-04-30')];
    expect(premierJourNonCloture(c, 'j1', J('2026-03-15'))).toEqual(J('2026-05-01'));
  });

  it('la clôture partielle d’un AUTRE journal ne bloque pas celui-ci', () => {
    expect(premierJourNonCloture([partielle('j2', '2026-03-31')], 'j1', J('2026-03-15'))).toEqual(J('2026-03-15'));
  });

  it('un journal clôturé totalement n’a plus de période ouverte', () => {
    const totale: ClotureActive = { granularite: GranulariteCloture.TOTALE, journalId: 'j1', dateLimite: J('2026-12-31') };
    expect(premierJourNonCloture([totale], 'j1', J('2026-03-15'))).toBeNull();
  });
});

/* Le câblage · écrit en même temps que la règle, pas après (passe F4a). */
function service(premier: Date | null) {
  const cree = jest.fn().mockImplementation(({ data }: { data: unknown }) => Promise.resolve(data));
  const tx = { ecriture: { create: cree } };
  const prisma = {
    exercice: { findFirst: jest.fn().mockResolvedValue({ id: 'ex', dateDebut: J('2026-01-01'), dateFin: J('2026-12-31'), statut: 'OUVERT' }) },
    compte: {
      findMany: jest.fn().mockImplementation(({ where }: { where: { id: { in: string[] } } }) =>
        Promise.resolve(where.id.in.map((id) => ({ id, numero: '60100000', typeCompte: 'DETAIL', tenantId: 't1' }))),
      ),
    },
    tauxTva: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn().mockImplementation((f: (t: unknown) => unknown) => f(tx)),
  };
  const exerciceService = {
    verifierEcritureAutorisee: jest.fn().mockResolvedValue(undefined),
    premierJourOuvert: jest.fn().mockResolvedValue(premier),
  };
  const svc = new EcritureService(
    prisma as unknown as PrismaService,
    { trouver: jest.fn().mockResolvedValue({ id: 'j1', code: 'OD', estActif: true }), prochainNumeroPiece: jest.fn().mockResolvedValue(null) } as never,
    exerciceService as never,
    { verifierVentilationObligatoire: jest.fn().mockResolvedValue(undefined) } as never,
  );
  return { svc, cree, exerciceService };
}

const DTO = {
  exerciceId: 'ex',
  journalId: 'j1',
  date: '2026-03-15',
  libelle: 'Facture de mars reçue en mai',
  lignes: [
    { compteId: 'c1', debit: 100, credit: 0 },
    { compteId: 'c2', debit: 0, credit: 100 },
  ],
};

describe('création · le report est demandé, jamais fait d’office', () => {
  it('sur demande, l’écriture est datée du premier jour ouvert et garde sa date de valeur', async () => {
    const { svc, cree, exerciceService } = service(J('2026-04-01'));
    await svc.creer('t1', 'u1', { ...DTO, reporterAuPremierJourOuvert: true } as never);
    const data = cree.mock.calls[0][0].data;
    expect(data.date).toEqual(J('2026-04-01'));
    expect(data.dateValeur).toEqual(J('2026-03-15'));
    // Le contrôle des clôtures porte sur la NOUVELLE date.
    expect(exerciceService.verifierEcritureAutorisee).toHaveBeenCalledWith('t1', 'j1', J('2026-04-01'));
  });

  it('sans demande, rien n’est reporté ni calculé', async () => {
    const { svc, cree, exerciceService } = service(J('2026-04-01'));
    await svc.creer('t1', 'u1', DTO as never);
    expect(exerciceService.premierJourOuvert).not.toHaveBeenCalled();
    expect(cree.mock.calls[0][0].data.dateValeur).toBeNull();
  });

  it('jamais au-delà de l’exercice · la charge changerait d’exercice', async () => {
    const { svc, cree } = service(J('2027-01-01'));
    await expect(svc.creer('t1', 'u1', { ...DTO, reporterAuPremierJourOuvert: true } as never)).rejects.toThrow(
      /hors de l'exercice/,
    );
    expect(cree).not.toHaveBeenCalled();
  });

  it('un journal clôturé totalement est refusé, avec son motif', async () => {
    const { svc } = service(null);
    await expect(svc.creer('t1', 'u1', { ...DTO, reporterAuPremierJourOuvert: true } as never)).rejects.toThrow(
      /clôturé totalement/,
    );
  });
});

describe('le refus nomme la voie que le texte ouvre', () => {
  it('une date en période close est refusée, et le message dit comment la reporter', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { ExerciceService } = require('./exercice.service');
    const prisma = { cloture: { findMany: jest.fn().mockResolvedValue([periode('2026-03-31')]) } };
    const svc = new ExerciceService(prisma, {} as never);
    await expect(svc.verifierEcritureAutorisee('t1', 'j1', J('2026-03-15'))).rejects.toThrow(/art\. 22, 4°/);
    await expect(svc.premierJourOuvert('t1', 'j1', J('2026-03-15'))).resolves.toEqual(J('2026-04-01'));
  });
});
