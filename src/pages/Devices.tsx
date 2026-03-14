import { useState, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { devicesAPI, commandsAPI, enrollmentsAPI, groupsAPI } from '../api'
import { 
  Search, 
  ChevronLeft, 
  ChevronRight,
  Tablet,
  Wifi,
  AlertTriangle,
  Download,
  Lock,
  RotateCcw,
  Trash2,
  X,
  Loader2,
  EyeOff,
  Eye,
  Ear,
  Volume2,
  Power,
  CheckSquare,
  Square,
  XCircle,
  Calendar,
  Fingerprint
} from 'lucide-react'

const getTimeAgo = (date: string | null): string => {
  if (!date) return 'Never'
  const now = new Date()
  const past = new Date(date)
  const diffMs = now.getTime() - past.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)
  
  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return past.toLocaleDateString()
}


export default function Devices() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()

  // On first mount: if URL has no filter params, restore from sessionStorage
  const [initialized, setInitialized] = useState(false)
  useEffect(() => {
    const hasUrlFilters = searchParams.has('q') || searchParams.has('status') || searchParams.has('enrollment') || searchParams.has('group') || searchParams.has('page') || searchParams.has('issam_search') || searchParams.has('issam_filter') || searchParams.has('last_seen_from') || searchParams.has('last_seen_to')
    if (!hasUrlFilters) {
      const saved = sessionStorage.getItem('devices_filters')
      if (saved) {
        try {
          const params = new URLSearchParams(saved)
          // Only restore if there are actual filters saved
          if (params.toString()) {
            setSearchParams(params, { replace: true })
          }
        } catch (_) { /* ignore */ }
      }
    }
    setInitialized(true)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Derive filter state from URL search params
  const page = Number(searchParams.get('page')) || 1
  const search = searchParams.get('q') || ''
  const statusFilter = searchParams.get('status') || ''
  const enrollmentFilter = searchParams.get('enrollment') || ''
  const groupFilter = searchParams.get('group') || ''
  const issamSearch = searchParams.get('issam_search') || ''
  const issamFilter = searchParams.get('issam_filter') || ''
  const lastSeenFrom = searchParams.get('last_seen_from') || ''
  const lastSeenTo = searchParams.get('last_seen_to') || ''

  // Persist to sessionStorage whenever URL params change
  useEffect(() => {
    if (initialized) {
      sessionStorage.setItem('devices_filters', searchParams.toString())
    }
  }, [searchParams, initialized])

  const updateParams = useCallback((updates: Record<string, string>) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      for (const [key, value] of Object.entries(updates)) {
        if (value) {
          next.set(key, value)
        } else {
          next.delete(key)
        }
      }
      return next
    }, { replace: true })
  }, [setSearchParams])

  const setPage = (v: number | ((p: number) => number)) => {
    const next = typeof v === 'function' ? v(page) : v
    updateParams({ page: next > 1 ? String(next) : '' })
  }

  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [appHiddenBulk, setAppHiddenBulk] = useState(false)
  const pageSize = 20

  const { data, isLoading } = useQuery({
    queryKey: ['devices', page, search, statusFilter, enrollmentFilter, groupFilter, issamSearch, issamFilter, lastSeenFrom, lastSeenTo],
    queryFn: () => devicesAPI.list({ 
      page, 
      page_size: pageSize, 
      search: search || undefined,
      status: statusFilter || undefined,
      enrollment_token: enrollmentFilter || undefined,
      group_id: groupFilter || undefined,
      issam_search: issamSearch || undefined,
      issam_filter: issamFilter || undefined,
      last_seen_from: lastSeenFrom ? new Date(lastSeenFrom + 'T00:00:00').toISOString() : undefined,
      last_seen_to: lastSeenTo ? new Date(lastSeenTo + 'T23:59:59').toISOString() : undefined,
    }),
    refetchInterval: 30000,
  })

  const { data: enrollments } = useQuery({
    queryKey: ['enrollments'],
    queryFn: () => enrollmentsAPI.list(),
  })

  const { data: groups } = useQuery({
    queryKey: ['groups'],
    queryFn: () => groupsAPI.list(),
  })

  const bulkMutation = useMutation({
    mutationFn: ({ type, deviceIds }: { type: string, deviceIds: string[] }) => 
      commandsAPI.bulk({
        device_ids: deviceIds,
        command_type: type,
        priority: 10
      }),
    onSuccess: () => {
      setSelectedIds([])
      alert('Bulk command issued successfully')
      queryClient.invalidateQueries({ queryKey: ['devices'] })
    }
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => devicesAPI.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] })
      queryClient.invalidateQueries({ queryKey: ['enrollments'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
    }
  })

  const handleExport = async () => {
    try {
      const csvData = await devicesAPI.export()
      const blob = new Blob([csvData], { type: 'text/csv' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.setAttribute('hidden', '')
      a.setAttribute('href', url)
      a.setAttribute('download', `devices_export_${new Date().toISOString().split('T')[0]}.csv`)
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } catch (error) {
      console.error('Export failed:', error)
      alert('Export failed. Please try again.')
    }
  }

  const devices = data?.devices ?? []

  const toggleSelectAll = () => {
    const onlineDevices = devices.filter(d => d.status === 'online')
    const onlineIds = onlineDevices.map(d => d.id)
    const allOnlineSelected = onlineIds.length > 0 && onlineIds.every(id => selectedIds.includes(id))
    if (allOnlineSelected) {
      setSelectedIds([])
    } else {
      setSelectedIds(onlineIds)
    }
  }

  const allOnlineSelected = (() => {
    const onlineIds = devices.filter(d => d.status === 'online').map(d => d.id)
    return onlineIds.length > 0 && onlineIds.every(id => selectedIds.includes(id))
  })()

  const hasActiveFilters = statusFilter || enrollmentFilter || groupFilter || issamSearch || issamFilter || lastSeenFrom || lastSeenTo

  const clearAllFilters = () => {
    sessionStorage.removeItem('devices_filters')
    updateParams({ status: '', enrollment: '', group: '', page: '', q: '', issam_search: '', issam_filter: '', last_seen_from: '', last_seen_to: '' })
  }

  const toggleSelect = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    const device = devices.find(d => d.id === id)
    if (device?.status !== 'online') return
    if (selectedIds.includes(id)) {
      setSelectedIds(prev => prev.filter(i => i !== id))
    } else {
      setSelectedIds(prev => [...prev, id])
    }
  }

  const getBatteryColor = (level?: number) => {
    if (level === undefined) return 'text-gray-400'
    if (level > 50) return 'text-green-600'
    if (level > 20) return 'text-yellow-600'
    return 'text-red-600'
  }

  return (
    <div className="animate-fade-in space-y-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <div className="flex-1">
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Registered Devices</h1>
          <p className="text-gray-500 mt-2 text-lg">
            Manage and monitor your {data?.total ?? 0} active units.
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          {/* Select All / Deselect All - New Custom UI */}
          <button
            onClick={toggleSelectAll}
            className={`flex items-center gap-4 px-6 py-4 rounded-3xl text-sm font-bold transition-all shadow-md group whitespace-nowrap ${
              allOnlineSelected 
                ? 'bg-[#FA9411] text-white shadow-[#FA9411]/20' 
                : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all shrink-0 ${
              allOnlineSelected 
                ? 'bg-white border-white' 
                : 'border-gray-200 group-hover:border-[#FA9411]'
            }`}>
              {allOnlineSelected && <CheckSquare className="w-4 h-4 text-[#FA9411]" />}
            </div>
            <span className="tracking-tight uppercase text-[11px] font-black">{allOnlineSelected ? 'Deselect All' : 'Select All Online'}</span>
          </button>
          
          <button 
            onClick={handleExport}
            className="p-4 bg-white border border-gray-100 rounded-3xl hover:border-[#FA9411] hover:text-[#FA9411] transition-all shadow-sm shrink-0"
            title="Download CSV"
          >
            <Download className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Search + Filters - Redesigned Row */}
      <div className="flex flex-col xl:flex-row gap-6">
        {/* Search Bar - Wider */}
        <div className="flex-1 relative group min-w-0">
          <Search className="w-6 h-6 text-gray-300 absolute left-6 top-1/2 -translate-y-1/2 group-focus-within:text-[#FA9411] transition-colors" />
          <input
            type="text"
            placeholder="Search by name, model, hardware ID..."
            value={search}
            onChange={(e) => {
              updateParams({ q: e.target.value, page: '' })
            }}
            className="w-full pl-16 pr-8 py-6 bg-white border-2 border-transparent focus:bg-white focus:border-[#FA9411]/20 rounded-[2.5rem] focus:outline-none shadow-sm transition-all text-gray-900 placeholder:text-gray-400 font-bold"
          />
        </div>

        {/* Filters Group - Ultra Clean */}
        <div className="flex flex-wrap items-center gap-4 p-3 bg-white border border-gray-100 rounded-[2.5rem] shadow-sm overflow-hidden">
          {/* Status Filter */}
          <div className="flex flex-col px-4 border-r border-gray-100 min-w-[120px]">
            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Status</span>
            <select
              value={statusFilter}
              onChange={(e) => updateParams({ status: e.target.value, page: '' })}
              className={`bg-transparent text-sm font-bold appearance-none cursor-pointer focus:outline-none ${statusFilter ? 'text-[#FA9411]' : 'text-gray-900'}`}
            >
              <option value="">All Status</option>
              <option value="online">Online</option>
              <option value="offline">Offline</option>
              <option value="pending">Pending</option>
            </select>
          </div>

          {/* Enrollment Filter */}
          <div className="flex flex-col px-4 border-r border-gray-100 min-w-[140px]">
            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Enrollment</span>
            <select
              value={enrollmentFilter}
              onChange={(e) => updateParams({ enrollment: e.target.value, page: '' })}
              className={`bg-transparent text-sm font-bold appearance-none cursor-pointer focus:outline-none max-w-[180px] truncate ${enrollmentFilter ? 'text-[#FA9411]' : 'text-gray-900'}`}
            >
              <option value="">Select Token</option>
              {enrollments?.map((e: any) => (
                <option key={e.token} value={e.token}>{e.name || e.token.substring(0, 8)}</option>
              ))}
            </select>
          </div>

          {/* Group Filter */}
          <div className="flex flex-col px-4 border-r border-gray-100 min-w-[140px]">
            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Group</span>
            <select
              value={groupFilter}
              onChange={(e) => updateParams({ group: e.target.value, page: '' })}
              className={`bg-transparent text-sm font-bold appearance-none cursor-pointer focus:outline-none max-w-[180px] truncate ${groupFilter ? 'text-[#FA9411]' : 'text-gray-900'}`}
            >
              <option value="">All Groups</option>
              {groups?.map((g: any) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>

          {/* ISSAM ID Filter */}
          <div className="flex flex-col px-4 border-r border-gray-100 min-w-[120px]">
            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">ISSAM ID</span>
            <select
              value={issamFilter}
              onChange={(e) => updateParams({ issam_filter: e.target.value, page: '' })}
              className={`bg-transparent text-sm font-bold appearance-none cursor-pointer focus:outline-none ${issamFilter ? 'text-[#FA9411]' : 'text-gray-900'}`}
            >
              <option value="">All</option>
              <option value="has">Has ISSAM</option>
              <option value="missing">Missing ISSAM</option>
            </select>
          </div>

          {/* Clear All Filters */}
          {hasActiveFilters && (
            <button
              onClick={clearAllFilters}
              className="ml-auto lg:ml-2 w-12 h-12 flex items-center justify-center bg-red-50 text-red-500 hover:bg-red-100 rounded-2xl transition-all shrink-0"
              title="Reset Filters"
            >
              <XCircle className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* ISSAM Search + Last Sync Date Range */}
      <div className="flex flex-col xl:flex-row gap-4">
        {/* ISSAM ID Search */}
        <div className="flex-1 relative group min-w-0">
          <Fingerprint className="w-5 h-5 text-gray-300 absolute left-5 top-1/2 -translate-y-1/2 group-focus-within:text-[#FA9411] transition-colors" />
          <input
            type="text"
            placeholder="Search by ISSAM ID..."
            value={issamSearch}
            onChange={(e) => updateParams({ issam_search: e.target.value, page: '' })}
            className="w-full pl-14 pr-6 py-4 bg-white border-2 border-transparent focus:bg-white focus:border-[#FA9411]/20 rounded-[2rem] focus:outline-none shadow-sm transition-all text-gray-900 placeholder:text-gray-400 font-bold text-sm"
          />
        </div>

        {/* Last Sync Date Range */}
        <div className="flex items-center gap-3 p-2 bg-white border border-gray-100 rounded-[2rem] shadow-sm">
          <Calendar className="w-5 h-5 text-gray-300 ml-3 shrink-0" />
          <div className="flex flex-col px-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-0.5">Synced From</span>
            <input
              type="date"
              value={lastSeenFrom}
              onChange={(e) => updateParams({ last_seen_from: e.target.value, page: '' })}
              className={`bg-transparent text-sm font-bold cursor-pointer focus:outline-none ${lastSeenFrom ? 'text-[#FA9411]' : 'text-gray-900'}`}
            />
          </div>
          <div className="w-px h-8 bg-gray-100" />
          <div className="flex flex-col px-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-0.5">Synced To</span>
            <input
              type="date"
              value={lastSeenTo}
              onChange={(e) => updateParams({ last_seen_to: e.target.value, page: '' })}
              className={`bg-transparent text-sm font-bold cursor-pointer focus:outline-none ${lastSeenTo ? 'text-[#FA9411]' : 'text-gray-900'}`}
            />
          </div>
        </div>
      </div>

      {/* Device Grid Interaction */}
      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-10 h-10 border-4 border-[#FA9411] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : devices.length > 0 ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {devices.map((device) => (
              <div
                key={device.id}
                onClick={() => navigate(`/devices/${device.id}${location.search}`)}
                className={`relative group bg-white border-2 p-6 rounded-[2.5rem] transition-all duration-300 cursor-pointer overflow-hidden ${
                  selectedIds.includes(device.id) 
                    ? 'border-[#FA9411] shadow-xl shadow-[#FA9411]/10 bg-gradient-to-br from-white to-[#FA9411]/5' 
                    : 'border-transparent shadow-sm hover:shadow-xl hover:-translate-y-1'
                }`}
              >
                {/* Custom Selection Checkbox (top-right) */}
                <div 
                  className={`absolute top-6 right-6 z-10 transition-all duration-300 ${
                    selectedIds.includes(device.id) ? 'opacity-100 scale-110' : 'opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100'
                  }`}
                  onClick={(e) => toggleSelect(e as any, device.id)}
                >
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all shadow-sm ${
                    selectedIds.includes(device.id) 
                      ? 'bg-[#FA9411] text-white' 
                      : 'bg-white border-2 border-gray-100 text-gray-300 hover:border-[#FA9411] hover:text-[#FA9411]'
                  }`}>
                    {selectedIds.includes(device.id) ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                  </div>
                </div>

                <div className="flex items-start space-x-5">
                  <div className={`p-4 rounded-2xl ${device.status === 'online' ? 'bg-[#FA9411]/10 text-[#FA9411]' : 'bg-gray-100 text-gray-400'}`}>
                    <Tablet className="w-8 h-8" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-xl text-gray-900 truncate tracking-tight">{device.name || device.model || 'Unnamed Device'}</div>
                    <div className="text-sm text-gray-500 mt-1 capitalize">{device.manufacturer} · Android {device.android_version}</div>
                  </div>
                </div>

                <div className="mt-8 grid grid-cols-2 gap-4">
                  <div className="bg-gray-50 rounded-2xl p-3">
                    <div className="text-[10px] uppercase tracking-widest text-gray-400 font-bold mb-1">Status</div>
                    <div className="flex items-center text-sm font-semibold">
                      <span className={`w-2 h-2 rounded-full mr-2 ${device.status === 'online' ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`} />
                      {device.status === 'offline' ? 'Offline' : 'Online'}
                    </div>
                  </div>
                  <div className="bg-gray-50 rounded-2xl p-3">
                    <div className="text-[10px] uppercase tracking-widest text-gray-400 font-bold mb-1">Battery</div>
                    <div className={`text-sm font-semibold ${getBatteryColor(device.battery_level)}`}>
                      {device.battery_level !== undefined ? `${device.battery_level}%` : 'Unknown'}
                    </div>
                  </div>
                </div>

                {/* ISSAM ID Badge */}
                <div className="mt-3">
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold ${
                    device.issam_id 
                      ? 'bg-green-50 text-green-700' 
                      : 'bg-gray-50 text-gray-400'
                  }`}>
                    <Fingerprint className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{device.issam_id || 'No ISSAM ID'}</span>
                  </div>
                </div>

                <div className="mt-6 pt-6 border-t border-gray-50 flex items-center justify-between text-xs text-gray-400">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setDeleteTarget({ id: device.id, name: device.name || device.model || 'Unnamed Device' })
                    }}
                    className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                    title="Remove Device"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <div className="flex items-center">
                    <Wifi className="w-3.5 h-3.5 mr-1.5" />
                    {device.network_type || 'No Signal'}
                  </div>
                  <div>Synced {getTimeAgo(device.last_seen || null)}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between pt-10 pb-20">
            <div className="text-sm font-medium text-gray-500">
              Showing page <span className="text-gray-900">{page}</span> of {data!.total_pages}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="flex items-center px-5 py-3 bg-white border border-gray-200 rounded-2xl text-sm font-semibold hover:bg-gray-50 disabled:opacity-40 transition-all shadow-sm"
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Previous
              </button>
              <button
                onClick={() => setPage(p => Math.min(data!.total_pages, p + 1))}
                disabled={page === data!.total_pages}
                className="flex items-center px-5 py-3 bg-white border border-gray-200 rounded-2xl text-sm font-semibold hover:bg-gray-50 disabled:opacity-40 transition-all shadow-sm"
              >
                Next
                <ChevronRight className="w-4 h-4 ml-1" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-32 bg-white border border-dashed border-gray-200 rounded-[3rem]">
          <Tablet className="w-16 h-16 text-gray-200 mb-6" />
          <p className="text-xl font-bold text-gray-900">No units found</p>
          <p className="text-gray-500 mt-2">Adjust your search or filters to see more.</p>
        </div>
      )}

      {/* Bulk Actions Bar - Redesigned for more space and better UI */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-12 duration-500">
          <div className="bg-gray-900/95 backdrop-blur-xl ring-1 ring-white/10 rounded-[3rem] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.5)] p-4 flex items-center gap-6">
            {/* Selected Info */}
            <div className="flex flex-col items-center justify-center pl-6 pr-8 border-r border-white/10">
              <span className="text-3xl font-black text-[#FA9411] leading-none tracking-tighter">{selectedIds.length}</span>
              <span className="text-[10px] font-black text-white/40 uppercase tracking-widest mt-1">Units</span>
            </div>

            {/* Actions Grid-like grouping */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1 bg-white/5 p-1 rounded-3xl">
                <BulkActionBtn
                  icon={Ear}
                  label="Capture ISSAM"
                  onClick={() => bulkMutation.mutate({ type: 'CAPTURE_ISSAM', deviceIds: selectedIds })}
                  disabled={bulkMutation.isPending}
                />
                <BulkActionBtn
                  icon={Volume2}
                  label="Ring"
                  onClick={() => bulkMutation.mutate({ type: 'RING_DEVICE', deviceIds: selectedIds })}
                  disabled={bulkMutation.isPending}
                />
              </div>

              <div className="flex items-center gap-1 bg-white/5 p-1 rounded-3xl">
                {/* App Visibility Toggle */}
                <button
                  onClick={() => {
                    const nextType = appHiddenBulk ? 'SHOW_APP' : 'HIDE_APP'
                    bulkMutation.mutate({ type: nextType, deviceIds: selectedIds }, {
                      onSuccess: () => setAppHiddenBulk(!appHiddenBulk)
                    })
                  }}
                  disabled={bulkMutation.isPending}
                  className="flex flex-col items-center gap-2 px-6 py-3 rounded-2xl transition-all hover:bg-white/10 group min-w-[100px]"
                >
                  <div className="relative">
                    {appHiddenBulk ? <Eye className="w-6 h-6 text-green-400" /> : <EyeOff className="w-6 h-6 text-yellow-400 group-hover:text-[#FA9411]" />}
                  </div>
                  <span className="text-[11px] font-black text-white/60 group-hover:text-white uppercase tracking-tight">{appHiddenBulk ? 'Show App' : 'Hide App'}</span>
                </button>
              </div>

              <div className="flex items-center gap-1 bg-white/5 p-1 rounded-3xl">
                <BulkActionBtn
                  icon={Lock}
                  label="Lock"
                  onClick={() => bulkMutation.mutate({ type: 'LOCK', deviceIds: selectedIds })}
                  disabled={bulkMutation.isPending}
                />
                <BulkActionBtn
                  icon={RotateCcw}
                  label="Reboot"
                  onClick={() => bulkMutation.mutate({ type: 'REBOOT', deviceIds: selectedIds })}
                  disabled={bulkMutation.isPending}
                />
                <BulkActionBtn
                  icon={Power}
                  label="Power Off"
                  onClick={() => bulkMutation.mutate({ type: 'POWER_OFF', deviceIds: selectedIds })}
                  disabled={bulkMutation.isPending}
                />
              </div>

              <div className="flex items-center gap-1 bg-red-500/10 p-1 rounded-3xl ml-2">
                <BulkActionBtn
                  icon={AlertTriangle}
                  label="Wipe"
                  onClick={() => {
                    if (window.confirm(`Wipe ${selectedIds.length} device(s)? This cannot be undone.`)) {
                      bulkMutation.mutate({ type: 'WIPE', deviceIds: selectedIds })
                    }
                  }}
                  disabled={bulkMutation.isPending}
                  variant="danger"
                />
              </div>
            </div>

            {/* Cancel Action */}
            <button
              onClick={() => setSelectedIds([])}
              className="ml-4 mr-2 w-14 h-14 flex items-center justify-center rounded-full bg-white/5 hover:bg-red-500 hover:text-white text-white/40 transition-all shadow-inner group"
              title="Cancel Selection"
            >
              <X className="w-6 h-6 group-hover:rotate-90 transition-transform duration-300" />
            </button>
          </div>
        </div>
      )}

      {/* Remove Device Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-sm p-8 animate-slide-up shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <div className="p-3 bg-red-50 rounded-2xl">
                <Trash2 className="w-6 h-6 text-red-500" />
              </div>
              <button
                onClick={() => setDeleteTarget(null)}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Remove Device?</h2>
            <p className="text-sm text-gray-500 leading-relaxed mb-8">
              <span className="font-semibold text-gray-700">{deleteTarget.name}</span> will be removed from the system 
              and its setup link slot will be freed up for a new device.
            </p>
            <div className="flex gap-4">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 px-4 py-4 border border-gray-200 rounded-[1.5rem] font-bold text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  deleteMutation.mutate(deleteTarget.id, {
                    onSuccess: () => setDeleteTarget(null),
                  })
                }}
                disabled={deleteMutation.isPending}
                className="flex-1 px-4 py-4 bg-red-500 text-white rounded-[1.5rem] font-bold hover:bg-red-600 shadow-lg shadow-red-100 transition-all disabled:opacity-50 flex items-center justify-center"
              >
                {deleteMutation.isPending ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  'Yes, Remove'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function BulkActionBtn({ icon: Icon, label, onClick, disabled, variant = 'default' }: {
  icon: any; label: string; onClick: () => void; disabled: boolean; variant?: 'default' | 'warning' | 'danger'
}) {
  const colors = {
    default: 'text-white/60 hover:text-white hover:bg-white/10 group',
    warning: 'text-orange-400 hover:text-orange-300 hover:bg-orange-500/10 group',
    danger: 'text-red-400 hover:text-red-300 hover:bg-red-500/10 group',
  }
  const iconColors = {
    default: 'text-white/40 group-hover:text-[#FA9411]',
    warning: 'text-orange-500',
    danger: 'text-red-500',
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center gap-1.5 px-3 py-2 rounded-2xl transition-all disabled:opacity-20 ${colors[variant]}`}
    >
      <Icon className={`w-5 h-5 transition-transform group-hover:scale-110 ${iconColors[variant]}`} />
      <span className="text-[10px] font-bold uppercase tracking-tight">{label}</span>
    </button>
  )
}