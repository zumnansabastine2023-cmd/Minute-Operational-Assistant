import unittest

from source_attribution import select_supporting_sources


def source(meeting_id: str, chunk_index: int) -> dict:
    return {
        "meeting_id": meeting_id,
        "meeting_title": f"Meeting {meeting_id}",
        "meeting_type": "recorded",
        "chunk_index": chunk_index,
    }


class SourceAttributionTests(unittest.TestCase):
    def test_returns_only_the_supporting_meeting(self):
        retrieved = {
            "source_1": source("A", 0),
            "source_2": source("B", 0),
            "source_3": source("C", 0),
        }

        self.assertEqual(
            select_supporting_sources(retrieved, ["source_1"]),
            [retrieved["source_1"]],
        )

    def test_preserves_genuine_multi_source_attribution(self):
        retrieved = {
            "source_1": source("A", 0),
            "source_2": source("B", 0),
            "source_3": source("C", 0),
        }

        self.assertEqual(
            select_supporting_sources(retrieved, ["source_1", "source_2"]),
            [retrieved["source_1"], retrieved["source_2"]],
        )

    def test_deduplicates_multiple_chunks_from_one_meeting(self):
        retrieved = {
            "source_1": source("A", 0),
            "source_2": source("A", 1),
        }

        self.assertEqual(
            select_supporting_sources(retrieved, ["source_1", "source_2"]),
            [retrieved["source_1"]],
        )

    def test_no_grounded_sources_returns_no_citations(self):
        retrieved = {
            "source_1": source("A", 0),
            "source_2": source("B", 0),
        }

        self.assertEqual(select_supporting_sources(retrieved, []), [])
        self.assertEqual(
            select_supporting_sources(retrieved, ["source_not_retrieved", 123]),
            [],
        )


if __name__ == "__main__":
    unittest.main()
