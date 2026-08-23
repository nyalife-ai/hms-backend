import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class MuteConversationDto {
  @ApiProperty()
  @IsBoolean()
  muted!: boolean;
}
