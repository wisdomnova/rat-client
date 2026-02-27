import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { devicesAPI, groupsAPI, enrollmentsAPI } from '../api'
import { getWsUrl } from '../api/ws'
import { useAuthStore } from '../stores/authStore'
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Loader2,
  Square,
  AlertCircle,
  Users,
  Globe,
  Tablet,
  KeyRound,
  Activity,
  Zap,
  ShieldCheck,
  Cpu,
  Clock,
  ArrowLeft
} from 'lucide-react'

export default function AudioBroadcast() {
  const navigate = useNavigate()

  const [targetType, setTargetType] = useState<'all' | 'group' | 'enrollment'>('all')
  const [selectedGroupId, setSelectedGroupId] = useState<string>('')
  const [selectedEnrollmentToken, setSelectedEnrollmentToken] = useState<string>('')
  const [isConnecting, setIsConnecting] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [broadcastId, setBroadcastId] = useState<string | null>(null)
  const [deviceCount, setDeviceCount] = useState(0)
  const [connectedCount, setConnectedCount] = useState(0)
  const [skippedOffline, setSkippedOffline] = useState(0)
  const [bytesSent, setBytesSent] = useState(0)
  const [duration, setDuration] = useState(0)
  const [audioLevel, setAudioLevel] = useState(0)

  const wsRef = useRef<WebSocket | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animFrameRef = useRef<number>(0)
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isStreamingRef = useRef(false)
  const isMutedRef = useRef(false)

  // Fetch groups
  const { data: groups } = useQuery({
    queryKey: ['groups'],
    queryFn: () => groupsAPI.list(),
  })

  // Fetch enrollments
  const { data: enrollments } = useQuery({
    queryKey: ['enrollments'],
    queryFn: () => enrollmentsAPI.list(),
  })

  // Fetch device count
  const { data: deviceStats } = useQuery({
    queryKey: ['devices', 'stats'],
    queryFn: () => devicesAPI.getStats(),
  })

  useEffect(() => {
    isStreamingRef.current = isStreaming
  }, [isStreaming])

  useEffect(() => {
    isMutedRef.current = isMuted
  }, [isMuted])

  useEffect(() => {
    return () => { stopStreaming() }
  }, [])

  const startBroadcast = async () => {
    setIsConnecting(true)
    setError(null)

    try {
      // 1. Request mic access
      // 8kHz mono — optimised for 2G/3G (~16KB/s = ~128kbps)
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

      // 2. Create broadcast session
      const token = useAuthStore.getState().accessToken || ''
      const body: any = { target_type: targetType }
      if (targetType === 'group') {
        body.group_id = selectedGroupId
      } else if (targetType === 'enrollment') {
        body.enrollment_token = selectedEnrollmentToken
      }

      const response = await fetch('/api/v1/audio/broadcast', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        throw new Error(errData.error || 'Failed to create broadcast session')
      }

      const data = await response.json()
      const bid = data.data.broadcast_id
      setBroadcastId(bid)
      setDeviceCount(data.data.device_count)
      setSkippedOffline(data.data.skipped_offline || 0)

      // 3. Connect admin WebSocket
      const wsUrl = getWsUrl(`/ws/audio/broadcast/${bid}`)
      const ws = new WebSocket(wsUrl)
      ws.binaryType = 'arraybuffer'
      wsRef.current = ws

      ws.onopen = () => {
        console.log('Broadcast admin WS connected')
        // Start capturing immediately — devices will connect as they receive the command
        setIsConnecting(false)
        setIsStreaming(true)
        startAudioCapture()
        startDurationTimer()
      }

      ws.onmessage = (event) => {
        if (typeof event.data === 'string') {
          handleSignalMessage(JSON.parse(event.data))
        }
      }

      ws.onerror = () => {
        setError('WebSocket connection error')
        setIsConnecting(false)
      }

      ws.onclose = () => {
        setIsStreaming(false)
        setIsConnecting(false)
      }

    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        setError('Microphone access denied.')
      } else {
        setError(err.message || 'Failed to start broadcast')
      }
      setIsConnecting(false)
      stopStreaming()
    }
  }

  const handleSignalMessage = (msg: any) => {
    switch (msg.type) {
      case 'broadcast_info':
        if (msg.payload) {
          const info = typeof msg.payload === 'string' ? JSON.parse(msg.payload) : msg.payload
          setDeviceCount(info.device_count || 0)
          setConnectedCount(info.connected_count || 0)
        }
        break

      case 'device_connected': {
        const p = typeof msg.payload === 'string' ? JSON.parse(msg.payload) : msg.payload
        setConnectedCount(p.connected_count || 0)
        break
      }

      case 'device_disconnected': {
        const p = typeof msg.payload === 'string' ? JSON.parse(msg.payload) : msg.payload
        setConnectedCount(p.connected_count || 0)
        break
      }

      case 'error':
        setError(typeof msg.payload === 'string' ? msg.payload : JSON.stringify(msg.payload))
        break
    }
  }

  const startAudioCapture = () => {
    const stream = mediaStreamRef.current
    if (!stream) return

    // 8kHz AudioContext — low bandwidth for 2G/3G
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: 8000,
    })
    audioContextRef.current = audioContext

    const source = audioContext.createMediaStreamSource(stream)

    const analyser = audioContext.createAnalyser()
    analyser.fftSize = 256
    source.connect(analyser)
    analyserRef.current = analyser

    // 2048 samples at 8kHz = 256ms chunks, 4KB each
    const processor = audioContext.createScriptProcessor(2048, 1, 1)
    processorRef.current = processor

    processor.onaudioprocess = (e) => {
      if (!isStreamingRef.current || isMutedRef.current) return

      const inputData = e.inputBuffer.getChannelData(0)
      const pcm16 = new Int16Array(inputData.length)
      for (let i = 0; i < inputData.length; i++) {
        const s = Math.max(-1, Math.min(1, inputData[i]))
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
      }

      const ws = wsRef.current
      if (ws && ws.readyState === WebSocket.OPEN) {
        // Backpressure: skip chunk if WS buffer is backed up (slow device links)
        if (ws.bufferedAmount > 65536) return
        ws.send(pcm16.buffer)
        setBytesSent(prev => prev + pcm16.buffer.byteLength)
      }
    }

    source.connect(processor)
    processor.connect(audioContext.destination)

    updateAudioLevel()
  }

  const updateAudioLevel = () => {
    const analyser = analyserRef.current
    if (!analyser) return
    const dataArray = new Uint8Array(analyser.frequencyBinCount)
    analyser.getByteFrequencyData(dataArray)
    let sum = 0
    for (let i = 0; i < dataArray.length; i++) sum += dataArray[i]
    const avg = sum / dataArray.length
    setAudioLevel(Math.min(100, (avg / 128) * 100))
    animFrameRef.current = requestAnimationFrame(updateAudioLevel)
  }

  const startDurationTimer = () => {
    setDuration(0)
    durationIntervalRef.current = setInterval(() => {
      setDuration(prev => prev + 1)
    }, 1000)
  }

  const stopStreaming = () => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current)
      durationIntervalRef.current = null
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current)
      animFrameRef.current = 0
    }
    if (processorRef.current) {
      processorRef.current.disconnect()
      processorRef.current = null
    }
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    analyserRef.current = null
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop())
      mediaStreamRef.current = null
    }
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    if (broadcastId) {
      const token = useAuthStore.getState().accessToken || ''
      fetch(`/api/v1/audio/broadcast/${broadcastId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      }).catch(() => {})
    }

    setIsStreaming(false)
    setIsConnecting(false)
    setBroadcastId(null)
    setBytesSent(0)
    setDuration(0)
    setAudioLevel(0)
    setConnectedCount(0)
    setSkippedOffline(0)
  }

  const toggleMute = () => setIsMuted(prev => !prev)

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, '0')
    const sec = (s % 60).toString().padStart(2, '0')
    return `${m}:${sec}`
  }

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const groupList = Array.isArray(groups) ? groups : (groups as any)?.data || []
  const enrollmentList = Array.isArray(enrollments) ? enrollments : (enrollments as any)?.data || []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-6">
        <button
          onClick={() => navigate(-1)}
          className="p-4 hover:bg-gray-100 rounded-full transition-all active:scale-90"
        >
          <ArrowLeft className="w-6 h-6 text-gray-400" />
        </button>
        <div>
          <h1 className="text-4xl font-bold text-gray-900 tracking-tight">Voice Announcement</h1>
          <p className="text-gray-500 font-medium mt-1">
            Send live audio to multiple devices at once
          </p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto pt-8">
        <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden transition-all hover:shadow-md">
          {/* Status Bar */}
          <div className={`px-8 py-4 flex items-center justify-between text-sm font-bold ${
            isStreaming ? 'bg-red-50 text-red-600' :
            isConnecting ? 'bg-orange-50 text-[#FA9411]' :
            'bg-gray-50 text-gray-400'
          }`}>
            <div className="flex items-center gap-3">
              <div className={`w-2.5 h-2.5 rounded-full ${isStreaming ? 'bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.5)]' : isConnecting ? 'bg-[#FA9411] animate-pulse' : 'bg-gray-300'}`} />
              <span className="uppercase tracking-widest text-[10px]">
                {isStreaming ? 'Live' :
                 isConnecting ? 'Connecting...' :
                 'Ready'}
              </span>
            </div>
            {isStreaming && (
              <div className="flex items-center gap-6 font-bold text-xs uppercase tracking-tighter">
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5" />
                  {formatDuration(duration)}
                </div>
                <div className="flex items-center gap-2">
                  <Activity className="w-3.5 h-3.5" />
                  {formatBytes(bytesSent)}
                </div>
              </div>
            )}
          </div>

          {/* Target Selection (only when not streaming) */}
          {!isStreaming && !isConnecting && (
            <div className="px-8 py-8 border-b border-gray-50 space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-gray-50 flex items-center justify-center">
                  <Users className="w-4 h-4 text-gray-400" />
                </div>
                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-widest">Select Audience</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <button
                  onClick={() => setTargetType('all')}
                  className={`flex items-center gap-4 px-6 py-4 rounded-[1.5rem] border-2 transition-all active:scale-95 ${
                    targetType === 'all'
                      ? 'border-[#FA9411] bg-orange-50 text-[#FA9411]'
                      : 'border-gray-50 bg-gray-50/50 text-gray-500 hover:border-gray-200'
                  }`}
                >
                  <Globe className="w-5 h-5" />
                  <span className="font-bold text-sm">Everyone</span>
                </button>
                <button
                  onClick={() => setTargetType('enrollment')}
                  className={`flex items-center gap-4 px-6 py-4 rounded-[1.5rem] border-2 transition-all active:scale-95 ${
                    targetType === 'enrollment'
                      ? 'border-[#FA9411] bg-orange-50 text-[#FA9411]'
                      : 'border-gray-50 bg-gray-50/50 text-gray-500 hover:border-gray-200'
                  }`}
                >
                  <KeyRound className="w-5 h-5" />
                  <span className="font-bold text-sm">By Link</span>
                </button>
                <button
                  onClick={() => setTargetType('group')}
                  className={`flex items-center gap-4 px-6 py-4 rounded-[1.5rem] border-2 transition-all active:scale-95 ${
                    targetType === 'group'
                      ? 'border-[#FA9411] bg-orange-50 text-[#FA9411]'
                      : 'border-gray-50 bg-gray-50/50 text-gray-500 hover:border-gray-200'
                  }`}
                >
                  <ShieldCheck className="w-5 h-5" />
                  <span className="font-bold text-sm">By Group</span>
                </button>
              </div>

              {targetType === 'enrollment' && (
                <div className="animate-in slide-in-from-top-2">
                  <select
                    value={selectedEnrollmentToken}
                    onChange={(e) => setSelectedEnrollmentToken(e.target.value)}
                    className="w-full px-6 py-4 bg-gray-50 border-0 rounded-[1.5rem] text-sm font-bold text-gray-900 focus:ring-2 focus:ring-[#FA9411] outline-none appearance-none cursor-pointer"
                  >
                    <option value="">Choose a setup link...</option>
                    {enrollmentList.map((e: any) => (
                      <option key={e.id} value={e.token}>
                        {e.name || e.token} — {e.current_uses} Device{e.current_uses !== 1 ? 's' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {targetType === 'group' && (
                <div className="animate-in slide-in-from-top-2">
                  <select
                    value={selectedGroupId}
                    onChange={(e) => setSelectedGroupId(e.target.value)}
                    className="w-full px-6 py-4 bg-gray-50 border-0 rounded-[1.5rem] text-sm font-bold text-gray-900 focus:ring-2 focus:ring-[#FA9411] outline-none appearance-none cursor-pointer"
                  >
                    <option value="">Choose a group...</option>
                    {groupList.map((g: any) => (
                      <option key={g.id} value={g.id}>
                        {g.name} — {g.device_count || 0} Device{g.device_count !== 1 ? 's' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {targetType === 'all' && deviceStats && (
                <div className="bg-blue-50/50 px-6 py-4 rounded-[1.5rem] flex items-center gap-3">
                  <Zap className="w-4 h-4 text-blue-500" />
                  <p className="text-xs font-bold text-blue-600 uppercase tracking-widest">
                    Ready to reach all {(deviceStats as any)?.total_devices || 0} active devices
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Connected Devices Counter */}
          {isStreaming && (
            <div className="px-8 py-6 border-b border-gray-50 flex items-center justify-between bg-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#FA9411]/10 flex items-center justify-center">
                  <Tablet className="w-5 h-5 text-[#FA9411]" />
                </div>
                <div>
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Active Listeners</div>
                  <div className="text-sm font-bold text-gray-900">Connection Status</div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-gray-900">{connectedCount}</span>
                  <span className="text-sm font-bold text-gray-300">/ {deviceCount}</span>
                </div>
                {skippedOffline > 0 && (
                  <div className="bg-red-50 text-red-500 text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-lg border border-red-100">
                    {skippedOffline} Missing
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Mic Button & Controls */}
          <div className="px-8 py-16 flex flex-col items-center space-y-12 bg-white relative">
            <div className="relative">
              {isStreaming && !isMuted && (
                <>
                  <div
                    className="absolute inset-0 rounded-full bg-[#FA9411] animate-ping opacity-20"
                    style={{ transform: `scale(${1 + audioLevel / 40})` }}
                  />
                  <div
                    className="absolute inset-0 rounded-full bg-[#FA9411]/5"
                    style={{
                      transform: `scale(${1.2 + audioLevel / 80})`,
                      transition: 'transform 0.1s ease-out',
                    }}
                  />
                </>
              )}

              <button
                onClick={isStreaming ? toggleMute : startBroadcast}
                disabled={isConnecting || (targetType === 'group' && !selectedGroupId) || (targetType === 'enrollment' && !selectedEnrollmentToken)}
                className={`relative w-40 h-40 rounded-full flex items-center justify-center transition-all duration-300 shadow-2xl active:scale-90 ${
                  isConnecting
                    ? 'bg-orange-100 text-[#FA9411] cursor-wait'
                    : isStreaming
                      ? isMuted
                        ? 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                        : 'bg-[#FA9411] text-white hover:bg-orange-600 shadow-orange-200'
                      : 'bg-black text-white hover:bg-gray-800 shadow-gray-200 disabled:opacity-20 disabled:grayscale'
                }`}
              >
                {isConnecting ? (
                  <Loader2 className="w-16 h-16 animate-spin" />
                ) : isStreaming ? (
                  isMuted ? <MicOff className="w-16 h-16" /> : <Mic className="w-16 h-16" />
                ) : (
                  <Mic className="w-16 h-16" />
                )}
              </button>
            </div>

            <div className="text-center space-y-3">
              {!isStreaming && !isConnecting && (
                <>
                  <p className="text-xl font-bold text-gray-900 tracking-tight">
                    Tap to start talking
                  </p>
                  <p className="text-sm text-gray-400 font-medium">
                    Your voice will play out loud on {targetType === 'all' ? 'every' : 'the selected'} device
                  </p>
                </>
              )}
              {isConnecting && (
                <div className="flex flex-col items-center gap-2">
                  <p className="text-xl font-bold text-[#FA9411] tracking-tight animate-pulse">Connecting...</p>
                  <p className="text-xs font-bold text-gray-300 uppercase tracking-widest">Waking up devices</p>
                </div>
              )}
              {isStreaming && (
                <>
                  <p className="text-xl font-bold text-gray-900 tracking-tight">
                    {isMuted ? 'Microphone Off' : 'Talking to Devices...'}
                  </p>
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    <p className="text-sm text-gray-500 font-bold">
                      {connectedCount === 0
                        ? 'Connecting to devices...'
                        : `${connectedCount} Device${connectedCount > 1 ? 's' : ''} active`}
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* Audio Level */}
            {isStreaming && (
              <div className="w-full max-w-sm px-8">
                <div className="flex items-center gap-6">
                  {isMuted ? (
                    <VolumeX className="w-5 h-5 text-gray-300" />
                  ) : (
                    <Volume2 className="w-5 h-5 text-[#FA9411]" />
                  )}
                  <div className="flex-1 bg-gray-50 rounded-full h-4 overflow-hidden p-1 border border-gray-100">
                    <div
                      className={`h-full rounded-full transition-all duration-100 shadow-sm ${
                        isMuted ? 'bg-gray-200' :
                        audioLevel > 75 ? 'bg-red-500' :
                        audioLevel > 40 ? 'bg-[#FA9411]' :
                        'bg-green-500'
                      }`}
                      style={{ width: `${isMuted ? 0 : audioLevel}%` }}
                    />
                  </div>
                </div>
              </div>
            )}

            {(isStreaming || isConnecting) && (
              <button
                onClick={stopStreaming}
                className="group flex items-center gap-3 px-8 py-4 bg-black text-white rounded-[1.5rem] hover:bg-gray-800 transition-all active:scale-95 shadow-xl shadow-gray-200"
              >
                <Square className="w-4 h-4 text-red-500 fill-red-500 group-hover:scale-110 transition-transform" />
                <span className="font-bold">End Announcement</span>
              </button>
            )}
          </div>

          {error && (
            <div className="px-8 py-5 bg-red-50 border-t border-red-100 text-red-600 font-bold text-sm animate-in fade-in slide-in-from-bottom-2">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5" />
                {error}
              </div>
            </div>
          )}

          <div className="px-8 py-6 bg-gray-50 border-t border-gray-100">
            <div className="flex items-start gap-4">
              <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center shadow-sm">
                <Cpu className="w-4 h-4 text-gray-400" />
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Network Usage</p>
                <div className="text-xs text-gray-500 leading-relaxed font-medium">
                  Optimized for fast delivery over 2G/3G networks. 
                  Devices auto-reconnect if signal drops to make sure the message gets through.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
