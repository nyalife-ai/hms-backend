import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../platform/api/pagination/pagination-query.dto';

export class ListConversationsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Search conversation name / preview' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}
