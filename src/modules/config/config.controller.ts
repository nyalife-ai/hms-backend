import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import {
  RuntimeConfigService,
  type RuntimeConfigSnapshot,
} from './config.service';

@ApiTags('Config')
@Controller('config')
export class RuntimeConfigController {
  public constructor(private readonly configService: RuntimeConfigService) {}

  @Public()
  @Get('public')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Public non-secret runtime configuration',
  })
  public getPublic(): RuntimeConfigSnapshot {
    return this.configService.getPublicSnapshot();
  }

  @Public()
  @Get('masked')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Operator snapshot with secrets masked',
    description:
      'Useful for local diagnostics. Prefer restricting this route behind auth in production deployments.',
  })
  public getMasked(): Readonly<Record<string, unknown>> {
    return this.configService.getMaskedInternalSnapshot();
  }
}
