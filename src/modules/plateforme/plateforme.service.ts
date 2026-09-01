import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { Referentiel, StatutLicence, TypeLicence } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { AuthService } from '../auth/auth.service';
import { CreerCabinetDto, ModifierGroupeDto, ModifierLicenceDto } from './dto/plateforme.dto';

/**
 * Console de l'opérateur de plateforme : vue transversale des cabinets
 * clients (tenants), gestion de leurs licences, création de dossiers.
 * Toutes les méthodes sont protégées par OperateurPlateformeGuard au niveau
 * du contrôleur · aucune n'est atteignable par un ADMIN_CABINET ordinaire.
 */
@Injectable()
export class PlateformeService implements OnModuleInit {
  private readonly logger = new Logger(PlateformeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly authService: AuthService,
  ) {}

  /**
   * BOOTSTRAP DES OPÉRATEURS · `OPERATEURS_PLATEFORME` (variable
   * d'environnement, adresses e-mail séparées par des virgules) accorde le
   * drapeau au démarrage. ACCORD SEULEMENT, jamais de retrait automatique :
   * une variable absente (oubliée dans un déploiement) ne doit pas destituer
   * tous les opérateurs en silence · la révocation est un geste manuel (SQL).
   * Une adresse encore inconnue n'est pas une erreur : le compte sera promu
   * au premier redémarrage qui suit sa création.
   */
  async onModuleInit() {
    const brut = this.config.get<string>('OPERATEURS_PLATEFORME');
    if (!brut) return;
    const emails = brut
      .split(',')
      .map((e) => e.trim())
      .filter((e) => e.length > 0);
    for (const email of emails) {
      const { count } = await this.prisma.user.updateMany({
        // insensitive : l'adresse saisie à l'inscription peut différer en
        // casse de celle de la variable d'environnement.
        where: { email: { equals: email, mode: 'insensitive' }, estOperateurPlateforme: false },
        data: { estOperateurPlateforme: true },
      });
      if (count > 0) {
        this.logger.log(`Opérateur de plateforme accordé : ${email}`);
      }
    }
  }

  /** Vue d'ensemble des cabinets clients, licence et volumétrie comprises. */
  async listeCabinets() {
    const tenants = await this.prisma.tenant.findMany({
      // Les dossiers de combinaison sont TECHNIQUES (voir GroupeService.
      // liasseGroupe) : régénérés par le serveur, sans utilisateurs · ils
      // n'ont rien à faire dans la liste des cabinets clients.
      where: { combinaisonPour: null },
      orderBy: { nom: 'asc' },
      select: {
        id: true,
        nom: true,
        referentiel: true,
        jeuEtatsFinanciersSycebnl: true,
        systemeComptableSyscohada: true,
        ville: true,
        pays: true,
        numeroImpot: true,
        createdAt: true,
        licence: {
          select: { type: true, statut: true, dateDebut: true, dateExpiration: true, dernierHeartbeatAt: true },
        },
        dossierMere: { select: { id: true, nom: true } },
        plafondCellules: true,
        _count: { select: { users: true, ecritures: true, cellules: true } },
      },
    });
    return tenants.map((t) => ({
      id: t.id,
      nom: t.nom,
      referentiel: t.referentiel,
      jeuEtatsFinanciersSycebnl: t.jeuEtatsFinanciersSycebnl,
      systemeComptableSyscohada: t.systemeComptableSyscohada,
      ville: t.ville,
      pays: t.pays,
      numeroImpot: t.numeroImpot,
      createdAt: t.createdAt,
      licence: t.licence,
      dossierMere: t.dossierMere,
      plafondCellules: t.plafondCellules,
      nbCellules: t._count.cellules,
      nbUtilisateurs: t._count.users,
      nbEcritures: t._count.ecritures,
    }));
  }

  /**
   * Suspension, réactivation, changement de type, renouvellement. EXPIREE ne
   * se décrète pas (refusée par le DTO) : elle découle de dateExpiration,
   * évaluée à chaque requête par LicenceService · « renouveler », c'est donc
   * poser une nouvelle échéance, le statut ACTIVE suffisant ensuite.
   */
  async modifierLicence(tenantId: string, dto: ModifierLicenceDto) {
    const licence = await this.prisma.licence.findUnique({ where: { tenantId } });
    if (!licence) {
      throw new NotFoundException('Cabinet introuvable ou sans licence');
    }
    if (dto.type === undefined && dto.statut === undefined && dto.dateExpiration === undefined) {
      throw new BadRequestException('Aucune modification demandée');
    }
    const donnees = {
      ...(dto.type !== undefined ? { type: dto.type } : {}),
      ...(dto.statut !== undefined ? { statut: dto.statut } : {}),
      // '' efface l'échéance (passage en perpétuel) · convention partagée
      // avec les dates des paramètres du dossier.
      ...(dto.dateExpiration !== undefined
        ? { dateExpiration: dto.dateExpiration === '' ? null : new Date(dto.dateExpiration) }
        : {}),
    };
    const resultat = await this.prisma.licence.update({
      where: { tenantId },
      data: donnees,
      select: { type: true, statut: true, dateDebut: true, dateExpiration: true, dernierHeartbeatAt: true },
    });
    // CASCADE DE GROUPE · les cellules d'un dossier mère n'ont pas de licence
    // commerciale propre : elles reflètent celle de la mère. Suspendre,
    // réactiver ou renouveler la mère fait donc le même geste sur toutes ses
    // cellules d'un coup · une seule licence vendue, un seul robinet.
    const cellulesCascade = await this.prisma.licence.updateMany({
      where: { tenant: { dossierMereId: tenantId } },
      data: donnees,
    });
    return { ...resultat, cellulesEnCascade: cellulesCascade.count };
  }

  /**
   * Rattache un dossier comme cellule d'un dossier mère (null détache).
   * UN SEUL NIVEAU de groupe, et dans un seul sens : une mère n'a pas de
   * mère, un dossier qui a des cellules ne devient pas cellule. Deux
   * hiérarchies imbriquées rendraient l'agrégation ambiguë (qui agrège
   * qui ?) sans répondre à aucun cas réel · une église et ses cellules,
   * un siège et ses antennes, c'est toujours un étage.
   */
  async modifierGroupe(tenantId: string, dto: ModifierGroupeDto) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, _count: { select: { cellules: true } } },
    });
    if (!tenant) {
      throw new NotFoundException('Cabinet introuvable');
    }
    // Le plafond de cellules se règle indépendamment du rattachement · un
    // appel peut ne porter que lui.
    if (dto.plafondCellules !== undefined) {
      await this.prisma.tenant.update({
        where: { id: tenantId },
        data: { plafondCellules: dto.plafondCellules },
      });
    }
    if (dto.dossierMereId === undefined) {
      return { id: tenantId, plafondCellules: dto.plafondCellules ?? null };
    }
    const dossierMereId = dto.dossierMereId ?? null;
    if (dossierMereId !== null) {
      if (dossierMereId === tenantId) {
        throw new BadRequestException('Un dossier ne peut pas être sa propre mère');
      }
      if (tenant._count.cellules > 0) {
        throw new BadRequestException('Ce dossier a des cellules · il ne peut pas devenir lui-même une cellule');
      }
      const mere = await this.prisma.tenant.findUnique({
        where: { id: dossierMereId },
        select: { id: true, dossierMereId: true },
      });
      if (!mere) {
        throw new NotFoundException('Dossier mère introuvable');
      }
      if (mere.dossierMereId !== null) {
        throw new BadRequestException('Le dossier mère désigné est lui-même une cellule · un groupe n’a qu’un niveau');
      }
    }
    await this.prisma.tenant.update({ where: { id: tenantId }, data: { dossierMereId } });
    return { id: tenantId, dossierMereId };
  }

  /**
   * Crée un cabinet client par LE MÊME pipeline que l'inscription publique
   * (AuthService.register : tenant + licence + admin + plan de comptes +
   * journaux + taxes + familles immo + plans analytiques + relances +
   * exercice) · aucun second chemin de création à maintenir. Le mot de passe
   * de l'admin est généré ici et renvoyé UNE SEULE FOIS : il n'est stocké
   * que haché, l'opérateur le remet au client qui le change à sa première
   * connexion (Fichier > Autorisations d'accès).
   */
  async creerCabinet(dto: CreerCabinetDto) {
    // 16 caractères base64url · large au-delà du minimum de 10 du RegisterDto.
    const motDePasseTemporaire = randomBytes(12).toString('base64url');
    const resultat = await this.authService.register({
      nomEntite: dto.nomEntite,
      // SYCEBNL par défaut (clientèle associative) · l'opérateur choisit
      // SYSCOHADA pour un client commercial, register() sème le bon plan.
      referentiel: dto.referentiel ?? Referentiel.SYCEBNL,
      email: dto.emailAdmin,
      motDePasse: motDePasseTemporaire,
      jeuEtatsFinanciersSycebnl: dto.jeuEtatsFinanciersSycebnl,
      systemeComptableSyscohada: dto.systemeComptableSyscohada,
      typeLicence: dto.typeLicence ?? TypeLicence.ABONNEMENT,
      activite: dto.activite,
      adresse: dto.adresse,
      ville: dto.ville,
      pays: dto.pays,
      telephone: dto.telephone,
      devise: dto.devise,
      dateDebutExercice: dto.dateDebutExercice,
      dateFinExercice: dto.dateFinExercice,
    });
    // Échéance de licence choisie à la création · register() n'en pose pas
    // (l'auto-inscription publique n'a pas de flux commercial).
    if (dto.dateExpiration) {
      await this.prisma.licence.update({
        where: { tenantId: resultat.tenant.id },
        data: { dateExpiration: new Date(dto.dateExpiration), statut: StatutLicence.ACTIVE },
      });
    }
    // Rattachement au groupe à la création · mêmes validations que le PATCH.
    if (dto.dossierMereId) {
      await this.modifierGroupe(resultat.tenant.id, { dossierMereId: dto.dossierMereId });
    }
    // Le mot de passe a transité par l'opérateur · le client devra le
    // remplacer à sa première connexion (voir schema.prisma, User).
    await this.prisma.user.update({
      where: { email: dto.emailAdmin },
      data: { doitChangerMotDePasse: true },
    });
    return {
      tenant: resultat.tenant,
      exercice: resultat.exercice,
      adminEmail: dto.emailAdmin,
      // Le jeton d'accès de register() n'est PAS retransmis : la session du
      // nouveau dossier appartient au client, pas à l'opérateur.
      motDePasseTemporaire,
    };
  }
}
