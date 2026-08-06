import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CatalogService } from './catalog.service';

@ApiTags('catalog')
@ApiBearerAuth()
@Controller('catalog')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(
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

  @Get('patients')
  @ApiOperation({ summary: 'List registered patients' })
  patients() {
    return this.catalog.listPatients();
  }

  @Get('doctors')
  @ApiOperation({ summary: 'List doctors / radiologists' })
  doctors() {
    return this.catalog.listDoctors();
  }

  @Get('departments')
  @ApiOperation({ summary: 'List departments with staff counts' })
  departments() {
    return this.catalog.listDepartments();
  }

  @Get('medications')
  @ApiOperation({ summary: 'List medications with stock from batches' })
  medications() {
    return this.catalog.listMedications();
  }

  @Get('lab-tests')
  @ApiOperation({ summary: 'List laboratory test types' })
  labTests() {
    return this.catalog.listLabTests();
  }

  @Get('staff')
  @ApiOperation({ summary: 'List staff profiles' })
  staff() {
    return this.catalog.listStaff();
  }

  @Get('insurance-providers')
  @ApiOperation({ summary: 'List active insurance providers' })
  insurers() {
    return this.catalog.listInsurers();
  }

  @Get('appointments')
  appointments() {
    return this.catalog.listAppointments();
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
  radiologyQueue() {
    return this.catalog.listRadiologyQueue();
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
