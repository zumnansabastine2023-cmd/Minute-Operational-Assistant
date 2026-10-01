import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeMinutes, isMinutesResponse, isMeetingResponse } from './minutesData.js'

test('old string actions and missing status normalize without losing content', () => {
  const result = normalizeMinutes({ summary: 'Notes', action_items: ['Old task', { task: 'New', owner: 'David', status: 'Completed' }, null] })
  assert.equal(result.action_items.length, 2)
  assert.equal(result.action_items[0].status, 'Open')
  assert.equal(result.action_items[1].status, 'Completed')
  assert.equal(result.action_items[1].owner, 'David')
  assert.deepEqual(normalizeMinutes(result), result)
})
test('malformed generation response is rejected rather than overwriting a draft', () => {
  assert.ok(!isMinutesResponse({}))
  assert.ok(!isMinutesResponse({ summary: 'x', key_points: [], decisions: [], action_items: [null] }))
  assert.ok(isMinutesResponse(normalizeMinutes({})))
})

test('malformed meeting responses are rejected while old minute records are allowed', () => {
  assert.ok(!isMeetingResponse(null))
  assert.ok(!isMeetingResponse({ title: 'Bad' }))
  assert.ok(isMeetingResponse({ id: 'id', title: 'Old', type: 'live', transcript: 'Text', created_at: '2026-09-29', minutes: { action_items: ['Old task'] } }))
})
