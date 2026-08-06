import {
  BadRequestException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma/prisma.service';
import { BillingSettlementService } from '../billing/billing-settlement.service';
import { VisitsService } from '../visits/visits.service';
import { ManualAdapter, Slade360Adapter, SwitchAdapter } from './adapters';
import {
  loadSladeConfigFromEnv,
  parsePayerCodes,
  Slade360Client,
} from './slade360.client';
import type {
  ClaimSubmission,
  EligibilityResult,
  InsuranceGateway,
  InsuranceProvider,
} from './types';
import {
  INSURANCE_REPOSITORY,
  type IInsuranceRepository,
} from './repositories/insurance.repository.interface';

function mapIntegration(
  code: string,
  method: string | null,
): InsuranceProvider['integration'] {
  if (code === 'SHA') return 'SHA';
  if ((method || '').toUpperCase() === 'API') return 'SLADE';
  return 'MANUAL';
}

@Injectable()
export class InsuranceService {
  private sladeClient: Slade360Client | null = null;
  private payerCodes: Record<string, string> = {};

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    @Inject(INSURANCE_REPOSITORY)
    private readonly insuranceRepo: IInsuranceRepository,
    private readonly billing: BillingSettlementService,
    private readonly visits: VisitsService,
  ) {
    this.refreshSladeConfig();
  }

  private refreshSladeConfig(): void {
    const env = {
      ...process.env,
      SLADE_CLIENT_ID:
        this.config.get<string>('SLADE_CLIENT_ID') || process.env.SLADE_CLIENT_ID,
      SLADE_CLIENT_SECRET:
        this.config.get<string>('SLADE_CLIENT_SECRET') ||
        process.env.SLADE_CLIENT_SECRET,
      SLADE_SECRET_KEY:
        this.config.get<string>('SLADE_SECRET_KEY') ||
        process.env.SLADE_SECRET_KEY,
      SLADE_TOKEN_URL:
        this.config.get<string>('SLADE_TOKEN_URL') || process.env.SLADE_TOKEN_URL,
      SLADE_EDI_BASE_URL:
        this.config.get<string>('SLADE_EDI_BASE_URL') ||
        process.env.SLADE_EDI_BASE_URL,
      SLADE_BASE_URL:
        this.config.get<string>('SLADE_BASE_URL') || process.env.SLADE_BASE_URL,
      SLADE_IS_BASE_URL:
        this.config.get<string>('SLADE_IS_BASE_URL') ||
        process.env.SLADE_IS_BASE_URL,
      SLADE_ELIGIBILITY_MEMBER_PARAM:
        this.config.get<string>('SLADE_ELIGIBILITY_MEMBER_PARAM') ||
        process.env.SLADE_ELIGIBILITY_MEMBER_PARAM,
      SLADE_ELIGIBILITY_PAYER_PARAM:
        this.config.get<string>('SLADE_ELIGIBILITY_PAYER_PARAM') ||
        process.env.SLADE_ELIGIBILITY_PAYER_PARAM,
    } as NodeJS.ProcessEnv;

    this.sladeClient = new Slade360Client(loadSladeConfigFromEnv(env));
    this.payerCodes = parsePayerCodes(
      this.config.get<string>('SLADE_PAYER_CODES') ||
        process.env.SLADE_PAYER_CODES,
    );
  }

  private requireDb(): void {
    if (!this.prisma.isConnected) {
      throw new ServiceUnavailableException(
        'Database unavailable — insurance requires Supabase/Prisma',
      );
    }
  }

  /**
   * Single provider catalog for the UI. Every insurer (SHA + private) is
   * loaded here; the Nest insurance gateway routes each call by `integration`.
   */
  async listProviders(): Promise<
    Array<
      InsuranceProvider & {
        mode: 'live' | 'sandbox';
        channel: string;
      }
    >
  > {
    this.requireDb();
    const rows = await this.insuranceRepo.listActiveProviders();
    return rows.map((r) => {
      const integration = mapIntegration(r.code, r.claim_submission_method);
      const payerSladeCode = this.payerCodes[r.code.toUpperCase()];
      const channel =
        integration === 'SHA'
          ? 'SHA switch'
          : integration === 'SLADE'
            ? 'Slade360 HealthCloud (EDI/IS)'
            : 'Manual / offline';
      return {
        id: r.id,
        name: r.name,
        code: r.code,
        integration,
        payerSladeCode,
        channel,
        mode: this.isLive(integration, payerSladeCode) ? 'live' : 'sandbox',
      };
    });
  }

  private sladeLive(): boolean {
    return Boolean(this.sladeClient?.configured);
  }

  private isLive(
    integration: InsuranceProvider['integration'],
    payerSladeCode?: string,
  ): boolean {
    if (integration === 'SHA') {
      return Boolean(
        this.config.get('SHA_BASE_URL') || process.env.SHA_BASE_URL,
      ) && Boolean(this.config.get('SHA_API_KEY') || process.env.SHA_API_KEY);
    }
    if (integration === 'SLADE') {
      return this.sladeLive() && Boolean(payerSladeCode);
    }
    return false;
  }

  private async resolveProvider(providerId: string): Promise<InsuranceProvider> {
    this.requireDb();
    const row = await this.insuranceRepo.findProviderByIdOrCode(providerId);
    if (!row) {
      throw new BadRequestException('Unknown insurance provider.');
    }
    const code = row.code;
    return {
      id: row.id,
      name: row.name,
      code,
      integration: mapIntegration(row.code, row.claim_submission_method),
      payerSladeCode: this.payerCodes[code.toUpperCase()],
    };
  }

  private gatewayFor(provider: InsuranceProvider): InsuranceGateway {
    switch (provider.integration) {
      case 'SHA':
        return new SwitchAdapter({
          channel: 'SHA',
          scheme: provider.name,
          baseUrl:
            this.config.get<string>('SHA_BASE_URL') || process.env.SHA_BASE_URL,
          apiKey:
            this.config.get<string>('SHA_API_KEY') || process.env.SHA_API_KEY,
          providerCode:
            this.config.get<string>('SHA_PROVIDER_CODE') ||
            process.env.SHA_PROVIDER_CODE,
        });
      case 'SLADE': {
        if (!this.sladeClient) this.refreshSladeConfig();
        return new Slade360Adapter({
          client: this.sladeClient!,
          scheme: provider.name,
          payerSladeCode: provider.payerSladeCode || '',
          payerName: provider.name,
          locationCode:
            this.config.get<string>('SLADE_LOCATION_CODE') ||
            process.env.SLADE_LOCATION_CODE ||
            'T01',
          locationName:
            this.config.get<string>('SLADE_LOCATION_NAME') ||
            process.env.SLADE_LOCATION_NAME ||
            'NyaLife Clinic',
        });
      }
      case 'MANUAL':
        return new ManualAdapter(provider.name);
    }
  }

  async verifyEligibility(
    providerId: string,
    memberNumber: string,
  ): Promise<
    EligibilityResult & { mode: 'live' | 'sandbox'; policyId?: string }
  > {
    const provider = await this.resolveProvider(providerId);
    const gateway = this.gatewayFor(provider);
    const mode = this.isLive(provider.integration, provider.payerSladeCode)
      ? 'live'
      : 'sandbox';

    const policy = await this.insuranceRepo.findActivePolicy({
      providerId: provider.id,
      policyNumber: memberNumber,
    });

    const result = await gateway.verifyEligibility(memberNumber);
    if (!result.ok) return { ...result, mode };

    if (policy) {
      const profile = policy.patient.user.core_profiles_user_id[0];
      const name = profile
        ? `${profile.first_name} ${profile.last_name}`
        : result.member?.name;
      return {
        ...result,
        mode,
        policyId: policy.id,
        member: {
          name: name || 'Member',
          phoneMasked:
            result.member?.phoneMasked ||
            (profile?.phone
              ? profile.phone.replace(/(\d{3})\d+(\d{3})/, '$1•••$2')
              : '••••'),
        },
        coverage: {
          status: result.coverage?.status || 'ACTIVE',
          scheme: provider.name,
          balance: result.coverage?.balance,
        },
      };
    }

    return { ...result, mode };
  }

  async sendOtp(providerId: string, sessionId: string) {
    const provider = await this.resolveProvider(providerId);
    const result = await this.gatewayFor(provider).sendOtp(sessionId);
    return {
      ...result,
      mode: this.isLive(provider.integration, provider.payerSladeCode)
        ? 'live'
        : 'sandbox',
    };
  }

  async verifyOtp(
    providerId: string,
    sessionId: string,
    code: string,
    options?: { benefitCode?: string; benefitType?: string },
  ) {
    const provider = await this.resolveProvider(providerId);
    const result = await this.gatewayFor(provider).verifyOtp(
      sessionId,
      code,
      options,
    );
    return {
      ...result,
      mode: this.isLive(provider.integration, provider.payerSladeCode)
        ? 'live'
        : 'sandbox',
    };
  }

  async submitClaim(
    providerId: string,
    claim: ClaimSubmission,
    actorUserId: string,
    visitMeta?: { mrn?: string; diagnosis?: string; visitId?: string },
  ) {
    const provider = await this.resolveProvider(providerId);
    const enriched = await this.enrichClaimFromVisit(claim, visitMeta);

    // Slade claims require an auth_token from start_visit on the visit record.
    if (
      provider.integration === 'SLADE' &&
      !enriched.authToken &&
      !enriched.authorizationCode &&
      !enriched.ediAuthGuid
    ) {
      return {
        ok: false as const,
        error:
          'No active Slade medical visit auth_token on this visit. Complete eligibility + OTP (start visit) at check-in first.',
        mode: this.isLive(provider.integration, provider.payerSladeCode)
          ? ('live' as const)
          : ('sandbox' as const),
      };
    }

    const gatewayResult = await this.gatewayFor(provider).submitClaim(enriched);
    if (!gatewayResult.ok || !gatewayResult.claimId) {
      return {
        ...gatewayResult,
        mode: this.isLive(provider.integration, provider.payerSladeCode)
          ? 'live'
          : 'sandbox',
      };
    }

    if (visitMeta?.mrn) {
      try {
        const settled = await this.billing.settleVisit({
          createdByUserId: actorUserId,
          mrn: visitMeta.mrn,
          patientName: enriched.patientName,
          lines: enriched.items,
          total: enriched.total,
          mode: 'CLAIM',
          claimExternalId: gatewayResult.claimId,
          providerId: provider.id,
          policyNumber: enriched.memberNumber,
          diagnosis: visitMeta?.diagnosis || enriched.diagnosis,
        });
        return {
          ...gatewayResult,
          // Keep gateway (Slade) claim id for status polling; local number is secondary
          claimId: gatewayResult.claimId,
          localClaimNumber: settled.claimNumber,
          invoiceNumber:
            settled.invoiceNumber || gatewayResult.invoiceNumber,
          mode: this.isLive(provider.integration, provider.payerSladeCode)
            ? 'live'
            : 'sandbox',
        };
      } catch {
        // Fall through — still return gateway claim id even if invoice write fails
      }
    }

    return {
      ...gatewayResult,
      mode: this.isLive(provider.integration, provider.payerSladeCode)
        ? 'live'
        : 'sandbox',
    };
  }

  /** Attach visit timing, diagnosis, and Slade auth fields from the HMS visit. */
  private async enrichClaimFromVisit(
    claim: ClaimSubmission,
    visitMeta?: { mrn?: string; diagnosis?: string; visitId?: string },
  ): Promise<ClaimSubmission> {
    if (!visitMeta?.visitId) {
      return {
        ...claim,
        diagnosis: visitMeta?.diagnosis || claim.diagnosis,
      };
    }

    try {
      const visit = await this.visits.findOne(visitMeta.visitId);
      const payment = visit.payment;
      return {
        ...claim,
        patientName: claim.patientName || visit.patientName,
        memberNumber:
          claim.memberNumber || payment.policyNumber || claim.memberNumber,
        authToken: claim.authToken || payment.authToken,
        authorizationCode:
          claim.authorizationCode || payment.authorizationCode,
        ediAuthGuid: claim.ediAuthGuid || payment.ediAuthGuid,
        diagnosis: visitMeta.diagnosis || claim.diagnosis || visit.diagnosis,
        benefitType: claim.benefitType || payment.benefitType,
        schemeName: claim.schemeName || payment.schemeName,
        schemeCode: claim.schemeCode || payment.schemeCode,
        visitNumber: claim.visitNumber || visit.mrn || visit.id,
        visitStart: claim.visitStart || visit.checkedInAt,
        visitEnd: claim.visitEnd || new Date().toISOString(),
      };
    } catch {
      return {
        ...claim,
        diagnosis: visitMeta?.diagnosis || claim.diagnosis,
      };
    }
  }

  async getClaimStatus(providerId: string, claimId: string) {
    const provider = await this.resolveProvider(providerId);
    const status = await this.gatewayFor(provider).getClaimStatus(claimId);
    await this.billing.syncClaimStatus(claimId, status);
    return {
      ok: true,
      status,
      mode: this.isLive(provider.integration, provider.payerSladeCode)
        ? 'live'
        : 'sandbox',
    };
  }

  /**
   * Poll the payer for adjudication and update the visit.
   * ACCEPTED → patient automatically signed off (COMPLETED).
   */
  async syncVisitClaim(
    providerId: string,
    visitId: string,
    actorUserId?: string,
  ) {
    const provider = await this.resolveProvider(providerId);
    const visit = await this.visits.findOne(visitId);
    const claimId = visit.billing?.claimId;
    if (!claimId) {
      return {
        ok: false as const,
        error: 'Visit has no claim id — submit the claim first.',
        mode: this.isLive(provider.integration, provider.payerSladeCode)
          ? ('live' as const)
          : ('sandbox' as const),
      };
    }

    const status = await this.gatewayFor(provider).getClaimStatus(claimId);
    const updated = await this.visits.updateClaimStatus(
      visitId,
      status,
      actorUserId,
    );
    return {
      ok: true as const,
      status,
      stage: updated.stage,
      signedOff: updated.stage === 'COMPLETED' && status === 'ACCEPTED',
      visit: updated,
      mode: this.isLive(provider.integration, provider.payerSladeCode)
        ? ('live' as const)
        : ('sandbox' as const),
    };
  }
}
