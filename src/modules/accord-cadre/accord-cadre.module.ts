import { Module } from '@nestjs/common';
import { AccordCadreService } from './accord-cadre.service';
import { AccordCadreController } from './accord-cadre.controller';
import { LicenceModule } from '../licence/licence.module';
import { JwtAuthModule } from '../auth/jwt-auth.module';

@Module({
  imports: [LicenceModule, JwtAuthModule],
  controllers: [AccordCadreController],
  providers: [AccordCadreService],
  exports: [AccordCadreService],
})
export class AccordCadreModule {}
