import { Controller, Get, Req, Res, UseGuards } from '@nestjs/common';
import { RoleUtilisateur } from '@prisma/client';
import { Request, Response } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { AuthenticatedUser, CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RestitutionService } from './restitution.service';

/**
 * LA RESTITUTION, ET LES DEUX GARDES QU'ELLE NE PORTE PAS.
 *
 * PAS DE `LicenceGuard`, à la différence du contrôleur d'exports. Une
 * restitution posée derrière lui ne serait disponible que tant que le client
 * paie · c'est-à-dire pas dans le seul cas où elle sert, la sortie d'un
 * client (suspendre, archiver, restituer, purger). Ce sont ses données ; les
 * retenir comme moyen de pression est ce qu'une garantie de réversibilité
 * doit exclure. DÉCISION DE VMG, pas règle de droit · aucun texte lu ne
 * tranche, c'est une clause de contrat de licence, et elle se défait en
 * ajoutant le garde à cette ligne.
 *
 * PAS DE `ReferentielGuard`. L'obligation dont cette route découle est
 * l'AUDCIF art. 22, que l'art. 3 du SYCEBNL n'écarte PAS · elle vaut donc
 * identiquement des deux côtés, et un décorateur de référentiel ici
 * fabriquerait une différence que le texte ne fait pas.
 *
 * `@Roles(ADMIN_CABINET)` en revanche · une copie intégrale du dossier n'est
 * pas une consultation. Aucun texte ne dit qui a qualité pour la demander :
 * c'est encore une décision, prise sur le même motif que l'établissement des
 * documents obligatoires.
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('restitution')
export class RestitutionController {
  constructor(private readonly restitution: RestitutionService) {}

  @Get('archive')
  @Roles(RoleUtilisateur.ADMIN_CABINET)
  async archive(@CurrentUser() user: AuthenticatedUser, @Req() req: Request, @Res() res: Response) {
    // Les en-têtes partent AVANT la première ligne · l'archive est produite
    // en flux, il n'y a pas de moment où l'on connaîtrait sa taille. Le nom
    // de fichier est donc posé ici, à partir du dossier, et non rendu par le
    // service à la fin.
    const jour = new Date().toISOString().slice(0, 10);
    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="restitution-${jour}.zip"`,
      // Sans cet en-tête, `fetch` côté client ne voit pas le nom proposé ·
      // CORS masque tout sauf une liste blanche.
      'Access-Control-Expose-Headers': 'Content-Disposition',
    });
    await this.restitution.produire(
      user.tenantId,
      { id: user.userId, email: user.email, adresseIp: req.ip ?? null },
      res,
    );
  }
}
