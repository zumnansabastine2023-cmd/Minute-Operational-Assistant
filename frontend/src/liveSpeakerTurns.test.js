import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { appendLiveSpeakerTurns, canonicalLiveTranscript, selectMeetingTranscript, normalizeSpeakerName } from './liveSpeakerTurns.js'

const turns = [
  { speaker: 'Speaker 1', text: 'Finish the dashboard Friday.' },
  { speaker: 'Speaker 2', text: 'I will finish the charts Thursday.' },
  { speaker: 'Speaker 1', text: 'We will review Friday morning.' },
]
const labelled = 'Speaker 1: Finish the dashboard Friday.\nSpeaker 2: I will finish the charts Thursday.\nSpeaker 1: We will review Friday morning.'
const plain = '  Original complete transcript.\nUnlabelled speech.  '

test('formats multiple turns as newline-separated plain text', () => {
  assert.equal(canonicalLiveTranscript(turns, plain), labelled)
  assert.equal(JSON.parse(JSON.stringify({ transcript: labelled })).transcript, labelled)
})

test('preserves existing consecutive-speaker merge and alternating speakers', () => {
  let merged = appendLiveSpeakerTurns([], [turns[0]], turns[0].text)
  merged = appendLiveSpeakerTurns(merged, [{ speaker: 'Speaker 1', text: 'Please.' }, turns[1]], `Please. ${turns[1].text}`)
  assert.equal(canonicalLiveTranscript(merged, plain),
    'Speaker 1: Finish the dashboard Friday. Please.\nSpeaker 2: I will finish the charts Thursday.')
})

test('one valid speaker works and trims labels and text', () => {
  assert.equal(canonicalLiveTranscript([{ speaker: ' Speaker 1 ', text: ' Hello. ' }], plain), 'Speaker 1: Hello.')
})

test('unavailable, empty, malformed, and partially invalid turns preserve the full fallback', () => {
  for (const invalid of [undefined, null, [], Array(2), {}, 'bad', [null], [{}],
    ...[undefined, null, '', ' ', 'undefined', 'null', 1].map((speaker) => [{ speaker, text: 'Hello' }]),
    ...[undefined, null, '', ' ', 1].map((text) => [{ speaker: 'Speaker 1', text }]),
    [turns[0], { speaker: null, text: 'Unlabelled speech.' }]]) {
    assert.equal(canonicalLiveTranscript(invalid, plain), plain)
  }
  const partial = appendLiveSpeakerTurns(turns, undefined, 'Unlabelled speech.')
  assert.equal(canonicalLiveTranscript(partial, plain), plain)
})

for (const action of ['generateMinutes', 'saveMeeting']) {
  test(`${action} uses the shared selector before serializing its request`, () => {
    const app = readFileSync(new URL('./App.jsx', import.meta.url), 'utf8')
    const handler = app.split(`const ${action} = async`)[1].split('\n  const ')[0]
    assert.match(handler, /const cleanedTranscript = selectMeetingTranscript\(meetingType, meetingTranscript, liveSpeakerTurns, onlineSpeakerTurns, recordedSpeakerTurns, speakerNames, speakerModes\)\.trim\(\)/)
    assert.match(handler, /transcript: cleanedTranscript/)
    assert.equal(selectMeetingTranscript('live', plain, turns).trim(), labelled)
    assert.equal(selectMeetingTranscript('live', plain, []).trim(), plain.trim())
  })
}

test('recorded and online transcripts stay unchanged even with live turns present', () => {
  for (const type of ['recorded', 'online']) {
    assert.equal(selectMeetingTranscript(type, plain, turns), plain)
  }
})

test('online canonical selection uses only online finalized turns', () => {
  assert.equal(selectMeetingTranscript('online', plain, [], turns), labelled)
  assert.equal(selectMeetingTranscript('online', plain, turns, []), plain)
  assert.equal(selectMeetingTranscript('online', plain, [], [{ speaker: null, text: 'Missing' }]), plain)
})

test('recorded canonical selection and incomplete metadata fallback', () => {
  assert.equal(selectMeetingTranscript('recorded', plain, [], [], turns), labelled)
  assert.equal(selectMeetingTranscript('recorded', plain, turns, turns, []), plain)
})

test('incomplete or invalid incoming metadata never drops finalized text', () => {
  for (const segments of [[{ speaker: 'Speaker 1', text: 'Hello' }], [{ speaker: 'undefined', text: 'Hello complete world.' }]]) {
    const updated = appendLiveSpeakerTurns([], segments, 'Hello complete world.')
    assert.deepEqual(updated, [{ speaker: null, text: 'Hello complete world.' }])
    assert.equal(canonicalLiveTranscript(updated, 'Hello complete world.'), 'Hello complete world.')
  }
})

test('meeting-local renames preserve stable IDs and all alternating turns', () => {
  const names = { live: { 'Speaker 1': 'Abdul', 'Speaker 2': 'David' } }
  assert.equal(selectMeetingTranscript('live', plain, turns, [], [], names), labelled.replaceAll('Speaker 1', 'Abdul').replaceAll('Speaker 2', 'David'))
  assert.equal(selectMeetingTranscript('online', plain, [], turns, [], names), labelled)
  assert.equal(turns[0].speaker, 'Speaker 1')
  assert.equal(canonicalLiveTranscript(turns, plain, { 'Speaker 1': 'Bad: label' }), labelled)
})

test('speaker names trim whitespace and reject empty, long, or malformed labels', () => {
  assert.equal(normalizeSpeakerName('  Abdul  '), 'Abdul')
  assert.equal(normalizeSpeakerName('Mariam O’Neil'), 'Mariam O’Neil')
  for (const invalid of ['', '  ', null, 3, 'a'.repeat(81), 'X:Y', 'X\nY', '<X>', 'undefined', 'null', 'X\u202eY']) {
    assert.equal(normalizeSpeakerName(invalid), null)
  }
})
