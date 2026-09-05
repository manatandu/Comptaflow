import { Module } from '@nestjs/common';
import { CourrierService } from './courrier.service';
import { CourrierController } from './courrier.controller';
import { TransportCourriel } from './transport-courriel';
import { LicenceModule } from '../licence/licence.module';
import { JwtAuthModule } from '../auth/jwt-auth.module';

/**
 * `CourrierService` est EXPORTÉ · les modules qui composent un texte (relances,
 * mots de passe provisoires) le mettent en file, ils n'ouvrent jamais de
 * connexion SMTP eux-mêmes. Un second chemin d'envoi serait un chemin sans
 * file, donc sans trace et sans reprise.
 */
@Module({
  imports: [LicenceModule, JwtAuthModule],
  controllers: [CourrierController],
  providers: [CourrierService, TransportCourriel],
  exports: [CourrierService],
})
export class CourrierModule {}
