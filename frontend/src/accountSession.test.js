import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { signOutAccount } from './accountSession.js'

test('successful Supabase sign-out clears only this account pending job', async () => {
  const previous = globalThis.sessionStorage
  const removed = []
  const keys = ['moa-recording-job:owner-a', 'moa-recording-job:owner-a:speaker-mode',
    'moa-recording-job:owner-a:company:alpha', 'moa-recording-job:owner-a:company:alpha:speaker-mode',
    'moa-recording-job:owner-b']
  globalThis.sessionStorage = {
    get length() { return keys.length },
    key: index => keys[index],
    removeItem: key => removed.push(key),
  }
  let called = 0
  try {
    await signOutAccount({ signOut: async () => { called++; return { error: null } } }, 'owner-a')
    assert.equal(called, 1)
    assert.deepEqual(removed, keys.slice(0, 4))
    await assert.rejects(signOutAccount({ signOut: async () => ({ error: new Error('offline') }) }, 'owner-b'))
    assert.equal(removed.length, 4)
  } finally { globalThis.sessionStorage = previous }
})

test('account control retains desktop profile and mobile access, dismissal and settings', () => {
  const app = readFileSync(new URL('./App.jsx', import.meta.url), 'utf8')
  const css = readFileSync(new URL('./App.css', import.meta.url), 'utf8')
  assert.equal((app.match(/className="profile-trigger"/g) || []).length, 1)
  assert.ok(app.includes('className="sidebar-profile"'))
  assert.ok(app.includes('aria-label="Account menu"'))
  assert.ok(app.includes('aria-controls="account-menu"'))
  const menu = app.split('id="account-menu"')[1].split('onClick={handleSignOutClick}')[0]
  assert.ok(menu.includes("handleModeChange('settings')"))
  assert.ok(app.includes('onClick={handleSignOutClick}'))
  for (const event of ['pointerdown', 'focusin', 'keydown']) assert.ok(app.includes(`document.addEventListener('${event}'`))
  assert.match(css, /@media\(max-width:760px\)\{\s*\.topbar\{flex-wrap:wrap\}[\s\S]*\.profile-trigger\{display:flex;width:44px;height:44px/)
})

test('account-specific app remounts on account change and unmounts on sign-out', () => {
  const app = readFileSync(new URL('./App.jsx', import.meta.url), 'utf8')
  assert.ok(app.includes('<WorkspaceApplication key={session.user.id}'))
  assert.match(app, /if \(!session\) \{\s*return <AuthScreen/)
  assert.ok(app.includes('await signOutAccount(supabase.auth, session?.user.id)'))
  assert.ok(app.includes('releaseCaptureResources(recorders, streams, sockets)'))
  assert.ok(app.includes('if (!accountActiveRef.current) return'))
})
