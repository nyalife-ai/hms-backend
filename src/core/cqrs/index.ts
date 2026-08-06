/**
 * CQRS abstractions — commands, queries, and bus contracts only.
 * Bus implementations belong in platform.
 */

export type { Command, CommandProps } from './command';
export { createCommandId, BaseCommand } from './command';
export type { CommandHandler } from './command-handler';
export type { Query, QueryProps } from './query';
export { createQueryId, BaseQuery } from './query';
export type { QueryHandler } from './query-handler';
export type { CommandBus } from './command-bus';
export type { QueryBus } from './query-bus';
export type { EventBus } from './event-bus';
