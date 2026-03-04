import { useState, useRef, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { devicesAPI } from '../api'
import { getWsUrl } from '../api/ws'
import { useAuthStore } from '../stores/authStore'
import {
  ArrowLeft,
  Loader2,
  Tablet,
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Activity,
  Zap,
  Clock,
  Globe,
  AlertCircle,
  Settings,
  ArrowDownToLine,
  ArrowUpFromLine,
} from 'lucide-react'

export default function DeviceCall() {
  const { id: deviceId } = useParams<{ id: string }>()
  const navigate = useNavigate()

  // Call state
  const [isConnecting, setIsConnecting] = useState(false)
  const [isInCall, setIsInCall] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [duration, setDuration] = useState(0)

  // Listen (hear device) state
  const [listenSessionId, setListenSessionId] = useState<string | null>(null)
  const [listenReady, setListenReady] = useState(false)
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false)
  const [bytesReceived, setBytesReceived] = useState(0)
  const [listenLevel, setListenLevel] = useState(0)

  // Speak (mic to device) state
  const [speakSessionId, setSpeakSessionId] = useState<string | null>(null)
  const [speakReady, setSpeakReady] = useState(false)
  const [isMicMuted, setIsMicMuted] = useState(false)
  const [bytesSent, setBytesSent] = useState(0)
  const [micLevel, setMicLevel] = useState(0)

  // Listen refs
  const listenWsRef = useRef<WebSocket | null>(null)
  const playbackContextRef = useRef<AudioContext | null>(null)
  const gainNodeRef = useRef<GainNode | null>(null)
  const nextPlayTimeRef = useRef(0)

  // Speak refs
  const speakWsRef = useRef<WebSocket | null>(null)
  const captureContextRef = useRef<AudioContext | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animFrameRef = useRef<number>(0)

  // Retry / timeout refs
  const listenRetryTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const speakRetryTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const callTimeoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const listenReadyRef = useRef(false)
  const speakReadyRef = useRef(false)

  // Connection status
  const [connectStatus, setConnectStatus] = useState('')

  // Shared refs
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isInCallRef = useRef(false)
  const isMicMutedRef = useRef(false)
  const isSpeakerMutedRef = useRef(false)

  const { data: device } = useQuery({
    queryKey: ['device', deviceId],
    queryFn: () => devicesAPI.get(deviceId!),
    enabled: !!deviceId,
  })

  useEffect(() => { isInCallRef.current = isInCall }, [isInCall])
  useEffect(() => { isMicMutedRef.current = isMicMuted }, [isMicMuted])
  useEffect(() => { isSpeakerMutedRef.current = isSpeakerMuted }, [isSpeakerMuted])
  // NOTE: listenReadyRef and speakReadyRef are set SYNCHRONOUSLY in signal
  // handlers (handleListenSignal / handleSpeakSignal) to prevent a race where
  // the 12s retry timer fires before a React state→useEffect ref update.

  useEffect(() => {
    return () => { endCall() }
  }, [])

  // Once both channels are ready, we're in call
  useEffect(() => {
    if (listenReady && speakReady && !isInCall) {
      // Clear retry / timeout timers
      if (listenRetryTimerRef.current) { clearInterval(listenRetryTimerRef.current); listenRetryTimerRef.current = null }
      if (speakRetryTimerRef.current) { clearInterval(speakRetryTimerRef.current); speakRetryTimerRef.current = null }
      if (callTimeoutTimerRef.current) { clearTimeout(callTimeoutTimerRef.current); callTimeoutTimerRef.current = null }
      setIsInCall(true)
      setIsConnecting(false)
      setConnectStatus('')
      startDurationTimer()
    }
  }, [listenReady, speakReady])

  const startCall = async () => {
    if (!deviceId) return

    setIsConnecting(true)
    setError(null)
    setConnectStatus('Requesting microphone...')

    const token = useAuthStore.getState().accessToken || ''

    try {
      // 1. Request mic access first
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 8000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      })
      mediaStreamRef.current = stream
      setConnectStatus('Creating audio sessions...')

      // 2. Create both sessions in parallel
      const [listenRes, speakRes] = await Promise.all([
        fetch('/api/v1/audio/listen', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ device_id: deviceId }),
        }),
        fetch('/api/v1/audio/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ device_id: deviceId }),
        }),
      ])

      if (!listenRes.ok) throw new Error('Failed to create listen session')
      if (!speakRes.ok) throw new Error('Failed to create speak session')

      const listenData = await listenRes.json()
      const speakData = await speakRes.json()
      const lSid = listenData.data.session_id
      const sSid = speakData.data.session_id
      setListenSessionId(lSid)
      setSpeakSessionId(sSid)
      setConnectStatus('Connecting channels...')

      // 3. Set up playback AudioContext (for hearing device)
      const playbackCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 8000 })
      playbackContextRef.current = playbackCtx
      const gainNode = playbackCtx.createGain()
      gainNode.gain.value = 1.0
      gainNode.connect(playbackCtx.destination)
      gainNodeRef.current = gainNode
      nextPlayTimeRef.current = 0

      // 4. Connect listen WebSocket
      const listenWs = new WebSocket(getWsUrl(`/ws/audio/listen/admin/${lSid}`))
      listenWs.binaryType = 'arraybuffer'
      listenWsRef.current = listenWs

      listenWs.onopen = () => {
        const sendListenCmd = () => {
          if (listenReadyRef.current) return
          setConnectStatus(prev => prev === 'Waiting for device...' ? prev : 'Waiting for device...')
          fetch(`/api/v1/devices/${deviceId}/commands`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ command_type: 'START_LISTEN', payload: { session_id: lSid } }),
          }).catch(err => console.error('Failed to send START_LISTEN:', err))
        }
        sendListenCmd()
        listenRetryTimerRef.current = setInterval(sendListenCmd, 12000)
      }

      listenWs.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          handleListenAudio(event.data)
        } else if (typeof event.data === 'string') {
          handleListenSignal(JSON.parse(event.data))
        }
      }

      listenWs.onerror = () => setError('Listen connection error')
      listenWs.onclose = () => {
        setListenReady(false)
        if (isInCallRef.current) setError('Listen channel disconnected')
      }

      // 5. Connect speak WebSocket
      const speakWs = new WebSocket(getWsUrl(`/ws/audio/admin/${sSid}`))
      speakWs.binaryType = 'arraybuffer'
      speakWsRef.current = speakWs

      speakWs.onopen = () => {
        const sendSpeakCmd = () => {
          if (speakReadyRef.current) return
          fetch(`/api/v1/devices/${deviceId}/commands`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ command_type: 'START_AUDIO', payload: { session_id: sSid } }),
          }).catch(err => console.error('Failed to send START_AUDIO:', err))
        }
        sendSpeakCmd()
        speakRetryTimerRef.current = setInterval(sendSpeakCmd, 12000)
      }

      speakWs.onmessage = (event) => {
        if (typeof event.data === 'string') {
          handleSpeakSignal(JSON.parse(event.data))
        }
      }

      speakWs.onerror = () => setError('Speak connection error')
      speakWs.onclose = () => {
        setSpeakReady(false)
        if (isInCallRef.current) setError('Speak channel disconnected')
      }

      // Hard timeout — give up after 45s
      callTimeoutTimerRef.current = setTimeout(() => {
        if (!isInCallRef.current) {
          setError('Call connection timed out. Please try again.')
          endCall()
        }
      }, 45000)

    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        setError('Microphone access denied. Please allow microphone access in your browser.')
      } else {
        setError(err.message || 'Failed to start call')
      }
      setIsConnecting(false)
      endCall()
    }
  }

  // --- Listen signal handling ---
  const handleListenSignal = (msg: any) => {
    switch (msg.type) {
      case 'session_info':
        break
      case 'device_ready':
        listenReadyRef.current = true
        if (listenRetryTimerRef.current) { clearInterval(listenRetryTimerRef.current); listenRetryTimerRef.current = null }
        setConnectStatus(speakReadyRef.current ? '' : 'Listen ready, waiting for speak...')
        setListenReady(true)
        break
      case 'device_disconnected':
        setError('Device disconnected (listen)')
        setListenReady(false)
        break
      case 'error':
        setError(typeof msg.payload === 'string' ? msg.payload : JSON.stringify(msg.payload))
        break
    }
  }

  // --- Listen audio playback ---
  const handleListenAudio = (buffer: ArrayBuffer) => {
    if (!isInCallRef.current) return
    const ctx = playbackContextRef.current
    const gainNode = gainNodeRef.current
    if (!ctx || !gainNode) return

    setBytesReceived(prev => prev + buffer.byteLength)

    const int16 = new Int16Array(buffer)
    const float32 = new Float32Array(int16.length)
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768
    }

    // Audio level
    let sum = 0
    for (let i = 0; i < float32.length; i++) sum += Math.abs(float32[i])
    setListenLevel(Math.min(100, (sum / float32.length) * 500))

    if (isSpeakerMutedRef.current) return

    const audioBuffer = ctx.createBuffer(1, float32.length, 8000)
    audioBuffer.getChannelData(0).set(float32)
    const source = ctx.createBufferSource()
    source.buffer = audioBuffer
    source.connect(gainNode)

    const currentTime = ctx.currentTime
    if (nextPlayTimeRef.current < currentTime) {
      nextPlayTimeRef.current = currentTime + 0.05
    }
    source.start(nextPlayTimeRef.current)
    nextPlayTimeRef.current += audioBuffer.duration
  }

  // --- Speak signal handling ---
  const handleSpeakSignal = (msg: any) => {
    switch (msg.type) {
      case 'session_info':
        break
      case 'device_ready':
        speakReadyRef.current = true
        if (speakRetryTimerRef.current) { clearInterval(speakRetryTimerRef.current); speakRetryTimerRef.current = null }
        setConnectStatus(listenReadyRef.current ? '' : 'Speak ready, waiting for listen...')
        setSpeakReady(true)
        startAudioCapture()
        break
      case 'audio_ready':
        break
      case 'device_disconnected':
        setError('Device disconnected (speak)')
        setSpeakReady(false)
        break
      case 'error':
        setError(typeof msg.payload === 'string' ? msg.payload : JSON.stringify(msg.payload))
        break
    }
  }

  // --- Mic capture ---
  const startAudioCapture = () => {
    const stream = mediaStreamRef.current
    if (!stream) return

    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 8000 })
    captureContextRef.current = ctx

    const source = ctx.createMediaStreamSource(stream)

    const analyser = ctx.createAnalyser()
    analyser.fftSize = 256
    source.connect(analyser)
    analyserRef.current = analyser

    const processor = ctx.createScriptProcessor(2048, 1, 1)
    processorRef.current = processor

    processor.onaudioprocess = (e) => {
      if (!isInCallRef.current || isMicMutedRef.current) return

      const inputData = e.inputBuffer.getChannelData(0)
      const pcm16 = new Int16Array(inputData.length)
      for (let i = 0; i < inputData.length; i++) {
        const s = Math.max(-1, Math.min(1, inputData[i]))
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
      }

      const ws = speakWsRef.current
      if (ws && ws.readyState === WebSocket.OPEN) {
        if (ws.bufferedAmount > 65536) return
        ws.send(pcm16.buffer)
        setBytesSent(prev => prev + pcm16.buffer.byteLength)
      }
    }

    source.connect(processor)
    processor.connect(ctx.destination)

    updateMicLevel()
  }

  const updateMicLevel = () => {
    const analyser = analyserRef.current
    if (!analyser) return

    const dataArray = new Uint8Array(analyser.frequencyBinCount)
    analyser.getByteFrequencyData(dataArray)

    let sum = 0
    for (let i = 0; i < dataArray.length; i++) sum += dataArray[i]
    const avg = sum / dataArray.length
    setMicLevel(Math.min(100, (avg / 128) * 100))

    animFrameRef.current = requestAnimationFrame(updateMicLevel)
  }

  // --- Duration timer ---
  const startDurationTimer = () => {
    setDuration(0)
    durationIntervalRef.current = setInterval(() => {
      setDuration(prev => prev + 1)
    }, 1000)
  }

  // --- End call ---
  const endCall = () => {
    // Clear retry / timeout timers
    if (listenRetryTimerRef.current) { clearInterval(listenRetryTimerRef.current); listenRetryTimerRef.current = null }
    if (speakRetryTimerRef.current) { clearInterval(speakRetryTimerRef.current); speakRetryTimerRef.current = null }
    if (callTimeoutTimerRef.current) { clearTimeout(callTimeoutTimerRef.current); callTimeoutTimerRef.current = null }

    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current)
      durationIntervalRef.current = null
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current)
      animFrameRef.current = 0
    }

    // Stop processor + capture context
    if (processorRef.current) { processorRef.current.disconnect(); processorRef.current = null }
    if (captureContextRef.current) { captureContextRef.current.close(); captureContextRef.current = null }
    analyserRef.current = null

    // Stop media stream
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop())
      mediaStreamRef.current = null
    }

    // Close playback context
    if (playbackContextRef.current) { playbackContextRef.current.close(); playbackContextRef.current = null }

    // Close WebSockets
    if (listenWsRef.current) { listenWsRef.current.close(); listenWsRef.current = null }
    if (speakWsRef.current) { speakWsRef.current.close(); speakWsRef.current = null }

    // Send stop commands + delete sessions
    const token = useAuthStore.getState().accessToken || ''
    if (listenSessionId && deviceId) {
      fetch(`/api/v1/devices/${deviceId}/commands`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ command_type: 'STOP_LISTEN', payload: { session_id: listenSessionId } }),
      }).catch(() => {})
      fetch(`/api/v1/audio/listen/${listenSessionId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      }).catch(() => {})
    }
    if (speakSessionId && deviceId) {
      fetch(`/api/v1/devices/${deviceId}/commands`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ command_type: 'STOP_AUDIO', payload: {} }),
      }).catch(() => {})
      fetch(`/api/v1/audio/sessions/${speakSessionId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      }).catch(() => {})
    }

    setIsInCall(false)
    setIsConnecting(false)
    setListenReady(false)
    setSpeakReady(false)
    setListenSessionId(null)
    setSpeakSessionId(null)
    setConnectStatus('')
    setBytesReceived(0)
    setBytesSent(0)
    setDuration(0)
    setListenLevel(0)
    setMicLevel(0)
  }

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0')
    const s = (seconds % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const deviceName = device
    ? `${device.manufacturer || ''} ${device.model || ''}`.trim() || 'Device'
    : 'Device'

  return (
    <div className="max-w-7xl mx-auto space-y-12 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 animate-in fade-in slide-in-from-top-4 duration-700">
        <div className="flex items-center gap-6">
          <button
            onClick={() => navigate(-1)}
            className="p-4 hover:bg-gray-100 rounded-full transition-all active:scale-90"
          >
            <ArrowLeft className="w-6 h-6 text-gray-400" />
          </button>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className={`w-2 h-2 rounded-full ${isInCall ? 'bg-green-500 animate-pulse' : 'bg-[#FA9411]'}`} />
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                {isInCall ? 'Call In Progress' : isConnecting ? 'Connecting...' : 'Call Standby'}
              </span>
            </div>
            <h1 className="text-4xl font-bold text-gray-900 tracking-tight">Device Call</h1>
            <p className="text-gray-500 font-medium mt-2">
              Full-duplex voice call with <span className="text-gray-900 font-bold">{deviceName}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 bg-white p-4 rounded-[1.5rem] border border-gray-50 shadow-sm">
          <div className="px-6 border-r border-gray-100">
            <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">Target Phone</div>
            <div className="flex items-center gap-2">
              <Tablet className="w-4 h-4 text-[#FA9411]" />
              <span className="text-xs font-bold text-gray-900 uppercase truncate max-w-[120px]">{deviceName}</span>
            </div>
          </div>
          <div className="px-6 border-r border-gray-100">
            <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">Call Status</div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-900 uppercase font-mono tracking-tighter">
                {isInCall ? 'ACTIVE' : isConnecting ? 'DIALING' : 'STANDBY'}
              </span>
            </div>
          </div>
          <div className="px-6 text-right">
            <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">Duration</div>
            <span className="text-xs font-bold text-gray-900 font-mono tracking-tighter">
              {isInCall ? formatDuration(duration) : '--:--'}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
        {/* Main Console */}
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-black rounded-[2.5rem] p-12 shadow-2xl shadow-gray-200 border border-gray-800 relative overflow-hidden flex flex-col justify-center items-center min-h-[500px]">
            {/* Dual waveform visualizer */}
            {isInCall && (
              <div className="absolute inset-0 flex items-center justify-center opacity-15 pointer-events-none overflow-hidden h-full w-full">
                <div className="flex items-end gap-1 px-16 w-full">
                  {/* Left half: listen (device audio) */}
                  {[...Array(20)].map((_, i) => (
                    <div
                      key={`l-${i}`}
                      className="flex-1 bg-[#FA9411] rounded-full transition-all duration-150"
                      style={{
                        height: `${Math.random() * (listenLevel + 15) + 5}%`,
                        opacity: isSpeakerMuted ? 0.1 : 1,
                      }}
                    />
                  ))}
                  <div className="w-px h-16 bg-white/20 mx-2" />
                  {/* Right half: mic (your voice) */}
                  {[...Array(20)].map((_, i) => (
                    <div
                      key={`m-${i}`}
                      className="flex-1 bg-green-400 rounded-full transition-all duration-150"
                      style={{
                        height: `${Math.random() * (micLevel + 15) + 5}%`,
                        opacity: isMicMuted ? 0.1 : 1,
                      }}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Call Button */}
            <div className="relative z-10 flex flex-col items-center gap-10">
              {/* Duration display during call */}
              {isInCall && (
                <div className="text-center">
                  <div className="text-5xl font-bold text-white font-mono tracking-tighter">{formatDuration(duration)}</div>
                  <div className="text-[10px] font-bold text-white/40 uppercase tracking-[0.3em] mt-2">Call Duration</div>
                </div>
              )}

              <div className="relative">
                {isInCall && (
                  <div className="absolute inset-0 rounded-full bg-green-500/20 animate-ping" />
                )}
                <button
                  onClick={isInCall ? endCall : startCall}
                  disabled={isConnecting}
                  className={`relative w-44 h-44 rounded-full flex flex-col items-center justify-center transition-all duration-300 shadow-2xl active:scale-90 border-4 ${
                    isConnecting
                      ? 'bg-black border-[#FA9411]/20 text-[#FA9411]'
                      : isInCall
                        ? 'bg-red-500 border-red-400/30 text-white shadow-red-500/30 hover:bg-red-600'
                        : 'bg-green-500 border-green-400/30 text-white hover:bg-green-600 hover:scale-105 shadow-green-500/30'
                  }`}
                >
                  {isConnecting ? (
                    <Loader2 className="w-16 h-16 animate-spin" />
                  ) : isInCall ? (
                    <PhoneOff className="w-16 h-16" />
                  ) : (
                    <Phone className="w-16 h-16" />
                  )}
                </button>
              </div>

              <div className="text-center">
                <div className="text-[10px] font-bold text-[#FA9411] uppercase tracking-[0.4em] mb-4">
                  {isInCall ? 'Call Active' : isConnecting ? (connectStatus || 'Dialing...') : 'Tap to Call'}
                </div>
                {isInCall && (
                  <div className="flex gap-1 h-4 items-center justify-center">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="w-2 h-2 rounded-full bg-green-500 animate-bounce" style={{ animationDelay: `${i * 0.1}s` }} />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Mute controls at bottom during call */}
            {isInCall && (
              <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-4">
                <button
                  onClick={() => setIsMicMuted(prev => !prev)}
                  className={`flex items-center gap-3 px-8 py-4 rounded-[1.5rem] transition-all active:scale-95 ${
                    isMicMuted
                      ? 'bg-red-500/20 border border-red-500/30 text-red-400'
                      : 'bg-white/5 border border-white/10 text-white hover:bg-white/10'
                  }`}
                >
                  {isMicMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  <span className="text-[10px] font-bold uppercase tracking-widest">
                    {isMicMuted ? 'Mic Off' : 'Mic On'}
                  </span>
                </button>
                <button
                  onClick={() => setIsSpeakerMuted(prev => !prev)}
                  className={`flex items-center gap-3 px-8 py-4 rounded-[1.5rem] transition-all active:scale-95 ${
                    isSpeakerMuted
                      ? 'bg-red-500/20 border border-red-500/30 text-red-400'
                      : 'bg-white/5 border border-white/10 text-white hover:bg-white/10'
                  }`}
                >
                  {isSpeakerMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  <span className="text-[10px] font-bold uppercase tracking-widest">
                    {isSpeakerMuted ? 'Speaker Off' : 'Speaker On'}
                  </span>
                </button>
              </div>
            )}
          </div>

          {/* Stats cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div className="bg-white p-6 rounded-[2rem] border border-gray-50 shadow-sm hover:shadow-md transition-all">
              <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-4">Call Time</div>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-orange-50 flex items-center justify-center shadow-inner">
                  <Clock className="w-5 h-5 text-[#FA9411]" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-900 font-mono tracking-tighter">{isInCall ? formatDuration(duration) : '00:00'}</div>
                  <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">Duration</div>
                </div>
              </div>
            </div>
            <div className="bg-white p-6 rounded-[2rem] border border-gray-50 shadow-sm hover:shadow-md transition-all">
              <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-4">Data Sent</div>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-orange-50 flex items-center justify-center shadow-inner">
                  <ArrowUpFromLine className="w-5 h-5 text-[#FA9411]" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-900 font-mono tracking-tighter">
                    {isInCall ? formatBytes(bytesSent).split(' ')[0] : '0.0'}
                    <span className="text-[10px] ml-1">{isInCall ? formatBytes(bytesSent).split(' ')[1] : 'KB'}</span>
                  </div>
                  <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">Your Voice</div>
                </div>
              </div>
            </div>
            <div className="bg-white p-6 rounded-[2rem] border border-gray-50 shadow-sm hover:shadow-md transition-all">
              <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-4">Data Received</div>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-orange-50 flex items-center justify-center shadow-inner">
                  <ArrowDownToLine className="w-5 h-5 text-[#FA9411]" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-900 font-mono tracking-tighter">
                    {isInCall ? formatBytes(bytesReceived).split(' ')[0] : '0.0'}
                    <span className="text-[10px] ml-1">{isInCall ? formatBytes(bytesReceived).split(' ')[1] : 'KB'}</span>
                  </div>
                  <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">Device Audio</div>
                </div>
              </div>
            </div>
            <div className="bg-white p-6 rounded-[2rem] border border-gray-50 shadow-sm hover:shadow-md transition-all">
              <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-4">Channels</div>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-orange-50 flex items-center justify-center shadow-inner">
                  <Zap className="w-5 h-5 text-[#FA9411]" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-900 font-mono tracking-tighter">
                    {isInCall ? '2' : '0'}<span className="text-[10px] ml-1">active</span>
                  </div>
                  <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">Full Duplex</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Panel */}
        <div className="space-y-8">
          <div className="bg-white p-10 rounded-[2.5rem] border border-gray-50 shadow-sm">
            <h3 className="text-[10px] font-bold text-gray-900 uppercase tracking-widest mb-10 flex items-center gap-3">
              <Settings className="w-4 h-4 text-[#FA9411]" />
              Call Information
            </h3>

            <div className="space-y-10">
              <div>
                <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest block mb-4">Link Security</label>
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-[1.5rem] border border-gray-100">
                  <div className="flex items-center gap-3">
                    <Globe className="w-4 h-4 text-gray-400" />
                    <span className="text-[10px] font-bold text-gray-900 uppercase">Encrypted WebSocket</span>
                  </div>
                  <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
                </div>
              </div>

              <div>
                <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest block mb-4">Connection Type</label>
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-[1.5rem] border border-gray-100">
                  <div className="flex items-center gap-3">
                    <Activity className="w-4 h-4 text-gray-400" />
                    <span className="text-[10px] font-bold text-gray-900 uppercase">Full Duplex PCM 8kHz</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest block mb-4">Your Microphone</label>
                <div className="h-6 bg-gray-50 rounded-full overflow-hidden flex gap-1 p-1.5 border border-gray-100">
                  {[...Array(20)].map((_, i) => (
                    <div
                      key={i}
                      className={`flex-1 rounded-[4px] transition-all duration-300 ${
                        isMicMuted ? 'bg-gray-100' :
                        (i / 20) * 100 <= micLevel ? 'bg-green-400' : 'bg-gray-100'
                      }`}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest block mb-4">Device Speaker</label>
                <div className="h-6 bg-gray-50 rounded-full overflow-hidden flex gap-1 p-1.5 border border-gray-100">
                  {[...Array(20)].map((_, i) => (
                    <div
                      key={i}
                      className={`flex-1 rounded-[4px] transition-all duration-300 ${
                        isSpeakerMuted ? 'bg-gray-100' :
                        (i / 20) * 100 <= listenLevel ? 'bg-[#FA9411]' : 'bg-gray-100'
                      }`}
                    />
                  ))}
                </div>
              </div>

              <div className="pt-10 border-t border-gray-50 mt-10">
                <div className="flex items-start gap-4 p-6 bg-orange-50/50 rounded-[2rem] border border-orange-100">
                  <AlertCircle className="w-5 h-5 text-[#FA9411] mt-0.5" />
                  <div>
                    <div className="text-[9px] font-bold text-[#FA9411] uppercase tracking-widest mb-2">Full Duplex Call</div>
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest leading-relaxed">
                      Both listen and speak channels are active simultaneously, like a real phone call.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Mute toggle cards */}
          <button
            onClick={() => setIsMicMuted(prev => !prev)}
            className={`w-full p-8 rounded-[2.5rem] border transition-all flex items-center justify-between group ${
              isMicMuted
                ? 'bg-red-50 border-red-100 text-red-500'
                : 'bg-white border-gray-50 text-gray-400 hover:border-green-100 hover:text-green-500'
            }`}
          >
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${
                isMicMuted ? 'bg-red-500 text-white' : 'bg-gray-50 text-gray-400 group-hover:bg-green-50 group-hover:text-green-500'
              }`}>
                {isMicMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
              </div>
              <div className="text-left">
                <div className="text-[10px] font-bold uppercase tracking-widest">Microphone</div>
                <div className="text-xs font-bold text-gray-900">{isMicMuted ? 'MUTED' : 'ACTIVE'}</div>
              </div>
            </div>
            <div className={`w-2 h-2 rounded-full ${isMicMuted ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`} />
          </button>

          <button
            onClick={() => setIsSpeakerMuted(prev => !prev)}
            className={`w-full p-8 rounded-[2.5rem] border transition-all flex items-center justify-between group ${
              isSpeakerMuted
                ? 'bg-red-50 border-red-100 text-red-500'
                : 'bg-white border-gray-50 text-gray-400 hover:border-orange-100 hover:text-[#FA9411]'
            }`}
          >
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${
                isSpeakerMuted ? 'bg-red-500 text-white' : 'bg-gray-50 text-gray-400 group-hover:bg-orange-50 group-hover:text-[#FA9411]'
              }`}>
                {isSpeakerMuted ? <VolumeX className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
              </div>
              <div className="text-left">
                <div className="text-[10px] font-bold uppercase tracking-widest">Speaker Output</div>
                <div className="text-xs font-bold text-gray-900">{isSpeakerMuted ? 'MUTED' : 'ACTIVE'}</div>
              </div>
            </div>
            <div className={`w-2 h-2 rounded-full ${isSpeakerMuted ? 'bg-red-500 animate-pulse' : 'bg-[#FA9411]'}`} />
          </button>

          {error && (
            <div className="bg-red-50 p-8 rounded-[2.5rem] border border-red-100 animate-in slide-in-from-right-4">
              <div className="flex items-center gap-3 mb-4">
                <Activity className="w-5 h-5 text-red-500" />
                <span className="text-[10px] font-bold text-red-500 uppercase tracking-widest">Problem Found</span>
              </div>
              <p className="text-xs font-bold text-red-900 leading-relaxed uppercase tracking-tight">{error}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
