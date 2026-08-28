import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { EcritureService } from '../comptabilite/ecriture.service';
import { EtatsFinanciersService } from '../etats-financiers/etats-financiers.service';

const ENTETE_FONT = { bold: true } as const;
const ENTETE_FILL = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFE8E8E8' },
} as const;

function styliserEntete(ligne: ExcelJS.Row) {
  ligne.font = ENTETE_FONT;
  ligne.fill = ENTETE_FILL as ExcelJS.Fill;
}

/**
 * Export Excel des documents comptables — Journal, Grand livre, Balance,
 * Bilan (MVP). Objectif explicite (demande utilisateur, séance du
 * 2026-08-28) : produire des documents exploitables pour l'audit, un PDF
 * étant difficile à recouper ligne à ligne. Chaque feuille reste strictement
 * SYCEBNL/OHADA — pas d'emprunt de mise en forme SYSCOHADA, même si des
 * dossiers d'audit réels (SYSCOHADA) ont inspiré la richesse des colonnes
 * de traçabilité (voir docs/plan-de-construction.md, analyse CARRIGRES).
 */
@Injectable()
export class ExportService {
  constructor(
    private readonly ecritureService: EcritureService,
    private readonly etatsFinanciersService: EtatsFinanciersService,
  ) {}

  private nouveauClasseur(): ExcelJS.Workbook {
    const classeur = new ExcelJS.Workbook();
    classeur.creator = 'Compta Flow';
    classeur.created = new Date();
    return classeur;
  }

  private async versBuffer(classeur: ExcelJS.Workbook): Promise<Buffer> {
    return Buffer.from(await classeur.xlsx.writeBuffer());
  }

  /** Journal : reprend exactement EcritureService.lister(), une ligne d'écriture = une ligne Excel. */
  async journalExcel(
    tenantId: string,
    filtres: { exerciceId?: string; journalId?: string; dateDebut?: string; dateFin?: string; recherche?: string },
  ): Promise<Buffer> {
    const { ecritures, totaux } = await this.ecritureService.lister(tenantId, filtres);

    const classeur = this.nouveauClasseur();
    const feuille = classeur.addWorksheet('Journal');
    feuille.columns = [
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Journal', key: 'journal', width: 10 },
      { header: 'N° pièce', key: 'numeroPiece', width: 10 },
      { header: 'Référence', key: 'reference', width: 16 },
      { header: 'Libellé écriture', key: 'libelleEcriture', width: 32 },
      { header: 'Compte', key: 'compteNumero', width: 12 },
      { header: 'Intitulé compte', key: 'compteIntitule', width: 28 },
      { header: 'Libellé ligne', key: 'libelleLigne', width: 32 },
      { header: 'Débit', key: 'debit', width: 14 },
      { header: 'Crédit', key: 'credit', width: 14 },
      { header: 'Lettrage', key: 'lettre', width: 10 },
    ];
    styliserEntete(feuille.getRow(1));

    for (const e of ecritures) {
      for (const l of e.lignes) {
        feuille.addRow({
          date: new Date(e.date).toLocaleDateString('fr-FR'),
          journal: e.journal.code,
          numeroPiece: e.numeroPiece,
          reference: e.reference ?? '',
          libelleEcriture: e.libelle,
          compteNumero: l.compte.numero,
          compteIntitule: l.compte.intitule,
          libelleLigne: l.libelle ?? '',
          debit: Number(l.debit) || null,
          credit: Number(l.credit) || null,
          lettre: l.lettre ?? '',
        });
      }
    }

    const ligneTotal = feuille.addRow({
      libelleEcriture: 'TOTAUX DE LA PÉRIODE',
      debit: totaux.debit,
      credit: totaux.credit,
    });
    ligneTotal.font = ENTETE_FONT;
    feuille.getColumn('debit').numFmt = '#,##0.00';
    feuille.getColumn('credit').numFmt = '#,##0.00';

    return this.versBuffer(classeur);
  }

  /**
   * Grand livre d'un compte, avec colonne "Compte contrepartie" — demande
   * explicite de l'utilisateur, pour retracer une écriture sans connaître
   * son journal.
   *
   * Règle retenue (voir discussion du 2026-08-28, docs/plan-de-construction.md) :
   * contrepartie(ligne) = comptes DISTINCTS de sens opposé dans la même
   * écriture. Exacte et non ambiguë dans l'écrasante majorité des cas réels
   * (écriture à 2 lignes, N débits/1 crédit, 1 débit/M crédits). Dans le cas
   * rare d'une écriture à débits ET crédits multiples simultanés (N×M), la
   * cellule affiche la liste des comptes candidats séparés par « + » plutôt
   * qu'un choix arbitraire faussement précis — un vrai modèle 1-pour-1
   * (façon Banana) demanderait de restructurer la saisie elle-même (voir
   * doc), volontairement hors scope de cet export.
   */
  async grandLivreExcel(tenantId: string, compteId: string, exerciceId?: string): Promise<Buffer> {
    // Réutilise EcritureService.grandLivre() — même règle de contrepartie
    // que l'écran « Journal & grand livre », pas de logique dupliquée.
    const { compte, lignes: lignesDuCompte } = await this.ecritureService.grandLivre(tenantId, compteId, exerciceId);

    const classeur = this.nouveauClasseur();
    const feuille = classeur.addWorksheet('Grand livre');
    feuille.columns = [
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Journal', key: 'journal', width: 10 },
      { header: 'N° pièce', key: 'numeroPiece', width: 10 },
      { header: 'Référence', key: 'reference', width: 16 },
      { header: 'Libellé', key: 'libelle', width: 34 },
      { header: 'Débit', key: 'debit', width: 14 },
      { header: 'Crédit', key: 'credit', width: 14 },
      { header: 'Solde progressif', key: 'solde', width: 16 },
      { header: 'Lettrage', key: 'lettre', width: 10 },
      { header: 'Compte contrepartie', key: 'contrepartie', width: 28 },
    ];
    feuille.getCell('A1').note =
      'Compte(s) de sens opposé dans la même écriture. Si plusieurs comptes apparaissent ' +
      '(séparés par « + »), l’écriture mêle débits et crédits multiples : la répartition exacte ' +
      "n'est pas déterminable sans information de saisie supplémentaire.";
    styliserEntete(feuille.getRow(1));

    for (const l of lignesDuCompte) {
      feuille.addRow({
        date: new Date(l.date).toLocaleDateString('fr-FR'),
        journal: l.journalCode,
        numeroPiece: l.numeroPiece,
        reference: l.reference ?? '',
        libelle: l.libelle,
        debit: l.debit || null,
        credit: l.credit || null,
        solde: l.soldeProgressif,
        lettre: l.lettre ?? '',
        contrepartie: l.contrepartie.join(' + '),
      });
    }

    feuille.getColumn('debit').numFmt = '#,##0.00';
    feuille.getColumn('credit').numFmt = '#,##0.00';
    feuille.getColumn('solde').numFmt = '#,##0.00';

    feuille.headerFooter = { firstHeader: `&C${compte.numero} — ${compte.intitule}` };

    return this.versBuffer(classeur);
  }

  /** Balance générale, comptes Détail et Total (regroupement affiché en gras). */
  async balanceExcel(tenantId: string, exerciceId: string): Promise<Buffer> {
    const { lignes, totaux } = await this.ecritureService.balance(tenantId, exerciceId);

    const classeur = this.nouveauClasseur();
    const feuille = classeur.addWorksheet('Balance');
    feuille.columns = [
      { header: 'N° compte', key: 'numero', width: 12 },
      { header: 'Intitulé', key: 'intitule', width: 36 },
      { header: 'Total débit', key: 'totalDebit', width: 16 },
      { header: 'Total crédit', key: 'totalCredit', width: 16 },
      { header: 'Solde', key: 'solde', width: 16 },
    ];
    styliserEntete(feuille.getRow(1));

    for (const l of lignes) {
      const ligne = feuille.addRow({
        numero: l.numero,
        intitule: l.intitule,
        totalDebit: l.totalDebit || null,
        totalCredit: l.totalCredit || null,
        solde: l.solde,
      });
      if (l.typeCompte === 'TOTAL') {
        ligne.font = ENTETE_FONT;
      }
    }

    const ligneTotal = feuille.addRow({ intitule: 'TOTAUX GÉNÉRAUX', totalDebit: totaux.debit, totalCredit: totaux.credit });
    ligneTotal.font = ENTETE_FONT;
    feuille.getColumn('totalDebit').numFmt = '#,##0.00';
    feuille.getColumn('totalCredit').numFmt = '#,##0.00';
    feuille.getColumn('solde').numFmt = '#,##0.00';

    return this.versBuffer(classeur);
  }

  /**
   * Bilan — ⚠️ reprend le regroupement SIMPLIFIÉ classe→poste du module
   * etats-financiers (MVP, PAS le tableau de correspondance officiel
   * SYCEBNL Partie 4 ch. 2). Le classeur porte l'avertissement explicitement
   * en cellule, jamais caché — voir etats-financiers.service.ts pour le
   * détail de la règle appliquée et la note sur le moteur `liasse/` officiel
   * (skill sycebnl) qui doit remplacer ce module (roadmap — Moteur de
   * mapping / états financiers configurables).
   */
  async bilanExcel(tenantId: string, exerciceId: string): Promise<Buffer> {
    const bilan = await this.etatsFinanciersService.bilan(tenantId, exerciceId);

    const classeur = this.nouveauClasseur();
    const feuille = classeur.addWorksheet('Bilan');
    feuille.columns = [
      { header: 'N° compte', key: 'numero', width: 12 },
      { header: 'Actif — intitulé', key: 'intituleActif', width: 30 },
      { header: 'Actif — montant', key: 'montantActif', width: 16 },
      { header: 'N° compte', key: 'numeroPassif', width: 12 },
      { header: 'Passif — intitulé', key: 'intitulePassif', width: 30 },
      { header: 'Passif — montant', key: 'montantPassif', width: 16 },
    ];
    styliserEntete(feuille.getRow(1));

    const maxLignes = Math.max(bilan.actif.length, bilan.passif.length);
    for (let i = 0; i < maxLignes; i++) {
      const a = bilan.actif[i];
      const p = bilan.passif[i];
      feuille.addRow({
        numero: a?.numero ?? '',
        intituleActif: a?.intitule ?? '',
        montantActif: a ? a.montant : null,
        numeroPassif: p?.numero ?? '',
        intitulePassif: p?.intitule ?? '',
        montantPassif: p ? p.montant : null,
      });
    }

    const ligneTotal = feuille.addRow({
      intituleActif: 'TOTAL ACTIF',
      montantActif: bilan.totalActif,
      intitulePassif: 'TOTAL PASSIF',
      montantPassif: bilan.totalPassif,
    });
    ligneTotal.font = ENTETE_FONT;
    feuille.getColumn('montantActif').numFmt = '#,##0.00';
    feuille.getColumn('montantPassif').numFmt = '#,##0.00';

    const avertissement = feuille.addRow([
      `⚠ Regroupement simplifié classe → poste (MVP), pas le tableau de correspondance officiel SYCEBNL. Équilibré : ${bilan.equilibre ? 'oui' : 'NON — vérifier les écritures'}.`,
    ]);
    avertissement.font = { italic: true, color: { argb: 'FF8A6D3B' } };
    feuille.mergeCells(`A${avertissement.number}:F${avertissement.number}`);

    return this.versBuffer(classeur);
  }
}
