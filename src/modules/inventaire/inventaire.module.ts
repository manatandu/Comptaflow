import { Module } from '@nestjs/common';
import { InventaireService } from './inventaire.service';
import { InventaireController } from './inventaire.controller';
import { LicenceModule } from '../licence/licence.module';
import { JwtAuthModule } from '../auth/jwt-auth.module';
import { ComptabiliteModule } from '../comptabilite/comptabilite.module';

@Module({
  imports: [LicenceModule, JwtAuthModule, ComptabiliteModule],
  controllers: [InventaireController],
  providers: [InventaireService],
  exports: [InventaireService],
})
export class InventaireModule {}
