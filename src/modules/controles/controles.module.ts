import { Module } from '@nestjs/common';
import { ControlesService } from './controles.service';
import { ControlesController } from './controles.controller';
import { LicenceModule } from '../licence/licence.module';
import { JwtAuthModule } from '../auth/jwt-auth.module';

@Module({
  imports: [LicenceModule, JwtAuthModule],
  controllers: [ControlesController],
  providers: [ControlesService],
  exports: [ControlesService],
})
export class ControlesModule {}
