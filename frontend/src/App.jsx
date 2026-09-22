import { useEffect, useRef, useState } from 'react'
import './App.css'
import { supabase } from './supabaseClient'

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000')
  .replace(/\/+$/, '')
const WEBSOCKET_BASE_URL = API_BASE_URL
  .replace(/^https:/i, 'wss:')
  .replace(/^http:/i, 'ws:')
const TRANSCRIPTION_SOCKET_URL = `${WEBSOCKET_BASE_URL}/ws/transcribe`
const RECORDED_TRANSCRIPTION_URL = `${API_BASE_URL}/transcribe`
const MINUTES_GENERATION_URL = `${API_BASE_URL}/generate-minutes`
const MEETINGS_API_URL = `${API_BASE_URL}/meetings`
const ASSISTANT_CHAT_URL = `${API_BASE_URL}/assistant/chat`
const AUDIO_CHUNK_INTERVAL_MS = 250

function Icon({ name, size = 18 }) {
  const commonProps = {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
  }
  const paths = {
    home: <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" /><path d="M9 21v-6h6v6" /></>,
    mic: <><rect x="8" y="2" width="8" height="13" rx="4" /><path d="M5 11a7 7 0 0 0 14 0M12 18v4M8 22h8" /></>,
    upload: <><path d="M12 16V3M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" /></>,
    video: <><rect x="3" y="6" width="13" height="12" rx="2" /><path d="m16 10 5-3v10l-5-3Z" /></>,
    sparkles: <><path d="m12 3-1.4 5.6L5 10l5.6 1.4L12 17l1.4-5.6L19 10l-5.6-1.4ZM19 16l-.7 2.3L16 19l2.3.7L19 22l.7-2.3L22 19l-2.3-.7Z" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.1 2.1-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5v.2h-3v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1-2.1-2.1.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H5.3v-3h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1L8.7 6l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5v-.2h3v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1 2.1 2.1-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.2v3h-.2a1.7 1.7 0 0 0-1.4 1Z" /></>,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
    moon: <path d="M20.5 15.2A8.5 8.5 0 0 1 8.8 3.5 8.5 8.5 0 1 0 20.5 15.2Z" />,
    chevron: <path d="m9 18 6-6-6-6" />,
    logout: <><path d="M10 17l5-5-5-5M15 12H3" /><path d="M13 4h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5" /></>,
  }
  return <svg {...commonProps}>{paths[name] || paths.home}</svg>
}

async function authenticatedFetch(url, options = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token) {
    throw new Error('Your session is no longer valid. Please sign in again.')
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${session.access_token}`,
    },
  })
  if (response.status === 401) {
    throw new Error('Your session is no longer valid. Please sign in again.')
  }
  return response
}

function MainApplication({ session, onSignOut, authError, theme, setTheme }) {
  const [mode, setMode] = useState('dashboard')
  const [isRecording, setIsRecording] = useState(false)
  const [status, setStatus] = useState('Ready')
  const [transcript, setTranscript] = useState('')
  const [interimTranscript, setInterimTranscript] = useState('')
  const [selectedFile, setSelectedFile] = useState(null)
  const [recordedTranscript, setRecordedTranscript] = useState('')
  const [isTranscribingRecording, setIsTranscribingRecording] = useState(false)
  const [liveMinutes, setLiveMinutes] = useState(null)
  const [recordedMinutes, setRecordedMinutes] = useState(null)
  const [onlineMinutes, setOnlineMinutes] = useState(null)
  const [onlineStatus, setOnlineStatus] = useState('Idle')
  const [isOnlineCapturing, setIsOnlineCapturing] = useState(false)
  const [onlineTranscript, setOnlineTranscript] = useState('')
  const [onlineInterimTranscript, setOnlineInterimTranscript] = useState('')
  const [isGeneratingMinutes, setIsGeneratingMinutes] = useState(false)
  const [meetings, setMeetings] = useState([])
  const [selectedMeeting, setSelectedMeeting] = useState(null)
  const [isLoadingMeetings, setIsLoadingMeetings] = useState(true)
  const [isLoadingSelectedMeeting, setIsLoadingSelectedMeeting] = useState(false)
  const [isSavingMeeting, setIsSavingMeeting] = useState(false)
  const [isDeletingMeetingId, setIsDeletingMeetingId] = useState(null)
  const [historyError, setHistoryError] = useState('')
  const [error, setError] = useState('')
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false)
  const [isNewMeetingOpen, setIsNewMeetingOpen] = useState(false)
  const [meetingFilter, setMeetingFilter] = useState('all')
  const [meetingSearchQuery, setMeetingSearchQuery] = useState('')
  const [meetingSearchResults, setMeetingSearchResults] = useState(null)
  const [isSearchingMeetings, setIsSearchingMeetings] = useState(false)
  const [activeMeetingTab, setActiveMeetingTab] = useState('overview')
  const [assistantMessages, setAssistantMessages] = useState([
    {
      id: 'assistant-greeting',
      role: 'assistant',
      content: 'Ask me anything about your meetings.',
      isGreeting: true,
    },
  ])
  const [assistantInput, setAssistantInput] = useState('')
  const [isAssistantThinking, setIsAssistantThinking] = useState(false)
  const mediaRecorderRef = useRef(null)
  const streamRef = useRef(null)
  const webSocketRef = useRef(null)
  const isSessionActiveRef = useRef(false)
  const isStoppingRef = useRef(false)
  const recordingAttemptRef = useRef(0)
  const onlineDisplayStreamRef = useRef(null)
  const onlineMediaRecorderRef = useRef(null)
  const onlineWebSocketRef = useRef(null)
  const isOnlineSessionActiveRef = useRef(false)
  const isOnlineStoppingRef = useRef(false)
  const onlineAttemptRef = useRef(0)

  useEffect(() => {
    let isCurrent = true

    const loadMeetings = async () => {
      try {
        const response = await authenticatedFetch(MEETINGS_API_URL)
        if (!response.ok) {
          throw new Error(`History request failed: ${response.status}`)
        }
        const loadedMeetings = await response.json()
        if (isCurrent) {
          setMeetings(Array.isArray(loadedMeetings) ? loadedMeetings : [])
          setHistoryError('')
        }
      } catch (historyLoadError) {
        if (isCurrent) {
          setHistoryError(`Unable to load meeting history: ${historyLoadError.message}`)
        }
      } finally {
        if (isCurrent) {
          setIsLoadingMeetings(false)
        }
      }
    }

    loadMeetings()
    return () => {
      isCurrent = false
    }
  }, [])

  const releaseMicrophone = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }

  const stopRecording = () => {
    if (!isSessionActiveRef.current && !isStoppingRef.current) return

    recordingAttemptRef.current += 1
    isSessionActiveRef.current = false
    isStoppingRef.current = true
    setStatus('Stopping')
    setInterimTranscript('')

    const mediaRecorder = mediaRecorderRef.current
    const willFinalizeRecorder = mediaRecorder?.state !== 'inactive'
    if (willFinalizeRecorder) {
      mediaRecorder.stop()
    } else {
      releaseMicrophone()
    }

    if (!willFinalizeRecorder) {
      const socket = webSocketRef.current
      if (socket && socket.readyState !== WebSocket.CLOSED) {
        socket.close(1000, 'Recording stopped')
      }
      isStoppingRef.current = false
      setStatus('Ready')
    }

    setIsRecording(false)
  }

  const startRecording = async () => {
    if (isSessionActiveRef.current || isStoppingRef.current) return

    const recordingAttempt = recordingAttemptRef.current + 1
    recordingAttemptRef.current = recordingAttempt
    isSessionActiveRef.current = true
    setStatus('Connecting')
    setError('')
    setInterimTranscript('')

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session?.access_token) {
        isSessionActiveRef.current = false
        setError('Your session is no longer valid. Please sign in again.')
        setStatus('Error')
        return
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (
        recordingAttemptRef.current !== recordingAttempt ||
        !isSessionActiveRef.current
      ) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      streamRef.current = stream

      const mimeType = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
      ].find((type) => MediaRecorder.isTypeSupported(type))
      const mediaRecorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder

      mediaRecorder.ondataavailable = (event) => {
        const socket = webSocketRef.current
        if (event.data.size > 0 && socket?.readyState === WebSocket.OPEN) {
          socket.send(event.data)
        }
      }

      mediaRecorder.onerror = () => {
        setError('The microphone recorder encountered an error.')
        setStatus('Error')
        isSessionActiveRef.current = false
        setIsRecording(false)
        webSocketRef.current?.close()
      }

      mediaRecorder.onstop = () => {
        releaseMicrophone()
        const socket = webSocketRef.current
        if (isStoppingRef.current && socket?.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'finalize' }))
        }
        if (mediaRecorderRef.current === mediaRecorder) {
          mediaRecorderRef.current = null
        }
      }

      const socket = new WebSocket(TRANSCRIPTION_SOCKET_URL, ['access-token', session.access_token])
      webSocketRef.current = socket

      socket.onopen = () => {
        if (!isSessionActiveRef.current) {
          socket.close(1000, 'Recording was cancelled')
          return
        }

        try {
          mediaRecorder.start(AUDIO_CHUNK_INTERVAL_MS)
          setIsRecording(true)
          setStatus('Recording')
        } catch {
          setError('Unable to start microphone recording.')
          setStatus('Error')
          isSessionActiveRef.current = false
          releaseMicrophone()
          socket.close()
        }
      }

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          if (message.type === 'transcript' && message.text) {
            if (message.is_final) {
              setTranscript((previous) =>
                previous ? `${previous} ${message.text}` : message.text,
              )
              setInterimTranscript('')
            } else {
              setInterimTranscript(message.text)
            }
          } else if (message.type === 'error') {
            setError(message.message || 'The transcription service reported an error.')
            setStatus('Error')
          }
        } catch {
          setError('Received an invalid transcription message.')
          setStatus('Error')
        }
      }

      socket.onerror = () => {
        setError('Unable to connect to the transcription service.')
      }

      socket.onclose = () => {
        if (webSocketRef.current === socket) {
          webSocketRef.current = null
        }

        const wasStopping = isStoppingRef.current
        const wasRecording = isSessionActiveRef.current
        isStoppingRef.current = false

        if (wasStopping) {
          setStatus('Ready')
        } else if (wasRecording) {
          isSessionActiveRef.current = false
          if (mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop()
          } else {
            releaseMicrophone()
          }
          setIsRecording(false)
          setInterimTranscript('')
          setError('The transcription connection closed unexpectedly.')
          setStatus('Error')
        }
      }
    } catch {
      if (recordingAttemptRef.current !== recordingAttempt) return
      isSessionActiveRef.current = false
      releaseMicrophone()
      setError('Microphone access was denied or is unavailable.')
      setStatus('Error')
    }
  }

  const handleRecordingToggle = () => {
    if (isSessionActiveRef.current || isStoppingRef.current) {
      stopRecording()
    } else {
      startRecording()
    }
  }

  const releaseOnlineDisplayCapture = () => {
    onlineDisplayStreamRef.current?.getTracks().forEach((track) => {
      track.onended = null
      track.stop()
    })
    onlineDisplayStreamRef.current = null
  }

  const stopOnlineMeeting = () => {
    if (!isOnlineSessionActiveRef.current && !isOnlineStoppingRef.current) return

    onlineAttemptRef.current += 1
    isOnlineSessionActiveRef.current = false
    isOnlineStoppingRef.current = true
    setOnlineStatus('Stopping')
    setOnlineInterimTranscript('')

    const recorder = onlineMediaRecorderRef.current
    if (recorder?.state !== 'inactive') {
      recorder.stop()
    } else {
      releaseOnlineDisplayCapture()
      const socket = onlineWebSocketRef.current
      if (socket && socket.readyState !== WebSocket.CLOSED) {
        socket.close(1000, 'Online capture stopped')
      }
      isOnlineStoppingRef.current = false
      setOnlineStatus('Finished')
    }
    setIsOnlineCapturing(false)
  }

  const startOnlineMeeting = async () => {
    if (isOnlineSessionActiveRef.current || isOnlineStoppingRef.current) return

    const attempt = onlineAttemptRef.current + 1
    onlineAttemptRef.current = attempt
    isOnlineSessionActiveRef.current = true
    setOnlineStatus('Connecting')
    setError('')
    setOnlineTranscript('')
    setOnlineInterimTranscript('')
    setOnlineMinutes(null)

    let displayStream
    try {
      displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
      if (onlineAttemptRef.current !== attempt || !isOnlineSessionActiveRef.current) {
        displayStream.getTracks().forEach((track) => track.stop())
        return
      }

      const audioTracks = displayStream.getAudioTracks()
      if (audioTracks.length === 0) {
        displayStream.getTracks().forEach((track) => track.stop())
        isOnlineSessionActiveRef.current = false
        setOnlineStatus('Idle')
        setError("No shared audio was detected. Choose the meeting browser tab and enable 'Share tab audio', then try again.")
        return
      }

      onlineDisplayStreamRef.current = displayStream
      displayStream.getTracks().forEach((track) => {
        track.onended = () => stopOnlineMeeting()
      })

      const audioOnlyStream = new MediaStream(audioTracks)
      const mimeType = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
      ].find((type) => MediaRecorder.isTypeSupported(type))
      const recorder = mimeType
        ? new MediaRecorder(audioOnlyStream, { mimeType })
        : new MediaRecorder(audioOnlyStream)
      onlineMediaRecorderRef.current = recorder

      recorder.ondataavailable = (event) => {
        const socket = onlineWebSocketRef.current
        if (event.data.size > 0 && socket?.readyState === WebSocket.OPEN) {
          socket.send(event.data)
        }
      }

      recorder.onerror = () => {
        setError('The online meeting recorder encountered an error.')
        setOnlineStatus('Error')
        isOnlineSessionActiveRef.current = false
        releaseOnlineDisplayCapture()
        onlineWebSocketRef.current?.close()
      }

      recorder.onstop = () => {
        releaseOnlineDisplayCapture()
        const socket = onlineWebSocketRef.current
        if (isOnlineStoppingRef.current && socket?.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'finalize' }))
        }
        if (onlineMediaRecorderRef.current === recorder) {
          onlineMediaRecorderRef.current = null
        }
      }

      const {
        data: { session: activeSession },
      } = await supabase.auth.getSession()
      if (!activeSession?.access_token) {
        isOnlineSessionActiveRef.current = false
        releaseOnlineDisplayCapture()
        setError('Your session is no longer valid. Please sign in again.')
        setOnlineStatus('Error')
        return
      }

      const socket = new WebSocket(TRANSCRIPTION_SOCKET_URL, ['access-token', activeSession.access_token])
      onlineWebSocketRef.current = socket

      socket.onopen = () => {
        if (!isOnlineSessionActiveRef.current) {
          socket.close(1000, 'Online capture was cancelled')
          return
        }
        try {
          recorder.start(AUDIO_CHUNK_INTERVAL_MS)
          setIsOnlineCapturing(true)
          setOnlineStatus('Capturing')
        } catch {
          setError('Unable to start shared-audio capture.')
          setOnlineStatus('Error')
          isOnlineSessionActiveRef.current = false
          releaseOnlineDisplayCapture()
          socket.close()
        }
      }

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          if (message.type === 'transcript' && message.text) {
            if (message.is_final) {
              setOnlineTranscript((previous) => previous ? `${previous} ${message.text}` : message.text)
              setOnlineInterimTranscript('')
            } else {
              setOnlineInterimTranscript(message.text)
            }
          } else if (message.type === 'error') {
            setError(message.message || 'The transcription service reported an error.')
            setOnlineStatus('Error')
            stopOnlineMeeting()
          }
        } catch {
          setError('Received an invalid transcription message.')
          setOnlineStatus('Error')
        }
      }

      socket.onerror = () => {
        setError('Unable to connect to the transcription service.')
      }

      socket.onclose = () => {
        if (onlineWebSocketRef.current === socket) onlineWebSocketRef.current = null
        const wasStopping = isOnlineStoppingRef.current
        const wasCapturing = isOnlineSessionActiveRef.current
        isOnlineStoppingRef.current = false

        if (wasStopping) {
          setOnlineStatus('Finished')
        } else if (wasCapturing) {
          isOnlineSessionActiveRef.current = false
          if (recorder.state !== 'inactive') recorder.stop()
          else releaseOnlineDisplayCapture()
          setIsOnlineCapturing(false)
          setOnlineInterimTranscript('')
          setError('The transcription connection closed unexpectedly.')
          setOnlineStatus('Error')
        }
      }
    } catch {
      if (onlineAttemptRef.current !== attempt) return
      isOnlineSessionActiveRef.current = false
      displayStream?.getTracks().forEach((track) => track.stop())
      releaseOnlineDisplayCapture()
      setError('Screen sharing was cancelled. Start again when you’re ready.')
      setOnlineStatus('Idle')
    }
  }

  const handleOnlineRecordingToggle = () => {
    if (isOnlineSessionActiveRef.current || isOnlineStoppingRef.current) stopOnlineMeeting()
    else startOnlineMeeting()
  }

  const handleModeChange = (nextMode) => {
    if (nextMode === 'history') nextMode = 'meetings'
    if (nextMode === mode) return

    if (mode === 'live') {
      stopRecording()
    }
    if (mode === 'online') {
      stopOnlineMeeting()
    }
    setError('')
    setMode(nextMode)
  }

  const handleSignOutClick = () => {
    if (mode === 'live') {
      stopRecording()
    }
    if (mode === 'online') {
      stopOnlineMeeting()
    }
    onSignOut()
  }

  const validateUploadFile = (file) => {
    const MAX_SIZE_MB = 100
    const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024
    const SUPPORTED_EXTENSIONS = [
      '.mp3', '.wav', '.m4a', '.ogg', '.webm', '.flac', '.aac',
      '.mp4', '.mov', '.mkv'
    ]

    if (file.size > MAX_SIZE_BYTES) {
      return { valid: false, error: `File exceeds 100 MB limit (${(file.size / 1024 / 1024).toFixed(1)} MB).` }
    }

    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase()
    if (!ext || !SUPPORTED_EXTENSIONS.includes(ext)) {
      return {
        valid: false,
        error: `Unsupported file format. Supported: ${SUPPORTED_EXTENSIONS.join(', ')}`
      }
    }

    return { valid: true }
  }

  const handleFileSelection = (event) => {
    const [file] = event.target.files
    if (file) {
      const validation = validateUploadFile(file)
      if (!validation.valid) {
        setError(validation.error)
        setSelectedFile(null)
        return
      }
    }
    setSelectedFile(file || null)
    setRecordedTranscript('')
    setRecordedMinutes(null)
    setError('')
  }

  const transcribeRecording = async () => {
    if (!selectedFile || isTranscribingRecording) return

    const validation = validateUploadFile(selectedFile)
    if (!validation.valid) {
      setError(validation.error)
      return
    }

    setIsTranscribingRecording(true)
    setRecordedMinutes(null)
    setError('')

    try {
      const formData = new FormData()
      formData.append('file', selectedFile, selectedFile.name)

      const response = await authenticatedFetch(RECORDED_TRANSCRIPTION_URL, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        if (response.status === 413) {
          throw new Error('File exceeds 100 MB limit.')
        } else if (response.status === 415) {
          throw new Error('Unsupported file format. Please upload an audio or video file.')
        } else if (response.status === 400) {
          throw new Error('Uploaded file is empty.')
        } else {
          throw new Error(`Backend error: ${response.status}`)
        }
      }

      const data = await response.json()
      setRecordedTranscript(data.transcript || '')
    } catch (uploadError) {
      setError(`Unable to transcribe the recording: ${uploadError.message}`)
    } finally {
      setIsTranscribingRecording(false)
    }
  }

  const generateMinutes = async (meetingType, meetingTranscript) => {
    const cleanedTranscript = meetingTranscript.trim()
    if (!cleanedTranscript || isGeneratingMinutes) return

    setIsGeneratingMinutes(true)
    setError('')

    try {
      const response = await authenticatedFetch(MINUTES_GENERATION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: cleanedTranscript }),
      })
      if (!response.ok) {
        throw new Error(`Minutes generation failed: ${response.status}`)
      }

      const minutes = await response.json()
      if (meetingType === 'live') {
        setLiveMinutes(minutes)
      } else if (meetingType === 'online') {
        setOnlineMinutes(minutes)
      } else {
        setRecordedMinutes(minutes)
      }
    } catch (minutesError) {
      setError(`Unable to generate meeting minutes: ${minutesError.message}`)
    } finally {
      setIsGeneratingMinutes(false)
    }
  }

  const saveMeeting = async (meetingType, meetingTranscript, minutes = null) => {
    const cleanedTranscript = meetingTranscript.trim()
    if (!cleanedTranscript || isSavingMeeting) {
      if (!cleanedTranscript) {
        setError('A meeting needs a transcript before it can be saved.')
      }
      return
    }
    
    const title = window.prompt('Meeting title:', '')
    if (title === null) return
    if (!title.trim()) {
      setError('A meeting title is required.')
      return
    }

    setIsSavingMeeting(true)
    setError('')

    try {
      const response = await authenticatedFetch(MEETINGS_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          type: meetingType,
          transcript: cleanedTranscript,
          minutes,
        }),
      })
      if (!response.ok) {
        throw new Error(`Save request failed: ${response.status}`)
      }

      const savedMeeting = await response.json()
      setMeetings((currentMeetings) => [savedMeeting, ...currentMeetings])
      setSelectedMeeting(savedMeeting)
    } catch (saveError) {
      setError(`Unable to save the meeting: ${saveError.message}`)
    } finally {
      setIsSavingMeeting(false)
    }
  }

  const selectMeeting = async (meetingId, tab = 'overview') => {
    setIsLoadingSelectedMeeting(true)
    setHistoryError('')
    setActiveMeetingTab(tab)

    try {
      const response = await authenticatedFetch(`${MEETINGS_API_URL}/${meetingId}`)
      if (!response.ok) {
        throw new Error(`Meeting request failed: ${response.status}`)
      }
      setSelectedMeeting(await response.json())
      setMode('meetings')
    } catch (meetingLoadError) {
      setHistoryError(`Unable to load the selected meeting: ${meetingLoadError.message}`)
    } finally {
      setIsLoadingSelectedMeeting(false)
    }
  }

  const deleteMeeting = async (meetingId) => {
    if (isDeletingMeetingId) return

    setIsDeletingMeetingId(meetingId)
    setHistoryError('')

    try {
      const response = await authenticatedFetch(`${MEETINGS_API_URL}/${meetingId}`, {
        method: 'DELETE',
      })
      if (!response.ok) {
        throw new Error(`Delete request failed: ${response.status}`)
      }

      setMeetings((currentMeetings) =>
        currentMeetings.filter((meeting) => meeting.id !== meetingId),
      )
      if (selectedMeeting?.id === meetingId) {
        setSelectedMeeting(null)
      }
    } catch (deleteError) {
      setHistoryError(`Unable to delete the meeting: ${deleteError.message}`)
    } finally {
      setIsDeletingMeetingId(null)
    }
  }

  const searchMeetings = async (event) => {
    event?.preventDefault()
    const query = meetingSearchQuery.trim()
    if (!query) {
      setMeetingSearchResults(null)
      return
    }

    setIsSearchingMeetings(true)
    setHistoryError('')
    try {
      const response = await authenticatedFetch(
        `${MEETINGS_API_URL}/search?q=${encodeURIComponent(query)}`,
      )
      if (!response.ok) throw new Error(`Search request failed: ${response.status}`)
      const data = await response.json()
      setMeetingSearchResults(Array.isArray(data.results) ? data.results : [])
    } catch (searchError) {
      setHistoryError(`Unable to search meetings: ${searchError.message}`)
    } finally {
      setIsSearchingMeetings(false)
    }
  }

  const openNewMeeting = (nextMode) => {
    setIsNewMeetingOpen(false)
    handleModeChange(nextMode)
  }

  const sendAssistantMessage = async () => {
    const message = assistantInput.trim()
    if (!message || isAssistantThinking) return

    const history = assistantMessages
      .filter(
        (chatMessage) =>
          !chatMessage.isGreeting &&
          !chatMessage.isError &&
          (chatMessage.role === 'user' || chatMessage.role === 'assistant'),
      )
      .slice(-10)
      .map(({ role, content }) => ({ role, content }))
    const userMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: message,
    }

    setAssistantMessages((currentMessages) => [...currentMessages, userMessage])
    setAssistantInput('')
    setIsAssistantThinking(true)

    try {
      const response = await authenticatedFetch(ASSISTANT_CHAT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history }),
      })
      if (!response.ok) {
        throw new Error('Assistant request failed.')
      }

      const data = await response.json()
      if (typeof data.answer !== 'string' || !data.answer.trim()) {
        throw new Error('Assistant returned an invalid response.')
      }

      setAssistantMessages((currentMessages) => [
        ...currentMessages,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: data.answer,
          sources: Array.isArray(data.sources) ? data.sources : [],
        },
      ])
    } catch {
      setAssistantMessages((currentMessages) => [
        ...currentMessages,
        {
          id: `assistant-error-${Date.now()}`,
          role: 'assistant',
          content: "I couldn't answer that right now. Please try again.",
          isError: true,
        },
      ])
    } finally {
      setIsAssistantThinking(false)
    }
  }

  const handleAssistantKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      sendAssistantMessage()
    }
  }

  const renderMinutes = (minutes) => {
    if (!minutes) return null

    const keyPoints = Array.isArray(minutes.key_points) ? minutes.key_points : []
    const decisions = Array.isArray(minutes.decisions) ? minutes.decisions : []
    const actionItems = Array.isArray(minutes.action_items) ? minutes.action_items : []

    return (
      <div className="transcript-section">
        <h2>Meeting Summary</h2>
        <p>{minutes.summary || 'None identified.'}</p>

        <h2>Key Points</h2>
        {keyPoints.length > 0 ? (
          <ul>{keyPoints.map((point, index) => <li key={index}>{point}</li>)}</ul>
        ) : (
          <p>None identified.</p>
        )}

        <h2>Decisions</h2>
        {decisions.length > 0 ? (
          <ul>{decisions.map((decision, index) => <li key={index}>{decision}</li>)}</ul>
        ) : (
          <p>None identified.</p>
        )}

        <h2>Action Items</h2>
        {actionItems.length > 0 ? (
          <ul>
            {actionItems.map((item, index) => (
              <li key={index}>
                <p>Task: {item.task}</p>
                <p>Owner: {item.owner}</p>
                <p>Deadline: {item.deadline}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p>None identified.</p>
        )}
      </div>
    )
  }

  const renderMeetingWorkspace = () => {
    if (isLoadingSelectedMeeting) {
      return <p className="workspace-loading">Loading meeting...</p>
    }
    if (!selectedMeeting) return null

    const minutes = selectedMeeting.minutes
    const decisions = Array.isArray(minutes?.decisions) ? minutes.decisions : []
    const actionItems = Array.isArray(minutes?.action_items) ? minutes.action_items : []

    return (
      <section className="meeting-workspace">
        <button className="back-link" onClick={() => setSelectedMeeting(null)}>← Meetings</button>
        <header className="meeting-workspace-header">
          <div><span className={`type-badge ${selectedMeeting.type}`}>{selectedMeeting.type}</span><h2>{selectedMeeting.title}</h2><p>{new Date(selectedMeeting.created_at).toLocaleString()}</p></div>
          <button className="delete-button" onClick={() => deleteMeeting(selectedMeeting.id)} disabled={isDeletingMeetingId === selectedMeeting.id}>{isDeletingMeetingId === selectedMeeting.id ? 'Deleting...' : 'Delete meeting'}</button>
        </header>
        <div className="meeting-tabs" role="tablist" aria-label="Meeting content">
          {['overview', 'transcript', 'minutes'].map((tab) => <button key={tab} role="tab" aria-selected={activeMeetingTab === tab} className={activeMeetingTab === tab ? 'active' : ''} onClick={() => setActiveMeetingTab(tab)}>{tab}</button>)}
        </div>
        {activeMeetingTab === 'overview' && <div className="meeting-overview">
          <section><p className="section-label">SUMMARY</p><p>{minutes?.summary || 'No generated summary is available for this meeting.'}</p></section>
          {decisions.length > 0 && <section><p className="section-label">KEY DECISIONS</p><ul>{decisions.map((decision, index) => <li key={index}>{decision}</li>)}</ul></section>}
          {actionItems.length > 0 && <section><p className="section-label">ACTION ITEMS</p><ul>{actionItems.map((item, index) => <li key={index}><strong>{item.task}</strong><span>{item.owner} · {item.deadline}</span></li>)}</ul></section>}
          <section className="meeting-information"><p className="section-label">MEETING INFORMATION</p><dl><div><dt>Type</dt><dd>{selectedMeeting.type}</dd></div><div><dt>Created</dt><dd>{new Date(selectedMeeting.created_at).toLocaleString()}</dd></div></dl></section>
        </div>}
        {activeMeetingTab === 'transcript' && <section className="meeting-transcript"><p>{selectedMeeting.transcript}</p></section>}
        {activeMeetingTab === 'minutes' && <div className="workspace-minutes">{minutes ? renderMinutes(minutes) : <p>No generated minutes are available for this meeting.</p>}</div>}
      </section>
    )
  }

  const renderAssistantSources = (sources) => {
    if (!Array.isArray(sources) || sources.length === 0) return null

    const seenMeetingIds = new Set()
    const uniqueSources = sources.filter((source) => {
      if (!source.meeting_id || seenMeetingIds.has(source.meeting_id)) return false
      seenMeetingIds.add(source.meeting_id)
      return true
    })

    if (uniqueSources.length === 0) return null

    return (
      <div className="assistant-sources">
        <p>Sources</p>
        <ul>
          {uniqueSources.map((source) => (
            <li key={source.meeting_id}>
              <button onClick={() => selectMeeting(source.meeting_id)}>
                {source.meeting_title || 'Untitled meeting'} ({source.meeting_type || 'meeting'})
                {source.meeting_date && ` — ${new Date(source.meeting_date).toLocaleString()}`}
              </button>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  const isBusy = status === 'Connecting' || status === 'Stopping'
  const userDisplayName = session.user.user_metadata?.full_name || session.user.email
  const userFirstName = userDisplayName?.split(' ')[0] || 'there'
  const pageTitle = mode === 'dashboard' ? 'Dashboard' : mode === 'meetings' ? 'Meetings' : mode === 'minutes' ? 'Minutes' : mode === 'assistant' ? 'AI Assistant' : mode === 'online' ? 'Online Meeting' : mode === 'settings' ? 'Settings' : mode === 'live' ? 'Live Meeting' : 'Recorded Meeting'
  const meetingSource = meetingSearchResults || meetings
  const displayedMeetings = meetingSource.filter((meeting) => meetingFilter === 'all' || meeting.type === meetingFilter)
  const meetingsWithMinutes = meetings.filter((meeting) => meeting.minutes)

  return (
    <div className={`app-shell ${theme}`}>
      <aside className="sidebar">
        <div className="brand"><strong>MOA</strong><span>Minutes Operational<br />Assistant</span></div>
        <nav aria-label="Primary navigation">
          <p className="nav-label">Main</p>
          <button className={`nav-item ${mode === 'dashboard' ? 'active' : ''}`} onClick={() => handleModeChange('dashboard')}><Icon name="home" />Dashboard</button>
          <button className={`nav-item ${mode === 'meetings' ? 'active' : ''}`} onClick={() => handleModeChange('meetings')}><Icon name="clock" />Meetings</button>
          <button className={`nav-item ${mode === 'minutes' ? 'active' : ''}`} onClick={() => handleModeChange('minutes')}><Icon name="upload" />Minutes</button>
          <p className="nav-label">Intelligence</p>
          <button className={`nav-item ${mode === 'assistant' ? 'active' : ''}`} onClick={() => handleModeChange('assistant')}><Icon name="sparkles" />AI Assistant</button>
        </nav>
        <div className="sidebar-bottom">
          <button className={`nav-item ${mode === 'settings' ? 'active' : ''}`} onClick={() => handleModeChange('settings')}><Icon name="settings" />Settings</button>
          <div className="sidebar-profile"><span>{userFirstName.charAt(0).toUpperCase()}</span><div><strong>{userDisplayName}</strong><small>Workspace member</small></div></div>
        </div>
      </aside>
      <main className="main-content">
      <header className="topbar"><div><p className="eyebrow">MINUTES OPERATIONAL ASSISTANT</p><h1>{pageTitle}</h1></div>
      <div className="topbar-actions">
        {mode === 'dashboard' && <button className="dashboard-new-meeting primary-button" onClick={() => setIsNewMeetingOpen(true)}>+ New Meeting</button>}
        <button className="icon-button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Toggle color theme"><Icon name={theme === 'dark' ? 'sun' : 'moon'} /></button>
        <div className="profile-menu-wrap"><button className="profile-trigger" onClick={() => setIsProfileMenuOpen((open) => !open)} aria-expanded={isProfileMenuOpen}><span>{userFirstName.charAt(0).toUpperCase()}</span><strong>{userDisplayName}</strong></button>{isProfileMenuOpen && <div className="profile-menu"><p>Signed in as<br /><strong>{userDisplayName}</strong></p><button onClick={handleSignOutClick}><Icon name="logout" />Sign out</button></div>}</div>
      </div></header>
      {authError && <p className="error">{authError}</p>}

      {mode === 'dashboard' ? (
        <section className="dashboard"><div className="dashboard-hero"><p className="eyebrow">YOUR WORKSPACE</p><h2>Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, {userFirstName}.</h2><p>Your meetings, decisions and conversations — organized in one place.</p></div><section className="dashboard-capture"><div><p className="section-label">START A MEETING</p><h2>Capture the conversation while it matters.</h2></div><div className="quick-actions"><button onClick={() => handleModeChange('live')}><Icon name="mic" /><strong>Start Live Meeting</strong><span>Transcribe as the conversation happens.</span><Icon name="chevron" /></button><button onClick={() => handleModeChange('recorded')}><Icon name="upload" /><strong>Upload Recording</strong><span>Turn an existing recording into structured notes.</span><Icon name="chevron" /></button></div></section><div className="dashboard-grid"><div className="recent-meetings"><div><div><p className="section-label">RECENT ACTIVITY</p><h2>Recent meetings</h2></div><button onClick={() => handleModeChange('history')}>View all</button></div>{meetings.slice(0, 3).map((meeting) => <button key={meeting.id} onClick={() => selectMeeting(meeting.id)}><span><strong>{meeting.title}</strong><small>{new Date(meeting.created_at).toLocaleString()}</small></span><span className={`type-badge ${meeting.type}`}>{meeting.type}</span><Icon name="chevron" /></button>)}</div><div className="assistant-cta"><p>ASK MOA</p><h2>Ask questions across your meeting knowledge.</h2><span>Search decisions, conversations, and the details that matter.</span><button onClick={() => handleModeChange('assistant')}>Open Assistant <Icon name="chevron" /></button></div></div></section>
      ) : mode === 'meetings' ? (
        selectedMeeting ? renderMeetingWorkspace() : <section className="meetings-hub"><header className="page-header"><div><h2>Meetings</h2><p>Capture, review and manage your conversations.</p></div><button className="primary-button" onClick={() => setIsNewMeetingOpen(true)}>+ New Meeting</button></header><form className="meeting-search" onSubmit={searchMeetings}><input value={meetingSearchQuery} onChange={(event) => { setMeetingSearchQuery(event.target.value); if (!event.target.value.trim()) setMeetingSearchResults(null) }} placeholder="Search your meetings" aria-label="Search meetings" /><button type="submit" disabled={isSearchingMeetings}>{isSearchingMeetings ? 'Searching...' : 'Search'}</button></form><div className="meeting-filters" role="group" aria-label="Meeting type filters">{[['all', 'All'], ['live', 'Live'], ['recorded', 'Recorded'], ['online', 'Online']].map(([filter, label]) => <button key={filter} className={meetingFilter === filter ? 'active' : ''} onClick={() => setMeetingFilter(filter)}>{label}</button>)}</div><div className="meeting-list">{isLoadingMeetings ? <p>Loading meetings...</p> : displayedMeetings.length === 0 ? <p>{meetingFilter === 'online' ? 'Online Meeting records will appear here once the feature is available.' : 'No meetings match this view.'}</p> : displayedMeetings.map((meeting) => <button className="meeting-row" key={meeting.id} onClick={() => selectMeeting(meeting.id)}><span><strong>{meeting.title}</strong><small>{new Date(meeting.created_at).toLocaleString()}</small></span><span className={`type-badge ${meeting.type}`}>{meeting.type}</span><Icon name="chevron" /></button>)}</div>{historyError && <p className="error">{historyError}</p>}</section>
      ) : mode === 'minutes' ? (
        <section className="minutes-hub"><header className="page-header"><div><h2>Minutes</h2><p>Review the decisions and next steps from your saved meetings.</p></div><button className="primary-button" onClick={() => setIsNewMeetingOpen(true)}>+ New Meeting</button></header><div className="meeting-list">{isLoadingMeetings ? <p>Loading minutes...</p> : meetingsWithMinutes.length === 0 ? <p>No generated minutes are available yet.</p> : meetingsWithMinutes.map((meeting) => <button className="meeting-row minutes-row" key={meeting.id} onClick={() => selectMeeting(meeting.id, 'minutes')}><span><strong>{meeting.title}</strong><small>{meeting.minutes?.summary || 'Generated meeting minutes'}</small></span><span className={`type-badge ${meeting.type}`}>{meeting.type}</span><small>{new Date(meeting.created_at).toLocaleDateString()}</small><Icon name="chevron" /></button>)}</div></section>
      ) : mode === 'online' ? (
        <section className="online-meeting-view"><header><p className="eyebrow">ONLINE MEETING</p><h2>Capture shared meeting audio</h2><p>Share the browser tab containing your meeting and make sure tab audio is enabled.</p></header><div className={`online-capture-state ${onlineStatus.toLowerCase()}`}><span></span><p>{onlineStatus === 'Capturing' ? 'Capturing shared meeting audio' : onlineStatus}</p></div><button className="primary-button online-capture-button" onClick={handleOnlineRecordingToggle} disabled={onlineStatus === 'Connecting' || onlineStatus === 'Stopping'}>{isOnlineCapturing || onlineStatus === 'Stopping' ? 'Stop Online Meeting' : 'Start Online Meeting'}</button><p className="online-capture-hint">For best results, use Chrome or Edge and share the meeting tab with audio.</p>{(onlineTranscript || onlineInterimTranscript) && <div className="transcript-section"><h2>Transcript</h2>{onlineTranscript && <p>{onlineTranscript}</p>}{onlineInterimTranscript && <p className="transcribing">{onlineInterimTranscript}</p>}</div>}{onlineStatus === 'Finished' && onlineTranscript.trim() && <div className="meeting-complete-actions"><button onClick={() => generateMinutes('online', onlineTranscript)} disabled={isGeneratingMinutes}>Generate Minutes</button><button onClick={() => saveMeeting('online', onlineTranscript, onlineMinutes)} disabled={isGeneratingMinutes || isSavingMeeting}>Save Meeting</button></div>}{isGeneratingMinutes && <p className="transcribing">Generating Minutes...</p>}{renderMinutes(onlineMinutes)}</section>
      ) : mode === 'settings' ? (
        <div className="transcript-section"><h2>Appearance</h2><p>Choose the theme that is most comfortable for you.</p><button onClick={() => setTheme('light')}>Light</button><button onClick={() => setTheme('dark')}>Dark</button></div>
      ) : mode === 'history' ? (
        null
      ) : mode === 'live' ? (
        <>
          <p className="status">{status}</p>
          <button onClick={handleRecordingToggle} className="record-button">
            {isRecording || isBusy ? 'Stop Recording' : 'Start Recording'}
          </button>

          {(transcript || interimTranscript) && (
            <div className="transcript-section">
              <h2>Transcript</h2>
              {transcript && <p>{transcript}</p>}
              {interimTranscript && <p className="transcribing">{interimTranscript}</p>}
            </div>
          )}
          {status === 'Ready' && transcript.trim() && (
            <>
              <button
                onClick={() => generateMinutes('live', transcript)}
                disabled={isGeneratingMinutes}
              >
                Generate Minutes
              </button>
              <button
                onClick={() => saveMeeting('live', transcript, liveMinutes)}
                disabled={isGeneratingMinutes || isSavingMeeting}
              >
                Save Meeting
              </button>
            </>
          )}
          {isGeneratingMinutes && <p className="transcribing">Generating Minutes...</p>}
          {renderMinutes(liveMinutes)}
        </>
      ) : mode === 'recorded' ? (
        <div className="transcript-section">
          <input type="file" accept="audio/*,video/*,.webm,.mkv" onChange={handleFileSelection} />
          {selectedFile && <p>Selected file: {selectedFile.name}</p>}
          <button
            onClick={transcribeRecording}
            disabled={!selectedFile || isTranscribingRecording}
          >
            Transcribe Recording
          </button>
          {isTranscribingRecording && <p className="transcribing">Transcribing...</p>}
          {recordedTranscript && (
            <>
              <h2>Transcript</h2>
              <p>{recordedTranscript}</p>
              <button
                onClick={() => generateMinutes('recorded', recordedTranscript)}
                disabled={isGeneratingMinutes}
              >
                Generate Minutes
              </button>
              <button
                onClick={() => saveMeeting('recorded', recordedTranscript, recordedMinutes)}
                disabled={isGeneratingMinutes || isSavingMeeting}
              >
                Save Meeting
              </button>
            </>
          )}
          {isGeneratingMinutes && <p className="transcribing">Generating Minutes...</p>}
          {renderMinutes(recordedMinutes)}
        </div>
      ) : (
        <div className="transcript-section assistant-workspace">
          <h2>AI Assistant</h2>
          <div aria-live="polite">
            {assistantMessages.map((chatMessage) => (
              <div key={chatMessage.id} className={`assistant-message ${chatMessage.role}${chatMessage.isGreeting ? ' greeting' : ''}`}>
                <p>
                  <strong>{chatMessage.role === 'user' ? 'You' : 'Assistant'}:</strong>{' '}
                  {chatMessage.content}
                </p>
                {chatMessage.role === 'assistant' && renderAssistantSources(chatMessage.sources)}
              </div>
            ))}
            {isAssistantThinking && <p className="transcribing">Thinking...</p>}
          </div>
          <textarea
            value={assistantInput}
            onChange={(event) => setAssistantInput(event.target.value)}
            onKeyDown={handleAssistantKeyDown}
            placeholder="Ask about your indexed meetings..."
            rows="3"
            disabled={isAssistantThinking}
          />
          <button
            onClick={sendAssistantMessage}
            disabled={isAssistantThinking || !assistantInput.trim()}
          >
            Send
          </button>
        </div>
      )}

      {error && <p className="error">{error}</p>}

      {isNewMeetingOpen && <div className="modal-backdrop" role="presentation" onMouseDown={() => setIsNewMeetingOpen(false)}><section className="new-meeting-modal" role="dialog" aria-modal="true" aria-labelledby="new-meeting-title" onMouseDown={(event) => event.stopPropagation()}><header><div><p className="section-label">CREATE A MEETING</p><h2 id="new-meeting-title">New Meeting</h2></div><button className="icon-button" onClick={() => setIsNewMeetingOpen(false)} aria-label="Close new meeting selector">×</button></header><button className="meeting-mode-option" onClick={() => openNewMeeting('live')}><Icon name="mic" /><span><strong>Live Meeting</strong><small>Start an in-person meeting and transcribe it as it happens.</small></span><Icon name="chevron" /></button><button className="meeting-mode-option" onClick={() => openNewMeeting('recorded')}><Icon name="upload" /><span><strong>Recorded Meeting</strong><small>Upload an existing audio or video recording.</small></span><Icon name="chevron" /></button><button className="meeting-mode-option" onClick={() => openNewMeeting('online')}><Icon name="video" /><span><strong>Online Meeting</strong><small>Capture audio from a browser-based meeting.</small></span><Icon name="chevron" /></button></section></div>}

      {mode === 'history' && <div className="transcript-section history-section">
        <h2>Meeting History</h2>
        {isLoadingMeetings ? (
          <p>Loading meeting history...</p>
        ) : meetings.length === 0 ? (
          <p>No meetings saved yet.</p>
        ) : (
          <ul>
            {meetings.map((meeting) => (
              <li key={meeting.id}>
                <button onClick={() => selectMeeting(meeting.id)}>
                  {meeting.title} ({meeting.type}) — {new Date(meeting.created_at).toLocaleString()}
                </button>
                <button
                  onClick={() => deleteMeeting(meeting.id)}
                  disabled={isDeletingMeetingId === meeting.id}
                >
                  {isDeletingMeetingId === meeting.id ? 'Deleting...' : 'Delete'}
                </button>
              </li>
            ))}
          </ul>
        )}

        {historyError && <p className="error">{historyError}</p>}
        {isLoadingSelectedMeeting && <p>Loading selected meeting...</p>}

        {selectedMeeting && (
          <div>
            <h3>{selectedMeeting.title}</h3>
            <p>Type: {selectedMeeting.type}</p>
            <p>Created: {new Date(selectedMeeting.created_at).toLocaleString()}</p>
            <p>{selectedMeeting.transcript}</p>
            {renderMinutes(selectedMeeting.minutes)}
          </div>
        )}
      </div>}</main></div>
  )
}

function AuthScreen({ initialError = '' }) {
  const [isCreatingAccount, setIsCreatingAccount] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [authError, setAuthError] = useState(initialError)
  const [authMessage, setAuthMessage] = useState('')

  const handleEmailAuthentication = async (event) => {
    event.preventDefault()
    const trimmedEmail = email.trim()

    if (!trimmedEmail || !password) {
      setAuthError('Email and password are required.')
      return
    }
    if (isCreatingAccount && password !== confirmPassword) {
      setAuthError('Passwords do not match.')
      return
    }

    setIsSubmitting(true)
    setAuthError('')
    setAuthMessage('')

    try {
      if (isCreatingAccount) {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
        })
        if (signUpError) throw signUpError

        if (!data.session) {
          setAuthMessage('Check your email to confirm your account, then sign in.')
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password,
        })
        if (signInError) throw signInError
      }
    } catch {
      setAuthError(
        isCreatingAccount
          ? 'Unable to create your account. Please check your details and try again.'
          : 'Unable to sign in. Please check your email and password.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleGoogleSignIn = async () => {
    setIsSubmitting(true)
    setAuthError('')
    setAuthMessage('')

    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      })
      if (oauthError) throw oauthError
    } catch {
      setAuthError('Unable to start Google sign-in. Please try again.')
      setIsSubmitting(false)
    }
  }

  const switchAuthMode = (nextCreatingAccount) => {
    setIsCreatingAccount(nextCreatingAccount)
    setAuthError('')
    setAuthMessage('')
  }

  return (
    <div className="auth-shell">
      <section className="auth-brand-panel">
        <div className="auth-brand"><strong>MOA</strong><span>Minutes Operational Assistant</span></div>
        <div><p className="eyebrow">MEET WITH CLARITY</p><h1>Meetings shouldn&apos;t disappear when the conversation ends.</h1><p>Capture conversations, organize decisions, and turn your meetings into searchable knowledge.</p></div>
        <small>Capture <span>•</span> Organize <span>•</span> Ask <span>•</span> Remember</small>
      </section>
      <section className="auth-form-panel">
      <div className="auth-form-card">
        <p className="eyebrow">WELCOME TO MOA</p>
        <h2>{isCreatingAccount ? 'Create your account' : 'Sign in to your workspace'}</h2>
        <p className="auth-intro">{isCreatingAccount ? 'Start turning your meetings into organized knowledge.' : 'Continue where your conversations left off.'}</p>
        <div className="auth-tabs">
          <button
            type="button"
            onClick={() => switchAuthMode(false)}
            disabled={isSubmitting || !isCreatingAccount}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => switchAuthMode(true)}
            disabled={isSubmitting || isCreatingAccount}
          >
            Create Account
          </button>
        </div>
        <form onSubmit={handleEmailAuthentication} className="auth-form">
            <label>
              <span>Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
              />
            </label>
            <label>
              <span>Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={isCreatingAccount ? 'new-password' : 'current-password'}
              />
            </label>
          {isCreatingAccount && (
              <label>
                <span>Confirm password</span>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                />
              </label>
          )}
          <button type="submit" disabled={isSubmitting}>
            {isCreatingAccount ? 'Create Account' : 'Sign In'}
          </button>
        </form>
        <div className="auth-divider"><span>or continue with</span></div>
        <button className="google-button" type="button" onClick={handleGoogleSignIn} disabled={isSubmitting}>
          Continue with Google
        </button>
        {authMessage && <p className="status">{authMessage}</p>}
        {authError && <p className="error">{authError}</p>}
      </div>
      </section>
    </div>
  )
}

function App() {
  const [session, setSession] = useState(null)
  const [isCheckingSession, setIsCheckingSession] = useState(true)
  const [authError, setAuthError] = useState('')
  const [theme, setTheme] = useState(() => localStorage.getItem('moa_theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'))

  useEffect(() => {
    localStorage.setItem('moa_theme', theme)
  }, [theme])

  useEffect(() => {
    let isCurrent = true

    const loadSession = async () => {
      try {
        const { data, error: sessionError } = await supabase.auth.getSession()
        if (!isCurrent) return

        if (sessionError) {
          setAuthError('Unable to check your sign-in status. Please try again.')
        } else {
          setSession(data.session)
        }
      } catch {
        if (isCurrent) {
          setAuthError('Unable to check your sign-in status. Please try again.')
        }
      } finally {
        if (isCurrent) {
          setIsCheckingSession(false)
        }
      }
    }

    loadSession()
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (isCurrent) {
        setSession(nextSession)
        setAuthError('')
        setIsCheckingSession(false)
      }
    })

    return () => {
      isCurrent = false
      subscription.unsubscribe()
    }
  }, [])

  const handleSignOut = async () => {
    try {
      const { error: signOutError } = await supabase.auth.signOut()
      if (signOutError) {
        setAuthError('Unable to sign out. Please try again.')
        return
      }
      setSession(null)
    } catch {
      setAuthError('Unable to sign out. Please try again.')
    }
  }

  if (isCheckingSession) {
    return (
      <div className="container">
        <p>Checking your session...</p>
      </div>
    )
  }

  if (!session) {
    return <AuthScreen initialError={authError} />
  }

  return <MainApplication session={session} onSignOut={handleSignOut} authError={authError} theme={theme} setTheme={setTheme} />
}

export default App
