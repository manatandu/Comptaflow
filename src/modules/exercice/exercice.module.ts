import { Module } from '@nestjs/common';
import { ExerciceService } from './exercice.service';
import { ExerciceController } from './exercice.controller';
import { LicenceModule } from '../licence/licence.module';
import { JwtAuthModule } from '../auth/jwt-auth.module';

@Module({
  imports: [LicenceModule, JwtAuthModule],
  controllers: [ExerciceController],
  providers: [ExerciceService],
  exports: [ExerciceService],
})
export class ExerciceModule {}
