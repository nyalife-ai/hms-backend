import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/user.decorator';
import type { AuthUserPublic } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CatalogService } from './catalog.service';
import {
  CatalogAppointmentsQueryDto,
  CatalogClinicalServicesQueryDto,
  CatalogDepartmentsQueryDto,
  CatalogDoctorsQueryDto,
  CatalogMedicationsQueryDto,
  CatalogPatientsQueryDto,
  CatalogRadiologyQueueQueryDto,
  CatalogStaffQueryDto,
} from './dto/catalog-query.dto';

@ApiTags('catalog')
@ApiBearerAuth()
@Controller('catalog')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(
  'SUPER_ADMIN',
  'ADMIN',
  'DOCTOR',
  'NURSE',
  'RECEPTIONIST',
  'PHARMACIST',
  'LAB_TECHNICIAN',
  'RADIOLOGIST',
  'ACCOUNTANT',
)
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('patients/summary')
  @ApiOperation({ summary: 'Patient registry KPI counts' })
  patientSummary() {
    return this.catalog.patientSummary();
  }

  @Get('patients/:id')
  @ApiOperation({ summary: 'Patient profile for quick view and full record' })
  patientDetail(@Param('id', ParseUUIDPipe) id: string) {
    return this.catalog.getPatientDetail(id);
  }

  @Get('patients')
  @ApiOperation({ summary: 'List registered patients (paginated, searchable)' })
  patients(@Query() query: CatalogPatientsQueryDto) {
    return this.catalog.listPatients({
      page: query.page ?? 1,
      limit: query.limit ?? 50,
      search: query.search,
      gender: query.gender,
      status: query.status,
    });
  }

  @Get('doctors')
  @ApiOperation({ summary: 'List doctors / radiologists (paginated, searchable)' })
  doctors(@Query() query: CatalogDoctorsQueryDto) {
    return this.catalog.listDoctors({
      page: query.page ?? 1,
      limit: query.limit ?? 50,
      search: query.search,
      departmentId: query.departmentId,
    });
  }

  @Get('departments')
  @ApiOperation({ summary: 'List departments with staff counts (paginated)' })
  departments(@Query() query: CatalogDepartmentsQueryDto) {
    return this.catalog.listDepartments({
      page: query.page ?? 1,
      limit: query.limit ?? 50,
      search: query.search,
    });
  }

  @Get('medications')
  @ApiOperation({ summary: 'List medications with stock from batches (paginated)' })
  medications(@Query() query: CatalogMedicationsQueryDto) {
    return this.catalog.listMedications({
      page: query.page ?? 1,
      limit: query.limit ?? 50,
      search: query.search,
    });
  }

  @Get('lab-tests')
  @ApiOperation({ summary: 'List laboratory test types' })
  labTests() {
    return this.catalog.listLabTests();
  }

  @Get('clinical-services')
  @ApiOperation({
    summary:
      'List clinical services / procedures / surgeries for doctor order pickers',
  })
  clinicalServices(@Query() query: CatalogClinicalServicesQueryDto) {
    return this.catalog.listClinicalServices({
      kind: query.kind,
      search: query.search,
    });
  }

  @Get('staff')
  @ApiOperation({ summary: 'List staff profiles (paginated, searchable)' })
  staff(@Query() query: CatalogStaffQueryDto) {
    return this.catalog.listStaff({
      page: query.page ?? 1,
      limit: query.limit ?? 50,
      search: query.search,
      role: query.role,
      status: query.status,
    });
  }

  @Get('insurance-providers')
  @ApiOperation({ summary: 'List active insurance providers' })
  insurers() {
    return this.catalog.listInsurers();
  }

  @Get('appointments/summary')
  @ApiOperation({ summary: 'Appointment KPI counts for the ledger header' })
  appointmentSummary(@CurrentUser() user: AuthUserPublic) {
    return this.catalog.appointmentSummary(user);
  }

  @Get('appointments/:id')
  @ApiOperation({ summary: 'Appointment visit record for quick/detailed view' })
  appointmentDetail(@Param('id', ParseUUIDPipe) id: string) {
    return this.catalog.getAppointmentDetail(id);
  }

  @Get('appointments')
  appointments(
    @CurrentUser() user: AuthUserPublic,
    @Query() query: CatalogAppointmentsQueryDto,
  ) {
    return this.catalog.listAppointments(
      {
        page: query.page ?? 1,
        limit: query.limit ?? 50,
        search: query.search,
        status: query.status,
        doctorId: query.doctorId,
        from: query.from,
        to: query.to,
      },
      user,
    );
  }

  @Get('inventory')
  inventory() {
    return this.catalog.listInventory();
  }

  @Get('wards')
  wards() {
    return this.catalog.listWards();
  }

  @Get('radiology-queue')
  radiologyQueue(@Query() query: CatalogRadiologyQueueQueryDto) {
    return this.catalog.listRadiologyQueue({
      page: query.page ?? 1,
      limit: query.limit ?? 50,
      search: query.search,
      status: query.status,
    });
  }

  @Get('invoices')
  invoices() {
    return this.catalog.listInvoices();
  }

  @Get('conversations')
  conversations() {
    return this.catalog.listConversations();
  }

  @Get('dashboard-summary')
  dashboardSummary() {
    return this.catalog.dashboardSummary();
  }
}
