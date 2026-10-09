import { useState } from 'react'
import { CompanyMembers, CompanySettings } from './CompanyViews'
import { recordingPreferences } from './workspacePreferences'

export default function Settings({ initialSection = 'account', session, workspace, picker, theme, setTheme, request, url, onChanged, onSignOut }) {
  const [section, setSection] = useState(initialSection)
  const [preferences, setPreferences] = useState(() => recordingPreferences(session.user.id))
  const sections = [['account', 'Profile'], ['appearance', 'Appearance'], ['workspace', 'Workspaces'], ['preferences', 'Preferences'], ['recording', 'Recording defaults'],
    ...(workspace ? [['members', 'People']] : []),
    ...(workspace?.role === 'admin' ? [['general', 'General'], ['requests', 'Join requests'], ['invitations', 'Invitations'], ['roles', 'Roles & access']] : []), ['security', 'Sessions']]
  const groups = [['Your account', ['account', 'appearance']], ['Your personal MOA', ['preferences', 'recording']], [workspace ? `${workspace.name} workspace` : '', ['general', 'members', 'requests', 'invitations', 'roles']], ['Security', ['security']]]
  return <section className="settings-layout">
    <label className="settings-mobile-nav">Settings section<select value={section} onChange={event => setSection(event.target.value)}>{sections.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
    <nav aria-label="Settings sections">{groups.map(([group, ids]) => <div className="settings-nav-group" key={group}>{group && <p>{group}</p>}{ids.map(id => sections.find(([sectionId]) => sectionId === id)).filter(Boolean).map(([id, label]) => <button key={id} aria-current={section === id ? 'page' : undefined} onClick={() => setSection(id)}>{label}</button>)}</div>)}</nav>
    <div className="settings-content">
      {section === 'account' && <section><p className="eyebrow">YOUR PROFILE</p><h2>Profile</h2><p>Your identity across Personal and company workspaces.</p><dl className="detail-list"><div><dt>Name</dt><dd>{session.user.user_metadata?.full_name || 'MOA user'}</dd></div><div><dt>Email</dt><dd>{session.user.email}</dd></div></dl></section>}
      {section === 'appearance' && <section><h2>Appearance</h2><p>Choose a comfortable view for your day.</p><div className="theme-options">{['light', 'dark'].map(value => <button key={value} aria-pressed={theme === value} onClick={() => setTheme(value)}><span className={`theme-preview ${value}`} />{value === 'light' ? 'Light' : 'Dark'}</button>)}</div></section>}
      {section === 'workspace' && <section><p className="eyebrow">WORKSPACES</p><h2>Your workspaces</h2><p>Choose where meetings and shared knowledge belong.</p>{picker}</section>}
      {section === 'general' && workspace?.role === 'admin' && <CompanySettings workspace={workspace} request={request} url={url} onChanged={onChanged} />}
      {['members', 'requests', 'invitations'].includes(section) && workspace && <CompanyMembers key={section} workspace={workspace} request={request} url={url} onChanged={onChanged} section={section} />}
      {section === 'roles' && workspace?.role === 'admin' && <section><p className="eyebrow">ROLES &amp; ACCESS</p><h2>Who can do what?</h2><p>Your role in {workspace.name} is <strong>{workspace.role === 'admin' ? 'Admin' : 'Member'}</strong>.</p><dl className="role-explainer"><div><dt><span className="role-badge">Admin</span></dt><dd>Manage meetings, actions, people and access requests.</dd></div><div><dt><span className="role-badge">Member</span></dt><dd>Read team meetings, ask MOA, and update assigned actions.</dd></div></dl></section>}
      {section === 'preferences' && <section><h2>Preferences</h2><p>Personal meetings stay private to your account. MOA keeps your last workspace and appearance choice on this device.</p><button onClick={() => setSection('recording')}>Open recording defaults</button></section>}
      {section === 'recording' && <section><h2>Recording defaults</h2><p>Choose the speaker mode used when you next start a recording.</p><label>Speaker mode<select value={preferences.speakerMode} onChange={event => setPreferences(recordingPreferences(session.user.id, { speakerMode: event.target.value }))}><option value="multi">Multi-Speaker Meeting</option><option value="single">Single Speaker</option></select></label><p role="status">Saved on this browser for your account.</p></section>}
      {section === 'security' && <section><h2>Sessions</h2><p>Signed in as {session.user.email}. Sign out when using a shared device.</p><button className="destructive-button" onClick={onSignOut}>Sign out</button></section>}
    </div>
  </section>
}
