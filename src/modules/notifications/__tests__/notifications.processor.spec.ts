/**
 * NotificationsProcessor — SMS / email / websocket / appointment reminder paths.
 */

import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { NotificationsProcessor } from '../processors/notifications.processor';
import { NotificationAdapter } from '../adapters/notification.adapter';
import { RecipientResolverService } from '../recipients/recipient-resolver.service';
import { DeviceTokensService } from '../services/device-tokens.service';
import { DurableNotificationService } from '../services/durable-notification.service';
import { FcmService } from '../services/fcm.service';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { RealtimeService } from '../../../platform/realtime/realtime.service';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({
    sendMail: jest.fn().mockResolvedValue({ messageId: 'smtp-1' }),
  })),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const nodemailer = require('nodemailer') as {
  createTransport: jest.Mock;
};

describe('NotificationsProcessor channels', () => {
  const adapter = { sendSms: jest.fn().mockResolvedValue({ messageId: 'sms-1' }) };
  const recipients = {
    resolvePatient: jest.fn(),
    resolveUser: jest.fn(),
    requirePhone: jest.fn().mockResolvedValue('254700000000'),
    requireEmail: jest.fn().mockResolvedValue('user@test.com'),
  };
  const prisma = {
    appointments: { findFirst: jest.fn() },
  };
  const deviceTokens = {
    listActiveTokens: jest.fn(),
    deactivateTokens: jest.fn(),
  };
  const fcm = { isConfigured: jest.fn(), send: jest.fn() };
  const durable = {
    markWsDelivered: jest.fn(),
    markDeliveryFailed: jest.fn(),
    markChannelPartial: jest.fn(),
  };
  const config = { get: jest.fn() };
  const realtime = {
    publishToUser: jest.fn().mockResolvedValue(undefined),
    publishToRoom: jest.fn().mockResolvedValue(undefined),
  };

  let processor: NotificationsProcessor;

  beforeEach(async () => {
    jest.clearAllMocks();
    config.get.mockImplementation((key: string) => {
      if (key === 'email.host') return '';
      return undefined;
    });
    const moduleRef = await Test.createTestingModule({
      providers: [
        NotificationsProcessor,
        { provide: NotificationAdapter, useValue: adapter },
        { provide: RecipientResolverService, useValue: recipients },
        { provide: PrismaService, useValue: prisma },
        { provide: DeviceTokensService, useValue: deviceTokens },
        { provide: FcmService, useValue: fcm },
        { provide: DurableNotificationService, useValue: durable },
        { provide: ConfigService, useValue: config },
        { provide: RealtimeService, useValue: realtime },
      ],
    }).compile();
    processor = moduleRef.get(NotificationsProcessor);
  });

  it('logs queue failures', () => {
    expect(() =>
      processor.onFailed(
        { name: 'notification.send_sms', id: '1', attemptsMade: 2 } as never,
        new Error('boom'),
      ),
    ).not.toThrow();
  });

  describe('handleSms', () => {
    it('sends SMS for patient and user recipients', async () => {
      recipients.resolvePatient.mockResolvedValue({ id: 'p1' });
      const patient = await processor.handleSms({
        data: {
          eventId: 'e1',
          templateKey: 'notifications.sms.test',
          patientId: 'p1',
          variables: { ref: 'R1' },
        },
      } as never);
      expect(patient).toEqual({ messageId: 'sms-1' });
      expect(adapter.sendSms).toHaveBeenCalledWith(
        expect.objectContaining({ to: '254700000000' }),
      );

      recipients.resolveUser.mockResolvedValue({ id: 'u1' });
      await processor.handleSms({
        data: {
          eventId: 'e2',
          templateKey: 'payment.received.patient.sms',
          userId: 'u1',
        },
      } as never);
      expect(recipients.resolveUser).toHaveBeenCalledWith('u1');
    });

    it('rejects unknown templates and missing recipients', async () => {
      await expect(
        processor.handleSms({
          data: { eventId: 'e', templateKey: 'nope', patientId: 'p1' },
        } as never),
      ).rejects.toThrow(/Unknown SMS template/);

      recipients.resolvePatient.mockResolvedValue(null);
      await expect(
        processor.handleSms({
          data: {
            eventId: 'e',
            templateKey: 'notifications.sms.test',
            patientId: 'p1',
          },
        } as never),
      ).rejects.toThrow(/could not be resolved/);
    });
  });

  describe('handleEmail', () => {
    it('logs when SMTP is not configured', async () => {
      recipients.resolveUser.mockResolvedValue({ id: 'u1' });
      const result = await processor.handleEmail({
        data: {
          eventId: 'e1',
          templateKey: 'notifications.email.test',
          userId: 'u1',
          variables: { ref: 'X' },
        },
      } as never);
      expect(result).toEqual({ delivered: false, mode: 'log' });
    });

    it('sends via SMTP when host is configured', async () => {
      recipients.resolveUser.mockResolvedValue({ id: 'u1' });
      config.get.mockImplementation((key: string) => {
        const map: Record<string, unknown> = {
          'email.host': 'smtp.test',
          'email.from': 'noreply@test',
          'email.port': 465,
          'email.secure': true,
          'email.user': 'u',
          'email.pass': 'p',
        };
        return map[key];
      });
      const sendMail = jest.fn().mockResolvedValue({});
      nodemailer.createTransport.mockReturnValue({ sendMail });

      const result = await processor.handleEmail({
        data: {
          eventId: 'e1',
          templateKey: 'notifications.email.test',
          userId: 'u1',
          notificationId: 'n1',
          variables: { ref: 'X' },
        },
      } as never);
      expect(result).toEqual({ delivered: true, mode: 'smtp' });
      expect(sendMail).toHaveBeenCalled();
      expect(durable.markChannelPartial).toHaveBeenCalledWith('n1');
    });

    it('rejects bad templates and missing users', async () => {
      await expect(
        processor.handleEmail({
          data: {
            eventId: 'e',
            templateKey: 'notifications.sms.test',
            userId: 'u1',
          },
        } as never),
      ).rejects.toThrow(/Unknown email template/);

      recipients.resolveUser.mockResolvedValue(null);
      await expect(
        processor.handleEmail({
          data: {
            eventId: 'e',
            templateKey: 'notifications.email.test',
            userId: 'u1',
          },
        } as never),
      ).rejects.toThrow(/could not be resolved/);
    });
  });

  describe('handleFcm durable / retry edges', () => {
    it('marks durable state and retries transient all-fail', async () => {
      deviceTokens.listActiveTokens.mockResolvedValue(['t1', 't2']);
      fcm.isConfigured.mockReturnValue(true);
      fcm.send
        .mockResolvedValueOnce({ ok: false, invalidToken: false, error: 'temp' })
        .mockResolvedValueOnce({ ok: false, invalidToken: false, error: 'temp' });

      await expect(
        processor.handleFcm({
          data: {
            eventId: 'e1',
            templateKey: 'appointment.created.doctor.push',
            userId: 'u1',
            notificationId: 'n1',
            dedupeKey: 'd1',
          },
        } as never),
      ).rejects.toThrow(/FCM delivery failed/);
      expect(durable.markDeliveryFailed).toHaveBeenCalledWith('n1');
    });

    it('marks channel partial when at least one send succeeds', async () => {
      deviceTokens.listActiveTokens.mockResolvedValue(['t1']);
      fcm.isConfigured.mockReturnValue(true);
      fcm.send.mockResolvedValue({ ok: true, messageId: 'm1' });

      const result = await processor.handleFcm({
        data: {
          eventId: 'e1',
          templateKey: 'appointment.created.doctor.push',
          userId: 'u1',
          notificationId: 'n1',
          dedupeKey: 'd1',
        },
      } as never);
      expect(result).toEqual({ sent: 1, failed: 0 });
      expect(durable.markChannelPartial).toHaveBeenCalledWith('n1');
    });

    it('rejects unknown FCM templates', async () => {
      await expect(
        processor.handleFcm({
          data: {
            eventId: 'e',
            templateKey: 'notifications.sms.test',
            userId: 'u1',
            dedupeKey: 'd',
          },
        } as never),
      ).rejects.toThrow(/Unknown FCM template/);
    });
  });

  describe('handleWebsocket', () => {
    it('publishes to user or room and marks delivered', async () => {
      await expect(
        processor.handleWebsocket({
          data: {
            type: 'ping',
            payload: { a: 1 },
            userId: 'u1',
            notificationId: 'n1',
          },
        } as never),
      ).resolves.toEqual({ delivered: true });
      expect(realtime.publishToUser).toHaveBeenCalled();
      expect(durable.markWsDelivered).toHaveBeenCalledWith('n1');

      await processor.handleWebsocket({
        data: { type: 'ping', payload: {}, room: 'ops', notificationId: 'n2' },
      } as never);
      expect(realtime.publishToRoom).toHaveBeenCalled();
    });

    it('marks failed and rethrows on publish errors', async () => {
      realtime.publishToUser.mockRejectedValueOnce(new Error('down'));
      await expect(
        processor.handleWebsocket({
          data: {
            type: 'ping',
            payload: {},
            userId: 'u1',
            notificationId: 'n1',
          },
        } as never),
      ).rejects.toThrow('down');
      expect(durable.markDeliveryFailed).toHaveBeenCalledWith('n1');
    });

    it('requires userId or room', async () => {
      await expect(
        processor.handleWebsocket({
          data: { type: 'ping', payload: {} },
        } as never),
      ).rejects.toThrow(/missing userId and room/);
    });
  });

  describe('handleAppointmentReminder', () => {
    const start = new Date('2026-08-23T10:00:00.000Z');

    it('sends reminder SMS for active appointments', async () => {
      prisma.appointments.findFirst.mockResolvedValue({
        id: 'a1',
        status: 'SCHEDULED',
        patient_id: 'p1',
        appointment_date: start,
        start_time: start,
      });
      recipients.resolvePatient.mockResolvedValue({ id: 'p1' });

      const result = await processor.handleAppointmentReminder({
        data: {
          appointmentId: 'a1',
          expectedStartsAt: start.toISOString(),
        },
      } as never);
      expect(result).toEqual({ sent: true });
      expect(adapter.sendSms).toHaveBeenCalled();
    });

    it('skips missing, cancelled, rescheduled, and phoneless patients', async () => {
      prisma.appointments.findFirst.mockResolvedValue(null);
      expect(
        await processor.handleAppointmentReminder({
          data: { appointmentId: 'a1', expectedStartsAt: start.toISOString() },
        } as never),
      ).toEqual({ sent: false, reason: 'missing' });

      prisma.appointments.findFirst.mockResolvedValue({
        id: 'a1',
        status: 'CANCELLED',
        patient_id: 'p1',
        appointment_date: start,
        start_time: start,
      });
      expect(
        await processor.handleAppointmentReminder({
          data: { appointmentId: 'a1', expectedStartsAt: start.toISOString() },
        } as never),
      ).toEqual({ sent: false, reason: 'status_CANCELLED' });

      prisma.appointments.findFirst.mockResolvedValue({
        id: 'a1',
        status: 'SCHEDULED',
        patient_id: 'p1',
        appointment_date: start,
        start_time: start,
      });
      expect(
        await processor.handleAppointmentReminder({
          data: {
            appointmentId: 'a1',
            expectedStartsAt: new Date(start.getTime() + 120_000).toISOString(),
          },
        } as never),
      ).toEqual({ sent: false, reason: 'rescheduled' });

      recipients.resolvePatient.mockResolvedValue(null);
      expect(
        await processor.handleAppointmentReminder({
          data: { appointmentId: 'a1', expectedStartsAt: start.toISOString() },
        } as never),
      ).toEqual({ sent: false, reason: 'patient_missing' });

      recipients.resolvePatient.mockResolvedValue({ id: 'p1' });
      recipients.requirePhone.mockRejectedValueOnce(new Error('no phone'));
      expect(
        await processor.handleAppointmentReminder({
          data: { appointmentId: 'a1', expectedStartsAt: start.toISOString() },
        } as never),
      ).toEqual({ sent: false, reason: 'no_phone' });
    });
  });
});

describe('NotificationsProcessor without realtime', () => {
  it('rejects websocket jobs when RealtimeService is missing', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        NotificationsProcessor,
        { provide: NotificationAdapter, useValue: { sendSms: jest.fn() } },
        { provide: RecipientResolverService, useValue: {} },
        { provide: PrismaService, useValue: {} },
        { provide: DeviceTokensService, useValue: {} },
        { provide: FcmService, useValue: {} },
        {
          provide: DurableNotificationService,
          useValue: {
            markWsDelivered: jest.fn(),
            markDeliveryFailed: jest.fn(),
            markChannelPartial: jest.fn(),
          },
        },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();
    const processor = moduleRef.get(NotificationsProcessor);
    await expect(
      processor.handleWebsocket({
        data: { type: 'x', payload: {}, userId: 'u1' },
      } as never),
    ).rejects.toThrow(/RealtimeService is not available/);
  });
});
