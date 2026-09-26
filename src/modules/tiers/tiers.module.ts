import { Module } from '@nestjs/common';
import { TiersService } from './tiers.service';
import { TiersController, ModeleReglementController } from './tiers.controller';
import { DocumentsTiersController } from './documents-tiers.controller';
import { DocumentsTiersService } from './documents-tiers.service';
import { RibsTiersController } from './ribs-tiers.controller';
import { RibsTiersService } from './ribs-tiers.service';
import { LicenceModule } from '../licence/licence.module';
import { JwtAuthModule } from '../auth/jwt-auth.module';

@Module({
  imports: [LicenceModule, JwtAuthModule],
  controllers: [TiersController, ModeleReglementController, DocumentsTiersController, RibsTiersController],
  providers: [TiersService, DocumentsTiersService, RibsTiersService],
  exports: [TiersService],
})
export class TiersModule {}
