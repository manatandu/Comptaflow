import { Module } from '@nestjs/common';
import { BalanceFonctionnelleService } from './balance-fonctionnelle.service';
import { MonnaieFonctionnelleController } from './monnaie-fonctionnelle.controller';
import { LicenceModule } from '../licence/licence.module';
import { JwtAuthModule } from '../auth/jwt-auth.module';

@Module({
  imports: [LicenceModule, JwtAuthModule],
  controllers: [MonnaieFonctionnelleController],
  providers: [BalanceFonctionnelleService],
  exports: [BalanceFonctionnelleService],
})
export class MonnaieFonctionnelleModule {}
