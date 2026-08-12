import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/user.decorator';
import type { AuthUserPublic } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CatalogService } from './catalog.service';

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
  patients(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('gender') gender?: string,
    @Query('status') status?: string,
  ) {
    return this.catalog.listPatients({
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
      search,
      gender,
      status,
    });
  }

  @Get('doctors')
  @ApiOperation({ summary: 'List doctors / radiologists (paginated, searchable)' })
  doctors(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('departmentId') departmentId?: string,
  ) {
    return this.catalog.listDoctors({
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
      search,
      departmentId,
    });
  }

  @Get('departments')
  @ApiOperation({ summary: 'List departments with staff counts (paginated)' })
  departments(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    return this.catalog.listDepartments({
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
      search,
    });
  }

  @Get('medications')
  @ApiOperation({ summary: 'List medications with stock from batches (paginated)' })
  medications(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    return this.catalog.listMedications({
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
      search,
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
  clinicalServices(
    @Query('kind') kind?: 'service' | 'surgery',
    @Query('search') search?: string,
  ) {
    return this.catalog.listClinicalServices({ kind, search });
  }

  @Get('staff')
  @ApiOperation({ summary: 'List staff profiles (paginated, searchable)' })
  staff(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('role') role?: string,
    @Query('status') status?: string,
  ) {
    return this.catalog.listStaff({
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
      search,
      role,
      status,
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
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('doctorId') doctorId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.catalog.listAppointments(
      {
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 50,
        search,
        status,
        doctorId,
        from,
        to,
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
  radiologyQueue(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    return this.catalog.listRadiologyQueue({
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
      search,
      status,
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
