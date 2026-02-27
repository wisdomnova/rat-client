import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { 
  Plus, 
  MoreVertical, 
  Tablet, 
  X, 
  Loader2, 
  Users, 
  ShieldCheck, 
  ArrowRight,
  FolderOpen
} from 'lucide-react'
import axios from 'axios'

export default function Groups() {
  const queryClient = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [newGroup, setNewGroup] = useState({
    name: '',
    description: ''
  })

  const { data: groups = [], isLoading } = useQuery({
    queryKey: ['groups'],
    queryFn: async () => {
      const response = await axios.get('/api/v1/groups')
      return response.data.data?.groups || response.data.data || []
    }
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      const response = await axios.post('/api/v1/groups', {
        name: newGroup.name,
        description: newGroup.description
      })
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      setShowModal(false)
      setNewGroup({ name: '', description: '' })
    }
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-[#FA9411] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="animate-fade-in space-y-8">
      {/* Enhanced Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Device Groups</h1>
          <p className="text-gray-500 font-medium mt-1">Manage and organize your fleet for policy deployment</p>
        </div>
        <button 
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-6 py-3 bg-[#FA9411] text-white rounded-2xl hover:bg-[#e88910] transition-all shadow-lg shadow-orange-500/20 font-bold"
        >
          <Plus className="w-5 h-5" />
          Create New Group
        </button>
      </div>

      {/* Modern Grid Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {groups.map((group: any) => (
          <div key={group.id} className="bg-white border border-gray-100 rounded-[2rem] p-8 shadow-sm hover:shadow-xl hover:scale-[1.01] transition-all group relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gray-50 rounded-bl-[4rem] -mr-16 -mt-16 transition-all group-hover:bg-[#FA9411]/5" />
            
            <div className="flex items-start justify-between mb-8 relative z-10">
              <div className="p-4 bg-gray-900 rounded-3xl group-hover:bg-[#FA9411] transition-colors shadow-lg">
                <Users className="w-6 h-6 text-white" />
              </div>
              <button className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
                <MoreVertical className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            
            <div className="relative z-10">
              <h3 className="text-xl font-bold text-gray-900 group-hover:text-[#FA9411] transition-colors">
                {group.name}
              </h3>
              <p className="text-sm text-gray-400 font-medium mt-2 line-clamp-2 min-h-[40px]">
                {group.description || 'No administrative description provided for this group.'}
              </p>
            </div>
            
            <div className="mt-8 flex items-center justify-between pt-6 border-t border-gray-100 relative z-10">
              <div className="flex items-center gap-2 text-sm font-bold text-gray-600">
                <Tablet className="w-4 h-4 text-[#FA9411]" />
                {group.device_count || 0} Devices
              </div>
              <button className="flex items-center gap-1 text-sm font-bold text-[#FA9411] hover:gap-2 transition-all">
                Manage Policy <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
        
        {/* Fancy Add Card */}
        <button 
          onClick={() => setShowModal(true)}
          className="bg-gray-50/50 border-2 border-dashed border-gray-200 rounded-[2rem] p-8 flex flex-col items-center justify-center text-gray-400 hover:bg-white hover:border-[#FA9411] hover:text-[#FA9411] transition-all group min-h-[280px]"
        >
          <div className="p-5 rounded-full bg-white border border-gray-100 mb-4 group-hover:scale-110 transition-transform shadow-sm group-hover:shadow-lg group-hover:border-[#FA9411]/20">
            <Plus className="w-8 h-8" />
          </div>
          <span className="font-bold text-lg">Add Device Group</span>
          <p className="text-xs font-medium mt-1 opacity-60 italic">Define a new operational scope</p>
        </button>
      </div>

      {/* Overhauled Modal UI */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-lg p-10 animate-slide-up shadow-2xl relative overflow-hidden">
             {/* Background Decoration */}
            <div className="absolute top-0 right-0 p-8 opacity-5">
               <FolderOpen className="w-32 h-32" />
            </div>

            <div className="flex items-center justify-between mb-8 relative z-10">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-[#FA9411]/10 rounded-2xl">
                   <ShieldCheck className="w-6 h-6 text-[#FA9411]" />
                </div>
                <h2 className="text-2xl font-bold tracking-tight">Create Group</h2>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-3 hover:bg-gray-100 rounded-2xl transition-colors text-gray-400 hover:text-black"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-6 relative z-10">
              <div>
                <label className="block text-[11px] font-bold uppercase text-gray-400 tracking-widest mb-2">
                  Group Label
                </label>
                <input
                  type="text"
                  value={newGroup.name}
                  onChange={(e) => setNewGroup(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Regional Service Tablets"
                  className="w-full px-5 py-4 bg-gray-50 border border-transparent rounded-[1.25rem] focus:outline-none focus:bg-white focus:border-[#FA9411] focus:ring-4 focus:ring-orange-500/10 transition-all font-medium"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-gray-400 tracking-widest mb-2">
                  Administrative Description
                </label>
                <textarea
                  value={newGroup.description}
                  onChange={(e) => setNewGroup(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Briefly explain the purpose of this group..."
                  rows={4}
                  className="w-full px-5 py-4 bg-gray-50 border border-transparent rounded-[1.25rem] focus:outline-none focus:bg-white focus:border-[#FA9411] focus:ring-4 focus:ring-orange-500/10 transition-all font-medium resize-none"
                />
              </div>

              <div className="flex items-start gap-3 p-5 bg-orange-50 border border-orange-100 rounded-[1.5rem]">
                <Plus className="w-5 h-5 text-[#FA9411] mt-0.5 shrink-0" />
                <p className="text-xs text-orange-800 font-medium leading-relaxed">
                  <strong>Notice:</strong> Once created, you can assign devices to this group and link a security policy via the Policy Management system.
                </p>
              </div>
            </div>

            <div className="flex gap-4 mt-10 relative z-10">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-4 border border-gray-100 rounded-2xl font-bold hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending || !newGroup.name}
                className="flex-1 px-4 py-4 bg-gray-900 text-white rounded-2xl hover:bg-black transition-all disabled:opacity-50 flex items-center justify-center font-bold shadow-lg"
              >
                {createMutation.isPending ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : (
                  'Establish Group'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
