import { Module } from '@nestjs/common';
import { LettrageService } from './lettrage.service';
import { LettrageController } from './lettrage.controller';
import { LicenceModule } from '../licence/licence.module';
import { JwtAuthModule } from '../auth/jwt-auth.module';

@Module({
  imports: [LicenceModule, JwtAuthModule],
  controllers: [LettrageController],
  providers: [LettrageService],
  exports: [LettrageService],
})
export class LettrageModule {}
