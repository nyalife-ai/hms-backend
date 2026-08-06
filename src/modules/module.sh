#!/usr/bin/env bash
# =============================================================================
# NestJS Domain Module Scaffold Generator — Nyalife API reusable scaffold
# =============================================================================
#
# Usage (from repo root or src/modules):
#   ./module.sh <domain-name> [--force] [--dry-run] [--with-cqrs] [--help]
#   yarn module:generate <domain-name>
#
# Examples:
#   ./module.sh payment-sessions
#   ./module.sh catalog-items --with-cqrs --dry-run
#
# Architecture rules (generated modules MUST follow):
#   - src/core     — Entity, ValueObject, Result, Repository ports, CQRS,
#                    generateId, NotFoundException, DomainEvent (no Nest/ORM)
#   - src/platform — Api.PaginationService patterns; no infra drivers in domains
#   - src/shared   — utils / validators / helpers
#   - src/common   — Public decorator at ../../common/decorators/public.decorator
#   - Dual ORM     — Prisma + TypeORM via repository interface + factory provider
#                    Resolve: orm.type | ORM_TYPE | ORM_PROVIDER (default prisma)
#
# Generated layout (src/modules/<domain>/):
#   Root: *.module.ts, *.controller.ts, *.service.ts, index.ts, README.md
#   adapters/ constants/ dto(+__tests__) domain/(entity + value-objects/)
#   enums/ events/ guards/ handlers/ (with --with-cqrs) interceptors/ interfaces/
#   listeners/ mappers/ processors/ queues/ repositories/{prisma,typeorm}/
#   use-cases/ validators/ __tests__/
#
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_ROOT="${SCRIPT_DIR}"

if [[ -t 1 ]]; then
  C_RESET=$'\033[0m'; C_BOLD=$'\033[1m'; C_DIM=$'\033[2m'
  C_GREEN=$'\033[0;32m'; C_YELLOW=$'\033[0;33m'; C_RED=$'\033[0;31m'; C_CYAN=$'\033[0;36m'
else
  C_RESET=''; C_BOLD=''; C_DIM=''; C_GREEN=''; C_YELLOW=''; C_RED=''; C_CYAN=''
fi

log_info()  { printf '%s[*]%s %s\n' "$C_CYAN" "$C_RESET" "$*"; }
log_ok()    { printf '%s[ok]%s %s\n' "$C_GREEN" "$C_RESET" "$*"; }
log_warn()  { printf '%s[!]%s %s\n' "$C_YELLOW" "$C_RESET" "$*"; }
log_err()   { printf '%s[err]%s %s\n' "$C_RED" "$C_RESET" "$*" >&2; }

usage() {
  cat <<USAGE
NestJS domain module scaffold generator

Usage:
  $(basename "$0") <domain-name> [options]

Domain name: kebab-case (payment-sessions, orders, catalog-items)

Options:
  --force       Overwrite existing module directory
  --dry-run     List files without writing
  --with-cqrs   Add Command/Query + handler stubs (core/cqrs)
  --help        Show help

Environment:
  FORCE=1       Skip confirmation when using --force

Examples:
  yarn module:generate demo-items
  bash src/modules/module.sh orders --with-cqrs --dry-run
USAGE
}

normalize_kebab() {
  echo "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/[_[:space:]]+/-/g; s/([a-z0-9])([A-Z])/\1-\2/g' | tr '[:upper:]' '[:lower:]'
}

singularize() {
  local word="$1"
  if [[ "$word" =~ ies$ ]]; then echo "${word%ies}y"; return; fi
  if [[ "$word" =~ sses$ ]]; then echo "${word%ses}s"; return; fi
  if [[ "$word" =~ ([sxz]|ch|sh)es$ ]]; then echo "${word%es}"; return; fi
  if [[ "$word" =~ ses$ ]]; then echo "${word%es}"; return; fi
  if [[ "$word" =~ s$ ]] && [[ ! "$word" =~ ss$ ]]; then echo "${word%s}"; return; fi
  echo "$word"
}

to_pascal_from_kebab() {
  echo "$1" | awk -F- '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) substr($i,2)}1' OFS='' | tr -d ' '
}

to_camel_from_kebab() {
  local p; p="$(to_pascal_from_kebab "$1")"
  echo "$(tr '[:upper:]' '[:lower:]' <<< "${p:0:1}")${p:1}"
}

to_upper_snake() { echo "$1" | tr '-' '_' | tr '[:lower:]' '[:upper:]'; }

validate_domain() {
  if [[ ! "$1" =~ ^[a-z][a-z0-9]*(-[a-z0-9]+)*$ ]]; then
    log_err "Invalid domain '${1}'. Use kebab-case."
    exit 1
  fi
}

write_ts() {
  local relpath="$1"
  local purpose="$2"
  local dest="${TARGET_DIR}/${relpath}"
  if [[ "${DRY_RUN:-0}" == "1" ]]; then
    log_info "${C_DIM}[dry-run]${C_RESET} ${dest}"
    cat >/dev/null
    return 0
  fi
  mkdir -p "$(dirname "${dest}")"
  {
    printf '%s\n' "/**" " * File: $(basename "${dest}")" " * Module: ${DOMAIN}" " * Purpose: ${purpose}" " */" ""
    cat
  } > "${dest}"
}

DRY_RUN=0; WITH_CQRS=0; FORCE_FLAG=0; DOMAIN_INPUT=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --help|-h) usage; exit 0 ;;
    --dry-run) DRY_RUN=1; shift ;;
    --with-cqrs) WITH_CQRS=1; shift ;;
    --force) FORCE_FLAG=1; shift ;;
    -*) log_err "Unknown option: $1"; usage; exit 1 ;;
    *) [[ -z "${DOMAIN_INPUT}" ]] && DOMAIN_INPUT="$1" || { log_err "Unexpected: $1"; exit 1; }; shift ;;
  esac
done

[[ -n "${DOMAIN_INPUT}" ]] || { log_err "Domain name required."; usage; exit 1; }

DOMAIN="$(normalize_kebab "${DOMAIN_INPUT}")"
validate_domain "${DOMAIN}"
SINGULAR="$(singularize "${DOMAIN}")"
PASCAL="$(to_pascal_from_kebab "${DOMAIN}")"
SINGULAR_PASCAL="$(to_pascal_from_kebab "${SINGULAR}")"
CAMEL="$(to_camel_from_kebab "${DOMAIN}")"
SINGULAR_CAMEL="$(to_camel_from_kebab "${SINGULAR}")"
UPPER_SNAKE="$(to_upper_snake "${DOMAIN}")"
SINGULAR_UPPER_SNAKE="$(to_upper_snake "${SINGULAR}")"
ID_PREFIX="$(echo "${SINGULAR}" | tr '-' '_')"
TARGET_DIR="${TARGET_ROOT}/${DOMAIN}"

log_info "Scaffolding: ${C_BOLD}${DOMAIN}${C_RESET} → ${TARGET_DIR}"
log_info "  Pascal=${PASCAL}  Singular=${SINGULAR_PASCAL}  Token=${UPPER_SNAKE}_REPOSITORY"
[[ "${WITH_CQRS}" == "1" ]] && log_info "  CQRS: enabled"
[[ "${DRY_RUN}" == "1" ]] && log_warn "Dry-run — no writes"

if [[ -d "${TARGET_DIR}" ]]; then
  if [[ "${FORCE_FLAG}" == "1" || "${FORCE:-0}" == "1" ]]; then
    log_warn "Removing existing (--force): ${TARGET_DIR}"
    [[ "${DRY_RUN}" != "1" ]] && rm -rf "${TARGET_DIR}"
  else
    log_err "Exists: ${TARGET_DIR} — use --force or FORCE=1"
    exit 1
  fi
fi

MODULE_DIRS=(adapters constants dto dto/__tests__ domain domain/value-objects enums events guards
  interceptors interfaces listeners mappers processors queues repositories repositories/prisma
  repositories/typeorm use-cases validators __tests__)
[[ "${WITH_CQRS}" == "1" ]] && MODULE_DIRS+=(handlers)

if [[ "${DRY_RUN}" != "1" ]]; then
  for d in "${MODULE_DIRS[@]}"; do mkdir -p "${TARGET_DIR}/${d}"; done
  log_ok "Directories ready"
else
  for d in "${MODULE_DIRS[@]}"; do log_info "${C_DIM}[dry-run] mkdir${C_RESET} ${TARGET_DIR}/${d}"; done
fi

generate_module_files() {

write_ts "constants/${DOMAIN}.constants.ts" "Provider tokens, queue names, event constants." <<EOF
export const ${UPPER_SNAKE}_REPOSITORY = Symbol('${UPPER_SNAKE}_REPOSITORY');
export const ${UPPER_SNAKE}_SERVICE = Symbol('${UPPER_SNAKE}_SERVICE');

export const ${UPPER_SNAKE}_QUEUE = {
  NAME: '${DOMAIN}-queue',
  PROCESSORS: { PROCESS: 'process-${DOMAIN}' },
} as const;

export const ${UPPER_SNAKE}_EVENTS = {
  CREATED: '${DOMAIN}.created',
  UPDATED: '${DOMAIN}.updated',
  DELETED: '${DOMAIN}.deleted',
} as const;
EOF

write_ts "domain/value-objects/${SINGULAR}-name.vo.ts" "Value object for ${SINGULAR} name invariants." <<EOF
import { ValueObject } from '../../../core/domain';

export type ${SINGULAR_PASCAL}NameProps = { value: string };

export class ${SINGULAR_PASCAL}Name extends ValueObject<${SINGULAR_PASCAL}NameProps> {
  private constructor(props: ${SINGULAR_PASCAL}NameProps) {
    super(props);
  }

  public static create(raw: string): ${SINGULAR_PASCAL}Name {
    const trimmed = raw?.trim() ?? '';
    if (trimmed.length < 1 || trimmed.length > 255) {
      throw new Error('${SINGULAR_PASCAL} name must be 1-255 characters');
    }
    return new ${SINGULAR_PASCAL}Name({ value: trimmed });
  }

  public getValue(): string {
    return this.props.value;
  }

  protected validate(props: Readonly<${SINGULAR_PASCAL}NameProps>): void {
    if (!props.value?.trim()) throw new Error('${SINGULAR_PASCAL} name is required');
  }

  protected getEqualityComponents(): readonly unknown[] {
    return [this.props.value];
  }
}
EOF

write_ts "domain/${SINGULAR}.entity.ts" "Domain entity extending core Entity<string>." <<EOF
import { Entity } from '../../../core/domain';
import { generateId } from '../../../core/identity';
import { ${SINGULAR_PASCAL}Name } from './value-objects/${SINGULAR}-name.vo';

export type ${SINGULAR_PASCAL}Props = {
  name: ${SINGULAR_PASCAL}Name;
  description?: string;
};

export class ${SINGULAR_PASCAL} extends Entity<string> {
  private name: ${SINGULAR_PASCAL}Name;
  private description?: string;

  private constructor(
    id: string,
    props: ${SINGULAR_PASCAL}Props,
    createdAt: Date,
    updatedAt: Date,
  ) {
    super(id, createdAt, updatedAt);
    this.name = props.name;
    this.description = props.description;
  }

  public static create(input: { name: string; description?: string }): ${SINGULAR_PASCAL} {
    const now = new Date();
    return new ${SINGULAR_PASCAL}(
      generateId('${ID_PREFIX}'),
      {
        name: ${SINGULAR_PASCAL}Name.create(input.name),
        description: input.description,
      },
      now,
      now,
    );
  }

  public static reconstitute(
    id: string,
    props: ${SINGULAR_PASCAL}Props,
    createdAt: Date,
    updatedAt: Date,
  ): ${SINGULAR_PASCAL} {
    return new ${SINGULAR_PASCAL}(id, props, createdAt, updatedAt);
  }

  public getName(): ${SINGULAR_PASCAL}Name {
    return this.name;
  }

  public getDescription(): string | undefined {
    return this.description;
  }
}
EOF

write_ts "domain/index.ts" "Domain barrel exports." <<EOF
export * from './${SINGULAR}.entity';
export * from './value-objects/${SINGULAR}-name.vo';
EOF

write_ts "enums/${SINGULAR}-status.enum.ts" "${SINGULAR_PASCAL} lifecycle status." <<EOF
export enum ${SINGULAR_PASCAL}Status {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
}
EOF

write_ts "dto/create-${SINGULAR}.dto.ts" "Create ${SINGULAR} request DTO." <<EOF
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class Create${SINGULAR_PASCAL}Dto {
  @ApiProperty({ example: 'Sample ${SINGULAR_PASCAL}' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}
EOF

write_ts "dto/update-${SINGULAR}.dto.ts" "Update ${SINGULAR} request DTO." <<EOF
import { PartialType } from '@nestjs/swagger';
import { Create${SINGULAR_PASCAL}Dto } from './create-${SINGULAR}.dto';

export class Update${SINGULAR_PASCAL}Dto extends PartialType(Create${SINGULAR_PASCAL}Dto) {}
EOF

write_ts "dto/${DOMAIN}-query.dto.ts" "Pagination query DTO." <<EOF
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class ${PASCAL}QueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
EOF

write_ts "dto/${SINGULAR}-response.dto.ts" "${SINGULAR_PASCAL} response DTO." <<EOF
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ${SINGULAR_PASCAL}ResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional() description?: string;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
EOF

write_ts "dto/${DOMAIN}-paginated-response.dto.ts" "Paginated ${DOMAIN} list response." <<EOF
import { ApiProperty } from '@nestjs/swagger';
import { ${SINGULAR_PASCAL}ResponseDto } from './${SINGULAR}-response.dto';

export class ${PASCAL}PaginatedResponseDto {
  @ApiProperty({ type: [${SINGULAR_PASCAL}ResponseDto] })
  items!: ${SINGULAR_PASCAL}ResponseDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
}
EOF

write_ts "dto/index.ts" "DTO barrel." <<EOF
export * from './create-${SINGULAR}.dto';
export * from './update-${SINGULAR}.dto';
export * from './${DOMAIN}-query.dto';
export * from './${SINGULAR}-response.dto';
export * from './${DOMAIN}-paginated-response.dto';
EOF

write_ts "dto/__tests__/create-${SINGULAR}.dto.spec.ts" "DTO validation smoke tests." <<EOF
import { validate } from 'class-validator';
import { Create${SINGULAR_PASCAL}Dto } from '../create-${SINGULAR}.dto';

describe('Create${SINGULAR_PASCAL}Dto', () => {
  it('validates a good payload', async () => {
    const dto = Object.assign(new Create${SINGULAR_PASCAL}Dto(), { name: 'ok' });
    expect(await validate(dto)).toHaveLength(0);
  });
});
EOF


write_ts "interfaces/${SINGULAR}-repository.interface.ts" "Repository port (core Repository + pagination)." <<EOF
import type { Repository } from '../../../core/contracts';
import type { ${SINGULAR_PASCAL} } from '../domain/${SINGULAR}.entity';
import type { ${PASCAL}QueryDto } from '../dto';

export type ${SINGULAR_PASCAL}Page = { items: ${SINGULAR_PASCAL}[]; total: number };

export interface I${SINGULAR_PASCAL}Repository extends Repository<${SINGULAR_PASCAL}, string> {
  findMany(query: ${PASCAL}QueryDto): Promise<${SINGULAR_PASCAL}Page>;
  softDelete(id: string): Promise<void>;
}
EOF

write_ts "interfaces/index.ts" "Interface barrel." <<EOF
export * from './${SINGULAR}-repository.interface';
EOF

write_ts "mappers/${SINGULAR}.mapper.ts" "Entity ↔ DTO mapper." <<EOF
import type { ${SINGULAR_PASCAL} } from '../domain/${SINGULAR}.entity';
import type { ${SINGULAR_PASCAL}ResponseDto } from '../dto';

export class ${SINGULAR_PASCAL}Mapper {
  public static toResponse(entity: ${SINGULAR_PASCAL}): ${SINGULAR_PASCAL}ResponseDto {
    return {
      id: entity.getId(),
      name: entity.getName().getValue(),
      description: entity.getDescription(),
      createdAt: entity.getCreatedAt(),
      updatedAt: entity.getUpdatedAt(),
    };
  }

  public static toResponseList(items: readonly ${SINGULAR_PASCAL}[]): ${SINGULAR_PASCAL}ResponseDto[] {
    return items.map((e) => this.toResponse(e));
  }
}
EOF

write_ts "events/${DOMAIN}.events.ts" "Event payload classes." <<EOF
import { ${UPPER_SNAKE}_EVENTS } from '../constants/${DOMAIN}.constants';

export class ${SINGULAR_PASCAL}CreatedEvent {
  public static readonly name = ${UPPER_SNAKE}_EVENTS.CREATED;
  public constructor(public readonly ${SINGULAR_CAMEL}Id: string, public readonly occurredAt = new Date()) {}
}

export class ${SINGULAR_PASCAL}UpdatedEvent {
  public static readonly name = ${UPPER_SNAKE}_EVENTS.UPDATED;
  public constructor(public readonly ${SINGULAR_CAMEL}Id: string, public readonly occurredAt = new Date()) {}
}

export class ${SINGULAR_PASCAL}DeletedEvent {
  public static readonly name = ${UPPER_SNAKE}_EVENTS.DELETED;
  public constructor(public readonly ${SINGULAR_CAMEL}Id: string, public readonly occurredAt = new Date()) {}
}
EOF

write_ts "events/index.ts" "Events barrel." <<EOF
export * from './${DOMAIN}.events';
EOF

write_ts "listeners/${DOMAIN}.listener.ts" "@OnEvent listeners for ${DOMAIN}." <<EOF
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ${UPPER_SNAKE}_EVENTS } from '../constants/${DOMAIN}.constants';
import { ${SINGULAR_PASCAL}CreatedEvent, ${SINGULAR_PASCAL}DeletedEvent, ${SINGULAR_PASCAL}UpdatedEvent } from '../events';

@Injectable()
export class ${PASCAL}Listener {
  private readonly logger = new Logger(${PASCAL}Listener.name);

  @OnEvent(${UPPER_SNAKE}_EVENTS.CREATED)
  onCreated(event: ${SINGULAR_PASCAL}CreatedEvent): void {
    this.logger.log(\`${SINGULAR} created: \${event.${SINGULAR_CAMEL}Id}\`);
  }

  @OnEvent(${UPPER_SNAKE}_EVENTS.UPDATED)
  onUpdated(event: ${SINGULAR_PASCAL}UpdatedEvent): void {
    this.logger.log(\`${SINGULAR} updated: \${event.${SINGULAR_CAMEL}Id}\`);
  }

  @OnEvent(${UPPER_SNAKE}_EVENTS.DELETED)
  onDeleted(event: ${SINGULAR_PASCAL}DeletedEvent): void {
    this.logger.log(\`${SINGULAR} deleted: \${event.${SINGULAR_CAMEL}Id}\`);
  }
}
EOF

write_ts "repositories/typeorm/${SINGULAR}.orm-entity.ts" "TypeORM persistence entity." <<EOF
import { Column, CreateDateColumn, DeleteDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: '${DOMAIN}' })
export class ${SINGULAR_PASCAL}OrmEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column({ type: 'varchar', length: 255 }) name!: string;
  @Column({ type: 'text', nullable: true }) description!: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt!: Date;
  @DeleteDateColumn({ type: 'timestamptz', nullable: true }) deletedAt!: Date | null;
}
EOF

write_ts "repositories/prisma/prisma-${SINGULAR}.repository.ts" "Prisma repository adapter." <<EOF
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma/prisma.service';
import type { Create${SINGULAR_PASCAL}Dto, ${PASCAL}QueryDto, Update${SINGULAR_PASCAL}Dto } from '../../dto';
import { ${SINGULAR_PASCAL} } from '../../domain/${SINGULAR}.entity';
import { ${SINGULAR_PASCAL}Name } from '../../domain/value-objects/${SINGULAR}-name.vo';
import type { I${SINGULAR_PASCAL}Repository, ${SINGULAR_PASCAL}Page } from '../../interfaces/${SINGULAR}-repository.interface';

@Injectable()
export class Prisma${SINGULAR_PASCAL}Repository implements I${SINGULAR_PASCAL}Repository {
  public constructor(private readonly prisma: PrismaService) {}

  public async save(entity: ${SINGULAR_PASCAL}): Promise<${SINGULAR_PASCAL}> {
    void this.prisma;
    void entity;
    throw new Error('Implement Prisma${SINGULAR_PASCAL}Repository.save after adding Prisma model');
  }

  public async delete(id: string): Promise<void> {
    void id;
    throw new Error('Not implemented');
  }

  public async findById(id: string): Promise<${SINGULAR_PASCAL} | null> {
    void id;
    return null;
  }

  public async findAll(): Promise<${SINGULAR_PASCAL}[]> {
    return [];
  }

  public async exists(id: string): Promise<boolean> {
    return (await this.findById(id)) !== null;
  }

  public async findMany(query: ${PASCAL}QueryDto): Promise<${SINGULAR_PASCAL}Page> {
    void query;
    return { items: [], total: 0 };
  }

  public async softDelete(id: string): Promise<void> {
    void id;
    throw new Error('Not implemented');
  }

  protected toDomain(row: {
    id: string;
    name: string;
    description: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): ${SINGULAR_PASCAL} {
    return ${SINGULAR_PASCAL}.reconstitute(
      row.id,
      { name: ${SINGULAR_PASCAL}Name.create(row.name), description: row.description ?? undefined },
      row.createdAt,
      row.updatedAt,
    );
  }
}
EOF


write_ts "repositories/typeorm/typeorm-${SINGULAR}.repository.ts" "TypeORM repository adapter." <<EOF
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import type { Create${SINGULAR_PASCAL}Dto, ${PASCAL}QueryDto, Update${SINGULAR_PASCAL}Dto } from '../../dto';
import { ${SINGULAR_PASCAL} } from '../../domain/${SINGULAR}.entity';
import { ${SINGULAR_PASCAL}Name } from '../../domain/value-objects/${SINGULAR}-name.vo';
import type { I${SINGULAR_PASCAL}Repository, ${SINGULAR_PASCAL}Page } from '../../interfaces/${SINGULAR}-repository.interface';
import { ${SINGULAR_PASCAL}OrmEntity } from './${SINGULAR}.orm-entity';

@Injectable()
export class TypeOrm${SINGULAR_PASCAL}Repository implements I${SINGULAR_PASCAL}Repository {
  public constructor(
    @InjectRepository(${SINGULAR_PASCAL}OrmEntity)
    private readonly repo: Repository<${SINGULAR_PASCAL}OrmEntity>,
  ) {}

  public async save(entity: ${SINGULAR_PASCAL}): Promise<${SINGULAR_PASCAL}> {
    const row = this.repo.create({
      id: entity.getId(),
      name: entity.getName().getValue(),
      description: entity.getDescription() ?? null,
      createdAt: entity.getCreatedAt(),
      updatedAt: entity.getUpdatedAt(),
    });
    return this.toDomain(await this.repo.save(row));
  }

  public async delete(id: string): Promise<void> {
    await this.repo.delete(id);
  }

  public async findById(id: string): Promise<${SINGULAR_PASCAL} | null> {
    const row = await this.repo.findOne({ where: { id, deletedAt: IsNull() } });
    return row ? this.toDomain(row) : null;
  }

  public async findAll(): Promise<${SINGULAR_PASCAL}[]> {
    const rows = await this.repo.find({ where: { deletedAt: IsNull() } });
    return rows.map((r) => this.toDomain(r));
  }

  public async exists(id: string): Promise<boolean> {
    return (await this.repo.count({ where: { id, deletedAt: IsNull() } })) > 0;
  }

  public async findMany(query: ${PASCAL}QueryDto): Promise<${SINGULAR_PASCAL}Page> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [rows, total] = await this.repo.findAndCount({
      where: { deletedAt: IsNull() },
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });
    return { items: rows.map((r) => this.toDomain(r)), total };
  }

  public async softDelete(id: string): Promise<void> {
    await this.repo.softDelete(id);
  }

  private toDomain(row: ${SINGULAR_PASCAL}OrmEntity): ${SINGULAR_PASCAL} {
    return ${SINGULAR_PASCAL}.reconstitute(
      row.id,
      { name: ${SINGULAR_PASCAL}Name.create(row.name), description: row.description ?? undefined },
      row.createdAt,
      row.updatedAt,
    );
  }
}
EOF

write_ts "repositories/${DOMAIN}.repository.ts" "ORM factory provider (${SINGULAR_PASCAL}RepositoryProvider)." <<EOF
import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { ${UPPER_SNAKE}_REPOSITORY } from '../constants/${DOMAIN}.constants';
import { Prisma${SINGULAR_PASCAL}Repository } from './prisma/prisma-${SINGULAR}.repository';
import { TypeOrm${SINGULAR_PASCAL}Repository } from './typeorm/typeorm-${SINGULAR}.repository';

export function resolveOrmType(config: ConfigService): 'prisma' | 'typeorm' {
  const raw =
    config.get<string>('orm.type') ??
    config.get<string>('ORM_TYPE') ??
    config.get<string>('ORM_PROVIDER') ??
    'prisma';
  const normalized = raw.toLowerCase();
  if (normalized === 'prisma' || normalized === 'typeorm') return normalized;
  throw new Error(\`Unsupported ORM "\${raw}" — expected prisma or typeorm\`);
}

export const ${SINGULAR_PASCAL}RepositoryProvider: Provider = {
  provide: ${UPPER_SNAKE}_REPOSITORY,
  inject: [
    ConfigService,
    PrismaService,
    { token: TypeOrm${SINGULAR_PASCAL}Repository, optional: true },
  ],
  useFactory: (
    config: ConfigService,
    prisma: PrismaService,
    typeOrmRepo?: TypeOrm${SINGULAR_PASCAL}Repository,
  ) => {
    const orm = resolveOrmType(config);
    if (orm === 'prisma') {
      return new Prisma${SINGULAR_PASCAL}Repository(prisma);
    }
    if (!typeOrmRepo) {
      throw new Error(
        'ORM_PROVIDER=typeorm but TypeOrm${SINGULAR_PASCAL}Repository is not registered. Import TypeOrmModule.forFeature in ${PASCAL}Module.',
      );
    }
    return typeOrmRepo;
  },
};
EOF

write_ts "use-cases/create-${SINGULAR}.usecase.ts" "Create ${SINGULAR} use-case." <<EOF
import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import type { Create${SINGULAR_PASCAL}Dto } from '../dto';
import { ${SINGULAR_PASCAL} } from '../domain/${SINGULAR}.entity';
import { ${UPPER_SNAKE}_REPOSITORY } from '../constants/${DOMAIN}.constants';
import type { I${SINGULAR_PASCAL}Repository } from '../interfaces/${SINGULAR}-repository.interface';

@Injectable()
export class Create${SINGULAR_PASCAL}UseCase {
  public constructor(
    @Inject(${UPPER_SNAKE}_REPOSITORY) private readonly repository: I${SINGULAR_PASCAL}Repository,
  ) {}

  public async execute(dto: Create${SINGULAR_PASCAL}Dto): Promise<Result<${SINGULAR_PASCAL}, string>> {
    try {
      const entity = ${SINGULAR_PASCAL}.create({ name: dto.name, description: dto.description });
      const saved = await this.repository.save(entity);
      return Result.success(saved);
    } catch (err) {
      return Result.failure(err instanceof Error ? err.message : 'Create failed');
    }
  }
}
EOF

write_ts "use-cases/find-${SINGULAR}-by-id.usecase.ts" "Find ${SINGULAR} by id." <<EOF
import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import { NotFoundException } from '../../../core/exceptions';
import { ${UPPER_SNAKE}_REPOSITORY } from '../constants/${DOMAIN}.constants';
import type { ${SINGULAR_PASCAL} } from '../domain/${SINGULAR}.entity';
import type { I${SINGULAR_PASCAL}Repository } from '../interfaces/${SINGULAR}-repository.interface';

@Injectable()
export class Find${SINGULAR_PASCAL}ByIdUseCase {
  public constructor(
    @Inject(${UPPER_SNAKE}_REPOSITORY) private readonly repository: I${SINGULAR_PASCAL}Repository,
  ) {}

  public async execute(id: string): Promise<Result<${SINGULAR_PASCAL}, NotFoundException>> {
    const entity = await this.repository.findById(id);
    if (!entity) {
      return Result.failure(new NotFoundException('${SINGULAR_PASCAL}', id));
    }
    return Result.success(entity);
  }
}
EOF

write_ts "use-cases/find-all-${DOMAIN}.usecase.ts" "Paginated list of ${DOMAIN}." <<EOF
import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import type { ${PASCAL}QueryDto } from '../dto';
import { ${UPPER_SNAKE}_REPOSITORY } from '../constants/${DOMAIN}.constants';
import type { I${SINGULAR_PASCAL}Repository, ${SINGULAR_PASCAL}Page } from '../interfaces/${SINGULAR}-repository.interface';

@Injectable()
export class FindAll${PASCAL}UseCase {
  public constructor(
    @Inject(${UPPER_SNAKE}_REPOSITORY) private readonly repository: I${SINGULAR_PASCAL}Repository,
  ) {}

  public async execute(query: ${PASCAL}QueryDto): Promise<Result<${SINGULAR_PASCAL}Page, string>> {
    try {
      const page = await this.repository.findMany(query);
      return Result.success(page);
    } catch (err) {
      return Result.failure(err instanceof Error ? err.message : 'List failed');
    }
  }
}
EOF

write_ts "use-cases/update-${SINGULAR}.usecase.ts" "Update ${SINGULAR}." <<EOF
import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import { NotFoundException } from '../../../core/exceptions';
import type { Update${SINGULAR_PASCAL}Dto } from '../dto';
import { ${SINGULAR_PASCAL}Name } from '../domain/value-objects/${SINGULAR}-name.vo';
import { ${UPPER_SNAKE}_REPOSITORY } from '../constants/${DOMAIN}.constants';
import type { ${SINGULAR_PASCAL} } from '../domain/${SINGULAR}.entity';
import type { I${SINGULAR_PASCAL}Repository } from '../interfaces/${SINGULAR}-repository.interface';

@Injectable()
export class Update${SINGULAR_PASCAL}UseCase {
  public constructor(
    @Inject(${UPPER_SNAKE}_REPOSITORY) private readonly repository: I${SINGULAR_PASCAL}Repository,
  ) {}

  public async execute(id: string, dto: Update${SINGULAR_PASCAL}Dto): Promise<Result<${SINGULAR_PASCAL}, NotFoundException | string>> {
    const existing = await this.repository.findById(id);
    if (!existing) {
      return Result.failure(new NotFoundException('${SINGULAR_PASCAL}', id));
    }
    try {
      const next = ${SINGULAR_PASCAL}.reconstitute(
        existing.getId(),
        {
          name: dto.name ? ${SINGULAR_PASCAL}Name.create(dto.name) : existing.getName(),
          description: dto.description ?? existing.getDescription(),
        },
        existing.getCreatedAt(),
        new Date(),
      );
      const saved = await this.repository.save(next);
      return Result.success(saved);
    } catch (err) {
      return Result.failure(err instanceof Error ? err.message : 'Update failed');
    }
  }
}
EOF

write_ts "use-cases/soft-delete-${SINGULAR}.usecase.ts" "Soft-delete ${SINGULAR}." <<EOF
import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../core/contracts';
import { NotFoundException } from '../../../core/exceptions';
import { ${UPPER_SNAKE}_REPOSITORY } from '../constants/${DOMAIN}.constants';
import type { I${SINGULAR_PASCAL}Repository } from '../interfaces/${SINGULAR}-repository.interface';

@Injectable()
export class SoftDelete${SINGULAR_PASCAL}UseCase {
  public constructor(
    @Inject(${UPPER_SNAKE}_REPOSITORY) private readonly repository: I${SINGULAR_PASCAL}Repository,
  ) {}

  public async execute(id: string): Promise<Result<void, NotFoundException>> {
    if (!(await this.repository.exists(id))) {
      return Result.failure(new NotFoundException('${SINGULAR_PASCAL}', id));
    }
    await this.repository.softDelete(id);
    return Result.success(undefined);
  }
}
EOF

write_ts "use-cases/index.ts" "Use-case barrel." <<EOF
export * from './create-${SINGULAR}.usecase';
export * from './find-${SINGULAR}-by-id.usecase';
export * from './find-all-${DOMAIN}.usecase';
export * from './update-${SINGULAR}.usecase';
export * from './soft-delete-${SINGULAR}.usecase';
EOF


write_ts "${DOMAIN}.service.ts" "Application service orchestrating use-cases." <<EOF
import {
  ConflictException,
  Injectable,
  NotFoundException as HttpNotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Result } from '../../core/contracts';
import { BaseApplicationException, NotFoundException } from '../../core/exceptions';
import { PaginationService } from '../../platform/api/pagination/pagination.service';
import type { Create${SINGULAR_PASCAL}Dto, ${PASCAL}QueryDto, Update${SINGULAR_PASCAL}Dto } from './dto';
import { ${SINGULAR_PASCAL}Mapper } from './mappers/${SINGULAR}.mapper';
import { ${UPPER_SNAKE}_EVENTS } from './constants/${DOMAIN}.constants';
import { ${SINGULAR_PASCAL}CreatedEvent, ${SINGULAR_PASCAL}DeletedEvent, ${SINGULAR_PASCAL}UpdatedEvent } from './events';
import { Create${SINGULAR_PASCAL}UseCase } from './use-cases/create-${SINGULAR}.usecase';
import { Find${SINGULAR_PASCAL}ByIdUseCase } from './use-cases/find-${SINGULAR}-by-id.usecase';
import { FindAll${PASCAL}UseCase } from './use-cases/find-all-${DOMAIN}.usecase';
import { Update${SINGULAR_PASCAL}UseCase } from './use-cases/update-${SINGULAR}.usecase';
import { SoftDelete${SINGULAR_PASCAL}UseCase } from './use-cases/soft-delete-${SINGULAR}.usecase';

@Injectable()
export class ${PASCAL}Service {
  private readonly pagination = new PaginationService();

  public constructor(
    private readonly createUseCase: Create${SINGULAR_PASCAL}UseCase,
    private readonly findByIdUseCase: Find${SINGULAR_PASCAL}ByIdUseCase,
    private readonly findAllUseCase: FindAll${PASCAL}UseCase,
    private readonly updateUseCase: Update${SINGULAR_PASCAL}UseCase,
    private readonly softDeleteUseCase: SoftDelete${SINGULAR_PASCAL}UseCase,
    private readonly events: EventEmitter2,
  ) {}

  public async create(dto: Create${SINGULAR_PASCAL}Dto) {
    const result = await this.createUseCase.execute(dto);
    const entity = this.unwrap(result);
    this.events.emit(${UPPER_SNAKE}_EVENTS.CREATED, new ${SINGULAR_PASCAL}CreatedEvent(entity.getId()));
    return ${SINGULAR_PASCAL}Mapper.toResponse(entity);
  }

  public async findById(id: string) {
    const result = await this.findByIdUseCase.execute(id);
    return ${SINGULAR_PASCAL}Mapper.toResponse(this.unwrap(result));
  }

  public async findAll(query: ${PASCAL}QueryDto) {
    const normalized = this.pagination.normalizeOffset({
      page: query.page,
      limit: query.limit,
    });
    const result = await this.findAllUseCase.execute({ ...query, ...normalized });
    const page = this.unwrap(result);
    const built = this.pagination.buildResult(${SINGULAR_PASCAL}Mapper.toResponseList(page.items), {
      total: page.total,
      page: normalized.page,
      limit: normalized.limit,
    });
    return built;
  }

  public async update(id: string, dto: Update${SINGULAR_PASCAL}Dto) {
    const result = await this.updateUseCase.execute(id, dto);
    const entity = this.unwrap(result);
    this.events.emit(${UPPER_SNAKE}_EVENTS.UPDATED, new ${SINGULAR_PASCAL}UpdatedEvent(entity.getId()));
    return ${SINGULAR_PASCAL}Mapper.toResponse(entity);
  }

  public async softDelete(id: string): Promise<void> {
    const result = await this.softDeleteUseCase.execute(id);
    this.unwrap(result);
    this.events.emit(${UPPER_SNAKE}_EVENTS.DELETED, new ${SINGULAR_PASCAL}DeletedEvent(id));
  }

  private unwrap<T, E>(result: Result<T, E>): T {
    if (result.isSuccess()) return result.getValue();
    const err = result.getError();
    if (err instanceof NotFoundException) {
      throw new HttpNotFoundException(err.message);
    }
    if (err instanceof BaseApplicationException) {
      throw new UnprocessableEntityException(err.message);
    }
    throw new ConflictException(String(err));
  }
}
EOF

write_ts "${DOMAIN}.controller.ts" "HTTP controller with Swagger + pagination query." <<EOF
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
// import { Public } from '../../common/decorators/public.decorator';
import type { Create${SINGULAR_PASCAL}Dto, ${PASCAL}QueryDto, Update${SINGULAR_PASCAL}Dto } from './dto';
import { ${PASCAL}Service } from './${DOMAIN}.service';

@ApiTags('${PASCAL}')
@Controller('${DOMAIN}')
export class ${PASCAL}Controller {
  public constructor(private readonly service: ${PASCAL}Service) {}

  @Post()
  @ApiOperation({ summary: 'Create ${SINGULAR}' })
  create(@Body() dto: Create${SINGULAR_PASCAL}Dto) {
    return this.service.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List ${DOMAIN} (paginated)' })
  // @Public()
  findAll(@Query() query: ${PASCAL}QueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get ${SINGULAR} by id' })
  findOne(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update ${SINGULAR}' })
  update(@Param('id') id: string, @Body() dto: Update${SINGULAR_PASCAL}Dto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete ${SINGULAR}' })
  remove(@Param('id') id: string) {
    return this.service.softDelete(id);
  }
}
EOF

write_ts "${DOMAIN}.module.ts" "Nest module wiring repository factory and use-cases." <<EOF
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ${UPPER_SNAKE}_REPOSITORY } from './constants/${DOMAIN}.constants';
import { ${PASCAL}Controller } from './${DOMAIN}.controller';
import { ${PASCAL}Service } from './${DOMAIN}.service';
import { ${PASCAL}Listener } from './listeners/${DOMAIN}.listener';
import { ${SINGULAR_PASCAL}RepositoryProvider } from './repositories/${DOMAIN}.repository';
import { Prisma${SINGULAR_PASCAL}Repository } from './repositories/prisma/prisma-${SINGULAR}.repository';
import { TypeOrm${SINGULAR_PASCAL}Repository } from './repositories/typeorm/typeorm-${SINGULAR}.repository';
import { ${SINGULAR_PASCAL}OrmEntity } from './repositories/typeorm/${SINGULAR}.orm-entity';
import { Create${SINGULAR_PASCAL}UseCase } from './use-cases/create-${SINGULAR}.usecase';
import { Find${SINGULAR_PASCAL}ByIdUseCase } from './use-cases/find-${SINGULAR}-by-id.usecase';
import { FindAll${PASCAL}UseCase } from './use-cases/find-all-${DOMAIN}.usecase';
import { Update${SINGULAR_PASCAL}UseCase } from './use-cases/update-${SINGULAR}.usecase';
import { SoftDelete${SINGULAR_PASCAL}UseCase } from './use-cases/soft-delete-${SINGULAR}.usecase';

@Module({
  imports: [
    // Register TypeORM entity when ORM_PROVIDER=typeorm:
    TypeOrmModule.forFeature([${SINGULAR_PASCAL}OrmEntity]),
  ],
  controllers: [${PASCAL}Controller],
  providers: [
    ${PASCAL}Service,
    ${PASCAL}Listener,
    ${SINGULAR_PASCAL}RepositoryProvider,
    Prisma${SINGULAR_PASCAL}Repository,
    TypeOrm${SINGULAR_PASCAL}Repository,
    Create${SINGULAR_PASCAL}UseCase,
    Find${SINGULAR_PASCAL}ByIdUseCase,
    FindAll${PASCAL}UseCase,
    Update${SINGULAR_PASCAL}UseCase,
    SoftDelete${SINGULAR_PASCAL}UseCase,
  ],
  exports: [${PASCAL}Service, ${UPPER_SNAKE}_REPOSITORY],
})
export class ${PASCAL}Module {}
EOF

write_ts "adapters/${SINGULAR}.adapter.ts" "Outbound adapter stub (no infra drivers in domain)." <<EOF
import { Injectable, Logger } from '@nestjs/common';

export interface I${SINGULAR_PASCAL}OutboundPort {
  ping(): Promise<boolean>;
}

@Injectable()
export class ${SINGULAR_PASCAL}Adapter implements I${SINGULAR_PASCAL}OutboundPort {
  private readonly logger = new Logger(${SINGULAR_PASCAL}Adapter.name);

  public async ping(): Promise<boolean> {
    this.logger.debug('${SINGULAR_PASCAL}Adapter.ping — wire external integration here');
    return true;
  }
}
EOF

write_ts "guards/${SINGULAR}-access.guard.ts" "Placeholder access guard for ${SINGULAR} routes." <<EOF
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

@Injectable()
export class ${SINGULAR_PASCAL}AccessGuard implements CanActivate {
  public canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ user?: unknown }>();
    if (!req.user) throw new ForbiddenException('Authentication required');
    return true;
  }
}
EOF

write_ts "interceptors/${DOMAIN}.logging.interceptor.ts" "Request logging interceptor stub." <<EOF
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';

@Injectable()
export class ${PASCAL}LoggingInterceptor implements NestInterceptor {
  public intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const started = Date.now();
    const req = context.switchToHttp().getRequest<{ method?: string; url?: string }>();
    return next.handle().pipe(
      tap(() => {
        const ms = Date.now() - started;
        console.debug(\`[${PASCAL}] \${req.method ?? '?'} \${req.url ?? ''} \${ms}ms\`);
      }),
    );
  }
}
EOF

write_ts "processors/${DOMAIN}.processor.ts" "Bull queue processor stub." <<EOF
import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { ${UPPER_SNAKE}_QUEUE } from '../constants/${DOMAIN}.constants';

@Processor(${UPPER_SNAKE}_QUEUE.NAME)
export class ${PASCAL}Processor {
  private readonly logger = new Logger(${PASCAL}Processor.name);

  @Process(${UPPER_SNAKE}_QUEUE.PROCESSORS.PROCESS)
  public async handle(job: Job<unknown>): Promise<void> {
    this.logger.log(\`Processing job \${job.id}\`);
  }
}
EOF

write_ts "queues/${DOMAIN}.queue.ts" "Queue helper stub." <<EOF
import { InjectQueue } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bull';
import { ${UPPER_SNAKE}_QUEUE } from '../constants/${DOMAIN}.constants';

@Injectable()
export class ${PASCAL}QueueService {
  public constructor(@InjectQueue(${UPPER_SNAKE}_QUEUE.NAME) private readonly queue: Queue) {}

  public async enqueueProcess(payload: unknown): Promise<void> {
    await this.queue.add(${UPPER_SNAKE}_QUEUE.PROCESSORS.PROCESS, payload);
  }
}
EOF

write_ts "validators/${SINGULAR}.validator.ts" "Domain validation helper stub." <<EOF
import { Injectable } from '@nestjs/common';

@Injectable()
export class ${SINGULAR_PASCAL}Validator {
  public assertValidName(name: string): void {
    if (!name?.trim()) {
      throw new Error('Name is required');
    }
  }
}
EOF


if [[ "${WITH_CQRS}" == "1" ]]; then
  write_ts "handlers/create-${SINGULAR}.command.ts" "CQRS command to create ${SINGULAR}." <<EOF
import { BaseCommand } from '../../../core/cqrs';
import type { Create${SINGULAR_PASCAL}Dto } from '../dto';

export class Create${SINGULAR_PASCAL}Command extends BaseCommand {
  public readonly commandName = 'Create${SINGULAR_PASCAL}';

  public constructor(public readonly payload: Create${SINGULAR_PASCAL}Dto) {
    super();
  }
}
EOF

  write_ts "handlers/create-${SINGULAR}.command-handler.ts" "CQRS handler for Create${SINGULAR_PASCAL}Command." <<EOF
import { Injectable } from '@nestjs/common';
import type { CommandHandler } from '../../../core/cqrs';
import { Create${SINGULAR_PASCAL}Command } from './create-${SINGULAR}.command';
import { Create${SINGULAR_PASCAL}UseCase } from '../use-cases/create-${SINGULAR}.usecase';
import type { ${SINGULAR_PASCAL} } from '../domain/${SINGULAR}.entity';
import { Result } from '../../../core/contracts';

@Injectable()
export class Create${SINGULAR_PASCAL}CommandHandler
  implements CommandHandler<Create${SINGULAR_PASCAL}Command, Result<${SINGULAR_PASCAL}, string>>
{
  public readonly commandType = Create${SINGULAR_PASCAL}Command.name;

  public constructor(private readonly useCase: Create${SINGULAR_PASCAL}UseCase) {}

  public execute(command: Create${SINGULAR_PASCAL}Command) {
    return this.useCase.execute(command.payload);
  }
}
EOF

  write_ts "handlers/find-${SINGULAR}-by-id.query.ts" "CQRS query to load ${SINGULAR} by id." <<EOF
import { BaseQuery } from '../../../core/cqrs';

export class Find${SINGULAR_PASCAL}ByIdQuery extends BaseQuery {
  public readonly queryName = 'Find${SINGULAR_PASCAL}ById';

  public constructor(public readonly id: string) {
    super();
  }
}
EOF

  write_ts "handlers/find-${SINGULAR}-by-id.query-handler.ts" "CQRS handler for Find${SINGULAR_PASCAL}ByIdQuery." <<EOF
import { Injectable } from '@nestjs/common';
import type { QueryHandler } from '../../../core/cqrs';
import { NotFoundException } from '../../../core/exceptions';
import type { ${SINGULAR_PASCAL} } from '../domain/${SINGULAR}.entity';
import { Result } from '../../../core/contracts';
import { Find${SINGULAR_PASCAL}ByIdUseCase } from '../use-cases/find-${SINGULAR}-by-id.usecase';
import { Find${SINGULAR_PASCAL}ByIdQuery } from './find-${SINGULAR}-by-id.query';

@Injectable()
export class Find${SINGULAR_PASCAL}ByIdQueryHandler
  implements QueryHandler<Find${SINGULAR_PASCAL}ByIdQuery, Result<${SINGULAR_PASCAL}, NotFoundException>>
{
  public readonly queryType = Find${SINGULAR_PASCAL}ByIdQuery.name;

  public constructor(private readonly useCase: Find${SINGULAR_PASCAL}ByIdUseCase) {}

  public execute(query: Find${SINGULAR_PASCAL}ByIdQuery) {
    return this.useCase.execute(query.id);
  }
}
EOF

  write_ts "handlers/index.ts" "CQRS handler barrel." <<EOF
export * from './create-${SINGULAR}.command';
export * from './create-${SINGULAR}.command-handler';
export * from './find-${SINGULAR}-by-id.query';
export * from './find-${SINGULAR}-by-id.query-handler';
EOF
fi

write_ts "__tests__/${DOMAIN}.service.spec.ts" "Service smoke unit tests." <<EOF
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ${PASCAL}Service } from '../${DOMAIN}.service';
import { Create${SINGULAR_PASCAL}UseCase } from '../use-cases/create-${SINGULAR}.usecase';
import { Find${SINGULAR_PASCAL}ByIdUseCase } from '../use-cases/find-${SINGULAR}-by-id.usecase';
import { FindAll${PASCAL}UseCase } from '../use-cases/find-all-${DOMAIN}.usecase';
import { Update${SINGULAR_PASCAL}UseCase } from '../use-cases/update-${SINGULAR}.usecase';
import { SoftDelete${SINGULAR_PASCAL}UseCase } from '../use-cases/soft-delete-${SINGULAR}.usecase';
import { Result } from '../../../core/contracts';

describe('${PASCAL}Service', () => {
  let service: ${PASCAL}Service;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ${PASCAL}Service,
        { provide: Create${SINGULAR_PASCAL}UseCase, useValue: { execute: jest.fn() } },
        {
          provide: Find${SINGULAR_PASCAL}ByIdUseCase,
          useValue: { execute: jest.fn().mockResolvedValue(Result.failure('missing')) },
        },
        {
          provide: FindAll${PASCAL}UseCase,
          useValue: { execute: jest.fn().mockResolvedValue(Result.success({ items: [], total: 0 })) },
        },
        { provide: Update${SINGULAR_PASCAL}UseCase, useValue: { execute: jest.fn() } },
        { provide: SoftDelete${SINGULAR_PASCAL}UseCase, useValue: { execute: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = module.get(${PASCAL}Service);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('findAll returns paginated payload', async () => {
    const res = await service.findAll({ page: 1, limit: 10 });
    expect(res.total).toBe(0);
    expect(res.items).toEqual([]);
  });
});
EOF

write_ts "index.ts" "Public module barrel exports." <<EOF
export * from './${DOMAIN}.module';
export * from './${DOMAIN}.service';
export * from './constants/${DOMAIN}.constants';
export * from './domain';
export * from './dto';
export * from './interfaces';
EOF

write_ts "README.md" "Next steps for the generated ${DOMAIN} module." <<EOF
# ${PASCAL} module

Generated by \`src/modules/module.sh\`. This is a **scaffold** — implement persistence and business rules next.

## Layout

- \`domain/\` — entities & value objects (imports \`src/core\` only)
- \`use-cases/\` — application workflows returning \`Result\`
- \`repositories/\` — Prisma + TypeORM adapters + \`${SINGULAR_PASCAL}RepositoryProvider\`
- \`${DOMAIN}.service.ts\` — orchestration + HTTP exception mapping
- \`${DOMAIN}.controller.ts\` — REST + Swagger

## Checklist

1. **Wire AppModule** — import \`${PASCAL}Module\` in \`src/app.module.ts\`.
2. **Prisma** — add a model to \`prisma/schema.prisma\` and implement \`Prisma${SINGULAR_PASCAL}Repository\`.
3. **TypeORM** — ensure \`${SINGULAR_PASCAL}OrmEntity\` is migrated when \`ORM_PROVIDER=typeorm\`.
4. **Auth** — uncomment guards / \`Public\` decorator on routes as needed.
5. **Verify** — \`yarn build:app\` and \`yarn test\`.

## ORM selection

Factory reads \`orm.type\`, \`ORM_TYPE\`, or \`ORM_PROVIDER\` (default \`prisma\`).
EOF



}

generate_module_files

if [[ "${DRY_RUN}" != "1" ]]; then
  log_ok "Module '${DOMAIN}' scaffold written to ${TARGET_DIR}"
else
  log_ok "Dry-run complete for '${DOMAIN}'"
fi

cat <<CHECKLIST

${C_BOLD}Next steps — wire ${PASCAL}Module${C_RESET}
  [ ] Import ${PASCAL}Module in src/app.module.ts:
        import { ${PASCAL}Module } from './modules/${DOMAIN}/${DOMAIN}.module';
        // add ${PASCAL}Module to imports: [...]
  [ ] Add Prisma model (if using ORM_PROVIDER=prisma) in prisma/schema.prisma
  [ ] Implement Prisma${SINGULAR_PASCAL}Repository persistence methods
  [ ] Register Bull queue ${UPPER_SNAKE}_QUEUE.NAME in ${PASCAL}Module if using processors
  [ ] Run: yarn build:app
  [ ] Run: yarn test

CHECKLIST

