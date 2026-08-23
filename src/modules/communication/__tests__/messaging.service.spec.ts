/**
 * MessagingService — focused unit tests (direct reuse, membership, markRead).
 */

import {
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MessagingService } from '../services/messaging.service';
import { MessagePayloadService } from '../services/message-payload.service';
import { CONVERSATION_TYPES } from '../constants/messaging.constants';

describe('MessagingService', () => {
  let prisma: Record<string, any>;
  let payload: { pack: jest.Mock; unpack: jest.Mock };
  let events: { emit: jest.Mock };
  let service: MessagingService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      isConnected: true,
      $transaction: jest.fn(async (fn: (tx: typeof prisma) => unknown) =>
        fn(prisma),
      ),
      conversations: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      conversationParticipants: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      messages: {
        create: jest.fn(),
        findFirst: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      messageDeliveryReceipts: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([{ id: 'u1' }, { id: 'u2' }]),
        findFirst: jest.fn().mockResolvedValue({
          id: 'u1',
          email: 'a@x.com',
          core_profiles_user_id: [{ first_name: 'Ada', last_name: 'O' }],
        }),
      },
      messageAttachments: {
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
      },
    };
    payload = {
      pack: jest.fn((text: string) => `enc:${text}`),
      unpack: jest.fn((raw: string) => ({
        text: raw.startsWith('enc:') ? raw.slice(4) : raw,
      })),
    };
    events = { emit: jest.fn() };
    service = new MessagingService(
      prisma as never,
      payload as unknown as MessagePayloadService,
      events as unknown as EventEmitter2,
    );
  });

  it('reuses an existing DIRECT conversation between two participants', async () => {
    prisma.conversationParticipants.findMany.mockResolvedValue([
      {
        conversation: {
          id: 'c-existing',
          communications_conversation_participants_conversation_id: [
            { user_id: 'u1' },
            { user_id: 'u2' },
          ],
        },
      },
    ]);
    prisma.conversationParticipants.findFirst.mockResolvedValue({
      user_id: 'u1',
      is_muted: false,
      last_read_message_id: null,
    });
    prisma.conversations.findFirst.mockResolvedValue({
      id: 'c-existing',
      conversation_type: CONVERSATION_TYPES.DIRECT,
      name: null,
      avatar: null,
      created_by: 'u1',
      created_at: new Date(),
      updated_at: new Date(),
      metadata: {},
      deleted_at: null,
      communications_conversation_participants_conversation_id: [
        {
          user_id: 'u1',
          role: 'ADMIN',
          is_muted: false,
          last_read_message_id: null,
          user: {
            email: 'a@x.com',
            core_profiles_user_id: [{ first_name: 'Ada', last_name: 'O' }],
            core_user_roles_user_id: [{ role: { name: 'DOCTOR' } }],
          },
        },
        {
          user_id: 'u2',
          role: 'MEMBER',
          is_muted: false,
          last_read_message_id: null,
          user: {
            email: 'b@x.com',
            core_profiles_user_id: [],
            core_user_roles_user_id: [{ role: { name: 'NURSE' } }],
          },
        },
      ],
    });

    const result = await service.createConversation('u1', {
      type: CONVERSATION_TYPES.DIRECT,
      participantIds: ['u2'],
    });

    expect(result.id).toBe('c-existing');
    expect(prisma.conversations.create).not.toHaveBeenCalled();
  });

  it('rejects sendMessage when actor is not a participant', async () => {
    prisma.conversationParticipants.findFirst.mockResolvedValue(null);

    await expect(
      service.sendMessage('u1', 'c1', { body: 'Hello' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.messages.create).not.toHaveBeenCalled();
  });

  it('sendMessage returns a rich payload with senderName and dual ids', async () => {
    const createdAt = new Date('2026-08-23T12:00:00Z');
    prisma.conversationParticipants.findFirst.mockResolvedValue({
      user_id: 'u1',
      left_at: null,
    });
    prisma.conversations.findFirst.mockResolvedValue({
      id: 'c1',
      deleted_at: null,
      metadata: {},
    });
    prisma.messages.create.mockResolvedValue({
      id: 'm1',
      conversation_id: 'c1',
      sender_id: 'u1',
      created_at: createdAt,
      message_type: 'TEXT',
    });
    prisma.conversationParticipants.findMany.mockResolvedValue([
      { user_id: 'u1', is_muted: false },
      { user_id: 'u2', is_muted: false },
    ]);

    const result = await service.sendMessage('u1', 'c1', {
      body: 'Hello',
      clientMessageId: 'client-1',
    });

    expect(result).toEqual(
      expect.objectContaining({
        id: 'm1',
        messageId: 'm1',
        conversationId: 'c1',
        senderId: 'u1',
        senderName: 'Ada O',
        body: 'Hello',
        isDeleted: false,
        deliveryStatus: 'SENT',
        clientMessageId: 'client-1',
        reactions: [],
        attachments: [],
      }),
    );
    expect(events.emit).toHaveBeenCalledWith(
      'message.created',
      expect.objectContaining({
        payload: expect.objectContaining({
          senderName: 'Ada O',
          messageId: 'm1',
        }),
      }),
    );
  });

  it('markRead updates last_read and receipts', async () => {
    prisma.conversationParticipants.findFirst.mockResolvedValue({
      user_id: 'u1',
      left_at: null,
    });
    prisma.messages.findFirst.mockResolvedValue({
      id: 'm9',
      conversation_id: 'c1',
      created_at: new Date('2026-08-23T12:00:00Z'),
    });
    prisma.conversationParticipants.findMany.mockResolvedValue([
      { user_id: 'u1' },
      { user_id: 'u2' },
    ]);

    const result = await service.markRead('u1', 'c1', 'm9');
    expect(result).toEqual({ ok: true, upToMessageId: 'm9' });
    expect(prisma.conversationParticipants.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { last_read_message_id: 'm9' },
      }),
    );
    expect(prisma.messageDeliveryReceipts.updateMany).toHaveBeenCalled();
    expect(events.emit).toHaveBeenCalled();
  });

  it('markRead rejects unknown message', async () => {
    prisma.conversationParticipants.findFirst.mockResolvedValue({
      user_id: 'u1',
    });
    prisma.messages.findFirst.mockResolvedValue(null);
    await expect(service.markRead('u1', 'c1', 'missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
