import { Module } from '@nestjs/common';
import { TauxTvaService } from './taux-tva.service';
import { TauxTvaController } from './taux-tva.controller';
import { LicenceModule } from '../licence/licence.module';
import { JwtAuthModule } from '../auth/jwt-auth.module';
import { ComptabiliteModule } from '../comptabilite/comptabilite.module';

@Module({
  // ComptabiliteModule : la liquidation TVA pose une écriture normale via
  // EcritureService (mêmes contrôles que n'importe quelle saisie — équilibre,
  // exercice ouvert, clôtures).
  imports: [LicenceModule, JwtAuthModule, ComptabiliteModule],
  controllers: [TauxTvaController],
  providers: [TauxTvaService],
  exports: [TauxTvaService],
})
export class TvaModule {}
