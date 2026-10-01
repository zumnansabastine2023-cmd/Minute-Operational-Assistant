import hashlib
import importlib
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch
from uuid import UUID

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

with patch('faster_whisper.WhisperModel'):
    main = importlib.import_module('main')


class CompanyWorkspaceTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
        main.Base.metadata.create_all(self.engine)
        self.addCleanup(self.engine.dispose)
        for patcher in (patch.object(main, 'get_database_engine', return_value=self.engine),
                        patch.object(main, 'generate_embedding', return_value=[.1] * main.EMBEDDING_DIMENSION),
                        patch.object(main.limiter, 'check')):
            patcher.start()
            self.addCleanup(patcher.stop)
        self.user = main.AuthenticatedUser('a', display_name='a@example.test')
        main.app.dependency_overrides[main.get_current_user] = lambda: self.user
        self.addCleanup(main.app.dependency_overrides.clear)
        self.client = TestClient(main.app)
        self.addCleanup(self.client.close)

    def as_user(self, name):
        self.user = main.AuthenticatedUser(name, display_name=f'{name}@example.test')

    def company(self, name='Alpha'):
        response = self.client.post('/organizations', json={'name': name})
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()['id']

    def add_member(self, organization, name):
        token = self.client.post(f'/organizations/{organization}/invites').json()['token']
        before = self.user
        self.as_user(name)
        response = self.client.post('/organizations/join', json={'token': token})
        self.user = before
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['status'], 'pending')
        approval = self.client.patch(f"/organizations/{organization}/join-requests/{response.json()['id']}", json={'decision': 'approve'})
        self.assertEqual(approval.status_code, 200, approval.text)

    def test_creation_validation_and_authentication(self):
        organization = self.company('  Alpha  ')
        listed = self.client.get('/organizations').json()
        self.assertEqual([(row['name'], row['role']) for row in listed], [('Alpha', 'admin')])
        self.assertEqual(self.client.get(f'/organizations/{organization}').json()['member_count'], 1)
        for name in ['', '   ', 'x' * 121, 'bad\nname', '\u200bhidden']:
            self.assertEqual(self.client.post('/organizations', json={'name': name}).status_code, 422)
        main.app.dependency_overrides.clear()
        self.assertEqual(self.client.post('/organizations', json={'name': 'No auth'}).status_code, 401)

    def test_invite_is_hashed_expiring_single_use_and_always_member(self):
        organization = self.company()
        response = self.client.post(f'/organizations/{organization}/invites')
        token = response.json()['token']
        with Session(self.engine) as session:
            invite = session.scalar(select(main.OrganizationInvite))
            self.assertEqual(invite.token_hash, hashlib.sha256(token.encode()).hexdigest())
            self.assertNotEqual(invite.token_hash, token)
        self.as_user('b')
        joined = self.client.post('/organizations/join', json={'token': token})
        self.assertEqual(joined.status_code, 200, joined.text)
        self.assertEqual(joined.json()['status'], 'pending')
        self.assertEqual(self.client.get('/organizations').json(), [])
        self.as_user('a')
        self.assertEqual(self.client.patch(f"/organizations/{organization}/join-requests/{joined.json()['id']}", json={'decision': 'approve'}).status_code, 200)
        self.as_user('b')
        self.assertEqual(self.client.get('/organizations').json()[0]['role'], 'member')
        self.assertEqual(self.client.post('/organizations/join', json={'token': token}).status_code, 400)
        self.assertEqual(self.client.post(f'/organizations/{organization}/invites').status_code, 403)
        self.assertEqual(self.client.patch(f'/organizations/{organization}', json={'name': 'Escalate'}).status_code, 403)
        self.as_user('a')
        expired = self.client.post(f'/organizations/{organization}/invites').json()
        with Session(self.engine) as session:
            session.get(main.OrganizationInvite, UUID(expired['id'])).expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
            session.commit()
        self.as_user('c')
        self.assertEqual(self.client.post('/organizations/join', json={'token': expired['token']}).status_code, 400)

    def test_invite_can_be_revoked_and_demoted_issuer_invites_are_invalidated(self):
        organization = self.company()
        first = self.client.post(f'/organizations/{organization}/invites').json()
        listed = self.client.get(f'/organizations/{organization}/invites').json()
        self.assertEqual([row['id'] for row in listed], [first['id']])
        self.assertNotIn('token', listed[0])
        self.assertEqual(self.client.delete(f'/organizations/{organization}/invites/{first["id"]}').status_code, 200)
        self.as_user('b')
        self.assertEqual(self.client.post('/organizations/join', json={'token': first['token']}).status_code, 400)
        self.as_user('a')
        self.add_member(organization, 'b')
        members = self.client.get(f'/organizations/{organization}/members').json()
        member_b = next(row for row in members if row['user_id'] == 'b')
        admin_a = next(row for row in members if row['user_id'] == 'a')
        self.assertEqual(self.client.patch(f'/organizations/{organization}/members/{member_b["id"]}', json={'role': 'admin'}).status_code, 200)
        issued_before_demotion = self.client.post(f'/organizations/{organization}/invites').json()['token']
        self.as_user('b')
        self.assertEqual(self.client.patch(f'/organizations/{organization}/members/{admin_a["id"]}', json={'role': 'member'}).status_code, 200)
        self.as_user('c')
        self.assertEqual(self.client.post('/organizations/join', json={'token': issued_before_demotion}).status_code, 400)

    def test_admin_management_last_admin_and_cross_company_membership_tampering(self):
        alpha, beta = self.company(), self.company('Beta')
        self.add_member(alpha, 'b')
        members = self.client.get(f'/organizations/{alpha}/members').json()
        admin = next(row for row in members if row['role'] == 'admin')['id']
        member = next(row for row in members if row['role'] == 'member')['id']
        self.assertEqual(self.client.delete(f'/organizations/{alpha}/members/{admin}').status_code, 409)
        self.assertEqual(self.client.patch(f'/organizations/{alpha}/members/{admin}', json={'role': 'member'}).status_code, 409)
        self.assertEqual(self.client.patch(f'/organizations/{beta}/members/{member}', json={'role': 'admin'}).status_code, 404)
        self.as_user('b')
        self.assertEqual(self.client.patch(f'/organizations/{alpha}/members/{member}', json={'role': 'admin'}).status_code, 403)
        self.assertEqual(self.client.get(f'/organizations/{beta}').status_code, 403)
        self.as_user('a')
        self.assertEqual(self.client.patch(f'/organizations/{alpha}/members/{member}', json={'role': 'admin'}).status_code, 200)
        self.assertEqual(self.client.delete(f'/organizations/{alpha}/members/{admin}').status_code, 200)
        self.assertEqual(self.client.get(f'/organizations/{alpha}').status_code, 403)

    def setup_companies(self):
        self.as_user('a')
        alpha = self.company('Alpha')
        self.add_member(alpha, 'b')
        self.as_user('b')
        beta = self.company('Beta')
        self.add_member(beta, 'c')
        return alpha, beta

    def meeting(self, marker, organization=None):
        response = self.client.post('/meetings', params={'organization_id': organization} if organization else {}, json={
            'title': marker, 'type': 'live', 'transcript': marker,
            'minutes': {'summary': marker, 'decisions': [marker], 'action_items': [
                {'task': marker, 'owner': 'Assigned', 'deadline': 'Friday', 'status': 'Open'}]}})
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def test_personal_company_and_multi_company_object_isolation(self):
        alpha, beta = self.setup_companies()
        personal = self.meeting('PERSONAL-ORANGE-741')
        beta_meeting = self.meeting('BETA-GREEN-963', beta)
        self.as_user('a')
        alpha_meeting = self.meeting('ALPHA-BLUE-852', alpha)
        self.as_user('b')
        for scope, expected in [(None, personal), (alpha, alpha_meeting), (beta, beta_meeting)]:
            params = {'organization_id': scope} if scope else {}
            self.assertEqual([m['id'] for m in self.client.get('/meetings', params=params).json()], [expected['id']])
            self.assertEqual(self.client.get(f'/meetings/{expected["id"]}', params=params).status_code, 200)
            found = self.client.get('/meetings/search', params={**params, 'q': expected['title']}).json()
            self.assertEqual([m['id'] for m in found['results']], [expected['id']])
            for other in (personal, alpha_meeting, beta_meeting):
                if other['id'] != expected['id']:
                    self.assertEqual(self.client.get(f'/meetings/{other["id"]}', params=params).status_code, 404)
                    self.assertEqual(self.client.get(f'/meetings/{other["id"]}/index-status', params=params).status_code, 404)
        self.as_user('a')
        self.assertEqual(self.client.get('/meetings', params={'organization_id': beta}).status_code, 403)
        self.as_user('c')
        self.assertEqual(self.client.get('/meetings', params={'organization_id': alpha}).status_code, 403)
        self.assertEqual(self.client.get('/meetings', params={'organization_id': 'bad'}).status_code, 422)

    def test_member_reads_but_all_company_mutations_and_providers_are_denied(self):
        alpha = self.company()
        saved = self.meeting('Company actions', alpha)
        self.add_member(alpha, 'b')
        self.as_user('b')
        params = {'organization_id': alpha}
        self.assertEqual(self.client.get(f'/meetings/{saved["id"]}', params=params).status_code, 200)
        requests = [
            ('POST', '/meetings', {'title': 'No', 'type': 'live', 'transcript': 'No'}),
            ('PATCH', f'/meetings/{saved["id"]}', {'title': 'No', 'expected_revision': saved['revision'], 'minutes': saved['minutes']}),
            ('DELETE', f'/meetings/{saved["id"]}', None),
            ('POST', f'/meetings/{saved["id"]}/index', None),
            ('POST', '/generate-minutes', {'transcript': 'No'}),
        ]
        for method, path, body in requests:
            self.assertEqual(self.client.request(method, path, params=params, json=body).status_code, 403, path)
        for path in ('/transcription-jobs', '/transcribe'):
            with patch.object(main, 'store_recording_upload') as upload:
                response = self.client.post(path, params=params, files={'file': ('audio.wav', b'audio')})
            self.assertEqual(response.status_code, 403)
            upload.assert_not_called()
        self.as_user('a')
        minutes = saved['minutes']
        minutes['action_items'][0]['status'] = 'Completed'
        response = self.client.patch(f'/meetings/{saved["id"]}', params=params, json={
            'title': 'Edited', 'minutes': minutes, 'expected_revision': saved['revision']})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['minutes']['action_items'][0]['status'], 'Completed')
        self.assertEqual(self.client.post(f'/meetings/{saved["id"]}/index', params=params).status_code, 200)

    def test_rag_unique_phrases_and_summary_sources_are_strictly_scoped(self):
        alpha, beta = self.setup_companies()
        personal = self.meeting('PERSONAL-ORANGE-741')
        beta_meeting = self.meeting('BETA-GREEN-963', beta)
        self.as_user('a')
        alpha_meeting = self.meeting('ALPHA-BLUE-852', alpha)
        self.as_user('b')
        def sqlite_retrieval(embedding, limit, owner, organization=None):
            # Execute the production query's actual joins/WHERE/limit on SQLite;
            # only pgvector distance projection and ordering need substitution.
            query = main.semantic_chunk_statement(embedding, limit, owner, organization)
            query = query.with_only_columns(main.MeetingChunk, main.Meeting).order_by(None)
            with Session(self.engine) as session:
                return [(chunk, meeting, .1) for chunk, meeting in session.execute(query).all()]
        for scope, expected in [(None, personal), (alpha, alpha_meeting), (beta, beta_meeting)]:
            params = {'organization_id': scope} if scope else {}
            for path, body, source in [('/assistant/chat', {'message': 'What was decided?'}, 'source_1'),
                    ('/summaries/weekly', {'start_date': datetime.now(timezone.utc).date().isoformat(),
                                         'end_date': datetime.now(timezone.utc).date().isoformat()}, 'M1')]:
                def answer(_question, context, _history):
                    self.assertIn(expected['title'], context)
                    for other in (personal, alpha_meeting, beta_meeting):
                        if other['id'] != expected['id']:
                            self.assertNotIn(other['title'], context)
                    return expected['title'], [source, 'invented', personal['id']]
                with patch.object(main, 'retrieve_semantic_chunks', side_effect=sqlite_retrieval), patch.object(main, 'generate_assistant_answer', side_effect=answer):
                    response = self.client.post(path, params=params, json=body)
                self.assertEqual(response.status_code, 200, response.text)
                self.assertEqual([s['meeting_id'] for s in response.json()['sources']], [expected['id']])
        with patch.object(main, 'generate_assistant_answer') as answer:
            response = self.client.post('/summaries/weekly', params={'organization_id': alpha}, json={'start_date': '2000-01-01', 'end_date': '2000-01-02'})
        self.assertEqual(response.json()['meetings_considered'], 0)
        answer.assert_not_called()
        self.as_user('c')
        for path, body in [('/assistant/chat', {'message': 'Leak?'}), ('/summaries/weekly', {'start_date': '2000-01-01', 'end_date': '2000-01-02'})]:
            self.assertEqual(self.client.post(path, params={'organization_id': alpha}, json=body).status_code, 403)

    def test_company_jobs_never_appear_in_personal_or_other_company(self):
        alpha, beta = self.company(), self.company('Beta')
        with patch.object(main, 'store_recording_upload', return_value='test.wav'), patch.object(main, 'process_recording', return_value={'transcript': 'Company recording'}), patch.object(main.os.path, 'exists', return_value=False):
            response = self.client.post('/transcription-jobs', params={'organization_id': alpha}, files={'file': ('audio.wav', b'audio')})
        self.assertEqual(response.status_code, 202, response.text)
        job = response.json()['id']
        self.assertEqual(self.client.get(f'/transcription-jobs/{job}', params={'organization_id': alpha}).status_code, 200)
        self.assertEqual(self.client.get(f'/transcription-jobs/{job}').status_code, 404)
        self.assertEqual(self.client.get(f'/transcription-jobs/{job}', params={'organization_id': beta}).status_code, 404)
        self.add_member(alpha, 'b')
        self.as_user('b')
        self.assertEqual(self.client.get(f'/transcription-jobs/{job}', params={'organization_id': alpha}).status_code, 403)
