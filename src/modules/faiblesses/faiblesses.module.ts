import { Module } from '@nestjs/common';
import { FaiblessesService } from './faiblesses.service';
import { FaiblessesController } from './faiblesses.controller';
import { LicenceModule } from '../licence/licence.module';
import { JwtAuthModule } from '../auth/jwt-auth.module';

@Module({
  imports: [LicenceModule, JwtAuthModule],
  controllers: [FaiblessesController],
  providers: [FaiblessesService],
  exports: [FaiblessesService],
})
export class FaiblessesModule {}
