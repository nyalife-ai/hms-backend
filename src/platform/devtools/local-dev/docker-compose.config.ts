export type YamlScalar = string | number | boolean | null;
export type YamlValue =
  YamlScalar | readonly YamlValue[] | { readonly [key: string]: YamlValue };

export type DockerComposeConfig = {
  readonly services: {
    readonly [service: string]: {
      readonly image: string;
      readonly ports: readonly string[];
      readonly environment?: { readonly [name: string]: YamlScalar };
    };
  };
};

export function buildDockerComposeConfig(): DockerComposeConfig {
  return {
    services: {
      postgres: {
        image: 'postgres:16-alpine',
        ports: ['5432:5432'],
        environment: {
          POSTGRES_DB: 'app',
          POSTGRES_USER: 'app',
          POSTGRES_PASSWORD: 'app',
        },
      },
      redis: { image: 'redis:7-alpine', ports: ['6379:6379'] },
      broker: { image: 'rabbitmq:3-management-alpine', ports: ['5672:5672'] },
      prometheus: { image: 'prom/prometheus:latest', ports: ['9090:9090'] },
      grafana: { image: 'grafana/grafana:latest', ports: ['3000:3000'] },
    },
  };
}

export function serializeYaml(value: YamlValue): string {
  return `${serializeNode(value, 0).join('\n')}\n`;
}

function serializeNode(value: YamlValue, depth: number): string[] {
  const indentation = '  '.repeat(depth);
  if (isArray(value)) {
    if (value.length === 0) {
      return [`${indentation}[]`];
    }
    return value.flatMap((item): string[] => {
      if (isRecord(item) || isArray(item)) {
        const [first, ...rest] = serializeNode(item, depth + 1);
        return [`${indentation}- ${first.trimStart()}`, ...rest];
      }
      return [`${indentation}- ${serializeScalar(item)}`];
    });
  }
  if (isRecord(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0) {
      return [`${indentation}{}`];
    }
    return entries.flatMap(([key, child]): string[] => {
      if (isRecord(child) || isArray(child)) {
        return [`${indentation}${key}:`, ...serializeNode(child, depth + 1)];
      }
      return [`${indentation}${key}: ${serializeScalar(child)}`];
    });
  }
  return [`${indentation}${serializeScalar(value)}`];
}

function isRecord(
  value: YamlValue,
): value is { readonly [key: string]: YamlValue } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isArray(value: YamlValue): value is readonly YamlValue[] {
  return Array.isArray(value);
}

function serializeScalar(value: YamlScalar): string {
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  return String(value);
}
