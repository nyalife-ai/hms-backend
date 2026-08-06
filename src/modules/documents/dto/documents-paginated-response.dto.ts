/**
 * File: documents-paginated-response.dto.ts
 * Module: documents
 * Purpose: Paginated documents list response.
 */

import { ApiProperty } from '@nestjs/swagger';
import { DocumentResponseDto } from './document-response.dto';

export class DocumentsPaginatedResponseDto {
  @ApiProperty({ type: [DocumentResponseDto] })
  items!: DocumentResponseDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
}
