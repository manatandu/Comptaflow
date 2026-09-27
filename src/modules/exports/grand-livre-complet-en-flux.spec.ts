import 'reflect-metadata';
import { Writable } from 'stream';
import * as ExcelJS from 'exceljs';
import { ParseUUIDPipe } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { ExportService } from './export.service';
import { ExportController } from './export.controller';
import { PrismaService } from '../../common/prisma.service';
import { PREMIERE_LIGNE_DONNEES } from './classeur-en-flux';

/**
 * AUDIT FINAL F99 ET F100 · le grand livre complet exporté.
 *
 * F99 · la documentation promettait une feuille « Sommaire » par compte ; le
 * classeur sortait d'une seule feuille, sans aucun total, et le brouillard y
 * était mêlé sans colonne Statut. F100 · l'exercice n'était pas requis, et
 * un appel direct agrégeait tous les exercices sous le titre d'un seul.
 */

const EXERCICE = { id: 'ex', dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31') };
const COMPTES = {
  c6: { id: 'c6', numero: '60410000', intitule: 'Achats' },
  c4: { id: 'c4', numero: '40100000', intitule: 'Fournisseurs' },
};
const ligne = (id: string, compte: keyof typeof COMPTES, debit: number, credit: number, statut: string) => ({
  id,
  compteId: compte,
  debit,
  credit,
  lettre: null,
  libelle: null,
  compte: COMPTES[compte],
  ecriture: { date: new Date('2026-03-01'), numeroPiece: 1, reference: null, libelle: 'Achat', statut, journal: { code: 'ACH' } },
});

/** Les lignes dans l'ordre que la requête demande · compte, date, pièce. */
const LIGNES = [
  ligne('l2', 'c4', 0, 100, 'VALIDEE'),
  ligne('l4', 'c4', 0, 50, 'BROUILLARD'),
  ligne('l1', 'c6', 100, 0, 'VALIDEE'),
  ligne('l3', 'c6', 50, 0, 'BROUILLARD'),
];

async function exporter() {
  const prisma = {
    ligneEcriture: {
      count: jest.fn().mockResolvedValue(LIGNES.length),
      groupBy: jest.fn().mockResolvedValue([
        { compteId: 'c6', _sum: { debit: 150, credit: 0 } },
        { compteId: 'c4', _sum: { debit: 0, credit: 150 } },
      ]),
      findMany: jest.fn(async ({ take, cursor, skip }: any) => {
        const depart = cursor ? LIGNES.findIndex((l) => l.id === cursor.id) + (skip ?? 0) : 0;
        return LIGNES.slice(depart, depart + take);
      }),
    },
    compte: {
      // La doublure honore `id: { in }` · un sommaire lu sans ce filtre
      // rendrait des comptes sans mouvement.
      findMany: jest.fn(async ({ where }: any) =>
        Object.values(COMPTES).filter((c) => where.id.in.includes(c.id) && where.tenantId === 't1'),
      ),
    },
    tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ nom: 'Dossier', numeroImpot: 'A1', devise: 'CDF' }) },
    exercice: { findFirst: jest.fn().mockResolvedValue(EXERCICE), findUnique: jest.fn().mockResolvedValue(EXERCICE) },
  };
  const svc = new ExportService(
    prisma as unknown as PrismaService,
    {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never,
  );
  const morceaux: Buffer[] = [];
  const sortie = new Writable({
    write(m, _e, cb) {
      morceaux.push(Buffer.from(m));
      cb();
    },
  });
  await svc.grandLivreCompletExcelEnFlux('t1', 'ex', () => sortie);
  const classeur = new ExcelJS.Workbook();
  await classeur.xlsx.load(Buffer.concat(morceaux) as never);
  return classeur;
}

/** Les lignes de données d'une feuille, colonne par colonne. */
function donnees(feuille: ExcelJS.Worksheet): unknown[][] {
  const lignes: unknown[][] = [];
  feuille.eachRow((r, n) => {
    if (n >= PREMIERE_LIGNE_DONNEES) lignes.push((r.values as unknown[]).slice(1));
  });
  return lignes;
}

describe('F99 · le grand livre complet porte son sommaire et le statut de chaque ligne', () => {
  it('deux feuilles, le grand livre puis le sommaire', async () => {
    const classeur = await exporter();
    expect(classeur.worksheets.map((f) => f.name)).toEqual(['Grand livre', 'Sommaire']);
  });

  it('chaque ligne dit si elle est validée ou encore au brouillard', async () => {
    const [grandLivre] = (await exporter()).worksheets;
    const statuts = donnees(grandLivre).map((l) => l[l.length - 1]);
    expect(statuts).toEqual(['Validée', 'Brouillard', 'Validée', 'Brouillard']);
  });

  it('le sommaire rend une ligne par compte, dans l’ordre des numéros, et les totaux', async () => {
    const sommaire = (await exporter()).getWorksheet('Sommaire')!;
    expect(donnees(sommaire)).toEqual([
      ['40100000', 'Fournisseurs', 0, 150, -150],
      ['60410000', 'Achats', 150, 0, 150],
      [undefined, 'TOTAUX', 150, 150, 0],
    ]);
  });
});

describe('F100 · les exports du grand livre exigent l’exercice', () => {
  it.each(['grandLivreComplet', 'grandLivre'])('%s · le paramètre exerciceId passe par un ParseUUIDPipe', (methode) => {
    const args = Reflect.getMetadata(ROUTE_ARGS_METADATA, ExportController, methode) as Record<
      string,
      { data?: string; pipes: unknown[] }
    >;
    const exercice = Object.values(args).find((a) => a.data === 'exerciceId');
    expect(exercice?.pipes.some((p) => p instanceof ParseUUIDPipe)).toBe(true);
  });
});
