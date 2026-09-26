import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma.module';
import { LicenceModule } from '../licence/licence.module';
import { JwtAuthModule } from '../auth/jwt-auth.module';
import { ComptabiliteModule } from '../comptabilite/comptabilite.module';
import { SimulationsService } from './simulations.service';
import { SimulationsController } from './simulations.controller';

// ComptabiliteModule · la balance d'EcritureService, la même que la balance
// générale. LicenceModule et JwtAuthModule · les gardes du contrôleur.
@Module({
  imports: [PrismaModule, LicenceModule, JwtAuthModule, ComptabiliteModule],
  controllers: [SimulationsController],
  providers: [SimulationsService],
})
export class SimulationsModule {}
