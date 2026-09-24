-- 0046: user_settings.task_open defaults to 'dialog', Center peek (round 3).
--
-- "Open tasks in" reads the column: 'dialog' Center peek, 'panel' Side peek,
-- 'tab' Full page. Center peek becomes the default because a side panel beside
-- the list clutters the page it narrows; Side peek and Full page stay choices.
--
-- 0036 moved every 'dialog' row to 'panel' and made 'panel' the default, so a
-- stored 'panel' cannot be told apart from that default: every 'panel' row
-- moves to 'dialog'. What it costs: someone who deliberately chose Side peek
-- after 0036 has to choose it once more. 'tab' is only ever an explicit choice
-- and is left alone. No constraint or index changes (a column default lives in
-- pg_attrdef), so the constraint catalog is untouched.
--
-- Forward only; the UPDATE is not reversible.
ALTER TABLE user_settings ALTER COLUMN task_open SET DEFAULT 'dialog';
--> statement-breakpoint
UPDATE user_settings SET task_open = 'dialog' WHERE task_open = 'panel';
