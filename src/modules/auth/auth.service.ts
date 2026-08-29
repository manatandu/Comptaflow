import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../common/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import { CompteService } from '../comptes/compte.service';
import { ExerciceService } from '../exercice/exercice.service';
import { JournalService } from '../journaux/journal.service';
import { TauxTvaService } from '../tva/taux-tva.service';
import { ImmobilisationService } from '../immobilisations/immobilisation.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RoleUtilisateur, TypeLicence } from '@prisma/client';

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

    const tenant = await this.tenantService.creerTenant({
      nom: dto.nomEntite,
      referentiel: dto.referentiel,
      typeLicence: dto.typeLicence ?? TypeLicence.ABONNEMENT,
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
    const exercice =
      dto.dateDebutExercice && dto.dateFinExercice
        ? await this.exerciceService.creer(tenant.id, {
            dateDebut: dto.dateDebutExercice,
            dateFin: dto.dateFinExercice,
          })
        : await this.exerciceService.creerExerciceCourant(tenant.id);

    return {
      tenant: { id: tenant.id, nom: tenant.nom, referentiel: tenant.referentiel },
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

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { tenant: true },
    });
    if (!user) {
      throw new UnauthorizedException('Utilisateur introuvable');
    }
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      tenant: {
        id: user.tenant.id,
        nom: user.tenant.nom,
        referentiel: user.tenant.referentiel,
        // N'a de sens que si referentiel = SYCEBNL (voir prisma/schema.prisma) ·
        // le front s'en sert pour choisir le jeu d'états financiers à afficher.
        jeuEtatsFinanciersSycebnl: user.tenant.jeuEtatsFinanciersSycebnl,
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
