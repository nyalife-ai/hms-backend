/**
 * Domain milestone events → notification policy → durable persist → Bull queue.
 * Also bridges legacy lab/IPD/pharmacy event names into DOMAIN_EVENT_TYPES envelopes.
 * Failures never propagate to the originating clinical transaction.
 */

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { NotificationDispatcherService } from '../dispatch/notification-dispatcher.service';
import {
  createDomainEventEnvelope,
  type DomainEventEnvelope,
} from '../infrastructure/domain-event.envelope';
import { DOMAIN_EVENT_TYPES } from '../policy/notification-policy.service';
import { LAB_EVENTS } from '../../laboratory/use-cases/lab-journey.usecase';
import { IPD_EVENTS } from '../../inpatient/use-cases/ipd-journey.usecase';
import { PHARMACY_EVENTS } from '../../pharmacy/use-cases/dispense-medication.usecase';

@Injectable()
export class DomainNotificationListener {
  private readonly logger = new Logger(DomainNotificationListener.name);

  public constructor(
    private readonly dispatcher: NotificationDispatcherService,
    private readonly prisma: PrismaService,
  ) {}

  @OnEvent(DOMAIN_EVENT_TYPES.APPOINTMENT_CREATED)
  @OnEvent(DOMAIN_EVENT_TYPES.APPOINTMENT_CHECKED_IN)
  @OnEvent(DOMAIN_EVENT_TYPES.APPOINTMENT_CANCELLED)
  @OnEvent(DOMAIN_EVENT_TYPES.APPOINTMENT_RESCHEDULED)
  @OnEvent(DOMAIN_EVENT_TYPES.LAB_REQUEST_CREATED)
  @OnEvent(DOMAIN_EVENT_TYPES.LAB_RESULTS_READY)
  @OnEvent(DOMAIN_EVENT_TYPES.LAB_RESULTS_CRITICAL)
  @OnEvent(DOMAIN_EVENT_TYPES.ADMISSION_CREATED)
  @OnEvent(DOMAIN_EVENT_TYPES.ADMISSION_TRANSFERRED)
  @OnEvent(DOMAIN_EVENT_TYPES.ADMISSION_DISCHARGED)
  @OnEvent(DOMAIN_EVENT_TYPES.PRESCRIPTION_CREATED)
  @OnEvent(DOMAIN_EVENT_TYPES.PRESCRIPTION_DISPENSED)
  @OnEvent(DOMAIN_EVENT_TYPES.PAYMENT_RECEIVED)
  @OnEvent(DOMAIN_EVENT_TYPES.PAYMENT_FAILED)
  @OnEvent(DOMAIN_EVENT_TYPES.INVOICE_ISSUED)
  @OnEvent(DOMAIN_EVENT_TYPES.INSURANCE_CLAIM_SUBMITTED)
  @OnEvent(DOMAIN_EVENT_TYPES.INSURANCE_CLAIM_APPROVED)
  @OnEvent(DOMAIN_EVENT_TYPES.INSURANCE_CLAIM_DENIED)
  @OnEvent(DOMAIN_EVENT_TYPES.VISIT_RESULTS_READY)
  @OnEvent(DOMAIN_EVENT_TYPES.VISIT_READY_FOR_BILLING)
  @OnEvent(DOMAIN_EVENT_TYPES.VISIT_COMPLETED)
  @OnEvent(DOMAIN_EVENT_TYPES.RADIOLOGY_REPORT_READY)
  @OnEvent(DOMAIN_EVENT_TYPES.RADIOLOGY_REQUEST_CREATED)
  @OnEvent(DOMAIN_EVENT_TYPES.AUTH_PASSWORD_CHANGED)
  @OnEvent(DOMAIN_EVENT_TYPES.AUTH_ACCOUNT_SECURITY_CHANGED)
  public async onDomainEvent(
    event: DomainEventEnvelope | Record<string, unknown>,
  ): Promise<void> {
    const envelope = this.normalize(event);
    if (!envelope) return;
    if (envelope.type === DOMAIN_EVENT_TYPES.APPOINTMENT_CANCELLED) {
      const appointmentId = (envelope.payload as { appointmentId?: string })
        .appointmentId;
      if (appointmentId) {
        await this.dispatcher.cancelJob(
          `appointment-reminder:${appointmentId}`,
        );
      }
    }

    try {
      const enriched = await this.enrichRecipients(envelope);
      const { queued, persisted } =
        await this.dispatcher.dispatchDomainEvent(enriched);
      this.logger.log(
        `Domain event ${enriched.type} id=${enriched.id} persisted=${persisted} queued=${queued}`,
      );
    } catch (err) {
      this.logger.warn(
        `Notification dispatch failed for ${envelope.type}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  @OnEvent(LAB_EVENTS.REQUESTED)
  public async onLabRequested(payload: {
    requestId?: string;
    priority?: string;
  }): Promise<void> {
    if (!payload?.requestId) return;
    const technicianUserIds = await this.resolveRoleUserIds([
      'LAB_TECHNICIAN',
    ]);
    await this.onDomainEvent(
      createDomainEventEnvelope({
        type: DOMAIN_EVENT_TYPES.LAB_REQUEST_CREATED,
        payload: {
          requestId: payload.requestId,
          priority: payload.priority ?? 'NORMAL',
          technicianUserIds,
        },
      }),
    );
  }

  @OnEvent(LAB_EVENTS.RESULT_RELEASED)
  public async onLabReleased(payload: {
    requestId?: string;
    visitId?: string | null;
  }): Promise<void> {
    if (!payload?.requestId) return;
    const doctorUserId = await this.resolveLabDoctorUserId(payload.requestId);
    await this.onDomainEvent(
      createDomainEventEnvelope({
        type: DOMAIN_EVENT_TYPES.LAB_RESULTS_READY,
        payload: { requestId: payload.requestId, doctorUserId },
      }),
    );
  }

  @OnEvent(LAB_EVENTS.RESULT_CRITICAL)
  public async onLabCritical(payload: {
    requestId?: string;
  }): Promise<void> {
    if (!payload?.requestId) return;
    const doctorUserId = await this.resolveLabDoctorUserId(payload.requestId);
    await this.onDomainEvent(
      createDomainEventEnvelope({
        type: DOMAIN_EVENT_TYPES.LAB_RESULTS_CRITICAL,
        payload: { requestId: payload.requestId, doctorUserId },
      }),
    );
  }

  @OnEvent(IPD_EVENTS.PATIENT_ADMITTED)
  public async onAdmitted(payload: {
    admissionId?: string;
    patientId?: string;
  }): Promise<void> {
    if (!payload?.admissionId) return;
    const nurseUserIds = await this.resolveRoleUserIds(['NURSE']);
    await this.onDomainEvent(
      createDomainEventEnvelope({
        type: DOMAIN_EVENT_TYPES.ADMISSION_CREATED,
        payload: {
          admissionId: payload.admissionId,
          patientId: payload.patientId,
          nurseUserIds,
        },
      }),
    );
  }

  @OnEvent(IPD_EVENTS.PATIENT_TRANSFERRED)
  public async onTransferred(payload: {
    admissionId?: string;
  }): Promise<void> {
    if (!payload?.admissionId) return;
    const nurseUserIds = await this.resolveRoleUserIds(['NURSE']);
    await this.onDomainEvent(
      createDomainEventEnvelope({
        type: DOMAIN_EVENT_TYPES.ADMISSION_TRANSFERRED,
        payload: { admissionId: payload.admissionId, nurseUserIds },
      }),
    );
  }

  @OnEvent(IPD_EVENTS.PATIENT_DISCHARGED)
  public async onDischarged(payload: {
    admissionId?: string;
    patientId?: string;
  }): Promise<void> {
    if (!payload?.admissionId) return;
    const nurseUserIds = await this.resolveRoleUserIds(['NURSE']);
    await this.onDomainEvent(
      createDomainEventEnvelope({
        type: DOMAIN_EVENT_TYPES.ADMISSION_DISCHARGED,
        payload: {
          admissionId: payload.admissionId,
          patientId: payload.patientId,
          nurseUserIds,
        },
      }),
    );
  }

  @OnEvent(PHARMACY_EVENTS.DISPENSED)
  public async onDispensed(payload: {
    visitId?: string;
    dispensed?: number;
  }): Promise<void> {
    if (!payload?.visitId) return;
    const patientId = await this.resolveVisitPatientId(payload.visitId);
    await this.onDomainEvent(
      createDomainEventEnvelope({
        type: DOMAIN_EVENT_TYPES.PRESCRIPTION_DISPENSED,
        payload: {
          patientId: patientId ?? undefined,
          prescriptionId: payload.visitId,
        },
      }),
    );
  }

  private async enrichRecipients(
    event: DomainEventEnvelope,
  ): Promise<DomainEventEnvelope> {
    if (event.type === DOMAIN_EVENT_TYPES.VISIT_READY_FOR_BILLING) {
      const payload = event.payload as {
        visitId: string;
        billingUserIds?: string[];
      };
      if (!payload.billingUserIds?.length) {
        return {
          ...event,
          payload: {
            ...payload,
            billingUserIds: await this.resolveRoleUserIds([
              'ACCOUNTANT',
              'RECEPTIONIST',
            ]),
          },
        };
      }
    }
    if (event.type === DOMAIN_EVENT_TYPES.PRESCRIPTION_CREATED) {
      const payload = event.payload as {
        prescriptionId: string;
        pharmacistUserIds?: string[];
      };
      if (!payload.pharmacistUserIds?.length) {
        return {
          ...event,
          payload: {
            ...payload,
            pharmacistUserIds: await this.resolveRoleUserIds(['PHARMACIST']),
          },
        };
      }
    }
    if (event.type === DOMAIN_EVENT_TYPES.RADIOLOGY_REQUEST_CREATED) {
      const payload = event.payload as {
        requestId: string;
        radiologistUserIds?: string[];
      };
      if (!payload.radiologistUserIds?.length) {
        return {
          ...event,
          payload: {
            ...payload,
            radiologistUserIds: await this.resolveRoleUserIds([
              'RADIOLOGIST',
            ]),
          },
        };
      }
    }
    if (
      event.type === DOMAIN_EVENT_TYPES.ADMISSION_CREATED ||
      event.type === DOMAIN_EVENT_TYPES.ADMISSION_TRANSFERRED ||
      event.type === DOMAIN_EVENT_TYPES.ADMISSION_DISCHARGED
    ) {
      const payload = event.payload as {
        admissionId: string;
        nurseUserIds?: string[];
      };
      if (!payload.nurseUserIds?.length) {
        return {
          ...event,
          payload: {
            ...payload,
            nurseUserIds: await this.resolveRoleUserIds(['NURSE']),
          },
        };
      }
    }
    return event;
  }

  private async resolveRoleUserIds(roleNames: string[]): Promise<string[]> {
    try {
      const rows = await this.prisma.user.findMany({
        where: {
          deleted_at: null,
          is_active: true,
          core_user_roles_user_id: {
            some: { role: { name: { in: roleNames } } },
          },
        },
        select: { id: true },
        take: 100,
      });
      return rows.map((r) => r.id);
    } catch (err) {
      this.logger.warn(
        `Role resolve failed roles=${roleNames.join(',')}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return [];
    }
  }

  private async resolveLabDoctorUserId(
    requestId: string,
  ): Promise<string | undefined> {
    try {
      const req = await this.prisma.laboratoryRequests.findFirst({
        where: { id: requestId },
        select: {
          requesting_doctor_id: true,
          requesting_doctor: { select: { user_id: true } },
        },
      });
      return req?.requesting_doctor?.user_id ?? undefined;
    } catch (err) {
      this.logger.warn(
        `Lab doctor resolve failed requestId=${requestId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return undefined;
    }
  }

  private async resolveVisitPatientId(
    visitId: string,
  ): Promise<string | undefined> {
    try {
      const visit = await this.prisma.outpatientVisits.findFirst({
        where: { id: visitId },
        select: { patient_id: true },
      });
      return visit?.patient_id ?? undefined;
    } catch (err) {
      this.logger.warn(
        `Visit patient resolve failed visitId=${visitId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return undefined;
    }
  }

  private normalize(
    event: DomainEventEnvelope | Record<string, unknown>,
  ): DomainEventEnvelope | null {
    if (
      event &&
      typeof event === 'object' &&
      typeof (event as DomainEventEnvelope).id === 'string' &&
      typeof (event as DomainEventEnvelope).type === 'string' &&
      typeof (event as DomainEventEnvelope).payload === 'object'
    ) {
      return event as DomainEventEnvelope;
    }
    return null;
  }

  /** Helper for modules that emit raw payloads with a known type. */
  public static wrap<T extends object>(
    type: string,
    payload: T,
    actorId?: string,
  ): DomainEventEnvelope<T> {
    return createDomainEventEnvelope({ type, payload, actorId });
  }
}
