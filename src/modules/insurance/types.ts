export type ClaimStatus = 'SUBMITTED' | 'ACCEPTED' | 'REJECTED';

export interface EligibilityBenefit {
  status: string;
  benefitType?: string;
  benefitCode?: string;
  name?: string;
  balance?: number;
}

export interface EligibilityResult {
  ok: boolean;
  error?: string;
  sessionId?: string;
  requiresOtp?: boolean;
  contactId?: string;
  beneficiaryId?: string;
  benefits?: EligibilityBenefit[];
  member?: {
    name: string;
    phoneMasked: string;
  };
  coverage?: {
    status: 'ACTIVE' | 'INACTIVE' | 'UNVERIFIED';
    scheme?: string;
    balance?: number;
  };
}

export interface OtpSendResult {
  ok: boolean;
  sentTo?: string;
  /** Present in Slade sandbox (and our offline sandbox) — never rely on this in production. */
  sandboxOtp?: string;
  error?: string;
}

export interface OtpVerifyResult {
  ok: boolean;
  verified: boolean;
  /** Prefer auth_token; may fall back to edi_auth_guid. */
  authorizationCode?: string;
  authToken?: string;
  ediAuthGuid?: string;
  benefitCode?: string;
  benefitType?: string;
  schemeName?: string;
  schemeCode?: string;
  error?: string;
}

export interface ClaimItem {
  description: string;
  amount: number;
  quantity?: number;
  code?: string;
}

export interface Icd10Code {
  code: string;
  description?: string;
}

export interface ClaimSubmission {
  /** Card / policy member number (local HMS record). */
  memberNumber: string;
  patientName: string;
  authorizationCode?: string;
  /** Slade auth_token from start_visit — required for Slade claim create. */
  authToken?: string;
  ediAuthGuid?: string;
  invoiceNumber?: string;
  diagnosis?: string;
  icd10Codes?: Icd10Code[];
  items: ClaimItem[];
  total: number;
  visitNumber?: string;
  visitStart?: string;
  visitEnd?: string;
  schemeName?: string;
  schemeCode?: string | number;
  benefitType?: string;
  locationCode?: string;
  locationName?: string;
}

export interface ClaimResult {
  ok: boolean;
  claimId?: string;
  /** Slade numeric claim_id when present */
  sladeClaimId?: string | number;
  status?: ClaimStatus;
  invoiceNumber?: string;
  sladeInvoiceId?: string;
  reservationId?: string;
  error?: string;
}

export interface InsuranceGateway {
  verifyEligibility(memberNumber: string): Promise<EligibilityResult>;
  sendOtp(sessionId: string): Promise<OtpSendResult>;
  verifyOtp(
    sessionId: string,
    code: string,
    options?: { benefitCode?: string; benefitType?: string },
  ): Promise<OtpVerifyResult>;
  submitClaim(claim: ClaimSubmission): Promise<ClaimResult>;
  getClaimStatus(claimId: string): Promise<ClaimStatus>;
}

export interface InsuranceProvider {
  id: string;
  name: string;
  code: string;
  integration: 'SHA' | 'SLADE' | 'MANUAL';
  /** Slade EDI payer code when integration === SLADE */
  payerSladeCode?: string;
}
