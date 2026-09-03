import { ClasseCompte, Referentiel, StatutEcriture, SystemeComptableSyscohada, TypeCompteDetailTotal } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { writeFileSync } from 'fs';
import { EcritureService } from '../comptabilite/ecriture.service';
import { ExerciceService } from '../exercice/exercice.service';
import { EtatsFinanciersSyscohadaService } from '../etats-financiers-syscohada/etats-financiers-syscohada.service';
import { EtatsFinanciersSmtSyscohadaService } from '../etats-financiers-syscohada/etats-financiers-smt-syscohada.service';
import { CODES_NOTES_CH6 } from '../etats-financiers-syscohada/correspondance-compte-resultat-syscohada';
import { NoteAnnexeService } from '../notes-annexes/note-annexe.service';
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

function fabriquerExport(systeme: SystemeComptableSyscohada = SystemeComptableSyscohada.NORMAL): ExportService {
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
    saisieNote: { findMany: jest.fn().mockResolvedValue([]) },
    compte: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
    ecriture: { findMany: jest.fn().mockResolvedValue(smt ? ECRITURES_SMT : []) },
    ligneEcriture: { findMany: jest.fn().mockResolvedValue([]) },
    immobilisation: { findMany: jest.fn().mockResolvedValue([]) },
    tiersCompte: { findMany: jest.fn().mockResolvedValue([]) },
  } as unknown as PrismaService;

  const syscohada = new EtatsFinanciersSyscohadaService(ecritureService, exerciceService);
  const smtSyscohada = new EtatsFinanciersSmtSyscohadaService(ecritureService, exerciceService, prisma);
  const notes = new NoteAnnexeService(ecritureService, exerciceService, prisma);
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
  it('reproduit le classeur du modèle, ses 36 notes et ses recoupements', async () => {
    const { buffer, nomFichier } = await fabriquerExport().liasseCompleteExcel('t1', 'e1');
    expect(nomFichier).toBe('liasse-complete-2026.xlsx');
    const wb = await ouvrir(buffer);
    const noms = wb.worksheets.map((w) => w.name);

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

    // LES 36 NOTES, dans l'ordre officiel du ch. 6 · 46 codes pour 36 numéros
    // de tête (3A à 3F, 15A/15B, 16A/16B/16B bis/16C, 27A/27B). Une seule
    // feuille par code, les sous-tableaux empilés dessus.
    const feuillesNotes = noms.slice(13, -3);
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

    // CONTROLES · les trois seuils de l'art. 13, jamais convertis.
    const ctlSmt = texteFeuille(wb, 'CONTROLES');
    expect(ctlSmt.some((t) => t.includes('Entités de négoce'))).toBe(true);
    expect(ctlSmt.some((t) => t.includes("ou l'équivalent dans l'unité monétaire"))).toBe(true);
  });
});
