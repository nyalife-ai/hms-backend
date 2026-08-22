/**
 * Reusable bulk CSV import — patients, staff, wards, beds, lab, services, pharmacy.
 */

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { InpatientModule } from '../inpatient/inpatient.module';
import { LaboratoryModule } from '../laboratory/laboratory.module';
import { PatientsModule } from '../patients/patients.module';
import { PharmacyModule } from '../pharmacy/pharmacy.module';
import { BulkImportsController } from './bulk-imports.controller';
import { BulkImportsService } from './bulk-imports.service';
import { BedsBulkImporter } from './resources/beds-bulk.importer';
import { DoctorsBulkImporter } from './resources/doctors-bulk.importer';
import { LabTestTypesBulkImporter } from './resources/lab-test-types-bulk.importer';
import { MedicationsBulkImporter } from './resources/medications-bulk.importer';
import { PatientBulkImporter } from './resources/patient-bulk.importer';
import { ServicesBulkImporter } from './resources/services-bulk.importer';
import { SuppliersBulkImporter } from './resources/suppliers-bulk.importer';
import { WardsBulkImporter } from './resources/wards-bulk.importer';
import { ImportSessionStore } from './sessions/import-session.store';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    AuditModule,
    PatientsModule,
    InpatientModule,
    LaboratoryModule,
    BillingModule,
    PharmacyModule,
  ],
  controllers: [BulkImportsController],
  providers: [
    ImportSessionStore,
    PatientBulkImporter,
    DoctorsBulkImporter,
    WardsBulkImporter,
    BedsBulkImporter,
    LabTestTypesBulkImporter,
    ServicesBulkImporter,
    MedicationsBulkImporter,
    SuppliersBulkImporter,
    BulkImportsService,
  ],
  exports: [BulkImportsService],
})
export class BulkImportsModule {}
