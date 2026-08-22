/**
 * Pharmacy domain request DTOs — Swagger + ValidationPipe source of truth.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateSupplierDto {
  @ApiProperty({ example: 'Alpha Pharma Ltd' })
  @IsString()
  companyName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contactPerson?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;
}

export class UpdateSupplierDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  companyName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contactPerson?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateCategoryDto {
  @ApiProperty({ example: 'Antibiotics' })
  @IsString()
  categoryName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateCategoryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class PharmacyCreateMedicationDto {
  @ApiProperty({ example: 'Amoxicillin 500mg' })
  @IsString()
  medicationName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  genericName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({
    enum: ['TABLET', 'CAPSULE', 'SYRUP', 'INJECTION', 'CREAM', 'OTHER'],
  })
  @IsOptional()
  @IsString()
  form?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  strength?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiPropertyOptional({ example: 150 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  standardSellingPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sideEffects?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contraindications?: string;
}

export class PharmacyUpdateMedicationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  medicationName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  genericName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  form?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  strength?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  standardSellingPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sideEffects?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contraindications?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateBatchDto {
  @ApiProperty()
  @IsUUID()
  medicationId!: string;

  @ApiProperty({ example: 'LOT-24A' })
  @IsString()
  batchNumber!: string;

  @ApiProperty({ example: 100 })
  @IsNumber()
  @Min(0)
  quantityOnHand!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  unitCost?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  sellingPrice?: number;

  @ApiPropertyOptional({ example: '2026-01-15' })
  @IsOptional()
  @IsString()
  manufacturingDate?: string;

  @ApiProperty({ example: '2027-12-01' })
  @IsString()
  expiryDate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateBatchDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  sellingPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  unitCost?: number;
}

export class AdjustStockDto {
  @ApiProperty()
  @IsUUID()
  batchId!: string;

  @ApiProperty({ description: 'Signed delta. Positive adds, negative removes.' })
  @IsNumber()
  quantityChange!: number;

  @ApiProperty()
  @IsString()
  reason!: string;
}

export class DamageStockDto {
  @ApiProperty()
  @IsUUID()
  batchId!: string;

  @ApiProperty()
  @IsNumber()
  @Min(1)
  quantity!: number;

  @ApiProperty()
  @IsString()
  reason!: string;
}

export class ExpiryStockDto {
  @ApiProperty()
  @IsUUID()
  batchId!: string;

  @ApiPropertyOptional({ description: 'Defaults to full on-hand quantity' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  quantity?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class ReturnStockDto {
  @ApiProperty()
  @IsUUID()
  batchId!: string;

  @ApiProperty()
  @IsNumber()
  @Min(1)
  quantity!: number;

  @ApiProperty()
  @IsString()
  reason!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  referenceId?: string;
}

export class PrescriptionLineInputDto {
  @ApiProperty()
  @IsUUID()
  medicationId!: string;

  @ApiProperty({ example: '1 tablet' })
  @IsString()
  dosage!: string;

  @ApiProperty({ example: 'TDS' })
  @IsString()
  frequency!: string;

  @ApiProperty({ example: '5 days' })
  @IsString()
  duration!: string;

  @ApiProperty({ example: 15 })
  @IsNumber()
  @Min(1)
  quantity!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  instructions?: string;
}

export class CreatePrescriptionDto {
  @ApiProperty()
  @IsUUID()
  patientId!: string;

  @ApiProperty()
  @IsUUID()
  prescribedByStaffId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  consultationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ type: [PrescriptionLineInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PrescriptionLineInputDto)
  lines!: PrescriptionLineInputDto[];
}

export class CancelPrescriptionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class VoidPrescriptionDto {
  @ApiProperty()
  @IsString()
  voidReason!: string;
}

export class DispensePrescriptionDto {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  lineIds?: string[];
}

export class PurchaseOrderLineInputDto {
  @ApiProperty()
  @IsUUID()
  medicationId!: string;

  @ApiProperty()
  @IsNumber()
  @Min(1)
  quantityOrdered!: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  unitCost!: number;
}

export class CreatePurchaseOrderDto {
  @ApiProperty()
  @IsUUID()
  supplierId!: string;

  @ApiPropertyOptional({ example: '2026-08-20' })
  @IsOptional()
  @IsString()
  expectedDeliveryDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ type: [PurchaseOrderLineInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderLineInputDto)
  lines!: PurchaseOrderLineInputDto[];
}

export class ReceivePoLineDto {
  @ApiProperty()
  @IsUUID()
  lineId!: string;

  @ApiProperty()
  @IsNumber()
  @Min(1)
  quantity!: number;

  @ApiProperty()
  @IsString()
  batchNumber!: string;

  @ApiProperty({ example: '2027-12-01' })
  @IsString()
  expiryDate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  manufacturingDate?: string;
}

export class ReceivePurchaseOrderDto {
  @ApiProperty({ type: [ReceivePoLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceivePoLineDto)
  receipts!: ReceivePoLineDto[];
}

export class VisitDispenseLineDto {
  @ApiProperty()
  @IsString()
  medication!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  medicationId?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  quantity?: number;
}

export class VisitDispenseDto {
  @ApiProperty()
  @IsString()
  visitId!: string;

  @ApiProperty({ type: [VisitDispenseLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VisitDispenseLineDto)
  lines!: VisitDispenseLineDto[];
}
