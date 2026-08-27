import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LicenceGuard } from '../licence/licence.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ExerciceService } from './exercice.service';
import { CreerExerciceDto } from './dto/creer-exercice.dto';

@UseGuards(JwtAuthGuard, LicenceGuard)
@Controller('exercices')
export class ExerciceController {
  constructor(private readonly exerciceService: ExerciceService) {}

  @Get()
  async lister(@CurrentUser() user: AuthenticatedUser) {
    return this.exerciceService.lister(user.tenantId);
  }

  @Post()
  async creer(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreerExerciceDto) {
    return this.exerciceService.creer(user.tenantId, dto);
  }

  @Post(':id/cloturer')
  async cloturer(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.exerciceService.cloturer(user.tenantId, id);
  }
}
