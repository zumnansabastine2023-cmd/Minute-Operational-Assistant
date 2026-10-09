import { normalizeMinutes } from './minutesData.js'

function heading(title, date) {
  const parsed = new Date(date)
  return `${title || 'Untitled meeting'}\n${Number.isNaN(parsed.getTime()) ? 'Date not specified' : parsed.toISOString()}\n`
}

export function transcriptExport(title, date, transcript) {
  return `${heading(title, date)}\nTranscript\n\n${transcript || ''}\n`
}

export function minutesExport(title, date, value) {
  const minutes = normalizeMinutes(value)
  const list = (items) => items.length ? items.map((item) => `- ${item}`).join('\n') : 'None identified.'
  const actions = minutes.action_items.map((item) => `${item.task}\n  Owner: ${item.owner}\n  Deadline: ${item.deadline}\n  Status: ${item.status}`)
  return `${heading(title, date)}\nSummary\n${minutes.summary || 'None identified.'}\n\nDiscussion points\n${list(minutes.key_points)}\n\nDecisions\n${list(minutes.decisions)}\n\nAction items\n${list(actions)}\n`
}

export function exportFilename(title, kind) {
  const safe = String(title || 'Meeting').replace(/[<>:"/\\|?*\p{Cc}]/gu, '-').replace(/^\.+|[. ]+$/g, '').slice(0, 80) || 'Meeting'
  return `${safe}-${kind}.txt`
}

export function downloadText(text, filename) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function printMinutes(text, title) {
  const popup = window.open('', '_blank', 'width=800,height=700')
  if (!popup) throw new Error('Allow the print window, or download the minutes as text.')
  popup.opener = null
  popup.document.title = title || 'Meeting minutes'
  const style = popup.document.createElement('style')
  style.textContent = '@page { margin: 20mm; } body { margin: 24px; color: #111; background: #fff; } pre { white-space: pre-wrap; overflow-wrap: anywhere; font: 12pt/1.5 Arial, sans-serif; }'
  const content = popup.document.createElement('pre')
  content.textContent = text
  popup.document.head.append(style)
  popup.document.body.append(content)
  popup.focus()
  popup.onafterprint = () => popup.close()
  popup.print()
}
