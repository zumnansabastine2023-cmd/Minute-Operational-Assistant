import importlib
import unittest
from types import SimpleNamespace
from unittest.mock import patch

with patch("faster_whisper.WhisperModel"):
    main = importlib.import_module("main")


TRANSCRIPT = "Speaker 1: Review Friday.\nSpeaker 2: I will prepare the dashboard Thursday."


class CanonicalTranscriptTests(unittest.TestCase):
    def test_minutes_prompt_preserves_labels_and_requires_explicit_identity(self):
        with patch.object(main, "load_dotenv"), patch.dict(
            main.os.environ, {"GEMINI_API_KEY": "test-key"}
        ), patch.object(main.genai, "Client") as client:
            client.return_value.models.generate_content.return_value.text = '{}'
            main.generate_minutes(main.MinutesRequest(transcript=TRANSCRIPT), current_user=None)
            prompt = client.return_value.models.generate_content.call_args.kwargs["contents"]
        self.assertIn(TRANSCRIPT, prompt)
        self.assertIn("anonymous speaker labels", prompt)
        self.assertIn("first-person commitment", prompt)
        self.assertIn("Never infer a speaker's identity", prompt)
        self.assertIn("explicitly establishes that identity", prompt)

    def test_labelled_text_remains_available_in_retrieval_chunks(self):
        meeting = SimpleNamespace(title="Dashboard", transcript=TRANSCRIPT,
                                  summary=None, key_points=[], decisions=[], action_items=[])
        chunks = main.meeting_to_chunks(meeting)
        self.assertTrue(any(TRANSCRIPT in chunk for chunk in chunks))

    def test_saved_meeting_response_preserves_transcript_newlines(self):
        meeting = SimpleNamespace(id="meeting-id", title="Dashboard", type="live",
                                  created_at="2026-09-29", transcript=TRANSCRIPT,
                                  summary=None, key_points=None, decisions=None, action_items=None)
        response = main.meeting_response(meeting)
        self.assertEqual(response["transcript"], TRANSCRIPT)
        self.assertEqual(main.json.loads(main.json.dumps(response))["transcript"], TRANSCRIPT)


if __name__ == "__main__":
    unittest.main()
