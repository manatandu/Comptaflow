import { Module } from '@nestjs/common';
import { TiersService } from './tiers.service';
import { TiersController, ModeleReglementController } from './tiers.controller';
import { DocumentsTiersController } from './documents-tiers.controller';
import { DocumentsTiersService } from './documents-tiers.service';
import { LicenceModule } from '../licence/licence.module';
import { JwtAuthModule } from '../auth/jwt-auth.module';

@Module({
  imports: [LicenceModule, JwtAuthModule],
  controllers: [TiersController, ModeleReglementController, DocumentsTiersController],
  providers: [TiersService, DocumentsTiersService],
  exports: [TiersService],
})
export class TiersModule {}
