/**
 * Pharmacy HTTP API — full domain under /pharmacy/*
 * Legacy thin medication CRUD retained at end for compatibility.
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CurrentUser } from '../../common/decorators/user.decorator';
import type { AuthUserPublic, HmsRole } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { CreatePharmacyDto, PharmacyQueryDto, UpdatePharmacyDto } from './dto';
import { PharmacyService } from './pharmacy.service';
import { DispenseMedicationUseCase } from './use-cases/dispense-medication.usecase';
import { PharmacyOperationsUseCase } from './use-cases/pharmacy-operations.usecase';
import { PharmacyJourneyUseCase } from './use-cases/pharmacy-journey.usecase';

const PHARM_ROLES: HmsRole[] = [
  'ADMIN',
  'PHARMACIST',
  'DOCTOR',
  'NURSE',
];
const PHARM_WRITE: HmsRole[] = ['ADMIN', 'PHARMACIST'];

class DispenseLineDto {
  @ApiProperty()
  @IsString()
  medication!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  medicationId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(1)
  quantity?: number;
}

class DispenseDto {
  @ApiProperty()
  @IsString()
  visitId!: string;

  @ApiProperty({ type: [DispenseLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DispenseLineDto)
  lines!: DispenseLineDto[];
}

@ApiTags('Pharmacy')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('pharmacy')
export class PharmacyController {
  public constructor(
    private readonly service: PharmacyService,
    private readonly dispense: DispenseMedicationUseCase,
    private readonly ops: PharmacyOperationsUseCase,
    private readonly journey: PharmacyJourneyUseCase,
  ) {}

  @Get('overview')
  @Roles(...PHARM_ROLES)
  overview() {
    return this.ops.overview();
  }

  @Post('dispense')
  @Roles(...PHARM_WRITE)
  @ApiOperation({ summary: 'FEFO dispense for a visit (atomic stock decrement)' })
  dispenseVisit(
    @Body() body: DispenseDto,
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.dispense.dispenseForVisit({
      visitId: body.visitId,
      lines: body.lines,
      performedBy: user.id,
    });
  }

  // ── Suppliers ─────────────────────────────────────────────
  @Get('suppliers')
  @Roles(...PHARM_ROLES)
  listSuppliers(
    @Query('active') active?: string,
    @Query('search') search?: string,
  ) {
    return this.ops.listSuppliers({
      active:
        active === 'true' ? true : active === 'false' ? false : undefined,
      search,
    });
  }

  @Get('suppliers/:id')
  @Roles(...PHARM_ROLES)
  getSupplier(@Param('id', ParseUUIDPipe) id: string) {
    return this.ops.getSupplier(id);
  }

  @Post('suppliers')
  @Roles(...PHARM_WRITE)
  createSupplier(
    @CurrentUser() user: AuthUserPublic,
    @Body()
    body: {
      companyName: string;
      contactPerson?: string;
      phone?: string;
      email?: string;
      address?: string;
    },
  ) {
    return this.ops.createSupplier({ ...body, actorUserId: user.id });
  }

  @Patch('suppliers/:id')
  @Roles(...PHARM_WRITE)
  updateSupplier(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUserPublic,
    @Body()
    body: {
      companyName?: string;
      contactPerson?: string;
      phone?: string;
      email?: string;
      address?: string;
      isActive?: boolean;
    },
  ) {
    return this.ops.updateSupplier(id, { ...body, actorUserId: user.id });
  }

  @Post('suppliers/:id/deactivate')
  @Roles(...PHARM_WRITE)
  deactivateSupplier(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.ops.setSupplierActive(id, false, user.id);
  }

  @Post('suppliers/:id/activate')
  @Roles(...PHARM_WRITE)
  activateSupplier(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.ops.setSupplierActive(id, true, user.id);
  }

  // ── Categories ────────────────────────────────────────────
  @Get('categories')
  @Roles(...PHARM_ROLES)
  listCategories(@Query('active') active?: string) {
    return this.ops.listCategories(
      active === 'true' ? true : active === 'false' ? false : undefined,
    );
  }

  @Get('categories/:id')
  @Roles(...PHARM_ROLES)
  getCategory(@Param('id', ParseUUIDPipe) id: string) {
    return this.ops.getCategory(id);
  }

  @Post('categories')
  @Roles(...PHARM_WRITE)
  createCategory(
    @CurrentUser() user: AuthUserPublic,
    @Body() body: { categoryName: string; description?: string },
  ) {
    return this.ops.createCategory({ ...body, actorUserId: user.id });
  }

  @Patch('categories/:id')
  @Roles(...PHARM_WRITE)
  updateCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUserPublic,
    @Body()
    body: { categoryName?: string; description?: string; isActive?: boolean },
  ) {
    return this.ops.updateCategory(id, { ...body, actorUserId: user.id });
  }

  // ── Medications (rich) ────────────────────────────────────
  @Get('medications')
  @Roles(...PHARM_ROLES)
  listMedications(
    @Query('search') search?: string,
    @Query('categoryId') categoryId?: string,
    @Query('form') form?: string,
    @Query('active') active?: string,
  ) {
    return this.ops.listMedications({
      search,
      categoryId,
      form,
      active:
        active === 'true' ? true : active === 'false' ? false : undefined,
    });
  }

  @Get('medications/:id')
  @Roles(...PHARM_ROLES)
  getMedication(@Param('id', ParseUUIDPipe) id: string) {
    return this.ops.getMedication(id);
  }

  @Post('medications')
  @Roles(...PHARM_WRITE)
  createMedication(
    @CurrentUser() user: AuthUserPublic,
    @Body()
    body: {
      medicationName: string;
      genericName?: string;
      categoryId?: string;
      form?: string;
      strength?: string;
      unit?: string;
      standardSellingPrice?: number;
      description?: string;
      sideEffects?: string;
      contraindications?: string;
    },
  ) {
    return this.ops.createMedication({ ...body, actorUserId: user.id });
  }

  @Patch('medications/:id')
  @Roles(...PHARM_WRITE)
  updateMedication(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUserPublic,
    @Body() body: Record<string, unknown>,
  ) {
    return this.ops.updateMedication(id, {
      ...(body as any),
      actorUserId: user.id,
    });
  }

  @Delete('medications/:id')
  @Roles(...PHARM_WRITE)
  deleteMedication(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.ops.softDeleteMedication(id, user.id);
  }

  // ── Batches ───────────────────────────────────────────────
  @Get('batches')
  @Roles(...PHARM_ROLES)
  listBatches(
    @Query('medicationId') medicationId?: string,
    @Query('supplierId') supplierId?: string,
    @Query('expiredOnly') expiredOnly?: string,
    @Query('withStock') withStock?: string,
  ) {
    return this.ops.listBatches({
      medicationId,
      supplierId,
      expiredOnly: expiredOnly === 'true',
      withStock: withStock === 'true',
    });
  }

  @Get('batches/:id')
  @Roles(...PHARM_ROLES)
  getBatch(@Param('id', ParseUUIDPipe) id: string) {
    return this.ops.getBatch(id);
  }

  @Post('batches')
  @Roles(...PHARM_WRITE)
  createBatch(
    @CurrentUser() user: AuthUserPublic,
    @Body()
    body: {
      medicationId: string;
      batchNumber: string;
      quantityOnHand: number;
      unitCost?: number;
      sellingPrice?: number;
      manufacturingDate?: string;
      expiryDate: string;
      supplierId?: string;
      notes?: string;
    },
  ) {
    return this.ops.createBatch({ ...body, createdBy: user.id });
  }

  @Patch('batches/:id')
  @Roles(...PHARM_WRITE)
  updateBatch(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUserPublic,
    @Body()
    body: { notes?: string; sellingPrice?: number; unitCost?: number },
  ) {
    return this.ops.updateBatchMeta(id, { ...body, actorUserId: user.id });
  }

  // ── Stock ─────────────────────────────────────────────────
  @Get('stock/movements')
  @Roles(...PHARM_ROLES)
  listMovements(
    @Query('batchId') batchId?: string,
    @Query('movementType') movementType?: string,
  ) {
    return this.ops.listMovements({ batchId, movementType });
  }

  @Post('stock/adjust')
  @Roles(...PHARM_WRITE)
  adjust(
    @CurrentUser() user: AuthUserPublic,
    @Body() body: { batchId: string; quantityChange: number; reason: string },
  ) {
    return this.ops.adjustStock({ ...body, performedBy: user.id });
  }

  @Post('stock/damage')
  @Roles(...PHARM_WRITE)
  damage(
    @CurrentUser() user: AuthUserPublic,
    @Body() body: { batchId: string; quantity: number; reason: string },
  ) {
    return this.ops.damageStock({ ...body, performedBy: user.id });
  }

  @Post('stock/expiry')
  @Roles(...PHARM_WRITE)
  expiry(
    @CurrentUser() user: AuthUserPublic,
    @Body() body: { batchId: string; quantity?: number; notes?: string },
  ) {
    return this.ops.writeOffExpiry({ ...body, performedBy: user.id });
  }

  @Post('stock/return')
  @Roles(...PHARM_WRITE)
  returnStock(
    @CurrentUser() user: AuthUserPublic,
    @Body()
    body: {
      batchId: string;
      quantity: number;
      reason: string;
      referenceId?: string;
    },
  ) {
    return this.ops.returnStock({ ...body, performedBy: user.id });
  }

  // ── Prescriptions ─────────────────────────────────────────
  @Get('prescriptions')
  @Roles(...PHARM_ROLES)
  listPrescriptions(
    @Query('patientId') patientId?: string,
    @Query('status') status?: string,
  ) {
    return this.journey.listPrescriptions({ patientId, status });
  }

  @Get('prescriptions/:id')
  @Roles(...PHARM_ROLES)
  getPrescription(@Param('id', ParseUUIDPipe) id: string) {
    return this.journey.getPrescription(id);
  }

  @Post('prescriptions')
  @Roles('ADMIN', 'PHARMACIST', 'DOCTOR')
  createPrescription(
    @CurrentUser() user: AuthUserPublic,
    @Body()
    body: {
      patientId: string;
      prescribedByStaffId: string;
      consultationId?: string;
      notes?: string;
      lines: Array<{
        medicationId: string;
        dosage: string;
        frequency: string;
        duration: string;
        quantity: number;
        instructions?: string;
      }>;
    },
  ) {
    return this.journey.createPrescription({
      ...body,
      actorUserId: user.id,
    });
  }

  @Post('prescriptions/:id/cancel')
  @Roles('ADMIN', 'PHARMACIST', 'DOCTOR')
  cancelPrescription(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUserPublic,
    @Body() body?: { reason?: string },
  ) {
    return this.journey.cancelPrescription(id, user.id, body?.reason);
  }

  @Post('prescriptions/:id/void')
  @Roles(...PHARM_WRITE)
  voidPrescription(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUserPublic,
    @Body() body: { voidReason: string },
  ) {
    return this.journey.voidPrescription({
      prescriptionId: id,
      voidReason: body.voidReason,
      voidedBy: user.id,
    });
  }

  @Post('prescriptions/:id/dispense')
  @Roles(...PHARM_WRITE)
  dispensePrescription(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUserPublic,
    @Body() body?: { lineIds?: string[] },
  ) {
    return this.journey.dispensePrescription({
      prescriptionId: id,
      performedBy: user.id,
      lineIds: body?.lineIds,
    });
  }

  // ── Purchase orders ───────────────────────────────────────
  @Get('purchase-orders')
  @Roles(...PHARM_ROLES)
  listPos(
    @Query('supplierId') supplierId?: string,
    @Query('status') status?: string,
  ) {
    return this.journey.listPurchaseOrders({ supplierId, status });
  }

  @Get('purchase-orders/:id')
  @Roles(...PHARM_ROLES)
  getPo(@Param('id', ParseUUIDPipe) id: string) {
    return this.journey.getPurchaseOrder(id);
  }

  @Post('purchase-orders')
  @Roles(...PHARM_WRITE)
  createPo(
    @CurrentUser() user: AuthUserPublic,
    @Body()
    body: {
      supplierId: string;
      expectedDeliveryDate?: string;
      notes?: string;
      lines: Array<{
        medicationId: string;
        quantityOrdered: number;
        unitCost: number;
      }>;
    },
  ) {
    return this.journey.createPurchaseOrder({
      ...body,
      createdBy: user.id,
    });
  }

  @Post('purchase-orders/:id/send')
  @Roles(...PHARM_WRITE)
  sendPo(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.journey.sendPurchaseOrder(id, user.id);
  }

  @Post('purchase-orders/:id/cancel')
  @Roles(...PHARM_WRITE)
  cancelPo(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.journey.cancelPurchaseOrder(id, user.id);
  }

  @Post('purchase-orders/:id/receive')
  @Roles(...PHARM_WRITE)
  receivePo(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUserPublic,
    @Body()
    body: {
      receipts: Array<{
        lineId: string;
        quantity: number;
        batchNumber: string;
        expiryDate: string;
        manufacturingDate?: string;
      }>;
    },
  ) {
    return this.journey.receivePurchaseOrder({
      purchaseOrderId: id,
      performedBy: user.id,
      receipts: body.receipts,
    });
  }

  // ── Legacy thin medication alias (compat) ─────────────────
  @Post()
  @Roles(...PHARM_WRITE)
  @ApiOperation({ summary: 'Create medication (legacy alias — prefer POST /pharmacy/medications)' })
  create(@Body() dto: CreatePharmacyDto, @CurrentUser() user: AuthUserPublic) {
    return this.ops.createMedication({
      medicationName: dto.name,
      description: dto.description,
      actorUserId: user.id,
    });
  }

  @Get()
  @Roles(...PHARM_ROLES)
  @ApiOperation({ summary: 'List medications (legacy alias)' })
  findAll(@Query() query: PharmacyQueryDto) {
    return this.ops.listMedications({ take: query.limit });
  }

  @Get(':id')
  @Roles(...PHARM_ROLES)
  @ApiOperation({ summary: 'Get medication by id (legacy)' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.ops.getMedication(id);
  }

  @Patch(':id')
  @Roles(...PHARM_WRITE)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePharmacyDto,
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.ops.updateMedication(id, {
      medicationName: dto.name,
      description: dto.description,
      actorUserId: user.id,
    });
  }

  @Delete(':id')
  @Roles(...PHARM_WRITE)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.ops.softDeleteMedication(id, user.id);
  }
}
