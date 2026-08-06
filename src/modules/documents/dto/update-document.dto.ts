/**
 * File: update-document.dto.ts
 * Module: documents
 * Purpose: Update document request DTO.
 */

import { PartialType } from '@nestjs/swagger';
import { CreateDocumentDto } from './create-document.dto';

export class UpdateDocumentDto extends PartialType(CreateDocumentDto) {}
