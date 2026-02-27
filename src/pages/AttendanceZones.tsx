import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { attendanceAPI, groupsAPI, enrollmentsAPI, type AttendanceZone } from '../api'
import type { EnrollmentToken } from '../types'
import { MapPin, Plus, Trash2, Play, Users, Clock, X } from 'lucide-react'

interface Group { id: string; name: string }

export default function AttendanceZones() {
  const navigate = useNavigate()
  const [zones, setZones] = useState<AttendanceZone[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [takingAttendance, setTakingAttendance] = useState<string | null>(null)

  // Popup state
  const [showPopup, setShowPopup] = useState(false)
  const [popupZone, setPopupZone] = useState<AttendanceZone | null>(null)
  const [filterType, setFilterType] = useState<'default' | 'group' | 'enrollment'>('default')
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState('')
  const [groups, setGroups] = useState<Group[]>([])
  const [enrollments, setEnrollments] = useState<EnrollmentToken[]>([])

  useEffect(() => {
    loadZones()
    groupsAPI.list().then((d: any) => setGroups(Array.isArray(d) ? d : [])).catch(() => {})
    enrollmentsAPI.list().then((d) => setEnrollments(Array.isArray(d) ? d.filter(e => e.is_active) : [])).catch(() => {})
  }, [])

  const loadZones = async () => {
    try {
      setLoading(true)
      const data = await attendanceAPI.listZones()
      setZones(data)
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load zones')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete zone "${name}"? This cannot be undone.`)) return
    try {
      await attendanceAPI.deleteZone(id)
      setZones(zones.filter(z => z.id !== id))
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to delete zone')
    }
  }

  const openAttendancePopup = (zone: AttendanceZone) => {
    setPopupZone(zone)
    setFilterType('default')
    setSelectedGroupId('')
    setSelectedEnrollmentId('')
    setShowPopup(true)
  }

  const handleConfirmAttendance = async () => {
    if (!popupZone) return
    const zoneId = popupZone.id
    try {
      setTakingAttendance(zoneId)
      setShowPopup(false)

      const opts: { group_id?: string; enrollment_id?: string } = {}
      if (filterType === 'group' && selectedGroupId) {
        opts.group_id = selectedGroupId
      } else if (filterType === 'enrollment' && selectedEnrollmentId) {
        opts.enrollment_id = selectedEnrollmentId
      }

      const session = await attendanceAPI.takeAttendance(zoneId, 45, Object.keys(opts).length > 0 ? opts : undefined)
      navigate(`/attendance/session/${session.session_id}`)
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to start attendance')
      setTakingAttendance(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black" />
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-bold text-gray-900 tracking-tight">Attendance</h1>
          <p className="text-gray-500 mt-2 font-medium">Manage check-in areas and verify device locations</p>
        </div>
        <button
          onClick={() => navigate('/attendance/calibrate')}
          className="flex items-center justify-center gap-2 bg-[#FA9411] text-white px-8 py-4 rounded-[2rem] hover:bg-[#e88910] transition-all font-bold shadow-lg shadow-orange-500/20 active:scale-95"
        >
          <Plus className="w-5 h-5" />
          Create Area
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-100 text-red-700 px-6 py-4 rounded-[2rem] flex items-center justify-between animate-in fade-in slide-in-from-top-4 duration-300">
          <span className="font-medium">{error}</span>
          <button onClick={() => setError('')} className="p-2 hover:bg-black/5 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Zones Grid */}
      {zones.length === 0 ? (
        <div className="bg-white rounded-[2.5rem] border border-gray-100 p-20 text-center shadow-sm">
          <div className="bg-orange-50 w-24 h-24 rounded-[2rem] flex items-center justify-center mx-auto mb-6">
            <MapPin className="w-10 h-10 text-[#FA9411]" />
          </div>
          <h3 className="text-2xl font-bold text-gray-900 mb-2">No check-in areas yet</h3>
          <p className="text-gray-500 mb-10 max-w-sm mx-auto font-medium">
            Define a perimeter for automatic attendance tracking by selecting surface points.
          </p>
          <button
            onClick={() => navigate('/attendance/calibrate')}
            className="inline-flex items-center gap-3 bg-black text-white px-10 py-4 rounded-[2rem] hover:bg-gray-800 transition-all font-bold active:scale-95 shadow-xl"
          >
            <Plus className="w-5 h-5" />
            Set Up First Area
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {zones.map((zone) => (
            <div key={zone.id} className="bg-white rounded-[2.5rem] border border-gray-100 overflow-hidden hover:shadow-xl hover:shadow-gray-200/50 transition-all duration-300 group">
              {/* Zone mini map placeholder */}
              <div className="h-40 bg-gray-50 relative flex items-center justify-center overflow-hidden">
                <div className="absolute inset-0 bg-[#FA9411]/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <MapPin className="w-10 h-10 text-[#FA9411]/30 group-hover:scale-110 transition-transform duration-500" />
                
                <div className="absolute top-4 right-4">
                  <span className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full shadow-sm ${
                    zone.is_active ? 'bg-green-500 text-white' : 'bg-gray-400 text-white'
                  }`}>
                    {zone.is_active ? 'Active' : 'Offline'}
                  </span>
                </div>

                {zone.polygon && zone.polygon.length > 0 && (
                  <div className="absolute bottom-4 left-4 flex gap-2">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-[#FA9411] bg-white px-3 py-1.5 rounded-full shadow-sm border border-orange-50">
                      {zone.polygon.length} Points
                    </div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 bg-white px-3 py-1.5 rounded-full shadow-sm border border-gray-50">
                      {zone.buffer_meters}m Margin
                    </div>
                  </div>
                )}
              </div>

              {/* Zone info */}
              <div className="p-8">
                <h3 className="font-bold text-gray-900 text-xl mb-3">{zone.name}</h3>
                <div className="flex flex-col gap-2.5">
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Users className="w-4 h-4 text-gray-300" />
                    <span className="font-medium truncate">{zone.group_name || 'All Hardware'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Clock className="w-4 h-4 text-gray-300" />
                    <span className="font-medium">{new Date(zone.created_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3 mt-8 pt-8 border-t border-gray-50">
                  <button
                    onClick={() => openAttendancePopup(zone)}
                    disabled={takingAttendance === zone.id}
                    className="flex-1 flex items-center justify-center gap-2 bg-black text-white px-4 py-3.5 rounded-[1.5rem] hover:bg-gray-800 transition-all disabled:opacity-50 text-sm font-bold active:scale-95 shadow-lg"
                  >
                    {takingAttendance === zone.id ? (
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                    ) : (
                      <>
                        <Play className="w-4 h-4" />
                        Start Check-in
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => handleDelete(zone.id, zone.name)}
                    className="p-3.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-[1.5rem] transition-all"
                    title="Remove Area"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showPopup && popupZone && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 backdrop-blur-sm p-4" onClick={() => setShowPopup(false)}>
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="px-8 py-8 border-b border-gray-50 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 leading-tight">Begin Attendance</h2>
                <p className="text-gray-500 font-medium mt-1">{popupZone.name}</p>
              </div>
              <button onClick={() => setShowPopup(false)} className="p-3 hover:bg-gray-100 rounded-full transition-colors">
                <X className="w-6 h-6 text-gray-400" />
              </button>
            </div>

            {/* Body */}
            <div className="p-8 space-y-6">
              <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Select Audience</p>

              {/* Filter type radio buttons */}
              <div className="grid gap-3">
                <label className={`flex items-start gap-4 p-5 rounded-[1.5rem] cursor-pointer transition-all border-2 ${
                  filterType === 'default' ? 'border-[#FA9411] bg-orange-50/30' : 'border-gray-50 bg-gray-50/50 hover:bg-gray-50'
                }`}>
                  <input
                    type="radio" name="filterType" value="default" checked={filterType === 'default'}
                    onChange={() => setFilterType('default')}
                    className="hidden"
                  />
                  <div className={`mt-1 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    filterType === 'default' ? 'border-[#FA9411]' : 'border-gray-300'
                  }`}>
                    {filterType === 'default' && <div className="w-2.5 h-2.5 rounded-full bg-[#FA9411]" />}
                  </div>
                  <div>
                    <div className="font-bold text-gray-900">Area Settings</div>
                    <div className="text-sm text-gray-500 font-medium mt-1">
                      {popupZone.group_name ? `Limited to Group: ${popupZone.group_name}` : popupZone.enrollment_name ? `Enrollment: ${popupZone.enrollment_name}` : 'All active devices'}
                    </div>
                  </div>
                </label>

                <label className={`flex items-start gap-4 p-5 rounded-[1.5rem] cursor-pointer transition-all border-2 ${
                  filterType === 'group' ? 'border-[#FA9411] bg-orange-50/30' : 'border-gray-50 bg-gray-50/50 hover:bg-gray-50'
                }`}>
                  <input
                    type="radio" name="filterType" value="group" checked={filterType === 'group'}
                    onChange={() => setFilterType('group')}
                    className="hidden"
                  />
                  <div className={`mt-1 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    filterType === 'group' ? 'border-[#FA9411]' : 'border-gray-300'
                  }`}>
                    {filterType === 'group' && <div className="w-2.5 h-2.5 rounded-full bg-[#FA9411]" />}
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-gray-900">Manual Group Selection</div>
                    {filterType === 'group' && (
                      <div className="mt-4">
                        <select
                          value={selectedGroupId}
                          onChange={e => setSelectedGroupId(e.target.value)}
                          className="w-full bg-white border-2 border-orange-100 rounded-2xl px-4 py-3 text-sm font-bold focus:ring-0 focus:border-[#FA9411] transition-all"
                        >
                          <option value="">Select a group...</option>
                          {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                </label>

                <label className={`flex items-start gap-4 p-5 rounded-[1.5rem] cursor-pointer transition-all border-2 ${
                  filterType === 'enrollment' ? 'border-[#FA9411] bg-orange-50/30' : 'border-gray-50 bg-gray-50/50 hover:bg-gray-50'
                }`}>
                  <input
                    type="radio" name="filterType" value="enrollment" checked={filterType === 'enrollment'}
                    onChange={() => setFilterType('enrollment')}
                    className="hidden"
                  />
                  <div className={`mt-1 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    filterType === 'enrollment' ? 'border-[#FA9411]' : 'border-gray-300'
                  }`}>
                    {filterType === 'enrollment' && <div className="w-2.5 h-2.5 rounded-full bg-[#FA9411]" />}
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-gray-900">Specific Enrollment Entry</div>
                    {filterType === 'enrollment' && (
                      <div className="mt-4">
                        <select
                          value={selectedEnrollmentId}
                          onChange={e => setSelectedEnrollmentId(e.target.value)}
                          className="w-full bg-white border-2 border-orange-100 rounded-2xl px-4 py-3 text-sm font-bold focus:ring-0 focus:border-[#FA9411] transition-all"
                        >
                          <option value="">Select an enrollment...</option>
                          {enrollments.map(e => (
                            <option key={e.id} value={e.id}>
                              {e.name || e.token.slice(0, 12)} ({e.current_uses} devices)
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                </label>
              </div>
            </div>

            {/* Footer */}
            <div className="p-8 border-t border-gray-50 flex items-center gap-4">
              <button
                onClick={() => setShowPopup(false)}
                className="flex-1 px-8 py-4 border border-gray-100 text-gray-400 rounded-[1.5rem] font-bold hover:bg-gray-50 transition-all active:scale-95"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmAttendance}
                disabled={
                  (filterType === 'group' && !selectedGroupId) ||
                  (filterType === 'enrollment' && !selectedEnrollmentId)
                }
                className="flex-[2] flex items-center justify-center gap-2 bg-[#FA9411] text-white px-8 py-4 rounded-[1.5rem] font-bold hover:bg-[#e88910] disabled:opacity-50 transition-all active:scale-95 shadow-lg shadow-orange-500/20"
              >
                <Play className="w-5 h-5 fill-current" />
                Confirm & Start
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
