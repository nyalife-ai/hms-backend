/**
 * Messaging / communication domain constants.
 */

export const MESSAGE_EVENTS = {
  MESSAGE_CREATED: 'message.created',
  MESSAGE_UPDATED: 'message.updated',
  MESSAGE_DELETED: 'message.deleted',
  MESSAGE_REACTION_ADDED: 'message.reaction_added',
  MESSAGE_REACTION_REMOVED: 'message.reaction_removed',
  CONVERSATION_CREATED: 'conversation.created',
  CONVERSATION_UPDATED: 'conversation.updated',
  CONVERSATION_READ: 'conversation.read',
  MESSAGE_TYPING_STARTED: 'message.typing.started',
  MESSAGE_TYPING_STOPPED: 'message.typing.stopped',
  PRESENCE_UPDATED: 'presence.updated',
  MESSAGE_READ: 'message.read',
} as const;

export const ALLOWED_REACTIONS = [
  '👍',
  '❤️',
  '😂',
  '😮',
  '😢',
  '🙏',
] as const;

export type AllowedReaction = (typeof ALLOWED_REACTIONS)[number];

export const MESSAGE_TYPES = {
  TEXT: 'TEXT',
  IMAGE: 'IMAGE',
  VIDEO: 'VIDEO',
  AUDIO: 'AUDIO',
  DOCUMENT: 'DOCUMENT',
  FILE: 'FILE',
  SYSTEM: 'SYSTEM',
  VIEW_ONCE: 'VIEW_ONCE',
} as const;

export type MessageType = (typeof MESSAGE_TYPES)[keyof typeof MESSAGE_TYPES];

export const CONVERSATION_TYPES = {
  DIRECT: 'DIRECT',
  GROUP: 'GROUP',
  DEPARTMENT: 'DEPARTMENT',
  TEAM: 'TEAM',
  SYSTEM: 'SYSTEM',
} as const;

export type ConversationType =
  (typeof CONVERSATION_TYPES)[keyof typeof CONVERSATION_TYPES];

/** Soft-edit window after message creation. */
export const EDIT_WINDOW_MS = 15 * 60 * 1000;

export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

export const DELIVERY_STATUS = {
  SENT: 'SENT',
  DELIVERED: 'DELIVERED',
  READ: 'READ',
} as const;
