import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { devicesAPI, trackingAPI } from '../api'
import { getWsUrl } from '../api/ws'
import { useAuthStore } from '../stores/authStore'
import { MapContainer, TileLayer, Marker, Polyline, Circle, Tooltip, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  ArrowLeft,
  Navigation,
  Battery,
  Gauge,
  Mountain,
  Crosshair,
  MapPin,
  Loader2,
  Route,
  Clock,
  Locate,
  Satellite,
  Map,
  Ear,
  EarOff,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
  Smartphone,
  Globe,
  Zap,
  Activity,
  MonitorSmartphone,
  Link2,
} from 'lucide-react'

// ─── Leaflet icon fix ────────────────────────────────────────────────────────
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const phoneIcon = L.divIcon({
  className: 'phone-marker',
  html: `<div style="position:relative;width:36px;height:44px;">
    <div style="
      position:absolute; top:0; left:50%; transform:translateX(-50%);
      width:32px; height:40px; background:#FA9411; border-radius:50% 50% 50% 0;
      transform: translateX(-50%) rotate(-45deg);
      box-shadow: 0 3px 10px rgba(0,0,0,0.35);
      border: 2.5px solid white;
    "></div>
    <div style="
      position:absolute; top:6px; left:50%; transform:translateX(-50%);
      width:18px; height:18px; display:flex; align-items:center; justify-content:center;
      z-index:2;
    ">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
        <line x1="12" y1="18" x2="12.01" y2="18"/>
      </svg>
    </div>
    <div style="
      position:absolute; top:0; left:50%; transform:translateX(-50%);
      width:36px; height:36px; border-radius:50%;
      animation: phonePulse 2s ease-in-out infinite;
    "></div>
  </div>
  <style>
    @keyframes phonePulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(250,148,17,0.4); }
      50% { box-shadow: 0 0 0 12px rgba(250,148,17,0); }
    }
  </style>`,
  iconSize: [36, 44],
  iconAnchor: [18, 44],
  tooltipAnchor: [0, -44],
})

const TILE_URLS = {
  roadmap: 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
  satellite: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
}

interface LocationPoint {
  lat: number
  lng: number
  acc: number
  spd: number
  hdg: number
  alt: number
  bat: number
  ts: number
}

function MapFollower({ position, follow }: { position: [number, number] | null; follow: boolean }) {
  const map = useMap()
  useEffect(() => {
    if (position && follow) {
      map.setView(position, map.getZoom(), { animate: true, duration: 0.5 })
    }
  }, [position, follow, map])
  return null
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function TrackAndListen() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  // ── Tracking state ──────────────────────────────────────────────────────────
  // Note: trackSessionId is set but not directly read in component, kept for future use
  const [_trackSessionId, setTrackSessionId] = useState<string | null>(null)
  const [isTrackConnecting, setIsTrackConnecting] = useState(false)
  const [isTracking, setIsTracking] = useState(false)
  const [follow, setFollow] = useState(true)
  const [satellite, setSatellite] = useState(false)
  const [currentPosition, setCurrentPosition] = useState<LocationPoint | null>(null)
  const [trail, setTrail] = useState<[number, number][]>([])
  const [totalDistance, setTotalDistance] = useState(0)
  const [pointCount, setPointCount] = useState(0)
  const [trackStartTime, setTrackStartTime] = useState<Date | null>(null)
  const [trackError, setTrackError] = useState<string | null>(null)

  const trackWsRef = useRef<WebSocket | null>(null)
  const trackSessionRef = useRef<string | null>(null)

  // ── Listen state ────────────────────────────────────────────────────────────
  const [listenSessionId, setListenSessionId] = useState<string | null>(null)
  const [isListenConnecting, setIsListenConnecting] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [listenError, setListenError] = useState<string | null>(null)
  const [audioLevel, setAudioLevel] = useState(0)
  const [listenDuration, setListenDuration] = useState(0)
  // Note: bytesReceived is set but not directly read in component, kept for future use
  const [_bytesReceived, setBytesReceived] = useState(0)

  const listenWsRef = useRef<WebSocket | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const gainNodeRef = useRef<GainNode | null>(null)
  const nextPlayTimeRef = useRef(0)
  const listenDurationRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isListeningRef = useRef(false)

  const { data: device, isLoading } = useQuery({
    queryKey: ['device', id],
    queryFn: () => devicesAPI.get(id!),
    enabled: !!id,
    staleTime: 5_000,
    refetchInterval: 10_000,
  })

  // Note: activityLoading is set but not directly read in component, kept for future use
  const [_activityLoading, setActivityLoading] = useState(false)

  useEffect(() => { isListeningRef.current = isListening }, [isListening])

  // Poll activity while page is active
  useEffect(() => {
    if (!id || device?.status !== 'online') return
    const poll = async () => {
      setActivityLoading(true)
      try {
        const token = useAuthStore.getState().accessToken || ''
        await fetch(`/api/v1/devices/${id}/commands`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ command_type: 'GET_ACTIVITY', payload: {} }),
        })
        // The command result comes asynchronously — we poll the latest device info instead
        // Actually the command result would need to be fetched. For now we just use device telemetry.
      } catch {}
      setActivityLoading(false)
    }
    poll()
    const interval = setInterval(poll, 30_000)
    return () => clearInterval(interval)
  }, [id, device?.status])

  // ── Tracking logic ──────────────────────────────────────────────────────────

  const startTracking = useCallback(async () => {
    if (!id) return
    setIsTrackConnecting(true)
    setTrackError(null)
    try {
      const session = await trackingAPI.createSession(id)
      setTrackSessionId(session.session_id)
      trackSessionRef.current = session.session_id
      setTrackStartTime(new Date())

      const ws = new WebSocket(getWsUrl(`/ws/tracking/admin/${session.session_id}`))
      trackWsRef.current = ws

      ws.onopen = () => { setIsTrackConnecting(false); setIsTracking(true) }
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          if (msg.type === 'location_update') {
            const data = msg.payload || msg
            if (data.point) {
              setCurrentPosition(data.point)
              setTrail(prev => {
                const next = [...prev, [data.point.lat, data.point.lng] as [number, number]]
                return next.length > 5000 ? next.slice(-5000) : next
              })
              setTotalDistance(data.total_distance_km ?? 0)
              setPointCount(data.point_count ?? 0)
            }
          } else if (msg.type === 'session_info') {
            const info = msg.payload || {}
            if (info.trail?.length) {
              setTrail(info.trail.map((p: LocationPoint) => [p.lat, p.lng] as [number, number]))
              setTotalDistance(info.total_distance_km ?? 0)
              setPointCount(info.point_count ?? 0)
              setCurrentPosition(info.trail[info.trail.length - 1])
            }
          }
        } catch {}
      }
      ws.onerror = () => { setTrackError('WebSocket error'); setIsTrackConnecting(false) }
      ws.onclose = () => { setIsTracking(false); setIsTrackConnecting(false) }
    } catch (e: any) {
      setTrackError(e.response?.data?.message || e.message || 'Failed to start tracking')
      setIsTrackConnecting(false)
    }
  }, [id])

  const stopTracking = useCallback(async () => {
    trackWsRef.current?.close(); trackWsRef.current = null
    if (trackSessionRef.current) {
      try { await trackingAPI.endSession(trackSessionRef.current) } catch {}
    }
    setIsTracking(false); setTrackSessionId(null); trackSessionRef.current = null
  }, [])

  // ── Listen logic ────────────────────────────────────────────────────────────

  const startListening = async () => {
    if (!id) return
    setIsListenConnecting(true)
    setListenError(null)
    try {
      const token = useAuthStore.getState().accessToken || ''
      const resp = await fetch('/api/v1/audio/listen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ device_id: id }),
      })
      if (!resp.ok) throw new Error('Failed to create audio link')
      const data = await resp.json()
      const sid = data.data.session_id
      setListenSessionId(sid)

      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 8000 })
      audioContextRef.current = audioCtx
      const gain = audioCtx.createGain(); gain.gain.value = 1.0; gain.connect(audioCtx.destination)
      gainNodeRef.current = gain; nextPlayTimeRef.current = 0

      const ws = new WebSocket(getWsUrl(`/ws/audio/listen/admin/${sid}`))
      ws.binaryType = 'arraybuffer'; listenWsRef.current = ws

      ws.onopen = () => {
        fetch(`/api/v1/devices/${id}/commands`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ command_type: 'START_LISTEN', payload: { session_id: sid } }),
        }).catch(() => {})
      }

      ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          handleAudioData(event.data)
        } else if (typeof event.data === 'string') {
          const msg = JSON.parse(event.data)
          if (msg.type === 'device_ready') {
            setIsListenConnecting(false); setIsListening(true)
            setListenDuration(0)
            listenDurationRef.current = setInterval(() => setListenDuration(p => p + 1), 1000)
          } else if (msg.type === 'device_disconnected') {
            setListenError('Device disconnected'); setIsListening(false)
          } else if (msg.type === 'error') {
            setListenError(typeof msg.payload === 'string' ? msg.payload : JSON.stringify(msg.payload))
            setIsListenConnecting(false)
          }
        }
      }
      ws.onerror = () => { setListenError('WebSocket error'); setIsListenConnecting(false) }
      ws.onclose = () => { setIsListening(false); setIsListenConnecting(false) }
    } catch (e: any) {
      setListenError(e.message || 'Failed'); setIsListenConnecting(false)
    }
  }

  const handleAudioData = (buffer: ArrayBuffer) => {
    if (!isListeningRef.current) return
    const ctx = audioContextRef.current; const gain = gainNodeRef.current
    if (!ctx || !gain) return
    setBytesReceived(p => p + buffer.byteLength)
    const i16 = new Int16Array(buffer); const f32 = new Float32Array(i16.length)
    for (let i = 0; i < i16.length; i++) f32[i] = i16[i] / 32768
    let sum = 0; for (let i = 0; i < f32.length; i++) sum += Math.abs(f32[i])
    setAudioLevel(Math.min(100, (sum / f32.length) * 500))
    if (isMuted) return
    const ab = ctx.createBuffer(1, f32.length, 8000); ab.getChannelData(0).set(f32)
    const src = ctx.createBufferSource(); src.buffer = ab; src.connect(gain)
    const cur = ctx.currentTime
    if (nextPlayTimeRef.current < cur) nextPlayTimeRef.current = cur + 0.05
    src.start(nextPlayTimeRef.current); nextPlayTimeRef.current += ab.duration
  }

  const stopListening = () => {
    if (listenDurationRef.current) { clearInterval(listenDurationRef.current); listenDurationRef.current = null }
    listenWsRef.current?.close(); listenWsRef.current = null
    audioContextRef.current?.close(); audioContextRef.current = null
    if (listenSessionId && id) {
      const token = useAuthStore.getState().accessToken || ''
      fetch(`/api/v1/devices/${id}/commands`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ command_type: 'STOP_LISTEN', payload: { session_id: listenSessionId } }),
      }).catch(() => {})
      fetch(`/api/v1/audio/listen/${listenSessionId}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {})
    }
    setIsListening(false); setIsListenConnecting(false); setListenSessionId(null)
    setBytesReceived(0); setListenDuration(0); setAudioLevel(0)
  }

  // ── Cleanup ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      trackWsRef.current?.close()
      if (trackSessionRef.current) trackingAPI.endSession(trackSessionRef.current).catch(() => {})
      listenWsRef.current?.close()
      if (listenDurationRef.current) clearInterval(listenDurationRef.current)
      audioContextRef.current?.close()
    }
  }, [])

  // ── Duration ticker ─────────────────────────────────────────────────────────
  const [, tick] = useState(0)
  useEffect(() => {
    if (!isTracking) return
    const t = setInterval(() => tick(v => v + 1), 1000)
    return () => clearInterval(t)
  }, [isTracking])

  const formatTrackDuration = () => {
    if (!trackStartTime) return '--:--'
    const s = Math.floor((Date.now() - trackStartTime.getTime()) / 1000)
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`
  }

  const formatSpeed = (mps: number) => {
    const kmh = mps * 3.6
    return kmh < 1 ? 'Stationary' : `${kmh.toFixed(1)} km/h`
  }

  const formatListenDuration = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`


  const defaultCenter: [number, number] = currentPosition
    ? [currentPosition.lat, currentPosition.lng]
    : device?.latitude && device?.longitude
      ? [device.latitude, device.longitude]
      : [0, 0]

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#FA9411]" />
      </div>
    )
  }

  const deviceName = device ? `${device.manufacturer || ''} ${device.model || ''}`.trim() || device.name || 'Device' : 'Device'

  // ── RENDER ──────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-[1600px] mx-auto space-y-6 pb-20">
      {/* ── HEADER ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 px-4 md:px-0">
        <div className="flex items-center gap-6">
          <button onClick={() => { stopTracking(); stopListening(); navigate(`/devices/${id}`) }} className="p-4 hover:bg-gray-100 rounded-full transition-all active:scale-90">
            <ArrowLeft className="w-6 h-6 text-gray-400" />
          </button>
          <div>
            <h1 className="text-4xl font-bold text-gray-900 tracking-tight flex items-center gap-3">
              Track & Listen
            </h1>
            <p className="text-gray-500 font-medium mt-1">
              {deviceName}
              {(isTracking || isListening) && (
                <span className="text-[#FA9411] font-bold ml-2 inline-flex items-center gap-2">
                  <div className="w-2.5 h-2.5 bg-[#FA9411] rounded-full animate-pulse shadow-[0_0_12px_rgba(250,148,17,0.5)]" />
                  {isTracking && isListening ? 'Tracking + Listening' : isTracking ? 'Tracking' : 'Listening'}
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => setSatellite(!satellite)} className={`flex items-center gap-2 px-5 py-3 rounded-[1.5rem] text-sm font-bold transition-all active:scale-95 shadow-sm ${satellite ? 'bg-black text-white' : 'bg-white border-2 border-gray-100 text-gray-600 hover:bg-gray-50'}`}>
            {satellite ? <Map className="w-4 h-4" /> : <Satellite className="w-4 h-4" />}
            {satellite ? 'Streets' : 'Satellite'}
          </button>

          {isTracking && (
            <button onClick={() => setFollow(!follow)} className={`flex items-center gap-2 px-5 py-3 rounded-[1.5rem] text-sm font-bold transition-all active:scale-95 shadow-sm ${follow ? 'bg-blue-50 text-blue-600 border-2 border-blue-100' : 'bg-white border-2 border-gray-100 text-gray-600 hover:bg-gray-50'}`}>
              <Locate className="w-4 h-4" />
              {follow ? 'Locked' : 'Free'}
            </button>
          )}

          {/* Track button */}
          {!isTracking ? (
            <button onClick={startTracking} disabled={isTrackConnecting || device?.status !== 'online'} className="flex items-center gap-2 px-6 py-3 bg-black text-white rounded-[1.5rem] hover:bg-gray-800 font-bold transition-all active:scale-95 disabled:opacity-50 shadow-xl shadow-gray-200">
              {isTrackConnecting ? <Loader2 className="w-4 h-4 animate-spin text-[#FA9411]" /> : <Navigation className="w-4 h-4 text-[#FA9411]" />}
              {isTrackConnecting ? 'Linking...' : 'Track'}
            </button>
          ) : (
            <button onClick={stopTracking} className="flex items-center gap-2 px-6 py-3 bg-red-50 text-red-600 rounded-[1.5rem] hover:bg-red-100 font-bold transition-all active:scale-95">
              Stop Track
            </button>
          )}

          {/* Listen button */}
          {!isListening ? (
            <button onClick={startListening} disabled={isListenConnecting || device?.status !== 'online'} className="flex items-center gap-2 px-6 py-3 bg-black text-white rounded-[1.5rem] hover:bg-gray-800 font-bold transition-all active:scale-95 disabled:opacity-50 shadow-xl shadow-gray-200">
              {isListenConnecting ? <Loader2 className="w-4 h-4 animate-spin text-[#FA9411]" /> : <Ear className="w-4 h-4 text-[#FA9411]" />}
              {isListenConnecting ? 'Linking...' : 'Listen'}
            </button>
          ) : (
            <button onClick={stopListening} className="flex items-center gap-2 px-6 py-3 bg-red-50 text-red-600 rounded-[1.5rem] hover:bg-red-100 font-bold transition-all active:scale-95">
              <EarOff className="w-4 h-4" /> Stop Listen
            </button>
          )}
        </div>
      </div>

      {(trackError || listenError) && (
        <div className="mx-4 md:mx-0 bg-red-50 border border-red-100 text-red-700 px-8 py-5 rounded-[2rem] font-bold shadow-sm">
          {trackError || listenError}
        </div>
      )}

      {/* ── MAIN GRID: Map + Side Panels ────────────────────────────────────── */}
      <div className="flex flex-col xl:flex-row gap-6 min-h-[650px] px-4 md:px-0">
        {/* ── MAP ──────────────────────────────────────────────────────────── */}
        <div className="flex-1 bg-white rounded-[3rem] border border-gray-100 overflow-hidden shadow-2xl shadow-gray-200 relative min-h-[500px]">
          {currentPosition ? (
            <MapContainer center={defaultCenter} zoom={17} style={{ height: '100%', width: '100%' }} zoomControl={false}>
              <TileLayer url={satellite ? TILE_URLS.satellite : TILE_URLS.roadmap} maxZoom={22} />
              <MapFollower position={[currentPosition.lat, currentPosition.lng]} follow={follow} />
              <Marker position={[currentPosition.lat, currentPosition.lng]} icon={phoneIcon}>
                <Tooltip direction="top" permanent={false}>
                  <div className="p-3 bg-white rounded-xl shadow-xl min-w-[140px] border border-gray-50">
                    <div className="font-bold text-gray-900 text-sm mb-1">{deviceName}</div>
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                      {currentPosition.lat.toFixed(6)}, {currentPosition.lng.toFixed(6)}
                    </div>
                    {currentPosition.spd > 0.3 && (
                      <div className="mt-2 text-[10px] font-bold text-[#FA9411] uppercase tracking-widest bg-orange-50 px-2 py-1 rounded-md inline-block">
                        {(currentPosition.spd * 3.6).toFixed(1)} km/h
                      </div>
                    )}
                  </div>
                </Tooltip>
              </Marker>
              {currentPosition.acc > 0 && currentPosition.acc < 200 && (
                <Circle center={[currentPosition.lat, currentPosition.lng]} radius={currentPosition.acc} pathOptions={{ color: '#FA9411', fillColor: '#FA9411', fillOpacity: 0.05, weight: 1, dashArray: '4, 4' }} />
              )}
              {trail.length > 1 && (
                <Polyline positions={trail} pathOptions={{ color: '#FA9411', weight: 4, opacity: 0.6, lineJoin: 'round', lineCap: 'round' }} />
              )}
            </MapContainer>
          ) : (
            <div className="h-full flex flex-col items-center justify-center bg-gray-950/5 text-gray-400 gap-6">
              <div className="w-24 h-24 bg-white rounded-[2.5rem] flex items-center justify-center shadow-2xl border border-gray-100">
                <MapPin className={`w-10 h-10 ${isTracking ? 'text-[#FA9411] animate-bounce' : 'text-gray-200'}`} />
              </div>
              <div className="text-center space-y-2 px-8">
                <p className="text-xl font-bold text-gray-900">{isTracking ? 'Syncing GPS...' : 'System Ready'}</p>
                <p className="text-sm font-medium text-gray-500 max-w-[280px]">
                  {isTracking ? 'Waiting for GPS fix from the device.' : 'Press Track above to begin.'}
                </p>
              </div>
            </div>
          )}

          {/* Audio Overlay — bottom-left of map when listening */}
          {isListening && (
            <div className="absolute bottom-6 left-6 z-[1000] bg-black/80 backdrop-blur-xl border border-white/10 text-white rounded-[2rem] p-5 flex items-center gap-5 shadow-2xl animate-in slide-in-from-bottom-4">
              <div className="relative">
                {!isMuted && <div className="absolute inset-0 rounded-full bg-[#FA9411]/30 animate-ping" />}
                <button onClick={() => setIsMuted(!isMuted)} className={`relative w-12 h-12 rounded-full flex items-center justify-center transition-all active:scale-90 ${isMuted ? 'bg-gray-800 text-gray-500' : 'bg-[#FA9411] text-white'}`}>
                  {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                </button>
              </div>
              <div>
                <div className="text-[10px] font-bold text-[#FA9411] uppercase tracking-widest">Listening</div>
                <div className="text-sm font-bold font-mono tracking-tighter">{formatListenDuration(listenDuration)}</div>
              </div>
              <div className="flex gap-0.5 h-6 items-end">
                {[...Array(12)].map((_, i) => (
                  <div key={i} className={`w-1 rounded-full transition-all duration-150 ${(i / 12) * 100 <= audioLevel ? 'bg-[#FA9411]' : 'bg-white/10'}`} style={{ height: `${Math.random() * (audioLevel + 20) + 10}%` }} />
                ))}
              </div>
              <button onClick={stopListening} className="ml-2 px-4 py-2 bg-white/10 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-white/20 transition-all active:scale-95">
                Stop
              </button>
            </div>
          )}
        </div>

        {/* ── SIDE PANELS ──────────────────────────────────────────────────── */}
        <div className="w-full xl:w-[360px] flex flex-col gap-6">
          {/* Journey Stats */}
          <div className="bg-black text-white rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden group">
            <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-[#FA9411] opacity-20 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-1000" />
            <div className="relative z-10 space-y-6">
              <div className="flex items-center justify-between">
                <div className="p-3 bg-white/10 rounded-[1.2rem] backdrop-blur-sm border border-white/5">
                  <Route className="w-6 h-6 text-[#FA9411]" />
                </div>
                <div className="px-4 py-1.5 bg-[#FA9411] rounded-full text-[10px] font-bold text-white uppercase tracking-widest shadow-xl">
                  Journey
                </div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1">Distance</div>
                <div className="text-4xl font-bold tracking-tighter leading-none">
                  {totalDistance.toFixed(2)} <span className="text-lg text-white/40 font-bold">km</span>
                </div>
                <div className="text-xs font-bold text-white/20 mt-3 flex items-center gap-2">
                  <Clock className="w-3 h-3" /> {isTracking ? formatTrackDuration() : '0:00'}
                </div>
              </div>
            </div>
          </div>

          {/* Live Device Data */}
          <div className="bg-white rounded-[2.5rem] border-2 border-gray-50 p-7 shadow-sm space-y-6 flex-1">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-50 pb-3">Live Device Data</div>
            <div className="space-y-5">
              <MiniStat icon={<Gauge className="w-4 h-4 text-[#FA9411]" />} label="Speed" value={currentPosition ? formatSpeed(currentPosition.spd) : 'Parked'} />
              <MiniStat icon={<Crosshair className="w-4 h-4 text-purple-500" />} label="Precision" value={currentPosition ? `±${currentPosition.acc.toFixed(0)}m` : '—'} />
              <MiniStat icon={<Mountain className="w-4 h-4 text-emerald-500" />} label="Altitude" value={currentPosition ? `${currentPosition.alt.toFixed(0)}m` : '—'} />
              <MiniStat icon={<Battery className="w-4 h-4 text-red-400" />} label="Battery" value={currentPosition && currentPosition.bat >= 0 ? `${currentPosition.bat}%` : device?.battery_level != null ? `${device.battery_level}%` : '—'} />
              <MiniStat icon={<MapPin className="w-4 h-4 text-[#FA9411]" />} label="GPS Points" value={pointCount.toString()} />
            </div>

            {currentPosition && (
              <div className="pt-4 border-t border-gray-50 space-y-3">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Coordinates</div>
                <div className="bg-gray-50 p-4 rounded-[1.5rem] font-mono text-xs font-bold text-gray-900 border border-gray-100 flex items-center justify-center gap-4">
                  <span className="text-gray-400">LAT</span> {currentPosition.lat.toFixed(6)}
                  <div className="w-px h-4 bg-gray-200" />
                  <span className="text-gray-400">LNG</span> {currentPosition.lng.toFixed(6)}
                </div>
              </div>
            )}
          </div>

          {/* v1.1 Activity & Network Panel */}
          <div className="bg-white rounded-[2.5rem] border-2 border-gray-50 p-7 shadow-sm space-y-5">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-50 pb-3 flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-[#FA9411]" /> Activity & Network
            </div>
            <div className="space-y-5">
              <MiniStat
                icon={<MonitorSmartphone className="w-4 h-4 text-blue-500" />}
                label="Foreground App"
                value={device?.foreground_app?.split('.')?.pop() || '—'}
              />
              <MiniStat
                icon={<Globe className="w-4 h-4 text-indigo-500" />}
                label="Current URL"
                value={(() => { try { return device?.current_url ? new URL(device.current_url).hostname : '—' } catch { return device?.current_url || '—' } })()}
              />
              <MiniStat
                icon={device?.wifi_ssid ? <Wifi className="w-4 h-4 text-green-500" /> : <WifiOff className="w-4 h-4 text-gray-300" />}
                label="WiFi"
                value={device?.wifi_ssid || '—'}
              />
              <MiniStat
                icon={<Zap className="w-4 h-4 text-yellow-500" />}
                label="WiFi Signal"
                value={device?.wifi_rssi != null ? `${device.wifi_rssi} dBm` : '—'}
              />
              <MiniStat
                icon={<Link2 className="w-4 h-4 text-cyan-500" />}
                label="Link Speed"
                value={device?.link_speed_mbps != null ? `${device.link_speed_mbps} Mbps` : '—'}
              />
              <MiniStat
                icon={<Smartphone className="w-4 h-4 text-orange-500" />}
                label="Charging"
                value={device?.charging_type ? device.charging_type.toUpperCase() : 'Not charging'}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function MiniStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between group">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-gray-50 rounded-xl group-hover:bg-white transition-colors duration-300">{icon}</div>
        <span className="text-sm font-bold text-gray-400">{label}</span>
      </div>
      <span className="text-sm font-bold text-gray-900 truncate max-w-[140px]" title={value}>{value}</span>
    </div>
  )
}
