import { NumerotationPiece } from '@prisma/client';
import { JournalService } from './journal.service';

/**
 * AUDIT FINAL F59 ET F60 · la création d'un journal.
 *
 * F59 · un journal créé sans choix naissait en MANUELLE, où aucune pièce ne
 * reçoit de numéro · la saisie n'en portant aucun, toutes restaient sans
 * numéro.
 *
 * F60 · le compte de trésorerie était écrit tel qu'il arrivait · un compte
 * d'un autre dossier, de classe 6 ou Total passait.
 */

type Compte = { id: string; tenantId: string; numero: string; typeCompte: 'DETAIL' | 'TOTAL' };

const COMPTES: Compte[] = [
  { id: 'banque', tenantId: 't1', numero: '52110000', typeCompte: 'DETAIL' },
  { id: 'banque-voisin', tenantId: 't2', numero: '52110000', typeCompte: 'DETAIL' },
  { id: 'charge', tenantId: 't1', numero: '60500000', typeCompte: 'DETAIL' },
  { id: 'total-52', tenantId: 't1', numero: '52', typeCompte: 'TOTAL' },
];

function monde() {
  const create = jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'j-neuf', ...data }));
  const update = jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'j1', ...data }));
  const prisma = {
    journal: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue({ id: 'j1', tenantId: 't1', code: 'BQ', type: 'TRESORERIE' }),
      create,
      update,
    },
    compte: {
      // La doublure honore le dossier demandé · sans quoi elle validerait une
      // lecture qui ne le borne pas.
      findFirst: jest.fn().mockImplementation(({ where }: { where: { id: string; tenantId: string } }) =>
        Promise.resolve(COMPTES.find((c) => c.id === where.id && c.tenantId === where.tenantId) ?? null),
      ),
    },
  };
  return { svc: new JournalService(prisma as never), create, update, prisma };
}

describe('F59 · un journal créé sans choix est numéroté en continu', () => {
  it('sans numérotation demandée, la continue par journal', async () => {
    const { svc, create } = monde();
    await svc.creer('t1', { code: 'ACH2', intitule: 'Achats', type: 'ACHATS' } as never);
    expect(create.mock.calls[0][0].data.numerotation).toBe(NumerotationPiece.CONTINUE_JOURNAL);
  });

  it('la manuelle reste un choix', async () => {
    const { svc, create } = monde();
    await svc.creer('t1', { code: 'ACH2', intitule: 'Achats', type: 'ACHATS', numerotation: 'MANUELLE' } as never);
    expect(create.mock.calls[0][0].data.numerotation).toBe(NumerotationPiece.MANUELLE);
  });

  it('le défaut de la base est le même', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const schema: string = require('fs').readFileSync(require('path').join(__dirname, '../../../prisma/schema.prisma'), 'utf8');
    expect(schema).toMatch(/numerotation NumerotationPiece @default\(CONTINUE_JOURNAL\)/);
  });
});

describe('F60 · le compte de trésorerie d’un journal', () => {
  const tresorerie = (compteTresorerieId: string) =>
    ({ code: 'BQ2', intitule: 'Banque 2', type: 'TRESORERIE', compteTresorerieId }) as never;

  it('accepte un compte de trésorerie de détail du dossier', async () => {
    const { svc, create, prisma } = monde();
    await svc.creer('t1', tresorerie('banque'));
    expect(prisma.compte.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'banque', tenantId: 't1' } }));
    expect(create.mock.calls[0][0].data.compteTresorerieId).toBe('banque');
  });

  it.each([
    ['un compte d’un autre dossier', 'banque-voisin', /introuvable pour ce dossier/],
    ['un compte de classe 6', 'charge', /60500000 n'est pas un compte de trésorerie/],
    ['un compte Total', 'total-52', /52 est un compte Total/],
  ])('refuse à la création %s', async (_cas, id, motif) => {
    const { svc, create } = monde();
    await expect(svc.creer('t1', tresorerie(id))).rejects.toThrow(motif);
    expect(create).not.toHaveBeenCalled();
  });

  it('refuse aussi à la modification, et ne touche pas au journal', async () => {
    const { svc, update } = monde();
    await expect(svc.modifier('t1', 'j1', { compteTresorerieId: 'banque-voisin' })).rejects.toThrow(/introuvable/);
    await expect(svc.modifier('t1', 'j1', { compteTresorerieId: 'charge' })).rejects.toThrow(/classe 5/);
    expect(update).not.toHaveBeenCalled();
    await svc.modifier('t1', 'j1', { compteTresorerieId: 'banque' });
    expect(update).toHaveBeenCalledTimes(1);
  });
});
