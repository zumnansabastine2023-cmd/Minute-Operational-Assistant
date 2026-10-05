export const RECORDED_LANGUAGES = Object.freeze([
  { code: 'en', label: 'English', experimental: false, available: true },
  { code: 'ha', label: 'Hausa', experimental: true, available: false },
  { code: 'yo', label: 'Yoruba', experimental: true, available: false },
  { code: 'ig', label: 'Igbo', experimental: true, available: false },
  { code: 'mixed', label: 'Mixed languages', experimental: true, available: false },
])

export const DEFAULT_RECORDED_LANGUAGE = 'en'

export function recordedLanguage(code) {
  return RECORDED_LANGUAGES.find((language) => language.code === code)
    || RECORDED_LANGUAGES[0]
}

export function recordedTranscriptMetadata(result, languageCode) {
  const language = recordedLanguage(languageCode)
  return {
    source: {
      language: result?.metadata?.language || {
        code: language.code,
        label: language.label,
        experimental: language.experimental,
      },
      provider: result?.metadata?.provider || null,
      transcript: result?.transcript || '',
      segments: Array.isArray(result?.transcript_segments) ? result.transcript_segments : [],
      speaker_segments: Array.isArray(result?.speaker_segments) ? result.speaker_segments : [],
    },
    translations: result?.metadata?.translations || {},
  }
}
