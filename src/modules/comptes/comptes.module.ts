import { Module } from '@nestjs/common';
import { CompteService } from './compte.service';
import { CompteController } from './compte.controller';
import { NaturesCompteController } from './natures-compte.controller';
import { NaturesCompteService } from './natures-compte.service';
import { LicenceModule } from '../licence/licence.module';
import { JwtAuthModule } from '../auth/jwt-auth.module';

@Module({
  imports: [LicenceModule, JwtAuthModule],
  controllers: [CompteController, NaturesCompteController],
  providers: [CompteService, NaturesCompteService],
  exports: [CompteService],
})
export class ComptesModule {}
