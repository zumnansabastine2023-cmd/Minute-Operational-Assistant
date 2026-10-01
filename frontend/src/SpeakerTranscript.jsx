import { useState } from 'react'
import { normalizeSpeakerName, speakerDisplayName } from './liveSpeakerTurns'
import './SpeakerTranscript.css'

export default function SpeakerTranscript({ turns, transcript, names = {}, onRename, onReset, disabled = false }) {
  const [nameError, setNameError] = useState(null)
  const speakers = [...new Set(turns.filter((turn) => turn.speaker).map((turn) => turn.speaker))]
  const hasCompleteSpeakers = turns.every((turn) => turn.speaker)

  const renameSpeaker = (speaker) => {
    const input = window.prompt(`Name for ${speaker}:`, speakerDisplayName(speaker, names))
    if (input === null) return
    const name = normalizeSpeakerName(input)
    if (!name) {
      setNameError({ speaker, message: 'Enter a name from 1 to 80 characters, without colons, line breaks, or angle brackets.' })
      return
    }
    const normalizedName = name.toLocaleLowerCase()
    if (speakers.some((otherSpeaker) => otherSpeaker !== speaker && (
      speakerDisplayName(otherSpeaker, names).toLocaleLowerCase() === normalizedName
      || otherSpeaker.toLocaleLowerCase() === normalizedName
    ))) {
      setNameError({ speaker, message: 'Use a different name for each speaker so their contributions remain clear.' })
      return
    }
    setNameError(null)
    onRename(speaker, name)
  }

  return speakers.length > 0 ? (
    <div className="live-speaker-turns">
      {!hasCompleteSpeakers && <p className="speaker-fallback-hint">Some speech has no speaker label. Saving and minutes generation will use the complete plain transcript.</p>}
      {onRename && hasCompleteSpeakers && <details className="speaker-name-manager">
        <summary>Speaker names</summary>
        <p className="speaker-name-hint">Names apply to this meeting only. Renaming changes the transcript; review existing minutes.</p>
        <ul>
          {speakers.map((speaker) => (
            <li key={speaker}>
              <span><strong>{speakerDisplayName(speaker, names)}</strong>{speakerDisplayName(speaker, names) !== speaker && <small>{speaker}</small>}</span>
              <div>
                <button type="button" disabled={disabled} onClick={() => renameSpeaker(speaker)} aria-label={`Rename ${speaker}`}>Rename</button>
                {onReset && speakerDisplayName(speaker, names) !== speaker && <button type="button" disabled={disabled} onClick={() => { setNameError(null); onReset(speaker) }} aria-label={`Reset ${speaker} name`}>Reset</button>}
              </div>
            </li>
          ))}
        </ul>
        {nameError && speakers.includes(nameError.speaker) && <p className="speaker-name-error" role="alert">{nameError.message}</p>}
      </details>}
      {turns.map((turn, index) => (
        <div className="live-speaker-turn" key={index}>
          {turn.speaker && <strong className="live-speaker-label">{speakerDisplayName(turn.speaker, names)}</strong>}
          <p>{turn.text}</p>
        </div>
      ))}
    </div>
  ) : transcript && <p>{transcript}</p>
}
