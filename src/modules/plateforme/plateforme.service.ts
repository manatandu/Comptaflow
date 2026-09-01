import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { Referentiel, StatutLicence, TypeLicence } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { AuthService } from '../auth/auth.service';
import { CreerCabinetDto, ModifierLicenceDto } from './dto/plateforme.dto';

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
      orderBy: { nom: 'asc' },
      select: {
        id: true,
        nom: true,
        referentiel: true,
        jeuEtatsFinanciersSycebnl: true,
        ville: true,
        pays: true,
        numeroImpot: true,
        createdAt: true,
        licence: {
          select: { type: true, statut: true, dateDebut: true, dateExpiration: true, dernierHeartbeatAt: true },
        },
        _count: { select: { users: true, ecritures: true } },
      },
    });
    return tenants.map((t) => ({
      id: t.id,
      nom: t.nom,
      referentiel: t.referentiel,
      jeuEtatsFinanciersSycebnl: t.jeuEtatsFinanciersSycebnl,
      ville: t.ville,
      pays: t.pays,
      numeroImpot: t.numeroImpot,
      createdAt: t.createdAt,
      licence: t.licence,
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
    return this.prisma.licence.update({
      where: { tenantId },
      data: {
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.statut !== undefined ? { statut: dto.statut } : {}),
        // '' efface l'échéance (passage en perpétuel) · convention partagée
        // avec les dates des paramètres du dossier.
        ...(dto.dateExpiration !== undefined
          ? { dateExpiration: dto.dateExpiration === '' ? null : new Date(dto.dateExpiration) }
          : {}),
      },
      select: { type: true, statut: true, dateDebut: true, dateExpiration: true, dernierHeartbeatAt: true },
    });
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
      // SYCEBNL imposé côté serveur · register() refuse de toute façon le
      // SYSCOHADA tant que son plan de comptes n'est pas construit.
      referentiel: Referentiel.SYCEBNL,
      email: dto.emailAdmin,
      motDePasse: motDePasseTemporaire,
      jeuEtatsFinanciersSycebnl: dto.jeuEtatsFinanciersSycebnl,
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
