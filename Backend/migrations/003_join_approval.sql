-- Additive migration, after 002. Stop/drain the backend before applying locally.
-- Do not run old invite-redemption code alongside the approval workflow.
-- Existing memberships, invites and meeting JSON remain unchanged.
BEGIN;
ALTER TABLE organization_memberships ADD COLUMN email VARCHAR(255);
CREATE TABLE organization_join_requests (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id VARCHAR(255) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_at TIMESTAMPTZ,
    reviewed_by VARCHAR(255),
    CONSTRAINT uq_join_request_user UNIQUE (organization_id, user_id),
    CONSTRAINT ck_join_request_status CHECK (status IN ('pending', 'approved', 'declined'))
);
CREATE INDEX ix_organization_join_requests_organization_id ON organization_join_requests(organization_id);
-- Optional assignee_user_id lives in the existing action_items JSON, no rewrite.
-- Match existing backend-only table access. Never expose through PostgREST.
REVOKE ALL ON organization_join_requests FROM PUBLIC;
DO $security$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON organization_join_requests FROM anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON organization_join_requests FROM authenticated;
    END IF;
END
$security$;
COMMIT;
