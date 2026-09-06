import { Module } from '@nestjs/common';
import { JournalService } from './journal.service';
import { AnalyseJournauxService } from './analyse-journaux.service';
import { JournalController } from './journal.controller';
import { LicenceModule } from '../licence/licence.module';
import { JwtAuthModule } from '../auth/jwt-auth.module';

@Module({
  imports: [LicenceModule, JwtAuthModule],
  controllers: [JournalController],
  providers: [JournalService, AnalyseJournauxService],
  exports: [JournalService, AnalyseJournauxService],
})
export class JournauxModule {}
