/**
 * Insurance switch adapters.
 *
 * UI → Nest InsuranceService → adapter by provider.integration:
 *   SHA    → Social Health Authority (Bearer API key switch)
 *   SLADE  → Slade360 HealthCloud (OAuth2 client_id/secret → EDI/IS)
 *   MANUAL → offline / portal insurers
 *
 * Slade credentials missing → sandbox simulation (same UX as live).
 */
import type {
  ClaimResult,
  ClaimStatus,
  ClaimSubmission,
  EligibilityBenefit,
  EligibilityResult,
  Icd10Code,
  InsuranceGateway,
  OtpSendResult,
  OtpVerifyResult,
} from './types';
import {
  type SladeBenefit,
  type SladeEligibilityPayload,
  Slade360Client,
} from './slade360.client';

export interface ShaSwitchConfig {
  channel: string;
  scheme: string;
  baseUrl?: string;
  apiKey?: string;
  providerCode?: string;
}

export interface SladeAdapterConfig {
  client: Slade360Client;
  scheme: string;
  /** Payer slade code on the EDI network (e.g. Jubilee = 457). */
  payerSladeCode: string;
  payerName: string;
  locationCode: string;
  locationName: string;
}

// ─── Shared session store (eligibility payload for start_visit) ─────────────

interface SladeSession {
  kind: 'slade';
  memberNumber: string;
  issuedAt: number;
  payerSladeCode: string;
  contactId: string;
  beneficiaryId: string;
  benefits: EligibilityBenefit[];
  policyNumber: string;
  policyEffectiveDate: string;
  schemeName: string;
  schemeCode: string;
  memberName: string;
  phoneMasked: string;
  raw: SladeEligibilityPayload;
  selectedBenefitCode?: string;
  selectedBenefitType?: string;
  ediAuthGuid?: string;
  authToken?: string;
}

interface SandboxSession {
  kind: 'sandbox';
  memberNumber: string;
  issuedAt: number;
  scheme: string;
}

type StoredSession = SladeSession | SandboxSession;

const SESSION_TTL_MS = 30 * 60_000;
const sessions = new Map<string, StoredSession>();

function putSession(session: StoredSession): string {
  const id = `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  sessions.set(id, session);
  return id;
}

function getSession(sessionId: string): StoredSession | null {
  const s = sessions.get(sessionId);
  if (!s) return null;
  if (Date.now() - s.issuedAt > SESSION_TTL_MS) {
    sessions.delete(sessionId);
    return null;
  }
  return s;
}

function updateSession(sessionId: string, patch: Partial<SladeSession>): void {
  const s = sessions.get(sessionId);
  if (!s || s.kind !== 'slade') return;
  sessions.set(sessionId, { ...s, ...patch });
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function maskPhone(phone?: string): string {
  if (!phone) return '••••';
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 6) return phone;
  return `+${digits.slice(0, 3)} ••• ••• ${digits.slice(-3)}`;
}

function pickContactId(payload: SladeEligibilityPayload): string | null {
  const direct = payload.beneficiary_contact;
  if (typeof direct === 'number' || typeof direct === 'string') {
    return String(direct);
  }
  if (direct && typeof direct === 'object' && (direct.id || direct.contact_id)) {
    return String(direct.id ?? direct.contact_id);
  }
  const list = payload.contacts || payload.beneficiary_contacts || [];
  const first = list[0];
  if (first?.id != null || first?.contact_id != null) {
    return String(first.id ?? first.contact_id);
  }
  return null;
}

function pickPhone(payload: SladeEligibilityPayload): string {
  const list = payload.contacts || payload.beneficiary_contacts || [];
  const first = list[0];
  return (
    first?.masked_phone ||
    first?.phone_number ||
    first?.phone ||
    payload.member?.phone ||
    '••••'
  );
}

function memberNameFrom(payload: SladeEligibilityPayload): string {
  const m = payload.member;
  if (!m) return 'Member';
  if (m.full_name || m.name) return String(m.full_name || m.name);
  const parts = [m.first_name, m.last_name].filter(Boolean);
  return parts.length ? parts.join(' ') : 'Member';
}

function mapBenefits(list: SladeBenefit[] | undefined): EligibilityBenefit[] {
  if (!Array.isArray(list)) return [];
  return list.map((b) => {
    const bal = b.available_balance ?? b.balance;
    const n = bal == null ? undefined : Number(bal);
    return {
      status: String(b.status || 'UNKNOWN').toUpperCase(),
      benefitType: b.benefit_type || undefined,
      benefitCode: b.benefit_code || undefined,
      name: b.name || undefined,
      balance: Number.isFinite(n as number) ? (n as number) : undefined,
    };
  });
}

function usableBenefits(benefits: EligibilityBenefit[]): EligibilityBenefit[] {
  return benefits.filter((b) => b.status === 'AVAILABLE');
}

function pickBenefit(
  benefits: EligibilityBenefit[],
  preferredCode?: string,
  preferredType?: string,
): EligibilityBenefit | null {
  const usable = usableBenefits(benefits);
  if (!usable.length) return null;
  if (preferredCode) {
    const hit = usable.find((b) => b.benefitCode === preferredCode);
    if (hit) return hit;
  }
  if (preferredType) {
    const hit = usable.find(
      (b) => (b.benefitType || '').toUpperCase() === preferredType.toUpperCase(),
    );
    if (hit) return hit;
  }
  return (
    usable.find((b) => (b.benefitType || '').toUpperCase() === 'OUTPATIENT') ||
    usable[0]
  );
}

/** Build Slade icd10_codes[] from structured codes and/or free-text diagnosis. */
function normalizeIcd10Codes(
  codes: Icd10Code[] | undefined,
  diagnosis?: string,
): Array<Record<string, string>> {
  if (codes?.length) {
    return codes.map((c) => ({
      code: c.code,
      icd10_code: c.code,
      description: c.description || c.code,
      name: c.description || c.code,
    }));
  }

  const text = (diagnosis || '').trim();
  if (!text) {
    return [
      {
        code: 'Z76.9',
        icd10_code: 'Z76.9',
        description: 'Encounter for other administrative services',
        name: 'Encounter for other administrative services',
      },
    ];
  }

  // "J06.9 - Acute URI" or bare "J06.9"
  const match = text.match(/^([A-TV-Z]\d{2}(?:\.\d{1,4})?)\b\s*[-–:]?\s*(.*)$/i);
  if (match) {
    const code = match[1].toUpperCase();
    const description = match[2]?.trim() || text;
    return [
      {
        code,
        icd10_code: code,
        description,
        name: description,
      },
    ];
  }

  return [
    {
      code: 'Z76.9',
      icd10_code: 'Z76.9',
      description: text,
      name: text,
    },
  ];
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hash(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (Math.imul(31, h) + input.charCodeAt(i)) >>> 0;
  }
  return h;
}

const SIM_NAMES = [
  'Paul Otieno',
  'Achieng Odhiambo',
  'Brian Kipchoge',
  'Cynthia Nyambura',
  'Dennis Wafula',
  'Halima Yusuf',
  'James Mwangi',
  'Nancy Chepkemoi',
];

// ─── Slade360 adapter ───────────────────────────────────────────────────────

export class Slade360Adapter implements InsuranceGateway {
  constructor(private readonly config: SladeAdapterConfig) {}

  get live(): boolean {
    return this.config.client.configured && Boolean(this.config.payerSladeCode);
  }

  async verifyEligibility(memberNumber: string): Promise<EligibilityResult> {
    if (!memberNumber.trim()) {
      return { ok: false, error: 'Member number is required.' };
    }
    // Without OAuth credentials we stay in sandbox even if payer code is missing.
    if (!this.live) {
      return this.sandboxEligibility(memberNumber);
    }

    if (!this.config.payerSladeCode) {
      return {
        ok: false,
        error:
          'This insurer has no Slade payer code configured. Set SLADE_PAYER_CODES (e.g. JUBILEE:457).',
      };
    }

    try {
      const raw = await this.config.client.memberEligibility(
        memberNumber.trim(),
        this.config.payerSladeCode,
      );

      const isActive =
        raw.isActive === true ||
        raw.member?.isActive === true ||
        String((raw as { status?: string }).status || '').toUpperCase() ===
          'ACTIVE';

      const benefits = mapBenefits(raw.benefits);
      const available = usableBenefits(benefits);
      const contactId = pickContactId(raw);
      const beneficiaryId = String(
        raw.beneficiary_id ?? raw.beneficiary?.id ?? '',
      );

      if (!isActive) {
        return {
          ok: false,
          error: 'Member cover is not active for the treatment date.',
          coverage: { status: 'INACTIVE', scheme: this.config.scheme },
        };
      }

      if (!available.length) {
        return {
          ok: false,
          error: 'No AVAILABLE benefit on this cover for outpatient billing.',
          member: {
            name: memberNameFrom(raw),
            phoneMasked: maskPhone(pickPhone(raw)),
          },
          coverage: { status: 'INACTIVE', scheme: this.config.scheme },
          benefits,
        };
      }

      if (!contactId || !beneficiaryId) {
        return {
          ok: false,
          error:
            'Eligibility response missing beneficiary/contact ids required for OTP.',
          benefits,
        };
      }

      const balance = available[0]?.balance;
      const sessionId = putSession({
        kind: 'slade',
        memberNumber: memberNumber.trim(),
        issuedAt: Date.now(),
        payerSladeCode: this.config.payerSladeCode,
        contactId,
        beneficiaryId,
        benefits,
        policyNumber: String(raw.policy_number || memberNumber.trim()),
        policyEffectiveDate: String(
          raw.policy_effective_date || new Date().toISOString(),
        ),
        schemeName: String(raw.scheme_name || this.config.scheme),
        schemeCode: String(raw.scheme_code || raw.policy_number || ''),
        memberName: memberNameFrom(raw),
        phoneMasked: maskPhone(pickPhone(raw)),
        raw,
      });

      return {
        ok: true,
        sessionId,
        requiresOtp: true,
        contactId,
        beneficiaryId,
        benefits: available,
        member: {
          name: memberNameFrom(raw),
          phoneMasked: maskPhone(pickPhone(raw)),
        },
        coverage: {
          status: 'ACTIVE',
          scheme: String(raw.scheme_name || this.config.scheme),
          balance,
        },
      };
    } catch (err) {
      return {
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : 'Slade360 eligibility request failed.',
      };
    }
  }

  private async sandboxEligibility(
    memberNumber: string,
  ): Promise<EligibilityResult> {
    await delay(700);
    const seed = hash(memberNumber);
    const name = SIM_NAMES[seed % SIM_NAMES.length];
    const phoneMasked = `+254 7•• ••• ${String((seed % 900) + 100)}`;
    const balance = 50_000 + (seed % 45) * 10_000;
    const benefits: EligibilityBenefit[] = [
      {
        status: 'AVAILABLE',
        benefitType: 'OUTPATIENT',
        benefitCode: 'BEN/001',
        name: 'Outpatient',
        balance,
      },
    ];
    const contactId = String(5000 + (seed % 900));
    const beneficiaryId = String(600000 + (seed % 9000));
    const sessionId = putSession({
      kind: 'slade',
      memberNumber: memberNumber.trim(),
      issuedAt: Date.now(),
      payerSladeCode: this.config.payerSladeCode || '457',
      contactId,
      beneficiaryId,
      benefits,
      policyNumber: memberNumber.trim(),
      policyEffectiveDate: '2023-01-01T00:00:00+03:00',
      schemeName: this.config.scheme,
      schemeCode: memberNumber.trim(),
      memberName: name,
      phoneMasked,
      raw: {},
    });
    return {
      ok: true,
      sessionId,
      requiresOtp: true,
      contactId,
      beneficiaryId,
      benefits,
      member: { name, phoneMasked },
      coverage: {
        status: 'ACTIVE',
        scheme: this.config.scheme,
        balance,
      },
    };
  }

  async sendOtp(sessionId: string): Promise<OtpSendResult> {
    const session = getSession(sessionId);
    if (!session || session.kind !== 'slade') {
      return {
        ok: false,
        error: 'Verification session expired — check eligibility again.',
      };
    }

    if (!this.config.client.configured) {
      await delay(600);
      return {
        ok: true,
        sentTo: session.phoneMasked,
        // Sandbox hint for reception (mirrors Slade sandbox embedding OTP)
        sandboxOtp: '123456',
      };
    }

    try {
      const res = await this.config.client.sendOtp(session.contactId);
      const embedded =
        (res.otp as string | undefined) ||
        (res.code as string | undefined) ||
        (res.otp_code as string | undefined);
      return {
        ok: true,
        sentTo: session.phoneMasked,
        sandboxOtp: embedded ? String(embedded) : undefined,
      };
    } catch (err) {
      return {
        ok: false,
        error:
          err instanceof Error ? err.message : 'Failed to send Slade360 OTP.',
      };
    }
  }

  async verifyOtp(
    sessionId: string,
    code: string,
    options?: { benefitCode?: string; benefitType?: string },
  ): Promise<OtpVerifyResult> {
    const session = getSession(sessionId);
    if (!session || session.kind !== 'slade') {
      return {
        ok: false,
        verified: false,
        error: 'Verification session expired.',
      };
    }
    if (!/^\d{4,8}$/.test(code)) {
      return {
        ok: true,
        verified: false,
        error: 'Invalid OTP — enter the code sent to the patient.',
      };
    }

    const benefit = pickBenefit(
      session.benefits,
      options?.benefitCode || session.selectedBenefitCode,
      options?.benefitType || session.selectedBenefitType,
    );
    if (!benefit?.benefitCode || !benefit.benefitType) {
      return {
        ok: false,
        verified: false,
        error: 'Select an AVAILABLE benefit before starting the visit.',
      };
    }

    if (!this.config.client.configured) {
      await delay(600);
      if (code !== '123456' && !/^\d{6}$/.test(code)) {
        return {
          ok: true,
          verified: false,
          error: 'Invalid code — sandbox accepts 123456 or any 6 digits.',
        };
      }
      const authToken = `SANDBOX-AUTH-${hash(session.memberNumber + code)
        .toString(36)
        .toUpperCase()}`;
      const ediAuthGuid = `SANDBOX-GUID-${hash(code + session.beneficiaryId)
        .toString(36)
        .toUpperCase()}`;
      updateSession(sessionId, {
        authToken,
        ediAuthGuid,
        selectedBenefitCode: benefit.benefitCode,
        selectedBenefitType: benefit.benefitType,
      });
      return {
        ok: true,
        verified: true,
        authorizationCode: authToken,
        ediAuthGuid,
        authToken,
        benefitCode: benefit.benefitCode,
        benefitType: benefit.benefitType,
        schemeName: session.schemeName,
        schemeCode: session.schemeCode,
      };
    }

    try {
      const started = await this.config.client.startVisit({
        beneficiary_id: Number(session.beneficiaryId) || session.beneficiaryId,
        factors: ['OTP'],
        benefit_type: benefit.benefitType,
        benefit_code: benefit.benefitCode,
        policy_number: session.policyNumber,
        policy_effective_date: session.policyEffectiveDate,
        otp: code,
        beneficiary_contact:
          Number(session.contactId) || session.contactId,
        scheme_name: session.schemeName,
        scheme_code: session.schemeCode || session.policyNumber,
      });

      const authToken = String(started.auth_token || '');
      const ediAuthGuid = String(
        started.edi_auth_guid || started.authorization_guid || '',
      );
      if (!authToken && !ediAuthGuid) {
        return {
          ok: false,
          verified: false,
          error: 'Slade360 start_visit did not return auth_token / edi_auth_guid.',
        };
      }

      updateSession(sessionId, {
        authToken,
        ediAuthGuid,
        selectedBenefitCode: benefit.benefitCode,
        selectedBenefitType: benefit.benefitType,
      });

      return {
        ok: true,
        verified: true,
        authorizationCode: authToken || ediAuthGuid,
        authToken: authToken || undefined,
        ediAuthGuid: ediAuthGuid || undefined,
        benefitCode: benefit.benefitCode,
        benefitType: benefit.benefitType,
        schemeName: session.schemeName,
        schemeCode: session.schemeCode,
      };
    } catch (err) {
      return {
        ok: false,
        verified: false,
        error:
          err instanceof Error
            ? err.message
            : 'Slade360 start_visit failed.',
      };
    }
  }

  async submitClaim(claim: ClaimSubmission): Promise<ClaimResult> {
    if (!this.config.client.configured) {
      await delay(800);
      const claimId = `CLM-${Date.now().toString(36).toUpperCase()}-${hash(claim.memberNumber) % 1000}`;
      return {
        ok: true,
        claimId,
        status: 'SUBMITTED',
        invoiceNumber:
          claim.invoiceNumber ||
          `INV/${Date.now().toString(36).toUpperCase()}`,
      };
    }

    // Claims must be submitted against an active medical visit (auth_token).
    const authToken =
      claim.authToken || claim.authorizationCode || claim.ediAuthGuid;
    if (!authToken) {
      return {
        ok: false,
        error:
          'Missing auth_token from start_visit. Re-verify the member before submitting a claim.',
      };
    }
    if (!this.config.payerSladeCode) {
      return {
        ok: false,
        error:
          'Missing payer slade code. Set SLADE_PAYER_CODES (e.g. JUBILEE:457).',
      };
    }

    const invoiceNumber =
      claim.invoiceNumber ||
      `INV/${Date.now().toString(36).toUpperCase()}`;
    const visitNumber =
      claim.visitNumber || `V${Date.now().toString(36).toUpperCase()}`;
    const visitStart = claim.visitStart || new Date().toISOString();
    const visitEnd = claim.visitEnd || new Date().toISOString();
    const icd10Codes = normalizeIcd10Codes(claim.icd10Codes, claim.diagnosis);

    let reservationId: string | undefined;
    // Best-effort reserve so another provider cannot consume the balance first.
    if (claim.ediAuthGuid || claim.authToken) {
      try {
        const reserved = await this.config.client.reserveFromAuthorization({
          invoice_number: invoiceNumber,
          amount: String(claim.total),
          authorization: claim.ediAuthGuid || authToken,
          authorization_guid: claim.ediAuthGuid,
          edi_auth_guid: claim.ediAuthGuid,
        });
        reservationId = String(
          (reserved.id as string | number | undefined) ||
            (reserved.reservation_id as string | number | undefined) ||
            '',
        );
      } catch {
        // Reservation is helpful but not a hard stop — continue to create_claim.
      }
    }

    try {
      const created = await this.config.client.createClaim({
        payer_code: Number(this.config.payerSladeCode),
        payer_name: this.config.payerName,
        patient_name: claim.patientName,
        // Slade-authorized visits: member_number = auth_token from start_visit
        member_number: authToken,
        scheme_name: claim.schemeName || this.config.scheme,
        scheme_code: claim.schemeCode,
        visit_number: visitNumber,
        visit_start: visitStart,
        visit_end: visitEnd,
        icd10_codes: icd10Codes,
        location_code: claim.locationCode || this.config.locationCode,
        location_name: claim.locationName || this.config.locationName,
        service_type: claim.benefitType || 'OUTPATIENT',
      });

      const claimUuid = String(
        (created.id as string | undefined) ||
          (created.claim as string | undefined) ||
          '',
      );
      const sladeClaimId =
        (created.claim_id as string | number | undefined) ?? undefined;

      if (!claimUuid) {
        return {
          ok: false,
          error: 'Slade360 create_claim did not return a claim id.',
        };
      }

      const lines = claim.items.map((item, index) => ({
        name: item.description,
        description: item.description,
        item_name: item.description,
        item_code: item.code || `LINE-${index + 1}`,
        quantity: item.quantity ?? 1,
        unit_price: item.amount,
        price: item.amount,
        amount: item.amount,
      }));

      let sladeInvoiceId: string | undefined;
      try {
        const invoice = await this.config.client.submitInvoice({
          claim: claimUuid,
          invoice_number: invoiceNumber,
          invoice_date: visitEnd,
          copays: [],
          lines,
        });
        sladeInvoiceId = String(
          (invoice.id as string | undefined) ||
            (invoice.invoice as string | undefined) ||
            '',
        );
      } catch (invErr) {
        // Claim exists — surface partial success with the claim id for retry/debug
        return {
          ok: true,
          claimId: claimUuid,
          sladeClaimId,
          status: 'SUBMITTED',
          invoiceNumber,
          reservationId: reservationId || undefined,
          error:
            invErr instanceof Error
              ? `Claim created but invoice failed: ${invErr.message}`
              : 'Claim created but invoice failed.',
        };
      }

      const workflow = String(created.workflow_state || 'PENDING').toUpperCase();
      const status: ClaimStatus =
        workflow.includes('REJECT')
          ? 'REJECTED'
          : workflow.includes('APPROV') || workflow.includes('ACCEPT')
            ? 'ACCEPTED'
            : 'SUBMITTED';

      return {
        ok: true,
        claimId: claimUuid,
        sladeClaimId,
        status,
        invoiceNumber,
        sladeInvoiceId: sladeInvoiceId || undefined,
        reservationId: reservationId || undefined,
      };
    } catch (err) {
      return {
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : 'Slade360 create_claim failed.',
      };
    }
  }

  async getClaimStatus(claimId: string): Promise<ClaimStatus> {
    if (!this.config.client.configured) {
      await delay(400);
      // Sandbox: CLAIM_SUBMITTED visits flip to ACCEPTED ~15s after submit
      // so the full checkout cycle can be demoed without a live payer.
      const parts = claimId.split('-');
      const submittedAt = parseInt(parts[1] ?? '', 36);
      if (!Number.isNaN(submittedAt) && Date.now() - submittedAt > 15_000) {
        return 'ACCEPTED';
      }
      // UUID-style ids: use last segment / session age heuristic via hex time prefix
      if (claimId.includes('-') && claimId.length > 20) {
        // Treat as pending for first poll window, then accept — keyed off process uptime
        // by caching first-seen time.
        const first = sandboxClaimSeen.get(claimId) ?? Date.now();
        sandboxClaimSeen.set(claimId, first);
        return Date.now() - first > 15_000 ? 'ACCEPTED' : 'SUBMITTED';
      }
      return 'SUBMITTED';
    }

    // Optional: SLADE_DEMO_AUTO_ACCEPT_MS=15000 to exercise sign-off in demo tenants
    const demoMs = Number(process.env.SLADE_DEMO_AUTO_ACCEPT_MS || 0);
    if (demoMs > 0) {
      const first = sandboxClaimSeen.get(claimId) ?? Date.now();
      sandboxClaimSeen.set(claimId, first);
      if (Date.now() - first > demoMs) return 'ACCEPTED';
    }

    try {
      const claim = await this.config.client.getClaim(claimId);
      const mapped = mapSladeWorkflow(claim);
      if (mapped !== 'SUBMITTED') return mapped;

      // Remittance with approved/paid amounts ⇒ accepted
      const numericId = claim.claim_id ?? claim.id;
      if (numericId != null) {
        try {
          const remittance = await this.config.client.getClaimRemittance(
            numericId as string | number,
          );
          const approved = Number(
            remittance.approved_amount ?? remittance.balanced_paid_amount ?? 0,
          );
          if (approved > 0) return 'ACCEPTED';
        } catch {
          // Remittance may not exist until payer pays — keep SUBMITTED
        }
      }
      return 'SUBMITTED';
    } catch {
      return 'SUBMITTED';
    }
  }
}

/** First time we saw a sandbox claim id — used to auto-accept after ~15s. */
const sandboxClaimSeen = new Map<string, number>();

function mapSladeWorkflow(claim: Record<string, unknown>): ClaimStatus {
  const state = String(
    claim.workflow_state || claim.status || claim.state || '',
  ).toUpperCase();
  if (
    state.includes('REJECT') ||
    state.includes('DENY') ||
    state.includes('DENIED') ||
    state.includes('CANCEL')
  ) {
    return 'REJECTED';
  }
  if (
    state.includes('APPROV') ||
    state.includes('ACCEPT') ||
    state.includes('PAID') ||
    state.includes('SETTLED') ||
    state.includes('COMPLETE')
  ) {
    return 'ACCEPTED';
  }
  return 'SUBMITTED';
}

// ─── SHA / generic Bearer switch ────────────────────────────────────────────

export class SwitchAdapter implements InsuranceGateway {
  constructor(private readonly config: ShaSwitchConfig) {}

  get live(): boolean {
    return Boolean(this.config.baseUrl?.trim() && this.config.apiKey?.trim());
  }

  private async request<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.config.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
        'X-Provider-Code': this.config.providerCode ?? '',
        'X-Channel': this.config.channel,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(
        `${this.config.channel} responded ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`,
      );
    }
    return res.json() as Promise<T>;
  }

  async verifyEligibility(memberNumber: string): Promise<EligibilityResult> {
    if (!memberNumber.trim()) {
      return { ok: false, error: 'Member number is required.' };
    }
    if (this.live) {
      return this.request<EligibilityResult>('/v1/eligibility', {
        memberNumber,
        scheme: this.config.scheme,
        providerCode: this.config.providerCode,
      });
    }
    await delay(700);
    const seed = hash(memberNumber);
    const sessionId = putSession({
      kind: 'sandbox',
      memberNumber,
      issuedAt: Date.now(),
      scheme: this.config.scheme,
    });
    return {
      ok: true,
      sessionId,
      requiresOtp: true,
      member: {
        name: SIM_NAMES[seed % SIM_NAMES.length],
        phoneMasked: `+254 7•• ••• ${String((seed % 900) + 100)}`,
      },
      coverage: {
        status: 'ACTIVE',
        scheme: this.config.scheme,
        balance: 50_000 + (seed % 45) * 10_000,
      },
    };
  }

  async sendOtp(sessionId: string): Promise<OtpSendResult> {
    if (this.live) {
      return this.request<OtpSendResult>('/v1/otp/send', { sessionId });
    }
    await delay(600);
    const session = getSession(sessionId);
    if (!session) {
      return {
        ok: false,
        error: 'Verification session expired — check eligibility again.',
      };
    }
    const seed = hash(session.memberNumber);
    return {
      ok: true,
      sentTo: `+254 7•• ••• ${String((seed % 900) + 100)}`,
      sandboxOtp: '123456',
    };
  }

  async verifyOtp(sessionId: string, code: string): Promise<OtpVerifyResult> {
    if (this.live) {
      return this.request<OtpVerifyResult>('/v1/otp/verify', {
        sessionId,
        code,
      });
    }
    await delay(600);
    const session = getSession(sessionId);
    if (!session) {
      return {
        ok: false,
        verified: false,
        error: 'Verification session expired.',
      };
    }
    if (!/^\d{6}$/.test(code)) {
      return {
        ok: true,
        verified: false,
        error: 'Invalid code — enter the 6 digits sent to the patient.',
      };
    }
    return {
      ok: true,
      verified: true,
      authorizationCode: `AUTH-${hash(session.memberNumber + code)
        .toString(36)
        .toUpperCase()}`,
    };
  }

  async submitClaim(claim: ClaimSubmission): Promise<ClaimResult> {
    if (this.live) {
      return this.request<ClaimResult>('/v1/claims', {
        ...claim,
        scheme: this.config.scheme,
        providerCode: this.config.providerCode,
      });
    }
    await delay(800);
    const claimId = `CLM-${Date.now().toString(36).toUpperCase()}-${hash(claim.memberNumber) % 1000}`;
    return { ok: true, claimId, status: 'SUBMITTED' };
  }

  async getClaimStatus(claimId: string): Promise<ClaimStatus> {
    if (this.live) {
      const result = await this.request<{ status: ClaimStatus }>(
        '/v1/claims/status',
        { claimId },
      );
      return result.status;
    }
    await delay(400);
    const submittedAt = parseInt(claimId.split('-')[1] ?? '', 36);
    if (Number.isNaN(submittedAt)) return 'SUBMITTED';
    return Date.now() - submittedAt > 15_000 ? 'ACCEPTED' : 'SUBMITTED';
  }
}

// ─── Manual / offline ───────────────────────────────────────────────────────

export class ManualAdapter implements InsuranceGateway {
  constructor(private readonly insurerName: string) {}

  async verifyEligibility(memberNumber: string): Promise<EligibilityResult> {
    if (!memberNumber.trim()) {
      return { ok: false, error: 'Member number is required.' };
    }
    return {
      ok: true,
      requiresOtp: false,
      coverage: { status: 'UNVERIFIED', scheme: this.insurerName },
    };
  }

  async sendOtp(): Promise<OtpSendResult> {
    return {
      ok: false,
      error:
        'This insurer has no OTP verification — cover is confirmed manually.',
    };
  }

  async verifyOtp(): Promise<OtpVerifyResult> {
    return {
      ok: false,
      verified: false,
      error: 'This insurer has no OTP verification.',
    };
  }

  async submitClaim(claim: ClaimSubmission): Promise<ClaimResult> {
    const claimId = `MAN-${Date.now().toString(36).toUpperCase()}-${hash(claim.memberNumber) % 1000}`;
    return { ok: true, claimId, status: 'SUBMITTED' };
  }

  async getClaimStatus(): Promise<ClaimStatus> {
    return 'SUBMITTED';
  }
}
