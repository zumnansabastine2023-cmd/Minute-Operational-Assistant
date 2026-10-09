import importlib
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch
from uuid import uuid4
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from fastapi import HTTPException

with patch("faster_whisper.WhisperModel"):
    main = importlib.import_module("main")


class TranscriptionJobTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        main.TranscriptionJob.__table__.create(self.engine)
        self.addCleanup(self.engine.dispose)
        patcher = patch.object(main, "get_database_engine", return_value=self.engine)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.user = main.AuthenticatedUser("owner")
        self.id = uuid4()
        now = datetime.now(timezone.utc)
        with Session(self.engine) as session:
            session.add(main.TranscriptionJob(id=self.id, owner_id=self.user.id, status="Queued",
                        created_at=now, expires_at=now + timedelta(hours=24)))
            session.commit()

    def test_other_owner_cannot_poll(self):
        with self.assertRaises(HTTPException) as raised:
            main.get_transcription_job(self.id, main.AuthenticatedUser("other"))
        self.assertEqual(raised.exception.status_code, 404)

    def test_completed_job_persists_result_and_cleans_input(self):
        result = {"transcript": "Speaker words", "speaker_segments": [{"speaker": "Speaker 1", "text": "Speaker words"}]}
        with patch.object(main, "process_recording", return_value=result), patch.object(main.os.path, "exists", return_value=True), patch.object(main.os, "remove") as remove:
            main.run_recording_job(self.id, "test-input.wav")
        remove.assert_called_once_with("test-input.wav")
        response = main.get_transcription_job(self.id, self.user)
        self.assertEqual(response["status"], "Completed")
        self.assertEqual(response["result"], {**result, "speaker_mode": "multi"})

    def test_failure_is_friendly_and_input_cleaned(self):
        with patch.object(main, "process_recording", side_effect=RuntimeError("secret provider body")), patch.object(main.os.path, "exists", return_value=True), patch.object(main.os, "remove") as remove:
            main.run_recording_job(self.id, "test-input.wav")
        remove.assert_called_once()
        response = main.get_transcription_job(self.id, self.user)
        self.assertEqual(response["status"], "Failed")
        self.assertNotIn("secret", response["error"])

    def test_abandoned_job_fails_and_expired_job_disappears(self):
        with Session(self.engine) as session:
            session.get(main.TranscriptionJob, self.id).created_at = datetime.now(timezone.utc) - timedelta(hours=1)
            session.commit()
        self.assertEqual(main.get_transcription_job(self.id, self.user)["status"], "Failed")
        with Session(self.engine) as session:
            session.get(main.TranscriptionJob, self.id).expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
            session.commit()
        with self.assertRaises(HTTPException):
            main.get_transcription_job(self.id, self.user)
