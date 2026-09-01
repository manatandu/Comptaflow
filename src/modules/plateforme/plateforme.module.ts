import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PlateformeService } from './plateforme.service';
import { PlateformeController } from './plateforme.controller';
import { OperateurPlateformeGuard } from './operateur-plateforme.guard';

@Module({
  // AuthModule pour AuthService : la création d'un cabinet client réutilise
  // le pipeline d'inscription (voir PlateformeService.creerCabinet).
  imports: [AuthModule],
  controllers: [PlateformeController],
  providers: [PlateformeService, OperateurPlateformeGuard],
})
export class PlateformeModule {}
