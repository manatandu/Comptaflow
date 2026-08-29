import { Module } from '@nestjs/common';
import { RetenuesService } from './retenues.service';
import { RetenuesController } from './retenues.controller';
import { LicenceModule } from '../licence/licence.module';
import { JwtAuthModule } from '../auth/jwt-auth.module';

@Module({
  imports: [LicenceModule, JwtAuthModule],
  controllers: [RetenuesController],
  providers: [RetenuesService],
  exports: [RetenuesService],
})
export class RetenuesModule {}
