import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { MESSAGE_TYPES } from '../constants/messaging.constants';

const MESSAGE_TYPE_VALUES = Object.values(MESSAGE_TYPES);

export class AttachmentRefDto {
  @ApiPropertyOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  key!: string;

  @ApiPropertyOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  fileName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  mimeType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(15 * 1024 * 1024)
  fileSize?: number;
}

export class SendMessageDto {
  @ApiPropertyOptional({ description: 'Message text body' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  body?: string;

  @ApiPropertyOptional({
    enum: MESSAGE_TYPE_VALUES,
    default: MESSAGE_TYPES.TEXT,
  })
  @IsOptional()
  @IsIn(MESSAGE_TYPE_VALUES)
  messageType?: (typeof MESSAGE_TYPE_VALUES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  parentMessageId?: string;

  @ApiPropertyOptional({
    description: 'Client-generated idempotency / dedupe id',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  clientMessageId?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Reserved; prefer attachmentRefs from upload',
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  attachmentIds?: string[];

  @ApiPropertyOptional({ type: [AttachmentRefDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttachmentRefDto)
  attachmentRefs?: AttachmentRefDto[];
}
