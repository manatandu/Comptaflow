import { Module } from '@nestjs/common';
import { RelancesService } from './relances.service';
import { RelancesController } from './relances.controller';
import { LicenceModule } from '../licence/licence.module';
import { JwtAuthModule } from '../auth/jwt-auth.module';

@Module({
  imports: [LicenceModule, JwtAuthModule],
  controllers: [RelancesController],
  providers: [RelancesService],
  exports: [RelancesService],
})
export class RelancesModule {}
