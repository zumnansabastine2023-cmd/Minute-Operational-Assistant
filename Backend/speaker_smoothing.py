"""Conservative, stateless smoothing of final streaming word speaker IDs.

Only attribution changes. Raw provider objects are never mutated. There is no
speaker-count assumption, timing inference, voice matching or cross-result delay.
"""
import math


MAX_ISOLATED_WORDS = 2
MAX_ISOLATED_DURATION_SECONDS = 0.350
MIN_SUPPORT_WORDS = 2
MIN_SUPPORT_DURATION_SECONDS = 0.300
MAX_CONTINUITY_GAP_SECONDS = 0.120


def speaker_runs(words):
    """Return (provider ID, inclusive start index, exclusive end index) runs."""
    runs = []
    for index, word in enumerate(words):
        speaker = word["speaker"]
        if runs and runs[-1][0] == speaker:
            runs[-1] = (speaker, runs[-1][1], index + 1)
        else:
            runs.append((speaker, index, index + 1))
    return runs


def valid_speaker_words(words):
    """Match the existing parser's required metadata; never repair invalid data."""
    return isinstance(words, list) and bool(words) and all(
        isinstance(word, dict)
        and type(word.get("speaker")) is int and word["speaker"] >= 0
        and isinstance(word.get("punctuated_word", word.get("word")), str)
        and bool(word.get("punctuated_word", word.get("word")).strip())
        for word in words
    )


def smooth_speaker_words(words):
    """Absorb only tiny islands with stable, continuous same-speaker anchors.

    All word times must be finite, nonnegative, nonoverlapping seconds supplied
    by the provider. Missing/unreliable timing leaves the original assignments.
    Invalid speaker/text metadata passes through to the existing plain fallback.

    Decisions use ORIGINAL runs in a single pass, so smoothing cannot create
    support for further merges. Competing candidates cannot serve as anchors for
    each other. First/last runs and short A/B/C exchanges remain.
    """
    if not valid_speaker_words(words):
        return words
    previous_end = 0
    for word in words:
        start, end = word.get("start"), word.get("end")
        try:
            finite = (type(start) in (int, float) and type(end) in (int, float)
                      and math.isfinite(start) and math.isfinite(end))
        except OverflowError:
            finite = False
        if (not finite
                or start < previous_end or end < start):
            return words
        previous_end = end

    runs = speaker_runs(words)
    smoothed = [word.copy() for word in words]
    candidates = {}
    for run_index, (left, middle, right) in enumerate(zip(runs, runs[1:], runs[2:]), start=1):
        speaker, start, end = middle
        if (left[0] != right[0] or speaker == left[0]
                or end - start > MAX_ISOLATED_WORDS
                or left[2] - left[1] < MIN_SUPPORT_WORDS
                or right[2] - right[1] < MIN_SUPPORT_WORDS):
            continue
        if words[end - 1]["end"] - words[start]["start"] > MAX_ISOLATED_DURATION_SECONDS:
            continue

        # Examine only the immediately surrounding support words, not distant
        # speech elsewhere in a long run from the same speaker.
        anchor_start = start - MIN_SUPPORT_WORDS
        anchor_end = end + MIN_SUPPORT_WORDS
        left_duration = words[start - 1]["end"] - words[anchor_start]["start"]
        right_duration = words[anchor_end - 1]["end"] - words[end]["start"]
        if min(left_duration, right_duration) < MIN_SUPPORT_DURATION_SECONDS:
            continue
        window = words[anchor_start:anchor_end]
        if any(b["start"] - a["end"] > MAX_CONTINUITY_GAP_SECONDS for a, b in zip(window, window[1:])):
            continue
        candidates[run_index] = (start, end, left[0])
    for run_index, (start, end, target) in candidates.items():
        if run_index - 1 in candidates or run_index + 1 in candidates:
            continue
        for index in range(start, end):
            smoothed[index]["speaker"] = target
    return smoothed


def smoothing_diagnostics(raw_words, smoothed_words):
    """Bounded numeric diagnostics only; no word text or arbitrary provider data."""
    if not valid_speaker_words(raw_words) or not valid_speaker_words(smoothed_words):
        return "smoothing=skipped_invalid_metadata"
    raw_runs = [speaker for speaker, _, _ in speaker_runs(raw_words)]
    smooth_runs = [speaker for speaker, _, _ in speaker_runs(smoothed_words)]
    changed = sum(a["speaker"] != b["speaker"] for a, b in zip(raw_words, smoothed_words))
    # Avoid unbounded console output for a malformed/noisy provider result.
    return (f"raw_runs={raw_runs[:32]} smoothed_runs={smooth_runs[:32]} "
            f"raw_run_count={len(raw_runs)} smoothed_run_count={len(smooth_runs)} "
            f"smoothed_words={changed}")
