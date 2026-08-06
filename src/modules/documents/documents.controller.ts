/**
 * File: documents.controller.ts
 * Module: documents
 * Purpose: HTTP controller with Swagger + pagination query.
 */

import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
// import { Public } from '../../common/decorators/public.decorator';
import type { CreateDocumentDto, DocumentsQueryDto, UpdateDocumentDto } from './dto';
import { DocumentsService } from './documents.service';

@ApiTags('Documents')
@Controller('documents')
export class DocumentsController {
  public constructor(private readonly service: DocumentsService) {}

  @Post()
  @ApiOperation({ summary: 'Create document' })
  create(@Body() dto: CreateDocumentDto) {
    return this.service.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List documents (paginated)' })
  // @Public()
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
  @ApiOperation({ summary: 'Soft-delete document' })
  remove(@Param('id') id: string) {
    return this.service.softDelete(id);
  }
}
