import copy
import importlib
import unittest
from unittest.mock import patch

from speaker_smoothing import smooth_speaker_words, smoothing_diagnostics

with patch("faster_whisper.WhisperModel"):
    main = importlib.import_module("main")


def timed_words(ids, durations=None, gaps=None):
    durations = durations or [0.2] * len(ids)
    gaps = gaps or {}
    words, cursor = [], 0.0
    for index, (speaker, duration) in enumerate(zip(ids, durations)):
        cursor = round(cursor + gaps.get(index, 0), 6)
        end = round(cursor + duration, 6)
        words.append({"speaker": speaker, "word": f"word{index}",
                      "punctuated_word": f"Word{index},", "start": cursor, "end": end})
        cursor = end
    return words


class SpeakerSmoothingTests(unittest.TestCase):
    def assert_ids(self, ids, expected=None, **kwargs):
        words = timed_words(ids, **kwargs)
        output = smooth_speaker_words(words)
        self.assertEqual([word["speaker"] for word in output], ids if expected is None else expected)
        return words, output

    def test_one_word_island_collapses(self):
        self.assert_ids([0, 0, 1, 0, 0], [0, 0, 0, 0, 0])

    def test_two_brief_words_collapse_only_within_duration_limit(self):
        self.assert_ids([0, 0, 1, 1, 0, 0], [0] * 6, durations=[.2, .2, .1, .1, .2, .2])
        self.assert_ids([0, 0, 1, 1, 0, 0])  # 400 ms island exceeds the cap.

    def test_three_word_run_remains_even_if_brief(self):
        self.assert_ids([0, 0, 1, 1, 1, 0, 0], durations=[.2, .2, .08, .08, .08, .2, .2])
        self.assert_ids([0, 0, 1, 1, 1, 0])

    def test_three_short_speakers_remain(self):
        self.assert_ids([0, 1, 2])

    def test_island_smooths_while_third_speaker_remains(self):
        self.assert_ids([0, 0, 2, 0, 0, 7, 7], [0, 0, 0, 0, 0, 7, 7])

    def test_nonsequential_ids_and_genuine_many_speakers(self):
        self.assert_ids([0, 0, 2, 2, 7, 7, 9, 9, 41, 41])
        self.assert_ids([7, 7, 2, 7, 7], [7] * 5)

    def test_different_surrounding_speakers_preserved(self):
        self.assert_ids([0, 0, 2, 7, 7])

    def test_short_boundary_runs_preserved(self):
        self.assert_ids([2, 0, 0, 0])
        self.assert_ids([0, 0, 0, 2])
        self.assert_ids([0, 2, 0])  # Neither flank has sufficient support.

    def test_long_word_and_weak_anchors_preserved(self):
        self.assert_ids([0, 0, 1, 0, 0], durations=[.2, .2, .6, .2, .2])
        self.assert_ids([0, 0, 1, 0, 0], durations=[.05, .05, .1, .2, .2])
        self.assert_ids([0, 0, 1, 0, 0], durations=[.2, .2, .1, .05, .05])

    def test_meaningful_pause_before_after_or_within_support_prevents_merge(self):
        for gap_index in (1, 2, 3, 4):
            with self.subTest(gap_index=gap_index):
                self.assert_ids([0, 0, 1, 0, 0], gaps={gap_index: .2})
        self.assert_ids([0, 0, 1, 1, 0, 0], durations=[.2, .2, .05, .05, .2, .2], gaps={3: .2})

    def test_short_continuous_gaps_allow_smoothing(self):
        self.assert_ids([0, 0, 1, 0, 0], [0] * 5, gaps={2: .05, 3: .05})

    def test_missing_timestamps_leave_raw_assignments(self):
        for key in ("start", "end"):
            for index in range(5):
                words = timed_words([0, 0, 1, 0, 0])
                del words[index][key]
                self.assertEqual(smooth_speaker_words(words), words)

    def test_invalid_or_overlapping_timing_leaves_raw_assignments(self):
        for value in (None, True, "0.4", -1, float("nan"), float("inf"), {}):
            words = timed_words([0, 0, 1, 0, 0])
            words[2]["start"] = value
            self.assertIs(smooth_speaker_words(words), words)
        for start, end in ((.1, .6), (.7, .6)):
            words = timed_words([0, 0, 1, 0, 0])
            words[2].update(start=start, end=end)
            self.assertIs(smooth_speaker_words(words), words)

    def test_malformed_metadata_retains_existing_plain_fallback(self):
        bad_inputs = [None, {}, [], [None], ["bad"]]
        for key, value in (("speaker", None), ("speaker", True), ("speaker", "1"), ("speaker", -1), ("punctuated_word", None)):
            words = timed_words([0, 0, 1, 0, 0])
            words[2][key] = value
            bad_inputs.append(words)
        for words in bad_inputs:
            with self.subTest(words=words):
                output = smooth_speaker_words(words)
                labels = {}
                self.assertEqual(main.deepgram_speaker_segments(output, labels), [])
                self.assertEqual(labels, {})

    def test_text_order_punctuation_and_raw_metadata_are_preserved(self):
        words = timed_words([0, 0, 2, 0, 0, 7, 7])
        original = copy.deepcopy(words)
        output = smooth_speaker_words(words)
        self.assertEqual(words, original)
        self.assertEqual(len(output), len(words))
        for raw, smoothed in zip(words, output):
            self.assertEqual({key: value for key, value in raw.items() if key != "speaker"},
                             {key: value for key, value in smoothed.items() if key != "speaker"})
        turns = main.deepgram_speaker_segments(output, {})
        self.assertEqual(" ".join(turn["text"] for turn in turns), " ".join(word["punctuated_word"] for word in words))

    def test_mapping_is_stable_and_recorded_parser_is_not_smoothed(self):
        words = timed_words([7, 7, 2, 7, 7])
        labels = {2: "Speaker 1", 7: "Speaker 2"}
        turns = main.deepgram_speaker_segments(smooth_speaker_words(words), labels)
        self.assertEqual([turn["speaker"] for turn in turns], ["Speaker 2"])
        self.assertEqual(labels, {2: "Speaker 1", 7: "Speaker 2"})
        self.assertEqual(len(main.deepgram_speaker_segments(words, {})), 3)

    def test_no_cascading_or_competing_anchor_changes(self):
        # All four runs have similar size/duration. Interior runs must not both
        # change attribution using each other as supposedly stable evidence.
        self.assert_ids([0, 0, 1, 1, 0, 0, 1, 1], durations=[.16] * 8)
        self.assert_ids([0, 0, 1, 0, 1, 0, 0])

    def test_safe_diagnostics_show_runs_without_text(self):
        words = timed_words([0, 0, 2, 0, 0, 7, 7])
        diagnostic = smoothing_diagnostics(words, smooth_speaker_words(words))
        self.assertIn("raw_runs=[0, 2, 0, 7]", diagnostic)
        self.assertIn("smoothed_runs=[0, 7]", diagnostic)
        self.assertIn("smoothed_words=1", diagnostic)
        self.assertNotIn("Word", diagnostic)
