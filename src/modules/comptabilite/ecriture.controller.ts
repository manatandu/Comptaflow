import { Body, Controller, Post, Req } from '@nestjs/common';
import { EcritureService } from './ecriture.service';
import { CreerEcritureDto } from './dto/creer-ecriture.dto';

// NB : @UseGuards(AuthGuard, LicenceGuard) à ajouter ici dès l'Auth branchée (Phase 1).
@Controller('ecritures')
export class EcritureController {
  constructor(private readonly ecritureService: EcritureService) {}

  @Post()
  async creer(@Req() request: any, @Body() dto: CreerEcritureDto) {
    const tenantId = request.user?.tenantId;
    const userId = request.user?.userId ?? 'system';
    return this.ecritureService.creer(tenantId, userId, dto);
  }
}
