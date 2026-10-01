-- Apply once with the old backend stopped/drained, BEFORE starting new code.
-- Do not run old and new backends together: old owner-only queries are not scoped.
-- Additive: existing meetings/jobs retain organization_id NULL (Personal).
-- This file is intentionally transactional and not silently rerunnable.
BEGIN;
CREATE TABLE organizations (
    id UUID PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE organization_memberships (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id VARCHAR(255) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_organization_user UNIQUE (organization_id, user_id),
    CONSTRAINT ck_organization_role CHECK (role IN ('admin', 'member'))
);
CREATE INDEX ix_organization_memberships_user_id ON organization_memberships(user_id);
CREATE TABLE organization_invites (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    created_by VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_organization_invites_organization_id ON organization_invites(organization_id);
ALTER TABLE meetings ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE transcription_jobs ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT;
CREATE INDEX ix_meetings_organization_id ON meetings(organization_id);
CREATE INDEX ix_transcription_jobs_organization_id ON transcription_jobs(organization_id);
-- Chunk scope is inherited through meeting_id, whose index already exists.
-- Backend-only tables: remove PostgREST access when Supabase API roles exist.
-- The application uses its DATABASE_URL role after verifying Supabase JWTs, so
-- enabling RLS here without a database JWT context would lock out that role.
DO $security$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON organizations, organization_memberships, organization_invites,
            meetings, meeting_chunks, transcription_jobs FROM anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON organizations, organization_memberships, organization_invites,
            meetings, meeting_chunks, transcription_jobs FROM authenticated;
    END IF;
END
$security$;
COMMIT;
