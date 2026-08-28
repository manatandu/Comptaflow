import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { CreerTauxTvaDto, ModifierTauxTvaDto } from './dto/taux-tva.dto';
import { TAUX_TVA_DEFAUT } from './taux-tva-seed';
import { ClasseCompte, TypeJournal } from '@prisma/client';
import { EcritureService } from '../comptabilite/ecriture.service';

const EPSILON = 0.005;

/**
 * TVA (cf. docs/plan-de-construction.md §3.1/§5) : entité "Taux" paramétrable,
 * fondée sur l'O.-L. n° 10/001 du 20/08/2010 modifiée par la LF 2026 (skill
 * `fiscalite-rdc/tva`). Couvre désormais, en plus du référentiel (taux +
 * comptes 443/445 rattachés) : le prorata de déduction (art. 43-49) et la
 * comptabilisation de la liquidation périodique (solde 443/445 sur le
 * compte 444). Reste hors scope : l'option pour secteurs distincts
 * d'activité (art. 49) et la régularisation pluriannuelle du prorata sur les
 * immobilisations (art. 46, variation > 10 % sur 4/19 ans).
 */
@Injectable()
export class TauxTvaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ecritureService: EcritureService,
  ) {}

  /** Appelé une fois à la création du tenant (voir AuthService.register). */
  async seedTauxDefaut(tenantId: string) {
    for (const t of TAUX_TVA_DEFAUT) {
      const compteCollecte = t.numeroCompteCollecte
        ? await this.prisma.compte.findUnique({ where: { tenantId_numero: { tenantId, numero: t.numeroCompteCollecte } } })
        : null;
      const compteDeductible = t.numeroCompteDeductible
        ? await this.prisma.compte.findUnique({ where: { tenantId_numero: { tenantId, numero: t.numeroCompteDeductible } } })
        : null;
      await this.prisma.tauxTva.upsert({
        where: { tenantId_code: { tenantId, code: t.code } },
        update: {},
        create: {
          tenantId,
          code: t.code,
          intitule: t.intitule,
          taux: t.taux,
          compteCollecteId: compteCollecte?.id,
          compteDeductibleId: compteDeductible?.id,
        },
      });
    }
  }

  async lister(tenantId: string, actifsSeuls?: boolean) {
    return this.prisma.tauxTva.findMany({
      where: { tenantId, ...(actifsSeuls ? { estActif: true } : {}) },
      include: { compteCollecte: true, compteDeductible: true },
      orderBy: { taux: 'desc' },
    });
  }

  private async trouver(tenantId: string, id: string) {
    const taux = await this.prisma.tauxTva.findFirst({ where: { id, tenantId } });
    if (!taux) {
      throw new NotFoundException('Taux de TVA introuvable pour ce tenant');
    }
    return taux;
  }

  private async verifierComptes(tenantId: string, dto: { compteCollecteId?: string | null; compteDeductibleId?: string | null }) {
    for (const compteId of [dto.compteCollecteId, dto.compteDeductibleId]) {
      if (!compteId) continue;
      const compte = await this.prisma.compte.findFirst({ where: { id: compteId, tenantId } });
      if (!compte) {
        throw new NotFoundException('Compte introuvable pour ce tenant');
      }
    }
  }

  async creer(tenantId: string, dto: CreerTauxTvaDto) {
    const existant = await this.prisma.tauxTva.findUnique({ where: { tenantId_code: { tenantId, code: dto.code } } });
    if (existant) {
      throw new ConflictException(`Le taux de TVA ${dto.code} existe déjà pour ce tenant`);
    }
    await this.verifierComptes(tenantId, dto);
    return this.prisma.tauxTva.create({ data: { ...dto, tenantId } });
  }

  async modifier(tenantId: string, id: string, dto: ModifierTauxTvaDto) {
    await this.trouver(tenantId, id);
    await this.verifierComptes(tenantId, dto);
    return this.prisma.tauxTva.update({ where: { id }, data: dto });
  }

  /**
   * Prorata de déduction (art. 43 O.-L.) : rapport entre les recettes
   * ouvrant droit à déduction (opérations taxables — toute écriture portant
   * au moins une ligne de TVA, y compris au taux zéro export, qui ouvre
   * droit comme les autres) et les recettes totales (comptes de produits,
   * classe 7) sur la période, arrondi à l'**unité supérieure** (règle
   * explicite du texte, pas un arrondi mathématique standard).
   *
   * Fidélité assumée à notre modèle de données : le numérateur légal inclut
   * aussi les recettes aux missions diplomatiques/organisations
   * internationales (pas de compte dédié ici, donc non comptées à part —
   * l'écart ne joue que pour ce cas de figure précis) ; le dénominateur
   * légal exclut cessions d'actif immobilisé, subventions d'équipement et
   * indemnités d'assurance hors champ, qui ne sont de toute façon jamais
   * portées en classe 7 dans notre plan de comptes, donc déjà exclues
   * naturellement. S'applique globalement à toute la déduction (biens,
   * services, immobilisations) en l'absence d'option secteurs distincts
   * (art. 49, non implémentée — la seule option ici est le prorata général).
   */
  async calculerProrata(tenantId: string, dateDebut: Date, dateFin: Date) {
    const ecrituresTaxables = await this.prisma.ecriture.findMany({
      where: { tenantId, date: { gte: dateDebut, lte: dateFin }, lignes: { some: { tauxTvaId: { not: null } } } },
      select: { id: true },
    });
    const idsTaxables = ecrituresTaxables.map((e) => e.id);

    const numerateurAgg = await this.prisma.ligneEcriture.aggregate({
      where: { compte: { tenantId, classe: ClasseCompte.CLASSE_7 }, ecritureId: { in: idsTaxables } },
      _sum: { credit: true },
    });
    const denominateurAgg = await this.prisma.ligneEcriture.aggregate({
      where: { compte: { tenantId, classe: ClasseCompte.CLASSE_7 }, ecriture: { tenantId, date: { gte: dateDebut, lte: dateFin } } },
      _sum: { credit: true },
    });

    const numerateur = Number(numerateurAgg._sum.credit ?? 0);
    const denominateur = Number(denominateurAgg._sum.credit ?? 0);
    // Aucune recette sur la période : rien ne vient limiter la déduction —
    // 100 % plutôt qu'une division par zéro.
    const pourcentage = denominateur <= EPSILON ? 100 : Math.min(100, Math.ceil((numerateur / denominateur) * 100));

    return { numerateur, denominateur, pourcentage };
  }

  /**
   * Registre/déclaration TVA sur une période : pour chaque taux, somme les
   * lignes créditées sur son compte de collecte (443) et les lignes débitées
   * sur son compte de déduction (445), taguées à ce taux (LigneEcriture.
   * tauxTvaId — posé par la saisie guidée "Achat/Vente avec TVA"). Applique
   * le prorata de déduction (art. 43) à la TVA déductible brute pour obtenir
   * la TVA déductible admise. Reste lecture seule ici — voir
   * `comptabiliserLiquidation` pour poser l'écriture sur le compte 444.
   */
  async declaration(tenantId: string, dateDebut: Date, dateFin: Date) {
    const taux = await this.prisma.tauxTva.findMany({ where: { tenantId }, orderBy: { taux: 'desc' } });

    const lignes = [];
    for (const t of taux) {
      let totalCollecte = 0;
      let totalDeductible = 0;
      if (t.compteCollecteId) {
        const agg = await this.prisma.ligneEcriture.aggregate({
          where: { tauxTvaId: t.id, compteId: t.compteCollecteId, ecriture: { tenantId, date: { gte: dateDebut, lte: dateFin } } },
          _sum: { credit: true },
        });
        totalCollecte = Number(agg._sum.credit ?? 0);
      }
      if (t.compteDeductibleId) {
        const agg = await this.prisma.ligneEcriture.aggregate({
          where: { tauxTvaId: t.id, compteId: t.compteDeductibleId, ecriture: { tenantId, date: { gte: dateDebut, lte: dateFin } } },
          _sum: { debit: true },
        });
        totalDeductible = Number(agg._sum.debit ?? 0);
      }
      if (totalCollecte === 0 && totalDeductible === 0) continue; // taux sans mouvement sur la période
      lignes.push({
        tauxId: t.id,
        code: t.code,
        intitule: t.intitule,
        taux: Number(t.taux),
        compteCollecteId: t.compteCollecteId,
        compteDeductibleId: t.compteDeductibleId,
        totalCollecte,
        totalDeductible,
        net: totalCollecte - totalDeductible,
      });
    }

    const totalCollecte = lignes.reduce((s, l) => s + l.totalCollecte, 0);
    const totalDeductible = lignes.reduce((s, l) => s + l.totalDeductible, 0);
    const prorata = await this.calculerProrata(tenantId, dateDebut, dateFin);
    const totalDeductibleAdmise = Math.round(totalDeductible * (prorata.pourcentage / 100) * 100) / 100;
    const net = totalCollecte - totalDeductibleAdmise;

    return {
      dateDebut,
      dateFin,
      lignes,
      prorata,
      totalCollecte,
      totalDeductible,
      totalDeductibleAdmise,
      net,
      sens: net >= 0 ? ('A_PAYER' as const) : ('CREDIT' as const),
    };
  }

  /**
   * Comptabilise la liquidation périodique : solde, par compte réellement
   * utilisé (en général 443100/445100 partagés — voir le seed — mais un
   * tenant peut avoir personnalisé des comptes différents par taux), la TVA
   * collectée et la TVA déductible ADMISE (après prorata), et porte la
   * différence sur le compte 444100 (crédit = TVA due, débit = crédit de TVA
   * à reporter). Pose une écriture NORMALE via EcritureService.creer — mêmes
   * contrôles que n'importe quelle saisie (équilibre, exercice ouvert,
   * clôtures Partielle/Totale/Période). Aucun verrou anti-double-liquidation
   * pour l'instant : reposter la même période créerait une seconde écriture
   * — à la charge de l'utilisateur de ne pas le faire (enrichissement futur
   * possible : marquer la période comme liquidée).
   */
  async comptabiliserLiquidation(
    tenantId: string,
    userId: string,
    dto: { exerciceId: string; dateDebut: string; dateFin: string; date?: string },
  ) {
    const dateDebut = new Date(dto.dateDebut);
    const dateFin = new Date(dto.dateFin);
    const decl = await this.declaration(tenantId, dateDebut, dateFin);

    if (decl.totalCollecte <= EPSILON && decl.totalDeductibleAdmise <= EPSILON) {
      throw new BadRequestException('Aucun mouvement de TVA sur cette période — rien à comptabiliser.');
    }

    const ratio = decl.prorata.pourcentage / 100;
    const parCompteCollecte = new Map<string, number>();
    const parCompteDeductible = new Map<string, number>();
    for (const l of decl.lignes) {
      if (l.compteCollecteId && l.totalCollecte > 0) {
        parCompteCollecte.set(l.compteCollecteId, (parCompteCollecte.get(l.compteCollecteId) ?? 0) + l.totalCollecte);
      }
      if (l.compteDeductibleId && l.totalDeductible > 0) {
        const admise = Math.round(l.totalDeductible * ratio * 100) / 100;
        parCompteDeductible.set(l.compteDeductibleId, (parCompteDeductible.get(l.compteDeductibleId) ?? 0) + admise);
      }
    }

    const compte444 = await this.prisma.compte.findFirst({ where: { tenantId, numero: '444100' } });
    if (!compte444) {
      throw new BadRequestException(
        "Compte 444100 (État, TVA due ou crédit de TVA) introuvable pour ce tenant — nécessaire pour comptabiliser la liquidation.",
      );
    }

    const lignesEcriture: Array<{ compteId: string; debit?: number; credit?: number; libelle?: string }> = [];
    for (const [compteId, montant] of parCompteCollecte) {
      lignesEcriture.push({ compteId, debit: montant, credit: 0, libelle: 'Liquidation TVA — solde TVA collectée' });
    }
    for (const [compteId, montant] of parCompteDeductible) {
      lignesEcriture.push({ compteId, debit: 0, credit: montant, libelle: 'Liquidation TVA — solde TVA déductible admise' });
    }
    if (Math.abs(decl.net) > EPSILON) {
      if (decl.net > 0) {
        lignesEcriture.push({ compteId: compte444.id, debit: 0, credit: decl.net, libelle: 'TVA due' });
      } else {
        lignesEcriture.push({ compteId: compte444.id, debit: -decl.net, credit: 0, libelle: 'Crédit de TVA à reporter' });
      }
    }

    if (lignesEcriture.length < 2) {
      throw new BadRequestException('Rien à comptabiliser sur cette période.');
    }

    const journal =
      (await this.prisma.journal.findFirst({ where: { tenantId, code: 'OD' } })) ??
      (await this.prisma.journal.findFirst({ where: { tenantId, type: TypeJournal.GENERAL } }));
    if (!journal) {
      throw new BadRequestException(
        "Aucun journal de type Général disponible pour enregistrer la liquidation TVA (journal 'OD' attendu).",
      );
    }

    const date = dto.date ? new Date(dto.date) : dateFin;
    const ecriture = await this.ecritureService.creer(tenantId, userId, {
      exerciceId: dto.exerciceId,
      journalId: journal.id,
      date: date.toISOString(),
      libelle: `Liquidation TVA — période du ${dto.dateDebut} au ${dto.dateFin}`,
      lignes: lignesEcriture,
    });

    return { ecriture, declaration: decl };
  }
}
