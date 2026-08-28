import { Module } from '@nestjs/common';
import { ImmobilisationService } from './immobilisation.service';
import { ImmobilisationController } from './immobilisation.controller';
import { LicenceModule } from '../licence/licence.module';
import { JwtAuthModule } from '../auth/jwt-auth.module';
import { ComptabiliteModule } from '../comptabilite/comptabilite.module';

@Module({
  imports: [LicenceModule, JwtAuthModule, ComptabiliteModule],
  controllers: [ImmobilisationController],
  providers: [ImmobilisationService],
  exports: [ImmobilisationService],
})
export class ImmobilisationsModule {}
