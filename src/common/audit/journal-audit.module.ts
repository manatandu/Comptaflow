import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma.module';
import { JournalAuditService } from './journal-audit.service';
import { JournalAuditController } from './journal-audit.controller';

@Module({
  imports: [PrismaModule],
  controllers: [JournalAuditController],
  providers: [JournalAuditService],
  exports: [JournalAuditService],
})
export class JournalAuditModule {}
