import importlib
import io
import json
import os
import tempfile
import threading
import unittest
from contextlib import contextmanager
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch
from urllib.parse import parse_qs, urlsplit
from uuid import uuid4

from fastapi import HTTPException, UploadFile

import recorded_transcription as recorded

with patch("faster_whisper.WhisperModel"), patch("dotenv.load_dotenv"):
    main = importlib.import_module("main")


def word(text, speaker):
    return {"punctuated_word": text, "speaker": speaker}


def payload(transcript, words=None):
    return {"results": {"channels": [{"alternatives": [{
        "transcript": transcript, "words": words,
    }]}]}}


@contextmanager
def workspace_test_directory():
    # mkdir inherits workspace ACLs; TemporaryDirectory's private ACL prevents
    # subsequent sandboxed access on Windows Python installations.
    directory = Path(__file__).resolve().parent / f"_recorded_test_{uuid4().hex}"
    directory.mkdir()
    try:
        yield str(directory)
    finally:
        for child in directory.iterdir():
            child.unlink()
        directory.rmdir()


class RecordedResponseTests(unittest.TestCase):
    def parse(self, text, words=None):
        return recorded.parse_deepgram_transcription(
            payload(text, words), main.deepgram_speaker_segments,
        )

    def test_one_speaker_preserves_complete_plain_text(self):
        result = self.parse("Hello, world!", [word("Hello,", 7), word("world!", 7)])
        self.assertEqual(result, {
            "transcript": "Hello, world!",
            "speaker_segments": [{"speaker": "Speaker 1", "text": "Hello, world!"}],
        })

    def test_multiple_alternating_speakers_and_local_numbering(self):
        result = self.parse("A. B. C.", [word("A.", 9), word("B.", 3), word("C.", 9)])
        self.assertEqual(result["speaker_segments"], [
            {"speaker": "Speaker 1", "text": "A."},
            {"speaker": "Speaker 2", "text": "B."},
            {"speaker": "Speaker 1", "text": "C."},
        ])
        self.assertEqual(self.parse("New.", [word("New.", 3)])["speaker_segments"][0]["speaker"], "Speaker 1")

    def test_missing_diarization_keeps_plain_transcript(self):
        for words in (None, [], [{"word": "All speech remains."}]):
            with self.subTest(words=words):
                self.assertEqual(self.parse("All speech remains.", words), {"transcript": "All speech remains."})

    def test_malformed_metadata_never_loses_transcript(self):
        for words in ({}, "bad", [None], [word("Complete", True)],
                      [word("Complete", 1), {"word": "text."}],
                      [word("Complete", -1), word("text.", 0)]):
            with self.subTest(words=words):
                self.assertEqual(self.parse("Complete text.", words), {"transcript": "Complete text."})

    def test_incomplete_but_valid_word_array_uses_complete_plain_text(self):
        self.assertEqual(self.parse("First. Missing speech.", [word("First.", 0)]), {
            "transcript": "First. Missing speech.",
        })

    def test_provider_formatting_difference_preserves_original(self):
        self.assertEqual(self.parse("Budget: $25.", [word("Budget:", 0), word("twenty-five.", 0)]), {
            "transcript": "Budget: $25.",
        })

    def test_whitespace_differences_keep_original_transcript_and_all_turns(self):
        result = self.parse("  First.\nSecond.  ", [word("First.", 0), word("Second.", 1)])
        self.assertEqual(result["transcript"], "  First.\nSecond.  ")
        self.assertEqual(len(result["speaker_segments"]), 2)

    def test_silence_is_valid_empty_result(self):
        self.assertEqual(self.parse("", []), {"transcript": ""})

    def test_malformed_response_shape_rejected(self):
        for invalid in (None, [], {}, {"results": []}, {"results": {"channels": []}},
                        {"results": {"channels": [None]}},
                        {"results": {"channels": [{"alternatives": []}]}}, payload(None),
                        {"results": {"channels": [{}, {}]}}):
            with self.subTest(invalid=invalid), self.assertRaises(recorded.DeepgramTranscriptionError):
                recorded.parse_deepgram_transcription(invalid, main.deepgram_speaker_segments)


class RecordedFallbackTests(unittest.TestCase):
    def setUp(self):
        self.whisper = Mock()
        self.whisper.transcribe.return_value = (
            iter([SimpleNamespace(text="Full local"), SimpleNamespace(text="transcript.")]), None,
        )

    def transcribe(self, key="test-key"):
        return recorded.transcribe_recording("test.wav", self.whisper, key, main.deepgram_speaker_segments)

    def test_missing_key_uses_whisper_without_provider_request(self):
        with patch.object(recorded, "request_deepgram_transcription") as request:
            self.assertEqual(self.transcribe(None), {"transcript": "Full local transcript."})
        request.assert_not_called()

    def test_single_mode_uses_plain_whisper_even_with_provider_key(self):
        with patch.object(recorded, "request_deepgram_transcription") as request:
            result = recorded.transcribe_recording("test.wav", self.whisper, "key", main.deepgram_speaker_segments, "single")
        self.assertEqual(result, {"transcript": "Full local transcript."})
        request.assert_not_called()
        self.whisper.transcribe.assert_called_once_with("test.wav")

    def test_invalid_mode_never_calls_transcription_providers(self):
        with patch.object(recorded, "request_deepgram_transcription") as request, self.assertRaises(ValueError):
            recorded.transcribe_recording("test.wav", self.whisper, "key", main.deepgram_speaker_segments, "auto")
        request.assert_not_called()
        self.whisper.transcribe.assert_not_called()

    def test_provider_failure_falls_back(self):
        with patch.object(recorded, "request_deepgram_transcription", side_effect=TimeoutError):
            self.assertEqual(self.transcribe(), {"transcript": "Full local transcript."})

    def test_malformed_provider_shape_falls_back(self):
        with patch.object(recorded, "request_deepgram_transcription", return_value={"unexpected": True}):
            self.assertEqual(self.transcribe(), {"transcript": "Full local transcript."})

    def test_missing_metadata_preserves_provider_plain_text_without_whisper(self):
        with patch.object(recorded, "request_deepgram_transcription", return_value=payload("Provider full text.")):
            self.assertEqual(self.transcribe(), {"transcript": "Provider full text."})
        self.whisper.transcribe.assert_not_called()

    def test_diarization_success_does_not_call_whisper(self):
        with patch.object(recorded, "request_deepgram_transcription", return_value=payload("Hello.", [word("Hello.", 0)])):
            self.assertEqual(self.transcribe()["speaker_segments"], [{"speaker": "Speaker 1", "text": "Hello."}])
        self.whisper.transcribe.assert_not_called()

    def test_whisper_failure_is_wrapped(self):
        self.whisper.transcribe.side_effect = RuntimeError("decoder internals")
        with self.assertRaisesRegex(recorded.RecordedTranscriptionError, "Unable to transcribe") as raised:
            self.transcribe(None)
        self.assertNotIn("decoder internals", str(raised.exception))

    def test_lazy_whisper_generator_failure_is_wrapped(self):
        def segments():
            yield SimpleNamespace(text="Partial")
            raise RuntimeError("decoder internals")
        self.whisper.transcribe.return_value = segments(), None
        with self.assertRaises(recorded.RecordedTranscriptionError):
            self.transcribe(None)


class RecordedHttpTests(unittest.TestCase):
    def setUp(self):
        directory = self.enterContext(workspace_test_directory())
        self.path = os.path.join(directory, "audio.wav")
        with open(self.path, "wb") as audio:
            audio.write(b"audio")
        self.connection = Mock()
        self.connection.getresponse.return_value.status = 200
        self.connection.getresponse.return_value.read.return_value = json.dumps(payload("Hello.")).encode()

    def test_https_request_streams_file_with_expected_contract_and_closes(self):
        sent = {}
        def capture(method, path, *, body, headers):
            sent.update(method=method, path=path, headers=headers, audio=body.read(), is_stream=hasattr(body, "read"))
        self.connection.request.side_effect = capture
        with patch.object(recorded.http.client, "HTTPSConnection", return_value=self.connection) as connection:
            self.assertEqual(recorded.request_deepgram_transcription(self.path, "test-key"), payload("Hello."))
        self.assertEqual(sent["method"], "POST")
        self.assertTrue(sent["is_stream"])
        self.assertEqual(sent["audio"], b"audio")
        self.assertEqual(sent["headers"]["Content-Length"], "5")
        self.assertEqual(sent["headers"]["Authorization"], "Token test-key")
        self.assertEqual(parse_qs(urlsplit(sent["path"]).query), {
            "model": ["nova-3"], "diarize_model": ["latest"], "punctuate": ["true"],
        })
        connection.assert_called_once_with("api.deepgram.com", timeout=180)
        self.connection.close.assert_called_once()

    def test_provider_http_failure_is_sanitized(self):
        self.connection.getresponse.return_value.status = 429
        with patch.object(recorded.http.client, "HTTPSConnection", return_value=self.connection), self.assertRaises(recorded.DeepgramTranscriptionError):
            recorded.request_deepgram_transcription(self.path, "test-key")
        self.connection.getresponse.return_value.read.assert_not_called()
        self.connection.close.assert_called_once()

    def test_malformed_json_is_rejected(self):
        self.connection.getresponse.return_value.read.return_value = b"not json"
        with patch.object(recorded.http.client, "HTTPSConnection", return_value=self.connection), self.assertRaises(recorded.DeepgramTranscriptionError):
            recorded.request_deepgram_transcription(self.path, "test-key")
        self.connection.close.assert_called_once()

    def test_response_size_is_bounded(self):
        self.connection.getresponse.return_value.read.return_value = b"1234"
        with patch.object(recorded.http.client, "HTTPSConnection", return_value=self.connection), patch.object(recorded, "MAX_PROVIDER_RESPONSE_BYTES", 3), self.assertRaises(recorded.DeepgramTranscriptionError):
            recorded.request_deepgram_transcription(self.path, "test-key")
        self.connection.getresponse.return_value.read.assert_called_once_with(4)


class RecordedUploadTests(unittest.IsolatedAsyncioTestCase):
    async def invoke(self, contents=b"audio", filename="meeting.wav", limit=None, failure=None):
        upload = UploadFile(file=io.BytesIO(contents), filename=filename)
        create_temp = tempfile.NamedTemporaryFile
        paths = []
        worker_threads = []
        result = {"transcript": "All speech.", "speaker_segments": [{"speaker": "Speaker 1", "text": "All speech."}]}
        with workspace_test_directory() as directory:
            def named_temp(**kwargs):
                handle = create_temp(dir=directory, **kwargs)
                paths.append(handle.name)
                return handle
            def worker(path, *_args, speaker_mode="multi"):
                self.assertEqual(speaker_mode, "multi")
                worker_threads.append(threading.get_ident())
                self.assertTrue(os.path.isfile(path))
                with open(path, "rb") as audio:
                    self.assertEqual(audio.read(), contents)
                if failure:
                    raise failure
                return result
            with patch.object(main.tempfile, "NamedTemporaryFile", side_effect=named_temp), \
                 patch.object(main, "load_dotenv"), patch.object(main.os, "getenv", return_value="test-key"), \
                 patch.object(main, "transcribe_recording", side_effect=worker), \
                 patch.object(main, "MAX_UPLOAD_SIZE_BYTES", limit or 100 * 1024 * 1024):
                try:
                    response = await main.transcribe_audio(upload, main.AuthenticatedUser(id="owner"))
                finally:
                    self.assertTrue(upload.file.closed)
                    self.assertEqual(os.listdir(directory), [])
            self.assertEqual(response, {"filename": filename, **result})
        return paths, worker_threads

    async def test_success_preserves_response_cleans_files_and_offloads_worker(self):
        paths, threads = await self.invoke()
        self.assertEqual(len(paths), 1)
        self.assertEqual(len(threads), 1)
        self.assertNotEqual(threads[0], threading.get_ident())

    async def test_extension_whitelist_rejects_and_closes_upload(self):
        with self.assertRaises(HTTPException) as raised:
            await self.invoke(filename="meeting.exe")
        self.assertEqual(raised.exception.status_code, 415)

    async def test_empty_upload_rejected_and_cleaned(self):
        with self.assertRaises(HTTPException) as raised:
            await self.invoke(contents=b"")
        self.assertEqual(raised.exception.status_code, 400)

    async def test_oversize_upload_rejected_and_cleaned(self):
        with self.assertRaises(HTTPException) as raised:
            await self.invoke(contents=b"1234", limit=3)
        self.assertEqual(raised.exception.status_code, 413)

    async def test_limit_boundary_is_accepted(self):
        await self.invoke(contents=b"123", limit=3)

    async def test_provider_and_whisper_failure_returns_friendly_error_and_cleans(self):
        with self.assertRaises(HTTPException) as raised:
            await self.invoke(failure=recorded.RecordedTranscriptionError("decoder internals"))
        self.assertEqual(raised.exception.status_code, 502)
        self.assertNotIn("decoder internals", raised.exception.detail)


if __name__ == "__main__":
    unittest.main()
