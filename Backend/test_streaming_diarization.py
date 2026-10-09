import asyncio
import importlib
import io
import json
import unittest
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit
from uuid import uuid4
from fastapi import HTTPException


# Import the real application without downloading/loading the unrelated ASR model.
with patch("faster_whisper.WhisperModel"):
    main = importlib.import_module("main")


def word(text, speaker):
    return {"word": text, "speaker": speaker}


def turn(speaker, text):
    return {"speaker": f"Speaker {speaker}", "text": text}


def result(text, words=None, final=True):
    alternative = {"transcript": text}
    if words is not None:
        alternative["words"] = words
    return json.dumps({
        "type": "Results", "is_final": final,
        "channel": {"alternatives": [alternative]},
    })


class SpeakerSegmentsTests(unittest.TestCase):
    def test_zero_and_one_are_valid_independent_speaker_ids(self):
        for speaker_id in (0, 1):
            with self.subTest(speaker_id=speaker_id):
                labels = {}
                self.assertEqual(main.deepgram_speaker_segments([word("Hello", speaker_id)], labels), [turn(1, "Hello")])
                self.assertEqual(labels, {speaker_id: "Speaker 1"})

    def test_zero_zero_one_one_groups_into_two_turns(self):
        self.assertEqual(main.deepgram_speaker_segments([
            word("Good", 0), word("morning", 0), word("Hello", 1), word("there", 1),
        ], {}), [turn(1, "Good morning"), turn(2, "Hello there")])

    def test_one_speaker(self):
        self.assertEqual(main.deepgram_speaker_segments(
            [word("Good", 0), word("morning", 0)], {}
        ), [turn(1, "Good morning")])

    def test_two_speakers(self):
        self.assertEqual(main.deepgram_speaker_segments(
            [word("Good", 0), word("morning", 0), word("Hello", 1)], {}
        ), [turn(1, "Good morning"), turn(2, "Hello")])

    def test_alternating_speakers(self):
        self.assertEqual(main.deepgram_speaker_segments(
            [word("A", 0), word("B", 1), word("C", 0)], {}
        ), [turn(1, "A"), turn(2, "B"), turn(1, "C")])

    def test_missing_words(self):
        for words in (None, []):
            with self.subTest(words=words):
                self.assertEqual(main.deepgram_speaker_segments(words, {}), [])

    def test_missing_speaker(self):
        labels = {}
        self.assertEqual(main.deepgram_speaker_segments(
            [word("Hello", 4), {"word": "there"}], labels
        ), [])
        self.assertEqual(labels, {})

    def test_unusual_ids_and_stable_mapping(self):
        labels = {}
        self.assertEqual(main.deepgram_speaker_segments(
            [word("A", 8), word("B", 4)], labels
        ), [turn(1, "A"), turn(2, "B")])
        self.assertEqual(main.deepgram_speaker_segments(
            [word("C", 4), word("D", 8), word("E", 7)], labels
        ), [turn(2, "C"), turn(1, "D"), turn(3, "E")])

    def test_separate_mappings_start_fresh(self):
        first, second = {}, {}
        main.deepgram_speaker_segments([word("A", 4)], first)
        self.assertEqual(main.deepgram_speaker_segments(
            [word("B", 8)], second
        ), [turn(1, "B")])
        self.assertEqual(first, {4: "Speaker 1"})
        self.assertEqual(second, {8: "Speaker 1"})

    def test_preserves_punctuation(self):
        self.assertEqual(main.deepgram_speaker_segments([
            {"word": "hello", "punctuated_word": "Hello,", "speaker": 0},
            {"word": "world", "punctuated_word": "world!", "speaker": 0},
        ], {}), [turn(1, "Hello, world!")])

    def test_malformed_metadata_does_not_mutate_mapping(self):
        malformed = ["words", {}, 42, [None], ["word"], []]
        malformed += [[word("hello", value)] for value in
                      (None, True, -1, 1.5, "4", [], {})]
        malformed += [[word(value, 4)] for value in (None, 123, "", " ", [])]
        malformed += [[{"word": "hello", "speaker": 4, "punctuated_word": {}}]]
        for words in malformed:
            with self.subTest(words=words):
                labels = {8: "Speaker 1"}
                if isinstance(words, list):
                    words = [word("valid prefix", 7)] + words if words else words
                self.assertEqual(main.deepgram_speaker_segments(words, labels), [])
                self.assertEqual(labels, {8: "Speaker 1"})


class DiarizationDiagnosticTests(unittest.TestCase):
    def capture(self, payload, segments=None, enabled="1"):
        output = io.StringIO()
        with patch.dict(main.os.environ, {"MOA_DIARIZATION_DEBUG": enabled}), patch("sys.stderr", output):
            main.log_deepgram_final_diarization(payload, segments or [])
        return output.getvalue()

    def test_diagnostics_report_ids_and_parser_counts_without_transcript_or_secrets(self):
        payload = json.loads(result("Private transcript", [word("private", 0), word("speech", 1), word("again", 0)]))
        payload["metadata"] = {"diarize_info": {"arch": "v1", "version": "2026-09-01.2", "model_uuid": "private-id"}, "api_key": "secret-key"}
        payload["Authorization"] = "secret-jwt"
        output = self.capture(payload, [turn(1, "private"), turn(2, "speech"), turn(1, "again")])
        for expected in ("words=3 speakers=[0,1]", "speaker_metadata=present", "labelled_words=3", "parsed_turns=3", "parsed_speakers=2", "diarize_info=present", "arch=v1", "version=2026-09-01.2"):
            self.assertIn(expected, output)
        for secret in ("Private transcript", "private", "speech", "again", "secret-key", "secret-jwt", "Authorization", "model_uuid"):
            self.assertNotIn(secret, output)

    def test_no_interim_or_default_logging(self):
        self.assertEqual(self.capture(json.loads(result("Preview", [word("Preview", 1)], final=False))), "")
        self.assertEqual(self.capture(json.loads(result("Final", [word("Final", 0)])), enabled=""), "")

    def test_absent_and_malformed_metadata_are_safe(self):
        for metadata in (None, [], "bad", {}, {"diarize_info": None}, {"diarize_info": {"arch": "secret\nheader", "version": {"jwt": "secret"}}}):
            payload = json.loads(result("Full text", [word("Full", 0), {"word": "text"}]))
            payload["metadata"] = metadata
            output = self.capture(payload)
            self.assertIn("words=2 speakers=[0]", output)
            self.assertIn("labelled_words=1 parsed_turns=0", output)
            self.assertNotIn("secret", output)
        for words in (None, [], {}, [None], [word("text", None)], [word("text", True)]):
            output = self.capture(json.loads(result("Full text", words)))
            self.assertIn("speakers=[]", output)
            self.assertIn("arch=unavailable version=unavailable", output)

    def test_broken_diagnostic_stream_does_not_break_transcription(self):
        with patch.dict(main.os.environ, {"MOA_DIARIZATION_DEBUG": "1"}), patch("builtins.print", side_effect=BrokenPipeError):
            main.log_deepgram_final_diarization(json.loads(result("Speech", [word("Speech", 0)])), [turn(1, "Speech")])


class FakeBrowser:
    def __init__(self):
        self.query_params = {}
        self.incoming = iter([
            {"type": "websocket.receive", "bytes": b"audio chunk"},
            {"type": "websocket.receive", "bytes": b"final audio chunk"},
            {"type": "websocket.receive", "text": '{"type":"finalize"}'},
        ])
        self.messages = []
        self.closed = None

    async def accept(self, subprotocol):
        self.subprotocol = subprotocol

    async def receive(self):
        return next(self.incoming)

    async def send_json(self, message):
        self.messages.append(message)

    async def close(self, **kwargs):
        self.closed = kwargs


class FakeDeepgram:
    def __init__(self, results):
        self.results = results
        self.sent = []
        self.finalized = asyncio.Event()

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def send(self, message):
        self.sent.append(message)
        if isinstance(message, str) and json.loads(message) == {"type": "CloseStream"}:
            self.finalized.set()

    async def __aiter__(self):
        # No results arrive until CloseStream: catches premature relay cancellation.
        await self.finalized.wait()
        for message in self.results:
            await asyncio.sleep(0)
            yield message


class StreamingDiarizationTests(unittest.IsolatedAsyncioTestCase):
    async def test_company_stream_rechecks_admin_access_during_capture(self):
        browser = FakeBrowser()
        browser.query_params = {"speaker_mode": "multi", "organization_id": str(uuid4())}
        deepgram = FakeDeepgram([])
        with patch.object(main, "get_websocket_user", return_value=main.AuthenticatedUser("admin")), \
             patch.object(main, "authorize_workspace", side_effect=[None, HTTPException(403, "removed")]) as authorize, \
             patch.object(main, "load_dotenv"), \
             patch.dict(main.os.environ, {"DEEPGRAM_API_KEY": "test-key"}), \
             patch.object(main, "connect_to_deepgram", return_value=deepgram):
            await asyncio.wait_for(main.stream_transcription(browser), timeout=2)
        self.assertEqual(authorize.call_count, 2)
        self.assertEqual(deepgram.sent, [])
        self.assertEqual(browser.closed, {"code": 1008})
        self.assertTrue(any(message.get("type") == "error" and "access changed" in message.get("message", "")
                            for message in browser.messages))

    async def test_smoothing_final_words_preserves_text_and_three_speaker_mapping(self):
        tokens = "We will review the charts. Next topic.".split()
        words = [dict(word(token, speaker), start=round(index * .2, 3),
                      end=round((index + 1) * .2, 3))
                 for index, (token, speaker) in enumerate(zip(tokens, [0, 0, 2, 0, 0, 7, 7]))]
        output = io.StringIO()
        with patch.dict(main.os.environ, {"MOA_DIARIZATION_DEBUG": "1"}), \
             patch("sys.stderr", output), \
             patch.object(main, "smooth_speaker_words", wraps=main.smooth_speaker_words) as smooth:
            messages = await self.relay([
                result("Preview", words, final=False),
                result(" ".join(tokens), words),
                result("My response", [word("My", 2), word("response", 2)]),
                result("Continue", [word("Continue", 7)]),
            ])
        self.assertEqual(smooth.call_count, 3)
        self.assertNotIn("speaker_segments", messages[0])
        self.assertEqual(messages[1]["speaker_segments"], [
            turn(1, "We will review the charts."), turn(2, "Next topic.")])
        self.assertEqual(messages[1]["text"], " ".join(tokens))
        self.assertEqual(" ".join(t["text"] for t in messages[1]["speaker_segments"]), " ".join(tokens))
        self.assertEqual(messages[2]["speaker_segments"], [turn(3, "My response")])
        self.assertEqual(messages[3]["speaker_segments"], [turn(2, "Continue")])
        self.assertIn("raw_runs=[0, 2, 0, 7] smoothed_runs=[0, 7]", output.getvalue())
        self.assertIn("smoothed_words=1", output.getvalue())
        self.assertNotIn("charts", output.getvalue())

    async def test_smoothing_preserves_short_runs_at_final_result_boundaries(self):
        words = [dict(word(token, speaker), start=index * .2, end=(index + 1) * .2)
                 for index, (token, speaker) in enumerate(zip(["First", "turn", "Yes"], [0, 0, 2]))]
        messages = await self.relay([
            result("First turn Yes", words),
            result("More speech", [word("More", 0), word("speech", 0)]),
        ])
        self.assertEqual(messages[0]["speaker_segments"], [turn(1, "First turn"), turn(2, "Yes")])
        self.assertEqual(messages[1]["speaker_segments"], [turn(1, "More speech")])

    async def test_malformed_provider_results_and_duplicate_final_timestamps(self):
        final = json.loads(result("Hello", [word("Hello", 0)]))
        final.update(start=1.0, duration=0.5)
        later = {**final, "start": 2.0}
        messages = await self.relay([
            'null', '[]', '{"type":"Results","channel":null}',
            '{"type":"Results","channel":{"alternatives":[{"transcript":42}]}}',
            json.dumps(final), json.dumps(final), json.dumps(later),
        ])
        self.assertEqual(len(messages), 2)
        self.assertEqual([message["text"] for message in messages], ["Hello", "Hello"])

    async def relay(self, results, speaker_mode="multi"):
        browser = FakeBrowser()
        browser.query_params = {"speaker_mode": speaker_mode}
        deepgram = FakeDeepgram(results)
        with patch.object(main, "get_websocket_user") as authenticate, \
             patch.object(main, "load_dotenv"), \
             patch.dict(main.os.environ, {"DEEPGRAM_API_KEY": "test-key"}), \
             patch.object(main, "connect_to_deepgram", return_value=deepgram) as connect:
            await asyncio.wait_for(main.stream_transcription(browser), timeout=2)
        authenticate.assert_called_once_with(browser)
        self.assertEqual(browser.subprotocol, "access-token")
        self.assertEqual(deepgram.sent, [
            b"audio chunk", b"final audio chunk", json.dumps({"type": "CloseStream"}),
        ])
        self.assertEqual(browser.closed, {"code": 1000, "reason": "Transcription finalized"})
        self.assertEqual(parse_qs(urlsplit(connect.call_args.args[0]).query), {
            "model": ["nova-3"], "language": ["en-US"],
            "smart_format": ["true"], "interim_results": ["true"],
            **({"diarize_model": ["latest"]} if speaker_mode == "multi" else {}),
        })
        query = parse_qs(urlsplit(connect.call_args.args[0]).query)
        self.assertNotIn("diarize", query)
        self.assertNotIn("multichannel", query)
        return browser.messages

    async def test_single_mode_ignores_provider_labels_and_skips_smoothing(self):
        with patch.object(main, "smooth_speaker_words") as smooth:
            messages = await self.relay([result("One Two", [word("One", 0), word("Two", 7)])], "single")
        smooth.assert_not_called()
        self.assertEqual(messages, [{"type": "transcript", "text": "One Two", "is_final": True}])

    async def test_invalid_mode_closes_before_provider_connection(self):
        browser = FakeBrowser()
        browser.query_params = {"speaker_mode": "auto"}
        with patch.object(main, "get_websocket_user"), patch.object(main, "connect_to_deepgram") as connect:
            await main.stream_transcription(browser)
        connect.assert_not_called()
        self.assertEqual(browser.closed, {"code": 1008})

    async def test_final_diagnostics_match_relayed_alternating_turns(self):
        output = io.StringIO()
        with patch.dict(main.os.environ, {"MOA_DIARIZATION_DEBUG": "1"}), patch("sys.stderr", output):
            messages = await self.relay([
                result("Preview", [word("Preview", 99)], final=False),
                result("One Two Three", [word("One", 0), word("Two", 1), word("Three", 0)]),
                result("Missing metadata"),
            ])
        self.assertEqual(messages[1]["speaker_segments"], [turn(1, "One"), turn(2, "Two"), turn(1, "Three")])
        lines = output.getvalue().splitlines()
        self.assertEqual(len(lines), 2)
        self.assertIn("speakers=[0,1]", lines[0])
        self.assertIn("parsed_turns=3 parsed_speakers=2", lines[0])
        self.assertIn("speaker_metadata=missing", lines[1])
        self.assertNotIn("99", output.getvalue())

    async def test_final_turns_interim_compatibility_and_flush(self):
        messages = await self.relay([
            result("Preview", [word("Preview", 99)], final=False),
            result("Good morning. Hello!", [
                word("Good", 8), word("morning.", 8), word("Hello!", 4),
            ]),
            result("Again", [word("Again", 8)]),
        ])
        self.assertEqual(messages, [
            {"type": "transcript", "text": "Preview", "is_final": False},
            {"type": "transcript", "text": "Good morning. Hello!", "is_final": True,
             "speaker_segments": [turn(1, "Good morning."), turn(2, "Hello!")]},
            {"type": "transcript", "text": "Again", "is_final": True,
             "speaker_segments": [turn(1, "Again")]},
        ])

    async def test_plain_text_fallback_and_fresh_connections(self):
        for provider_id in (4, 8):
            messages = await self.relay([
                result("No words"),
                result("No speaker", [{"word": "No speaker"}]),
                result("Malformed", [word("Malformed", [])]),
                result("Hello", [word("Hello", provider_id)]),
            ])
            self.assertEqual(messages[:3], [
                {"type": "transcript", "text": text, "is_final": True}
                for text in ("No words", "No speaker", "Malformed")
            ])
            self.assertEqual(messages[3]["speaker_segments"], [turn(1, "Hello")])


if __name__ == "__main__":
    unittest.main()
