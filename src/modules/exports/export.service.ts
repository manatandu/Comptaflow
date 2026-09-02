import { Injectable, PayloadTooLargeException } from '@nestjs/common';
import { JeuEtatsFinanciersSycebnl, Prisma, Referentiel, SystemeComptableSyscohada } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';
import { ImmobilisationService } from '../immobilisations/immobilisation.service';
import { EtatsFinanciersService, PosteCalcule } from '../etats-financiers/etats-financiers.service';
import { EtatsFinanciersProjetService } from '../etats-financiers/etats-financiers-projet.service';
import { EtatsFinanciersSmtService } from '../etats-financiers/etats-financiers-smt.service';
import { EtatsFinanciersProjetBudgetService } from '../etats-financiers/etats-financiers-projet-budget.service';
import { NoteAnnexeService } from '../notes-annexes/note-annexe.service';
import { EtatsFinanciersSyscohadaService } from '../etats-financiers-syscohada/etats-financiers-syscohada.service';
import { EtatsFinanciersSmtSyscohadaService } from '../etats-financiers-syscohada/etats-financiers-smt-syscohada.service';
import { CODES_NOTES_CH6 } from '../etats-financiers-syscohada/correspondance-compte-resultat-syscohada';
import { LETTRES_D_E_SMT_SYSCOHADA } from '../etats-financiers-syscohada/correspondance-smt-syscohada';
import {
  RENVOI_1_TFT_SYSCOHADA,
  TOTAUX_FLUX_SYSCOHADA,
} from '../etats-financiers-syscohada/correspondance-tft-syscohada';
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
  bandeNeant,
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
  NIVEAUX_ETAT_SYSCOHADA,
  NIVEAUX_TFT_SYSCOHADA,
  NOTE_PAR_REF_SYSCOHADA,
  REP_TFT_SYSCOHADA,
  TOTAUX_SYSCOHADA,
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
export interface ClasseurExporte {
  buffer: Buffer;
  nomFichier: string;
}

/**
 * Export Excel des documents comptables · Journal, Grand livre (un compte ou
 * complet), Balance, Bilan et Compte de résultat. Objectif explicite
 * (demande utilisateur, séance du 2026-08-28) : produire des documents
 * exploitables pour l'audit, un PDF étant difficile à recouper ligne à
 * ligne.
 *
 * CE SERVICE SERT LES DEUX RÉFÉRENTIELS, et le cartouche disait le contraire.
 * Le journal, le grand livre et la balance sont les livres obligatoires de
 * l'AUDCIF art. 19 · communs aux deux, servis aux deux, et leurs routes ne
 * portent volontairement pas de `@ReferentielsAutorises`. Les états financiers
 * et les notes annexes sont, eux, propres à chaque référentiel : le même
 * service les produit depuis les moteurs dédiés, SYCEBNL d'un côté, SYSCOHADA
 * de l'autre.
 *
 * Reste vrai de la MISE EN FORME · pas d'emprunt de
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
    // MOTEURS SYSCOHADA · en exécution, Nest les injecte toujours
    // (`ExportsModule` importe `EtatsFinanciersSyscohadaModule`). Ils sont
    // déclarés optionnels pour qu'un harnais de test qui n'exerce QUE les
    // états SYCEBNL puisse instancier ce service sans les fournir · les
    // accesseurs `syscohada` / `smtSyscohada` ci-dessous refusent alors
    // bruyamment, plutôt que de laisser un export partir sans moteur.
    private readonly etatsFinanciersSyscohadaService?: EtatsFinanciersSyscohadaService,
    private readonly etatsFinanciersSmtSyscohadaService?: EtatsFinanciersSmtSyscohadaService,
    // Même raison d'être optionnel que les deux moteurs ci-dessus, et même
    // garde-fou : l'accesseur refuse bruyamment plutôt que de laisser partir
    // un tableau vide.
    private readonly immobilisationService?: ImmobilisationService,
  ) {}

  private get immos(): ImmobilisationService {
    if (!this.immobilisationService) {
      throw new Error("Service des immobilisations absent de l'injection : export impossible");
    }
    return this.immobilisationService;
  }

  private get syscohada(): EtatsFinanciersSyscohadaService {
    if (!this.etatsFinanciersSyscohadaService) {
      throw new Error("Moteur des états financiers SYSCOHADA absent de l'injection : export impossible");
    }
    return this.etatsFinanciersSyscohadaService;
  }

  private get smtSyscohada(): EtatsFinanciersSmtSyscohadaService {
    if (!this.etatsFinanciersSmtSyscohadaService) {
      throw new Error("Moteur du Système minimal de trésorerie SYSCOHADA absent de l'injection : export impossible");
    }
    return this.etatsFinanciersSmtSyscohadaService;
  }

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
  private finaliserTableau(
    feuille: ExcelJS.Worksheet,
    nbColonnes: number,
    derniereLigneDonnees: number,
    ligneEntete = 1,
  ) {
    styliserEntete(feuille.getRow(ligneEntete));
    feuille.views = [{ state: 'frozen', ySplit: ligneEntete }];
    if (derniereLigneDonnees > ligneEntete) {
      feuille.autoFilter = {
        from: { row: ligneEntete, column: 1 },
        to: { row: derniereLigneDonnees, column: nbColonnes },
      };
    }
  }

  /**
   * IDENTIFICATION D'UN ÉTAT PÉRIODIQUE · en PIED DE PAGE IMPRIMÉ, pas en
   * cellules.
   *
   * L'AUDCIF art. 22, 7° veut que « les états périodiques fournis soient
   * numérotés et datés ». Une coiffe de trois lignes posée au-dessus du
   * tableau satisfaisait la règle, mais elle n'existe dans aucun des modèles
   * de cabinet relevés : leurs classeurs commencent en A1 par l'en-tête des
   * colonnes, sans titre ni cartouche. Le pied de page imprimé porte la même
   * information sans ajouter une seule cellule · la grille reste celle du
   * modèle, l'état fourni reste numéroté et daté.
   */
  private piedDePageEtat(
    feuille: ExcelJS.Worksheet,
    identite: { entite: string; nif: string; periode: string; devise: string },
  ) {
    const edite = new Date().toLocaleDateString('fr-FR');
    feuille.headerFooter = {
      oddFooter:
        `&L${identite.entite}${identite.nif ? ` · NIF ${identite.nif}` : ''} · ${identite.periode} · ` +
        `montants en ${identite.devise}&RPage &P / &N · édité le ${edite}`,
    };
  }

  /**
   * Identité d'un état périodique · elle ne dépend PAS d'un exercice.
   *
   * `identiteLiasse` exige un exerciceId et lève si l'exercice n'existe pas ;
   * or le journal et le grand livre complet s'exportent aussi sans exercice
   * borné (filtres de dates libres). Cette variante se contente du dossier et
   * de la période réellement filtrée · un export ne doit pas échouer faute
   * d'exercice.
   */
  private async identiteEtat(
    tenantId: string,
    periode: { exerciceId?: string; dateDebut?: string; dateFin?: string },
  ): Promise<{ entite: string; nif: string; periode: string; devise: string }> {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const exercice = periode.exerciceId
      ? await this.prisma.exercice.findFirst({ where: { id: periode.exerciceId, tenantId } })
      : null;
    const jour = (d: Date | string) => new Date(d).toLocaleDateString('fr-FR');
    const libellePeriode = periode.dateDebut || periode.dateFin
      ? `Période du ${periode.dateDebut ? jour(periode.dateDebut) : '…'} au ${periode.dateFin ? jour(periode.dateFin) : '…'}`
      : exercice
        ? `Exercice du ${jour(exercice.dateDebut)} au ${jour(exercice.dateFin)}`
        : 'Toutes périodes';
    return {
      entite: tenant.nom,
      nif: tenant.numeroImpot ?? '',
      periode: libellePeriode,
      devise: tenant.devise ?? 'CDF',
    };
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
    const identiteJournal = await this.identiteEtat(tenantId, filtres);

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
      // d'aucune sorte » (AUDCIF art. 20, repris par le SYCEBNL Partie 2
      // ch. 2) · mais chacune se nomme.
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
    this.piedDePageEtat(feuille, identiteJournal);
    this.finaliserTableau(feuille, feuille.columns.length, derniereLigneDonnees);

    return {
      buffer: await this.versBuffer(classeur),
      nomFichier: `journal${await this.suffixeExercice(tenantId, filtres.exerciceId)}.xlsx`,
    };
  }

  /** Colonnes communes au grand livre d'un compte et au grand livre complet. */
  /**
   * Colonnes du grand livre, aux LIBELLÉS du dossier de révision réel
   * (« GD LIVRES au 31/12/2025 CARRIGRES », ouvert sur le Drive) : Compte
   * général, Journal, Date écriture, Libellé, Réf. pièce, N° pièce, Code
   * lettrage.
   *
   * Leur export porte trente-quatre colonnes, dont la plupart n'ont aucun
   * équivalent ici (Etablissement, Norme, N° lot, Société groupe, Profil TVA,
   * Marquée…). Elles ne sont PAS reproduites : une colonne vide est pire
   * qu'une colonne absente, elle donne à croire que la donnée manque.
   *
   * Deux écarts assumés, et il faut le dire plutôt que le taire. Leur ERP
   * porte un « Montant » et un « Sens » là où nous portons Débit et Crédit ·
   * c'est la présentation OHADA du grand livre, et c'est celle que le
   * comptable additionne. Et nous gardons le SOLDE PROGRESSIF, qu'ils n'ont
   * pas : un grand livre sans solde courant oblige à recalculer à la main
   * pour retrouver le solde d'un compte à une date.
   *
   * La colonne « Compte contrepartie » n'existe dans aucun de leurs états :
   * elle est retirée du grand livre COMPLET. Elle reste sur le grand livre
   * d'UN compte, où elle avait été demandée nommément pour retracer une
   * écriture sans connaître son journal · une demande explicite ne se révoque
   * pas au détour d'un alignement de présentation.
   */
  private colonnesGrandLivre(avecCompte: boolean, avecContrepartie = false): Partial<ExcelJS.Column>[] {
    const colonnesCompte: Partial<ExcelJS.Column>[] = avecCompte
      ? [
          { header: 'Compte général', key: 'compteNumero', width: 14 },
          { header: 'Intitulé compte', key: 'compteIntitule', width: 30 },
        ]
      : [];
    return [
      ...colonnesCompte,
      { header: 'Journal', key: 'journal', width: 10 },
      { header: 'Date écriture', key: 'date', width: 13 },
      { header: 'N° pièce', key: 'numeroPiece', width: 10 },
      { header: 'Réf. pièce', key: 'reference', width: 16 },
      { header: 'Libellé', key: 'libelle', width: 34 },
      { header: 'Débit', key: 'debit', width: 14 },
      { header: 'Crédit', key: 'credit', width: 14 },
      { header: 'Solde progressif', key: 'solde', width: 16 },
      { header: 'Code lettrage', key: 'lettre', width: 13 },
      ...(avecContrepartie
        ? [{ header: 'Compte contrepartie', key: 'contrepartie', width: 28 }]
        : []),
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
    feuille.columns = this.colonnesGrandLivre(false, true);
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
    const identiteGrandLivre = await this.identiteEtat(tenantId, { exerciceId });

    const classeur = this.nouveauClasseur();
    const feuille = classeur.addWorksheet('Grand livre');
    feuille.columns = this.colonnesGrandLivre(true);

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
        });
      }
    }

    this.appliquerFormats(feuille, {
      date: FORMAT_DATE,
      debit: FORMAT_MONTANT,
      credit: FORMAT_MONTANT,
      solde: FORMAT_MONTANT,
    });
    this.piedDePageEtat(feuille, identiteGrandLivre);
    this.finaliserTableau(feuille, feuille.columns.length, feuille.rowCount);

    return {
      buffer: await this.versBuffer(classeur),
      nomFichier: `grand-livre-complet${await this.suffixeExercice(tenantId, exerciceId)}.xlsx`,
    };
  }

  /** Balance générale · la présentation des dossiers de révision réels. */
  async balanceExcel(tenantId: string, exerciceId: string): Promise<ClasseurExporte> {
    const { lignes } = await this.ecritureService.balance(tenantId, exerciceId);
    const identiteBalance = await this.identiteEtat(tenantId, { exerciceId });

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
     * Les six colonnes, LEURS LIBELLÉS et l'ordre des colonnes reprennent
     * exactement ceux d'un dossier d'audit congolais réel (balance générale
     * CARRIGRES au 31/12/2025, ouverte cellule par cellule sur le Drive) :
     * « Code compte, LIBELLE, Solde débit avant période, Solde crédit avant
     * période, Débit, Crédit, Débit cumulé, Crédit cumulé, Devise, Société ».
     * Un réviseur lit cette balance-là.
     *
     * CE QUE CE FICHIER NE PORTE PAS, ET POURQUOI. Rien au-dessus de la ligne
     * 1 : leur balance commence directement par ses en-têtes, sans titre, sans
     * fusion, sans ligne d'identification · un bandeau décale le tableau et
     * casse le tri et les filtres. L'identification passe par les colonnes
     * Devise et Société, comme chez eux, et la numérotation avec la date
     * qu'exige l'AUDCIF (art. 22, 7° : « les états périodiques fournis
     * soient numérotés et datés ») reste au pied de page imprimé, invisible
     * à l'écran.
     *
     * Pas de colonne « Type » : elle distinguait les comptes Total, que la
     * balance ne porte plus. Pas de colonne « Solde » signée : leur balance
     * générale n'en a pas.
     *
     * La ligne de TOTAUX GÉNÉRAUX, elle, reste · elle avait été retirée avec
     * le reste et c'était une erreur. Ce n'est pas de l'ornement : la balance
     * est l'état où se VÉRIFIE la partie double, et l'égalité des six colonnes
     * de montants est le contrôle qu'un réviseur fait en premier. Elle est
     * posée SOUS le tableau, hors de l'autofiltre, pour ne pas être triée avec
     * les comptes.
     */
    feuille.columns = [
      { header: 'N° compte', key: 'numero', width: 12 },
      { header: 'Intitulé', key: 'intitule', width: 36 },
      { header: 'Solde débit avant période', key: 'reportDebit', width: 24 },
      { header: 'Solde crédit avant période', key: 'reportCredit', width: 25 },
      { header: 'Débit', key: 'mouvementDebit', width: 12 },
      { header: 'Crédit', key: 'mouvementCredit', width: 12 },
      { header: 'Débit cumulé', key: 'totalDebit', width: 15 },
      { header: 'Crédit cumulé', key: 'totalCredit', width: 16 },
      { header: 'Devise', key: 'devise', width: 10 },
      { header: 'Société', key: 'societe', width: 18 },
    ];

    for (const l of lignes) {
      feuille.addRow({
        numero: l.numero,
        intitule: l.intitule,
        reportDebit: l.reportDebit || null,
        reportCredit: l.reportCredit || null,
        mouvementDebit: l.mouvementDebit || null,
        mouvementCredit: l.mouvementCredit || null,
        totalDebit: l.totalDebit || null,
        totalCredit: l.totalCredit || null,
        devise: identiteBalance.devise,
        societe: identiteBalance.entite,
      });
    }

    const derniereLigneDonnees = feuille.rowCount;
    const somme = (cle: keyof (typeof lignes)[number]) =>
      Math.round(lignes.reduce((t, l) => t + (Number(l[cle]) || 0), 0) * 100) / 100;
    const ligneTotal = feuille.addRow({
      intitule: 'TOTAUX GÉNÉRAUX',
      reportDebit: somme('reportDebit') || null,
      reportCredit: somme('reportCredit') || null,
      mouvementDebit: somme('mouvementDebit') || null,
      mouvementCredit: somme('mouvementCredit') || null,
      totalDebit: somme('totalDebit') || null,
      totalCredit: somme('totalCredit') || null,
    });
    ligneTotal.font = ENTETE_FONT;

    this.appliquerFormats(feuille, {
      reportDebit: FORMAT_MONTANT,
      reportCredit: FORMAT_MONTANT,
      mouvementDebit: FORMAT_MONTANT,
      mouvementCredit: FORMAT_MONTANT,
      totalDebit: FORMAT_MONTANT,
      totalCredit: FORMAT_MONTANT,
    });
    this.piedDePageEtat(feuille, identiteBalance);
    this.finaliserTableau(feuille, feuille.columns.length, derniereLigneDonnees);

    return {
      buffer: await this.versBuffer(classeur),
      nomFichier: `balance${await this.suffixeExercice(tenantId, exerciceId)}.xlsx`,
    };
  }

  /**
   * BALANCE AUXILIAIRE CLIENTS / FOURNISSEURS · l'état que le logiciel ne
   * savait pas produire.
   *
   * Il produisait la balance ÂGÉE, qui ventile un solde par tranche de retard,
   * et l'on croyait la balance des tiers couverte. Elle ne l'était pas : un
   * réviseur qui circularise a besoin des MOUVEMENTS de la période tiers par
   * tiers et du solde qui en résulte, pas d'un profil d'antériorité. Les deux
   * états coexistent dans tout dossier de révision réel · ils répondent à deux
   * questions différentes.
   *
   * La présentation reprend celle des balances auxiliaires du dossier de
   * révision ouvert sur le Drive (« Balance clients-CARRIGRES au 31 12 2025 »
   * et « Balance auxiliaire fournisseurs-CARRIGRES au 31 12 2025 »), relevées
   * cellule par cellule :
   *
   *  - ligne 1 : l'HORODATAGE d'édition seul, en A1. C'est leur seule
   *    concession à un en-tête, et elle sert : deux tirages du même état à
   *    deux heures d'écart ne donnent pas les mêmes soldes tant que
   *    l'exercice n'est pas clos.
   *  - ligne 2 : les en-têtes, dont les libellés de montant portent le CODE
   *    DEVISE (« Solde débit avant période EUR » chez eux, la devise du
   *    dossier ici).
   *  - dernière ligne : « SOLDE » et les totaux de chaque colonne.
   *
   * Deux colonnes de solde qui s'excluent (« Solde Debit » / « Solde Credit »)
   * puis une colonne « SOLDE » signée : c'est leur présentation, et elle a une
   * raison · les deux premières se totalisent pour rapprocher la balance
   * générale, la troisième se trie pour classer les tiers par exposition.
   */
  async balanceAuxiliaireExcel(
    tenantId: string,
    exerciceId: string,
    type: 'CLIENTS' | 'FOURNISSEURS' | 'TOUS' = 'TOUS',
  ): Promise<ClasseurExporte> {
    const { comptes, totaux } = await this.ecritureService.balanceAuxiliaire(tenantId, { exerciceId, type });
    const identite = await this.identiteEtat(tenantId, { exerciceId });
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const dev = identite.devise;

    // Le 41 ne se nomme pas pareil dans les deux plans · « Clients » au
    // SYSCOHADA (AUDCIF compte 41), « Adhérents et clients-usagers » au
    // SYCEBNL, dont le 411 est le compte des adhérents. Le 40 est
    // « Fournisseurs » dans les deux.
    const nomClients =
      tenant.referentiel === Referentiel.SYCEBNL ? 'Adhérents et clients-usagers' : 'Clients';
    const titre =
      type === 'CLIENTS' ? nomClients : type === 'FOURNISSEURS' ? 'Fournisseurs' : 'Tiers';

    const classeur = this.nouveauClasseur();
    const feuille = classeur.addWorksheet(titre.slice(0, 31));

    // L'horodatage tient la ligne 1 à lui seul ; les en-têtes suivent en
    // ligne 2, et c'est sur elle que portent le figeage et l'autofiltre.
    const maintenant = new Date();
    feuille.getRow(1).getCell(1).value =
      `${maintenant.toLocaleDateString('fr-FR')} ${maintenant.getHours()}h${String(maintenant.getMinutes()).padStart(2, '0')}`;
    feuille.getRow(1).getCell(1).font = { size: 9, italic: true };

    const colonnes: Array<{ header: string; key: string; width: number }> = [
      { header: 'Code compte', key: 'numero', width: 14 },
      { header: 'Code tiers', key: 'codeTiers', width: 14 },
      { header: 'Libellé tiers', key: 'nomTiers', width: 36 },
      { header: `Solde débit avant période ${dev}`, key: 'reportDebit', width: 26 },
      { header: `Solde crédit avant période ${dev}`, key: 'reportCredit', width: 27 },
      { header: `Débit Période ${dev}`, key: 'mouvementDebit', width: 18 },
      { header: `Crédit Période ${dev}`, key: 'mouvementCredit', width: 18 },
      { header: `Solde Debit ${dev}`, key: 'soldeDebit', width: 17 },
      { header: `Solde Credit ${dev}`, key: 'soldeCredit', width: 17 },
      { header: 'SOLDE', key: 'solde', width: 16 },
    ];
    feuille.getRow(2).values = colonnes.map((c) => c.header);
    colonnes.forEach((c, i) => {
      feuille.getColumn(i + 1).key = c.key;
      feuille.getColumn(i + 1).width = c.width;
    });

    for (const c of comptes) {
      feuille.addRow({
        numero: c.numero,
        // Un compte de tiers sans tiers rattaché ne se tait pas · il se
        // nomme, parce que c'est lui qui échappera à la circularisation.
        codeTiers: c.codeTiers,
        nomTiers: c.sansTiers ? `${c.intitule} · aucun tiers rattaché` : c.nomTiers,
        reportDebit: c.reportDebit || null,
        reportCredit: c.reportCredit || null,
        mouvementDebit: c.mouvementDebit || null,
        mouvementCredit: c.mouvementCredit || null,
        soldeDebit: c.soldeDebit || null,
        soldeCredit: c.soldeCredit || null,
        solde: c.solde || null,
      });
    }

    const derniereLigneDonnees = feuille.rowCount;
    const ligneTotal = feuille.addRow({
      numero: 'SOLDE',
      reportDebit: totaux.reportDebit || null,
      reportCredit: totaux.reportCredit || null,
      mouvementDebit: totaux.mouvementDebit || null,
      mouvementCredit: totaux.mouvementCredit || null,
      soldeDebit: totaux.soldeDebit || null,
      soldeCredit: totaux.soldeCredit || null,
      solde: totaux.solde || null,
    });
    ligneTotal.font = ENTETE_FONT;

    this.appliquerFormats(feuille, {
      reportDebit: FORMAT_MONTANT,
      reportCredit: FORMAT_MONTANT,
      mouvementDebit: FORMAT_MONTANT,
      mouvementCredit: FORMAT_MONTANT,
      soldeDebit: FORMAT_MONTANT,
      soldeCredit: FORMAT_MONTANT,
      solde: FORMAT_MONTANT,
    });
    this.piedDePageEtat(feuille, identite);
    this.finaliserTableau(feuille, colonnes.length, derniereLigneDonnees, 2);

    const suffixe = type === 'TOUS' ? 'tiers' : type.toLowerCase();
    return {
      buffer: await this.versBuffer(classeur),
      nomFichier: `balance-auxiliaire-${suffixe}${await this.suffixeExercice(tenantId, exerciceId)}.xlsx`,
    };
  }

  /**
   * BALANCE ÂGÉE · l'état existait à l'écran mais ne s'exportait pas, alors
   * que c'est la pièce qu'on annexe à une circularisation.
   *
   * Présentation relevée sur le dossier de révision ouvert sur le Drive :
   * DEUX lignes d'en-tête superposées · l'âge au-dessus (« Moins de 90
   * jours »), la période calendaire en dessous (« Du 01/10/2025 au
   * 31/10/2025 »). Puis les débiteurs ventilés, les créditeurs groupés sans
   * ventilation, et trois totaux.
   */
  async balanceAgeeExcel(
    tenantId: string,
    exerciceId: string,
    params: { dateReference?: string; type?: 'CLIENTS_41' | 'FOURNISSEURS' | 'TOUS' } = {},
  ): Promise<ClasseurExporte> {
    const etat = await this.ecritureService.balanceAgee(tenantId, { exerciceId, ...params });
    const identite = await this.identiteEtat(tenantId, { exerciceId });
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });

    const nomClients = tenant.referentiel === Referentiel.SYCEBNL ? 'ADHÉRENTS / CLIENTS-USAGERS' : 'CLIENTS';
    const enTeteTiers =
      etat.type === 'CLIENTS_41' ? nomClients : etat.type === 'FOURNISSEURS' ? 'FOURNISSEURS' : 'TIERS';

    const classeur = this.nouveauClasseur();
    const feuille = classeur.addWorksheet('Balance âgée');
    const nbColonnes = etat.tranches.length + 2;

    // Ligne 1 · les âges, alignés sur les colonnes de tranches (à partir de B).
    const ligneAges = feuille.getRow(1);
    etat.tranches.forEach((t, i) => {
      ligneAges.getCell(i + 2).value = t.libelleAge;
    });
    ligneAges.font = { size: 9, italic: true };

    // Ligne 2 · les périodes, plus le nom de la famille de tiers et le solde.
    const ligneEntete = feuille.getRow(2);
    ligneEntete.getCell(1).value = enTeteTiers;
    etat.tranches.forEach((t, i) => {
      ligneEntete.getCell(i + 2).value = t.libellePeriode;
    });
    ligneEntete.getCell(nbColonnes).value = 'Solde';

    feuille.getColumn(1).width = 42;
    for (let i = 2; i <= nbColonnes; i++) feuille.getColumn(i).width = 20;

    const ligneMontants = (libelle: string, montants: number[], solde: number) => {
      const r = feuille.addRow([]);
      r.getCell(1).value = libelle;
      montants.forEach((m, i) => {
        r.getCell(i + 2).value = m || null;
      });
      r.getCell(nbColonnes).value = solde || null;
      return r;
    };

    for (const d of etat.debiteurs) ligneMontants(d.libelle, d.montants, d.solde);

    if (etat.crediteurs.length > 0) {
      // La bascule de sens se voit · sans elle, un lecteur croit lire la suite
      // des débiteurs et additionne deux populations contraires.
      const separateur = feuille.addRow([]);
      separateur.getCell(1).value = 'SOLDES EN SENS INVERSE · non ventilés par antériorité';
      separateur.font = { size: 9, italic: true };
      for (const c of etat.crediteurs) ligneMontants(c.libelle, [], c.solde);
    }

    const derniereLigneDonnees = feuille.rowCount;

    const totalDebiteurs = ligneMontants('TOTAL DÉBITEURS', etat.totaux.parTranche, etat.totaux.debiteurs);
    totalDebiteurs.font = ENTETE_FONT;
    const totalCrediteurs = ligneMontants('TOTAL SOLDES EN SENS INVERSE', [], etat.totaux.crediteurs);
    totalCrediteurs.font = ENTETE_FONT;
    // Le net recoupe la balance auxiliaire des mêmes comptes · le dire dans
    // l'état évite qu'on refasse l'addition à la main pour s'en assurer.
    const net = ligneMontants('SOLDE NET · recoupe la balance auxiliaire', [], etat.totaux.net);
    net.font = ENTETE_FONT;

    for (let i = 2; i <= nbColonnes; i++) feuille.getColumn(i).numFmt = FORMAT_MONTANT;
    this.piedDePageEtat(feuille, identite);
    this.finaliserTableau(feuille, nbColonnes, derniereLigneDonnees, 2);

    return {
      buffer: await this.versBuffer(classeur),
      nomFichier: `balance-agee${await this.suffixeExercice(tenantId, exerciceId)}.xlsx`,
    };
  }

  /**
   * JUSTIFICATIF DE SOLDE · le classeur qu'un réviseur classe dans son
   * dossier, sous l'intercalaire du compte.
   *
   * Présentation relevée sur les justificatifs du dossier ouvert sur le Drive
   * (« Facture à recevoir (Compte 471100) », « Débiteurs divers (Compte
   * 469150) ») : le compte nommé en ligne 1, les en-têtes en ligne 2, une
   * ligne d'écriture par ligne, un « Total » en pied.
   *
   * S'y ajoute UNE chose qu'ils font à la main et de tête : le recoupement.
   * Leur total, ils le comparent au solde de la balance en le lisant à côté.
   * Ici il est calculé par l'autre chemin et écrit sous le total, avec l'écart
   * · un justificatif qui ne recoupe pas est un justificatif qui ment, et le
   * dire dans le fichier vaut mieux que l'espérer.
   */
  async justificatifSoldeExcel(
    tenantId: string,
    compteId: string,
    exerciceId: string,
    params: { dateArret?: string; masquerLettrees?: boolean } = {},
  ): Promise<ClasseurExporte> {
    const j = await this.ecritureService.justificatifSolde(tenantId, { compteId, exerciceId, ...params });
    const identite = await this.identiteEtat(tenantId, { exerciceId });

    const classeur = this.nouveauClasseur();
    const feuille = classeur.addWorksheet('Justificatif');

    feuille.getRow(1).getCell(1).value = `${j.compte.numero} ${j.compte.intitule} · ${identite.entite}`;
    feuille.getRow(1).getCell(1).font = { bold: true, size: 11 };

    const colonnes: Array<{ header: string; key: string; width: number }> = [
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Journal', key: 'journal', width: 10 },
      { header: 'N° pièce', key: 'numeroPiece', width: 12 },
      { header: 'Réf. pièce', key: 'reference', width: 20 },
      { header: 'Libellé écriture', key: 'libelle', width: 52 },
      { header: 'Devise TR', key: 'deviseTransaction', width: 11 },
      { header: 'Montant devise', key: 'montantDevise', width: 16 },
      { header: `Débit (${identite.devise})`, key: 'debit', width: 16 },
      { header: `Crédit (${identite.devise})`, key: 'credit', width: 16 },
      { header: 'Lettrage', key: 'lettre', width: 10 },
    ];
    feuille.getRow(2).values = colonnes.map((c) => c.header);
    colonnes.forEach((c, i) => {
      feuille.getColumn(i + 1).key = c.key;
      feuille.getColumn(i + 1).width = c.width;
    });

    for (const l of j.lignes) {
      const r = feuille.addRow({
        date: l.date,
        journal: l.journal,
        numeroPiece: l.numeroPiece,
        reference: l.reference,
        // Une ligne d'à-nouveau se nomme · sinon on la prend pour une
        // opération de l'exercice et on cherche une pièce qui n'existe pas.
        libelle: l.estANouveau ? `${l.libelle} · à-nouveau` : l.libelle,
        deviseTransaction: l.deviseTransaction,
        montantDevise: l.montantDevise,
        debit: l.debit || null,
        credit: l.credit || null,
        lettre: l.lettre,
      });
      if (l.estANouveau) r.font = { italic: true };
    }

    const derniereLigneDonnees = feuille.rowCount;
    const total = feuille.addRow({
      libelle: 'Total',
      debit: j.totaux.debit || null,
      credit: j.totaux.credit || null,
    });
    total.font = ENTETE_FONT;
    const ligneSolde = feuille.addRow({ libelle: 'Solde', debit: j.totaux.solde || null });
    ligneSolde.font = ENTETE_FONT;

    if (j.recoupement.applicable) {
      const r = feuille.addRow({
        libelle: j.recoupement.concordant
          ? 'Recoupement avec la balance · concordant'
          : "ÉCART AVEC LA BALANCE · le justificatif ne couvre pas tout le solde",
        debit: j.recoupement.soldeBalance || null,
        credit: j.recoupement.ecart || null,
      });
      r.font = { bold: true, italic: true };
    }

    this.appliquerFormats(feuille, {
      date: FORMAT_DATE,
      montantDevise: FORMAT_MONTANT,
      debit: FORMAT_MONTANT,
      credit: FORMAT_MONTANT,
    });
    this.piedDePageEtat(feuille, identite);
    this.finaliserTableau(feuille, colonnes.length, derniereLigneDonnees, 2);

    return {
      buffer: await this.versBuffer(classeur),
      nomFichier: `justificatif-${j.compte.numero}-au-${j.dateArret}.xlsx`,
    };
  }

  /**
   * ÉVOLUTION PLURIANNUELLE DES SOLDES · une colonne par exercice, la plus
   * récente en premier, comme la feuille « Evolution balances » du fichier de
   * préparation de liasse relevé sur le Drive.
   *
   * Une case VIDE n'est pas un zéro · elle dit que le compte n'était pas
   * mouvementé cet exercice-là. Écrire zéro ferait lire une extinction là où
   * il n'y a qu'une création, et c'est le genre de faux signal qui envoie un
   * réviseur chercher une écriture qui n'existe pas.
   */
  async evolutionSoldesExcel(tenantId: string, nbExercices?: number): Promise<ClasseurExporte> {
    const { exercices, lignes } = await this.ecritureService.evolutionSoldes(tenantId, { nbExercices });
    const identite = await this.identiteEtat(tenantId, {});

    const classeur = this.nouveauClasseur();
    const feuille = classeur.addWorksheet('Évolution des soldes');

    const entetes = ['N° compte', 'Intitulé', ...exercices.map((e) => e.libelle)];
    feuille.getRow(1).values = entetes;
    feuille.getColumn(1).width = 14;
    feuille.getColumn(2).width = 42;
    for (let i = 3; i <= entetes.length; i++) feuille.getColumn(i).width = 18;

    for (const l of lignes) {
      const r = feuille.addRow([]);
      r.getCell(1).value = l.numero;
      r.getCell(2).value = l.intitule;
      l.soldes.forEach((s, i) => {
        r.getCell(i + 3).value = s;
      });
    }

    for (let i = 3; i <= entetes.length; i++) feuille.getColumn(i).numFmt = FORMAT_MONTANT;
    this.piedDePageEtat(feuille, identite);
    this.finaliserTableau(feuille, entetes.length, feuille.rowCount);

    return {
      buffer: await this.versBuffer(classeur),
      nomFichier: 'evolution-soldes.xlsx',
    };
  }

  /**
   * TABLEAU DES IMMOBILISATIONS · l'état que le cabinet classe en tête du
   * cycle, et que le logiciel ne produisait pas.
   *
   * Présentation relevée sur le dossier de révision ouvert sur le Drive
   * (« Fichier immos et AMORTIS ») : un cartouche de trois lignes (entité,
   * titre, date d'arrêté), puis une ligne par bien GROUPÉE PAR COMPTE
   * D'IMPUTATION, un S/TOTAL par groupe, un TOTAL GÉNÉRAL.
   *
   * Le cartouche est ici conservé alors qu'il a été retiré du journal, du
   * grand livre et de la balance · et ce n'est pas une incohérence. Leurs
   * livres comptables commencent en ligne 1 sans titre ; LEUR tableau des
   * immobilisations, lui, en porte un, parce que c'est une feuille de travail
   * qu'on classe et qu'on relit hors de son classeur. On copie ce qu'ils font,
   * pas une règle qu'on leur prête.
   */
  async tableauImmobilisationsExcel(tenantId: string, dateArret?: string): Promise<ClasseurExporte> {
    const t = await this.immos.tableauImmobilisations(tenantId, { dateArret });
    const identite = await this.identiteEtat(tenantId, {});

    const classeur = this.nouveauClasseur();
    const feuille = classeur.addWorksheet('Immobilisations');

    feuille.getRow(1).getCell(1).value = identite.entite;
    feuille.getRow(1).getCell(1).font = { bold: true, size: 12 };
    feuille.getRow(2).getCell(1).value = 'TABLEAU DES IMMOBILISATIONS';
    feuille.getRow(2).getCell(1).font = { bold: true };
    feuille.getRow(2).getCell(5).value = t.dateArret ? `Au ${new Date(t.dateArret).toLocaleDateString('fr-FR')}` : identite.periode;

    const colonnes = [
      { header: 'Libellé', key: 'libelle', width: 52 },
      { header: "Date d'acquisition", key: 'date', width: 18 },
      { header: 'Durée', key: 'duree', width: 8 },
      { header: `Val. brute (${identite.devise})`, key: 'brut', width: 18 },
      { header: 'Amort. cumulés', key: 'amort', width: 18 },
      { header: 'Val. nette', key: 'net', width: 18 },
      { header: 'Observations', key: 'obs', width: 44 },
    ];
    feuille.getRow(4).values = colonnes.map((c) => c.header);
    colonnes.forEach((c, i) => {
      feuille.getColumn(i + 1).key = c.key;
      feuille.getColumn(i + 1).width = c.width;
    });

    for (const g of t.groupes) {
      const titre = feuille.addRow({ libelle: `(${g.numero}) ${g.intitule}` });
      titre.font = { bold: true };
      for (const l of g.lignes) {
        feuille.addRow({
          libelle: l.designation,
          date: new Date(l.dateAcquisition),
          duree: l.dureeAns,
          brut: l.valeurBrute || null,
          amort: l.amortissements || null,
          net: l.valeurNette || null,
          // Un bien SORTI reste au tableau à sa date d'arrêté s'il y était · le
          // taire ferait chercher un bien qu'on croit encore détenu.
          obs: l.dateSortie ? `Sorti le ${new Date(l.dateSortie).toLocaleDateString('fr-FR')}` : '',
        });
      }
      const sousTotal = feuille.addRow({
        libelle: 'S/TOTAL',
        brut: g.brut || null,
        amort: g.amortissements || null,
        net: g.net || null,
      });
      sousTotal.font = ENTETE_FONT;
    }

    const derniereLigneDonnees = feuille.rowCount;
    const total = feuille.addRow({
      libelle: 'TOTAL GÉNÉRAL',
      brut: t.totaux.brut || null,
      amort: t.totaux.amortissements || null,
      net: t.totaux.net || null,
    });
    total.font = ENTETE_FONT;

    this.appliquerFormats(feuille, {
      date: FORMAT_DATE,
      brut: FORMAT_MONTANT,
      amort: FORMAT_MONTANT,
      net: FORMAT_MONTANT,
    });
    this.piedDePageEtat(feuille, identite);
    this.finaliserTableau(feuille, colonnes.length, derniereLigneDonnees, 4);

    return {
      buffer: await this.versBuffer(classeur),
      nomFichier: `tableau-immobilisations${t.dateArret ? `-au-${t.dateArret}` : ''}.xlsx`,
    };
  }

  /**
   * TABLEAU DES AMORTISSEMENTS · douze colonnes mensuelles, à leur modèle.
   *
   * Ce que le découpage mensuel montre et qu'un total annuel cache : le mois
   * d'ENTRÉE du bien, celui de sa SORTIE, et celui où il ACHÈVE de s'amortir.
   * Une ligne dont la dotation n'est pas encore comptabilisée est signalée ·
   * un tableau qui mêlerait sans le dire du comptabilisé et du prévisionnel
   * ne se recouperait avec aucun compte.
   */
  async tableauAmortissementsExcel(tenantId: string, exerciceId: string): Promise<ClasseurExporte> {
    const t = await this.immos.tableauAmortissements(tenantId, exerciceId);
    const identite = await this.identiteEtat(tenantId, { exerciceId });

    const classeur = this.nouveauClasseur();
    const feuille = classeur.addWorksheet('Amortissements');

    feuille.getRow(1).getCell(1).value = identite.entite;
    feuille.getRow(1).getCell(1).font = { bold: true, size: 12 };
    feuille.getRow(2).getCell(1).value = `TABLEAU DES AMORTISSEMENTS · ${identite.periode}`;
    feuille.getRow(2).getCell(1).font = { bold: true };

    const entetes = [
      'Libellé',
      "Date d'acquisition",
      `Val. brute (${identite.devise})`,
      'Taux',
      ...t.mois.map((m) => m.libelle),
      "Dotations de l'exercice",
      'Amort. cum. N-1',
      'Amort. cum. N',
      'Val. nette',
      'Dotation',
    ];
    feuille.getRow(4).values = entetes;
    feuille.getColumn(1).width = 52;
    feuille.getColumn(2).width = 18;
    for (let i = 3; i <= entetes.length; i++) feuille.getColumn(i).width = 15;

    const PREMIER_MOIS = 5; // A libellé, B date, C brut, D taux, puis les mois.
    const COL_DOTATION = PREMIER_MOIS + t.mois.length;

    const poser = (
      libelle: string,
      valeurs: { date?: Date; brut?: number | null; taux?: number | null; parMois: number[]; dotation: number; cumulN1: number; cumulN: number; net: number; etat?: string },
    ) => {
      const r = feuille.addRow([]);
      r.getCell(1).value = libelle;
      if (valeurs.date) r.getCell(2).value = valeurs.date;
      r.getCell(3).value = valeurs.brut ?? null;
      if (valeurs.taux !== undefined && valeurs.taux !== null) r.getCell(4).value = valeurs.taux / 100;
      valeurs.parMois.forEach((m, i) => {
        r.getCell(PREMIER_MOIS + i).value = m || null;
      });
      r.getCell(COL_DOTATION).value = valeurs.dotation || null;
      r.getCell(COL_DOTATION + 1).value = valeurs.cumulN1 || null;
      r.getCell(COL_DOTATION + 2).value = valeurs.cumulN || null;
      r.getCell(COL_DOTATION + 3).value = valeurs.net || null;
      if (valeurs.etat) r.getCell(COL_DOTATION + 4).value = valeurs.etat;
      return r;
    };

    for (const g of t.groupes) {
      const titre = feuille.addRow([]);
      titre.getCell(1).value = `(${g.numero}) ${g.intitule}`;
      titre.font = { bold: true };
      for (const l of g.lignes) {
        poser(l.designation, {
          date: new Date(l.dateAcquisition),
          brut: l.valeurBrute,
          taux: l.taux,
          parMois: l.parMois,
          dotation: l.dotation,
          cumulN1: l.cumulN1,
          cumulN: l.cumulN,
          net: l.valeurNette,
          etat: l.dotationPassee ? 'Comptabilisée' : 'À passer',
        });
      }
      const st = poser('S/TOTAL', {
        parMois: g.parMois,
        dotation: g.dotation,
        cumulN1: g.cumulN1,
        cumulN: g.cumulN,
        net: g.net,
      });
      st.font = ENTETE_FONT;
    }

    const derniereLigneDonnees = feuille.rowCount;
    const total = poser('TOTAL GÉNÉRAL', {
      parMois: t.totaux.parMois,
      dotation: t.totaux.dotation,
      cumulN1: t.totaux.cumulN1,
      cumulN: t.totaux.cumulN,
      net: t.totaux.net,
    });
    total.font = ENTETE_FONT;

    feuille.getColumn(2).numFmt = FORMAT_DATE;
    feuille.getColumn(3).numFmt = FORMAT_MONTANT;
    feuille.getColumn(4).numFmt = '0.00%';
    for (let i = PREMIER_MOIS; i <= COL_DOTATION + 3; i++) feuille.getColumn(i).numFmt = FORMAT_MONTANT;
    this.piedDePageEtat(feuille, identite);
    this.finaliserTableau(feuille, entetes.length, derniereLigneDonnees, 4);

    return {
      buffer: await this.versBuffer(classeur),
      nomFichier: `tableau-amortissements${await this.suffixeExercice(tenantId, exerciceId)}.xlsx`,
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

      // AUCUNE LIGNE · la note existe, l'exercice ne la chiffre pas. On pose
      // la mention à la place du corps du tableau plutôt que de laisser une
      // grille vide, qui se lirait comme un tableau tronqué.
      if (note.lignes.length === 0) {
        r = bandeNeant(ws, r + 1, ncols) - 1;
      }
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
          "NEANT : aucune rubrique de cette note n'est chiffrée sur l'exercice. La note est jointe à la liasse et " +
            'cochée « N/A » sur la fiche récapitulative · elle figure pour attester qu\'elle a été examinée.',
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
   * Une note non applicable y est cochée « N/A » et a AUSSI sa feuille dans
   * le classeur, portant la mention NEANT · la fiche et la feuille se
   * recoupent, elles ne se remplacent pas.
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
    //
    // TOUTES LES NOTES DU JEU SONT JOINTES, sans exception, celles que
    // l'exercice ne chiffre pas portant la mention NEANT (voir
    // `feuilleNote`). Un seul tirage : il n'y a pas d'option pour masquer
    // les notes vides, et il ne faut pas en réintroduire une.
    //
    // C'EST UN ÉCART ASSUMÉ avec le renvoi (1) du modèle officiel, et il est
    // écrit ici pour qu'un lecteur ne le prenne pas pour un oubli. Ce renvoi,
    // au pied de la fiche récapitulative des deux jeux (Partie 4, ch. 2 pour
    // les associations, ch. 3 pour les projets), dit : « les Notes non
    // documentées ne doivent pas être jointes aux états financiers. [...]
    // Par ailleurs, dans une note, les lignes non chiffrées doivent être
    // supprimées. »
    //
    // Le second membre de phrase reste appliqué : le filtrage des LIGNES non
    // chiffrées se fait dans `NoteAnnexeService.calculerNote`, il n'a pas
    // bougé. Seul le premier, qui écarte la note entière, est écarté par
    // décision du cabinet (Manasse, 2026-09-01, après avoir vu le texte) :
    // une liasse à laquelle il manque des notes ne dit pas au lecteur si
    // elles étaient sans objet ou si on les a oubliées, et la mention NEANT
    // le dit. La fiche récapitulative continue de les cocher « N/A » ·
    // fiche et feuilles se recoupent au lieu de se remplacer.
    const parCode = new Map<string, NoteCalculee[]>();
    for (const n of resultat.notes) {
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

  /**
   * Feuilles `Bilan-Actif` / `Bilan-Passif` du S.M.T · la maquette la plus
   * courte du référentiel : GA à GE puis TOTAL ACTIF (GZ), HA à HD puis
   * TOTAL PASSIF (HZ), cinq colonnes, un seul rang d'en-têtes (EXERCICE N /
   * EXERCICE N-1), totaux en formules SUM, renvoi de note par ligne.
   */
  private feuillesBilanSmtEtafi(
    classeur: ExcelJS.Workbook,
    bilan: Awaited<ReturnType<EtatsFinanciersSmtService['bilan']>>,
    ident: IdentiteLiasse,
  ): { rangsActif: Map<string, number>; rangsPassif: Map<string, number> } {
    const construire = (
      nom: string,
      cote: 'ACTIF' | 'PASSIF',
      postes: typeof bilan.actif,
      page: string,
      renvoi: string,
    ): Map<string, number> => {
      const ws = classeur.addWorksheet(nom);
      ecrireCartouche(ws, ident, `BILAN SYCEBNL - SMT\n${page}`, 5);
      titreEtat(ws, 'BILAN', 2, 4, 7, 16);
      let r = 8;
      for (const [i, h] of ['REF', cote, 'NOTE', 'EXERCICE N', 'EXERCICE N-1'].entries()) {
        ws.getCell(r, i + 1).value = h;
      }
      entetesBande(ws, r, r, 1, 5);
      ws.getRow(r).height = 22;
      const premiere = r + 1;
      const rangs = new Map<string, number>();
      for (const p of postes) {
        if (p.estTotal) continue; // le total est reconstruit en formule, en pied.
        r += 1;
        rangs.set(p.ref, r);
        ws.getCell(r, 1).value = p.ref;
        ws.getCell(r, 2).value = p.libelle;
        ws.getCell(r, 3).value = p.note ?? '';
        ws.getCell(r, 4).value = p.montant;
        if (p.montantN1 !== undefined) ws.getCell(r, 5).value = p.montantN1;
        styleLigne(ws, r, 1, 5, 'normal', [4, 5], 1);
        ws.getCell(r, 3).alignment = { horizontal: 'center', vertical: 'middle' };
        ws.getRow(r).height = 22;
      }
      r += 1;
      const totalRef = cote === 'ACTIF' ? 'GZ' : 'HZ';
      rangs.set(totalRef, r);
      ws.getCell(r, 1).value = totalRef;
      ws.getCell(r, 2).value = cote === 'ACTIF' ? 'TOTAL ACTIF' : 'TOTAL PASSIF';
      ws.getCell(r, 4).value = { formula: `SUM(D${premiere}:D${r - 1})` };
      ws.getCell(r, 5).value = { formula: `SUM(E${premiere}:E${r - 1})` };
      styleLigne(ws, r, 1, 5, 'general', [4, 5], 1);
      ws.getRow(r).height = 22;
      cadre(ws, 8, 1, r, 5, MOYEN);
      ligneControleSousEtat(ws, r + 2, renvoi);
      largeurs(ws, { A: 6, B: 52, C: 6.5, D: 15.7, E: 15.7 });
      ws.views = [{ state: 'frozen', ySplit: 8, showGridLines: false }];
      return rangs;
    };
    const rangsActif = construire(
      'Bilan-Actif',
      'ACTIF',
      bilan.actif,
      'PAGE 1/2',
      "(1) à faire figurer sur l'état de situation si montants significatifs (Partie 4, ch. 4).",
    );
    const rangsPassif = construire(
      'Bilan-Passif',
      'PASSIF',
      bilan.passif,
      'PAGE 2/2',
      'Autres fonds propres : réserves, report à nouveau, subventions, fonds affectés/reportés, emprunts et provisions (le modèle SMT ne les distingue pas).',
    );
    return { rangsActif, rangsPassif };
  }

  /** Bilan S.M.T · export individuel, charte ETAFI. */
  async bilanSmtExcel(tenantId: string, exerciceId: string): Promise<ClasseurExporte> {
    const [bilan, ident] = await Promise.all([
      this.etatsFinanciersSmtService.bilan(tenantId, exerciceId),
      this.identiteLiasse(tenantId, exerciceId),
    ]);
    const classeur = this.nouveauClasseur();
    const { rangsActif, rangsPassif } = this.feuillesBilanSmtEtafi(classeur, bilan, ident);
    const controle = bilan.equilibre
      ? `Contrôle : bilan équilibré · actif = passif = ${bilan.totalActif.toLocaleString('fr-FR')}.`
      : `CONTRÔLE : DÉSÉQUILIBRE de ${(bilan.totalActif - bilan.totalPassif).toLocaleString('fr-FR')} entre actif et passif.`;
    ligneControleSousEtat(classeur.getWorksheet('Bilan-Actif')!, Math.max(...rangsActif.values()) + 3, controle);
    ligneControleSousEtat(classeur.getWorksheet('Bilan-Passif')!, Math.max(...rangsPassif.values()) + 3, controle);
    numeroterPages(classeur);
    return {
      buffer: await this.versBuffer(classeur),
      nomFichier: `bilan-smt${await this.suffixeExercice(tenantId, exerciceId)}.xlsx`,
    };
  }

  /**
   * Feuille `Résultat` du S.M.T · comptabilité de trésorerie puis
   * retraitements, dans l'ordre et les niveaux du modèle : KA-KB, KX (A),
   * JA-JF, JX (B), KZ (C = A - B), VA-VB-VC, JG, KZC · KX, JX, KZ et KZC en
   * formules sur leurs lignes porteuses.
   */
  private feuilleResultatSmtEtafi(
    classeur: ExcelJS.Workbook,
    cr: Awaited<ReturnType<EtatsFinanciersSmtService['compteDeResultat']>>,
    ident: IdentiteLiasse,
  ): Map<string, number> {
    const ws = classeur.addWorksheet('Résultat');
    ecrireCartouche(ws, ident, 'COMPTE DE RESULTAT\nSYCEBNL - SMT', 5);
    titreEtat(ws, 'COMPTE DE RESULTAT', 2, 4, 7, 14);
    let r = 8;
    for (const [i, h] of ['REF', 'LIBELLES', 'NOTE', 'EXERCICE N', 'EXERCICE N-1'].entries()) {
      ws.getCell(r, i + 1).value = h;
    }
    entetesBande(ws, r, r, 1, 5);
    ws.getRow(r).height = 22;

    const NIVEAUX_CR_SMT: Record<string, NiveauLigne> = { KX: 'section', JX: 'section', KZ: 'inter', KZC: 'section' };
    const NOTES_CR_SMT: Record<string, string> = { VA: '2', VB: '3', VC: '3' };
    const rangs = new Map<string, number>();
    const poser = (ref: string, libelle: string, montant: number | null, note = '') => {
      r += 1;
      rangs.set(ref, r);
      ws.getCell(r, 1).value = ref;
      ws.getCell(r, 2).value = libelle;
      ws.getCell(r, 3).value = note || (NOTES_CR_SMT[ref] ?? (ref.startsWith('K') || ref.startsWith('J') ? '4' : ''));
      if (montant !== null) ws.getCell(r, 4).value = montant;
      styleLigne(ws, r, 1, 5, NIVEAUX_CR_SMT[ref] ?? 'normal', [4, 5], 1);
      ws.getCell(r, 3).alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getRow(r).height = 22;
    };
    for (const p of cr.recettes) poser(p.ref, p.libelle, p.montant);
    poser('KX', 'TOTAL DES REVENUS ENCAISSÉS (A)', null, ' ');
    for (const p of cr.depenses) poser(p.ref, p.libelle, p.montant);
    poser('JX', 'TOTAL DÉPENSES SUR CHARGES (B)', null, ' ');
    poser('KZ', 'SOLDE : excédent (+) ou insuffisance (-) de recettes (C = A - B)', null, ' ');
    for (const retraitement of cr.retraitements) poser(retraitement.ref, retraitement.libelle, retraitement.montant);
    poser('KZC', "RÉSULTAT NET DE L'EXERCICE", null, ' ');

    const somme = (refs: string[]) => refs.map((x) => `D${rangs.get(x)}`).join('+');
    ws.getCell(rangs.get('KX')!, 4).value = { formula: somme(cr.recettes.map((p) => p.ref)) };
    ws.getCell(rangs.get('JX')!, 4).value = { formula: somme(cr.depenses.map((p) => p.ref)) };
    ws.getCell(rangs.get('KZ')!, 4).value = { formula: `D${rangs.get('KX')}-D${rangs.get('JX')}` };
    ws.getCell(rangs.get('KZC')!, 4).value = {
      formula: `D${rangs.get('KZ')}+D${rangs.get('VA')}+D${rangs.get('VB')}-D${rangs.get('VC')}-D${rangs.get('JG')}`,
    };
    cadre(ws, 8, 1, r, 5, MOYEN);
    ligneControleSousEtat(
      ws,
      r + 2,
      "Comptabilité de trésorerie puis retraitements (Partie 4, ch. 4) : variations de stocks, de créances et de dettes calculées d'après le bilan, dotations en JG.",
    );
    largeurs(ws, { A: 6, B: 60, C: 6.5, D: 15.7, E: 15.7 });
    ws.views = [{ state: 'frozen', ySplit: 8, showGridLines: false }];
    return rangs;
  }

  /** Compte de résultat S.M.T · export individuel, charte ETAFI. */
  async compteDeResultatSmtExcel(tenantId: string, exerciceId: string): Promise<ClasseurExporte> {
    const [cr, ident] = await Promise.all([
      this.etatsFinanciersSmtService.compteDeResultat(tenantId, exerciceId),
      this.identiteLiasse(tenantId, exerciceId),
    ]);
    const classeur = this.nouveauClasseur();
    const rangs = this.feuilleResultatSmtEtafi(classeur, cr, ident);
    ligneControleSousEtat(
      classeur.getWorksheet('Résultat')!,
      Math.max(...rangs.values()) + 3,
      cr.controle.concordant
        ? 'Contrôle : le résultat net recoupe le résultat logé au bilan (flux hors exploitation déduits).'
        : `CONTRÔLE : écart de ${cr.controle.ecart.toLocaleString('fr-FR')} avec le résultat du bilan · voir les flux hors exploitation.`,
    );
    numeroterPages(classeur);
    return {
      buffer: await this.versBuffer(classeur),
      nomFichier: `compte-de-resultat-smt${await this.suffixeExercice(tenantId, exerciceId)}.xlsx`,
    };
  }

  /**
   * NOTE 4 · JOURNAL UNIQUE DE TRÉSORERIE, dans la maquette du modèle
   * (Dates | Libellés | Recettes | Dépenses | Solde | ventilations), un
   * journal PAR COMPTE de trésorerie (« NB : prévoir un journal par banque
   * et un journal pour la caisse »), ouvert sur son report à nouveau et clos
   * sur son solde à reporter · solde progressif en formules.
   */
  private feuilleJournalTresorerieEtafi(
    classeur: ExcelJS.Workbook,
    journal: Awaited<ReturnType<EtatsFinanciersSmtService['journalTresorerie']>>,
    ident: IdentiteLiasse,
    nomFeuille = 'NOTE 4 JOURNAL TRESORERIE',
  ) {
    const ws = classeur.addWorksheet(nomFeuille);
    const colonnes = [...journal.colonnesRecettes, ...journal.colonnesDepenses];
    const ncols = 5 + colonnes.length;
    ecrireCartouche(ws, ident, 'NOTE 4\nSYCEBNL - SMT', ncols);
    titreNote(ws, 'NOTE 4 : JOURNAL UNIQUE DE TRESORERIE', ncols);
    let r = 7;
    for (const j of journal.journaux) {
      r += 1;
      const c = ws.getCell(r, 1);
      c.value = `${j.numero} · ${j.intitule}`;
      c.font = { name: 'Arial', size: 9, bold: true };
      fusion(ws, r, 1, r, ncols);
      r += 1;
      ws.getCell(r, 1).value = 'Dates';
      ws.getCell(r, 2).value = 'Libellés';
      ws.getCell(r, 3).value = 'Recettes';
      ws.getCell(r, 4).value = 'Dépenses';
      ws.getCell(r, 5).value = 'Solde';
      colonnes.forEach((col, i) => {
        ws.getCell(r, 6 + i).value = col.libelle;
      });
      entetesBande(ws, r, r, 1, ncols);
      ws.getRow(r).height = 30;
      const debutTableau = r;
      r += 1;
      ws.getCell(r, 2).value = 'Report à nouveau';
      ws.getCell(r, 5).value = j.reportANouveau;
      styleLigne(ws, r, 1, ncols, 'rubrique', [3, 4, 5]);
      const colsMontant = [3, 4, 5, ...colonnes.map((_, i) => 6 + i)];
      for (const operation of j.operations) {
        r += 1;
        ws.getCell(r, 1).value = new Date(operation.date);
        ws.getCell(r, 1).numFmt = 'DD/MM/YYYY';
        ws.getCell(r, 2).value = operation.virementInterne ? `${operation.libelle} (virement interne)` : operation.libelle;
        if (operation.recette) ws.getCell(r, 3).value = operation.recette;
        if (operation.depense) ws.getCell(r, 4).value = operation.depense;
        ws.getCell(r, 5).value = { formula: `E${r - 1}+C${r}-D${r}` };
        colonnes.forEach((col, i) => {
          const v = operation.ventilation[col.cle];
          if (v) ws.getCell(r, 6 + i).value = v;
        });
        styleLigne(ws, r, 1, ncols, 'normal', colsMontant);
      }
      r += 1;
      ws.getCell(r, 2).value = 'Solde à reporter';
      ws.getCell(r, 5).value = { formula: `E${r - 1}` };
      styleLigne(ws, r, 1, ncols, 'inter', [3, 4, 5]);
      cadre(ws, debutTableau, 1, r, ncols, MOYEN);
      if (!j.boucle) {
        r += 1;
        ligneControleSousEtat(
          ws,
          r,
          `CONTRÔLE : le solde à reporter diverge du solde balance du compte (${j.soldeBalance.toLocaleString('fr-FR')}).`,
        );
      }
      r += 1; // une ligne d'air entre deux journaux
    }
    if (journal.journaux.length === 0) {
      r += 1;
      ligneControleSousEtat(ws, r, 'Aucun compte de trésorerie mouvementé sur cet exercice.');
    }
    const spec: Record<string, number> = { A: 11, B: 32, C: 13, D: 13, E: 13 };
    colonnes.forEach((_, i) => {
      spec[String.fromCharCode(70 + i)] = 14;
    });
    largeurs(ws, spec);
    return ws;
  }

  /** Journal de trésorerie S.M.T · export individuel (la Note 4 seule). */
  async journalTresorerieSmtExcel(tenantId: string, exerciceId: string): Promise<ClasseurExporte> {
    const [journal, ident] = await Promise.all([
      this.etatsFinanciersSmtService.journalTresorerie(tenantId, exerciceId),
      this.identiteLiasse(tenantId, exerciceId),
    ]);
    const classeur = this.nouveauClasseur();
    this.feuilleJournalTresorerieEtafi(classeur, journal, ident);
    numeroterPages(classeur);
    return {
      buffer: await this.versBuffer(classeur),
      nomFichier: `journal-tresorerie-smt${await this.suffixeExercice(tenantId, exerciceId)}.xlsx`,
    };
  }

  /**
   * Les notes 1, 2, 3 et 5 du S.M.T, chacune sur la feuille et dans la
   * maquette du modèle, remplies des données réelles du dossier (registre
   * des immobilisations daté, stocks, créances et dettes par tiers,
   * dotations) · le moteur Python du skill n'a que la balance et laisse ces
   * grilles à compléter.
   */
  private feuillesNotesSmtEtafi(
    classeur: ExcelJS.Workbook,
    donnees: {
      note1: Awaited<ReturnType<EtatsFinanciersSmtService['note1Immobilisations']>>;
      note2: Awaited<ReturnType<EtatsFinanciersSmtService['note2Stocks']>>;
      note3: Awaited<ReturnType<EtatsFinanciersSmtService['note3CreancesDettes']>>;
      note5: Awaited<ReturnType<EtatsFinanciersSmtService['note5Dotation']>>;
    },
    ident: IdentiteLiasse,
  ) {
    const { note1, note2, note3, note5 } = donnees;

    // --- NOTE 1 · registre daté des immobilisations ------------------------
    {
      const ws = classeur.addWorksheet('NOTE 1 IMMOBILISATIONS');
      ecrireCartouche(ws, ident, 'NOTE 1\nSYCEBNL - SMT', 7);
      titreNote(ws, "NOTE 1 : TABLEAU D'ACQUISITION ET DE SUIVI DU MATERIEL, DU MOBILIER ET AUTRES IMMOBILISATIONS", 7);
      let r = 8;
      for (const [i, h] of [
        'Date de mise en service',
        'Désignation',
        'Montant',
        "Date d'acquisition",
        "Durée d'utilité",
        'Date de sortie',
        'Prix de cession',
      ].entries()) {
        ws.getCell(r, i + 1).value = h;
      }
      entetesBande(ws, r, r, 1, 7);
      ws.getRow(r).height = 30;
      // Le S.M.T crée toujours ses cinq feuilles · quand l'une n'a aucune
      // ligne, elle porte la mention plutôt qu'un tableau réduit à son total.
      if (note1.lignes.length === 0) r = bandeNeant(ws, r + 1, 7) - 1;
      for (const l of note1.lignes) {
        r += 1;
        ws.getCell(r, 1).value = new Date(l.dateMiseEnService);
        ws.getCell(r, 1).numFmt = 'DD/MM/YYYY';
        ws.getCell(r, 2).value = l.designation;
        ws.getCell(r, 3).value = l.montant;
        ws.getCell(r, 4).value = new Date(l.dateAcquisition);
        ws.getCell(r, 4).numFmt = 'DD/MM/YYYY';
        ws.getCell(r, 5).value = l.dureeUtiliteAns;
        if (l.dateSortie) {
          ws.getCell(r, 6).value = new Date(l.dateSortie);
          ws.getCell(r, 6).numFmt = 'DD/MM/YYYY';
        }
        if (l.prixCession !== null && l.prixCession !== undefined) ws.getCell(r, 7).value = l.prixCession;
        styleLigne(ws, r, 1, 7, 'normal', [3, 7]);
      }
      r += 1;
      ws.getCell(r, 2).value = 'TOTAL';
      ws.getCell(r, 3).value = note1.total;
      styleLigne(ws, r, 1, 7, 'inter', [3]);
      cadre(ws, 8, 1, r, 7, MOYEN);
      largeurs(ws, { A: 14, B: 44, C: 15, D: 15, E: 13, F: 13, G: 15 });
    }

    // --- NOTE 2 · état des stocks -----------------------------------------
    {
      const ws = classeur.addWorksheet('NOTE 2 STOCKS');
      ecrireCartouche(ws, ident, 'NOTE 2\nSYCEBNL - SMT', 5);
      titreNote(ws, 'NOTE 2 : ETAT DES STOCKS', 5);
      let r = 8;
      for (const [i, h] of ['Référence', 'Désignation', 'Quantité', 'Prix unitaire', 'Montant'].entries()) {
        ws.getCell(r, i + 1).value = h;
      }
      entetesBande(ws, r, r, 1, 5);
      if (note2.lignes.length === 0) r = bandeNeant(ws, r + 1, 5) - 1;
      for (const l of note2.lignes) {
        r += 1;
        ws.getCell(r, 1).value = l.reference;
        ws.getCell(r, 2).value = l.designation;
        ws.getCell(r, 5).value = l.montant;
        styleLigne(ws, r, 1, 5, 'normal', [4, 5]);
      }
      r += 1;
      ws.getCell(r, 2).value = 'VALEUR DU STOCK FINAL';
      ws.getCell(r, 5).value = note2.valeurStockFinal;
      styleLigne(ws, r, 1, 5, 'inter', [5]);
      r += 1;
      ws.getCell(r, 2).value = 'VALEUR DU STOCK INITIAL';
      ws.getCell(r, 5).value = note2.valeurStockInitial;
      styleLigne(ws, r, 1, 5, 'inter', [5]);
      cadre(ws, 8, 1, r, 5, MOYEN);
      ligneControleSousEtat(ws, r + 2, note2.motifQuantites);
      largeurs(ws, { A: 12, B: 46, C: 12, D: 14, E: 16 });
    }

    // --- NOTE 3 · créances et dettes non échues ---------------------------
    {
      const ws = classeur.addWorksheet('NOTE 3 CREANCES-DETTES');
      ecrireCartouche(ws, ident, 'NOTE 3\nSYCEBNL - SMT', 6);
      titreNote(ws, 'NOTE 3 : ETAT DES CREANCES ET DES DETTES NON ECHUES', 6);
      let r = 8;
      for (const [i, h] of [
        'Compte',
        'Nom',
        'Montant au 31/12/N',
        'Montant au 01/01/N',
        'Variation en valeur',
        'Variation en %',
      ].entries()) {
        ws.getCell(r, i + 1).value = h;
      }
      entetesBande(ws, r, r, 1, 6);
      ws.getRow(r).height = 30;
      const bloc = (titre: string, blocLignes: typeof note3.creances, totalLibelle: string, total: number) => {
        r += 1;
        ws.getCell(r, 1).value = titre;
        fusion(ws, r, 1, r, 6);
        styleLigne(ws, r, 1, 6, 'bande');
        // Créances et dettes sont deux blocs indépendants : l'un peut être
        // néant sans l'autre, la mention se pose donc bloc par bloc.
        if (blocLignes.length === 0) r = bandeNeant(ws, r + 1, 6) - 1;
        for (const l of blocLignes) {
          r += 1;
          ws.getCell(r, 1).value = l.numero;
          ws.getCell(r, 2).value = l.nom;
          ws.getCell(r, 3).value = l.montantCloture;
          if (l.montantOuverture !== undefined) ws.getCell(r, 4).value = l.montantOuverture;
          if (l.variationValeur !== undefined) ws.getCell(r, 5).value = l.variationValeur;
          styleLigne(ws, r, 1, 6, 'normal', [3, 4, 5]);
          if (l.variationPourcent !== undefined && l.variationPourcent !== null) {
            ws.getCell(r, 6).value = l.variationPourcent;
            ws.getCell(r, 6).numFmt = '#,##0.00"%"';
          }
        }
        r += 1;
        ws.getCell(r, 2).value = totalLibelle;
        ws.getCell(r, 3).value = total;
        styleLigne(ws, r, 1, 6, 'inter', [3]);
      };
      bloc('CRÉANCES', note3.creances, 'TOTAL DES CRÉANCES', note3.totalCreances);
      bloc('DETTES', note3.dettes, 'TOTAL DES DETTES', note3.totalDettes);
      cadre(ws, 8, 1, r, 6, MOYEN);
      largeurs(ws, { A: 13, B: 42, C: 18, D: 18, E: 18, F: 14 });
    }

    // --- NOTE 5 · dotations ------------------------------------------------
    {
      const ws = classeur.addWorksheet('NOTE 5 DOTATIONS');
      ecrireCartouche(ws, ident, 'NOTE 5\nSYCEBNL - SMT', 4);
      titreNote(ws, 'NOTE 5 : DOTATION', 4);
      let r = 8;
      for (const [i, h] of ['Nom et prénoms des membres', 'Nationalité', 'Montant', 'Avec / sans droit d’entrée'].entries()) {
        ws.getCell(r, i + 1).value = h;
      }
      entetesBande(ws, r, r, 1, 4);
      ws.getRow(r).height = 26;
      if (note5.rubriques.length === 0 && note5.membres.length === 0) r = bandeNeant(ws, r + 1, 4) - 1;
      for (const rubrique of note5.rubriques) {
        r += 1;
        ws.getCell(r, 1).value = `${rubrique.libelle} · rappel balance`;
        ws.getCell(r, 3).value = rubrique.montant;
        styleLigne(ws, r, 1, 4, 'rubrique', [3]);
      }
      for (const membre of note5.membres) {
        r += 1;
        ws.getCell(r, 1).value = membre.nom;
        ws.getCell(r, 2).value = membre.nationalite ?? '';
        ws.getCell(r, 3).value = membre.montant;
        styleLigne(ws, r, 1, 4, 'normal', [3]);
      }
      r += 1;
      ws.getCell(r, 1).value = 'TOTAL';
      ws.getCell(r, 3).value = note5.total;
      styleLigne(ws, r, 1, 4, 'inter', [3]);
      cadre(ws, 8, 1, r, 4, MOYEN);
      ligneControleSousEtat(ws, r + 2, note5.motifNationalite);
      largeurs(ws, { A: 44, B: 16, C: 16, D: 24 });
    }
  }

  /** Notes annexes S.M.T · export individuel : fiche + les cinq notes du modèle. */
  async notesSmtExcel(tenantId: string, exerciceId: string): Promise<ClasseurExporte> {
    const [ident, fiche, note1, note2, note3, note5, journal] = await Promise.all([
      this.identiteLiasse(tenantId, exerciceId),
      Promise.resolve(this.etatsFinanciersSmtService.ficheNotes()),
      this.etatsFinanciersSmtService.note1Immobilisations(tenantId, exerciceId),
      this.etatsFinanciersSmtService.note2Stocks(tenantId, exerciceId),
      this.etatsFinanciersSmtService.note3CreancesDettes(tenantId, exerciceId),
      this.etatsFinanciersSmtService.note5Dotation(tenantId, exerciceId),
      this.etatsFinanciersSmtService.journalTresorerie(tenantId, exerciceId),
    ]);
    const classeur = this.nouveauClasseur();
    this.ficheNotesSmtEtafi(classeur, fiche, ident);
    this.feuillesNotesSmtEtafi(classeur, { note1, note2, note3, note5 }, ident);
    this.feuilleJournalTresorerieEtafi(classeur, journal, ident);
    numeroterPages(classeur);
    return {
      buffer: await this.versBuffer(classeur),
      nomFichier: `notes-annexes-smt${await this.suffixeExercice(tenantId, exerciceId)}.xlsx`,
    };
  }

  /** Fiche NOTES ANNEXES du S.M.T · les deux parties officielles. */
  private ficheNotesSmtEtafi(
    classeur: ExcelJS.Workbook,
    fiche: ReturnType<EtatsFinanciersSmtService['ficheNotes']>,
    ident: IdentiteLiasse,
  ) {
    const parties: PartiesNotes = [
      [
        'Partie 1 : Notes sur le bilan',
        fiche.filter((n) => n.partie === 'BILAN').map((n) => [`Note ${n.numero}`, n.intitule] as [string, string]),
      ],
      [
        'Partie 2 : Notes sur le compte de résultat',
        fiche.filter((n) => n.partie !== 'BILAN').map((n) => [`Note ${n.numero}`, n.intitule] as [string, string]),
      ],
    ];
    construireFicheNotes(classeur, parties, ident);
    return parties;
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
      // Redondant par construction, gardé contre le double comptage.
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
   * LIASSE COMPLÈTE du Système minimal de trésorerie · le classeur entier du
   * modèle : BALANCE N (et N-1 s'il existe), CONTROLE BALANCE, Couverture,
   * Garde, Fiche 1, Fiche 2, Bilan paysage, Bilan-Actif, Bilan-Passif,
   * Résultat, NOTES ANNEXES, NOTE 1 à NOTE 5 (journal de trésorerie
   * compris), TABLE COMMENTAIRE, CONTROLES, ANOMALIES.
   */
  private async liasseSmtEtafi(tenantId: string, exerciceId: string): Promise<ExcelJS.Workbook> {
    const [ident, tenant, bilan, cr, journal, note1, note2, note3, note5, eligibilite, exerciceN1Id] = await Promise.all([
      this.identiteLiasse(tenantId, exerciceId),
      this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
      this.etatsFinanciersSmtService.bilan(tenantId, exerciceId),
      this.etatsFinanciersSmtService.compteDeResultat(tenantId, exerciceId),
      this.etatsFinanciersSmtService.journalTresorerie(tenantId, exerciceId),
      this.etatsFinanciersSmtService.note1Immobilisations(tenantId, exerciceId),
      this.etatsFinanciersSmtService.note2Stocks(tenantId, exerciceId),
      this.etatsFinanciersSmtService.note3CreancesDettes(tenantId, exerciceId),
      this.etatsFinanciersSmtService.note5Dotation(tenantId, exerciceId),
      this.etatsFinanciersSmtService.eligibilite(tenantId, exerciceId),
      this.exerciceN1Id(tenantId, exerciceId),
    ]);
    const lignesBalN = await this.lignesBalanceLiasse(tenantId, exerciceId);
    const lignesBalN1 = exerciceN1Id ? await this.lignesBalanceLiasse(tenantId, exerciceN1Id) : [];

    const classeur = this.nouveauClasseur();
    ecrireFeuilleBalance(classeur, NOM_BALANCE, lignesBalN);
    if (exerciceN1Id) ecrireFeuilleBalance(classeur, NOM_BALANCE_N1, lignesBalN1);
    construireControleBalance(classeur, Boolean(exerciceN1Id), lignesBalN.length, lignesBalN1.length);

    construireCouverture(classeur, ident, 'LIASSE SMT', tenant.pays ?? '');
    construireGarde(classeur, ident, {
      bandeau: 'ETATS FINANCIERS NORMALISES\nDU SYSTEME COMPTABLE DES ENTITES A BUT NON LUCRATIF (SYCEBNL)',
      sousBandeau: 'Associations, Ordres Professionnels, Fondations et Assimilées',
      systeme: 'SYSTEME MINIMAL DE TRESORERIE',
      documents: [
        "Fiche d'identification et renseignements divers",
        'Bilan (actif et passif)',
        'Compte de résultat',
        'Notes annexes 1 à 5',
      ],
    });
    construireFiche1(classeur, ident, 'SYCEBNL', 'Système minimal de trésorerie', {
      ZE: tenant.actePersonnaliteJuridique ?? '',
    });
    construireFiche2(classeur, ident, "EQUIPE DE L'ENTITE A BUT NON LUCRATIF");

    // Bilan paysage · rangs déterministes (données dès la ligne 9, l'en-tête
    // du S.M.T ne prend qu'un rang), total en dernière ligne.
    const versCote = (postes: typeof bilan.actif, libelle: 'ACTIF' | 'PASSIF') => {
      const details = postes.filter((p) => !p.estTotal);
      const totalRef = libelle === 'ACTIF' ? 'GZ' : 'HZ';
      return {
        feuille: libelle === 'ACTIF' ? 'Bilan-Actif' : 'Bilan-Passif',
        libelle,
        cols: [
          { entete: 'EXERCICE N', lettre: 'D' },
          { entete: 'EXERCICE N-1', lettre: 'E' },
        ],
        lignes: [
          ...details.map((p, i) => ({
            ref: p.ref,
            libelle: p.libelle,
            note: p.note ?? '',
            rangSource: 9 + i,
            niveau: 'normal' as NiveauLigne,
          })),
          {
            ref: totalRef,
            libelle: libelle === 'ACTIF' ? 'TOTAL ACTIF' : 'TOTAL PASSIF',
            note: '',
            rangSource: 9 + details.length,
            niveau: 'general' as NiveauLigne,
          },
        ],
      };
    };
    construireBilanPaysage(classeur, ident, versCote(bilan.actif, 'ACTIF'), versCote(bilan.passif, 'PASSIF'), 'BILAN');

    const { rangsActif, rangsPassif } = this.feuillesBilanSmtEtafi(classeur, bilan, ident);
    const rangsCr = this.feuilleResultatSmtEtafi(classeur, cr, ident);

    const fiche = this.etatsFinanciersSmtService.ficheNotes();
    const parties = this.ficheNotesSmtEtafi(classeur, fiche, ident);
    this.feuillesNotesSmtEtafi(classeur, { note1, note2, note3, note5 }, ident);
    this.feuilleJournalTresorerieEtafi(classeur, journal, ident);
    construireTableCommentaires(classeur, parties, ident);

    // CONTROLES · l'équilibre du bilan, la concordance du résultat, le
    // bouclage des journaux de trésorerie et l'éligibilité de l'article 6.
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
      ['TOTAL ACTIF (GZ)', `'Bilan-Actif'!D${rangsActif.get('GZ')}`, ''],
      ['TOTAL PASSIF (HZ)', `'Bilan-Passif'!D${rangsPassif.get('HZ')}`, ''],
      ['Écart bilan actif - passif (doit être 0)', 'B5-B6', 0],
      ['Résultat net (compte de résultat, KZC)', `Résultat!D${rangsCr.get('KZC')}`, ''],
      ['Résultat net logé au bilan (HB)', `'Bilan-Passif'!D${rangsPassif.get('HB')}`, ''],
      ['Flux hors exploitation (déduits du rapprochement)', cr.controle.fluxHorsExploitation, ''],
      ['Écart résultat CR / bilan, flux hors exploitation déduits (doit être 0)', 'B8-B10-B9', 0],
      [
        "Éligibilité art. 6 · plus haute catégorie de ressources de l'exercice",
        Math.max(0, ...eligibilite.categories.map((c) => c.montant)),
        `≤ ${eligibilite.seuilParCategorieFcfa.toLocaleString('fr-FR')} FCFA`,
      ],
    ];
    let rc = 1;
    for (const [lab, val, attendu] of controles) {
      rc += 1;
      ctl.getCell(rc, 1).value = lab;
      ctl.getCell(rc, 2).value = typeof val === 'string' ? { formula: val } : val;
      ctl.getCell(rc, 3).value = attendu;
      styleLigne(ctl, rc, 1, 3, 'normal', [2]);
    }
    largeurs(ctl, { A: 62, B: 20, C: 14 });

    // ANOMALIES.
    const an = classeur.addWorksheet('ANOMALIES');
    for (const [i, h] of ['Gravité', 'Compte', 'Intitulé', 'Problème', 'Solution proposée'].entries()) {
      an.getCell(1, i + 1).value = h;
    }
    entetesBande(an, 1, 1, 1, 5);
    const anomalies: Array<[string, string, string, string, string]> = [];
    if (!bilan.equilibre) {
      anomalies.push([
        'BLOQUANT',
        'GZ / HZ',
        'Bilan',
        `Actif et passif diffèrent de ${(bilan.totalActif - bilan.totalPassif).toFixed(2)}.`,
        'Vérifier les écritures déséquilibrées.',
      ]);
    }
    if (!cr.controle.concordant) {
      anomalies.push([
        'A_TRAITER',
        'KZC',
        'Compte de résultat',
        `Écart de ${cr.controle.ecart.toFixed(2)} avec le résultat du bilan, flux hors exploitation déduits.`,
        'Examiner les flux hors exploitation listés par le contrôle.',
      ]);
    }
    for (const j of journal.journaux) {
      if (!j.boucle) {
        anomalies.push([
          'A_TRAITER',
          j.numero,
          j.intitule,
          `Le journal de trésorerie ne boucle pas avec la balance (écart ${(j.soldeAReporter - j.soldeBalance).toFixed(2)}).`,
          'Vérifier les écritures du compte.',
        ]);
      }
    }
    const plusHaute = Math.max(0, ...eligibilite.categories.map((c) => c.montant));
    if (plusHaute > eligibilite.seuilParCategorieFcfa) {
      anomalies.push([
        'A_VERIFIER',
        'art. 6',
        'Éligibilité au S.M.T',
        `Une catégorie de ressources atteint ${plusHaute.toLocaleString('fr-FR')} · au-delà du seuil de ${eligibilite.seuilParCategorieFcfa.toLocaleString('fr-FR')} FCFA, sous réserve de la conversion monétaire (voir l'avertissement de l'écran Éligibilité).`,
        'Passer au Système normal (art. 5) dès le prochain exercice.',
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


  // =========================================================================
  // SYSCOHADA RÉVISÉ · SYSTÈME NORMAL (AUDCIF Titre IX)
  //
  // Même ARCHITECTURE que les exports SYCEBNL ci-dessus · même charte ETAFI,
  // même `construireFeuilleEtat`, mêmes règles (montants de détail en
  // VALEURS, totaux en FORMULES, contrôle discret sous le cadre, comptes non
  // rattachés jamais masqués). Et AUCUN contenu commun : autres postes,
  // autres codes, autres comptes, autres notes, autres articles. Le
  // cloisonnement des deux référentiels (CLAUDE.md §6) tient à ce que ces
  // méthodes ne lisent QUE les moteurs et les tables SYSCOHADA.
  // =========================================================================

  /**
   * Colonnes du bilan SYSCOHADA · « exercice N en BRUT, AMORT. et DÉPREC.,
   * NET · exercice N-1 en NET » à l'actif, N et N-1 en NET au passif
   * (Titre IX ch. 3 section 2). Ce sont les mêmes colonnes que le jeu
   * associations SYCEBNL, ce qui est une coïncidence de maquette et non un
   * partage : elles sont redéclarées ici pour qu'une évolution de l'une
   * n'emporte pas l'autre.
   */
  private static readonly GROUPES_ACTIF_SYSCOHADA: GroupeColonnes[] = [
    { titre: 'EXERCICE AU 31/12/N', sousTitres: ['BRUT', 'AMORT. et DEPREC.', 'NET'] },
    { titre: 'EXERCICE AU 31/12/N-1', sousTitres: ['NET'] },
  ];
  private static readonly GROUPES_NET_SYSCOHADA: GroupeColonnes[] = [
    { titre: 'EXERCICE AU 31/12/N', sousTitres: ['NET'] },
    { titre: 'EXERCICE AU 31/12/N-1', sousTitres: ['NET'] },
  ];

  /** Lignes ETAFI d'un côté du bilan SYSCOHADA. */
  private lignesBilanSyscohadaEtafi(
    postes: Awaited<ReturnType<EtatsFinanciersSyscohadaService['bilan']>>['actif'],
    actif: boolean,
  ): LigneEtatEtafi[] {
    return postes.map((p) => ({
      ref: p.ref,
      libelle: p.libelle,
      // Le moteur porte déjà le renvoi du modèle sur chaque poste ; la table
      // de mise en page ne sert que de filet (un poste ajouté au modèle sans
      // renvoi servi resterait annoté).
      note: p.note ?? NOTE_PAR_REF_SYSCOHADA[p.ref] ?? '',
      niveau: NIVEAUX_ETAT_SYSCOHADA[p.ref] ?? (p.estTotal ? 'inter' : 'normal'),
      montants: actif
        ? [
            p.brut ?? p.montant,
            p.amortissement ?? 0,
            // NET = BRUT - AMORT. et DÉPREC., en formule sur la ligne.
            { formule: 'D{r}-E{r}' },
            p.montantN1 ?? null,
          ]
        : [p.montant, p.montantN1 ?? null],
    }));
  }

  /**
   * Feuilles `Bilan-Actif` et `Bilan-Passif` du Système normal SYSCOHADA ·
   * modèle 2 du ch. 3 section 2 (« Bilan actif puis Bilan passif, une page
   * par côté »), titre officiel « BILAN AU 31 DÉCEMBRE N ».
   */
  private feuillesBilanSyscohadaEtafi(
    classeur: ExcelJS.Workbook,
    bilan: Awaited<ReturnType<EtatsFinanciersSyscohadaService['bilan']>>,
    ident: IdentiteLiasse,
  ): { rangsActif: Map<string, number>; rangsPassif: Map<string, number> } {
    const rangsActif = construireFeuilleEtat(classeur, {
      nom: 'Bilan-Actif',
      titre: 'BILAN AU 31 DECEMBRE N',
      taille: 16,
      ident,
      pageRef: 'BILAN SYSTEME NORMAL\nSYSCOHADA - PAGE 1/2',
      libelleColonne: 'ACTIF',
      groupes: ExportService.GROUPES_ACTIF_SYSCOHADA,
      lignes: this.lignesBilanSyscohadaEtafi(bilan.actif, true),
      totaux: TOTAUX_SYSCOHADA,
    });
    const rangsPassif = construireFeuilleEtat(classeur, {
      nom: 'Bilan-Passif',
      titre: 'BILAN AU 31 DECEMBRE N',
      taille: 16,
      ident,
      pageRef: 'BILAN SYSTEME NORMAL\nSYSCOHADA - PAGE 2/2',
      libelleColonne: 'PASSIF',
      groupes: ExportService.GROUPES_NET_SYSCOHADA,
      lignes: this.lignesBilanSyscohadaEtafi(bilan.passif, false),
      totaux: TOTAUX_SYSCOHADA,
    });
    return { rangsActif, rangsPassif };
  }

  /**
   * Ce que le bilan SYSCOHADA doit dire sous son cadre · l'équilibre, les
   * comptes de bilan qu'aucun poste du ch. 7 ne réclame (jamais masqués :
   * leur montant n'entre dans aucun total, il faut donc qu'il se voie), et
   * le double comptage du résultat quand les classes 6/7/8 ET le compte 13
   * portent tous deux un solde.
   */
  private controlesBilanSyscohada(bilan: Awaited<ReturnType<EtatsFinanciersSyscohadaService['bilan']>>): string {
    const equilibre = bilan.equilibre
      ? `Contrôle : bilan équilibré · actif = passif = ${bilan.totalActif.toLocaleString('fr-FR')}.`
      : `CONTRÔLE : DÉSÉQUILIBRE de ${(bilan.totalActif - bilan.totalPassif).toLocaleString('fr-FR')} entre actif et passif.`;
    const nonRattaches =
      bilan.comptesNonRattaches.length > 0
        ? ` ${bilan.comptesNonRattaches.length} compte(s) de bilan non rattaché(s) à un poste du tableau de correspondance officiel (Titre IX ch. 7), montants hors totaux : ` +
          bilan.comptesNonRattaches
            .slice(0, 6)
            .map((c) => c.numero)
            .join(', ') +
          (bilan.comptesNonRattaches.length > 6 ? '…' : '') +
          '.'
        : '';
    const doubleComptage = bilan.controle.doubleComptageProbable
      ? ` DOUBLE COMPTAGE PROBABLE du résultat : les classes 6/7/8 portent ${bilan.controle.resultatClasses678.toLocaleString('fr-FR')} et le compte 13 ${bilan.controle.resultatCompte13.toLocaleString('fr-FR')} · le CJ du bilan ne peut pas venir des deux à la fois.`
      : '';
    return equilibre + nonRattaches + doubleComptage;
  }

  /** Bilan SYSCOHADA · export individuel, charte ETAFI, valeurs seules. */
  async bilanSyscohadaExcel(tenantId: string, exerciceId: string): Promise<ClasseurExporte> {
    const [bilan, ident] = await Promise.all([
      this.syscohada.bilan(tenantId, exerciceId),
      this.identiteLiasse(tenantId, exerciceId),
    ]);
    const classeur = this.nouveauClasseur();
    const { rangsActif, rangsPassif } = this.feuillesBilanSyscohadaEtafi(classeur, bilan, ident);
    const controle = this.controlesBilanSyscohada(bilan);
    // Renvois de bas de poste du modèle (« (1) dont Placement en Net » sur AJ
    // et AK) · chaînes d'affichage, jamais des valeurs calculées : le ch. 7
    // ne donne aucune correspondance pour eux (anomalie n° 8 de la table).
    const renvois = [...bilan.actif, ...bilan.passif]
      .filter((p) => p.renvoi)
      .map((p) => `${p.ref} : ${p.renvoi}`)
      .join(' ');
    ligneControleSousEtat(
      classeur.getWorksheet('Bilan-Actif')!,
      Math.max(...rangsActif.values()) + 2,
      `${controle}${renvois ? ` ${renvois}` : ''}`,
    );
    ligneControleSousEtat(classeur.getWorksheet('Bilan-Passif')!, Math.max(...rangsPassif.values()) + 2, controle);
    numeroterPages(classeur);
    return {
      buffer: await this.versBuffer(classeur),
      nomFichier: `bilan-syscohada${await this.suffixeExercice(tenantId, exerciceId)}.xlsx`,
    };
  }

  /**
   * Feuille `Résultat` du Système normal SYSCOHADA · le modèle du ch. 4
   * section 2, postes de produits (T) et de charges (R) et soldes X
   * entrelacés dans l'ordre officiel
   * (le moteur les sert déjà ainsi, `ORDRE_AFFICHAGE_COMPTE_RESULTAT`).
   *
   * Le libellé d'un solde reprend la formule telle que le modèle l'imprime
   * (« MARGE COMMERCIALE (Somme TA à RB) ») ; la formule Excel posée dans la
   * cellule est la MÊME somme, écrite sur les refs (TOTAUX_SYSCOHADA). Les
   * charges étant servies en négatif, la somme se lit littéralement · ne
   * jamais soustraire deux fois (ch. 4, logique de signe).
   */
  private feuilleResultatSyscohadaEtafi(
    classeur: ExcelJS.Workbook,
    cr: Awaited<ReturnType<EtatsFinanciersSyscohadaService['compteDeResultat']>>,
    ident: IdentiteLiasse,
  ): Map<string, number> {
    const lignes: LigneEtatEtafi[] = cr.lignes.map((l) => ({
      ref: l.ref,
      libelle: l.estSolde && l.formuleOfficielle ? `${l.libelle} (${l.formuleOfficielle})` : l.libelle,
      note: NOTE_PAR_REF_SYSCOHADA[l.ref] ?? '',
      niveau: NIVEAUX_ETAT_SYSCOHADA[l.ref] ?? 'normal',
      montants: [l.montant, l.montantN1 ?? null],
    }));
    return construireFeuilleEtat(classeur, {
      nom: 'Résultat',
      titre: 'COMPTE DE RESULTAT AU 31 DECEMBRE N',
      taille: 14,
      ident,
      pageRef: 'COMPTE DE RESULTAT\nSYSTEME NORMAL SYSCOHADA',
      libelleColonne: 'LIBELLES',
      groupes: ExportService.GROUPES_NET_SYSCOHADA,
      lignes,
      totaux: TOTAUX_SYSCOHADA,
      largeurLibelle: 62,
    });
  }

  /** Compte de résultat SYSCOHADA · export individuel, charte ETAFI. */
  async compteDeResultatSyscohadaExcel(tenantId: string, exerciceId: string): Promise<ClasseurExporte> {
    const [cr, ident] = await Promise.all([
      this.syscohada.compteDeResultat(tenantId, exerciceId),
      this.identiteLiasse(tenantId, exerciceId),
    ]);
    const classeur = this.nouveauClasseur();
    const rangs = this.feuilleResultatSyscohadaEtafi(classeur, cr, ident);
    const nonRattaches =
      cr.comptesNonRattaches.length > 0
        ? ` ${cr.comptesNonRattaches.length} compte(s) de gestion hors poste officiel (montants hors totaux) : ` +
          cr.comptesNonRattaches
            .slice(0, 6)
            .map((c) => c.numero)
            .join(', ') +
          (cr.comptesNonRattaches.length > 6 ? '…' : '') +
          '.'
        : '';
    ligneControleSousEtat(
      classeur.getWorksheet('Résultat')!,
      Math.max(...rangs.values()) + 2,
      (cr.controle.coherent
        ? 'Contrôle : le résultat net (XI) recoupe le solde de TOUS les comptes de gestion, celui que le bilan loge en CJ.'
        : `CONTRÔLE : écart de ${cr.controle.ecart.toLocaleString('fr-FR')} entre le résultat net (XI) et le solde de toutes les classes de gestion.`) +
        nonRattaches,
    );
    numeroterPages(classeur);
    return {
      buffer: await this.versBuffer(classeur),
      nomFichier: `compte-de-resultat-syscohada${await this.suffixeExercice(tenantId, exerciceId)}.xlsx`,
    };
  }

  /**
   * Feuille `TFT` du Système normal SYSCOHADA · modèle du ch. 5 section 2 :
   * REF, LIBELLÉS, Note, EXERCICE N, EXERCICE N-1, et la colonne de droite
   * qui porte les clés A à H.
   *
   * La colonne NOTE est ouverte parce que le modèle l'énumère, et elle reste
   * VIDE : le ch. 5 n'attribue aucun renvoi de note annexe à une ligne du
   * tableau. Signalé sous le cadre plutôt que comblé par un renvoi inventé.
   *
   * La ligne « Variation du BF lié aux activités opérationnelles » du modèle
   * n'a PAS de code REF ([texte officiel]) : sa cellule REF reste vide et sa
   * formule se noue sur son rang, jamais sur un code qu'on lui aurait donné.
   */
  private feuilleTftSyscohadaEtafi(
    classeur: ExcelJS.Workbook,
    tft: Awaited<ReturnType<EtatsFinanciersSyscohadaService['tableauFluxTresorerie']>>,
    ident: IdentiteLiasse,
  ): { rangs: Map<string, number>; dernier: number } {
    const NB = 6;
    const rangs = new Map<string, number>();
    const ws = classeur.addWorksheet('TFT');
    ecrireCartouche(ws, ident, 'TABLEAU DES FLUX\nDE TRESORERIE - SYSCOHADA', NB);
    titreEtat(ws, 'TABLEAU DES FLUX DE TRESORERIE', 1, NB, 7, 14);
    let r = 8;
    for (const [i, h] of ['REF', 'LIBELLES', 'NOTE', 'EXERCICE N', 'EXERCICE N-1', 'Clé'].entries()) {
      ws.getCell(r, i + 1).value = h;
    }
    entetesBande(ws, r, r, 1, NB);
    ws.getRow(r).height = 22;

    let rangVariationBf = 0;
    for (const l of tft.lignes) {
      r += 1;
      ws.getRow(r).height = 22;
      if ('section' in l) {
        ws.getCell(r, 2).value = l.section;
        styleLigne(ws, r, 2, NB, 'bande', [4, 5]);
        styleLigne(ws, r, 1, 1, 'normal');
        continue;
      }
      if (l.ref) rangs.set(l.ref, r);
      else rangVariationBf = r;
      ws.getCell(r, 1).value = l.ref;
      ws.getCell(r, 2).value = l.libelle;
      ws.getCell(r, 4).value = l.montant;
      if (l.montantN1 !== undefined) ws.getCell(r, 5).value = l.montantN1;
      ws.getCell(r, 6).value = l.repere ?? REP_TFT_SYSCOHADA[l.ref] ?? '';
      styleLigne(ws, r, 1, NB, NIVEAUX_TFT_SYSCOHADA[l.ref] ?? (l.estTotal ? 'inter' : 'normal'), [4, 5], 1);
      for (const c of [3, 6]) ws.getCell(r, c).alignment = { horizontal: 'center', vertical: 'middle' };
    }

    // Totaux en FORMULES, comme partout ailleurs dans la liasse : la
    // hiérarchie du tableau se vérifie dans Excel et ZH ne peut pas diverger
    // de ZA + ZB + ZC + ZF. Les colonnes sont traitées séparément · la
    // colonne N-1 n'est écrite que si l'exercice antérieur existe, sinon une
    // somme de cellules vides afficherait un faux zéro.
    const colonnes: Array<[string, number]> = tft.exerciceN1Disponible
      ? [
          ['D', 4],
          ['E', 5],
        ]
      : [['D', 4]];
    for (const total of TOTAUX_FLUX_SYSCOHADA) {
      const rang = total.ref ? rangs.get(total.ref) : rangVariationBf;
      if (!rang) continue;
      for (const [lettre, col] of colonnes) {
        const termes = total.deRefs.map((ref) => (rangs.has(ref) ? `${lettre}${rangs.get(ref)}` : '0'));
        ws.getCell(rang, col).value = { formula: termes.join('+') };
      }
    }

    cadre(ws, 8, 1, r, NB, MOYEN);
    r += 2;
    ligneControleSousEtat(
      ws,
      r,
      'Méthode indirecte (Titre IX ch. 5 § 1.2.1 : « le point d’entrée est l’EBE, jamais le résultat net »). ' +
        'La colonne NOTE est celle du modèle ; le ch. 5 n’attribue aucun renvoi de note annexe aux lignes du tableau, ' +
        'elle reste donc vide. ' +
        RENVOI_1_TFT_SYSCOHADA,
    );
    largeurs(ws, { A: 5.5, B: 70, C: 6.5, D: 15.7, E: 15.7, F: 5.5 });
    ws.views = [{ state: 'frozen', ySplit: 8, showGridLines: false }];
    return { rangs, dernier: r };
  }

  /** Ce que le TFT SYSCOHADA doit dire sous son cadre. */
  private controlesTftSyscohada(
    tft: Awaited<ReturnType<EtatsFinanciersSyscohadaService['tableauFluxTresorerie']>>,
  ): string {
    const bouclage = tft.controle.coherent
      ? `Contrôle du modèle : ZH = Trésorerie actif N - Trésorerie passif N (BT - DT) = ${tft.controle.tresorerieClotureParBilan.toLocaleString('fr-FR')}.`
      : `CONTRÔLE : ZH par les flux (${tft.controle.tresorerieClotureParFlux.toLocaleString('fr-FR')}) diffère de BT - DT du bilan (${tft.controle.tresorerieClotureParBilan.toLocaleString('fr-FR')}) de ${tft.controle.ecart.toLocaleString('fr-FR')} · l'écart chiffre ce que la ventilation FA à FQ ne couvre pas, il n'est pas corrigé.`;
    const nonVentiles =
      tft.comptesNonVentiles.length > 0
        ? ` ${tft.comptesNonVentiles.length} compte(s) de trésorerie non ventilé(s) : ` +
          tft.comptesNonVentiles
            .slice(0, 6)
            .map((c) => c.numero)
            .join(', ') +
          (tft.comptesNonVentiles.length > 6 ? '…' : '') +
          '.'
        : '';
    const nonCalculables =
      tft.postesNonCalculables.length > 0
        ? ` Postes non calculables sur cet exercice : ${tft.postesNonCalculables.map((p) => p.ref).join(', ')}.`
        : '';
    return bouclage + nonVentiles + nonCalculables;
  }

  /** Tableau des flux de trésorerie SYSCOHADA · export individuel. */
  async tableauFluxTresorerieSyscohadaExcel(tenantId: string, exerciceId: string): Promise<ClasseurExporte> {
    const [tft, ident] = await Promise.all([
      this.syscohada.tableauFluxTresorerie(tenantId, exerciceId),
      this.identiteLiasse(tenantId, exerciceId),
    ]);
    const classeur = this.nouveauClasseur();
    const { dernier } = this.feuilleTftSyscohadaEtafi(classeur, tft, ident);
    ligneControleSousEtat(classeur.getWorksheet('TFT')!, dernier + 1, this.controlesTftSyscohada(tft));
    numeroterPages(classeur);
    return {
      buffer: await this.versBuffer(classeur),
      nomFichier: `tableau-flux-tresorerie-syscohada${await this.suffixeExercice(tenantId, exerciceId)}.xlsx`,
    };
  }

  /**
   * Découpage de la fiche récapitulative des notes SYSCOHADA · UNE seule
   * partie, et c'est voulu.
   *
   * Le jeu SYCEBNL découpe sa fiche en « Partie 1 : Informations générales »,
   * « Partie 2 : Notes sur le bilan », etc., parce que son texte le fait. Le
   * Titre IX ch. 6 section 2, lui, donne UNE liste continue de NOTE 1 à
   * NOTE 36 et ne la partitionne nulle part ; la fiche R4 du ch. 2 la reprend
   * telle quelle (« La liste des notes portée sur la fiche R4 est celle du
   * chapitre 6 »). Inventer des parties reviendrait à écrire une structure
   * que le texte n'a pas.
   *
   * Les codes viennent de `CODES_NOTES_CH6`, transcription des en-têtes du
   * ch. 6 : 46 codes pour 36 numéros de tête, la note 3 se subdivisant de 3A
   * à 3F (pas de 3G), la 15 en 15A et 15B (pas de 15C), la 16 en 16A, 16B,
   * « 16B bis » et 16C (pas de 16D), la 27 en 27A et 27B. Le « 16B bis » est
   * transcrit tel quel · [texte officiel] les NOTE 16B et NOTE 16B bis
   * portent le MÊME intitulé au ch. 6 et ne se distinguent que par leur
   * contenu.
   *
   * TOUTES les notes sont jointes, celles que l'exercice ne chiffre pas
   * portant la mention NEANT · même écart assumé qu'au SYCEBNL, et pour la
   * même raison. Le ch. 6 § 1.2 dit ici aussi que « les modèles de Notes non
   * documentés ne doivent pas être joints aux états financiers », et la
   * fiche R4 le répète en renvoi (1). La décision du cabinet (voir
   * `construireClasseurNotes`, qui la porte et la motive) est d'écarter ce
   * seul membre de phrase : une liasse à laquelle il manque des notes ne dit
   * pas au lecteur si elles étaient sans objet ou si on les a oubliées.
   */
  private static readonly PARTIES_NOTES_SYSCOHADA: Array<[string, string[]]> = [
    ['Liste officielle des Notes annexes · AUDCIF Titre IX ch. 6 section 2 (NOTE 1 à NOTE 36)', [...CODES_NOTES_CH6]],
  ];

  /** Notes annexes du Système normal SYSCOHADA · les 36 notes du ch. 6. */
  async notesSyscohadaExcel(tenantId: string, exerciceId: string): Promise<ClasseurExporte> {
    const [resultat, ident] = await Promise.all([
      this.noteAnnexeService.notesSyscohada(tenantId, exerciceId),
      this.identiteLiasse(tenantId, exerciceId),
    ]);
    const classeur = this.construireClasseurNotes(resultat, ident, ExportService.PARTIES_NOTES_SYSCOHADA);
    numeroterPages(classeur);
    return {
      buffer: await this.versBuffer(classeur),
      nomFichier: `notes-annexes-syscohada${await this.suffixeExercice(tenantId, exerciceId)}.xlsx`,
    };
  }

  // =========================================================================
  // SYSCOHADA RÉVISÉ · SYSTÈME MINIMAL DE TRÉSORERIE (AUDCIF Titre X)
  //
  // AUCUN CODE REF n'est imprimé sur ces états, et c'est délibéré : le
  // Titre X ch. 2 n'en donne aucun (à la différence du Titre IX, dont les
  // codes AD à DZ et TA à XI sont officiels, et à la différence du SMT
  // SYCEBNL, dont les GA à HZ le sont aussi). Les refs SA1, SP4, SR1, SG…
  // sont des clés INTERNES d'OmegaX, stables mais sans valeur normative :
  // les afficher dans un état déposé les ferait passer pour officielles.
  // Elles restent dans le logiciel, la maquette imprimée reste celle du
  // texte · rubrique, note, montants (et la lettre A à G au compte de
  // résultat, que la maquette, elle, imprime).
  // =========================================================================

  /**
   * Feuilles `Bilan-Actif` et `Bilan-Passif` du SMT SYSCOHADA · maquette du
   * Titre X ch. 2 section 1 : rubrique, NOTE, Exercice N, Exercice N-1, puis
   * « Total actif » / « Total passif » en formule de somme.
   */
  private feuillesBilanSmtSyscohadaEtafi(
    classeur: ExcelJS.Workbook,
    bilan: Awaited<ReturnType<EtatsFinanciersSmtSyscohadaService['bilan']>>,
    ident: IdentiteLiasse,
  ): { rangsActif: Map<string, number>; rangsPassif: Map<string, number> } {
    const NB = 4;
    const construire = (
      nom: string,
      cote: 'ACTIF' | 'PASSIF',
      postes: typeof bilan.actif,
      page: string,
      renvoi: string,
    ): Map<string, number> => {
      const ws = classeur.addWorksheet(nom);
      ecrireCartouche(ws, ident, `BILAN SMT SYSCOHADA\n${page}`, NB);
      titreEtat(ws, 'BILAN SMT AU 31 DECEMBRE N', 1, NB, 7, 16);
      let r = 8;
      for (const [i, h] of [cote, 'NOTE', 'EXERCICE N', 'EXERCICE N-1'].entries()) ws.getCell(r, i + 1).value = h;
      entetesBande(ws, r, r, 1, NB);
      ws.getRow(r).height = 22;
      const premiere = r + 1;
      const rangs = new Map<string, number>();
      for (const p of postes) {
        // Le total du moteur est refait en formule en pied de tableau : il
        // doit se recalculer dans Excel, pas être recopié.
        if (p.estTotal) continue;
        r += 1;
        rangs.set(p.ref, r);
        ws.getCell(r, 1).value = p.libelle;
        ws.getCell(r, 2).value = p.note ?? '';
        ws.getCell(r, 3).value = p.montant;
        if (p.montantN1 !== undefined) ws.getCell(r, 4).value = p.montantN1;
        styleLigne(ws, r, 1, NB, 'normal', [3, 4]);
        ws.getCell(r, 2).alignment = { horizontal: 'center', vertical: 'middle' };
        ws.getRow(r).height = 22;
      }
      const total = postes.find((p) => p.estTotal);
      r += 1;
      if (total) rangs.set(total.ref, r);
      ws.getCell(r, 1).value = total?.libelle ?? (cote === 'ACTIF' ? 'Total actif' : 'Total passif');
      ws.getCell(r, 3).value = { formula: `SUM(C${premiere}:C${r - 1})` };
      ws.getCell(r, 4).value = { formula: `SUM(D${premiere}:D${r - 1})` };
      styleLigne(ws, r, 1, NB, 'general', [3, 4]);
      ws.getRow(r).height = 22;
      cadre(ws, 8, 1, r, NB, MOYEN);
      ligneControleSousEtat(ws, r + 2, renvoi);
      largeurs(ws, { A: 54, B: 7, C: 17, D: 17 });
      ws.views = [{ state: 'frozen', ySplit: 8, showGridLines: false }];
      return rangs;
    };
    const rangsActif = construire('Bilan-Actif', 'ACTIF', bilan.actif, 'PAGE 1/2', bilan.renvoiImmobilisations);
    const rangsPassif = construire(
      'Bilan-Passif',
      'PASSIF',
      bilan.passif,
      'PAGE 2/2',
      "Le poste « Banque (en + ou en –) » figure à l'ACTIF et peut être négatif : le bilan SMT n'ouvre aucun poste de banques créditrices au passif (Titre X ch. 2 § 1).",
    );
    return { rangsActif, rangsPassif };
  }

  /** Bilan SMT SYSCOHADA · export individuel. */
  async bilanSmtSyscohadaExcel(tenantId: string, exerciceId: string): Promise<ClasseurExporte> {
    const [bilan, ident] = await Promise.all([
      this.smtSyscohada.bilan(tenantId, exerciceId),
      this.identiteLiasse(tenantId, exerciceId),
    ]);
    const classeur = this.nouveauClasseur();
    const { rangsActif, rangsPassif } = this.feuillesBilanSmtSyscohadaEtafi(classeur, bilan, ident);
    const controle = bilan.equilibre
      ? `Contrôle : bilan équilibré · actif = passif = ${bilan.totalActif.toLocaleString('fr-FR')}.`
      : `CONTRÔLE : DÉSÉQUILIBRE de ${(bilan.totalActif - bilan.totalPassif).toLocaleString('fr-FR')} entre actif et passif.`;
    const nonRattaches =
      bilan.comptesNonRattaches.length > 0
        ? ` ${bilan.comptesNonRattaches.length} compte(s) de bilan hors maquette SMT : ` +
          bilan.comptesNonRattaches
            .slice(0, 6)
            .map((c) => c.numero)
            .join(', ') +
          '.'
        : '';
    ligneControleSousEtat(classeur.getWorksheet('Bilan-Actif')!, Math.max(...rangsActif.values()) + 3, controle + nonRattaches);
    ligneControleSousEtat(classeur.getWorksheet('Bilan-Passif')!, Math.max(...rangsPassif.values()) + 3, controle);
    numeroterPages(classeur);
    return {
      buffer: await this.versBuffer(classeur),
      nomFichier: `bilan-smt-syscohada${await this.suffixeExercice(tenantId, exerciceId)}.xlsx`,
    };
  }

  /**
   * Feuille `Résultat` du SMT SYSCOHADA · maquette du Titre X ch. 2
   * section 2 : Rubriques, Note, Exercice N, Exercice N-1, et la lettre que
   * la maquette imprime en regard des lignes de total et de solde.
   *
   * A et B sont des SOMMES, donc des formules Excel de somme. C = A - B se
   * pose de même. G, en revanche, est la formule SIGNÉE G = C - D + E - F,
   * dont l'unique implémentation est `calculerResultatSmt` : la formule
   * Excel ne la réinvente pas, elle lit la composition de D et de E dans la
   * table (`LETTRES_D_E_SMT_SYSCOHADA`), qui est la lecture fixée pour
   * l'anomalie n° 1 (la maquette invoque D et E dans sa formule sans les
   * attribuer à aucune ligne).
   */
  private feuilleResultatSmtSyscohadaEtafi(
    classeur: ExcelJS.Workbook,
    cr: Awaited<ReturnType<EtatsFinanciersSmtSyscohadaService['compteDeResultat']>>,
    ident: IdentiteLiasse,
  ): Map<string, number> {
    const NB = 5;
    const ws = classeur.addWorksheet('Résultat');
    ecrireCartouche(ws, ident, 'COMPTE DE RESULTAT\nSMT SYSCOHADA', NB);
    titreEtat(ws, 'COMPTE DE RESULTAT SMT AU 31 DECEMBRE N', 1, NB, 7, 14);
    let r = 8;
    for (const [i, h] of ['RUBRIQUES', 'NOTE', 'EXERCICE N', 'EXERCICE N-1', 'Lettre'].entries()) {
      ws.getCell(r, i + 1).value = h;
    }
    entetesBande(ws, r, r, 1, NB);
    ws.getRow(r).height = 22;

    const NIVEAUX: Record<string, NiveauLigne> = { SRA: 'inter', SDB: 'inter', SC: 'section', SG: 'general' };
    const rangs = new Map<string, number>();
    for (const l of cr.lignes) {
      r += 1;
      rangs.set(l.ref, r);
      ws.getCell(r, 1).value = l.libelle;
      ws.getCell(r, 2).value = l.note ?? '';
      if (!l.estTotal) ws.getCell(r, 3).value = l.montant;
      if (!l.estTotal && l.montantN1 !== undefined) ws.getCell(r, 4).value = l.montantN1;
      ws.getCell(r, 5).value = l.lettre ?? '';
      styleLigne(ws, r, 1, NB, NIVEAUX[l.ref] ?? 'normal', [3, 4]);
      for (const c of [2, 5]) ws.getCell(r, c).alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getRow(r).height = 22;
    }

    const colonnes: Array<[string, number]> = cr.exerciceN1Disponible
      ? [
          ['C', 3],
          ['D', 4],
        ]
      : [['C', 3]];
    const cellule = (lettre: string, ref: string) => `${lettre}${rangs.get(ref)}`;
    for (const [lettre, col] of colonnes) {
      ws.getCell(rangs.get('SRA')!, col).value = {
        formula: cr.recettes.map((p) => cellule(lettre, p.ref)).join('+'),
      };
      ws.getCell(rangs.get('SDB')!, col).value = {
        formula: cr.depenses.map((p) => cellule(lettre, p.ref)).join('+'),
      };
      ws.getCell(rangs.get('SC')!, col).value = {
        formula: `${cellule(lettre, 'SRA')}-${cellule(lettre, 'SDB')}`,
      };
      const d = LETTRES_D_E_SMT_SYSCOHADA.D.map((ref) => cellule(lettre, ref)).join('+');
      const e = LETTRES_D_E_SMT_SYSCOHADA.E.map((ref) => cellule(lettre, ref)).join('+');
      ws.getCell(rangs.get('SG')!, col).value = {
        formula: `${cellule(lettre, 'SC')}-(${d})+(${e})-${cellule(lettre, 'SF')}`,
      };
    }

    cadre(ws, 8, 1, r, NB, MOYEN);
    ligneControleSousEtat(
      ws,
      r + 2,
      "Comptabilité de trésorerie corrigée des variations d'inventaire et des amortissements (Titre X ch. 2 § 2), " +
        'formule officielle G = C - D + E - F, avec C = A - B. ANOMALIE DU TEXTE, signalée et non corrigée : la maquette ' +
        "invoque D et E sans les attribuer à aucune ligne · D regroupe ici les corrections soustraites (stocks, créances) " +
        "et E la correction ajoutée (dettes d'exploitation). La « Variation N / N-1 » est prise dans le sens (N-1) - N, " +
        'celui du compte 603.',
    );
    largeurs(ws, { A: 58, B: 7, C: 17, D: 17, E: 8 });
    ws.views = [{ state: 'frozen', ySplit: 8, showGridLines: false }];
    return rangs;
  }

  /** Compte de résultat SMT SYSCOHADA · export individuel. */
  async compteDeResultatSmtSyscohadaExcel(tenantId: string, exerciceId: string): Promise<ClasseurExporte> {
    const [cr, ident] = await Promise.all([
      this.smtSyscohada.compteDeResultat(tenantId, exerciceId),
      this.identiteLiasse(tenantId, exerciceId),
    ]);
    const classeur = this.nouveauClasseur();
    const rangs = this.feuilleResultatSmtSyscohadaEtafi(classeur, cr, ident);
    ligneControleSousEtat(
      classeur.getWorksheet('Résultat')!,
      Math.max(...rangs.values()) + 4,
      cr.controle.concordant
        ? 'Contrôle : le résultat G recoupe le résultat logé au bilan (poste « Résultat exercice »).'
        : `CONTRÔLE : écart de ${cr.controle.ecart.toLocaleString('fr-FR')} avec le résultat du bilan · voir les flux de trésorerie hors résultat (financement, investissement) que le compte de résultat SMT écarte.`,
    );
    numeroterPages(classeur);
    return {
      buffer: await this.versBuffer(classeur),
      nomFichier: `compte-de-resultat-smt-syscohada${await this.suffixeExercice(tenantId, exerciceId)}.xlsx`,
    };
  }

  /**
   * NOTE 4 · JOURNAL DE TRÉSORERIE SMT SYSCOHADA (Titre X ch. 3), un journal
   * PAR COMPTE de trésorerie (« NB : prévoir un journal par banque et un
   * journal pour la caisse »), ouvert sur son report à nouveau et clos sur
   * son solde à reporter, solde progressif en formules.
   */
  private feuilleJournalTresorerieSmtSyscohadaEtafi(
    classeur: ExcelJS.Workbook,
    journal: Awaited<ReturnType<EtatsFinanciersSmtSyscohadaService['journalTresorerie']>>,
    ident: IdentiteLiasse,
    nomFeuille = 'NOTE 4 JOURNAL TRESORERIE',
  ) {
    const ws = classeur.addWorksheet(nomFeuille);
    const colonnes = [...journal.colonnesRecettes, ...journal.colonnesDepenses];
    const ncols = 5 + colonnes.length;
    ecrireCartouche(ws, ident, 'NOTE 4\nSMT SYSCOHADA', ncols);
    titreNote(ws, 'NOTE 4 : JOURNAL DE TRESORERIE SMT', ncols);
    let r = 7;
    for (const j of journal.journaux) {
      r += 1;
      const c = ws.getCell(r, 1);
      c.value = `${j.numero} · ${j.intitule}`;
      c.font = { name: 'Arial', size: 9, bold: true };
      fusion(ws, r, 1, r, ncols);
      r += 1;
      for (const [i, h] of ['Date', 'Libellés', 'Recettes', 'Dépenses', 'Solde'].entries()) {
        ws.getCell(r, i + 1).value = h;
      }
      colonnes.forEach((col, i) => {
        ws.getCell(r, 6 + i).value = col.rajoutAutorise ? `${col.libelle} (rajout NB)` : col.libelle;
      });
      entetesBande(ws, r, r, 1, ncols);
      ws.getRow(r).height = 30;
      const debutTableau = r;
      r += 1;
      ws.getCell(r, 2).value = 'Report à nouveau';
      ws.getCell(r, 5).value = j.reportANouveau;
      styleLigne(ws, r, 1, ncols, 'rubrique', [3, 4, 5]);
      const colsMontant = [3, 4, 5, ...colonnes.map((_, i) => 6 + i)];
      for (const operation of j.operations) {
        r += 1;
        ws.getCell(r, 1).value = new Date(operation.date);
        ws.getCell(r, 1).numFmt = 'DD/MM/YYYY';
        ws.getCell(r, 2).value = operation.virementInterne
          ? `${operation.libelle} (virement interne)`
          : operation.libelle;
        if (operation.recette) ws.getCell(r, 3).value = operation.recette;
        if (operation.depense) ws.getCell(r, 4).value = operation.depense;
        ws.getCell(r, 5).value = { formula: `E${r - 1}+C${r}-D${r}` };
        colonnes.forEach((col, i) => {
          const v = operation.ventilation[col.cle];
          if (v) ws.getCell(r, 6 + i).value = v;
        });
        styleLigne(ws, r, 1, ncols, 'normal', colsMontant);
      }
      r += 1;
      ws.getCell(r, 2).value = 'Solde à reporter';
      ws.getCell(r, 5).value = { formula: `E${r - 1}` };
      styleLigne(ws, r, 1, ncols, 'inter', [3, 4, 5]);
      cadre(ws, debutTableau, 1, r, ncols, MOYEN);
      if (!j.boucle) {
        r += 1;
        ligneControleSousEtat(
          ws,
          r,
          `CONTRÔLE : le solde à reporter diverge du solde balance du compte (${j.soldeBalance.toLocaleString('fr-FR')}).`,
        );
      }
      if (j.lignesNonVentilees > 0) {
        r += 1;
        ligneControleSousEtat(
          ws,
          r,
          `${j.lignesNonVentilees} opération(s) touchant plusieurs comptes de trésorerie : comptées en Recettes, Dépenses et Solde, laissées hors ventilation faute de clé de répartition portée par l'écriture.`,
        );
      }
      r += 1; // une ligne d'air entre deux journaux
    }
    if (journal.journaux.length === 0) {
      r += 1;
      ligneControleSousEtat(ws, r, 'Aucun compte de trésorerie mouvementé sur cet exercice.');
    }
    r += 1;
    ligneControleSousEtat(ws, r, journal.nb);
    const spec: Record<string, number> = { A: 11, B: 32, C: 13, D: 13, E: 13 };
    colonnes.forEach((_, i) => {
      spec[String.fromCharCode(70 + i)] = 14;
    });
    largeurs(ws, spec);
    return ws;
  }

  /** Journal de trésorerie SMT SYSCOHADA · export individuel (la NOTE 4 seule). */
  async journalTresorerieSmtSyscohadaExcel(tenantId: string, exerciceId: string): Promise<ClasseurExporte> {
    const [journal, ident] = await Promise.all([
      this.smtSyscohada.journalTresorerie(tenantId, exerciceId),
      this.identiteLiasse(tenantId, exerciceId),
    ]);
    const classeur = this.nouveauClasseur();
    this.feuilleJournalTresorerieSmtSyscohadaEtafi(classeur, journal, ident);
    numeroterPages(classeur);
    return {
      buffer: await this.versBuffer(classeur),
      nomFichier: `journal-tresorerie-smt-syscohada${await this.suffixeExercice(tenantId, exerciceId)}.xlsx`,
    };
  }

  /**
   * Les NOTES 1, 2 et 3 du SMT SYSCOHADA (Titre X ch. 3), chacune sur sa
   * feuille et dans la maquette du texte, remplies des données réelles du
   * dossier. Une note qu'aucune ligne ne chiffre porte la bande NEANT
   * plutôt qu'une grille réduite à son total.
   */
  private feuillesNotesSmtSyscohadaEtafi(
    classeur: ExcelJS.Workbook,
    donnees: {
      note1: Awaited<ReturnType<EtatsFinanciersSmtSyscohadaService['note1MaterielMobilierCautions']>>;
      note2: Awaited<ReturnType<EtatsFinanciersSmtSyscohadaService['note2Stocks']>>;
      note3: Awaited<ReturnType<EtatsFinanciersSmtSyscohadaService['note3CreancesDettes']>>;
    },
    ident: IdentiteLiasse,
  ) {
    const { note1, note2, note3 } = donnees;

    // --- NOTE 1 · matériel, mobilier ET CAUTIONS --------------------------
    {
      const NB = 5;
      const ws = classeur.addWorksheet('NOTE 1 MATERIEL-CAUTIONS');
      ecrireCartouche(ws, ident, 'NOTE 1\nSMT SYSCOHADA', NB);
      titreNote(ws, 'NOTE 1 : TABLEAU SMT DE SUIVI DU MATERIEL, DU MOBILIER ET DES CAUTIONS', NB);
      let r = 8;
      for (const [i, h] of ['Date', 'Désignation', 'Montant', 'Date de sortie', 'Prix de cession'].entries()) {
        ws.getCell(r, i + 1).value = h;
      }
      entetesBande(ws, r, r, 1, NB);
      ws.getRow(r).height = 26;
      if (note1.lignes.length === 0) r = bandeNeant(ws, r + 1, NB) - 1;
      for (const l of note1.lignes) {
        r += 1;
        if (l.date) {
          ws.getCell(r, 1).value = new Date(l.date);
          ws.getCell(r, 1).numFmt = 'DD/MM/YYYY';
        }
        ws.getCell(r, 2).value = l.designation;
        ws.getCell(r, 3).value = l.montant;
        if (l.dateSortie) {
          ws.getCell(r, 4).value = new Date(l.dateSortie);
          ws.getCell(r, 4).numFmt = 'DD/MM/YYYY';
        }
        if (l.prixCession !== null && l.prixCession !== undefined) ws.getCell(r, 5).value = l.prixCession;
        styleLigne(ws, r, 1, NB, 'normal', [3, 5]);
        // Une caution relevée au compte 275 n'a ni date d'entrée ni prix de
        // cession : l'origine est portée en commentaire de cellule plutôt
        // que par une date inventée.
        if (l.origine === 'BALANCE') ws.getCell(r, 2).note = note1.motifCautions;
      }
      r += 1;
      ws.getCell(r, 2).value = 'TOTAL';
      ws.getCell(r, 3).value = note1.total;
      styleLigne(ws, r, 1, NB, 'inter', [3]);
      cadre(ws, 8, 1, r, NB, MOYEN);
      ligneControleSousEtat(
        ws,
        r + 2,
        `Registre des immobilisations (${note1.totalRegistre.toLocaleString('fr-FR')}) et cautions relevées au compte 275 (${note1.totalCautions.toLocaleString('fr-FR')}). ` +
          `Amortissement ${note1.amortissement.mode.toLowerCase()}${note1.amortissement.prorataTemporis ? '' : ' sans prorata temporis'} (Titre X ch. 1 § 1). ${note1.motifCautions}`,
      );
      largeurs(ws, { A: 15, B: 52, C: 17, D: 15, E: 17 });
    }

    // --- NOTE 2 · état des stocks ----------------------------------------
    {
      const NB = 5;
      const ws = classeur.addWorksheet('NOTE 2 STOCKS');
      ecrireCartouche(ws, ident, 'NOTE 2\nSMT SYSCOHADA', NB);
      titreNote(ws, 'NOTE 2 : ETAT DES STOCKS AU 31 DECEMBRE', NB);
      let r = 8;
      for (const [i, h] of ['Référence', 'Désignation', 'Quantité', 'Prix unitaire', 'Montant'].entries()) {
        ws.getCell(r, i + 1).value = h;
      }
      entetesBande(ws, r, r, 1, NB);
      ws.getRow(r).height = 26;
      if (note2.lignes.length === 0) r = bandeNeant(ws, r + 1, NB) - 1;
      for (const l of note2.lignes) {
        r += 1;
        ws.getCell(r, 1).value = l.reference;
        ws.getCell(r, 2).value = l.designation;
        // Quantité et prix unitaire restent VIDES : OmegaX ne tient pas
        // d'inventaire physique, et un « 1 » laisserait croire le contraire.
        ws.getCell(r, 5).value = l.montant;
        styleLigne(ws, r, 1, NB, 'normal', [4, 5]);
      }
      for (const [libelle, montant] of [
        [note2.lignesSynthese[0], note2.valeurStockFinal],
        [note2.lignesSynthese[1], note2.valeurStockInitial],
      ] as Array<[string, number]>) {
        r += 1;
        ws.getCell(r, 2).value = libelle;
        ws.getCell(r, 5).value = montant;
        styleLigne(ws, r, 1, NB, 'inter', [5]);
      }
      cadre(ws, 8, 1, r, NB, MOYEN);
      ligneControleSousEtat(
        ws,
        r + 2,
        `Variation portée au compte de résultat (ligne « Variation des stocks N / N-1 ») : ${note2.variationSv1.toLocaleString('fr-FR')}, sens (N-1) - N. ${note2.motifQuantites}`,
      );
      largeurs(ws, { A: 14, B: 48, C: 12, D: 15, E: 17 });
    }

    // --- NOTE 3 · créances et dettes non échues ---------------------------
    {
      const NB = 5;
      const ws = classeur.addWorksheet('NOTE 3 CREANCES-DETTES');
      ecrireCartouche(ws, ident, 'NOTE 3\nSMT SYSCOHADA', NB);
      titreNote(ws, 'NOTE 3 : ETAT DES CREANCES ET DES DETTES NON ECHUES AU 31 DECEMBRE', NB);
      let r = 7;
      // DEUX tableaux, chacun avec ses colonnes et sa ligne de total · le
      // ch. 3 les donne séparément (« Nom du client » / « Nom du
      // fournisseur »), les fondre en un seul inventerait un libellé.
      const tableau = (
        intitule: string,
        nomColonne: string,
        lignes: typeof note3.creances,
        libelleTotal: string,
        total: number,
      ) => {
        r += 1;
        const c = ws.getCell(r, 1);
        c.value = intitule;
        c.font = { name: 'Arial', size: 9, bold: true };
        fusion(ws, r, 1, r, NB);
        r += 1;
        const debut = r;
        for (const [i, h] of [
          'Date',
          nomColonne,
          'Montant au 31 décembre',
          'Montant au 1er janvier',
          'Variation %',
        ].entries()) {
          ws.getCell(r, i + 1).value = h;
        }
        entetesBande(ws, r, r, 1, NB);
        ws.getRow(r).height = 30;
        if (lignes.length === 0) r = bandeNeant(ws, r + 1, NB) - 1;
        for (const l of lignes) {
          r += 1;
          // Colonne « Date » laissée vide : un compte de tiers agrège des
          // pièces de dates différentes (le détail est au journal de suivi).
          ws.getCell(r, 2).value = `${l.numero} ${l.nom}`;
          ws.getCell(r, 3).value = l.montantCloture;
          ws.getCell(r, 4).value = l.montantOuverture;
          styleLigne(ws, r, 1, NB, 'normal', [3, 4]);
          if (l.variationPourcent !== null && l.variationPourcent !== undefined) {
            ws.getCell(r, 5).value = l.variationPourcent;
            ws.getCell(r, 5).numFmt = '#,##0.00"%"';
          }
          ws.getCell(r, 5).note = `Variation EN VALEUR portée au compte de résultat : ${l.variationValeur.toFixed(2)} (sens (N-1) - N).`;
        }
        r += 1;
        ws.getCell(r, 2).value = libelleTotal;
        ws.getCell(r, 3).value = total;
        styleLigne(ws, r, 1, NB, 'inter', [3]);
        cadre(ws, debut, 1, r, NB, MOYEN);
        r += 1;
      };
      tableau('Créances', 'Nom du client', note3.creances, 'TOTAL DES CRÉANCES', note3.totalCreances);
      tableau('Dettes', 'Nom du fournisseur', note3.dettes, 'TOTAL DES DETTES', note3.totalDettes);
      ligneControleSousEtat(
        ws,
        r + 1,
        `Variations portées au compte de résultat : créances ${note3.variationSv2.toLocaleString('fr-FR')}, dettes ${note3.variationSv3.toLocaleString('fr-FR')}. ${note3.reserveVariationPourcent}`,
      );
      largeurs(ws, { A: 13, B: 46, C: 19, D: 19, E: 13 });
    }
  }

  /**
   * Fiche NOTES ANNEXES du SMT SYSCOHADA · les quatre notes du ch. 3,
   * rangées selon l'état qu'elles détaillent. La NOTE 4 y figure bien que le
   * ch. 1 § 2 ne l'énumère pas parmi les composantes des Notes annexes :
   * le ch. 3 la NUMÉROTE comme note et le compte de résultat y renvoie en
   * colonne « Note ». Anomalie du texte, signalée dans la table.
   */
  private ficheNotesSmtSyscohadaEtafi(
    classeur: ExcelJS.Workbook,
    fiche: ReturnType<EtatsFinanciersSmtSyscohadaService['ficheNotes']>,
    ident: IdentiteLiasse,
  ): PartiesNotes {
    const parties: PartiesNotes = [
      [
        'Notes sur le bilan (Titre X ch. 3)',
        fiche.notes
          .filter((n) => n.partie === 'BILAN')
          .map((n) => [`NOTE ${n.numero}`, n.intitule] as [string, string]),
      ],
      [
        'Notes sur le compte de résultat (Titre X ch. 3)',
        fiche.notes
          .filter((n) => n.partie !== 'BILAN')
          .map((n) => [`NOTE ${n.numero}`, n.intitule] as [string, string]),
      ],
      [
        'Pièces de suivi non numérotées comme notes (Titre X ch. 1 § 1 et ch. 3)',
        fiche.journauxDeSuivi.map((j) => [j.intitule, j.colonnes.join(' · ')] as [string, string]),
      ],
    ];
    construireFicheNotes(
      classeur,
      parties,
      ident,
      undefined,
      'NOTES ANNEXES',
      "Inventaire extra-comptable de fin d'exercice exigé par le Titre X ch. 1 § 1 : " +
        `${fiche.inventaireExtraComptable.join(' · ')}. Chaque immobilisation fait l'objet d'un tableau d'amortissement ` +
        `${fiche.amortissement.mode.toLowerCase()}${fiche.amortissement.prorataTemporis ? '' : ' sans prorata temporis'}.`,
    );
    return parties;
  }

  /** Notes annexes SMT SYSCOHADA · export individuel : fiche + notes 1 à 4. */
  async notesSmtSyscohadaExcel(tenantId: string, exerciceId: string): Promise<ClasseurExporte> {
    const [ident, note1, note2, note3, journal] = await Promise.all([
      this.identiteLiasse(tenantId, exerciceId),
      this.smtSyscohada.note1MaterielMobilierCautions(tenantId, exerciceId),
      this.smtSyscohada.note2Stocks(tenantId, exerciceId),
      this.smtSyscohada.note3CreancesDettes(tenantId, exerciceId),
      this.smtSyscohada.journalTresorerie(tenantId, exerciceId),
    ]);
    const classeur = this.nouveauClasseur();
    this.ficheNotesSmtSyscohadaEtafi(classeur, this.smtSyscohada.ficheNotes(), ident);
    this.feuillesNotesSmtSyscohadaEtafi(classeur, { note1, note2, note3 }, ident);
    this.feuilleJournalTresorerieSmtSyscohadaEtafi(classeur, journal, ident);
    numeroterPages(classeur);
    return {
      buffer: await this.versBuffer(classeur),
      nomFichier: `notes-annexes-smt-syscohada${await this.suffixeExercice(tenantId, exerciceId)}.xlsx`,
    };
  }

  /**
   * LIASSE COMPLÈTE du SYSTÈME NORMAL SYSCOHADA · le classeur entier,
   * dans l'ordre du modèle ETAFI : BALANCE N, BALANCE N-1, CONTROLE BALANCE,
   * Couverture, Garde, Fiche 1, Fiche 2, Bilan paysage, Bilan-Actif,
   * Bilan-Passif, Résultat, TFT, NOTES ANNEXES, les 36 notes, TABLE
   * COMMENTAIRE, CONTROLES, ANOMALIES.
   *
   * L'ordre des quatre états est celui de l'art. 8 : « Un jeu complet d'états
   * financiers annuels comprend le Bilan, le Compte de résultat, le Tableau
   * des flux de trésorerie ainsi que les Notes annexes », qui « forment un
   * tout indissociable ». C'est pourquoi la liasse est le seul export qui les
   * réunit tous, et pourquoi aucune de ses feuilles n'est optionnelle.
   */
  private async liasseSyscohadaEtafi(tenantId: string, exerciceId: string): Promise<ExcelJS.Workbook> {
    const [ident, tenant, bilan, cr, tft, notes, exerciceN1Id] = await Promise.all([
      this.identiteLiasse(tenantId, exerciceId),
      this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
      this.syscohada.bilan(tenantId, exerciceId),
      this.syscohada.compteDeResultat(tenantId, exerciceId),
      this.syscohada.tableauFluxTresorerie(tenantId, exerciceId),
      this.noteAnnexeService.notesSyscohada(tenantId, exerciceId),
      this.exerciceN1Id(tenantId, exerciceId),
    ]);
    const lignesBalN = await this.lignesBalanceLiasse(tenantId, exerciceId);
    const lignesBalN1 = exerciceN1Id ? await this.lignesBalanceLiasse(tenantId, exerciceN1Id) : [];

    const classeur = this.nouveauClasseur();

    // 1-3 · balances et leur contrôle d'équilibre.
    ecrireFeuilleBalance(classeur, NOM_BALANCE, lignesBalN);
    if (exerciceN1Id) ecrireFeuilleBalance(classeur, NOM_BALANCE_N1, lignesBalN1);
    construireControleBalance(classeur, Boolean(exerciceN1Id), lignesBalN.length, lignesBalN1.length);

    // 4-7 · pages d'identification (Titre IX ch. 2 : page de garde,
    // fiches R1 à R4).
    construireCouverture(classeur, ident, 'LIASSE SYSTEME NORMAL', tenant.pays ?? '');
    construireGarde(classeur, ident, {
      bandeau: 'ETATS FINANCIERS NORMALISES\nDU SYSTEME COMPTABLE OHADA (SYSCOHADA)',
      // AUDCIF art. 2 · le champ d'application, dit par le texte plutôt que
      // par une formule de circonstance. L'art. 5 en exclut expressément les
      // entités à but non lucratif, qui relèvent du SYCEBNL.
      sousBandeau: 'Entités astreintes à la comptabilité financière (AUDCIF art. 2)',
      systeme: 'SYSTEME NORMAL',
      // Liste exacte des « Documents déposés » de la page de garde du ch. 2.
      documents: [
        "Fiche d'identification et renseignements divers",
        'Bilan',
        'Compte de résultat',
        'Tableau des flux de trésorerie',
        'Notes annexes',
      ],
    });
    construireFiche1(classeur, ident, 'SYSCOHADA', 'Système normal', {
      // Une société commerciale EST immatriculée au RCCM, et l'AUDCG art. 14
      // impose d'en porter le numéro sur les livres de commerce. La case ZE
      // du gabarit ETAFI est celle du numéro de registre.
      //
      // ÉCART DE CODIFICATION, signalé et non corrigé : la fiche R1 de
      // l'AUDCIF (Titre IX ch. 2) code le registre en ZD (« Greffe ; n°
      // Registre du Commerce ; n° Répertoire des entreprises ») et réserve
      // ZE au « n° de caisse sociale, n° Code Importateur, code activité
      // principale ». Les lettres du gabarit ETAFI, reprises d'une liasse
      // fiscale réelle, ne coïncident donc pas avec celles de la fiche R1.
      // Le gabarit est conservé tel quel · c'est lui qui fait la
      // présentation de toute la liasse, et le LIBELLÉ de la case dit ce
      // qu'elle contient. Ne pas lire ZE ici comme le ZE de la fiche R1.
      ZE: tenant.rccm ?? '',
    });
    construireFiche2(classeur, ident, 'DIRIGEANTS');

    // 8 · Bilan paysage · c'est le « Modèle 1 » du ch. 3 section 2 (actif et
    // passif en vis-à-vis), les deux modèles portant « les mêmes rubriques,
    // les mêmes codes et les mêmes renvois de notes ». Les rangs des feuilles
    // du bilan sont déterministes (données à partir de la ligne 10, dans
    // l'ordre du moteur), ce qui permet de créer le paysage AVANT elles.
    const versCote = (postes: typeof bilan.actif, libelle: 'ACTIF' | 'PASSIF') => ({
      feuille: libelle === 'ACTIF' ? 'Bilan-Actif' : 'Bilan-Passif',
      libelle,
      cols:
        libelle === 'ACTIF'
          ? [
              { entete: 'BRUT', lettre: 'D' },
              { entete: 'AMORT. et DEPREC.', lettre: 'E' },
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
        note: p.note ?? NOTE_PAR_REF_SYSCOHADA[p.ref] ?? '',
        rangSource: 10 + i,
        niveau: NIVEAUX_ETAT_SYSCOHADA[p.ref] ?? ((p.estTotal ? 'inter' : 'normal') as NiveauLigne),
      })),
    });
    construireBilanPaysage(
      classeur,
      ident,
      versCote(bilan.actif, 'ACTIF'),
      versCote(bilan.passif, 'PASSIF'),
      'BILAN AU 31 DECEMBRE N',
    );

    // 9-12 · les quatre états de l'art. 8 (les Notes annexes suivent).
    const { rangsActif, rangsPassif } = this.feuillesBilanSyscohadaEtafi(classeur, bilan, ident);
    const rangsCr = this.feuilleResultatSyscohadaEtafi(classeur, cr, ident);
    const { rangs: rangsTft, dernier } = this.feuilleTftSyscohadaEtafi(classeur, tft, ident);
    ligneControleSousEtat(classeur.getWorksheet('TFT')!, dernier + 1, this.controlesTftSyscohada(tft));

    // 13 · fiche récapitulative (fiche R4) et les 36 notes du ch. 6.
    this.construireClasseurNotes(notes, ident, ExportService.PARTIES_NOTES_SYSCOHADA, classeur);

    // 14 · TABLE COMMENTAIRE, sur la même liste que la fiche.
    const parCode = new Map(
      (notes.ficheRecapitulative as Array<{ code: string; titre: string }>).map((n) => [n.code, n.titre]),
    );
    const parties: PartiesNotes = ExportService.PARTIES_NOTES_SYSCOHADA.map(([titre, codes]) => [
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
      ['TOTAL GÉNÉRAL actif net (BZ)', `'Bilan-Actif'!F${rangsActif.get('BZ')}`, ''],
      ['TOTAL GÉNÉRAL passif (DZ)', `'Bilan-Passif'!D${rangsPassif.get('DZ')}`, ''],
      ['Écart bilan actif - passif (doit être 0)', 'B5-B6', 0],
      ['RÉSULTAT NET du compte de résultat (XI)', `Résultat!D${rangsCr.get('XI')}`, ''],
      ["Résultat net logé au bilan (CJ)", `'Bilan-Passif'!D${rangsPassif.get('CJ')}`, ''],
      ['Écart résultat CR / bilan (doit être 0)', 'B8-B9', 0],
      ['Trésorerie nette au 31 Décembre par les flux (TFT, ZH)', `TFT!D${rangsTft.get('ZH')}`, ''],
      [
        'Contrôle du modèle : Trésorerie actif N - Trésorerie passif N (BT - DT)',
        `'Bilan-Actif'!F${rangsActif.get('BT')}-'Bilan-Passif'!D${rangsPassif.get('DT')}`,
        '',
      ],
      ['Écart de bouclage du TFT (doit être 0)', 'B11-B12', 0],
      [
        'Résultat par les classes 6/7/8 (avant clôture)',
        bilan.controle.resultatClasses678,
        '',
      ],
      ['Résultat par le compte 13 (après clôture)', bilan.controle.resultatCompte13, ''],
      [
        'Une seule des deux sources doit être servie (double comptage sinon)',
        bilan.controle.doubleComptageProbable ? 'DOUBLE COMPTAGE PROBABLE' : 'OK',
        'OK',
      ],
    ];
    let rc = 1;
    for (const [lab, val, attendu] of controles) {
      rc += 1;
      ctl.getCell(rc, 1).value = lab;
      ctl.getCell(rc, 2).value = typeof val === 'string' && /[A-Z]!|SUM\(|^B\d/.test(val) ? { formula: val } : val;
      ctl.getCell(rc, 3).value = attendu;
      styleLigne(ctl, rc, 1, 3, 'normal', [2]);
    }
    largeurs(ctl, { A: 68, B: 24, C: 14 });

    // 16 · ANOMALIES · tout ce que les moteurs savent déjà signaler. Un
    // compte non rattaché n'entre dans AUCUN total : s'il ne se voyait pas
    // ici, un état faux passerait pour un état juste.
    const an = classeur.addWorksheet('ANOMALIES');
    for (const [i, h] of ['Gravité', 'Compte / poste', 'Intitulé', 'Problème', 'Solution proposée'].entries()) {
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
        'Vérifier les écritures déséquilibrées et les comptes non rattachés ci-dessous.',
      ]);
    }
    if (bilan.controle.doubleComptageProbable) {
      anomalies.push([
        'A_TRAITER',
        'CJ',
        'Résultat net de l’exercice',
        `Les classes 6/7/8 portent ${bilan.controle.resultatClasses678.toFixed(2)} ET le compte 13 porte ${bilan.controle.resultatCompte13.toFixed(2)} : le résultat viendrait de deux sources à la fois.`,
        'Solder les comptes de gestion à la clôture, ou reprendre l’écriture de détermination du résultat (Titre VII COMPTE 13).',
      ]);
    }
    if (!cr.controle.coherent) {
      anomalies.push([
        'A_TRAITER',
        'XI',
        'Compte de résultat',
        `Écart de ${cr.controle.ecart.toFixed(2)} entre le résultat net des postes officiels et le solde de toutes les classes de gestion.`,
        'Rattacher les comptes de gestion listés ci-dessous à un poste du ch. 7.',
      ]);
    }
    if (!tft.controle.coherent) {
      anomalies.push([
        'A_TRAITER',
        'ZH',
        'Tableau des flux de trésorerie',
        `Écart de ${tft.controle.ecart.toFixed(2)} entre ZH par les flux et BT - DT du bilan · l’écart chiffre ce que la ventilation FA à FQ ne couvre pas.`,
        'Examiner les comptes non ventilés ci-dessous.',
      ]);
    }
    for (const c of bilan.comptesNonRattaches) {
      anomalies.push([
        'A_TRAITER',
        c.numero,
        c.intitule,
        "Compte de bilan qu'aucun poste du tableau de correspondance officiel (Titre IX ch. 7) ne réclame · son montant n'entre dans aucun total.",
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
    for (const c of tft.comptesNonVentiles) {
      anomalies.push([
        'A_VERIFIER',
        c.numero,
        c.intitule,
        `Mouvement de trésorerie qu'aucun poste FA à FQ ne ventile (${c.montant.toFixed(2)}).`,
        'Rapprocher l’opération de la ventilation du ch. 5 ; l’écart de bouclage de ZH en dépend.',
      ]);
    }
    for (const p of tft.postesNonCalculables) {
      anomalies.push(['INFO', p.ref, 'Tableau des flux de trésorerie', p.raison, 'Aucune action : la donnée manque, elle n’est pas approximée.']);
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
    largeurs(an, { A: 12, B: 16, C: 30, D: 70, E: 62 });
    an.views = [{ state: 'frozen', ySplit: 1 }];

    numeroterPages(classeur);
    return classeur;
  }

  /**
   * LIASSE COMPLÈTE du SYSTÈME MINIMAL DE TRÉSORERIE SYSCOHADA (Titre X).
   *
   * PAS DE TABLEAU DES FLUX DE TRÉSORERIE · anomalie du texte officiel,
   * signalée et non corrigée : l'art. 28 range un « Tableau de flux de
   * trésorerie » dans le jeu SMT, alors que le Titre X ch. 1 § 2 n'énumère
   * que trois documents (Bilan, Compte de résultat, Notes annexes) et ne
   * donne aucune maquette de TFT. On sert le jeu du Titre X, qui seul
   * fournit les modèles ; aucun état n'est inventé (même arbitrage que le
   * contrôleur des états SYSCOHADA).
   */
  private async liasseSmtSyscohadaEtafi(tenantId: string, exerciceId: string): Promise<ExcelJS.Workbook> {
    const [ident, tenant, bilan, cr, journal, note1, note2, note3, eligibilite, exerciceN1Id] = await Promise.all([
      this.identiteLiasse(tenantId, exerciceId),
      this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
      this.smtSyscohada.bilan(tenantId, exerciceId),
      this.smtSyscohada.compteDeResultat(tenantId, exerciceId),
      this.smtSyscohada.journalTresorerie(tenantId, exerciceId),
      this.smtSyscohada.note1MaterielMobilierCautions(tenantId, exerciceId),
      this.smtSyscohada.note2Stocks(tenantId, exerciceId),
      this.smtSyscohada.note3CreancesDettes(tenantId, exerciceId),
      this.smtSyscohada.eligibilite(tenantId, exerciceId),
      this.exerciceN1Id(tenantId, exerciceId),
    ]);
    const lignesBalN = await this.lignesBalanceLiasse(tenantId, exerciceId);
    const lignesBalN1 = exerciceN1Id ? await this.lignesBalanceLiasse(tenantId, exerciceN1Id) : [];

    const classeur = this.nouveauClasseur();
    ecrireFeuilleBalance(classeur, NOM_BALANCE, lignesBalN);
    if (exerciceN1Id) ecrireFeuilleBalance(classeur, NOM_BALANCE_N1, lignesBalN1);
    construireControleBalance(classeur, Boolean(exerciceN1Id), lignesBalN.length, lignesBalN1.length);

    construireCouverture(classeur, ident, 'LIASSE SMT', tenant.pays ?? '');
    construireGarde(classeur, ident, {
      bandeau: 'ETATS FINANCIERS NORMALISES\nDU SYSTEME COMPTABLE OHADA (SYSCOHADA)',
      sousBandeau: 'Entités astreintes à la comptabilité financière (AUDCIF art. 2)',
      systeme: 'SYSTEME MINIMAL DE TRESORERIE',
      // Titre X ch. 1 § 2 · les TROIS documents du jeu SMT, et rien d'autre.
      documents: [
        "Fiche d'identification et renseignements divers",
        'Bilan',
        'Compte de résultat',
        'Notes annexes 1 à 3',
      ],
    });
    construireFiche1(classeur, ident, 'SYSCOHADA', 'Système minimal de trésorerie', { ZE: tenant.rccm ?? '' });
    construireFiche2(classeur, ident, 'DIRIGEANTS');

    // Bilan paysage · c'est la présentation même du bilan SMT (« tableau à
    // deux colonnes, Actif / Passif », ch. 2 § 1). La colonne REF du gabarit
    // reste VIDE : le Titre X n'imprime aucun code de poste, et y mettre les
    // clés internes d'OmegaX les ferait passer pour officielles.
    const versCote = (postes: typeof bilan.actif, libelle: 'ACTIF' | 'PASSIF') => {
      const details = postes.filter((p) => !p.estTotal);
      const total = postes.find((p) => p.estTotal);
      return {
        feuille: libelle === 'ACTIF' ? 'Bilan-Actif' : 'Bilan-Passif',
        libelle,
        cols: [
          { entete: 'EXERCICE N', lettre: 'C' },
          { entete: 'EXERCICE N-1', lettre: 'D' },
        ],
        lignes: [
          ...details.map((p, i) => ({
            ref: '',
            libelle: p.libelle,
            note: p.note ?? '',
            rangSource: 9 + i,
            niveau: 'normal' as NiveauLigne,
          })),
          {
            ref: '',
            libelle: total?.libelle ?? (libelle === 'ACTIF' ? 'Total actif' : 'Total passif'),
            note: '',
            rangSource: 9 + details.length,
            niveau: 'general' as NiveauLigne,
          },
        ],
      };
    };
    construireBilanPaysage(
      classeur,
      ident,
      versCote(bilan.actif, 'ACTIF'),
      versCote(bilan.passif, 'PASSIF'),
      'BILAN SMT AU 31 DECEMBRE N',
    );

    const { rangsActif, rangsPassif } = this.feuillesBilanSmtSyscohadaEtafi(classeur, bilan, ident);
    const rangsCr = this.feuilleResultatSmtSyscohadaEtafi(classeur, cr, ident);

    const parties = this.ficheNotesSmtSyscohadaEtafi(classeur, this.smtSyscohada.ficheNotes(), ident);
    this.feuillesNotesSmtSyscohadaEtafi(classeur, { note1, note2, note3 }, ident);
    this.feuilleJournalTresorerieSmtSyscohadaEtafi(classeur, journal, ident);
    construireTableCommentaires(classeur, parties, ident);

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
      ['Total actif', `'Bilan-Actif'!C${rangsActif.get('SAZ')}`, ''],
      ['Total passif', `'Bilan-Passif'!C${rangsPassif.get('SPZ')}`, ''],
      ['Écart bilan actif - passif (doit être 0)', 'B5-B6', 0],
      ['RÉSULTAT EXERCICE du compte de résultat (G = C - D + E - F)', `Résultat!C${rangsCr.get('SG')}`, ''],
      ['Résultat logé au bilan (poste « Résultat exercice »)', `'Bilan-Passif'!C${rangsPassif.get('SP2')}`, ''],
      ['Écart résultat CR / bilan (doit être 0)', 'B8-B9', 0],
      [
        "Chiffre d'affaires de l'exercice (art. 13, compte 70)",
        eligibilite.chiffreAffaires,
        `${eligibilite.deviseDossier ?? 'monnaie de tenue'}`,
      ],
      ...eligibilite.seuils.map(
        (s) =>
          [`Seuil art. 13 · ${s.categorie}`, s.montantFcfa, `F CFA, ${s.clause}`] as [string, string | number, string | number],
      ),
    ];
    let rc = 1;
    for (const [lab, val, attendu] of controles) {
      rc += 1;
      ctl.getCell(rc, 1).value = lab;
      ctl.getCell(rc, 2).value = typeof val === 'string' ? { formula: val } : val;
      ctl.getCell(rc, 3).value = attendu;
      styleLigne(ctl, rc, 1, 3, 'normal', [2]);
    }
    rc += 2;
    ligneControleSousEtat(ctl, rc, eligibilite.avertissementConversion);
    rc += 1;
    ligneControleSousEtat(ctl, rc, eligibilite.qualificationParLEntite);
    rc += 1;
    ligneControleSousEtat(ctl, rc, eligibilite.rappelArticle11);
    largeurs(ctl, { A: 68, B: 24, C: 46 });

    const an = classeur.addWorksheet('ANOMALIES');
    for (const [i, h] of ['Gravité', 'Compte / poste', 'Intitulé', 'Problème', 'Solution proposée'].entries()) {
      an.getCell(1, i + 1).value = h;
    }
    entetesBande(an, 1, 1, 1, 5);
    const anomalies: Array<[string, string, string, string, string]> = [];
    if (!bilan.equilibre) {
      anomalies.push([
        'BLOQUANT',
        'Total actif / Total passif',
        'Bilan SMT',
        `Actif et passif diffèrent de ${(bilan.totalActif - bilan.totalPassif).toFixed(2)}.`,
        'Vérifier les écritures déséquilibrées et les comptes hors maquette.',
      ]);
    }
    if (!cr.controle.concordant) {
      anomalies.push([
        'A_TRAITER',
        'G',
        'Compte de résultat SMT',
        `Écart de ${cr.controle.ecart.toFixed(2)} avec le résultat du bilan (résidu inexpliqué : ${cr.controle.residuel.toFixed(2)}).`,
        'Examiner les flux de trésorerie hors résultat (financement, investissement) que le compte de résultat SMT écarte.',
      ]);
    }
    for (const c of bilan.comptesNonRattaches) {
      anomalies.push([
        'A_TRAITER',
        c.numero,
        c.intitule,
        "Compte de bilan qu'aucun poste de la maquette SMT ne capte · son montant n'entre dans aucun total.",
        'Vérifier le numéro de compte, ou créer le compte au bon niveau du plan.',
      ]);
    }
    for (const j of journal.journaux) {
      if (!j.boucle) {
        anomalies.push([
          'A_TRAITER',
          j.numero,
          j.intitule,
          `Le journal de trésorerie ne boucle pas avec la balance (écart ${(j.soldeAReporter - j.soldeBalance).toFixed(2)}).`,
          'Vérifier les écritures du compte.',
        ]);
      }
    }
    for (const c of cr.contrepartiesNonRattachees) {
      anomalies.push([
        'A_VERIFIER',
        c.numero,
        c.intitule,
        `Contrepartie de trésorerie qu'aucun poste A / B ni aucune rubrique hors résultat ne capte (${c.montant.toFixed(2)}).`,
        'Vérifier le numéro de compte de la contrepartie.',
      ]);
    }
    // Éligibilité · l'art. 13 fixe TROIS seuils selon la qualification de
    // l'activité, qu'OmegaX ne porte pas, et le dossier n'est pas tenu en
    // F CFA : la comparaison est présentée, jamais tranchée.
    const plusBasSeuil = Math.min(...eligibilite.seuils.map((s) => s.montantFcfa));
    if (eligibilite.chiffreAffaires > plusBasSeuil) {
      anomalies.push([
        'A_VERIFIER',
        'art. 13',
        'Éligibilité au Système minimal de trésorerie',
        `Chiffre d'affaires de ${eligibilite.chiffreAffaires.toLocaleString('fr-FR')} ${eligibilite.deviseDossier ?? ''} face à des seuils exprimés en F CFA (30 à 60 millions selon la catégorie). ${eligibilite.avertissementConversion}`,
        eligibilite.qualificationParLEntite,
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
    largeurs(an, { A: 12, B: 22, C: 30, D: 70, E: 62 });
    an.views = [{ state: 'frozen', ySplit: 1 }];

    numeroterPages(classeur);
    return classeur;
  }

  /**
   * LIASSE COMPLÈTE · le classeur ENTIER du modèle du skill, construit
   * nativement pour le jeu du dossier (art. 4 de l'Acte uniforme) ·
   * associations, projets de développement ou Système minimal de trésorerie.
   * `paiementsEnInstance` : poste H de la réconciliation de trésorerie (jeu
   * projets), donnée extra-comptable que seul l'utilisateur connaît.
   */
  /**
   * La liasse entière du jeu retenu par le dossier, TOUTES ses notes annexes
   * comprises · celles que l'exercice ne chiffre pas portent la mention
   * NEANT (voir `construireClasseurNotes` pour la décision et son écart
   * assumé avec le renvoi (1) du modèle).
   */
  async liasseCompleteExcel(
    tenantId: string,
    exerciceId: string,
    paiementsEnInstance = 0,
  ): Promise<ClasseurExporte> {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    // LE RÉFÉRENTIEL D'ABORD · `jeuEtatsFinanciersSycebnl` n'a de sens que
    // pour un dossier SYCEBNL (il porte une valeur par défaut même sur un
    // dossier SYSCOHADA, où il ne veut rien dire) : le lire sans avoir
    // tranché le référentiel produirait une liasse SYCEBNL pour une société
    // commerciale, sans qu'aucun total cesse de boucler.
    //
    // Le branchement vit ICI et non dans le contrôleur parce que
    // `GroupeService.liasseGroupe` appelle cette méthode DIRECTEMENT, sans
    // passer par une route ni par `ReferentielGuard` : un aiguillage posé
    // seulement sur la route laisserait la liasse du groupe au mauvais
    // référentiel.
    if (tenant.referentiel === Referentiel.SYSCOHADA) {
      const natifSyscohada =
        tenant.systemeComptableSyscohada === SystemeComptableSyscohada.MINIMAL_TRESORERIE
          ? await this.liasseSmtSyscohadaEtafi(tenantId, exerciceId)
          : await this.liasseSyscohadaEtafi(tenantId, exerciceId);
      return {
        buffer: await this.versBuffer(natifSyscohada),
        nomFichier: `liasse-complete${await this.suffixeExercice(tenantId, exerciceId)}.xlsx`,
      };
    }
    const jeu = tenant.jeuEtatsFinanciersSycebnl;
    const natif =
      jeu === JeuEtatsFinanciersSycebnl.ASSOCIATIONS_ORDRES_PROFESSIONNELS
        ? await this.liasseAssociationsEtafi(tenantId, exerciceId)
        : jeu === JeuEtatsFinanciersSycebnl.PROJETS_DEVELOPPEMENT
          ? await this.liasseProjetsEtafi(tenantId, exerciceId, paiementsEnInstance)
          : await this.liasseSmtEtafi(tenantId, exerciceId);
    return {
      buffer: await this.versBuffer(natif),
      nomFichier: `liasse-complete${await this.suffixeExercice(tenantId, exerciceId)}.xlsx`,
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
