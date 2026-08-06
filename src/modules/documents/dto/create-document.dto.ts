/**
 * Create document DTO — patients.documents.
 * `name` → file_name; `description` → document_type when documentType omitted.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateDocumentDto {
  @ApiProperty({ example: 'consent.pdf', description: 'File name' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @ApiProperty()
  @IsUUID()
  patientId!: string;

  @ApiProperty({ example: '/uploads/patients/consent.pdf' })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  filePath!: string;

  @ApiProperty({ description: 'User who uploaded the document' })
  @IsUUID()
  uploadedBy!: string;

  @ApiPropertyOptional({ description: 'Maps to document_type when set' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ example: 'CONSENT' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  documentType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  mimeType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  fileSize?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isConfidential?: boolean;
}
