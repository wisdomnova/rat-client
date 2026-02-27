import { useState, useRef, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { devicesAPI } from '../api'
import { useAuthStore } from '../stores/authStore'
import {
  ArrowLeft,
  Mic,
  MicOff,
  Loader2,
  Tablet,
  Square,
  AlertCircle,
  Activity,
  Zap,
  Globe,
  Settings,
  Clock
} from 'lucide-react'

export default function LiveAudio() {
  const { id: deviceId } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [isConnecting, setIsConnecting] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [_deviceReady, setDeviceReady] = useState(false)
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

  const { data: device } = useQuery({
    queryKey: ['device', deviceId],
    queryFn: () => devicesAPI.get(deviceId!),
    enabled: !!deviceId,
  })

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopStreaming()
    }
  }, [])

  const startStreaming = async () => {
    if (!deviceId) return

    setIsConnecting(true)
    setError(null)

    try {
      // 1. Request mic access
      // 8kHz mono — optimised for 2G/3G (16KB/s = ~128kbps vs 32KB/s at 16kHz)
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

      // 2. Create audio session on backend
      const token = useAuthStore.getState().accessToken || ''
      const response = await fetch('/api/v1/audio/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ device_id: deviceId }),
      })

      if (!response.ok) throw new Error('Failed to create audio session')
      const data = await response.json()
      const sid = data.data.session_id
      setSessionId(sid)

      // 3. Connect admin WebSocket
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${wsProtocol}//${window.location.host}/ws/audio/admin/${sid}`
      const ws = new WebSocket(wsUrl)
      ws.binaryType = 'arraybuffer'
      wsRef.current = ws

      ws.onopen = () => {
        console.log('Audio admin WS connected')

        // 4. Send START_AUDIO command to device
        fetch(`/api/v1/devices/${deviceId}/commands`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            command_type: 'START_AUDIO',
            payload: { session_id: sid },
          }),
        }).catch(err => console.error('Failed to send START_AUDIO command:', err))
      }

      ws.onmessage = (event) => {
        if (typeof event.data === 'string') {
          const msg = JSON.parse(event.data)
          handleSignalMessage(msg)
        }
      }

      ws.onerror = () => {
        setError('WebSocket connection error')
        setIsConnecting(false)
      }

      ws.onclose = () => {
        console.log('Audio WS closed')
        setIsStreaming(false)
        setIsConnecting(false)
        setDeviceReady(false)
      }

    } catch (err: any) {
      console.error('Start streaming error:', err)
      if (err.name === 'NotAllowedError') {
        setError('Microphone access denied. Please allow microphone access in your browser.')
      } else {
        setError(err.message || 'Failed to start audio streaming')
      }
      setIsConnecting(false)
      stopStreaming()
    }
  }

  const handleSignalMessage = (msg: any) => {
    switch (msg.type) {
      case 'session_info':
        console.log('Audio session established:', msg.session_id)
        break

      case 'device_ready':
        console.log('Device ready for audio')
        setDeviceReady(true)
        setIsConnecting(false)
        setIsStreaming(true)
        // Now start capturing and sending audio
        startAudioCapture()
        startDurationTimer()
        break

      case 'audio_ready':
        console.log('Device audio subsystem ready:', msg)
        break

      case 'device_disconnected':
        setError('Device disconnected')
        setIsStreaming(false)
        setDeviceReady(false)
        break

      case 'error':
        setError(typeof msg.payload === 'string' ? msg.payload : JSON.stringify(msg.payload))
        setIsConnecting(false)
        break
    }
  }

  const startAudioCapture = () => {
    const stream = mediaStreamRef.current
    if (!stream) return

    // 8kHz AudioContext — matches getUserMedia constraint for consistent low bandwidth
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: 8000,
    })
    audioContextRef.current = audioContext

    const source = audioContext.createMediaStreamSource(stream)

    const analyser = audioContext.createAnalyser()
    analyser.fftSize = 256
    source.connect(analyser)
    analyserRef.current = analyser

    // 2048 samples at 8kHz = 256ms chunks, 4KB each — small enough for 2G
    const processor = audioContext.createScriptProcessor(2048, 1, 1)
    processorRef.current = processor

    processor.onaudioprocess = (e) => {
      if (!isStreamingRef.current || isMutedRef.current) return

      const inputData = e.inputBuffer.getChannelData(0)

      // Convert Float32 → Int16 PCM
      const pcm16 = new Int16Array(inputData.length)
      for (let i = 0; i < inputData.length; i++) {
        const s = Math.max(-1, Math.min(1, inputData[i]))
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
      }

      const ws = wsRef.current
      if (ws && ws.readyState === WebSocket.OPEN) {
        // Backpressure: if WS buffer > 64KB, skip this chunk.
        // Prevents latency buildup when server-to-device link is slow.
        if (ws.bufferedAmount > 65536) return
        ws.send(pcm16.buffer)
        setBytesSent(prev => prev + pcm16.buffer.byteLength)
      }
    }

    source.connect(processor)
    processor.connect(audioContext.destination) // required for processing to work

    // Start audio level animation
    updateAudioLevel()
  }

  // Use refs for the callback inside onaudioprocess
  const isStreamingRef = useRef(false)
  const isMutedRef = useRef(false)

  useEffect(() => {
    isStreamingRef.current = isStreaming
  }, [isStreaming])

  useEffect(() => {
    isMutedRef.current = isMuted
  }, [isMuted])

  const updateAudioLevel = () => {
    const analyser = analyserRef.current
    if (!analyser) return

    const dataArray = new Uint8Array(analyser.frequencyBinCount)
    analyser.getByteFrequencyData(dataArray)

    // Calculate average level
    let sum = 0
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i]
    }
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
    // Stop duration timer
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current)
      durationIntervalRef.current = null
    }

    // Stop animation frame
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current)
      animFrameRef.current = 0
    }

    // Stop AudioContext processing
    if (processorRef.current) {
      processorRef.current.disconnect()
      processorRef.current = null
    }
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    analyserRef.current = null

    // Stop media stream
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop())
      mediaStreamRef.current = null
    }

    // Close WebSocket
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }

    // If we have a session, send STOP_AUDIO command
    if (sessionId && deviceId) {
      const token = useAuthStore.getState().accessToken || ''
      fetch(`/api/v1/devices/${deviceId}/commands`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          command_type: 'STOP_AUDIO',
          payload: {},
        }),
      }).catch(() => {})

      // End session
      fetch(`/api/v1/audio/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      }).catch(() => {})
    }

    setIsStreaming(false)
    setIsConnecting(false)
    setDeviceReady(false)
    setSessionId(null)
    setBytesSent(0)
    setDuration(0)
    setAudioLevel(0)
  }

  const toggleMute = () => {
    setIsMuted(prev => !prev)
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
              <div className={`w-2 h-2 rounded-full ${isStreaming ? 'bg-green-500 animate-pulse' : 'bg-[#FA9411]'}`} />
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                {isStreaming ? 'Connection Established' : 'Voice Link Ready'}
              </span>
            </div>
            <h1 className="text-4xl font-bold text-gray-900 tracking-tight">Speak to Device</h1>
            <p className="text-gray-500 font-medium mt-2">
              Streaming live voice to <span className="text-gray-900 font-bold">{deviceName}</span>
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
          <div className="px-6 text-right">
             <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">Signal Status</div>
             <div className="flex items-center gap-2 justify-end">
                <span className="text-xs font-bold text-gray-900 uppercase font-mono tracking-tighter">{isStreaming ? 'CONNECTED' : 'STANDBY'}</span>
             </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
        {/* Main Console */}
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-black rounded-[2.5rem] p-12 shadow-2xl shadow-gray-200 border border-gray-800 relative overflow-hidden flex flex-col justify-center items-center min-h-[500px]">
            {/* Waveform Visualizer */}
            {isStreaming && (
              <div className="absolute inset-0 flex items-center justify-center opacity-20 pointer-events-none overflow-hidden h-full w-full">
                 <div className="flex items-end gap-1.5 px-20">
                    {[...Array(40)].map((_, i) => (
                      <div 
                        key={i} 
                        className="w-2 bg-[#FA9411] rounded-full transition-all duration-150"
                        style={{ 
                          height: `${Math.random() * (audioLevel + 20) + 5}%`,
                          opacity: isMuted ? 0.1 : 1
                        }}
                      />
                    ))}
                 </div>
              </div>
            )}

            {/* Mic Button */}
            <div className="relative z-10 flex flex-col items-center gap-12">
              <div className="relative">
                {isStreaming && !isMuted && (
                  <div className="absolute inset-0 rounded-full bg-[#FA9411]/20 animate-ping" />
                )}
                <button
                  onClick={isStreaming ? toggleMute : startStreaming}
                  disabled={isConnecting}
                  className={`relative w-44 h-44 rounded-full flex flex-col items-center justify-center transition-all duration-300 shadow-2xl active:scale-90 border-4 ${
                    isConnecting
                      ? 'bg-black border-[#FA9411]/20 text-[#FA9411]'
                      : isStreaming
                        ? isMuted
                          ? 'bg-gray-900 border-gray-800 text-gray-500 hover:bg-black'
                          : 'bg-[#FA9411] border-white/20 text-white shadow-[#FA9411]/30 hover:bg-orange-600'
                        : 'bg-white border-transparent text-black hover:bg-gray-100 hover:scale-105'
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

              <div className="text-center">
                <div className="text-[10px] font-bold text-[#FA9411] uppercase tracking-[0.4em] mb-4">
                  {isStreaming ? 'Stream Active' : isConnecting ? 'Connecting Tool...' : 'Ready to Talk'}
                </div>
                {isStreaming && !isMuted && (
                  <div className="flex gap-1 h-4 items-center justify-center">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="w-2 h-2 rounded-full bg-[#FA9411] animate-bounce" style={{ animationDelay: `${i * 0.1}s` }} />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* End Call Button */}
            {(isStreaming || isConnecting) && (
              <button 
                onClick={stopStreaming}
                className="absolute bottom-12 left-1/2 -translate-x-1/2 flex items-center gap-3 px-10 py-5 bg-white/5 border border-white/10 rounded-[1.5rem] text-white hover:bg-white/10 transition-all active:scale-95"
              >
                <Square className="w-3.5 h-3.5 text-[#FA9411] fill-[#FA9411]" />
                <span className="text-[10px] font-bold uppercase tracking-widest">End Call</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
             <div className="bg-white p-8 rounded-[2rem] border border-gray-50 shadow-sm hover:shadow-md transition-all">
                <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-6">Call Time</div>
                <div className="flex items-center gap-5">
                   <div className="w-14 h-14 rounded-2xl bg-orange-50 flex items-center justify-center shadow-inner">
                      <Clock className="w-6 h-6 text-[#FA9411]" />
                   </div>
                   <div>
                      <div className="text-3xl font-bold text-gray-900 font-mono tracking-tighter">{isStreaming ? formatDuration(duration) : '00:00'}</div>
                      <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Seconds Live</div>
                   </div>
                </div>
             </div>
             <div className="bg-white p-8 rounded-[2rem] border border-gray-50 shadow-sm hover:shadow-md transition-all">
                <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-6">Data Transfer</div>
                <div className="flex items-center gap-5">
                   <div className="w-14 h-14 rounded-2xl bg-orange-50 flex items-center justify-center shadow-inner">
                      <Zap className="w-6 h-6 text-[#FA9411]" />
                   </div>
                   <div>
                      <div className="text-3xl font-bold text-gray-900 font-mono tracking-tighter">
                        {isStreaming ? formatBytes(bytesSent).split(' ')[0] : '0.0'} 
                        <span className="text-xs ml-1">{isStreaming ? formatBytes(bytesSent).split(' ')[1] : 'KB'}</span>
                      </div>
                      <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Audio Sent</div>
                   </div>
                </div>
             </div>
          </div>
        </div>

        {/* Info & Settings */}
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
                   <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest block mb-4">Voice Input Monitor</label>
                   <div className="h-6 bg-gray-50 rounded-full overflow-hidden flex gap-1 p-1.5 border border-gray-100">
                      {[...Array(20)].map((_, i) => (
                         <div 
                          key={i} 
                          className={`flex-1 rounded-[4px] transition-all duration-300 ${
                            isMuted ? 'bg-gray-100' :
                            (i / 20) * 100 <= audioLevel ? 'bg-[#FA9411]' : 'bg-gray-100'
                          }`}
                        />
                      ))}
                   </div>
                </div>

                <div className="pt-10 border-t border-gray-50 mt-10">
                   <div className="flex items-start gap-4 p-6 bg-orange-50/50 rounded-[2rem] border border-orange-100">
                      <AlertCircle className="w-5 h-5 text-[#FA9411] mt-0.5" />
                      <div>
                         <div className="text-[9px] font-bold text-[#FA9411] uppercase tracking-widest mb-2">Helpful Tip</div>
                         <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest leading-relaxed">
                            Voice quality is automatically adjusted to work even on slow cellular connections. 
                         </p>
                      </div>
                   </div>
                </div>
             </div>
          </div>

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
