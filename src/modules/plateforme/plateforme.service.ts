import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit, Optional } from '@nestjs/common';
import { normaliserCourriel } from '../../common/courriel';
import { SANS_DOUBLE_AUTH } from '../auth/double-authentification';
import { DECOMPTE_REMIS_A_ZERO } from '../auth/verrouillage';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { FormeJuridiqueSyscohada, Referentiel, RoleUtilisateur, StatutEcriture, StatutLicence, SystemeComptableSyscohada, TypeLicence } from '@prisma/client';
import { GarnissageDemonstrationService } from './garnissage-demonstration.service';
import { scenarioDemonstration } from './scenario-demonstration';
import { MODULES_OPTIONNELS } from '../tenant/modules-optionnels';
import { siSycebnl } from '../../common/reponse-referentiel';
import { PrismaService } from '../../common/prisma.service';
import { AuthService } from '../auth/auth.service';
import { CreerCabinetDto, ModifierGroupeDto, ModifierLicenceDto } from './dto/plateforme.dto';
import { horsCloisonnement } from '../../common/cloisonnement/contexte-cloisonnement';
import * as bcrypt from 'bcryptjs';
import { licenceDeCellule, LicenceReflet, refuserCelluleEditeur } from '../licence/licence-de-cellule';
import { PLAFOND_LISTE_CONSOLE, tranche } from './plafond-console';
import { dateSaisieOuEffacement } from '../tenant/date-effacable';

/** Le refus d'attribuer « Perpétuelle (sur site) » à un dossier hébergé (audit final F171). */
export const MOTIF_SUR_SITE_NON_ATTRIBUABLE =
  'Licence « Perpétuelle (sur site) » non attribuable à un dossier hébergé · une installation sur site ' +
  'tient sa licence d’un fichier signé, émis dans le cadre « Licences sur site » de la console. Pour une ' +
  'licence sans échéance en ligne, choisir « Perpétuelle (SaaS) ».';

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
    @Optional() private readonly garnissage?: GarnissageDemonstrationService,
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
      .map((e) => normaliserCourriel(e))
      .filter((e) => e.length > 0);
    for (const email of emails) {
      // PAR ÉGALITÉ EXACTE, JAMAIS PAR LA CASSE (audit final F43). La
      // recherche insensible à la casse promouvait n'importe quel compte
      // « ADMIN@… » créé dans n'importe quel dossier, alors que l'unicité des
      // adresses est sensible à la casse · un administrateur de dossier
      // obtenait la console au déploiement suivant. Les adresses sont
      // désormais normalisées à chaque porte, et l'unicité en fait UN compte
      // au plus par adresse.
      //
      // SORTIE DE CLOISONNEMENT · la promotion court au DÉMARRAGE, hors de
      // toute requête et donc hors de tout dossier, et vise une adresse sur
      // l'ensemble de la plateforme.
      const { count } = await horsCloisonnement('démarrage · promotion des opérateurs de la plateforme', () =>
        this.prisma.user.updateMany({
          where: { email, estOperateurPlateforme: false },
          data: { estOperateurPlateforme: true },
        }),
      );
      if (count > 0) {
        this.logger.log(`Opérateur de plateforme accordé : ${email}`);
      }
    }
  }

  /**
   * Vue d'ensemble des cabinets clients, licence et volumétrie comprises ·
   * UNE TRANCHE QUI SE DIT (audit final F260) · les premiers par nom, sous
   * `PLAFOND_LISTE_CONSOLE`, avec le total compté sur le périmètre entier.
   */
  async listeCabinets() {
    // Les dossiers de combinaison sont TECHNIQUES (voir GroupeService.
    // liasseGroupe) : régénérés par le serveur, sans utilisateurs · ils
    // n'ont rien à faire dans la liste des cabinets clients. Le même filtre
    // sert la tranche et le total, sans quoi l'écran dirait tronquée une
    // liste complète.
    const perimetre = { combinaisonPour: null };
    const [tenants, total] = await Promise.all([
      this.prisma.tenant.findMany({
        where: perimetre,
        orderBy: { nom: 'asc' },
        take: PLAFOND_LISTE_CONSOLE,
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
      }),
      this.prisma.tenant.count({ where: perimetre }),
    ]);
    const cabinets = tenants.map((t) => ({
      id: t.id,
      nom: t.nom,
      referentiel: t.referentiel,
      jeuEtatsFinanciersSycebnl: siSycebnl(t.referentiel, t.jeuEtatsFinanciersSycebnl),
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
    return { cabinets, ...tranche(cabinets.length, total) };
  }

  /**
   * UNE INSTALLATION SUR SITE NE TIENT PAS SA LICENCE D'UNE LIGNE DE CETTE
   * TABLE (audit final F171). Elle lit un fichier signé par VMG
   * (`sur-site/licence-signee.ts`), émis dans le cadre « Licences sur site »
   * de la console, et vérifié sans internet · le heartbeat que ce type
   * supposait n'a pas été retenu (2026-09-26).
   *
   * Attribué à un dossier HÉBERGÉ, le type le mettait hors service dès sa
   * première requête · `LicenceService.evaluerLicence` refuse une licence
   * PERPETUEL_ONPREMISE sans heartbeat, et rien n'en émet en ligne.
   * L'attribution reste donc fermée aux DEUX portes qui la posent · la
   * création d'un cabinet et le changement de type. Une licence qui porterait
   * déjà ce type reste modifiable · c'est par ce PATCH qu'on l'en sort. Le
   * motif disait « phase 4 » jusqu'au 2026-09-27 · il orientait vers une
   * licence SaaS un client qui voulait une installation, livrée depuis.
   */
  private refuserAttributionSurSite(type: TypeLicence | undefined) {
    if (type !== TypeLicence.PERPETUEL_ONPREMISE) return;
    throw new BadRequestException(MOTIF_SUR_SITE_NON_ATTRIBUABLE);
  }

  /**
   * LA LICENCE EST CELLE D'UN AUTRE DOSSIER · l'opérateur est connecté au sien,
   * et la garde de cloisonnement rendait la ligne cible INEXISTANTE : la
   * console répondait « Cabinet introuvable ou sans licence » à toute
   * modification de la licence d'un client. La sortie est déclarée, avec son
   * motif, comme pour la création d'un dossier ou la réinitialisation de son
   * administrateur.
   */
  modifierLicence(tenantId: string, dto: ModifierLicenceDto) {
    return horsCloisonnement('console · licence d’un cabinet client', () => this.modifierLicenceSansGarde(tenantId, dto));
  }

  /**
   * L'ÉCHÉANCE DE LA LICENCE D'UN CLIENT ABONNÉ · posée par la souscription,
   * prolongée par chaque paiement déclaré (plateforme/abonnements). Jamais
   * reculée, jamais levée d'une suspension posée à la main, et refusée sur une
   * licence perpétuelle ou sur celle de l'éditeur, qu'un abonnement ne
   * gouverne pas.
   */
  echeanceAbonnement(cabinetId: string, echeance: string) {
    return horsCloisonnement('console · échéance de la licence d’un cabinet abonné', async () => {
      const retenue = await this.echeanceDeLaMere(cabinetId, echeance);
      // CASCADE DE GROUPE (audit final F46) · la cellule reflète la licence de
      // sa mère, et c'est le paiement de la MÈRE qui la prolonge · sans elle,
      // toutes les cellules expiraient au premier encaissement. Le reflet est
      // exact, jamais « au plus tard » : la cellule n'a pas d'abonnement à
      // elle. Le statut ne bouge pas, comme celui de la mère.
      await this.prisma.licence.updateMany({
        where: { tenant: { dossierMereId: cabinetId }, type: { not: TypeLicence.PROPRIETAIRE } },
        data: { type: TypeLicence.ABONNEMENT, dateExpiration: new Date(`${retenue}T23:59:59Z`) },
      });
      return retenue;
    });
  }

  /** L'échéance de la mère, jamais reculée · rend celle qui vaut après l'appel. */
  private async echeanceDeLaMere(cabinetId: string, echeance: string): Promise<string> {
    const l = await this.prisma.licence.findUnique({ where: { tenantId: cabinetId }, select: { type: true, dateExpiration: true } });
    const date = new Date(`${echeance}T23:59:59Z`);
    if (!l) {
      await this.prisma.licence.create({ data: { tenantId: cabinetId, type: TypeLicence.ABONNEMENT, statut: StatutLicence.ACTIVE, dateExpiration: date } });
      return echeance;
    }
    if (l.type !== TypeLicence.ABONNEMENT) {
      throw new BadRequestException(
        l.type === TypeLicence.PROPRIETAIRE
          ? 'Le dossier de l’éditeur n’a pas d’abonnement.'
          : 'Ce dossier a une licence perpétuelle · un abonnement ne la gouverne pas. Changez d’abord le type de licence.',
      );
    }
    if (l.dateExpiration && l.dateExpiration >= date) return l.dateExpiration.toISOString().slice(0, 10);
    await this.prisma.licence.update({ where: { tenantId: cabinetId }, data: { dateExpiration: date } });
    return echeance;
  }

  /**
   * Suspension, réactivation, changement de type, renouvellement. EXPIREE ne
   * se décrète pas (refusée par le DTO) : elle découle de dateExpiration,
   * évaluée à chaque requête par LicenceService · « renouveler », c'est donc
   * poser une nouvelle échéance, le statut ACTIVE suffisant ensuite.
   */
  private async modifierLicenceSansGarde(tenantId: string, dto: ModifierLicenceDto) {
    // Avant toute lecture : un type non attribuable est un défaut de la
    // DEMANDE, il n'a pas à dépendre de l'existence de la cible, et surtout
    // il ne doit rien écrire · le PATCH cascade sur les cellules.
    this.refuserAttributionSurSite(dto.type);
    const licence = await this.prisma.licence.findUnique({ where: { tenantId } });
    if (!licence) {
      throw new NotFoundException('Cabinet introuvable ou sans licence');
    }
    this.refuserTouchePropriete(licence.type, dto);
    if (dto.type === undefined && dto.statut === undefined && dto.dateExpiration === undefined) {
      throw new BadRequestException('Aucune modification demandée');
    }
    const donnees = {
      ...(dto.type !== undefined ? { type: dto.type } : {}),
      ...(dto.statut !== undefined ? { statut: dto.statut } : {}),
      // '' efface l'échéance (passage en perpétuel) · convention partagée
      // avec les dates des paramètres du dossier, et la même lecture
      // (`dateSaisieOuEffacement`, audit final F237) · `new Date` seul
      // reportait en silence un 30 février au 2 mars, et une forme ISO qu'il
      // ne lit pas partait à Prisma, refusée en 500. `null` n'arrive pas
      // jusqu'ici, le DTO le refuse (`FacultatifNonNul`).
      ...(dto.dateExpiration !== undefined ? { dateExpiration: dateSaisieOuEffacement(dto.dateExpiration) } : {}),
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
   * LE DOSSIER DE L'ÉDITEUR NE SE MODIFIE PAS DEPUIS LA CONSOLE.
   *
   * Trois gestes le couperaient, et le troisième est le plus discret :
   * le suspendre, lui poser une échéance, ou changer son TYPE pour un autre.
   * Le court-circuit de `LicenceService` absorbe les deux premiers ; le
   * troisième le retire, et rien ne le rattraperait ensuite. C'est donc ICI
   * que le refus se pose.
   *
   * ET LE REFUS EST SANS ÉCHAPPATOIRE, à la différence de la plupart des
   * refus de ce dépôt : couper l'éditeur verrouille l'opérateur hors de la
   * console qui sert à déverrouiller. Il n'y a pas de « au cas où » qui vaille
   * une panne sans issue. Changer ce type suppose d'écrire une migration, ce
   * qui oblige à le décider plutôt qu'à le cliquer.
   */
  private refuserTouchePropriete(
    typeActuel: TypeLicence,
    dto: { type?: TypeLicence; statut?: StatutLicence; dateExpiration?: string },
  ) {
    if (typeActuel !== TypeLicence.PROPRIETAIRE) {
      // On refuse aussi de FABRIQUER un second éditeur depuis la console · un
      // logiciel a un propriétaire, et deux dossiers incoupables sont un
      // désordre qu'aucun écran ne signalerait.
      if (dto.type === TypeLicence.PROPRIETAIRE) {
        throw new BadRequestException(
          'La licence « Éditeur » désigne le dossier de VMG Consulting, propriétaire du logiciel · elle ne ' +
            's’attribue pas depuis la console. Un second dossier incoupable ne se verrait nulle part, et rien ' +
            'ne pourrait le refermer.',
        );
      }
      return;
    }
    throw new BadRequestException(
      'Ce dossier est celui de l’éditeur du logiciel : sa licence n’expire pas, ne se suspend pas et ne change ' +
        'pas de type. C’est depuis ce dossier que les licences des autres se rouvrent · le couper verrouillerait ' +
        'l’opérateur hors de la console qui sert à déverrouiller, sans autre issue qu’une intervention en base.',
    );
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
      select: {
        id: true,
        referentiel: true,
        systemeComptableSyscohada: true,
        licence: { select: { type: true } },
        _count: { select: { cellules: true } },
      },
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
      // LA LICENCE SUIT LE RATTACHEMENT (audit final F46) · un dossier rattaché
      // gardait la sienne, et une cellule ouverte par la console sans échéance
      // ne se coupait jamais. Vérifié avant toute écriture.
      refuserCelluleEditeur(tenant.licence?.type);
      const licence = await this.verifierMere(dossierMereId, tenant);
      await this.prisma.tenant.update({ where: { id: tenantId }, data: { dossierMereId } });
      if (licence) {
        // SORTIE DE CLOISONNEMENT · la licence est celle d'un AUTRE dossier que
        // celui de l'opérateur, comme dans `modifierLicence`.
        await horsCloisonnement('console · licence d’une cellule alignée sur sa mère', () =>
          this.prisma.licence.update({ where: { tenantId }, data: licence }),
        );
      }
      return { id: tenantId, dossierMereId };
    }
    await this.prisma.tenant.update({ where: { id: tenantId }, data: { dossierMereId } });
    return { id: tenantId, dossierMereId };
  }

  /**
   * LA MÈRE DÉSIGNÉE, VÉRIFIÉE SANS RIEN ÉCRIRE · appelée au rattachement ET à
   * la création d'un cabinet, AVANT `register` (audit final F47) · la
   * création semait tout puis levait au rattachement, laissant un dossier
   * complet dont le mot de passe n'avait pas été rendu et dont l'adresse
   * bloquait toute nouvelle tentative.
   *
   * Un seul niveau de groupe, le même référentiel, et sous le SYSCOHADA le
   * même système comptable · la cellule est un établissement de la même
   * entité (fiche du COMPTE 18), et `GroupeService.creerCellule` impose déjà
   * le système du siège. Rend la licence que la cellule reflétera.
   */
  private async verifierMere(
    dossierMereId: string,
    fille: { referentiel: Referentiel; systemeComptableSyscohada: SystemeComptableSyscohada | null | undefined },
  ): Promise<LicenceReflet | null> {
    const mere = await this.prisma.tenant.findUnique({
      where: { id: dossierMereId },
      select: {
        id: true,
        dossierMereId: true,
        referentiel: true,
        systemeComptableSyscohada: true,
        licence: { select: { type: true, statut: true, dateExpiration: true } },
      },
    });
    if (!mere) {
      throw new NotFoundException('Dossier mère introuvable');
    }
    if (mere.dossierMereId !== null) {
      throw new BadRequestException('Le dossier mère désigné est lui-même une cellule · un groupe n’a qu’un niveau');
    }
    // MÊME RÈGLE DE RÉFÉRENTIEL QUE `GroupeService.creerCellule`, et pour la
    // même raison. Il y a DEUX portes vers l'état « ce dossier est une
    // cellule » : le siège qui crée sa cellule, et l'opérateur qui rattache
    // ici un dossier existant. Les deux exigent désormais la même chose ·
    // la cellule relève du référentiel de sa mère.
    //
    // Ce que le mélange produirait : la balance agrégée additionne par
    // NUMÉRO des comptes de deux plans qui ne coïncident pas (le 18 est une
    // dette financière au SYCEBNL, un compte de liaison des succursales au
    // SYSCOHADA), et la liasse combinée sort au référentiel du siège sur
    // des chiffres qui n'en relèvent pas. Aucun total ne cesserait de
    // boucler, aucun message ne le dirait.
    if (mere.referentiel !== fille.referentiel) {
      throw new BadRequestException(
        `La cellule et son dossier mère doivent relever du même référentiel · la mère est ${mere.referentiel}, ` +
          `ce dossier est ${fille.referentiel}.`,
      );
    }
    if (mere.referentiel === Referentiel.SYSCOHADA) {
      const systemeMere = mere.systemeComptableSyscohada ?? SystemeComptableSyscohada.NORMAL;
      const systemeFille = fille.systemeComptableSyscohada ?? SystemeComptableSyscohada.NORMAL;
      if (systemeMere !== systemeFille) {
        throw new BadRequestException(
          `La cellule tient le système comptable de son siège · la mère est au système ${systemeMere}, ce dossier au système ${systemeFille}.`,
        );
      }
    }
    return licenceDeCellule(mere.licence);
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
    // Avant register() : celui-ci sème tenant, licence, admin, plan de comptes
    // et exercice d'un seul tenant · refuser après aurait laissé un dossier
    // complet et inaccessible derrière l'erreur.
    this.refuserAttributionSurSite(dto.typeLicence);
    // LA MÈRE SE VÉRIFIE AVANT register() AUSSI (audit final F47) · refusée
    // après, elle laissait un dossier complet, inaccessible, dont l'adresse
    // bloquait toute nouvelle tentative. Et une cellule prend la licence de
    // sa mère (F46) · un type ou une échéance choisis à côté seraient écrasés
    // sans que l'opérateur le voie, d'où le refus plutôt que l'oubli.
    const referentiel = dto.referentiel ?? Referentiel.SYCEBNL;
    let licenceMere: LicenceReflet | null = null;
    if (dto.dossierMereId) {
      if (dto.typeLicence !== undefined || dto.dateExpiration !== undefined) {
        throw new BadRequestException('Une cellule prend la licence de son dossier mère · type et échéance ne se choisissent pas.');
      }
      licenceMere = await this.verifierMere(dto.dossierMereId, {
        referentiel,
        systemeComptableSyscohada: referentiel === Referentiel.SYSCOHADA ? dto.systemeComptableSyscohada : null,
      });
    }
    // 16 caractères base64url · large au-delà du minimum de 10 du RegisterDto.
    const motDePasseTemporaire = randomBytes(12).toString('base64url');
    const resultat = await this.authService.register({
      nomEntite: dto.nomEntite,
      // SYCEBNL par défaut (clientèle associative) · l'opérateur choisit
      // SYSCOHADA pour un client commercial, register() sème le bon plan.
      referentiel,
      email: dto.emailAdmin,
      motDePasse: motDePasseTemporaire,
      jeuEtatsFinanciersSycebnl: dto.jeuEtatsFinanciersSycebnl,
      systemeComptableSyscohada: dto.systemeComptableSyscohada,
      typeLicence: licenceMere?.type ?? dto.typeLicence ?? TypeLicence.ABONNEMENT,
      activite: dto.activite,
      adresse: dto.adresse,
      ville: dto.ville,
      pays: dto.pays,
      telephone: dto.telephone,
      dateDebutExercice: dto.dateDebutExercice,
      dateFinExercice: dto.dateFinExercice,
    });
    // Échéance de licence choisie à la création · register() n'en pose pas
    // (l'auto-inscription publique n'a pas de flux commercial).
    if (dto.dateExpiration) {
      // SORTIE DE CLOISONNEMENT · la licence est celle du dossier QUI VIENT
      // D'ÊTRE CRÉÉ, et la session porte celui de l'opérateur · sans elle, la
      // garde refusait l'écriture et la création échouait après coup.
      await horsCloisonnement('console · échéance posée à la création du dossier', () =>
        this.prisma.licence.update({
          where: { tenantId: resultat.tenant.id },
          data: { dateExpiration: new Date(dto.dateExpiration!), statut: StatutLicence.ACTIVE },
        }),
      );
    }
    // Rattachement au groupe à la création · mêmes validations que le PATCH.
    if (dto.dossierMereId) {
      await this.modifierGroupe(resultat.tenant.id, { dossierMereId: dto.dossierMereId });
    }
    // Le mot de passe a transité par l'opérateur · le client devra le
    // remplacer à sa première connexion (voir schema.prisma, User).
    // SORTIE DE CLOISONNEMENT · le compte visé est celui du dossier QUI VIENT
    // D'ÊTRE CRÉÉ, pas celui de l'opérateur dont la session porte le contexte.
    await horsCloisonnement('console · dossier créé par l’opérateur', () =>
      this.prisma.user.update({
        where: { email: normaliserCourriel(dto.emailAdmin) },
        data: { doitChangerMotDePasse: true },
      }),
    );
    return {
      tenant: resultat.tenant,
      exercice: resultat.exercice,
      adminEmail: dto.emailAdmin,
      // Le jeton d'accès de register() n'est PAS retransmis : la session du
      // nouveau dossier appartient au client, pas à l'opérateur.
      motDePasseTemporaire,
    };
  }

  /**
   * RÉINITIALISATION DU MOT DE PASSE DE L'ADMINISTRATEUR D'UN CABINET.
   *
   * B5 a donné à l'administrateur d'un dossier de quoi réinitialiser ses
   * collaborateurs. La chaîne s'arrêtait là : quand c'est L'ADMINISTRATEUR
   * lui-même qui oublie son mot de passe, plus personne ne pouvait rien, et on
   * retombait sur un UPDATE SQL en production · c'est-à-dire exactement ce que
   * B5 devait supprimer, remonté d'un cran.
   *
   * L'opérateur de la plateforme est le dernier recours, et il ne doit pas y
   * en avoir d'autre au-dessus. Les mêmes trois effets qu'à l'étage du dossier :
   * mot de passe PROVISOIRE, sessions fermées, verrou levé. Et la même trace au
   * journal d'audit, mot de passe masqué.
   *
   * Le compte visé doit être ADMIN_CABINET du dossier désigné · l'opérateur
   * n'a pas à réinitialiser un comptable, c'est l'affaire de l'administrateur
   * de son cabinet. Restreindre ainsi n'est pas une politesse : c'est ce qui
   * empêche la console de devenir un passe-partout sur tous les comptes de
   * tous les cabinets.
   */
  async reinitialiserAdmin(tenantId: string, dto: { email: string; motDePasseProvisoire: string }) {
    // LA LECTURE SORT DU CLOISONNEMENT ELLE AUSSI (audit final F45) · faite
    // dans le contexte de l'opérateur, la garde rendait « inexistant » le
    // compte d'un autre dossier, et la route de dernier recours répondait 404
    // pour tout cabinet client. Le filtre garde le dossier désigné et le rôle.
    const admin = await horsCloisonnement('console · lecture de l’administrateur d’un cabinet client', () =>
      this.prisma.user.findFirst({
        where: { tenantId, email: normaliserCourriel(dto.email), role: RoleUtilisateur.ADMIN_CABINET },
      }),
    );
    if (!admin) {
      throw new NotFoundException(
        "Aucun administrateur avec cette adresse dans ce dossier · l'opérateur ne réinitialise que les administrateurs.",
      );
    }
    // SORTIE DE CLOISONNEMENT · le compte visé relève du dossier CLIENT, pas
    // de celui de l'opérateur dont la session porte le contexte.
    await horsCloisonnement('console · réinitialisation de l’administrateur d’un cabinet client', () =>
      this.prisma.user.update({
        where: { id: admin.id },
        data: {
          motDePasse: bcrypt.hashSync(dto.motDePasseProvisoire, 12),
          doitChangerMotDePasse: true,
          sessionsInvalidesAvant: new Date(),
          ...DECOMPTE_REMIS_A_ZERO,
          ...SANS_DOUBLE_AUTH,
        },
      }),
    );
    this.logger.log(`Mot de passe administrateur réinitialisé · ${admin.email}`);
    return { reinitialise: true, email: admin.email };
  }

  /**
   * DÉSIGNER LE DOSSIER DE L'ÉDITEUR · un geste, une fois, et pas un menu
   * déroulant.
   *
   * `modifierLicence` REFUSE d'attribuer le type PROPRIETAIRE, et ce refus
   * n'est pas contourné ici : il est là pour qu'on ne le clique pas au milieu
   * d'une liste de types, à côté d'« Abonnement ». Cette route-ci est un acte
   * nommé, réservé à l'opérateur, qui ne se fait qu'une fois.
   *
   * POURQUOI UNE ROUTE ET NON UNE MIGRATION. Une migration devrait reconnaître
   * le dossier de l'éditeur à quelque chose · un nom, un courriel, une
   * variable d'environnement. Le nom change, le courriel change, et une
   * migration appliquée ne se corrige plus. La console, elle, sait de quel
   * dossier il s'agit : c'est celui que l'opérateur désigne.
   *
   * UN SEUL, tous cabinets confondus · deux dossiers incoupables ne se
   * verraient nulle part, et rien ne pourrait les refermer. Même parti que le
   * dossier de démonstration.
   */
  async designerDossierEditeur(tenantId: string) {
    const existant = await horsCloisonnement(
      "console · un seul dossier d'éditeur à la fois, tous cabinets confondus",
      () =>
        this.prisma.licence.findFirst({
          where: { type: TypeLicence.PROPRIETAIRE },
          select: { tenantId: true, tenant: { select: { nom: true } } },
        }),
    );
    if (existant) {
      if (existant.tenantId === tenantId) {
        throw new BadRequestException('Ce dossier est déjà celui de l’éditeur.');
      }
      throw new BadRequestException(
        `Le dossier de l’éditeur est déjà « ${existant.tenant.nom} ». Il n’y en a qu’un : le logiciel a un ` +
          'propriétaire, et deux dossiers incoupables ne se verraient nulle part.',
      );
    }
    const licence = await this.prisma.licence.findUnique({ where: { tenantId } });
    if (!licence) {
      throw new NotFoundException('Cabinet introuvable ou sans licence');
    }
    return this.prisma.licence.update({
      where: { tenantId },
      // L'ÉCHÉANCE EST EFFACÉE en même temps que le type change. La laisser
      // serait sans effet aujourd'hui (le court-circuit passe avant), et
      // deviendrait un piège le jour où quelqu'un retire le type : le dossier
      // se couperait alors sur une date que plus personne n'aurait en tête.
      data: { type: TypeLicence.PROPRIETAIRE, statut: StatutLicence.ACTIVE, dateExpiration: null },
      select: { type: true, statut: true, dateDebut: true, dateExpiration: true, dernierHeartbeatAt: true },
    });
  }

  /**
   * LE DOSSIER DE L'ÉDITEUR, LU DEPUIS N'IMPORTE QUEL DOSSIER (audit final
   * F173) · les abonnements le cherchaient par une lecture cloisonnée, que la
   * garde rendait vide dès que l'opérateur n'était pas dans ce dossier. La
   * console répondait « aucun dossier d'éditeur désigné » là où le vrai refus
   * était « connectez-vous au dossier de l'éditeur ». `null` quand aucun n'est
   * désigné.
   */
  async dossierEditeurId(): Promise<string | null> {
    const l = await horsCloisonnement("console · le dossier de l'éditeur, où naissent les factures d'abonnement", () =>
      this.prisma.licence.findFirst({ where: { type: TypeLicence.PROPRIETAIRE }, select: { tenantId: true } }),
    );
    return l?.tenantId ?? null;
  }

  /**
   * DOSSIER DE DÉMONSTRATION · le troisième prérequis commun à tous les
   * magasins d'applications, avec le manifeste installable et la politique de
   * confidentialité publiée.
   *
   * Un examinateur de magasin n'instruit pas une soumission qu'il ne peut pas
   * ouvrir : il lui faut une adresse et un mot de passe qui marchent, sur un
   * dossier garni d'écritures FICTIVES. Jamais sur un dossier de client, dont
   * les données sont couvertes par le secret professionnel du cabinet.
   *
   * TROIS DIFFÉRENCES AVEC UN DOSSIER ORDINAIRE, chacune pour une raison.
   *
   * 1. LE MOT DE PASSE EST CHOISI, PAS TIRÉ AU SORT · il figure dans le
   *    formulaire de soumission du magasin, et un mot de passe qui change à
   *    chaque remise à zéro y devient faux sans que personne ne s'en aperçoive.
   *
   * 2. `doitChangerMotDePasse` EST FAUX, et c'est le point qui aurait tout
   *    fait échouer en silence. `MotDePasseAChangerGuard` FERME le serveur
   *    tant que le mot de passe provisoire n'a pas été remplacé : l'examinateur
   *    se serait connecté, aurait reçu l'écran de changement de mot de passe à
   *    la place du logiciel, et aurait rejeté la soumission pour une
   *    application « qui ne s'ouvre pas ». Rien dans les journaux n'aurait
   *    signalé quoi que ce soit · la garde aurait fait exactement son travail.
   *
   * 3. LE DOSSIER PORTE UN DRAPEAU, `estDemonstration`. Reconnaître la vitrine
   *    à son intitulé marcherait jusqu'au jour où un client s'appellerait
   *    « DÉMO », et ce jour-là c'est un vrai dossier que la remise à zéro
   *    effacerait.
   *
   * CE QUE CETTE ROUTE NE FAIT PAS : elle ne remet rien à zéro. Créer est sûr,
   * effacer ne l'est pas, et un second dossier de démonstration est un
   * désordre, pas un incident. Elle REFUSE donc quand il en existe déjà un, en
   * nommant celui qui existe.
   *
   * UN PAR RÉFÉRENTIEL (2026-09-26) · une association (SYCEBNL) et une SARL
   * (SYSCOHADA) ne montrent pas le même logiciel, et ne divergent pas l'une de
   * l'autre : ce sont deux vitrines de deux produits. Deux vitrines du MÊME
   * référentiel restent refusées. Le dossier naît GARNI d'opérations fictives
   * (`GarnissageDemonstrationService`), validées, pour que la balance, la
   * balance âgée et les états financiers aient quelque chose à montrer.
   */
  async preparerDossierDemonstration(dto: {
    nomEntite?: string;
    email: string;
    motDePasse: string;
    referentiel?: Referentiel;
  }) {
    const existant = await horsCloisonnement(
      'console · un seul dossier de démonstration à la fois, tous cabinets confondus',
      () =>
        this.prisma.tenant.findFirst({
          where: { estDemonstration: true, referentiel: dto.referentiel ?? Referentiel.SYCEBNL },
          select: { id: true, nom: true, users: { select: { email: true }, take: 1 } },
        }),
    );
    if (existant) {
      // UNE VITRINE INTERROMPUE SE COMPLÈTE (audit final F174) · le garnissage
      // valide en dernier, si bien qu'une vitrine sans aucune écriture validée
      // est une vitrine dont le garnissage n'a pas abouti. Elle était marquée,
      // donc introuvable à côté et impossible à refaire · on reprend son
      // garnissage, qui ne recrée rien de ce qui existe.
      const repris = await this.reprendreGarnissage(existant.id);
      if (repris) {
        this.logger.log(`Garnissage du dossier de démonstration repris · ${existant.nom}`);
        return {
          tenantId: existant.id,
          garni: { tiers: repris.tiers, ecritures: repris.ecritures },
          repris: true,
          nom: existant.nom,
          email: existant.users[0]?.email ?? '',
          rappel:
            "Garnissage d'une vitrine interrompue repris et achevé · son adresse et son mot de passe restent ceux de sa création, " +
            'ceux saisis maintenant ne sont pas repris.',
        };
      }
      throw new BadRequestException(
        `Un dossier de démonstration existe déjà · « ${existant.nom} » (${existant.users[0]?.email ?? 'sans utilisateur'}). ` +
          "Servez-vous de celui-là plutôt que d'en ouvrir un second : deux vitrines divergent, et c'est toujours la " +
          "mauvaise qu'on donne au magasin.",
      );
    }

    const referentiel = dto.referentiel ?? Referentiel.SYCEBNL;
    const scenario = scenarioDemonstration(referentiel);
    const resultat = await this.authService.register({
      nomEntite: dto.nomEntite ?? scenario.nomEntite,
      referentiel,
      email: dto.email,
      motDePasse: dto.motDePasse,
      typeLicence: TypeLicence.ABONNEMENT,
      activite: scenario.activite,
      pays: 'République démocratique du Congo',
      ...(referentiel === Referentiel.SYSCOHADA ? { systemeComptableSyscohada: SystemeComptableSyscohada.NORMAL } : {}),
    });

    await horsCloisonnement('console · marquage du dossier de démonstration', async () => {
      await this.prisma.tenant.update({
        where: { id: resultat.tenant.id },
        data: {
          estDemonstration: true,
          // LA VITRINE MONTRE TOUT · un dossier neuf part sans les modules
          // optionnels, la démonstration les a tous (`tenant/modules-optionnels.ts`).
          modulesActives: [...MODULES_OPTIONNELS],
          ...(referentiel === Referentiel.SYSCOHADA ? { formeJuridiqueSyscohada: FormeJuridiqueSyscohada.SOCIETE_RESPONSABILITE_LIMITEE } : {}),
        },
      });
      // Voir le point 2 du commentaire ci-dessus · sans cette ligne, la
      // vitrine ne s'ouvre jamais sur autre chose que l'écran de changement de
      // mot de passe.
      await this.prisma.user.updateMany({
        where: { tenantId: resultat.tenant.id },
        data: { doitChangerMotDePasse: false },
      });
    });

    // GARNI · par les chemins ordinaires de saisie, dans le dossier qui vient
    // de naître et qui n'est pas celui de la session de l'opérateur.
    let garni: { tiers: number; ecritures: number } | null = null;
    if (this.garnissage) {
      const garnissage = this.garnissage;
      garni = await horsCloisonnement('console · garnissage du dossier de démonstration', async () => {
        const auteur = await this.prisma.user.findFirstOrThrow({ where: { tenantId: resultat.tenant.id }, select: { id: true } });
        const r = await garnissage.garnir(resultat.tenant.id, auteur.id);
        return { tiers: r.tiers, ecritures: r.ecritures };
      });
    }

    this.logger.log(`Dossier de démonstration ouvert · ${dto.email}`);
    return {
      tenantId: resultat.tenant.id,
      garni,
      repris: false,
      nom: resultat.tenant.nom,
      email: dto.email,
      // Le mot de passe n'est PAS renvoyé · l'opérateur vient de le choisir, il
      // le connaît, et le réémettre le ferait entrer dans un journal de
      // requêtes pour rien.
      rappel:
        "Ce dossier est une vitrine : ses écritures doivent rester fictives, et son adresse comme son mot de passe " +
        'sont destinés à figurer dans un formulaire de soumission public.',
    };
  }

  /**
   * Reprend le garnissage d'une vitrine qui n'a aucune écriture validée ·
   * `null` quand elle en a (elle est garnie, le refus d'une seconde vitrine
   * vaut) ou quand aucun garnissage n'est branché.
   */
  private async reprendreGarnissage(tenantId: string): Promise<{ tiers: number; ecritures: number } | null> {
    if (!this.garnissage) return null;
    const garnissage = this.garnissage;
    return horsCloisonnement('console · reprise du garnissage du dossier de démonstration', async () => {
      const validees = await this.prisma.ecriture.count({ where: { tenantId, statut: StatutEcriture.VALIDEE } });
      if (validees > 0) return null;
      const auteur = await this.prisma.user.findFirstOrThrow({ where: { tenantId }, select: { id: true } });
      const r = await garnissage.garnir(tenantId, auteur.id);
      return { tiers: r.tiers, ecritures: r.ecritures };
    });
  }
}
