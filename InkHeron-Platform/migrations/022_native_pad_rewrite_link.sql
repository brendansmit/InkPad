-- Link a green-pen rewrite pad back to the pad it was created from.
--
-- Previously createGreenpenRewriteAssignment cloned the assignment into a
-- fresh pad with no reference to the original, making original-vs-rewrite
-- comparison impossible. rewrite_of_pad_id points at the source native_pad
-- so the implementation scorer (phase D) can diff the two.
ALTER TABLE native_pads ADD COLUMN rewrite_of_pad_id INTEGER REFERENCES native_pads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_native_pads_rewrite_of ON native_pads(rewrite_of_pad_id);
