-- Additive only; existing meeting and chunk data are unchanged.
-- The application's existing metadata.create_all also creates this table.
-- Apply this manually before rollout when using a restricted runtime DB role.
CREATE TABLE IF NOT EXISTS transcription_jobs (
    id UUID PRIMARY KEY,
    owner_id VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL,
    result JSON,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_transcription_jobs_owner_id ON transcription_jobs(owner_id);
CREATE INDEX IF NOT EXISTS ix_transcription_jobs_expires_at ON transcription_jobs(expires_at);
