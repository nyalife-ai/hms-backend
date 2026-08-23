/**
 * Frontend → backend list contract matrix (query params the UI actually sends).
 * Fails if a documented FE param set is rejected by its DTO.
 */

import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { FollowUpsQueryDto } from '../follow-ups/dto/follow-ups-query.dto';
import { AppointmentsQueryDto } from '../appointments/dto/appointments-query.dto';
import { PatientsQueryDto } from '../patients/dto/patients-query.dto';
import { NotificationsQueryDto } from '../notifications/dto/notifications-query.dto';
import { AuditLogsQueryDto } from '../audit/dto/audit-logs-query.dto';
import {
  CatalogAppointmentsQueryDto,
  CatalogDoctorsQueryDto,
  CatalogPatientsQueryDto,
  CatalogRadiologyQueueQueryDto,
  CatalogStaffQueryDto,
} from '../catalog/dto/catalog-query.dto';
import { LaboratoryRequestsQueryDto } from '../laboratory/dto/laboratory-list-query.dto';
import { ImagingRequestsQueryDto } from '../radiology/dto/imaging-query.dto';

type Case = {
  module: string;
  route: string;
  dto: new () => unknown;
  frontendQuery: Record<string, unknown>;
};

const CASES: Case[] = [
  {
    module: 'Follow-ups',
    route: 'GET /follow-ups',
    dto: FollowUpsQueryDto,
    frontendQuery: {
      page: '1',
      limit: '50',
      search: 'dennis',
      status: 'SCHEDULED',
      from: '2026-08-01',
      to: '2026-08-31',
    },
  },
  {
    module: 'Follow-ups calendar',
    route: 'GET /follow-ups',
    dto: FollowUpsQueryDto,
    frontendQuery: { page: '1', limit: '500', from: '2026-08-01', to: '2026-08-31' },
  },
  {
    module: 'Catalog patients',
    route: 'GET /catalog/patients',
    dto: CatalogPatientsQueryDto,
    frontendQuery: { page: '1', limit: '50', search: 'ann', gender: 'Female' },
  },
  {
    module: 'Catalog appointments',
    route: 'GET /catalog/appointments',
    dto: CatalogAppointmentsQueryDto,
    frontendQuery: {
      page: '1',
      limit: '50',
      search: 'x',
      status: 'SCHEDULED',
      doctorId: '11111111-1111-4111-8111-111111111111',
      from: '2026-08-01',
      to: '2026-08-31',
    },
  },
  {
    module: 'Catalog doctors',
    route: 'GET /catalog/doctors',
    dto: CatalogDoctorsQueryDto,
    frontendQuery: { page: '1', limit: '20', search: 'smith' },
  },
  {
    module: 'Catalog staff',
    route: 'GET /catalog/staff',
    dto: CatalogStaffQueryDto,
    frontendQuery: { page: '1', limit: '50', role: 'NURSE', status: 'Active' },
  },
  {
    module: 'Catalog radiology',
    route: 'GET /catalog/radiology-queue',
    dto: CatalogRadiologyQueueQueryDto,
    frontendQuery: { page: '1', limit: '50', status: 'PENDING', search: 'ct' },
  },
  {
    module: 'Appointments module',
    route: 'GET /appointments',
    dto: AppointmentsQueryDto,
    frontendQuery: {
      page: '1',
      limit: '50',
      search: 'x',
      status: 'SCHEDULED',
      from: '2026-08-01',
      to: '2026-08-31',
    },
  },
  {
    module: 'Patients module',
    route: 'GET /patients',
    dto: PatientsQueryDto,
    frontendQuery: {
      page: '1',
      limit: '50',
      search: 'mrn',
      gender: 'Male',
      status: 'Active',
      sortBy: 'created_at',
      sortOrder: 'desc',
    },
  },
  {
    module: 'Laboratory requests',
    route: 'GET /laboratory/requests',
    dto: LaboratoryRequestsQueryDto,
    frontendQuery: {
      page: '1',
      limit: '20',
      status: 'PENDING',
      priority: 'ROUTINE',
      search: 'lab',
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-08-31T23:59:59.999Z',
    },
  },
  {
    module: 'Imaging requests',
    route: 'GET /imaging/requests',
    dto: ImagingRequestsQueryDto,
    frontendQuery: { page: '1', limit: '50', status: 'PENDING', search: 'mri' },
  },
  {
    module: 'Notifications me',
    route: 'GET /notifications/me',
    dto: NotificationsQueryDto,
    frontendQuery: { page: '1', limit: '15', isRead: 'false' },
  },
  {
    module: 'Audit logs',
    route: 'GET /audit-logs',
    dto: AuditLogsQueryDto,
    frontendQuery: {
      page: '1',
      limit: '25',
      search: 'Patients',
      action: 'UPDATE',
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-08-23T23:59:59.999Z',
    },
  },
];

describe('API list contract matrix (FE query → DTO)', () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    transformOptions: { enableImplicitConversion: true },
  });

  it.each(CASES)('$module $route accepts frontend query', async (c) => {
    await expect(
      pipe.transform(c.frontendQuery, { type: 'query', metatype: c.dto }),
    ).resolves.toBeDefined();
  });

  it('rejects unknown keys on Follow-ups (validation stays strict)', async () => {
    await expect(
      pipe.transform(
        { page: '1', limit: '50', view: 'calendar' },
        { type: 'query', metatype: FollowUpsQueryDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
