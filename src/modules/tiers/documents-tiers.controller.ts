import {
  ArgumentsHost,
  Body,
  Catch,
  Controller,
  Delete,
  ExceptionFilter,
  Get,
  Param,
  Patch,
  PayloadTooLargeException,
  Post,
  Res,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { RoleUtilisateur } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { DocumentsTiersService } from './documents-tiers.service';
import { TAILLE_MAX_DOCUMENT, dispositionTelechargement } from './documents-tiers';
import { CommentaireDocumentDto, DeposerDocumentDto } from './dto/documents-tiers.dto';

/**
 * Multer coupe la réception au-delà de 5 Mo et lève « File too large » en
 * anglais · la limite est posée À LA RÉCEPTION pour qu'un envoi de 500 Mo ne
 * soit jamais tenu en mémoire, et ce filtre en redit le motif en français.
 */
@Catch(PayloadTooLargeException)
class TropVolumineux implements ExceptionFilter {
  catch(_e: PayloadTooLargeException, hote: ArgumentsHost) {
    hote
      .switchToHttp()
      .getResponse<Response>()
      .status(413)
      .json({ statusCode: 413, message: 'Le fichier dépasse 5 Mo · réduisez-le ou numérisez-le en plus basse définition.' });
  }
}

/**
 * Le volet « Documents » de la fiche tiers. Consultation ouverte à tous les
 * rôles, comme la fiche ; dépôt, commentaire et retrait au cabinet qui tient
 * le dossier (admin et comptable) · attacher une pièce justificative est un
 * geste courant, pas une modification de la structure du tiers.
 */
@UseGuards(JwtAuthGuard, LicenceGuard, RolesGuard)
@Controller()
export class DocumentsTiersController {
  constructor(private readonly documents: DocumentsTiersService) {}

  @Get('tiers/:tiersId/documents')
  lister(@CurrentUser() user: AuthenticatedUser, @Param('tiersId') tiersId: string) {
    return this.documents.lister(user.tenantId, tiersId);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Post('tiers/:tiersId/documents')
  @UseFilters(TropVolumineux)
  @UseInterceptors(
    // Sans `dest` ni `storage`, multer garde le fichier EN MÉMOIRE (`buffer`) ·
    // rien n'est écrit sur le disque du conteneur, qui n'est pas persistant.
    FileInterceptor('fichier', { limits: { fileSize: TAILLE_MAX_DOCUMENT, files: 1, fields: 4 } }),
  )
  deposer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tiersId') tiersId: string,
    @UploadedFile() fichier: { originalname: string; buffer: Buffer } | undefined,
    @Body() dto: DeposerDocumentDto,
  ) {
    return this.documents.deposer(user.tenantId, tiersId, fichier, dto.commentaire, user.email);
  }

  @Get('documents-tiers/:id/fichier')
  async telecharger(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Res() res: Response) {
    const document = await this.documents.telecharger(user.tenantId, id);
    res.set({
      'Content-Type': document.typeMime,
      'Content-Disposition': dispositionTelechargement(document.nomFichier),
      'X-Content-Type-Options': 'nosniff',
      'Access-Control-Expose-Headers': 'Content-Disposition',
    });
    res.send(Buffer.from(document.contenu));
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Patch('documents-tiers/:id')
  modifier(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: CommentaireDocumentDto) {
    return this.documents.modifierCommentaire(user.tenantId, id, dto.commentaire);
  }

  @Roles(RoleUtilisateur.ADMIN_CABINET, RoleUtilisateur.COMPTABLE)
  @Delete('documents-tiers/:id')
  supprimer(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.documents.supprimer(user.tenantId, id);
  }
}
