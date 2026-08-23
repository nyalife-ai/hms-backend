import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { BullModule } from '@nestjs/bull';
import { AuditContextInterceptor } from './modules/audit/audit-context.interceptor';

import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PublicController } from './interfaces/public/public.controller';
import { EncryptionService } from './common/security/encryption.service';

import { LoggerModule } from './modules/logger/logger.module';
import { MetricsModule } from './modules/metrics/metrics.module';
import { HealthModule } from './modules/health/health.module';
import { RuntimeConfigModule } from './modules/config/config.module';
import { AuthModule } from './modules/auth/auth.module';
import { VisitsModule } from './modules/visits/visits.module';
import { InsuranceModule } from './modules/insurance/insurance.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { OpsModule } from './modules/ops/ops.module';
import { BillingModule } from './modules/billing/billing.module';
import { HmsPlatformModule } from './modules/_platform/hms-platform.module';
import { PatientsModule } from './modules/patients/patients.module';
import { BulkImportsModule } from './modules/bulk-imports/bulk-imports.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { StaffModule } from './modules/staff/staff.module';
import { DepartmentsModule } from './modules/departments/departments.module';
import { AppointmentsModule } from './modules/appointments/appointments.module';
import { ConsultationsModule } from './modules/consultations/consultations.module';
import { PharmacyModule } from './modules/pharmacy/pharmacy.module';
import { MedicationsModule } from './modules/medications/medications.module';
import { PrescriptionsModule } from './modules/prescriptions/prescriptions.module';
import { LaboratoryModule } from './modules/laboratory/laboratory.module';
import { RadiologyModule } from './modules/radiology/radiology.module';
import { InpatientModule } from './modules/inpatient/inpatient.module';
import { WardsModule } from './modules/wards/wards.module';
import { BedsModule } from './modules/beds/beds.module';
import { AdmissionsModule } from './modules/admissions/admissions.module';
import { AuditModule } from './modules/audit/audit.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { DiagnosesModule } from './modules/diagnoses/diagnoses.module';
import { FollowUpsModule } from './modules/follow-ups/follow-ups.module';
import { ProceduresModule } from './modules/procedures/procedures.module';
import { VitalSignsModule } from './modules/vital-signs/vital-signs.module';
import { InsurancePoliciesModule } from './modules/insurance-policies/insurance-policies.module';
import { PatientPortalModule } from './modules/patient-portal/patient-portal.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { CommunicationModule } from './modules/communication/communication.module';

/**
 * Composition root — dual-run:
 * - Legacy facades: Catalog / Ops / Visits / Billing (frontend routes)
 * - New module.sh domains: Patients, Staff, … (REST /patients etc.)
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule.forRoot(),
    HmsPlatformModule,

    LoggerModule,
    MetricsModule,
    HealthModule,
    RuntimeConfigModule,

    // Existing HMS facades (preserve frontend contracts)
    AuthModule,
    VisitsModule,
    InsuranceModule,
    CatalogModule,
    OpsModule,
    BillingModule,
    PatientPortalModule,

    // module.sh domains (new REST surfaces)
    PatientsModule,
    BulkImportsModule,
    NotificationsModule,
    StaffModule,
    DepartmentsModule,
    AppointmentsModule,
    ConsultationsModule,
    PharmacyModule,
    MedicationsModule,
    PrescriptionsModule,
    LaboratoryModule,
    RadiologyModule,
    InpatientModule,
    WardsModule,
    BedsModule,
    AdmissionsModule,
    AuditModule,
    DocumentsModule,
    DiagnosesModule,
    FollowUpsModule,
    ProceduresModule,
    VitalSignsModule,
    InsurancePoliciesModule,
    AnalyticsModule,
    CommunicationModule,

    EventEmitterModule.forRoot({
      wildcard: true,
      delimiter: '.',
      newListener: false,
      removeListener: false,
      maxListeners: 20,
      verboseMemoryLeak: true,
      ignoreErrors: false,
    }),

    // Bull / Redis — keep reconnecting; never enableOfflineQueue:false (Bull workers
    // issue CLIENT SETNAME on boot and crash with uncaughtException otherwise).
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const passwordRaw = config.get<string>('redis.password');
        const password =
          passwordRaw && passwordRaw.trim().length > 0
            ? passwordRaw.trim()
            : undefined;
        return {
          // Isolate Bull keys from other tenants on shared Redis
          prefix: config.get<string>('BULL_PREFIX')?.trim() || 'nyalife',
          redis: {
            host: config.get<string>('redis.host') || '127.0.0.1',
            port: config.get<number>('redis.port') || 6379,
            ...(password ? { password } : {}),
            // Bull workers/subscribers require null (ioredis default of 20 breaks them)
            maxRetriesPerRequest: null,
            enableReadyCheck: false,
            enableOfflineQueue: true,
            retryStrategy: (times: number) =>
              Math.min(times * 200, 5000),
          },
        };
      },
    }),
  ],
  controllers: [AppController, PublicController],
  providers: [
    AppService,
    EncryptionService,
    { provide: APP_INTERCEPTOR, useClass: AuditContextInterceptor },
  ],
  exports: [EncryptionService],
})
export class AppModule {}
