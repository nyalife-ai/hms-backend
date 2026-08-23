import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class MarkReadDto {
  @ApiProperty({ description: 'Mark conversation read up to this message id' })
  @IsUUID()
  upToMessageId!: string;
}
