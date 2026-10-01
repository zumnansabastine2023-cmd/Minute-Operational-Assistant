import { normalizeMinutes } from './minutesData.js'
import { currentWeek } from './summaryDates.js'

export function companyData(meetings, organizationId, now = new Date()) {
  const scoped = meetings.filter(meeting => meeting.organization_id === organizationId)
  const actions = scoped.flatMap(meeting => normalizeMinutes(meeting.minutes).action_items.map((action, index) => ({
    ...action, index, revision: meeting.revision, key: `${meeting.id}:${index}`, meetingId: meeting.id, meetingTitle: meeting.title,
  })))
  const week = currentWeek(now)
  return {
    meetings: scoped,
    thisWeek: scoped.filter(meeting => {
      const date = new Date(meeting.created_at)
      return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) >= week.start && date <= now
    }).length,
    actions,
    open: actions.filter(action => action.status === 'Open'),
    completed: actions.filter(action => action.status === 'Completed'),
    decisions: scoped.flatMap(meeting => normalizeMinutes(meeting.minutes).decisions.map(text => ({ text, meetingId: meeting.id, meetingTitle: meeting.title }))).slice(0, 8),
  }
}

export function canChangeAction(workspace, action, userId) {
  return workspace?.role === 'admin' || Boolean(userId && action.assignee_user_id === userId)
}
