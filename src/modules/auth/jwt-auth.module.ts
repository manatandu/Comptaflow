import { Module } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

/**
 * Module dédié au seul JwtAuthGuard, séparé d'AuthModule : AuthModule importe
 * ComptesModule/ExerciceModule (pour l'inscription), donc si ces modules
 * importaient AuthModule en retour pour obtenir le guard, on aurait une
 * dépendance circulaire entre modules. JwtAuthGuard n'a aucune dépendance
 * propre (la stratégie 'jwt' est enregistrée globalement par Passport dès
 * qu'AuthModule instancie JwtStrategy) — ce module peut donc être importé
 * partout sans rien entraîner d'autre.
 */
@Module({
  providers: [JwtAuthGuard],
  exports: [JwtAuthGuard],
})
export class JwtAuthModule {}
