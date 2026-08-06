/**
 * @packageDocumentation
 * Platform layer — NestJS adapters and cross-cutting infrastructure.
 *
 * Depends on `src/core` contracts. Must not contain business domain logic.
 */

/**
 * Subsystems are namespace exports because several intentionally expose
 * similarly named concepts (for example queue and infrastructure retry
 * policies). Namespace exports keep the root barrel type-safe and force
 * callers to choose the intended bounded context.
 */
export * as Architecture from './architecture';
export * as Database from './database';
export * as Security from './security';
export * as Cache from './cache';
export * as Performance from './performance';
export * as Queue from './queue';
export * as Scheduling from './scheduling';
export * as Api from './api';
export * as Observability from './observability';
export * as Messaging from './messaging';
export * as Tenancy from './tenancy';
export * as Extensibility from './extensibility';
export * as Configuration from './configuration';
export * as Testing from './testing';
export * as Devtools from './devtools';
export * as Reliability from './reliability';
export * as Storage from './storage';
export * as Documents from './documents';
export * as Media from './media';
export * as Search from './search';
export * as Imports from './imports';
export * as Reporting from './reporting';
export * as Quotas from './quotas';
export * as Realtime from './realtime';
