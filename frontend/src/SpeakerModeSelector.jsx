export default function SpeakerModeSelector({ value, onChange, disabled, hasTranscript }) {
  return <fieldset className="speaker-mode-selector" disabled={disabled}>
    <legend>Who will be speaking?</legend>
    <div>
      {[
        ['single', 'Single Speaker', 'Best for lectures, presentations, voice notes, or one-person recordings.'],
        ['multi', 'Multi-Speaker Meeting', 'Best for meetings, interviews, discussions, and conversations.'],
      ].map(([mode, label, description]) => <label key={mode}>
        <input type="radio" name="speaker-mode" value={mode} checked={value === mode} onChange={() => onChange(mode)} />
        <span><strong>{label}</strong><small>{description}</small></span>
      </label>)}
    </div>
    {hasTranscript && <p>Changing this choice clears speaker names and generated minutes. Your transcript stays available.</p>}
  </fieldset>
}
