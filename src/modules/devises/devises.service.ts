import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { Prisma, StatutExercice } from '@prisma/client';
import { EcritureService } from '../comptabilite/ecriture.service';
import { CreerDeviseDto, ModifierDeviseDto, PoserCoursDto, ReevaluerDto } from './dto/devises.dto';

/** Comptes de la réévaluation, par racine du plan SYCEBNL. */
const RACINE = {
  ecartActif: '478', // Écarts de conversion-Actif · perte probable
  ecartPassif: '479', // Écarts de conversion-Passif · gain probable
  provision: '194', // Provisions pour pertes de change
  dotationProvision: '6971', // Dotations aux provisions pour risques et charges (financières)
  reprisProvision: '7971', // Reprises de provisions pour risques et charges (financières)
  perteRealisee: '676', // Pertes de change financières
  gainRealise: '776', // Gains de change financiers
} as const;

/** Une position en devise à réévaluer : un compte, une devise, son écart. */
export interface PositionDevise {
  compteId: string;
  numero: string;
  intitule: string;
  deviseCode: string;
  deviseId: string;
  /** Solde en devise (débit − crédit). */
  montantDevise: number;
  /** Contre-valeur inscrite en comptabilité, aux cours d'origine. */
  valeurComptable: number;
  coursCloture: number;
  /** Contre-valeur au cours de clôture. */
  valeurReevaluee: number;
  ecart: number;
  /** Vrai pour un compte de classe 5 · l'écart y est réalisé, non latent. */
  estTresorerie: boolean;
}

export interface RapportReevaluation {
  dateReevaluation: string;
  positions: PositionDevise[];
  /** Créances et dettes · écarts LATENTS, comptes 478 / 479. */
  perteLatente: number;
  gainLatent: number;
  /** Disponibilités · écarts RÉALISÉS, comptes 676 / 776. */
  perteRealisee: number;
  gainRealise: number;
  /** Provision à doter sur la perte latente (194 par 6971). */
  provision: number;
  coursManquants: string[];
}

/**
 * MULTIDEVISE ET RÉÉVALUATION · Traitement → Réévaluation des dettes et
 * créances en devise chez Sage 100 i7, calé sur la RDC et sur ce que le
 * SYCEBNL dit précisément.
 *
 * Le texte sépare deux traitements que l'on confond souvent (Partie 2 ch. 3,
 * comptes 47, 67 et 77) :
 *
 *  - une CRÉANCE ou une DETTE en devise donne à la clôture un écart LATENT :
 *    478 si l'entité y perdrait, 479 si elle y gagnerait. Le texte prend soin
 *    de le dire : « Le compte 676 ne doit pas être confondu avec le compte 478
 *    qui n'enregistre que les pertes probables de change. » Et par prudence, la
 *    perte probable appelle une provision (194 par 6971) ;
 *
 *  - une DISPONIBILITÉ en devise donne un écart RÉALISÉ : « les écarts de
 *    conversion négatifs constatés à la clôture sur les disponibilités en
 *    devises sont considérés comme étant des pertes de change supportées ».
 *    Ils vont donc droit au résultat, 676 ou 776, sans provision.
 *
 * Les écarts latents sont contre-passés à l'ouverture de l'exercice suivant :
 * ils décrivent une situation à une date, pas une opération.
 */
@Injectable()
export class DevisesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ecritureService: EcritureService,
  ) {}

  // --- Référentiel ---------------------------------------------------------

  async lister(tenantId: string) {
    return this.prisma.devise.findMany({
      where: { tenantId },
      orderBy: { code: 'asc' },
      include: { cours: { orderBy: { date: 'desc' }, take: 12 } },
    });
  }

  async creer(tenantId: string, dto: CreerDeviseDto) {
    const code = dto.code.toUpperCase();
    const existante = await this.prisma.devise.findFirst({ where: { tenantId, code } });
    if (existante) throw new ConflictException(`La devise ${code} existe déjà dans ce dossier`);
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (tenant?.devise && tenant.devise.toUpperCase() === code) {
      throw new BadRequestException(
        `${code} est la monnaie de tenue de ce dossier : elle n'a pas de cours et ne se réévalue pas.`,
      );
    }
    return this.prisma.devise.create({ data: { tenantId, code, intitule: dto.intitule } });
  }

  async modifier(tenantId: string, deviseId: string, dto: ModifierDeviseDto) {
    await this.trouver(tenantId, deviseId);
    return this.prisma.devise.update({ where: { id: deviseId }, data: dto });
  }

  async poserCours(tenantId: string, deviseId: string, dto: PoserCoursDto) {
    await this.trouver(tenantId, deviseId);
    const date = new Date(dto.date);
    return this.prisma.coursDevise.upsert({
      where: { deviseId_date: { deviseId, date } },
      create: { deviseId, date, cours: new Prisma.Decimal(dto.cours), source: dto.source },
      update: { cours: new Prisma.Decimal(dto.cours), source: dto.source },
    });
  }

  private async trouver(tenantId: string, deviseId: string) {
    const devise = await this.prisma.devise.findFirst({ where: { id: deviseId, tenantId } });
    if (!devise) throw new NotFoundException('Devise introuvable pour ce dossier');
    return devise;
  }

  /**
   * Cours applicable à une date : le dernier coté à cette date ou avant. Une
   * cotation postérieure n'est pas retenue · on ne réévalue pas une clôture
   * avec un cours qui n'existait pas encore.
   */
  private async coursA(deviseId: string, date: Date): Promise<number | null> {
    const cote = await this.prisma.coursDevise.findFirst({
      where: { deviseId, date: { lte: date } },
      orderBy: { date: 'desc' },
    });
    return cote ? Number(cote.cours) : null;
  }

  // --- Réévaluation --------------------------------------------------------

  /** Positions en devise d'un exercice, et leur écart au cours de clôture. */
  async calculer(tenantId: string, dto: ReevaluerDto): Promise<RapportReevaluation> {
    const exercice = await this.prisma.exercice.findFirst({ where: { id: dto.exerciceId, tenantId } });
    if (!exercice) throw new BadRequestException('Exercice introuvable pour ce dossier');
    const date = dto.dateReevaluation ? new Date(dto.dateReevaluation) : exercice.dateFin;

    const lignes = await this.prisma.ligneEcriture.findMany({
      where: {
        ecriture: { tenantId, exerciceId: dto.exerciceId, date: { lte: date } },
        deviseId: { not: null },
        // Une ligne lettrée est soldée : sa créance n'existe plus, il n'y a
        // rien à réévaluer.
        lettre: null,
      },
      include: {
        compte: { select: { id: true, numero: true, intitule: true } },
        devise: { select: { id: true, code: true } },
      },
    });

    // Agrégation par (compte, devise) : c'est la position nette qui se
    // réévalue, pas chaque ligne prise isolément.
    const positions = new Map<string, PositionDevise>();
    for (const l of lignes) {
      if (!l.devise) continue;
      const cle = `${l.compteId}|${l.deviseId}`;
      const acc =
        positions.get(cle) ??
        ({
          compteId: l.compte.id,
          numero: l.compte.numero,
          intitule: l.compte.intitule,
          deviseCode: l.devise.code,
          deviseId: l.devise.id,
          montantDevise: 0,
          valeurComptable: 0,
          coursCloture: 0,
          valeurReevaluee: 0,
          ecart: 0,
          estTresorerie: l.compte.numero.startsWith('5'),
        } satisfies PositionDevise);
      // Le montant en devise est stocké sans signe : c'est le sens de la ligne
      // (débit ou crédit) qui le donne.
      const sens = Number(l.debit) > 0 ? 1 : -1;
      acc.montantDevise += sens * Number(l.montantDevise ?? 0);
      acc.valeurComptable += Number(l.debit) - Number(l.credit);
      positions.set(cle, acc);
    }

    const coursManquants = new Set<string>();
    const resultat: PositionDevise[] = [];
    for (const p of positions.values()) {
      if (Math.abs(p.montantDevise) < 0.005 && Math.abs(p.valeurComptable) < 0.005) continue;
      const cours = await this.coursA(p.deviseId, date);
      if (cours === null) {
        coursManquants.add(p.deviseCode);
        continue;
      }
      p.coursCloture = cours;
      p.valeurReevaluee = Math.round(p.montantDevise * cours * 100) / 100;
      p.ecart = Math.round((p.valeurReevaluee - p.valeurComptable) * 100) / 100;
      if (Math.abs(p.ecart) >= 0.005) resultat.push(p);
    }

    // Un écart POSITIF sur un actif (créance, disponibilité) est un gain ; sur
    // un passif (dette, solde créditeur) c'est aussi un gain, puisque la dette
    // en monnaie de tenue diminue quand l'écart calculé est positif au sens
    // débit − crédit. La lecture par le signe de l'écart est donc directe.
    const latentes = resultat.filter((p) => !p.estTresorerie);
    const tresorerie = resultat.filter((p) => p.estTresorerie);

    const perteLatente = latentes.filter((p) => p.ecart < 0).reduce((s, p) => s - p.ecart, 0);
    const gainLatent = latentes.filter((p) => p.ecart > 0).reduce((s, p) => s + p.ecart, 0);
    const perteRealisee = tresorerie.filter((p) => p.ecart < 0).reduce((s, p) => s - p.ecart, 0);
    const gainRealise = tresorerie.filter((p) => p.ecart > 0).reduce((s, p) => s + p.ecart, 0);

    return {
      dateReevaluation: date.toISOString().slice(0, 10),
      positions: resultat,
      perteLatente: Math.round(perteLatente * 100) / 100,
      gainLatent: Math.round(gainLatent * 100) / 100,
      perteRealisee: Math.round(perteRealisee * 100) / 100,
      gainRealise: Math.round(gainRealise * 100) / 100,
      // Prudence : la perte probable est provisionnée, le gain probable ne
      // l'est pas · un gain latent ne se constate jamais en résultat.
      provision: Math.round(perteLatente * 100) / 100,
      coursManquants: [...coursManquants],
    };
  }

  /** Passe les écritures de réévaluation, et la provision qui l'accompagne. */
  async reevaluer(tenantId: string, createdBy: string, dto: ReevaluerDto) {
    const rapport = await this.calculer(tenantId, dto);
    if (dto.simulation) return { rapport, ecritures: [] as string[] };
    if (rapport.positions.length === 0) {
      throw new BadRequestException("Aucune position en devise à réévaluer à cette date.");
    }
    if (rapport.coursManquants.length > 0) {
      throw new BadRequestException(
        `Aucun cours coté au ${rapport.dateReevaluation} ou avant pour : ${rapport.coursManquants.join(', ')}. ` +
          'Renseignez le cours de clôture avant de réévaluer.',
      );
    }

    const exercice = await this.prisma.exercice.findFirst({ where: { id: dto.exerciceId, tenantId } });
    if (!exercice) throw new BadRequestException('Exercice introuvable pour ce dossier');
    if (exercice.statut === StatutExercice.CLOTURE) {
      throw new BadRequestException("L'exercice est clôturé.");
    }
    const dejaFaite = await this.prisma.reevaluation.findFirst({
      where: { tenantId, exerciceId: dto.exerciceId, dateReevaluation: new Date(rapport.dateReevaluation) },
    });
    if (dejaFaite) {
      throw new ConflictException(
        `Une réévaluation a déjà été passée au ${rapport.dateReevaluation} sur cet exercice.`,
      );
    }

    const journal = await this.journalGeneral(tenantId);
    const compte = (racine: string) => this.compteParRacine(tenantId, racine);

    // --- Écriture des écarts ------------------------------------------------
    const lignes: { compteId: string; debit?: number; credit?: number; libelle: string }[] = [];
    for (const p of rapport.positions) {
      const contrepartie = p.estTresorerie
        ? p.ecart < 0
          ? await compte(RACINE.perteRealisee)
          : await compte(RACINE.gainRealise)
        : p.ecart < 0
          ? await compte(RACINE.ecartActif)
          : await compte(RACINE.ecartPassif);
      const abs = Math.abs(p.ecart);
      const libelle = `Réévaluation ${p.deviseCode} au ${rapport.dateReevaluation}`;
      if (p.ecart > 0) {
        lignes.push({ compteId: p.compteId, debit: abs, libelle });
        lignes.push({ compteId: contrepartie.id, credit: abs, libelle });
      } else {
        lignes.push({ compteId: contrepartie.id, debit: abs, libelle });
        lignes.push({ compteId: p.compteId, credit: abs, libelle });
      }
    }

    const ecritureEcarts = await this.ecritureService.creer(tenantId, createdBy, {
      exerciceId: dto.exerciceId,
      journalId: journal.id,
      date: rapport.dateReevaluation,
      libelle: `Réévaluation des créances et dettes en devises au ${rapport.dateReevaluation}`,
      reference: 'REEVAL',
      lignes,
    });

    // --- Provision sur la perte latente ------------------------------------
    let ecritureProvision: { id: string } | null = null;
    if (rapport.provision > 0.005) {
      const [dotation, provision] = await Promise.all([
        compte(RACINE.dotationProvision),
        compte(RACINE.provision),
      ]);
      ecritureProvision = await this.ecritureService.creer(tenantId, createdBy, {
        exerciceId: dto.exerciceId,
        journalId: journal.id,
        date: rapport.dateReevaluation,
        libelle: `Provision pour perte de change au ${rapport.dateReevaluation}`,
        reference: 'REEVAL',
        lignes: [
          { compteId: dotation.id, debit: rapport.provision, libelle: 'Dotation provision perte de change' },
          { compteId: provision.id, credit: rapport.provision, libelle: 'Provision pour pertes de change' },
        ],
      });
    }

    const reevaluation = await this.prisma.reevaluation.create({
      data: {
        tenantId,
        exerciceId: dto.exerciceId,
        dateReevaluation: new Date(rapport.dateReevaluation),
        ecritureEcartsId: ecritureEcarts.id,
        ecritureProvisionId: ecritureProvision?.id,
        createdBy,
      },
    });

    return {
      rapport,
      reevaluationId: reevaluation.id,
      ecritures: [ecritureEcarts.id, ...(ecritureProvision ? [ecritureProvision.id] : [])],
    };
  }

  /**
   * Contre-passe les écarts de conversion à l'ouverture de l'exercice suivant.
   *
   * Contrairement à la reprise d'une régularisation, qui se fait à la FIN de
   * l'exercice concerné (Partie 3 ch. 6), l'écart de conversion se contre-passe
   * bien à l'OUVERTURE : il décrit une situation à une date d'arrêté, pas une
   * charge ou un produit rattaché à une période. Le laisser vivre fausserait
   * toutes les positions de l'exercice suivant.
   */
  async extourner(tenantId: string, createdBy: string, reevaluationId: string, exerciceSuivantId: string) {
    const reeval = await this.prisma.reevaluation.findFirst({
      where: { id: reevaluationId, tenantId },
      include: { ecritureEcarts: { include: { lignes: true } } },
    });
    if (!reeval) throw new NotFoundException('Réévaluation introuvable pour ce dossier');
    if (reeval.ecritureExtourneId) throw new ConflictException('Cette réévaluation a déjà été extournée.');
    if (!reeval.ecritureEcarts) throw new BadRequestException("Aucune écriture d'écarts à extourner.");

    const suivant = await this.prisma.exercice.findFirst({ where: { id: exerciceSuivantId, tenantId } });
    if (!suivant) throw new BadRequestException('Exercice suivant introuvable pour ce dossier');
    if (suivant.statut === StatutExercice.CLOTURE) throw new BadRequestException("L'exercice suivant est clôturé.");

    const journal = await this.journalGeneral(tenantId);
    const ecriture = await this.ecritureService.creer(tenantId, createdBy, {
      exerciceId: suivant.id,
      journalId: journal.id,
      date: suivant.dateDebut.toISOString().slice(0, 10),
      libelle: `Contre-passation des écarts de conversion du ${reeval.dateReevaluation.toISOString().slice(0, 10)}`,
      reference: 'REEVAL',
      lignes: reeval.ecritureEcarts.lignes.map((l) => ({
        compteId: l.compteId,
        // Sens inverse, ligne à ligne.
        debit: Number(l.credit) || undefined,
        credit: Number(l.debit) || undefined,
        libelle: l.libelle ?? undefined,
      })),
    });

    return this.prisma.reevaluation.update({
      where: { id: reevaluationId },
      data: { ecritureExtourneId: ecriture.id },
    });
  }

  async listerReevaluations(tenantId: string, exerciceId: string) {
    return this.prisma.reevaluation.findMany({
      where: { tenantId, exerciceId },
      orderBy: { dateReevaluation: 'desc' },
      include: {
        ecritureEcarts: { select: { id: true, numeroPiece: true, date: true } },
        ecritureProvision: { select: { id: true, numeroPiece: true } },
        ecritureExtourne: { select: { id: true, numeroPiece: true, date: true } },
      },
    });
  }

  private async compteParRacine(tenantId: string, racine: string) {
    const compte = await this.prisma.compte.findFirst({
      where: { tenantId, numero: { startsWith: racine }, typeCompte: 'DETAIL', estActif: true },
      orderBy: { numero: 'asc' },
    });
    if (!compte) {
      throw new BadRequestException(
        `Aucun compte ${racine} dans le plan de ce dossier. La réévaluation en a besoin ; créez-le avant de relancer.`,
      );
    }
    return compte;
  }

  private async journalGeneral(tenantId: string) {
    const journal =
      (await this.prisma.journal.findFirst({ where: { tenantId, code: 'OD' } })) ??
      (await this.prisma.journal.findFirst({ where: { tenantId, type: 'GENERAL' } }));
    if (!journal) {
      throw new BadRequestException("Aucun journal général (code OD) pour recevoir les écritures de réévaluation.");
    }
    return journal;
  }
}
