import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { transformSync } from 'rolldown/utils'
import React from 'react'
import { normalizeMinutes } from './minutesData.js'
import { readOnboarding, writeOnboarding } from './onboarding.js'
import { canManageWorkspace } from './workspaceScope.js'

// Exercise component event handlers with a small hook harness; browser layout remains manual.
function mount(file, props) {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8').replace(/^import .*$/gm, '').replace('export default function', 'return function')
  const values = []; let cursor = 0
  const useState = initial => { const i = cursor++; if (!(i in values)) values[i] = typeof initial === 'function' ? initial() : initial; return [values[i], value => { values[i] = typeof value === 'function' ? value(values[i]) : value }] }
  const component = new Function('React', 'useState', 'useRef', 'useEffect', 'normalizeMinutes', transformSync(file, source, { jsx: { runtime: 'classic' } }).code)(React, useState, initial => useState({ current: initial })[0], () => {}, normalizeMinutes)
  return () => { cursor = 0; return component(props) }
}
function nodes(tree) { if (!tree || typeof tree !== 'object') return []; return [tree, ...React.Children.toArray(tree.props?.children).flatMap(nodes)] }
function text(tree) { if (typeof tree === 'string') return tree; return React.Children.toArray(tree?.props?.children).map(text).join('') }
function button(tree, label) { const result = nodes(tree).find(n => n.type === 'button' && text(n) === label); assert.ok(result, label); return result }

test('signup and authentication company intents persist, isolate emails and Personal clears intent', () => {
  const previous = globalThis.sessionStorage; const values = new Map()
  globalThis.sessionStorage = { getItem: k => values.get(k), setItem: (k,v) => values.set(k,v), removeItem: k => values.delete(k) }
  try {
    assert.equal(readOnboarding(), null)
    for (const choice of ['choose', 'create', 'join']) { writeOnboarding(choice, 'new@example.com'); assert.equal(readOnboarding('new@example.com'), choice); assert.equal(readOnboarding('other@example.com'), null) }
    writeOnboarding(null); assert.equal(readOnboarding(), null)
  } finally { globalThis.sessionStorage = previous }
})
test('onboarding Personal, Create and Join paths call their handlers', () => {
  let selected = ''
  const tree = mount('./WorkspaceOnboarding.jsx', { choice: 'choose', onPersonal: () => { selected = 'personal' }, onChoose: value => { selected = value } })()
  for (const [label, value] of [['Continue with Personal', 'personal'], ['Create Company Workspace', 'create'], ['Join a Company', 'join']]) { button(tree, label).props.onClick(); assert.equal(selected, value) }
})
test('Personal and Admin expose edit; Member has no edit control', () => {
  for (const workspace of [null, {role:'admin'}, {role:'member'}]) {
    const tree = mount('./MinutesEditor.jsx', { saved: true, minutes: {}, readOnly: !canManageWorkspace(workspace) })()
    assert.equal(nodes(tree).some(n => n.type === 'button' && text(n) === 'Edit Meeting'), workspace?.role !== 'member')
  }
})
test('saved minutes Save persists draft and Cancel discards without saving', async () => {
  const previous = globalThis.window; globalThis.window = { confirm: () => true }
  try {
    const saves = []; let editing = false
    const render = mount('./MinutesEditor.jsx', { title:'Original', saved:true, minutes:{ summary:'Before' }, onEditing: v => { editing = v }, onSave: async (...args) => saves.push(args) })
    button(render(), 'Edit Meeting').props.onClick(); assert.equal(editing, true)
    nodes(render()).find(n => n.type === 'textarea').props.onChange({target:{value:'After'}})
    await button(render(), 'Save Changes').props.onClick()
    assert.equal(saves[0][0].summary, 'After'); assert.equal(saves[0][1], 'Original'); assert.equal(editing, false)
    button(render(), 'Edit Meeting').props.onClick(); button(render(), 'Cancel').props.onClick()
    assert.equal(saves.length, 1); assert.equal(editing, false)
  } finally { globalThis.window = previous }
})
test('header edit request opens saved editor immediately', () => {
  const tree = mount('./MinutesEditor.jsx', { saved:true, title:'Meeting', minutes:{}, editRequest:1 })()
  button(tree, 'Save Changes'); button(tree, 'Cancel'); assert.match(text(tree), /Unsaved changes/)
})
test('Workspaces displays roles and switching uses supplied scope handler', () => {
  let selected = null
  const tree = mount('./WorkspacePicker.jsx', { workspace:null, organizations:[{id:'a', name:'Company', role:'admin'}], onSelect: id => { selected = id } })()
  button(tree, 'Open Workspace').props.onClick(); assert.equal(selected, 'a'); assert.match(text(tree), /Personal.*Current workspace.*CompanyAdmin/)
})
test('navigation keeps management in account/settings, auth gate before onboarding, mobile account and sign out available', () => {
  const app = readFileSync(new URL('./App.jsx', import.meta.url), 'utf8')
  const sidebar = app.slice(app.indexOf('<aside className="sidebar">'), app.indexOf('</aside>'))
  assert.doesNotMatch(sidebar, /workspacePicker|Create Company|Join Company/)
  const menu = app.slice(app.indexOf('{isProfileMenuOpen &&'), app.indexOf('{authError &&'))
  assert.match(menu, /Manage Workspaces/); assert.match(menu, /Switch Workspace/); assert.match(menu, /Sign out/)
  assert.doesNotMatch(menu, /mobile-workspace-picker|desktop-workspace-picker/)
  assert.match(app, /if \(!session\) \{\s+return <AuthScreen/)
  assert.match(app, /key=\{workspaceKey\(props.session.user.id, workspace\)\}/)
  assert.match(app, /controller.current.abort\(\)/)
})
