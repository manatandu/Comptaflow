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
        clotureDebit: 0,
        clotureCredit: 0,
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
        clotureDebit: 0,
        clotureCredit: 0,
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

  /**
   * AUDIT FINAL F5 · sur un exercice clos, l'écriture qui solde une charge
   * partait en « solde avant période » · la balance exportée affichait en
   * ouverture l'inverse du total de l'année. Elle se lit avec les mouvements.
   */
  it('range l’écriture de solde des comptes de gestion avec les mouvements, jamais avant la période', async () => {
    const lignes = [
      {
        compteId: 'c601',
        numero: '60110000',
        intitule: 'Achats',
        reportDebit: 0,
        reportCredit: 0,
        mouvementDebit: 3000,
        mouvementCredit: 0,
        clotureDebit: 0,
        clotureCredit: 3000,
        totalDebit: 3000,
        totalCredit: 3000,
        solde: 0,
      },
    ];
    const prisma = {
      tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue(TENANT) },
      exercice: { findFirst: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const ecriture = { balance: jest.fn().mockResolvedValue({ lignes }) } as unknown as EcritureService;
    const vide = {} as never;
    const service = new ExportService(prisma, ecriture, vide, vide, vide, vide, vide, vide, vide, vide);
    const f = (await classeurDepuis((await service.balanceExcel('tn', 'ex')).buffer)).getWorksheet('Balance')!;
    expect(['C5', 'D5', 'E5', 'F5'].map((a) => f.getCell(a).value)).toEqual([null, null, 3000, 3000]);
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
                depreciations: 1_000,
                valeurNette: 3_800,
                dotationPassee: true,
              },
            ],
            parMois: Array.from({ length: 12 }, () => 200),
            dotation: 2_400,
            cumulN1: 4_800,
            cumulN: 7_200,
            depreciations: 1_000,
            net: 3_800,
          },
        ],
        totaux: {
          parMois: Array.from({ length: 12 }, () => 200),
          dotation: 2_400,
          cumulN1: 4_800,
          cumulN: 7_200,
          depreciations: 1_000,
          net: 3_800,
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
    // Q dotation, R cumul N-1, S cumul N, T dépréciations, U valeur nette.
    const dotation = cellule(f, 'Q6');
    expect(estFormule(dotation)).toBe(true);
    expect((dotation as ExcelJS.CellFormulaValue).formula).toBe('SUM(E6:P6)');

    const cumulN = cellule(f, 'S6');
    expect((cumulN as ExcelJS.CellFormulaValue).formula).toBe('R6+Q6');

    // La valeur nette retranche les 29 (audit final F131).
    expect(f.getCell('T4').value).toBe('Dépréciations');
    expect(f.getCell('T6').value).toBe(1_000);
    const net = cellule(f, 'U6');
    expect((net as ExcelJS.CellFormulaValue).formula).toBe('C6-S6-T6');
    expect((net as ExcelJS.CellFormulaValue).result).toBe(3_800);
    expect((cellule(f, 'T7') as ExcelJS.CellFormulaValue).formula).toBe('SUM(T6:T6)');

    // Le S/TOTAL somme les lignes du groupe…
    const sousTotal = cellule(f, 'Q7');
    expect((sousTotal as ExcelJS.CellFormulaValue).formula).toBe('SUM(Q6:Q6)');

    // …et le TOTAL GÉNÉRAL additionne les S/TOTAL, pas de nouveau les biens.
    const totalGeneral = cellule(f, 'Q8');
    expect((totalGeneral as ExcelJS.CellFormulaValue).formula).toBe('Q7');
  });

  it('le tableau des immobilisations porte les biens sortis APRÈS le total, hors de lui (audit final F31)', async () => {
    const ligne = (id: string, designation: string, brut: number) => ({
      id,
      designation,
      numeroInventaire: '',
      dateAcquisition: '2021-01-01',
      dureeAns: 5,
      valeurBrute: brut,
      amortissements: 0,
      depreciations: 0,
      valeurNette: brut,
      statut: 'EN_SERVICE',
      dateSortie: null,
    });
    const immos = {
      tableauImmobilisations: jest.fn().mockResolvedValue({
        dateArret: '2025-12-31',
        groupes: [
          {
            numero: '221499',
            intitule: 'Matériel',
            lignes: [{ ...ligne('a', 'Concasseur', 100_000), depreciations: 7_000, valeurNette: 93_000 }],
            brut: 100_000,
            amortissements: 0,
            depreciations: 7_000,
            net: 93_000,
          },
        ],
        sortis: [{ ...ligne('b', 'Camion cédé', 60_000), statut: 'CEDEE', dateSortie: '2025-06-30', compte: '245' }],
        totaux: { brut: 100_000, amortissements: 0, depreciations: 7_000, net: 93_000 },
      }),
    } as unknown as ImmobilisationService;
    const prisma = {
      tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue(TENANT) },
      exercice: { findFirst: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const vide = {} as never;
    const service = new ExportService(prisma, vide, vide, vide, vide, vide, vide, vide, vide, vide, undefined, undefined, immos);
    const f = (await classeurDepuis((await service.tableauImmobilisationsExcel('tn', '2025-12-31')).buffer)).getWorksheet(
      'Immobilisations',
    )!;
    // Coiffe 1-3, en-têtes 4, titre de groupe 5, le bien 6, S/TOTAL 7, total 8,
    // ligne vide 9, titre des sortis 10, le bien sorti 11.
    expect(f.getCell('A8').value).toBe('TOTAL GÉNÉRAL');
    expect((cellule(f, 'D8') as ExcelJS.CellFormulaValue).formula).toBe('D7');
    expect(f.getCell('A10').value).toBe('BIENS SORTIS À CETTE DATE · hors total');
    expect(f.getCell('A11').value).toBe('(245) Camion cédé');
    expect(f.getCell('H11').value).toBe('Sorti le 30/06/2025');
    // La valeur nette retranche les 29 (audit final F131).
    expect(f.getCell('F4').value).toBe('Dépréciations');
    const net = cellule(f, 'G6') as ExcelJS.CellFormulaValue;
    expect({ formule: net.formula, resultat: net.result }).toEqual({ formule: 'D6-E6-F6', resultat: 93_000 });
    expect((cellule(f, 'F8') as ExcelJS.CellFormulaValue).formula).toBe('F7');
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
