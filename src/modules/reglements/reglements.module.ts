import { Module } from '@nestjs/common';
import { LicenceModule } from '../licence/licence.module';
import { JwtAuthModule } from '../auth/jwt-auth.module';
import { ComptabiliteModule } from '../comptabilite/comptabilite.module';
import { LettrageModule } from '../lettrage/lettrage.module';
import { ReglementsController } from './reglements.controller';
import { ReglementsService } from './reglements.service';

@Module({
  imports: [LicenceModule, JwtAuthModule, ComptabiliteModule, LettrageModule],
  controllers: [ReglementsController],
  providers: [ReglementsService],
})
export class ReglementsModule {}
