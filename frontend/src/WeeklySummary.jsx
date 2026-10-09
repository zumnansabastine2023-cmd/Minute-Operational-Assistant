import { useState } from 'react'
import { currentWeek } from './summaryDates'

export default function WeeklySummary({ request, openMeeting, companyName }) {
  const [dates, setDates] = useState(currentWeek)
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const generate = async (event) => {
    event.preventDefault()
    if (busy) return
    if (!dates.start || !dates.end || dates.start > dates.end) { setError('Choose a valid date range.'); return }
    setBusy(true)
    setError('')
    setResult(null)
    try {
      const response = await request({ start_date: dates.start, end_date: dates.end })
      if (!response.ok) throw new Error(response.status === 400 ? 'Choose a date range of at most 93 days.' : 'Unable to create a summary. Please retry.')
      const data = await response.json()
      if (typeof data.answer !== 'string' || !Array.isArray(data.sources)) throw new Error('Invalid summary response. Please retry.')
      setResult(data)
    } catch (error) { setError(error.message) }
    finally { setBusy(false) }
  }
  return <section className="transcript-section weekly-summary">
    <h2>{companyName ? `${companyName} Weekly Summary` : 'Weekly Summary'}</h2><p>Review decisions and actions across {companyName ? 'this company’s' : 'your personal'} saved meetings. Date boundaries use UTC.</p>
    <form className="summary-dates" onSubmit={generate}>
      <label>From<input type="date" required disabled={busy} value={dates.start} onChange={(event) => setDates({ ...dates, start: event.target.value })} /></label>
      <label>Through<input type="date" required disabled={busy} value={dates.end} onChange={(event) => setDates({ ...dates, end: event.target.value })} /></label>
      <button disabled={busy}>{busy ? 'Preparing summary…' : result ? 'Refresh Summary' : 'Generate Summary'}</button>
    </form>
    {error && <p role="alert">{error}</p>}
    {result && <div className="summary-result"><p>{result.start_date} through {result.end_date} · UTC</p>
      <p>{result.meetings_considered === 0 ? 'No meetings were found for this period.' : result.answer}</p>
      {result.limited && <p>This summary uses bounded excerpts from up to 20 recent meetings in the range. Narrow the dates for more detail.</p>}
      {result.sources.length > 0 && <><h3>Meetings referenced</h3><ul>{result.sources.map((source) => <li key={source.meeting_id}><button onClick={() => openMeeting(source.meeting_id)}>{source.meeting_title}</button></li>)}</ul></>}
    </div>}
  </section>
}
