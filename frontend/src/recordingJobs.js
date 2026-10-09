function recordingKey(userId, organizationId) {
  return `moa-recording-job:${userId}${organizationId ? `:company:${organizationId}` : ''}`
}

export function storedRecordingMode(userId, organizationId) {
  try { return sessionStorage.getItem(`${recordingKey(userId, organizationId)}:speaker-mode`) === 'single' ? 'single' : 'multi' }
  catch { return 'multi' }
}

export function storedRecordingLanguage(userId, organizationId) {
  try { return sessionStorage.getItem(`${recordingKey(userId, organizationId)}:language`) || 'en' }
  catch { return 'en' }
}

export function storedRecordingJob(userId, value, speakerMode = 'multi', organizationId, language = 'en') {
  const key = recordingKey(userId, organizationId)
  try {
    if (value === null) {
      sessionStorage.removeItem(key)
      sessionStorage.removeItem(`${key}:speaker-mode`)
      sessionStorage.removeItem(`${key}:language`)
    } else if (value !== undefined) {
      sessionStorage.setItem(key, value)
      sessionStorage.setItem(`${key}:speaker-mode`, speakerMode === 'single' ? 'single' : 'multi')
      sessionStorage.setItem(`${key}:language`, language)
    }
    return sessionStorage.getItem(key)
  } catch { return null }
}

export function clearStoredRecordingJobs(userId) {
  const prefix = `moa-recording-job:${userId}`
  try {
    const keys = []
    for (let index = 0; index < sessionStorage.length; index++) {
      const key = sessionStorage.key(index)
      if (key === prefix || key?.startsWith(`${prefix}:`)) keys.push(key)
    }
    keys.forEach(key => sessionStorage.removeItem(key))
  } catch { /* Storage may be unavailable; the in-memory account still unmounts. */ }
}

export function parseRecordingJob(value) {
  if (!value || typeof value.id !== 'string' || !/^[\da-f-]{36}$/i.test(value.id)
    || !['Queued', 'Processing', 'Completed', 'Failed'].includes(value.status)) throw new Error('Invalid processing response. Please retry.')
  if (value.status === 'Completed' && typeof value.result?.transcript !== 'string') throw new Error('Invalid recording result. Please retry.')
  return value
}

export async function pollRecordingJob(fetchStatus, onStatus, signal, pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))) {
  for (let attempts = 0; attempts < 720 && !signal.aborted; attempts++) {
    const response = await fetchStatus(signal)
    if (!response.ok) throw new Error(response.status === 404 ? 'Recording job expired. Select the file again to retry.' : 'Unable to check processing. Retry to resume checking this recording.')
    const job = parseRecordingJob(await response.json())
    if (signal.aborted) return null
    onStatus(job.status)
    if (job.status === 'Failed') throw new Error(job.error || 'Processing failed. Upload again to retry.')
    if (job.status === 'Completed') return job.result
    await pause(2500)
  }
  if (!signal.aborted) throw new Error('Processing is taking longer than expected. Retry to check again.')
  return null
}
