import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { devicesAPI, trackingAPI } from '../api'
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
  Map
} from 'lucide-react'

// Fix default marker icons in bundled builds
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

// Phone pin marker with pulsing ring
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

// Google Maps tile URLs
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

// Component to keep map centered on the device
function MapFollower({ position, follow }: { position: [number, number] | null; follow: boolean }) {
  const map = useMap()

  useEffect(() => {
    if (position && follow) {
      map.setView(position, map.getZoom(), { animate: true, duration: 0.5 })
    }
  }, [position, follow, map])

  return null
}

export default function LiveTracking() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [_sessionId, setSessionId] = useState<string | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isActive, setIsActive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [follow, setFollow] = useState(true)
  const [satellite, setSatellite] = useState(false)

  // Location data
  const [currentPosition, setCurrentPosition] = useState<LocationPoint | null>(null)
  const [trail, setTrail] = useState<[number, number][]>([])
  const [_dailyDistance, setDailyDistance] = useState(0)
  const [totalDistance, setTotalDistance] = useState(0)
  const [pointCount, setPointCount] = useState(0)
  const [startTime, setStartTime] = useState<Date | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const sessionRef = useRef<string | null>(null)

  const { data: device, isLoading } = useQuery({
    queryKey: ['device', id],
    queryFn: () => devicesAPI.get(id!),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  })

  const startTracking = useCallback(async () => {
    if (!id) return
    setIsConnecting(true)
    setError(null)

    try {
      // Create a tracking session
      const session = await trackingAPI.createSession(id)
      setSessionId(session.session_id)
      sessionRef.current = session.session_id
      setStartTime(new Date())

      // Connect admin WebSocket
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${protocol}//${window.location.host}/ws/tracking/admin/${session.session_id}`

      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        console.log('Tracking WS connected')
        setIsConnecting(false)
        setIsActive(true)
      }

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          if (msg.type === 'location_update') {
            // Backend wraps data in TrackingSignalMessage with nested payload
            const data = msg.payload || msg
            if (data.point) {
              setCurrentPosition(data.point)
              setTrail(prev => {
                const newTrail = [...prev, [data.point.lat, data.point.lng] as [number, number]]
                // Cap trail length in UI
                return newTrail.length > 5000 ? newTrail.slice(-5000) : newTrail
              })
              setDailyDistance(data.daily_distance_km ?? 0)
              setTotalDistance(data.total_distance_km ?? 0)
              setPointCount(data.point_count ?? 0)
            }
          } else if (msg.type === 'device_connected') {
            console.log('Device connected to tracking session')
          } else if (msg.type === 'device_disconnected') {
            console.log('Device disconnected from tracking session')
          } else if (msg.type === 'session_info') {
            console.log('Session info received:', msg.payload)
            // Restore trail if reconnecting to existing session
            const info = msg.payload || {}
            if (info.trail && info.trail.length > 0) {
              setTrail(info.trail.map((p: LocationPoint) => [p.lat, p.lng] as [number, number]))
              setDailyDistance(info.daily_distance_km ?? 0)
              setTotalDistance(info.total_distance_km ?? 0)
              setPointCount(info.point_count ?? 0)
              const lastPt = info.trail[info.trail.length - 1]
              setCurrentPosition(lastPt)
            }
          }
        } catch (e) {
          console.error('Error parsing tracking message:', e)
        }
      }

      ws.onerror = (e) => {
        console.error('Tracking WS error:', e)
        setError('WebSocket connection error')
        setIsConnecting(false)
      }

      ws.onclose = () => {
        console.log('Tracking WS closed')
        setIsActive(false)
        setIsConnecting(false)
      }
    } catch (e: any) {
      console.error('Failed to start tracking:', e)
      setError(e.response?.data?.message || e.message || 'Failed to start tracking')
      setIsConnecting(false)
    }
  }, [id])

  const stopTracking = useCallback(async () => {
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    if (sessionRef.current) {
      try {
        await trackingAPI.endSession(sessionRef.current)
      } catch (e) {
        console.error('Error ending session:', e)
      }
    }
    setIsActive(false)
    setSessionId(null)
    sessionRef.current = null
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
      if (sessionRef.current) {
        trackingAPI.endSession(sessionRef.current).catch(() => {})
      }
    }
  }, [])

  const formatSpeed = (mps: number) => {
    const kmh = mps * 3.6
    return kmh < 1 ? 'Stationary' : `${kmh.toFixed(1)} km/h`
  }

  const formatDuration = () => {
    if (!startTime) return '--:--'
    const elapsed = Math.floor((Date.now() - startTime.getTime()) / 1000)
    const mins = Math.floor(elapsed / 60)
    const secs = elapsed % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Update duration display
  const [, forceUpdate] = useState(0)
  useEffect(() => {
    if (!isActive) return
    const timer = setInterval(() => forceUpdate(v => v + 1), 1000)
    return () => clearInterval(timer)
  }, [isActive])

  const defaultCenter: [number, number] = currentPosition
    ? [currentPosition.lat, currentPosition.lng]
    : [0, 0]

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#FA9411]" />
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 px-4 md:px-0">
        <div className="flex items-center gap-6">
          <button
            onClick={() => {
              stopTracking()
              navigate(`/devices/${id}`)
            }}
            className="p-4 hover:bg-gray-100 rounded-full transition-all active:scale-90"
          >
            <ArrowLeft className="w-6 h-6 text-gray-400" />
          </button>
          <div>
            <h1 className="text-4xl font-bold text-gray-900 tracking-tight flex items-center gap-3">
              Device Tracking
            </h1>
            <p className="text-gray-500 font-medium mt-1">
              {device?.name || device?.model || 'Generic Device'} 
              {isActive ? (
                <span className="text-[#FA9411] font-bold ml-2 inline-flex items-center gap-2">
                  <div className="w-2.5 h-2.5 bg-[#FA9411] rounded-full animate-pulse shadow-[0_0_12px_rgba(250,148,17,0.5)]" />
                  Active Tracking
                </span>
              ) : (
                <span className="text-gray-400 font-bold ml-2 uppercase text-[10px] tracking-widest bg-gray-50 px-2 py-1 rounded-lg">Standby</span>
              )}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSatellite(!satellite)}
            className={`flex items-center gap-2 px-6 py-3.5 rounded-[1.5rem] text-sm font-bold transition-all active:scale-95 shadow-sm ${
              satellite
                ? 'bg-black text-white'
                : 'bg-white border-2 border-gray-100 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {satellite ? <Map className="w-4 h-4" /> : <Satellite className="w-4 h-4" />}
            {satellite ? 'Street Map' : 'Satellite view'}
          </button>
          
          {isActive && (
            <button
              onClick={() => setFollow(!follow)}
              className={`flex items-center gap-2 px-6 py-3.5 rounded-[1.5rem] text-sm font-bold transition-all active:scale-95 shadow-sm ${
                follow
                  ? 'bg-blue-50 text-blue-600 border-2 border-blue-100'
                  : 'bg-white border-2 border-gray-100 text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Locate className="w-4 h-4" />
              {follow ? 'Locked to Device' : 'Free Map Mode'}
            </button>
          )}

          {!isActive ? (
            <button
              onClick={startTracking}
              disabled={isConnecting || device?.status !== 'online'}
              className="flex items-center gap-2 px-8 py-3.5 bg-black text-white rounded-[1.5rem] hover:bg-gray-800 font-bold transition-all active:scale-95 disabled:opacity-50 shadow-xl shadow-gray-200"
            >
              {isConnecting ? (
                <Loader2 className="w-4 h-4 animate-spin text-[#FA9411]" />
              ) : (
                <Navigation className="w-4 h-4 text-[#FA9411]" />
              )}
              {isConnecting ? 'Linking Device...' : 'Start Tracking'}
            </button>
          ) : (
            <button
              onClick={stopTracking}
              className="flex items-center gap-2 px-8 py-3.5 bg-red-50 text-red-600 rounded-[1.5rem] hover:bg-red-100 font-bold transition-all active:scale-95"
            >
              Stop Tracking
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mx-4 md:mx-0 bg-red-50 border border-red-100 text-red-700 px-8 py-5 rounded-[2rem] font-bold shadow-sm animate-in slide-in-from-top-4">
          {error}
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-8 min-h-[650px] px-4 md:px-0">
        {/* Map Container */}
        <div className="flex-1 bg-white rounded-[3rem] border border-gray-100 overflow-hidden shadow-sm relative shadow-2xl shadow-gray-200">
          {currentPosition ? (
            <MapContainer
              center={defaultCenter}
              zoom={17}
              style={{ height: '100%', width: '100%' }}
              zoomControl={false}
            >
              <TileLayer
                url={satellite ? TILE_URLS.satellite : TILE_URLS.roadmap}
                maxZoom={22}
              />

              <MapFollower
                position={[currentPosition.lat, currentPosition.lng]}
                follow={follow}
              />

              <Marker
                position={[currentPosition.lat, currentPosition.lng]}
                icon={phoneIcon}
              >
                <Tooltip direction="top" offset={[0, 0]} permanent={false}>
                  <div className="p-3 bg-white rounded-xl shadow-xl min-w-[140px] border border-gray-50">
                    <div className="font-bold text-gray-900 text-sm mb-1">
                      {device?.name || device?.model || 'Device'}
                    </div>
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
                <Circle
                  center={[currentPosition.lat, currentPosition.lng]}
                  radius={currentPosition.acc}
                  pathOptions={{
                    color: '#FA9411',
                    fillColor: '#FA9411',
                    fillOpacity: 0.05,
                    weight: 1,
                    dashArray: '4, 4'
                  }}
                />
              )}

              {trail.length > 1 && (
                <Polyline
                  positions={trail}
                  pathOptions={{
                    color: '#FA9411',
                    weight: 4,
                    opacity: 0.6,
                    lineJoin: 'round',
                    lineCap: 'round',
                  }}
                />
              )}
            </MapContainer>
          ) : (
<div className="h-full flex flex-col items-center justify-center bg-gray-950/5 text-gray-400 gap-6">
              <div className="w-24 h-24 bg-white rounded-[2.5rem] flex items-center justify-center shadow-2xl border border-gray-100">
                <MapPin className={`w-10 h-10 ${isActive ? 'text-[#FA9411] animate-bounce shadow-[0_12px_12px_rgba(250,148,17,0.3)]' : 'text-gray-200'}`} />
              </div>
              <div className="text-center space-y-2 px-8">
                <p className="text-xl font-bold text-gray-900">
                  {isActive
                    ? 'Syncing Satellite Fix...'
                    : 'System Ready'}
                </p>
                <p className="text-sm font-medium text-gray-500 max-w-[280px]">
                  {isActive
                    ? 'Pinging the Device for precise coordinates and movement data.'
                    : 'Awaiting your command to begin tracking the Device.'}
                </p>
              </div>
            </div>
          )}
          
          {/* Legend Overlay */}
          <div className="absolute bottom-10 left-10 pointer-events-none group-hover:scale-105 transition-all duration-300">
            <div className="bg-white/90 backdrop-blur-md border border-gray-100 p-6 rounded-[2.5rem] shadow-2xl space-y-4 min-w-[200px]">
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-50 pb-2">Tracking Integrity</div>
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-green-500 shadow-[0_0_8px_#22c55e]" />
                    <span className="text-[10px] font-bold text-gray-900 uppercase tracking-widest">Signal OK</span>
                  </div>
                  <span className="text-[10px] font-bold text-[#FA9411]">{isActive ? 'LIVE' : '—'}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#FA9411] shadow-[0_0_8px_#FA9411]" />
                    <span className="text-[10px] font-bold text-gray-900 uppercase tracking-widest">Device Link</span>
                  </div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase">{pointCount} Updates</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Sidebar */}
        <div className="w-full lg:w-[350px] flex flex-col gap-8">
          {/* Main Metrics */}
          <div className="bg-black text-white rounded-[2.5rem] p-10 shadow-2xl relative overflow-hidden group">
            <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-[#FA9411] opacity-20 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-1000" />
            
            <div className="relative z-10 space-y-8">
              <div className="flex items-center justify-between">
                <div className="p-4 bg-white/10 rounded-[1.5rem] backdrop-blur-sm border border-white/5 shadow-xl">
                  <Route className="w-8 h-8 text-[#FA9411]" />
                </div>
                <div className="px-5 py-2 bg-[#FA9411] rounded-full text-[10px] font-bold text-white uppercase tracking-widest shadow-xl">
                  Total Journey
                </div>
              </div>
              
              <div>
                <div className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-2">Distance Traveled</div>
                <div className="text-5xl font-bold tracking-tighter leading-none">{totalDistance.toFixed(2)} <span className="text-xl text-white/40 tracking-normal font-bold">km</span></div>
                <div className="text-sm font-bold text-white/20 mt-4 flex items-center gap-2">
                  <Clock className="w-3 h-3" />
                  Session: {isActive ? formatDuration() : '0:00'}
                </div>
              </div>
            </div>
          </div>

          {/* Current Status List */}
          <div className="bg-white rounded-[2.5rem] border-2 border-gray-50 p-8 shadow-sm space-y-8 flex-1">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-50 pb-4">Live Device Data</div>
            
            <div className="space-y-8">
              <MiniStat
                icon={<Gauge className="w-5 h-5 text-[#FA9411]" />}
                label="Movement Speed"
                value={currentPosition ? formatSpeed(currentPosition.spd) : 'Parked'}
              />
              <MiniStat
                icon={<Crosshair className="w-5 h-5 text-purple-500" />}
                label="Search Precision"
                value={currentPosition ? `\u00b1${currentPosition.acc.toFixed(0)}m` : '—'}
              />
              <MiniStat
                icon={<Mountain className="w-5 h-5 text-emerald-500" />}
                label="Altitude"
                value={currentPosition ? `${currentPosition.alt.toFixed(0)}m` : '—'}
              />
              <MiniStat
                icon={<Battery className="w-5 h-5 text-red-400" />}
                label="Device Charge"
                value={currentPosition && currentPosition.bat >= 0 ? `${currentPosition.bat}%` : '—'}
              />
              <MiniStat
                icon={<MapPin className="w-5 h-5 text-[#FA9411]" />}
                label="Updates"
                value={pointCount.toString()}
              />
            </div>
            
            {currentPosition && (
              <div className="pt-8 border-t border-gray-50 space-y-4">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Global Device Fix</div>
                <div className="bg-gray-50 p-5 rounded-[1.5rem] font-mono text-xs font-bold text-gray-900 border border-gray-100 flex items-center justify-center gap-4 group hover:bg-white hover:shadow-md transition-all">
                  <span className="text-gray-400">LAT</span> {currentPosition.lat.toFixed(6)}
                  <div className="w-px h-4 bg-gray-200" />
                  <span className="text-gray-400">LNG</span> {currentPosition.lng.toFixed(6)}
                </div>
                <p className="text-[10px] text-gray-300 font-bold uppercase tracking-widest text-center mt-2 group-hover:text-gray-400 transition-colors">
                  Last Update: {new Date(currentPosition.ts).toLocaleTimeString()}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function MiniStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="flex items-center justify-between group">
      <div className="flex items-center gap-4">
        <div className="p-2.5 bg-gray-50 rounded-xl group-hover:bg-white transition-colors duration-300">
          {icon}
        </div>
        <span className="text-sm font-bold text-gray-400">{label}</span>
      </div>
      <span className="text-sm font-bold text-gray-900">{value}</span>
    </div>
  )
}
