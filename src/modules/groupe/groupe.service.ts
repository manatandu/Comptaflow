import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Workbook } from 'exceljs';
import { createHash, randomBytes } from 'crypto';
import {
  ClasseCompte,
  JeuEtatsFinanciersSycebnl,
  NumerotationPiece,
  Referentiel,
  StatutEcriture,
  StatutExercice,
  TypeJournal,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';
import { AuthService } from '../auth/auth.service';
import { ClasseurExporte, ExportService } from '../exports/export.service';
import { CreerCelluleDto, ImporterCanevasDto } from './dto/groupe.dto';
import {
  DERNIERE_LIGNE_DONNEES,
  MARQUEUR_CANEVAS,
  PREMIERE_LIGNE_DONNEES,
  RUBRIQUES_CANEVAS,
  TRESORERIES_CANEVAS,
} from './canevas-tresorerie';

/**
 * GROUPE D'ÉTABLISSEMENTS · une même personne morale tenue en plusieurs
 * dossiers : un dossier mère (le siège) et ses cellules. Cas type : une
 * église de plusieurs centaines de cellules, chacune tenant son dossier
 * (petites en SMT, grandes en Système normal), dont les comptabilités
 * s'AGRÈGENT au siège à la clôture. Ce n'est PAS une consolidation au sens
 * juridique (il n'y a qu'une seule entité, et l'Acte uniforme SYCEBNL ne
 * connaît d'ailleurs aucun régime de consolidation) : c'est la réunion des
 * comptabilités d'établissements d'une même entité, seule liasse déposable
 * à la clé · le seuil SMT de l'article 6 s'apprécie par ENTITÉ, une entité
 * de cette taille relève du Système normal pour ses états officiels.
 *
 * SÉCURITÉ · la lecture transversale (le siège lit les balances des
 * cellules) n'est permise QUE dans le sens du lien dossierMereId, posé par
 * la console plateforme et par elle seule. Toute méthode part du tenantId
 * de l'appelant et ne touche que les tenants dont dossierMereId = ce
 * tenantId · une cellule ne voit jamais ses sœurs, ni la mère.
 */
@Injectable()
export class GroupeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ecritureService: EcritureService,
    private readonly authService: AuthService,
    private readonly exportService: ExportService,
  ) {}

  /** Les cellules rattachées à ce dossier, et ce que le siège peut créer. */
  async cellules(tenantId: string) {
    const [mere, cellules] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { plafondCellules: true } }),
      this.prisma.tenant.findMany({
        where: { dossierMereId: tenantId },
        orderBy: { nom: 'asc' },
        select: {
          id: true,
          nom: true,
          jeuEtatsFinanciersSycebnl: true,
          ville: true,
          _count: { select: { ecritures: true } },
        },
      }),
    ]);
    return {
      plafondCellules: mere?.plafondCellules ?? null,
      // null = la création par le siège n'est pas activée (console plateforme).
      peutCreerCellule: mere?.plafondCellules !== null && cellules.length < (mere?.plafondCellules ?? 0),
      cellules: cellules.map((c) => ({
        id: c.id,
        nom: c.nom,
        jeuEtatsFinanciersSycebnl: c.jeuEtatsFinanciersSycebnl,
        ville: c.ville,
        nbEcritures: c._count.ecritures,
      })),
    };
  }

  /**
   * Création d'une cellule PAR LE SIÈGE · les trois verrous qui empêchent
   * l'endpoint de devenir une inscription gratuite déguisée :
   *  1. rattachement FORCÉ : dossierMereId = le tenant appelant, jamais un
   *     choix du client · et une cellule ne crée pas de cellules (un niveau) ;
   *  2. licence HÉRITÉE de la mère (type + échéance) · une seule licence
   *     commerciale, celle que la console plateforme gère sur la mère ;
   *  3. PLAFOND fixé par la console plateforme (null = création désactivée).
   * Le dossier naît complet par le même pipeline que l'inscription (plan de
   * comptes, journaux, taxes, exercice), mot de passe généré rendu une fois.
   */
  async creerCellule(tenantId: string, dto: CreerCelluleDto) {
    const mere = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        dossierMereId: true,
        plafondCellules: true,
        licence: { select: { type: true, dateExpiration: true } },
        _count: { select: { cellules: true } },
      },
    });
    if (!mere || mere.dossierMereId !== null) {
      throw new BadRequestException('Seul un dossier mère peut créer des cellules');
    }
    if (mere.plafondCellules === null) {
      throw new BadRequestException(
        "La création de cellules n'est pas activée pour ce dossier · rapprochez-vous de VMG Consulting",
      );
    }
    if (mere._count.cellules >= mere.plafondCellules) {
      throw new BadRequestException(
        `Plafond de ${mere.plafondCellules} cellules atteint · rapprochez-vous de VMG Consulting pour l'augmenter`,
      );
    }

    const motDePasseTemporaire = randomBytes(12).toString('base64url');
    const resultat = await this.authService.register({
      nomEntite: dto.nom,
      referentiel: Referentiel.SYCEBNL,
      email: dto.emailAdmin,
      motDePasse: motDePasseTemporaire,
      jeuEtatsFinanciersSycebnl: dto.jeuEtatsFinanciersSycebnl,
      typeLicence: mere.licence?.type,
    });
    await this.prisma.tenant.update({
      where: { id: resultat.tenant.id },
      data: { dossierMereId: tenantId },
    });
    // Le mot de passe a transité par le siège · le responsable de la cellule
    // devra le remplacer à sa première connexion (voir schema.prisma, User).
    await this.prisma.user.update({
      where: { email: dto.emailAdmin },
      data: { doitChangerMotDePasse: true },
    });
    // Licence héritée · l'échéance de la mère devient celle de la cellule,
    // et la cascade de la console plateforme (voir PlateformeService.
    // modifierLicence) entretient ensuite l'alignement.
    if (mere.licence?.dateExpiration) {
      await this.prisma.licence.update({
        where: { tenantId: resultat.tenant.id },
        data: { dateExpiration: mere.licence.dateExpiration },
      });
    }
    return {
      tenant: resultat.tenant,
      adminEmail: dto.emailAdmin,
      // Jamais le jeton de session · même règle que la console plateforme.
      motDePasseTemporaire,
    };
  }

  /**
   * L'exercice d'un dossier qui recouvre le mieux la période demandée. Les
   * cellules créées depuis la console partagent le calendrier du siège, mais
   * une cellule reprise en cours de route peut avoir des dates décalées ·
   * on prend le recouvrement maximal plutôt que d'exiger l'égalité stricte.
   */
  private meilleurExercice(
    exercices: Array<{ id: string; dateDebut: Date; dateFin: Date }>,
    debut: Date,
    fin: Date,
  ) {
    let meilleur: { id: string; dateDebut: Date; dateFin: Date } | null = null;
    let recouvrementMax = 0;
    for (const e of exercices) {
      const recouvrement =
        Math.min(e.dateFin.getTime(), fin.getTime()) - Math.max(e.dateDebut.getTime(), debut.getTime());
      if (recouvrement > 0 && recouvrement > recouvrementMax) {
        recouvrementMax = recouvrement;
        meilleur = e;
      }
    }
    return meilleur;
  }

  /**
   * Balance agrégée du groupe pour un exercice du dossier mère : les soldes
   * de la mère et de chaque cellule, réunis compte par compte (par NUMÉRO ·
   * les dossiers créés depuis la console partagent le même plan SYCEBNL).
   * Seuls les comptes Détail entrent dans l'agrégat, les comptes Total ne
   * sont que des lignes d'affichage déjà comptées par leurs enfants.
   *
   * Trois contrôles accompagnent le résultat, car une agrégation sans
   * contrôle est un piège :
   *  · équilibre de CHAQUE dossier (une cellule déséquilibrée fausse tout) ;
   *  · neutralisation des comptes 58 Virements internes · dans une entité
   *    unique, un transfert siège vers cellule est un virement interne :
   *    l'émetteur débite 58, le receveur crédite 58, et l'agrégat des 58
   *    doit revenir à zéro. Un écart désigne un transfert enregistré d'un
   *    seul côté ;
   *  · cellules sans exercice sur la période (leurs chiffres MANQUENT).
   */
  async balanceAgregee(tenantId: string, exerciceId: string) {
    const exercice = await this.prisma.exercice.findFirst({
      where: { id: exerciceId, tenantId },
      select: { id: true, dateDebut: true, dateFin: true },
    });
    if (!exercice) {
      throw new NotFoundException('Exercice introuvable dans ce dossier');
    }
    const mere = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, nom: true } });
    const cellules = await this.prisma.tenant.findMany({
      where: { dossierMereId: tenantId },
      orderBy: { nom: 'asc' },
      select: { id: true, nom: true, exercices: { select: { id: true, dateDebut: true, dateFin: true } } },
    });
    if (cellules.length === 0) {
      throw new BadRequestException("Ce dossier n'a aucune cellule rattachée · le rattachement se fait depuis la console plateforme");
    }

    const dossiers: Array<{ id: string; nom: string; estMere: boolean; exerciceId: string | null }> = [
      { id: tenantId, nom: mere!.nom, estMere: true, exerciceId: exercice.id },
      ...cellules.map((c) => ({
        id: c.id,
        nom: c.nom,
        estMere: false,
        exerciceId: this.meilleurExercice(c.exercices, exercice.dateDebut, exercice.dateFin)?.id ?? null,
      })),
    ];

    interface LigneAgregee {
      numero: string;
      intitule: string;
      totalDebit: number;
      totalCredit: number;
    }
    const parNumero = new Map<string, LigneAgregee>();
    const detailParDossier: Array<{ dossier: string; numero: string; intitule: string; totalDebit: number; totalCredit: number }> = [];
    const equilibres: Array<{ id: string; nom: string; estMere: boolean; totalDebit: number; totalCredit: number; solde58: number; equilibre: boolean }> = [];

    for (const d of dossiers) {
      if (!d.exerciceId) continue;
      const balance = await this.ecritureService.balance(d.id, d.exerciceId);
      let solde58 = 0;
      for (const l of balance.lignes) {
        if (l.typeCompte === 'TOTAL') continue;
        const existante = parNumero.get(l.numero);
        if (existante) {
          existante.totalDebit += l.totalDebit;
          existante.totalCredit += l.totalCredit;
          // L'intitulé de la mère fait foi · celui d'une cellule ne remplace
          // jamais un intitulé déjà retenu.
        } else {
          parNumero.set(l.numero, {
            numero: l.numero,
            intitule: l.intitule,
            totalDebit: l.totalDebit,
            totalCredit: l.totalCredit,
          });
        }
        if (l.numero.startsWith('58')) solde58 += l.solde;
        detailParDossier.push({
          dossier: d.nom,
          numero: l.numero,
          intitule: l.intitule,
          totalDebit: l.totalDebit,
          totalCredit: l.totalCredit,
        });
      }
      equilibres.push({
        id: d.id,
        nom: d.nom,
        estMere: d.estMere,
        totalDebit: balance.totaux.debit,
        totalCredit: balance.totaux.credit,
        solde58,
        equilibre: Math.abs(balance.totaux.debit - balance.totaux.credit) <= 0.005,
      });
    }

    const lignes = [...parNumero.values()]
      .filter((l) => l.totalDebit !== 0 || l.totalCredit !== 0)
      .sort((a, b) => a.numero.localeCompare(b.numero))
      .map((l) => ({ ...l, solde: l.totalDebit - l.totalCredit }));
    const totaux = {
      debit: lignes.reduce((s, l) => s + l.totalDebit, 0),
      credit: lignes.reduce((s, l) => s + l.totalCredit, 0),
    };
    const ecartLiaison = equilibres.reduce((s, e) => s + e.solde58, 0);

    return {
      exercice,
      dossiers: equilibres,
      cellulesSansExercice: dossiers.filter((d) => !d.exerciceId).map((d) => ({ id: d.id, nom: d.nom })),
      lignes,
      totaux,
      controles: {
        // Arrondi au centime · l'agrégat de centaines de dossiers accumule
        // des poussières binaires qui ne sont pas des écarts comptables.
        ecartLiaison: Math.round(ecartLiaison * 100) / 100,
        liaisonNeutralisee: Math.abs(ecartLiaison) <= 0.005,
        tousEquilibres: equilibres.every((e) => e.equilibre),
      },
      detailParDossier,
    };
  }

  /**
   * Le même agrégat en classeur Excel. La feuille « Balance agrégée » porte
   * EXACTEMENT les quatre colonnes attendues par l'import de balance
   * (Numéro, Intitulé, Débit, Crédit), sans ligne de total : c'est elle qui
   * se réimporte telle quelle dans un dossier de combinaison pour produire
   * la liasse officielle de l'entité avec les moteurs d'états existants.
   * Les totaux et vérifications vivent sur la feuille « Contrôles ».
   */
  async balanceAgregeeExcel(tenantId: string, exerciceId: string): Promise<ClasseurExporte> {
    const agregat = await this.balanceAgregee(tenantId, exerciceId);
    const annee = agregat.exercice.dateFin.getFullYear();

    const wb = new Workbook();
    const fmt = '#,##0.00';

    const feuille = wb.addWorksheet('Balance agrégée');
    feuille.columns = [
      { header: 'Numéro', key: 'numero', width: 14 },
      { header: 'Intitulé', key: 'intitule', width: 48 },
      { header: 'Débit', key: 'debit', width: 16, style: { numFmt: fmt } },
      { header: 'Crédit', key: 'credit', width: 16, style: { numFmt: fmt } },
    ];
    feuille.getRow(1).font = { bold: true };
    for (const l of agregat.lignes) {
      feuille.addRow({ numero: l.numero, intitule: l.intitule, debit: l.totalDebit, credit: l.totalCredit });
    }

    const detail = wb.addWorksheet('Par dossier');
    detail.columns = [
      { header: 'Dossier', key: 'dossier', width: 32 },
      { header: 'Numéro', key: 'numero', width: 14 },
      { header: 'Intitulé', key: 'intitule', width: 48 },
      { header: 'Débit', key: 'debit', width: 16, style: { numFmt: fmt } },
      { header: 'Crédit', key: 'credit', width: 16, style: { numFmt: fmt } },
    ];
    detail.getRow(1).font = { bold: true };
    for (const l of agregat.detailParDossier) {
      detail.addRow({ dossier: l.dossier, numero: l.numero, intitule: l.intitule, debit: l.totalDebit, credit: l.totalCredit });
    }

    const controles = wb.addWorksheet('Contrôles');
    controles.columns = [
      { header: 'Dossier', key: 'nom', width: 32 },
      { header: 'Débit', key: 'debit', width: 16, style: { numFmt: fmt } },
      { header: 'Crédit', key: 'credit', width: 16, style: { numFmt: fmt } },
      { header: 'Solde 58 (virements internes)', key: 'solde58', width: 24, style: { numFmt: fmt } },
      { header: 'Équilibre', key: 'equilibre', width: 14 },
    ];
    controles.getRow(1).font = { bold: true };
    for (const e of agregat.dossiers) {
      controles.addRow({
        nom: e.estMere ? `${e.nom} (siège)` : e.nom,
        debit: e.totalDebit,
        credit: e.totalCredit,
        solde58: e.solde58,
        equilibre: e.equilibre ? 'Oui' : 'DÉSÉQUILIBRÉ',
      });
    }
    controles.addRow({});
    const totalRow = controles.addRow({
      nom: 'TOTAL AGRÉGÉ',
      debit: agregat.totaux.debit,
      credit: agregat.totaux.credit,
      solde58: agregat.controles.ecartLiaison,
      equilibre: agregat.controles.liaisonNeutralisee ? '58 neutralisés' : 'ÉCART SUR 58',
    });
    totalRow.font = { bold: true };
    for (const c of agregat.cellulesSansExercice) {
      controles.addRow({ nom: c.nom, equilibre: 'SANS EXERCICE · chiffres absents de l’agrégat' });
    }

    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    return { buffer, nomFichier: `balance-agregee-groupe-${annee}.xlsx` };
  }

  /** La cellule appartient-elle au groupe de l'appelant ? Borne TOUTE lecture transversale. */
  private async celluleDuGroupe(tenantId: string, celluleId: string) {
    const cellule = await this.prisma.tenant.findFirst({
      where: { id: celluleId, dossierMereId: tenantId },
      select: { id: true, nom: true },
    });
    if (!cellule) {
      throw new NotFoundException('Cette cellule n’appartient pas à ce groupe');
    }
    return cellule;
  }

  /** L'exercice ouvert d'une cellule · celui que visent canevas et dépôts. */
  private async exerciceOuvert(celluleId: string) {
    const exercice = await this.prisma.exercice.findFirst({
      where: { tenantId: celluleId, statut: StatutExercice.OUVERT },
      orderBy: { dateDebut: 'desc' },
      select: { id: true, dateDebut: true, dateFin: true },
    });
    if (!exercice) {
      throw new BadRequestException('Cette cellule n’a aucun exercice ouvert');
    }
    return exercice;
  }

  /**
   * SUPERVISION EN LECTURE SEULE · l'état d'avancement de chaque cellule,
   * recalculé à la demande (pas de flux continu : une comptabilité n'évolue
   * pas à la seconde, et 300 dossiers en flux permanent coûteraient cher
   * pour rien). Le siège voit tout, ne touche à rien : les corrections se
   * demandent à la cellule, qui les passe elle-même, tracées.
   */
  async supervision(tenantId: string, exerciceId: string) {
    const exercice = await this.prisma.exercice.findFirst({
      where: { id: exerciceId, tenantId },
      select: { id: true, dateDebut: true, dateFin: true },
    });
    if (!exercice) {
      throw new NotFoundException('Exercice introuvable dans ce dossier');
    }
    const cellules = await this.prisma.tenant.findMany({
      where: { dossierMereId: tenantId },
      orderBy: { nom: 'asc' },
      select: { id: true, nom: true, jeuEtatsFinanciersSycebnl: true, exercices: { select: { id: true, dateDebut: true, dateFin: true } } },
    });

    const lignes = [];
    for (const c of cellules) {
      const exCellule = this.meilleurExercice(c.exercices, exercice.dateDebut, exercice.dateFin);
      if (!exCellule) {
        lignes.push({
          id: c.id,
          nom: c.nom,
          jeuEtatsFinanciersSycebnl: c.jeuEtatsFinanciersSycebnl,
          exerciceId: null,
          derniereEcriture: null,
          nbEcritures: 0,
          nbBrouillard: 0,
          tresorerie: 0,
          solde58: 0,
          equilibre: true,
          prete: false,
        });
        continue;
      }
      const [balance, derniere, nbEcritures, nbBrouillard] = await Promise.all([
        this.ecritureService.balance(c.id, exCellule.id),
        this.prisma.ecriture.findFirst({
          where: { tenantId: c.id, exerciceId: exCellule.id },
          orderBy: { date: 'desc' },
          select: { date: true },
        }),
        this.prisma.ecriture.count({ where: { tenantId: c.id, exerciceId: exCellule.id } }),
        this.prisma.ecriture.count({
          where: { tenantId: c.id, exerciceId: exCellule.id, statut: StatutEcriture.BROUILLARD },
        }),
      ]);
      const detail = balance.lignes.filter((l) => l.typeCompte !== 'TOTAL');
      const tresorerie = detail
        .filter((l) => l.numero.startsWith('5') && !l.numero.startsWith('58'))
        .reduce((s, l) => s + l.solde, 0);
      const solde58 = detail.filter((l) => l.numero.startsWith('58')).reduce((s, l) => s + l.solde, 0);
      const equilibre = Math.abs(balance.totaux.debit - balance.totaux.credit) <= 0.005;
      lignes.push({
        id: c.id,
        nom: c.nom,
        jeuEtatsFinanciersSycebnl: c.jeuEtatsFinanciersSycebnl,
        exerciceId: exCellule.id,
        derniereEcriture: derniere?.date ?? null,
        nbEcritures,
        nbBrouillard,
        tresorerie,
        solde58,
        equilibre,
        // « Prête pour l'agrégat » : équilibrée, plus rien en brouillard, et
        // au moins une écriture (une cellule à zéro n'a rien déposé).
        prete: equilibre && nbBrouillard === 0 && nbEcritures > 0,
      });
    }
    return { exercice, cellules: lignes };
  }

  /**
   * Balance d'UNE cellule, en lecture · le zoom de la supervision quand un
   * voyant est rouge. Bornée deux fois : la cellule doit appartenir au
   * groupe, et l'exercice à la cellule.
   */
  async balanceCellule(tenantId: string, celluleId: string, exerciceId: string) {
    const cellule = await this.celluleDuGroupe(tenantId, celluleId);
    const exercice = await this.prisma.exercice.findFirst({
      where: { id: exerciceId, tenantId: celluleId },
      select: { id: true },
    });
    if (!exercice) {
      throw new NotFoundException('Exercice introuvable dans cette cellule');
    }
    const balance = await this.ecritureService.balance(celluleId, exerciceId);
    return { cellule, ...balance };
  }

  /**
   * LE CANEVAS DE TRÉSORERIE · le fichier Excel officiel qu'une cellule non
   * autonome remplit. Liste de rubriques FERMÉE (voir canevas-tresorerie.ts),
   * cellules verrouillées hors zone de saisie, marqueur de version : c'est
   * ce triptyque qui rend l'import automatique et fiable. Se remplit très
   * bien sur un téléphone.
   */
  async canevas(tenantId: string, celluleId: string): Promise<ClasseurExporte> {
    const cellule = await this.celluleDuGroupe(tenantId, celluleId);
    const exercice = await this.exerciceOuvert(celluleId);

    const wb = new Workbook();
    const ws = wb.addWorksheet('Journal de trésorerie');
    ws.getCell('A1').value = MARQUEUR_CANEVAS;
    ws.getCell('A1').font = { size: 8, color: { argb: 'FFBBBBBB' } };
    ws.getCell('A2').value = 'Cellule :';
    ws.getCell('B2').value = cellule.nom;
    ws.getCell('A3').value = 'Exercice :';
    ws.getCell('B3').value = `du ${exercice.dateDebut.toISOString().slice(0, 10)} au ${exercice.dateFin.toISOString().slice(0, 10)}`;
    ws.getRow(2).font = { bold: true };
    ws.getRow(3).font = { bold: true };

    const entetes = ['Date', 'Libellé', 'Rubrique', 'Encaissement', 'Décaissement', 'Caisse ou banque'];
    const ligneEntetes = ws.getRow(PREMIERE_LIGNE_DONNEES - 1);
    entetes.forEach((e, i) => {
      const cellule = ligneEntetes.getCell(i + 1);
      cellule.value = e;
      cellule.font = { bold: true };
      cellule.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } };
    });
    ws.getColumn(1).width = 12;
    ws.getColumn(2).width = 42;
    ws.getColumn(3).width = 40;
    ws.getColumn(4).width = 16;
    ws.getColumn(5).width = 16;
    ws.getColumn(6).width = 18;
    ws.getColumn(1).numFmt = 'dd/mm/yyyy';
    ws.getColumn(4).numFmt = '#,##0.00';
    ws.getColumn(5).numFmt = '#,##0.00';

    const rubriques = wb.addWorksheet('Rubriques');
    rubriques.columns = [
      { header: 'Rubrique', key: 'libelle', width: 44 },
      { header: 'Sens', key: 'sens', width: 12 },
      { header: 'Compte', key: 'compte', width: 12 },
    ];
    rubriques.getRow(1).font = { bold: true };
    for (const r of RUBRIQUES_CANEVAS) {
      rubriques.addRow({ libelle: r.libelle, sens: r.sens === 'recette' ? 'Recette' : 'Dépense', compte: r.compte });
    }

    // Listes déroulantes fermées · un trésorier CHOISIT, il ne tape jamais
    // un numéro de compte.
    for (let l = PREMIERE_LIGNE_DONNEES; l <= DERNIERE_LIGNE_DONNEES; l++) {
      ws.getCell(`C${l}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`Rubriques!$A$2:$A$${RUBRIQUES_CANEVAS.length + 1}`],
        showErrorMessage: true,
        errorTitle: 'Rubrique inconnue',
        error: 'Choisissez une rubrique dans la liste.',
      };
      ws.getCell(`F${l}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"Caisse,Banque"'],
        showErrorMessage: true,
        errorTitle: 'Valeur inconnue',
        error: 'Choisissez Caisse ou Banque.',
      };
      // Zone de saisie déverrouillée · tout le reste de la feuille est
      // protégé (cartouche, en-têtes, marqueur).
      for (let col = 1; col <= 6; col++) {
        ws.getRow(l).getCell(col).protection = { locked: false };
      }
    }
    await ws.protect('', { selectLockedCells: true, selectUnlockedCells: true });

    const slug = cellule.nom
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    return { buffer, nomFichier: `canevas-${slug || 'cellule'}-${exercice.dateFin.getFullYear()}.xlsx` };
  }

  /**
   * DÉPÔT D'UN CANEVAS REMPLI · l'import est TOUT OU RIEN : la moindre ligne
   * fausse (date hors exercice, rubrique inconnue, montant des deux côtés)
   * fait tout refuser avec la liste des anomalies, ligne par ligne · un
   * dépôt à moitié importé serait introuvable après coup. Chaque ligne
   * valide devient une écriture équilibrée du journal de trésorerie de la
   * cellule (statut brouillard : la validation reste un geste distinct,
   * comme pour toute saisie). Le même fichier ne s'importe pas deux fois
   * (empreinte du contenu portée en référence).
   */
  async importerCanevas(tenantId: string, celluleId: string, createdBy: string, dto: ImporterCanevasDto) {
    await this.celluleDuGroupe(tenantId, celluleId);
    const exercice = await this.exerciceOuvert(celluleId);

    const contenu = Buffer.from(dto.contenuBase64, 'base64');
    const wb = new Workbook();
    try {
      await wb.xlsx.load(contenu as never);
    } catch {
      throw new BadRequestException('Ce fichier n’est pas un classeur Excel lisible (.xlsx attendu)');
    }
    const ws = wb.getWorksheet('Journal de trésorerie');
    if (!ws || String(ws.getCell('A1').value ?? '') !== MARQUEUR_CANEVAS) {
      throw new BadRequestException(
        'Ce fichier n’est pas un canevas OmegaX · téléchargez le canevas officiel de la cellule et remplissez-le',
      );
    }

    const empreinte = createHash('sha1').update(contenu).digest('hex').slice(0, 10);
    const reference = `CANEVAS ${empreinte}`;
    const dejaImporte = await this.prisma.ecriture.findFirst({
      where: { tenantId: celluleId, reference },
      select: { id: true },
    });
    if (dejaImporte) {
      throw new BadRequestException('Ce fichier a déjà été importé dans cette cellule (contenu identique)');
    }

    const rubriqueParLibelle = new Map(RUBRIQUES_CANEVAS.map((r) => [r.libelle, r]));
    const anomalies: Array<{ ligne: number; message: string }> = [];
    const lignesValides: Array<{
      date: Date;
      libelle: string;
      compteRubrique: string;
      compteTresorerie: string;
      journal: 'CA' | 'BQ';
      sens: 'recette' | 'depense';
      montant: number;
    }> = [];

    const texte = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim());
    const nombre = (v: unknown): number => {
      if (v === null || v === undefined || v === '') return 0;
      const n = typeof v === 'number' ? v : Number(String(v).replace(/\s/g, '').replace(',', '.'));
      return Number.isFinite(n) ? n : NaN;
    };

    for (let l = PREMIERE_LIGNE_DONNEES; l <= Math.min(ws.rowCount, DERNIERE_LIGNE_DONNEES); l++) {
      const row = ws.getRow(l);
      const brutDate = row.getCell(1).value;
      const libelle = texte(row.getCell(2).value);
      const rubriqueLibelle = texte(row.getCell(3).value);
      const encaissement = nombre(row.getCell(4).value);
      const decaissement = nombre(row.getCell(5).value);
      const tresorerieLibelle = texte(row.getCell(6).value);
      if (!brutDate && !libelle && !rubriqueLibelle && !encaissement && !decaissement) continue; // ligne vide

      const date = brutDate instanceof Date ? brutDate : new Date(texte(brutDate));
      if (Number.isNaN(date.getTime())) {
        anomalies.push({ ligne: l, message: 'Date illisible' });
        continue;
      }
      if (date < exercice.dateDebut || date > exercice.dateFin) {
        anomalies.push({ ligne: l, message: `Date hors de l'exercice ouvert de la cellule` });
        continue;
      }
      const rubrique = rubriqueParLibelle.get(rubriqueLibelle);
      if (!rubrique) {
        anomalies.push({ ligne: l, message: `Rubrique inconnue « ${rubriqueLibelle} »` });
        continue;
      }
      if (Number.isNaN(encaissement) || Number.isNaN(decaissement) || encaissement < 0 || decaissement < 0) {
        anomalies.push({ ligne: l, message: 'Montant illisible ou négatif' });
        continue;
      }
      const montant = rubrique.sens === 'recette' ? encaissement : decaissement;
      const autre = rubrique.sens === 'recette' ? decaissement : encaissement;
      if (montant <= 0 || autre !== 0) {
        anomalies.push({
          ligne: l,
          message:
            rubrique.sens === 'recette'
              ? `« ${rubrique.libelle} » est une recette · montant attendu en Encaissement seulement`
              : `« ${rubrique.libelle} » est une dépense · montant attendu en Décaissement seulement`,
        });
        continue;
      }
      const tresorerie = TRESORERIES_CANEVAS[tresorerieLibelle];
      if (!tresorerie) {
        anomalies.push({ ligne: l, message: 'Colonne « Caisse ou banque » vide ou inconnue' });
        continue;
      }
      lignesValides.push({
        date,
        libelle: libelle || rubrique.libelle,
        compteRubrique: rubrique.compte,
        compteTresorerie: tresorerie.compte,
        journal: tresorerie.journal,
        sens: rubrique.sens,
        montant,
      });
    }

    if (anomalies.length > 0) {
      return { importe: false, lignesImportees: 0, anomalies };
    }
    if (lignesValides.length === 0) {
      throw new BadRequestException('Le canevas ne contient aucune ligne remplie');
    }

    // Référentiels de la cellule · comptes par numéro, journaux CA/BQ.
    const numeros = [...new Set(lignesValides.flatMap((l) => [l.compteRubrique, l.compteTresorerie]))];
    const comptes = await this.prisma.compte.findMany({
      where: { tenantId: celluleId, numero: { in: numeros } },
      select: { id: true, numero: true },
    });
    const compteParNumero = new Map(comptes.map((c) => [c.numero, c.id]));
    const manquants = numeros.filter((n) => !compteParNumero.has(n));
    if (manquants.length > 0) {
      throw new BadRequestException(
        `Comptes absents du plan de la cellule : ${manquants.join(', ')} · le dossier n'a pas le plan SYCEBNL semé`,
      );
    }
    const journaux = await this.prisma.journal.findMany({
      where: { tenantId: celluleId, code: { in: ['CA', 'BQ'] } },
      select: { id: true, code: true },
    });
    const journalParCode = new Map(journaux.map((j) => [j.code, j.id]));
    if (!journalParCode.has('CA') || !journalParCode.has('BQ')) {
      throw new BadRequestException('Journaux de trésorerie CA/BQ absents du dossier de la cellule');
    }

    await this.prisma.$transaction(async (tx) => {
      for (const l of lignesValides) {
        await tx.ecriture.create({
          data: {
            tenantId: celluleId,
            exerciceId: exercice.id,
            journalId: journalParCode.get(l.journal)!,
            date: l.date,
            libelle: l.libelle,
            reference,
            createdBy,
            lignes: {
              create:
                l.sens === 'recette'
                  ? [
                      { compteId: compteParNumero.get(l.compteTresorerie)!, debit: l.montant, credit: 0 },
                      { compteId: compteParNumero.get(l.compteRubrique)!, debit: 0, credit: l.montant },
                    ]
                  : [
                      { compteId: compteParNumero.get(l.compteRubrique)!, debit: l.montant, credit: 0 },
                      { compteId: compteParNumero.get(l.compteTresorerie)!, debit: 0, credit: l.montant },
                    ],
            },
          },
        });
      }
    });

    return {
      importe: true,
      lignesImportees: lignesValides.length,
      reference,
      // Les écritures naissent en brouillard · la validation reste un geste
      // distinct, dans le dossier de la cellule.
      statut: 'BROUILLARD',
      anomalies: [],
    };
  }

  /**
   * LA LIASSE DU GROUPE EN UN CLIC · automatise exactement le chemin manuel
   * documenté (exporter la balance agrégée, la réimporter dans un dossier de
   * combinaison, générer la liasse), sans les étapes manuelles : le serveur
   * reverse la balance agrégée dans un dossier de combinaison TECHNIQUE
   * (créé une fois, lié par Tenant.dossierCombinaisonId, sans utilisateurs,
   * sans dossierMereId · sinon l'agrégat le compterait et doublerait tout),
   * puis fait produire le classeur par les moteurs de liasse existants ·
   * aucun second moteur d'états, donc aucune divergence possible avec ce
   * qu'un dossier ordinaire produirait des mêmes soldes.
   *
   * REFUS si un contrôle est rouge · une liasse produite sur un agrégat
   * déséquilibré, des 58 non neutralisés ou des cellules absentes serait
   * fausse avec l'apparence de l'officiel, le pire des livrables. Le message
   * dit exactement quoi corriger.
   *
   * Limite assumée (identique au chemin manuel) : les états et notes sont
   * calculés des SOLDES agrégés · les registres de détail (immobilisations,
   * tiers) vivent dans les dossiers, pas dans la combinaison.
   */
  async liasseGroupe(tenantId: string, exerciceId: string, createdBy: string): Promise<ClasseurExporte> {
    const agregat = await this.balanceAgregee(tenantId, exerciceId);

    const blocages: string[] = [];
    if (!agregat.controles.tousEquilibres) {
      const noms = agregat.dossiers.filter((d) => !d.equilibre).map((d) => d.nom);
      blocages.push(`dossier(s) déséquilibré(s) : ${noms.join(', ')}`);
    }
    if (!agregat.controles.liaisonNeutralisee) {
      blocages.push(
        `virements internes (58) non neutralisés (écart ${agregat.controles.ecartLiaison.toFixed(2)}) · un transfert est enregistré d'un seul côté`,
      );
    }
    if (agregat.cellulesSansExercice.length > 0) {
      blocages.push(
        `cellule(s) sans exercice sur la période : ${agregat.cellulesSansExercice.map((c) => c.nom).join(', ')} · leurs chiffres manqueraient`,
      );
    }
    if (blocages.length > 0) {
      throw new BadRequestException(
        `La liasse du groupe ne peut pas être produite tant que l'agrégat n'est pas fiable · ${blocages.join(' ; ')}. Corrigez, puis relancez.`,
      );
    }

    // 1 · Le dossier de combinaison, créé une seule fois par groupe.
    const mere = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { nom: true, dossierCombinaisonId: true },
    });
    let combinaisonId = mere!.dossierCombinaisonId;
    if (!combinaisonId) {
      const combinaison = await this.prisma.tenant.create({
        data: {
          nom: `${mere!.nom} · liasse du groupe`,
          referentiel: Referentiel.SYCEBNL,
          // L'entité agrégée relève du Système normal (art. 6 SYCEBNL · le
          // seuil s'apprécie par entité), quel que soit le jeu des cellules.
          jeuEtatsFinanciersSycebnl: JeuEtatsFinanciersSycebnl.ASSOCIATIONS_ORDRES_PROFESSIONNELS,
        },
        select: { id: true },
      });
      combinaisonId = combinaison.id;
      await this.prisma.tenant.update({ where: { id: tenantId }, data: { dossierCombinaisonId: combinaisonId } });
    }

    // 2 · L'exercice miroir de celui de la mère.
    let exercice = await this.prisma.exercice.findFirst({
      where: { tenantId: combinaisonId, dateDebut: agregat.exercice.dateDebut, dateFin: agregat.exercice.dateFin },
      select: { id: true },
    });
    if (!exercice) {
      exercice = await this.prisma.exercice.create({
        data: { tenantId: combinaisonId, dateDebut: agregat.exercice.dateDebut, dateFin: agregat.exercice.dateFin },
        select: { id: true },
      });
    }

    // 3 · Régénération COMPLÈTE : le contenu du dossier de combinaison est
    // dérivé, jamais source · on repart de zéro à chaque génération, aucune
    // trace d'un agrégat précédent ne peut subsister.
    await this.prisma.ligneEcriture.deleteMany({
      where: { ecriture: { tenantId: combinaisonId, exerciceId: exercice.id } },
    });
    await this.prisma.ecriture.deleteMany({ where: { tenantId: combinaisonId, exerciceId: exercice.id } });

    // 4 · Les comptes de l'agrégat (créés au fil des générations · un compte
    // déjà présent est réutilisé, son intitulé n'est pas réécrit).
    await this.prisma.compte.createMany({
      data: agregat.lignes.map((l) => ({
        tenantId: combinaisonId!,
        numero: l.numero,
        intitule: l.intitule,
        classe: `CLASSE_${l.numero[0]}` as ClasseCompte,
      })),
      skipDuplicates: true,
    });
    const comptes = await this.prisma.compte.findMany({
      where: { tenantId: combinaisonId, numero: { in: agregat.lignes.map((l) => l.numero) } },
      select: { id: true, numero: true },
    });
    const compteParNumero = new Map(comptes.map((c) => [c.numero, c.id]));

    let journal = await this.prisma.journal.findFirst({
      where: { tenantId: combinaisonId, code: 'OD' },
      select: { id: true },
    });
    if (!journal) {
      journal = await this.prisma.journal.create({
        data: {
          tenantId: combinaisonId,
          code: 'OD',
          intitule: 'Combinaison du groupe',
          type: TypeJournal.GENERAL,
          numerotation: NumerotationPiece.CONTINUE_FICHIER,
        },
        select: { id: true },
      });
    }

    // 5 · UNE écriture, la balance agrégée en brut (débits et crédits
    // conservés, pas seulement les soldes) · équilibrée par construction
    // puisque chaque dossier l'est (contrôlé ci-dessus).
    await this.prisma.ecriture.create({
      data: {
        tenantId: combinaisonId,
        exerciceId: exercice.id,
        journalId: journal.id,
        date: agregat.exercice.dateDebut,
        libelle: `Combinaison du groupe · ${agregat.dossiers.length} dossiers`,
        reference: 'GROUPE',
        createdBy,
        statut: StatutEcriture.VALIDEE,
        lignes: {
          create: agregat.lignes.map((l) => ({
            compteId: compteParNumero.get(l.numero)!,
            debit: l.totalDebit,
            credit: l.totalCredit,
          })),
        },
      },
    });

    // 6 · Les moteurs existants produisent le classeur.
    const classeur = await this.exportService.liasseCompleteExcel(combinaisonId, exercice.id);
    return { ...classeur, nomFichier: `groupe-${classeur.nomFichier}` };
  }
}
