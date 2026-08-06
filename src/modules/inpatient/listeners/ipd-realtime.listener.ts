/**
 * Bridges IPD domain events → platform RealtimeService (Socket.IO when enabled).
 */

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { RealtimeService } from '../../../platform/realtime/realtime.service';
import { IPD_EVENTS } from '../use-cases/ipd-journey.usecase';

@Injectable()
export class AdmissionRealtimeListener {
  private readonly logger = new Logger(AdmissionRealtimeListener.name);

  public constructor(private readonly realtime: RealtimeService) {}

  @OnEvent(IPD_EVENTS.PATIENT_ADMITTED)
  async onAdmitted(payload: {
    admissionId: string;
    patientId: string;
    bedId: string;
  }): Promise<void> {
    await this.publish('ipd.admitted', payload);
  }

  @OnEvent(IPD_EVENTS.PATIENT_TRANSFERRED)
  async onTransferred(payload: {
    admissionId: string;
    transferId: string;
    oldBedId: string | null;
    newBedId: string;
  }): Promise<void> {
    await this.publish('ipd.transferred', payload);
  }

  @OnEvent(IPD_EVENTS.PATIENT_DISCHARGED)
  async onDischarged(payload: {
    admissionId: string;
    patientId: string;
    freedBedId: string | null;
  }): Promise<void> {
    await this.publish('ipd.discharged', payload);
  }

  private async publish(
    type: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.realtime.publishToRoom('ipd', {
        type,
        payload,
      });
    } catch (err) {
      this.logger.warn(
        `Realtime publish failed for ${type}: ${(err as Error).message}`,
      );
    }
  }
}
