import { Module } from '@nestjs/common';
import { AffectationService } from './affectation.service';
import { AffectationController } from './affectation.controller';
import { LicenceModule } from '../licence/licence.module';
import { JwtAuthModule } from '../auth/jwt-auth.module';
import { ComptabiliteModule } from '../comptabilite/comptabilite.module';

@Module({
  imports: [LicenceModule, JwtAuthModule, ComptabiliteModule],
  controllers: [AffectationController],
  providers: [AffectationService],
  exports: [AffectationService],
})
export class AffectationModule {}
