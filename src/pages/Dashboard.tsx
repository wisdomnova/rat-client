import { useQuery } from '@tanstack/react-query'
import { devicesAPI } from '../api'
import { Tablet, Wifi, WifiOff, Clock, AlertCircle} from 'lucide-react'

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

export default function Dashboard() {
  const { data: stats } = useQuery({
    queryKey: ['stats'],
    queryFn: devicesAPI.getStats,
    refetchInterval: 30000, // Refresh every 30 seconds
  })

  const { data: recentDevices } = useQuery({
    queryKey: ['devices', 'recent'],
    queryFn: () => devicesAPI.list({ page: 1, page_size: 5 }),
    refetchInterval: 30000,
  })

  const statCards = [
    {
      label: 'Total Devices',
      value: stats?.total_devices ?? 0,
      icon: Tablet,
    },
    {
      label: 'Online',
      value: stats?.online_devices ?? 0,
      icon: Wifi,
    },
    {
      label: 'Offline',
      value: stats?.offline_devices ?? 0,
      icon: WifiOff,
      color: 'text-gray-400',
    },
    {
      label: 'Pending',
      value: stats?.pending_devices ?? 0,
      icon: Clock,
      color: 'text-gray-500',
    },
  ]

  return (
    <div className="animate-fade-in space-y-10">
      {/* Introduction */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight">System Overview</h1>
        <p className="text-gray-500 mt-2 text-lg">Detailed summary of your current device fleet.</p>
      </div>

      {/* Modern Metrics Display */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-0 border border-gray-200 rounded-3xl overflow-hidden bg-white shadow-sm">
        {statCards.map((stat, index) => (
          <div
            key={stat.label}
            className={`p-8 flex flex-col justify-between min-h-[160px] ${
              index !== statCards.length - 1 ? 'border-b md:border-b-0 md:border-r border-gray-100' : ''
            } hover:bg-gray-50 transition-colors group`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-500 uppercase tracking-widest">{stat.label}</span>
              <stat.icon className={`w-5 h-5 ${stat.color || 'text-[#FA9411]'} opacity-50 group-hover:opacity-100 transition-opacity`} />
            </div>
            <div className="mt-4">
              <div className="text-5xl font-light text-gray-900 tracking-tighter leading-none">
                {stat.value.toLocaleString()}
              </div>
              <div className="h-1 w-12 bg-[#FA9411] mt-6 rounded-full opacity-20 group-hover:opacity-100 group-hover:w-24 transition-all duration-500" />
            </div>
          </div>
        ))}
      </div>

      {/* Main Content Sections */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-10">
        {/* Recent Activity Panel */}
        <div className="xl:col-span-2">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-gray-900">Latest Connections</h2>
            <div className="h-px flex-1 bg-gray-100 mx-6" />
          </div>
          
          <div className="bg-white border border-gray-100 rounded-3xl overflow-hidden">
            {recentDevices?.devices && recentDevices.devices.length > 0 ? (
              <div className="divide-y divide-gray-50">
                {recentDevices.devices.map((device) => (
                  <div
                    key={device.id}
                    className="group px-8 py-6 flex items-center justify-between hover:bg-[#FA9411]/[0.02] transition-colors"
                  >
                    <div className="flex items-center space-x-6">
                      <div className={`p-3 rounded-2xl ${device.status === 'online' ? 'bg-[#FA9411]/10 text-[#FA9411]' : 'bg-gray-100 text-gray-400'}`}>
                        <Tablet className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="font-semibold text-gray-900 group-hover:text-[#FA9411] transition-colors">
                          {device.name || device.model || 'Unnamed Device'}
                        </div>
                        <div className="text-sm text-gray-400 mt-1 flex items-center">
                          <span className={`w-2 h-2 rounded-full mr-2 ${device.status === 'online' ? 'bg-[#FA9411]' : 'bg-gray-300'}`} />
                          {device.status === 'offline' 
                            ? `Disconnected ${getTimeAgo(device.last_seen || null)}`
                            : 'Currently Active'
                          }
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-12">
                      <div className="text-right hidden sm:block">
                        <div className="text-sm font-medium text-gray-900">{device.battery_level}%</div>
                        <div className="text-xs text-gray-400 uppercase tracking-tighter">Battery</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium text-gray-900">
                          {device.last_seen ? new Date(device.last_seen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Never'}
                        </div>
                        <div className="text-xs text-gray-400 uppercase tracking-tighter">Last Seen</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-8 py-20 text-center">
                <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <AlertCircle className="w-8 h-8 text-gray-300" />
                </div>
                <p className="text-gray-500 font-medium tracking-tight">No active devices found</p>
                <p className="text-sm text-gray-400 mt-1">Enrollment is required to view activity.</p>
              </div>
            )}
          </div>
        </div>

        {/* Quick Context Panel */}
        <div className="space-y-6">
          <div className="bg-[#FA9411] text-white p-8 rounded-3xl min-h-[300px] flex flex-col justify-between">
            <div>
              <h2 className="text-xl font-bold mb-2">Fleet Pulse</h2>
              <p className="text-white/80 text-sm leading-relaxed">
                Your system is currently managing {stats?.total_devices ?? 0} total units. 
                Keep an eye on disconnected devices to ensure security policy compliance.
              </p>
            </div>
            
            <div className="bg-black/10 rounded-2xl p-4 flex items-center justify-between border border-white/10">
              <div className="text-sm font-medium">Auto-Syncing</div>
              <div className="flex space-x-1">
                <div className="w-1 h-3 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1 h-4 bg-white rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1 h-2 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
