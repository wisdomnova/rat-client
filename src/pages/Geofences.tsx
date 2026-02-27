import { useState, useEffect, useCallback, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { 
  MapContainer, 
  TileLayer, 
  Polygon as LeafletPolygon, 
  Polyline, 
  CircleMarker, 
  Circle, 
  Marker, 
  useMap, 
  useMapEvents 
} from 'react-leaflet'
import L from 'leaflet'
import { geofencesAPI, groupsAPI, enrollmentsAPI } from '../api'
import type { EnrollmentToken } from '../types'
import {
  MapPin, 
  Plus, 
  Trash2, 
  X, 
  Loader2,
  Clock, 
  Undo2, 
  Check, 
  PenTool, 
  Navigation,
  Activity,
  ChevronRight,
  Shield,
  Search,
  Zap,
  Bell
} from 'lucide-react'
import 'leaflet/dist/leaflet.css'

const PROTOCOL_COLORS: Record<string, string> = {
  WIPE: '#dc2626',
  LOCK: '#FA9411',
  NOTIFY: '#3b82f6',
}

const TILE_URLS = {
  satellite: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
  street: 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
}

const userDotIcon = L.divIcon({
  html: '<div style="width:18px;height:18px;border-radius:50%;background:#FA9411;border:3px solid #fff;box-shadow:0 0 0 2px rgba(250,148,17,.4),0 2px 8px rgba(0,0,0,0.3);animation:gps-pulse 2s infinite"></div><style>@keyframes gps-pulse{0%,100%{box-shadow:0 0 0 2px rgba(250,148,17,.4)}50%{box-shadow:0 0 0 10px rgba(250,148,17,0.1)}}</style>',
  className: '',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
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
          map.flyTo([latitude, longitude], 18, { duration: 1.5 })
        }
      },
      () => {},
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    )
  }, [map])
  return null
}

function FitGeofences({ geofences, didFly }: { geofences: any[]; didFly: React.MutableRefObject<boolean> }) {
  const map = useMap()
  const didFit = useRef(false)
  useEffect(() => {
    if (didFit.current || didFly.current || geofences.length === 0) return
    const allPts: [number, number][] = []
    geofences.forEach((g: any) => {
      if (g.polygon && Array.isArray(g.polygon)) {
        g.polygon.forEach((p: any) => allPts.push([p.lat, p.lng]))
      }
    })
    if (allPts.length === 0) return
    const t = setTimeout(() => {
      if (!didFly.current) {
        didFit.current = true
        map.fitBounds(L.latLngBounds(allPts).pad(0.2), { duration: 1 })
      }
    }, 1500)
    return () => clearTimeout(t)
  }, [geofences.length, map, didFly])
  return null
}

function PolygonDrawer({
  onAddPoint,
}: {
  points: { lat: number; lng: number }[]
  onAddPoint: (lat: number, lng: number) => void
}) {
  useMapEvents({
    click(e) {
      onAddPoint(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

interface Group {
  id: string
  name: string
}

export default function Geofences() {
  const queryClient = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [drawing, setDrawing] = useState(false)
  const [selectedGfId, setSelectedGfId] = useState<string | null>(null)
  const didFlyRef = useRef(false)
  const [gpsPosition, setGpsPosition] = useState<[number, number] | null>(null)
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null)
  const [mapStyle, setMapStyle] = useState<'satellite' | 'street'>('street')

  const [drawPoints, setDrawPoints] = useState<{ lat: number; lng: number }[]>([])
  const [form, setForm] = useState({
    name: '',
    action: 'NOTIFY',
    group_id: '' as string,
    enrollment_id: '' as string,
  })

  const { data: geofences = [], isLoading } = useQuery({
    queryKey: ['geofences'],
    queryFn: geofencesAPI.list,
  })

  const { data: breaches = [], isLoading: breachesLoading } = useQuery({
    queryKey: ['geofence-breaches', selectedGfId],
    queryFn: () => geofencesAPI.listBreaches(selectedGfId || undefined, 200),
    refetchInterval: 15000,
  })

  const [groups, setGroups] = useState<Group[]>([])
  const [enrollments, setEnrollments] = useState<EnrollmentToken[]>([])

  useEffect(() => {
    groupsAPI.list().then((d: any) => setGroups(Array.isArray(d) ? d : [])).catch(() => {})
    enrollmentsAPI.list().then((d: any) => setEnrollments(Array.isArray(d) ? d : [])).catch(() => {})
  }, [])

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

  const createMutation = useMutation({
    mutationFn: () =>
      geofencesAPI.create({
        name: form.name,
        polygon: drawPoints,
        action: form.action,
        group_id: form.group_id || null,
        enrollment_id: form.enrollment_id || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['geofences'] })
      queryClient.invalidateQueries({ queryKey: ['geofence-breaches'] })
      setShowModal(false)
      resetDrawing()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => geofencesAPI.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['geofences'] })
      queryClient.invalidateQueries({ queryKey: ['geofence-breaches'] })
      setSelectedGfId(null)
    },
  })

  const resetDrawing = () => {
    setDrawing(false)
    setDrawPoints([])
    setForm({ name: '', action: 'NOTIFY', group_id: '', enrollment_id: '' })
  }

  const handleAddPoint = useCallback(
    (lat: number, lng: number) => {
      if (!drawing) return
      setDrawPoints(prev => [...prev, { lat, lng }])
    },
    [drawing]
  )

  const handleUndoPoint = () => {
    setDrawPoints(prev => prev.slice(0, -1))
  }

  const startDrawing = () => {
    resetDrawing()
    setDrawing(true)
  }

  const finishDrawing = () => {
    if (drawPoints.length < 3) return
    setDrawing(false)
    setShowModal(true)
  }

  const cancelDrawing = () => {
    resetDrawing()
  }

  return (
    <div className="animate-fade-in pb-20 space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Virtual Boundaries</h1>
          <p className="text-gray-500 font-medium mt-1 uppercase text-xs tracking-wider">Geographical Safety Zones</p>
        </div>
        {!drawing ? (
          <button
            onClick={startDrawing}
            className="flex items-center gap-2 bg-[#FA9411] text-white px-6 py-4 rounded-2xl text-sm font-bold hover:bg-black transition-all shadow-lg shadow-orange-500/10 group"
          >
            <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform" />
            <span>Establish New Boundary</span>
          </button>
        ) : (
          <div className="flex items-center gap-3 animate-slide-up">
             <div className="flex items-center bg-white border border-gray-100 rounded-2xl px-4 py-3 shadow-sm mr-2">
                <Navigation className="w-4 h-4 text-[#FA9411] animate-pulse mr-2" />
                <span className="text-xs font-bold text-gray-900 uppercase tracking-widest whitespace-nowrap">
                  {drawPoints.length} Markers Placed
                </span>
             </div>
            
            <button
              onClick={handleUndoPoint}
              disabled={drawPoints.length === 0}
              className="px-4 py-3 border border-gray-200 rounded-2xl text-xs font-bold hover:bg-white disabled:opacity-30 transition-all flex items-center gap-2 bg-gray-50/50"
            >
              <Undo2 className="w-4 h-4" />
              Remove Last
            </button>
            <button
              onClick={cancelDrawing}
              className="px-4 py-3 border border-gray-100 rounded-2xl text-xs font-bold hover:bg-white text-gray-400 hover:text-red-600 transition-all"
            >
              Discard
            </button>
            <button
              onClick={finishDrawing}
              disabled={drawPoints.length < 3}
              className="flex items-center gap-2 px-6 py-3 bg-black text-white rounded-2xl text-xs font-bold hover:opacity-90 disabled:opacity-20 transition-all shadow-xl"
            >
              <Check className="w-4 h-4" />
              Complete Perimeter ({drawPoints.length}/3+)
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left: Sidebar */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white border border-gray-100 rounded-[2rem] p-8 shadow-sm overflow-hidden relative">
            <h3 className="text-[11px] font-bold uppercase text-gray-400 tracking-[0.2em] mb-6">Active Zones</h3>
            
            <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
              {isLoading ? (
                <div className="py-20 text-center">
                  <Loader2 className="w-8 h-8 animate-spin text-[#FA9411] mx-auto mb-4" />
                  <p className="text-[10px] font-bold uppercase text-gray-400 tracking-widest">Scanning Parameters...</p>
                </div>
              ) : geofences.length === 0 ? (
                <div className="bg-gray-50 border border-gray-100 rounded-2xl p-8 text-center">
                   <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center mx-auto mb-4 shadow-sm">
                      <MapPin className="w-6 h-6 text-gray-300" />
                   </div>
                   <p className="text-sm font-bold text-gray-900 mb-1">No Boundaries Defined</p>
                   <p className="text-xs text-gray-400 font-medium">Use the establish button to start drafting a perimeter on the map.</p>
                </div>
              ) : (
                geofences.map((gf: any) => {
                  const isSelected = selectedGfId === gf.id
                  const protocolColor = PROTOCOL_COLORS[gf.action] || '#3b82f6'
                  const pts = gf.polygon?.length || 0
                  
                  return (
                    <div
                      key={gf.id}
                      onClick={() => setSelectedGfId(isSelected ? null : gf.id)}
                      className={`group relative border transition-all duration-300 rounded-[1.5rem] cursor-pointer overflow-hidden ${
                        isSelected
                          ? 'border-[#FA9411] bg-orange-50/30 ring-4 ring-orange-500/5'
                          : 'border-gray-50 bg-gray-50/30 hover:bg-white hover:border-gray-200 hover:shadow-md'
                      }`}
                    >
                      <div className="p-5 relative z-10">
                        <div className="flex justify-between items-start mb-4">
                          <div className="flex items-center gap-3">
                             <div className="w-10 h-10 rounded-xl flex items-center justify-center transition-colors overflow-hidden relative bg-white border border-gray-100 shadow-sm">
                                <div className="absolute inset-0 opacity-10" style={{ backgroundColor: protocolColor }} />
                                <Shield className="w-5 h-5" style={{ color: protocolColor }} />
                             </div>
                             <div>
                                <h4 className="text-sm font-bold text-gray-900 tracking-tight">{gf.name}</h4>
                                <div className="flex items-center gap-2 mt-0.5">
                                   <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{pts} Points</span>
                                   <span className="w-1 h-1 rounded-full bg-gray-200" />
                                   <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">ID: {gf.id.slice(0, 5)}</span>
                                </div>
                             </div>
                          </div>
                          <button
                            onClick={e => {
                              e.stopPropagation()
                              deleteMutation.mutate(gf.id)
                            }}
                            className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="grid grid-cols-2 gap-3 mb-2">
                           <div className="bg-white/60 p-2 rounded-lg border border-gray-100/50">
                              <p className="text-[9px] font-bold uppercase text-gray-400 mb-1">Protocol</p>
                              <div className="flex items-center gap-1.5">
                                 <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: protocolColor }} />
                                 <span className="text-[10px] font-bold text-gray-700 uppercase">{gf.action}</span>
                              </div>
                           </div>
                           <div className="bg-white/60 p-2 rounded-lg border border-gray-100/50">
                              <p className="text-[9px] font-bold uppercase text-gray-400 mb-1">Targeting</p>
                              <span className="text-[10px] font-bold text-gray-700 uppercase truncate block">
                                 {gf.group_name || gf.enrollment_name || 'All Units'}
                              </span>
                           </div>
                        </div>

                        {gf.active_breaches > 0 && (
                          <div className="mt-4 flex items-center justify-between bg-red-50/50 p-2.5 rounded-xl border border-red-100">
                             <div className="flex items-center gap-2">
                                <Activity className="w-3.5 h-3.5 text-red-600 animate-pulse" />
                                <span className="text-[10px] font-bold uppercase text-red-700 tracking-wider">Active Alerts</span>
                             </div>
                             <span className="text-xs font-bold text-red-700">{gf.active_breaches}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* Quick Guide */}
          <div className="bg-gray-900 rounded-[2rem] p-8 shadow-xl relative overflow-hidden group">
             <div className="absolute top-0 right-0 p-6 opacity-[0.03] group-hover:opacity-5 transition-opacity">
                <MapPin className="w-32 h-32 text-white" />
             </div>
             <h3 className="text-white text-lg font-bold mb-6 flex items-center gap-2">
                <PenTool className="w-5 h-5 text-[#FA9411]" />
                Boundary Guide
             </h3>
             <div className="space-y-6">
                <div className="flex items-start gap-4">
                   <div className="w-8 h-8 rounded-xl bg-[#FA9411]/10 flex items-center justify-center shrink-0 border border-[#FA9411]/20">
                      <span className="text-[#FA9411] text-xs font-bold">01</span>
                   </div>
                   <div>
                      <p className="text-sm font-bold text-gray-100 uppercase tracking-tight">Activate Drafting</p>
                      <p className="text-xs text-gray-400 font-medium mt-1 leading-relaxed">Click the establish button to unlock map drawing capabilities.</p>
                   </div>
                </div>
                <div className="flex items-start gap-4">
                   <div className="w-8 h-8 rounded-xl bg-orange-500/10 flex items-center justify-center shrink-0 border border-orange-500/20">
                      <span className="text-orange-500 text-xs font-bold">02</span>
                   </div>
                   <div>
                      <p className="text-sm font-bold text-gray-100 uppercase tracking-tight">Define Perimeter</p>
                      <p className="text-xs text-gray-400 font-medium mt-1 leading-relaxed">Click points on the map to form a custom geometric boundary.</p>
                   </div>
                </div>
                <div className="flex items-start gap-4">
                   <div className="w-8 h-8 rounded-xl bg-orange-500/10 flex items-center justify-center shrink-0 border border-orange-500/20">
                      <span className="text-orange-500 text-xs font-bold">03</span>
                   </div>
                   <div>
                      <p className="text-sm font-bold text-gray-100 uppercase tracking-tight">Response Protocol</p>
                      <p className="text-xs text-gray-400 font-medium mt-1 leading-relaxed">Assign automated administrative actions for when units exit the zone.</p>
                   </div>
                </div>
             </div>
          </div>
        </div>

        {/* Right: Map Control */}
        <div className="lg:col-span-8 flex flex-col gap-8">
           <div className="bg-white border border-gray-100 rounded-[2.5rem] overflow-hidden shadow-sm relative h-[600px] group">
              {/* Map UI Layers */}
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
                      <div className="w-10 h-10 rounded-xl bg-[#FA9411] flex items-center justify-center animate-pulse">
                         <PenTool className="w-5 h-5 text-white" />
                      </div>
                      <div>
                         <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-orange-400">Drafting Mode</p>
                         <p className="text-xs font-bold text-gray-100">Click map to establish vertices</p>
                      </div>
                   </div>
                </div>
              )}

              {/* Legend & Instructions when empty */}
              {!drawing && geofences.length > 0 && (
                <div className="absolute bottom-6 left-6 z-[1000] bg-white/90 backdrop-blur-md border border-gray-100 p-3 rounded-2xl shadow-xl flex items-center gap-6">
                   <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                      <span className="text-[10px] font-bold uppercase text-gray-500">Notify</span>
                   </div>
                   <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-[#FA9411]" />
                      <span className="text-[10px] font-bold uppercase text-gray-500">Lockdown</span>
                   </div>
                   <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-red-600" />
                      <span className="text-[10px] font-bold uppercase text-gray-500">Sanitize</span>
                   </div>
                </div>
              )}

              <MapContainer
                center={[9.05, 7.49]}
                zoom={18}
                style={{ height: '100%', width: '100%' }}
                maxZoom={22}
                className="z-0"
              >
                <TileLayer
                  key={mapStyle}
                  url={TILE_URLS[mapStyle]}
                  attribution="&copy; Google"
                  maxZoom={22}
                  maxNativeZoom={22}
                />
                <FlyToUser didFly={didFlyRef} setGpsPosition={setGpsPosition} setGpsAccuracy={setGpsAccuracy} />
                {geofences.length > 0 && !drawing && <FitGeofences geofences={geofences} didFly={didFlyRef} />}
                {drawing && <PolygonDrawer points={drawPoints} onAddPoint={handleAddPoint} />}

                {gpsPosition && (
                  <>
                    <Circle
                      center={gpsPosition}
                      radius={gpsAccuracy || 10}
                      pathOptions={{ color: '#FA9411', fillColor: '#FA9411', fillOpacity: 0.08, weight: 1 }}
                    />
                    <Marker position={gpsPosition} icon={userDotIcon} />
                  </>
                )}

                {geofences.map((gf: any) => {
                  if (!gf.polygon || !Array.isArray(gf.polygon) || gf.polygon.length < 3) return null
                  const color = PROTOCOL_COLORS[gf.action] || '#3b82f6'
                  const isSelected = selectedGfId === gf.id
                  const positions: [number, number][] = gf.polygon.map((p: any) => [p.lat, p.lng])
                  return (
                    <LeafletPolygon
                      key={gf.id}
                      positions={positions}
                      pathOptions={{
                        color: isSelected ? 'black' : color,
                        fillColor: color,
                        fillOpacity: isSelected ? 0.35 : 0.15,
                        weight: isSelected ? 4 : 2,
                        dashArray: isSelected ? undefined : '8 5',
                      }}
                      eventHandlers={{
                        click: () => setSelectedGfId(isSelected ? null : gf.id),
                      }}
                    />
                  )
                })}

                {drawing && drawPoints.length > 0 && (
                  <>
                    {drawPoints.length >= 2 && (
                      <Polyline
                        positions={drawPoints.map(p => [p.lat, p.lng] as [number, number])}
                        pathOptions={{ color: '#FA9411', weight: 3, dashArray: '10 6' }}
                      />
                    )}
                    {drawPoints.length >= 3 && (
                      <Polyline
                        positions={[
                          [drawPoints[drawPoints.length - 1].lat, drawPoints[drawPoints.length - 1].lng],
                          [drawPoints[0].lat, drawPoints[0].lng],
                        ]}
                        pathOptions={{ color: '#FA9411', weight: 2, dashArray: '5 5', opacity: 0.5 }}
                      />
                    )}
                    {drawPoints.length >= 3 && (
                      <LeafletPolygon
                        positions={drawPoints.map(p => [p.lat, p.lng] as [number, number])}
                        pathOptions={{ color: '#FA9411', fillColor: '#FA9411', fillOpacity: 0.1, weight: 0 }}
                      />
                    )}
                    {drawPoints.map((p, i) => (
                      <CircleMarker
                        key={i}
                        center={[p.lat, p.lng]}
                        radius={i === 0 ? 8 : 6}
                        pathOptions={{
                          color: '#fff',
                          fillColor: i === 0 ? '#22c55e' : '#FA9411',
                          fillOpacity: 1,
                          weight: 3,
                        }}
                      />
                    ))}
                  </>
                )}
              </MapContainer>
           </div>

           {/* Alerts Table Integration */}
           <div className="bg-white border border-gray-100 rounded-[2.5rem] p-10 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-[0.03]">
                 <Zap className="w-24 h-24 text-black" />
              </div>
              <div className="flex items-center justify-between mb-8 relative z-10">
                <div className="flex items-center gap-3">
                   <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center border border-red-100">
                      <Bell className="w-6 h-6 text-red-500" />
                   </div>
                   <div>
                     <h2 className="text-xl font-bold text-gray-900 tracking-tight">Administrative Alerts</h2>
                     <p className="text-xs font-bold uppercase text-gray-400 tracking-widest mt-0.5">Physical Boundary Violation Log</p>
                   </div>
                </div>

                {selectedGfId && (
                  <button
                    onClick={() => setSelectedGfId(null)}
                    className="px-4 py-2 bg-gray-50 text-[10px] font-bold uppercase tracking-widest text-[#FA9411] border border-orange-100 rounded-xl hover:bg-[#FA9411] hover:text-white transition-all shadow-sm"
                  >
                    Clear Filter
                  </button>
                )}
              </div>

              <div className="relative z-10 overflow-hidden border border-gray-100 rounded-2xl">
                {breachesLoading ? (
                  <div className="p-20 text-center">
                    <Loader2 className="w-8 h-8 animate-spin text-[#FA9411] mx-auto mb-4" />
                    <p className="text-[10px] font-bold uppercase text-gray-400 tracking-widest">Retrieving Log Entries...</p>
                  </div>
                ) : breaches.length === 0 ? (
                  <div className="p-20 text-center bg-gray-50/30">
                    <Shield className="w-12 h-12 text-gray-200 mx-auto mb-4" />
                    <p className="text-sm font-bold text-gray-900">System Integrity Confirmed</p>
                    <p className="text-xs text-gray-400 font-medium">No boundary violations have been recorded for the selected criteria.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-100 text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">
                          <th className="px-6 py-4">Unit Identification</th>
                          <th className="px-6 py-4">Violation Zone</th>
                          <th className="px-6 py-4">Administrative Context</th>
                          <th className="px-6 py-4">Timestamp</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 bg-white">
                        {breaches.map((b: any) => (
                          <tr key={b.id} className="hover:bg-gray-50 group transition-colors">
                            <td className="px-6 py-5">
                              <div className="flex items-center gap-3">
                                 <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 font-bold text-xs uppercase group-hover:bg-[#FA9411] group-hover:text-white transition-colors">
                                    {b.device_name?.charAt(0) || 'U'}
                                 </div>
                                 <div>
                                   <div className="text-sm font-bold text-gray-900">{b.device_name || 'Anonymous Unit'}</div>
                                   <div className="text-[10px] font-bold uppercase text-gray-400">{b.device_model || 'Standard Hardware'}</div>
                                 </div>
                              </div>
                            </td>
                            <td className="px-6 py-5 text-sm font-bold text-gray-700">
                               {b.geofence_name || 'Internal Perimeter'}
                            </td>
                            <td className="px-6 py-5">
                              <div className="flex flex-wrap gap-1.5">
                                {b.group_name && (
                                  <span className="bg-gray-100 text-[9px] font-bold uppercase tracking-wider text-gray-500 px-2.5 py-1 rounded-lg">
                                    {b.group_name}
                                  </span>
                                )}
                                {b.enrollment_name && (
                                  <span className="bg-orange-50 text-[9px] font-bold uppercase tracking-wider text-[#FA9411] px-2.5 py-1 rounded-lg border border-orange-100">
                                    {b.enrollment_name}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-5">
                               <div className="flex items-center gap-2 text-gray-400">
                                  <Clock className="w-3.5 h-3.5" />
                                  <span className="text-[11px] font-bold">
                                     {b.created_at ? new Date(b.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                                  </span>
                               </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
           </div>
        </div>
      </div>

      {/* Modern Modal Overhaul */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[2000] p-4 animate-in fade-in">
          <div className="bg-white rounded-[2.5rem] w-full max-w-lg p-10 shadow-2xl animate-in zoom-in slide-in-from-bottom-5">
            <div className="flex items-center justify-between mb-10">
               <div>
                  <h2 className="text-2xl font-bold tracking-tight text-gray-900">Perimeter Configuration</h2>
                  <p className="text-xs font-bold uppercase text-gray-400 tracking-widest mt-1">Define Response Protocols</p>
               </div>
              <button
                onClick={() => {
                  setShowModal(false)
                  resetDrawing()
                }}
                className="w-12 h-12 bg-gray-50 hover:bg-red-50 hover:text-red-500 rounded-2xl flex items-center justify-center transition-all group"
              >
                <X className="w-5 h-5 group-hover:rotate-90 transition-transform" />
              </button>
            </div>

            <div className="space-y-8">
              {/* Stats Strip */}
              <div className="flex gap-4">
                 <div className="flex-1 bg-gray-50 p-4 rounded-2xl border border-gray-100">
                    <p className="text-[9px] font-bold uppercase text-gray-400 tracking-wider mb-1">Geometric Complexity</p>
                    <p className="text-sm font-bold text-gray-900">{drawPoints.length} Vertices Established</p>
                 </div>
                 <button
                    onClick={() => { setShowModal(false); setDrawing(true); }}
                    className="px-6 bg-white border border-gray-200 rounded-2xl hover:border-[#FA9411] hover:text-[#FA9411] transition-all flex items-center gap-2 group"
                 >
                    <PenTool className="w-4 h-4" />
                    <span className="text-xs font-bold uppercase tracking-tight">Adjust Points</span>
                 </button>
              </div>

              <div className="grid grid-cols-1 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase text-gray-400 tracking-[0.2em] ml-1">Boundary Designation</label>
                  <div className="relative">
                     <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
                     <input
                       type="text"
                       value={form.name}
                       onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                       placeholder="e.g. Administrative Sector A"
                       className="w-full pl-12 pr-4 py-4 bg-gray-50 border-gray-100 border rounded-2xl text-sm font-bold focus:bg-white focus:ring-4 focus:ring-orange-500/10 focus:border-[#FA9411] transition-all"
                     />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase text-gray-400 tracking-[0.2em] ml-1">Administrative Response</label>
                  <div className="grid grid-cols-3 gap-3">
                     {[
                        { id: 'NOTIFY', label: 'Message', desc: 'Alert Admin', color: 'blue' },
                        { id: 'LOCK', label: 'Lockdown', desc: 'Secure Unit', color: 'orange' },
                        { id: 'WIPE', label: 'Sanitize', desc: 'Critical Wipe', color: 'red' }
                     ].map((opt) => (
                        <button
                          key={opt.id}
                          onClick={() => setForm(prev => ({ ...prev, action: opt.id }))}
                          className={`flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all ${
                             form.action === opt.id 
                                ? 'bg-orange-50 border-[#FA9411] shadow-md' 
                                : 'bg-gray-50 border-gray-50 hover:border-gray-200'
                          }`}
                        >
                           <p className={`text-[10px] font-bold uppercase tracking-tight ${form.action === opt.id ? 'text-[#FA9411]' : 'text-gray-400'}`}>
                              {opt.label}
                           </p>
                           <p className="text-[8px] font-bold text-gray-400 mt-0.5">{opt.desc}</p>
                        </button>
                     ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase text-gray-400 tracking-[0.2em] ml-1">Device Grouping</label>
                    <select
                      value={form.group_id}
                      onChange={e => setForm(prev => ({ ...prev, group_id: e.target.value }))}
                      className="w-full px-4 py-4 bg-gray-50 border-gray-100 border rounded-2xl text-xs font-bold focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all cursor-pointer"
                    >
                      <option value="">Global Application</option>
                      {groups.map(g => ( <option key={g.id} value={g.id}>{g.name}</option> ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase text-gray-400 tracking-[0.2em] ml-1">Enrollment Path</label>
                    <select
                      value={form.enrollment_id}
                      onChange={e => setForm(prev => ({ ...prev, enrollment_id: e.target.value }))}
                      className="w-full px-4 py-4 bg-gray-50 border-gray-100 border rounded-2xl text-xs font-bold focus:outline-none focus:ring-4 focus:ring-orange-500/10 transition-all cursor-pointer"
                    >
                      <option value="">All Path Tokens</option>
                      {enrollments.map(e => ( <option key={e.id} value={e.id}>{e.name || e.token.slice(0, 12)}</option> ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-4 mt-12">
              <button
                type="button"
                onClick={() => { setShowModal(false); resetDrawing(); }}
                className="flex-1 px-8 py-5 border border-gray-200 rounded-3xl text-sm font-bold uppercase tracking-[0.2em] text-gray-400 hover:bg-gray-50 transition-all font-sans"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={() => {
                  if (form.name && drawPoints.length >= 3) {
                    createMutation.mutate();
                  }
                }}
                disabled={createMutation.isPending || !form.name || drawPoints.length < 3}
                className={`flex-[2] px-10 py-5 bg-[#FA9411] text-white rounded-3xl text-sm font-bold uppercase tracking-[0.2em] transition-all shadow-xl shadow-orange-500/20 flex items-center justify-center gap-3 group font-sans ${
                  (createMutation.isPending || !form.name || drawPoints.length < 3) 
                    ? 'opacity-20 cursor-not-allowed' 
                    : 'hover:bg-black opacity-100 cursor-pointer'
                }`}
              >
                {createMutation.isPending ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : (
                  <>
                    <span>Confirm Perimeter</span>
                    <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
