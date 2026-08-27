import { Module } from '@nestjs/common';
import { CompteService } from './compte.service';
import { CompteController } from './compte.controller';
import { LicenceModule } from '../licence/licence.module';
import { JwtAuthModule } from '../auth/jwt-auth.module';

@Module({
  imports: [LicenceModule, JwtAuthModule],
  controllers: [CompteController],
  providers: [CompteService],
  exports: [CompteService],
})
export class ComptesModule {}
