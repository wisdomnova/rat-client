import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { 
  Lock, 
  Unlock, 
  Loader2, 
  Check, 
  AlertTriangle, 
  Users, 
  Shield,
  Tablet,
  Info,
  ChevronRight,
  Zap
} from 'lucide-react'
import { commandsAPI, enrollmentsAPI, groupsAPI } from '../api'
import type { EnrollmentToken } from '../types'

type TargetType = 'all' | 'group' | 'enrollment'

export default function KioskDesigner() {
  const [targetType, setTargetType] = useState<TargetType>('all')
  const [selectedGroup, setSelectedGroup] = useState('')
  const [selectedEnrollment, setSelectedEnrollment] = useState('')
  const [lastResult, setLastResult] = useState<{ action: string; count: number; total: number; online: number } | null>(null)
  const [confirmAction, setConfirmAction] = useState<'start' | 'stop' | null>(null)

  const { data: enrollments } = useQuery({
    queryKey: ['enrollments'],
    queryFn: enrollmentsAPI.list,
  })

  const { data: groups } = useQuery({
    queryKey: ['groups'],
    queryFn: groupsAPI.list,
  })

  const kioskMutation = useMutation({
    mutationFn: (action: 'start' | 'stop') => {
      const data: { action: 'start' | 'stop'; target_type: string; group_id?: string; enrollment_token?: string } = {
        action,
        target_type: targetType,
      }
      if (targetType === 'group') data.group_id = selectedGroup
      if (targetType === 'enrollment') data.enrollment_token = selectedEnrollment
      return commandsAPI.bulkKiosk(data)
    },
    onSuccess: (data) => {
      setLastResult({
        action: data.action,
        count: data.count,
        total: data.total_devices,
        online: data.online_devices,
      })
      setConfirmAction(null)
      setTimeout(() => setLastResult(null), 5000)
    },
    onError: () => {
      setConfirmAction(null)
    }
  })

  const canExecute = targetType === 'all' || 
    (targetType === 'group' && selectedGroup) || 
    (targetType === 'enrollment' && selectedEnrollment)

  const getTargetLabel = () => {
    if (targetType === 'all') return 'ALL devices'
    if (targetType === 'group') {
      const group = groups?.find((g: any) => g.id === selectedGroup)
      return group ? `group "${group.name}"` : 'selected group'
    }
    if (targetType === 'enrollment') {
      const enrollment = enrollments?.find((e: EnrollmentToken) => e.token === selectedEnrollment)
      return enrollment ? `enrollment "${enrollment.name || enrollment.token.slice(0, 8)}"` : 'selected enrollment'
    }
    return 'target'
  }

  return (
    <div className="animate-fade-in space-y-8 pb-20">
      <div className="flex justify-between items-end mb-8"> 
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Device Lockdown</h1>
          <p className="text-gray-500 font-medium mt-1 uppercase text-xs tracking-wider">Kiosk Mode Management</p>
        </div>
      </div>

      {/* Result Banner */}
      {lastResult && (
        <div className={`p-6 rounded-[1.5rem] border-2 flex items-center gap-4 animate-slide-up ${
          lastResult.action === 'start' 
            ? 'bg-red-50 border-red-100 text-red-800' 
            : 'bg-emerald-50 border-emerald-100 text-emerald-800'
        }`}>
          <div className={`p-2 rounded-full ${lastResult.action === 'start' ? 'bg-red-500' : 'bg-emerald-500'} text-white`}>
            {lastResult.action === 'start' ? <Lock className="w-5 h-5" /> : <Unlock className="w-5 h-5" />}
          </div>
          <span className="font-bold">
            {lastResult.action === 'start' ? 'Lockdown Initiated' : 'Access Restored'} on {lastResult.count} device{lastResult.count !== 1 ? 's' : ''} 
            {' '}({lastResult.online} online /{lastResult.total} total)
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Target Selection */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white border border-gray-100 rounded-[2rem] p-8 shadow-sm">
            <h3 className="text-[11px] font-bold uppercase text-gray-400 tracking-[0.2em] mb-6">Select Targets</h3>
            
            <div className="space-y-3">
              <label 
                className={`flex items-center p-4 border rounded-2xl cursor-pointer transition-all group ${
                  targetType === 'all' ? 'border-[#FA9411] bg-orange-50 shadow-sm' : 'border-gray-100 hover:border-gray-200 bg-gray-50/30'
                }`}
                onClick={() => setTargetType('all')}
              >
                <div className={`p-3 rounded-xl mr-4 transition-colors ${
                  targetType === 'all' ? 'bg-[#FA9411] text-white' : 'bg-white text-gray-400 group-hover:text-black'
                }`}>
                  <Tablet className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className={`text-sm font-bold ${targetType === 'all' ? 'text-black' : 'text-gray-500'}`}>All Registered Devices</div>
                  <div className="text-[10px] uppercase font-bold tracking-tight text-gray-400">Global selection</div>
                </div>
                <input 
                  type="radio" 
                  name="target" 
                  checked={targetType === 'all'} 
                  readOnly
                  className="hidden"
                />
              </label>

              <label 
                className={`flex items-center p-4 border rounded-2xl cursor-pointer transition-all group ${
                  targetType === 'group' ? 'border-[#FA9411] bg-orange-50 shadow-sm' : 'border-gray-100 hover:border-gray-200 bg-gray-50/30'
                }`}
                onClick={() => setTargetType('group')}
              >
                <div className={`p-3 rounded-xl mr-4 transition-colors ${
                  targetType === 'group' ? 'bg-[#FA9411] text-white' : 'bg-white text-gray-400 group-hover:text-black'
                }`}>
                  <Users className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className={`text-sm font-bold ${targetType === 'group' ? 'text-black' : 'text-gray-500'}`}>By Device Group</div>
                  <div className="text-[10px] uppercase font-bold tracking-tight text-gray-400">Target specific units</div>
                </div>
                <input 
                  type="radio" 
                  name="target" 
                  checked={targetType === 'group'} 
                  readOnly
                  className="hidden"
                />
              </label>

              {targetType === 'group' && (
                <div className="ml-0 animate-fade-in">
                  <select
                    value={selectedGroup}
                    onChange={(e) => setSelectedGroup(e.target.value)}
                    className="w-full bg-white border border-gray-100 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:ring-4 focus:ring-orange-500/10 focus:border-[#FA9411] transition-all"
                  >
                    <option value="">Choose a group...</option>
                    {groups?.map((g: any) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <label 
                className={`flex items-center p-4 border rounded-2xl cursor-pointer transition-all group ${
                  targetType === 'enrollment' ? 'border-[#FA9411] bg-orange-50 shadow-sm' : 'border-gray-100 hover:border-gray-200 bg-gray-50/30'
                }`}
                onClick={() => setTargetType('enrollment')}
              >
                <div className={`p-3 rounded-xl mr-4 transition-colors ${
                  targetType === 'enrollment' ? 'bg-[#FA9411] text-white' : 'bg-white text-gray-400 group-hover:text-black'
                }`}>
                  <Shield className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className={`text-sm font-bold ${targetType === 'enrollment' ? 'text-black' : 'text-gray-500'}`}>By Enrollment Profile</div>
                  <div className="text-[10px] uppercase font-bold tracking-tight text-gray-400">Target via token</div>
                </div>
                <input 
                  type="radio" 
                  name="target" 
                  checked={targetType === 'enrollment'} 
                  readOnly
                  className="hidden"
                />
              </label>

              {targetType === 'enrollment' && (
                <div className="ml-0 animate-fade-in">
                  <select
                    value={selectedEnrollment}
                    onChange={(e) => setSelectedEnrollment(e.target.value)}
                    className="w-full bg-white border border-gray-100 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:ring-4 focus:ring-orange-500/10 focus:border-[#FA9411] transition-all"
                  >
                    <option value="">Choose a token...</option>
                    {enrollments?.filter((e: EnrollmentToken) => e.is_active).map((e: EnrollmentToken) => (
                      <option key={e.id} value={e.token}>{e.name || e.token.slice(0, 12)}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Guidelines Card */}
          <div className="bg-gray-900 rounded-[2rem] p-8 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5">
               <Info className="w-24 h-24 text-white" />
            </div>
            <div className="relative z-10">
              <h3 className="text-white text-lg font-bold mb-4 flex items-center gap-2">
                <Info className="w-5 h-5 text-[#FA9411]" />
                Administrative Guidelines
              </h3>
              <ul className="space-y-4">
                {[
                  'Restricts devices to a black administrative screen',
                  'Disables all applications and system navigation',
                  'Prevents local user interaction and modifications',
                  'Only reversible via this administrative console'
                ].map((text, i) => (
                  <li key={i} className="flex gap-3 text-sm text-gray-400 font-medium">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#FA9411] mt-1.5 shrink-0" />
                    {text}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Action Panel */}
        <div className="lg:col-span-8">
          <div className="bg-white border border-gray-100 rounded-[2rem] p-10 shadow-sm overflow-hidden relative">
            <h3 className="text-[11px] font-bold uppercase text-gray-400 tracking-[0.2em] mb-10">Deployment Controls</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Lock Button */}
              <div className="bg-gray-50 border border-gray-100 rounded-[2.5rem] p-8 text-center transition-all hover:shadow-lg">
                <div className="w-20 h-20 bg-red-100 rounded-[2rem] flex items-center justify-center mx-auto mb-6">
                  <Lock className="w-10 h-10 text-red-600" />
                </div>
                <h4 className="text-xl font-bold text-gray-900 mb-2">Enable Lockdown</h4>
                <p className="text-sm text-gray-400 font-medium mb-8">Restrict device access immediately</p>
                
                {confirmAction === 'start' ? (
                  <div className="space-y-3 animate-slide-up">
                    <p className="text-xs text-red-600 font-bold uppercase tracking-widest">
                      Lock {getTargetLabel()}?
                    </p>
                    <div className="flex gap-3">
                      <button
                        onClick={() => setConfirmAction(null)}
                        className="flex-1 px-5 py-4 text-sm font-bold border border-gray-200 rounded-2xl hover:bg-white transition-all shadow-sm"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => kioskMutation.mutate('start')}
                        disabled={kioskMutation.isPending}
                        className="flex-1 px-5 py-4 text-sm font-bold bg-red-600 text-white rounded-2xl hover:bg-black transition-all disabled:opacity-50 flex items-center justify-center shadow-lg shadow-red-500/10"
                      >
                        {kioskMutation.isPending ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          'Execute'
                        )}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmAction('start')}
                    disabled={!canExecute || kioskMutation.isPending}
                    className="w-full px-6 py-5 bg-red-600 text-white rounded-2xl hover:bg-black transition-all disabled:opacity-20 font-bold text-sm shadow-xl shadow-red-500/10 flex items-center justify-center gap-2 group"
                  >
                    Activate Restrictions
                    <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </button>
                )}
              </div>

              {/* Unlock Button */}
              <div className="bg-gray-50 border border-gray-100 rounded-[2.5rem] p-8 text-center transition-all hover:shadow-lg">
                <div className="w-20 h-20 bg-emerald-100 rounded-[2rem] flex items-center justify-center mx-auto mb-6">
                  <Unlock className="w-10 h-10 text-emerald-600" />
                </div>
                <h4 className="text-xl font-bold text-gray-900 mb-2">Restore Access</h4>
                <p className="text-sm text-gray-400 font-medium mb-8">Remove all active device restrictions</p>
                
                {confirmAction === 'stop' ? (
                  <div className="space-y-3 animate-slide-up">
                    <p className="text-xs text-emerald-600 font-bold uppercase tracking-widest">
                      Unlock {getTargetLabel()}?
                    </p>
                    <div className="flex gap-3">
                      <button
                        onClick={() => setConfirmAction(null)}
                        className="flex-1 px-5 py-4 text-sm font-bold border border-gray-200 rounded-2xl hover:bg-white transition-all shadow-sm"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => kioskMutation.mutate('stop')}
                        disabled={kioskMutation.isPending}
                        className="flex-1 px-5 py-4 text-sm font-bold bg-emerald-600 text-white rounded-2xl hover:bg-black transition-all disabled:opacity-50 flex items-center justify-center shadow-lg shadow-emerald-500/10"
                      >
                        {kioskMutation.isPending ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          'Execute'
                        )}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmAction('stop')}
                    disabled={!canExecute || kioskMutation.isPending}
                    className="w-full px-6 py-5 bg-emerald-500 text-white rounded-2xl hover:bg-black transition-all disabled:opacity-20 font-bold text-sm shadow-xl shadow-emerald-500/10 flex items-center justify-center gap-2 group"
                  >
                    Release Lockdown
                    <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </button>
                )}
              </div>
            </div>

            {/* Error */}
            {kioskMutation.isError && (
              <div className="mt-8 p-5 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 animate-shake">
                <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
                <span className="text-sm text-red-800 font-bold uppercase tracking-tight">
                  Command Execution Failed: {(kioskMutation.error as any)?.response?.data?.error?.message || 'Check connection'}
                </span>
              </div>
            )}
          </div>

          {/* Lockdown Visual Reference */}
          <div className="mt-8 bg-white rounded-[2rem] p-10 border border-gray-100 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-[0.03]">
               <Zap className="w-24 h-24 text-black" />
            </div>
            <h3 className="text-[11px] font-bold uppercase text-gray-400 tracking-[0.2em] mb-6">Device Display Preview</h3>
            
            <div className="flex flex-col md:flex-row items-center gap-10">
              {/* Mock Device */}
              <div className="relative w-48 h-80 bg-black rounded-[2.5rem] border-[6px] border-gray-900 shadow-2xl shrink-0 overflow-hidden ring-4 ring-gray-100">
                 <div className="absolute top-0 left-1/2 -translate-x-1/2 w-16 h-4 bg-gray-900 rounded-b-xl px-1" />
                 <div className="flex flex-col items-center justify-center h-full space-y-3 opacity-80">
                    <Lock className="w-10 h-10 text-gray-700" />
                    <div className="h-1 w-12 bg-gray-800 rounded-full" />
                 </div>
              </div>

              <div className="space-y-4">
                <div className="p-5 bg-gray-50 rounded-2xl border border-gray-100">
                   <p className="text-sm font-bold text-gray-900 mb-1 flex items-center gap-2">
                     <Check className="w-4 h-4 text-emerald-500" />
                     Blackout Screen
                   </p>
                   <p className="text-xs text-gray-500 font-medium">The hardware display will be forced to a persistent black state.</p>
                </div>
                <div className="p-5 bg-gray-50 rounded-2xl border border-gray-100">
                   <p className="text-sm font-bold text-gray-900 mb-1 flex items-center gap-2">
                     <Check className="w-4 h-4 text-emerald-500" />
                     Input Restriction
                   </p>
                   <p className="text-xs text-gray-500 font-medium">Touch screen and hardware buttons are administratively disabled.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
