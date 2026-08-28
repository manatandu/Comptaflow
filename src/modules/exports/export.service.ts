import { Injectable, PayloadTooLargeException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';
import { EtatsFinanciersService, PosteCalcule } from '../etats-financiers/etats-financiers.service';
import { EtatsFinanciersProjetService } from '../etats-financiers/etats-financiers-projet.service';
import { NoteAnnexeService } from '../notes-annexes/note-annexe.service';
import { DonationService, manquementsArticle17 } from '../registre-donateurs/donation.service';
import { LivreInventaireService } from '../documents-obligatoires/livre-inventaire.service';
import { RapportActiviteService } from '../documents-obligatoires/rapport-activite.service';
import { SECTIONS_RAPPORT_ACTIVITE } from '../documents-obligatoires/correspondance-inventaire';
import { ColonneNote, LigneNoteCalculee, NoteCalculee, TypeColonneNote } from '../notes-annexes/note-annexe.types';

const ENTETE_FONT = { bold: true } as const;
const ENTETE_FILL = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFE8E8E8' },
} as const;

const FORMAT_MONTANT = '#,##0.00';
const FORMAT_DATE = 'DD/MM/YYYY';

/** Un classeur produit, avec le nom de fichier que le contrôleur doit servir. */
export interface ClasseurExporte {
  buffer: Buffer;
  nomFichier: string;
}

/**
 * Export Excel des documents comptables — Journal, Grand livre (un compte ou
 * complet), Balance, Bilan et Compte de résultat. Objectif explicite
 * (demande utilisateur, séance du 2026-08-28) : produire des documents
 * exploitables pour l'audit, un PDF étant difficile à recouper ligne à
 * ligne. Chaque feuille reste strictement SYCEBNL/OHADA — pas d'emprunt de
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
    private readonly noteAnnexeService: NoteAnnexeService,
    private readonly donationService: DonationService,
    private readonly livreInventaire: LivreInventaireService,
    private readonly rapportActivite: RapportActiviteService,
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

  /**
   * Garde-fou de volume. Le classeur est intégralement construit en mémoire
   * puis sérialisé en un seul buffer (`writeBuffer`) : mesuré, un export de
   * 50 000 lignes consomme environ 1 Go. Sans borne, un utilisateur — même
   * en LECTURE_SEULE — pouvait enchaîner les exports d'un gros dossier et
   * saturer le tas Node, ce qui fait tomber le processus pour TOUS les
   * tenants (l'application est mono-processus, sans file de travaux).
   *
   * Le refus est explicite et actionnable plutôt que silencieux : mieux vaut
   * demander de restreindre la période qu'un état tronqué, ou qu'un
   * plantage. Le passage à `ExcelJS.stream.xlsx.WorkbookWriter` lèverait la
   * contrainte, au prix d'une refonte de la réponse en flux — hors périmètre
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
    ];

    for (const e of ecritures) {
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
   * Grand livre d'UN compte, avec colonne « Compte contrepartie » — demande
   * explicite de l'utilisateur, pour retracer une écriture sans connaître
   * son journal.
   *
   * Règle retenue (voir discussion du 2026-08-28, docs/plan-de-construction.md) :
   * comptes DISTINCTS de sens opposé dans la même écriture — calculée une
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
    // grand livre complet — et surtout comme l'écran, qui affiche « SOLDE
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
    const enTete = `${compte.numero} — ${compte.intitule}`.replace(/&/g, '&&');
    feuille.headerFooter = { firstHeader: `&C${enTete}` };

    return {
      buffer: await this.versBuffer(classeur),
      nomFichier: `grand-livre-${compte.numero}${await this.suffixeExercice(tenantId, exerciceId)}.xlsx`,
    };
  }

  /**
   * Grand livre COMPLET — tous les comptes mouvementés de l'exercice dans un
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
   *    final) — c'est là que vivent les sous-totaux, plutôt qu'en lignes de
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
    feuille.columns = [
      { header: 'N° compte', key: 'numero', width: 12 },
      { header: 'Intitulé', key: 'intitule', width: 36 },
      { header: 'Type', key: 'type', width: 10 },
      { header: 'Total débit', key: 'totalDebit', width: 16 },
      { header: 'Total crédit', key: 'totalCredit', width: 16 },
      { header: 'Solde', key: 'solde', width: 16 },
    ];

    for (const l of lignes) {
      const ligne = feuille.addRow({
        numero: l.numero,
        intitule: l.intitule,
        // Colonne explicite plutôt que le seul gras : un compte Total est un
        // agrégat des comptes Détail de même racine, jamais un mouvement
        // propre — sommer les deux doublerait les montants, et cette
        // distinction doit rester lisible même après tri ou filtre.
        type: l.typeCompte === 'TOTAL' ? 'Total' : 'Détail',
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
   * Bilan — ⚠️ reprend le regroupement SIMPLIFIÉ classe→poste du module
   * etats-financiers (MVP, PAS le tableau de correspondance officiel
   * SYCEBNL Partie 4 ch. 2). Le classeur porte l'avertissement explicitement
   * en cellule, jamais caché — voir etats-financiers.service.ts pour le
   * détail de la règle appliquée et la note sur le moteur `liasse/` officiel
   * (skill sycebnl) qui doit remplacer ce module (roadmap — Moteur de
   * mapping / états financiers configurables).
   */
  /**
   * Bilan — adossé au tableau de correspondance OFFICIEL SYCEBNL, comme le
   * compte de résultat (voir `EtatsFinanciersService.bilan()` et
   * `correspondance-bilan.ts`). Trois feuilles : l'état (postes ACTIF et
   * PASSIF juxtaposés, sous-totaux en gras dans leur sens de lecture
   * officiel), le détail des comptes derrière chaque poste, et les
   * contrôles/anomalies.
   *
   * Colonnes : le texte officiel exige Brut / Amortissements et dépréciations
   * / Net côté actif (pas un seul montant net), et un comparatif N-1 des
   * deux côtés — les deux manquaient à l'origine, corrigés après une
   * question directe de l'utilisateur sur une capture d'écran (2026-08-28).
   * Le passif n'a pas de colonne Brut/Amort (le texte officiel n'en prévoit
   * pas) : seulement Net (N) et Net (N-1).
   */
  async bilanExcel(tenantId: string, exerciceId: string): Promise<ClasseurExporte> {
    const bilan = await this.etatsFinanciersService.bilan(tenantId, exerciceId);
    const suffixeN1 = bilan.exerciceN1Disponible ? '' : ' (aucun exercice antérieur)';

    const classeur = this.nouveauClasseur();
    const feuille = classeur.addWorksheet('Bilan');
    // En-têtes distincts de part et d'autre : deux colonnes portant le même
    // titre casseraient tout tableau croisé dynamique.
    feuille.columns = [
      { header: 'Actif — REF', key: 'refActif', width: 10 },
      { header: 'Actif — libellé', key: 'libelleActif', width: 42 },
      { header: 'Actif — Brut (N)', key: 'brutActif', width: 15 },
      { header: 'Actif — Amort./dépréc. (N)', key: 'amortActif', width: 18 },
      { header: 'Actif — Net (N)', key: 'montantActif', width: 15 },
      { header: `Actif — Net (N-1)${suffixeN1}`, key: 'montantActifN1', width: 17 },
      { header: 'Passif — REF', key: 'refPassif', width: 10 },
      { header: 'Passif — libellé', key: 'libellePassif', width: 42 },
      { header: 'Passif — Net (N)', key: 'montantPassif', width: 15 },
      { header: `Passif — Net (N-1)${suffixeN1}`, key: 'montantPassifN1', width: 17 },
    ];

    const maxLignes = Math.max(bilan.actif.length, bilan.passif.length);
    for (let i = 0; i < maxLignes; i++) {
      const a = bilan.actif[i];
      const p = bilan.passif[i];
      const ligne = feuille.addRow({
        refActif: a?.ref ?? '',
        libelleActif: a?.libelle ?? '',
        brutActif: a?.brut ?? null,
        amortActif: a?.amortissement ?? null,
        montantActif: a ? a.montant : null,
        montantActifN1: a?.montantN1 ?? null,
        refPassif: p?.ref ?? '',
        libellePassif: p?.libelle ?? '',
        montantPassif: p ? p.montant : null,
        montantPassifN1: p?.montantN1 ?? null,
      });
      // Chaque total est en gras SUR SES PROPRES COLONNES seulement (actif et
      // passif n'atteignent pas forcément un total à la même ligne) : mettre
      // toute la ligne en gras si un seul côté est un total ferait ressortir
      // l'autre à tort.
      if (a?.estTotal) {
        for (const cle of ['refActif', 'libelleActif', 'brutActif', 'amortActif', 'montantActif', 'montantActifN1']) {
          ligne.getCell(cle).font = ENTETE_FONT;
        }
      }
      if (p?.estTotal) {
        for (const cle of ['refPassif', 'libellePassif', 'montantPassif', 'montantPassifN1']) {
          ligne.getCell(cle).font = ENTETE_FONT;
        }
      }
    }

    this.appliquerFormats(feuille, {
      brutActif: FORMAT_MONTANT,
      amortActif: FORMAT_MONTANT,
      montantActif: FORMAT_MONTANT,
      montantActifN1: FORMAT_MONTANT,
      montantPassif: FORMAT_MONTANT,
      montantPassifN1: FORMAT_MONTANT,
    });
    // En-tête figée SANS auto-filtre : le bilan n'est pas un tableau plat
    // mais DEUX listes indépendantes juxtaposées (actif à gauche, passif à
    // droite), appariées ligne à ligne par un simple index. Filtrer sur un
    // montant d'actif y masquerait des postes de passif qui n'ont rien à
    // voir, en laissant les totaux affichés — un bilan faussé en un clic.
    styliserEntete(feuille.getRow(1));
    feuille.views = [{ state: 'frozen', ySplit: 1 }];

    // Détail : quels comptes alimentent quel poste — indispensable pour
    // qu'un auditeur puisse vérifier le montant plutôt que le prendre sur
    // parole. Les lignes de total n'ont pas de comptes propres (`comptes: []`).
    const detail = classeur.addWorksheet('Détail par poste');
    detail.columns = [
      { header: 'Sens', key: 'sens', width: 8 },
      { header: 'REF', key: 'ref', width: 8 },
      { header: 'Poste', key: 'poste', width: 48 },
      { header: 'Compte', key: 'numero', width: 12 },
      { header: 'Intitulé compte', key: 'intitule', width: 44 },
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

    // Contrôles et anomalies — même esprit que le compte de résultat.
    const anomalies = classeur.addWorksheet('Contrôles et anomalies');
    anomalies.columns = [
      { header: 'Compte', key: 'numero', width: 14 },
      { header: 'Intitulé', key: 'intitule', width: 48 },
      { header: 'Montant', key: 'montant', width: 20 },
      { header: 'Diagnostic', key: 'diagnostic', width: 90 },
    ];

    const ligneEquilibre = anomalies.addRow({
      numero: 'CONTRÔLE',
      intitule: 'Total actif (BZ) = Total passif (DZ) ?',
      montant: bilan.totalActif - bilan.totalPassif,
      diagnostic: bilan.equilibre
        ? `OK — bilan équilibré. Actif = Passif = ${bilan.totalActif.toFixed(2)}.`
        : `DÉSÉQUILIBRE de ${(bilan.totalActif - bilan.totalPassif).toFixed(2)} — vérifier les écritures et les comptes non rattachés ci-dessous.`,
    });
    ligneEquilibre.font = { bold: true, color: { argb: bilan.equilibre ? 'FF1E7B34' : 'FFB00020' } };

    const ligneResultat = anomalies.addRow({
      numero: 'CONTRÔLE',
      intitule: 'Source du résultat net (poste CH)',
      montant: null,
      diagnostic: bilan.controle.doubleComptageProbable
        ? `Classes 6/7/8 ET compte 13 sont TOUS DEUX mouvementés (${bilan.controle.resultatClasses678.toFixed(2)} / ${bilan.controle.resultatCompte13.toFixed(2)}) — risque de double comptage. Le résultat retenu vient des classes 6/7/8 (avant clôture). Fournir une balance avant OU après clôture, pas un état intermédiaire.`
        : `OK — une seule source mouvementée (${Math.abs(bilan.controle.resultatClasses678) > 0.005 ? 'classes 6/7/8, avant clôture' : 'compte 13, après clôture'}).`,
    });
    ligneResultat.font = { bold: true, color: { argb: bilan.controle.doubleComptageProbable ? 'FFB00020' : 'FF1E7B34' } };

    for (const c of bilan.comptesNonRattaches) {
      anomalies.addRow({
        numero: c.numero,
        intitule: c.intitule,
        montant: c.montant,
        diagnostic:
          'Compte de bilan (classe 1 à 5) qu’aucun poste du tableau de correspondance officiel ne réclame : ' +
          'son montant n’entre dans AUCUN total de cet état. Vérifier le numéro de compte.',
      });
    }
    if (bilan.comptesNonRattaches.length === 0) {
      anomalies.addRow({
        numero: '—',
        intitule: 'Aucun compte non rattaché : tous les comptes de bilan entrent dans un poste officiel.',
      });
    }
    this.appliquerFormats(anomalies, { montant: FORMAT_MONTANT });
    this.finaliserTableau(anomalies, anomalies.columns.length, anomalies.rowCount);

    return {
      buffer: await this.versBuffer(classeur),
      nomFichier: `bilan${await this.suffixeExercice(tenantId, exerciceId)}.xlsx`,
    };
  }

  /**
   * Compte de résultat — adossé au tableau de correspondance OFFICIEL
   * (Journal officiel OHADA, Partie 4 ch. 2 section 6), contrairement au
   * bilan ci-dessus. Trois feuilles : l'état lui-même, le détail des comptes
   * derrière chaque poste (drill-down indispensable en audit), et les
   * anomalies éventuelles.
   */
  async compteDeResultatExcel(tenantId: string, exerciceId: string): Promise<ClasseurExporte> {
    const cr = await this.etatsFinanciersService.compteDeResultat(tenantId, exerciceId);
    const suffixeN1 = cr.exerciceN1Disponible ? '' : ' (aucun exercice antérieur)';

    const classeur = this.nouveauClasseur();
    const feuille = classeur.addWorksheet('Compte de résultat');
    // Colonne N-1 : exigée par le texte officiel (« Net exercice au
    // 31/12/N-1 ») au même titre que sur le bilan — manquait à l'origine.
    feuille.columns = [
      { header: 'REF', key: 'ref', width: 8 },
      { header: 'Libellé', key: 'libelle', width: 58 },
      { header: 'Montant (N)', key: 'montant', width: 16 },
      { header: `Montant (N-1)${suffixeN1}`, key: 'montantN1', width: 17 },
    ];

    const ajouterTotal = (ref: string, libelle: string, montant: number, montantN1?: number) => {
      const ligne = feuille.addRow({ ref, libelle, montant, montantN1: montantN1 ?? null });
      ligne.font = ENTETE_FONT;
      return ligne;
    };
    const ajouterPoste = (p: PosteCalcule) =>
      feuille.addRow({ ref: p.ref, libelle: p.libelle, montant: p.montant, montantN1: p.montantN1 ?? null });

    cr.produits.forEach(ajouterPoste);
    ajouterTotal('XA', 'REVENUS DES ACTIVITÉS ORDINAIRES', cr.totalProduits, cr.totalProduitsN1);
    cr.charges.forEach(ajouterPoste);
    ajouterTotal('XB', 'CHARGES DES ACTIVITÉS ORDINAIRES', cr.totalCharges, cr.totalChargesN1);
    ajouterTotal(
      'XC',
      'RÉSULTAT DES ACTIVITÉS ORDINAIRES (XA − XB)',
      cr.resultatActivitesOrdinaires,
      cr.resultatActivitesOrdinairesN1,
    );
    ajouterPoste(cr.produitsHao);
    ajouterPoste(cr.chargesHao);
    ajouterTotal('XD', 'RÉSULTAT H.A.O. (TM − TN)', cr.resultatHao, cr.resultatHaoN1);
    ajouterTotal(
      'XE',
      "RÉSULTAT NET DE L'EXERCICE (+excédent, −déficit) (XC + XD)",
      cr.resultatNet,
      cr.resultatNetN1,
    );

    this.appliquerFormats(feuille, { montant: FORMAT_MONTANT, montantN1: FORMAT_MONTANT });
    styliserEntete(feuille.getRow(1));
    feuille.views = [{ state: 'frozen', ySplit: 1 }];
    // Pas d'auto-filtre ici : l'état est une liste ordonnée de postes avec
    // ses totaux intercalés, filtrer n'aurait aucun sens comptable.

    const note = feuille.addRow([
      'Postes et rattachements de comptes conformes au tableau de correspondance officiel SYCEBNL ' +
        '(Journal officiel OHADA, Partie 4 ch. 2). Les charges sont présentées en positif, ' +
        'de sorte que XC = XA − XB. Le poste XA inclut RH (reprises) : le libellé officiel dit ' +
        '« Somme RA à RG », ce qui romprait l’égalité entre le résultat et le bilan dès qu’il y a des reprises.',
    ]);
    note.font = { italic: true, color: { argb: 'FF555555' } };
    feuille.mergeCells(`A${note.number}:D${note.number}`);

    // Détail : quels comptes alimentent quel poste — c'est ce qui rend
    // l'état vérifiable, plutôt qu'à prendre sur parole.
    const detail = classeur.addWorksheet('Détail par poste');
    detail.columns = [
      { header: 'REF', key: 'ref', width: 8 },
      { header: 'Poste', key: 'poste', width: 52 },
      { header: 'Compte', key: 'numero', width: 12 },
      { header: 'Intitulé compte', key: 'intitule', width: 44 },
      { header: 'Montant', key: 'montant', width: 18 },
    ];
    const tousPostes = [...cr.produits, ...cr.charges, cr.produitsHao, cr.chargesHao];
    for (const p of tousPostes) {
      for (const c of p.comptes) {
        detail.addRow({ ref: p.ref, poste: p.libelle, numero: c.numero, intitule: c.intitule, montant: c.montant });
      }
    }
    this.appliquerFormats(detail, { montant: FORMAT_MONTANT });
    this.finaliserTableau(detail, detail.columns.length, detail.rowCount);

    // Contrôles et anomalies. Feuille toujours présente, même quand tout va
    // bien — une feuille absente pourrait passer pour un oubli, alors que
    // « aucune anomalie » est une information à part entière en audit.
    const anomalies = classeur.addWorksheet('Contrôles et anomalies');
    anomalies.columns = [
      { header: 'Compte', key: 'numero', width: 14 },
      { header: 'Intitulé', key: 'intitule', width: 48 },
      { header: 'Montant (crédit − débit)', key: 'montant', width: 24 },
      { header: 'Diagnostic', key: 'diagnostic', width: 78 },
    ];

    const ligneControle = anomalies.addRow({
      numero: 'CONTRÔLE',
      intitule: 'Résultat des postes (XE) = résultat de tous les comptes de gestion ?',
      montant: cr.controle.ecart,
      diagnostic: cr.controle.coherent
        ? `OK — l'état boucle. XE = ${cr.resultatNet.toFixed(2)}, identique au résultat logé au bilan.`
        : `ÉCART DE ${cr.controle.ecart.toFixed(2)} — l'état NE BOUCLE PAS. XE = ${cr.resultatNet.toFixed(2)} alors que le solde de ` +
          `tous les comptes de gestion vaut ${cr.controle.resultatToutesClassesDeGestion.toFixed(2)} (montant logé au bilan). ` +
          `L'écart vaut la somme des comptes non rattachés listés ci-dessous.`,
    });
    ligneControle.font = {
      bold: true,
      color: { argb: cr.controle.coherent ? 'FF1E7B34' : 'FFB00020' },
    };

    for (const c of cr.comptesNonRattaches) {
      anomalies.addRow({
        numero: c.numero,
        intitule: c.intitule,
        montant: c.montant,
        diagnostic:
          'Compte de gestion (classe 6/7/8) qu’aucun poste du tableau de correspondance officiel ne réclame : ' +
          'son montant n’entre dans AUCUN total de cet état. Saisir sur la subdivision prévue par le plan officiel ' +
          '(ex. 7051/7052/7053 plutôt que 705), ou vérifier le numéro de compte.',
      });
    }
    if (cr.comptesNonRattaches.length === 0) {
      anomalies.addRow({
        numero: '—',
        intitule: 'Aucun compte non rattaché : tous les comptes de gestion entrent dans un poste officiel.',
      });
    }
    this.appliquerFormats(anomalies, { montant: FORMAT_MONTANT });
    this.finaliserTableau(anomalies, anomalies.columns.length, anomalies.rowCount);

    return {
      buffer: await this.versBuffer(classeur),
      nomFichier: `compte-de-resultat${await this.suffixeExercice(tenantId, exerciceId)}.xlsx`,
    };
  }

  /**
   * BILAN — jeu SYCEBNL « projets de développement et assimilés » (Partie 4,
   * ch. 3), adossé à `EtatsFinanciersProjetService`/`correspondance-projet-bilan.ts`.
   * Même parti pris de forme que `bilanExcel` ci-dessus (Brut/Amort/Net,
   * comparatif N-1, feuille Détail, feuille Contrôles) — sans la feuille de
   * double-source du résultat net : ce jeu n'a qu'une seule source pour CC
   * (compte 13, voir `EtatsFinanciersProjetService.calculerCC`).
   */

  /**
   * Tableau de flux de trésorerie — spécifique au jeu associations (Partie 4,
   * ch. 1 § 4). Méthode directe, colonnes N et N-1, double contrôle de
   * bouclage porté sur une feuille dédiée plutôt qu'en simple bandeau.
   */
  async tableauFluxTresorerieExcel(tenantId: string, exerciceId: string): Promise<ClasseurExporte> {
    const tft = await this.etatsFinanciersService.tableauFluxTresorerie(tenantId, exerciceId);
    const suffixeN1 = tft.exerciceN1Disponible ? '' : ' (aucun exercice antérieur)';

    const classeur = this.nouveauClasseur();
    const feuille = classeur.addWorksheet('Flux de trésorerie');
    feuille.columns = [
      { header: 'REF', key: 'ref', width: 8 },
      { header: 'Libellé', key: 'libelle', width: 62 },
      { header: 'Exercice N', key: 'montant', width: 16 },
      { header: `Exercice N-1${suffixeN1}`, key: 'montantN1', width: 17 },
    ];

    for (const l of tft.lignes) {
      if ('section' in l) {
        const ligne = feuille.addRow([l.section]);
        ligne.font = { italic: true, bold: true };
        feuille.mergeCells(`A${ligne.number}:D${ligne.number}`);
        continue;
      }
      const ligne = feuille.addRow({ ref: l.ref, libelle: l.libelle, montant: l.montant, montantN1: l.montantN1 ?? null });
      if (l.estTotal) ligne.font = ENTETE_FONT;
    }

    this.appliquerFormats(feuille, { montant: FORMAT_MONTANT, montantN1: FORMAT_MONTANT });
    styliserEntete(feuille.getRow(1));
    feuille.views = [{ state: 'frozen', ySplit: 1 }];

    const note = feuille.addRow([
      'Méthode directe imposée par le texte officiel (Partie 4, ch. 1 § 4) : Encaissements N = Revenus (N) + ' +
        'Créances (N-1) − Créances (N) ; Décaissements N = Achats (N) + Dettes (N-1) − Dettes (N). Aucun tableau ' +
        'de correspondance poste → comptes n’est fourni par le texte pour cet état (contrairement au bilan et au ' +
        'compte de résultat) : les rattachements sont déduits des intitulés du plan de comptes normalisé, voir ' +
        'correspondance-tft.ts.',
    ]);
    note.font = { italic: true, color: { argb: 'FF555555' } };
    feuille.mergeCells(`A${note.number}:D${note.number}`);

    // --- Contrôle de bouclage : feuille dédiée, les DEUX égalités du texte ---
    const controle = classeur.addWorksheet('Contrôle de bouclage');
    controle.columns = [
      { header: 'Élément', key: 'libelle', width: 62 },
      { header: 'Montant', key: 'montant', width: 18 },
    ];
    controle.addRow({ libelle: 'Trésorerie nette au 1er janvier (A)', montant: tft.controle.tresorerieOuverture });
    controle.addRow({ libelle: 'Variation de la trésorerie nette de la période (G = B+C+D+E)', montant: tft.controle.variation });
    const cloture1 = controle.addRow({
      libelle: 'Trésorerie nette au 31 décembre — par cumul des flux (G + A)',
      montant: tft.controle.tresorerieClotureParFlux,
    });
    cloture1.font = ENTETE_FONT;
    const cloture2 = controle.addRow({
      libelle: 'Trésorerie nette au 31 décembre — lecture directe du bilan (Trésorerie actif N − Trésorerie passif N)',
      montant: tft.controle.tresorerieClotureParBilan,
    });
    cloture2.font = ENTETE_FONT;
    const ligneEcart = controle.addRow({ libelle: 'ÉCART', montant: tft.controle.ecart });
    ligneEcart.font = { bold: true, color: { argb: tft.controle.coherent ? 'FF2E7D32' : 'FFB00020' } };
    const ligneStatut = controle.addRow([
      tft.controle.coherent
        ? "L'ÉTAT BOUCLE — les deux égalités de contrôle du texte officiel concordent."
        : "ÉCART DE BOUCLAGE — la ventilation FA-FQ ne couvre pas tout le mouvement de trésorerie de l'exercice ; " +
          'voir la feuille « Comptes non ventilés ».',
    ]);
    ligneStatut.font = { italic: true };
    controle.mergeCells(`A${ligneStatut.number}:B${ligneStatut.number}`);
    this.appliquerFormats(controle, { montant: FORMAT_MONTANT });
    styliserEntete(controle.getRow(1));

    // --- Comptes non ventilés : la CAUSE d'un écart, jamais un chiffre orphelin ---
    if (tft.comptesNonVentiles.length > 0) {
      const nonVentiles = classeur.addWorksheet('Comptes non ventilés');
      nonVentiles.columns = [
        { header: 'Compte', key: 'numero', width: 14 },
        { header: 'Intitulé', key: 'intitule', width: 50 },
        { header: 'Solde', key: 'montant', width: 16 },
      ];
      for (const c of tft.comptesNonVentiles) nonVentiles.addRow(c);
      this.appliquerFormats(nonVentiles, { montant: FORMAT_MONTANT });
      styliserEntete(nonVentiles.getRow(1));
    }

    // --- Détail : quels comptes alimentent quel poste ---
    const detail = classeur.addWorksheet('Détail par poste');
    detail.columns = [
      { header: 'REF', key: 'ref', width: 8 },
      { header: 'Poste', key: 'poste', width: 58 },
      { header: 'Compte', key: 'numero', width: 12 },
      { header: 'Intitulé compte', key: 'intitule', width: 44 },
      { header: 'Montant', key: 'montant', width: 16 },
    ];
    for (const l of tft.lignes) {
      if ('section' in l) continue;
      for (const c of l.comptes) {
        detail.addRow({ ref: l.ref, poste: l.libelle, numero: c.numero, intitule: c.intitule, montant: c.montant });
      }
    }
    this.appliquerFormats(detail, { montant: FORMAT_MONTANT });
    styliserEntete(detail.getRow(1));
    detail.views = [{ state: 'frozen', ySplit: 1 }];
    if (detail.rowCount > 1) {
      detail.autoFilter = { from: { row: 1, column: 1 }, to: { row: detail.rowCount, column: 5 } };
    }

    return {
      buffer: await this.versBuffer(classeur),
      nomFichier: `flux-tresorerie${await this.suffixeExercice(tenantId, exerciceId)}.xlsx`,
    };
  }

  async bilanProjetExcel(tenantId: string, exerciceId: string): Promise<ClasseurExporte> {
    const bilan = await this.etatsFinanciersProjetService.bilan(tenantId, exerciceId);
    const suffixeN1 = bilan.exerciceN1Disponible ? '' : ' (aucun exercice antérieur)';

    const classeur = this.nouveauClasseur();
    const feuille = classeur.addWorksheet('Bilan (projet de développement)');
    // DEUX colonnes de valeur par volet, pas quatre : le texte officiel de ce
    // jeu ne prévoit ni Brut ni Amortissements (contrairement au bilan des
    // associations). Voir l'en-tête de correspondance-projet-bilan.ts.
    feuille.columns = [
      { header: 'Actif — REF', key: 'refActif', width: 10 },
      { header: 'Actif — libellé', key: 'libelleActif', width: 42 },
      { header: 'Actif — Exercice au 31/12/N', key: 'montantActif', width: 20 },
      { header: `Actif — Exercice au 31/12/N-1${suffixeN1}`, key: 'montantActifN1', width: 22 },
      { header: 'Passif — REF', key: 'refPassif', width: 10 },
      { header: 'Passif — libellé', key: 'libellePassif', width: 42 },
      { header: 'Passif — Exercice au 31/12/N', key: 'montantPassif', width: 20 },
      { header: `Passif — Exercice au 31/12/N-1${suffixeN1}`, key: 'montantPassifN1', width: 22 },
    ];

    const maxLignes = Math.max(bilan.actif.length, bilan.passif.length);
    for (let i = 0; i < maxLignes; i++) {
      const a = bilan.actif[i];
      const p = bilan.passif[i];
      const ligne = feuille.addRow({
        refActif: a?.ref ?? '',
        libelleActif: a?.libelle ?? '',
        montantActif: a ? a.montant : null,
        montantActifN1: a?.montantN1 ?? null,
        refPassif: p?.ref ?? '',
        libellePassif: p?.libelle ?? '',
        montantPassif: p ? p.montant : null,
        montantPassifN1: p?.montantN1 ?? null,
      });
      if (a?.estTotal) {
        for (const cle of ['refActif', 'libelleActif', 'montantActif', 'montantActifN1']) {
          ligne.getCell(cle).font = ENTETE_FONT;
        }
      }
      if (p?.estTotal) {
        for (const cle of ['refPassif', 'libellePassif', 'montantPassif', 'montantPassifN1']) {
          ligne.getCell(cle).font = ENTETE_FONT;
        }
      }
    }

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
      { header: 'Compte', key: 'numero', width: 12 },
      { header: 'Intitulé compte', key: 'intitule', width: 44 },
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

    const anomalies = classeur.addWorksheet('Contrôles et anomalies');
    anomalies.columns = [
      { header: 'Compte', key: 'numero', width: 14 },
      { header: 'Intitulé', key: 'intitule', width: 48 },
      { header: 'Montant', key: 'montant', width: 20 },
      { header: 'Diagnostic', key: 'diagnostic', width: 90 },
    ];

    const ligneEquilibre = anomalies.addRow({
      numero: 'CONTRÔLE',
      intitule: 'Total actif (BZ) = Total passif (DZ) ?',
      montant: bilan.totalActif - bilan.totalPassif,
      diagnostic: bilan.equilibre
        ? `OK — bilan équilibré. Actif = Passif = ${bilan.totalActif.toFixed(2)}.`
        : `DÉSÉQUILIBRE de ${(bilan.totalActif - bilan.totalPassif).toFixed(2)} — vérifier les écritures et les comptes non rattachés ci-dessous.`,
    });
    ligneEquilibre.font = { bold: true, color: { argb: bilan.equilibre ? 'FF1E7B34' : 'FFB00020' } };

    for (const c of bilan.comptesNonRattaches) {
      anomalies.addRow({
        numero: c.numero,
        intitule: c.intitule,
        montant: c.montant,
        diagnostic:
          'Compte de bilan (classe 1 à 5) qu’aucun poste du tableau de correspondance officiel (jeu projets de développement) ne réclame : ' +
          'son montant n’entre dans AUCUN total de cet état. Vérifier le numéro de compte.',
      });
    }
    if (bilan.comptesNonRattaches.length === 0) {
      anomalies.addRow({
        numero: '—',
        intitule: 'Aucun compte non rattaché : tous les comptes de bilan entrent dans un poste officiel.',
      });
    }
    this.appliquerFormats(anomalies, { montant: FORMAT_MONTANT });
    this.finaliserTableau(anomalies, anomalies.columns.length, anomalies.rowCount);

    return {
      buffer: await this.versBuffer(classeur),
      nomFichier: `bilan-projet-developpement${await this.suffixeExercice(tenantId, exerciceId)}.xlsx`,
    };
  }

  /**
   * COMPTE D'EXPLOITATION — jeu SYCEBNL « projets de développement et
   * assimilés » (Partie 4, ch. 3), adossé à
   * `EtatsFinanciersProjetService`/`correspondance-projet-compte-exploitation.ts`.
   * Le doublon officiel de REF « TJ »/« TK » (anomalie n° 3, voir ce fichier)
   * ressort tel quel : deux lignes portant le même REF, comme le fait
   * l'état officiel.
   */
  async compteExploitationProjetExcel(tenantId: string, exerciceId: string): Promise<ClasseurExporte> {
    const ce = await this.etatsFinanciersProjetService.compteExploitation(tenantId, exerciceId);
    const suffixeN1 = ce.exerciceN1Disponible ? '' : ' (aucun exercice antérieur)';

    const classeur = this.nouveauClasseur();
    const feuille = classeur.addWorksheet("Compte d'exploitation");
    feuille.columns = [
      { header: 'REF', key: 'ref', width: 8 },
      { header: 'Libellé', key: 'libelle', width: 58 },
      { header: 'Montant (N)', key: 'montant', width: 16 },
      { header: `Montant (N-1)${suffixeN1}`, key: 'montantN1', width: 17 },
    ];

    const ajouterTotal = (ref: string, libelle: string, montant: number, montantN1?: number) => {
      const ligne = feuille.addRow({ ref, libelle, montant, montantN1: montantN1 ?? null });
      ligne.font = ENTETE_FONT;
      return ligne;
    };
    const ajouterPoste = (p: PosteCalcule) =>
      feuille.addRow({ ref: p.ref, libelle: p.libelle, montant: p.montant, montantN1: p.montantN1 ?? null });

    ce.revenus.forEach(ajouterPoste);
    ajouterTotal('XA', 'REVENUS (Somme RA à RE)', ce.totalRevenus, ce.totalRevenusN1);
    ce.charges.forEach(ajouterPoste);
    ajouterTotal('XB', 'CHARGES DE FONCTIONNEMENT (Somme TA à TL)', ce.totalCharges, ce.totalChargesN1);
    ajouterTotal('XC', "SOLDE DES OPERATIONS DE L'EXERCICE (XA − XB)", ce.solde, ce.soldeN1);

    this.appliquerFormats(feuille, { montant: FORMAT_MONTANT, montantN1: FORMAT_MONTANT });
    styliserEntete(feuille.getRow(1));
    feuille.views = [{ state: 'frozen', ySplit: 1 }];

    const note = feuille.addRow([
      'Postes conformes au tableau de correspondance officiel SYCEBNL (Journal officiel OHADA, Partie 4 ch. 3). ' +
        'RC (subventions, compte 71) et RE (reprises) dans XA : deux anomalies du texte officiel corrigées ' +
        '(RC absente du modèle vierge, XA limité à « RA à RD » au lieu de RA à RE) — voir ' +
        'correspondance-projet-compte-exploitation.ts. TJ et TK apparaissent DEUX FOIS chacun : doublon du ' +
        'texte officiel, reproduit tel quel, non corrigé.',
    ]);
    note.font = { italic: true, color: { argb: 'FF555555' } };
    feuille.mergeCells(`A${note.number}:D${note.number}`);

    const detail = classeur.addWorksheet('Détail par poste');
    detail.columns = [
      { header: 'REF', key: 'ref', width: 8 },
      { header: 'Poste', key: 'poste', width: 52 },
      { header: 'Compte', key: 'numero', width: 12 },
      { header: 'Intitulé compte', key: 'intitule', width: 44 },
      { header: 'Montant', key: 'montant', width: 18 },
    ];
    for (const p of [...ce.revenus, ...ce.charges]) {
      for (const c of p.comptes) {
        detail.addRow({ ref: p.ref, poste: p.libelle, numero: c.numero, intitule: c.intitule, montant: c.montant });
      }
    }
    this.appliquerFormats(detail, { montant: FORMAT_MONTANT });
    this.finaliserTableau(detail, detail.columns.length, detail.rowCount);

    const anomalies = classeur.addWorksheet('Contrôles et anomalies');
    anomalies.columns = [
      { header: 'Compte', key: 'numero', width: 14 },
      { header: 'Intitulé', key: 'intitule', width: 48 },
      { header: 'Montant (crédit − débit)', key: 'montant', width: 24 },
      { header: 'Diagnostic', key: 'diagnostic', width: 78 },
    ];

    const ligneControle = anomalies.addRow({
      numero: 'CONTRÔLE',
      intitule: "Solde des opérations de l'exercice (XC) boucle-t-il à zéro ?",
      montant: ce.solde,
      diagnostic: ce.controle.boucleAZero
        ? `OK — XC = ${ce.solde.toFixed(2)} (≈ 0), régime normal pour ce jeu.`
        : `XC = ${ce.solde.toFixed(2)} (≠ 0) — pas nécessairement une erreur : un projet en cours d'exercice ` +
          `ou dont la clôture n'a pas transféré le solde au compte 13 peut légitimement présenter un écart. ` +
          `Vérifier les comptes non rattachés ci-dessous et l'état du compte 13.`,
    });
    ligneControle.font = { bold: true, color: { argb: ce.controle.boucleAZero ? 'FF1E7B34' : 'FFB00020' } };

    for (const c of ce.comptesNonRattaches) {
      anomalies.addRow({
        numero: c.numero,
        intitule: c.intitule,
        montant: c.montant,
        diagnostic:
          'Compte de gestion (classe 6/7/8) qu’aucun poste du tableau de correspondance officiel (jeu projets ' +
          'de développement) ne réclame — le compte 68 (dotations aux amortissements) notamment : absent du ' +
          'tableau officiel lui-même (anomalie n° 4, voir correspondance-projet-compte-exploitation.ts).',
      });
    }
    if (ce.comptesNonRattaches.length === 0) {
      anomalies.addRow({
        numero: '—',
        intitule: 'Aucun compte non rattaché : tous les comptes de gestion entrent dans un poste officiel.',
      });
    }
    this.appliquerFormats(anomalies, { montant: FORMAT_MONTANT });
    this.finaliserTableau(anomalies, anomalies.columns.length, anomalies.rowCount);

    return {
      buffer: await this.versBuffer(classeur),
      nomFichier: `compte-exploitation-projet-developpement${await this.suffixeExercice(tenantId, exerciceId)}.xlsx`,
    };
  }

  /**
   * NOTE 9 : FONDS DU BAILLEUR (Partie 4, ch. 3, Section 6) — comptabilité
   * analytique par projet/bailleur (docs/plan-de-construction.md item 14).
   * Une ligne par bailleur, Fonds d'investissement puis Fonds
   * d'administration côte à côte — voir
   * `EtatsFinanciersProjetService.noteBailleur` pour la convention retenue
   * sur Montant décaissé/consommé (les deux anomalies du texte officiel
   * qu'elle documente).
   */
  async noteBailleurExcel(tenantId: string, exerciceId: string): Promise<ClasseurExporte> {
    const note = await this.etatsFinanciersProjetService.noteBailleur(tenantId, exerciceId);

    const classeur = this.nouveauClasseur();
    const feuille = classeur.addWorksheet('Note 9 — Fonds du bailleur');
    feuille.columns = [
      { header: 'Bailleur', key: 'bailleur', width: 28 },
      { header: 'Investissement — Décaissé', key: 'iDecaisse', width: 20 },
      { header: 'Investissement — Consommé', key: 'iConsomme', width: 20 },
      { header: 'Investissement — Solde restant', key: 'iSolde', width: 22 },
      { header: 'Administration — Décaissé', key: 'aDecaisse', width: 20 },
      { header: 'Administration — Consommé', key: 'aConsomme', width: 20 },
      { header: 'Administration — Solde restant', key: 'aSolde', width: 22 },
    ];

    const bailleurs = new Map<string, { nom: string; code: string }>();
    for (const b of [...note.investissement, ...note.administration]) {
      bailleurs.set(b.bailleur.id, { nom: b.bailleur.nom, code: b.bailleur.code });
    }
    for (const [id, { nom, code }] of bailleurs) {
      const inv = note.investissement.find((b) => b.bailleur.id === id);
      const adm = note.administration.find((b) => b.bailleur.id === id);
      feuille.addRow({
        bailleur: `${code} — ${nom}`,
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
      'Montants CUMULÉS depuis l’origine du projet, toutes périodes confondues — la Note 9 suit le cycle de vie du ' +
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
  // NOTES ANNEXES — un classeur par jeu, une feuille par TABLEAU (pas par
  // code de note) : une note à plusieurs sous-tableaux — Note 1, ses trois
  // grilles ; Note 4/7/20B/29B, leurs deux — a des colonnes DIFFÉRENTES d'un
  // tableau à l'autre. Les empiler sur une même feuille mélangerait des
  // en-têtes incompatibles ; une feuille par tableau les garde chacune
  // propre, la « Fiche récapitulative » relie les tableaux d'un même code.
  //
  // Article 15 : « les Notes annexes sont organisées par une référence
  // croisée avec l'information liée » — `note.renvoyeeDepuis` porte les
  // codes REF des postes d'état qui renvoient à chaque note, reproduit tel
  // quel en commentaire de feuille.
  //
  // § 1.4, note officielle de la fiche récapitulative (identique dans les
  // deux jeux) : « les Notes non documentées ne doivent pas être jointes aux
  // états financiers ». Une note NON applicable n'a donc PAS sa propre
  // feuille — seulement une ligne « N/A » dans la fiche récapitulative.
  // ==========================================================================

  /** Nom de feuille Excel : 31 caractères maximum, doit rester unique dans le classeur. */
  private nomFeuilleNote(note: NoteCalculee, indexParmiMemeCode: number, nbTableauxMemeCode: number): string {
    const base = `Note ${note.code}`;
    return nbTableauxMemeCode > 1 ? `${base}.${indexParmiMemeCode + 1}` : base;
  }

  /**
   * Valeur d'une colonne pour une ligne, au type de colonne déclaré par la
   * note. Les quatre colonnes « historiques » (montant N/N-1, variations)
   * vivent sur des champs dédiés de `LigneNoteCalculee` ; toutes les autres
   * (mouvements, ventilation par nature, échéances, variation absolue)
   * vivent dans `valeurs`, indexé par le même `TypeColonneNote` — voir
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

  private feuilleNote(classeur: ExcelJS.Workbook, note: NoteCalculee, nomFeuille: string) {
    const feuille = classeur.addWorksheet(nomFeuille);

    const colonnes: Partial<ExcelJS.Column>[] = [
      { header: 'Libellé', key: 'libelle', width: 46 },
      ...note.colonnes.map((c: ColonneNote, i: number) => ({ header: c.libelle, key: `c${i}`, width: 18 })),
    ];
    feuille.columns = colonnes;

    for (const l of note.lignes) {
      const valeurs: Record<string, unknown> = { libelle: l.libelle };
      note.colonnes.forEach((c: ColonneNote, i: number) => {
        valeurs[`c${i}`] = this.valeurColonneNote(l, c.type);
      });
      const ligne = feuille.addRow(valeurs);
      if (l.estTotal) ligne.font = ENTETE_FONT;
      // Rubrique en attente de rattachement : signalée en couleur plutôt que
      // laissée à zéro sans explication — un zéro muet se lirait comme un
      // montant réel, pas comme une lacune du dossier.
      if (l.enAttenteDeRattachement) {
        ligne.getCell('libelle').font = { italic: true, color: { argb: 'FFB00020' } };
        ligne.getCell('libelle').note = `EN ATTENTE DE RATTACHEMENT : ${l.enAttenteDeRattachement}`;
      }
      if (l.ecartCloture !== undefined) {
        ligne.getCell('libelle').note =
          `Écart de clôture : ${l.ecartCloture.toFixed(2)} — la clôture recalculée (D = A + B − C) ne ` +
          `correspond pas au solde réel de la balance. Anomalie du dossier à examiner (report à-nouveau ` +
          `manquant, écriture hors comptes de la rubrique…).`;
      }
      if (l.echeanceNonVentilee !== undefined) {
        ligne.getCell('libelle').note =
          (ligne.getCell('libelle').note ? `${ligne.getCell('libelle').note}\n` : '') +
          `Part non ventilée par échéance (aucune date d'échéance saisie) : ${l.echeanceNonVentilee.toFixed(2)}.`;
      }
      if (l.renvoi) {
        const derniere = colonnes[colonnes.length - 1].key!;
        ligne.getCell(derniere).note = l.renvoi;
      }
    }

    const formats: Record<string, string> = {};
    note.colonnes.forEach((c: ColonneNote, i: number) => {
      if (c.type !== 'LIBRE') formats[`c${i}`] = c.type === 'VARIATION_POURCENT' ? '#,##0.00"%"' : FORMAT_MONTANT;
    });
    this.appliquerFormats(feuille, formats);
    styliserEntete(feuille.getRow(1));
    feuille.views = [{ state: 'frozen', ySplit: 1 }];

    const commentaires: string[] = [];
    if (note.renvoyeeDepuis?.length) commentaires.push(`Renvoyée depuis les postes : ${note.renvoyeeDepuis.join(', ')}.`);
    if (note.renvoiOfficiel) commentaires.push(note.renvoiOfficiel);
    if (note.commentaire) commentaires.push(`Commentaire officiel : ${note.commentaire}`);
    if (note.lignes.length === 0) {
      commentaires.push(
        'Aucune rubrique chiffrée cet exercice ; les rubriques en attente de rattachement du dossier sont listées ' +
          'quand même, pour que le rattachement reste possible.',
      );
    }
    if (commentaires.length) {
      const ligneCom = feuille.addRow([commentaires.join(' ')]);
      ligneCom.font = { italic: true, color: { argb: 'FF555555' } };
      feuille.mergeCells(`A${ligneCom.number}:${colonnes[colonnes.length - 1].key === 'libelle' ? 'A' : String.fromCharCode(65 + colonnes.length - 1)}${ligneCom.number}`);
    }
  }

  /**
   * Fiche récapitulative — Partie 4, section 4 des deux jeux : « NOTES |
   * INTITULES | A (Applicable) | N/A (Non applicable) ». Colonnes A/N-A
   * reproduites telles quelles ; une note non applicable y figure SANS
   * feuille propre (voir en-tête de section) — la fiche est alors sa seule
   * trace dans le classeur, avec les rubriques que le dossier pourrait
   * rattacher pour la faire apparaître.
   */
  private feuilleFicheRecapitulative(
    classeur: ExcelJS.Workbook,
    fiche: Array<{ code: string; titre: string; applicable: boolean; rubriquesEnAttente: Array<{ libelle: string }> }>,
    couverture: { transcrites: number; attendues: number },
  ) {
    const feuille = classeur.addWorksheet('Fiche récapitulative', { views: [{ state: 'frozen', ySplit: 1 }] });
    feuille.columns = [
      { header: 'Note', key: 'code', width: 10 },
      { header: 'Intitulé', key: 'titre', width: 60 },
      { header: 'A (Applicable)', key: 'applicable', width: 14 },
      { header: 'N/A (Non applicable)', key: 'nonApplicable', width: 18 },
      { header: 'Rubriques en attente de rattachement', key: 'enAttente', width: 60 },
    ];
    for (const n of fiche) {
      const ligne = feuille.addRow({
        code: n.code,
        titre: n.titre,
        applicable: n.applicable ? 'A' : '',
        nonApplicable: n.applicable ? '' : 'N/A',
        enAttente: n.rubriquesEnAttente.map((r) => r.libelle).join(' ; '),
      });
      if (!n.applicable) ligne.font = { color: { argb: 'FF999999' } };
    }
    styliserEntete(feuille.getRow(1));
    const noteCouverture = feuille.addRow([
      `Couverture du référentiel : ${couverture.transcrites} note(s) transcrite(s) sur ${couverture.attendues} attendue(s). ` +
        "« les Notes non documentées ne doivent pas être jointes aux états financiers » — les notes N/A ci-dessus " +
        "n'ont donc pas de feuille propre dans ce classeur.",
    ]);
    noteCouverture.font = { italic: true, color: { argb: 'FF555555' } };
    feuille.mergeCells(`A${noteCouverture.number}:E${noteCouverture.number}`);
  }

  private construireClasseurNotes(
    resultat: { notes: NoteCalculee[]; ficheRecapitulative: any[]; couverture: { transcrites: number; attendues: number } },
  ): ExcelJS.Workbook {
    const classeur = this.nouveauClasseur();
    this.feuilleFicheRecapitulative(classeur, resultat.ficheRecapitulative, resultat.couverture);

    const parCode = new Map<string, NoteCalculee[]>();
    for (const n of resultat.notes) parCode.set(n.code, [...(parCode.get(n.code) ?? []), n]);

    for (const n of resultat.notes) {
      if (!n.applicable) continue; // § 1.4 : non jointe, voir en-tête de section.
      const tableauxMemeCode = parCode.get(n.code)!;
      const index = tableauxMemeCode.indexOf(n);
      this.feuilleNote(classeur, n, this.nomFeuilleNote(n, index, tableauxMemeCode.length));
    }
    return classeur;
  }

  /** Notes annexes du jeu « associations et ordres professionnels ». */
  async notesAssociationsExcel(tenantId: string, exerciceId: string): Promise<ClasseurExporte> {
    const resultat = await this.noteAnnexeService.notesAssociations(tenantId, exerciceId);
    return {
      buffer: await this.versBuffer(this.construireClasseurNotes(resultat)),
      nomFichier: `notes-annexes-associations${await this.suffixeExercice(tenantId, exerciceId)}.xlsx`,
    };
  }

  /**
   * Notes annexes du jeu « projets de développement et assimilés ». La
   * note 9 « Fonds du bailleur » y figure comme un simple RENVOI (colonnes
   * dynamiques par bailleur, hors de la forme de ce moteur) vers
   * `noteBailleurExcel` — voir `NoteAnnexeService.notesProjet`.
   */
  async notesProjetExcel(tenantId: string, exerciceId: string): Promise<ClasseurExporte> {
    const resultat = await this.noteAnnexeService.notesProjet(tenantId, exerciceId);
    return {
      buffer: await this.versBuffer(this.construireClasseurNotes(resultat)),
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
   * version physique reliée, brochée ou en version électronique » — mais la
   * version physique reste « cotée, paraphée et numérotée de façon continue
   * PAR LA JURIDICTION COMPÉTENTE ». Ce classeur est donc conçu pour être
   * imprimé et présenté : le numéro d'ordre est la PREMIÈRE colonne, les
   * lignes sortent dans l'ordre de leur numérotation, et les lignes annulées
   * y figurent — barrées et motivées — parce qu'un registre dont on aurait
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
        `${n.exigence} Numéros ${n.premier ?? '—'} à ${n.dernier ?? '—'}.` +
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
   * Les états sont relus depuis la transcription, JAMAIS recalculés — c'est
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
            `État exigé — ${e.libelle}`,
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
        ? `Transcrit le ${new Date(t.transcritLe).toLocaleDateString('fr-FR')}. Les états des feuilles suivantes sont FIGÉS à cette date : ils sont relus tels quels, jamais recalculés — c'est le sens du mot « transcrits » de l'article 14.`
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
   * soit écrite — ce qui viderait de son sens la transcription même.
   *
   * On rend donc : tout tableau dont les éléments ressemblent à un poste
   * (`ref`/`libelle`/`montant`), sous le nom de sa clé ; puis les scalaires
   * numériques et booléens, qui sont les totaux et contrôles de l'état.
   *
   * (La mise en forme officielle de chaque état vit dans son propre export —
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
   * section vide — un rapport amputé d'un contenu exigé n'est pas « établi ».
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
          ? `du ${new Date(f.du).toLocaleDateString('fr-FR')} au ${new Date(f.au).toLocaleDateString('fr-FR')} — c'est la date d'établissement qui la ferme (art. 16-3).`
          : '—',
      ],
      [
        'Évolution de la trésorerie (figée du Tableau des flux)',
        conformite.tresorerie
          ? `ouverture ${conformite.tresorerie.ouverture} · variation ${conformite.tresorerie.variation} · clôture ${conformite.tresorerie.cloture}` +
            (conformite.tresorerie.boucle ? ' · tableau bouclé' : ' · ⚠ TABLEAU NON BOUCLÉ à cette date')
          : '—',
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
