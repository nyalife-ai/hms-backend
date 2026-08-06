/**
 * File: update-department.dto.ts
 * Module: departments
 * Purpose: Update department request DTO.
 */

import { PartialType } from '@nestjs/swagger';
import { CreateDepartmentDto } from './create-department.dto';

export class UpdateDepartmentDto extends PartialType(CreateDepartmentDto) {}
