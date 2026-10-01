import { useEffect, useRef, useState } from 'react'
import { knowledgeSyncState, retryKnowledgeSync } from './knowledgeSync'

// Parent keys this view by meeting ID/revision so late results cannot affect a
// different meeting or a newer saved revision.
export default function AskMoaSync({ meeting, url, request, disabled, readOnly = false }) {
  const [sync, setSync] = useState(() => knowledgeSyncState(meeting.indexed))
  const retryController = useRef(null)
  useEffect(() => () => retryController.current?.abort(), [])

  useEffect(() => {
    if (typeof meeting.indexed === 'boolean') return
    const controller = new AbortController()
    request(`${url}/index-status`, { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error()
      const data = await response.json()
      if (typeof data.indexed !== 'boolean') throw new Error()
      if (!controller.signal.aborted) setSync(knowledgeSyncState(data.indexed))
    }).catch(() => {
      if (!controller.signal.aborted) setSync({ status: 'unknown', message: 'Ask MOA sync status is unavailable. Reopen this meeting to check again.' })
    })
    return () => controller.abort()
  }, [meeting.indexed, request, url])

  useEffect(() => {
    if (sync.status !== 'synced' || !sync.message) return
    const timer = setTimeout(() => setSync(knowledgeSyncState(true)), 4000)
    return () => clearTimeout(timer)
  }, [sync.status, sync.message])

  const retry = async () => {
    if (disabled || retryController.current) return
    const controller = new AbortController()
    retryController.current = controller
    setSync({ status: 'retrying', message: 'Syncing with Ask MOA…' })
    const result = await retryKnowledgeSync(request, url, controller.signal)
    if (!controller.signal.aborted && result) setSync(result)
    retryController.current = null
  }
  return <div className="knowledge-sync">
    {sync.message && <p role="status">{sync.message}</p>}
    {!readOnly && ['pending', 'retrying'].includes(sync.status) && <button disabled={disabled || sync.status === 'retrying'} onClick={retry}>
      {sync.status === 'retrying' ? 'Syncing…' : 'Retry Ask MOA Sync'}
    </button>}
  </div>
}
