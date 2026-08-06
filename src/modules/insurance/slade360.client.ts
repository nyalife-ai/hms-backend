/**
 * Slade360 HealthCloud HTTP client (Kenya EDI / IS multitenant).
 *
 * Auth: OAuth2 client_credentials with client_id + client_secret
 *   (env aliases: SLADE_CLIENT_ID, SLADE_CLIENT_SECRET | SLADE_SECRET_KEY)
 *
 * Flow bases:
 *   EDI  → eligibility, OTP, balance reservation
 *   IS   → start_visit, validate_authorization_token
 */

export interface SladeTokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
}

export interface SladeBenefit {
  status?: string;
  benefit_type?: string;
  benefit_code?: string;
  name?: string;
  balance?: number | string;
  available_balance?: number | string;
  [key: string]: unknown;
}

export interface SladeContact {
  id?: number | string;
  contact_id?: number | string;
  phone?: string;
  phone_number?: string;
  masked_phone?: string;
  [key: string]: unknown;
}

/** Loose eligibility shape — HealthCloud fields vary slightly by payer. */
export interface SladeEligibilityPayload {
  isActive?: boolean;
  member?: {
    isActive?: boolean;
    first_name?: string;
    last_name?: string;
    full_name?: string;
    name?: string;
    phone?: string;
    [key: string]: unknown;
  };
  benefits?: SladeBenefit[];
  beneficiary_id?: number | string;
  beneficiary?: { id?: number | string; [key: string]: unknown };
  beneficiary_contact?: number | string | SladeContact;
  contacts?: SladeContact[];
  beneficiary_contacts?: SladeContact[];
  policy_number?: string;
  policy_effective_date?: string;
  scheme_name?: string;
  scheme_code?: string;
  [key: string]: unknown;
}

export interface SladeStartVisitRequest {
  beneficiary_id: number | string;
  factors: string[];
  benefit_type: string;
  benefit_code: string;
  policy_number: string;
  policy_effective_date: string;
  otp: string;
  beneficiary_contact: number | string;
  scheme_name?: string;
  scheme_code?: string;
}

export interface SladeStartVisitResponse {
  edi_auth_guid?: string;
  auth_token?: string;
  authorization_guid?: string;
  [key: string]: unknown;
}

export interface SladeClientConfig {
  clientId: string;
  clientSecret: string;
  tokenUrl: string;
  ediBaseUrl: string;
  isBaseUrl: string;
  /** Query param name for member number on eligibility GET */
  memberParam: string;
  /** Query param name for payer slade code on eligibility GET */
  payerParam: string;
}

export class Slade360Client {
  private cachedToken: { value: string; expiresAt: number } | null = null;

  constructor(private readonly config: SladeClientConfig) {}

  get configured(): boolean {
    return Boolean(
      this.config.clientId.trim() &&
        this.config.clientSecret.trim() &&
        this.config.ediBaseUrl.trim(),
    );
  }

  async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.cachedToken && this.cachedToken.expiresAt > now + 30_000) {
      return this.cachedToken.value;
    }

    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
    });

    const res = await fetch(this.config.tokenUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(
        `Slade360 token request failed (${res.status}): ${text.slice(0, 240)}`,
      );
    }

    let json: SladeTokenResponse;
    try {
      json = JSON.parse(text) as SladeTokenResponse;
    } catch {
      throw new Error('Slade360 token response was not JSON.');
    }
    if (!json.access_token) {
      throw new Error('Slade360 token response missing access_token.');
    }

    const ttlMs = Math.max(60, Number(json.expires_in ?? 3600)) * 1000;
    this.cachedToken = { value: json.access_token, expiresAt: now + ttlMs };
    return json.access_token;
  }

  private async request<T>(
    base: string,
    path: string,
    init: RequestInit & { query?: Record<string, string> } = {},
  ): Promise<T> {
    const token = await this.getAccessToken();
    const url = new URL(
      path.startsWith('http') ? path : `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`,
    );
    if (init.query) {
      for (const [k, v] of Object.entries(init.query)) {
        if (v !== undefined && v !== '') url.searchParams.set(k, v);
      }
    }

    const { query: _q, headers, ...rest } = init;
    const res = await fetch(url.toString(), {
      ...rest,
      headers: {
        Accept: '*/*',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(headers || {}),
      },
    });

    const text = await res.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text };
      }
    }

    if (!res.ok) {
      const detail =
        typeof data === 'object' && data
          ? JSON.stringify(data).slice(0, 280)
          : String(text).slice(0, 280);
      throw new Error(`Slade360 ${path} → ${res.status}: ${detail}`);
    }

    return data as T;
  }

  /** Step 1 — member eligibility (EDI). */
  async memberEligibility(
    memberNumber: string,
    payerSladeCode: string,
  ): Promise<SladeEligibilityPayload> {
    const attempts: Array<Record<string, string>> = [
      {
        [this.config.memberParam]: memberNumber,
        [this.config.payerParam]: payerSladeCode,
      },
      // Common HealthCloud aliases if the tenant uses different names
      { member_number: memberNumber, payer: payerSladeCode },
      { member_number: memberNumber, payer_slade_code: payerSladeCode },
      { member_no: memberNumber, payer: payerSladeCode },
    ];

    // Deduplicate identical query maps
    const seen = new Set<string>();
    let lastError: Error | null = null;
    for (const query of attempts) {
      const key = JSON.stringify(query);
      if (seen.has(key)) continue;
      seen.add(key);
      try {
        return await this.request<SladeEligibilityPayload>(
          this.config.ediBaseUrl,
          '/v1/beneficiaries/member_eligibility/',
          { method: 'GET', query },
        );
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        // Retry only on likely param/validation failures
        if (!/→ (400|404|422)/.test(lastError.message)) throw lastError;
      }
    }
    throw lastError || new Error('Slade360 eligibility failed.');
  }

  /** Step 2 — send OTP to beneficiary contact (EDI). */
  sendOtp(contactId: string | number): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(
      this.config.ediBaseUrl,
      `/v1/beneficiaries/beneficiary_contacts/${contactId}/send_otp/`,
      { method: 'POST', body: JSON.stringify({}) },
    );
  }

  /** Step 3 — start authorized medical visit (IS). */
  startVisit(
    payload: SladeStartVisitRequest,
  ): Promise<SladeStartVisitResponse> {
    return this.request<SladeStartVisitResponse>(
      this.config.isBaseUrl,
      '/v1/authorizations/start_visit/',
      { method: 'POST', body: JSON.stringify(payload) },
    );
  }

  /** Optional — validate auth_token (IS). */
  validateAuthorizationToken(
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(
      this.config.isBaseUrl,
      '/v1/authorizations/validate_authorization_token/',
      { method: 'POST', body: JSON.stringify(body) },
    );
  }

  /** Step 4 — reserve benefit balance against active visit (EDI). */
  reserveFromAuthorization(body: {
    invoice_number: string;
    amount: string | number;
    authorization?: string;
    authorization_guid?: string;
    edi_auth_guid?: string;
  }): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(
      this.config.ediBaseUrl,
      '/v1/balances/reservations/reserve_from_authorization/',
      { method: 'POST', body: JSON.stringify(body) },
    );
  }

  /**
   * Create a medical claim under an active visit.
   * For Slade-authorized members, `member_number` MUST be the auth_token
   * from start_visit (not the card member number).
   */
  createClaim(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(
      this.config.ediBaseUrl,
      '/v1/claims/',
      { method: 'POST', body: JSON.stringify(body) },
    );
  }

  /** Upload supporting claim document (optional). */
  uploadClaimAttachment(body: {
    claim: string;
    attachment: string;
    attachment_type: string;
    description?: string;
  }): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(
      this.config.ediBaseUrl,
      '/v1/claim_attachments/upload_attachment/',
      { method: 'POST', body: JSON.stringify(body) },
    );
  }

  /** Submit a finalized invoice under a claim. */
  submitInvoice(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(
      this.config.ediBaseUrl,
      '/v1/invoices/',
      { method: 'POST', body: JSON.stringify(body) },
    );
  }

  /** Upload invoice attachment (optional). */
  uploadInvoiceAttachment(body: {
    invoice: string;
    attachment: string;
    description?: string;
  }): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(
      this.config.ediBaseUrl,
      '/v1/invoice_attachments/upload_attachment/',
      { method: 'POST', body: JSON.stringify(body) },
    );
  }

  /** Fetch a claim by UUID / id for adjudication status. */
  getClaim(claimId: string): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(
      this.config.ediBaseUrl,
      `/v1/claims/${encodeURIComponent(claimId)}/`,
      { method: 'GET' },
    );
  }

  /** List remittances for the provider. */
  listRemittances(): Promise<unknown> {
    return this.request<unknown>(this.config.ediBaseUrl, '/v1/remittances/', {
      method: 'GET',
    });
  }

  /** Remittance detail for a numeric Slade claim_id. */
  getClaimRemittance(
    claimId: string | number,
  ): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(
      this.config.ediBaseUrl,
      '/v1/remittances/claim_remittance/',
      { method: 'GET', query: { claim_id: String(claimId) } },
    );
  }
}

export function loadSladeConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): SladeClientConfig {
  const clientId = (env.SLADE_CLIENT_ID || '').trim();
  const clientSecret = (
    env.SLADE_CLIENT_SECRET ||
    env.SLADE_SECRET_KEY ||
    ''
  ).trim();

  return {
    clientId,
    clientSecret,
    tokenUrl: (
      env.SLADE_TOKEN_URL ||
      'https://provider-edi-api.multitenant.slade360.co.ke/o/token/'
    ).trim(),
    ediBaseUrl: (
      env.SLADE_EDI_BASE_URL ||
      env.SLADE_BASE_URL ||
      'https://provider-edi-api.multitenant.slade360.co.ke'
    ).trim(),
    isBaseUrl: (
      env.SLADE_IS_BASE_URL ||
      'https://is-api.multitenant.slade360.co.ke'
    ).trim(),
    memberParam: (env.SLADE_ELIGIBILITY_MEMBER_PARAM || 'member_number').trim(),
    payerParam: (env.SLADE_ELIGIBILITY_PAYER_PARAM || 'payer').trim(),
  };
}

/** Parse `JUBILEE:457,AAR:123` style maps; defaults include Jubilee demo code. */
export function parsePayerCodes(
  envValue?: string,
): Record<string, string> {
  const map: Record<string, string> = {
    JUBILEE: '457',
  };
  if (!envValue?.trim()) return map;
  for (const part of envValue.split(',')) {
    const [code, payer] = part.split(':').map((s) => s.trim());
    if (code && payer) map[code.toUpperCase()] = payer;
  }
  return map;
}
