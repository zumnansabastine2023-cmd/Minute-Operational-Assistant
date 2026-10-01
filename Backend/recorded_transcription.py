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


class RecordedTranscriptionError(Exception):
    """Neither the provider nor the local transcription fallback succeeded."""


class DeepgramTranscriptionError(Exception):
    """The prerecorded provider response could not be used safely."""


def request_deepgram_transcription(file_path: str, api_key: str) -> object:
    """Send a bounded local file to Deepgram using the existing account key."""
    query = urlencode({
        "model": "nova-3",
        "diarize_model": "latest",
        "punctuate": "true",
    })
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

    result = {"transcript": transcript}
    segments = speaker_segment_builder(alternative.get("words"), {})
    # A word array can be structurally valid yet omit part of the transcript.
    # Compare all spoken text, permitting whitespace differences only; if the
    # provider applies other formatting, the complete plain text remains safe.
    attributed_text = " ".join(segment["text"] for segment in segments)
    if segments and " ".join(attributed_text.split()) == " ".join(transcript.split()):
        result["speaker_segments"] = segments
    return result


def transcribe_recording(
    file_path: str,
    whisper_model: object,
    api_key: str | None,
    speaker_segment_builder: Callable[[object, dict], list[dict]],
    speaker_mode: str = "multi",
) -> dict:
    """Single-speaker recordings use Whisper; meetings retain provider fallback."""
    if speaker_mode not in ("single", "multi"):
        raise ValueError("Unsupported speaker mode")
    if api_key and speaker_mode == "multi":
        try:
            return parse_deepgram_transcription(
                request_deepgram_transcription(file_path, api_key),
                speaker_segment_builder,
            )
        except Exception as error:
            # Only the exception class is logged, never provider bodies, keys,
            # file names, or transcript contents.
            logger.warning("recorded_provider_fallback error_type=%s", type(error).__name__)

    try:
        segments, _info = whisper_model.transcribe(file_path)
        return {"transcript": " ".join(segment.text for segment in segments)}
    except Exception as error:
        logger.warning("recorded_transcription_failed error_type=%s", type(error).__name__)
        raise RecordedTranscriptionError("Unable to transcribe this recording.") from error
