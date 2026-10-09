import test from 'node:test'
import assert from 'node:assert/strict'
import { knowledgeSyncState, retryKnowledgeSync } from './knowledgeSync.js'

test('successful save sync is quiet; failed sync preserves saved outcome and offers retry', () => {
  assert.deepEqual(knowledgeSyncState(true), { status: 'synced', message: '' })
  assert.equal(knowledgeSyncState(false).status, 'pending')
  assert.match(knowledgeSyncState(false).message, /meeting is saved/)
  assert.equal(knowledgeSyncState(undefined).status, 'unknown')
})

test('retry success clears retry state with short confirmation', async () => {
  const calls = []
  const state = await retryKnowledgeSync(async (...args) => {
    calls.push(args)
    return { ok: true, json: async () => ({ chunks_indexed: 2 }) }
  }, '/meetings/one')
  assert.equal(state.status, 'synced')
  assert.equal(calls[0][0], '/meetings/one/index')
  assert.equal(calls[0][1].method, 'POST')
})

test('failed, conflicting, malformed and interrupted retries stay safe', async () => {
  for (const response of [{ ok: false, status: 502 }, { ok: false, status: 409 }, { ok: true, json: async () => ({}) }]) {
    const state = await retryKnowledgeSync(async () => response, '/meetings/one')
    assert.equal(state.status, 'pending')
    assert.match(state.message, /saved|changed/)
  }
  const offline = await retryKnowledgeSync(async () => { throw new Error('private request details') }, '/meetings/one')
  assert.equal(offline.status, 'pending')
  assert.doesNotMatch(offline.message, /private/)
  const controller = new AbortController()
  controller.abort()
  assert.equal(await retryKnowledgeSync(async () => { throw new Error('abort') }, '/meetings/one', controller.signal), null)
})
