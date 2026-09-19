import { Module } from '@nestjs/common';
import { StockService } from './stock.service';
import { StockController } from './stock.controller';
import { MagasinService } from './magasin.service';
import { MagasinController } from './magasin.controller';
import { LicenceModule } from '../licence/licence.module';
import { JwtAuthModule } from '../auth/jwt-auth.module';
import { ComptabiliteModule } from '../comptabilite/comptabilite.module';

@Module({
  imports: [LicenceModule, JwtAuthModule, ComptabiliteModule],
  controllers: [StockController, MagasinController],
  providers: [StockService, MagasinService],
  exports: [StockService, MagasinService],
})
export class StockModule {}
