import { Module } from '@nestjs/common';
import { ProvisionsService } from './provisions.service';
import { ProvisionsController } from './provisions.controller';
import { LicenceModule } from '../licence/licence.module';
import { JwtAuthModule } from '../auth/jwt-auth.module';
import { ComptabiliteModule } from '../comptabilite/comptabilite.module';

@Module({
  imports: [LicenceModule, JwtAuthModule, ComptabiliteModule],
  controllers: [ProvisionsController],
  providers: [ProvisionsService],
  exports: [ProvisionsService],
})
export class ProvisionsModule {}
