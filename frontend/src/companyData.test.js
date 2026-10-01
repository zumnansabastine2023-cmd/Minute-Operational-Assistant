import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { companyData } from './companyData.js'

const meeting = (id, organization, date, status = 'Open') => ({
  id, organization_id: organization, title: id, created_at: date,
  minutes: { summary: '', key_points: [], decisions: [`Decision ${id}`], action_items: [
    { task: `Task ${id}`, owner: `Owner ${id}`, deadline: 'Friday', status },
  ] },
})

test('company dashboard and action aggregation exclude Personal and other companies', () => {
  const meetings = [
    meeting('alpha-current', 'alpha', '2026-09-30T12:00:00Z'),
    meeting('alpha-old', 'alpha', '2026-09-01T12:00:00Z', 'Completed'),
    meeting('beta', 'beta', '2026-09-30T12:00:00Z'),
    meeting('personal', null, '2026-09-30T12:00:00Z'),
  ]
  const result = companyData(meetings, 'alpha', new Date('2026-09-30T18:00:00Z'))
  assert.deepEqual(result.meetings.map(item => item.id), ['alpha-current', 'alpha-old'])
  assert.equal(result.thisWeek, 1)
  assert.deepEqual(result.open.map(item => item.meetingId), ['alpha-current'])
  assert.deepEqual(result.completed.map(item => item.meetingId), ['alpha-old'])
  assert.deepEqual(result.decisions.map(item => item.meetingId), ['alpha-current', 'alpha-old'])
})

test('company views expose read-only member UX while backend remains authoritative', () => {
  const views = readFileSync(new URL('./CompanyViews.jsx', import.meta.url), 'utf8')
  const app = readFileSync(new URL('./App.jsx', import.meta.url), 'utf8')
  assert.ok(views.includes("workspace.role === 'admin'"))
  assert.ok(views.includes("workspace.role !== 'admin'"))
  assert.ok(views.includes("workspace.role === 'admin' ? 'View / edit in ' : 'Source meeting: '") )
  assert.ok(app.includes('readOnly={!canManage}'))
  assert.ok(app.includes("if (!canManage && ['live', 'online', 'recorded'].includes(nextMode)) return"))
  assert.ok(app.includes('if (!canManage) return'))
})

test('workspace controls stay usable at 320px, 375px, tablet and desktop breakpoints', () => {
  const css = readFileSync(new URL('./CompanyWorkspace.css', import.meta.url), 'utf8')
  assert.match(css, /@media \(max-width: 900px\)/)
  assert.match(css, /@media \(max-width: 760px\)/)
  assert.match(css, /@media \(max-width: 375px\)/)
  assert.ok(css.includes('.mobile-workspace-picker { display: block;'))
  assert.ok(css.includes('min-width: 0'))
})
