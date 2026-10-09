import { normalizeMinutes } from './minutesData.js'

export function filterMeetings(meetings, { keyword = '', type = 'all', start = '', end = '', actionStatus = 'all' } = {}) {
  const query = keyword.trim().toLocaleLowerCase()
  if (start && end && start > end) return []
  return meetings.filter((meeting) => {
    if (type !== 'all' && meeting.type !== type) return false
    const date = new Date(meeting.created_at)
    if ((start || end) && Number.isNaN(date.getTime())) return false
    const day = Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10)
    if ((start && day < start) || (end && day > end)) return false
    const minutes = normalizeMinutes(meeting.minutes)
    if (actionStatus !== 'all' && !minutes.action_items.some((item) => item.status === actionStatus)) return false
    const text = [meeting.title, meeting.transcript, minutes.summary, ...minutes.key_points, ...minutes.decisions,
      ...minutes.action_items.flatMap((item) => [item.task, item.owner, item.deadline, item.status])].join('\n').toLocaleLowerCase()
    return !query || text.includes(query)
  })
}
