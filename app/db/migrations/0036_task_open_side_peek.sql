-- 0036: user_settings.task_open defaults to 'panel' again, reversing 0010.
--
-- The client reads the column as "Open tasks in": 'panel' is Side peek (the
-- spec's default), 'dialog' Center peek, 'tab' Full page. This is a visible
-- change, not a no-op: the build before this migration already honoured the
-- column, opening 'dialog' (0010's default, plus its UPDATE of every 'panel'
-- row) as the centered dialog. Moving the default and every 'dialog' row to
-- 'panel' moves each of those accounts from the centered dialog to Side peek,
-- the spec's default. No constraint or index changes, so AC-001's catalog is
-- untouched: a column default lives in pg_attrdef, not pg_constraint.
--
-- What it costs: 'dialog' cannot be told apart from 0010's default, so a
-- person who deliberately chose the centered dialog is moved to Side peek and
-- has to choose Center peek once. 'tab' is deliberately not touched: it is
-- only ever an explicit choice.
--
-- Forward only; the UPDATE is not reversible and no down migration exists.
ALTER TABLE user_settings ALTER COLUMN task_open SET DEFAULT 'panel';
--> statement-breakpoint
UPDATE user_settings SET task_open = 'panel' WHERE task_open = 'dialog';
