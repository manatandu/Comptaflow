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
