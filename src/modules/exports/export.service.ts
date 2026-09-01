import { Injectable, PayloadTooLargeException } from '@nestjs/common';
import { JeuEtatsFinanciersSycebnl, Prisma } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';
import { EtatsFinanciersService, PosteCalcule } from '../etats-financiers/etats-financiers.service';
import { EtatsFinanciersProjetService } from '../etats-financiers/etats-financiers-projet.service';
import { EtatsFinanciersSmtService } from '../etats-financiers/etats-financiers-smt.service';
import { EtatsFinanciersProjetBudgetService } from '../etats-financiers/etats-financiers-projet-budget.service';
import { NoteAnnexeService } from '../notes-annexes/note-annexe.service';
import { DonationService, manquementsArticle17 } from '../registre-donateurs/donation.service';
import { LivreInventaireService } from '../documents-obligatoires/livre-inventaire.service';
import { RapportActiviteService } from '../documents-obligatoires/rapport-activite.service';
import { SECTIONS_RAPPORT_ACTIVITE } from '../documents-obligatoires/correspondance-inventaire';
import {
  POSTES_CHARGES as POSTES_CHARGES_PROJET,
  POSTES_REVENUS as POSTES_REVENUS_PROJET,
} from '../etats-financiers/correspondance-projet-compte-exploitation';
import { ColonneNote, LigneNoteCalculee, NoteCalculee, TypeColonneNote } from '../notes-annexes/note-annexe.types';
import {
  cadre,
  ecrireCartouche,
  entetesBande,
  IdentiteLiasse,
  largeurs,
  MOYEN,
  numeroterPages,
  styleLigne,
  titreEtat,
} from './theme-etafi';
import {
  construireBilanPaysage,
  construireControleBalance,
  construireCouverture,
  construireFiche1,
  construireFiche2,
  construireFicheNotes,
  construireGarde,
  construireTableCommentaires,
  ecrireFeuilleBalance,
  FMT_MONTANT as FMT_MONTANT_ETAFI,
  fusion,
  LigneBalanceLiasse,
  NiveauLigne,
  NOM_BALANCE,
  NOM_BALANCE_N1,
  PartiesNotes,
  titreNote,
} from './theme-etafi';
import {
  construireFeuilleEtat,
  NIVEAUX_ETAT_PROJETS,
  NIVEAUX_RECONCILIATION,
  NIVEAUX_TER,
  NOTE_PAR_CLE_PROJETS,
  REP_TFT,
  TOTAUX_PROJETS_BILAN,
  TOTAUX_PROJETS_CE,
  TOTAUX_TER,
  GroupeColonnes,
  LigneEtatEtafi,
  ligneControleSousEtat,
  NIVEAUX_ETAT_ASSOCIATIONS,
  NIVEAUX_TFT,
  NOTE_PAR_REF_ASSOCIATIONS,
  TOTAUX_ASSOCIATIONS,
} from './etat-etafi';

const ENTETE_FONT = { bold: true } as const;
const ENTETE_FILL = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFE8E8E8' },
} as const;

const FORMAT_MONTANT = '#,##0.00';
const FORMAT_DATE = 'DD/MM/YYYY';

/** Un classeur produit, avec le nom de fichier que le contrôleur doit servir. */
/** Libellé humain du jeu d'états, pour le sommaire de la liasse. */
const LIBELLE_JEU: Record<JeuEtatsFinanciersSycebnl, string> = {
  ASSOCIATIONS_ORDRES_PROFESSIONNELS: 'Associations, ordres professionnels et fondations',
  PROJETS_DEVELOPPEMENT: 'Projets de développement et assimilés',
  SYSTEME_MINIMAL_TRESORERIE: 'Système minimal de trésorerie',
};

export interface ClasseurExporte {
  buffer: Buffer;
  nomFichier: string;
}

/**
 * Export Excel des documents comptables · Journal, Grand livre (un compte ou
 * complet), Balance, Bilan et Compte de résultat. Objectif explicite
 * (demande utilisateur, séance du 2026-08-28) : produire des documents
 * exploitables pour l'audit, un PDF étant difficile à recouper ligne à
 * ligne. Chaque feuille reste strictement SYCEBNL/OHADA · pas d'emprunt de
 * mise en forme SYSCOHADA, même si des dossiers d'audit réels (SYSCOHADA)
 * ont inspiré la richesse des colonnes de traçabilité (voir
 * docs/plan-de-construction.md, analyse CARRIGRES).
 *
 * Trois partis pris de forme, tous au service de l'exploitation réelle du
 * fichier par un auditeur, et non de sa seule impression :
 *  - les dates sont de VRAIES dates Excel (pas du texte « 01/02/2026 ») :
 *    sans ça, ni tri chronologique ni filtre par période ne fonctionnent ;
 *  - la ligne d'en-tête est figée et porte un auto-filtre, pour rester
 *    lisible sur un journal de plusieurs milliers de lignes ;
 *  - les tableaux de données sont PLATS (pas de ligne de rupture au milieu),
 *    afin que filtre et tableau croisé dynamique restent honnêtes ; les
 *    sous-totaux vivent sur une feuille « Sommaire » dédiée.
 */
@Injectable()
export class ExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ecritureService: EcritureService,
    private readonly etatsFinanciersService: EtatsFinanciersService,
    private readonly etatsFinanciersProjetService: EtatsFinanciersProjetService,
    private readonly etatsFinanciersSmtService: EtatsFinanciersSmtService,
    private readonly etatsFinanciersProjetBudgetService: EtatsFinanciersProjetBudgetService,
    private readonly noteAnnexeService: NoteAnnexeService,
    private readonly donationService: DonationService,
    private readonly livreInventaire: LivreInventaireService,
    private readonly rapportActivite: RapportActiviteService,
  ) {}

  private nouveauClasseur(): ExcelJS.Workbook {
    const classeur = new ExcelJS.Workbook();
    classeur.creator = 'OmegaX';
    classeur.created = new Date();
    return classeur;
  }

  private async versBuffer(classeur: ExcelJS.Workbook): Promise<Buffer> {
    return Buffer.from(await classeur.xlsx.writeBuffer());
  }

  /**
   * Garde-fou de volume. Le classeur est intégralement construit en mémoire
   * puis sérialisé en un seul buffer (`writeBuffer`) : mesuré, un export de
   * 50 000 lignes consomme environ 1 Go. Sans borne, un utilisateur · même
   * en LECTURE_SEULE · pouvait enchaîner les exports d'un gros dossier et
   * saturer le tas Node, ce qui fait tomber le processus pour TOUS les
   * tenants (l'application est mono-processus, sans file de travaux).
   *
   * Le refus est explicite et actionnable plutôt que silencieux : mieux vaut
   * demander de restreindre la période qu'un état tronqué, ou qu'un
   * plantage. Le passage à `ExcelJS.stream.xlsx.WorkbookWriter` lèverait la
   * contrainte, au prix d'une refonte de la réponse en flux · hors périmètre
   * ici, tracé dans docs/plan-de-construction.md.
   */
  private static readonly MAX_LIGNES_EXPORT = Number(process.env.EXPORT_MAX_LIGNES ?? 50_000);

  private async verifierVolume(where: Prisma.LigneEcritureWhereInput, quoi: string) {
    const nb = await this.prisma.ligneEcriture.count({ where });
    if (nb > ExportService.MAX_LIGNES_EXPORT) {
      throw new PayloadTooLargeException(
        `${quoi} : ${nb.toLocaleString('fr-FR')} lignes à exporter, au-delà de la limite de ` +
          `${ExportService.MAX_LIGNES_EXPORT.toLocaleString('fr-FR')}. Restreignez la période (ou le journal) ` +
          `et relancez l'export.`,
      );
    }
  }

  /**
   * Suffixe de nom de fichier : l'année de l'exercice, pour que deux
   * exportations d'exercices différents ne s'écrasent pas dans le dossier
   * Téléchargements. Vide si l'export n'est pas borné à un exercice.
   */
  private async suffixeExercice(tenantId: string, exerciceId?: string): Promise<string> {
    if (!exerciceId) return '';
    const exercice = await this.prisma.exercice.findFirst({
      where: { id: exerciceId, tenantId },
      select: { dateDebut: true },
    });
    return exercice ? `-${exercice.dateDebut.getFullYear()}` : '';
  }

  /**
   * En-tête figée + auto-filtre sur la plage de données. La plage s'arrête à
   * `dernereLigneDonnees` : y inclure une ligne de totaux ferait remonter
   * celle-ci dans les résultats de n'importe quel filtre.
   */
  private finaliserTableau(feuille: ExcelJS.Worksheet, nbColonnes: number, derniereLigneDonnees: number) {
    styliserEntete(feuille.getRow(1));
    feuille.views = [{ state: 'frozen', ySplit: 1 }];
    if (derniereLigneDonnees > 1) {
      feuille.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: derniereLigneDonnees, column: nbColonnes },
      };
    }
  }

  private appliquerFormats(feuille: ExcelJS.Worksheet, formats: Record<string, string>) {
    for (const [cle, format] of Object.entries(formats)) {
      feuille.getColumn(cle).numFmt = format;
    }
  }

  /** Journal : reprend exactement EcritureService.lister(), une ligne d'écriture = une ligne Excel. */
  async journalExcel(
    tenantId: string,
    filtres: { exerciceId?: string; journalId?: string; dateDebut?: string; dateFin?: string; recherche?: string },
  ): Promise<ClasseurExporte> {
    await this.verifierVolume(
      {
        ecriture: {
          tenantId,
          ...(filtres.exerciceId ? { exerciceId: filtres.exerciceId } : {}),
          ...(filtres.journalId ? { journalId: filtres.journalId } : {}),
          ...(filtres.dateDebut || filtres.dateFin
            ? {
                date: {
                  ...(filtres.dateDebut ? { gte: new Date(filtres.dateDebut) } : {}),
                  ...(filtres.dateFin ? { lte: new Date(filtres.dateFin) } : {}),
                },
              }
            : {}),
        },
      },
      'Journal',
    );

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
      // Un journal d'audit qui tairait les annulations laisserait additionner
      // une erreur et sa correction sans savoir laquelle est laquelle. Les
      // deux écritures RESTENT au journal · « sans blanc ni altération
      // d'aucune sorte » (Partie 2 ch. 2) · mais chacune se nomme.
      { header: 'Correction (art. 20 AUDCIF)', key: 'correction', width: 30 },
      { header: 'Motif de la correction', key: 'motifCorrection', width: 46 },
    ];

    for (const e of ecritures) {
      const etatCorrection = e.correction
        ? `Annulée par la pièce n° ${e.correction.numeroPiece ?? '·'}`
        : e.corrigeEcriture
          ? `Annule la pièce n° ${e.corrigeEcriture.numeroPiece ?? '·'}`
          : '';
      for (const l of e.lignes) {
        feuille.addRow({
          date: e.date,
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
          correction: etatCorrection,
          motifCorrection: e.motifCorrection ?? '',
        });
      }
    }

    const derniereLigneDonnees = feuille.rowCount;
    const ligneTotal = feuille.addRow({
      libelleEcriture: 'TOTAUX DE LA PÉRIODE',
      debit: totaux.debit,
      credit: totaux.credit,
    });
    ligneTotal.font = ENTETE_FONT;

    this.appliquerFormats(feuille, { date: FORMAT_DATE, debit: FORMAT_MONTANT, credit: FORMAT_MONTANT });
    this.finaliserTableau(feuille, feuille.columns.length, derniereLigneDonnees);

    return {
      buffer: await this.versBuffer(classeur),
      nomFichier: `journal${await this.suffixeExercice(tenantId, filtres.exerciceId)}.xlsx`,
    };
  }

  /** Colonnes communes au grand livre d'un compte et au grand livre complet. */
  private colonnesGrandLivre(avecCompte: boolean): Partial<ExcelJS.Column>[] {
    const colonnesCompte: Partial<ExcelJS.Column>[] = avecCompte
      ? [
          { header: 'Compte', key: 'compteNumero', width: 12 },
          { header: 'Intitulé compte', key: 'compteIntitule', width: 30 },
        ]
      : [];
    return [
      ...colonnesCompte,
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
  }

  private noteContrepartie(feuille: ExcelJS.Worksheet, cellule: string) {
    feuille.getCell(cellule).note =
      'Compte(s) de sens opposé dans la même écriture. Si plusieurs comptes apparaissent ' +
      '(séparés par « + »), l’écriture mêle débits et crédits multiples : la répartition exacte ' +
      "n'est pas déterminable sans information de saisie supplémentaire.";
  }

  /**
   * Grand livre d'UN compte, avec colonne « Compte contrepartie » · demande
   * explicite de l'utilisateur, pour retracer une écriture sans connaître
   * son journal.
   *
   * Règle retenue (voir discussion du 2026-08-28, docs/plan-de-construction.md) :
   * comptes DISTINCTS de sens opposé dans la même écriture · calculée une
   * seule fois dans `EcritureService` et partagée par l'écran et l'export.
   */
  async grandLivreExcel(tenantId: string, compteId: string, exerciceId?: string): Promise<ClasseurExporte> {
    const { compte, lignes, soldeFinal } = await this.ecritureService.grandLivre(tenantId, compteId, exerciceId);

    const classeur = this.nouveauClasseur();
    const feuille = classeur.addWorksheet('Grand livre');
    feuille.columns = this.colonnesGrandLivre(false);
    this.noteContrepartie(feuille, 'J1');

    for (const l of lignes) {
      feuille.addRow({
        date: l.date,
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

    const derniereLigneDonnees = feuille.rowCount;
    // Ligne de totaux, comme sur le journal, la balance et le sommaire du
    // grand livre complet · et surtout comme l'écran, qui affiche « SOLDE
    // FINAL » : sans elle, l'utilisateur qui exporte le compte qu'il a sous
    // les yeux perd le seul chiffre qu'il regardait.
    const ligneTotal = feuille.addRow({
      libelle: 'TOTAUX DU COMPTE',
      debit: lignes.reduce((s, l) => s + l.debit, 0),
      credit: lignes.reduce((s, l) => s + l.credit, 0),
      solde: soldeFinal,
    });
    ligneTotal.font = ENTETE_FONT;

    this.appliquerFormats(feuille, {
      date: FORMAT_DATE,
      debit: FORMAT_MONTANT,
      credit: FORMAT_MONTANT,
      solde: FORMAT_MONTANT,
    });
    this.finaliserTableau(feuille, feuille.columns.length, derniereLigneDonnees);
    // `&` introduit un code de mise en forme dans un en-tête Excel : un
    // intitulé « Achats & fournitures » donnerait `&f`, qu'Excel remplace par
    // le nom du fichier. On le double pour l'échapper.
    const enTete = `${compte.numero} · ${compte.intitule}`.replace(/&/g, '&&');
    feuille.headerFooter = { firstHeader: `&C${enTete}` };

    return {
      buffer: await this.versBuffer(classeur),
      nomFichier: `grand-livre-${compte.numero}${await this.suffixeExercice(tenantId, exerciceId)}.xlsx`,
    };
  }

  /**
   * Grand livre COMPLET · tous les comptes mouvementés de l'exercice dans un
   * seul classeur. C'est la forme réellement attendue par un auditeur : le
   * grand livre compte par compte obligeait à autant de téléchargements
   * qu'il y a de comptes.
   *
   * Deux feuilles :
   *  - « Grand livre » : tableau PLAT (numéro et intitulé du compte répétés
   *    sur chaque ligne), donc filtrable et pivotable tel quel ; le solde
   *    progressif se réinitialise à chaque compte, ce qui conserve la
   *    lecture classique une fois filtré sur un compte ;
   *  - « Sommaire » : une ligne par compte (totaux débit/crédit, solde
   *    final) · c'est là que vivent les sous-totaux, plutôt qu'en lignes de
   *    rupture au milieu des données qui fausseraient tout filtre.
   */
  async grandLivreCompletExcel(tenantId: string, exerciceId?: string): Promise<ClasseurExporte> {
    await this.verifierVolume(
      { ecriture: { tenantId, ...(exerciceId ? { exerciceId } : {}) } },
      'Grand livre complet',
    );

    const comptes = await this.ecritureService.grandLivreComplet(tenantId, exerciceId);

    const classeur = this.nouveauClasseur();
    const feuille = classeur.addWorksheet('Grand livre');
    feuille.columns = this.colonnesGrandLivre(true);
    this.noteContrepartie(feuille, 'L1');

    for (const c of comptes) {
      for (const l of c.lignes) {
        feuille.addRow({
          compteNumero: c.compte.numero,
          compteIntitule: c.compte.intitule,
          date: l.date,
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
    }

    const derniereLigneDonnees = feuille.rowCount;
    this.appliquerFormats(feuille, {
      date: FORMAT_DATE,
      debit: FORMAT_MONTANT,
      credit: FORMAT_MONTANT,
      solde: FORMAT_MONTANT,
    });
    this.finaliserTableau(feuille, feuille.columns.length, derniereLigneDonnees);

    const sommaire = classeur.addWorksheet('Sommaire');
    sommaire.columns = [
      { header: 'Compte', key: 'numero', width: 12 },
      { header: 'Intitulé', key: 'intitule', width: 40 },
      { header: 'Nb lignes', key: 'nbLignes', width: 11 },
      { header: 'Total débit', key: 'totalDebit', width: 16 },
      { header: 'Total crédit', key: 'totalCredit', width: 16 },
      { header: 'Solde final', key: 'solde', width: 16 },
    ];
    for (const c of comptes) {
      sommaire.addRow({
        numero: c.compte.numero,
        intitule: c.compte.intitule,
        nbLignes: c.lignes.length,
        totalDebit: c.totalDebit || null,
        totalCredit: c.totalCredit || null,
        solde: c.soldeFinal,
      });
    }
    const derniereLigneSommaire = sommaire.rowCount;
    const ligneTotalSommaire = sommaire.addRow({
      intitule: 'TOTAUX GÉNÉRAUX',
      totalDebit: comptes.reduce((s, c) => s + c.totalDebit, 0),
      totalCredit: comptes.reduce((s, c) => s + c.totalCredit, 0),
    });
    ligneTotalSommaire.font = ENTETE_FONT;
    this.appliquerFormats(sommaire, {
      totalDebit: FORMAT_MONTANT,
      totalCredit: FORMAT_MONTANT,
      solde: FORMAT_MONTANT,
    });
    this.finaliserTableau(sommaire, sommaire.columns.length, derniereLigneSommaire);

    return {
      buffer: await this.versBuffer(classeur),
      nomFichier: `grand-livre-complet${await this.suffixeExercice(tenantId, exerciceId)}.xlsx`,
    };
  }

  /** Balance générale, comptes Détail et Total (regroupement affiché en gras). */
  async balanceExcel(tenantId: string, exerciceId: string): Promise<ClasseurExporte> {
    const { lignes, totaux } = await this.ecritureService.balance(tenantId, exerciceId);

    const classeur = this.nouveauClasseur();
    const feuille = classeur.addWorksheet('Balance');
    /*
     * BALANCE À SIX COLONNES, format des dossiers de révision réels.
     *
     * L'export ne montrait que Total débit / Total crédit / Solde, alors que
     * le service calcule DÉJÀ la scission report / mouvements. C'était perdre
     * l'information la plus utile : sur un compte d'immobilisation, le total
     * englobe le report à-nouveau, et un bâtiment détenu depuis 2020 y est
     * indiscernable d'une acquisition de l'exercice.
     *
     * Les six colonnes reprennent celles d'un dossier d'audit congolais réel
     * (balance générale CARRIGRES au 31/12/2025, analysée sur le Drive) :
     * « Solde débit avant période, Solde crédit avant période, Débit, Crédit,
     * Débit cumulé, Crédit cumulé ». Un réviseur lit cette balance-là ; celle
     * à trois colonnes l'oblige à retourner au grand livre.
     */
    feuille.columns = [
      { header: 'N° compte', key: 'numero', width: 12 },
      { header: 'Intitulé', key: 'intitule', width: 36 },
      { header: 'Type', key: 'type', width: 10 },
      { header: 'Solde débit à l’ouverture', key: 'reportDebit', width: 17 },
      { header: 'Solde crédit à l’ouverture', key: 'reportCredit', width: 17 },
      { header: 'Mouvements débit', key: 'mouvementDebit', width: 16 },
      { header: 'Mouvements crédit', key: 'mouvementCredit', width: 16 },
      { header: 'Débit cumulé', key: 'totalDebit', width: 16 },
      { header: 'Crédit cumulé', key: 'totalCredit', width: 16 },
      { header: 'Solde', key: 'solde', width: 16 },
    ];

    for (const l of lignes) {
      const ligne = feuille.addRow({
        numero: l.numero,
        intitule: l.intitule,
        // Colonne explicite plutôt que le seul gras : un compte Total est un
        // agrégat des comptes Détail de même racine, jamais un mouvement
        // propre · sommer les deux doublerait les montants, et cette
        // distinction doit rester lisible même après tri ou filtre.
        type: l.typeCompte === 'TOTAL' ? 'Total' : 'Détail',
        reportDebit: l.reportDebit || null,
        reportCredit: l.reportCredit || null,
        mouvementDebit: l.mouvementDebit || null,
        mouvementCredit: l.mouvementCredit || null,
        totalDebit: l.totalDebit || null,
        totalCredit: l.totalCredit || null,
        solde: l.solde,
      });
      if (l.typeCompte === 'TOTAL') {
        ligne.font = ENTETE_FONT;
      }
    }

    const derniereLigneDonnees = feuille.rowCount;
    const ligneTotal = feuille.addRow({
      intitule: 'TOTAUX GÉNÉRAUX (comptes Détail seuls)',
      totalDebit: totaux.debit,
      totalCredit: totaux.credit,
    });
    ligneTotal.font = ENTETE_FONT;

    this.appliquerFormats(feuille, {
      reportDebit: FORMAT_MONTANT,
      reportCredit: FORMAT_MONTANT,
      mouvementDebit: FORMAT_MONTANT,
      mouvementCredit: FORMAT_MONTANT,
      totalDebit: FORMAT_MONTANT,
      totalCredit: FORMAT_MONTANT,
      solde: FORMAT_MONTANT,
    });
    this.finaliserTableau(feuille, feuille.columns.length, derniereLigneDonnees);

    return {
      buffer: await this.versBuffer(classeur),
      nomFichier: `balance${await this.suffixeExercice(tenantId, exerciceId)}.xlsx`,
    };
  }

  /**
   * IDENTITÉ DU CARTOUCHE · les six lignes d'en-tête que la charte ETAFI
   * pose sur chaque page (voir theme-etafi.ts). Le NIF est l'identifiant que
   * le CPCC impose en tête de chaque page d'état financier · le sigle et le
   * NTD restent vides tant que le dossier n'en porte pas.
   */
  private async identiteLiasse(tenantId: string, exerciceId: string): Promise<IdentiteLiasse> {
    const [tenant, exercice] = await Promise.all([
      this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
      this.prisma.exercice.findFirstOrThrow({ where: { id: exerciceId, tenantId } }),
    ]);
    const debut = exercice.dateDebut;
    const fin = exercice.dateFin;
    const duree = Math.max(1, Math.round((fin.getTime() - debut.getTime()) / (30.44 * 86_400_000)));
    const finAnnee = fin.getMonth() === 11 && fin.getDate() === 31;
    return {
      entite: tenant.nom,
      nif: tenant.numeroImpot ?? '',
      // Une clôture au 31/12 s'écrit par l'année seule (le cartouche la
      // développe en « Exercice clos le 31-12-AAAA ») · toute autre date de
      // clôture s'écrit en toutes lettres.
      exercice: finAnnee ? String(fin.getFullYear()) : fin.toLocaleDateString('fr-FR'),
      duree: String(duree),
      adresse: [tenant.adresse, tenant.ville, tenant.pays].filter(Boolean).join(', '),
      sigle: '',
      ntd: '',
    };
  }

  /** Lignes ETAFI d'un côté du bilan ou du compte de résultat. */
  private lignesEtatEtafi(postes: PosteCalcule[], actif: boolean): LigneEtatEtafi[] {
    return postes.map((p) => ({
      ref: p.ref,
      libelle: p.libelle,
      note: NOTE_PAR_REF_ASSOCIATIONS[p.ref] ?? '',
      niveau: NIVEAUX_ETAT_ASSOCIATIONS[p.ref] ?? (p.estTotal ? 'inter' : 'normal'),
      montants: actif
        ? [
            p.brut ?? p.montant,
            p.amortissement ?? 0,
            // NET = BRUT - AMORT, en formule sur la ligne · comme le modèle.
            { formule: 'D{r}-E{r}' },
            p.montantN1 ?? null,
          ]
        : [p.montant, p.montantN1 ?? null],
    }));
  }

  private static readonly GROUPES_ACTIF: GroupeColonnes[] = [
    { titre: 'EXERCICE AU 31/12/N', sousTitres: ['BRUT', 'AMORT et DEPREC.', 'NET'] },
    { titre: 'EXERCICE AU 31/12/N-1', sousTitres: ['NET'] },
  ];
  private static readonly GROUPES_NET: GroupeColonnes[] = [
    { titre: 'EXERCICE AU 31/12/N', sousTitres: ['NET'] },
    { titre: 'EXERCICE AU 31/12/N-1', sousTitres: ['NET'] },
  ];

  /**
   * Feuilles `Bilan-Actif` et `Bilan-Passif` à la présentation exacte du
   * modèle du skill (cartouche, titre « BILAN » Arial Black vert, bandeau
   * CCFFFF sur deux lignes, niveaux de lignes du modèle, totaux en
   * formules). Rend les correspondances ref → rang de ligne, dont le Bilan
   * paysage de la liasse a besoin pour ses liens.
   */
  private feuillesBilanEtafi(
    classeur: ExcelJS.Workbook,
    bilan: Awaited<ReturnType<EtatsFinanciersService['bilan']>>,
    ident: IdentiteLiasse,
  ): { rangsActif: Map<string, number>; rangsPassif: Map<string, number> } {
    const rangsActif = construireFeuilleEtat(classeur, {
      nom: 'Bilan-Actif',
      titre: 'BILAN',
      taille: 16,
      ident,
      pageRef: 'BILAN SYSTEME NORMAL\nPAGE 1/2',
      libelleColonne: 'ACTIF',
      groupes: ExportService.GROUPES_ACTIF,
      lignes: this.lignesEtatEtafi(bilan.actif, true),
      totaux: TOTAUX_ASSOCIATIONS,
    });
    const rangsPassif = construireFeuilleEtat(classeur, {
      nom: 'Bilan-Passif',
      titre: 'BILAN',
      taille: 16,
      ident,
      pageRef: 'BILAN SYSTEME NORMAL\nPAGE 2/2',
      libelleColonne: 'PASSIF',
      groupes: ExportService.GROUPES_NET,
      lignes: this.lignesEtatEtafi(bilan.passif, false),
      totaux: TOTAUX_ASSOCIATIONS,
    });
    return { rangsActif, rangsPassif };
  }

  /**
   * Bilan · export individuel « l'état seul, en valeurs » (choix
   * utilisateur, séance du 2026-09-01) : les deux feuilles du bilan dans la
   * charte ETAFI, montants de détail en VALEURS (celles du serveur · elles
   * portent les clauses « sauf » et les qualificatifs de sens), totaux en
   * FORMULES de somme de leurs composantes (la hiérarchie se vérifie dans
   * Excel), et une ligne de contrôle discrète sous chaque cadre. Le détail
   * par compte, la balance et les anomalies vivent dans la LIASSE COMPLÈTE
   * et dans les exports dédiés · pas ici.
   */
  async bilanExcel(tenantId: string, exerciceId: string): Promise<ClasseurExporte> {
    const [bilan, ident] = await Promise.all([
      this.etatsFinanciersService.bilan(tenantId, exerciceId),
      this.identiteLiasse(tenantId, exerciceId),
    ]);
    const classeur = this.nouveauClasseur();
    const { rangsActif, rangsPassif } = this.feuillesBilanEtafi(classeur, bilan, ident);

    const controle = bilan.equilibre
      ? `Contrôle : bilan équilibré · actif = passif = ${bilan.totalActif.toLocaleString('fr-FR')}.`
      : `CONTRÔLE : DÉSÉQUILIBRE de ${(bilan.totalActif - bilan.totalPassif).toLocaleString('fr-FR')} entre actif et passif · vérifier les écritures.`;
    const nonRattaches =
      bilan.comptesNonRattaches.length > 0
        ? ` ${bilan.comptesNonRattaches.length} compte(s) de bilan non rattaché(s) à un poste officiel (montants hors totaux) : ` +
          bilan.comptesNonRattaches
            .slice(0, 6)
            .map((c) => c.numero)
            .join(', ') +
          (bilan.comptesNonRattaches.length > 6 ? '…' : '') +
          '.'
        : '';
    ligneControleSousEtat(
      classeur.getWorksheet('Bilan-Actif')!,
      Math.max(...rangsActif.values()) + 2,
      controle + nonRattaches,
    );
    ligneControleSousEtat(classeur.getWorksheet('Bilan-Passif')!, Math.max(...rangsPassif.values()) + 2, controle);
    numeroterPages(classeur);

    return {
      buffer: await this.versBuffer(classeur),
      nomFichier: `bilan${await this.suffixeExercice(tenantId, exerciceId)}.xlsx`,
    };
  }

  /**
   * Feuille `Résultat` du modèle · mêmes règles que le bilan. Le service
   * livre les postes en quatre blocs (produits, charges, H.A.O.) et les
   * totaux en valeurs · l'ordre officiel de l'état les entrelace :
   * RA…RH, XA, TA…TL, XB, XC, TM, TN, XD, XE. Les totaux X* passent en
   * formules (TOTAUX_ASSOCIATIONS) · leurs postes porteurs suffisent.
   */
  private feuilleResultatEtafi(
    classeur: ExcelJS.Workbook,
    cr: Awaited<ReturnType<EtatsFinanciersService['compteDeResultat']>>,
    ident: IdentiteLiasse,
  ): Map<string, number> {
    const total = (ref: string, libelle: string): PosteCalcule => ({
      ref,
      libelle,
      montant: 0,
      comptes: [],
      estTotal: true,
    });
    const postes: PosteCalcule[] = [
      ...cr.produits,
      total('XA', 'REVENUS DES ACTIVITES ORDINAIRES'),
      ...cr.charges,
      total('XB', 'CHARGES DES ACTIVITES ORDINAIRES'),
      total('XC', 'RESULTAT DES ACTIVITES ORDINAIRES'),
      cr.produitsHao,
      cr.chargesHao,
      total('XD', 'RESULTAT H.A.O.'),
      total('XE', "RESULTAT NET DE L'EXERCICE (+excedent, -deficit)"),
    ];
    return construireFeuilleEtat(classeur, {
      nom: 'Résultat',
      titre: 'COMPTE DE RESULTAT',
      taille: 14,
      ident,
      pageRef: 'COMPTE DE RESULTAT\nSYSTEME NORMAL',
      libelleColonne: 'LIBELLES',
      groupes: ExportService.GROUPES_NET,
      lignes: this.lignesEtatEtafi(postes, false),
      totaux: TOTAUX_ASSOCIATIONS,
    });
  }

  /** Compte de résultat · export individuel, charte ETAFI, valeurs seules. */
  async compteDeResultatExcel(tenantId: string, exerciceId: string): Promise<ClasseurExporte> {
    const [cr, ident] = await Promise.all([
      this.etatsFinanciersService.compteDeResultat(tenantId, exerciceId),
      this.identiteLiasse(tenantId, exerciceId),
    ]);
    const classeur = this.nouveauClasseur();
    const rangs = this.feuilleResultatEtafi(classeur, cr, ident);
    ligneControleSousEtat(
      classeur.getWorksheet('Résultat')!,
      Math.max(...rangs.values()) + 2,
      cr.controle.coherent
        ? 'Contrôle : le résultat net (XE) recoupe le résultat logé au bilan.'
        : `CONTRÔLE : écart de ${cr.controle.ecart.toLocaleString('fr-FR')} entre le résultat du compte de résultat et celui du bilan.`,
    );
    numeroterPages(classeur);
    return {
      buffer: await this.versBuffer(classeur),
      nomFichier: `compte-de-resultat${await this.suffixeExercice(tenantId, exerciceId)}.xlsx`,
    };
  }

  /**
   * Feuille `TFT` du modèle : cinq colonnes (REF, LIBELLES, Rep., EXERCICE N,
   * EXERCICE N-1), bandes grises de sections, lignes clefs ZA/ZF/ZG sur bleu
   * 003366. Contrairement au moteur Python du skill · qui ne connaît qu'une
   * balance de clôture et laisse FA à FH vides ·, le serveur ventile les
   * encaissements et décaissements réels : les lignes FA-FH sont chiffrées.
   */
  private feuilleTftEtafi(
    classeur: ExcelJS.Workbook,
    tft: Awaited<ReturnType<EtatsFinanciersService['tableauFluxTresorerie']>>,
    ident: IdentiteLiasse,
  ): { rangs: Map<string, number>; dernier: number } {
    const rangs = new Map<string, number>();
    const ws = classeur.addWorksheet('TFT');
    ecrireCartouche(ws, ident, 'TABLEAU DES FLUX\nDE TRESORERIE', 5);
    titreEtat(ws, 'TABLEAU DES FLUX DE TRESORERIE', 1, 5, 7, 14);
    let r = 8;
    for (const [i, h] of ['REF', 'LIBELLES', 'Rep.', 'EXERCICE N', 'EXERCICE N-1'].entries()) {
      ws.getCell(r, i + 1).value = h;
    }
    entetesBande(ws, r, r, 1, 5);
    ws.getRow(r).height = 22;
    for (const l of tft.lignes) {
      r += 1;
      ws.getRow(r).height = 22;
      if ('section' in l) {
        ws.getCell(r, 2).value = l.section;
        styleLigne(ws, r, 2, 5, 'bande', [4, 5]);
        styleLigne(ws, r, 1, 1, 'normal');
        continue;
      }
      rangs.set(l.ref, r);
      ws.getCell(r, 1).value = l.ref;
      ws.getCell(r, 2).value = l.libelle;
      ws.getCell(r, 3).value = l.repere ?? REP_TFT[l.ref] ?? '';
      ws.getCell(r, 4).value = l.montant;
      if (l.montantN1 !== undefined) ws.getCell(r, 5).value = l.montantN1;
      styleLigne(ws, r, 1, 5, NIVEAUX_TFT[l.ref] ?? 'normal', [4, 5], 1);
      ws.getCell(r, 3).alignment = { horizontal: 'center', vertical: 'middle' };
    }
    cadre(ws, 8, 1, r, 5, MOYEN);
    r += 2;
    ligneControleSousEtat(
      ws,
      r,
      "(1) à l'exclusion des fournisseurs d'investissements. Méthode directe (Partie 4, ch. 1 § 4) · " +
        'les lignes FA à FH sont ventilées depuis les écritures de trésorerie du dossier.',
    );
    largeurs(ws, { A: 5.5, B: 72, C: 6, D: 15.7, E: 15.7 });
    ws.views = [{ state: 'frozen', ySplit: 8, showGridLines: false }];
    return { rangs, dernier: r };
  }

  /** Tableau des flux de trésorerie · export individuel, charte ETAFI. */
  async tableauFluxTresorerieExcel(tenantId: string, exerciceId: string): Promise<ClasseurExporte> {
    const [tft, ident] = await Promise.all([
      this.etatsFinanciersService.tableauFluxTresorerie(tenantId, exerciceId),
      this.identiteLiasse(tenantId, exerciceId),
    ]);
    const classeur = this.nouveauClasseur();
    const { dernier } = this.feuilleTftEtafi(classeur, tft, ident);
    ligneControleSousEtat(
      classeur.getWorksheet('TFT')!,
      dernier + 1,
      tft.controle.coherent
        ? 'Contrôle : le TFT boucle avec la trésorerie du bilan (ZG = trésorerie actif N - trésorerie passif N).'
        : `CONTRÔLE : écart de bouclage de ${tft.controle.ecart.toLocaleString('fr-FR')} avec la trésorerie du bilan.`,
    );
    numeroterPages(classeur);
    return {
      buffer: await this.versBuffer(classeur),
      nomFichier: `tableau-flux-tresorerie${await this.suffixeExercice(tenantId, exerciceId)}.xlsx`,
    };
  }

  /** Lignes ETAFI du jeu projets · bilan (en net) et compte d'exploitation. */
  private lignesProjetEtafi(
    postes: Array<PosteCalcule & { cle?: string }>,
  ): LigneEtatEtafi[] {
    return postes.map((p) => {
      const cle = p.cle ?? p.ref;
      return {
        ref: p.ref,
        cle,
        libelle: p.libelle,
        note: NOTE_PAR_CLE_PROJETS[cle] ?? '',
        niveau: NIVEAUX_ETAT_PROJETS[cle] ?? (p.estTotal ? 'inter' : 'normal'),
        montants: [p.montant, p.montantN1 ?? null],
      };
    });
  }

  /**
   * Feuilles `Bilan-Actif` / `Bilan-Passif` du jeu projets · le modèle les
   * présente EN NET (le tableau officiel du ch. 3 n'a pas de colonne
   * amortissements, correction documentée dans le skill) : cinq colonnes,
   * titre « BILAN (EN NET) ».
   */
  private feuillesBilanProjetEtafi(
    classeur: ExcelJS.Workbook,
    bilan: Awaited<ReturnType<EtatsFinanciersProjetService['bilan']>>,
    ident: IdentiteLiasse,
  ): { rangsActif: Map<string, number>; rangsPassif: Map<string, number> } {
    const rangsActif = construireFeuilleEtat(classeur, {
      nom: 'Bilan-Actif',
      titre: 'BILAN (EN NET)',
      taille: 16,
      ident,
      pageRef: 'BILAN (EN NET)\nPAGE 1/2',
      libelleColonne: 'ACTIF',
      groupes: ExportService.GROUPES_NET,
      lignes: this.lignesProjetEtafi(bilan.actif),
      totaux: TOTAUX_PROJETS_BILAN,
    });
    const rangsPassif = construireFeuilleEtat(classeur, {
      nom: 'Bilan-Passif',
      titre: 'BILAN (EN NET)',
      taille: 16,
      ident,
      pageRef: 'BILAN (EN NET)\nPAGE 2/2',
      libelleColonne: 'PASSIF',
      groupes: ExportService.GROUPES_NET,
      lignes: this.lignesProjetEtafi(bilan.passif),
      totaux: TOTAUX_PROJETS_BILAN,
    });
    return { rangsActif, rangsPassif };
  }

  /** Bilan du jeu projets · export individuel, charte ETAFI, valeurs seules. */
  async bilanProjetExcel(tenantId: string, exerciceId: string): Promise<ClasseurExporte> {
    const [bilan, ident] = await Promise.all([
      this.etatsFinanciersProjetService.bilan(tenantId, exerciceId),
      this.identiteLiasse(tenantId, exerciceId),
    ]);
    const classeur = this.nouveauClasseur();
    const { rangsActif, rangsPassif } = this.feuillesBilanProjetEtafi(classeur, bilan, ident);
    const controle = bilan.equilibre
      ? `Contrôle : bilan équilibré · actif = passif = ${bilan.totalActif.toLocaleString('fr-FR')}.`
      : `CONTRÔLE : DÉSÉQUILIBRE de ${(bilan.totalActif - bilan.totalPassif).toLocaleString('fr-FR')} entre actif et passif.`;
    ligneControleSousEtat(classeur.getWorksheet('Bilan-Actif')!, Math.max(...rangsActif.values()) + 2, controle);
    ligneControleSousEtat(classeur.getWorksheet('Bilan-Passif')!, Math.max(...rangsPassif.values()) + 2, controle);
    numeroterPages(classeur);
    return {
      buffer: await this.versBuffer(classeur),
      nomFichier: `bilan-projet${await this.suffixeExercice(tenantId, exerciceId)}.xlsx`,
    };
  }

  /**
   * Feuille `Compte Exploitation` du modèle · les clés TJ2/TK2 distinguent
   * les deux lignes au ref dupliqué du texte officiel (signalé
   * `[texte officiel]` dans le skill), l'écran montre TJ et TK.
   */
  private feuilleCompteExploitationEtafi(
    classeur: ExcelJS.Workbook,
    ce: Awaited<ReturnType<EtatsFinanciersProjetService['compteExploitation']>>,
    ident: IdentiteLiasse,
  ): Map<string, number> {
    const total = (ref: string, libelle: string): PosteCalcule & { cle?: string } => ({
      ref,
      libelle,
      montant: 0,
      comptes: [],
      estTotal: true,
    });
    const avecCles = (postes: PosteCalcule[], specs: Array<{ cle: string }>): Array<PosteCalcule & { cle?: string }> =>
      postes.map((p, i) => ({ ...p, cle: specs[i]?.cle }));
    const postes: Array<PosteCalcule & { cle?: string }> = [
      ...avecCles(ce.revenus, POSTES_REVENUS_PROJET),
      total('XA', 'TOTAL REVENUS'),
      ...avecCles(ce.charges, POSTES_CHARGES_PROJET),
      total('XB', 'TOTAL CHARGES'),
      total('XC', 'SOLDE : EXCEDENT OU PERTE (XA - XB)'),
    ];
    return construireFeuilleEtat(classeur, {
      nom: 'Compte Exploitation',
      titre: "COMPTE D'EXPLOITATION",
      taille: 14,
      ident,
      pageRef: "COMPTE D'EXPLOITATION\nPROJETS DE\nDEVELOPPEMENT",
      libelleColonne: 'LIBELLES',
      groupes: ExportService.GROUPES_NET,
      lignes: this.lignesProjetEtafi(postes),
      totaux: TOTAUX_PROJETS_CE,
    });
  }

  /** Compte d'exploitation · export individuel, charte ETAFI. */
  async compteExploitationProjetExcel(tenantId: string, exerciceId: string): Promise<ClasseurExporte> {
    const [ce, ident] = await Promise.all([
      this.etatsFinanciersProjetService.compteExploitation(tenantId, exerciceId),
      this.identiteLiasse(tenantId, exerciceId),
    ]);
    const classeur = this.nouveauClasseur();
    const rangs = this.feuilleCompteExploitationEtafi(classeur, ce, ident);
    ligneControleSousEtat(
      classeur.getWorksheet('Compte Exploitation')!,
      Math.max(...rangs.values()) + 2,
      ce.controle.boucleAZero
        ? 'Contrôle : le compte d’exploitation boucle à zéro (XC = 0), régime normal du jeu projets.'
        : `CONTRÔLE : XC = ${ce.solde.toLocaleString('fr-FR')} · le compte d'exploitation ne boucle pas à zéro (voir Notes).`,
    );
    numeroterPages(classeur);
    return {
      buffer: await this.versBuffer(classeur),
      nomFichier: `compte-exploitation-projet${await this.suffixeExercice(tenantId, exerciceId)}.xlsx`,
    };
  }


  /**
   * NOTE 9 : FONDS DU BAILLEUR (Partie 4, ch. 3, Section 6) · comptabilité
   * analytique par projet/bailleur (docs/plan-de-construction.md item 14).
   * Une ligne par bailleur, Fonds d'investissement puis Fonds
   * d'administration côte à côte · voir
   * `EtatsFinanciersProjetService.noteBailleur` pour la convention retenue
   * sur Montant décaissé/consommé (les deux anomalies du texte officiel
   * qu'elle documente).
   */
  async noteBailleurExcel(tenantId: string, exerciceId: string): Promise<ClasseurExporte> {
    const note = await this.etatsFinanciersProjetService.noteBailleur(tenantId, exerciceId);

    const classeur = this.nouveauClasseur();
    const feuille = classeur.addWorksheet('Note 9 · Fonds du bailleur');
    feuille.columns = [
      { header: 'Bailleur', key: 'bailleur', width: 28 },
      { header: 'Investissement · Décaissé', key: 'iDecaisse', width: 20 },
      { header: 'Investissement · Consommé', key: 'iConsomme', width: 20 },
      { header: 'Investissement · Solde restant', key: 'iSolde', width: 22 },
      { header: 'Administration · Décaissé', key: 'aDecaisse', width: 20 },
      { header: 'Administration · Consommé', key: 'aConsomme', width: 20 },
      { header: 'Administration · Solde restant', key: 'aSolde', width: 22 },
    ];

    const bailleurs = new Map<string, { nom: string; code: string }>();
    for (const b of [...note.investissement, ...note.administration]) {
      bailleurs.set(b.bailleur.id, { nom: b.bailleur.nom, code: b.bailleur.code });
    }
    for (const [id, { nom, code }] of bailleurs) {
      const inv = note.investissement.find((b) => b.bailleur.id === id);
      const adm = note.administration.find((b) => b.bailleur.id === id);
      feuille.addRow({
        bailleur: `${code} · ${nom}`,
        iDecaisse: inv?.decaisse ?? 0,
        iConsomme: inv?.consomme ?? 0,
        iSolde: inv?.soldeRestant ?? 0,
        aDecaisse: adm?.decaisse ?? 0,
        aConsomme: adm?.consomme ?? 0,
        aSolde: adm?.soldeRestant ?? 0,
      });
    }
    if (note.investissementNonAffecte.decaisse !== 0 || note.administrationNonAffecte.decaisse !== 0) {
      const ligneNonAffecte = feuille.addRow({
        bailleur: 'NON AFFECTÉ (comptes 162-164/462-464 sans bailleur rattaché)',
        iDecaisse: note.investissementNonAffecte.decaisse,
        iConsomme: note.investissementNonAffecte.consomme,
        iSolde: note.investissementNonAffecte.soldeRestant,
        aDecaisse: note.administrationNonAffecte.decaisse,
        aConsomme: note.administrationNonAffecte.consomme,
        aSolde: note.administrationNonAffecte.soldeRestant,
      });
      ligneNonAffecte.font = { italic: true, color: { argb: 'FFB00020' } };
    }
    const ligneTotal = feuille.addRow({
      bailleur: 'TOTAL DES FONDS DU BAILLEUR',
      iDecaisse: note.totalInvestissement.decaisse,
      iConsomme: note.totalInvestissement.consomme,
      iSolde: note.totalInvestissement.soldeRestant,
      aDecaisse: note.totalAdministration.decaisse,
      aConsomme: note.totalAdministration.consomme,
      aSolde: note.totalAdministration.soldeRestant,
    });
    ligneTotal.font = ENTETE_FONT;

    this.appliquerFormats(feuille, {
      iDecaisse: FORMAT_MONTANT,
      iConsomme: FORMAT_MONTANT,
      iSolde: FORMAT_MONTANT,
      aDecaisse: FORMAT_MONTANT,
      aConsomme: FORMAT_MONTANT,
      aSolde: FORMAT_MONTANT,
    });
    styliserEntete(feuille.getRow(1));
    feuille.views = [{ state: 'frozen', ySplit: 1 }];

    const note9 = feuille.addRow([
      'Montants CUMULÉS depuis l’origine du projet, toutes périodes confondues · la Note 9 suit le cycle de vie du ' +
        'projet, pas l’exercice comptable. Décaissé = mouvements crédit (hors report à-nouveau) sur les sous-comptes ' +
        '162-164/462-464 rattachés au bailleur ; Consommé = mouvements débit ; Solde restant = Décaissé − Consommé. ' +
        'Convention détaillée dans EtatsFinanciersProjetService.noteBailleur (2 ambiguïtés du texte officiel ' +
        'signalées, résolues par lecture directe des écritures Partie 3 ch. 3, pas par invention).',
    ]);
    note9.font = { italic: true, color: { argb: 'FF555555' } };
    feuille.mergeCells(`A${note9.number}:G${note9.number}`);

    return {
      buffer: await this.versBuffer(classeur),
      nomFichier: `note9-fonds-bailleur${await this.suffixeExercice(tenantId, exerciceId)}.xlsx`,
    };
  }

  // ==========================================================================
  // NOTES ANNEXES · un classeur par jeu, une feuille par TABLEAU (pas par
  // code de note) : une note à plusieurs sous-tableaux · Note 1, ses trois
  // grilles ; Note 4/7/20B/29B, leurs deux · a des colonnes DIFFÉRENTES d'un
  // tableau à l'autre. Les empiler sur une même feuille mélangerait des
  // en-têtes incompatibles ; une feuille par tableau les garde chacune
  // propre, la « Fiche récapitulative » relie les tableaux d'un même code.
  //
  // Article 15 : « les Notes annexes sont organisées par une référence
  // croisée avec l'information liée » · `note.renvoyeeDepuis` porte les
  // codes REF des postes d'état qui renvoient à chaque note, reproduit tel
  // quel en commentaire de feuille.
  //
  // § 1.4, note officielle de la fiche récapitulative (identique dans les
  // deux jeux) : « les Notes non documentées ne doivent pas être jointes aux
  // états financiers ». Une note NON applicable n'a donc PAS sa propre
  // feuille · seulement une ligne « N/A » dans la fiche récapitulative.
  // ==========================================================================

  /**
   * Valeur d'une colonne pour une ligne, au type de colonne déclaré par la
   * note. Les quatre colonnes « historiques » (montant N/N-1, variations)
   * vivent sur des champs dédiés de `LigneNoteCalculee` ; toutes les autres
   * (mouvements, ventilation par nature, échéances, variation absolue)
   * vivent dans `valeurs`, indexé par le même `TypeColonneNote` · voir
   * `note-annexe.types.ts`. `LIBRE` n'a rien à calculer : c'est une colonne
   * de saisie (devise, cours, identité d'un apporteur…), jamais un oubli.
   */
  private valeurColonneNote(ligne: LigneNoteCalculee, type: TypeColonneNote): number | null {
    switch (type) {
      case 'EXERCICE_N':
        return ligne.montantN;
      case 'EXERCICE_N1':
        return ligne.montantN1 ?? null;
      case 'VARIATION_VALEUR':
        return ligne.variationValeur ?? null;
      case 'VARIATION_POURCENT':
        return ligne.variationPourcent ?? null;
      case 'LIBRE':
        return null;
      default:
        return ligne.valeurs?.[type] ?? null;
    }
  }

  /**
   * Feuille d'UNE note annexe, dans la présentation exacte du modèle :
   * cartouche, titre « NOTE X : … » en Arial Black 003366, bandeau
   * d'en-têtes CCFFFF, lignes Arial 9 (totaux sur bande grise), format
   * comptable, cadre extérieur. Une note à PLUSIEURS tableaux (Note 1 et ses
   * trois grilles, 4, 7…) les EMPILE sur la même feuille, chacun sous son
   * sous-titre · exactement comme les feuilles NOTE du classeur modèle. Le
   * CONTENU (colonnes et rubriques) vient du moteur déclaratif de notes du
   * serveur · même texte officiel que le moteur Python du skill.
   */
  private feuilleNote(classeur: ExcelJS.Workbook, tableaux: NoteCalculee[], ident: IdentiteLiasse) {
    const code = tableaux[0].code;
    const nomFeuille = `NOTE ${code}`;
    const ws = classeur.addWorksheet(nomFeuille);
    const colMax = Math.max(...tableaux.map((t) => 1 + t.colonnes.length), 5);
    ecrireCartouche(ws, ident, nomFeuille, colMax);
    titreNote(ws, `NOTE ${code} : ${tableaux[0].titre.toUpperCase()}`, colMax);

    let r = 7;
    const commentaires: string[] = [];
    for (const note of tableaux) {
      const ncols = 1 + note.colonnes.length;
      r += 1;
      if (tableaux.length > 1 && note.sousTableau) {
        const c = ws.getCell(r, 1);
        c.value = note.sousTableau;
        c.font = { name: 'Arial', size: 9, bold: true };
        fusion(ws, r, 1, r, ncols);
        r += 1;
      }
      const debutTableau = r;
      ws.getCell(r, 1).value = 'Libellés';
      note.colonnes.forEach((c: ColonneNote, i: number) => {
        ws.getCell(r, 2 + i).value = c.libelle;
      });
      entetesBande(ws, r, r, 1, ncols);
      ws.getRow(r).height = 30;

      const colsMontant = note.colonnes
        .map((c: ColonneNote, i: number) => (c.type !== 'LIBRE' && c.type !== 'VARIATION_POURCENT' ? 2 + i : -1))
        .filter((x: number) => x > 0);
      const colsPourcent = note.colonnes
        .map((c: ColonneNote, i: number) => (c.type === 'VARIATION_POURCENT' ? 2 + i : -1))
        .filter((x: number) => x > 0);

      for (const l of note.lignes) {
        r += 1;
        ws.getCell(r, 1).value = l.libelle;
        note.colonnes.forEach((c: ColonneNote, i: number) => {
          const v = this.valeurColonneNote(l, c.type);
          if (v !== null && v !== undefined) ws.getCell(r, 2 + i).value = v;
        });
        styleLigne(ws, r, 1, ncols, l.estTotal ? 'inter' : 'normal', colsMontant);
        for (const c of colsPourcent) ws.getCell(r, c).numFmt = '#,##0.00"%"';
        ws.getRow(r).height = 18;
        // Rubrique en attente de rattachement : signalée plutôt que laissée
        // à zéro sans explication · un zéro muet se lirait comme un montant.
        if (l.enAttenteDeRattachement) {
          ws.getCell(r, 1).font = { name: 'Arial', size: 9, italic: true, color: { argb: 'FFB00020' } };
          ws.getCell(r, 1).note = `EN ATTENTE DE RATTACHEMENT : ${l.enAttenteDeRattachement}`;
        }
        if (l.ecartCloture !== undefined) {
          ws.getCell(r, 1).note =
            `Écart de clôture : ${l.ecartCloture.toFixed(2)} · la clôture recalculée (D = A + B − C) ne ` +
            `correspond pas au solde réel de la balance. Anomalie du dossier à examiner (report à-nouveau ` +
            `manquant, écriture hors comptes de la rubrique…).`;
        }
        if (l.echeanceNonVentilee !== undefined) {
          const existante = ws.getCell(r, 1).note;
          ws.getCell(r, 1).note =
            (existante ? `${existante}\n` : '') +
            `Part non ventilée par échéance (aucune date d'échéance saisie) : ${l.echeanceNonVentilee.toFixed(2)}.`;
        }
        if (l.renvoi) ws.getCell(r, ncols).note = l.renvoi;
      }
      cadre(ws, debutTableau, 1, r, ncols, MOYEN);
      r += 1; // une ligne d'air entre deux tableaux empilés

      if (note.renvoyeeDepuis?.length) commentaires.push(`Renvoyée depuis les postes : ${note.renvoyeeDepuis.join(', ')}.`);
      if (note.renvoiOfficiel) commentaires.push(note.renvoiOfficiel);
      if (note.commentaire) commentaires.push(`Commentaire officiel : ${note.commentaire}`);
      if (note.lignes.length === 0) {
        commentaires.push(
          'Aucune rubrique chiffrée cet exercice ; les rubriques en attente de rattachement du dossier sont listées ' +
            'quand même, pour que le rattachement reste possible.',
        );
      }
    }
    if (commentaires.length) ligneControleSousEtat(ws, r + 1, [...new Set(commentaires)].join(' '));

    const nbColonnesMax = Math.max(...tableaux.map((t) => t.colonnes.length));
    const spec: Record<string, number> = { A: 46 };
    for (let i = 0; i < nbColonnesMax; i++) spec[String.fromCharCode(66 + i)] = 18;
    largeurs(ws, spec);
    ws.views = [{ state: 'frozen', ySplit: 7, showGridLines: false }];
  }

  /**
   * Fiche récapitulative · Partie 4, section 4 des deux jeux, dans la forme
   * du modèle (feuille « NOTES ANNEXES » : bandes grises de parties,
   * colonnes « A (2) » / « N/A (2) » cochées, renvois (1) et (2) en pied).
   * Une note non applicable y figure SANS feuille propre · la fiche est sa
   * seule trace dans le classeur.
   */
  private feuilleFicheRecapitulative(
    classeur: ExcelJS.Workbook,
    fiche: Array<{ code: string; titre: string; applicable: boolean }>,
    ident: IdentiteLiasse,
    parties?: Array<[string, string[]]>,
  ) {
    const parCode = new Map(fiche.map((n) => [n.code, n]));
    const groupes: PartiesNotes = (parties ?? [['NOTES ANNEXES', fiche.map((n) => n.code)]]).map(([titre, codes]) => [
      titre,
      codes
        .filter((code) => parCode.has(code))
        .map((code) => [`NOTE ${code}`, parCode.get(code)!.titre] as [string, string]),
    ]);
    const applicables = new Set(fiche.filter((n) => n.applicable).map((n) => `NOTE ${n.code}`));
    construireFicheNotes(classeur, groupes, ident, applicables);
  }

  /** Tri des codes de notes : par l'ordre officiel des parties quand il est
   *  fourni, sinon numérique puis alphabétique (2 < 5A < 5B < 13 < 29B). */
  private comparateurNotes(parties?: Array<[string, string[]]>): (a: string, b: string) => number {
    if (parties) {
      const rang = new Map<string, number>();
      let i = 0;
      for (const [, codes] of parties) for (const code of codes) rang.set(code, i++);
      return (a, b) => (rang.get(a) ?? 999) - (rang.get(b) ?? 999) || a.localeCompare(b);
    }
    const decompose = (code: string): [number, string] => {
      const m = /^(\d+)([A-Z]*)$/.exec(code);
      return m ? [Number(m[1]), m[2]] : [999, code];
    };
    return (a, b) => {
      const [na, sa] = decompose(a);
      const [nb, sb] = decompose(b);
      return na - nb || sa.localeCompare(sb);
    };
  }

  private construireClasseurNotes(
    resultat: { notes: NoteCalculee[]; ficheRecapitulative: any[]; couverture: { transcrites: number; attendues: number } },
    ident: IdentiteLiasse,
    parties?: Array<[string, string[]]>,
    classeur?: ExcelJS.Workbook,
  ): ExcelJS.Workbook {
    const cible = classeur ?? this.nouveauClasseur();
    this.feuilleFicheRecapitulative(cible, resultat.ficheRecapitulative, ident, parties);

    // Une feuille par CODE de note, les sous-tableaux empilés dessus, dans
    // l'ordre officiel · le classeur se feuillette comme le texte se lit.
    const parCode = new Map<string, NoteCalculee[]>();
    for (const n of resultat.notes) {
      if (!n.applicable) continue; // § 1.4 : non jointe, voir en-tête de section.
      parCode.set(n.code, [...(parCode.get(n.code) ?? []), n]);
    }
    const comparer = this.comparateurNotes(parties);
    for (const code of [...parCode.keys()].sort(comparer)) {
      this.feuilleNote(cible, parCode.get(code)!, ident);
    }
    return cible;
  }


  /** Découpage officiel de la fiche récapitulative du jeu associations. */
  private static readonly PARTIES_NOTES_ASSOCIATIONS: Array<[string, string[]]> = [
    ['Partie 1 : Informations générales', ['1', '2', '3', '4']],
    [
      'Partie 2 : Notes sur le bilan',
      ['5A', '5B', '5C', '5D', '5E', '5F', '5G', '5H', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17A', '17B', '18A', '18B', '19', '20', '21', '22'],
    ],
    ['Partie 3 : Notes sur le compte de résultat', ['23', '24', '25', '26', '27', '28', '29A', '29B', '30', '31', '32']],
    ['Partie 4 : Autres informations', ['33', '34', '35']],
  ];

  /** Notes annexes du jeu « associations et ordres professionnels ». */
  async notesAssociationsExcel(tenantId: string, exerciceId: string): Promise<ClasseurExporte> {
    const [resultat, ident] = await Promise.all([
      this.noteAnnexeService.notesAssociations(tenantId, exerciceId),
      this.identiteLiasse(tenantId, exerciceId),
    ]);
    const classeur = this.construireClasseurNotes(resultat, ident, ExportService.PARTIES_NOTES_ASSOCIATIONS);
    numeroterPages(classeur);
    return {
      buffer: await this.versBuffer(classeur),
      nomFichier: `notes-annexes-associations${await this.suffixeExercice(tenantId, exerciceId)}.xlsx`,
    };
  }

  /**
   * Notes annexes du jeu « projets de développement et assimilés ». La
   * note 9 « Fonds du bailleur » y figure comme un simple RENVOI (colonnes
   * dynamiques par bailleur, hors de la forme de ce moteur) vers
   * `noteBailleurExcel` · voir `NoteAnnexeService.notesProjet`.
   */
  async notesProjetExcel(tenantId: string, exerciceId: string): Promise<ClasseurExporte> {
    const [resultat, ident] = await Promise.all([
      this.noteAnnexeService.notesProjet(tenantId, exerciceId),
      this.identiteLiasse(tenantId, exerciceId),
    ]);
    const classeur = this.construireClasseurNotes(resultat, ident);
    numeroterPages(classeur);
    return {
      buffer: await this.versBuffer(classeur),
      nomFichier: `notes-annexes-projet${await this.suffixeExercice(tenantId, exerciceId)}.xlsx`,
    };
  }

  // -------------------------------------------------------------------------
  // Registre des donateurs (art. 17-18)
  // -------------------------------------------------------------------------

  /**
   * Le registre lui-même, plus le rapport de conformité de l'article 18.
   *
   * L'article 17 admet expressément que « ce registre peut être tenu en
   * version physique reliée, brochée ou en version électronique » · mais la
   * version physique reste « cotée, paraphée et numérotée de façon continue
   * PAR LA JURIDICTION COMPÉTENTE ». Ce classeur est donc conçu pour être
   * imprimé et présenté : le numéro d'ordre est la PREMIÈRE colonne, les
   * lignes sortent dans l'ordre de leur numérotation, et les lignes annulées
   * y figurent barrées et motivées parce qu'un registre dont on aurait
   * retiré les annulations se présenterait à la juridiction avec des trous.
   */
  async registreDonateursExcel(tenantId: string, exerciceId: string): Promise<ClasseurExporte> {
    const [lignes, rapport] = await Promise.all([
      this.donationService.lister(tenantId, { exerciceId }),
      this.donationService.rapportConformite(tenantId, exerciceId),
    ]);

    const classeur = this.nouveauClasseur();
    this.feuilleRegistre(classeur, lignes);
    this.feuilleConformite(classeur, rapport);
    this.feuilleRapprochementRegistre(classeur, rapport.rapprochement);

    return {
      buffer: await this.versBuffer(classeur),
      nomFichier: `registre-donateurs${await this.suffixeExercice(tenantId, exerciceId)}.xlsx`,
    };
  }

  private feuilleRegistre(classeur: ExcelJS.Workbook, lignes: any[]) {
    const feuille = classeur.addWorksheet('Registre des donateurs');
    // L'ordre des colonnes suit l'article 17 : numéro d'ordre, puis point 1
    // (date), puis nature, puis points 2 et 3 (identité selon le type de
    // donateur), puis point 4 (montant et mode de libération), puis la
    // signature exigée par le dernier alinéa.
    feuille.columns = [
      { header: 'N°', key: 'numero', width: 7 },
      { header: 'Date de l’opération', key: 'dateOperation', width: 16 },
      { header: 'Nature', key: 'nature', width: 11 },
      { header: 'Type de donateur', key: 'typeDonateur', width: 18 },
      { header: 'Nom', key: 'nom', width: 20 },
      { header: 'Prénoms', key: 'prenoms', width: 20 },
      { header: 'Domicile', key: 'domicile', width: 26 },
      { header: 'Dénomination', key: 'denomination', width: 26 },
      { header: 'N° d’immatriculation', key: 'numeroImmatriculation', width: 22 },
      { header: 'N° d’identification fiscale', key: 'numeroIdentificationFiscale', width: 22 },
      { header: 'Adresse du siège social', key: 'adresseSiegeSocial', width: 28 },
      { header: 'Adresse électronique', key: 'adresseElectronique', width: 26 },
      { header: 'Montant', key: 'montant', width: 14 },
      { header: 'Mode de libération', key: 'modeLiberation', width: 18 },
      { header: 'Désignation du bien (nature)', key: 'designationNature', width: 30 },
      { header: 'Signée par (représentant légal)', key: 'signeePar', width: 28 },
      { header: 'Signée le', key: 'signeeLe', width: 16 },
      { header: 'Écriture comptable', key: 'ecriture', width: 24 },
      { header: 'Annulée', key: 'annulee', width: 9 },
      { header: 'Motif d’annulation', key: 'motifAnnulation', width: 34 },
      { header: 'Mentions manquantes (art. 17)', key: 'manquements', width: 34 },
    ];

    for (const d of lignes) {
      const rang = feuille.addRow({
        ...d,
        dateOperation: new Date(d.dateOperation),
        signeeLe: d.signeeLe ? new Date(d.signeeLe) : null,
        ecriture: d.ecriture ? `${d.ecriture.numeroPiece ?? ''} ${d.ecriture.libelle}`.trim() : '',
        annulee: d.annulee ? 'OUI' : '',
        manquements: manquementsArticle17(d).map((m) => m.champ).join(', '),
      });
      // Barrée, pas retirée : son numéro reste occupé (art. 17).
      if (d.annulee) rang.font = { strike: true, color: { argb: 'FF999999' } };
    }

    this.appliquerFormats(feuille, { dateOperation: FORMAT_DATE, signeeLe: FORMAT_DATE, montant: FORMAT_MONTANT });
    this.finaliserTableau(feuille, feuille.columns.length, lignes.length + 1);
  }

  /** Constatations de l'article 18, dans l'ordre où elles se lisent. */
  private feuilleConformite(classeur: ExcelJS.Workbook, rapport: any) {
    const feuille = classeur.addWorksheet('Conformité (art. 18)');
    feuille.columns = [
      { header: 'Constatation', key: 'constatation', width: 44 },
      { header: 'Résultat', key: 'resultat', width: 22 },
      { header: 'Fondement / détail', key: 'detail', width: 96 },
    ];

    const n = rapport.numerotation;
    const nonSignees = rapport.signature.lignesNonSignees;
    const incompletes = rapport.completude.lignesIncompletes;

    const constats: Array<[string, string, string]> = [
      [
        'Existence du registre',
        rapport.existence.registreOuvert ? 'OUI' : 'NON',
        `Art. 18 : le rapport « constate l’existence du registre des donateurs ». ${rapport.existence.lignesTotalRegistre} ligne(s) au registre, dont ${rapport.existence.lignesSurExercice} sur l’exercice (${rapport.existence.lignesAnnuleesSurExercice} annulée(s)).`,
      ],
      [
        'Numérotation continue',
        n.continue ? 'CONFORME' : 'NON CONFORME',
        `${n.exigence} Numéros ${n.premier ?? ''} à ${n.dernier ?? ''}.` +
          (n.trous.length ? ` Trous : ${n.trous.join(', ')}.` : '') +
          (n.doublons.length ? ` Doublons : ${n.doublons.join(', ')}.` : ''),
      ],
      [
        'Signature du représentant légal',
        nonSignees.length === 0 ? 'CONFORME' : `${nonSignees.length} ligne(s) non signée(s)`,
        `${rapport.signature.exigence}` +
          (nonSignees.length ? ` Lignes n° ${nonSignees.map((l: any) => l.numero).join(', ')}.` : ''),
      ],
      [
        'Contenu obligatoire (art. 17, points 1 à 4)',
        incompletes.length === 0 ? 'CONFORME' : `${incompletes.length} ligne(s) incomplète(s)`,
        incompletes.length
          ? incompletes
              .map((l: any) => `n° ${l.numero} : ${l.manquements.map((m: any) => m.champ).join(', ')}`)
              .join(' ; ')
          : 'Toutes les mentions exigées sont renseignées.',
      ],
      [
        'Rapprochement avec la comptabilité',
        rapport.rapprochement.rapproche ? 'RAPPROCHÉ' : `Écart de ${rapport.rapprochement.ecart}`,
        rapport.rapprochement.lecture,
      ],
    ];
    for (const [constatation, resultat, detail] of constats) {
      const rang = feuille.addRow({ constatation, resultat, detail });
      const conforme = ['OUI', 'CONFORME', 'RAPPROCHÉ'].includes(resultat);
      rang.getCell('resultat').font = { bold: true, color: { argb: conforme ? 'FF1B7F3B' : 'FFB3261E' } };
      rang.getCell('detail').alignment = { wrapText: true, vertical: 'top' };
    }
    this.finaliserTableau(feuille, 3, constats.length + 1);

    // L'article 18 laisse l'AVIS à l'auditeur (ou la déclaration aux
    // dirigeants) : le classeur s'arrête aux constatations et le dit.
    const reserve = feuille.addRow([
      'Ces constatations ne valent pas avis. Art. 18 : « S’il existe un auditeur, ce dernier soumet […] un rapport qui constate l’existence du registre des donateurs et donne son avis sur sa tenue conforme. S’il n’existe pas d’auditeur, une déclaration des dirigeants attestant de la tenue conforme du registre des donateurs est annexée audit rapport ou soumise à l’assemblée générale ou l’instance qui en tient lieu. »',
    ]);
    reserve.font = { italic: true, color: { argb: 'FF555555' } };
    feuille.mergeCells(`A${reserve.number}:C${reserve.number}`);
  }

  /** Le rapprochement, avec les comptes frontière chiffrés mais jamais agrégés. */
  private feuilleRapprochementRegistre(classeur: ExcelJS.Workbook, r: any) {
    const feuille = classeur.addWorksheet('Rapprochement comptable');
    feuille.columns = [
      { header: 'Catégorie', key: 'categorie', width: 22 },
      { header: 'Compte', key: 'numero', width: 10 },
      { header: 'Intitulé', key: 'intitule', width: 52 },
      { header: 'Lecture', key: 'lecture', width: 14 },
      { header: 'Montant', key: 'montant', width: 14 },
      { header: 'Fondement (texte officiel)', key: 'fondement', width: 110 },
    ];

    const bloc = (categorie: string, comptes: any[]) => {
      for (const c of comptes) {
        const rang = feuille.addRow({ categorie, ...c });
        rang.getCell('fondement').alignment = { wrapText: true, vertical: 'top' };
        if (categorie !== 'Libéralité') rang.font = { color: { argb: 'FF777777' } };
      }
    };
    bloc('Libéralité', r.comptesLiberalite);
    bloc('Frontière', r.comptesFrontiere);
    bloc('Hors périmètre', r.comptesHorsPerimetre);

    const derniere = feuille.lastRow!.number;
    this.appliquerFormats(feuille, { montant: FORMAT_MONTANT });
    this.finaliserTableau(feuille, 6, derniere);

    feuille.addRow([]);
    const totaux: Array<[string, number | string]> = [
      ['Total comptabilisé (comptes « Libéralité » seuls)', r.totalComptable],
      ['Total du registre sur l’exercice', r.totalRegistre],
      ['Écart', r.ecart],
    ];
    for (const [libelle, valeur] of totaux) {
      const rang = feuille.addRow({ intitule: libelle, montant: valeur });
      rang.font = ENTETE_FONT;
      rang.getCell('montant').numFmt = FORMAT_MONTANT;
    }
    const lecture = feuille.addRow({ intitule: r.lecture });
    lecture.font = { italic: true, color: { argb: r.rapproche ? 'FF1B7F3B' : 'FFB3261E' } };

    const avertissement = feuille.addRow([r.avertissement]);
    avertissement.font = { italic: true, color: { argb: 'FF555555' } };
    avertissement.alignment = { wrapText: true, vertical: 'top' };
    feuille.mergeCells(`A${avertissement.number}:F${avertissement.number}`);
  }

  // -------------------------------------------------------------------------
  // Livre d'inventaire (art. 14) et rapport d'activité (art. 16-3)
  // -------------------------------------------------------------------------

  /**
   * Le livre d'inventaire tel qu'il se présente : une feuille de garde qui
   * dit ce que l'article 14 exige et ce que la transcription porte, puis les
   * états FIGÉS, puis le résumé de l'opération d'inventaire.
   *
   * Les états sont relus depuis la transcription, JAMAIS recalculés · c'est
   * le sens même du mot « transcrits » de l'article. Un classeur qui
   * régénérerait les états à l'export produirait, à partir du même livre,
   * deux documents différents à deux dates différentes.
   */
  async livreInventaireExcel(tenantId: string, exerciceId: string): Promise<ClasseurExporte> {
    const [transcription, conformite] = await Promise.all([
      this.livreInventaire.courante(tenantId, exerciceId),
      this.livreInventaire.conformite(tenantId, exerciceId),
    ]);

    const classeur = this.nouveauClasseur();
    this.feuilleGardeInventaire(classeur, conformite, transcription);

    if (transcription) {
      const etats = transcription.etats as Record<string, any>;
      // Ordre de l'article 14, pas ordre alphabétique des clés : le livre se
      // lit dans l'ordre où le texte énumère les états.
      for (const e of conformite.etatsExiges) {
        const etat = etats[e.cle];
        if (etat) this.feuilleEtatFige(classeur, e.libelle, etat);
      }
    }

    return {
      buffer: await this.versBuffer(classeur),
      nomFichier: `livre-inventaire${await this.suffixeExercice(tenantId, exerciceId)}.xlsx`,
    };
  }

  private feuilleGardeInventaire(classeur: ExcelJS.Workbook, c: any, t: any) {
    const feuille = classeur.addWorksheet("Livre d'inventaire");
    feuille.columns = [
      { header: 'Rubrique', key: 'rubrique', width: 44 },
      { header: 'État', key: 'etat', width: 24 },
      { header: 'Détail', key: 'detail', width: 110 },
    ];

    const lignes: Array<[string, string, string]> = [
      ["Transcription de l'exercice", t ? `VERSION ${t.version}` : 'ABSENTE', c.exigence],
      [
        'Jeu applicable',
        c.jeu === 'PROJETS_DEVELOPPEMENT' ? 'Art. 14, point 2' : 'Art. 14, point 1',
        c.jeu === 'PROJETS_DEVELOPPEMENT'
          ? 'Entités ayant pour objet la gestion ou l’administration de projets de développement.'
          : 'Associations et ordres professionnels.',
      ],
      ...c.etatsExiges.map(
        (e: any) =>
          [
            `État exigé · ${e.libelle}`,
            e.transcrit ? 'TRANSCRIT' : 'MANQUANT',
            e.motifIndisponibilite ?? 'Transcrit et figé dans ce classeur, feuille dédiée.',
          ] as [string, string, string],
      ),
      [
        "Résumé de l'opération d'inventaire",
        c.resume.renseigne ? 'RENSEIGNÉ' : 'MANQUANT',
        `${c.resume.exigence} ${c.resume.remarque}`,
      ],
    ];

    for (const [rubrique, etat, detail] of lignes) {
      const rang = feuille.addRow({ rubrique, etat, detail });
      const ok = ['TRANSCRIT', 'RENSEIGNÉ'].includes(etat) || etat.startsWith('VERSION') || etat.startsWith('Art.');
      rang.getCell('etat').font = { bold: true, color: { argb: ok ? 'FF1B7F3B' : 'FFB3261E' } };
      rang.getCell('detail').alignment = { wrapText: true, vertical: 'top' };
    }
    this.finaliserTableau(feuille, 3, lignes.length + 1);

    if (t?.resumeOperationInventaire) {
      feuille.addRow([]);
      const titre = feuille.addRow(["Résumé de l'opération d'inventaire"]);
      titre.font = ENTETE_FONT;
      const texte = feuille.addRow([t.resumeOperationInventaire]);
      texte.alignment = { wrapText: true, vertical: 'top' };
      feuille.mergeCells(`A${texte.number}:C${texte.number}`);
    }

    const pied = feuille.addRow([
      t
        ? `Transcrit le ${new Date(t.transcritLe).toLocaleDateString('fr-FR')}. Les états des feuilles suivantes sont FIGÉS à cette date : ils sont relus tels quels, jamais recalculés · c'est le sens du mot « transcrits » de l'article 14.`
        : "Aucune transcription pour cet exercice. L'article 24 sanctionne pénalement les dirigeants « qui n'ont pas, pour un exercice, dressé l'inventaire et établi les états financiers annuels ».",
    ]);
    pied.font = { italic: true, color: { argb: 'FF555555' } };
    pied.alignment = { wrapText: true, vertical: 'top' };
    feuille.mergeCells(`A${pied.number}:C${pied.number}`);
  }

  /**
   * Un état figé, restitué à plat.
   *
   * La structure est DÉCOUVERTE, pas codée en dur : chaque état SYCEBNL a sa
   * forme propre (`actif`/`passif` au bilan, `produits`/`charges` au compte
   * de résultat, `revenus`/`charges` au compte d'exploitation, `lignes` au
   * tableau des flux), et un livre d'inventaire doit pouvoir restituer un
   * état FIGÉ PAR UNE VERSION ANTÉRIEURE du logiciel. Une carte de formes
   * codée en dur rendrait mal, ou pas du tout, un état gelé avant qu'elle ne
   * soit écrite · ce qui viderait de son sens la transcription même.
   *
   * On rend donc : tout tableau dont les éléments ressemblent à un poste
   * (`ref`/`libelle`/`montant`), sous le nom de sa clé ; puis les scalaires
   * numériques et booléens, qui sont les totaux et contrôles de l'état.
   *
   * (La mise en forme officielle de chaque état vit dans son propre export ·
   * `bilanExcel`, `compteDeResultatExcel`… ; ici c'est la transcription qui
   * fait foi, pas la présentation.)
   */
  private feuilleEtatFige(classeur: ExcelJS.Workbook, libelle: string, etat: any) {
    // 31 caractères est la limite Excel pour un nom de feuille.
    const feuille = classeur.addWorksheet(libelle.slice(0, 31));
    feuille.columns = [
      { header: 'Section', key: 'section', width: 22 },
      { header: 'REF', key: 'ref', width: 8 },
      { header: 'Libellé', key: 'libelle', width: 62 },
      { header: 'Exercice N', key: 'montant', width: 16 },
      { header: 'Exercice N-1', key: 'montantN1', width: 16 },
    ];

    const estPoste = (v: any) =>
      v !== null && typeof v === 'object' && ('ref' in v || 'section' in v) && !Array.isArray(v);

    let sectionCourante = '';
    for (const [cle, valeur] of Object.entries(etat ?? {})) {
      if (!Array.isArray(valeur) || valeur.length === 0 || !valeur.some(estPoste)) continue;
      sectionCourante = enMots(cle);
      const entete = feuille.addRow({ section: sectionCourante });
      entete.font = ENTETE_FONT;
      for (const l of valeur as any[]) {
        // Le tableau des flux intercale ses propres intitulés de section.
        if (l.section) {
          const s = feuille.addRow({ libelle: l.section });
          s.font = { italic: true, bold: true };
          continue;
        }
        const rang = feuille.addRow({
          ref: l.ref,
          libelle: l.libelle,
          montant: l.montant,
          montantN1: l.montantN1,
        });
        if (l.estTotal) rang.font = ENTETE_FONT;
      }
    }

    this.appliquerFormats(feuille, { montant: FORMAT_MONTANT, montantN1: FORMAT_MONTANT });
    this.finaliserTableau(feuille, 5, feuille.lastRow?.number ?? 1);

    // Totaux, résultats et contrôles : ce sont eux qui font foi de ce qui a
    // été ARRÊTÉ (équilibre du bilan, bouclage du tableau des flux). Un livre
    // d'inventaire qui les tairait laisserait relire les chiffres sans savoir
    // s'ils bouclaient au moment de la transcription.
    const scalaires = Object.entries(etat ?? {}).filter(
      ([, v]) => typeof v === 'number' || typeof v === 'boolean',
    );
    const controle = (etat ?? {}).controle;
    if (scalaires.length > 0 || controle) {
      feuille.addRow([]);
      const titre = feuille.addRow({ section: 'Totaux et contrôles figés' });
      titre.font = ENTETE_FONT;
      for (const [cle, v] of scalaires) {
        const rang = feuille.addRow({ libelle: enMots(cle), montant: typeof v === 'number' ? v : undefined });
        if (typeof v === 'boolean') rang.getCell('libelle').value = `${enMots(cle)} : ${v ? 'oui' : 'NON'}`;
        rang.getCell('montant').numFmt = FORMAT_MONTANT;
      }
      if (controle && typeof controle === 'object') {
        for (const [cle, v] of Object.entries(controle)) {
          const rang = feuille.addRow({
            libelle: typeof v === 'boolean' ? `${enMots(cle)} : ${v ? 'oui' : 'NON'}` : enMots(cle),
            montant: typeof v === 'number' ? v : undefined,
          });
          rang.getCell('montant').numFmt = FORMAT_MONTANT;
          if (typeof v === 'boolean' && !v) rang.font = { bold: true, color: { argb: 'FFB3261E' } };
        }
      }
    }
  }

  /**
   * Le rapport d'activité, section par section dans l'ordre de l'article
   * 16-3, avec la citation qui fonde chacune et la mention explicite d'une
   * section vide · un rapport amputé d'un contenu exigé n'est pas « établi ».
   */
  async rapportActiviteExcel(tenantId: string, exerciceId: string): Promise<ClasseurExporte> {
    const [rapport, conformite] = await Promise.all([
      this.rapportActivite.courant(tenantId, exerciceId),
      this.rapportActivite.conformite(tenantId, exerciceId),
    ]);

    const classeur = this.nouveauClasseur();
    const feuille = classeur.addWorksheet("Rapport d'activité");
    feuille.columns = [
      { header: 'Section', key: 'titre', width: 46 },
      { header: 'État', key: 'etat', width: 14 },
      { header: 'Contenu', key: 'contenu', width: 90 },
      { header: 'Exigence (texte officiel)', key: 'exigence', width: 96 },
    ];

    for (const s of SECTIONS_RAPPORT_ACTIVITE) {
      const contenu = (rapport?.[s.cle] as string | null) ?? null;
      const rang = feuille.addRow({
        titre: s.titre,
        etat: contenu ? 'RENSEIGNÉE' : 'VIDE',
        contenu: contenu ?? '',
        exigence: s.exigence,
      });
      rang.getCell('etat').font = { bold: true, color: { argb: contenu ? 'FF1B7F3B' : 'FFB3261E' } };
      for (const cle of ['contenu', 'exigence']) rang.getCell(cle).alignment = { wrapText: true, vertical: 'top' };
    }
    this.finaliserTableau(feuille, 4, SECTIONS_RAPPORT_ACTIVITE.length + 1);

    feuille.addRow([]);
    const f = conformite.fenetreEvenementsPosterieurs;
    const meta: Array<[string, string]> = [
      ["Date d'établissement", rapport ? new Date(rapport.etabliLe).toLocaleDateString('fr-FR') : 'Rapport non établi'],
      [
        'Fenêtre des événements postérieurs',
        f
          ? `du ${new Date(f.du).toLocaleDateString('fr-FR')} au ${new Date(f.au).toLocaleDateString('fr-FR')} · c'est la date d'établissement qui la ferme (art. 16-3).`
          : '·',
      ],
      [
        'Évolution de la trésorerie (figée du Tableau des flux)',
        conformite.tresorerie
          ? `ouverture ${conformite.tresorerie.ouverture} · variation ${conformite.tresorerie.variation} · clôture ${conformite.tresorerie.cloture}` +
            (conformite.tresorerie.boucle ? ' · tableau bouclé' : ' · ⚠ TABLEAU NON BOUCLÉ à cette date')
          : '·',
      ],
      [
        'Déclaration des dirigeants (registre des donateurs, art. 18)',
        conformite.declarationRegistreDonateurs.attendue
          ? conformite.declarationRegistreDonateurs.renseignee
            ? `Annexée. Registre ${conformite.declarationRegistreDonateurs.registreConforme ? 'conforme' : '⚠ NON CONFORME au rapport de l’art. 18'}.`
            : "⚠ ATTENDUE et absente : l'entité déclare n'avoir pas d'auditeur."
          : "Non attendue : l'entité déclare avoir un auditeur, qui produit son propre rapport (art. 18).",
      ],
    ];
    for (const [libelle, valeur] of meta) {
      const rang = feuille.addRow({ titre: libelle, contenu: valeur });
      rang.font = ENTETE_FONT;
      rang.getCell('contenu').alignment = { wrapText: true, vertical: 'top' };
      rang.getCell('contenu').font = { bold: false };
    }

    if (rapport?.declarationDirigeants) {
      feuille.addRow([]);
      const d = feuille.addRow({ titre: 'Texte de la déclaration', contenu: rapport.declarationDirigeants });
      d.getCell('contenu').alignment = { wrapText: true, vertical: 'top' };
    }

    return {
      buffer: await this.versBuffer(classeur),
      nomFichier: `rapport-activite${await this.suffixeExercice(tenantId, exerciceId)}.xlsx`,
    };
  }
  // -------------------------------------------------------------------------
  // Jeu « projets de développement » · les trois tableaux du point 2 de
  // l'article 14, dont la correspondance vient du Guide d'application, ch. 7.
  // -------------------------------------------------------------------------

  /**
   * Feuille `Emplois-Ressources` du modèle : REF | DESIGNATION | SOLDE CUMULE
   * DEBUT EXERCICE N | EXERCICE N | SOLDE CUMULE FIN EXERCICE N. La colonne
   * de l'exercice vient du serveur ; les cumuls de début de projet sont
   * extra-comptables (une balance d'exercice ne les porte pas) · la colonne
   * reste à compléter et la colonne de fin la totalise en formule C+D,
   * exactement comme le modèle. Les totaux I à VII sont en formules.
   */
  private feuilleEmploisRessourcesEtafi(
    classeur: ExcelJS.Workbook,
    er: Awaited<ReturnType<EtatsFinanciersProjetService['tableauEmploisRessources']>>,
    ident: IdentiteLiasse,
  ): Map<string, number> {
    const ws = classeur.addWorksheet('Emplois-Ressources');
    ecrireCartouche(ws, ident, 'EMPLOIS-RESSOURCES\nPROJETS DE\nDEVELOPPEMENT', 5);
    titreEtat(ws, 'TABLEAU EMPLOIS-RESSOURCES', 1, 5, 7, 14);
    let r = 8;
    for (const [i, h] of [
      'REF',
      'DESIGNATION',
      'SOLDE CUMULE DEBUT EXERCICE N',
      'EXERCICE N',
      'SOLDE CUMULE FIN EXERCICE N',
    ].entries()) {
      ws.getCell(r, i + 1).value = h;
    }
    entetesBande(ws, r, r, 1, 5);
    ws.getRow(r).height = 30;

    const rangs = new Map<string, number>();
    for (const l of er.lignes) {
      r += 1;
      rangs.set(l.ref, r);
      ws.getCell(r, 1).value = l.ref;
      ws.getCell(r, 2).value = l.libelle;
      if (!TOTAUX_TER[l.ref]) {
        ws.getCell(r, 4).value = l.montant;
        ws.getCell(r, 5).value = { formula: `C${r}+D${r}` };
      }
      styleLigne(ws, r, 1, 5, NIVEAUX_TER[l.ref] ?? 'normal', [3, 4, 5], 1);
      ws.getRow(r).height = 22;
    }
    for (const [ref, expression] of Object.entries(TOTAUX_TER)) {
      const rang = rangs.get(ref);
      if (!rang) continue;
      for (const col of [3, 4, 5]) {
        const lettre = String.fromCharCode(64 + col);
        const formule = expression.replace(/[A-Z]{2}/g, (composante) => {
          const rr = rangs.get(composante);
          return rr ? `${lettre}${rr}` : '0';
        });
        ws.getCell(rang, col).value = { formula: formule };
      }
    }
    cadre(ws, 8, 1, r, 5, MOYEN);
    r += 2;
    ligneControleSousEtat(
      ws,
      r,
      'Les soldes cumulés de début de projet (colonne C, lignes FU à FW et FX à FZ comprises) sont extra-comptables : ' +
        'à compléter depuis le suivi du projet. La ligne VII contrôle V = VI.',
    );
    largeurs(ws, { A: 7, B: 56, C: 19, D: 17, E: 19 });
    ws.views = [{ state: 'frozen', ySplit: 8, showGridLines: false }];
    return rangs;
  }

  /** Tableau emplois-ressources · export individuel, charte ETAFI. */
  async emploisRessourcesExcel(tenantId: string, exerciceId: string): Promise<ClasseurExporte> {
    const [er, ident] = await Promise.all([
      this.etatsFinanciersProjetService.tableauEmploisRessources(tenantId, exerciceId),
      this.identiteLiasse(tenantId, exerciceId),
    ]);
    const classeur = this.nouveauClasseur();
    this.feuilleEmploisRessourcesEtafi(classeur, er, ident);
    numeroterPages(classeur);
    return {
      buffer: await this.versBuffer(classeur),
      nomFichier: `emplois-ressources${await this.suffixeExercice(tenantId, exerciceId)}.xlsx`,
    };
  }

  /**
   * Feuille `Execution budgetaire` du modèle : Code | Libellé | Budget (1) |
   * Décaissement (2) | Engagement (3) | Réalisation (4 = 2 + 3) | Crédit
   * disponible (5 = 1 - 4) | Exécution budget % (4/1) · les trois dernières
   * en formules, comme le modèle. Le serveur remplit code, libellé, budget,
   * décaissements et engagements réels du plan analytique budgétaire · le
   * moteur Python du skill, lui, laisse la grille vierge (une balance ne
   * porte pas la nomenclature budgétaire).
   */
  private feuilleExecutionBudgetaireEtafi(
    classeur: ExcelJS.Workbook,
    eb: Awaited<ReturnType<EtatsFinanciersProjetBudgetService['executionBudgetaire']>>,
    ident: IdentiteLiasse,
  ): number {
    const ws = classeur.addWorksheet('Execution budgetaire');
    ecrireCartouche(ws, ident, 'EXECUTION BUDGETAIRE\nPROJETS DE\nDEVELOPPEMENT', 8);
    titreEtat(ws, "TABLEAU DE SUIVI D'EXECUTION DU BUDGET", 1, 8, 7, 14);
    let r = 8;
    for (const [i, h] of [
      'Code',
      'Libellé',
      "Budget de l'exercice (1)",
      'Décaissement (2)',
      'Engagement (3)',
      'Réalisation (4 = 2 + 3)',
      'Crédit disponible (5 = 1 - 4)',
      'Exécution budget % (4/1)',
    ].entries()) {
      ws.getCell(r, i + 1).value = h;
    }
    entetesBande(ws, r, r, 1, 8);
    ws.getRow(r).height = 34;
    const debut = r + 1;
    for (const l of eb.lignes) {
      r += 1;
      ws.getCell(r, 1).value = l.code;
      ws.getCell(r, 2).value = l.libelle;
      ws.getCell(r, 3).value = l.budget;
      ws.getCell(r, 4).value = l.decaissement;
      ws.getCell(r, 5).value = l.engagement;
      ws.getCell(r, 6).value = { formula: `D${r}+E${r}` };
      ws.getCell(r, 7).value = { formula: `C${r}-F${r}` };
      ws.getCell(r, 8).value = { formula: `IF(C${r}=0,"",F${r}/C${r})` };
      styleLigne(ws, r, 1, 8, 'normal', [3, 4, 5, 6, 7]);
      ws.getCell(r, 8).numFmt = '0.0%';
    }
    r += 1;
    ws.getCell(r, 2).value = 'TOTAL';
    for (const col of [3, 4, 5, 6, 7]) {
      const lettre = String.fromCharCode(64 + col);
      ws.getCell(r, col).value = { formula: `SUM(${lettre}${debut}:${lettre}${r - 1})` };
    }
    ws.getCell(r, 8).value = { formula: `IF(C${r}=0,"",F${r}/C${r})` };
    styleLigne(ws, r, 1, 8, 'inter', [3, 4, 5, 6, 7]);
    ws.getCell(r, 8).numFmt = '0.0%';
    cadre(ws, 8, 1, r, 8, MOYEN);
    r += 2;
    ligneControleSousEtat(
      ws,
      r,
      `Nomenclature budgétaire : plan analytique « ${eb.plan.code} · ${eb.plan.intitule} ». ` +
        'Décaissement = dépense payée (trésorerie touchée ou fournisseur lettré) ; engagement = dépense constatée non payée.',
    );
    largeurs(ws, { A: 10, B: 40, C: 16, D: 15, E: 15, F: 16, G: 17, H: 14 });
    ws.views = [{ state: 'frozen', ySplit: 8, showGridLines: false }];
    return r;
  }

  /**
   * Variante VIERGE de l'exécution budgétaire · quand le dossier n'a pas de
   * plan analytique à budgets, la liasse livre la grille du modèle à
   * remplir (14 lignes, formules posées) au lieu d'échouer.
   */
  private feuilleExecutionBudgetaireVierge(classeur: ExcelJS.Workbook, ident: IdentiteLiasse, raison: string) {
    const eb = {
      plan: { id: '', code: '·', intitule: 'aucun plan analytique à budgets' },
      lignes: Array.from({ length: 14 }, () => ({
        code: '',
        libelle: '',
        budget: null as unknown as number,
        decaissement: null as unknown as number,
        engagement: null as unknown as number,
        realisation: 0,
        creditDisponible: 0,
        executionPourcent: null,
      })),
    };
    const dernier = this.feuilleExecutionBudgetaireEtafi(
      classeur,
      eb as unknown as Awaited<ReturnType<EtatsFinanciersProjetBudgetService['executionBudgetaire']>>,
      ident,
    );
    ligneControleSousEtat(classeur.getWorksheet('Execution budgetaire')!, dernier + 1, raison);
  }

  /** Tableau d'exécution budgétaire · export individuel, charte ETAFI. */
  async executionBudgetaireExcel(tenantId: string, exerciceId: string, planId?: string): Promise<ClasseurExporte> {
    const [eb, ident] = await Promise.all([
      this.etatsFinanciersProjetBudgetService.executionBudgetaire(tenantId, exerciceId, planId),
      this.identiteLiasse(tenantId, exerciceId),
    ]);
    const classeur = this.nouveauClasseur();
    this.feuilleExecutionBudgetaireEtafi(classeur, eb, ident);
    numeroterPages(classeur);
    return {
      buffer: await this.versBuffer(classeur),
      nomFichier: `execution-budgetaire${await this.suffixeExercice(tenantId, exerciceId)}.xlsx`,
    };
  }

  /**
   * Feuille `Reconciliation tresorerie` du modèle : LIBELLE | REP. | MONTANT,
   * lignes A à I, G en bandeau vert et I en TOTAL bleu nuit, rappel de la
   * trésorerie de clôture et écart à expliquer sous le cadre.
   */
  private feuilleReconciliationEtafi(
    classeur: ExcelJS.Workbook,
    recon: Awaited<ReturnType<EtatsFinanciersProjetBudgetService['reconciliationTresorerie']>>,
    ident: IdentiteLiasse,
    /** Rangs du tableau emplois-ressources · fournis par la liasse, les
     *  lignes B, D et F se lient alors à lui, comme dans le modèle. */
    terRangs?: Map<string, number>,
  ): { rangs: Map<string, number>; dernier: number } {
    const ws = classeur.addWorksheet('Reconciliation tresorerie');
    ecrireCartouche(ws, ident, 'RECONCILIATION\nPROJETS DE\nDEVELOPPEMENT', 3);
    titreEtat(ws, 'TABLEAU DE RECONCILIATION DE LA TRESORERIE', 1, 3, 7, 14);
    let r = 8;
    ws.getCell(r, 1).value = 'LIBELLE';
    ws.getCell(r, 2).value = 'REP.';
    ws.getCell(r, 3).value = 'MONTANT';
    entetesBande(ws, r, r, 1, 3);
    ws.getRow(r).height = 22;
    const rangs = new Map<string, number>();
    for (const l of recon.lignes) {
      r += 1;
      rangs.set(l.rep, r);
      ws.getCell(r, 1).value = l.libelle;
      ws.getCell(r, 2).value = l.rep;
      ws.getCell(r, 3).value = l.montant;
      styleLigne(ws, r, 1, 3, NIVEAUX_RECONCILIATION[l.rep] ?? 'normal', [3], 2);
      ws.getRow(r).height = 22;
    }
    // Dans la liasse, B, D et F se lient au tableau emplois-ressources ·
    // les deux états ne peuvent alors plus diverger.
    if (terRangs) {
      const er = (ref: string) => `'Emplois-Ressources'!D${terRangs.get(ref)}`;
      if (rangs.has('B')) ws.getCell(rangs.get('B')!, 3).value = { formula: `${er('FA')}+${er('FB')}+${er('FC')}` };
      if (rangs.has('D')) ws.getCell(rangs.get('D')!, 3).value = { formula: er('FD') };
      if (rangs.has('F')) ws.getCell(rangs.get('F')!, 3).value = { formula: er('GU') };
    }
    // G et I en formules, sur la logique que leur libellé annonce.
    if (rangs.has('G')) {
      ws.getCell(rangs.get('G')!, 3).value = {
        formula: `C${rangs.get('A')}+C${rangs.get('B')}+C${rangs.get('C')}+C${rangs.get('D')}-C${rangs.get('E')}-C${rangs.get('F')}`,
      };
    }
    if (rangs.has('I')) {
      ws.getCell(rangs.get('I')!, 3).value = { formula: `C${rangs.get('G')}-C${rangs.get('H')}` };
    }
    cadre(ws, 8, 1, r, 3, MOYEN);
    r += 2;
    ws.getCell(r, 1).value = 'Rappel balance : trésorerie de clôture (classe 5 nette) :';
    ws.getCell(r, 1).font = { name: 'Arial', size: 9 };
    ws.getCell(r, 3).value = recon.controle.tresorerieBalance;
    ws.getCell(r, 3).numFmt = FMT_MONTANT_ETAFI;
    r += 1;
    ws.getCell(r, 1).value = 'Écart avec la ligne G (dépenses non décaissées, créances · à expliquer en NOTE 2) :';
    ws.getCell(r, 1).font = { name: 'Arial', size: 9 };
    ws.getCell(r, 3).value = recon.controle.ecart;
    ws.getCell(r, 3).numFmt = FMT_MONTANT_ETAFI;
    r += 2;
    ligneControleSousEtat(ws, r, recon.avertissements.join(' '));
    largeurs(ws, { A: 66, B: 7, C: 20 });
    ws.views = [{ state: 'frozen', ySplit: 8, showGridLines: false }];
    return { rangs, dernier: r };
  }

  /** Tableau de réconciliation de trésorerie · export individuel, charte ETAFI. */
  async reconciliationTresorerieExcel(
    tenantId: string,
    exerciceId: string,
    paiementsEnInstance = 0,
  ): Promise<ClasseurExporte> {
    const [recon, ident] = await Promise.all([
      this.etatsFinanciersProjetBudgetService.reconciliationTresorerie(tenantId, exerciceId, paiementsEnInstance),
      this.identiteLiasse(tenantId, exerciceId),
    ]);
    const classeur = this.nouveauClasseur();
    this.feuilleReconciliationEtafi(classeur, recon, ident);
    numeroterPages(classeur);
    return {
      buffer: await this.versBuffer(classeur),
      nomFichier: `reconciliation-tresorerie${await this.suffixeExercice(tenantId, exerciceId)}.xlsx`,
    };
  }


  // -------------------------------------------------------------------------
  // SYSTÈME MINIMAL DE TRÉSORERIE (Partie 4, ch. 4)
  //
  // Cinq classeurs, un par onglet de l'écran, exactement comme les deux autres
  // jeux ont un export par état. Le rattachement des comptes de ce jeu étant
  // DÉRIVÉ du plan des comptes et non transcrit d'un tableau de correspondance
  // officiel (le chapitre 4 n'en comporte aucun, voir correspondance-smt.ts),
  // chaque classeur porte une feuille « Méthode » qui l'énonce : un état
  // déposé chez un bailleur doit dire de quoi il est tiré.
  // -------------------------------------------------------------------------

  /** Feuille commune rappelant sur quoi le jeu S.M.T est bâti. */
  private feuilleMethodeSmt(classeur: ExcelJS.Workbook, precisions: string[]) {
    const f = classeur.addWorksheet('Méthode');
    f.columns = [{ header: 'Point', key: 'point', width: 34 }, { header: 'Ce qui est appliqué', key: 'texte', width: 120 }];
    const lignes: [string, string][] = [
      ['Référentiel', "SYCEBNL, Acte uniforme adopté à Niamey le 22 décembre 2022, applicable depuis le 1er janvier 2024."],
      ['Jeu d’états', "Système Minimal de Trésorerie, Partie 4, chapitre 4 (Journal officiel OHADA, numéro spécial du 22 février 2023, p. 433-438)."],
      [
        'Éligibilité',
        "Article 5 : le Système normal est la règle, le S.M.T l’exception liée à la taille. Article 6 : chacune des cinq catégories de ressources annuelles doit rester sous 30 000 000 FCFA.",
      ],
      [
        'Rattachement des comptes',
        "Le chapitre 4 ne fournit AUCUN tableau de correspondance poste vers comptes, contrairement aux chapitres 2 et 3. Le rattachement appliqué ici est dérivé du plan des comptes SYCEBNL lui-même (Partie 2), poste par poste, par lecture du libellé officiel. Il est documenté dans le logiciel (correspondance-smt.ts).",
      ],
      [
        'Écritures retenues',
        "Écritures validées seulement ; écritures de clôture exclues, le report à nouveau n’étant pas un encaissement de l’exercice.",
      ],
      ...precisions.map((t) => ['Précision', t] as [string, string]),
    ];
    for (const [point, texte] of lignes) {
      const l = f.addRow({ point, texte });
      l.getCell('point').font = ENTETE_FONT;
      l.getCell('texte').alignment = { wrapText: true, vertical: 'top' };
    }
    styliserEntete(f.getRow(1));
    return f;
  }

  async bilanSmtExcel(tenantId: string, exerciceId: string): Promise<ClasseurExporte> {
    const bilan = await this.etatsFinanciersSmtService.bilan(tenantId, exerciceId);
    const suffixeN1 = bilan.exerciceN1Disponible ? '' : ' (aucun exercice antérieur)';

    const classeur = this.nouveauClasseur();
    const feuille = classeur.addWorksheet('Bilan (S.M.T)');
    feuille.columns = [
      { header: 'Actif · REF', key: 'refActif', width: 10 },
      { header: 'Actif · libellé', key: 'libelleActif', width: 44 },
      { header: 'Note', key: 'noteActif', width: 7 },
      { header: 'Actif · Exercice N', key: 'montantActif', width: 20 },
      { header: `Actif · Exercice N-1${suffixeN1}`, key: 'montantActifN1', width: 22 },
      { header: 'Passif · REF', key: 'refPassif', width: 10 },
      { header: 'Passif · libellé', key: 'libellePassif', width: 44 },
      { header: 'Note', key: 'notePassif', width: 7 },
      { header: 'Passif · Exercice N', key: 'montantPassif', width: 20 },
      { header: `Passif · Exercice N-1${suffixeN1}`, key: 'montantPassifN1', width: 22 },
    ];

    const maxLignes = Math.max(bilan.actif.length, bilan.passif.length);
    for (let i = 0; i < maxLignes; i++) {
      const a = bilan.actif[i];
      const p = bilan.passif[i];
      const ligne = feuille.addRow({
        refActif: a?.ref ?? '',
        libelleActif: a?.libelle ?? '',
        noteActif: a?.note ?? '',
        montantActif: a ? a.montant : null,
        montantActifN1: a?.montantN1 ?? null,
        refPassif: p?.ref ?? '',
        libellePassif: p?.libelle ?? '',
        notePassif: p?.note ?? '',
        montantPassif: p ? p.montant : null,
        montantPassifN1: p?.montantN1 ?? null,
      });
      if (a?.estTotal) {
        for (const cle of ['refActif', 'libelleActif', 'montantActif', 'montantActifN1']) ligne.getCell(cle).font = ENTETE_FONT;
      }
      if (p?.estTotal) {
        for (const cle of ['refPassif', 'libellePassif', 'montantPassif', 'montantPassifN1']) ligne.getCell(cle).font = ENTETE_FONT;
      }
    }
    feuille.addRow({});
    feuille.addRow({ libelleActif: bilan.renvoiImmobilisations });

    this.appliquerFormats(feuille, {
      montantActif: FORMAT_MONTANT,
      montantActifN1: FORMAT_MONTANT,
      montantPassif: FORMAT_MONTANT,
      montantPassifN1: FORMAT_MONTANT,
    });
    styliserEntete(feuille.getRow(1));
    feuille.views = [{ state: 'frozen', ySplit: 1 }];

    const detail = classeur.addWorksheet('Détail par poste');
    detail.columns = [
      { header: 'Sens', key: 'sens', width: 8 },
      { header: 'REF', key: 'ref', width: 8 },
      { header: 'Poste', key: 'poste', width: 48 },
      { header: 'Compte', key: 'numero', width: 14 },
      { header: 'Intitulé compte', key: 'intitule', width: 46 },
      { header: 'Montant', key: 'montant', width: 16 },
    ];
    for (const [sens, postes] of [['Actif', bilan.actif], ['Passif', bilan.passif]] as const) {
      for (const p of postes) {
        for (const c of p.comptes) {
          detail.addRow({ sens, ref: p.ref, poste: p.libelle, numero: c.numero, intitule: c.intitule, montant: c.montant });
        }
      }
    }
    this.appliquerFormats(detail, { montant: FORMAT_MONTANT });
    this.finaliserTableau(detail, detail.columns.length, detail.rowCount);

    const controles = classeur.addWorksheet('Contrôles');
    controles.columns = [
      { header: 'Contrôle', key: 'controle', width: 40 },
      { header: 'Écart', key: 'montant', width: 18 },
      { header: 'Diagnostic', key: 'diagnostic', width: 100 },
    ];
    const l = controles.addRow({
      controle: 'Total actif (GZ) = Total passif (HZ) ?',
      montant: bilan.totalActif - bilan.totalPassif,
      diagnostic: bilan.equilibre
        ? `OK · bilan équilibré. GZ = HZ = ${bilan.totalActif.toFixed(2)}.`
        : `DÉSÉQUILIBRE de ${(bilan.totalActif - bilan.totalPassif).toFixed(2)} · vérifier les écritures de l’exercice.`,
    });
    l.font = { bold: true, color: { argb: bilan.equilibre ? 'FF1E7B34' : 'FFB00020' } };
    this.appliquerFormats(controles, { montant: FORMAT_MONTANT });
    this.finaliserTableau(controles, controles.columns.length, controles.rowCount);

    this.feuilleMethodeSmt(classeur, [
      "Poste HC « Autres fonds propres » : réserve assumée. La classe 1 contient aussi les comptes 18 (emprunts) et 19 (provisions), qui ne sont pas des fonds propres ; la maquette n’ouvre que quatre lignes de passif et aucune ne peut les recevoir. Les écarter déséquilibrerait le bilan. Ils sont rattachés à HC et nommés dans la feuille « Détail par poste ».",
      "Poste GE « Banque (en + ou en -) » : le découvert reste à l’actif en négatif, ce jeu n’ayant pas de poste de trésorerie-passif.",
      "Postes GA et GB : valeur nette. La maquette n’ouvre qu’une colonne de montant, les amortissements et dépréciations y sont donc déduits.",
    ]);

    return {
      buffer: await this.versBuffer(classeur),
      nomFichier: `bilan-smt${await this.suffixeExercice(tenantId, exerciceId)}.xlsx`,
    };
  }

  async compteDeResultatSmtExcel(tenantId: string, exerciceId: string): Promise<ClasseurExporte> {
    const cr = await this.etatsFinanciersSmtService.compteDeResultat(tenantId, exerciceId);

    const classeur = this.nouveauClasseur();
    const feuille = classeur.addWorksheet('Compte de résultat (S.M.T)');
    feuille.columns = [
      { header: 'REF', key: 'ref', width: 8 },
      { header: 'Libellé', key: 'libelle', width: 62 },
      { header: 'Exercice N', key: 'montant', width: 20 },
    ];
    const total = (ref: string, libelle: string, montant: number) => {
      const l = feuille.addRow({ ref, libelle, montant });
      l.font = ENTETE_FONT;
    };
    for (const p of cr.recettes) feuille.addRow({ ref: p.ref, libelle: p.libelle, montant: p.montant });
    total('KX', 'TOTAL DES REVENUS ENCAISSÉS (A)', cr.totalRecettes);
    for (const p of cr.depenses) feuille.addRow({ ref: p.ref, libelle: p.libelle, montant: p.montant });
    total('JX', 'TOTAL DÉPENSES SUR CHARGES (B)', cr.totalDepenses);
    total('KZ', 'SOLDE : excédent (+) ou insuffisance (-) de recettes (C = A-B)', cr.soldeCaisse);
    for (const r of cr.retraitements) feuille.addRow({ ref: r.ref, libelle: r.libelle, montant: r.montant });
    total('KZC', "RÉSULTAT NET DE L'EXERCICE", cr.resultatNet);
    this.appliquerFormats(feuille, { montant: FORMAT_MONTANT });
    styliserEntete(feuille.getRow(1));
    feuille.views = [{ state: 'frozen', ySplit: 1 }];

    const detail = classeur.addWorksheet('Détail par poste');
    detail.columns = [
      { header: 'REF', key: 'ref', width: 8 },
      { header: 'Poste', key: 'poste', width: 52 },
      { header: 'Compte de contrepartie', key: 'numero', width: 22 },
      { header: 'Intitulé compte', key: 'intitule', width: 46 },
      { header: 'Montant', key: 'montant', width: 16 },
    ];
    for (const p of [...cr.recettes, ...cr.depenses, ...cr.retraitements]) {
      for (const c of p.comptes) {
        detail.addRow({ ref: p.ref, poste: p.libelle, numero: c.numero, intitule: c.intitule, montant: c.montant });
      }
    }
    this.appliquerFormats(detail, { montant: FORMAT_MONTANT });
    this.finaliserTableau(detail, detail.columns.length, detail.rowCount);

    const controles = classeur.addWorksheet('Contrôles');
    controles.columns = [
      { header: 'Contrôle', key: 'controle', width: 46 },
      { header: 'Montant', key: 'montant', width: 18 },
      { header: 'Diagnostic', key: 'diagnostic', width: 110 },
    ];
    controles.addRow({
      controle: 'Flux de trésorerie hors exploitation',
      montant: cr.controle.fluxHorsExploitation,
      diagnostic:
        "Encaissements et décaissements qui ne sont ni un produit ni une charge (apport en dotation, emprunt, acquisition ou cession d’immobilisation). Ils entrent dans le solde de caisse KZ mais pas dans le résultat, et la maquette officielle n’ouvre aucune ligne pour les reprendre.",
    });
    for (const c of cr.controle.comptesHorsExploitation) {
      controles.addRow({ controle: `    ${c.numero} · ${c.intitule}`, montant: c.montant });
    }
    const lc = controles.addRow({
      controle: 'KZC moins flux hors exploitation = résultat du bilan (HB) ?',
      montant: cr.controle.ecart,
      diagnostic: cr.controle.concordant
        ? `OK · les deux chemins vers le résultat coïncident à ${cr.controle.resultatBilan.toFixed(2)}.`
        : `ÉCART de ${cr.controle.ecart.toFixed(2)} · une opération de trésorerie a une contrepartie qu’aucun poste ne capte, ou une charge sans décaissement n’est pas une dotation aux amortissements.`,
    });
    lc.font = { bold: true, color: { argb: cr.controle.concordant ? 'FF1E7B34' : 'FFB00020' } };
    this.appliquerFormats(controles, { montant: FORMAT_MONTANT });
    this.finaliserTableau(controles, controles.columns.length, controles.rowCount);

    this.feuilleMethodeSmt(classeur, [
      "Les postes KA à JF ne sont PAS lus dans les soldes des classes 6 et 7 : ce serait déjà de la comptabilité d’engagement, et les retraitements VA, VB et VC compteraient deux fois. Ils sont lus dans les contreparties des mouvements de trésorerie, comme le veut la comptabilité de trésorerie du S.M.T (Partie 4, ch. 1, § 1.3).",
      "Les variations VA, VB et VC se mesurent contre l’OUVERTURE de l’exercice (report à nouveau), toujours présente, et non contre l’exercice N-1 tel qu’enregistré dans le logiciel, qui peut ne pas exister pour un dossier repris en cours de vie.",
      "Un règlement passant par un compte de tiers ne dit pas de quelle nature de charge il s’agit : il tombe en JF. C’est inhérent à la maquette, et la feuille « Détail par poste » le montre compte par compte.",
    ]);

    return {
      buffer: await this.versBuffer(classeur),
      nomFichier: `compte-de-resultat-smt${await this.suffixeExercice(tenantId, exerciceId)}.xlsx`,
    };
  }

  /** NOTE 4 · un onglet par compte de trésorerie, comme le NB officiel le demande. */
  async journalTresorerieSmtExcel(tenantId: string, exerciceId: string): Promise<ClasseurExporte> {
    const note4 = await this.etatsFinanciersSmtService.journalTresorerie(tenantId, exerciceId);
    const classeur = this.nouveauClasseur();

    for (const j of note4.journaux) {
      // Un nom d'onglet Excel est borné à 31 caractères et interdit : \ / ? * [ ]
      const nom = `${j.numero} ${j.intitule}`.replace(/[\\/?*[\]]/g, ' ').slice(0, 31);
      const f = classeur.addWorksheet(nom);
      const colonnes = [
        { header: 'Date', key: 'date', width: 12 },
        { header: 'Libellé', key: 'libelle', width: 44 },
        { header: 'Pièce', key: 'reference', width: 14 },
        { header: 'Recettes', key: 'recette', width: 16 },
        { header: 'Dépenses', key: 'depense', width: 16 },
        { header: 'Solde', key: 'solde', width: 16 },
      ];
      // Les colonnes de ventilation diffèrent selon le sens : les deux jeux
      // officiels sont posés côte à côte, chaque ligne ne servant que le sien.
      const cles: string[] = [];
      for (const c of note4.colonnesRecettes) {
        colonnes.push({ header: `Recette · ${c.libelle}`, key: `r_${c.cle}`, width: 20 });
        cles.push(`r_${c.cle}`);
      }
      for (const c of note4.colonnesDepenses) {
        colonnes.push({ header: `Dépense · ${c.libelle}`, key: `d_${c.cle}`, width: 20 });
        cles.push(`d_${c.cle}`);
      }
      f.columns = colonnes;

      f.addRow({ libelle: 'Report à nouveau', solde: j.reportANouveau }).font = ENTETE_FONT;
      for (const o of j.operations) {
        const ligne: Record<string, unknown> = {
          date: new Date(o.date),
          libelle: o.virementInterne ? `${o.libelle} (virement interne)` : o.libelle,
          reference: o.reference ?? '',
          recette: o.recette || null,
          depense: o.depense || null,
          solde: o.solde,
        };
        const prefixe = o.sens === 'RECETTE' ? 'r_' : 'd_';
        for (const [cle, valeur] of Object.entries(o.ventilation)) {
          if (Math.abs(valeur) > 0.005) ligne[prefixe + cle] = valeur;
        }
        f.addRow(ligne);
      }
      const fin = f.addRow({
        libelle: 'Totaux · solde à reporter',
        recette: j.totalRecettes,
        depense: j.totalDepenses,
        solde: j.soldeAReporter,
      });
      fin.font = ENTETE_FONT;
      f.addRow({});
      const ctrl = f.addRow({
        libelle: j.boucle
          ? 'CONTRÔLE OK · le solde à reporter est celui du compte à la balance.'
          : `CONTRÔLE EN ÉCHEC · solde du journal ${j.soldeAReporter.toFixed(2)}, solde du compte à la balance ${j.soldeBalance.toFixed(2)}.`,
      });
      ctrl.font = { bold: true, color: { argb: j.boucle ? 'FF1E7B34' : 'FFB00020' } };
      if (j.lignesNonVentilees > 0) {
        f.addRow({
          libelle: `${j.lignesNonVentilees} ligne(s) non ventilée(s) : l’écriture touche plusieurs comptes de trésorerie, aucune clé de répartition ne figure dans l’écriture.`,
        });
      }

      const formats: Record<string, string> = { date: FORMAT_DATE, recette: FORMAT_MONTANT, depense: FORMAT_MONTANT, solde: FORMAT_MONTANT };
      for (const cle of cles) formats[cle] = FORMAT_MONTANT;
      this.appliquerFormats(f, formats);
      styliserEntete(f.getRow(1));
      f.views = [{ state: 'frozen', ySplit: 1, xSplit: 2 }];
    }

    if (note4.journaux.length === 0) {
      const f = classeur.addWorksheet('Journal de trésorerie');
      f.addRow(['Aucun compte de trésorerie mouvementé sur cet exercice.']);
    }

    this.feuilleMethodeSmt(classeur, [
      note4.nb,
      "Ce journal est un LIVRE DE CAISSE : il montre tous les mouvements du compte, virements internes compris, sinon son solde à reporter ne serait pas celui du compte. Les virements internes ne reçoivent aucune ventilation, les colonnes officielles ne classant que des natures de recette et de dépense.",
    ]);

    return {
      buffer: await this.versBuffer(classeur),
      nomFichier: `note4-journal-tresorerie-smt${await this.suffixeExercice(tenantId, exerciceId)}.xlsx`,
    };
  }

  /** Notes 1, 2, 3 et 5 · une feuille par note, plus la fiche récapitulative. */
  async notesSmtExcel(tenantId: string, exerciceId: string): Promise<ClasseurExporte> {
    const [fiche, note1, note2, note3, note5] = await Promise.all([
      Promise.resolve(this.etatsFinanciersSmtService.ficheNotes()),
      this.etatsFinanciersSmtService.note1Immobilisations(tenantId, exerciceId),
      this.etatsFinanciersSmtService.note2Stocks(tenantId, exerciceId),
      this.etatsFinanciersSmtService.note3CreancesDettes(tenantId, exerciceId),
      this.etatsFinanciersSmtService.note5Dotation(tenantId, exerciceId),
    ]);

    const classeur = this.nouveauClasseur();

    const f0 = classeur.addWorksheet('Fiche récapitulative');
    f0.columns = [
      { header: 'Note', key: 'note', width: 10 },
      { header: 'Intitulé', key: 'intitule', width: 70 },
      { header: 'Partie', key: 'partie', width: 32 },
    ];
    for (const n of fiche) {
      f0.addRow({
        note: `Note ${n.numero}`,
        intitule: n.intitule,
        partie: n.partie === 'BILAN' ? 'Notes sur le bilan' : 'Notes sur compte de résultat',
      });
    }
    this.finaliserTableau(f0, f0.columns.length, f0.rowCount);

    const f1 = classeur.addWorksheet('Note 1 · Immobilisations');
    f1.columns = [
      { header: 'Date de mise en service', key: 'mes', width: 22 },
      { header: 'Désignation', key: 'designation', width: 46 },
      { header: 'Montant', key: 'montant', width: 16 },
      { header: "Date d'acquisition", key: 'acq', width: 18 },
      { header: "Durée d'utilité (ans)", key: 'duree', width: 20 },
      { header: 'Date de sortie', key: 'sortie', width: 16 },
      { header: 'Prix de cession', key: 'cession', width: 16 },
    ];
    for (const l of note1.lignes) {
      f1.addRow({
        mes: new Date(l.dateMiseEnService),
        designation: l.designation,
        montant: l.montant,
        acq: new Date(l.dateAcquisition),
        duree: l.dureeUtiliteAns,
        sortie: l.dateSortie ? new Date(l.dateSortie) : null,
        cession: l.prixCession,
      });
    }
    f1.addRow({ designation: 'TOTAL', montant: note1.total }).font = ENTETE_FONT;
    this.appliquerFormats(f1, { mes: FORMAT_DATE, acq: FORMAT_DATE, sortie: FORMAT_DATE, montant: FORMAT_MONTANT, cession: FORMAT_MONTANT });
    this.finaliserTableau(f1, f1.columns.length, f1.rowCount);

    const f2 = classeur.addWorksheet('Note 2 · Stocks');
    f2.columns = [
      { header: 'Référence', key: 'reference', width: 16 },
      { header: 'Désignation', key: 'designation', width: 50 },
      { header: 'Quantité', key: 'quantite', width: 14 },
      { header: 'Prix unitaire', key: 'pu', width: 16 },
      { header: 'Montant', key: 'montant', width: 18 },
    ];
    for (const l of note2.lignes) {
      f2.addRow({ reference: l.reference, designation: l.designation, quantite: null, pu: null, montant: l.montant });
    }
    f2.addRow({ designation: 'VALEUR DU STOCK FINAL', montant: note2.valeurStockFinal }).font = ENTETE_FONT;
    f2.addRow({ designation: 'VALEUR DU STOCK INITIAL', montant: note2.valeurStockInitial }).font = ENTETE_FONT;
    f2.addRow({});
    f2.addRow({ designation: note2.motifQuantites });
    this.appliquerFormats(f2, { montant: FORMAT_MONTANT, pu: FORMAT_MONTANT });
    this.finaliserTableau(f2, f2.columns.length, f2.rowCount);

    const f3 = classeur.addWorksheet('Note 3 · Créances et dettes');
    f3.columns = [
      { header: 'Nature', key: 'nature', width: 12 },
      { header: 'Compte', key: 'numero', width: 14 },
      { header: 'Nom', key: 'nom', width: 46 },
      { header: 'Montant au 31/12/N', key: 'cloture', width: 20 },
      { header: 'Montant au 01/01/N', key: 'ouverture', width: 20 },
      { header: 'Variation en valeur', key: 'variation', width: 20 },
      { header: 'Variation en %', key: 'pourcent', width: 16 },
    ];
    for (const [nature, lignes, totalLibelle, total] of [
      ['Créance', note3.creances, 'TOTAL DES CRÉANCES', note3.totalCreances],
      ['Dette', note3.dettes, 'TOTAL DES DETTES', note3.totalDettes],
    ] as const) {
      for (const l of lignes) {
        f3.addRow({
          nature,
          numero: l.numero,
          nom: l.nom,
          cloture: l.montantCloture,
          ouverture: l.montantOuverture,
          variation: l.variationValeur,
          pourcent: l.variationPourcent,
        });
      }
      f3.addRow({ nom: totalLibelle, cloture: total }).font = ENTETE_FONT;
    }
    this.appliquerFormats(f3, {
      cloture: FORMAT_MONTANT,
      ouverture: FORMAT_MONTANT,
      variation: FORMAT_MONTANT,
      pourcent: '0.0"%"',
    });
    this.finaliserTableau(f3, f3.columns.length, f3.rowCount);

    const f5 = classeur.addWorksheet('Note 5 · Dotation');
    f5.columns = [
      { header: 'Rubrique', key: 'rubrique', width: 40 },
      { header: 'Montant', key: 'montant', width: 18 },
      { header: 'Comptes', key: 'comptes', width: 40 },
    ];
    for (const r of note5.rubriques) {
      f5.addRow({ rubrique: r.libelle, montant: r.montant, comptes: r.comptes.map((c) => c.numero).join(', ') });
    }
    f5.addRow({ rubrique: 'TOTAL', montant: note5.total }).font = ENTETE_FONT;
    if (note5.membres.length > 0) {
      f5.addRow({});
      f5.addRow({ rubrique: 'Membre apporteur', montant: null, comptes: 'Nationalité' }).font = ENTETE_FONT;
      for (const m of note5.membres) f5.addRow({ rubrique: m.nom, montant: m.montant, comptes: '' });
    }
    f5.addRow({});
    f5.addRow({ rubrique: note5.motifNationalite });
    this.appliquerFormats(f5, { montant: FORMAT_MONTANT });
    this.finaliserTableau(f5, f5.columns.length, f5.rowCount);

    this.feuilleMethodeSmt(classeur, [
      note2.motifQuantites,
      note5.motifNationalite,
      "Note 3 : « Montant au 1er janvier N » est l’OUVERTURE de l’exercice, c’est-à-dire le report à nouveau du compte, et non le solde de l’exercice N-1 rechargé.",
    ]);

    return {
      buffer: await this.versBuffer(classeur),
      nomFichier: `notes-annexes-smt${await this.suffixeExercice(tenantId, exerciceId)}.xlsx`,
    };
  }

  async eligibiliteSmtExcel(tenantId: string, exerciceId: string): Promise<ClasseurExporte> {
    const e = await this.etatsFinanciersSmtService.eligibilite(tenantId, exerciceId);
    const classeur = this.nouveauClasseur();

    const f = classeur.addWorksheet('Éligibilité (art. 6)');
    f.columns = [
      { header: 'Catégorie de ressources (art. 6)', key: 'libelle', width: 52 },
      { header: 'Exercice N', key: 'montant', width: 20 },
      { header: 'Seuil légal', key: 'seuil', width: 22 },
      { header: 'Comptes', key: 'comptes', width: 46 },
    ];
    for (const c of e.categories) {
      f.addRow({
        libelle: c.libelle,
        montant: c.montant,
        seuil: `${e.seuilParCategorieFcfa.toLocaleString('fr-FR')} FCFA`,
        comptes: c.comptes.map((x) => x.numero).join(', '),
      });
    }
    f.addRow({ libelle: 'TOTAL DES RESSOURCES', montant: e.totalRessources }).font = ENTETE_FONT;
    f.addRow({});
    f.addRow({ libelle: `Montants exprimés en ${e.deviseDossier ?? 'monnaie de tenue du dossier'}.` });
    f.addRow({ libelle: e.avertissement });
    this.appliquerFormats(f, { montant: FORMAT_MONTANT });
    this.finaliserTableau(f, f.columns.length, f.rowCount);

    this.feuilleMethodeSmt(classeur, [
      "OmegaX ne convertit PAS le seuil : l’article 6 le fixe en francs CFA « ou l’équivalent dans l’unité monétaire ayant cours légal dans l’État partie », et le cours de conversion n’appartient pas au texte comptable. Comparez chaque catégorie au seuil converti au cours que retient votre entité.",
    ]);

    return {
      buffer: await this.versBuffer(classeur),
      nomFichier: `eligibilite-smt${await this.suffixeExercice(tenantId, exerciceId)}.xlsx`,
    };
  }

  // -------------------------------------------------------------------
  // LIASSE COMPLÈTE · tous les états du jeu dans UN seul classeur
  // -------------------------------------------------------------------

  /**
   * Un bouton par état, c'est bien pour consulter ; c'est intenable pour
   * déposer. Une liasse SYCEBNL, c'est cinq à sept états plus les notes
   * annexes : les exporter un par un, puis les recoller à la main dans un
   * classeur avant de l'envoyer au CPCC ou à un bailleur, c'est huit
   * téléchargements et une manipulation où l'on oublie une pièce.
   *
   * Cette méthode produit LE classeur du dépôt : tous les états du jeu retenu
   * par le dossier, dans l'ordre officiel, précédés d'un sommaire qui porte
   * les mentions d'en-tête exigées de chaque page déposée (dénomination,
   * n° impôt, exercice clos le, durée en mois · CPCC § 7.4 règle 7-a) et qui
   * dit ce que le classeur contient.
   *
   * La construction réutilise les exports unitaires plutôt que de dupliquer
   * leur logique : chacun produit son classeur, dont les feuilles sont
   * recopiées ici. C'est un aller-retour par la sérialisation, plus coûteux
   * qu'un assemblage direct, mais qui garantit qu'un état exporté seul et le
   * même état dans la liasse sont RIGOUREUSEMENT identiques. Un écart entre
   * les deux serait le pire défaut possible pour un document d'audit.
   */
  /** Exercice immédiatement antérieur du même dossier, s'il existe. */
  private async exerciceN1Id(tenantId: string, exerciceId: string): Promise<string | null> {
    const courant = await this.prisma.exercice.findFirstOrThrow({ where: { id: exerciceId, tenantId } });
    const anterieur = await this.prisma.exercice.findFirst({
      where: { tenantId, dateDebut: { lt: courant.dateDebut } },
      orderBy: { dateDebut: 'desc' },
      select: { id: true },
    });
    return anterieur?.id ?? null;
  }

  /**
   * Lignes de la feuille BALANCE du modèle depuis la balance du serveur ·
   * comptes de DÉTAIL seuls (les comptes Total sont des sous-totalisations
   * d'affichage, pas des comptes mouvementés), ouverture et clôture en solde
   * NET dans leur colonne de sens, mouvements en cumuls. Ligne à ligne,
   * ouverture + mouvements = clôture · l'identité que la feuille CONTROLE
   * BALANCE vérifie ensuite en formules.
   */
  private async lignesBalanceLiasse(tenantId: string, exerciceId: string): Promise<LigneBalanceLiasse[]> {
    const balance = await this.ecritureService.balance(tenantId, exerciceId, false);
    return balance.lignes
      .filter((l) => l.typeCompte !== 'TOTAL')
      .map((l) => {
        const ouverture = l.reportDebit - l.reportCredit;
        return {
          compte: l.numero,
          libelle: l.intitule,
          ouvertureDebit: Math.max(ouverture, 0),
          ouvertureCredit: Math.max(-ouverture, 0),
          mouvementDebit: l.mouvementDebit,
          mouvementCredit: l.mouvementCredit,
          clotureDebit: Math.max(l.solde, 0),
          clotureCredit: Math.max(-l.solde, 0),
        };
      });
  }

  /** Découpage officiel de la fiche récapitulative du jeu projets. */
  private static readonly PARTIES_NOTES_PROJETS: Array<[string, string[]]> = [
    ['Partie 1 : Informations générales', ['1']],
    [
      "Partie 2 : Notes sur le tableau emplois-ressources, le tableau d'exécution budgétaire et la réconciliation de trésorerie",
      ['2'],
    ],
    ['Partie 3 : Notes sur le bilan', ['3A', '3B', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13']],
    [
      "Partie 4 : Notes sur le compte d'exploitation",
      ['14', '15', '16', '17', '18', '19', '20A', '20B', '21', '22', '23', '24'],
    ],
  ];

  /**
   * LIASSE COMPLÈTE du jeu « projets de développement et assimilés » · le
   * classeur entier du modèle, dans son ordre : BALANCE N, BALANCE N-1,
   * CONTROLE BALANCE, Couverture, Garde, Fiche 1, Fiche 2,
   * Emplois-Ressources, Execution budgetaire, Reconciliation tresorerie,
   * Bilan paysage, Bilan-Actif, Bilan-Passif, Compte Exploitation, NOTES
   * ANNEXES, notes applicables, TABLE COMMENTAIRE, CONTROLES, ANOMALIES.
   */
  private async liasseProjetsEtafi(
    tenantId: string,
    exerciceId: string,
    paiementsEnInstance: number,
  ): Promise<ExcelJS.Workbook> {
    const [ident, tenant, bilan, ce, er, recon, notes, exerciceN1Id] = await Promise.all([
      this.identiteLiasse(tenantId, exerciceId),
      this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
      this.etatsFinanciersProjetService.bilan(tenantId, exerciceId),
      this.etatsFinanciersProjetService.compteExploitation(tenantId, exerciceId),
      this.etatsFinanciersProjetService.tableauEmploisRessources(tenantId, exerciceId),
      this.etatsFinanciersProjetBudgetService.reconciliationTresorerie(tenantId, exerciceId, paiementsEnInstance),
      this.noteAnnexeService.notesProjet(tenantId, exerciceId),
      this.exerciceN1Id(tenantId, exerciceId),
    ]);
    const lignesBalN = await this.lignesBalanceLiasse(tenantId, exerciceId);
    const lignesBalN1 = exerciceN1Id ? await this.lignesBalanceLiasse(tenantId, exerciceN1Id) : [];

    const classeur = this.nouveauClasseur();
    ecrireFeuilleBalance(classeur, NOM_BALANCE, lignesBalN);
    if (exerciceN1Id) ecrireFeuilleBalance(classeur, NOM_BALANCE_N1, lignesBalN1);
    construireControleBalance(classeur, Boolean(exerciceN1Id), lignesBalN.length, lignesBalN1.length);

    construireCouverture(classeur, ident, 'LIASSE PROJETS DE DEVELOPPEMENT', tenant.pays ?? '');
    construireGarde(classeur, ident, {
      bandeau: 'ETATS FINANCIERS NORMALISES\nDU SYSTEME COMPTABLE DES ENTITES A BUT NON LUCRATIF (SYCEBNL)',
      sousBandeau: 'Projets de développement et assimilés',
      systeme: 'PROJETS DE DEVELOPPEMENT',
      documents: [
        "Fiche d'identification et renseignements divers",
        'Tableau emplois-ressources',
        "Tableau d'exécution budgétaire",
        'Tableau de réconciliation de trésorerie',
        'Bilan (actif et passif)',
        "Compte d'exploitation",
        'Notes annexes',
      ],
    });
    construireFiche1(classeur, ident, 'SYCEBNL', 'Projets de développement et assimilés', {
      ZE: tenant.actePersonnaliteJuridique ?? '',
    });
    construireFiche2(classeur, ident, 'EQUIPE DU PROJET DE DEVELOPPEMENT');

    // Les trois tableaux propres au jeu, puis le bilan et le compte
    // d'exploitation · l'ordre du classeur modèle.
    const terRangs = this.feuilleEmploisRessourcesEtafi(classeur, er, ident);
    try {
      const eb = await this.etatsFinanciersProjetBudgetService.executionBudgetaire(tenantId, exerciceId);
      this.feuilleExecutionBudgetaireEtafi(classeur, eb, ident);
    } catch {
      // Pas de plan analytique à budgets : la grille du modèle, à remplir ·
      // la liasse ne peut pas échouer pour un tableau à saisie manuelle.
      this.feuilleExecutionBudgetaireVierge(
        classeur,
        ident,
        "Aucun plan analytique à budgets n'est défini pour ce dossier : remplir code et libellé suivant la nomenclature budgétaire du projet.",
      );
    }
    const { rangs: rangsRecon } = this.feuilleReconciliationEtafi(classeur, recon, ident, terRangs);

    const versCote = (postes: PosteCalcule[], libelle: 'ACTIF' | 'PASSIF') => ({
      feuille: libelle === 'ACTIF' ? 'Bilan-Actif' : 'Bilan-Passif',
      libelle,
      cols: [
        { entete: 'NET', lettre: 'D' },
        { entete: 'NET N-1', lettre: 'E' },
      ],
      lignes: postes.map((p, i) => ({
        ref: p.ref,
        libelle: p.libelle,
        note: NOTE_PAR_CLE_PROJETS[p.ref] ?? '',
        rangSource: 10 + i,
        niveau: NIVEAUX_ETAT_PROJETS[p.ref] ?? ((p.estTotal ? 'inter' : 'normal') as NiveauLigne),
      })),
    });
    construireBilanPaysage(
      classeur,
      ident,
      versCote(bilan.actif, 'ACTIF'),
      versCote(bilan.passif, 'PASSIF'),
      'BILAN (EN NET)',
    );
    const { rangsActif, rangsPassif } = this.feuillesBilanProjetEtafi(classeur, bilan, ident);
    const rangsCe = this.feuilleCompteExploitationEtafi(classeur, ce, ident);

    this.construireClasseurNotes(notes, ident, ExportService.PARTIES_NOTES_PROJETS, classeur);
    const parCode = new Map(
      (notes.ficheRecapitulative as Array<{ code: string; titre: string }>).map((n) => [n.code, n.titre]),
    );
    const parties: PartiesNotes = ExportService.PARTIES_NOTES_PROJETS.map(([titre, codes]) => [
      titre,
      codes.filter((c) => parCode.has(c)).map((c) => [`NOTE ${c}`, parCode.get(c)!] as [string, string]),
    ]);
    construireTableCommentaires(classeur, parties, ident);

    // CONTROLES · les recoupements croisés propres à ce jeu.
    const ctl = classeur.addWorksheet('CONTROLES');
    ctl.getCell(1, 1).value = 'Contrôle';
    ctl.getCell(1, 2).value = 'Valeur';
    ctl.getCell(1, 3).value = 'Attendu';
    entetesBande(ctl, 1, 1, 1, 3);
    const n = Math.max(lignesBalN.length, 1);
    const controles: Array<[string, string | number, string | number]> = [
      ['Total solde de clôture débit balance', `SUM('${NOM_BALANCE}'!G2:G${n + 1})`, ''],
      ['Total solde de clôture crédit balance', `SUM('${NOM_BALANCE}'!H2:H${n + 1})`, ''],
      ['Écart balance (doit être 0)', 'B2-B3', 0],
      ['Total général actif net (BZ)', `'Bilan-Actif'!D${rangsActif.get('BZ')}`, ''],
      ['Total général passif (DZ)', `'Bilan-Passif'!D${rangsPassif.get('DZ')}`, ''],
      ['Écart bilan actif - passif (doit être 0)', 'B5-B6', 0],
      ["Solde du compte d'exploitation (XC · doit boucler à 0 en régime normal)", `'Compte Exploitation'!D${rangsCe.get('XC')}`, 0],
      ['Contrôle emplois-ressources (VII · V - VI, doit être 0)', `'Emplois-Ressources'!D${terRangs.get('GZ')}`, 0],
      ['Trésorerie fin (réconciliation, G)', `'Reconciliation tresorerie'!C${rangsRecon.get('G')}`, ''],
      ['Trésorerie balance (classe 5 nette)', recon.controle.tresorerieBalance, ''],
      ['Écart réconciliation / balance (doit être 0)', 'B10-B11', 0],
    ];
    let rc = 1;
    for (const [lab, val, attendu] of controles) {
      rc += 1;
      ctl.getCell(rc, 1).value = lab;
      ctl.getCell(rc, 2).value = typeof val === 'string' ? { formula: val } : val;
      ctl.getCell(rc, 3).value = attendu;
      styleLigne(ctl, rc, 1, 3, 'normal', [2]);
    }
    largeurs(ctl, { A: 62, B: 20, C: 10 });

    // ANOMALIES · les diagnostics du serveur pour ce jeu.
    const an = classeur.addWorksheet('ANOMALIES');
    for (const [i, h] of ['Gravité', 'Compte', 'Intitulé', 'Problème', 'Solution proposée'].entries()) {
      an.getCell(1, i + 1).value = h;
    }
    entetesBande(an, 1, 1, 1, 5);
    const anomalies: Array<[string, string, string, string, string]> = [];
    if (!bilan.equilibre) {
      anomalies.push([
        'BLOQUANT',
        'BZ / DZ',
        'Bilan',
        `Actif et passif diffèrent de ${(bilan.totalActif - bilan.totalPassif).toFixed(2)}.`,
        'Vérifier les écritures déséquilibrées et les comptes non rattachés.',
      ]);
    }
    if (!ce.controle.boucleAZero) {
      anomalies.push([
        'A_VERIFIER',
        'XC',
        "Compte d'exploitation",
        `XC = ${ce.solde.toFixed(2)} · le compte d'exploitation ne boucle pas à zéro.`,
        'Vérifier la consommation des fonds (Partie 3, ch. 3) et les comptes non rattachés.',
      ]);
    }
    if (!recon.controle.boucle) {
      anomalies.push([
        'A_TRAITER',
        'G',
        'Réconciliation de trésorerie',
        `Écart de ${recon.controle.ecart.toFixed(2)} entre G reconstitué et la trésorerie de la balance.`,
        'Expliquer en NOTE 2 (dépenses non décaissées, créances).',
      ]);
    }
    for (const c of [...bilan.comptesNonRattaches, ...ce.comptesNonRattaches]) {
      anomalies.push([
        'A_TRAITER',
        c.numero,
        c.intitule,
        "Compte qu'aucun poste du tableau de correspondance officiel ne réclame.",
        'Vérifier le numéro de compte.',
      ]);
    }
    if (anomalies.length === 0) anomalies.push(['INFO', '·', '·', 'Aucune anomalie détectée sur cet exercice.', '·']);
    let ra = 1;
    for (const ligne of anomalies) {
      ra += 1;
      ligne.forEach((v, i) => {
        an.getCell(ra, i + 1).value = v;
      });
      styleLigne(an, ra, 1, 5, 'normal');
    }
    largeurs(an, { A: 12, B: 12, C: 26, D: 62, E: 62 });
    an.views = [{ state: 'frozen', ySplit: 1 }];

    numeroterPages(classeur);
    return classeur;
  }

  /**
   * LIASSE COMPLÈTE du jeu « associations et ordres professionnels » ·
   * le classeur ENTIER du modèle du skill, feuille pour feuille et dans son
   * ordre : BALANCE N, BALANCE N-1, CONTROLE BALANCE, Couverture, Garde,
   * Fiche 1, Fiche 2, Bilan paysage, Bilan-Actif, Bilan-Passif, Résultat,
   * TFT, NOTES ANNEXES, les notes applicables, TABLE COMMENTAIRE, CONTROLES,
   * ANOMALIES · rempli avec les données réelles du dossier.
   */
  private async liasseAssociationsEtafi(tenantId: string, exerciceId: string): Promise<ExcelJS.Workbook> {
    const [ident, tenant, bilan, cr, tft, notes, exerciceN1Id] = await Promise.all([
      this.identiteLiasse(tenantId, exerciceId),
      this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
      this.etatsFinanciersService.bilan(tenantId, exerciceId),
      this.etatsFinanciersService.compteDeResultat(tenantId, exerciceId),
      this.etatsFinanciersService.tableauFluxTresorerie(tenantId, exerciceId),
      this.noteAnnexeService.notesAssociations(tenantId, exerciceId),
      this.exerciceN1Id(tenantId, exerciceId),
    ]);
    const lignesBalN = await this.lignesBalanceLiasse(tenantId, exerciceId);
    const lignesBalN1 = exerciceN1Id ? await this.lignesBalanceLiasse(tenantId, exerciceN1Id) : [];

    const classeur = this.nouveauClasseur();

    // 1-3 · balances et leur contrôle d'équilibre.
    ecrireFeuilleBalance(classeur, NOM_BALANCE, lignesBalN);
    if (exerciceN1Id) ecrireFeuilleBalance(classeur, NOM_BALANCE_N1, lignesBalN1);
    construireControleBalance(classeur, Boolean(exerciceN1Id), lignesBalN.length, lignesBalN1.length);

    // 4-7 · pages d'identification du modèle.
    construireCouverture(classeur, ident, 'LIASSE SYSTEME NORMAL', tenant.pays ?? '');
    construireGarde(classeur, ident, {
      bandeau: 'ETATS FINANCIERS NORMALISES\nDU SYSTEME COMPTABLE DES ENTITES A BUT NON LUCRATIF (SYCEBNL)',
      sousBandeau: 'Associations, Ordres Professionnels, Fondations et Assimilées',
      systeme: 'SYSTEME NORMAL',
      documents: [
        "Fiche d'identification et renseignements divers",
        'Bilan (actif et passif)',
        'Compte de résultat',
        'Tableau des flux de trésorerie',
        'Notes annexes',
      ],
    });
    construireFiche1(classeur, ident, 'SYCEBNL', 'Associations et ordres professionnels - Système normal', {
      // Une entité SYCEBNL n'a pas de RCCM (AUDCG art. 2 et 35) · la case ZE
      // du modèle porte son acte de personnalité juridique.
      ZE: tenant.actePersonnaliteJuridique ?? '',
    });
    construireFiche2(classeur, ident, "EQUIPE DE L'ENTITE A BUT NON LUCRATIF");

    // 8 · Bilan paysage · les rangs des feuilles du bilan sont déterministes
    // (données à partir de la ligne 10, dans l'ordre du service), ce qui
    // permet de créer le paysage AVANT elles, à sa place dans le classeur.
    const versCote = (postes: PosteCalcule[], libelle: 'ACTIF' | 'PASSIF') => ({
      feuille: libelle === 'ACTIF' ? 'Bilan-Actif' : 'Bilan-Passif',
      libelle,
      cols:
        libelle === 'ACTIF'
          ? [
              { entete: 'BRUT', lettre: 'D' },
              { entete: 'AMORT et DEPREC.', lettre: 'E' },
              { entete: 'NET', lettre: 'F' },
              { entete: 'NET N-1', lettre: 'G' },
            ]
          : [
              { entete: 'NET', lettre: 'D' },
              { entete: 'NET N-1', lettre: 'E' },
            ],
      lignes: postes.map((p, i) => ({
        ref: p.ref,
        libelle: p.libelle,
        note: NOTE_PAR_REF_ASSOCIATIONS[p.ref] ?? '',
        rangSource: 10 + i,
        niveau: NIVEAUX_ETAT_ASSOCIATIONS[p.ref] ?? ((p.estTotal ? 'inter' : 'normal') as NiveauLigne),
      })),
    });
    construireBilanPaysage(classeur, ident, versCote(bilan.actif, 'ACTIF'), versCote(bilan.passif, 'PASSIF'), 'BILAN');

    // 9-12 · les états eux-mêmes.
    const { rangsActif, rangsPassif } = this.feuillesBilanEtafi(classeur, bilan, ident);
    const rangsCr = this.feuilleResultatEtafi(classeur, cr, ident);
    const { rangs: rangsTft } = this.feuilleTftEtafi(classeur, tft, ident);

    // 13 · fiche récapitulative et notes applicables.
    this.construireClasseurNotes(notes, ident, ExportService.PARTIES_NOTES_ASSOCIATIONS, classeur);

    // 14 · TABLE COMMENTAIRE, sur les mêmes parties que la fiche.
    const parCode = new Map(
      (notes.ficheRecapitulative as Array<{ code: string; titre: string }>).map((n) => [n.code, n.titre]),
    );
    const parties: PartiesNotes = ExportService.PARTIES_NOTES_ASSOCIATIONS.map(([titre, codes]) => [
      titre,
      codes.filter((c) => parCode.has(c)).map((c) => [`NOTE ${c}`, parCode.get(c)!] as [string, string]),
    ]);
    construireTableCommentaires(classeur, parties, ident);

    // 15 · CONTROLES · les recoupements du modèle, en formules cross-feuilles.
    const ctl = classeur.addWorksheet('CONTROLES');
    ctl.getCell(1, 1).value = 'Contrôle';
    ctl.getCell(1, 2).value = 'Valeur';
    ctl.getCell(1, 3).value = 'Attendu';
    entetesBande(ctl, 1, 1, 1, 3);
    const n = Math.max(lignesBalN.length, 1);
    const controles: Array<[string, string | number, string | number]> = [
      ['Total solde de clôture débit balance', `SUM('${NOM_BALANCE}'!G2:G${n + 1})`, ''],
      ['Total solde de clôture crédit balance', `SUM('${NOM_BALANCE}'!H2:H${n + 1})`, ''],
      ['Écart balance (doit être 0)', 'B2-B3', 0],
      ['Total général actif net (BZ)', `'Bilan-Actif'!F${rangsActif.get('BZ')}`, ''],
      ['Total général passif (DZ)', `'Bilan-Passif'!D${rangsPassif.get('DZ')}`, ''],
      ['Écart bilan actif - passif (doit être 0)', 'B5-B6', 0],
      ['Résultat net (compte de résultat, XE)', `Résultat!D${rangsCr.get('XE')}`, ''],
      ['Résultat net logé au bilan (CH)', `'Bilan-Passif'!D${rangsPassif.get('CH')}`, ''],
      ['Écart résultat CR / bilan (doit être 0)', 'B8-B9', 0],
      ['Trésorerie nette au 31/12 (TFT, ZG)', `TFT!D${rangsTft.get('ZG')}`, ''],
      [
        'Trésorerie nette au 31/12 (bilan, BX - DX)',
        `'Bilan-Actif'!F${rangsActif.get('BX')}-'Bilan-Passif'!D${rangsPassif.get('DX')}`,
        '',
      ],
      ['Écart trésorerie TFT / bilan (doit être 0)', 'B11-B12', 0],
    ];
    let rc = 1;
    for (const [lab, val, attendu] of controles) {
      rc += 1;
      ctl.getCell(rc, 1).value = lab;
      ctl.getCell(rc, 2).value = typeof val === 'string' ? { formula: val } : val;
      ctl.getCell(rc, 3).value = attendu;
      styleLigne(ctl, rc, 1, 3, 'normal', [2]);
    }
    largeurs(ctl, { A: 62, B: 20, C: 10 });

    // 16 · ANOMALIES · ce que le serveur sait déjà diagnostiquer.
    const an = classeur.addWorksheet('ANOMALIES');
    for (const [i, h] of ['Gravité', 'Compte', 'Intitulé', 'Problème', 'Solution proposée'].entries()) {
      an.getCell(1, i + 1).value = h;
    }
    entetesBande(an, 1, 1, 1, 5);
    const anomalies: Array<[string, string, string, string, string]> = [];
    if (!bilan.equilibre) {
      anomalies.push([
        'BLOQUANT',
        'BZ / DZ',
        'Bilan',
        `Actif et passif diffèrent de ${(bilan.totalActif - bilan.totalPassif).toFixed(2)}.`,
        'Vérifier les écritures déséquilibrées et les comptes non rattachés.',
      ]);
    }
    if (!cr.controle.coherent) {
      anomalies.push([
        'A_TRAITER',
        'XE',
        'Compte de résultat',
        `Écart de ${cr.controle.ecart.toFixed(2)} entre le résultat des postes officiels et le solde des classes de gestion.`,
        'Rattacher les comptes de gestion listés ci-dessous à un poste officiel.',
      ]);
    }
    if (!tft.controle.coherent) {
      anomalies.push([
        'A_TRAITER',
        'ZG',
        'Tableau des flux de trésorerie',
        `Écart de bouclage de ${tft.controle.ecart.toFixed(2)} avec la trésorerie du bilan.`,
        'Examiner les comptes non ventilés du tableau.',
      ]);
    }
    for (const c of bilan.comptesNonRattaches) {
      anomalies.push([
        'A_TRAITER',
        c.numero,
        c.intitule,
        "Compte de bilan qu'aucun poste du tableau de correspondance officiel ne réclame · son montant n'entre dans aucun total.",
        'Vérifier le numéro de compte, ou créer le compte au bon niveau du plan.',
      ]);
    }
    for (const c of cr.comptesNonRattaches) {
      anomalies.push([
        'A_TRAITER',
        c.numero,
        c.intitule,
        "Compte de gestion qu'aucun poste officiel du compte de résultat ne réclame.",
        'Vérifier le numéro de compte.',
      ]);
    }
    if (anomalies.length === 0) {
      anomalies.push(['INFO', '·', '·', 'Aucune anomalie détectée sur cet exercice.', '·']);
    }
    let ra = 1;
    for (const ligne of anomalies) {
      ra += 1;
      ligne.forEach((v, i) => {
        an.getCell(ra, i + 1).value = v;
      });
      styleLigne(an, ra, 1, 5, 'normal');
    }
    largeurs(an, { A: 12, B: 12, C: 26, D: 62, E: 62 });
    an.views = [{ state: 'frozen', ySplit: 1 }];

    numeroterPages(classeur);
    return classeur;
  }

  async liasseCompleteExcel(
    tenantId: string,
    exerciceId: string,
    /**
     * Poste H du tableau de réconciliation de trésorerie (jeu projets) ·
     * paiements en instance, donnée extra-comptable que seul l'utilisateur
     * connaît. Zéro par défaut, et le sommaire le DIT : un zéro non déclaré
     * serait pris pour un constat alors que c'est une absence de saisie.
     */
    paiementsEnInstance = 0,
  ): Promise<ClasseurExporte> {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const exercice = await this.prisma.exercice.findFirstOrThrow({ where: { id: exerciceId, tenantId } });

    // Jeu associations : la liasse est le classeur ENTIER du modèle du
    // skill, construit nativement (voir liasseAssociationsEtafi). Les deux
    // autres jeux gardent l'assemblage par composition en attendant leur
    // passage à la charte (projets puis SMT, dans cet ordre).
    if (tenant.jeuEtatsFinanciersSycebnl === JeuEtatsFinanciersSycebnl.ASSOCIATIONS_ORDRES_PROFESSIONNELS) {
      const natif = await this.liasseAssociationsEtafi(tenantId, exerciceId);
      return {
        buffer: await this.versBuffer(natif),
        nomFichier: `liasse-complete${await this.suffixeExercice(tenantId, exerciceId)}.xlsx`,
      };
    }
    if (tenant.jeuEtatsFinanciersSycebnl === JeuEtatsFinanciersSycebnl.PROJETS_DEVELOPPEMENT) {
      const natif = await this.liasseProjetsEtafi(tenantId, exerciceId, paiementsEnInstance);
      return {
        buffer: await this.versBuffer(natif),
        nomFichier: `liasse-complete${await this.suffixeExercice(tenantId, exerciceId)}.xlsx`,
      };
    }

    const composants = this.composantsLiasse(
      tenant.jeuEtatsFinanciersSycebnl,
      tenantId,
      exerciceId,
      paiementsEnInstance,
    );

    const classeur = this.nouveauClasseur();
    const sommaire = this.feuilleSommaireLiasse(classeur, tenant, exercice, composants, paiementsEnInstance);

    const nomsPris = new Set<string>([sommaire.name]);
    let rang = 0;
    for (const composant of composants) {
      rang += 1;
      const produit = await composant.construire();
      const source = new ExcelJS.Workbook();
      await source.xlsx.load(produit.buffer as unknown as ExcelJS.Buffer);
      source.eachSheet((feuille) => {
        const nom = this.nomFeuilleUnique(`${rang}. ${feuille.name}`, nomsPris);
        const copie = classeur.addWorksheet(nom);
        // `model` porte les valeurs, les formats de nombre, les polices, les
        // largeurs de colonnes et les volets figés · vérifié à la relecture.
        copie.model = { ...feuille.model, name: nom };
        copie.name = nom;
      });
    }

    return {
      buffer: await this.versBuffer(classeur),
      nomFichier: `liasse-complete${await this.suffixeExercice(tenantId, exerciceId)}.xlsx`,
    };
  }

  /**
   * Les états d'une liasse dépendent du jeu retenu par le dossier
   * (art. 4 de l'Acte uniforme). L'ordre suit celui du texte officiel, parce
   * que c'est l'ordre dans lequel un lecteur de la liasse les attend.
   */
  private composantsLiasse(
    jeu: JeuEtatsFinanciersSycebnl,
    tenantId: string,
    exerciceId: string,
    paiementsEnInstance: number,
  ): { titre: string; source: string; construire: () => Promise<ClasseurExporte> }[] {
    if (jeu === JeuEtatsFinanciersSycebnl.SYSTEME_MINIMAL_TRESORERIE) {
      return [
        {
          titre: 'Bilan',
          source: 'Partie 4, ch. 4 · codes GA à HZ',
          construire: () => this.bilanSmtExcel(tenantId, exerciceId),
        },
        {
          titre: 'Compte de résultat de trésorerie',
          source: 'Partie 4, ch. 4 · codes KA à KZC',
          construire: () => this.compteDeResultatSmtExcel(tenantId, exerciceId),
        },
        {
          titre: 'Journal de trésorerie',
          source: 'Partie 4, ch. 4 · note annexe 4',
          construire: () => this.journalTresorerieSmtExcel(tenantId, exerciceId),
        },
        {
          titre: 'Notes annexes (5)',
          source: 'Partie 4, ch. 4 · fiche récapitulative',
          construire: () => this.notesSmtExcel(tenantId, exerciceId),
        },
        {
          titre: 'Contrôle d’éligibilité au S.M.T',
          source: 'Acte uniforme, art. 5 et 6',
          construire: () => this.eligibiliteSmtExcel(tenantId, exerciceId),
        },
      ];
    }

    if (jeu === JeuEtatsFinanciersSycebnl.PROJETS_DEVELOPPEMENT) {
      return [
        {
          titre: 'Bilan',
          source: 'Partie 4, ch. 3 · codes AA à DZ',
          construire: () => this.bilanProjetExcel(tenantId, exerciceId),
        },
        {
          titre: 'Compte d’exploitation',
          source: 'Partie 4, ch. 3 · codes RA à XC',
          construire: () => this.compteExploitationProjetExcel(tenantId, exerciceId),
        },
        {
          titre: 'Tableau emplois-ressources',
          source: 'Guide d’application, ch. 7, APPLICATION 21 · codes FA à GZ',
          construire: () => this.emploisRessourcesExcel(tenantId, exerciceId),
        },
        {
          titre: 'Tableau d’exécution budgétaire',
          source: 'Guide d’application, ch. 7, APPLICATION 22',
          construire: () => this.executionBudgetaireExcel(tenantId, exerciceId),
        },
        {
          titre: 'Tableau de réconciliation de trésorerie',
          source: 'Partie 4, ch. 3 · codes A à I',
          construire: () => this.reconciliationTresorerieExcel(tenantId, exerciceId, paiementsEnInstance),
        },
        {
          titre: 'Note des fonds du bailleur',
          source: 'Partie 4, ch. 3 · note annexe 9',
          construire: () => this.noteBailleurExcel(tenantId, exerciceId),
        },
        {
          titre: 'Notes annexes (24)',
          source: 'Partie 4, ch. 3 · fiche récapitulative',
          construire: () => this.notesProjetExcel(tenantId, exerciceId),
        },
      ];
    }

    return [
      {
        titre: 'Bilan',
        source: 'Partie 4, ch. 2 · codes AA à DZ',
        construire: () => this.bilanExcel(tenantId, exerciceId),
      },
      {
        titre: 'Compte de résultat',
        source: 'Partie 4, ch. 2 · codes RA à XE',
        construire: () => this.compteDeResultatExcel(tenantId, exerciceId),
      },
      {
        titre: 'Tableau de flux de trésorerie',
        source: 'Partie 4, ch. 2 · codes ZA à ZG, méthode directe',
        construire: () => this.tableauFluxTresorerieExcel(tenantId, exerciceId),
      },
      {
        titre: 'Notes annexes (35)',
        source: 'Partie 4, ch. 2 · fiche récapitulative',
        construire: () => this.notesAssociationsExcel(tenantId, exerciceId),
      },
    ];
  }

  /**
   * Sommaire du classeur. Il n'est pas décoratif : c'est la seule page du
   * fichier qui identifie l'entité et l'exercice, mentions que le CPCC exige
   * en tête de chaque page d'un état déposé (§ 7.4 règle 7-a). Il liste
   * ensuite les états présents et la source officielle de chacun.
   */
  private feuilleSommaireLiasse(
    classeur: ExcelJS.Workbook,
    tenant: { nom: string; numeroImpot: string | null; idNat: string | null; jeuEtatsFinanciersSycebnl: JeuEtatsFinanciersSycebnl },
    exercice: { dateDebut: Date; dateFin: Date },
    composants: { titre: string; source: string }[],
    paiementsEnInstance: number,
  ): ExcelJS.Worksheet {
    const feuille = classeur.addWorksheet('Sommaire');
    feuille.columns = [
      { header: '', key: 'cle', width: 34 },
      { header: '', key: 'valeur', width: 62 },
      { header: '', key: 'source', width: 52 },
    ];

    const dureeMois =
      (exercice.dateFin.getUTCFullYear() - exercice.dateDebut.getUTCFullYear()) * 12 +
      (exercice.dateFin.getUTCMonth() - exercice.dateDebut.getUTCMonth()) +
      1;

    const titre = feuille.addRow({ cle: 'ÉTATS FINANCIERS SYCEBNL' });
    titre.getCell('cle').font = { bold: true, size: 14 };
    feuille.addRow({});

    const identite: [string, string][] = [
      ['Dénomination', tenant.nom],
      ['N° d’identification fiscale', tenant.numeroImpot ?? 'non renseigné'],
      ['Identification nationale', tenant.idNat ?? 'non renseignée'],
      ['Exercice ouvert le', exercice.dateDebut.toLocaleDateString('fr-FR')],
      ['Exercice clos le', exercice.dateFin.toLocaleDateString('fr-FR')],
      ['Durée (en mois)', String(dureeMois)],
      ['Jeu d’états financiers', LIBELLE_JEU[tenant.jeuEtatsFinanciersSycebnl]],
      ['Édité le', new Date().toLocaleDateString('fr-FR')],
    ];
    for (const [cle, valeur] of identite) {
      const l = feuille.addRow({ cle, valeur });
      l.getCell('cle').font = { bold: true };
    }

    feuille.addRow({});
    const enTete = feuille.addRow({ cle: 'ÉTAT', valeur: '', source: 'SOURCE OFFICIELLE' });
    styliserEntete(enTete);
    composants.forEach((c, i) => {
      feuille.addRow({ cle: `${i + 1}. ${c.titre}`, valeur: '', source: c.source });
    });

    feuille.addRow({});
    const note = feuille.addRow({
      cle: 'Note',
      valeur:
        'Ce classeur reprend, à l’identique, les états exportés individuellement. Chaque état conserve ses feuilles de détail, d’anomalies et de méthode.',
    });
    note.getCell('valeur').alignment = { wrapText: true, vertical: 'top' };

    // Le poste H du tableau de réconciliation est extra-comptable : le
    // logiciel ne peut pas le déduire. Annoncer la valeur retenue évite qu'un
    // zéro par défaut soit lu comme un constat.
    if (tenant.jeuEtatsFinanciersSycebnl === JeuEtatsFinanciersSycebnl.PROJETS_DEVELOPPEMENT) {
      const h = feuille.addRow({
        cle: 'Paiements en instance (poste H)',
        valeur:
          paiementsEnInstance === 0
            ? 'Zéro retenu, faute de saisie. C’est une donnée extra-comptable : renseignez-la sur l’écran avant dépôt si elle n’est pas nulle.'
            : `${paiementsEnInstance.toLocaleString('fr-FR')} , saisi par l’utilisateur`,
      });
      h.getCell('cle').font = { bold: true };
      h.getCell('valeur').alignment = { wrapText: true, vertical: 'top' };
    }

    feuille.getRow(1).height = 20;
    return feuille;
  }

  /**
   * Excel refuse un nom de feuille de plus de 31 caractères et deux feuilles
   * de même nom. Les états unitaires ont chacun leur feuille « Détail » et
   * « Anomalies » : sans déduplication, la liasse serait rejetée à
   * l’ouverture. Le rang préfixé rend l’ordre lisible et sert de premier
   * discriminant ; le suffixe numérique ne sert que pour les collisions
   * résiduelles après troncature.
   */
  private nomFeuilleUnique(souhaite: string, pris: Set<string>): string {
    const base = souhaite.slice(0, 31);
    if (!pris.has(base)) {
      pris.add(base);
      return base;
    }
    for (let i = 2; i < 100; i++) {
      const suffixe = ` (${i})`;
      const candidat = base.slice(0, 31 - suffixe.length) + suffixe;
      if (!pris.has(candidat)) {
        pris.add(candidat);
        return candidat;
      }
    }
    throw new Error(`Impossible de nommer la feuille « ${souhaite} » sans collision`);
  }
}

function styliserEntete(ligne: ExcelJS.Row) {
  ligne.font = ENTETE_FONT;
  ligne.fill = ENTETE_FILL as ExcelJS.Fill;
}

/**
 * `resultatActivitesOrdinaires` → « Resultat activites ordinaires ». Sert à
 * nommer les sections et les totaux d'un état FIGÉ dont on ne connaît pas la
 * forme à l'avance (voir `feuilleEtatFige`) : mieux vaut restituer la clé
 * telle qu'elle a été gelée que la traduire par une table qui, elle,
 * évoluerait.
 */
function enMots(cle: string): string {
  const espace = cle.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z])([A-Z][a-z])/g, '$1 $2');
  return espace.charAt(0).toUpperCase() + espace.slice(1).toLowerCase();
}
