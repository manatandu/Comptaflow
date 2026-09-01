import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * SANTÉ DU SERVICE · GET /health, sans authentification : c'est la sonde
 * qu'interroge une surveillance externe (Cloud Monitoring, UptimeRobot…)
 * pour prévenir l'exploitant AVANT que le client n'appelle. Elle vérifie
 * la seule dépendance vitale, la base : un serveur qui répond mais ne
 * joint plus Neon est un serveur en panne, et doit le dire (503).
 * Aucune donnée n'est exposée · juste vivant ou pas.
 */
@Controller('health')
export class SanteController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async sante() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({ statut: 'indisponible', base: 'injoignable' });
    }
    return { statut: 'ok' };
  }
}
