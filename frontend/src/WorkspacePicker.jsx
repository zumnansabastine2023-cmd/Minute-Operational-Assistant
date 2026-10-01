import { useEffect, useRef, useState } from 'react'

export default function WorkspacePicker({ workspace, organizations, onSelect, request, onCreated, error, initialForm = '', showMemberships = true }) {
  const [form, setForm] = useState(initialForm)
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState('')
  const [pending, setPending] = useState([])
  const [message, setMessage] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    const refresh = () => request('/join-requests', { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('Unable to check join requests.')
      const data = await response.json()
      if (!controller.signal.aborted) { setPending(data); setMessage('') }
    }).catch(error => { if (!controller.signal.aborted) setFailure(error.message) })
    refresh(); window.addEventListener('focus', refresh)
    return () => { controller.abort(); window.removeEventListener('focus', refresh) }
  }, [request])
  const controller = useRef(null)
  useEffect(() => () => controller.current?.abort(), [])
  const submit = async (event) => {
    event.preventDefault()
    if (busy) return
    if (form === 'create' && showMemberships && !window.confirm('Continue to this company workspace? Unsaved drafts will be cleared and active capture will stop.')) return
    controller.current = new AbortController()
    setBusy(true)
    setFailure('')
    try {
      const response = await request(form === 'create' ? '' : '/join', {
        signal: controller.current.signal, method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form === 'create' ? { name: value.trim() } : { token: value.trim() }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Check the company name or invitation and try again.')
      if (form === 'join' && (data.status !== 'pending' || typeof data.id !== 'string' || typeof data.organization_name !== 'string')) throw new Error('Unable to confirm your join request. Check Workspaces before trying again.')
      if (form === 'create' && (typeof data.id !== 'string' || typeof data.name !== 'string' || data.role !== 'admin')) throw new Error('Unable to confirm the new workspace. Refresh to check your memberships.')
      if (controller.current.signal.aborted) return
      setForm('')
      setValue('')
      if (data.status === 'pending') {
        setPending(current => [...current.filter(item => item.id !== data.id), data])
        setMessage(`Request pending. Your request to join ${data.organization_name} is waiting for an administrator to approve it.`)
      } else onCreated(data)
    } catch (error) { setFailure(error.message) }
    finally { setBusy(false) }
  }
  return <div className="workspace-picker">
    {showMemberships && <ul className="company-list">
      {[{ id: '', name: 'Personal' }, ...organizations].map(company => <li key={company.id} className={(workspace?.id || '') === company.id ? 'current-workspace-row' : ''}>
        <span className="workspace-avatar" aria-hidden="true">{company.id ? company.name.slice(0, 1).toUpperCase() : 'P'}</span><strong>{company.name}</strong><span>{company.id ? company.role === 'admin' ? 'Admin' : 'Member' : 'Your private workspace'}</span>
        <button type="button" disabled={(workspace?.id || '') === company.id} onClick={() => onSelect(company.id)}>{(workspace?.id || '') === company.id ? 'Current workspace' : 'Open Workspace'}</button>
      </li>)}
    </ul>}
    <details className="quiet-disclosure add-workspace" open={form ? true : undefined}><summary>Add a workspace</summary><div className="workspace-picker-actions">
      <button type="button" disabled={busy} onClick={() => { setForm('create'); setValue(''); setFailure('') }}>Create Company Workspace</button>
      <button type="button" disabled={busy} onClick={() => { setForm('join'); setValue(''); setFailure('') }}>Join Company</button>
    </div>
    {form && <form onSubmit={submit}>
      <label>{form === 'create' ? 'Company name' : 'Invitation code'}<input autoComplete="off" required maxLength={form === 'create' ? 120 : 128} value={value} disabled={busy} onChange={event => setValue(event.target.value)} /></label>
      {form === 'join' && <small>Ask an Admin for a code. Your request needs approval and never shares your Personal meetings.</small>}
      <button disabled={busy}>{busy ? 'Working…' : form === 'create' ? 'Create company' : 'Request to join'}</button>
      <button type="button" disabled={busy} onClick={() => setForm('')}>Cancel</button>
    </form>}
    </details>
    {message && <p className="inline-notice" role="status">{message}</p>}
    {pending.length > 0 && <section className="join-status"><h3>Your join requests</h3><ul className="activity-list">{pending.map(item => <li key={item.id}><strong>{item.organization_name}</strong><span className={`status-pill ${item.status}`}>{item.status === 'pending' ? 'Awaiting approval' : item.status === 'approved' ? 'Approved' : 'Not approved'}</span></li>)}</ul><p className="helper-text">Pending requests do not grant access. Once approved, return to MOA or refresh to see the workspace.</p></section>}
    {(failure || error) && <p role="alert">{failure || error}</p>}
  </div>
}
