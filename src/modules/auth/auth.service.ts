import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { siSycebnl } from '../../common/reponse-referentiel';
import { PrismaService } from '../../common/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import { CompteService } from '../comptes/compte.service';
import { ExerciceService } from '../exercice/exercice.service';
import { JournalService } from '../journaux/journal.service';
import { TauxTvaService } from '../tva/taux-tva.service';
import { ImmobilisationService } from '../immobilisations/immobilisation.service';
import { AnalytiqueService } from '../analytique/analytique.service';
import { RelancesService } from '../relances/relances.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { Referentiel, RoleUtilisateur, SystemeComptableSyscohada, TypeLicence } from '@prisma/client';
import { horsCloisonnement } from '../../common/cloisonnement/contexte-cloisonnement';

const SALT_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly tenantService: TenantService,
    private readonly compteService: CompteService,
    private readonly exerciceService: ExerciceService,
    private readonly journalService: JournalService,
    private readonly tauxTvaService: TauxTvaService,
    private readonly immobilisationService: ImmobilisationService,
    private readonly analytiqueService: AnalytiqueService,
    private readonly relancesService: RelancesService,
  ) {}

  /**
   * Crée le tenant, son admin, sa licence, son plan de comptes (SYCEBNL ou
   * SYSCOHADA, selon le référentiel choisi) et son exercice courant.
   * Reproduit le parcours de l'écran « Onboarding » du
   * canevas de design : le plan de comptes est prêt dès l'inscription, sans
   * étape de configuration manuelle.
   *
   * TOUT SE FAIT DANS UNE SEULE TRANSACTION · tenant, licence, admin, plan de
   * comptes, journaux, taxes, familles d'immobilisations, plans analytiques,
   * niveaux de relance et exercice. Le commentaire qui vivait ici annonçait
   * l'inverse comme une limite du MVP « à durcir avant une mise en prod
   * réelle » : la mise en production a eu lieu, et l'état incohérent qu'il
   * décrivait est un dossier ouvert SANS PLAN DE COMPTES · on s'y connecte,
   * rien n'y fonctionne, et aucun message ne dit pourquoi. Le tenant n'existe
   * désormais que si tout le reste existe.
   *
   * Le hachage du mot de passe reste DEHORS : bcrypt à 12 tours occupe le
   * processeur une centaine de millisecondes, et tenir une transaction
   * ouverte pendant ce temps ne servirait à rien.
   */
  async register(dto: RegisterDto) {
    // SORTIE DE CLOISONNEMENT · la recherche se fait par COURRIEL, qui est
    // unique sur toute la plateforme et ne relève encore d'aucun dossier. Sans
    // cette déclaration, une création lancée depuis la console de l'opérateur
    // (dont la session porte SON dossier) verrait la garde traiter le compte
    // cherché comme inexistant, et le doublon passerait.
    const emailExistant = await horsCloisonnement('inscription · unicité du courriel sur toute la plateforme', () =>
      this.prisma.user.findUnique({ where: { email: dto.email } }),
    );
    if (emailExistant) {
      throw new ConflictException('Un compte existe déjà avec cet email');
    }

    const motDePasseHache = await bcrypt.hash(dto.motDePasse, SALT_ROUNDS);

    // `timeout` généreux et assumé : le semis enchaîne environ quatre-vingts
    // allers-retours vers Neon (1401 comptes en une passe, puis journaux,
    // taxes et familles compte par compte), ce qui dépasse largement les cinq
    // secondes par défaut de Prisma. Une inscription est un geste rare : la
    // tenir trente secondes ne coûte rien, et échouer à mi-chemin coûterait
    // un dossier inutilisable.
    const { tenant, user, exercice } = await this.prisma.$transaction(
      async (tx) => {
        // Les DEUX référentiels se sèment désormais (SYCEBNL depuis l'origine,
        // SYSCOHADA depuis compte-seed-syscohada.ts) · le refus historique du
        // SYSCOHADA est levé. Un dossier SYSCOHADA se TIENT et s'IMPRIME
        // complètement : plan, journaux, taxes, immobilisations, éditions, puis
        // les états des deux systèmes de l'AUDCIF art. 11 (Système normal du
        // Titre IX, Système minimal de trésorerie du Titre X) et les notes
        // annexes du Titre IX ch. 6, servis par leur PROPRE contrôleur
        // (etats-financiers-syscohada). Chaque jeu reste cloisonné sur son
        // référentiel par @ReferentielsAutorises : les deux ne partagent aucun
        // poste, aucun compte, aucun libellé. Restent propres au SYCEBNL les
        // documents obligatoires et les fenêtres bâties sur ses textes.
        const tenant = await this.tenantService.creerTenant({
          nom: dto.nomEntite,
          referentiel: dto.referentiel,
          typeLicence: dto.typeLicence ?? TypeLicence.ABONNEMENT,
          // Le jeu d'états est un concept SYCEBNL (art. 4 à 6) · jamais retenu
          // pour un dossier SYSCOHADA, même si le DTO en portait un.
          jeuEtatsFinanciersSycebnl: dto.referentiel === Referentiel.SYCEBNL ? dto.jeuEtatsFinanciersSycebnl : undefined,
          // Symétriquement, le système comptable de l'AUDCIF ne concerne QUE le
          // SYSCOHADA · Système normal par défaut, régime de droit commun de
          // l'art. 11 (« toute entité est, sauf exception liée à sa taille,
          // soumise au Système normal »).
          systemeComptableSyscohada:
            dto.referentiel === Referentiel.SYSCOHADA
              ? (dto.systemeComptableSyscohada ?? SystemeComptableSyscohada.NORMAL)
              : undefined,
          activite: dto.activite,
          adresse: dto.adresse,
          ville: dto.ville,
          pays: dto.pays,
          telephone: dto.telephone,
          devise: dto.devise,
        }, tx);

        const user = await tx.user.create({
          data: {
            tenantId: tenant.id,
            email: dto.email,
            motDePasse: motDePasseHache,
            role: RoleUtilisateur.ADMIN_CABINET,
          },
        });

        await this.compteService.seedPlan(tenant.id, dto.referentiel, tx);
        // Les journaux par défaut référencent des comptes de trésorerie du plan
        // qui vient d'être semé : le seed des comptes doit donc toujours précéder
        // celui des journaux. Même contrainte pour les taux de TVA et les
        // familles d'immobilisations. Les numéros référencés sont PROPRES à
        // chaque référentiel (caisse 5710/5711, TVA déductible 4451/4452,
        // mobilier 2441/2444... · voir chaque fichier *-seed.ts).
        await this.journalService.seedJournauxDefaut(tenant.id, dto.referentiel, tx);
        await this.tauxTvaService.seedTauxDefaut(tenant.id, dto.referentiel, tx);
        await this.immobilisationService.seedFamillesDefaut(tenant.id, dto.referentiel, tx);
        // Axes analytiques Projets (+ Bailleurs en SYCEBNL) · aucune dépendance
        // sur les comptes, mais placés ici pour que le dossier soit prêt à
        // ventiler dès la première écriture.
        await this.analytiqueService.seedPlansDefaut(tenant.id, dto.referentiel, tx);
        // Trois niveaux de relance, au ton d'une association à ses membres ou
        // d'une entreprise à ses clients selon le référentiel · voir
        // RelancesService.NIVEAUX_DEFAUT. Ces lettres partent vraiment, sous
        // la signature du dossier : c'est le seul texte du logiciel qui sort
        // de l'écran.
        await this.relancesService.seedNiveauxDefaut(tenant.id, dto.referentiel, tx);
        const exercice =
          dto.dateDebutExercice && dto.dateFinExercice
            ? await this.exerciceService.creer(
                tenant.id,
                { dateDebut: dto.dateDebutExercice, dateFin: dto.dateFinExercice },
                tx,
              )
            : await this.exerciceService.creerExerciceCourant(tenant.id, tx);

        return { tenant, user, exercice };
      },
      { maxWait: 10_000, timeout: 30_000 },
    );

    return {
      tenant: {
        id: tenant.id,
        nom: tenant.nom,
        referentiel: tenant.referentiel,
        jeuEtatsFinanciersSycebnl: siSycebnl(tenant.referentiel, tenant.jeuEtatsFinanciersSycebnl),
        systemeComptableSyscohada: tenant.systemeComptableSyscohada,
        numeroImpot: tenant.numeroImpot,
      },
      exercice,
      ...this.signToken(user.id),
    };
  }

  async login(dto: LoginDto) {
    // SORTIE DE CLOISONNEMENT · à la connexion, on ne sait pas encore de quel
    // dossier relève celui qui se présente. C'est cette requête qui l'apprend.
    const user = await horsCloisonnement('connexion · le dossier n’est pas encore connu', () =>
      this.prisma.user.findUnique({ where: { email: dto.email } }),
    );
    if (!user) {
      throw new UnauthorizedException('Identifiants invalides');
    }
    const motDePasseValide = await bcrypt.compare(dto.motDePasse, user.motDePasse);
    if (!motDePasseValide) {
      throw new UnauthorizedException('Identifiants invalides');
    }
    if (!user.estActif) {
      throw new UnauthorizedException('Ce compte a été désactivé');
    }
    return this.signToken(user.id);
  }

  /**
   * Changement de son propre mot de passe. Vérifie l'ACTUEL avant tout (un
   * poste laissé ouvert ne permet pas d'évincer le titulaire), et efface
   * doitChangerMotDePasse : c'est le geste qui clôt la période où un tiers
   * (console plateforme, siège de groupe, admin du dossier) connaissait le
   * mot de passe.
   */
  async changerMotDePasse(userId: string, motDePasseActuel: string, nouveauMotDePasse: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('Utilisateur introuvable');
    }
    const actuelValide = await bcrypt.compare(motDePasseActuel, user.motDePasse);
    if (!actuelValide) {
      throw new UnauthorizedException('Le mot de passe actuel est incorrect');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        motDePasse: await bcrypt.hash(nouveauMotDePasse, SALT_ROUNDS),
        doitChangerMotDePasse: false,
      },
    });
    return { change: true };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { tenant: { include: { _count: { select: { cellules: true } } } } },
    });
    if (!user) {
      throw new UnauthorizedException('Utilisateur introuvable');
    }
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      // Ouvre l'entrée de menu « Cabinets clients » côté client · le serveur
      // ne se fie jamais à ce que le client en fait : OperateurPlateformeGuard
      // relit le drapeau à chaque requête (via JwtStrategy).
      estOperateurPlateforme: user.estOperateurPlateforme,
      // Le client force l'écran de changement de mot de passe avant
      // l'espace de travail tant que ce drapeau est vrai.
      doitChangerMotDePasse: user.doitChangerMotDePasse,
      tenant: {
        id: user.tenant.id,
        nom: user.tenant.nom,
        referentiel: user.tenant.referentiel,
        // N'a de sens que si referentiel = SYCEBNL (voir prisma/schema.prisma) ·
        // le front s'en sert pour choisir le jeu d'états financiers à afficher.
        jeuEtatsFinanciersSycebnl: siSycebnl(user.tenant.referentiel, user.tenant.jeuEtatsFinanciersSycebnl),
        // Pendant SYSCOHADA · null pour un dossier SYCEBNL (voir le schéma).
        systemeComptableSyscohada: user.tenant.systemeComptableSyscohada,
        // Monnaie de tenue du dossier · portée jusqu'au front pour l'en-tête
        // d'impression : « l'unité monétaire dans laquelle sont exprimés les
        // états financiers » est l'une des trois mentions que les états
        // doivent comporter obligatoirement, et elle doit figurer « dans
        // chacune des pages des états financiers publiés » (AUDCIF Titre IX
        // ch. 1 § 2.4). Nullable : un dossier ancien peut ne pas la porter,
        // l'en-tête omet alors la mention au lieu d'inventer une monnaie.
        devise: user.tenant.devise,
        // Porté jusqu'au front pour l'en-tête d'impression : le n° impôt doit
        // figurer sur chaque page d'un état déposé (CPCC, § 7.4 règle 7-a).
        numeroImpot: user.tenant.numeroImpot,
        // Dossier mère d'un groupe d'établissements · ouvre l'entrée de menu
        // « Balance agrégée du groupe » (le serveur re-vérifie de toute façon
        // le lien à chaque appel /groupe).
        nombreCellules: user.tenant._count.cellules,
      },
    };
  }

  // Payload volontairement minimal : JwtStrategy.validate relit tenantId/
  // email/role en base à chaque requête (voir son commentaire) plutôt que
  // de leur faire confiance ici · un rôle changé ou un compte désactivé
  // doit prendre effet immédiatement, pas seulement à l'expiration du token.
  //
  // Le claim `csrf` appareille le jeton de session (cookie httpOnly) et le
  // jeton CSRF (renvoyé au client, qui le rejoue en en-tête X-CSRF-Token sur
  // chaque mutation) · voir session.constants.ts et jwt.strategy.ts. Aucun
  // état serveur : la correspondance se vérifie dans le JWT lui-même.
  private signToken(userId: string) {
    const csrfToken = randomBytes(16).toString('hex');
    const accessToken = this.jwt.sign({ sub: userId, csrf: csrfToken });
    return { accessToken, csrfToken };
  }
}
