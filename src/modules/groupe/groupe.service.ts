import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Workbook } from 'exceljs';
import { PrismaService } from '../../common/prisma.service';
import { EcritureService } from '../comptabilite/ecriture.service';
import { ClasseurExporte } from '../exports/export.service';

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
  ) {}

  /** Les cellules rattachées à ce dossier · vide si le dossier n'est pas une mère. */
  async cellules(tenantId: string) {
    const cellules = await this.prisma.tenant.findMany({
      where: { dossierMereId: tenantId },
      orderBy: { nom: 'asc' },
      select: {
        id: true,
        nom: true,
        jeuEtatsFinanciersSycebnl: true,
        ville: true,
        _count: { select: { ecritures: true } },
      },
    });
    return cellules.map((c) => ({
      id: c.id,
      nom: c.nom,
      jeuEtatsFinanciersSycebnl: c.jeuEtatsFinanciersSycebnl,
      ville: c.ville,
      nbEcritures: c._count.ecritures,
    }));
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
}
