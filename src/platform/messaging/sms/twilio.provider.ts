import { GenericHttpSmsProvider } from './generic-http-sms.provider';
import { SmsHttpProviderOptions } from './sms-provider.interface';

export class TwilioSmsProvider extends GenericHttpSmsProvider {
  public constructor(options: SmsHttpProviderOptions) {
    super(options, 'twilio');
  }
}
