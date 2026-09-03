import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma.module';
import { LicenceModule } from '../licence/licence.module';
import { JwtAuthModule } from '../auth/jwt-auth.module';
import { ModeleSaisieService } from './modele-saisie.service';
import { ModeleSaisieController } from './modele-saisie.controller';

// LicenceModule et JwtAuthModule sont ICI parce que le contrôleur pose
// LicenceGuard et JwtAuthGuard · un module qui les oublie fait échouer la
// résolution de dépendances AU DÉMARRAGE, et le conteneur ne répond plus
// (incident du 2026-09-02, CLAUDE.md §5).
@Module({
  imports: [PrismaModule, LicenceModule, JwtAuthModule],
  controllers: [ModeleSaisieController],
  providers: [ModeleSaisieService],
  exports: [ModeleSaisieService],
})
export class ModelesSaisieModule {}
