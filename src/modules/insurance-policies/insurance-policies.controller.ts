/**
 * File: insurance-policies.controller.ts
 * Module: insurance-policies
 * Purpose: HTTP controller with Swagger + pagination query.
 */

import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
// import { Public } from '../../common/decorators/public.decorator';
import type { CreateInsurancePolicyDto, InsurancePoliciesQueryDto, UpdateInsurancePolicyDto } from './dto';
import { InsurancePoliciesService } from './insurance-policies.service';

@ApiTags('InsurancePolicies')
@Controller('insurance-policies')
export class InsurancePoliciesController {
  public constructor(private readonly service: InsurancePoliciesService) {}

  @Post()
  @ApiOperation({ summary: 'Create insurance-policy' })
  create(@Body() dto: CreateInsurancePolicyDto) {
    return this.service.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List insurance-policies (paginated)' })
  // @Public()
  findAll(@Query() query: InsurancePoliciesQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get insurance-policy by id' })
  findOne(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update insurance-policy' })
  update(@Param('id') id: string, @Body() dto: UpdateInsurancePolicyDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete insurance-policy' })
  remove(@Param('id') id: string) {
    return this.service.softDelete(id);
  }
}
