import unittest
from pathlib import Path
from uuid import uuid4
from sqlalchemy import create_engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from fastapi import HTTPException
from workspaces import Base, Organization, OrganizationMembership, require_organization_member, require_organization_admin


class WorkspaceModelTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite://')
        self.addCleanup(self.engine.dispose)
        Base.metadata.create_all(self.engine)
        self.organization_id = uuid4()
        with Session(self.engine) as session:
            session.add(Organization(id=self.organization_id, name='Alpha', created_by='a'))
            session.add_all([OrganizationMembership(organization_id=self.organization_id, user_id=user,
                display_name=user, role=role) for user, role in [('a', 'admin'), ('b', 'member')]])
            session.commit()

    def test_database_authorization_and_role_checks(self):
        with Session(self.engine) as session:
            self.assertEqual(require_organization_admin(session, self.organization_id, 'a')[1].role, 'admin')
            self.assertEqual(require_organization_member(session, self.organization_id, 'b')[1].role, 'member')
            for user in ('b', 'outsider'):
                with self.assertRaises(HTTPException) as error:
                    require_organization_admin(session, self.organization_id, user)
                self.assertEqual(error.exception.status_code, 403)
            with self.assertRaises(HTTPException) as error:
                require_organization_member(session, uuid4(), 'a')
            self.assertEqual(error.exception.status_code, 404)

    def test_unique_membership_and_role_constraints(self):
        for user, role in [('a', 'member'), ('c', 'owner')]:
            with Session(self.engine) as session, self.assertRaises(IntegrityError):
                session.add(OrganizationMembership(organization_id=self.organization_id, user_id=user, display_name=user, role=role))
                session.commit()

    def test_migration_is_additive_and_preserves_personal_null_scope(self):
        migration = Path(__file__).with_name('migrations').joinpath('002_company_workspaces.sql').read_text()
        for expected in (
            'CREATE TABLE organizations', 'CREATE TABLE organization_memberships',
            'CREATE TABLE organization_invites',
            'ALTER TABLE meetings ADD COLUMN organization_id',
            'ALTER TABLE transcription_jobs ADD COLUMN organization_id',
            'CONSTRAINT uq_organization_user UNIQUE',
            "CHECK (role IN ('admin', 'member'))",
        ):
            self.assertIn(expected, migration)
        for destructive in ('DROP TABLE', 'DROP COLUMN', 'TRUNCATE', 'UPDATE MEETINGS'):
            self.assertNotIn(destructive, migration.upper())
