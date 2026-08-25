/**
 * MessagingService — focused unit tests (direct reuse, membership, markRead).
 */

import {
  BadRequestException,
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

  const groupConversationRow = {
    id: 'c-group',
    conversation_type: CONVERSATION_TYPES.GROUP,
    name: 'Ward A',
    avatar: null,
    created_by: 'u1',
    created_at: new Date('2026-08-20T00:00:00Z'),
    updated_at: new Date('2026-08-20T00:00:00Z'),
    metadata: {},
    deleted_at: null,
    communications_conversation_participants_conversation_id: [
      {
        user_id: 'u1',
        role: 'ADMIN',
        is_muted: false,
        last_read_message_id: null,
        left_at: null,
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
        left_at: null,
        user: {
          email: 'b@x.com',
          core_profiles_user_id: [{ first_name: 'Bea', last_name: 'N' }],
          core_user_roles_user_id: [{ role: { name: 'NURSE' } }],
        },
      },
    ],
  };

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
        create: jest.fn().mockResolvedValue({}),
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
        findMany: jest.fn().mockImplementation(async ({ where }: { where?: { id?: { in?: string[] } } }) => {
          const ids = where?.id?.in ?? ['u1', 'u2'];
          return ids.map((id: string) =>
            id === 'u1'
              ? {
                  id: 'u1',
                  email: 'a@x.com',
                  core_profiles_user_id: [
                    { first_name: 'Ada', last_name: 'O' },
                  ],
                }
              : {
                  id,
                  email: `${id}@x.com`,
                  core_profiles_user_id: [],
                },
          );
        }),
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
        mentions: [],
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

  it('addParticipants creates membership for new users', async () => {
    prisma.conversationParticipants.findFirst
      .mockResolvedValueOnce({
        user_id: 'u1',
        role: 'ADMIN',
        left_at: null,
      })
      .mockResolvedValueOnce(null) // no existing row for u3
      .mockResolvedValueOnce({
        user_id: 'u1',
        role: 'ADMIN',
        left_at: null,
        last_read_message_id: null,
        is_muted: false,
      });
    prisma.conversations.findFirst
      .mockResolvedValueOnce({
        id: 'c-group',
        conversation_type: CONVERSATION_TYPES.GROUP,
        deleted_at: null,
      })
      .mockResolvedValueOnce(groupConversationRow);
    prisma.user.findMany.mockResolvedValue([{ id: 'u3' }]);
    prisma.messages.count.mockResolvedValue(0);

    const result = await service.addParticipants('u1', 'c-group', ['u3']);

    expect(prisma.conversationParticipants.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          conversation_id: 'c-group',
          user_id: 'u3',
          role: 'MEMBER',
        }),
      }),
    );
    expect(result.id).toBe('c-group');
    expect(events.emit).toHaveBeenCalledWith(
      'conversation.updated',
      expect.objectContaining({
        payload: expect.objectContaining({
          action: 'participants.added',
          addedUserIds: ['u3'],
        }),
      }),
    );
  });

  it('addParticipants rejects non-admin members', async () => {
    prisma.conversationParticipants.findFirst.mockResolvedValue({
      user_id: 'u2',
      role: 'MEMBER',
      left_at: null,
    });
    prisma.conversations.findFirst.mockResolvedValue({
      id: 'c-group',
      conversation_type: CONVERSATION_TYPES.GROUP,
      deleted_at: null,
    });

    await expect(
      service.addParticipants('u2', 'c-group', ['u3']),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('removeParticipant sets left_at for members', async () => {
    prisma.conversationParticipants.findFirst
      .mockResolvedValueOnce({
        user_id: 'u1',
        role: 'ADMIN',
        left_at: null,
      })
      .mockResolvedValueOnce({
        user_id: 'u2',
        role: 'MEMBER',
        left_at: null,
      })
      .mockResolvedValueOnce({
        user_id: 'u1',
        role: 'ADMIN',
        left_at: null,
        last_read_message_id: null,
        is_muted: false,
      });
    prisma.conversations.findFirst
      .mockResolvedValueOnce({
        id: 'c-group',
        conversation_type: CONVERSATION_TYPES.GROUP,
        deleted_at: null,
      })
      .mockResolvedValueOnce({
        ...groupConversationRow,
        communications_conversation_participants_conversation_id:
          groupConversationRow.communications_conversation_participants_conversation_id.filter(
            (p) => p.user_id !== 'u2',
          ),
      });
    prisma.conversationParticipants.findMany
      .mockResolvedValueOnce([{ user_id: 'u1' }]) // admins check
      .mockResolvedValueOnce([{ user_id: 'u1' }]); // remaining ids

    const result = await service.removeParticipant('u1', 'c-group', 'u2');

    expect(prisma.conversationParticipants.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          conversation_id: 'c-group',
          user_id: 'u2',
        }),
        data: expect.objectContaining({ left_at: expect.any(Date) }),
      }),
    );
    expect(
      result.participants.every((p: { userId: string }) => p.userId !== 'u2'),
    ).toBe(true);
    expect(events.emit).toHaveBeenCalledWith(
      'conversation.updated',
      expect.objectContaining({
        payload: expect.objectContaining({
          action: 'participants.removed',
          removedUserId: 'u2',
        }),
      }),
    );
  });

  it('removeParticipant forbids removing the last admin', async () => {
    prisma.conversationParticipants.findFirst
      .mockResolvedValueOnce({
        user_id: 'u1',
        role: 'ADMIN',
        left_at: null,
      })
      .mockResolvedValueOnce({
        user_id: 'u1',
        role: 'ADMIN',
        left_at: null,
      });
    prisma.conversations.findFirst.mockResolvedValue({
      id: 'c-group',
      conversation_type: CONVERSATION_TYPES.GROUP,
      deleted_at: null,
    });
    prisma.conversationParticipants.findMany.mockResolvedValue([
      { user_id: 'u1' },
    ]);

    await expect(
      service.removeParticipant('u1', 'c-group', 'u1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
