-- Spec 10.1 fixes three facts about this table as contract: the name, a
-- user_id column cascading from users(id), and expires_at timestamptz. The
-- rest of its shape, the identifier column and key among it, is the Security
-- engineer's to decide (11.6) and arrives by request as a later migration.
-- The NOT NULLs transcribe 10.1's own sentences: a session belongs to a user
-- and always expires. AC-001 admits the table as 10.1's one named exception,
-- so it stays out of constraint-catalog.ts; its contract is AC-113's.
CREATE TABLE sessions (
  user_id uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
