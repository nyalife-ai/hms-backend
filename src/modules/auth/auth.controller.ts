import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import type { AuthUserPublic } from './auth.types';
import {
  ChangePasswordDto,
  DemoLoginDto,
  ForgotPasswordDto,
  LoginDto,
  LogoutDto,
  RefreshTokenDto,
  RegisterPatientDto,
  ResetPasswordDto,
} from './dto/login.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

@ApiTags('auth')
@Controller('auth')
@UseGuards(JwtAuthGuard)
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Get('features')
  @ApiOperation({ summary: 'Public auth feature flags' })
  features() {
    return {
      demoAuthEnabled: this.auth.isDemoAuthEnabled(),
      passwordLogin: true,
      patientRegistration: true,
      passwordReset: true,
    };
  }

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Email/password login' })
  login(@Body() body: LoginDto, @Req() req: Request) {
    return this.auth.login(body.email, body.password, this.meta(req));
  }

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Patient self-registration (creates PATIENT account)' })
  register(@Body() body: RegisterPatientDto, @Req() req: Request) {
    return this.auth.registerPatient(body, this.meta(req));
  }

  @Public()
  @Post('forgot-password')
  @ApiOperation({
    summary:
      'Request password reset (always ok; resetToken returned only outside production)',
  })
  forgotPassword(@Body() body: ForgotPasswordDto, @Req() req: Request) {
    return this.auth.forgotPassword(body.email, this.meta(req));
  }

  @Public()
  @Post('reset-password')
  @ApiOperation({ summary: 'Reset password using reset token' })
  resetPassword(@Body() body: ResetPasswordDto, @Req() req: Request) {
    return this.auth.resetPassword(
      body.resetToken,
      body.newPassword,
      this.meta(req),
    );
  }

  @Public()
  @Post('refresh')
  @ApiOperation({ summary: 'Rotate access token using refresh token' })
  refresh(@Body() body: RefreshTokenDto, @Req() req: Request) {
    return this.auth.refresh(body.refreshToken, this.meta(req));
  }

  @Public()
  @Post('demo-login')
  @ApiOperation({
    summary: 'Demo role login (disabled in production unless ENABLE_DEMO_AUTH)',
  })
  demoLogin(@Body() body: DemoLoginDto, @Req() req: Request) {
    return this.auth.demoLogin(body.role, this.meta(req));
  }

  @Public()
  @Get('demo-accounts')
  @ApiOperation({ summary: 'List demo accounts (empty when demo auth off)' })
  async demoAccounts() {
    const enabled = this.auth.isDemoAuthEnabled();
    return {
      enabled,
      // Never return password material over HTTP
      accounts: enabled ? await this.auth.listDemoAccounts() : [],
    };
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Current authenticated user + permissions' })
  me(@Req() req: { user: AuthUserPublic }) {
    return this.auth.me(req.user.id);
  }

  @Post('logout')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke refresh token (or all sessions)' })
  logout(
    @Req() req: { user: AuthUserPublic },
    @Body() body: LogoutDto = {},
  ) {
    return this.auth.logout(req.user.id, body?.refreshToken);
  }

  @Post('change-password')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change password and revoke all sessions' })
  changePassword(
    @Req() req: { user: AuthUserPublic },
    @Body() body: ChangePasswordDto,
  ) {
    return this.auth.changePassword(
      req.user.id,
      body.currentPassword,
      body.newPassword,
    );
  }

  private meta(req: Request) {
    return {
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    };
  }
}
