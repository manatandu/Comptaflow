import { Injectable, PayloadTooLargeException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';
import { EtatsFinanciersService, PosteCalcule } from '../etats-financiers/etats-financiers.service';

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
   */
  async bilanExcel(tenantId: string, exerciceId: string): Promise<ClasseurExporte> {
    const bilan = await this.etatsFinanciersService.bilan(tenantId, exerciceId);

    const classeur = this.nouveauClasseur();
    const feuille = classeur.addWorksheet('Bilan');
    // En-têtes distincts de part et d'autre : deux colonnes portant le même
    // titre casseraient tout tableau croisé dynamique.
    feuille.columns = [
      { header: 'Actif — REF', key: 'refActif', width: 10 },
      { header: 'Actif — libellé', key: 'libelleActif', width: 46 },
      { header: 'Actif — montant', key: 'montantActif', width: 16 },
      { header: 'Passif — REF', key: 'refPassif', width: 10 },
      { header: 'Passif — libellé', key: 'libellePassif', width: 46 },
      { header: 'Passif — montant', key: 'montantPassif', width: 16 },
    ];

    const maxLignes = Math.max(bilan.actif.length, bilan.passif.length);
    for (let i = 0; i < maxLignes; i++) {
      const a = bilan.actif[i];
      const p = bilan.passif[i];
      const ligne = feuille.addRow({
        refActif: a?.ref ?? '',
        libelleActif: a?.libelle ?? '',
        montantActif: a ? a.montant : null,
        refPassif: p?.ref ?? '',
        libellePassif: p?.libelle ?? '',
        montantPassif: p ? p.montant : null,
      });
      // Chaque total est en gras SUR SA PROPRE COLONNE seulement (actif et
      // passif n'atteignent pas forcément un total à la même ligne) : mettre
      // toute la ligne en gras si un seul côté est un total ferait ressortir
      // l'autre à tort.
      if (a?.estTotal) {
        ligne.getCell('refActif').font = ENTETE_FONT;
        ligne.getCell('libelleActif').font = ENTETE_FONT;
        ligne.getCell('montantActif').font = ENTETE_FONT;
      }
      if (p?.estTotal) {
        ligne.getCell('refPassif').font = ENTETE_FONT;
        ligne.getCell('libellePassif').font = ENTETE_FONT;
        ligne.getCell('montantPassif').font = ENTETE_FONT;
      }
    }

    this.appliquerFormats(feuille, { montantActif: FORMAT_MONTANT, montantPassif: FORMAT_MONTANT });
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

    const classeur = this.nouveauClasseur();
    const feuille = classeur.addWorksheet('Compte de résultat');
    feuille.columns = [
      { header: 'REF', key: 'ref', width: 8 },
      { header: 'Libellé', key: 'libelle', width: 62 },
      { header: 'Montant', key: 'montant', width: 18 },
    ];

    const ajouterTotal = (ref: string, libelle: string, montant: number) => {
      const ligne = feuille.addRow({ ref, libelle, montant });
      ligne.font = ENTETE_FONT;
      return ligne;
    };
    const ajouterPoste = (p: PosteCalcule) => feuille.addRow({ ref: p.ref, libelle: p.libelle, montant: p.montant });

    cr.produits.forEach(ajouterPoste);
    ajouterTotal('XA', 'REVENUS DES ACTIVITÉS ORDINAIRES', cr.totalProduits);
    cr.charges.forEach(ajouterPoste);
    ajouterTotal('XB', 'CHARGES DES ACTIVITÉS ORDINAIRES', cr.totalCharges);
    ajouterTotal('XC', 'RÉSULTAT DES ACTIVITÉS ORDINAIRES (XA − XB)', cr.resultatActivitesOrdinaires);
    ajouterPoste(cr.produitsHao);
    ajouterPoste(cr.chargesHao);
    ajouterTotal('XD', 'RÉSULTAT H.A.O. (TM − TN)', cr.resultatHao);
    ajouterTotal('XE', "RÉSULTAT NET DE L'EXERCICE (+excédent, −déficit) (XC + XD)", cr.resultatNet);

    this.appliquerFormats(feuille, { montant: FORMAT_MONTANT });
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
    feuille.mergeCells(`A${note.number}:C${note.number}`);

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
}

function styliserEntete(ligne: ExcelJS.Row) {
  ligne.font = ENTETE_FONT;
  ligne.fill = ENTETE_FILL as ExcelJS.Fill;
}
