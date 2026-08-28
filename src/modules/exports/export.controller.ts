import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ExportService } from './export.service';

const TYPE_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function envoyerXlsx(res: Response, buffer: Buffer, nomFichier: string) {
  res.set({
    'Content-Type': TYPE_XLSX,
    'Content-Disposition': `attachment; filename="${nomFichier}"`,
  });
  res.send(buffer);
}

@UseGuards(JwtAuthGuard, LicenceGuard)
@Controller('exports')
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @Get('journal')
  async journal(
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
    @Query('exerciceId') exerciceId?: string,
    @Query('journalId') journalId?: string,
    @Query('dateDebut') dateDebut?: string,
    @Query('dateFin') dateFin?: string,
    @Query('recherche') recherche?: string,
  ) {
    const buffer = await this.exportService.journalExcel(user.tenantId, {
      exerciceId,
      journalId,
      dateDebut,
      dateFin,
      recherche,
    });
    envoyerXlsx(res, buffer, 'journal.xlsx');
  }

  @Get('grand-livre/:compteId')
  async grandLivre(
    @CurrentUser() user: AuthenticatedUser,
    @Param('compteId') compteId: string,
    @Res() res: Response,
    @Query('exerciceId') exerciceId?: string,
  ) {
    const buffer = await this.exportService.grandLivreExcel(user.tenantId, compteId, exerciceId);
    envoyerXlsx(res, buffer, 'grand-livre.xlsx');
  }

  @Get('balance')
  async balance(@CurrentUser() user: AuthenticatedUser, @Res() res: Response, @Query('exerciceId') exerciceId: string) {
    const buffer = await this.exportService.balanceExcel(user.tenantId, exerciceId);
    envoyerXlsx(res, buffer, 'balance.xlsx');
  }

  @Get('etats-financiers/bilan')
  async bilan(@CurrentUser() user: AuthenticatedUser, @Res() res: Response, @Query('exerciceId') exerciceId: string) {
    const buffer = await this.exportService.bilanExcel(user.tenantId, exerciceId);
    envoyerXlsx(res, buffer, 'bilan.xlsx');
  }
}
