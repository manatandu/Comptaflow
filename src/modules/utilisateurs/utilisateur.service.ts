import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../common/prisma.service';
import { CreerUtilisateurDto, ModifierUtilisateurDto } from './dto/utilisateur.dto';

const SALT_ROUNDS = 12;

// Champs exposés côté API · motDePasse (haché) n'en fait jamais partie.
// `doitChangerMotDePasse` et `verrouilleJusqua` y figurent : l'administrateur
// doit voir qui n'a pas encore posé son propre mot de passe, et qui est
// bloqué dehors · ce sont les deux questions qu'il pose en ouvrant l'écran.
const SELECTION = {
  id: true,
  email: true,
  role: true,
  estActif: true,
  doitChangerMotDePasse: true,
  verrouilleJusqua: true,
  createdAt: true,
} as const;

@Injectable()
export class UtilisateurService {
  constructor(private readonly prisma: PrismaService) {}

  async lister(tenantId: string) {
    return this.prisma.user.findMany({ where: { tenantId }, select: SELECTION, orderBy: { createdAt: 'asc' } });
  }

  async creer(tenantId: string, dto: CreerUtilisateurDto) {
    const existant = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existant) {
      throw new ConflictException('Un compte existe déjà avec cet email');
    }
    const motDePasseHache = await bcrypt.hash(dto.motDePasse, SALT_ROUNDS);
    return this.prisma.user.create({
      // doitChangerMotDePasse : le mot de passe a été choisi par l'ADMIN du
      // dossier, pas par le titulaire · celui-ci le remplace à sa première
      // connexion, ce qui clôt la période où l'admin pouvait ouvrir le
      // dossier à sa place (voir schema.prisma, User).
      data: { tenantId, email: dto.email, motDePasse: motDePasseHache, role: dto.role, doitChangerMotDePasse: true },
      select: SELECTION,
    });
  }

  async modifier(tenantId: string, userId: string, utilisateurCourantId: string, dto: ModifierUtilisateurDto) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, tenantId } });
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable pour ce tenant');
    }
    if (userId === utilisateurCourantId && dto.estActif === false) {
      throw new BadRequestException('Impossible de désactiver son propre compte');
    }
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        ...dto,
        // DÉSACTIVER, C'EST METTRE DEHORS TOUT DE SUITE. JwtStrategy relit
        // déjà `estActif` à chaque requête, mais un changement de RÔLE, lui,
        // ne fermait rien : rétrograder un ADMIN_CABINET le laissait agir en
        // administrateur jusqu'à l'expiration de son jeton, soit huit heures.
        ...(dto.estActif === false || dto.role !== undefined ? { sessionsInvalidesAvant: new Date() } : {}),
      },
      select: SELECTION,
    });
  }

  /**
   * RÉINITIALISATION PAR L'ADMINISTRATEUR DU DOSSIER.
   *
   * Sans elle, un oubli de mot de passe se réglait par un UPDATE SQL en
   * production · c'est-à-dire par une connexion directe à la base de tous les
   * cabinets, faite à la main, sans trace autre que celle du serveur SQL.
   *
   * Trois effets, indissociables :
   *  · le mot de passe devient PROVISOIRE (`doitChangerMotDePasse`), puisqu'il
   *    a transité par l'administrateur · le titulaire doit le remplacer avant
   *    de travailler, et le serveur le refuse désormais (MotDePasseAChangerGuard) ;
   *  · les sessions du compte sont FERMÉES · si le mot de passe est
   *    réinitialisé, c'est souvent qu'il a été perdu, et « perdu » peut
   *    vouloir dire « trouvé par quelqu'un d'autre » ;
   *  · le verrou de force brute tombe · c'est aussi la sortie de secours d'un
   *    comptable bloqué dehors.
   *
   * Le geste est journalisé par le journal d'audit (le modèle User y figure),
   * mot de passe masqué · un administrateur qui réinitialise le compte d'un
   * collaborateur laisse donc une trace que la chaîne d'empreintes protège.
   */
  async reinitialiserMotDePasse(tenantId: string, userId: string, motDePasseProvisoire: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, tenantId } });
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable pour ce tenant');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        motDePasse: await bcrypt.hash(motDePasseProvisoire, SALT_ROUNDS),
        doitChangerMotDePasse: true,
        sessionsInvalidesAvant: new Date(),
        tentativesEchouees: 0,
        verrouilleJusqua: null,
      },
    });
    return { reinitialise: true, email: user.email };
  }

  /**
   * Lève le verrou de force brute sans toucher au mot de passe · le cas du
   * comptable qui a mal tapé cinq fois et se souvient très bien du sien.
   */
  async deverrouiller(tenantId: string, userId: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, tenantId } });
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable pour ce tenant');
    }
    return this.prisma.user.update({
      where: { id: userId },
      data: { tentativesEchouees: 0, verrouilleJusqua: null },
      select: SELECTION,
    });
  }
}
