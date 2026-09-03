import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma.module';
import { LicenceModule } from '../../modules/licence/licence.module';
import { JwtAuthModule } from '../../modules/auth/jwt-auth.module';
import { JournalAuditService } from './journal-audit.service';
import { JournalAuditController } from './journal-audit.controller';

@Module({
  // Le contrôleur porte JwtAuthGuard, LicenceGuard et RolesGuard · les deux
  // premiers ont besoin de services fournis par ces modules. Sans eux, Nest
  // REFUSE DE DÉMARRER · le conteneur n'écoute jamais son port et Cloud Run
  // garde l'ancienne révision. Panne trouvée le 2026-09-03, après six
  // déploiements silencieusement échoués.
  imports: [PrismaModule, LicenceModule, JwtAuthModule],
  controllers: [JournalAuditController],
  providers: [JournalAuditService],
  exports: [JournalAuditService],
})
export class JournalAuditModule {}
