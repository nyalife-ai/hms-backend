import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class EditMessageDto {
  @ApiProperty({ description: 'Updated message text' })
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  body!: string;
}
