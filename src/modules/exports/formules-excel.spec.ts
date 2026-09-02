import * as ExcelJS from 'exceljs';
import { ExportService } from './export.service';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';
import { ImmobilisationService } from '../immobilisations/immobilisation.service';

/**
 * UN TOTAL ÉCRIT EN DUR EST UN CHIFFRE QUE PERSONNE NE PEUT VÉRIFIER.
 *
 * Les classeurs du dossier de révision ouvert sur le Drive portent des
 * formules : le réviseur clique un total, voit la plage additionnée, corrige
 * une ligne et regarde le reste suivre. Nos exports posaient des valeurs
 * figées · il fallait refaire l'addition à la main pour s'assurer qu'elle
 * était juste, et le fichier se désaccordait en silence dès qu'une ligne était
 * ajoutée ou supprimée.
 *
 * CE SPEC OUVRE LE CLASSEUR PRODUIT (CLAUDE.md §10 : les tests d'export
 * relisent le classeur plutôt que d'affirmer qu'il est correct) et vérifie
 * deux choses sur chaque formule : qu'elle EST une formule, et qu'elle vise
 * les BONNES lignes · car la coiffe d'identification insère trois lignes en
 * tête après le remplissage, et ExcelJS ne réécrit pas les références. Une
 * formule décalée s'ouvre sans erreur et additionne autre chose.
 */

const TENANT = {
  id: 'tn',
  nom: 'Association Test',
  numeroImpot: 'A1234567X',
  deviseCode: 'CDF',
  referentiel: 'SYCEBNL',
};

function classeurDepuis(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const w = new ExcelJS.Workbook();
  return w.xlsx.load(buffer as unknown as ArrayBuffer).then(() => w);
}

/** La cellule, telle qu'elle est écrite dans le fichier. */
function cellule(f: ExcelJS.Worksheet, adresse: string) {
  return f.getCell(adresse).value as ExcelJS.CellFormulaValue | number | string | null;
}

function estFormule(v: unknown): v is ExcelJS.CellFormulaValue {
  return typeof v === 'object' && v !== null && 'formula' in (v as object);
}

describe('exports · les totaux sont des formules Excel', () => {
  it('la balance générale totalise ses six colonnes par SUM, sur la bonne plage', async () => {
    const lignes = [
      {
        compteId: 'c1',
        numero: '10100000',
        intitule: 'Dotation',
        reportDebit: 0,
        reportCredit: 1000,
        mouvementDebit: 0,
        mouvementCredit: 0,
        totalDebit: 0,
        totalCredit: 1000,
      },
      {
        compteId: 'c2',
        numero: '52110000',
        intitule: 'Banque',
        reportDebit: 400,
        reportCredit: 0,
        mouvementDebit: 600,
        mouvementCredit: 0,
        totalDebit: 1000,
        totalCredit: 0,
      },
    ];
    const prisma = {
      tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue(TENANT) },
      exercice: { findFirst: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const ecriture = { balance: jest.fn().mockResolvedValue({ lignes }) } as unknown as EcritureService;

    const service = new ExportService(
      prisma,
      ecriture,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const { buffer } = await service.balanceExcel('tn', 'ex');
    const f = (await classeurDepuis(buffer)).getWorksheet('Balance')!;

    // Coiffe en 1-3, en-têtes en 4, deux comptes en 5 et 6, totaux en 7.
    expect(f.getCell('A4').value).toBe('N° compte');
    expect(f.getCell('B7').value).toBe('TOTAUX GÉNÉRAUX');

    const total = cellule(f, 'C7');
    expect(estFormule(total)).toBe(true);
    // La plage part de la PREMIÈRE ligne de données, pas de l'en-tête.
    expect((total as ExcelJS.CellFormulaValue).formula).toBe('SUM(C5:C6)');
    expect((total as ExcelJS.CellFormulaValue).result).toBe(400);

    // Les six colonnes de montants, aucune oubliée.
    for (const col of ['C', 'D', 'E', 'F', 'G', 'H']) {
      const v = cellule(f, `${col}7`);
      expect(estFormule(v)).toBe(true);
      expect((v as ExcelJS.CellFormulaValue).formula).toBe(`SUM(${col}5:${col}6)`);
    }
  });

  it('le tableau des amortissements lie dotation, cumul et valeur nette', async () => {
    const immos = {
      tableauAmortissements: jest.fn().mockResolvedValue({
        exercice: { dateDebut: '2025-01-01', dateFin: '2025-12-31' },
        mois: Array.from({ length: 12 }, (_, i) => ({ cle: `2025-${i + 1}`, libelle: `M${i + 1}` })),
        groupes: [
          {
            numero: '221499',
            intitule: "Matériel d'exploitation",
            lignes: [
              {
                id: 'a',
                designation: 'Concasseur',
                dateAcquisition: '2023-01-01',
                valeurBrute: 12_000,
                taux: 20,
                base: 12_000,
                parMois: Array.from({ length: 12 }, () => 200),
                dotation: 2_400,
                cumulN1: 4_800,
                cumulN: 7_200,
                valeurNette: 4_800,
                dotationPassee: true,
              },
            ],
            parMois: Array.from({ length: 12 }, () => 200),
            dotation: 2_400,
            cumulN1: 4_800,
            cumulN: 7_200,
            net: 4_800,
          },
        ],
        totaux: {
          parMois: Array.from({ length: 12 }, () => 200),
          dotation: 2_400,
          cumulN1: 4_800,
          cumulN: 7_200,
          net: 4_800,
        },
      }),
    } as unknown as ImmobilisationService;
    const prisma = {
      tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue(TENANT) },
      exercice: { findFirst: jest.fn().mockResolvedValue({ dateDebut: new Date('2025-01-01'), dateFin: new Date('2025-12-31') }) },
    } as unknown as PrismaService;

    const service = new ExportService(
      prisma,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      undefined,
      undefined,
      immos,
    );
    const { buffer } = await service.tableauAmortissementsExcel('tn', 'ex');
    const f = (await classeurDepuis(buffer)).getWorksheet('Amortissements')!;

    // Coiffe 1-3, en-têtes 4, titre de groupe 5, le bien 6, S/TOTAL 7, total 8.
    expect(f.getCell('A6').value).toBe('Concasseur');

    // Colonnes : A libellé, B date, C brut, D taux, E→P les douze mois,
    // Q dotation, R cumul N-1, S cumul N, T valeur nette.
    const dotation = cellule(f, 'Q6');
    expect(estFormule(dotation)).toBe(true);
    expect((dotation as ExcelJS.CellFormulaValue).formula).toBe('SUM(E6:P6)');

    const cumulN = cellule(f, 'S6');
    expect((cumulN as ExcelJS.CellFormulaValue).formula).toBe('R6+Q6');

    const net = cellule(f, 'T6');
    expect((net as ExcelJS.CellFormulaValue).formula).toBe('C6-S6');

    // Le S/TOTAL somme les lignes du groupe…
    const sousTotal = cellule(f, 'Q7');
    expect((sousTotal as ExcelJS.CellFormulaValue).formula).toBe('SUM(Q6:Q6)');

    // …et le TOTAL GÉNÉRAL additionne les S/TOTAL, pas de nouveau les biens.
    const totalGeneral = cellule(f, 'Q8');
    expect((totalGeneral as ExcelJS.CellFormulaValue).formula).toBe('Q7');
  });

  it('joint toujours le résultat calculé · un lecteur sans moteur de calcul verrait une case vide', async () => {
    const prisma = {
      tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue(TENANT) },
      exercice: { findFirst: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const ecriture = {
      balance: jest.fn().mockResolvedValue({
        lignes: [
          {
            compteId: 'c1',
            numero: '52110000',
            intitule: 'Banque',
            reportDebit: 250.5,
            reportCredit: 0,
            mouvementDebit: 0,
            mouvementCredit: 0,
            totalDebit: 250.5,
            totalCredit: 0,
          },
        ],
      }),
    } as unknown as EcritureService;
    const service = new ExportService(
      prisma,
      ecriture,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const { buffer } = await service.balanceExcel('tn', 'ex');
    const f = (await classeurDepuis(buffer)).getWorksheet('Balance')!;
    const v = cellule(f, 'C6') as ExcelJS.CellFormulaValue;
    expect(v.result).toBe(250.5);
  });
});
