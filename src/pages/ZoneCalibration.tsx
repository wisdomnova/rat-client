import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, Polygon, Polyline, CircleMarker, Circle, Marker, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { attendanceAPI, groupsAPI, enrollmentsAPI } from '../api'
import type { EnrollmentToken } from '../types'
import { RotateCcw, Save, ChevronLeft, AlertCircle, Undo2, Check, X, PenTool, Map as MapIcon } from 'lucide-react'
import 'leaflet/dist/leaflet.css'

const MAX_CORNERS = 20

const TILE_URLS = {
  satellite: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
  street: 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
}

const userDotIcon = L.divIcon({
  html: '<div style="width:16px;height:16px;border-radius:50%;background:#FA9411;border:3px solid #fff;box-shadow:0 0 0 2px rgba(250,148,17,.4),0 2px 6px rgba(0,0,0,.4);animation:gps-pulse 2s infinite"></div><style>@keyframes gps-pulse{0%,100%{box-shadow:0 0 0 2px rgba(250,148,17,.4)}50%{box-shadow:0 0 0 8px rgba(250,148,17,.15)}}</style>',
  className: '',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
})

function FlyToUser({ didFly, setGpsPosition, setGpsAccuracy }: {
  didFly: React.MutableRefObject<boolean>
  setGpsPosition: (pos: [number, number]) => void
  setGpsAccuracy: (acc: number) => void
}) {
  const map = useMap()
  useEffect(() => {
    if (didFly.current || !navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude, longitude, accuracy } = pos.coords
        setGpsPosition([latitude, longitude])
        setGpsAccuracy(accuracy)
        if (!didFly.current) {
          didFly.current = true
          map.flyTo([latitude, longitude], 19, { duration: 1.2 })
        }
      },
      () => {},
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    )
  }, [map])
  return null
}

function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) { onMapClick(e.latlng.lat, e.latlng.lng) },
  })
  return null
}

interface Group { id: string; name: string }

export default function ZoneCalibration() {
  const navigate = useNavigate()
  const [corners, setCorners] = useState<{ lat: number; lng: number }[]>([])
  const [zoneName, setZoneName] = useState('')
  const [bufferMeters, setBufferMeters] = useState(30)
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState('')
  const [groups, setGroups] = useState<Group[]>([])
  const [enrollments, setEnrollments] = useState<EnrollmentToken[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [drawing, setDrawing] = useState(false)
  const [gpsPosition, setGpsPosition] = useState<[number, number] | null>(null)
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null)
  const [mapStyle, setMapStyle] = useState<'satellite' | 'street'>('satellite')
  const didFlyRef = useRef(false)

  useEffect(() => {
    groupsAPI.list().then((d: any) => setGroups(Array.isArray(d) ? d : [])).catch(() => {})
    enrollmentsAPI.list().then((d) => setEnrollments(Array.isArray(d) ? d.filter(e => e.is_active) : [])).catch(() => {})
  }, [])

  // Live GPS tracking
  useEffect(() => {
    if (!navigator.geolocation) return
    const id = navigator.geolocation.watchPosition(
      pos => {
        setGpsPosition([pos.coords.latitude, pos.coords.longitude])
        setGpsAccuracy(pos.coords.accuracy)
      },
      () => {},
      { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 }
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [])

  const handleMapClick = useCallback((lat: number, lng: number) => {
    if (!drawing) return
    if (corners.length < MAX_CORNERS) setCorners(prev => [...prev, { lat, lng }])
  }, [drawing, corners.length])

  const handleUndoPoint = () => {
    setCorners(prev => prev.slice(0, -1))
  }

  const startDrawing = () => {
    setCorners([])
    setDrawing(true)
  }

  const finishDrawing = () => {
    if (corners.length < 3) return
    setDrawing(false)
  }

  const cancelDrawing = () => {
    setCorners([])
    setDrawing(false)
  }

  const handleSave = async () => {
    if (!zoneName.trim()) { setError('Please name this area'); return }
    if (corners.length < 3) { setError('Select at least 3 points on the map'); return }
    try {
      setSaving(true); setError('')
      await attendanceAPI.createZone({
        name: zoneName.trim(),
        polygon: corners.map(c => [c.lat, c.lng]),
        buffer_meters: bufferMeters,
        group_id: selectedGroupId || undefined,
        enrollment_id: selectedEnrollmentId || undefined,
      })
      navigate('/attendance')
    } catch (err: any) { setError(err.response?.data?.message || 'Failed to save area') } finally { setSaving(false) }
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/attendance')} className="p-3 hover:bg-gray-100 rounded-full transition-colors active:scale-90"><ChevronLeft className="w-6 h-6 text-gray-400" /></button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Create Area</h1>
            <p className="text-gray-500 font-medium">
              {drawing ? 'Click on the map to mark boundaries' : corners.length >= 3 ? 'Boundary set, adjust settings and save' : 'Start by drawing a perimeter on the map'}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {!drawing && corners.length === 0 ? (
            <button
              onClick={startDrawing}
              className="flex items-center gap-2 bg-black text-white px-8 py-4 rounded-[2rem] font-bold hover:bg-gray-800 transition-all active:scale-95 shadow-xl shadow-gray-200"
            >
              <PenTool className="w-5 h-5" />
              Draw Boundary
            </button>
          ) : drawing ? (
            <div className="flex items-center gap-2">
              <div className="bg-orange-50 text-[#FA9411] px-4 py-2.5 rounded-2xl font-bold text-xs uppercase tracking-widest border border-orange-100">
                {corners.length} Points
              </div>
              <button
                onClick={handleUndoPoint}
                disabled={corners.length === 0}
                className="p-3.5 bg-white border border-gray-100 rounded-2xl hover:bg-gray-50 disabled:opacity-30 transition-all active:scale-95"
                title="Undo last point"
              >
                <Undo2 className="w-5 h-5 text-gray-600" />
              </button>
              <button
                onClick={cancelDrawing}
                className="p-3.5 bg-white border border-red-50 rounded-2xl hover:bg-red-50 transition-all active:scale-95 text-red-500"
                title="Discard draft"
              >
                <X className="w-5 h-5" />
              </button>
              <button
                onClick={finishDrawing}
                disabled={corners.length < 3}
                className="flex items-center gap-2 bg-[#FA9411] text-white px-8 py-4 rounded-[2rem] font-bold hover:bg-[#e88910] disabled:opacity-40 transition-all active:scale-95 shadow-lg shadow-orange-500/20"
              >
                <Check className="w-5 h-5" />
                Finish Perimeter
              </button>
            </div>
          ) : (
            <button
              onClick={startDrawing}
              className="flex items-center gap-3 bg-white border border-gray-100 px-6 py-4 rounded-[2rem] font-bold hover:bg-gray-50 transition-all active:scale-95"
            >
              <RotateCcw className="w-5 h-5" />
              Reset & Redraw
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-100 text-red-700 px-6 py-4 rounded-[2rem] flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300 shadow-sm font-medium">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />{error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Map Container */}
        <div className="lg:col-span-2 bg-white rounded-[2.5rem] border border-gray-100 overflow-hidden relative shadow-sm h-[600px] group">
          {/* Map Layer Switcher */}
          <div className="absolute top-6 right-6 z-[1000] flex flex-col gap-2">
            <div className="flex items-center bg-white border border-gray-100 p-1 rounded-2xl shadow-xl">
              <button
                onClick={() => setMapStyle('street')}
                className={`px-4 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all ${
                  mapStyle === 'street' ? 'bg-[#FA9411] text-white shadow-lg shadow-orange-500/20' : 'text-gray-400 hover:text-gray-900'
                }`}
              >
                Map
              </button>
              <button
                onClick={() => setMapStyle('satellite')}
                className={`px-4 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all ${
                  mapStyle === 'satellite' ? 'bg-[#FA9411] text-white shadow-lg shadow-orange-500/20' : 'text-gray-400 hover:text-gray-900'
                }`}
              >
                Satellite
              </button>
            </div>
          </div>

          {drawing && (
            <div className="absolute top-6 left-6 z-[1000] animate-slide-down">
              <div className="bg-black/90 backdrop-blur-md text-white px-5 py-4 rounded-[1.5rem] shadow-2xl flex items-center gap-4 border border-white/10">
                <div className="w-2 h-2 rounded-full bg-[#FA9411] animate-pulse" />
                <span className="text-sm font-bold tracking-tight">Drafting Protocol Active</span>
                <div className="w-px h-4 bg-white/20" />
                <span className="text-xs text-white/60 font-medium">Click to place perimeter markers</span>
              </div>
            </div>
          )}

          <MapContainer center={[9.05, 7.49]} zoom={19} style={{ height: '100%', width: '100%' }} maxZoom={22}>
            <TileLayer
              key={mapStyle}
              url={TILE_URLS[mapStyle]}
              attribution="&copy; Google"
              maxZoom={22}
              maxNativeZoom={22}
            />
            <FlyToUser didFly={didFlyRef} setGpsPosition={setGpsPosition} setGpsAccuracy={setGpsAccuracy} />
            {drawing && <MapClickHandler onMapClick={handleMapClick} />}

            {/* Live GPS blue dot */}
            {gpsPosition && (
              <>
                <Circle
                  center={gpsPosition}
                  radius={gpsAccuracy || 10}
                  pathOptions={{ color: '#FA9411', fillColor: '#FA9411', fillOpacity: 0.1, weight: 1 }}
                />
                <Marker position={gpsPosition} icon={userDotIcon} />
              </>
            )}

            {/* Drawing preview */}
            {corners.length > 0 && (
              <>
                <Polyline
                  positions={corners.map(p => [p.lat, p.lng] as [number, number])}
                  pathOptions={{ color: '#FA9411', weight: 4, lineCap: 'round', lineJoin: 'round' }}
                />
                {corners.length >= 3 && (
                  <>
                    <Polyline
                      positions={[
                        [corners[corners.length - 1].lat, corners[corners.length - 1].lng],
                        [corners[0].lat, corners[0].lng],
                      ]}
                      pathOptions={{ color: '#FA9411', weight: 2, dashArray: '8, 8', opacity: 0.6 }}
                    />
                    <Polygon
                      positions={corners.map(c => [c.lat, c.lng] as [number, number])}
                      pathOptions={{ color: 'transparent', fillColor: '#FA9411', fillOpacity: 0.15 }}
                    />
                  </>
                )}
                {/* Vertex markers */}
                {corners.map((p, i) => (
                  <CircleMarker
                    key={i}
                    center={[p.lat, p.lng]}
                    radius={i === 0 ? 8 : 6}
                    pathOptions={{
                      color: '#fff',
                      fillColor: i === 0 ? '#10b981' : '#FA9411',
                      fillOpacity: 1,
                      weight: 3,
                    }}
                  />
                ))}
              </>
            )}
          </MapContainer>
        </div>

        {/* Configuration Sidebar */}
        <div className="space-y-6">
          <div className="bg-white rounded-[2.5rem] border border-gray-100 p-8 shadow-sm space-y-8">
            <h2 className="text-xl font-bold text-gray-900">Area Settings</h2>
            
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Area Narrative</label>
                <input 
                  type="text" 
                  value={zoneName} 
                  onChange={e => setZoneName(e.target.value)} 
                  placeholder="e.g. Master Hallway"
                  className="w-full bg-gray-50 border-2 border-gray-50 rounded-[1.25rem] px-5 py-4 font-bold focus:bg-white focus:border-orange-200 transition-all outline-none" 
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Assigned Fleet</label>
                <select 
                  value={selectedGroupId} 
                  onChange={e => setSelectedGroupId(e.target.value)}
                  className="w-full bg-gray-50 border-2 border-gray-50 rounded-[1.25rem] px-5 py-4 font-bold focus:bg-white focus:border-orange-200 transition-all outline-none appearance-none"
                >
                  <option value="">All Hardware</option>
                  {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Safety Margin: {bufferMeters}m</label>
                <div className="px-1 pt-2">
                  <input 
                    type="range" 
                    min={5} 
                    max={100} 
                    step={5}
                    value={bufferMeters} 
                    onChange={e => setBufferMeters(Number(e.target.value))} 
                    className="w-full h-2 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-[#FA9411]" 
                  />
                  <div className="flex justify-between mt-2 text-[10px] font-bold text-gray-300 uppercase tracking-tighter">
                    <span>Strict</span>
                    <span>Generous</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2 pt-4">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Link Token (Optional)</label>
                <select 
                  value={selectedEnrollmentId} 
                  onChange={e => setSelectedEnrollmentId(e.target.value)}
                  className="w-full bg-gray-50 border-2 border-gray-50 rounded-[1.25rem] px-5 py-4 font-bold focus:bg-white focus:border-orange-200 transition-all outline-none appearance-none"
                >
                  <option value="">No Token Restriction</option>
                  {enrollments.map(e => <option key={e.id} value={e.id}>{e.name || e.token.slice(0, 12)}</option>)}
                </select>
              </div>
            </div>

            <button 
              onClick={handleSave} 
              disabled={saving || corners.length < 3 || !zoneName.trim()}
              className="w-full flex items-center justify-center gap-3 bg-black text-white py-5 rounded-[2rem] font-bold hover:bg-gray-800 disabled:opacity-30 transition-all active:scale-95 shadow-xl shadow-gray-100 mt-4"
            >
              {saving ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" /> : <Save className="w-5 h-5 text-[#FA9411]" />}
              Commit Area
            </button>
          </div>

          {/* Points Overview */}
          {corners.length > 0 && !drawing && (
            <div className="bg-orange-50/50 rounded-[2rem] border border-orange-100/50 p-6 animate-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-xl bg-[#FA9411] flex items-center justify-center shadow-lg shadow-orange-500/20">
                  <MapIcon className="w-4 h-4 text-white" />
                </div>
                <span className="font-bold text-gray-900">{corners.length} Coordinates Verified</span>
              </div>
              <div className="text-[10px] text-orange-900/40 font-bold uppercase tracking-widest leading-relaxed">
                Visual perimeter integrity confirmed . Ready for deployment
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

