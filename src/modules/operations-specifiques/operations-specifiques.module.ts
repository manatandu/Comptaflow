import { Module } from '@nestjs/common';
import { OperationSpecifiqueService } from './operation-specifique.service';
import { OperationSpecifiqueController } from './operation-specifique.controller';
import { LicenceModule } from '../licence/licence.module';
import { JwtAuthModule } from '../auth/jwt-auth.module';
import { ComptabiliteModule } from '../comptabilite/comptabilite.module';

@Module({
  imports: [LicenceModule, JwtAuthModule, ComptabiliteModule],
  controllers: [OperationSpecifiqueController],
  providers: [OperationSpecifiqueService],
  exports: [OperationSpecifiqueService],
})
export class OperationsSpecifiquesModule {}
