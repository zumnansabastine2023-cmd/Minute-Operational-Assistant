import { useEffect, useRef, useState } from 'react'
import { normalizeMinutes } from './minutesData'
import './MinutesEditor.css'

export default function MinutesEditor({ minutes, title = '', saved = false, disabled, onSave, onEditing, readOnly = false, editRequest = 0, company = false, assignees = [], assigneeError = '' }) {
  const [draft, setDraft] = useState(() => editRequest && !readOnly ? normalizeMinutes(minutes) : null)
  const [draftTitle, setDraftTitle] = useState(title)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const lastEditRequest = useRef(editRequest)
  useEffect(() => {
    if (lastEditRequest.current === editRequest) return
    lastEditRequest.current = editRequest
    if (!editRequest || readOnly) return
    queueMicrotask(() => { setDraft(normalizeMinutes(minutes)); setDraftTitle(title); setError('') })
  }, [editRequest, minutes, title, readOnly])
  const shown = normalizeMinutes(minutes)
  const update = (key, value) => setDraft((current) => ({ ...current, [key]: value }))
  const updateAction = (index, key, value) => update('action_items', draft.action_items.map((item, i) => i === index ? { ...item, [key]: value } : item))
  const apply = async () => {
    if (saved && !draftTitle.trim()) { setError('Enter a meeting title.'); return }
    setSaving(true)
    setError('')
    try {
      await onSave(draft, draftTitle.trim())
      setDraft(null)
      onEditing(false)
    } catch (error) { setError(error.message || 'Unable to save changes. Your draft is still here.') }
    finally { setSaving(false) }
  }
  return <section className="transcript-section minutes-editor">
    {draft ? <>
      <p className="draft-notice" role="status">Unsaved changes</p>
      <fieldset disabled={disabled || saving}>
        {saved && <label>Meeting title<input value={draftTitle} maxLength={255} onChange={(event) => setDraftTitle(event.target.value)} /></label>}
        <label>Summary<textarea value={draft.summary} onChange={(event) => update('summary', event.target.value)} /></label>
        {['key_points', 'decisions'].map((key) => <label key={key}>{key === 'key_points' ? 'Discussion points (one per line)' : 'Decisions (one per line)'}<textarea value={draft[key].join('\n')} onChange={(event) => update(key, event.target.value.split('\n'))} /></label>)}
        <h3>Action items</h3>{company && assigneeError && <p role="alert">{assigneeError}</p>}
        {draft.action_items.map((item, index) => <div className="action-edit" key={index}>
          <label>Task<textarea maxLength={4000} value={item.task} onChange={(event) => updateAction(index, 'task', event.target.value)} /></label>
          {company && <label>Assign to a company member<select value={item.assignee_user_id || ''} onChange={event => { const member = assignees.find(person => person.user_id === event.target.value); update('action_items', draft.action_items.map((action, i) => i === index ? { ...action, assignee_user_id: member?.user_id || null, owner: member?.identity || action.owner } : action)) }}><option value="">No linked assignee (text owner)</option>{item.assignee_user_id && !assignees.some(person => person.user_id === item.assignee_user_id) && <option value={item.assignee_user_id} disabled>Unavailable member - reassign or unlink</option>}{assignees.map(person => <option key={person.user_id} value={person.user_id}>{person.identity}{person.email && person.email !== person.identity ? ` (${person.email})` : ''}</option>)}</select></label>}
          <label>Owner<input readOnly={company && Boolean(item.assignee_user_id)} maxLength={255} value={item.owner} onChange={(event) => updateAction(index, 'owner', event.target.value)} /></label>
          <label>Deadline<input maxLength={255} value={item.deadline} onChange={(event) => updateAction(index, 'deadline', event.target.value)} /></label>
          <label>Status<select value={item.status} onChange={(event) => updateAction(index, 'status', event.target.value)}><option>Open</option><option>Completed</option></select></label>
          <button type="button" onClick={() => update('action_items', draft.action_items.filter((_, i) => i !== index))}>Remove action {index + 1}</button>
        </div>)}
        <button type="button" onClick={() => update('action_items', [...draft.action_items, { task: '', owner: 'Unassigned', deadline: 'Not specified', status: 'Open' }])}>Add action item</button>
      </fieldset>
      {error && <p role="alert">{error}</p>}
      <button disabled={disabled || saving} onClick={apply}>{saving ? 'Saving…' : saved ? 'Save Changes' : 'Apply to meeting draft'}</button>
      <button disabled={saving} onClick={() => { if (window.confirm('Discard these unsaved changes?')) { setDraft(null); onEditing(false) } }}>Cancel</button>
    </> : <>
      <h2>Meeting Summary</h2><p>{shown.summary || 'None identified.'}</p>
      <h3>Discussion points</h3>{shown.key_points.length ? <ul>{shown.key_points.map((value, index) => <li key={index}>{value}</li>)}</ul> : <p>None identified.</p>}
      <h3>Decisions</h3>{shown.decisions.length ? <ul>{shown.decisions.map((value, index) => <li key={index}>{value}</li>)}</ul> : <p>None identified.</p>}
      <h3>Action items</h3>{shown.action_items.length ? <ul className="action-rows">{shown.action_items.map((item, index) => <li key={index}><div><strong>{item.task}</strong><small>{item.owner} / {item.deadline}</small></div><span className={`status-pill ${item.status.toLowerCase()}`}>{item.status}</span></li>)}</ul> : <p>None identified.</p>}
      {!readOnly && <button disabled={disabled} onClick={() => { setDraft(shown); setDraftTitle(title); setError(''); onEditing(true) }}>{saved ? 'Edit Meeting' : 'Edit minutes'}</button>}
      {!saved && <p className="draft-notice">Meeting draft — use Save Meeting to keep your changes.</p>}
    </>}
  </section>
}
