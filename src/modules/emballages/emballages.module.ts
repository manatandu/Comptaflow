import { Module } from '@nestjs/common';
import { EmballagesService } from './emballages.service';
import { EmballagesController } from './emballages.controller';
import { LicenceModule } from '../licence/licence.module';
import { JwtAuthModule } from '../auth/jwt-auth.module';

@Module({
  imports: [LicenceModule, JwtAuthModule],
  controllers: [EmballagesController],
  providers: [EmballagesService],
  exports: [EmballagesService],
})
export class EmballagesModule {}
