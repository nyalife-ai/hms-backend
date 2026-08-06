export type HmsRole =
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
}

export interface AuthUserPublic {
  id: string;
  name: string;
  email: string;
  role: HmsRole;
  position: string;
  permissions: string[];
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
