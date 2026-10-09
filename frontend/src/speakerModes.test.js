import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resetSpeakerMode, speakerSocketUrl } from './speakerModes.js'
import { selectMeetingTranscript } from './liveSpeakerTurns.js'

test('live and online URLs transmit validated single/multi choices', () => {
  for (const mode of ['single', 'multi']) {
    assert.equal(new URL(speakerSocketUrl('wss://example.test/ws/transcribe', mode)).searchParams.get('speaker_mode'), mode)
  }
  assert.throws(() => speakerSocketUrl('wss://example.test', 'auto'))
  const app = readFileSync(new URL('./App.jsx', import.meta.url), 'utf8')
  for (const type of ['live', 'online']) {
    assert.ok(app.includes(`speakerSocketUrl(TRANSCRIPTION_SOCKET_URL, speakerModes.${type})`))
  }
  assert.ok(app.includes("formData.append('speaker_mode', speakerModes.recorded)"))
})

test('switching either way clears turns, names and stale minutes', () => {
  for (const mode of ['single', 'multi']) {
    assert.deepEqual(resetSpeakerMode(mode), { mode, turns: [], names: {}, minutes: null })
  }
  assert.throws(() => resetSpeakerMode('auto'))
})

test('minutes and save share plain single text or canonical unlimited speaker text', () => {
  const turns = Array.from({ length: 12 }, (_, i) => ({ speaker: `Speaker ${i + 1}`, text: `Words ${i}` }))
  const plain = turns.map(t => t.text).join(' ')
  for (const type of ['live', 'online', 'recorded']) {
    assert.equal(selectMeetingTranscript(type, plain, turns, turns, turns, {}, { [type]: 'single' }), plain)
    const multi = selectMeetingTranscript(type, plain, turns, turns, turns, {}, { [type]: 'multi' })
    assert.ok(multi.includes('Speaker 12: Words 11'))
    assert.equal(multi.split('\n').length, 12)
  }
  const app = readFileSync(new URL('./App.jsx', import.meta.url), 'utf8')
  // Both production request paths must use the tested selector with mode state.
  assert.equal(app.match(/const cleanedTranscript = selectMeetingTranscript\(meetingType, meetingTranscript, liveSpeakerTurns, onlineSpeakerTurns, recordedSpeakerTurns, speakerNames, speakerModes\)/g)?.length, 2)
})
