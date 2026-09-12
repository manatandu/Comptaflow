import { Module } from '@nestjs/common';
import { ConstitutionService } from './constitution.service';
import { ConstitutionController } from './constitution.controller';
import { LicenceModule } from '../licence/licence.module';
import { JwtAuthModule } from '../auth/jwt-auth.module';

@Module({
  imports: [LicenceModule, JwtAuthModule],
  controllers: [ConstitutionController],
  providers: [ConstitutionService],
  exports: [ConstitutionService],
})
export class ConstitutionModule {}
