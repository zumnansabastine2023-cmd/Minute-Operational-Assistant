export function knowledgeSyncState(indexed) {
  if (indexed === true) return { status: 'synced', message: '' }
  if (indexed === false) return {
    status: 'pending',
    message: 'Your meeting is saved. Ask MOA could not update its knowledge.',
  }
  return { status: 'unknown', message: '' }
}

export async function retryKnowledgeSync(request, url, signal) {
  try {
    const response = await request(`${url}/index`, { method: 'POST', signal })
    if (!response.ok) throw new Error(response.status === 409
      ? 'This meeting changed. Reopen it before retrying Ask MOA sync.'
      : 'Your meeting is still saved. Ask MOA could not sync it. Please retry.')
    const result = await response.json()
    if (!Number.isInteger(result.chunks_indexed) || result.chunks_indexed < 1) throw new Error('Your meeting is still saved. Ask MOA could not confirm the sync. Please retry.')
    return { status: 'synced', message: 'Meeting synced with Ask MOA.' }
  } catch (error) {
    if (signal?.aborted) return null
    return { status: 'pending', message: error.message?.startsWith('Your meeting') || error.message?.startsWith('This meeting changed')
      ? error.message : 'Your meeting is still saved. Ask MOA could not sync it. Please retry.' }
  }
}
