import assert from 'node:assert/strict'
import test from 'node:test'
import { minutesExport, transcriptExport, exportFilename } from './meetingExports.js'
test('transcript export retains labelled newlines and meeting title/date', () => {
  const text = transcriptExport('Review', '2026-09-29T10:00:00Z', 'Abdul: Review Friday.\nDavid: Charts Thursday.')
  assert.ok(text.startsWith('Review\n2026-09-29T10:00:00.000Z'))
  assert.ok(text.includes('Abdul: Review Friday.\nDavid: Charts Thursday.'))
})
test('minutes export retains every structured field and legacy actions', () => {
  const text = minutesExport('Review', '2026-09-29', { summary: 'Summary text', key_points: ['Point'], decisions: ['Ship'], action_items: [{ task: 'Charts', owner: 'David', deadline: 'Thursday', status: 'Completed' }, 'Legacy'] })
  for (const expected of ['Review', 'Summary text', 'Point', 'Ship', 'Charts', 'David', 'Thursday', 'Completed', 'Legacy', 'Open']) assert.ok(text.includes(expected))
})
test('export filename cannot create path separators or control characters', () => {
  assert.equal(exportFilename('../bad/name\n', 'minutes'), '-bad-name--minutes.txt')
})
