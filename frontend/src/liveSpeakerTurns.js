// Require a complete set of finalized labels: never omit unlabelled speech.
export function normalizeSpeakerName(value) {
  if (typeof value !== 'string') return null
  const name = value.trim()
  return name && name.length <= 80 && !/[:<>\p{Cc}\p{Cf}]/u.test(name)
    && !/^(undefined|null)$/i.test(name) ? name : null
}

export function speakerDisplayName(speaker, names = {}) {
  return normalizeSpeakerName(names?.[speaker]) || speaker
}

export function canonicalLiveTranscript(turns, plainTranscript, names = {}) {
  if (!Array.isArray(turns) || !turns.length || !Array.from(turns).every(
    (turn) => turn && typeof turn === 'object'
      && typeof turn.speaker === 'string' && /^Speaker [1-9]\d*$/.test(turn.speaker.trim())
      && typeof turn.text === 'string' && turn.text.trim(),
  )) return plainTranscript

  return turns.map(({ speaker, text }) => `${speakerDisplayName(speaker.trim(), names)}: ${text.trim()}`).join('\n')
}

export function selectMeetingTranscript(meetingType, plainTranscript, liveTurns, onlineTurns, recordedTurns, namesByType = {}, modesByType = {}) {
  if (modesByType[meetingType] === 'single') return plainTranscript
  return ['live', 'online', 'recorded'].includes(meetingType)
    ? canonicalLiveTranscript({ live: liveTurns, online: onlineTurns, recorded: recordedTurns }[meetingType], plainTranscript, namesByType[meetingType])
    : plainTranscript
}

// Missing or partially invalid metadata falls back to the complete plain text.
export function appendLiveSpeakerTurns(previous, segments, text) {
  const valid = Array.isArray(segments) && segments.length > 0 && Array.from(segments).every(
    (segment) => segment && typeof segment === 'object'
      && typeof segment.speaker === 'string' && /^Speaker [1-9]\d*$/.test(segment.speaker.trim())
      && typeof segment.text === 'string' && segment.text.trim(),
  ) && typeof text === 'string'
    && segments.map((segment) => segment.text.trim()).join(' ').replace(/\s+/g, ' ')
      === text.trim().replace(/\s+/g, ' ')
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
