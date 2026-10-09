const key = 'moa_workspace_onboarding'
export function writeOnboarding(choice, email = '') {
  try {
    if (!choice) sessionStorage.removeItem(key)
    else sessionStorage.setItem(key, JSON.stringify({ choice, email: email.toLowerCase() }))
  } catch { /* Storage may be unavailable in private browsing. */ }
}
export function readOnboarding(email) {
  try {
    const intent = JSON.parse(sessionStorage.getItem(key))
    if (!['choose', 'create', 'join'].includes(intent?.choice)) return null
    if (email && intent.email && intent.email !== email.toLowerCase()) return null
    return intent.choice
  } catch { return null }
}
