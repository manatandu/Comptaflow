import {
  ClasseCompte,
  JeuEtatsFinanciersSycebnl,
  SystemeComptableSyscohada,
  TypeCompteDetailTotal,
} from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { EcritureService } from '../comptabilite/ecriture.service';
import { ExerciceService } from '../exercice/exercice.service';
import { EtatsFinanciersService } from '../etats-financiers/etats-financiers.service';
import { EtatsFinanciersProjetService } from '../etats-financiers/etats-financiers-projet.service';
import { EtatsFinanciersProjetBudgetService } from '../etats-financiers/etats-financiers-projet-budget.service';
import { EngagementService } from '../analytique/engagement.service';
import { EtatsFinanciersSmtService } from '../etats-financiers/etats-financiers-smt.service';
import { EtatsFinanciersSyscohadaService } from '../etats-financiers-syscohada/etats-financiers-syscohada.service';
import { EtatsFinanciersSmtSyscohadaService } from '../etats-financiers-syscohada/etats-financiers-smt-syscohada.service';
import { NoteAnnexeService } from '../notes-annexes/note-annexe.service';
import { PrismaService } from '../../common/prisma.service';
import { ExportService } from './export.service';

/**
 * LA NOTE 3 DU S.M.T IMPRIMÉE · ce que le classeur montre du calcul.
 *
 * CE QUE CE SPEC AURAIT ATTRAPÉ. Le moteur d'états ventile le solde de
 * chaque compte de tiers entre part échue, part non échue et part que la
 * tenue n'a pas datée. `ExportService` n'écrivait que les six colonnes de la
 * maquette et ses deux totaux : la ventilation vivait dans la charge utile de
 * l'API sans jamais atteindre une feuille, et le réviseur qui imprimait son
 * état continuait de décider sans elle. Aucun test ne le voyait, parce que le
 * moteur, lui, passait tous les siens.
 *
 * C'est exactement ce que l'AUDCIF art. 22, 1° interdit · l'organisation
 * comptable informatisée doit faire que « les données relatives à toute
 * opération donnant lieu à enregistrement […] puissent être restituées sur
 * papier ou sous une forme directement intelligible » (Acte uniforme relatif
 * au droit comptable et à l'information financière, art. 22, 1°). La seconde
 * moitié de la phrase est aussi normative que la première : un calcul juste
 * qui n'atteint aucune feuille n'est pas restitué.
 *
 * LES SIX COLONNES OFFICIELLES NE BOUGENT PAS. La maquette du SYCEBNL donne
 * pour la NOTE 3, créances comme dettes : « DATE | NOM […] | Montant au 31
 * décembre N | Montant au 1er janvier N | Variation en valeur | Variation en
 * % », avec la ligne « TOTAL DES CREANCES » / « TOTAL DES DETTES » (Partie 4,
 * ch. 4, section 3). Un dossier qui n'a saisi aucune échéance · le cas de
 * tous ceux ouverts avant que le champ soit servi · doit rendre ces six
 * colonnes à l'identique de la veille. Le spec le vérifie chiffre par
 * chiffre, parce qu'une régression y déplacerait un montant chez un client
 * qui n'a rien demandé.
 */

interface LigneBalanceStub {
  compteId: string;
  numero: string;
  intitule: string;
  classe: ClasseCompte;
  typeCompte: TypeCompteDetailTotal;
  reportDebit: number;
  reportCredit: number;
  mouvementDebit: number;
  mouvementCredit: number;
  totalDebit: number;
  totalCredit: number;
  solde: number;
}

function ligne(
  numero: string,
  intitule: string,
  classe: ClasseCompte,
  reportDebit: number,
  reportCredit: number,
  mouvementDebit: number,
  mouvementCredit: number,
): LigneBalanceStub {
  return {
    compteId: `id-${numero}`,
    numero,
    intitule,
    classe,
    typeCompte: TypeCompteDetailTotal.DETAIL,
    reportDebit,
    reportCredit,
    mouvementDebit,
    mouvementCredit,
    totalDebit: reportDebit + mouvementDebit,
    totalCredit: reportCredit + mouvementCredit,
    solde: reportDebit + mouvementDebit - reportCredit - mouvementCredit,
  };
}

// Un dossier S.M.T minuscule · une caisse, un client débiteur de 100 000
// (dont 40 000 déjà ouverts au 1er janvier), un fournisseur créditeur de
// 60 000. Les deux comptes de tiers suffisent : la note ne lit que la
// classe 4.
const BALANCE: LigneBalanceStub[] = [
  ligne('41100000', 'Clients', ClasseCompte.CLASSE_4, 40_000, 0, 60_000, 0),
  ligne('40110000', 'Fournisseurs', ClasseCompte.CLASSE_4, 0, 0, 0, 60_000),
  ligne('57110000', 'Caisse', ClasseCompte.CLASSE_5, 50_000, 0, 300_000, 120_000),
  ligne('70110000', 'Cotisations', ClasseCompte.CLASSE_7, 0, 0, 0, 300_000),
  ligne('60410000', 'Achats', ClasseCompte.CLASSE_6, 0, 0, 120_000, 0),
  ligne('10110000', 'Dotation', ClasseCompte.CLASSE_1, 0, 50_000, 0, 0),
];

const CLOTURE = new Date('2026-12-31T00:00:00Z');
const APRES_CLOTURE = new Date('2027-03-31T00:00:00Z');
const AVANT_CLOTURE = new Date('2026-06-30T00:00:00Z');

interface LigneTiersStub {
  compteId: string;
  debit: number;
  credit: number;
  dateEcheance: Date | null;
}

/** Échéances tenues · le client est ventilé 70/30, le fournisseur non échu. */
const LIGNES_TENUES: LigneTiersStub[] = [
  { compteId: 'id-41100000', debit: 70_000, credit: 0, dateEcheance: APRES_CLOTURE },
  { compteId: 'id-41100000', debit: 30_000, credit: 0, dateEcheance: AVANT_CLOTURE },
  { compteId: 'id-40110000', debit: 0, credit: 60_000, dateEcheance: APRES_CLOTURE },
];

/**
 * LE RÈGLEMENT NON LETTRÉ FACE À LA FACTURE DATÉE · la facture de 120 000
 * porte une échéance, l'acompte de 20 000 n'en porte aucune et n'a pas été
 * lettré contre elle. Le solde reste 100 000, la part datée en vaut 120 000,
 * et la part non ventilée sort donc à -20 000. Ce n'est pas une créance
 * négative, c'est un lettrage qui manque.
 */
const LIGNES_NON_LETTREES: LigneTiersStub[] = [
  { compteId: 'id-41100000', debit: 120_000, credit: 0, dateEcheance: APRES_CLOTURE },
  { compteId: 'id-41100000', debit: 0, credit: 20_000, dateEcheance: null },
];

const TENANT = {
  id: 't1',
  nom: 'ASBL GRACE',
  numeroImpot: 'A1234567B',
  adresse: '12 av. de la Justice',
  ville: 'Kinshasa',
  pays: 'RD Congo',
  jeuEtatsFinanciersSycebnl: JeuEtatsFinanciersSycebnl.SYSTEME_MINIMAL_TRESORERIE,
  actePersonnaliteJuridique: 'Arrêté n° 087/CAB/MIN/J/2024',
};
const EXERCICES = [{ id: 'e1', tenantId: 't1', dateDebut: new Date('2026-01-01T00:00:00Z'), dateFin: CLOTURE }];

function fabriquerExport(lignesTiers: LigneTiersStub[]): ExportService {
  const ecritureService = {
    balance: jest.fn().mockResolvedValue({
      lignes: BALANCE,
      totaux: {
        debit: BALANCE.reduce((s, l) => s + l.totalDebit, 0),
        credit: BALANCE.reduce((s, l) => s + l.totalCredit, 0),
      },
    }),
  } as unknown as EcritureService;
  const exerciceService = { lister: jest.fn().mockResolvedValue([...EXERCICES]) } as unknown as ExerciceService;
  const prisma = {
    tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ ...TENANT }) },
    exercice: {
      findFirstOrThrow: jest.fn().mockResolvedValue(EXERCICES[0]),
      findFirst: jest.fn().mockResolvedValue(EXERCICES[0]),
    },
    rattachementNote: { findMany: jest.fn().mockResolvedValue([]) },
    saisieNote: { findMany: jest.fn().mockResolvedValue([]) },
    compte: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
    ecriture: { findMany: jest.fn().mockResolvedValue([]) },
    // Seule `partsParEcheance` lit les lignes dans ce parcours.
    ligneEcriture: { findMany: jest.fn().mockResolvedValue(lignesTiers) },
    bailleur: { findMany: jest.fn().mockResolvedValue([]) },
    planAnalytique: { findFirst: jest.fn().mockResolvedValue(null) },
    immobilisation: { findMany: jest.fn().mockResolvedValue([]) },
    tiersCompte: { findMany: jest.fn().mockResolvedValue([]) },
    // Registre des engagements hors comptabilité · vide ici, ce parcours ne le
    // teste pas. Sans ce double, `resteParSection` tomberait sur undefined.
    engagementDepense: { findMany: jest.fn().mockResolvedValue([]) },
  } as unknown as PrismaService;

  const etatsFinanciers = new EtatsFinanciersService(ecritureService, exerciceService);
  const etatsProjet = new EtatsFinanciersProjetService(ecritureService, exerciceService, prisma);
  const budgetProjet = new EtatsFinanciersProjetBudgetService(ecritureService, prisma, new EngagementService(prisma));
  const etatsSmt = new EtatsFinanciersSmtService(ecritureService, exerciceService, prisma);
  const notes = new NoteAnnexeService(ecritureService, exerciceService, prisma, budgetProjet, etatsFinanciers);
  return new ExportService(
    prisma,
    ecritureService,
    etatsFinanciers,
    etatsProjet,
    etatsSmt,
    budgetProjet,
    notes,
    {} as never,
    {} as never,
    {} as never,
  );
}

async function feuilleNote3(lignesTiers: LigneTiersStub[]): Promise<ExcelJS.Worksheet> {
  const { buffer } = await fabriquerExport(lignesTiers).notesSmtExcel('t1', 'e1');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  return wb.getWorksheet('NOTE 3 CREANCES-DETTES')!;
}

/** Rang de la ligne dont la colonne A porte ce numéro de compte. */
function rangDuCompte(ws: ExcelJS.Worksheet, numero: string): number {
  let rang = 0;
  ws.eachRow((row, n) => {
    if (row.getCell(1).value === numero) rang = n;
  });
  expect(rang).toBeGreaterThan(9);
  return rang;
}

/** Rang de la ligne de total qui porte ce libellé en colonne B. */
function rangDuTotal(ws: ExcelJS.Worksheet, libelle: string): number {
  let rang = 0;
  ws.eachRow((row, n) => {
    if (row.getCell(2).value === libelle) rang = n;
  });
  expect(rang).toBeGreaterThan(9);
  return rang;
}

/** Le texte de la ligne de contrôle, sous le cadre · Arial 8 italique. */
function ligneDeControle(ws: ExcelJS.Worksheet): string {
  let texte = '';
  ws.eachRow((row) => {
    const c = row.getCell(1);
    if (c.font?.italic && c.font?.size === 8 && typeof c.value === 'string') texte = c.value;
  });
  return texte;
}

describe('NOTE 3 du S.M.T · la ventilation par échéance atteint la feuille', () => {
  it('coiffe les six colonnes officielles et les trois ajoutées de deux bandeaux distincts', async () => {
    const ws = await feuilleNote3(LIGNES_TENUES);

    // Le lecteur doit pouvoir dire où finit le texte et où commence le
    // logiciel · sinon la maquette officielle paraît en compter neuf.
    expect(String(ws.getCell(8, 1).value)).toContain('MAQUETTE OFFICIELLE');
    expect(String(ws.getCell(8, 1).value)).toContain('Partie 4, ch. 4, section 3');
    expect(String(ws.getCell(8, 7).value)).toContain('hors maquette');

    // Les six colonnes du texte, dans leur ordre, puis les trois ajoutées.
    expect(ws.getRow(9).values).toEqual([
      undefined,
      'Compte',
      'Nom',
      'Montant au 31/12/N',
      'Montant au 01/01/N',
      'Variation en valeur',
      'Variation en %',
      'Dont non échu au 31/12/N',
      'Dont échu au 31/12/N',
      'Part non ventilée · signal de tenue',
    ]);
  });

  it('ventile la créance et la dette, et les trois parts somment au montant du 31/12', async () => {
    const ws = await feuilleNote3(LIGNES_TENUES);

    const client = rangDuCompte(ws, '41100000');
    expect(ws.getCell(client, 3).value).toBe(100_000);
    expect(ws.getCell(client, 7).value).toBe(70_000);
    expect(ws.getCell(client, 8).value).toBe(30_000);
    expect(ws.getCell(client, 9).value).toBe(0);

    // Une dette non échue se lit en POSITIF sous un total de dettes · le
    // signe du poste s'applique aux parts comme au solde.
    const fournisseur = rangDuCompte(ws, '40110000');
    expect(ws.getCell(fournisseur, 3).value).toBe(60_000);
    expect(ws.getCell(fournisseur, 7).value).toBe(60_000);
    expect(ws.getCell(fournisseur, 8).value).toBe(0);

    for (const rang of [client, fournisseur]) {
      const [c, nonEchu, echu, reste] = [3, 7, 8, 9].map((col) => Number(ws.getCell(rang, col).value));
      expect(nonEchu + echu + reste).toBeCloseTo(c, 2);
    }
  });

  it('porte les trois parts sur les DEUX lignes de total, à côté du total officiel', async () => {
    const ws = await feuilleNote3(LIGNES_TENUES);

    const totalCreances = rangDuTotal(ws, 'TOTAL DES CRÉANCES');
    expect(ws.getCell(totalCreances, 3).value).toBe(100_000);
    expect(ws.getCell(totalCreances, 7).value).toBe(70_000);
    expect(ws.getCell(totalCreances, 8).value).toBe(30_000);
    expect(ws.getCell(totalCreances, 9).value).toBe(0);

    const totalDettes = rangDuTotal(ws, 'TOTAL DES DETTES');
    expect(ws.getCell(totalDettes, 3).value).toBe(60_000);
    expect(ws.getCell(totalDettes, 7).value).toBe(60_000);
    expect(ws.getCell(totalDettes, 9).value).toBe(0);

    // Ventilation complète · la ligne de contrôle le DIT, au lieu de se
    // taire. Une feuille muette ne se distingue pas d'une feuille dont
    // personne n'a lancé le contrôle.
    expect(ligneDeControle(ws)).toContain('Ventilation complète');
  });

  it('rend à l’identique les six colonnes officielles d’un dossier qui n’a saisi aucune échéance', async () => {
    const ws = await feuilleNote3([]);

    const client = rangDuCompte(ws, '41100000');
    // LES SIX COLONNES DE LA MAQUETTE, inchangées · c'est ce que ce dossier
    // rendait la veille, et une correction qui y déplacerait un chiffre
    // serait une régression pour tous les dossiers déjà tenus.
    expect(ws.getCell(client, 1).value).toBe('41100000');
    expect(ws.getCell(client, 2).value).toBe('Clients');
    expect(ws.getCell(client, 3).value).toBe(100_000);
    expect(ws.getCell(client, 4).value).toBe(40_000);
    expect(ws.getCell(client, 5).value).toBe(60_000);
    expect(ws.getCell(client, 6).value).toBe(150);
    expect(rangDuTotal(ws, 'TOTAL DES CRÉANCES')).toBeGreaterThan(client);
    expect(ws.getCell(rangDuTotal(ws, 'TOTAL DES CRÉANCES'), 3).value).toBe(100_000);
    expect(ws.getCell(rangDuTotal(ws, 'TOTAL DES DETTES'), 3).value).toBe(60_000);

    // Et la lacune de tenue se VOIT : rien n'est rangé d'office en non échu,
    // tout le solde tombe dans la part non ventilée.
    expect(ws.getCell(client, 7).value).toBe(0);
    expect(ws.getCell(client, 8).value).toBe(0);
    expect(ws.getCell(client, 9).value).toBe(100_000);
    expect(ws.getCell(rangDuTotal(ws, 'TOTAL DES CRÉANCES'), 9).value).toBe(100_000);

    // Le motif du moteur est imprimé sous le cadre · un commentaire de
    // cellule ne s'imprime pas, cette ligne oui.
    const controle = ligneDeControle(ws);
    expect(controle).toContain('Etat des créances et des dettes non échues');
    expect(controle).toContain("Renseigner la date d'échéance");
  });

  it('présente une part non ventilée négative comme un signal de tenue, jamais comme un montant', async () => {
    const ws = await feuilleNote3(LIGNES_NON_LETTREES);

    const client = rangDuCompte(ws, '41100000');
    // Le solde du 31/12 ne bouge pas · c'est la part datée qui déborde.
    expect(ws.getCell(client, 3).value).toBe(100_000);
    expect(ws.getCell(client, 7).value).toBe(120_000);
    expect(ws.getCell(client, 9).value).toBe(-20_000);

    // À l'écran, la cellule dit ce qu'elle est.
    expect(String(ws.getCell(client, 9).note ?? '')).toContain('NÉGATIVE');
    expect(String(ws.getCell(client, 9).note ?? '')).toContain('non lettré');

    // À l'impression, la ligne de contrôle le redit · un montant négatif
    // sous un total de créances se lirait sinon comme une créance négative.
    const controle = ligneDeControle(ws);
    expect(controle).toContain('NÉGATIVE');
    expect(controle).toContain('Signal de tenue');
  });

  it('sert la même feuille dans la liasse complète que dans l’export individuel', async () => {
    // Les deux portes passent par `feuillesNotesSmtEtafi` · une correction
    // posée dans l'une seulement laisserait la liasse imprimer l'ancienne
    // note, et c'est la liasse que le réviseur classe.
    const { buffer } = await fabriquerExport(LIGNES_TENUES).liasseCompleteExcel('t1', 'e1');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const ws = wb.getWorksheet('NOTE 3 CREANCES-DETTES')!;

    expect(ws.getCell(9, 7).value).toBe('Dont non échu au 31/12/N');
    expect(ws.getCell(9, 9).value).toBe('Part non ventilée · signal de tenue');
    const client = rangDuCompte(ws, '41100000');
    expect(ws.getCell(client, 7).value).toBe(70_000);
    expect(ws.getCell(client, 8).value).toBe(30_000);
  });
});

/**
 * LE JUMEAU SYSCOHADA · la même note, l'autre maquette.
 *
 * Le S.M.T du SYSCOHADA porte la même NOTE 3 sous cinq colonnes : « Date |
 * Nom du client | Montant au 31 décembre | Montant au 1er janvier | Variation
 * % », avec la ligne TOTAL DES CRÉANCES, et le tableau symétrique pour les
 * dettes (AUDCIF, Titre X, ch. 3). Son moteur ventile désormais comme celui
 * du SYCEBNL et sous les mêmes noms de champs · la feuille appelle donc les
 * MÊMES fonctions d'impression, et les deux classeurs disent la même chose de
 * la même façon. Un ajout posé d'un seul côté ferait diverger deux états qui
 * répondent au même besoin.
 */
function fabriquerExportSyscohada(lignesTiers: LigneTiersStub[]): ExportService {
  const ecritureService = {
    balance: jest.fn().mockResolvedValue({
      lignes: BALANCE,
      totaux: {
        debit: BALANCE.reduce((s, l) => s + l.totalDebit, 0),
        credit: BALANCE.reduce((s, l) => s + l.totalCredit, 0),
      },
    }),
  } as unknown as EcritureService;
  const exerciceService = { lister: jest.fn().mockResolvedValue([...EXERCICES]) } as unknown as ExerciceService;
  const prisma = {
    tenant: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        ...TENANT,
        systemeComptableSyscohada: SystemeComptableSyscohada.MINIMAL_TRESORERIE,
        devise: 'CDF',
      }),
    },
    exercice: {
      findFirstOrThrow: jest.fn().mockResolvedValue(EXERCICES[0]),
      findFirst: jest.fn().mockResolvedValue(EXERCICES[0]),
    },
    rattachementNote: { findMany: jest.fn().mockResolvedValue([]) },
    saisieNote: { findMany: jest.fn().mockResolvedValue([]) },
    compte: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
    ecriture: { findMany: jest.fn().mockResolvedValue([]) },
    ligneEcriture: { findMany: jest.fn().mockResolvedValue(lignesTiers) },
    immobilisation: { findMany: jest.fn().mockResolvedValue([]) },
    tiersCompte: { findMany: jest.fn().mockResolvedValue([]) },
  } as unknown as PrismaService;

  const syscohada = new EtatsFinanciersSyscohadaService(ecritureService, exerciceService);
  const smtSyscohada = new EtatsFinanciersSmtSyscohadaService(ecritureService, exerciceService, prisma);
  const notes = new NoteAnnexeService(
    ecritureService,
    exerciceService,
    prisma,
    { executionBudgetaire: jest.fn() } as unknown as EtatsFinanciersProjetBudgetService,
    { bilan: jest.fn(), compteDeResultat: jest.fn(), tableauFluxTresorerie: jest.fn() } as unknown as EtatsFinanciersService,
  );
  return new ExportService(
    prisma,
    ecritureService,
    // Les moteurs SYCEBNL ne sont jamais appelés par ce chemin · s'ils
    // l'étaient, l'accès à une propriété d'un objet vide ferait échouer le
    // test bruyamment, ce qui est exactement ce qu'on veut.
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    notes,
    {} as never,
    {} as never,
    {} as never,
    syscohada,
    smtSyscohada,
  );
}

async function feuilleNote3Syscohada(lignesTiers: LigneTiersStub[]): Promise<ExcelJS.Worksheet> {
  const { buffer } = await fabriquerExportSyscohada(lignesTiers).notesSmtSyscohadaExcel('t1', 'e1');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  return wb.getWorksheet('NOTE 3 CREANCES-DETTES')!;
}

/** Rang de la ligne dont la colonne B commence par ce numéro de compte. */
function rangDuCompteSyscohada(ws: ExcelJS.Worksheet, numero: string): number {
  let rang = 0;
  ws.eachRow((row, n) => {
    if (String(row.getCell(2).value ?? '').startsWith(numero)) rang = n;
  });
  expect(rang).toBeGreaterThan(8);
  return rang;
}

describe('NOTE 3 du S.M.T SYSCOHADA · la même ventilation, imprimée de la même façon', () => {
  it('ajoute les trois mêmes colonnes après les cinq du Titre X, sous le même bandeau', async () => {
    const ws = await feuilleNote3Syscohada(LIGNES_TENUES);

    // Les cinq colonnes du texte puis les trois ajoutées · le tableau des
    // créances ouvre le premier.
    let rangEntetes = 0;
    ws.eachRow((row, n) => {
      if (rangEntetes === 0 && row.getCell(1).value === 'Date') rangEntetes = n;
    });
    expect(rangEntetes).toBeGreaterThan(8);
    expect(ws.getRow(rangEntetes).values).toEqual([
      undefined,
      'Date',
      'Nom du client',
      'Montant au 31 décembre',
      'Montant au 1er janvier',
      'Variation %',
      'Dont non échu au 31/12/N',
      'Dont échu au 31/12/N',
      'Part non ventilée · signal de tenue',
    ]);
    expect(String(ws.getCell(rangEntetes - 1, 1).value)).toContain('Titre X, ch. 3');
    expect(String(ws.getCell(rangEntetes - 1, 6).value)).toContain('hors maquette');
  });

  it('ventile la créance sans toucher aux montants de la maquette', async () => {
    const ws = await feuilleNote3Syscohada(LIGNES_TENUES);
    const client = rangDuCompteSyscohada(ws, '41100000');

    expect(ws.getCell(client, 3).value).toBe(100_000);
    expect(ws.getCell(client, 4).value).toBe(40_000);
    expect(ws.getCell(client, 6).value).toBe(70_000);
    expect(ws.getCell(client, 7).value).toBe(30_000);
    expect(ws.getCell(client, 8).value).toBe(0);

    const totalCreances = rangDuTotal(ws, 'TOTAL DES CRÉANCES');
    expect(ws.getCell(totalCreances, 3).value).toBe(100_000);
    expect(ws.getCell(totalCreances, 6).value).toBe(70_000);
    expect(ws.getCell(totalCreances, 7).value).toBe(30_000);
  });

  it('imprime la lacune de tenue sans écraser la réserve sur la variation en %', async () => {
    const ws = await feuilleNote3Syscohada([]);
    const client = rangDuCompteSyscohada(ws, '41100000');
    expect(ws.getCell(client, 8).value).toBe(100_000);

    // DEUX lignes de contrôle distinctes · l'une porte une anomalie du texte
    // officiel, l'autre la tenue du dossier. Les fondre ferait lire l'une
    // pour l'autre.
    const controles: string[] = [];
    ws.eachRow((row) => {
      const c = row.getCell(1);
      if (c.font?.italic && c.font?.size === 8 && typeof c.value === 'string') controles.push(c.value);
    });
    expect(controles).toHaveLength(2);
    expect(controles[0]).toContain('Variations portées au compte de résultat');
    expect(controles[1]).toContain('non échues');
    expect(controles[1]).toContain("Renseignez la date d'échéance");
  });
});
