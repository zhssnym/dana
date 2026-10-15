-- #671: Facet-scoped saves reuse the existing document transaction and
-- idempotency receipt, but track which Facet the mutation belongs to.
-- Old Work and Doc receipts keep NULL here; no existing receipt is changed.
ALTER TABLE page_document_receipts
  ADD COLUMN page_facet_id uuid,
  ADD CONSTRAINT page_document_receipts_page_facet_id_fkey
    FOREIGN KEY (page_facet_id) REFERENCES page_facets(id) ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX page_document_receipts_page_facet_id_idx
  ON page_document_receipts (page_facet_id)
  WHERE page_facet_id IS NOT NULL;
