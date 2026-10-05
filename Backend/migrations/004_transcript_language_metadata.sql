-- Additive Stage 1 language metadata. Existing transcripts remain unchanged.
-- Apply explicitly before deploying multilingual metadata persistence.
ALTER TABLE meetings
    ADD COLUMN IF NOT EXISTS transcript_metadata JSONB;
