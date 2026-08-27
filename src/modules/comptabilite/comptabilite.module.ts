import { Module } from '@nestjs/common';
import { EcritureService } from './ecriture.service';
import { EcritureController } from './ecriture.controller';
import { LicenceModule } from '../licence/licence.module';
import { JwtAuthModule } from '../auth/jwt-auth.module';

@Module({
  imports: [LicenceModule, JwtAuthModule],
  controllers: [EcritureController],
  providers: [EcritureService],
  exports: [EcritureService],
})
export class ComptabiliteModule {}
