import importlib
import unittest
from unittest.mock import patch
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from minutes_data import normalize_actions

with patch("faster_whisper.WhisperModel"):
    main = importlib.import_module("main")


class MeetingUpdateTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        main.Meeting.__table__.create(self.engine)
        main.MeetingChunk.__table__.create(self.engine)
        self.addCleanup(self.engine.dispose)
        self.engine_patch = patch.object(main, "get_database_engine", return_value=self.engine)
        self.engine_patch.start()
        self.addCleanup(self.engine_patch.stop)
        self.owner = main.AuthenticatedUser("owner-a")
        self.id = uuid4()
        with Session(self.engine) as session:
            session.add(main.Meeting(id=self.id, owner_id=self.owner.id, title="Planning", type="live",
                                    transcript="David: I'll finish Thursday.", action_items=["Legacy task"]))
            session.add(main.MeetingChunk(meeting_id=self.id, content="Old content", chunk_index=0))
            session.commit()

    def request(self, revision=None):
        return main.MeetingUpdateRequest(title="Reviewed", expected_revision=revision or main.get_meeting(self.id, self.owner)["revision"],
            minutes={"summary": "Corrected", "key_points": ["Point"], "decisions": ["Decision"],
                     "action_items": [{"task": "Finish", "owner": "David", "deadline": "Thursday", "status": "Completed"}]})

    def test_legacy_action_defaults(self):
        self.assertEqual(normalize_actions(["Old", {"task": "New"}, None])[0],
            {"task": "Old", "owner": "Unassigned", "deadline": "Not specified", "status": "Open"})
        self.assertEqual(main.get_meeting(self.id, self.owner)["minutes"]["action_items"][0]["status"], "Open")

    def test_update_persists_status_and_invalidates_chunks_on_index_failure(self):
        with patch.object(main, "index_meeting_chunks", side_effect=RuntimeError("offline")):
            result = main.update_meeting(self.id, self.request(), self.owner)
        self.assertFalse(result["indexed"])
        loaded = main.get_meeting(self.id, self.owner)
        self.assertEqual(loaded["title"], "Reviewed")
        self.assertEqual(loaded["minutes"]["action_items"][0]["status"], "Completed")
        self.assertIn("David:", loaded["transcript"])
        with Session(self.engine) as session:
            self.assertEqual(list(session.scalars(select(main.MeetingChunk))), [])

    def test_stale_revision_cannot_overwrite_new_edits(self):
        request = self.request()
        with patch.object(main, "index_meeting_chunks", return_value=1):
            main.update_meeting(self.id, request, self.owner)
            with self.assertRaises(HTTPException) as raised:
                main.update_meeting(self.id, request, self.owner)
        self.assertEqual(raised.exception.status_code, 409)

    def test_other_owner_cannot_read_edit_delete_or_index(self):
        other = main.AuthenticatedUser("owner-b")
        for call in (lambda: main.get_meeting(self.id, other),
                     lambda: main.update_meeting(self.id, self.request(), other),
                     lambda: main.delete_meeting(self.id, other),
                     lambda: main.index_meeting_chunks(self.id, other.id)):
            with self.assertRaises(HTTPException) as raised:
                call()
            self.assertEqual(raised.exception.status_code, 404)

    def test_inflight_index_cannot_restore_stale_chunks(self):
        def embedding(_chunk):
            with Session(self.engine) as session:
                meeting = session.get(main.Meeting, self.id)
                meeting.summary = "Changed during embedding"
                session.commit()
            return [0.0] * main.EMBEDDING_DIMENSION
        with patch.object(main, "generate_embedding", side_effect=embedding), self.assertRaises(HTTPException) as raised:
            main.index_meeting_chunks(self.id, self.owner.id)
        self.assertEqual(raised.exception.status_code, 409)

    def test_invalid_status_is_rejected(self):
        with self.assertRaises(ValueError):
            main.ActionItemInput(task="A", owner="B", deadline="C", status="Invented")


if __name__ == "__main__":
    unittest.main()
