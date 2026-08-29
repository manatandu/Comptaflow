import { Module } from '@nestjs/common';
import { BailleurService } from './bailleur.service';
import { BailleurController } from './bailleur.controller';
import { LicenceModule } from '../licence/licence.module';
import { JwtAuthModule } from '../auth/jwt-auth.module';

@Module({
  imports: [LicenceModule, JwtAuthModule],
  controllers: [BailleurController],
  providers: [BailleurService],
  exports: [BailleurService],
})
export class BailleursModule {}
