import test from 'node:test'
import assert from 'node:assert/strict'
import { availableWorkspace, canManageWorkspace, meetingBelongsToWorkspace, workspaceKey, workspaceRequest, workspaceUrl } from './workspaceScope.js'
import { storedRecordingJob, storedRecordingMode } from './recordingJobs.js'

const alpha = { id: 'alpha', role: 'admin' }
const beta = { id: 'beta', role: 'member' }

test('workspace and account switches use fresh state keys, Personal is default and removed membership falls back', () => {
  const keys = [workspaceKey('a', null), workspaceKey('a', alpha), workspaceKey('a', beta), workspaceKey('b', beta)]
  assert.equal(new Set(keys).size, 4)
  assert.notEqual(workspaceKey('a', alpha), workspaceKey('a', { ...alpha, role: 'member' }))
  assert.equal(availableWorkspace('', [alpha, beta]), null)
  assert.equal(availableWorkspace('alpha', [beta]), null)
  assert.equal(availableWorkspace('beta', [alpha, beta]), beta)
  assert.equal(canManageWorkspace(null), true)
  assert.equal(canManageWorkspace(alpha), true)
  assert.equal(canManageWorkspace(beta), false)
  assert.equal(meetingBelongsToWorkspace({ organization_id: null }, null), true)
  assert.equal(meetingBelongsToWorkspace({ organization_id: 'alpha' }, alpha), true)
  assert.equal(meetingBelongsToWorkspace({ organization_id: 'beta' }, alpha), false)
  assert.equal(meetingBelongsToWorkspace({ organization_id: null }, alpha), false)
})

test('scope URLs replace stale scope without losing speaker selection or search', () => {
  const url = 'wss://example.test/ws/transcribe?speaker_mode=single&organization_id=old'
  assert.equal(new URL(workspaceUrl(url, alpha)).searchParams.get('organization_id'), 'alpha')
  assert.equal(new URL(workspaceUrl(url, null)).searchParams.has('organization_id'), false)
  assert.equal(new URL(workspaceUrl(url, beta)).searchParams.get('speaker_mode'), 'single')
})

test('old workspace requests abort; authorization loss invokes fallback', async () => {
  const controller = new AbortController()
  let lost = 0
  const request = workspaceRequest(async (url, options) => {
    assert.equal(new URL(url).searchParams.get('organization_id'), 'alpha')
    assert.equal(options.expectedUserId, 'a')
    return new Response(JSON.stringify({ detail: 'You no longer have access to this company workspace.' }), { status: 403 })
  }, alpha, 'a', controller.signal, () => lost++)
  await request('https://example.test/meetings')
  assert.equal(lost, 1)
  controller.abort()
  await assert.rejects(request('https://example.test/meetings'), { name: 'AbortError' })
})

test('recording job resume is isolated between Personal and two companies', () => {
  const previous = globalThis.sessionStorage
  const values = new Map()
  globalThis.sessionStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }
  try {
    storedRecordingJob('a', 'personal-job', 'single')
    storedRecordingJob('a', 'alpha-job', 'multi', 'alpha')
    assert.equal(storedRecordingJob('a'), 'personal-job')
    assert.equal(storedRecordingJob('a', undefined, undefined, 'alpha'), 'alpha-job')
    assert.equal(storedRecordingJob('a', undefined, undefined, 'beta'), null)
    assert.equal(storedRecordingMode('a'), 'single')
    assert.equal(storedRecordingMode('a', 'alpha'), 'multi')
  } finally { globalThis.sessionStorage = previous }
})
