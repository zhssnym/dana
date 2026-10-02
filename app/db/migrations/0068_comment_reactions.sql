-- Emoji reactions on Discussion posts replace the single like (4.15).
--
-- The table keeps its name: a row is still one person's marker on one
-- comment, now carrying which of a small fixed set it is. Every existing row
-- was a like and becomes a thumbs_up through the column default. The set is
-- the REACTIONS keys in src/shared/comments.ts; a key is stored by name, never
-- as a glyph. One person may leave several different reactions on one comment
-- but each at most once, hence the widened primary key. created_at already
-- exists and orders both the reactions and who left each.
--
-- Forward only.
ALTER TABLE comment_likes
  ADD COLUMN reaction text NOT NULL DEFAULT 'thumbs_up',
  ADD CONSTRAINT comment_likes_reaction_check
    CHECK (reaction IN ('thumbs_up', 'heart', 'laugh', 'party', 'surprised', 'thanks'));
--> statement-breakpoint
ALTER TABLE comment_likes DROP CONSTRAINT comment_likes_pkey;
--> statement-breakpoint
ALTER TABLE comment_likes
  ADD CONSTRAINT comment_likes_pkey PRIMARY KEY (comment_id, user_id, reaction);
