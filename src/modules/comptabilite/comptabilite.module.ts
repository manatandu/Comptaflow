import { Module } from '@nestjs/common';
import { EcritureService } from './ecriture.service';
import { EcritureController } from './ecriture.controller';

@Module({
  controllers: [EcritureController],
  providers: [EcritureService],
  exports: [EcritureService],
})
export class ComptabiliteModule {}
