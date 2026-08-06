import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { PatientPortalController } from './patient-portal.controller';

@Module({
  imports: [PrismaModule, AuthModule, AuditModule],
  controllers: [PatientPortalController],
})
export class PatientPortalModule {}
