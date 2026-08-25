/**
 * Core staff messaging — conversations, messages, receipts, reactions, attachments.
 * Reuses EncryptionService, RealtimeService, EventEmitter domain notifications, STORAGE_PROVIDER.
 */

import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { resolveListPagination } from '../../../platform/api/pagination/pagination-query.dto';
import { RealtimeService } from '../../../platform/realtime/realtime.service';
import {
  STORAGE_PROVIDER,
  type StorageProvider,
} from '../../../platform/storage';
import { createDomainEventEnvelope } from '../../notifications/infrastructure/domain-event.envelope';
import { DOMAIN_EVENT_TYPES } from '../../notifications/policy/notification-policy.service';
import { NotificationDispatcherService } from '../../notifications/dispatch/notification-dispatcher.service';
import {
  ALLOWED_REACTIONS,
  CONVERSATION_TYPES,
  DELIVERY_STATUS,
  EDIT_WINDOW_MS,
  MAX_ATTACHMENT_BYTES,
  MESSAGE_EVENTS,
  MESSAGE_TYPES,
  type ConversationType,
  type MessageType,
} from '../constants/messaging.constants';
import type { CreateConversationDto } from '../dto/create-conversation.dto';
import type { ListConversationsQueryDto } from '../dto/list-conversations-query.dto';
import type { ListMessagesQueryDto } from '../dto/list-messages-query.dto';
import type { SearchUsersQueryDto } from '../dto/search-users-query.dto';
import type { SendMessageDto } from '../dto/send-message.dto';
import { MessagePayloadService } from './message-payload.service';

/** Human-readable preview label for a message attachment. */
export function attachmentPreviewLabel(
  mime?: string | null,
  fileName?: string | null,
): string {
  const m = (mime ?? '').toLowerCase();
  if (m.startsWith('image/')) return '📷 Image';
  if (m.startsWith('video/')) return '🎬 Video';
  if (m.startsWith('audio/')) return '🎤 Voice message';
  const name = (fileName ?? '').trim();
  return name ? `📎 ${name}` : '📎 Attachment';
}

function inferMessageTypeFromMime(mime?: string | null): MessageType {
  const m = (mime ?? '').toLowerCase();
  if (m.startsWith('image/')) return MESSAGE_TYPES.IMAGE;
  if (m.startsWith('video/')) return MESSAGE_TYPES.VIDEO;
  if (m.startsWith('audio/')) return MESSAGE_TYPES.AUDIO;
  return MESSAGE_TYPES.FILE;
}

type UploadFile = {
  buffer: Buffer;
  originalname: string;
  mimetype?: string;
  size?: number;
};

@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name);

  public constructor(
    private readonly prisma: PrismaService,
    private readonly payload: MessagePayloadService,
    private readonly events: EventEmitter2,
    @Optional() private readonly realtime?: RealtimeService,
    @Optional()
    private readonly _notificationDispatcher?: NotificationDispatcherService,
    @Optional()
    @Inject(STORAGE_PROVIDER)
    private readonly storage?: StorageProvider,
  ) {}

  private requireDb(): void {
    if (!this.prisma.isConnected) {
      throw new ServiceUnavailableException('Database unavailable');
    }
  }

  public async searchUsers(
    actorId: string,
    query: SearchUsersQueryDto,
  ): Promise<{
    items: Array<{
      userId: string;
      displayName: string;
      role: string;
      department: string | null;
      online: boolean;
      email?: string;
    }>;
    total: number;
    page: number;
    limit: number;
  }> {
    this.requireDb();
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 20);
    const page = Math.max(query.page ?? 1, 1);
    const skip = (page - 1) * limit;
    const q = query.q.trim();

    const where = {
      deleted_at: null as null,
      is_active: true,
      id: { not: actorId },
      OR: [
        { email: { contains: q, mode: 'insensitive' as const } },
        {
          core_profiles_user_id: {
            some: {
              OR: [
                {
                  first_name: { contains: q, mode: 'insensitive' as const },
                },
                {
                  last_name: { contains: q, mode: 'insensitive' as const },
                },
              ],
            },
          },
        },
        {
          core_user_roles_user_id: {
            some: {
              role: { name: { contains: q, mode: 'insensitive' as const } },
            },
          },
        },
        {
          core_staff_profiles_user_id: {
            some: {
              OR: [
                {
                  employee_id: { contains: q, mode: 'insensitive' as const },
                },
                {
                  position: { contains: q, mode: 'insensitive' as const },
                },
              ],
            },
          },
        },
      ],
    };

    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: {
          core_profiles_user_id: true,
          core_user_roles_user_id: { include: { role: true } },
          core_staff_profiles_user_id: true,
        },
        orderBy: { email: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    const deptIds = [
      ...new Set(
        rows
          .flatMap((u) =>
            u.core_staff_profiles_user_id.map((s) => s.department_id),
          )
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const depts = deptIds.length
      ? await this.prisma.departments.findMany({
          where: { id: { in: deptIds } },
          select: { id: true, name: true },
        })
      : [];
    const deptName = Object.fromEntries(depts.map((d) => [d.id, d.name]));
    const presence = this.realtime?.getPresence();

    const items = rows.map((u) => {
      const profile = u.core_profiles_user_id[0];
      const staff = u.core_staff_profiles_user_id[0];
      const email = u.email ?? '';
      const fromProfile = profile
        ? `${profile.first_name} ${profile.last_name}`.trim()
        : '';
      const displayName = fromProfile || email || 'Staff';
      const online = presence?.get(u.id)?.status === 'online';
      return {
        userId: u.id,
        displayName,
        role: u.core_user_roles_user_id[0]?.role.name ?? 'STAFF',
        department: staff?.department_id
          ? (deptName[staff.department_id] ?? null)
          : null,
        online: online ?? false,
        ...(email ? { email } : {}),
      };
    });

    return { items, total, page, limit };
  }

  public async listConversations(
    actorId: string,
    query: ListConversationsQueryDto,
  ) {
    this.requireDb();
    const { take, skip, page, limit } = resolveListPagination({
      page: query.page,
      limit: query.limit,
      defaultLimit: 50,
      maxLimit: 100,
    });
    const search = query.search?.trim();

    const membershipWhere = {
      user_id: actorId,
      left_at: null as null,
      conversation: {
        deleted_at: null as null,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
    };

    const [memberships, total] = await Promise.all([
      this.prisma.conversationParticipants.findMany({
        where: membershipWhere,
        include: {
          conversation: {
            include: {
              communications_conversation_participants_conversation_id: {
                where: { left_at: null },
                include: {
                  user: {
                    include: {
                      core_profiles_user_id: true,
                      core_user_roles_user_id: { include: { role: true } },
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: { conversation: { updated_at: 'desc' } },
        skip,
        take,
      }),
      this.prisma.conversationParticipants.count({ where: membershipWhere }),
    ]);

    const items = await Promise.all(
      memberships.map(async (m) => {
        const c = m.conversation;
        const meta = (c.metadata ?? {}) as Record<string, unknown>;
        const unreadCount = await this.computeUnreadCount(
          c.id,
          actorId,
          m.last_read_message_id,
        );
        const participants =
          c.communications_conversation_participants_conversation_id.map(
            (p) => {
              const profile = p.user.core_profiles_user_id[0];
              return {
                userId: p.user_id,
                displayName: profile
                  ? `${profile.first_name} ${profile.last_name}`.trim()
                  : p.user.email,
                role: p.user.core_user_roles_user_id[0]?.role.name ?? 'STAFF',
                participantRole: p.role,
              };
            },
          );
        return {
          id: c.id,
          type: c.conversation_type,
          name: c.name,
          avatar: c.avatar,
          updatedAt: c.updated_at.toISOString(),
          preview:
            typeof meta.preview === 'string' ? meta.preview : null,
          unreadCount,
          muted: m.is_muted,
          participants,
        };
      }),
    );

    return { items, total, page, limit };
  }

  public async getConversation(actorId: string, conversationId: string) {
    this.requireDb();
    await this.requireMembership(actorId, conversationId);
    const c = await this.prisma.conversations.findFirst({
      where: { id: conversationId, deleted_at: null },
      include: {
        communications_conversation_participants_conversation_id: {
          where: { left_at: null },
          include: {
            user: {
              include: {
                core_profiles_user_id: true,
                core_user_roles_user_id: { include: { role: true } },
              },
            },
          },
        },
      },
    });
    if (!c) throw new NotFoundException('Conversation not found');

    const me = c.communications_conversation_participants_conversation_id.find(
      (p) => p.user_id === actorId,
    );
    const meta = (c.metadata ?? {}) as Record<string, unknown>;
    return {
      id: c.id,
      type: c.conversation_type,
      name: c.name,
      avatar: c.avatar,
      createdBy: c.created_by,
      createdAt: c.created_at.toISOString(),
      updatedAt: c.updated_at.toISOString(),
      preview: typeof meta.preview === 'string' ? meta.preview : null,
      muted: me?.is_muted ?? false,
      unreadCount: await this.computeUnreadCount(
        c.id,
        actorId,
        me?.last_read_message_id ?? null,
      ),
      participants:
        c.communications_conversation_participants_conversation_id.map((p) => {
          const profile = p.user.core_profiles_user_id[0];
          return {
            userId: p.user_id,
            displayName: profile
              ? `${profile.first_name} ${profile.last_name}`.trim()
              : p.user.email,
            role: p.user.core_user_roles_user_id[0]?.role.name ?? 'STAFF',
            participantRole: p.role,
          };
        }),
    };
  }

  public async createConversation(actorId: string, dto: CreateConversationDto) {
    this.requireDb();
    const type = dto.type as ConversationType;
    const others = [
      ...new Set(dto.participantIds.filter((id) => id !== actorId)),
    ];
    if (!others.length) {
      throw new BadRequestException('At least one other participant is required');
    }

    if (type === CONVERSATION_TYPES.DIRECT) {
      if (others.length !== 1) {
        throw new BadRequestException(
          'DIRECT conversations require exactly one other participant',
        );
      }
      const existing = await this.findExistingDirect(actorId, others[0]);
      if (existing) {
        if (dto.initialMessage?.trim()) {
          await this.sendMessage(actorId, existing.id, {
            body: dto.initialMessage.trim(),
            messageType: MESSAGE_TYPES.TEXT,
          });
        }
        return this.getConversation(actorId, existing.id);
      }
    }

    if (type === CONVERSATION_TYPES.GROUP) {
      if (!dto.name?.trim()) {
        throw new BadRequestException('GROUP conversations require a name');
      }
      if (others.length < 1) {
        throw new BadRequestException(
          'GROUP conversations require at least one other participant',
        );
      }
    }

    const allUserIds = [actorId, ...others];
    const users = await this.prisma.user.findMany({
      where: { id: { in: allUserIds }, deleted_at: null, is_active: true },
      select: { id: true },
    });
    if (users.length !== allUserIds.length) {
      throw new BadRequestException('One or more participants are invalid');
    }

    const conversation = await this.prisma.$transaction(async (tx) => {
      const created = await tx.conversations.create({
        data: {
          conversation_type: type,
          name: dto.name?.trim() || null,
          created_by: actorId,
          metadata: {
            preview: dto.initialMessage?.trim()?.slice(0, 160) || null,
          },
        },
      });
      await tx.conversationParticipants.createMany({
        data: allUserIds.map((userId) => ({
          conversation_id: created.id,
          user_id: userId,
          role: userId === actorId ? 'ADMIN' : 'MEMBER',
        })),
      });
      return created;
    });

    this.events.emit(
      MESSAGE_EVENTS.CONVERSATION_CREATED,
      createDomainEventEnvelope({
        type: MESSAGE_EVENTS.CONVERSATION_CREATED,
        actorId,
        payload: {
          conversationId: conversation.id,
          type,
          participantIds: allUserIds,
        },
      }),
    );

    if (dto.initialMessage?.trim()) {
      await this.sendMessage(actorId, conversation.id, {
        body: dto.initialMessage.trim(),
        messageType: MESSAGE_TYPES.TEXT,
      });
    }

    return this.getConversation(actorId, conversation.id);
  }

  public async listMessages(
    actorId: string,
    conversationId: string,
    query: ListMessagesQueryDto,
  ) {
    this.requireDb();
    await this.requireMembership(actorId, conversationId);
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 100);

    let cursorCreatedAt: Date | undefined;
    if (query.cursor) {
      const cursorMsg = await this.prisma.messages.findFirst({
        where: { id: query.cursor, conversation_id: conversationId },
        select: { created_at: true },
      });
      if (!cursorMsg) {
        throw new BadRequestException('Invalid cursor');
      }
      cursorCreatedAt = cursorMsg.created_at;
    }

    const before = query.before ? new Date(query.before) : undefined;
    if (before && Number.isNaN(before.getTime())) {
      throw new BadRequestException('Invalid before date');
    }

    const rows = await this.prisma.messages.findMany({
      where: {
        conversation_id: conversationId,
        ...(cursorCreatedAt
          ? { created_at: { lt: cursorCreatedAt } }
          : {}),
        ...(before ? { created_at: { lt: before } } : {}),
      },
      include: {
        sender: { include: { core_profiles_user_id: true } },
        parent_message: {
          include: {
            communications_message_attachments_message_id: {
              take: 1,
              orderBy: { created_at: 'asc' },
            },
          },
        },
        communications_message_attachments_message_id: true,
        communications_message_reactions_message_id: true,
        communications_message_delivery_receipts_message_id: true,
      },
      orderBy: { created_at: 'desc' },
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? page[page.length - 1]?.id : null;
    const chronological = [...page].reverse();

    const mentionIdSet = new Set<string>();
    const unpackedByMessageId = new Map<
      string,
      { text: string; mentionedUserIds: string[] }
    >();
    for (const m of chronological) {
      if (m.is_deleted) continue;
      const unpacked = this.payload.unpack(m.encrypted_payload);
      const rawMentions = unpacked.extras?.mentionedUserIds;
      const mentionedUserIds = Array.isArray(rawMentions)
        ? rawMentions.filter((id): id is string => typeof id === 'string')
        : [];
      for (const id of mentionedUserIds) mentionIdSet.add(id);
      unpackedByMessageId.set(m.id, {
        text: unpacked.text,
        mentionedUserIds,
      });
    }
    const mentionNames = await this.resolveDisplayNames([...mentionIdSet]);

    const items = chronological.map((m) => {
      const profile = m.sender.core_profiles_user_id[0];
      const deleted = m.is_deleted;
      const unpacked = unpackedByMessageId.get(m.id);
      const body = deleted ? null : (unpacked?.text ?? null);
      const parentPreview = this.buildParentPreview(
        m.parent_message
          ? {
              is_deleted: m.parent_message.is_deleted,
              encrypted_payload: m.parent_message.encrypted_payload,
              attachments:
                m.parent_message.communications_message_attachments_message_id,
            }
          : null,
      );
      const reactionsMap = new Map<string, string[]>();
      for (const r of m.communications_message_reactions_message_id) {
        const list = reactionsMap.get(r.reaction_type) ?? [];
        list.push(r.user_id);
        reactionsMap.set(r.reaction_type, list);
      }
      const receipts = m.communications_message_delivery_receipts_message_id;
      const delivery = this.aggregateDeliveryStatus(
        m.sender_id,
        actorId,
        receipts,
      );
      const mentions = (unpacked?.mentionedUserIds ?? []).map((userId) => ({
        userId,
        displayName: mentionNames.get(userId) ?? 'Staff',
      }));

      return {
        id: m.id,
        conversationId: m.conversation_id,
        senderId: m.sender_id,
        senderName: profile
          ? `${profile.first_name} ${profile.last_name}`.trim()
          : m.sender.email,
        messageType: m.message_type,
        body,
        isDeleted: deleted,
        editedAt: m.edited_at?.toISOString() ?? null,
        createdAt: m.created_at.toISOString(),
        parentMessageId: m.parent_message_id,
        parentPreview,
        mentions,
        attachments: m.communications_message_attachments_message_id.map(
          (a) => ({
            id: a.id,
            fileName: a.file_name,
            mimeType: a.mime_type,
            fileSize: a.file_size != null ? Number(a.file_size) : null,
          }),
        ),
        reactions: [...reactionsMap.entries()].map(([reactionType, userIds]) => ({
          reactionType,
          count: userIds.length,
          userIds,
        })),
        deliveryStatus: delivery,
      };
    });

    return { items, nextCursor };
  }

  public async sendMessage(
    actorId: string,
    conversationId: string,
    dto: SendMessageDto,
  ) {
    this.requireDb();
    const body = dto.body?.trim() ?? '';
    const hasAttachments = Boolean(dto.attachmentRefs?.length);
    const firstMime = dto.attachmentRefs?.[0]?.mimeType ?? null;
    const messageType = (
      dto.messageType ??
      (hasAttachments
        ? inferMessageTypeFromMime(firstMime)
        : MESSAGE_TYPES.TEXT)
    ) as MessageType;
    if (!Object.values(MESSAGE_TYPES).includes(messageType)) {
      throw new BadRequestException(`Invalid message type: ${messageType}`);
    }
    if (!body && !hasAttachments && messageType === MESSAGE_TYPES.TEXT) {
      throw new BadRequestException('Message body is required');
    }

    const mentionedUserIds = [
      ...new Set(
        (dto.mentionedUserIds ?? []).filter(
          (id): id is string => typeof id === 'string' && id.length > 0,
        ),
      ),
    ].slice(0, 20);

    const result = await this.prisma.$transaction(async (tx) => {
      const membership = await tx.conversationParticipants.findFirst({
        where: {
          conversation_id: conversationId,
          user_id: actorId,
          left_at: null,
        },
      });
      if (!membership) {
        throw new ForbiddenException('Not a conversation participant');
      }

      const conversation = await tx.conversations.findFirst({
        where: { id: conversationId, deleted_at: null },
      });
      if (!conversation) {
        throw new NotFoundException('Conversation not found');
      }

      if (dto.parentMessageId) {
        const parent = await tx.messages.findFirst({
          where: {
            id: dto.parentMessageId,
            conversation_id: conversationId,
          },
          select: { id: true },
        });
        if (!parent) {
          throw new BadRequestException(
            'Parent message must belong to this conversation',
          );
        }
      }

      const participants = await tx.conversationParticipants.findMany({
        where: { conversation_id: conversationId, left_at: null },
        select: { user_id: true, is_muted: true },
      });
      const participantIds = new Set(participants.map((p) => p.user_id));
      for (const mentionedId of mentionedUserIds) {
        if (!participantIds.has(mentionedId)) {
          throw new BadRequestException(
            'Mentioned users must be active conversation participants',
          );
        }
      }

      const encrypted = this.payload.pack(body, {
        ...(dto.clientMessageId
          ? { clientMessageId: dto.clientMessageId }
          : {}),
        ...(mentionedUserIds.length ? { mentionedUserIds } : {}),
      });

      const message = await tx.messages.create({
        data: {
          conversation_id: conversationId,
          sender_id: actorId,
          parent_message_id: dto.parentMessageId ?? null,
          message_type: messageType,
          encrypted_payload: encrypted,
        },
      });

      if (dto.attachmentRefs?.length) {
        for (const ref of dto.attachmentRefs) {
          if (!ref.key.startsWith(`communications/${conversationId}/`)) {
            throw new BadRequestException('Invalid attachment key');
          }
          await tx.messageAttachments.create({
            data: {
              message_id: message.id,
              file_path: ref.key,
              file_name: ref.fileName,
              mime_type: ref.mimeType ?? null,
              file_size:
                ref.fileSize != null ? BigInt(ref.fileSize) : null,
            },
          });
        }
      }

      const others = participants.filter((p) => p.user_id !== actorId);
      if (others.length) {
        await tx.messageDeliveryReceipts.createMany({
          data: others.map((p) => ({
            message_id: message.id,
            recipient_id: p.user_id,
            delivery_status: DELIVERY_STATUS.SENT,
          })),
        });
      }

      const meta = (conversation.metadata ?? {}) as Record<string, unknown>;
      const firstRef = dto.attachmentRefs?.[0];
      const preview = body
        ? body.slice(0, 160)
        : hasAttachments
          ? attachmentPreviewLabel(firstRef?.mimeType, firstRef?.fileName)
          : '';
      await tx.conversations.update({
        where: { id: conversationId },
        data: {
          metadata: { ...meta, preview },
          updated_at: new Date(),
        },
      });

      return {
        message,
        participants,
        preview,
      };
    });

    const recipientUserIds = [
      ...new Set(
        result.participants
          .filter((p) => p.user_id !== actorId)
          .map((p) => p.user_id)
          .concat(
            mentionedUserIds.filter((id) => id !== actorId),
          ),
      ),
    ];
    const mutedUserIds = result.participants
      .filter((p) => p.user_id !== actorId && p.is_muted)
      .map((p) => p.user_id);

    const [senderName, attachments, parentPreview, mentionNames] =
      await Promise.all([
        this.resolveDisplayName(actorId),
        this.prisma.messageAttachments.findMany({
          where: { message_id: result.message.id },
          select: {
            id: true,
            file_name: true,
            mime_type: true,
            file_size: true,
          },
        }),
        this.resolveParentPreview(dto.parentMessageId ?? null),
        this.resolveDisplayNames(mentionedUserIds),
      ]);

    const mentions = mentionedUserIds.map((userId) => ({
      userId,
      displayName: mentionNames.get(userId) ?? 'Staff',
    }));

    const createdAt = result.message.created_at.toISOString();
    const richMessage = {
      messageId: result.message.id,
      id: result.message.id,
      conversationId,
      senderId: actorId,
      senderName,
      messageType,
      body,
      isDeleted: false,
      editedAt: null as string | null,
      createdAt,
      parentMessageId: dto.parentMessageId ?? null,
      parentPreview,
      mentions,
      attachments: attachments.map((a) => ({
        id: a.id,
        fileName: a.file_name,
        mimeType: a.mime_type,
        fileSize: a.file_size != null ? Number(a.file_size) : null,
      })),
      reactions: [] as Array<{
        reactionType: string;
        count: number;
        userIds: string[];
      }>,
      deliveryStatus: DELIVERY_STATUS.SENT,
      preview: result.preview,
      clientMessageId: dto.clientMessageId ?? null,
    };

    await this.publishRealtime(MESSAGE_EVENTS.MESSAGE_CREATED, {
      room: `conversation:${conversationId}`,
      userIds: result.participants.map((p) => p.user_id),
      payload: richMessage,
    });

    const envelope = createDomainEventEnvelope({
      type: DOMAIN_EVENT_TYPES.MESSAGE_CREATED,
      actorId,
      payload: {
        messageId: result.message.id,
        conversationId,
        senderId: actorId,
        senderName,
        preview: result.preview,
        recipientUserIds,
        mutedUserIds,
        mentionedUserIds,
      },
    });
    this.events.emit(DOMAIN_EVENT_TYPES.MESSAGE_CREATED, envelope);

    return richMessage;
  }

  public async editMessage(
    actorId: string,
    messageId: string,
    body: string,
  ) {
    this.requireDb();
    const text = body.trim();
    if (!text) throw new BadRequestException('Message body is required');

    const message = await this.prisma.messages.findFirst({
      where: { id: messageId, is_deleted: false },
    });
    if (!message) throw new NotFoundException('Message not found');
    if (message.sender_id !== actorId) {
      throw new ForbiddenException('Only the sender can edit this message');
    }
    await this.requireMembership(actorId, message.conversation_id);

    const age = Date.now() - message.created_at.getTime();
    if (age > EDIT_WINDOW_MS) {
      throw new BadRequestException('Edit window has expired');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.messageEditHistory.create({
        data: {
          message_id: message.id,
          original_encrypted_payload: message.encrypted_payload,
          edited_by: actorId,
        },
      });
      return tx.messages.update({
        where: { id: message.id },
        data: {
          encrypted_payload: this.payload.pack(text),
          edited_at: new Date(),
        },
      });
    });

    await this.publishRealtime(MESSAGE_EVENTS.MESSAGE_UPDATED, {
      room: `conversation:${message.conversation_id}`,
      userIds: await this.participantUserIds(message.conversation_id),
      payload: {
        messageId: message.id,
        id: message.id,
        conversationId: message.conversation_id,
        body: text,
        editedAt: updated.edited_at?.toISOString() ?? null,
        isDeleted: false,
      },
    });

    return {
      id: updated.id,
      body: text,
      editedAt: updated.edited_at?.toISOString() ?? null,
    };
  }

  public async softDeleteMessage(actorId: string, messageId: string) {
    this.requireDb();
    const message = await this.prisma.messages.findFirst({
      where: { id: messageId },
    });
    if (!message) throw new NotFoundException('Message not found');
    if (message.sender_id !== actorId) {
      throw new ForbiddenException('Only the sender can delete this message');
    }
    await this.requireMembership(actorId, message.conversation_id);

    if (!message.is_deleted) {
      await this.prisma.messages.update({
        where: { id: messageId },
        data: { is_deleted: true },
      });
    }

    await this.publishRealtime(MESSAGE_EVENTS.MESSAGE_DELETED, {
      room: `conversation:${message.conversation_id}`,
      userIds: await this.participantUserIds(message.conversation_id),
      payload: {
        messageId,
        id: messageId,
        conversationId: message.conversation_id,
        isDeleted: true,
        body: null,
      },
    });

    return { id: messageId, isDeleted: true };
  }

  public async addReaction(
    actorId: string,
    messageId: string,
    reactionType: string,
  ) {
    this.requireDb();
    if (!ALLOWED_REACTIONS.includes(reactionType as (typeof ALLOWED_REACTIONS)[number])) {
      throw new BadRequestException('Reaction not allowed');
    }
    const message = await this.prisma.messages.findFirst({
      where: { id: messageId, is_deleted: false },
    });
    if (!message) throw new NotFoundException('Message not found');
    await this.requireMembership(actorId, message.conversation_id);

    const reaction = await this.prisma.messageReactions.upsert({
      where: {
        message_id_user_id_reaction_type: {
          message_id: messageId,
          user_id: actorId,
          reaction_type: reactionType,
        },
      },
      create: {
        message_id: messageId,
        user_id: actorId,
        reaction_type: reactionType,
      },
      update: {},
    });

    await this.publishRealtime(MESSAGE_EVENTS.MESSAGE_REACTION_ADDED, {
      room: `conversation:${message.conversation_id}`,
      userIds: await this.participantUserIds(message.conversation_id),
      payload: {
        messageId,
        conversationId: message.conversation_id,
        userId: actorId,
        reactionType,
      },
    });

    return {
      id: reaction.id,
      messageId,
      reactionType,
      userId: actorId,
    };
  }

  public async removeReaction(
    actorId: string,
    messageId: string,
    reactionType: string,
  ) {
    this.requireDb();
    const message = await this.prisma.messages.findFirst({
      where: { id: messageId },
    });
    if (!message) throw new NotFoundException('Message not found');
    await this.requireMembership(actorId, message.conversation_id);

    await this.prisma.messageReactions.deleteMany({
      where: {
        message_id: messageId,
        user_id: actorId,
        reaction_type: reactionType,
      },
    });

    await this.publishRealtime(MESSAGE_EVENTS.MESSAGE_REACTION_REMOVED, {
      room: `conversation:${message.conversation_id}`,
      userIds: await this.participantUserIds(message.conversation_id),
      payload: {
        messageId,
        conversationId: message.conversation_id,
        userId: actorId,
        reactionType,
      },
    });

    return { ok: true };
  }

  public async markRead(
    actorId: string,
    conversationId: string,
    upToMessageId: string,
  ) {
    this.requireDb();
    await this.requireMembership(actorId, conversationId);

    const upTo = await this.prisma.messages.findFirst({
      where: { id: upToMessageId, conversation_id: conversationId },
    });
    if (!upTo) throw new NotFoundException('Message not found');

    await this.prisma.$transaction(async (tx) => {
      await tx.conversationParticipants.updateMany({
        where: {
          conversation_id: conversationId,
          user_id: actorId,
          left_at: null,
        },
        data: { last_read_message_id: upToMessageId },
      });

      await tx.messageDeliveryReceipts.updateMany({
        where: {
          recipient_id: actorId,
          delivery_status: { not: DELIVERY_STATUS.READ },
          message: {
            conversation_id: conversationId,
            created_at: { lte: upTo.created_at },
            sender_id: { not: actorId },
          },
        },
        data: {
          delivery_status: DELIVERY_STATUS.READ,
          read_at: new Date(),
        },
      });
    });

    const payload = {
      conversationId,
      userId: actorId,
      upToMessageId,
    };
    await this.publishRealtime(MESSAGE_EVENTS.CONVERSATION_READ, {
      room: `conversation:${conversationId}`,
      userIds: await this.participantUserIds(conversationId),
      payload,
    });
    this.events.emit(MESSAGE_EVENTS.MESSAGE_READ, payload);

    return { ok: true, upToMessageId };
  }

  public async markDelivered(actorId: string, messageIds: string[]) {
    this.requireDb();
    const ids = [...new Set(messageIds)];
    if (!ids.length) return { updated: 0 };

    const result = await this.prisma.messageDeliveryReceipts.updateMany({
      where: {
        recipient_id: actorId,
        message_id: { in: ids },
        delivery_status: DELIVERY_STATUS.SENT,
      },
      data: {
        delivery_status: DELIVERY_STATUS.DELIVERED,
        delivered_at: new Date(),
      },
    });

    if (result.count > 0) {
      const messages = await this.prisma.messages.findMany({
        where: { id: { in: ids } },
        select: { id: true, conversation_id: true, sender_id: true },
      });
      const byConversation = new Map<
        string,
        { messageIds: string[]; senderIds: Set<string> }
      >();
      for (const m of messages) {
        const entry = byConversation.get(m.conversation_id) ?? {
          messageIds: [],
          senderIds: new Set<string>(),
        };
        entry.messageIds.push(m.id);
        entry.senderIds.add(m.sender_id);
        byConversation.set(m.conversation_id, entry);
      }
      for (const [conversationId, group] of byConversation) {
        await this.publishRealtime(MESSAGE_EVENTS.MESSAGE_DELIVERED, {
          room: `conversation:${conversationId}`,
          userIds: [...group.senderIds],
          payload: {
            conversationId,
            messageIds: group.messageIds,
            userId: actorId,
            deliveryStatus: DELIVERY_STATUS.DELIVERED,
          },
        });
      }
    }

    return { updated: result.count };
  }

  public async setMuted(
    actorId: string,
    conversationId: string,
    muted: boolean,
  ) {
    this.requireDb();
    await this.requireMembership(actorId, conversationId);
    await this.prisma.conversationParticipants.updateMany({
      where: {
        conversation_id: conversationId,
        user_id: actorId,
        left_at: null,
      },
      data: { is_muted: muted },
    });
    return { conversationId, muted };
  }

  public async addParticipants(
    actorId: string,
    conversationId: string,
    userIds: string[],
    actorSystemRole?: string,
  ) {
    this.requireDb();
    const membership = await this.requireMembership(actorId, conversationId);
    const conversation = await this.prisma.conversations.findFirst({
      where: { id: conversationId, deleted_at: null },
      select: { id: true, conversation_type: true },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');

    const manageable = new Set<string>([
      CONVERSATION_TYPES.GROUP,
      CONVERSATION_TYPES.DEPARTMENT,
      CONVERSATION_TYPES.TEAM,
    ]);
    if (!manageable.has(conversation.conversation_type)) {
      throw new BadRequestException(
        'Participants can only be managed for GROUP, DEPARTMENT, or TEAM conversations',
      );
    }

    const isSuper = actorSystemRole === 'SUPER_ADMIN';
    if (membership.role !== 'ADMIN' && !isSuper) {
      throw new ForbiddenException('Only conversation admins can add members');
    }

    const unique = [
      ...new Set(userIds.filter((id) => typeof id === 'string' && id.length > 0)),
    ];
    if (!unique.length) {
      throw new BadRequestException('At least one userId is required');
    }

    const users = await this.prisma.user.findMany({
      where: { id: { in: unique }, deleted_at: null, is_active: true },
      select: { id: true },
    });
    if (users.length !== unique.length) {
      throw new BadRequestException('One or more users are invalid');
    }

    for (const userId of unique) {
      const existing = await this.prisma.conversationParticipants.findFirst({
        where: { conversation_id: conversationId, user_id: userId },
      });
      if (existing) {
        if (existing.left_at != null) {
          await this.prisma.conversationParticipants.updateMany({
            where: { conversation_id: conversationId, user_id: userId },
            data: { left_at: null, joined_at: new Date(), role: 'MEMBER' },
          });
        }
      } else {
        await this.prisma.conversationParticipants.create({
          data: {
            conversation_id: conversationId,
            user_id: userId,
            role: 'MEMBER',
          },
        });
      }
    }

    await this.prisma.conversations.update({
      where: { id: conversationId },
      data: { updated_at: new Date() },
    });

    const detail = await this.getConversation(actorId, conversationId);
    const participantIds = detail.participants.map(
      (p: { userId: string }) => p.userId,
    );
    await this.publishRealtime(MESSAGE_EVENTS.CONVERSATION_UPDATED, {
      room: `conversation:${conversationId}`,
      userIds: participantIds,
      payload: {
        conversationId,
        participants: detail.participants,
        action: 'participants.added',
        addedUserIds: unique,
      },
    });
    this.events.emit(
      MESSAGE_EVENTS.CONVERSATION_UPDATED,
      createDomainEventEnvelope({
        type: MESSAGE_EVENTS.CONVERSATION_UPDATED,
        actorId,
        payload: {
          conversationId,
          action: 'participants.added',
          addedUserIds: unique,
        },
      }),
    );
    return detail;
  }

  public async removeParticipant(
    actorId: string,
    conversationId: string,
    targetUserId: string,
    actorSystemRole?: string,
  ) {
    this.requireDb();
    const membership = await this.requireMembership(actorId, conversationId);
    const conversation = await this.prisma.conversations.findFirst({
      where: { id: conversationId, deleted_at: null },
      select: { id: true, conversation_type: true },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');

    const manageable = new Set<string>([
      CONVERSATION_TYPES.GROUP,
      CONVERSATION_TYPES.DEPARTMENT,
      CONVERSATION_TYPES.TEAM,
    ]);
    if (!manageable.has(conversation.conversation_type)) {
      throw new BadRequestException(
        'Participants can only be managed for GROUP, DEPARTMENT, or TEAM conversations',
      );
    }

    const leavingSelf = actorId === targetUserId;
    const isSuper = actorSystemRole === 'SUPER_ADMIN';
    if (!leavingSelf && membership.role !== 'ADMIN' && !isSuper) {
      throw new ForbiddenException(
        'Only conversation admins can remove other members',
      );
    }

    const target = await this.prisma.conversationParticipants.findFirst({
      where: {
        conversation_id: conversationId,
        user_id: targetUserId,
        left_at: null,
      },
    });
    if (!target) {
      throw new NotFoundException('Participant not found');
    }

    const admins = await this.prisma.conversationParticipants.findMany({
      where: {
        conversation_id: conversationId,
        left_at: null,
        role: 'ADMIN',
      },
      select: { user_id: true },
    });
    if (
      target.role === 'ADMIN' &&
      admins.length <= 1 &&
      admins.some((a) => a.user_id === targetUserId)
    ) {
      throw new BadRequestException(
        'Cannot remove the last admin from the conversation',
      );
    }

    await this.prisma.conversationParticipants.updateMany({
      where: {
        conversation_id: conversationId,
        user_id: targetUserId,
        left_at: null,
      },
      data: { left_at: new Date() },
    });

    await this.prisma.conversations.update({
      where: { id: conversationId },
      data: { updated_at: new Date() },
    });

    // Actor may have left — use remaining participant list for realtime fanout
    const remainingIds = await this.participantUserIds(conversationId);
    const fanout = [...new Set([...remainingIds, actorId, targetUserId])];

    let detail: Awaited<ReturnType<MessagingService['getConversation']>> | null =
      null;
    if (remainingIds.includes(actorId)) {
      detail = await this.getConversation(actorId, conversationId);
    } else {
      // Build a lightweight snapshot without membership check for emit
      const c = await this.prisma.conversations.findFirst({
        where: { id: conversationId, deleted_at: null },
        include: {
          communications_conversation_participants_conversation_id: {
            where: { left_at: null },
            include: {
              user: {
                include: {
                  core_profiles_user_id: true,
                  core_user_roles_user_id: { include: { role: true } },
                },
              },
            },
          },
        },
      });
      detail = c
        ? {
            id: c.id,
            type: c.conversation_type,
            name: c.name,
            avatar: c.avatar,
            createdBy: c.created_by,
            createdAt: c.created_at.toISOString(),
            updatedAt: c.updated_at.toISOString(),
            preview: null,
            muted: false,
            unreadCount: 0,
            participants:
              c.communications_conversation_participants_conversation_id.map(
                (p) => {
                  const profile = p.user.core_profiles_user_id[0];
                  return {
                    userId: p.user_id,
                    displayName: profile
                      ? `${profile.first_name} ${profile.last_name}`.trim()
                      : p.user.email,
                    role:
                      p.user.core_user_roles_user_id[0]?.role.name ?? 'STAFF',
                    participantRole: p.role,
                  };
                },
              ),
          }
        : null;
    }

    await this.publishRealtime(MESSAGE_EVENTS.CONVERSATION_UPDATED, {
      room: `conversation:${conversationId}`,
      userIds: fanout,
      payload: {
        conversationId,
        participants: detail?.participants ?? [],
        action: 'participants.removed',
        removedUserId: targetUserId,
      },
    });
    this.events.emit(
      MESSAGE_EVENTS.CONVERSATION_UPDATED,
      createDomainEventEnvelope({
        type: MESSAGE_EVENTS.CONVERSATION_UPDATED,
        actorId,
        payload: {
          conversationId,
          action: 'participants.removed',
          removedUserId: targetUserId,
        },
      }),
    );

    return (
      detail ?? {
        id: conversationId,
        type: conversation.conversation_type,
        name: null,
        avatar: null,
        updatedAt: new Date().toISOString(),
        preview: null,
        muted: false,
        unreadCount: 0,
        participants: [],
      }
    );
  }

  public async uploadAttachment(
    actorId: string,
    conversationId: string,
    file: UploadFile,
  ) {
    this.requireDb();
    await this.requireMembership(actorId, conversationId);
    if (!this.storage) {
      throw new ServiceUnavailableException('Storage is not configured');
    }
    if (!file?.buffer?.length) {
      throw new BadRequestException('File is required');
    }
    const size = file.size ?? file.buffer.length;
    if (size > MAX_ATTACHMENT_BYTES) {
      throw new BadRequestException('File exceeds 15MB limit');
    }

    const safeName = (file.originalname || 'file')
      .replace(/[^\w.\-]+/g, '_')
      .slice(0, 180);
    const key = `communications/${conversationId}/${randomUUID()}-${safeName}`;
    await this.storage.put(key, file.buffer, {
      contentType: file.mimetype,
    });

    return {
      key,
      fileName: file.originalname || safeName,
      mimeType: file.mimetype ?? null,
      fileSize: size,
    };
  }

  public async getAttachmentDownload(actorId: string, attachmentId: string) {
    this.requireDb();
    const attachment = await this.prisma.messageAttachments.findFirst({
      where: { id: attachmentId },
      include: {
        message: { select: { conversation_id: true } },
      },
    });
    if (!attachment) throw new NotFoundException('Attachment not found');
    await this.requireMembership(actorId, attachment.message.conversation_id);

    if (!this.storage) {
      throw new ServiceUnavailableException('Storage is not configured');
    }

    let url: string | null = null;
    try {
      url = await this.storage.signedUrl(attachment.file_path, {
        expiresInSeconds: 300,
        operation: 'get',
      });
    } catch {
      this.logger.debug(`signedUrl unavailable for attachment=${attachmentId}`);
    }

    return {
      id: attachment.id,
      fileName: attachment.file_name,
      mimeType: attachment.mime_type,
      fileSize:
        attachment.file_size != null ? Number(attachment.file_size) : null,
      url,
      key: attachment.file_path,
    };
  }

  public async getAttachmentBuffer(actorId: string, attachmentId: string) {
    this.requireDb();
    const attachment = await this.prisma.messageAttachments.findFirst({
      where: { id: attachmentId },
      include: {
        message: { select: { conversation_id: true } },
      },
    });
    if (!attachment) throw new NotFoundException('Attachment not found');
    await this.requireMembership(actorId, attachment.message.conversation_id);

    if (!this.storage) {
      throw new ServiceUnavailableException('Storage is not configured');
    }

    const buffer = await this.storage.get(attachment.file_path);
    return {
      id: attachment.id,
      fileName: attachment.file_name,
      mimeType: attachment.mime_type,
      fileSize:
        attachment.file_size != null ? Number(attachment.file_size) : null,
      buffer,
    };
  }

  private async findExistingDirect(actorId: string, peerId: string) {
    const rows = await this.prisma.conversationParticipants.findMany({
      where: {
        user_id: actorId,
        left_at: null,
        conversation: {
          conversation_type: CONVERSATION_TYPES.DIRECT,
          deleted_at: null,
        },
      },
      include: {
        conversation: {
          include: {
            communications_conversation_participants_conversation_id: {
              where: { left_at: null },
            },
          },
        },
      },
    });

    for (const row of rows) {
      const parts =
        row.conversation.communications_conversation_participants_conversation_id;
      if (parts.length !== 2) continue;
      const ids = new Set(parts.map((p) => p.user_id));
      if (ids.has(actorId) && ids.has(peerId)) {
        return row.conversation;
      }
    }
    return null;
  }

  private async requireMembership(actorId: string, conversationId: string) {
    const membership = await this.prisma.conversationParticipants.findFirst({
      where: {
        conversation_id: conversationId,
        user_id: actorId,
        left_at: null,
      },
    });
    if (!membership) {
      throw new ForbiddenException('Not a conversation participant');
    }
    return membership;
  }

  private async computeUnreadCount(
    conversationId: string,
    actorId: string,
    lastReadMessageId: string | null | undefined,
  ): Promise<number> {
    let after: Date | undefined;
    if (lastReadMessageId) {
      const last = await this.prisma.messages.findFirst({
        where: { id: lastReadMessageId },
        select: { created_at: true },
      });
      after = last?.created_at;
    }
    return this.prisma.messages.count({
      where: {
        conversation_id: conversationId,
        is_deleted: false,
        sender_id: { not: actorId },
        ...(after ? { created_at: { gt: after } } : {}),
      },
    });
  }

  private async participantUserIds(conversationId: string): Promise<string[]> {
    const rows = await this.prisma.conversationParticipants.findMany({
      where: { conversation_id: conversationId, left_at: null },
      select: { user_id: true },
    });
    return rows.map((r) => r.user_id);
  }

  private aggregateDeliveryStatus(
    senderId: string,
    actorId: string,
    receipts: Array<{ recipient_id: string; delivery_status: string }>,
  ): string | null {
    if (senderId === actorId) {
      if (!receipts.length) return DELIVERY_STATUS.SENT;
      if (receipts.every((r) => r.delivery_status === DELIVERY_STATUS.READ)) {
        return DELIVERY_STATUS.READ;
      }
      if (
        receipts.some(
          (r) =>
            r.delivery_status === DELIVERY_STATUS.DELIVERED ||
            r.delivery_status === DELIVERY_STATUS.READ,
        )
      ) {
        return DELIVERY_STATUS.DELIVERED;
      }
      return DELIVERY_STATUS.SENT;
    }
    return (
      receipts.find((r) => r.recipient_id === actorId)?.delivery_status ?? null
    );
  }

  private async resolveDisplayName(userId: string): Promise<string> {
    const names = await this.resolveDisplayNames([userId]);
    return names.get(userId) ?? 'Staff';
  }

  private async resolveDisplayNames(
    userIds: string[],
  ): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    const unique = [...new Set(userIds.filter(Boolean))];
    if (!unique.length) return result;
    const users = await this.prisma.user.findMany({
      where: { id: { in: unique } },
      include: { core_profiles_user_id: true },
    });
    for (const user of users) {
      const profile = user.core_profiles_user_id[0];
      const fromProfile = profile
        ? `${profile.first_name} ${profile.last_name}`.trim()
        : '';
      result.set(user.id, fromProfile || user.email || 'Staff');
    }
    return result;
  }

  private buildParentPreview(
    parent: {
      is_deleted: boolean;
      encrypted_payload: string;
      attachments?: Array<{
        mime_type: string | null;
        file_name: string;
      }>;
    } | null,
  ): string | null {
    if (!parent) return null;
    if (parent.is_deleted) return 'This message was deleted';
    const parentText = this.payload.unpack(parent.encrypted_payload).text;
    if (parentText.trim()) return parentText.slice(0, 120);
    const first = parent.attachments?.[0];
    if (first) {
      return attachmentPreviewLabel(first.mime_type, first.file_name);
    }
    return 'Attachment';
  }

  private async resolveParentPreview(
    parentMessageId: string | null,
  ): Promise<string | null> {
    if (!parentMessageId) return null;
    const parent = await this.prisma.messages.findFirst({
      where: { id: parentMessageId },
      select: {
        encrypted_payload: true,
        is_deleted: true,
        communications_message_attachments_message_id: {
          take: 1,
          orderBy: { created_at: 'asc' },
          select: { mime_type: true, file_name: true },
        },
      },
    });
    if (!parent) return null;
    return this.buildParentPreview({
      is_deleted: parent.is_deleted,
      encrypted_payload: parent.encrypted_payload,
      attachments: parent.communications_message_attachments_message_id,
    });
  }

  private async publishRealtime(
    type: string,
    opts: {
      room: string;
      userIds: string[];
      payload: Record<string, unknown>;
    },
  ): Promise<void> {
    if (!this.realtime) return;
    try {
      await this.realtime.publishToRoom(opts.room, {
        type,
        payload: opts.payload,
      });
      await Promise.all(
        opts.userIds.map((userId) =>
          this.realtime!.publishToUser(userId, {
            type,
            payload: opts.payload,
          }),
        ),
      );
    } catch (err) {
      this.logger.warn(
        `Realtime publish failed type=${type}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
