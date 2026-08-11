/**
 * File: insurance-policies.controller.ts
 * Module: insurance-policies
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
import type { CreateInsurancePolicyDto, InsurancePoliciesQueryDto, UpdateInsurancePolicyDto } from './dto';
import { InsurancePoliciesService } from './insurance-policies.service';

@ApiTags('InsurancePolicies')
@ApiBearerAuth()
@Controller('insurance-policies')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'ACCOUNTANT', 'RECEPTIONIST')
export class InsurancePoliciesController {
  public constructor(private readonly service: InsurancePoliciesService) {}

  @Post()
  @ApiOperation({ summary: 'Create insurance-policy' })
  create(@Body() dto: CreateInsurancePolicyDto) {
    return this.service.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List insurance-policies (paginated)' })
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
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Soft-delete insurance-policy' })
  remove(@Param('id') id: string) {
    return this.service.softDelete(id);
  }
}
