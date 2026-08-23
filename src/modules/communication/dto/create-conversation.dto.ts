import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { CONVERSATION_TYPES } from '../constants/messaging.constants';

const CONVERSATION_TYPE_VALUES = Object.values(CONVERSATION_TYPES);

export class CreateConversationDto {
  @ApiProperty({
    enum: CONVERSATION_TYPE_VALUES,
    example: CONVERSATION_TYPES.DIRECT,
  })
  @IsIn(CONVERSATION_TYPE_VALUES)
  type!: (typeof CONVERSATION_TYPE_VALUES)[number];

  @ApiProperty({
    type: [String],
    description: 'Other participant user IDs (exclude self)',
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  participantIds!: string[];

  @ApiPropertyOptional({ maxLength: 150 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name?: string;

  @ApiPropertyOptional({ description: 'Optional first message body' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  initialMessage?: string;
}
