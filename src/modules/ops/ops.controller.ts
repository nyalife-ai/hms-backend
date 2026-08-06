import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { CurrentUser } from '../../common/decorators/user.decorator';
import type { AuthUserPublic } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { OpsService } from './ops.service';

class CreateAppointmentDto {
  @ApiProperty() @IsString() patientId!: string;
  @ApiProperty() @IsString() doctorId!: string;
  @ApiProperty() @IsString() date!: string;
  @ApiProperty() @IsString() time!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() type?: string;
}

class CreateAdmissionDto {
  @ApiProperty() @IsString() patientId!: string;
  @ApiProperty() @IsString() wardId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() admittingDoctorId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
}

class CreateRadiologyDto {
  @ApiProperty() @IsString() patientId!: string;
  @ApiProperty() @IsString() scanTypeId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() requestingDoctorId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() indication?: string;
}

class CreateInvoiceDto {
  @ApiProperty() @IsString() patientId!: string;
  @ApiProperty() @IsNumber() @Min(1) amount!: number;
  @ApiProperty() @IsString() description!: string;
}

class CreatePatientDto {
  @ApiProperty() @IsString() firstName!: string;
  @ApiProperty() @IsString() lastName!: string;
  @ApiProperty({ enum: ['Male', 'Female', 'Other'] })
  @IsIn(['Male', 'Female', 'Other'])
  gender!: 'Male' | 'Female' | 'Other';
  @ApiProperty() @IsString() phone!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() dateOfBirth?: string;
}

class CreateStaffDto {
  @ApiProperty() @IsString() firstName!: string;
  @ApiProperty() @IsString() lastName!: string;
  @ApiProperty() @IsString() email!: string;
  @ApiProperty() @IsString() role!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() specialty?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() departmentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() asDoctor?: boolean;
}

class CreateMedicationDto {
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() unit?: string;
  @ApiProperty() @IsNumber() @Min(1) quantity!: number;
  @ApiProperty() @IsString() expiry!: string;
}

class ReorderMedicationDto {
  @ApiProperty() @IsString() medicationId!: string;
  @ApiProperty() @IsNumber() @Min(1) quantity!: number;
}

class CreateConversationDto {
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() preview?: string;
}

class PostMessageDto {
  @ApiProperty() @IsString() body!: string;
}

class HospitalSettingsDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() address?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() timezone?: string;
}

@ApiTags('ops')
@ApiBearerAuth()
@Controller('ops')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OpsController {
  constructor(private readonly ops: OpsService) {}

  @Get('lab-requests')
  @Roles('ADMIN', 'LAB_TECHNICIAN', 'DOCTOR')
  labRequests() {
    return this.ops.listLabRequests();
  }

  @Get('scan-types')
  @Roles('ADMIN', 'RADIOLOGIST', 'DOCTOR', 'RECEPTIONIST')
  scanTypes() {
    return this.ops.listScanTypes();
  }

  @Post('bootstrap-billing')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Upsert fee schedule + SHA policies (no wipe)' })
  bootstrap() {
    return this.ops.bootstrapBillingAndPolicies();
  }

  @Post('appointments')
  @Roles('ADMIN', 'RECEPTIONIST')
  createAppointment(
    @Body() body: CreateAppointmentDto,
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.ops.createAppointment({ ...body, createdBy: user.id });
  }

  @Post('admissions')
  @Roles('ADMIN', 'NURSE', 'DOCTOR')
  createAdmission(
    @Body() body: CreateAdmissionDto,
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.ops.createAdmission({ ...body, createdBy: user.id });
  }

  @Post('radiology-requests')
  @Roles('ADMIN', 'DOCTOR', 'RADIOLOGIST')
  createRadiology(
    @Body() body: CreateRadiologyDto,
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.ops.createRadiologyRequest({ ...body, createdBy: user.id });
  }

  @Post('invoices')
  @Roles('ADMIN', 'ACCOUNTANT', 'RECEPTIONIST')
  createInvoice(
    @Body() body: CreateInvoiceDto,
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.ops.createInvoice({ ...body, createdBy: user.id });
  }

  @Post('patients')
  @Roles('ADMIN', 'RECEPTIONIST')
  createPatient(
    @Body() body: CreatePatientDto,
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.ops.createPatient({ ...body, createdBy: user.id });
  }

  @Post('staff')
  @Roles('ADMIN')
  createStaff(@Body() body: CreateStaffDto) {
    return this.ops.createStaff(body);
  }

  @Post('medications')
  @Roles('ADMIN', 'PHARMACIST')
  createMedication(
    @Body() body: CreateMedicationDto,
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.ops.createMedication({ ...body, createdBy: user.id });
  }

  @Post('medications/reorder')
  @Roles('ADMIN', 'PHARMACIST')
  reorder(
    @Body() body: ReorderMedicationDto,
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.ops.reorderMedication({ ...body, createdBy: user.id });
  }

  @Post('conversations')
  @Roles('ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST')
  createConversation(
    @Body() body: CreateConversationDto,
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.ops.createConversation({ ...body, createdBy: user.id });
  }

  @Get('conversations/:id/messages')
  @Roles('ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST')
  @ApiOperation({ summary: 'List messages in a conversation' })
  listMessages(@Param('id') id: string) {
    return this.ops.listMessages(id);
  }

  @Post('conversations/:id/messages')
  @Roles('ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST')
  @ApiOperation({ summary: 'Send a message in a conversation' })
  postMessage(
    @Param('id') id: string,
    @Body() body: PostMessageDto,
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.ops.postMessage({
      conversationId: id,
      body: body.body,
      senderId: user.id,
    });
  }

  @Get('settings/hospital')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get hospital profile settings' })
  getHospitalSettings() {
    return this.ops.getHospitalSettings();
  }

  @Patch('settings/hospital')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Update hospital profile settings' })
  updateHospitalSettings(
    @Body() body: HospitalSettingsDto,
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.ops.updateHospitalSettings(body, user.id);
  }

  @Delete('staff/:id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Deactivate a staff member' })
  deactivateStaff(@Param('id') id: string) {
    return this.ops.deactivateStaff(id);
  }
}
