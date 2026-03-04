import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { devicesAPI, commandsAPI } from '../api'
import { 
  Search, 
  Filter, 
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
  FileSearch
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
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const pageSize = 20

  const { data, isLoading } = useQuery({
    queryKey: ['devices', page, search, statusFilter],
    queryFn: () => devicesAPI.list({ 
      page, 
      page_size: pageSize, 
      search: search || undefined,
      status: statusFilter || undefined 
    }),
    refetchInterval: 30000,
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

  const toggleSelectAll = () => {
    const onlineDevices = data?.devices.filter(d => d.status === 'online') || []
    const onlineIds = onlineDevices.map(d => d.id)
    const allOnlineSelected = onlineIds.length > 0 && onlineIds.every(id => selectedIds.includes(id))
    if (allOnlineSelected) {
      setSelectedIds([])
    } else {
      setSelectedIds(onlineIds)
    }
  }

  const toggleSelect = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    const device = data?.devices.find(d => d.id === id)
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
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Registered Devices</h1>
          <p className="text-gray-500 mt-2 text-lg">
            Manage and monitor your {data?.total ?? 0} active units.
          </p>
        </div>
        <button 
          onClick={handleExport}
          className="flex items-center px-6 py-3 bg-white border border-gray-200 rounded-2xl hover:border-[#FA9411] hover:text-[#FA9411] transition-all text-sm font-semibold shadow-sm"
        >
          <Download className="w-4 h-4 mr-2" />
          Download List (CSV)
        </button>
      </div>

      {/* Control Bar */}
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="flex-1 relative group">
          <Search className="w-5 h-5 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2 group-focus-within:text-[#FA9411] transition-colors" />
          <input
            type="text"
            placeholder="Search by name, model, or ID..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            className="w-full pl-12 pr-4 py-4 bg-white border border-gray-200 rounded-3xl focus:outline-none focus:border-[#FA9411] shadow-sm transition-all text-gray-900 placeholder:text-gray-400"
          />
        </div>
        <div className="flex gap-4">
          <div className="relative min-w-[180px]">
            <Filter className="w-5 h-5 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2" />
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value)
                setPage(1)
              }}
              className="w-full pl-12 pr-10 py-4 bg-white border border-gray-200 rounded-3xl focus:outline-none focus:border-[#FA9411] shadow-sm transition-all appearance-none text-gray-700 font-medium"
            >
              <option value="">All Conditions</option>
              <option value="online">Online Only</option>
              <option value="offline">Currently Offline</option>
              <option value="pending">Waiting</option>
            </select>
          </div>
          
          <button 
            onClick={toggleSelectAll}
            className="px-6 py-4 bg-white border border-gray-200 rounded-3xl text-sm font-semibold hover:bg-gray-50 transition-colors whitespace-nowrap shadow-sm"
          >
            {data?.devices && data.devices.filter(d => d.status === 'online').length > 0 && 
             data.devices.filter(d => d.status === 'online').every(id => selectedIds.includes(id.id)) 
             ? 'Deselect All' : 'Select All Online'}
          </button>
        </div>
      </div>

      {/* Device Grid Interaction */}
      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-10 h-10 border-4 border-[#FA9411] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : data?.devices && data.devices.length > 0 ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {data.devices.map((device) => (
              <div
                key={device.id}
                onClick={() => navigate(`/devices/${device.id}`)}
                className={`relative group bg-white border-2 p-6 rounded-[2rem] transition-all cursor-pointer hover:shadow-xl hover:-translate-y-1 ${
                  selectedIds.includes(device.id) 
                    ? 'border-[#FA9411] shadow-lg shadow-[#FA9411]/5' 
                    : 'border-transparent shadow-sm'
                }`}
              >
                {/* Selection Checkbox (top-right, stealth until hover) */}
                <div 
                  className={`absolute top-6 right-6 z-10 transition-opacity ${selectedIds.includes(device.id) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <input 
                    type="checkbox" 
                    className="w-6 h-6 rounded-full border-2 border-gray-200 text-[#FA9411] focus:ring-[#FA9411] disabled:opacity-10 cursor-pointer"
                    checked={selectedIds.includes(device.id)}
                    disabled={device.status !== 'online'}
                    onChange={(e) => toggleSelect(e as any, device.id)}
                  />
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
              Showing page <span className="text-gray-900">{page}</span> of {data.total_pages}
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
                onClick={() => setPage(p => Math.min(data.total_pages, p + 1))}
                disabled={page === data.total_pages}
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

      {/* Bulk Actions (Updated for Orange Branding) */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-[#FA9411] text-white px-8 py-5 rounded-[2.5rem] shadow-2xl flex items-center space-x-8 z-50 animate-in slide-in-from-bottom-8 duration-500">
          <div className="flex items-center pr-8 border-r border-white/20">
            <span className="font-bold text-2xl mr-2 leading-none">{selectedIds.length}</span>
            <span className="text-white/80 text-sm font-medium uppercase tracking-wider">Selected</span>
          </div>
          
          <div className="flex items-center space-x-6">
            <button 
              onClick={() => bulkMutation.mutate({ type: 'LOCK', deviceIds: selectedIds })}
              disabled={bulkMutation.isPending}
              className="flex items-center hover:scale-105 transition-transform text-sm font-bold disabled:opacity-50"
            >
              <Lock className="w-5 h-5 mr-2" />
              Lock
            </button>
            <button 
              onClick={() => bulkMutation.mutate({ type: 'REBOOT', deviceIds: selectedIds })}
              disabled={bulkMutation.isPending}
              className="flex items-center hover:scale-105 transition-transform text-sm font-bold disabled:opacity-50"
            >
              <RotateCcw className="w-5 h-5 mr-2" />
              Reboot
            </button>
            <button 
              onClick={() => bulkMutation.mutate({ type: 'WIPE', deviceIds: selectedIds })}
              disabled={bulkMutation.isPending}
              className="flex items-center text-white/90 hover:text-white transition-colors text-sm font-bold disabled:opacity-50"
            >
              <AlertTriangle className="w-5 h-5 mr-2" />
              Wipe
            </button>

            <div className="w-px h-6 bg-white/20" />

            <button 
              onClick={() => bulkMutation.mutate({ type: 'HIDE_APP', deviceIds: selectedIds })}
              disabled={bulkMutation.isPending}
              className="flex items-center hover:scale-105 transition-transform text-sm font-bold disabled:opacity-50"
            >
              <EyeOff className="w-5 h-5 mr-2" />
              Hide App
            </button>
            <button 
              onClick={() => bulkMutation.mutate({ type: 'SHOW_APP', deviceIds: selectedIds })}
              disabled={bulkMutation.isPending}
              className="flex items-center hover:scale-105 transition-transform text-sm font-bold disabled:opacity-50"
            >
              <Eye className="w-5 h-5 mr-2" />
              Show App
            </button>

            <div className="w-px h-6 bg-white/20" />

            <button 
              onClick={() => bulkMutation.mutate({ type: 'EXTRACT_ISSAM', deviceIds: selectedIds })}
              disabled={bulkMutation.isPending}
              className="flex items-center hover:scale-105 transition-transform text-sm font-bold disabled:opacity-50"
            >
              <FileSearch className="w-5 h-5 mr-2" />
              Extract ISSAM
            </button>
          </div>

          <button 
            onClick={() => setSelectedIds([])}
            className="pl-8 border-l border-white/20 text-white/70 hover:text-white text-sm font-bold transition-colors"
          >
            Cancel
          </button>
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
