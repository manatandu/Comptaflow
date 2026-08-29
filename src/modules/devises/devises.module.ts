import { Module } from '@nestjs/common';
import { DevisesService } from './devises.service';
import { DevisesController } from './devises.controller';
import { LicenceModule } from '../licence/licence.module';
import { JwtAuthModule } from '../auth/jwt-auth.module';
import { ComptabiliteModule } from '../comptabilite/comptabilite.module';

@Module({
  imports: [LicenceModule, JwtAuthModule, ComptabiliteModule],
  controllers: [DevisesController],
  providers: [DevisesService],
  exports: [DevisesService],
})
export class DevisesModule {}
