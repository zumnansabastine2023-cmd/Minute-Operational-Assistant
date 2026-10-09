import assert from 'node:assert/strict'
import test from 'node:test'
import { pollRecordingJob, parseRecordingJob, storedRecordingJob, storedRecordingLanguage, storedRecordingMode } from './recordingJobs.js'
const id = '00000000-0000-0000-0000-000000000001'
test('poll queued processing and completed without inventing percentages', async () => {
  const states = ['Queued', 'Processing', 'Completed']
  const seen = []
  const result = await pollRecordingJob(async () => ({ ok: true, json: async () => ({ id, status: states.shift(), result: { transcript: 'Complete.' } }) }), (state) => seen.push(state), new AbortController().signal, async () => {})
  assert.equal(result.transcript, 'Complete.')
  assert.deepEqual(seen, ['Queued', 'Processing', 'Completed'])
})
test('failed and malformed responses cannot replace a recording', async () => {
  assert.throws(() => parseRecordingJob({ id, status: 'Completed', result: {} }))
  await assert.rejects(pollRecordingJob(async () => ({ ok: true, json: async () => ({ id, status: 'Failed' }) }), () => {}, new AbortController().signal), /failed/)
})
test('aborted polling returns no result', async () => {
  const controller = new AbortController()
  controller.abort()
  assert.equal(await pollRecordingJob(() => assert.fail(), () => {}, controller.signal), null)
})

test('resuming a job restores its speaker mode only for its own account and clears both together', () => {
  const previous = globalThis.sessionStorage
  const values = new Map()
  globalThis.sessionStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  }
  try {
    storedRecordingJob('one', id, 'single', undefined, 'en')
    assert.equal(storedRecordingJob('one'), id)
    assert.equal(storedRecordingMode('one'), 'single')
    assert.equal(storedRecordingLanguage('one'), 'en')
    assert.equal(storedRecordingMode('two'), 'multi')
    assert.equal(storedRecordingJob('two'), null)
    storedRecordingJob('one', null)
    assert.equal(storedRecordingMode('one'), 'multi')
    assert.equal(values.size, 0)
  } finally { globalThis.sessionStorage = previous }
})
