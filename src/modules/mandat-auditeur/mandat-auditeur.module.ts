import { Module } from '@nestjs/common';
import { MandatAuditeurService } from './mandat-auditeur.service';
import { MandatAuditeurController } from './mandat-auditeur.controller';
import { LicenceModule } from '../licence/licence.module';
import { JwtAuthModule } from '../auth/jwt-auth.module';

@Module({
  imports: [LicenceModule, JwtAuthModule],
  controllers: [MandatAuditeurController],
  providers: [MandatAuditeurService],
  exports: [MandatAuditeurService],
})
export class MandatAuditeurModule {}
