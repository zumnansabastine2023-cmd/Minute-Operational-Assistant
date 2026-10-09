export function normalizeMinutes(value) {
  const string = (value, fallback = '') => typeof value === 'string' ? value : fallback
  const lines = (value) => Array.isArray(value) ? value.filter((item) => typeof item === 'string') : []
  return {
    summary: string(value?.summary),
    key_points: lines(value?.key_points),
    decisions: lines(value?.decisions),
    action_items: (Array.isArray(value?.action_items) ? value.action_items : [])
      .filter((item) => typeof item === 'string' || (item && typeof item === 'object'))
      .map((item) => ({
        ...(typeof item.assignee_user_id === 'string' && item.assignee_user_id ? { assignee_user_id: item.assignee_user_id } : {}),
        task: typeof item === 'string' ? item : string(item.task),
        owner: string(item.owner, 'Unassigned'), deadline: string(item.deadline, 'Not specified'),
        status: item.status === 'Completed' ? 'Completed' : 'Open',
      })),
  }
}

export function isMinutesResponse(value) {
  return value && typeof value.summary === 'string'
    && ['key_points', 'decisions', 'action_items'].every((key) => Array.isArray(value[key]))
    && [...value.key_points, ...value.decisions].every((item) => typeof item === 'string')
    && value.action_items.every((item) => item && ['task', 'owner', 'deadline'].every((key) => typeof item[key] === 'string'))
}

export function isMeetingResponse(value) {
  return value && typeof value.id === 'string' && typeof value.title === 'string'
    && typeof value.transcript === 'string' && typeof value.created_at === 'string'
    && ['live', 'online', 'recorded'].includes(value.type)
    && (!value.minutes || (typeof value.minutes === 'object' && !Array.isArray(value.minutes)))
}
