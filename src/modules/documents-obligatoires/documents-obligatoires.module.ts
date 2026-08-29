import { Module } from '@nestjs/common';
import { LivreInventaireService } from './livre-inventaire.service';
import { RapportActiviteService } from './rapport-activite.service';
import { DocumentsObligatoiresController } from './documents-obligatoires.controller';
import { LicenceModule } from '../licence/licence.module';
import { JwtAuthModule } from '../auth/jwt-auth.module';
import { EtatsFinanciersModule } from '../etats-financiers/etats-financiers.module';
import { RegistreDonateursModule } from '../registre-donateurs/registre-donateurs.module';

@Module({
  imports: [LicenceModule, JwtAuthModule, EtatsFinanciersModule, RegistreDonateursModule],
  controllers: [DocumentsObligatoiresController],
  providers: [LivreInventaireService, RapportActiviteService],
  exports: [LivreInventaireService, RapportActiviteService],
})
export class DocumentsObligatoiresModule {}
