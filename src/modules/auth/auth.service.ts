import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../common/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import { CompteService } from '../comptes/compte.service';
import { ExerciceService } from '../exercice/exercice.service';
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
  ) {}

  /**
   * Crée le tenant, son admin, sa licence, son plan de comptes SYCEBNL et son
   * exercice courant. Reproduit le parcours de l'écran « Onboarding » du
   * canevas de design : le plan de comptes est prêt dès l'inscription, sans
   * étape de configuration manuelle.
   *
   * NB : la création tenant+licence+user et le seed du plan de comptes ne
   * sont pas dans la même transaction DB — un échec du seed après un tenant
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
      ...this.signToken(user.id, tenant.id, user.email, user.role),
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
    return this.signToken(user.id, user.tenantId, user.email, user.role);
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
      email: user.email,
      role: user.role,
      tenant: { id: user.tenant.id, nom: user.tenant.nom, referentiel: user.tenant.referentiel },
    };
  }

  private signToken(userId: string, tenantId: string, email: string, role: string) {
    const accessToken = this.jwt.sign({ sub: userId, tenantId, email, role });
    return { accessToken };
  }
}
