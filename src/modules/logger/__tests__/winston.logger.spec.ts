/**
 * Winston logger factory + Logstash TCP transport (mocked net).
 */

import { EventEmitter } from 'events';

type ConnectImpl = (
  port: number,
  host: string,
  cb?: () => void,
) => void;

let connectImpl: ConnectImpl = (_port, _host, cb) => {
  cb?.();
};

const writeMock = jest.fn();

class FakeSocket extends EventEmitter {
  connect(port: number, host: string, cb?: () => void) {
    connectImpl(port, host, cb);
    return this;
  }
  write(...args: unknown[]) {
    writeMock(...args);
    return true;
  }
  destroy = jest.fn();
}

jest.mock('net', () => ({
  Socket: jest.fn(() => new FakeSocket()),
}));

jest.mock('winston', () => {
  const actual = jest.requireActual('winston');
  return {
    ...actual,
    createLogger: jest.fn((opts) => ({
      level: opts.level,
      transports: opts.transports,
      defaultMeta: opts.defaultMeta,
      info: jest.fn(),
      error: jest.fn(),
    })),
  };
});

jest.mock('nest-winston', () => ({
  WinstonModule: {
    createLogger: jest.fn((opts) => ({ nest: true, ...opts })),
  },
}));

describe('winston.logger', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    writeMock.mockClear();
    connectImpl = (_port, _host, cb) => {
      cb?.();
    };
    process.env = { ...originalEnv };
    delete process.env.LOGSTASH_HOST;
    delete process.env.LOGSTASH_PORT;
    delete process.env.LOG_LEVEL;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.useRealTimers();
  });

  it('createWinstonLogger uses console transport in non-production without logstash', () => {
    process.env.NODE_ENV = 'test';
    const { createWinstonLogger } = require('../winston/winston.logger');
    const { createLogger, format } = require('winston');
    const logger = createWinstonLogger();
    expect(createLogger).toHaveBeenCalled();
    expect(logger.transports.length).toBe(1);
    expect(logger.defaultMeta.app).toBe('nfc-payment-api');

    // Exercise dev printf format branches (context + meta)
    const consoleTransport = logger.transports[0];
    const fmt = consoleTransport.format;
    if (fmt && typeof fmt.transform === 'function') {
      fmt.transform({
        level: 'info',
        message: 'hi',
        timestamp: 't',
        context: 'Auth',
        userId: 1,
        [Symbol.for('level')]: 'info',
      });
      fmt.transform({
        level: 'info',
        message: 'plain',
        timestamp: 't',
        [Symbol.for('level')]: 'info',
      });
    }
    // Touch shared baseFormat context normaliser via production path
    process.env.NODE_ENV = 'production';
    delete process.env.LOGSTASH_HOST;
    const { createWinstonLogger: createProd } = require('../winston/winston.logger');
    createProd();
    void format;
  });

  it('createWinstonLogger adds Logstash TCP transport when LOGSTASH_HOST is set', () => {
    jest.useFakeTimers();
    process.env.NODE_ENV = 'production';
    process.env.LOGSTASH_HOST = '127.0.0.1';
    process.env.LOGSTASH_PORT = '5044';
    process.env.LOG_LEVEL = 'warn';

    const { createWinstonLogger } = require('../winston/winston.logger');
    const logger = createWinstonLogger();
    expect(logger.transports.length).toBe(2);

    const tcp = logger.transports[1] as { client: FakeSocket };
    tcp.client.emit('error', new Error('boom'));
    tcp.client.emit('close');
    jest.advanceTimersByTime(5000);
  });

  it('LogstashTcpTransport buffers logs until connected and flushes', () => {
    process.env.LOGSTASH_HOST = 'logstash';
    process.env.NODE_ENV = 'development';

    let pendingConnect: (() => void) | undefined;
    connectImpl = (_port, _host, cb) => {
      pendingConnect = cb;
    };

    const { createWinstonLogger } = require('../winston/winston.logger');
    const logger = createWinstonLogger();
    const tcp = logger.transports[1] as {
      log: (info: unknown, cb: () => void) => void;
      buffer: string[];
      client: FakeSocket;
    };

    const cb = jest.fn();
    tcp.log({ message: 'hello', level: 'info' }, cb);
    expect(cb).toHaveBeenCalled();
    expect(tcp.buffer.length).toBe(1);

    pendingConnect?.();
    expect(writeMock).toHaveBeenCalled();
    expect(tcp.buffer.length).toBe(0);

    tcp.log({ message: 'world', level: 'info' }, jest.fn());
    expect(writeMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('createNestWinstonLogger wraps createWinstonLogger', () => {
    process.env.NODE_ENV = 'test';
    const { createNestWinstonLogger } = require('../winston/winston.logger');
    const { WinstonModule } = require('nest-winston');
    const nest = createNestWinstonLogger();
    expect(WinstonModule.createLogger).toHaveBeenCalled();
    expect(nest.nest).toBe(true);
  });

  it('buffers at most 500 lines while disconnected', () => {
    process.env.LOGSTASH_HOST = 'logstash';
    connectImpl = () => undefined;

    const { createWinstonLogger } = require('../winston/winston.logger');
    const logger = createWinstonLogger();
    const tcp = logger.transports[1] as {
      log: (info: unknown, cb: () => void) => void;
      buffer: string[];
    };

    for (let i = 0; i < 510; i++) {
      tcp.log({ message: `m${i}`, level: 'info' }, jest.fn());
    }
    expect(tcp.buffer.length).toBe(500);
  });
});
