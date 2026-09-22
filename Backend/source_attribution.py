"""Pure helpers for validating and deduplicating assistant source attribution."""

from collections.abc import Mapping, Sequence
from typing import Any


def select_supporting_sources(
    retrieved_sources: Mapping[str, dict[str, Any]],
    supporting_source_ids: Sequence[object],
) -> list[dict[str, Any]]:
    """Return only retrieved sources cited by the model, once per meeting.

    Unknown or malformed IDs are ignored, so model output can never introduce a
    meeting that was not present in the owner-scoped retrieval result.
    """
    selected: list[dict[str, Any]] = []
    seen_meeting_ids: set[str] = set()

    for source_id in supporting_source_ids:
        if not isinstance(source_id, str):
            continue
        source = retrieved_sources.get(source_id)
        if source is None:
            continue
        meeting_id = source.get("meeting_id")
        if not isinstance(meeting_id, str) or meeting_id in seen_meeting_ids:
            continue
        seen_meeting_ids.add(meeting_id)
        selected.append(source)

    return selected
