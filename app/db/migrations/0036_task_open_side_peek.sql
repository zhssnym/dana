-- 0036: no stored choice changes (revised before it ever reached production).
--
-- Drafted as "default and every 'dialog' row to 'panel'", but 0046 then moved
-- every 'panel' row back to 'dialog'. Together they would have reset everyone
-- who deliberately chose Side peek in production (0010 had already moved every
-- other row to 'dialog'). Neither had shipped, so both are reduced to their
-- default change; stored choices are left exactly as people set them.
ALTER TABLE user_settings ALTER COLUMN task_open SET DEFAULT 'dialog';
