import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { memoryStorage } from 'multer';
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
  TwoFactorChallengeDto,
  TwoFactorConfirmDto,
  UpdateMyProfileDto,
  VerifyLoginOtpDto,
  VerifyResetOtpDto,
} from './dto/login.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

type UploadedAvatar = {
  buffer: Buffer;
  originalname?: string;
  mimetype?: string;
  size?: number;
};

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
      twoFactorLogin: true,
    };
  }

  @Public()
  @Post('login')
  @ApiOperation({
    summary:
      'Email/password login (returns tokens, or twoFactorRequired + hash when 2FA is on)',
  })
  login(@Body() body: LoginDto, @Req() req: Request) {
    return this.auth.login(body.email, body.password, this.meta(req));
  }

  @Public()
  @Post('verify-login-otp')
  @ApiOperation({
    summary: 'Complete 2FA login with email OTP and challenge hash from /login',
  })
  verifyLoginOtp(@Body() body: VerifyLoginOtpDto, @Req() req: Request) {
    return this.auth.verifyLoginOtp(body.hash, body.otp, this.meta(req));
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
      'Request password-reset OTP by email (always ok; no email enumeration)',
  })
  forgotPassword(@Body() body: ForgotPasswordDto, @Req() req: Request) {
    return this.auth.forgotPassword(body.email, this.meta(req));
  }

  @Public()
  @Post('verify-reset-otp')
  @ApiOperation({
    summary:
      'Verify password-reset OTP and receive a short-lived reset session token',
  })
  verifyResetOtp(@Body() body: VerifyResetOtpDto, @Req() req: Request) {
    return this.auth.verifyResetOtp(body.email, body.otp, this.meta(req));
  }

  @Public()
  @Post('reset-password')
  @ApiOperation({
    summary: 'Set a new password using the post-OTP reset session token',
  })
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

  @Get('me/profile')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Signed-in user profile (self-service)' })
  getMyProfile(@Req() req: { user: AuthUserPublic }) {
    return this.auth.getMyProfile(req.user.id);
  }

  @Patch('me/profile')
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Update own profile fields (first/last/phone/image). Email is read-only.',
  })
  updateMyProfile(
    @Req() req: { user: AuthUserPublic },
    @Body() body: UpdateMyProfileDto,
  ) {
    return this.auth.updateMyProfile(req.user.id, body);
  }

  @Post('me/profile/avatar')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upload own profile avatar (max 2MB image)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: AVATAR_MAX_BYTES },
    }),
  )
  uploadMyAvatar(
    @Req() req: { user: AuthUserPublic },
    @UploadedFile() file: UploadedAvatar | undefined,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('File is required');
    }
    return this.auth.uploadMyAvatar(req.user.id, {
      buffer: file.buffer,
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
    });
  }

  @Post('me/two-factor/challenge')
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Start OTP challenge to enable or disable 2FA (does not change 2FA yet)',
  })
  startTwoFactorChallenge(
    @Req() req: { user: AuthUserPublic },
    @Body() body: TwoFactorChallengeDto,
  ) {
    return this.auth.startTwoFactorChallenge(
      req.user.id,
      body.intent,
      body.channel,
      this.meta(req as unknown as Request),
    );
  }

  @Post('me/two-factor/confirm')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Confirm OTP and then enable or disable 2FA for the signed-in user',
  })
  confirmTwoFactorChallenge(
    @Req() req: { user: AuthUserPublic },
    @Body() body: TwoFactorConfirmDto,
  ) {
    return this.auth.confirmTwoFactorChallenge(
      req.user.id,
      { hash: body.hash, otp: body.otp, intent: body.intent },
      this.meta(req as unknown as Request),
    );
  }

  @Patch('me/two-factor')
  @ApiBearerAuth()
  @ApiOperation({
    deprecated: true,
    summary: 'Deprecated — use /me/two-factor/challenge + confirm',
  })
  setTwoFactor() {
    throw new BadRequestException(
      'Use POST /auth/me/two-factor/challenge then /auth/me/two-factor/confirm',
    );
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
