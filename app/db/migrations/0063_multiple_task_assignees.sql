ALTER TABLE tasks ADD COLUMN assignee_ids uuid[] NOT NULL DEFAULT '{}';
--> statement-breakpoint
UPDATE tasks SET assignee_ids = ARRAY[assignee_id] WHERE assignee_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX tasks_assignee_ids_idx ON tasks USING gin (assignee_ids);
--> statement-breakpoint
CREATE FUNCTION tasks_sync_assignees() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE
  invalid_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF cardinality(NEW.assignee_ids) = 0 AND NEW.assignee_id IS NOT NULL THEN
      NEW.assignee_ids := ARRAY[NEW.assignee_id];
    ELSE
      NEW.assignee_id := NEW.assignee_ids[1];
    END IF;
  ELSIF NEW.assignee_ids IS DISTINCT FROM OLD.assignee_ids THEN
    NEW.assignee_id := NEW.assignee_ids[1];
  ELSIF NEW.assignee_id IS DISTINCT FROM OLD.assignee_id THEN
    NEW.assignee_ids := CASE WHEN NEW.assignee_id IS NULL THEN '{}'::uuid[]
                             ELSE ARRAY[NEW.assignee_id] END;
  END IF;

  IF cardinality(NEW.assignee_ids) <>
     (SELECT count(DISTINCT id) FROM unnest(NEW.assignee_ids) AS ids(id)) THEN
    RAISE EXCEPTION 'duplicate task assignee' USING ERRCODE = '23514', CONSTRAINT = 'tasks_assignee_ids_unique';
  END IF;
  SELECT ids.id INTO invalid_id FROM unnest(NEW.assignee_ids) AS ids(id)
    WHERE ids.id IS NULL OR NOT EXISTS (
      SELECT 1 FROM folder_members m
       WHERE m.folder_id = NEW.project_id AND m.user_id = ids.id)
    LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'task assignee is not a project member'
      USING ERRCODE = '23503', CONSTRAINT = 'tasks_assignee_ids_membership_fkey';
  END IF;
  RETURN NEW;
END
$fn$;
--> statement-breakpoint
CREATE TRIGGER tasks_sync_assignees_before_write
  BEFORE INSERT OR UPDATE OF assignee_id, assignee_ids, project_id ON tasks
  FOR EACH ROW EXECUTE FUNCTION tasks_sync_assignees();
