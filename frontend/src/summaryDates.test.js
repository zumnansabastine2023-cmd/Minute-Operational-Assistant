import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { currentWeek } from './summaryDates.js'

test('weekly summary preserves Monday through today in UTC including year boundaries', () => {
  assert.deepEqual(currentWeek(new Date('2026-09-30T23:30:00-07:00')), { start: '2026-09-28', end: '2026-10-01' })
  assert.deepEqual(currentWeek(new Date('2027-01-03T12:00:00Z')), { start: '2026-12-28', end: '2027-01-03' })
  assert.deepEqual(currentWeek(new Date('2027-01-04T00:00:00Z')), { start: '2027-01-04', end: '2027-01-04' })
})

test('weekly summary has its own Intelligence destination and retains grounded results', () => {
  const app = readFileSync(new URL('./App.jsx', import.meta.url), 'utf8')
  assert.match(app, /handleModeChange\('weekly'\).*Weekly Summary/)
  assert.equal((app.match(/<WeeklySummary /g) || []).length, 1)
  const view = readFileSync(new URL('./WeeklySummary.jsx', import.meta.url), 'utf8')
  assert.ok(view.includes('result.meetings_considered === 0'))
  assert.ok(view.includes('result.answer'))
  assert.ok(view.includes('openMeeting(source.meeting_id)'))
})
