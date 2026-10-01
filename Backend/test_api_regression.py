import importlib
import unittest
from datetime import datetime, timezone
from unittest.mock import patch
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

with patch("faster_whisper.WhisperModel"):
    main = importlib.import_module("main")


class ApiRegressionTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        for model in (main.Meeting, main.MeetingChunk, main.TranscriptionJob):
            model.__table__.create(self.engine)
        self.addCleanup(self.engine.dispose)
        for patcher in (
            patch.object(main, "get_database_engine", return_value=self.engine),
            patch.object(main, "generate_embedding", return_value=[0.1] * main.EMBEDDING_DIMENSION),
            patch.object(main.limiter, "check"),
        ):
            patcher.start()
            self.addCleanup(patcher.stop)
        self.user = main.AuthenticatedUser("account-a")
        main.app.dependency_overrides[main.get_current_user] = lambda: self.user
        self.addCleanup(main.app.dependency_overrides.clear)
        self.client = TestClient(main.app)
        self.addCleanup(self.client.close)

    def create(self, kind="live"):
        transcript = "Abdul: Review Friday.\nDavid: I will complete the charts Thursday."
        response = self.client.post("/meetings", json={"title": "Dashboard", "type": kind, "transcript": transcript,
            "minutes": {"summary": "Review dashboard", "key_points": ["Charts"], "decisions": ["Review Friday"],
            "action_items": [{"task": "Complete charts", "owner": "David", "deadline": "Thursday"}]}})
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def test_each_meeting_type_save_reload_edit_reindex_and_source_attribution(self):
        for kind in ("live", "online", "recorded"):
            with self.subTest(kind=kind):
                saved = self.create(kind)
                self.assertTrue(saved["indexed"])
                loaded = self.client.get(f'/meetings/{saved["id"]}').json()
                self.assertEqual(loaded["transcript"], saved["transcript"])
                self.assertEqual(loaded["minutes"]["action_items"][0]["status"], "Open")
                minutes = loaded["minutes"]
                minutes["action_items"][0]["status"] = "Completed"
                minutes["action_items"].append({"task": "Review", "owner": "Abdul", "deadline": "Friday", "status": "Open"})
                updated = self.client.patch(f'/meetings/{saved["id"]}', json={"title": "Corrected", "minutes": minutes, "expected_revision": saved["revision"]})
                self.assertEqual(updated.status_code, 200, updated.text)
                self.assertEqual(updated.json()["minutes"]["action_items"], minutes["action_items"])
                with Session(self.engine) as session:
                    rows = session.execute(select(main.MeetingChunk, main.Meeting).join(main.Meeting, main.Meeting.id == main.MeetingChunk.meeting_id).where(main.Meeting.id == main.UUID(saved["id"]))).all()
                    self.assertTrue(any('Completed' in chunk.content for chunk, _ in rows))
                    self.assertTrue(any('David:' in chunk.content for chunk, _ in rows))
                    # Retrieval ranking is provider/database integration; verify owner is
                    # passed into retrieval and only supplied source IDs are emitted.
                    retrieval = [(chunk, meeting, 0.1) for chunk, meeting in rows]
                    with patch.object(main, "retrieve_semantic_chunks", return_value=retrieval) as retrieve, patch.object(main, "generate_assistant_answer", return_value=("David agreed to complete charts Thursday.", ["source_1", "invented"])):
                        answer = self.client.post('/assistant/chat', json={"message": "What did David agree to do?"})
                    self.assertEqual(answer.status_code, 200, answer.text)
                    retrieve.assert_called_once_with([0.1] * main.EMBEDDING_DIMENSION, main.ASSISTANT_RETRIEVAL_LIMIT, "account-a")
                    self.assertEqual([source["meeting_id"] for source in answer.json()["sources"]], [saved["id"]])
                # Remove the added action and verify the surviving completed task.
                minutes["action_items"].pop()
                removed = self.client.patch(f'/meetings/{saved["id"]}', json={"title": "Corrected", "minutes": minutes, "expected_revision": updated.json()["revision"]})
                self.assertEqual(removed.status_code, 200, removed.text)
                self.assertEqual(len(self.client.get(f'/meetings/{saved["id"]}').json()["minutes"]["action_items"]), 1)

    def test_cross_account_access_and_malformed_update_rejected(self):
        saved = self.create()
        self.user = main.AuthenticatedUser("account-b")
        for method, suffix, body in [
            ('GET', '', None), ('DELETE', '', None), ('POST', '/index', None),
            ('PATCH', '', {"title": "Other", "minutes": saved["minutes"], "expected_revision": saved["revision"]}),
        ]:
            response = self.client.request(method, f'/meetings/{saved["id"]}{suffix}', json=body)
            self.assertEqual(response.status_code, 404, response.text)
        self.assertEqual(self.client.get('/meetings').json(), [])
        self.assertEqual(self.client.get('/meetings/search?q=David').json()["results"], [])
        self.user = main.AuthenticatedUser("account-a")
        response = self.client.patch(f'/meetings/{saved["id"]}', json={"title": "Bad", "minutes": {}, "expected_revision": "bad"})
        self.assertEqual(response.status_code, 422)

    def test_job_api_upload_status_and_cross_owner_poll(self):
        # Upload guards/real file cleanup have separate tests. Keep this route test
        # free of filesystem permissions and model/provider calls.
        with patch.object(main, "store_recording_upload", return_value="test.wav"), patch.object(main, "process_recording", return_value={"transcript": "Speech"}), patch.object(main.os.path, "exists", return_value=False):
            created = self.client.post('/transcription-jobs', files={"file": ("meeting.wav", b"audio")})
        self.assertEqual(created.status_code, 202, created.text)
        job_id = created.json()["id"]
        self.assertEqual(self.client.get(f'/transcription-jobs/{job_id}').json()["status"], 'Completed')
        self.user = main.AuthenticatedUser("account-b")
        self.assertEqual(self.client.get(f'/transcription-jobs/{job_id}').status_code, 404)

    def test_recording_mode_validated_and_carried_through_background_job(self):
        for mode in ("single", "multi"):
            with patch.object(main, "store_recording_upload", return_value="test.wav"), patch.object(main, "process_recording", return_value={"transcript": "Speech"}) as process, patch.object(main.os.path, "exists", return_value=False):
                response = self.client.post('/transcription-jobs', files={"file": ("meeting.wav", b"audio")}, data={"speaker_mode": mode})
            self.assertEqual(response.status_code, 202, response.text)
            process.assert_called_once_with("test.wav", mode)
            completed = self.client.get(f'/transcription-jobs/{response.json()["id"]}').json()
            self.assertEqual(completed["result"]["speaker_mode"], mode)
            with patch.object(main, "store_recording_upload", return_value="test.wav"), patch.object(main, "process_recording", return_value={"transcript": "Speech"}) as process, patch.object(main.os.path, "exists", return_value=False):
                response = self.client.post('/transcribe', files={"file": ("meeting.wav", b"audio")}, data={"speaker_mode": mode})
            self.assertEqual(response.status_code, 200, response.text)
            process.assert_called_once_with("test.wav", mode)
        for endpoint in ('/transcription-jobs', '/transcribe'):
            with patch.object(main, "store_recording_upload") as upload:
                response = self.client.post(endpoint, files={"file": ("meeting.wav", b"audio")}, data={"speaker_mode": "auto"})
            self.assertEqual(response.status_code, 422)
            upload.assert_not_called()

    def test_weekly_summary_api_is_grounded_and_owner_scoped(self):
        saved = self.create()
        today = datetime.now(timezone.utc).date().isoformat()
        with patch.object(main, "generate_assistant_answer", return_value=("Review Friday.", ["M1", "invalid"])):
            result = self.client.post('/summaries/weekly', json={"start_date": today, "end_date": today})
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual(result.json()["sources"][0]["meeting_id"], saved["id"])
        self.user = main.AuthenticatedUser("account-b")
        result = self.client.post('/summaries/weekly', json={"start_date": today, "end_date": today})
        self.assertEqual(result.json()["meetings_considered"], 0)
