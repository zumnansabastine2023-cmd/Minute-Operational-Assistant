import asyncio
import importlib
import json
import unittest
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit


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


class FakeBrowser:
    def __init__(self):
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
    async def relay(self, results):
        browser = FakeBrowser()
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
            "diarize": ["true"],
        })
        return browser.messages

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
