import { Module } from '@nestjs/common';
import { ExonerationsService } from './exonerations.service';
import { ExonerationsController } from './exonerations.controller';
import { LicenceModule } from '../licence/licence.module';
import { JwtAuthModule } from '../auth/jwt-auth.module';

@Module({
  imports: [LicenceModule, JwtAuthModule],
  controllers: [ExonerationsController],
  providers: [ExonerationsService],
  exports: [ExonerationsService],
})
export class ExonerationsModule {}
