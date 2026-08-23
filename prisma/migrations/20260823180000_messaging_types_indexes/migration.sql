-- Expand conversation_type / message_type CHECKs for messaging module.
-- Also add composite index for conversation message timelines.

ALTER TABLE communications.conversations
  DROP CONSTRAINT IF EXISTS conversations_conversation_type_check;

ALTER TABLE communications.conversations
  ADD CONSTRAINT conversations_conversation_type_check
  CHECK (conversation_type IN (
    'DIRECT',
    'GROUP',
    'DEPARTMENT',
    'TEAM',
    'SYSTEM'
  ));

ALTER TABLE communications.messages
  DROP CONSTRAINT IF EXISTS messages_message_type_check;

ALTER TABLE communications.messages
  ADD CONSTRAINT messages_message_type_check
  CHECK (message_type IN (
    'TEXT',
    'IMAGE',
    'VIDEO',
    'FILE',
    'VIEW_ONCE',
    'AUDIO',
    'DOCUMENT',
    'SYSTEM'
  ));

CREATE INDEX IF NOT EXISTS idx_msg_conv_created_desc
  ON communications.messages (conversation_id, created_at DESC);

-- conversation_participants(user_id) already indexed as idx_cpart_user
