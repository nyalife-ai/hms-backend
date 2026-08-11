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
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/user.decorator';
import type { AuthUserPublic, HmsRole } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreatePharmacyDto, PharmacyQueryDto, UpdatePharmacyDto } from './dto';
import {
  AdjustStockDto,
  CancelPrescriptionDto,
  CreateBatchDto,
  CreateCategoryDto,
  CreateMedicationDto,
  CreatePrescriptionDto,
  CreatePurchaseOrderDto,
  CreateSupplierDto,
  DamageStockDto,
  DispensePrescriptionDto,
  ExpiryStockDto,
  ReceivePurchaseOrderDto,
  ReturnStockDto,
  UpdateBatchDto,
  UpdateCategoryDto,
  UpdateMedicationDto,
  UpdateSupplierDto,
  VisitDispenseDto,
  VoidPrescriptionDto,
} from './dto/pharmacy-ops.dto';
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
  @ApiOperation({ summary: 'Pharmacy board counts (stock, Rx, POs)' })
  overview() {
    return this.ops.overview();
  }

  @Post('dispense')
  @Roles(...PHARM_WRITE)
  @ApiOperation({
    summary:
      'FEFO dispense for a visit — decrements stock, closes the formal Rx if linked, and marks the visit dispensed',
  })
  dispenseVisit(
    @Body() body: VisitDispenseDto,
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
  @ApiOperation({ summary: 'List suppliers' })
  @ApiQuery({ name: 'active', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  listSuppliers(
    @Query('active') active?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.ops.listSuppliers({
      active:
        active === 'true' ? true : active === 'false' ? false : undefined,
      search,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
  }

  @Get('suppliers/:id')
  @Roles(...PHARM_ROLES)
  @ApiOperation({ summary: 'Get supplier' })
  getSupplier(@Param('id', ParseUUIDPipe) id: string) {
    return this.ops.getSupplier(id);
  }

  @Post('suppliers')
  @Roles(...PHARM_WRITE)
  @ApiOperation({ summary: 'Create supplier' })
  createSupplier(
    @CurrentUser() user: AuthUserPublic,
    @Body() body: CreateSupplierDto,
  ) {
    return this.ops.createSupplier({ ...body, actorUserId: user.id });
  }

  @Patch('suppliers/:id')
  @Roles(...PHARM_WRITE)
  @ApiOperation({ summary: 'Update supplier' })
  updateSupplier(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUserPublic,
    @Body() body: UpdateSupplierDto,
  ) {
    return this.ops.updateSupplier(id, { ...body, actorUserId: user.id });
  }

  @Post('suppliers/:id/deactivate')
  @Roles(...PHARM_WRITE)
  @ApiOperation({ summary: 'Deactivate supplier' })
  deactivateSupplier(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.ops.setSupplierActive(id, false, user.id);
  }

  @Post('suppliers/:id/activate')
  @Roles(...PHARM_WRITE)
  @ApiOperation({ summary: 'Activate supplier' })
  activateSupplier(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.ops.setSupplierActive(id, true, user.id);
  }

  // ── Categories ────────────────────────────────────────────
  @Get('categories')
  @Roles(...PHARM_ROLES)
  @ApiOperation({ summary: 'List medication categories' })
  @ApiQuery({ name: 'active', required: false })
  listCategories(@Query('active') active?: string) {
    return this.ops.listCategories(
      active === 'true' ? true : active === 'false' ? false : undefined,
    );
  }

  @Get('categories/:id')
  @Roles(...PHARM_ROLES)
  @ApiOperation({ summary: 'Get category' })
  getCategory(@Param('id', ParseUUIDPipe) id: string) {
    return this.ops.getCategory(id);
  }

  @Post('categories')
  @Roles(...PHARM_WRITE)
  @ApiOperation({ summary: 'Create category' })
  createCategory(
    @CurrentUser() user: AuthUserPublic,
    @Body() body: CreateCategoryDto,
  ) {
    return this.ops.createCategory({ ...body, actorUserId: user.id });
  }

  @Patch('categories/:id')
  @Roles(...PHARM_WRITE)
  @ApiOperation({ summary: 'Update category' })
  updateCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUserPublic,
    @Body() body: UpdateCategoryDto,
  ) {
    return this.ops.updateCategory(id, { ...body, actorUserId: user.id });
  }

  // ── Medications (rich) ────────────────────────────────────
  @Get('medications')
  @Roles(...PHARM_ROLES)
  @ApiOperation({ summary: 'List formulary medications' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'categoryId', required: false })
  @ApiQuery({ name: 'form', required: false })
  @ApiQuery({ name: 'active', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  listMedications(
    @Query('search') search?: string,
    @Query('categoryId') categoryId?: string,
    @Query('form') form?: string,
    @Query('active') active?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.ops.listMedications({
      search,
      categoryId,
      form,
      active:
        active === 'true' ? true : active === 'false' ? false : undefined,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
  }

  @Get('medications/:id')
  @Roles(...PHARM_ROLES)
  @ApiOperation({ summary: 'Get medication with batches' })
  getMedication(@Param('id', ParseUUIDPipe) id: string) {
    return this.ops.getMedication(id);
  }

  @Post('medications')
  @Roles(...PHARM_WRITE)
  @ApiOperation({ summary: 'Create medication' })
  createMedication(
    @CurrentUser() user: AuthUserPublic,
    @Body() body: CreateMedicationDto,
  ) {
    return this.ops.createMedication({ ...body, actorUserId: user.id });
  }

  @Patch('medications/:id')
  @Roles(...PHARM_WRITE)
  @ApiOperation({ summary: 'Update medication' })
  updateMedication(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUserPublic,
    @Body() body: UpdateMedicationDto,
  ) {
    return this.ops.updateMedication(id, {
      ...body,
      actorUserId: user.id,
    });
  }

  @Delete('medications/:id')
  @Roles(...PHARM_WRITE)
  @ApiOperation({ summary: 'Soft-delete medication' })
  deleteMedication(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.ops.softDeleteMedication(id, user.id);
  }

  // ── Batches ───────────────────────────────────────────────
  @Get('batches')
  @Roles(...PHARM_ROLES)
  @ApiOperation({ summary: 'List batches / lots' })
  @ApiQuery({ name: 'medicationId', required: false })
  @ApiQuery({ name: 'supplierId', required: false })
  @ApiQuery({ name: 'expiredOnly', required: false })
  @ApiQuery({ name: 'withStock', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  listBatches(
    @Query('medicationId') medicationId?: string,
    @Query('supplierId') supplierId?: string,
    @Query('expiredOnly') expiredOnly?: string,
    @Query('withStock') withStock?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.ops.listBatches({
      medicationId,
      supplierId,
      expiredOnly: expiredOnly === 'true',
      withStock: withStock === 'true',
      search,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
  }

  @Get('batches/:id')
  @Roles(...PHARM_ROLES)
  @ApiOperation({ summary: 'Get batch' })
  getBatch(@Param('id', ParseUUIDPipe) id: string) {
    return this.ops.getBatch(id);
  }

  @Post('batches')
  @Roles(...PHARM_WRITE)
  @ApiOperation({ summary: 'Receive a lot (creates RECEIVE stock movement)' })
  createBatch(
    @CurrentUser() user: AuthUserPublic,
    @Body() body: CreateBatchDto,
  ) {
    return this.ops.createBatch({ ...body, createdBy: user.id });
  }

  @Patch('batches/:id')
  @Roles(...PHARM_WRITE)
  @ApiOperation({ summary: 'Update batch notes / prices (not quantity)' })
  updateBatch(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUserPublic,
    @Body() body: UpdateBatchDto,
  ) {
    return this.ops.updateBatchMeta(id, { ...body, actorUserId: user.id });
  }

  // ── Stock ─────────────────────────────────────────────────
  @Get('stock/movements')
  @Roles(...PHARM_ROLES)
  @ApiOperation({ summary: 'Stock ledger' })
  @ApiQuery({ name: 'batchId', required: false })
  @ApiQuery({ name: 'movementType', required: false })
  listMovements(
    @Query('batchId') batchId?: string,
    @Query('movementType') movementType?: string,
  ) {
    return this.ops.listMovements({ batchId, movementType });
  }

  @Post('stock/adjust')
  @Roles(...PHARM_WRITE)
  @ApiOperation({ summary: 'Adjust on-hand by signed delta' })
  adjust(
    @CurrentUser() user: AuthUserPublic,
    @Body() body: AdjustStockDto,
  ) {
    return this.ops.adjustStock({ ...body, performedBy: user.id });
  }

  @Post('stock/damage')
  @Roles(...PHARM_WRITE)
  @ApiOperation({ summary: 'Write off damaged stock' })
  damage(
    @CurrentUser() user: AuthUserPublic,
    @Body() body: DamageStockDto,
  ) {
    return this.ops.damageStock({ ...body, performedBy: user.id });
  }

  @Post('stock/expiry')
  @Roles(...PHARM_WRITE)
  @ApiOperation({ summary: 'Write off expired stock' })
  expiry(
    @CurrentUser() user: AuthUserPublic,
    @Body() body: ExpiryStockDto,
  ) {
    return this.ops.writeOffExpiry({ ...body, performedBy: user.id });
  }

  @Post('stock/return')
  @Roles(...PHARM_WRITE)
  @ApiOperation({ summary: 'Return quantity onto a batch' })
  returnStock(
    @CurrentUser() user: AuthUserPublic,
    @Body() body: ReturnStockDto,
  ) {
    return this.ops.returnStock({ ...body, performedBy: user.id });
  }

  // ── Prescriptions ─────────────────────────────────────────
  @Get('prescriptions')
  @Roles(...PHARM_ROLES)
  @ApiOperation({ summary: 'List prescriptions' })
  @ApiQuery({ name: 'patientId', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  listPrescriptions(
    @Query('patientId') patientId?: string,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.journey.listPrescriptions({
      patientId,
      status,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      search,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
  }

  @Get('prescriptions/:id')
  @Roles(...PHARM_ROLES)
  @ApiOperation({ summary: 'Get prescription with lines' })
  getPrescription(@Param('id', ParseUUIDPipe) id: string) {
    return this.journey.getPrescription(id);
  }

  @Post('prescriptions')
  @Roles('ADMIN', 'PHARMACIST', 'DOCTOR')
  @ApiOperation({ summary: 'Create prescription (walk-in or paper script)' })
  createPrescription(
    @CurrentUser() user: AuthUserPublic,
    @Body() body: CreatePrescriptionDto,
  ) {
    return this.journey.createPrescription({
      ...body,
      actorUserId: user.id,
    });
  }

  @Post('prescriptions/:id/cancel')
  @Roles('ADMIN', 'PHARMACIST', 'DOCTOR')
  @ApiOperation({ summary: 'Cancel a pending / partial prescription' })
  cancelPrescription(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUserPublic,
    @Body() body?: CancelPrescriptionDto,
  ) {
    return this.journey.cancelPrescription(id, user.id, body?.reason);
  }

  @Post('prescriptions/:id/void')
  @Roles(...PHARM_WRITE)
  @ApiOperation({ summary: 'Void a prescription (reason required)' })
  voidPrescription(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUserPublic,
    @Body() body: VoidPrescriptionDto,
  ) {
    return this.journey.voidPrescription({
      prescriptionId: id,
      voidReason: body.voidReason,
      voidedBy: user.id,
    });
  }

  @Post('prescriptions/:id/dispense')
  @Roles(...PHARM_WRITE)
  @ApiOperation({ summary: 'FEFO dispense against formal prescription lines' })
  dispensePrescription(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUserPublic,
    @Body() body?: DispensePrescriptionDto,
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
  @ApiOperation({ summary: 'List purchase orders' })
  @ApiQuery({ name: 'supplierId', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  listPos(
    @Query('supplierId') supplierId?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.journey.listPurchaseOrders({
      supplierId,
      status,
      search,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
  }

  @Get('purchase-orders/:id')
  @Roles(...PHARM_ROLES)
  @ApiOperation({ summary: 'Get purchase order' })
  getPo(@Param('id', ParseUUIDPipe) id: string) {
    return this.journey.getPurchaseOrder(id);
  }

  @Post('purchase-orders')
  @Roles(...PHARM_WRITE)
  @ApiOperation({ summary: 'Create draft purchase order' })
  createPo(
    @CurrentUser() user: AuthUserPublic,
    @Body() body: CreatePurchaseOrderDto,
  ) {
    return this.journey.createPurchaseOrder({
      ...body,
      createdBy: user.id,
    });
  }

  @Post('purchase-orders/:id/send')
  @Roles(...PHARM_WRITE)
  @ApiOperation({ summary: 'Mark purchase order as sent to supplier' })
  sendPo(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.journey.sendPurchaseOrder(id, user.id);
  }

  @Post('purchase-orders/:id/cancel')
  @Roles(...PHARM_WRITE)
  @ApiOperation({ summary: 'Cancel a draft or sent purchase order' })
  cancelPo(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.journey.cancelPurchaseOrder(id, user.id);
  }

  @Post('purchase-orders/:id/receive')
  @Roles(...PHARM_WRITE)
  @ApiOperation({ summary: 'Receive stock against PO lines (creates lots)' })
  receivePo(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUserPublic,
    @Body() body: ReceivePurchaseOrderDto,
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
  @ApiOperation({
    deprecated: true,
    summary: 'Create medication (legacy alias — prefer POST /pharmacy/medications)',
  })
  create(@Body() dto: CreatePharmacyDto, @CurrentUser() user: AuthUserPublic) {
    return this.ops.createMedication({
      medicationName: dto.name,
      description: dto.description,
      actorUserId: user.id,
    });
  }

  @Get()
  @Roles(...PHARM_ROLES)
  @ApiOperation({
    deprecated: true,
    summary: 'List medications (legacy alias — prefer GET /pharmacy/medications)',
  })
  findAll(@Query() query: PharmacyQueryDto) {
    return this.ops.listMedications({
      page: query.page ?? 1,
      limit: query.limit ?? 50,
    });
  }

  @Get(':id')
  @Roles(...PHARM_ROLES)
  @ApiOperation({
    deprecated: true,
    summary: 'Get medication by id (legacy — prefer GET /pharmacy/medications/:id)',
  })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.ops.getMedication(id);
  }

  @Patch(':id')
  @Roles(...PHARM_WRITE)
  @ApiOperation({
    deprecated: true,
    summary: 'Update medication (legacy alias)',
  })
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
  @ApiOperation({
    deprecated: true,
    summary: 'Soft-delete medication (legacy alias)',
  })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUserPublic,
  ) {
    return this.ops.softDeleteMedication(id, user.id);
  }
}
