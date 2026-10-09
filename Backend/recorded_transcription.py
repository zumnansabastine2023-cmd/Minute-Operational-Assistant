"""Recorded transcription with optional Deepgram diarization and local fallback.

The existing Whisper model remains the fallback. Provider audio uploads use a
file stream, so a maximum-size recording is never duplicated in memory.
"""

import http.client
import json
import logging
import os
from collections.abc import Callable
from urllib.parse import urlencode


DEEPGRAM_HOST = "api.deepgram.com"
DEEPGRAM_TIMEOUT_SECONDS = 180
MAX_PROVIDER_RESPONSE_BYTES = 16 * 1024 * 1024
logger = logging.getLogger(__name__)

try:
    from .language_config import transcript_metadata
except ImportError:
    from language_config import transcript_metadata


class RecordedTranscriptionError(Exception):
    """Neither the provider nor the local transcription fallback succeeded."""


class DeepgramTranscriptionError(Exception):
    """The prerecorded provider response could not be used safely."""


def request_deepgram_transcription(file_path: str, api_key: str, language: str = "en") -> object:
    """Send a bounded local file to Deepgram using the existing account key."""
    parameters = {
        "model": "nova-3",
        "diarize_model": "latest",
        "punctuate": "true",
    }
    if language != "en":
        parameters["language"] = language
    query = urlencode(parameters)
    connection = http.client.HTTPSConnection(
        DEEPGRAM_HOST, timeout=DEEPGRAM_TIMEOUT_SECONDS,
    )
    try:
        with open(file_path, "rb") as audio:
            connection.request(
                "POST", f"/v1/listen?{query}", body=audio,
                headers={
                    "Authorization": f"Token {api_key}",
                    "Content-Type": "application/octet-stream",
                    "Content-Length": str(os.path.getsize(file_path)),
                },
            )
            response = connection.getresponse()
            if response.status != 200:
                raise DeepgramTranscriptionError("Recorded provider request failed.")
            body = response.read(MAX_PROVIDER_RESPONSE_BYTES + 1)
            if len(body) > MAX_PROVIDER_RESPONSE_BYTES:
                raise DeepgramTranscriptionError("Recorded provider response was too large.")
            return json.loads(body)
    except (OSError, http.client.HTTPException, ValueError) as error:
        raise DeepgramTranscriptionError("Recorded provider request failed.") from error
    finally:
        connection.close()


def parse_deepgram_transcription(
    payload: object,
    speaker_segment_builder: Callable[[object, dict], list[dict]],
) -> dict:
    """Keep the complete provider transcript unless every word is attributed."""
    if not isinstance(payload, dict) or not isinstance(payload.get("results"), dict):
        raise DeepgramTranscriptionError("Invalid recorded provider response.")
    channels = payload["results"].get("channels")
    # This request uses mixed-channel transcription. Do not silently discard an
    # unexpected second transcript if a provider ever changes that contract.
    if not isinstance(channels, list) or len(channels) != 1 or not isinstance(channels[0], dict):
        raise DeepgramTranscriptionError("Invalid recorded provider channels.")
    alternatives = channels[0].get("alternatives")
    if not isinstance(alternatives, list) or not alternatives or not isinstance(alternatives[0], dict):
        raise DeepgramTranscriptionError("Invalid recorded provider alternatives.")
    alternative = alternatives[0]
    transcript = alternative.get("transcript")
    if not isinstance(transcript, str):
        raise DeepgramTranscriptionError("Invalid recorded provider transcript.")

    words = alternative.get("words")
    result = {"transcript": transcript}
    segments = speaker_segment_builder(words, {})
    # A word array can be structurally valid yet omit part of the transcript.
    # Compare all spoken text, permitting whitespace differences only; if the
    # provider applies other formatting, the complete plain text remains safe.
    attributed_text = " ".join(segment["text"] for segment in segments)
    if segments and " ".join(attributed_text.split()) == " ".join(transcript.split()):
        timestamped = _timestamp_speaker_segments(words, segments)
        if timestamped:
            segments = timestamped
        result["speaker_segments"] = segments
    return result


def _timestamp_speaker_segments(words: object, segments: list[dict]) -> list[dict]:
    """Add provider timestamps only when every displayed turn maps safely."""
    if not isinstance(words, list) or not segments:
        return []
    grouped: list[dict] = []
    speaker_labels: dict[int, str] = {}
    for word in words:
        if not isinstance(word, dict) or type(word.get("speaker")) is not int:
            return []
        start, end = word.get("start"), word.get("end")
        if not isinstance(start, (int, float)) or not isinstance(end, (int, float)):
            return []
        speaker = word["speaker"]
        if speaker not in speaker_labels:
            speaker_labels[speaker] = f"Speaker {len(speaker_labels) + 1}"
        label = speaker_labels[speaker]
        if grouped and grouped[-1]["speaker"] == label:
            grouped[-1]["end"] = end
        else:
            grouped.append({"speaker": label, "start": start, "end": end})
    if len(grouped) != len(segments):
        return []
    return [{**segment, "start": timing["start"], "end": timing["end"]}
            for segment, timing in zip(segments, grouped)]


def transcribe_recording(
    file_path: str,
    whisper_model: object,
    api_key: str | None,
    speaker_segment_builder: Callable[[object, dict], list[dict]],
    speaker_mode: str = "multi",
    language: str = "en",
) -> dict:
    """Single-speaker recordings use Whisper; meetings retain provider fallback."""
    if speaker_mode not in ("single", "multi"):
        raise ValueError("Unsupported speaker mode")
    if api_key and speaker_mode == "multi":
        try:
            result = parse_deepgram_transcription(
                request_deepgram_transcription(file_path, api_key, language),
                speaker_segment_builder,
            )
            result["metadata"] = transcript_metadata(language, "deepgram")
            return result
        except Exception as error:
            # Only the exception class is logged, never provider bodies, keys,
            # file names, or transcript contents.
            logger.warning("recorded_provider_fallback error_type=%s", type(error).__name__)

    try:
        if language == "en":
            segments, _info = whisper_model.transcribe(file_path)
        else:
            segments, _info = whisper_model.transcribe(file_path, language=language)
        source_segments = []
        for segment in segments:
            item = {"text": segment.text}
            if isinstance(getattr(segment, "start", None), (int, float)):
                item["start"] = segment.start
            if isinstance(getattr(segment, "end", None), (int, float)):
                item["end"] = segment.end
            source_segments.append(item)
        return {
            "transcript": " ".join(segment["text"] for segment in source_segments),
            "transcript_segments": source_segments,
            "metadata": transcript_metadata(language, "whisper"),
        }
    except Exception as error:
        logger.warning("recorded_transcription_failed error_type=%s", type(error).__name__)
        raise RecordedTranscriptionError("Unable to transcribe this recording.") from error
