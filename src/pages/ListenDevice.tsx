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
  Square,
  VolumeX,
  Volume2,
  Activity,
  Zap,
  Ear,
  Settings,
  Clock,
  Globe,
  AlertCircle
} from 'lucide-react'

export default function ListenDevice() {
  const { id: deviceId } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [isConnecting, setIsConnecting] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [_deviceReady, setDeviceReady] = useState(false)
  const [bytesReceived, setBytesReceived] = useState(0)
  const [duration, setDuration] = useState(0)
  const [audioLevel, setAudioLevel] = useState(0)

  const wsRef = useRef<WebSocket | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const gainNodeRef = useRef<GainNode | null>(null)
  const nextPlayTimeRef = useRef(0)
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isListeningRef = useRef(false)

  const { data: device } = useQuery({
    queryKey: ['device', deviceId],
    queryFn: () => devicesAPI.get(deviceId!),
    enabled: !!deviceId,
  })

  useEffect(() => {
    isListeningRef.current = isListening
  }, [isListening])

  useEffect(() => {
    return () => { stopListening() }
  }, [])

  const startListening = async () => {
    if (!deviceId) return

    setIsConnecting(true)
    setError(null)

    try {
      // 1. Create listen session on backend
      const token = useAuthStore.getState().accessToken || ''
      const response = await fetch('/api/v1/audio/listen', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ device_id: deviceId }),
      })

      if (!response.ok) throw new Error('Failed to create audio link')
      const data = await response.json()
      const sid = data.data.session_id
      setSessionId(sid)

      // 2. Set up AudioContext for playback
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 8000,
      })
      audioContextRef.current = audioContext

      const gainNode = audioContext.createGain()
      gainNode.gain.value = 1.0
      gainNode.connect(audioContext.destination)
      gainNodeRef.current = gainNode

      nextPlayTimeRef.current = 0

      // 3. Connect admin WebSocket
      const wsUrl = getWsUrl(`/ws/audio/listen/admin/${sid}`)
      const ws = new WebSocket(wsUrl)
      ws.binaryType = 'arraybuffer'
      wsRef.current = ws

      ws.onopen = () => {
        console.log('Listen admin WS connected')

        // 4. Send START_LISTEN command to device
        fetch(`/api/v1/devices/${deviceId}/commands`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            command_type: 'START_LISTEN',
            payload: { session_id: sid },
          }),
        }).catch(err => console.error('Failed to send START_LISTEN command:', err))
      }

      ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          handleAudioData(event.data)
        } else if (typeof event.data === 'string') {
          handleSignalMessage(JSON.parse(event.data))
        }
      }

      ws.onerror = () => {
        setError('WebSocket connection error')
        setIsConnecting(false)
      }

      ws.onclose = () => {
        setIsListening(false)
        setIsConnecting(false)
        setDeviceReady(false)
      }

    } catch (err: any) {
      setError(err.message || 'Failed to start listening')
      setIsConnecting(false)
      stopListening()
    }
  }

  const handleSignalMessage = (msg: any) => {
    switch (msg.type) {
      case 'session_info':
        console.log('Audio link established:', msg.session_id)
        break

      case 'device_ready':
        console.log('Phone is sending audio')
        setDeviceReady(true)
        setIsConnecting(false)
        setIsListening(true)
        startDurationTimer()
        break

      case 'device_disconnected':
        setError('Device disconnected')
        setIsListening(false)
        setDeviceReady(false)
        break

      case 'error':
        setError(typeof msg.payload === 'string' ? msg.payload : JSON.stringify(msg.payload))
        setIsConnecting(false)
        break
    }
  }

  const handleAudioData = (buffer: ArrayBuffer) => {
    if (!isListeningRef.current) return

    const audioContext = audioContextRef.current
    const gainNode = gainNodeRef.current
    if (!audioContext || !gainNode) return

    setBytesReceived(prev => prev + buffer.byteLength)

    // Convert Int16 PCM to Float32 for Web Audio API
    const int16 = new Int16Array(buffer)
    const float32 = new Float32Array(int16.length)
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768
    }

    // Compute audio level for visualization
    let sum = 0
    for (let i = 0; i < float32.length; i++) {
      sum += Math.abs(float32[i])
    }
    const avg = sum / float32.length
    setAudioLevel(Math.min(100, avg * 500))

    if (isMuted) return

    // Schedule playback with proper timing to avoid gaps
    const audioBuffer = audioContext.createBuffer(1, float32.length, 8000)
    audioBuffer.getChannelData(0).set(float32)

    const source = audioContext.createBufferSource()
    source.buffer = audioBuffer
    source.connect(gainNode)

    // Gapless playback scheduling
    const currentTime = audioContext.currentTime
    if (nextPlayTimeRef.current < currentTime) {
      nextPlayTimeRef.current = currentTime + 0.05 // small buffer
    }

    source.start(nextPlayTimeRef.current)
    nextPlayTimeRef.current += audioBuffer.duration
  }

  const startDurationTimer = () => {
    setDuration(0)
    durationIntervalRef.current = setInterval(() => {
      setDuration(prev => prev + 1)
    }, 1000)
  }

  const stopListening = () => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current)
      durationIntervalRef.current = null
    }

    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }

    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }

    if (sessionId && deviceId) {
      const token = useAuthStore.getState().accessToken || ''
      fetch(`/api/v1/devices/${deviceId}/commands`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          command_type: 'STOP_LISTEN',
          payload: { session_id: sessionId },
        }),
      }).catch(() => {})

      fetch(`/api/v1/audio/listen/${sessionId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      }).catch(() => {})
    }

    setIsListening(false)
    setIsConnecting(false)
    setDeviceReady(false)
    setSessionId(null)
    setBytesReceived(0)
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
              <div className={`w-2 h-2 rounded-full ${isListening ? 'bg-green-500 animate-pulse' : 'bg-[#FA9411]'}`} />
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                {isListening ? 'Phone is sending audio' : 'Audio Link Standby'}
              </span>
            </div>
            <h1 className="text-4xl font-bold text-gray-900 tracking-tight">Hear Device Feed</h1>
            <p className="text-gray-500 font-medium mt-2">
              Listening to live audio from <span className="text-gray-900 font-bold">{deviceName}</span>
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
                <span className="text-xs font-bold text-gray-900 uppercase font-mono tracking-tighter">{isListening ? 'CONNECTED' : 'STANDBY'}</span>
             </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
        {/* Main Console */}
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-black rounded-[2.5rem] p-12 shadow-2xl shadow-gray-200 border border-gray-800 relative overflow-hidden flex flex-col justify-center items-center min-h-[500px]">
            {/* Waveform Visualizer */}
            {isListening && (
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

            {/* Hear Button */}
            <div className="relative z-10 flex flex-col items-center gap-12">
              <div className="relative">
                {isListening && !isMuted && (
                  <div className="absolute inset-0 rounded-full bg-[#FA9411]/20 animate-ping" />
                )}
                <button
                  onClick={isListening ? stopListening : startListening}
                  disabled={isConnecting}
                  className={`relative w-44 h-44 rounded-full flex flex-col items-center justify-center transition-all duration-300 shadow-2xl active:scale-90 border-4 ${
                    isConnecting
                      ? 'bg-black border-[#FA9411]/20 text-[#FA9411]'
                      : isListening
                        ? isMuted
                          ? 'bg-gray-900 border-gray-800 text-gray-500 hover:bg-black'
                          : 'bg-[#FA9411] border-white/20 text-white shadow-[#FA9411]/30 hover:bg-orange-600'
                        : 'bg-white border-transparent text-black hover:bg-gray-100 hover:scale-105'
                  }`}
                >
                  {isConnecting ? (
                    <Loader2 className="w-16 h-16 animate-spin" />
                  ) : isListening ? (
                    isMuted ? <VolumeX className="w-16 h-16" /> : <Ear className="w-16 h-16" />
                  ) : (
                    <Ear className="w-16 h-16" />
                  )}
                </button>
              </div>

              <div className="text-center">
                <div className="text-[10px] font-bold text-[#FA9411] uppercase tracking-[0.4em] mb-4">
                  {isListening ? 'Listening Live' : isConnecting ? 'Connecting...' : 'Ready to Listen'}
                </div>
                {isListening && !isMuted && (
                  <div className="flex gap-1 h-4 items-center justify-center">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="w-2 h-2 rounded-full bg-[#FA9411] animate-bounce" style={{ animationDelay: `${i * 0.1}s` }} />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* End Call Button */}
            {(isListening || isConnecting) && (
              <button 
                onClick={stopListening}
                className="absolute bottom-12 left-1/2 -translate-x-1/2 flex items-center gap-3 px-10 py-5 bg-white/5 border border-white/10 rounded-[1.5rem] text-white hover:bg-white/10 transition-all active:scale-95"
              >
                <Square className="w-3.5 h-3.5 text-[#FA9411] fill-[#FA9411]" />
                <span className="text-[10px] font-bold uppercase tracking-widest">Stop Feed</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
             <div className="bg-white p-8 rounded-[2rem] border border-gray-50 shadow-sm hover:shadow-md transition-all">
                <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-6">Link Duration</div>
                <div className="flex items-center gap-5">
                   <div className="w-14 h-14 rounded-2xl bg-orange-50 flex items-center justify-center shadow-inner">
                      <Clock className="w-6 h-6 text-[#FA9411]" />
                   </div>
                   <div>
                      <div className="text-3xl font-bold text-gray-900 font-mono tracking-tighter">{isListening ? formatDuration(duration) : '00:00'}</div>
                      <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Seconds Active</div>
                   </div>
                </div>
             </div>
             <div className="bg-white p-8 rounded-[2rem] border border-gray-50 shadow-sm hover:shadow-md transition-all">
                <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-6">Data Received</div>
                <div className="flex items-center gap-5">
                   <div className="w-14 h-14 rounded-2xl bg-orange-50 flex items-center justify-center shadow-inner">
                      <Zap className="w-6 h-6 text-[#FA9411]" />
                   </div>
                   <div>
                      <div className="text-3xl font-bold text-gray-900 font-mono tracking-tighter">
                        {isListening ? formatBytes(bytesReceived).split(' ')[0] : '0.0'} 
                        <span className="text-xs ml-1">{isListening ? formatBytes(bytesReceived).split(' ')[1] : 'KB'}</span>
                      </div>
                      <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Audio Received</div>
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
                Audio Link Info
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
                         <span className="text-[10px] font-bold text-gray-900 uppercase">PCM 8kHz Mono</span>
                      </div>
                   </div>
                </div>

                <div>
                   <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest block mb-4">Audio Output Monitor</label>
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
                         <div className="text-[9px] font-bold text-[#FA9411] uppercase tracking-widest mb-2">Notice</div>
                         <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest leading-relaxed">
                            This tool allows you to hear the environment around the Device in real-time.
                         </p>
                      </div>
                   </div>
                </div>
             </div>
          </div>

          <button
             onClick={toggleMute}
             className={`w-full p-8 rounded-[2.5rem] border transition-all flex items-center justify-between group ${
                isMuted 
                ? 'bg-orange-50 border-orange-100 text-[#FA9411]' 
                : 'bg-white border-gray-50 text-gray-400 hover:border-orange-100 hover:text-[#FA9411]'
             }`}
          >
             <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${
                   isMuted ? 'bg-[#FA9411] text-white' : 'bg-gray-50 text-gray-400 group-hover:bg-orange-50 group-hover:text-[#FA9411]'
                }`}>
                   {isMuted ? <VolumeX className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
                </div>
                <div className="text-left">
                   <div className="text-[10px] font-bold uppercase tracking-widest">Speaker Output</div>
                   <div className="text-xs font-bold text-gray-900">{isMuted ? 'MUTED' : 'UNMUTED'}</div>
                </div>
             </div>
             <div className={`w-2 h-2 rounded-full ${isMuted ? 'bg-[#FA9411] animate-pulse' : 'bg-gray-200'}`} />
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
