import { useEffect, useRef, useState } from 'react'
import { WorkspaceArtwork, MoaCompanion } from './BrandArtwork'
import { MeetingRow, SectionHeader, MemoryDecisions } from './ExperiencePrimitives'
import { companyData, canChangeAction } from './companyData'

async function checkedResponse(response) {
  const data = await response.json()
  if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Unable to complete this request. Please retry.')
  return data
}

export function CompanyDashboard({ workspace, meetings, loading, openMeeting, navigate, request, url, newMeeting }) {
  const data = companyData(meetings, workspace.id)
  const [count, setCount] = useState(null)
  useEffect(() => {
    const controller = new AbortController()
    request(url, { signal: controller.signal }).then(checkedResponse).then(result => { if (!controller.signal.aborted) setCount(result.member_count) }).catch(() => {})
    return () => controller.abort()
  }, [request, url])
  return <section className="company-view company-dashboard">
    <header className="experience-hero company-hero"><WorkspaceArtwork company/><div className="hero-copy"><div className="company-identity"><span className="company-avatar" aria-hidden="true">{workspace.name.slice(0,1).toUpperCase()}</span><div><strong>{workspace.name}</strong><small>Company Workspace · {workspace.role === 'admin' ? 'Admin' : 'Member'}</small></div></div><h2>Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, team.</h2><p>Let’s turn conversations into progress.</p><div className="hero-actions">{workspace.role === 'admin' && <button className="primary-button" onClick={newMeeting}>+ New Meeting</button>}<button onClick={() => navigate('assistant')}>Ask MOA</button>{workspace.role === 'admin' && <button onClick={() => navigate('recorded')}>Upload Recording</button>}</div></div></header>
    {loading ? <p className="loading-line" role="status">Loading company activity...</p> : <>
      <p className="overview-label">AT A GLANCE</p><dl className="team-overview">{[['Meetings this week', data.thisWeek, 'conversations'], ['Open actions', data.open.length, 'pending'], ['Completed', data.completed.length, 'complete'], ['Members', count ?? '\u2014', 'people']].map(([label,value,tone]) => <div key={label}><span className={`overview-symbol ${tone}`} aria-hidden="true">{tone === 'pending' ? '\u25f7' : tone === 'complete' ? '\u2713' : tone === 'people' ? '\u25c8' : '\u25a3'}</span><div><dd>{value}</dd><dt>{label}</dt></div></div>)}</dl>
      <div className="team-activity-layout"><section className="team-current-work"><SectionHeader eyebrow="CURRENT WORK" title="Priority actions" action="View all" onAction={() => navigate('actions')}/>
        {data.open.length ? <ul className="action-rows">{data.open.slice(0,4).map(action => <li key={action.key}><span className="action-marker" aria-hidden="true"/><div><strong>{action.task}</strong><small>{action.owner} / {action.deadline}</small><button className="text-button" onClick={() => openMeeting(action.meetingId,'minutes')}>{action.meetingTitle} ↗</button></div><span className="status-pill open">Open</span></li>)}</ul> : <p className="empty-state">All caught up. Your team has no open actions.</p>}
      </section><section className="team-conversations"><SectionHeader eyebrow="RECENT CONVERSATIONS" title="Around the table" action="View all" onAction={() => navigate('meetings')}/>{data.meetings.length ? data.meetings.slice(0,4).map(meeting => <MeetingRow compact key={meeting.id} meeting={meeting} onOpen={openMeeting}/>) : <p className="empty-state">Your shared story starts with a conversation.</p>}</section></div>
      <div className="team-memory-layout"><MemoryDecisions company decisions={data.decisions} onOpen={openMeeting}/><aside className="team-intelligence"><div className="insight-heading"><div><p className="eyebrow">TEAM INSIGHTS</p><h3>Momentum is up.</h3></div><MoaCompanion size={58}/></div><p>Meeting activity across the working week.</p><div className="insight-chart" aria-label="Meeting activity Monday through Saturday">{[['Mon',32],['Tue',45],['Wed',58],['Thu',67],['Fri',82],['Sat',94]].map(([day,height])=><span key={day}><i style={{height:`${height}%`}}/><small>{day}</small></span>)}</div><button onClick={() => navigate('weekly')}>View full summary ↗</button><button className="text-button" onClick={() => navigate('assistant')}>Ask MOA ↗</button></aside></div>
    </>}
  </section>
}

export function CompanyActions({ workspace, meetings, openMeeting, userId, onStatusChange }) {
  const [status, setStatus] = useState('Open')
  const [owner, setOwner] = useState('')
  const [mine, setMine] = useState(false)
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const data = companyData(meetings, workspace.id)
  const hasAssignments = data.actions.some(action => action.assignee_user_id)
  const actions = data.actions.filter(action => (status === 'All' || action.status === status)
    && (!hasAssignments || !mine || action.assignee_user_id === userId) && action.owner.toLocaleLowerCase().includes(owner.trim().toLocaleLowerCase()))
  const change = async action => {
    if (busy) return
    setBusy(action.key); setMessage('')
    try {
      const result = await onStatusChange(action)
      setMessage(result.indexed === false ? 'Action saved. Ask MOA could not update its knowledge. An Admin can retry sync from the source meeting.' : 'Action updated.')
    } catch (error) { setMessage(error.message) }
    finally { setBusy('') }
  }
  return <section className="company-view"><header className="dashboard-heading"><p className="eyebrow">FOLLOW THROUGH</p><h2>Action items</h2><p>Small next steps, shared progress.</p></header>
    <p className="ownership-note">{workspace.role === 'admin' ? 'You can update any action. To change its owner or details, open the source meeting.' : 'Complete or reopen actions assigned to you. Other actions are here so you can follow along.'}</p>
    <div className="company-filters"><label>Status<select value={status} onChange={event => setStatus(event.target.value)}><option>Open</option><option>Completed</option><option>All</option></select></label><label>Owner<input value={owner} onChange={event => setOwner(event.target.value)} placeholder="Filter by owner" /></label>{hasAssignments && <label className="checkbox-label"><input type="checkbox" checked={mine} onChange={event => setMine(event.target.checked)} />Assigned to me</label>}</div>
    {message && <p role="status">{message}</p>}
    {!actions.length ? <p className="empty-state">No actions match these filters.</p> : <ul className="action-rows">{actions.map(action => <li key={action.key} className={`${action.status === 'Completed' ? 'action-completed' : ''} ${action.assignee_user_id === userId ? 'action-mine' : ''}`}>
      {canChangeAction(workspace, action, userId) && <button className="action-status-control" aria-pressed={action.status === 'Completed'} title={action.status === 'Completed' ? 'Reopen action' : 'Mark complete'} disabled={Boolean(busy)} onClick={() => change(action)}><svg aria-hidden="true" width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor"><rect x="2" y="2" width="16" height="16" rx="4"/>{action.status === 'Completed' && <path d="M5 10l3 3 7-7"/>}</svg><span className="visually-hidden">{busy === action.key ? 'Saving...' : action.status === 'Completed' ? 'Reopen' : 'Mark complete'}</span></button>}
      <div><strong>{action.task}</strong><small>{action.assignee_user_id === userId ? `${action.owner} (you)` : action.owner} / {action.deadline}{!action.assignee_user_id && ' / Managed by an Admin'}</small><button className="text-button" onClick={() => openMeeting(action.meetingId, 'minutes')}>{workspace.role === 'admin' ? 'View / edit in ' : 'Source meeting: '}{action.meetingTitle}</button></div><span className={`status-pill ${action.status.toLowerCase()}`}>{action.status}</span>

    </li>)}</ul>}
  </section>
}

function MemberIdentity({ person }) {
  const identity = /^[\da-f]{8}-[\da-f-]{27}$/i.test(person.identity) ? 'Member' : person.identity || 'Member'
  return <div className="member-identity"><span className="avatar" aria-hidden="true">{identity.charAt(0).toUpperCase()}</span><div><strong>{identity}</strong>{person.email && person.email !== identity && <small>{person.email}</small>}</div></div>
}

export function CompanyMembers({ workspace, request, url, onChanged, section = 'members' }) {
  const memberTab = section === 'requests' ? 'requests' : 'people'
  const [members, setMembers] = useState([])
  const [pending, setPending] = useState([])
  const [invites, setInvites] = useState([])
  const [token, setToken] = useState(null)
  const [version, setVersion] = useState(0)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const mutation = useRef(null)
  const admin = workspace.role === 'admin'
  useEffect(() => () => mutation.current?.abort(), [])
  useEffect(() => {
    const controller = new AbortController()
    const get = suffix => request(`${url}${suffix}`, { signal: controller.signal }).then(checkedResponse)
    Promise.all([section === 'members' ? get('/members') : [], admin && section === 'requests' ? get('/join-requests') : [], admin && section === 'invitations' ? get('/invites') : []]).then(([members, pending, invites]) => {
      if (!controller.signal.aborted) { setMembers(members); setPending(pending); setInvites(invites); setLoading(false) }
    }).catch(error => { if (!controller.signal.aborted) { setError(error.message); setLoading(false) } })
    return () => controller.abort()
  }, [request, url, admin, version, section])
  const change = async (suffix, method, body) => {
    if (busy || !admin) return
    setBusy(true); setError(''); setMessage('')
    mutation.current = new AbortController()
    try {
      const result = await request(`${url}${suffix}`, { signal: mutation.current.signal, method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }).then(checkedResponse)
      if (mutation.current.signal.aborted) return
      if (result.token) setToken(result)
      setVersion(current => current + 1); setMessage('Changes saved.'); onChanged()
    } catch (error) { if (!mutation.current.signal.aborted) setError(error.message) }
    finally { setBusy(false) }
  }
  return <section className="company-view"><h2>{section === 'members' ? 'People' : section === 'requests' ? 'Join requests' : 'Invitations'}</h2><p>{workspace.name} · {section === 'members' ? 'People who share this workspace.' : 'Invite someone to request access. An Admin approves every request.'}</p>
    {error && <p role="alert">{error} <button onClick={() => { setError(''); setVersion(value => value + 1) }}>Retry</button></p>}{message && <p role="status">{message}</p>}{loading && <p role="status">Loading...</p>}
    {['members', 'requests'].includes(section) && <>

      {admin && memberTab === 'requests' && <section className="pending-requests"><h3>Pending requests <span className="count-badge">{pending.length}</span></h3>{!pending.length && !loading && <p className="empty-state">No requests waiting for approval.</p>}<ul className="member-rows">{pending.map(person => <li key={person.id}><MemberIdentity person={person} /><small>Requested {new Date(person.created_at).toLocaleString()}</small><div className="row-actions"><button disabled={busy} onClick={() => change(`/join-requests/${person.id}`, 'PATCH', { decision: 'decline' })}>Decline</button><button className="primary-button" disabled={busy} onClick={() => change(`/join-requests/${person.id}`, 'PATCH', { decision: 'approve' })}>Approve</button></div></li>)}</ul></section>}
      {(!admin || memberTab === 'people') && <><h3>Active members</h3><p className="helper-text">A shared space for the people you work with. {admin && 'Open the menu beside a person to manage their access.'}</p><ul className="member-rows">{members.map(member => <li key={member.id}><MemberIdentity person={member} /><span className="role-badge">{member.role === 'admin' ? 'Admin' : 'Member'}</span><small>Joined {new Date(member.created_at).toLocaleDateString()}</small>
        {admin && <details className="member-menu" onKeyDown={event => { if (event.key === 'Escape') { event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus() } }}><summary aria-label={`Manage ${member.identity}`}>•••</summary><div><button disabled={busy} onClick={() => { if (window.confirm(`Change ${member.identity} to ${member.role === 'admin' ? 'Member' : 'Admin'}?`)) change(`/members/${member.id}`, 'PATCH', { role: member.role === 'admin' ? 'member' : 'admin' }) }}>Make {member.role === 'admin' ? 'Member' : 'Admin'}</button><button className="destructive-button" disabled={busy} onClick={() => { if (window.confirm(`Remove ${member.identity} from this workspace?`)) change(`/members/${member.id}`, 'DELETE') }}>Remove member</button></div></details>}
      </li>)}</ul></>}
    </>}
    {admin && section === 'invitations' && <><button className="primary-button" disabled={busy} onClick={() => change('/invites', 'POST')}>Create invitation code</button><p className="helper-text">Share a code privately. They request to join; you decide who comes in.</p><ol className="invite-steps"><li><span>1</span> Share an invitation</li><li><span>2</span> They request access</li><li><span>3</span> Approve in Members &amp; Access</li></ol><details className="quiet-disclosure"><summary>How invitations work</summary><p>Each code can be used once and expires after seven days. Until an Admin approves the request, your company meetings stay private.</p></details>
      {token && <div className="company-invite"><label>Invitation code (shown once)<input readOnly value={token.token} onFocus={event => event.target.select()} /></label><p>Expires {new Date(token.expires_at).toLocaleString()}. Redemption requests access; it does not grant membership.</p><button onClick={() => setToken(null)}>Hide code</button></div>}
      <h3>Active invitations</h3>{!invites.length && !loading && <p className="empty-state">No active invitations.</p>}<ul className="invitation-rows">{invites.map(invite => <li key={invite.id}><div><strong>Invitation</strong><small>Created {new Date(invite.created_at).toLocaleString()}</small><small>Expires {new Date(invite.expires_at).toLocaleString()}</small></div><button disabled={busy} onClick={() => { if (window.confirm('Revoke this invitation?')) { setToken(null); change(`/invites/${invite.id}`, 'DELETE') } }}>Revoke</button></li>)}</ul>
    </>}
  </section>
}

export function CompanySettings({ workspace, request, url, onChanged }) {
  const [name, setName] = useState(workspace.name)
  const [count, setCount] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    request(url, { signal: controller.signal }).then(checkedResponse).then(data => {
      if (!controller.signal.aborted) setCount(data.member_count)
    }).catch(error => { if (!controller.signal.aborted) setMessage(error.message) })
    return () => controller.abort()
  }, [request, url])
  const save = async event => {
    event.preventDefault()
    if (busy || workspace.role !== 'admin') return
    setBusy(true)
    try {
      await request(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim() }) }).then(checkedResponse)
      setMessage('Company name saved.')
      onChanged()
    } catch (error) { setMessage(error.message) }
    finally { setBusy(false) }
  }
  return <section className="company-view"><h2>Workspace details</h2><p>{count === null ? 'Checking membership…' : `${count} company members`}</p>
    {workspace.role === 'admin' ? <form onSubmit={save}><label>Company name<input required maxLength={120} value={name} disabled={busy} onChange={event => setName(event.target.value)} /></label><button disabled={busy}>{busy ? 'Saving…' : 'Save company name'}</button></form> : <p>Company name: {workspace.name}. A Company Admin can change this.</p>}
    {message && <p role="status">{message}</p>}
  </section>
}
