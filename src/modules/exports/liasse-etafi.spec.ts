import { ClasseCompte, JeuEtatsFinanciersSycebnl, TypeCompteDetailTotal } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { writeFileSync } from 'fs';
import { EcritureService } from '../comptabilite/ecriture.service';
import { ExerciceService } from '../exercice/exercice.service';
import { EtatsFinanciersService } from '../etats-financiers/etats-financiers.service';
import { EtatsFinanciersProjetService } from '../etats-financiers/etats-financiers-projet.service';
import { EtatsFinanciersProjetBudgetService } from '../etats-financiers/etats-financiers-projet-budget.service';
import { EtatsFinanciersSmtService } from '../etats-financiers/etats-financiers-smt.service';
import { NoteAnnexeService } from '../notes-annexes/note-annexe.service';
import { PrismaService } from '../../common/prisma.service';
import { ExportService } from './export.service';
import { NOM_BALANCE } from './theme-etafi';

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
      findFirst: jest.fn().mockImplementation(({ where }: { where: { dateDebut?: { lt: Date } } }) => {
        if (where?.dateDebut?.lt) {
          const avant = EXERCICES.filter((e) => e.dateDebut < where.dateDebut!.lt);
          avant.sort((a, b) => b.dateDebut.getTime() - a.dateDebut.getTime());
          return Promise.resolve(avant[0] ?? null);
        }
        return Promise.resolve(EXERCICES[0]);
      }),
    },
    rattachementNote: { findMany: jest.fn().mockResolvedValue([]) },
    compte: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
    ecriture: { findMany: jest.fn().mockResolvedValue([]) },
    ligneEcriture: { findMany: jest.fn().mockResolvedValue([]) },
    bailleur: { findMany: jest.fn().mockResolvedValue([]) },
    // Pas de plan analytique à budgets · la liasse projets doit servir la
    // grille VIERGE du modèle, jamais échouer.
    planAnalytique: { findFirst: jest.fn().mockResolvedValue(null) },
    immobilisation: { findMany: jest.fn().mockResolvedValue([]) },
    tiersCompte: { findMany: jest.fn().mockResolvedValue([]) },
  } as unknown as PrismaService;

  const etatsFinanciers = new EtatsFinanciersService(ecritureService, exerciceService);
  const etatsProjet = new EtatsFinanciersProjetService(ecritureService, exerciceService, prisma);
  const budgetProjet = new EtatsFinanciersProjetBudgetService(ecritureService, prisma);
  const etatsSmt = new EtatsFinanciersSmtService(ecritureService, exerciceService, prisma);
  const notes = new NoteAnnexeService(ecritureService, exerciceService, prisma);
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
    // HORS BALANCE (note 4, changements de méthodes) : en saisie par nature,
    // elle présente ses rubriques vierges à remplir · un NEANT y préjugerait
    // de la réponse du préparateur.
    expect(texteFeuille('NOTE 4')).not.toContain('NEANT');

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

    // Les pages porteuses de cartouche sont numérotées en continu.
    expect(wb.getWorksheet('Fiche 1')!.getCell('A1').value).toMatch(/^- \d+ -$/);

    // Copie d'inspection visuelle (scratchpad) · pas un artefact de test.
    if (process.env.LIASSE_DEBUG_SORTIE) writeFileSync(process.env.LIASSE_DEBUG_SORTIE, buffer);
  });
});

describe('liasse complète · jeu projets de développement', () => {
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

    // Réconciliation · B se lie au tableau emplois-ressources.
    const recon = wb.getWorksheet('Reconciliation tresorerie')!;
    let rangB = 0;
    recon.eachRow((row, n) => {
      if (row.getCell(2).value === 'B') rangB = n;
    });
    expect((recon.getCell(rangB, 3).value as { formula?: string }).formula).toContain("'Emplois-Ressources'!D");

    // Exécution budgétaire vierge · les formules du modèle sont posées.
    const eb = wb.getWorksheet('Execution budgetaire')!;
    expect((eb.getCell(9, 6).value as { formula?: string }).formula).toBe('D9+E9');

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
  });
});

describe('liasse complète · Système minimal de trésorerie', () => {
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
