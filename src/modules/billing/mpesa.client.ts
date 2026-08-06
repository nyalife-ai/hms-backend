/**
 * Safaricom Daraja STK Push client (sandbox / production).
 *
 * Env:
 *   MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET
 *   MPESA_SHORTCODE (sandbox default 174379)
 *   MPESA_PASSKEY
 *   MPESA_CALLBACK_URL (public HTTPS — required for live callbacks)
 *   MPESA_ENV=sandbox|production
 */

export interface StkPushResult {
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResponseCode: string;
  ResponseDescription: string;
  CustomerMessage: string;
}

export interface StkQueryResult {
  ResponseCode: string;
  ResponseDescription: string;
  MerchantRequestID?: string;
  CheckoutRequestID?: string;
  ResultCode?: string;
  ResultDesc?: string;
}

export interface MpesaConfig {
  consumerKey: string;
  consumerSecret: string;
  shortcode: string;
  passkey: string;
  callbackUrl: string;
  env: 'sandbox' | 'production';
  transactionType: string;
}

export class MpesaClient {
  private cachedToken: { value: string; expiresAt: number } | null = null;

  constructor(private readonly config: MpesaConfig) {}

  get configured(): boolean {
    return Boolean(
      this.config.consumerKey.trim() &&
        this.config.consumerSecret.trim() &&
        this.config.shortcode.trim() &&
        this.config.passkey.trim(),
    );
  }

  private baseUrl(): string {
    return this.config.env === 'production'
      ? 'https://api.safaricom.co.ke'
      : 'https://sandbox.safaricom.co.ke';
  }

  async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.cachedToken && this.cachedToken.expiresAt > now + 30_000) {
      return this.cachedToken.value;
    }
    const creds = Buffer.from(
      `${this.config.consumerKey}:${this.config.consumerSecret}`,
    ).toString('base64');
    const res = await fetch(
      `${this.baseUrl()}/oauth/v1/generate?grant_type=client_credentials`,
      { headers: { Authorization: `Basic ${creds}` } },
    );
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`M-Pesa OAuth failed (${res.status}): ${text.slice(0, 200)}`);
    }
    const json = JSON.parse(text) as { access_token?: string; expires_in?: string };
    if (!json.access_token) throw new Error('M-Pesa OAuth missing access_token');
    const ttl = Math.max(60, Number(json.expires_in || 3599)) * 1000;
    this.cachedToken = { value: json.access_token, expiresAt: now + ttl };
    return json.access_token;
  }

  private password(timestamp: string): string {
    return Buffer.from(
      `${this.config.shortcode}${this.config.passkey}${timestamp}`,
    ).toString('base64');
  }

  private timestamp(): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return (
      `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
      `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
    );
  }

  /** Normalize KE numbers to 2547XXXXXXXX */
  static normalizePhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.startsWith('254') && digits.length === 12) return digits;
    if (digits.startsWith('0') && digits.length === 10) return `254${digits.slice(1)}`;
    if (digits.length === 9 && digits.startsWith('7')) return `254${digits}`;
    throw new Error('Enter a valid Kenyan mobile number (e.g. 07XXXXXXXX).');
  }

  async stkPush(input: {
    phone: string;
    amount: number;
    accountReference: string;
    description: string;
  }): Promise<StkPushResult> {
    const token = await this.getAccessToken();
    const timestamp = this.timestamp();
    const phone = MpesaClient.normalizePhone(input.phone);
    const amount = Math.max(1, Math.round(input.amount));

    const body = {
      BusinessShortCode: this.config.shortcode,
      Password: this.password(timestamp),
      Timestamp: timestamp,
      TransactionType: this.config.transactionType || 'CustomerPayBillOnline',
      Amount: amount,
      PartyA: phone,
      PartyB: this.config.shortcode,
      PhoneNumber: phone,
      CallBackURL: this.config.callbackUrl,
      AccountReference: input.accountReference.slice(0, 12),
      TransactionDesc: input.description.slice(0, 13),
    };

    const res = await fetch(
      `${this.baseUrl()}/mpesa/stkpush/v1/processrequest`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );
    const text = await res.text();
    let json: StkPushResult & { errorMessage?: string; errorCode?: string };
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`M-Pesa STK non-JSON response: ${text.slice(0, 200)}`);
    }
    if (!res.ok || json.ResponseCode !== '0') {
      throw new Error(
        json.errorMessage ||
          json.ResponseDescription ||
          `M-Pesa STK failed (${res.status})`,
      );
    }
    return json;
  }

  async stkQuery(checkoutRequestId: string): Promise<StkQueryResult> {
    const token = await this.getAccessToken();
    const timestamp = this.timestamp();
    const body = {
      BusinessShortCode: this.config.shortcode,
      Password: this.password(timestamp),
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId,
    };
    const res = await fetch(`${this.baseUrl()}/mpesa/stkpushquery/v1/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    try {
      return JSON.parse(text) as StkQueryResult;
    } catch {
      throw new Error(`M-Pesa query non-JSON: ${text.slice(0, 200)}`);
    }
  }
}

export function loadMpesaConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): MpesaConfig {
  const publicUrl = (env.PUBLIC_URL || 'http://localhost:4000').replace(/\/$/, '');
  return {
    consumerKey: (env.MPESA_CONSUMER_KEY || '').trim(),
    consumerSecret: (env.MPESA_CONSUMER_SECRET || '').trim(),
    shortcode: (env.MPESA_SHORTCODE || '174379').trim(),
    passkey: (env.MPESA_PASSKEY || '').trim(),
    callbackUrl: (
      env.MPESA_CALLBACK_URL || `${publicUrl}/billing/mpesa/callback`
    ).trim(),
    env: (env.MPESA_ENV || 'sandbox').toLowerCase() === 'production'
      ? 'production'
      : 'sandbox',
    transactionType: (
      env.MPESA_TRANSACTION_TYPE || 'CustomerPayBillOnline'
    ).trim(),
  };
}
