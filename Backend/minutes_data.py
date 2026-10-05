"""Backward-compatible minutes data and optimistic edit revisions."""
import hashlib
import json


def normalize_actions(value):
    if not isinstance(value, list):
        return []
    actions = []
    for item in value:
        if isinstance(item, str):
            item = {"task": item}
        if not isinstance(item, dict):
            continue
        actions.append({
            **({"assignee_user_id": item["assignee_user_id"]} if isinstance(item.get("assignee_user_id"), str) and item["assignee_user_id"] else {}),
            "task": item.get("task") if isinstance(item.get("task"), str) else "",
            "owner": item.get("owner") if isinstance(item.get("owner"), str) else "Unassigned",
            "deadline": item.get("deadline") if isinstance(item.get("deadline"), str) else "Not specified",
            "status": "Completed" if item.get("status") == "Completed" else "Open",
        })
    return actions


def meeting_revision(meeting):
    fields = {name: getattr(meeting, name, None) for name in (
        "title", "transcript", "summary", "key_points", "decisions", "action_items",
    )}
    fields["transcript_metadata"] = getattr(meeting, "transcript_metadata", None)
    return hashlib.sha256(json.dumps(fields, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
