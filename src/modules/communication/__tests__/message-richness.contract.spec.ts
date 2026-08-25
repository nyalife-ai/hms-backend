/**
 * Message richness contract — thin notification wake-ups must never overwrite
 * rich MessagingService message.created payloads.
 */

describe('message payload richness contract', () => {
  function isRichMessagePayload(payload: Record<string, unknown>): boolean {
    return (
      'body' in payload ||
      'attachments' in payload ||
      'messageType' in payload ||
      'createdAt' in payload ||
      'deliveryStatus' in payload
    );
  }

  function mergeAttachments(
    prev: Array<{ id: string; fileName: string }>,
    next: Array<{ id: string; fileName: string }>,
  ) {
    if (!next.length && prev.length) return prev;
    return next;
  }

  it('treats messaging-service rich payloads as rich', () => {
    expect(
      isRichMessagePayload({
        id: 'm1',
        messageId: 'm1',
        conversationId: 'c1',
        senderId: 'u1',
        senderName: 'Ada',
        messageType: 'AUDIO',
        body: null,
        createdAt: '2026-08-25T00:00:00.000Z',
        attachments: [
          {
            id: 'a1',
            fileName: 'voice.webm',
            mimeType: 'audio/webm',
            fileSize: 12,
          },
        ],
        deliveryStatus: 'SENT',
      }),
    ).toBe(true);
  });

  it('rejects thin notification wake-ups even when senderName is present', () => {
    expect(
      isRichMessagePayload({
        messageId: 'm1',
        conversationId: 'c1',
        senderId: 'u1',
        senderName: 'Ada Okello',
        preview: '🎤 Voice message',
        mentioned: false,
      }),
    ).toBe(false);
  });

  it('does not wipe existing attachments when a thin/empty update arrives', () => {
    const prev = [{ id: 'a1', fileName: 'voice.webm' }];
    expect(mergeAttachments(prev, [])).toEqual(prev);
    expect(mergeAttachments(prev, [{ id: 'a2', fileName: 'next.webm' }])).toEqual([
      { id: 'a2', fileName: 'next.webm' },
    ]);
  });
});
