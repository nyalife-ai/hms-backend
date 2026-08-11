/**
 * File: documents.controller.ts
 * Module: documents
 * Purpose: HTTP controller with Swagger + pagination query.
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { CreateDocumentDto, DocumentsQueryDto, UpdateDocumentDto } from './dto';
import { DocumentsService } from './documents.service';

@ApiTags('Documents')
@ApiBearerAuth()
@Controller('documents')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST')
export class DocumentsController {
  public constructor(private readonly service: DocumentsService) {}

  @Post()
  @ApiOperation({ summary: 'Create document' })
  create(@Body() dto: CreateDocumentDto) {
    return this.service.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List documents (paginated)' })
  findAll(@Query() query: DocumentsQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get document by id' })
  findOne(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update document' })
  update(@Param('id') id: string, @Body() dto: UpdateDocumentDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Soft-delete document' })
  remove(@Param('id') id: string) {
    return this.service.softDelete(id);
  }
}
