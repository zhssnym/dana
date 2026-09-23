-- 0032_shelf_document.sql
-- Issue #221 (Shelf half): a Shelf's contextual content is written through
-- 7.16's revisioned `document_transaction`, the same wire contract the Folder
-- canvas and a facet page use.
--
-- **No data moves, and none has to.** A Shelf's content already lives in
-- 4.17's `page_blocks` keyed by `shelf_id` (0003), its Folder rows are already
-- `folder_ref` blocks in that same ordered list, and 0016's `page_position`
-- already orders them. The document path reads and writes those rows in
-- place, so every existing block, and the order it is in, is the document's
-- first revision as it stands.
--
-- What is missing is the retry receipt. `page_document_receipts` is keyed
-- (actor, folder, mutation) with a NOT NULL `folder_id`, and a Shelf has no
-- folder. This table is its Shelf-keyed sibling. It carries **no actor**,
-- deliberately: a Shelf is one person's alone (4.18), so the Shelf already
-- names the only person who can write a receipt, and leaving the column out
-- also keeps this table off 8.10's users-FK sweep -- the receipts die with the
-- Shelf through `shelf_document_receipts_shelf_id_fkey`, and the Shelf dies
-- with the account.
--
-- A receipt's presence is also the mark that this Shelf's content is on the
-- document path, which the legacy whole-page PUT reads to refuse itself (the
-- rule `page_document_receipts` already carries for a folder).
--
-- `page_blocks` is not touched: its Section-membership and list-parent CHECKs
-- keep admitting neither on a shelf-homed row, and the application refuses
-- both with a 422 before a write reaches them.
CREATE TABLE shelf_document_receipts (
  shelf_id uuid NOT NULL,
  mutation_id uuid NOT NULL,
  payload_hash text NOT NULL,
  committed_revision text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shelf_document_receipts_pkey PRIMARY KEY (shelf_id, mutation_id),
  CONSTRAINT shelf_document_receipts_shelf_id_fkey
    FOREIGN KEY (shelf_id) REFERENCES shelves(id) ON DELETE CASCADE
);
