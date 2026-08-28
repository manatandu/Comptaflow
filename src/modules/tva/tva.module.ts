import { Module } from '@nestjs/common';
import { TauxTvaService } from './taux-tva.service';
import { TauxTvaController } from './taux-tva.controller';
import { LicenceModule } from '../licence/licence.module';
import { JwtAuthModule } from '../auth/jwt-auth.module';

@Module({
  imports: [LicenceModule, JwtAuthModule],
  controllers: [TauxTvaController],
  providers: [TauxTvaService],
  exports: [TauxTvaService],
})
export class TvaModule {}
