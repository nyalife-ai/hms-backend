import { Module } from '@nestjs/common';
import { AppointmentsModule } from '../appointments/appointments.module';
import { AuthModule } from '../auth/auth.module';
import { CommunicationModule } from '../communication/communication.module';
import { InpatientModule } from '../inpatient/inpatient.module';
import { PatientsModule } from '../patients/patients.module';
import { RadiologyModule } from '../radiology/radiology.module';
import { OpsController } from './ops.controller';
import { OpsService } from './ops.service';

@Module({
  imports: [
    AuthModule,
    PatientsModule,
    InpatientModule,
    AppointmentsModule,
    RadiologyModule,
    CommunicationModule,
  ],
  controllers: [OpsController],
  providers: [OpsService],
  exports: [OpsService],
})
export class OpsModule {}
