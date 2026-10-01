import unittest
from unittest.mock import patch
from uuid import UUID
from sqlalchemy import select
from sqlalchemy.orm import Session
import test_company_workspace as fixtures
from workspaces import OrganizationJoinRequest

main = fixtures.main

class ApprovalActionTests(unittest.TestCase):
    setUp = fixtures.CompanyWorkspaceTests.setUp
    as_user = fixtures.CompanyWorkspaceTests.as_user
    company = fixtures.CompanyWorkspaceTests.company
    add_member = fixtures.CompanyWorkspaceTests.add_member
    meeting = fixtures.CompanyWorkspaceTests.meeting

    def pending(self, company, user):
        token = self.client.post(f'/organizations/{company}/invites').json()['token']
        self.as_user(user)
        response = self.client.post('/organizations/join', json={'token': token})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json(), token

    def test_forwarded_invite_is_pending_and_all_company_access_denied_until_approved(self):
        company = self.company()
        saved = self.meeting('Private', company)
        pending, token = self.pending(company, 'forwarded-recipient')
        self.assertEqual(pending['status'], 'pending')
        self.assertNotIn('role', pending)
        self.assertEqual(self.client.get('/organizations').json(), [])
        self.assertEqual(self.client.get('/organizations/join-requests').json()[0]['status'], 'pending')
        for path in ['/meetings', f'/meetings/{saved["id"]}', f'/organizations/{company}/members']:
            self.assertEqual(self.client.get(path, params={'organization_id': company}).status_code, 403)
        self.assertEqual(self.client.post('/assistant/chat', params={'organization_id': company}, json={'message':'Leak?'}).status_code, 403)
        self.assertEqual(self.client.patch(f'/organizations/{company}/join-requests/{pending["id"]}', json={'decision':'approve'}).status_code, 403)
        self.assertEqual(self.client.post('/organizations/join', json={'token':token}).status_code, 400)
        self.as_user('a')
        listed = self.client.get(f'/organizations/{company}/join-requests').json()
        self.assertEqual([row['id'] for row in listed], [pending['id']])
        self.assertNotIn('token_hash', str(listed))
        approved = self.client.patch(f'/organizations/{company}/join-requests/{pending["id"]}', json={'decision':'approve'})
        self.assertEqual(approved.status_code, 200)
        self.assertEqual(self.client.patch(f'/organizations/{company}/join-requests/{pending["id"]}', json={'decision':'approve'}).status_code, 409)
        self.as_user('forwarded-recipient')
        self.assertEqual(self.client.get('/organizations').json()[0]['role'], 'member')
        self.assertEqual(self.client.get('/meetings', params={'organization_id':company}).status_code, 200)

    def test_decline_cross_company_review_duplicate_request_and_non_admin(self):
        alpha, beta = self.company(), self.company('Beta')
        self.add_member(alpha, 'member')
        pending, _ = self.pending(alpha, 'candidate')
        self.as_user('member')
        for decision in ['approve', 'decline']:
            self.assertEqual(self.client.patch(f'/organizations/{alpha}/join-requests/{pending["id"]}', json={'decision':decision}).status_code, 403)
        self.assertEqual(self.client.get(f'/organizations/{alpha}/join-requests').status_code, 403)
        self.as_user('a')
        self.assertEqual(self.client.patch(f'/organizations/{beta}/join-requests/{pending["id"]}', json={'decision':'approve'}).status_code, 404)
        extra = self.client.post(f'/organizations/{alpha}/invites').json()['token']
        self.as_user('candidate')
        self.assertEqual(self.client.post('/organizations/join', json={'token':extra}).status_code, 409)
        self.as_user('a')
        self.assertEqual(self.client.patch(f'/organizations/{alpha}/join-requests/{pending["id"]}', json={'decision':'decline'}).status_code, 200)
        self.as_user('candidate')
        self.assertEqual(self.client.get('/organizations').json(), [])
        self.assertEqual(self.client.get('/organizations/join-requests').json()[0]['status'], 'declined')
        self.assertEqual(self.client.get('/meetings', params={'organization_id':alpha}).status_code, 403)
        # A new valid invite permits a fresh request, never direct membership.
        self.assertEqual(self.client.post('/organizations/join', json={'token':extra}).json()['status'], 'pending')
        with Session(self.engine) as session:
            self.assertEqual(len(list(session.scalars(select(OrganizationJoinRequest)))), 2)  # approved member + candidate

    def assign(self, meeting, company, assignee):
        minutes = meeting['minutes']
        minutes['action_items'][0]['assignee_user_id'] = assignee
        return self.client.patch(f'/meetings/{meeting["id"]}', params={'organization_id':company}, json={
            'title':meeting['title'], 'minutes':minutes, 'expected_revision':meeting['revision']})

    def status(self, meeting, company, status='Completed', **extra):
        return self.client.patch(f'/meetings/{meeting["id"]}/actions/0', params={'organization_id':company} if company else {}, json={
            'status':status, 'expected_revision':meeting['revision'], **extra})

    def test_assignment_own_completion_reopen_other_member_and_admin(self):
        company = self.company()
        for name in ['b','c']:
            self.add_member(company, name)
        saved = self.meeting('Task', company)
        assigned = self.assign(saved, company, 'b')
        self.assertEqual(assigned.status_code, 200, assigned.text)
        saved = assigned.json()
        self.as_user('c')
        self.assertEqual(self.status(saved, company).status_code, 403)
        self.as_user('b')
        self.assertEqual(self.status(saved, company, assignee_user_id='c').status_code, 422)
        result = self.status(saved, company)
        self.assertEqual(result.status_code, 200, result.text)
        self.assertTrue(result.json()['indexed'])
        self.assertEqual(result.json()['minutes']['action_items'][0]['status'], 'Completed')
        self.assertEqual(self.status(saved, company).status_code, 409)
        reopened = self.status(result.json(), company, 'Open')
        self.assertEqual(reopened.status_code, 200)
        self.assertEqual(reopened.json()['minutes']['action_items'][0]['status'], 'Open')
        # The dedicated endpoint doesn't grant full minutes editing or indexing rights.
        self.assertEqual(self.assign(reopened.json(), company, 'c').status_code, 403)
        self.assertEqual(self.client.post(f'/meetings/{saved["id"]}/index', params={'organization_id':company}).status_code, 403)
        self.as_user('a')
        self.assertEqual(self.status(reopened.json(), company).status_code, 200)

    def test_legacy_personal_cross_scope_and_invalid_assignee(self):
        company, other = self.company(), self.company('Other')
        self.add_member(company, 'b')
        saved = self.meeting('Legacy', company)
        self.assertEqual(self.assign(saved, company, 'outsider').status_code, 400)
        self.as_user('b')
        self.assertEqual(self.status(saved, company).status_code, 403)
        self.as_user('a')
        self.assertEqual(self.status(saved, other).status_code, 404)
        self.assertEqual(self.status(saved, None).status_code, 404)
        self.assertEqual(self.status(saved, company).status_code, 200)
        personal = self.meeting('Personal')
        self.assertEqual(self.status(personal, None).status_code, 200)
        self.assertEqual(self.status(personal, company).status_code, 404)
        self.as_user('b')
        self.assertEqual(self.status(personal, None).status_code, 404)

    def test_removal_during_member_sync_cannot_restore_stale_knowledge(self):
        company = self.company()
        self.add_member(company, 'b')
        saved = self.assign(self.meeting('Assigned', company), company, 'b').json()
        self.as_user('b')
        def revoke(_):
            with Session(self.engine) as session:
                row = session.scalar(select(main.OrganizationMembership).where(main.OrganizationMembership.user_id == 'b'))
                session.delete(row); session.commit()
            return [.1] * main.EMBEDDING_DIMENSION
        with patch.object(main, 'generate_embedding', side_effect=revoke):
            response = self.status(saved, company)
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()['indexed'])
        with Session(self.engine) as session:
            self.assertEqual(list(session.scalars(select(main.MeetingChunk).where(main.MeetingChunk.meeting_id == UUID(saved['id'])))), [])
