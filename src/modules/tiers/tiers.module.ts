import { Module } from '@nestjs/common';
import { TiersService } from './tiers.service';
import { TiersController, ModeleReglementController } from './tiers.controller';
import { LicenceModule } from '../licence/licence.module';
import { JwtAuthModule } from '../auth/jwt-auth.module';

@Module({
  imports: [LicenceModule, JwtAuthModule],
  controllers: [TiersController, ModeleReglementController],
  providers: [TiersService],
  exports: [TiersService],
})
export class TiersModule {}
