import { Prisma } from '@prisma/client';
import { EcritureService } from './ecriture.service';
import { PrismaService } from '../../common/prisma.service';
import { JournalService } from '../journaux/journal.service';
import { ExerciceService } from '../exercice/exercice.service';

const d = (n: number) => new Prisma.Decimal(n);

interface LigneBrute {
  id: string;
  ecritureId?: string;
  compteId: string;
  numero: string;
  intitule?: string;
  debit: number;
  credit: number;
  date?: string;
}

/**
 * Faux PrismaService couvrant les deux requêtes que fait désormais le grand
 * livre : la requête « lignes à afficher » (avec `include`) et la requête
 * plate « contreparties » (avec `select`). C'est le `select` qui les
 * distingue — voir `EcritureService.chargerContreparties`.
 */
function serviceAvec(
  lignes: LigneBrute[],
  compteDemande?: { id: string; numero: string },
  filtreAffichage?: (l: LigneBrute) => boolean,
) {
  const enLigne = (l: LigneBrute) => ({
    id: l.id,
    ecritureId: l.ecritureId ?? 'e1',
    compteId: l.compteId,
    libelle: null,
    debit: d(l.debit),
    credit: d(l.credit),
    lettre: null,
    compte: { id: l.compteId, numero: l.numero, intitule: l.intitule ?? `Compte ${l.numero}` },
    ecriture: {
      date: new Date(l.date ?? '2026-02-01'),
      libelle: 'Écriture de test',
      reference: null,
      numeroPiece: 1,
      journal: { code: 'OD' },
    },
  });

  const prisma = {
    compte: {
      findFirst: jest.fn().mockResolvedValue(
        compteDemande ? { ...compteDemande, intitule: 'Compte de test' } : null,
      ),
    },
    ligneEcriture: {
      findMany: jest.fn().mockImplementation((args: { select?: unknown }) => {
        // Requête « contreparties » : toutes les lignes, forme plate.
        if (args.select) {
          return Promise.resolve(
            lignes.map((l) => ({
              ecritureId: l.ecritureId ?? 'e1',
              debit: d(l.debit),
              compte: { numero: l.numero },
            })),
          );
        }
        // Requête « lignes à afficher ».
        const visibles = filtreAffichage ? lignes.filter(filtreAffichage) : lignes;
        return Promise.resolve(visibles.map(enLigne));
      }),
    },
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
    const lignes: LigneBrute[] = [
      { id: 'l1', compteId: 'c-achat', numero: '60100000', debit: 100, credit: 0 },
      { id: 'l2', compteId: 'c-banque', numero: '52110000', debit: 0, credit: 100 },
    ];
    const service = serviceAvec(lignes, { id: 'c-achat', numero: '60100000' }, (l) => l.id === 'l1');

    const { lignes: gl } = await service.grandLivre('t1', 'c-achat');

    expect(gl[0].contrepartie).toEqual(['52110000']);
  });

  it('N débits / 1 crédit : chaque ligne débitrice pointe le seul compte crédité', async () => {
    const lignes: LigneBrute[] = [
      { id: 'l1', compteId: 'c-immo', numero: '24510000', debit: 100, credit: 0 },
      { id: 'l2', compteId: 'c-stock', numero: '31100000', debit: 50, credit: 0 },
      { id: 'l3', compteId: 'c-banque', numero: '52110000', debit: 0, credit: 150 },
    ];
    const service = serviceAvec(lignes, { id: 'c-immo', numero: '24510000' }, (l) => l.id === 'l1');

    const { lignes: gl } = await service.grandLivre('t1', 'c-immo');

    expect(gl[0].contrepartie).toEqual(['52110000']);
  });

  it('1 débit / M crédits : la ligne débitrice liste les comptes crédités', async () => {
    const lignes: LigneBrute[] = [
      { id: 'l1', compteId: 'c-banque', numero: '52110000', debit: 150, credit: 0 },
      { id: 'l2', compteId: 'c-vente', numero: '70510000', debit: 0, credit: 100 },
      { id: 'l3', compteId: 'c-tva', numero: '44300000', debit: 0, credit: 50 },
    ];
    const service = serviceAvec(lignes, { id: 'c-banque', numero: '52110000' }, (l) => l.id === 'l1');

    const { lignes: gl } = await service.grandLivre('t1', 'c-banque');

    expect(gl[0].contrepartie).toEqual(['70510000', '44300000']);
  });

  it('N débits / M crédits : liste les candidats de sens opposé, sans trancher arbitrairement', async () => {
    // Cas signalé par l'utilisateur : aucune règle a posteriori ne peut
    // savoir quelle part de quel débit va à quel crédit. On affiche les
    // candidats plutôt qu'une précision fausse.
    const lignes: LigneBrute[] = [
      { id: 'l1', compteId: 'c-immo', numero: '24510000', debit: 60, credit: 0 },
      { id: 'l2', compteId: 'c-stock', numero: '31100000', debit: 40, credit: 0 },
      { id: 'l3', compteId: 'c-div1', numero: '47110000', debit: 0, credit: 70 },
      { id: 'l4', compteId: 'c-div2', numero: '47120000', debit: 0, credit: 30 },
    ];
    const service = serviceAvec(lignes, { id: 'c-immo', numero: '24510000' }, (l) => l.id === 'l1');

    const { lignes: gl } = await service.grandLivre('t1', 'c-immo');

    expect(gl[0].contrepartie).toEqual(['47110000', '47120000']);
  });

  it('n’inclut jamais les lignes de MÊME sens, ni le compte de la ligne elle-même', async () => {
    // C'est ce qui rend inutile tout correctif « sauf soi-même » : deux
    // lignes au débit sur le même compte ne peuvent pas se citer l'une
    // l'autre, puisque seul le sens opposé est retenu.
    const lignes: LigneBrute[] = [
      { id: 'l1', compteId: 'c-immo', numero: '24510000', debit: 60, credit: 0 },
      { id: 'l2', compteId: 'c-immo', numero: '24510000', debit: 40, credit: 0 },
      { id: 'l3', compteId: 'c-banque', numero: '52110000', debit: 0, credit: 100 },
    ];
    const service = serviceAvec(lignes, { id: 'c-immo', numero: '24510000' }, (l) => l.compteId === 'c-immo');

    const { lignes: gl } = await service.grandLivre('t1', 'c-immo');

    expect(gl[0].contrepartie).toEqual(['52110000']);
    expect(gl[1].contrepartie).toEqual(['52110000']);
    expect(gl.every((l) => !l.contrepartie.includes('24510000'))).toBe(true);
  });

  it('dédoublonne un même compte de contrepartie réparti sur plusieurs lignes', async () => {
    const lignes: LigneBrute[] = [
      { id: 'l1', compteId: 'c-charge', numero: '60100000', debit: 100, credit: 0 },
      { id: 'l2', compteId: 'c-banque', numero: '52110000', debit: 0, credit: 60 },
      { id: 'l3', compteId: 'c-banque', numero: '52110000', debit: 0, credit: 40 },
    ];
    const service = serviceAvec(lignes, { id: 'c-charge', numero: '60100000' }, (l) => l.id === 'l1');

    const { lignes: gl } = await service.grandLivre('t1', 'c-charge');

    expect(gl[0].contrepartie).toEqual(['52110000']);
  });

  it('ne mélange pas les contreparties de deux écritures distinctes', async () => {
    // Les contreparties sont désormais précalculées par écriture : ce test
    // vérifie que chaque ligne lit bien celles de SON écriture.
    const lignes: LigneBrute[] = [
      { id: 'a1', ecritureId: 'e1', compteId: 'c-banque', numero: '52110000', debit: 1000, credit: 0, date: '2026-01-10' },
      { id: 'a2', ecritureId: 'e1', compteId: 'c-cot', numero: '70100000', debit: 0, credit: 1000, date: '2026-01-10' },
      { id: 'b1', ecritureId: 'e2', compteId: 'c-banque', numero: '52110000', debit: 0, credit: 400, date: '2026-01-20' },
      { id: 'b2', ecritureId: 'e2', compteId: 'c-charge', numero: '60100000', debit: 400, credit: 0, date: '2026-01-20' },
    ];
    const service = serviceAvec(lignes, { id: 'c-banque', numero: '52110000' }, (l) => l.compteId === 'c-banque');

    const { lignes: gl } = await service.grandLivre('t1', 'c-banque');

    expect(gl[0].contrepartie).toEqual(['70100000']); // écriture e1
    expect(gl[1].contrepartie).toEqual(['60100000']); // écriture e2
  });

  it('calcule un solde progressif cumulé dans l’ordre des lignes', async () => {
    const lignes: LigneBrute[] = [
      { id: 'a1', ecritureId: 'e1', compteId: 'c-banque', numero: '52110000', debit: 1000, credit: 0, date: '2026-01-10' },
      { id: 'a2', ecritureId: 'e1', compteId: 'c-cot', numero: '70100000', debit: 0, credit: 1000, date: '2026-01-10' },
      { id: 'b1', ecritureId: 'e2', compteId: 'c-banque', numero: '52110000', debit: 0, credit: 400, date: '2026-01-20' },
      { id: 'b2', ecritureId: 'e2', compteId: 'c-charge', numero: '60100000', debit: 400, credit: 0, date: '2026-01-20' },
    ];
    const service = serviceAvec(lignes, { id: 'c-banque', numero: '52110000' }, (l) => l.compteId === 'c-banque');

    const { lignes: gl, soldeFinal } = await service.grandLivre('t1', 'c-banque');

    expect(gl.map((l) => l.soldeProgressif)).toEqual([1000, 600]);
    expect(soldeFinal).toBe(600);
  });

  it('convertit les Decimal Prisma en nombres (sinon les montants se concatènent)', async () => {
    // Piège déjà rencontré sur les immobilisations : un Decimal sérialisé
    // reste une chaîne, et « 100 » + « 50 » donne « 10050 » côté client.
    const lignes: LigneBrute[] = [
      { id: 'l1', compteId: 'c-banque', numero: '52110000', debit: 100, credit: 0 },
      { id: 'l2', compteId: 'c-cot', numero: '70100000', debit: 0, credit: 100 },
    ];
    const service = serviceAvec(lignes, { id: 'c-banque', numero: '52110000' }, (l) => l.id === 'l1');

    const { lignes: gl } = await service.grandLivre('t1', 'c-banque');

    expect(typeof gl[0].debit).toBe('number');
    expect(typeof gl[0].credit).toBe('number');
    expect(typeof gl[0].soldeProgressif).toBe('number');
  });

  it('refuse un compte qui n’appartient pas au tenant', async () => {
    const service = serviceAvec([], undefined);
    await expect(service.grandLivre('t1', 'compte-d-un-autre-tenant')).rejects.toThrow(
      'Compte introuvable pour ce tenant',
    );
  });
});

describe('grand livre COMPLET', () => {
  const jeuDeLignes: LigneBrute[] = [
    { id: 'a1', ecritureId: 'e1', compteId: 'c-banque', numero: '52110000', debit: 1000, credit: 0, date: '2026-01-10' },
    { id: 'a2', ecritureId: 'e1', compteId: 'c-cot', numero: '70100000', debit: 0, credit: 1000, date: '2026-01-10' },
    { id: 'b1', ecritureId: 'e2', compteId: 'c-banque', numero: '52110000', debit: 0, credit: 400, date: '2026-01-20' },
    { id: 'b2', ecritureId: 'e2', compteId: 'c-charge', numero: '60100000', debit: 400, credit: 0, date: '2026-01-20' },
  ];

  it('regroupe par compte, avec un solde progressif propre à chacun', async () => {
    const service = serviceAvec(jeuDeLignes);

    const comptes = await service.grandLivreComplet('t1', 'ex1');

    expect(comptes).toHaveLength(3);
    const banque = comptes.find((c) => c.compte.numero === '52110000')!;
    expect(banque.lignes.map((l) => l.soldeProgressif)).toEqual([1000, 600]);
    expect(banque.soldeFinal).toBe(600);
    expect(banque.totalDebit).toBe(1000);
    expect(banque.totalCredit).toBe(400);
  });

  it('ne mélange jamais deux comptes, même si les lignes arrivent entrelacées', async () => {
    // Le regroupement s'appuie sur une Map clavée par compteId, pas sur une
    // rupture de valeur : l'ordre d'arrivée ne peut pas contaminer un solde.
    const entrelace = [jeuDeLignes[0], jeuDeLignes[3], jeuDeLignes[2], jeuDeLignes[1]];
    const service = serviceAvec(entrelace);

    const comptes = await service.grandLivreComplet('t1', 'ex1');

    const banque = comptes.find((c) => c.compte.numero === '52110000')!;
    expect(banque.soldeFinal).toBe(600);
    expect(comptes.find((c) => c.compte.numero === '60100000')!.soldeFinal).toBe(400);
    expect(comptes.find((c) => c.compte.numero === '70100000')!.soldeFinal).toBe(-1000);
  });

  it('porte la bonne contrepartie sur chaque ligne', async () => {
    const service = serviceAvec(jeuDeLignes);

    const comptes = await service.grandLivreComplet('t1', 'ex1');

    const banque = comptes.find((c) => c.compte.numero === '52110000')!;
    expect(banque.lignes[0].contrepartie).toEqual(['70100000']);
    expect(banque.lignes[1].contrepartie).toEqual(['60100000']);
  });

  it('écarte les comptes sans aucun mouvement, comme le fait la balance', async () => {
    // Sans cet alignement, un compte ne portant que des lignes 0/0 figurerait
    // au grand livre mais pas à la balance : deux états du même jour ne
    // listeraient pas les mêmes comptes.
    const avecFantome: LigneBrute[] = [
      ...jeuDeLignes,
      { id: 'z1', ecritureId: 'e3', compteId: 'c-fantome', numero: '13100000', debit: 0, credit: 0, date: '2026-12-31' },
    ];
    const service = serviceAvec(avecFantome);

    const comptes = await service.grandLivreComplet('t1', 'ex1');

    expect(comptes.some((c) => c.compte.numero === '13100000')).toBe(false);
    expect(comptes).toHaveLength(3);
  });

  it('renvoie une liste vide sur un exercice sans écriture', async () => {
    const service = serviceAvec([]);
    await expect(service.grandLivreComplet('t1', 'ex1')).resolves.toEqual([]);
  });
});
