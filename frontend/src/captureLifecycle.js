export function recorderIsActive(recorder) {
  return Boolean(recorder && recorder.state !== 'inactive')
}

export function releaseCaptureResources(recorders, streams, sockets) {
  for (const ref of recorders) {
    if (ref.current) {
      ref.current.onstop = null
      ref.current.ondataavailable = null
      ref.current.onerror = null
      if (recorderIsActive(ref.current)) ref.current.stop()
      ref.current = null
    }
  }
  for (const ref of streams) {
    ref.current?.getTracks().forEach((track) => { track.onended = null; track.stop() })
    ref.current = null
  }
  for (const ref of sockets) {
    if (ref.current) {
      ref.current.onopen = null
      ref.current.onclose = null
      ref.current.onmessage = null
      ref.current.onerror = null
      ref.current.close()
      ref.current = null
    }
  }
}
