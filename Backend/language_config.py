"""Recorded-transcription language configuration and provider routing.

Stage 1 deliberately routes only English through the existing, tested engines.
Experimental languages remain explicit configuration entries until a suitable
speech engine is connected and validated for each language.
"""

from dataclasses import asdict, dataclass


@dataclass(frozen=True)
class LanguageOption:
    code: str
    label: str
    experimental: bool
    recorded_provider: str | None


LANGUAGES = {
    option.code: option
    for option in (
        LanguageOption("en", "English", False, "existing"),
        LanguageOption("ha", "Hausa", True, None),
        LanguageOption("yo", "Yoruba", True, None),
        LanguageOption("ig", "Igbo", True, None),
        LanguageOption("mixed", "Mixed languages", True, None),
    )
}

DEFAULT_LANGUAGE = "en"


class UnsupportedRecordedLanguage(ValueError):
    """The requested language has no tested recorded-speech route yet."""


def language_options() -> list[dict]:
    return [asdict(option) for option in LANGUAGES.values()]


def recorded_language(code: str) -> LanguageOption:
    try:
        option = LANGUAGES[code]
    except KeyError as error:
        raise ValueError("Unsupported language selection") from error
    if option.recorded_provider is None:
        raise UnsupportedRecordedLanguage(
            f"{option.label} transcription is experimental and is not available yet."
        )
    return option


def transcript_metadata(code: str, provider: str) -> dict:
    option = LANGUAGES[code]
    return {
        "language": {
            "code": option.code,
            "label": option.label,
            "experimental": option.experimental,
        },
        "provider": provider,
        "translations": {},
    }
