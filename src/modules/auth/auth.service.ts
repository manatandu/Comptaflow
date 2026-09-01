import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
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
import { Referentiel, RoleUtilisateur, TypeLicence } from '@prisma/client';

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
   * Crée le tenant, son admin, sa licence, son plan de comptes SYCEBNL et son
   * exercice courant. Reproduit le parcours de l'écran « Onboarding » du
   * canevas de design : le plan de comptes est prêt dès l'inscription, sans
   * étape de configuration manuelle.
   *
   * NB : la création tenant+licence+user et le seed du plan de comptes ne
   * sont pas dans la même transaction DB · un échec du seed après un tenant
   * créé est un état incohérent possible en MVP, acceptable pour l'instant
   * mais à durcir (transaction interactive Prisma) avant une mise en prod
   * réelle.
   */
  async register(dto: RegisterDto) {
    const emailExistant = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (emailExistant) {
      throw new ConflictException('Un compte existe déjà avec cet email');
    }

    // Le DTO accepte les deux valeurs de l'enum `Referentiel` parce que le
    // schéma les porte toutes deux, mais `seedPlanSycebnl` ci-dessous n'en
    // sème qu'UN : le plan SYCEBNL. Sans ce garde-fou, un dossier créé en
    // SYSCOHADA se retrouverait tenu avec la nomenclature des entités à but
    // non lucratif tout en s'annonçant en référentiel d'entreprise · un
    // mensonge silencieux sur chaque état imprimé. L'assistant côté client
    // présente d'ailleurs le SYSCOHADA comme « bientôt » ; ce refus est ce
    // qui rend cette mention vraie côté serveur.
    if (dto.referentiel !== Referentiel.SYCEBNL) {
      throw new BadRequestException(
        "Le référentiel SYSCOHADA révisé (entités à but lucratif) n'est pas encore construit dans OmegaX : " +
          "son plan de comptes et ses états financiers lui sont propres et ne peuvent pas être remplacés par ceux " +
          'du SYCEBNL. Seul le référentiel SYCEBNL peut être retenu pour l\'instant.',
      );
    }

    const tenant = await this.tenantService.creerTenant({
      nom: dto.nomEntite,
      referentiel: dto.referentiel,
      typeLicence: dto.typeLicence ?? TypeLicence.ABONNEMENT,
      jeuEtatsFinanciersSycebnl: dto.jeuEtatsFinanciersSycebnl,
      activite: dto.activite,
      adresse: dto.adresse,
      ville: dto.ville,
      pays: dto.pays,
      telephone: dto.telephone,
      devise: dto.devise,
    });

    const motDePasseHache = await bcrypt.hash(dto.motDePasse, SALT_ROUNDS);
    const user = await this.prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: dto.email,
        motDePasse: motDePasseHache,
        role: RoleUtilisateur.ADMIN_CABINET,
      },
    });

    await this.compteService.seedPlanSycebnl(tenant.id);
    // Les journaux par défaut référencent des comptes de trésorerie du plan
    // SYCEBNL (52110000 Banque, 57100000 Caisse) : le seed des comptes doit donc
    // toujours précéder celui des journaux. Même contrainte pour les taux de
    // TVA, qui référencent les comptes d'État 44310000/44510000, et pour les
    // familles d'immobilisations par défaut, qui référencent des comptes de
    // classe 2/28/68 (voir famille-immobilisation-seed.ts).
    await this.journalService.seedJournauxDefaut(tenant.id);
    await this.tauxTvaService.seedTauxDefaut(tenant.id);
    await this.immobilisationService.seedFamillesDefaut(tenant.id);
    // Axes analytiques Projets / Bailleurs · aucune dépendance sur les comptes,
    // mais placés ici pour que le dossier soit prêt à ventiler dès la
    // première écriture.
    await this.analytiqueService.seedPlansDefaut(tenant.id);
    // Trois niveaux de relance au ton d'une association à ses membres · voir
    // RelancesService.NIVEAUX_DEFAUT.
    await this.relancesService.seedNiveauxDefaut(tenant.id);
    const exercice =
      dto.dateDebutExercice && dto.dateFinExercice
        ? await this.exerciceService.creer(tenant.id, {
            dateDebut: dto.dateDebutExercice,
            dateFin: dto.dateFinExercice,
          })
        : await this.exerciceService.creerExerciceCourant(tenant.id);

    return {
      tenant: {
        id: tenant.id,
        nom: tenant.nom,
        referentiel: tenant.referentiel,
        jeuEtatsFinanciersSycebnl: tenant.jeuEtatsFinanciersSycebnl,
        numeroImpot: tenant.numeroImpot,
      },
      exercice,
      ...this.signToken(user.id),
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
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
        jeuEtatsFinanciersSycebnl: user.tenant.jeuEtatsFinanciersSycebnl,
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
  private signToken(userId: string) {
    const accessToken = this.jwt.sign({ sub: userId });
    return { accessToken };
  }
}
