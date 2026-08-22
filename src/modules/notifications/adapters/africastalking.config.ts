/**
 * File: africastalking.config.ts
 * Module: notifications
 * Purpose: Load Africa's Talking credentials from env / ConfigService (feature-local).
 */

import type { ConfigService } from '@nestjs/config';
import type {
  AfricasTalkingEnv,
  AfricasTalkingSmsOptions,
} from './africastalking-sms.adapter';

export function loadAfricasTalkingOptions(
  config?: ConfigService,
): AfricasTalkingSmsOptions | null {
  const get = (key: string): string =>
    (config?.get<string>(key) || process.env[key] || '').trim();

  const username = get('AFRICASTALKING_USERNAME');
  const apiKey = get('AFRICASTALKING_API_KEY');
  if (!username || !apiKey) return null;

  const envRaw = get('AFRICASTALKING_ENV').toLowerCase();
  const env: AfricasTalkingEnv =
    envRaw === 'production' ? 'production' : 'sandbox';

  return {
    username,
    apiKey,
    from: get('AFRICASTALKING_FROM') || undefined,
    env,
  };
}

export function isAfricasTalkingConfigured(config?: ConfigService): boolean {
  return loadAfricasTalkingOptions(config) != null;
}
