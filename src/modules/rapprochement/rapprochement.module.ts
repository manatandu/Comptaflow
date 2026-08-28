import { Module } from '@nestjs/common';
import { RapprochementService } from './rapprochement.service';
import { RapprochementController } from './rapprochement.controller';
import { LicenceModule } from '../licence/licence.module';
import { JwtAuthModule } from '../auth/jwt-auth.module';

@Module({
  imports: [LicenceModule, JwtAuthModule],
  controllers: [RapprochementController],
  providers: [RapprochementService],
  exports: [RapprochementService],
})
export class RapprochementModule {}
