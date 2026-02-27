import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, Polygon, CircleMarker, Circle, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import { attendanceAPI, type AttendanceSession, type AttendanceRecord, type AttendanceZone } from '../api'
import {
  CheckCircle2, XCircle, WifiOff, HelpCircle, ChevronLeft, RefreshCw,
  Download, StopCircle, Clock, ArrowUpDown, Navigation, Link, RotateCcw,
  GitCompareArrows, EyeOff, Users
} from 'lucide-react'
import 'leaflet/dist/leaflet.css'

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)}m`
  return `${(meters / 1000).toFixed(1)}km`
}

// Confidence scoring: how sure are we about this device's attendance verdict?
// Returns 0-100 or null for offline/pending
type ConfidenceResult = { score: number; label: string; color: string; textColor: string } | null

function computeConfidence(r: AttendanceRecord, deviation: number | null): ConfidenceResult {
  if (r.status === 'offline' || r.status === 'pending') return null

  // No GPS data at all — very low confidence in any verdict
  if (r.latitude == null || r.longitude == null) {
    return classify(12)
  }

  const acc = r.avg_gps_accuracy ?? r.gps_accuracy ?? 999
  const dev = deviation ?? 999

  // 1. GPS accuracy score (0-40): tighter accuracy = higher confidence
  let gpsScore: number
  if (acc <= 5) gpsScore = 40
  else if (acc <= 10) gpsScore = 35
  else if (acc <= 15) gpsScore = 30
  else if (acc <= 25) gpsScore = 22
  else if (acc <= 50) gpsScore = 12
  else gpsScore = 4

  // 2. Position score (0-35): depends on status
  let posScore: number
  if (r.status === 'present') {
    // For present: closer to zone center = more confident
    if (dev <= 10) posScore = 35
    else if (dev <= 20) posScore = 30
    else if (dev <= 35) posScore = 24
    else if (dev <= 55) posScore = 16
    else if (dev <= 80) posScore = 8
    else posScore = 3
  } else if (r.status === 'absent') {
    // For absent: farther from zone = more confident it's truly absent
    if (dev > 120) posScore = 35
    else if (dev > 80) posScore = 28
    else if (dev > 50) posScore = 20
    else if (dev > 30) posScore = 10
    else posScore = 4 // very close to boundary — dubious absent
  } else {
    // uncertain
    posScore = 5
  }

  // 3. Method score (0-15): how was the classification made?
  let methodScore: number
  if (r.cluster_status === 'chain_upgraded') {
    methodScore = 5 // inferred from proximity, not direct GPS
  } else if (r.cluster_status === 'direct' || r.status === 'present') {
    methodScore = 15
  } else if (r.status === 'absent') {
    methodScore = 13
  } else {
    methodScore = 3 // uncertain
  }

  // 4. Retake / averaging bonus (0-10)
  const retakeBonus = r.avg_gps_accuracy != null ? 10 : 0

  const total = Math.min(100, gpsScore + posScore + methodScore + retakeBonus)
  return classify(total)
}

function classify(score: number): { score: number; label: string; color: string; textColor: string } {
  if (score >= 85) return { score, label: 'Very High', color: '#dcfce7', textColor: '#15803d' }
  if (score >= 65) return { score, label: 'High',      color: '#d1fae5', textColor: '#047857' }
  if (score >= 45) return { score, label: 'Medium',    color: '#fef9c3', textColor: '#a16207' }
  if (score >= 25) return { score, label: 'Low',       color: '#fed7aa', textColor: '#c2410c' }
  return                  { score, label: 'Very Low',  color: '#fecaca', textColor: '#b91c1c' }
}

const adminIcon = L.divIcon({
  html: '<div style="width:16px;height:16px;border-radius:50%;background:#FA9411;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4)"></div>',
  className: '', iconSize: [16, 16], iconAnchor: [8, 8],
})

const STATUS_CONFIG: Record<string, { color: string; fill: string; icon: any; label: string }> = {
  present:   { color: '#16a34a', fill: '#16a34a', icon: CheckCircle2, label: 'Present' },
  absent:    { color: '#dc2626', fill: '#dc2626', icon: XCircle,      label: 'Absent' },
  offline:   { color: '#6b7280', fill: '#6b7280', icon: WifiOff,      label: 'Offline' },
  uncertain: { color: '#f59e0b', fill: '#f59e0b', icon: HelpCircle,   label: 'Uncertain' },
  pending:   { color: '#FA9411', fill: '#FA9411', icon: Clock,        label: 'Awaiting' },
}

function FitBounds({ polygon }: { polygon: number[][] }) {
  const map = useMap()
  useEffect(() => {
    if (polygon.length >= 3) {
      const bounds = L.latLngBounds(polygon.map(c => [c[0], c[1]] as [number, number]))
      map.fitBounds(bounds.pad(0.5))
    }
  }, [polygon])
  return null
}

type SortKey = 'device_name' | 'status' | 'gps_accuracy' | 'response_time_ms' | 'battery_level' | 'distance' | 'confidence'
type SortDir = 'asc' | 'desc'

export default function AttendanceSessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const [session, setSession] = useState<AttendanceSession | null>(null)
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [zone, setZone] = useState<AttendanceZone | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [retaking, setRetaking] = useState(false)
  const [prevSession, setPrevSession] = useState<AttendanceSession | null>(null)
  const [prevRecords, setPrevRecords] = useState<AttendanceRecord[] | null>(null)
  const [showCompare, setShowCompare] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('confidence')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [adminPos, setAdminPos] = useState<[number, number] | null>(null)
  const [adminAccuracy, setAdminAccuracy] = useState<number | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Track admin's browser GPS
  useEffect(() => {
    if (!navigator.geolocation) return
    const id = navigator.geolocation.watchPosition(
      pos => {
        setAdminPos([pos.coords.latitude, pos.coords.longitude])
        setAdminAccuracy(pos.coords.accuracy)
      },
      () => {},
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [])

  // Compute distance from admin to each device
  const getDistanceToAdmin = (r: AttendanceRecord): number | null => {
    if (!adminPos || r.latitude == null || r.longitude == null) return null
    return haversineDistance(adminPos[0], adminPos[1], r.latitude, r.longitude)
  }

  const fetchData = useCallback(async () => {
    if (!sessionId) return
    try {
      const [sessData, recsData] = await Promise.all([
        attendanceAPI.getSession(sessionId),
        attendanceAPI.getSessionRecords(sessionId),
      ])
      setSession(sessData)
      setRecords(recsData)

      // Load zone on first fetch
      if (!zone && sessData.zone_id) {
        try {
          const z = await attendanceAPI.getZone(sessData.zone_id)
          setZone(z)
        } catch {}
      }

      // Auto-stop refresh when session is complete
      if (sessData.status === 'completed') {
        setAutoRefresh(false)
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load session')
    } finally {
      setLoading(false)
    }
  }, [sessionId, zone])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Polling
  useEffect(() => {
    if (autoRefresh && session?.status !== 'completed') {
      intervalRef.current = setInterval(fetchData, 2000) // Poll every 2s
      return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
    }
  }, [autoRefresh, session?.status, fetchData])

  const handleComplete = async () => {
    if (!sessionId) return
    try {
      await attendanceAPI.completeSession(sessionId)
      setAutoRefresh(false)
      fetchData()
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to complete session')
    }
  }

  const handleRetake = async () => {
    if (!sessionId) return
    setRetaking(true)
    setShowCompare(false)
    try {
      // Snapshot current data before retake
      if (session) setPrevSession({ ...session })
      if (records.length > 0) setPrevRecords([...records])

      const result = await attendanceAPI.retakeAttendance(sessionId)
      if (result.status === 'in_progress') {
        setAutoRefresh(true)
      }
      // Immediately fetch to show the fresh pending state
      await fetchData()
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to retake attendance')
      // Restore snapshot on error
      setPrevSession(null)
      setPrevRecords(null)
    } finally {
      setRetaking(false)
    }
  }

  const handleExportCSV = () => {
    if (!records.length) return
    const headers = ['Device Name', 'Device Model', 'Status', 'Confidence', 'Device Lat', 'Device Lng', 'Zone Center Lat', 'Zone Center Lng', 'Deviation from Zone (m)', 'GPS Accuracy (m)', 'Distance from Admin (m)', 'Battery %', 'Connection', 'Response Time (ms)', 'Responded At']
    const zoneCLat = zone?.center_lat || (zone?.polygon ? zone.polygon.reduce((s: number, c: number[]) => s + c[0], 0) / zone.polygon.length : null)
    const zoneCLng = zone?.center_lng || (zone?.polygon ? zone.polygon.reduce((s: number, c: number[]) => s + c[1], 0) / zone.polygon.length : null)
    const rows = records.map(r => {
      const dist = getDistanceToAdmin(r)
      const dev = getDeviationFromZone(r)
      const conf = computeConfidence(r, dev)
      return [
        r.device_name || 'Unknown',
        r.device_model || '',
        r.status,
        conf ? `${conf.score}% (${conf.label})` : 'N/A',
        r.latitude?.toFixed(7) || '',
        r.longitude?.toFixed(7) || '',
        zoneCLat?.toFixed(7) || '',
        zoneCLng?.toFixed(7) || '',
        dev != null ? Math.round(dev).toString() : '',
        r.gps_accuracy?.toFixed(1) || '',
        dist != null ? Math.round(dist).toString() : '',
        r.battery_level?.toString() || '',
        r.connection_type || '',
        r.response_time_ms?.toString() || '',
        r.responded_at || '',
      ]
    })
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `attendance-${sessionId?.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  // Compute distance from device to zone center
  const getDeviationFromZone = (r: AttendanceRecord): number | null => {
    if (!zone || r.latitude == null || r.longitude == null) return null
    const cLat = zone.center_lat || (zone.polygon ? zone.polygon.reduce((s: number, c: number[]) => s + c[0], 0) / zone.polygon.length : null)
    const cLng = zone.center_lng || (zone.polygon ? zone.polygon.reduce((s: number, c: number[]) => s + c[1], 0) / zone.polygon.length : null)
    if (cLat == null || cLng == null) return null
    return haversineDistance(cLat, cLng, r.latitude, r.longitude)
  }

  const statusOrder: Record<string, number> = { present: 0, absent: 1, uncertain: 2, offline: 3, pending: 4 }

  const sortedRecords = [...records].sort((a, b) => {
    let cmp = 0
    switch (sortKey) {
      case 'device_name':
        cmp = (a.device_name || '').localeCompare(b.device_name || '')
        break
      case 'status':
        cmp = (statusOrder[a.status] ?? 5) - (statusOrder[b.status] ?? 5)
        break
      case 'gps_accuracy':
        cmp = (a.gps_accuracy ?? 999) - (b.gps_accuracy ?? 999)
        break
      case 'response_time_ms':
        cmp = (a.response_time_ms ?? 99999) - (b.response_time_ms ?? 99999)
        break
      case 'battery_level':
        cmp = (a.battery_level ?? -1) - (b.battery_level ?? -1)
        break
      case 'distance':
        cmp = (getDistanceToAdmin(a) ?? 99999) - (getDistanceToAdmin(b) ?? 99999)
        break
      case 'confidence': {
        const ca = computeConfidence(a, getDeviationFromZone(a))?.score ?? -1
        const cb = computeConfidence(b, getDeviationFromZone(b))?.score ?? -1
        cmp = ca - cb
        break
      }
    }
    return sortDir === 'asc' ? cmp : -cmp
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#FA9411]" />
      </div>
    )
  }

  if (!session) {
    return (
      <div className="text-center py-24 bg-white rounded-[2.5rem] border border-gray-100 shadow-sm">
        <div className="text-gray-400 font-bold text-xl">Verification Session Not Found</div>
        <button 
          onClick={() => navigate('/attendance')} 
          className="mt-6 inline-flex items-center gap-2 bg-black text-white px-8 py-3.5 rounded-[1.5rem] font-bold hover:bg-gray-800 transition-all active:scale-95"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Sessions
        </button>
      </div>
    )
  }

  const polygon = zone?.buffered_polygon || zone?.polygon || []
  const responded = records.filter(r => r.status !== 'pending').length
  const progressPct = session.total_devices > 0 ? Math.round((responded / session.total_devices) * 100) : 0

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="flex items-center gap-6">
          <button 
            onClick={() => navigate('/attendance')} 
            className="p-4 hover:bg-gray-100 rounded-full transition-all active:scale-90"
          >
            <ChevronLeft className="w-6 h-6 text-gray-400" />
          </button>
          <div>
            <h1 className="text-4xl font-bold text-gray-900 tracking-tight">Active Check-in</h1>
            <p className="text-gray-500 font-medium mt-1">
              {session.status === 'in_progress' ? (
                <span className="text-[#FA9411] font-bold flex items-center gap-2">
                  <div className="w-2.5 h-2.5 bg-[#FA9411] rounded-full animate-pulse shadow-[0_0_12px_rgba(250,148,17,0.5)]" />
                  Requesting GPS confirmation...
                  {session.retake_count > 1 && <span className="text-gray-400 ml-2 font-bold uppercase text-[10px] tracking-widest bg-gray-50 px-2 py-1 rounded-lg">Retake Attempt #{session.retake_count - 1}</span>}
                </span>
              ) : (
                <span className="text-green-600 font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  Finalized Reports{session.retake_count > 1 && <span className="text-gray-400 ml-2 font-bold uppercase text-[10px] tracking-widest bg-gray-50 px-2 py-1 rounded-lg">{session.retake_count - 1} Correction{session.retake_count > 2 ? 's' : ''} applied</span>}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {session.status === 'completed' && prevRecords && (
            <button 
              onClick={() => setShowCompare(v => !v)} 
              className={`flex items-center gap-2 px-6 py-3.5 rounded-[1.5rem] text-sm font-bold transition-all active:scale-95 ${
                showCompare ? 'bg-black text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {showCompare ? <EyeOff className="w-4 h-4" /> : <GitCompareArrows className="w-4 h-4" />}
              {showCompare ? 'Hide Comparison' : 'Audit Changes'}
            </button>
          )}
          {session.status === 'completed' && (
            <button 
              onClick={handleRetake} 
              disabled={retaking} 
              className="flex items-center gap-2 bg-white border-2 border-orange-100 text-[#FA9411] px-6 py-3.5 rounded-[1.5rem] hover:bg-orange-50 text-sm font-bold disabled:opacity-50 transition-all active:scale-95"
            >
              <RotateCcw className={`w-4 h-4 ${retaking ? 'animate-spin' : ''}`} />
              Re-scan All
            </button>
          )}
          {session.status === 'in_progress' && (
            <button 
              onClick={handleComplete} 
              className="flex items-center gap-2 bg-red-50 text-red-600 px-6 py-3.5 rounded-[1.5rem] hover:bg-red-100 text-sm font-bold transition-all active:scale-95"
            >
              <StopCircle className="w-4 h-4" />
              Stop Early
            </button>
          )}
          <button 
            onClick={handleExportCSV} 
            disabled={records.length === 0} 
            className="flex items-center gap-2 bg-black text-white px-6 py-3.5 rounded-[1.5rem] hover:bg-gray-800 text-sm font-bold disabled:opacity-50 transition-all active:scale-95 shadow-xl shadow-gray-200"
          >
            <Download className="w-4 h-4" />
            Save Logs
          </button>
          <button 
            onClick={fetchData} 
            className="p-4 bg-white border border-gray-100 hover:bg-gray-50 rounded-full text-gray-400 transition-all active:scale-90"
          >
            <RefreshCw className={`w-5 h-5 ${autoRefresh ? 'animate-spin text-[#FA9411]' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-100 text-red-700 px-8 py-5 rounded-[2rem] font-bold shadow-sm animate-in slide-in-from-top-4">
          {error}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
        {(['present', 'absent', 'offline', 'uncertain', 'pending'] as const).map(status => {
          const cfg = STATUS_CONFIG[status]
          const count = status === 'pending'
            ? records.filter(r => r.status === 'pending').length
            : status === 'present' ? session.present_count
            : status === 'absent' ? session.absent_count
            : status === 'offline' ? session.offline_count
            : session.uncertain_count
          const Icon = cfg.icon
          return (
            <div key={status} className="bg-white rounded-[2rem] border border-gray-50 p-6 shadow-sm hover:shadow-md transition-all group overflow-hidden relative">
              <div className="absolute inset-0 opacity-0 group-hover:opacity-[0.03] transition-opacity duration-500" style={{ backgroundColor: cfg.color }} />
              <div className="flex items-center justify-between relative z-10">
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{cfg.label}</span>
                <div className="p-2 rounded-xl" style={{ backgroundColor: cfg.color + '15', color: cfg.color }}>
                  <Icon className="w-4 h-4" />
                </div>
              </div>
              <div className="text-4xl font-bold mt-4 relative z-10" style={{ color: cfg.color }}>{count}</div>
            </div>
          )
        })}
      </div>

      {/* Progress bar */}
      <div className="bg-white rounded-[2.5rem] border border-gray-50 p-8 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-bold text-gray-400 uppercase tracking-widest">Network Confirmation</span>
          <span className="text-sm font-bold text-gray-900 bg-gray-100 px-4 py-1.5 rounded-full">{responded} of {session.total_devices} Handled</span>
        </div>
        <div className="w-full bg-gray-50 rounded-[2rem] h-5 overflow-hidden border border-gray-100 p-1">
          <div 
            className="h-full rounded-full bg-gradient-to-r from-[#FA9411] to-orange-400 transition-all duration-1000 shadow-[0_0_12px_rgba(250,148,17,0.3)]" 
            style={{ width: `${progressPct}%` }} 
          />
        </div>
      </div>

      {/* Compare Panel */}
      {showCompare && prevRecords && prevSession && (
        <div className="bg-white rounded-[2.5rem] border border-orange-100 overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300">
          <div className="px-8 py-6 border-b border-orange-50 bg-orange-50/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h3 className="font-bold text-gray-900 flex items-center gap-3">
              <div className="bg-[#FA9411] p-1.5 rounded-lg">
                <GitCompareArrows className="w-4 h-4 text-white" />
              </div>
              Previous vs Finalized Integrity Audit
            </h3>
            <div className="flex items-center gap-6 text-xs font-bold uppercase tracking-widest">
              <div className="flex items-center gap-2">
                <span className="text-gray-400">Baseline Scan:</span>
                <span className="text-gray-900">{prevSession.present_count} OK / {prevSession.absent_count} Fail</span>
              </div>
              <div className="w-px h-4 bg-gray-200" />
              <div className="flex items-center gap-2">
                <span className="text-[#FA9411]">Refined Data:</span>
                <span className="text-gray-900">{session.present_count} OK / {session.absent_count} Fail</span>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50/50 text-left text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                  <th className="px-8 py-4">Hardware Profile</th>
                  <th className="px-8 py-4 text-center">Initial State</th>
                  <th className="px-8 py-4 text-center">Refined State</th>
                  <th className="px-8 py-4">Protocol Outcome</th>
                  <th className="px-8 py-4 text-right">Certainty Spike</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {records.map(r => {
                  const prev = prevRecords.find(p => p.device_id === r.device_id)
                  const prevStatus = prev?.status || '—'
                  const curStatus = r.status
                  const prevCfg = STATUS_CONFIG[prevStatus] || STATUS_CONFIG.pending
                  const curCfg = STATUS_CONFIG[curStatus] || STATUS_CONFIG.pending
                  const changed = prevStatus !== curStatus
                  const improved = (prevStatus === 'absent' || prevStatus === 'uncertain' || prevStatus === 'offline') && curStatus === 'present'
                  const worsened = prevStatus === 'present' && (curStatus === 'absent' || curStatus === 'offline')
                  const prevConf = prev ? computeConfidence(prev, getDeviationFromZone(prev)) : null
                  const curConf = computeConfidence(r, getDeviationFromZone(r))
                  return (
                    <tr key={r.id} className={`${changed ? (improved ? 'bg-green-50/30' : worsened ? 'bg-red-50/30' : 'bg-orange-50/30') : ''} hover:bg-gray-50/50 transition-colors`}>
                      <td className="px-8 py-5">
                        <div className="font-bold text-gray-900">{r.device_name || 'Generic Device'}</div>
                        <div className="text-[10px] text-gray-400 font-bold uppercase mt-0.5 tracking-tighter">{r.device_model || 'Unknown Revision'}</div>
                      </td>
                      <td className="px-8 py-5 text-center">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest border" style={{ borderColor: prevCfg.color + '20', color: prevCfg.color }}>
                          {prevCfg.label}
                        </span>
                      </td>
                      <td className="px-8 py-5 text-center">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest border shadow-sm" style={{ borderColor: curCfg.color + '40', color: curCfg.color, backgroundColor: curCfg.color + '05' }}>
                          {curCfg.label}
                        </span>
                      </td>
                      <td className="px-8 py-5">
                        {!changed ? (
                          <span className="text-[10px] font-bold uppercase text-gray-300 tracking-widest">Static</span>
                        ) : improved ? (
                          <span className="text-[10px] bg-green-500 text-white px-3 py-1 rounded-lg font-bold uppercase tracking-widest shadow-sm">Protocol Correction</span>
                        ) : worsened ? (
                          <span className="text-[10px] bg-red-500 text-white px-3 py-1 rounded-lg font-bold uppercase tracking-widest shadow-sm">Signal Drop</span>
                        ) : (
                          <span className="text-[10px] bg-orange-100 text-[#FA9411] px-3 py-1 rounded-lg font-bold uppercase tracking-widest border border-orange-200">Reclassified</span>
                        )}
                      </td>
                      <td className="px-8 py-5 text-right font-bold">
                        <div className="flex items-center justify-end gap-3 text-xs">
                          <span className="text-gray-300">{prevConf?.score || 0}%</span>
                          <div className="text-[#FA9411]">→</div>
                          <span className={`${(curConf?.score || 0) > (prevConf?.score || 0) ? 'text-green-500' : 'text-gray-900'}`}>{curConf?.score || 0}%</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Map */}
        <div className="bg-white rounded-[2.5rem] border border-gray-100 overflow-hidden shadow-sm relative group h-[500px]">
          <div className="absolute top-6 left-8 z-[1000] pointer-events-none">
            <div className="bg-white/90 backdrop-blur-md border border-gray-100 px-5 py-3 rounded-[1.5rem] shadow-xl flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-black flex items-center justify-center shadow-lg">
                <Navigation className="w-4 h-4 text-[#FA9411]" />
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Live Boundary</div>
                <div className="text-sm font-bold text-gray-900">Mapped Area</div>
              </div>
            </div>
          </div>

          <div className="h-full">
            {polygon.length >= 3 ? (
              <MapContainer
                center={[polygon[0][0], polygon[0][1]]}
                zoom={18}
                style={{ height: '100%', width: '100%' }}
                zoomControl={false}
              >
                <TileLayer url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}" attribution="&copy; Google" maxZoom={22} maxNativeZoom={22} />
                <FitBounds polygon={polygon} />

                {/* Zone polygon */}
                <Polygon
                  positions={polygon.map(c => [c[0], c[1]] as [number, number])}
                  pathOptions={{ color: '#000', weight: 3, fillColor: '#FA9411', fillOpacity: 0.1 }}
                />

                {/* Admin position */}
                {adminPos && (
                  <>
                    <Marker position={adminPos} icon={adminIcon}>
                      <Popup><div className="text-xs font-bold p-1">Your Hardware Base</div></Popup>
                    </Marker>
                    <Circle center={adminPos} radius={adminAccuracy || 10} pathOptions={{ color: '#FA9411', fillColor: '#FA9411', fillOpacity: 0.05, weight: 1, dashArray: '4, 4' }} />
                  </>
                )}

                {/* Device dots */}
                {records.filter(r => r.latitude && r.longitude).map((r) => {
                  const cfg = STATUS_CONFIG[r.status] || STATUS_CONFIG.pending
                  const dist = getDistanceToAdmin(r)
                  return (
                    <CircleMarker
                      key={r.id}
                      center={[r.latitude!, r.longitude!]}
                      radius={10}
                      pathOptions={{ color: '#fff', fillColor: cfg.color, fillOpacity: 1, weight: 3 }}
                    >
                      <Popup>
                        <div className="p-2 space-y-2">
                          <div className="font-bold text-gray-900 text-sm border-b border-gray-100 pb-1.5">{r.device_name || 'Generic Device'}</div>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cfg.color }} />
                            <span className="font-bold text-[10px] uppercase tracking-widest" style={{ color: cfg.color }}>{cfg.label}</span>
                          </div>
                          <div className="grid gap-1 border-t border-gray-50 pt-2 text-[10px] font-bold text-gray-400 uppercase tracking-tighter">
                            <div>Station Distance: <span className="text-gray-900">{dist != null ? formatDistance(dist) : '—'}</span></div>
                            <div>Signal Precision: <span className="text-gray-900">{r.gps_accuracy ? `±${r.gps_accuracy.toFixed(1)}m` : '—'}</span></div>
                          </div>
                        </div>
                      </Popup>
                    </CircleMarker>
                  )
                })}
              </MapContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center bg-gray-50 text-gray-300 gap-4">
                <EyeOff className="w-12 h-12 opacity-20" />
                <div className="text-xs font-bold uppercase tracking-widest opacity-40">Awaiting Coordinate Stream</div>
              </div>
            )}
          </div>
        </div>

        {/* Stats panel */}
        <div className="grid grid-cols-1 gap-6">
          <div className="bg-white rounded-[2.5rem] border border-gray-100 p-8 shadow-sm space-y-8">
            <h3 className="text-xl font-bold text-gray-900 tracking-tight flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-gray-50 flex items-center justify-center">
                <Clock className="w-4 h-4 text-gray-400" />
              </div>
              Session
            </h3>
            
            <div className="grid gap-6">
              <div className="flex justify-between items-end">
                <div>
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Fleet Count</div>
                  <div className="text-2xl font-bold text-gray-900">{session.total_devices} Devices</div>
                </div>
                <Users className="w-10 h-10 text-gray-50" />
              </div>

              <div className="w-full h-px bg-gray-50" />

              <div className="grid grid-cols-2 gap-8">
                <div>
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Timestamp Start</div>
                  <div className="text-lg font-bold text-gray-900">{new Date(session.initiated_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Verification Rate</div>
                  <div className="text-lg font-bold text-green-600">
                    {session.total_devices > 0 ? Math.round((session.present_count / session.total_devices) * 100) : 0}% Efficiency
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Admin Location */}
          <div className="bg-black text-white rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden group">
            <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-[#FA9411] opacity-10 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-1000" />
            <h3 className="font-bold text-white mb-6 flex items-center gap-3 text-lg">
              <Navigation className="w-5 h-5 text-[#FA9411]" /> Control Base Station
            </h3>
            {adminPos ? (
              <div className="space-y-6">
                <div className="flex items-center gap-6">
                  <div className="flex-1">
                    <div className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1">Global Position</div>
                    <div className="text-sm font-bold tracking-tight">{adminPos[0].toFixed(6)}, {adminPos[1].toFixed(6)}</div>
                  </div>
                  <div className="w-px h-8 bg-white/10" />
                  <div className="flex-1">
                    <div className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1">Signal Confidence</div>
                    <div className={`text-sm font-bold ${adminAccuracy && adminAccuracy <= 15 ? 'text-green-400' : 'text-orange-400'}`}>
                      {adminAccuracy ? `\u00b1${Math.round(adminAccuracy)}m` : 'Unstable'}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-sm font-bold text-white/30 flex items-center gap-2">
                <EyeOff className="w-4 h-4" />
                Hardware location services inactive
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Device table */}
      <div className="bg-white rounded-[2.5rem] border border-gray-100 overflow-hidden shadow-sm">
        <div className="px-8 py-6 border-b border-gray-50 flex items-center justify-between">
          <h3 className="text-xl font-bold text-gray-900 tracking-tight">Status Log</h3>
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest bg-gray-50 px-4 py-1.5 rounded-full border border-gray-100">
            {records.length} Active Records
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1200px]">
            <thead>
              <tr className="bg-gray-50/50 text-left text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                <th className="px-8 py-4 cursor-pointer hover:text-[#FA9411] transition-colors" onClick={() => toggleSort('device_name')}>
                  <div className="flex items-center gap-2">Hardware Device <ArrowUpDown className="w-3 h-3" /></div>
                </th>
                <th className="px-8 py-4 cursor-pointer hover:text-[#FA9411] transition-colors" onClick={() => toggleSort('status')}>
                  <div className="flex items-center gap-2">Outcome <ArrowUpDown className="w-3 h-3" /></div>
                </th>
                <th className="px-8 py-4 cursor-pointer hover:text-[#FA9411] transition-colors" onClick={() => toggleSort('confidence')}>
                  <div className="flex items-center gap-2">Audit Certainty <ArrowUpDown className="w-3 h-3" /></div>
                </th>
                <th className="px-8 py-4">Coordinates</th>
                <th className="px-8 py-4 cursor-pointer hover:text-[#FA9411] transition-colors" onClick={() => toggleSort('gps_accuracy')}>
                  <div className="flex items-center gap-2">Offset <ArrowUpDown className="w-3 h-3" /></div>
                </th>
                <th className="px-8 py-4 cursor-pointer hover:text-[#FA9411] transition-colors" onClick={() => toggleSort('gps_accuracy')}>
                  <div className="flex items-center gap-2">Signal Error <ArrowUpDown className="w-3 h-3" /></div>
                </th>
                <th className="px-8 py-4 cursor-pointer hover:text-[#FA9411] transition-colors" onClick={() => toggleSort('distance')}>
                  <div className="flex items-center gap-2">Distance <ArrowUpDown className="w-3 h-3" /></div>
                </th>
                <th className="px-8 py-4 cursor-pointer hover:text-[#FA9411] transition-colors" onClick={() => toggleSort('battery_level')}>
                  <div className="flex items-center gap-2">Charge <ArrowUpDown className="w-3 h-3" /></div>
                </th>
                <th className="px-8 py-4">Net</th>
                <th className="px-8 py-4 cursor-pointer hover:text-[#FA9411] transition-colors" onClick={() => toggleSort('response_time_ms')}>
                  <div className="flex items-center gap-2">Signal Speed <ArrowUpDown className="w-3 h-3" /></div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sortedRecords.map(r => {
                const cfg = STATUS_CONFIG[r.status] || STATUS_CONFIG.pending
                const Icon = cfg.icon
                const conf = computeConfidence(r, getDeviationFromZone(r))
                return (
                  <tr key={r.id} className="hover:bg-gray-50 transition-all group">
                    <td className="px-8 py-5">
                      <div className="font-bold text-gray-900 group-hover:text-[#FA9411] transition-colors">{r.device_name || 'Device-X'}</div>
                      <div className="text-[10px] font-bold uppercase text-gray-400 tracking-tighter">{r.device_model || 'Standard Unit'}</div>
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest border" style={{ borderColor: cfg.color + '20', color: cfg.color, backgroundColor: cfg.color + '05' }}>
                          <Icon className="w-3 h-3" />
                          {cfg.label}
                        </span>
                        {r.cluster_status === 'chain_upgraded' && (
                          <div className="bg-green-500 p-1 rounded-md text-white shadow-sm" title="Proximity Chain Verification">
                            <Link className="w-3 h-3" />
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      {conf ? (
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-3 bg-gray-50 rounded-full overflow-hidden w-20 border border-gray-100 p-0.5">
                            <div className="h-full rounded-full transition-all shadow-[0_0_8px_rgba(0,0,0,0.1)]" style={{ width: `${conf.score}%`, backgroundColor: conf.textColor }} />
                          </div>
                          <span className="text-xs font-bold" style={{ color: conf.textColor }}>
                            {conf.score}%
                          </span>
                        </div>
                      ) : (
                        <span className="text-gray-300 font-bold text-[10px] uppercase tracking-widest">—</span>
                      )}
                    </td>
                    <td className="px-8 py-5 font-mono text-[11px] font-bold text-gray-400 group-hover:text-gray-600 transition-colors">
                      {r.latitude != null && r.longitude != null ? (
                        <>{r.latitude.toFixed(6)}<br/>{r.longitude.toFixed(6)}</>
                      ) : 'Awaiting Link'}
                    </td>
                    <td className="px-8 py-5">
                      {(() => {
                        const dev = getDeviationFromZone(r)
                        if (dev == null) return <span className="text-gray-300">—</span>
                        return (
                          <div className={`font-bold text-xs ${dev <= 30 ? 'text-green-500' : dev <= 80 ? 'text-orange-500' : 'text-red-500'}`}>
                            {formatDistance(dev)}
                          </div>
                        )
                      })()}
                    </td>
                    <td className="px-8 py-5 text-gray-500 font-bold text-xs uppercase tracking-tighter">
                      {r.gps_accuracy != null ? `\u00b1${r.gps_accuracy.toFixed(1)}m` : '—'}
                    </td>
                    <td className="px-8 py-5">
                      {(() => {
                        const dist = getDistanceToAdmin(r)
                        if (dist == null) return <span className="text-gray-300 font-bold text-[10px] uppercase tracking-widest">—</span>
                        return (
                          <div className={`font-bold text-xs ${dist <= 50 ? 'text-green-500' : dist <= 150 ? 'text-[#FA9411]' : 'text-red-500'}`}>
                            {formatDistance(dist)}
                          </div>
                        )
                      })()}
                    </td>
                    <td className="px-8 py-5">
                      {r.battery_level != null ? (
                        <div className="flex items-center gap-1.5">
                          <div className={`w-1.5 h-3 rounded-sm ${r.battery_level < 20 ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`} />
                          <span className="font-bold text-gray-900">{r.battery_level}%</span>
                        </div>
                      ) : '—'}
                    </td>
                    <td className="px-8 py-5 font-bold text-gray-400 uppercase text-[10px] tracking-widest">
                      {r.connection_type || '—'}
                    </td>
                    <td className="px-8 py-5">
                      {r.response_time_ms != null ? (
                        <div className={`inline-flex items-center px-2 py-1 rounded-lg font-bold text-[10px] uppercase tracking-tighter ${r.response_time_ms > 8000 ? 'bg-red-50 text-red-500' : 'bg-gray-100 text-gray-600'}`}>
                          {r.response_time_ms > 1000 ? `${(r.response_time_ms / 1000).toFixed(1)}s` : `${r.response_time_ms}ms`}
                        </div>
                      ) : (
                        <div className="animate-pulse flex items-center gap-1">
                          <div className="w-1.5 h-1.5 rounded-full bg-orange-400" />
                          <span className="text-[10px] font-bold text-orange-400 uppercase tracking-widest">Racing</span>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
              {records.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-8 py-20 text-center">
                    <div className="flex flex-col items-center gap-4 opacity-30">
                      <RefreshCw className="w-12 h-12 text-[#FA9411] animate-spin" />
                      <div className="text-sm font-bold uppercase tracking-widest">Securing Fleet Handshakes...</div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
