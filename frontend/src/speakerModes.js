export function validSpeakerMode(value) {
  return value === 'single' || value === 'multi'
}

export function resetSpeakerMode(value) {
  if (!validSpeakerMode(value)) throw new Error('Unsupported speaker mode')
  return { mode: value, turns: [], names: {}, minutes: null }
}

export function speakerSocketUrl(base, mode) {
  if (!validSpeakerMode(mode)) throw new Error('Unsupported speaker mode')
  const url = new URL(base)
  url.searchParams.set('speaker_mode', mode)
  return url.toString()
}
