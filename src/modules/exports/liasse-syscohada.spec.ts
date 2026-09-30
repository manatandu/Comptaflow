import { ClasseCompte, Referentiel, StatutEcriture, SystemeComptableSyscohada, TypeCompteDetailTotal } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { writeFileSync } from 'fs';
import { EcritureService } from '../comptabilite/ecriture.service';
import { ExerciceService } from '../exercice/exercice.service';
import { EtatsFinanciersSyscohadaService } from '../etats-financiers-syscohada/etats-financiers-syscohada.service';
import { EtatsFinanciersSmtSyscohadaService } from '../etats-financiers-syscohada/etats-financiers-smt-syscohada.service';
import { CODES_NOTES_CH6 } from '../etats-financiers-syscohada/correspondance-compte-resultat-syscohada';
import { NoteAnnexeService } from '../notes-annexes/note-annexe.service';
import { EtatsFinanciersProjetBudgetService } from '../etats-financiers/etats-financiers-projet-budget.service';
import { EtatsFinanciersService } from '../etats-financiers/etats-financiers.service';
import { PrismaService } from '../../common/prisma.service';
import { ExportService } from './export.service';
import { NOM_BALANCE } from './theme-etafi';

/**
 * LIASSE SYSCOHADA · vérification de bout en bout sur un dossier synthétique
 * ÉQUILIBRÉ. Les moteurs SYSCOHADA RÉELS (bilan du Titre IX ch. 3, compte de
 * résultat du ch. 4, tableau des flux du ch. 5, les 36 notes du ch. 6, et le
 * jeu du Titre X pour le Système minimal de trésorerie) tournent sur une
 * balance fabriquée, et l'export produit le classeur.
 *
 * Les contrôles portent sur ce qui casserait EN SILENCE : l'ordre et le nom
 * des feuilles, le cartouche, la palette (un vert de section qui devient gris
 * ne lèverait aucune erreur), les formules de totaux dans la convention de
 * signe du SYSCOHADA (les charges sont négatives, les soldes sont des SOMMES
 * · ne jamais soustraire deux fois), la présence des 36 notes dans l'ordre du
 * ch. 6, la bande NEANT d'une note non chiffrée, et l'identité
 * ouverture + mouvements = clôture de la feuille BALANCE N.
 *
 * Rien n'est repris du SYCEBNL : les comptes de la balance sont ceux du plan
 * SYSCOHADA semé (`compte-seed-syscohada.ts`).
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
    clotureDebit: 0,
    clotureCredit: 0,
    totalDebit: reportDebit + mouvementDebit,
    totalCredit: reportCredit + mouvementCredit,
    solde: reportDebit + mouvementDebit - reportCredit - mouvementCredit,
  };
}

/*
  SYSTÈME NORMAL · exercice N (2026), équilibré.

  Actif net    matériel 750 000 - amortissements 150 000 = 600 000
               clients 220 000, banque 285 000            = 1 105 000
  Passif       capital 800 000, fournisseurs 45 000,
               résultat 620 000 - 360 000 = 260 000       = 1 105 000

  Tous les numéros sont ceux du plan SYSCOHADA semé (compte-seed-syscohada.ts),
  complétés à huit chiffres selon la convention du dépôt (CLAUDE.md §7).
*/
const BALANCE_N: LigneBalanceStub[] = [
  ligne('10130000', 'Capital souscrit, appelé, versé, non amorti', ClasseCompte.CLASSE_1, 0, 800_000, 0, 0),
  ligne('24410000', 'Matériel de bureau', ClasseCompte.CLASSE_2, 600_000, 0, 150_000, 0),
  ligne('28440000', 'Amortissements du matériel et mobilier', ClasseCompte.CLASSE_2, 0, 100_000, 0, 50_000),
  ligne('41110000', 'Clients', ClasseCompte.CLASSE_4, 0, 0, 620_000, 400_000),
  ligne('40110000', 'Fournisseurs', ClasseCompte.CLASSE_4, 0, 0, 145_000, 190_000),
  ligne('52110000', 'Banques en monnaie nationale', ClasseCompte.CLASSE_5, 300_000, 0, 400_000, 415_000),
  ligne('60110000', 'Achats de marchandises dans la Région', ClasseCompte.CLASSE_6, 0, 0, 190_000, 0),
  ligne('66110000', 'Appointements salaires et commissions', ClasseCompte.CLASSE_6, 0, 0, 120_000, 0),
  ligne('68110000', 'Dotations aux amortissements d’exploitation', ClasseCompte.CLASSE_6, 0, 0, 50_000, 0),
  ligne('70110000', 'Ventes de marchandises dans la Région', ClasseCompte.CLASSE_7, 0, 0, 0, 620_000),
];

/** Exercice N-1 (2025) · le bilan d'ouverture de N, actif net = capital. */
const BALANCE_N1: LigneBalanceStub[] = [
  ligne('10130000', 'Capital souscrit, appelé, versé, non amorti', ClasseCompte.CLASSE_1, 0, 800_000, 0, 0),
  ligne('24410000', 'Matériel de bureau', ClasseCompte.CLASSE_2, 600_000, 0, 0, 0),
  ligne('28440000', 'Amortissements du matériel et mobilier', ClasseCompte.CLASSE_2, 0, 100_000, 0, 0),
  ligne('52110000', 'Banques en monnaie nationale', ClasseCompte.CLASSE_5, 300_000, 0, 0, 0),
];

/*
  SYSTÈME MINIMAL DE TRÉSORERIE · une caisse, des ventes encaissées, un achat
  payé. Caisse 230 000 = compte de l'exploitant 50 000 + résultat 180 000.
*/
const BALANCE_SMT_N: LigneBalanceStub[] = [
  ligne('10300000', 'Capital personnel', ClasseCompte.CLASSE_1, 0, 50_000, 0, 0),
  ligne('57110000', 'Caisse en monnaie nationale', ClasseCompte.CLASSE_5, 50_000, 0, 300_000, 120_000),
  ligne('60110000', 'Achats de marchandises dans la Région', ClasseCompte.CLASSE_6, 0, 0, 120_000, 0),
  ligne('70110000', 'Ventes de marchandises dans la Région', ClasseCompte.CLASSE_7, 0, 0, 0, 300_000),
];

/** Les deux écritures de trésorerie du dossier SMT · matière des lignes A et B. */
const compteStub = (numero: string, intitule: string) => ({ numero, intitule });
const ECRITURES_SMT = [
  {
    id: 'ec1',
    date: new Date('2026-03-01T00:00:00Z'),
    createdAt: new Date('2026-03-01T00:00:00Z'),
    libelle: 'Vente au comptant',
    reference: 'V-001',
    statut: StatutEcriture.VALIDEE,
    estGenereeParCloture: false,
    lignes: [
      {
        compteId: 'id-57110000',
        debit: 300_000,
        credit: 0,
        compte: compteStub('57110000', 'Caisse en monnaie nationale'),
      },
      {
        compteId: 'id-70110000',
        debit: 0,
        credit: 300_000,
        compte: compteStub('70110000', 'Ventes de marchandises dans la Région'),
      },
    ],
  },
  {
    id: 'ec2',
    date: new Date('2026-06-01T00:00:00Z'),
    createdAt: new Date('2026-06-01T00:00:00Z'),
    libelle: 'Achat de marchandises payé comptant',
    reference: 'A-001',
    statut: StatutEcriture.VALIDEE,
    estGenereeParCloture: false,
    lignes: [
      {
        compteId: 'id-60110000',
        debit: 120_000,
        credit: 0,
        compte: compteStub('60110000', 'Achats de marchandises dans la Région'),
      },
      {
        compteId: 'id-57110000',
        debit: 0,
        credit: 120_000,
        compte: compteStub('57110000', 'Caisse en monnaie nationale'),
      },
    ],
  },
];

const TENANT = {
  id: 't1',
  nom: 'SARL BATIMAT',
  referentiel: Referentiel.SYSCOHADA,
  systemeComptableSyscohada: SystemeComptableSyscohada.NORMAL,
  numeroImpot: 'A0900123X',
  // Une société commerciale EST immatriculée au RCCM, et l'AUDCG art. 14
  // impose d'en porter le numéro sur les livres de commerce.
  rccm: 'CD/KIN/RCCM/22-B-01234',
  adresse: '145 av. du Commerce',
  ville: 'Kinshasa',
  pays: 'RD Congo',
  devise: 'CDF',
};
const EXERCICES = [
  { id: 'e1', tenantId: 't1', dateDebut: new Date('2026-01-01T00:00:00Z'), dateFin: new Date('2026-12-31T00:00:00Z') },
  { id: 'e0', tenantId: 't1', dateDebut: new Date('2025-01-01T00:00:00Z'), dateFin: new Date('2025-12-31T00:00:00Z') },
];

/** Une cellule saisie des notes annexes, telle que la table `saisies_notes` la rend. */
type SaisieStub = { exerciceId: string; codeNote: string; cleRubrique: string; colonne: number; valeurTexte: string };

function fabriquerExport(
  systeme: SystemeComptableSyscohada = SystemeComptableSyscohada.NORMAL,
  saisies: SaisieStub[] = [],
  immobilisations: Array<Record<string, unknown>> = [],
  mandats: Array<Record<string, unknown>> = [],
): ExportService {
  const smt = systeme === SystemeComptableSyscohada.MINIMAL_TRESORERIE;
  const balances: Record<string, LigneBalanceStub[]> = smt
    ? { e1: BALANCE_SMT_N, e0: [] }
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
    tenant: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ ...TENANT, systemeComptableSyscohada: systeme }),
    },
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
    // La doublure honore l'exercice demandé · une saisie d'un autre exercice
    // ne doit pas sortir dans la liasse de celui-ci.
    // Registre des provisions vide · aucun passif éventuel à porter à la 16C / 18B (passe R2, B2).
    provisionRisqueCharge: { findMany: jest.fn().mockResolvedValue([]) },
    saisieNote: {
      findMany: jest.fn().mockImplementation(({ where }: { where: { exerciceId: string } }) =>
        Promise.resolve(
          saisies
            .filter((c) => c.exerciceId === where.exerciceId)
            .map(({ exerciceId: _e, ...c }) => ({ valeurNombre: null, ...c })),
        ),
      ),
    },
    compte: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
    ecriture: { findMany: jest.fn().mockResolvedValue(smt ? ECRITURES_SMT : []) },
    // `groupBy` sert la NOTE 3 du S.M.T, qui demande ses deux parts sommées à
    // la base (audit final F258) · aucune ligne datée dans ce jeu d'essai.
    ligneEcriture: { findMany: jest.fn().mockResolvedValue([]), groupBy: jest.fn().mockResolvedValue([]) },
    // Honore le dossier, la borne d'acquisition et l'exclusion des biens
    // sortis avant l'ouverture, comme la base (passe R6, E15).
    immobilisation: {
      findMany: jest.fn().mockImplementation(({ where }: any) =>
        Promise.resolve(
          immobilisations.filter((i: any) => {
            if (where?.tenantId !== 't1') return false;
            if (where.dateAcquisition?.lte && i.dateAcquisition > where.dateAcquisition.lte) return false;
            if (where.OR) {
              return where.OR.some((o: any) =>
                o.dateSortie === null ? i.dateSortie === null : i.dateSortie !== null && i.dateSortie >= o.dateSortie.gte,
              );
            }
            return true;
          }),
        ),
      ),
    },
    // Aucune campagne d'inventaire · la note 2 du SMT garde ses quantités vides.
    campagneInventaire: { findFirst: jest.fn().mockResolvedValue(null) },
    tiersCompte: { findMany: jest.fn().mockResolvedValue([]) },
    // Les mandats du contrôleur · la doublure honore le dossier et écarte les
    // mandats terminés par anticipation, comme la base (passe D3, A2).
    mandatAuditeur: {
      findMany: jest.fn().mockImplementation(({ where }: any) =>
        Promise.resolve(
          mandats
            .filter((m: any) => m.tenantId === where.tenantId && (where.finAnticipeeLe !== null || m.finAnticipeeLe === null))
            .sort((a: any, b: any) => b.premierExercice - a.premierExercice),
        ),
      ),
    },
    // Les RIB du dossier, bornés au dossier comme la base les bornerait · un
    // RIB d'un autre cabinet ne doit pas sortir en case ZW (passe R2, A7).
    ribBanque: {
      findMany: jest.fn().mockImplementation(({ where }: { where: { tenantId: string } }) =>
        Promise.resolve(
          [
            { tenantId: 't1', numeroCompte: '00011-0123456-78', iban: null, banque: { intitule: 'RAWBANK' } },
            { tenantId: 't1', numeroCompte: null, iban: 'CD0800011000123456789', banque: { intitule: 'EQUITY BCDC' } },
            { tenantId: 'autre', numeroCompte: '999', iban: null, banque: { intitule: 'VOISINE' } },
          ]
            .filter((r) => r.tenantId === where.tenantId)
            .map(({ tenantId: _t, ...r }) => r),
        ),
      ),
    },
  } as unknown as PrismaService;

  const syscohada = new EtatsFinanciersSyscohadaService(ecritureService, exerciceService);
  const smtSyscohada = new EtatsFinanciersSmtSyscohadaService(ecritureService, exerciceService, prisma);
  // Un dossier SYSCOHADA n'a aucune note d'exécution budgétaire (l'AUDCIF n'en
  // demande pas) · le service budgétaire n'est jamais appelé par ce chemin.
  const notes = new NoteAnnexeService(ecritureService, exerciceService, prisma, {
    executionBudgetaire: jest.fn(),
  } as unknown as EtatsFinanciersProjetBudgetService,
    // Idem pour la note 33 : elle n'existe que dans le jeu associations.
    { bilan: jest.fn(), compteDeResultat: jest.fn(), tableauFluxTresorerie: jest.fn() } as unknown as EtatsFinanciersService);
  return new ExportService(
    prisma,
    ecritureService,
    // Les moteurs SYCEBNL ne sont jamais appelés par un dossier SYSCOHADA :
    // s'ils l'étaient, l'accès à une propriété d'un objet vide ferait
    // échouer le test bruyamment, ce qui est exactement ce qu'on veut.
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

async function ouvrir(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  return wb;
}

const fondDe = (cell: ExcelJS.Cell): string => {
  const f = cell.fill as { pattern?: string; fgColor?: { argb?: string } } | undefined;
  return f?.fgColor?.argb ?? '';
};

/** Rang de chaque code REF de la colonne A d'une feuille d'état. */
function rangsParRef(ws: ExcelJS.Worksheet): Map<string, number> {
  const rangs = new Map<string, number>();
  ws.eachRow((row, n) => {
    const ref = row.getCell(1).value;
    if (typeof ref === 'string' && /^[A-Z]{2}$/.test(ref) && !rangs.has(ref)) rangs.set(ref, n);
  });
  return rangs;
}

function formuleDe(cell: ExcelJS.Cell): string {
  return (cell.value as { formula?: string })?.formula ?? '';
}

function texteFeuille(wb: ExcelJS.Workbook, nom: string): string[] {
  const t: string[] = [];
  wb.getWorksheet(nom)!.eachRow((row) => row.eachCell((c) => t.push(String(c.value ?? ''))));
  return t;
}

describe('exports SYSCOHADA individuels · charte ETAFI, état seul en valeurs', () => {
  it('le bilan tient sur Bilan-Actif et Bilan-Passif, cartouche, palette et renvois du ch. 3', async () => {
    const { buffer, nomFichier } = await fabriquerExport().bilanSyscohadaExcel('t1', 'e1');
    expect(nomFichier).toBe('bilan-syscohada-2026.xlsx');
    const wb = await ouvrir(buffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Bilan-Actif', 'Bilan-Passif']);

    const actif = wb.getWorksheet('Bilan-Actif')!;
    expect(actif.getCell('A3').value).toBe('Dénomination sociale : SARL BATIMAT');
    expect(String(actif.getCell('A5').value)).toContain("N° d'identification fiscale (NIF) : A0900123X");
    // Titre officiel du ch. 3, en Arial Black vert.
    expect(actif.getCell('B7').value).toBe('BILAN AU 31 DECEMBRE N');
    expect(actif.getCell('B7').font?.name).toBe('Arial Black');
    expect(actif.getCell('B7').font?.color?.argb).toBe('FF008000');
    // Bandeau d'en-têtes CCFFFF sur deux lignes · trois colonnes de montants
    // pour l'exercice N (BRUT, AMORT. et DÉPREC., NET) et une pour N-1.
    expect(fondDe(actif.getCell('A8'))).toBe('FFCCFFFF');
    expect(actif.getCell('D9').value).toBe('BRUT');
    expect(actif.getCell('E9').value).toBe('AMORT. et DEPREC.');
    expect(actif.getCell('G9').value).toBe('NET');

    const ra = rangsParRef(actif);
    // Les codes du modèle, sans les trous que le texte interdit de combler.
    expect([...ra.keys()]).toEqual([
      'AD', 'AE', 'AF', 'AG', 'AH',
      'AI', 'AJ', 'AK', 'AL', 'AM', 'AN',
      'AP', 'AQ', 'AR', 'AS', 'AZ',
      'BA', 'BB', 'BG', 'BH', 'BI', 'BJ', 'BK',
      'BQ', 'BR', 'BS', 'BT', 'BU', 'BZ',
    ]);
    // Renvois de notes du modèle · AD renvoie à la note 3, BS à la note 11.
    expect(actif.getCell(ra.get('AD')!, 3).value).toBe('3');
    expect(actif.getCell(ra.get('BS')!, 3).value).toBe('11');
    // NET = BRUT - AMORT. sur chaque ligne de détail.
    expect(formuleDe(actif.getCell(ra.get('AM')!, 6))).toBe(`D${ra.get('AM')}-E${ra.get('AM')}`);
    // Totaux en formules de somme, dans l'ordre du ch. 3.
    expect(formuleDe(actif.getCell(ra.get('AZ')!, 6))).toBe(
      `F${ra.get('AD')}+F${ra.get('AI')}+F${ra.get('AP')}+F${ra.get('AQ')}`,
    );
    // TOTAL GÉNÉRAL en bleu nuit, case REF laissée blanche.
    expect(fondDe(actif.getCell(ra.get('BZ')!, 2))).toBe('FF000080');
    expect(fondDe(actif.getCell(ra.get('BZ')!, 1))).toBe('');
    // Valeurs servies par le moteur : matériel brut 750 000, amortissements
    // 150 000 (magnitude positive).
    expect(actif.getCell(ra.get('AM')!, 4).value).toBe(750_000);
    expect(actif.getCell(ra.get('AM')!, 5).value).toBe(150_000);

    const passif = wb.getWorksheet('Bilan-Passif')!;
    const rp = rangsParRef(passif);
    expect(passif.getCell(rp.get('CJ')!, 4).value).toBe(260_000);
    // Le renvoi de CE reste « 3e », en minuscule · seul renvoi du bilan
    // écrit ainsi par le ch. 3, transcrit tel quel.
    expect(passif.getCell(rp.get('CE')!, 3).value).toBe('3e');
    expect(formuleDe(passif.getCell(rp.get('DZ')!, 4))).toBe(
      `D${rp.get('DF')}+D${rp.get('DP')}+D${rp.get('DT')}+D${rp.get('DV')}`,
    );
  });

  it('le compte de résultat suit la convention de signe du ch. 4 · les soldes sont des SOMMES', async () => {
    const { buffer } = await fabriquerExport().compteDeResultatSyscohadaExcel('t1', 'e1');
    const ws = (await ouvrir(buffer)).getWorksheet('Résultat')!;
    const r = rangsParRef(ws);

    // Les 42 lignes du modèle, produits et charges entrelacés.
    expect(r.has('TA')).toBe(true);
    expect(r.has('XI')).toBe(true);
    // Une charge est SERVIE EN NÉGATIF · c'est ce qui permet aux soldes
    // d'être de simples sommes (achats 190 000, salaires 120 000).
    expect(ws.getCell(r.get('RA')!, 4).value).toBe(-190_000);
    expect(ws.getCell(r.get('RK')!, 4).value).toBe(-120_000);
    expect(ws.getCell(r.get('TA')!, 4).value).toBe(620_000);
    // XA = Somme TA à RB, jamais TA - RA - RB.
    expect(formuleDe(ws.getCell(r.get('XA')!, 4))).toBe(`D${r.get('TA')}+D${r.get('RA')}+D${r.get('RB')}`);
    expect(formuleDe(ws.getCell(r.get('XD')!, 4))).toBe(`D${r.get('XC')}+D${r.get('RK')}`);
    // XE nomme RQP et TQP (ch. 33) · absents de ce dossier, ils valent 0.
    // Lus sur deux lettres, « RQP » donnait la cellule de RQ suivie d'un
    // « P », et la formule était illisible (audit final F89).
    expect(formuleDe(ws.getCell(r.get('XE')!, 4))).toBe(`D${r.get('XD')}+D${r.get('TJ')}+D${r.get('RL')}+0+0`);
    expect(formuleDe(ws.getCell(r.get('XI')!, 4))).toBe(
      `D${r.get('XG')}+D${r.get('XH')}+D${r.get('RQ')}+D${r.get('RS')}`,
    );
    // Le libellé d'un solde porte la formule telle que le modèle l'imprime.
    expect(ws.getCell(r.get('XA')!, 2).value).toBe('MARGE COMMERCIALE (Somme TA à RB)');
    // ANOMALIE n° 11 · le ch. 4 renvoie RK à une note « 27 » que le ch. 6 ne
    // connaît pas (il n'a que 27A et 27B) : le renvoi est développé, sans
    // quoi il pointerait sur une feuille absente du classeur.
    expect(ws.getCell(r.get('RK')!, 3).value).toBe('27A et 27B');
    // RL renvoie à « 3C & 28 », transcrit en deux codes.
    expect(ws.getCell(r.get('RL')!, 3).value).toBe('3C et 28');
    // RÉSULTAT NET sur bleu nuit.
    expect(fondDe(ws.getCell(r.get('XI')!, 2))).toBe('FF000080');
  });

  it('le contrôle sous le bilan nomme un compte à solder à la clôture, avec sa fiche (audit final F92)', async () => {
    const exportService = fabriquerExport();
    type Bilan = { comptesASolderALaCloture: Array<{ numero: string; intitule: string; montant: number; source: string }> };
    const syscohada = (exportService as unknown as { syscohada: { bilan: (t: string, e: string) => Promise<Bilan> } }).syscohada;
    const reel = syscohada.bilan.bind(syscohada);
    syscohada.bilan = async (t, e) => ({
      ...(await reel(t, e)),
      comptesASolderALaCloture: [{ numero: '10410000', intitule: 'Apports temporaires', montant: 300, source: 'Titre VII COMPTE 104' }],
    });
    const wb = await ouvrir((await exportService.bilanSyscohadaExcel('t1', 'e1')).buffer);
    expect(texteFeuille(wb, 'Bilan-Actif').join(' ')).toContain(
      'Comptes à solder à la clôture portant un solde : 10410000 (Titre VII COMPTE 104).',
    );
  });

  it('RQP, quand il est servi, garde sa colonne REF vide et entre dans XE (audit final F89)', async () => {
    const exportService = fabriquerExport();
    type Cr = { lignes: Array<{ ref: string; libelle: string; montant: number; comptes: unknown[]; notes: string[] }> };
    const syscohada = (exportService as unknown as { syscohada: { compteDeResultat: (t: string, e: string) => Promise<Cr> } })
      .syscohada;
    const reel = syscohada.compteDeResultat.bind(syscohada);
    syscohada.compteDeResultat = async (t, e) => {
      const cr = await reel(t, e);
      const i = cr.lignes.findIndex((l) => l.ref === 'XE');
      cr.lignes.splice(i, 0, { ref: 'RQP', libelle: 'Quote-part de résultat partagé', montant: -400, comptes: [], notes: [] });
      return cr;
    };
    const ws = (await ouvrir((await exportService.compteDeResultatSyscohadaExcel('t1', 'e1')).buffer)).getWorksheet('Résultat')!;
    let rangRqp = 0;
    ws.eachRow((row, n) => {
      if (row.getCell(2).value === 'Quote-part de résultat partagé') rangRqp = n;
    });
    expect(rangRqp).toBeGreaterThan(0);
    // Aucune clé interne en colonne REF · le ch. 33 ne donne aucun code.
    expect(ws.getCell(rangRqp, 1).value ?? '').toBe('');
    const r = rangsParRef(ws);
    expect(formuleDe(ws.getCell(r.get('XE')!, 4))).toBe(`D${r.get('XD')}+D${r.get('TJ')}+D${r.get('RL')}+D${rangRqp}+0`);
  });

  it('le TFT porte les clés A à H du modèle, ses bandes de sections et ses totaux en formules', async () => {
    const { buffer } = await fabriquerExport().tableauFluxTresorerieSyscohadaExcel('t1', 'e1');
    const ws = (await ouvrir(buffer)).getWorksheet('TFT')!;
    const r = rangsParRef(ws);

    expect(ws.getCell(8, 6).value).toBe('Clé');
    // Les huit clés du MODÈLE de la section 2 · F = D + E, G = B + C + F,
    // H = G + A (et non celles du schéma de la section 1, incohérent).
    for (const [ref, cle] of [
      ['ZA', 'A'],
      ['ZB', 'B'],
      ['ZC', 'C'],
      ['ZD', 'D'],
      ['ZE', 'E'],
      ['ZF', 'F'],
      ['ZG', 'G'],
      ['ZH', 'H'],
    ] as Array<[string, string]>) {
      expect(ws.getCell(r.get(ref)!, 6).value).toBe(cle);
    }
    expect(formuleDe(ws.getCell(r.get('ZB')!, 4))).toBe(
      `D${r.get('FA')}+D${r.get('FB')}+D${r.get('FC')}+D${r.get('FD')}+D${r.get('FE')}`,
    );
    expect(formuleDe(ws.getCell(r.get('ZF')!, 4))).toBe(`D${r.get('ZD')}+D${r.get('ZE')}`);
    expect(formuleDe(ws.getCell(r.get('ZH')!, 4))).toBe(`D${r.get('ZG')}+D${r.get('ZA')}`);
    // AUDIT FINAL F14 · e0 n'a pas d'exercice antérieur : ZA et les totaux
    // qui en dépendent restent VIDES en N-1, ni zéro ni formule qui lirait
    // la cellule vide comme zéro. FA, calculable, garde sa valeur.
    expect([ws.getCell(r.get('ZA')!, 5).value, ws.getCell(r.get('ZH')!, 5).value]).toEqual([null, null]);
    expect(typeof ws.getCell(r.get('FA')!, 5).value).toBe('number');
    // Lignes clefs (ouverture, variation, clôture) sur le bleu 003366.
    expect(fondDe(ws.getCell(r.get('ZH')!, 2))).toBe('FF003366');
    // Intitulés de rubrique intercalés, sur bande grise et sans code REF.
    let bandes = 0;
    ws.eachRow((row) => {
      if (fondDe(row.getCell(2)) === 'FFC0C0C0' && row.getCell(1).value == null) bandes += 1;
    });
    expect(bandes).toBeGreaterThanOrEqual(4);
  });
});

describe('liasse complète · Système normal SYSCOHADA', () => {
  it('le contrôle du TFT nomme les comptes tenus sans la subdivision que le tableau lit', () => {
    // Sans cette phrase, le classeur montre un écart de bouclage sans cause ·
    // un 481 générique n'est pas « non ventilé », il est trop agrégé.
    const message: string = (fabriquerExport() as unknown as {
      controlesTftSyscohada: (tft: unknown) => string;
    }).controlesTftSyscohada({
      controle: { coherent: false, tresorerieClotureParFlux: 1, tresorerieClotureParBilan: 2, ecart: 1 },
      comptesNonVentiles: [],
      postesNonCalculables: [],
      comptesTropAgreges: [{ numero: '48100000', intitule: 'x', montant: -5000, subdivisions: ['4811', '4812'] }],
    });
    expect(message).toContain('1 compte(s) tenu(s) sans la subdivision que le tableau lit : 48100000 (lu en 4811, 4812).');
  });

  it('reproduit le classeur du modèle, ses 36 notes et ses recoupements', async () => {
    const { buffer, nomFichier } = await fabriquerExport().liasseCompleteExcel('t1', 'e1');
    expect(nomFichier).toBe('liasse-complete-2026.xlsx');
    const wb = await ouvrir(buffer);
    const noms = wb.worksheets.map((w) => w.name);

    expect(noms.slice(0, 14)).toEqual([
      'BALANCE N',
      'BALANCE N-1',
      'CONTROLE BALANCE',
      'Couverture',
      'Garde',
      'Fiche 1',
      // La fiche R2 de l'AUDCIF, après la Fiche 1 (passe R2, A3).
      'Fiche R2',
      'Fiche 2',
      'Bilan paysage',
      'Bilan-Actif',
      'Bilan-Passif',
      'Résultat',
      'TFT',
      'NOTES ANNEXES',
    ]);
    expect(noms.slice(-3)).toEqual(['TABLE COMMENTAIRE', 'CONTROLES', 'ANOMALIES']);

    // LES 36 NOTES, dans l'ordre officiel du ch. 6 · 46 codes pour 36 numéros
    // de tête (3A à 3F, 15A/15B, 16A/16B/16B bis/16C, 27A/27B). Une seule
    // feuille par code, les sous-tableaux empilés dessus.
    const feuillesNotes = noms.slice(14, -3);
    expect(new Set(feuillesNotes).size).toBe(feuillesNotes.length);
    expect(feuillesNotes).toEqual(CODES_NOTES_CH6.map((c) => `NOTE ${c}`));
    expect(feuillesNotes).toContain('NOTE 16B bis');

    // Les notes que l'exercice ne chiffre pas portent la bande NEANT ; celles
    // qu'il chiffre ne doivent SURTOUT pas la porter, sans quoi le filigrane
    // serait posé à l'aveugle et ne voudrait plus rien dire.
    const avecNeant = feuillesNotes.filter((n) => texteFeuille(wb, n).includes('NEANT'));
    const sansNeant = feuillesNotes.filter((n) => !texteFeuille(wb, n).includes('NEANT'));
    expect(avecNeant.length).toBeGreaterThan(0);
    expect(sansNeant.length).toBeGreaterThan(0);
    // Passe R2, B1 · une note HORS BALANCE que le dossier n'a pas renseignée
    // sort NEANT, comme la fiche la coche N/A · la production (32) et les
    // informations sociales (35) d'une société qui n'y a rien écrit. La NOTE 2,
    // qui porte la déclaration de conformité, reste présentée sans NEANT.
    expect(avecNeant).toEqual(expect.arrayContaining(['NOTE 32', 'NOTE 35']));
    expect(sansNeant).toContain('NOTE 2');

    // BALANCE N · l'identité ouverture + mouvements = clôture, ligne à ligne.
    const bal = wb.getWorksheet(NOM_BALANCE)!;
    for (let r = 2; r <= 1 + BALANCE_N.length; r++) {
      const v = (c: number) => Number(bal.getCell(r, c).value ?? 0);
      expect(v(3) - v(4) + v(5) - v(6)).toBeCloseTo(v(7) - v(8), 2);
    }
    const rTotal = 2 + BALANCE_N.length;
    expect(formuleDe(bal.getCell(rTotal, 3))).toBe(`SUM(C2:C${rTotal - 1})`);
    expect(fondDe(bal.getCell(rTotal, 2))).toBe('FF000080');

    // Bilan paysage · chaque montant est un LIEN vers la feuille du bilan,
    // aucune re-saisie (c'est le « Modèle 1 » du ch. 3, mêmes rubriques et
    // mêmes codes que le modèle 2).
    expect(formuleDe(wb.getWorksheet('Bilan paysage')!.getCell(10, 4))).toBe("'Bilan-Actif'!D10");

    // Fiche 1 · la case ZE porte le RCCM du dossier (AUDCG art. 14).
    const fiche1 = wb.getWorksheet('Fiche 1')!;
    let ze = '';
    fiche1.eachRow((row) => {
      if (row.getCell(1).value === 'ZE') ze = String(row.getCell(7).value ?? '');
    });
    expect(ze).toBe('CD/KIN/RCCM/22-B-01234');
    expect(String(fiche1.getCell(8, 1).value)).toBe('SYSCOHADA - Système normal');

    // Garde · bandeau du référentiel et système.
    const garde = wb.getWorksheet('Garde')!;
    expect(String(garde.getCell(12, 2).value)).toContain('SYSTEME COMPTABLE OHADA (SYSCOHADA)');
    expect(String(garde.getCell(32, 2).value)).toBe('SYSTEME NORMAL');
    // Les cinq documents déposés du ch. 2 · pas de « projets », pas de SMT.
    expect(texteFeuille(wb, 'Garde')).toContain('Tableau des flux de trésorerie');

    // Couverture.
    expect(texteFeuille(wb, 'Couverture')).toContain('LIASSE SYSTEME NORMAL');

    // CONTROLES · les recoupements croisés, en formules.
    const ctl = wb.getWorksheet('CONTROLES')!;
    expect(formuleDe(ctl.getCell(2, 2))).toContain("'BALANCE N'!G2:G");
    const libelles: string[] = [];
    ctl.eachRow((row) => libelles.push(String(row.getCell(1).value ?? '')));
    expect(libelles).toContain('Écart de bouclage du TFT (doit être 0)');
    expect(libelles).toContain('Résultat net logé au bilan (CJ)');

    // ANOMALIES · le dossier boucle, donc aucune gravité BLOQUANT ni
    // A_TRAITER. Mais la feuille n'est pas vide pour autant : les postes que
    // la balance ne permet pas de chiffrer y sont DÉCLARÉS en INFO, jamais
    // servis à zéro ni tus.
    const gravites: string[] = [];
    wb.getWorksheet('ANOMALIES')!.eachRow((row, n) => {
      if (n > 1) gravites.push(String(row.getCell(1).value ?? ''));
    });
    expect(gravites).not.toContain('BLOQUANT');
    expect(gravites).not.toContain('A_TRAITER');
    expect(gravites).toContain('INFO');
    // AUDIT FINAL F14 · les cellules N-1 du TFT laissées vides y ont leur
    // motif, sous l'état et la colonne qui les portent.
    const etats: string[] = [];
    wb.getWorksheet('ANOMALIES')!.eachRow((row) => etats.push(String(row.getCell(3).value ?? '')));
    expect(etats).toContain('Tableau des flux · colonne N-1');

    // Pages porteuses de cartouche numérotées en continu.
    expect(fiche1.getCell('A1').value).toMatch(/^- \d+ -$/);

    if (process.env.LIASSE_SYSCOHADA_DEBUG_SORTIE) writeFileSync(process.env.LIASSE_SYSCOHADA_DEBUG_SORTIE, buffer);
  });
});

describe('liasse complète · Système minimal de trésorerie SYSCOHADA', () => {
  it('reproduit le classeur du Titre X · pas de TFT, notes 1 à 4, résultat G = C - D + E - F', async () => {
    const exportService = fabriquerExport(SystemeComptableSyscohada.MINIMAL_TRESORERIE);
    const { buffer } = await exportService.liasseCompleteExcel('t1', 'e1');
    const wb = await ouvrir(buffer);
    const noms = wb.worksheets.map((w) => w.name);

    expect(noms).toEqual([
      'BALANCE N',
      // L'exercice antérieur existe : sa balance est jointe, même vide.
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
      'NOTE 1 MATERIEL-CAUTIONS',
      'NOTE 2 STOCKS',
      'NOTE 3 CREANCES-DETTES',
      'NOTE 4 JOURNAL TRESORERIE',
      // Les deux journaux de suivi du ch. 3 (passe R2, C4).
      'JOURNAUX DE SUIVI',
      'TABLE COMMENTAIRE',
      'CONTROLES',
      'ANOMALIES',
    ]);
    // PAS de tableau des flux de trésorerie · le Titre X ch. 1 § 2 n'énumère
    // que trois documents et n'en donne aucune maquette, malgré l'art. 28.
    expect(noms).not.toContain('TFT');
    expect(String(wb.getWorksheet('Garde')!.getCell(32, 2).value)).toBe('SYSTEME MINIMAL DE TRESORERIE');

    // Bilan SMT · AUCUN code REF n'est imprimé (le Titre X n'en donne pas) ;
    // le total est une formule de somme sur les lignes de détail.
    const actif = wb.getWorksheet('Bilan-Actif')!;
    expect(actif.getCell(8, 1).value).toBe('ACTIF');
    expect(actif.getCell(9, 1).value).toBe('Immobilisations (1)');
    let rangTotalActif = 0;
    actif.eachRow((row, n) => {
      if (row.getCell(1).value === 'Total actif') rangTotalActif = n;
    });
    expect(formuleDe(actif.getCell(rangTotalActif, 3))).toBe(`SUM(C9:C${rangTotalActif - 1})`);

    // Compte de résultat SMT · A et B en sommes, C = A - B, G signée.
    const cr = wb.getWorksheet('Résultat')!;
    const rangs = new Map<string, number>();
    cr.eachRow((row, n) => {
      const v = row.getCell(1).value;
      if (typeof v === 'string') rangs.set(v, n);
    });
    const rA = rangs.get('TOTAL DES RECETTES SUR PRODUITS')!;
    const rB = rangs.get('TOTAL DÉPENSES SUR CHARGES')!;
    const rC = rangs.get('SOLDE : Excédent (+) ou insuffisance (–) de recettes (C = A – B)')!;
    const rG = rangs.get('RÉSULTAT EXERCICE (G = C – D + E – F)')!;
    expect(cr.getCell(rA, 5).value).toBe('A');
    expect(cr.getCell(rG, 5).value).toBe('G');
    expect(formuleDe(cr.getCell(rC, 3))).toBe(`C${rA}-C${rB}`);
    expect(formuleDe(cr.getCell(rG, 3))).toMatch(/^C\d+-\(C\d+\+C\d+\)\+\(C\d+\)-C\d+$/);
    // Les recettes et dépenses viennent des ÉCRITURES de trésorerie, pas de
    // la balance : vente encaissée 300 000, achat payé 120 000.
    const montants: number[] = [];
    cr.eachRow((row) => {
      const v = row.getCell(3).value;
      if (typeof v === 'number') montants.push(v);
    });
    expect(montants).toContain(300_000);
    expect(montants).toContain(120_000);

    // NOTE 4 · le journal ouvre sur un report à nouveau et se clôt sur un
    // solde à reporter, solde progressif en formules.
    const note4 = texteFeuille(wb, 'NOTE 4 JOURNAL TRESORERIE');
    expect(note4).toContain('Report à nouveau');
    expect(note4).toContain('Solde à reporter');

    // Une note sans ligne porte la bande NEANT (aucun stock dans ce dossier).
    expect(texteFeuille(wb, 'NOTE 2 STOCKS')).toContain('NEANT');
    // Journaux de suivi · aux colonnes du texte, NEANT en tenue de trésorerie
    // pure, la limite de la source dite sous eux (passe R2, C4).
    const suivi = texteFeuille(wb, 'JOURNAUX DE SUIVI');
    expect(suivi).toContain('Journal de suivi des créances impayées SMT');
    expect(suivi).toContain('Date paiement');
    expect(suivi).toContain('NEANT');

    // CONTROLES · les trois seuils de l'art. 13, jamais convertis.
    const ctlSmt = texteFeuille(wb, 'CONTROLES');
    expect(ctlSmt.some((t) => t.includes('Entités de négoce'))).toBe(true);
    expect(ctlSmt.some((t) => t.includes("ou l'équivalent dans l'unité monétaire"))).toBe(true);
  });
});

/**
 * LA FEUILLE BALANCE EST CELLE DONT LES ÉTATS SONT TIRÉS · sur un exercice
 * clos, avant l'écriture qui solde les classes 6 à 8 (régression de l'audit
 * final F4). Validée, cette écriture faisait sortir chaque charge à zéro et
 * le 13 porteur du résultat, pendant que la feuille Résultat publiait les
 * charges en entier. L'identité « ouverture + mouvements = clôture » reste
 * vraie ligne à ligne (audit final F5).
 */
describe('feuille BALANCE de la liasse · exercice clos', () => {
  it('rend les comptes de gestion avant leur solde, et retire le 13 que seule la clôture a mouvementé', async () => {
    const charge = {
      ...ligne('60110000', 'Achats', ClasseCompte.CLASSE_6, 0, 0, 3000, 0),
      clotureCredit: 3000,
      totalCredit: 3000,
      solde: 0,
    };
    const resultat = {
      ...ligne('13900000', 'Résultat net : perte', ClasseCompte.CLASSE_1, 0, 0, 0, 0),
      clotureDebit: 3000,
      totalDebit: 3000,
      solde: 3000,
    };
    const service = fabriquerExport();
    (service as unknown as { ecritureService: { balance: jest.Mock } }).ecritureService.balance = jest
      .fn()
      .mockResolvedValue({ lignes: [charge, resultat] });
    const lignes = await (
      service as unknown as { lignesBalanceLiasse: (t: string, e: string) => Promise<Record<string, number | string>[]> }
    ).lignesBalanceLiasse('t', 'e1');
    expect(lignes.map((l) => l.compte)).toEqual(['60110000']);
    const [l] = lignes as Record<string, number>[];
    expect(l.ouvertureDebit - l.ouvertureCredit + l.mouvementDebit - l.mouvementCredit).toBe(
      l.clotureDebit - l.clotureCredit,
    );
    expect({ mouvementDebit: l.mouvementDebit, mouvementCredit: l.mouvementCredit, clotureDebit: l.clotureDebit }).toEqual({
      mouvementDebit: 3000,
      mouvementCredit: 0,
      clotureDebit: 3000,
    });
  });
});

/**
 * FICHE 1 · DATES EXACTES ET CHAMPS CONNUS (passe R3). La case ZA était
 * reconstituée de l'année (« 01-01-AAAA »), si bien qu'un premier exercice de
 * neuf ou de dix-huit mois, que l'AUDCIF art. 7 admet, sortait avec des dates
 * fausses sous un cartouche qui donnait la vraie durée. Et la fiche, qui
 * promet des « champs connus pré-remplis », laissait vides des cases que le
 * dossier détient.
 */
describe('Fiche 1 de la liasse SYSCOHADA · ce que le dossier sait', () => {
  function caseFiche1(wb: ExcelJS.Workbook, code: string): string {
    let valeur = '';
    wb.getWorksheet('Fiche 1')!.eachRow((row) => {
      if (row.getCell(1).value === code) valeur = String(row.getCell(7).value ?? '');
    });
    return valeur;
  }

  /** Joue `fn` avec l'exercice e1 et le dossier retouchés, puis les rétablit. */
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
  ])('ZA porte les dates exactes d’un premier exercice %s (AUDCIF art. 7)', async (_nom, debut, attendu) => {
    for (const systeme of [SystemeComptableSyscohada.NORMAL, SystemeComptableSyscohada.MINIMAL_TRESORERIE]) {
      const wb = await avec({ dateDebut: new Date(`${debut}T00:00:00Z`) }, {}, async () =>
        ouvrir((await fabriquerExport(systeme).liasseCompleteExcel('t1', 'e1')).buffer),
      );
      expect(caseFiche1(wb, 'ZA')).toBe(attendu);
    }
  });

  it('préremplit ZB, ZC, ZD, ZG, ZK, ZM et le code activité en ZI, dans les deux liasses', async () => {
    for (const systeme of [SystemeComptableSyscohada.NORMAL, SystemeComptableSyscohada.MINIMAL_TRESORERIE]) {
      const wb = await avec(
        { dateArreteComptes: new Date('2027-03-15T00:00:00Z') },
        {
          numeroAffiliationCnssEmployeur: 'CNSS-0042',
          telephone: '+243 81 000 00 00',
          email: 'contact@batimat.cd',
          ville: 'Kinshasa',
          activite: 'Travaux de construction',
          codeActivitePrincipale: '030000',
        },
        async () => ouvrir((await fabriquerExport(systeme).liasseCompleteExcel('t1', 'e1')).buffer),
      );
      expect(caseFiche1(wb, 'ZB')).toBe('15/03/2027');
      // L'exercice précédent du dossier · e0, clos le 31/12/2025 sur douze mois.
      expect(caseFiche1(wb, 'ZC')).toBe('31/12/2025');
      expect(caseFiche1(wb, 'ZD')).toBe('12');
      expect(caseFiche1(wb, 'ZG')).toBe('CNSS-0042');
      expect(caseFiche1(wb, 'ZK')).toBe('+243 81 000 00 00 · contact@batimat.cd · Kinshasa');
      expect(caseFiche1(wb, 'ZM')).toBe('Travaux de construction');
      expect(caseFiche1(wb, 'ZI')).toBe('030000');
      // Le registre reste en ZE, inchangé.
      expect(caseFiche1(wb, 'ZE')).toBe('CD/KIN/RCCM/22-B-01234');
    }
  });

  it('la NOTE 36 imprimée nomme les codes par leur fiche de l’AUDCIF, et la case ZI de la Fiche 1', async () => {
    const wb = await ouvrir((await fabriquerExport().liasseCompleteExcel('t1', 'e1')).buffer);
    const texte = texteFeuille(wb, 'NOTE 36').join(' ');
    expect(texte).toContain('fiche R2 : ZK forme juridique');
    expect(texte).toContain('ZI');
  });

  it('sans exercice précédent ni arrêté, ZC et ZD restent vides et ZB le dit', async () => {
    const e0 = EXERCICES.splice(1, 1);
    try {
      const wb = await ouvrir((await fabriquerExport().liasseCompleteExcel('t1', 'e1')).buffer);
      expect(caseFiche1(wb, 'ZC')).toBe('');
      expect(caseFiche1(wb, 'ZD')).toBe('');
      expect(caseFiche1(wb, 'ZB')).toBe('Non renseignée');
      expect(caseFiche1(wb, 'ZI')).toBe('');
    } finally {
      EXERCICES.push(...e0);
    }
  });
});

describe('NOTE 1 · les sûretés réelles saisies sortent dans la liasse (passe O3, constat A1/D1)', () => {
  it('la sûreté écrite sur une ligne de dette chiffrée sort dans SA colonne, à côté du montant calculé', async () => {
    // Une case vide sous « Gages/autres » se lit « aucun gage » · la liasse
    // doit porter ce que le dossier a écrit, pas un blanc.
    const exportService = fabriquerExport(SystemeComptableSyscohada.NORMAL, [
      { exerciceId: 'e1', codeNote: '1', cleRubrique: 'dettes-garanties-fournisseurs', colonne: 4, valeurTexte: 'Gage sur stock' },
      // Même cellule, AUTRE exercice · ne doit pas sortir.
      { exerciceId: 'e0', codeNote: '1', cleRubrique: 'dettes-garanties-fournisseurs', colonne: 2, valeurTexte: 'Hypothèque 2025' },
    ]);
    const wb = await ouvrir((await exportService.notesSyscohadaExcel('t1', 'e1')).buffer);
    const ws = wb.getWorksheet('NOTE 1')!;
    let rang = 0;
    ws.eachRow((row, n) => {
      if (row.getCell(1).value === 'Fournisseurs et comptes rattachés' && rang === 0) rang = n;
    });
    expect(rang).toBeGreaterThan(0);
    const ligneDette = ws.getRow(rang);
    // Colonnes : A libellé, B « Note », C « Montant brut », D à F sûretés.
    expect(ligneDette.getCell(3).value).toBe(45_000);
    expect(ligneDette.getCell(6).value).toBe('Gage sur stock');
    expect(ligneDette.getCell(4).value).toBeNull();
    // La colonne « Note » ne se saisit pas : elle imprime le renvoi que la
    // spécification fixe à la ligne (passe R6, la note 17 ici).
    expect(ligneDette.getCell(2).value).toBe('17');
  });
});

/**
 * PASSE R2 · la liasse SYSCOHADA confrontée au Titre IX ch. 1 et 2 de l'AUDCIF.
 */
describe('Passe R2 · liasse SYSCOHADA et Titre IX ch. 2', () => {
  it('A1 · la fiche R4 porte en pied le renvoi (1) de l’AUDCIF, pas celui du SYCEBNL', async () => {
    for (const buffer of [
      (await fabriquerExport().liasseCompleteExcel('t1', 'e1')).buffer,
      (await fabriquerExport().notesSyscohadaExcel('t1', 'e1')).buffer,
    ]) {
      const texte = texteFeuille(await ouvrir(buffer), 'NOTES ANNEXES');
      expect(texte).toContain(
        '(1) Les Notes non documentées ne doivent pas être jointes aux états financiers. Leur contenu peut être amélioré par les entités.',
      );
    }
  });
});

describe('Passe R2, C2 · l’écart de G se décompose comme à l’écran', () => {
  it('nomme les écritures sans trésorerie, jamais les flux hors résultat qui ne participent pas à l’écart', () => {
    const texte: string = (fabriquerExport() as unknown as {
      decompositionEcartSmtSyscohada: (c: unknown) => string;
    }).decompositionEcartSmtSyscohada({
      residuel: 0,
      composantesEcart: { classe1: 0, classe2: 320_000, depreciationsTresorerie: 0, autresComptes: 0, dotations: 0 },
    });
    expect(texte).toContain('investissement enregistré sans passer par la trésorerie 320');
    expect(texte).toContain('résiduel 0.');
  });

  it('la feuille ANOMALIES et l’export du compte de résultat appellent cette décomposition', () => {
    // Propriété du câblage · les deux documents remis lisent le même texte.
    const source = require('fs').readFileSync(require('path').join(__dirname, 'export.service.ts'), 'utf8') as string;
    expect(source.match(/this\.decompositionEcartSmtSyscohada\(cr\.controle\)/g)?.length).toBe(2);
  });
});

describe('Passe R2, A2 · l’unité monétaire sur chaque page de la liasse', () => {
  it('le cartouche de Bilan-Actif, Résultat, TFT et des notes porte « Montants en CDF », sans écraser la date d’arrêté', async () => {
    const wb = await ouvrir((await fabriquerExport().liasseCompleteExcel('t1', 'e1')).buffer);
    for (const nom of ['Bilan-Actif', 'Bilan-Passif', 'Résultat', 'TFT', 'NOTES ANNEXES', 'NOTE 1']) {
      const ligne6: string[] = [];
      wb.getWorksheet(nom)!.getRow(6).eachCell((c) => ligne6.push(String(c.value ?? '')));
      expect({ nom, monnaie: ligne6.some((t) => t.includes('Montants en CDF')) }).toEqual({ nom, monnaie: true });
      expect({ nom, arrete: ligne6.some((t) => t.includes("Date d'arrêté des comptes non renseignée")) }).toEqual({
        nom,
        arrete: true,
      });
    }
  });
});

describe('Passe R2, A2 · page étroite', () => {
  it('sur trois colonnes, la monnaie suit la date d’arrêté dans la même cellule, jamais par-dessus', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { ecrireCartouche } = require('./theme-etafi') as typeof import('./theme-etafi');
    const ws = new ExcelJS.Workbook().addWorksheet('X');
    ecrireCartouche(
      ws,
      { entite: 'E', nif: '', exercice: '2026', dateDebut: '', dateFin: '', duree: '12', adresse: '', sigle: '', ntd: '', dateArrete: '15/03/2027', monnaie: 'CDF' },
      'P',
      3,
    );
    expect(String(ws.getCell(6, 3).value)).toBe('Comptes arrêtés le 15/03/2027 · Montants en CDF');
  });
});

describe('Passe R2, A4 et A5 · Fiche 2 et page de garde du Système normal SYSCOHADA', () => {
  it('A4 · la Fiche 2 porte les deux blocs de la fiche R3 et le renvoi (1) qui définit les dirigeants', async () => {
    const wb = await ouvrir((await fabriquerExport().liasseCompleteExcel('t1', 'e1')).buffer);
    const texte = texteFeuille(wb, 'Fiche 2');
    expect(texte).toContain('DIRIGEANTS (1)');
    expect(texte).toContain("MEMBRES DU CONSEIL D'ADMINISTRATION");
    expect(texte).toContain(
      '(1) Dirigeants = Président Directeur Général, Directeur Général, Administrateur Général, Gérant, Autres.',
    );
  });

  it('A5 · la page de garde porte les quatre mentions et la zone réservée à la DGI, rangs du bandeau inchangés', async () => {
    const wb = await ouvrir((await fabriquerExport().liasseCompleteExcel('t1', 'e1')).buffer);
    const texte = texteFeuille(wb, 'Garde');
    for (const m of ['REPUBLIQUE', 'MINISTERE', 'DIRECTION', 'CENTRE DE DEPOT DE']) expect(texte).toContain(m);
    expect(texte).toContain('Réservé à la Direction Générale des Impôts');
    expect(texte).toContain("Nom de l'agent de la DGI ayant réceptionné le dépôt");
    const garde = wb.getWorksheet('Garde')!;
    expect(String(garde.getCell(12, 2).value)).toContain('SYSTEME COMPTABLE OHADA (SYSCOHADA)');
    expect(String(garde.getCell(32, 2).value)).toBe('SYSTEME NORMAL');
  });

  it('A5 · la garde du S.M.T SYSCOHADA ne reçoit pas la contexture du Titre IX', async () => {
    const wb = await ouvrir(
      (await fabriquerExport(SystemeComptableSyscohada.MINIMAL_TRESORERIE).liasseCompleteExcel('t1', 'e1')).buffer,
    );
    expect(texteFeuille(wb, 'Garde')).toContain("Réservé à l'administration");
  });
});

describe('Passe R2, A7 · domiciliations bancaires en case ZW', () => {
  it('la Fiche 1 du Système normal porte les RIB du dossier, banque et numéro ou IBAN', async () => {
    const wb = await ouvrir((await fabriquerExport().liasseCompleteExcel('t1', 'e1')).buffer);
    let zw = '';
    wb.getWorksheet('Fiche 1')!.eachRow((row) => {
      if (row.getCell(1).value === 'ZW') zw = String(row.getCell(7).value ?? '');
    });
    expect(zw).toBe('RAWBANK 00011-0123456-78 · EQUITY BCDC CD0800011000123456789');
  });
});

describe('Passe R6, E15 · NOTE 1 du S.M.T SYSCOHADA dans le classeur', () => {
  it('le total ne porte que les biens détenus, le bien sorti dans l’exercice est présenté à part', async () => {
    const exportService = fabriquerExport(SystemeComptableSyscohada.MINIMAL_TRESORERIE, [], [
      { designation: 'Vitrine', valeurOrigine: 400_000, compteImmobilisationId: 'id-24440000', dateAcquisition: new Date('2025-03-01'), dateSortie: null, prixCession: null },
      { designation: 'Balance cédée', valeurOrigine: 150_000, compteImmobilisationId: 'id-24440000', dateAcquisition: new Date('2024-03-01'), dateSortie: new Date('2026-05-31'), prixCession: 60_000 },
    ]);
    const wb = await ouvrir((await exportService.notesSmtSyscohadaExcel('t1', 'e1')).buffer);
    const ws = wb.getWorksheet('NOTE 1 MATERIEL-CAUTIONS')!;
    let rangTotal = 0;
    let rangSorties = 0;
    let rangCede = 0;
    ws.eachRow((row, n) => {
      if (row.getCell(2).value === 'TOTAL DES BIENS DÉTENUS À LA CLÔTURE') rangTotal = n;
      if (row.getCell(1).value === "Biens sortis pendant l'exercice · hors du total") rangSorties = n;
      if (row.getCell(2).value === 'Balance cédée') rangCede = n;
    });
    expect(ws.getCell(rangTotal, 3).value).toBe(400_000);
    expect(rangSorties).toBeGreaterThan(rangTotal);
    expect(rangCede).toBeGreaterThan(rangSorties);
    expect(ws.getCell(rangCede, 5).value).toBe(60_000);
    // Aucune écriture 24 dans ce jeu d'essai · la fiche détenue est nommée
    // sans solde, le rapprochement est dit sous la note.
    expect(texteFeuille(wb, 'NOTE 1 MATERIEL-CAUTIONS').join(' ')).toContain('Fiche sans solde au compte : Vitrine');
  });
});

describe('Passe D3, A2 · commissaire aux comptes en case ZR de la Fiche 1', () => {
  const caseFiche = async (mandats: Array<Record<string, unknown>>) => {
    const wb = await ouvrir((await fabriquerExport(SystemeComptableSyscohada.NORMAL, [], [], mandats).liasseCompleteExcel('t1', 'e1')).buffer);
    let zr = '';
    wb.getWorksheet('Fiche 1')!.eachRow((row) => {
      if (row.getCell(1).value === 'ZR') zr = String(row.getCell(7).value ?? '');
    });
    return zr;
  };

  it('préremplit le mandat qui couvre l’exercice, jamais un mandat échu, terminé ou d’un autre dossier', async () => {
    const zr = await caseFiche([
      { tenantId: 't1', nom: 'Cabinet Ancien', inscriptionOrdre: 'ONEC-001', premierExercice: 2020, nombreExercices: 3, finAnticipeeLe: null },
      { tenantId: 't1', nom: 'Cabinet Révoqué', inscriptionOrdre: 'ONEC-009', premierExercice: 2026, nombreExercices: 3, finAnticipeeLe: new Date('2026-04-01') },
      { tenantId: 't1', nom: 'Cabinet Kasongo', inscriptionOrdre: 'ONEC-042', premierExercice: 2025, nombreExercices: 3, finAnticipeeLe: null },
      { tenantId: 'autre', nom: 'Voisin', inscriptionOrdre: 'ONEC-777', premierExercice: 2026, nombreExercices: 6, finAnticipeeLe: null },
    ]);
    expect(zr).toBe("Cabinet Kasongo · inscription à l'Ordre : ONEC-042");
  });

  it('sans mandat couvrant, la case reste vide', async () => {
    expect(
      await caseFiche([{ tenantId: 't1', nom: 'Cabinet Ancien', inscriptionOrdre: 'ONEC-001', premierExercice: 2020, nombreExercices: 3, finAnticipeeLe: null }]),
    ).toBe('');
  });
});


describe('Passe R2, C5 · la NOTE 4 du S.M.T SYSCOHADA est un journal mensuel', () => {
  it('un bloc par mois mouvementé, titré comme le texte, le report d’un mois étant le solde à reporter du précédent', async () => {
    const wb = await ouvrir((await fabriquerExport(SystemeComptableSyscohada.MINIMAL_TRESORERIE).notesSmtSyscohadaExcel('t1', 'e1')).buffer);
    const ws = wb.getWorksheet('NOTE 4 JOURNAL TRESORERIE')!;
    const rangs = (texte: string, col: number) => {
      const t: number[] = [];
      ws.eachRow((row, n) => {
        if (row.getCell(col).value === texte) t.push(n);
      });
      return t;
    };
    const [mars] = rangs('Journal de trésorerie SMT · mois de mars Année 2026', 1);
    const [juin] = rangs('Journal de trésorerie SMT · mois de juin Année 2026', 1);
    expect(mars).toBeGreaterThan(0);
    expect(juin).toBeGreaterThan(mars);
    const reports = rangs('Report à nouveau', 2);
    const soldes = rangs('Solde à reporter', 2);
    expect(reports.length).toBe(2);
    expect(soldes.length).toBe(2);
    // Le premier report est l'ouverture, le second relit le solde de mars.
    expect(ws.getCell(reports[0], 5).value).toBe(50_000);
    expect(formuleDe(ws.getCell(reports[1], 5))).toBe(`E${soldes[0]}`);
  });
});

describe('Passe R2, A3 et B6 · fiche R2 du Système normal SYSCOHADA', () => {
  const caseR2 = (wb: ExcelJS.Workbook, code: string) => {
    let v = '';
    wb.getWorksheet('Fiche R2')!.eachRow((row) => {
      if (row.getCell(1).value === code && !v) v = String(row.getCell(7).value ?? '');
    });
    return v;
  };

  it('lit ZK, ZL et ZM dans les rubriques en saisie de la NOTE 36, seul porteur des codes', async () => {
    const exportService = fabriquerExport(SystemeComptableSyscohada.NORMAL, [
      { exerciceId: 'e1', codeNote: '36', cleRubrique: '1-code-forme-juridique-1', colonne: 0, valeurTexte: '12' },
      { exerciceId: 'e1', codeNote: '36', cleRubrique: '2-code-regime-fiscal', colonne: 0, valeurTexte: '1' },
      { exerciceId: 'e1', codeNote: '36', cleRubrique: '3-code-pays-du-siege-social-2', colonne: 0, valeurTexte: '17' },
    ]);
    const wb = await ouvrir((await exportService.liasseCompleteExcel('t1', 'e1')).buffer);
    expect(caseR2(wb, 'ZK')).toBe('12');
    expect(caseR2(wb, 'ZL')).toBe('1');
    expect(caseR2(wb, 'ZM')).toBe('17');
  });

  it('non déclarés, rien n’est présumé · ZK proposé en clair pour une forme univoque, ZL et ZM non renseignés', async () => {
    // La doublure du tenant ne porte pas de forme · SARL posée ici.
    const e = fabriquerExport();
    const prisma = (e as unknown as { prisma: { tenant: { findUniqueOrThrow: jest.Mock } } }).prisma;
    prisma.tenant.findUniqueOrThrow.mockResolvedValue({ ...TENANT, formeJuridiqueSyscohada: 'SOCIETE_RESPONSABILITE_LIMITEE' });
    const wb = await ouvrir((await e.liasseCompleteExcel('t1', 'e1')).buffer);
    expect(caseR2(wb, 'ZK')).toBe('Non renseigné · la NOTE 36 donne 02 (12 avec agrément prioritaire)');
    expect(caseR2(wb, 'ZL')).toBe('Non renseigné · à déclarer à la NOTE 36');
    const texte = texteFeuille(wb, 'Fiche R2');
    expect(texte).toContain("Contrôle de l'entreprise : entreprise sous contrôle privé national [texte officiel : code ZQ employé deux fois]");
    expect(texte).toContain('(3) Rayer la mention inutile (utiliser de préférence la VA).');
  });

  it('une SA n’est jamais codée d’office · 00 ou 01 dépend d’une participation publique que le dossier ne porte pas', async () => {
    const e = fabriquerExport();
    const prisma = (e as unknown as { prisma: { tenant: { findUniqueOrThrow: jest.Mock } } }).prisma;
    prisma.tenant.findUniqueOrThrow.mockResolvedValue({ ...TENANT, formeJuridiqueSyscohada: 'SOCIETE_ANONYME' });
    const wb = await ouvrir((await e.liasseCompleteExcel('t1', 'e1')).buffer);
    expect(caseR2(wb, 'ZK')).toBe('Non renseigné · à déclarer à la NOTE 36');
  });

  it('le CA HT et la VA de la liasse sont relus sur la feuille Résultat, par leur code REF', async () => {
    const wb = await ouvrir((await fabriquerExport().liasseCompleteExcel('t1', 'e1')).buffer);
    const ws = wb.getWorksheet('Fiche R2')!;
    const formules: string[] = [];
    ws.eachRow((row) => {
      const f = (row.getCell(7).value as { formula?: string } | null)?.formula;
      if (f) formules.push(f);
    });
    expect(formules).toEqual([
      `INDEX('Résultat'!D:D,MATCH("XB",'Résultat'!A:A,0))`,
      `INDEX('Résultat'!D:D,MATCH("XC",'Résultat'!A:A,0))`,
    ]);
    // La colonne D de la feuille Résultat porte bien le montant de N sur XB.
    const rangs = rangsParRef(wb.getWorksheet('Résultat')!);
    expect(wb.getWorksheet('Résultat')!.getCell(rangs.get('XB')!, 4).value).not.toBeNull();
    expect(wb.getWorksheet('Résultat')!.getCell(8, 4).value).toBe('EXERCICE AU 31/12/N');
  });

  it('le S.M.T SYSCOHADA ne reçoit pas de fiche R2 · le Titre X n’en porte pas', async () => {
    const wb = await ouvrir(
      (await fabriquerExport(SystemeComptableSyscohada.MINIMAL_TRESORERIE).liasseCompleteExcel('t1', 'e1')).buffer,
    );
    expect(wb.worksheets.map((w) => w.name)).not.toContain('Fiche R2');
  });
});

