import assert from 'node:assert/strict'
import test from 'node:test'
import { recorderIsActive, releaseCaptureResources } from './captureLifecycle.js'
test('stopping during connection without a recorder is safe', () => {
  assert.equal(recorderIsActive(null), false)
  assert.equal(recorderIsActive({ state: 'inactive' }), false)
  assert.equal(recorderIsActive({ state: 'recording' }), true)
})
test('unmount releases audio and sockets without callbacks crossing accounts', () => {
  const stopped = []
  const recorder = { current: { state: 'recording', stop: () => stopped.push('recorder'), onstop: () => assert.fail() } }
  const stream = { current: { getTracks: () => [{ stop: () => stopped.push('track') }] } }
  const socket = { current: { close: () => stopped.push('socket') } }
  releaseCaptureResources([recorder], [stream], [socket])
  assert.deepEqual(stopped, ['recorder', 'track', 'socket'])
  assert.equal(recorder.current, null)
  assert.equal(socket.current, null)
})
