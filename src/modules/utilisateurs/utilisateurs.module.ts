import { Module } from '@nestjs/common';
import { UtilisateurService } from './utilisateur.service';
import { UtilisateurController } from './utilisateur.controller';
import { AvisAccesService } from './avis-acces.service';
import { LicenceModule } from '../licence/licence.module';
import { JwtAuthModule } from '../auth/jwt-auth.module';
import { CourrierModule } from '../courrier/courrier.module';

/**
 * `CourrierModule` est importé pour la FILE · la remise d'un accès était
 * muette, le titulaire n'apprenait rien de son compte ni de la
 * réinitialisation de son mot de passe (voir avis-acces.service.ts).
 */
@Module({
  imports: [LicenceModule, JwtAuthModule, CourrierModule],
  controllers: [UtilisateurController],
  providers: [UtilisateurService, AvisAccesService],
  exports: [UtilisateurService],
})
export class UtilisateursModule {}
