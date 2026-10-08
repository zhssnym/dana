CREATE TABLE direct_conversations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_a_id uuid NOT NULL,
  user_b_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT direct_conversations_pkey PRIMARY KEY (id),
  CONSTRAINT direct_conversations_user_a_id_fkey FOREIGN KEY (user_a_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT direct_conversations_user_b_id_fkey FOREIGN KEY (user_b_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT direct_conversations_pair_key UNIQUE (user_a_id, user_b_id),
  CONSTRAINT direct_conversations_order_check CHECK (user_a_id < user_b_id)
);
--> statement-breakpoint
CREATE INDEX direct_conversations_user_b_id_idx ON direct_conversations (user_b_id);
--> statement-breakpoint
CREATE TABLE direct_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  author_id uuid NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT direct_messages_pkey PRIMARY KEY (id),
  CONSTRAINT direct_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES direct_conversations(id) ON DELETE CASCADE,
  CONSTRAINT direct_messages_author_id_fkey FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT direct_messages_body_check CHECK (char_length(btrim(body)) BETWEEN 1 AND 4000)
);
--> statement-breakpoint
CREATE INDEX direct_messages_timeline_idx ON direct_messages (conversation_id, created_at DESC, id DESC);
