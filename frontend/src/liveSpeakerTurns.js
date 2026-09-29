// Missing or partially invalid metadata falls back to the complete plain text.
export function appendLiveSpeakerTurns(previous, segments, text) {
  const valid = Array.isArray(segments) && segments.length > 0 && segments.every(
    (segment) => segment && typeof segment === 'object'
      && typeof segment.speaker === 'string' && segment.speaker.trim()
      && typeof segment.text === 'string' && segment.text.trim(),
  )
  const incoming = valid
    ? segments.map(({ speaker, text }) => ({ speaker: speaker.trim(), text: text.trim() }))
    : [{ speaker: null, text }]
  const turns = [...previous]

  for (const turn of incoming) {
    const last = turns.at(-1)
    if (last && last.speaker === turn.speaker) {
      turns[turns.length - 1] = { ...last, text: `${last.text} ${turn.text}` }
    } else {
      turns.push(turn)
    }
  }
  return turns
}
