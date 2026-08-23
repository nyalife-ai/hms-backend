import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { ALLOWED_REACTIONS } from '../constants/messaging.constants';

export class ReactionDto {
  @ApiProperty({ enum: ALLOWED_REACTIONS })
  @IsIn([...ALLOWED_REACTIONS])
  reactionType!: (typeof ALLOWED_REACTIONS)[number];
}
