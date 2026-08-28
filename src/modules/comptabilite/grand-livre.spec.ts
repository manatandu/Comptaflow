import { Prisma } from '@prisma/client';
import { EcritureService } from './ecriture.service';
import { PrismaService } from '../../common/prisma.service';
import { JournalService } from '../journaux/journal.service';
import { ExerciceService } from '../exercice/exercice.service';

const d = (n: number) => new Prisma.Decimal(n);

interface LigneBrute {
  id: string;
  compteId: string;
  numero: string;
  debit: number;
  credit: number;
}

/**
 * Construit une écriture telle que Prisma la renvoie à `grandLivre()` :
 * chaque ligne porte son écriture, qui porte à son tour TOUTES les lignes
 * de l'écriture (c'est ce qui permet de calculer la contrepartie).
 */
function ecritureAvecLignes(lignes: LigneBrute[], date = new Date('2026-02-01')) {
  const lignesPrisma = lignes.map((l) => ({
    id: l.id,
    compteId: l.compteId,
    libelle: null,
    debit: d(l.debit),
    credit: d(l.credit),
    lettre: null,
    compte: { numero: l.numero },
  }));

  return lignesPrisma.map((l) => ({
    ...l,
    ecriture: {
      date,
      libelle: 'Écriture de test',
      reference: null,
      numeroPiece: 1,
      journal: { code: 'OD' },
      lignes: lignesPrisma,
    },
  }));
}

/** Service avec un Prisma bouchonné, suffisant pour `grandLivre()`. */
function serviceAvecLignes(compte: { id: string; numero: string }, lignesRenvoyees: unknown[]) {
  const prisma = {
    compte: { findFirst: jest.fn().mockResolvedValue({ ...compte, intitule: 'Compte de test' }) },
    ligneEcriture: { findMany: jest.fn().mockResolvedValue(lignesRenvoyees) },
  } as unknown as PrismaService;

  return new EcritureService(prisma, {} as JournalService, {} as ExerciceService);
}

/**
 * Règle de contrepartie : comptes DISTINCTS de sens opposé dans la même
 * écriture. Ces tests figent les quatre cas discutés lors de sa conception
 * (séance du 2026-08-28), y compris ceux qui avaient invalidé les deux
 * premières versions de la règle.
 */
describe('grand livre — colonne « compte contrepartie »', () => {
  it('écriture à 2 lignes : contrepartie unique et certaine', async () => {
    const lignes = ecritureAvecLignes([
      { id: 'l1', compteId: 'c-achat', numero: '60100000', debit: 100, credit: 0 },
      { id: 'l2', compteId: 'c-banque', numero: '52110000', debit: 0, credit: 100 },
    ]);
    const service = serviceAvecLignes({ id: 'c-achat', numero: '60100000' }, [lignes[0]]);

    const { lignes: gl } = await service.grandLivre('t1', 'c-achat');

    expect(gl[0].contrepartie).toEqual(['52110000']);
  });

  it('N débits / 1 crédit : chaque ligne débitrice pointe le seul compte crédité', async () => {
    const lignes = ecritureAvecLignes([
      { id: 'l1', compteId: 'c-immo', numero: '24510000', debit: 100, credit: 0 },
      { id: 'l2', compteId: 'c-stock', numero: '31100000', debit: 50, credit: 0 },
      { id: 'l3', compteId: 'c-banque', numero: '52110000', debit: 0, credit: 150 },
    ]);
    const service = serviceAvecLignes({ id: 'c-immo', numero: '24510000' }, [lignes[0]]);

    const { lignes: gl } = await service.grandLivre('t1', 'c-immo');

    expect(gl[0].contrepartie).toEqual(['52110000']);
  });

  it('1 débit / M crédits : la ligne débitrice liste les comptes crédités', async () => {
    const lignes = ecritureAvecLignes([
      { id: 'l1', compteId: 'c-banque', numero: '52110000', debit: 150, credit: 0 },
      { id: 'l2', compteId: 'c-vente', numero: '70510000', debit: 0, credit: 100 },
      { id: 'l3', compteId: 'c-tva', numero: '44300000', debit: 0, credit: 50 },
    ]);
    const service = serviceAvecLignes({ id: 'c-banque', numero: '52110000' }, [lignes[0]]);

    const { lignes: gl } = await service.grandLivre('t1', 'c-banque');

    expect(gl[0].contrepartie).toEqual(['70510000', '44300000']);
  });

  it('N débits / M crédits : liste les candidats de sens opposé, sans trancher arbitrairement', async () => {
    // Cas signalé par l'utilisateur : aucune règle a posteriori ne peut
    // savoir quelle part de quel débit va à quel crédit. On affiche les
    // candidats plutôt qu'une précision fausse.
    const lignes = ecritureAvecLignes([
      { id: 'l1', compteId: 'c-immo', numero: '24510000', debit: 60, credit: 0 },
      { id: 'l2', compteId: 'c-stock', numero: '31100000', debit: 40, credit: 0 },
      { id: 'l3', compteId: 'c-div1', numero: '47110000', debit: 0, credit: 70 },
      { id: 'l4', compteId: 'c-div2', numero: '47120000', debit: 0, credit: 30 },
    ]);
    const service = serviceAvecLignes({ id: 'c-immo', numero: '24510000' }, [lignes[0]]);

    const { lignes: gl } = await service.grandLivre('t1', 'c-immo');

    expect(gl[0].contrepartie).toEqual(['47110000', '47120000']);
  });

  it('n’inclut jamais les lignes de MÊME sens, ni le compte de la ligne elle-même', async () => {
    // C'est ce qui rend inutile tout correctif « sauf soi-même » : deux
    // lignes au débit sur le même compte ne peuvent pas se citer l'une
    // l'autre, puisque seul le sens opposé est retenu.
    const lignes = ecritureAvecLignes([
      { id: 'l1', compteId: 'c-immo', numero: '24510000', debit: 60, credit: 0 },
      { id: 'l2', compteId: 'c-immo', numero: '24510000', debit: 40, credit: 0 },
      { id: 'l3', compteId: 'c-banque', numero: '52110000', debit: 0, credit: 100 },
    ]);
    const service = serviceAvecLignes({ id: 'c-immo', numero: '24510000' }, [lignes[0], lignes[1]]);

    const { lignes: gl } = await service.grandLivre('t1', 'c-immo');

    expect(gl[0].contrepartie).toEqual(['52110000']);
    expect(gl[1].contrepartie).toEqual(['52110000']);
    expect(gl.every((l) => !l.contrepartie.includes('24510000'))).toBe(true);
  });

  it('dédoublonne un même compte de contrepartie réparti sur plusieurs lignes', async () => {
    const lignes = ecritureAvecLignes([
      { id: 'l1', compteId: 'c-charge', numero: '60100000', debit: 100, credit: 0 },
      { id: 'l2', compteId: 'c-banque', numero: '52110000', debit: 0, credit: 60 },
      { id: 'l3', compteId: 'c-banque', numero: '52110000', debit: 0, credit: 40 },
    ]);
    const service = serviceAvecLignes({ id: 'c-charge', numero: '60100000' }, [lignes[0]]);

    const { lignes: gl } = await service.grandLivre('t1', 'c-charge');

    expect(gl[0].contrepartie).toEqual(['52110000']);
  });

  it('calcule un solde progressif cumulé dans l’ordre des lignes', async () => {
    const e1 = ecritureAvecLignes(
      [
        { id: 'a1', compteId: 'c-banque', numero: '52110000', debit: 1000, credit: 0 },
        { id: 'a2', compteId: 'c-cot', numero: '70100000', debit: 0, credit: 1000 },
      ],
      new Date('2026-01-10'),
    );
    const e2 = ecritureAvecLignes(
      [
        { id: 'b1', compteId: 'c-banque', numero: '52110000', debit: 0, credit: 400 },
        { id: 'b2', compteId: 'c-charge', numero: '60100000', debit: 400, credit: 0 },
      ],
      new Date('2026-01-20'),
    );
    const service = serviceAvecLignes({ id: 'c-banque', numero: '52110000' }, [e1[0], e2[0]]);

    const { lignes: gl, soldeFinal } = await service.grandLivre('t1', 'c-banque');

    expect(gl.map((l) => l.soldeProgressif)).toEqual([1000, 600]);
    expect(soldeFinal).toBe(600);
  });

  it('convertit les Decimal Prisma en nombres (sinon les montants se concatènent)', async () => {
    // Piège déjà rencontré sur les immobilisations : un Decimal sérialisé
    // reste une chaîne, et « 100 » + « 50 » donne « 10050 » côté client.
    const lignes = ecritureAvecLignes([
      { id: 'l1', compteId: 'c-banque', numero: '52110000', debit: 100, credit: 0 },
      { id: 'l2', compteId: 'c-cot', numero: '70100000', debit: 0, credit: 100 },
    ]);
    const service = serviceAvecLignes({ id: 'c-banque', numero: '52110000' }, [lignes[0]]);

    const { lignes: gl } = await service.grandLivre('t1', 'c-banque');

    expect(typeof gl[0].debit).toBe('number');
    expect(typeof gl[0].credit).toBe('number');
    expect(typeof gl[0].soldeProgressif).toBe('number');
  });
});
