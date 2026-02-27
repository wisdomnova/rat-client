import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { commandsAPI, groupsAPI, enrollmentsAPI, devicesAPI } from '../api'
import type { Command } from '../types'
import {
  Terminal,
  Send,
  Globe,
  Users,
  KeyRound,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  ChevronDown,
  Trash2,
  XCircle,
} from 'lucide-react'

interface ShellExecution {
  id: string
  command: string
  timestamp: Date
  targetType: string
  targetLabel: string
  commands: Command[]
  totalDevices: number
  onlineDevices: number
}

export default function RemoteShell() {
  const [targetType, setTargetType] = useState<'all' | 'group' | 'enrollment'>('all')
  const [selectedGroupId, setSelectedGroupId] = useState<string>('')
  const [selectedEnrollmentToken, setSelectedEnrollmentToken] = useState<string>('')
  const [commandInput, setCommandInput] = useState('')
  const [isExecuting, setIsExecuting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [executions, setExecutions] = useState<ShellExecution[]>([])
  const [expandedExecution, setExpandedExecution] = useState<string | null>(null)

  const outputRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Fetch groups
  const { data: groups } = useQuery({
    queryKey: ['groups'],
    queryFn: () => groupsAPI.list(),
    staleTime: 5 * 60 * 1000,
  })

  // Fetch enrollments
  const { data: enrollments } = useQuery({
    queryKey: ['enrollments'],
    queryFn: () => enrollmentsAPI.list(),
    staleTime: 5 * 60 * 1000,
  })

  // Fetch device stats
  const { data: deviceStats } = useQuery({
    queryKey: ['devices', 'stats'],
    queryFn: () => devicesAPI.getStats(),
    staleTime: 5 * 60 * 1000,
  })

  // Auto-scroll to bottom
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [executions])

  // Poll for command results
  const pollResults = useCallback(async () => {
    setExecutions(prev => {
      const pendingExecs = prev.filter(e =>
        e.commands.some(c => c.status !== 'completed' && c.status !== 'failed' && c.status !== 'timeout')
      )
      if (pendingExecs.length === 0) return prev

      // Trigger async poll for each pending command
      pendingExecs.forEach(exec => {
        exec.commands.forEach(async (cmd, idx) => {
          if (cmd.status === 'completed' || cmd.status === 'failed' || cmd.status === 'timeout') return
          try {
            const updated = await commandsAPI.get(cmd.id)
            setExecutions(current =>
              current.map(e => {
                if (e.id !== exec.id) return e
                const newCommands = [...e.commands]
                newCommands[idx] = updated
                return { ...e, commands: newCommands }
              })
            )
          } catch {
            // Ignore polling errors
          }
        })
      })

      return prev
    })
  }, [])

  useEffect(() => {
    pollingRef.current = setInterval(pollResults, 2000)
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [pollResults])

  const getTargetLabel = () => {
    switch (targetType) {
      case 'all':
        return 'All Devices'
      case 'group': {
        const group = groups?.find((g: any) => g.id === selectedGroupId)
        return group ? `Group: ${group.name}` : 'Group'
      }
      case 'enrollment': {
        const enrollment = enrollments?.find((e: any) => e.token === selectedEnrollmentToken)
        return enrollment ? `Enrollment: ${enrollment.name || enrollment.token}` : 'Enrollment'
      }
    }
  }

  const executeCommand = async () => {
    if (!commandInput.trim() || isExecuting) return

    if (targetType === 'group' && !selectedGroupId) {
      setError('Please select a group')
      return
    }
    if (targetType === 'enrollment' && !selectedEnrollmentToken) {
      setError('Please select an enrollment')
      return
    }

    setIsExecuting(true)
    setError(null)

    try {
      const payload: any = {
        command: commandInput.trim(),
        target_type: targetType,
      }
      if (targetType === 'group') payload.group_id = selectedGroupId
      if (targetType === 'enrollment') payload.enrollment_token = selectedEnrollmentToken

      const result = await commandsAPI.bulkShell(payload)

      const execution: ShellExecution = {
        id: crypto.randomUUID(),
        command: commandInput.trim(),
        timestamp: new Date(),
        targetType,
        targetLabel: getTargetLabel(),
        commands: result.commands,
        totalDevices: result.total_devices,
        onlineDevices: result.online_devices,
      }

      setExecutions(prev => [...prev, execution])
      setExpandedExecution(execution.id)
      setCommandInput('')
    } catch (err: any) {
      const msg = err.response?.data?.error?.message || err.message || 'Failed to execute command'
      setError(msg)
    } finally {
      setIsExecuting(false)
      inputRef.current?.focus()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      executeCommand()
    }
  }

  const clearHistory = () => {
    setExecutions([])
    setExpandedExecution(null)
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-4 h-4 text-green-400" />
      case 'failed':
      case 'timeout':
        return <XCircle className="w-4 h-4 text-red-400" />
      case 'pending':
      case 'queued':
      case 'delivered':
      case 'executing':
        return <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
      default:
        return <Clock className="w-4 h-4 text-gray-400" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-green-400'
      case 'failed': case 'timeout': return 'text-red-400'
      default: return 'text-amber-400'
    }
  }

  const getCompletionStats = (commands: Command[]) => {
    const completed = commands.filter(c => c.status === 'completed').length
    const failed = commands.filter(c => c.status === 'failed' || c.status === 'timeout').length
    const pending = commands.length - completed - failed
    return { completed, failed, pending }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-gray-900">
            Command Terminal
          </h1> 
          <p className="text-gray-500 mt-1">Send technical instructions to your phones</p>
        </div>
        {executions.length > 0 && (
          <button
            onClick={clearHistory}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Clear History
          </button>
        )}
      </div>

      {/* Target Selection */}
      <div className="bg-white rounded-[2.5rem] border border-gray-200 p-8 shadow-sm">
        <h2 className="text-sm font-bold text-gray-700 mb-5">Choose Phones</h2>
        <div className="flex gap-3 mb-6">
          <button
            onClick={() => setTargetType('all')}
            className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-bold transition-all ${
              targetType === 'all'
                ? 'bg-[#FA9411] text-white shadow-lg'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <Globe className="w-4 h-4" />
            All Devices
            {deviceStats && (
              <span className={`ml-1 px-1.5 py-0.5 text-xs rounded-full ${
                targetType === 'all' ? 'bg-white/20' : 'bg-gray-200'
              }`}>
                {(deviceStats as any)?.online_devices || 0} online
              </span>
            )}
          </button>
          <button
            onClick={() => setTargetType('enrollment')}
            className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-bold transition-all ${
              targetType === 'enrollment'
                ? 'bg-[#FA9411] text-white shadow-lg'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <KeyRound className="w-4 h-4" />
            By Setup Group
          </button>
          <button
            onClick={() => setTargetType('group')}
            className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-bold transition-all ${
              targetType === 'group'
                ? 'bg-[#FA9411] text-white shadow-lg'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <Users className="w-4 h-4" />
            By Team/Group
          </button>
        </div>

        {targetType === 'group' && (
          <div className="relative">
            <select
              value={selectedGroupId}
              onChange={(e) => setSelectedGroupId(e.target.value)}
              className="w-full appearance-none bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#FA9411] focus:border-transparent"
            >
              <option value="">Select a group...</option>
              {groups?.map((g: any) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-gray-400 absolute right-4 top-3.5 pointer-events-none" />
          </div>
        )}

        {targetType === 'enrollment' && (
          <div className="relative">
            <select
              value={selectedEnrollmentToken}
              onChange={(e) => setSelectedEnrollmentToken(e.target.value)}
              className="w-full appearance-none bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#FA9411] focus:border-transparent"
            >
              <option value="">Select an enrollment...</option>
              {enrollments?.map((e: any) => (
                <option key={e.id} value={e.token}>{e.name || e.token} (uses: {e.current_uses})</option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-gray-400 absolute right-4 top-3.5 pointer-events-none" />
          </div>
        )}
      </div>

      {/* Terminal */}
      <div className="bg-gray-950 rounded-[2.5rem] border border-gray-800 overflow-hidden shadow-2xl relative">
        <div className="absolute top-0 left-0 right-0 h-1 bg-[#FA9411]" />
        {/* Terminal Header */}
        <div className="bg-gray-900/50 px-6 py-4 flex items-center justify-between border-b border-gray-800/50">
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500/80" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
              <div className="w-3 h-3 rounded-full bg-green-500/80" />
            </div>
            <span className="text-gray-400 text-sm ml-3 font-mono">
              mdm-shell — {getTargetLabel()}
            </span>
          </div>
          <span className="text-gray-500 text-xs font-mono">
            {executions.length} task result{executions.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Terminal Output */}
        <div
          ref={outputRef}
          className="p-6 h-[500px] overflow-y-auto font-mono text-sm space-y-4"
          onClick={() => inputRef.current?.focus()}
        >
          {executions.length === 0 && (
            <div className="text-gray-600 text-center py-20">
              <Terminal className="w-12 h-12 mx-auto mb-3 opacity-20 text-[#FA9411]" />
              <p>Enter a command below to send to your phones</p>
              <p className="text-xs text-gray-700 mt-2">
                Instructions run securely via the MDM agent
              </p>
            </div>
          )}

          {executions.map((exec) => {
            const stats = getCompletionStats(exec.commands)
            const isExpanded = expandedExecution === exec.id

            return (
              <div key={exec.id} className="border-b border-gray-800/50 pb-4 last:border-0">
                {/* Command line */}
                <div
                  className="flex items-start gap-2 cursor-pointer hover:bg-gray-900/50 rounded-lg px-3 py-2 -mx-2 transition-colors"
                  onClick={() => setExpandedExecution(isExpanded ? null : exec.id)}
                >
                  <span className="text-[#FA9411] shrink-0 font-bold">$</span>
                  <span className="text-gray-100 flex-1 font-medium">{exec.command}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    {stats.completed > 0 && (
                      <span className="text-green-400 text-xs font-bold">{stats.completed}✓</span>
                    )}
                    {stats.failed > 0 && (
                      <span className="text-red-400 text-xs font-bold">{stats.failed}✗</span>
                    )}
                    {stats.pending > 0 && (
                      <span className="text-amber-400 text-xs font-bold animate-pulse">{stats.pending}⏳</span>
                    )}
                    <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                  </div>
                </div>

                {/* Metadata line */}
                <div className="text-gray-600 text-xs ml-6 mt-1 flex items-center gap-2">
                  <Clock className="w-3 h-3" />
                  {exec.timestamp.toLocaleTimeString()} · {exec.targetLabel} · {exec.onlineDevices}/{exec.totalDevices} devices online
                </div>

                {/* Expanded results */}
                {isExpanded && (
                  <div className="mt-4 ml-6 space-y-3">
                    {exec.commands.map((cmd) => (
                      <div key={cmd.id} className="bg-gray-900/40 rounded-2xl p-4 border border-gray-800/50">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {getStatusIcon(cmd.status)}
                            <span className="text-gray-300 text-xs font-bold">{cmd.device_id.slice(0, 8)}</span>
                          </div>
                          <span className={`text-[10px] uppercase tracking-wider font-bold ${getStatusColor(cmd.status)}`}>
                            {cmd.status}
                          </span>
                        </div>

                        {cmd.status === 'completed' && cmd.result && (
                          <div className="mt-3 space-y-2">
                            {(cmd.result as any).stdout && (
                              <div className="space-y-1">
                                <span className="text-[10px] text-gray-500 font-bold uppercase tracking-tight">Normal Output</span>
                                <pre className="text-gray-300 text-xs whitespace-pre-wrap break-all bg-black/40 rounded-xl p-3 border border-gray-800/30">
                                  {(cmd.result as any).stdout}
                                </pre>
                              </div>
                            )}
                            {(cmd.result as any).stderr && (
                              <div className="space-y-1">
                                <span className="text-[10px] text-red-400 font-bold uppercase tracking-tight">Error Details</span>
                                <pre className="text-red-300/80 text-xs whitespace-pre-wrap break-all bg-red-950/20 rounded-xl p-3 border border-red-900/20">
                                  {(cmd.result as any).stderr}
                                </pre>
                              </div>
                            )}
                            {(cmd.result as any).exit_code !== undefined && (cmd.result as any).exit_code !== 0 && (
                              <div className="flex items-center gap-1.5 text-red-400 text-[10px] font-bold mt-2 bg-red-950/30 w-fit px-2 py-0.5 rounded-full">
                                <XCircle className="w-3 h-3" />
                                Return Code: {(cmd.result as any).exit_code}
                              </div>
                            )}
                          </div>
                        )}

                        {cmd.status === 'failed' && cmd.error_message && (
                          <div className="mt-2 bg-red-950/20 rounded-xl p-3 border border-red-900/20">
                            <pre className="text-red-300/80 text-xs whitespace-pre-wrap break-all">{cmd.error_message}</pre>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Command Input */}
        <div className="border-t border-gray-800/50 bg-gray-900/50 px-6 py-5">
          {error && (
            <div className="flex items-center gap-2 text-red-400 text-sm mb-4 bg-red-950/30 border border-red-900/30 rounded-2xl px-4 py-3">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}
          <div className="flex items-center gap-4">
            <span className="text-[#FA9411] font-bold text-lg shrink-0">$</span>
            <input
              ref={inputRef}
              type="text"
              value={commandInput}
              onChange={(e) => setCommandInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type instruction... (e.g., ls -la, whoami, df -h)"
              className="flex-1 bg-transparent text-gray-100 font-mono text-sm outline-none placeholder-gray-600"
              disabled={isExecuting}
              autoFocus
            />
            <button
              onClick={executeCommand}
              disabled={isExecuting || !commandInput.trim()}
              className="flex items-center gap-2 px-6 py-2.5 bg-[#FA9411] hover:bg-[#E0830F] disabled:bg-gray-800 disabled:text-gray-600 text-white text-sm font-bold rounded-2xl transition-all shadow-lg shadow-orange-950/20 active:scale-95"
            >
              {isExecuting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              Send Command
            </button>
          </div>
        </div>
      </div>

      {/* Tips */}
      <div className="bg-orange-50 border border-orange-200 rounded-[2.5rem] p-8 shadow-sm">
        <h3 className="text-sm font-bold text-orange-900 mb-4 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          Usage Tips
        </h3>
        <ul className="text-xs text-orange-800 space-y-3">
          <li className="flex items-start gap-2">
            <span className="mt-1 w-1 h-1 rounded-full bg-orange-400 shrink-0" />
            <span>Commands run as the MDM agent app user (limited permissions, not root)</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1 w-1 h-1 rounded-full bg-orange-400 shrink-0" />
            <span>Standard Linux commands work: <code className="bg-orange-100 px-1.5 py-0.5 rounded-md font-bold text-orange-900 mx-1">ls</code>, <code className="bg-orange-100 px-1.5 py-0.5 rounded-md font-bold text-orange-900 mx-1">cat</code>, <code className="bg-orange-100 px-1.5 py-0.5 rounded-md font-bold text-orange-900 mx-1">whoami</code></span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1 w-1 h-1 rounded-full bg-orange-400 shrink-0" />
            <span>Output is limited to 10KB per device to prevent hardware overload</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1 w-1 h-1 rounded-full bg-orange-400 shrink-0" />
            <span>Results are polled every 2 seconds — click a task entry to view command results</span>
          </li>
        </ul>
      </div>
    </div>
  )
}
