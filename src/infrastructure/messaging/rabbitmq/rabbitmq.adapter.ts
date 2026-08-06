import { BaseBrokerAdapter } from '../base-broker.adapter';
import type {
  BrokerAdapterOptions,
  BrokerDriver,
  BrokerLogger,
} from '../broker.types';

export class RabbitMqAdapter extends BaseBrokerAdapter {
  public constructor(
    driver: BrokerDriver,
    options: BrokerAdapterOptions = {},
    logger?: BrokerLogger,
  ) {
    super(driver, options, logger);
  }
}
