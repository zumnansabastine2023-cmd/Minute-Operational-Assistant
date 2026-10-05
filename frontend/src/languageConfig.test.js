import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_RECORDED_LANGUAGE, RECORDED_LANGUAGES, recordedLanguage, recordedTranscriptMetadata } from './languageConfig.js'

test('English remains the default available recorded language', () => {
  assert.equal(DEFAULT_RECORDED_LANGUAGE, 'en')
  assert.equal(recordedLanguage('en').available, true)
})

test('target languages are visible, experimental, and unavailable pending an engine', () => {
  assert.deepEqual(RECORDED_LANGUAGES.map(language => language.code), ['en', 'ha', 'yo', 'ig', 'mixed'])
  for (const code of ['ha', 'yo', 'ig', 'mixed']) {
    assert.equal(recordedLanguage(code).experimental, true)
    assert.equal(recordedLanguage(code).available, false)
  }
})

test('recorded metadata keeps original text, labels, timestamps, and an isolated translations map', () => {
  const metadata = recordedTranscriptMetadata({
    transcript: 'Original words.',
    speaker_segments: [{ speaker: 'Speaker 1', text: 'Original words.', start: 1, end: 2 }],
    transcript_segments: [{ text: 'Original words.', start: 1, end: 2 }],
    metadata: { language: { code: 'en', label: 'English', experimental: false }, provider: 'deepgram', translations: {} },
  }, 'en')
  assert.equal(metadata.source.transcript, 'Original words.')
  assert.equal(metadata.source.speaker_segments[0].speaker, 'Speaker 1')
  assert.equal(metadata.source.segments[0].start, 1)
  assert.deepEqual(metadata.translations, {})
})
