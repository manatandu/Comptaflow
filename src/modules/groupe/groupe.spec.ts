import { BadRequestException, NotFoundException } from '@nestjs/common';
import { GroupeService } from './groupe.service';

/**
 * BALANCE AGRÉGÉE D'UN GROUPE D'ÉTABLISSEMENTS · les garanties qui rendent
 * l'agrégat digne de confiance :
 *  · l'agrégation se fait par NUMÉRO de compte, comptes Détail seulement
 *    (une ligne Total agrégée compterait deux fois ses enfants) ;
 *  · les virements internes 58 se neutralisent quand chaque transfert est
 *    enregistré des deux côtés, et l'écart est dénoncé sinon ;
 *  · une cellule sans exercice sur la période est NOMMÉE (ses chiffres
 *    manquent), jamais passée sous silence ;
 *  · un exercice étranger au dossier appelant est refusé (le tenantId de
 *    l'appelant borne tout).
 */

const EX_MERE = { id: 'ex-m', dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31') };

// La mère encaisse 1000 de cotisations puis envoie 300 à la cellule C1 ·
// C1 reçoit les 300 et en dépense 100. Chaque livre est équilibré, et les
// 58 des deux livres se font face (débit 300 chez l'émetteur, crédit 300
// chez le receveur).
const BALANCES: Record<string, { lignes: unknown[]; totaux: { debit: number; credit: number } }> = {
  mere: {
    lignes: [
      { numero: '52', intitule: 'BANQUES', typeCompte: 'TOTAL', totalDebit: 1000, totalCredit: 300, solde: 700 },
      { numero: '521000', intitule: 'Banque', typeCompte: 'DETAIL', totalDebit: 1000, totalCredit: 300, solde: 700 },
      { numero: '581000', intitule: 'Virements internes', typeCompte: 'DETAIL', totalDebit: 300, totalCredit: 0, solde: 300 },
      { numero: '701000', intitule: 'Cotisations', typeCompte: 'DETAIL', totalDebit: 0, totalCredit: 1000, solde: -1000 },
    ],
    totaux: { debit: 1300, credit: 1300 },
  },
  c1: {
    lignes: [
      { numero: '571000', intitule: 'Caisse', typeCompte: 'DETAIL', totalDebit: 300, totalCredit: 100, solde: 200 },
      { numero: '581000', intitule: 'Virements internes', typeCompte: 'DETAIL', totalDebit: 0, totalCredit: 300, solde: -300 },
      { numero: '601000', intitule: 'Achats', typeCompte: 'DETAIL', totalDebit: 100, totalCredit: 0, solde: 100 },
    ],
    totaux: { debit: 400, credit: 400 },
  },
};

const service = (surcharges?: { balanceC1?: (typeof BALANCES)['c1'] }) =>
  new GroupeService(
    {
      exercice: { findFirst: async ({ where }: { where: { id: string; tenantId: string } }) => (where.id === 'ex-m' && where.tenantId === 'mere' ? EX_MERE : null) },
      tenant: {
        findUnique: async () => ({ id: 'mere', nom: 'Église centrale' }),
        findMany: async ({ where }: { where: { dossierMereId: string } }) =>
          where.dossierMereId === 'mere'
            ? [
                { id: 'c1', nom: 'Cellule A', exercices: [{ id: 'ex-c1', dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31') }] },
                // C2 n'a qu'un exercice 2024 · aucun recouvrement avec 2026.
                { id: 'c2', nom: 'Cellule B', exercices: [{ id: 'ex-c2', dateDebut: new Date('2024-01-01'), dateFin: new Date('2024-12-31') }] },
              ]
            : [],
      },
    } as never,
    {
      balance: async (tenantId: string) => (tenantId === 'mere' ? BALANCES.mere : (surcharges?.balanceC1 ?? BALANCES.c1)),
    } as never,
    undefined as never,
  );

describe('GroupeService · balance agrégée', () => {
  it('agrège par numéro, comptes Détail seulement, et neutralise les 58 enregistrés des deux côtés', async () => {
    const a = await service().balanceAgregee('mere', 'ex-m');

    // La ligne Total « 52 » de la mère n'entre pas dans l'agrégat.
    expect(a.lignes.find((l) => l.numero === '52')).toBeUndefined();
    // 58 des deux livres réunis sur une seule ligne, débit 300 / crédit 300.
    const l58 = a.lignes.find((l) => l.numero === '581000')!;
    expect(l58.totalDebit).toBe(300);
    expect(l58.totalCredit).toBe(300);
    expect(a.controles.liaisonNeutralisee).toBe(true);
    // Totaux agrégés : 1300 + 400 de part et d'autre.
    expect(a.totaux.debit).toBe(1700);
    expect(a.totaux.credit).toBe(1700);
    expect(a.controles.tousEquilibres).toBe(true);
    // C2 est nommée · ses chiffres manquent, l'agrégat le dit.
    expect(a.cellulesSansExercice).toEqual([{ id: 'c2', nom: 'Cellule B' }]);
    // Le détail par dossier permet de retrouver qui porte quoi.
    expect(a.detailParDossier.filter((d) => d.dossier === 'Cellule A')).toHaveLength(3);
  });

  it('un transfert enregistré d’un seul côté laisse un écart sur les 58, et il est dénoncé', async () => {
    const a = await service({
      balanceC1: {
        lignes: [
          { numero: '571000', intitule: 'Caisse', typeCompte: 'DETAIL', totalDebit: 200, totalCredit: 100, solde: 100 },
          // Le receveur n'a passé que 200 des 300 reçus par le 58.
          { numero: '581000', intitule: 'Virements internes', typeCompte: 'DETAIL', totalDebit: 0, totalCredit: 200, solde: -200 },
          { numero: '601000', intitule: 'Achats', typeCompte: 'DETAIL', totalDebit: 100, totalCredit: 0, solde: 100 },
        ],
        totaux: { debit: 300, credit: 300 },
      },
    }).balanceAgregee('mere', 'ex-m');
    expect(a.controles.liaisonNeutralisee).toBe(false);
    expect(a.controles.ecartLiaison).toBe(100);
  });

  it("refuse un exercice qui n'appartient pas au dossier appelant", async () => {
    await expect(service().balanceAgregee('mere', 'ex-etranger')).rejects.toThrow(NotFoundException);
  });

  it('refuse un dossier sans cellule · la fenêtre ne doit pas afficher un agrégat vide trompeur', async () => {
    const s = new GroupeService(
      {
        exercice: { findFirst: async () => EX_MERE },
        tenant: { findUnique: async () => ({ id: 'seul', nom: 'Dossier seul' }), findMany: async () => [] },
      } as never,
      { balance: async () => BALANCES.mere } as never,
      undefined as never,
    );
    await expect(s.balanceAgregee('seul', 'ex-m')).rejects.toThrow(BadRequestException);
  });

  it("l'export Excel garde la feuille « Balance agrégée » réimportable : quatre colonnes, pas de ligne de total", async () => {
    const classeur = await service().balanceAgregeeExcel('mere', 'ex-m');
    expect(classeur.nomFichier).toBe('balance-agregee-groupe-2026.xlsx');
    const { Workbook } = await import('exceljs');
    const wb = new Workbook();
    await wb.xlsx.load(classeur.buffer as never);
    const feuille = wb.getWorksheet('Balance agrégée')!;
    expect([feuille.getCell('A1').value, feuille.getCell('B1').value, feuille.getCell('C1').value, feuille.getCell('D1').value]).toEqual([
      'Numéro',
      'Intitulé',
      'Débit',
      'Crédit',
    ]);
    // Aucune ligne TOTAL sur la feuille de données · les totaux vivent sur
    // « Contrôles ». La dernière ligne est un compte, pas un agrégat.
    const derniere = feuille.getRow(feuille.rowCount);
    expect(String(derniere.getCell(1).value)).toMatch(/^\d/);
    expect(wb.getWorksheet('Contrôles')).toBeDefined();
    expect(wb.getWorksheet('Par dossier')).toBeDefined();
  });
});

describe('GroupeService · création de cellules par le siège', () => {
  const service = (mere: {
    dossierMereId?: string | null;
    plafondCellules?: number | null;
    cellules?: number;
    licence?: { type: string; dateExpiration: Date | null } | null;
  }) => {
    const traces: Record<string, unknown[]> = { register: [], majTenant: [], majLicence: [] };
    const s = new GroupeService(
      {
        tenant: {
          findUnique: async () => ({
            id: 'mere',
            dossierMereId: mere.dossierMereId ?? null,
            plafondCellules: mere.plafondCellules ?? null,
            licence: mere.licence ?? null,
            _count: { cellules: mere.cellules ?? 0 },
          }),
          update: async (args: unknown) => {
            traces.majTenant.push(args);
            return {};
          },
        },
        licence: {
          update: async (args: unknown) => {
            traces.majLicence.push(args);
            return {};
          },
        },
      } as never,
      undefined as never,
      {
        register: async (dto: Record<string, unknown>) => {
          traces.register.push(dto);
          return { tenant: { id: 't-cellule', nom: dto.nomEntite }, exercice: null, accessToken: 'jeton' };
        },
      } as never,
    );
    return { s, traces };
  };

  it('rattachement forcé, licence héritée, jamais le jeton · les trois verrous en un seul appel', async () => {
    const echeance = new Date('2027-06-30');
    const { s, traces } = service({
      plafondCellules: 10,
      cellules: 3,
      licence: { type: 'ABONNEMENT', dateExpiration: echeance },
    });
    const resultat = await s.creerCellule('mere', { nom: 'Cellule Ngaliema 12', emailAdmin: 'tresorier@eglise.cd' });

    // Le pipeline d'inscription reçoit le type de licence de la mère, jamais
    // un choix du client.
    expect((traces.register[0] as { typeLicence: string }).typeLicence).toBe('ABONNEMENT');
    // Rattachement IMPOSÉ au tenant appelant.
    expect(traces.majTenant[0]).toEqual({ where: { id: 't-cellule' }, data: { dossierMereId: 'mere' } });
    // Échéance héritée de la mère.
    expect((traces.majLicence[0] as { data: { dateExpiration: Date } }).data.dateExpiration).toBe(echeance);
    expect(resultat.motDePasseTemporaire.length).toBeGreaterThanOrEqual(16);
    expect(resultat).not.toHaveProperty('accessToken');
  });

  it('plafond nul = création désactivée · plafond atteint = refus · une cellule ne crée pas de cellules', async () => {
    await expect(
      service({ plafondCellules: null }).s.creerCellule('mere', { nom: 'X', emailAdmin: 'x@x.cd' }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service({ plafondCellules: 5, cellules: 5 }).s.creerCellule('mere', { nom: 'X', emailAdmin: 'x@x.cd' }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service({ dossierMereId: 'grand-mere', plafondCellules: 5 }).s.creerCellule('mere', { nom: 'X', emailAdmin: 'x@x.cd' }),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('GroupeService · canevas de trésorerie', () => {
  const EX = { id: 'ex-c', dateDebut: new Date('2026-01-01'), dateFin: new Date('2026-12-31') };

  const prismaCanevas = (creees: unknown[]) =>
    ({
      tenant: { findFirst: async () => ({ id: 'c1', nom: 'Cellule A' }) },
      exercice: { findFirst: async () => EX },
      ecriture: { findFirst: async () => null },
      compte: {
        findMany: async ({ where }: { where: { numero: { in: string[] } } }) =>
          where.numero.in.map((n) => ({ id: `cpt-${n}`, numero: n })),
      },
      journal: {
        findMany: async () => [
          { id: 'j-ca', code: 'CA' },
          { id: 'j-bq', code: 'BQ' },
        ],
      },
      $transaction: async (fn: (tx: unknown) => Promise<void>) =>
        fn({
          ecriture: {
            create: async (args: unknown) => {
              creees.push(args);
              return {};
            },
          },
        }),
    }) as never;

  const remplir = async (
    buffer: Buffer,
    lignes: Array<[string, string, string, number | '', number | '', string]>,
  ) => {
    const { Workbook } = await import('exceljs');
    const wb = new Workbook();
    await wb.xlsx.load(buffer as never);
    const ws = wb.getWorksheet('Journal de trésorerie')!;
    lignes.forEach((l, i) => {
      const row = ws.getRow(6 + i);
      row.getCell(1).value = new Date(l[0]);
      row.getCell(2).value = l[1];
      row.getCell(3).value = l[2];
      if (l[3] !== '') row.getCell(4).value = l[3];
      if (l[4] !== '') row.getCell(5).value = l[4];
      row.getCell(6).value = l[5];
    });
    return Buffer.from(await wb.xlsx.writeBuffer());
  };

  it('aller-retour complet : le canevas généré, rempli, s’importe en écritures équilibrées de brouillard', async () => {
    const creees: Array<{ data: { libelle: string; reference: string; journalId: string; lignes: { create: Array<{ debit: number; credit: number }> } } }> = [];
    const s = new GroupeService(prismaCanevas(creees), undefined as never, undefined as never);

    const canevas = await s.canevas('mere', 'c1');
    expect(canevas.nomFichier).toBe('canevas-cellule-a-2026.xlsx');

    const rempli = await remplir(canevas.buffer, [
      ['2026-03-01', 'Quête du dimanche', 'Dîmes, quêtes et assimilées', 500, '', 'Caisse'],
      ['2026-03-04', 'Transport réunion', 'Transports et déplacements', '', 30, 'Caisse'],
      ['2026-03-10', '', 'Transfert reçu du siège ou d’une cellule', 200, '', 'Banque'],
    ]);
    const rapport = await s.importerCanevas('mere', 'c1', 'user-siege', {
      nomFichier: 'canevas.xlsx',
      contenuBase64: rempli.toString('base64'),
    });

    expect(rapport.importe).toBe(true);
    expect(rapport.lignesImportees).toBe(3);
    expect(creees).toHaveLength(3);
    // Chaque écriture est équilibrée, et la recette débite la trésorerie.
    for (const e of creees) {
      const [l1, l2] = e.data.lignes.create;
      expect(l1.debit + l2.debit).toBeCloseTo(l1.credit + l2.credit);
    }
    // Le transfert du siège passe en banque, journal BQ · le 58 vit sa vie.
    expect(creees[2].data.journalId).toBe('j-bq');
    // Libellé vide = libellé de la rubrique.
    expect(creees[2].data.libelle).toBe('Transfert reçu du siège ou d’une cellule');
    // La référence porte l'empreinte du fichier · rejouer le même dépôt se refuse.
    expect(creees[0].data.reference).toMatch(/^CANEVAS [0-9a-f]{10}$/);
  });

  it('tout ou rien : une seule ligne fausse fait tout refuser, anomalies nommées ligne par ligne', async () => {
    const creees: unknown[] = [];
    const s = new GroupeService(prismaCanevas(creees), undefined as never, undefined as never);
    const canevas = await s.canevas('mere', 'c1');
    const rempli = await remplir(canevas.buffer, [
      ['2026-03-01', 'Bonne ligne', 'Dons et offrandes', 100, '', 'Caisse'],
      // Recette saisie en décaissement · sens contraire à la rubrique.
      ['2026-03-02', 'Sens inversé', 'Dons et offrandes', '', 100, 'Caisse'],
      // Hors exercice.
      ['2025-01-15', 'Trop tôt', 'Dons et offrandes', 50, '', 'Caisse'],
    ]);
    const rapport = await s.importerCanevas('mere', 'c1', 'user-siege', {
      nomFichier: 'canevas.xlsx',
      contenuBase64: rempli.toString('base64'),
    });
    expect(rapport.importe).toBe(false);
    expect(creees).toHaveLength(0);
    expect(rapport.anomalies.map((a) => a.ligne)).toEqual([7, 8]);
  });

  it('un fichier qui n’est pas le canevas officiel est refusé net', async () => {
    const s = new GroupeService(prismaCanevas([]), undefined as never, undefined as never);
    const { Workbook } = await import('exceljs');
    const wb = new Workbook();
    wb.addWorksheet('Feuille1').getCell('A1').value = 'bonjour';
    const etranger = Buffer.from(await wb.xlsx.writeBuffer());
    await expect(
      s.importerCanevas('mere', 'c1', 'u', { nomFichier: 'x.xlsx', contenuBase64: etranger.toString('base64') }),
    ).rejects.toThrow(BadRequestException);
  });
});
