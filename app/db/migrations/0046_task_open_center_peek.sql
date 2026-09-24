-- 0046: user_settings.task_open defaults to 'dialog', Center peek (round 3).
--
-- "Open tasks in" reads the column: 'dialog' Center peek, 'panel' Side peek,
-- 'tab' Full page. Center peek is the default because a side panel beside the
-- list clutters the page it narrows. Stored choices are not touched: in
-- production a stored 'panel' is a deliberate Side peek choice (0010 moved
-- everyone else to 'dialog'). No constraint or index changes.
ALTER TABLE user_settings ALTER COLUMN task_open SET DEFAULT 'dialog';
