import { NumerotationPiece } from '@prisma/client';
import { ImportService } from './import.service';
import { TypeImport } from './dto/import.dto';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';

/**
 * IMPORT D'ÉCRITURES · LE NOMBRE DE REQUÊTES NE DÉPEND PAS DU NOMBRE DE
 * PIÈCES (audit final F2).
 *
 * Une pièce à la fois coûtait plusieurs allers-retours par pièce dans une
 * transaction bornée à cinq secondes · l'import tombait entier dès quelques
 * dizaines de pièces. Ce spec fige les trois propriétés du correctif : une
 * lecture du maximum par SÉRIE de numérotation et non par pièce, des
 * insertions groupées, et un délai de transaction posé.
 */
const PIECES = 300;

function service() {
  const tx = {
    ecriture: {
      // Le maximum existant de chaque série · OD en continu sur le fichier,
      // ACH en continu sur le journal.
      aggregate: jest.fn().mockImplementation(({ where }: { where: { journalId?: string } }) =>
        Promise.resolve({ _max: { numeroPiece: where.journalId === 'j-ach' ? 10 : 4 } }),
      ),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    ligneEcriture: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
  };
  const prisma = {
    tenant: { findUnique: jest.fn().mockResolvedValue({ id: 't', longueurCompte: 8, referentiel: 'SYSCOHADA' }) },
    exercice: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'ex',
        statut: 'OUVERT',
        dateDebut: new Date('2026-01-01'),
        dateFin: new Date('2026-12-31'),
      }),
    },
    journal: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'j-od', code: 'OD', type: 'GENERAL', numerotation: NumerotationPiece.CONTINUE_FICHIER },
        { id: 'j-ach', code: 'ACH', type: 'ACHATS', numerotation: NumerotationPiece.CONTINUE_JOURNAL },
      ]),
    },
    compte: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'c601', numero: '60110000', typeCompte: 'DETAIL' },
        { id: 'c401', numero: '40110000', typeCompte: 'DETAIL' },
      ]),
    },
    $transaction: jest.fn().mockImplementation((f: (t: unknown) => unknown) => f(tx)),
  } as unknown as PrismaService;
  const ecritureService = { controlesDEntree: jest.fn().mockResolvedValue({}) } as unknown as EcritureService;
  return { svc: new ImportService(prisma, ecritureService), tx, prisma };
}

function fichier() {
  const lignes = ['Date;Journal;Piece;Compte;Libelle;Debit;Credit'];
  for (let i = 1; i <= PIECES; i++) {
    const journal = i % 3 === 0 ? 'ACH' : 'OD';
    lignes.push(`2026-03-15;${journal};P${i};60110000;Pièce ${i};${i}00;0`);
    lignes.push(`2026-03-15;${journal};P${i};40110000;Pièce ${i};0;${i}00`);
  }
  return Buffer.from(lignes.join('\n'), 'utf8').toString('base64');
}

const MAPPING = {
  date: 'Date',
  journal: 'Journal',
  piece: 'Piece',
  numero: 'Compte',
  libelle: 'Libelle',
  debit: 'Debit',
  credit: 'Credit',
};

describe('Import d’écritures · insertions groupées', () => {
  it('lit le maximum UNE fois par série, et numérote la suite sans trou', async () => {
    const { svc, tx } = service();
    const r = await svc.executer('t', 'u', {
      type: TypeImport.ECRITURES,
      nomFichier: 'journal.csv',
      contenuBase64: fichier(),
      mapping: MAPPING,
    });
    const tetes = tx.ecriture.createMany.mock.calls.flatMap((c) => c[0].data) as Array<{ journalId: string; numeroPiece: number }>;
    const numeros = (journal: string) => tetes.filter((t) => t.journalId === journal).map((t) => t.numeroPiece);
    expect({
      lectures: tx.ecriture.aggregate.mock.calls.length,
      creees: r.ecrituresCreees,
      od: numeros('j-od').slice(0, 3),
      ach: numeros('j-ach').slice(0, 3),
      odContinu: numeros('j-od').every((n, i, t) => i === 0 || n === t[i - 1] + 1),
    }).toEqual({ lectures: 2, creees: PIECES, od: [5, 6, 7], ach: [11, 12, 13], odContinu: true });
  });

  it('insère têtes et lignes en tranches, rattache chaque ligne à sa tête, et pose un délai', async () => {
    const { svc, tx, prisma } = service();
    await svc.executer('t', 'u', {
      type: TypeImport.ECRITURES,
      nomFichier: 'journal.csv',
      contenuBase64: fichier(),
      mapping: MAPPING,
    });
    const ids = new Set(tx.ecriture.createMany.mock.calls.flatMap((c) => c[0].data.map((t: { id: string }) => t.id)));
    const lignes = tx.ligneEcriture.createMany.mock.calls.flatMap((c) => c[0].data) as Array<{ ecritureId: string }>;
    const options = (prisma.$transaction as jest.Mock).mock.calls[0][1];
    expect({
      appelsTetes: tx.ecriture.createMany.mock.calls.length,
      appelsLignes: tx.ligneEcriture.createMany.mock.calls.length,
      lignes: lignes.length,
      rattachees: lignes.every((l) => ids.has(l.ecritureId)),
      delai: options?.timeout > 5_000,
    }).toEqual({ appelsTetes: 1, appelsLignes: 1, lignes: PIECES * 2, rattachees: true, delai: true });
  });
});
