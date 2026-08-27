import { Module } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

/**
 * Module dédié aux gardes transverses (JwtAuthGuard, RolesGuard), séparé
 * d'AuthModule : AuthModule importe ComptesModule/ExerciceModule/UtilisateursModule
 * (pour l'inscription), donc si ces modules importaient AuthModule en retour
 * pour obtenir les gardes, on aurait une dépendance circulaire entre modules.
 * Ni JwtAuthGuard ni RolesGuard n'ont de dépendance propre à un autre module
 * métier (la stratégie 'jwt' est enregistrée globalement par Passport dès
 * qu'AuthModule instancie JwtStrategy ; RolesGuard ne dépend que du Reflector
 * fourni par Nest) — ce module peut donc être importé partout sans rien
 * entraîner d'autre.
 */
@Module({
  providers: [JwtAuthGuard, RolesGuard],
  exports: [JwtAuthGuard, RolesGuard],
})
export class JwtAuthModule {}
