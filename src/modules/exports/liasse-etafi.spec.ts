import { ClasseCompte, JeuEtatsFinanciersSycebnl, TypeCompteDetailTotal } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { writeFileSync } from 'fs';
import { EcritureService } from '../comptabilite/ecriture.service';
import { ExerciceService } from '../exercice/exercice.service';
import { EtatsFinanciersService } from '../etats-financiers/etats-financiers.service';
import { EtatsFinanciersProjetService } from '../etats-financiers/etats-financiers-projet.service';
import { AucunPlanABudgetsException, EtatsFinanciersProjetBudgetService } from '../etats-financiers/etats-financiers-projet-budget.service';
import { EngagementService } from '../analytique/engagement.service';
import { EtatsFinanciersSmtService } from '../etats-financiers/etats-financiers-smt.service';
import { NoteAnnexeService } from '../notes-annexes/note-annexe.service';
import { PrismaService } from '../../common/prisma.service';
import { ExportService } from './export.service';
import { NOM_BALANCE } from './theme-etafi';
import { RENVOI_IMMOBILISATIONS } from '../etats-financiers/correspondance-smt';

/**
 * LIASSE « ETAFI » · vérification de bout en bout sur un dossier synthétique
 * ÉQUILIBRÉ : les moteurs d'états RÉELS (bilan, compte de résultat, TFT,
 * notes) tournent sur une balance fabriquée, et l'export produit le classeur
 * du modèle du skill. Ce test tient les DEUX promesses faites à
 * l'utilisateur (2026-09-01) :
 *
 *  1. l'export individuel est L'ÉTAT SEUL, en valeurs, dans la charte ;
 *  2. la liasse complète est le classeur ENTIER du modèle, feuille pour
 *     feuille et dans son ordre.
 *
 * Les contrôles portent sur ce qui casserait silencieusement : l'ordre et le
 * nom des feuilles, le cartouche, la palette (un vert de section qui devient
 * gris ne lèverait aucune erreur), les formules de totaux, et l'identité
 * ouverture + mouvements = clôture de la feuille BALANCE N.
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
  clotureDebit: number;
  clotureCredit: number;
  totalDebit: number;
  totalCredit: number;
  solde: number;
}

function ligne(
  numero: string,
  classe: ClasseCompte,
  reportDebit: number,
  reportCredit: number,
  mouvementDebit: number,
  mouvementCredit: number,
): LigneBalanceStub {
  return {
    compteId: `id-${numero}`,
    numero,
    intitule: `Compte ${numero}`,
    classe,
    typeCompte: TypeCompteDetailTotal.DETAIL,
    reportDebit,
    reportCredit,
    mouvementDebit,
    mouvementCredit,
    clotureDebit: 0,
    clotureCredit: 0,
    totalDebit: reportDebit + mouvementDebit,
    totalCredit: reportCredit + mouvementCredit,
    solde: reportDebit + mouvementDebit - reportCredit - mouvementCredit,
  };
}

// Exercice N (2026) · équilibré : actif net 1 085 000 = passif (dotation
// 800 000 + excédent 240 000 + fournisseurs 45 000).
const BALANCE_N: LigneBalanceStub[] = [
  ligne('10110000', ClasseCompte.CLASSE_1, 0, 800_000, 0, 0),
  ligne('23110000', ClasseCompte.CLASSE_2, 600_000, 0, 150_000, 0),
  ligne('28310000', ClasseCompte.CLASSE_2, 0, 100_000, 0, 50_000),
  ligne('40110000', ClasseCompte.CLASSE_4, 0, 0, 145_000, 190_000),
  ligne('52110000', ClasseCompte.CLASSE_5, 300_000, 0, 600_000, 415_000),
  ligne('60410000', ClasseCompte.CLASSE_6, 0, 0, 190_000, 0),
  ligne('66110000', ClasseCompte.CLASSE_6, 0, 0, 120_000, 0),
  ligne('68110000', ClasseCompte.CLASSE_6, 0, 0, 50_000, 0),
  ligne('70110000', ClasseCompte.CLASSE_7, 0, 0, 0, 400_000),
  ligne('71110000', ClasseCompte.CLASSE_7, 0, 0, 0, 200_000),
];

// Exercice N-1 (2025) · le bilan d'ouverture de N.
const BALANCE_N1: LigneBalanceStub[] = [
  ligne('10110000', ClasseCompte.CLASSE_1, 0, 800_000, 0, 0),
  ligne('23110000', ClasseCompte.CLASSE_2, 600_000, 0, 0, 0),
  ligne('28310000', ClasseCompte.CLASSE_2, 0, 100_000, 0, 0),
  ligne('52110000', ClasseCompte.CLASSE_5, 300_000, 0, 0, 0),
];

// Jeu PROJETS · fonds bailleur 400 000 reçus (462), 250 000 consommés
// (702), charges 250 000, trésorerie 150 000 · bilan équilibré.
const BALANCE_PROJET_N: LigneBalanceStub[] = [
  ligne('46210000', ClasseCompte.CLASSE_4, 0, 0, 0, 400_000),
  ligne('70210000', ClasseCompte.CLASSE_7, 0, 0, 250_000, 250_000 + 250_000),
  ligne('60410000', ClasseCompte.CLASSE_6, 0, 0, 180_000, 0),
  ligne('66110000', ClasseCompte.CLASSE_6, 0, 0, 70_000, 0),
  ligne('52110000', ClasseCompte.CLASSE_5, 0, 0, 400_000, 250_000),
];
const BALANCE_PROJET_N1: LigneBalanceStub[] = [];

// Jeu SMT · une caisse, des cotisations encaissées, un achat payé.
const BALANCE_SMT_N: LigneBalanceStub[] = [
  ligne('57110000', ClasseCompte.CLASSE_5, 50_000, 0, 300_000, 120_000),
  ligne('70110000', ClasseCompte.CLASSE_7, 0, 0, 0, 300_000),
  ligne('60410000', ClasseCompte.CLASSE_6, 0, 0, 120_000, 0),
  ligne('10110000', ClasseCompte.CLASSE_1, 0, 50_000, 0, 0),
];

const TENANT = {
  id: 't1',
  nom: 'ASBL GRACE',
  numeroImpot: 'A1234567B',
  adresse: '12 av. de la Justice',
  ville: 'Kinshasa',
  pays: 'RD Congo',
  jeuEtatsFinanciersSycebnl: JeuEtatsFinanciersSycebnl.ASSOCIATIONS_ORDRES_PROFESSIONNELS,
  actePersonnaliteJuridique: 'Arrêté n° 087/CAB/MIN/J/2024',
};
const EXERCICES = [
  { id: 'e1', tenantId: 't1', dateDebut: new Date('2026-01-01T00:00:00Z'), dateFin: new Date('2026-12-31T00:00:00Z') },
  { id: 'e0', tenantId: 't1', dateDebut: new Date('2025-01-01T00:00:00Z'), dateFin: new Date('2025-12-31T00:00:00Z') },
];

function fabriquerExport(jeu: JeuEtatsFinanciersSycebnl = TENANT.jeuEtatsFinanciersSycebnl): ExportService {
  const balances: Record<string, LigneBalanceStub[]> =
    jeu === JeuEtatsFinanciersSycebnl.PROJETS_DEVELOPPEMENT
      ? { e1: BALANCE_PROJET_N, e0: BALANCE_PROJET_N1 }
      : jeu === JeuEtatsFinanciersSycebnl.SYSTEME_MINIMAL_TRESORERIE
        ? { e1: BALANCE_SMT_N }
        : { e1: BALANCE_N, e0: BALANCE_N1 };
  const ecritureService = {
    balance: jest.fn().mockImplementation((_t: string, exerciceId: string) => {
      const lignes = balances[exerciceId] ?? [];
      return Promise.resolve({
        lignes,
        totaux: {
          debit: lignes.reduce((s, l) => s + l.totalDebit, 0),
          credit: lignes.reduce((s, l) => s + l.totalCredit, 0),
        },
      });
    }),
    /*
      CUMUL DEPUIS L'ORIGINE · les deux colonnes cumulées du tableau
      emplois-ressources. Le faux les reconstitue en additionnant les balances
      des exercices jusqu'à celui demandé, compte par compte · sans quoi il
      validerait un service qui n'existe pas.
    */
    balanceCumulee: jest.fn().mockImplementation((_t: string, exerciceId: string) => {
      const borne = EXERCICES.find((e) => e.id === exerciceId);
      const retenus = EXERCICES.filter((e) => borne && e.dateDebut <= borne.dateDebut).map((e) => e.id);
      const parCompte = new Map<string, LigneBalanceStub>();
      for (const id of retenus) {
        for (const l of balances[id] ?? []) {
          const cumul = parCompte.get(l.numero);
          if (!cumul) {
            parCompte.set(l.numero, { ...l });
            continue;
          }
          cumul.totalDebit += l.totalDebit;
          cumul.totalCredit += l.totalCredit;
          cumul.mouvementDebit += l.mouvementDebit;
          cumul.mouvementCredit += l.mouvementCredit;
          cumul.solde = cumul.totalDebit - cumul.totalCredit;
        }
      }
      const lignes = [...parCompte.values()];
      return Promise.resolve({
        lignes,
        totaux: {
          debit: lignes.reduce((s, l) => s + l.totalDebit, 0),
          credit: lignes.reduce((s, l) => s + l.totalCredit, 0),
        },
      });
    }),
    // Aucune mise en service liée à une fiche (D6) · les mouvements restent tels quels.
    virementsDeMiseEnService: jest.fn().mockResolvedValue(new Map()),
  } as unknown as EcritureService;
  const exerciceService = {
    lister: jest.fn().mockResolvedValue([...EXERCICES]),
  } as unknown as ExerciceService;
  const prisma = {
    tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ ...TENANT, jeuEtatsFinanciersSycebnl: jeu }) },
    exercice: {
      findFirstOrThrow: jest
        .fn()
        .mockImplementation(({ where }: { where: { id: string } }) =>
          Promise.resolve(EXERCICES.find((e) => e.id === where.id)),
        ),
      findFirst: jest.fn().mockImplementation(({ where }: { where: { id?: string; tenantId?: string; dateDebut?: { lt: Date } } }) => {
        // PAR IDENTIFIANT · l'exercice demandé, borné au dossier, `null`
        // s'il n'en est pas · c'est sur ce `null` que l'export refuse par un
        // 404 (audit final F222), et une doublure qui rendrait toujours le
        // premier exercice validerait un cartouche lu sur le mauvais.
        if (where?.id !== undefined) {
          return Promise.resolve(EXERCICES.find((e) => e.id === where.id && e.tenantId === where.tenantId) ?? null);
        }
        if (where?.dateDebut?.lt) {
          const avant = EXERCICES.filter((e) => e.dateDebut < where.dateDebut!.lt);
          avant.sort((a, b) => b.dateDebut.getTime() - a.dateDebut.getTime());
          return Promise.resolve(avant[0] ?? null);
        }
        return Promise.resolve(EXERCICES[0]);
      }),
    },
    rattachementNote: { findMany: jest.fn().mockResolvedValue([]) },
    // Registre des provisions vide · aucun passif éventuel à porter à la 16C / 18B (passe R2, B2).
    provisionRisqueCharge: { findMany: jest.fn().mockResolvedValue([]) },
    saisieNote: { findMany: jest.fn().mockResolvedValue([]) },
    compte: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
    ecriture: { findMany: jest.fn().mockResolvedValue([]) },
    // `groupBy` sert la Note 3 du S.M.T SYCEBNL, qui demande ses deux parts à
    // la base (jumeau de l'audit final F258) · aucune ligne de tiers ici.
    ligneEcriture: { findMany: jest.fn().mockResolvedValue([]), groupBy: jest.fn().mockResolvedValue([]) },
    bailleur: { findMany: jest.fn().mockResolvedValue([]) },
    // Pas de plan analytique à budgets · la liasse projets doit servir la
    // grille VIERGE du modèle, jamais échouer.
    planAnalytique: { findFirst: jest.fn().mockResolvedValue(null) },
    immobilisation: { findMany: jest.fn().mockResolvedValue([]) },
    // Aucune campagne d'inventaire · la note 2 du SMT garde ses quantités vides.
    campagneInventaire: { findFirst: jest.fn().mockResolvedValue(null) },
    tiersCompte: { findMany: jest.fn().mockResolvedValue([]) },
    // Registre des engagements hors comptabilité · vide ici, la liasse ne le
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

/** Rang du repère `rep` (colonne 2) de la feuille de réconciliation. */
function rangDeRecon(ws: ExcelJS.Worksheet, rep: string): number {
  let rang = 0;
  ws.eachRow((row, n) => {
    if (row.getCell(2).value === rep) rang = n;
  });
  return rang;
}

async function ouvrir(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  return wb;
}

const fondDe = (cell: ExcelJS.Cell): string => {
  const f = cell.fill as { pattern?: string; fgColor?: { argb?: string } } | undefined;
  return f?.fgColor?.argb ?? '';
};

describe('exports individuels · charte ETAFI, état seul en valeurs', () => {
  it('le bilan tient sur Bilan-Actif et Bilan-Passif, cartouche et palette du modèle', async () => {
    const exportService = fabriquerExport();
    const { buffer } = await exportService.bilanExcel('t1', 'e1');
    const wb = await ouvrir(buffer);

    expect(wb.worksheets.map((w) => w.name)).toEqual(['Bilan-Actif', 'Bilan-Passif']);
    const actif = wb.getWorksheet('Bilan-Actif')!;
    // Cartouche du modèle · dénomination, NIF, exercice, durée.
    expect(actif.getCell('A3').value).toBe('Dénomination sociale : ASBL GRACE');
    expect(String(actif.getCell('A5').value)).toContain("N° d'identification fiscale (NIF) : A1234567B");
    expect(actif.getCell('A1').value).toBe('- 1 -');
    // Titre en Arial Black vert.
    expect(actif.getCell('B7').value).toBe('BILAN');
    expect(actif.getCell('B7').font?.name).toBe('Arial Black');
    expect(actif.getCell('B7').font?.color?.argb).toBe('FF008000');
    // Bandeau d'en-têtes CCFFFF sur deux lignes.
    expect(actif.getCell('A8').value).toBe('REF');
    expect(fondDe(actif.getCell('A8'))).toBe('FFCCFFFF');
    expect(actif.getCell('D9').value).toBe('BRUT');
    // Le TOTAL GENERAL (BZ) est bleu nuit, texte blanc, et porte une FORMULE.
    let rangBz = 0;
    actif.eachRow((row, n) => {
      if (row.getCell(1).value === 'BZ') rangBz = n;
    });
    expect(rangBz).toBeGreaterThan(9);
    expect(fondDe(actif.getCell(rangBz, 2))).toBe('FF000080');
    const bz = actif.getCell(rangBz, 6).value as { formula?: string };
    expect(bz.formula).toContain('F');
    // La case REF du total reste SANS fond · règle du modèle.
    expect(fondDe(actif.getCell(rangBz, 1))).toBe('');
  });

  it('le compte de résultat suit ses conventions officielles · XC = XA - XB en formule', async () => {
    const exportService = fabriquerExport();
    const { buffer } = await exportService.compteDeResultatExcel('t1', 'e1');
    const wb = await ouvrir(buffer);
    const ws = wb.getWorksheet('Résultat')!;
    const rangs = new Map<string, number>();
    ws.eachRow((row, n) => {
      const ref = row.getCell(1).value;
      if (typeof ref === 'string') rangs.set(ref, n);
    });
    const xc = ws.getCell(rangs.get('XC')!, 4).value as { formula?: string };
    expect(xc.formula).toBe(`D${rangs.get('XA')}-D${rangs.get('XB')}`);
    // Valeurs : produits 600 000, charges 360 000 · l'excédent XE vaut 240 000
    // une fois les formules posées (recalcul Excel) ; ici on vérifie les
    // valeurs sources qui les alimentent.
    expect(ws.getCell(rangs.get('RA')!, 4).value).toBe(400_000);
  });

  it('le TFT porte les six colonnes du modèle officiel, Note comprise et vide (passe R6)', async () => {
    // Partie 4 ch. 2, section 3 : « Colonnes : REF | LIBELLES | (repère A à
    // H) | Note | Exercice N | Exercice N-1 ». Le modèle transcrit ne donne
    // aucun renvoi de note par ligne · la colonne existe, vide.
    const exportService = fabriquerExport();
    const { buffer } = await exportService.tableauFluxTresorerieExcel('t1', 'e1');
    const ws = (await ouvrir(buffer)).getWorksheet('TFT')!;
    expect([1, 2, 3, 4, 5, 6].map((c) => ws.getCell(8, c).value)).toEqual([
      'REF',
      'LIBELLES',
      'Rep.',
      'Note',
      'EXERCICE N',
      'EXERCICE N-1',
    ]);
    ws.eachRow((row, n) => {
      if (n > 8 && typeof row.getCell(1).value === 'string' && row.getCell(1).value !== '') {
        expect({ ref: row.getCell(1).value, note: row.getCell(4).value ?? null }).toEqual({ ref: row.getCell(1).value, note: null });
      }
    });
  });

  it('le TFT porte les bandes de sections et la ligne clef ZG sur bleu 003366', async () => {
    const exportService = fabriquerExport();
    const { buffer } = await exportService.tableauFluxTresorerieExcel('t1', 'e1');
    const ws = (await ouvrir(buffer)).getWorksheet('TFT')!;
    let rangZg = 0;
    let bandes = 0;
    ws.eachRow((row, n) => {
      if (row.getCell(1).value === 'ZG') rangZg = n;
      if (fondDe(row.getCell(2)) === 'FFC0C0C0' && row.getCell(1).value == null) bandes += 1;
    });
    expect(rangZg).toBeGreaterThan(8);
    expect(fondDe(ws.getCell(rangZg, 2))).toBe('FF003366');
    expect(bandes).toBeGreaterThanOrEqual(4);
  });
});

describe('liasse complète · le classeur entier du modèle', () => {
  it('reproduit les feuilles du modèle, dans son ordre, et boucle', async () => {
    const exportService = fabriquerExport();
    const { buffer, nomFichier } = await exportService.liasseCompleteExcel('t1', 'e1');
    expect(nomFichier).toBe('liasse-complete-2026.xlsx');
    const wb = await ouvrir(buffer);
    const noms = wb.worksheets.map((w) => w.name);

    // L'ossature du modèle, dans son ordre exact. Les feuilles de notes ne
    // varient PAS avec les données : toutes celles du jeu sont jointes,
    // celles que l'exercice ne chiffre pas portant la mention NEANT.
    expect(noms.slice(0, 13)).toEqual([
      'BALANCE N',
      'BALANCE N-1',
      'CONTROLE BALANCE',
      'Couverture',
      'Garde',
      'Fiche 1',
      'Fiche 2',
      'Bilan paysage',
      'Bilan-Actif',
      'Bilan-Passif',
      'Résultat',
      'TFT',
      'NOTES ANNEXES',
    ]);
    expect(noms.slice(-3)).toEqual(['TABLE COMMENTAIRE', 'CONTROLES', 'ANOMALIES']);
    const feuillesNotes = noms.slice(13, -3);
    for (const nom of feuillesNotes) expect(nom).toMatch(/^NOTE /);
    // Une seule feuille par code (les sous-tableaux s'empilent dessus), dans
    // l'ordre officiel de la fiche récapitulative · jamais « NOTE 13 » avant
    // « NOTE 2 », jamais de suffixe « .1 ».
    expect(new Set(feuillesNotes).size).toBe(feuillesNotes.length);
    const ORDRE = ['1', '2', '3', '4', '5A', '5B', '5C', '5D', '5E', '5F', '5G', '5H', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17A', '17B', '18A', '18B', '19', '20', '21', '22', '23', '24', '25', '26', '27', '28', '29A', '29B', '30', '31', '32', '33', '34', '35'];
    // TOUTES les notes du jeu sont jointes, dans l'ordre officiel · pas
    // d'option pour masquer les vides, elles portent la mention NEANT.
    expect(feuillesNotes).toEqual(ORDRE.map((c) => `NOTE ${c}`));

    const texteFeuille = (nom: string) => {
      const t: string[] = [];
      wb.getWorksheet(nom)!.eachRow((row) => row.eachCell((c) => t.push(String(c.value ?? ''))));
      return t;
    };
    // Vide dans cette balance (aucun compte de classe 3) · porte la mention.
    expect(texteFeuille('NOTE 8')).toContain('NEANT');
    // Chiffrée · ne doit surtout PAS la porter, sans quoi le filigrane
    // serait posé à l'aveugle et ne voudrait plus rien dire.
    expect(texteFeuille('NOTE 13')).not.toContain('NEANT');
    // HORS BALANCE ET VIDE (note 4, changements de méthodes) · depuis la
    // passe R2 (B1) elle est cochée N/A sur la fiche tant que le dossier n'y
    // a rien écrit, et sa feuille le dit par la mention NEANT plutôt que par
    // une grille vierge, qui se lirait comme une note documentée.
    expect(texteFeuille('NOTE 4')).toContain('NEANT');
    // La NOTE 2 porte la déclaration de conformité, toujours due (SYCEBNL
    // Partie 4 ch. 1) · ses rubriques s'impriment, sans NEANT.
    expect(texteFeuille('NOTE 2')).not.toContain('NEANT');
    expect(texteFeuille('NOTE 2')).toContain('A - IDENTITE, ORGANISATION');

    // BALANCE N · l'identité ouverture + mouvements = clôture, ligne à ligne.
    const bal = wb.getWorksheet(NOM_BALANCE)!;
    for (let r = 2; r <= 1 + BALANCE_N.length; r++) {
      const v = (c: number) => Number(bal.getCell(r, c).value ?? 0);
      expect(v(3) - v(4) + v(5) - v(6)).toBeCloseTo(v(7) - v(8), 2);
    }
    // TOTAL GENERAL en formule, sur bleu nuit.
    const rTotal = 2 + BALANCE_N.length;
    expect((bal.getCell(rTotal, 3).value as { formula?: string }).formula).toBe(`SUM(C2:C${rTotal - 1})`);
    expect(fondDe(bal.getCell(rTotal, 2))).toBe('FF000080');

    // Bilan paysage · chaque montant est un LIEN vers la feuille du bilan.
    const paysage = wb.getWorksheet('Bilan paysage')!;
    const lien = paysage.getCell(10, 4).value as { formula?: string };
    expect(lien.formula).toBe("'Bilan-Actif'!D10");

    // Fiche 1 · la case ZE porte l'acte de personnalité juridique, pas un RCCM.
    const fiche1 = wb.getWorksheet('Fiche 1')!;
    let zeValeur = '';
    fiche1.eachRow((row) => {
      if (row.getCell(1).value === 'ZE') zeValeur = String(row.getCell(7).value ?? '');
    });
    expect(zeValeur).toBe('Arrêté n° 087/CAB/MIN/J/2024');

    // Garde · bandeau du référentiel et système.
    const garde = wb.getWorksheet('Garde')!;
    expect(String(garde.getCell(12, 2).value)).toContain('SYCEBNL');
    expect(String(garde.getCell(32, 2).value)).toBe('SYSTEME NORMAL');

    // CONTROLES · les recoupements croisés du modèle, en formules.
    const ctl = wb.getWorksheet('CONTROLES')!;
    expect((ctl.getCell(2, 2).value as { formula?: string }).formula).toContain("'BALANCE N'!G2:G");
    // La trésorerie de clôture lue par CONTROLES est la cellule du MONTANT N
    // de ZG (colonne E depuis la colonne Note, passe R6), jamais la Note vide.
    const tftLiasse = wb.getWorksheet('TFT')!;
    let rangZgLiasse = 0;
    tftLiasse.eachRow((row, n) => {
      if (row.getCell(1).value === 'ZG') rangZgLiasse = n;
    });
    let formuleZg = '';
    ctl.eachRow((row) => {
      if (String(row.getCell(1).value).includes('(TFT, ZG)')) formuleZg = (row.getCell(2).value as { formula?: string }).formula ?? '';
    });
    expect(formuleZg).toBe(`TFT!E${rangZgLiasse}`);

    // Les pages porteuses de cartouche sont numérotées en continu.
    expect(wb.getWorksheet('Fiche 1')!.getCell('A1').value).toMatch(/^- \d+ -$/);

    // Copie d'inspection visuelle (scratchpad) · pas un artefact de test.
    if (process.env.LIASSE_DEBUG_SORTIE) writeFileSync(process.env.LIASSE_DEBUG_SORTIE, buffer);
  });
});

describe('liasse complète · jeu projets de développement', () => {
  it('une panne du tableau budgétaire fait tomber la liasse, sans grille vierge sous un motif faux (audit final F83)', async () => {
    const exportService = fabriquerExport(JeuEtatsFinanciersSycebnl.PROJETS_DEVELOPPEMENT);
    (exportService as unknown as { etatsFinanciersProjetBudgetService: { executionBudgetaire: jest.Mock } })
      .etatsFinanciersProjetBudgetService.executionBudgetaire = jest
      .fn()
      // Les notes, lues les premières (Promise.all), trouvent le repli
      // ordinaire · la panne ne frappe que la feuille de la liasse. Sans cela
      // elle remonterait par les notes, et le repli de la feuille ne serait
      // pas mis à l'épreuve (vu à la réinjection).
      .mockRejectedValueOnce(new AucunPlanABudgetsException('Aucun plan analytique à budgets.'))
      .mockRejectedValue(new Error('connexion perdue'));
    await expect(exportService.liasseCompleteExcel('t1', 'e1')).rejects.toThrow('connexion perdue');
  });


  it('la feuille NOTE 9 porte les montants de la note du bailleur, dans l’orientation de la maquette (passe R6, D13)', async () => {
    // La liasse imprimait à la place une route d'API et un nom de classe,
    // alors que le bilan y renvoie CA, DF et RA.
    const exportService = fabriquerExport(JeuEtatsFinanciersSycebnl.PROJETS_DEVELOPPEMENT);
    const projet = (exportService as unknown as { etatsFinanciersProjetService: EtatsFinanciersProjetService })
      .etatsFinanciersProjetService;
    const m = (decaisse: number, consomme: number) => ({ decaisse, consomme, soldeRestant: decaisse - consomme });
    projet.noteBailleur = jest.fn().mockResolvedValue({
      investissement: [{ bailleur: { id: 'b1', code: 'UE', nom: 'Union' }, ...m(900, 300) }],
      investissementNonAffecte: m(0, 0),
      totalInvestissement: m(900, 300),
      administration: [{ bailleur: { id: 'b1', code: 'UE', nom: 'Union' }, ...m(200, 150) }],
      administrationNonAffecte: m(0, 0),
      totalAdministration: m(200, 150),
      totalFondsDuBailleur: m(1100, 450),
    });
    const wb = await ouvrir((await exportService.liasseCompleteExcel('t1', 'e1')).buffer);
    const ws = wb.getWorksheet('NOTE 9')!;
    const valeurs: Record<string, unknown[]> = {};
    ws.eachRow((row) => {
      const libelle = row.getCell(1).value;
      if (typeof libelle === 'string') valeurs[libelle] = [2, 3, 4, 5, 6, 7].map((c) => row.getCell(c).value);
    });
    expect(ws.getCell(8, 2).value).toBe('UE · Union');
    expect(ws.getCell(8, 5).value).toBe('TOTAL');
    expect(valeurs["TOTAL FONDS D'INVESTISSEMENT"]).toEqual([900, 300, 600, 900, 300, 600]);
    expect(valeurs["TOTAL FONDS D'ADMINISTRATION"]).toEqual([200, 150, 50, 200, 150, 50]);
    expect(valeurs['TOTAL DES FONDS DU BAILLEUR']).toEqual([1100, 450, 650, 1100, 450, 650]);
  });

  it('GR additionne CHAQUE ligne FA et FB, dans les trois colonnes (passe R6, D9)', async () => {
    // Plusieurs bailleurs font plusieurs lignes FB (Guide d'application,
    // Application 21). Indexés par REF seul, les rangs ne gardaient que le
    // dernier FB · GR le perdait, et VII. CONTRÔLE sortait non nul dans le
    // classeur quand le serveur bouclait.
    const exportService = fabriquerExport(JeuEtatsFinanciersSycebnl.PROJETS_DEVELOPPEMENT);
    const projet = (exportService as unknown as { etatsFinanciersProjetService: EtatsFinanciersProjetService })
      .etatsFinanciersProjetService;
    const reel = projet.tableauEmploisRessources.bind(projet);
    projet.tableauEmploisRessources = (async (t: string, e: string) => {
      const er = await reel(t, e);
      const fa = er.lignes.findIndex((l) => l.ref === 'FA');
      const fb = (nom: string) => ({ ...er.lignes[fa], cle: `BAILLEUR:${nom}`, ref: 'FB', libelle: `Fonds reçus, Bailleur ${nom}` });
      er.lignes.splice(fa + 1, 0, fb('Beta'), fb('Gamma'));
      return er;
    }) as typeof projet.tableauEmploisRessources;
    const wb = await ouvrir((await exportService.liasseCompleteExcel('t1', 'e1')).buffer);
    const er = wb.getWorksheet('Emplois-Ressources')!;
    const rangsDe = (ref: string) => {
      const rangs: number[] = [];
      er.eachRow((row, n) => {
        if (row.getCell(1).value === ref) rangs.push(n);
      });
      return rangs;
    };
    const [fa] = rangsDe('FA');
    const fbs = rangsDe('FB');
    const [fc] = rangsDe('FC');
    const [fd] = rangsDe('FD');
    const [gr] = rangsDe('GR');
    expect(fbs).toHaveLength(2);
    for (const lettre of ['C', 'D', 'E']) {
      expect((er.getCell(gr, lettre.charCodeAt(0) - 64).value as { formula?: string }).formula).toBe(
        `${lettre}${fa}+(${fbs.map((n) => `${lettre}${n}`).join('+')})+${lettre}${fc}+${lettre}${fd}`,
      );
    }
  });

  it('reproduit le classeur du modèle projets, grille budgétaire vierge comprise', async () => {
    const exportService = fabriquerExport(JeuEtatsFinanciersSycebnl.PROJETS_DEVELOPPEMENT);
    const { buffer } = await exportService.liasseCompleteExcel('t1', 'e1');
    const wb = await ouvrir(buffer);
    const noms = wb.worksheets.map((w) => w.name);

    expect(noms.slice(0, 14)).toEqual([
      'BALANCE N',
      'BALANCE N-1',
      'CONTROLE BALANCE',
      'Couverture',
      'Garde',
      'Fiche 1',
      'Fiche 2',
      'Emplois-Ressources',
      'Execution budgetaire',
      'Reconciliation tresorerie',
      'Bilan paysage',
      'Bilan-Actif',
      'Bilan-Passif',
      'Compte Exploitation',
    ]);
    expect(noms.slice(-3)).toEqual(['TABLE COMMENTAIRE', 'CONTROLES', 'ANOMALIES']);
    expect(noms).toContain('NOTES ANNEXES');

    // Le jeu projets suit la même règle : ses 26 notes sont TOUTES jointes,
    // dans l'ordre officiel, les vides portant la mention NEANT.
    const ORDRE_PROJETS = ['1', '2', '3A', '3B', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20A', '20B', '21', '22', '23', '24'];
    const notesProjets = noms.filter((n) => n.startsWith('NOTE '));
    expect(notesProjets).toEqual(ORDRE_PROJETS.map((c) => `NOTE ${c}`));

    // Emplois-Ressources · la ligne GR est un total en formule, la colonne E
    // totalise C+D sur les lignes de détail.
    const er = wb.getWorksheet('Emplois-Ressources')!;
    let rangGr = 0;
    let rangFa = 0;
    er.eachRow((row, n) => {
      if (row.getCell(1).value === 'GR') rangGr = n;
      if (row.getCell(1).value === 'FA') rangFa = n;
    });
    expect((er.getCell(rangGr, 4).value as { formula?: string }).formula).toContain(`D${rangFa}`);
    expect((er.getCell(rangFa, 5).value as { formula?: string }).formula).toBe(`C${rangFa}+D${rangFa}`);

    /*
      LA COLONNE C EST REMPLIE, ET ELLE NE L'ÉTAIT PAS.
      « SOLDE CUMULE DEBUT EXERCICE N » est une colonne de la maquette
      officielle (Partie 4 ch. 3, Section 1). L'export la laissait vide avec
      une note renvoyant le cabinet à son suivi de projet hors logiciel · un
      classeur complet en apparence, dont un tiers des colonnes était à
      remplir à la main. Un `typeof` suffit : c'est la PRÉSENCE d'un nombre
      qui est en jeu, pas sa valeur.
    */
    expect(typeof er.getCell(rangFa, 3).value).toBe('number');

    /*
      ET SUR UN SOLDE DE TRÉSORERIE, LA COLONNE E PORTE SA VALEUR, PAS C+D.
      FX est « Fonds Bailleur en FIN exercice N ». Additionner le solde de fin
      de N-1 et celui de fin de N donnerait le double de l'encaisse, sur une
      ligne qui a l'air d'un total comme les autres · voir REFS_DE_SOLDE.
    */
    let rangFx = 0;
    er.eachRow((row, n) => {
      if (row.getCell(1).value === 'FX') rangFx = n;
    });
    expect(typeof er.getCell(rangFx, 5).value).toBe('number');

    // Réconciliation · B se lie au tableau emplois-ressources.
    const recon = wb.getWorksheet('Reconciliation tresorerie')!;
    let rangB = 0;
    recon.eachRow((row, n) => {
      if (row.getCell(2).value === 'B') rangB = n;
    });
    /*
      B PORTE LA VALEUR DU SERVEUR, COMME L'ÉCRAN ET L'EXPORT INDIVIDUEL.
      Passe R6, D9 et D10 · la liasse liait B à FA+FB+FC, D à FD et F à GU du
      tableau emplois-ressources. FD comprend le 77 (Application 21), que C
      montre déjà : G comptait les intérêts deux fois. Et sans ligne FB (ce
      jeu d'essai), B sortait « 'Emplois-Ressources'!Dundefined ». Le test
      d'avant exigeait la présence du lien (toContain), et passait dessus.
    */
    const reconServeur = await (
      exportService as unknown as {
        etatsFinanciersProjetBudgetService: EtatsFinanciersProjetBudgetService;
      }
    ).etatsFinanciersProjetBudgetService.reconciliationTresorerie('t1', 'e1', null);
    const valeurServeur = (rep: string) => reconServeur.lignes.find((l) => l.rep === rep)!.montant;
    expect(['B', 'C', 'D', 'F'].map((rep) => recon.getCell(rangDeRecon(recon, rep), 3).value)).toEqual(
      ['B', 'C', 'D', 'F'].map(valeurServeur),
    );
    // AUDIT FINAL F13 · sans saisie du repère H, la cellule le dit et I n'est
    // pas une formule qui lirait la cellule vide comme zéro.
    const rangDe = (rep: string) => {
      let n0 = 0;
      recon.eachRow((row, n) => {
        if (row.getCell(2).value === rep) n0 = n;
      });
      return n0;
    };
    expect([recon.getCell(rangDe('H'), 3).value, typeof recon.getCell(rangDe('I'), 3).value === 'object']).toEqual([
      'non renseigné',
      false,
    ]);

    // Exécution budgétaire vierge · les formules du modèle sont posées.
    const eb = wb.getWorksheet('Execution budgetaire')!;
    expect((eb.getCell(9, 6).value as { formula?: string }).formula).toBe('D9+E9');

    /*
      ET SON TOTAL RESTE UNE PLAGE.
      Le total du tableau n'additionne plus que les FEUILLES, les rubriques
      étant des sous-totaux · mais la grille VIERGE n'a aucune rubrique, et le
      cabinet la remplit à la main. Une somme énumérée cellule par cellule y
      ignorerait toute ligne insérée au milieu, et le total se désaccorderait
      en silence · exactement ce que ce classeur existe pour éviter.
    */
    let rangTotalEb = 0;
    eb.eachRow((row, n) => {
      if (row.getCell(2).value === 'TOTAL') rangTotalEb = n;
    });
    expect((eb.getCell(rangTotalEb, 3).value as { formula?: string }).formula).toMatch(/^SUM\(C\d+:C\d+\)$/);

    /*
      LE BILAN PORTE LE TITRE ET LES EN-TÊTES DE LA MAQUETTE (passe R6, D11).
      « BILAN » et « EXERCICE AU 31/12/N | EXERCICE AU 31/12/N-1 », sans
      « NET » · le moteur de ce jeu ne retranche aucun amortissement.
    */
    for (const nom of ['Bilan-Actif', 'Bilan-Passif']) {
      const b = wb.getWorksheet(nom)!;
      expect([b.getCell(7, 2).value, b.getCell(8, 4).value, b.getCell(8, 5).value, b.getCell(9, 4).value]).toEqual([
        'BILAN',
        'EXERCICE AU 31/12/N',
        'EXERCICE AU 31/12/N-1',
        '',
      ]);
    }

    // Compte Exploitation · les deux TJ du texte officiel restent affichés
    // TJ, et XC = XA - XB en formule.
    const ce = wb.getWorksheet('Compte Exploitation')!;
    const refs: string[] = [];
    const rangsCe = new Map<string, number>();
    ce.eachRow((row, n) => {
      const ref = row.getCell(1).value;
      if (typeof ref === 'string') {
        refs.push(ref);
        if (!rangsCe.has(ref)) rangsCe.set(ref, n);
      }
    });
    expect(refs.filter((x) => x === 'TJ')).toHaveLength(2);
    let rangXa = 0;
    let rangXb = 0;
    let rangXc = 0;
    ce.eachRow((row, n) => {
      if (row.getCell(1).value === 'XA') rangXa = n;
      if (row.getCell(1).value === 'XB') rangXb = n;
      if (row.getCell(1).value === 'XC') rangXc = n;
    });
    expect((ce.getCell(rangXc, 4).value as { formula?: string }).formula).toBe(`D${rangXa}-D${rangXb}`);

    /*
      XB CITE LES DOUZE LIGNES DE CHARGES, ET RETRANCHE LE PRODUIT H.A.O.
      Passe R6, D1 et D8 · les quatre lignes au REF dupliqué portaient les clés
      du moteur (TJ_PERSONNEL…) que la formule ne lit pas : XB sortait
      « D16+…+D22+0+0+0+0+D27 », sans les comptes 66, 67, 69 ni 82 à 88. Le
      TK Produits H.A.O. porte « + » au tableau officiel (Partie 4 ch. 3,
      l. 587), opposé aux charges : il se retranche.
    */
    const lignesCharges: number[] = [];
    ce.eachRow((row, n) => {
      if (n > rangXa && n < rangXb) lignesCharges.push(n);
    });
    expect(lignesCharges).toHaveLength(12);
    const rangProduitsHao = lignesCharges.find((n) => ce.getCell(n, 2).value === 'Produits H.A.O.')!;
    const attenduXb = lignesCharges
      .map((n, i) => `${i === 0 ? '' : n === rangProduitsHao ? '-' : '+'}D${n}`)
      .join('');
    expect((ce.getCell(rangXb, 4).value as { formula?: string }).formula).toBe(attenduXb);
    // Les renvois des quatre lignes au REF dupliqué : maquette 19, 20, 21 et
    // 22, au décalage d'un cran appliqué partout ailleurs.
    const noteDe = (libelle: string) =>
      ce.getCell(lignesCharges.find((n) => ce.getCell(n, 2).value === libelle)!, 3).value;
    expect(
      ['Charges de personnel', 'Frais financiers et charges assimilées', 'Dotations aux provisions', 'Produits H.A.O.'].map(
        noteDe,
      ),
    ).toEqual(['20A', '21', '22', '23']);
    // Libellés des totaux : ceux du modèle (Section 5, l. 160, 173, 174),
    // comme à l'écran (passe R6, D12).
    expect([ce.getCell(rangXa, 2).value, ce.getCell(rangXb, 2).value, ce.getCell(rangXc, 2).value]).toEqual([
      'REVENUS (Somme RA à RE)',
      'CHARGES DE FONCTIONNEMENT (Somme TA à TL)',
      "SOLDE DES OPERATIONS DE L'EXERCICE : XA-XB",
    ]);
    // RA ne renvoie qu'à la note 9 · la note 14 ne porte pas le 702.
    expect(ce.getCell(rangsCe.get('RA')!, 3).value).toBe('9');
  });
});

describe('liasse complète · Système minimal de trésorerie', () => {
  it('NOTE 2 · quantité et prix unitaire lus sur la campagne sont écrits, avec la source (audit final F85)', async () => {
    const exportService = fabriquerExport(JeuEtatsFinanciersSycebnl.SYSTEME_MINIMAL_TRESORERIE);
    (exportService as unknown as { etatsFinanciersSmtService: { note2Stocks: jest.Mock } }).etatsFinanciersSmtService.note2Stocks =
      jest.fn().mockResolvedValue({
        lignes: [{ reference: '31100000', designation: 'Riz (kg)', quantite: 12.5, prixUnitaire: 160, montant: 2000 }],
        valeurStockFinal: 2000,
        valeurStockInitial: 0,
        quantitesTenues: true,
        sourceQuantites: "Quantités et prix unitaires lus sur la campagne d'inventaire « Clôture » du 31/12/2026.",
        motifQuantites: '',
      });
    const wb = await ouvrir((await exportService.liasseCompleteExcel('t1', 'e1')).buffer);
    const ws = wb.getWorksheet('NOTE 2 STOCKS')!;
    let rang = 0;
    ws.eachRow((row, n) => {
      if (row.getCell(2).value === 'Riz (kg)') rang = n;
    });
    expect(rang).toBeGreaterThan(0);
    expect(ws.getCell(rang, 3).value).toBe(12.5);
    // Une quantité garde ses décimales · le format des montants l'arrondirait.
    expect(ws.getCell(rang, 3).numFmt).toBe('#,##0.###');
    expect(ws.getCell(rang, 4).value).toBe(160);
    expect(ws.getCell(rang, 5).value).toBe(2000);
    const textes: string[] = [];
    ws.eachRow((row) => row.eachCell((c) => typeof c.value === 'string' && textes.push(c.value)));
    expect(textes.join(' ')).toContain('« Clôture » du 31/12/2026');
  });

  it('reproduit le classeur du modèle SMT, notes 1 à 5 comprises', async () => {
    const exportService = fabriquerExport(JeuEtatsFinanciersSycebnl.SYSTEME_MINIMAL_TRESORERIE);
    const { buffer } = await exportService.liasseCompleteExcel('t1', 'e1');
    const wb = await ouvrir(buffer);
    const noms = wb.worksheets.map((w) => w.name);

    expect(noms).toEqual([
      'BALANCE N',
      // Le dossier synthétique porte un exercice antérieur : sa balance est
      // jointe, même vide · c'est l'existence de l'exercice qui commande.
      'BALANCE N-1',
      'CONTROLE BALANCE',
      'Couverture',
      'Garde',
      'Fiche 1',
      'Fiche 2',
      'Bilan paysage',
      'Bilan-Actif',
      'Bilan-Passif',
      'Résultat',
      'NOTES ANNEXES',
      'NOTE 1 IMMOBILISATIONS',
      'NOTE 2 STOCKS',
      'NOTE 3 CREANCES-DETTES',
      'NOTE 5 DOTATIONS',
      'NOTE 4 JOURNAL TRESORERIE',
      'TABLE COMMENTAIRE',
      'CONTROLES',
      'ANOMALIES',
    ]);

    // Bilan-Actif · GA…GE puis TOTAL ACTIF (GZ) en formule sur bleu nuit.
    const actif = wb.getWorksheet('Bilan-Actif')!;
    let rangGz = 0;
    actif.eachRow((row, n) => {
      if (row.getCell(1).value === 'GZ') rangGz = n;
    });
    expect(rangGz).toBeGreaterThan(8);
    expect((actif.getCell(rangGz, 4).value as { formula?: string }).formula).toMatch(/^SUM\(D9:D\d+\)$/);
    const fondGz = actif.getCell(rangGz, 2).fill as { fgColor?: { argb?: string } };
    expect(fondGz?.fgColor?.argb).toBe('FF000080');

    // Résultat · KZC en formule KZ + VA + VB - VC - JG.
    const cr = wb.getWorksheet('Résultat')!;
    const rangs = new Map<string, number>();
    cr.eachRow((row, n) => {
      const ref = row.getCell(1).value;
      if (typeof ref === 'string') rangs.set(ref, n);
    });
    expect((cr.getCell(rangs.get('KZC')!, 4).value as { formula?: string }).formula).toBe(
      `D${rangs.get('KZ')}+D${rangs.get('VA')}+D${rangs.get('VB')}-D${rangs.get('VC')}-D${rangs.get('JG')}`,
    );

    // NOTE 4 · le journal de la caisse ouvre sur son report à nouveau.
    const note4 = wb.getWorksheet('NOTE 4 JOURNAL TRESORERIE')!;
    let reportTrouve = false;
    note4.eachRow((row) => {
      if (row.getCell(2).value === 'Report à nouveau' && row.getCell(5).value === 50_000) reportTrouve = true;
    });
    expect(reportTrouve).toBe(true);
  });
});

/**
 * FICHE 1 · DATES EXACTES ET CHAMPS CONNUS (passe R3), dans les trois
 * liasses SYCEBNL. ZA était reconstituée de l'année (« 01-01-AAAA »), fausse
 * sur un premier exercice court ou long (AUDCIF art. 7, que l'art. 3 du
 * SYCEBNL n'écarte pas).
 */
describe('Fiche 1 des liasses SYCEBNL · ce que le dossier sait', () => {
  const JEUX = [
    JeuEtatsFinanciersSycebnl.ASSOCIATIONS_ORDRES_PROFESSIONNELS,
    JeuEtatsFinanciersSycebnl.PROJETS_DEVELOPPEMENT,
    JeuEtatsFinanciersSycebnl.SYSTEME_MINIMAL_TRESORERIE,
  ];

  function caseFiche1(wb: ExcelJS.Workbook, code: string): string {
    let valeur = '';
    wb.getWorksheet('Fiche 1')!.eachRow((row) => {
      if (row.getCell(1).value === code) valeur = String(row.getCell(7).value ?? '');
    });
    return valeur;
  }

  async function avec<T>(
    exercice: Record<string, unknown>,
    tenant: Record<string, unknown>,
    fn: () => Promise<T>,
  ): Promise<T> {
    const e1 = EXERCICES[0] as Record<string, unknown>;
    const t = TENANT as Record<string, unknown>;
    const avantE = { ...e1 };
    const avantT = { ...t };
    Object.assign(e1, exercice);
    Object.assign(t, tenant);
    try {
      return await fn();
    } finally {
      for (const k of Object.keys(e1)) delete e1[k];
      Object.assign(e1, avantE);
      for (const k of Object.keys(t)) delete t[k];
      Object.assign(t, avantT);
    }
  }

  it.each([
    ['court', '2026-04-01', 'DU : 01/04/2026    AU : 31/12/2026'],
    ['long', '2025-07-01', 'DU : 01/07/2025    AU : 31/12/2026'],
  ])('ZA porte les dates exactes d’un premier exercice %s, dans les trois jeux', async (_nom, debut, attendu) => {
    for (const jeu of JEUX) {
      const wb = await avec({ dateDebut: new Date(`${debut}T00:00:00Z`) }, {}, async () =>
        ouvrir((await fabriquerExport(jeu).liasseCompleteExcel('t1', 'e1')).buffer),
      );
      expect({ jeu, za: caseFiche1(wb, 'ZA') }).toEqual({ jeu, za: attendu });
    }
  });

  it('préremplit ZB, ZC, ZD, ZG, ZK et ZM dans les trois jeux, l’acte restant en ZE', async () => {
    for (const jeu of JEUX) {
      const wb = await avec(
        { dateArreteComptes: new Date('2027-03-15T00:00:00Z') },
        {
          numeroAffiliationCnssEmployeur: 'CNSS-0099',
          telephone: '+243 99 111 22 33',
          email: 'grace@asbl.cd',
          ville: 'Bukavu',
          activite: 'Appui aux écoles rurales',
        },
        async () => ouvrir((await fabriquerExport(jeu).liasseCompleteExcel('t1', 'e1')).buffer),
      );
      expect({
        jeu,
        ZB: caseFiche1(wb, 'ZB'),
        ZC: caseFiche1(wb, 'ZC'),
        ZD: caseFiche1(wb, 'ZD'),
        ZG: caseFiche1(wb, 'ZG'),
        ZK: caseFiche1(wb, 'ZK'),
        ZM: caseFiche1(wb, 'ZM'),
        ZE: caseFiche1(wb, 'ZE'),
      }).toEqual({
        jeu,
        ZB: '15/03/2027',
        ZC: '31/12/2025',
        ZD: '12',
        ZG: 'CNSS-0099',
        ZK: '+243 99 111 22 33 · grace@asbl.cd · Bukavu',
        ZM: 'Appui aux écoles rurales',
        ZE: 'Arrêté n° 087/CAB/MIN/J/2024',
      });
    }
  });

  it('une valeur absente laisse la case vide', async () => {
    const wb = await avec({}, { telephone: null, email: '  ', ville: null, activite: null }, async () =>
      ouvrir((await fabriquerExport().liasseCompleteExcel('t1', 'e1')).buffer),
    );
    expect(caseFiche1(wb, 'ZK')).toBe('');
    expect(caseFiche1(wb, 'ZM')).toBe('');
    expect(caseFiche1(wb, 'ZG')).toBe('');
  });
});

/**
 * PASSE R6 · le S.M.T SYCEBNL imprimé. Chaque test relit le classeur produit ·
 * la charge utile peut être juste et la feuille fausse.
 */
describe('S.M.T SYCEBNL · feuilles relues (passe R6)', () => {
  type ServiceSmt = Record<string, jest.Mock>;
  const smt = (e: ExportService) => (e as unknown as { etatsFinanciersSmtService: ServiceSmt }).etatsFinanciersSmtService;
  const textes = (ws: ExcelJS.Worksheet): string[] => {
    const t: string[] = [];
    ws.eachRow((row) => row.eachCell((c) => typeof c.value === 'string' && t.push(c.value)));
    return t;
  };
  const rangsParRef = (ws: ExcelJS.Worksheet) => {
    const rangs = new Map<string, number>();
    ws.eachRow((row, n) => {
      const ref = row.getCell(1).value;
      if (typeof ref === 'string') rangs.set(ref, n);
    });
    return rangs;
  };

  it('Résultat · le renvoi « 4 » sur KA à JF, rien sur JG (la maquette ne le porte pas)', async () => {
    const exportService = fabriquerExport(JeuEtatsFinanciersSycebnl.SYSTEME_MINIMAL_TRESORERIE);
    const wb = await ouvrir((await exportService.compteDeResultatSmtExcel('t1', 'e1')).buffer);
    const ws = wb.getWorksheet('Résultat')!;
    const rangs = rangsParRef(ws);
    for (const ref of ['KA', 'KB', 'JA', 'JB', 'JC', 'JD', 'JE', 'JF']) {
      expect([ref, ws.getCell(rangs.get(ref)!, 3).value]).toEqual([ref, '4']);
    }
    expect(ws.getCell(rangs.get('JG')!, 3).value ?? '').toBe('');
  });

  it('Résultat · la colonne EXERCICE N-1 est remplie et totalisée quand l’exercice N-1 existe', async () => {
    const exportService = fabriquerExport(JeuEtatsFinanciersSycebnl.SYSTEME_MINIMAL_TRESORERIE);
    const wb = await ouvrir((await exportService.liasseCompleteExcel('t1', 'e1')).buffer);
    const ws = wb.getWorksheet('Résultat')!;
    const rangs = rangsParRef(ws);
    // Le dossier synthétique porte un exercice 2025, vide · son comptable
    // vaut zéro, écrit, et non une cellule vide sous un en-tête qui promet.
    expect(ws.getCell(rangs.get('KA')!, 5).value).toBe(0);
    expect(ws.getCell(rangs.get('JG')!, 5).value).toBe(0);
    expect((ws.getCell(rangs.get('KZC')!, 5).value as { formula?: string }).formula).toBe(
      `E${rangs.get('KZ')}+E${rangs.get('VA')}+E${rangs.get('VB')}-E${rangs.get('VC')}-E${rangs.get('JG')}`,
    );
  });

  it('Résultat · sans exercice N-1, la colonne E reste vide, sans formule qui rendrait 0', async () => {
    const exportService = fabriquerExport(JeuEtatsFinanciersSycebnl.SYSTEME_MINIMAL_TRESORERIE);
    const service = smt(exportService);
    const reel = service.compteDeResultat.bind(service);
    service.compteDeResultat = jest.fn(async (t: string, e: string) => {
      const cr = await reel(t, e);
      const sansN1 = <T extends object>(l: T[]) => l.map((p) => ({ ...p, montantN1: undefined }));
      return { ...cr, recettes: sansN1(cr.recettes), depenses: sansN1(cr.depenses), retraitements: sansN1(cr.retraitements), exerciceN1Disponible: false };
    });
    const wb = await ouvrir((await exportService.compteDeResultatSmtExcel('t1', 'e1')).buffer);
    const ws = wb.getWorksheet('Résultat')!;
    const rangs = rangsParRef(ws);
    expect(ws.getCell(rangs.get('KA')!, 5).value ?? null).toBeNull();
    expect(ws.getCell(rangs.get('KZC')!, 5).value ?? null).toBeNull();
  });

  it('Bilan-Actif · imprime le renvoi (1) mot pour mot, celui que l’écran sert', async () => {
    const exportService = fabriquerExport(JeuEtatsFinanciersSycebnl.SYSTEME_MINIMAL_TRESORERIE);
    const wb = await ouvrir((await exportService.bilanSmtExcel('t1', 'e1')).buffer);
    expect(textes(wb.getWorksheet('Bilan-Actif')!)).toContain(RENVOI_IMMOBILISATIONS);
  });

  it('Fiche NOTES ANNEXES · chaque note est cochée A ou N/A, N/A pour chaque feuille NEANT', async () => {
    const exportService = fabriquerExport(JeuEtatsFinanciersSycebnl.SYSTEME_MINIMAL_TRESORERIE);
    const wb = await ouvrir((await exportService.liasseCompleteExcel('t1', 'e1')).buffer);
    const fiche = wb.getWorksheet('NOTES ANNEXES')!;
    const coche = new Map<string, 'A' | 'N/A'>();
    fiche.eachRow((row) => {
      const note = row.getCell(1).value;
      if (typeof note !== 'string' || !note.startsWith('Note ')) return;
      const a = row.getCell(9).value === 'X';
      const na = row.getCell(10).value === 'X';
      expect([note, a !== na]).toEqual([note, true]);
      coche.set(note, a ? 'A' : 'N/A');
    });
    // Le dossier synthétique : une caisse (note 4) et une dotation (note 5),
    // ni immobilisation, ni stock, ni tiers.
    expect(Object.fromEntries(coche)).toEqual({
      'Note 1': 'N/A',
      'Note 2': 'N/A',
      'Note 3': 'N/A',
      'Note 5': 'A',
      'Note 4': 'A',
    });
    // Et chaque note N/A est bien une feuille NEANT · fiche et feuilles se recoupent.
    for (const [note, feuille] of [
      ['Note 1', 'NOTE 1 IMMOBILISATIONS'],
      ['Note 2', 'NOTE 2 STOCKS'],
    ] as const) {
      expect(coche.get(note)).toBe('N/A');
      expect(textes(wb.getWorksheet(feuille)!).some((t) => /n[ée]ant/i.test(t))).toBe(true);
    }
  });

  it('NOTE 4 · une recette en « Autres » ne s’imprime pas sous « Autres » des dépenses (SYCEBNL et SYSCOHADA)', async () => {
    const exportService = fabriquerExport(JeuEtatsFinanciersSycebnl.SYSTEME_MINIMAL_TRESORERIE);
    const operation = (sens: 'RECETTE' | 'DEPENSE', autres: number) => ({
      date: new Date('2026-03-01'),
      libelle: sens === 'RECETTE' ? 'Don reçu' : 'Règlement fournisseur',
      reference: null,
      sens,
      recette: sens === 'RECETTE' ? autres : 0,
      depense: sens === 'DEPENSE' ? autres : 0,
      solde: 0,
      virementInterne: false,
      ventile: true,
      ventilation: { autres },
    });
    const journal = (colonne: (cle: string, libelle: string) => object) => ({
      journaux: [
        {
          compteId: 'c',
          numero: '57110000',
          intitule: 'Caisse',
          reportANouveau: 0,
          operations: [operation('RECETTE', 500), operation('DEPENSE', 200)],
          soldeAReporter: 300,
          totalRecettes: 500,
          totalDepenses: 200,
          lignesNonVentilees: 0,
          soldeBalance: 300,
          boucle: true,
        },
      ],
      colonnesRecettes: [colonne('cotisations', 'Cotisations'), colonne('autres', 'Autres')],
      colonnesDepenses: [colonne('salaires', 'Salaires'), colonne('autres', 'Autres')],
      nb: 'NB',
    });
    const prive = exportService as unknown as Record<string, (...a: unknown[]) => unknown> & {
      identiteLiasse: (t: string, e: string) => Promise<unknown>;
    };
    const ident = await prive.identiteLiasse('t1', 'e1');
    for (const [methode, colonne] of [
      ['feuilleJournalTresorerieEtafi', (cle: string, libelle: string) => ({ cle, libelle })],
      ['feuilleJournalTresorerieSmtSyscohadaEtafi', (cle: string, libelle: string) => ({ cle, libelle, rajoutAutorise: false })],
    ] as const) {
      const wb = new ExcelJS.Workbook();
      const ws = prive[methode].call(exportService, wb, journal(colonne), ident) as ExcelJS.Worksheet;
      // Colonnes : 6 Cotisations, 7 Autres (recettes), 8 Salaires, 9 Autres (dépenses).
      let rangRecette = 0;
      let rangDepense = 0;
      let rangBandeau = 0;
      ws.eachRow((row, n) => {
        if (row.getCell(2).value === 'Don reçu') rangRecette = n;
        if (row.getCell(2).value === 'Règlement fournisseur') rangDepense = n;
        if (row.getCell(6).value === 'Ventilation recettes') rangBandeau = n;
      });
      expect([methode, ws.getCell(rangRecette, 7).value]).toEqual([methode, 500]);
      expect([methode, ws.getCell(rangRecette, 9).value ?? null]).toEqual([methode, null]);
      expect([methode, ws.getCell(rangDepense, 9).value]).toEqual([methode, 200]);
      expect([methode, ws.getCell(rangDepense, 7).value ?? null]).toEqual([methode, null]);
      // Les deux groupes de la maquette nommés au-dessus des libellés.
      expect([methode, ws.getCell(rangBandeau, 8).value]).toEqual([methode, 'Ventilation dépenses']);
    }
  });

  it('NOTE 5 · l’intitulé officiel de la quatrième colonne, le motif des deux colonnes et le 106 hors rubriques', async () => {
    const exportService = fabriquerExport(JeuEtatsFinanciersSycebnl.SYSTEME_MINIMAL_TRESORERIE);
    smt(exportService).note5Dotation = jest.fn().mockResolvedValue({
      rubriques: [{ cle: 'nonConsomptible', libelle: 'Dotation non consomptible', montant: 5000, comptes: [] }],
      total: 5000,
      horsRubriques: [{ numero: '10611000', intitule: 'Écarts de réévaluation', montant: 900 }],
      totalHorsRubriques: 900,
      totalPosteHA: 5900,
      motifHorsRubriques: 'MOTIF 106',
      membres: [{ nom: 'Apporteur', nationalite: null, montant: 5000, precisionDroitEntree: null, numero: '45120000' }],
      nationaliteTenue: false,
      precisionDroitEntreeTenue: false,
      motifColonnesNonTenues: 'MOTIF DEUX COLONNES',
      motifMembres: 'MOTIF MEMBRES',
    });
    const wb = await ouvrir((await exportService.notesSmtExcel('t1', 'e1')).buffer);
    const ws = wb.getWorksheet('NOTE 5 DOTATIONS')!;
    expect(ws.getCell(8, 4).value).toBe("Préciser avec droit d'entrée ou sans droit d'entrée");
    const t = textes(ws);
    expect(t).toEqual(expect.arrayContaining(['MOTIF DEUX COLONNES', 'MOTIF MEMBRES', 'MOTIF 106']));
    let rangTotal = 0;
    let rangHa = 0;
    ws.eachRow((row, n) => {
      if (row.getCell(1).value === 'TOTAL') rangTotal = n;
      if (String(row.getCell(1).value ?? '').startsWith('POSTE HA')) rangHa = n;
    });
    // Le TOTAL de la maquette ne bouge pas ; le poste HA se lit dessous.
    expect(ws.getCell(rangTotal, 3).value).toBe(5000);
    expect(rangHa).toBeGreaterThan(rangTotal);
    expect(ws.getCell(rangHa, 3).value).toBe(5900);
  });

  it('NOTE 1 · total des seuls biens détenus, sorties à part, cautions et comptes non couverts nommés', async () => {
    const exportService = fabriquerExport(JeuEtatsFinanciersSycebnl.SYSTEME_MINIMAL_TRESORERIE);
    const bien = (designation: string, montant: number, sortie: string | null) => ({
      origine: 'REGISTRE' as const,
      dateMiseEnService: new Date('2024-02-01'),
      designation,
      montant,
      dateAcquisition: new Date('2024-02-01'),
      dureeUtiliteAns: 5,
      dateSortie: sortie ? new Date(sortie) : null,
      prixCession: sortie ? 100 : null,
    });
    smt(exportService).note1Immobilisations = jest.fn().mockResolvedValue({
      lignes: [
        bien('Véhicule', 3000, null),
        { ...bien('27510000 Cautions', 400, null), origine: 'BALANCE', dateMiseEnService: null, dateAcquisition: null, dureeUtiliteAns: null },
      ],
      sortiesDeLExercice: [bien('Ordinateur cédé', 900, '2026-06-30')],
      total: 3400,
      totalRegistre: 3000,
      totalCautions: 400,
      motifCautions: 'MOTIF CAUTIONS',
      ecartsGA: [{ numero: '24500000', intitule: 'Matériel', soldeBalance: 1000, valeurFiches: 0, ecart: 1000 }],
      fichesSansSolde: [],
      motifEcartsGA: 'MOTIF GA',
    });
    const wb = await ouvrir((await exportService.notesSmtExcel('t1', 'e1')).buffer);
    const ws = wb.getWorksheet('NOTE 1 IMMOBILISATIONS')!;
    const rangDe = (libelle: string) => {
      let rang = 0;
      ws.eachRow((row, n) => {
        if (String(row.getCell(2).value ?? '').startsWith(libelle)) rang = n;
      });
      return rang;
    };
    const total = rangDe('TOTAL DES BIENS DÉTENUS');
    expect(ws.getCell(total, 3).value).toBe(3400);
    // Le bien cédé est présenté APRÈS le total, jamais dedans.
    expect(rangDe('Ordinateur cédé')).toBeGreaterThan(total);
    // Une caution n'a pas de mise en service · pas de « Non mis en service ».
    expect(ws.getCell(rangDe('27510000'), 1).value ?? null).toBeNull();
    const t = textes(ws);
    expect(t).toEqual(expect.arrayContaining(['MOTIF CAUTIONS', 'MOTIF GA']));
    expect(t.some((x) => x.startsWith('24500000 Matériel') && x.includes('écart'))).toBe(true);
  });

  it('NOTE 3 · la dépréciation se lit en déduction des créances, puis les créances nettes (poste GC)', async () => {
    const exportService = fabriquerExport(JeuEtatsFinanciersSycebnl.SYSTEME_MINIMAL_TRESORERIE);
    const service = smt(exportService);
    const reel = service.note3CreancesDettes.bind(service);
    service.note3CreancesDettes = jest.fn(async (t: string, e: string) => ({
      ...(await reel(t, e)),
      depreciationsCreances: [
        { numero: '49120000', intitule: 'Créances douteuses', montantCloture: -300, montantOuverture: 0, variationValeur: -300 },
      ],
      totalDepreciationsCreances: -300,
      totalCreancesNettes: -300,
    }));
    const wb = await ouvrir((await exportService.notesSmtExcel('t1', 'e1')).buffer);
    const ws = wb.getWorksheet('NOTE 3 CREANCES-DETTES')!;
    let rangDep = 0;
    let rangNettes = 0;
    let rangDettes = 0;
    ws.eachRow((row, n) => {
      const b = String(row.getCell(2).value ?? '');
      if (b.startsWith('49120000')) rangDep = n;
      if (b.startsWith('CRÉANCES NETTES')) rangNettes = n;
      if (row.getCell(1).value === 'DETTES') rangDettes = n;
    });
    expect(ws.getCell(rangDep, 3).value).toBe(-300);
    expect(ws.getCell(rangNettes, 3).value).toBe(-300);
    // Dans le bloc des créances, jamais dans celui des dettes.
    expect(rangNettes).toBeLessThan(rangDettes);
  });
});
