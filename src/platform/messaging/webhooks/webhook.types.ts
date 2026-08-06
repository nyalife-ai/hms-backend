export interface HttpRequest {
  readonly url: string;
  readonly method:
    'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS';
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string;
  readonly timeoutMs?: number;
}

export interface HttpResponse {
  readonly status: number;
  readonly body?: string;
}

export interface HttpClient {
  request(request: HttpRequest): Promise<HttpResponse>;
}

export interface RetryPolicy {
  readonly maxAttempts: number;
  delay(attempt: number): Promise<void>;
}

export type DeliveryStatus = 'pending' | 'delivered' | 'failed';

export interface WebhookDelivery {
  readonly id: string;
  readonly url: string;
  readonly payload: string;
  readonly status: DeliveryStatus;
  readonly attempts: number;
  readonly responseStatus?: number;
  readonly error?: string;
}

export interface WebhookDeliveryRequest {
  readonly id: string;
  readonly url: string;
  readonly payload: unknown;
  readonly secret?: string;
  readonly timeoutMs?: number;
}
