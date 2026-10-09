export function workspaceKey(userId, workspace) {
  return `${userId}:${workspace?.id || 'personal'}:${workspace?.role || 'personal'}`
}

export function availableWorkspace(id, organizations) {
  return organizations.find(company => company.id === id) || null
}

export function workspaceUrl(url, workspace) {
  const scoped = new URL(url)
  scoped.searchParams.delete('organization_id')
  if (workspace?.id) scoped.searchParams.set('organization_id', workspace.id)
  return scoped.toString()
}

export function canManageWorkspace(workspace) {
  return !workspace || workspace.role === 'admin'
}

export function meetingBelongsToWorkspace(meeting, workspace) {
  return (meeting?.organization_id ?? null) === (workspace?.id ?? null)
}

export function workspaceRequest(fetchAuthenticated, workspace, userId, signal, onAccessChanged) {
  return async (url, options = {}) => {
    const combined = options.signal ? AbortSignal.any([signal, options.signal]) : signal
    combined.throwIfAborted()
    const response = await fetchAuthenticated(workspaceUrl(url, workspace), { ...options, signal: combined, expectedUserId: userId })
    combined.throwIfAborted()
    if (workspace && (response.status === 403 || response.status === 404)) {
      const data = await response.clone().json().catch(() => ({}))
      if (response.status === 403 || data.detail === 'Company workspace not found.') onAccessChanged()
    }
    return response
  }
}
