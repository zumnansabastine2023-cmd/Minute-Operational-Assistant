import unittest

try:
    from .language_config import (
        DEFAULT_LANGUAGE,
        UnsupportedRecordedLanguage,
        language_options,
        recorded_language,
        transcript_metadata,
    )
except ImportError:
    from language_config import (
        DEFAULT_LANGUAGE,
        UnsupportedRecordedLanguage,
        language_options,
        recorded_language,
        transcript_metadata,
    )


class LanguageConfigurationTests(unittest.TestCase):
    def test_english_preserves_the_existing_recorded_route(self):
        self.assertEqual(DEFAULT_LANGUAGE, "en")
        self.assertEqual(recorded_language("en").recorded_provider, "existing")
        self.assertFalse(recorded_language("en").experimental)

    def test_target_languages_are_explicitly_experimental_and_unrouted(self):
        options = {item["code"]: item for item in language_options()}
        self.assertEqual(set(options), {"en", "ha", "yo", "ig", "mixed"})
        for code in ("ha", "yo", "ig", "mixed"):
            self.assertTrue(options[code]["experimental"])
            self.assertIsNone(options[code]["recorded_provider"])
            with self.assertRaises(UnsupportedRecordedLanguage):
                recorded_language(code)

    def test_metadata_reserves_translations_without_replacing_source(self):
        metadata = transcript_metadata("en", "whisper")
        self.assertEqual(metadata["language"]["code"], "en")
        self.assertEqual(metadata["translations"], {})


if __name__ == "__main__":
    unittest.main()
