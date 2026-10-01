"""Bounded, source-labelled aggregation of owned meeting records."""
from datetime import datetime, time, timedelta, timezone
import json
try:
    from .minutes_data import normalize_actions
except ImportError:
    from minutes_data import normalize_actions

MAX_SUMMARY_MEETINGS = 20
MAX_SUMMARY_CHARS = 24000
PER_MEETING_CHARS = 1200


def summary_date_bounds(start, end):
    if end < start or (end - start).days > 92:
        raise ValueError("Choose an ordered date range of at most 93 days.")
    return (datetime.combine(start, time.min, timezone.utc),
            datetime.combine(end + timedelta(days=1), time.min, timezone.utc))


def build_summary_context(meetings, chunker):
    parts, sources = [], {}
    limited = len(meetings) > MAX_SUMMARY_MEETINGS
    used = 0
    for meeting in meetings[:MAX_SUMMARY_MEETINGS]:
        source_id = f"M{len(parts) + 1}"
        stored = {
            "summary": meeting.summary or "",
            "decisions": meeting.decisions or [],
            "action_items": normalize_actions(meeting.action_items),
            "discussion_points": meeting.key_points or [],
        }
        if any(stored.values()):
            content = json.dumps(stored, ensure_ascii=False)
        else:
            content = "\n".join(chunker(meeting)[:2])
        limited |= len(content) > PER_MEETING_CHARS
        heading = f"Source ID: {source_id}\nMeeting: {meeting.title[:255]}\nDate: {meeting.created_at.isoformat()}\n"
        remaining = MAX_SUMMARY_CHARS - used - len(heading) - 2
        if remaining <= 0:
            limited = True
            break
        excerpt = content[:min(PER_MEETING_CHARS, remaining)]
        limited |= len(excerpt) < len(content)
        part = heading + excerpt
        parts.append(part)
        used += len(part) + 2
        sources[source_id] = {"meeting_id": str(meeting.id), "meeting_title": meeting.title,
                              "meeting_type": meeting.type, "meeting_date": meeting.created_at.isoformat()}
    return "\n\n".join(parts), sources, limited
