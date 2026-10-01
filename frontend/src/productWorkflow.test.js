import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { readLastWorkspace, writeLastWorkspace, restoreWorkspace, recordingPreferences } from './workspacePreferences.js'
import { companyData, canChangeAction } from './companyData.js'
import { normalizeMinutes } from './minutesData.js'

test('refresh restores only the current account last valid membership; removal falls back to Personal', () => {
  const previous = globalThis.localStorage; const storage = new Map()
  globalThis.localStorage = { getItem:k=>storage.get(k), setItem:(k,v)=>storage.set(k,v) }
  try {
    const memberships=[{id:'blue',role:'member'},{id:'green',role:'admin'}]
    assert.equal(readLastWorkspace('a'), '')
    writeLastWorkspace('a','blue'); writeLastWorkspace('b','green')
    assert.equal(restoreWorkspace('a',memberships),'blue')
    assert.equal(restoreWorkspace('b',memberships),'green')
    assert.equal(restoreWorkspace('c',memberships),'')
    assert.equal(restoreWorkspace('a',[memberships[1]]),'')
    writeLastWorkspace('a',''); assert.equal(restoreWorkspace('a',memberships),'')
    assert.equal(restoreWorkspace('b',memberships),'green')
    recordingPreferences('a',{speakerMode:'single'}); assert.equal(recordingPreferences('a').speakerMode,'single');assert.equal(recordingPreferences('b').speakerMode,'multi')
  } finally { globalThis.localStorage=previous }
})
test('blocked storage safely keeps Personal and multi-speaker defaults', () => {
  const previous=globalThis.localStorage
  globalThis.localStorage={getItem(){throw Error('blocked')},setItem(){throw Error('blocked')}}
  try { writeLastWorkspace('a','blue');assert.equal(restoreWorkspace('a',[{id:'blue'}]),'');assert.equal(recordingPreferences('a').speakerMode,'multi') } finally {globalThis.localStorage=previous}
})
test('structured identity survives normalization; name matching never grants action rights', () => {
  const action={task:'Ship',owner:'Daniel',assignee_user_id:'daniel-id',deadline:'Friday',status:'Open'}
  assert.equal(normalizeMinutes({action_items:[action]}).action_items[0].assignee_user_id,'daniel-id')
  const admin={role:'admin'}, member={role:'member'}
  assert.equal(canChangeAction(admin,action,'other'),true)
  assert.equal(canChangeAction(member,action,'daniel-id'),true)
  assert.equal(canChangeAction(member,action,'Daniel'),false)
  assert.equal(canChangeAction(member,{owner:'daniel-id'},'daniel-id'),false)
  assert.equal(canChangeAction(member,{assignee_user_id:null},null),false)
  const result=companyData([{id:'m',organization_id:'blue',title:'Plan',revision:'r',minutes:{action_items:['Legacy',action]}}],'blue')
  assert.equal(result.actions[1].index,1);assert.equal(result.actions[1].revision,'r');assert.equal(result.actions[0].owner,'Unassigned')
})
test('primary navigation stays task-focused; role-aware settings own administration', () => {
  const app=readFileSync(new URL('./App.jsx',import.meta.url),'utf8')
  const nav=app.slice(app.indexOf('<nav aria-label="Primary navigation">'),app.indexOf('</nav>'))
  assert.doesNotMatch(nav, />Members<|Members & Access|Invitations|>Settings</)
  const settings=readFileSync(new URL('./Settings.jsx',import.meta.url),'utf8')
  for(const label of ['Profile','Appearance','Workspaces','People','Join requests','Roles & access','Invitations','Preferences','Recording defaults','Sessions'])assert.ok(settings.includes(label))
  assert.match(settings,/workspace\?\.role === 'admin' \? \[\['general'/)
  assert.match(app,/data-workspace-kind=\{workspace \? 'company' : 'personal'\}/)
  assert.match(app,/if \(!workspaceReady\) return/)
  const views=readFileSync(new URL('./CompanyViews.jsx',import.meta.url),'utf8')
  assert.doesNotMatch(views,/User ID:|<small>\{member.user_id\}/)
  assert.match(views,/Pending requests/);assert.match(views,/decision: 'approve'/);assert.match(views,/decision: 'decline'/)
})
test('pending redemption never enters active workspace and login is uncluttered', () => {
  const picker=readFileSync(new URL('./WorkspacePicker.jsx',import.meta.url),'utf8')
  assert.match(picker,/if \(data.status === 'pending'\)/)
  assert.match(picker,/else onCreated\(data\)/)
  const app=readFileSync(new URL('./App.jsx',import.meta.url),'utf8')
  const auth=app.slice(app.indexOf('export function AuthScreen'),app.indexOf('function App()'))
  assert.doesNotMatch(auth,/auth-company-paths|Create a Company Workspace/)
  assert.match(auth,/Create or join a workspace after signing in/)
  const css=readFileSync(new URL('./ProductDesign.css',import.meta.url),'utf8')
  assert.match(css,/\.profile-menu \.sign-out/);assert.match(css,/prefers-reduced-motion/)
  assert.match(css,/@media \(max-width:375px\)/)
})
