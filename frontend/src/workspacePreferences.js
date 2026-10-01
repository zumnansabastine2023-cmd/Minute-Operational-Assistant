import { availableWorkspace } from './workspaceScope.js'
export function readLastWorkspace(userId) {
  try { return localStorage.getItem(`moa:lastWorkspace:${userId}`) || '' } catch { return '' }
}
export function writeLastWorkspace(userId, id) {
  try { localStorage.setItem(`moa:lastWorkspace:${userId}`, id || '') } catch { /* In-memory switching still works. */ }
}
export function restoreWorkspace(userId, memberships) {
  return availableWorkspace(readLastWorkspace(userId), memberships)?.id || ''
}
export function recordingPreferences(userId, value) {
  const key = `moa:recordingPreferences:${userId}`
  try {
    if (value) localStorage.setItem(key, JSON.stringify(value))
    const stored = JSON.parse(localStorage.getItem(key))
    return { speakerMode: stored?.speakerMode === 'single' ? 'single' : 'multi' }
  } catch { return { speakerMode: 'multi' } }
}
