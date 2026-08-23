/**
 * Enqueues notification intents onto Bull (Redis).
 * Persists durable notification rows BEFORE channel delivery.
 */

import { InjectQueue } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bull';
import { NOTIFICATIONS_QUEUE } from '../constants/notifications.constants';
import type { DomainEventEnvelope } from '../infrastructure/domain-event.envelope';
import {
  NOTIFICATION_JOBS,
  type NotificationIntent,
  type QueuedNotificationJob,
} from '../jobs/notification.jobs';
import { NotificationPolicyService } from '../policy/notification-policy.service';
import { DurableNotificationService } from '../services/durable-notification.service';

const DEFAULT_JOB_OPTS = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 2000 },
  removeOnComplete: 100,
  removeOnFail: 200,
};

@Injectable()
export class NotificationDispatcherService {
  private readonly logger = new Logger(NotificationDispatcherService.name);

  public constructor(
    private readonly policy: NotificationPolicyService,
    private readonly durable: DurableNotificationService,
    @InjectQueue(NOTIFICATIONS_QUEUE.NAME)
    private readonly queue: Queue,
  ) {}

  public async dispatchDomainEvent(
    event: DomainEventEnvelope,
  ): Promise<{ queued: number; persisted: number }> {
    const intent = this.policy.evaluate(event);
    if (!intent) return { queued: 0, persisted: 0 };
    return this.enqueueIntent(intent);
  }

  public async enqueueIntent(
    intent: NotificationIntent,
  ): Promise<{ queued: number; persisted: number }> {
    let persisted = 0;
    const byUser = new Map<
      string,
      {
        id: string;
        title: string;
        body: string | null;
        notificationType: string;
        actionPath: string | null;
        priority: string;
        entityType: string | null;
        entityId: string | null;
        created: boolean;
      }
    >();

    if (intent.durable.length) {
      const rows = await this.durable.persistMany(intent.durable);
      for (const row of rows) {
        if (row.created) persisted += 1;
        byUser.set(row.userId, {
          id: row.id,
          title: row.title,
          body: row.body,
          notificationType: row.notificationType,
          actionPath: row.actionPath,
          priority: row.priority,
          entityType: row.entityType,
          entityId: row.entityId,
          created: row.created,
        });
      }
    }

    const jobs = this.linkJobsToNotifications(intent.jobs, byUser);
    let queued = 0;
    for (const job of jobs) {
      try {
        await this.queue.add(job.name, job.data, {
          ...DEFAULT_JOB_OPTS,
          jobId: job.jobId,
          delay: job.delayMs && job.delayMs > 0 ? job.delayMs : undefined,
        });
        queued += 1;
        this.logger.log(
          `Queued ${job.name} eventId=${intent.eventId} jobId=${job.jobId ?? 'auto'}`,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (job.jobId && /already exists|Job already/i.test(message)) {
          try {
            const existing = await this.queue.getJob(job.jobId);
            await existing?.remove();
            await this.queue.add(job.name, job.data, {
              ...DEFAULT_JOB_OPTS,
              jobId: job.jobId,
              delay: job.delayMs && job.delayMs > 0 ? job.delayMs : undefined,
            });
            queued += 1;
            this.logger.log(`Replaced job ${job.jobId}`);
          } catch (replaceErr) {
            this.logger.warn(
              `Failed to replace job ${job.jobId}: ${
                replaceErr instanceof Error
                  ? replaceErr.message
                  : String(replaceErr)
              }`,
            );
          }
        } else {
          this.logger.warn(`Failed to queue ${job.name}: ${message}`);
        }
      }
    }
    return { queued, persisted };
  }

  public async cancelJob(jobId: string): Promise<void> {
    const job = await this.queue.getJob(jobId);
    if (job) {
      await job.remove();
      this.logger.log(`Cancelled job ${jobId}`);
    }
  }

  private linkJobsToNotifications(
    jobs: QueuedNotificationJob[],
    byUser: Map<
      string,
      {
        id: string;
        title: string;
        body: string | null;
        notificationType: string;
        actionPath: string | null;
        priority: string;
        entityType: string | null;
        entityId: string | null;
        created: boolean;
      }
    >,
  ): QueuedNotificationJob[] {
    return jobs.map((job) => {
      if (
        job.name === NOTIFICATION_JOBS.SEND_WEBSOCKET ||
        job.name === NOTIFICATION_JOBS.SEND_FCM
      ) {
        const userId = job.data.userId;
        if (!userId) return job;
        const row = byUser.get(userId);
        if (!row) return job;
        if (job.name === NOTIFICATION_JOBS.SEND_WEBSOCKET) {
          return {
            ...job,
            data: {
              ...job.data,
              notificationId: row.id,
              payload: {
                ...job.data.payload,
                notificationId: row.id,
                notificationType: row.notificationType,
                title: row.title,
                body: row.body,
                actionPath: row.actionPath,
                priority: row.priority,
                entityType: row.entityType,
                entityId: row.entityId,
                /** Live deliveries may play sound; history fetch must not. */
                isLive: true,
              },
            },
          };
        }
        return {
          ...job,
          data: {
            ...job.data,
            notificationId: row.id,
            variables: {
              ...(job.data.variables ?? {}),
              notificationId: row.id,
              ...(row.actionPath
                ? { actionPath: row.actionPath, url: row.actionPath }
                : {}),
            },
          },
        };
      }
      return job;
    });
  }
}
