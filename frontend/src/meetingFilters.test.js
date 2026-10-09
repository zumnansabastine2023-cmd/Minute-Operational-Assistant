import assert from 'node:assert/strict'
import test from 'node:test'
import { filterMeetings } from './meetingFilters.js'
const meetings = [
  { id: 1, type: 'live', title: 'Dashboard', transcript: 'David: Charts', created_at: '2026-09-20T23:59:00Z', minutes: { action_items: [{ task: 'Charts', status: 'Completed' }] } },
  { id: 2, type: 'online', title: 'Dashboard', created_at: '2026-09-21T00:00:00Z', minutes: { action_items: ['Old task'] } },
]
test('keyword date type and action status combine and clear predictably', () => {
  assert.deepEqual(filterMeetings(meetings, { keyword: 'david', start: '2026-09-20', end: '2026-09-20', type: 'live', actionStatus: 'Completed' }).map((m) => m.id), [1])
  assert.deepEqual(filterMeetings(meetings, { actionStatus: 'Open' }).map((m) => m.id), [2])
  assert.equal(filterMeetings(meetings).length, 2)
  assert.equal(filterMeetings(meetings, { start: '2026-09-22', end: '2026-09-20' }).length, 0)
})
test('filtering is not capped before type or keyword matching', () => {
  const many = [...Array.from({ length: 25 }, (_, id) => ({ ...meetings[1], id: id + 3 })), meetings[0]]
  assert.equal(filterMeetings(many, { type: 'live', keyword: 'charts' }).length, 1)
})
