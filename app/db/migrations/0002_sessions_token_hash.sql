-- 10.1's fourth fixed fact, ruled after 0001 landed the first three: the
-- lookup key is token_hash, text, the table's primary key, holding the
-- lowercase hex sha256 digest of the cookie's CSPRNG token. The format check
-- transcribes the digest wording the way the ratified NOT NULLs transcribe
-- 10.1's sentences. The column can arrive NOT NULL without a backfill
-- because the table has no writer until the Security session lands the
-- module, so it is empty on every database this can apply to.
ALTER TABLE sessions ADD COLUMN token_hash text NOT NULL;
--> statement-breakpoint
ALTER TABLE sessions ADD CONSTRAINT sessions_pkey PRIMARY KEY (token_hash);
--> statement-breakpoint
ALTER TABLE sessions ADD CONSTRAINT sessions_token_hash_format_check CHECK (token_hash ~ '^[0-9a-f]{64}$');
