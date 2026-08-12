export type HmsRole =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'DOCTOR'
  | 'NURSE'
  | 'RECEPTIONIST'
  | 'PHARMACIST'
  | 'LAB_TECHNICIAN'
  | 'RADIOLOGIST'
  | 'ACCOUNTANT'
  | 'PATIENT';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: HmsRole;
  position: string;
  passwordHash: string;
  permissions: string[];
  /** Per-account email OTP 2FA. */
  twoFactorEnabled: boolean;
  /** Linked core.staff_profiles row when the user is clinical staff. */
  staffProfileId?: string | null;
}

export interface AuthUserPublic {
  id: string;
  name: string;
  email: string;
  role: HmsRole;
  position: string;
  permissions: string[];
  twoFactorEnabled: boolean;
  /** Linked core.staff_profiles id — used for DOCTOR scoping on visits/appointments. */
  staffProfileId?: string | null;
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: HmsRole;
  name: string;
  position: string;
  permissions: string[];
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
  tokenType: 'Bearer';
}
