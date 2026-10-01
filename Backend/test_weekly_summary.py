import importlib
import unittest
from datetime import date, datetime, timezone
from unittest.mock import patch
from uuid import uuid4
from types import SimpleNamespace
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from weekly_summary import build_summary_context, summary_date_bounds, MAX_SUMMARY_CHARS

with patch("faster_whisper.WhisperModel"):
    main = importlib.import_module("main")


class WeeklySummaryTests(unittest.TestCase):
    def test_bounds_are_inclusive_utc_and_reject_invalid_ranges(self):
        start, end = summary_date_bounds(date(2026, 9, 1), date(2026, 9, 2))
        self.assertEqual(end.day, 3)
        self.assertEqual(start.tzinfo, timezone.utc)
        with self.assertRaises(ValueError):
            summary_date_bounds(date(2026, 10, 1), date(2026, 9, 1))

    def test_context_is_bounded_and_prefers_saved_minutes(self):
        meetings = [SimpleNamespace(id=uuid4(), title="M", type="live", created_at=datetime.now(timezone.utc),
                    summary="S" * 5000, decisions=[], action_items=[], key_points=[]) for _ in range(25)]
        context, sources, limited = build_summary_context(meetings, lambda _: self.fail("Should use minutes"))
        self.assertLessEqual(len(context), MAX_SUMMARY_CHARS)
        self.assertLessEqual(len(sources), 20)
        self.assertTrue(limited)

    def test_range_owner_isolation_and_invalid_sources(self):
        engine = create_engine("sqlite://")
        self.addCleanup(engine.dispose)
        main.Meeting.__table__.create(engine)
        ids = [uuid4(), uuid4(), uuid4()]
        with Session(engine) as session:
            for index, owner in enumerate(["owner", "other", "owner"]):
                session.add(main.Meeting(id=ids[index], owner_id=owner, title=f"Meeting {index}", type="live", transcript="Evidence",
                    created_at=datetime(2026, 9, 20 if index < 2 else 1, tzinfo=timezone.utc)))
            session.commit()
        request = main.WeeklySummaryRequest(start_date="2026-09-20", end_date="2026-09-20")
        with patch.object(main, "get_database_engine", return_value=engine), patch.object(main, "generate_assistant_answer", return_value=("Grounded", ["M1", "unknown"])) as generate:
            result = main.weekly_summary(request, main.AuthenticatedUser("owner"))
            self.assertEqual([source["meeting_id"] for source in result["sources"]], [str(ids[0])])
            self.assertNotIn("Meeting 1", generate.call_args.args[1])
            self.assertNotIn("Meeting 2", generate.call_args.args[1])
            generate.reset_mock()
            empty = main.weekly_summary(request, main.AuthenticatedUser("nobody"))
            self.assertEqual(empty["sources"], [])
            generate.assert_not_called()
            generate.side_effect = main.AssistantAnswerGenerationError()
            with self.assertRaises(HTTPException) as raised:
                main.weekly_summary(request, main.AuthenticatedUser("owner"))
            self.assertEqual(raised.exception.status_code, 503)
