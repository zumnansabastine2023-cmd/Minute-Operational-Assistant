import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import './ProductDesign.css'
import './VisualExperience.css'
import './VisualLock.css'
import { MeetingRow, SectionHeader, MemoryDecisions } from './ExperiencePrimitives'
import { DuneMotif, MoaCompanion } from './BrandArtwork'
import Settings from './Settings'
import { readLastWorkspace, writeLastWorkspace, recordingPreferences } from './workspacePreferences'
import { supabase } from './supabaseClient'
import { appendLiveSpeakerTurns, selectMeetingTranscript } from './liveSpeakerTurns'
import SpeakerTranscript from './SpeakerTranscript'
import MinutesEditor from './MinutesEditor'
import WeeklySummary from './WeeklySummary'
import AskMoaSync from './AskMoaSync'
import SpeakerModeSelector from './SpeakerModeSelector'
import { resetSpeakerMode, speakerSocketUrl } from './speakerModes'
import { signOutAccount } from './accountSession'
import { readOnboarding, writeOnboarding } from './onboarding'
import WorkspaceOnboarding from './WorkspaceOnboarding'
import WorkspacePicker from './WorkspacePicker'
import { CompanyDashboard, CompanyActions } from './CompanyViews'
import './CompanyWorkspace.css'
import { availableWorkspace, canManageWorkspace, meetingBelongsToWorkspace, workspaceKey, workspaceRequest, workspaceUrl } from './workspaceScope'
import OutputTools from './OutputTools'
import { filterMeetings } from './meetingFilters'
import { recorderIsActive, releaseCaptureResources } from './captureLifecycle'
import { parseRecordingJob, pollRecordingJob, storedRecordingJob, storedRecordingLanguage, storedRecordingMode } from './recordingJobs'
import { DEFAULT_RECORDED_LANGUAGE, RECORDED_LANGUAGES, recordedLanguage, recordedTranscriptMetadata } from './languageConfig'
import { companyData } from './companyData'
import { normalizeMinutes, isMinutesResponse, isMeetingResponse } from './minutesData'

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000')
  .replace(/\/+$/, '')
const WEBSOCKET_BASE_URL = API_BASE_URL
  .replace(/^https:/i, 'wss:')
  .replace(/^http:/i, 'ws:')
const TRANSCRIPTION_SOCKET_URL = `${WEBSOCKET_BASE_URL}/ws/transcribe`
const RECORDED_TRANSCRIPTION_URL = `${API_BASE_URL}/transcription-jobs`
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
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  }
  return <svg {...commonProps}>{paths[name] || paths.home}</svg>
}

function MoaMark({ size = 42 }) {
  return (
    <svg className="moa-mark" width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="moa-ribbon-a" x1="7" y1="8" x2="26" y2="39" gradientUnits="userSpaceOnUse"><stop stopColor="#A7F3D0" /><stop offset=".52" stopColor="#10B981" /><stop offset="1" stopColor="#087553" /></linearGradient>
        <linearGradient id="moa-ribbon-b" x1="41" y1="8" x2="22" y2="39" gradientUnits="userSpaceOnUse"><stop stopColor="#D4FAE6" /><stop offset=".42" stopColor="#45D99A" /><stop offset="1" stopColor="#0B7A57" /></linearGradient>
        <filter id="moa-ribbon-shadow" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="2" stdDeviation="1.8" floodColor="#063E2C" floodOpacity=".2" /></filter>
      </defs>
      <g filter="url(#moa-ribbon-shadow)">
        <path d="M7.5 36V13.2c0-2.8 3.4-4.1 5.3-2.1L25 23.8l-5 6.1-5.4-5.7V36c0 2-1.6 3.5-3.5 3.5S7.5 38 7.5 36Z" fill="url(#moa-ribbon-a)" />
        <path d="M40.5 36V13.2c0-2.8-3.4-4.1-5.3-2.1L20 26.9l5 6.1 8.4-8.8V36c0 2 1.6 3.5 3.5 3.5s3.6-1.5 3.6-3.5Z" fill="url(#moa-ribbon-b)" />
        <path d="m20 26.9 5 6.1 4.7-4.9-4.8-6.2-4.9 5Z" fill="#0A8C61" fillOpacity=".72" />
        <path d="M10.9 10.2c.7 0 1.4.3 1.9.9L25 23.8l-2.5 3.1-12-12.4c-1.7-1.8-1.2-3.8.4-4.3Z" fill="#E4FFF0" fillOpacity=".38" />
      </g>
    </svg>
  )
}

function AssistantMascot({ size = 48, state = 'idle' }) {
  return <MoaCompanion size={size} state={state} />
}

async function authenticatedFetch(url, options = {}) {
  const { expectedUserId, ...fetchOptions } = options
  const {
    data: { session },
  } = await supabase.auth.getSession()
  options.signal?.throwIfAborted()
  if (!session?.access_token || (expectedUserId && expectedUserId !== session.user.id)) {
    throw new Error('Your session is no longer valid. Please sign in again.')
  }

  const response = await fetch(url, {
    ...fetchOptions,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${session.access_token}`,
    },
  })
  if (response.status === 401) {
    throw new Error('Your session is no longer valid. Please sign in again.')
  }
  if (response.status === 429) {
    throw new Error('The service is busy or the request limit was reached. Please wait a minute and retry.')
  }
  return response
}

function WorkspaceApplication(props) {
  const [onboarding, setOnboarding] = useState(() => readOnboarding(props.session.user.email))
  const finishOnboarding = () => { writeOnboarding(null); setOnboarding(null) }
  const [organizations, setOrganizations] = useState([])
  const [selectedId, setSelectedId] = useState(() => readLastWorkspace(props.session.user.id))
  const [workspaceReady, setWorkspaceReady] = useState(false)
  const [workspaceError, setWorkspaceError] = useState('')
  const active = useRef(true)
  const companyController = useRef(null)
  const refreshCompanies = useCallback(async () => {
    companyController.current?.abort()
    const controller = new AbortController()
    companyController.current = controller
    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/organizations`, { signal: controller.signal, expectedUserId: props.session.user.id })
      if (!response.ok) throw new Error('Unable to load company workspaces. Personal is still available.')
      const companies = await response.json()
      if (!Array.isArray(companies) || !companies.every(company => typeof company.id === 'string' && typeof company.name === 'string' && ['admin', 'member'].includes(company.role))) throw new Error('Invalid workspace response. Please retry.')
      if (!active.current || controller.signal.aborted) return
      setOrganizations(companies)
      setSelectedId(current => availableWorkspace(current, companies)?.id || '')
      setWorkspaceError('')
      setWorkspaceReady(true)
    } catch (error) {
      if (active.current && !controller.signal.aborted) { setWorkspaceError(error.message); setSelectedId(''); setWorkspaceReady(true) }
    }
  }, [props.session.user.id])
  useEffect(() => {
    active.current = true
    queueMicrotask(() => { if (active.current) refreshCompanies() })
    window.addEventListener('focus', refreshCompanies)
    return () => { active.current = false; companyController.current?.abort(); window.removeEventListener('focus', refreshCompanies) }
  }, [refreshCompanies])
  useEffect(() => { if (workspaceReady) writeLastWorkspace(props.session.user.id, selectedId) }, [selectedId, workspaceReady, props.session.user.id])
  const accessChanged = useCallback(() => {
    setSelectedId('')
    setWorkspaceError('Company access changed. You have returned to Personal.')
    refreshCompanies()
  }, [refreshCompanies])
  const workspace = availableWorkspace(selectedId, organizations)
  const selectWorkspace = id => {
    if (id === selectedId) return
    if (!window.confirm('Switch workspace? Unsaved drafts will be cleared and active capture will stop.')) return
    setSelectedId(availableWorkspace(id, organizations)?.id || '')
  }
  const organizationRequest = useCallback((suffix, options) => authenticatedFetch(`${API_BASE_URL}/organizations${suffix}`, { ...options, expectedUserId: props.session.user.id }), [props.session.user.id])
  const picker = <WorkspacePicker showMemberships={!onboarding} initialForm={['create', 'join'].includes(onboarding) ? onboarding : ''} workspace={workspace} organizations={organizations} onSelect={selectWorkspace}
    error={workspaceError} request={organizationRequest}
    onCreated={company => { if (!active.current) return; companyController.current?.abort(); setOrganizations(current => [...current.filter(item => item.id !== company.id), company]); setSelectedId(company.id); finishOnboarding() }} />
  if (!workspaceReady) return <main className="startup-status" role="status">Opening your workspace...</main>
  if (onboarding) return <WorkspaceOnboarding theme={props.theme} choice={onboarding} onChoose={setOnboarding} onPersonal={() => { setSelectedId(''); finishOnboarding() }} picker={picker} />
  return <ScopedApplication key={workspaceKey(props.session.user.id, workspace)} {...props}
    workspace={workspace} workspacePicker={picker} organizations={organizations} onSelectWorkspace={selectWorkspace} onAccessChanged={accessChanged} onWorkspaceUpdated={refreshCompanies} />
}

function ScopedApplication(props) {
  const controller = useRef(new AbortController())
  useLayoutEffect(() => {
    if (controller.current.signal.aborted) controller.current = new AbortController()
    return () => controller.current.abort()
  }, [])
  const request = useMemo(() => (...args) => workspaceRequest(authenticatedFetch, props.workspace,
    props.session.user.id, controller.current.signal, props.onAccessChanged)(...args),
  [props.workspace, props.session.user.id, props.onAccessChanged])
  return <MainApplication {...props} authenticatedFetch={request} />
}

export function MainApplication({ session, onSignOut, authError, theme, setTheme, workspace, workspacePicker, organizations, onSelectWorkspace, authenticatedFetch, onAccessChanged, onWorkspaceUpdated }) {
  const canManage = canManageWorkspace(workspace)
  const [editingMinutes, setEditingMinutes] = useState(false)
  const [assignees, setAssignees] = useState([])
  const [assigneeError, setAssigneeError] = useState('')
  useEffect(() => {
    if (!workspace || workspace.role !== 'admin') return
    const controller = new AbortController()
    authenticatedFetch(`${API_BASE_URL}/organizations/${workspace.id}/members`, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('Unable to load assignees. Reopen this workspace to retry.')
      const members = await response.json()
      if (!controller.signal.aborted) setAssignees(members)
    }).catch(error => { if (!controller.signal.aborted) setAssigneeError(error.message) })
    return () => controller.abort()
  }, [workspace, authenticatedFetch])
  const [notice, setNotice] = useState('')
  const [syncVersion, setSyncVersion] = useState(0)
  const [mode, setMode] = useState('dashboard')
  const [navigationOpen, setNavigationOpen] = useState(false)
  const navigationRef = useRef(null)
  const navigationTriggerRef = useRef(null)
  useEffect(() => {
    if (!navigationOpen) return
    const drawer = navigationRef.current
    const focusFrame = requestAnimationFrame(() => drawer?.querySelector('button')?.focus())
    const keydown = event => {
      if (event.key === 'Escape') { setNavigationOpen(false); navigationTriggerRef.current?.focus() }
      if (event.key === 'Tab') {
        const controls = [...drawer.querySelectorAll('button')].filter(node => node.getClientRects().length)
        const first = controls[0], last = controls.at(-1)
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }
    document.addEventListener('keydown', keydown)
    const desktop = window.matchMedia('(min-width: 761px)')
    const closeOnDesktop = event => { if (event.matches) setNavigationOpen(false) }
    desktop.addEventListener('change', closeOnDesktop)
    return () => { cancelAnimationFrame(focusFrame); document.removeEventListener('keydown', keydown); desktop.removeEventListener('change', closeOnDesktop) }
  }, [navigationOpen])
  const [editRequest, setEditRequest] = useState(0)
  const [isRecording, setIsRecording] = useState(false)
  const [status, setStatus] = useState('Ready')
  const [transcript, setTranscript] = useState('')
  const [liveSpeakerTurns, setLiveSpeakerTurns] = useState([])
  const [speakerNames, setSpeakerNames] = useState({ live: {}, online: {}, recorded: {} })
  const [speakerModes, setSpeakerModes] = useState(() => ({ live: recordingPreferences(session.user.id).speakerMode, online: recordingPreferences(session.user.id).speakerMode, recorded: storedRecordingJob(session.user.id, undefined, undefined, workspace?.id) ? storedRecordingMode(session.user.id, workspace?.id) : recordingPreferences(session.user.id).speakerMode }))
  const [interimTranscript, setInterimTranscript] = useState('')
  const [selectedFile, setSelectedFile] = useState(null)
  const [recordedTranscript, setRecordedTranscript] = useState('')
  const [recordedMetadata, setRecordedMetadata] = useState(null)
  const [recordedLanguageCode, setRecordedLanguageCode] = useState(() => storedRecordingJob(session.user.id, undefined, undefined, workspace?.id) ? storedRecordingLanguage(session.user.id, workspace?.id) : DEFAULT_RECORDED_LANGUAGE)
  const [recordedSpeakerTurns, setRecordedSpeakerTurns] = useState([])
  const [isTranscribingRecording, setIsTranscribingRecording] = useState(() => Boolean(storedRecordingJob(session.user.id, undefined, undefined, workspace?.id)))
  const [recordingJobId, setRecordingJobId] = useState(() => storedRecordingJob(session.user.id, undefined, undefined, workspace?.id))
  const [recordingProgress, setRecordingProgress] = useState('')
  const [recordingPollAttempt, setRecordingPollAttempt] = useState(0)
  const [liveMinutes, setLiveMinutes] = useState(null)
  const [recordedMinutes, setRecordedMinutes] = useState(null)
  const [onlineMinutes, setOnlineMinutes] = useState(null)
  const [onlineStatus, setOnlineStatus] = useState('Idle')
  const [isOnlineCapturing, setIsOnlineCapturing] = useState(false)
  const [onlineTranscript, setOnlineTranscript] = useState('')
  const [onlineSpeakerTurns, setOnlineSpeakerTurns] = useState([])
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
  const [appliedSearch, setAppliedSearch] = useState('')
  const [dateFilters, setDateFilters] = useState({ start: '', end: '', actionStatus: 'all' })
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
  const selectionAttemptRef = useRef(0)
  const profileMenuRef = useRef(null)
  const profileButtonRef = useRef(null)
  const accountActiveRef = useRef(true)

  useEffect(() => {
    accountActiveRef.current = true
    return () => { accountActiveRef.current = false }
  }, [])

  useEffect(() => {
    if (!isProfileMenuOpen) return
    const dismissOutside = (event) => {
      if (!profileMenuRef.current?.contains(event.target)) setIsProfileMenuOpen(false)
    }
    const dismissEscape = (event) => {
      if (event.key === 'Escape') {
        setIsProfileMenuOpen(false)
        profileButtonRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', dismissOutside)
    document.addEventListener('focusin', dismissOutside)
    document.addEventListener('keydown', dismissEscape)
    return () => {
      document.removeEventListener('pointerdown', dismissOutside)
      document.removeEventListener('focusin', dismissOutside)
      document.removeEventListener('keydown', dismissEscape)
    }
  }, [isProfileMenuOpen])

  useEffect(() => {
    const recorders = [mediaRecorderRef, onlineMediaRecorderRef]
    const streams = [streamRef, onlineDisplayStreamRef]
    const sockets = [webSocketRef, onlineWebSocketRef]
    const active = [isSessionActiveRef, isOnlineSessionActiveRef]
    return () => {
      active.forEach((ref) => { ref.current = false })
      releaseCaptureResources(recorders, streams, sockets)
    }
  }, [])

  useEffect(() => {
    let isCurrent = true

    const loadMeetings = async () => {
      try {
        const response = await authenticatedFetch(MEETINGS_API_URL)
        if (!response.ok) {
          throw new Error(`History request failed: ${response.status}`)
        }
        const loadedMeetings = await response.json()
        if (!Array.isArray(loadedMeetings) || !loadedMeetings.every((meeting) => isMeetingResponse(meeting) && meetingBelongsToWorkspace(meeting, workspace))) throw new Error('Meeting history returned an invalid workspace response. Please reload.')
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
  }, [authenticatedFetch, workspace])

  useEffect(() => {
    const warn = (event) => { if (editingMinutes) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [editingMinutes])

  useEffect(() => {
    if (!recordingJobId) return
    const controller = new AbortController()
    let terminal = false
    pollRecordingJob(
      (signal) => authenticatedFetch(`${RECORDED_TRANSCRIPTION_URL}/${recordingJobId}`, { signal }),
      (status) => { setRecordingProgress(status); terminal = status === 'Failed' }, controller.signal,
    ).then((data) => {
      if (!data || controller.signal.aborted) return
      setRecordedTranscript(data.transcript)
      setRecordedLanguageCode(data.metadata?.language?.code || storedRecordingLanguage(session.user.id, workspace?.id))
      setRecordedMetadata(recordedTranscriptMetadata(data, data.metadata?.language?.code || storedRecordingLanguage(session.user.id, workspace?.id)))
      const completedMode = data.speaker_mode === 'single' ? 'single' : 'multi'
      setSpeakerModes((previous) => ({ ...previous, recorded: completedMode }))
      setRecordedSpeakerTurns(completedMode === 'single' ? [] : appendLiveSpeakerTurns([], data.speaker_segments, data.transcript))
      setSpeakerNames((previous) => ({ ...previous, recorded: {} }))
      setRecordedMinutes(null)
      setRecordingProgress(data.transcript.trim() ? 'Completed' : 'Completed — no speech was detected.')
      setIsTranscribingRecording(false)
      storedRecordingJob(session.user.id, null, undefined, workspace?.id)
      setRecordingJobId(null)
    }).catch((error) => {
      if (controller.signal.aborted) return
      setError(error.message)
      setIsTranscribingRecording(false)
      setRecordingProgress('Unable to complete processing. Retry when ready.')
      if (terminal || error.message.includes('expired')) {
        storedRecordingJob(session.user.id, null, undefined, workspace?.id)
        setRecordingJobId(null)
      }
    }).finally(() => { if (!controller.signal.aborted) setIsTranscribingRecording(false) })
    return () => controller.abort()
  }, [recordingJobId, recordingPollAttempt, session.user.id, workspace?.id, authenticatedFetch])

  const releaseMicrophone = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }

  const stopRecording = () => {
    if (isStoppingRef.current) return
    if (!isSessionActiveRef.current && !isStoppingRef.current) return

    recordingAttemptRef.current += 1
    isSessionActiveRef.current = false
    isStoppingRef.current = true
    setStatus('Stopping')
    setInterimTranscript('')

    const mediaRecorder = mediaRecorderRef.current
    const willFinalizeRecorder = recorderIsActive(mediaRecorder)
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
    if (!canManage) return
    if (isSessionActiveRef.current || isStoppingRef.current || isGeneratingMinutes || isSavingMeeting || editingMinutes) return
    if (transcript && !window.confirm('Start a new Live Meeting? Save the current draft first if you need it.')) return

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
        releaseMicrophone()
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

      const socket = new WebSocket(workspaceUrl(speakerSocketUrl(TRANSCRIPTION_SOCKET_URL, speakerModes.live), workspace), ['access-token', session.access_token])
      webSocketRef.current = socket

      socket.onopen = () => {
        if (!isSessionActiveRef.current) {
          socket.close(1000, 'Recording was cancelled')
          return
        }

        try {
          mediaRecorder.start(AUDIO_CHUNK_INTERVAL_MS)
          setTranscript('')
          setLiveSpeakerTurns([])
          setLiveMinutes(null)
          setSpeakerNames((previous) => ({ ...previous, live: {} }))
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
        if (webSocketRef.current !== socket) return
        try {
          const message = JSON.parse(event.data)
          if (message?.type === 'transcript' && typeof message.text === 'string' && message.text.trim()) {
            if (message.is_final === true) {
              setTranscript((previous) =>
                previous ? `${previous} ${message.text}` : message.text,
              )
              if (speakerModes.live === 'multi') setLiveSpeakerTurns((previous) => appendLiveSpeakerTurns(
                previous, message.speaker_segments, message.text,
              ))
              setInterimTranscript('')
            } else {
              setInterimTranscript(message.text)
            }
          } else if (message?.type === 'error') {
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

      socket.onclose = (event) => {
        if (workspace && event.code === 1008) onAccessChanged()
        if (webSocketRef.current !== socket) return
        webSocketRef.current = null

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
    if (isOnlineStoppingRef.current) return
    if (!isOnlineSessionActiveRef.current && !isOnlineStoppingRef.current) return

    onlineAttemptRef.current += 1
    isOnlineSessionActiveRef.current = false
    isOnlineStoppingRef.current = true
    setOnlineStatus('Stopping')
    setOnlineInterimTranscript('')

    const recorder = onlineMediaRecorderRef.current
    if (recorderIsActive(recorder)) {
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
    if (!canManage) return
    if (isOnlineSessionActiveRef.current || isOnlineStoppingRef.current || isGeneratingMinutes || isSavingMeeting || editingMinutes) return
    if (onlineTranscript && !window.confirm('Start a new Online Meeting? Save the current draft first if you need it.')) return

    const attempt = onlineAttemptRef.current + 1
    onlineAttemptRef.current = attempt
    isOnlineSessionActiveRef.current = true
    setOnlineStatus('Connecting')
    setError('')
    setOnlineInterimTranscript('')

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

      if (onlineAttemptRef.current !== attempt || !isOnlineSessionActiveRef.current) return

      const socket = new WebSocket(workspaceUrl(speakerSocketUrl(TRANSCRIPTION_SOCKET_URL, speakerModes.online), workspace), ['access-token', activeSession.access_token])
      onlineWebSocketRef.current = socket

      socket.onopen = () => {
        if (onlineWebSocketRef.current !== socket || !isOnlineSessionActiveRef.current) {
          socket.close(1000, 'Online capture was cancelled')
          return
        }
        try {
          recorder.start(AUDIO_CHUNK_INTERVAL_MS)
          setOnlineTranscript('')
          setOnlineSpeakerTurns([])
          setOnlineMinutes(null)
          setSpeakerNames((previous) => ({ ...previous, online: {} }))
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
        if (onlineWebSocketRef.current !== socket) return
        try {
          const message = JSON.parse(event.data)
          if (message?.type === 'transcript' && typeof message.text === 'string' && message.text.trim()) {
            if (message.is_final === true) {
              setOnlineTranscript((previous) => previous ? `${previous} ${message.text}` : message.text)
              if (speakerModes.online === 'multi') setOnlineSpeakerTurns((previous) => appendLiveSpeakerTurns(previous, message.speaker_segments, message.text))
              setOnlineInterimTranscript('')
            } else {
              setOnlineInterimTranscript(message.text)
            }
          } else if (message?.type === 'error') {
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

      socket.onclose = (event) => {
        if (workspace && event.code === 1008) onAccessChanged()
        if (onlineWebSocketRef.current !== socket) return
        onlineWebSocketRef.current = null
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
    if (navigationOpen) { setNavigationOpen(false); navigationTriggerRef.current?.focus() }
    if (!canManage && ['live', 'online', 'recorded'].includes(nextMode)) return
    if (isSavingMeeting) return
    if (editingMinutes && !window.confirm('Discard unsaved minutes edits?')) return
    if (nextMode === mode) return
    setEditingMinutes(false)
    setEditRequest(0)
    if (nextMode === 'history') nextMode = 'meetings'
    if (nextMode === mode) return

    if (mode === 'live') {
      stopRecording()
    }
    if (mode === 'online') {
      stopOnlineMeeting()
    }
    setError('')
    selectionAttemptRef.current += 1
    setIsLoadingSelectedMeeting(false)
    setMode(nextMode)
    setNotice('')
  }

  const handleSignOutClick = () => {
    if (editingMinutes && !window.confirm('Discard unsaved minutes edits and sign out?')) return
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

    if (file.size === 0) return { valid: false, error: 'The selected file is empty.' }
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
    setError('')
  }

  const transcribeRecording = async () => {
    if (!canManage) return
    if (isTranscribingRecording || editingMinutes || isGeneratingMinutes) return
    if (recordingJobId) { setIsTranscribingRecording(true); setError(''); setRecordingPollAttempt((attempt) => attempt + 1); return }
    if (!selectedFile) return
    if (recordedTranscript && !window.confirm('Replace this recorded meeting draft when processing succeeds?')) return

    const validation = validateUploadFile(selectedFile)
    if (!validation.valid) {
      setError(validation.error)
      return
    }

    setIsTranscribingRecording(true)
    setRecordingProgress('Uploading recording…')
    setError('')

    try {
      const formData = new FormData()
      formData.append('file', selectedFile, selectedFile.name)
      formData.append('speaker_mode', speakerModes.recorded)
      formData.append('language', recordedLanguageCode)

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

      const job = parseRecordingJob(await response.json())
      if (!accountActiveRef.current) return
      storedRecordingJob(session.user.id, job.id, speakerModes.recorded, workspace?.id, recordedLanguageCode)
      setRecordingJobId(job.id)
      setRecordingProgress(job.status)
    } catch (uploadError) {
      setError(`Unable to transcribe the recording: ${uploadError.message}`)
      setRecordingProgress('Upload failed. Please retry.')
      setIsTranscribingRecording(false)
    }
  }

  const generateMinutes = async (meetingType, meetingTranscript) => {
    if (!canManage) return
    if (editingMinutes || (meetingType === 'recorded' && isTranscribingRecording)) { setError('Finish processing or apply your minutes edits first.'); return }
    const cleanedTranscript = selectMeetingTranscript(meetingType, meetingTranscript, liveSpeakerTurns, onlineSpeakerTurns, recordedSpeakerTurns, speakerNames, speakerModes).trim()
    if (!cleanedTranscript || isGeneratingMinutes) return

    if (({ live: liveMinutes, online: onlineMinutes, recorded: recordedMinutes })[meetingType]
      && !window.confirm('Replace the current minutes with newly generated minutes?')) return
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

      const payload = await response.json()
      if (!isMinutesResponse(payload)) throw new Error('The minutes response was invalid. Please retry.')
      const minutes = normalizeMinutes(payload)
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
    if (!canManage) return
    if (editingMinutes || (meetingType === 'recorded' && isTranscribingRecording)) { setError('Finish processing or apply your minutes edits first.'); return }
    const cleanedTranscript = selectMeetingTranscript(meetingType, meetingTranscript, liveSpeakerTurns, onlineSpeakerTurns, recordedSpeakerTurns, speakerNames, speakerModes).trim()
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
          ...(meetingType === 'recorded' && recordedMetadata ? { transcript_metadata: recordedMetadata } : {}),
          minutes,
        }),
      })
      if (!response.ok) {
        throw new Error(`Save request failed: ${response.status}`)
      }

      const savedMeeting = await response.json()
      if (!isMeetingResponse(savedMeeting) || !meetingBelongsToWorkspace(savedMeeting, workspace)) throw new Error('Invalid workspace save response. Check your meeting history before retrying.')
      setMeetings((currentMeetings) => [savedMeeting, ...currentMeetings])
      setSelectedMeeting(savedMeeting)
      setNotice(savedMeeting.indexed === false ? 'Meeting saved successfully. Ask MOA could not update its knowledge. Open the saved meeting to retry sync.' : 'Meeting saved.')
    } catch (saveError) {
      setError(`Unable to save the meeting: ${saveError.message}`)
    } finally {
      setIsSavingMeeting(false)
    }
  }

  const selectMeeting = async (meetingId, tab = 'overview') => {
    if (isSavingMeeting || isDeletingMeetingId) return
    if (editingMinutes && !window.confirm('Discard unsaved minutes edits?')) return
    setEditingMinutes(false)
    const attempt = ++selectionAttemptRef.current
    setIsLoadingSelectedMeeting(true)
    setHistoryError('')
    setActiveMeetingTab(tab)

    try {
      const response = await authenticatedFetch(`${MEETINGS_API_URL}/${meetingId}`)
      if (!response.ok) {
        throw new Error(`Meeting request failed: ${response.status}`)
      }
      const loaded = await response.json()
      if (!isMeetingResponse(loaded) || !meetingBelongsToWorkspace(loaded, workspace)) throw new Error('Invalid workspace meeting response. Please retry.')
      if (selectionAttemptRef.current !== attempt) return
      setEditRequest(0)
      setSelectedMeeting(loaded)
      setNotice('')
      setMode('meetings')
    } catch (meetingLoadError) {
      if (selectionAttemptRef.current === attempt) setHistoryError(`Unable to load the selected meeting: ${meetingLoadError.message}`)
    } finally {
      if (selectionAttemptRef.current === attempt) setIsLoadingSelectedMeeting(false)
    }
  }

  const deleteMeeting = async (meetingId) => {
    if (isDeletingMeetingId || !window.confirm('Delete this meeting permanently?')) return

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

  const searchMeetings = (event) => {
    event?.preventDefault()
    setAppliedSearch(meetingSearchQuery.trim())
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

  const speakerModeLocked = (type) => isGeneratingMinutes || isSavingMeeting || editingMinutes
    || (type === 'live' && (isRecording || ['Connecting', 'Stopping'].includes(status)))
    || (type === 'online' && (isOnlineCapturing || ['Connecting', 'Stopping'].includes(onlineStatus)))
    || (type === 'recorded' && (isTranscribingRecording || Boolean(recordingJobId)))

  const changeSpeakerMode = (type, value) => {
    if (speakerModeLocked(type) || value === speakerModes[type]) return
    const fresh = resetSpeakerMode(value)
    setSpeakerModes((previous) => ({ ...previous, [type]: fresh.mode }))
    setSpeakerNames((previous) => ({ ...previous, [type]: fresh.names }))
    ;({ live: setLiveSpeakerTurns, online: setOnlineSpeakerTurns, recorded: setRecordedSpeakerTurns })[type](fresh.turns)
    ;({ live: setLiveMinutes, online: setOnlineMinutes, recorded: setRecordedMinutes })[type](fresh.minutes)
  }

  const renderSpeakerMode = (type) => <SpeakerModeSelector value={speakerModes[type]}
    disabled={speakerModeLocked(type)} onChange={(value) => changeSpeakerMode(type, value)}
    hasTranscript={Boolean(({ live: transcript, online: onlineTranscript, recorded: recordedTranscript })[type])} />

  const renderTranscript = (type, turns, text) => (
    <div key={type}><SpeakerTranscript key={speakerModes[type]} turns={speakerModes[type] === 'single' ? [] : turns} transcript={text} names={speakerNames[type]}
      disabled={isGeneratingMinutes || isSavingMeeting}
      onRename={(speaker, name) => setSpeakerNames((previous) => ({ ...previous, [type]: { ...previous[type], [speaker]: name } }))}
      onReset={(speaker) => setSpeakerNames((previous) => ({ ...previous, [type]: { ...previous[type], [speaker]: null } }))} />
      <OutputTools title={`${type[0].toUpperCase()}${type.slice(1)} Meeting draft`} date={new Date().toISOString()}
        transcript={selectMeetingTranscript(type, text, liveSpeakerTurns, onlineSpeakerTurns, recordedSpeakerTurns, speakerNames, speakerModes)}
        minutes={({ live: liveMinutes, online: onlineMinutes, recorded: recordedMinutes })[type]} disabled={editingMinutes || isGeneratingMinutes} />
    </div>
  )

  const updateSavedMinutes = async (minutes, title) => {
    setIsSavingMeeting(true)
    try {
      const response = await authenticatedFetch(`${MEETINGS_API_URL}/${selectedMeeting.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, minutes, expected_revision: selectedMeeting.revision }),
      })
      if (!response.ok) throw new Error(response.status === 409
        ? 'This meeting changed elsewhere. Keep a copy of your draft, then reopen the meeting.'
        : 'Unable to save changes. Please retry.')
      const updated = await response.json()
      if (!isMeetingResponse(updated) || !meetingBelongsToWorkspace(updated, workspace)) throw new Error('Invalid workspace save response. Keep your draft and reopen the meeting to check whether it was saved.')
      setSelectedMeeting(updated)
      setSyncVersion((version) => version + 1)
      setMeetings((items) => items.map((item) => item.id === updated.id ? updated : item))
      setNotice('Changes saved.')
    } finally { setIsSavingMeeting(false) }
  }

  const updateActionStatus = async action => {
    const response = await authenticatedFetch(`${MEETINGS_API_URL}/${action.meetingId}/actions/${action.index}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expected_revision: action.revision, status: action.status === 'Completed' ? 'Open' : 'Completed' }),
    })
    const updated = await response.json()
    if (!response.ok) throw new Error(typeof updated.detail === 'string' ? updated.detail : 'Unable to update action.')
    if (!isMeetingResponse(updated) || !meetingBelongsToWorkspace(updated, workspace)) throw new Error('Invalid action response. Reopen the source meeting.')
    setMeetings(current => current.map(meeting => meeting.id === updated.id ? updated : meeting))
    setSelectedMeeting(current => current?.id === updated.id ? updated : current)
    return updated
  }

  const renderMinutes = (minutes, type = 'saved') => {
    if (!minutes && type !== 'saved') return null
    return <MinutesEditor company={Boolean(workspace)} assignees={assignees} assigneeError={assigneeError} editRequest={type === 'saved' ? editRequest : 0} readOnly={!canManage} key={type === 'saved' ? selectedMeeting?.id : type} minutes={minutes}
      title={type === 'saved' ? selectedMeeting?.title : ''} saved={type === 'saved'}
      disabled={isGeneratingMinutes || isSavingMeeting || (type === 'recorded' && isTranscribingRecording)} onEditing={value => { setEditingMinutes(value); if (!value) setEditRequest(0) }}
      onSave={type === 'saved' ? updateSavedMinutes : async (updated) => {
        ({ live: setLiveMinutes, online: setOnlineMinutes, recorded: setRecordedMinutes })[type](updated)
      }} />
  }

  const renderMeetingWorkspace = () => {
    if (isLoadingSelectedMeeting) {
      return <p className="workspace-loading">Loading meeting...</p>
    }
    if (!selectedMeeting) return null

    const minutes = selectedMeeting.minutes ? normalizeMinutes(selectedMeeting.minutes) : null
    const decisions = Array.isArray(minutes?.decisions) ? minutes.decisions : []
    const actionItems = Array.isArray(minutes?.action_items) ? minutes.action_items : []

    return (
      <section className="meeting-workspace">
        <button className="back-link" disabled={isSavingMeeting} onClick={() => { if (!editingMinutes || window.confirm('Discard unsaved minutes edits?')) { setEditingMinutes(false); setEditRequest(0); setSelectedMeeting(null) } }}>← Meetings</button>
        <AskMoaSync readOnly={!canManage} key={`${selectedMeeting.id}:${selectedMeeting.revision}:${syncVersion}`} meeting={selectedMeeting}
          url={`${MEETINGS_API_URL}/${selectedMeeting.id}`} request={authenticatedFetch}
          disabled={!canManage || isSavingMeeting || editingMinutes || Boolean(isDeletingMeetingId)} />
        <header className="meeting-workspace-header">
          <div><span className={`type-badge ${selectedMeeting.type}`}>{selectedMeeting.type}</span><h2>{selectedMeeting.title}</h2><p>{new Date(selectedMeeting.created_at).toLocaleString()} · {workspace?.name || 'Personal'}</p></div>
          {canManage && <button className="primary-button" disabled={editingMinutes || isSavingMeeting} onClick={() => { setActiveMeetingTab('minutes'); setEditRequest(value => value + 1); setEditingMinutes(true) }}>Edit Meeting</button>}
          {canManage && <button className="delete-button" onClick={() => deleteMeeting(selectedMeeting.id)} disabled={editingMinutes || isSavingMeeting || isDeletingMeetingId === selectedMeeting.id}>{isDeletingMeetingId === selectedMeeting.id ? 'Deleting...' : 'Delete meeting'}</button>}
        </header>

        <div className="meeting-tabs" role="tablist" aria-label="Meeting content" onKeyDown={event => { if (['ArrowLeft','ArrowRight','Home','End'].includes(event.key) && !editingMinutes && !isSavingMeeting) { event.preventDefault(); const tabs = [...event.currentTarget.querySelectorAll('button')]; const index = tabs.indexOf(document.activeElement); const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length; tabs[next].focus(); tabs[next].click() } }}>
          {['overview', 'transcript', 'minutes'].map((tab) => <button key={tab} disabled={isSavingMeeting || editingMinutes} role="tab" tabIndex={activeMeetingTab === tab ? 0 : -1} aria-selected={activeMeetingTab === tab} className={activeMeetingTab === tab ? 'active' : ''} onClick={() => { if (!editingMinutes || window.confirm('Discard unsaved minutes edits?')) { setEditingMinutes(false); setActiveMeetingTab(tab) } }}>{tab === 'overview' ? 'Overview' : tab === 'minutes' ? 'Minutes' : 'Transcript'}</button>)}
        </div>
        <div className={`meeting-reading-grid ${activeMeetingTab === 'overview' ? 'split' : 'focused'}`}>
        {activeMeetingTab === 'overview' && <article className="meeting-overview meeting-document">
          <SectionHeader eyebrow="MEETING NOTES" title="Overview" action="Focus minutes" onAction={() => setActiveMeetingTab('minutes')} />
          <section><p className="section-label">SUMMARY</p><p>{minutes?.summary || 'No generated summary is available for this meeting.'}</p></section>
          {minutes?.key_points?.length > 0 && <section><h3>Discussion</h3><ul>{minutes.key_points.map((point,index) => <li key={index}>{point}</li>)}</ul></section>}
          {decisions.length > 0 && <section><p className="section-label">KEY DECISIONS</p><ul>{decisions.map((decision, index) => <li key={index}>{decision}</li>)}</ul></section>}
          {actionItems.length > 0 && <section><p className="section-label">ACTION ITEMS</p><ul className="action-rows">{actionItems.map((item, index) => <li key={index}><div><strong>{item.task}</strong><small>{item.owner} / {item.deadline}</small></div><span className={`status-pill ${item.status.toLowerCase()}`}>{item.status}</span></li>)}</ul></section>}
          <section className="meeting-information"><p className="section-label">MEETING INFORMATION</p><dl><div><dt>Type</dt><dd>{selectedMeeting.type}</dd></div><div><dt>Created</dt><dd>{new Date(selectedMeeting.created_at).toLocaleString()}</dd></div></dl></section>
        </article>}
        {['overview','transcript'].includes(activeMeetingTab) && <aside className="meeting-transcript document-transcript"><SectionHeader eyebrow="THE CONVERSATION" title="Transcript" action={activeMeetingTab === 'overview' ? 'Focus transcript' : 'Split view'} onAction={() => setActiveMeetingTab(activeMeetingTab === 'overview' ? 'transcript' : 'overview')}/><div className="transcript-lines">{(selectedMeeting.transcript || 'No transcript available.').split('\n').filter(Boolean).map((line,index) => <p key={index}>{line}</p>)}</div></aside>}
        {activeMeetingTab === 'minutes' && <div className="workspace-minutes">{renderMinutes(minutes)}</div>}
        </div>
        <button className="meeting-context-assistant" disabled={editingMinutes || isSavingMeeting} onClick={() => { setAssistantInput(`Summarize the decisions and next steps from "${selectedMeeting.title}".`); handleModeChange('assistant') }}><MoaCompanion size={42}/><span>Ask MOA about this meeting<small>Explore decisions, owners and next steps</small></span><span aria-hidden="true">↗</span></button>
        <details className="meeting-exports"><summary>Copy, download & exports</summary>
        <OutputTools title={selectedMeeting.title} date={selectedMeeting.created_at} transcript={selectedMeeting.transcript} minutes={minutes} disabled={editingMinutes} />
        </details>
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
                {source.meeting_title || 'Untitled meeting'}
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
  const pageTitle = mode === 'workspaces' ? 'Settings / Workspaces' : mode === 'actions' ? 'Action Items' : mode === 'members' ? 'Members' : mode === 'weekly' ? 'Weekly Summary' : mode === 'dashboard' ? 'Dashboard' : mode === 'meetings' ? 'Meetings' : mode === 'minutes' ? 'Minutes' : mode === 'assistant' ? 'Ask MOA' : mode === 'online' ? 'Online Meeting' : mode === 'settings' ? 'Settings' : mode === 'live' ? 'Live Meeting' : 'Recorded Meeting'
  const displayedMeetings = filterMeetings(meetings, { ...dateFilters, keyword: appliedSearch, type: meetingFilter })
  const personalWeek = companyData(meetings.filter(meeting => !meeting.organization_id).map(meeting => ({ ...meeting, organization_id: null })), null)
  const personalWeekActions = personalWeek.actions.filter(action => { const meeting = meetings.find(item => item.id === action.meetingId); const start = new Date(); start.setUTCHours(0, 0, 0, 0); start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7); return new Date(meeting.created_at) >= start })
  const meetingsWithMinutes = meetings.filter((meeting) => meeting.minutes)

  return (
    <div className={`app-shell ${theme} ${workspace ? 'company-workspace' : 'personal-workspace'}`} data-workspace-kind={workspace ? 'company' : 'personal'}>
      {navigationOpen && <button className="navigation-backdrop" aria-label="Close navigation" onClick={() => { setNavigationOpen(false); navigationTriggerRef.current?.focus() }} />}
      <aside ref={navigationRef} id="app-navigation" className={`sidebar ${navigationOpen ? 'navigation-open' : ''}`} role={navigationOpen ? 'dialog' : undefined} aria-modal={navigationOpen || undefined} aria-label="Workspace navigation">
        <button className="navigation-close" onClick={() => { setNavigationOpen(false); navigationTriggerRef.current?.focus() }}>Close navigation ×</button>
        <div className="brand"><MoaMark /><span><strong>MOA</strong><small>Minutes Operational Assistant</small></span></div>
        <button className="workspace-indicator" onClick={() => handleModeChange('workspaces')}><span><strong>{workspace?.name || 'Personal'}</strong><small>{workspace ? `Company Workspace / ${workspace.role === 'admin' ? 'Admin' : 'Member'}` : 'Personal Workspace'}</small></span> <Icon name="chevron" size={14} /></button>
        <nav aria-label="Primary navigation">
          <p className="nav-label">{workspace ? 'Company' : 'Main'}</p>
          <button className={`nav-item ${mode === 'dashboard' ? 'active' : ''}`} onClick={() => handleModeChange('dashboard')}><Icon name="home" />Dashboard</button>
          <button className={`nav-item ${mode === 'meetings' ? 'active' : ''}`} onClick={() => handleModeChange('meetings')}><Icon name="clock" />Meetings</button>
          <button className={`nav-item ${mode === 'minutes' ? 'active' : ''}`} onClick={() => handleModeChange('minutes')}><Icon name="upload" />Minutes</button>
          <p className="nav-label">Intelligence</p>
          <button className={`nav-item ${mode === 'assistant' ? 'active' : ''}`} onClick={() => handleModeChange('assistant')}><span className="nav-assistant-icon"><AssistantMascot size={22} /></span>Ask MOA</button>
          <button className={`nav-item ${mode === 'weekly' ? 'active' : ''}`} onClick={() => handleModeChange('weekly')}><Icon name="clock" />Weekly Summary</button>
          {workspace && <>
            <button className={`nav-item ${mode === 'actions' ? 'active' : ''}`} onClick={() => handleModeChange('actions')}><Icon name="clock" />Action Items</button>
          </>}
        </nav>
        <div className="sidebar-bottom">
          <button className={`nav-item ${mode === 'settings' ? 'active' : ''}`} onClick={() => handleModeChange('settings')}><Icon name="settings" />Settings</button>
          <button className="sidebar-profile" aria-label="Open profile" onClick={() => handleModeChange('settings')}><span>{userFirstName.charAt(0).toUpperCase()}</span><div><strong>{userDisplayName}</strong><small>{workspace ? `Company ${workspace.role === 'admin' ? 'Admin' : 'Member'}` : 'Personal account'}</small></div></button>
        </div>
      </aside>
      <main className="main-content">
      <header className="topbar"><button ref={navigationTriggerRef} className="navigation-trigger icon-button" aria-label="Open navigation" aria-controls="app-navigation" aria-expanded={navigationOpen} onClick={() => setNavigationOpen(true)}>☰</button><div><p className="eyebrow">{workspace ? `${workspace.name} / Company Workspace / ${workspace.role === 'admin' ? 'Admin' : 'Member'}` : 'PERSONAL WORKSPACE'}</p><h1>{pageTitle}</h1></div>
      <div className="topbar-actions">

        <button className="icon-button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Toggle color theme"><Icon name={theme === 'dark' ? 'sun' : 'moon'} /></button>
        <div className="profile-menu-wrap" ref={profileMenuRef}>
          <button ref={profileButtonRef} className="profile-trigger" aria-label="Account menu"
            aria-controls="account-menu" aria-expanded={isProfileMenuOpen}
            onClick={() => setIsProfileMenuOpen((open) => !open)}>
            <span>{userFirstName.charAt(0).toUpperCase()}</span><strong>{userDisplayName}</strong>
          </button>
          {isProfileMenuOpen && <div className="profile-menu" id="account-menu" role="region" aria-label="Account">
            <div className="account-identity"><strong>{userDisplayName}</strong><small>{workspace ? 'Company account' : 'Personal account'}</small><small>{session.user.email}</small></div>
            <div className="account-workspaces" aria-label="Switch Workspace">
              {[{ id: '', name: 'Personal' }, ...organizations].map(company => <button key={company.id} aria-pressed={(workspace?.id || '') === company.id} onClick={() => { onSelectWorkspace(company.id); setIsProfileMenuOpen(false) }}>{(workspace?.id || '') === company.id ? '\u2713 ' : ''}{company.name}</button>)}
            </div>
            <button onClick={() => { setIsProfileMenuOpen(false); handleModeChange('settings') }}>Account / Profile</button>
            <button onClick={() => { setIsProfileMenuOpen(false); handleModeChange('workspaces') }}>Manage Workspaces</button>
            <button onClick={() => { setIsProfileMenuOpen(false); handleModeChange('settings') }}><Icon name="settings" />Settings</button>
            <button className="sign-out" onClick={handleSignOutClick}><Icon name="logout" />Sign out</button>
          </div>}
        </div>
      </div></header>
      {authError && <p className="error">{authError}</p>}

      {workspace && mode === 'dashboard' ? (
        <CompanyDashboard request={authenticatedFetch} url={`${API_BASE_URL}/organizations/${workspace.id}`} newMeeting={() => setIsNewMeetingOpen(true)} workspace={workspace} meetings={meetings} loading={isLoadingMeetings} openMeeting={selectMeeting} navigate={handleModeChange} />
      ) : workspace && mode === 'actions' ? (
        <CompanyActions userId={session.user.id} onStatusChange={updateActionStatus} workspace={workspace} meetings={meetings} openMeeting={selectMeeting} />
      ) : mode === 'dashboard' ? (
        <section className="dashboard memory-dashboard">
          <div className="experience-hero personal-hero"><DuneMotif /><div className="hero-copy"><span className="workspace-context">PERSONAL WORKSPACE</span>
            <h2>Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, {userFirstName}.</h2>
            <p>Pick up where you left off. Your meeting memory, always with you.</p>
            <div className="hero-actions"><button className="primary-button" onClick={() => setIsNewMeetingOpen(true)}>+ New Meeting</button><button onClick={() => handleModeChange('recorded')}><Icon name="upload" />Upload Recording</button><button onClick={() => handleModeChange('assistant')}><Icon name="sparkles" />Ask MOA</button></div>
          </div><div className="hero-companion"><MoaCompanion size={136} /></div></div>
          <div className="memory-flow"><section className="conversation-feed"><SectionHeader eyebrow="YOUR MEETING MEMORY" title="Recent conversations" action="View all" onAction={() => handleModeChange('meetings')}/>
            {isLoadingMeetings ? <p role="status">Loading your meetings...</p> : meetings.length ? meetings.slice(0,4).map(meeting => <MeetingRow key={meeting.id} meeting={meeting} compact onOpen={selectMeeting}/>) : <p className="empty-state">Your first conversation starts here. Start a meeting or upload a recording.</p>}
          </section><section className="next-actions"><SectionHeader eyebrow="PICK UP WHERE YOU LEFT OFF" title="Next actions"/>
            {personalWeek.open.length ? <ul className="action-rows">{personalWeek.open.slice(0,3).map(action => <li key={action.key}><span className="action-marker" aria-hidden="true"/><div><strong>{action.task}</strong><small>{action.owner} · {action.deadline}</small><button className="text-button" onClick={() => selectMeeting(action.meetingId,'minutes')}>{action.meetingTitle} ↗</button></div><span className="status-pill open">Open</span></li>)}</ul> : <p className="empty-state">A clear next step starts with a conversation. Your open actions will appear here.</p>}
          </section><section className="week-preview"><SectionHeader eyebrow="THIS WEEK" title="Weekly summary"/><p>You had <strong>{personalWeek.thisWeek} meetings</strong> this week.</p><div className="week-metrics"><span><strong>{personalWeek.thisWeek}</strong><small>Meetings</small></span><span><strong>{personalWeek.decisions.length}</strong><small>Decisions</small></span><span><strong>{personalWeekActions.length}</strong><small>Action items</small></span></div><div className="week-sparkline" aria-hidden="true">{[28,52,35,70,43,78,57,36,66,48,82,62].map((height,index)=><i key={index} style={{height:`${height}%`}} />)}</div><button onClick={() => handleModeChange('weekly')}>View full summary ↗</button></section></div>
          <div className="memory-footer"><MemoryDecisions decisions={personalWeek.decisions} onOpen={selectMeeting}/></div>
          <button className="memory-assistant-entry" onClick={() => handleModeChange('assistant')}><MoaCompanion size={46}/><span>Something on your mind?<small>Ask MOA to find the detail you remember.</small></span><span aria-hidden="true">↗</span></button>
        </section>
      ) : mode === 'meetings' ? (
        selectedMeeting ? renderMeetingWorkspace() : <section className="meetings-hub">
          <header className="page-header meetings-hero"><div><p className="eyebrow">CONVERSATION LIBRARY</p><h2>Meetings</h2><p>Capture, review and manage your conversations.</p></div>{canManage && <button className="primary-button" onClick={() => setIsNewMeetingOpen(true)}>+ New Meeting</button>}</header>
          <div className="meetings-tools">
            <form className="meeting-search" onSubmit={searchMeetings}><Icon name="search" size={19} /><input value={meetingSearchQuery} onChange={(event) => { setMeetingSearchQuery(event.target.value); if (!event.target.value.trim()) setAppliedSearch('') }} placeholder="Search your meetings..." aria-label="Search meetings" /><button type="submit">Search</button></form>
            <div className="meeting-filters" role="group" aria-label="Meeting type filters">{[['all', 'All'], ['live', 'Live'], ['recorded', 'Recorded'], ['online', 'Online']].map(([filter, label]) => <button type="button" key={filter} className={meetingFilter === filter ? 'active' : ''} onClick={() => setMeetingFilter(filter)}>{label}</button>)}</div>
          </div>
          <section className="meeting-library">
            <header className="meeting-library-header"><div><p className="section-label">YOUR MEETINGS</p><h3>Meeting library</h3></div><span>{displayedMeetings.length} {displayedMeetings.length === 1 ? 'meeting' : 'meetings'}</span></header>
            <div className="summary-dates meeting-extended-filters">
              <label>From (UTC)<input type="date" value={dateFilters.start} onChange={(event) => setDateFilters({ ...dateFilters, start: event.target.value })} /></label>
              <label>Through (UTC)<input type="date" value={dateFilters.end} onChange={(event) => setDateFilters({ ...dateFilters, end: event.target.value })} /></label>
              <label>Action status<select value={dateFilters.actionStatus} onChange={(event) => setDateFilters({ ...dateFilters, actionStatus: event.target.value })}><option value="all">All actions</option><option>Open</option><option>Completed</option></select></label>
              <button onClick={() => { setDateFilters({ start: '', end: '', actionStatus: 'all' }); setMeetingFilter('all'); setMeetingSearchQuery(''); setAppliedSearch('') }}>Reset filters</button>
            </div>
            {dateFilters.start && dateFilters.end && dateFilters.start > dateFilters.end && <p role="alert">The end date must be on or after the start date.</p>}
            <div className="meeting-list">{isLoadingMeetings ? <div className="meetings-empty"><span className="meeting-empty-icon"><Icon name="clock" size={21} /></span><strong>Loading meetings...</strong></div> : displayedMeetings.length === 0 ? <div className="meetings-empty"><span className="meeting-empty-icon"><Icon name="search" size={21} /></span><strong>No meetings found</strong><p>{meetingFilter === 'online' ? 'Online meetings will appear here after you save one.' : 'Try another search or start a new conversation.'}</p></div> : displayedMeetings.map((meeting) => <MeetingRow key={meeting.id} meeting={meeting} onOpen={selectMeeting} />)}</div>
          </section>
          {historyError && <p className="error">{historyError}</p>}
        </section>
      ) : mode === 'weekly' ? (
          <WeeklySummary companyName={workspace?.name} request={(body) => authenticatedFetch(`${API_BASE_URL}/summaries/weekly`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })} openMeeting={selectMeeting} />
      ) : mode === 'minutes' ? (
        <section className="minutes-hub">
          <header className="page-header minutes-hero">
            <div><p className="eyebrow">MEETING KNOWLEDGE</p><h2>Minutes</h2><p>Review the decisions and next steps from your saved meetings.</p></div>
            {canManage && <button className="primary-button" onClick={() => setIsNewMeetingOpen(true)}>+ New Meeting</button>}
          </header>
          <section className="minutes-library" aria-labelledby="minutes-library-title">
            <header className="minutes-library-header">
              <div><p className="eyebrow">GENERATED MINUTES</p><h3 id="minutes-library-title">Minutes library</h3></div>
              {!isLoadingMeetings && <span className="minutes-count">{meetingsWithMinutes.length} {meetingsWithMinutes.length === 1 ? 'summary' : 'summaries'}</span>}
            </header>
            <div className="minutes-library-list">
              {isLoadingMeetings ? <div className="minutes-state" role="status"><span className="minutes-state-icon"><Icon name="clock" size={22} /></span><strong>Loading minutes...</strong></div> : meetingsWithMinutes.length === 0 ? (
                <div className="minutes-state"><span className="minutes-state-icon"><Icon name="sparkles" size={24} /></span><strong>Your meeting knowledge starts here</strong><p>Generated meeting minutes will appear here after you process a meeting and save it with its minutes.</p></div>
              ) : meetingsWithMinutes.map((meeting) => (
                <button className="minutes-entry" key={meeting.id} onClick={() => selectMeeting(meeting.id, 'minutes')}>
                  <span className={`minutes-type-icon ${meeting.type}`}><Icon name={meeting.type === 'live' ? 'mic' : meeting.type === 'online' ? 'video' : 'upload'} size={20} /></span>
                  <span className="minutes-entry-copy"><strong>{meeting.title}</strong><small>{meeting.minutes?.summary || 'Generated meeting minutes'}</small></span>
                  <span className="minutes-entry-meta"><span className={`type-badge ${meeting.type}`}>{meeting.type}</span><small>{new Date(meeting.created_at).toLocaleDateString()}</small></span>
                  <Icon name="chevron" />
                </button>
              ))}
            </div>
          </section>
        </section>
      ) : mode === 'online' ? (
        <section className="online-meeting-view">{renderSpeakerMode('online')}<header><p className="eyebrow">ONLINE MEETING</p><h2>Capture shared meeting audio</h2><p>Share the browser tab containing your meeting and make sure tab audio is enabled.</p></header><div className={`online-capture-state ${onlineStatus.toLowerCase()}`}><span></span><p>{onlineStatus === 'Capturing' ? 'Capturing shared meeting audio' : onlineStatus}</p></div><button className="primary-button online-capture-button" onClick={handleOnlineRecordingToggle} disabled={onlineStatus === 'Connecting' || onlineStatus === 'Stopping'}>{isOnlineCapturing || onlineStatus === 'Stopping' ? 'Stop Online Meeting' : 'Start Online Meeting'}</button><p className="online-capture-hint">For best results, use Chrome or Edge and share the meeting tab with audio.</p>{(onlineTranscript || onlineInterimTranscript) && <div className="transcript-section"><h2>Transcript</h2>{renderTranscript('online', onlineSpeakerTurns, onlineTranscript)}{onlineInterimTranscript && <p className="transcribing">{onlineInterimTranscript}</p>}</div>}{['Finished', 'Error'].includes(onlineStatus) && onlineTranscript.trim() && <div className="meeting-complete-actions"><button onClick={() => generateMinutes('online', onlineTranscript)} disabled={isGeneratingMinutes}>Generate Minutes</button><button onClick={() => saveMeeting('online', onlineTranscript, onlineMinutes)} disabled={isGeneratingMinutes || isSavingMeeting}>Save Meeting</button></div>}{isGeneratingMinutes && <p className="transcribing">Generating Minutes...</p>}{renderMinutes(onlineMinutes, 'online')}</section>
      ) : ['settings', 'workspaces'].includes(mode) ? (
        <Settings key={mode} initialSection={mode === 'workspaces' ? 'workspace' : 'account'} session={session} workspace={workspace} picker={workspacePicker} theme={theme} setTheme={setTheme} request={authenticatedFetch} url={workspace ? `${API_BASE_URL}/organizations/${workspace.id}` : ''} onChanged={onWorkspaceUpdated} onSignOut={handleSignOutClick} />
      ) : mode === 'history' ? (
        null
      ) : mode === 'live' ? (
        <>
          {renderSpeakerMode('live')}
          <div className="capture-companion-status" role="status"><MoaCompanion size={56} state={isRecording ? 'listening' : isBusy ? 'thinking' : 'idle'} /><p>{status}</p></div>
          <button onClick={handleRecordingToggle} className="record-button">
            {isRecording || isBusy ? 'Stop Recording' : 'Start Recording'}
          </button>

          {(transcript || interimTranscript) && (
            <div className="transcript-section">
              <h2>Transcript</h2>
              {renderTranscript('live', liveSpeakerTurns, transcript)}
              {interimTranscript && <p className="transcribing">{interimTranscript}</p>}
            </div>
          )}
          {!isRecording && !isBusy && transcript.trim() && (
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
          {renderMinutes(liveMinutes, 'live')}
        </>
      ) : mode === 'recorded' ? (
        <div className="recorded-workspace">
          <header className="dashboard-heading"><p className="eyebrow">RECORDING TO KNOWLEDGE</p><h2>Upload a conversation</h2><p>Bring your audio or video. MOA will help you find the important details.</p></header>
          {renderSpeakerMode('recorded')}
          <label className="recorded-language-selector">Recording language
            <select aria-label="Recording language" value={recordedLanguageCode}
              disabled={isTranscribingRecording || Boolean(recordingJobId) || editingMinutes || Boolean(recordedTranscript)}
              onChange={event => setRecordedLanguageCode(event.target.value)}>
              {RECORDED_LANGUAGES.map(language => <option key={language.code} value={language.code}>{language.label}{language.experimental ? ' — Experimental' : ''}</option>)}
            </select>
            <small>{recordedLanguage(recordedLanguageCode).available
              ? 'English uses MOA’s existing transcription path.'
              : `${recordedLanguage(recordedLanguageCode).label} transcription is experimental and is not available until a speech engine is connected and tested.`}</small>
          </label>
          <label className={`upload-zone ${isTranscribingRecording || recordingJobId ? 'is-disabled' : ''}`} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (!isTranscribingRecording && !recordingJobId && !editingMinutes && event.dataTransfer.files.length) handleFileSelection({ target: { files: event.dataTransfer.files } }) }}><Icon name="upload" size={28} /><strong>Drop audio or video here</strong><span>or choose a file from your device</span><input aria-label="Choose recording file" type="file" disabled={isTranscribingRecording || Boolean(recordingJobId) || editingMinutes} accept="audio/*,video/*,.webm,.mkv" onChange={handleFileSelection} /></label>
          {recordingProgress && <p role="status">{recordingProgress}</p>}
          {selectedFile && <p>Selected file: {selectedFile.name}</p>}
          <button
            onClick={transcribeRecording}
            disabled={(!selectedFile && !recordingJobId) || isTranscribingRecording || editingMinutes || !recordedLanguage(recordedLanguageCode).available}
          >
            {isTranscribingRecording ? 'Processing…' : recordingJobId ? 'Resume checking progress' : 'Transcribe Recording'}
          </button>
          {isTranscribingRecording && <p className="transcribing">Transcribing...</p>}
          {recordedTranscript && (
            <>
              <h2>Transcript</h2>
              {renderTranscript('recorded', recordedSpeakerTurns, recordedTranscript)}
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
          {renderMinutes(recordedMinutes, 'recorded')}
        </div>
      ) : (
        <div className={`transcript-section assistant-workspace ${assistantMessages.some(message => !message.isGreeting) ? 'has-conversation' : 'is-empty'}`}>
          <header className="assistant-header"><AssistantMascot size={58} /><div><p className="eyebrow">YOUR MEETING COPILOT</p><h2>{workspace ? `Ask ${workspace.name} MOA` : 'Ask MOA'}</h2><span>Find decisions, action items, and context across {workspace ? 'this company’s' : 'your personal'} saved meetings.</span></div></header>
          <section className="assistant-chat-panel">
          <div className="assistant-conversation" aria-live="polite">
            {assistantMessages.map((chatMessage, messageIndex) => (
              chatMessage.isGreeting ? (assistantMessages.some(message => !message.isGreeting) ? null : (
                <div key={chatMessage.id} className="assistant-welcome">
                  <span className="assistant-welcome-avatar"><AssistantMascot size={144} /></span>
                  <h3>What do you want to know?</h3>
                  <p>Find decisions, action items, deadlines and context across your saved conversations.</p>
                  <div className="assistant-suggestions" aria-label="Example questions">
                    {['What decisions were made?', 'Who owns the action items?', 'What deadlines were mentioned?', 'Summarize my latest meeting.'].map((suggestion) => <button key={suggestion} onClick={() => setAssistantInput(suggestion)}>{suggestion}<Icon name="chevron" size={14} /></button>)}
                  </div>
                </div>
              )) : (
                <div key={chatMessage.id} className={`assistant-message ${chatMessage.role}${chatMessage.isError ? ' assistant-error' : ''}`}>
                  {chatMessage.role === 'assistant' && <span className="assistant-message-avatar"><AssistantMascot size={32} state={!isAssistantThinking && messageIndex === assistantMessages.length - 1 ? 'responding' : 'idle'} /></span>}
                  <div className="assistant-message-content">
                    <strong className="assistant-message-author">{chatMessage.role === 'user' ? 'You' : 'MOA'}</strong>
                    <p>{chatMessage.content}</p>
                    {chatMessage.role === 'assistant' && renderAssistantSources(chatMessage.sources)}
                  </div>
                </div>
              )
            ))}
            {isAssistantThinking && <div className="assistant-thinking"><span className="assistant-message-avatar"><AssistantMascot size={36} state="thinking" /></span><p>MOA is thinking<span aria-hidden="true">...</span></p><i /><i /><i /></div>}
          </div>
          <div className="assistant-composer">
            <textarea
              value={assistantInput}
              onChange={(event) => setAssistantInput(event.target.value)}
              onKeyDown={handleAssistantKeyDown}
              aria-label="Ask MOA a question"
              placeholder="Ask anything about your meetings..."
              rows="2"
              disabled={isAssistantThinking}
            />
            <button onClick={sendAssistantMessage} disabled={isAssistantThinking || !assistantInput.trim()}>Send <Icon name="chevron" size={16} /></button>
          </div>
          <p className="assistant-composer-hint">Press Enter to send · Shift + Enter for a new line</p>
          </section>
        </div>
      )}

      {error && <p className="error">{error}</p>}

      {isNewMeetingOpen && <div className="modal-backdrop" role="presentation" onMouseDown={() => setIsNewMeetingOpen(false)}><section className="new-meeting-modal" role="dialog" aria-modal="true" aria-labelledby="new-meeting-title" onMouseDown={(event) => event.stopPropagation()}><header><div><p className="section-label">CREATE A MEETING</p><h2 id="new-meeting-title">New Meeting</h2></div><button className="icon-button" onClick={() => setIsNewMeetingOpen(false)} aria-label="Close new meeting selector">×</button></header><button className="meeting-mode-option" onClick={() => openNewMeeting('live')}><Icon name="mic" /><span><strong>Live Meeting</strong><small>Start an in-person meeting and transcribe it as it happens.</small></span><Icon name="chevron" /></button><button className="meeting-mode-option" onClick={() => openNewMeeting('recorded')}><Icon name="upload" /><span><strong>Recorded Meeting</strong><small>Upload an existing audio or video recording.</small></span><Icon name="chevron" /></button><button className="meeting-mode-option" onClick={() => openNewMeeting('online')}><Icon name="video" /><span><strong>Online Meeting</strong><small>Capture audio from a browser-based meeting.</small></span><Icon name="chevron" /></button></section></div>}

      {notice && <p role="status">{notice}{notice.includes('Open the saved meeting') && selectedMeeting && <button onClick={() => selectMeeting(selectedMeeting.id)}>Open saved meeting</button>}</p>}
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

export function AuthScreen({ initialError = '' }) {
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
        writeOnboarding(readOnboarding(trimmedEmail) || 'choose', trimmedEmail)
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
      if (isCreatingAccount && !readOnboarding()) writeOnboarding('choose')
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
      <section className="auth-brand-panel"><DuneMotif />
        <div className="auth-brand"><MoaMark size={36}/><div><strong>MOA</strong><span>Minutes Operational Assistant</span></div></div>
        <div className="auth-story"><p className="eyebrow">MEET WITH CLARITY</p><h1>Meetings shouldn’t disappear when the conversation ends.</h1><p>Capture conversations, organize decisions, and turn every meeting into shared knowledge.</p></div>
        <div className="auth-brand-note"><MoaCompanion size={110} /><p>Your meeting memory.<br /><span>A little help remembering the important things.</span></p></div><small>Capture <span>•</span> Organize <span>•</span> Ask <span>•</span> Remember</small>
      </section>
      <section className="auth-form-panel">
      <div className="auth-form-card">
        <p className="eyebrow">{isCreatingAccount ? 'WELCOME TO MOA' : 'WELCOME BACK'}</p>
        <h2>{isCreatingAccount ? 'Create your account' : 'Welcome back'}</h2>
        <p className="auth-intro">{isCreatingAccount ? 'Start turning your meetings into organized knowledge.' : 'Continue where your conversations left off.'}</p>
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
        <p className="auth-switch">{isCreatingAccount ? 'Already have an account?' : "Don't have an account?"} <button disabled={isSubmitting} onClick={() => switchAuthMode(!isCreatingAccount)}>{isCreatingAccount ? 'Sign in' : 'Create one'}</button></p>
        <div className="team-helper"><p>Using MOA with a team?<br />Create or join a workspace after signing in.</p></div>
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
      await signOutAccount(supabase.auth, session?.user.id)
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

  return <WorkspaceApplication key={session.user.id} session={session} onSignOut={handleSignOut} authError={authError} theme={theme} setTheme={setTheme} />
}

export default App
