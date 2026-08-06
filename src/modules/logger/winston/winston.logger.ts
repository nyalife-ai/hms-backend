import { createLogger, format, transports, Logger } from 'winston';
import { WinstonModule } from 'nest-winston';
import * as net from 'net';

// ─── TCP transport (ships JSON lines to Logstash on port 5044) ───────────────
class LogstashTcpTransport extends transports.Stream {
  private client: net.Socket | null = null;
  private buffer: string[] = [];
  private connected = false;
  private readonly host: string;
  private readonly port: number;

  constructor(opts: { host: string; port: number; level?: string }) {
    const passThrough = new (require('stream').PassThrough)();
    super({ stream: passThrough, level: opts.level || 'info' });
    this.host = opts.host;
    this.port = opts.port;
    this.connect();
  }

  private connect(): void {
    this.client = new net.Socket();
    this.client.connect(this.port, this.host, () => {
      this.connected = true;
      // flush buffered messages
      this.buffer.forEach((msg) => this.client!.write(msg));
      this.buffer = [];
    });
    this.client.on('error', () => {
      this.connected = false;
      setTimeout(() => this.connect(), 5000); // reconnect after 5s
    });
    this.client.on('close', () => {
      this.connected = false;
      setTimeout(() => this.connect(), 5000);
    });
  }

  log(info: any, callback: () => void): void {
    const line = JSON.stringify(info) + '\n';
    if (this.connected && this.client) {
      this.client.write(line);
    } else {
      // buffer up to 500 lines while disconnected
      if (this.buffer.length < 500) this.buffer.push(line);
    }
    callback();
  }
}

// ─── Shared format ────────────────────────────────────────────────────────────
const baseFormat = format.combine(
  format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
  format.errors({ stack: true }),
  format((info) => {
    // normalise NestJS context → service.name
    if (info.context) {
      info.context = info.context;
    }
    return info;
  })(),
);

// ─── Factory ─────────────────────────────────────────────────────────────────
export function createWinstonLogger(): Logger {
  const isDev = process.env.NODE_ENV !== 'production';
  const logstashHost = process.env.LOGSTASH_HOST || 'localhost';
  const logstashPort = parseInt(process.env.LOGSTASH_PORT || '5044', 10);
  const logLevel = process.env.LOG_LEVEL || (isDev ? 'debug' : 'info');

  const winstonTransports: any[] = [
    // Console — coloured + pretty in dev, pure JSON in prod
    new transports.Console({
      level: logLevel,
      format: isDev
        ? format.combine(
            format.colorize({ all: true }),
            format.printf(({ timestamp, level, context, message, ...meta }) => {
              const ctx = context ? ` [${context}]` : '';
              const extra = Object.keys(meta).length
                ? ' ' + JSON.stringify(meta)
                : '';
              return `${timestamp} ${level}${ctx}: ${message}${extra}`;
            }),
          )
        : format.combine(baseFormat, format.json()),
    }),
  ];

  // Ship to Logstash in all environments when host is configured
  if (process.env.LOGSTASH_HOST) {
    winstonTransports.push(
      new LogstashTcpTransport({
        host: logstashHost,
        port: logstashPort,
        level: logLevel,
      }),
    );
  }

  return createLogger({
    level: logLevel,
    defaultMeta: {
      app: 'nfc-payment-api',
      environment: process.env.NODE_ENV || 'development',
      pid: process.pid,
      hostname: require('os').hostname(),
    },
    format: format.combine(baseFormat, format.json()),
    transports: winstonTransports,
    exitOnError: false,
  });
}

// ─── NestJS logger module factory ────────────────────────────────────────────
export function createNestWinstonLogger() {
  return WinstonModule.createLogger({
    instance: createWinstonLogger(),
  });
}
