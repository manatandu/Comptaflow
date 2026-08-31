import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { Licence, StatutLicence, TypeLicence } from '@prisma/client';

/**
 * Logique d'accès dictée par le type de licence :
 *
 * - ABONNEMENT            → coupure automatique si `dateExpiration` est dépassée.
 * - PERPETUEL_SAAS        → jamais de coupure (payé une fois, hébergé chez nous).
 * - PERPETUEL_ONPREMISE   → jamais de coupure sur la date, MAIS un heartbeat
 *   périodique vers LICENCE_CHECK_URL est exigé (anti-piratage) ; au-delà de
 *   `joursGraceHorsLigne` sans heartbeat réussi, l'accès est aussi coupé.
 *   C'est ce qui distingue "perpétuel installé chez le client" d'un simple
 *   logiciel copiable sans contrôle.
 */
@Injectable()
export class LicenceService {
  constructor(private readonly prisma: PrismaService) {}

  async estAccesAutorise(tenantId: string): Promise<{ autorise: boolean; motif?: string }> {
    const licence = await this.prisma.licence.findUnique({ where: { tenantId } });
    return this.evaluerLicence(licence);
  }

  /**
   * Évaluation PURE d'une licence déjà chargée · aucun accès base. C'est ce
   * qu'appelle LicenceGuard quand JwtStrategy a préchargé la licence avec
   * l'utilisateur (le cas de toute requête HTTP normale) ; estAccesAutorise
   * reste la voie de service pour les appels qui partent d'un tenantId seul.
   */
  evaluerLicence(licence: Licence | null): { autorise: boolean; motif?: string } {
    if (!licence) {
      return { autorise: false, motif: 'Aucune licence associée à ce tenant' };
    }

    if (licence.statut === StatutLicence.SUSPENDUE) {
      return { autorise: false, motif: 'Licence suspendue' };
    }

    switch (licence.type) {
      case TypeLicence.ABONNEMENT: {
        if (licence.dateExpiration && licence.dateExpiration < new Date()) {
          return { autorise: false, motif: 'Abonnement expiré' };
        }
        return { autorise: true };
      }

      case TypeLicence.PERPETUEL_SAAS: {
        return { autorise: true };
      }

      case TypeLicence.PERPETUEL_ONPREMISE: {
        const limite = new Date();
        limite.setDate(limite.getDate() - licence.joursGraceHorsLigne);
        if (!licence.dernierHeartbeatAt || licence.dernierHeartbeatAt < limite) {
          return { autorise: false, motif: 'Vérification de licence hors-ligne dépassée' };
        }
        return { autorise: true };
      }

      default:
        return { autorise: false, motif: 'Type de licence inconnu' };
    }
  }

  /** Appelé périodiquement par l'installation on-premise pour prouver qu'elle est toujours en ligne. */
  async enregistrerHeartbeat(tenantId: string): Promise<void> {
    await this.prisma.licence.update({
      where: { tenantId },
      data: { dernierHeartbeatAt: new Date() },
    });
  }
}
