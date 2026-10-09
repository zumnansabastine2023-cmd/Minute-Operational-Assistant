import { normalizeMinutes } from './minutesData'
export function SectionHeader({ eyebrow, title, action, onAction }) {
  return <header className="experience-section-header"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h3>{title}</h3></div>{action && <button className="text-button" aria-label={action} onClick={onAction}>{action} <span aria-hidden="true">↗</span></button>}</header>
}
export function MeetingRow({ meeting, onOpen, compact = false }) {
  const minutes = normalizeMinutes(meeting.minutes)
  return <button className={`meeting-row memory-row ${compact ? 'compact' : ''}`} onClick={() => onOpen(meeting.id)}>
    <span className={`memory-icon ${meeting.type}`} aria-hidden="true"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="5" y="3" width="14" height="18" rx="3"/><path d="M9 8h6M9 12h6M9 16h3"/></svg></span>
    <span className="memory-copy"><strong>{meeting.title}</strong>{!compact && <span className="memory-context">{minutes.summary || 'Open the conversation and meeting notes.'}</span>}<small>{new Date(meeting.created_at).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</small></span>
    <span className={`type-badge ${meeting.type}`}>{meeting.type}</span><span className="row-arrow" aria-hidden="true">›</span>
  </button>
}
export function MemoryDecisions({ decisions, onOpen, company = false }) {
  return <section className="memory-decisions"><SectionHeader eyebrow={company ? 'TEAM MEMORY' : 'WORTH REMEMBERING'} title="Recent decisions"/>{decisions.length ? decisions.slice(0,3).map((decision,index)=><div className="decision-line" key={`${decision.meetingId}-${index}`}><span aria-hidden="true">✧</span><div><p>{decision.text}</p><button className="text-button" onClick={()=>onOpen(decision.meetingId)}>{decision.meetingTitle} ↗</button></div></div>) : <p className="empty-state">Decisions from your saved meeting notes will appear here.</p>}</section>
}
