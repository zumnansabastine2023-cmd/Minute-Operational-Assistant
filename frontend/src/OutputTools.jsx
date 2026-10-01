import { useState } from 'react'
import { transcriptExport, minutesExport, exportFilename, downloadText, printMinutes } from './meetingExports'
import './OutputTools.css'

export default function OutputTools({ title, date, transcript, minutes, disabled = false }) {
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const transcriptText = transcriptExport(title, date, transcript)
  const minutesText = minutesExport(title, date, minutes)
  const run = async (action, success) => {
    setBusy(true)
    try { await action(); setMessage(success) }
    catch { setMessage('Unable to complete that action. Check clipboard or popup permissions, or download the text instead.') }
    finally { setBusy(false) }
  }
  return <div className="output-tools" aria-label="Meeting output tools">
    <div>
      <button disabled={disabled || busy || !transcript} onClick={() => run(() => navigator.clipboard.writeText(transcriptText), 'Transcript copied.')}>Copy transcript</button>
      <button disabled={disabled || busy || !minutes} onClick={() => run(() => navigator.clipboard.writeText(minutesText), 'Minutes copied.')}>Copy minutes</button>
      <button disabled={disabled || busy || !transcript} onClick={() => run(() => downloadText(transcriptText, exportFilename(title, 'transcript')), 'Transcript download started.')}>Download transcript</button>
      <button disabled={disabled || busy || !minutes} onClick={() => run(() => downloadText(minutesText, exportFilename(title, 'minutes')), 'Minutes download started.')}>Export minutes (TXT)</button>
      <button disabled={disabled || busy || !minutes} onClick={() => run(() => printMinutes(minutesText, title), 'Choose Save as PDF in the print dialog.')}>Print / Save PDF</button>
    </div>
    {message && <p role="status">{message}</p>}
  </div>
}
